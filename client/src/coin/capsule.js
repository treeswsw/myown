// 캡슐 뽑기(칭호·치장템) 간단 창 (SPEC 22-16). 기계 연출은 나중에 이 파일을 바꾼다. 사용자 글자는 textContent 로만.
import { h, btn, sheet } from './wallet.js';
import { item, GRADES } from '../../../shared/coin/shop.js';
import { itemIcon } from './look.js';
import './capsule.css';

const COST = 10;
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const KIND = { title: '칭호', hat: '모자', acc: '악세', face: '페이셜', frame: '테두리', color: '글자 색', suit: '코스튬' };

export function openCapsule(ctx) {
  const info = h('p', 'cn-sub');
  const msg = h('p', 'cn-msg');
  msg.setAttribute('role', 'status');
  const list = h('div', 'cp-list');
  let busy = false;
  const go = (n) => {
    if (busy || (ctx.wallet().coins | 0) < COST * n) return;
    busy = true; refresh();
    msg.className = 'cn-msg'; msg.textContent = '뽑는 중…';
    ctx.send({ t: 'coin', a: 'cap', n });
  };
  const one = btn(`1개 · ${COST}코인`, 'cn-btn cn-primary cp-go', () => go(1));
  const ten = btn(`10개 · ${COST * 10}코인`, 'cn-btn cn-primary cp-go', () => go(10));
  function refresh() {
    const w = ctx.wallet();
    const c = w.coins | 0;
    info.textContent = `코인 ${fmt(c)} · 조각 ${fmt(w.shard | 0)} · 레전드 확정까지 ${Math.max(1, 80 - (w.cpity | 0))}개`;
    one.disabled = busy || c < COST;
    ten.disabled = busy || c < COST * 10;
  }
  function show(m) {
    busy = false;
    list.textContent = '';
    const pulls = Array.isArray(m.pulls) ? [...m.pulls].sort((a, b) => (a.g | 0) - (b.g | 0)) : [];
    for (const p of pulls) {
      const it = item(p.id);
      const gr = GRADES.find((g) => g.g === p.g) || GRADES[0];
      const row = h('div', 'cp-row' + (p.g >= 3 ? ' cp-big' : ''));
      row.style.setProperty('--g', gr.color === 'rainbow' ? '#ff5cf0' : gr.color);
      const name = h('b'); name.textContent = it ? it.name : String(p.id);
      const sub = h('span');
      sub.textContent = `${gr.name} · ${KIND[it?.slot] || ''}${p.dup ? ` · 중복 → 조각 +${p.shard | 0}` : ' · 새로 얻음'}`;
      row.append(itemIcon(p.id, 36), h('div', 'cp-txt', name, sub));
      list.append(row);
    }
    msg.className = 'cn-msg cn-ok';
    msg.textContent = Array.isArray(m.got) && m.got.length ? `보너스: ${m.got.map((id) => item(id)?.name || id).join(', ')}!` : '';
    refresh();
  }
  const s = sheet(ctx, '칭호·치장 캡슐', [h('div', 'cn-body', info, h('div', 'cn-inline', one, ten), msg, list)], 'cp-sheet');
  s.track(ctx.on('me', refresh));
  s.track(ctx.on('coin:cap', show));
  s.track(ctx.on('error', (m) => {
    if (!/^(coin|shop)_/.test(m.code)) return;
    busy = false;
    msg.className = 'cn-msg cn-err';
    msg.textContent = m.code === 'coin_bad' ? '이용불가' : String(m.msg ?? '');
    refresh();
  }));
  refresh();
  s.focus(one);
}
