// 전체 랭킹 창 자기 시험 (실제 클릭). 사용: node test/liar/ui/rank/run.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  실패:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (받은 값 ${JSON.stringify(a)}, 기대 ${JSON.stringify(b)})`);

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
let code = 1;
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + 'test/liar/ui/rank/harness.html?nogl=1');
  await page.waitForFunction(() => window.h && window.h.mod);

  const set = (p) => page.evaluate((x) => window.h.set(x), p);
  const ev = (e) => page.evaluate((x) => window.h.mod.event(x), e);
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
  const rows = () => page.evaluate(() => document.querySelectorAll('[data-lg=rank-row]').length);
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
  const sent = () => page.evaluate(() => window.h.sent.slice());
  async function hits(sel, label) {
    const good = await page.evaluate((s) => { const b = document.querySelector(s); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === b || b.contains(t)); }, sel);
    ok(good, `${label}: 중심점이 눌리지 않음`);
  }
  const top = (n) => Array.from({ length: n }, (_, i) => ({ name: '사람' + i, score: 100 - i, games: i + 1 }));

  for (const p of ['lobby', 'result']) {
    await set(p);
    ok(await vis('[data-lg=rank-open]'), `${p}: 버튼 보임`);
  }
  for (const p of ['speak', 'discuss', 'guess', null]) {
    await set(p);
    ok(!(await vis('[data-lg=rank-open]')), `${p}: 버튼 안 보임`);
  }

  await set('lobby');
  await hits('[data-lg=rank-open]', '랭킹 버튼');
  await page.click('[data-lg=rank-open]');
  eq(await sent(), [{ t: 'lg', a: 'rank' }], '랭킹 요청');
  ok(await vis('[data-lg=rank-panel]'), '창 열림');
  ok((await text('[data-lg=rank-panel]')).includes('불러오는 중'), '불러오는 중');

  await ev({ k: 'lgRank', top: top(20), mine: { rank: 5, score: 96 } });
  eq(await rows(), 20, '20줄');
  eq(await text('[data-lg=rank-mine]'), '내 순위 5위 · 96점', '내 순위');
  await hits('[data-lg=rank-close]', '닫기');

  await ev({ k: 'lgRank', top: [], mine: { rank: null, score: 0 } });
  eq(await rows(), 0, '0줄');
  ok((await text('[data-lg=rank-panel]')).includes('아직 기록이 없어요'), '빈 목록 문구');
  eq(await text('[data-lg=rank-mine]'), '아직 순위 없음', '내 순위 null');

  await ev({ k: 'lgRank', top: [{ name: '<b>x</b>', score: 3, games: 1 }], mine: { rank: 1, score: 3 } });
  eq(await page.evaluate(() => document.querySelectorAll('.lg-rk-row b').length), 0, '이름은 글자로만');

  await page.click('[data-lg=rank-close]');
  ok(!(await vis('[data-lg=rank-panel]')), '닫힘');

  await page.click('[data-lg=rank-open]');
  ok(await vis('[data-lg=rank-panel]'), '다시 열림');
  await set('speak');
  ok(!(await vis('[data-lg=rank-panel]')), '단계가 바뀌면 닫힘');

  eq(errors, [], '콘솔 오류');
  console.log(fails ? `rank: ${fails}건 실패` : 'rank: 통과');
  code = fails ? 1 : 0;
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
