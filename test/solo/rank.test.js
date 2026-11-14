// 혼자 놀기 순위 요청 시험 (docs/solo/PLAN.md 4-2): {t:'so', a:'rank', game} -> {t:'soRank', ...}. 방 밖·방 안 어디서나, 5초 기억.
import test from 'node:test';
import assert from 'node:assert/strict';
import { soloHub, attach, errOf, mark, settled } from './hub.js';
import { weekOf } from '../../shared/solo/coin.js';

const DAY = 86_400_000;
const answer = (c, since = 0) => c.sock.msgs.slice(since).filter((m) => m.t === 'soRank').at(-1);

// id 가 한 판 해서 score 점(fake_tick: 입력 v = +v)을 남기고 방을 나온다
async function play(h, id, score) {
  const c = await h.login(id);
  await c.send({ t: 'create', mode: 'solo' });
  await h.tick(3000);
  const p = attach(h, c);
  p.run.input(score);
  await p.flush();
  await p.end();
  await c.send({ t: 'leave' });
  return c;
}

test('방 밖에서도 순위를 받는다: 상위 목록(점수 내림차순·동점은 먼저 세운 사람)과 내 순위', async () => {
  const h = soloHub({ first: 'fake_tick' });
  await play(h, 'ann1', 100);
  await play(h, 'bob1', 300);
  await play(h, 'cat1', 100);
  const d = await h.login('dan1');
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  const r = answer(d);
  assert.equal(r.game, 'fake_tick');
  assert.equal(r.week, weekOf(h.clock.now()));
  assert.deepEqual(r.all.top.map((x) => [x.name, x.score]), [['bob1', 300], ['ann1', 100], ['cat1', 100]]);
  assert.deepEqual(r.wk.top.map((x) => x.name), ['bob1', 'ann1', 'cat1']);
  assert.deepEqual(r.all.mine, { rank: null, score: 0, at: 0, n: 3 });
  assert.equal(typeof r.all.top[0].at, 'number');
  assert.deepEqual(Object.keys(r.all.top[0]).sort(), ['at', 'name', 'score'], '이름·점수·시각만 나간다');
  const a = await h.login('ann1');
  await a.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.equal(answer(a).all.mine.rank, 2);
  assert.equal(answer(a).all.mine.score, 100);
});

test('방 안에서도 허브가 답한다(방에 넘기지 않는다)', async () => {
  const h = soloHub({ first: 'fake_tick' });
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'solo' });
  const m = mark(a);
  await a.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.ok(answer(a, m));
  assert.equal(errOf(a, m), undefined);
});

test('이번 주 탭: 지난 주 기록은 전체에만 있다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  await play(h, 'ann1', 300);
  h.clock.advance(7 * DAY);
  await play(h, 'bob1', 50);
  const d = await h.login('dan1');
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  const r = answer(d);
  assert.deepEqual(r.all.top.map((x) => x.name), ['ann1', 'bob1']);
  assert.deepEqual(r.wk.top.map((x) => x.name), ['bob1']);
});

test('상위 목록은 5초 기억하고, 정산이 끝나면 그 종목 기억을 지운다', async () => {
  const h = soloHub({ first: 'fake_tick' });
  await play(h, 'ann1', 100);
  const d = await h.login('dan1');
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.equal(answer(d).all.top.length, 1);
  // 저장소만 바꾸면(정산 없이) 5초 안에는 옛 목록
  const u = await h.store.getOrCreate('eve1', 'eve1');
  u.solo = { fake_tick: { best: 999, at: 1, n: 1, wk: weekOf(h.clock.now()), wbest: 999, wat: 1 } };
  await h.store.save(u);
  let m = mark(d);
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.equal(answer(d, m).all.top.length, 1, '5초 안: 기억한 목록');
  await h.tick(5000);
  m = mark(d);
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.deepEqual(answer(d, m).all.top.map((x) => x.name), ['eve1', 'ann1'], '5초 뒤: 새 목록');
  // 정산이 끝나면 기억을 비운다
  const b = await h.login('bob1');
  await b.send({ t: 'create', mode: 'solo' });
  await h.tick(3000);
  const p = attach(h, b);
  p.run.input(360);
  await p.flush();
  await p.end();
  m = mark(d);
  await d.send({ t: 'so', a: 'rank', game: 'fake_tick' });
  assert.equal(answer(d, m).all.top[0].name, 'eve1');
  assert.deepEqual(answer(d, m).all.top.map((x) => x.name), ['eve1', 'bob1', 'ann1']);
});

test('없는 종목은 so_game, 스위치가 off 면 so_off', async () => {
  const h = soloHub();
  const d = await h.login('dan1');
  await d.send({ t: 'so', a: 'rank', game: 'nope' });
  assert.equal(errOf(d), 'so_game');
  await d.send({ t: 'so', a: 'rank', game: '__proto__' });
  assert.equal(errOf(d), 'so_game');
  await d.send({ t: 'so', a: 'rank', game: 'constructor' });
  assert.equal(errOf(d), 'so_game');
  const off = soloHub({ solo: 'off' });
  const e = await off.login('eve1');
  await e.send({ t: 'so', a: 'rank', game: 'fake_turn' });
  assert.equal(errOf(e), 'so_off');
});

test('모양이 틀린 순위 요청은 허브 검사에서 거절된다', async () => {
  const h = soloHub();
  const d = await h.login('dan1');
  await d.send({ t: 'so', a: 'rank' });
  assert.ok(d.sock.msgs.some((m) => m.t === 'error'));
  assert.equal(answer(d), undefined);
  await settled();
});
