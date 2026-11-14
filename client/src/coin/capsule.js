// 치장 뽑기 화면 (SPEC 22-16, 시안 22-20 "갱식 상점 · 사용자 시안 기준"). DOM/CSS 만 쓴다(?nogl=1 에서도 같음).
// 결과는 서버가 보낸 것만 보여 준다. 여기서 정하는 것은 꾸밈(낮은 색으로 빛나다 올라가는 속임)뿐이다. 사용자 글자는 textContent 로만.
import { item, ITEMS, GRADES } from '../../../shared/coin/shop.js';
import { COST, TEN, PITY, CRAFT } from '../../../shared/coin/capsule.js';
import { itemIcon } from './look.js';
import './capsule.css';

const CHARGE_MIN = 900;  // 서버가 빨리 답해도 최소로 힘을 모으는 시간
const CRACK_MS = 520;    // 금이 가며 첫 색이 보이는 시간
const STEP_MS = 430;     // 색이 한 단계 올라가는 시간
const BURST_MS = 280;    // 깨지는 시간
const BIG_MS = 1900;     // 10개 뽑기에서 레전드·갱식을 크게 보여 주는 시간
const WAIT_MAX = 8000;   // 서버가 안 답할 때 포기

const KIND = { title: '칭호', hat: '모자', acc: '악세', face: '페이셜', frame: '테두리', color: '글자 색', suit: '코스튬 · 준비중' };
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const gradeOf = (g) => GRADES.find((x) => x.g === g) || GRADES[0];
const reduced = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
};
// 화면 꾸밈 전용 난수(결과와 무관)
function rnd() {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch { return 0.5; }
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// 아래 그림은 고정된 글(사용자 글자 없음)
const GEM = '<i class="cp-halo"></i><svg class="cp-gem" viewBox="0 0 70 96" aria-hidden="true">'
  + '<path class="cp-f0" d="M35 2 64 30 35 94 6 30z"/><path class="cp-f1" d="M35 2 64 30H6z"/>'
  + '<path class="cp-f2" d="M35 30H64L35 94z"/><path class="cp-f3" d="M35 2V30H6z"/>'
  + '<path class="cp-edge" d="M35 2 64 30 35 94 6 30z"/><circle class="cp-core" cx="35" cy="48" r="8"/>'
  + '<path class="cp-crk" d="M35 5 30 22 40 35 28 50 38 65 34 90M30 22 15 29M40 35 55 31M28 50 19 43M38 65 48 56"/></svg>';
const STREAKS = '<svg class="cp-sk" viewBox="0 0 1280 720" preserveAspectRatio="none" aria-hidden="true"><defs>'
  + '<linearGradient id="cpSk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fc8ff" stop-opacity="0"/>'
  + '<stop offset=".5" stop-color="#9fb4ff" stop-opacity=".7"/><stop offset="1" stop-color="#4fc8ff" stop-opacity="0"/></linearGradient></defs>'
  + '<g fill="none" stroke="url(#cpSk)"><path d="M700 -20 1300 300" stroke-width="3"/><path d="M860 -20 1300 200" stroke-width="1.5"/>'
  + '<path d="M-20 520 420 740" stroke-width="2.5"/><path d="M-20 420 260 560" stroke-width="1.2"/><path d="M980 740 1300 560" stroke-width="2"/></g></svg>';
const BACK = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4 4 11l6 7M4 11h14"/></svg>';

function crystal() {
  const c = el('span', 'cp-cry');
  c.innerHTML = GEM;
  return c;
}
// 보여 줄 색 순서(마지막이 진짜 등급). 가끔 낮은 색에서 시작해 올라간다.
function fakePath(g) {
  if (g <= 0) return [0];
  const chance = g >= 3 ? 0.6 : g === 2 ? 0.45 : 0.25;
  if (rnd() >= chance) return [g];
  const from = Math.max(0, g - (g >= 2 && rnd() < 0.4 ? 2 : 1));
  const path = [];
  for (let i = from; i <= g; i++) path.push(i);
  return path;
}
// 그림을 칸 너비에 맞춘다(칭호 배지는 길이가 제각각). up = 키워도 되는 최대 배율
function fit(box, up = 1) {
  const ic = box.firstElementChild;
  if (!ic) return;
  const w = ic.offsetWidth, room = box.clientWidth * 0.94;
  if (!w || !room) return;
  const s = Math.min(up, room / w);
  if (Math.abs(s - 1) > 0.02) ic.style.transform = `scale(${s.toFixed(3)})`;
}

export function openCapsule(ctx) {
  const prev = document.activeElement;
  const offs = [];
  const wakers = new Set();
  let closed = false, busy = false, skip = false, runId = 0;
  let pending = null;   // { a, resolve, reject }
  let waitTimer = 0;
  let frozen = null;    // 연출 중에는 조각·천장 숫자를 멈춘다(결과가 먼저 보이지 않게)
  let pick = null;      // 조각 교환에서 고른 품목 id
  let over = null;      // 10개 뽑기 중 크게 보여 주는 덮개

  // ---------- 틀 ----------
  const ov = el('div', 'cp-ov');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', '치장 뽑기');
  ov.innerHTML = STREAKS;

  const bClose = button('cp-x', null, () => close());
  bClose.innerHTML = BACK;
  bClose.setAttribute('aria-label', '닫기');
  const shardN = el('b');
  const coinN = el('b');
  const pillS = el('span', 'cp-pill');
  pillS.append(el('i', 'cp-shd'), '조각 ', shardN);
  const pillC = el('span', 'cp-pill');
  pillC.append(el('i', 'cp-coin'), '코인 ', coinN);
  const head = el('header', 'cp-hd');
  const ttl = el('h1', 'cp-ttl', '치장 뽑기');
  head.append(bClose, ttl, el('span', 'cp-tag', '칭호·치장 캡슐'), el('span', 'cp-sp'), pillS, pillC);

  const view = el('div', 'cp-view');
  const bonus = el('p', 'cp-bonus');
  bonus.hidden = true;
  const stageIn = el('div', 'cp-in');
  stageIn.append(view, bonus);
  const stage = el('section', 'cp-stage');
  stage.append(stageIn);

  const pityN = el('b');
  const pityEl = el('p', 'cp-pity');
  pityEl.append('레전드 확정까지 ', pityN, '개');
  const goLabel = (n) => {
    const f = document.createDocumentFragment();
    f.append(`${n}개 · `, el('i', 'cp-coin'), `${COST * n}코인`);
    return f;
  };
  const bOne = button('cp-go', null, () => pull(1));
  bOne.append(goLabel(1));
  const bTen = button('cp-go', null, () => pull(TEN));
  bTen.append(goLabel(TEN));
  const bSkip = button('cp-btn cp-skip', '건너뛰기', () => { skip = true; wake(); });
  const msg = el('p', 'cp-msg');
  msg.setAttribute('role', 'status');
  const barIn = el('i');
  const bar = el('span', 'cp-bar');
  bar.append(barIn);
  const shardTxt = el('span', 'cp-shn');
  const shbox = el('div', 'cp-shbox');
  shbox.append(el('i', 'cp-shd'), shardTxt, bar);
  const bCraft = button('cp-btn', '조각 교환', () => openCraft());
  const bShop = button('cp-btn', '상점으로', () => { close(); if (typeof ctx.open === 'function') ctx.open('shop'); });
  const row2 = el('div', 'cp-row2');
  row2.append(bCraft, bShop);
  const side = el('aside', 'cp-side');
  side.append(pityEl, bOne, bTen, bSkip, msg, shbox, row2);

  const main = el('div', 'cp-main');
  main.append(stage, side);

  // 조각 교환 창
  const craft = el('div', 'cp-craft');
  craft.hidden = true;
  const cHave = el('span', 'cp-chave');
  const cHead = el('div', 'cp-chd');
  cHead.append(el('b', 'cp-ch', '조각 교환'), el('span', 'cp-csub', `조각 ${CRAFT}개 → 원하는 레전드 1개`), el('span', 'cp-sp'), cHave);
  const cList = el('div', 'cp-list');
  const cMsg = el('p', 'cp-cmsg');
  cMsg.setAttribute('role', 'status');
  const bDo = button('cp-go cp-do', '교환', () => doCraft());
  const bCancel = button('cp-btn', '닫기', () => closeCraft());
  const cFoot = el('div', 'cp-cft');
  cFoot.append(cMsg, bCancel, bDo);
  const cPanel = el('div', 'cp-cpn');
  cPanel.append(cHead, cList, cFoot);
  craft.append(cPanel);
  craft.addEventListener('pointerdown', (e) => { if (e.target === craft) closeCraft(); });

  ov.append(head, main, craft);

  // ---------- 작은 도구 ----------
  const wallet = () => ctx.wallet() || {};
  function setMode(m) { ov.dataset.mode = m; }
  function say(text, kind) {
    msg.className = 'cp-msg' + (kind ? ' cp-' + kind : '');
    msg.textContent = text || '';
  }
  function sleep(ms) {
    if (skip || closed || ms <= 0) return Promise.resolve();
    return new Promise((res) => {
      const done = () => { clearTimeout(t); wakers.delete(done); res(); };
      const t = setTimeout(done, ms);
      wakers.add(done);
    });
  }
  function wake() { for (const f of [...wakers]) f(); }
  function refresh() {
    const w = wallet();
    const coins = w.coins | 0;
    const shard = (frozen ? frozen.shard : w.shard) | 0;
    const cpity = (frozen ? frozen.cpity : w.cpity) | 0;
    coinN.textContent = fmt(coins);
    shardN.textContent = fmt(shard);
    pityN.textContent = String(Math.max(1, PITY - cpity));
    shardTxt.textContent = `${fmt(shard)} / ${CRAFT}`;
    barIn.style.width = Math.min(100, (shard / CRAFT) * 100) + '%';
    shbox.classList.toggle('cp-full', shard >= CRAFT);
    bOne.disabled = busy || coins < COST;
    bTen.disabled = busy || coins < COST * TEN;
    bCraft.disabled = busy;
    if (!craft.hidden) refreshCraft();
  }
  function errText(m) {
    if (m.code === 'coin_bad') return '지금은 할 수 없어요.';
    return String(m.msg ?? '') || '할 수 없어요.';
  }

  // ---------- 무대 ----------
  function showHero() {
    const cry = crystal();
    const box = el('div', 'cp-hero');
    box.append(cry);
    view.replaceChildren(box, el('p', 'cp-cap', '크리스탈을 깨서 칭호·치장템을 얻어요'));
    return cry;
  }
  function flash() {
    const f = el('i', 'cp-flash');
    f.addEventListener('animationend', () => f.remove());
    stageIn.append(f);
  }
  function bump(node) {
    node.classList.remove('cp-jump');
    void node.offsetWidth; // 애니메이션 다시 시작
    node.classList.add('cp-jump');
  }
  // 큰 결과 카드. note = 상태 글을 바꿀 때(조각 교환)
  function resCard(p, note) {
    const it = item(p.id);
    const gr = gradeOf(p.g);
    const big = p.g >= 3;
    const card = el('div', 'cp-res' + (big ? ' cp-res-big' : ''));
    card.dataset.g = String(gr.g);
    if (big) card.append(el('i', 'cp-rays'));
    const ico = el('div', 'cp-ico');
    const h = stage.clientHeight || 260;
    ico.append(itemIcon(p.id, Math.round(Math.max(52, Math.min(190, h * 0.32)))));
    const sub = el('p', 'cp-sub');
    const st = el('span', 'cp-st ' + (p.dup ? 'cp-dup' : 'cp-new'), note || (p.dup ? `중복 → 조각 +${p.shard | 0}` : '새로 얻음'));
    sub.append(`${KIND[it?.slot] || '치장'} · `, st);
    card.append(el('span', 'cp-gtag', gr.name + (p.g >= 4 ? '!!' : big ? '!' : '')), ico, el('b', 'cp-name', it ? it.name : String(p.id)), sub);
    return { card, ico, up: it?.slot === 'title' ? Math.max(2, h / 130) : 1 };
  }
  function showRes(p, note) {
    const r = resCard(p, note);
    view.replaceChildren(r.card);
    fit(r.ico, r.up);
  }
  function fillCell(cell, p) {
    const it = item(p.id);
    const gr = gradeOf(p.g);
    cell.dataset.g = String(gr.g);
    cell.dataset.st = 'open';
    cell.classList.toggle('cp-isnew', !p.dup);
    const inner = el('div', 'cp-ci');
    const art = el('div', 'cp-art');
    const size = Math.round(Math.max(24, Math.min(60, cell.clientHeight - 62, cell.clientWidth - 14)));
    art.append(itemIcon(p.id, size));
    inner.append(el('span', 'cp-cg', gr.name), art, el('b', 'cp-cn', it ? it.name : String(p.id)), el('span', 'cp-cs', p.dup ? `조각 +${p.shard | 0}` : '새로 얻음'));
    cell.replaceChildren(inner);
    cell.setAttribute('aria-label', `${gr.name} ${it ? it.name : ''} ${p.dup ? '중복' : '새로 얻음'}`);
    fit(art, 1);
  }

  async function playOne(cry, p, id, note) {
    if (!skip) {
      const path = fakePath(p.g);
      cry.dataset.g = String(path[0]);
      cry.dataset.st = 'crack';
      await sleep(CRACK_MS);
      for (let i = 1; i < path.length && !skip; i++) {
        cry.dataset.g = String(path[i]);
        bump(cry);
        await sleep(STEP_MS);
      }
      if (id !== runId || closed) return;
      if (!skip) {
        if (p.g >= 3) flash();
        cry.dataset.g = String(p.g);
        cry.dataset.st = 'burst';
        await sleep(BURST_MS);
      }
    }
    if (id !== runId || closed) return;
    showRes(p, note);
  }

  async function playTen(pulls, id) {
    const order = pulls.map((p, i) => ({ p, i })).sort((a, b) => (a.p.g - b.p.g) || (a.i - b.i)).map((x) => x.p); // 높은 등급이 마지막
    const grid = el('div', 'cp-grid');
    const cells = order.map((_, i) => {
      const c = el('div', 'cp-cell');
      c.style.setProperty('--i', String(i));
      c.append(crystal());
      grid.append(c);
      return c;
    });
    view.replaceChildren(grid);
    await sleep(380);
    for (let i = 0; i < order.length; i++) {
      if (id !== runId || closed) return;
      const p = order[i], cell = cells[i];
      if (!skip) {
        const cry = cell.firstElementChild;
        const path = p.g >= 2 ? fakePath(p.g) : [p.g];
        cry.dataset.g = String(path[0]);
        cry.dataset.st = 'crack';
        await sleep(p.g >= 2 ? 420 : 230);
        for (let k = 1; k < path.length && !skip; k++) {
          cry.dataset.g = String(path[k]);
          bump(cry);
          await sleep(340);
        }
        if (id !== runId || closed) return;
        if (p.g >= 3 && !skip) {
          flash();
          const r = resCard(p);
          over = el('div', 'cp-over');
          over.append(r.card);
          stageIn.append(over);
          fit(r.ico, r.up);
          await sleep(BIG_MS);
          over.remove();
          over = null;
          if (id !== runId || closed) return;
        }
      }
      fillCell(cell, p);
      await sleep(70);
    }
  }

  // ---------- 서버와 주고받기 ----------
  function ask(req) {
    return new Promise((resolve, reject) => {
      pending = { a: req.a, resolve, reject };
      waitTimer = setTimeout(() => {
        if (pending) { pending = null; reject(new Error('응답이 없습니다. 잠시 뒤 다시 눌러 주세요.')); }
      }, WAIT_MAX);
      ctx.send(req);
    });
  }
  function settle(fn, arg) {
    const p = pending;
    pending = null;
    clearTimeout(waitTimer);
    if (p) p[fn](arg);
  }

  // req 를 보내고, 답을 연출로 보여 준다. toPulls(m) = 답에서 보여 줄 목록
  async function run(req, toPulls, note) {
    if (busy || closed) return;
    const w = wallet();
    busy = true;
    skip = reduced();
    frozen = { shard: w.shard | 0, cpity: w.cpity | 0 };
    const id = ++runId;
    say('');
    bonus.hidden = true;
    setMode('wait');
    const cry = showHero();
    cry.dataset.st = 'charge';
    refresh();
    const t0 = performance.now();
    let m = null, pulls = [];
    try {
      m = await ask(req);
      pulls = toPulls(m);
      if (!pulls.length) throw new Error('결과를 받지 못했습니다.');
    } catch (e) {
      if (id !== runId || closed) return;
      busy = false; frozen = null;
      setMode('idle');
      showHero();
      say(e && e.message, 'err');
      refresh();
      return;
    }
    if (id !== runId || closed) return;
    setMode('play');
    bSkip.textContent = pulls.length > 1 ? '모두 열기' : '건너뛰기';
    await sleep(CHARGE_MIN - (performance.now() - t0));
    if (id !== runId || closed) return;
    if (pulls.length > 1) await playTen(pulls, id);
    else await playOne(cry, pulls[0], id, note);
    if (id !== runId || closed) return;
    busy = false; frozen = null;
    setMode('done');
    const got = Array.isArray(m.got) ? m.got : [];
    if (got.length) {
      bonus.textContent = `수집 보상! ${got.map((g) => `「${item(g)?.name || g}」`).join(' ')} 획득`;
      bonus.hidden = false;
    }
    if (pulls.length > 1) {
      const fresh = pulls.filter((p) => !p.dup).length;
      const sh = pulls.reduce((s, p) => s + (p.dup ? p.shard | 0 : 0), 0);
      say(`새로 얻음 ${fresh}개` + (sh ? ` · 조각 +${sh}` : ''), 'ok');
    } else {
      const p = pulls[0];
      say(`${gradeOf(p.g).name} · ${item(p.id)?.name || p.id}`, 'ok');
    }
    refresh();
  }

  function pull(n) {
    if ((wallet().coins | 0) < COST * n) return;
    run({ t: 'coin', a: 'cap', n }, (m) => (Array.isArray(m.pulls) ? m.pulls : [])
      .filter((p) => p && typeof p.id === 'string')
      .map((p) => ({ id: p.id, g: Number(p.g) | 0, dup: !!p.dup, shard: Number(p.shard) | 0 })));
  }

  // ---------- 조각 교환 ----------
  function refreshCraft() {
    const w = wallet();
    const shard = w.shard | 0;
    cHave.textContent = `내 조각 ${fmt(shard)}`;
    const it = pick && item(pick);
    if (!cList.childElementCount) { bDo.textContent = '교환'; bDo.disabled = true; }
    else if (shard < CRAFT) { bDo.textContent = `조각 ${CRAFT - shard}개 부족`; bDo.disabled = true; }
    else if (!it) { bDo.textContent = '레전드를 고르세요'; bDo.disabled = true; }
    else { bDo.textContent = `교환 · 조각 ${CRAFT}`; bDo.disabled = busy; }
  }
  function openCraft() {
    if (busy || closed) return;
    const owned = new Set(Array.isArray(wallet().owned) ? wallet().owned : []);
    const list = ITEMS.filter((it) => it.g === 3 && it.cap === true && !owned.has(it.id));
    pick = null;
    cMsg.textContent = '';
    cList.replaceChildren();
    if (!list.length) cMsg.textContent = '레전드를 모두 모았어요.';
    for (const it of list) {
      const b = button('cp-pick', null, () => {
        pick = it.id;
        for (const x of cList.children) x.setAttribute('aria-pressed', String(x === b));
        cMsg.textContent = '';
        refreshCraft();
      });
      b.setAttribute('aria-pressed', 'false');
      const txt = el('span', 'cp-pt');
      txt.append(el('b', null, it.name), el('span', null, KIND[it.slot] || ''));
      if (it.slot !== 'title') b.append(itemIcon(it.id, 34));
      b.append(txt);
      cList.append(b);
    }
    craft.hidden = false;
    refreshCraft();
    (cList.firstElementChild || bCancel).focus();
  }
  function closeCraft() {
    if (craft.hidden) return;
    craft.hidden = true;
    bCraft.focus();
  }
  function doCraft() {
    const id = pick;
    if (!id || busy || (wallet().shard | 0) < CRAFT) return;
    craft.hidden = true;
    run({ t: 'coin', a: 'craft', id }, (m) => {
      const it = item(m.id);
      return it ? [{ id: it.id, g: it.g, dup: false, shard: 0 }] : [];
    }, '조각 교환으로 얻음');
  }

  // ---------- 닫기·구독 ----------
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!craft.hidden) closeCraft(); else close();
  };
  function close() {
    if (closed) return;
    closed = true;
    runId++;
    clearTimeout(waitTimer);
    pending = null;
    wake();
    document.removeEventListener('keydown', onKey, true);
    offs.forEach((f) => f());
    ov.remove();
    prev?.focus?.();
  }
  // 무대를 누르면: 1개는 건너뛰기, 10개는 크게 보여 주는 장면만 넘긴다
  stage.addEventListener('click', () => {
    if (ov.dataset.mode !== 'play') return;
    if (over) wake();
    else if (!view.querySelector('.cp-grid')) { skip = true; wake(); }
  });
  offs.push(ctx.on('me', refresh));
  offs.push(ctx.on('coin:cap', (m) => { if (pending && pending.a === 'cap') settle('resolve', m); }));
  offs.push(ctx.on('coin:craft', (m) => { if (pending && pending.a === 'craft') settle('resolve', m); }));
  offs.push(ctx.on('error', (m) => {
    if (!m || !/^(coin|shop)_/.test(String(m.code))) return;
    if (pending) settle('reject', new Error(errText(m)));
    else if (!busy) say(errText(m), 'err');
  }));
  document.addEventListener('keydown', onKey, true);

  setMode('idle');
  showHero();
  refresh();
  ctx.root.append(ov);
  bOne.focus();
}
