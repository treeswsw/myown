// Admin game registry: room.mode -> { createBrain(bot), skip(room) }, built from server/games.js `bot` (SPEC 21-6).
// A plain object so tests can swap a brain. Games with `bot: false` are not listed (adm bot+ -> adm_nobot).
import { SERVER_GAMES } from '../../games.js';

export const games = Object.fromEntries(Object.entries(SERVER_GAMES).filter(([, e]) => e.bot).map(([mode, e]) => [mode, e.bot]));

const NONE = {
  createBrain: () => ({ onMsg() {} }),
  skip: () => false,
};

// Unknown mode: a bot that does nothing and nothing to skip.
export const gameOf = (mode) => games[mode] ?? NONE;

// The registry says this game has no admin bot.
export const noBot = (mode) => SERVER_GAMES[mode]?.bot === false;
