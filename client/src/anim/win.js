import { h, avatar, cardEl, fmt } from '../ui/dom.js';
import { tween, ease, sleep } from './tween.js';
import { countUp } from './fx.js';
import { sfx } from '../audio.js';

// Showdown announcement: winners' photos and best five cards are emphasised on the table, the winner stands
// up, the hand name and "name wins +amount" are shown, then the pot flies to the winner's stack.
export async function playWin({ ui, stage, table, pins, cluster, special, getRoom }, e) {
  const room = getRoom();
  const winners = e.winners ?? room?.result?.winners ?? [];
  if (!winners.length || !room) return;
  const top = winners[0];
  const who = (w) => room.players.find((p) => p.id === w.id) ?? { name: w.id };
  const best = winners.flatMap((w) => w.cards ?? []);

  pins.emphasize(winners.map((w) => w.id));
  if (best.length) { table.highlight(best); cluster.highlight(best); }
  sfx.win();

  // Body sequences are skipped on slow devices and in reduced motion; the emphasis alone still reads clearly.
  let cur = 0;
  const lift = (to, ms) => { const from = cur; cur = to; return tween(ms, (k) => pins.setLift(top.id, from + (to - from) * k), ease.out); };
  const stand = stage.isLowPower()
    ? sleep(1500)
    : (special.skipAll(), special.playStand(top.id, { onUp: (dy) => lift(dy, 400), onDown: () => lift(0, 300) }));

  const showCards = top.cards?.length > 0;
  const wins = winners.map((w) => h('div', 'w', avatar(who(w), 'pav'), h('span', 'ko', `${who(w).name} 승리`), h('span', 'num', `+${fmt(w.amount)}`)));
  const overlay = h('div', `win ${winners.length > 1 ? 'small' : ''}`,
    showCards ? [h('div', 'ko wt', top.handName ?? ''), h('div', 'crow', top.cards.map((c) => cardEl(c)))] : h('div', 'ko wt', '팟 획득'),
    h('div', 'ws', wins));
  const announce = (async () => {
    await sleep(1000);
    ui.append(overlay);
    await sleep(3000);
    overlay.classList.add('out');
    await sleep(400);
    overlay.remove();
  })();
  await Promise.all([stand, announce]);
  pins.setLift(top.id, 0);

  const counts = winners.map((w) => {
    const to = who(w).stack ?? 0;
    const from = Math.max(0, to - w.amount);
    pins.setStack(w.id, from);
    return countUp(from, to, 900, (v) => pins.setStack(w.id, v));
  });
  await Promise.all([table.payout(winners), ...counts]);
  winners.forEach((w) => pins.setStack(w.id, null));
}
