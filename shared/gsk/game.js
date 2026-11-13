// 갱스껄 규칙 엔진 (GDD 2·3·4·5·8·9절). 시계·난수·네트워크를 모르는 순수 함수 모음.
//  - 지금 시각 `now`(ms)와 난수 함수 `rnd(n)`(0..n-1 정수, 서버가 crypto 로 줌)를 인자로 받는다. 난수 내장 함수·Date.now 를 쓰지 않는다.
//  - state 는 일반 객체다. 화면으로 내보낼 때는 반드시 viewFor 로만 (비밀 유지의 유일한 문).
//  - 변경 함수의 반환값 fx = { ok, events, finished, code?, error? }
//      events: [{ to: 'all' | id, e }]   e = GDD 9-3 의 event.e
//      ok:false 이면 상태는 바뀌지 않고 code(9-4)·error(문구)가 있다.
//      finished: null | { players:[id...], winner: id|null, reason, ranks }  판이 끝난 그 호출에서만. room 이 stats.gsk 를 올린다.
//    ok:true 이면 호출자는 (접속 중인) 모두에게 viewFor 를 다시 보낸다.
import {
  MIN_PLAYERS, MAX_PLAYERS, COLORS, DISCS, WIN_POINTS, REVEAL_MS, BETWEEN_MS, AUTO_FLIP_MS, GRACE_MS, ERRORS,
} from './constants.js';
import { parseGk } from './protocol.js';

// ---------- 작은 도구 ----------

const newFx = () => ({ ok: true, events: [], finished: null });
const fail = (code) => ({ ok: false, code, error: ERRORS[code], events: [], finished: null });
const emit = (fx, e, to = 'all') => fx.events.push({ to, e });

function rand(rnd, n) {
  const v = rnd(n);
  if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError('rnd 가 범위 밖의 값을 돌려줌');
  return v;
}
function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(rnd, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const seatOf = (s, id) => s.seats.find((x) => x.id === id) ?? null;
const memberOf = (s, id) => s.members.find((m) => m.id === id) ?? null;
const alive = (s) => s.seats.filter((x) => !x.out);
const isUp = (s, id) => !!memberOf(s, id)?.connected;
const tableTotal = (s) => alive(s).reduce((n, x) => n + x.stack.length, 0);
const discCount = (x) => x.discs.F + x.discs.S;

// id 다음(시계 방향 = 자리 순서) 살아 있고 조건에 맞는 사람. 없으면 null. 자기 자신은 마지막에 검사.
function nextAlive(s, id, pred = () => true) {
  const n = s.seats.length;
  const at = s.seats.findIndex((x) => x.id === id);
  for (let k = 1; k <= n; k++) {
    const x = s.seats[(at + k + n) % n];
    if (!x.out && pred(x)) return x;
  }
  return null;
}

// ---------- 방 만들기·사람 ----------

export function createGame({ code = '', hostId = null, graceMs = GRACE_MS } = {}) {
  return {
    code, hostId, graceMs, now: 0,
    gameNo: 0, phase: 'lobby',
    members: [], seats: [],
    round: 0, step: null, starter: null, turnId: null,
    bid: null, challenger: null, need: 0, flipped: 0, outcome: null, pen: null,
    endsAt: null, flipAt: null,
    outSeq: 0, result: null, finished: null,
  };
}

/** 방에 들어온다. 이미 있으면 이름만 갱신. 판 도중·결과 화면에 들어오면 다음 판부터 참가(관전). */
export function addPlayer(s, { id, name }) {
  const m = memberOf(s, id);
  if (m) { m.name = name; return newFx(); }
  if (s.members.length >= MAX_PLAYERS * 2) return fail('gk_now');
  s.members.push({ id, name, connected: true, awayAt: null, spec: s.phase !== 'lobby', color: null });
  if (!s.hostId) s.hostId = id;
  return newFx();
}

/** 대기 방·관전자·결과 화면의 사람을 내보낸다. 판 도중 참가자는 leave 를 쓴다. */
export function removePlayer(s, id) {
  const seat = seatOf(s, id);
  if (s.phase === 'playing' && seat && !seat.out) return fail('gk_now');
  dropMember(s, id);
  return newFx();
}

function dropMember(s, id) {
  const i = s.members.findIndex((m) => m.id === id);
  if (i < 0) return;
  s.members.splice(i, 1);
  if (s.hostId === id) {
    const nx = s.members.find((m) => m.connected) ?? s.members[0];
    s.hostId = nx ? nx.id : null;
  }
}

/** 접속·끊김. 끊긴 시각을 기록한다(판 중 살아 있는 사람은 graceMs 뒤 기권, tick 이 처리). */
export function setConnected(s, id, connected, now) {
  const m = memberOf(s, id);
  if (!m) return fail('gk_now');
  s.now = now;
  if (connected) { m.connected = true; m.awayAt = null; } else if (m.connected) { m.connected = false; m.awayAt = now; }
  return newFx();
}

export function pickColor(s, id, c) {
  if (s.phase !== 'lobby') return fail('gk_now');
  const m = memberOf(s, id);
  if (!m || m.spec) return fail('gk_now');
  if (!Number.isInteger(c) || c < 0 || c >= COLORS.length) return fail('gk_bad');
  if (s.members.some((o) => o.id !== id && !o.spec && o.color === c)) return fail('gk_color');
  m.color = c;
  const fx = newFx();
  emit(fx, { k: 'gkColor', id, c });
  return fx;
}

// ---------- 판 시작 ----------

export function start(s, hostId, now, rnd) {
  if (hostId !== s.hostId) return fail('gk_host');
  if (s.phase === 'playing') return fail('gk_now');
  s.now = now;
  const cands = s.members.filter((m) => m.connected).slice(0, MAX_PLAYERS);
  if (cands.length < MIN_PLAYERS) return fail('gk_few');
  for (const m of s.members) m.spec = !cands.includes(m);
  // 색: 고른 것은 지키고, 안 고른 사람은 남은 색을 들어온 순서대로
  const used = new Set();
  for (const m of cands) {
    if (m.color != null && !used.has(m.color)) used.add(m.color); else m.color = null;
  }
  for (const m of cands) {
    if (m.color != null) continue;
    for (let c = 0; c < COLORS.length; c++) if (!used.has(c)) { m.color = c; used.add(c); break; }
  }
  const order = shuffle(cands, rnd);
  s.gameNo++;
  s.phase = 'playing';
  s.outSeq = 0;
  s.result = null;
  s.finished = null;
  s.round = 0;
  s.seats = order.map((m) => ({
    id: m.id, name: m.name, color: m.color, points: 0,
    discs: { ...DISCS }, hand: { ...DISCS }, stack: [], flippedN: 0,
    placed: false, passed: false, out: null, outSeq: 0, lost: [],
  }));
  s.starter = order[rand(rnd, order.length)].id;
  const fx = newFx();
  emit(fx, { k: 'gkStart', gameNo: s.gameNo, order: order.map((m) => m.id) });
  startRound(s, fx);
  return fx;
}

function clearRoundState(s) {
  s.bid = null; s.challenger = null; s.need = 0; s.flipped = 0; s.outcome = null; s.pen = null;
  s.endsAt = null; s.flipAt = null; s.turnId = null;
}

function resetDiscs(s) {
  for (const x of s.seats) {
    x.hand = { ...x.discs }; x.stack = []; x.flippedN = 0; x.placed = false; x.passed = false;
  }
}

// 새 라운드(setup). 시작 사람이 빠졌으면 다음 살아 있는 사람.
function startRound(s, fx) {
  let st = seatOf(s, s.starter);
  if (!st || st.out) st = nextAlive(s, s.starter ?? s.seats[0].id);
  s.starter = st.id;
  resetDiscs(s);
  clearRoundState(s);
  s.round++;
  s.step = 'setup';
  emit(fx, { k: 'gkRound', round: s.round, starter: s.starter });
}

// ---------- 끝내기 ----------

function endGame(s, fx, reason, winnerId) {
  const alives = alive(s).sort((a, b) => b.points - a.points || discCount(b) - discCount(a));
  const outs = s.seats.filter((x) => x.out).sort((a, b) => b.outSeq - a.outSeq);
  const ranks = [];
  [...alives, ...outs].forEach((x, i) => {
    const prev = ranks[i - 1];
    const tie = !x.out && prev && !seatOf(s, prev.id).out && prev.points === x.points && prev.discs === discCount(x);
    ranks.push({ id: x.id, name: x.name, points: x.points, discs: discCount(x), rank: tie ? prev.rank : i + 1 });
  });
  s.phase = 'result';
  s.step = null;
  clearRoundState(s);
  s.result = { reason, winner: winnerId, ranks };
  s.finished = { players: s.seats.map((x) => x.id), winner: winnerId };
  fx.finished = { ...s.finished, reason, ranks: ranks.map((r) => ({ ...r })) };
  emit(fx, { k: 'gkEnd', reason, winner: winnerId, ranks: ranks.map((r) => ({ ...r })) });
}

function enterBetween(s, fx, at, starterId) {
  const next = seatOf(s, starterId);
  s.starter = next && !next.out ? next.id : nextAlive(s, starterId).id;
  const outcome = s.outcome;
  resetDiscs(s);
  clearRoundState(s);
  s.outcome = outcome;
  s.step = 'between';
  s.endsAt = at + BETWEEN_MS;
}

// ---------- 행동 ----------

export function act(s, id, msg, now, rnd) {
  const p = parseGk(msg);
  if (!p.ok) return fail('gk_bad');
  s.now = now;
  const m = p.msg;
  if (m.a === 'color') return pickColor(s, id, m.c);
  if (s.phase !== 'playing') return fail('gk_now');
  const seat = seatOf(s, id);
  if (!seat || seat.out) return fail('gk_now');
  switch (m.a) {
    case 'place': return doPlace(s, seat, m.k);
    case 'bid': return doBid(s, seat, m.n, now);
    case 'pass': return doPass(s, seat, now);
    case 'flip': return doFlipMsg(s, seat, m.p, now, rnd);
    case 'discard': return doDiscard(s, seat, m, now, rnd);
    default: return fail('gk_bad');
  }
}

function doPlace(s, seat, k) {
  if (s.step === 'setup') { if (seat.placed) return fail('gk_now'); } else if (s.step === 'turn') {
    if (s.turnId !== seat.id) return fail('gk_turn');
  } else return fail('gk_now');
  if (seat.hand[k] < 1) return fail('gk_hand');
  const fx = newFx();
  seat.hand[k]--;
  seat.stack.push(k);
  emit(fx, { k: 'gkPlace', id: seat.id, stack: seat.stack.length });
  if (s.step === 'setup') {
    seat.placed = true;
    if (alive(s).every((x) => x.placed)) {
      s.step = 'turn';
      s.turnId = s.starter;
      emit(fx, { k: 'gkTurn', id: s.turnId });
    }
  } else {
    s.turnId = nextAlive(s, seat.id).id;
    emit(fx, { k: 'gkTurn', id: s.turnId });
  }
  return fx;
}

function doBid(s, seat, n, now) {
  if (s.step !== 'turn' && s.step !== 'bid') return fail('gk_now');
  if (s.turnId !== seat.id) return fail('gk_turn');
  const total = tableTotal(s);
  const floor = s.step === 'bid' ? s.bid.n : 0;
  if (n <= floor || n > total) return fail('gk_bid');
  const fx = newFx();
  if (s.step === 'turn') for (const x of s.seats) x.passed = false;
  s.bid = { n, by: seat.id };
  emit(fx, { k: 'gkBid', id: seat.id, n });
  if (n === total) { startFlip(s, fx, seat.id, now); return fx; }
  s.step = 'bid';
  s.turnId = nextAlive(s, seat.id, (x) => !x.passed).id;
  emit(fx, { k: 'gkTurn', id: s.turnId });
  return fx;
}

function doPass(s, seat, now) {
  if (s.step !== 'bid') return fail('gk_now');
  if (s.turnId !== seat.id) return fail('gk_turn');
  const fx = newFx();
  seat.passed = true;
  emit(fx, { k: 'gkPass', id: seat.id });
  const left = alive(s).filter((x) => !x.passed);
  if (left.length <= 1) { startFlip(s, fx, s.bid.by, now); return fx; }
  s.turnId = nextAlive(s, seat.id, (x) => !x.passed).id;
  emit(fx, { k: 'gkTurn', id: s.turnId });
  return fx;
}

function startFlip(s, fx, challengerId, at) {
  s.step = 'flip';
  s.challenger = challengerId;
  s.need = s.bid.n;
  s.flipped = 0;
  s.turnId = challengerId;
  for (const x of s.seats) x.flippedN = 0;
  s.flipAt = at + AUTO_FLIP_MS;
}

function doFlipMsg(s, seat, pid, now, rnd) {
  if (s.step !== 'flip') return fail('gk_now');
  if (s.challenger !== seat.id) return fail('gk_turn');
  if (s.flipAt != null) return fail('gk_now');
  const owner = seatOf(s, pid);
  if (!owner || owner.out || owner.id === seat.id || owner.flippedN >= owner.stack.length) return fail('gk_bad');
  const fx = newFx();
  doFlip(s, fx, seat, owner, now, rnd);
  return fx;
}

// 한 장 공개. GDD 9-3 은 gkFlip·gkLoseMine 의 원판 종류 필드 이름을 k 로 적었지만 e.k 가 이벤트 종류라 겹친다 → 필드 이름을 disc 로 보낸다.
function doFlip(s, fx, by, owner, at, rnd) {
  const kind = owner.stack[owner.stack.length - 1 - owner.flippedN];
  owner.flippedN++;
  if (kind === 'F') s.flipped++;
  // 애태우기(GDD 9-3·15절): 해골은 늘 1, 꽃은 약 1/3. 값은 서버가 정해 모두에게 같게 보낸다.
  const tease = kind === 'S' || rand(rnd, 3) === 0 ? 1 : 0;
  emit(fx, { k: 'gkFlip', id: by.id, p: owner.id, disc: kind, flipped: s.flipped, tease });
  if (kind === 'S') { enterReveal(s, fx, false, owner.id, at); return; }
  if (owner === by) {
    // 내 더미는 숫자와 상관없이 끝까지 공개한다. 끝났을 때 꽃 수가 모자라면 남의 더미로.
    if (owner.flippedN < owner.stack.length) { s.flipAt = at + AUTO_FLIP_MS; return; }
    s.flipAt = null;
  }
  if (s.flipped >= s.need) enterReveal(s, fx, true, null, at);
}

function enterReveal(s, fx, ok, skullOf, at) {
  s.step = 'reveal';
  s.outcome = { ok, skullOf };
  s.endsAt = at + REVEAL_MS;
  s.flipAt = null;
  s.turnId = null;
  emit(fx, { k: 'gkReveal', ok, challenger: s.challenger, skullOf });
}

// ---------- 벌칙 ----------

function enterPenalty(s, fx, rnd, at) {
  const ch = seatOf(s, s.challenger);
  const kinds = [];
  for (const k of ['F', 'S']) for (let i = 0; i < ch.discs[k]; i++) kinds.push(k);
  const skull = s.outcome.skullOf;
  const owner = skull && skull !== ch.id ? seatOf(s, skull) : null;
  s.pen = { by: owner ? owner.id : ch.id, target: ch.id, perm: shuffle(kinds, rnd) };
  s.step = 'penalty';
  s.endsAt = null;
  s.turnId = null;
  // 해골 주인이 판정 중에 나갔으면 난수로 고른다
  if (owner && owner.out) applyPenalty(s, fx, s.pen.perm[rand(rnd, s.pen.perm.length)], at);
}

function doDiscard(s, seat, m, now, rnd) {
  if (s.step !== 'penalty') return fail('gk_now');
  if (s.pen.by !== seat.id) return fail('gk_turn');
  const faceUp = s.pen.by === s.pen.target;
  const target = seatOf(s, s.pen.target);
  let kind;
  if (faceUp) {
    if (m.k === undefined) return fail('gk_bad');
    if (target.discs[m.k] < 1) return fail('gk_hand');
    kind = m.k;
  } else {
    if (m.i === undefined || m.i >= s.pen.perm.length) return fail('gk_bad');
    kind = s.pen.perm[m.i];
  }
  const fx = newFx();
  applyPenalty(s, fx, kind, now);
  return fx;
}

function applyPenalty(s, fx, kind, at) {
  const target = seatOf(s, s.pen.target);
  target.discs[kind]--;
  target.lost.push(kind);
  emit(fx, { k: 'gkLose', id: target.id, discs: discCount(target) });
  emit(fx, { k: 'gkLoseMine', disc: kind }, target.id);
  const skull = s.outcome.skullOf;
  let starter = target.id;
  if (discCount(target) === 0) {
    target.out = 'lost';
    target.outSeq = ++s.outSeq;
    emit(fx, { k: 'gkOut', id: target.id, reason: 'lost' });
    if (alive(s).length <= 1) { endGame(s, fx, 'alone', alive(s)[0]?.id ?? null); return; }
    starter = skull && skull !== target.id ? skull : target.id;
  }
  enterBetween(s, fx, at, starter);
}

// ---------- 기권(끊김 60초·나가기) ----------

function dropMany(s, ids, reason, fx, at, rnd) {
  if (s.phase !== 'playing') return;
  const hit = [...new Set(ids)].map((id) => seatOf(s, id)).filter((x) => x && !x.out);
  if (!hit.length) return;
  for (const x of hit) {
    x.out = reason;
    x.outSeq = ++s.outSeq;
    emit(fx, { k: 'gkOut', id: x.id, reason });
  }
  if (alive(s).length <= 1) { endGame(s, fx, 'alone', alive(s)[0]?.id ?? null); return; }
  if (s.step === 'between') return; // 다음 라운드 시작 때 시작 사람을 다시 정한다
  const gone = new Set(hit.map((x) => x.id));
  // 판정이 난 뒤 제3자 이탈: 도전자가 남아 있으면 결과를 그대로 이어 간다(tick 이 점수·벌칙 진행)
  if ((s.step === 'reveal' || s.step === 'penalty') && !gone.has(s.challenger)) {
    if (s.step === 'penalty' && gone.has(s.pen.by)) {
      applyPenalty(s, fx, s.pen.perm[rand(rnd, s.pen.perm.length)], at);
    }
    return;
  }
  if (s.step === 'penalty' && !gone.has(s.pen.target) && gone.has(s.pen.by)) {
    // 고르는 사람이 사라지면 난수로 고른 뒤 그대로 진행
    applyPenalty(s, fx, s.pen.perm[rand(rnd, s.pen.perm.length)], at);
    return;
  }
  // 라운드 무효: 원판은 모두 손으로, 같은 시작 사람으로 새 라운드
  for (const x of hit) emit(fx, { k: 'gkVoid', reason, id: x.id });
  startRound(s, fx);
}

/** 나가기. 판 도중 참가자는 기권(탈락) 처리 뒤 방에서 뺀다. */
export function leave(s, id, now, rnd) {
  s.now = now;
  const fx = newFx();
  const seat = seatOf(s, id);
  if (s.phase === 'playing' && seat && !seat.out) dropMany(s, [id], 'leave', fx, now, rnd);
  dropMember(s, id);
  return fx;
}

// ---------- 시간 ----------

function awayDue(s) {
  if (s.phase !== 'playing') return [];
  return alive(s).map((x) => ({ x, m: memberOf(s, x.id) })).filter(({ m }) => !m || (!m.connected && m.awayAt != null))
    .map(({ x, m }) => ({ id: x.id, at: m ? m.awayAt + s.graceMs : -Infinity }));
}

export function nextDeadline(s) {
  if (s.phase !== 'playing') return null;
  let d = null;
  const take = (t) => { if (t != null && (d == null || t < d)) d = t; };
  take(s.flipAt);
  if (s.step === 'reveal' || s.step === 'between') take(s.endsAt);
  for (const a of awayDue(s)) take(a.at);
  return d;
}

export function tick(s, now, rnd) {
  s.now = now;
  const fx = newFx();
  for (let guard = 0; guard < 500; guard++) {
    const d = nextDeadline(s);
    if (d == null || d > now) break;
    const at = Number.isFinite(d) ? d : now;
    const gone = awayDue(s).filter((a) => a.at <= d).map((a) => a.id);
    if (gone.length) { dropMany(s, gone, 'away', fx, at, rnd); continue; }
    if (s.flipAt != null && s.flipAt <= d) {
      const ch = seatOf(s, s.challenger);
      doFlip(s, fx, ch, ch, s.flipAt, rnd);
      continue;
    }
    if (s.step === 'reveal' && s.endsAt <= d) {
      const ch = seatOf(s, s.challenger);
      if (s.outcome.ok) {
        ch.points++;
        if (ch.points >= WIN_POINTS) { endGame(s, fx, 'points', ch.id); continue; }
        enterBetween(s, fx, s.endsAt, ch.id);
      } else enterPenalty(s, fx, rnd, s.endsAt);
      continue;
    }
    if (s.step === 'between' && s.endsAt <= d) { startRound(s, fx); continue; }
    break;
  }
  return fx;
}

// ---------- 화면으로 내보내기 (GDD 9-2) ----------

export function viewFor(s, id) {
  const playing = s.phase === 'playing';
  const lobby = s.phase === 'lobby';
  const actorId = !playing ? null : s.step === 'setup' ? null : s.step === 'penalty' ? s.pen.by
    : (s.step === 'turn' || s.step === 'bid' || (s.step === 'flip' && s.flipAt == null)) ? s.turnId : null;
  let waiting = null;
  if (playing && s.step === 'setup') {
    const w = alive(s).find((x) => !x.placed && !isUp(s, x.id));
    waiting = w ? w.id : null;
  } else if (actorId && !isUp(s, actorId)) waiting = actorId;

  const seatView = (x) => ({
    id: x.id, name: x.name, color: x.color,
    points: x.points, discs: x.out ? 0 : discCount(x), hand: x.out ? 0 : x.hand.F + x.hand.S, stack: x.out ? 0 : x.stack.length,
    shown: x.out ? [] : x.stack.slice(x.stack.length - x.flippedN).reverse(),
    placed: x.placed, passed: x.passed, out: x.out,
  });
  const lobbySeat = (m) => ({
    id: m.id, name: m.name, color: m.color, points: 0, discs: 4, hand: 4, stack: 0, shown: [],
    placed: false, passed: false, out: null,
  });
  const me = seatOf(s, id);
  const mine = !lobby && me ? { hand: { ...me.hand }, stack: [...me.stack], lost: [...me.lost] } : null;
  const inFlip = s.step === 'flip';
  return {
    code: s.code, mode: 'gsk', hostId: s.hostId, you: id, now: s.now,
    phase: s.phase, gameNo: s.gameNo,
    players: s.members.map((m) => ({
      id: m.id, name: m.name, connected: m.connected,
      awayUntil: playing && !m.connected && m.awayAt != null && seatOf(s, m.id) && !seatOf(s, m.id).out ? m.awayAt + s.graceMs : null,
      spectating: m.spec,
    })),
    seats: lobby ? s.members.filter((m) => !m.spec).map(lobbySeat) : s.seats.map(seatView),
    step: playing ? s.step : null,
    round: s.round,
    starter: lobby ? null : s.starter,
    turn: playing && (s.step === 'turn' || s.step === 'bid' || s.step === 'flip') ? s.turnId : null,
    waiting,
    total: playing ? tableTotal(s) : 0,
    bid: s.bid ? { ...s.bid } : null,
    challenger: s.challenger,
    need: s.need, flipped: s.flipped,
    outcome: s.outcome ? { ...s.outcome } : null,
    penalty: playing && s.step === 'penalty'
      ? { by: s.pen.by, target: s.pen.target, n: s.pen.perm.length, faceUp: s.pen.by === s.pen.target } : null,
    endsAt: inFlip ? s.flipAt : s.endsAt,
    mine,
    result: s.result ? { reason: s.result.reason, winner: s.result.winner, ranks: s.result.ranks.map((r) => ({ ...r })) } : null,
  };
}
