// 2048 판 화면 (docs/solo/PLAN.md 1-5, 6-2). 엔진 사건(state.ev)을 받아 타일을 미끄러뜨리고 합치고 새로 띄운다.
// 점수·시간·버튼은 틀이 그린다. 조작은 api.input(0 위 / 1 오른쪽 / 2 아래 / 3 왼쪽) 으로만. CSS 는 전부 .so-g2-
import './g2048.css';

const SWIPE = 24;       // 이 만큼(px) 넘게 밀면 한 번 움직임
const REPEAT_MS = 45;   // 키를 누르고 있을 때 최소 간격
const MOVE_MS = 120;    // CSS 의 미끄러짐 길이와 같게
const KEYS = {
  ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
  w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3,
};

const level = (v) => { let n = 0; while (v > 1) { v = Math.floor(v / 2); n++; } return n; };

export function mountBoard(el, api) {
  const wrap = document.createElement('div');
  wrap.className = 'so-g2-wrap' + (api.reduced ? ' so-g2-rm' : '');
  const tray = document.createElement('div');
  tray.className = 'so-g2';
  const wells = document.createElement('div');
  wells.className = 'so-g2-wells';
  for (let i = 0; i < 16; i++) wells.appendChild(document.createElement('i'));
  const layer = document.createElement('div');
  layer.className = 'so-g2-tiles';
  const toast = document.createElement('div');
  toast.className = 'so-g2-toast';
  tray.append(wells, layer, toast);
  wrap.appendChild(tray);
  el.appendChild(wrap);

  const tiles = new Map(); // id -> 타일 요소
  const timers = new Set();
  let locked = false, lastKey = 0, toastT = 0;

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };
  const place = (node, at) => {
    node.style.setProperty('--x', at % 4);
    node.style.setProperty('--y', at >> 2);
  };
  const vcls = (v) => 'so-g2-v' + (v <= 2048 ? v : 'x');
  const dcls = (v) => 'so-g2-d' + Math.min(String(v).length, 5);
  function make(id, v, at, anim) {
    const node = document.createElement('div');
    node.className = 'so-g2-tile';
    place(node, at);
    const t = document.createElement('div');
    t.className = `so-g2-t ${vcls(v)} ${dcls(v)}` + (anim ? ' ' + anim : '');
    t.textContent = String(v);
    node.appendChild(t);
    layer.appendChild(node);
    tiles.set(id, node);
    return node;
  }
  function drop(id, delay) {
    const node = tiles.get(id);
    if (!node) return;
    tiles.delete(id);
    if (delay) later(() => node.remove(), delay); else node.remove();
  }

  function reset(state) {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    layer.textContent = '';
    tiles.clear();
    toast.classList.remove('so-g2-on');
    for (let i = 0; i < 16; i++) if (state.cells[i]) make(state.ids[i], state.cells[i], i, '');
    tray.classList.remove('so-g2-dead');
  }

  function plus(v) {
    if (api.reduced) return;
    const p = document.createElement('div');
    p.className = 'so-g2-plus';
    p.textContent = '+' + v;
    p.addEventListener('animationend', () => p.remove());
    tray.appendChild(p);
  }

  function apply(evs) {
    if (!evs || !evs.length) return;
    let moved = false, merged = 0, won = false;
    const quick = api.reduced ? 0 : MOVE_MS;
    for (const e of evs) {
      if (e.k === 'mv') {
        const node = tiles.get(e.id);
        if (node) { place(node, e.to); moved = true; }
      } else if (e.k === 'mg') {
        drop(e.a, quick);
        drop(e.b, quick);
        const node = make(e.id, e.v, e.at, api.reduced ? '' : 'so-g2-pop');
        if (!api.reduced) node.firstChild.style.animationDelay = (MOVE_MS - 10) + 'ms';
        merged = Math.max(merged, level(e.v));
      } else if (e.k === 'sp') {
        make(e.id, e.v, e.at, api.reduced ? '' : 'so-g2-sp');
      } else if (e.k === 'sc') {
        plus(e.v);
      } else if (e.k === 'win') {
        won = true;
      }
    }
    if (merged) api.sfx('merge', merged);
    else if (moved) api.sfx('move');
    if (won) {
      api.sfx('best');
      toast.textContent = '2048 달성! 계속할 수 있어요';
      toast.classList.add('so-g2-on');
      clearTimeout(toastT);
      toastT = setTimeout(() => toast.classList.remove('so-g2-on'), 3000);
    }
  }

  function go(d) {
    if (locked) return false;
    const ok = api.input(d);
    if (!ok && !api.reduced) {
      // 안 움직이는 방향: 쟁반이 살짝 흔들린다(방향마다 다른 쪽)
      tray.classList.remove('so-g2-n0', 'so-g2-n1', 'so-g2-n2', 'so-g2-n3');
      void tray.offsetWidth;
      tray.classList.add('so-g2-n' + d);
    }
    return ok;
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = KEYS[e.key];
    if (d === undefined) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    const now = performance.now();
    if (e.repeat && now - lastKey < REPEAT_MS) return;
    lastKey = now;
    go(d);
  }

  let sx = 0, sy = 0, sid = -1;
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sid = e.pointerId; sx = e.clientX; sy = e.clientY;
    try { wrap.setPointerCapture(sid); } catch { /* 닫힌 포인터 */ }
  }
  function onMove(e) {
    if (e.pointerId !== sid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
    sid = -1; // 한 번 밀면 손을 뗄 때까지 끝
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  }
  function onUp(e) { if (e.pointerId === sid) sid = -1; }

  window.addEventListener('keydown', onKey);
  wrap.addEventListener('pointerdown', onDown);
  wrap.addEventListener('pointermove', onMove);
  wrap.addEventListener('pointerup', onUp);
  wrap.addEventListener('pointercancel', onUp);

  reset(api.state());

  return {
    reset,
    apply,
    lock(on) {
      locked = !!on;
      wrap.classList.toggle('so-g2-lock', locked);
      if (locked) sid = -1;
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      clearTimeout(toastT);
      wrap.remove();
    },
  };
}
