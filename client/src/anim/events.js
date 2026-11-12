import { h, cardEl } from '../ui/dom.js';
import { sleep } from './tween.js';
import { bigText, coinFlip } from './fx.js';
import { playWin } from './win.js';
import { handCode } from '../ui/bluff.js';
import { sfx } from '../audio.js';

// Plays server events one after another. While anything is playing, `busy()` is true and the host
// holds back the next room state, so the screen never jumps ahead of the choreography.
export function createAnimator({ ui, stage, table, pins, special, getRoom, applyPartial, onIdle }) {
  const queue = [];
  let running = false;
  const pos = (id) => stage.project(table.head(id));

  async function handle(e) {
    const room = getRoom();
    switch (e.k) {
      case 'deal': pins.clearActs(); pins.clearDead(); sfx.card(); break;
      case 'blinds': sfx.chip(); break;
      case 'action':
        if (e.a !== 'fold') { pins.setAct(e.id, e.a); sfx.chip(); }
        break;
      case 'allin':
        await special.playAllIn(e.id, { onPush: () => table.shove(e.id) });
        table.release(e.id);
        break;
      case 'street':
        applyPartial((r) => ({ ...r, board: [...r.board, ...e.cards], street: e.street }));
        pins.clearActs();
        await sleep(700);
        break;
      case 'showdown':
        applyPartial((r) => ({ ...r, result: { ...(r.result ?? {}), shown: e.shown } }));
        await sleep(900);
        break;
      case 'win': await playWin({ ui, table, pins, getRoom }, e); break;
      case 'bust': {
        const winner = e.by ?? room?.result?.winners?.[0]?.id;
        await special.playBust(winner, e.id, { onHit: () => { pins.setDead(e.id, true); coinFlip(pins.get(e.id)?.av); } });
        break;
      }
      case 'bluffDeal': table.clearPile(); pins.clearActs(); sfx.card(); break;
      case 'bluffPlay': table.addToPile(e.count, e.id); break;
      case 'liar':
        bigText(ui, 'LIAR!', pos(e.caller), 'red');
        sfx.click();
        await sleep(800);
        break;
      case 'reveal': {
        const cards = h('div', 'crow', e.cards.map((r, i) => cardEl(handCode(r, i))));
        const verdict = e.lie ? '거짓말이었다!' : '진짜였다!';
        const who = (id) => room?.players.find((p) => p.id === id)?.name ?? id;
        const ov = h('div', 'ov', h('div', 't', `${who(e.by)}의 카드 · 이번 카드 ${room?.tableRank ?? ''}`), cards,
          h('div', 'ko reveal-t', verdict), h('div', 'x', `${who(e.loser)} 벌칙`));
        ui.append(ov);
        await sleep(2200);
        ov.remove();
        table.clearPile();
        break;
      }
      case 'shot':
        await special.playRevolver(e.id, {
          dead: e.dead, shots: e.shots,
          onResult: (dead) => {
            if (dead) { pins.setDead(e.id, true); coinFlip(pins.get(e.id)?.av); } else bigText(ui, '철컥', pos(e.id));
          },
        });
        break;
      case 'bluffWin': {
        const p = room?.players.find((x) => x.id === e.id);
        const b = h('div', 'banner', h('div', 'ko', `${p?.name ?? ''} 우승`));
        ui.append(b);
        sfx.win();
        await sleep(3000);
        b.remove();
        break;
      }
      default: break;
    }
  }

  async function run() {
    running = true;
    while (queue.length) {
      try { await Promise.race([handle(queue.shift()), new Promise((r) => setTimeout(r, 10000))]); } catch (err) { console.error('animation failed', err); }
    }
    running = false;
    onIdle();
  }

  return {
    // A hidden tab stops requestAnimationFrame, so its animations could never finish: skip them.
    push(e) { if (document.hidden) return; queue.push(e); if (!running) run(); },
    flush() { queue.length = 0; },
    busy: () => running,
  };
}
