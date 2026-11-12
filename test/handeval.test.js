import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareScores, describe } from '../shared/handeval.js';

const h = (s) => s.split(' ');
const ev = (s) => evaluate(h(s));

test('category names', () => {
  assert.equal(ev('As Kd 9c 7h 3d 2s 4c').name, '하이카드');
  assert.equal(ev('As Ad 9c 7h 3d 2s 4c').name, '원페어');
  assert.equal(ev('As Ad 9c 9h 3d 2s 4c').name, '투페어');
  assert.equal(ev('As Ad Ac 9h 3d 2s 4c').name, '트리플');
  assert.equal(ev('5s 6d 7c 8h 9d 2s 2c').name, '스트레이트');
  assert.equal(ev('As Ks 9s 7s 3s 2d 2c').name, '플러시');
  assert.equal(ev('As Ad Ac 9h 9d 2s 4c').name, '풀하우스');
  assert.equal(ev('As Ad Ac Ah 9d 2s 4c').name, '포카드');
  assert.equal(ev('5s 6s 7s 8s 9s 2d 2c').name, '스트레이트 플러시');
  assert.equal(ev('As Ks Qs Js Ts 2d 2c').name, '로열 플러시');
});

test('wheel straight is five-high and loses to six-high', () => {
  const wheel = ev('As 2d 3c 4h 5d Kc 9s');
  const six = ev('2s 3d 4c 5h 6d Kc 9s');
  assert.equal(wheel.name, '스트레이트');
  assert.deepEqual(wheel.cards.map((c) => c[0]), ['5', '4', '3', '2', 'A']);
  assert.ok(compareScores(six.score, wheel.score) > 0);
  const wheelFlush = ev('As 2s 3s 4s 5s Kc 9d');
  assert.equal(wheelFlush.name, '스트레이트 플러시');
  assert.ok(compareScores(ev('2h 3h 4h 5h 6h Kc 9d').score, wheelFlush.score) > 0);
});

test('ace-high straight beats king-high; no wraparound straight', () => {
  assert.ok(compareScores(ev('Ts Jd Qc Kh Ad 2c 3s').score, ev('9s Td Jc Qh Kd 2c 3s').score) > 0);
  assert.notEqual(ev('Qs Kd Ac 2h 3d 9c 8s').name, '스트레이트');
});

test('kickers decide equal pairs', () => {
  const a = ev('Ad Ac Kh 7s 4d 3c 2h');
  const b = ev('As Ah Qh 7d 4s 3d 2c');
  assert.ok(compareScores(a.score, b.score) > 0);
  assert.equal(compareScores(ev('Ad Ac Kh Qs 4d 3c 2h').score, ev('As Ah Kd Qd 4s 3d 2c').score), 0);
});

test('two pair uses best two pairs and top kicker', () => {
  const r = ev('Ks Kd 9c 9h 5d 5s 2c');
  assert.deepEqual(r.score, [2, 13, 9, 5]);
  assert.deepEqual(r.cards.slice(0, 4).map((c) => c[0]).sort(), ['9', '9', 'K', 'K']);
});

test('full house comparison and trips from seven cards', () => {
  assert.ok(compareScores(ev('Ks Kd Kc 2h 2d 9s 4c').score, ev('Qs Qd Qc Ah Ad 9s 4c').score) > 0);
  assert.deepEqual(ev('Ks Kd Kc 2h 2d 2s 4c').score, [6, 13, 2]);
});

test('flush compares all five cards, best five of seven chosen', () => {
  const r = ev('As Ks 9s 7s 3s 2s 4s');
  assert.deepEqual(r.score, [5, 14, 13, 9, 7, 4]);
  assert.equal(r.cards.length, 5);
});

test('describe handles preflop hands', () => {
  assert.equal(describe(h('As Ad')), '원페어');
  assert.equal(describe(h('As Kd')), '하이카드');
  assert.equal(describe(h('As Ad Ac 9h 9d')), '풀하우스');
});
