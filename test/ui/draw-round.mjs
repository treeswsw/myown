// 갱식마인드 한 판 스모크 (`npm test` 에 포함): 실제 서버(DRAW=test) + 빌드된 화면(dist/, ?nogl=1&draw=1) + 창 3개.
// 로그인 → 방 만들기 → 두 명 입장 → 설정(1라운드) → 시작 → 단어 카드 → 선 긋기 → 다른 창 그림판에 선이 도착 → 되돌리기·다시 하기
// → 정답 입력 → 정답 공개 → 포기로 다음 문제 → 최종 순위. 보이는 글자·캔버스 픽셀 수로만 판단한다(그림 비교 없음).
// 라이어 한 판(liar-round.mjs)과 같은 방식. npm run build 가 먼저 필요하다. 실패하면 단계 이름과 캡처(SMOKE_SHOTS 폴더)를 남긴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../e2e/helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('FAIL: dist/ 가 없습니다. 먼저 npm run build');
  process.exit(1);
}
const shots = process.env.SMOKE_SHOTS || path.join(os.tmpdir(), 'smoke-draw-round');
fs.mkdirSync(shots, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const T = 8000;
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 6)}`;
let failed = 0;
const check = (who, what, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${who}] ${what}${detail ? ` - ${detail}` : ''}`);
  return ok;
};
class StepFailed extends Error {}

const wins = [];
async function openPage(browser, url, who, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // 받은 drSt(새 선 시작) 개수를 센다(빠르게 연속으로 그은 선이 다 오는지 보는 단계용)
  await ctx.addInitScript(() => {
    const WS = window.WebSocket;
    window.__drSt = 0;
    window.WebSocket = class extends WS {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (ev) => {
          if (typeof ev.data !== 'string') return;
          if (ev.data.includes('"k":"drSt"')) window.__drSt++;
          // 받은 room.state 를 남긴다(못 맞힌 사람에게 word 가 오는지 서버 메시지로 확인)
          if (ev.data.startsWith('{"t":"room"')) { try { window.__drRoom = JSON.parse(ev.data).state; } catch { /* 무시 */ } }
        });
      }
    };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  await page.goto(`${url}/?nogl=1&draw=1`);
  const w = { who, page, errors };
  wins.push(w);
  return w;
}

let stepNo = 0;
async function step(what, fn) {
  stepNo++;
  try { await fn(); check('*', what, true); } catch (e) {
    check('*', what, false, String(e.message || e).split('\n').slice(0, process.env.SMOKE_VERBOSE ? 12 : 1).join(' | '));
    for (const w of wins) {
      const f = path.join(shots, `fail-${String(stepNo).padStart(2, '0')}-${w.who}.png`);
      await w.page.screenshot({ path: f }).catch(() => {});
      const txt = await w.page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
      console.log(`      [${w.who}] 캡처 ${f}\n      [${w.who}] 화면 글자: ${txt.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    throw new StepFailed(what);
  }
}

// 보이는 버튼·입력의 중심점이 맨 위에 있어야 한다.
async function occlusion(w, state) {
  await w.page.waitForTimeout(200);
  const bad = await w.page.evaluate(() => {
    const out = [];
    const desc = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
    for (const el of document.querySelectorAll('button, [role=button], .hit, input')) {
      if (el.closest('[hidden]') || el.type === 'hidden' || el.hidden) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') continue;
      let op = 1;
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || op < 0.1 || r.width < 2 || r.height < 2) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body && !clipped; p = p.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) continue;
        const b = p.getBoundingClientRect();
        clipped = cx < b.left || cx >= b.right || cy < b.top || cy >= b.bottom;
      }
      if (clipped) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && (top === el || el.contains(top))) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 14);
      out.push(`${desc(el)} "${label}" at (${Math.round(cx)},${Math.round(cy)}) is covered by ${top ? desc(top) : 'nothing'}`);
    }
    return out;
  });
  if (bad.length) throw new Error(`눌림 검사 실패(${w.who}, ${state}): ${bad.join('; ')}`);
}
const occAll = async (state) => { for (const w of wins) await occlusion(w, state); };
const noErrors = (state) => {
  for (const w of wins) if (w.errors.length) throw new Error(`콘솔 오류(${w.who}, ${state}): ${w.errors.join(' | ')}`);
};

// 누군가의 창에서 조건이 될 때까지 기다려 그 창을 돌려준다.
async function anyWin(pred, timeout = T) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const w of wins) if (await pred(w).catch(() => false)) return w;
    await wins[0].page.waitForTimeout(100);
  }
  throw new Error('조건을 만족하는 창이 없음');
}

// 그림판에서 종이색이 아닌 픽셀 수
const inkCount = (w) => w.page.evaluate(() => {
  const c = document.querySelector('.dr-cv-paper');
  if (!c || !c.width) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) n++;
  return n;
});
const waitInk = async (w, pred, what, timeout = 5000) => {
  const end = Date.now() + timeout;
  let n = -1;
  while (Date.now() < end) { n = await inkCount(w); if (pred(n)) return n; await w.page.waitForTimeout(80); }
  throw new Error(`${w.who} 그림판 잉크 픽셀 ${n}: ${what}`);
};

async function stroke(w) {
  const box = await w.page.locator('.dr-cv-paper').boundingBox();
  const x = (f) => box.x + box.width * f;
  const y = (f) => box.y + box.height * f;
  await w.page.mouse.move(x(0.2), y(0.3));
  await w.page.mouse.down();
  for (let i = 1; i <= 24; i++) await w.page.mouse.move(x(0.2 + i * 0.025), y(0.3 + Math.sin(i / 4) * 0.12), { steps: 2 });
  await w.page.mouse.up();
}

const server = await startServer({ DRAW: 'test' });
const url = server.http;
let browser;
try {
  browser = await chromium.launch();
  const A = await openPage(browser, url, 'A', { width: 1280, height: 800 });
  const B = await openPage(browser, url, 'B', { width: 1280, height: 800 });
  const C = await openPage(browser, url, 'C', { width: 844, height: 390 });
  const names = { A: uid('가'), B: uid('나'), C: uid('다') };
  const win = { A, B, C };

  await step('로그인 3명 → 갱식마인드 방(A 방장) → B·C 참가', async () => {
    for (const w of wins) {
      await w.page.fill('.lb-field', names[w.who]);
      await w.page.click('button.lb-primary:has-text("입장")');
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
      await w.page.waitForSelector('.lb-seg-item:has-text("갱식마인드")', { state: 'visible' });
    }
    await A.page.click('.lb-seg-item:has-text("갱식마인드")');
    await A.page.click('button.lb-primary:has-text("방 만들기")');
    await A.page.locator('.dr-st-code').waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      const row = w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.locator('b', { hasText: '갱식마인드' }).waitFor({ state: 'visible' });
      await row.click();
      await w.page.locator('.dr-st-player', { hasText: names[w.who] }).waitFor({ state: 'visible' });
    }
    await A.page.locator('.dr-st-player', { hasText: names.C }).waitFor({ state: 'visible' });
    // 방 코드는 상단 줄과 설정 화면에 같은 값
    const top = (await A.page.locator('.lgbar-code').innerText()).replace('방 코드', '').trim();
    const st = (await A.page.locator('[data-dr="st-code"]').innerText()).trim();
    if (!top || !st.includes(top)) throw new Error(`방 코드 불일치: 상단 "${top}" / 설정 "${st}"`);
    await occAll('waiting room');
    noErrors('waiting');
  });

  await step('새로고침(F5) 뒤에도 그리기 화면 요소가 하나뿐이다 (C)', async () => {
    await C.page.reload();
    await C.page.locator('.dr-st-player', { hasText: names.C }).waitFor({ state: 'visible' });
    await C.page.waitForTimeout(400);
    const n = await C.page.evaluate(() => ({ root: document.querySelectorAll('.dr-root').length, st: document.querySelectorAll('.dr-st-root').length }));
    if (n.root !== 1 || n.st > 1) throw new Error(`중복 마운트: ${JSON.stringify(n)}`);
  });

  await step('방장이 라운드 1·그리는 시간 60초로 고르고 시작한다 → 세 창 단계가 넘어감', async () => {
    await A.page.locator('[data-dr="st-rounds"][data-v="1"]').click();
    await A.page.locator('[data-dr="st-rounds"][data-v="1"][aria-pressed="true"]').waitFor({ state: 'visible' });
    await A.page.locator('[data-dr="st-time"][data-v="60"]').click();
    await A.page.locator('[data-dr="st-order"]').nth(0).click();
    await A.page.locator('[data-dr="st-start"]:not([disabled])').click();
    for (const w of wins) await w.page.locator('.dr-st-root').waitFor({ state: 'hidden' });
    noErrors('start');
  });

  // ---- 한 문제 진행: 그리는 사람 찾기 → 카드 고르기 ----
  const asked = [];
  async function pickAndGetWord() {
    const drawer = await anyWin((w) => w.page.locator('.dr-rs-word').first().isVisible(), 20000);
    await occAll(`pick (${asked.length + 1}번째 문제)`);
    for (const w of wins) if (w !== drawer) {
      const cards = await w.page.locator('.dr-rs-word').count();
      if (cards) throw new Error(`그리는 사람이 아닌 ${w.who} 창에 단어 카드가 보임`);
    }
    const cardWords = await drawer.page.locator('.dr-rs-word .dr-rs-w').allInnerTexts();
    if (cardWords.length !== 3) throw new Error(`단어 카드가 ${cardWords.length}장`);
    await drawer.page.locator('.dr-rs-word').first().click();
    await drawer.page.locator('.dr-hud-word').waitFor({ state: 'visible' });
    const word = (await drawer.page.locator('.dr-hud-word').innerText()).trim();
    if (!cardWords.some((c) => c.trim() === word)) throw new Error(`고른 단어 "${word}" 가 카드 ${cardWords} 에 없음`);
    // 맞히는 사람 화면에는 단어 대신 칸만, 입력 칸이 있다
    for (const w of wins) if (w !== drawer) {
      await w.page.locator('.dr-hud-mask, .dr-hud-note').first().waitFor({ state: 'visible' });
      const txt = await w.page.evaluate(() => document.querySelector('.dr-root').innerText);
      if (txt.includes(word)) throw new Error(`맞히는 ${w.who} 창에 단어 "${word}" 가 보임`);
      await w.page.locator('.dr-hud-input').waitFor({ state: 'visible' });
    }
    asked.push({ drawer: drawer.who, word });
    return { drawer, word, guessers: wins.filter((w) => w !== drawer) };
  }

  let q1;
  await step('1번째 문제: 그리는 사람만 단어 카드 3장 → 고르면 나머지는 칸만 보인다', async () => { q1 = await pickAndGetWord(); noErrors('pick1'); });

  await step('1번째 문제: 그림판에 선을 그으면 다른 두 창 그림판에 선이 나타난다', async () => {
    const { drawer, guessers } = q1;
    await occAll('draw (tools)');
    const before = await Promise.all(guessers.map(inkCount));
    if (before.some((n) => n > 0)) throw new Error(`그리기 전에 이미 잉크가 있음: ${before}`);
    await stroke(drawer);
    await waitInk(drawer, (n) => n > 50, '그린 사람 화면');
    for (const g of guessers) await waitInk(g, (n) => n > 50, '선이 도착하지 않음');
    noErrors('stroke');
  });

  await step('1번째 문제: 되돌리기 → 모두 그림이 사라지고, 다시 하기 → 모두 돌아온다', async () => {
    const { drawer, guessers } = q1;
    const undo = drawer.page.locator('button[aria-label="되돌리기"]').first();
    const redo = drawer.page.locator('button[aria-label="다시 하기"]').first();
    await undo.click();
    await waitInk(drawer, (n) => n === 0, '되돌린 뒤 그린 사람 화면');
    for (const g of guessers) await waitInk(g, (n) => n === 0, '되돌리기가 전해지지 않음');
    await redo.click();
    await waitInk(drawer, (n) => n > 50, '다시 하기 뒤 그린 사람 화면');
    for (const g of guessers) await waitInk(g, (n) => n > 50, '다시 하기가 전해지지 않음');
  });

  // 실기기 버그: 펜을 떼고 곧바로 다시 대면 새 선이 씹힘. 쉬지 않고 짧은 선 10개를 그어 보는 사람 모두에게 drSt 10개가 오는지.
  await step('1번째 문제: 마우스·터치로 짧은 선을 쉬지 않고 10개씩 → 보는 사람 모두에게 선 10개씩 도착', async () => {
    const { drawer, guessers } = q1;
    const box = await drawer.page.locator('.dr-cv-paper').boundingBox();
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    const counts = () => Promise.all(guessers.map((g) => g.page.evaluate(() => window.__drSt || 0)));
    const waitCounts = async (want, what) => {
      const end = Date.now() + 5000;
      let got = [];
      while (Date.now() < end) { got = await counts(); if (got.every((n, i) => n >= want[i])) return; await drawer.page.waitForTimeout(80); }
      throw new Error(`${what}: 받은 drSt ${got} (기대 ${want})`);
    };
    const base0 = await counts();
    for (let k = 0; k < 10; k++) { // 마우스: 누름 → 두 번 움직임 → 뗌, 바로 다음 선
      const a = at(0.1 + k * 0.08, 0.62);
      await drawer.page.mouse.move(a.x, a.y);
      await drawer.page.mouse.down();
      await drawer.page.mouse.move(a.x + 8, a.y + 20);
      await drawer.page.mouse.move(a.x + 14, a.y + 40);
      await drawer.page.mouse.up();
    }
    await waitCounts(base0.map((n) => n + 10), '마우스 10선');
    const base1 = await counts();
    const cdp = await drawer.page.context().newCDPSession(drawer.page);
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4 }] : [] });
    for (let k = 0; k < 10; k++) { // 터치: 손가락을 떼자마자 다시 댄다
      const a = at(0.1 + k * 0.08, 0.82);
      await touch('touchStart', a);
      await touch('touchMove', { x: a.x + 8, y: a.y + 15 });
      await touch('touchMove', { x: a.x + 14, y: a.y + 30 });
      await touch('touchEnd', null);
    }
    await waitCounts(base1.map((n) => n + 10), '터치 10선');
    await cdp.detach().catch(() => {});
    noErrors('rapid strokes');
  });

  await step('1번째 문제: 맞히는 사람 한 명이 정답을 입력 → 정답 표시, 두 번째도 맞히면 정답 공개', async () => {
    const { drawer, word, guessers } = q1;
    const [g1, g2] = guessers;
    // 오답은 자모만 쓴다(단어에는 자모가 없다). 예전 '절대아닌말' 은 단어가 '말'·'절'일 때 채팅 줄에 걸려 거짓 실패가 났다.
    await g1.page.locator('.dr-hud-input').fill('ㅁㄴㅇㄹ');
    await g1.page.locator('.dr-hud-input').press('Enter');
    await g1.page.waitForTimeout(300);
    await g1.page.locator('.dr-hud-input').fill(word);
    await g1.page.locator('.dr-hud-input').press('Enter');
    // 맞힌 사람 화면: 단어가 보인다(맞힘 표시). 그리는 사람 화면: 맞힌 사람 칸에 정답 표시
    await g1.page.locator('.dr-hud-word', { hasText: word }).waitFor({ state: 'visible' });
    await drawer.page.locator('.dr-pl-hit, .dr-hud-hit', { hasText: /정답|맞힘/ }).first().waitFor({ state: 'attached' });
    // 못 맞힌 사람(g2) 화면에는 단어가 아직 없다
    const g2st = await g2.page.evaluate(() => { const s = window.__drRoom; return s ? { phase: s.phase, word: s.word, drawerId: s.drawerId, you: s.you } : null; });
    if (!g2st || g2st.phase !== 'draw' || g2st.word != null) throw new Error(`못 맞힌 사람이 받은 상태에 단어가 있음: ${JSON.stringify(g2st)}`);
    if (await g2.page.locator('.dr-hud-word').count()) throw new Error('못 맞힌 사람 문제 띠에 단어가 보임');
    const g2txt = await g2.page.evaluate(() => document.querySelector('.dr-root').innerText);
    if (g2txt.includes(word)) throw new Error(`못 맞힌 사람 화면에 단어가 보임: ${g2txt.replace(/\s+/g, ' ').slice(0, 300)}`);
    await g2.page.locator('.dr-hud-input').fill(word);
    await g2.page.locator('.dr-hud-input').press('Enter');
    for (const w of wins) await w.page.locator('.dr-rs-answer', { hasText: word }).waitFor({ state: 'visible', timeout: 15000 });
    noErrors('guess');
  });

  await step('1번째 문제: 정답 공개 화면(맞힌 사람 점수, 눌림 검사)', async () => {
    for (const w of wins) {
      const gains = await w.page.locator('.dr-rs-gains').innerText();
      if (!/\d/.test(gains)) throw new Error(`점수 숫자가 없음: ${gains}`);
    }
    await occAll('reveal');
  });

  let q2;
  await step('2번째 문제: 단어 고르고 → 그리는 사람이 포기 버튼 → 정답 공개', async () => {
    q2 = await pickAndGetWord();
    await occAll('draw (2nd)');
    await q2.drawer.page.locator('button[aria-label="포기"]').click();
    for (const w of wins) await w.page.locator('.dr-rs-answer', { hasText: q2.word }).waitFor({ state: 'visible', timeout: 15000 });
    noErrors('giveup2');
  });

  await step('3번째 문제: 단어 고르고 → 포기 → 정답 공개', async () => {
    const q3 = await pickAndGetWord();
    await q3.drawer.page.locator('button[aria-label="포기"]').click();
    for (const w of wins) await w.page.locator('.dr-rs-answer', { hasText: q3.word }).waitFor({ state: 'visible', timeout: 15000 });
    const ids = new Set(asked.map((a) => a.drawer));
    if (ids.size !== 3) throw new Error(`한 라운드에 같은 사람이 두 번 그림: ${asked.map((a) => a.drawer)}`);
  });

  await step('최종 순위: 세 창 모두 이름과 점수, 눌림 검사', async () => {
    for (const w of wins) await w.page.locator('.dr-rs-final-title').waitFor({ state: 'visible', timeout: 20000 });
    for (const w of wins) {
      const t = await w.page.locator('.dr-rs-final').innerText();
      for (const n of Object.values(names)) if (!t.includes(n)) throw new Error(`최종 순위에 ${n} 없음`);
      if (!/\d+점/.test(t)) throw new Error('점수 글자가 없음');
    }
    await occAll('final');
    noErrors('final');
  });

  await step('최종 순위에서 나가기 → 로비로 돌아온다 (C)', async () => {
    await C.page.locator('.dr-rs-btn', { hasText: '나가기' }).click();
    await C.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    await C.page.locator('.dr-root').waitFor({ state: 'hidden' }).catch(() => {});
    const left = await C.page.evaluate(() => ({ root: document.querySelectorAll('.dr-root:not([hidden])').length, bar: !document.querySelector('.lgbar')?.hidden }));
    if (left.root || left.bar) throw new Error(`나간 뒤 화면이 남음: ${JSON.stringify(left)}`);
  });

  // ---- 두 번째 판: 휴대폰 가로(C)의 ≡ 메뉴로 나가기 → 로비 → 포커 방에서 사이트 채팅 버튼이 다시 보인다 ----
  await step('두 번째 방: A·B 나가기 → A 새 방 → B·C 참가 → 시작 (C 는 휴대폰 가로)', async () => {
    for (const w of [A, B]) {
      await w.page.locator('.dr-rs-btn', { hasText: '나가기' }).click();
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    }
    await A.page.click('.lb-seg-item:has-text("갱식마인드")');
    await A.page.click('button.lb-primary:has-text("방 만들기")');
    await A.page.locator('.dr-st-code').waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      const row = w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.click();
      await w.page.locator('.dr-st-player', { hasText: names[w.who] }).waitFor({ state: 'visible' });
    }
    await A.page.locator('[data-dr="st-start"]:not([disabled])').click();
    for (const w of [A, B, C]) await w.page.locator('.dr-st-root').waitFor({ state: 'hidden' });
  });

  await step('휴대폰 가로 게임 중: ≡ 메뉴 → 이모티콘 패널 열림 → 다시 ≡ → 나가기 → 로비', async () => {
    const m = C.page.locator('[data-dr="menu"]');
    await m.waitFor({ state: 'visible' });
    await m.click();
    await C.page.locator('[data-dr="menu-leave"]').waitFor({ state: 'visible' });
    await C.page.locator('[data-dr="menu-emote"]').waitFor({ state: 'visible' });
    const covered = await C.page.evaluate(() => ['menu-emote', 'menu-leave'].filter((k) => { // 메뉴가 열리면 뒤판이 나머지를 덮는 것이 정상이므로 메뉴 항목만 본다
      const e = document.querySelector(`[data-dr="${k}"]`); const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(t && (t === e || e.contains(t)));
    }));
    if (covered.length) throw new Error(`눌림 검사 실패(C, phone menu open): ${covered}`);
    await C.page.screenshot({ path: path.join(shots, 'phone-menu.png') });
    await C.page.locator('[data-dr="menu-emote"]').click();
    await C.page.locator('.lgpanel').waitFor({ state: 'visible' });
    await C.page.mouse.click(300, 60); // 바깥을 눌러 패널을 닫는다
    await C.page.locator('.lgpanel').waitFor({ state: 'detached' });
    await m.click();
    await C.page.locator('[data-dr="menu-leave"]').click();
    await C.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    const left = await C.page.evaluate(() => ({ root: document.querySelectorAll('.dr-root:not([hidden])').length, bar: !!document.querySelector('.lgbar') && !document.querySelector('.lgbar').hidden }));
    if (left.root || left.bar) throw new Error(`나간 뒤 화면이 남음: ${JSON.stringify(left)}`);
    await occlusion(C, 'lobby after menu leave');
  });

  await step('그리기 방을 나간 뒤 포커 방을 만들면 사이트 채팅 버튼이 보인다 (C)', async () => {
    await C.page.click('.lb-seg-item:has-text("텍사스 홀덤")');
    await C.page.click('button.lb-primary:has-text("방 만들기")');
    // 포커 대기실에서는 사이트 채팅 버튼이 원래 숨겨져 있다(대기실 방식). 게임이 시작되면 보여야 한다.
    for (const w of [A, B]) {
      await w.page.locator('button.lgbar-btn', { hasText: '나가기' }).click();
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
      const row = w.page.locator('.lb-room-row', { hasText: `${names.C}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.click();
    }
    await C.page.locator('.lb-player, .lb-seat, .lb-pl', { hasText: names.A }).first().waitFor({ state: 'attached' }).catch(() => {});
    await C.page.locator('button:has-text("게임 시작"):not([disabled])').click();
    await C.page.locator('.chat-btn').waitFor({ state: 'visible' });
    await occlusion(C, 'poker room chat button');
    noErrors('poker after draw');
  });

  for (const w of wins) check(w.who, '브라우저 오류 없음', w.errors.length === 0, w.errors.join(' | '));
} catch (e) {
  if (!(e instanceof StepFailed)) { failed++; console.log(`FAIL unexpected: ${e.stack || e}`); }
} finally {
  await browser?.close().catch(() => {});
  await server.stop().catch(() => {});
}
console.log(failed ? `\nDRAW ROUND FAILED (${failed})` : '\nDRAW ROUND OK');
process.exit(failed ? 1 : 0);
