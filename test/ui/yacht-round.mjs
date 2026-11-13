// 요트다이스 한 판 스모크 (`npm test` 에 포함): 실제 서버(YACHT=on) + 빌드된 화면(dist/, ?nogl=1) + 창 2개 + 늦게 들어오는 관전 창 1개.
// 12바퀴(24차례)를 끝까지: 매 차례 컵 흔들기 → 굴림 → (가끔 보관) → 칸 두 번 눌러 기록. 매 굴림 뒤 모든 창의 주사위(dv-*)가 같고,
// 차례 아닌 창에는 버튼이 없다. 한 번은 차례인 창을 닫았다 다시 열고(재접속), 끝나면 결과·합계·새 판을 본다.
// 보이는 글자·요소로만 판단한다. npm run build 가 먼저 필요하다. 환경 변수: YR_VIEWPORT(예 1280x720, 기본 844x390), YR_SHOTS(캡처 폴더).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer, uid } from '../e2e/helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('FAIL: dist/ 가 없습니다. 먼저 npm run build');
  process.exit(1);
}
const shots = process.env.YR_SHOTS || path.join(os.tmpdir(), 'yacht-round');
const wantShots = Boolean(process.env.YR_SHOTS);
fs.mkdirSync(shots, { recursive: true });
const [VW, VH] = (process.env.YR_VIEWPORT || '844x390').split('x').map(Number);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const T = 8000;
let failed = 0;
const check = (what, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` - ${detail}` : ''}`);
  return ok;
};
class StepFailed extends Error {}

const wins = [];
async function openPage(ctx, w) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  page.on('pageerror', (e) => w.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) w.errors.push(`console.error: ${m.text()}`); });
  await page.goto(`${w.url}/?nogl=1`);
  w.page = page;
}
async function makeWin(browser, url, who) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const w = { who, ctx, url, errors: [], page: null };
  await openPage(ctx, w);
  wins.push(w);
  return w;
}

let stepNo = 0;
async function step(what, fn) {
  stepNo++;
  try { await fn(); check(what, true); } catch (e) {
    check(what, false, String(e.message || e).split('\n').slice(0, process.env.YR_VERBOSE ? 12 : 1).join(' | '));
    for (const w of wins) {
      if (!w.page || w.page.isClosed()) continue;
      const f = path.join(shots, `fail-${String(stepNo).padStart(2, '0')}-${w.who}.png`);
      await w.page.screenshot({ path: f }).catch(() => {});
      const txt = await w.page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '');
      console.log(`      [${w.who}] 캡처 ${f}\n      [${w.who}] 화면 글자: ${txt.replace(/\s+/g, ' ').slice(0, 240)}`);
    }
    throw new StepFailed(what);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (w, sel) => w.page.locator(sel).count();
const shown = async (w, sel) => w.page.locator(sel).first().isVisible().catch(() => false);
async function until(fn, label, timeout = T) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => false);
    if (v) return v;
    if (Date.now() > end) throw new Error(`시간 초과: ${label}`);
    await sleep(80);
  }
}
// 모든 창의 주사위 모양(눈·자리·보관 칸)을 글자로
const diceOf = (w) => w.page.evaluate(() => [...document.querySelectorAll('[data-yt^="dv-"]')].map((e) => `${e.getAttribute('data-yt')}:${e.getAttribute('data-v')}:${e.getAttribute('data-x')}:${e.getAttribute('data-z')}:${e.getAttribute('data-slot')}`).join('|'));
async function sameDice(label, list = wins) {
  await until(async () => {
    const all = await Promise.all(list.map(diceOf));
    return all[0].includes(':') && !all[0].includes(':null') && all.every((d) => d === all[0]);
  }, `모든 창의 주사위가 같다 (${label})`);
}
const noButtons = async (w, label) => {
  const n = await count(w, '[data-yt="cup"], [data-yt^="row-"], [data-yt^="die-"]');
  if (n) throw new Error(`${w.who} 창에 누르는 것이 ${n}개 (${label})`);
};
// 지금 차례인 창(컵 버튼이 보이는 창)
async function activeWin(players) {
  return until(async () => { for (const w of players) if (await shown(w, '[data-yt="cup"]')) return w; return null; }, '차례인 창(컵 버튼)', 15000);
}
async function holdCup(w) {
  const b = await w.page.locator('[data-yt="cup"]').boundingBox();
  await w.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await w.page.mouse.down();
  await sleep(600);
  await w.page.mouse.up();
}
const shot = async (w, name) => { if (wantShots) await w.page.screenshot({ path: path.join(shots, `${VW}x${VH}-${name}.png`) }).catch(() => {}); };

const server = await startServer({ YACHT: 'on', GRACE_MS: '10000' });
let browser;
try {
  browser = await chromium.launch();
  const A = await makeWin(browser, server.http, 'A');
  const B = await makeWin(browser, server.http, 'B');
  const names = { A: uid('가'), B: uid('나'), C: uid('다') };
  const players = [A, B];
  let C = null;

  await step('로그인 2명 → 요트 방(A 방장) → B 참가 → 시작', async () => {
    for (const w of players) {
      await w.page.fill('.lb-field', names[w.who]);
      await w.page.click('button.lb-primary:has-text("입장")');
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    }
    await A.page.click('.lb-seg-item:has-text("요트다이스")');
    await A.page.click('button.lb-primary:has-text("방 만들기")');
    await A.page.locator('.ytbar-code').waitFor({ state: 'visible' });
    await B.page.locator('.lb-room-row', { hasText: `${names.A}의 방` }).click();
    await B.page.locator('.ytbar-code').waitFor({ state: 'visible' });
    await A.page.locator('[data-yt^="head-"]').nth(1).waitFor({ state: 'visible' });
    await shot(A, '1-room');
    await A.page.click('[data-yt="bar-start"]');
    await until(() => shown(A, '[data-yt="turn"]'), '차례 표시');
  });

  let turns = 0;
  let reconnected = false;
  let lateJoined = false;
  let sawPickmark = false;
  const t0 = Date.now();
  await step('12바퀴 끝까지: 굴림·보관·기록, 모든 창의 주사위가 같다, 차례 아닌 창은 버튼 없음', async () => {
    while (!(await shown(A, '[data-yt="result"]'))) {
      const act = await activeWin(players);
      const other = players.find((w) => w !== act);
      turns++;
      await noButtons(other, '남의 차례');
      await holdCup(act);
      await act.page.locator('[data-yt="die-0"]').waitFor({ state: 'visible', timeout: 10000 });
      const list = C ? [...players, C] : players;
      await sameDice(`${turns}번째 차례 첫 굴림`, list);
      if (C) await noButtons(C, '관전');

      if (turns === 3) await shot(act, '2-after-roll');
      if (turns === 5 && !lateJoined) {
        // 늦게 들어오는 관전 창
        lateJoined = true;
        C = await makeWin(browser, server.http, 'C');
        await C.page.fill('.lb-field', names.C);
        await C.page.click('button.lb-primary:has-text("입장")');
        await C.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
        await C.page.locator('.lb-room-row', { hasText: `${names.A}의 방` }).click();
        await C.page.locator('.ytbar-code').waitFor({ state: 'visible' });
        await sameDice('관전 창이 중간에 들어옴', [A, B, C]);
        await noButtons(C, '관전(들어온 직후)');
      }
      if (turns === 7 && !reconnected) {
        // 자기 차례에 굴린 뒤 창을 닫았다 다시 연다
        reconnected = true;
        const before = { dice: await diceOf(act), left: await act.page.locator('[data-yt="left"]').getAttribute('data-n') };
        await act.page.close();
        await until(async () => (await other.page.locator('[data-yt="wait"]').first().textContent().catch(() => '')).includes('재접속'), '다른 창에 "재접속 기다리는 중"', 6000);
        await noButtons(other, '끊긴 사람 기다림');
        await shot(other, '3-waiting');
        await openPage(act.ctx, act);
        await act.page.locator('[data-yt="die-0"]').waitFor({ state: 'visible', timeout: 10000 });
        const after = { dice: await diceOf(act), left: await act.page.locator('[data-yt="left"]').getAttribute('data-n') };
        if (before.dice !== after.dice || before.left !== after.left) throw new Error(`재접속 뒤 달라짐: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
        await until(async () => !(await shown(other, '[data-yt="wait"]')), '"기다리는 중" 사라짐');
        await sameDice('재접속 뒤', list);
      }
      if (turns % 3 === 0) {
        // 주사위 하나를 보관: 모든 창에 같은 보관 칸
        await act.page.locator('[data-yt="die-0"]').click();
        await until(async () => (await Promise.all(list.map((w) => w.page.locator('[data-yt="slot-0"][data-v]').count()))).every((n) => n === 1), '보관 칸에 주사위(모든 창)');
        await sameDice('보관 뒤', list);
      }
      // 첫 번째 칸: 한 번 누름 = 선택(남의 창에 강조), 두 번째 누름 = 기록
      const row = act.page.locator('[data-yt^="row-"]').first();
      await row.waitFor({ state: 'visible', timeout: 10000 });
      const cat = (await row.getAttribute('data-yt')).slice(4);
      await row.click();
      await act.page.locator(`[data-yt="row-${cat}"][aria-pressed="true"]`).waitFor({ state: 'visible' });
      if (await shown(other, '[data-yt="pickmark"]').catch(() => false) || await until(() => shown(other, '[data-yt="pickmark"]'), '남의 창에 선택 강조', 3000).catch(() => false)) sawPickmark = true;
      await act.page.locator(`[data-yt="row-${cat}"]`).click();
      await until(async () => !(await shown(act, '[data-yt="cup"]')) || (await shown(A, '[data-yt="result"]')), '기록 뒤 차례 넘어감');
      if (turns > 40) throw new Error('차례가 40번을 넘어도 끝나지 않음');
    }
    if (turns !== 24) throw new Error(`차례 수 ${turns} (24여야 함)`);
  });
  check(`한 판 24차례 (${((Date.now() - t0) / 1000).toFixed(0)}초), 재접속 ${reconnected ? 1 : 0}번, 관전 창 ${C ? 1 : 0}개, 선택 강조 확인 ${sawPickmark}`, turns === 24 && reconnected && Boolean(C) && sawPickmark);

  await step('결과 창이 모든 창에 뜨고 합계 = 칸 합 + 보너스', async () => {
    for (const w of [A, B, C]) await until(() => shown(w, '[data-yt="result"]'), `결과 창 (${w.who})`, 10000);
    await shot(A, '4-result');
    const cols = await A.page.evaluate(() => {
      const cats = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
      const out = [];
      for (let i = 0; document.querySelector(`[data-yt="total-${i}"]`); i++) {
        const n = (k) => Number((document.querySelector(`[data-yt="${k}"]`)?.textContent || '').replace(/[^\d]/g, ''));
        const vals = cats.map((c) => n(`cell-${c}-${i}`));
        const upper = vals.slice(0, 6).reduce((a, b) => a + b, 0);
        out.push({ total: n(`total-${i}`), sum: vals.reduce((a, b) => a + b, 0) + (upper >= 63 ? 35 : 0) });
      }
      return out;
    });
    if (cols.length !== 2) throw new Error(`점수 줄 ${cols.length}개`);
    for (const c of cols) if (!c.total || c.total !== c.sum) throw new Error(`합계 ${c.total} ≠ 칸 합+보너스 ${c.sum}`);
    for (const w of [A, B, C]) await noButtons(w, '결과');
  });

  await step('방장 시작 → 새 판: 관전자가 점수표 줄에 들어온다 (3줄)', async () => {
    await A.page.click('[data-yt="bar-start"]');
    await until(async () => (await A.page.locator('[data-yt^="head-"]').count()) === 3 && !(await shown(A, '[data-yt="result"]')), '3줄 점수표·결과 창 닫힘', 10000);
    await until(async () => (await C.page.locator('[data-yt^="head-"]').count()) === 3, '관전자였던 창에도 3줄');
    await until(() => shown(A, '[data-yt="turn"]'), '새 판 차례 표시');
  });

  await step('콘솔 오류 없음', async () => {
    const errs = wins.flatMap((w) => w.errors.map((e) => `${w.who}: ${e}`));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
  });
} catch (e) {
  if (!(e instanceof StepFailed)) check('예상 밖 오류', false, String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await browser?.close().catch(() => {});
  await server.stop().catch(() => {});
}
console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
