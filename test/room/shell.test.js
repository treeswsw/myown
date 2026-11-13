// 공용 방 Shell (docs/COMMON-CONTRACT.md 1-5) 을 가짜 게임(test/lib/dummyGame.js)으로 시험한다. 실제 허브 + 가짜 시계.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, events, errors, freeLimits } from '../lib/hub.js';
import { addDummyRoom } from '../lib/dummyGame.js';

const JPG = 'data:image/jpeg;base64,/9j/AAAA';
const JPG2 = 'data:image/jpeg;base64,/9j/BBBB';
const AUD = 'data:audio/webm;base64,AAAA';
const GRACE = 60_000;

async function setup(n = 3, opt = {}, hubOpts = {}) {
  const h = makeHub(hubOpts);
  const room = addDummyRoom(h.hub, opt);
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1'].slice(0, n)) {
    const c = await h.login(id);
    await c.send({ t: 'join', code: 'DUMY' });
    cs.push(c);
  }
  return { ...h, room, cs, calls: () => room.impl.calls };
}
const lastErr = (c) => errors(c).at(-1);
const mark = (c) => c.sock.msgs.length;
const since = (c, i) => c.sock.msgs.slice(i);

test('입장: 상태 공통 칸, joined·faces(look)·chatLog·extrasFor, 방 목록 listInfo', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  const st = b.state;
  assert.equal(st.code, 'DUMY');
  assert.equal(st.mode, 'dummy');
  assert.equal(st.hostId, 'ann1');
  assert.equal(st.you, 'bob1');
  assert.equal(st.phase, 'lobby');
  assert.equal(typeof st.now, 'number');
  assert.deepEqual(st.specs, []);
  assert.deepEqual(st.players.map((p) => [p.id, p.name, p.connected, p.awayUntil, p.spectating, p.color]),
    [['ann1', 'ann1', true, null, false, null], ['bob1', 'bob1', true, null, false, null]]);
  assert.equal(st.players[0].avatar, undefined, '상태에 사진 없음');
  assert.equal(st.secret, null);
  assert.equal(a.state.secret, 'host-only', '게임 view 는 사람마다');
  assert.deepEqual(events(a, 'joined').map((e) => e.id), ['ann1', 'bob1']);
  assert.ok(events(b, 'chatLog').length >= 1);
  assert.deepEqual(events(b, 'faces').at(-1).items.map((x) => x.id), ['ann1', 'bob1']);
  assert.deepEqual(events(b, 'faces').at(-1).items[0].look, {});
  assert.deepEqual(events(a, 'faces').at(-1).items.map((x) => x.id), ['bob1'], '남들에게는 들어온 사람 얼굴만');
  assert.deepEqual(events(b, 'dmSync').at(-1), { k: 'dmSync', id: 'bob1' });
  const out = await r.login('zed1');
  await r.tick(600);
  const row = out.sock.last('rooms').list.find((x) => x.code === 'DUMY');
  assert.deepEqual(row, { code: 'DUMY', mode: 'dummy', hostName: 'ann1', count: 2, max: 3, phase: 'lobby', game: 'dummy' });
});

test('입장 되돌리기: onJoin 이 오류면 멤버·방장이 그대로, 방이 비면 gc', async () => {
  const r = await setup(1);
  const no = await r.login('nope1');
  await no.send({ t: 'join', code: 'DUMY' });
  assert.equal(lastErr(no).code, 'dm_bad');
  assert.equal(no.state, null);
  assert.deepEqual(r.room.members.map((m) => m.id), ['ann1']);
  assert.equal(r.room.hostId, 'ann1');
  assert.equal(r.hub.sessions.get('nope1').room, null);
  // 빈 방에 첫 사람이 실패해도 방은 gc 로 지워진다
  const h = makeHub();
  addDummyRoom(h.hub);
  const n2 = await h.login('nope2');
  await n2.send({ t: 'join', code: 'DUMY' });
  assert.equal(h.hub.rooms.get('DUMY').hostId, null);
  await h.tick(GRACE + 1);
  assert.equal(h.hub.rooms.has('DUMY'), false);
});

test('정원: entry.max 넘으면 dm_full', async () => {
  const r = await setup(3);
  const d = await r.login('dan1');
  await d.send({ t: 'join', code: 'DUMY' });
  assert.equal(lastErr(d).code, 'dm_full');
  assert.equal(lastErr(d).msg, '방이 가득 찼습니다.');
});

test('끊김 유예: away(onAway 이벤트)·awayUntil, 시간 안에 돌아오면 back, 넘으면 leave(away)', async () => {
  const r = await setup(3);
  const [a, b, c] = r.cs;
  b.conn.close();
  assert.deepEqual(events(a, 'away').at(-1), { k: 'away', id: 'bob1' });
  assert.deepEqual(events(a, 'dmAway').at(-1), { k: 'dmAway', id: 'bob1' });
  const p = a.state.players.find((x) => x.id === 'bob1');
  assert.equal(p.connected, false);
  assert.equal(p.awayUntil, r.clock.now() + GRACE);
  await r.tick(GRACE - 10);
  const b2 = await r.login('bob1');
  assert.deepEqual(events(a, 'back').at(-1), { k: 'back', id: 'bob1' });
  assert.equal(events(a, 'dmBack').length, 1);
  assert.equal(b2.state.you, 'bob1', '다시 붙으면 상태');
  assert.ok(events(b2, 'chatLog').length >= 1, '다시 붙으면 extras');
  await r.tick(GRACE);
  assert.ok(r.room.member('bob1'), '돌아왔으니 안 나감');
  // 이번엔 유예가 끝난다
  c.conn.close();
  await r.tick(GRACE + 1);
  assert.equal(r.room.member('cat1'), undefined);
  assert.deepEqual(r.calls().find((x) => x[0] === 'leave'), ['leave', 'cat1', 'away', true], 'onLeave 는 멤버가 아직 있을 때, reason away');
  assert.deepEqual(events(a, 'left').at(-1), { k: 'left', id: 'cat1', name: 'cat1' });
  assert.deepEqual(events(a, 'dmLeft').at(-1), { k: 'dmLeft', id: 'cat1' });
  assert.equal(r.hub.sessions.has('cat1'), false, '연결 없는 사람 세션은 지운다');
});

test('방장: 나가면 연결된 사람 중 먼저 온 사람, 모두 끊겼으면 맨 앞. onHost 를 부른다', async () => {
  const r = await setup(3);
  const [a, b] = r.cs;
  b.conn.close();
  await a.send({ t: 'leave' });
  assert.equal(r.room.hostId, 'cat1');
  assert.deepEqual(r.calls().filter((x) => x[0] === 'host'), [['host', 'cat1']]);
  assert.equal(a.state, null, '나간 사람은 room:null');
  // 모두 끊김: 맨 앞
  const r2 = await setup(3);
  r2.cs[1].conn.close();
  r2.cs[2].conn.close();
  await r2.cs[0].send({ t: 'leave' });
  assert.equal(r2.room.hostId, 'bob1');
});

test('빈 방: onEmpty + 게임 타이머 전부 해제 + gc', async () => {
  const r = await setup(1);
  const [a] = r.cs;
  await a.send({ t: 'yt', a: 'tick' });
  await a.send({ t: 'leave' });
  assert.ok(r.calls().some((x) => x[0] === 'empty'));
  await r.tick(2000);
  assert.equal(r.room.impl.ticks, 0, '게임 타이머가 지워졌다');
  assert.equal(r.hub.rooms.has('DUMY'), true, 'gc 전');
  await r.tick(GRACE);
  assert.equal(r.hub.rooms.has('DUMY'), false);
});

test('ctx.timer 는 돈다, ctx.drop 은 Shell.leave 로 간다', async () => {
  const r = await setup(2);
  const [a] = r.cs;
  await a.send({ t: 'yt', a: 'tick' });
  await r.tick(1000);
  assert.equal(r.room.impl.ticks, 1);
  await a.send({ t: 'yt', a: 'drop', id: 'bob1' });
  assert.equal(r.room.member('bob1'), undefined);
  assert.deepEqual(r.calls().find((x) => x[0] === 'leave'), ['leave', 'bob1', 'away', true]);
  await a.send({ t: 'yt', a: 'drop', id: 'nobody' }); // 이미 없으면 무시
  assert.equal(lastErr(a), undefined);
});

test('ctx.emit(to)·sendTo·pushTo 는 그 사람에게만', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  const ib = mark(b);
  const ia = mark(a);
  await a.send({ t: 'yt', a: 'ping' });
  assert.equal(events(a, 'pong').length, 1);
  assert.ok(since(a, ia).some((m) => m.t === 'dmRaw'));
  assert.ok(since(a, ia).some((m) => m.t === 'room'));
  assert.deepEqual(since(b, ib), []);
});

test('시작: 방장만(dm_host), canStart 이유, 진행 중이면 dm_now, 성공하면 push', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  await b.send({ t: 'start' });
  assert.deepEqual(lastErr(b), { t: 'error', msg: '방장만 시작할 수 있습니다.', code: 'dm_host' });
  b.conn.close();
  await a.send({ t: 'start' });
  assert.equal(lastErr(a).code, 'dm_need2');
  await r.login('bob1');
  await a.send({ t: 'start' });
  assert.equal(a.state.phase, 'play');
  assert.equal(a.state.wait, null, '게임 중에는 wait 없음');
  await a.send({ t: 'start' });
  assert.equal(lastErr(a).code, 'dm_now');
});

test('wait.why: 대기 중에만, canStart 결과 그대로', async () => {
  const r = await setup(1);
  const [a] = r.cs;
  assert.deepEqual(a.state.wait, { can: false, why: { msg: '2명이 필요합니다.', code: 'dm_need2' }, set: { speed: 1 }, own: {} });
  const b = await r.login('bob1');
  await b.send({ t: 'join', code: 'DUMY' });
  assert.deepEqual(a.state.wait, { can: true, why: null, set: { speed: 1 }, own: {} });
});

test('강퇴: 방장·대기 중·자기 아님·멤버. 대상은 dm_kicked 다음 room:null', async () => {
  const r = await setup(3);
  const [a, b, c] = r.cs;
  await b.send({ t: 'kick', id: 'cat1' });
  assert.equal(lastErr(b).code, 'dm_host');
  await a.send({ t: 'kick', id: 'ann1' });
  assert.equal(lastErr(a).code, 'dm_bad');
  await a.send({ t: 'kick', id: 'zzz1' });
  assert.equal(lastErr(a).code, 'dm_bad');
  const ic = mark(c);
  await a.send({ t: 'kick', id: 'cat1' });
  const got = since(c, ic);
  const ei = got.findIndex((m) => m.t === 'error');
  assert.deepEqual(got[ei], { t: 'error', msg: '방장이 내보냈습니다.', code: 'dm_kicked' });
  assert.ok(got.findIndex((m) => m.t === 'room' && m.state === null) > ei);
  assert.deepEqual(r.calls().find((x) => x[0] === 'leave'), ['leave', 'cat1', 'kick', true]);
  assert.deepEqual(r.room.members.map((m) => m.id), ['ann1', 'bob1']);
  await a.send({ t: 'start' });
  await a.send({ t: 'kick', id: 'bob1' });
  assert.equal(lastErr(a).code, 'dm_now');
});

test('set/pick: set 은 방장+대기, pick 은 본인+대기, 게임 검사 오류, 성공하면 wait 에 보인다', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  await b.send({ t: 'set', patch: { speed: 2 } });
  assert.equal(lastErr(b).code, 'dm_host');
  await a.send({ t: 'set', patch: { speed: 9 } });
  assert.equal(lastErr(a).code, 'dm_val');
  await a.send({ t: 'set', patch: { speed: 3 } });
  assert.equal(b.state.wait.set.speed, 3);
  await b.send({ t: 'pick', patch: { color: 'red' } });
  assert.deepEqual(a.state.wait.own, { bob1: { color: 'red' } });
  assert.equal(a.state.players.find((p) => p.id === 'bob1').color, 'red');
  await a.send({ t: 'pick', patch: { color: 'red' } });
  assert.equal(lastErr(a).code, 'dm_taken');
  await a.send({ t: 'set', patch: 'x' });
  assert.equal(lastErr(a).msg, '잘못된 메시지 형식입니다.');
  await a.send({ t: 'start' });
  await a.send({ t: 'set', patch: { speed: 1 } });
  assert.equal(lastErr(a).code, 'dm_now');
  await b.send({ t: 'pick', patch: { color: 'blue' } });
  assert.equal(lastErr(b).code, 'dm_now');
});

test('판 끝: 결과도 대기 상태(바로 시작), finish -> award 한 번(두 번째는 무시)', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  await a.send({ t: 'start' });
  const origErr = console.error;
  const logged = [];
  console.error = (...x) => logged.push(x.join(' '));
  try {
    await b.send({ t: 'yt', a: 'end' });
    await b.send({ t: 'yt', a: 'finishAgain' });
  } finally {
    console.error = origErr;
  }
  const got = (c) => c.sock.msgs.filter((m) => m.t === 'coin' && m.a === 'got');
  assert.deepEqual(got(b).map((m) => [m.n, m.mode, m.win]), [[2, 'bluff', true]]);
  assert.deepEqual(got(a).map((m) => [m.n, m.win]), [[1, false]]);
  assert.equal(logged.length, 1, '두 번째 finish 는 console.error');
  assert.equal(a.state.phase, 'end');
  assert.equal(a.state.wait.can, true, '결과 화면도 대기');
  await a.send({ t: 'start' });
  assert.equal(a.state.phase, 'play', '결과에서 바로 다시 시작');
});

test('요청 분배: 다른 게임 글자는 dm_now / dm_bad, 자기 봉투는 onAction', async () => {
  const r = await setup(2);
  const [a] = r.cs;
  await a.send({ t: 'act', a: 'fold' });
  assert.deepEqual(lastErr(a), { t: 'error', msg: '지금은 할 수 없습니다.', code: 'dm_now' });
  await a.send({ t: 'mode', mode: 'bluff' });
  assert.equal(lastErr(a).code, 'dm_now');
  await a.send({ t: 'dr', a: 'pick', i: 0 });
  assert.deepEqual(lastErr(a), { t: 'error', msg: '알 수 없는 요청입니다.', code: 'dm_bad' });
  await a.send({ t: 'yt', a: 'nope' });
  assert.equal(lastErr(a).msg, '모르는 요청');
});

test('채팅: 길이(entry.chat.maxLen) -> chatCheck -> 속도 -> 기록(entry.chat.log 개) -> 방송, kind', async () => {
  const mute = new Set();
  const r = await setup(2, { mute });
  const [a, b] = r.cs;
  await a.send({ t: 'chat', text: 'x'.repeat(21) });
  assert.equal(lastErr(a).msg, '채팅은 1~20자여야 합니다.');
  await a.send({ t: 'chat', text: 'hi' });
  assert.deepEqual(events(b, 'chat').at(-1), { k: 'chat', id: 'ann1', name: 'ann1', text: 'hi', ts: r.clock.now(), kind: 'talk' });
  await a.send({ t: 'chat', text: 'again' });
  assert.equal(lastErr(a).msg, '채팅을 너무 빨리 보내고 있습니다');
  mute.add('bob1');
  await b.send({ t: 'chat', text: 'no' });
  assert.equal(lastErr(b).code, 'dm_mute');
  for (const t of ['c1', 'c2', 'c3']) { await r.tick(1100); await a.send({ t: 'chat', text: t }); }
  const c = await r.login('cat1');
  await c.send({ t: 'join', code: 'DUMY' });
  assert.deepEqual(events(c, 'chatLog').at(-1).items.map((x) => x.text), ['c1', 'c2', 'c3'], '기록은 log 개까지');
});

test('chatOwn: Shell 은 기록·속도를 하지 않고, 들어올 때 chatLogFor 를 보낸다', async () => {
  const r = await setup(2, { chatOwn: true });
  const [a, b] = r.cs;
  await a.send({ t: 'chat', text: 'one' });
  await a.send({ t: 'chat', text: 'two' });
  assert.equal(lastErr(a), undefined, '속도 제한 없음(게임 몫)');
  assert.deepEqual(events(b, 'chat').map((e) => [e.text, e.own]), [['one', true], ['two', true]]);
  b.conn.close();
  const b2 = await r.login('bob1');
  assert.deepEqual(events(b2, 'chatLog').at(-1).items, []);
  const a2 = await r.login('ann1');
  assert.deepEqual(events(a2, 'chatLog').at(-1).items.map((x) => x.text), ['one', 'two']);
});

test('매체: mediaBlocked 가 막는다(sndDel 은 안 막음), 막힌 동안 바꾼 사진은 풀릴 때 보낸다(heldFaces)', async () => {
  const block = { on: false };
  const r = await setup(2, { block });
  const [a, b] = r.cs;
  await a.send({ t: 'emote', e: 1 });
  assert.deepEqual(events(b, 'emote').at(-1), { k: 'emote', id: 'ann1', e: 1 });
  await a.send({ t: 'sndAdd', sid: 'abc123', name: 'boom', data: AUD });
  block.on = true;
  freeLimits(r.hub);
  for (const k of [{ t: 'emote', e: 0 }, { t: 'pemote', data: JPG }, { t: 'snd', sid: 'builtin:clap' }, { t: 'sndRename', sid: 'abc123', name: 'x' }]) {
    await a.send(k);
    assert.equal(lastErr(a).code, 'dm_media', k.t);
  }
  await a.send({ t: 'sndDel', sid: 'abc123' });
  assert.deepEqual(events(b, 'sndDel').at(-1), { k: 'sndDel', sid: 'abc123' });
  const before = events(b, 'faces').length;
  await a.send({ t: 'avatar', data: JPG2 });
  assert.equal(events(b, 'faces').length, before, '막힌 동안은 사진을 안 보낸다');
  await b.send({ t: 'yt', a: 'ping' }); // pushTo 는 사진을 풀지 않는다
  assert.equal(events(b, 'faces').length, before);
  const b2 = await r.login('bob1'); // 다시 붙은 사람도 바뀌기 전 사진을 본다
  assert.equal(events(b2, 'faces').at(-1).items.find((x) => x.id === 'ann1').avatar, null);
  block.on = false;
  await a.send({ t: 'set', patch: { speed: 2 } }); // 아무 push
  assert.deepEqual(events(b2, 'faces').at(-1).items.map((x) => [x.id, x.avatar]), [['ann1', JPG2]]);
});

test('소리: 계정 8개를 넘으면 가장 오래된 것을 지우고 sndDel 이 뒤따른다', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  for (let i = 0; i < 9; i++) {
    await a.send({ t: 'sndAdd', sid: `snd00${i}`, name: `s${i}`, data: AUD });
    await r.tick(10_001);
  }
  const tail = b.sock.msgs.filter((m) => m.t === 'event' && (m.e.k === 'sndAdd' || m.e.k === 'sndDel')).slice(-2).map((m) => [m.e.k, m.e.sid]);
  assert.deepEqual(tail, [['sndAdd', 'snd008'], ['sndDel', 'snd000']]);
  const c = await r.login('cat1');
  await c.send({ t: 'join', code: 'DUMY' });
  assert.deepEqual(events(c, 'sndList').at(-1).items.map((x) => x.sid), ['snd001', 'snd002', 'snd003', 'snd004', 'snd005', 'snd006', 'snd007', 'snd008']);
});

test('허브 close: flush 한 번 + 타이머 해제, 초기화는 flush 안 함', async () => {
  const r = await setup(2);
  await r.cs[0].send({ t: 'yt', a: 'tick' });
  r.cs[1].conn.close();
  await r.hub.close();
  assert.equal(r.calls().filter((x) => x[0] === 'flush').length, 1);
  await r.tick(GRACE * 2);
  assert.equal(r.room.impl.ticks, 0);
  assert.ok(r.room.member('bob1'), '유예 타이머도 지워졌다');
});
