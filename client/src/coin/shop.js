// 갱식 상점 (SPEC 22-20). 뽑기 두 칸 + "이 시간의 명품" 2칸 + "나만의 진열대" 6장(뒷면 → 눌러서 열기).
// 모양은 사용자 확정 시안("갱식 상점 · 사용자 시안 기준")을 옮긴 것. 옷장은 따로 된 페이지(open('look')).
// 사용자 글자는 textContent 로만. CSS 는 .sh- 만. 요청: buy / equip / stock.
import { GRADES, item } from '../../../shared/coin/shop.js';
import { priceOf } from '../../../shared/coin/stock.js';
import { titleBadge, itemIcon } from './look.js';
import './shop.css';

const KIND = { title: '칭호', hat: '모자', acc: '악세', face: '페이셜', frame: '테두리', color: '글자 색', suit: '코스튬' };
const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.', coin_low: '코인이 모자랍니다.', coin_bad: '잘못된 요청입니다.',
  shop_no: '없는 물건입니다.', shop_gone: '진열이 바뀌었습니다.', shop_own: '이미 가지고 있습니다.', shop_not: '가지고 있지 않습니다.',
};
const ERR_RE = /^(coin|shop)_/;
const HINT = '카드를 눌러 열어 보세요 · 2분마다 새 상품으로 바뀌어요';
const OPEN_KEY = 'gs.shop.open'; // 이 기기에서 이미 연 진열 카드 id 들
const FLIP_MS = 250; // 뒤집기 절반(닫힘) 시간. 나머지 절반은 CSS(.sh-in)
const CPITY = 80;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
const NS = 'http://www.w3.org/2000/svg';

// 고정 그림(우리가 쓴 글자. 사용자 글자 아님)
const SVG_BACK = '<path d="M10 4 4 11l6 7M4 11h14"/>';
const SVG_HANGER = '<path d="M11 8.5V7a2 2 0 1 0-2-2M11 8.5 2.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8z"/>';
const SVG_STREAKS = '<defs><linearGradient id="sh-g-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fc8ff" stop-opacity="0"/><stop offset=".5" stop-color="#7fdcff" stop-opacity=".75"/><stop offset="1" stop-color="#4fc8ff" stop-opacity="0"/></linearGradient></defs>'
  + '<g fill="none" stroke="url(#sh-g-s)"><path d="M700 -20 1300 300" stroke-width="3"/><path d="M860 -20 1300 200" stroke-width="1.5"/><path d="M-20 520 420 740" stroke-width="2.5"/><path d="M-20 420 260 560" stroke-width="1.2"/><path d="M980 740 1300 560" stroke-width="2"/><path d="M300 380 760 392" stroke-width="1"/></g>';
const SVG_FLAME = '<defs><linearGradient id="sh-g-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d14"/><stop offset=".55" stop-color="#ff9a1e"/><stop offset="1" stop-color="#ffe98a" stop-opacity=".9"/></linearGradient></defs>'
  + '<g fill="url(#sh-g-f)" opacity=".92"><path d="M40 150c-14-30 8-44 4-74 22 16 30 40 22 74z"/><path d="M96 150c-22-44 14-62 6-110 34 26 50 70 30 110z"/><path d="M170 150c-26-52 20-76 8-136 44 34 62 90 34 136z"/><path d="M252 150c-20-40 16-60 10-104 32 24 46 66 26 104z"/><path d="M326 150c-26-50 18-72 10-128 40 30 58 86 30 128z"/><path d="M398 150c-16-34 12-50 6-88 28 20 38 56 22 88z"/></g>'
  + '<g fill="#fff3b0" opacity=".85"><path d="M110 150c-10-22 8-34 4-58 18 14 24 38 14 58z"/><path d="M186 150c-12-28 10-42 6-72 22 18 30 48 16 72z"/><path d="M340 150c-12-26 10-40 6-66 20 16 28 44 14 66z"/></g>';
const SVG_CRYSTAL = '<path d="M35 2 64 30 35 94 6 30z" fill="#7a4cff"/><path d="M35 2 64 30H6z" fill="#d9c8ff"/><path d="M35 30 64 30 35 94z" fill="#4a22b8"/><path d="M35 2 35 30 6 30z" fill="#f3ecff"/><path d="M35 2 64 30 35 94 6 30z" fill="none" stroke="#f6e3a6" stroke-width="1.5" stroke-linejoin="round"/><circle cx="35" cy="48" r="9" fill="#ffc93c" stroke="#fff3c8" stroke-width="1.5"/>';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btnEl(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
function svg(cls, viewBox, inner, par) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('aria-hidden', 'true');
  if (par) s.setAttribute('preserveAspectRatio', par);
  s.innerHTML = inner; // 위의 고정 글자만
  return s;
}
const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');

// 남은 시간: 1시간 미만 m:ss, 그 이상 h:mm:ss
function clock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function gradeOf(g) { return GRADES.find((x) => x.g === g) || GRADES[0]; }
// 등급 색을 카드에 심는다: --g(색), --g2(밝게), --ga(빛)
function paint(node, g) {
  const c = gradeOf(g).color;
  const hex = /^#[0-9a-f]{6}$/i.test(c) ? c : '#ff6ad5';
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const up = (v) => Math.round(v + (255 - v) * 0.45);
  node.style.setProperty('--g', hex);
  node.style.setProperty('--g2', `rgb(${up(r)},${up(gg)},${up(b)})`);
  node.style.setProperty('--ga', `rgba(${r},${gg},${b},.6)`);
}

// wallet.stock 을 한 모양으로: { row:[{id|null} x6], next(ms|NaN), feat:[id|null, id|null], featLeft(ms|NaN) }
// 22-20 모양이 아니면(옛 22-18 {a,b}) 그것으로 채우고, 아무것도 없으면 null.
function normStock(st) {
  if (!st || typeof st !== 'object') return null;
  const sid = (v) => (typeof v === 'string' && v ? v : null);
  if (Array.isArray(st.row)) {
    const row = st.row.slice(0, 6).map((c) => sid(c && typeof c === 'object' ? c.id : c));
    while (row.length < 6) row.push(null);
    const f = st.feat && typeof st.feat === 'object' ? st.feat : {};
    const ids = Array.isArray(f.ids) ? f.ids.slice(0, 2).map(sid) : [];
    while (ids.length < 2) ids.push(null);
    return { row, next: Number(st.next), feat: ids, featLeft: Number(f.left) };
  }
  const a = st.a && Array.isArray(st.a.ids) ? st.a.ids.map(sid) : null;
  const b = st.b && Array.isArray(st.b.ids) ? st.b.ids.map(sid) : null;
  if (!a && !b) return null;
  const row = (a || []).slice(0, 5);
  while (row.length < 5) row.push(null);
  row.push(b ? b[2] ?? null : null);
  return { row, next: a ? Number(st.a.left) : NaN, feat: [b ? b[0] ?? null : null, b ? b[1] ?? null : null], featLeft: b ? Number(st.b.left) : NaN };
}

function loadOpen() {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch (e) { return new Set(); }
}
function saveOpen(set) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch (e) { /* 기억 못 해도 동작 */ }
}
function calm() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

export function openShop(ctx) {
  const old = ctx.root.querySelector('.sh-root');
  if (old) old.remove();

  // ---------- 뼈대 ----------
  const root = el('div', 'sh-root');
  const panel = el('div', 'sh-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '갱식 상점');
  const stage = el('div', 'sh-stage');

  // 맨 위 줄
  const head = el('header', 'sh-hd');
  const close = btnEl('sh-close');
  close.setAttribute('aria-label', '로비로 돌아가기');
  close.append(svg('sh-ico', '0 0 22 22', SVG_BACK));
  const meChip = el('div', 'sh-me');
  const meAv = el('span', 'sh-av sh-hf');
  const meTitle = el('span', 'sh-me-title');
  const meName = el('span', 'sh-nm');
  meChip.append(meAv, meTitle, meName);
  const wd = btnEl('sh-wd');
  wd.setAttribute('aria-label', '옷장 열기');
  wd.append(svg('sh-ico', '0 0 22 22', SVG_HANGER), el('span', null, '옷장'));
  const coinsB = el('b');
  const coinsP = el('span', 'sh-pill sh-coins');
  coinsP.append(el('i', 'sh-coin'), el('span', null, '코인'), coinsB);
  const chipsB = el('b');
  const chipsP = el('span', 'sh-pill sh-chips');
  chipsP.append(el('i', 'sh-chip'), el('span', null, '칩'), chipsB);
  const ex = btnEl('sh-ex', '칩 교환');
  head.append(close, el('h1', 'sh-h1 sh-hf', '갱식 상점'), meChip, wd, el('span', 'sh-sp'), coinsP, chipsP, ex);

  // 위쪽: 명품 2칸 + 뽑기 2칸
  const band = el('div', 'sh-band');
  const featEls = [0, 1].map((i) => {
    const a = el('article', 'sh-pn sh-feat' + (i ? ' sh-v' : ''));
    const inner = el('div', 'sh-i');
    a.append(inner);
    return { a, inner, time: null };
  });
  function bigPanel(cls, art, label) {
    const a = el('article', 'sh-pn sh-big ' + cls);
    const inner = el('div', 'sh-i');
    const ar = el('div', 'sh-ar');
    ar.setAttribute('aria-hidden', 'true');
    ar.append(...art);
    const badge = el('span', 'sh-bg');
    const info = el('p', 'sh-mt');
    const txt = el('div', 'sh-fi-txt');
    txt.append(badge, el('h2', 'sh-h2 sh-hf', label), info);
    const go = btnEl('sh-sb sh-hf');
    const fi = el('div', 'sh-fi');
    fi.append(txt, go);
    inner.append(ar, fi);
    a.append(inner);
    return { a, badge, info, go };
  }
  const fc = (c) => el('span', 'sh-fc ' + c);
  const bigDraw = bigPanel('sh-pB sh-big-draw', [fc('sh-fc-l'), fc('sh-fc-r'), fc('sh-fc-m')], '카드 뽑기');
  const bigCap = bigPanel('sh-pC sh-big-cap', [svg('sh-cry', '0 0 70 96', SVG_CRYSTAL)], '치장 뽑기');
  bigDraw.go.textContent = '뽑기';
  bigCap.go.textContent = '열기';
  bigCap.badge.textContent = '칭호·치장 캡슐';
  band.append(featEls[0].a, bigDraw.a, bigCap.a, featEls[1].a);

  // 아래쪽: 나만의 진열대
  const rh = el('div', 'sh-rh');
  const tm = el('span', 'sh-tm');
  const msg = el('p', 'sh-msg', HINT);
  msg.setAttribute('role', 'status');
  rh.append(el('h2', 'sh-rh-name sh-hf', '나만의 진열대'), tm, msg, el('span', 'sh-ln'));
  const tray = el('div', 'sh-tray');
  const ti = el('div', 'sh-ti');
  tray.append(ti);

  stage.append(head, band, rh, tray);
  panel.append(svg('sh-sk', '0 0 1280 720', SVG_STREAKS, 'none'), stage);
  root.append(panel);
  ctx.root.append(root);

  // ---------- 상태 ----------
  let sure = null; // 가격 버튼을 한 번 누른 품목 id (한 번 더 누르면 산다)
  let busy = false;
  let closed = false;
  let lastRaw; // 마지막으로 본 wallet.stock
  let stock = null; // normStock 결과
  let endNext = 0, endFeat = 0; // 바뀌는 시각(이 기기 시계). 0 = 모름
  let asked = false; // 이번 진열에서 새 진열을 이미 달라고 했는가 (한 번만)
  let askedAt = 0;
  let shift = false; // 다음에 그릴 때 줄을 왼쪽으로 민다
  const opened = loadOpen();
  const opening = new Set(); // 지금 뒤집히는 중인 id
  let fresh = null; // 방금 열린 id (앞면이 펴지는 연출)
  const flipTimers = new Set();

  const wal = () => ctx.wallet() || { coins: 0, owned: [], equip: {} };
  const me = () => (typeof ctx.me === 'function' && ctx.me()) || null;
  const small = () => window.innerHeight <= 560;
  const say = (t, bad) => {
    msg.textContent = t || HINT;
    msg.classList.toggle('sh-bad', !!bad && !!t);
    msg.classList.toggle('sh-say', !!t);
  };

  function act(obj) {
    if (busy) return;
    busy = true;
    sure = null;
    say('');
    ctx.send(obj);
    render();
  }
  function askStock() {
    const now = Date.now();
    if (now - askedAt < 3000) return;
    askedAt = now;
    ctx.send({ t: 'coin', a: 'stock' });
  }

  // 품목 하나의 지금 형편
  function stateOf(it, w) {
    const has = (w.owned || []).includes(it.id);
    const worn = (w.equip || {})[it.slot] === it.id;
    const price = priceOf(it);
    const coins = w.coins | 0;
    return { has, worn, price, coins, poor: !has && price != null && coins < price };
  }

  // 품목을 눌렀을 때(진열 카드·명품 칸 공통)
  function press(it) {
    const s = stateOf(it, wal());
    if (s.has) {
      if (it.slot === 'suit') { sure = null; render(); say('코스튬은 준비중입니다.'); return; }
      act({ t: 'coin', a: 'equip', slot: it.slot, id: s.worn ? null : it.id });
    } else if (s.price == null) {
      say('팔지 않는 물건입니다.', true);
    } else if (s.poor) {
      sure = null;
      render();
      say(`코인이 모자랍니다 (${won(s.price - s.coins)}코인 부족)`, true);
    } else if (sure === it.id) {
      act({ t: 'coin', a: 'buy', id: it.id });
    } else {
      sure = it.id;
      render();
      say('한 번 더 누르면 구매합니다.');
    }
  }

  // 누르는 버튼(가격·장착·빼기). 진열 카드와 명품 칸이 같은 규칙을 쓴다.
  function actBtn(it, s, cls) {
    const b = btnEl(cls);
    if (s.has) {
      if (it.slot === 'suit') { b.classList.add('sh-off', 'sh-dim'); b.textContent = '준비중'; b.setAttribute('aria-disabled', 'true'); }
      else if (s.worn) { b.classList.add('sh-off'); b.textContent = '빼기'; }
      else { b.classList.add('sh-eq'); b.textContent = '장착'; }
      b.disabled = busy;
    } else if (s.price == null) {
      b.classList.add('sh-off', 'sh-dim');
      b.textContent = '안 팔아요';
      b.disabled = true;
    } else if (sure === it.id) {
      b.classList.add('sh-cf');
      b.textContent = '한 번 더 누르면 구매';
      b.disabled = busy;
    } else {
      b.classList.add(s.poor ? 'sh-no' : 'sh-buy');
      if (s.poor) b.setAttribute('aria-disabled', 'true');
      b.append(el('i', 'sh-coin sh-s'), el('span', null, `${won(s.price)} 코인`));
      b.disabled = busy;
    }
    return b;
  }

  // 그림: 칭호는 배지, 나머지는 아이콘(그림이 없으면 look.js 가 물음표를 주고 여기서 "준비중"을 붙인다)
  function artInto(box, it, size) {
    if (it.slot === 'title') {
      const b = titleBadge({ title: it.id });
      box.classList.add('sh-art-t');
      if (b) box.append(b);
      return;
    }
    const ic = itemIcon(it.id, size);
    box.append(ic);
    if (ic.querySelector('.lk-q') || it.slot === 'suit') box.append(el('span', 'sh-soon', '준비중'));
  }
  const kindOf = (it) => (it.slot === 'suit' ? '코스튬 · 준비중' : KIND[it.slot] || '');
  const iconSize = () => {
    if (small()) return 38;
    const k = Math.min(window.innerHeight / 720, window.innerWidth / 1280);
    return Math.round(76 * Math.max(0.75, Math.min(1.7, k)));
  };

  // ----- 나만의 진열대 -----
  function frontCard(it, w) {
    const s = stateOf(it, w);
    const c = el('article', 'sh-cd sh-front' + (s.has ? ' sh-own' : '') + (s.worn ? ' sh-worn' : '') + (sure === it.id ? ' sh-sel' : '') + (fresh === it.id ? ' sh-in' : ''));
    c.dataset.id = it.id;
    paint(c, it.g);
    const inner = el('div', 'sh-in-box');
    const art = el('div', 'sh-art');
    artInto(art, it, iconSize());
    if (s.worn) art.append(el('span', 'sh-st', '착용 중'));
    const sub = el('p', 'sh-sub');
    if (s.has) sub.textContent = `${kindOf(it)} · 보유`;
    else if (s.poor) { sub.append(`${KIND[it.slot] || ''} · `, el('span', 'sh-lo', `코인 ${won(s.price - s.coins)} 부족`)); }
    else if (sure === it.id) sub.textContent = `${KIND[it.slot] || ''} · ${won(s.price)} 코인`;
    else sub.textContent = kindOf(it);
    inner.append(el('div', 'sh-gb', gradeOf(it.g).name), art, el('h3', 'sh-name', it.name), sub, actBtn(it, s, 'sh-pb'));
    c.append(inner);
    c.addEventListener('click', () => press(it));
    return c;
  }

  function reveal(id) {
    if (opened.has(id) || opening.has(id)) return;
    const done = () => {
      opening.delete(id);
      opened.add(id);
      saveOpen(opened);
      if (closed) return;
      fresh = calm() ? null : id;
      render();
    };
    if (calm()) { done(); return; }
    opening.add(id);
    const t = setTimeout(() => { flipTimers.delete(t); done(); }, FLIP_MS);
    flipTimers.add(t);
    render();
  }

  function backCard(it, i) {
    const b = btnEl('sh-cd sh-fd' + (opening.has(it.id) ? ' sh-opening' : ''));
    b.setAttribute('aria-label', `가려진 카드 ${i + 1} 열기`);
    b.dataset.slot = String(i);
    b.append(el('span', 'sh-in-box'), el('span', 'sh-seam'));
    b.addEventListener('click', () => reveal(it.id));
    return b;
  }

  function buildRow(w) {
    ti.textContent = '';
    ti.classList.toggle('sh-shift', shift && !calm());
    shift = false;
    const row = stock ? stock.row : [null, null, null, null, null, null];
    row.forEach((id, i) => {
      const it = item(id);
      if (!it) {
        const v = el('div', 'sh-cd sh-void');
        v.append(el('span', null, stock ? '빈 자리' : '진열 준비 중'));
        ti.append(v);
      } else if (opened.has(it.id)) ti.append(frontCard(it, w));
      else ti.append(backCard(it, i));
    });
    fresh = null;
  }

  // ----- 이 시간의 명품 -----
  function buildFeat(w) {
    featEls.forEach((f, i) => {
      const id = stock ? stock.feat[i] : null;
      const it = item(id);
      f.inner.textContent = '';
      f.time = null;
      f.a.classList.toggle('sh-none', !it);
      f.a.classList.toggle('sh-sel', !!it && sure === it.id);
      f.a.onclick = null;
      if (!it) {
        f.inner.append(el('p', 'sh-lt', '이 시간의 명품'), el('div', 'sh-lp sh-lp-none', stock ? '빈 자리' : '준비 중'));
        return;
      }
      const s = stateOf(it, w);
      const lt = el('p', 'sh-lt');
      const em = el('em', null, '남은 시간 ');
      f.time = el('b');
      em.append(f.time);
      lt.append(el('span', 'sh-gl', gradeOf(it.g).name), el('span', null, kindOf(it)), em);
      const lp = el('div', 'sh-lp');
      if (it.slot === 'title') {
        const plq = el('div', 'sh-plq');
        const sp = el('span');
        sp.append(el('b', 'sh-hf', String((it.v && it.v.text) || it.name)));
        plq.append(sp);
        lp.append(svg('sh-fl', '20 0 420 150', SVG_FLAME, 'none'), plq);
      } else {
        const art = el('span', 'sh-lp-art');
        artInto(art, it, small() ? 30 : Math.round(iconSize() * 0.62));
        lp.append(art, el('b', 'sh-lp-name sh-hf', it.name));
      }
      const lb = el('div', 'sh-lb');
      const note = el('span', 'sh-lb-note');
      if (s.worn) note.textContent = '착용 중';
      else if (s.has) note.textContent = '보유';
      else if (s.poor) { note.textContent = `코인 ${won(s.price - s.coins)} 부족`; note.classList.add('sh-lo'); }
      else note.textContent = '이 시간의 명품';
      lb.append(note, actBtn(it, s, 'sh-by'));
      f.inner.append(lt, lp, lb);
      f.a.onclick = () => press(it);
    });
  }

  // 남은 시간 글자. 0 이 되면 새 진열을 한 번만 달라고 한다.
  function tick() {
    const now = Date.now();
    let due = false;
    tm.hidden = !endNext;
    if (endNext) {
      tm.textContent = `다음 교체까지 ${clock(endNext - now)}`;
      if (endNext - now <= 0) due = true;
    }
    for (const f of featEls) {
      if (!f.time) continue;
      f.time.textContent = endFeat ? clock(endFeat - now) : '-';
    }
    if (endFeat && endFeat - now <= 0) due = true;
    if (due && !asked) { asked = true; askStock(); }
  }

  function syncStock(w) {
    if (w.stock === lastRaw) return;
    lastRaw = w.stock;
    const prev = stock;
    stock = normStock(w.stock);
    asked = false;
    const now = Date.now();
    endNext = stock && Number.isFinite(stock.next) ? now + Math.max(0, stock.next) : 0;
    endFeat = stock && Number.isFinite(stock.featLeft) ? now + Math.max(0, stock.featLeft) : 0;
    if (!stock) return;
    // 한 칸 밀렸으면(왼쪽이 나가고 오른쪽에 새 칸) 줄을 왼쪽으로 민다
    if (prev) {
      const a = prev.row, b = stock.row;
      const same = a.every((x, i) => x === b[i]);
      if (!same && b.some(Boolean) && b.slice(0, 5).every((x, i) => x === a[i + 1])) shift = true;
    }
    // 진열에서 나간 물건: 사려던 것을 놓고, 연 기억도 지운다
    const all = [...stock.row, ...stock.feat];
    if (sure && !all.includes(sure)) sure = null;
    let cut = false;
    for (const id of [...opened]) if (!stock.row.includes(id)) { opened.delete(id); cut = true; }
    if (cut) saveOpen(opened);
  }

  function renderHead(w) {
    const u = me();
    const name = (u && typeof u.name === 'string' && u.name) || '나';
    meAv.textContent = '';
    if (u && typeof u.avatar === 'string' && IMG_RE.test(u.avatar)) {
      const img = el('img');
      img.src = u.avatar;
      img.alt = '';
      img.draggable = false;
      meAv.append(img);
    } else meAv.textContent = [...name][0] || '?';
    meTitle.textContent = '';
    const badge = titleBadge(w.equip || {});
    if (badge) meTitle.append(badge);
    meTitle.hidden = !badge;
    meName.textContent = name;
    coinsB.textContent = won(w.coins | 0);
    const chips = u ? (u.chips ?? u.bank) : null;
    chipsP.hidden = typeof chips !== 'number';
    if (typeof chips === 'number') chipsB.textContent = won(chips);
  }

  function renderBig(w) {
    const free = w.free && Number(w.free.n) > 0 ? Number(w.free.n) : 0;
    bigDraw.badge.textContent = free ? `무료 ${won(free)}장 남음` : '코인으로 칩 뽑기';
    bigDraw.info.textContent = '';
    if (Number.isFinite(Number(w.pool)) && w.pool != null) bigDraw.info.append('당첨 금고 ', el('b', null, `${won(w.pool)}칩`));
    else bigDraw.info.textContent = '코인으로 칩을 뽑아요';
    bigCap.info.textContent = '';
    if (w.cpity != null && Number.isFinite(Number(w.cpity))) bigCap.info.append('레전드 확정까지 ', el('b', null, `${Math.max(1, CPITY - (w.cpity | 0))}회`));
    else bigCap.info.textContent = '칭호와 치장템이 나와요';
  }

  function render() {
    if (closed) return;
    const w = wal();
    syncStock(w);
    renderHead(w);
    renderBig(w);
    buildFeat(w);
    buildRow(w);
    tick();
  }

  // ---------- 서버 응답 ----------
  const offs = [];
  offs.push(ctx.on('me', () => render()));
  offs.push(ctx.on('coin', (m) => {
    if (m && m.a === 'buy') { busy = false; render(); say('샀습니다.'); }
    else if (m && m.a === 'equip') { busy = false; render(); say(m.id ? '장착했습니다.' : '뺐습니다.'); }
  }));
  offs.push(ctx.on('error', (m) => {
    if (!m || !ERR_RE.test(m.code || '')) return;
    busy = false;
    sure = null;
    render();
    say(ERR[m.code] || m.msg || '안 됩니다.', true);
    if (m.code === 'shop_gone') askStock();
  }));

  const timer = setInterval(tick, 1000);
  function end() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    for (const t of flipTimers) clearTimeout(t);
    for (const o of offs) { try { if (o) o(); } catch (e) { /* 무시 */ } }
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onSize);
    root.remove();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.cn-overlay')) return; // 위에 뜬 교환 창이 먼저
    end();
  }
  function onSize() { render(); }
  const go = (kind, shut) => {
    if (typeof ctx.open !== 'function') return;
    if (shut) end();
    ctx.open(kind);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onSize);
  close.addEventListener('click', end);
  ex.addEventListener('click', () => go('swap', false));
  wd.addEventListener('click', () => go('look', true));
  bigDraw.a.addEventListener('click', () => go('draw', true));
  bigCap.a.addEventListener('click', () => go('cap', true));

  render();
  return end;
}
