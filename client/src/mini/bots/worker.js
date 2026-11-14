// 봇 계산 Web Worker. 받는 것 {id, game, state, level} → 돌려주는 것 {id, move} (실패하면 {id, error}).
import { pickMove as gomoku } from './gomoku.js';
import { pickMove as connect4 } from './connect4.js';
import { pickMove as reversi } from './reversi.js';
import { pickMove as checkers } from './checkers.js';

const PICK = { gomoku, connect4, reversi, checkers };

self.onmessage = (e) => {
  const { id, game, state, level } = e.data || {};
  try {
    const fn = PICK[game];
    if (!fn) throw new Error('no bot: ' + game);
    self.postMessage({ id, move: fn(state, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
