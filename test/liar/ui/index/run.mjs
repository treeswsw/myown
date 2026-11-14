// 라이어 mount(ctx) 조립 시험. node test/liar/ui/index/run.mjs  (가짜 stage·faces·sound·send, ?nogl=1, 844×390)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chatLockFor } from '../../../../client/src/liar/ui/hud.js';
import { make, ORDER } from './fixtures.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let failed = 0;
const ok = (cond, msg, detail = '') => { if (!cond) { failed++; console.error('실패:', msg, detail); } else console.log('통과:', msg); };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + 'test/liar/ui/index/harness.html?nogl=1');
  await page.waitForFunction(() => window.__ready === true);
  const apply = (s) => page.evaluate((st) => window.h.apply(st), s);

  // 보이는 눌러야 하는 것의 중심점이 실제로 눌리는지
  const occlusion = (label) => page.evaluate(() => {
    const bad = [];
    const um = document.querySelector('[data-lg="unmask"]');
    const covering = um && !um.hidden && getComputedStyle(um).display !== 'none'; // 정체 공개 연출은 일부러 전체를 덮는다
    if (covering) return bad;
    for (const e of document.querySelectorAll('.lg-root button, .lg-root input')) {
      if (e.closest('[hidden]') || e.disabled || e.getAttribute('aria-disabled') === 'true') continue; // 못 누르게 만든 것(자기 자신·후보 아닌 사람)
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width < 2 || r.height < 2) continue;
      let hidden = false;
      for (let p = e; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).display === 'none' || getComputedStyle(p).visibility === 'hidden') hidden = true;
      if (hidden) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top.closest('[class*="lg-role-"], [class*="lg-rs-"]')) continue; // 역할 카드(50)·결과(60)가 첫 발언 버튼(40)을 덮는 것은 약속(0-7)
      if (!top || !(top === e || e.contains(top))) bad.push(`${e.tagName}[${e.dataset.lg || e.className}] "${(e.textContent || '').trim().slice(0, 10)}" 가려짐: ${top ? (top.dataset.lg || top.className) : 'nothing'}`);
    }
    return bad;
  });

  for (const n of [3, 8]) {
    await apply(null);
    errors.length = 0;
    for (const phase of ORDER) {
      const st = make(phase, { n });
      await apply(st);
      await page.waitForTimeout(120);
      const bad = await occlusion(phase);
      ok(bad.length === 0, `${n}명 ${phase}: 버튼이 서로 가리지 않음`, bad.join(' | '));
      ok(errors.length === 0, `${n}명 ${phase}: 콘솔 오류 0`, errors.join(' | '));
      const lock = await page.evaluate(() => window.h.locks.at(-1));
      const want = chatLockFor(st);
      ok(lock && lock[0] === want.locked && lock[1] === want.hint, `${n}명 ${phase}: chat.setLock = chatLockFor`);
      if (phase === 'speak') {
        await page.evaluate(() => window.h.liar.event({ k: 'chat', id: 'u1', name: '서아', text: '조용한 곳', ts: 1, kind: 'say' }));
        ok((await page.locator('[data-lg="hud-said"]').first().textContent()).includes('조용한 곳'), `${n}명 speak: hud-said 에 글`);
        await page.evaluate(() => window.h.liar.event({ k: 'chat', id: 'u1', name: '서아', text: '**크게', ts: 2, kind: 'plea' }));
        const said = await page.locator('[data-lg="hud-said"]').first().textContent();
        ok(!said.includes('*'), `${n}명 plea: 크기 표시 없이 (${said.trim()})`);
        const m = await page.evaluate(() => [window.h.chatMsg('가'), window.h.chatMsg('나')]);
        ok(m[0].t === 'chat', `${n}명 speak(남의 차례): chatMsg 는 chat`);
      }
      if (phase === 'discuss') {
        await page.evaluate(() => { window.h.sent.length = 0; });
        await page.locator('[data-lg="tag"][data-id="u1"]').click();
        ok(await page.evaluate(() => window.h.sent.some((m) => m.a === 'vote' && m.target === 'u1')), `${n}명 discuss: 이름표 → vote`);
      }
      if (phase === 'judge') {
        await page.evaluate(() => { window.h.sent.length = 0; });
        await page.locator('[data-lg="judge"][data-v="yes"]').click();
        ok(await page.evaluate(() => window.h.sent.some((m) => m.a === 'judge' && m.v === 'yes')), `${n}명 judge: 찬반 → judge`);
      }
    }
    // 정답: 라이어 본인 시점
    await apply(make('guess', { n, you: 'u2', round: n }));
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.h.sent.length = 0; });
    await page.locator('[data-lg="guess-input"]').fill('도서관');
    await page.locator('[data-lg="guess-send"]').click();
    ok(await page.evaluate(() => window.h.sent.some((m) => m.a === 'guess' && m.text === '도서관')), `${n}명 guess: 정답 → guess`);
    // 내 첫 설명 차례의 chatMsg
    await apply(make('speak', { n, you: 'u1' }));
    ok((await page.evaluate(() => window.h.chatMsg('설명'))).a === 'say', `${n}명 내 차례: chatMsg 는 say`);
    // 방을 나가면 전부 숨김, dispose 뒤 비움
    await apply(null);
    ok(await page.evaluate(() => document.querySelector('.lg-root').hidden), `${n}명 room(null): 숨김`);
  }

  // 비밀: word 방식에서 라이어와 시민의 DOM·소리가 unmask 전까지 같다(my.word 글자만 다름)
  const sig = async (word) => {
    await apply(null);
    await page.evaluate(() => { window.h.plays.length = 0; });
    const out = [];
    for (const phase of ORDER.slice(1, 8)) {
      await apply(make(phase, { n: 8, you: 'u1', word }));
      await page.evaluate(() => { for (const k of ['phase', 'turn', 'vote', 'accused', 'judge', 'judged']) window.h.liar.event({ k, id: 'u1', executed: true }); });
      out.push(await page.evaluate((w) => (() => { const c = document.querySelector('.lg-root').cloneNode(true); c.querySelectorAll('[hidden]').forEach((x) => x.remove()); return c.outerHTML; })().split(w).join('§'), word));
    }
    return { out, plays: await page.evaluate(() => [...window.h.plays]) };
  };
  await sig('워밍업'); // 숨은 요소에 남는 이전 단계 글을 같은 상태로 맞춘다
  const cit = await sig('도서관');
  const liar = await sig('서점');
  const diff = cit.out.findIndex((v, i) => v !== liar.out[i]);
  let why = '';
  if (diff >= 0) { const a = cit.out[diff], b = liar.out[diff]; let k = 0; while (a[k] === b[k]) k++; why = `${ORDER[diff + 1]}: ${a.slice(k - 40, k + 60)} <> ${b.slice(k - 40, k + 60)}`; }
  ok(diff < 0, 'word 방식: unmask 전 DOM 이 라이어·시민 같음', why);
  ok(JSON.stringify(cit.plays) === JSON.stringify(liar.plays), `word 방식: 튼 소리 목록 같음 (${cit.plays.length}개)`);

  // I-2: 규칙·랭킹 연결
  const center = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return 'none'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === e || e.contains(t) ? 'ok' : `가려짐:${t ? (t.dataset.lg || t.className) : 'nothing'}`; }, sel);
  const visible = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'; }, sel);
  await apply(null);
  for (const phase of ORDER) {
    await apply(make(phase, { n: 3 }));
    await page.waitForTimeout(60);
    const ruleOn = phase !== 'unmask';
    ok((await visible('[data-lg="rule-open"]')) === ruleOn, `rules ${phase}: 규칙 버튼 ${ruleOn ? '보임' : '숨김'}`);
    // reveal 은 역할 카드(50)가 규칙 버튼(45)을 덮는 것이 약속(0-7)
    if (ruleOn && phase !== 'reveal' && phase !== 'result' && phase !== 'guess') // guess 는 엔딩이 큰 글을 가리지 않게 일부러 숨긴다(data-ed). result 판이 가리는 것은 그대로 둔다(PLAN v0.12-8)
      ok((await center('[data-lg="rule-open"]')) === 'ok', `rules ${phase}: 규칙 버튼 중심점이 눌림`, await center('[data-lg="rule-open"]'));
    const rankOn = phase === 'lobby' || phase === 'result';
    ok((await visible('[data-lg="rank-open"]')) === rankOn, `rank ${phase}: 랭킹 버튼 ${rankOn ? '보임' : '숨김'}`);
    if (rankOn) ok((await center('[data-lg="rank-open"]')) === 'ok', `rank ${phase}: 랭킹 버튼 중심점이 눌림`, await center('[data-lg="rank-open"]'));
  }
  await apply(make('lobby', { n: 3 }));
  await page.locator('[data-lg="rule-open"]').click();
  ok(await visible('[data-lg="rule-panel"]'), 'rules: 누르면 창이 열림');
  await page.locator('[data-lg="rule-close"]').click();
  ok(!(await visible('[data-lg="rule-panel"]')), 'rules: 닫기');
  await page.evaluate(() => { window.h.sent.length = 0; });
  await page.locator('[data-lg="rank-open"]').click();
  ok(await page.evaluate(() => window.h.sent.some((m) => m.t === 'lg' && m.a === 'rank')), 'rank: 누르면 {t:lg,a:rank} 전송');
  await page.evaluate(() => window.h.liar.event({ k: 'lgRank', top: [{ name: '가', score: 9, games: 3 }, { name: '나', score: 9, games: 2 }, { name: '다', score: 4, games: 1 }], mine: { rank: 3, score: 4, games: 1 } }));
  ok((await page.locator('[data-lg="rank-row"]').count()) === 3, 'rank: lgRank 알림 → 줄 3개');
  await page.locator('[data-lg="rank-close"]').click();
  ok(!(await visible('[data-lg="rank-panel"]')), 'rank: 닫기');
  await page.locator('[data-lg="rule-open"]').click();
  await apply(make('unmask', { n: 3 }));
  ok(!(await visible('[data-lg="rule-open"]')) && !(await visible('[data-lg="rule-panel"]')), 'rules: unmask 에서 버튼·창 숨김');
  await apply(make('speak', { n: 3 }));
  await page.locator('[data-lg="rank-open"]').count();
  ok(!(await visible('[data-lg="rank-open"]')), 'rank: speak 에서 숨김');

  // I-2: 가짜 scene 에 setVotes·setJudge 가 상태대로 불림 (라이어·시민 DOM 은 위 sig 시험이 따로 본다)
  await page.goto(server.resolvedUrls.local[0] + 'test/liar/ui/index/harness.html?nogl=1&fake=1');
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(100);
  await apply(make('judge', { n: 3 }));
  await apply(make('judged', { n: 3 }));
  await apply(make('discuss', { n: 3 }));
  await apply(null);
  const calls = await page.evaluate(() => JSON.parse(JSON.stringify(window.h.calls)));
  const last = (k) => calls.filter((c) => c[0] === k).map((c) => JSON.stringify(c[1]));
  ok(last('votes').includes('{"u1":"u2","u2":"u1"}'), 'scene.setVotes: state.votes 그대로');
  ok(last('judge').includes('{}') && last('judge').includes('{"u0":"yes"}'), 'scene.setJudge: judge.picks 그대로');
  ok(last('judge').includes('null'), 'scene.setJudge: 판이 없으면 null');
  ok(last('votes').at(-1) === 'null' && last('judge').at(-1) === 'null', 'scene: 방을 나가면 둘 다 null 로 지움');
  ok(errors.length === 0, 'I-2 콘솔 오류 0', errors.join(' | '));

  // dispose
  await apply(make('speak', { n: 3 }));
  await page.evaluate(() => window.h.liar.unmount());
  ok(await page.evaluate(() => document.querySelectorAll('.lg-root').length === 0), 'unmount 뒤 .lg-root 0개');
  ok(errors.length === 0, '전체 콘솔 오류 0', errors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
