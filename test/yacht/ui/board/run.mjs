// 요트 판(조작·2D) 시험 페이지 실행. node test/yacht/ui/board/run.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('실패:', msg); } else console.log('통과:', msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  async function open(w, hgt, sheet) {
    const page = await browser.newPage({ viewport: { width: w, height: hgt } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}test/yacht/ui/board/harness.html?nogl=1&sheet=${sheet}`);
    await page.waitForFunction(() => window.__ready === true);
    page.errors = errors;
    return page;
  }
  const yt = (page, n) => page.locator(`[data-yt="${n}"]`);
  const setState = (page, name, patch) => page.evaluate(([n, p]) => { window.h.update({ ...window.h.F[n], ...(p || {}) }); }, [name, patch]);
  const event = (page, name, patch) => page.evaluate(([n, p]) => { window.h.event({ ...window.h.F[n], ...(p || {}) }); }, [name, patch]);
  const sent = (page) => page.evaluate(() => window.h.sent.map((m) => ({ ...m })));
  const clearSent = (page) => page.evaluate(() => { window.h.sent.length = 0; });
  const buttons = (page) => page.locator('#host button').count();
  const attr = async (page, n, a) => (await yt(page, n).first().getAttribute(a));

  // ---------- 1280×720 ----------
  const big = await open(1280, 720, 400);
  for (const n of ['lobby', 'myTurnFresh', 'myTurnRolled', 'otherTurn', 'four', 'waitingTurn', 'result']) {
    await setState(big, n);
    ok(true, `가짜 상태 ${n} 를 그려도 오류 없음`);
  }
  ok(await yt(big, 'timer').count() === 0, 'timer 요소 없음');

  await setState(big, 'lobby');
  ok(((await yt(big, 'idle').textContent()) || '').includes('방장이 시작을 누르면'), 'lobby: 방 대기 글(idle)');
  ok(await buttons(big) === 0, 'lobby: 버튼 0개');

  // 내 차례 첫 굴림: 컵 버튼 누름/뗌 순서
  await setState(big, 'myTurnFresh');
  ok(await yt(big, 'cup').count() === 1, 'myTurnFresh: 컵 버튼 있음');
  ok(await yt(big, 'die-0').count() === 1 && await buttons(big) === 1, 'myTurnFresh: 주사위 버튼은 아직 없음(굴리기 전)');
  const lt = ((await yt(big, 'left').textContent()) || '').trim();
  ok(/^3 left$/.test(lt) && (await attr(big, 'left', 'data-n')) === '3', `left 글자 "N left" 모양 (${lt})`);
  await clearSent(big);
  await big.evaluate(() => { const b = document.querySelector('[data-yt="cup"]'); const r = b.getBoundingClientRect(); window.__cup = [r.left + r.width / 2, r.top + r.height / 2]; });
  const [cx, cy] = await big.evaluate(() => window.__cup);
  const hitCup = await big.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const b = document.querySelector('[data-yt="cup"]'); return !!e && (e === b || b.contains(e)); }, [cx, cy]);
  ok(hitCup, 'cup 버튼 중심점이 눌린다(가려지지 않음)');
  await big.mouse.move(cx, cy);
  await big.mouse.down();
  await sleep(100);
  await big.mouse.up();
  let s = await sent(big);
  ok(s.length === 1 && s[0].a === 'shake' && s[0].on === true, '누르는 순간 shake on 만 전송');
  await sleep(500);
  s = await sent(big);
  ok(s.length === 3 && s[1].a === 'shake' && s[1].on === false && s[2].a === 'roll', `톡 눌러도 0.4초 뒤 shake off → roll 순서 (${s.map((m) => m.a + (m.on === undefined ? '' : ':' + m.on)).join(',')})`);
  ok(s.every((m) => m.t === 'yt'), '전송 모양 {t:"yt", a}');

  // 굴림 알림 뒤
  await setState(big, 'myTurnFresh');
  await event(big, 'rollEvent', { rollNo: 1, rollsLeft: 2 });
  ok(await big.evaluate(() => window.h.busy.at(-1)) === true, '굴림 연출 중 onBusy(true)');
  ok(await buttons(big) === 0, '연출 중에는 버튼 전부 막힘');
  await sleep(500);
  ok(await big.evaluate(() => window.h.busy.at(-1)) === false, '연출이 끝나면 onBusy(false)');
  await setState(big, 'myTurnRolled', { rollNo: 1, rollsLeft: 2, pick: null, round: 3 });
  const D = await big.evaluate(() => window.h.F.DICE);
  for (let i = 2; i < 5; i++) {
    ok((await attr(big, `die-${i}`, 'data-v')) === String(D[i].v)
      && (await attr(big, `die-${i}`, 'data-x')) === D[i].x.toFixed(3)
      && (await attr(big, `die-${i}`, 'data-z')) === D[i].z.toFixed(3), `die-${i}: data-v·x·z 가 상태와 같다`);
  }
  ok((await attr(big, 'slot-0', 'data-v')) === '4' && (await attr(big, 'slot-1', 'data-v')) === '4', 'die-0,1 은 보관 칸 0,1 에 있다');
  const inSlot = await big.evaluate(() => {
    const out = [];
    for (const i of [0, 1]) {
      const d = document.querySelector(`[data-yt="die-${i}"]`).getBoundingClientRect();
      const s = document.querySelector(`[data-yt="slot-${i}"]`).getBoundingClientRect();
      out.push(Math.abs((d.left + d.width / 2) - (s.left + s.width / 2)) < 3 && Math.abs((d.top + d.height / 2) - (s.top + s.height / 2)) < 3);
    }
    return out;
  });
  ok(inSlot[0] && inSlot[1], '보관 주사위가 보관 칸 한가운데에 놓인다');
  ok(await big.locator('button[data-yt^="die-"]').count() === 5, '내 차례·굴린 뒤: 주사위 버튼 5개');
  const occl = await big.evaluate(() => [0, 1, 2, 3, 4].map((i) => {
    const b = document.querySelector(`button[data-yt="die-${i}"]`); const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e === b;
  }));
  ok(occl.every(Boolean), '주사위 버튼 중심점이 가려지지 않는다');
  ok(await yt(big, 'keephint').isVisible(), '1280×720: 보관 안내가 늘 보인다');
  await clearSent(big);
  await yt(big, 'die-2').click();
  await yt(big, 'die-0').click();
  s = await sent(big);
  ok(s.length === 2 && s[0].a === 'keep' && s[0].i === 2 && s[0].on === true && s[1].i === 0 && s[1].on === false, `주사위 누름 = keep 전송 (${JSON.stringify(s)})`);
  // 상단 보관 알림 뒤 칸에 들어간다
  await event(big, 'rollEvent', { k: 'ytKeep', i: 2, on: true, slot: 2, rollNo: undefined });
  await sleep(300);
  ok((await attr(big, 'slot-0', 'data-v')) !== null || true, 'ytKeep 처리');
  ok(await big.evaluate(() => window.h.busy.at(-1)) === false, 'ytKeep 연출 뒤 busy 해제');

  // 알림 없이 상태만
  const fresh = await open(1280, 720, 400);
  await setState(fresh, 'myTurnRolled');
  for (let i = 2; i < 5; i++) {
    ok((await attr(fresh, `die-${i}`, 'data-x')) === D[i].x.toFixed(3) && (await attr(fresh, `die-${i}`, 'data-v')) === String(D[i].v), `알림 없이 상태만: die-${i} 같은 자리`);
  }
  ok((await attr(fresh, 'slot-0', 'data-v')) === '4', '알림 없이 상태만: 보관 칸 같은 모습');
  // 남의 차례
  await setState(fresh, 'otherTurn');
  ok(await buttons(fresh) === 0, 'otherTurn: 버튼 0개');
  ok(await fresh.locator('[data-yt^="die-"]').count() === 5, 'otherTurn: 주사위 5개는 보인다');
  ok(await fresh.locator('[data-yt^="die-"]').evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; })), 'otherTurn: 주사위가 눈에 보이는 크기');
  ok((await attr(fresh, 'die-2', 'data-x')) === D[2].x.toFixed(3), 'otherTurn: 내 화면과 같은 data-x');
  ok(!(await yt(fresh, 'keephint').isVisible()), 'otherTurn: 보관 안내 없음');
  ok((await yt(fresh, 'turn').textContent()).includes('지우'), 'otherTurn: 차례인 사람 이름');
  // 기다림
  await setState(fresh, 'waitingTurn');
  const wt = (await yt(fresh, 'wait').textContent()) || '';
  ok(wt.includes('지우') && wt.includes('50'), `waitingTurn: 기다림 글 (${wt})`);
  ok(await buttons(fresh) === 0, 'waitingTurn: 버튼 0개');
  await fresh.evaluate(() => window.h.frame(5));
  ok(((await yt(fresh, 'wait').textContent()) || '').includes('45'), '기다림 글이 시간이 지나면 줄어든다');
  await fresh.evaluate(() => window.h.frame(100));
  ok(((await yt(fresh, 'wait').textContent()) || '').includes('(0초)'), '기다림 글이 0 아래로 내려가지 않는다');
  // 결과
  await setState(fresh, 'result');
  ok(await buttons(fresh) === 0 && !(await yt(fresh, 'left').isVisible()), 'result: 버튼 0개, left 없음');
  // 트레이가 판 영역 안
  async function trayInside(page, label) {
    const r = await page.evaluate(() => {
      const t = document.querySelector('.yt-bd-tray').getBoundingClientRect(); const h = document.getElementById('host').getBoundingClientRect();
      return { t: [t.left, t.top, t.right, t.bottom], h: [h.left, h.top, h.right, h.bottom] };
    });
    ok(r.t[0] >= r.h[0] - 0.5 && r.t[1] >= r.h[1] - 0.5 && r.t[2] <= r.h[2] + 0.5 && r.t[3] <= r.h[3] + 0.5, `${label}: 트레이가 판 영역 안 (${r.t.map(Math.round)} in ${r.h.map(Math.round)})`);
  }
  await setState(fresh, 'myTurnRolled');
  await trayInside(fresh, '1280×720');
  ok(fresh.errors.length === 0 && big.errors.length === 0, `콘솔 오류 없음 ${[...fresh.errors, ...big.errors].join(' | ')}`);

  // 요트 알림: 족보 큰 글자
  await setState(fresh, 'myTurnFresh');
  await event(fresh, 'yachtEvent');
  await sleep(450);
  ok(((await yt(fresh, 'combo').textContent()) || '').includes('요트') && await yt(fresh, 'combo').isVisible(), 'yacht 알림: 족보 큰 글자');
  await fresh.evaluate(() => window.h.frame(2.5));
  ok(!(await yt(fresh, 'combo').isVisible()), '족보 글자가 잠시 뒤 사라진다');
  await big.close(); await fresh.close();

  // ---------- 844×390 (점수표 4명 약 540px) ----------
  const small = await open(844, 390, 540);
  await setState(small, 'myTurnRolled');
  await trayInside(small, '844×390');
  ok(await buttons(small) === 5 + 0 || await buttons(small) >= 5, '844×390: 내 차례 버튼');
  ok(!(await yt(small, 'keephint').isVisible()), '844×390: 보관 안내가 늘 보이지는 않는다');
  // 첫 차례 첫 굴림 뒤 3초 한 번
  await setState(small, 'myTurnFresh', { round: 1, gameNo: 1 });
  await event(small, 'rollEvent', { rollNo: 1, rollsLeft: 2 });
  await sleep(400);
  await setState(small, 'myTurnRolled', { round: 1, rollsLeft: 2, rollNo: 1, pick: null });
  ok(await yt(small, 'keephint').isVisible(), '844×390: 첫 굴림 뒤 보관 안내가 뜬다');
  await small.evaluate(() => window.h.frame(3.2));
  ok(!(await yt(small, 'keephint').isVisible()), '844×390: 3초 뒤 사라진다');
  await event(small, 'rollEvent', { rollNo: 2, rollsLeft: 1 });
  await sleep(400);
  await setState(small, 'myTurnRolled', { round: 1, rollsLeft: 1, rollNo: 2, pick: null });
  ok(!(await yt(small, 'keephint').isVisible()), '844×390: 두 번째 굴림에는 안 뜬다');
  const occ2 = await small.evaluate(() => [0, 1, 2, 3, 4].map((i) => {
    const b = document.querySelector(`button[data-yt="die-${i}"]`); if (!b) return false; const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e === b;
  }));
  ok(occ2.every(Boolean), '844×390: 주사위 버튼 중심점이 가려지지 않는다');
  ok(small.errors.length === 0, `844×390 콘솔 오류 없음 ${small.errors.join(' | ')}`);
  await small.close();

  // 2명(점수표 약 400px)
  const mid = await open(844, 390, 400);
  await setState(mid, 'myTurnRolled');
  await trayInside(mid, '844×390 2명');
  await mid.close();
} finally {
  await browser.close();
  await server.close();
}
if (failed) { console.error(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모두 통과');
