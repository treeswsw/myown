import pg from 'pg';

export const START_BANK = 10_000;

export function newUser(id, name) {
  return {
    id, name, bank: START_BANK, avatar: null,
    stats: { hands: 0, wins: 0, biggestWin: 0, refills: 0, bluffGames: 0, bluffWins: 0 },
  };
}

// Overall liar ranking order: score desc, then fewer games, then name (plain code-unit order). Zero scores are left out.
const liarScore = (u) => u.stats?.liar?.score ?? 0;
const liarGames = (u) => u.stats?.liar?.games ?? 0;
function liarList(users) {
  return [...users.values()].filter((u) => liarScore(u) > 0).sort((a, b) =>
    liarScore(b) - liarScore(a) || liarGames(a) - liarGames(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function createMemoryStore() {
  const users = new Map();
  return {
    async init() {},
    async getOrCreate(id, name) {
      if (!users.has(id)) users.set(id, newUser(id, name));
      return structuredClone(users.get(id));
    },
    async save(user) {
      users.set(user.id, structuredClone(user));
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
    },
    async close() {},
  };
}

const LIAR_SCORE = "COALESCE((stats->'liar'->>'score')::integer, 0)";
const LIAR_GAMES = "COALESCE((stats->'liar'->>'games')::integer, 0)";
const LIAR_TOP_SQL = `SELECT name, ${LIAR_SCORE} AS score, ${LIAR_GAMES} AS games FROM users
  WHERE ${LIAR_SCORE} > 0 ORDER BY score DESC, games ASC, name COLLATE "C" ASC LIMIT $1`;
const LIAR_RANK_SQL = `SELECT score, CASE WHEN score > 0 THEN rank END AS rank FROM (
  SELECT id, ${LIAR_SCORE} AS score,
    row_number() OVER (ORDER BY ${LIAR_SCORE} DESC, ${LIAR_GAMES} ASC, name COLLATE "C" ASC) AS rank
  FROM users) t WHERE id = $1`;

function createPgStore(url) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : true });
  pool.on('error', (err) => console.error('db pool error:', err.message));
  // Saves are applied in call order so an older snapshot never overwrites a newer one.
  let writes = Promise.resolve();
  const rowToUser = (r) => ({ id: r.id, name: r.name, bank: r.bank, avatar: r.avatar, stats: r.stats });
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        name text NOT NULL,
        bank integer NOT NULL,
        avatar text,
        stats jsonb NOT NULL
      )`);
    },
    async getOrCreate(id, name) {
      const fresh = newUser(id, name);
      await pool.query(
        'INSERT INTO users (id, name, bank, avatar, stats) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
        [id, name, fresh.bank, null, fresh.stats],
      );
      const { rows } = await pool.query('SELECT id, name, bank, avatar, stats FROM users WHERE id = $1', [id]);
      return rowToUser(rows[0]);
    },
    save(user) {
      const params = [user.id, user.name, user.bank, user.avatar, user.stats];
      writes = writes.then(() => pool.query(
        `INSERT INTO users (id, name, bank, avatar, stats) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET name = $2, bank = $3, avatar = $4, stats = $5`,
        params,
      ));
      const done = writes;
      writes = writes.catch(() => {});
      return done;
    },
    // Read-only liar ranking, queued behind pending saves so it sees them. No table or column is created or changed.
    async topLiar(n) {
      await writes.catch(() => {});
      const { rows } = await pool.query(LIAR_TOP_SQL, [n]);
      return rows.map((r) => ({ name: r.name, score: Number(r.score), games: Number(r.games) }));
    },
    async liarRank(id) {
      await writes.catch(() => {});
      const { rows } = await pool.query(LIAR_RANK_SQL, [id]);
      return rows[0] ? { rank: rows[0].rank === null ? null : Number(rows[0].rank), score: Number(rows[0].score) } : { rank: null, score: 0 };
    },
    // Queued behind pending saves so none of them can land after the wipe.
    clear() {
      writes = writes.then(() => pool.query('TRUNCATE users'));
      const done = writes;
      writes = writes.catch(() => {});
      return done;
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
