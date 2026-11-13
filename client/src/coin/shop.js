// 상점 "딜러의 테이블" (SPEC 22-5, 22-10, 22-16, 22-17). 사용자 시안(회원증 + 빨간 테이블 + 카드 모양 품목).
// 사용자 글자는 textContent 로만. CSS 는 .sh- 만. 요청: buy / equip (22-10 그대로).
import { ITEMS, GRADES, item } from '../../../shared/coin/shop.js';
import { titleBadge, nameColor, itemIcon, decorate, hexCss } from './look.js';
import './shop.css';

// 지금 파는 종류 (모자·악세·페이셜은 그림이 준비된 뒤)
const TABS = [['title', '칭호'], ['frame', '테두리'], ['color', '글자 색'], ['suit', '정장']];
const KIND = { title: '칭호', frame: '프로필 테두리', color: '글자 색', suit: '정장 색' };
const WHERE = {
  title: '이름 옆에 보임 · 로비 · 모든 게임',
  frame: '모든 게임의 프로필 사진',
  color: '채팅 · 이름표',
  suit: '포커 · 블러핑의 3D 인물',
};
const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.', coin_low: '코인이 모자랍니다.', coin_bad: '잘못된 요청입니다.',
  shop_no: '없는 물건입니다.', shop_own: '이미 가지고 있습니다.', shop_not: '가지고 있지 않습니다.',
};
const ERR_RE = /^(coin|shop)_/;

// 딜러 한마디 (꾸밈용. 고르는 것은 crypto 난수)
const LINES = {
  idle: ['천천히 봐라. 어차피 살 돈도 없잖아.', '구경은 공짜다. 침은 흘리지 마라.', '뭘 봐. 카드 골라.', '여기 물건은 환불 없다. 인생처럼.'],
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
  swap.type = 'button';
  const coinsB = el('b', 'sh-num');
  const coinsP = el('div', 'sh-pill sh-coins');
  coinsP.append(coinsB, el('span', null, '코인'));
  const chipsB = el('b', 'sh-num');
  const chipsP = el('div', 'sh-pill sh-chips');
  chipsP.append(chipsB, el('span', null, '칩'));
  head.append(close, el('h2', 'sh-title', '딜러의 테이블'), el('div', 'sh-grow'), swap, coinsP, chipsP);

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
  const go = el('button', 'sh-go');
  go.type = 'button';
  side.append(member, dealer, el('div', 'sh-grow'), selBox, msg, go);

  // 오른쪽: 테이블
  const table = el('section', 'sh-table');
  table.setAttribute('aria-label', '테이블');
  const rim = el('div', 'sh-rim');
  rim.setAttribute('aria-hidden', 'true');
  const tabs = el('nav', 'sh-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '종류');
  const cards = el('div', 'sh-cards');
  table.append(rim, tabs, cards);

  const body = el('div', 'sh-body');
  body.append(side, table);
  panel.append(head, body);
  root.append(panel);
  ctx.root.append(root);

  // ---------- 상태 ----------
  let slot = TABS[0][0];
  let sel = null; // 고른 품목 id
  let busy = false;
  let lineKey = '';
  let event = null; // 방금 일어난 일('bought' | 'on' | 'off' | 'err'), 다른 카드를 고르면 지워진다
  let cardsKey = '';
  const tabBtns = new Map();

  const wal = () => ctx.wallet() || { coins: 0, owned: [], equip: {} };
  const me = () => (typeof ctx.me === 'function' && ctx.me()) || null;
  const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('sh-bad', !!bad); };

  for (const [k, label] of TABS) {
    const b = el('button', 'sh-tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      if (slot === k) return;
      slot = k; sel = null; event = null; say('');
      cards.scrollLeft = 0; cards.scrollTop = 0;
      render();
    });
    tabBtns.set(k, b);
    tabs.append(b);
  }

  function act(obj) {
    if (busy) return;
    busy = true;
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
      box.append(itemIcon(it.id, 48));
    }
    return box;
  }

  function buildCards(w) {
    const owned = w.owned || [];
    const equip = w.equip || {};
    const coins = w.coins | 0;
    cards.textContent = '';
    const list = ITEMS.filter((it) => it.slot === slot && (it.shop === true || owned.includes(it.id)));
    if (!list.length) cards.append(el('p', 'sh-empty', '아직 물건이 없습니다.'));
    for (const it of list) {
      const has = owned.includes(it.id);
      const worn = equip[it.slot] === it.id;
      const price = Number(it.price) || 0;
      const poor = !has && coins < price;
      const gr = gradeOf(it.g);
      const c = el('button', 'sh-card' + (has ? ' sh-own' : '') + (worn ? ' sh-worn' : '') + (poor ? ' sh-poor' : ''));
      c.type = 'button';
      c.dataset.id = it.id;
      const band = el('i', 'sh-band' + (gr.color === 'rainbow' ? ' sh-rainbow' : ''));
      if (gr.color !== 'rainbow') band.style.background = gr.color;
      const tag = el('span', 'sh-tag', has ? '보유' : won(price) + ' 코인');
      c.append(band, artOf(it), el('b', 'sh-name', it.name), el('span', 'sh-kind', gr.name + ' · ' + (KIND[it.slot] || '')), tag);
      if (worn) c.append(el('span', 'sh-stamp', '착용 중'));
      c.addEventListener('click', () => {
        if (sel !== it.id) event = null;
        sel = it.id;
        say('');
        render();
      });
      cards.append(c);
    }
  }

  function renderMember(w) {
    const equip = w.equip || {};
    const it = item(sel);
    const look = { ...equip };
    if (it && TABS.some(([k]) => k === it.slot)) look[it.slot] = it.id;
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

    coinsB.textContent = won(coins);
    const u = me();
    const chips = u ? (u.chips ?? u.bank) : null;
    chipsP.hidden = typeof chips !== 'number';
    if (typeof chips === 'number') chipsB.textContent = won(chips);
    swap.disabled = busy;

    for (const [k, b] of tabBtns) {
      b.classList.toggle('sh-on', k === slot);
      b.setAttribute('aria-selected', k === slot ? 'true' : 'false');
    }

    const key = slot + '|' + coins + '|' + owned.join(',') + '|' + JSON.stringify(equip);
    if (key !== cardsKey) { cardsKey = key; buildCards(w); }
    for (const c of cards.querySelectorAll('.sh-card')) {
      const on = c.dataset.id === sel;
      c.classList.toggle('sh-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    renderMember(w);

    // 아래 큰 버튼
    const it = item(sel);
    const has = !!it && owned.includes(it.id);
    const worn = !!it && equip[it.slot] === it.id;
    const price = it ? Number(it.price) || 0 : 0;
    let st = 'idle';
    go.className = 'sh-go';
    go.onclick = null;
    if (!it) {
      go.textContent = '카드를 골라 보세요';
      go.disabled = true;
      go.classList.add('sh-none');
    } else if (!has && it.shop !== true) {
      go.textContent = '지금은 팔지 않아요';
      go.disabled = true;
      go.classList.add('sh-none');
    } else if (!has && coins < price) {
      st = 'poor';
      go.textContent = `코인이 모자랍니다 (${won(price - coins)}코인 부족)`;
      go.disabled = true;
      go.classList.add('sh-low');
    } else if (!has) {
      st = 'pick';
      go.textContent = `${won(price)} 코인으로 사기`;
      go.disabled = busy;
      go.classList.add('sh-buy');
      go.onclick = () => act({ t: 'coin', a: 'buy', id: it.id });
    } else if (worn) {
      st = 'worn';
      go.textContent = '빼기';
      go.disabled = busy;
      go.classList.add('sh-equip');
      go.onclick = () => act({ t: 'coin', a: 'equip', slot: it.slot, id: null });
    } else {
      st = 'owned';
      go.textContent = '끼기';
      go.disabled = busy;
      go.classList.add('sh-equip');
      go.onclick = () => act({ t: 'coin', a: 'equip', slot: it.slot, id: it.id });
    }
    selName.textContent = it ? it.name : '카드를 골라 보세요';
    selWhere.textContent = it ? WHERE[it.slot] || '' : '고르면 회원증에 미리 입혀 드립니다';

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
    event = 'err';
    render();
    say(ERR[m.code] || m.msg || '안 됩니다.', true);
  }));

  function end() {
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

  render();
  return end;
}
