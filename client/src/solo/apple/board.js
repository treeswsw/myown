// 사과 게임 판 화면 (docs/solo/PLAN.md 1-5, 6-3). 규칙은 shared/solo/apple.js 가 정하고, 여기는 그리기와 끌기 조작만.
// 조작은 api.input 으로만. 점수·시간 숫자·버튼은 틀이 그린다. 사용자 글자 없음(숫자만 textContent).
import './apple.css';
import apple, { COLS, ROWS, TARGET, pack, measure } from '../../../../shared/solo/apple.js';

const FALL_MS = 700;
const WARN_MS = 10000;

// api = { state(), input(v), sfx(name, n?), reduced, timeLeft?() → 남은 비율 0..1 (없으면 막대를 숨김) }
export function mountBoard(el, api) {
  const root = document.createElement('div');
  root.className = 'so-ap-root so-ap-nobar';
  const tray = document.createElement('div');
  tray.className = 'so-ap-tray';
  const grid = document.createElement('div');
  grid.className = 'so-ap-grid';
  const box = document.createElement('div');
  box.className = 'so-ap-box';
  const sumTag = document.createElement('span');
  sumTag.className = 'so-ap-sum';
  box.append(sumTag);
  const bar = document.createElement('div');
  bar.className = 'so-ap-bar';
  const fill = document.createElement('i');
  bar.append(fill);

  const cellEls = [];
  const numEls = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const c = document.createElement('div');
    c.className = 'so-ap-c';
    const b = document.createElement('b');
    c.append(b);
    grid.append(c);
    cellEls.push(c);
    numEls.push(b);
  }
  grid.append(box);
  tray.append(grid);
  root.append(tray, bar);
  el.append(root);

  let locked = false;
  let s = 40; // 칸 한 변(px)
  let pend = null; // 아직 반영 안 된 마지막 pointermove
  let raf = 0;
  let drag = null; // { id, x0, y0, x, y } 격자 안 px
  let selSet = []; // 지금 선택된 칸 번호
  let selRect = null; // { cx0, cy0, cx1, cy1 }
  let ten = false;
  const falling = new Set();
  const timers = new Set();
  let warned = false;
  let lowOn = false;
  let lastFrac = -1;
  let barHidden = true;

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  function paintCell(i) {
    const n = api.state().cells[i];
    const c = cellEls[i];
    if (falling.has(i)) return;
    numEls[i].textContent = n ? String(n) : '';
    c.classList.toggle('so-ap-e', !n);
    c.classList.remove('so-ap-fall');
  }
  function paintAll() { for (let i = 0; i < COLS * ROWS; i++) paintCell(i); }

  // ---- 크기: el 에 맞춰 비율을 지키며 최대(zoom 금지, 칸 크기 변수만 바꾼다) ----
  function fit() {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const k = Math.max(8, Math.floor(Math.min(W / (COLS + 1.22), H / (ROWS + 0.8)) * 10) / 10);
    s = k;
    root.style.setProperty('--so-ap-s', k + 'px');
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(fit); ro.observe(el); }
  else window.addEventListener('resize', fit);
  fit();

  // ---- 끌기 ----
  function gridPoint(e) {
    const r = grid.getBoundingClientRect();
    const k = r.width / COLS || s; // 화면에 보이는 칸 크기(변환이 있어도 맞게)
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
    return { x: x / k, y: y / k, k };
  }
  function clearSel() {
    for (const i of selSet) cellEls[i].classList.remove('so-ap-sel');
    selSet = []; selRect = null;
    if (ten) { root.classList.remove('so-ap-ten'); ten = false; }
    box.style.display = 'none';
  }
  function updateSel() {
    const x0 = Math.min(drag.x0, drag.x), x1 = Math.max(drag.x0, drag.x);
    const y0 = Math.min(drag.y0, drag.y), y1 = Math.max(drag.y0, drag.y);
    // 칸 가운데가 상자 안에 들어온 칸만 (칸 단위 좌표에서 가운데는 +0.5)
    const cx0 = Math.max(0, Math.ceil(x0 - 0.5)), cx1 = Math.min(COLS - 1, Math.floor(x1 - 0.5));
    const cy0 = Math.max(0, Math.ceil(y0 - 0.5)), cy1 = Math.min(ROWS - 1, Math.floor(y1 - 0.5));
    box.style.display = 'block';
    box.style.transform = `translate(${x0 * s}px, ${y0 * s}px)`;
    box.style.width = (x1 - x0) * s + 'px'; box.style.height = (y1 - y0) * s + 'px';
    const next = [];
    let sum = 0;
    selRect = null;
    if (cx0 <= cx1 && cy0 <= cy1) {
      selRect = { cx0, cy0, cx1, cy1 };
      const cells = api.state().cells;
      sum = measure(cells, cx0, cy0, cx1, cy1).sum;
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = y * COLS + x; if (cells[i]) next.push(i); }
    }
    const was = new Set(selSet);
    const now = new Set(next);
    for (const i of was) if (!now.has(i)) cellEls[i].classList.remove('so-ap-sel');
    for (const i of now) if (!was.has(i)) cellEls[i].classList.add('so-ap-sel');
    selSet = next;
    sumTag.textContent = next.length ? String(sum) : '';
    sumTag.style.display = next.length ? '' : 'none';
    const t = sum === TARGET;
    if (t !== ten) { ten = t; root.classList.toggle('so-ap-ten', t); }
  }
  function onDown(e) {
    if (locked || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = gridPoint(e);
    drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y };
    try { grid.setPointerCapture(e.pointerId); } catch { /* 못 잡아도 계속 */ }
    updateSel();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    // 움직임은 화면 갱신 한 번에 한 번만 반영한다(pointermove 는 프레임보다 자주 온다)
    pend = e;
    if (!raf) raf = requestAnimationFrame(flushMove);
  }
  function flushMove() {
    raf = 0;
    const e = pend; pend = null;
    if (!drag || !e) return;
    const p = gridPoint(e);
    drag.x = p.x; drag.y = p.y;
    updateSel();
  }
  function end(e, commit) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (e && pend && drag) flushMove(); // 마지막 움직임까지 반영한 뒤 확정
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    pend = null;
    const id = drag.id;
    const r = selRect;
    const ok = commit && r && ten;
    drag = null;
    try { grid.releasePointerCapture(id); } catch { /* 이미 풀림 */ }
    clearSel();
    if (ok) api.input(pack(r.cx0, r.cy0, r.cx1, r.cy1));
  }
  const onUp = (e) => end(e, true);
  const onCancel = (e) => end(e, false);
  grid.addEventListener('pointerdown', onDown);
  grid.addEventListener('pointermove', onMove);
  grid.addEventListener('pointerup', onUp);
  grid.addEventListener('pointercancel', onCancel);
  grid.addEventListener('lostpointercapture', onCancel);
  const noCtx = (e) => e.preventDefault();
  grid.addEventListener('contextmenu', noCtx);

  // ---- 연출 ----
  function apply(evs) {
    for (const ev of evs || []) {
      if (ev.k !== 'clear') continue;
      api.sfx('pop', ev.n);
      ev.gone.forEach((g, j) => {
        const c = cellEls[g.i];
        numEls[g.i].textContent = String(g.n); // 지워진 칸 숫자를 떨어지는 동안 보여 줌
        c.classList.remove('so-ap-e', 'so-ap-sel');
        if (api.reduced) {
          c.classList.add('so-ap-fall');
        } else {
          c.style.setProperty('--so-ap-d', (j % 5) * 25 + 'ms');
          c.style.setProperty('--so-ap-r', String((g.i % 7) - 3 || 5));
          c.classList.add('so-ap-fall');
        }
        falling.add(g.i);
        later(() => { falling.delete(g.i); c.style.removeProperty('--so-ap-d'); c.style.removeProperty('--so-ap-r'); paintCell(g.i); }, FALL_MS);
      });
      const plus = document.createElement('span');
      plus.className = 'so-ap-plus';
      plus.textContent = '+' + ev.n;
      plus.style.left = ((ev.x0 + ev.x1 + 1) / 2) * s + 'px';
      plus.style.top = ((ev.y0 + ev.y1 + 1) / 2) * s + 'px';
      grid.append(plus);
      later(() => plus.remove(), 850);
    }
  }

  function setBar(frac) {
    frac = Math.round(frac * 500) / 500; // 1/500 보다 작은 변화는 그리지 않는다
    if (frac === lastFrac) return;
    lastFrac = frac;
    fill.style.transform = `translateY(${(1 - Math.max(0, Math.min(1, frac))) * 100}%)`; // 레이아웃 없이 합성만
    const low = frac * apple.limitMs <= WARN_MS;
    if (low !== lowOn) { lowOn = low; bar.classList.toggle('so-ap-low', low); }
  }

  return {
    reset() {
      end(null, false);
      for (const t of timers) clearTimeout(t);
      timers.clear(); falling.clear();
      for (const p of grid.querySelectorAll('.so-ap-plus')) p.remove();
      for (const c of cellEls) { c.classList.remove('so-ap-fall', 'so-ap-sel'); c.style.removeProperty('--so-ap-d'); c.style.removeProperty('--so-ap-r'); }
      warned = false; lowOn = false; lastFrac = -1;
      bar.classList.remove('so-ap-low');
      paintAll();
      fit();
      setBar(1);
    },
    apply,
    frame() {
      if (typeof api.timeLeft !== 'function') return;
      const f = api.timeLeft();
      if (typeof f !== 'number' || Number.isNaN(f)) return;
      if (barHidden) { barHidden = false; root.classList.remove('so-ap-nobar'); }
      setBar(f);
      if (!warned && f > 0 && f * apple.limitMs <= WARN_MS) { warned = true; api.sfx('warn'); }
    },
    lock(on) {
      locked = !!on;
      root.classList.toggle('so-ap-lock', locked);
      if (locked) end(null, false);
    },
    unmount() {
      end(null, false);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
      root.remove();
    },
  };
}
