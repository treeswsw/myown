// SPEC 22-17: every title fx in title.js has a .tfx-<name> rule in titlefx.css and is known to titlefx.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const items = rd('../../shared/coin/items/title.js');
const css = rd('../../client/src/coin/titlefx.css');
const js = rd('../../client/src/coin/titlefx.js');
const names = [...new Set([...items.matchAll(/fx:\s*"([a-z]+)"/g)].map((m) => m[1]))];

test('title.js has fx names', () => assert.ok(names.length >= 20));
for (const n of names) {
  test('fx ' + n, () => {
    assert.ok(new RegExp('\\.tfx-' + n + '\\b').test(css), 'css rule .tfx-' + n);
    assert.ok(js.includes("'" + n + "'"), 'known in titlefx.js');
  });
}
test('css uses only .tfx- classes and no zoom', () => {
  assert.ok(!/(^|[^-\w])zoom\s*:/.test(css));
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^}]*\}/g, '{}');
  const classes = [...body.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]);
  for (const c of classes) assert.ok(c.startsWith('tfx'), c);
});
test('reduced motion handled', () => assert.ok(css.includes('prefers-reduced-motion')));
