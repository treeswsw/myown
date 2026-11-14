// shared/solo 는 순수해야 한다 (docs/solo/PLAN.md 1-3 결정성 규칙): 서버·화면·모든 브라우저가 같은 결과를 내려면
// 난수·시간·삼각함수 같은 기기마다 다를 수 있는 것을 쓰지 않는다. 주석은 뺀 뒤 금지 글자를 찾는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../shared/solo/', import.meta.url);
const BANNED = [
  /Math\.(random|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|pow|exp|expm1|log|log2|log10|log1p|hypot|cbrt)\b/,
  /\bDate\b/, /\bperformance\b/, /\bsetTimeout\b|\bsetInterval\b/, /\bcrypto\b/, /\bdocument\b|\bwindow\b|\brequire\s*\(/,
  /\*\*/, // 거듭제곱 연산자도 pow 와 같다
  /\bimport\s[^;]*from\s+['"](?!\.\/)/, // 같은 폴더 밖 가져오기 금지(node:·패키지 포함)
];

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

test('shared/solo/*.js 에 금지된 글자가 없다', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.includes('run.js') && files.includes('rng.js'));
  for (const f of files) {
    const code = strip(readFileSync(new URL(f, DIR), 'utf8'));
    for (const re of BANNED) assert.ok(!re.test(code), `${f}: ${re} 가 들어 있다`);
  }
});

test('금지 검사 자체가 동작한다', () => {
  assert.ok(BANNED[0].test('x = Math.sin(1)'));
  assert.ok(!BANNED[0].test(strip('// Math.sin 금지\nx = Math.sqrt(2)')));
  assert.ok(BANNED[6].test('a ** 2'));
  assert.ok(BANNED[7].test("import x from 'node:fs'"));
  assert.ok(!BANNED[7].test("import { a } from './rng.js'"));
});
