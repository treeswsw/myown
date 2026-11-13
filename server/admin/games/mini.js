// Admin bot for the mini room (SPEC 21-3): on its turn it plays a random legal move (bot.rng = hub.rng).
// It never starts the game or changes settings (the admin, the host, does that) and always bets 0.
// bot = { id, name, rng(), send(msg), later(ms, fn) }; onMsg gets every server message the bot receives.
import { GAMES } from '../../../shared/mini/index.js';

const pause = (bot) => 500 + Math.floor(bot.rng() * 1001); // 500..1500 ms

// A random move that the rules accept (renju forbidden cells are filtered by apply). null = none / not my turn.
function pickMove(st, rng) {
  if (!st || st.phase !== 'play' || !st.mn || st.mySeat < 0 || st.mn.turn !== st.mySeat) return null;
  const rules = GAMES[st.game];
  if (!rules) return null;
  const ok = rules.legalMoves(st.mn).filter((m) => rules.apply(st.mn, m));
  return ok.length ? ok[Math.min(ok.length - 1, Math.floor(rng() * ok.length))] : null;
}

export function createBrain(bot) {
  let st = null;
  let waiting = false;
  const plan = () => {
    if (waiting || !pickMove(st, () => 0)) return;
    waiting = true;
    bot.later(pause(bot), () => {
      waiting = false;
      const move = pickMove(st, bot.rng); // re-check against the newest state
      if (move) bot.send({ t: 'mn', a: 'move', move });
    });
  };
  return {
    onMsg(msg) {
      if (!msg || msg.t !== 'room') return;
      st = msg.state ?? null;
      if (st) plan();
    },
  };
}

// The only timed phase is the pause between two games of a match: ends it now. false = nothing to skip.
export function skip(game) {
  return game?.skipNow?.() ?? false;
}
