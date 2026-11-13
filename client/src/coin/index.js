// 갱식 코인 구역 입구 (SPEC 22-14). main.js 가 import('./coin/index.js') 로 따로 불러온다.
// createCoin({send, root}) -> { onMe(me), onMsg(msg), open(kind) }
// ctx.on(type, fn) -> 끄기. type: 't' 값('coin' | 'pin' | 'error' | 'me') 또는 'coin:<a>'(예 'coin:draw'), 'pin:<a>'.
//   'error' 는 code 가 coin_ / shop_ / pin_ 로 시작하는 것만 온다. 'me' 는 wallet 이 바뀔 때마다(fn(wallet)).
import { item } from '../../../shared/coin/shop.js';
import './coin.css';
import './look.css';
import './titlefx.css';

const WINDOWS = {
  swap: () => import('./wallet.js').then((m) => m.openSwap),
  rank: () => import('./wallet.js').then((m) => m.openRank),
  draw: () => import('./gacha.js').then((m) => m.openGacha),
  shop: () => import('./shop.js').then((m) => m.openShop),
  pin: () => import('./pin.js').then((m) => m.openPin),
  cap: () => import('./capsule.js').then((m) => m.openCapsule),
  look: () => import('./lookwin.js').then((m) => m.openLook),
};

const EMPTY = { coins: 0, total: 0, pity: 0, owned: [], equip: {}, hasPin: false };

export function createCoin({ send, root }) {
  let wallet = { ...EMPTY };
  const listeners = new Map(); // type -> Set<fn>

  function on(type, fn) {
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  function emit(type, arg) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(arg); } catch (e) { console.error('[coin]', e); }
    }
  }

  let meUser = null; // 가장 최근 me.user (이름·사진·칩). 없으면 null.
  // ctx.me() -> 최근 사용자|null, ctx.open(kind) -> 다른 코인 창 열기
  const ctx = { send, root, wallet: () => wallet, on, me: () => meUser, open: (kind) => open(kind) };

  // ---------- 알림 (위쪽, 조작을 막지 않음) ----------
  let toastEl = null, toastTimer = 0;
  let newsEl = null, newsTimer = 0;
  function flash(kind, text, ms) {
    const isNews = kind === 'news';
    let el = isNews ? newsEl : toastEl;
    if (!el) {
      el = document.createElement('div');
      el.className = isNews ? 'cn-news' : 'cn-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      if (isNews) newsEl = el; else toastEl = el;
    }
    el.textContent = text;
    el.classList.remove('cn-show');
    el.remove();
    root.append(el);
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add('cn-show');
    if (isNews) { clearTimeout(newsTimer); newsTimer = setTimeout(() => el.remove(), ms); }
    else { clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), ms); }
  }

  function onMe(me) {
    if (me && me.user && typeof me.user === 'object') meUser = me.user;
    const w = me && me.wallet;
    if (!w || typeof w !== 'object') return;
    wallet = {
      ...w, // stock·free·pool·shard·cpity·pos 같은 새 칸도 그대로 넘긴다
      coins: Number(w.coins) || 0,
      total: Number(w.total) || 0,
      pity: Number(w.pity) || 0,
      owned: Array.isArray(w.owned) ? w.owned.slice() : [],
      equip: w.equip && typeof w.equip === 'object' ? { ...w.equip } : {},
      hasPin: !!w.hasPin,
    };
    emit('me', wallet);
  }

  // 반환: 이 구역이 처리한 메시지면 true.
  function onMsg(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.t === 'coin') {
      if (msg.a === 'got') {
        const n = Number(msg.n) || 0;
        if (n > 0) flash('toast', `+${n} 코인`, 2500);
      } else if (msg.a === 'news') {
        const name = String(msg.name ?? '');
        const chips = Number(msg.chips) || 0;
        if (msg.item) flash('news', `${name}님이 캡슐에서 ${(item(msg.item)?.name ?? '희귀 아이템')}을(를) 뽑았습니다!`, 3000);
        else flash('news', `${name}님이 뽑기에서 ${chips.toLocaleString('ko-KR')}칩에 당첨!`, 3000);
      }
      emit('coin', msg);
      if (msg.a) emit('coin:' + msg.a, msg);
      return true;
    }
    if (msg.t === 'pin') {
      emit('pin', msg);
      if (msg.a) emit('pin:' + msg.a, msg);
      return true;
    }
    if (msg.t === 'error' && typeof msg.code === 'string' && /^(coin|shop|pin)_/.test(msg.code)) {
      emit('error', msg);
      return true;
    }
    return false;
  }

  async function open(kind) {
    const load = WINDOWS[kind];
    if (!load) return;
    try {
      const fn = await load();
      fn(ctx);
    } catch (e) {
      console.error('[coin] open', kind, e);
    }
  }

  return { onMe, onMsg, open };
}
