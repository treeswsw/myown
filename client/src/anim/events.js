import { h, cardEl } from '../ui/dom.js';
import { sleep } from './tween.js';
import { bigText, coinFlip, flash } from './fx.js';
import { playWin } from './win.js';
import { handCode } from '../ui/bluff.js';
import { sfx } from '../audio.js';
import { CARD_TIMING } from '../scene/timing.js';

// Plays server events one after another. While anything is playing, `busy()` is true and the host
// holds back the next room state, so the screen never jumps ahead of the choreography.
// Nominal length of each event's choreography. The lag guard allows 1.6x this plus a slack before it
// decides the device cannot keep up and lets the screen jump to the latest server state.
const BUDGET_MS = { street: 1500, showdown: 3500, win: 12000, allin: 2600, bust: 3200, shot: 3200, liar: 800, reveal: 2400, bluffWin: 3000, champion: 3500 };
const SLACK_MS = 2500;
const MAX_BACKLOG_MS = 30000;

export function createAnimator({ ui, stage, table, pins, cluster, special, getRoom, applyPartial, onIdle, setHandAway, setDim }) {
  const queue = [];
  let current = null; // the event being played: { at, deadline, budget }
  let backlog = 0; // nominal ms of everything queued or running
  let running = false;
  let abort = null; // resolves the event being played when the guard flushes
  let allinShown = false; // later all-ins of one hand only slide chips, keeping the batch short
  const pos = (id) => stage.project(table.head(id));

  // Reduced mode (slow device): the same host-side effects without the body sequences.
  const quick = (sound) => { sfx[sound]?.(); return sleep(500); };
  // Only one body sequence at a time: a new one ends the previous.
  const body = (play) => { special.skipAll(); return play(); };
  const involvesMe = (...ids) => ids.includes(getRoom()?.you);
  const away = async (on, fn) => { if (on) setHandAway(true); try { await fn(); } finally { if (on) setHandAway(false); } };

  async function handle(e) {
    const room = getRoom();
    switch (e.k) {
      case 'deal': allinShown = false; pins.clearHands(); pins.emphasize(null); table.highlight(null); cluster.highlight(null); pins.clearActs(); pins.clearDead(); sfx.card(); break;
      case 'blinds': sfx.chip(); break;
      case 'action':
        if (e.a !== 'fold') { pins.setAct(e.id, e.a); sfx.chip(); }
        break;
      case 'allin':
        if (allinShown || stage.isLowPower()) {
          table.shove(e.id);
          if (!allinShown) { bigText(ui, 'ALL IN', pos(e.id)); sfx.thud(); }
          allinShown = true;
          await sleep(600);
        } else { allinShown = true; await body(() => special.playAllIn(e.id, { onPush: () => table.shove(e.id) })); }
        table.release(e.id);
        break;
      case 'street':
        applyPartial((r) => ({ ...r, board: [...r.board, ...e.cards], street: e.street }));
        pins.clearActs();
        await sleep(Math.max(0, e.cards.length - 1) * CARD_TIMING.boardGap + CARD_TIMING.board + 300);
        break;
      case 'showdown': {
        applyPartial((r) => ({ ...r, result: { ...(r.result ?? {}), shown: e.shown } }));
        // Everyone's remaining hand pops up above their photo, one player after another from the dealer's left.
        const seats = [...room.players].sort((a, b) => a.seat - b.seat);
        const d = Math.max(0, seats.findIndex((p) => p.isDealer));
        for (const p of [...seats.slice(d + 1), ...seats.slice(0, d + 1)]) {
          if (!e.shown[p.id]) continue;
          pins.showHand(p.id, e.shown[p.id]);
          sfx.card();
          await sleep(600);
        }
        await sleep(600);
        break;
      }
      case 'win': await playWin({ ui, stage, table, pins, cluster, special, getRoom, setDim }, e); break;
      case 'bust': {
        const winner = e.by ?? room?.result?.winners?.[0]?.id;
        const hit = () => { pins.setDead(e.id, true); coinFlip(pins.get(e.id)?.av); };
        await away(involvesMe(winner, e.id), async () => {
          if (stage.isLowPower()) { flash(ui); hit(); await quick('shot'); } else await body(() => special.playBust(winner, e.id, { onHit: hit }));
        });
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
        const ov = h('div', 'ov reveal', h('div', 't', `${who(e.by)}의 카드 · 이번 카드 ${room?.tableRank ?? ''}`), cards,
          h('div', 'ko reveal-t', verdict), h('div', 'x', `${who(e.loser)} 벌칙`));
        ui.append(ov);
        await sleep(2200);
        ov.remove();
        table.clearPile();
        break;
      }
      case 'shot':
        const result = (dead) => {
          if (dead) { pins.setDead(e.id, true); coinFlip(pins.get(e.id)?.av); } else bigText(ui, '철컥', pos(e.id));
        };
        await away(involvesMe(e.id), async () => {
          if (stage.isLowPower()) { flash(ui); result(e.dead); await quick(e.dead ? 'shot' : 'click'); } else await body(() => special.playRevolver(e.id, { dead: e.dead, shots: e.shots, onResult: result }));
        });
        break;
      case 'champion': {
        const p = room?.players.find((x) => x.id === e.id);
        const b = h('div', 'banner', h('div', 'num', '최종 승자'), h('div', 'ko', p?.name ?? e.id));
        ui.append(b);
        sfx.win();
        await sleep(3500);
        b.remove();
        break;
      }
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
      current = queue.shift();
      const { e } = current;
      const aborted = new Promise((r) => { abort = r; });
      try { await Promise.race([handle(e), aborted, new Promise((r) => setTimeout(r, 25000))]); } catch (err) { console.error('animation failed', err); }
      backlog -= current.budget;
      current = null;
    }
    abort = null;
    running = false;
    onIdle();
  }

  // The screen must never lag the server state: if an event runs far past its nominal length, or the
  // backlog cannot be played in reasonable time, drop the remaining choreography and let the host
  // apply the latest room state at once.
  function flush() {
    queue.length = 0;
    backlog = 0;
    special.skipAll();
    ui.querySelectorAll('.win, .banner, .fxtext, .ov.reveal').forEach((n) => n.remove());
    table.releaseAll();
    pins.clearStacks();
    pins.emphasize(null);
    pins.clearHands();
    setDim(false);
    stage.pushIn(null, 0, 400);
    table.highlight(null);
    cluster.highlight(null);
    setHandAway(false);
    abort?.();
  }
  setInterval(() => {
    const late = (ev) => ev && Date.now() > ev.deadline;
    // Only events that wait too long in the queue count; a long sequence that is playing is fine.
    if (backlog > MAX_BACKLOG_MS || late(queue[0])) flush();
  }, 500);

  return {
    // A hidden tab stops requestAnimationFrame, so its animations could never finish: skip them.
    push(e) {
      if (document.hidden) return;
      const budget = BUDGET_MS[e.k] ?? 0;
      backlog += budget;
      queue.push({ e, budget, at: Date.now(), deadline: Date.now() + backlog * 1.6 + SLACK_MS });
      if (!running) run();
    },
    flush,
    busy: () => running,
  };
}
