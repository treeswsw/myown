import './lobby.css';
import { openAvatarCrop } from './avatarCrop.js';
import { h, svg, avatar, fmt } from './dom.js';
import { GAME_NAME as GSK_NAME } from '../../../shared/gsk/name.js';
import { GAME_NAME as DRAW_NAME } from '../../../shared/draw/name.js';
import { item as shopItem, GRADES } from '../../../shared/coin/shop.js';

// 뽑기 버튼은 나중에 공개. true 로 바꾸면 다시 보인다.
const SHOW_DRAW = false;

// createLobby({onLogin(id, avatarDataUrl|null, pw|undefined), onAvatar(dataUrl), onCreate(mode), onJoin(code),
//              onMode(mode), onStart(), onLeave(), onLogout()})
// -> { el, setUser(user|null), setRoom(roomState|null), setRooms(list), setError(msg|null), showNotice(text), showResetConfirm(), show(), hide(), setLiar(visible), setYacht(visible), setDraw(visible), setGsk(visible), showRank({top, mine}) }
// onRank() -> ask the server for the liar ranking, then call showRank.
// onResetConfirm(adminPw) is called when the user confirms 전체 초기화 (adminPw: string|undefined).
// onLogin(id, avatar, adminPw, {pin, newPin}) - 4th arg fields are undefined when empty.
// onCoin('shop'|'draw'|'cap'|'look'|'swap'|'rank'|'pin'): coin buttons in the profile (shown only when user.wallet exists).
// askPin(msg) shows the PIN field (server pin_need); loginError(code,msg) shows pin_bad/pin_lock/pin_exists/pin_fmt/adm_*;
// resetError(msg) shows an error inside the reset confirm sheet (adm_pw/adm_lock).
//    list = [{code, mode, hostName, count, max, phase}]  (open rooms; tapping one calls onJoin(code))

const MODES = {
  holdem: { name: '텍사스 홀덤', desc: '2~6명 · 블라인드 50/100', max: 6 },
  bluff: { name: '블러핑 카드', desc: '2~4명 · 리볼버 벌칙', max: 4 },
  liar: { name: '라이어게임', desc: '3~8명 · 말로 하는 추리', max: 8 },
  yacht: { name: '요트다이스', desc: '2~4명 · 주사위 5개', max: 4 },
  draw: { name: DRAW_NAME, desc: '2~8명 · 그림 보고 단어 맞히기', max: 8 },
  gsk: { name: GSK_NAME, desc: '3~6명 · 해골을 피해 꽃 뒤집기', max: 6 },
};
const BASE_KEYS = ['holdem', 'bluff'];
// Home picker order is fixed: holdem, bluff, liar, yacht, draw, gsk (only the visible ones).
const keysFor = (liar, yacht, draw, gsk) => [...BASE_KEYS, ...(liar ? ['liar'] : []), ...(yacht ? ['yacht'] : []), ...(draw ? ['draw'] : []), ...(gsk ? ['gsk'] : [])];
const ID_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]{2,12}$/;
const LAST_ID_KEY = 'gs.lastId';
const SPADE = '<path d="M12 2C8 7 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2L9.5 22h5l-1.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-5-7-9-12z"/>';
const STATS = [['hands', '판 수'], ['wins', '승리'], ['biggestWin', '최대 획득'], ['bluffWins', '블러핑 우승']];

function button(label, cls, onClick) {
  const b = h('button', 'lb-btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function err() {
  const p = h('p', 'lb-err');
  p.setAttribute('role', 'alert');
  return p;
}
function brand(cls) {
  return h('h1', 'lb-brand ' + cls, svg(SPADE), '갱식 클럽');
}

// Segmented control with a sliding thumb. Returns { el, caption, set(mode, enabled) }.
function segmented(onPick, initKeys = BASE_KEYS) {
  const el = h('div', 'lb-seg');
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', '게임 종류');
  const caption = h('p', 'lb-cap');
  let keys = initKeys, btns = [];
  function build(next) {
    keys = next;
    btns = keys.map((k) => {
      const b = h('button', 'lb-seg-item', MODES[k].name);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => onPick(k));
      return b;
    });
    // 3 or fewer: one row. 4+: two rows (top row gets the extra one), each row centred on a 6-column grid.
    const n = keys.length, top = n > 3 ? Math.ceil(n / 2) : n;
    const span = 6 / top, m = n - top;
    btns.forEach((b, i) => { b.style.gridColumn = i === top && m ? `${1 + (6 - m * span) / 2} / span ${span}` : `span ${span}`; });
    el.classList.toggle('lb-seg-2row', n > 3);
    el.replaceChildren(...btns);
  }
  build(keys);
  return {
    el, caption,
    setKeys(next) { build(next); },
    set(mode, enabled = true) {
      btns.forEach((b, i) => { b.setAttribute('aria-checked', String(keys[i] === mode)); b.disabled = !enabled; });
      caption.textContent = MODES[mode].desc;
    },
  };
}

export function createLobby({ onLogin, onAvatar, onCreate, onJoin, onMode, onStart, onLeave, onLogout, onResetConfirm, onRank, onCoin }) {
  const el = h('div', 'lb-root lobby');
  let user = null, room = null, pendingAvatar = null, liarOn = false, yachtOn = false, drawOn = false, gskOn = false;

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
  const out = h('section', 'lb-panel lb-narrow panel narrow');
  const outPhoto = h('button', 'lb-photo');
  outPhoto.type = 'button';
  outPhoto.setAttribute('aria-label', '프로필 사진 고르기');
  function renderOutPhoto() {
    outPhoto.replaceChildren(pendingAvatar ? avatar({ avatar: pendingAvatar }, 'lb-av') : h('span', null, '사진'));
  }
  outPhoto.addEventListener('click', () => choosePhoto((d) => { pendingAvatar = d; renderOutPhoto(); }));
  const idInput = h('input', 'lb-field');
  idInput.placeholder = '아이디';
  idInput.maxLength = 12;
  idInput.autocomplete = 'off';
  idInput.spellcheck = false;
  idInput.setAttribute('aria-label', '아이디');
  idInput.value = (() => { try { return localStorage.getItem(LAST_ID_KEY) || ''; } catch { return ''; } })();
  // admin (SPEC 21-1): the password field only exists while the ID is exactly 관리자
  // created lazily so normal users have no admin trace in the DOM
  let pwInput = null;
  const makePw = () => {
    const i = h('input', 'lb-field');
    i.type = 'password';
    i.inputMode = 'numeric';
    i.autocomplete = 'current-password';
    i.placeholder = '비밀번호';
    i.maxLength = 32;
    i.setAttribute('aria-label', '관리자 비밀번호');
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
    i.addEventListener('input', () => { outErr.textContent = ''; });
    return i;
  };
  const syncPw = () => {
    if (idInput.value.trim() === '관리자') {
      if (!pwInput) { pwInput = makePw(); idInput.after(pwInput); }
    } else if (pwInput) { pwInput.remove(); pwInput = null; }
  };
  const outErr = err();
  // PIN (SPEC 22-8): optional 4-digit password. newPin box via checkbox, pin box after pin_need.
  const pinField = (label, ac) => {
    const i = h('input', 'lb-field');
    i.type = 'password';
    i.inputMode = 'numeric';
    i.pattern = '[0-9]*';
    i.autocomplete = ac;
    i.placeholder = label;
    i.maxLength = 4;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); outErr.textContent = ''; });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
    return i;
  };
  const pinInput = pinField('비밀번호 4자리', 'current-password');
  pinInput.hidden = true;
  const newPinInput = pinField('새 비밀번호 4자리', 'new-password');
  newPinInput.hidden = true;
  const pinChk = h('input', 'lb-pin-chk');
  pinChk.type = 'checkbox';
  pinChk.id = 'lb-pin-chk';
  const pinChkRow = h('label', 'lb-pin-row', pinChk, h('span', null, '비밀번호 설정'));
  pinChkRow.htmlFor = 'lb-pin-chk';
  pinChk.addEventListener('change', () => {
    newPinInput.hidden = !pinChk.checked;
    if (pinChk.checked) newPinInput.focus(); else newPinInput.value = '';
  });
  function resetPinFields() {
    pinChk.checked = false;
    newPinInput.hidden = true;
    newPinInput.value = '';
    pinInput.hidden = true;
    pinInput.value = '';
  }
  function submitLogin() {
    const id = idInput.value.trim();
    if (!ID_RE.test(id)) {
      outErr.textContent = '아이디는 2~12자의 한글, 영문, 숫자, _만 쓸 수 있습니다.';
      idInput.focus();
      return;
    }
    outErr.textContent = '';
    try { localStorage.setItem(LAST_ID_KEY, id); } catch { /* ignore */ }
    if (pinChk.checked && !/^\d{4}$/.test(newPinInput.value)) {
      outErr.textContent = '비밀번호는 숫자 4자리입니다.';
      newPinInput.focus();
      return;
    }
    syncPw();
    const pin = !pinInput.hidden && pinInput.value ? pinInput.value : undefined;
    const newPin = pinChk.checked && newPinInput.value ? newPinInput.value : undefined;
    onLogin(id, pendingAvatar, pwInput && pwInput.value ? pwInput.value : undefined, { pin, newPin });
  }
  idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  idInput.addEventListener('input', syncPw);
  syncPw();
  const outInfo = h('p', 'lb-cap lb-center');
  idInput.addEventListener('input', () => { outErr.textContent = ''; outInfo.textContent = ''; });
  const form = h('div', 'lb-stack');
  form.append(outInfo, idInput, pinInput, pinChkRow, newPinInput, outErr);
  syncPw();
  out.append(brand('lb-large'), outPhoto, form, button('입장', 'lb-primary', submitLogin));
  renderOutPhoto();

  // ---------- 2. logged in, no room ----------
  const home = h('div', 'lb-pair');
  const profile = h('section', 'lb-panel panel');
  const meAv = h('button', 'lb-av-btn');
  meAv.type = 'button';
  meAv.setAttribute('aria-label', '프로필 사진 바꾸기');
  meAv.addEventListener('click', () => choosePhoto((d) => onAvatar(d)));
  const meName = h('div', 'lb-name');
  const meBank = h('div', 'lb-sub');
  const statVals = {};
  const stats = h('dl', 'lb-group');
  for (const [k, label] of STATS) {
    statVals[k] = h('dd');
    stats.append(h('div', 'lb-row', h('dt', null, label), statVals[k]));
  }
  const brokeNote = h('div', 'lb-notice', h('p', null, '칩을 모두 잃었습니다. 홀덤은 새 아이디로 다시 시작해야 합니다.'),
    button('새 아이디로 시작', 'lb-text lb-accent', () => onLogout()));
  const titleBadge = h('div', 'lb-title-badge');
  titleBadge.hidden = true;
  const walletRow = h('div', 'lb-sub lb-coins');
  const coinBtns = h('div', 'lb-coin-btns');
  for (const [a, label] of [['shop', '상점'], ['draw', '카드 뽑기'], ['swap', '교환'], ['rank', '코인 랭킹']]) {
    const b = button(label, 'lb-tint lb-coin-btn', () => onCoin?.(a));
    if (a === 'draw' && !SHOW_DRAW) b.hidden = true;
    coinBtns.append(b);
  }
  const pinBtn = button('비밀번호', 'lb-tint lb-coin-btn lb-pin-btn', () => onCoin?.('pin'));
  const coinBox = h('div', 'lb-coin-box', coinBtns, pinBtn);
  coinBox.hidden = true;
  walletRow.hidden = true;
  const rankBtn = button('라이어 랭킹', 'lb-tint lb-rank-btn', () => onRank?.());
  rankBtn.hidden = true;
  profile.append(brand('lb-small'), h('div', 'lb-who', meAv, h('div', null, titleBadge, meName, meBank, walletRow)), brokeNote, coinBox, stats,
    rankBtn, h('div', 'lb-grow'), button('로그아웃', 'lb-text', () => onLogout()));

  const play = h('section', 'lb-panel panel');
  let pickedMode = 'holdem';
  const homeSeg = segmented((m) => { pickedMode = m; homeSeg.set(m); updateCreate(); });
  homeSeg.set(pickedMode);
  const createBtn = button('방 만들기', 'lb-primary', () => { homeErr.textContent = ''; onCreate(pickedMode); });
  const createNote = h('p', 'lb-cap');
  const isBroke = () => user != null && (user.chips ?? user.bank) === 0;
  function updateCreate() {
    const blocked = isBroke() && pickedMode === 'holdem';
    createBtn.disabled = blocked;
    createNote.textContent = blocked ? '칩이 없어 홀덤 방은 만들 수 없습니다.' : '';
  }
  const homeErr = err();
  const roomList = h('div', 'lb-group lb-rooms');
  const emptyNote = h('p', 'lb-empty', '열린 방이 없습니다. 새 게임을 만들어 보세요.');
  const rows = new Map();
  let lastRooms = [];
  play.append(h('h2', null, '새 게임'), h('div', 'lb-stack lb-seg-box', homeSeg.el, homeSeg.caption),
    createBtn, createNote,
    h('hr'), h('h2', null, '열린 방'), roomList, emptyNote, homeErr);

  function roomRow(code) {
    const b = h('button', 'lb-row lb-room-row');
    b.type = 'button';
    b.addEventListener('click', () => { homeErr.textContent = ''; onJoin(code); });
    const parts = { title: h('b'), host: h('span', 'lb-sub'), count: h('span', 'lb-count'), state: h('span', 'lb-tags') };
    b.append(h('span', 'lb-rr-main', parts.title, parts.host), parts.count, parts.state, svg('<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'));
    const chev = b.lastChild;
    chev.setAttribute('class', 'lb-chev');
    return { b, chev, ...parts };
  }
  function renderRooms(all) {
    lastRooms = all;
    const list = all.filter((r) => (r.mode !== 'liar' || liarOn) && (r.mode !== 'yacht' || yachtOn) && (r.mode !== 'draw' || drawOn) && (r.mode !== 'gsk' || gskOn));
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
  const roomView = h('div', 'lb-pair');
  const info = h('section', 'lb-panel panel');
  const roomTitle = h('h2');
  const roomSeg = segmented((m) => onMode(m), BASE_KEYS);
  info.append(roomTitle, h('div', 'lb-stack', roomSeg.el, roomSeg.caption));

  const people = h('section', 'lb-panel panel');
  const count = h('h2');
  const list = h('ul', 'lb-group lb-players');
  const startBtn = button('게임 시작', 'lb-primary', () => onStart());
  const roomMsg = h('p', 'lb-cap lb-center');
  const roomErr = err();
  const leaveBtn = button('나가기', 'lb-text lb-danger', () => onLeave());
  const actions = h('div', 'lb-actions');
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
      return h('li', 'lb-row' + (p.connected === false ? ' lb-off' : ''), avatar(p, 'lb-av'), h('span', 'lb-p-name', p.name), h('span', 'lb-tags', tags.join(' · ')));
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

  // ---------- reset confirmation sheet ----------
  let resetErrEl = null, closeReset = null;
  function showResetConfirm() {
    const prev = document.activeElement;
    const cancel = h('button', 'lb-sheet-btn', '취소');
    const wipe = h('button', 'lb-sheet-btn lb-danger', '전부 지우기');
    const rpw = h('input', 'lb-field lb-reset-pw');
    rpw.type = 'password';
    rpw.inputMode = 'numeric';
    rpw.autocomplete = 'off';
    rpw.placeholder = '관리자 비밀번호';
    rpw.maxLength = 32;
    rpw.setAttribute('aria-label', '관리자 비밀번호');
    const rerr = h('p', 'lb-reset-err');
    rerr.setAttribute('role', 'alert');
    rpw.addEventListener('input', () => { rerr.textContent = ''; });
    resetErrEl = rerr;
    cancel.type = wipe.type = 'button';
    cancel.addEventListener('click', () => close());
    wipe.addEventListener('click', () => {
      // stays open so adm_pw/adm_lock can be shown here; main.js closes it via the lobby re-render or resetError
      rerr.textContent = '';
      onResetConfirm?.(rpw.value || undefined);
      closeReset = close;
    });
    rpw.addEventListener('keydown', (e) => { if (e.key === 'Enter') wipe.click(); });
    const sheet = h('div', 'lb-sheet', h('div', 'lb-sheet-body', h('b', null, '전체 초기화'),
      h('p', null, '모든 아이디와 칩, 전적, 프로필 사진을 지웁니다. 되돌릴 수 없습니다.'), rpw, rerr), h('div', 'lb-sheet-btns', cancel, wipe));
    sheet.setAttribute('role', 'alertdialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '전체 초기화');
    const overlay = h('div', 'lb-sheet-overlay', sheet);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Tab') {
        const first = e.shiftKey ? cancel : wipe;
        const last = e.shiftKey ? wipe : cancel;
        if (document.activeElement === first || !sheet.contains(document.activeElement)) { e.preventDefault(); last.focus(); }
      }
    };
    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (closeReset === close) closeReset = null;
      if (resetErrEl === rerr) resetErrEl = null;
      prev?.focus?.();
    }
    closeReset = close;
    document.addEventListener('keydown', onKey, true);
    el.append(overlay);
    rpw.focus();
  }

  // ---------- liar ranking window ----------
  // rankLines 와 같은 규칙(같은 점수는 같은 순위)을 여기에 둔다: 라이어 묶음을 로비가 받지 않게.
  function showRank({ top, mine } = {}) {
    const prev = document.activeElement;
    const rows = [];
    (Array.isArray(top) ? top : []).slice(0, 20).forEach((r, i) => {
      const score = Number(r?.score) || 0;
      const rank = rows[i - 1] && rows[i - 1].score === score ? rows[i - 1].rank : i + 1;
      rows.push({ rank, score, name: String(r?.name ?? ''), games: Number(r?.games) || 0 });
    });
    const mineText = mine && Number.isInteger(mine.rank) ? `내 순위 ${mine.rank}위 · ${Number(mine.score) || 0}점` : '아직 순위 없음';
    const closeBtn = h('button', 'lb-sheet-btn', '닫기');
    closeBtn.type = 'button';
    const body = h('div', 'lb-group lb-rank-list');
    if (!rows.length) body.append(h('p', 'lb-empty', '아직 순위가 없습니다.'));
    for (const r of rows) {
      body.append(h('div', 'lb-row lb-rank-row', h('span', 'lb-rank-n', String(r.rank)), h('span', 'lb-p-name', r.name),
        h('span', 'lb-tags', `${r.games}판`), h('b', 'lb-rank-s', `${r.score}점`)));
    }
    const sheet = h('div', 'lb-sheet lb-rank-sheet', h('div', 'lb-sheet-body', h('b', null, '라이어 랭킹')), body,
      h('p', 'lb-rank-mine', mineText), h('div', 'lb-sheet-btns lb-one', closeBtn));
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '라이어 랭킹');
    const overlay = h('div', 'lb-sheet-overlay lb-rank-overlay', sheet);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      prev?.focus?.();
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    el.append(overlay);
    closeBtn.focus();
  }

  function applyKeys() {
    homeSeg.setKeys(keysFor(liarOn, yachtOn, drawOn, gskOn));
    if ((!liarOn && pickedMode === 'liar') || (!yachtOn && pickedMode === 'yacht') || (!drawOn && pickedMode === 'draw') || (!gskOn && pickedMode === 'gsk')) pickedMode = 'holdem';
    homeSeg.set(pickedMode);
    updateCreate();
    renderRooms(lastRooms);
  }
  function setLiar(on) {
    on = !!on;
    if (on === liarOn) return;
    liarOn = on;
    rankBtn.hidden = !on;
    applyKeys();
  }
  function setYacht(on) {
    on = !!on;
    if (on === yachtOn) return;
    yachtOn = on;
    applyKeys();
  }
  function setGsk(on) {
    on = !!on;
    if (on === gskOn) return;
    gskOn = on;
    applyKeys();
  }
  function setDraw(on) {
    on = !!on;
    if (on === drawOn) return;
    drawOn = on;
    applyKeys();
  }

  // ---------- state ----------
  el.append(out, home, roomView, fileInput);
  function render() {
    out.hidden = !!user;
    home.hidden = !user || !!room;
    roomView.hidden = !user || !room;
    if (user) {
      meAv.replaceChildren(avatar(user, 'lb-av lb-big'));
      meName.textContent = user.name;
      const chips = user.chips ?? user.bank ?? 0;
      meBank.textContent = `${fmt(chips)} 칩`;
      const eq = user.wallet?.equip;
      const tItem = eq ? shopItem(eq.title) : null;
      const cItem = eq ? shopItem(eq.color) : null;
      const tText = tItem?.v?.text;
      titleBadge.hidden = !tText;
      titleBadge.textContent = tText || '';
      const gc = tItem ? GRADES[tItem.g]?.color : null;
      titleBadge.classList.toggle('lb-rainbow', gc === 'rainbow');
      titleBadge.style.borderColor = gc && gc !== 'rainbow' ? gc : '';
      const hex = cItem?.v?.hex;
      meName.style.color = Number.isFinite(hex) ? '#' + hex.toString(16).padStart(6, '0') : '';
      const coins = user.wallet?.coins;
      walletRow.hidden = !Number.isFinite(coins);
      if (!walletRow.hidden) walletRow.textContent = `${fmt(coins)} 코인`;
      coinBox.hidden = !user.wallet;
      coinBtns.hidden = !user.wallet;
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
    setUser(u) { if (u !== user) closeReset?.(); user = u; if (!u) room = null; resetPinFields(); render(); },
    setRoom(r) { room = r; render(); },
    setRooms(list) { renderRooms(list); },
    setError(msg) { (!user ? outErr : room ? roomErr : homeErr).textContent = msg || ''; },
    showNotice(text) { outInfo.textContent = text || ''; },
    showResetConfirm,
    // server said pin_need: reveal the PIN field
    askPin(msg) {
      pinInput.hidden = false;
      pinInput.value = '';
      const t = msg && typeof msg === 'object' ? msg.msg : msg;
      outErr.textContent = typeof t === 'string' && t ? t : '비밀번호를 입력하세요.';
      pinInput.focus();
    },
    loginError(code, msg) {
      if (code === 'pin_need') { this.askPin(msg); return; }
      if (code === 'pin_bad' || code === 'pin_lock') { pinInput.hidden = false; pinInput.value = ''; }
      if (code === 'pin_exists') { pinChk.checked = false; newPinInput.hidden = true; newPinInput.value = ''; }
      if (code === 'pin_fmt') { pinChk.checked = true; newPinInput.hidden = false; newPinInput.value = ''; }
      outErr.textContent = msg || '';
    },
    resetError(msg) { if (resetErrEl) resetErrEl.textContent = msg || ''; },
    closeReset() { closeReset?.(); },
    setLiar,
    setYacht,
    setDraw,
    setGsk,
    showRank,
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
  };
}
