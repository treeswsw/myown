// Admin bot for the draw room (갱식마인드, SPEC 21-3). The brain only reacts to what a player is sent:
//   {t:'room', state}  (docs/draw/GDD.md 10-4, the bot's own view).
// Drawer: pick the first word, then draw a few short strokes ({t:'dr', a:'st'|'pt'}). Guesser: now and then chat
// a random word from the word list (a wrong guess; a lucky right one is a normal hit). It never starts the game
// or changes settings: the admin (host) does that like a person.
import { readFileSync } from 'node:fs';

const STROKES = 3; // strokes a drawing bot makes per question
const WRONG_GUESS_CHANCE = 0.3;

let wordCache = null;
function words() {
  if (wordCache) return wordCache;
  try { // read-only; server/liar/words.json is never changed
    const json = JSON.parse(readFileSync(new URL('../../liar/words.json', import.meta.url), 'utf8'));
    wordCache = json.sets.mine.topics.flatMap((t) => t.words.map((e) => e.w))
      .filter((w) => typeof w === 'string' && w.length >= 1 && [...w].length <= 40);
  } catch {
    wordCache = [];
  }
  if (wordCache.length === 0) wordCache = ['사과'];
  return wordCache;
}

export function createBrain(bot) {
  let state = null; // latest room state (the bot's own view)
  let planned = ''; // "<phase>:<q>" whose action chain is already scheduled

  const pause = () => 500 + Math.floor(bot.rng() * 1000);
  const pick = (n) => Math.min(n - 1, Math.floor(bot.rng() * n));
  const same = (phase, q) => !!state && state.phase === phase && state.q === q;
  const iDraw = () => !!state && state.drawerId === bot.id;

  function planPick(q) {
    bot.later(pause(), () => {
      if (!same('pick', q) || !iDraw() || !state.choices) return;
      bot.send({ t: 'dr', a: 'pick', i: 0 });
    });
  }

  function stroke(q, n) {
    if (n >= STROKES) return;
    bot.later(pause(), () => {
      if (!same('draw', q) || !iDraw()) return;
      // short stroke: [x0, y0, dx1, dy1, ...], inside the 1600x1200 board, small deltas
      const p = [300 + pick(1000), 250 + pick(700)];
      let dx = pick(61) - 30;
      let dy = pick(61) - 30;
      for (let i = 0; i < 6; i++) {
        dx = Math.max(-40, Math.min(40, dx + pick(21) - 10));
        dy = Math.max(-40, Math.min(40, dy + pick(21) - 10));
        p.push(dx, dy);
      }
      bot.send({ t: 'dr', a: 'st', c: pick(12), w: 10, e: 0, p });
      bot.send({ t: 'dr', a: 'pt', p: [], f: 1 });
      stroke(q, n + 1);
    });
  }

  function guess(q) {
    bot.later(pause(), () => {
      if (!same('draw', q) || iDraw()) return;
      const me = state.players.find((p) => p.id === bot.id);
      if (!me || me.hit) return; // already hit: stay quiet
      if (bot.rng() < WRONG_GUESS_CHANCE) {
        const list = words();
        bot.send({ t: 'chat', text: list[pick(list.length)] });
      }
      guess(q);
    });
  }

  function onRoom(next) {
    state = next;
    if (!state) { planned = ''; return; }
    const key = `${state.phase}:${state.q}`;
    if (key === planned) return;
    if (state.phase === 'pick') {
      if (iDraw()) { planned = key; planPick(state.q); }
    } else {
      planned = key;
      if (state.phase === 'draw') {
        if (iDraw()) stroke(state.q, 0);
        else guess(state.q);
      }
    }
  }

  return {
    onMsg(msg) {
      if (msg && msg.t === 'room') onRoom(msg.state ?? null);
    },
  };
}

// Makes the pending timed wait (pick, draw or reveal) end now. `game` is the room's game object (room.impl): it moves the
// deadline to "now" and ticks the engine. false = nothing to skip (lobby, final).
export function skip(game) {
  return game?.skipNow?.() ?? false;
}
