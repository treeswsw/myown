// Coin wallet on the hub (SPEC 22): award (22-2), swap / draw / buy / equip / rank (22-3..22-6).
// Nothing here knows a game; games call hub.award(room, mode, rows) once per finished round.
import { secureRng } from '../../shared/cards.js';
import { defaultEcon, normalizeEcon, coinsFor } from '../../shared/coin/rules.js';
import { draw as gachaDraw, COST, TEN, POOL_START, freeNow, freeNext } from '../../shared/coin/gacha.js';
import { item } from '../../shared/coin/shop.js';
import { capsule, COST as CAP_COST, TEN as CAP_TEN, CRAFT, trashKingDue } from '../../shared/coin/capsule.js';
import { ROWS, priceOf, periodOf, leftOf, rollRow } from '../../shared/coin/stock.js';
import { parseCoin } from '../../shared/coin/protocol.js';

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
  shop_gone: '진열이 바뀌었습니다.',
  shop_own: '이미 가지고 있습니다.',
  shop_not: '가지고 있지 않습니다.',
};
export const coinErr = (code) => ({ msg: ERR[code], code });

// Personal shop stock (SPEC 22-18): roll lazily for the current periods, keep in user.gear.stock.
export function stockOf(user, hub) {
  const g = user.gear ?? (user.gear = {});
  const now = hub?.now ? hub.now() : 0;
  const rng = hub?.rng ?? secureRng;
  if (!g.stock || typeof g.stock !== 'object') g.stock = {};
  const st = g.stock;
  const valid = (r) => st[r] && Number.isInteger(st[r].p) && Array.isArray(st[r].ids);
  const fresh = (r) => valid(r) && st[r].p === periodOf(ROWS[r], now);
  const owned = g.owned ?? [];
  let rolled = false;
  for (const [r, o] of [['b', 'a'], ['a', 'b']]) {
    if (fresh(r)) continue;
    const other = fresh(o) ? st[o].ids : [];
    st[r] = { p: periodOf(ROWS[r], now), ids: rollRow(rng, ROWS[r], owned, other) };
    rolled = true;
  }
  if (rolled) { try { hub?.persist?.(user); } catch { /* saved on the next change */ } }
  return {
    a: { ids: [...st.a.ids], left: leftOf(ROWS.a, st.a.p, now) },
    b: { ids: [...st.b.ids], left: leftOf(ROWS.b, st.b.p, now) },
  };
}

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
    shard: g.shard ?? 0,
    cpity: g.cpity ?? 0,
    pos: { ...(g.pos ?? {}) },
    owned: [...(g.owned ?? [])],
    equip: { ...(g.equip ?? {}) },
    hasPin: !!user.pin,
    chipsPerCoin: hub?.econ ? hub.econ().chipsPerCoin : defaultEcon().chipsPerCoin,
    stock: stockOf(user, hub),
  };
}

export function installWallet(hub) {
  const lastEarn = new Map(); // `${id}|${mode}` -> time of the last paid award
  const lastDraw = new Map(); // id -> time of the last draw request
  const lastCap = new Map(); // id -> time of the last cap request
  const lastPos = new Map(); // id -> [times] of recent pos requests
  const lastStock = new Map(); // id -> time of the last stock request

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

  // 관리자 경제 설정 (SPEC 21-7): 시작 때 저장소에서 읽고, 바뀌면 바로 이 변수만 바꾼다(재시작 없음).
  let econ = defaultEcon();
  hub.econ = () => econ;
  hub.coinRules = () => econ.rules;
  Promise.resolve()
    .then(() => hub.store.getMeta('econ'))
    .then((v) => { if (v) econ = normalizeEcon(v); })
    .catch((err) => console.error('econ load failed:', err.message));
  // 새 설정(검사를 마친 것)을 적용하고 저장한다. 저장이 실패해도 지금 서버에서는 적용된다.
  hub.setEcon = async (next) => {
    econ = normalizeEcon(next);
    try { await hub.store.setMeta('econ', econ); } catch (err) { console.error('econ save failed:', err.message); }
    return econ;
  };

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
    const rules = econ.rules;
    if (!Object.hasOwn(rules, mode) || !room || hasBot(room)) return;
    const t = hub.now();
    for (const row of rows ?? []) {
      const session = hub.sessions.get(row.id);
      if (!session || session.bot || String(row.id).startsWith('~bot')) continue;
      const won = !!row.won;
      const n = coinsFor(mode, { won, opp: row.opp }, rules);
      const key = `${row.id}|${mode}`;
      const last = lastEarn.get(key);
      const gap = last !== undefined && t - last < rules[mode].gapMs;
      if (n <= 0 || gap) {
        // 판이 끝났는데 못 받은 사람에게도 짧게 알린다(0 코인). why: 'gap' = 같은 게임을 너무 빨리 또 함.
        hub.send(session, { t: 'coin', a: 'got', n: 0, mode, win: won, ...(n > 0 ? { why: 'gap' } : {}) });
        continue;
      }
      lastEarn.set(key, t);
      const u = session.user;
      u.coins = (u.coins ?? 0) + n;
      u.coinsTotal = (u.coinsTotal ?? 0) + n;
      changed(session, { kind: 'earn', delta: n, bal: u.coins, note: { mode, win: won } });
      hub.send(session, { t: 'coin', a: 'got', n, mode, win: won });
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

  // Capsule news (SPEC 22-16): g=3 -> people in the lobby, g=4 -> everyone.
  function capNews(session, pull, name) {
    if (session.id === ADMIN_ID) return;
    const msg = { t: 'coin', a: 'news', name, item: pull.id, g: pull.g };
    for (const s of hub.sessions.values()) {
      if (!s.conn || s === session || s.bot) continue;
      if (pull.g >= 4 || !s.room) hub.send(s, msg);
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
        const chips = m.n * econ.chipsPerCoin;
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
      case 'cap': {
        const t = hub.now();
        const last = lastCap.get(session.id);
        if (last !== undefined && t - last < DRAW_GAP_MS) return null; // silently ignored
        lastCap.set(session.id, t);
        const e = needOut();
        if (e) return e;
        const cost = CAP_COST * (m.n === 10 ? CAP_TEN : 1);
        if (u.coins < cost) return coinErr('coin_low');
        const r = capsule(hub.rng, m.n, g.cpity ?? 0, g.owned);
        u.coins -= cost;
        g.cpity = r.cpity;
        g.shard = (g.shard ?? 0) + r.shard;
        for (const p of r.pulls) if (!p.dup && !g.owned.includes(p.id)) g.owned.push(p.id);
        const got = [];
        if (trashKingDue(g.owned)) { g.owned.push('title.trashking'); got.push('title.trashking'); }
        changed(session, { kind: 'cap', delta: -cost, bal: u.coins, note: { ids: r.pulls.map((p) => p.id) } });
        const reply = { t: 'coin', a: 'cap', pulls: r.pulls, shard: g.shard, cpity: g.cpity };
        if (got.length) reply.got = got;
        hub.send(session, reply);
        for (const p of r.pulls) if (p.g >= 3) capNews(session, p, u.name);
        return null;
      }
      case 'craft': {
        const e = needOut();
        if (e) return e;
        const it = item(m.id);
        if (!it || it.g !== 3 || it.cap !== true) return coinErr('shop_no');
        if (g.owned.includes(it.id)) return coinErr('shop_own');
        if ((g.shard ?? 0) < CRAFT) return coinErr('coin_low');
        g.shard -= CRAFT;
        g.owned.push(it.id);
        const got = [];
        if (trashKingDue(g.owned)) { g.owned.push('title.trashking'); got.push('title.trashking'); }
        changed(session, { kind: 'craft', delta: 0, bal: u.coins, note: { item: it.id, shard: CRAFT } });
        const reply = { t: 'coin', a: 'craft', id: it.id, shard: g.shard };
        if (got.length) reply.got = got;
        hub.send(session, reply);
        return null;
      }
      case 'pos': {
        // Over 5/sec: silently dropped. On success only `me` is resent (no extra reply).
        const t = hub.now();
        const recent = (lastPos.get(session.id) ?? []).filter((x) => t - x < 1000);
        if (recent.length >= 5) { lastPos.set(session.id, recent); return null; }
        recent.push(t);
        lastPos.set(session.id, recent);
        const it = item(m.id);
        if (!it || it.art?.type !== 'sticker') return coinErr('shop_no');
        if (!g.owned.includes(it.id)) return coinErr('shop_not');
        const c = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        (g.pos ?? (g.pos = {}))[it.id] = { x: c(m.x, -0.5, 0.5), y: c(m.y, -0.5, 0.5), s: c(m.s, 0.3, 2), r: c(m.r, -180, 180) };
        changed(session, null);
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
        const price = it ? priceOf(it) : null;
        if (price === null) return coinErr('shop_no');
        const st = stockOf(u, hub);
        if (!st.a.ids.includes(it.id) && !st.b.ids.includes(it.id)) return coinErr('shop_gone');
        if (g.owned.includes(it.id)) return coinErr('shop_own');
        if (u.coins < price) return coinErr('coin_low');
        u.coins -= price;
        g.owned.push(it.id);
        changed(session, { kind: 'buy', delta: -price, bal: u.coins, note: { item: it.id } });
        hub.send(session, { t: 'coin', a: 'buy', id: it.id });
        return null;
      }
      case 'stock': {
        const t = hub.now();
        const last = lastStock.get(session.id);
        if (last !== undefined && t - last < 1000) return null; // silently ignored
        lastStock.set(session.id, t);
        hub.sendMe(session);
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
