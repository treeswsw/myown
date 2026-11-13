// coin·pin 요청의 속 검사 (SPEC 22-10). 봉투는 server/protocol.js.
import { SLOTS } from './shop.js';

export const PIN_RE = /^\d{4}$/;
const MAX_SWAP = 2000000000;
const ID_MAX = 40;

const bad = (code) => ({ ok: false, code });
const isObj = (m) => m !== null && typeof m === 'object' && !Array.isArray(m);
const isId = (s) => typeof s === 'string' && s.length >= 1 && s.length <= ID_MAX;
const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isPin = (s) => typeof s === 'string' && PIN_RE.test(s);

export function parseCoin(msg) {
  const fail = bad('coin_bad');
  if (!isObj(msg) || msg.t !== 'coin') return fail;
  switch (msg.a) {
    case 'swap':
      if (!Number.isInteger(msg.n) || msg.n < 1 || msg.n > MAX_SWAP) return fail;
      return { ok: true, msg: { t: 'coin', a: 'swap', n: msg.n } };
    case 'draw':
      if (msg.n !== 1 && msg.n !== 10) return fail;
      if (msg.free !== undefined && msg.free !== true && msg.free !== false) return fail;
      if (msg.free === true) {
        if (msg.n !== 1) return fail;
        return { ok: true, msg: { t: 'coin', a: 'draw', n: 1, free: true } };
      }
      return { ok: true, msg: { t: 'coin', a: 'draw', n: msg.n } };
    case 'buy':
      if (!isId(msg.id)) return fail;
      return { ok: true, msg: { t: 'coin', a: 'buy', id: msg.id } };
    case 'equip':
      if (!SLOTS.includes(msg.slot)) return fail;
      if (msg.id !== null && !isId(msg.id)) return fail;
      return { ok: true, msg: { t: 'coin', a: 'equip', slot: msg.slot, id: msg.id } };
    case 'cap':
      if (msg.n !== 1 && msg.n !== 10) return fail;
      return { ok: true, msg: { t: 'coin', a: 'cap', n: msg.n } };
    case 'craft':
      if (!isId(msg.id)) return fail;
      return { ok: true, msg: { t: 'coin', a: 'craft', id: msg.id } };
    case 'pos':
      if (!isId(msg.id)) return fail;
      if (!inRange(msg.x, -0.5, 0.5) || !inRange(msg.y, -0.5, 0.5) || !inRange(msg.s, 0.3, 2) || !inRange(msg.r, -180, 180)) return fail;
      return { ok: true, msg: { t: 'coin', a: 'pos', id: msg.id, x: msg.x, y: msg.y, s: msg.s, r: msg.r } };
    case 'rank':
      return { ok: true, msg: { t: 'coin', a: 'rank' } };
    case 'stock':
      return { ok: true, msg: { t: 'coin', a: 'stock' } };
    case 'hist':
      return { ok: true, msg: { t: 'coin', a: 'hist' } };
    default:
      return fail;
  }
}

export function parsePin(msg) {
  const fail = bad('pin_fmt');
  if (!isObj(msg) || msg.t !== 'pin') return fail;
  switch (msg.a) {
    case 'set': {
      if (!isPin(msg.pin)) return fail;
      const out = { t: 'pin', a: 'set', pin: msg.pin };
      if (msg.cur !== undefined && msg.cur !== null) {
        if (!isPin(msg.cur)) return fail;
        out.cur = msg.cur;
      }
      return { ok: true, msg: out };
    }
    case 'clear':
      if (!isPin(msg.cur)) return fail;
      return { ok: true, msg: { t: 'pin', a: 'clear', cur: msg.cur } };
    case 'forget':
      return { ok: true, msg: { t: 'pin', a: 'forget' } };
    default:
      return fail;
  }
}
