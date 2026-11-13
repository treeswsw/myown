// 상점 창 (뼈대). SPEC 22-5, 22-10, 22-11, 22-14. 사용자 글자는 textContent 로만.
import { SLOTS, ITEMS } from '../../../shared/coin/shop.js';
import './shop.css';

const SLOT_NAME = { title: '칭호', frame: '프로필 테두리', color: '글자 색', suit: '정장 색' };
const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.', coin_low: '코인이 모자랍니다.', coin_bad: '잘못된 요청입니다.',
  shop_no: '없는 물건입니다.', shop_own: '이미 가지고 있습니다.', shop_not: '가지고 있지 않습니다.',
};
const ERR_RE = /^(coin|shop)_/;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// 색 값(숫자 0xrrggbb 또는 #, rgb, hsl 글자)을 CSS 글자로
function css(x) {
  if (typeof x === 'number' && Number.isFinite(x)) return '#' + (x & 0xffffff).toString(16).padStart(6, '0');
  if (typeof x === 'string' && /^(#|rgb|hsl)/i.test(x)) return x;
  return null;
}
function colorOf(v) {
  if (!v || typeof v !== 'object') return null;
  for (const k of ['hex', 'suit', 'color']) { const c = css(v[k]); if (c) return c; }
  for (const k of Object.keys(v)) { const c = css(v[k]); if (c) return c; }
  return null;
}

function preview(it) {
  const c = colorOf(it.v);
  if (it.slot === 'title') return el('span', 'sh-pv sh-pv-text', (it.v && it.v.text) || it.name);
  const p = el('span', 'sh-pv sh-pv-' + it.slot);
  if (it.slot === 'frame') { if (c) p.style.borderColor = c; }
  else if (it.slot === 'color') { p.textContent = '가'; if (c) p.style.color = c; }
  else if (it.slot === 'suit') {
    const tie = css(it.v && it.v.tie);
    p.style.display = 'flex'; p.style.gap = '4px'; p.style.background = 'transparent';
    for (const col of [c, tie]) {
      if (!col) continue;
      const sw = el('span', 'sh-sw');
      sw.style.cssText = `width:16px;height:22px;border-radius:5px;border:1px solid rgba(128,128,128,.5);background:${col}`;
      p.append(sw);
    }
  }
  else if (c) p.style.background = c;
  return p;
}

export function openShop(ctx) {
  const old = ctx.root.querySelector('.sh-root');
  if (old) old.remove();

  const root = el('div', 'sh-root');
  const panel = el('div', 'sh-panel');
  const head = el('div', 'sh-head');
  head.append(el('h2', 'sh-title', '상점'));
  const coins = el('span', 'sh-coins');
  const close = el('button', 'sh-close', '닫기');
  close.type = 'button';
  head.append(coins, close);
  const tabs = el('div', 'sh-tabs');
  tabs.setAttribute('role', 'tablist');
  const msg = el('p', 'sh-msg');
  msg.setAttribute('role', 'status');
  const list = el('div', 'sh-list');
  panel.append(head, tabs, msg, list);
  root.append(panel);
  ctx.root.append(root);

  const slots = (Array.isArray(SLOTS) ? SLOTS : []).slice();
  let slot = slots[0];
  let busy = false;

  const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('sh-bad', !!bad); };
  const w = () => ctx.wallet() || { coins: 0, owned: [], equip: {} };

  function act(obj) {
    if (busy) return;
    busy = true;
    say('');
    ctx.send(obj);
    render();
  }

  function render() {
    const wal = w();
    const owned = wal.owned || [];
    const equip = wal.equip || {};
    coins.textContent = (wal.coins | 0).toLocaleString('ko-KR') + ' 코인';

    tabs.textContent = '';
    for (const s of slots) {
      const b = el('button', 'sh-tab' + (s === slot ? ' sh-on' : ''), SLOT_NAME[s] || s);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', s === slot ? 'true' : 'false');
      b.addEventListener('click', () => { slot = s; say(''); render(); });
      tabs.append(b);
    }

    list.textContent = '';
    const items = (ITEMS || []).filter((it) => it.slot === slot);
    if (!items.length) list.append(el('p', 'sh-empty', '아직 물건이 없습니다.'));
    for (const it of items) {
      const row = el('div', 'sh-row');
      row.append(preview(it));
      const info = el('div', 'sh-info');
      info.append(el('div', 'sh-name', it.name), el('div', 'sh-price', it.price.toLocaleString('ko-KR') + ' 코인'));
      row.append(info);
      const has = owned.includes(it.id);
      const b = el('button', 'sh-btn');
      b.type = 'button';
      b.disabled = busy;
      if (!has) {
        b.textContent = '사기';
        b.classList.add('sh-buy');
        if ((wal.coins | 0) < it.price) b.classList.add('sh-low');
        b.addEventListener('click', () => act({ t: 'coin', a: 'buy', id: it.id }));
      } else if (equip[it.slot] === it.id) {
        b.textContent = '빼기';
        b.addEventListener('click', () => act({ t: 'coin', a: 'equip', slot: it.slot, id: null }));
      } else {
        b.textContent = '끼기';
        b.classList.add('sh-buy');
        b.addEventListener('click', () => act({ t: 'coin', a: 'equip', slot: it.slot, id: it.id }));
      }
      row.append(b);
      list.append(row);
    }
  }

  const offs = [];
  offs.push(ctx.on('me', () => { busy = false; render(); }));
  offs.push(ctx.on('coin', (m) => {
    if (m && m.a === 'buy') { busy = false; say('샀습니다.'); render(); }
    else if (m && m.a === 'equip') { busy = false; say(m.id ? '꼈습니다.' : '뺐습니다.'); render(); }
  }));
  offs.push(ctx.on('error', (m) => {
    if (!m || !ERR_RE.test(m.code || '')) return;
    busy = false;
    render();
    say(ERR[m.code] || m.msg || '안 됩니다.', true);
  }));

  function end() {
    for (const o of offs) { try { if (o) o(); } catch (e) { /* 무시 */ } }
    document.removeEventListener('keydown', onKey);
    root.remove();
  }
  function onKey(e) { if (e.key === 'Escape') end(); }
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', end);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) end(); });

  render();
  return end;
}
