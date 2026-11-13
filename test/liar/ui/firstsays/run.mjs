// 첫 발언 모음 자기 시험 (실제 클릭). 사용: node test/liar/ui/firstsays/run.mjs
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/firstsays/harness.html?nogl=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.h && window.h.mod);

const set = (name, n = 8, over) => page.evaluate(([a, b, c]) => window.h.set(a, b, c), [name, n, over || {}]);
const sent = () => page.evaluate(() => window.h.sent.slice());
const clear = () => page.evaluate(() => { window.h.sent.length = 0; });
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
const L = (n) => `[data-lg=${n}]`;
const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-lg=fs-row]')].map((r) => r.dataset.id));
const rowText = (id) => text(`[data-lg=fs-row][data-id=${id}]`);
async function centerHits(sel, label) {
  const bad = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((b) => b.getClientRects().length).map((b) => {
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t && (t === b || b.contains(t)) ? null : (b.dataset.lg || b.className);
  }).filter(Boolean), sel);
  ok(bad.length === 0, `${label}: 중심점이 눌리지 않는 버튼 ${bad.join(',')}`);
}

// ---- 8명
console.log('[8명]');
await set('lobby');
ok(!(await vis(L('fs-open'))), '방 대기에서는 버튼 없음');
await set('reveal');
ok(await vis(L('fs-open')), 'reveal 에서 버튼 보임');
await set('speak');
ok(await vis(L('fs-open')), 'speak 버튼 보임');
// 글이 있는 칸: u2, u6, u4 = 3 / 8
ok((await text(L('fs-open'))).includes('3/8'), `버튼 숫자 3/8 (${await text(L('fs-open'))})`);
await centerHits(L('fs-open'), 'speak 버튼');

// 열기·닫기 3가지
ok(!(await vis(L('fs-panel'))), '처음엔 닫힘');
await page.click(L('fs-open'));
ok(await vis(L('fs-panel')), '버튼으로 열림');
eq(await page.getAttribute(L('fs-open'), 'aria-expanded'), 'true', 'aria-expanded true');
await centerHits(`${L('fs-close')}`, '닫기 버튼');
await page.click(L('fs-close'));
ok(!(await vis(L('fs-panel'))), '× 로 닫힘');
await page.click(L('fs-open'));
await page.mouse.click(40, 330);
ok(!(await vis(L('fs-panel'))), '바깥 누르기로 닫힘');
await page.click(L('fs-open'));
await page.keyboard.press('Escape');
ok(!(await vis(L('fs-panel'))), 'Esc 로 닫힘');
await page.click(L('fs-open'));
await page.click(`${L('fs-panel')} .lg-fs-head h2`);
ok(await vis(L('fs-panel')), '창 안쪽을 눌러도 안 닫힘');
await page.click(L('fs-open'));
ok(!(await vis(L('fs-panel'))), '버튼 다시 눌러 닫힘');

// 줄 순서와 글자
await page.click(L('fs-open'));
eq(await rows(), ['u2', 'u6', 'u4', 'u5', 'u1', 'u0', 'u3', 'u7'], '줄 순서 = order');
ok((await rowText('u2')).includes('조용한 곳'), 'u2 글');
ok((await rowText('u4')).includes('늦게 씀'), 'late → 늦게 씀');
ok(!(await rowText('u6')).includes('늦게 씀'), '일반 글에는 늦게 씀 없음');
ok((await rowText('u5')).includes('아직'), '지금 차례(text null, 쓸 수 있음) → 아직');
ok((await rowText('u1')).includes('—') && !(await rowText('u1')).includes('아직'), '칸 없음 → —');
ok((await rowText('u7')).includes('—'), '끝 사람 칸 없음 → —');
// 이름 색
const color = await page.evaluate(() => getComputedStyle(document.querySelector('[data-lg=fs-row][data-id=u2] .lg-fs-name')).color);
eq(color, 'rgb(233, 215, 88)', '이름은 그 사람 색 (지호 #e9d758)');

// 쓸 수 없는 때의 text null → (발언 없음)
await set('defense');
ok(await vis(L('fs-open')), 'defense 버튼 보임');
ok(await vis(L('fs-panel')), '열린 창은 단계가 바뀌어도 유지');
ok((await rowText('u0')).includes('(발언 없음)'), 'defense 에서 text null → (발언 없음)');
ok(!(await vis(L('late-input'))), 'defense 에서는 늦은 칸 없음');
await set('discuss2-missed');
ok((await rowText('u0')).includes('(발언 없음)'), 'accuseNo 2 에서 text null → (발언 없음)');
await set('discuss-missed');
ok((await rowText('u0')).includes('아직'), 'accuseNo 1 discuss 에서는 아직');
await set('result');
ok(await vis(L('fs-open')), 'result 에서도 버튼 보임');
// unmask: 숨기고 창을 닫는다
await set('unmask');
ok(!(await vis(L('fs-open'))), 'unmask 에서 버튼 숨김');
ok(!(await vis(L('fs-panel'))), 'unmask 에서 창 닫힘');
await set('judge');
ok(!(await vis(L('fs-panel'))), 'unmask 뒤 다시 열려 있지 않음');
await set(null);
ok(!(await vis(L('fs-open'))) && !(await vis(L('fs-panel'))), 'update(null) 숨김');
await set('result');
await set('lobby');
ok(!(await vis(L('fs-open'))), 'lobby 숨김');

// ---- 늦은 첫 설명
console.log('[늦은 첫 설명]');
await set('speak-me');
ok(!(await vis(L('late-input'))), '내 차례에는 칸 없음');
await set('speak');
ok(!(await vis(L('late-input'))), '차례 전에는 칸 없음');
await set('speak-missed');
ok(await vis(L('late-input')) && await vis(L('late-send')), '놓친 사람에게 칸 보임');
await centerHits(L('late-send'), '추가 버튼');
await clear();
await page.click(L('late-send'));
eq(await sent(), [], '빈 칸은 안 보냄');
await page.fill(L('late-input'), '   ');
await page.click(L('late-send'));
eq(await sent(), [], '공백만은 안 보냄');
await page.evaluate(() => { document.querySelector('[data-lg=late-input]').value = 'ㄱ'.repeat(81); });
await page.click(L('late-send'));
eq(await sent(), [], '81자는 안 보냄');
await page.fill(L('late-input'), '가'.repeat(80));
await page.click(L('late-send'));
eq((await sent()).length, 1, '80자는 보냄');
eq((await sent())[0], { t: 'lg', a: 'say', text: '가'.repeat(80) }, '보낸 모양');
// 연속 두 번
await page.evaluate(() => { const b = document.querySelector('[data-lg=late-send]'); b.click(); b.click(); });
eq((await sent()).length, 1, '연속 두 번 눌러도 한 번');
// 서버 답(칸이 채워짐) → 칸 사라짐
await set('speak-missed', 8, { firstSays: (await page.evaluate(() => window.h.fixture('speak-missed').firstSays.map((f) => (f.id === 'u0' ? { ...f, text: '썼다', late: true } : f)))) });
ok(!(await vis(L('late-input'))), '서버 답 뒤 칸 사라짐');
await set('speak-missed');
ok(await vis(L('late-input')), '다시 거짓→참 이면 칸 다시 생김');
eq(await page.inputValue(L('late-input')), '', '쓰던 글은 버려짐');
ok(!(await page.evaluate(() => document.querySelector('[data-lg=late-send]').disabled)), '새로 생긴 칸은 보낼 수 있음');
// Enter
await clear();
await page.fill(L('late-input'), '엔터로 보냄');
await page.press(L('late-input'), 'Enter');
eq(await sent(), [{ t: 'lg', a: 'say', text: '엔터로 보냄' }], 'Enter 로 보냄');
// 조건이 거짓이 되면 쓰던 글을 버린다
await set('speak-missed');
await page.fill(L('late-input'), '쓰는 중');
await set('defense');
ok(!(await vis(L('late-input'))), 'canLate 거짓이면 칸 사라짐');
await set('speak-missed');
eq(await page.inputValue(L('late-input')), '', '다시 와도 쓰던 글 없음');
// discuss/revote(첫 지목 전)
await set('discuss-missed');
ok(await vis(L('late-input')), 'accuseNo 1 discuss 에서 칸');
await set('revote-missed');
ok(await vis(L('late-input')), 'accuseNo 1 revote 에서 칸');
await set('discuss2-missed');
ok(!(await vis(L('late-input'))), 'accuseNo 2 에서는 칸 없음');
// 늦은 칸이 떠 있는 동안 '늦게 쓴 글' 반영
await set('speak-missed', 8, { firstSays: (await page.evaluate(() => window.h.fixture('speak-missed').firstSays.map((f) => (f.id === 'u0' ? { ...f, text: '썼다', late: true } : f)))) });
await page.click(L('fs-open'));
ok((await rowText('u0')).includes('늦게 씀') && (await rowText('u0')).includes('썼다'), '내 줄에 늦게 씀 + 글');
await page.click(L('fs-close'));
// 멱등
await set('speak');
await set('speak');
eq((await rows()).length, 8, '같은 상태 두 번 불러도 줄 수 같음');
ok((await text(L('fs-open'))).includes('3/8'), '같은 상태 두 번 불러도 같음');

// ---- 글자 이스케이프
console.log('[이스케이프]');
await set('speak', 8, { firstSays: [{ id: 'u2', text: '<b>굵게</b>', late: false }], players: await page.evaluate(() => window.h.fixture('speak').players.map((p) => (p.id === 'u2' ? { ...p, name: '<b>지호</b>' } : p))) });
await page.click(L('fs-open'));
const t2 = await rowText('u2');
ok(t2.includes('<b>굵게</b>') && t2.includes('<b>지호</b>'), `<b> 그대로 보임 (${t2})`);
eq(await page.evaluate(() => document.querySelectorAll('.lg-fs-list b').length), 0, '실제 b 요소 없음');
await page.click(L('fs-close'));

// ---- 3명 판
console.log('[3명]');
await set('speak', 3);
ok((await text(L('fs-open'))).includes('2/3'), `3명 버튼 숫자 (${await text(L('fs-open'))})`);
await page.click(L('fs-open'));
eq(await rows(), ['u2', 'u0', 'u1'], '3명 줄 순서');
await centerHits(`${L('fs-open')}, ${L('fs-close')}`, '3명 버튼');
await page.click(L('fs-close'));
await set('speak-missed', 3);
ok(await vis(L('late-input')), '3명 놓친 사람에게 칸');
await centerHits(L('late-send'), '3명 추가 버튼');

ok(errors.length === 0, '콘솔 오류: ' + errors.join(' | '));
await browser.close();
await server.close();
console.log(fails ? `실패 ${fails}건` : '통과');
process.exit(fails ? 1 : 0);
