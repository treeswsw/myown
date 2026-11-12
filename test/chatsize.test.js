import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSize } from '../client/src/ui/chatSize.js';

const c = (s) => chatSize(s);
test('chatSize marks', () => {
  assert.deepEqual(c('hi'), { size: 0, text: 'hi' });
  assert.deepEqual(c('*hi'), { size: 1, text: 'hi' });
  assert.deepEqual(c('** hi'), { size: 2, text: 'hi' });
  assert.deepEqual(c('***hi'), { size: 3, text: 'hi' });
  assert.deepEqual(c('****x'), { size: 3, text: '*x' });
  assert.deepEqual(c('hi *x'), { size: 0, text: 'hi *x' });
});
test('chatSize: nothing after the mark stays plain', () => {
  for (const t of ['#', '*', '**', '***', '#  ', '*  ']) assert.equal(c(t).size, 0);
  assert.equal(c('***').text, '***');
});
test('chatSize: # unchanged (old behaviour)', () => {
  const old = (m) => { const t = m.trim(); const r = t.startsWith('#') ? t.slice(1).trimStart() : ''; return { text: r || t, big: Boolean(r) }; };
  for (const t of ['#hi', '# hi', '##x', '#', '# ', 'a#', ' #  yo ', '#*x']) {
    const n = c(t);
    assert.deepEqual({ text: n.text, big: n.size >= 2 }, old(t), t);
  }
});
