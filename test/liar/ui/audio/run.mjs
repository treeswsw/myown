// 효과음 자기 시험 (실제 클릭, 오류 0 확인). 소리가 어떻게 들리는지는 미확인(실기기). 사용: node test/liar/ui/audio/run.mjs
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/audio/harness.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.h && window.h.a);

ok(await page.evaluate(() => window.h.SOUND_NAMES.length) === 15, '이름 15개');
ok(await page.evaluate(() => document.querySelectorAll('.snd').length) === 15, '이름별 버튼 15개');

// 잠금 상태(unlock 전)에서 play: 조용히
await page.evaluate(() => window.h.a.play('phase'));
// 실제 클릭으로 unlock, 15개 차례로
await page.click('#unlock');
for (const n of await page.evaluate(() => window.h.SOUND_NAMES)) await page.click(`.snd[data-n=${n}]`);
// 모르는 이름
await page.evaluate(() => { const a = window.h.a; a.play('없는이름'); a.play(''); a.play(null); a.play('toString'); });
// 끔 상태
await page.click('#mute');
ok(await page.evaluate(() => window.h.a.muted) === true, '끔 상태');
await page.evaluate(() => { for (const n of window.h.SOUND_NAMES) window.h.a.play(n); });
await page.click('#mute');
ok(await page.evaluate(() => window.h.a.muted) === false, '끔 해제');
// 100번 연달아
await page.evaluate(() => { for (let i = 0; i < 100; i++) window.h.a.play(window.h.SOUND_NAMES[i % 15]); });
// dispose 뒤
await page.click('#dispose');
await page.evaluate(() => { for (const n of window.h.SOUND_NAMES) window.h.a.play(n); window.h.a.unlock(); });

ok(errors.length === 0, '콘솔 오류: ' + errors.join(' | '));
await browser.close();
await server.close();
console.log(fails ? `audio: ${fails}건 실패` : 'audio: 통과 (소리 자체는 미확인, 실기기 확인 필요)');
process.exit(fails ? 1 : 0);
