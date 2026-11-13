// Admin bot for the holdem room (SPEC 21-3): simple legal moves from the state the server sends a player.
// bot = { id, name, rng(), send(msg), later(ms, fn) }; onMsg gets every server message the bot receives.
// The bot only reads its own view: state.turn === state.you means it may act; toCall / minRaiseTo / maxRaiseTo
// say what is legal (minRaiseTo 0 = raising is not allowed right now).
export function createBrain(bot) {
  let state = null; // latest room state this bot received
  let planned = false; // a move is already scheduled; newer states do not schedule a second one

  // Always a legal choice: check when free, otherwise call; raises about 10% of the time (when legal) and folds
  // only against a big bet (more than a third of its chips, about 30%). No voluntary all-in: a call that needs
  // every chip is the all-in the rules allow.
  const pick = (o, stack) => {
    const r = bot.rng();
    const canRaise = o.minRaiseTo > 0;
    const raise = () => {
      const span = o.maxRaiseTo - o.minRaiseTo;
      const extra = span > 0 ? Math.floor((bot.rng() * Math.min(span, 300)) / 50) * 50 : 0;
      return { a: 'raise', amount: Math.min(o.minRaiseTo + extra, o.maxRaiseTo) };
    };
    if (o.toCall === 0) return canRaise && r < 0.1 ? raise() : { a: 'check' };
    if (o.toCall * 3 > stack && r < 0.3) return { a: 'fold' };
    if (canRaise && o.toCall * 3 <= stack && bot.rng() < 0.1) return raise();
    return { a: 'call' };
  };

  const myTurn = (s) => !!s && s.mode === 'holdem' && s.phase === 'playing' && s.turn != null && s.turn === s.you;

  const plan = () => {
    if (planned) return;
    planned = true;
    bot.later(500 + Math.floor(bot.rng() * 1000), () => {
      planned = false;
      if (!myTurn(state)) return; // the turn moved on while waiting
      const stack = state.players?.find((p) => p.id === bot.id)?.stack ?? 0;
      bot.send({ t: 'act', ...pick(state, stack) });
    });
  };

  return {
    onMsg(msg) {
      if (!msg || msg.t !== 'room' || !msg.state) return;
      state = msg.state;
      if (myTurn(state)) plan();
    },
  };
}

// Makes the hand-result display (the only timed wait of a holdem room) end now: the next hand starts,
// or the champion lobby when a bust left one player. The room's own timer is cancelled and its callback is run.
export function skip(room) {
  if (room.mode !== 'holdem' || room.phase !== 'result' || room.timers.next === null) return false;
  const busted = (room.result?.busted?.length ?? 0) > 0;
  room.clearTimer('next');
  room.hub.guard(() => room.afterResult(busted))();
  return true;
}
