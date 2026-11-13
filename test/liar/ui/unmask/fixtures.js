// 가짜 상태(CONTRACTS 3절 표본에서 복사). make(경우, 옵션) → state
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];
const TOTALS = { liar: 6, citizen: 11, fail: 5 };

/** kind: 'liar'(라이어 처형) | 'citizen'(시민 처형) | 'fail'(지목 실패).
 *  opts: n(3|8) remain(남은 초, 기본 total) liarName phase round accuseNo */
export function make(kind, opts = {}) {
  const n = opts.n || 8;
  const players = NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name: i === 2 && opts.liarName ? opts.liarName : name, color: COLORS[i], body: i, seat: i,
    connected: true, awayUntil: null, spectating: false, score: 0,
  }));
  const liarId = 'u2';
  const total = TOTALS[kind];
  const remain = opts.remain == null ? total : opts.remain;
  const now = 1_000_000;
  const unmask = kind === 'liar' ? { id: liarId, wasLiar: true, liarId }
    : kind === 'citizen' ? { id: 'u1', wasLiar: false, liarId } : { id: null, wasLiar: null, liarId };
  return {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: opts.you || 'u0', now, phase: opts.phase || 'unmask',
    phaseEndsAt: now + remain * 1000, round: opts.round || 1,
    settings: { liarMode: 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
      wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }], goal: 0, nextTopic: null },
    players, topic: '장소', my: { word: '도서관', role: null },
    order: players.map((p) => p.id), speaker: null, firstSays: [], votes: {}, candidates: null,
    accuseNo: opts.accuseNo || 1, accused: unmask.id, judge: { picks: {}, executed: true },
    unmask, guess: null, result: null,
  };
}
