import { h, avatar, cardEl, fmt } from '../ui/dom.js';
import { tween, ease, sleep } from './tween.js';
import { countUp } from './fx.js';
import { sfx } from '../audio.js';

const HOLD_MS = 4000; // how long the winning hand stays on screen (shorter per winner on ties)
const TIE_HOLD_MS = 2500;

// The row shown to the player: winner's photo, their two hole cards | the five community cards.
// The five cards that make the hand rise one by one with a gold frame, the other two sink and darken.
function handRow(w, who, room) {
  const hole = room.result?.shown?.[w.id] ?? who.cards ?? [];
  const best = new Set(w.cards);
  let n = 0;
  const card = (c) => {
    const el = cardEl(c, best.has(c) ? 'valid' : 'invalid');
    if (best.has(c)) el.style.setProperty('--d', `${0.5 + 0.25 * n++}s`);
    return el;
  };
  return h('div', 'show', avatar(who, 'pav'), h('div', 'cardrow', hole.map(card)), h('div', 'gap'), h('div', 'cardrow', room.board.map(card)));
}

// Showdown (SPEC 15): winner close-up and stand-up, hand row, "name WINS +amount", then the pot flies
// to the winner. Without a showdown only the emphasis, text and pot flight remain.
export async function playWin({ ui, stage, table, pins, cluster, special, getRoom, setDim }, e) {
  const room = getRoom();
  const winners = e.winners ?? room?.result?.winners ?? [];
  if (!winners.length || !room) return;
  const showdown = winners.some((w) => w.cards?.length > 0);
  const who = (w) => room.players.find((p) => p.id === w.id) ?? { name: w.id };
  const fancy = !stage.isLowPower();

  pins.emphasize(winners.map((w) => w.id));
  sfx.win();

  if (showdown) {
    const best = winners.flatMap((w) => w.cards ?? []);
    table.highlight(best);
    cluster.highlight(best);
    setDim(true);
    if (fancy) stage.pushIn(table.head(winners[0].id), 0.7, 1200);
    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      let cur = 0;
      const lift = (to, ms) => { const from = cur; cur = to; return tween(ms, (k) => pins.setLift(w.id, from + (to - from) * k), ease.out); };
      const standing = fancy ? (special.skipAll(), special.playStand(w.id, { onUp: (dy) => lift(dy, 400), onDown: () => lift(0, 300) })) : Promise.resolve();
      if (i === 0) await sleep(1200); // the close-up comes first
      const overlay = h('div', `win ${winners.length > 1 ? 'small' : ''}`, h('div', 'sc',
        h('div', 'ko wt', w.handName ?? ''), handRow(w, who(w), room),
        h('div', 'ws', h('div', 'w', h('span', 'ko', who(w).name), h('span', 'num', 'WINS'), h('span', 'num', `+${fmt(w.amount)}`)))));
      ui.append(overlay);
      await sleep(winners.length > 1 ? TIE_HOLD_MS : HOLD_MS);
      overlay.classList.add('out');
      await Promise.all([sleep(400), standing]);
      overlay.remove();
      pins.setLift(w.id, 0);
    }
  } else {
    const overlay = h('div', 'win small', h('div', 'sc', h('div', 'ws', winners.map((w) => h('div', 'w', h('span', 'ko', who(w).name), h('span', 'num', 'WINS'), h('span', 'num', `+${fmt(w.amount)}`))))));
    ui.append(overlay);
    await sleep(1800);
    overlay.classList.add('out');
    await sleep(400);
    overlay.remove();
  }

  pins.clearHands();
  setDim(false);
  const counts = winners.map((w) => {
    const to = who(w).stack ?? 0;
    const from = Math.max(0, to - w.amount);
    pins.setStack(w.id, from);
    return countUp(from, to, 900, (v) => pins.setStack(w.id, v));
  });
  await Promise.all([table.payout(winners), stage.pushIn(null, 0, 1200), ...counts]);
  winners.forEach((w) => pins.setStack(w.id, null));
}
