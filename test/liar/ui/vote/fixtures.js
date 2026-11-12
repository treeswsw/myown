// 가짜 상태 (CONTRACTS 3절 표본). n = 3 또는 8.
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];

export function makePlayers(n) {
  return NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0,
  }));
}

const keep = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => ids.includes(k) && (v === 'yes' || v === 'no' || ids.includes(v))));

// phase 이름 → 상태. over 로 덮어쓴다.
export function fixture(name, n = 8, over = {}) {
  const players = makePlayers(n);
  const ids = players.map((p) => p.id);
  const base = {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase: 'speak', phaseEndsAt: 1_030_000, round: 1,
    settings: {}, players, topic: '장소', my: { word: '도서관', role: null },
    order: ids, speaker: 'u1', firstSays: [], votes: {}, candidates: null, accuseNo: 1, accused: null,
    judge: null, unmask: null, guess: null, result: null,
  };
  const votes = keep({ u1: 'u2', u3: 'u2', u4: 'u1', u0: 'u3', u2: 'u1' }, ids);
  const picks = keep({ u1: 'yes', u3: 'no', u4: 'yes', u0: 'no' }, ids);
  const byName = {
    lobby: { phase: 'lobby', phaseEndsAt: null, topic: null, my: { word: null, role: null }, order: [], speaker: null,
             players: players.map((p) => ({ ...p, seat: null })) },
    reveal: { phase: 'reveal' },
    speak: {},
    discuss: { phase: 'discuss', speaker: null },
    'discuss-votes': { phase: 'discuss', speaker: null, votes },
    revote: { phase: 'revote', speaker: null, candidates: ['u1', 'u2'], votes: keep({ u3: 'u1' }, ids) },
    defense: { phase: 'defense', speaker: null, accused: 'u2', votes },
    judge: { phase: 'judge', speaker: null, accused: 'u2', votes, judge: { picks: {}, executed: null } },
    'judge-picks': { phase: 'judge', speaker: null, accused: 'u2', votes, judge: { picks, executed: null } },
    judged: { phase: 'judged', speaker: null, accused: 'u2', votes, judge: { picks, executed: true } },
    unmask: { phase: 'unmask', speaker: null, accused: 'u2' },
  };
  if (!byName[name]) throw new Error('모르는 가짜 상태: ' + name);
  return { ...base, ...byName[name], ...over };
}

export const PHASES = ['lobby', 'reveal', 'speak', 'discuss', 'discuss-votes', 'revote', 'defense', 'judge', 'judge-picks', 'judged', 'unmask'];
