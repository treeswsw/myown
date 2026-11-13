import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, isCorrect, makeMask, letterCount, acceptedNames } from '../../shared/draw/answer.js';

test('정답: 띄어쓰기·대소문자·가운뎃점·마침표 무시', () => {
  const e = { w: '골든 리트리버', alt: [] };
  assert.ok(isCorrect('골든리트리버', e));
  assert.ok(isCorrect('  골든   리트리버 ', e));
  assert.ok(isCorrect('골든　리트리버', e));
  assert.ok(isCorrect('TV', { w: 'tv', alt: [] }));
  assert.ok(isCorrect('t v', { w: 'TV', alt: [] }));
  assert.ok(isCorrect('나라도시', { w: '나라·도시', alt: [] }));
  assert.ok(isCorrect('아이스크림.', { w: '아이스크림', alt: [] }));
});

test('정답: 다른 이름(alt)도 인정, 부분 일치는 오답', () => {
  const e = { w: '돈가스', alt: ['돈까스'] };
  assert.ok(isCorrect('돈까스', e));
  assert.ok(isCorrect('돈가스', e));
  assert.ok(!isCorrect('돈가', e));
  assert.ok(!isCorrect('돈가스인가', e));
  assert.ok(!isCorrect('짜장면인가', { w: '짜장면', alt: [] }));
  assert.ok(isCorrect('짜장면', '짜장면'));
});

test('정답: 빈 입력·이상한 값은 오답, NFC 정규화', () => {
  assert.ok(!isCorrect('', { w: '', alt: [] }));
  assert.ok(!isCorrect('   ', { w: 'a', alt: [] }));
  assert.ok(!isCorrect(null, { w: 'a' }));
  assert.ok(!isCorrect('a', null));
  const nfd = '한글'.normalize('NFD');
  assert.notEqual(nfd, '한글');
  assert.ok(isCorrect(nfd, { w: '한글', alt: [] }));
  assert.equal(normalizeAnswer(' A·b. c '), 'abc');
  assert.deepEqual(acceptedNames({ w: 'a', alt: ['b'] }), ['a', 'b']);
});

test('글자 수 칸', () => {
  assert.equal(makeMask('짜장면'), '□□□');
  assert.equal(makeMask('골든 리트리버'), '□□ □□□□');
  assert.equal(makeMask('나라·도시'), '□□□□□');
  assert.equal(makeMask(''), '');
  assert.equal(makeMask(null), '');
  assert.equal(letterCount('골든 리트리버'), 6);
  assert.equal(letterCount('짜장면'), 3);
});
