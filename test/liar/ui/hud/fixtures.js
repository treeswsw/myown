// 가짜 상태 (CONTRACTS 3절 표본). 단계별로 바꿔 쓴다.
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];

export function makePlayers(n) {
  return NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0,
  }));
}

export function makeBase(n = 8) {
  const players = makePlayers(n);
  return {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase: 'speak', phaseEndsAt: 1_030_000, round: 1,
    settings: { liarMode: 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
      wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }], goal: 0, nextTopic: null },
    players, topic: '장소', my: { word: '도서관', role: null },
    order: players.map((p) => p.id), speaker: 'u1',
    firstSays: [], votes: {}, candidates: null, accuseNo: 1, accused: null, judge: null, unmask: null, guess: null, result: null,
  };
}

export const PHASES = ['lobby', 'reveal', 'speak', 'discuss', 'revote', 'defense', 'judge', 'judged', 'unmask', 'guess', 'answer', 'result'];

// 단계 이름 -> 가짜 상태. extra 로 덮어쓴다.
export function stateFor(phase, extra = {}, n = 8) {
  const s = makeBase(n);
  s.phase = phase;
  if (phase === 'lobby') {
    s.phaseEndsAt = null; s.topic = null; s.my = { word: null, role: null }; s.order = []; s.speaker = null;
    s.players.forEach((p) => { p.seat = null; });
  } else if (phase === 'speak') {
    s.speaker = 'u1';
  } else {
    s.speaker = null;
    s.phaseEndsAt = 1_000_000 + ({ reveal: 8, discuss: 90, revote: 30, defense: 20, judge: 10, judged: 3, unmask: 8, guess: 15, answer: 15, result: 0 }[phase] || 0) * 1000;
    if (phase === 'result') s.phaseEndsAt = null;
  }
  if (['defense', 'judge', 'judged', 'unmask', 'guess', 'answer', 'result'].includes(phase)) s.accused = 'u3';
  if (phase === 'revote') s.candidates = ['u2', 'u3'];
  if (phase === 'judged') s.judge = { picks: {}, executed: true };
  return Object.assign(s, extra);
}
