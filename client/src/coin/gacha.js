// 뽑기 창 (SPEC 22-4, 22-11, 22-14). DOM/CSS 만 쓴다(WebGL 없음, ?nogl=1 에서도 같음).
import './gacha.css';
import { TIERS, COST, TEN, PITY } from '../../../shared/coin/gacha.js';

const SHAKE_MIN = 600;   // 서버가 빨리 답해도 최소 흔드는 시간
const STEP_MS = 350;     // 등급 한 단계 올라가는 시간
const HITCH_MS = 90;     // 올라갈 때마다 멈칫
const COUNT_MS = 600;    // 칩 숫자 올라가는 시간
const TEN_GAP = 250;     // 10연 캡슐 사이
const WAIT_MAX = 8000;   // 서버가 안 답할 때 포기

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

export function openGacha(ctx) {
  const { send, root } = ctx;
  const offs = [];
  let closed = false;
  let busy = false;
  let pity = null;       // 서버가 준 값(없으면 wallet 에서)
  let lastDone = -1e9;   // 마지막 응답 시각
  let tracked = null;    // 연출 중 보이는 잔액
  let runId = 0;
  let skipFlag = false;
  let pending = null;    // { resolve }
  let waitTimer = null;
  const wakers = new Set();

  const ov = el('div', 'gc-ov');
  ov.setAttribute('role', 'dialog');
  const panel = el('div', 'gc-panel');
  ov.appendChild(panel);

  const head = el('div', 'gc-head');
  const bal = el('div', 'gc-bal');
  const pityEl = el('div', 'gc-pity');
  head.append(bal, pityEl);

  const stage = el('div', 'gc-stage');
  const status = el('div', 'gc-status');
  const total = el('div', 'gc-total');

  const acts = el('div', 'gc-acts');
  const bOne = el('button', 'gc-btn gc-btn-pri', `1회 · ${COST}코인`);
  const bTen = el('button', 'gc-btn gc-btn-pri', `${TEN}연 · ${COST * TEN}코인`);
  const bFree = el('button', 'gc-btn gc-btn-pri', '무료 1장');
  const bSkip = el('button', 'gc-btn gc-btn-skip', '건너뛰기');
  const bAgain = el('button', 'gc-btn gc-btn-pri', '한 번 더');
  const bAgain10 = el('button', 'gc-btn gc-btn-pri', `${TEN}연`);
  const bOdds = el('button', 'gc-btn gc-btn-sub', '나올 수 있는 카드');
  const bClose = el('button', 'gc-btn gc-btn-sub', '닫기');
  for (const b of [bFree, bOne, bTen, bSkip, bAgain, bAgain10, bOdds, bClose]) b.type = 'button';
  acts.append(bFree, bOne, bTen, bSkip, bAgain, bAgain10, bOdds, bClose);

  const odds = el('div', 'gc-odds');
  odds.hidden = true;
  {
    const tb = el('table', 'gc-table');
    const hd = el('tr');
    for (const h of ['등급', '칩']) hd.appendChild(el('th', null, h));
    tb.appendChild(hd);
    for (const t of TIERS) {
      const tr = el('tr', 'gc-t' + t.tier);
      tr.append(el('td', 'gc-tn', t.name), el('td', null, t.tier === 5 ? '금고 전부' : fmt(t.chips)));
      tb.appendChild(tr);
    }
    odds.appendChild(tb);
    odds.appendChild(el('div', 'gc-note', `대박 이상이 ${PITY - 1}장 안 나오면 ${PITY}장째는 대박 확정. ${TEN}장은 금 이상이 없으면 마지막이 금으로 바뀝니다.`));
  }

  panel.append(head, stage, status, total, acts, odds);
  root.appendChild(ov);

  // ---------- 상태 표시 ----------
  const wallet = () => { try { return ctx.wallet() || {}; } catch { return {}; } };
  const coins = () => (tracked != null ? tracked : Number(wallet().coins) || 0);
  function curPity() {
    if (pity != null) return pity;
    const p = Number(wallet().pity);
    return Number.isFinite(p) ? p : 0;
  }
  function freeN() { const f = wallet().free; return (f && Number(f.n)) || 0; }
  function refresh() {
    const fn = freeN();
    bFree.textContent = `무료 1장 (${fn}장 남음)`;
    if (panel.dataset.mode !== 'busy') bFree.hidden = fn < 1;
    bal.textContent = `코인 ${fmt(coins())}`;
    pityEl.textContent = `대박 확정까지 ${Math.max(1, PITY - curPity())}장`;
    const c = coins();
    for (const [b, low] of [[bOne, c < COST], [bTen, c < COST * TEN], [bAgain, c < COST], [bAgain10, c < COST * TEN]]) {
      b.classList.toggle('gc-dim', low);
      b.setAttribute('aria-disabled', low ? 'true' : 'false');
    }
  }
  function lock(on) { for (const b of [bFree, bOne, bTen, bAgain, bAgain10]) b.disabled = on; }
  function setMode(m) { // idle | busy | done
    panel.dataset.mode = m;
    bOne.hidden = bTen.hidden = m !== 'idle';
    bFree.hidden = m === 'busy' || freeN() < 1;
    bSkip.hidden = m !== 'busy';
    bAgain.hidden = bAgain10.hidden = m !== 'done';
    bOdds.hidden = m === 'busy';
    if (m === 'busy') odds.hidden = true;
  }

  // ---------- 시간 도우미 ----------
  function sleep(ms) {
    return new Promise((res) => {
      if (skipFlag || closed) return res();
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
    setTimeout(() => f.remove(), 1400);
  }
  function shake(ms) {
    panel.classList.add('gc-shake');
    setTimeout(() => panel.classList.remove('gc-shake'), ms);
  }
  function rain(ms, count, rainbow) {
    const box = el('div', 'gc-rain');
    ov.appendChild(box);
    for (let i = 0; i < count; i++) {
      const c = el('i', 'gc-coin' + (rainbow ? ' gc-coin-rb' : ''));
      c.style.left = (rnd() * 100).toFixed(1) + '%';
      c.style.animationDelay = (rnd() * ms * 0.6 / 1000).toFixed(2) + 's';
      c.style.animationDuration = (0.9 + rnd() * 0.9).toFixed(2) + 's';
      c.style.setProperty('--sz', (14 + rnd() * 18).toFixed(0) + 'px');
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

  // ---------- 캡슐 ----------
  function makeCap(small) {
    const cap = el('div', 'gc-cap gc-t0' + (small ? ' gc-small' : ''));
    const val = el('div', 'gc-cap-val');
    cap.append(el('div', 'gc-cap-top'), el('div', 'gc-cap-bot'), el('div', 'gc-cap-gem'), val);
    return { cap, val };
  }
  const setTier = (c, t) => {
    c.cap.className = c.cap.className.replace(/\bgc-t\d\b/g, '').trim() + ' gc-t' + Math.min(t, 4);
  };
  function openCap(c, pull) {
    setTier(c, pull.tier);
    c.cap.classList.remove('gc-wobble', 'gc-flick', 'gc-pulse');
    c.cap.classList.add('gc-open');
    c.val.textContent = fmt(pull.chips);
  }
  async function countUp(c, to, ms, id) {
    const t0 = performance.now();
    c.val.textContent = '0';
    while (!skipFlag && !dead(id)) {
      const k = Math.min(1, (performance.now() - t0) / ms);
      c.val.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) break;
      await sleep(40);
    }
    c.val.textContent = fmt(to);
  }
  function celebrate(tier) {
    if (tier === 2) { flash('gc-fl-gold'); shake(700); }
    else if (tier === 3) { flash('gc-fl-gold gc-fl-full'); shake(1000); rain(2000, 46, false); bigText(TIERS[tier].name + '!', 'gc-big-gold'); }
    else if (tier >= 4) { flash('gc-fl-rb gc-fl-full'); shake(1600); rain(4000, 90, true); bigText(TIERS[tier].name + '!!!', 'gc-big-rb'); }
  }
  // 한 캡슐 풀 연출: 등급이 한 단계씩 올라가며 멈칫 → 열림 → 숫자
  async function fullReveal(c, pull, id) {
    const near = pull.tier === 0 && rnd() < 1 / 3; // 아깝다 연출(꾸밈)
    const peak = near ? 1 : pull.tier;
    for (let t = 1; t <= peak; t++) {
      await sleep(STEP_MS - HITCH_MS);
      if (dead(id) || skipFlag) return;
      setTier(c, t);
      c.cap.classList.add('gc-pulse');
      await sleep(HITCH_MS);
      c.cap.classList.remove('gc-pulse');
      if (dead(id) || skipFlag) return;
    }
    if (near) {
      c.cap.classList.add('gc-flick');
      await sleep(450);
      if (dead(id) || skipFlag) return;
      c.cap.classList.remove('gc-flick');
      setTier(c, 0);
      await sleep(150);
      if (dead(id) || skipFlag) return;
    }
    openCap(c, pull);
    celebrate(pull.tier);
    await countUp(c, pull.chips, COUNT_MS, id);
  }

  // ---------- 뽑기 한 번 ----------
  function clearWait() { clearTimeout(waitTimer); waitTimer = null; }

  function start(n, free) {
    if (busy || closed) return;
    if (performance.now() - lastDone < 350) return; // 서버가 0.3초 안 연타를 무시한다
    if (!free && coins() < COST * n) { status.textContent = '코인이 모자랍니다.'; refresh(); return; }
    busy = true;
    lock(true);
    skipFlag = false;
    clearFx();
    const id = ++runId;
    status.textContent = '';
    total.textContent = '';
    total.className = 'gc-total';
    stage.textContent = '';
    stage.dataset.n = String(n);
    setMode('busy');
    tracked = free ? coins() : coins() - COST * n;
    refresh();

    const caps = [];
    for (let i = 0; i < n; i++) {
      const c = makeCap(n > 1);
      c.cap.classList.add('gc-wobble');
      stage.appendChild(c.cap);
      caps.push(c);
    }
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
      const pulls = Array.isArray(msg.pulls) ? msg.pulls : [];
      if (typeof msg.pity === 'number') pity = msg.pity;
      if (reduced()) skipFlag = true;
      else await sleep(Math.max(0, SHAKE_MIN - (performance.now() - t0)));
      if (dead(id)) return;
      await play(caps, pulls, id);
      finish(caps, pulls, msg, id);
    });
  }

  async function play(caps, pulls, id) {
    if (!pulls.length) return;
    if (caps.length === 1) { await fullReveal(caps[0], pulls[0], id); return; }
    // 10연: 낮은 등급부터, 가장 높은 등급이 맨 마지막
    const order = pulls.map((p, i) => i).sort((a, b) => pulls[a].tier - pulls[b].tier || a - b);
    for (let k = 0; k < order.length; k++) {
      if (dead(id) || skipFlag) return;
      const i = order[k];
      const c = caps[i];
      c.cap.classList.remove('gc-wobble');
      if (k === order.length - 1 && pulls[i].tier >= 1) {
        c.cap.classList.add('gc-last');
        await fullReveal(c, pulls[i], id);
      } else {
        openCap(c, pulls[i]);
        if (pulls[i].tier >= 2) celebrate(pulls[i].tier);
        countUp(c, pulls[i].chips, 300, id);
        await sleep(TEN_GAP);
      }
    }
  }

  function finish(caps, pulls, msg, id) {
    if (dead(id)) return;
    skipFlag = true; wakeAll();
    caps.forEach((c, i) => { if (pulls[i]) openCap(c, pulls[i]); });
    const sum = typeof msg.chips === 'number' ? msg.chips : pulls.reduce((a, p) => a + (p.chips || 0), 0);
    total.textContent = `합계 ${fmt(sum)}칩`;
    total.className = 'gc-total gc-t' + pulls.reduce((m, p) => Math.max(m, p.tier), 0);
    busy = false;
    lastDone = performance.now();
    lock(false);
    tracked = null;
    setMode('done');
    refresh();
  }

  function abort(text) {
    clearWait();
    pending = null;
    runId++;
    busy = false;
    lastDone = performance.now();
    lock(false);
    tracked = null;
    skipFlag = false;
    clearFx();
    stage.textContent = '';
    stage.dataset.n = '0';
    total.textContent = '';
    status.textContent = text;
    setMode('idle');
    refresh();
  }

  // ---------- 서버 메시지 ----------
  offs.push(ctx.on('coin', (m) => {
    if (!m || m.a !== 'draw') return;
    if (pending) { const p = pending; pending = null; p.resolve({ msg: m }); }
    else if (typeof m.pity === 'number') { pity = m.pity; refresh(); }
  }));
  offs.push(ctx.on('error', (m) => {
    if (!m || typeof m.code !== 'string' || !m.code.startsWith('coin_')) return;
    const text = m.msg || (m.code === 'coin_low' ? '코인이 모자랍니다.' : m.code === 'coin_room' ? '방에서 나온 뒤에 할 수 있습니다.' : '요청을 처리하지 못했습니다.');
    if (pending) { const p = pending; pending = null; p.resolve({ err: text }); }
    else { status.textContent = text; if (!busy) { tracked = null; refresh(); } }
  }));

  // ---------- 버튼 ----------
  const poll = setInterval(() => { if (!busy && !closed) refresh(); }, 500);
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
  function onKey(e) { if (e.key === 'Escape' && !busy) close(); }
  document.addEventListener('keydown', onKey);

  bFree.onclick = () => start(1, true);
  bOne.onclick = () => start(1);
  bTen.onclick = () => start(TEN);
  bAgain.onclick = () => start(1);
  bAgain10.onclick = () => start(TEN);
  bSkip.onclick = () => { skipFlag = true; wakeAll(); };
  bOdds.onclick = () => { odds.hidden = !odds.hidden; };
  bClose.onclick = () => { if (busy) { skipFlag = true; wakeAll(); } close(); };

  setMode('idle');
  refresh();
  return close;
}
