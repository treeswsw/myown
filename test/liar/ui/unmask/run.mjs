// node test/liar/ui/unmask/run.mjs — 정체 공개 글 자기 시험(시계를 움직여 확인)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');

let fails = 0, count = 0;
const ok = (c, m) => { count++; if (!c) { fails++; console.error('FAIL', m); } };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'test/liar/ui/unmask/harness.html?nogl=1';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.h && window.h.mod);

  const set = (k, o) => page.evaluate(([a, b]) => { window.h.stages.length = 0; window.h.ticks.length = 0; window.h.set(a, b || {}); }, [k, o]);
  const tick = (ms) => page.evaluate((m) => window.h.tick(m), ms);
  const q = (lg) => page.locator(`[data-lg="${lg}"]`);
  const has = async (lg) => (await q(lg).count()) > 0;
  const vis = (lg) => q(lg).first().isVisible().catch(() => false);
  const txt = async (lg) => ((await has(lg)) ? (await q(lg).first().innerText()).trim() : '');
  const stage = () => page.evaluate(() => document.querySelector('[data-lg="unmask"]').dataset.stage);
  const info = () => page.evaluate(() => ({ stages: window.h.stages.slice(), ticks: window.h.ticks.length, big: window.h.ticks.filter(Boolean).length, busy: window.h.mod.busy }));

  // ---- 라이어 처형 (6초) ----
  for (const n of [8, 3]) {
    await set('liar', { n });
    ok(await vis('unmask'), `[${n}] 연출 보임`);
    ok((await stage()) === 'dark', `[${n}] 처음은 dark`);
    ok((await txt('um-l1')) === '', `[${n}] 처음엔 글자 없음`);
    await tick(1000); // 첫 글자 시각
    ok((await txt('um-l1')) === '그', `[${n}] 첫 글자 "그": ${await txt('um-l1')}`);
    ok((await stage()) === 'line1', `[${n}] line1`);
    let prev = 0, grew = true;
    for (let i = 0; i < 12; i++) {
      await tick(105);
      const len = (await txt('um-l1')).replace(/\s/g, '').length;
      if (len < prev || len - prev > 1) grew = false;
      prev = len;
    }
    ok(grew, `[${n}] 한 글자씩 늘어남`);
    await tick(200);
    ok((await txt('um-l1')) === '그는 라이어가', `[${n}] 첫 줄 완성: ${await txt('um-l1')}`);
    ok((await txt('um-l2')) === '', `[${n}] 둘째 줄은 아직`);
    await tick(900);
    ok((await txt('um-l2')) === '맞', `[${n}] 둘째 줄 한 글자씩: ${await txt('um-l2')}`);
    ok((await stage()) === 'line2', `[${n}] line2`);
    await tick(1200);
    ok((await txt('um-l2')) === '맞습니다', `[${n}] 맞습니다`);
    ok(!(await has('um-liar')), `[${n}] 라이어 처형엔 um-liar 없음`);
    await tick(1000);
    ok((await stage()) === 'liar', `[${n}] 뜸 뒤 liar`);
    await tick(1500);
    ok((await stage()) === 'end', `[${n}] 끝 end`);
    const i = await info();
    ok(i.stages.map((s) => s[0]).join() === 'dark,liar,end', `[${n}] onStage 순서: ${i.stages.map((s) => s[0])}`);
    ok(i.stages.every((s) => s[1] === 'u2'), `[${n}] onStage 에 라이어 id`);
    ok(i.ticks === '그는 라이어가맞습니다'.replace(/ /g, '').length, `[${n}] onTick 글자마다: ${i.ticks}`);
    ok(i.big === 4, `[${n}] big 틱 4`);
    ok(i.busy, `[${n}] busy`);
  }

  // ---- 시민 처형 (11초) ----
  await set('citizen', { liarName: '<b>지호</b>' });
  await tick(4400);
  ok((await txt('um-l2')) === '아닙니다', '아닙니다: ' + await txt('um-l2'));
  ok(!(await has('um-liar')), '시민: 아직 um-liar 없음');
  ok((await stage()) === 'line2', '시민: line2');
  await tick(1116 + 450 + 50);
  ok((await has('um-liar')) && (await txt('um-liar')) === '', 'um-liar 가 생김(빈 칸)');
  ok((await txt('um-l1')) === '' && !(await has('um-l2')), '첫 두 줄은 치워짐');
  ok((await stage()) === 'liar', 'liar 단계');
  await tick(1800);
  ok((await txt('um-liar')).includes('라이어'), '라이어는 진행: ' + await txt('um-liar'));
  await tick(6000);
  const lt = await txt('um-liar');
  ok(/라이어는\s+<b>지호<\/b> 입니다/.test(lt), '이름 그대로 + 입니다: ' + lt);
  ok(await page.evaluate(() => !document.querySelector('[data-lg="um-liar"] b')), '이름의 <b> 가 태그가 되지 않음');
  // 이름은 그 사람(u2 지호)의 색
  ok((await page.evaluate(() => getComputedStyle(document.querySelector('.lg-um-name')).color)) === 'rgb(233, 215, 88)', '이름이 그 사람 색');
  await tick(2000);
  ok((await stage()) === 'end', '시민: end');
  ok((await info()).stages.map((s) => s[0]).join() === 'dark,liar,end', '시민: onStage 순서');

  // ---- 지목 실패 (5초) ----
  await set('fail');
  ok(!(await has('um-l1')) && !(await has('um-l2')), '실패: 첫 두 줄 없음');
  ok(await has('um-liar'), '실패: um-liar 바로 있음');
  ok((await stage()) === 'liar', '실패: 바로 liar');
  await tick(2000);
  ok((await txt('um-liar')).includes('라이어는'), '실패: 라이어는');
  await tick(3000);
  ok(/라이어는\s+지호 입니다/.test(await txt('um-liar')), '실패: 이름 ' + await txt('um-liar'));

  // ---- 중간 입장 ----
  await set('citizen', { remain: 2 });
  const part = await txt('um-liar');
  ok(/라이어는\s+지호 입/.test(part) && !part.includes('다'), '남은 2초 처음 set: 글자가 이미 찍힘: ' + part);
  const mi = await info();
  ok(mi.ticks === 0, '건너뛴 글자는 onTick 안 부름: ' + mi.ticks);
  ok(mi.stages.map((s) => s[0]).join() === 'dark,liar', '중간 입장 onStage: ' + mi.stages.map((s) => s[0]));
  await tick(500);
  ok((await info()).ticks > 0, '그 뒤 새로 찍힌 글자는 부름');
  await set('citizen', { remain: 0.5 });
  ok(/라이어는\s+지호 입니다/.test(await txt('um-liar')), '남은 0.5초: 전부 찍힘');
  ok((await stage()) === 'liar', '남은 0.5초: 아직 liar');
  await tick(600);
  ok((await stage()) === 'end', '끝나면 end');

  // ---- 같은 상태 두 번 set ----
  await set('liar');
  await tick(3000);
  const before = await txt('um-l1');
  await page.evaluate(() => window.h.mod.update(window.h.state));
  await page.evaluate(() => window.h.mod.update(window.h.state));
  ok((await txt('um-l1')) === before && before.length > 0, '같은 상태 반복 update 가 다시 시작하지 않음');
  ok((await info()).stages.filter((s) => s[0] === 'dark').length === 1, 'dark 한 번만');

  // ---- 건너뛰기 없음: 뒤의 버튼이 안 눌림 ----
  await page.evaluate(() => { window.h.clicks = 0; });
  await page.mouse.click(60, 40);
  ok((await page.evaluate(() => window.h.clicks)) === 0, '연출 중 뒤의 버튼이 안 눌림');
  await page.mouse.click(400, 200);
  ok(await vis('unmask'), '눌러도 연출이 그대로');

  // ---- 다른 단계에서는 사라짐 ----
  await page.evaluate(() => { window.h.raw({ ...window.h.state, phase: 'guess' }); });
  ok(!(await vis('unmask')), 'guess 에서 숨김');
  ok(!(await page.evaluate(() => window.h.mod.busy)), 'busy false');
  await page.mouse.click(60, 40);
  ok((await page.evaluate(() => window.h.clicks)) === 1, '숨긴 뒤에는 뒤의 버튼이 눌림');
  await set('liar');
  await page.evaluate(() => window.h.mod.update(null));
  ok(!(await vis('unmask')), 'update(null) 숨김');
  ok(!(await page.evaluate(() => window.h.mod.busy)), 'null: busy false');
  // 다음 판 같은 phase 로 다시 들어오면 새로 시작
  await set('liar');
  ok((await txt('um-l1')) === '', '다시 들어오면 처음부터');

  ok(errs.length === 0 && (await page.evaluate(() => window.h.errors.length)) === 0, '오류 없음 ' + errs.join('|'));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `FAIL ${fails}/${count}` : `OK ${count} checks`);
process.exit(fails ? 1 : 0);
