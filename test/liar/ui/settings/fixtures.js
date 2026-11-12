// 가짜 상태 (CONTRACTS 3절 표본). n = 3 또는 8.
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];
export const TIME_CHOICES = { speak: [20, 30, 45, 60], discuss: [60, 90, 120, 180], rediscuss: [30, 60, 90], defense: [15, 20, 30], judge: [10, 15, 20], guess: [10, 15, 30] };
export const GOAL_CHOICES = [0, 10, 15, 20];
export const MINE = ['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '영화·만화', '나라·도시', '탈것', '인물'];
export const STAR = ['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '영화', '나라', '탈것'];

export function makePlayers(n) {
  return NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: null, connected: true, awayUntil: null, spectating: false, score: i,
  }));
}

// name: 'lobby' | 'random' | 'host' | 'star' | 'speak' | 'result'
export function fixture(name, n = 8, over = {}) {
  const set = name === 'star' ? STAR : MINE;
  const base = {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase: 'lobby', phaseEndsAt: null, round: 1,
    settings: { liarMode: 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
      wordSet: name === 'star' ? 'star' : 'mine', topicMode: 'random',
      topics: set.map((t) => ({ name: t, on: true })), goal: 0, nextTopic: null },
    players: makePlayers(n), topic: null, my: { word: null, role: null }, order: [], speaker: null,
    firstSays: [], votes: {}, candidates: null, accuseNo: 1, accused: null, judge: null, unmask: null, guess: null, result: null,
  };
  const extra = {
    lobby: {}, random: {}, star: {},
    host: { settings: { ...base.settings, topicMode: 'host' } },
    speak: { phase: 'speak', phaseEndsAt: 1_030_000, topic: '장소', players: makePlayers(n).map((p, i) => ({ ...p, seat: i })) },
    result: { phase: 'result' },
  }[name];
  if (!extra) throw new Error('모르는 가짜 상태: ' + name);
  const s = { ...base, ...extra, ...over };
  if (over.settings) s.settings = { ...(extra.settings || base.settings), ...over.settings };
  return s;
}
