// 교환 창과 코인 랭킹 창 (SPEC 22-3, 22-6). 사용자 글자는 textContent 로만.
const DEFAULT_CPC = 100; // 서버가 준 wallet.chipsPerCoin 이 없을 때만
const DEFAULT_CPB = 1000; // wallet.chipsPerCoinBack (칩 -> 코인)
const DEFAULT_KEEP = 10000; // wallet.keepChips (남겨야 하는 시작 칩)
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
  let back = false; // false = 코인 -> 칩, true = 칩 -> 코인
  const input = h('input', 'cn-field');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  const have = h('p', 'cn-sub');
  const preview = h('p', 'cn-preview');
  const msg = h('p', 'cn-msg');
  msg.setAttribute('role', 'status');
  const dirBtn = btn('', 'cn-btn cn-small cn-dir', () => { back = !back; input.value = ''; msg.textContent = ''; msg.className = 'cn-msg'; refresh(); });
  // 서버가 준 시세·남길 칩. 바꿀 수 있는 최대 코인 수(칩 -> 코인)는 남길 칩을 뺀 칩으로 센다.
  const rate = () => {
    const w = ctx.wallet();
    const u = ctx.me();
    const bank = Number(u?.chips ?? u?.bank) || 0;
    const cpb = Number(w.chipsPerCoinBack) > 0 ? Number(w.chipsPerCoinBack) : DEFAULT_CPB;
    const keep = Number(w.keepChips) >= 0 ? Number(w.keepChips) : DEFAULT_KEEP;
    return { w, cpc: Number(w.chipsPerCoin) > 0 ? Number(w.chipsPerCoin) : DEFAULT_CPC, cpb, keep, max: back ? Math.max(0, Math.floor((bank - keep) / cpb)) : w.coins, bank };
  };
  const num = () => {
    const s = input.value.trim();
    if (!/^\d+$/.test(s)) return 0;
    const n = Number(s);
    return n >= 1 && n <= rate().max ? n : 0;
  };
  const allBtn = btn('전부', 'cn-btn cn-small', () => { input.value = String(rate().max || ''); refresh(); });
  const go = btn('바꾸기', 'cn-btn cn-primary', () => {
    const n = num();
    if (!n) return;
    go.disabled = true;
    msg.className = 'cn-msg';
    msg.textContent = '';
    ctx.send({ t: 'coin', a: back ? 'back' : 'swap', n });
  });
  function refresh() {
    input.value = input.value.replace(/[^\d]/g, '');
    const r = rate();
    const n = Number(input.value) || 0;
    input.placeholder = back ? '바꿀 코인 (칩에서)' : '바꿀 코인';
    input.setAttribute('aria-label', back ? '칩으로 얻을 코인 수' : '바꿀 코인 수');
    dirBtn.textContent = back ? '칩 → 코인 (눌러서 코인 → 칩)' : '코인 → 칩 (눌러서 칩 → 코인)';
    if (back) {
      have.textContent = `가진 칩 ${fmt(r.bank)}개 · ${fmt(r.cpb)}칩 = 1코인 · 바꿀 수 있는 코인 ${fmt(r.max)}개 · ${fmt(r.keep)}칩은 남겨야 해요`;
      preview.textContent = `= ${fmt(n * r.cpb)}칩 → ${fmt(n)}코인`;
    } else {
      have.textContent = `가진 코인 ${fmt(r.w.coins)}개 · 1코인 = ${fmt(r.cpc)}칩`;
      preview.textContent = `= ${fmt(n * r.cpc)}칩`;
    }
    go.disabled = !num();
    allBtn.disabled = r.max < 1;
  }
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });

  const s = sheet(ctx, '코인 교환', [
    h('div', 'cn-body', dirBtn, have, h('div', 'cn-inline', input, allBtn), preview, msg, go),
  ]);
  s.track(ctx.on('me', refresh));
  s.track(ctx.on('coin:swap', (m) => {
    msg.className = 'cn-msg cn-ok';
    msg.textContent = `${fmt(m.n)}코인을 ${fmt(m.chips)}칩으로 바꿨습니다.`;
    input.value = '';
    refresh();
  }));
  s.track(ctx.on('coin:back', (m) => {
    msg.className = 'cn-msg cn-ok';
    msg.textContent = `${fmt(m.chips)}칩을 ${fmt(m.n)}코인으로 바꿨습니다.`;
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
