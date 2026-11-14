// 혼자 놀기 통신 검사 + 방 만들기 추가 칸 거르기 (등록표 칸 parse / create). docs/solo/PLAN.md 5절, SPEC 7-5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../../server/protocol.js';
import { GAMES } from '../../shared/games.js';

const p = (obj) => parseMessage(JSON.stringify(obj));

test('so in: n 은 0 이상 정수, ops 는 정수 1~512개, 각 −600 ~ 1048575', () => {
  assert.deepEqual(p({ t: 'so', a: 'in', n: 0, ops: [0, 5, -600, 1048575], junk: 1 }), { ok: true, msg: { t: 'so', a: 'in', n: 0, ops: [0, 5, -600, 1048575] } });
  for (const bad of [
    { n: -1, ops: [1] }, { n: 1.5, ops: [1] }, { n: '1', ops: [1] }, { ops: [1] }, { n: 0 }, { n: 0, ops: [] }, { n: 0, ops: 'x' },
    { n: 0, ops: Array(513).fill(1) }, { n: 0, ops: [1048576] }, { n: 0, ops: [-601] }, { n: 0, ops: [1.5] }, { n: 0, ops: ['1'] }, { n: 0, ops: [null] },
  ]) assert.equal(p({ t: 'so', a: 'in', ...bad }).ok, false, JSON.stringify(bad).slice(0, 60));
  assert.equal(p({ t: 'so', a: 'in', n: 0, ops: Array(512).fill(1) }).ok, true);
});

test('so end / rank', () => {
  assert.deepEqual(p({ t: 'so', a: 'end', score: 12, x: 1 }), { ok: true, msg: { t: 'so', a: 'end', score: 12 } });
  for (const bad of [{ score: -1 }, { score: 1.5 }, { score: '3' }, {}]) assert.equal(p({ t: 'so', a: 'end', ...bad }).ok, false);
  assert.deepEqual(p({ t: 'so', a: 'rank', game: 'apple' }), { ok: true, msg: { t: 'so', a: 'rank', game: 'apple' } });
  for (const bad of [{}, { game: 3 }, { game: '' }, { game: 'x'.repeat(21) }]) assert.equal(p({ t: 'so', a: 'rank', ...bad }).ok, false);
});

test('so: 모르는 a·a 없음은 거절', () => {
  for (const bad of [{ a: 'nope' }, {}, { a: 5 }]) assert.equal(p({ t: 'so', ...bad }).ok, false);
});

test('방 만들기: solo 는 종목만 남기고(모르는 종목은 표의 첫 종목), 다른 칸은 버린다', () => {
  const first = GAMES.solo.create({}).game; // 표가 비어 있으면 undefined
  assert.deepEqual(p({ t: 'create', mode: 'solo', game: 'nope', vs: 'bot', evil: 1 }).msg, { t: 'create', mode: 'solo', game: first });
  assert.deepEqual(GAMES.solo.create({ game: 5 }), { game: first });
});

test('방 만들기: 미니게임 추가 칸은 등록표 create 가 거른다 (분기가 표로 옮겨져도 결과가 같다)', () => {
  const ok = (m) => p({ t: 'create', mode: 'mini', ...m }).msg;
  assert.deepEqual(ok({}), { t: 'create', mode: 'mini', game: 'gomoku' });
  assert.deepEqual(ok({ game: 'chess', level: 'hard' }), { t: 'create', mode: 'mini', game: 'chess' });
  assert.deepEqual(ok({ game: 'chess', vs: 'puzzle' }), { t: 'create', mode: 'mini', game: 'chess', vs: 'puzzle' });
  assert.deepEqual(ok({ game: 'reversi', vs: 'puzzle' }), { t: 'create', mode: 'mini', game: 'reversi' }, '퍼즐은 체스만');
  assert.deepEqual(ok({ game: 'connect4', vs: 'bot', level: 'easy', side: 1 }), { t: 'create', mode: 'mini', game: 'connect4', vs: 'bot', level: 'easy', side: 1 });
  assert.deepEqual(ok({ game: 'bad', vs: 'bot', level: 'x', side: 7 }), { t: 'create', mode: 'mini', game: 'gomoku', vs: 'bot', level: 'mid', side: 0 });
});

test('방 만들기: create 칸이 없는 게임은 {t, mode} 만, 모르는 게임은 거절, mode 요청은 그대로', () => {
  assert.deepEqual(p({ t: 'create', mode: 'holdem', game: 'x' }).msg, { t: 'create', mode: 'holdem' });
  assert.equal(p({ t: 'create', mode: 'nope' }).ok, false);
  assert.deepEqual(p({ t: 'mode', mode: 'mini', game: 'chess' }).msg, { t: 'mode', mode: 'mini' });
});
