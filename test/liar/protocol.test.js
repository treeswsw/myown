import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLg } from '../../shared/liar/protocol.js';

const ok = (m) => { const r = checkLg(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const no = (m) => { const r = checkLg(m); assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(typeof r.error, 'string'); };

test('모양이 틀린 요청', () => {
  for (const m of [null, undefined, 'x', 5, [], { a: 5 }, {}, { a: 'nope' }, { a: '__proto__' }]) no(m);
});

test('vote / judge', () => {
  no({ a: 'kick', id: '철수' }); no({ a: 'settings', goal: 15 }); // 옛 요청은 공용 kick·set 으로 대체됨
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
