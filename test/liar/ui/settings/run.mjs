// 방 설정 패널 자기 시험 (실제 클릭). 사용: node test/liar/ui/settings/run.mjs
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/settings/harness.html?nogl=1';
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
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const pressed = (sel) => page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-pressed'), sel);
const click = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.locator(sel).first().click(); };
// 보이는 버튼마다 스크롤해서 중심점이 그 버튼(또는 자식)에 닿는지
async function centerHits(sel, label) {
  const n = await count(sel);
  const bad = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(([s, k]) => {
      const b = document.querySelectorAll(s)[k];
      b.scrollIntoView({ block: 'center' });
      const q = b.getBoundingClientRect();
      const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return t && (t === b || b.contains(t)) ? null : (b.dataset.name || b.dataset.v || b.dataset.id || b.className);
    }, [sel, i]);
    if (r) bad.push(r);
  }
  ok(bad.length === 0, `${label}: 중심점이 눌리지 않는 버튼 ${bad.join(',')}`);
}

for (const n of [8, 3]) {
  const L = `[${n}명]`;
  console.log(L);
  await set('random', n);
  await clear();
  await click('[data-lg=st-liarMode][data-v=notice]');
  await click('[data-lg=st-wordSet][data-v=star]');
  await click('[data-lg=st-topicMode][data-v=host]');
  await click('[data-lg=st-time][data-key=speak][data-v="45"]');
  await click('[data-lg=st-goal][data-v="15"]');
  eq(await sent(), [
    { t: 'lg', a: 'settings', liarMode: 'notice' },
    { t: 'lg', a: 'settings', wordSet: 'star' },
    { t: 'lg', a: 'settings', topicMode: 'host' },
    { t: 'lg', a: 'settings', times: { speak: 45 } },
    { t: 'lg', a: 'settings', goal: 15 },
  ], `${L} 눌린 칸 하나만 한 번씩`);
  eq(await pressed('[data-lg=st-liarMode][data-v=word]'), 'true', `${L} 눌러도 화면은 그대로`);
  eq(await pressed('[data-lg=st-liarMode][data-v=notice]'), 'false', `${L} 서버 답 전에 안 바뀜`);
  // 서버 답 = 다음 update
  await set('random', n, { settings: { liarMode: 'notice', goal: 15, times: { speak: 45, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 } } });
  eq(await pressed('[data-lg=st-liarMode][data-v=notice]'), 'true', `${L} set 하면 바뀜`);
  eq(await pressed('[data-lg=st-goal][data-v="15"]'), 'true', `${L} 목표 점수 반영`);
  eq(await pressed('[data-lg=st-time][data-key=speak][data-v="45"]'), 'true', `${L} 시간 반영`);
  eq(await count('[data-lg=st-time][data-key=speak]'), 4, `${L} 첫 설명 선택지 4개`);

  // 주제 체크
  await set('random', n);
  eq(await count('[data-lg=st-topic]'), 11, `${L} 내 버전 주제 11개`);
  eq(await count('[data-lg=st-nextTopic]'), 0, `${L} random 에는 nextTopic 없음`);
  await clear();
  await click('[data-lg=st-topic][data-name="동물"]');
  const s1 = await sent();
  eq(s1.length, 1, `${L} topic 한 번`);
  eq(s1[0].topics.length, 11, `${L} topics 전체가 감`);
  eq(s1[0].topics.find((t) => t.name === '동물'), { name: '동물', on: false }, `${L} 동물만 꺼짐`);
  eq(s1[0].topics.filter((t) => t.on).length, 10, `${L} 나머지는 켜짐`);
  // 마지막 켜진 하나
  const one = (await page.evaluate(() => window.h.fixture('random', 8).settings.topics)).map((t) => ({ ...t, on: t.name === '음식' }));
  await set('random', n, { settings: { topics: one } });
  await clear();
  await click('[data-lg=st-topic][data-name="음식"]');
  eq(await sent(), [], `${L} 마지막 켜진 주제는 안 보냄`);
  await click('[data-lg=st-topic][data-name="인물"]');
  eq((await sent()).length, 1, `${L} 다른 주제 켜기는 보냄`);

  // host 방식
  await set('host', n);
  eq(await count('[data-lg=st-topic]'), 0, `${L} host 에는 주제 체크 없음`);
  await clear();
  await click('[data-lg=st-nextTopic][data-name="음식"]');
  eq(await sent(), [{ t: 'lg', a: 'settings', nextTopic: '음식' }], `${L} nextTopic`);
  await set('host', n, { settings: { nextTopic: '음식' } });
  eq(await pressed('[data-lg=st-nextTopic][data-name="음식"]'), 'true', `${L} 고른 주제 표시`);

  // 내보내기
  await set('random', n);
  eq(await count('[data-lg=st-kick]'), n - 1, `${L} 남의 줄마다 내보내기`);
  eq(await count('[data-lg=st-kick][data-id=u0]'), 0, `${L} 내 줄에는 없음`);
  await clear();
  await click('[data-lg=st-kick][data-id=u2]');
  eq(await sent(), [{ t: 'lg', a: 'kick', id: 'u2' }], `${L} kick`);
  await set('result', n);
  eq(await count('[data-lg=st-kick]'), 0, `${L} result 에서는 내보내기 없음`);
  eq(await page.evaluate(() => document.querySelectorAll('.lg-st-opt:disabled').length), 0, `${L} result 에서 방장은 고를 수 있음`);
  await set('speak', n);
  eq(await count('[data-lg=st-kick]'), 0, `${L} 판 중에는 내보내기 없음`);
  eq(await page.evaluate(() => document.querySelectorAll('.lg-st-opt:not(:disabled)').length), 0, `${L} 판 중에는 방장도 disabled`);

  // 방장 아님
  await set('random', n, { you: 'u1' });
  eq(await page.evaluate(() => document.querySelectorAll('.lg-st-opt:not(:disabled)').length), 0, `${L} 방장 아니면 전부 disabled`);
  ok((await count('.lg-st-opt')) > 20, `${L} 값은 보임`);
  eq(await pressed('[data-lg=st-liarMode][data-v=word]'), 'true', `${L} 읽기 전용에도 값 표시`);
  eq(await count('[data-lg=st-kick]'), 0, `${L} 방장 아니면 kick 없음`);
  await clear();
  for (const sel of ['[data-lg=st-liarMode][data-v=notice]', '[data-lg=st-topic][data-name="동물"]', '[data-lg=st-goal][data-v="10"]']) {
    await page.locator(sel).first().click({ force: true });
  }
  eq(await sent(), [], `${L} 방장 아니면 눌러도 안 보냄`);

  // 버튼 눌림
  await set('random', n);
  await centerHits('.lg-st-opt, .lg-st-kick', `${L} random`);
  await set('host', n);
  await centerHits('.lg-st-opt, .lg-st-kick', `${L} host`);
}

// 스타 묶음, 이름 그대로, 끊김
console.log('[그 밖]');
await set('star', 8);
eq(await count('[data-lg=st-topic]'), 10, '스타 묶음 주제 10개');
const base = await page.evaluate(() => window.h.fixture('random', 8));
const players = base.players.map((p) => (p.id === 'u3' ? { ...p, name: '<b>x</b>', connected: false } : p));
await set('random', 8, { players });
const row = await page.evaluate(() => document.querySelector('.lg-st-player[data-id=u3]').textContent);
ok(row.includes('<b>x</b>') && row.includes('끊김'), '이름 글자 그대로 + 끊김: ' + row);
eq(await page.evaluate(() => document.querySelector('.lg-st-player[data-id=u3] b')), null, '<b> 요소가 생기지 않음');
ok((await page.evaluate(() => document.querySelector('.lg-st-player[data-id=u0]').textContent)).includes('방장'), '방장 표시');
ok((await page.evaluate(() => document.querySelector('.lg-st-player[data-id=u1] .lg-st-name').style.color)) !== '', '이름은 그 사람 색');
// 멱등
const html1 = await page.evaluate(() => window.h.mod.el.outerHTML);
await set('random', 8, { players });
eq(await page.evaluate(() => window.h.mod.el.outerHTML), html1, '같은 상태 두 번 불러도 같음');
await set('random', 8, { players: [] });
await page.evaluate(() => window.h.set(null));
eq(await page.evaluate(() => window.h.mod.el.hidden), true, 'update(null) 숨김');
eq(await page.evaluate(() => window.h.mod.el.children.length), 0, 'update(null) 내용 없음');
// 붙이지 않는 규칙
ok(await page.evaluate(() => window.h.mod.el.parentElement === document.getElementById('ui')), '시험 페이지가 붙인 곳에 있음');

ok(errors.length === 0, '콘솔 오류: ' + errors.join(' | '));
await browser.close();
await server.close();
console.log(fails ? `실패 ${fails}건` : '통과');
process.exit(fails ? 1 : 0);
