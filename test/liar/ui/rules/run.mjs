// 규칙 창 자기 시험 (실제 클릭). 사용: node test/liar/ui/rules/run.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  실패:', m); } };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'test/liar/ui/rules/harness.html?nogl=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.h && window.h.mod);

const set = (p, n = 8, over = {}) => page.evaluate(([a, b, c]) => window.h.set(a, b, c), [p, n, over]);
const L = (n) => `[data-lg=${n}]`;
const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
async function centerHit(sel, label) {
  const good = await page.evaluate((s) => {
    const b = document.querySelector(s); const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!t && (t === b || b.contains(t));
  }, sel);
  ok(good, `${label}: 중심점이 눌리지 않음`);
}
const domOf = () => page.evaluate(() => document.querySelector('.lg-rule-root').innerHTML);

for (const n of [3, 8]) {
  console.log(`[${n}명]`);
  for (const ph of ['lobby', 'reveal', 'speak', 'discuss', 'defense', 'judge', 'revote', 'guess', 'result']) {
    await set(ph, n);
    ok(await vis(L('rule-open')), `${ph}: 버튼 보임`);
    await centerHit(L('rule-open'), `${ph} 버튼`);
  }
  await set('unmask', n);
  ok(!(await vis(L('rule-open'))), 'unmask 에서 버튼 숨김');
  await set(null);
  ok(!(await vis(L('rule-open'))), 'null 에서 숨김');

  await set('speak', n);
  ok(!(await vis(L('rule-panel'))), '처음엔 닫힘');
  await page.click(L('rule-open'));
  ok(await vis(L('rule-panel')), '버튼으로 열림');
  // 화면 안, 12px 이상
  const info = await page.evaluate(() => {
    const r = document.querySelector('[data-lg=rule-panel]').getBoundingClientRect();
    const sizes = [...document.querySelectorAll('.lg-rule-panel *')].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, min: Math.min(...sizes) };
  });
  ok(info.l >= 0 && info.t >= 0 && info.r <= 844 && info.b <= 390, `창이 화면 안 ${JSON.stringify(info)}`);
  ok(info.min >= 12, `글자 12px 이상 (${info.min})`);
  await centerHit(L('rule-close'), '닫기');
  await page.click(L('rule-close'));
  ok(!(await vis(L('rule-panel'))), '× 로 닫힘');
  await page.click(L('rule-open'));
  await page.mouse.click(10, 380);
  ok(!(await vis(L('rule-panel'))), '바깥 누르기로 닫힘');
  await page.click(L('rule-open'));
  await page.click(L('rule-open'));
  ok(!(await vis(L('rule-panel'))), '버튼 다시 눌러 닫힘');
  await page.click(L('rule-open'));
  await set('unmask', n);
  await set('result', n);
  ok(!(await vis(L('rule-panel'))), 'unmask 를 거치면 열려 있던 창이 닫힘');
}

console.log('[이 방 표시]');
await set('lobby', 8, { settings: { liarMode: 'word' } });
await page.click(L('rule-open'));
let here = await page.evaluate(() => [...document.querySelectorAll('[data-lg=rule-mode]')].map((e) => e.dataset.v));
ok(JSON.stringify(here) === '["word"]', `word 방: ${here}`);
await set('lobby', 8, { settings: { liarMode: 'notice' } });
here = await page.evaluate(() => [...document.querySelectorAll('[data-lg=rule-mode]')].map((e) => e.dataset.v));
ok(JSON.stringify(here) === '["notice"]', `notice 방: ${here}`);
ok(await page.evaluate(() => document.querySelector('.lg-rule-mode[aria-current=true]').dataset.v) === 'notice', 'aria-current');
ok((await page.evaluate(() => document.querySelector('.lg-rule-panel').textContent)).includes('살려 준 투표는 점수에 들어가지 않아요.'), '점수표 덧붙임 글');

console.log('[역할 무관]');
await set('speak', 8, { settings: { liarMode: 'notice' }, my: { word: '도서관', role: 'citizen' } });
const a = await domOf();
await set('speak', 8, { settings: { liarMode: 'notice' }, my: { word: null, role: 'liar' }, you: 'u3' });
ok(a === await domOf(), '시민 상태와 라이어 상태에서 DOM 이 같음');

ok(errors.length === 0, '콘솔 오류: ' + errors.join(' | '));
await browser.close();
await server.close();
console.log(fails ? `실패 ${fails}건` : '통과');
process.exit(fails ? 1 : 0);
