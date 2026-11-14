import './lobby.css';
import { openAvatarCrop } from './avatarCrop.js';
import { h, svg, avatar, fmt } from './dom.js';
import { GAMES as MODES, visibleModes } from '../games.js';
import { NAMES as MINI_NAMES, GAME_IDS as MINI_IDS } from '../../../shared/mini/index.js';
import { playerAvatar, nameTag } from './kit/avatar.js';

// createLobby({onLogin(id, avatarDataUrl|null, pw|undefined), onAvatar(dataUrl), onCreate(mode), onJoin(code), onLogout()})
// -> { el, setUser(user|null), setRooms(list), setError(msg|null), showNotice(text), showResetConfirm(), show(), hide(), setFlags(me), showRank({top, mine}) }
// 방 안(대기실 포함)은 공통 방 틀(room/frame.js, room/wait.js)이 그린다. 로비는 방에 들어가면 숨는다(main.js).
// setFlags(me): 서버 'me' 메시지의 스위치 값으로 보일 게임을 정한다(games.js visibleModes).
// onRank() -> ask the server for the liar ranking, then call showRank.
// onResetConfirm(adminPw) is called when the user confirms 전체 초기화 (adminPw: string|undefined).
// onLogin(id, avatar, adminPw, {pin, newPin}) - 4th arg fields are undefined when empty.
// onCoin('shop'|'draw'|'cap'|'swap'|'rank'|'pin'): coin buttons in the profile (shown only when user.wallet exists).
// askPin(msg) shows the PIN field (server pin_need); loginError(code,msg) shows pin_bad/pin_lock/pin_exists/pin_fmt/adm_*;
// resetError(msg) shows an error inside the reset confirm sheet (adm_pw/adm_lock).
//    list = [{code, mode, hostName, count, max, phase}]  (open rooms; tapping one calls onJoin(code))

const BASE_KEYS = ['holdem', 'bluff'];
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
    if (n > 6) { // 7+: rows of 3, the leftover row centred (7 = 3/3/1)
      const full = n - (n % 3 || 3);
      btns.forEach((b, i) => { b.style.gridColumn = i === full ? `${1 + (6 - (n - full) * 2) / 2} / span 2` : 'span 2'; });
    } else btns.forEach((b, i) => { b.style.gridColumn = i === top && m ? `${1 + (6 - m * span) / 2} / span ${span}` : `span ${span}`; });
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

export function createLobby({ onLogin, onAvatar, onCreate, onJoin, onLogout, onResetConfirm, onRank, onCoin }) {
  const el = h('div', 'lb-root lobby');
  let user = null, pendingAvatar = null, shownModes = BASE_KEYS;

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
  const walletRow = h('div', 'lb-sub lb-coins');
  const coinBtns = h('div', 'lb-coin-btns');
  for (const [a, label] of [['shop', '상점'], ['rank', '코인 랭킹']] /* 교환·카드 뽑기·칭호 뽑기는 상점 안에서 (2026-11-13) */) {
    const b = button(label, 'lb-tint lb-coin-btn', () => onCoin?.(a));
    coinBtns.append(b);
  }
  const pinBtn = button('비밀번호', 'lb-tint lb-coin-btn lb-pin-btn', () => onCoin?.('pin'));
  const coinBox = h('div', 'lb-coin-box', coinBtns, pinBtn);
  coinBox.hidden = true;
  walletRow.hidden = true;
  const rankBtn = button('라이어 랭킹', 'lb-tint lb-rank-btn', () => onRank?.());
  rankBtn.hidden = true;
  profile.append(brand('lb-small'), h('div', 'lb-who', meAv, h('div', null, meName, meBank, walletRow)), brokeNote, coinBox, stats,
    rankBtn, h('div', 'lb-grow'), button('로그아웃', 'lb-text', () => onLogout()));

  const play = h('section', 'lb-panel panel');
  let pickedMode = 'holdem';
  const homeSeg = segmented((m) => { pickedMode = m; homeSeg.set(m); syncMini(); updateCreate(); });
  homeSeg.set(pickedMode);
  let pickedMini = 'gomoku';
  const miniBox = h('div', 'lb-mini-pick');
  miniBox.setAttribute('role', 'radiogroup');
  miniBox.setAttribute('aria-label', '미니게임 분류');
  const miniBtns = MINI_IDS.map((g) => {
    const b = h('button', 'lb-seg-item lb-mini-item', MINI_NAMES[g]);
    b.type = 'button';
    b.dataset.mini = g;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { pickedMini = g; syncMini(); });
    return b;
  });
  // 친구와 하기 / 봇과 하기 (봇이면 난이도·순서 고르고 방 만들기 = 바로 시작)
  let pickedVs = 'friend';
  let pickedLevel = 'easy';
  let pickedSide = 0;
  const seg = (label, items, get, set) => {
    const row = h('div', 'lb-mini-pick lb-mini-sub');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', label);
    const bs = items.map(([v, t]) => {
      const b = h('button', 'lb-seg-item', t);
      b.type = 'button';
      b.dataset.v = String(v);
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => { set(v); syncMini(); });
      return [v, b];
    });
    row.append(...bs.map((x) => x[1]));
    return { row, sync: () => bs.forEach(([v, b]) => b.setAttribute('aria-checked', String(v === get()))) };
  };
  const vsSeg = seg('상대', [['friend', '친구와 하기'], ['bot', '봇과 하기'], ['puzzle', '혼자 퀴즈 풀기']], () => pickedVs, (v) => { pickedVs = v; });
  const levelSeg = seg('봇 난이도', [['easy', '초급'], ['mid', '중급'], ['hard', '고급']], () => pickedLevel, (v) => { pickedLevel = v; });
  const sideSeg = seg('내 순서', [[0, '선(먼저)'], [1, '후']], () => pickedSide, (v) => { pickedSide = v; });
  vsSeg.row.dataset.lb = 'mini-vs';
  levelSeg.row.dataset.lb = 'mini-level';
  sideSeg.row.dataset.lb = 'mini-side';
  miniBox.append(...miniBtns);
  miniBox.hidden = true;
  function syncMini() {
    miniBox.hidden = pickedMode !== 'mini';
    const m = pickedMode === 'mini';
    if (pickedVs === 'puzzle' && pickedMini !== 'chess') pickedVs = 'friend'; // 퀴즈 풀기는 체스만
    vsSeg.row.querySelector('[data-v="puzzle"]').hidden = pickedMini !== 'chess';
    vsSeg.row.hidden = !m;
    levelSeg.row.hidden = !m || pickedVs !== 'bot';
    sideSeg.row.hidden = levelSeg.row.hidden;
    vsSeg.sync(); levelSeg.sync(); sideSeg.sync();
    miniBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mini === pickedMini)));
  }
  syncMini();
  const createBtn = button('방 만들기', 'lb-primary', () => { homeErr.textContent = ''; onCreate(pickedMode, pickedMode === 'mini' ? pickedMini : undefined, pickedMode === 'mini' && pickedVs === 'bot' ? { vs: 'bot', level: pickedLevel, side: pickedSide } : pickedMode === 'mini' && pickedVs === 'puzzle' ? { vs: 'puzzle' } : undefined); });
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
  play.append(h('h2', null, '새 게임'), h('div', 'lb-stack lb-seg-box', homeSeg.el, homeSeg.caption, miniBox, vsSeg.row, levelSeg.row, sideSeg.row),
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
    const list = all.filter((r) => shownModes.includes(r.mode));
    const seen = new Set();
    let ref = roomList.firstChild;
    for (const r of list) {
      seen.add(r.code);
      let row = rows.get(r.code);
      if (!row) rows.set(r.code, row = roomRow(r.code));
      const full = r.count >= r.max;
      row.title.textContent = r.mode === 'mini' && MINI_NAMES[r.game] ? `미니게임 · ${MINI_NAMES[r.game]}` : (MODES[r.mode]?.name ?? r.mode);
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

  // 서버 'me' 의 스위치 값으로 보일 게임을 정한다. 순서는 등록표 순서(홀덤, 블러핑, 라이어, 요트, 갱식마인드, 갱스껄, 미니).
  function setFlags(me) {
    const next = visibleModes(me, location.search);
    if (next.join() === shownModes.join()) return;
    shownModes = next;
    rankBtn.hidden = !next.includes('liar');
    homeSeg.setKeys(next);
    if (!next.includes(pickedMode)) pickedMode = 'holdem';
    homeSeg.set(pickedMode);
    syncMini();
    updateCreate();
    renderRooms(lastRooms);
  }

  // ---------- state ----------
  el.append(out, home, fileInput);
  function render() {
    out.hidden = !!user;
    home.hidden = !user;
    if (user) {
      const look = user.wallet ? { ...user.wallet.equip, pos: user.wallet.pos } : null;
      meAv.replaceChildren(playerAvatar({ id: user.id, name: user.name, face: user.avatar, look, size: 64 }));
      meName.replaceChildren(nameTag({ name: user.name, look }));
      const chips = user.chips ?? user.bank ?? 0;
      meBank.textContent = `${fmt(chips)} 칩`;
      const coins = user.wallet?.coins;
      walletRow.hidden = !Number.isFinite(coins);
      if (!walletRow.hidden) walletRow.textContent = `${fmt(coins)} 코인`;
      coinBox.hidden = !user.wallet;
      coinBtns.hidden = !user.wallet;
      brokeNote.hidden = chips !== 0;
      for (const [k] of STATS) statVals[k].textContent = fmt(user.stats?.[k] ?? 0);
    }
    updateCreate();
    renderRooms(lastRooms);
  }
  render();

  return {
    el,
    setUser(u) { if (u !== user) closeReset?.(); user = u; resetPinFields(); render(); },
    setRooms(list) { renderRooms(list); },
    setError(msg) { (!user ? outErr : homeErr).textContent = msg || ''; },
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
    setFlags,
    showRank,
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
  };
}
