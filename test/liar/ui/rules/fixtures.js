// 규칙 창 시험용 가짜 상태. 규칙 창은 phase 와 settings.liarMode 만 읽는다.
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
export const PHASES = ['lobby', 'reveal', 'speak', 'discuss', 'defense', 'judge', 'revote', 'guess', 'unmask', 'result'];

export function fixture(phase, n = 8, over = {}) {
  const players = NAMES.slice(0, n).map((name, i) => ({ id: 'u' + i, name, color: '#888', body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0 }));
  return {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase, round: 1, players,
    settings: { liarMode: 'word' }, topic: '장소', my: { word: '도서관', role: null }, order: [], speaker: null, firstSays: [],
    votes: {}, accuseNo: 1, accused: null, judge: null, unmask: null, guess: null, result: null, ...over,
  };
}
