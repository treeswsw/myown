// 커넥트포 봇. pickMove(state, level, deadlineMs) 동기·순수. deadlineMs = 최대 시간(ms, 생략하면 단계별 기본값).
// 내부: 42칸 Int8Array(0 빈칸, 1 = seat0, 2 = seat1), 열 높이, 치환표(열별 7비트 부호화를 합친 수).
import { legalMoves } from '../../../../shared/mini/connect4.js';

const W = 7, H = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const BUDGET = { hard: 1500 };
const DEPTH = { easy: 2, mid: 6 };
const WIN = 100000;
const TIMEOUT = { timeout: true };

// 4칸 창 목록
const WINDOWS = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ex = x + dx * 3, ey = y + dy * 3;
      if (ex < 0 || ex >= W || ey < 0 || ey >= H) continue;
      WINDOWS.push([0, 1, 2, 3].map((k) => (y + dy * k) * W + x + dx * k));
    }
  }
}

function wins(b, x, y, p) {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (const sg of [1, -1]) {
      for (let k = 1; k < 4; k++) {
        const cx = x + dx * k * sg, cy = y + dy * k * sg;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H || b[cy * W + cx] !== p) break;
        n++;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

function evalFor(b, p) {
  let s = 0;
  for (let y = 0; y < H; y++) if (b[y * W + 3] === p) s += 3; else if (b[y * W + 3] === 3 - p) s -= 3;
  for (const w of WINDOWS) {
    let a = 0, c = 0;
    for (let k = 0; k < 4; k++) { const v = b[w[k]]; if (v === p) a++; else if (v !== 0) c++; }
    if (a && !c) s += a === 3 ? 6 : a === 2 ? 2 : 0;
    else if (c && !a) s -= c === 3 ? 6 : c === 2 ? 2 : 0;
  }
  return s;
}

export function pickMove(state, level = 'mid', deadlineMs) {
  const legal = legalMoves(state);
  if (!legal.length) return null;
  const b = new Int8Array(W * H);
  const hts = new Int8Array(W); // 열에 쌓인 돌 수
  const code = new Array(W).fill(1); // 열 부호: 1 에서 시작, 돌마다 *2+플레이어(0/1)
  let key = 0;
  const pow = [1, 128, 16384, 2097152, 268435456, 34359738368, 4398046511104];
  let stones = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.board[y][x] !== null) stones++;
  for (let x = 0; x < W; x++) {
    for (let y = H - 1; y >= 0; y--) {
      const v = state.board[y][x];
      if (v === null) break;
      b[y * W + x] = v + 1; hts[x]++;
      code[x] = code[x] * 2 + v; key += 0; // 키는 아래에서 한 번에
    }
    key += code[x] * pow[x];
  }
  const t0 = Date.now();
  const budget = Math.min(BUDGET[level] ?? 1e9, deadlineMs ?? Infinity);
  const timed = level === 'hard' || deadlineMs !== undefined;
  let nodes = 0;
  const tt = new Map();
  const play = (x, p) => {
    const y = H - 1 - hts[x];
    b[y * W + x] = p; hts[x]++;
    const old = code[x]; code[x] = old * 2 + (p - 1); key += (code[x] - old) * pow[x];
    return y;
  };
  const undo = (x, y) => {
    b[y * W + x] = 0; hts[x]--;
    const old = code[x]; code[x] = old >> 1; key += (code[x] - old) * pow[x];
  };
  const negamax = (depth, alpha, beta, p, ply) => {
    if (timed && (++nodes & 1023) === 0 && Date.now() - t0 > budget) throw TIMEOUT;
    if (depth === 0) return evalFor(b, p);
    const ent = tt.get(key * 2 + (p - 1));
    let a0 = alpha;
    if (ent && ent.d >= depth) {
      if (ent.f === 0) return ent.v;
      if (ent.f === 1 && ent.v > alpha) alpha = ent.v; else if (ent.f === 2 && ent.v < beta) beta = ent.v;
      if (alpha >= beta) return ent.v;
    }
    let best = -Infinity, any = false;
    for (const x of ORDER) {
      if (hts[x] >= H) continue;
      any = true;
      const y = play(x, p);
      let v;
      if (wins(b, x, y, p)) v = WIN - ply;
      else { try { v = -negamax(depth - 1, -beta, -alpha, 3 - p, ply + 1); } catch (e) { undo(x, y); throw e; } }
      undo(x, y);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (!any) return 0;
    tt.set(key * 2 + (p - 1), { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 });
    return best;
  };

  const p = state.turn + 1;
  const cols = ORDER.filter((x) => hts[x] < H);
  const rootBest = (depth) => {
    let bv = -Infinity, bm = cols[0];
    let alpha = -Infinity;
    for (const x of cols) {
      const y = play(x, p);
      let v;
      if (wins(b, x, y, p)) v = WIN;
      else { try { v = -negamax(depth - 1, -Infinity, -alpha, 3 - p, 1); } catch (e) { undo(x, y); throw e; } }
      undo(x, y);
      if (v > bv) { bv = v; bm = x; }
      if (v > alpha) alpha = v;
    }
    return { bm, bv };
  };

  let move = cols[0];
  if (level === 'hard') {
    const maxD = H * W - stones;
    for (let d = 1; d <= maxD; d++) {
      try {
        const r = rootBest(d);
        move = r.bm;
        if (Math.abs(r.bv) >= WIN - 50) break; // 승패가 이미 정해짐
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
    }
  } else {
    try { move = rootBest(DEPTH[level] ?? DEPTH.mid).bm; } catch (e) { if (e !== TIMEOUT) throw e; }
  }
  return { x: move };
}
