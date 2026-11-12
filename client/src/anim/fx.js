import { h } from '../ui/dom.js';
import { tween, ease, sleep, reducedMotion } from './tween.js';

export function bigText(ui, text, [x, y], cls = '') {
  const e = h('div', `fxtext num ${cls}`, text);
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  ui.append(e);
  setTimeout(() => e.remove(), 1400);
}

export function flash(ui) {
  if (reducedMotion) return;
  const e = h('div', 'flash');
  ui.append(e);
  setTimeout(() => e.remove(), 300);
}

// The photo flips like a tossed coin, then the caller marks the player as out (greyscale).
export async function coinFlip(avEl) {
  if (!avEl) return;
  if (!reducedMotion) {
    avEl.animate(
      [{ transform: 'perspective(500px) rotateY(0) translateY(0)' }, { transform: 'perspective(500px) rotateY(540deg) translateY(-34px)', offset: 0.5 }, { transform: 'perspective(500px) rotateY(1080deg) translateY(0)' }],
      { duration: 1000, easing: 'cubic-bezier(.3,.6,.4,1)' },
    );
    await sleep(500);
  }
  avEl.classList.add('dead');
  await sleep(reducedMotion ? 0 : 500);
}

export const countUp = (from, to, dur, set) => tween(dur, (k) => set(Math.round(from + (to - from) * k)), ease.out);
