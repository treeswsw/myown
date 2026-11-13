// 가짜 상태 (CONTRACTS 3절 표본). n = 3 또는 8.
const NAMES = ['민수', '서아', '지호', '병철', '유나', '도윤', '하린', '태오'];
const COLORS = ['#e5484d', '#f2a33a', '#e9d758', '#46a758', '#3db9cf', '#4c7dff', '#a06cff', '#ff6fb5'];
const ORDER8 = ['u2', 'u6', 'u4', 'u5', 'u1', 'u0', 'u3', 'u7'];

export function makePlayers(n) {
  return NAMES.slice(0, n).map((name, i) => ({
    id: 'u' + i, name, color: COLORS[i], body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0,
  }));
}

// firstSays 를 순서대로 만든다. texts: { id: 글 | null }, upTo: 이 사람 앞까지 칸이 있다(차례가 지남)
function says(order, texts, lateIds = []) {
  return order.filter((id) => id in texts).map((id) => ({ id, text: texts[id], late: lateIds.includes(id) }));
}

// 이름 → 상태. 나(u0)는 order 6번째(8명판). 8명판에서 speaker=u4 이면 u2,u6 은 지났고 u0 은 아직 전.
export function fixture(name, n = 8, over = {}) {
  const players = makePlayers(n);
  const ids = players.map((p) => p.id);
  const order = n === 8 ? ORDER8 : ['u2', 'u0', 'u1'];
  const base = {
    code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase: 'speak', phaseEndsAt: 1_030_000, round: 1,
    settings: {}, players, topic: '장소', my: { word: '도서관', role: null },
    order, speaker: order[2 % order.length], firstSays: [], votes: {}, candidates: null, accuseNo: 1, accused: null,
    judge: null, unmask: null, guess: null, result: null,
  };
  const all = Object.fromEntries(order.map((id, i) => [id, '설명 ' + (i + 1)]));
  const byName = {
    lobby: { phase: 'lobby', phaseEndsAt: null, topic: null, my: { word: null, role: null }, order: [], speaker: null,
             players: players.map((p) => ({ ...p, seat: null })) },
    reveal: { phase: 'reveal', speaker: null },
    // 첫 설명 중: 내(u0) 앞 순서(u2,u6,u4)가 지났고 u4 는 지금 차례(칸은 있고 text null)
    speak: n === 8
      ? { speaker: 'u5', firstSays: says(order, { u2: '조용한 곳', u6: '책이 많아요', u4: '늦게 쓴 글', u5: null }, ['u4']) }
      : { speaker: 'u1', firstSays: says(order, { u2: '조용한 곳', u0: '책이 많아요', u1: null }) },
    // 내가 차례를 놓침(u4 가 지금 차례, 나(u0)는 이미 지나 text null)
    'speak-missed': n === 8
      ? { speaker: 'u1', firstSays: says(order, { u2: '조용한 곳', u6: null, u4: '책이 많아요', u5: '대출', u1: null, u0: null }) }
      : { speaker: 'u1', firstSays: says(order, { u2: '조용한 곳', u0: null, u1: null }) },
    // 지금 내 차례
    'speak-me': n === 8
      ? { speaker: 'u0', firstSays: says(order, { u2: 'a', u6: 'b', u4: 'c', u5: 'd', u1: 'e', u0: null }) }
      : { speaker: 'u0', firstSays: says(order, { u2: 'a', u0: null }) },
    'discuss-missed': { phase: 'discuss', speaker: null, firstSays: says(order, Object.fromEntries(order.map((id) => [id, id === 'u0' ? null : id === 'u6' ? null : '설명 ' + id])), []) },
    'revote-missed': { phase: 'revote', speaker: null, candidates: ['u1', 'u2'], firstSays: says(order, Object.fromEntries(order.map((id) => [id, id === 'u0' ? null : '글 ' + id]))) },
    'discuss-all': { phase: 'discuss', speaker: null, firstSays: says(order, all, ['u5']) },
    'discuss2-missed': { phase: 'discuss', speaker: null, accuseNo: 2, firstSays: says(order, Object.fromEntries(order.map((id) => [id, id === 'u0' ? null : '글']))) },
    defense: { phase: 'defense', speaker: null, accused: 'u2', firstSays: says(order, Object.fromEntries(order.map((id) => [id, id === 'u0' ? null : '글']))) },
    judge: { phase: 'judge', speaker: null, accused: 'u2', firstSays: says(order, all) },
    unmask: { phase: 'unmask', speaker: null, accused: 'u2', firstSays: says(order, all) },
    result: { phase: 'result', speaker: null, firstSays: says(order, Object.fromEntries(order.map((id) => [id, id === 'u0' ? null : '글']))) },
  };
  if (!byName[name]) throw new Error('모르는 가짜 상태: ' + name);
  void ids;
  return { ...base, ...byName[name], ...over };
}

export const NAMES_LIST = ['lobby', 'reveal', 'speak', 'speak-missed', 'speak-me', 'discuss-missed', 'revote-missed', 'discuss-all', 'discuss2-missed', 'defense', 'judge', 'unmask', 'result'];
