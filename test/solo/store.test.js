// 혼자 놀기 저장·순위 시험 (docs/solo/PLAN.md 4-1): users.solo, topSolo, soloRank (메모리 저장소)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, newUser, normalizeUser, RANK_EXCLUDED_ID } from '../../server/store.js';

async function mk(s, id, solo, name = id) {
  const u = await s.getOrCreate(id, name);
  u.solo = solo;
  await s.save(u);
  return u;
}
const rec = (best, at, wk = 0, wbest = 0, wat = 0, n = 1) => ({ best, at, n, wk, wbest, wat });

test('새 계정·옛 행: solo 기본값은 빈 객체', async () => {
  assert.deepEqual(newUser('a', 'a').solo, {});
  const old = { id: 'a', name: 'a', bank: 1, avatar: null, stats: {} };
  assert.deepEqual(normalizeUser(old).solo, {});
  const s = createStore(null);
  assert.deepEqual((await s.getOrCreate('x', 'x')).solo, {});
});

test('normalizeUser: 이상한 solo 칸은 버리거나 0 으로', () => {
  const u = normalizeUser({
    id: 'a', name: 'a', bank: 1, avatar: null, stats: {},
    solo: { g2048: { best: 500, at: 7, n: 3, wk: 2900, wbest: 500, wat: 7 }, bad: 5, 'Bad Id': { best: 1 }, apple: { best: -1, at: 1.5, n: 'x', wk: null }, ['__proto__']: { best: 1 }, list: [1] },
  });
  assert.deepEqual(u.solo.g2048, { best: 500, at: 7, n: 3, wk: 2900, wbest: 500, wat: 7 });
  assert.deepEqual(u.solo.apple, { best: 0, at: 0, n: 0, wk: 0, wbest: 0, wat: 0 });
  assert.deepEqual(Object.keys(u.solo).sort(), ['apple', 'g2048']);
  assert.equal(Object.getPrototypeOf(u.solo), Object.prototype);
  assert.equal(normalizeUser({ id: 'a', name: 'a', bank: 1, stats: {}, solo: [1] }).solo.constructor, Object);
  assert.deepEqual(normalizeUser({ id: 'a', name: 'a', bank: 1, stats: {}, solo: 'x' }).solo, {});
});

test('통째 저장해도 solo 칸이 안 사라지고, 읽은 값을 고쳐도 저장소가 안 변한다', async () => {
  const s = createStore(null);
  await mk(s, 'a', { apple: rec(80, 1000) });
  const u = await s.getOrCreate('a');
  assert.equal(u.solo.apple.best, 80);
  u.solo.apple.best = 999;
  assert.equal((await s.getOrCreate('a')).solo.apple.best, 80);
  u.coins = 5; // 다른 칸을 고쳐 저장
  delete u.solo.apple;
  u.solo.g2048 = rec(10, 5);
  await s.save(u);
  const v = await s.getOrCreate('a');
  assert.deepEqual(Object.keys(v.solo), ['g2048']);
  assert.equal(v.coins, 5);
});

test('topSolo: 점수 내림차순, 동점은 먼저 세운 사람이 위, 0점 제외', async () => {
  const s = createStore(null);
  await mk(s, 'a', { apple: rec(80, 300) }, '에이');
  await mk(s, 'b', { apple: rec(90, 500) }, '비');
  await mk(s, 'c', { apple: rec(80, 100) }, '씨');
  await mk(s, 'd', { apple: rec(0, 0) }, '디');
  await mk(s, 'e', { g2048: rec(5000, 1) }, '이'); // 다른 종목
  await mk(s, 'f', {}, '에프');
  assert.deepEqual(await s.topSolo('apple', 10), [
    { name: '비', score: 90, at: 500 }, { name: '씨', score: 80, at: 100 }, { name: '에이', score: 80, at: 300 },
  ]);
  assert.equal((await s.topSolo('apple', 2)).length, 2);
  assert.deepEqual(await s.topSolo('none', 5), []);
  assert.deepEqual((await s.topSolo('g2048', 5)).map((x) => x.name), ['이']);
});

test('topSolo 이번 주: wk 가 같은 사람만, wbest/wat 로', async () => {
  const s = createStore(null);
  await mk(s, 'a', { apple: rec(100, 10, 2900, 40, 20) }, '에이');
  await mk(s, 'b', { apple: rec(50, 30, 2899, 50, 40) }, '비'); // 지난 주 기록
  await mk(s, 'c', { apple: rec(60, 50, 2900, 60, 60) }, '씨');
  await mk(s, 'd', { apple: rec(60, 50, 2900, 40, 5) }, '디'); // 에이와 동점, 먼저 세움
  assert.deepEqual(await s.topSolo('apple', 10, 2900), [
    { name: '씨', score: 60, at: 60 }, { name: '디', score: 40, at: 5 }, { name: '에이', score: 40, at: 20 },
  ]);
  assert.deepEqual((await s.topSolo('apple', 10)).map((x) => x.name), ['에이', '씨', '디', '비']);
  assert.deepEqual(await s.topSolo('apple', 10, 1), []);
  assert.deepEqual(await s.topSolo('apple', 10, 0), []); // 0주차(wk 0, wbest 0)도 0점은 제외
});

test('soloRank: 내 순위·점수·시각, 순위에 오른 사람 수, 기록 없으면 null', async () => {
  const s = createStore(null);
  await mk(s, 'a', { apple: rec(80, 300, 7, 80, 300) });
  await mk(s, 'b', { apple: rec(90, 500, 7, 30, 400) });
  await mk(s, 'c', { apple: rec(80, 100, 6, 80, 100) });
  await mk(s, 'z', {});
  assert.deepEqual(await s.soloRank('b', 'apple'), { rank: 1, score: 90, at: 500, n: 3 });
  assert.deepEqual(await s.soloRank('c', 'apple'), { rank: 2, score: 80, at: 100, n: 3 });
  assert.deepEqual(await s.soloRank('a', 'apple'), { rank: 3, score: 80, at: 300, n: 3 });
  assert.deepEqual(await s.soloRank('z', 'apple'), { rank: null, score: 0, at: 0, n: 3 });
  assert.deepEqual(await s.soloRank('nobody', 'apple'), { rank: null, score: 0, at: 0, n: 3 });
  assert.deepEqual(await s.soloRank('a', 'apple', 7), { rank: 1, score: 80, at: 300, n: 2 });
  assert.deepEqual(await s.soloRank('b', 'apple', 7), { rank: 2, score: 30, at: 400, n: 2 });
  assert.deepEqual(await s.soloRank('c', 'apple', 7), { rank: null, score: 0, at: 0, n: 2 }); // 지난 주
});

test('관리자·관전 계정은 순위에서 빠진다', async () => {
  const s = createStore(null);
  await mk(s, RANK_EXCLUDED_ID, { apple: rec(999, 1) }, '관리자');
  await mk(s, '관전1', { apple: rec(500, 1) }, '관전1');
  await mk(s, 'a', { apple: rec(10, 2) }, '에이');
  assert.deepEqual((await s.topSolo('apple', 10)).map((x) => x.name), ['에이']);
  assert.equal((await s.soloRank(RANK_EXCLUDED_ID, 'apple')).rank, null);
  assert.equal((await s.soloRank('a', 'apple')).rank, 1);
});

test('clear 하면 순위도 비워진다', async () => {
  const s = createStore(null);
  await mk(s, 'a', { apple: rec(10, 2) });
  await s.clear();
  assert.deepEqual(await s.topSolo('apple', 10), []);
});
