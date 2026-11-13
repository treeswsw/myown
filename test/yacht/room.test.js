// 요트 방 시험 (가짜 시계): 차례 진행, 시간 제한 없음, 끊김 60초 기권, 전적 저장.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { simulateRoll } from '../../shared/yacht/sim.js';
import { FakeClock, client, seeded } from '../helpers.js';

const GRACE = 60_000;
function setup(seed = 5) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(seed), now: clock.now, timers: clock, yacht: 'on' });
  return { clock, hub };
}
async function table(n, seed) {
  const { clock, hub } = setup(seed);
  const cs = [];
  for (const name of ['ann1', 'bob1', 'cat1', 'dan1'].slice(0, n)) {
    const c = client(hub);
    await c.send({ t: 'login', id: name });
    cs.push(c);
  }
  await cs[0].send({ t: 'create', mode: 'yacht' });
  for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
  await cs[0].send({ t: 'start' });
  const by = (id) => cs.find((c) => c.conn.session.id === id);
  const cur = () => by(cs[0].state.turn);
  return { clock, hub, cs, by, cur, room: hub.rooms.get(cs[0].state.code) };
}
const yt = (c, a, o = {}) => c.send({ t: 'yt', a, ...o });
const evs = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);

test('start needs host and 2 players; state has no photos', async () => {
  const { hub } = setup();
  const a = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await a.send({ t: 'create', mode: 'yacht' });
  await a.send({ t: 'start' });
  assert.equal(a.sock.last('error').msg, '2명 이상 필요합니다.');
  const b = client(hub);
  await b.send({ t: 'login', id: 'bob1' });
  await b.send({ t: 'join', code: a.state.code });
  await b.send({ t: 'start' });
  assert.equal(b.sock.last('error').msg, '방장만 시작할 수 있습니다.');
  await a.send({ t: 'start' });
  assert.equal(a.state.phase, 'playing');
  assert.equal(JSON.stringify(a.sock.msgs.filter((m) => m.t === 'room')).includes('avatar'), false);
});

test('non-turn players are refused, and 10 idle minutes change nothing', async () => {
  const t = await table(2);
  const turn = t.cur();
  const other = t.cs.find((c) => c !== turn);
  for (const m of [{ a: 'roll' }, { a: 'shake', on: true }, { a: 'keep', i: 0, on: true }, { a: 'pick', cat: 'ones' }, { a: 'score', cat: 'ones' }]) {
    await other.send({ t: 'yt', ...m });
    assert.equal(other.sock.last('error').msg, '내 차례가 아닙니다.', m.a);
  }
  await yt(turn, 'roll');
  const before = JSON.stringify(t.cs[0].state);
  t.clock.advance(600_000);
  assert.equal(JSON.stringify(t.cs[0].state), before);
  assert.equal(t.cs[0].state.rollsLeft, 2);
  assert.equal(t.cs[0].state.turn, turn.conn.session.id);
});

test('roll: state matches the simulator, pick is public, preview only for the turn player', async () => {
  const t = await table(3);
  const turn = t.cur();
  await yt(turn, 'roll');
  const ev = evs(turn, 'ytRoll').at(-1);
  const rest = simulateRoll(ev.seed, ev.thrown, { frames: false }).rest;
  const st = turn.state;
  for (const r of rest) {
    assert.ok(Math.abs(st.dice[r.i].x - r.x) < 0.0006 && Math.abs(st.dice[r.i].z - r.z) < 0.0006);
  }
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    assert.ok(Math.hypot(st.dice[i].x - st.dice[j].x, st.dice[i].z - st.dice[j].z) >= 2.09);
  }
  await yt(turn, 'pick', { cat: 'choice' });
  for (const c of t.cs) {
    assert.equal(c.state.pick, 'choice');
    assert.equal(c.state.preview !== null, c === turn);
    assert.ok(evs(c, 'ytPick').some((e) => e.cat === 'choice'));
  }
  await yt(turn, 'score', { cat: 'choice' });
  assert.notEqual(t.cs[0].state.turn, turn.conn.session.id);
  assert.equal(t.cs[0].state.pick, null);
});

test('disconnect on turn: waits, shake off, same dice on return; 60s drops to alone', async () => {
  const t = await table(2);
  const turn = t.cur();
  const other = t.cs.find((c) => c !== turn);
  await yt(turn, 'roll');
  await yt(turn, 'pick', { cat: 'ones' });
  const dice = JSON.stringify(other.state.dice);
  turn.conn.close();
  assert.equal(other.state.waiting, turn.conn.session.id);
  t.clock.advance(GRACE - 1000);
  assert.equal(other.state.waiting, turn.conn.session.id);
  // 돌아오기
  const back = client(t.hub);
  await back.send({ t: 'login', id: turn.conn.session.id });
  assert.equal(back.state.waiting, null);
  assert.equal(JSON.stringify(back.state.dice), dice);
  assert.equal(back.state.rollsLeft, 2);
  assert.equal(back.state.pick, 'ones');
  // 다시 끊고 60초
  back.conn.close();
  t.clock.advance(GRACE + 1);
  const drop = evs(other, 'ytDrop').at(-1);
  assert.deepEqual([drop.id, drop.reason], [turn.conn.session.id, 'away']);
  assert.equal(other.state.phase, 'result');
  assert.equal(other.state.result.reason, 'alone');
  assert.equal(other.state.players.length, 1);
  assert.equal(other.conn.session.user.stats.yacht.wins, 1);
});

test('shaking player who disconnects gets ytShake off; off-turn drop skips their turn', async () => {
  const t = await table(3);
  const turn = t.cur();
  const idle = t.cs.find((c) => c !== turn);
  const watcher = t.cs.find((c) => c !== turn && c !== idle);
  await yt(turn, 'shake', { on: true });
  assert.equal(watcher.state.shaking, true);
  idle.conn.close(); // 차례 아님: 판은 멈추지 않는다
  assert.equal(watcher.state.waiting, null);
  turn.conn.close();
  assert.equal(evs(watcher, 'ytShake').at(-1).on, false);
  assert.equal(watcher.state.shaking, false);
  t.clock.advance(GRACE + 1);
  assert.equal(watcher.state.phase, 'result'); // 2명 다 기권, 1명 남음
  assert.equal(watcher.state.result.reason, 'alone');
});

test('dropped player is skipped in later turns', async () => {
  const t = await table(3);
  const first = t.cur();
  const ids = t.cs[0].state.cols.map((c) => c.id);
  const gone = t.by(ids[2]);
  gone.conn.close();
  t.clock.advance(GRACE + 1);
  const st = t.by(ids[0]).state;
  assert.equal(st.cols[2].left, true);
  for (let n = 0; n < 4; n++) {
    const c = t.cur();
    assert.notEqual(c.conn.session.id, ids[2]);
    await yt(c, 'roll');
    await yt(c, 'score', { cat: ['ones', 'twos', 'threes', 'fours'][Math.floor(n / 2)] });
  }
  assert.ok(first);
});

test('leave mid-game drops with reason leave; host passes on; full game saves stats', async () => {
  const t = await table(2);
  const host = t.cs[0];
  // 12바퀴 끝까지
  const cats = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
  for (let n = 0; n < 24; n++) {
    t.clock.advance(1000); // 연결당 초당 20개 제한
    const c = t.cur();
    await yt(c, 'roll');
    await yt(c, 'score', { cat: cats[Math.floor(n / 2)] });
  }
  assert.equal(host.state.phase, 'result');
  assert.equal(host.state.result.reason, 'done');
  for (const c of t.cs) {
    const s = c.conn.session.user.stats.yacht;
    assert.equal(s.games, 1);
    const total = c.state.cols.find((x) => x.id === c.conn.session.id).total;
    assert.equal(s.best, total);
  }
  const wins = t.cs.reduce((a, c) => a + c.conn.session.user.stats.yacht.wins, 0);
  assert.equal(wins, host.state.result.winners.length);
  // 다음 판 + 관전자 합류
  const late = client(t.hub);
  await late.send({ t: 'login', id: 'eve1' });
  await late.send({ t: 'join', code: host.state.code });
  await host.send({ t: 'start' });
  assert.equal(host.state.cols.length, 3);
  assert.equal(host.state.gameNo, 2);
  // 방장이 나가면 승계, 기권(leave)
  await host.send({ t: 'leave' });
  assert.equal(evs(late, 'ytDrop').at(-1).reason, 'leave');
  assert.equal(late.state.hostId, t.cs[1].conn.session.id);
});
