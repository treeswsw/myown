// 옷장 (SPEC 22-16, 22-17, 22-19). 상점의 [옷장] 버튼으로 여는 따로 된 페이지.
// 왼쪽: 큰 프로필 미리보기(프사 + 칭호 + 이름 색), 스티커 끌기·크기·각도. 오른쪽: 종류 탭 + 가진 것.
// 요청: equip {slot,id|null} / pos {id,x,y,s,r}. 사용자 글자는 textContent 로만. CSS 는 .lk-w- 만(lookwin.css).
import { GRADES, item } from '../../../shared/coin/shop.js';
import { decorate, titleBadge, nameColor, itemIcon } from './look.js';
import hatArt from './art/hat.js';
import accArt from './art/acc.js';
import faceArt from './art/face.js';
import './lookwin.css';

const ART = { hat: hatArt, acc: accArt, face: faceArt };
const TABS = [['title', '칭호'], ['hat', '모자'], ['acc', '악세'], ['face', '페이셜'], ['frame', '테두리'], ['color', '글자 색'], ['suit', '코스튬']];
const AT = { top: '위 가장자리 고정', side: '옆 가장자리 고정', bottom: '아래 가장자리 고정', ring: '위 가장자리 고정' };
const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.', coin_bad: '잘못된 요청입니다.',
  shop_no: '없는 물건입니다.', shop_not: '가지고 있지 않습니다.',
};
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
const DEF = { x: 0, y: 0, s: 1, r: 0 };
const SAVE_GAP = 250; // 저장은 1초에 5번까지(서버 약속)보다 넉넉히

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
const gradeOf = (g) => GRADES.find((x) => x.g === g) || GRADES[0];
const isSticker = (it) => !!(it && it.art && it.art.type === 'sticker');
// 그림이 아직 없는 치장템인가 (칭호·테두리·글자 색은 그림이 필요 없다)
const noArt = (it) => !!(ART[it.slot] && !(it.art && it.art.key && ART[it.slot][it.art.key]));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
function backIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'lk-w-ico');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M15 5L8 12L15 19');
  s.append(p);
  return s;
}
function cleanPos(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    x: clamp(num(o.x, 0), -0.5, 0.5), y: clamp(num(o.y, 0), -0.5, 0.5),
    s: clamp(num(o.s, 1), 0.3, 2), r: clamp(num(o.r, 0), -180, 180),
  };
}

export function openLook(ctx) {
  const old = ctx.root.querySelector('.lk-w-root');
  if (old && typeof old._close === 'function') old._close();
  else if (old) old.remove();

  // ---------- 뼈대 ----------
  const root = el('div', 'lk-w-root');
  const page = el('div', 'lk-w-page');
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', '옷장');

  const head = el('header', 'lk-w-head');
  const back = btn('lk-w-back');
  back.append(backIcon(), el('span', null, '상점'));
  back.setAttribute('aria-label', '상점으로 돌아가기');
  const coinsB = el('b', 'lk-w-num');
  const coins = el('span', 'lk-w-coins');
  const coinDot = el('i', 'lk-w-coin');
  coinDot.setAttribute('aria-hidden', 'true');
  coins.append(coinDot, coinsB);
  coins.setAttribute('aria-label', '코인');
  const closeB = btn('lk-w-close', '닫기');
  const msg = el('p', 'lk-w-msg'); // 알림 한 줄 (위 줄의 빈자리)
  msg.setAttribute('role', 'status');
  head.append(back, el('h2', 'lk-w-h', '옷장'), el('p', 'lk-w-sub', '가진 것만 보여요'), msg, coins, closeB);

  // 왼쪽: 미리보기
  const side = el('section', 'lk-w-side');
  side.setAttribute('aria-label', '내 프로필 미리보기');
  const sideIn = el('div', 'lk-w-side-in');
  const stage = el('div', 'lk-w-stage');
  const avBox = el('div', 'lk-w-avbox');
  const dragTip = el('span', 'lk-w-tip', '끌어서 옮기기');
  stage.append(avBox, dragTip);
  const titleRow = el('div', 'lk-w-title');
  const nameEl = el('p', 'lk-w-name');
  const who = el('div', 'lk-w-who');
  who.append(titleRow, nameEl);

  const stick = el('div', 'lk-w-stick');
  const stickName = el('b');
  const stickLine = el('p', 'lk-w-stick-name');
  stickLine.append('선택한 스티커: ', stickName, el('span', 'lk-w-how', ' · 끌어서 옮기기'));
  function slider(label, min, max, step) {
    const row = el('label', 'lk-w-slide');
    const inp = el('input');
    inp.type = 'range';
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.setAttribute('aria-label', label);
    const out = el('span', 'lk-w-val');
    row.append(el('span', 'lk-w-lab', label), inp, out);
    return { row, inp, out };
  }
  const size = slider('크기', 0.3, 2, 0.05);
  const angle = slider('각도', -180, 180, 1);
  const resetB = btn('lk-w-btn', '되돌리기');
  const saveB = btn('lk-w-btn lk-w-gold', '저장');
  const stickBtns = el('div', 'lk-w-stick-btns');
  stickBtns.append(resetB, saveB);
  stick.append(stickLine, size.row, angle.row, stickBtns);

  const note = el('p', 'lk-w-note', '게임 안 표시 · 준비중');
  sideIn.append(stage, who, stick, el('div', 'lk-w-grow'), note);
  side.append(sideIn);

  // 오른쪽: 탭 + 목록
  const main = el('section', 'lk-w-main');
  const tabs = el('div', 'lk-w-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '꾸미기 종류');
  const tabEls = {};
  for (const [slot, label] of TABS) {
    const t = btn('lk-w-tab');
    t.setAttribute('role', 'tab');
    t.dataset.slot = slot;
    t.append(el('span', null, label));
    if (slot === 'suit') t.append(el('em', 'lk-w-soon', '준비중'));
    const cnt = el('i', 'lk-w-cnt');
    t.append(cnt);
    t.addEventListener('click', () => { tab = slot; say(''); render(); list.scrollTop = 0; });
    tabs.append(t);
    tabEls[slot] = { t, cnt };
  }
  const list = el('div', 'lk-w-list');
  list.setAttribute('role', 'tabpanel');
  main.append(tabs, list);

  const body = el('div', 'lk-w-body');
  body.append(side, main);
  page.append(head, body);
  root.append(page);
  ctx.root.append(root);

  // ---------- 상태 ----------
  let tab = 'title';
  let busy = false;
  let busyTimer = 0;
  let draft = null; // {id, x, y, s, r} 지금 만지고 있는 스티커 자리 (저장 전)
  let dirty = false;
  let lastSave = 0;
  let saveTimer = 0;
  let avEl = null;
  let avKey = null;

  const wal = () => ctx.wallet() || { coins: 0, owned: [], equip: {} };
  const me = () => (typeof ctx.me === 'function' && ctx.me()) || null;
  const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('lk-w-bad', !!bad); };
  let sent = null; // 방금 보낸 자리 (서버의 새 me 가 오기 전까지 저장된 값으로 본다)
  const savedPos = (id) => cleanPos(sent && sent.id === id ? sent : (wal().pos || {})[id]);

  // 지금 고른 스티커: 보고 있는 탭에 낀 것이 스티커면 그것, 아니면 낀 스티커 중 첫 번째
  function pickSticker(w) {
    const eq = w.equip || {};
    const cur = item(eq[tab]);
    if (isSticker(cur)) return cur;
    for (const s of ['acc', 'face', 'hat']) { const it = item(eq[s]); if (isSticker(it)) return it; }
    return null;
  }

  function setBusy(on) {
    busy = on;
    clearTimeout(busyTimer);
    if (on) busyTimer = setTimeout(() => { busy = false; render(); }, 4000); // 답이 안 와도 풀린다
  }

  function equip(slot, id) {
    if (busy) return;
    setBusy(true);
    say('');
    ctx.send({ t: 'coin', a: 'equip', slot, id });
    render();
  }

  // ---------- 미리보기 ----------
  function renderPreview(w) {
    const u = me();
    const name = (u && typeof u.name === 'string' && u.name) || '나';
    const src = u && typeof u.avatar === 'string' && IMG_RE.test(u.avatar) ? u.avatar : null;
    const key = src || 'letter:' + name;
    if (!avEl || avKey !== key) { // 사진이 바뀔 때만 새로 만든다(끄는 동안 깜빡이지 않게)
      avBox.textContent = '';
      avEl = el('div', 'lk-w-av');
      if (src) {
        const img = el('img');
        img.src = src;
        img.alt = '';
        img.draggable = false;
        avEl.append(img);
      } else {
        avEl.append(el('span', null, [...name][0] || '?'));
      }
      avBox.append(avEl);
      avKey = key;
    }
    const eq = w.equip || {};
    const pos = { ...(w.pos || {}) };
    if (sent) pos[sent.id] = { x: sent.x, y: sent.y, s: sent.s, r: sent.r };
    if (draft) pos[draft.id] = { x: draft.x, y: draft.y, s: draft.s, r: draft.r };
    const wrap = decorate(avEl, { ...eq, pos });
    if (wrap !== avEl) wrap.style.setProperty('--lk-bw', 'calc(var(--lk-w-av) * .06)');

    titleRow.textContent = '';
    const badge = titleBadge(eq);
    if (badge) titleRow.append(badge);
    else titleRow.append(el('span', 'lk-w-notitle', '칭호 없음'));
    nameEl.textContent = name;
    nameEl.style.color = nameColor(eq) || '';
  }

  function renderStick(w) {
    const it = pickSticker(w);
    if (!it) { draft = null; dirty = false; }
    else if (!draft || draft.id !== it.id || !dirty) { draft = { id: it.id, ...savedPos(it.id) }; dirty = false; }
    stick.hidden = !it;
    stage.classList.toggle('lk-w-drag', !!it);
    dragTip.hidden = !it;
    if (!it) return;
    stickName.textContent = it.name;
    size.inp.value = String(draft.s);
    size.out.textContent = Math.round(draft.s * 100) + '%';
    angle.inp.value = String(draft.r);
    angle.out.textContent = Math.round(draft.r) + '°';
    saveB.disabled = !dirty;
    resetB.disabled = !dirty;
  }

  // ---------- 목록 ----------
  function card(it, w) {
    const worn = (w.equip || {})[it.slot] === it.id;
    const g = gradeOf(it.g);
    const suit = it.slot === 'suit';
    const soon = suit || noArt(it);
    const c = el('div', 'lk-w-card' + (worn ? ' lk-w-worn' : '') + (soon ? ' lk-w-pending' : ''));
    if (g.color === 'rainbow') c.classList.add('lk-w-rainbow');
    else c.style.setProperty('--gc', g.color);
    c.dataset.id = it.id;

    const top = el('div', 'lk-w-card-top');
    const pic = el('div', 'lk-w-pic');
    pic.append(itemIcon(it.id, it.slot === 'title' ? 32 : 44));
    const tags = el('div', 'lk-w-tags');
    if (worn) tags.append(el('span', 'lk-w-tag lk-w-on', '장착중'));
    if (soon) tags.append(el('span', 'lk-w-tag', '준비중'));
    top.append(pic, tags);

    let kind = '';
    if (suit) kind = '코스튬 · 준비중';
    else if (isSticker(it)) kind = '스티커(끌어서 배치)';
    else if (it.art && it.art.type === 'cover') kind = '얼굴 전체';
    else if (it.art && it.art.type === 'edge') kind = AT[it.art.at] || '가장자리 고정';
    const sub = el('p', 'lk-w-kind');
    sub.append(el('b', 'lk-w-grade', g.name));
    if (kind) sub.append(' · ' + kind);

    const act = btn('lk-w-act' + (worn ? ' lk-w-off' : ''), worn ? '빼기' : '장착');
    if (suit && !worn) { // 코스튬은 아직 못 낀다 (22-19)
      act.disabled = true;
      act.classList.add('lk-w-dim');
      act.setAttribute('aria-label', it.name + ' 장착 (준비중)');
    } else {
      act.disabled = busy;
      act.setAttribute('aria-label', it.name + (worn ? ' 빼기' : ' 장착'));
      act.addEventListener('click', () => equip(it.slot, worn ? null : it.id));
    }
    c.append(top, el('p', 'lk-w-item', it.name), sub, act);
    return c;
  }

  function renderList(w) {
    const owned = (Array.isArray(w.owned) ? w.owned : []).map((id) => item(id)).filter(Boolean);
    const eq = w.equip || {};
    for (const [slot] of TABS) {
      const n = owned.filter((i) => i.slot === slot).length;
      const { t, cnt } = tabEls[slot];
      const on = slot === tab;
      t.classList.toggle('lk-w-sel', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      cnt.textContent = n ? String(n) : '';
      cnt.hidden = !n;
    }
    const mine = owned.filter((i) => i.slot === tab)
      .sort((a, b) => (eq[tab] === b.id) - (eq[tab] === a.id) || b.g - a.g || a.name.localeCompare(b.name, 'ko'));
    const top = list.scrollTop;
    list.textContent = '';
    list.classList.toggle('lk-w-none', !mine.length);
    if (!mine.length) {
      const box = el('div', 'lk-w-empty');
      const go = btn('lk-w-btn lk-w-gold lk-w-toshop', '상점으로');
      go.addEventListener('click', toShop);
      if (tab === 'suit') box.append(el('p', 'lk-w-banner', '코스튬 · 준비중'));
      box.append(el('p', 'lk-w-empty-h', '아직 없어요'), el('p', 'lk-w-empty-p', '상점/치장 뽑기에서 얻을 수 있어요'), go);
      list.append(box);
      return;
    }
    if (tab === 'suit') list.append(el('p', 'lk-w-banner', '코스튬 · 준비중'));
    const grid = el('div', 'lk-w-grid');
    for (const it of mine) grid.append(card(it, w));
    list.append(grid);
    list.scrollTop = top;
  }

  function render() {
    if (!root.isConnected) return;
    const w = wal();
    coinsB.textContent = won(w.coins);
    renderStick(w);
    renderPreview(w);
    renderList(w);
  }

  // ---------- 스티커 조절 ----------
  function touch() {
    dirty = true;
    const w = wal();
    renderStick(w);
    renderPreview(w);
  }
  size.inp.addEventListener('input', () => { if (draft) { draft.s = clamp(Number(size.inp.value) || 1, 0.3, 2); touch(); } });
  angle.inp.addEventListener('input', () => { if (draft) { draft.r = clamp(Number(angle.inp.value) || 0, -180, 180); touch(); } });
  resetB.addEventListener('click', () => { dirty = false; say(''); render(); });

  function sendPos() {
    if (!draft || !root.isConnected) return;
    lastSave = Date.now();
    const r4 = (v) => Math.round(v * 10000) / 10000;
    ctx.send({ t: 'coin', a: 'pos', id: draft.id, x: r4(draft.x), y: r4(draft.y), s: r4(draft.s), r: Math.round(draft.r) });
    sent = { ...draft };
    dirty = false;
    say('저장했습니다.');
    render();
  }
  saveB.addEventListener('click', () => {
    if (!draft || !dirty) return;
    clearTimeout(saveTimer);
    const wait = lastSave + SAVE_GAP - Date.now();
    if (wait > 0) saveTimer = setTimeout(sendPos, wait);
    else sendPos();
  });

  let drag = null; // {pid, x0, y0, sx, sy, d}
  stage.addEventListener('pointerdown', (e) => {
    if (!draft || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const d = avBox.getBoundingClientRect().width;
    if (!(d > 0)) return;
    drag = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, sx: draft.x, sy: draft.y, d };
    try { stage.setPointerCapture(e.pointerId); } catch { /* 없어도 된다 */ }
    stage.classList.add('lk-w-dragging');
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid || !draft) return;
    draft.x = clamp(drag.sx + (e.clientX - drag.x0) / drag.d, -0.5, 0.5);
    draft.y = clamp(drag.sy + (e.clientY - drag.y0) / drag.d, -0.5, 0.5);
    touch();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag = null;
    stage.classList.remove('lk-w-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ---------- 서버 답 ----------
  const offs = [
    ctx.on('me', () => { sent = null; render(); }),
    ctx.on('coin:equip', (m) => {
      setBusy(false);
      const it = item(m.id);
      say(m.id == null ? '뺐습니다.' : `${it ? it.name : '물건'}을(를) 꼈습니다.`);
      render();
    }),
    ctx.on('error', (m) => {
      setBusy(false);
      say(ERR[m.code] || (typeof m.msg === 'string' && m.msg) || '할 수 없습니다.', true);
      render();
    }),
  ];

  // ---------- 닫기 ----------
  function onKey(e) {
    if (e.key !== 'Escape' || !root.isConnected) return;
    e.stopPropagation(); // 아래에 깔린 상점까지 같이 닫히지 않게
    e.preventDefault();
    close();
  }
  function close() {
    for (const off of offs) off();
    clearTimeout(busyTimer);
    clearTimeout(saveTimer);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  }
  function toShop() {
    close();
    if (!ctx.root.querySelector('.sh-root')) ctx.open('shop'); // 상점이 아래에 그대로 있으면 다시 열지 않는다
  }
  root._close = close;
  window.addEventListener('keydown', onKey, true);
  closeB.addEventListener('click', close);
  back.addEventListener('click', toShop);

  // 가진 것이 있는 첫 탭에서 시작
  {
    const owned = (wal().owned || []).map((id) => item(id)).filter(Boolean);
    const first = TABS.find(([s]) => owned.some((i) => i.slot === s));
    if (first) tab = first[0];
  }
  render();
  closeB.focus({ preventScroll: true });
}
