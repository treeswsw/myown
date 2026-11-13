// 2D canvas 그리기 (GDD 6-3). 논리 좌표 1600×1200 을 화면 크기에 맞춘다. 선 모양 계산은 pure.js.
import { COLORS, PAPER_COLOR, CANVAS_W, CANVAS_H, DPR_MAX } from '../../../../shared/draw/constants.js';
import { absPoints } from '../../../../shared/draw/ops.js';
import { confirmedSegments, tailSegment } from './pure.js';

const absCache = new WeakMap(); // op.p 배열 → 절대 좌표 (같은 배열은 안 바뀌는 선에만 쓴다)

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
  let cssW = 0;
  let cssH = 0;

  function resize(w, h, dpr) {
    const d = Math.min(DPR_MAX, Math.max(1, dpr || 1));
    cssW = w;
    cssH = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    ctx.setTransform(canvas.width / CANVAS_W, 0, 0, canvas.height / CANVAS_H, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    sizeTail();
  }

  function paper() {
    ctx.fillStyle = PAPER_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  const colorOf = (s) => (s.e === 1 ? PAPER_COLOR : COLORS[s.c].value);

  // 선 하나 전체 (점 하나면 동그라미). tailOut 이면 마지막 직선 꼬리는 그리지 않는다(긋는 중인 선).
  function drawStroke(s, a, tailOut) {
    const n = a.length >> 1;
    if (n < 1) return;
    const col = colorOf(s);
    if (n === 1) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(a[0], a[1], s.w, 0, Math.PI * 2); // 지름 = 굵기×2(논리 좌표)
      ctx.fill();
      return;
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = s.w * 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo((a[0] + a[2]) / 2, (a[1] + a[3]) / 2);
    for (let k = 1; k < n - 1; k++) {
      ctx.quadraticCurveTo(a[2 * k], a[2 * k + 1], (a[2 * k] + a[2 * k + 2]) / 2, (a[2 * k + 1] + a[2 * k + 3]) / 2);
    }
    if (!tailOut) ctx.lineTo(a[2 * (n - 1)], a[2 * (n - 1) + 1]);
    ctx.stroke();
  }

  // ---- 꼬리 층: 긋는 중인 선의 마지막 직선 조각만 따로 그려 매번 지우고 다시 그린다 ----
  // (꼬리를 본 그림에 바로 그리면 다음 점이 와서 곡선이 되었을 때 각진 자국이 남는다)
  let tailCv = null;
  let tailCtx = null;
  let tailDirty = false;
  function tailLayer() {
    if (tailCv) return tailCtx;
    if (typeof document === 'undefined') return null;
    tailCv = document.createElement('canvas');
    tailCv.className = 'dr-cv-tail';
    tailCv.style.cssText = 'position:absolute;inset:0;margin:auto;pointer-events:none;'; // 칸 가운데(본 캔버스와 같은 자리)
    if (canvas.parentNode && canvas.parentNode.appendChild) canvas.parentNode.appendChild(tailCv);
    tailCtx = tailCv.getContext('2d');
    sizeTail();
    return tailCtx;
  }
  function sizeTail() {
    if (!tailCv || !tailCtx) return;
    tailCv.style.width = canvas.style.width;
    tailCv.style.height = canvas.style.height;
    tailCv.width = canvas.width;
    tailCv.height = canvas.height;
    tailCtx.setTransform(canvas.width / CANVAS_W, 0, 0, canvas.height / CANVAS_H, 0, 0);
    tailCtx.lineCap = 'round';
    tailCtx.lineJoin = 'round';
    tailDirty = false;
  }
  function clearTail() {
    if (!tailDirty || !tailCtx) return;
    tailCtx.save();
    tailCtx.setTransform(1, 0, 0, 1, 0, 0);
    tailCtx.clearRect(0, 0, tailCv.width, tailCv.height);
    tailCtx.restore();
    tailDirty = false;
  }
  // 점 n 개짜리 선의 꼬리(마지막 직선 조각)를 대상 그리기판 c 에 그린다
  function strokeTail(c, s, a, n) {
    const g = tailSegment(a, n);
    c.strokeStyle = colorOf(s);
    c.lineWidth = s.w * 2;
    c.beginPath();
    c.moveTo(g.x0, g.y0);
    c.lineTo(g.x1, g.y1);
    c.stroke();
  }
  function drawTail(s, a, n) {
    if (n < 2) { clearTail(); return; }
    const c = tailLayer();
    if (!c) return;
    clearTail();
    strokeTail(c, s, a, n);
    tailDirty = true;
  }
  // 선이 끝났다: 꼬리를 본 그림에 확정하고 꼬리 층을 비운다
  function commit(s, a) {
    const n = a.length >> 1;
    if (n >= 2) strokeTail(ctx, s, a, n);
    clearTail();
  }

  // 긋는 중인 선의 일부: 점이 fromN 개였다가 toN 개로 늘었을 때 이어서만 그린다(불투명이라 덧그려도 같다).
  // 확정된 곡선 조각까지만 본 그림에 그리고, 마지막 직선 꼬리는 꼬리 층에 그린다.
  function drawGrowth(s, a, fromN, toN) {
    if (toN < 1 || toN <= fromN) return;
    const segs = confirmedSegments(a, fromN > 0 ? fromN - 1 : 0, toN);
    const col = colorOf(s);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = s.w * 2;
    for (const g of segs) {
      ctx.beginPath();
      if (g.dot) { ctx.arc(g.x, g.y, s.w, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.moveTo(g.x0, g.y0);
      if (g.cx !== undefined) ctx.quadraticCurveTo(g.cx, g.cy, g.x1, g.y1);
      else ctx.lineTo(g.x1, g.y1);
      ctx.stroke();
    }
    drawTail(s, a, toN);
  }

  // visibleStrokes() 결과를 처음부터 다시 그린다
  function drawAll(strokes) {
    paper();
    clearTail();
    for (const s of strokes) {
      let a;
      if (s.id === null) a = absPoints(s.p); // 긋는 중인 선은 배열이 자란다
      else { a = absCache.get(s.p); if (!a) { a = absPoints(s.p); absCache.set(s.p, a); } }
      if (s.id === null) { drawStroke(s, a, true); drawTail(s, a, a.length >> 1); } else drawStroke(s, a);
    }
  }

  return {
    resize, paper, drawAll, drawGrowth, commit,
    get cssSize() { return { w: cssW, h: cssH }; },
  };
}

// 획 지우개 판정용 절대 좌표(캐시 공유)
export function absOf(p) {
  let a = absCache.get(p);
  if (!a) { a = absPoints(p); absCache.set(p, a); }
  return a;
}
