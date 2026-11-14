// 혼자 놀기 서버 틀 시험 (docs/solo/PLAN.md 2절): 단계·seed·입력 조각·속도·시간·나누어 돌리기. 가짜 엔진으로.
import test from 'node:test';
import assert from 'node:assert/strict';
import { soloHub, startPlay, attach, errOf, mark, settled } from './hub.js';
import { tickEngine } from './lib.js';

const quiet = (fn) => async () => { // console.error 가 시험 출력을 어지럽히지 않게
  const orig = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try { await fn(logs); } finally { console.error = orig; }
};

test('방을 만들면 바로 시작: ready(3초) 동안은 아무에게도 seed 가 없고, play 가 되면 하는 사람에게만 간다', async () => {
  const h = soloHub();
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  assert.equal(a.state.phase, 'ready');
  assert.equal(a.state.pid, 'ann1');
  assert.equal(a.state.so.seed, undefined);
  assert.equal(typeof a.state.so.startAt, 'number');
  assert.equal(a.state.so.endsAt, null, '제한 없는 종목');
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: a.state.code });
  assert.equal(b.state.so.seed, undefined);
  await h.tick(2999);
  assert.equal(a.state.phase, 'ready');
  await h.tick(1);
  assert.equal(a.state.phase, 'play');
  assert.ok(Number.isInteger(a.state.so.seed), '하는 사람은 seed 를 받는다');
  assert.equal(b.state.so.seed, undefined, '구경하는 사람은 끝까지 못 받는다');
  assert.equal(JSON.stringify(b.sock.msgs).includes(String(a.state.so.seed)), false);
  assert.deepEqual(b.state.players.map((p) => [p.id, p.spectating]), [['ann1', false], ['bob1', true]]);
  assert.equal(b.state.wait, null);
  // 새로 고침(재접속)한 하는 사람은 seed 를 다시 받는다
  a.conn.close();
  const back = await h.login('ann1');
  assert.equal(back.state.so.seed, a.state.so.seed);
});

test('종목 표가 비어 있으면 자동 시작이 실패하고 대기실에 남는다, 대기실에서 종목을 골라 시작한다', async () => {
  const h = soloHub();
  h.hub.soloEngines = {};
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  assert.equal(a.state.phase, 'lobby');
  assert.ok(a.state.wait);
  h.hub.soloEngines = soloHub().hub.soloEngines;
  await a.send({ t: 'set', patch: { game: 'nope' } });
  assert.equal(errOf(a), 'so_game');
  await a.send({ t: 'set', patch: { game: 'fake_tick', extra: 1 } });
  assert.equal(errOf(a), 'so_bad');
  await a.send({ t: 'set', patch: { game: 'fake_tick' } });
  assert.equal(a.state.wait.set.game, 'fake_tick');
  await a.send({ t: 'start' });
  assert.equal(a.state.phase, 'ready');
  assert.equal(a.state.game, 'fake_tick');
  assert.equal(a.state.so.endsAt, a.state.so.startAt + tickEngine.limitMs);
});

test('입력: ready 에는 so_now, 구경하는 사람은 so_spec, 하는 사람은 반영되고 점수는 서버가 센다', async () => {
  const h = soloHub();
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'so', a: 'in', n: 0, ops: [1] });
  assert.equal(errOf(a), 'so_now');
  await h.tick(3000);
  await b.send({ t: 'so', a: 'in', n: 0, ops: [1] });
  assert.equal(errOf(b), 'so_spec');
  await b.send({ t: 'so', a: 'end', score: 99 });
  assert.equal(errOf(b), 'so_spec');
  const p = attach(h, a);
  for (let i = 0; i < 4; i++) p.run.input(i);
  assert.equal(await p.flush(), undefined);
  assert.equal(a.state.so.n, 0, '조각마다 방 상태를 다시 보내지는 않는다');
  const m = mark(b);
  p.run.input(2);
  assert.equal(await p.flush(), undefined);
  const prog = b.sock.msgs.slice(m).filter((x) => x.t === 'event' && x.e.k === 'soProg').map((x) => x.e);
  assert.deepEqual(prog, [{ k: 'soProg', score: p.run.score(), n: 5 }], '구경꾼에게만 점수·칸 수');
  assert.equal(mark(a) > 0 && a.sock.msgs.some((x) => x.t === 'event' && x.e.k === 'soProg'), false, '하는 사람에게는 안 간다');
  await p.end(12345); // 화면 점수가 달라도 서버 점수가 기록이다
  assert.equal(a.state.phase, 'end');
  assert.equal(a.state.last.score, p.run.score());
  assert.equal(a.state.last.desync, true);
  assert.equal(b.state.last.score, p.run.score(), '구경하는 사람도 결과를 본다');
  assert.equal(a.state.so, null);
});

test('n 순서: 앞질러 보내면 so_sync(서버 칸 수를 상태로 다시 준다), 이미 받은 조각은 조용히 버린다', async () => {
  const h = soloHub();
  const p = await startPlay(h);
  p.run.input(1); p.run.input(2);
  assert.equal(await p.flush(), undefined);
  p.run.input(3);
  const lost = p.run.take(); // 이 조각이 사라졌다고 치고, 다음 조각을 보낸다
  p.run.input(0);
  const m = mark(p.c);
  await p.c.send({ t: 'so', a: 'in', n: 3, ops: p.run.take() });
  assert.equal(errOf(p.c, m), 'so_sync');
  assert.equal(p.c.state.so.n, 2, '상태에 서버가 받은 칸 수');
  assert.equal(lost.length, 1);
  const again = p.run.resend(p.c.state.so.n); // 화면은 so.n 부터 다시 보낸다
  assert.deepEqual(again, [3, 0]);
  await p.c.send({ t: 'so', a: 'in', n: 2, ops: again });
  assert.equal(errOf(p.c, m), 'so_sync', '마지막 오류는 그대로(새 오류 없음)');
  const m2 = mark(p.c);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops: [1, 2] }); // 옛 조각을 다시 보냄: 점수에 영향 없이 버림
  assert.equal(errOf(p.c, m2), undefined);
  await p.end();
  assert.equal(p.c.state.last.score, p.run.score());
  assert.equal(p.c.state.last.desync, undefined);
});

test('속도 검사: 시간에 비해 입력이 너무 많은 조각은 so_fast 로 버리고, 판은 계속된다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  const p = await startPlay(h); // 시작 직후: 허용 = 0초 × 초당 3 + 60
  for (let i = 0; i < 61; i++) p.run.input(1);
  assert.equal(await p.flush(), 'so_fast');
  assert.equal(p.c.state.phase, 'play');
  assert.equal(p.c.state.so.n, 0);
  await h.tick(2000); // 허용 = 2초 × 3 + 60 = 66
  const again = p.run.resend(0);
  const m = mark(p.c);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops: again });
  assert.equal(errOf(p.c, m), undefined);
  assert.equal(p.c.state.phase, 'play');
});

test('속도 검사: 걸음 수도 시간으로 막는다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  const p = await startPlay(h);
  const m = mark(p.c);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops: [-600, -600] }); // 시작 직후 1200걸음 > 300
  assert.equal(errOf(p.c, m), 'so_fast');
  const m2 = mark(p.c);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops: [-250] });
  assert.equal(errOf(p.c, m2), undefined);
});

test('걸음이 많으면 240걸음씩 나누어 돌린다 (다른 방을 막지 않게), 구경꾼에게 점수가 조금씩 간다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  const p = await startPlay(h);
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: p.c.state.code });
  await h.tick(7000); // 허용 걸음 = 7 × 75 + 300 = 825
  const ops = [-600, -200];
  const m = mark(b);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops });
  const progs = () => b.sock.msgs.slice(m).filter((x) => x.t === 'event' && x.e.k === 'soProg').map((x) => x.e.score);
  assert.equal(progs().length, 1);
  assert.equal(h.clock.pending > 0, true, '이어 돌릴 pump 가 걸려 있다');
  for (let i = 0; i < 4; i++) await h.tick(0);
  const list = progs();
  assert.ok(list.length >= 4, `나누어 돌린 만큼 알림 ${list.length}`);
  assert.ok(list[1] >= list[0] && list.at(-1) >= list[1], '점수는 줄지 않는다');
  // 서버가 끝까지 돌린 점수 = 같은 기록을 한 번에 돌린 점수
  const ref = attach(h, p.c);
  ref.run.feed(ops);
  await p.end(ref.run.score());
  assert.equal(p.c.state.last.score, ref.run.score());
  assert.equal(p.c.state.last.desync, undefined);
});

test('제한 시간이 있는 종목: 끝 시각 + 1.5초에 서버가 정산한다(time), 그 전까지 온 조각은 받는다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  const p = await startPlay(h);
  await h.tick(tickEngine.limitMs + 1000); // endsAt + 1000
  p.run.input(7);
  assert.equal(await p.flush(), undefined, '늦었지만 여유 안');
  await h.tick(600);
  await settled();
  assert.equal(p.c.state.phase, 'end');
  assert.equal(p.c.state.last.reason, 'time');
  assert.equal(p.c.state.last.score, 7);
  await p.c.send({ t: 'so', a: 'in', n: 1, ops: [1] });
  assert.equal(errOf(p.c), 'so_now');
});

test('최대 시간(maxMs)을 넘기면 그때 점수로 끝낸다 (제한 시간 없는 종목)', async () => {
  const h = soloHub();
  const p = await startPlay(h);
  p.run.input(2);
  await p.flush();
  await h.tick(59_000);
  assert.equal(p.c.state.phase, 'play');
  await h.tick(1000);
  await settled();
  assert.equal(p.c.state.last.reason, 'max');
  assert.equal(p.c.state.last.score, p.run.score());
});

test('엔진이 끝나면(over) 조각을 받자마자 정산한다', async () => {
  const h = soloHub();
  const p = await startPlay(h);
  for (let i = 0; i < 30 && !p.run.over(); i++) p.run.input(3);
  assert.ok(p.run.over());
  assert.equal(await p.flush(), undefined);
  await settled();
  assert.equal(p.c.state.phase, 'end');
  assert.equal(p.c.state.last.reason, 'over');
  assert.equal(p.c.state.last.score, p.run.score());
});

test('잘못된 입력(엔진이 거절)이면 그 자리에서 그때까지의 서버 점수로 정산한다', quiet(async (logs) => {
  const h = soloHub();
  const p = await startPlay(h);
  p.run.input(2);
  await p.flush();
  const good = p.run.score();
  await p.c.send({ t: 'so', a: 'in', n: 1, ops: [1, 4] }); // 4 는 maxV 를 넘는 입력
  await settled();
  assert.equal(p.c.state.phase, 'end');
  assert.equal(p.c.state.last.reason, 'over');
  assert.ok(p.c.state.last.score >= good);
  assert.ok(logs.some((l) => l.includes('solo bad input')));
}));

test('걸음이 없는 종목에 걸음 칸을 보내면 잘못된 입력', quiet(async () => {
  const h = soloHub();
  const p = await startPlay(h);
  await p.c.send({ t: 'so', a: 'in', n: 0, ops: [-5] });
  await settled();
  assert.equal(p.c.state.phase, 'end');
}));

test('정산은 한 번: 그만하기를 두 번 보내도 두 번째는 so_now, 판 수는 1', async () => {
  const h = soloHub();
  const p = await startPlay(h);
  p.run.input(1);
  await p.flush();
  await p.end();
  assert.equal(p.c.state.last.reason, 'quit');
  const m = mark(p.c);
  await p.c.send({ t: 'so', a: 'end', score: 0 });
  assert.equal(errOf(p.c, m), 'so_now');
  const u = h.hub.sessions.get('ann1').user;
  assert.equal(u.solo.fake_turn.n, 1);
});

test('다시 시작: 새 seed, 지난 결과(last)는 지워진다', async () => {
  const h = soloHub();
  const p = await startPlay(h);
  const seed1 = p.seed;
  await p.end();
  assert.ok(p.c.state.last);
  assert.ok(p.c.state.wait, '결과 뒤 대기 상태');
  await p.c.send({ t: 'start' });
  assert.equal(p.c.state.phase, 'ready');
  assert.equal(p.c.state.last, null);
  await h.tick(3000);
  assert.notEqual(p.c.state.so.seed, seed1);
});

test('나가기: 카운트다운 중에 나가면 취소(기록 없음), 하는 중에 나가면 그때 점수로 정산하고 구경꾼은 결과를 본다', async () => {
  const h = soloHub();
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'leave' });
  assert.equal(b.state.phase, 'lobby');
  assert.equal(b.state.hostId, 'bob1');
  assert.equal(h.hub.sessions.get('ann1').user.solo.fake_turn, undefined, '시작도 못 한 판은 기록하지 않는다');
  await h.tick(5000);
  assert.equal(b.state.phase, 'lobby', '취소된 카운트다운이 판을 시작하지 않는다');
  // 새 방장이 시작하면 자기 판
  await b.send({ t: 'start' });
  await h.tick(3000);
  assert.equal(b.state.pid, 'bob1');
  const c = await h.login('cat1');
  await c.send({ t: 'join', code: b.state.code });
  const p = attach(h, b);
  p.run.input(3);
  await p.flush();
  await b.send({ t: 'leave' });
  await settled();
  assert.equal(c.state.phase, 'end');
  assert.equal(c.state.last.reason, 'leave');
  assert.equal(c.state.last.score, p.run.score());
  assert.equal(h.hub.sessions.get('bob1').user.solo.fake_turn.best, p.run.score());
  assert.deepEqual(c.state.wait.result.rows, [], '나간 사람은 결과 줄이 없다');
});

test('끊긴 뒤 유예(기본 60초)가 지나면 나간 것으로 정산하고, 코인·기록은 그대로 받는다', async () => {
  const h = soloHub({ timing: { grace: 20_000 } }); // 최대 시간(60초)보다 먼저 나가도록 유예를 줄여 시험
  const p = await startPlay(h);
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: p.c.state.code });
  for (let i = 0; i < 3; i++) p.run.input(3);
  await p.flush();
  const score = p.run.score();
  p.c.conn.close();
  await h.tick(10_000);
  assert.equal(b.state.phase, 'play', '유예 안에는 판이 이어진다');
  await h.tick(11_000);
  await settled();
  assert.equal(b.state.phase, 'end');
  assert.equal(b.state.last.reason, 'leave');
  assert.equal(b.state.last.score, score);
  assert.ok(b.state.last.coin.gain > 0, '점수 문턱을 넘었으면 코인');
  const again = await h.login('ann1');
  assert.equal(again.state, null);
  assert.equal(again.sock.last('me').user.solo.fake_turn.best, score);
  assert.equal(again.sock.last('me').wallet.coins, b.state.last.coin.gain);
});

test('방 가득(하는 사람 1 + 구경 3), 방 목록에는 안 나온다, 관전 계정은 정원 밖', async () => {
  const h = soloHub();
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  const code = a.state.code;
  assert.deepEqual(h.hub.roomList(), []);
  for (const id of ['bob1', 'cat1', 'dan1']) await (await h.login(id)).send({ t: 'join', code });
  const e = await h.login('eve1');
  await e.send({ t: 'join', code });
  assert.equal(errOf(e), 'so_full');
  const s = await h.login('관전1');
  await s.send({ t: 'join', code });
  assert.equal(s.state.code, code);
  assert.equal(s.state.so.seed, undefined);
});

test('스위치 off 면 만들 수 없다', async () => {
  const h = soloHub({ solo: 'off' });
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  assert.equal(errOf(a), 'so_off');
  assert.equal(a.state, null);
  assert.equal(a.sock.last('me').solo, 'off');
});

test('me 에 스위치 값(solo)과 내 기록(user.solo)이 간다', async () => {
  const h = soloHub();
  const a = await h.login('ann1');
  assert.equal(a.sock.last('me').solo, 'on');
  assert.deepEqual(a.sock.last('me').user.solo, {});
});
