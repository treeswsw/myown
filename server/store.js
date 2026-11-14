import pg from 'pg';
import { isSpectatorId } from '../shared/spectator.js';

export const START_BANK = 10_000;

// 체스 퍼즐 기록 (docs/mini/PLAN.md 6절): r 레이팅, n 푼 문제 수, streak 연속 정답, best 최고 연속, recent 최근 문제 id(최대 200)
export const PUZZLE_START = 1500;
export const PUZZLE_RECENT = 200;
export const newPuzzle = () => ({ r: PUZZLE_START, n: 0, streak: 0, best: 0, recent: [] });
function normalizePuzzle(p) {
  const q = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  const int = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);
  return {
    r: Number.isInteger(q.r) && q.r > 0 ? q.r : PUZZLE_START, n: int(q.n, 0), streak: int(q.streak, 0), best: int(q.best, 0),
    recent: Array.isArray(q.recent) ? q.recent.filter((x) => typeof x === 'string').slice(-PUZZLE_RECENT) : [],
  };
}

// 혼자 놀기 기록 (docs/solo/PLAN.md 4-1): { [종목 id]: { best, at, n, wk, wbest, wat } }
// best 최고 점수, at 그 기록을 세운 시각(ms), n 끝낸 판 수, wk 주 번호(shared/solo/coin.js weekOf), wbest·wat 그 주의 최고와 시각.
export const newSolo = () => ({});
const SOLO_ID_RE = /^[a-z0-9][a-z0-9_]{0,23}$/; // __proto__ 같은 키는 걸러진다
function normalizeSolo(s) {
  const out = {};
  if (!s || typeof s !== 'object' || Array.isArray(s)) return out;
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  for (const [id, r] of Object.entries(s)) {
    if (!SOLO_ID_RE.test(id) || !r || typeof r !== 'object' || Array.isArray(r)) continue;
    out[id] = { best: int(r.best), at: int(r.at), n: int(r.n), wk: int(r.wk), wbest: int(r.wbest), wat: int(r.wat) };
  }
  return out;
}

export function newUser(id, name) {
  return {
    id, name, bank: START_BANK, avatar: null,
    stats: { hands: 0, wins: 0, biggestWin: 0, bluffGames: 0, bluffWins: 0 },
    coins: 0, coinsTotal: 0, gear: { pity: 0, owned: [], equip: {}, shard: 0, cpity: 0, pos: {} }, pin: null,
    puzzle: newPuzzle(), solo: newSolo(),
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
  u.puzzle = normalizePuzzle(u.puzzle);
  u.solo = normalizeSolo(u.solo);
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

// 혼자 놀기 순위 (docs/solo/PLAN.md 4-1): 점수 내림차순, 같으면 먼저 세운 사람(at 오름차순), 그래도 같으면 아이디. 0점·관리자·관전 계정은 뺀다.
// week 를 주면 wk === week 인 사람의 wbest/wat 로, 없으면 best/at 으로.
function soloEntry(u, game, week) {
  const r = u.solo?.[game];
  if (!r) return { score: 0, at: 0 };
  if (week === null || week === undefined) return { score: r.best, at: r.at };
  return r.wk === week ? { score: r.wbest, at: r.wat } : { score: 0, at: 0 };
}
function soloList(users, game, week) {
  return [...users.values()].filter((u) => u.id !== RANK_EXCLUDED_ID && !isSpectatorId(u.id))
    .map((u) => ({ u, ...soloEntry(u, game, week) })).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at || (a.u.id < b.u.id ? -1 : a.u.id > b.u.id ? 1 : 0));
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
    // 그날(day) 이 mode 로 받은 코인 합 (note.mode, note.day). 하루 상한 셈에 쓴다.
    async earnedOn(uid, mode, day) {
      return ledger.filter((e) => e.uid === uid && e.kind === 'earn' && e.note?.mode === mode && e.note?.day === day).reduce((n, e) => n + e.delta, 0);
    },
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
    // 혼자 놀기 순위. topSolo -> [{name, score, at}], soloRank -> {rank|null, score, at, n(순위에 오른 사람 수)}
    async topSolo(game, n, week = null) {
      return soloList(users, game, week).slice(0, n).map((x) => ({ name: x.u.name, score: x.score, at: x.at }));
    },
    async soloRank(id, game, week = null) {
      const list = soloList(users, game, week);
      const i = list.findIndex((x) => x.u.id === id);
      const me = users.has(id) ? soloEntry(users.get(id), game, week) : { score: 0, at: 0 };
      return { rank: i < 0 ? null : i + 1, score: me.score, at: me.at, n: list.length };
    },
    async clear() {
      users.clear();
      ledger = [];
      meta.clear();
    },
    async close() {},
  };
}

const USER_COLS = 'id, name, bank, avatar, stats, coins, coins_total, gear, pin, puzzle, solo';
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

// 혼자 놀기 순위 SQL: $1 종목 id, $2 제외 계정(관리자), $3 주 번호(null 이면 전체). 사용자 수가 적어 색인 없이.
const SOLO_RE = '^관전[0-9]+$';
const SOLO_BASE = `SELECT id, name,
    CASE WHEN $3::bigint IS NULL THEN COALESCE((solo->$1::text->>'best')::bigint, 0)
         WHEN (solo->$1::text->>'wk')::bigint = $3::bigint THEN COALESCE((solo->$1::text->>'wbest')::bigint, 0) ELSE 0 END AS score,
    CASE WHEN $3::bigint IS NULL THEN COALESCE((solo->$1::text->>'at')::bigint, 0)
         ELSE COALESCE((solo->$1::text->>'wat')::bigint, 0) END AS at
  FROM users WHERE id <> $2 AND id !~ '${SOLO_RE}'`;
const SOLO_TOP_SQL = `SELECT name, score, at FROM (${SOLO_BASE}) t WHERE score > 0 ORDER BY score DESC, at ASC, id COLLATE "C" ASC LIMIT $4`;
const SOLO_RANK_SQL = `SELECT id, score, at, CASE WHEN score > 0 THEN rank END AS rank, n FROM (
  SELECT id, score, at, row_number() OVER (ORDER BY score DESC, at ASC, id COLLATE "C" ASC) AS rank,
    count(*) FILTER (WHERE score > 0) OVER () AS n FROM (${SOLO_BASE}) b) t WHERE id = $4`;

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
    coins: r.coins, coinsTotal: r.coins_total, gear: r.gear, pin: r.pin, puzzle: r.puzzle, solo: r.solo,
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
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS puzzle jsonb');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS solo jsonb');
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
        'INSERT INTO users (id, name, bank, avatar, stats, coins, coins_total, gear, pin, puzzle, solo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING',
        [id, name, fresh.bank, null, fresh.stats, 0, 0, fresh.gear, null, fresh.puzzle, fresh.solo],
      );
      const { rows } = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
      return rowToUser(rows[0]);
    },
    save(user) {
      const u = normalizeUser(structuredClone(user));
      const avatar = u.avatar ?? null;
      const upsert = () => pool.query(
        `INSERT INTO users (id, name, bank, avatar, stats, coins, coins_total, gear, pin, puzzle, solo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = $2, bank = $3, avatar = $4, stats = $5, coins = $6, coins_total = $7, gear = $8, pin = $9, puzzle = $10, solo = $11`,
        [u.id, u.name, u.bank, u.avatar, u.stats, u.coins, u.coinsTotal, u.gear, u.pin, u.puzzle, u.solo],
      ).then((res) => { storedAvatar.set(u.id, avatar); return res; });
      return queue(async () => {
        if (!storedAvatar.has(u.id) || storedAvatar.get(u.id) !== avatar) return upsert();
        const res = await pool.query(
          'UPDATE users SET name = $2, bank = $3, stats = $4, coins = $5, coins_total = $6, gear = $7, pin = $8, puzzle = $9, solo = $10 WHERE id = $1',
          [u.id, u.name, u.bank, u.stats, u.coins, u.coinsTotal, u.gear, u.pin, u.puzzle, u.solo],
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
    async earnedOn(uid, mode, day) {
      await writes.catch(() => {});
      const { rows } = await pool.query(
        "SELECT COALESCE(SUM(delta), 0) AS n FROM coin_log WHERE uid = $1 AND kind = 'earn' AND note->>'mode' = $2 AND (note->>'day') = $3", [uid, mode, String(day)],
      );
      return Number(rows[0]?.n ?? 0);
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
    // 혼자 놀기 순위 (읽기 전용, 저장 줄 뒤에 읽어 방금 저장을 본다).
    async topSolo(game, n, week = null) {
      await writes.catch(() => {});
      const { rows } = await pool.query(SOLO_TOP_SQL, [game, RANK_EXCLUDED_ID, week, n]);
      return rows.map((r) => ({ name: r.name, score: Number(r.score), at: Number(r.at) }));
    },
    async soloRank(id, game, week = null) {
      await writes.catch(() => {});
      const { rows } = await pool.query(SOLO_RANK_SQL, [game, RANK_EXCLUDED_ID, week, id]);
      const r = rows[0];
      return r ? { rank: r.rank === null ? null : Number(r.rank), score: Number(r.score), at: Number(r.at), n: Number(r.n) } : { rank: null, score: 0, at: 0, n: 0 };
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
