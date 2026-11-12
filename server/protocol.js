// Validation of everything a client may send. Returns sanitized messages only.
export const MAX_RAW = 70_000;
export const MAX_AVATAR = 60 * 1024;
export const AVATAR_PREFIX = 'data:image/jpeg;base64,';

const ID_RE = /^[\p{Script=Hangul}A-Za-z0-9_]{2,12}$/u;
const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
const JPEG_MAGIC = '/9j/'; // base64 of FF D8 FF
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MODES = ['holdem', 'bluff'];
const ACTIONS = ['fold', 'check', 'call', 'raise', 'allin'];

// Account key (case-insensitive) and display name, or null if the ID breaks the rules.
export function normalizeId(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim();
  if (!ID_RE.test(name)) return null;
  return { key: name.toLowerCase(), name };
}

export function validAvatar(data) {
  if (typeof data !== 'string' || data.length > MAX_AVATAR || !data.startsWith(AVATAR_PREFIX)) return false;
  const body = data.slice(AVATAR_PREFIX.length);
  return body.length % 4 === 0 && body.startsWith(JPEG_MAGIC) && BASE64_RE.test(body);
}

const bad = (error) => ({ ok: false, error });
const good = (msg) => ({ ok: true, msg });

export function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_RAW) return bad('메시지가 너무 큽니다.');
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return bad('잘못된 메시지 형식입니다.');
  }
  if (m === null || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') {
    return bad('잘못된 메시지 형식입니다.');
  }
  switch (m.t) {
    case 'login': {
      const id = normalizeId(m.id);
      return id ? good({ t: 'login', ...id }) : bad('아이디는 2~12자의 한글, 영문, 숫자, _ 만 쓸 수 있습니다.');
    }
    case 'avatar':
      return validAvatar(m.data) ? good({ t: 'avatar', data: m.data }) : bad('프로필 사진은 60KB 이하의 JPEG여야 합니다.');
    case 'create':
    case 'mode':
      return MODES.includes(m.mode) ? good({ t: m.t, mode: m.mode }) : bad('알 수 없는 게임입니다.');
    case 'join': {
      const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
      return CODE_RE.test(code) ? good({ t: 'join', code }) : bad('방 코드가 올바르지 않습니다.');
    }
    case 'leave':
    case 'start':
    case 'liar':
      return good({ t: m.t });
    case 'act': {
      if (!ACTIONS.includes(m.a)) return bad('알 수 없는 행동입니다.');
      if (m.a === 'raise' && !(Number.isSafeInteger(m.amount) && m.amount > 0)) return bad('레이즈 금액이 올바르지 않습니다.');
      return good({ t: 'act', a: m.a, amount: m.a === 'raise' ? m.amount : undefined });
    }
    case 'play': {
      const ok = Array.isArray(m.cards) && m.cards.length >= 1 && m.cards.length <= 3 &&
        m.cards.every((i) => Number.isInteger(i) && i >= 0 && i < 5) && new Set(m.cards).size === m.cards.length;
      return ok ? good({ t: 'play', cards: m.cards }) : bad('카드를 1~3장 선택하세요.');
    }
    case 'emote':
      return Number.isInteger(m.e) && m.e >= 0 && m.e <= 5 ? good({ t: 'emote', e: m.e }) : bad('잘못된 이모티콘입니다.');
    default:
      return bad('알 수 없는 요청입니다.');
  }
}
