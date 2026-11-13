import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  remainMs, formatTime, barFraction, isUrgent, maskCells, questionView, hitCounts,
  showHitCount, questionNo, answerBox, prepareText, keyboardHeight,
} from '../../client/src/draw/ui/hud.pure.js';

const P = (id, o = {}) => ({ id, name: id, connected: true, hit: false, ...o });
const mk = (o = {}) => ({
  phase: 'draw', you: 'b', drawerId: 'a', q: 5, qTotal: 14, rushed: false,
  settings: { len: true, time: 140 }, mask: '□□□', word: null,
  players: [P('a'), P('b'), P('c', { hit: true }), P('d', { connected: false })],
  ...o,
});

test('formatTime: 올림, 끝나면 0:00', () => {
  assert.equal(formatTime(26000), '0:26');
  assert.equal(formatTime(25001), '0:26');
  assert.equal(formatTime(140000), '2:20');
  assert.equal(formatTime(100), '0:01');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(formatTime(null), '0:00');
  assert.equal(formatTime(NaN), '0:00');
});

test('remainMs', () => {
  assert.equal(remainMs(1500, 1000), 500);
  assert.equal(remainMs(1000, 2000), 0);
  assert.equal(remainMs(null, 2000), null);
});

test('barFraction / isUrgent / rushed', () => {
  assert.equal(barFraction(mk(), 70000), 0.5);
  assert.equal(barFraction(mk({ rushed: true }), 15000), 0.5);
  assert.equal(barFraction(mk(), 999999999), 1);
  assert.equal(barFraction(mk({ phase: 'lobby' }), 1000), 0);
  assert.equal(isUrgent(mk(), 10000), true);
  assert.equal(isUrgent(mk(), 10001), false);
  assert.equal(isUrgent(mk(), 0), false);
  assert.equal(isUrgent(mk({ phase: 'pick' }), 5000), false);
});

test('maskCells: 띄어쓰기 자리는 칸이 아니다', () => {
  assert.deepEqual(maskCells('□□□'), { cells: [true, true, true], len: 3 });
  assert.deepEqual(maskCells('□□ □'), { cells: [true, true, false, true], len: 3 });
  assert.equal(maskCells(null), null);
  assert.equal(maskCells(''), null);
});

test('questionView: 그리는 사람과 맞힌 사람은 단어', () => {
  assert.deepEqual(questionView(mk({ you: 'a', word: '짜장면' }), 'a'), { kind: 'word', text: '짜장면' });
  assert.deepEqual(questionView(mk({ you: 'c', word: '짜장면' }), 'c'), { kind: 'word', text: '짜장면' });
});

test('★ 못 맞힌 사람 시점에서 단어가 표시되는 경로가 없다', () => {
  const secret = '짜장면';
  // 서버가 실수로 word 를 실어 보내도(방어) draw 에서는 칸만
  for (const meId of ['b', 'd', 'zzz', undefined]) {
    for (const len of [true, false]) {
      const v = questionView(mk({ you: meId, word: secret, settings: { len, time: 140 } }), meId);
      assert.notEqual(v.kind, 'word');
      assert.equal(JSON.stringify(v).includes(secret), false);
    }
  }
  // pick 단계에서도 단어를 보이지 않는다
  for (const meId of ['a', 'b', 'c']) {
    const v = questionView(mk({ phase: 'pick', word: secret }), meId);
    assert.equal(v.kind, 'note');
    assert.equal(JSON.stringify(v).includes(secret), false);
  }
  // lobby·final
  for (const phase of ['lobby', 'final']) {
    assert.equal(JSON.stringify(questionView(mk({ phase, word: secret }), 'b')).includes(secret), false);
  }
  assert.equal(questionView(null, 'b').kind, 'note');
});

test('questionView: 글자 수 끄면 칸 없음, reveal 은 모두 단어', () => {
  assert.equal(questionView(mk({ settings: { len: false, time: 140 }, mask: null }), 'b').kind, 'note');
  assert.equal(questionView(mk(), 'b').kind, 'mask');
  assert.equal(questionView(mk(), 'b').len, 3);
  assert.deepEqual(questionView(mk({ phase: 'reveal', word: '짜장면' }), 'b'), { kind: 'word', text: '짜장면' });
  assert.deepEqual(questionView(mk({ phase: 'reveal', word: null, reveal: { word: '우동' } }), 'b'), { kind: 'word', text: '우동' });
});

test('hitCounts: 그리는 사람 뺌, 끊긴 못 맞힌 사람 뺌', () => {
  assert.deepEqual(hitCounts(mk()), { n: 1, m: 2 });
  const s = mk({ players: [P('a'), P('b', { hit: true }), P('c', { hit: true, connected: false })] });
  assert.deepEqual(hitCounts(s), { n: 2, m: 2 });
  assert.equal(showHitCount(mk()), true);
  assert.equal(showHitCount(mk({ phase: 'reveal' })), false);
});

test('questionNo', () => {
  assert.deepEqual(questionNo(mk()), { q: 5, total: 14 });
  assert.equal(questionNo(mk({ qTotal: 0 })), null);
});

test('answerBox: 그리는 사람은 숨김, 맞힌 사람은 안내문', () => {
  assert.equal(answerBox(mk({ you: 'a' }), 'a').show, false);
  assert.equal(answerBox(mk({ phase: 'pick', you: 'a' }), 'a').show, false);
  const hit = answerBox(mk({ you: 'c' }), 'c');
  assert.equal(hit.show, true);
  assert.equal(hit.hit, true);
  assert.match(hit.placeholder, /맞힌 사람끼리/);
  const miss = answerBox(mk(), 'b');
  assert.deepEqual([miss.show, miss.enabled, miss.hit, miss.placeholder], [true, true, false, '정답 입력']);
  assert.equal(answerBox(mk({ phase: 'reveal', you: 'a' }), 'a').show, true);
  assert.equal(answerBox(mk({ phase: 'lobby' }), 'b').show, false);
  assert.equal(answerBox(mk({ phase: 'final' }), 'b').show, false);
  assert.equal(answerBox(null, 'b').show, false);
});

test('prepareText: 1~40자', () => {
  assert.equal(prepareText('  짜장면 '), '짜장면');
  assert.equal(prepareText('   '), null);
  assert.equal(prepareText(''), null);
  assert.equal(prepareText('가'.repeat(40)), '가'.repeat(40));
  assert.equal(prepareText('가'.repeat(41)), null);
  assert.equal(prepareText(5), null);
  assert.equal(prepareText('a\nb'), 'ab');
});

test('keyboardHeight', () => {
  assert.equal(keyboardHeight(390, 390, 0), 0);
  assert.equal(keyboardHeight(390, 180, 0), 210);
  assert.equal(keyboardHeight(390, 370, 0), 0);
  assert.equal(keyboardHeight(0, 0), 0);
});
