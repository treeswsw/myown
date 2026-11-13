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
const wordOf = {}; // 각 창이 역할 카드에서 본 제시어 (창 이름 → 글)
// 화면 크기: 기본 가로 폰(844×390). LG_VP=1000x750 이면 iPad 가로.
const VP = (() => { const m = /^(\d+)x(\d+)$/.exec(process.env.LG_VP || ''); return m ? { width: +m[1], height: +m[2] } : { width: 844, height: 390 }; })();
async function openPage(browser, url, who) {
  const ctx = await browser.newContext({ viewport: VP, hasTouch: false, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // SPEC 22-12: remember the {t:'coin',a:'got'} message (the "+N 코인" toast only lasts 2.5 s)
  await ctx.addInitScript(() => {
    const WS = window.WebSocket;
    window.__coinGot = 0;
    window.WebSocket = class extends WS {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (ev) => {
          if (typeof ev.data !== 'string' || !ev.data.startsWith('{"t":"coin"')) return;
          try { const m = JSON.parse(ev.data); if (m.a === 'got') window.__coinGot += Number(m.n) || 0; } catch { /* ignore */ }
        });
      }
    };
  });
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
  // 고정 자리끼리 겹침(1절 자리 약속): 상단 줄·끝내기·최근 기록·현황판·채팅 칸·조작 줄 내용
  const overlaps = await w.page.evaluate(() => {
    const sels = ['.rm-bar', '.lg-hud-endbox', '.chat-sheet', '.lg-vt-board', '.chat-bar', '.lg-action > *'];
    const boxes = [];
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[hidden]') || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.textContent.trim() && !el.querySelector('input')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      boxes.push({ sel, r });
    }
    const out = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (boxes[i].sel === boxes[j].sel) continue;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${boxes[i].sel} × ${boxes[j].sel}`);
    }
    return out;
  });
  bad.push(...overlaps.map((o) => `겹침 ${o}`));
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

// 게임 중 채팅은 사이트 채팅 버튼 뒤에 있다. 내 입력 차례(첫 설명·최후 변론)가 오면 채팅 칸이 저절로 열린다.
async function say(w, text) {
  const box = w.page.locator('.chat-in');
  if (!(await box.isVisible())) await w.page.locator('.chat-btn').click();
  await box.waitFor({ state: 'visible' });
  await box.fill(text);
  await box.press('Enter');
  await w.page.waitForFunction(() => document.querySelector('.chat-in')?.value === '', null, { timeout: 5000 }).catch(() => {
    throw new Error(`${w.who}: 글이 보내지지 않음(${text})`);
  });
}
const chatBarOk = async (w, state) => {
  const r = await w.page.evaluate(() => {
    const b = document.querySelector('.chat-btn');
    const vis = (e) => e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return { btn: vis(b) };
  });
  if (!r.btn) throw new Error(`${w.who} ${state}: 게임 중인데 사이트 채팅 버튼(.chat-btn)이 안 보임`);
};
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

async function until(fn, label, timeout = T) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return;
    await wins[0].page.waitForTimeout(100);
  }
  throw new Error(`시간 안에 안 됨: ${label}`);
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
    await A.page.locator('[data-rm="wait-start"]').waitFor({ state: 'visible' });
    await A.page.locator('.wr-players li', { hasText: names.A }).waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      await w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` }).click();
      await w.page.locator('.wr-players li', { hasText: names[w.who] }).waitFor({ state: 'visible' });
    }
    await A.page.locator('.wr-players li', { hasText: names.C }).waitFor({ state: 'visible' });
    await occAll('room (three players)');
  });

  await step('새로고침(F5) 뒤에도 라이어 화면 요소가 하나뿐이다 (C)', async () => {
    await C.page.reload();
    await C.page.locator('.wr-players li', { hasText: names.C }).waitFor({ state: 'visible' });
    await C.page.waitForTimeout(500);
    const n = await C.page.evaluate(() => ({ root: document.querySelectorAll('.lg-root').length, hud: document.querySelectorAll('.lg-hud-root').length, rs: document.querySelectorAll('.lg-rs-root').length }));
    if (n.root !== 1 || n.hud > 1 || n.rs > 1) throw new Error(`중복 마운트: ${JSON.stringify(n)}`);
  });

  await step('방장이 시간 설정을 가장 짧은 값으로 고른다', async () => {
    for (const label of ['첫 설명', '토론·투표', '살린 뒤 토론', '최후 변론', '찬반 투표', '정답 맞히기']) {
      await A.page.locator(`.wr-seg[aria-label="${label}"] .wr-opt`).first().click();
      await A.page.locator(`.wr-seg[aria-label="${label}"] .wr-opt:first-child[aria-checked="true"]`).waitFor({ state: 'visible' });
    }
    // 다른 사람의 대기실에도 방장이 고른 값이 그대로 보인다(wait.set), 방장이 아니면 눌러도 안 바뀐다
    await B.page.locator('.wr-seg[aria-label="첫 설명"] .wr-opt:first-child[aria-checked="true"]').waitFor({ state: 'visible' });
    if (!(await B.page.locator('.wr-seg[aria-label="첫 설명"] .wr-opt').first().isDisabled())) throw new Error('방장이 아닌 B 의 설정 버튼이 눌림');
  });

  await step('시작 → 세 창 역할 확인 화면', async () => {
    await until(() => A.page.locator('[data-rm="wait-start"]').isEnabled(), '게임 시작 켜짐');
    await A.page.locator('[data-rm="wait-start"]').click();
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
      wordOf[w.who] = (await w.page.locator('[data-lg="role-word"]').innerText()).trim();
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
      if (!(await sp.page.locator('.chat-bar.chat-hot').count())) throw new Error(`내 발언 차례인데 .chat-bar.chat-hot 이 없음(${sp.who})`);
      const text = `설명${n}번입니다`;
      said.push({ id: sp.who, text });
      await say(sp, text);
      // 쓴 뒤 3초(SPEAK_HOLD)는 그 사람에 머문다: 큰 글이 뜨고, 제목은 "첫 설명", 남은 시간 숫자는 없다
      for (const w of wins) {
        await w.page.locator('[data-lg="hud-said"]', { hasText: text }).waitFor({ state: 'visible', timeout: 2500 });
        await waitTitle(w, '첫 설명', 2500);
        const secsShown = await w.page.locator('[data-lg="hud-secs"]').isVisible().catch(() => false);
        if (secsShown) check(w.who, `첫 설명 ${n}번째 뒤 머무는 동안 남은 시간 숨김`, false, '남은 시간 숫자가 보임');
      }
      for (const w of wins) await chatBarOk(w, `speak ${n}`);
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
    for (const w of wins) await chatBarOk(w, 'discuss');
    // 화면 입력 한도 = 서버 한도 80자: 81자를 붙여 넣으면 80자에서 멈춘다(보낸 글이 사라지지 않는다)
    if (!(await B.page.locator('.chat-in').isVisible())) await B.page.locator('.chat-btn').click();
    await B.page.locator('.chat-in').fill('가'.repeat(81));
    const len = await B.page.locator('.chat-in').evaluate((e) => [...e.value].length);
    if (len !== 80) throw new Error(`입력 한도가 80자가 아님: ${len}`);
    await B.page.locator('.chat-in').fill('');
    await B.page.locator('.chat-btn').click();
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
    for (const w of [B, C]) {
      const hs = await w.page.locator('[data-lg="judge"]').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, lines: Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight || '20')) }; }));
      if (hs.length !== 2 || Math.abs(hs[0].h - hs[1].h) > 1 || hs[0].h > 80) throw new Error(`${w.who}: 찬반 버튼 높이 이상 ${JSON.stringify(hs)}`);
    }
    await B.page.locator('[data-lg="judge"][data-v="yes"]').click(); // C 는 일부러 안 고른다(기권)
    noErrors('judge');
  });

  await step('판정(처형) → 정체 공개 글', async () => {
    for (const w of wins) await waitTitle(w, '처형', 20000);
    for (const w of wins) {
      const n = await w.page.locator('.lg-vt-jv', { hasText: '기권' }).count();
      if (n < 1) throw new Error(`${w.who}: 안 고른 사람의 딱지에 "기권"이 없음`);
    }
    for (const w of wins) await waitTitle(w, '정체 공개', 20000);
    for (const w of wins) await w.page.locator('[data-lg="unmask"]').first().waitFor({ state: 'attached' });
    await occAll('unmask', '.lg-hud-end'); // 정체 공개는 화면 전체를 어둡게 덮는 것이 약속이라 "이 판 끝내기"는 제외
    noErrors('unmask');
  });

  let liarWin;
  await step('정답 맞히기(guess): 모든 창에 엔딩 제목·큰 초, 라이어 창에서 입력→보내기', async () => {
    liarWin = await anyWin((w) => w.page.locator('[data-lg="guess-input"]').isVisible(), 30000);
    for (const w of wins) {
      await w.page.locator('[data-lg="ending"][data-stage="ask"]').waitFor({ state: 'visible' });
      await w.page.locator('[data-lg="ed-title"]').waitFor({ state: 'visible' });
      await w.page.waitForFunction(() => document.querySelector('[data-lg="ed-title"]')?.querySelectorAll('.lg-ed-on').length >= 10);
      await w.page.locator('[data-lg="ed-secs"]').waitFor({ state: 'visible' });
      const secs = await w.page.locator('[data-lg="ed-secs"]').innerText();
      if (!/^\d+초$/.test(secs.trim())) throw new Error(`${w.who}: 큰 초 글이 이상함 "${secs}"`);
    }
    await occAll('guess');
    if (process.env.LG_ED_SHOT) await liarWin.page.screenshot({ path: process.env.LG_ED_SHOT.replace(/(\.\w+)?$/, '-guess$1') });
    // 답을 내기 전: 라이어 창 어디에도 시민 제시어가 없다 (라이어가 받은 제시어와 시민 제시어가 다를 때)
    const citizen = wins.filter((w) => w !== liarWin).map((w) => wordOf[w.who]).find(Boolean);
    const own = wordOf[liarWin.who];
    if (citizen && own && citizen !== own && !citizen.includes(own) && !own.includes(citizen)) {
      const body = await liarWin.page.evaluate(() => document.body.innerText);
      if (body.includes(citizen)) throw new Error(`라이어 창 글에 시민 제시어 "${citizen}" 가 보임`);
    }
    await liarWin.page.locator('[data-lg="guess-input"]').fill('아무거나');
    await liarWin.page.locator('[data-lg="guess-send"]').click();
    noErrors('guess');
  });

  await step('정답 공개(answer): 제시어·미스매치 → 라이어의 답 → 판정이 차례로 보인다', async () => {
    const typed = (w, sel) => w.page.locator(`[data-lg="${sel}"] .lg-ed-on`).allInnerTexts().then((a) => a.join(''));
    for (const w of wins) {
      await w.page.locator('[data-lg="ending"][data-stage="word"], [data-lg="ending"][data-stage="mismatch"], [data-lg="ending"][data-stage="answer"]').first().waitFor({ state: 'attached', timeout: 12000 });
      await w.page.locator('[data-lg="ed-word"]').waitFor({ state: 'visible' });
      const word = (await w.page.locator('[data-lg="ed-word"]').innerText()).trim();
      if (!word.startsWith('제시어')) throw new Error(`${w.who}: 제시어 줄 이상함 "${word}"`);
      const mis = await w.page.locator('[data-lg="ed-mismatch"]').innerText().catch(() => '');
      if (!mis.includes('미스매치')) throw new Error(`${w.who}: 미스매치 줄 이상함 "${mis}"`);
    }
    for (const w of wins) {
      await w.page.waitForFunction(() => (document.querySelector('[data-lg="ed-answer"]')?.textContent || '').includes('아무거나') && document.querySelectorAll('[data-lg="ed-answer"] .lg-ed-on').length >= 4, null, { timeout: 12000 });
      const a = await typed(w, 'ed-answer');
      if (!a.includes('아무거나')) throw new Error(`${w.who}: 라이어의 답이 안 써짐 "${a}"`);
    }
    for (const w of wins) {
      await w.page.waitForFunction(() => (() => { const c = document.querySelectorAll('[data-lg="ed-verdict"] .lg-ed-ch'); return c.length > 0 && document.querySelectorAll('[data-lg="ed-verdict"] .lg-ed-on').length === c.length; })(), null, { timeout: 12000 });
      const v = await w.page.locator('[data-lg="ed-verdict"]').innerText();
      if (!/라이어가 답을 맞(혔|히지 못했)습니다/.test(v)) throw new Error(`${w.who}: 판정 글 이상함 "${v}"`);
    }
    await liarWin.page.waitForTimeout(600);
    if (process.env.LG_ED_SHOT) await liarWin.page.screenshot({ path: process.env.LG_ED_SHOT });
    await occAll('answer');
    noErrors('answer');
  });

  await step('결과: 승자·점수·투표 내역', async () => {
    for (const w of wins) {
      await w.page.locator('[data-lg="result-winner"]').waitFor({ state: 'visible', timeout: 40000 });
      await w.page.locator('[data-lg="result"]').waitFor({ state: 'visible' });
    }
    const t = await A.page.locator('[data-lg="result-winner"]').innerText();
    if (!/라이어 승리|시민 승리|무효/.test(t)) throw new Error(`승자 글자가 이상함: ${t}`);
    const body = await A.page.locator('[data-lg="result"]').innerText();
    if (!/[+\-]?\d+/.test(body)) throw new Error('점수 숫자가 없음');
    if (!body.includes(names.A) || !body.includes(names.B)) throw new Error('투표 내역에 이름이 없음');
    if (!t.includes('무효')) { // SPEC 22: a void round pays nothing; otherwise everyone who finished got coins (message + toast)
      for (const w of wins) await w.page.waitForFunction(() => window.__coinGot > 0, null, { timeout: 5000 }).catch(() => { throw new Error(`${w.who}: 라운드 끝에 코인 알림이 오지 않음`); });
    }
    await occAll('result', '.lg-rule-btn, .lg-fs-btn'); // 결과 창이 위쪽 규칙·첫 발언 버튼을 덮는다(창을 닫을 수 없는 단계)
    noErrors('result');
  });

  await step('결과 → B 는 "대기실로"(설정 화면 + 참가자 3명), A 는 "다음 판" → 세 창 역할 확인 화면', async () => {
    await B.page.locator('[data-lg="to-wait"]').click();
    await B.page.locator('[data-rm="wait-leave"]').waitFor({ state: 'visible' });
    await until(async () => (await B.page.locator('.wr-players li').count()) === 3, 'B 의 대기실에 참가자 3명');
    await B.page.locator('.wr-seg[aria-label="라이어 방식"]').waitFor({ state: 'visible' });
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
