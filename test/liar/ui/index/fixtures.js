// 가짜 상태(CONTRACTS 3절 표본). make(단계, 옵션) → state
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];
const SECS = { reveal: 8, speak: 30, discuss: 90, revote: 30, defense: 20, judge: 10, judged: 3, unmask: 8, guess: 15 };

/** opts: n(3|8) you(기본 u0) word(내 제시어) notice host */
export function make(phase, opts = {}) {
  const n = opts.n || 8;
  const you = opts.you || 'u0';
  const players = NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: phase === 'lobby' ? null : i, connected: true, awayUntil: null, spectating: false, score: i,
  }));
  const ids = players.map((p) => p.id);
  const lobby = phase === 'lobby';
  const accusedPhase = ['defense', 'judge', 'judged', 'unmask', 'guess', 'result'].includes(phase);
  const s = {
    code: 'ABCD', mode: 'liar', hostId: opts.host || 'u0', you, now: 1_000_000, phase,
    round: opts.round || 1, phaseEndsAt: lobby || phase === 'result' ? null : 1_000_000 + (SECS[phase] || 10) * 1000,
    settings: { liarMode: opts.notice ? 'notice' : 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
      wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }], goal: 0, nextTopic: null },
    players, topic: lobby ? null : '장소', my: lobby ? { word: null, role: null } : { word: opts.word || '도서관', role: null },
    order: lobby ? [] : ids, speaker: phase === 'speak' ? 'u1' : null,
    firstSays: lobby ? [] : ids.map((id, i) => ({ id, text: i === 0 ? '조용한 곳이에요' : null, late: false })),
    votes: ['discuss', 'revote', 'defense', 'judge', 'judged'].includes(phase) ? { u1: 'u2', u2: 'u1' } : {},
    candidates: phase === 'revote' ? ['u1', 'u2'] : null, accuseNo: 1,
    accused: accusedPhase ? 'u2' : null,
    judge: phase === 'judge' ? { picks: {}, executed: null } : phase === 'judged' ? { picks: { u0: 'yes' }, executed: true } : null,
    unmask: phase === 'unmask' || phase === 'guess' || phase === 'result' ? { id: 'u2', wasLiar: true, liarId: 'u2' } : null,
    guess: null, result: null,
  };
  if (phase === 'result') {
    s.result = { winner: 'citizens', caught: true, guessed: false, reason: 'executedLiar', liarId: 'u2', liarName: '지호', citizenWord: '도서관',
      liarWord: opts.notice ? null : '서점', voteLog: [], delta: Object.fromEntries(ids.map((id) => [id, id === 'u2' ? 0 : 1])), champions: null };
  }
  return s;
}

export const ORDER = ['lobby', 'reveal', 'speak', 'discuss', 'revote', 'defense', 'judge', 'judged', 'unmask', 'guess', 'result'];
