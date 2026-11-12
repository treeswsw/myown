import './emotePanel.css';
import { h, svg, view } from './dom.js';
import { TOP } from './icons.js';
import { emoteGlyphs } from './pins.js';
import { saved } from '../state.js';
import { BUILTINS, mySounds, playBuiltin, playDataUrl, prepareSound, setMediaMuted, shrinkImage, unlockAudio } from '../media.js';

// createEmotePanel({ onEmote(i), onPhoto(dataUrl), onSoundAdd({sid, name, data}), onSound(sid), getAnchor(id) -> {x, y} | null,
//                    getSelf?() -> my id, getName?(id) -> name, isHost?() -> bool, onSoundDelete(sid), onSoundRename(sid, name),
//                    onClose?() after an emote or photo is sent })
//   -> { el, showPhoto(id, dataUrl), playSound(id, sid), addRoomSound(item), setRoomSounds(items), removeRoomSound(sid), renameRoomSound(sid, name), syncMine(), handleError(text), clearRoom(), setMuted(bool), update() }
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

export function createEmotePanel({ onEmote, onPhoto, onSoundAdd, onSound, getAnchor, getSelf = () => null, getName = () => '', isHost = () => false, onSoundDelete, onSoundRename, onClose = () => {} }) {
  unlockAudio();
  let tab = 'emote';
  let mine = [];
  let adding = null; // { file, name } waiting for a name
  let editMode = false;
  let editing = null; // { sid, kind: 'rename' | 'delete', value? }
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

  // ---- sound tab: built-ins, then every sound of the room ("방 사운드"), shared by everyone
  const UPLOAD_MS = 5000;
  const GAP_MS = 10500; // the server accepts one sndAdd per 10 s per account
  const uploads = new Map(); // my sid -> { state: 'pending' | 'error', timer }
  let lastUp = 0;
  let queue = [];
  let queueTimer = 0;
  let mineReady = Promise.resolve();
  const upload = (item) => {
    clearTimeout(uploads.get(item.sid)?.timer);
    uploads.set(item.sid, { state: 'pending', timer: setTimeout(() => failUpload(item.sid), UPLOAD_MS) });
    lastUp = Date.now();
    onSoundAdd({ sid: item.sid, name: item.name, data: item.data });
    renderSounds();
  };
  function failUpload(s) {
    const u = uploads.get(s);
    if (!u) return;
    clearTimeout(u.timer);
    uploads.set(s, { state: 'error' });
    renderSounds();
  }
  const drain = () => {
    clearTimeout(queueTimer);
    if (!queue.length) return;
    queueTimer = setTimeout(() => {
      const item = queue.shift();
      if (item && mine.includes(item) && !roomSounds.has(item.sid)) upload(item);
      drain();
    }, Math.max(800, lastUp + GAP_MS - Date.now()));
  };
  const canEdit = (it) => !!it.by && (it.by === getSelf() || isHost());
  const builtinGrid = h('div', 'ep-grid g2', BUILTINS.map((s) => {
    const b = btn('ep-btn snd', svg(TOP.sound), h('div', 'ep-nm', h('span', '', s.label)));
    b.onclick = () => onSound(`builtin:${s.id}`);
    return b;
  }));
  const roomGrid = h('div');
  const editBtn = btn('ep-edit', '편집');
  editBtn.onclick = () => { editing = null; editMode = !editMode; renderSounds(); };
  const roomLabel = h('div', 'ep-sub', h('span', '', '방 사운드'), editBtn);
  const soundIn = fileInput('audio/*', (file) => { say(); adding = { file, name: cut(file.name.replace(/\.[^.]*$/, '')) }; renderSounds(); });
  const addBtn = btn('ep-btn add wide', icon('plus'), '추가');
  addBtn.onclick = () => soundIn.click();
  const slot = h('div'); // inline name form for a new sound
  const sw = btn('ep-switch', h('span', '', '다른 사람 사운드 끄기'), h('i'));
  sw.setAttribute('role', 'switch');
  const paintSwitch = () => sw.setAttribute('aria-checked', String(othersOff));
  sw.onclick = () => { othersOff = !othersOff; saved.set('gk.ep.others', othersOff ? '1' : '0'); paintSwitch(); };
  paintSwitch();

  const label = (name, by) => h('div', 'ep-nm', h('span', '', name), by ? h('small', '', by) : null);
  // one entry per sound: the room's, plus my own that are still uploading or failed
  const entries = () => [
    ...[...roomSounds].map(([s, v]) => ({ sid: s, ...v, inRoom: true })),
    ...mine.filter((m) => !roomSounds.has(m.sid)).map((m) => ({ sid: m.sid, by: getSelf(), name: m.name, data: m.data, inRoom: false })),
  ];
  function inlineForm(value, ok, cancel, onInput) {
    const input = h('input');
    input.maxLength = NAME_LEN; input.placeholder = '이름 (8자 이내)'; input.setAttribute('aria-label', '사운드 이름');
    input.value = value;
    input.oninput = () => onInput(input.value);
    const yes = btn('ok', '확인');
    const no = btn('', '취소');
    yes.onclick = () => ok(input.value, yes);
    no.onclick = cancel;
    input.onkeydown = (e) => { if (e.key === 'Enter') yes.click(); };
    return h('div', 'ep-form', input, yes, no);
  }
  function editRow(it) {
    const who = it.by ? (getName(it.by) || '') : '';
    const row = h('div', 'ep-row', label(it.name, who));
    const e = editing?.sid === it.sid ? editing : null;
    if (e?.kind === 'rename') {
      row.append(inlineForm(e.value, (v) => {
        const name = cut(v);
        if (!name) return;
        editing = null;
        onSoundRename(it.sid, name);
        renderSounds();
      }, () => { editing = null; renderSounds(); }, (v) => { e.value = v; }));
    } else if (e?.kind === 'delete') {
      const yes = btn('danger', '삭제');
      const no = btn('', '취소');
      yes.onclick = () => { editing = null; it.inRoom ? onSoundDelete(it.sid) : dropMine(it.sid); renderSounds(); };
      no.onclick = () => { editing = null; renderSounds(); };
      row.append(h('div', 'ep-del', h('p', '', `"${it.name}" 삭제할까요?`), yes, no));
    } else {
      const play = btn('', '미리듣기');
      play.onclick = () => playDataUrl(it.data);
      const ctl = h('div', 'ep-ctl', play);
      if (!it.inRoom || canEdit(it)) {
        const ren = btn('', '이름');
        const del = btn('', '삭제');
        ren.onclick = () => { editing = { sid: it.sid, kind: 'rename', value: it.name }; renderSounds(); };
        del.onclick = () => { editing = { sid: it.sid, kind: 'delete' }; renderSounds(); };
        if (it.inRoom) ctl.append(ren);
        ctl.append(del);
      }
      row.append(ctl);
    }
    return row;
  }
  function playRow(it) {
    const up = uploads.get(it.sid);
    const state = it.inRoom ? '' : up?.state === 'error' ? '다시 시도' : '올리는 중…';
    const b = btn(`ep-btn snd${it.inRoom ? '' : ' wait'}`, svg(TOP.sound), label(it.name, state || (it.by ? getName(it.by) : '')));
    b.onclick = () => {
      if (it.inRoom) onSound(it.sid);
      else if (up?.state === 'error') upload(mine.find((m) => m.sid === it.sid));
    };
    return b;
  }
  function renderSounds() {
    const list = entries();
    roomLabel.hidden = !list.length;
    editBtn.textContent = editMode ? '완료' : '편집';
    roomGrid.className = editMode ? 'ep-rows' : 'ep-grid g2';
    roomGrid.replaceChildren(...list.map((it) => (editMode ? editRow(it) : playRow(it))));
    addBtn.hidden = !!adding || mine.length >= MAX_MINE;
    slot.replaceChildren();
    if (adding) slot.append(nameForm());
  }
  function nameForm() {
    return inlineForm(adding.name, async (v, ok) => {
      const name = cut(v);
      if (!name || busy) return;
      busy = true; ok.disabled = true; say();
      try {
        const { data } = await prepareSound(adding.file);
        const item = { sid: sid(), name, data, ts: Date.now() };
        mine.push(item);
        mySounds.put(item);
        adding = null;
        upload(item);
      } catch (e) { say(e.message); }
      busy = false;
      renderSounds();
    }, () => { adding = null; renderSounds(); }, (v) => { adding.name = v; });
  }
  function dropMine(s) {
    const m = mine.find((x) => x.sid === s);
    if (!m) return;
    mine = mine.filter((x) => x !== m);
    mySounds.del(s);
    clearTimeout(uploads.get(s)?.timer);
    uploads.delete(s);
  }
  const soundPane = h('div', '', builtinGrid, roomLabel, roomGrid, slot, addBtn, soundIn, sw);

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
  mineReady = mySounds.list().then((list) => { mine = list.slice(0, MAX_MINE); renderSounds(); });

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

  function put({ sid: s, by, name, data }) {
    if (typeof s !== 'string' || !AUDIO.test(data)) return false;
    roomSounds.set(s, { by, name: cut(name), data });
    clearTimeout(uploads.get(s)?.timer);
    uploads.delete(s);
    return true;
  }

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
      const item = b ? null : roomSounds.get(s);
      const name = b?.label ?? item?.name;
      if (!name) return;
      if (!(othersOff && id !== getSelf())) {
        if (b) playBuiltin(b.id);
        else playDataUrl(item.data);
      }
      float(id, 'sound', h('div', 'ep-snd', svg(TOP.sound), h('span', '', name)));
    },
    addRoomSound(item) {
      if (put(item)) renderSounds();
    },
    setRoomSounds(items) {
      roomSounds.clear();
      for (const it of items ?? []) put(it);
      renderSounds();
    },
    removeRoomSound(s) { // server sndDel
      roomSounds.delete(s);
      dropMine(s);
      if (editing?.sid === s) editing = null;
      renderSounds();
    },
    renameRoomSound(s, name) { // server sndRename
      const it = roomSounds.get(s);
      const m = mine.find((x) => x.sid === s);
      if (it) it.name = cut(name);
      if (m) { m.name = cut(name); mySounds.put(m); }
      renderSounds();
    },
    // Call after joining a room (and after setRoomSounds): re-uploads my saved sounds the room does not have yet, 10.5 s apart.
    async syncMine() {
      await mineReady;
      queue = mine.filter((m) => !roomSounds.has(m.sid) && uploads.get(m.sid)?.state !== 'pending');
      drain();
    },
    handleError(text) { // server error text, e.g. a rejected sndAdd/sndDel/sndRename
      say(text);
      for (const k of uploads.keys()) failUpload(k);
    },
    clearRoom() {
      roomSounds.clear();
      for (const u of uploads.values()) clearTimeout(u.timer);
      uploads.clear();
      clearTimeout(queueTimer);
      queue = [];
      editing = null;
      renderSounds();
      for (const f of [...floats]) drop(f);
    },
    setMuted: setMediaMuted,
    update() { for (const f of floats) place(f); },
  };
  return api;
}
