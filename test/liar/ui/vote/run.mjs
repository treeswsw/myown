// 이름표·지목·찬반 자기 시험 (실제 클릭). 사용: node test/liar/ui/vote/run.mjs
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/vote/harness.html?nogl=1';
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
const tag = (id) => `[data-lg=tag][data-id=${id}]`;
const count = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
// 보이는 버튼 중심점이 그 버튼(또는 자식)에 닿는지
async function centerHits(sel, label) {
  const bad = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((b) => b.getClientRects().length).map((b) => {
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t && (t === b || b.contains(t)) ? null : (b.dataset.id || b.dataset.v || b.className);
  }).filter(Boolean), sel);
  ok(bad.length === 0, `${label}: 중심점이 눌리지 않는 버튼 ${bad.join(',')}`);
}

for (const mode of ['list', 'pos']) {
  for (const n of [8, 3]) {
    const L = `[${mode} ${n}명]`;
    console.log(L);
    await page.evaluate((m) => { window.h.anchorMode = m === 'pos' ? 'pos' : 'null'; }, mode);
    // nogl=1 이면 좌표 모드도 목록이 된다. 좌표 모드는 아래에서 따로 nogl 없이 연다
    await set('lobby', n);
    eq(await count(tag('u0')), 0, `${L} 방 대기에서는 이름표 없음`);
    await set('reveal', n);
    eq(await count('[data-lg=tag]'), 0, `${L} reveal 에서는 이름표 없음`);
    await set('speak', n);
    eq(await count('[data-lg=tag]'), n, `${L} speak 이름표 수`);
    await clear();
    await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u2]').click());
    eq(await sent(), [], `${L} speak 에서는 안 보내짐`);

    await set('discuss', n);
    ok(await vis(tag('u2')), `${L} 이름표 보임`);
    await centerHits('[data-lg=tag]:not([aria-disabled=true])', `${L} discuss 이름표`);
    await clear();
    await page.click(tag('u2'));
    eq(await sent(), [{ t: 'lg', a: 'vote', target: 'u2' }], `${L} 남의 이름표 클릭 → vote`);
    await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u0]').click());
    eq((await sent()).length, 1, `${L} 내 이름표는 안 보내짐`);
    // 서버가 내 표를 반영한 뒤 같은 사람을 다시 → 취소
    await set('discuss', n, { votes: { u0: 'u2' } });
    ok((await page.getAttribute(tag('u2'), 'aria-pressed')) === 'true', `${L} 내가 찍은 사람 표시`);
    await clear();
    await page.click(tag('u2'));
    eq(await sent(), [{ t: 'lg', a: 'vote', target: null }], `${L} 같은 사람 다시 → null`);
    // 멱등
    await set('discuss', n, { votes: { u0: 'u2' } });
    await set('discuss', n, { votes: { u0: 'u2' } });
    eq(await count('[data-lg=tag]'), n, `${L} 같은 상태 두 번 불러도 같음`);

    // 관전자
    await set('discuss', n, { you: 'u9', players: (await page.evaluate(([nn]) => window.h.fixture('discuss', nn).players, [n])).concat([{ id: 'u9', name: '관전', color: '#888888', body: 0, seat: null, connected: true, awayUntil: null, spectating: true, score: 0 }]) });
    await clear();
    await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u1]').click());
    eq(await sent(), [], `${L} 관전자는 못 찍음`);
    eq(await count('[data-lg=tag]'), n, `${L} 관전자 이름표는 없음`);
    eq(await count('[data-lg=judge]'), 0, `${L} 관전자 화면에는 찬반 버튼 없음`);

    // 글자 현황
    await set('discuss-votes', n);
    const vs = await text('[data-lg=vote-status]');
    ok(vs.includes('서아 → 지호'), `${L} vote-status 글자: ${vs}`);
    ok(/투표 \d \/ \d/.test(await text('[data-lg=voted]')), `${L} voted 글자 ${await text('[data-lg=voted]')}`);
    ok(await vis('[data-lg=vote-status]'), `${L} nogl 에서 vote-status 보임`);
    {
      const b = await page.evaluate(([nn]) => window.h.fixture('discuss', nn), [n]);
      await page.evaluate((st) => window.h.setState(st), { ...b, players: b.players.map((p) => (p.id === 'u1' ? { ...p, connected: false, awayUntil: 1_042_000 } : p)) });
      ok((await text('[data-lg=voted]')).endsWith(`/ ${n - 1}`), `${L} 끊긴 사람은 분모에서 빠짐 ${await text('[data-lg=voted]')}`);
    }

    // revote
    await set('revote', n);
    await clear();
    if (n === 8) {
      await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u3]').click());
      eq(await sent(), [], `${L} revote 후보 아닌 사람 안 눌림`);
    }
    await page.click(tag('u1'));
    eq(await sent(), [{ t: 'lg', a: 'vote', target: 'u1' }], `${L} revote 후보는 눌림`);

    // defense
    await set('defense', n);
    eq(await count('[data-lg=judge]'), 0, `${L} defense 에는 찬반 버튼 없음`);
    await clear();
    await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u1]').click());
    eq(await sent(), [], `${L} defense 에서는 지목 안 보내짐`);
    ok((await page.getAttribute(tag('u2'), 'class')).includes('lg-vt-accused'), `${L} 지목된 사람 표시`);

    // judge
    await set('judge', n);
    eq(await count('[data-lg=judge]'), 2, `${L} judge 찬반 버튼 2개`);
    await centerHits('[data-lg=judge]', `${L} 찬반 버튼`);
    await clear();
    await page.click('[data-lg=judge][data-v=yes]');
    eq(await sent(), [{ t: 'lg', a: 'judge', v: 'yes' }], `${L} 맞다 클릭 → judge`);
    await page.click('[data-lg=judge][data-v=no]');
    eq((await sent())[1], { t: 'lg', a: 'judge', v: 'no' }, `${L} 아니다 클릭`);
    await set('judge-picks', n);
    eq(await text('[data-lg=tally]'), n === 8 ? '맞다 2 · 아니다 2' : '맞다 1 · 아니다 1', `${L} tally`);
    ok(/^맞다 \d+ · 아니다 \d+$/.test(await text('[data-lg=tally]')), `${L} tally 모양 ${await text('[data-lg=tally]')}`);
    const js = await text('[data-lg=judge-status]');
    ok(js.includes('서아: 맞다'), `${L} judge-status ${js}`);
    ok((await page.getAttribute('[data-lg=judge][data-v=no]', 'aria-pressed')) === 'true', `${L} 내가 고른 버튼 aria-pressed (내 표는 no)`);
    ok((await page.textContent(`${tag('u1')} .lg-vt-jv`)) === '맞다', `${L} 이름표 찬반 딱지`);
    eq(await page.textContent(`${tag('u2')} .lg-vt-jv`), '', `${L} 지목된 사람 딱지 없음`);
    if (n === 8) eq(await page.textContent(`${tag('u5')} .lg-vt-jv`), '고르는 중', `${L} 안 고른 사람`);
    // 지목된 사람 화면
    await set('judge-picks', n, { you: 'u2' });
    eq(await count('[data-lg=judge]'), 0, `${L} 지목된 사람 화면에는 버튼 없음`);
    ok(/^맞다/.test(await text('[data-lg=tally]')), `${L} 지목된 사람에게도 tally`);
    await set('judged', n);
    ok(await vis('[data-lg=tally]'), `${L} judged 에도 tally`);

    // 끊김, 이름 그대로
    const base = await page.evaluate(([nn]) => window.h.fixture('discuss', nn), [n]);
    const players = base.players.map((p) => (p.id === 'u1' ? { ...p, connected: false, awayUntil: 1_042_000, name: '<b>x</b>' } : p));
    await set('discuss', n, { players });
    const t1 = await text(tag('u1'));
    ok(t1.includes('끊김 42초'), `${L} 끊김 N초: ${t1}`);
    ok(t1.includes('<b>x</b>'), `${L} 이름 글자 그대로`);
    eq(await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u1] b')), null, `${L} <b> 요소가 생기지 않음`);
    await page.evaluate(() => { window.h.clock += 10_000; });
    await page.waitForTimeout(80);
    ok((await text(tag('u1'))).includes('끊김 32초'), `${L} 끊김 초가 줄어듦`);
    // 유예가 끝난 사람은 이름표에서 빠진다
    await page.evaluate(() => { window.h.clock += 40_000; });
    await page.waitForTimeout(80);
    eq(await page.evaluate(() => getComputedStyle(document.querySelector('[data-lg=tag][data-id=u1]')).display), 'none', `${L} 유예 끝난 이름표 숨김`);
    await page.evaluate(() => { window.h.clock = 1_000_000; });

    // 프로필 사진
    await page.evaluate(() => { window.h.faces.u2 = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; });
    await set('discuss', n);
    eq(await count(`${tag('u2')} img`), 1, `${L} 프로필 사진`);
    eq(await count(`${tag('u1')} img`), 0, `${L} 사진 없으면 첫 글자`);

    // tagPos, null
    const tp = await page.evaluate(() => window.h.mod.tagPos('u2'));
    ok(tp && tp.x > 0 && tp.x < 844 && tp.y > 0 && tp.y < 390, `${L} tagPos ${JSON.stringify(tp)}`);
    eq(await page.evaluate(() => window.h.mod.tagPos('nobody')), null, `${L} tagPos 없는 사람`);
    await set('discuss', n);
    await page.evaluate(() => window.h.set(null));
    eq(await count('[data-lg=tag],[data-lg=voted],[data-lg=judge],[data-lg=tally]'), 0, `${L} update(null) 전부 숨김`);
    eq(await page.evaluate(() => window.h.mod.tagPos('u1')), null, `${L} 숨김이면 tagPos null`);
  }
}

// 좌표를 주는 경우 (?nogl 없이)
console.log('[좌표 모드]');
await page.goto(url.replace('?nogl=1', ''));
await page.waitForFunction(() => window.h && window.h.mod);
for (const n of [8, 3]) {
  const L = `[좌표 ${n}명]`;
  await page.evaluate(() => { window.h.anchorMode = 'pos'; });
  await set('discuss', n);
  await page.waitForTimeout(50);
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.lg-vt-list')).display), 'none', `${L} 좌표가 있으면 목록 없음`);
  const t0 = await page.evaluate(() => window.h.mod.tagPos('u0'));
  const a0 = await page.evaluate(() => window.h.anchor('u0'));
  ok(t0 && Math.abs(t0.x - a0.x) < 40, `${L} 이름표가 좌표를 따라감 ${JSON.stringify([t0, a0])}`);
  await centerHits('[data-lg=tag]:not([aria-disabled=true])', `${L} 좌표 모드 이름표`);
  await clear();
  await page.click(tag('u1'));
  eq(await sent(), [{ t: 'lg', a: 'vote', target: 'u1' }], `${L} 좌표 모드 클릭`);
  // 좌표가 움직이면 따라간다
  await page.evaluate(() => { const old = window.h.anchor; window.h.anchor = (id) => { const a = old(id); return a && { x: a.x + 30, y: a.y }; }; });
  await page.waitForTimeout(80);
  const t1 = await page.evaluate(() => window.h.mod.tagPos('u0'));
  ok(t1.x > t0.x + 20, `${L} 좌표 이동을 따라감`);
  // 화면 밖 좌표는 안으로 가둠
  await page.evaluate(() => { window.h.anchor = () => ({ x: -500, y: 9999 }); });
  await page.waitForTimeout(80);
  const t2 = await page.evaluate(() => window.h.mod.tagPos('u0'));
  ok(t2.x >= 0 && t2.y <= 390 && t2.y >= 0, `${L} 화면 안에 가둠 ${JSON.stringify(t2)}`);
  // 일부만 null 이면 그 사람만 목록
  await page.evaluate(() => { window.h.anchor = (id) => (id === 'u1' ? null : { x: 100 + Number(id.slice(1)) * 90, y: 200 }); });
  await page.waitForTimeout(80);
  eq(await page.evaluate(() => document.querySelector('[data-lg=tag][data-id=u1]').classList.contains('lg-vt-listed')), true, `${L} null 인 사람은 목록으로`);
  await page.evaluate(() => { window.h.anchorMode = 'pos'; window.h.anchor = (id) => { const i = Number(id.slice(1)); return { x: 70 + i * 90, y: i % 2 ? 170 : 250 }; }; });
}

// 비밀(CONTRACTS 0-5): 'word' 방식에서 unmask 전에는 제시어가 달라도(라이어/시민) 화면이 같아야 한다
for (const name of ['speak', 'discuss-votes', 'revote', 'defense', 'judge-picks', 'judged']) {
  const html = (word) => page.evaluate(([nm, w]) => {
    window.h.set(nm, 8, { my: { word: w, role: null } });
    return document.querySelector('.lg-vt-root').outerHTML + document.getElementById('action').outerHTML;
  }, [name, word]);
  ok((await html('도서관')) === (await html('영화관')), `${name}: 제시어가 달라도 화면이 같다`);
}

ok(errors.length === 0, '콘솔 오류: ' + errors.join(' | '));
await browser.close();
await server.close();
console.log(fails ? `실패 ${fails}건` : '통과');
process.exit(fails ? 1 : 0);
