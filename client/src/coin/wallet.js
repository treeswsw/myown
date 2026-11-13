// 교환 창과 코인 랭킹 창 (SPEC 22-3, 22-6). 사용자 글자는 textContent 로만.
const DEFAULT_CPC = 100; // 서버가 준 wallet.chipsPerCoin 이 없을 때만
const fmt = (n) => Number(n).toLocaleString('ko-KR');

export function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
export function btn(label, cls, onClick) {
  const b = h('button', cls);
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// 공통 덮개: Esc·바깥 누름·[닫기]. 닫으면 구독도 모두 끈다.
export function sheet(ctx, label, content, extraCls = '') {
  const prev = document.activeElement;
  const closeBtn = btn('닫기', 'cn-btn', () => close());
  const head = h('div', 'cn-head');
  const title = h('b');
  title.textContent = label;
  head.append(title);
  const body = h('div', 'cn-sheet ' + extraCls, head, ...content, h('div', 'cn-btns', closeBtn));
  body.setAttribute('role', 'dialog');
  body.setAttribute('aria-modal', 'true');
  body.setAttribute('aria-label', label);
  const overlay = h('div', 'cn-overlay', body);
  const offs = [];
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() {
    document.removeEventListener('keydown', onKey, true);
    offs.forEach((f) => f());
    overlay.remove();
    prev?.focus?.();
  }
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  ctx.root.append(overlay);
  return { close, track: (off) => offs.push(off), focus: (el) => (el || closeBtn).focus() };
}

export function openSwap(ctx) {
  const input = h('input', 'cn-field');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = '바꿀 코인';
  input.setAttribute('aria-label', '바꿀 코인 수');
  const have = h('p', 'cn-sub');
  const preview = h('p', 'cn-preview');
  const msg = h('p', 'cn-msg');
  msg.setAttribute('role', 'status');
  const num = () => {
    const s = input.value.trim();
    if (!/^\d+$/.test(s)) return 0;
    const n = Number(s);
    return n >= 1 && n <= ctx.wallet().coins ? n : 0;
  };
  const allBtn = btn('전부', 'cn-btn cn-small', () => { input.value = String(ctx.wallet().coins || ''); refresh(); });
  const go = btn('바꾸기', 'cn-btn cn-primary', () => {
    const n = num();
    if (!n) return;
    go.disabled = true;
    msg.className = 'cn-msg';
    msg.textContent = '';
    ctx.send({ t: 'coin', a: 'swap', n });
  });
  function refresh() {
    input.value = input.value.replace(/[^\d]/g, '');
    const w = ctx.wallet();
    const cpc = Number(w.chipsPerCoin) > 0 ? Number(w.chipsPerCoin) : DEFAULT_CPC;
    have.textContent = `가진 코인 ${fmt(w.coins)}개 · 1코인 = ${fmt(cpc)}칩`;
    preview.textContent = `= ${fmt((Number(input.value) || 0) * cpc)}칩`;
    go.disabled = !num();
    allBtn.disabled = w.coins < 1;
  }
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });

  const s = sheet(ctx, '코인 교환', [
    h('div', 'cn-body', have, h('div', 'cn-inline', input, allBtn), preview, msg, go),
  ]);
  s.track(ctx.on('me', refresh));
  s.track(ctx.on('coin:swap', (m) => {
    msg.className = 'cn-msg cn-ok';
    msg.textContent = `${fmt(m.n)}코인을 ${fmt(m.chips)}칩으로 바꿨습니다.`;
    input.value = '';
    refresh();
  }));
  s.track(ctx.on('error', (m) => {
    if (!/^coin_/.test(m.code)) return;
    msg.className = 'cn-msg cn-err';
    msg.textContent = String(m.msg ?? '');
    refresh();
  }));
  refresh();
  s.focus(input);
}

export function openRank(ctx) {
  const list = h('div', 'cn-list');
  const loading = h('p', 'cn-empty');
  loading.textContent = '불러오는 중…';
  list.append(loading);
  const mine = h('p', 'cn-mine');
  const s = sheet(ctx, '코인 랭킹', [list, mine], 'cn-rank-sheet');
  const empty = (text) => {
    const p = h('p', 'cn-empty');
    p.textContent = text;
    list.textContent = '';
    list.append(p);
  };
  s.track(ctx.on('coin:rank', (m) => {
    list.textContent = '';
    const rows = [];
    (Array.isArray(m.top) ? m.top : []).slice(0, 20).forEach((r, i) => {
      const total = Number(r?.total) || 0;
      rows.push({ rank: i + 1, total, name: String(r?.name ?? '') });
    });
    if (!rows.length) empty('아직 순위가 없습니다.');
    for (const r of rows) {
      const n = h('span', 'cn-rank-n');
      n.textContent = String(r.rank);
      const name = h('span', 'cn-name');
      name.textContent = r.name;
      const tot = h('b', 'cn-score');
      tot.textContent = `${fmt(r.total)}코인`;
      list.append(h('div', 'cn-row', n, name, tot));
    }
    const mm = m.mine;
    mine.textContent = mm && Number.isInteger(mm.rank)
      ? `내 순위 ${mm.rank}위 · 번 코인 ${fmt(Number(mm.total) || 0)}`
      : '아직 순위 없음';
  }));
  s.track(ctx.on('error', (m) => {
    if (/^coin_/.test(m.code)) empty(String(m.msg ?? ''));
  }));
  ctx.send({ t: 'coin', a: 'rank' });
  s.focus();
}
