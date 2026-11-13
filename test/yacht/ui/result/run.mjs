// 결과 창 시험 페이지 실행. node test/yacht/ui/result/run.mjs   (캡처: SHOTS=폴더 node ...)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('실패:', msg); } else console.log('통과:', msg); };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + 'test/yacht/ui/result/harness.html');
  await page.waitForFunction(() => window.__ready === true);

  const apply = (name, extra) => page.evaluate(([n, e]) => { window.h.apply({ ...window.h.states[n], ...(e || {}) }); }, [name, extra]);
  const yt = (n) => page.locator(`[data-yt="${n}"]`);
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
  const fits = () => page.evaluate(() => {
    const w = document.querySelector('.yt-rs-win').getBoundingClientRect();
    return w.top >= 0 && w.left >= 0 && w.bottom <= innerHeight + 0.5 && w.right <= innerWidth + 0.5;
  });

  // 결과가 아니면 숨김
  await apply('myTurnRolled');
  ok(!(await yt('result').isVisible()) && !(await yt('result-toggle').isVisible()), '결과 아닌 상태에서는 창·토글 숨김');
  await page.evaluate(() => window.h.apply(null));
  ok(!(await yt('result').isVisible()), 'null 상태에서 숨김');

  // 2명 결과(내가 2등)
  await apply('result');
  ok(await yt('result').isVisible(), '결과 창 보임');
  const text = (await yt('result').textContent()) || '';
  ok(text.includes('지우 우승') && text.includes('130') && text.includes('105'), `1등 이름·합계 표시 (${text})`);
  ok(text.includes('요트다이스 5판 · 우승 2회 · 최고 241점'), '내 전적 한 줄');
  ok((await page.locator('.yt-rs-first').count()) === 1, '1등 줄 하나');
  ok(await fits(), '844x390 에서 창이 화면 안');
  await shot('result-844x390');

  // 접기·다시 열기
  await yt('result-toggle').click();
  ok(!(await yt('result').isVisible()) && await yt('result-toggle').isVisible(), '접으면 창 숨김, 토글 남음');
  ok(((await yt('result-toggle').textContent()) || '').includes('결과'), '접힌 토글 글자 "결과 보기"');
  // 같은 판 상태가 다시 와도 접힌 채 유지(자동으로 다시 열리지 않음)
  await apply('result');
  ok(!(await yt('result').isVisible()), '같은 판의 상태가 다시 와도 접힌 채');
  await yt('result-toggle').click();
  ok(await yt('result').isVisible(), '다시 열기');
  // 새 판 결과(gameNo 다름)는 열린 채로 시작
  await yt('result-toggle').click();
  await apply('result4');
  ok(await yt('result').isVisible(), '새 판 결과는 열려서 시작');

  // 공동 우승 4명
  const t4 = (await yt('result').textContent()) || '';
  ok(t4.includes('공동 우승'), '1등이 둘이면 공동 우승');
  ok((await page.locator('.yt-rs-first').count()) === 2, '공동 1등 줄 둘');
  ok((await page.locator('.yt-rs-row').count()) === 4, '4명 순위');
  ok(await fits(), '4명 결과도 844x390 에서 창이 화면 안');
  await shot('result4-844x390');

  // 내가 우승
  await apply('result', { you: 'jiwoo' });
  ok(((await yt('result').textContent()) || '').includes('승리!'), '내가 1등이면 "승리!"');

  // 혼자 남음(alone), 순위 없음
  await apply('result', { result: { reason: 'alone', winners: [], ranks: [] } });
  ok(((await yt('result').textContent()) || '').includes('게임 종료'), '순위 0명도 오류 없이');

  // 이름은 글자로만
  await apply('result', { result: { reason: 'done', winners: ['x'], ranks: [{ id: 'x', name: '<b>왕</b>', total: 9, rank: 1 }] } });
  ok((await page.locator('.yt-rs b').count()) === 1 && (await page.locator('.yt-rs-row > span').first().textContent()) === '<b>왕</b>', '이름의 <b> 가 글자로 보임');

  // 전적 없음
  await page.evaluate(() => { window.h.me = {}; });
  await apply('result');
  ok(((await yt('result').textContent()) || '').includes('요트다이스 0판 · 우승 0회 · 최고 0점'), '전적 없으면 0');

  // 1280x720
  await page.setViewportSize({ width: 1280, height: 720 });
  await apply('result4');
  ok(await fits(), '1280x720 창이 화면 안');
  await shot('result4-1280x720');

  ok(errors.length === 0, `오류 없음 (${errors.join(' / ')})`);
} finally {
  await browser.close();
  await server.close();
}
if (failed) { console.error(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모두 통과');
