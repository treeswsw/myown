// 체스 봇: Stockfish 19 lite-single (client/public/stockfish/) 을 Web Worker 로 UCI 구동. 처음 부를 때만 받는다.
import { legalMoves } from '../../../../shared/mini/chess.js';
import { stateToFen, uciToMove } from './fen.js';

const LEVELS = {
  easy: { skill: 0, ms: 50, random: 0.3 },
  mid: { skill: 8, ms: 300, random: 0 },
  hard: { skill: 20, ms: 1000, random: 0 },
};
const SRC = `${import.meta.env?.BASE_URL ?? '/'}stockfish/stockfish-19-lite-single.js`;

let engine = null; // { w, ready, listener } 한 번 만들어 재사용
let queue = Promise.resolve(); // 한 번에 한 계산만

function start() {
  const w = new Worker(SRC);
  const e = { w, listener: null, ready: null };
  w.onmessage = (ev) => e.listener?.(String(ev.data));
  e.ready = new Promise((resolve, reject) => {
    w.onerror = (err) => { if (engine === e) engine = null; reject(err); };
    e.listener = (line) => {
      if (line === 'uciok') w.postMessage('isready');
      else if (line === 'readyok') { e.listener = null; resolve(); }
    };
    w.postMessage('uci');
  });
  return e;
}

function ask(e, cmds, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { e.listener = null; reject(new Error('timeout')); }, ms + 15000);
    e.listener = (line) => {
      if (!line.startsWith('bestmove')) return;
      clearTimeout(timer);
      e.listener = null;
      resolve(line.split(' ')[1]);
    };
    for (const c of cmds) e.w.postMessage(c);
  });
}

const sameSq = (a, b) => a.x === b.x && a.y === b.y;
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

export function chessMove(state, level = 'mid') {
  const cfg = LEVELS[level] ?? LEVELS.mid;
  const legal = legalMoves(state);
  if (!legal.length) return Promise.resolve(null);
  const run = async () => {
    if (cfg.random && Math.random() < cfg.random) return pickRandom(legal);
    try {
      engine ??= start();
      const e = engine;
      await e.ready;
      const best = await ask(e, [
        `setoption name Skill Level value ${cfg.skill}`,
        `position fen ${stateToFen(state)}`,
        `go movetime ${cfg.ms}`,
      ], cfg.ms);
      const m = uciToMove(best);
      const hit = m && legal.find((l) => sameSq(l.from, m.from) && sameSq(l.to, m.to) && (l.promo ?? null) === (m.promo ?? null));
      return hit ?? pickRandom(legal);
    } catch {
      if (engine) { try { engine.w.terminate(); } catch { /* 무시 */ } engine = null; }
      return pickRandom(legal);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
