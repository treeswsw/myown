// 그림판 순수 계산 (DOM·시계 없음). 좌표는 모두 논리 좌표(1600×1200 정수) — docs/draw/GDD.md 6-3, 10-1.
import {
  CANVAS_W, CANVAS_H, MIN_POINT_GAP, MAX_NUMS_PER_MSG, MAX_RM_IDS, STROKE_ERASER_RADIUS, PALM_MAX_CONTACT,
} from '../../../../shared/draw/constants.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// 칸(w×h) 안에 들어가는 가장 큰 4:3 크기. 가로는 4의 배수(세로가 정수가 되도록).
export function fitBox(w, h) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const bw = Math.floor(Math.min(w, (h * 4) / 3) / 4) * 4;
  if (bw < 4) return { w: 0, h: 0 };
  return { w: bw, h: (bw * 3) / 4 };
}

// 화면 좌표 → 논리 좌표(정수, 종이 안으로 붙임). rect = { left, top, width, height }
export function toLogical(clientX, clientY, rect) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  const x = Math.round(((clientX - rect.left) / rect.width) * CANVAS_W);
  const y = Math.round(((clientY - rect.top) / rect.height) * CANVAS_H);
  return { x: clamp(x, 0, CANVAS_W), y: clamp(y, 0, CANVAS_H) };
}

// 떨림 줄이기: 새 점 = 앞 점 (1-k) + 손 k. k=1 이면 보정 없음.
export function smoothToward(prev, raw, k) {
  if (!prev || k >= 1) return { x: raw.x, y: raw.y };
  return {
    x: clamp(Math.round(prev.x + (raw.x - prev.x) * k), 0, CANVAS_W),
    y: clamp(Math.round(prev.y + (raw.y - prev.y) * k), 0, CANVAS_H),
  };
}

// 앞 점과 충분히 떨어져 있나 (MIN_POINT_GAP 은 800 기준 px 이므로 논리 좌표로는 2배)
export function farEnough(prev, p, gap = MIN_POINT_GAP * 2) {
  if (!prev) return true;
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  return dx * dx + dy * dy >= gap * gap;
}

// ---- 보내기 묶음 ---------------------------------------------------------

// 절대 좌표 점들 [{x,y}] → 숫자 배열. prev 가 없으면 첫 점은 절대 좌표, 있으면 prev 와의 차이.
export function packPoints(pts, prev) {
  const out = [];
  let px = prev ? prev.x : 0;
  let py = prev ? prev.y : 0;
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && !prev) out.push(pts[0].x, pts[0].y);
    else out.push(pts[i].x - px, pts[i].y - py);
    px = pts[i].x;
    py = pts[i].y;
  }
  return out;
}

// 숫자 배열을 (짝수 길이) max 개 이하로 나눈다.
export function splitNums(nums, max = MAX_NUMS_PER_MSG) {
  const size = max - (max % 2);
  const out = [];
  for (let i = 0; i < nums.length; i += size) out.push(nums.slice(i, i + size));
  return out;
}

// 모인 점들을 보낼 메시지 목록으로. last = 이미 보낸 마지막 점(st 를 아직 안 보냈으면 null).
// final 이면 마지막 메시지에 f:1 (st 뒤이거나 점이 없으면 pt {p:[],f:1} 를 덧붙인다).
// 돌려줌: [{ kind:'st'|'pt', p, f? }]
export function planMessages(pts, last, final) {
  const msgs = [];
  let isFirst = !last;
  if (pts.length) {
    for (const chunk of splitNums(packPoints(pts, last))) {
      msgs.push(isFirst ? { kind: 'st', p: chunk } : { kind: 'pt', p: chunk });
      isFirst = false;
    }
  }
  if (final) {
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.kind === 'pt') lastMsg.f = 1;
    else msgs.push({ kind: 'pt', p: [], f: 1 });
  }
  return msgs;
}

// 획 지우개 번호 묶음: 50개씩. 앞서 보낸 적이 있거나 둘째 묶음부터는 g:1 (한 번 문지른 것을 되돌리기 한 번에).
export function planRm(ids, alreadySent) {
  const out = [];
  for (let i = 0; i < ids.length; i += MAX_RM_IDS) {
    const m = { ids: ids.slice(i, i + MAX_RM_IDS) };
    if (alreadySent || i > 0) m.g = 1;
    out.push(m);
  }
  return out;
}

// 받은 차이값 nums 를 절대 좌표 평면 배열 a 의 끝에 이어 붙인다(a 가 비었으면 첫 두 수가 절대 좌표).
export function appendAbs(a, nums) {
  let x = a.length ? a[a.length - 2] : 0;
  let y = a.length ? a[a.length - 1] : 0;
  for (let i = 0; i < nums.length; i += 2) {
    if (!a.length && i === 0) { x = nums[0]; y = nums[1]; } else { x += nums[i]; y += nums[i + 1]; }
    a.push(x, y);
  }
  return a;
}

// ---- 곡선 ----------------------------------------------------------------

// a = 절대 좌표 평면 배열 [x0,y0,...], 앞 n 점만 쓴다. 가운뎃점 2차 베지어(GDD 6-3).
// 0 번 = p0→m01 직선, k(1..n-2) = m(k-1,k)→m(k,k+1) 을 p_k 로 휘는 곡선, n-1 번(꼬리) = m(n-2,n-1)→p(n-1) 직선.
// 점이 하나면 [{dot:true,x,y}]. from 번 조각부터 끝까지 돌려준다.
export function segmentsFrom(a, from, n = a.length >> 1) {
  if (n < 1) return [];
  if (n === 1) return from > 0 ? [] : [{ dot: true, x: a[0], y: a[1] }];
  const mx = (i) => (a[2 * i] + a[2 * i + 2]) / 2;
  const my = (i) => (a[2 * i + 1] + a[2 * i + 3]) / 2;
  const out = [];
  for (let k = Math.max(0, from); k <= n - 1; k++) {
    if (k === 0) out.push({ x0: a[0], y0: a[1], x1: mx(0), y1: my(0) });
    else if (k === n - 1) out.push({ x0: mx(n - 2), y0: my(n - 2), x1: a[2 * (n - 1)], y1: a[2 * (n - 1) + 1] });
    else out.push({ x0: mx(k - 1), y0: my(k - 1), cx: a[2 * k], cy: a[2 * k + 1], x1: mx(k), y1: my(k) });
  }
  return out;
}

// 확정된 조각만: n 점짜리 선의 꼬리(마지막 직선 조각)를 뺀 from 번부터. 점이 하나면 동그라미(확정).
// 긋는 중에는 이것만 본 그림에 그리고, 꼬리는 따로 그려 지우고 다시 그린다(각진 자국 방지).
export function confirmedSegments(a, from, n = a.length >> 1) {
  const segs = segmentsFrom(a, from, n);
  return n >= 2 ? segs.slice(0, -1) : segs;
}

// 꼬리 조각 하나(점이 2개 이상일 때만). 없으면 null.
export function tailSegment(a, n = a.length >> 1) {
  return n >= 2 ? segmentsFrom(a, n - 1, n)[0] : null;
}

// 손을 뗀 자리를 마지막 점으로 더할 수 있나: 앞 점에서 충분히 떨어져 있을 때만 그 점(논리 좌표), 아니면 null.
export function finalPoint(prev, raw, gap) {
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  return farEnough(prev, raw, gap) ? raw : null;
}

// 점이 prevN 개에서 늘었을 때 이어 그릴 첫 조각 번호(앞서 꼬리였던 조각이 이제 곡선이 되므로 한 칸 되돌아간다)
export const resumeIndex = (prevN) => (prevN > 0 ? prevN - 1 : 0);

// ---- 획 지우개 닿음 -------------------------------------------------------

function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

export function distSegSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  return Math.min(
    distPointSeg(ax, ay, cx, cy, dx, dy), distPointSeg(bx, by, cx, cy, dx, dy),
    distPointSeg(cx, cy, ax, ay, bx, by), distPointSeg(dx, dy, ax, ay, bx, by),
  );
}

export function bbox(a) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < a.length; i += 2) {
    if (a[i] < x0) x0 = a[i];
    if (a[i] > x1) x1 = a[i];
    if (a[i + 1] < y0) y0 = a[i + 1];
    if (a[i + 1] > y1) y1 = a[i + 1];
  }
  return { x0, y0, x1, y1 };
}

// 지우개가 (ax,ay)→(bx,by) 로 움직였을 때 선(절대 좌표 a, 굵기 w=800 기준 px)에 닿았나.
// 닿는 범위 = 지우개 반지름(STROKE_ERASER_RADIUS, 논리 좌표로 2배) + 선 굵기의 절반(w×2÷2 = w).
export function strokeHit(a, w, ax, ay, bx, by, box, radius = STROKE_ERASER_RADIUS * 2) {
  const r = radius + w;
  const bb = box || bbox(a);
  if (Math.max(ax, bx) < bb.x0 - r || Math.min(ax, bx) > bb.x1 + r || Math.max(ay, by) < bb.y0 - r || Math.min(ay, by) > bb.y1 + r) return false;
  const n = a.length >> 1;
  if (n === 1) return distPointSeg(a[0], a[1], ax, ay, bx, by) <= r;
  for (let i = 0; i < n - 1; i++) {
    if (distSegSeg(ax, ay, bx, by, a[2 * i], a[2 * i + 1], a[2 * i + 2], a[2 * i + 3]) <= r) return true;
  }
  return false;
}

// ---- 손바닥·펜슬 ---------------------------------------------------------

// 누르기를 받을지. info = { penSeen, activeType(지금 긋는 포인터 종류 또는 null), type, button, width, height }
// 'start' | 'ignore' | 'replace'(긋던 손바닥 선을 취소하고 펜으로 갈아탐)
export function decideDown(info) {
  const { penSeen, activeType, type, button, width, height } = info;
  if (type === 'mouse' && button !== 0) return 'ignore';
  if (type === 'pen') {
    if (!activeType) return 'start';
    return activeType === 'pen' ? 'ignore' : 'replace';
  }
  if (penSeen) return 'ignore'; // 펜슬이 한 번이라도 닿으면 손가락·손바닥은 그리지 않는다
  if (activeType) return 'ignore'; // 먼저 닿은 한 점만
  if (type === 'touch' && Math.max(width || 0, height || 0) > PALM_MAX_CONTACT) return 'ignore';
  return 'start';
}
