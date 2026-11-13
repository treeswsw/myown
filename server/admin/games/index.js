// Admin game registry: room.mode -> { createBrain(bot), skip(room) }. A new game adds one line here (SPEC 21-6).
import * as holdem from './holdem.js';
import * as bluff from './bluff.js';
import * as liar from './liar.js';
import * as yacht from './yacht.js';
import * as draw from './draw.js';

export const games = { holdem, bluff, liar, yacht, draw };

const NONE = {
  createBrain: () => ({ onMsg() {} }),
  skip: () => false,
};

// Unknown mode: a bot that does nothing and nothing to skip.
export const gameOf = (mode) => games[mode] ?? NONE;
