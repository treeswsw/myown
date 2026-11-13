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
test("madLetters: '***' bubble is the same for everyone and never repeats a neighbour's colour or font", async () => {
  const { madLetters, MAD_COLORS, MAD_FONTS, MAD_FX } = await import('../client/src/ui/chatSize.js');
  const a = madLetters('개씨발 진짜', 'u1|123|개씨발 진짜');
  assert.deepEqual(a, madLetters('개씨발 진짜', 'u1|123|개씨발 진짜'));
  assert.notDeepEqual(a, madLetters('개씨발 진짜', 'u1|124|개씨발 진짜'));
  assert.equal(a.map((x) => x.ch).join(''), '개씨발 진짜');
  assert.deepEqual(a[3], { ch: ' ' });
  const letters = a.filter((x) => x.font);
  for (const x of letters) {
    assert.ok(MAD_COLORS.includes(x.color) && MAD_FX.includes(x.fx) && MAD_FONTS.some(([f]) => f === x.font));
  }
  for (let i = 1; i < letters.length; i++) {
    assert.notEqual(letters[i].color, letters[i - 1].color);
    assert.notEqual(letters[i].font, letters[i - 1].font);
  }
});
