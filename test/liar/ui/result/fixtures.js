// 가짜 상태(CONTRACTS 3절 표본에서 복사). make(단계, 옵션) → state
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];

export function makePlayers(n = 8) {
  return NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0,
  }));
}

const REASONS = {
  executedLiar: { winner: 'citizens', caught: true, guessed: false },
  executedCitizen: { winner: 'liar', caught: false, guessed: false },
  tie: { winner: 'liar', caught: false, guessed: false },
  noVotes: { winner: 'liar', caught: false, guessed: false },
  liarLeft: { winner: 'citizens', caught: null, guessed: null },
  tooFew: { winner: 'void', caught: null, guessed: null },
  hostEnded: { winner: 'void', caught: null, guessed: null },
};

/** opts: n(3|8) you liarId(기본 u2) reason notice(라이어 알림) guess({text,correct}) champions delta log(1|2) host */
export function make(phase, opts = {}) {
  const n = opts.n || 8;
  const players = makePlayers(n);
  const liarId = opts.liarId || 'u2';
  const you = opts.you || 'u0';
  const reason = opts.reason || 'executedLiar';
  const state = {
    code: 'ABCD', mode: 'liar', hostId: opts.host || 'u0', you, now: 1_000_000, phase,
    phaseEndsAt: 1_015_000, round: opts.round || 1,
    settings: { liarMode: opts.notice ? 'notice' : 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
      wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }], goal: 0, nextTopic: null },
    players, topic: '장소', my: { word: null, role: null },
    order: players.map((p) => p.id), speaker: null, firstSays: [], votes: {}, candidates: null,
    accuseNo: opts.log || 1, accused: liarId, judge: { picks: {}, executed: true },
    unmask: { id: liarId, wasLiar: true, liarId }, guess: opts.guess === undefined ? null : opts.guess, result: null,
  };
  if (phase === 'result') {
    const delta = opts.delta || {};
    if (!opts.delta) players.forEach((p, i) => { delta[p.id] = p.id === liarId ? 0 : i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : -1; });
    players.forEach((p, i) => { p.score = (opts.scores ? opts.scores[i] : 3 + i % 4) + 0; });
    const logN = opts.log || 1;
    const voteLog = [];
    for (let k = 1; k <= logN; k++) {
      voteLog.push({ no: k, votes: { u0: liarId, u1: liarId, [liarId]: 'u0' }, accused: liarId,
        picks: { u0: 'yes', u1: 'no' }, executed: k === logN });
    }
    state.result = {
      ...REASONS[reason], reason, liarId, citizenWord: opts.citizenWord || '도서관',
      liarWord: opts.notice ? null : (opts.liarWord || '서점'), voteLog, delta, champions: opts.champions || null,
    };
    if (reason === 'tie' || reason === 'noVotes' || reason === 'liarLeft') state.result.voteLog = [];
  }
  return state;
}
