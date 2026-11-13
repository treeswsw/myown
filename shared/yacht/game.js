// 요트다이스 규칙 엔진 (GDD 3·5-3·6·9절, SPEC 19절). 순수 함수 — 시계·DOM·네트워크·sim.js 에 기대지 않는다.
// 시간 제한과 자동 기록이 없다(timeout·autoPick 없음). 모든 함수는 { ok, error?, events } 를 돌려주고,
// ok:false 이면 상태는 바뀌지 않는다. rng = () => [0,1) (방이 hub.rng 를 넘긴다).
// 굴림 자리(place)와 뺀 주사위 자리(freeSpot)는 주입받는다 — 방이 sim.js 것을 넘긴다.
import { CATS, ROUNDS, MAX_ROLLS, DICE, MIN_PLAYERS, MAX_PLAYERS } from './constants.js';
import { scoreOf, previewOf, totals, comboOf } from './score.js';

const E_TURN = '내 차례가 아닙니다.';
const E_NOW = '지금은 할 수 없습니다.';
const E_NOROLL = '더 굴릴 수 없습니다.';
const E_NODICE = '굴릴 주사위가 없습니다.';
const E_NOKEEP = '지금은 보관할 수 없습니다.';
const E_FIRST = '먼저 주사위를 굴리세요.';
const E_FILLED = '이미 채운 칸입니다.';
const E_BAD = '잘못된 요청입니다.';

const ok = (events = []) => ({ ok: true, events });
const no = (error) => ({ ok: false, error, events: [] });
const emptyScores = () => Object.fromEntries(CATS.map((c) => [c, null]));
const copyDie = (d) => ({ v: d.v, slot: d.slot, x: d.x, z: d.z, yaw: d.yaw });

const cur = (g) => (g.phase === 'playing' ? g.cols[g.turnIdx] : null);
const alive = (g) => g.cols.filter((c) => !c.left);

// 차례인 사람의 요청인가. 아니면 문구.
function guard(g, id) {
  if (g.phase !== 'playing') return E_NOW;
  if (cur(g).id !== id) return E_TURN;
  return null;
}

function clearPick(g, id, events) {
  if (g.pick == null) return;
  g.pick = null;
  events.push({ k: 'ytPick', id, cat: null });
}

function startTurn(g, events) {
  g.rollsLeft = MAX_ROLLS;
  g.dice = null;
  g.shaking = false;
  g.pick = null;
  events.push({ k: 'ytTurn', id: g.cols[g.turnIdx].id, round: g.round });
}

function finish(g, reason, events) {
  const rows = alive(g).map((c) => ({ id: c.id, name: c.name, total: totals(c.scores).total }));
  rows.sort((a, b) => b.total - a.total);
  const ranks = rows.map((r, n) => ({ ...r, rank: n > 0 && r.total === rows[n - 1].total ? 0 : n + 1 }));
  for (let n = 1; n < ranks.length; n++) if (ranks[n].rank === 0) ranks[n].rank = ranks[n - 1].rank;
  const winners = ranks.filter((r) => r.rank === 1).map((r) => r.id);
  g.phase = 'result';
  g.round = g.rounds;
  g.rollsLeft = 0;
  g.dice = null;
  g.shaking = false;
  g.pick = null;
  g.result = { reason, ranks, winners };
  events.push({ k: 'ytEnd', reason, ranks: ranks.map((r) => ({ ...r })), winners: [...winners] });
}

// 다음 차례(기권한 사람은 건너뜀). 12바퀴가 끝나면 판 끝.
function advance(g, events) {
  for (let guardN = 0; guardN <= g.cols.length * 2; guardN++) {
    g.turnIdx++;
    if (g.turnIdx >= g.cols.length) { g.turnIdx = 0; g.round++; }
    if (g.round > g.rounds) { finish(g, 'done', events); return; }
    if (!g.cols[g.turnIdx].left) { startTurn(g, events); return; }
  }
  finish(g, 'alone', events); // 닿지 않는 길(남은 사람이 없는데 끝나지 않은 경우)
}

export function createGame({ players, rng, gameNo = 0, rounds = ROUNDS } = {}) {
  if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) return { ...no('2명 이상 필요합니다.'), game: null };
  if (new Set(players.map((p) => p.id)).size !== players.length) return { ...no(E_BAD), game: null };
  if (typeof rng !== 'function') throw new TypeError('rng required');
  const order = players.map((p) => ({ id: p.id, name: p.name }));
  for (let i = order.length - 1; i > 0; i--) { // 피셔-예이츠
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const game = {
    phase: 'playing', gameNo, rounds, round: 1, turnIdx: 0,
    cols: order.map((p) => ({ id: p.id, name: p.name, left: false, scores: emptyScores() })),
    rollsLeft: MAX_ROLLS, rollNo: 0, shaking: false, dice: null, pick: null, last: null, result: null,
  };
  const events = [{ k: 'ytStart', gameNo, order: order.map((p) => p.id) }];
  startTurn(game, events);
  return { ok: true, game, events };
}

export function shake(game, id, on) {
  const bad = guard(game, id);
  if (bad) return no(bad);
  if (typeof on !== 'boolean') return no(E_BAD);
  if (game.shaking === on) return ok();
  if (on) { // 굴릴 수 없는 때는 흔들 수 없다. 끄는 것은 언제나 된다.
    if (game.rollsLeft < 1) return no(E_NOROLL);
    if (game.dice && game.dice.every((d) => d.slot != null)) return no(E_NODICE);
  }
  game.shaking = on;
  return ok([{ k: 'ytShake', id, on }]);
}

export function roll(game, id, rng, place) {
  const bad = guard(game, id);
  if (bad) return no(bad);
  if (game.rollsLeft < 1) return no(E_NOROLL);
  const thrown = [];
  for (let i = 0; i < DICE; i++) if (!game.dice || game.dice[i].slot == null) thrown.push(i);
  if (!thrown.length) return no(E_NODICE);
  const seed = Math.floor(rng() * 2 ** 32);
  const values = thrown.map(() => 1 + Math.floor(rng() * 6)); // 눈은 seed 와 따로 뽑는다
  const spots = place(seed, thrown);
  const dice = game.dice ? game.dice.map(copyDie) : Array.from({ length: DICE }, () => ({ v: 1, slot: null, x: 0, z: 0, yaw: 0 }));
  thrown.forEach((i, n) => {
    const s = spots.find((p) => p.i === i);
    dice[i] = { v: values[n], slot: null, x: s.x, z: s.z, yaw: s.yaw };
  });
  game.dice = dice;
  game.rollsLeft--;
  game.rollNo++;
  game.shaking = false;
  const events = [{ k: 'ytRoll', id, seed, thrown, dice: dice.map(copyDie), rollsLeft: game.rollsLeft, rollNo: game.rollNo, combo: comboOf(dice.map((d) => d.v)) }];
  clearPick(game, id, events);
  return ok(events);
}

export function keep(game, id, i, on, freeSpot) {
  const bad = guard(game, id);
  if (bad) return no(bad);
  if (!Number.isInteger(i) || i < 0 || i >= DICE || typeof on !== 'boolean') return no(E_BAD);
  if (!game.dice || game.rollsLeft < 1) return no(E_NOKEEP);
  const d = game.dice[i];
  if ((d.slot != null) === on) return ok(); // 이미 그 상태
  if (on) {
    const used = new Set(game.dice.filter((x) => x.slot != null).map((x) => x.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    d.slot = slot;
  } else {
    const others = game.dice.filter((x, j) => j !== i && x.slot == null).map((x) => ({ x: x.x, z: x.z }));
    const s = freeSpot(others, { x: d.x, z: d.z, yaw: d.yaw });
    d.slot = null; d.x = s.x; d.z = s.z; d.yaw = s.yaw;
  }
  const events = [{ k: 'ytKeep', id, i, on, slot: d.slot, x: d.x, z: d.z, yaw: d.yaw }];
  clearPick(game, id, events);
  return ok(events);
}

export function pick(game, id, cat) {
  const bad = guard(game, id);
  if (bad) return no(bad);
  if (!game.dice) return no(E_FIRST);
  if (cat !== null && !CATS.includes(cat)) return no(E_BAD);
  if (cat !== null && cur(game).scores[cat] != null) return no(E_FILLED);
  if (game.pick === cat) return ok();
  game.pick = cat;
  return ok([{ k: 'ytPick', id, cat }]);
}

export function score(game, id, cat) {
  const bad = guard(game, id);
  if (bad) return no(bad);
  if (!game.dice) return no(E_FIRST);
  if (typeof cat !== 'string' || !CATS.includes(cat)) return no(E_BAD);
  const col = cur(game);
  if (col.scores[cat] != null) return no(E_FILLED);
  const before = totals(col.scores);
  const n = scoreOf(cat, game.dice.map((d) => d.v));
  col.scores[cat] = n;
  const after = totals(col.scores);
  game.last = { id, cat, score: n };
  const events = [{ k: 'ytScore', id, cat, score: n, bonus: before.bonus === 0 && after.bonus > 0, total: after.total }];
  clearPick(game, id, events);
  game.dice = null;
  game.shaking = false;
  advance(game, events);
  return ok(events);
}

// 기권('away' 끊긴 지 60초 | 'leave' 나가기). 참가자가 아니거나 이미 기권했거나 판이 끝났으면 아무 일 없음.
// id 는 한 명 또는 동시에 기권하는 여러 명의 배열.
export function drop(game, id, reason) {
  if (reason !== 'away' && reason !== 'leave') return no(E_BAD);
  if (game.phase !== 'playing') return ok();
  const cols = [...new Set(Array.isArray(id) ? id : [id])].map((x) => game.cols.find((c) => c.id === x)).filter((c) => c && !c.left);
  if (!cols.length) return ok();
  const turnCol = cur(game);
  const wasTurn = cols.includes(turnCol);
  const events = [];
  for (const c of cols) { c.left = true; events.push({ k: 'ytDrop', id: c.id, reason }); }
  if (wasTurn) { // 기록 없이 주사위와 선택을 지운다
    clearPick(game, turnCol.id, events);
    game.dice = null;
    game.shaking = false;
  }
  if (alive(game).length <= 1) finish(game, 'alone', events);
  else if (wasTurn) advance(game, events);
  return ok(events);
}

// viewerId 가 받는 판 상태. 끊김(connected·awayUntil·waiting)과 players·code 는 방이 붙인다.
export function viewOf(game, viewerId) {
  const col = cur(game);
  const mine = col && col.id === viewerId && game.dice;
  return {
    phase: game.phase,
    cols: game.cols.map((c) => ({ id: c.id, name: c.name, left: c.left, scores: { ...c.scores }, ...totals(c.scores) })),
    round: game.round,
    rounds: game.rounds,
    turn: col ? col.id : null,
    rollsLeft: game.rollsLeft,
    rollNo: game.rollNo,
    shaking: game.shaking,
    dice: game.dice ? game.dice.map(copyDie) : null,
    preview: mine ? previewOf(game.dice.map((d) => d.v), col.scores) : null,
    pick: game.pick,
    last: game.last ? { ...game.last } : null,
    result: game.result ? { reason: game.result.reason, ranks: game.result.ranks.map((r) => ({ ...r })), winners: [...game.result.winners] } : null,
  };
}
