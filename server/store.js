import pg from 'pg';

export const START_BANK = 10_000;

export function newUser(id, name) {
  return {
    id, name, bank: START_BANK, avatar: null,
    stats: { hands: 0, wins: 0, biggestWin: 0, refills: 0, bluffGames: 0, bluffWins: 0 },
    coins: 0, coinsTotal: 0, gear: { pity: 0, owned: [], equip: {}, shard: 0, cpity: 0, pos: {} }, pin: null,
  };
}

// Old-shape users (before SPEC 22) read with defaults. Always returns a fresh gear object.
export function normalizeUser(u) {
  const g = u.gear && typeof u.gear === 'object' ? u.gear : {};
  u.coins = Number.isInteger(u.coins) ? u.coins : 0;
  u.coinsTotal = Number.isInteger(u.coinsTotal) ? u.coinsTotal : 0;
  u.gear = { ...g, pity: Number.isInteger(g.pity) ? g.pity : 0, owned: Array.isArray(g.owned) ? g.owned : [], equip: g.equip && typeof g.equip === 'object' ? g.equip : {},
    shard: Number.isInteger(g.shard) && g.shard >= 0 ? g.shard : 0,
    cpity: Number.isInteger(g.cpity) && g.cpity >= 0 ? g.cpity : 0,
    pos: g.pos && typeof g.pos === 'object' && !Array.isArray(g.pos) ? g.pos : {} };
  u.pin = u.pin ?? null;
  return u;
}

const LEDGER_MAX = 10_000;
const ledgerRow = (e) => ({
  uid: e.uid, kind: e.kind, delta: e.delta | 0, bal: e.bal | 0, chips: e.chips | 0, note: e.note ?? null,
});

// Overall liar ranking order: score desc, then fewer games, then name (plain code-unit order). Zero scores are left out.
const liarScore = (u) => u.stats?.liar?.score ?? 0;
const liarGames = (u) => u.stats?.liar?.games ?? 0;
// The admin account (SPEC 21) plays against bots, so it never appears in a public ranking (2026-11-13 user request).
// Same value as ADMIN_ID in server/admin/bots.js (not imported: bots.js imports this file).
export const RANK_EXCLUDED_ID = '관리자';
function liarList(users) {
  return [...users.values()].filter((u) => u.id !== RANK_EXCLUDED_ID && liarScore(u) > 0).sort((a, b) =>
    liarScore(b) - liarScore(a) || liarGames(a) - liarGames(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// Coin ranking order: coins_total desc, then name (plain code-unit order). Zero totals and the admin account are left out.
function coinList(users) {
  return [...users.values()].filter((u) => u.id !== RANK_EXCLUDED_ID && (u.coinsTotal ?? 0) > 0).sort((a, b) =>
    b.coinsTotal - a.coinsTotal || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function createMemoryStore() {
  const users = new Map();
  let ledger = [];
  const meta = new Map();
  return {
    async init() {},
    async getMeta(k) { return meta.has(k) ? structuredClone(meta.get(k)) : null; },
    async setMeta(k, v) { meta.set(k, structuredClone(v)); },
    // Newest first. `at` is epoch ms.
    async ledgerFor(uid, kind, n) {
      return ledger.filter((e) => e.uid === uid && e.kind === kind).slice(-n).reverse()
        .map((e) => ({ at: e.at.getTime(), delta: e.delta, chips: e.chips, note: structuredClone(e.note) }));
    },
    // Without a name this only reads: returns null when the account does not exist (never creates a nameless row).
    async getOrCreate(id, name) {
      if (!users.has(id)) {
        if (name === undefined) return null;
        users.set(id, newUser(id, name));
      }
      return normalizeUser(structuredClone(users.get(id)));
    },
    async save(user) {
      users.set(user.id, normalizeUser(structuredClone(user)));
    },
    async log(entry) {
      ledger.push({ at: new Date(), ...ledgerRow(entry) });
      if (ledger.length > LEDGER_MAX) ledger = ledger.slice(-LEDGER_MAX);
    },
    ledger() { return structuredClone(ledger); }, // memory store only (tests)
    async exists(id) { return users.has(id); },
    async topCoin(n) {
      return coinList(users).slice(0, n).map((u) => ({ name: u.name, total: u.coinsTotal }));
    },
    async coinRank(id) {
      const i = coinList(users).findIndex((u) => u.id === id);
      return { rank: i < 0 ? null : i + 1, total: users.has(id) ? (users.get(id).coinsTotal ?? 0) : 0 };
    },
    async clearPin(id) {
      const u = users.get(id);
      if (!u) return false;
      u.pin = null;
      return true;
    },
    topLiar(n) {
      return liarList(users).slice(0, n).map((u) => ({ name: u.name, score: liarScore(u), games: liarGames(u) }));
    },
    liarRank(id) {
      const i = liarList(users).findIndex((u) => u.id === id);
      return { rank: i < 0 ? null : i + 1, score: users.has(id) ? liarScore(users.get(id)) : 0 };
    },
    async clear() {
      users.clear();
      ledger = [];
      meta.clear();
    },
    async close() {},
  };
}

const USER_COLS = 'id, name, bank, avatar, stats, coins, coins_total, gear, pin';
const COIN_TOP_SQL = `SELECT name, coins_total AS total FROM users
  WHERE coins_total > 0 AND id <> $2 ORDER BY coins_total DESC, name COLLATE "C" ASC LIMIT $1`;
const COIN_RANK_SQL = `SELECT u.coins_total AS total, CASE WHEN u.coins_total > 0 THEN t.rank END AS rank
  FROM users u LEFT JOIN (
    SELECT id, row_number() OVER (ORDER BY coins_total DESC, name COLLATE "C" ASC) AS rank
    FROM users WHERE id <> $2) t ON t.id = u.id
  WHERE u.id = $1`;

const LIAR_SCORE = "COALESCE((stats->'liar'->>'score')::integer, 0)";
const LIAR_GAMES = "COALESCE((stats->'liar'->>'games')::integer, 0)";
const LIAR_TOP_SQL = `SELECT name, ${LIAR_SCORE} AS score, ${LIAR_GAMES} AS games FROM users
  WHERE ${LIAR_SCORE} > 0 AND id <> $2 ORDER BY score DESC, games ASC, name COLLATE "C" ASC LIMIT $1`;
const LIAR_RANK_SQL = `SELECT score, CASE WHEN score > 0 THEN rank END AS rank FROM (
  SELECT id, ${LIAR_SCORE} AS score,
    row_number() OVER (ORDER BY ${LIAR_SCORE} DESC, ${LIAR_GAMES} ASC, name COLLATE "C" ASC) AS rank
  FROM users WHERE id <> $2) t WHERE id = $1`;

function createPgStore(url) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : true });
  pool.on('error', (err) => console.error('db pool error:', err.message));
  // Saves are applied in call order so an older snapshot never overwrites a newer one.
  let writes = Promise.resolve();
  // id -> the avatar this process last wrote to the row (saves run one at a time, so this is what the row holds).
  // A save with the same avatar leaves that column out, so the photo (up to 60KB) is not sent to the database on
  // every chip / stat / coin save (review S3). The first save after a start writes it whole.
  const storedAvatar = new Map();
  const rowToUser = (r) => normalizeUser({
    id: r.id, name: r.name, bank: r.bank, avatar: r.avatar, stats: r.stats,
    coins: r.coins, coinsTotal: r.coins_total, gear: r.gear, pin: r.pin,
  });
  // Queue a statement behind pending writes; the returned promise carries its result/failure, the chain survives failure.
  const queue = (fn) => {
    writes = writes.then(fn);
    const done = writes;
    writes = writes.catch(() => {});
    return done;
  };
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        name text NOT NULL,
        bank integer NOT NULL,
        avatar text,
        stats jsonb NOT NULL
      )`);
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_total integer NOT NULL DEFAULT 0');
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gear jsonb NOT NULL DEFAULT '{}'");
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pin jsonb');
      await pool.query(`CREATE TABLE IF NOT EXISTS coin_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        uid text NOT NULL,
        kind text NOT NULL,
        delta integer NOT NULL,
        bal integer NOT NULL,
        chips integer NOT NULL DEFAULT 0,
        note jsonb
      )`);
      await pool.query('CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v jsonb)');
    },
    async getMeta(k) {
      await writes.catch(() => {});
      const { rows } = await pool.query('SELECT v FROM meta WHERE k = $1', [k]);
      return rows[0] ? rows[0].v : null;
    },
    setMeta(k, v) {
      return queue(() => pool.query(
        'INSERT INTO meta (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2', [k, JSON.stringify(v)],
      ));
    },
    async ledgerFor(uid, kind, n) {
      await writes.catch(() => {});
      const { rows } = await pool.query(
        'SELECT at, delta, chips, note FROM coin_log WHERE uid = $1 AND kind = $2 ORDER BY id DESC LIMIT $3', [uid, kind, n],
      );
      return rows.map((r) => ({ at: new Date(r.at).getTime(), delta: r.delta, chips: r.chips, note: r.note }));
    },
    // Without a name this only reads: returns null when the account does not exist (a NULL name would break NOT NULL).
    async getOrCreate(id, name) {
      if (name === undefined) {
        const { rows } = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
        return rows[0] ? rowToUser(rows[0]) : null;
      }
      const fresh = newUser(id, name);
      await pool.query(
        'INSERT INTO users (id, name, bank, avatar, stats, coins, coins_total, gear, pin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
        [id, name, fresh.bank, null, fresh.stats, 0, 0, fresh.gear, null],
      );
      const { rows } = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
      return rowToUser(rows[0]);
    },
    save(user) {
      const u = normalizeUser(structuredClone(user));
      const avatar = u.avatar ?? null;
      const upsert = () => pool.query(
        `INSERT INTO users (id, name, bank, avatar, stats, coins, coins_total, gear, pin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET name = $2, bank = $3, avatar = $4, stats = $5, coins = $6, coins_total = $7, gear = $8, pin = $9`,
        [u.id, u.name, u.bank, u.avatar, u.stats, u.coins, u.coinsTotal, u.gear, u.pin],
      ).then((res) => { storedAvatar.set(u.id, avatar); return res; });
      return queue(async () => {
        if (!storedAvatar.has(u.id) || storedAvatar.get(u.id) !== avatar) return upsert();
        const res = await pool.query(
          'UPDATE users SET name = $2, bank = $3, stats = $4, coins = $5, coins_total = $6, gear = $7, pin = $8 WHERE id = $1',
          [u.id, u.name, u.bank, u.stats, u.coins, u.coinsTotal, u.gear, u.pin],
        );
        return res.rowCount > 0 ? res : upsert(); // the row is gone (wiped): write it whole
      });
    },
    // Ledger line, queued with the saves (order kept). A failure only reaches the console; the game goes on.
    log(entry) {
      const r = ledgerRow(entry);
      return queue(() => pool.query(
        'INSERT INTO coin_log (uid, kind, delta, bal, chips, note) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.uid, r.kind, r.delta, r.bal, r.chips, r.note],
      )).catch((err) => console.error('coin_log error:', err.message));
    },
    async exists(id) {
      await writes.catch(() => {});
      const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async topCoin(n) {
      await writes.catch(() => {});
      const { rows } = await pool.query(COIN_TOP_SQL, [n, RANK_EXCLUDED_ID]);
      return rows.map((r) => ({ name: r.name, total: Number(r.total) }));
    },
    async coinRank(id) {
      await writes.catch(() => {});
      const { rows } = await pool.query(COIN_RANK_SQL, [id, RANK_EXCLUDED_ID]);
      return rows[0] ? { rank: rows[0].rank === null ? null : Number(rows[0].rank), total: Number(rows[0].total) } : { rank: null, total: 0 };
    },
    async clearPin(id) {
      const { rowCount } = await queue(() => pool.query('UPDATE users SET pin = NULL WHERE id = $1', [id]));
      return rowCount > 0;
    },
    // Read-only liar ranking, queued behind pending saves so it sees them. No table or column is created or changed.
    async topLiar(n) {
      await writes.catch(() => {});
      const { rows } = await pool.query(LIAR_TOP_SQL, [n, RANK_EXCLUDED_ID]);
      return rows.map((r) => ({ name: r.name, score: Number(r.score), games: Number(r.games) }));
    },
    async liarRank(id) {
      await writes.catch(() => {});
      const { rows } = await pool.query(LIAR_RANK_SQL, [id, RANK_EXCLUDED_ID]);
      return rows[0] ? { rank: rows[0].rank === null ? null : Number(rows[0].rank), score: Number(rows[0].score) } : { rank: null, score: 0 };
    },
    // Queued behind pending saves so none of them can land after the wipe.
    clear() {
      return queue(() => pool.query('TRUNCATE users, coin_log, meta').then((res) => { storedAvatar.clear(); return res; }));
    },
    async close() {
      await writes;
      await pool.end();
    },
  };
}

export function createStore(databaseUrl) {
  return databaseUrl ? createPgStore(databaseUrl) : createMemoryStore();
}
