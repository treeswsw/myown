// 미니게임 게임 훅 (docs/mini/PLAN.md, docs/COMMON-CONTRACT.md 1-4). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·끊김 유예·강퇴·채팅·이모티콘·소리·faces·빈 방 지우기는 Shell 이 맡는다. 이 파일은 규칙 전달, 승부(매치) 진행, 코인 베팅 정산.
// 규칙은 shared/mini 가 판정한다. 시간 제한 없음. 자리(seats)는 먼저 들어온 연결된 2명, 첫 선(seat 0)은 hub.rng 로 정하고 판마다 번갈아 바뀐다. 나머지는 관전.
// 승부(매치): 한 판 한 판(game) 이 모여 len(1/3/5) 판의 과반을 먼저 이기면 끝. 무승부 판은 승수에 넣지 않고 다시(최대 MAX_DRAWS 번,
// 단판은 무승부면 그대로 끝). 매치가 끝나야 결과(end) -> 대기실. 코인 베팅은 매치 단위(hub.stake / hub.settleStake, server/coin/wallet.js).
import { GAMES, GAME_IDS } from '../../shared/mini/index.js';
import { KINDS, LENS, DEFAULTS } from '../../shared/mini/settings.js';

export const BETWEEN_MS = 5000; // 판 사이 쉬는 시간
export const MAX_DRAWS = 3; // 한 매치에서 무승부 판이 이만큼 나오면 매치도 무승부
const RULES = ['free', 'renju'];

export function makeMiniGame(ctx, opt = {}) {
  const err = (c, msg) => ctx.err(`mn_${c}`, msg);
  let phase = 'lobby'; // 'lobby' | 'play' | 'between'(매치 중 판 사이) | 'end'(결과 화면, 대기 상태)
  let setting = GAME_IDS.includes(opt.game) ? opt.game : 'gomoku'; // kind=fixed 일 때의 종목
  let kind = DEFAULTS.kind;
  let games = [...GAME_IDS]; // kind=random/order 일 때 고른 종목들(목록 순서)
  let rule = DEFAULTS.rule;
  let len = DEFAULTS.len;
  let played = setting; // 지금 판(또는 방금 끝난 판)의 종목
  let seats = [null, null];
  let names = [null, null];
  let mn = null; // 규칙 상태
  let result = null; // 매치 결과 {winner: 자리|'draw', reason}
  let mt = null; // 매치 {cfg, players:[id,id], wins:{id:n}, round, draws, orderIdx, bet, last}
  let nextAt = null;
  let staked = false; // 맡아 둔 코인이 있다
  const bets = new Map(); // id -> 건 코인 (대기실)

  const ready = () => ctx.members().filter((m) => m.connected).slice(0, 2);
  const coinsOf = (id) => ctx.member(id)?.session.user.coins ?? 0;
  const nameOf = (id) => ctx.member(id)?.session.user.name ?? '';
  const betOf = (id) => bets.get(id) ?? 0;

  // ---- 코인 (맡기기·정산은 한 번씩만: hub.stake / hub.settleStake 가 이중 처리를 막는다) ----
  // 돌려주는 값 {id: 베팅 증감}
  function settle(winnerId) {
    if (!staked) return {};
    staked = false;
    return Object.fromEntries((ctx.hub.settleStake?.(ctx, winnerId ?? null) ?? []).map((r) => [r.id, r.net]));
  }

  // ---- 판 진행 ----
  function pickGame() {
    const cfg = mt.cfg;
    if (cfg.kind === 'random') return cfg.games[Math.floor(ctx.rng() * cfg.games.length)];
    if (cfg.kind === 'order') return cfg.games[mt.orderIdx % cfg.games.length];
    return cfg.game;
  }

  function beginGame(first) {
    played = pickGame();
    if (!first) seats = [seats[1], seats[0]]; // 선(먼저 두는 사람)은 판마다 번갈아
    names = seats.map(nameOf);
    mn = GAMES[played].init({ rule: mt.cfg.rule });
    result = null;
    mt.last = null;
    nextAt = null;
    phase = 'play';
    ctx.emit([{ k: 'mnStart', game: played, round: mt.round }]);
  }

  function goNext() {
    if (phase !== 'between') return;
    beginGame(false);
    ctx.push();
  }

  // 매치가 끝났다. winnerId = null 이면 무승부(베팅은 돌려준다). reason: 'win'(판 승수) | 'resign' | 'leave' | 'draw'
  function endMatch(winnerId, reason) {
    phase = 'end';
    ctx.clear('next');
    nextAt = null;
    const wSeat = winnerId === null ? -1 : seats.indexOf(winnerId);
    result = winnerId === null ? { winner: 'draw', reason: 'draw' } : { winner: wSeat, reason };
    // 공통 결과는 매치마다 한 번. 승리 코인은 판 승수로 이긴 때만(기권·나감·무승부 제외), 베팅 증감은 add 로 합친다.
    const bet = settle(winnerId);
    const out = reason === 'resign' ? '기권' : reason === 'leave' ? '나감' : '';
    ctx.finish(mt.players.map((id) => ({
      id, rank: winnerId === null || id === winnerId ? 1 : 2,
      note: [`${mt.wins[id] ?? 0}승`, id === winnerId ? '' : out].filter(Boolean).join(' · '),
      won: id === winnerId, opp: reason === 'win' && id === winnerId ? 1 : undefined,
    })), { add: { label: '베팅', by: bet } });
    bets.clear();
  }

  // 한 판이 보드에서 끝났다. winner = 자리 번호 | 'draw'
  function gameEnded(winner) {
    mt.last = { winner, game: played };
    if (winner === 'draw') {
      mt.draws++;
      if (mt.cfg.len === 1 || mt.draws >= MAX_DRAWS) return endMatch(null, 'draw');
    } else {
      const id = seats[winner];
      mt.wins[id] = (mt.wins[id] ?? 0) + 1;
      mt.orderIdx++;
      if (mt.wins[id] >= (mt.cfg.len + 1) / 2) return endMatch(id, 'win');
    }
    mt.round++;
    phase = 'between';
    nextAt = ctx.now() + BETWEEN_MS;
    ctx.timer('next', BETWEEN_MS, goNext);
    return null;
  }

  function setSettings(byId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return err('bad');
    const keys = Object.keys(patch);
    if (!keys.length || !keys.every((k) => ['game', 'kind', 'games', 'rule', 'len'].includes(k))) return err('bad');
    const next = {};
    for (const k of keys) {
      const v = patch[k];
      if (k === 'game') {
        if (!GAME_IDS.includes(v)) return err('game', '알 수 없는 게임입니다.');
      } else if (k === 'kind') {
        if (!KINDS.includes(v)) return err('kind', '알 수 없는 종목 방식입니다.');
      } else if (k === 'games') {
        if (!Array.isArray(v) || !v.length || !v.every((g) => GAME_IDS.includes(g)) || new Set(v).size !== v.length) return err('games', '종목을 다시 골라 주세요.');
        next.games = GAME_IDS.filter((g) => v.includes(g)); // 목록 순서
        continue;
      } else if (k === 'rule') {
        if (!RULES.includes(v)) return err('rule', '알 수 없는 오목 규칙입니다.');
      } else if (!LENS.includes(v)) return err('len', '알 수 없는 승부 방식입니다.');
      next[k] = v;
    }
    if (next.game !== undefined) setting = next.game;
    if (next.kind !== undefined) kind = next.kind;
    if (next.games !== undefined) games = next.games;
    if (next.rule !== undefined) rule = next.rule;
    if (next.len !== undefined) len = next.len;
    return null;
  }

  // 모든 {t:'mn'} 요청. 시작·종목·다시는 공용 {t:'start'}·{t:'set'} 이 맡는다(Shell).
  function onAction(session, msg) {
    const id = session.id;
    switch (msg.a) {
      case 'move': {
        if (phase !== 'play') return err('now');
        const seat = seats.indexOf(id);
        if (seat < 0) return err('seat', '관전 중입니다.');
        if (seat !== mn.turn) return err('turn', '당신 차례가 아닙니다.');
        const next = GAMES[played].apply(mn, msg.move);
        if (!next) return GAMES[played].reject?.(mn, msg.move) ? err('forbid', GAMES[played].reject(mn, msg.move)) : err('move', '둘 수 없는 곳입니다.');
        mn = next;
        if (next.winner !== null) gameEnded(next.winner);
        ctx.push();
        return null;
      }
      case 'resign': {
        if ((phase !== 'play' && phase !== 'between') || !mt.players.includes(id)) return err('now');
        endMatch(mt.players.find((x) => x !== id), 'resign');
        ctx.push();
        return null;
      }
      default: return err('bad');
    }
  }

  return {
    // 프로필 사진은 없다(faces 알림). 판은 모두에게 같다. 공통 칸(code·mode·hostId·you·now·wait·specs)은 Shell 이 덮는다.
    view(viewerId) {
      const inGame = phase === 'play' || phase === 'between';
      const turnId = phase === 'play' ? seats[mn.turn] : null;
      const turnMember = turnId ? ctx.member(turnId) : null;
      return {
        phase,
        game: phase === 'lobby' ? setting : played, // 판 그림은 지금 판의 종목, 대기실은 고른 종목
        seats: [...seats],
        names: [...names],
        mySeat: seats.indexOf(viewerId), // -1 = 관전
        players: ctx.members().map((m) => ({ id: m.id, spectating: phase !== 'lobby' && !seats.includes(m.id) })),
        turn: turnId,
        waiting: turnMember && !turnMember.connected ? turnMember.id : null,
        mn,
        result,
        // 매치: len 판제, round 지금 몇 번째 판, score 는 자리 순서(seats)대로 승수, bet 건 코인(0 = 없음), last 방금 끝난 판(between 동안)
        match: mt ? {
          len: mt.cfg.len, kind: mt.cfg.kind, round: mt.round, draws: mt.draws, bet: mt.bet,
          score: seats.map((id) => (id ? mt.wins[id] ?? 0 : 0)),
          next: inGame && phase === 'between' ? nextAt : null,
          last: phase === 'between' ? mt.last : null,
        } : null,
      };
    },
    phase: () => phase,
    isWaiting: () => phase === 'lobby' || phase === 'end',

    canStart() {
      const two = ready();
      if (two.length < 2) return err('need2', '2명이 필요합니다.');
      if (kind !== 'fixed' && games.length < 2) return err('games', '종목을 2개 이상 골라 주세요.');
      const [a, b] = two;
      if (betOf(a.id) !== betOf(b.id)) return err('bet', '건 코인이 서로 달라요 (같게 맞추거나 둘 다 0)');
      const n = betOf(a.id);
      if (n > 0) {
        if (two.some((m) => m.session.bot)) return err('bot', '봇과는 코인을 걸 수 없어요.');
        const poor = two.find((m) => coinsOf(m.id) < n);
        if (poor) return err('coin', `${poor.session.user.name} 님의 코인이 모자라요.`);
      }
      return null;
    },

    onStart() {
      const bad = this.canStart(); // 시작 직전 잔액 재확인
      if (bad) return bad;
      const two = ready();
      const n = betOf(two[0].id);
      if (n > 0) {
        const why = ctx.hub.stake?.(ctx, two.map((m) => ({ id: m.id, n })), { mode: 'mini', code: ctx.code });
        if (why) return err('coin', why.code === 'coin_low' ? '코인이 모자라요.' : '코인을 맡길 수 없어요.');
        staked = true;
      }
      if (ctx.rng() < 0.5) two.reverse();
      seats = two.map((m) => m.id);
      mt = {
        cfg: { kind, game: setting, games: [...games], rule, len },
        players: [...seats], wins: {}, round: 1, draws: 0, orderIdx: 0, bet: n, last: null,
      };
      beginGame(true);
      return null;
    },

    setSettings,
    // 개인 칸: 건 코인. 본인만 자기 것을 고친다(Shell.pick). 한도 = 가진 코인.
    pick(id, patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some((k) => k !== 'bet')) return err('bad');
      const n = patch.bet;
      if (!Number.isInteger(n) || n < 0) return err('betval', '건 코인은 0 이상의 정수예요.');
      if (n > 0 && !ready().some((m) => m.id === id)) return err('betspec', '구경하는 사람은 코인을 걸 수 없어요.');
      if (n > coinsOf(id)) return err('coin', '가진 코인보다 많이 걸 수 없어요.');
      bets.set(id, n);
      return null;
    },
    waitInfo: () => ({
      set: { game: setting, kind, games: [...games], rule, len },
      own: Object.fromEntries(ctx.members().map((m) => [m.id, { bet: betOf(m.id) }])),
    }),
    listExtra: () => ({ game: setting }),
    onAction,

    // 판 중(판 사이 포함) 자리에 앉은 사람이 나가거나 끊김 60초가 지나면 기권 = 매치 패배(맡긴 코인은 상대가 가져감)
    onLeave(id) {
      if ((phase === 'play' || phase === 'between') && mt.players.includes(id)) endMatch(mt.players.find((x) => x !== id), 'leave');
      bets.delete(id);
      return [];
    },

    // 서버가 닫히기 전(hub.close): 끝나지 못한 매치의 코인은 돌려준다
    flush() {
      settle(null);
    },

    // 관리자 "건너뛰기": 판 사이 쉬는 시간을 바로 끝낸다
    skipNow() {
      if (phase !== 'between') return false;
      ctx.clear('next');
      goNext();
      return true;
    },

    onEmpty() {
      settle(null);
      ctx.clear('next');
      phase = 'lobby';
      seats = [null, null];
      names = [null, null];
      mn = null;
      result = null;
      mt = null;
      nextAt = null;
      bets.clear();
    },
  };
}
