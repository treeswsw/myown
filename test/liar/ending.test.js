import test from 'node:test';
import assert from 'node:assert/strict';
import { endingPlan, wordLines, answerText, verdictText, secsText, stageAt, ED } from '../../client/src/liar/anim/ending.js';

const base = { unmask: { liarId: 'u2' }, settings: { times: { guess: 15 } } };
const G = { ...base, phase: 'guess' };
const A = (guess, words = { citizen: '도서관', liar: '놀이공원' }) => ({ ...base, phase: 'answer', guess, words });
const text = (p, part) => p.steps.filter((s) => s.part === part).map((s) => s.text).join('');

test('다른 단계에서는 계획이 없다', () => {
  assert.equal(endingPlan(null), null);
  assert.equal(endingPlan({ phase: 'unmask' }), null);
  assert.equal(endingPlan({ phase: 'result' }), null);
});

test('guess: 제목이 한 글자씩, total 은 방 설정 시간', () => {
  const p = endingPlan(G, '서아');
  assert.equal(p.total, 15);
  assert.equal(text(p, 'title'), ED.title);
  assert.equal(p.steps[0].at, 0.5);
  for (let i = 1; i < p.steps.length; i++) assert.ok(p.steps[i].at > p.steps[i - 1].at);
  assert.ok(p.marks.secsAt > p.steps.at(-1).at);
  assert.ok(p.marks.secsAt < 3);
  assert.equal(endingPlan({ ...G, settings: null }).total, null);
  assert.equal(stageAt(p, 1), 'ask');
});

test('answer: 시작 1.0초에 답, 3.5초에 판정, 10초에 끝', () => {
  const p = endingPlan(A({ text: '놀이공원', correct: false }), '서아');
  assert.equal(p.total, 10);
  assert.equal(text(p, 'answer'), '놀이공원');
  assert.equal(p.steps.find((s) => s.part === 'answer').at, 1);
  assert.equal(p.steps.find((s) => s.part === 'verdict').at, 3.5);
  assert.equal(text(p, 'verdict'), '라이어가 답을 맞히지 못했습니다');
  assert.ok(p.marks.verdictEnd < p.marks.endAt - 2, '끝에 머무는 시간');
});

test('맞힘 문구와 단계 이름', () => {
  const p = endingPlan(A({ text: '도서관', correct: true }));
  assert.equal(text(p, 'verdict'), '라이어가 답을 맞혔습니다');
  const seq = [0, 1.2, 4, p.marks.verdictEnd + 0.01, 10].map((e) => stageAt(p, e));
  assert.deepEqual(seq, ['word', 'answer', 'verdict', 'hold', 'end']);
});

test('긴 답은 최대 2초 안에 끝나고 판정은 그 뒤에 온다', () => {
  const long = '가'.repeat(30);
  const p = endingPlan(A({ text: long, correct: false }));
  assert.equal(text(p, 'answer'), long);
  assert.ok(p.marks.answerEnd <= ED.answerAt + ED.answerMax + 0.01);
  assert.ok(p.marks.verdictAt >= p.marks.answerEnd);
  assert.ok(p.steps.at(-1).at < p.total - 2);
});

test('답이 없으면 시간 초과', () => {
  for (const g of [{ text: null, correct: false }, { text: '  ', correct: false }, null]) {
    assert.equal(answerText(g), '시간 초과');
  }
  const p = endingPlan(A({ text: null, correct: false }));
  assert.equal(text(p, 'answer'), '시간 초과');
});

test('문구: 다른 제시어는 두 칸, 라이어 알림은 제시어만', () => {
  assert.deepEqual(wordLines({ citizen: '도서관', liar: '놀이공원' }), { word: '제시어 : 도서관', mismatch: '미스매치 : 놀이공원' });
  assert.deepEqual(wordLines({ citizen: '도서관', liar: null }), { word: '제시어 : 도서관', mismatch: null });
  assert.deepEqual(wordLines(null), { word: null, mismatch: null });
  assert.equal(verdictText(true), '라이어가 답을 맞혔습니다');
  assert.equal(secsText(4100), '5초');
  assert.equal(secsText(-5), '0초');
});

test('사용자 글자는 그대로(태그 해석 없음)', () => {
  const p = endingPlan(A({ text: '<b>x</b>', correct: false }));
  assert.equal(text(p, 'answer'), '<b>x</b>');
});
