import './chat.css';
import { h, svg, view } from './dom.js';
import { chatSize } from './chatSize.js';

// createChat({ onSend(text), getAnchor(playerId) -> {x, y} | null })
//   -> { el, button, push(msg, {mine, bubble}), setLog(items, myId?), open(), close(), toggle(), setMode('game'|'lobby'|'liar'), setLock(locked, note, hot), setEnabled(bool), update() }
// Pure DOM: the host mounts `el` and `button` (both position:fixed) and wires the network.

const MAX_LEN = 120;
const FEED_MAX = 6;
const LOG_MAX = 30;
const HOLD_MS = 4000; // matches the 87% mark of chat-life (4600ms)
const BIG_HOLD_MS = 5000; // and the 89% mark of chat-big (5600ms)
const GLYPH = '<path d="M5 4.5h14a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L8 21v-4H5A2.5 2.5 0 0 1 2.5 14.5V7A2.5 2.5 0 0 1 5 4.5z"/>';
const SEND = '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>';
const touch = matchMedia('(pointer:coarse)');
// Size marks (chatSize.js): '#'/'**' = 2 (big), '*' = 1, '***' = 3. A mark with no text after it stays an ordinary message.
const norm = (m, mine) => {
  const { size, text } = chatSize(m.text);
  return { ...m, text, size, big: size >= 2, mine };
};
const hhmm = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function createChat({ onSend, getAnchor }) {
  const el = h('div', 'chat');
  const layer = h('div');
  const toasts = h('div');
  const input = h('input', 'chat-in');
  input.type = 'text';
  input.placeholder = '메시지 입력';
  input.autocomplete = 'off';
  input.enterKeyHint = 'send';
  input.setAttribute('aria-label', '채팅 메시지');
  const count = h('span', 'chat-cnt');
  const logBtn = h('button', 'chat-log', '기록');
  logBtn.type = 'button';
  logBtn.setAttribute('aria-pressed', 'false');
  const send = h('button', 'chat-send');
  send.type = 'button';
  send.setAttribute('aria-label', '보내기');
  send.append(svg(SEND));
  const bar = h('div', 'chat-bar', input, count, logBtn, send);
  const sheet = h('div', 'chat-sheet');
  const col = h('div', 'chat-col', bar, sheet, toasts);
  const msgs = h('div', 'chat-msgs');
  const dock = h('div', 'chat-dock', msgs);
  const feed = h('div', 'chat-feed'); // liar room: last few lines, top right, not clickable
  feed.hidden = true;
  el.append(layer, col, dock, feed);

  const button = h('button', 'chat-btn');
  button.type = 'button';
  button.setAttribute('aria-label', '채팅');
  button.setAttribute('aria-expanded', 'false');
  const dot = h('i', 'chat-dot');
  dot.hidden = true;
  button.append(svg(GLYPH), dot);

  const slots = new Map(); // playerId -> { el, live }
  let log = [];
  let mode = 'game';
  let enabled = true;
  let isOpen = false;
  let sheetOpen = false;

  const unread = (v) => { dot.hidden = !v; };

  // Liar game: the room locks the input during some phases (GDD 4-4). The note replaces the placeholder.
  const PLACEHOLDER = input.placeholder;
  function setLock(locked, note, hot) {
    locked = Boolean(locked);
    input.disabled = locked;
    input.placeholder = note || (locked ? '지금은 채팅할 수 없어요' : PLACEHOLDER);
    bar.classList.toggle('chat-hot', !locked && Boolean(hot));
    bar.classList.toggle('chat-locked', locked);
    if (locked) send.disabled = true; else sync();
  }

  // Speech bubbles
  function place(id, slot) {
    const a = getAnchor(id);
    if (!a !== slot.hidden) slot.el.style.visibility = (slot.hidden = !a) ? 'hidden' : '';
    if (!a) return;
    const half = slot.w / 2;
    const x = Math.min(Math.max(a.x, half + 8), Math.max(half + 8, innerWidth - half - 8));
    const y = Math.max(a.y - 8 * view.k, slot.h + 8 * view.k + 6);
    const t = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (t !== slot.t) slot.el.style.transform = slot.t = t;
  }

  // Bubble sizes are measured when created and on resize, never per frame (update() only writes).
  const measure = (slot) => { slot.w = slot.live?.offsetWidth ?? slot.w; slot.h = slot.live?.offsetHeight ?? slot.h; };

  function bubble(msg) {
    let slot = slots.get(msg.id);
    if (!slot) {
      slot = { el: h('div', 'chat-slot'), live: null, w: 0, h: 0, hidden: false, t: '' };
      slots.set(msg.id, slot);
      layer.append(slot.el);
    }
    const old = slot.live;
    if (old && performance.now() - old.t0 < old.hold) old.firstChild.classList.add('old');
    const sz = msg.size === 1 ? 's1' : msg.size === 3 ? 's3' : '';
    const b = h('div', `chat-b ${msg.big ? 'big' : ''} ${sz}`, h('span', '', msg.text));
    const w = h('div', `chat-w ${msg.big ? 'big' : ''} ${sz}`, b);
    w.t0 = performance.now();
    w.hold = msg.big ? BIG_HOLD_MS : HOLD_MS;
    slot.el.style.zIndex = msg.big ? 2 : 1;
    b.addEventListener('animationend', () => {
      w.remove();
      if (slot.live === w) slot.live = null;
      if (!slot.el.firstChild) { slot.el.remove(); slots.delete(msg.id); }
    });
    slot.el.append(w);
    slot.live = w;
    measure(slot);
    place(msg.id, slot);
  }

  function toast(msg) {
    const t = h('div', `chat-toast ${msg.big ? 'big' : ''}`, h('b', '', msg.name), `: ${msg.text}`);
    t.addEventListener('animationend', () => t.remove());
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
  }

  // History sheet and the lobby strip
  const row = (m) => h('div', `chat-row ${m.mine ? 'mine' : ''} ${m.big ? 'big' : ''}`, h('div', 'meta', h('b', '', m.name), hhmm(m.ts)), m.text);
  function renderSheet() {
    const stick = sheet.scrollHeight - sheet.scrollTop - sheet.clientHeight < 40 || !sheet.childElementCount;
    sheet.replaceChildren(...(log.length ? log.map(row) : [h('div', 'chat-empty', '아직 메시지가 없어요')]));
    if (stick) sheet.scrollTop = sheet.scrollHeight;
  }
  const renderDock = () => msgs.replaceChildren(...log.slice(-3).map((m) => h('div', `chat-msg ${m.mine ? 'mine' : ''} ${m.big ? 'big' : ''}`, h('b', '', m.name), m.text)));
  const renderFeed = () => feed.replaceChildren(...log.slice(-FEED_MAX).map((m) => h('div', `chat-fr ${m.mine ? 'mine' : ''}`, h('b', '', m.name), m.text)));
  const syncFeed = () => { feed.hidden = mode !== 'liar' || !enabled || sheetOpen; };
  const renderLogs = () => { if (sheetOpen) renderSheet(); if (mode === 'lobby') renderDock(); if (mode === 'liar') renderFeed(); };

  function setSheet(v) {
    sheetOpen = v;
    sheet.hidden = !v;
    logBtn.setAttribute('aria-pressed', String(v));
    if (v) renderSheet();
    syncFeed();
  }

  // Soft keyboard (iPad): lift the docked bar by the height the keyboard hides.
  const vv = window.visualViewport;
  function syncKb() {
    const docked = mode !== 'game' && enabled;
    const kb = docked && vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--chat-kb', `${kb}px`);
  }
  if (vv) { vv.addEventListener('resize', syncKb); vv.addEventListener('scroll', syncKb); }

  // Open / close
  function layout() {
    const lobby = mode === 'lobby';
    const liar = mode === 'liar';
    const docked = lobby || liar;
    const root = document.documentElement.classList;
    el.hidden = !enabled;
    el.classList.toggle('chat-liar', liar);
    root.toggle('chat-docked', docked && enabled);
    root.toggle('chat-liar', liar && enabled);
    toasts.replaceChildren();
    if (docked) { isOpen = false; setSheet(false); }
    if (lobby) { layer.replaceChildren(); slots.clear(); }
    dock.hidden = !docked;
    msgs.hidden = liar;
    col.hidden = lobby;
    button.hidden = docked || !enabled;
    // Only move the bar when it is not already in place: re-inserting a focused input drops focus and breaks IME composition.
    const home = docked ? dock : col;
    const want = docked ? null : sheet;
    if (bar.parentNode !== home || (docked ? home.lastChild !== bar : bar.nextSibling !== want)) home.insertBefore(bar, want);
    logBtn.hidden = lobby;
    bar.hidden = docked ? false : !isOpen;
    if (lobby) renderDock();
    if (liar) renderFeed();
    syncFeed();
    syncKb();
  }

  function open() {
    if (!enabled) return;
    if (mode !== 'game') { input.focus({ preventScroll: true }); return; }
    isOpen = true;
    bar.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    unread(false);
    input.focus({ preventScroll: true });
  }
  function close() {
    if (mode !== 'game') { if (mode === 'liar') setSheet(false); input.blur(); return; }
    isOpen = false;
    bar.hidden = true;
    setSheet(false);
    input.blur();
    button.setAttribute('aria-expanded', 'false');
  }
  const toggle = () => (isOpen ? close() : open());

  function submit() {
    const text = input.value.trim();
    if (!text || /^#\s*$/.test(text)) return;
    onSend(text);
    input.value = '';
    sync();
    if (touch.matches && mode !== 'liar') close();
  }
  function sync() {
    const n = [...input.value].length;
    count.textContent = `${n}/${MAX_LEN}`;
    count.hidden = n <= 100;
    count.classList.toggle('full', n >= MAX_LEN);
    send.disabled = !input.value.trim() || /^#\s*$/.test(input.value);
  }

  input.addEventListener('input', (e) => {
    if (!e.isComposing && [...input.value].length > MAX_LEN) input.value = [...input.value].slice(0, MAX_LEN).join('');
    sync();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') close();
  });
  send.addEventListener('click', () => { submit(); if (!touch.matches || mode === 'liar') input.focus({ preventScroll: true }); });
  logBtn.addEventListener('click', () => setSheet(!sheetOpen));
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (!enabled || e.isComposing || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && isOpen) close();
    else if (e.key === 'Enter' && !/^(INPUT|TEXTAREA|BUTTON|SELECT|A)$/.test(document.activeElement?.tagName ?? '') && !document.querySelector('.crop-overlay')) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !col.contains(e.target) && !button.contains(e.target)) close();
    else if (mode === 'liar' && sheetOpen && !col.contains(e.target) && !bar.contains(e.target)) setSheet(false);
  }, true);

  addEventListener('resize', () => { for (const s of slots.values()) measure(s); });
  sync();
  setSheet(false);
  bar.hidden = true;
  layout();

  return {
    el,
    button,
    push(msg, { mine = false, bubble: showBubble = true } = {}) {
      if (!enabled) return;
      log.push(norm(msg, mine));
      if (log.length > LOG_MAX) log.shift();
      renderLogs();
      if (mode === 'lobby') return;
      if (mode === 'liar') {
        const m = log[log.length - 1];
        if (showBubble !== false && getAnchor(m.id)) bubble(m);
        return;
      }
      if (!isOpen && !mine) unread(true);
      const m = log[log.length - 1];
      if (getAnchor(m.id)) bubble(m);
      else toast(m);
    },
    // Optional myId marks that player's entries as own.
    setLog(items, myId) {
      log = items.slice(-LOG_MAX).map((m) => norm(m, myId != null && m.id === myId));
      renderLogs();
    },
    open, close, toggle, setLock,
    setMode(m) {
      const same = m === mode;
      mode = m;
      if (same) { button.hidden = mode !== 'game' || !enabled; return; } // host re-shows the icon on every room update
      layout();
    },
    setEnabled(v) {
      v = Boolean(v);
      if (v === enabled) { button.hidden = mode !== 'game' || !enabled; return; }
      enabled = v;
      if (!enabled) {
        close();
        layer.replaceChildren();
        slots.clear();
        unread(false);
      }
      layout();
    },
    update() {
      for (const [id, s] of slots) place(id, s);
    },
  };
}
