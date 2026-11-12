// 역할 카드 시험 페이지 실행. node test/liar/ui/role/run.mjs
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
  await page.goto(server.resolvedUrls.local[0] + 'test/liar/ui/role/harness.html?nogl=1');
  await page.waitForFunction(() => window.__ready === true);

  const lg = (name) => page.locator(`[data-lg="${name}"]`);
  const visible = (name) => lg(name).first().isVisible();
  const set = (...a) => page.evaluate((args) => { window.h.set(...args); }, a);
  const body = () => page.evaluate(() => document.body.innerText + '\n' + document.body.textContent);
  const wordText = async () => ((await lg('role-word').first().textContent()) || '').trim();
  const center = async (name) => {
    const b = await lg(name).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const hitOk = (name) => page.evaluate((n) => {
    const b = document.querySelector(`[data-lg="${n}"]`);
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!e && (e === b || b.contains(e));
  }, name);
  const holdMouse = async (name, fn) => {
    const c = await center(name);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    try { await fn(); } finally { await page.mouse.up(); }
  };
  const rect = (name) => page.evaluate((n) => {
    const r = document.querySelector(`[data-lg="${n}"]`).getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(',');
  }, name);

  // reveal: 카드, 누르기 전에는 글자 없음
  await set('reveal');
  ok(await visible('role-card'), 'reveal: 카드 보임');
  ok(await hitOk('role-card'), 'reveal: 카드 중심점 눌림');
  ok((await page.locator('.lg-role-round').textContent()) === 'Round 1', 'Round 1');
  ok(!(await body()).includes('도서관'), '누르기 전: 제시어 글자가 화면·DOM 텍스트에 없음');
  ok((await lg('role-word').first().getAttribute('aria-hidden')) === 'true', '누르기 전: 읽기 프로그램에 안 읽힘');
  ok((await wordText()) === '', '누르기 전: 제시어 자리 비어 있음');

  // 마우스
  await holdMouse('role-card', async () => {
    ok((await wordText()) === '도서관', '마우스 누르는 동안 제시어 보임');
  });
  ok((await wordText()) === '' && !(await body()).includes('도서관'), '마우스 떼면 가려짐');
  // 눌렀다가 밖으로 나가면 닫힘
  {
    const c = await center('role-card');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    ok((await wordText()) === '도서관', '다시 누름: 보임');
    await page.mouse.move(2, 2);
    ok((await wordText()) === '', '포인터가 카드 밖으로 나가면 가려짐');
    await page.mouse.up();
  }
  // 키보드
  await lg('role-card').focus();
  await page.keyboard.down('Space');
  ok((await wordText()) === '도서관', '스페이스 누르는 동안 보임');
  await page.keyboard.up('Space');
  ok((await wordText()) === '', '스페이스 떼면 가려짐');
  await page.keyboard.down('Enter');
  ok((await wordText()) === '도서관', '엔터 누르는 동안 보임');
  await page.keyboard.up('Enter');
  ok((await wordText()) === '', '엔터 떼면 가려짐');
  // 창이 가려지면 닫힘
  await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  ok((await wordText()) === '', '창 blur 면 가려짐');
  await page.keyboard.up('Space');

  // word 방식: 시민 vs 라이어(다른 단어) 카드가 같다
  const snap = async (extra) => {
    await set('reveal', extra);
    const rectHidden = await rect('role-card');
    const html = await page.evaluate(() => document.querySelector('[data-lg="role-card"]').outerHTML);
    let rectOpen;
    await holdMouse('role-card', async () => { rectOpen = await rect('role-card'); });
    return { rectHidden, rectOpen, html };
  };
  const cit = await snap({ my: { word: '도서관', role: null } });
  const liar = await snap({ my: { word: '박물관', role: null } });
  ok(cit.html === liar.html, '시민/라이어(word 방식): 카드 outerHTML 같음 (가려진 상태)');
  ok(cit.rectHidden === liar.rectHidden, `카드 크기 같음 (${cit.rectHidden})`);
  ok(cit.rectHidden === cit.rectOpen && liar.rectHidden === liar.rectOpen, '누르고 있어도 카드 크기 안 변함');
  const citRole = await snap({ my: { word: '도서관', role: 'citizen' } });
  ok(citRole.html === cit.html, 'role null 과 citizen 의 카드가 같다');
  // 단어가 아주 긴 경우에도 크기 같음
  const longW = await snap({ my: { word: '아주아주아주아주긴제시어입니다아주아주아주', role: null } });
  ok(longW.rectHidden === cit.rectHidden && longW.rectOpen === cit.rectHidden, '긴 단어에도 카드 크기 같음');

  // notice 라이어
  await set('reveal', { my: { word: null, role: 'liar' }, settings: { ...(await page.evaluate(() => window.h.last.settings)), liarMode: 'notice' } });
  ok(!(await body()).includes('당신은 라이어입니다'), 'notice 라이어: 누르기 전에는 문구도 숨김');
  let liarRect;
  await holdMouse('role-card', async () => {
    ok((await wordText()) === '당신은 라이어입니다', 'notice 라이어: 누르면 "당신은 라이어입니다"');
    liarRect = await rect('role-card');
  });
  ok(liarRect === cit.rectHidden, `notice 라이어 카드 크기가 시민과 같음 (${liarRect} vs ${cit.rectHidden})`);

  // 제시어에 태그
  await set('reveal', { my: { word: '<i>x</i>', role: null } });
  await holdMouse('role-card', async () => {
    ok((await wordText()) === '<i>x</i>', '제시어의 <i> 가 글자 그대로');
    ok((await page.locator('[data-lg="role-card"] i').count()) === 0, '<i> 요소가 생기지 않음');
  });

  // 구석 버튼
  await set('reveal');
  ok(!(await visible('myword')), 'reveal: myword 없음');
  for (const phase of ['speak', 'judge', 'discuss', 'revote', 'defense', 'judged']) {
    await set(phase);
    ok(await visible('myword'), `${phase}: myword 보임`);
    ok(await hitOk('myword'), `${phase}: myword 중심점 눌림`);
    ok(!(await visible('role-card')), `${phase}: 카드 없음`);
  }
  await set('speak');
  ok(!(await body()).includes('도서관'), 'speak: 누르기 전 제시어 글자 없음');
  await holdMouse('myword', async () => {
    const t = await page.locator('.lg-role-bubble').innerText();
    ok(t.includes('장소') && t.includes('도서관'), `speak: 누르는 동안 주제+제시어 (${t.replace(/\n/g, ' ')})`);
  });
  ok(!(await body()).includes('도서관'), 'speak: 떼면 사라짐');
  await set('judge');
  await lg('myword').focus();
  await page.keyboard.down('Enter');
  ok((await page.locator('.lg-role-bubble').innerText()).includes('도서관'), 'judge: 엔터 누르는 동안 보임');
  await page.keyboard.up('Enter');
  ok(!(await body()).includes('도서관'), 'judge: 엔터 떼면 사라짐');
  // 누르는 중에 단계가 바뀌면 닫힘
  await set('speak');
  {
    const c = await center('myword');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await set('unmask');
    await page.mouse.up();
  }
  ok(!(await body()).includes('도서관'), '누르는 중 unmask 가 되면 사라짐');
  // notice 라이어의 구석 버튼
  await set('speak', { my: { word: null, role: 'liar' } });
  await holdMouse('myword', async () => {
    ok((await page.locator('.lg-role-bubble').innerText()).includes('당신은 라이어입니다'), 'notice 라이어 myword 문구');
  });

  // 뿌리 요소 하나
  await set('reveal');
  ok((await page.locator('#ui > [class*="lg-role-"]').count()) === 1, 'ctx.root 에 붙은 role 요소 1개');
  ok((await page.evaluate(() => getComputedStyle(document.querySelector('#ui > [class*="lg-role-"]')).zIndex)) === '50', '뿌리 겹침 순서 50');
  // 카드가 숨은 동안 구석 버튼과 그 뒤 버튼이 눌림
  await set('speak');
  await page.evaluate(() => { const b = document.createElement('button'); b.id = 'behind'; b.style.cssText = 'position:fixed;left:50%;top:50%;width:40px;height:40px;z-index:10;pointer-events:auto'; document.body.append(b); });
  ok(await hitOk('myword'), '카드 숨김: 구석 버튼 눌림');
  ok(await page.evaluate(() => { const r = document.getElementById('behind').getBoundingClientRect(); return document.elementFromPoint(r.left + 20, r.top + 20).id === 'behind'; }), '카드 숨김: 뒤 버튼 눌림');
  await page.evaluate(() => document.getElementById('behind').remove());

  // 숨겨야 하는 단계
  for (const phase of ['unmask', 'guess', 'result', 'lobby']) {
    await set(phase);
    ok(!(await visible('role-card')) && !(await visible('myword')), `${phase}: 전부 숨김`);
  }
  await page.evaluate(() => window.h.apply(null));
  ok(!(await visible('role-card')) && !(await visible('myword')), 'update(null): 전부 숨김');

  // 관전자
  for (const phase of ['reveal', 'speak']) {
    await page.evaluate((ph) => {
      const s = window.h.stateFor(ph, { you: 'u5' });
      s.players.find((p) => p.id === 'u5').spectating = true;
      window.h.apply(s);
    }, phase);
    ok(!(await visible('role-card')) && !(await visible('myword')), `관전자 ${phase}: 숨김`);
  }
  // 제시어도 역할도 없음
  await set('reveal', { my: { word: null, role: null } });
  ok(!(await visible('role-card')), '제시어·역할 없음: 카드 없음');

  // 3명 판
  await set('reveal', {}, 3);
  ok(await visible('role-card'), '3명 판: 카드 보임');

  await page.evaluate(() => window.h.mod.dispose());
  ok((await page.locator('#ui > [class*="lg-role-"]').count()) === 0, 'dispose 뒤 role 요소 0개');
  ok(errors.length === 0, `콘솔 오류 0 (${errors.join(' | ')})`);
} finally {
  await browser.close();
  await server.close();
}
if (failed) { console.error(`실패 ${failed}개`); process.exit(1); }
console.log('모두 통과');
