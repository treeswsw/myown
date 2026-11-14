// {t:'gk', a, ...} 요청의 속 모양 검사 (GDD 9-1). 모양·범위만 본다 — 차례인가·합계 이하인가는 엔진(game.js)이 본다.
// 받은 객체는 고치지 않고 정리한 새 객체를 돌려준다. 모르는 필드는 버린다.
// 통과: { ok:true, msg } / 아니면 { ok:false, code:'gk_bad', error }
import { ERRORS } from './constants.js';

const bad = () => ({ ok: false, code: 'gk_bad', error: ERRORS.gk_bad });
const good = (msg) => ({ ok: true, msg });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const kind = (v) => v === 'F' || v === 'S';

export function parseGk(msg) {
  if (!isObj(msg) || typeof msg.a !== 'string' || msg.a.length < 1 || msg.a.length > 20) return bad();
  switch (msg.a) {
    case 'place':
      return kind(msg.k) ? good({ a: 'place', k: msg.k }) : bad();
    case 'bid':
      return Number.isInteger(msg.n) && msg.n >= 1 && msg.n <= 24 ? good({ a: 'bid', n: msg.n }) : bad();
    case 'pass':
      return good({ a: 'pass' });
    case 'flip':
      return typeof msg.p === 'string' && msg.p.length >= 1 && msg.p.length <= 100 ? good({ a: 'flip', p: msg.p }) : bad();
    case 'discard':
      return !has(msg, 'i') && kind(msg.k) ? good({ a: 'discard', k: msg.k }) : bad();
    default: return bad();
  }
}
