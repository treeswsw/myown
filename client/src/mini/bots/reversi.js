// 리버시 봇. pickMove(state, level, deadlineMs) 동기·순수. deadlineMs = 최대 시간(ms, 생략하면 단계별 기본값).
// 내부: 64칸 Int8Array(0 빈칸, 1 = seat0, 2 = seat1). 수 {x,y}.
import { legalMoves } from '../../../../shared/mini/reversi.js';

const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DEPTH = { easy: 2, mid: 4, hard: 7 };
const BUDGET = { hard: 1800 };
const TIMEOUT = { timeout: true };
// 위치 가중치(모서리 크게, 모서리 옆 칸 감점)
const WEIGHT = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];
const CORNERS = [0, 7, 56, 63];

// i 칸에 p 를 둘 때 뒤집히는 칸 목록(없으면 빈 배열)
function flipsAt(b, i, p) {
  if (b[i] !== 0) return null;
  const x = i & 7, y = i >> 3;
  let out = null;
  for (const [dx, dy] of DIRS) {
    let cx = x + dx, cy = y + dy, n = 0;
    while (cx >= 0 && cy >= 0 && cx < N && cy < N && b[cy * N + cx] === 3 - p) { cx += dx; cy += dy; n++; }
    if (n && cx >= 0 && cy >= 0 && cx < N && cy < N && b[cy * N + cx] === p) {
      out = out || [];
      for (let k = 1; k <= n; k++) out.push((y + dy * k) * N + x + dx * k);
    }
  }
  return out;
}
function movesOf(b, p) {
  const out = [];
  for (let i = 0; i < 64; i++) if (b[i] === 0) { const f = flipsAt(b, i, p); if (f) out.push(i); }
  return out;
}
function place(b, i, p) {
  const f = flipsAt(b, i, p);
  const nb = b.slice();
  nb[i] = p;
  for (const k of f) nb[k] = p;
  return nb;
}

function evalFor(b, p, myMoves, opMoves) {
  let pos = 0, discs = 0, empties = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (v === p) { pos += WEIGHT[i]; discs++; } else if (v) { pos -= WEIGHT[i]; discs--; } else empties++;
  }
  // 모서리가 이미 차지됐으면 옆 칸 감점은 무효
  for (const c of CORNERS) {
    if (b[c] === 0) continue;
    const near = c === 0 ? [1, 8, 9] : c === 7 ? [6, 14, 15] : c === 56 ? [48, 49, 57] : [54, 55, 62];
    for (const n of near) if (b[n] === p) pos += 25; else if (b[n]) pos -= 25;
  }
  const mob = myMoves.length - opMoves.length;
  return pos + mob * 6 + (empties < 14 ? discs * 3 : 0);
}

export function pickMove(state, level = 'mid', deadlineMs) {
  const legal = legalMoves(state);
  if (!legal.length) return null;
  const b = new Int8Array(64);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = state.board[y][x]; b[y * N + x] = v === null ? 0 : v + 1; }
  const p = state.turn + 1;
  const t0 = Date.now();
  const budget = Math.min(BUDGET[level] ?? 1e9, deadlineMs ?? Infinity);
  const timed = level === 'hard' || deadlineMs !== undefined;
  let nodes = 0;
  const tick = () => { if (timed && (++nodes & 255) === 0 && Date.now() - t0 > budget) throw TIMEOUT; };
  const toMove = (i) => ({ x: i & 7, y: i >> 3 });
  const rootMoves = movesOf(b, p);
  if (rootMoves.length === 1) return toMove(rootMoves[0]);

  // 깊이 탐색 (negamax). 둘 곳이 없으면 패스, 둘 다 없으면 끝.
  const search = (bd, pl, depth, alpha, beta, passed) => {
    tick();
    const mv = movesOf(bd, pl);
    if (!mv.length) {
      const om = movesOf(bd, 3 - pl);
      if (!om.length) { // 끝: 돌 차이
        let d = 0;
        for (let i = 0; i < 64; i++) d += bd[i] === pl ? 1 : bd[i] ? -1 : 0;
        return d === 0 ? 0 : d > 0 ? 10000 + d : -10000 + d;
      }
      if (passed) return 0;
      return -search(bd, 3 - pl, depth, -beta, -alpha, true);
    }
    if (depth === 0) return evalFor(bd, pl, mv, movesOf(bd, 3 - pl));
    // 모서리 먼저, 가중치 순
    mv.sort((a, c) => WEIGHT[c] - WEIGHT[a]);
    let best = -Infinity;
    for (const i of mv) {
      const v = -search(place(bd, i, pl), 3 - pl, depth - 1, -beta, -alpha, false);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  // 끝까지: 이기고 지는 것만(-1, 0, 1) 빠르게 가린다. 반환은 pl 입장 부호.
  const solve = (bd, pl, alpha, beta, passed) => {
    tick();
    const mv = movesOf(bd, pl);
    if (!mv.length) {
      const om = movesOf(bd, 3 - pl);
      if (!om.length) {
        let d = 0;
        for (let i = 0; i < 64; i++) d += bd[i] === pl ? 1 : bd[i] ? -1 : 0;
        return d > 0 ? 1 : d < 0 ? -1 : 0;
      }
      if (passed) return 0;
      return -solve(bd, 3 - pl, -beta, -alpha, true);
    }
    mv.sort((a, c) => WEIGHT[c] - WEIGHT[a]);
    let best = -2;
    for (const i of mv) {
      const v = -solve(place(bd, i, pl), 3 - pl, -beta, -alpha, false);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };

  const ordered = rootMoves.slice().sort((a, c) => WEIGHT[c] - WEIGHT[a]);
  const runDepth = (d) => {
    let bv = -Infinity, bm = ordered[0];
    for (const i of ordered) {
      const v = -search(place(b, i, p), 3 - p, d - 1, -Infinity, -bv, false);
      if (v > bv) { bv = v; bm = i; }
    }
    return bm;
  };

  let best = ordered[0];
  if (level === 'easy') {
    try { best = runDepth(DEPTH.easy); } catch (e) { if (e !== TIMEOUT) throw e; }
    // 가끔 실수: 4번 중 1번은 차선
    if (ordered.length > 1 && Math.random() < 0.25) best = ordered[Math.floor(Math.random() * ordered.length)];
    return toMove(best);
  }
  if (level === 'mid') {
    try { best = runDepth(DEPTH.mid); } catch (e) { if (e !== TIMEOUT) throw e; }
    return toMove(best);
  }
  // hard: 반복 심화, 빈칸 12 이하면 끝까지
  let empties = 0;
  for (let i = 0; i < 64; i++) if (b[i] === 0) empties++;
  for (let d = 1; d <= DEPTH.hard; d++) {
    try { best = runDepth(d); } catch (e) { if (e !== TIMEOUT) throw e; break; }
  }
  if (empties <= 12) {
    try {
      let bv = -2, bm = null;
      for (const i of [best, ...ordered.filter((k) => k !== best)]) {
        const v = -solve(place(b, i, p), 3 - p, -1, -bv, false);
        if (v > bv) { bv = v; bm = i; }
        if (bv === 1) break;
      }
      if (bm !== null && bv >= 0) best = bm; // 어차피 지면 깊이 탐색 결과 유지
    } catch (e) {
      if (e !== TIMEOUT) throw e;
    }
  }
  return toMove(best);
}
