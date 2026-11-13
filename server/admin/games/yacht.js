// Admin bot for the yacht room: stub. A later task fills in the brain and skip().
// bot = { id, name, rng(), send(msg), later(ms, fn) }; onMsg gets every server message the bot receives.
export function createBrain(bot) { // eslint-disable-line no-unused-vars
  return {
    onMsg(msg) {}, // eslint-disable-line no-unused-vars
  };
}

// Sets the remaining time of the current phase to 0. true = skipped, false = nothing to skip.
export function skip(room) { // eslint-disable-line no-unused-vars
  return false;
}
