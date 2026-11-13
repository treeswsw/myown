// mountYacht: 요트다이스 화면 모듈(점수표·판·결과)을 하나로 묶는다. 약속: docs/YACHT-PLAN.md 3-2, SPEC 19절.
// 방이 있을 때만 화면을 만들고, 방이 없어지면(applyRoom(null)) 전부 치운다(3D 장면도 stage.use(null)).
import './yacht.css';
import './ui/sheet.css';
import './ui/result.css';
import './ui/board.css';
import { createSheet } from './ui/sheet.js';
import { createResult } from './ui/result.js';
import { createBoard } from './ui/board.js';

const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const GLYPHS = ['👍', '😂', '😮', '😡', '😭', '🔥'];
const YT_EVENTS = new Set(['ytRoll', 'ytKeep', 'ytShake', 'ytTurn', 'ytScore', 'ytEnd', 'ytStart', 'ytPick', 'ytDrop']);

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

// 판이 끝난 뒤(result·lobby)에는 서버가 남겨 둔 waiting 을 무시한다.
const shown = (s) => (s && s.phase !== 'playing' && s.waiting ? { ...s, waiting: null } : s);

export function mountYacht({ ui, stage, send, getMe, chat, toast, emotePanel }) { // eslint-disable-line no-unused-vars
  const root = el('div', 'yt-root');
  root.hidden = true;
  ui.append(root);

  const faces = new Map();
  const getFace = (id) => faces.get(id) ?? null;
  const emotes = new Map(); // id -> { el, t }

  let sheet = null;
  let pane = null;
  let result = null;
  let board = null;
  let ro = null;
  let state = null;
  let busy = false;

  function measure() {
    if (!sheet) return;
    const w = Math.round(sheet.el.getBoundingClientRect().width);
    if (w) document.documentElement.style.setProperty('--yt-sheet-w', `${w}px`);
  }

  function build() {
    sheet = createSheet({ host: root, send, getFace });
    pane = el('div', 'yt-pane');
    root.append(pane);
    result = createResult({ host: pane, getFace, getMe });
    board = createBoard({
      host: pane, stage, send, getFace,
      onBusy: (b) => { busy = b; if (sheet && state) sheet.update(shown(state), { settled: !busy }); },
    });
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(sheet.el); }
    measure();
    root.hidden = false;
  }

  function teardown() {
    ro?.disconnect(); ro = null;
    for (const m of [board, result, sheet]) { try { m?.dispose(); } catch (e) { console.error(e); } }
    board = result = sheet = null;
    pane?.remove(); pane = null;
    for (const it of emotes.values()) it.el.remove();
    emotes.clear();
    document.documentElement.style.removeProperty('--yt-sheet-w');
    try { stage?.use?.(null); } catch { /* the scene is already gone */ }
    root.hidden = true;
    busy = false;
  }

  function applyRoom(next) {
    if (!next || next.mode !== 'yacht') {
      state = null;
      if (sheet) teardown();
      return;
    }
    if (!sheet) build();
    state = next;
    const s = shown(next);
    sheet.update(s, { settled: !busy });
    result.update(s);
    board.update(s);
    requestAnimationFrame(measure);
  }

  // 점수표의 그 사람 사진 아래쪽(말풍선·이모티콘이 화면 위로 잘리지 않게)
  function anchorOf(id) {
    const p = sheet?.anchor(id);
    return p ? { x: p.x, y: p.y + 22 } : null;
  }

  function showEmote(id, i) {
    const pos = anchorOf(id);
    if (!pos || !GLYPHS[i]) return;
    emotes.get(id)?.el.remove();
    const e = el('div', 'yt-em');
    e.textContent = GLYPHS[i];
    e.style.left = `${Math.min(innerWidth - 30, Math.max(30, pos.x))}px`;
    e.style.top = `${Math.min(innerHeight - 10, Math.max(60, pos.y))}px`;
    root.append(e);
    emotes.set(id, { el: e, t: 2 });
  }

  function handleEvent(e) {
    if (!e) return;
    if (e.k === 'faces') {
      for (const it of e.items || []) if (it && typeof it.id === 'string' && typeof it.avatar === 'string' && JPEG.test(it.avatar)) faces.set(it.id, it.avatar);
      if (sheet && state) { sheet.update(shown(state), { settled: !busy }); result.update(shown(state)); }
      return;
    }
    if (e.k === 'emote') { showEmote(e.id, e.e); return; }
    if (!board || !YT_EVENTS.has(e.k)) return;
    if (e.k === 'ytScore') sheet.flash(e);
    board.handleEvent(e);
  }

  function frame(dt) {
    board?.frame(dt);
    for (const [id, it] of emotes) {
      it.t -= dt;
      if (it.t <= 0) { it.el.remove(); emotes.delete(id); }
    }
  }

  function dispose() {
    teardown();
    root.remove();
  }

  return { applyRoom, handleEvent, anchorOf, frame, dispose };
}
