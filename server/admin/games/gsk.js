// Admin bot for the gsk room (SPEC 21-3): one random legal move per situation, drawn with bot.rng (hub.rng).
// It only reads its own view of the room state ({t:'room', state}); the secret of other players never reaches it.
// Requests: {t:'gk', a:'place'|'bid'|'pass'|'flip'|'discard', ...} (docs/gsk/GDD.md 9-1).
const KINDS = ['F', 'S'];
const pickOf = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

// What the bot wants to do now: { key, msg } or null. A pure function of the latest state (rng only chooses among legal moves).
function decide(st, me, rng) {
  if (!st || st.mode !== 'gsk' || st.phase !== 'playing') return null;
  const seat = st.seats?.find((x) => x.id === me);
  if (!seat || seat.out) return null;
  const gk = (msg) => ({ t: 'gk', ...msg });
  const tag = `${st.gameNo}:${st.round}:${st.step}`;
  const hand = st.mine?.hand;
  switch (st.step) {
    case 'setup': {
      if (seat.placed || !hand) return null;
      const k = pickOf(rng, KINDS.filter((x) => hand[x] > 0));
      return k ? { key: `${tag}:place`, msg: gk({ a: 'place', k }) } : null;
    }
    case 'turn': {
      if (st.turn !== me || !hand) return null;
      const kinds = KINDS.filter((x) => hand[x] > 0);
      const total = st.total | 0;
      if (kinds.length && (total < 1 || rng() < 0.6)) return { key: `${tag}:turn:${seat.stack}`, msg: gk({ a: 'place', k: pickOf(rng, kinds) }) };
      if (total < 1) return null;
      return { key: `${tag}:turn:${seat.stack}`, msg: gk({ a: 'bid', n: 1 + (Math.floor(rng() * total) % total) }) };
    }
    case 'bid': {
      if (st.turn !== me || !st.bid) return null;
      const total = st.total | 0;
      const floor = st.bid.n;
      if (floor < total && rng() < 0.4) {
        return { key: `${tag}:bid:${floor}`, msg: gk({ a: 'bid', n: floor + 1 + (Math.floor(rng() * (total - floor)) % (total - floor)) }) };
      }
      return { key: `${tag}:bid:${floor}`, msg: gk({ a: 'pass' }) };
    }
    case 'flip': {
      if (st.challenger !== me || st.turn !== me || st.endsAt != null) return null; // endsAt = the automatic flip of my own pile is pending
      const open = st.seats.filter((x) => x.id !== me && !x.out && x.shown.length < x.stack);
      if (!open.length) return null;
      return { key: `${tag}:flip:${st.flipped}`, msg: gk({ a: 'flip', p: pickOf(rng, open).id }) };
    }
    case 'penalty': {
      if (st.penalty?.by !== me || !st.mine) return null;
      const n = { F: hand.F, S: hand.S };
      for (const k of st.mine.stack) n[k]++;
      const kinds = KINDS.filter((x) => n[x] > 0);
      return kinds.length ? { key: `${tag}:discard`, msg: gk({ a: 'discard', k: pickOf(rng, kinds) }) } : null;
    }
    default:
      return null;
  }
}

export function createBrain(bot) {
  let state = null;
  let scheduled = null; // key of the move waiting to be sent
  let sent = null; // key of the move already sent
  const consider = (delay) => {
    const want = decide(state, bot.id, bot.rng);
    if (!want || want.key === sent || want.key === scheduled) return;
    scheduled = want.key;
    bot.later(delay ?? 500 + Math.floor(bot.rng() * 1000), () => {
      if (scheduled !== want.key) return;
      scheduled = null;
      const now = decide(state, bot.id, bot.rng); // still allowed on the newest state?
      if (!now || now.key !== want.key) return;
      sent = now.key;
      bot.send(now.msg);
    });
  };
  return {
    onMsg(msg) {
      if (!msg) return;
      if (msg.t === 'room') {
        state = msg.state ?? null;
        consider();
      } else if (msg.t === 'error' && sent) {
        // e.g. a flip animation is still running (gk_now): the same move may be tried again a little later
        sent = null;
        consider(1000);
      }
    },
  };
}

// The pending timers (automatic flip, reveal, between rounds) belong to the engine's one clock (nextDeadline).
// Skipping would need an engine hook; not offered.
export function skip(room) { // eslint-disable-line no-unused-vars
  return false;
}
