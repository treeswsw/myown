// {t:'dr'} 요청의 모양 검사 (GDD 10-1·10-2절). 모양만 본다 — 방장인가·단계가 맞는가·그리는 사람인가·주제 이름이 있는가·한도를 넘었는가는 방·엔진이 본다.
// node 전용 모듈을 쓰지 않는다(화면도 쓸 수 있게). 받은 객체는 고치지 않고 새 객체를 돌려준다.
// 결과: 통과하면 { ok:true, msg: 정리된 객체 }, 아니면 { ok:false, error } (shared/liar/protocol.js 와 같은 방식).
import {
  COLOR_COUNT, WIDTH_MIN, WIDTH_MAX, CANVAS_W, CANVAS_H, DELTA_MAX, MAX_NUMS_PER_MSG, MAX_RM_IDS, MAX_OPS,
  ACT_MAX, WORD_CHOICES,
} from './constants.js';

const BAD = '알 수 없는 요청입니다.'; // dr_bad 와 같은 글

const good = (msg) => ({ ok: true, msg });
const bad = (error = BAD) => ({ ok: false, error });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const inRange = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;

// 점 배열. first=true 면 [x0,y0,dx1,dy1,...], 아니면 [dx,dy,...]. 길이는 짝수, 최대 128개. 틀리면 null.
function checkPoints(p, first, allowEmpty) {
  if (!Array.isArray(p) || p.length % 2 !== 0 || p.length > MAX_NUMS_PER_MSG) return null;
  if (p.length === 0) return !first && allowEmpty ? [] : null;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (!isInt(v)) return null;
    if (first && i === 0) { if (v < 0 || v > CANVAS_W) return null; }
    else if (first && i === 1) { if (v < 0 || v > CANVAS_H) return null; }
    else if (v < -DELTA_MAX || v > DELTA_MAX) return null;
  }
  return p.slice();
}

export function checkDr(msg) {
  if (!isObj(msg) || typeof msg.a !== 'string' || msg.a.length < 1 || msg.a.length > ACT_MAX) return bad();
  switch (msg.a) {
    case 'pick':
      return inRange(msg.i, 0, WORD_CHOICES - 1) ? good({ a: 'pick', i: msg.i }) : bad();
    case 'st': {
      if (!inRange(msg.c, 0, COLOR_COUNT - 1) || !inRange(msg.w, WIDTH_MIN, WIDTH_MAX)) return bad();
      if (msg.e !== 0 && msg.e !== 1) return bad();
      const p = checkPoints(msg.p, true, false);
      return p ? good({ a: 'st', c: msg.c, w: msg.w, e: msg.e, p }) : bad();
    }
    case 'pt': {
      if (has(msg, 'f') && msg.f !== 1) return bad();
      const f = has(msg, 'f');
      const p = checkPoints(msg.p, false, f); // 선 끝(f:1)만 보낼 때는 빈 배열 허용
      if (!p) return bad();
      return good(f ? { a: 'pt', p, f: 1 } : { a: 'pt', p });
    }
    case 'rm': {
      const ids = msg.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_RM_IDS) return bad();
      for (const id of ids) if (!inRange(id, 0, MAX_OPS - 1)) return bad();
      if (new Set(ids).size !== ids.length) return bad();
      if (has(msg, 'g') && msg.g !== 1) return bad();
      return good(has(msg, 'g') ? { a: 'rm', ids: ids.slice(), g: 1 } : { a: 'rm', ids: ids.slice() });
    }
    case 'cx':
    case 'undo':
    case 'redo':
    case 'clear':
    case 'give':
    case 'skip':
    case 'end':
      return good({ a: msg.a });
    default:
      return bad();
  }
}
