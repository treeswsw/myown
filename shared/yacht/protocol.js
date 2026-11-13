// {t:'yt'} 요청의 모양 검사 (SPEC 19-2). 모양만 본다 — 차례인가·칸이 비었는가는 엔진(game.js)이 본다.
// 받은 객체는 고치지 않고 새 객체를 돌려준다. 모르는 필드는 버린다.
import { CATS } from './constants.js';

const BAD = '잘못된 요청입니다.';
const good = (msg) => ({ ok: true, msg });
const bad = () => ({ ok: false, error: BAD });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function parseYt(msg) {
  if (!isObj(msg) || typeof msg.a !== 'string') return bad();
  switch (msg.a) {
    case 'roll': return good({ a: 'roll' });
    case 'shake':
      return typeof msg.on === 'boolean' ? good({ a: 'shake', on: msg.on }) : bad();
    case 'keep':
      return Number.isInteger(msg.i) && msg.i >= 0 && msg.i <= 4 && typeof msg.on === 'boolean'
        ? good({ a: 'keep', i: msg.i, on: msg.on }) : bad();
    case 'pick':
      if (!has(msg, 'cat')) return bad();
      return msg.cat === null || (typeof msg.cat === 'string' && CATS.includes(msg.cat))
        ? good({ a: 'pick', cat: msg.cat }) : bad();
    case 'score':
      return typeof msg.cat === 'string' && CATS.includes(msg.cat) ? good({ a: 'score', cat: msg.cat }) : bad();
    default: return bad();
  }
}
