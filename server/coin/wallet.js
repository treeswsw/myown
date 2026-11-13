// Coin wallet on the hub (SPEC 22): award (22-2), swap / draw / buy / equip / rank (22-3..22-6).
// Nothing here knows a game; games call hub.award(room, mode, rows) once per finished round.
import { COIN_RULES, coinsFor } from '../../shared/coin/rules.js';
import { draw as gachaDraw, COST, TEN, POOL_START, freeNow, freeNext } from '../../shared/coin/gacha.js';
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
  coin_free: '무료 뽑기가 없습니다.',
  shop_no: '없는 물건입니다.',
  shop_own: '이미 가지고 있습니다.',
  shop_not: '가지고 있지 않습니다.',
};
export const coinErr = (code) => ({ msg: ERR[code], code });

// The wallet part of `me`. Never carries the pin record.
export function walletOf(user, hub) {
  const g = user.gear ?? {};
  const now = hub?.now ? hub.now() : 0;
  const f = freeNow(g.free, now);
  return {
    free: { n: f.n, next: freeNext(f, now) },
    pool: hub?.pool ?? POOL_START,
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

  // Vault (금고): loaded once, kept on the hub, saved on every change.
  hub.pool = POOL_START;
  const poolReady = Promise.resolve()
    .then(() => hub.store.getMeta('pool'))
    .then((v) => { if (Number.isInteger(v) && v >= POOL_START) hub.pool = v; })
    .catch((err) => console.error('pool load failed:', err.message));
  function savePool() {
    try {
      const p = hub.store.setMeta('pool', hub.pool);
      if (p && typeof p.catch === 'function') p.catch((err) => console.error('pool save failed:', err.message));
    } catch (err) {
      console.error('pool save failed:', err.message);
    }
  }

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
      if (pull.tier >= 4 || !s.room) hub.send(s, msg);
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
        await poolReady;
        const fr = freeNow(g.free, t);
        let cost = COST * (m.n === 10 ? TEN : 1);
        if (m.free) {
          if (fr.n < 1) return coinErr('coin_free');
          cost = 0;
        } else if (u.coins < cost) return coinErr('coin_low');
        // Worst case: the whole vault plus the best fixed prize on every other card.
        if (u.bank + hub.pool + m.n * 10_000 > MAX_CHIPS) return coinErr('coin_max');
        const r = gachaDraw(hub.rng, m.n, g.pity, hub.pool);
        u.coins -= cost;
        u.bank += r.chips;
        g.pity = r.pity;
        if (m.free) g.free = fr.n >= 2 ? { n: 1, at: t } : { n: fr.n - 1, at: fr.at };
        else g.free = fr;
        const poolChanged = r.pool !== hub.pool;
        hub.pool = r.pool;
        if (poolChanged) savePool();
        if (r.jackpot && !g.owned.includes('title.jackpot')) g.owned.push('title.jackpot');
        const best = Math.max(...r.pulls.map((p) => p.tier));
        changed(session, {
          kind: 'draw', delta: -cost, bal: u.coins, chips: r.chips,
          note: { n: m.n, best, free: !!m.free, pulls: r.pulls.map((p) => p.chips) },
        });
        hub.send(session, { t: 'coin', a: 'draw', pulls: r.pulls, chips: r.chips, pity: r.pity, pool: r.pool, free: { n: g.free.n, at: g.free.at } });
        for (const p of r.pulls) if (p.tier >= 3) news(session, p, u.name);
        return null;
      }
      case 'hist': {
        try {
          const rows = await hub.store.ledgerFor(session.id, 'draw', 50);
          const list = rows.map((r) => ({
            at: r.at, n: r.note?.n ?? r.note?.pulls?.length ?? 1, chips: r.chips, best: r.note?.best ?? 0,
          }));
          hub.send(session, { t: 'coin', a: 'hist', list });
        } catch (err) {
          console.error('coin hist failed:', err.message);
          return '기록을 불러오지 못했습니다.';
        }
        return null;
      }
      case 'buy': {
        const e = needOut();
        if (e) return e;
        const it = item(m.id);
        if (!it || it.shop === false) return coinErr('shop_no');
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
