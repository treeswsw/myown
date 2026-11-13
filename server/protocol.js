import { parseCoin, parsePin } from '../shared/coin/protocol.js';
// Validation of everything a client may send. Returns sanitized messages only.
export const MAX_RAW = 70_000; // every message except sndAdd
export const MAX_FRAME = 300_000; // WebSocket frame limit: room for sndAdd
export const MAX_PEMOTE = 40 * 1024;
export const MAX_SOUND = 200 * 1024;
export const MAX_AVATAR = 60 * 1024;
export const MAX_CHAT = 120;
export const RESET_ID = '초기화'; // reserved: asks for the full wipe instead of logging in
export const AVATAR_PREFIX = 'data:image/jpeg;base64,';

const ID_RE = /^[\p{Script=Hangul}A-Za-z0-9_]{2,12}$/u;
const PIN_RE = /^\d{4}$/;
const TOK_RE = /^[0-9a-f]{64}$/;
const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
const JPEG_MAGIC = '/9j/'; // base64 of FF D8 FF
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MODES = ['holdem', 'bluff', 'liar', 'yacht', 'draw', 'gsk'];
const ACTIONS = ['fold', 'check', 'call', 'raise', 'allin'];

// Account key (case-insensitive) and display name, or null if the ID breaks the rules.
export function normalizeId(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim();
  if (!ID_RE.test(name)) return null;
  return { key: name.toLowerCase(), name };
}

export function validAvatar(data) {
  return validJpegData(data, MAX_AVATAR);
}

const SID_RE = /^[a-z0-9]{6,16}$/;
const BUILTIN_RE = /^builtin:[a-z]{1,16}$/;
const AUDIO_RE = /^data:audio\/[a-z0-9.+-]{1,30}(;[a-z0-9=.+-]{1,40})*;base64,/;

function validJpegData(data, max) {
  if (typeof data !== 'string' || data.length > max || !data.startsWith(AVATAR_PREFIX)) return false;
  const body = data.slice(AVATAR_PREFIX.length);
  return body.length % 4 === 0 && body.startsWith(JPEG_MAGIC) && BASE64_RE.test(body);
}

function validAudioData(data) {
  if (typeof data !== 'string' || data.length > MAX_SOUND) return false;
  const head = AUDIO_RE.exec(data);
  if (!head) return false;
  const body = data.slice(head[0].length);
  return body.length > 0 && body.length % 4 === 0 && BASE64_RE.test(body);
}

// Removes control/format characters and trims; "" when nothing visible is left.
function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\u200d' ? c : '')).trim();
  return /[^\s\u200d\ufe0f]/u.test(text) ? text : '';
}

const bad = (error, code) => ({ ok: false, error, ...(code ? { code } : {}) });
const good = (msg) => ({ ok: true, msg });

export function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_FRAME) return bad('메시지가 너무 큽니다.');
  // Only sound uploads may exceed MAX_RAW; checked on the prefix so oversized junk is never parsed.
  if (raw.length > MAX_RAW && !raw.startsWith('{"t":"sndAdd"')) return bad('메시지가 너무 큽니다.');
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
      // pw is only looked at for the reserved admin ID (SPEC 21-1); anything but a short string is dropped.
      const pw = typeof m.pw === 'string' && m.pw.length <= 32 ? m.pw : undefined;
      if (!id) return bad('아이디는 2~12자의 한글, 영문, 숫자, _ 만 쓸 수 있습니다.');
      // pin / newPin: 4 digits or the request is refused; tok: 64 hex chars, anything else is simply "no token" (SPEC 22-8).
      const out = { t: 'login', ...id, pw };
      for (const k of ['pin', 'newPin']) {
        if (m[k] === undefined || m[k] === null) continue;
        if (typeof m[k] !== 'string' || !PIN_RE.test(m[k])) return bad('비밀번호는 숫자 4자리입니다.', 'pin_fmt');
        out[k] = m[k];
      }
      if (typeof m.tok === 'string' && TOK_RE.test(m.tok)) out.tok = m.tok;
      return good(out);
    }
    case 'reset':
      // pw = admin password (SPEC 22-9); checked by the hub, only its shape here.
      return m.confirm === true ? good({ t: 'reset', pw: typeof m.pw === 'string' && m.pw.length <= 32 ? m.pw : undefined }) : bad('초기화 확인이 필요합니다.');
    case 'avatar':
      return validAvatar(m.data) ? good({ t: 'avatar', data: m.data }) : bad('프로필 사진은 60KB 이하의 JPEG여야 합니다.');
    case 'create':
    case 'mode':
      return MODES.includes(m.mode) ? good({ t: m.t, mode: m.mode }) : bad('알 수 없는 게임입니다.');
    case 'join': {
      const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
      return CODE_RE.test(code) ? good({ t: 'join', code }) : bad('방 코드가 올바르지 않습니다.');
    }
    case 'adm':
    {
      if (m.a === 'pinclr') {
        const target = normalizeId(m.id);
        return target ? good({ t: 'adm', a: 'pinclr', id: target.key }) : bad('없는 아이디입니다.', 'adm_noid');
      }
      return ['bot+', 'bot-', 'skip'].includes(m.a) ? good({ t: 'adm', a: m.a }) : bad('알 수 없는 요청입니다.');
    }
    case 'pin': {
      const r = parsePin(m);
      return r.ok ? good(r.msg) : bad('비밀번호는 숫자 4자리입니다.', 'pin_fmt');
    }
    case 'coin': {
      const r = parseCoin(m);
      return r.ok ? good(r.msg) : bad('잘못된 요청입니다.', 'coin_bad');
    }
    case 'leave':
    case 'start':
    case 'liar':
      return good({ t: m.t });
    case 'dr':
    case 'lg':
    case 'yt':
    case 'gk':
      // Only the envelope is checked here; the liar / yacht / draw / gsk room validates the contents.
      return typeof m.a === 'string' && m.a.length > 0 && m.a.length <= 20 ? good(m) : bad('잘못된 메시지 형식입니다.');
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
    case 'chat': {
      if (typeof m.text !== 'string') return bad('채팅 내용이 올바르지 않습니다.');
      // Control and invisible format characters (zero-width, bidi marks, ...) are removed, not rejected,
      // so pasted text still goes through. U+200D stays: emoji sequences need it.
      const text = m.text.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\u200d' ? c : '')).trim();
      const visible = /[^\s\u200d\ufe0f]/u.test(text);
      return visible && [...text].length <= MAX_CHAT ? good({ t: 'chat', text }) : bad('채팅은 1~120자여야 합니다.');
    }
    case 'pemote':
      return validJpegData(m.data, MAX_PEMOTE) ? good({ t: 'pemote', data: m.data }) : bad('사진은 40KB 이하의 JPEG여야 합니다.');
    case 'sndAdd': {
      const name = cleanText(m.name);
      if (typeof m.sid !== 'string' || !SID_RE.test(m.sid)) return bad('소리 번호가 올바르지 않습니다.');
      if (!name || [...name].length > 8) return bad('소리 이름은 1~8자여야 합니다.');
      if (!validAudioData(m.data)) return bad('소리가 너무 크거나 형식이 올바르지 않습니다.');
      return good({ t: 'sndAdd', sid: m.sid, name, data: m.data });
    }
    case 'sndDel':
      return typeof m.sid === 'string' && SID_RE.test(m.sid) ? good({ t: 'sndDel', sid: m.sid }) : bad('소리 번호가 올바르지 않습니다.');
    case 'sndRename': {
      const name = cleanText(m.name);
      if (typeof m.sid !== 'string' || !SID_RE.test(m.sid)) return bad('소리 번호가 올바르지 않습니다.');
      return name && [...name].length <= 8 ? good({ t: 'sndRename', sid: m.sid, name }) : bad('소리 이름은 1~8자여야 합니다.');
    }
    case 'snd':
      return typeof m.sid === 'string' && (SID_RE.test(m.sid) || BUILTIN_RE.test(m.sid))
        ? good({ t: 'snd', sid: m.sid }) : bad('소리 번호가 올바르지 않습니다.');
    case 'emote':
      return Number.isInteger(m.e) && m.e >= 0 && m.e <= 5 ? good({ t: 'emote', e: m.e }) : bad('잘못된 이모티콘입니다.');
    default:
      return bad('알 수 없는 요청입니다.');
  }
}
