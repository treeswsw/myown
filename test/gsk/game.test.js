// 갱스껄 규칙 엔진 시험 (GDD 2·3·5·9·12절). 시계·난수는 전부 시험이 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, removePlayer, setConnected, pickColor, start, act, tick, nextDeadline, viewFor, leave,
} from '../../shared/gsk/game.js';
import { REVEAL_MS, BETWEEN_MS, AUTO_FLIP_MS, GRACE_MS, COLORS } from '../../shared/gsk/constants.js';

const T0 = 1_000_000;
const rng0 = () => 0; // 섞기: 항상 0

// n명이 들어와 시작한 판. 자리 순서는 seats 에서 읽는다.
function mk(n = 3, { grace = GRACE_MS, rnd = rng0 } = {}) {
  const s = createGame({ code: 'ABCD', hostId: 'p0', graceMs: grace });
  for (let i = 0; i < n; i++) addPlayer(s, { id: `p${i}`, name: `이름${i}` });
  const fx = start(s, 'p0', T0, rnd);
  assert.equal(fx.ok, true);
  return s;
}
const order = (s) => s.seats.map((x) => x.id);
const A = (s, id, msg, now = T0, rnd = rng0) => act(s, id, msg, now, rnd);
const good = (s, id, msg, now, rnd) => { const r = A(s, id, msg, now, rnd); assert.equal(r.ok, true, `${id} ${JSON.stringify(msg)} -> ${r.code}`); return r; };
const code = (s, id, msg, now, rnd) => { const r = A(s, id, msg, now, rnd); assert.equal(r.ok, false); return r.code; };
const kinds = (e) => e.events.map((x) => x.e.k);

// setup: 모두 놓기. map = { id: 'F'|'S' }, 나머지는 F
function setupAll(s, map = {}) {
  for (const id of order(s)) good(s, id, { a: 'place', k: map[id] ?? 'F' });
  assert.equal(s.step, 'turn');
}
// 차례인 사람이 n 도전, 나머지 패스 → flip 단계
function challenge(s, n) {
  const ch = s.turnId;
  good(s, ch, { a: 'bid', n });
  while (s.step === 'bid') good(s, s.turnId, { a: 'pass' });
  assert.equal(s.step, 'flip');
  assert.equal(s.challenger, ch);
  return ch;
}
// 자동 공개를 끝까지
function autoFlip(s) {
  while (s.flipAt != null) tick(s, s.flipAt, rng0);
}
function toNextRound(s) {
  tick(s, s.endsAt, rng0); // reveal 끝 → between(성공) 또는 penalty
  if (s.step === 'between') tick(s, s.endsAt, rng0);
}
// 성공 라운드: 시작 사람(=차례)이 n 도전해 이긴다
function winRound(s, n = 2) {
  const ch = challenge(s, n);
  autoFlip(s);
  const others = order(s).filter((id) => id !== ch);
  let i = 0;
  while (s.step === 'flip') good(s, ch, { a: 'flip', p: others[i++ % others.length] });
  assert.equal(s.outcome.ok, true);
  return ch;
}

// ---------- 방 대기·시작 ----------

test('색 겹침은 거절, 같은 사람이 다시 고르는 것은 가능', () => {
  const s = createGame({ hostId: 'a' });
  ['a', 'b', 'c'].forEach((id) => addPlayer(s, { id, name: id }));
  assert.equal(pickColor(s, 'a', 2).ok, true);
  assert.equal(pickColor(s, 'b', 2).code, 'gk_color');
  assert.equal(pickColor(s, 'a', 3).ok, true);
  assert.equal(pickColor(s, 'b', 2).ok, true);
  assert.equal(pickColor(s, 'b', 9).code, 'gk_bad');
  assert.equal(A(s, 'c', { a: 'color', c: 3 }).ok, false);
});

test('3명 미만이면 시작 못 한다 / 방장만 시작', () => {
  const s = createGame({ hostId: 'a' });
  addPlayer(s, { id: 'a', name: 'a' }); addPlayer(s, { id: 'b', name: 'b' });
  assert.equal(start(s, 'a', T0, rng0).code, 'gk_few');
  addPlayer(s, { id: 'c', name: 'c' });
  assert.equal(start(s, 'b', T0, rng0).code, 'gk_host');
  setConnected(s, 'c', false, T0);
  assert.equal(start(s, 'a', T0, rng0).code, 'gk_few'); // 접속 중 3명 미만
  setConnected(s, 'c', true, T0);
  assert.equal(start(s, 'a', T0, rng0).ok, true);
  assert.equal(start(s, 'a', T0, rng0).code, 'gk_now'); // 이미 진행 중
});

test('시작: 색 배정(고른 건 유지, 나머지는 들어온 순서대로 남은 색), 원판 4장, setup', () => {
  const s = createGame({ hostId: 'p0' });
  for (let i = 0; i < 4; i++) addPlayer(s, { id: `p${i}`, name: `n${i}` });
  pickColor(s, 'p2', 0);
  const fx = start(s, 'p0', T0, rng0);
  assert.deepEqual(kinds(fx), ['gkStart', 'gkRound']);
  const col = Object.fromEntries(s.seats.map((x) => [x.id, x.color]));
  assert.equal(col.p2, 0);
  assert.equal(col.p0, 1); assert.equal(col.p1, 2); assert.equal(col.p3, 3);
  assert.equal(new Set(Object.values(col)).size, 4);
  const v = viewFor(s, 'p1');
  assert.equal(v.phase, 'playing'); assert.equal(v.step, 'setup'); assert.equal(v.round, 1);
  assert.deepEqual(v.mine, { hand: { F: 3, S: 1 }, stack: [], lost: [] });
  assert.ok(v.seats.every((x) => x.discs === 4 && x.hand === 4 && x.stack === 0 && !x.placed));
  assert.equal(v.turn, null); assert.equal(v.total, 0);
  assert.ok(COLORS.length === 6);
});

test('판 도중 들어온 사람은 관전, 방에서 뺄 수 있다', () => {
  const s = mk(3);
  addPlayer(s, { id: 'late', name: 'late' });
  const v = viewFor(s, 'late');
  assert.equal(v.players.find((p) => p.id === 'late').spectating, true);
  assert.equal(v.mine, null);
  assert.equal(code(s, 'late', { a: 'place', k: 'F' }), 'gk_now');
  assert.equal(removePlayer(s, 'late').ok, true);
  assert.equal(removePlayer(s, 'p1').code, 'gk_now'); // 판 도중 참가자는 leave
});

// ---------- 시나리오 1: 한 판 끝까지 ----------

test('시나리오1: 놓기(동시) → 차례에 쌓기 → 합계를 부르면 경매 없이 바로 뒤집기 단계', () => {
  const s = mk(3);
  const [a, b, c] = order(s);
  const st = s.starter;
  // setup: 동시에 놓기. 두 번 놓기는 거절
  const f1 = good(s, b, { a: 'place', k: 'F' });
  assert.deepEqual(f1.events[0].e, { k: 'gkPlace', id: b, stack: 1 });
  assert.equal(code(s, b, { a: 'place', k: 'F' }), 'gk_now');
  good(s, a, { a: 'place', k: 'F' });
  assert.equal(s.step, 'setup');
  const last = good(s, c, { a: 'place', k: 'S' });
  assert.deepEqual(kinds(last), ['gkPlace', 'gkTurn']);
  assert.equal(s.step, 'turn'); assert.equal(s.turnId, st);
  assert.equal(viewFor(s, a).total, 3);

  // 차례: 시작 사람이 한 장 더 쌓는다 → 다음 사람
  good(s, st, { a: 'place', k: 'F' });
  const nx = s.turnId;
  assert.notEqual(nx, st);
  assert.equal(viewFor(s, a).total, 4);
  // nx 가 4 를 부르면(합계) 경매 없이 바로 flip
  const r = good(s, nx, { a: 'bid', n: 4 });
  assert.deepEqual(kinds(r), ['gkBid']);
  assert.equal(s.step, 'flip'); assert.equal(s.challenger, nx);
  assert.ok(s.flipAt > T0);
});

test('경매·자동 공개·성공·점수·다음 라운드 시작 사람', () => {
  const s = mk(3);
  setupAll(s);
  const st = s.starter;
  const ch = challenge(s, 2); // 합계 3, 2 부름 → 나머지 패스
  assert.equal(ch, st);
  const v = viewFor(s, 'p0');
  assert.equal(v.step, 'flip'); assert.equal(v.turn, ch); assert.equal(v.need, 2); assert.equal(v.flipped, 0);
  // 자동 공개 전에 flip 은 거절
  assert.equal(code(s, ch, { a: 'flip', p: order(s).find((x) => x !== ch) }), 'gk_now');
  // 500ms 간격
  assert.equal(nextDeadline(s), s.flipAt);
  const t1 = s.flipAt;
  const fx = tick(s, t1, rng0);
  assert.deepEqual(fx.events[0].e, { k: 'gkFlip', id: ch, p: ch, disc: 'F', flipped: 1 });
  assert.equal(s.flipAt, null); // 내 더미 1장 → 끝
  assert.equal(viewFor(s, 'p0').seats.find((x) => x.id === ch).shown.join(), 'F');
  const other = order(s).find((x) => x !== ch);
  const fl = good(s, ch, { a: 'flip', p: other });
  assert.deepEqual(kinds(fl), ['gkFlip', 'gkReveal']);
  assert.deepEqual(fl.events[1].e, { k: 'gkReveal', ok: true, challenger: ch, skullOf: null });
  assert.equal(s.step, 'reveal');
  assert.equal(viewFor(s, ch).seats.find((x) => x.id === ch).points, 0); // 점수는 판정 표시 뒤
  const end = s.endsAt;
  assert.equal(nextDeadline(s), end);
  assert.equal(tick(s, end - 1, rng0).events.length, 0);
  tick(s, end, rng0);
  assert.equal(s.step, 'between');
  assert.equal(s.seats.find((x) => x.id === ch).points, 1);
  assert.equal(s.endsAt, end + BETWEEN_MS);
  assert.equal(s.starter, ch);
  const fx2 = tick(s, s.endsAt, rng0);
  assert.deepEqual(kinds(fx2), ['gkRound']);
  assert.equal(s.step, 'setup'); assert.equal(s.round, 2);
});

test('두 번 성공하면 승리 → result, finished, 한 판 더', () => {
  const s = mk(3);
  setupAll(s);
  const ch = winRound(s, 2);
  toNextRound(s);
  assert.equal(s.step, 'setup');
  setupAll(s);
  assert.equal(s.turnId, ch);
  winRound(s, 2);
  const fx = tick(s, s.endsAt, rng0);
  assert.equal(s.phase, 'result');
  assert.deepEqual(kinds(fx), ['gkEnd']);
  assert.equal(fx.finished.winner, ch);
  assert.deepEqual([...fx.finished.players].sort(), ['p0', 'p1', 'p2']);
  const v = viewFor(s, 'p1');
  assert.equal(v.phase, 'result'); assert.equal(v.step, null);
  assert.equal(v.result.reason, 'points'); assert.equal(v.result.winner, ch);
  assert.equal(v.result.ranks[0].id, ch); assert.equal(v.result.ranks[0].points, 2); assert.equal(v.result.ranks[0].rank, 1);
  assert.equal(nextDeadline(s), null);
  // 한 판 더
  assert.equal(code(s, 'p1', { a: 'place', k: 'F' }), 'gk_now');
  assert.equal(start(s, 'p1', T0, rng0).code, 'gk_host');
  assert.equal(start(s, 'p0', T0, rng0).ok, true);
  assert.equal(s.gameNo, 2);
  assert.ok(s.seats.every((x) => x.points === 0 && x.discs.F === 3 && x.discs.S === 1));
});

// ---------- 시나리오 2: 실패와 탈락 ----------

test('실패: 남의 해골 → 해골 주인이 뒷면 칸으로 고름, 다음 시작 = 도전자', () => {
  const s = mk(3);
  const st = s.starter;
  const skullMan = order(s).find((x) => x !== st);
  setupAll(s, { [skullMan]: 'S' });
  const ch = challenge(s, 2);
  autoFlip(s);
  const fx = good(s, ch, { a: 'flip', p: skullMan });
  assert.deepEqual(fx.events[1].e, { k: 'gkReveal', ok: false, challenger: ch, skullOf: skullMan });
  assert.deepEqual(viewFor(s, 'p0').outcome, { ok: false, skullOf: skullMan });
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'penalty');
  const v = viewFor(s, 'p0');
  assert.deepEqual(v.penalty, { by: skullMan, target: ch, n: 4, faceUp: false });
  // 도전자는 못 고른다. 종류(k)로도 못 고른다
  assert.equal(code(s, ch, { a: 'discard', i: 0 }), 'gk_turn');
  assert.equal(code(s, skullMan, { a: 'discard', k: 'F' }), 'gk_bad');
  assert.equal(code(s, skullMan, { a: 'discard', i: 9 }), 'gk_bad');
  const d = good(s, skullMan, { a: 'discard', i: 2 }); // rng0 섞기: [꽃,꽃,해골,꽃] → 칸 2 = 해골
  assert.deepEqual(d.events.map((x) => [x.to, x.e.k]), [['all', 'gkLose'], [ch, 'gkLoseMine']]);
  assert.deepEqual(d.events[0].e, { k: 'gkLose', id: ch, discs: 3 });
  assert.equal(d.events[1].e.disc, 'S');
  assert.equal(s.step, 'between');
  assert.equal(s.starter, ch);
  assert.deepEqual(viewFor(s, ch).mine.lost, ['S']);
  assert.deepEqual(viewFor(s, skullMan).mine.lost, []);
  assert.equal(viewFor(s, skullMan).seats.find((x) => x.id === ch).discs, 3);
  // 다음 라운드: 손으로 돌아옴(해골을 잃었으니 꽃 3)
  tick(s, s.endsAt, rng0);
  assert.deepEqual(viewFor(s, ch).mine.hand, { F: 3, S: 0 });
});

test('자기 해골이면 도전자가 직접 종류로 고른다', () => {
  const s = mk(3);
  const st = s.starter;
  setupAll(s, { [st]: 'S' });
  const ch = challenge(s, 2);
  assert.equal(ch, st);
  const fx = tick(s, s.flipAt, rng0); // 자동 공개 첫 장이 자기 해골
  assert.equal(fx.events[0].e.disc, 'S');
  assert.deepEqual(fx.events[1].e, { k: 'gkReveal', ok: false, challenger: ch, skullOf: ch });
  tick(s, s.endsAt, rng0);
  assert.deepEqual(viewFor(s, ch).penalty, { by: ch, target: ch, n: 4, faceUp: true });
  const o = order(s).find((x) => x !== ch);
  assert.equal(code(s, o, { a: 'discard', k: 'F' }), 'gk_turn');
  assert.equal(code(s, ch, { a: 'discard', i: 0 }), 'gk_bad');
  good(s, ch, { a: 'discard', k: 'F' });
  assert.deepEqual(viewFor(s, ch).mine.lost, ['F']);
  assert.equal(s.step, 'between'); assert.equal(s.starter, ch);
  tick(s, s.endsAt, rng0);
  assert.deepEqual(viewFor(s, ch).mine.hand, { F: 2, S: 1 });
});

test('원판 0 이면 탈락, 도전자가 탈락하면 다음 시작은 해골 주인', () => {
  const s = mk(3);
  const st = s.starter;
  const skullMan = order(s).find((x) => x !== st);
  s.seats.find((x) => x.id === st).discs = { F: 1, S: 0 }; // 한 장만 남은 도전자
  s.seats.find((x) => x.id === st).hand = { F: 1, S: 0 };
  setupAll(s, { [skullMan]: 'S' });
  challenge(s, 2);
  autoFlip(s);
  good(s, st, { a: 'flip', p: skullMan });
  tick(s, s.endsAt, rng0);
  const d = good(s, skullMan, { a: 'discard', i: 0 });
  assert.deepEqual(kinds(d), ['gkLose', 'gkLoseMine', 'gkOut']);
  assert.deepEqual(d.events[2].e, { k: 'gkOut', id: st, reason: 'lost' });
  assert.equal(s.seats.find((x) => x.id === st).out, 'lost');
  assert.equal(s.starter, skullMan);
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'setup');
  // 탈락자는 놓을 수 없고, 나머지 2명이 놓으면 시작
  assert.equal(code(s, st, { a: 'place', k: 'F' }), 'gk_now');
  const [x, y] = order(s).filter((id) => id !== st);
  good(s, x, { a: 'place', k: 'F' }); good(s, y, { a: 'place', k: 'F' });
  assert.equal(s.turnId, skullMan);
  assert.equal(viewFor(s, 'p0').seats.find((q) => q.id === st).out, 'lost');
});

test('자기 해골로 탈락하면 도전자 다음 살아 있는 사람이 시작', () => {
  const s = mk(3);
  const st = s.starter;
  const me = s.seats.find((x) => x.id === st);
  me.discs = { F: 0, S: 1 }; me.hand = { F: 0, S: 1 };
  setupAll(s, { [st]: 'S' });
  challenge(s, 2);
  tick(s, s.flipAt, rng0);
  tick(s, s.endsAt, rng0);
  good(s, st, { a: 'discard', k: 'S' });
  assert.equal(me.out, 'lost');
  const nxt = order(s)[(order(s).indexOf(st) + 1) % 3];
  assert.equal(s.starter, nxt);
});

test('혼자 남으면 승리(alone)', () => {
  const s = mk(3);
  const st = s.starter;
  const [x, y] = order(s).filter((id) => id !== st);
  // y 는 이미 탈락한 상태로 만들고, x 의 해골에 st 가 걸려 마지막 한 장을 잃는다
  const sy = s.seats.find((q) => q.id === y);
  sy.out = 'lost'; sy.outSeq = ++s.outSeq;
  const me = s.seats.find((q) => q.id === st);
  me.discs = { F: 1, S: 0 }; me.hand = { F: 1, S: 0 };
  s.step = 'setup'; s.round = 1;
  good(s, st, { a: 'place', k: 'F' });
  const fx0 = good(s, x, { a: 'place', k: 'S' });
  assert.equal(s.step, 'turn');
  assert.equal(fx0.ok, true);
  const ch = s.turnId;
  if (ch !== st) { good(s, ch, { a: 'place', k: ch === x ? 'F' : 'F' }); }
  // st 가 도전자가 되도록 차례를 맞춘다
  while (s.turnId !== st) good(s, s.turnId, { a: 'place', k: 'F' });
  good(s, st, { a: 'bid', n: tableTotalOf(s) });
  autoFlip(s);
  good(s, st, { a: 'flip', p: x });
  assert.equal(s.outcome.ok, false);
  tick(s, s.endsAt, rng0);
  good(s, x, { a: 'discard', i: 0 });
  assert.equal(s.phase, 'result');
  const v = viewFor(s, 'p0');
  assert.equal(v.result.reason, 'alone'); assert.equal(v.result.winner, x);
  assert.equal(v.result.ranks[0].id, x);
  // 탈락자는 늦게 탈락한 순
  assert.deepEqual(v.result.ranks.map((r) => r.id), [x, st, y]);
});
function tableTotalOf(s) { return s.seats.filter((x) => !x.out).reduce((n, x) => n + x.stack.length, 0); }

// ---------- 예외 ----------

test('경매 예외: 합계 초과·같은 숫자·낮은 숫자·차례 아닌 사람', () => {
  const s = mk(3);
  setupAll(s);
  const st = s.starter;
  const other = order(s).find((x) => x !== st);
  assert.equal(code(s, other, { a: 'bid', n: 1 }), 'gk_turn');
  assert.equal(code(s, other, { a: 'place', k: 'F' }), 'gk_turn');
  assert.equal(code(s, st, { a: 'pass' }), 'gk_now'); // 차례 단계에서는 패스 없음
  assert.equal(code(s, st, { a: 'bid', n: 4 }), 'gk_bid'); // 합계 3 초과
  assert.equal(code(s, st, { a: 'bid', n: 0 }), 'gk_bad'); // 모양부터 틀림
  assert.equal(code(s, st, { a: 'flip', p: other }), 'gk_now');
  good(s, st, { a: 'bid', n: 2 });
  assert.equal(s.step, 'bid');
  const nx = s.turnId;
  assert.notEqual(nx, st);
  assert.equal(code(s, st, { a: 'bid', n: 3 }), 'gk_turn');
  assert.equal(code(s, nx, { a: 'bid', n: 2 }), 'gk_bid'); // 같은 숫자
  assert.equal(code(s, nx, { a: 'bid', n: 1 }), 'gk_bid'); // 낮은 숫자
  assert.equal(code(s, nx, { a: 'bid', n: 9 }), 'gk_bid');
  assert.equal(code(s, nx, { a: 'place', k: 'F' }), 'gk_now');
  const v = viewFor(s, 'p0');
  assert.deepEqual(v.bid, { n: 2, by: st }); assert.equal(v.turn, nx);
  good(s, nx, { a: 'pass' });
  assert.equal(viewFor(s, 'p0').seats.find((x) => x.id === nx).passed, true);
  // 패스한 사람은 다시 못 낀다
  assert.equal(code(s, nx, { a: 'bid', n: 3 }), 'gk_turn');
});

test('경매: 올리기는 패스한 사람을 건너뛰고, 합계를 부르면 즉시 끝', () => {
  const s = mk(4);
  setupAll(s);
  const ord = order(s);
  const st = s.starter;
  const at = (k) => ord[(ord.indexOf(st) + k) % 4];
  good(s, st, { a: 'bid', n: 1 });
  assert.equal(s.turnId, at(1));
  good(s, at(1), { a: 'pass' });
  assert.equal(s.turnId, at(2));
  good(s, at(2), { a: 'bid', n: 2 });
  assert.equal(s.turnId, at(3));
  good(s, at(3), { a: 'pass' });
  assert.equal(s.turnId, st); // at(1) 건너뜀
  good(s, st, { a: 'pass' });
  // 남은 것은 at(2) 한 명 → 도전자
  assert.equal(s.step, 'flip'); assert.equal(s.challenger, at(2)); assert.equal(s.need, 2);

  const t = mk(4);
  setupAll(t);
  good(t, t.starter, { a: 'bid', n: 1 });
  good(t, t.turnId, { a: 'bid', n: 4 }); // 합계
  assert.equal(t.step, 'flip');
});

test('손에 없는 종류·손이 빈 사람은 도전만', () => {
  const s = mk(3);
  const a0 = order(s)[0];
  good(s, a0, { a: 'place', k: 'S' });
  // setup 에서는 한 장만
  assert.equal(code(s, a0, { a: 'place', k: 'S' }), 'gk_now');
  for (const id of order(s).slice(1)) good(s, id, { a: 'place', k: 'F' });
  // 해골은 한 장뿐: a0 의 두 번째 해골은 거절(차례가 오면)
  while (s.turnId !== a0) good(s, s.turnId, { a: 'place', k: 'F' });
  assert.equal(code(s, a0, { a: 'place', k: 'S' }), 'gk_hand');
  // 손을 다 비우기: 꽃을 계속 쌓는다
  for (let guard = 0; guard < 30; guard++) {
    const me = s.seats.find((x) => x.id === s.turnId);
    if (me.hand.F + me.hand.S === 0) break;
    good(s, me.id, { a: 'place', k: me.hand.F ? 'F' : 'S' });
  }
  const empty = s.seats.find((x) => x.id === s.turnId);
  assert.equal(empty.hand.F + empty.hand.S, 0);
  assert.equal(code(s, empty.id, { a: 'place', k: 'F' }), 'gk_hand');
  assert.equal(code(s, empty.id, { a: 'place', k: 'S' }), 'gk_hand');
  assert.equal(A(s, empty.id, { a: 'bid', n: 1 }).ok, true);
});

test('flip 예외: 자기 더미·공개 끝난 더미·존재하지 않는 사람·차례 아닌 사람', () => {
  const s = mk(4);
  setupAll(s);
  const ch = challenge(s, 3);
  autoFlip(s);
  const [x, y, z] = order(s).filter((id) => id !== ch);
  assert.equal(code(s, x, { a: 'flip', p: y }), 'gk_turn');
  assert.equal(code(s, ch, { a: 'flip', p: ch }), 'gk_bad');
  assert.equal(code(s, ch, { a: 'flip', p: 'nobody' }), 'gk_bad');
  good(s, ch, { a: 'flip', p: x });
  assert.equal(code(s, ch, { a: 'flip', p: x }), 'gk_bad'); // 더미 하나뿐인데 이미 공개
  assert.equal(code(s, ch, { a: 'discard', i: 0 }), 'gk_now');
  good(s, ch, { a: 'flip', p: y });
  assert.equal(s.step, 'reveal'); // 3장 성공 (자기 1 + x + y)
  assert.equal(code(s, ch, { a: 'flip', p: z }), 'gk_now');
  void z;
});

test('남의 더미는 맨 위부터 한 장씩, 한 번에 한 장', () => {
  const s = mk(3);
  setupAll(s);
  // 두 번째 바퀴: 모두 한 장씩 더 (순서 = 차례)
  for (let i = 0; i < 3; i++) good(s, s.turnId, { a: 'place', k: 'F' });
  const ch = challenge(s, 5); // 합계 6
  autoFlip(s); // 내 더미 2장
  assert.equal(s.flipped, 2);
  const o = order(s).find((x) => x !== ch);
  good(s, ch, { a: 'flip', p: o });
  assert.equal(s.flipped, 3);
  assert.equal(viewFor(s, ch).seats.find((x) => x.id === o).shown.length, 1);
  good(s, ch, { a: 'flip', p: o });
  assert.equal(s.flipped, 4);
  assert.equal(code(s, ch, { a: 'flip', p: o }), 'gk_bad'); // 더미 다 공개
});

// ---------- 라운드 무효·끊김 ----------

test('판 도중 나가면 라운드 무효(같은 시작 사람, 원판은 손으로)', () => {
  const s = mk(4);
  setupAll(s);
  good(s, s.turnId, { a: 'place', k: 'F' });
  const st = s.starter;
  const gone = order(s).find((x) => x !== st);
  const fx = leave(s, gone, T0, rng0);
  assert.deepEqual(kinds(fx), ['gkOut', 'gkVoid', 'gkRound']);
  assert.deepEqual(fx.events[1].e, { k: 'gkVoid', reason: 'leave', id: gone });
  assert.equal(s.step, 'setup'); assert.equal(s.starter, st); assert.equal(s.round, 2);
  assert.ok(s.seats.every((x) => x.stack.length === 0 && x.hand.F === 3 && x.hand.S === 1));
  assert.equal(viewFor(s, st).players.some((p) => p.id === gone), false);
  assert.equal(viewFor(s, st).seats.find((x) => x.id === gone).out, 'leave');
  assert.equal(viewFor(s, st).total, 0);
});

test('시작 사람이 빠지면 다음 살아 있는 사람, 둘 다 빠지면 혼자 남아 승리', () => {
  const s = mk(3);
  const st = s.starter;
  const fx = leave(s, st, T0, rng0);
  assert.ok(kinds(fx).includes('gkVoid'));
  const ord = order(s);
  assert.equal(s.starter, ord[(ord.indexOf(st) + 1) % 3]);
  const keep = s.starter;
  const other = ord.find((x) => x !== st && x !== keep);
  const fx2 = leave(s, other, T0, rng0);
  assert.equal(s.phase, 'result');
  assert.equal(fx2.finished.winner, keep);
  assert.equal(viewFor(s, keep).result.reason, 'alone');
});

test('끊긴 사람은 기다리고, 60초가 지나면 기권 → 라운드 무효', () => {
  const s = mk(3);
  setupAll(s);
  const cur = s.turnId;
  setConnected(s, cur, false, T0 + 5000);
  const v = viewFor(s, order(s).find((x) => x !== cur));
  assert.equal(v.waiting, cur);
  assert.equal(v.players.find((p) => p.id === cur).awayUntil, T0 + 5000 + GRACE_MS);
  assert.equal(nextDeadline(s), T0 + 5000 + GRACE_MS);
  assert.equal(tick(s, T0 + 5000 + GRACE_MS - 1, rng0).events.length, 0);
  assert.equal(s.step, 'turn');
  // 돌아오면 그대로
  setConnected(s, cur, true, T0 + 30000);
  assert.equal(nextDeadline(s), null);
  assert.equal(viewFor(s, cur).waiting, null);
  // 다시 끊겨 60초
  setConnected(s, cur, false, T0 + 40000);
  const fx = tick(s, T0 + 40000 + GRACE_MS, rng0);
  assert.deepEqual(kinds(fx), ['gkOut', 'gkVoid', 'gkRound']);
  assert.equal(fx.events[0].e.reason, 'away');
  assert.equal(s.seats.find((x) => x.id === cur).out, 'away');
  assert.equal(s.step, 'setup');
});

test('setup 에서 안 놓은 끊긴 사람을 기다린다', () => {
  const s = mk(3);
  const [a, b, c] = order(s);
  good(s, a, { a: 'place', k: 'F' });
  setConnected(s, b, false, T0);
  assert.equal(viewFor(s, a).waiting, b);
  good(s, c, { a: 'place', k: 'F' });
  assert.equal(s.step, 'setup');
});

test('벌칙 고르는 사람이 나가면 난수로 고른 뒤 진행', () => {
  const s = mk(4);
  const st = s.starter;
  const skullMan = order(s).find((x) => x !== st);
  setupAll(s, { [skullMan]: 'S' });
  challenge(s, 2);
  autoFlip(s);
  good(s, st, { a: 'flip', p: skullMan });
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'penalty');
  const fx = leave(s, skullMan, T0, (n) => n - 1);
  assert.deepEqual(kinds(fx), ['gkOut', 'gkLose', 'gkLoseMine']);
  assert.equal(s.step, 'between');
  assert.equal(s.starter, st);
  assert.equal(viewFor(s, st).seats.find((x) => x.id === st).discs, 3);
});

test('도전자가 나가면 벌칙 없이 새 라운드', () => {
  const s = mk(4);
  const st = s.starter;
  const skullMan = order(s).find((x) => x !== st);
  setupAll(s, { [skullMan]: 'S' });
  challenge(s, 2);
  autoFlip(s);
  good(s, st, { a: 'flip', p: skullMan });
  tick(s, s.endsAt, rng0);
  const fx = leave(s, st, T0, rng0);
  assert.ok(kinds(fx).includes('gkVoid'));
  assert.equal(s.step, 'setup');
  assert.ok(s.seats.every((x) => x.out || x.discs.F + x.discs.S === 4));
});

test('between 중 나가면 무효 없이 다음 라운드에서 시작 사람이 바뀐다', () => {
  const s = mk(4);
  setupAll(s);
  const ch = winRound(s, 2);
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'between');
  const fx = leave(s, ch, T0, rng0);
  assert.deepEqual(kinds(fx), ['gkOut']);
  assert.equal(s.step, 'between');
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'setup');
  assert.notEqual(s.starter, ch);
  assert.equal(s.seats.find((x) => x.id === s.starter).out, null);
});

test('결과 화면에서는 끊김이 기권이 되지 않는다 / 방장이 나가면 방장 이전', () => {
  const s = mk(3);
  setupAll(s);
  leave(s, 'p1', T0, rng0);
  leave(s, 'p2', T0, rng0);
  assert.equal(s.phase, 'result');
  setConnected(s, 'p0', false, T0);
  assert.equal(nextDeadline(s), null);
  assert.equal(tick(s, T0 + 10 * GRACE_MS, rng0).events.length, 0);
  const t = mk(3);
  addPlayer(t, { id: 'p9', name: 'z' });
  leave(t, 'p0', T0, rng0);
  assert.notEqual(t.hostId, 'p0');
  assert.ok(t.hostId);
});

// ---------- 결과 순위 ----------

test('순위: 점수 큰 순 → 남은 원판 많은 순 → 탈락자는 늦게 탈락한 순', () => {
  const s = mk(4);
  const [a, b, c, d] = order(s);
  const q = (id) => s.seats.find((x) => x.id === id);
  q(a).points = 1; q(a).discs = { F: 2, S: 0 };
  q(b).points = 1; q(b).discs = { F: 3, S: 1 };
  q(c).out = 'lost'; q(c).outSeq = 1; q(c).discs = { F: 0, S: 0 };
  q(d).out = 'away'; q(d).outSeq = 2; s.outSeq = 2;
  s.step = 'between'; s.endsAt = T0;
  // 한 명 더 탈락시켜 판을 끝낸다
  leave(s, a, T0, rng0);
  const v = viewFor(s, b);
  assert.equal(v.phase, 'result');
  assert.deepEqual(v.result.ranks.map((r) => r.id), [b, a, d, c]);
  assert.deepEqual(v.result.ranks.map((r) => r.rank), [1, 2, 3, 4]);
});

test('같은 점수·같은 원판이면 같은 순위', () => {
  const s = mk(3);
  setupAll(s);
  const st = s.starter;
  s.seats.find((x) => x.id === st).points = 1;
  winRound(s, 2);
  tick(s, s.endsAt, rng0);
  assert.equal(s.phase, 'result');
  assert.deepEqual(viewFor(s, st).result.ranks.map((r) => r.rank), [1, 2, 2]);
});

// ---------- 시간 상수 ----------

test('연출 시간은 상수대로', () => {
  assert.equal(REVEAL_MS, 2500); assert.equal(BETWEEN_MS, 1500); assert.equal(AUTO_FLIP_MS, 500);
  const s = mk(3);
  setupAll(s);
  const t = T0 + 777;
  good(s, s.turnId, { a: 'bid', n: 3 }, t); // 합계(3) 바로 도전
  assert.equal(s.flipAt, t + AUTO_FLIP_MS);
});

// ---------- 검토 지적 고침: 내 더미 전부 공개 / 판정 뒤 제3자 이탈 ----------

function ownStack(s, id, stack) {
  const x = s.seats.find((q) => q.id === id);
  x.stack = [...stack];
}

test('내 더미 2장(아래 해골·위 꽃), 1 부름 → 꽃 한 장으로 숫자를 채워도 멈추지 않고 해골까지 열어 실패', () => {
  const s = mk(3);
  setupAll(s);
  const ch = s.turnId;
  ownStack(s, ch, ['S', 'F']);
  good(s, ch, { a: 'bid', n: 1 });
  while (s.step === 'bid') good(s, s.turnId, { a: 'pass' });
  const fx1 = tick(s, s.flipAt, rng0);
  assert.equal(fx1.events[0].e.disc, 'F');
  assert.equal(s.step, 'flip'); // 1장 채웠지만 자기 더미가 남아 계속
  assert.notEqual(s.flipAt, null);
  const fx2 = tick(s, s.flipAt, rng0);
  assert.deepEqual(kinds(fx2), ['gkFlip', 'gkReveal']);
  assert.deepEqual(fx2.events[1].e, { k: 'gkReveal', ok: false, challenger: ch, skullOf: ch });
});

test('내 더미 3장 모두 꽃, 2 부름 → 3장 다 공개된 뒤 성공(flipped 3)', () => {
  const s = mk(3);
  setupAll(s);
  const ch = s.turnId;
  ownStack(s, ch, ['F', 'F', 'F']);
  good(s, ch, { a: 'bid', n: 2 });
  while (s.step === 'bid') good(s, s.turnId, { a: 'pass' });
  let flips = 0;
  const all = [];
  while (s.step === 'flip') { const fx = tick(s, s.flipAt, rng0); all.push(...kinds(fx)); }
  flips = all.filter((k) => k === 'gkFlip').length;
  assert.equal(flips, 3);
  assert.equal(s.step, 'reveal');
  assert.equal(s.outcome.ok, true);
  assert.equal(s.flipped, 3);
  assert.equal(viewFor(s, 'p0').flipped, 3);
});

test('내 더미를 다 열었는데 꽃이 모자라면 남의 더미 단계', () => {
  const s = mk(3);
  setupAll(s);
  const ch = challenge(s, 2);
  autoFlip(s);
  assert.equal(s.step, 'flip'); assert.equal(s.flipAt, null);
  assert.equal(s.flipped, 1);
});

// 4명, 판정(reveal)까지 만든다. fail=true 면 해골 주인의 더미를 연다.
function judged(fail) {
  const s = mk(4);
  const st = s.starter;
  const others = order(s).filter((x) => x !== st);
  const skullMan = others[0];
  setupAll(s, fail ? { [skullMan]: 'S' } : {});
  challenge(s, 2);
  autoFlip(s);
  good(s, st, { a: 'flip', p: fail ? skullMan : others[0] });
  assert.equal(s.step, 'reveal');
  assert.equal(s.outcome.ok, !fail);
  return { s, st, others, skullMan };
}

test('성공 판정 중 제3자가 나가도 점수는 그대로 오른다', () => {
  const { s, st, others } = judged(false);
  const fx = leave(s, others[2], s.now, rng0);
  assert.deepEqual(kinds(fx), ['gkOut']);
  assert.equal(s.step, 'reveal');
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'between');
  assert.equal(s.seats.find((x) => x.id === st).points, 1);
  assert.equal(s.seats.find((x) => x.id === others[2]).out, 'leave');
});

test('성공 판정 중 제3자가 나가고 2점째면 승리', () => {
  const { s, st, others } = judged(false);
  s.seats.find((x) => x.id === st).points = 1;
  leave(s, others[2], s.now, rng0);
  tick(s, s.endsAt, rng0);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, st);
  assert.equal(s.result.reason, 'points');
});

test('실패 판정 중 해골 주인이 나가면 벌칙은 난수로 고르고 이어 간다', () => {
  const { s, st, skullMan } = judged(true);
  leave(s, skullMan, s.now, rng0);
  assert.equal(s.step, 'reveal');
  const fx = tick(s, s.endsAt, (n) => n - 1);
  assert.deepEqual(kinds(fx), ['gkLose', 'gkLoseMine']);
  assert.equal(s.step, 'between');
  assert.equal(s.starter, st); // 해골 주인은 나갔으니 도전자가 다음 시작
  assert.equal(viewFor(s, st).seats.find((x) => x.id === st).discs, 3);
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'setup');
});

test('벌칙 중 제3자가 나가도 그대로 진행', () => {
  const { s, st, others, skullMan } = judged(true);
  tick(s, s.endsAt, rng0);
  assert.equal(s.step, 'penalty');
  const third = others.find((x) => x !== skullMan);
  const fx = leave(s, third, s.now, rng0);
  assert.deepEqual(kinds(fx), ['gkOut']);
  assert.equal(s.step, 'penalty');
  good(s, skullMan, { a: 'discard', i: 0 });
  assert.equal(s.step, 'between');
  assert.equal(s.starter, st);
});

test('나가기로 탈락한 자리는 viewFor 에서 원판·손·더미가 0', () => {
  const s = mk(4);
  setupAll(s);
  const gone = order(s)[3];
  leave(s, gone, T0, rng0);
  const q = viewFor(s, 'p0').seats.find((x) => x.id === gone);
  assert.equal(q.out, 'leave');
  assert.deepEqual([q.discs, q.hand, q.stack, q.shown.length], [0, 0, 0, 0]);
});
