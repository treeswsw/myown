import './lobby.css';
import { openAvatarCrop } from './avatarCrop.js';

// createLobby({onLogin(id, avatarDataUrl|null), onAvatar(dataUrl), onCreate(mode), onJoin(code),
//              onMode(mode), onStart(), onLeave(), onLogout()})
// -> { el, setUser(user|null), setRoom(roomState|null), setError(msg|null), show(), hide() }

const MODES = {
  holdem: { name: '텍사스 홀덤', desc: '2~6명 · 블라인드 50/100', max: 6, color: '#c01c1c' },
  bluff: { name: '블러핑 카드', desc: '2~4명 · 리볼버 벌칙', max: 4, color: '#3a3f46' },
};
const ID_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]{2,12}$/;
const LAST_ID_KEY = 'gs.lastId';
const SPADE = 'M12 2C8 7 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2L9.5 22h5l-1.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-5-7-9-12z';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(label, cls, onClick) {
  const b = h('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function field(cls, placeholder, maxLength, label) {
  const i = h('input', 'field ' + cls);
  i.placeholder = placeholder;
  i.maxLength = maxLength;
  i.autocomplete = 'off';
  i.spellcheck = false;
  i.setAttribute('aria-label', label);
  return i;
}
function store(fn) { try { return fn(); } catch { return null; } }

function logo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', SPADE);
  svg.append(p);
  const i = h('i');
  i.append(svg);
  const t = h('h1', 'logo');
  t.append(i, document.createTextNode('갱식 클럽'));
  return t;
}

// Photo or initial-letter avatar. `tag` is div (static) or button (tap to change).
function avatar(tag, user, label) {
  const e = h(tag, 'av');
  if (tag === 'button') { e.type = 'button'; e.setAttribute('aria-label', label); }
  setAvatar(e, user);
  return e;
}
function setAvatar(e, user) {
  e.replaceChildren();
  if (user && user.avatar) {
    const img = h('img');
    img.src = user.avatar;
    img.alt = '';
    e.append(img);
  } else if (user && user.name) {
    e.append(h('span', 'av-letter', [...user.name][0].toUpperCase()));
  }
}

function modeCards(onPick) {
  const el = h('div', 'modes');
  const cards = {};
  for (const [key, m] of Object.entries(MODES)) {
    const c = h('button', 'mode');
    c.type = 'button';
    const b = h('b');
    const dot = h('span', 'dot');
    dot.style.background = m.color;
    b.append(dot, document.createTextNode(m.name));
    c.append(b, h('span', null, m.desc));
    c.addEventListener('click', () => onPick(key));
    cards[key] = c;
    el.append(c);
  }
  return {
    el,
    set(mode, enabled = true) {
      for (const [k, c] of Object.entries(cards)) {
        c.classList.toggle('on', k === mode);
        c.setAttribute('aria-pressed', String(k === mode));
        c.disabled = !enabled;
      }
    },
  };
}

export function createLobby({ onLogin, onAvatar, onCreate, onJoin, onMode, onStart, onLeave, onLogout }) {
  const el = h('div', 'lobby');
  let user = null, room = null, pendingAvatar = null, copyTimer = 0;

  const fileInput = h('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  let onPicked = null;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    const data = file && await openAvatarCrop(file);
    fileInput.value = '';
    if (data && onPicked) onPicked(data);
  });
  function choosePhoto(cb) { onPicked = cb; fileInput.click(); }

  // ---------- 1. logged out ----------
  const out = h('section', 'panel narrow');
  const outPhoto = h('button', 'photo');
  outPhoto.type = 'button';
  outPhoto.setAttribute('aria-label', '프로필 사진 고르기');
  const outPhotoHint = h('span');
  function renderOutPhoto() {
    outPhoto.replaceChildren();
    if (pendingAvatar) {
      const img = h('img');
      img.src = pendingAvatar;
      img.alt = '';
      outPhoto.append(img);
    } else {
      outPhoto.append(h('b', null, '+'), outPhotoHint);
      outPhotoHint.textContent = '프로필 사진';
    }
    outPhoto.classList.toggle('filled', !!pendingAvatar);
  }
  outPhoto.addEventListener('click', () => choosePhoto((d) => { pendingAvatar = d; renderOutPhoto(); }));
  const idInput = field('center', '아이디', 12, '아이디');
  idInput.value = store(() => localStorage.getItem(LAST_ID_KEY)) || '';
  const outErr = h('p', 'err');
  outErr.setAttribute('role', 'alert');
  function submitLogin() {
    const id = idInput.value.trim();
    if (!ID_RE.test(id)) {
      outErr.textContent = '아이디는 2~12자의 한글, 영문, 숫자, _만 쓸 수 있습니다.';
      idInput.focus();
      return;
    }
    outErr.textContent = '';
    store(() => localStorage.setItem(LAST_ID_KEY, id));
    onLogin(id, pendingAvatar);
  }
  idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  idInput.addEventListener('input', () => { outErr.textContent = ''; });
  out.append(logo(), h('p', 'sub', '아이디를 입력하면 칩과 전적이 이어집니다'), outPhoto, idInput, outErr,
    button('입장', 'primary', submitLogin));
  renderOutPhoto();

  // ---------- 2. logged in, no room ----------
  const home = h('div', 'pair');
  const profile = h('section', 'panel');
  const meAv = avatar('button', null, '프로필 사진 바꾸기');
  meAv.classList.add('big');
  meAv.addEventListener('click', () => choosePhoto((d) => onAvatar(d)));
  const meName = h('div', 'me-name');
  const meBank = h('div', 'chips');
  const stats = h('dl', 'stats');
  const statDefs = [['hands', '판 수'], ['wins', '승리'], ['biggestWin', '최대 획득'], ['bluffWins', '블러핑 우승'], ['refills', '리필']];
  const statVals = {};
  for (const [k, label] of statDefs) {
    const d = h('div');
    statVals[k] = h('dd', null, '0');
    d.append(h('dt', null, label), statVals[k]);
    stats.append(d);
  }
  const who = h('div', 'who');
  const whoText = h('div');
  whoText.append(meName, meBank);
  who.append(meAv, whoText);
  profile.append(logo(), who, stats, h('div', 'grow'), button('로그아웃', 'link', () => onLogout()));

  const play = h('section', 'panel');
  let pickedMode = 'holdem';
  const homeModes = modeCards((m) => { pickedMode = m; homeModes.set(m); });
  homeModes.set(pickedMode);
  const joinInput = field('code', 'ABCD', 4, '방 코드 4글자');
  const homeErr = h('p', 'err');
  homeErr.setAttribute('role', 'alert');
  function submitJoin() {
    const code = joinInput.value;
    if (code.length !== 4) { homeErr.textContent = '방 코드는 영문 4글자입니다.'; joinInput.focus(); return; }
    homeErr.textContent = '';
    onJoin(code);
  }
  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    homeErr.textContent = '';
  });
  joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });
  const joinRow = h('div', 'join');
  joinRow.append(joinInput, button('입장', 'glass', submitJoin));
  const orRow = h('div', 'or', '또는');
  play.append(h('h2', null, '방 만들기'), homeModes.el,
    button('방 만들기', 'primary', () => { homeErr.textContent = ''; onCreate(pickedMode); }),
    orRow, h('h2', null, '친구 방에 들어가기'), joinRow, homeErr);
  home.append(profile, play);

  // ---------- 3. room (waiting) ----------
  const roomView = h('div', 'pair');
  const info = h('section', 'panel');
  const codeEl = h('div', 'room-code');
  const copyBtn = button('코드 복사', 'glass', copyCode);
  const copyNote = h('p', 'note');
  copyNote.setAttribute('role', 'status');
  const roomModes = modeCards((m) => onMode(m));
  const modeLabel = h('p', 'mode-label');
  info.append(h('h2', null, '방 코드'), codeEl, copyBtn, copyNote, h('div', 'grow'), roomModes.el, modeLabel);

  const people = h('section', 'panel');
  const count = h('h2');
  const list = h('ul', 'players');
  const startBtn = button('게임 시작', 'primary', () => onStart());
  const roomMsg = h('p', 'note');
  const roomErr = h('p', 'err');
  roomErr.setAttribute('role', 'alert');
  const leaveBtn = button('나가기', 'glass', () => onLeave());
  const actions = h('div', 'actions');
  people.append(count, list, roomMsg, roomErr, actions);
  roomView.append(info, people);

  async function copyCode() {
    const code = room.code;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch {
      const t = h('textarea');
      t.value = code;
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      t.remove();
    }
    copyNote.textContent = ok ? '복사했습니다' : '복사하지 못했습니다. 코드를 직접 적어 주세요.';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyNote.textContent = ''; }, 2000);
  }

  function renderRoom() {
    const max = MODES[room.mode].max;
    const isHost = room.hostId === room.you;
    codeEl.textContent = room.code;
    roomModes.set(room.mode, isHost);
    modeLabel.textContent = isHost ? '' : '방장이 게임을 고릅니다';
    count.textContent = `참가자 ${room.players.length}/${max}`;
    list.replaceChildren(...room.players.map((p) => {
      const li = h('li', p.connected === false ? 'off' : '');
      const info = h('div', 'p-name', p.name);
      li.append(avatar('div', p), info);
      if (p.id === room.hostId) li.append(h('span', 'badge', '방장'));
      if (p.id === room.you) li.append(h('span', 'badge me', '나'));
      if (p.connected === false) li.append(h('span', 'badge off', '연결 끊김'));
      return li;
    }));
    const n = room.players.length;
    if (isHost) {
      startBtn.disabled = n < 2 || n > max;
      roomMsg.textContent = n < 2 ? '2명 이상 모이면 시작할 수 있습니다' : n > max ? `이 게임은 최대 ${max}명입니다` : '';
      actions.replaceChildren(startBtn, leaveBtn);
    } else {
      roomMsg.textContent = '방장이 시작하기를 기다리는 중';
      actions.replaceChildren(leaveBtn);
    }
  }

  // ---------- state ----------
  el.append(out, home, roomView, fileInput);
  function render() {
    out.hidden = !!user;
    home.hidden = !user || !!room;
    roomView.hidden = !user || !room;
    if (user) {
      setAvatar(meAv, user);
      meName.textContent = user.name;
      meBank.textContent = `${(user.bank ?? 0).toLocaleString('ko-KR')} 칩`;
      for (const [k] of statDefs) statVals[k].textContent = (user.stats?.[k] ?? 0).toLocaleString('ko-KR');
    }
    if (user && room) renderRoom();
  }
  render();

  return {
    el,
    setUser(u) { user = u; if (!u) room = null; render(); },
    setRoom(r) { room = r; render(); },
    setError(msg) {
      const text = msg || '';
      (!user ? outErr : room ? roomErr : homeErr).textContent = text;
    },
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
  };
}
