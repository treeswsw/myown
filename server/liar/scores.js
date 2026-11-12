// 점수 계산 (GDD 5절). 순수 함수: 받은 것을 고치지 않고 새 객체를 돌려준다.

export function applyDelta(scores, delta) {
  const out = { ...(scores || {}) };
  for (const [id, d] of Object.entries(delta || {})) out[id] = (out[id] || 0) + d;
  return out;
}

export function champions(scores, goal) {
  if (!goal) return null;
  const hit = Object.entries(scores || {}).filter(([, s]) => s >= goal);
  if (!hit.length) return null;
  const top = Math.max(...hit.map(([, s]) => s));
  return hit.filter(([, s]) => s === top).map(([id]) => id);
}

export function unflushed(entry) {
  return (entry?.score || 0) - (entry?.flushed || 0);
}

export function addToTotal(liarStats, add) {
  return { ...liarStats, score: Math.max(0, (liarStats?.score || 0) + add) };
}

// Book a room entry into the running total. The total never goes below 0, and the part that
// could not be subtracted is NOT counted as booked (CONTRACTS 8절): flushed grows only by what applied.
export function flushEntry(liarStats, entry) {
  const before = liarStats?.score || 0;
  const stats = addToTotal(liarStats, unflushed(entry));
  return { stats, flushed: (entry?.flushed || 0) + (stats.score - before) };
}

export function roundStats(result, playerIds) {
  const out = {};
  if (!result || result.winner === 'void') return out;
  for (const id of playerIds || []) {
    const isLiar = id === result.liarId;
    const won = isLiar ? result.winner === 'liar' : result.winner === 'citizens';
    out[id] = { games: 1, wins: won ? 1 : 0, liarGames: isLiar ? 1 : 0, liarWins: isLiar && won ? 1 : 0 };
  }
  return out;
}
