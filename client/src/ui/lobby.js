import './lobby.css';
import { openAvatarCrop } from './avatarCrop.js';
import { h, svg, avatar, fmt } from './dom.js';

// createLobby({onLogin(id, avatarDataUrl|null), onAvatar(dataUrl), onCreate(mode), onJoin(code),
//              onMode(mode), onStart(), onLeave(), onLogout()})
// -> { el, setUser(user|null), setRoom(roomState|null), setRooms(list), setError(msg|null), show(), hide() }
//    list = [{code, mode, hostName, count, max, phase}]  (open rooms; tapping one calls onJoin(code))

const MODES = {
  holdem: { name: '텍사스 홀덤', desc: '2~6명 · 블라인드 50/100', max: 6 },
  bluff: { name: '블러핑 카드', desc: '2~4명 · 리볼버 벌칙', max: 4 },
};
const ID_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]{2,12}$/;
const LAST_ID_KEY = 'gs.lastId';
const SPADE = '<path d="M12 2C8 7 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2L9.5 22h5l-1.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-5-7-9-12z"/>';
const STATS = [['hands', '판 수'], ['wins', '승리'], ['biggestWin', '최대 획득'], ['bluffWins', '블러핑 우승']];

function button(label, cls, onClick) {
  const b = h('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function err() {
  const p = h('p', 'err');
  p.setAttribute('role', 'alert');
  return p;
}
function brand(cls) {
  return h('h1', 'brand ' + cls, svg(SPADE), '갱식 클럽');
}

// Segmented control with a sliding thumb. Returns { el, caption, set(mode, enabled) }.
function segmented(onPick) {
  const el = h('div', 'seg');
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', '게임 종류');
  const caption = h('p', 'cap');
  const keys = Object.keys(MODES);
  const btns = keys.map((k) => {
    const b = h('button', 'seg-item', MODES[k].name);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => onPick(k));
    return b;
  });
  el.append(h('span', 'seg-thumb'), ...btns);
  return {
    el, caption,
    set(mode, enabled = true) {
      el.style.setProperty('--i', keys.indexOf(mode));
      btns.forEach((b, i) => { b.setAttribute('aria-checked', String(keys[i] === mode)); b.disabled = !enabled; });
      caption.textContent = MODES[mode].desc;
    },
  };
}

export function createLobby({ onLogin, onAvatar, onCreate, onJoin, onMode, onStart, onLeave, onLogout }) {
  const el = h('div', 'lobby');
  let user = null, room = null, pendingAvatar = null;

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
  function renderOutPhoto() {
    outPhoto.replaceChildren(pendingAvatar ? avatar({ avatar: pendingAvatar }, 'av') : h('span', null, '사진'));
  }
  outPhoto.addEventListener('click', () => choosePhoto((d) => { pendingAvatar = d; renderOutPhoto(); }));
  const idInput = h('input', 'field');
  idInput.placeholder = '아이디';
  idInput.maxLength = 12;
  idInput.autocomplete = 'off';
  idInput.spellcheck = false;
  idInput.setAttribute('aria-label', '아이디');
  idInput.value = (() => { try { return localStorage.getItem(LAST_ID_KEY) || ''; } catch { return ''; } })();
  const outErr = err();
  function submitLogin() {
    const id = idInput.value.trim();
    if (!ID_RE.test(id)) {
      outErr.textContent = '아이디는 2~12자의 한글, 영문, 숫자, _만 쓸 수 있습니다.';
      idInput.focus();
      return;
    }
    outErr.textContent = '';
    try { localStorage.setItem(LAST_ID_KEY, id); } catch { /* ignore */ }
    onLogin(id, pendingAvatar);
  }
  idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  idInput.addEventListener('input', () => { outErr.textContent = ''; });
  const form = h('div', 'stack');
  form.append(idInput, outErr);
  out.append(brand('large'), outPhoto, form, button('입장', 'primary', submitLogin));
  renderOutPhoto();

  // ---------- 2. logged in, no room ----------
  const home = h('div', 'pair');
  const profile = h('section', 'panel');
  const meAv = h('button', 'av-btn');
  meAv.type = 'button';
  meAv.setAttribute('aria-label', '프로필 사진 바꾸기');
  meAv.addEventListener('click', () => choosePhoto((d) => onAvatar(d)));
  const meName = h('div', 'name');
  const meBank = h('div', 'sub');
  const statVals = {};
  const stats = h('dl', 'group');
  for (const [k, label] of STATS) {
    statVals[k] = h('dd');
    stats.append(h('div', 'row', h('dt', null, label), statVals[k]));
  }
  const brokeNote = h('div', 'notice', h('p', null, '칩을 모두 잃었습니다. 홀덤은 새 아이디로 다시 시작해야 합니다.'),
    button('새 아이디로 시작', 'text accent', () => onLogout()));
  profile.append(brand('small'), h('div', 'who', meAv, h('div', null, meName, meBank)), brokeNote, stats,
    h('div', 'grow'), button('로그아웃', 'text', () => onLogout()));

  const play = h('section', 'panel');
  let pickedMode = 'holdem';
  const homeSeg = segmented((m) => { pickedMode = m; homeSeg.set(m); updateCreate(); });
  homeSeg.set(pickedMode);
  const createBtn = button('방 만들기', 'primary', () => { homeErr.textContent = ''; onCreate(pickedMode); });
  const createNote = h('p', 'cap');
  const isBroke = () => user != null && (user.chips ?? user.bank) === 0;
  function updateCreate() {
    const blocked = isBroke() && pickedMode === 'holdem';
    createBtn.disabled = blocked;
    createNote.textContent = blocked ? '칩이 없어 홀덤 방은 만들 수 없습니다.' : '';
  }
  const homeErr = err();
  const roomList = h('div', 'group rooms');
  const emptyNote = h('p', 'empty', '열린 방이 없습니다. 새 게임을 만들어 보세요.');
  const rows = new Map();
  let lastRooms = [];
  play.append(h('h2', null, '새 게임'), h('div', 'stack seg-box', homeSeg.el, homeSeg.caption),
    createBtn, createNote,
    h('hr'), h('h2', null, '열린 방'), roomList, emptyNote, homeErr);

  function roomRow(code) {
    const b = h('button', 'row room-row');
    b.type = 'button';
    b.addEventListener('click', () => { homeErr.textContent = ''; onJoin(code); });
    const parts = { title: h('b'), host: h('span', 'sub'), count: h('span', 'count'), state: h('span', 'tags') };
    b.append(h('span', 'rr-main', parts.title, parts.host), parts.count, parts.state, svg('<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'));
    const chev = b.lastChild;
    chev.setAttribute('class', 'chev');
    return { b, chev, ...parts };
  }
  function renderRooms(list) {
    lastRooms = list;
    const seen = new Set();
    let ref = roomList.firstChild;
    for (const r of list) {
      seen.add(r.code);
      let row = rows.get(r.code);
      if (!row) rows.set(r.code, row = roomRow(r.code));
      const full = r.count >= r.max;
      row.title.textContent = MODES[r.mode]?.name ?? r.mode;
      row.host.textContent = `${r.hostName}의 방`;
      row.count.textContent = `${r.count}/${r.max}`;
      row.state.textContent = full ? '가득 참' : r.phase === 'lobby' ? '대기 중' : '게임 중';
      row.b.disabled = full;
      const watch = isBroke() && r.mode === 'holdem' && !full;
      row.chev.style.visibility = watch ? 'hidden' : '';
      if (watch) row.state.textContent = '관전';
      if (row.b === ref) ref = ref.nextSibling;
      else roomList.insertBefore(row.b, ref);
    }
    for (const [code, row] of rows) if (!seen.has(code)) { row.b.remove(); rows.delete(code); }
    roomList.hidden = list.length === 0;
    emptyNote.hidden = list.length > 0;
  }
  home.append(profile, play);

  // ---------- 3. room (waiting) ----------
  const roomView = h('div', 'pair');
  const info = h('section', 'panel');
  const roomTitle = h('h2');
  const roomSeg = segmented((m) => onMode(m));
  info.append(roomTitle, h('div', 'stack', roomSeg.el, roomSeg.caption));

  const people = h('section', 'panel');
  const count = h('h2');
  const list = h('ul', 'group players');
  const startBtn = button('게임 시작', 'primary', () => onStart());
  const roomMsg = h('p', 'cap center');
  const roomErr = err();
  const leaveBtn = button('나가기', 'text danger', () => onLeave());
  const actions = h('div', 'actions');
  people.append(count, list, roomMsg, roomErr, actions);
  roomView.append(info, people);

  function renderRoom() {
    const max = MODES[room.mode].max;
    const isHost = room.hostId === room.you;
    roomTitle.textContent = `${room.players.find((p) => p.id === room.hostId)?.name ?? ''}의 방`;
    roomSeg.set(room.mode, isHost);
    count.textContent = `참가자 ${room.players.length}/${max}`;
    list.replaceChildren(...room.players.map((p) => {
      const tags = [p.id === room.hostId && '방장', p.id === room.you && '나', p.connected === false && '연결 끊김'].filter(Boolean);
      return h('li', 'row' + (p.connected === false ? ' off' : ''), avatar(p), h('span', 'p-name', p.name), h('span', 'tags', tags.join(' · ')));
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
      meAv.replaceChildren(avatar(user, 'av big'));
      meName.textContent = user.name;
      const chips = user.chips ?? user.bank ?? 0;
      meBank.textContent = `${fmt(chips)} 칩`;
      brokeNote.hidden = chips !== 0;
      for (const [k] of STATS) statVals[k].textContent = fmt(user.stats?.[k] ?? 0);
    }
    if (user && room) renderRoom();
    updateCreate();
    renderRooms(lastRooms);
  }
  render();

  return {
    el,
    setUser(u) { user = u; if (!u) room = null; render(); },
    setRoom(r) { room = r; render(); },
    setRooms(list) { renderRooms(list); },
    setError(msg) { (!user ? outErr : room ? roomErr : homeErr).textContent = msg || ''; },
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
  };
}
