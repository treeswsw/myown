import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

const JPG = 'data:image/jpeg;base64,/9j/AAAA';
const AUDIO = 'data:audio/webm;codecs=opus;base64,AAAA';
const parse = (obj) => parseMessage(JSON.stringify(obj));
const events = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);
// The room's sound list as a member who was there from the start sees it (a Shell room keeps its list private).
function heard(c) {
  const list = [];
  for (const e of c.sock.msgs.filter((m) => m.t === 'event').map((m) => m.e)) {
    if (e.k === 'sndList') list.splice(0, list.length, ...e.items.map((x) => ({ ...x })));
    else if (e.k === 'sndAdd') list.push({ sid: e.sid, by: e.by, name: e.name, data: e.data });
    else if (e.k === 'sndDel') { const i = list.findIndex((x) => x.sid === e.sid); if (i >= 0) list.splice(i, 1); }
    else if (e.k === 'sndRename') { const x = list.find((y) => y.sid === e.sid); if (x) x.name = e.name; }
  }
  return list;
}

async function setup(names = ['ann1', 'bob1']) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(51), now: clock.now, timers: clock });
  const cs = [];
  for (const n of names) {
    const c = client(hub);
    await c.send({ t: 'login', id: n });
    cs.push(c);
  }
  await cs[0].send({ t: 'create', mode: 'bluff' });
  for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
  return { clock, hub, cs };
}

test('validation: pemote', () => {
  assert.equal(parse({ t: 'pemote', data: JPG }).ok, true);
  for (const data of ['', 5, null, 'data:image/png;base64,/9j/AAAA', 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,/9j/AAA',
    'data:image/jpeg;base64,/9j/AA<>', 'data:image/jpeg;base64,/9j/' + 'A'.repeat(40 * 1024)]) {
    assert.equal(parse({ t: 'pemote', data }).ok, false, String(data).slice(0, 40));
  }
  assert.equal(parse({ t: 'pemote', data: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(40 * 1024 - 28) }).ok, true);
});

test('validation: sndAdd and snd', () => {
  const ok = { t: 'sndAdd', sid: 'abc123', name: ' 박수​ ', data: AUDIO };
  assert.deepEqual(parse(ok).msg, { t: 'sndAdd', sid: 'abc123', name: '박수', data: AUDIO });
  assert.equal(parse({ ...ok, data: 'data:audio/mpeg;base64,AAAA' }).ok, true);
  for (const bad of [{ sid: 'ABC123' }, { sid: 'abc' }, { sid: 'a'.repeat(17) }, { sid: 5 }, { name: '' }, { name: '​' }, { name: '123456789' },
    { name: 5 }, { data: 'data:image/jpeg;base64,/9j/AAAA' }, { data: 'data:audio/webm;base64,' }, { data: 'data:audio/webm;base64,AAA' },
    { data: 'data:text/html;base64,AAAA' }, { data: 'data:audio/webm,AAAA' }, { data: 'data:audio/webm;base64,AA$A' },
    { data: 'data:audio/webm;base64,' + 'A'.repeat(200 * 1024) }]) {
    assert.equal(parse({ ...ok, ...bad }).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(parse({ ...ok, data: 'data:audio/webm;base64,' + 'A'.repeat(200 * 1024 - 24) }).ok, true);
  assert.equal(parse({ t: 'snd', sid: 'builtin:clap' }).ok, true);
  assert.equal(parse({ t: 'snd', sid: 'abc123' }).ok, true);
  for (const sid of ['builtin:', 'builtin:Clap', 'builtin:a1', 'x', '', 5, 'abc 123']) assert.equal(parse({ t: 'snd', sid }).ok, false, String(sid));
});

test('size limits per message type: only sndAdd may exceed 70KB', () => {
  const big = 'A'.repeat(100_000);
  assert.equal(parseMessage(JSON.stringify({ t: 'chat', text: big })).ok, false);
  assert.equal(parseMessage(JSON.stringify({ t: 'sndAdd', sid: 'abc123', name: 'x', data: 'data:audio/webm;base64,' + big })).ok, true);
  assert.equal(parseMessage(JSON.stringify({ name: 'x', t: 'sndAdd', sid: 'abc123', data: 'data:audio/webm;base64,' + big })).ok, false, 't must come first for big frames');
  assert.equal(parseMessage('x'.repeat(300_001)).ok, false);
});

test('pemote reaches everyone incl. the sender, only as an event; limited per account across takeover', async () => {
  const { hub, clock, cs } = await setup();
  const rooms = cs.map((c) => c.sock.msgs.filter((m) => m.t === 'room').length);
  await cs[0].send({ t: 'pemote', data: JPG });
  for (const c of cs) assert.deepEqual(events(c, 'pemote'), [{ k: 'pemote', id: 'ann1', data: JPG }]);
  assert.deepEqual(cs.map((c) => c.sock.msgs.filter((m) => m.t === 'room').length), rooms);
  clock.advance(2999);
  const again = client(hub);
  await again.send({ t: 'login', id: 'ann1' });
  await again.send({ t: 'pemote', data: JPG });
  assert.equal(again.sock.last('error').msg, '사진 이모티콘을 너무 빨리 보내고 있습니다');
  assert.equal(events(cs[1], 'pemote').length, 1);
  clock.advance(1);
  await again.send({ t: 'pemote', data: JPG });
  assert.equal(events(cs[1], 'pemote').length, 2);
  await cs[1].send({ t: 'pemote', data: JPG });
  assert.equal(events(cs[1], 'pemote').length, 3, 'other accounts have their own budget');
});

test('sounds: add, play, limits per account, unknown sid, builtin', async () => {
  const { clock, cs } = await setup();
  await cs[0].send({ t: 'sndAdd', sid: 'abc123', name: '박수', data: AUDIO });
  for (const c of cs) assert.deepEqual(events(c, 'sndAdd'), [{ k: 'sndAdd', sid: 'abc123', by: 'ann1', name: '박수', data: AUDIO }]);
  await cs[0].send({ t: 'sndAdd', sid: 'abc124', name: 'x', data: AUDIO });
  assert.equal(cs[0].sock.last('error').msg, '소리를 너무 빨리 올리고 있습니다');
  await cs[1].send({ t: 'snd', sid: 'abc123' });
  assert.deepEqual(events(cs[0], 'snd'), [{ k: 'snd', id: 'bob1', sid: 'abc123' }]);
  await cs[1].send({ t: 'snd', sid: 'builtin:clap' });
  assert.equal(cs[1].sock.last('error').msg, '소리를 너무 빨리 재생하고 있습니다');
  clock.advance(2000);
  await cs[1].send({ t: 'snd', sid: 'builtin:clap' });
  assert.equal(events(cs[0], 'snd').at(-1).sid, 'builtin:clap');
  clock.advance(2000);
  await cs[1].send({ t: 'snd', sid: 'nope1234' });
  assert.equal(cs[1].sock.last('error').msg, '없는 소리입니다.');
  // same sid again by the owner: ignored; by someone else: refused
  clock.advance(10_000);
  await cs[0].send({ t: 'sndAdd', sid: 'abc123', name: 'dup', data: AUDIO });
  assert.equal(events(cs[1], 'sndAdd').length, 1);
  await cs[1].send({ t: 'sndAdd', sid: 'abc123', name: 'dup', data: AUDIO });
  assert.equal(cs[1].sock.last('error').msg, '이미 사용 중인 소리 번호입니다.');
});

test('caps: 8 per account (oldest of theirs evicted) and 24 per room', async () => {
  const names = ['ann1', 'bob1', 'cat1', 'dan1'];
  const { clock, hub, cs } = await setup(names);
  const add = async (c, i) => {
    clock.advance(10_000);
    await c.send({ t: 'sndAdd', sid: 's' + String(i).padStart(5, '0'), name: 'n' + i, data: AUDIO });
  };
  for (let i = 0; i < 10; i++) await add(cs[0], i);
  assert.deepEqual(heard(cs[3]).map((x) => x.sid), Array.from({ length: 8 }, (_, i) => 's' + String(i + 2).padStart(5, '0')));
  for (let i = 0; i < 8; i++) await add(cs[1], 100 + i);
  for (let i = 0; i < 8; i++) await add(cs[2], 200 + i);
  assert.equal(heard(cs[3]).length, 24);
  await add(cs[3], 300);
  assert.equal(heard(cs[3]).length, 24);
  assert.equal(heard(cs[3])[0].sid, 's00003', 'oldest overall evicted');
  assert.equal(heard(cs[3]).at(-1).by, 'dan1');
});

test('sndList on join and reconnect only when sounds exist, after room; no cross-room delivery; freed with the room', async () => {
  const { hub, clock, cs } = await setup();
  assert.equal(events(cs[0], 'sndList').length, 0, 'omitted when empty');
  await cs[0].send({ t: 'sndAdd', sid: 'abc123', name: '박수', data: AUDIO });
  const late = client(hub);
  await late.send({ t: 'login', id: 'cat1' });
  await late.send({ t: 'join', code: cs[0].state.code });
  assert.deepEqual(events(late, 'sndList'), [{ k: 'sndList', items: [{ sid: 'abc123', by: 'ann1', name: '박수', data: AUDIO }] }]);
  const order = late.sock.msgs.filter((m) => m.t === 'room' || (m.t === 'event' && ['chatLog', 'sndList'].includes(m.e.k))).map((m) => m.e?.k ?? m.t);
  assert.deepEqual(order.slice(-3), ['room', 'chatLog', 'sndList']);
  const back = client(hub);
  await back.send({ t: 'login', id: 'bob1' });
  assert.equal(events(back, 'sndList').length, 1);

  const other = client(hub);
  await other.send({ t: 'login', id: 'zed1' });
  await other.send({ t: 'create', mode: 'bluff' });
  clock.advance(10_000);
  await other.send({ t: 'pemote', data: JPG });
  await other.send({ t: 'snd', sid: 'abc123' });
  assert.equal(other.sock.last('error').msg, '없는 소리입니다.');
  assert.equal(events(cs[0], 'pemote').length, 0);
  assert.equal(events(other, 'sndList').length, 0);

  // everybody leaves: sounds go with the room after the GC delay
  for (const c of [cs[0], back, late]) await c.send({ t: 'leave' });
  const code = [...hub.rooms.keys()].find((k) => k !== other.state.code);
  assert.ok(hub.rooms.has(code), 'the empty room (and its sounds) waits for the GC delay');
  clock.advance(60_000);
  assert.ok(!hub.rooms.has(code));
});

test('allowed in every phase incl. spectators without touching the game', async () => {
  const { hub, clock, cs } = await setup();
  await cs[0].send({ t: 'start' });
  const spec = client(hub);
  await spec.send({ t: 'login', id: 'cat1' });
  await spec.send({ t: 'join', code: cs[0].state.code });
  const before = JSON.stringify(cs[0].state);
  await spec.send({ t: 'pemote', data: JPG });
  await spec.send({ t: 'sndAdd', sid: 'abc123', name: 'x', data: AUDIO });
  clock.advance(2000);
  await spec.send({ t: 'snd', sid: 'abc123' });
  assert.equal(events(cs[1], 'snd').length, 1);
  assert.equal(JSON.stringify(cs[0].state), before);
});

test('sound edit: owner and host may rename/delete, others may not; anyone may play', async () => {
  const { hub, clock, cs } = await setup(['host1', 'owner1', 'other1']);
  await cs[1].send({ t: 'sndAdd', sid: 'abc123', name: '박수', data: AUDIO });
  await cs[2].send({ t: 'snd', sid: 'abc123' });
  assert.equal(events(cs[0], 'snd').length, 1, 'any member can play any stored sound');
  await cs[2].send({ t: 'sndRename', sid: 'abc123', name: '남의것' });
  assert.equal(cs[2].sock.last('error').msg, '이 사운드를 수정할 권한이 없습니다.');
  clock.advance(1000);
  await cs[2].send({ t: 'sndDel', sid: 'abc123' });
  assert.equal(cs[2].sock.last('error').msg, '이 사운드를 수정할 권한이 없습니다.');
  assert.equal(events(cs[0], 'sndRename').length + events(cs[0], 'sndDel').length, 0);
  clock.advance(1000);
  await cs[1].send({ t: 'sndRename', sid: 'abc123', name: ' 새이름 ' });
  for (const c of cs) assert.deepEqual(events(c, 'sndRename'), [{ k: 'sndRename', sid: 'abc123', name: '새이름' }]);
  clock.advance(1000);
  await cs[0].send({ t: 'sndRename', sid: 'abc123', name: '방장' });
  assert.equal(events(cs[2], 'sndRename').at(-1).name, '방장');
  // sndList reflects the rename
  const late = client(hub);
  await late.send({ t: 'login', id: 'late1' });
  await late.send({ t: 'join', code: cs[0].state.code });
  assert.equal(events(late, 'sndList')[0].items[0].name, '방장');
  clock.advance(1000);
  await cs[0].send({ t: 'sndDel', sid: 'abc123' });
  for (const c of cs) assert.deepEqual(events(c, 'sndDel'), [{ k: 'sndDel', sid: 'abc123' }]);
  const back = client(hub);
  await back.send({ t: 'login', id: 'owner1' });
  assert.equal(events(back, 'sndList').length, 0, 'deleted sound is gone from sndList');
  clock.advance(1000);
  await cs[0].send({ t: 'sndDel', sid: 'abc123' });
  assert.equal(cs[0].sock.last('error').msg, '없는 소리입니다.');
  await cs[2].send({ t: 'snd', sid: 'abc123' });
  assert.equal(cs[2].sock.last('error').msg, '없는 소리입니다.');
});

test('sound edit: validation, 2 per second per account (survives takeover), eviction still correct', async () => {
  assert.equal(parse({ t: 'sndRename', sid: 'abc123', name: 'x' }).ok, true);
  for (const bad of [{ name: '' }, { name: '​' }, { name: '123456789' }, { sid: 'builtin:x' }, { sid: 'AB' }]) {
    assert.equal(parse({ t: 'sndRename', sid: 'abc123', name: 'x', ...bad }).ok, false, JSON.stringify(bad));
  }
  assert.equal(parse({ t: 'sndDel', sid: 'builtin:clap' }).ok, false, 'built-ins cannot be deleted');
  assert.equal(parse({ t: 'sndDel', sid: 'abc123' }).ok, true);

  const { hub, clock, cs } = await setup(['ann1', 'bob1']);
  for (let i = 0; i < 9; i++) {
    clock.advance(10_000);
    await cs[0].send({ t: 'sndAdd', sid: 's0000' + i, name: 'n' + i, data: AUDIO });
  }
  assert.deepEqual(heard(cs[1]).map((x) => x.sid), Array.from({ length: 8 }, (_, i) => 's0000' + (i + 1)), 'oldest evicted');
  clock.advance(5000);
  await cs[0].send({ t: 'sndRename', sid: 's00001', name: 'a' });
  await cs[0].send({ t: 'sndRename', sid: 's00002', name: 'b' });
  const again = client(hub);
  await again.send({ t: 'login', id: 'ann1' });
  await again.send({ t: 'sndRename', sid: 's00003', name: 'c' });
  assert.equal(again.sock.last('error').msg, '소리를 너무 빨리 수정하고 있습니다');
  clock.advance(1000);
  await again.send({ t: 'sndDel', sid: 's00003' });
  assert.equal(heard(cs[1]).length, 7);
  // deleting frees a slot of the per-account cap: the next upload evicts nothing
  clock.advance(10_000);
  await again.send({ t: 'sndAdd', sid: 'new0001', name: 'new', data: AUDIO });
  assert.equal(heard(cs[1]).length, 8);
  assert.ok(heard(cs[1]).some((x) => x.sid === 's00001' && x.name === 'a'));
});
