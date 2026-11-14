// 오목 봇. pickMove(state, level, deadlineMs) 동기·순수. deadlineMs = 쓸 수 있는 최대 시간(ms, 생략하면 단계별 기본값).
// 내부: 15x15 Int8Array (0 빈칸, 1 = seat0, 2 = seat1). 결과는 PLAN 2절 수 {x,y}.
import { legalMoves, apply } from '../../../../shared/mini/gomoku.js';

const N = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const BUDGET = { easy: 300, mid: 800, hard: 2500 };
const WIN = 1e6;
const TIMEOUT = { timeout: true };

function toBoard(s) {
  const b = new Int8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = s.board[y][x]; b[y * N + x] = v === null ? 0 : v + 1; }
  return b;
}

// (x,y) 에 p 를 두면 얻는 한 칸 점수: 4방향 이어진 돌 수 + 양끝 열림.
function cellScore(b, x, y, p) {
  let tot = 0;
  for (const [dx, dy] of DIRS) {
    let n = 1, open = 0;
    for (const sg of [1, -1]) {
      let cx = x + dx * sg, cy = y + dy * sg;
      while (cx >= 0 && cy >= 0 && cx < N && cy < N && b[cy * N + cx] === p) { n++; cx += dx * sg; cy += dy * sg; }
      if (cx >= 0 && cy >= 0 && cx < N && cy < N && b[cy * N + cx] === 0) open++;
    }
    if (n >= 5) tot += 100000;
    else if (n === 4) tot += open === 2 ? 10000 : open === 1 ? 1000 : 0;
    else if (n === 3) tot += open === 2 ? 1000 : open === 1 ? 100 : 0;
    else if (n === 2) tot += open === 2 ? 100 : open === 1 ? 10 : 0;
    else tot += open === 2 ? 5 : open === 1 ? 1 : 0;
  }
  return tot;
}
const makes5 = (b, x, y, p) => {
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (const sg of [1, -1]) {
      let cx = x + dx * sg, cy = y + dy * sg;
      while (cx >= 0 && cy >= 0 && cx < N && cy < N && b[cy * N + cx] === p) { n++; cx += dx * sg; cy += dy * sg; }
    }
    if (n >= 5) return true;
  }
  return false;
};

const WTAB = [0, 1, 12, 130, 1500, WIN];
// 판 전체 점수(p 입장 - 상대 입장): 5칸 창마다 한쪽 돌만 있으면 개수로 점수.
function evalBoard(b, p) {
  let me = 0, op = 0;
  for (const [dx, dy] of DIRS) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ex = x + dx * 4, ey = y + dy * 4;
        if (ex < 0 || ey < 0 || ex >= N || ey >= N) continue;
        let a = 0, c = 0;
        for (let k = 0; k < 5; k++) { const v = b[(y + dy * k) * N + x + dx * k]; if (v === p) a++; else if (v !== 0) c++; }
        if (a && !c) me += WTAB[a];
        else if (c && !a) op += WTAB[c];
      }
    }
  }
  return me - op * 1.1;
}

function makeCtx(s) {
  const b = toBoard(s);
  const near = new Int16Array(N * N); // 칸 주변 2칸 안의 돌 수
  let stones = 0;
  const bump = (x, y, d) => {
    for (let yy = Math.max(0, y - 2); yy <= Math.min(N - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(N - 1, x + 2); xx++) near[yy * N + xx] += d;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b[y * N + x]) { bump(x, y, 1); stones++; }
  return { b, near, stones, bump };
}

function candidates(ctx, p, k) {
  const { b, near } = ctx;
  const out = [];
  const q = 3 - p;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (b[i] !== 0 || near[i] === 0) continue;
      out.push({ x, y, sc: cellScore(b, x, y, p) + cellScore(b, x, y, q) * 0.95 });
    }
  }
  out.sort((a, c) => c.sc - a.sc);
  return k ? out.slice(0, k) : out;
}

export function pickMove(state, level = 'mid', deadlineMs) {
  const legal = legalMoves(state);
  if (!legal.length) return null;
  const budget = Math.min(BUDGET[level] ?? BUDGET.mid, deadlineMs ?? Infinity);
  const t0 = Date.now();
  const p = state.turn + 1, q = 3 - p;
  const ctx = makeCtx(state);
  const { b } = ctx;
  const ok = (m) => apply(state, m) !== null; // 렌주룰 금수 거르기
  if (ctx.stones === 0) return legal.find((m) => m.x === 7 && m.y === 7) || legal[0];

  const cands = candidates(ctx, p).filter(ok);
  if (!cands.length) return legal.find(ok) || legal[0];
  const pick = (m) => ({ x: m.x, y: m.y });
  // 이기는 수 / 막아야 할 수 (easy 는 막기만 점수에 맡긴다)
  const w = cands.find((m) => makes5(b, m.x, m.y, p));
  if (w) return pick(w);
  if (level !== 'easy') {
    const blk = cands.find((m) => cellScore(b, m.x, m.y, q) >= 100000);
    if (blk) return pick(blk);
  }
  if (level === 'easy') { // 깊이 1: 점수 순, 가끔 차선
    if (cands.length > 1 && Math.random() < 0.3) return pick(cands[1 + Math.floor(Math.random() * Math.min(2, cands.length - 1))]);
    return pick(cands[0]);
  }

  let nodes = 0;
  const tick = () => { if ((++nodes & 127) === 0 && Date.now() - t0 > budget) throw TIMEOUT; };
  const K = level === 'hard' ? 10 : 12;
  const search = (depth, alpha, beta, pl) => { // negamax: pl 입장 점수
    tick();
    if (depth === 0) return evalBoard(b, pl);
    const cs = candidates(ctx, pl, K);
    if (!cs.length) return 0;
    let best = -Infinity;
    for (const m of cs) {
      if (makes5(b, m.x, m.y, pl)) return WIN + depth;
    }
    for (const m of cs) {
      const i = m.y * N + m.x;
      b[i] = pl; ctx.bump(m.x, m.y, 1);
      let v;
      try { v = -search(depth - 1, -beta, -alpha, 3 - pl); } finally { b[i] = 0; ctx.bump(m.x, m.y, -1); }
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  const maxD = level === 'hard' ? 4 : 2;
  const rootC = cands.slice(0, K);
  let bestMove = rootC[0];
  for (let d = 2; d <= maxD; d += 2) {
    try {
      let bm = null, bv = -Infinity;
      for (const m of rootC) {
        const i = m.y * N + m.x;
        b[i] = p; ctx.bump(m.x, m.y, 1);
        let v;
        try { v = -search(d - 1, -Infinity, -bv, q); } finally { b[i] = 0; ctx.bump(m.x, m.y, -1); }
        if (v > bv) { bv = v; bm = m; }
      }
      if (bm) { bestMove = bm; rootC.sort((a, c) => (a === bm ? -1 : c === bm ? 1 : 0)); }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }
  return pick(bestMove);
}
