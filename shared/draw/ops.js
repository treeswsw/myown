// 갱식마인드 그림 한 일 목록 (docs/draw/GDD.md 6-2절 되돌리기 규칙, 10-1절 한 일 목록 규칙, 10-3·10-5절).
// 서버(room.js)와 화면(client/src/draw/)이 같은 파일을 쓴다. 순수 모듈: DOM·시계·난수·네트워크 없음.
//
// 범위 밖(이 모듈이 하지 않는 것): 출제자(그리는 사람)인가, 단계가 draw 인가 — room 이 먼저 확인하고 이 함수를 부른다.
//   누구에게 보낼지(그리는 사람을 뺀 방 전원)와 drSync/오류 보내기도 room 이 한다. 이 모듈은 "무엇을 알릴지"만 돌려준다.
//
// 상태(평범한 객체, JSON 으로 직렬화 가능. 함수들이 이 객체를 제자리에서 고친다. 거절하면 아무것도 고치지 않는다. 예외는 pt 의 'full'):
//   { ops: Op[], at: number, cur: null | { c, w, e, p, x, y } }
//   Op = { c, w, e, p }   선(e:0 펜, e:1 정밀 지우개). p 는 st 와 pt 를 이어 붙인 차이값 배열 [x0,y0,dx1,dy1,...]
//      | { rm: number[] } 획 지우개 한 묶음 (번호 = ops 안의 자리 번호)
//      | { clear: 1 }     전체 지우기
//   cur = 지금 긋는 중인 선(아직 ops 에 없음). x, y 는 마지막 점의 누적 좌표(내부 계산용).
//   ops[0..at) 만 화면에 반영된 것. ops[at..] 은 다시 하기 목록. 긋던 선은 끝(f:1)·다음 st·rm·undo·redo·clear 때 한 일로 확정되고,
//   그때 다시 하기 목록이 비워진다(cx 로 버린 선은 목록에 영향이 없다).
//
// 결과: 거절 { ok:false, error } — error: 'bad'(모양·상황이 틀림), 'range'(누적 좌표가 범위 밖), 'full'(한도 초과).
//         호출 규칙(GDD 10-2): 'full' 은 그리는 사람에게 dr_canvas_full, 'bad'·'range' 는 오류 글 없이 drSync 를 다시 보낸다.
//         'full' 이 긋던 선을 버린 경우(pt)에는 result.event = {k:'drCx'} 도 함께 돌려준다 — 이미 drSt 를 받은 사람들에게 보내 그 선을 없앤다.
//       무시 { ok:true, noop:true }  (되돌릴 것이 없음, 종이가 이미 비었음, 긋는 중이 아닌데 cx). 아무에게도 보내지 않는다.
//       성공 { ok:true, event }       event 는 10-5절 모양({k:'drSt', c,w,e,p} 등). 그리는 사람을 뺀 방 전원에게 그대로 보낸다.
//   화면(받는 쪽)은 받은 event 를 apply() 로 적용한다. 같은 규칙이라 서버와 같은 목록·위치가 된다.
import {
  COLOR_COUNT, WIDTH_MIN, WIDTH_MAX, CANVAS_W, CANVAS_H, DELTA_MAX, MAX_NUMS_PER_MSG, MAX_RM_IDS,
  MAX_OPS, MAX_POINTS_TOTAL, MAX_POINTS_PER_STROKE,
} from './constants.js';

const BAD = Object.freeze({ ok: false, error: 'bad' });
const RANGE = Object.freeze({ ok: false, error: 'range' });
const FULL = Object.freeze({ ok: false, error: 'full' });
const NOOP = Object.freeze({ ok: true, noop: true });
const isInt = Number.isInteger;
const isLine = (op) => !!op && Array.isArray(op.p);
const isRm = (op) => !!op && Array.isArray(op.rm);
const isClear = (op) => !!op && op.clear === 1;
const pointCount = (p) => p.length >> 1;

export function createDrawing() {
  return { ops: [], at: 0, cur: null };
}

export const canUndo = (s) => s.at > 0;
export const canRedo = (s) => s.at < s.ops.length;

// ---- 내부 도우미 -------------------------------------------------------

// (x, y) 에서 시작해 p[from..] 의 차이값을 누적하며 범위를 검사. 통과하면 마지막 점 {x,y}, 아니면 null.
function walk(p, x, y, from) {
  for (let i = from; i < p.length; i += 2) {
    x += p[i];
    y += p[i + 1];
    if (x < 0 || x > CANVAS_W || y < 0 || y > CANVAS_H) return null;
  }
  return { x, y };
}

// 숫자 배열 모양(정수, 짝수 길이, 128개 이하, 차이값 범위). first 면 앞 두 수는 절대 좌표라 차이값 범위를 보지 않는다.
function numsOk(p, first) {
  if (!Array.isArray(p) || p.length % 2 !== 0 || p.length > MAX_NUMS_PER_MSG) return false;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (!isInt(v)) return false;
    if (!(first && i < 2) && (v < -DELTA_MAX || v > DELTA_MAX)) return false;
  }
  return true;
}

function styleOk(c, w, e) {
  return isInt(c) && c >= 0 && c < COLOR_COUNT && isInt(w) && w >= WIDTH_MIN && w <= WIDTH_MAX && (e === 0 || e === 1);
}

// ops[0..upto) 를 본 상태: 마지막 전체 지우기 자리와 획 지우개로 지워진 번호.
function visibility(ops, upto) {
  let clearIdx = -1;
  const removed = new Set();
  for (let i = 0; i < upto; i++) {
    const op = ops[i];
    if (isClear(op)) { clearIdx = i; removed.clear(); }
    else if (isRm(op)) for (const id of op.rm) removed.add(id);
  }
  return { clearIdx, removed };
}

// 획 지우개로 지울 수 있는 선인가: 펜 선, upto 보다 앞, 마지막 전체 지우기 뒤, 아직 안 지워짐.
function rmOk(ops, upto, vis, id) {
  return isInt(id) && id > vis.clearIdx && id < upto && isLine(ops[id]) && ops[id].e === 0 && !vis.removed.has(id);
}

// ops[0..upto) 의 점 수 (+ 긋는 중인 선)
function totalPoints(s, upto, withCur) {
  let n = 0;
  for (let i = 0; i < upto; i++) if (isLine(s.ops[i])) n += pointCount(s.ops[i].p);
  if (withCur && s.cur) n += pointCount(s.cur.p);
  return n;
}

// 긋던 선을 한 일로 확정한다(없으면 아무것도 안 함). 다시 하기 목록은 여기서 비워진다.
function finishCur(s) {
  if (!s.cur) return;
  const { c, w, e, p } = s.cur;
  s.ops.length = s.at;
  s.ops.push({ c, w, e, p });
  s.at = s.ops.length;
  s.cur = null;
}

// 긋던 선이 확정된 뒤의 한 일 개수
const opsAfterCur = (s) => (s.cur ? s.at + 1 : s.at);

// ---- 연산 --------------------------------------------------------------

// 거절 사유 검사(상태는 안 고친다). 통과하면 null.
function stCheck(s, msg) {
  if (!msg || !styleOk(msg.c, msg.w, msg.e)) return BAD;
  if (!numsOk(msg.p, true) || msg.p.length < 2) return BAD;
  const p = msg.p;
  if (p[0] < 0 || p[0] > CANVAS_W || p[1] < 0 || p[1] > CANVAS_H) return RANGE;
  if (!walk(p, p[0], p[1], 2)) return RANGE;
  // 한도는 앞 선이 확정되고 이 선이 붙는 경우로 미리 계산
  if (opsAfterCur(s) + 1 > MAX_OPS) return FULL;
  if (totalPoints(s, s.at, true) + pointCount(p) > MAX_POINTS_TOTAL) return FULL;
  if (pointCount(p) > MAX_POINTS_PER_STROKE) return FULL;
  return null;
}

// 선 시작. msg = { c, w, e, p }. 앞 선이 안 끝났으면 끝난 것으로 친다.
// 거절 시 앞 선이 긋는 중이었으면 그 선은 확정되고, 결과에 event {k:'drPt',p:[],f:1} 이 붙는다(받는 사람들에게 보낸다).
export function st(s, msg) {
  const r = stCheck(s, msg);
  if (r) {
    // 거절하더라도 앞 선(긋던 것)이 열린 채 남지 않게 끝낸다. 받는 사람들에게는 선 끝 알림을 함께 돌려준다.
    if (s.cur) { finishCur(s); return { ok: false, error: r.error, event: { k: 'drPt', p: [], f: 1 } }; }
    return r;
  }
  const p = msg.p;
  const end = walk(p, p[0], p[1], 2);
  finishCur(s);
  s.cur = { c: msg.c, w: msg.w, e: msg.e, p: p.slice(), x: end.x, y: end.y };
  return { ok: true, event: { k: 'drSt', c: msg.c, w: msg.w, e: msg.e, p: p.slice() } };
}

// 점 추가. msg = { p, f? } (f:1 이면 선 끝. 그때만 p 가 비어 있어도 됨)
export function pt(s, msg) {
  if (!s.cur || !msg) return BAD;
  const f = msg.f === 1;
  if (msg.f !== undefined && !f) return BAD;
  const p = msg.p;
  if (!numsOk(p, false) || (p.length === 0 && !f)) return BAD;
  const end = walk(p, s.cur.x, s.cur.y, 0);
  if (!end) return RANGE; // 상태 변경 없이 거절. 호출자가 drSync 를 보낸다
  const add = pointCount(p);
  if (pointCount(s.cur.p) + add > MAX_POINTS_PER_STROKE || totalPoints(s, s.at, true) + add > MAX_POINTS_TOTAL) {
    s.cur = null; // 한도를 넘은 선은 버린다. 이미 drSt 를 받은 사람들은 drCx 로 지운다
    return { ok: false, error: 'full', event: { k: 'drCx' } };
  }
  for (let i = 0; i < p.length; i++) s.cur.p.push(p[i]);
  s.cur.x = end.x;
  s.cur.y = end.y;
  if (f) finishCur(s);
  return { ok: true, event: f ? { k: 'drPt', p: p.slice(), f: 1 } : { k: 'drPt', p: p.slice() } };
}

// 긋던 선을 없던 것으로(손바닥). 한 일 목록에 남지 않는다.
export function cx(s) {
  if (!s.cur) return NOOP;
  s.cur = null;
  return { ok: true, event: { k: 'drCx' } };
}

// 획 지우개. msg = { ids, g? }. 지울 수 있는 번호만 받아들이고(하나도 없으면 거절) 받아들인 것만 알린다.
// g:1 이고 마지막 한 일이 rm 이고 at === ops.length 이면 새로 붙이지 않고 그 rm 에 더한다(알림에는 합쳐졌을 때만 g:1).
export function rm(s, msg) {
  if (!msg || !Array.isArray(msg.ids) || msg.ids.length < 1 || msg.ids.length > MAX_RM_IDS) return BAD;
  if (msg.g !== undefined && msg.g !== 1) return BAD;
  const merge = msg.g === 1 && !s.cur && s.at === s.ops.length && s.at > 0 && isRm(s.ops[s.at - 1]);
  // 긋던 선이 있으면 그 선이 확정된 뒤의 목록으로 판단한다
  const upto = opsAfterCur(s);
  const probe = s.cur ? [...s.ops.slice(0, s.at), { c: s.cur.c, w: s.cur.w, e: s.cur.e, p: s.cur.p }] : s.ops;
  const vis = visibility(probe, upto);
  const ids = [];
  if (new Set(msg.ids).size !== msg.ids.length) return BAD; // 같은 번호가 겹치면 거절(GDD 10-1)
  for (const id of msg.ids) if (rmOk(probe, upto, vis, id)) ids.push(id);
  if (!ids.length) return BAD;
  if (!merge && upto + 1 > MAX_OPS) return FULL;
  finishCur(s);
  if (merge) {
    for (const id of ids) s.ops[s.at - 1].rm.push(id);
    return { ok: true, event: { k: 'drRm', ids, g: 1 } };
  }
  s.ops.length = s.at;
  s.ops.push({ rm: ids.slice() });
  s.at = s.ops.length;
  return { ok: true, event: { k: 'drRm', ids } };
}

export function undo(s) {
  finishCur(s);
  if (s.at <= 0) return NOOP;
  s.at -= 1;
  return { ok: true, event: { k: 'drUndo' } };
}

export function redo(s) {
  // 긋는 중에는 다시 하기가 없다(긋던 선을 확정하면 목록이 비므로 확정하지 않고 무시)
  if (s.cur || s.at >= s.ops.length) return NOOP;
  s.at += 1;
  return { ok: true, event: { k: 'drRedo' } };
}

// 전체 지우기. 종이가 이미 비어 있으면 무시. 되돌리기로 복구된다.
export function clear(s) {
  if (!s.cur && !visibleStrokes(s).length) return NOOP;
  if (opsAfterCur(s) + 1 > MAX_OPS) return FULL;
  finishCur(s);
  s.ops.length = s.at;
  s.ops.push({ clear: 1 });
  s.at = s.ops.length;
  return { ok: true, event: { k: 'drClear' } };
}

// 받은 event(10-5절 drSt·drPt·drCx·drRm·drUndo·drRedo·drClear)를 적용한다 — 화면이 쓴다. 서버도 같은 결과가 된다.
export function apply(s, e) {
  if (!e) return BAD;
  switch (e.k) {
    case 'drSt': return st(s, e);
    case 'drPt': return pt(s, e);
    case 'drCx': return cx(s);
    case 'drRm': return rm(s, e);
    case 'drUndo': return undo(s);
    case 'drRedo': return redo(s);
    case 'drClear': return clear(s);
    default: return BAD;
  }
}

// ---- 보이는 그림 -------------------------------------------------------

// 지금 화면에 보여야 할 획 목록(그리는 순서). [{ id, c, w, e, p }] — id 는 ops 안의 번호(긋는 중인 선은 null).
// 마지막 전체 지우기 뒤의 선 중 획 지우개로 안 지워진 것. 정밀 지우개(e:1)도 순서대로 들어 있다(종이 색으로 덧칠).
// opts.cur === false 면 긋는 중인 선을 뺀다.
export function visibleStrokes(s, opts) {
  const vis = visibility(s.ops, s.at);
  const out = [];
  for (let i = vis.clearIdx + 1; i < s.at; i++) {
    const op = s.ops[i];
    if (isLine(op) && !vis.removed.has(i)) out.push({ id: i, c: op.c, w: op.w, e: op.e, p: op.p });
  }
  if (s.cur && !(opts && opts.cur === false)) out.push({ id: null, c: s.cur.c, w: s.cur.w, e: s.cur.e, p: s.cur.p });
  return out;
}

// 차이값 배열 → 절대 좌표 배열 [x0,y0,x1,y1,...] (그리기·획 지우개 닿음 판정용)
export function absPoints(p) {
  const out = new Array(p.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < p.length; i += 2) {
    x = i === 0 ? p[0] : x + p[i];
    y = i === 0 ? p[1] : y + p[i + 1];
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

// ---- drSync ------------------------------------------------------------

// drSync 로 보낼 현재 그림 { ops, at, cur } (깊은 복사. cur 는 {c,w,e,p} 또는 null). 이 객체를 drSync 의 필드로 그대로 쓴다.
export function exportSync(s) {
  return {
    ops: s.ops.map((op) => (isLine(op) ? { c: op.c, w: op.w, e: op.e, p: op.p.slice() } : isRm(op) ? { rm: op.rm.slice() } : { clear: 1 })),
    at: s.at,
    cur: s.cur ? { c: s.cur.c, w: s.cur.w, e: s.cur.e, p: s.cur.p.slice() } : null,
  };
}

function lineShapeOk(l) {
  if (!l || typeof l !== 'object' || !styleOk(l.c, l.w, l.e)) return null;
  const p = l.p;
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0 || pointCount(p) > MAX_POINTS_PER_STROKE) return null;
  for (let k = 0; k < p.length; k++) if (!isInt(p[k]) || (k >= 2 && Math.abs(p[k]) > DELTA_MAX)) return null;
  if (p[0] < 0 || p[0] > CANVAS_W || p[1] < 0 || p[1] > CANVAS_H) return null;
  return walk(p, p[0], p[1], 2); // 마지막 점 또는 null
}

// 받은 drSync({ops, at, cur})로 새 상태를 만든다. 전부 검사해서 하나라도 틀리면 { ok:false, error:'bad' }.
// 성공하면 { ok:true, state }. 화면은 이 state 로 자기 것을 통째로 바꾸고 다시 그린다.
export function importSync(data) {
  if (!data || !Array.isArray(data.ops) || !isInt(data.at) || data.at < 0 || data.at > data.ops.length || data.ops.length > MAX_OPS) return BAD;
  const ops = [];
  let points = 0; // ops 전체의 점 수
  let pointsAt = 0; // ops[0..at) 의 점 수
  for (let i = 0; i < data.ops.length; i++) {
    const op = data.ops[i];
    if (!op || typeof op !== 'object') return BAD;
    if (Array.isArray(op.p)) {
      if (!lineShapeOk(op)) return BAD;
      points += pointCount(op.p);
      if (i < data.at) pointsAt += pointCount(op.p);
      ops.push({ c: op.c, w: op.w, e: op.e, p: op.p.slice() });
    } else if (Array.isArray(op.rm)) {
      if (op.rm.length < 1) return BAD; // g:1 로 합쳐진 묶음은 50개를 넘을 수 있다
      const vis = visibility(ops, i);
      const seen = new Set();
      for (const id of op.rm) {
        if (seen.has(id) || !rmOk(ops, i, vis, id)) return BAD;
        seen.add(id);
      }
      ops.push({ rm: op.rm.slice() });
    } else if (op.clear === 1) {
      ops.push({ clear: 1 });
    } else return BAD;
  }
  let cur = null;
  let curPoints = 0;
  if (data.cur != null) {
    const end = lineShapeOk(data.cur);
    if (!end) return BAD;
    curPoints = pointCount(data.cur.p);
    cur = { c: data.cur.c, w: data.cur.w, e: data.cur.e, p: data.cur.p.slice(), x: end.x, y: end.y };
  }
  // 서버가 받아들이는 기준과 같게: ops 전체 ≤ 한도, 그리고 보이는 것(ops[0..at)) + 긋는 중인 선 ≤ 한도
  if (points > MAX_POINTS_TOTAL || pointsAt + curPoints > MAX_POINTS_TOTAL) return BAD;
  return { ok: true, state: { ops, at: data.at, cur } };
}
