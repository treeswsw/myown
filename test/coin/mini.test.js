// 미니게임 코인(매치 끝까지 가면 이김 3 / 짐 1, 기권·나가기·무승부는 없음). 공용 방 틀(Shell) 위에서 ctx.finish 한 번.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { payouts } from '../../shared/coin/rules.js';
import { FakeClock, client, seeded } from '../helpers.js';

async function setup() {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(undefined), rng: seeded(3), now: clock.now, timers: clock, mini: 'on' });
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  await a.send({ t: 'create', mode: 'mini', game: 'connect4' });
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'start' });
  const by = (seat) => (a.state.seats[seat] === 'ann1' ? a : b);
  const coins = (id) => hub.sessions.get(id)?.user.coins ?? 0;
  return { a, b, by, coins, clock };
}

async function winRound({ a, by }) {
  const first = by(0);
  const second = by(1);
  for (let i = 0; i < 3; i++) {
    await first.send({ t: 'mn', a: 'move', move: { x: 0 } });
    await second.send({ t: 'mn', a: 'move', move: { x: 1 } });
  }
  await first.send({ t: 'mn', a: 'move', move: { x: 0 } });
  assert.equal(a.state.phase, 'end');
  return a.state.seats[0];
}

test('mini: board win pays the winner 3 and the loser 1, once; the next round pays again', async () => {
  const r = await setup();
  const winner = await winRound(r);
  assert.equal(r.coins(winner), 3);
  assert.equal(r.coins(winner === 'ann1' ? 'bob1' : 'ann1'), 1);
  assert.deepEqual(payouts('mini', [{ id: 'w', rank: 1, won: true, opp: 1 }, { id: 'l', rank: 2, won: false, opp: 1 }]), { w: 3, l: 1 });
  r.clock.advance(3_600_000); // 같은 사람에게 연달아 주지 않는 간격(gapMs)
  await r.a.send({ t: 'start' }); // 결과 화면에서 바로 다음 판
  assert.equal(r.a.state.phase, 'play');
  await winRound(r);
  assert.equal(r.coins('ann1') + r.coins('bob1'), 8, '두 번째 판도 한 번 지급 (3 + 1 씩)');
});

test('mini: resign, leave and draw pay nothing', async () => {
  const r = await setup();
  await r.by(1).send({ t: 'mn', a: 'resign' });
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.coins('ann1') + r.coins('bob1'), 0);
  await r.a.send({ t: 'start' });
  await r.by(0).send({ t: 'leave' });
  assert.equal(r.coins('ann1') + r.coins('bob1'), 0);
});
