// 체커 봇. pickMove(state, level, deadlineMs) 동기·순수. deadlineMs = 최대 시간(ms, 생략하면 단계별 기본값).
// 내부: 64칸 Int8Array(0 빈칸, 1 seat0 말, 2 seat0 킹, 3 seat1 말, 4 seat1 킹). 한 번의 "턴" 단위(연속 점프 한 묶음)로 탐색하고,
// 돌려줄 때는 첫 한 칸 {from,to} 만 낸다(다음 칸은 state.chain 으로 다시 불린다).
import { legalMoves } from '../../../../shared/mini/checkers.js';

const N = 8;
const DEPTH = { easy: 2, mid: 5, hard: 8 };
const BUDGET = { hard: 1000 };
const TIMEOUT = { timeout: true };
const WIN = 100000;

const owner = (v) => (v === 0 ? -1 : v <= 2 ? 0 : 1);
const isKing = (v) => v === 2 || v === 4;

// 한 턴에 둘 수 있는 전체 수: {path:[칸...], caps:[칸...]}. chain 이 있으면 그 말의 점프만.
function genTurns(b, p, chain) {
  const caps = [];
  const walk = (pos, v, path, took) => {
    let more = false;
    const x = pos & 7, y = pos >> 3;
    const dys = isKing(v) ? [-1, 1] : p === 0 ? [-1] : [1];
    for (const dy of dys) {
      for (const dx of [-1, 1]) {
        const ox = x + dx, oy = y + dy, tx = x + 2 * dx, ty = y + 2 * dy;
        if (tx < 0 || tx >= N || ty < 0 || ty >= N) continue;
        const ov = b[oy * N + ox];
        if (ov === 0 || owner(ov) === p || b[ty * N + tx] !== 0) continue;
        more = true;
        const oi = oy * N + ox, ti = ty * N + tx;
        b[oi] = 0; b[pos] = 0; // 잡은 말과 출발 칸을 비움
        const crown = !isKing(v) && ty === (p === 0 ? 0 : N - 1);
        const nv = crown ? v + 1 : v;
        b[ti] = nv;
        if (crown) caps.push({ path: [...path, ti], caps: [...took, oi] });
        else walk(ti, nv, [...path, ti], [...took, oi]);
        b[ti] = 0; b[pos] = v; b[oi] = ov;
      }
    }
    if (!more && took.length) caps.push({ path, caps: took });
  };
  if (chain !== null && chain !== undefined) {
    walk(chain, b[chain], [chain], []);
    return caps.filter((m) => m.caps.length);
  }
  for (let i = 0; i < 64; i++) if (b[i] && owner(b[i]) === p) walk(i, b[i], [i], []);
  if (caps.length) return caps;
  const steps = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v || owner(v) !== p) continue;
    const x = i & 7, y = i >> 3;
    for (const dy of isKing(v) ? [-1, 1] : p === 0 ? [-1] : [1]) {
      for (const dx of [-1, 1]) {
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || tx >= N || ty < 0 || ty >= N || b[ty * N + tx] !== 0) continue;
        steps.push({ path: [i, ty * N + tx], caps: [] });
      }
    }
  }
  return steps;
}

function doTurn(b, p, m) {
  const nb = b.slice();
  const from = m.path[0], to = m.path[m.path.length - 1];
  let v = nb[from];
  nb[from] = 0;
  for (const c of m.caps) nb[c] = 0;
  if (!isKing(v) && (to >> 3) === (p === 0 ? 0 : N - 1)) v += 1;
  nb[to] = v;
  return nb;
}

function evalFor(b, p) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const o = owner(v), x = i & 7, y = i >> 3;
    let val;
    if (isKing(v)) val = 160 + (3 - Math.abs(x - 3.5)) + (3 - Math.abs(y - 3.5));
    else {
      const adv = o === 0 ? 7 - y : y; // 전진한 정도
      val = 100 + adv * 4 + (adv === 0 ? 8 : 0) + (x === 0 || x === 7 ? 2 : 0);
    }
    s += o === p ? val : -val;
  }
  return s;
}

export function pickMove(state, level = 'mid', deadlineMs) {
  const legal = legalMoves(state);
  if (!legal.length) return null;
  const b = new Int8Array(64);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = state.board[y][x];
      if (c) b[y * N + x] = (c.p === 0 ? 1 : 3) + (c.k ? 1 : 0);
    }
  }
  const p = state.turn;
  const chain = state.chain ? state.chain.y * N + state.chain.x : null;
  const toStep = (m) => ({ from: { x: m.path[0] & 7, y: m.path[0] >> 3 }, to: { x: m.path[1] & 7, y: m.path[1] >> 3 } });
  const turns = genTurns(b, p, chain);
  if (!turns.length) return legal[0];
  if (turns.length === 1) return toStep(turns[0]);

  const t0 = Date.now();
  const budget = Math.min(BUDGET[level] ?? 1e9, deadlineMs ?? Infinity);
  const timed = level === 'hard' || deadlineMs !== undefined;
  let nodes = 0;
  const search = (bd, pl, depth, alpha, beta, ply) => { // negamax: pl 입장
    if (timed && (++nodes & 255) === 0 && Date.now() - t0 > budget) throw TIMEOUT;
    const ts = genTurns(bd, pl, null);
    if (!ts.length) return -WIN + ply;
    if (depth === 0) return evalFor(bd, pl);
    ts.sort((a, c) => c.caps.length - a.caps.length);
    let best = -Infinity;
    for (const m of ts) {
      const v = -search(doTurn(bd, pl, m), 1 - pl, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  const run = (d) => {
    let bv = -Infinity, bm = turns[0];
    for (const m of turns) {
      const v = -search(doTurn(b, p, m), 1 - p, d - 1, -Infinity, -bv, 1);
      if (v > bv) { bv = v; bm = m; }
    }
    return bm;
  };

  let best = turns[0];
  if (level === 'hard') {
    for (let d = 1; d <= DEPTH.hard; d++) {
      try { best = run(d); } catch (e) { if (e !== TIMEOUT) throw e; break; }
    }
  } else {
    try { best = run(DEPTH[level] ?? DEPTH.mid); } catch (e) { if (e !== TIMEOUT) throw e; }
    if (level === 'easy' && Math.random() < 0.2) best = turns[Math.floor(Math.random() * turns.length)];
  }
  return toStep(best);
}
