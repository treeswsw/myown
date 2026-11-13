// 미니게임 방 시험 (가짜 시계): 방 만들기 -> 2명 -> 시작 -> 수 -> 기권 -> 결과 -> 다시, 끊김 60초 기권.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

const GRACE = 60_000;
function setup(opts = {}) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(3), now: clock.now, timers: clock, mini: 'on', ...opts });
  return { clock, hub };
}
async function pair(game) {
  const { clock, hub } = setup();
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  await a.send({ t: 'create', mode: 'mini', ...(game ? { game } : {}) });
  await b.send({ t: 'join', code: a.state.code });
  const mn = (c, o) => c.send({ t: 'mn', ...o });
  const by = (seat) => (a.state.seats[seat] === 'ann1' ? a : b);
  return { clock, hub, a, b, mn, by };
}
const lastErr = (c) => c.sock.last('error');

test('create: default gomoku, game chosen at creation, off switch, me carries mini', async () => {
  const { a } = await pair();
  assert.equal(a.state.mode, 'mini');
  assert.equal(a.state.game, 'gomoku');
  assert.equal(a.state.phase, 'lobby');
  assert.equal(a.state.mn, null);
  assert.equal(a.sock.last('me').mini, 'on');
  const c = await pair('chess');
  assert.equal(c.a.state.game, 'chess');
  const { hub } = setup({ mini: 'off' });
  const x = client(hub);
  await x.send({ t: 'login', id: 'cat1' });
  await x.send({ t: 'create', mode: 'mini' });
  assert.equal(lastErr(x).code, 'mn_off');
});

test('lobby: only the host picks a game and starts; needs 2', async () => {
  const { hub } = setup();
  const a = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await a.send({ t: 'create', mode: 'mini' });
  await a.send({ t: 'mn', a: 'start' });
  assert.equal(lastErr(a).code, 'mn_need2');
  const b = client(hub);
  await b.send({ t: 'login', id: 'bob1' });
  await b.send({ t: 'join', code: a.state.code });
  await b.send({ t: 'mn', a: 'game', game: 'reversi' });
  assert.equal(lastErr(b).code, 'mn_host');
  await b.send({ t: 'mn', a: 'start' });
  assert.equal(lastErr(b).code, 'mn_host');
  await a.send({ t: 'mn', a: 'game', game: 'nope' });
  assert.equal(lastErr(a).code, 'mn_game');
  await a.send({ t: 'mn', a: 'game', game: 'reversi' });
  assert.equal(b.state.game, 'reversi');
  await a.send({ t: 'mn', a: 'start' });
  assert.equal(a.state.phase, 'play');
  assert.equal(a.state.mn.turn, 0);
  assert.deepEqual([...a.state.seats].sort(), ['ann1', 'bob1']);
  assert.equal(a.state.mySeat + b.state.mySeat, 1);
  assert.equal(JSON.stringify(a.sock.msgs.filter((m) => m.t === 'room')).includes('avatar'), false);
  await a.send({ t: 'mn', a: 'game', game: 'chess' });
  assert.equal(lastErr(a).code, 'mn_now');
});

test('play: turn order, bad moves, win ends the game, again returns to lobby', async () => {
  const { a, b, mn, by } = await pair('connect4');
  await mn(a, { a: 'start' });
  const first = by(0);
  const second = by(1);
  await mn(second, { a: 'move', move: { x: 0 } });
  assert.equal(lastErr(second).code, 'mn_turn');
  await mn(first, { a: 'move', move: { x: 9 } });
  assert.equal(lastErr(first).code, 'mn_move');
  for (let i = 0; i < 3; i++) {
    await mn(first, { a: 'move', move: { x: 0 } });
    await mn(second, { a: 'move', move: { x: 1 } });
  }
  assert.equal(a.state.phase, 'play');
  assert.equal(a.state.turn, first.conn.session.id);
  await mn(first, { a: 'move', move: { x: 0 } });
  assert.equal(a.state.phase, 'end');
  assert.deepEqual(a.state.result, { winner: 0, reason: 'win' });
  assert.equal(b.state.mn.winner, 0);
  await mn(first, { a: 'move', move: { x: 3 } });
  assert.equal(lastErr(first).code, 'mn_now');
  await mn(second, { a: 'again' });
  assert.equal(lastErr(second).code, 'mn_host');
  await mn(a, { a: 'again' });
  assert.equal(a.state.phase, 'lobby');
  assert.equal(a.state.mn, null);
  assert.equal(a.state.result, null);
  assert.deepEqual(a.state.seats, [null, null]);
  await mn(a, { a: 'start' });
  assert.equal(a.state.phase, 'play');
});

test('resign: the other seat wins, then again', async () => {
  const { a, b, mn, by } = await pair('gomoku');
  await mn(a, { a: 'start' });
  await mn(by(0), { a: 'move', move: { x: 7, y: 7 } });
  assert.equal(a.state.mn.board[7][7], 0);
  await mn(by(1), { a: 'resign' });
  assert.equal(b.state.phase, 'end');
  assert.deepEqual(a.state.result, { winner: 0, reason: 'resign' });
  await mn(a, { a: 'again' });
  assert.equal(b.state.phase, 'lobby');
});

test('spectator: third person watches and cannot move', async () => {
  const { hub, a, mn, by } = await pair('gomoku');
  const c = client(hub);
  await c.send({ t: 'login', id: 'cat1' });
  await c.send({ t: 'join', code: a.state.code });
  await mn(a, { a: 'start' });
  assert.equal(c.state.mySeat, -1);
  assert.equal(c.state.players.find((p) => p.id === 'cat1').spectating, true);
  await mn(c, { a: 'move', move: { x: 1, y: 1 } });
  assert.equal(lastErr(c).code, 'mn_seat');
  await mn(by(0), { a: 'move', move: { x: 1, y: 1 } });
  assert.equal(c.state.mn.board[1][1], 0);
});

test('disconnect: waits, comes back, or forfeits after 60s', async () => {
  const { clock, a, b, mn, by } = await pair('gomoku');
  await mn(a, { a: 'start' });
  const mover = by(0);
  const other = by(1);
  mover.conn.close();
  assert.equal(other.state.waiting, mover.conn.session.id);
  clock.advance(GRACE - 1000);
  assert.equal(other.state.phase, 'play');
  clock.advance(2000);
  assert.equal(other.state.phase, 'end');
  assert.deepEqual(other.state.result, { winner: other.state.mySeat, reason: 'leave' });
  // 다시 붙는 경우
  const g = await pair('gomoku');
  await g.mn(g.a, { a: 'start' });
  const m2 = g.by(0);
  m2.conn.close();
  g.clock.advance(30_000);
  const back = client(g.hub);
  await back.send({ t: 'login', id: m2.conn.session.id });
  g.clock.advance(60_000);
  assert.equal(g.by(1).state.phase, 'play');
  assert.equal(b.state.mode, 'mini');
});

test('leave during play = resign; requests of other games are refused', async () => {
  const { a, b, mn, by } = await pair('chess');
  await mn(a, { a: 'start' });
  await a.send({ t: 'act', a: 'fold' });
  assert.ok(lastErr(a));
  await a.send({ t: 'yt', a: 'roll' });
  const quitter = by(0);
  const stayer = by(1);
  await quitter.send({ t: 'leave' });
  assert.equal(stayer.state.phase, 'end');
  assert.deepEqual(stayer.state.result, { winner: 1, reason: 'leave' });
  assert.equal(stayer.state.players.length, 1);
  assert.equal(b.sock.last('room') !== undefined, true);
});

test('mn request to a non-mini room is refused', async () => {
  const { hub } = setup();
  const a = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await a.send({ t: 'create', mode: 'holdem' });
  await a.send({ t: 'mn', a: 'start' });
  assert.equal(lastErr(a).code, 'mn_bad');
});
