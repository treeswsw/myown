// 라이어 한 판 스모크 (`npm test` 에 포함): 실제 서버(LIAR=on) + 빌드된 화면(dist/, ?nogl=1) + 창 3개, 실제 시간(약 90초).
// 갱식 클럽 로비에서 라이어게임 고르기 → 방 → ... (gamemine host/test/smoke-round.mjs 를 myown 로비·상단 줄에 맞춘 것)
// 로그인 → 방 → 시작 → 역할 카드 → 첫 설명 3번 → 지목 → 변론 → 찬반 → 정체 공개 → 정답 → 결과 → 다음 판 → 역할 확인.
// 보이는 글자·요소로만 판단한다. npm run build 가 먼저 필요하다. 실패하면 단계 이름과 캡처(SMOKE_SHOTS 폴더, 기본 임시 폴더)를 남긴다.
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
const shots = process.env.SMOKE_SHOTS || path.join(os.tmpdir(), 'smoke-round');
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
async function openPage(browser, url, who) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: false, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  await page.goto(`${url}/?nogl=1`);
  const w = { who, page, errors, seen: 0 };
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

// 보이는 버튼·입력의 중심점이 맨 위에 있어야 한다(skip: 일부러 덮이는 것의 선택자).
async function occlusion(w, state, skip = '') {
  await w.page.waitForTimeout(150);
  const bad = await w.page.evaluate((skipSel) => {
    const out = [];
    const desc = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
    for (const el of document.querySelectorAll('button, [role=button], .hit, input')) {
      if (skipSel && el.matches(skipSel)) continue;
      if (el.closest('[hidden]') || el.type === 'hidden' || el.hidden) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') continue; // 눌러서는 안 되는 때의 이름표 등(눌리면 .lg-vt-can 이 붙는다)
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width < 2 || r.height < 2) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
      // scrolled out of its scroll box (e.g. the settings panel): reachable by scrolling, not covered
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
  // 알려진 결함은 한 번만 따로 FAIL 로 적고 한 판은 계속 돌린다(끝날 때 실패로 끝남).
  const hard = [];
  for (const b of bad) {
    const m = b.startsWith('button.lg-role-btn') ? '구석 "내 제시어" 버튼' : b.startsWith('button.lg-rk-open') ? '"전체 랭킹" 버튼' : null;
    if (m) {
      const key = `${w.who}:${m}`;
      if (!softSeen.has(key)) { softSeen.add(key); check(w.who, `눌림(${m}, ${state}부터)`, false, b); }
    } else hard.push(b);
  }
  if (hard.length) throw new Error(`눌림 검사 실패(${w.who}, ${state}): ${hard.join('; ')}`);
}
const softSeen = new Set();
const occAll = async (state, skip) => { for (const w of wins) await occlusion(w, state, skip); };
const noErrors = (state) => {
  for (const w of wins) if (w.errors.length) throw new Error(`콘솔 오류(${w.who}, ${state}): ${w.errors.join(' | ')}`);
};

// 게임 중 채팅 칸은 접혀 있다: 채팅 버튼으로 연다. 보낸 뒤 다시 접는다.
async function say(w, text) {
  const btn = w.page.locator('.chat-btn');
  if (!(await w.page.locator('.chat-in').isVisible())) await btn.click();
  const box = w.page.locator('.chat-in');
  await box.waitFor({ state: 'visible' });
  await box.fill(text);
  await box.press('Enter');
  if (await box.isVisible()) await btn.click();
}
const title = (w) => w.page.locator('[data-lg="hud-title"]');
const waitTitle = async (w, text, timeout = T) => {
  await w.page.locator('[data-lg="hud-title"]', { hasText: text }).first().waitFor({ state: 'visible', timeout });
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

const server = await startServer({ LIAR: 'on' });
const url = server.http;
let browser;
const loginName = new Map();
try {
  browser = await chromium.launch();
  const A = await openPage(browser, url, 'A');
  const B = await openPage(browser, url, 'B');
  const C = await openPage(browser, url, 'C');
  const names = { A: uid('가'), B: uid('나'), C: uid('다') };
  const win = { A, B, C };

  await step('로그인 3명 → 방(A 방장) → B·C 참가', async () => {
    for (const w of wins) {
      await w.page.fill('.lb-field', names[w.who]);
      await w.page.click('button.lb-primary:has-text("입장")');
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    }
    await A.page.click('.lb-seg-item:has-text("라이어게임")');
    await A.page.click('button.lb-primary:has-text("방 만들기")');
    await A.page.locator('.lgbar-code').waitFor({ state: 'visible' });
    await A.page.locator('.lg-st-player', { hasText: names.A }).waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      await w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` }).click();
      await w.page.locator('.lg-st-player', { hasText: names[w.who] }).waitFor({ state: 'visible' });
    }
    await A.page.locator('.lg-st-player', { hasText: names.C }).waitFor({ state: 'visible' });
    await occAll('room (three players)');
  });

  await step('새로고침(F5) 뒤에도 라이어 화면 요소가 하나뿐이다 (C)', async () => {
    await C.page.reload();
    await C.page.locator('.lg-st-player', { hasText: names.C }).waitFor({ state: 'visible' });
    await C.page.waitForTimeout(500);
    const n = await C.page.evaluate(() => ({ root: document.querySelectorAll('.lg-root').length, hud: document.querySelectorAll('.lg-hud-root').length, rs: document.querySelectorAll('.lg-rs-root').length }));
    if (n.root !== 1 || n.hud > 1 || n.rs > 1) throw new Error(`중복 마운트: ${JSON.stringify(n)}`);
  });

  await step('방장이 시간 설정을 가장 짧은 값으로 고른다', async () => {
    for (const key of ['speak', 'discuss', 'rediscuss', 'defense', 'judge', 'guess']) {
      const first = A.page.locator(`[data-lg="st-time"][data-key="${key}"]`).first();
      await first.click();
      await A.page.locator(`[data-lg="st-time"][data-key="${key}"][aria-pressed="true"]`).first().waitFor({ state: 'visible' });
    }
  });

  await step('시작 → 세 창 역할 확인 화면', async () => {
    await A.page.locator('button.lgbar-btn', { hasText: '시작' }).click();
    for (const w of wins) await waitTitle(w, '역할 확인');
    await occAll('reveal', '[data-lg="rule-open"], [data-lg="rank-open"]');
    noErrors('reveal');
  });

  await step('역할 카드를 누르고 있는 동안만 제시어가 보인다 (세 창)', async () => {
    for (const w of wins) {
      const card = w.page.locator('[data-lg="role-card"]');
      const word = w.page.locator('[data-lg="role-word"]');
      await card.waitFor({ state: 'visible' });
      const box = await card.boundingBox();
      await w.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await w.page.mouse.down();
      await w.page.waitForFunction(() => {
        const e = document.querySelector('[data-lg="role-word"]');
        return e && e.textContent.trim().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      });
      await w.page.mouse.up();
      await w.page.waitForFunction(() => {
        const e = document.querySelector('[data-lg="role-card"]');
        return e && e.getAttribute('aria-pressed') !== 'true';
      });
    }
  });

  const said = [];
  for (let n = 1; n <= 3; n++) {
    await step(`첫 설명 ${n}번째: 차례인 사람만 글을 쓸 수 있고 hud 큰 글에 뜬다`, async () => {
      const sp = await anyWin((w) => w.page.getByText('당신의 발언시간입니다').first().isVisible(), 20000);
      for (const w of wins) if (w !== sp) {
        const dis = await w.page.locator('.chat-in').evaluate((e) => e.disabled || e.readOnly).catch(() => true);
        if (!dis) throw new Error(`차례가 아닌 ${w.who} 창의 채팅 칸이 잠기지 않음`);
      }
      const text = `설명${n}번입니다`;
      said.push({ id: sp.who, text });
      await say(sp, text);
      if (n < 3) {
        for (const w of wins) await w.page.locator('[data-lg="hud-said"]', { hasText: text }).waitFor({ state: 'visible' });
      } else {
        // 마지막 설명은 말하자마자 토론으로 넘어가므로 큰 글이 뜨는지 따로 본다(discuss 에서도 say 는 4초 보인다). 판은 계속 돌린다.
        for (const w of wins) {
          const ok = await w.page.locator('[data-lg="hud-said"]', { hasText: text }).waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
          if (!ok) check(w.who, '마지막(3번째) 첫 설명이 hud 큰 글에 뜸', false, '토론 단계로 넘어가 큰 글이 뜨지 않음');
        }
      }
      noErrors(`speak ${n}`);
    });
    await step(`첫 설명 ${n}번째: 눌림 검사`, async () => { await occAll(`speak ${n}`); });
  }

  await step('첫 발언 모음에 세 줄이 쌓인다', async () => {
    const w = wins[1];
    await w.page.locator('[data-lg="fs-open"]').click();
    await w.page.locator('[data-lg="fs-panel"]').waitFor({ state: 'visible' });
    await w.page.waitForFunction(() => document.querySelectorAll('[data-lg="fs-row"]').length >= 3);
    const rows = await w.page.locator('[data-lg="fs-row"]').allInnerTexts();
    for (const s of said) if (!rows.some((r) => r.includes(s.text))) throw new Error(`모음에 "${s.text}" 없음`);
    await w.page.locator('[data-lg="fs-close"]').click();
    await w.page.locator('[data-lg="fs-panel"]').waitFor({ state: 'hidden' });
  });

  // 지목: A 가 지목 대상이 되도록 B·C 가 A 를, A 는 B 를 고른다.
  await step('토론 단계: 이름 버튼으로 지목 (B·C → A, A → B)', async () => {
    for (const w of wins) await waitTitle(w, '투표 결과까지', 20000);
    await occAll('discuss');
    const idOf = async (w, name) => w.page.locator('[data-lg="tag"]', { hasText: name }).first().getAttribute('data-id');
    for (const [w, target] of [[B, 'A'], [C, 'A'], [A, 'B']]) {
      await w.page.locator('[data-lg="tag"]', { hasText: names[target] }).first().click();
    }
    for (const w of wins) {
      await w.page.locator('[data-lg="vote-status"], [data-lg="tally"], [data-lg="voted"]').first().waitFor({ state: 'attached' });
    }
    const t = await A.page.locator('[data-lg="tag"]', { hasText: names.A }).first().evaluate((e) => e.textContent);
    noErrors('discuss');
  });

  await step('투표 현황 글자: 모두 골랐다는 표시', async () => {
    await anyWin(async (w) => /3\s*\/\s*3/.test(await w.page.locator('[data-lg="voted"]').innerText()), 15000);
  });

  await step('변론: 지목된 A 만 글을 쓸 수 있다', async () => {
    for (const w of wins) await waitTitle(w, '최후 변론', 60000);
    await occAll('defense');
    for (const w of [B, C]) {
      const dis = await w.page.locator('.chat-in').evaluate((e) => e.disabled || e.readOnly);
      if (!dis) throw new Error(`${w.who} 창의 채팅 칸이 잠기지 않음`);
    }
    const dis = await A.page.locator('.chat-in').evaluate((e) => e.disabled || e.readOnly);
    if (dis) throw new Error('지목된 A 의 채팅 칸이 잠김');
    await say(A, '저는 아닙니다');
    for (const w of wins) await w.page.locator('[data-lg="hud-said"]', { hasText: '저는 아닙니다' }).waitFor({ state: 'visible' });
    noErrors('defense');
  });

  await step('찬반: 글자 버튼 "맞다" (B·C)', async () => {
    for (const w of wins) await waitTitle(w, '찬반 투표', 40000);
    await occAll('judge');
    for (const w of [B, C]) await w.page.locator('[data-lg="judge"][data-v="yes"]').click();
    noErrors('judge');
  });

  await step('판정(처형) → 정체 공개 글', async () => {
    for (const w of wins) await waitTitle(w, '처형', 20000);
    for (const w of wins) await waitTitle(w, '정체 공개', 20000);
    for (const w of wins) await w.page.locator('[data-lg="unmask"]').first().waitFor({ state: 'attached' });
    await occAll('unmask', '.lg-hud-end'); // 정체 공개는 화면 전체를 어둡게 덮는 것이 약속이라 "이 판 끝내기"는 제외
    noErrors('unmask');
  });

  let liarWin;
  await step('정답 맞히기: 라이어 창에서 정답을 입력한다', async () => {
    liarWin = await anyWin((w) => w.page.locator('[data-lg="guess-input"]').isVisible(), 30000);
    await occAll('guess');
    await liarWin.page.locator('[data-lg="guess-input"]').fill('아무거나');
    await liarWin.page.locator('[data-lg="guess-send"]').click();
    noErrors('guess');
  });

  await step('결과: 승자·점수·투표 내역', async () => {
    for (const w of wins) {
      await w.page.locator('[data-lg="result-winner"]').waitFor({ state: 'visible', timeout: 20000 });
      await w.page.locator('[data-lg="result"]').waitFor({ state: 'visible' });
    }
    const t = await A.page.locator('[data-lg="result-winner"]').innerText();
    if (!/라이어 승리|시민 승리|무효/.test(t)) throw new Error(`승자 글자가 이상함: ${t}`);
    const body = await A.page.locator('[data-lg="result"]').innerText();
    if (!/[+\-]?\d+/.test(body)) throw new Error('점수 숫자가 없음');
    if (!body.includes(names.A) || !body.includes(names.B)) throw new Error('투표 내역에 이름이 없음');
    await occAll('result', '.lg-rule-btn, .lg-fs-btn'); // 결과 창이 위쪽 규칙·첫 발언 버튼을 덮는다(창을 닫을 수 없는 단계)
    noErrors('result');
  });

  await step('"다음 판" → 세 창 역할 확인 화면', async () => {
    await A.page.locator('[data-lg="next"]').click();
    for (const w of wins) await waitTitle(w, '역할 확인');
    await occAll('reveal (2nd)', '[data-lg="rule-open"], [data-lg="rank-open"]');
    noErrors('reveal 2nd');
  });

  for (const w of wins) check(w.who, '브라우저 오류 없음', w.errors.length === 0, w.errors.join(' | '));
} catch (e) {
  if (!(e instanceof StepFailed)) { failed++; console.log(`FAIL unexpected: ${e.stack || e}`); }
} finally {
  await browser?.close().catch(() => {});
  await server.stop().catch(() => {});
}
console.log(failed ? `\nROUND SMOKE FAILED (${failed})` : '\nROUND SMOKE OK');
process.exit(failed ? 1 : 0);
