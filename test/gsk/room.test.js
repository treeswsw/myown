// 갱스껄 방 시험 (실제 허브 + 공용 방 틀 Shell + 가짜 시계): 접속→색→시작→놓기→경매→뒤집기→벌칙→판 끝→전적→대기실에서 다시 시작,
// 끊김 60초 기권·재접속, 관전자, 방장 넘김, 비밀(해골/꽃 구별 불가).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, drain } from '../lib/hub.js';
import { COLOR_HEX } from '../../shared/gsk/constants.js';
import { COLORS as ART_COLORS } from '../../client/src/gsk/art.js';

const GRACE = 60_000;
const AUD = 'data:audio/webm;base64,AAAA';
const IDS = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'];

// 난수는 늘 0(섞기·시작 사람이 정해진다). 방 하나에 n 명이 들어간 상태.
async function table(n) {
  const h = makeHub({ rng: () => 0 });
  const ps = [];
  for (const id of IDS.slice(0, n)) ps.push(await h.login(id));
  await ps[0].send({ t: 'create', mode: 'gsk' });
  const code = ps[0].state.code;
  for (const p of ps.slice(1)) await p.send({ t: 'join', code });
  const room = h.hub.rooms.get(code);
  const by = (id) => ps.find((p) => p.id === id);
  return { ...h, ps, code, room, by, st: (id = ps[0].id) => room.view(id), advance: (ms) => h.tick(ms) };
}
// 요청을 보내고 그 요청이 낳은 오류({code, msg}) 또는 null 을 돌려준다.
async function sendErr(p, msg) {
  const n = p.sock.msgs.length;
  await p.send(msg);
  return p.sock.msgs.slice(n).find((m) => m.t === 'error') ?? null;
}
const gk = (p, msg) => sendErr(p, { t: 'gk', ...msg });
const ok = async (p, msg) => assert.equal(await gk(p, msg), null, `${p.id} ${JSON.stringify(msg)}`);
const startBy = (p) => sendErr(p, { t: 'start' });
const events = (p, k) => p.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);
const lastRoom = (p) => p.sock.msgs.filter((m) => m.t === 'room').at(-1).state;
const statsOf = (t, id) => t.hub.sessions.get(id).user.stats.gsk;

// 한 라운드를 도전자가 성공하게 끝낸다(전부 꽃을 놓고, 시작 사람이 합계를 부르고, 남의 더미를 뒤집는다).
async function successRound(t) {
  const s0 = t.st();
  assert.equal(s0.step, 'setup');
  for (const seat of s0.seats) await ok(t.by(seat.id), { a: 'place', k: 'F' });
  const s1 = t.st();
  assert.equal(s1.step, 'turn');
  const ch = t.by(s1.turn);
  await ok(ch, { a: 'bid', n: s1.total });
  assert.equal(t.st().step, 'flip');
  await t.advance(600 + 3100); // 자기 더미 자동 공개(0.5초) + 그 장 연출
  for (const seat of t.st().seats) {
    if (seat.id === ch.id) continue;
    await ok(ch, { a: 'flip', p: seat.id });
    await t.advance(3100); // 연출(꽃 1.7초 + 애태우기 1.4초)이 끝나야 판정·다음 장
  }
  assert.equal(t.st().step, 'reveal');
  assert.equal(t.st().outcome.ok, true);
  return ch;
}

test('접속·색(pick)·시작 조건·방 목록 정보', async () => {
  const t = await table(2);
  assert.equal(t.room.mode, 'gsk');
  assert.equal(t.room.phase, 'lobby');
  assert.equal(t.room.hostId, 'a1');
  assert.deepEqual(t.room.listInfo().max, 6);
  const few = await startBy(t.ps[0]);
  assert.deepEqual([few.code, few.msg], ['gk_few', '3명 이상이 있어야 시작할 수 있습니다.']);
  assert.equal(t.st('a1').wait.can, false);
  const c = await t.login('c1');
  await c.send({ t: 'join', code: t.code });
  t.ps.push(c);
  assert.equal(t.st('a1').wait.can, true);
  assert.equal((await startBy(t.ps[1])).code, 'gk_host');
  // 색 고르기는 공통 대기실의 개인 칸(pick)
  assert.equal(await sendErr(t.ps[0], { t: 'pick', patch: { color: 2 } }), null);
  assert.equal((await sendErr(t.ps[1], { t: 'pick', patch: { color: 2 } })).code, 'gk_color');
  assert.equal(await sendErr(t.ps[1], { t: 'pick', patch: { color: 3 } }), null);
  assert.equal((await sendErr(t.ps[1], { t: 'pick', patch: { color: 9 } })).code, 'gk_bad');
  assert.equal((await sendErr(t.ps[1], { t: 'pick', patch: {} })).code, 'gk_bad');
  assert.equal(await sendErr(t.ps[2], { t: 'pick', patch: { color: 4 } }), null);
  const w = t.st('a1').wait;
  assert.deepEqual(w.own, { a1: { color: 2 }, b1: { color: 3 }, c1: { color: 4 } });
  assert.deepEqual(w.set, {});
  assert.deepEqual(t.st('a1').players.map((p) => p.color), ['#e4930d', '#d61b18', '#3da0bc']);
  assert.equal((await gk(t.ps[0], { a: 'bogus' })).code, 'gk_bad');
  assert.equal((await gk(t.ps[0], { a: 'place', k: 'F' })).code, 'gk_now'); // 아직 판 아님
  // 모든 사람이 받은 마지막 상태에 프로필 사진 칸이 없다
  for (const p of t.ps) assert.equal(JSON.stringify(lastRoom(p)).includes('avatar'), false);
  assert.equal(await startBy(t.ps[0]), null);
  const s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(s.step, 'setup');
  assert.equal(s.wait, null); // 판 중에는 대기실 값이 없다
  assert.equal(s.seats.find((x) => x.id === 'a1').color, 2); // 고른 색은 지킨다
  assert.equal(s.seats.find((x) => x.id === 'b1').color, 3);
  assert.equal(s.seats.find((x) => x.id === 'c1').color, 4);
  assert.equal(events(t.ps[0], 'gkStart').length, 1);
  assert.equal((await startBy(t.ps[0])).code, 'gk_now'); // 이미 진행 중
  assert.equal((await sendErr(t.ps[0], { t: 'pick', patch: { color: 0 } })).code, 'gk_now'); // 판 중에는 못 바꾼다
  const late = await t.login('zz1');
  await late.send({ t: 'join', code: t.code }); // 판 중 입장은 허용(관전)
  assert.equal(late.state.code, t.code);
});

test('한 판: 실패(벌칙)→성공 두 번으로 승리→전적 저장→결과 뒤 대기실에서 다시 시작', async () => {
  const t = await table(3);
  assert.equal(await startBy(t.ps[0]), null);
  // --- 1라운드: 실패. 시작 사람은 꽃, 한 명은 해골을 놓는다 ---
  const s0 = t.st();
  const ids = s0.seats.map((x) => x.id);
  const skullId = ids.find((id) => id !== s0.starter);
  for (const id of ids) await ok(t.by(id), { a: 'place', k: id === skullId ? 'S' : 'F' });
  const chId = t.st().turn;
  assert.equal(chId, s0.starter);
  const ch = t.by(chId);
  // 차례 아닌 사람은 못 부른다
  const other = t.ps.find((p) => p.id !== chId);
  assert.equal((await gk(other, { a: 'bid', n: 1 })).code, 'gk_turn');
  assert.equal((await gk(ch, { a: 'bid', n: 99 })).code, 'gk_bad'); // 모양 밖
  assert.equal((await gk(ch, { a: 'bid', n: 4 })).code, 'gk_bid'); // 합계(3) 초과
  await ok(ch, { a: 'bid', n: 3 });
  let s = t.st();
  assert.equal(s.step, 'flip');
  assert.equal(s.challenger, chId);
  assert.equal((await gk(ch, { a: 'flip', p: skullId })).code, 'gk_now'); // 자동 공개가 끝나기 전
  await t.advance(600);
  assert.equal(events(other, 'gkFlip').filter((e) => e.p === chId).length, 1);
  assert.equal((await gk(ch, { a: 'flip', p: skullId })).code, 'gk_now'); // 앞 장 연출 중
  await t.advance(3100);
  await ok(ch, { a: 'flip', p: skullId });
  assert.equal(t.st().step, 'flip'); // 해골 연출(3.1초) 동안 판정을 미룬다
  assert.equal(events(other, 'gkReveal').length, 0);
  await t.advance(3099);
  assert.equal(t.st().step, 'flip');
  await t.advance(1);
  s = t.st();
  assert.equal(s.step, 'reveal');
  assert.deepEqual(s.outcome, { ok: false, skullOf: skullId });
  assert.deepEqual(s.seats.find((x) => x.id === skullId).shown, ['S']);
  await t.advance(3500);
  s = t.st();
  assert.equal(s.step, 'penalty');
  assert.equal(s.penalty.by, chId);
  assert.equal(s.penalty.target, chId);
  assert.equal(s.penalty.faceUp, true);
  assert.equal(s.penalty.n, 4);
  assert.equal((await gk(t.by(skullId), { a: 'discard', k: 'F' })).code, 'gk_turn'); // 고르는 사람은 도전자
  assert.equal((await gk(ch, { a: 'discard', i: 0 })).code, 'gk_bad');
  await ok(ch, { a: 'discard', k: 'F' });
  // 잃은 종류는 도전자 본인에게만 따로 간다
  assert.equal(events(ch, 'gkLoseMine').length, 1);
  assert.equal(t.ps.filter((p) => p !== ch).every((p) => events(p, 'gkLoseMine').length === 0), true);
  assert.equal(t.ps.every((p) => events(p, 'gkLose').length === 1), true);
  s = t.st();
  assert.equal(s.step, 'between');
  assert.equal(s.seats.find((x) => x.id === chId).discs, 3);
  await t.advance(1500);
  s = t.st();
  assert.equal(s.step, 'setup');
  assert.equal(s.round, 2);

  // --- 2·3라운드: 같은 사람이 먼저 2점 ---
  const w1 = await successRound(t);
  await t.advance(3500 + 1500);
  assert.equal(t.st().step, 'setup');
  assert.equal(t.st().seats.find((x) => x.id === w1.id).points, 1);
  const w2 = await successRound(t);
  assert.equal(t.room.phase, 'playing');
  await t.advance(3500);
  s = t.st();
  assert.equal(s.phase, 'result');
  assert.equal(s.result.reason, 'points');
  assert.equal(s.result.winner, w2.id);
  assert.equal(t.room.phase, 'result');
  // 전적: 3명 모두 games 1, 승자만 wins 1
  for (const p of t.ps) {
    const st = statsOf(t, p.id);
    assert.equal(st.games, 1, p.id);
    assert.equal(st.wins, p.id === w2.id ? 1 : 0, p.id);
  }
  assert.equal(events(t.ps[0], 'gkEnd').length, 1);
  // 결과 화면은 대기 상태: 대기실 값(wait)이 있고, 방장만 다시 시작한다
  assert.ok(t.st('a1').wait);
  assert.equal((await startBy(t.by('b1'))).code, 'gk_host');
  assert.equal(await startBy(t.by('a1')), null);
  s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(s.gameNo, 2);
  assert.equal(s.round, 1);
  assert.equal(s.seats.every((x) => x.points === 0 && x.discs === 4), true);
  // 시간이 더 흘러도 전적은 한 번만
  await t.advance(120_000);
  assert.equal(statsOf(t, 'a1').games, 1);
});

test('결과 화면(대기 상태)에서도 색을 바꿀 수 있다', async () => {
  const t = await table(3);
  assert.equal(await startBy(t.ps[0]), null);
  // 둘이 나가 혼자 남으면 판이 끝난다(결과 화면)
  await t.by('b1').send({ t: 'leave' });
  await t.by('c1').send({ t: 'leave' });
  assert.equal(t.st('a1').phase, 'result');
  assert.equal(await sendErr(t.by('a1'), { t: 'pick', patch: { color: 5 } }), null);
  assert.equal(t.st('a1').wait.own.a1.color, 5);
});

test('끊김: 60초 안에 돌아오면 같은 상태, 지나면 기권(라운드 무효), 남은 한 명이 이긴다', async () => {
  const t = await table(3);
  assert.equal(await startBy(t.ps[0]), null);
  const [a, b, c] = t.ps;
  const userC = t.hub.sessions.get('c1').user;
  await ok(a, { a: 'place', k: 'F' });
  const strip = (v) => { const x = JSON.parse(JSON.stringify(v)); delete x.now; return x; };
  const before = strip(t.room.view('c1'));
  c.conn.close();
  assert.equal(events(a, 'away').at(-1).id, 'c1');
  assert.equal(t.st().waiting, 'c1'); // 아직 안 놓은 끊긴 사람을 기다린다
  assert.equal(t.st().players.find((p) => p.id === 'c1').awayUntil, t.clock.now() + GRACE);
  await t.advance(GRACE - 1000);
  assert.equal(t.st().phase, 'playing');
  const c2 = await t.login('c1'); // 같은 계정으로 다시 접속
  t.ps[2] = c2;
  assert.equal(events(a, 'back').at(-1).id, 'c1');
  const after = strip(t.room.view('c1'));
  assert.deepEqual({ ...after, players: before.players.map((p) => ({ ...p })) }, { ...before, players: before.players });
  assert.equal(after.players.find((p) => p.id === 'c1').connected, true);
  assert.equal(t.st().waiting, null); // 돌아왔으니 기다림 끝
  await t.advance(10 * GRACE); // 연결 중에는 시간 제한 없음
  assert.equal(t.st().phase, 'playing');
  assert.equal(t.st().step, 'setup');

  // 다시 끊고 60초
  c2.conn.close();
  await t.advance(GRACE + 1);
  let s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(events(a, 'gkOut').at(-1).reason, 'away');
  assert.equal(events(a, 'gkVoid').at(-1).reason, 'away');
  assert.equal(s.step, 'setup'); // 새 라운드
  assert.equal(s.round, 2);
  assert.equal(s.seats.find((x) => x.id === 'c1').out, 'away');
  assert.equal(userC.stats.gsk.games, 1); // 기권 순간 games + 1
  assert.equal(userC.stats.gsk.wins, 0);
  assert.equal(t.room.member('c1'), undefined); // 방에서도 빠짐
  assert.equal(t.room.impl.state.members.some((m) => m.id === 'c1'), false); // 엔진 멤버도 같이

  // 남은 b 도 끊기고 60초 → 혼자 남은 a 승리
  b.conn.close();
  await t.advance(GRACE + 1);
  s = t.st('a1');
  assert.equal(s.phase, 'result');
  assert.equal(s.result.reason, 'alone');
  assert.equal(s.result.winner, 'a1');
  assert.equal(statsOf(t, 'a1').wins, 1);
  assert.equal(statsOf(t, 'a1').games, 1);
});

test('판 도중 들어온 사람은 관전, 방장이 나가면 넘어가고 라운드는 무효', async () => {
  const t = await table(3);
  assert.equal(await startBy(t.ps[0]), null);
  const late = await t.login('d1');
  await late.send({ t: 'join', code: t.code });
  const v = t.room.view('d1');
  assert.equal(v.players.find((p) => p.id === 'd1').spectating, true);
  assert.equal(v.seats.some((x) => x.id === 'd1'), false);
  assert.equal(v.mine, null);
  assert.equal((await gk(late, { a: 'place', k: 'F' })).code, 'gk_now');
  // 관전자가 채팅·이모티콘을 보내면 모두에게 간다
  await late.send({ t: 'chat', text: '안녕' });
  await late.send({ t: 'emote', e: 2 });
  assert.equal(events(t.ps[0], 'chat').at(-1).text, '안녕');
  assert.equal(events(t.ps[0], 'emote').at(-1).id, 'd1');
  assert.deepEqual(events(late, 'chatLog')[0].items, []); // 들어올 때 받은 기록(그때는 비어 있음)
  // 방장이 나간다: 기권, 방장은 다음 사람
  const userA = t.hub.sessions.get('a1').user;
  await t.ps[0].send({ t: 'leave' });
  assert.equal(t.room.hostId, 'b1');
  assert.equal(t.room.impl.state.hostId, 'b1'); // 엔진 방장도 Shell 과 같다
  assert.equal(userA.stats.gsk.games, 1);
  assert.equal(events(t.ps[1], 'gkOut').at(-1).reason, 'leave');
  assert.equal(events(t.ps[1], 'left').at(-1).id, 'a1');
  assert.equal(t.st('b1').round, 2);
  // 한 명 더 나가면 혼자 남아 끝
  await t.ps[1].send({ t: 'leave' });
  const s = t.st('c1');
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 'c1');
  assert.equal(t.room.hostId, 'c1');
  // 관전자는 계속 방에 있고, 마지막 사람이 나가면 방이 지워진다
  await t.ps[2].send({ t: 'leave' });
  await late.send({ t: 'leave' });
  assert.equal(t.hub.rooms.has(t.code), true);
  await t.advance(60_001);
  assert.equal(t.hub.rooms.has(t.code), false);
});

test('대기 방에서 끊긴 사람은 60초 뒤 방에서 빠지고 방장이 넘어간다', async () => {
  const t = await table(3);
  t.ps[0].conn.close();
  assert.equal(t.st('b1').wait.can, false); // 접속 중 3명이 아님
  assert.equal(t.st('b1').wait.why.code, 'gk_few');
  await t.advance(GRACE + 1);
  assert.equal(t.room.member('a1'), undefined);
  assert.equal(t.room.hostId, 'b1');
  assert.equal(t.st('b1').players.length, 2);
});

test('채팅·소리: 요트 방처럼 막지 않는다', async () => {
  const t = await table(3);
  await t.ps[0].send({ t: 'chat', text: '하이' });
  assert.equal(events(t.ps[2], 'chat').at(-1).text, '하이');
  assert.equal(await sendErr(t.ps[0], { t: 'sndAdd', sid: 'tst0001', name: '짝', data: AUD }), null);
  assert.equal(events(t.ps[1], 'sndAdd').at(-1).sid, 'tst0001');
  assert.equal(await sendErr(t.ps[1], { t: 'snd', sid: 'tst0001' }), null);
  assert.equal(events(t.ps[0], 'snd').at(-1).sid, 'tst0001');
  assert.ok(await sendErr(t.ps[2], { t: 'sndRename', sid: 'tst0001', name: '남' })); // 올린 사람·방장만 고친다
  assert.equal(await sendErr(t.ps[0], { t: 'sndRename', sid: 'tst0001', name: '새' }), null);
});

test('ctx.finish: 갱스껄 코인(coin:gsk) — 혼자 남은 판(alone)은 지급·알림 없이 끝난다', async () => {
  const t = await table(3);
  assert.equal(t.room.entry.coin, 'gsk');
  assert.equal(await startBy(t.ps[0]), null);
  await t.by('b1').send({ t: 'leave' });
  await t.by('c1').send({ t: 'leave' });
  assert.equal(t.st('a1').phase, 'result');
  assert.equal(t.ps[0].sock.msgs.some((m) => m.t === 'coin'), false);
});

// ---- 비밀: 남이 받는 메시지는 꽃을 놓든 해골을 놓든 글자까지 같다 ----

async function secretRun(kind) {
  const t = await table(3);
  assert.equal(await startBy(t.ps[0]), null);
  const spec = await t.login('d1');
  await spec.send({ t: 'join', code: t.code });
  const s0 = t.st();
  const first = s0.seats[0].id; // 놓는 사람(해골/꽃)
  const everyone = s0.seats.map((x) => x.id);
  await ok(t.by(first), { a: 'place', k: kind });
  for (const id of everyone) if (id !== first) await ok(t.by(id), { a: 'place', k: 'F' });
  // 차례 단계에서 시작 사람이 한 장 더 쌓는다(종류는 같게)
  await ok(t.by(t.st().turn), { a: 'place', k: 'F' });
  await t.advance(5000);
  await drain();
  return { t, spec, first };
}

test('비밀: 해골을 놓은 사람 외 모든 소켓(다른 두 명·관전자)의 메시지에 해골이 없고 꽃일 때와 같다', async () => {
  const F = await secretRun('F');
  const S = await secretRun('S');
  assert.equal(F.first, S.first);
  const viewers = (r) => [...r.t.ps.filter((p) => p.id !== r.first), r.spec];
  const fv = viewers(F), sv = viewers(S);
  assert.equal(sv.length, 3);
  for (let i = 0; i < sv.length; i++) {
    const a = fv[i].sock.raw, b = sv[i].sock.raw;
    assert.equal(a.length, b.length, `메시지 개수 ${sv[i].id}`);
    assert.deepEqual(b, a, `메시지 글자 ${sv[i].id}`);
    for (const raw of b) {
      // 본인 몫(mine)은 자기 것이니 빼고 본다: 이 사람들이 놓은 것은 모두 꽃이다
      const m = JSON.parse(raw);
      if (m.t === 'room' && m.state) {
        assert.ok(m.state.mine === null || m.state.mine.stack.every((k) => k === 'F'), `mine 이 남의 것 ${sv[i].id}`);
        delete m.state.mine;
      }
      assert.equal(JSON.stringify(m).includes('"S"'), false, `해골 글자 ${sv[i].id}: ${raw.slice(0, 200)}`);
    }
  }
  // 놓은 본인에게는 mine 이 있고 종류가 보인다
  const own = lastRoom(S.t.by(S.first));
  assert.ok(own.mine);
  assert.equal(own.mine.stack[0], 'S'); // 놓은 순서대로 아래부터
  assert.equal(own.mine.hand.S, 0); // 해골은 손에서 나감
  // 관전자는 mine 이 없다
  assert.equal(lastRoom(S.spec).mine, null);
});

test('비밀: 대기실 값(wait)에는 색·이름 말고 판 안의 것이 없다', async () => {
  const t = await table(3);
  const w = t.st('a1').wait;
  assert.deepEqual(Object.keys(w).sort(), ['can', 'own', 'set', 'why']);
  for (const o of Object.values(w.own)) assert.deepEqual(Object.keys(o), ['color']);
});

test('서버가 대기실에 싣는 색 점(COLOR_HEX)은 화면 그림의 대표색(art.js base)과 같다', () => {
  assert.deepEqual([...COLOR_HEX], ART_COLORS.map((c) => c.base));
});
