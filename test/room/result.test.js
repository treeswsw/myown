// 공통 결과 화면의 그릴 값(client/src/room/result.js resultModel): 1등·코인 글자·0 흐리게·칩·나눠 보기·방장 버튼.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resultModel } from '../../client/src/room/result.js';

const state = (result, extra = {}) => ({
  hostId: 'a', you: 'a', wait: { can: true, why: null, set: {}, own: {}, result }, ...extra,
});

test('결과 없음 = null', () => {
  assert.equal(resultModel({ wait: { result: null } }, 'a'), null);
  assert.equal(resultModel(null, 'a'), null);
});

test('코인: 금색 "+3 코인", 0 은 "0", 1등 이름이 제목, 내 줄 표시', () => {
  const m = resultModel(state({
    rows: [{ id: 'a', name: '갑', rank: 1, score: 30 }, { id: 'b', name: '을', rank: 2, score: 1200, note: '맞힘 2' }],
    gain: { a: 3, b: 0 }, unit: 'coin',
  }), 'a');
  assert.equal(m.title, '갑 승리');
  assert.deepEqual(m.rows.map((r) => [r.gain, r.zero, r.top, r.me, r.score, r.note]),
    [['+3 코인', false, true, true, '30', ''], ['0', true, false, false, '1,200', '맞힘 2']]);
  assert.equal(m.isHost, true);
});

test('칩: "+1,200 칩" / "−500 칩", 게임 제목이 있으면 그것', () => {
  const m = resultModel(state({
    rows: [{ id: 'a', name: '갑', rank: 1 }, { id: 'b', name: '을', rank: 2 }],
    gain: { a: 1200, b: -500 }, unit: 'chip',
  }), 'b', { title: '챔피언', sub: '칩을 모두 땄어요' });
  assert.deepEqual(m.rows.map((r) => [r.gain, r.down, r.score]), [['+1,200 칩', false, null], ['−500 칩', true, null]]);
  assert.deepEqual([m.title, m.sub, m.isHost], ['챔피언', '칩을 모두 땄어요', false]);
});

test('더한 증감(add)은 한 줄로 나눠 보인다: 판 코인 +1 · 베팅 +5', () => {
  const m = resultModel(state({
    rows: [{ id: 'a', name: '갑', rank: 1 }, { id: 'b', name: '을', rank: 2 }],
    gain: { a: 6, b: -5 }, unit: 'coin', add: { label: '베팅', by: { a: 5, b: -5 } },
  }), 'a');
  assert.deepEqual(m.rows.map((r) => [r.gain, r.split]), [['+6 코인', '판 코인 +1 · 베팅 +5'], ['−5 코인', '판 코인 0 · 베팅 −5']]);
});

test('공동 1등·시작 못 함 이유', () => {
  const s = state({ rows: [{ id: 'a', name: '갑', rank: 1 }, { id: 'b', name: '을', rank: 1 }], gain: {}, unit: 'coin' });
  s.wait.can = false;
  s.wait.why = { msg: '3명 이상 필요합니다.', code: 'lg_need3' };
  const m = resultModel(s, 'a');
  assert.equal(m.title, '갑, 을 승리');
  assert.deepEqual([m.can, m.why], [false, '3명 이상 필요합니다.']);
  assert.deepEqual(m.rows.map((r) => r.gain), ['0', '0'], '관전자·봇 방처럼 gain 이 없으면 0');
});
