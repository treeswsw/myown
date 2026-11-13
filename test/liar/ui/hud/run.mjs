// 상단 표시 시험 페이지 실행. node test/liar/ui/hud/run.mjs
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
  await page.goto(server.resolvedUrls.local[0] + 'test/liar/ui/hud/harness.html?nogl=1');
  await page.waitForFunction(() => window.__ready === true);

  const lg = (name) => page.locator(`[data-lg="${name}"]`);
  const text = async (name) => ((await lg(name).first().textContent()) || '').trim();
  const visible = (name) => lg(name).first().isVisible();
  const set = (...a) => page.evaluate((args) => { window.h.set(...args); }, a);
  const setNull = () => page.evaluate(() => window.h.apply(null));
  const press = async (name) => {
    const hit = await page.evaluate((n) => {
      const b = document.querySelector(`[data-lg="${n}"]`);
      const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!e && (e === b || b.contains(e));
    }, name);
    ok(hit, `${name} 버튼 중심점이 눌린다`);
    await lg(name).click();
  };

  // 단계 11개
  const want = {
    reveal: '역할', speak: '남은 발언시간', discuss: '투표 결과까지', revote: '재투표', defense: '최후 변론',
    judge: '찬반 투표', judged: '처형', unmask: '정체', result: '결과',
  };
  await set('lobby');
  ok(!(await visible('hud-title')), 'lobby: 상단 표시 숨김');
  for (const [phase, w] of Object.entries(want)) {
    await set(phase);
    ok((await text('hud-title')).includes(w), `${phase}: 제목에 "${w}" (${await text('hud-title')})`);
  }
  // guess·answer: 맨 위 작은 줄(Round·주제)만. 제목·초·안내 숨김
  for (const phase of ['guess', 'answer']) {
    await set(phase);
    ok((await text('hud-kicker')).includes('Round') && await visible('hud-kicker'), `${phase}: Round·주제 줄 보임`);
    ok(!(await visible('hud-title')) && !(await visible('hud-secs')) && !(await visible('hud-alert')), `${phase}: 제목·초·안내 숨김`);
  }
  await set('guess', { hostId: 'u0', you: 'u0' });
  ok(await visible('end'), 'guess: 방장에게 end 보임');
  await set('answer', { hostId: 'u0', you: 'u0' });
  ok(!(await visible('end')), 'answer: end 숨김');
  await set('judged', { judge: { picks: {}, executed: false } });
  ok((await text('hud-title')).includes('살림'), 'judged(살림): 제목 살림');

  // 발언 차례 문구
  await set('speak', { you: 'u1', speaker: 'u1' });
  let a = await text('hud-alert');
  ok(a.includes('당신의 발언시간입니다') && a.includes('라이어가 눈치채지 못하게 발언하세요'), '내 차례 문구');
  await set('speak', { you: 'u0' });
  ok((await text('hud-alert')).includes('상대방의 발언을 기다리고 있습니다'), '남의 차례 문구');
  await set('speak', { accuseNo: 1, round: 2 });
  ok((await text('hud-kicker')).includes('Round 2'), 'kicker Round');
  await set('discuss', { accuseNo: 2 });
  ok((await text('hud-kicker')).includes('2번째 지목'), 'kicker 2번째 지목');
  ok(!(await text('hud-kicker')).includes('1번째'), 'accuseNo 1이면 번째 없음');

  // 남은 초
  await set('speak');
  ok((await text('hud-secs')) === '30', '남은 초 30');
  await page.evaluate(() => { window.h.clock += 12_300; window.h.frame(0.1); });
  ok((await text('hud-secs')) === '18', '시계 12.3초 뒤 18');
  await page.evaluate(() => { window.h.clock += 100_000; window.h.frame(0.1); });
  ok((await text('hud-secs')) === '0', '0 아래로 안 간다');
  await set('judged');
  ok(!(await visible('hud-secs')), 'judged: 초 안 보임');

  // 큰 발언 글
  await set('speak');
  ok(!(await visible('hud-said')), '처음엔 발언 글 없음');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u1', name: '서아', text: '조용한 곳', ts: 1, kind: 'say' }));
  ok(await visible('hud-said'), 'say 뒤 발언 글 보임');
  const st = await text('hud-said');
  ok(st.includes('서아') && st.includes('조용한 곳'), `발언 글에 이름·글자 (${st})`);
  const color = await page.evaluate(() => document.querySelector('.lg-hud-who').style.color);
  ok(color !== '', '이름에 그 사람 색');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u1', name: '서아', text: '늦은 글', ts: 2, kind: 'late' }));
  ok((await text('hud-said')).includes('조용한 곳'), 'late 알림은 안 바꾼다');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u2', name: '지호', text: '잡담', ts: 3, kind: 'talk' }));
  ok(!(await text('hud-said')).includes('잡담'), 'talk 알림은 안 뜬다');
  await page.evaluate(() => window.h.frame(5));
  ok(!(await visible('hud-said')), '4초 뒤 사라짐');
  await set('defense');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u3', name: '병철', text: '저 아니에요', ts: 4, kind: 'plea' }));
  ok((await text('hud-said')).includes('저 아니에요'), 'plea 알림 뜸');
  await set('discuss');
  ok(!(await visible('hud-said')), '단계가 바뀌면 발언 글 사라짐');
  await set('discuss');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u1', name: '서아', text: '토론 중', ts: 5, kind: 'say' }));
  ok(!(await visible('hud-said')), '토론 중에는 안 뜬다');
  // 마지막 첫 설명: 서버가 곧바로 discuss 로 넘긴 뒤 도착한 say 도 4초 보인다(그 사람 것만, 한 번)
  await set('speak', { speaker: 'u2' });
  await set('discuss');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u1', name: '서아', text: '남의 글', ts: 6, kind: 'say' }));
  ok(!(await visible('hud-said')), '마지막 차례가 아닌 사람의 say 는 안 뜬다');
  await page.evaluate(() => window.h.mod.event({ k: 'chat', id: 'u2', name: '지호', text: '마지막 설명', ts: 7, kind: 'say' }));
  ok((await text('hud-said')).includes('마지막 설명'), 'speak→discuss 직후 마지막 차례의 say 가 뜬다');
  await set('discuss');
  ok(await visible('hud-said'), '토론 중 다른 갱신에도 4초 동안 남는다');
  await page.evaluate(() => window.h.frame(5));
  ok(!(await visible('hud-said')), '4초 뒤 사라짐(마지막 설명)');

  // 판 끝내기
  await set('discuss', { hostId: 'u5' });
  ok(!(await visible('end')), '방장이 아니면 end 없음');
  await set('lobby');
  ok(!(await visible('end')), 'lobby: end 없음');
  await set('result');
  ok(!(await visible('end')), 'result: end 없음');
  await set('discuss');
  ok(await visible('end'), '방장은 end 보임');
  ok(!(await visible('end-yes')), '확인 전 end-yes 숨김');
  await page.evaluate(() => { window.h.sent.length = 0; });
  await press('end');
  ok(await visible('end-yes'), 'end 뒤 end-yes 보임');
  await press('end-yes');
  let sent = await page.evaluate(() => window.h.sent);
  ok(sent.length === 1 && sent[0].t === 'lg' && sent[0].a === 'end', `end-yes 뒤 {t:'lg',a:'end'} 한 번 (${JSON.stringify(sent)})`);
  ok(await visible('end'), '예 뒤 end 버튼 다시 보임');
  await page.evaluate(() => { window.h.sent.length = 0; });
  await press('end');
  await press('end-no');
  sent = await page.evaluate(() => window.h.sent);
  ok(sent.length === 0, 'end-no 면 보내지 않음');
  ok(!(await visible('end-yes')), 'end-no 뒤 확인 닫힘');

  // 3명 판, 관전자
  await set('speak', {}, 3);
  ok((await text('hud-title')).includes('남은 발언시간'), '3명 판 speak');
  await page.evaluate(() => {
    const s = window.h.stateFor('speak', { you: 'u5' });
    s.players.find((p) => p.id === 'u5').spectating = true;
    window.h.apply(s);
  });
  ok((await text('hud-alert')).includes('구경 중'), '관전자 문구');

  // 비밀(CONTRACTS 0-5): 'word' 방식에서 unmask 전에는 제시어가 달라도(라이어/시민) 화면이 같아야 한다
  for (const phase of ['reveal', 'speak', 'discuss', 'revote', 'defense', 'judge', 'judged']) {
    const html = (word) => page.evaluate(([p, w]) => {
      window.h.set(p, { my: { word: w, role: null } });
      return document.querySelector('.lg-hud-root').outerHTML;
    }, [phase, word]);
    ok((await html('도서관')) === (await html('영화관')), `${phase}: 제시어가 달라도 화면이 같다`);
  }

  // null
  await setNull();
  const anyVisible = await page.evaluate(() => [...document.querySelectorAll('[data-lg]')].some((n) => n.getClientRects().length > 0));
  ok(!anyVisible, 'update(null): 전부 숨김');

  ok(errors.length === 0, `콘솔 오류 0 (${errors.join(' | ')})`);
} finally {
  await browser.close();
  await server.close();
}
if (failed) { console.error(`실패 ${failed}개`); process.exit(1); }
console.log('모두 통과');
