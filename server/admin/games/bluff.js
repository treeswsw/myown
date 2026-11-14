// Admin bot for the bluff room (SPEC 21-3): on its turn it plays 1-2 cards, or now and then (~25%) calls LIAR.
// bot = { id, name, rng(), send(msg), later(ms, fn) }; onMsg gets every server message the bot receives.
// The brain only uses what a player is sent in `room` states (turn, myHand, lastPlay).
const LIAR_CHANCE = 0.25;
const pause = (bot) => 500 + Math.floor(bot.rng() * 1001); // 500..1500 ms

export function createBrain(bot) {
  let state = null; // newest room state
  let armedKey = null; // turn the pending timer was set for (never two timers for one turn)

  const myTurn = () => !!state && state.mode === 'bluff' && state.phase === 'playing' && state.turn === bot.id;
  const keyOf = (s) => `${s.round}|${s.myHand.length}|${s.lastPlay ? `${s.lastPlay.by}:${s.lastPlay.count}` : '-'}`;

  function play(hand) {
    const n = Math.min(hand.length, 1 + Math.floor(bot.rng() * 2)); // 1 or 2 cards
    const pool = hand.map((_, i) => i);
    const cards = [];
    for (let k = 0; k < n; k++) cards.push(pool.splice(Math.floor(bot.rng() * pool.length), 1)[0]);
    bot.send({ t: 'play', cards });
  }

  function act(key) {
    armedKey = null;
    if (!myTurn() || keyOf(state) !== key) return; // a newer state arrived: not this turn any more
    const hand = state.myHand;
    if (!state.lastPlay) {
      if (hand.length > 0) play(hand); // empty hand on an open table cannot happen; wait rather than send an illegal request
    } else if (hand.length === 0 || bot.rng() < LIAR_CHANCE) {
      bot.send({ t: 'liar' });
    } else {
      play(hand);
    }
  }

  return {
    onMsg(msg) {
      if (!msg || msg.t !== 'room') return;
      state = msg.state ?? null;
      if (!state || !Array.isArray(state.myHand) || !myTurn()) return;
      const key = keyOf(state);
      if (armedKey === key) return;
      armedKey = key;
      bot.later(pause(bot), () => act(key));
    },
  };
}

// Makes the pending wait fire now: the penalty display before the next round, or the winner display before the lobby.
// `room` is the game object (room.impl, server/poker/room.js); it runs what its 'next' timer would, so the rules stay in the game.
export function skip(room) {
  return room.mode === 'bluff' && typeof room.skipBluff === 'function' && room.skipBluff();
}
