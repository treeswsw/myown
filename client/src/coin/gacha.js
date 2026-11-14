// 카드 뽑기 창 (SPEC 22-15, 모습은 22-20 상점 시안). DOM/CSS 만 쓴다(WebGL 없음, ?nogl=1 에서도 같음).
// 결과는 서버 메시지 {t:'coin', a:'draw', pulls, chips, pity, pool, free} 로만 정해진다. 화면은 뒤집는 연출만 한다.
import './gacha.css';
import { TIERS, COST, TEN, PITY, POOL_STEP } from '../../../shared/coin/gacha.js';

const DEAL_MS = 420;     // 카드가 깔리는 시간
const DEAL_GAP = 55;     // 카드 사이
const FLIP_GAP = 430;    // 10장: 한 장씩 뒤집는 간격
const LAST_HOLD = 800;   // 10장: 마지막(가장 높은) 카드 앞의 뜸
const ONE_AUTO = 1600;   // 1장: 안 누르면 스스로 뒤집힘
const WAIT_MAX = 8000;   // 서버가 안 답할 때 포기
const BACK_SVG = '<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4 4 11l6 7M4 11h14"/></svg>';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
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
function btn(cls, text) {
  const b = el('button', 'gc-btn ' + cls, text);
  b.type = 'button';
  return b;
}
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const two = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(x)}` : `${m}:${two(x)}`;
}
// 앞면(등급 이름 + 칩). mini = 첫 화면 진열용
function faceInto(box, tier, chips) {
  const t = TIERS[tier] || TIERS[0];
  box.textContent = '';
  box.append(
    el('b', 'gc-ft-n', t.name),
    el('i', 'gc-chip'),
    el('b', 'gc-ft-a', chips == null ? '금고 전부' : fmt(chips)),
    el('span', 'gc-ft-u', chips == null ? '가져가기' : '칩'),
  );
}

export function openGacha(ctx) {
  const { send, root } = ctx;
  const offs = [];
  let closed = false;
  let busy = false;
  let pity = null, pool = null; // 서버 뽑기 답이 준 값(다음 me 가 오면 지움)
  let lastDone = -1e9;
  let tracked = null;           // 연출 중 보이는 잔액 {coins, chips}
  let meSeen = false;           // 이번 뽑기 뒤에 me 가 왔는가
  let runId = 0;
  let pending = null;
  let waitTimer = null;
  let run = null;               // { n, cards:[{b, ft, flipped}], pulls, sum, count, base }
  let freeAt = performance.now(); // wallet.free 를 받은 때
  let freeAsked = false;
  const wakers = new Set();

  const ov = el('div', 'gc-ov');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', '카드 뽑기');
  const panel = el('div', 'gc-panel');
  ov.append(el('div', 'gc-bg'), panel);

  // ---------- 맨 위 줄 ----------
  const head = el('div', 'gc-hd');
  const bBack = el('button', 'gc-back');
  bBack.type = 'button';
  bBack.setAttribute('aria-label', '뒤로');
  bBack.innerHTML = BACK_SVG; // 고정 글자
  const coinsB = el('b');
  const coinsP = el('span', 'gc-pill gc-coins');
  coinsP.append(el('i', 'gc-coin'), el('span', null, '코인'), coinsB);
  const chipsB = el('b');
  const chipsP = el('span', 'gc-pill gc-chips');
  chipsP.append(el('i', 'gc-chip'), el('span', null, '칩'), chipsB);
  head.append(bBack, el('h2', 'gc-title', '카드 뽑기'), el('span', 'gc-grow'), coinsP, chipsP);

  // ---------- 첫 화면 ----------
  const home = el('div', 'gc-home');
  const show = el('section', 'gc-pn gc-pn-gold');
  {
    const i = el('div', 'gc-pi');
    const tt = el('div', 'gc-show-hd');
    tt.append(el('h3', 'gc-h', '나올 수 있는 카드'), el('span', 'gc-sub', `꽝 없음 · ${TEN}장 뽑으면 금 이상 1장 보장`));
    const tiers = el('div', 'gc-tiers');
    for (const t of TIERS) {
      const c = el('div', 'gc-face gc-mini gc-t' + t.tier);
      faceInto(c, t.tier, t.tier === 5 ? null : t.chips);
      tiers.appendChild(c);
    }
    i.append(tt, tiers);
    show.appendChild(i);
  }
  const side = el('section', 'gc-pn gc-pn-cyan');
  const poolB = el('b', 'gc-vault-n');
  const pityB = el('b');
  const pityBar = el('i');
  {
    const i = el('div', 'gc-pi gc-side');
    const v = el('div', 'gc-vault');
    const amt = el('div', 'gc-vault-a');
    amt.append(poolB, el('span', null, '칩'));
    v.append(el('span', 'gc-tag', '금고'), amt, el('span', 'gc-sub', `누가 뒤집든 1장마다 +${POOL_STEP}칩`));
    const p = el('div', 'gc-pity');
    const line = el('span', 'gc-pity-t');
    line.append(el('em', null, '대박'), document.createTextNode(' 확정까지 '), pityB, document.createTextNode('장'));
    const bar = el('div', 'gc-bar');
    bar.appendChild(pityBar);
    p.append(line, bar);
    i.append(v, p);
    side.appendChild(i);
  }
  home.append(show, side);

  // ---------- 뽑는 화면 ----------
  const play = el('div', 'gc-play');
  const what = el('span', 'gc-what');
  const sum = el('b', 'gc-sum');
  const top = el('div', 'gc-top');
  const sumBox = el('span', 'gc-sumbox');
  sumBox.append(el('span', null, '지금까지'), sum, el('span', null, '칩'));
  top.append(what, el('span', 'gc-grow'), sumBox);
  const row = el('div', 'gc-row');
  const hint = el('div', 'gc-hint');
  play.append(top, row, hint);

  // ---------- 아래 줄 ----------
  const status = el('div', 'gc-status');
  status.setAttribute('role', 'status');
  const foot = el('div', 'gc-ft-bar');
  const bHist = btn('gc-btn-sub', '내 기록');
  const bShop = btn('gc-btn-sub', '상점으로');
  const bFree = btn('gc-btn-free');
  const freeT = el('span', null, '무료 1장');
  const freeS = el('small');
  bFree.append(freeT, freeS);
  const bOne = btn('gc-btn-sub gc-btn-one', `1장 · ${COST}코인`);
  const bTen = btn('gc-btn-gold', `${TEN}장 · ${COST * TEN}코인`);
  const bAll = btn('gc-btn-sub gc-btn-all', '한 번에 다 뒤집기');
  const bAgain = btn('gc-btn-sub', `한 번 더 · ${COST}코인`);
  const bAgain10 = btn('gc-btn-gold', `${TEN}장 한 번 더 · ${COST * TEN}코인`);
  const bClose = btn('gc-btn-sub', '닫기');
  foot.append(bHist, bShop, el('span', 'gc-grow'), bFree, bOne, bTen, bAll, bAgain, bAgain10, bClose);

  panel.append(head, home, play, status, foot);
  root.appendChild(ov);

  // ---------- 상태 표시 ----------
  const wallet = () => { try { return ctx.wallet() || {}; } catch { return {}; } };
  const realCoins = () => Number(wallet().coins) || 0;
  function realChips() {
    let u = null;
    try { u = typeof ctx.me === 'function' ? ctx.me() : null; } catch { u = null; }
    const c = u ? (u.chips ?? u.bank) : null;
    return typeof c === 'number' ? c : null;
  }
  const coins = () => (tracked ? tracked.coins : realCoins());
  const chips = () => (tracked && tracked.chips != null ? tracked.chips : realChips());
  function curPity() {
    if (pity != null) return pity;
    const p = Number(wallet().pity);
    return Number.isFinite(p) ? p : 0;
  }
  function freeState() {
    const f = wallet().free;
    const n = (f && Number(f.n)) || 0;
    const next = f && typeof f.next === 'number' ? Math.max(0, f.next - (performance.now() - freeAt)) : null;
    return { n, next };
  }
  function dim(b, low) {
    b.classList.toggle('gc-dim', low);
    b.setAttribute('aria-disabled', low ? 'true' : 'false');
  }
  function refresh() {
    const c = coins();
    coinsB.textContent = fmt(c);
    const ch = chips();
    chipsP.hidden = ch == null;
    if (ch != null) chipsB.textContent = fmt(ch);
    const pl = pool != null ? pool : Number(wallet().pool);
    poolB.textContent = Number.isFinite(pl) ? fmt(pl) : '-';
    const left = Math.min(PITY, Math.max(1, PITY - curPity()));
    pityB.textContent = String(left);
    pityBar.style.width = (100 * (PITY - left) / PITY).toFixed(1) + '%';
    const f = freeState();
    freeT.textContent = `무료 1장 (${f.n}장)`;
    freeS.textContent = f.next == null ? '가득 참' : f.next > 0 ? `충전까지 ${clock(f.next)}` : '곧 충전';
    dim(bFree, f.n < 1);
    if (f.next != null && f.next <= 0 && !freeAsked && !busy) { // 충전 시각이 됐다: 서버에 me 를 다시 달라고 한다
      freeAsked = true;
      try { send({ t: 'coin', a: 'stock' }); } catch { /* 무시 */ }
    }
    dim(bOne, c < COST); dim(bAgain, c < COST);
    dim(bTen, c < COST * TEN); dim(bAgain10, c < COST * TEN);
  }
  function lock(on) { for (const b of [bFree, bOne, bTen, bAgain, bAgain10]) b.disabled = on; }
  function setMode(m) { // idle | busy | done
    panel.dataset.mode = m;
    const idle = m === 'idle';
    home.hidden = !idle;
    play.hidden = idle;
    bHist.hidden = bShop.hidden = bFree.hidden = bOne.hidden = bTen.hidden = !idle;
    bAll.hidden = m !== 'busy';
    bAgain.hidden = bAgain10.hidden = bClose.hidden = m !== 'done';
    bBack.setAttribute('aria-label', idle ? '닫기' : '처음 화면으로');
  }
  function say(text) { status.textContent = text || ''; status.hidden = !text; }

  // ---------- 시간 도우미 ----------
  function sleep(ms) {
    return new Promise((res) => {
      if (closed) return res();
      const t = setTimeout(() => { wakers.delete(w); res(); }, ms);
      const w = () => { clearTimeout(t); wakers.delete(w); res(); };
      wakers.add(w);
    });
  }
  function wakeAll() { for (const w of [...wakers]) w(); }
  const dead = (id) => closed || id !== runId;

  // ---------- 효과 ----------
  function flash(cls) {
    const f = el('div', 'gc-flash ' + cls);
    ov.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }
  function shake(ms) {
    panel.classList.add('gc-shake');
    setTimeout(() => panel.classList.remove('gc-shake'), ms);
  }
  function rain(ms, count) {
    const box = el('div', 'gc-rain');
    ov.appendChild(box);
    for (let i = 0; i < count; i++) {
      const c = el('i', 'gc-chip gc-drop');
      c.style.left = (rnd() * 100).toFixed(1) + '%';
      c.style.animationDelay = (rnd() * ms * 0.6 / 1000).toFixed(2) + 's';
      c.style.animationDuration = (0.9 + rnd() * 0.9).toFixed(2) + 's';
      c.style.setProperty('--sz', (14 + rnd() * 16).toFixed(0) + 'px');
      box.appendChild(c);
    }
    setTimeout(() => box.remove(), ms + 2000);
  }
  function bigText(text, cls) {
    const b = el('div', 'gc-big ' + cls, text);
    ov.appendChild(b);
    setTimeout(() => b.remove(), 2600);
  }
  function clearFx() {
    for (const n of ov.querySelectorAll('.gc-flash,.gc-rain,.gc-big')) n.remove();
    panel.classList.remove('gc-shake');
  }
  function celebrate(tier) {
    if (reduced()) return;
    if (tier === 2) flash('gc-fl-gold');
    else if (tier === 3) { flash('gc-fl-red gc-fl-full'); shake(700); }
    else if (tier === 4) { flash('gc-fl-cyan gc-fl-full'); rain(2400, 48); bigText('잭팟!', 'gc-big-cyan'); }
    else if (tier >= 5) { flash('gc-fl-rb gc-fl-full'); shake(1200); rain(4000, 90); bigText('갱식 잭팟!!!', 'gc-big-rb'); }
  }

  // ---------- 카드 ----------
  function buildCards(n) {
    row.textContent = '';
    row.dataset.n = String(n);
    row.style.setProperty('--n', String(n));
    const cards = [];
    for (let i = 0; i < n; i++) {
      const b = el('button', 'gc-card gc-deal');
      b.type = 'button';
      b.setAttribute('aria-label', `카드 ${i + 1} 뒤집기`);
      b.style.setProperty('--d', (i * DEAL_GAP) + 'ms');
      const inn = el('span', 'gc-in');
      const ft = el('span', 'gc-ft gc-face');
      inn.append(el('span', 'gc-bk'), ft);
      b.appendChild(inn);
      const card = { b, ft, flipped: false };
      b.addEventListener('click', () => { if (run && run.pulls && run.cards[i] === card) flip(i, false); });
      row.appendChild(b);
      cards.push(card);
    }
    return cards;
  }
  function showProgress() {
    if (!run) return;
    const r = run;
    sum.textContent = '+' + fmt(r.sum);
    what.textContent = r.n > 1 ? `${r.n}장 뽑기 · ${r.count}장 뒤집음` : (r.free ? '무료 1장' : '1장 뽑기');
    if (tracked && r.base != null) tracked.chips = r.base + r.sum;
    refresh();
  }
  function flip(i, quiet) {
    const r = run;
    if (!r || !r.pulls) return;
    const card = r.cards[i], pull = r.pulls[i];
    if (!card || !pull || card.flipped) return;
    card.flipped = true;
    const tier = Math.min(5, Math.max(0, pull.tier | 0));
    faceInto(card.ft, tier, pull.chips);
    card.ft.classList.add('gc-t' + tier);
    card.b.classList.remove('gc-next', 'gc-ready');
    card.b.classList.add('gc-open');
    card.b.setAttribute('aria-label', `${TIERS[tier].name} ${fmt(pull.chips)}칩`);
    r.sum += Number(pull.chips) || 0;
    r.count++;
    showProgress();
    if (!quiet) celebrate(tier);
    if (r.count >= r.cards.length) finish();
  }
  function flipAll() {
    const r = run;
    if (!r || !r.pulls) return;
    let best = -1;
    r.cards.forEach((c, i) => { if (!c.flipped && r.pulls[i]) best = Math.max(best, r.pulls[i].tier); });
    r.cards.forEach((c, i) => { if (!c.flipped) flip(i, true); });
    if (best >= 2) celebrate(best);
  }

  // ---------- 뽑기 한 번 ----------
  function clearWait() { clearTimeout(waitTimer); waitTimer = null; }

  function start(n, free) {
    if (busy || closed) return;
    if (performance.now() - lastDone < 350) return; // 서버가 0.3초 안 연타를 무시한다
    if (free ? freeState().n < 1 : realCoins() < COST * n) {
      say(free ? '무료 뽑기가 없습니다.' : '코인이 모자랍니다.');
      refresh();
      return;
    }
    busy = true;
    lock(true);
    clearFx();
    say('');
    const id = ++runId;
    const base = realChips();
    tracked = { coins: free ? realCoins() : realCoins() - COST * n, chips: base };
    meSeen = false;
    run = { n, free: !!free, cards: buildCards(n), pulls: null, sum: 0, count: 0, base };
    hint.textContent = '카드를 깔고 있습니다…';
    setMode('busy');
    bAll.disabled = true;
    showProgress();

    const t0 = performance.now();
    const answer = new Promise((resolve) => { pending = { resolve }; });
    waitTimer = setTimeout(() => {
      if (pending) { const p = pending; pending = null; p.resolve({ err: '응답이 없습니다. 다시 시도하세요.' }); }
    }, WAIT_MAX);
    try { send(free ? { t: 'coin', a: 'draw', n: 1, free: true } : { t: 'coin', a: 'draw', n }); } catch { /* 시간 초과로 처리 */ }

    answer.then(async (res) => {
      clearWait();
      if (dead(id)) return;
      if (res.err) { abort(res.err); return; }
      const msg = res.msg;
      const pulls = Array.isArray(msg.pulls) ? msg.pulls.slice(0, n) : [];
      if (pulls.length < n) { abort('결과를 받지 못했습니다.'); return; }
      if (typeof msg.pity === 'number') pity = msg.pity;
      if (typeof msg.pool === 'number') pool = msg.pool;
      const r = run;
      r.pulls = pulls;
      // 뒤집기 전: 테두리 빛으로 등급 암시
      r.cards.forEach((c, i) => c.b.classList.add('gc-g' + Math.min(5, Math.max(0, pulls[i].tier | 0))));
      bAll.disabled = false;
      hint.textContent = n > 1 ? '테두리 빛이 등급을 살짝 알려 줍니다. 눌러서 먼저 뒤집어도 됩니다.' : '카드를 눌러 뒤집으세요.';
      if (reduced()) { flipAll(); return; }
      await sleep(Math.max(0, DEAL_MS + n * DEAL_GAP - (performance.now() - t0)));
      if (dead(id) || run !== r) return;
      if (n === 1) {
        r.cards[0].b.classList.add('gc-ready');
        await sleep(ONE_AUTO);
        if (!dead(id) && run === r) flip(0, false);
        return;
      }
      // 10장: 낮은 등급부터, 가장 높은 카드가 맨 마지막
      const order = pulls.map((p, i) => i).sort((a, b) => pulls[a].tier - pulls[b].tier || a - b);
      for (let k = 0; k < order.length; k++) {
        if (dead(id) || run !== r || !busy) return;
        const i = order[k];
        if (r.cards[i].flipped) continue;
        r.cards[i].b.classList.add('gc-next');
        if (k === order.length - 1 && pulls[i].tier >= 2) await sleep(LAST_HOLD);
        if (dead(id) || run !== r || !busy) return;
        flip(i, false);
        await sleep(FLIP_GAP);
      }
    });
  }

  function finish() {
    if (!busy) return;
    busy = false;
    wakeAll();
    lastDone = performance.now();
    lock(false);
    if (meSeen) tracked = null; // me 가 이미 왔으면 진짜 잔액으로
    const best = run && run.pulls ? run.pulls.reduce((m, p) => Math.max(m, p.tier), 0) : 0;
    hint.textContent = `가장 높은 카드: ${TIERS[Math.min(5, best)].name}`;
    setMode('done');
    refresh();
  }

  function abort(text) {
    clearWait();
    pending = null;
    runId++;
    busy = false;
    wakeAll();
    lastDone = performance.now();
    lock(false);
    tracked = null;
    run = null;
    clearFx();
    row.textContent = '';
    setMode('idle');
    say(text);
    refresh();
  }
  function toHome() {
    if (busy) return;
    run = null;
    row.textContent = '';
    clearFx();
    say('');
    setMode('idle');
    refresh();
  }

  // ---------- 내 기록 ----------
  let sheet = null;
  function closeHist() { if (sheet) { sheet.remove(); sheet = null; } }
  function openHist() {
    closeHist();
    sheet = el('div', 'gc-sheet');
    const box = el('div', 'gc-pn gc-pn-cyan gc-hist');
    const i = el('div', 'gc-pi');
    const hd = el('div', 'gc-hist-hd');
    const x = btn('gc-btn-sub gc-hist-x', '닫기');
    x.onclick = closeHist;
    hd.append(el('h3', 'gc-h', '내 기록'), el('span', 'gc-sub', '최근 50번'), el('span', 'gc-grow'), x);
    const list = el('div', 'gc-hist-list');
    list.appendChild(el('div', 'gc-hist-empty', '불러오는 중…'));
    i.append(hd, list);
    box.appendChild(i);
    sheet.appendChild(box);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeHist(); });
    ov.appendChild(sheet);
    try { send({ t: 'coin', a: 'hist' }); } catch { /* 무시 */ }
  }
  function fillHist(rows) {
    if (!sheet) return;
    const list = sheet.querySelector('.gc-hist-list');
    list.textContent = '';
    if (!rows.length) { list.appendChild(el('div', 'gc-hist-empty', '아직 뽑은 기록이 없습니다.')); return; }
    const two = (v) => String(v).padStart(2, '0');
    for (const r of rows) {
      const d = new Date(Number(r.at) || 0);
      const tier = Math.min(5, Math.max(0, Number(r.best) | 0));
      const li = el('div', 'gc-hist-row');
      li.append(
        el('span', 'gc-hist-at', `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`),
        el('span', 'gc-hist-n', `${Number(r.n) || 1}장`),
        el('span', 'gc-hist-best gc-t' + tier, TIERS[tier].name),
        el('b', 'gc-hist-c', `+${fmt(r.chips)}칩`),
      );
      list.appendChild(li);
    }
  }

  // ---------- 서버 메시지 ----------
  offs.push(ctx.on('coin', (m) => {
    if (!m) return;
    if (m.a === 'hist') { fillHist(Array.isArray(m.list) ? m.list : []); return; }
    if (m.a !== 'draw') return;
    if (pending) { const p = pending; pending = null; p.resolve({ msg: m }); }
    else {
      if (typeof m.pity === 'number') pity = m.pity;
      if (typeof m.pool === 'number') pool = m.pool;
      refresh();
    }
  }));
  offs.push(ctx.on('me', () => {
    freeAt = performance.now();
    freeAsked = false;
    meSeen = true;
    if (!busy) { tracked = null; pity = null; pool = null; }
    refresh();
  }));
  offs.push(ctx.on('error', (m) => {
    if (!m || typeof m.code !== 'string' || !m.code.startsWith('coin_')) return;
    const text = m.msg || (m.code === 'coin_low' ? '코인이 모자랍니다.' : m.code === 'coin_room' ? '방에서 나온 뒤에 할 수 있습니다.' : '요청을 처리하지 못했습니다.');
    if (pending) { const p = pending; pending = null; p.resolve({ err: text }); }
    else if (sheet) { const l = sheet.querySelector('.gc-hist-list'); l.textContent = ''; l.appendChild(el('div', 'gc-hist-empty', text)); }
    else { say(text); if (!busy) { tracked = null; refresh(); } }
  }));

  // ---------- 버튼 ----------
  const poll = setInterval(() => { if (!closed) refresh(); }, 500);
  function close() {
    if (closed) return;
    closed = true;
    wakeAll();
    clearWait();
    clearInterval(poll);
    document.removeEventListener('keydown', onKey);
    for (const o of offs) { try { if (o) o(); } catch { /* 무시 */ } }
    ov.remove();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (sheet) closeHist();
    else if (!busy) close();
  }
  document.addEventListener('keydown', onKey);

  bFree.onclick = () => start(1, true);
  bOne.onclick = () => start(1, false);
  bTen.onclick = () => start(TEN, false);
  bAgain.onclick = () => start(1, false);
  bAgain10.onclick = () => start(TEN, false);
  bAll.onclick = () => { flipAll(); };
  bHist.onclick = openHist;
  bShop.onclick = () => { close(); try { if (typeof ctx.open === 'function') ctx.open('shop'); } catch { /* 무시 */ } };
  bClose.onclick = close;
  bBack.onclick = () => {
    if (busy) { if (run && run.pulls) flipAll(); return; }
    if (panel.dataset.mode === 'done') toHome(); else close();
  };

  say('');
  setMode('idle');
  refresh();
  return close;
}
