import './chat.css';
import { h, svg, view } from './dom.js';
import { chatSize, madLetters, MAD_FONTS } from './chatSize.js';

// createChat({ onSend(text), getAnchor(playerId) -> {x, y} | null, onEmote?() })
//   -> { el, button, waitEl, push(msg, {mine, bubble}), system(text), setLog(items, myId?), open(), close(), toggle(),
//        setMode('game'|'lobby'|'inline'|'wait'|'own'), setLock(locked, note, hot), setRule(rule|null), setEnabled(bool), update() }
// Pure DOM: the host mounts `el` and `button` (both position:fixed) and wires the network.
// 'wait' (공통 대기실, COMMON-CONTRACT 4-3): 기록과 입력 줄이 waitEl 안에 들어간다. 대기실이 waitEl 을 자기 오른쪽 칸에 붙인다.
//   입력 줄 왼쪽에 이모티콘 버튼(onEmote). 'own': 게임이 자기 입력칸을 쓰는 동안 사이트 채팅을 숨기고 기록만 받는다.
// setRule({maxLen}) : 글자 수 한도(없으면 120). 잠금·보낼 모양·말풍선은 공통 틀(room/frame.js)이 rule 로 정한다.

const MAX_LEN = 120;
const FEED_MAX = 6;
const LOG_MAX = 30;
const HOLD_MS = 4000; // matches the 87% mark of chat-life (4600ms)
const BIG_HOLD_MS = 5000; // and the 89% mark of chat-big (5600ms)
const GLYPH = '<path d="M5 4.5h14a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L8 21v-4H5A2.5 2.5 0 0 1 2.5 14.5V7A2.5 2.5 0 0 1 5 4.5z"/>';
const SEND = '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>';
const EMO = '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0M9 9.8v.4M15 9.8v.4"/>';
const touch = matchMedia('(pointer:coarse)');
// Size marks (chatSize.js): '#'/'**' = 2 (big), '*' = 1, '***' = 3. A mark with no text after it stays an ordinary message.
const norm = (m, mine) => {
  const { size, text } = chatSize(m.text);
  return { ...m, text, size, big: size >= 2, mine };
};
// Fonts for the '***' bubble load only when one first shows (the site <link> in index.html stays small).
// Google serves Korean faces in small unicode-range pieces, so only the letters actually drawn are downloaded.
const MAD_CSS = 'https://fonts.googleapis.com/css2?' + MAD_FONTS.map(([f]) => 'family=' + f.replace(/ /g, '+') + ({ 'Nanum Myeongjo': ':wght@800', 'Gothic A1': ':wght@900', Hahmlet: ':wght@900', Dongle: ':wght@700' }[f] ?? '')).join('&') + '&display=swap';
let madLoaded = false;
function loadMadFonts() {
  if (madLoaded) return;
  madLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = MAD_CSS;
  document.head.append(l);
}
function madText(msg) {
  const span = h('span');
  for (const L of madLetters(msg.text, `${msg.id}|${msg.ts}|${msg.text}`)) {
    const i = document.createElement('i');
    if (!L.font) { i.textContent = L.ch; span.append(i); continue; }
    const fx = h('b', `chat-fx-${L.fx}`, L.ch); // the motion runs on the inner letter so it adds to the static tilt
    fx.style.animationDelay = `${L.delay}ms`;
    i.append(fx);
    i.style.fontFamily = `'${L.font}', sans-serif`;
    i.style.fontSize = `${L.k}em`;
    i.style.color = L.color;
    i.style.transform = `translateY(${L.dy}em) rotate(${L.rot}deg) scale(${L.sc})`;
    span.append(i);
  }
  return span;
}
const hhmm = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function createChat({ onSend, getAnchor, onEmote }) {
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
  const emoBtn = h('button', 'chat-emo');
  emoBtn.type = 'button';
  emoBtn.setAttribute('aria-label', '이모티콘');
  emoBtn.append(svg(EMO));
  emoBtn.hidden = true;
  emoBtn.addEventListener('click', () => onEmote?.());
  const bar = h('div', 'chat-bar', emoBtn, input, count, logBtn, send);
  const sheet = h('div', 'chat-sheet');
  const col = h('div', 'chat-col', bar, sheet, toasts);
  const msgs = h('div', 'chat-msgs');
  const dock = h('div', 'chat-dock', msgs);
  const feed = h('div', 'chat-feed'); // inline layout (chatRule.layout): last few lines, top right, not clickable
  feed.hidden = true;
  el.append(layer, col, dock, feed);
  const wlog = h('div', 'chat-wlog');
  const waitEl = h('div', 'chat-wait', wlog); // 공통 대기실 오른쪽 칸 안에 들어가는 기록 + 입력 줄

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
  let maxLen = MAX_LEN;

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
    if (msg.size === 3) loadMadFonts();
    const b = h('div', `chat-b ${msg.big ? 'big' : ''} ${sz}`, msg.size === 3 ? madText(msg) : h('span', '', msg.text));
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
  const row = (m) => (m.sys ? h('div', 'chat-row chat-sys', m.text)
    : h('div', `chat-row ${m.mine ? 'mine' : ''} ${m.big ? 'big' : ''}`, h('div', 'meta', h('b', '', m.name), hhmm(m.ts)), m.text));
  function renderWait() {
    const stick = wlog.scrollHeight - wlog.scrollTop - wlog.clientHeight < 40;
    wlog.replaceChildren(...log.map(row));
    if (stick) wlog.scrollTop = wlog.scrollHeight;
  }
  function renderSheet() {
    const stick = sheet.scrollHeight - sheet.scrollTop - sheet.clientHeight < 40 || !sheet.childElementCount;
    sheet.replaceChildren(...(log.length ? log.map(row) : [h('div', 'chat-empty', '아직 메시지가 없어요')]));
    if (stick) sheet.scrollTop = sheet.scrollHeight;
  }
  const said = () => log.filter((m) => !m.sys);
  const renderDock = () => msgs.replaceChildren(...said().slice(-3).map((m) => h('div', `chat-msg ${m.mine ? 'mine' : ''} ${m.big ? 'big' : ''}`, h('b', '', m.name), m.text)));
  const renderFeed = () => feed.replaceChildren(...said().slice(-FEED_MAX).map((m) => h('div', `chat-fr ${m.mine ? 'mine' : ''}`, h('b', '', m.name), m.text)));
  const syncFeed = () => { feed.hidden = mode !== 'inline' || !enabled || sheetOpen; };
  const renderLogs = () => { if (sheetOpen) renderSheet(); if (mode === 'lobby') renderDock(); if (mode === 'inline') renderFeed(); if (mode === 'wait') renderWait(); };

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
    const docked = (mode === 'lobby' || mode === 'inline') && enabled;
    const kb = docked && vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--chat-kb', `${kb}px`);
  }
  if (vv) { vv.addEventListener('resize', syncKb); vv.addEventListener('scroll', syncKb); }

  // Open / close
  function layout() {
    const lobby = mode === 'lobby';
    const inline = mode === 'inline';
    const wait = mode === 'wait';
    const own = mode === 'own';
    const docked = lobby || inline;
    const root = document.documentElement.classList;
    el.hidden = !enabled || wait || own;
    waitEl.hidden = !wait || !enabled;
    emoBtn.hidden = !wait;
    el.classList.toggle('chat-inline', inline);
    root.toggle('chat-docked', docked && enabled);
    root.toggle('chat-inline', inline && enabled);
    toasts.replaceChildren();
    if (docked || wait || own) { isOpen = false; setSheet(false); }
    if (lobby || wait || own) { layer.replaceChildren(); slots.clear(); }
    dock.hidden = !docked;
    msgs.hidden = inline;
    col.hidden = lobby;
    button.hidden = docked || wait || own || !enabled;
    // Only move the bar when it is not already in place: re-inserting a focused input drops focus and breaks IME composition.
    const fixed = docked || wait; // the bar sits at the end of its box
    const home = wait ? waitEl : docked ? dock : col;
    const want = fixed ? null : sheet;
    if (bar.parentNode !== home || (fixed ? home.lastChild !== bar : bar.nextSibling !== want)) home.insertBefore(bar, want);
    logBtn.hidden = lobby || wait;
    bar.hidden = fixed ? false : !isOpen;
    if (lobby) renderDock();
    if (wait) renderWait();
    if (inline) renderFeed();
    syncFeed();
    syncKb();
  }

  function open() {
    if (!enabled) return;
    if (mode === 'own') return;
    if (mode !== 'game') { input.focus({ preventScroll: true }); return; }
    isOpen = true;
    bar.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    unread(false);
    input.focus({ preventScroll: true });
  }
  function close() {
    if (mode !== 'game') { if (mode === 'inline') setSheet(false); input.blur(); return; }
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
    if (touch.matches && mode !== 'inline' && mode !== 'wait') close();
  }
  function sync() {
    const n = [...input.value].length;
    count.textContent = `${n}/${maxLen}`;
    count.hidden = n <= maxLen - 20;
    count.classList.toggle('full', n >= maxLen);
    send.disabled = !input.value.trim() || /^#\s*$/.test(input.value);
  }

  input.addEventListener('input', (e) => {
    if (!e.isComposing && [...input.value].length > maxLen) input.value = [...input.value].slice(0, maxLen).join('');
    sync();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') close();
  });
  send.addEventListener('click', () => { submit(); if (!touch.matches || mode === 'inline' || mode === 'wait') input.focus({ preventScroll: true }); });
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
    else if (mode === 'inline' && sheetOpen && !col.contains(e.target) && !bar.contains(e.target)) setSheet(false);
  }, true);

  addEventListener('resize', () => { for (const s of slots.values()) measure(s); });
  document.fonts?.addEventListener?.('loadingdone', () => { for (const s of slots.values()) measure(s); }); // '***' fonts arrive after the bubble
  sync();
  setSheet(false);
  bar.hidden = true;
  layout();

  return {
    el,
    button,
    waitEl,
    push(msg, { mine = false, bubble: showBubble = true } = {}) {
      if (!enabled) return;
      log.push(norm(msg, mine));
      if (log.length > LOG_MAX) log.shift();
      renderLogs();
      if (mode === 'lobby' || mode === 'wait' || mode === 'own') return;
      if (mode !== 'inline' && !isOpen && !mine) unread(true);
      if (showBubble === false) return; // 게임이 큰 글로 따로 보이는 말(chatRule.bubble): 기록에만 남긴다
      const m = log[log.length - 1];
      if (getAnchor(m.id)) bubble(m);
      else if (mode !== 'inline') toast(m);
    },
    // 시스템 줄("○○ 님이 들어왔어요"): 기록·대기실 칸에만, 말풍선 없음
    system(text) {
      if (!enabled) return;
      log.push({ sys: true, text: String(text ?? ''), ts: Date.now() });
      if (log.length > LOG_MAX) log.shift();
      renderLogs();
    },
    setRule(rule) {
      maxLen = Number.isInteger(rule?.maxLen) && rule.maxLen > 0 ? rule.maxLen : MAX_LEN;
      if ([...input.value].length > maxLen) input.value = [...input.value].slice(0, maxLen).join('');
      sync();
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
