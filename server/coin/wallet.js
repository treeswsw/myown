// Coin wallet on the hub (SPEC 22): award (22-2), swap / draw / buy / equip / rank (22-3..22-6).
// Nothing here knows a game; games call hub.award(room, mode, rows) once per finished round.
import { COIN_RULES, coinsFor } from '../../shared/coin/rules.js';
import { draw as gachaDraw, COST, TEN } from '../../shared/coin/gacha.js';
import { item } from '../../shared/coin/shop.js';
import { parseCoin } from '../../shared/coin/protocol.js';

const CHIPS_PER_COIN = 100;
const MAX_CHIPS = 2_000_000_000;
const DRAW_GAP_MS = 300;
const ADMIN_ID = '관리자';

const ERR = {
  coin_room: '방에서 나온 뒤에 할 수 있습니다.',
  coin_low: '코인이 모자랍니다.',
  coin_bad: '잘못된 요청입니다.',
  coin_max: '칩이 너무 많습니다.',
  shop_no: '없는 물건입니다.',
  shop_own: '이미 가지고 있습니다.',
  shop_not: '가지고 있지 않습니다.',
};
export const coinErr = (code) => ({ msg: ERR[code], code });

// The wallet part of `me`. Never carries the pin record.
export function walletOf(user) {
  const g = user.gear ?? {};
  return {
    coins: user.coins ?? 0,
    total: user.coinsTotal ?? 0,
    pity: g.pity ?? 0,
    owned: [...(g.owned ?? [])],
    equip: { ...(g.equip ?? {}) },
    hasPin: !!user.pin,
  };
}

export function installWallet(hub) {
  const lastEarn = new Map(); // `${id}|${mode}` -> time of the last paid award
  const lastDraw = new Map(); // id -> time of the last draw request

  const hasBot = (room) => hub.admin?.botsIn?.(room) > 0 || (room.members ?? []).some((m) => m.session?.bot);

  function ledger(entry) {
    try {
      const p = hub.store.log(entry);
      if (p && typeof p.catch === 'function') p.catch((err) => console.error('coin log failed:', err.message));
    } catch (err) {
      console.error('coin log failed:', err.message);
    }
  }

  function changed(session, entry) {
    hub.persist(session.user);
    if (entry) ledger({ uid: session.id, ...entry });
    hub.sendMe(session);
  }

  hub.award = (room, mode, rows) => {
    if (!COIN_RULES[mode] || !room || hasBot(room)) return;
    const t = hub.now();
    for (const row of rows ?? []) {
      const session = hub.sessions.get(row.id);
      if (!session || session.bot || String(row.id).startsWith('~bot')) continue;
      const n = coinsFor(mode, { won: !!row.won, opp: row.opp });
      if (n <= 0) continue;
      const key = `${row.id}|${mode}`;
      const last = lastEarn.get(key);
      if (last !== undefined && t - last < COIN_RULES[mode].gapMs) continue;
      lastEarn.set(key, t);
      const u = session.user;
      u.coins = (u.coins ?? 0) + n;
      u.coinsTotal = (u.coinsTotal ?? 0) + n;
      changed(session, { kind: 'earn', delta: n, bal: u.coins, note: { mode, win: !!row.won } });
      hub.send(session, { t: 'coin', a: 'got', n, mode, win: !!row.won });
    }
  };

  function news(session, pull, name) {
    if (session.id === ADMIN_ID) return;
    const msg = { t: 'coin', a: 'news', name, chips: pull.chips, tier: pull.tier };
    for (const s of hub.sessions.values()) {
      if (!s.conn || s === session || s.bot) continue;
      if (pull.tier >= 3 || !s.room) hub.send(s, msg);
    }
  }

  // Returns null (handled) or an error object.
  hub.coin = async (session, rawMsg) => {
    const parsed = parseCoin(rawMsg);
    if (!parsed.ok) return coinErr('coin_bad');
    const m = parsed.msg;
    const u = session.user;
    const g = u.gear;
    const needOut = () => (session.room ? coinErr('coin_room') : null);

    switch (m.a) {
      case 'swap': {
        const e = needOut();
        if (e) return e;
        if (m.n > u.coins) return coinErr('coin_low');
        const chips = m.n * CHIPS_PER_COIN;
        if (u.bank + chips > MAX_CHIPS) return coinErr('coin_max');
        u.coins -= m.n;
        u.bank += chips;
        changed(session, { kind: 'swap', delta: -m.n, bal: u.coins, chips });
        hub.send(session, { t: 'coin', a: 'swap', n: m.n, chips });
        return null;
      }
      case 'draw': {
        const t = hub.now();
        const last = lastDraw.get(session.id);
        if (last !== undefined && t - last < DRAW_GAP_MS) return null; // silently ignored
        lastDraw.set(session.id, t);
        const e = needOut();
        if (e) return e;
        const cost = COST * (m.n === 10 ? TEN : 1);
        if (u.coins < cost) return coinErr('coin_low');
        if (u.bank + m.n * 100_000 > MAX_CHIPS) return coinErr('coin_max'); // top prize is 100000 chips per pull
        const r = gachaDraw(hub.rng, m.n, g.pity);
        u.coins -= cost;
        u.bank += r.chips;
        g.pity = r.pity;
        changed(session, { kind: 'draw', delta: -cost, bal: u.coins, chips: r.chips, note: { pulls: r.pulls.map((p) => p.chips) } });
        hub.send(session, { t: 'coin', a: 'draw', pulls: r.pulls, chips: r.chips, pity: r.pity });
        for (const p of r.pulls) if (p.tier >= 2) news(session, p, u.name);
        return null;
      }
      case 'buy': {
        const e = needOut();
        if (e) return e;
        const it = item(m.id);
        if (!it) return coinErr('shop_no');
        if (g.owned.includes(it.id)) return coinErr('shop_own');
        if (u.coins < it.price) return coinErr('coin_low');
        u.coins -= it.price;
        g.owned.push(it.id);
        changed(session, { kind: 'buy', delta: -it.price, bal: u.coins, note: { item: it.id } });
        hub.send(session, { t: 'coin', a: 'buy', id: it.id });
        return null;
      }
      case 'equip': {
        if (m.id === null) {
          delete g.equip[m.slot];
        } else {
          const it = item(m.id);
          if (!it || it.slot !== m.slot) return coinErr('shop_no');
          if (!g.owned.includes(it.id)) return coinErr('shop_not');
          g.equip[m.slot] = it.id;
        }
        changed(session, null);
        hub.send(session, { t: 'coin', a: 'equip', slot: m.slot, id: m.id });
        return null;
      }
      case 'rank': {
        try {
          const [top, mine] = await Promise.all([hub.store.topCoin(20), hub.store.coinRank(session.id)]);
          hub.send(session, { t: 'coin', a: 'rank', top, mine });
        } catch (err) {
          console.error('coin rank failed:', err.message);
          return '랭킹을 불러오지 못했습니다.';
        }
        return null;
      }
      default:
        return coinErr('coin_bad');
    }
  };
}
