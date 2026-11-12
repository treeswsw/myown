// 머리 위 이모티콘 자기 시험 (실제 화면). 사용: node test/liar/ui/emote/run.mjs
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/emote/harness.html?nogl=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.h && window.h.mod);

const ev = (e) => page.evaluate((x) => window.h.mod.event(x), e);
const frame = (dt) => page.evaluate((d) => window.h.mod.frame(d), dt);
const pos = (m) => page.evaluate((p) => { window.h.pos = p; }, m);
const count = () => page.evaluate(() => [...document.querySelectorAll('[data-lg=emote]')].filter((e) => !e.hidden).length);
const total = () => page.evaluate(() => document.querySelectorAll('[data-lg=emote]').length);
const rect = (id) => page.evaluate((i) => { const e = document.querySelector(`[data-lg=emote][data-id=${i}]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; }, id);

await page.evaluate(() => window.h.set('speak', 8));
await pos({ u1: { x: 200, y: 200 } });
await ev({ k: 'emote', id: 'u1', e: 2 });
eq(await count(), 1, 'emote 뒤 요소 1개');
const r1 = await rect('u1');
ok(r1 && Math.abs(r1.x - 200) < 2 && Math.abs(r1.y - 200) < 2, `좌표에 뜸 ${JSON.stringify(r1)}`);
eq(await page.evaluate(() => document.querySelector('[data-lg=emote]').textContent), '😮', '그림');
await frame(1.5);
eq(await count(), 1, '1.5초에는 아직 있음');
await pos({ u1: { x: 400, y: 250 } });
await frame(0.1);
const r2 = await rect('u1');
ok(r2 && Math.abs(r2.x - 400) < 2 && Math.abs(r2.y - 250) < 2, `좌표를 따라감 ${JSON.stringify(r2)}`);
await pos({});
await frame(0.1);
eq(await count(), 0, 'anchor null 이면 숨김');
await pos({ u1: { x: 400, y: 250 } });
await frame(0.1);
eq(await count(), 1, '좌표가 돌아오면 다시 보임');
await frame(0.5);
eq(await total(), 0, '2초 뒤 사라짐');

await pos({});
await ev({ k: 'emote', id: 'u1', e: 0 });
eq(await total(), 0, 'anchor 가 null 이면 안 뜸');

const all = {};
for (let i = 0; i < 8; i++) all['u' + i] = { x: 60 + i * 90, y: 120 + (i % 2) * 60 };
await pos(all);
for (let i = 0; i < 8; i++) await ev({ k: 'emote', id: 'u' + i, e: i % 6 });
eq(await count(), 8, '8명 동시 8개');
await ev({ k: 'emote', id: 'u3', e: 5 });
await ev({ k: 'emote', id: 'u3', e: 4 });
eq(await count(), 8, '같은 사람 두 번이어도 한 사람 1개');
eq(await page.evaluate(() => document.querySelectorAll('[data-lg=emote][data-id=u3]').length), 1, 'u3 1개');
eq(await page.evaluate(() => document.querySelector('[data-lg=emote][data-id=u3]').textContent), '😭', '나중 것으로 바뀜');
await page.evaluate(() => window.h.mod.update(null));
eq(await total(), 0, 'update(null) 뒤 0개');

await ev({ k: 'emote', id: 'u1', e: 9 });
await ev({ k: 'emote', id: 'u1', e: '1' });
await ev({ k: 'emote', id: 'u1', e: -1 });
await ev({ k: 'emote', id: 'u1', e: 1.5 });
await ev({ k: 'pemote', id: 'u1', e: 1 });
await ev({ k: 'say', id: 'u1' });
eq(await total(), 0, '잘못된 e·다른 알림 무시');

// 떠 있는 동안 아래 버튼이 눌림
await pos({ u1: { x: 360, y: 200 } });
await ev({ k: 'emote', id: 'u1', e: 1 });
eq(await count(), 1, '버튼 위에 뜸');
await page.mouse.click(360, 180);
eq(await page.evaluate(() => window.h.clicks), 1, '떠 있어도 아래 버튼 눌림');
const hit = await page.evaluate(() => { const b = document.getElementById('under').getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return t && t.id; });
eq(hit, 'under', '버튼 중심점이 여전히 눌림');
await page.evaluate(() => window.h.mod.dispose());
eq(await total(), 0, 'dispose 뒤 0개');

eq(errors, [], '콘솔 오류');
await browser.close();
await server.close();
console.log(fails ? `실패 ${fails}건` : '통과');
process.exit(fails ? 1 : 0);
