// 점수표 시험 페이지 실행. node test/yacht/ui/sheet/run.mjs   (캡처: SHOTS=폴더 node ...)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('실패:', msg); } else console.log('통과:', msg); };

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + 'test/yacht/ui/sheet/harness.html');
  await page.waitForFunction(() => window.__ready === true);

  const set = (name, extra, opts) => page.evaluate(([n, e, o]) => { window.h.set(n, e, o); }, [name, extra, opts]);
  const apply = (state, opts) => page.evaluate(([s, o]) => { window.h.apply(s, o); }, [state, opts]);
  const sent = () => page.evaluate(() => window.h.sent);
  const clear = () => page.evaluate(() => { window.h.sent.length = 0; });
  const count = (sel) => page.locator(sel).count();
  const rowBtns = () => page.evaluate(() => [...document.querySelectorAll('[data-yt^="row-"]')].map((b) => b.dataset.yt.slice(4)));
  const pvCount = () => count('.yt-sc-pv');
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };

  // 1) 가짜 상태 7개 (+ 관전자) 가 오류 없이 그려진다
  for (const n of ['lobby', 'myTurnFresh', 'myTurnRolled', 'otherTurn', 'four', 'waitingTurn', 'result', 'spectator']) {
    await set(n, undefined, { settled: true });
    ok((await count('[data-yt="round"]')) === 1, `${n} 그려짐`);
  }
  ok(errors.length === 0, `콘솔·페이지 오류 없음 (${errors.join(' / ')})`);

  // 2) 844x390: 두 덩어리, 줄 높이 44 이상
  await set('four');
  const layout = await page.evaluate(() => {
    const blks = [...document.querySelectorAll('.yt-sc-blk')].map((b) => b.getBoundingClientRect());
    const s = document.querySelector('.yt-sc');
    const rows = [...document.querySelectorAll('.yt-sc-cat, .yt-sc-hd, .yt-sc-tot')].filter((r) => r.offsetParent && r.getBoundingClientRect().height > 0);
    return { blks: blks.map((r) => [r.left, r.top, r.width, r.height]), minH: Math.min(...rows.map((r) => r.getBoundingClientRect().height)),
      sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight, w: s.getBoundingClientRect().width,
      dw: document.documentElement.scrollWidth, dh: document.documentElement.scrollHeight };
  });
  ok(layout.blks.length === 2 && layout.blks[1][0] > layout.blks[0][0] + layout.blks[0][2] - 2 && Math.abs(layout.blks[0][1] - layout.blks[1][1]) < 2, `844x390 두 덩어리 나란히 ${JSON.stringify(layout.blks)}`);
  ok(layout.minH >= 43.9, `머리·12칸·합계 줄 높이 44 이상 (${layout.minH})`);
  ok(layout.sw <= layout.cw && layout.sh <= layout.ch, `4줄 844x390 점수표 안 넘침 (${layout.sw}/${layout.cw}, ${layout.sh}/${layout.ch})`);
  ok(layout.dw <= 844 && layout.dh <= 390, '844x390 문서 스크롤 없음');
  ok(layout.w >= 480 && layout.w <= 560, `4명 폭 약 540 (${layout.w})`);
  await shot('four-844x390');
  for (const [n, lo, hi] of [['lobby', 380, 420], ['myTurnFresh', 380, 420]]) {
    await set(n);
    const w = await page.evaluate(() => document.querySelector('.yt-sc').getBoundingClientRect().width);
    ok(w >= lo && w <= hi, `${n} 2명 폭 약 400 (${w})`);
  }

  // 3) four: 끊김·기권
  await set('four');
  const vis = (sel) => page.locator(sel).first().isVisible();
  ok(await vis('[data-yt="away-1"]') && !(await vis('[data-yt="away-0"]')), '끊김 표시 away-1');
  ok(await vis('[data-yt="drop-3"]') && !(await vis('[data-yt="away-3"]')), '기권 표시 drop-3');
  ok(((await page.locator('[data-yt="head-3"]').getAttribute('class')) || '').includes('yt-sc-off'), '기권 줄 흐림');

  // 4) 내 차례 눌림
  await set('myTurnRolled', undefined, { settled: true });
  await shot('myTurnRolled-844x390');
  const btns = await rowBtns();
  ok(btns.length === 6 && ['threes', 'fives', 'choice', 'fullHouse', 'largeStraight', 'yacht'].every((c) => btns.includes(c)), `빈칸 6개만 눌림 (${btns})`);
  ok((await pvCount()) === 6, '노란 예상 점수 6개');
  for (const c of btns) {
    const hit = await page.evaluate((cat) => {
      const b = document.querySelector(`[data-yt="row-${cat}"]`);
      const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: !!e && (e === b || b.contains(e)), h: r.height };
    }, c);
    ok(hit.ok && hit.h >= 43.9, `row-${c} 중심점이 눌리고 높이 44 이상 (${hit.h})`);
  }
  ok((await page.locator('[data-yt="row-threes"]').getAttribute('aria-pressed')) === 'false', '선택 전 aria-pressed=false');
  ok(await vis('[data-yt="hint"]') && ((await page.locator('[data-yt="hint"]').textContent()) || '').includes('두 번'), '안내 글: 두 번 눌러 기록');

  // 5) 두 번 누르기
  await clear();
  await page.locator('[data-yt="row-choice"]').click();
  let s = await sent();
  ok(s.length === 1 && s[0].t === 'yt' && s[0].a === 'pick' && s[0].cat === 'choice', `첫 누름 = pick 한 번만 (${JSON.stringify(s)})`);
  ok((await page.locator('[data-yt="row-choice"]').getAttribute('aria-pressed')) === 'true', '누른 직후 임시 강조');
  const base = await page.evaluate(() => window.h.states.myTurnRolled);
  await apply({ ...base, pick: 'choice' }, { settled: true });
  ok((await page.locator('[data-yt="row-choice"]').getAttribute('aria-pressed')) === 'true', 'state.pick 으로 강조');
  ok(((await page.locator('[data-yt="cell-choice-0"]').textContent()) || '').includes('한 번 더'), '선택 칸에 "한 번 더" 글');
  ok((await page.locator('[data-yt="hint"]').textContent()).includes('한 번 더'), '안내 글: 한 번 더 누르면 기록');
  await clear();
  await page.locator('[data-yt="row-choice"]').click();
  s = await sent();
  ok(s.length === 1 && s[0].a === 'score' && s[0].cat === 'choice', `같은 칸 다시 = score (${JSON.stringify(s)})`);
  await clear();
  await page.locator('[data-yt="row-yacht"]').click();
  s = await sent();
  ok(s.length === 1 && s[0].a === 'pick' && s[0].cat === 'yacht', `다른 칸 = pick 으로 옮김 (${JSON.stringify(s)})`);
  // 칸 이름 쪽을 눌러도 같은 칸
  await clear();
  const labBox = await page.locator('[data-yt="cell-fives-0"]').evaluate((c) => { const l = c.parentElement.firstElementChild.getBoundingClientRect(); return [l.left + l.width / 2, l.top + l.height / 2]; });
  await page.mouse.click(labBox[0], labBox[1]);
  s = await sent();
  ok(s.length === 1 && s[0].a === 'pick' && s[0].cat === 'fives', '칸 이름 쪽을 눌러도 같은 칸');
  // 다음 상태가 오면 임시 강조는 상태를 따른다
  await apply({ ...base, pick: null }, { settled: true });
  ok((await page.locator('[data-yt="row-fives"]').getAttribute('aria-pressed')) === 'false', '상태가 오면 임시 강조 해제');

  // 6) settled:false
  await set('myTurnRolled', undefined, { settled: false });
  ok((await count('[data-yt^="row-"]')) === 0 && (await pvCount()) === 0, 'settled:false 면 예상 점수·버튼 없음');
  await set('myTurnRolled', undefined, { settled: true });
  ok((await count('[data-yt^="row-"]')) === 6, 'settled:true 로 돌아오면 다시 눌림');
  await set('myTurnFresh');
  ok((await count('[data-yt^="row-"]')) === 0 && (await pvCount()) === 0, '굴리기 전(preview 없음) 버튼 없음');

  // 7) 남의 차례·끊긴 차례·관전: 버튼 0, 노란 숫자 0, pickmark 1
  for (const n of ['otherTurn', 'waitingTurn', 'spectator']) {
    await set(n, undefined, { settled: true });
    ok((await count('[data-yt^="row-"]')) === 0 && (await count('.yt-sc button')) === 0, `${n}: 버튼 0`);
    ok((await pvCount()) === 0, `${n}: 노란 숫자 0`);
    ok((await count('[data-yt="pickmark"]')) === 1, `${n}: pickmark 1`);
  }
  // 남이 낸 내 줄처럼 보이는 상태: 내 차례 아닌데 preview 가 와도 눌리지 않는다
  await set('otherTurn', { preview: { threes: 3 } }, { settled: true });
  ok((await count('[data-yt^="row-"]')) === 0 && (await pvCount()) === 0, '남의 차례에 preview 가 와도 버튼·숫자 없음');
  await set('waitingTurn', { you: 'jiwoo', preview: { choice: 3 } });
  ok((await count('[data-yt^="row-"]')) === 0, '끊긴 차례(waiting)에는 버튼 없음');

  // 8) 1280x720: 한 덩어리
  await page.setViewportSize({ width: 1280, height: 720 });
  await set('myTurnRolled', undefined, { settled: true });
  await shot('myTurnRolled-1280x720');
  const big = await page.evaluate(() => {
    const s = document.querySelector('.yt-sc');
    const d = [...document.querySelectorAll('.yt-sc-blk')].map((b) => getComputedStyle(b).display);
    const rows = [...document.querySelectorAll('[data-yt^="row-"]')].map((b) => b.getBoundingClientRect().height);
    return { d, dir: getComputedStyle(s).flexDirection, w: s.getBoundingClientRect().width, sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight,
      hint2: getComputedStyle(document.querySelector('.yt-sc-hd2')).display, minRow: Math.min(...rows) };
  });
  ok(big.d.every((x) => x === 'contents') && big.dir === 'column' && big.hint2 === 'none', `1280x720 한 덩어리 (${big.d}, ${big.dir})`);
  ok(big.w <= 360 && big.sw <= big.cw && big.sh <= big.ch, `1280x720 폭 360 이하·안 넘침 (${big.w})`);
  ok(big.minRow >= 43.9, `1280x720 row 높이 44 이상 (${big.minRow})`);
  await set('four');
  const big4 = await page.evaluate(() => { const s = document.querySelector('.yt-sc'); return [s.getBoundingClientRect().width, s.scrollWidth <= s.clientWidth, s.scrollHeight <= s.clientHeight]; });
  ok(big4[0] <= 360 && big4[1] && big4[2], `1280x720 4줄 안 넘침 (${big4})`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await set('four');
  const huge = await page.evaluate(() => { const s = document.querySelector('.yt-sc'); return [s.getBoundingClientRect().width, s.scrollWidth <= s.clientWidth, s.scrollHeight <= s.clientHeight]; });
  ok(huge[0] <= 360 && huge[1] && huge[2], `1920x1080 4줄 폭 360 이하·안 넘침 (${huge})`);
  await shot('four-1920x1080');
  await page.setViewportSize({ width: 844, height: 390 });

  // 9) 글자는 textContent 로만
  await set('evilName');
  ok((await count('.yt-sc b')) <= 1 + 2 && (await count('[data-yt="head-0"] b')) === 0, '이름의 <b> 가 태그가 되지 않음');
  ok(((await page.locator('[data-yt="head-0"]').textContent()) || '').length >= 0 && (await page.evaluate(() => document.querySelector('[data-yt="head-0"] > span').textContent)) === '<b>민수</b>', '이름이 글자 그대로');

  // 10) flash·anchor
  await set('otherTurn');
  await page.evaluate(() => window.h.sheet.flash({ id: 'me', cat: 'largeStraight', score: 30 }));
  ok((await count('.yt-sc-flash')) === 1, 'flash: 칸 반짝');
  const anc = await page.evaluate(() => window.h.sheet.anchor('jiwoo'));
  ok(anc && anc.x > 0 && anc.y > 0, 'anchor 좌표');
  ok((await page.evaluate(() => window.h.sheet.anchor('nobody'))) === null, 'anchor 없는 사람은 null');

  // 11) 결과 상태: 왕관·우승 줄
  await set('result');
  ok((await page.locator('[data-yt="total-1"]').getAttribute('class')).includes('yt-sc-win'), '결과: 우승 합계 강조');

  ok(errors.length === 0, `끝까지 오류 없음 (${errors.join(' / ')})`);
} finally {
  await browser.close();
  await server.close();
}
if (failed) { console.error(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모두 통과');
