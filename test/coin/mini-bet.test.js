// 미니게임 코인 베팅(SPEC 22-20): 건 수 맞추기·시작 때 맡기기·정산(승/패/기권/끊김/무승부/방 닫힘/재시작)·잔액 부족·이중 처리 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { pair, c4Win, c4Draw, mnMsg, lastErr, GRACE } from '../mini/lib.js';
import { betModel } from '../../client/src/mini/bet.pure.js';

const bet = (c, n) => c.send({ t: 'pick', patch: { bet: n } });
const escrow = (r, id) => r.hub.sessions.get(id).user.gear.escrow;
const total = (r) => r.coinsOf('ann1') + r.coinsOf('bob1');

async function betPair(n, opt = {}) {
  const r = await pair({ game: 'connect4', coins: 100, ...opt });
  await bet(r.a, n);
  await bet(r.b, n);
  return r;
}

test('bet: each player sets their own bet within their coins; everybody sees both numbers', async () => {
  const r = await pair({ game: 'connect4', coins: 10 });
  await bet(r.a, 4);
  assert.deepEqual(r.b.state.wait.own, { ann1: { bet: 4 }, bob1: { bet: 0 } });
  await bet(r.b, 11);
  assert.equal(lastErr(r.b).code, 'mn_coin', '가진 코인보다 많이 걸 수 없다');
  assert.equal(r.b.state.wait.own.bob1.bet, 0);
  await bet(r.b, -1);
  assert.equal(lastErr(r.b).code, 'mn_betval');
  await bet(r.b, 1.5);
  assert.equal(lastErr(r.b).code, 'mn_betval');
  await bet(r.b, '3');
  assert.equal(lastErr(r.b).code, 'mn_betval');
  await r.b.send({ t: 'pick', patch: { bet: 3, color: 1 } });
  assert.equal(lastErr(r.b).code, 'mn_bad');
  await bet(r.b, 10);
  assert.equal(r.a.state.wait.own.bob1.bet, 10, '한도(가진 만큼)까지 걸 수 있다');
  // 시작 전에는 코인이 그대로
  assert.equal(total(r), 20);
});

test('bet: different amounts block the start with the reason; equal or both zero starts', async () => {
  const r = await pair({ game: 'connect4', coins: 50 });
  await bet(r.a, 5);
  assert.equal(r.a.state.wait.can, false);
  assert.equal(r.a.state.wait.why.code, 'mn_bet');
  assert.equal(r.a.state.wait.why.msg, '건 코인이 서로 달라요 (같게 맞추거나 둘 다 0)');
  await r.a.send({ t: 'start' });
  assert.equal(lastErr(r.a).code, 'mn_bet');
  assert.equal(r.a.state.phase, 'lobby');
  assert.equal(total(r), 100, '막혔으니 코인이 움직이지 않았다');
  await bet(r.b, 5);
  assert.equal(r.a.state.wait.can, true);
  await bet(r.a, 0);
  await bet(r.b, 0);
  await r.a.send({ t: 'start' });
  assert.equal(r.a.state.phase, 'play');
  assert.equal(r.a.state.match.bet, 0);
  assert.equal(escrow(r, 'ann1'), undefined, '내기 없는 판은 맡김이 없다');
  assert.equal(total(r), 100);
});

test('bet: start takes the bet from both and holds it; win -> the winner gets the pot (+ the normal win coin)', async () => {
  const r = await betPair(30);
  await r.a.send({ t: 'start' });
  assert.equal(r.coinsOf('ann1'), 70);
  assert.equal(r.coinsOf('bob1'), 70);
  assert.deepEqual(escrow(r, 'ann1'), { code: r.a.state.code, n: 30 });
  assert.equal(r.a.state.match.bet, 30);
  assert.equal(r.hub.stakes.size, 1);
  const winner = r.a.state.seats[0];
  const loser = r.a.state.seats[1];
  await c4Win(r);
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.coinsOf(winner), 70 + 60 + 1, '판돈 전부 + 원래 승리 코인 1');
  assert.equal(r.coinsOf(loser), 70);
  assert.equal(escrow(r, winner), undefined);
  assert.equal(escrow(r, loser), undefined);
  assert.equal(r.hub.stakes.size, 0);
  // 공통 결과: 코인 칸 = 승리 코인 + 베팅, 베팅은 따로 add 로(화면이 "판 코인 +1 · 베팅 +30")
  const res = r.a.state.wait.result;
  assert.deepEqual(res.gain, { [winner]: 31, [loser]: -30 });
  assert.deepEqual(res.add, { label: '베팅', by: { [winner]: 30, [loser]: -30 } });
  assert.deepEqual(res.rows.map((x) => [x.id, x.rank, x.note]), [[winner, 1, '1승'], [loser, 2, '0승']]);
  // 베팅은 매치마다 새로: 결과 화면에서는 0 으로 비어 있다
  assert.deepEqual(r.a.state.wait.own, { ann1: { bet: 0 }, bob1: { bet: 0 } });
  await r.a.send({ t: 'start' });
  assert.equal(r.a.state.phase, 'play');
  assert.equal(total(r), 70 + 60 + 1 + 70, '다음 판은 내기 없이 시작');
});

test('bet: a best-of-3 match pays only when the match ends', async () => {
  const r = await betPair(10, { set: { len: 3 } });
  await r.a.send({ t: 'start' });
  assert.equal(total(r), 180);
  const first = r.a.state.seats[0];
  await c4Win(r);
  assert.equal(r.a.state.phase, 'between');
  assert.equal(total(r), 180, '판 사이에도 맡겨 둔 채');
  assert.equal(r.hub.stakes.size, 1);
  r.clock.advance(5000);
  await c4Win(r); // 상대가 1승
  r.clock.advance(5000);
  await c4Win(r); // 처음 이긴 사람이 2승
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.coinsOf(first), 90 + 20 + 1);
  assert.equal(r.coinsOf(first === 'ann1' ? 'bob1' : 'ann1'), 90);
});

test('bet: resign loses the bet; the resigner can not get it back by leaving afterwards', async () => {
  const r = await betPair(25);
  await r.a.send({ t: 'start' });
  const quitter = r.by(1);
  const stayer = r.by(0);
  await mnMsg(quitter, { a: 'resign' });
  assert.equal(r.coinsOf(stayer.conn.session.id), 75 + 50, '기권 승은 승리 코인 없이 판돈만');
  assert.equal(r.coinsOf(quitter.conn.session.id), 75);
  await quitter.send({ t: 'leave' });
  assert.equal(total(r), 75 + 125);
  assert.equal(r.hub.stakes.size, 0);
});

test('bet: leaving the room in the middle of the match is a loss', async () => {
  const r = await betPair(20);
  await r.a.send({ t: 'start' });
  const quitter = r.by(0);
  const stayer = r.by(1);
  await quitter.send({ t: 'leave' });
  assert.equal(stayer.state.phase, 'end');
  assert.equal(r.coinsOf(stayer.conn.session.id), 80 + 40);
  assert.equal(r.coinsOf(quitter.conn.session.id), 80);
  assert.equal(escrow(r, quitter.conn.session.id), undefined);
  const res = stayer.state.wait.result;
  assert.equal(res.gain[stayer.conn.session.id], 20, '나감 승은 승리 코인 없이 판돈만');
  assert.equal(res.gain[quitter.conn.session.id], -20);
  assert.equal(res.rows.find((x) => x.id === quitter.conn.session.id).note, '0승 · 나감');
});

test('bet: more than 60 s disconnected is a forfeit; coming back within the time keeps playing with the bet held', async () => {
  const r = await betPair(40);
  await r.a.send({ t: 'start' });
  const gone = r.by(1);
  const stayer = r.by(0);
  gone.conn.close();
  r.clock.advance(GRACE - 1000);
  assert.equal(stayer.state.phase, 'play');
  assert.equal(r.hub.stakes.size, 1);
  assert.equal(total(r), 120);
  r.clock.advance(2000);
  assert.equal(stayer.state.phase, 'end');
  assert.equal(r.coinsOf(stayer.conn.session.id), 60 + 80);
  assert.equal(gone.conn.session.user.coins, 60, '나간 계정에도 정산이 남는다(세션이 지워져도 저장된다)');
  assert.equal(r.hub.stakes.size, 0);
  await Promise.allSettled([...r.hub.pendingSaves]);
  assert.equal((await r.hub.store.getOrCreate(gone.conn.session.id)).coins, 60);
  assert.equal((await r.hub.store.getOrCreate(gone.conn.session.id)).gear.escrow, undefined);
});

test('bet: a drawn match gives both their coins back', async () => {
  const r = await betPair(15);
  await r.a.send({ t: 'start' });
  await c4Draw(r);
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.coinsOf('ann1'), 100);
  assert.equal(r.coinsOf('bob1'), 100);
  assert.equal(escrow(r, 'ann1'), undefined);
  assert.deepEqual(r.a.state.wait.result.gain, { ann1: 0, bob1: 0 }, '무승부는 돌려받아 0');
  assert.equal(r.hub.stakes.size, 0);
});

test('bet: the room closing (server stop) gives the held coins back', async () => {
  const r = await betPair(35);
  await r.a.send({ t: 'start' });
  assert.equal(total(r), 130);
  await r.hub.close();
  assert.equal(r.coinsOf('ann1'), 100);
  assert.equal(r.coinsOf('bob1'), 100);
  assert.equal(escrow(r, 'ann1'), undefined);
  assert.equal(r.hub.stakes.size, 0);
});

test('bet: after a restart the held coins come back when the account logs in again', async () => {
  const clock = new FakeClock();
  const store = createStore();
  const hub = createHub({ store, rng: seeded(3), now: clock.now, timers: clock, mini: 'on' });
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  for (const id of ['ann1', 'bob1']) hub.sessions.get(id).user.coins = 50;
  await a.send({ t: 'create', mode: 'mini', game: 'connect4' });
  await b.send({ t: 'join', code: a.state.code });
  await bet(a, 20);
  await bet(b, 20);
  await a.send({ t: 'start' });
  assert.equal(hub.sessions.get('ann1').user.coins, 30);
  await Promise.allSettled([...hub.pendingSaves]); // 서버가 갑자기 꺼졌다고 치고(flush 없이) 저장된 것만 남긴다
  const hub2 = createHub({ store, rng: seeded(4), now: clock.now, timers: clock, mini: 'on' });
  const a2 = client(hub2);
  await a2.send({ t: 'login', id: 'ann1' });
  assert.equal(hub2.sessions.get('ann1').user.coins, 50, '맡긴 코인이 돌아왔다');
  assert.equal(hub2.sessions.get('ann1').user.gear.escrow, undefined);
  await Promise.allSettled([...hub2.pendingSaves]);
  const a3 = client(hub2);
  a3.conn.close?.();
  const hub3 = createHub({ store, rng: seeded(5), now: clock.now, timers: clock, mini: 'on' });
  const again = client(hub3);
  await again.send({ t: 'login', id: 'ann1' });
  assert.equal(hub3.sessions.get('ann1').user.coins, 50, '두 번 돌려주지 않는다');
  const b2 = client(hub3);
  await b2.send({ t: 'login', id: 'bob1' });
  assert.equal(hub3.sessions.get('bob1').user.coins, 50);
});

test('bet: a live bet is not given back by a plain re-login (the other tab / reconnect)', async () => {
  const r = await betPair(10);
  await r.a.send({ t: 'start' });
  const c = client(r.hub);
  await c.send({ t: 'login', id: 'ann1' }); // 다른 곳에서 다시 접속
  assert.equal(r.coinsOf('ann1'), 90);
  assert.deepEqual(escrow(r, 'ann1'), { code: r.a.state.code, n: 10 });
});

test('bet: not enough coins -> pick refused; coins gone before the start -> start refused, nothing is taken', async () => {
  const r = await pair({ game: 'connect4', coins: 5 });
  await bet(r.a, 6);
  assert.equal(lastErr(r.a).code, 'mn_coin');
  await bet(r.a, 5);
  await bet(r.b, 5);
  assert.equal(r.a.state.wait.can, true);
  r.hub.sessions.get('bob1').user.coins = 2; // 그 사이 코인이 줄었다
  assert.equal(r.a.state.wait.can, true, '화면 상태는 다음 푸시 때 갱신된다');
  await r.a.send({ t: 'start' });
  assert.equal(lastErr(r.a).code, 'mn_coin');
  assert.match(lastErr(r.a).msg, /bob1/);
  assert.equal(r.a.state.phase, 'lobby');
  assert.equal(r.coinsOf('ann1'), 5);
  assert.equal(r.coinsOf('bob1'), 2);
  assert.equal(r.hub.stakes.size, 0);
  assert.equal(escrow(r, 'ann1'), undefined);
});

test('bet: a spectator (third person) can not bet and does not change anything', async () => {
  const r = await pair({ game: 'connect4', coins: 20 });
  const c = client(r.hub);
  await c.send({ t: 'login', id: 'cat1' });
  r.hub.sessions.get('cat1').user.coins = 20;
  await c.send({ t: 'join', code: r.a.state.code });
  await bet(c, 5);
  assert.equal(lastErr(c).code, 'mn_betspec');
  await bet(c, 0); // 0 은 상관없다
  await bet(r.a, 7);
  await bet(r.b, 7);
  await r.a.send({ t: 'start' });
  assert.equal(r.coinsOf('cat1'), 20);
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 26, '둘이 7씩 맡겼다');
  await bet(c, 3);
  assert.equal(lastErr(c).code, 'mn_now', '게임 중에는 바꿀 수 없다');
});

test('hub.stake / settleStake: all-or-nothing, no bots, no duplicate, settle only once', async () => {
  const r = await pair({ game: 'connect4', coins: 10 });
  const hub = r.hub;
  const key = {};
  const rows = (...a) => a.map(([id, n]) => ({ id, n }));
  assert.equal(hub.stake(key, rows(['ann1', 5], ['bob1', 11]))?.code, 'coin_low');
  assert.equal(r.coinsOf('ann1'), 10, '한 명이 모자라면 아무도 떼지 않는다');
  assert.equal(hub.stake(key, rows(['ann1', 0], ['bob1', 0]))?.code, 'coin_bad');
  assert.equal(hub.stake(key, rows(['ann1', -3], ['bob1', 3]))?.code, 'coin_bad');
  assert.equal(hub.stake(key, rows(['ann1', 1.5], ['bob1', 1.5]))?.code, 'coin_bad');
  assert.equal(hub.stake(key, rows(['ann1', 5], ['ann1', 5]))?.code, 'coin_bad');
  assert.equal(hub.stake(key, rows(['ann1', 5], ['nobody', 5]))?.code, 'coin_bad');
  assert.equal(hub.stake(key, rows(['ann1', 5]))?.code, 'coin_bad');
  hub.sessions.get('bob1').bot = true;
  assert.equal(hub.stake(key, rows(['ann1', 5], ['bob1', 5]))?.code, 'coin_bad', '봇과는 걸 수 없다');
  hub.sessions.get('bob1').bot = false;
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 20);
  assert.equal(hub.stake(key, rows(['ann1', 5], ['bob1', 5])), null);
  assert.equal(hub.stake(key, rows(['ann1', 1], ['bob1', 1]))?.code, 'coin_bad', '같은 키로 두 번 맡기지 않는다');
  assert.equal(hub.stake({}, rows(['ann1', 1], ['bob1', 1]))?.code, 'coin_bad', '이미 맡긴 사람은 또 맡기지 못한다');
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 10);
  assert.equal(hub.settleStake({}, 'ann1'), null, '모르는 키는 아무 일도 없다');
  assert.deepEqual(hub.settleStake(key, 'ann1'), [{ id: 'ann1', net: 5 }, { id: 'bob1', net: -5 }]);
  assert.equal(r.coinsOf('ann1'), 15);
  assert.equal(r.coinsOf('bob1'), 5);
  assert.equal(hub.settleStake(key, 'ann1'), null, '두 번째는 아무것도 하지 않는다');
  assert.equal(hub.settleStake(key, null), null);
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 20, '코인 총합은 그대로');
  assert.equal(r.hub.sessions.get('ann1').user.coinsTotal, 5, '번 몫(상대 판돈)만 누적에 더한다');
  assert.equal(r.hub.sessions.get('bob1').user.coinsTotal ?? 0, 0);
  // 승자가 판 참가자가 아니면 돌려준다
  const k2 = {};
  assert.equal(hub.stake(k2, rows(['ann1', 5], ['bob1', 5])), null);
  hub.settleStake(k2, 'cat9');
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 20);
});

test('bet model (client): button and reasons', () => {
  const st = (mine, theirs, extra = {}) => ({
    you: 'a', wait: { own: { a: { bet: mine }, b: { bet: theirs } } },
    players: [{ id: 'a', name: '나', connected: true }, { id: 'b', name: '상대', connected: true }], ...extra,
  });
  let m = betModel(st(0, 8), 20);
  assert.equal(m.canMatch, true);
  assert.equal(m.oppBet, 8);
  assert.match(m.note, /서로 달라요/);
  m = betModel(st(0, 8), 5);
  assert.equal(m.canMatch, false);
  assert.match(m.note, /모자라/);
  m = betModel(st(8, 8), 20);
  assert.equal(m.canMatch, false);
  assert.match(m.note, /16/);
  m = betModel(st(0, 0), 20);
  assert.match(m.note, /걸지 않는/);
  m = betModel(st(0, 0, { players: [{ id: 'x', name: 'x' }, { id: 'y', name: 'y' }, { id: 'a', name: '나' }] }), 20);
  assert.equal(m.canBet, false, '세 번째 사람은 걸 수 없다');
  m = betModel({ you: 'a', wait: { own: {} }, players: [{ id: 'a', name: '나' }] }, 3);
  assert.equal(m.oppName, '');
  assert.equal(m.canMatch, false);
});
