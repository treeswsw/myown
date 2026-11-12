import { h, avatar, cardEl, fmt } from '../ui/dom.js';
import { sleep } from './tween.js';
import { countUp } from './fx.js';
import { sfx } from '../audio.js';

// Win sequence: hand name, best five, winner + amount, then the pot flies to the winner's stack.
export async function playWin({ ui, table, pins, getRoom }, e) {
  const room = getRoom();
  const winners = e.winners ?? room?.result?.winners ?? [];
  if (!winners.length || !room) return;
  const top = winners[0];
  const who = (w) => room.players.find((p) => p.id === w.id) ?? { name: w.id };
  const showCards = top.cards?.length > 0;

  const wins = winners.map((w) => h('div', 'w', avatar(who(w), 'pav'), h('span', 'ko', who(w).name), h('span', 'num', `+${fmt(w.amount)}`)));
  const overlay = h('div', `win ${winners.length > 1 ? 'small' : ''}`,
    showCards ? [h('div', 'ko wt', top.handName ?? ''), h('div', 'crow', top.cards.map((c) => cardEl(c)))] : h('div', 'ko wt', '팟 획득'),
    h('div', 'ws', wins));
  ui.append(overlay);
  sfx.win();
  await sleep(3600);
  overlay.classList.add('out');
  await sleep(400);
  overlay.remove();

  const finals = new Map(winners.map((w) => [w.id, who(w).stack ?? 0]));
  const counts = winners.map((w) => {
    const to = finals.get(w.id);
    const from = Math.max(0, to - w.amount);
    pins.setStack(w.id, from);
    return countUp(from, to, 900, (v) => pins.setStack(w.id, v));
  });
  await Promise.all([table.payout(winners), ...counts]);
  winners.forEach((w) => pins.setStack(w.id, null));
}
