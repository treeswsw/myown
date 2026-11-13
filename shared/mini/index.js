// 미니게임 규칙 모음. 모든 게임이 init / legalMoves / apply 를 가진다 (docs/mini/PLAN.md 2절).
import * as gomoku from './gomoku.js';
import * as reversi from './reversi.js';
import * as checkers from './checkers.js';
import * as chess from './chess.js';
import * as connect4 from './connect4.js';

export const GAMES = { gomoku, reversi, checkers, chess, connect4 };
export const NAMES = { gomoku: '오목', reversi: '리버시', checkers: '체커', chess: '체스', connect4: '커넥트포' };
export const GAME_IDS = Object.keys(GAMES);
