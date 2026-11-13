// 갱스껄 방 시험 (가짜 hub·가짜 시계): 접속→색→시작→놓기→경매→뒤집기→벌칙→판 끝→전적→한 판 더,
// 끊김 60초 기권·재접속, 관전자, 방장 넘김, 비밀(해골/꽃 구별 불가).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGskRoom } from '../../server/gsk/room.js';
import { FakeClock } from '../helpers.js';

const GRACE = 60_000;

function makeHub(clock = new FakeClock()) {
  const hub = {
    timers: clock, now: clock.now, timing: { grace: GRACE, roomGc: 60_000 },
    guard: (fn) => () => fn(),
    rooms: new Map(), sessions: new Map(),
    persisted: [],
    persist(user) { hub.persisted.push({ id: user.id, stats: JSON.parse(JSON.stringify(user.stats.gsk)) }); },
    send(session, obj) { session.conn?.send(obj); },
    sendMe(...ss) { for (const s of ss) hub.send(s, { t: 'me', gsk: 'on' }); },
    sendRooms() {},
    roomsChanged() {},
  };
  return { hub, clock };
}

// 이름에 S·F 글자를 쓰지 않는다(비밀 시험에서 "S" 글자 검색을 위해)
function person(hub, id) {
  const raw = [];
  const session = { id, user: { id, name: `이름${id}`, avatar: null, stats: {} }, conn: null, room: null };
  const open = () => { session.conn = { send: (obj) => raw.push(JSON.stringify(obj)) }; };
  open();
  hub.sessions.set(id, session);
  return { id, session, raw, open };
}

function table(n, { rnd = () => 0 } = {}) {
  const { hub, clock } = makeHub();
  const room = createGskRoom(hub, 'ABCD', { rnd });
  hub.rooms.set('ABCD', room);
  const ps = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'].slice(0, n).map((id) => person(hub, id));
  for (const p of ps) assert.equal(room.join(p.session), null);
  const by = (id) => ps.find((p) => p.id === id);
  return { hub, clock, room, ps, by, st: (id = ps[0].id) => room.view(id) };
}
const gk = (room, p, msg) => room.gk(p.session, { ...msg });
const ok = (room, p, msg) => assert.equal(gk(room, p, msg), null, `${p.id} ${JSON.stringify(msg)}`);
const events = (p, k) => p.raw.map((r) => JSON.parse(r)).filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);
const lastRoom = (p) => JSON.parse(p.raw.map((r) => JSON.parse(r)).filter((m) => m.t === 'room').map((m) => JSON.stringify(m)).at(-1)).state;

// 한 라운드를 도전자가 성공하게 끝낸다(전부 꽃을 놓고, 시작 사람이 합계를 부르고, 남의 더미를 뒤집는다).
function successRound(t) {
  const s0 = t.st();
  assert.equal(s0.step, 'setup');
  for (const seat of s0.seats) ok(t.room, t.by(seat.id), { a: 'place', k: 'F' });
  const s1 = t.st();
  assert.equal(s1.step, 'turn');
  const ch = t.by(s1.turn);
  ok(t.room, ch, { a: 'bid', n: s1.total });
  assert.equal(t.st().step, 'flip');
  t.clock.advance(600 + 3100); // 자기 더미 자동 공개(0.5초) + 그 장 연출
  for (const seat of t.st().seats) {
    if (seat.id === ch.id) continue;
    ok(t.room, ch, { a: 'flip', p: seat.id });
    t.clock.advance(3100); // 연출(꽃 1.7초 + 애태우기 1.4초)이 끝나야 판정·다음 장
  }
  assert.equal(t.st().step, 'reveal');
  assert.equal(t.st().outcome.ok, true);
  return ch;
}

test('접속·색·시작 조건·방 목록 정보', () => {
  const t = table(2);
  assert.equal(t.room.mode, 'gsk');
  assert.equal(t.room.phase, 'lobby');
  assert.equal(t.room.hostId, 'a1');
  assert.deepEqual(t.room.start('a1'), { msg: '3명 이상이 있어야 시작할 수 있습니다.', code: 'gk_few' });
  const c = person(t.hub, 'c1');
  assert.equal(t.room.join(c.session), null);
  assert.equal(t.room.start('b1').code, 'gk_host');
  ok(t.room, t.ps[0], { a: 'color', c: 2 });
  const dup = gk(t.room, t.ps[1], { a: 'color', c: 2 });
  assert.equal(dup.code, 'gk_color');
  ok(t.room, t.ps[1], { a: 'color', c: 3 });
  assert.equal(gk(t.room, t.ps[0], { a: 'bogus' }).code, 'gk_bad');
  assert.equal(gk(t.room, t.ps[0], { a: 'place', k: 'F' }).code, 'gk_now'); // 아직 판 아님
  // 모든 사람이 받은 마지막 상태에 프로필 사진 칸이 없다
  for (const p of [...t.ps, c]) assert.equal(JSON.stringify(lastRoom(p)).includes('avatar'), false);
  assert.equal(t.room.start('a1'), null);
  const s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(s.step, 'setup');
  assert.equal(s.seats.find((x) => x.id === 'a1').color, 2); // 고른 색은 지킨다
  assert.equal(s.seats.find((x) => x.id === 'b1').color, 3);
  assert.notEqual(s.seats.find((x) => x.id === 'c1').color, null); // 안 고른 사람은 남은 색
  assert.equal(events(t.ps[0], 'gkStart').length, 1);
  assert.equal(t.room.start('a1').code, 'gk_now'); // 이미 진행 중
  assert.equal(t.room.join(person(t.hub, 'zz').session), null); // 판 중 입장은 허용(관전)
});

test('한 판: 실패(벌칙)→성공 두 번으로 승리→전적 저장→한 판 더', () => {
  const t = table(3);
  assert.equal(t.room.start('a1'), null);
  // --- 1라운드: 실패. 시작 사람은 꽃, 한 명은 해골을 놓는다 ---
  const s0 = t.st();
  const ids = s0.seats.map((x) => x.id);
  const skullId = ids.find((id) => id !== s0.starter);
  for (const id of ids) ok(t.room, t.by(id), { a: 'place', k: id === skullId ? 'S' : 'F' });
  const chId = t.st().turn;
  assert.equal(chId, s0.starter);
  const ch = t.by(chId);
  // 차례 아닌 사람은 못 부른다
  const other = t.ps.find((p) => p.id !== chId);
  assert.equal(gk(t.room, other, { a: 'bid', n: 1 }).code, 'gk_turn');
  assert.equal(gk(t.room, ch, { a: 'bid', n: 99 }).code, 'gk_bad'); // 모양 밖
  assert.equal(gk(t.room, ch, { a: 'bid', n: 4 }).code, 'gk_bid'); // 합계(3) 초과
  ok(t.room, ch, { a: 'bid', n: 3 });
  let s = t.st();
  assert.equal(s.step, 'flip');
  assert.equal(s.challenger, chId);
  assert.equal(gk(t.room, ch, { a: 'flip', p: skullId }).code, 'gk_now'); // 자동 공개가 끝나기 전
  t.clock.advance(600);
  assert.equal(events(other, 'gkFlip').filter((e) => e.p === chId).length, 1);
  assert.equal(gk(t.room, ch, { a: 'flip', p: skullId }).code, 'gk_now'); // 앞 장 연출 중
  t.clock.advance(3100);
  ok(t.room, ch, { a: 'flip', p: skullId });
  assert.equal(t.st().step, 'flip'); // 해골 연출(3.1초) 동안 판정을 미룬다
  assert.equal(events(other, 'gkReveal').length, 0);
  t.clock.advance(3099);
  assert.equal(t.st().step, 'flip');
  t.clock.advance(1);
  s = t.st();
  assert.equal(s.step, 'reveal');
  assert.deepEqual(s.outcome, { ok: false, skullOf: skullId });
  assert.deepEqual(s.seats.find((x) => x.id === skullId).shown, ['S']);
  t.clock.advance(3500);
  s = t.st();
  assert.equal(s.step, 'penalty');
  assert.equal(s.penalty.by, chId);
  assert.equal(s.penalty.target, chId);
  assert.equal(s.penalty.faceUp, true);
  assert.equal(s.penalty.n, 4);
  assert.equal(gk(t.room, t.by(skullId), { a: 'discard', k: 'F' }).code, 'gk_turn'); // 고르는 사람은 도전자
  assert.equal(gk(t.room, ch, { a: 'discard', i: 0 }).code, 'gk_bad');
  ok(t.room, ch, { a: 'discard', k: 'F' });
  // 잃은 종류는 도전자 본인에게만 따로 간다
  assert.equal(events(ch, 'gkLoseMine').length, 1);
  assert.equal(t.ps.filter((p) => p !== ch).every((p) => events(p, 'gkLoseMine').length === 0), true);
  assert.equal(t.ps.every((p) => events(p, 'gkLose').length === 1), true);
  s = t.st();
  assert.equal(s.step, 'between');
  assert.equal(s.seats.find((x) => x.id === chId).discs, 3);
  t.clock.advance(1500);
  s = t.st();
  assert.equal(s.step, 'setup');
  assert.equal(s.round, 2);

  // --- 2·3라운드: 같은 사람이 먼저 2점 ---
  const w1 = successRound(t);
  t.clock.advance(3500 + 1500);
  assert.equal(t.st().step, 'setup');
  assert.equal(t.st().seats.find((x) => x.id === w1.id).points, 1);
  const w2 = successRound(t);
  assert.equal(t.room.phase, 'playing');
  t.clock.advance(3500);
  s = t.st();
  assert.equal(s.phase, 'result');
  assert.equal(s.result.reason, 'points');
  assert.equal(s.result.winner, w2.id);
  assert.equal(t.room.phase, 'result');
  // 전적: 3명 모두 games 1, 승자만 wins 1
  for (const p of t.ps) {
    const st = p.session.user.stats.gsk;
    assert.equal(st.games, 1, p.id);
    assert.equal(st.wins, p.id === w2.id ? 1 : 0, p.id);
  }
  assert.ok(t.hub.persisted.length >= 3);
  assert.equal(events(t.ps[0], 'gkEnd').length, 1);
  // 결과 화면에서 방장만 한 판 더
  assert.equal(t.room.start('b1').code, 'gk_host');
  assert.equal(t.room.start('a1'), null);
  s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(s.gameNo, 2);
  assert.equal(s.round, 1);
  assert.equal(s.seats.every((x) => x.points === 0 && x.discs === 4), true);
  // 시간이 더 흘러도 전적은 한 번만
  t.clock.advance(120_000);
  assert.equal(t.ps[0].session.user.stats.gsk.games, 1);
});

test('끊김: 60초 안에 돌아오면 같은 상태, 지나면 기권(라운드 무효), 남은 한 명이 이긴다', () => {
  const t = table(3);
  assert.equal(t.room.start('a1'), null);
  const [a, b, c] = t.ps;
  ok(t.room, a, { a: 'place', k: 'F' });
  const strip = (v) => { const x = JSON.parse(JSON.stringify(v)); delete x.now; return x; };
  const before = strip(t.room.view('c1'));
  c.session.conn = null;
  t.room.setConnected('c1', false);
  assert.equal(events(a, 'away').at(-1).id, 'c1');
  assert.equal(t.st().waiting, 'c1'); // 아직 안 놓은 끊긴 사람을 기다린다
  assert.equal(t.st().players.find((p) => p.id === 'c1').awayUntil, t.clock.now() + GRACE);
  t.clock.advance(GRACE - 1000);
  assert.equal(t.st().phase, 'playing');
  c.open();
  t.room.setConnected('c1', true);
  assert.equal(events(a, 'back').at(-1).id, 'c1');
  assert.deepEqual(strip({ ...t.room.view('c1'), players: before.players }), strip({ ...before, players: before.players }));
  assert.equal(t.st().waiting, null); // 돌아왔으니 기다림 끝
  t.clock.advance(10 * GRACE); // 연결 중에는 시간 제한 없음
  assert.equal(t.st().phase, 'playing');
  assert.equal(t.st().step, 'setup');

  // 다시 끊고 60초
  c.session.conn = null;
  t.room.setConnected('c1', false);
  t.clock.advance(GRACE + 1);
  let s = t.st();
  assert.equal(s.phase, 'playing');
  assert.equal(events(a, 'gkOut').at(-1).reason, 'away');
  assert.equal(events(a, 'gkVoid').at(-1).reason, 'away');
  assert.equal(s.step, 'setup'); // 새 라운드
  assert.equal(s.round, 2);
  assert.equal(s.seats.find((x) => x.id === 'c1').out, 'away');
  assert.equal(c.session.user.stats.gsk.games, 1); // 기권 순간 games + 1
  assert.equal(c.session.user.stats.gsk.wins, 0);
  assert.equal(t.room.member('c1'), undefined); // 방에서도 빠짐
  assert.equal(c.session.room, null);

  // 남은 b 도 끊기고 60초 → 혼자 남은 a 승리
  b.session.conn = null;
  t.room.setConnected('b1', false);
  t.clock.advance(GRACE + 1);
  s = t.st('a1');
  assert.equal(s.phase, 'result');
  assert.equal(s.result.reason, 'alone');
  assert.equal(s.result.winner, 'a1');
  assert.equal(a.session.user.stats.gsk.wins, 1);
  assert.equal(a.session.user.stats.gsk.games, 1);
  assert.equal(b.session.user.stats.gsk.games, 1);
});

test('판 도중 들어온 사람은 관전, 방장이 나가면 넘어가고 라운드는 무효', () => {
  const t = table(3);
  assert.equal(t.room.start('a1'), null);
  const late = person(t.hub, 'd1');
  assert.equal(t.room.join(late.session), null);
  const v = t.room.view('d1');
  assert.equal(v.players.find((p) => p.id === 'd1').spectating, true);
  assert.equal(v.seats.some((x) => x.id === 'd1'), false);
  assert.equal(v.mine, null);
  assert.equal(gk(t.room, late, { a: 'place', k: 'F' }).code, 'gk_now');
  assert.equal(late.session.room, t.room);
  // 관전자가 채팅·이모티콘을 보내면 모두에게 간다
  t.room.chat(late.session, '안녕');
  t.room.emote('d1', 'x');
  assert.equal(events(t.ps[0], 'chat').at(-1).text, '안녕');
  assert.equal(events(t.ps[0], 'emote').at(-1).id, 'd1');
  assert.deepEqual(events(late, 'chatLog')[0].items, []); // 들어올 때 받은 기록(그때는 비어 있음)
  // 방장이 나간다: 기권, 방장은 다음 사람
  t.room.leave('a1');
  assert.equal(t.room.hostId, 'b1');
  assert.equal(t.ps[0].session.room, null);
  assert.equal(t.ps[0].session.user.stats.gsk.games, 1);
  assert.equal(events(t.ps[1], 'gkOut').at(-1).reason, 'leave');
  assert.equal(events(t.ps[1], 'left').at(-1).id, 'a1');
  assert.equal(t.st('b1').round, 2);
  // 한 명 더 나가면 혼자 남아 끝
  t.room.leave('b1');
  const s = t.st('c1');
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 'c1');
  assert.equal(t.room.hostId, 'c1');
  // 관전자는 계속 방에 있고, 마지막 사람이 나가면 방이 지워진다
  t.room.leave('c1');
  t.room.leave('d1');
  assert.equal(t.hub.rooms.has('ABCD'), true);
  t.clock.advance(60_001);
  assert.equal(t.hub.rooms.has('ABCD'), false);
});

test('대기 방에서 끊긴 사람은 60초 뒤 방에서 빠지고 방장이 넘어간다', () => {
  const t = table(3);
  t.ps[0].session.conn = null;
  t.room.setConnected('a1', false);
  assert.equal(t.room.start('a1').code, 'gk_few'); // 접속 중 3명이 아님
  t.clock.advance(GRACE + 1);
  assert.equal(t.room.member('a1'), undefined);
  assert.equal(t.room.hostId, 'b1');
  assert.equal(t.st('b1').players.length, 2);
});

test('채팅·소리: 요트 방처럼 막지 않는다', () => {
  const t = table(3);
  t.room.chat(t.ps[0].session, '하이');
  assert.equal(events(t.ps[2], 'chat').at(-1).text, '하이');
  assert.equal(t.room.addSound(t.ps[0].session, 'u1', '짝', 'data'), null);
  assert.equal(events(t.ps[1], 'sndAdd').at(-1).sid, 'u1');
  assert.equal(t.room.playSound(t.ps[1].session, 'u1'), null);
  assert.equal(t.room.playSound(t.ps[1].session, 'nope'), '없는 소리입니다.');
  assert.equal(t.room.editSound(t.ps[2].session, 'u1', {}), '이 사운드를 수정할 권한이 없습니다.');
  assert.equal(t.room.editSound(t.ps[0].session, 'u1', { name: '새' }), null);
});

// ---- 비밀: 남이 받는 메시지는 꽃을 놓든 해골을 놓든 글자까지 같다 ----

function secretRun(kind) {
  const t = table(3);
  assert.equal(t.room.start('a1'), null);
  const spec = person(t.hub, 'd1');
  assert.equal(t.room.join(spec.session), null);
  const s0 = t.st();
  const first = s0.seats[0].id; // 놓는 사람(해골/꽃)
  const everyone = s0.seats.map((x) => x.id);
  ok(t.room, t.by(first), { a: 'place', k: kind });
  for (const id of everyone) if (id !== first) ok(t.room, t.by(id), { a: 'place', k: 'F' });
  // 차례 단계에서 시작 사람이 한 장 더 쌓는다(종류는 같게)
  ok(t.room, t.by(t.st().turn), { a: 'place', k: 'F' });
  t.clock.advance(5000);
  return { t, spec, first };
}

test('비밀: 해골을 놓은 사람 외 모든 소켓(다른 두 명·관전자)의 메시지에 해골이 없고 꽃일 때와 같다', () => {
  const F = secretRun('F');
  const S = secretRun('S');
  assert.equal(F.first, S.first);
  const viewers = (r) => [...r.t.ps.filter((p) => p.id !== r.first), r.spec];
  const fv = viewers(F), sv = viewers(S);
  assert.equal(sv.length, 3);
  for (let i = 0; i < sv.length; i++) {
    const a = fv[i].raw, b = sv[i].raw;
    assert.equal(a.length, b.length, `메시지 개수 ${sv[i].id}`);
    assert.deepEqual(b, a, `메시지 글자 ${sv[i].id}`);
    for (const raw of b) {
      // 본인 몫(mine)은 자기 것이니 빼고 본다: 이 사람들이 놓은 것은 모두 꽃이다
      const m = JSON.parse(raw);
      if (m.t === 'room') {
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
