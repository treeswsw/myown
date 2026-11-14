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
async function occlusion(w, state, skip = '') {
  await w.page.waitForTimeout(200);
  const bad = await w.page.evaluate((skipSel) => {
    const out = [];
    const desc = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
    for (const el of document.querySelectorAll('button, [role=button], .hit, input')) {
      if (skipSel && el.matches(skipSel)) continue;
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
  }, skip);
  if (bad.length) throw new Error(`눌림 검사 실패(${w.who}, ${state}): ${bad.join('; ')}`);
}
const occAll = async (state, skip) => { for (const w of wins) await occlusion(w, state, skip); };
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
  const C = await openPage(browser, url, 'C', { width: 1024, height: 768 }); // iPad 가로 크기(휴대폰 배치는 쓰지 않는다)
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
    await A.page.locator('[data-rm="wait-code"]').waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      const row = w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.locator('b', { hasText: '갱식마인드' }).waitFor({ state: 'visible' });
      await row.click();
      await w.page.locator('.wr-players .lb-row', { hasText: names[w.who] }).waitFor({ state: 'visible' });
    }
    await A.page.locator('.wr-players .lb-row', { hasText: names.C }).waitFor({ state: 'visible' });
    const n = await A.page.locator('.wr-players .lb-row').count();
    if (n !== 3) throw new Error(`대기실 참가자 ${n}명`);
    await occAll('waiting room');
    noErrors('waiting');
  });

  await step('새로고침(F5) 뒤에도 그리기 화면 요소가 하나뿐이다 (C)', async () => {
    await C.page.reload();
    await C.page.locator('.wr-players .lb-row', { hasText: names.C }).waitFor({ state: 'visible' });
    await C.page.waitForTimeout(400);
    const n = await C.page.evaluate(() => ({ root: document.querySelectorAll('.dr-root').length, wait: document.querySelectorAll('.wr-root').length }));
    if (n.root > 1 || n.wait !== 1) throw new Error(`중복 마운트: ${JSON.stringify(n)}`);
  });

  await step('방장이 라운드 1·그리는 시간 60초로 고르고 시작한다 → 세 창 단계가 넘어감', async () => {
    const opt = (w, label, text) => w.page.locator('.wr-f', { hasText: label }).locator('.wr-opt', { hasText: new RegExp(`^${text}$`) });
    await opt(A, '라운드 수', '1').click();
    await A.page.locator('.wr-f', { hasText: '라운드 수' }).locator('.wr-opt[aria-checked="true"]', { hasText: /^1$/ }).waitFor({ state: 'visible' });
    await opt(B, '라운드 수', '1').isDisabled().then((d) => { if (!d) throw new Error('방장이 아닌 사람이 설정을 바꿀 수 있음'); });
    await opt(A, '그리는 시간', '1분').click();
    await opt(A, '출제 순서', '순서대로').click();
    await A.page.locator('[data-rm="wait-start"]:not([disabled])').click();
    for (const w of wins) await w.page.locator('.wr-root').waitFor({ state: 'hidden' });
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

  await step('1번째 문제: 맞히는 사람의 기본 이모티콘이 모든 창에 보인다 (그리는 사람 창 포함)', async () => {
    const { drawer, guessers } = q1;
    const [g1] = guessers;
    await g1.page.locator('[data-rm="bar-emote"]').click();
    await g1.page.locator('.ep-btn.glyph').first().click();
    for (const w of [drawer, ...guessers]) await w.page.locator('.rm-em').first().waitFor({ state: 'visible', timeout: 4000 });
    await g1.page.mouse.click(5, 400); // 이모티콘 창은 바깥을 누르면 닫힌다
    noErrors('emote');
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

  await step('1번째 문제: 손바닥 방지 버튼 — 켜짐(기본) → 끄면 눌림 해제 → 다시 켜짐', async () => {
    const palm = q1.drawer.page.locator('button[aria-label="손바닥 방지"]').first();
    const pressed = () => palm.getAttribute('aria-pressed');
    if ((await pressed()) !== 'true') throw new Error('손바닥 방지가 기본 켜짐이 아님');
    await palm.click();
    if ((await pressed()) !== 'false') throw new Error('끄기가 반영되지 않음');
    await palm.click();
    if ((await pressed()) !== 'true') throw new Error('다시 켜기가 반영되지 않음');
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

  await step('최종 순위(공통 결과): 세 창 모두 이름·점수·코인, 프로필 사진 부품, 눌림 검사', async () => {
    for (const w of wins) await w.page.locator('[data-rm="result"]').waitFor({ state: 'visible', timeout: 20000 });
    for (const w of wins) {
      const t = await w.page.locator('[data-rm="result"]').innerText();
      for (const n of Object.values(names)) if (!t.includes(n)) throw new Error(`최종 순위에 ${n} 없음`);
      if (!/맞힘 \d+/.test(t)) throw new Error('맞힌 횟수 글자가 없음');
      const av = await w.page.locator('[data-rm="result"] .ui-avbox').count(); // 공용 프로필 부품
      if (av < 3) throw new Error(`${w.who}: 최종 순위에 공용 프로필 부품이 ${av}개`);
      // SPEC 22: 끝까지 한 세 사람 모두 코인을 받고, 모두의 것이 보인다
      const paid = await w.page.locator('[data-rm="result"] .rm-rs-gain:not(.rm-rs-zero)').count();
      if (paid !== 3) throw new Error(`${w.who}: 코인 받은 줄 ${paid}`);
    }
    await occAll('final', ':not(.rm-rs-root *)'); // 결과 패널이 판 위를 덮는다: 패널 안 버튼만 본다
    noErrors('final');
  });

  await step('최종 순위에서 나가기 → 확인 없이 로비로 돌아온다 (C)', async () => {
    await C.page.locator('[data-rm="result-leave"]').click();
    await C.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    const left = await C.page.evaluate(() => ({ root: document.querySelectorAll('.dr-root:not([hidden])').length, bar: !!document.querySelector('.rm-bar:not([hidden])') }));
    if (left.root || left.bar) throw new Error(`나간 뒤 화면이 남음: ${JSON.stringify(left)}`);
  });

  await step('최종 순위 → 대기실로: 방장 A 가 대기실에서 다시 시작할 수 있고 대기실 채팅이 된다 (A·B)', async () => {
    await B.page.locator('[data-rm="result-wait"]').click();
    await B.page.locator('[data-rm="wait-start"]').waitFor({ state: 'attached' });
    await B.page.locator('.wr-root').waitFor({ state: 'visible' });
    await B.page.locator('[data-rm="wait-start"]').waitFor({ state: 'hidden' }); // 방장이 아니면 시작 버튼이 없다
    await A.page.locator('[data-rm="result-wait"]').click();
    await A.page.locator('.wr-root').waitFor({ state: 'visible' });
    // 최종 순위의 40자 규칙: 입력칸이 40자에서 멈춘다
    const inp = B.page.locator('.wr-chat .chat-in');
    await inp.fill('나'.repeat(50));
    const n = await inp.evaluate((e) => [...e.value].length);
    if (n !== 40) throw new Error(`대기실 채팅 입력이 ${n}자`);
    await inp.fill('hello-after-game');
    await inp.press('Enter');
    await A.page.locator('.wr-chat .chat-row', { hasText: 'hello-after-game' }).waitFor({ state: 'visible' });
    await occlusion(A, 'wait room after game');
    await occlusion(B, 'wait room after game');
  });

  await step('두 번째 판: A 가 대기실에서 시작(2명) → 단어 카드가 나타난다', async () => {
    await A.page.locator('[data-rm="wait-start"]:not([disabled])').click();
    for (const w of [A, B]) await w.page.locator('.wr-root').waitFor({ state: 'hidden' });
    const drawer = await anyWin((w) => w.page.locator('.dr-rs-word').first().isVisible(), 20000);
    if (!drawer) throw new Error('그리는 사람 없음');
    noErrors('restart');
  });

  await step('게임 중 나가기는 확인을 먼저 묻고(취소하면 남음), 나가면 A 는 대기실로 (B 가 나감)', async () => {
    await B.page.locator('[data-rm="bar-leave"]').click();
    await B.page.locator('.ui-confirm', { hasText: '코인을 받지 못해요' }).waitFor({ state: 'visible' });
    await B.page.locator('.ui-mbtn', { hasText: '취소' }).click();
    await B.page.locator('.dr-root').waitFor({ state: 'visible' });
    await B.page.locator('[data-rm="bar-leave"]').click();
    await B.page.locator('.ui-mbtn.ui-danger').click();
    await B.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    // 혼자 남아 판이 끝나도 공통 결과(코인 0)가 보이고, 대기실로 가면 대기실
    await A.page.locator('[data-rm="result"] .rm-rs-zero').waitFor({ state: 'visible' });
    await A.page.locator('[data-rm="result-wait"]').click();
    await A.page.locator('.wr-root').waitFor({ state: 'visible' });
  });

  await step('그리기 방을 나간 뒤 포커 방을 만들면 사이트 채팅 버튼이 보인다 (C)', async () => {
    await A.page.locator('[data-rm="wait-leave"]').click();
    await A.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    await C.page.click('.lb-seg-item:has-text("텍사스 홀덤")');
    await C.page.click('button.lb-primary:has-text("방 만들기")');
    for (const w of [A, B]) {
      await w.page.click('.lb-seg-item:has-text("텍사스 홀덤")').catch(() => {});
      const row = w.page.locator('.lb-room-row', { hasText: `${names.C}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.click();
    }
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
