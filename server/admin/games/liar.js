// Admin bot for the liar room (SPEC 21-3). The bot only reads what the server sends a player ({t:'room', state}).
// It acts the same whether it is the liar or not: the only role-specific move is the final word guess, which the
// rules give to the liar alone (and the server reveals the role to the liar only in the unmask/guess phases).
// Requests: {t:'lg', a:'say'|'vote'|'judge'|'guess', ...} (GDD 9-1).

const SAYS = ['음 글쎄요', '자주 보는 거예요', '저는 좋아해요', '다들 아시죠?', '떠오르는 게 있어요', '흔하진 않죠'];
const GUESSES = ['모르겠다', '사과', '도서관', '자전거', '바다'];

const pickOf = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

export function createBrain(bot) {
  let state = null; // latest room state this bot was sent
  const scheduled = new Set(); // action keys already scheduled (an action is sent at most once)

  // What this bot should do now: { key, msg } or null. A pure function of the latest state.
  const decide = () => {
    const s = state;
    if (!s || s.mode !== 'liar') return null;
    const me = s.players?.find((p) => p.id === bot.id);
    if (!me || me.spectating) return null;
    const round = `${s.round}:`;
    const others = s.players.filter((p) => p.id !== bot.id && !p.spectating).map((p) => p.id);
    switch (s.phase) {
      case 'speak':
        if (s.speaker === bot.id && !s.speakDone) {
          return { key: `${round}say`, msg: { t: 'lg', a: 'say', text: pickOf(bot.rng, SAYS) } };
        }
        return null;
      case 'discuss':
      case 'revote': {
        if (s.votes?.[bot.id]) return null;
        const pool = s.phase === 'revote' && s.candidates ? s.candidates.filter((id) => id !== bot.id) : others;
        if (!pool.length) return null;
        return { key: `${round}vote:${s.phase}:${s.accuseNo}`, msg: { t: 'lg', a: 'vote', target: pickOf(bot.rng, pool) } };
      }
      case 'judge':
        if (s.accused === bot.id || s.judge?.picks?.[bot.id]) return null;
        return { key: `${round}judge:${s.accuseNo}`, msg: { t: 'lg', a: 'judge', v: bot.rng() < 0.5 ? 'yes' : 'no' } };
      case 'guess':
        // Only the liar may guess; the server tells the liar its role at this point.
        if (s.my?.role !== 'liar' || s.guess) return null;
        return { key: `${round}guess`, msg: { t: 'lg', a: 'guess', text: pickOf(bot.rng, [s.my.word, s.topic, ...GUESSES].filter(Boolean)) } };
      default:
        return null;
    }
  };

  const consider = () => {
    const want = decide();
    if (!want || scheduled.has(want.key)) return;
    scheduled.add(want.key);
    bot.later(500 + Math.floor(bot.rng() * 1000), () => {
      const now = decide(); // still my turn / still allowed?
      if (now && now.key === want.key) bot.send(now.msg);
    });
  };

  return {
    onMsg(msg) {
      if (!msg || msg.t !== 'room') return;
      state = msg.state ?? null;
      consider();
    },
  };
}

// Makes the pending game timer fire now: the current phase (or the current speaker's turn) ends at once and the
// engine's own tick moves on. Nothing to skip in the lobby, the result, or when no timer is pending.
export function skip(room) {
  const g = room.game;
  if (!g || g.phase === 'result' || room.timers.game === null || room.timers.game === undefined) return false;
  g.phaseEndsAt = room.hub.now();
  g.pendingShortenAt = null;
  room.clearTimer('game');
  room.onTimer();
  return true;
}
