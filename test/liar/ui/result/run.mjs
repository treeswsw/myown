// node test/liar/ui/result/run.mjs — 정답·결과 모듈 자기 시험(실제 클릭)
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
const url = server.resolvedUrls.local[0] + 'test/liar/ui/result/harness.html?nogl=1';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.h && window.h.mod);

  const set = (name, opts) => page.evaluate(([n, o]) => window.h.set(n, o), [name, opts || {}]);
  const sent = () => page.evaluate(() => window.h.sent.slice());
  const clear = () => page.evaluate(() => { window.h.sent.length = 0; });
  const q = (lg) => page.locator(`[data-lg="${lg}"]`);
  const vis = (lg) => q(lg).first().isVisible().catch(() => false);
  const txt = (lg) => q(lg).first().innerText();
  // 버튼 중심점이 실제로 눌리는가
  const hit = (lg) => page.evaluate((l) => {
    const b = document.querySelector(`[data-lg="${l}"]`); if (!b) return false;
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!e && (e === b || b.contains(e));
  }, lg);
  const inView = (lg) => page.evaluate((l) => {
    const r = document.querySelector(`[data-lg="${l}"]`).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  }, lg);

  let s;
  for (const n of [8, 3]) {
    // ---- guess: 라이어 화면 ----
    await set('guess', { n, you: 'u2', round: n * 10 });
    ok(await vis('guess-input'), `[${n}] 라이어에게 입력칸`);
    ok(await vis('guess-send'), `[${n}] 라이어에게 보내기`);
    ok(!(await vis('guess-wait')), `[${n}] 라이어에게 대기 문구 없음`);
    ok(await hit('guess-send'), `[${n}] guess-send 중심점`);
    await clear();
    await q('guess-send').click(); // 빈 칸
    ok((await sent()).length === 0, `[${n}] 빈 칸은 안 보냄`);
    await q('guess-input').fill('   ');
    await q('guess-send').click();
    ok((await sent()).length === 0, `[${n}] 공백만은 안 보냄`);
    ok((await q('guess-input').getAttribute('maxlength')) === '30', `[${n}] 30자 제한`);
    await q('guess-input').fill('도서관');
    await q('guess-send').click();
    s = await sent();
    ok(s.length === 1 && JSON.stringify(s[0]) === JSON.stringify({ t: 'lg', a: 'guess', text: '도서관' }), `[${n}] guess 한 번 ${JSON.stringify(s)}`);
    await q('guess-send').click({ force: true }).catch(() => {});
    await q('guess-input').press('Enter').catch(() => {});
    ok((await sent()).length === 1, `[${n}] 두 번째는 안 보냄`);
    // 같은 state 를 다시 넣어도(멱등) 두 번째 전송 불가
    await page.evaluate(() => window.h.mod.update(window.h.state));
    await page.evaluate(() => { const b = document.querySelector('[data-lg="guess-send"]'); b.disabled = false; b.click(); });
    ok((await sent()).length === 1, `[${n}] 다시 그려도 한 번`);
    // 답이 오면 입력칸은 사라지고 맞음/틀림
    await set('guess', { n, you: 'u2', round: n * 10, guess: { text: '도서관', correct: true } });
    ok(!(await vis('guess-input')), `[${n}] 답이 오면 입력칸 없음`);
    ok((await txt('guess-shown')).includes('도서관') && (await txt('guess-shown')).includes('맞음'), `[${n}] 맞음 표시`);
    await set('guess', { n, you: 'u2', round: n * 10, guess: { text: '서점', correct: false } });
    ok((await txt('guess-shown')).includes('틀림'), `[${n}] 틀림 표시`);
    // 새 판이면 다시 보낼 수 있다
    await set('guess', { n, you: 'u2', round: n * 10 + 1 });
    ok(await vis('guess-input') && !(await q('guess-input').isDisabled()), `[${n}] 새 판은 다시 입력 가능`);
    ok((await q('guess-input').inputValue()) === '', `[${n}] 새 판은 빈 칸`);

    // ---- guess: 시민 화면 ----
    await set('guess', { n, you: 'u1' });
    ok(!(await vis('guess-input')) && !(await vis('guess-send')), `[${n}] 시민에게 입력칸 없음`);
    ok((await txt('guess-wait')).includes('라이어가 정답을 고민하고 있습니다'), `[${n}] 대기 문구`);
    ok((await page.locator('.lg-rs-gsecs').innerText()).includes('15'), `[${n}] 남은 초 15`);
    await page.evaluate(() => { window.h.clock = 1_008_300; window.h.mod.frame(0.1); });
    ok((await page.locator('.lg-rs-gsecs').innerText()).includes('7'), `[${n}] 남은 초 7`);
    await page.evaluate(() => { window.h.clock = 1_099_000; window.h.mod.frame(0.1); });
    ok((await page.locator('.lg-rs-gsecs').innerText()).includes('0'), `[${n}] 0 아래로 안 감`);
    await page.evaluate(() => { window.h.clock = 1_000_000; });
    // 관전자
    await set('guess', { n, you: 'u1', guess: { text: '도서관', correct: true } });
    ok((await txt('guess-shown')).includes('도서관'), `[${n}] 시민에게도 답 표시`);
    ok(!(await vis('guess-wait')), `[${n}] 답이 오면 대기 문구 없음`);
  }

  // ---- 다른 단계·null 에서는 숨김 ----
  for (const ph of ['unmask', 'speak', 'discuss', 'lobby', 'reveal']) {
    await set(ph, { you: 'u2' });
    ok(!(await vis('guess-input')) && !(await vis('result')) && !(await vis('guess-wait')), `${ph} 에서 숨김`);
  }
  await set('guess', { you: 'u2' });
  await page.evaluate(() => window.h.mod.update(null));
  ok(!(await vis('guess-input')) && !(await vis('guess-wait')) && !(await vis('result')), 'null 이면 숨김');
  await set('result');
  await page.evaluate(() => window.h.mod.update(null));
  ok(!(await vis('result')), 'result 뒤 null 이면 숨김');

  // ---- result ----
  const WIN = { executedLiar: '시민 승리', executedCitizen: '라이어 승리', tie: '라이어 승리', noVotes: '라이어 승리',
    liarLeft: '시민 승리', tooFew: '무효', hostEnded: '무효' };
  const seen = new Set();
  for (const [reason, title] of Object.entries(WIN)) {
    await set('result', { reason });
    const t = await txt('result-winner');
    ok(t.includes(title), `${reason}: ${t}`);
    seen.add(t);
  }
  ok(seen.size === 7, `reason 마다 문구가 다름 (${seen.size})`);

  for (const n of [8, 3]) {
    await set('result', { n });
    ok(await vis('result'), `[${n}] result 보임`);
    ok((await page.locator('[data-lg="result-row"]').count()) === n, `[${n}] 순위 줄 ${n}`);
    const ids = await page.locator('[data-lg="result-row"]').evaluateAll((els) => els.map((e) => e.dataset.id));
    ok(ids.length === n && new Set(ids).size === n, `[${n}] 줄마다 data-id`);
    const full = await txt('result');
    ok(full.includes('도서관') && full.includes('서점'), `[${n}] 두 제시어`);
    ok(full.includes('민수'), `[${n}] 이름`);
  }
  await set('result', { n: 8 });
  const scores = await page.locator('[data-lg="result-row"] [data-part="score"]').allInnerTexts();
  ok(scores.every((v, i) => i === 0 || Number(scores[i - 1]) >= Number(v)), `점수 높은 순 ${scores}`);
  ok((await page.locator('[data-lg="result-row"]').allInnerTexts()).some((t) => t.includes('−1')), 'delta −1 표시');
  ok((await page.locator('[data-lg="result-row"]').allInnerTexts()).some((t) => t.includes('+2')), 'delta +2 표시');
  ok((await page.locator('[data-lg="result-row"]').allInnerTexts()).some((t) => t.includes('라이어')), '라이어 표시');
  ok((await page.locator('.lg-rs-champ').count()) === 1 && !(await page.locator('.lg-rs-champ').isVisible()), '우승 없으면 숨김');
  await set('result', { champions: ['u1', 'u3'] });
  const ct = await page.locator('.lg-rs-champ').innerText();
  ok(ct.includes('우승') && ct.includes('서아') && ct.includes('병철'), `champions 표시 ${ct}`);

  // 'notice' 방식
  await set('result', { notice: true });
  ok(await vis('result') && (await txt('result')).includes('도서관') && (await txt('result')).includes('라이어 알림'), 'notice 방식 안 깨짐');
  // 투표 내역: 1번이면 열림, 2번이면 접힘
  await set('result', { log: 1 });
  ok(await page.locator('.lg-rs-details').evaluate((d) => d.open), '1번 지목은 펼침');
  await set('result', { log: 2 });
  ok(await page.locator('.lg-rs-details').evaluate((d) => !d.open), '2번 지목은 접힘');
  ok((await page.locator('.lg-rs-entry').count()) === 2, '지목 횟수만큼 항목');

  // 다음 판
  await set('result', { host: 'u0', you: 'u0' });
  ok(await vis('next'), '방장에게 next');
  ok(await inView('next'), 'next 가 화면 안');
  ok(await hit('next'), 'next 중심점');
  await clear();
  await q('next').click();
  s = await sent();
  ok(s.length === 1 && JSON.stringify(s[0]) === JSON.stringify({ t: 'start' }), `next → start ${JSON.stringify(s)}`);
  await set('result', { host: 'u0', you: 'u1' });
  ok(!(await vis('next')), '방장 아니면 next 없음');
  ok((await txt('result')).includes('방장이 다음 판을 시작하기를 기다리는 중'), '대기 문구');
  // 위로 스크롤하지 않고도 8명 판이 잘리지 않고 스크롤 가능
  await set('result', { n: 8, log: 2, host: 'u0', you: 'u0' });
  ok(await inView('next'), '8명·2번 지목에서도 next 가 보임');

  // 글자 그대로
  await set('result', { citizenWord: '<i>X</i>', liarWord: '<i id="evil">Y</i>', guess: { text: '<i>Z</i>', correct: false }, reason: 'executedLiar' });
  await page.evaluate(() => { const s = window.h.state; s.result.guessed = false; window.h.mod.update(s); });
  ok((await page.locator('.lg-rs-root i').count()) === 0, '<i> 가 요소가 되지 않음');
  const rt = await txt('result');
  ok(rt.includes('<i>X</i>') && rt.includes('<i id="evil">Y</i>') && rt.includes('<i>Z</i>'), '제시어·답 글자 그대로');
  await set('guess', { guess: { text: '<i>Z</i>', correct: false } });
  ok((await page.locator('.lg-rs-root i').count()) === 0 && (await txt('guess-shown')).includes('<i>Z</i>'), 'guess 답 글자 그대로');

  // ---- G1: 라이어가 players 에 없는 결과 / firstVotes ----
  const mut = (fn) => page.evaluate((src) => {
    const st = window.h.state; (new Function('st', src))(st); window.h.mod.update(st);
  }, fn);
  await set('result', { n: 8 });
  await mut("st.players = st.players.filter(p => p.id !== 'u2'); st.result.liarName = '서아';");
  ok((await txt('result')).includes('서아'), '라이어가 나가도 liarName 표시');
  await mut("delete st.result.liarName;");
  ok((await page.locator('.lg-rs-info .lg-rs-name').first().innerText()) === '?', 'liarName 도 없으면 ?');
  await set('result', { n: 8, log: 2 });
  await mut("st.result.voteLog[0].firstVotes = { u0: 'u1', u1: 'u0' };");
  const lt = await page.locator('.lg-rs-entry').first().textContent();
  ok(lt.includes('첫 투표') && lt.includes('재투표'), `firstVotes 두 줄 ${lt}`);
  ok((await page.locator('.lg-rs-entry').nth(1).textContent()).includes('첫 투표') === false, 'firstVotes 없으면 그대로');

  ok(errs.length === 0, '콘솔 오류 없음: ' + errs.join(' | '));
  const he = await page.evaluate(() => window.h.errors);
  ok(he.length === 0, '페이지 오류 없음: ' + he.join(' | '));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `result UI 실패 ${fails}/${count}` : `result UI 통과 (${count}개 확인)`);
process.exit(fails ? 1 : 0);
