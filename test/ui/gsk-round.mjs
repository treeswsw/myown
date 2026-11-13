// 갱스껄 한 판 스모크 (`npm test` 에 포함): 실제 서버(GSK=test) + 빌드된 화면(dist/, ?nogl=1&gsk=1) + 창 3개.
// 로그인 → 방 만들기 → 두 명 입장 → 색 고르기 → 시작 → (1) 자기 해골 실패 → (2) 남의 해골 실패(해골 주인만 벌칙 고름)
// → (3)(4) 성공 두 번 → 결과에 승자 이름 → 한 판 더 → 나가기. 보이는 글자·data-gk 버튼·받은 웹소켓 메시지로만 판단한다(그림 비교 없음).
// 진행은 서버가 정한 차례(받은 room 상태)를 보고, 버튼은 그 차례인 창에서만 누른다. 임시 화면(data-gk 손잡이)이 진짜 화면으로 바뀌어도 같은 속성을 달면 통한다.
// 비밀: 해골을 놓은 사람이 아닌 창이 판정(뒤집기) 전에 받은 메시지에 "S" 가 없어야 한다. npm run build 가 먼저 필요하다. 실패하면 캡처(SMOKE_SHOTS 폴더)를 남긴다.
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
const shots = process.env.SMOKE_SHOTS || path.join(os.tmpdir(), 'smoke-gsk-round');
fs.mkdirSync(shots, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const T = 10000;
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // 가운데 상황 문구가 바뀔 때마다 모아 둔다(성공/실패 문구는 잠깐만 뜨므로).
  await ctx.addInitScript(() => {
    window.__gkSeen = [];
    const grab = () => {
      const t = document.querySelector('[data-gk=center]')?.textContent;
      if (t && window.__gkSeen[window.__gkSeen.length - 1] !== t) window.__gkSeen.push(t);
    };
    new MutationObserver(grab).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const w = { who, page, errors: [], frames: [], st: null, seenFrom: 0 };
  page.on('pageerror', (e) => w.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) w.errors.push(`console.error: ${m.text()}`); });
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      const s = typeof f.payload === 'string' ? f.payload : f.payload.toString();
      w.frames.push(s);
      if (s.startsWith('{"t":"room"')) { try { const m = JSON.parse(s); if (m.state) w.st = m.state; } catch { /* 무시 */ } }
    });
  });
  await page.goto(`${url}/?nogl=1&gsk=1`);
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
      const s = w.st;
      if (s) console.log(`      [${w.who}] 상태: phase=${s.phase} step=${s.step} round=${s.round} turn=${s.turn} penalty=${JSON.stringify(s.penalty)}`);
    }
    throw new StepFailed(what);
  }
}
const noErrors = (state) => {
  for (const w of wins) if (w.errors.length) throw new Error(`콘솔 오류(${w.who}, ${state}): ${w.errors.join(' | ')}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = () => wins[0].st; // 공개 값은 모두 같다
async function waitS(pred, what, timeout = T) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = S();
    if (s && pred(s)) return s;
    await sleep(40);
  }
  const s = S();
  throw new Error(`상태 대기 시간 초과: ${what} (phase=${s?.phase} step=${s?.step} round=${s?.round})`);
}
const winOf = (id) => wins.find((w) => w.st?.you === id);
const gk = (w, key) => w.page.locator(`[data-gk="${key}"]`);
const press = async (w, key) => { await gk(w, key).waitFor({ state: 'visible' }); await gk(w, key).click(); };
const count = (w, sel) => w.page.locator(sel).count();
// 차례인 사람이 아닌 창에는 그 단계의 버튼이 없다(각 창이 그 단계 상태를 받은 뒤에 본다).
async function onlyActor(actor, stepName, sel, what) {
  for (const w of wins) {
    if (w === actor) continue;
    const end = Date.now() + T;
    while (Date.now() < end && !(w.st && w.st.step === stepName)) await sleep(40);
    await sleep(200);
    const n = await count(w, sel);
    if (n) throw new Error(`${what}: 차례가 아닌 ${w.who} 창에 ${sel} 버튼 ${n}개가 보임`);
  }
}
const seatOf = (id) => S().seats.find((s) => s.id === id);

const server = await startServer({ GSK: 'test' });
let browser;
try {
  browser = await chromium.launch();
  const A = await openPage(browser, server.http, 'A');
  const B = await openPage(browser, server.http, 'B');
  const C = await openPage(browser, server.http, 'C');
  const names = { A: uid('가'), B: uid('나'), C: uid('다') };

  await step('로그인 3명 → 갱스껄 방(A 방장) → B·C 입장', async () => {
    for (const w of wins) {
      await w.page.fill('.lb-field', names[w.who]);
      await w.page.click('button.lb-primary:has-text("입장")');
      await w.page.waitForSelector('.lb-seg-item:has-text("갱스껄")', { state: 'visible' });
    }
    await A.page.click('.lb-seg-item:has-text("갱스껄")');
    await A.page.click('button.lb-primary:has-text("방 만들기")');
    await A.page.locator('.gkbar-code').waitFor({ state: 'visible' });
    for (const w of [B, C]) {
      const row = w.page.locator('.lb-room-row', { hasText: `${names.A}의 방` });
      await row.waitFor({ state: 'visible' });
      await row.locator('b', { hasText: '갱스껄' }).waitFor({ state: 'visible' });
      await row.click();
    }
    for (const w of wins) await w.page.locator('[data-gk-seat]').nth(2).waitFor({ state: 'visible' });
    const code = (await A.page.locator('.gkbar-code').innerText()).replace('방 코드', '').trim();
    if (!code || !(await A.page.locator('[data-gk=center]').innerText()).length) throw new Error('방 코드·상황 문구가 비어 있음');
    for (const w of wins) await w.page.locator('[data-gk-seat]', { hasText: names[w.who] }).first().waitFor({ state: 'visible' });
    noErrors('join');
  });

  await step('각자 색 고르기 → 남이 고른 색 버튼은 사라지고, 시작은 방장에게만 보인다', async () => {
    await press(A, 'color-0');
    await waitS((s) => s.seats.some((x) => x.color === 0), 'A 색');
    await B.page.locator('[data-gk=color-0]').waitFor({ state: 'detached' });
    await press(B, 'color-1');
    await press(C, 'color-2');
    await waitS((s) => s.seats.every((x) => x.color != null), '색 3개');
    const cols = S().seats.map((x) => x.color).sort();
    if (cols.join() !== '0,1,2') throw new Error(`색이 ${cols}`);
    await gk(A, 'start').waitFor({ state: 'visible' });
    if ((await count(B, '[data-gk=start]')) || (await count(C, '[data-gk=start]'))) throw new Error('방장이 아닌 창에 시작 버튼이 보임');
  });

  await step('A 가 시작 → 세 창이 준비(원판 놓기) 단계', async () => {
    await press(A, 'start');
    await waitS((s) => s.phase === 'playing' && s.step === 'setup', '준비 단계');
    for (const w of wins) await gk(w, 'place-F').waitFor({ state: 'visible' });
    if (await count(A, '[data-gk=place-S]') !== 1) throw new Error('place-S 버튼이 없음');
    noErrors('start');
  });

  // ---- 한 라운드 ----
  let round = 0;
  let X = null; // 도전자 창(이후 라운드도 계속 같은 사람이 시작)

  // kind: 'self' 자기 해골로 실패 / 'other' 남의 해골로 실패 / 'win' 성공
  async function playRound(kind) {
    round++;
    let s = await waitS((x) => x.phase === 'playing' && x.step === 'setup' && x.round >= round, `${round}번째 라운드 준비`);
    const starter = winOf(s.starter);
    if (!starter) throw new Error('시작 사람 창을 못 찾음');
    if (X && starter !== X) throw new Error(`시작 사람이 바뀜: ${starter.who} (도전자 ${X.who} 였음)`);
    X = starter;
    const others = wins.filter((w) => w !== starter);
    const skull = kind === 'self' ? starter : kind === 'other' ? others[0] : null;
    for (const w of wins) w.seenFrom = w.frames.length;
    for (const w of wins) await w.page.evaluate(() => { window.__gkSeen = []; });

    // 준비: 모두 놓는다(해골 주인만 place-S). 놓은 사람 화면의 단추는 사라진다.
    for (const w of wins) {
      await press(w, w === skull ? 'place-S' : 'place-F');
      await waitS((x) => x.step !== 'setup' || x.seats.find((q) => q.id === w.st.you)?.placed, `${w.who} 놓음`);
    }
    s = await waitS((x) => x.step === 'turn' && x.round >= round, '차례 단계');
    if (S().total !== 3) throw new Error(`판 위 원판 합계 ${S().total}`);
    await gk(starter, 'bid-1').waitFor({ state: 'visible' });
    await onlyActor(starter, 'turn', '[data-gk^="bid-"], [data-gk="pass"]', '차례 단계');
    const turnTxt = await others[0].page.locator('[data-gk=center]').innerText();
    if (!turnTxt.includes(`${names[starter.who]} 님`)) throw new Error(`차례 문구에 이름이 없음: ${turnTxt}`);

    // 도전: 남의 해골 실패는 3(합계, 경매 없이 바로), 자기 해골 실패=1, 성공=2 → 나머지 패스
    const n = kind === 'other' ? 3 : kind === 'self' ? 1 : 2;
    await press(starter, `bid-${n}`);
    if (n < 3) {
      for (let guard = 0; guard < 4; guard++) {
        s = await waitS((x) => x.step === 'bid' || x.step === 'flip' || x.step === 'reveal', '경매 또는 뒤집기');
        if (s.step !== 'bid') break;
        const actor = winOf(s.turn);
        if (guard === 0) {
          await gk(actor, 'pass').waitFor({ state: 'visible' });
          await onlyActor(actor, 'bid', '[data-gk="pass"]', '경매 단계');
        }
        const prev = s.turn;
        await press(actor, 'pass');
        await waitS((x) => x.step !== 'bid' || x.turn !== prev, '다음 경매 차례');
      }
    }
    s = await waitS((x) => ['flip', 'reveal', 'penalty'].includes(x.step), '뒤집기 단계', 15000);

    // 뒤집기
    if (kind === 'win') {
      await gk(starter, `flip-${others[0].st.you}`).waitFor({ state: 'visible', timeout: 15000 });
      await onlyActor(starter, 'flip', '[data-gk^="flip-"]', '뒤집기 단계');
      // 자기 더미는 서버가 이미 열었다: 내 자리에 공개된 원판이 있다
      if (seatOf(starter.st.you).shown.length < 1) throw new Error('도전자 더미가 자동 공개되지 않음');
      await press(starter, `flip-${others[1].st.you}`);
    } else if (kind === 'other') {
      await press(starter, `flip-${skull.st.you}`);
    }
    await waitS((x) => x.step === 'reveal' || x.step === 'penalty' || x.step === 'between' || x.phase === 'result', '판정', 15000);

    // 비밀: 해골을 놓은 사람이 아닌 창이 판정 전에 받은 메시지에 "S" 가 없다
    if (skull) {
      let seen = 0;
      for (const w of wins) {
        if (w === skull) continue;
        const fr = w.frames.slice(w.seenFrom);
        const cut = fr.findIndex((f) => /gkFlip|"step":\s*"(flip|reveal|penalty)"/.test(f));
        const before = cut < 0 ? fr : fr.slice(0, cut);
        seen += before.length;
        // 본인 시점 칸(mine)은 그 사람 자신의 것이므로 빼고 본다
        const pub = (f) => { try { const m = JSON.parse(f); if (m.state) delete m.state.mine; return JSON.stringify(m); } catch { return f; } };
        const bad = before.find((f) => /"S"\s*[,\]}]/.test(pub(f)));
        if (bad) throw new Error(`${w.who} 창이 해골을 놓은 ${skull.who} 의 원판 종류가 든 메시지를 받음: ${pub(bad).slice(Math.max(0, pub(bad).search(/"S"\s*[,\]}]/) - 120), pub(bad).search(/"S"\s*[,\]}]/) + 40)}`);
      }
      if (seen < 4) throw new Error(`검사한 메시지가 너무 적음(${seen})`);
    }

    // 성공/실패 문구가 모든 창에 한 번은 떴다
    const want = kind === 'win' ? '성공!' : '해골!';
    for (const w of wins) {
      const end = Date.now() + 5000;
      let ok = false;
      while (!ok && Date.now() < end) { ok = (await w.page.evaluate(() => window.__gkSeen)).some((t) => t.includes(want)); if (!ok) await sleep(50); }
      if (!ok) throw new Error(`${w.who} 창 상황 문구에 "${want}" 가 뜬 적이 없음: ${JSON.stringify(await w.page.evaluate(() => window.__gkSeen))}`);
    }

    // 벌칙
    if (kind === 'self') {
      s = await waitS((x) => x.step === 'penalty', '벌칙 단계');
      if (s.penalty.by !== starter.st.you) throw new Error('자기 해골인데 고르는 사람이 도전자가 아님');
      await gk(starter, 'discard-S').waitFor({ state: 'visible' });
      await gk(starter, 'discard-F').waitFor({ state: 'visible' });
      await onlyActor(starter, 'penalty', '[data-gk^="discard-"]', '벌칙 단계(자기 해골)');
      const before = seatOf(starter.st.you).discs;
      await press(starter, 'discard-S');
      await waitS((x) => x.step !== 'penalty', '벌칙 뒤 진행');
      if (seatOf(starter.st.you).discs !== before - 1) throw new Error(`원판이 ${before} → ${seatOf(starter.st.you).discs}`);
    } else if (kind === 'other') {
      s = await waitS((x) => x.step === 'penalty', '벌칙 단계');
      if (s.penalty.by !== skull.st.you) throw new Error('고르는 사람이 해골 주인이 아님');
      await gk(skull, 'discard-0').waitFor({ state: 'visible' });
      const nCards = await count(skull, '[data-gk^="discard-"]');
      if (nCards !== s.penalty.n) throw new Error(`뒷면 칸 ${nCards}개, 서버는 ${s.penalty.n}칸`);
      if (await count(skull, '[data-gk="discard-F"], [data-gk="discard-S"]')) throw new Error('남의 원판인데 종류를 고르는 버튼이 보임');
      await onlyActor(skull, 'penalty', '[data-gk^="discard-"]', '벌칙 단계(남의 해골)');
      const before = seatOf(starter.st.you).discs;
      await press(skull, 'discard-0');
      await waitS((x) => x.step !== 'penalty', '벌칙 뒤 진행');
      if (seatOf(starter.st.you).discs !== before - 1) throw new Error(`도전자 원판이 ${before} → ${seatOf(starter.st.you).discs}`);
    }
    noErrors(`round ${round}`);
  }

  await step('1라운드: 내가 놓은 해골이 나와 실패 → 도전자 본인이 버릴 원판 종류를 고른다', () => playRound('self'));
  await step('2라운드: 남의 해골이 나와 실패 → 해골 주인만 뒷면 칸을 고르고, 놓은 순간 남의 메시지에 종류가 없다', () => playRound('other'));
  await step('3라운드: 도전 성공(첫 점수)', async () => {
    await playRound('win');
    await waitS((x) => x.step === 'between' || x.step === 'setup', '라운드 마무리');
    const p = seatOf(X.st.you).points;
    if (p !== 1) throw new Error(`성공 뒤 점수 ${p}`);
  });
  await step('4라운드: 도전 성공(두 번째 점수) → 결과에 승자 이름', async () => {
    await playRound('win');
    await waitS((x) => x.phase === 'result', '결과 단계', 15000);
    const winnerName = names[X.who];
    if (S().result.winner !== X.st.you) throw new Error(`승자 ${S().result.winner}`);
    for (const w of wins) {
      await gk(w, 'result').waitFor({ state: 'visible' });
      const t = await gk(w, 'result').innerText();
      if (!t.includes(winnerName)) throw new Error(`${w.who} 결과에 승자 이름 없음: ${t.replace(/\s+/g, ' ')}`);
      if (!/\d점/.test(t)) throw new Error('결과에 점수가 없음');
    }
    const all = await gk(A, 'result').innerText();
    for (const n of Object.values(names)) if (!all.includes(n)) throw new Error(`결과 순위에 ${n} 없음`);
    if ((await count(B, '[data-gk=start]')) || (await count(C, '[data-gk=start]'))) throw new Error('방장이 아닌 창에 한 판 더 버튼');
    noErrors('result');
  });

  await step('A 가 "한 판 더" → 점수·원판이 처음으로 돌아가 다시 준비 단계', async () => {
    const gameNo = S().gameNo;
    await press(A, 'start');
    await waitS((x) => x.phase === 'playing' && x.step === 'setup' && x.gameNo > gameNo, '새 판 준비 단계');
    for (const s of S().seats) if (s.points !== 0 || s.discs !== 4) throw new Error(`새 판인데 ${s.name} 점수 ${s.points} 원판 ${s.discs}`);
    for (const w of wins) await gk(w, 'place-F').waitFor({ state: 'visible' });
    if (await count(A, '[data-gk=result]')) throw new Error('새 판인데 결과 창이 남음');
    noErrors('restart');
  });

  await step('나가기 → 로비로 돌아온다', async () => {
    for (const w of wins) {
      // 임시 화면의 나가기(data-gk=leave)는 지금 상단 줄(.gkbar)에 가려 눌리지 않는다(보고됨). 가려지면 상단 줄 버튼을 누른다.
      await gk(w, 'leave').click({ timeout: 1500 }).catch(() => w.page.locator('.gkbar-btn', { hasText: '나가기' }).click());
      await w.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
      if (await count(w, '[data-gk-seat]')) throw new Error(`${w.who} 나간 뒤 화면이 남음`);
    }
  });

  for (const w of wins) check(w.who, '브라우저 오류 없음', w.errors.length === 0, w.errors.join(' | '));
} catch (e) {
  if (!(e instanceof StepFailed)) { failed++; console.log(`FAIL unexpected: ${e.stack || e}`); }
} finally {
  await browser?.close().catch(() => {});
  await server.stop().catch(() => {});
}
console.log(failed ? `\nGSK ROUND FAILED (${failed})` : '\nGSK ROUND OK');
process.exit(failed ? 1 : 0);
