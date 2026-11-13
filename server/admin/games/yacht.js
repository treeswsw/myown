// Admin bot for the yacht room (SPEC 21-3): keeps the most common face, rolls up to 3 times, then presses the
// best empty score cell twice (first press = pick, visible to the room; second = score).
// bot = { id, name, rng(), send(msg), later(ms, fn) }; onMsg gets every server message the bot receives.
import { scoreOf } from '../../../shared/yacht/score.js';
import { CATS } from '../../../shared/yacht/constants.js';

const pause = (bot) => 500 + Math.floor(bot.rng() * 1001); // 500..1500 ms

// What to send next, from the state alone. null = nothing to do. Every step changes the room state.
function nextStep(st, me, rng) {
  if (!st || st.phase !== 'playing' || st.turn !== me) return null;
  const col = st.cols?.find((c) => c.id === me);
  if (!col || col.left) return null;
  const yt = (m) => ({ t: 'yt', ...m });
  if (!st.dice) return yt({ a: 'roll' });
  const values = st.dice.map((d) => d.v);
  if (st.rollsLeft > 0) {
    // keep the most common face (ties: the higher face), put the others back
    const n = [0, 0, 0, 0, 0, 0, 0];
    for (const v of values) n[v]++;
    let target = 1;
    for (let v = 2; v <= 6; v++) if (n[v] >= n[target]) target = v;
    const wrong = st.dice.findIndex((d) => (d.slot != null) !== (d.v === target));
    if (wrong >= 0) return yt({ a: 'keep', i: wrong, on: st.dice[wrong].v === target });
    if (st.dice.some((d) => d.slot == null)) return yt({ a: 'roll' });
  }
  // score: the empty cell with the most points (a tie: random, then stick to the cell already picked)
  const empty = CATS.filter((c) => col.scores[c] == null);
  if (!empty.length) return null;
  const pts = empty.map((c) => scoreOf(c, values));
  const best = Math.max(...pts);
  const cats = empty.filter((c, i) => pts[i] === best);
  const cat = st.pick && cats.includes(st.pick) ? st.pick : cats[Math.floor(rng() * cats.length)];
  return st.pick === cat ? yt({ a: 'score', cat }) : yt({ a: 'pick', cat });
}

export function createBrain(bot) {
  let st = null;
  let waiting = false;
  const plan = () => {
    if (waiting || !nextStep(st, bot.id, () => 0)) return;
    waiting = true;
    bot.later(pause(bot), () => {
      waiting = false;
      const step = nextStep(st, bot.id, bot.rng); // re-check against the newest state
      if (step) bot.send(step);
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

// The yacht room has no timed phase (no turn limit, no auto roll or score). Its only clock is the 60 s grace of a
// dropped person, which is not a game phase, and bots never drop. Nothing to skip.
export function skip(room) { // eslint-disable-line no-unused-vars
  return false;
}
