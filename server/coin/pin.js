// Optional 4-digit password per account (SPEC 22-8). Hash = scrypt (async only) + salt; device tokens are stored as sha256.
// Nothing in here ever puts the salt, the hash or the token hashes into a message.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { parsePin } from '../../shared/coin/protocol.js';

const scrypt = promisify(crypto.scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const TOKEN_BYTES = 32;
const MAX_TOKENS = 5;
const LOCK_FAILS = 5; // wrong PINs ...
const LOCK_WINDOW = 10 * 60_000; // ... within this window lock PIN entry for this long
const ADMIN_ID = '관리자';

const ERR = {
  pin_need: '비밀번호가 필요합니다.',
  pin_bad: '비밀번호가 틀렸습니다.',
  pin_lock: '잠시 후 다시 시도하세요.',
  pin_fmt: '비밀번호는 숫자 4자리입니다.',
  pin_exists: '이미 있는 아이디입니다. 비밀번호 설정을 끄고 들어가세요.',
  pin_adm: '관리자 계정에는 걸 수 없습니다.',
};
export const pinErr = (code) => ({ msg: ERR[code], code });

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const eqHex = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export async function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(pin, salt, KEY_BYTES);
  return { s: salt.toString('hex'), h: key.toString('hex') };
}

export async function verifyPin(pin, rec) {
  if (!rec || typeof rec.s !== 'string' || typeof rec.h !== 'string') return false;
  const key = await scrypt(pin, Buffer.from(rec.s, 'hex'), KEY_BYTES);
  const want = Buffer.from(rec.h, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(key, want);
}

export function installPin(hub) {
  const locks = new Map(); // id -> { fails: [times], until }

  const lockOf = (id) => {
    let l = locks.get(id);
    if (!l) locks.set(id, (l = { fails: [], until: 0 }));
    return l;
  };
  const isLocked = (id) => hub.now() < (locks.get(id)?.until ?? 0);
  function fail(id) {
    const t = hub.now();
    const l = lockOf(id);
    l.fails = l.fails.filter((x) => t - x < LOCK_WINDOW);
    l.fails.push(t);
    if (l.fails.length >= LOCK_FAILS) {
      l.fails = [];
      l.until = t + LOCK_WINDOW;
    }
  }

  // New token: returns the plain value; the record keeps only the sha256 (last MAX_TOKENS).
  function addToken(rec) {
    const tok = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    rec.t = [...(rec.t ?? []), sha(tok)].slice(-MAX_TOKENS);
    return tok;
  }
  const tokenOk = (rec, tok) => typeof tok === 'string' && /^[0-9a-f]{64}$/.test(tok) &&
    (rec.t ?? []).some((h) => eqHex(h, sha(tok)));

  // Checks a PIN for an account that has one. null = right; else an error object. Counts wrong ones.
  async function checkPin(id, rec, pin) {
    if (isLocked(id)) return pinErr('pin_lock');
    if (await verifyPin(pin, rec)) {
      locks.delete(id);
      return null;
    }
    fail(id);
    return pinErr('pin_bad');
  }

  const api = {
    // Login gate (called before anything is sent or any old connection is dropped).
    // user = the account; fresh = created by this very login. Returns { err } or { changed, tok?, hash? }.
    async gate(user, id, msg, fresh) {
      if (id === ADMIN_ID) return msg.newPin !== undefined ? { err: pinErr('pin_adm') } : { changed: false };
      const rec = user.pin;
      if (msg.newPin !== undefined) {
        if (rec || !fresh) return { err: pinErr('pin_exists') };
        const nr = await hashPin(msg.newPin);
        nr.t = [];
        const tok = addToken(nr);
        user.pin = nr;
        return { tok, changed: true, hash: sha(tok) };
      }
      if (!rec) return { changed: false };
      if (tokenOk(rec, msg.tok)) return { changed: false, hash: sha(msg.tok) };
      if (msg.pin === undefined) return { err: pinErr('pin_need') };
      const err = await checkPin(id, rec, msg.pin);
      if (err) return { err };
      const tok = addToken(rec);
      return { tok, changed: true, hash: sha(tok) };
    },

    // {t:'pin'} from a logged-in session. Returns an error object or null.
    async handle(session, conn, rawMsg) {
      const parsed = parsePin(rawMsg);
      if (!parsed.ok) return pinErr('pin_fmt');
      const m = parsed.msg;
      const u = session.user;
      const done = (has, tok) => {
        hub.persist(u);
        hub.send(session, { t: 'pin', a: 'ok', has, ...(tok ? { tok } : {}) });
        hub.sendMe(session);
        return null;
      };
      if (m.a === 'forget') {
        const h = conn?.tokHash;
        if (h && u.pin) {
          u.pin.t = (u.pin.t ?? []).filter((x) => x !== h);
          hub.persist(u);
        }
        if (conn) conn.tokHash = null;
        return null;
      }
      if (session.id === ADMIN_ID) return pinErr('pin_adm');
      if (m.a === 'set') {
        if (u.pin) {
          if (m.cur === undefined) return pinErr('pin_bad');
          const err = await checkPin(session.id, u.pin, m.cur);
          if (err) return err;
        }
        const nr = await hashPin(m.pin);
        nr.t = [];
        const tok = addToken(nr);
        u.pin = nr; // other devices' tokens go with the old record
        if (conn) conn.tokHash = sha(tok);
        locks.delete(session.id);
        return done(true, tok);
      }
      // clear
      if (!u.pin) return done(false);
      const err = await checkPin(session.id, u.pin, m.cur);
      if (err) return err;
      u.pin = null;
      if (conn) conn.tokHash = null;
      return done(false);
    },

    // Admin: forget the PIN, tokens and lock of an account. true = the account exists.
    async adminClear(id) {
      locks.delete(id);
      const s = hub.sessions.get(id);
      if (s && !s.bot) {
        s.user.pin = null; // in memory too, or the next save would bring it back
        hub.persist(s.user);
        hub.sendMe(s);
        return true;
      }
      return hub.store.clearPin(id);
    },

    reset() {
      locks.clear();
    },
  };
  hub.pinAuth = api;
  return api;
}
