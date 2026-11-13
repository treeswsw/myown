// 상점 "딜러의 테이블" (SPEC 22-10, 22-16, 22-17, 22-18). 사람마다 다른 진열 두 줄(5분 · 1시간)만 보인다.
// 카드마다 그림 + 가격 버튼(두 번 눌러 사기, 코인이 모자라면 빨강). 가진 것은 같은 버튼이 끼기·빼기.
// 사용자 글자는 textContent 로만. CSS 는 .sh- 만. 요청: buy / equip / stock.
import { GRADES, item } from '../../../shared/coin/shop.js';
import { priceOf } from '../../../shared/coin/stock.js';
import { titleBadge, nameColor, itemIcon, decorate, hexCss } from './look.js';
import './shop.css';

const ROWS = [['a', '오늘의 상품'], ['b', '상시 상품']];
const KIND = { title: '칭호', hat: '모자', acc: '악세', face: '페이셜', frame: '테두리', color: '글자 색', suit: '정장' };
const WHERE = {
  title: '이름 옆에 보임 · 로비 · 모든 게임',
  hat: '모든 게임의 프로필 사진',
  acc: '모든 게임의 프로필 사진',
  face: '모든 게임의 프로필 사진',
  frame: '모든 게임의 프로필 사진',
  color: '채팅 · 이름표',
  suit: '포커 · 블러핑의 3D 인물',
};
const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.', coin_low: '코인이 모자랍니다.', coin_bad: '잘못된 요청입니다.',
  shop_no: '없는 물건입니다.', shop_gone: '진열이 바뀌었습니다.', shop_own: '이미 가지고 있습니다.', shop_not: '가지고 있지 않습니다.',
};
const ERR_RE = /^(coin|shop)_/;

// 딜러 한마디 (꾸밈용. 고르는 것은 crypto 난수)
const LINES = {
  idle: ['천천히 봐라. 어차피 살 돈도 없잖아.', '구경은 공짜다. 침은 흘리지 마라.', '뭘 봐. 카드 골라.', '물건은 때 되면 싹 바뀐다. 놓치면 니 손해.', '여기 물건은 환불 없다. 인생처럼.'],
  pick: ['보는 눈은 있네. 지갑도 있냐?', '회원증에 미리 입혀 놨다. 사든가 말든가.', '그거 사면 친구 없어짐. 원래 없었나.', '싸다 싸. 니 자존심보다는 비싸지만.'],
  poor: ['주머니가 가볍군. 한 판 더 털리고 와.', '돈도 없는 게 눈만 높아요.', '외상 안 된다. 얼굴 보니 더 안 된다.', '거지는 구경만. 만지면 사야 된다.'],
  owned: ['이미 니 거다. 걸치기나 해라.', '사 놓고 안 쓰냐. 돈이 썩어나지?', '장롱에 박아 둘 거면 왜 샀냐.'],
  worn: ['지금 끼고 있잖아. 벗으면 더 못생겨진다.', '잘 어울린다. 수준이 딱 맞아.', '벗을 거냐? 그래, 본판이 문제긴 하지.'],
  bought: ['감사합니다 호구님. 또 오세요.', '팔렸다. 환불은 꿈도 꾸지 마라.', '오, 진짜 샀네. 돈 버는 건 나다.', '탁월한 선택. 물론 거짓말이다.'],
  on: ['오, 사람 됐네. 아주 조금.', '꼈다. 이제 좀 봐줄 만하군. 멀리서 보면.', '옷이 날개라더니. 넌 그래도 닭이다.'],
  off: ['벗었다. 다시 평범한 버러지로군.', '그래, 그게 니 원래 모습이지.', '벗으니 허전하지? 하나 더 사라.'],
  err: ['안 된다면 안 되는 거다.', '어허. 수작 부리지 마라.'],
};
function rnd(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
const sayOne = (k) => { const l = LINES[k] || LINES.idle; return l[rnd(l.length)]; };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;

// 남은 시간: 1시간 미만 m:ss, 그 이상 h:mm:ss
function clock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function gradeOf(g) { return GRADES.find((x) => x.g === g) || GRADES[0]; }

function backIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'sh-ico');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M15 18l-6-6 6-6');
  s.append(p);
  return s;
}

export function openShop(ctx) {
  const old = ctx.root.querySelector('.sh-root');
  if (old) old.remove();

  // ---------- 뼈대 ----------
  const root = el('div', 'sh-root');
  const panel = el('div', 'sh-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '상점');

  const head = el('header', 'sh-head');
  const close = el('button', 'sh-close');
  close.type = 'button';
  close.setAttribute('aria-label', '로비로 돌아가기');
  close.append(backIcon());
  const swap = el('button', 'sh-swap', '칩 교환');
  const toDraw = el('button', 'sh-swap', '카드 뽑기');
  const toCap = el('button', 'sh-swap', '칭호 뽑기');
  swap.type = 'button';
  const coinsB = el('b', 'sh-num');
  const coinsP = el('div', 'sh-pill sh-coins');
  coinsP.append(coinsB, el('span', null, '코인'));
  const chipsB = el('b', 'sh-num');
  const chipsP = el('div', 'sh-pill sh-chips');
  chipsP.append(chipsB, el('span', null, '칩'));
  head.append(close, el('h2', 'sh-title', '딜러의 테이블'), el('div', 'sh-grow'), swap, toDraw, toCap, coinsP, chipsP);
  toDraw.type = toCap.type = 'button';

  // 왼쪽: 회원증 + 딜러 + 버튼
  const side = el('section', 'sh-side');
  side.setAttribute('aria-label', '내 회원증 미리보기');
  const member = el('div', 'sh-member');
  const mTop = el('div', 'sh-m-top');
  mTop.append(el('span', null, 'GANGSIK CLUB'), el('span', null, 'MEMBER'));
  const fig = el('div', 'sh-fig');
  const avBox = el('div', 'sh-avbox');
  const suitEl = el('div', 'sh-suit');
  suitEl.setAttribute('aria-hidden', 'true');
  suitEl.append(el('i', 'sh-shirt'), el('i', 'sh-tie'));
  fig.append(avBox, suitEl);
  const mInfo = el('div', 'sh-m-info');
  const mTitle = el('div', 'sh-m-title');
  const mName = el('b', 'sh-m-name');
  const mChat = el('span', 'sh-m-chat');
  const mChatTxt = el('span', null, 'ㅋㅋ 올인 간다');
  mChat.append('채팅: ', mChatTxt);
  mInfo.append(mTitle, mName, mChat);
  member.append(mTop, fig, mInfo);

  const dealer = el('div', 'sh-dealer');
  const dFig = el('div', 'sh-d-fig');
  dFig.setAttribute('aria-hidden', 'true');
  const dFace = el('i', 'sh-d-face');
  dFace.append(el('i'), el('i'));
  const dBody = el('i', 'sh-d-body');
  dBody.append(el('i'));
  dFig.append(el('i', 'sh-d-hat'), el('i', 'sh-d-brim'), dFace, dBody);
  const bubble = el('div', 'sh-bubble');
  const line = el('span', 'sh-line');
  bubble.append(el('span', 'sh-d-name', '딜러 갱 사장'), line);
  dealer.append(dFig, bubble);

  const selBox = el('div', 'sh-sel');
  const selName = el('b', 'sh-sel-name');
  const selWhere = el('span', 'sh-sel-where');
  selBox.append(selName, selWhere);
  const msg = el('p', 'sh-msg');
  msg.setAttribute('role', 'status');
  side.append(member, dealer, el('div', 'sh-grow'), selBox, msg);

  // 오른쪽: 테이블
  const table = el('section', 'sh-table');
  table.setAttribute('aria-label', '테이블');
  const rim = el('div', 'sh-rim');
  rim.setAttribute('aria-hidden', 'true');
  const rowsEl = el('div', 'sh-rows');
  const wait = el('p', 'sh-empty', '진열 준비 중');
  const rowEls = {};
  for (const [k, label] of ROWS) {
    const row = el('section', 'sh-row');
    row.dataset.row = k;
    const rh = el('div', 'sh-row-head');
    const timer = el('span', 'sh-timer');
    const tNum = el('b', 'sh-num');
    timer.append('새로고침까지 ', tNum);
    rh.append(el('h3', 'sh-row-name', label), timer);
    const cards = el('div', 'sh-cards');
    row.append(rh, cards);
    rowsEl.append(row);
    rowEls[k] = { row, cards, tNum, timer };
  }
  table.append(rim, wait, rowsEl);

  const body = el('div', 'sh-body');
  body.append(side, table);
  panel.append(head, body);
  root.append(panel);
  ctx.root.append(root);

  // ---------- 상태 ----------
  let sel = null; // 고른 품목 id (회원증에 미리 입혀 본다)
  let sure = null; // 가격 버튼을 한 번 누른 품목 id (한 번 더 누르면 산다)
  let busy = false;
  let lineKey = '';
  let event = null; // 방금 일어난 일('bought' | 'on' | 'off' | 'err'), 다른 카드를 고르면 지워진다
  let lastStock; // 마지막으로 본 wallet.stock (새로 오면 남은 시간을 다시 잰다)
  const ends = { a: 0, b: 0 }; // 줄마다 바뀌는 시각(이 기기 시계)
  let asked = false; // 이번 진열에서 새 진열을 이미 달라고 했는가 (한 번만)

  const wal = () => ctx.wallet() || { coins: 0, owned: [], equip: {} };
  const me = () => (typeof ctx.me === 'function' && ctx.me()) || null;
  const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('sh-bad', !!bad); };
  const small = () => window.innerHeight <= 500;
  const idsOf = (st, k) => (st && st[k] && Array.isArray(st[k].ids) ? st[k].ids.slice(0, 5) : null);

  function act(obj) {
    if (busy) return;
    busy = true;
    sure = null;
    say('');
    ctx.send(obj);
    render();
  }

  // 카드 안 그림
  function artOf(it) {
    const box = el('span', 'sh-art');
    if (it.slot === 'title') {
      const b = titleBadge({ title: it.id });
      box.classList.add('sh-art-title');
      if (b) box.append(b);
    } else if (it.slot === 'suit') {
      const v = it.v || {};
      const a = el('i', 'sh-sw-suit');
      a.style.background = hexCss(v.suit);
      const t = el('i', 'sh-sw-tie');
      t.style.background = hexCss(v.tie);
      box.append(a, t);
    } else if (it.slot === 'color') {
      const t = el('span', 'sh-sw-text', '가나다');
      t.style.color = hexCss((it.v || {}).hex);
      box.append(t);
    } else {
      box.append(itemIcon(it.id, small() ? 34 : 48));
    }
    return box;
  }

  function pick(id) {
    if (sel !== id) { event = null; sure = null; say(''); }
    sel = id;
  }

  function cardOf(it, w) {
    const owned = w.owned || [];
    const equip = w.equip || {};
    const coins = w.coins | 0;
    const has = owned.includes(it.id);
    const worn = equip[it.slot] === it.id;
    const price = priceOf(it);
    const poor = !has && price != null && coins < price;
    const gr = gradeOf(it.g);
    const c = el('div', 'sh-card' + (has ? ' sh-own' : '') + (worn ? ' sh-worn' : '') + (poor ? ' sh-poor' : '') + (sel === it.id ? ' sh-on' : ''));
    c.dataset.id = it.id;
    c.style.setProperty('--sh-gc', gr.color === 'rainbow' ? '#ff6ad5' : gr.color);

    const pk = el('button', 'sh-pick');
    pk.type = 'button';
    pk.setAttribute('aria-pressed', sel === it.id ? 'true' : 'false');
    pk.append(el('span', 'sh-grade', gr.name), artOf(it), el('b', 'sh-name', it.name), el('span', 'sh-kind', KIND[it.slot] || ''));
    if (worn) pk.append(el('span', 'sh-stamp', '착용 중'));
    pk.addEventListener('click', () => { pick(it.id); render(); });

    const b = el('button', 'sh-act');
    b.type = 'button';
    if (has) {
      b.classList.add('sh-equip');
      b.textContent = worn ? '빼기' : '끼기';
      b.disabled = busy;
      b.addEventListener('click', () => {
        pick(it.id);
        act({ t: 'coin', a: 'equip', slot: it.slot, id: worn ? null : it.id });
      });
    } else if (price == null) {
      b.classList.add('sh-none');
      b.textContent = '안 팔아요';
      b.disabled = true;
    } else if (poor) {
      b.classList.add('sh-low');
      b.setAttribute('aria-disabled', 'true');
      b.append(el('b', 'sh-num', won(price)), el('span', null, '코인'));
      b.addEventListener('click', () => {
        pick(it.id);
        render();
        say(`코인이 모자랍니다 (${won(price - coins)}코인 부족)`, true);
      });
    } else if (sure === it.id) {
      b.classList.add('sh-buy', 'sh-sure');
      b.textContent = '한 번 더!';
      b.disabled = busy;
      b.addEventListener('click', () => act({ t: 'coin', a: 'buy', id: it.id }));
    } else {
      b.classList.add('sh-buy');
      b.append(el('b', 'sh-num', won(price)), el('span', null, '코인'));
      b.disabled = busy;
      b.addEventListener('click', () => {
        pick(it.id);
        sure = it.id;
        render();
        say('한 번 더 누르면 삽니다.');
      });
    }
    c.append(pk, b);
    return c;
  }

  function buildCards(w) {
    const st = w.stock;
    const ok = !!(idsOf(st, 'a') || idsOf(st, 'b'));
    wait.hidden = ok;
    rowsEl.hidden = !ok;
    for (const [k] of ROWS) {
      const r = rowEls[k];
      const ids = idsOf(st, k);
      r.row.hidden = !ids;
      r.cards.textContent = '';
      if (!ids) continue;
      for (let i = 0; i < 5; i++) {
        const it = item(ids[i]);
        if (it) r.cards.append(cardOf(it, w));
        else {
          const v = el('div', 'sh-void', '빈 자리');
          v.setAttribute('aria-label', '빈 자리');
          r.cards.append(v);
        }
      }
    }
  }

  // 남은 시간 글자. 0 이 되면 새 진열을 한 번만 달라고 한다.
  function tick() {
    const now = Date.now();
    let due = false;
    for (const [k] of ROWS) {
      const r = rowEls[k];
      if (r.row.hidden || !ends[k]) { r.timer.hidden = true; continue; }
      r.timer.hidden = false;
      const left = ends[k] - now;
      r.tNum.textContent = clock(left);
      if (left <= 0) due = true;
    }
    if (due && !asked) { asked = true; ctx.send({ t: 'coin', a: 'stock' }); }
  }

  function syncStock(w) {
    const st = w.stock;
    if (st === lastStock) return;
    lastStock = st;
    asked = false;
    const now = Date.now();
    const all = [];
    for (const [k] of ROWS) {
      const left = st && st[k] ? Number(st[k].left) : NaN;
      ends[k] = Number.isFinite(left) ? now + Math.max(0, left) : 0;
      all.push(...(idsOf(st, k) || []));
    }
    // 진열에서 빠진 물건을 고르고 있었으면 놓는다
    if (sel && !all.includes(sel)) { sel = null; sure = null; event = null; }
  }

  function renderMember(w) {
    const equip = w.equip || {};
    const it = item(sel);
    const look = { ...equip };
    if (it) look[it.slot] = it.id;
    const u = me();
    const name = (u && typeof u.name === 'string' && u.name) || '나';

    // 프로필 사진(없으면 첫 글자) + 테두리
    avBox.textContent = '';
    const av = el('div', 'sh-av');
    if (u && typeof u.avatar === 'string' && IMG_RE.test(u.avatar)) {
      const img = el('img');
      img.src = u.avatar;
      img.alt = '';
      img.draggable = false;
      av.append(img);
    } else {
      av.append(el('span', null, [...name][0] || '?'));
    }
    avBox.append(av);
    const size = Math.round(avBox.getBoundingClientRect().width) || 72;
    decorate(av, look, { size });

    const su = item(look.suit);
    suitEl.style.setProperty('--sh-su', su && su.v ? hexCss(su.v.suit) : '#3a3e4a');
    suitEl.style.setProperty('--sh-ti', su && su.v ? hexCss(su.v.tie) : '#5c1016');

    mTitle.textContent = '';
    const badge = titleBadge(look);
    if (badge) mTitle.append(badge);
    mName.textContent = name;
    const nc = nameColor(look) || '';
    mName.style.color = nc;
    mChatTxt.style.color = nc;
  }

  function render() {
    const w = wal();
    const owned = w.owned || [];
    const equip = w.equip || {};
    const coins = w.coins | 0;
    syncStock(w);

    coinsB.textContent = won(coins);
    const u = me();
    const chips = u ? (u.chips ?? u.bank) : null;
    chipsP.hidden = typeof chips !== 'number';
    if (typeof chips === 'number') chipsB.textContent = won(chips);
    swap.disabled = busy;

    buildCards(w);
    tick();
    renderMember(w);

    const it = item(sel);
    const has = !!it && owned.includes(it.id);
    const worn = !!it && equip[it.slot] === it.id;
    const price = it ? priceOf(it) : null;
    let st = 'idle';
    if (it) st = worn ? 'worn' : has ? 'owned' : price != null && coins < price ? 'poor' : 'pick';
    selName.textContent = it ? it.name : '카드를 골라 보세요';
    selWhere.textContent = it ? `${gradeOf(it.g).name} · ${KIND[it.slot] || ''} · ${WHERE[it.slot] || ''}` : '고르면 회원증에 미리 입혀 드립니다';

    // 딜러 한마디: 상황이 바뀔 때만 새로 고른다
    const lk = (event || st) + ':' + (sel || '');
    if (lk !== lineKey) { lineKey = lk; line.textContent = sayOne(event || st); }
  }

  // ---------- 서버 응답 ----------
  const offs = [];
  offs.push(ctx.on('me', () => render()));
  offs.push(ctx.on('coin', (m) => {
    if (m && m.a === 'buy') { busy = false; event = 'bought'; say('샀습니다.'); render(); }
    else if (m && m.a === 'equip') { busy = false; event = m.id ? 'on' : 'off'; say(m.id ? '꼈습니다.' : '뺐습니다.'); render(); }
  }));
  offs.push(ctx.on('error', (m) => {
    if (!m || !ERR_RE.test(m.code || '')) return;
    busy = false;
    sure = null;
    event = 'err';
    render();
    say(ERR[m.code] || m.msg || '안 됩니다.', true);
  }));

  const timer = setInterval(tick, 1000);
  function end() {
    clearInterval(timer);
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
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onSize);
  close.addEventListener('click', end);
  swap.addEventListener('click', () => { if (typeof ctx.open === 'function') ctx.open('swap'); });
  toDraw.addEventListener('click', () => { if (typeof ctx.open === 'function') { end(); ctx.open('draw'); } });
  toCap.addEventListener('click', () => { if (typeof ctx.open === 'function') { end(); ctx.open('cap'); } });

  render();
  return end;
}
