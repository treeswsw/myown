// 가짜 상태(ENDING 3-3). make(phase, 옵션) → state
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];

/** phase: 'guess' | 'answer'.
 *  opts: n(3|8) remain(남은 초) liarName you round accuseNo
 *        liarWord('놀이공원' | null = 라이어 알림) text(라이어 답, null = 시간 초과) correct guessTime(방 설정 초) */
export function make(phase, opts = {}) {
  const n = opts.n || 8;
  const players = NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name: i === 2 && opts.liarName ? opts.liarName : name, color: COLORS[i], body: i, seat: i,
    connected: true, awayUntil: null, spectating: false, score: 0,
  }));
  const liarId = 'u2';
  const guessTime = opts.guessTime || 15;
  const total = phase === 'answer' ? 10 : guessTime;
  const remain = opts.remain == null ? total : opts.remain;
  const now = 1_000_000;
  const hasText = 'text' in opts;
  const text = hasText ? opts.text : '놀이공원';
  const liarWord = 'liarWord' in opts ? opts.liarWord : '놀이공원';
  const answer = phase === 'answer';
  return {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: opts.you || 'u0', now, phase,
    phaseEndsAt: now + remain * 1000, round: opts.round || 1,
    settings: { liarMode: liarWord == null ? 'notice' : 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: guessTime },
      wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }], goal: 0, nextTopic: null },
    players, topic: '장소', my: { word: null, role: null },
    order: players.map((p) => p.id), speaker: null, firstSays: [], votes: {}, candidates: null,
    accuseNo: opts.accuseNo || 1, accused: liarId, judge: { picks: {}, executed: true },
    unmask: { id: liarId, wasLiar: true, liarId },
    guess: answer ? { text, correct: !!opts.correct } : null,
    words: answer ? { citizen: '도서관', liar: liarWord } : null,
    result: null,
  };
}
