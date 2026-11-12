import './chat.css';
import { h, svg, view } from './dom.js';

// createChat({ onSend(text), getAnchor(playerId) -> {x, y} | null })
//   -> { el, button, push(msg, {mine}), setLog(items, myId?), open(), close(), toggle(), setMode('game'|'lobby'), update() }
// Pure DOM: the host mounts `el` and `button` (both position:fixed) and wires the network.

const MAX_LEN = 120;
const LOG_MAX = 30;
const HOLD_MS = 4000; // matches the 87% mark of chat-life (4600ms)
const GLYPH = '<path d="M5 4.5h14a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L8 21v-4H5A2.5 2.5 0 0 1 2.5 14.5V7A2.5 2.5 0 0 1 5 4.5z"/>';
const SEND = '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>';
const touch = matchMedia('(pointer:coarse)');
const hhmm = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function createChat({ onSend, getAnchor }) {
  const el = h('div', 'chat');
  const layer = h('div');
  const toasts = h('div');
  const input = h('input', 'chat-in');
  input.type = 'text';
  input.maxLength = MAX_LEN;
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
  el.append(layer, col, dock);

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
  let isOpen = false;
  let sheetOpen = false;

  const unread = (v) => { dot.hidden = !v; };

  // Speech bubbles
  function place(id, slot) {
    const a = getAnchor(id);
    slot.el.style.visibility = a ? '' : 'hidden';
    if (!a) return;
    const w = slot.live?.offsetWidth ?? 0;
    const half = w / 2;
    const x = Math.min(Math.max(a.x, half + 8), Math.max(half + 8, innerWidth - half - 8));
    const top = (slot.live?.offsetHeight ?? 0) + 8 * view.k + 6;
    const y = Math.max(a.y - 8 * view.k, top);
    slot.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    const tx = Math.max(-half + 18, Math.min(half - 18, a.x - x));
    slot.live?.firstChild.style.setProperty('--tx', `${tx.toFixed(1)}px`);
  }

  function bubble(msg) {
    let slot = slots.get(msg.id);
    if (!slot) {
      slot = { el: h('div', 'chat-slot'), live: null };
      slots.set(msg.id, slot);
      layer.append(slot.el);
    }
    const old = slot.live;
    if (old && performance.now() - old.t0 < HOLD_MS) old.firstChild.classList.add('old');
    const b = h('div', 'chat-b', h('span', '', msg.text));
    const w = h('div', 'chat-w', b);
    w.t0 = performance.now();
    b.addEventListener('animationend', () => {
      w.remove();
      if (slot.live === w) slot.live = null;
      if (!slot.el.firstChild) { slot.el.remove(); slots.delete(msg.id); }
    });
    slot.el.append(w);
    slot.live = w;
    place(msg.id, slot);
  }

  function toast(msg) {
    const t = h('div', 'chat-toast', h('b', '', msg.name), `: ${msg.text}`);
    t.addEventListener('animationend', () => t.remove());
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
  }

  // History sheet and the lobby strip
  const row = (m) => h('div', `chat-row ${m.mine ? 'mine' : ''}`, h('div', 'meta', h('b', '', m.name), hhmm(m.ts)), m.text);
  function renderSheet() {
    const stick = sheet.scrollHeight - sheet.scrollTop - sheet.clientHeight < 40 || !sheet.childElementCount;
    sheet.replaceChildren(...(log.length ? log.map(row) : [h('div', 'chat-empty', '아직 메시지가 없어요')]));
    if (stick) sheet.scrollTop = sheet.scrollHeight;
  }
  const renderDock = () => msgs.replaceChildren(...log.slice(-3).map((m) => h('div', `chat-msg ${m.mine ? 'mine' : ''}`, h('b', '', m.name), m.text)));
  const renderLogs = () => { if (sheetOpen) renderSheet(); if (mode === 'lobby') renderDock(); };

  function setSheet(v) {
    sheetOpen = v;
    sheet.hidden = !v;
    logBtn.setAttribute('aria-pressed', String(v));
    if (v) renderSheet();
  }

  // Open / close
  function layout() {
    const lobby = mode === 'lobby';
    document.documentElement.classList.toggle('chat-docked', lobby);
    dock.hidden = !lobby;
    col.hidden = lobby;
    button.hidden = lobby;
    (lobby ? dock : col).insertBefore(bar, lobby ? null : sheet);
    logBtn.hidden = lobby;
    bar.hidden = lobby ? false : !isOpen;
    if (lobby) renderDock();
  }

  function open() {
    if (mode === 'lobby') { input.focus({ preventScroll: true }); return; }
    isOpen = true;
    bar.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    unread(false);
    input.focus({ preventScroll: true });
  }
  function close() {
    if (mode === 'lobby') { input.blur(); return; }
    isOpen = false;
    bar.hidden = true;
    setSheet(false);
    input.blur();
    button.setAttribute('aria-expanded', 'false');
  }
  const toggle = () => (isOpen ? close() : open());

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
    sync();
    if (touch.matches) close();
  }
  function sync() {
    const n = input.value.length;
    count.textContent = `${n}/${MAX_LEN}`;
    count.hidden = n <= 100;
    count.classList.toggle('full', n >= MAX_LEN);
    send.disabled = !input.value.trim();
  }

  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') close();
  });
  send.addEventListener('click', () => { submit(); if (!touch.matches) input.focus({ preventScroll: true }); });
  logBtn.addEventListener('click', () => setSheet(!sheetOpen));
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && isOpen) close();
    else if (e.key === 'Enter' && !/^(INPUT|TEXTAREA|BUTTON|SELECT|A)$/.test(document.activeElement?.tagName ?? '') && !document.querySelector('.crop-overlay')) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !col.contains(e.target) && !button.contains(e.target)) close();
  }, true);

  sync();
  setSheet(false);
  bar.hidden = true;
  layout();

  return {
    el,
    button,
    push(msg, { mine = false } = {}) {
      log.push({ ...msg, mine });
      if (log.length > LOG_MAX) log.shift();
      renderLogs();
      if (mode === 'lobby') return;
      if (!isOpen && !mine) unread(true);
      if (getAnchor(msg.id)) bubble(msg);
      else toast(msg);
    },
    // Optional myId marks that player's entries as own.
    setLog(items, myId) {
      log = items.slice(-LOG_MAX).map((m) => ({ ...m, mine: myId != null && m.id === myId }));
      renderLogs();
    },
    open, close, toggle,
    setMode(m) { mode = m; layout(); },
    update() {
      for (const [id, s] of slots) place(id, s);
    },
  };
}
