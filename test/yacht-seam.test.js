// 요트다이스 이음매 시험: 포커 서버(hub) 안에 요트 방이 끼어드는 자리만 본다 (SPEC 19-1·19-2, GDD 9절).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

const OFF_MSG = '요트다이스는 아직 열리지 않았습니다.';

function setup(yacht = 'on', extra = {}) {
  const clock = new FakeClock();
  const store = createStore();
  const hub = createHub({ store, rng: seeded(11), now: clock.now, timers: clock, yacht, ...extra });
  return { clock, store, hub };
}

async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  return c;
}

async function lobby(hub, mode, names) {
  const cs = [];
  for (const n of names) cs.push(await login(hub, n));
  await cs[0].send({ t: 'create', mode });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  return { cs, code };
}

test('me carries the yacht switch (off by default), liar switch unchanged', async () => {
  for (const [opt, want] of [[undefined, 'off'], ['off', 'off'], ['test', 'test'], ['on', 'on']]) {
    const clock = new FakeClock();
    const hub = createHub({ store: createStore(), rng: seeded(1), now: clock.now, timers: clock, ...(opt ? { yacht: opt } : {}) });
    const a = await login(hub, 'ann1');
    assert.equal(a.sock.last('me').yacht, want);
    assert.equal(a.sock.last('me').liar, 'off');
  }
});

test('YACHT=off: yacht room is refused, poker still works', async () => {
  const { hub } = setup('off');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'yacht' });
  assert.equal(a.sock.last('error').msg, OFF_MSG);
  assert.equal(a.state, null);
  assert.equal(hub.rooms.size, 0);
  await a.send({ t: 'create', mode: 'holdem' });
  assert.equal(a.state.mode, 'holdem');
});

test('YACHT=test and on: a yacht room can be created (even with 0 chips)', async () => {
  for (const mode of ['test', 'on']) {
    const { hub } = setup(mode);
    const a = await login(hub, 'ann1');
    a.conn.session.user.bank = 0;
    await a.send({ t: 'create', mode: 'yacht' });
    assert.equal(a.state.mode, 'yacht', mode);
    assert.equal(a.sock.last('error'), undefined);
  }
});

test('yacht room: capacity 4, room list shows mode yacht and max 4, fifth join refused', async () => {
  const { hub } = setup();
  const { cs, code } = await lobby(hub, 'yacht', ['ann1', 'bob1', 'cat1', 'dan1']);
  assert.equal(cs[0].state.players.length, 4);
  const fifth = await login(hub, 'eve1');
  await fifth.send({ t: 'join', code });
  assert.equal(fifth.sock.last('error').msg, '방이 가득 찼습니다.');
  assert.equal(fifth.state, null);
  const list = hub.roomList();
  assert.equal(list.length, 1);
  assert.equal(list[0].mode, 'yacht');
  assert.equal(list[0].max, 4);
  assert.equal(list[0].count, 4);
  assert.equal(list[0].phase, 'lobby');
});

test('yacht room: mode|act|play|liar|lg are refused with a sentence, not a crash', async () => {
  const { hub } = setup();
  const { cs } = await lobby(hub, 'yacht', ['ann1', 'bob1']);
  for (const m of [{ t: 'mode', mode: 'holdem' }, { t: 'act', a: 'fold' }, { t: 'play', cards: [0] }, { t: 'liar' }]) {
    await cs[0].send(m);
    assert.equal(cs[0].sock.last('error').msg, '지금은 할 수 없습니다.', JSON.stringify(m));
  }
  await cs[0].send({ t: 'lg', a: 'vote' });
  assert.equal(cs[0].sock.last('error').msg, '알 수 없는 요청입니다.');
  assert.equal(cs[0].state.mode, 'yacht');
  assert.equal(cs[0].sock.msgs.filter((m) => m.t === 'error').every((m) => m.msg !== '서버 오류가 발생했습니다.'), true);
});

test('poker and liar rooms: yt is refused, poker room refuses mode yacht', async () => {
  const { hub } = setup('on', { liar: 'on' });
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'yt', a: 'roll' });
  assert.equal(cs[0].sock.last('error').msg, '알 수 없는 요청입니다.');
  await cs[0].send({ t: 'mode', mode: 'yacht' });
  assert.equal(cs[0].sock.last('error').msg, '요트다이스는 방을 새로 만들어 주세요.');
  assert.equal(cs[0].state.mode, 'holdem');
  await cs[0].send({ t: 'mode', mode: 'bluff' });
  assert.equal(cs[0].state.mode, 'bluff');

  const l = await lobby(hub, 'liar', ['liar1', 'liar2']);
  await l.cs[0].send({ t: 'yt', a: 'roll' });
  assert.equal(l.cs[0].sock.last('error').msg, '알 수 없는 요청입니다.');
});

test('yt envelope needs login and a room; bad shapes are refused', async () => {
  const { hub } = setup();
  const anon = client(hub);
  await anon.send({ t: 'yt', a: 'roll' });
  assert.equal(anon.sock.last('error').msg, '먼저 로그인하세요.');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'yt', a: 'roll' });
  assert.equal(a.sock.last('error').msg, '방에 들어가 있지 않습니다.');
  const { cs } = await lobby(hub, 'yacht', ['bob1', 'cat1']);
  for (const m of [{ t: 'yt' }, { t: 'yt', a: 5 }, { t: 'yt', a: '' }, { t: 'yt', a: 'x'.repeat(21) }]) {
    await cs[0].send(m);
    assert.equal(cs[0].sock.last('error').msg, '잘못된 메시지 형식입니다.', JSON.stringify(m));
  }
  for (const m of [{ t: 'yt', a: 'fly' }, { t: 'yt', a: 'keep', i: 9, on: true }, { t: 'yt', a: 'pick', cat: 'nope' }, { t: 'yt', a: 'score' }]) {
    await cs[0].send(m);
    assert.equal(cs[0].sock.last('error').msg, '잘못된 요청입니다.', JSON.stringify(m));
  }
  await cs[0].send({ t: 'yt', a: 'roll' }); // 시작 전
  assert.equal(cs[0].sock.last('error').msg, '지금은 할 수 없습니다.');
});

test('validation: yt envelope and create modes', () => {
  const parse = (o) => parseMessage(JSON.stringify(o));
  assert.equal(parse({ t: 'create', mode: 'yacht' }).ok, true);
  assert.equal(parse({ t: 'create', mode: 'chess' }).ok, false);
  assert.equal(parse({ t: 'yt', a: 'roll' }).ok, true);
  assert.equal(parse({ t: 'yt', a: '' }).ok, false);
  assert.equal(parse({ t: 'yt' }).ok, false);
  assert.equal(parse({ t: 'yt', a: 'x'.repeat(21) }).ok, false);
});

test('avatar in a yacht room goes out as a faces event, never in the room state', async () => {
  const { hub } = setup();
  const { cs } = await lobby(hub, 'yacht', ['ann1', 'bob1']);
  const JPG = 'data:image/jpeg;base64,/9j/AAAA';
  await cs[1].send({ t: 'avatar', data: JPG });
  const faces = cs[0].sock.msgs.filter((m) => m.t === 'event' && m.e.k === 'faces').at(-1).e;
  assert.deepEqual(faces.items, [{ id: 'bob1', avatar: JPG, look: {} }]); // 공용 faces 알림은 look(꾸미기)도 싣는다
  assert.equal(JSON.stringify(cs[0].sock.msgs.filter((m) => m.t === 'room')).includes('data:image'), false);
});

test('a yacht room timer error does not break poker rooms; reset leaves no rooms', async () => {
  const { hub, clock } = setup();
  const y = await lobby(hub, 'yacht', ['ann1', 'bob1']);
  const p = await lobby(hub, 'holdem', ['cat1', 'dan1']);
  const room = hub.rooms.get(y.code);
  room.leave = () => { throw new Error('boom'); };
  const orig = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    y.cs[1].conn.close(); // 유예 타이머가 켜진다
    clock.advance(hub.timing.grace + 1); // 타이머 안에서 던져도 서버는 계속 돈다
  } finally {
    console.error = orig;
  }
  assert.ok(logged.some((l) => l.includes('timer failed')));
  await p.cs[0].send({ t: 'create', mode: 'holdem' }); // 방이 있어서 거절되지만 서버는 응답한다
  assert.equal(p.cs[0].sock.last('error').msg, '이미 방에 있습니다.');
  assert.equal(hub.rooms.size, 2);

  const anon = client(hub);
  await anon.send({ t: 'login', id: '초기화' });
  await anon.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(hub.rooms.size, 0);
});
