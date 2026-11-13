// 요트 3D 굴림 재생 시험(렌더러 없음: 장면은 진짜, 그리기만 없다). node test/yacht/ui/roll/run.mjs
// 확인: 같은 알림 = 같은 움직임, 끝 자리 = 상태 자리, 끝 윗면 = 서버 눈(36쌍), skip 직후 끝 모습, 프레임을 건너뛰어도 같은 끝.
// 3D 모양·움직임의 느낌·소리는 여기서 볼 수 없다(실기기 확인).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
const consoleErrors = [];
try {
  async function open(query = '') {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(`${base}test/yacht/ui/roll/harness.html?nogl=1${query}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
    return page;
  }

  // 소스 검사
  for (const f of ['client/src/yacht/ui/dice3d.js', 'client/src/yacht/anim/player.js', 'client/src/yacht/anim/fx.js', 'client/src/yacht/audio.js']) {
    ok(!/Math\.random\s*\(/.test(readFileSync(path.join(root, f), 'utf8')), `${f}: Math.random 없음`);
  }
  ok(!/from '\.\/dice3d\.js'|from 'three'/.test(readFileSync(path.join(root, 'client/src/yacht/ui/board.js'), 'utf8')), 'board.js 는 3D 판을 import() 로만 부른다');

  const A = await open(), B = await open();

  // ---------- 같은 알림 = 같은 움직임 ----------
  const SEED = 123456789, VS = [4, 4, 6, 2, 5], KEPT = { 0: 0, 1: 1 };
  const run = (page, times) => page.evaluate(async ([seed, vs, kept, ts]) => {
    const h = window.h;
    h.make(); h.now = 0;
    const e = h.rollEvent(seed, vs, kept);
    h.view.draw({ dice: null, shaking: true, cupHasDice: true });
    let done = false;
    h.view.playRoll(e).then(() => { done = true; });
    const dur = 450 + h.simulateRoll(seed, e.thrown).ms;
    const shots = {};
    for (const t of ts) { h.at(t === 'end' ? dur + 1 : t); shots[t] = h.peek(); }
    await Promise.resolve();
    return { e, dur, shots, done };
  }, [SEED, VS, KEPT, times]);
  const a = await run(A, [500, 1000, 'end']);
  const b = await run(B, [500, 1000, 'end']);
  for (const t of [500, 1000, 'end']) {
    ok(JSON.stringify(a.shots[t]) === JSON.stringify(b.shots[t]), `두 화면: ${t === 'end' ? '끝' : t / 1000 + '초'} 시각의 다섯 주사위 자리·자세가 같다`);
  }
  const mid = a.shots[1000], fin = a.shots.end;
  ok([2, 3, 4].every((i) => !mid[i].hidden && mid[i].pos.every(Number.isFinite)), '1.0초: 굴린 주사위 3개가 트레이 위에서 움직이는 중');
  ok([2, 3, 4].some((i) => Math.hypot(mid[i].pos[0] - fin[i].pos[0], mid[i].pos[2] - fin[i].pos[2]) > 0.05 || mid[i].pos[1] > 0.75), '1.0초 모습은 끝 모습과 다르다(실제로 재생된다)');
  ok(a.done === true, '끝 시각이 지나면 playRoll 이 끝난다');
  ok(a.dur <= 2950 && a.dur >= 1300, `재생 길이 ${Math.round(a.dur)}ms (1.3~2.95초)`);

  // ---------- 끝 자리 = 상태 자리, 보관 주사위는 그대로 ----------
  ok([2, 3, 4].every((i) => fin[i].pos[0] === a.e.dice[i].x && fin[i].pos[2] === a.e.dice[i].z && fin[i].pos[1] === 0.7), '끝 자리 = 알림(상태)의 x, z 그대로, 바닥에 평평하게');
  ok([2, 3, 4].every((i) => fin[i].x === a.e.dice[i].x.toFixed(3) && fin[i].z === a.e.dice[i].z.toFixed(3)), '끝 자리 표식(소수 3자리) = 상태');
  ok([0, 1].every((i) => JSON.stringify(a.shots[500][i]) === JSON.stringify(fin[i]) && !fin[i].hidden), '보관 주사위 2개는 재생 내내 움직이지 않는다');
  const endQ = await A.evaluate(([e]) => [2, 3, 4].map((i) => {
    const want = window.h.restQuat(e.dice[i].v, e.dice[i].yaw), got = window.h.view.peek(i).quat;
    return Math.abs(want[0] * got[0] + want[1] * got[1] + want[2] * got[2] + want[3] * got[3]);
  }), [a.e]);
  ok(endQ.every((d) => d > 0.999999), '끝 자세 = restQuat(서버 눈, 서버 yaw)');
  const sceneSame = await A.evaluate(() => {
    const sc = window.h.view.scene.scene;
    return [0, 1, 2, 3, 4].every((i) => {
      const m = sc.getObjectByName(`yt-die-${i}`), p = window.h.view.peek(i);
      return m && m.visible && Math.abs(m.position.x - p.pos[0]) < 1e-6 && Math.abs(m.position.z - p.pos[2]) < 1e-6
        && Math.abs(m.quaternion.x * p.quat[0] + m.quaternion.y * p.quat[1] + m.quaternion.z * p.quat[2] + m.quaternion.w * p.quat[3]) > 0.999999;
    });
  });
  ok(sceneSame, '장면의 주사위 5개가 같은 자리·자세로 놓여 있다');

  // ---------- 끝 윗면 눈 = 서버 눈 (멈춘 면 6 × 서버 눈 6 = 36쌍) ----------
  const pairs = await A.evaluate(async () => {
    const h = window.h, seen = new Set(), bad = [];
    let nearEnd = 0;
    for (let seed = 1; seed <= 400 && seen.size < 36; seed++) {
      const ups = h.simulateRoll(seed, [0, 1, 2, 3, 4], { frames: false }).rest.map((r) => r.up);
      // 아직 못 본 (멈춘 면, 서버 눈) 쌍이 나오도록 눈을 고른다
      const vs = ups.map((up) => { for (let v = 1; v <= 6; v++) if (!seen.has(up + ':' + v)) return v; return 1; });
      if (!ups.some((up, k) => !seen.has(up + ':' + vs[k]))) continue;
      const e = h.rollEvent(seed, vs);
      h.make(); h.now = 0;
      h.view.playRoll(e);
      const dur = 450 + h.simulateRoll(seed, e.thrown).ms;
      h.at(dur - 250);      // 서버 자리로 맞추기 전(경로만 재생된 모습)에도 이미 서버 눈이 위
      for (let i = 0; i < 5; i++) { const t = h.topOf(h.view.peek(i).quat); if (t.v === vs[i] && t.cos > 0.9) nearEnd++; else bad.push(['전', seed, i, ups[i], vs[i], t.v]); }
      h.at(dur + 1);
      for (let i = 0; i < 5; i++) {
        const t = h.topOf(h.view.peek(i).quat);
        if (t.v !== vs[i] || t.cos < 0.999999) bad.push(['끝', seed, i, ups[i], vs[i], t.v]);
        seen.add(ups[i] + ':' + vs[i]);
      }
    }
    return { n: seen.size, bad, nearEnd };
  });
  ok(pairs.n === 36 && pairs.bad.length === 0, `36쌍 모두: 멈춘 윗면 = 서버 눈 (${pairs.n}쌍, 어긋남 ${JSON.stringify(pairs.bad.slice(0, 3))})`);

  // ---------- skip 직후 끝 모습 ----------
  const sk = await A.evaluate(async ([seed, vs, kept]) => {
    const h = window.h;
    h.make(); h.now = 0;
    const e = h.rollEvent(seed, vs, kept);
    let done = false;
    h.view.playRoll(e).then(() => { done = true; });
    h.at(100);
    h.view.skip();
    await Promise.resolve();
    return { shot: h.peek(), done };
  }, [SEED, VS, KEPT]);
  ok(sk.done && JSON.stringify(sk.shot) === JSON.stringify(fin), 'skip() 직후: 끝 모습이고 playRoll 이 끝난다');

  // ---------- 재생기를 못 만들어도 playRoll 이 끝난다(입력이 막히지 않는다) ----------
  const bad = await A.evaluate(async ([seed, vs, kept]) => {
    const h = window.h;
    h.make(); h.now = 0;
    const e = h.rollEvent(seed, vs, kept);
    let done = false;
    h.view.playRoll({ ...e, thrown: null }).then(() => { done = true; });
    await Promise.resolve();
    return done;
  }, [SEED, VS, KEPT]);
  ok(bad === true, '재생기 생성 오류: playRoll 이 끝난다(busy 가 풀린다)');

  // ---------- 프레임을 건너뛰어도 같은 끝, 같은 시각에 같은 자리 ----------
  const jump = await B.evaluate(async ([seed, vs, kept]) => {
    const h = window.h;
    const play = (steps) => { h.make(); h.now = 0; h.view.playRoll(h.rollEvent(seed, vs, kept)); const out = []; for (const t of steps) { h.at(t); if (t === 1200 || t === 5000) out.push(h.peek()); } return out; };
    const smooth = []; for (let t = 0; t < 1200; t += 16) smooth.push(t); smooth.push(1200, 5000);
    return { a: play(smooth), b: play([700, 1200, 5000]), c: play([5000]) };
  }, [SEED, VS, KEPT]);
  ok(JSON.stringify(jump.a[0]) === JSON.stringify(jump.b[0]), '프레임을 건너뛰어도 1.2초 시각의 자리가 같다');
  ok(JSON.stringify(jump.a[1]) === JSON.stringify(jump.b[1]) && JSON.stringify(jump.c[0]) === JSON.stringify(fin), '프레임을 건너뛰어도(한 번에 끝으로 가도) 끝 모습이 같다');

  // ---------- 줄인 연출: 마지막 0.4초만 ----------
  const red = await B.evaluate(async ([seed, vs, kept]) => {
    const h = window.h;
    h.make({ reduced: true }); h.now = 0;
    let done = false;
    h.view.playRoll(h.rollEvent(seed, vs, kept)).then(() => { done = true; });
    h.at(200); const midShown = h.peek().slice(2).every((d) => !d.hidden);
    h.at(401); await Promise.resolve();
    return { done, midShown, shot: h.peek() };
  }, [SEED, VS, KEPT]);
  ok(red.done && red.midShown && JSON.stringify(red.shot) === JSON.stringify(fin), '줄인 연출: 0.4초 만에 같은 끝 모습');

  // ---------- 컵 흔들기·보관 ----------
  const misc = await A.evaluate(async ([seed, vs, kept]) => {
    const h = window.h;
    h.make(); h.now = 0;
    const e = h.rollEvent(seed, vs, kept);
    h.view.draw({ dice: e.dice.map((d) => ({ ...d })), shaking: false, cupHasDice: false });
    const hit = [0, 1, 2, 3, 4].map((i) => h.view.hitOf(i));
    h.view.setShaking(true); h.at(400);
    const inCup = h.peek().map((d) => d.hidden);
    h.view.setShaking(false); h.at(900);
    const back = h.peek();
    let kd = false;
    h.view.playKeep({ i: 2, on: true, slot: 2 }).then(() => { kd = true; });
    h.at(1200); await Promise.resolve();
    const slot2 = document.querySelector('[data-yt="slot-2"]').getAttribute('data-v');
    return { hit, inCup, back, kd, slot2, e };
  }, [SEED, VS, KEPT]);
  ok(misc.hit.every((r) => r && r.w >= 38 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 880 && r.y + r.h <= 666), '주사위 5개의 누르는 자리(hitOf)가 판 안에 있고 38px 이상');
  ok(JSON.stringify(misc.inCup) === JSON.stringify([false, false, true, true, true]), '흔드는 동안: 굴릴 주사위 3개는 컵 안, 보관 2개는 그대로');
  ok([2, 3, 4].every((i) => !misc.back[i].hidden && misc.back[i].pos[0] === misc.e.dice[i].x && misc.back[i].pos[2] === misc.e.dice[i].z), '굴리지 않고 흔들기를 끝내면 제자리로 돌아온다');
  ok(misc.kd && misc.slot2 === String(VS[2]), '보관 연출이 끝나고 보관 칸 표식이 붙는다');

  // ---------- board.js 가 스스로 3D 판으로 바꾼다 ----------
  const C = await open('&board=1');
  await C.waitForFunction(() => document.querySelector('[data-yt="view3d"]') && !document.querySelector('.yt-bd-view'), null, { timeout: 10000 });
  ok(await C.evaluate(() => window.h.used.at(-1) === true), 'board: WebGL 을 쓸 수 있으면 3D 판으로 바꾸고 stage.use 를 건다');
  await C.evaluate(() => { const h = window.h; h.update = (s) => h.board.update(s); h.update({ ...h.F.myTurnFresh }); });
  ok(await C.locator('[data-yt="cup"]').count() === 1, 'board(3D): 내 차례 컵 버튼');
  const ev = await C.evaluate(() => { const h = window.h; const e = h.rollEvent(77, [3, 3, 5, 1, 6], {}, { rollNo: 1, rollsLeft: 2 }); h.board.handleEvent(e); return e; });
  ok(await C.evaluate(() => window.h.busy.at(-1)) === true, 'board(3D): 굴림 연출 중 onBusy(true)');
  await C.waitForFunction(() => window.h.busy.at(-1) === false, null, { timeout: 6000 });
  await C.evaluate(([e]) => { const h = window.h; h.update({ ...h.F.myTurnRolled, dice: e.dice, rollNo: 1, rollsLeft: 2, pick: null }); }, [ev]);
  await sleep(100);
  const btn = await C.evaluate(() => [0, 1, 2, 3, 4].map((i) => {
    const b = document.querySelector(`button[data-yt="die-${i}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { v: b.getAttribute('data-v'), x: b.getAttribute('data-x'), z: b.getAttribute('data-z'), top: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b };
  }));
  ok(btn.every((b, i) => b && b.v === String(ev.dice[i].v) && b.x === ev.dice[i].x.toFixed(3) && b.z === ev.dice[i].z.toFixed(3) && b.top), 'board(3D): 연출 뒤 주사위 버튼 5개가 상태의 눈·자리로, 가려지지 않고 놓인다');
  await C.locator('[data-yt="die-3"]').click();
  ok(await C.evaluate(() => { const m = window.h.sent.at(-1); return m && m.a === 'keep' && m.i === 3 && m.on === true; }), 'board(3D): 주사위를 누르면 keep 전송');

  const pageErrors = [...(await A.evaluate(() => window.h.errors)), ...(await B.evaluate(() => window.h.errors)), ...(await C.evaluate(() => window.h.errors))];
  ok(consoleErrors.length === 0 && pageErrors.length === 0, `콘솔·페이지 오류 0개 ${JSON.stringify([...consoleErrors, ...pageErrors].slice(0, 3))}`);
} catch (e) {
  failed++;
  console.error('실패(예외):', e);
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `\n실패 ${failed}개` : '\n모두 통과');
process.exit(failed ? 1 : 0);
