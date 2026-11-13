// 3D 장면 자기 시험: 렌더러 없이 장면을 만들고 확인한다. node test/liar/ui/scene/run.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'test/liar/ui/scene/harness.html?nogl=1';
const browser = await chromium.launch();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const consoleErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.h && window.h.ready, null, { timeout: 20000 });

  for (const n of [8, 3]) {
    const r = await page.evaluate((n) => {
      const { sc, players, frames, countMannequins } = window.h;
      sc.setPlayers(players(n), 'u0');
      frames(30);
      const pos = Array.from({ length: n }, (_, i) => sc.screenPos('u' + i));
      return { pos, count: countMannequins(), seatPos: sc.seatPos('u0'), none: sc.screenPos('zzz') };
    }, n);
    ok(r.count === n, `${n}명: 마네킹 ${r.count}개`);
    ok(r.pos.every((p) => p && p.x >= 0 && p.x <= 844 && p.y >= 0 && p.y <= 390), `${n}명: 전체 보기에서 전원 화면 안 ${JSON.stringify(r.pos.map((p) => p && [Math.round(p.x), Math.round(p.y)]))}`);
    ok(r.seatPos && r.seatPos.z > 0.9, `${n}명: 내 seatPos 가 화면 앞`);
    ok(r.none === null, '없는 사람 screenPos null');
  }

  // 8명으로 되돌리고 포커스
  const f = await page.evaluate(() => {
    const { sc, players, frames } = window.h;
    sc.setPlayers(players(8), 'u0'); frames(30);
    const before = sc.camera.position.clone();
    sc.setView({ mode: 'focus', id: 'u4' });
    frames(60);
    const after = sc.camera.position.clone();
    const seat = sc.seatPos('u4');
    const dist = Math.hypot(after.x - seat.x, after.z - seat.z);
    sc.setView({ mode: 'table' }, true);
    const back = sc.camera.position.distanceTo(before);
    return { moved: before.distanceTo(after), dist, back };
  });
  ok(f.moved > 1, `포커스 뒤 카메라 이동 ${f.moved.toFixed(2)}`);
  ok(f.dist < 2.6, `포커스 카메라가 발언자 가까이 (${f.dist.toFixed(2)})`);
  ok(f.back < 0.01, '전체 보기로 cut 하면 원래 자리');

  // 줄였다 늘려도 수가 맞고, 나간 사람 정리
  const c = await page.evaluate(() => {
    const { sc, players, frames, countMannequins } = window.h;
    const out = [];
    for (const n of [5, 3, 8, 4]) { sc.setPlayers(players(n), 'u0'); frames(2); out.push(countMannequins()); }
    sc.setPlayers(players(4), 'u0'); out.push(countMannequins());   // 같은 값 다시
    sc.setFace('u1', null); frames(1);
    return out;
  });
  ok(JSON.stringify(c) === '[5,3,8,4,4]', `사람 수 변화 ${JSON.stringify(c)}`);

  // 관전자 시점
  const sp = await page.evaluate(() => {
    const { sc, players, frames } = window.h;
    sc.setPlayers([...players(4), { id: 'sp', name: '관', color: '#888888', body: 0, seat: null }], 'sp'); frames(5);
    return { has: sc.screenPos('sp'), u0: sc.screenPos('u0') };
  });
  ok(sp.has === null && sp.u0 !== null, '관전자는 자리 없음, 나머지는 보임');

  // 3D-2: 화살표·정체 공개·찬반 조명
  const t = await page.evaluate(() => {
    const { sc, players, frames } = window.h;
    sc.setPlayers(players(8), 'u0'); frames(10);
    const r = {};
    sc.setVotes({ u0: 'u3', u1: 'u3', u2: 'u3', u3: 'u0', zzz: 'u1', u4: 'zzz' });
    frames(10); r.votes = sc.stats().arrows;
    const meshes = () => { let n = 0; sc.scene.traverse((o) => { if (o.isMesh && o.parent && o.parent.name === 'liar-arrows') n++; }); return n; };
    r.meshes = meshes();
    const g = sc.scene.getObjectByName('liar-arrows');
    const geo = g.children.map((m) => m.geometry);
    sc.setVotes({ u0: 'u3', u1: 'u3', u2: 'u3', u3: 'u0' }); frames(1);
    r.same = g.children.every((m, i) => m === g.children[i]) && g.children.map((m) => m.geometry).every((x, i) => x === geo[i]);
    sc.setVotes({ u0: 'u3' }); r.fewer = sc.stats().arrows; r.meshesFewer = meshes();
    sc.setVotes({}); r.cleared = sc.stats().arrows;
    sc.setVotes({ u0: 'u1' }); sc.setVotes(null); r.nulled = sc.stats().arrows;
    sc.setVotes({ u0: 'u1' }); sc.setPlayers(players(5), 'u0'); frames(2); r.afterResize = sc.stats().arrows;
    sc.setPlayers(players(8), 'u0'); frames(2); r.afterBack = sc.stats().arrows;
    sc.setVotes(null);
    // 정체 공개
    const before = sc.camera.position.clone();
    sc.setView({ mode: 'liar', id: 'u4' }); frames(60);
    r.beamOn = sc.stats().beam && sc.stats().beamOn;
    r.camDist = Math.hypot(sc.camera.position.x - sc.seatPos('u4').x, sc.camera.position.z - sc.seatPos('u4').z);
    r.camMoved = before.distanceTo(sc.camera.position);
    const lights = []; sc.scene.traverse((o) => { if (o.isSpotLight) lights.push([o.castShadow, o.intensity]); });
    r.dark = lights.filter(([c]) => c).every(([, v]) => v < 1) && lights.some(([c, v]) => !c && v > 50) ? 'ok' : 'bad';
    sc.setView({ mode: 'table' }); frames(200);
    r.beamOff = !sc.stats().beam && !sc.stats().beamOn;
    const lamp = []; sc.scene.traverse((o) => { if (o.isSpotLight && o.castShadow) lamp.push(o.intensity); });
    r.lampBack = lamp[0];
    sc.setView({ mode: 'liar', id: 'nobody' }); frames(5);
    r.badId = sc.stats().beam;
    // 찬반
    sc.setJudge({ u1: 'yes', u2: 'no', u3: 'yes', zzz: 'yes', u5: 'maybe' }); frames(10);
    r.judgeOn = sc.stats();
    sc.setJudge({ u1: 'yes' }); r.judgeLess = sc.stats().judge;
    sc.setJudge(null); r.judgeOff = sc.stats().judge;
    return r;
  });
  ok(t.votes === 4, `화살표 수 = 표 수 (없는 id 제외) ${t.votes}`);
  ok(t.meshes === 12, `화살표 하나당 면 3개 ${t.meshes}`);
  ok(t.same, '같은 값으로 다시 부르면 그대로(지오메트리 안 바뀜)');
  ok(t.fewer === 1 && t.meshesFewer === 3, '표가 줄면 화살표도 줄어든다');
  ok(t.cleared === 0 && t.nulled === 0, '{}·null 이면 전부 지움');
  ok(t.afterResize === 1 && t.afterBack === 1, '자리 수가 바뀌어도 표는 유지(없는 사람 것만 사라짐)');
  ok(t.beamOn, 'setView liar 뒤 빛기둥이 보임');
  ok(t.camDist < 2.6 && t.camMoved > 1, `라이어 클로즈업 ${t.camDist.toFixed(2)}`);
  ok(t.dark === 'ok', '정체 공개 중 램프가 어두워짐');
  ok(t.beamOff, 'table 로 돌아가면 빛기둥이 꺼짐');
  ok(Math.abs(t.lampBack - 58) < 0.5, `조명이 원래대로 ${t.lampBack}`);
  ok(t.badId === false, '없는 id 면 table 과 같게(빛기둥 없음)');
  ok(t.judgeOn.judge === 3 && t.judgeOn.yes === 2 && t.judgeOn.no === 1, `찬반 조명 ${JSON.stringify(t.judgeOn)}`);
  ok(t.judgeLess === 1 && t.judgeOff === 0, '찬반 조명 줄고 꺼짐');

  const d = await page.evaluate(() => {
    const { sc, frames } = window.h;
    sc.setVotes({ u0: 'u1' }); sc.setJudge({ u1: 'yes' }); sc.setView({ mode: 'liar', id: 'u1' });
    sc.dispose(); frames(3);
    sc.setVotes({ u0: 'u1' }); sc.setJudge({ u1: 'no' }); sc.setView({ mode: 'liar', id: 'u1' });
    return { sp: sc.screenPos('u0'), kids: sc.scene.children.length };
  });
  ok(d.sp === null && d.kids === 0, 'dispose 뒤 비어 있고 오류 없음');
  ok(consoleErrors.length === 0 && (await page.evaluate(() => window.h.errors.length)) === 0, `콘솔 오류 0 ${consoleErrors.join(' | ')}`);
} catch (e) {
  fail++; console.log('FAIL 예외', e);
} finally {
  await browser.close();
  await server.close();
}
console.log(fail ? `실패 ${fail}` : '통과');
process.exit(fail ? 1 : 0);
