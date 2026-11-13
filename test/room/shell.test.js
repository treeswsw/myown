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

test('입장 되돌리기: onJoin 이 던져도 멤버·방장이 그대로, 오류를 돌려준다', async () => {
  const r = await setup(1);
  const quiet = console.error; console.error = () => {};
  try {
    const x = await r.login('boom1');
    await x.send({ t: 'join', code: 'DUMY' });
    assert.equal(lastErr(x).code, 'dm_bad');
    assert.equal(x.state, null);
    assert.deepEqual(r.room.members.map((m) => m.id), ['ann1']);
    assert.equal(r.room.hostId, 'ann1');
    assert.equal(r.hub.sessions.get('boom1').room, null);
  } finally { console.error = quiet; }
});

test('나가기: onLeave·onHost·onEmpty 가 던져도 명단 제거·방장 넘김·빈 방 정리는 끝까지', async () => {
  const r = await setup(2, { boom: true });
  const [a, b] = r.cs;
  const quiet = console.error; console.error = () => {};
  try {
    await a.send({ t: 'leave' });
    assert.equal(a.state, null);
    assert.deepEqual(r.room.members.map((m) => m.id), ['bob1']);
    assert.equal(r.room.hostId, 'bob1');
    await b.send({ t: 'leave' });
    assert.equal(r.room.members.length, 0);
    await r.tick(GRACE + 1);
    assert.equal(r.hub.rooms.has('DUMY'), false, '빈 방은 gc 로 지워진다');
  } finally { console.error = quiet; }
});

test('끊긴 관전자(자리 없음)에게는 awayUntil 을 붙이지 않는다', async () => {
  const r = await setup(3, { spec: new Set(['cat1']) });
  const [a, b, c] = r.cs;
  b.conn.close();
  c.conn.close();
  const row = (id) => a.state.players.find((x) => x.id === id);
  assert.equal(row('bob1').awayUntil, r.clock.now() + GRACE);
  assert.equal(row('cat1').connected, false);
  assert.equal(row('cat1').awayUntil, null);
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

// ---- 관전 계정 (shared/spectator.js, SPEC 7-4) ----

test('관전 계정: 이름 규칙은 한 곳(관전 + 숫자)', async () => {
  const { isSpectatorId, SPEC_MAX } = await import('../../shared/spectator.js');
  assert.equal(SPEC_MAX, 4);
  for (const ok of ['관전1', '관전2', '관전10', '관전007']) assert.equal(isSpectatorId(ok), true, ok);
  for (const no of ['관전', '관전a', '관전1a', 'a관전1', '관전 1', '관전자1', '', null, 3]) assert.equal(isSpectatorId(no), false, String(no));
});

test('관전 계정: 정원 밖 specs 로 들어오고 게임 onJoin 을 부르지 않는다, 방 목록 인원에 안 셈', async () => {
  const r = await setup(3); // 정원 3 가득
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  assert.equal(lastErr(s), undefined, '정원이 차도 관전 자리로 들어온다');
  assert.deepEqual(r.room.members.map((m) => m.id), ['ann1', 'bob1', 'cat1']);
  assert.deepEqual(r.room.specs.map((m) => m.id), ['관전1']);
  assert.ok(!r.calls().some((c) => c[0] === 'join' && c[1] === '관전1'), 'onJoin 안 부름');
  for (const c of [...r.cs, s]) assert.deepEqual(c.state.specs, [{ id: '관전1', name: '관전1', connected: true }]);
  assert.equal(s.state.you, '관전1');
  assert.ok(!s.state.players.some((p) => p.id === '관전1'), '참가자 줄에 없음');
  assert.equal(s.state.secret, null, '게임 view 는 자리 없는 사람의 시점');
  assert.ok(events(s, 'chatLog').length >= 1 && events(s, 'faces').length >= 1 && events(s, 'dmSync').length >= 1, 'extras 를 받는다');
  assert.ok(events(r.cs[0], 'joined').some((e) => e.id === '관전1' && e.spec === true));
  const out = await r.login('zed1');
  await r.tick(600);
  assert.equal(out.sock.last('rooms').list.find((x) => x.code === 'DUMY').count, 3, '방 목록 인원은 참가자만');
});

test('관전 계정: 최대 4, 다섯째는 거절. 시작 인원에 안 셈, 방장 안 됨', async () => {
  const r = await setup(1);
  const ss = [];
  for (let i = 1; i <= 5; i++) { const c = await r.login(`관전${i}`); await c.send({ t: 'join', code: 'DUMY' }); ss.push(c); }
  assert.equal(r.room.specs.length, 4);
  assert.equal(lastErr(ss[4]).code, 'dm_specfull');
  assert.equal(ss[4].state, null);
  await r.cs[0].send({ t: 'start' });
  assert.equal(lastErr(r.cs[0]).code, 'dm_need2', '관전자 4명 + 참가자 1명은 시작 못 함');
  await ss[0].send({ t: 'start' });
  assert.equal(lastErr(ss[0]).code, 'dm_host');
  await r.cs[0].send({ t: 'leave' });
  assert.equal(r.room.hostId, null, '관전자에게 방장이 넘어가지 않는다');
});

test('관전 계정: 참가자가 0명이면 방을 닫고 관전자에게 알림, 참가자 없는 방에는 못 들어옴', async () => {
  const r = await setup(2);
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  await r.cs[0].send({ t: 'leave' });
  assert.ok(s.state, '참가자가 남아 있으면 그대로');
  await r.cs[1].send({ t: 'leave' });
  assert.equal(s.state, null, '방에서 나와 로비로');
  assert.equal(lastErr(s).code, 'dm_closed');
  assert.equal(r.room.specs.length, 0);
  assert.equal(r.hub.sessions.get('관전1').room, null);
  const s2 = await r.login('관전2');
  await s2.send({ t: 'join', code: 'DUMY' });
  assert.equal(lastErr(s2).code, 'dm_bad', '빈 방(지워지기 전)에 관전자만 들어갈 수 없다');
  await r.tick(GRACE + 1);
  assert.equal(r.hub.rooms.has('DUMY'), false, '빈 방은 지워진다');
});

test('관전 계정: 방을 만들 수 없다(안내 오류)', async () => {
  const h = makeHub();
  const s = await h.login('관전3');
  await s.send({ t: 'create', mode: 'yacht' });
  assert.equal(lastErr(s).code, 'spec_create');
  assert.match(lastErr(s).msg, /관전 계정은 방을 만들 수 없습니다/);
  assert.equal(h.hub.rooms.size, 0);
});

test('관전 계정: 게임 요청·개인 칸은 게임에 안 간다, 채팅·이모티콘은 게임 훅을 탄다, 방장이 게임 중에도 내보낸다', async () => {
  const mute = new Set();
  const block = { on: false };
  const r = await setup(2, { mute, block });
  const [a, b] = r.cs;
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  await a.send({ t: 'start' });
  const n = r.calls().length;
  await s.send({ t: 'yt', a: 'end' });
  assert.equal(lastErr(s).code, 'dm_spec');
  await s.send({ t: 'pick', patch: { color: 'red' } });
  assert.equal(lastErr(s).code, 'dm_spec');
  await s.send({ t: 'set', patch: { speed: 2 } });
  assert.equal(lastErr(s).code, 'dm_host');
  assert.equal(r.calls().length, n, '게임 훅을 부르지 않음');
  const i = mark(b);
  await s.send({ t: 'chat', text: '구경 중' });
  assert.ok(since(b, i).some((m) => m.t === 'event' && m.e.k === 'chat' && m.e.id === '관전1' && m.e.kind === 'talk'));
  mute.add('관전1');
  freeLimits(r.hub);
  await s.send({ t: 'chat', text: '막힘' });
  assert.equal(lastErr(s).code, 'dm_mute', '게임 chatCheck 가 관전자에게도');
  block.on = true;
  await s.send({ t: 'emote', e: 1 });
  assert.equal(lastErr(s).code, 'dm_media', '게임 mediaBlocked 가 관전자에게도');
  block.on = false;
  await s.send({ t: 'emote', e: 1 });
  assert.ok(events(a, 'emote').some((e) => e.id === '관전1'));
  await b.send({ t: 'kick', id: '관전1' });
  assert.equal(lastErr(b).code, 'dm_host');
  await a.send({ t: 'kick', id: '관전1' });
  assert.equal(s.state, null, '게임 중에도 관전자는 내보낼 수 있다');
  assert.ok(errors(s).some((e) => e.code === 'dm_kicked'));
  assert.ok(!r.calls().some((c) => c[0] === 'leave' && c[1] === '관전1'), 'onLeave 안 부름');
});

test('관전 계정: chatOwn 게임은 게임 중 관전자 채팅을 막고, 대기 중에는 Shell 길로 보낸다', async () => {
  const r = await setup(2, { chatOwn: true });
  const [a] = r.cs;
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  await s.send({ t: 'chat', text: '대기 중' });
  assert.equal(lastErr(s), undefined);
  assert.ok(events(a, 'chat').some((e) => e.id === '관전1' && !e.own), 'Shell 길(게임 chatOwn 아님)');
  await a.send({ t: 'start' });
  freeLimits(r.hub);
  await s.send({ t: 'chat', text: '게임 중' });
  assert.equal(lastErr(s).code, 'dm_spec');
});

test('관전 계정: 판 코인은 받지 않는다(게임이 줄에 넣어도 Shell 이 거른다)', async () => {
  const r = await setup(2);
  const [a, b] = r.cs;
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  await a.send({ t: 'start' });
  await b.send({ t: 'yt', a: 'endWithSpecs' });
  const got = (c) => c.sock.msgs.filter((m) => m.t === 'coin' && m.a === 'got');
  assert.equal(got(b).length, 1);
  assert.equal(got(a).length, 1);
  assert.equal(got(s).length, 0, '관전자 코인 없음');
});

test('관전 계정: 끊기면 유예 뒤 나간다(게임 훅 없음), 다시 붙으면 그대로', async () => {
  const r = await setup(2);
  const s = await r.login('관전1');
  await s.send({ t: 'join', code: 'DUMY' });
  s.conn.close();
  assert.equal(r.cs[0].state.specs[0].connected, false);
  const back = await r.login('관전1');
  assert.equal(back.state.you, '관전1');
  assert.equal(r.cs[0].state.specs[0].connected, true);
  back.conn.close();
  await r.tick(GRACE + 1);
  assert.equal(r.room.specs.length, 0);
  assert.ok(!r.calls().some((c) => ['away', 'back', 'leave'].includes(c[0]) && c[1] === '관전1'));
});
