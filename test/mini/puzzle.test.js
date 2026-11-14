// 체스 퍼즐 혼자 풀기 (docs/mini/PLAN.md 6절): 레이팅·코인·힌트·5연속·하루 상한·정답 누출·남의 방 요청.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { mnMsg, lastErr } from './lib.js';
import { GAMES } from '../../shared/mini/index.js';
import { fromFen } from '../../shared/mini/fen.js';
import { loadPuzzles } from '../../server/mini/puzzles.js';
import { defaultEcon } from '../../shared/coin/rules.js';
import { tierKey } from '../../server/mini/puzzleRun.js';

const chess = GAMES.chess;
const FILES = 'abcdefgh';
const toMove = (u) => ({ from: { x: FILES.indexOf(u[0]), y: 8 - Number(u[1]) }, to: { x: FILES.indexOf(u[2]), y: 8 - Number(u[3]) }, ...(u[4] ? { promo: u[4].toUpperCase() } : {}) });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

async function room({ seed = 3 } = {}) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(seed), now: clock.now, timers: clock, mini: 'on' });
  const a = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await a.send({ t: 'create', mode: 'mini', game: 'chess', vs: 'puzzle' });
  await flush();
  const user = hub.sessions.get('ann1').user;
  return { clock, hub, a, user };
}

// 방이 낸 문제를 찾는다 (판 모양이 같은 문제). 시험만 하는 일이라 서버 안을 건드리지 않는다.
function findPuzzle(state) {
  const want = JSON.stringify(state.mn.board);
  for (const p of loadPuzzles()) {
    const moves = p[2].split(' ');
    const s = chess.apply(fromFen(p[1]), toMove(moves[0]));
    if (JSON.stringify(s.board) === want) return { p, moves };
  }
  throw new Error('문제를 못 찾음');
}

async function solve(r) {
  const { moves } = findPuzzle(r.a.state);
  for (let i = 1; i < moves.length; i += 2) {
    assert.equal(r.a.state.puzzle.status, 'play');
    await mnMsg(r.a, { a: 'move', move: toMove(moves[i]) });
  }
  await flush();
}
const MOVE = { from: { x: 0, y: 0 }, to: { x: 0, y: 1 } };

test('만들면 바로 첫 문제: 사람 1명, 내 쪽이 아래, 상대 첫 수는 이미 둠, 정답은 없음', async () => {
  const r = await room();
  const st = r.a.state;
  assert.equal(st.phase, 'play');
  assert.equal(st.puzzle.status, 'play');
  assert.equal(st.puzzle.me.r, 1500);
  assert.equal(st.puzzle.solution, null);
  assert.equal(st.mySeat, st.puzzle.seat);
  assert.equal(st.mn.turn, st.mySeat);
  assert.ok(st.mn.last, '상대 첫 수가 보인다');
  assert.equal(st.bot, null);
  const { p } = findPuzzle(st);
  assert.ok(Math.abs(p[3] - 1500) <= 150);
});

test('맞힘: 레이팅 오르고 난이도별 코인, 연속 1', async () => {
  const r = await room();
  const { p } = findPuzzle(r.a.state);
  await solve(r);
  const st = r.a.state.puzzle;
  assert.equal(st.status, 'solved');
  assert.ok(st.me.delta > 0);
  assert.equal(st.me.r, 1500 + st.me.delta);
  assert.equal(st.me.streak, 1);
  const want = defaultEcon().rules[tierKey(p[3])].finish;
  assert.equal(st.coin.gain, want);
  assert.equal(r.user.coins, want);
  assert.equal(st.coin.today, want);
  assert.equal(r.user.puzzle.n, 1);
  assert.ok(r.user.puzzle.recent.includes(p[0]));
});

test('틀림: 그 문제 실패, 레이팅 내려가고 코인 0, 정답 수순은 그때 보인다', async () => {
  const r = await room();
  const { moves } = findPuzzle(r.a.state);
  const wrong = chess.legalMoves(r.a.state.mn).find((m) => `${FILES[m.from.x]}${8 - m.from.y}${FILES[m.to.x]}${8 - m.to.y}` !== moves[1].slice(0, 4));
  await mnMsg(r.a, { a: 'move', move: wrong });
  await flush();
  const st = r.a.state.puzzle;
  assert.equal(st.status, 'failed');
  assert.ok(st.me.delta < 0);
  assert.equal(st.me.streak, 0);
  assert.equal(st.coin.gain, 0);
  assert.equal(r.user.coins, 0);
  assert.deepEqual(st.solution, moves.slice(1));
  // 끝난 문제에 또 두면 거절, 다음 문제는 새 문제
  await mnMsg(r.a, { a: 'move', move: wrong });
  assert.equal(lastErr(r.a).code, 'mn_now');
  const before = JSON.stringify(r.a.state.mn.board);
  await mnMsg(r.a, { a: 'next' });
  assert.equal(r.a.state.puzzle.status, 'play');
  assert.equal(r.a.state.puzzle.solution, null);
  assert.notEqual(JSON.stringify(r.a.state.mn.board), before);
});

test('둘 수 없는 수는 거절만 하고 문제는 계속', async () => {
  const r = await room();
  await mnMsg(r.a, { a: 'move', move: MOVE });
  assert.ok(['mn_move'].includes(lastErr(r.a).code));
  assert.equal(r.a.state.puzzle.status, 'play');
  await mnMsg(r.a, { a: 'move', move: { from: { x: 9, y: 0 }, to: { x: 0, y: 0 } } });
  assert.equal(r.a.state.puzzle.status, 'play');
});

test('힌트: 갈 말 칸만 알려 주고 0코인, 레이팅은 실패로; 풀기 전 다음 문제는 거절', async () => {
  const r = await room();
  const { moves } = findPuzzle(r.a.state);
  await mnMsg(r.a, { a: 'next' });
  assert.equal(lastErr(r.a).code, 'mn_now');
  await mnMsg(r.a, { a: 'hint' });
  assert.deepEqual(r.a.state.puzzle.hint, toMove(moves[1]).from);
  assert.equal(r.a.state.puzzle.solution, null);
  await solve(r);
  const st = r.a.state.puzzle;
  assert.equal(st.status, 'solved');
  assert.equal(st.coin.gain, 0);
  assert.equal(r.user.coins, 0);
  assert.ok(st.me.delta < 0);
  assert.equal(st.me.streak, 0);
});

test('정답 보기: 수순이 그때 나오고 코인 0 / 레이팅 실패', async () => {
  const r = await room();
  const { moves } = findPuzzle(r.a.state);
  await mnMsg(r.a, { a: 'reveal' });
  await flush();
  const st = r.a.state.puzzle;
  assert.equal(st.status, 'revealed');
  assert.deepEqual(st.solution, moves.slice(1));
  assert.equal(r.user.coins, 0);
  assert.ok(st.me.delta < 0);
});

test('정답 누출 없음: 푸는 동안 어느 메시지에도 정답 수순이 없다', async () => {
  const r = await room();
  const { moves } = findPuzzle(r.a.state);
  const answer = moves.slice(1).filter((_, i) => i % 2 === 0); // 사람이 둘 수들
  if (moves.length > 2) await mnMsg(r.a, { a: 'hint' });
  const raw = r.a.sock.raw.join('\n');
  assert.ok(!raw.includes(moves.slice(1).join(' ')), '수순 전체');
  assert.ok(!raw.includes('"solution":["'), 'solution 은 비어 있다');
  for (const u of answer) assert.ok(!raw.includes(`"${u}"`), u);
  assert.equal(r.a.state.puzzle.solution, null);
});

test('5연속 정답마다 보너스, 처음 4번은 난이도별 코인만', async () => {
  const r = await room({ seed: 7 });
  const rules = defaultEcon().rules;
  let total = 0;
  for (let i = 1; i <= 5; i++) {
    const { p } = findPuzzle(r.a.state);
    await solve(r);
    const st = r.a.state.puzzle;
    assert.equal(st.status, 'solved');
    const want = rules[tierKey(p[3])].finish + (i === 5 ? rules.puzzle_streak.finish : 0);
    assert.equal(st.coin.gain, want, `${i}번째`);
    total += want;
    assert.equal(st.me.streak, i);
    if (i < 5) { await mnMsg(r.a, { a: 'next' }); }
  }
  assert.equal(r.user.coins, total);
  assert.equal(r.user.puzzle.best, 5);
});

test('하루 상한: 넘으면 코인 0 이지만 레이팅은 오르고, 다음 날(한국 시간)에 다시 받는다', async () => {
  const r = await room({ seed: 5 });
  const econ = defaultEcon();
  econ.rules.puzzle_cap.finish = 3;
  for (const k of ['puzzle_1', 'puzzle_2', 'puzzle_3', 'puzzle_5']) econ.rules[k].finish = 2;
  await r.hub.setEcon(econ);
  await solve(r);
  assert.equal(r.a.state.puzzle.coin.gain, 2);
  await mnMsg(r.a, { a: 'next' });
  await solve(r);
  assert.equal(r.a.state.puzzle.coin.gain, 1); // 3 - 2 = 1 만 남아 있었다
  assert.equal(r.a.state.puzzle.coin.capped, true);
  await mnMsg(r.a, { a: 'next' });
  const rBefore = r.user.puzzle.r;
  await solve(r);
  const st = r.a.state.puzzle;
  assert.equal(st.coin.gain, 0);
  assert.equal(st.coin.capped, true);
  assert.equal(st.coin.today, 3);
  assert.ok(r.user.puzzle.r > rBefore);
  assert.equal(r.user.coins, 3);
  r.clock.advance(24 * 3600_000);
  await mnMsg(r.a, { a: 'next' });
  await solve(r);
  assert.equal(r.a.state.puzzle.coin.gain, 2);
  assert.equal(r.user.coins, 5);
});

test('남의 요청 거절: 구경꾼과 다른 방, 퍼즐 아닌 방의 힌트, 설정으로 퍼즐 만들기', async () => {
  const r = await room();
  const b = client(r.hub);
  await b.send({ t: 'login', id: 'bob1' });
  await b.send({ t: 'join', code: r.a.state.code });
  assert.equal(b.state.puzzle.status, 'play');
  assert.equal(b.state.puzzle.solution, null);
  for (const a of ['move', 'hint', 'reveal', 'next']) {
    await mnMsg(b, { a, move: MOVE });
    assert.equal(lastErr(b).code, 'mn_seat', a);
  }
  assert.equal(r.a.state.puzzle.hinted, false);
  await mnMsg(r.a, { a: 'resign' });
  assert.equal(lastErr(r.a).code, 'mn_now');
  // 일반 체스 방에서는 퍼즐 요청이 통하지 않는다
  const c = client(r.hub);
  await c.send({ t: 'login', id: 'cyn1' });
  await c.send({ t: 'create', mode: 'mini', game: 'chess' });
  await mnMsg(c, { a: 'hint' });
  assert.equal(lastErr(c).code, 'mn_bad');
  assert.equal(c.state.puzzle, null);
  await c.send({ t: 'set', patch: { vs: 'puzzle' } });
  assert.equal(lastErr(c).code, 'mn_vs');
  // 체스가 아닌 종목은 퍼즐 방이 안 된다
  const d = client(r.hub);
  await d.send({ t: 'login', id: 'dan11' });
  await d.send({ t: 'create', mode: 'mini', game: 'gomoku', vs: 'puzzle' });
  assert.equal(d.state.puzzle, null);
});

test('나가면 방이 비고, 레이팅은 계정에 남는다', async () => {
  const r = await room();
  await solve(r);
  const rating = r.user.puzzle.r;
  await r.a.send({ t: 'leave' });
  assert.equal(r.a.state?.puzzle ?? null, null);
  const again = await r.hub.store.getOrCreate('ann1');
  assert.equal(r.user.puzzle.r, rating);
  assert.ok(again.puzzle.r >= 100);
});
