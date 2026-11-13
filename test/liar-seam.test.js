// 라이어게임 이음매 시험: 포커 서버(hub) 안에 라이어 방이 끼어드는 자리만 본다. 포커 시험은 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

const JPG = 'data:image/jpeg;base64,/9j/AAAA';
const OFF_MSG = '라이어게임은 아직 열리지 않았습니다.';
const events = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);

function setup(liar = 'on') {
  const clock = new FakeClock();
  const store = createStore();
  const hub = createHub({ store, rng: seeded(7), now: clock.now, timers: clock, liar });
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

test('me carries the liar switch (off by default)', async () => {
  for (const [opt, want] of [[undefined, 'off'], ['off', 'off'], ['test', 'test'], ['on', 'on']]) {
    const clock = new FakeClock();
    const hub = createHub({ store: createStore(), rng: seeded(1), now: clock.now, timers: clock, ...(opt ? { liar: opt } : {}) });
    const a = await login(hub, 'ann1');
    assert.equal(a.sock.last('me').liar, want);
  }
});

test('LIAR=off: liar room and rank are refused, poker still works', async () => {
  const { hub } = setup('off');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'liar' });
  assert.equal(a.sock.last('error').msg, OFF_MSG);
  assert.equal(a.state, null);
  assert.equal(hub.rooms.size, 0);
  await a.send({ t: 'lg', a: 'rank' });
  assert.equal(a.sock.last('error').msg, OFF_MSG);
  assert.equal(a.sock.last('lgRank'), undefined);
  await a.send({ t: 'create', mode: 'holdem' });
  assert.equal(a.state.mode, 'holdem');
});

test('LIAR=test and on: a liar room can be created (even with 0 chips)', async () => {
  for (const mode of ['test', 'on']) {
    const { hub } = setup(mode);
    const a = await login(hub, 'ann1');
    a.conn.session.user.bank = 0;
    await a.send({ t: 'create', mode: 'liar' });
    assert.equal(a.state.mode, 'liar', mode);
    assert.equal(a.sock.last('error'), undefined);
  }
});

test('liar room: capacity 8, room list shows mode liar and max 8', async () => {
  const { hub } = setup();
  const names = Array.from({ length: 8 }, (_, i) => `pl${i + 1}`);
  const { cs, code } = await lobby(hub, 'liar', names);
  assert.equal(cs[0].state.players.length, 8);
  const ninth = await login(hub, 'pl9');
  await ninth.send({ t: 'join', code });
  assert.equal(ninth.sock.last('error').msg, '방이 가득 찼습니다.');
  assert.equal(ninth.state, null);
  const watcher = await login(hub, 'wat1');
  const list = hub.roomList();
  assert.equal(list.length, 1);
  assert.equal(list[0].mode, 'liar');
  assert.equal(list[0].max, 8);
  assert.equal(list[0].count, 8);
  assert.ok(watcher);
});

test('liar room: poker messages are refused with a sentence, not a crash', async () => {
  const { hub } = setup();
  const { cs } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  for (const m of [{ t: 'mode', mode: 'holdem' }, { t: 'act', a: 'fold' }, { t: 'play', cards: [0] }, { t: 'liar' }]) {
    await cs[0].send(m);
    assert.equal(cs[0].sock.last('error').msg, '지금은 할 수 없습니다.', JSON.stringify(m));
  }
  assert.equal(cs[0].state.mode, 'liar');
});

test('poker room: lg is refused, mode liar is refused, poker keeps working', async () => {
  const { hub } = setup();
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'lg', a: 'vote' });
  assert.equal(cs[0].sock.last('error').msg, '알 수 없는 요청입니다.');
  await cs[0].send({ t: 'mode', mode: 'liar' });
  assert.equal(cs[0].sock.last('error').msg, '라이어게임은 방을 새로 만들어 주세요.');
  assert.equal(cs[0].state.mode, 'holdem');
  await cs[0].send({ t: 'mode', mode: 'bluff' });
  assert.equal(cs[0].state.mode, 'bluff');
});

test('lg envelope needs login and a room', async () => {
  const { hub } = setup();
  const anon = client(hub);
  await anon.send({ t: 'lg', a: 'vote' });
  assert.equal(anon.sock.last('error').msg, '먼저 로그인하세요.');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'lg', a: 'vote' });
  assert.equal(a.sock.last('error').msg, '방에 들어가 있지 않습니다.');
});

test('validation: lg envelope and create modes', () => {
  const parse = (o) => parseMessage(JSON.stringify(o));
  assert.deepEqual(parse({ t: 'lg', a: 'vote', target: 'x' }).msg, { t: 'lg', a: 'vote', target: 'x' });
  for (const a of [undefined, 5, '', null, 'x'.repeat(21)]) assert.equal(parse({ t: 'lg', a }).ok, false);
  for (const mode of ['holdem', 'bluff', 'liar']) assert.equal(parse({ t: 'create', mode }).ok, true, mode);
  assert.equal(parse({ t: 'create', mode: 'chess' }).ok, false);
});

test('mediaBlocked: a room that returns a sentence blocks emote/pemote/snd/sndAdd; poker room is unaffected', async () => {
  const { hub } = setup();
  const { cs, code } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  hub.rooms.get(code).impl.mediaBlocked = (session, kind) => (kind === 'pemote' || kind === 'snd' ? '지금은 쓸 수 없습니다.' : null);
  await cs[0].send({ t: 'pemote', data: JPG });
  assert.equal(cs[0].sock.last('error').msg, '지금은 쓸 수 없습니다.');
  assert.equal(events(cs[1], 'pemote').length, 0);
  await cs[0].send({ t: 'snd', sid: 'builtin:clap' });
  assert.equal(cs[0].sock.last('error').msg, '지금은 쓸 수 없습니다.');
  await cs[0].send({ t: 'emote', e: 1 });
  assert.equal(events(cs[1], 'emote').length, 1);

  const p = await lobby(hub, 'holdem', ['cat1', 'dan1']);
  await p.cs[0].send({ t: 'pemote', data: JPG });
  assert.equal(p.cs[0].sock.last('error'), undefined);
  assert.equal(events(p.cs[1], 'pemote').length, 1);
});

test('avatar: liar room sends faces (never in room.state); poker room just pushes', async () => {
  const { hub } = setup();
  const a = await login(hub, 'ann1');
  const b = await login(hub, 'bob1');
  await a.send({ t: 'create', mode: 'liar' });
  await b.send({ t: 'join', code: a.state.code });
  const before = events(b, 'faces').length;
  await a.send({ t: 'avatar', data: JPG });
  const faces = events(b, 'faces').slice(before);
  assert.deepEqual(faces, [{ k: 'faces', items: [{ id: 'ann1', avatar: JPG, look: {} }] }]); // 공용 faces 알림은 look(꾸미기)도 싣는다
  for (const c of [a, b]) assert.equal(JSON.stringify(c.sock.msgs.filter((m) => m.t === 'room')).includes('data:image'), false);

  // faceChanged is the only thing called when the room has it
  const room = hub.rooms.get(a.state.code);
  const seen = [];
  room.faceChanged = (s) => seen.push(s.id);
  let pushes = 0;
  const push = room.push.bind(room);
  room.push = () => { pushes++; push(); };
  await a.send({ t: 'avatar', data: JPG.replace('AAAA', 'BBBB') });
  assert.deepEqual(seen, ['ann1']);
  assert.equal(pushes, 0);

  // poker: same as before (state push, avatar inside the state)
  const p = await lobby(hub, 'holdem', ['cat1', 'dan1']);
  await p.cs[0].send({ t: 'avatar', data: JPG });
  assert.equal(p.cs[1].state.players.find((x) => x.id === 'cat1').avatar, JPG);
  assert.equal(events(p.cs[1], 'faces').length, 0);
});

async function setScore(hub, id, score, games) {
  const u = hub.sessions.get(id).user;
  u.stats.liar = { score, games, wins: 0, liarGames: 0, liarWins: 0 };
  u.avatar = JPG;
  await hub.store.save(u);
}

test('lgRank: order score > fewer games > name, 20 max, zero left out, mine, no photos, works in a room', async () => {
  const { hub } = setup();
  const anon = client(hub);
  await anon.send({ t: 'lg', a: 'rank' });
  assert.equal(anon.sock.last('error').msg, '먼저 로그인하세요.');

  const me = await login(hub, 'meme1');
  await me.send({ t: 'lg', a: 'rank' });
  assert.deepEqual(me.sock.last('lgRank'), { t: 'lgRank', top: [], mine: { rank: null, score: 0 } });

  await setScore(hub, 'meme1', 5, 4);
  for (const [n, s, g] of [['bb1', 9, 3], ['aa1', 5, 4], ['cc1', 5, 2], ['zero1', 0, 1]]) {
    await login(hub, n);
    await setScore(hub, n, s, g);
  }
  for (let i = 0; i < 25; i++) {
    const n = `fill${String(i).padStart(2, '0')}`;
    await login(hub, n);
    await setScore(hub, n, 1, 1);
  }
  await me.send({ t: 'lg', a: 'rank' });
  let r = me.sock.last('lgRank');
  assert.equal(r.top.length, 20);
  assert.deepEqual(r.top.slice(0, 4).map((x) => x.name), ['bb1', 'cc1', 'aa1', 'meme1']);
  assert.deepEqual(r.top[0], { name: 'bb1', score: 9, games: 3 });
  assert.ok(!r.top.some((x) => x.name === 'zero1'));
  assert.deepEqual(r.mine, { rank: 4, score: 5 });
  assert.ok(!JSON.stringify(r).includes('data:image'));
  assert.deepEqual(await hub.store.liarRank('zero1'), { rank: null, score: 0 });

  await me.send({ t: 'create', mode: 'liar' });
  const before = me.sock.msgs.length;
  await me.send({ t: 'lg', a: 'rank' });
  assert.equal(me.sock.last('lgRank').mine.rank, 4);
  assert.equal(me.sock.msgs.slice(before).filter((m) => m.t === 'error').length, 0);
});

test('lgRank: a failing store answers only that player with a sentence', async () => {
  const { hub } = setup();
  const a = await login(hub, 'ann1');
  hub.store.topLiar = () => { throw new Error('db down'); };
  const origErr = console.error;
  console.error = () => {};
  try {
    await a.send({ t: 'lg', a: 'rank' });
  } finally {
    console.error = origErr;
  }
  assert.equal(a.sock.last('error').msg, '랭킹을 불러오지 못했습니다.');
});

test('old accounts without stats.liar work in the ranking and stay unchanged', async () => {
  const { hub, store } = setup();
  const a = await login(hub, 'ann1');
  const u = hub.sessions.get('ann1').user;
  assert.equal(u.stats.liar, undefined);
  await a.send({ t: 'lg', a: 'rank' });
  assert.deepEqual(a.sock.last('lgRank').mine, { rank: null, score: 0 });
  assert.equal((await store.getOrCreate('ann1', 'ann1')).stats.liar, undefined);
});

test('hub.close: every room gets flush() once and saves finish first; a reset does not flush', async () => {
  const { hub } = setup();
  const { cs, code } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  const room = hub.rooms.get(code);
  let calls = 0;
  room.flush = () => { calls++; hub.persist(cs[0].conn.session.user); };
  await hub.close();
  assert.equal(calls, 1);
  assert.equal(hub.pendingSaves.size, 0);

  const s2 = setup();
  const l2 = await lobby(s2.hub, 'liar', ['cat1', 'dan1']);
  let calls2 = 0;
  s2.hub.rooms.get(l2.code).flush = () => { calls2++; };
  s2.hub.resetting = true;
  await s2.hub.close();
  assert.equal(calls2, 0);
});

test('a throwing flush does not stop other rooms from flushing', async () => {
  const { hub } = setup();
  const l1 = await lobby(hub, 'liar', ['ann1', 'bob1']);
  const l2 = await lobby(hub, 'liar', ['cat1', 'dan1']);
  let ok = 0;
  hub.rooms.get(l1.code).flush = () => { throw new Error('boom'); };
  hub.rooms.get(l2.code).flush = () => { ok++; };
  const origErr = console.error;
  console.error = () => {};
  try {
    await hub.close();
  } finally {
    console.error = origErr;
  }
  assert.equal(ok, 1);
});

test('a liar room timer error does not break a poker room', async () => {
  const { hub, clock } = setup();
  const l = await lobby(hub, 'liar', ['ann1', 'bob1']);
  const p = await lobby(hub, 'holdem', ['cat1', 'dan1']);
  const room = hub.rooms.get(l.code);
  room.setTimer?.('boom', 10, () => { throw new Error('timer boom'); });
  if (!room.setTimer) hub.timers.setTimeout(hub.guard(() => { throw new Error('timer boom'); }), 10);
  const origErr = console.error;
  console.error = () => {};
  try {
    clock.advance(20);
  } finally {
    console.error = origErr;
  }
  await p.cs[0].send({ t: 'start' });
  assert.equal(p.cs[0].state.phase, 'playing');
});

test('liar scores reach the store when the hub closes (flush -> save)', async () => {
  const { hub, store } = setup();
  const { cs } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  const user = cs[0].conn.session.user;
  user.stats.liar = { score: 7, games: 2, wins: 1, liarGames: 1, liarWins: 0 };
  hub.persist(user);
  await hub.close();
  assert.equal((await store.getOrCreate('ann1', 'ann1')).stats.liar.score, 7);
  assert.deepEqual(store.topLiar(5), [{ name: 'ann1', score: 7, games: 2 }]);
});

test('mediaBlocked: sndRename is blocked like other media, sndDel is not', async () => {
  const { hub } = setup();
  const { cs, code } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  await cs[0].send({ t: 'sndAdd', sid: 'abc123', name: '박수', data: 'data:audio/webm;base64,AAAA' });
  hub.rooms.get(code).impl.mediaBlocked = (session, kind) => (kind === 'sndRename' ? '지금은 쓸 수 없습니다.' : null);
  await cs[0].send({ t: 'sndRename', sid: 'abc123', name: '새이름' });
  assert.equal(cs[0].sock.last('error').msg, '지금은 쓸 수 없습니다.');
  assert.equal(events(cs[1], 'sndRename').length, 0);
  await cs[0].send({ t: 'sndDel', sid: 'abc123' });
  assert.equal(events(cs[1], 'sndDel').length, 1);
});

test('conn.close: a room that throws in setConnected does not escape the ws close handler', async () => {
  const { hub } = setup();
  const { cs, code } = await lobby(hub, 'liar', ['ann1', 'bob1']);
  hub.rooms.get(code).setConnected = () => { throw new Error('boom'); };
  const orig = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => cs[1].conn.close());
  } finally {
    console.error = orig;
  }
});
