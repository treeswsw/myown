import test from 'node:test';
import assert from 'node:assert/strict';
import { unmaskPlan, unmaskKind } from '../../client/src/liar/anim/unmask.js';

const LIAR = { id: 'u2', wasLiar: true, liarId: 'u2' };
const CIT = { id: 'u1', wasLiar: false, liarId: 'u2' };
const FAIL = { id: null, wasLiar: null, liarId: 'u2' };
const text = (p, line, scene) => p.steps.filter((s) => s.line === line && s.scene === scene).map((s) => s.text).join('');

test('세 경우의 total 은 6·11·5', () => {
  assert.equal(unmaskPlan(LIAR, '서아').total, 6);
  assert.equal(unmaskPlan(CIT, '서아').total, 11);
  assert.equal(unmaskPlan(FAIL, '서아').total, 5);
  assert.deepEqual([LIAR, CIT, FAIL].map(unmaskKind), ['liar', 'citizen', 'fail']);
});

test('글자 수 = 문구 길이', () => {
  const l = unmaskPlan(LIAR, '서아');
  assert.equal(text(l, 1, 0), '그는 라이어가');
  assert.equal(text(l, 2, 0), '맞습니다');
  assert.equal(l.steps.length, '그는 라이어가맞습니다'.length);
  const c = unmaskPlan(CIT, '서아');
  assert.equal(text(c, 2, 0), '아닙니다');
  assert.equal(text(c, 1, 1), '라이어는');
  assert.equal(text(c, 2, 1), '서아 입니다');
  const f = unmaskPlan(FAIL, '서아');
  assert.equal(f.steps.filter((s) => s.scene === 0).length, 0);
  assert.equal(text(f, 1, 1), '라이어는');
});

test('시각이 늘어나는 순서이고 total 안에 끝난다', () => {
  for (const [u, n] of [[LIAR, '서아'], [CIT, '서아'], [FAIL, '서아'], [CIT, '아주아주긴이름의사람']]) {
    const p = unmaskPlan(u, n);
    for (let i = 1; i < p.steps.length; i++) assert.ok(p.steps[i].at > p.steps[i - 1].at);
    assert.ok(p.steps.at(-1).at < p.total);
    assert.ok(p.marks.liarAt <= p.marks.endAt);
  }
});

test('이름이 들어가고 그대로(태그 안 해석)', () => {
  const p = unmaskPlan(CIT, '<b>서아</b>');
  assert.equal(text(p, 2, 1), '<b>서아</b> 입니다');
  assert.ok(p.steps.filter((s) => s.part === 'name').length === '<b>서아</b>'.length);
});

test('시안 박자: 첫 글자는 1초, 두 번째 줄 첫 글자는 줄 끝 + 0.85초', () => {
  const p = unmaskPlan(CIT, '서아');
  assert.equal(p.steps[0].at, 1);
  const l1 = p.steps.filter((s) => s.line === 1 && s.scene === 0);
  const l2 = p.steps.filter((s) => s.line === 2 && s.scene === 0);
  assert.ok(Math.abs(l2[0].at - (l1.at(-1).at + 0.21 + 0.85)) < 0.002);
});
