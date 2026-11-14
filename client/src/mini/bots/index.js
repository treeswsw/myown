// 봇 입구. botMove(game, state, level) → Promise<move>. 최소 400ms 뒤에 돌려주고, 실패하면 무작위 합법 수.
import { GAMES } from '../../../../shared/mini/index.js';

const MIN_MS = 400;
let worker = null;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, move, error } = e.data || {};
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (error || !move) w.reject(new Error(error || 'no move')); else w.resolve(move);
  };
  worker.onerror = () => { // 워커가 죽으면 대기 중인 것을 모두 실패 처리하고 다음에 새로 만든다
    for (const w of waiting.values()) w.reject(new Error('worker'));
    waiting.clear();
    try { worker.terminate(); } catch { /* 무시 */ }
    worker = null;
  };
  return worker;
}

function inWorker(game, state, level) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    try { getWorker().postMessage({ id, game, state, level }); } catch (e) { waiting.delete(id); reject(e); }
  });
}

function randomLegal(game, state) {
  const list = GAMES[game].legalMoves(state);
  return list[Math.floor(Math.random() * list.length)] ?? null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function botMove(game, state, level = 'mid') {
  const t0 = Date.now();
  const calc = game === 'chess'
    ? import('./chess.js').then((m) => m.chessMove(state, level))
    : inWorker(game, state, level);
  return calc
    .then((mv) => (GAMES[game].legalMoves(state).some((l) => same(l, mv) || (mv && l.from && same(l.from, mv.from) && same(l.to, mv.to) && (l.promo ?? null) === (mv.promo ?? null))) ? mv : randomLegal(game, state)))
    .catch(() => randomLegal(game, state))
    .then((mv) => new Promise((res) => setTimeout(() => res(mv), Math.max(0, MIN_MS - (Date.now() - t0)))));
}
