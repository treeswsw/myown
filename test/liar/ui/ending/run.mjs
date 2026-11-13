// node test/liar/ui/ending/run.mjs — 엔딩 화면 자기 시험(시계를 움직여 확인 + 스크린샷)
// SHOTS=폴더 를 주면 스크린샷을 저장한다.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const shots = process.env.SHOTS || '';
if (shots) fs.mkdirSync(shots, { recursive: true });

let fails = 0, count = 0;
const ok = (c, m) => { count++; if (!c) { fails++; console.error('FAIL', m); } };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'test/liar/ui/ending/harness.html?nogl=1';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.h && window.h.mod);

  const set = (k, o) => page.evaluate(([a, b]) => { window.h.stages.length = 0; window.h.ticks.length = 0; window.h.set(a, b || {}); }, [k, o]);
  const tick = (ms) => page.evaluate((m) => window.h.tick(m), ms);
  const q = (lg) => page.locator(`[data-lg="${lg}"]`);
  const vis = (lg) => q(lg).first().isVisible().catch(() => false);
  const txt = async (lg) => ((await q(lg).count()) ? (await q(lg).first().innerText()).trim() : '');
  const stage = () => page.evaluate(() => document.querySelector('[data-lg="ending"]').dataset.stage);
  const info = () => page.evaluate(() => ({ stages: window.h.stages.map((s) => s[0]).join(), ticks: window.h.ticks.length, big: window.h.ticks.filter(Boolean).length }));
  const shot = async (name) => { if (shots) await page.waitForTimeout(450); if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  // 보이는 글 상자끼리, 그리고 카드·조작 줄과 겹치지 않는지
  const overlaps = () => page.evaluate(() => {
    const sel = ['ed-title', 'ed-secs', 'ed-wait', 'ed-word', 'ed-mismatch', 'ed-answer', 'ed-verdict', 'ed-bubble'];
    const boxes = [];
    for (const lg of sel) {
      const e = document.querySelector(`[data-lg="${lg}"]`);
      if (!e || e.hidden || !e.getClientRects().length || !e.textContent.trim()) continue;
      const chars = [...e.querySelectorAll('.lg-ed-ch')];
      if (chars.length && !chars.some((c) => c.classList.contains('lg-ed-on'))) continue;
      boxes.push([lg, e.getBoundingClientRect()]);
    }
    for (const c of ['.lg-ed-card', '#bar']) { const e = document.querySelector(c); if (e && e.getClientRects().length) boxes.push([c, e.getBoundingClientRect()]); }
    const bad = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i][1], b = boxes[j][1];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(boxes[i][0] + 'x' + boxes[j][0]);
    }
    const out = boxes.filter(([, r]) => r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map(([n]) => n);
    return { bad, out };
  });
  const noOverlap = async (m) => { const o = await overlaps(); ok(!o.bad.length && !o.out.length, `${m}: 겹침/넘침 ${JSON.stringify(o)}`); };

  // ---- guess ----
  for (const [w, h] of [[844, 390], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const n of [8, 3]) {
      const tag = `${w}x${h}-n${n}`;
      await set('guess', { n });
      ok(await vis('ending'), `[${tag}] 보임`);
      ok((await stage()) === 'ask', `[${tag}] ask`);
      ok((await txt('ed-title')) === '', `[${tag}] 처음엔 제목 글자 없음`);
      ok(!(await vis('ed-secs')), `[${tag}] 초는 아직 안 보임`);
      await tick(500);
      ok((await txt('ed-title')) === '라', `[${tag}] 첫 글자: ${await txt('ed-title')}`);
      await tick(300);
      ok((await txt('ed-title')).length >= 3 && (await txt('ed-title')).length <= 4, `[${tag}] 한 글자씩: ${await txt('ed-title')}`);
      await tick(1600);
      ok((await txt('ed-title')) === '라이어는 제시어를 제출하세요', `[${tag}] 제목 완성`);
      await tick(300);
      ok(await vis('ed-secs'), `[${tag}] 큰 초 보임`);
      ok(['12초', '13초'].includes(await txt('ed-secs')), `[${tag}] 초: ${await txt('ed-secs')}`);
      ok(await vis('ed-wait'), `[${tag}] 다른 사람에게 기다림 글`);
      await noOverlap(`${tag} guess`);
      if (n === 8) await shot(`guess-${w}x${h}-n8`);
      ok((await page.evaluate(() => document.querySelector('[data-lg="ed-secs"]').dataset.urgent)) === '0', `[${tag}] 5초보다 많으면 urgent 아님`);
      await tick(8000);
      ok((await page.evaluate(() => document.querySelector('[data-lg="ed-secs"]').dataset.urgent)) === '1', `[${tag}] 마지막 5초 urgent`);
      if (n === 8) await shot(`guess-urgent-${w}x${h}`);
      ok((await info()).big >= 1, `[${tag}] 마지막 5초 큰 틱`);
    }
  }
  // 라이어 본인 화면: 기다림 글 없음
  await set('guess', { you: 'u2' });
  await tick(3000);
  ok(!(await vis('ed-wait')), '라이어 본인에겐 기다림 글 없음');
  // 중간 입장: 제목이 이미 다 써진 채, 소리 없음
  await set('guess', { remain: 6 });
  ok((await txt('ed-title')) === '라이어는 제시어를 제출하세요', '중간 입장: 제목 이미 완성');
  ok(await vis('ed-secs'), '중간 입장: 초 보임');
  ok((await info()).ticks === 0, '중간 입장: 건너뛴 글자 소리 없음');

  // ---- answer ----
  const answerCase = async (tag, o, expectVerdict, expectAnswer) => {
    await set('answer', o);
    ok((await stage()) === 'word', `[${tag}] word`);
    ok((await txt('ed-word')) === '제시어 : 도서관', `[${tag}] 제시어 바로 보임: ${await txt('ed-word')}`);
    if (o.liarWord === null) ok(!(await vis('ed-mismatch')), `[${tag}] notice: 미스매치 없음`);
    else ok((await txt('ed-mismatch')) === '미스매치 : 놀이공원', `[${tag}] 미스매치 바로 보임`);
    ok((await txt('ed-answer')) === '' && !(await vis('ed-bubble')), `[${tag}] 답은 아직`);
    await tick(900);
    ok((await txt('ed-answer')) === '', `[${tag}] 0.9초엔 아직`);
    await tick(150);
    ok((await txt('ed-answer')).length === 1, `[${tag}] 1초에 첫 글자: ${await txt('ed-answer')}`);
    ok(await vis('ed-bubble'), `[${tag}] 말풍선`);
    await tick(2000);
    ok((await txt('ed-answer')) === expectAnswer, `[${tag}] 답 완성: ${await txt('ed-answer')}`);
    ok((await txt('ed-bubble')) === (o.text === null ? '…' : expectAnswer), `[${tag}] 말풍선 같은 글: ${await txt('ed-bubble')}`);
    ok((await txt('ed-verdict')) === '', `[${tag}] 3.15초엔 판정 아직`);
    await tick(450);
    ok((await txt('ed-verdict')).length >= 1, `[${tag}] 3.5초 판정 시작`);
    ok((await stage()) === 'verdict', `[${tag}] verdict`);
    await tick(2000);
    ok((await txt('ed-verdict')) === expectVerdict, `[${tag}] 판정: ${await txt('ed-verdict')}`);
    ok((await page.evaluate(() => document.querySelector('[data-lg="ed-verdict"]').dataset.ok)) === (o.correct ? '1' : '0'), `[${tag}] data-ok`);
    await noOverlap(`${tag} answer`);
    await shot(`answer-${tag}`);
    ok((await stage()) === 'hold', `[${tag}] hold`);
    await tick(4500);
    ok((await stage()) === 'end', `[${tag}] end`);
    const i = await info();
    ok(i.stages === 'hush,answer,verdict,end', `[${tag}] onStage 순서: ${i.stages}`);
  };
  const NO = '라이어가 답을 맞히지 못했습니다', YES = '라이어가 답을 맞혔습니다';
  for (const [w, h] of [[844, 390], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    const s = `${w}x${h}`;
    await answerCase(`${s}-n8-word-wrong`, { n: 8, correct: false }, NO, '놀이공원');
    await answerCase(`${s}-n3-word-right`, { n: 3, correct: true, text: '도서관' }, YES, '도서관');
    await answerCase(`${s}-n8-notice`, { n: 8, liarWord: null, correct: false, text: '학교' }, NO, '학교');
    await answerCase(`${s}-n8-timeout`, { n: 8, text: null, correct: false }, NO, '시간 초과');
  }
  await page.setViewportSize({ width: 844, height: 390 });
  const LONG = '아주아주아주아주아주긴정답입니다아주아주아주';
  await answerCase('long-answer', { text: LONG, correct: false }, NO, LONG);

  // 중간 입장
  await set('answer', { remain: 6.2, correct: true, text: '도서관' });
  ok((await txt('ed-answer')) === '도서관' && (await txt('ed-verdict')).length >= 4, '중간 입장(3.8초): 답은 다 써지고 판정 진행: ' + await txt('ed-verdict'));
  ok((await info()).ticks === 0, '중간 입장: 지난 글자 소리 없음');
  await tick(400);
  ok((await info()).ticks > 0, '그 뒤 새 글자는 소리');
  await set('answer', { remain: 1, correct: true, text: '도서관' });
  ok((await stage()) === 'hold' && (await txt('ed-verdict')) === YES, '남은 1초: 전부 찍힘');
  await shot('late-join-844');

  // 사용자 글자는 textContent
  await set('answer', { text: '<img src=x onerror=alert(1)>', correct: false });
  await tick(5000);
  ok(await page.evaluate(() => !document.querySelector('[data-lg="ending"] img[src="x"]')), 'HTML 해석 없음');

  // 같은 상태 반복 update
  await set('answer', { correct: true });
  await tick(5000);
  const before = await txt('ed-answer');
  await page.evaluate(() => { window.h.mod.update(window.h.state); window.h.mod.update(window.h.state); });
  ok((await txt('ed-answer')) === before, '반복 update 가 다시 시작하지 않음');
  ok((await info()).stages === 'hush,answer,verdict', '단계 알림 한 번씩: ' + (await info()).stages);

  // 눌러도 통과, 조작 줄은 위
  await page.evaluate(() => { window.h.clicks = 0; });
  await page.mouse.click(60, 40);
  ok((await page.evaluate(() => window.h.clicks)) === 1, '뒤의 버튼이 눌림(pointer-events none)');
  ok((await page.evaluate(() => { const r = document.getElementById('bar').getBoundingClientRect(); return document.elementFromPoint(r.left + 5, r.top + 5).id; })) === 'bar', '조작 줄이 위');

  // 다른 단계에서는 사라짐
  await page.evaluate(() => { window.h.raw({ ...window.h.state, phase: 'result' }); });
  ok(!(await vis('ending')), 'result 에서 숨김');
  await page.evaluate(() => { window.h.raw({ ...window.h.state, phase: 'answer', unmask: null }); });
  ok(!(await vis('ending')), 'unmask 없으면 숨김');
  await set('guess');
  await page.evaluate(() => window.h.mod.update(null));
  ok(!(await vis('ending')) && !(await page.evaluate(() => window.h.mod.busy)), 'update(null) 숨김');

  // 3D 모드(nogl=0): 카드 없음
  await page.goto(url.replace('nogl=1', 'nogl=0'));
  await page.waitForFunction(() => window.h && window.h.mod);
  await set('answer', { correct: true });
  await tick(4000);
  ok(!(await page.evaluate(() => document.querySelector('.lg-ed-root').classList.contains('lg-ed-nogl'))), '3D: nogl 클래스 없음');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.lg-ed-mid')).display === 'none'), '3D: 카드 안 보임');
  await shot('gl-844-answer');

  ok(errs.length === 0 && (await page.evaluate(() => window.h.errors.length)) === 0, '오류 없음 ' + errs.join('|'));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `FAIL ${fails}/${count}` : `OK ${count} checks`);
process.exit(fails ? 1 : 0);
