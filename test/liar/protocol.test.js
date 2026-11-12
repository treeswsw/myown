import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLg } from '../../shared/liar/protocol.js';

const ok = (m) => { const r = checkLg(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const no = (m) => { const r = checkLg(m); assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(typeof r.error, 'string'); };

test('모양이 틀린 요청', () => {
  for (const m of [null, undefined, 'x', 5, [], { a: 5 }, {}, { a: 'nope' }, { a: '__proto__' }]) no(m);
});

test('settings: 맞는 것과 정리', () => {
  const src = { a: 'settings', liarMode: 'notice', wordSet: 'star', topicMode: 'host', goal: 15, junk: 1,
    times: { speak: 45, bogus: 1 }, topics: [{ name: '음식', on: true, x: 1 }], nextTopic: null, __proto__: { evil: 1 } };
  const copy = JSON.stringify(src);
  const m = ok(src);
  assert.equal(JSON.stringify(src), copy);
  assert.deepEqual(m, { a: 'settings', liarMode: 'notice', wordSet: 'star', topicMode: 'host', goal: 15,
    times: { speak: 45 }, topics: [{ name: '음식', on: true }], nextTopic: null });
  assert.deepEqual(ok({ a: 'settings', nextTopic: '동물', zzz: 1 }), { a: 'settings', nextTopic: '동물' });
});

test('settings: 틀린 것', () => {
  no({ a: 'settings' });
  no({ a: 'settings', junk: 1 });
  no({ a: 'settings', liarMode: 'x' });
  no({ a: 'settings', wordSet: 'moon' });
  no({ a: 'settings', topicMode: 1 });
  no({ a: 'settings', goal: 7 });
  no({ a: 'settings', times: { speak: 25 } });
  no({ a: 'settings', times: 'x' });
  no({ a: 'settings', times: [] });
  no({ a: 'settings', times: { speak: '30' } });
  no({ a: 'settings', topics: [] });
  no({ a: 'settings', topics: 'x' });
  no({ a: 'settings', topics: [{ name: '', on: true }] });
  no({ a: 'settings', topics: [{ name: 'a'.repeat(21), on: true }] });
  no({ a: 'settings', topics: [{ name: 'a', on: 1 }] });
  no({ a: 'settings', topics: Array.from({ length: 31 }, (_, i) => ({ name: 't' + i, on: true })) });
  ok({ a: 'settings', topics: Array.from({ length: 30 }, (_, i) => ({ name: 't' + i, on: true })) });
  no({ a: 'settings', nextTopic: '' });
  no({ a: 'settings', nextTopic: 5 });
  no({ a: 'settings', nextTopic: 'a'.repeat(21) });
});

test('kick / vote / judge', () => {
  assert.deepEqual(ok({ a: 'kick', id: '철수', x: 1 }), { a: 'kick', id: '철수' });
  no({ a: 'kick' }); no({ a: 'kick', id: '' }); no({ a: 'kick', id: 5 }); no({ a: 'kick', id: 'a'.repeat(41) });
  assert.deepEqual(ok({ a: 'vote', target: null }), { a: 'vote', target: null });
  assert.deepEqual(ok({ a: 'vote', target: 'abc' }), { a: 'vote', target: 'abc' });
  no({ a: 'vote' }); no({ a: 'vote', target: 3 });
  assert.deepEqual(ok({ a: 'judge', v: 'yes' }), { a: 'judge', v: 'yes' });
  no({ a: 'judge', v: 'maybe' }); no({ a: 'judge' });
});

test('say / guess 글자', () => {
  assert.deepEqual(ok({ a: 'say', text: '  안녕\n\t하세요​ ' }), { a: 'say', text: '안녕  하세요' });
  assert.equal(ok({ a: 'say', text: 'a'.repeat(80) }).text.length, 80);
  no({ a: 'say', text: 'a'.repeat(81) });
  no({ a: 'say', text: '' }); no({ a: 'say', text: '   ' }); no({ a: 'say', text: '​' }); no({ a: 'say', text: 5 }); no({ a: 'say' });
  assert.equal(ok({ a: 'say', text: '😀'.repeat(80) }).text.length, 160);
  no({ a: 'say', text: '😀'.repeat(81) });
  ok({ a: 'guess', text: 'a'.repeat(30) });
  no({ a: 'guess', text: 'a'.repeat(31) });
  no({ a: 'guess', text: '' });
  ok({ a: 'guess', text: '😀'.repeat(30) });
  no({ a: 'guess', text: '😀'.repeat(31) });
  assert.equal(ok({ a: 'guess', text: '👨‍👩‍👧' }).text, '👨‍👩‍👧');
});

test('end / rank 와 모르는 칸 제거', () => {
  assert.deepEqual(ok({ a: 'end', x: 1 }), { a: 'end' });
  assert.deepEqual(ok({ a: 'rank', t: 'lg' }), { a: 'rank' });
});
