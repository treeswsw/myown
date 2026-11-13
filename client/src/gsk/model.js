// 갱스껄 화면 계산 — DOM 없는 순수 함수. 서버 상태(GDD 9-2) → 화면에 그릴 정보.
// 임시 화면(index.js)도, 나중에 만들 진짜 화면도 이 파일의 toView 를 그대로 쓴다.
//
// toView(state, meId) → {
//   phase, step, round, total,
//   seats: [{ id, name, color, points, discs, hand, stack, shown, isMe, isTurn, isChallenger,
//             placed, passed, out, connected, status }],   // 내 자리가 맨 앞(참가자일 때), 나머지는 시계 방향
//   me: { seated, hand:{F,S}, stack:[], lost:[] } | null,
//   center: '상황 한 줄',
//   hostId, isHost, penalty({by,target,n,faceUp}) | null, outcome({ok,skullOf}) | null,
//   bid: { n, by, byName } | null, progress: { flipped, need } | null (flip·reveal·penalty 동안),
//   actions: [{ key, a, ...값 }],     // 지금 내가 할 수 있는 행동 전부. key 는 data-gk 값
//   ranges: { bid:{min,max}|null, flipPiles:[id], colorsFree:[0..5], canStart:bool },
//   result: state.result 그대로(이름 포함) | null,
// }
// 남의 원판 종류는 서버가 주지 않으므로 여기서도 쓰지 않는다(shown 만 공개된 것).
// 행동 key: place-F place-S bid-<n> pass flip-<id> discard-F discard-S color-<c> start

const MIN_PLAYERS = 3;

const nameOf = (state, id) => {
  if (!id) return '';
  const s = (state.seats || []).find((x) => x.id === id);
  if (s) return s.name;
  const p = (state.players || []).find((x) => x.id === id);
  return p ? p.name : '';
};

function statusOf(state, s) {
  if (s.out === 'lost') return '탈락';
  if (s.out === 'away') return '끊김 탈락';
  if (s.out === 'leave') return '나감';
  const p = (state.players || []).find((x) => x.id === s.id);
  if (p && !p.connected) return '연결 끊김';
  if (state.phase === 'playing') {
    if (state.step === 'setup') return s.placed ? '놓음' : '놓는 중';
    if (state.step === 'turn' && state.turn === s.id) return '차례';
    if (state.step === 'bid') {
      if (state.turn === s.id) return '차례';
      if (s.passed) return '패스';
    }
    if (state.challenger === s.id && ['flip', 'reveal', 'penalty'].includes(state.step)) return '도전';
    if (state.step === 'penalty' && state.penalty && state.penalty.by === s.id) return '고르는 중';
  }
  return '';
}

function centerText(state, meId) {
  const n = (id) => `${nameOf(state, id)} 님`;
  const waitNote = state.waiting ? ` (${n(state.waiting)} 연결 끊김, 기다리는 중)` : '';
  if (state.phase === 'lobby') {
    const c = (state.seats || []).length;
    return `참가자를 기다리는 중 (${c}명, ${MIN_PLAYERS}명 이상 필요)`;
  }
  if (state.phase === 'result') {
    const r = state.result;
    if (r && r.winner) return `${n(r.winner)} 승리!`;
    return '판 끝';
  }
  const seats = (state.seats || []).filter((x) => !x.out);
  switch (state.step) {
    case 'setup': {
      const done = seats.filter((x) => x.placed).length;
      return `모두 원판을 1장씩 놓는 중 (${done}/${seats.length})`;
    }
    case 'turn':
      return `${n(state.turn)} 차례${waitNote}`;
    case 'bid':
      return `${n(state.bid && state.bid.by)} 도전 ${state.bid ? state.bid.n : ''} (${n(state.turn)} 차례)${waitNote}`;
    case 'flip':
      return `${n(state.challenger)}이 뒤집는 중 ${state.flipped || 0} / ${state.need || 0}${waitNote}`;
    case 'reveal': {
      const o = state.outcome;
      if (o && o.ok) return `성공! ${n(state.challenger)}`;
      return `해골! ${n(state.challenger)} 실패`;
    }
    case 'penalty': {
      const p = state.penalty;
      if (!p) return '벌칙';
      if (p.by === meId) return '버릴 원판을 고르세요';
      return `${n(p.by)}이 버릴 원판을 고르는 중${waitNote}`;
    }
    case 'between':
      return '다음 라운드 준비 중';
    default:
      return '';
  }
}

export function toView(state, meId) {
  if (!state) return null;
  const me = meId ?? state.you ?? null;
  const rawSeats = state.seats || [];
  const mySeat = rawSeats.find((s) => s.id === me) || null;
  const mine = state.mine || null;
  const iAmAlive = !!mySeat && !mySeat.out;

  let ordered = rawSeats;
  if (mySeat && state.phase !== 'lobby') {
    const i = rawSeats.indexOf(mySeat);
    ordered = rawSeats.slice(i).concat(rawSeats.slice(0, i));
  }
  const seats = ordered.map((s) => ({
    id: s.id, name: s.name, color: s.color, points: s.points || 0,
    discs: s.discs || 0, hand: s.hand || 0, stack: s.stack || 0,
    shown: Array.isArray(s.shown) ? s.shown.slice() : [],
    isMe: s.id === me,
    isTurn: state.phase === 'playing' && state.turn === s.id,
    isChallenger: state.challenger === s.id,
    placed: !!s.placed, passed: !!s.passed, out: s.out || null,
    connected: ((state.players || []).find((x) => x.id === s.id) || { connected: true }).connected !== false,
    status: statusOf(state, s),
  }));

  const actions = [];
  const ranges = { bid: null, flipPiles: [], colorsFree: [], canStart: false };
  const hand = mine && mine.hand ? mine.hand : { F: 0, S: 0 };
  const placeActs = () => {
    for (const k of ['F', 'S']) if ((hand[k] || 0) > 0) actions.push({ key: `place-${k}`, a: 'place', k });
  };
  const bidActs = (min, max) => {
    if (max < min) return;
    ranges.bid = { min, max };
    for (let v = min; v <= max; v++) actions.push({ key: `bid-${v}`, a: 'bid', n: v });
  };
  const total = state.total || 0;

  if (state.phase === 'lobby' && mySeat) {
    const taken = new Set(rawSeats.filter((s) => s.id !== me && s.color != null).map((s) => s.color));
    for (let c = 0; c < 6; c++) {
      if (taken.has(c)) continue;
      ranges.colorsFree.push(c);
      actions.push({ key: `color-${c}`, a: 'color', c });
    }
  }
  if (state.phase === 'lobby' || state.phase === 'result') {
    const conn = (state.players || []).filter((p) => p.connected && (state.phase === 'result' || !p.spectating)).length;
    ranges.canStart = state.hostId === me && conn >= MIN_PLAYERS;
    if (ranges.canStart) actions.push({ key: 'start', a: 'start' });
  }
  if (state.phase === 'playing' && iAmAlive) {
    const step = state.step;
    if (step === 'setup' && !mySeat.placed) placeActs();
    else if (step === 'turn' && state.turn === me) {
      placeActs();
      bidActs(1, total);
    } else if (step === 'bid' && state.turn === me) {
      bidActs(((state.bid && state.bid.n) || 0) + 1, total);
      actions.push({ key: 'pass', a: 'pass' });
    } else if (step === 'flip' && state.challenger === me && (mySeat.shown || []).length >= (mySeat.stack || 0)) {
      for (const s of rawSeats) {
        if (s.id !== me && !s.out && (s.stack || 0) > (s.shown || []).length) {
          ranges.flipPiles.push(s.id);
          actions.push({ key: `flip-${s.id}`, a: 'flip', p: s.id });
        }
      }
    } else if (step === 'penalty' && state.penalty && state.penalty.by === me) {
      // GDD 17절: 벌칙은 항상 도전자 본인이 앞면(손 + 판 위 전부)을 보고 종류로 고른다
      const cnt = { F: hand.F || 0, S: hand.S || 0 };
      for (const k of (mine && mine.stack) || []) cnt[k] = (cnt[k] || 0) + 1;
      for (const k of ['F', 'S']) if (cnt[k] > 0) actions.push({ key: `discard-${k}`, a: 'discard', k });
    }
  }

  return {
    phase: state.phase, step: state.step || null, hostId: state.hostId || null, isHost: !!me && state.hostId === me, round: state.round || 0, total,
    seats,
    me: mySeat ? { seated: true, hand: { F: hand.F || 0, S: hand.S || 0 }, stack: (mine && mine.stack) || [], lost: (mine && mine.lost) || [] } : null,
    center: centerText(state, me),
    bid: state.bid ? { n: state.bid.n, by: state.bid.by, byName: nameOf(state, state.bid.by) } : null,
    penalty: state.penalty || null,
    outcome: state.outcome || null,
    progress: ['flip', 'reveal', 'penalty'].includes(state.step) ? { flipped: state.flipped || 0, need: state.need || 0 } : null,
    actions, ranges,
    result: state.result || null,
  };
}
