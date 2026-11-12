import './emotePanel.css';
import { h, svg, view } from './dom.js';
import { TOP } from './icons.js';
import { emoteGlyphs } from './pins.js';
import { saved } from '../state.js';
import { BUILTINS, mySounds, playBuiltin, playDataUrl, prepareSound, setMediaMuted, shrinkImage, unlockAudio } from '../media.js';

// createEmotePanel({ onEmote(i), onPhoto(dataUrl), onSoundAdd({sid, name, data}), onSound(sid), getAnchor(id) -> {x, y} | null,
//                    getSelf?() -> my player id (so "다른 사람 사운드 끄기" spares mine), onClose?() after an emote or photo is sent })
//   -> { el, showPhoto(id, dataUrl), playSound(id, sid), addRoomSound(item), setRoomSounds(items), handleError(text), clearRoom(), setMuted(bool), update() }
// `el` is meant to sit inside the scaled .hpanel; photo/sound labels float in their own layer on document.body.

const ICON = {
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const AUDIO = /^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/;
const MAX_MINE = 8;
const NAME_LEN = 8;
const cut = (s) => [...String(s ?? '').trim()].slice(0, NAME_LEN).join('');
const icon = (path) => svg(ICON[path]);
const sid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function createEmotePanel({ onEmote, onPhoto, onSoundAdd, onSound, getAnchor, getSelf = () => null, onClose = () => {} }) {
  unlockAudio();
  let tab = 'emote';
  let mine = [];
  let adding = null; // File waiting for a name
  let deleting = null; // sid awaiting delete confirmation
  let busy = false;
  let othersOff = saved.get('gk.ep.others') === '1';
  let recent = [];
  try { recent = JSON.parse(saved.get('gk.ep.photos') ?? '[]').filter((u) => JPEG.test(u)).slice(0, 4); } catch { /* corrupt */ }
  const roomSounds = new Map(); // sid -> { by, name, data }

  const msg = h('div', 'ep-msg');
  msg.setAttribute('aria-live', 'polite');
  const say = (t = '') => { msg.textContent = t; };
  const btn = (cls, ...kids) => { const b = h('button', cls, ...kids); b.type = 'button'; return b; };
  const fileInput = (accept, onFile) => {
    const i = h('input');
    i.type = 'file'; i.accept = accept; i.hidden = true;
    i.onchange = () => { const f = i.files[0]; i.value = ''; if (f) onFile(f); };
    return i;
  };

  // ---- emote tab
  const photoIn = fileInput('image/*', async (file) => {
    say();
    try { sendPhoto(await shrinkImage(file)); } catch (e) { say(e.message); }
  });
  const photoBtn = btn('ep-btn wide', icon('camera'), '사진');
  photoBtn.onclick = () => photoIn.click();
  const recentRow = h('div', 'ep-recent');
  const recentLabel = h('div', 'ep-sub', '최근 보낸 사진');
  function sendPhoto(url) {
    recent = [url, ...recent.filter((u) => u !== url)].slice(0, 4);
    saved.set('gk.ep.photos', JSON.stringify(recent));
    renderRecent();
    onPhoto(url);
    onClose();
  }
  function renderRecent() {
    recentLabel.hidden = recentRow.hidden = !recent.length;
    recentRow.replaceChildren(...recent.map((url) => {
      const b = btn('', Object.assign(h('img'), { src: url, alt: '', draggable: false }));
      b.setAttribute('aria-label', '이 사진 다시 보내기');
      b.onclick = () => sendPhoto(url);
      return b;
    }));
  }
  const emotePane = h('div', '',
    h('div', 'ep-grid g3', emoteGlyphs.map((g, i) => {
      const b = btn('ep-btn glyph', g);
      b.setAttribute('aria-label', `이모티콘 ${g}`);
      b.onclick = () => { onEmote(i); onClose(); };
      return b;
    })),
    photoBtn, photoIn, recentLabel, recentRow);

  // ---- sound tab
  // A custom sound counts as "in the room" only once the server's sndAdd event comes back through addRoomSound.
  const pending = new Map(); // sid -> { timer, b }
  const flash = (b, text) => {
    const label = b.querySelector('span');
    const old = label.textContent;
    label.textContent = text;
    setTimeout(() => { label.textContent = old; }, 2500);
  };
  const failPending = (sidKey) => {
    const p = pending.get(sidKey);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(sidKey);
    flash(p.b, '잠시 후 다시 눌러 주세요');
  };
  const press = (item, b) => {
    if (roomSounds.has(item.sid)) { onSound(item.sid); return; }
    if (pending.has(item.sid)) return;
    pending.set(item.sid, { b, timer: setTimeout(() => failPending(item.sid), 3000) });
    onSoundAdd({ sid: item.sid, name: item.name, data: item.data });
  };
  function soundButton(label, onPress, item) {
    const b = btn('ep-btn snd', svg(TOP.sound), h('span', '', label));
    let timer = 0;
    let longed = false;
    let from = null;
    const stop = () => { clearTimeout(timer); from = null; };
    if (item) {
      const ask = () => { longed = true; deleting = item.sid; renderSounds(); };
      b.onpointerdown = (e) => { longed = false; stop(); from = [e.clientX, e.clientY]; timer = setTimeout(ask, 500); };
      b.onpointermove = (e) => { if (from && Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 10) stop(); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
      b.oncontextmenu = (e) => { e.preventDefault(); stop(); ask(); };
    }
    b.onclick = () => { if (!longed) onPress(b); longed = false; };
    return b;
  }
  const builtinGrid = h('div', 'ep-grid g2', BUILTINS.map((s) => soundButton(s.label, () => onSound(`builtin:${s.id}`))));
  const mineGrid = h('div', 'ep-grid g2');
  const mineLabel = h('div', 'ep-sub');
  const soundIn = fileInput('audio/*', (file) => { say(); adding = file; renderSounds(); });
  const addBtn = btn('ep-btn add wide', icon('plus'), '추가');
  addBtn.onclick = () => soundIn.click();
  const slot = h('div'); // inline name form or delete confirmation
  const sw = btn('ep-switch', h('span', '', '다른 사람 사운드 끄기'), h('i'));
  sw.setAttribute('role', 'switch');
  const paintSwitch = () => sw.setAttribute('aria-checked', String(othersOff));
  sw.onclick = () => { othersOff = !othersOff; saved.set('gk.ep.others', othersOff ? '1' : '0'); paintSwitch(); };
  paintSwitch();

  function renderSounds() {
    mineLabel.replaceChildren(h('span', '', '내 사운드'), h('span', '', mine.length ? '길게 눌러 삭제' : ''));
    mineGrid.replaceChildren(...mine.map((m) => soundButton(m.name, (b) => press(m, b), m)));
    addBtn.hidden = !!adding || mine.length >= MAX_MINE;
    slot.replaceChildren();
    if (adding) slot.append(nameForm());
    else if (deleting) slot.append(deleteBox(mine.find((m) => m.sid === deleting)));
  }
  function nameForm() {
    const input = h('input');
    input.maxLength = NAME_LEN; input.placeholder = '이름 (8자 이내)'; input.setAttribute('aria-label', '사운드 이름');
    input.value = cut(adding.name.replace(/\.[^.]*$/, ''));
    const ok = btn('ok', '확인');
    const no = btn('', '취소');
    no.onclick = () => { adding = null; renderSounds(); };
    const submit = async () => {
      const name = cut(input.value);
      if (!name || busy) return;
      busy = true; ok.disabled = true; say();
      try {
        const { data } = await prepareSound(adding);
        const item = { sid: sid(), name, data, ts: Date.now() };
        mine.push(item);
        mySounds.put(item);
        adding = null;
      } catch (e) { say(e.message); }
      busy = false;
      renderSounds();
    };
    ok.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    return h('div', 'ep-form', input, ok, no);
  }
  function deleteBox(item) {
    if (!item) { deleting = null; return h('div'); }
    const yes = btn('danger', '삭제');
    const no = btn('', '취소');
    yes.onclick = () => { mine = mine.filter((m) => m !== item); mySounds.del(item.sid); deleting = null; renderSounds(); };
    no.onclick = () => { deleting = null; renderSounds(); };
    return h('div', 'ep-del', h('p', '', `"${item.name}" 삭제할까요?`), yes, no);
  }
  const soundPane = h('div', '', builtinGrid, mineLabel, mineGrid, slot, addBtn, soundIn, sw);

  // ---- tabs
  const tabs = h('div', 'ep-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabBtns = { emote: btn('ep-tab', '이모티콘'), sound: btn('ep-tab', '사운드') };
  const show = (t) => {
    tab = t;
    say();
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-selected', String(k === t));
    emotePane.hidden = t !== 'emote';
    soundPane.hidden = t !== 'sound';
  };
  for (const [k, b] of Object.entries(tabBtns)) { b.setAttribute('role', 'tab'); b.onclick = () => show(k); }
  tabs.append(...Object.values(tabBtns));
  const el = h('div', 'ep', tabs, msg, emotePane, soundPane);
  show(tab);
  renderRecent();
  renderSounds();
  mySounds.list().then((list) => { mine = list.slice(0, MAX_MINE); renderSounds(); });

  // ---- floating photo / sound label above a pin
  const layer = h('div', 'ep-layer');
  document.body.append(layer);
  const floats = new Set();
  function place(f) {
    const a = getAnchor(f.id);
    if (!a) { f.el.style.visibility = 'hidden'; return; }
    const x = Math.max(8, Math.min(innerWidth - f.w - 8, a.x - f.w / 2));
    const y = Math.max(8, a.y - 8 * view.k - f.h);
    const t = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    if (t !== f.t) f.el.style.transform = f.t = t;
    f.el.style.visibility = 'visible';
  }
  function float(id, kind, content) {
    for (const f of floats) if (f.id === id && f.kind === kind) drop(f);
    const f = { id, kind, el: h('div', 'ep-slot', content), w: 0, h: 0, t: '' };
    const measure = () => { f.w = content.offsetWidth; f.h = content.offsetHeight; place(f); };
    content.addEventListener('animationend', () => drop(f));
    floats.add(f);
    layer.append(f.el);
    f.measure = measure;
    measure();
    return f;
  }
  function drop(f) { f.el.remove(); floats.delete(f); }
  addEventListener('resize', () => { for (const f of floats) f.measure(); });

  const api = {
    el,
    showPhoto(id, url) {
      if (!JPEG.test(url)) return;
      const img = h('img', 'ep-photo');
      img.alt = ''; img.draggable = false;
      const f = float(id, 'photo', img);
      img.onload = f.measure;
      img.src = url;
    },
    playSound(id, s) {
      const b = s.startsWith('builtin:') ? BUILTINS.find((x) => `builtin:${x.id}` === s) : null;
      const item = b ? null : roomSounds.get(s) ?? mine.find((m) => m.sid === s);
      const name = b?.label ?? item?.name;
      if (!name) return;
      if (!(othersOff && id !== getSelf())) {
        if (b) playBuiltin(b.id);
        else if (item.data) playDataUrl(item.data);
      }
      float(id, 'sound', h('div', 'ep-snd', svg(TOP.sound), h('span', '', name)));
    },
    addRoomSound({ sid: s, by, name, data }) {
      if (typeof s !== 'string' || !AUDIO.test(data)) return;
      roomSounds.set(s, { by, name: cut(name), data });
      const p = pending.get(s);
      if (p) { clearTimeout(p.timer); pending.delete(s); onSound(s); }
    },
    setRoomSounds(items) {
      roomSounds.clear();
      for (const it of items ?? []) api.addRoomSound(it);
    },
    handleError(text) { // server error text, e.g. a rejected sndAdd
      say(text);
      for (const k of [...pending.keys()]) failPending(k);
    },
    clearRoom() {
      roomSounds.clear();
      for (const k of [...pending.keys()]) { clearTimeout(pending.get(k).timer); pending.delete(k); }
      for (const f of [...floats]) drop(f);
    },
    setMuted: setMediaMuted,
    update() { for (const f of floats) place(f); },
  };
  return api;
}
