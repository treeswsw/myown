import pg from 'pg';

export const START_BANK = 10_000;

export function newUser(id, name) {
  return {
    id, name, bank: START_BANK, avatar: null,
    stats: { hands: 0, wins: 0, biggestWin: 0, refills: 0, bluffGames: 0, bluffWins: 0 },
  };
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
    async clear() {
      users.clear();
    },
    async close() {},
  };
}

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
