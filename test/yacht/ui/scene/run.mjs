// 요트다이스 3D 장면 자기 시험: 렌더러 없이(?nogl=1) 장면을 만들고 확인한다. node test/yacht/ui/scene/run.mjs
// 3D 모양·색·그림자·성능은 여기서 볼 수 없다(실기기 확인: harness.html?gl=1).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'test/yacht/ui/scene/harness.html?nogl=1';
const browser = await chromium.launch();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const consoleErrors = [];

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.h && window.h.ready, null, { timeout: 20000 });
  return page;
}

try {
  // 소스 검사: Math.random 금지, 다른 폴더 import 없음
  const dir = path.join(root, 'client/src/yacht/scene');
  const src = readdirSync(dir).map((f) => [f, readFileSync(path.join(dir, f), 'utf8')]);
  ok(src.length === 5 && src.every(([, s]) => !/Math\.random\s*\(/.test(s)), 'scene 폴더 5개 파일에 Math.random 없음');
  ok(src.every(([, s]) => [...s.matchAll(/from '([^']+)'/g)].every((m) => m[1] === 'three' || /^\.\/(index|tray|cup|die|quality)\.js$/.test(m[1]))), 'three 와 같은 폴더만 import');

  const page = await open(1280, 720);

  // 시작 단계
  const start = await page.evaluate(() => {
    const { mod, mkStage } = window.h;
    const make = (over) => { const s = mod.createYachtScene({ stage: mkStage(over) }); const q = s.quality(); s.dispose(); return q; };
    return [make({}), make({ size: { w: 844, h: 390 } }), make({ isLowPower: () => true }), make({ size: { w: 1024, h: 768 } })];
  });
  ok(JSON.stringify(start) === '[2,1,0,2]', `시작 단계: PC 2, 휴대폰(짧은 변 390) 1, 저사양 0, 태블릿 2 → ${JSON.stringify(start)}`);

  // 화면 맞춤: 트레이 네 귀퉁이 = 네모 네 귀퉁이
  const fit = await page.evaluate(() => {
    const { mod, mkStage } = window.h;
    const sc = mod.createYachtScene({ stage: mkStage() });
    window.sc = sc;
    const out = [];
    const cases = [[{ x: 520, y: 70, w: 620, h: 620 }, { w: 1280, h: 720 }], [{ x: 548, y: 60, w: 290, h: 290 }, { w: 844, h: 390 }],
      [{ x: 400, y: 54, w: 880, h: 666 }, { w: 1280, h: 720 }], [{ x: 0, y: 0, w: 2048, h: 2048 }, { w: 2732, h: 2048 }]];
    for (const [r, vp] of cases) {
      sc.setRect(r, vp);
      const side = Math.min(r.w, r.h), x = r.x + (r.w - side) / 2, y = r.y + (r.h - side) / 2;
      const want = [[x, y], [x + side, y], [x + side, y + side], [x, y + side]];
      const got = mod.TRAY_CORNERS.map((p) => sc.project(p));
      const err = Math.max(...got.map((g, i) => Math.max(Math.abs(g.x - want[i][0]), Math.abs(g.y - want[i][1]))));
      // 트레이 안 모습: 네모 기준 비율로 본 자리(펠트 귀퉁이, 주사위 윗면, 컵 자리, 보관 칸)
      const rel = [[-5, 0, -5], [5, 0, 5], [2.2, 1.4, 2.0], [-4, 0.7, 4], [mod.CUP.x, 6, mod.CUP.z], ...[0, 1, 2, 3, 4].map((i) => [mod.slotPos(i)[0], 1.4, mod.slotPos(i)[1]])]
        .map((p) => { const g = sc.project(p); return [(g.x - x) / side, (g.y - y) / side]; });
      out.push({ err, rel });
    }
    return out;
  });
  fit.forEach((f, i) => ok(f.err <= 2, `setRect ${i + 1}: 트레이 네 귀퉁이가 네모 네 귀퉁이 ±2px (오차 ${f.err.toFixed(3)}px)`));
  const same = Math.max(...fit.slice(1).map((f) => Math.max(...f.rel.map((p, i) => Math.max(Math.abs(p[0] - fit[0].rel[i][0]), Math.abs(p[1] - fit[0].rel[i][1]))))));
  ok(same < 1e-4, `화면 크기가 달라도 트레이 안 모습이 같다(비율 차이 ${same.toExponential(1)})`);
  const rel = fit[0].rel;
  ok(rel.slice(0, 4).every((p) => p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98), `펠트·주사위가 트레이 네모 안 ${JSON.stringify(rel.slice(0, 2).map((p) => p.map((v) => +v.toFixed(3))))}`);
  const slots = rel.slice(5);
  ok(slots.every((p, i) => (i === 0 || p[0] > slots[i - 1][0] + 0.1) && p[1] < rel[0][1] && p[1] > 0.02), '보관 칸 5개: 왼쪽부터 차례로, 펠트 위쪽·트레이 안');
  ok(rel[1][1] - rel[0][1] > 0.6 && rel[1][0] - rel[0][0] > 0.6, `펠트가 트레이 네모의 ${(100 * (rel[1][0] - rel[0][0])).toFixed(0)}% 폭`);

  // 주사위: 자리·회전·면 배치
  const die = await page.evaluate(() => {
    const { THREE, mod, rest } = window.h, sc = window.sc, r = {};
    const mesh = (i) => sc.scene.getObjectByName('yt-die-' + i);
    r.count = [0, 1, 2, 3, 4].filter((i) => mesh(i)).length;
    r.hidden0 = [0, 1, 2, 3, 4].every((i) => !mesh(i).visible);
    sc.setDie(2, { pos: [2.2, 0.7, 2.0], quat: rest(6, 2.7) });
    r.pos = mesh(2).position.toArray(); r.vis = mesh(2).visible;
    // fix: 경로 자세 × 면 배치 회전
    const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.7)), qf = new THREE.Quaternion(...mod.upQuat(5));
    sc.setDie(3, { pos: [-1, 3, 0.5], quat: qa.toArray(), fix: qf.toArray() });
    r.fix = mesh(3).quaternion.angleTo(qa.clone().multiply(qf));
    sc.setDieHidden(3, true); r.hid = mesh(3).visible; sc.setDieHidden(3, false); r.shown = mesh(3).visible;
    // 면 배치: +y 1, -y 6, +x 3, -x 4, +z 2, -z 5. 보관 칸에 눈 v 를 놓으면 그 면이 위.
    const want = { 1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
    const g = mesh(0).geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    r.up = []; r.cell = []; r.slotAt = [];
    for (let v = 1; v <= 6; v++) {
      sc.setDieSlot(0, v % 5, v);
      const n = new THREE.Vector3(...want[v]).applyQuaternion(mesh(0).quaternion);
      r.up.push(n.y);
      const [sx, sz] = mod.slotPos(v % 5);
      r.slotAt.push(Math.hypot(mesh(0).position.x - sx, mesh(0).position.z - sz) + Math.abs(mesh(0).position.y - 0.7));
      // 그 면 한가운데 꼭짓점들의 그림 칸
      let cell = -1;
      for (let i = 0; i < P.count; i++) {
        if (N.getX(i) * want[v][0] + N.getY(i) * want[v][1] + N.getZ(i) * want[v][2] > 0.999) {
          // 평평한 곳의 네 꼭짓점 가운데 = 면 한가운데
          let u = 0, w = 0, k = 0;
          for (let j = 0; j < P.count; j++) if (N.getX(j) * want[v][0] + N.getY(j) * want[v][1] + N.getZ(j) * want[v][2] > 0.999) { u += U.getX(j); w += U.getY(j); k++; }
          cell = Math.floor((u / k) * 3) + 3 * Math.floor((w / k) * 2);
          break;
        }
      }
      r.cell.push(cell);
    }
    // 그림: 칸마다 검은 눈의 수
    const img = mesh(0).material.map.image, cs = img.width / 3, ctx = img.getContext('2d');
    r.pips = [];
    for (let v = 1; v <= 6; v++) {
      const col = (v - 1) % 3, row = Math.floor((v - 1) / 3), d = ctx.getImageData(col * cs, (1 - row) * cs, cs, cs).data;
      let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 70) dark++;
      r.pips.push(dark / (Math.PI * (0.105 * cs) ** 2));
    }
    // 모양 검사: 숫자가 아닌 값 없음, 법선 길이 1, 면의 앞쪽이 법선 쪽
    const check = (geo) => {
      const p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
      let bad = 0, flipped = 0;
      for (let i = 0; i < p.count; i++) { if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) bad++; if (Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) > 1e-3) bad++; }
      for (let i = 0; i < ix.count; i += 3) {
        a.fromBufferAttribute(p, ix.getX(i)); b.fromBufferAttribute(p, ix.getX(i + 1)); c.fromBufferAttribute(p, ix.getX(i + 2));
        f.copy(b).sub(a).cross(c.sub(a));
        if (f.length() < 1e-9) continue;
        const k = ix.getX(i);
        if (f.x * n.getX(k) + f.y * n.getY(k) + f.z * n.getZ(k) < 0) flipped++;
      }
      return { bad, flipped, tris: ix.count / 3 };
    };
    r.dieGeo = check(g);
    r.rimGeo = check(sc.scene.getObjectByName('yt-rim').geometry);
    r.cupGeo = check(sc.scene.getObjectByName('yt-cup-out').geometry);
    const box = new THREE.Box3().setFromBufferAttribute(P), rim = new THREE.Box3().setFromBufferAttribute(sc.scene.getObjectByName('yt-rim').geometry.attributes.position);
    r.dieSize = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
    r.rim = [rim.min.x, rim.max.x, rim.min.z, rim.max.z, rim.max.y];
    return r;
  });
  ok(die.count === 5 && die.hidden0, '주사위 5개, 처음에는 전부 숨김');
  ok(die.vis && Math.hypot(die.pos[0] - 2.2, die.pos[1] - 0.7, die.pos[2] - 2.0) < 1e-6, 'setDie: 받은 자리 그대로(트레이 단위)');
  ok(die.fix < 1e-5, 'setDie: 회전 = 경로 자세 × fix');
  ok(die.hid === false && die.shown === true, 'setDieHidden 켜고 끔');
  ok(die.up.every((y) => y > 0.999), `setDieSlot: 눈 v 의 면이 위(+y 1, -y 6, +x 3, -x 4, +z 2, -z 5) ${die.up.map((y) => y.toFixed(2))}`);
  ok(die.slotAt.every((d) => d < 1e-6), 'setDieSlot: 보관 칸 가운데, 바닥에 평평하게');
  ok(JSON.stringify(die.cell) === '[0,1,2,3,4,5]', `면마다 제 눈 그림 칸 ${JSON.stringify(die.cell)}`);
  ok(die.pips.every((n, i) => Math.abs(n - (i + 1)) < 0.25), `그림 칸마다 눈 수 1~6 ${die.pips.map((n) => n.toFixed(2))}`);
  ok(die.dieGeo.bad === 0 && die.dieGeo.flipped === 0, `주사위 모양 이상 없음(삼각형 ${die.dieGeo.tris})`);
  ok(die.rimGeo.bad === 0 && die.rimGeo.flipped === 0, `트레이 테두리 모양 이상 없음(삼각형 ${die.rimGeo.tris})`);
  ok(die.cupGeo.bad === 0 && die.cupGeo.flipped === 0, `컵 겉면 모양 이상 없음(삼각형 ${die.cupGeo.tris})`);
  ok(die.dieSize.every((s) => Math.abs(s - 1.4) < 1e-6), '주사위 한 변 1.4');
  ok(Math.abs(die.rim[1] - die.rim[0] - (die.rim[3] - die.rim[2])) < 1e-6 && Math.abs(die.rim[0] + die.rim[1]) < 1e-6, `트레이 바깥은 정사각형(한 변 ${(die.rim[1] - die.rim[0]).toFixed(2)}), 높이 ${die.rim[4].toFixed(2)}`);

  // 컵
  const cup = await page.evaluate(() => {
    const { mod, THREE } = window.h, sc = window.sc, r = {};
    const g = sc.scene.getObjectByName('yt-cup');
    const snap = () => { g.updateMatrixWorld(true); return [...g.position.toArray(), ...g.quaternion.toArray()]; };
    const mouthOf = () => new THREE.Vector3(0, 4.2, 0).applyQuaternion(g.quaternion).add(g.position).toArray();
    const inside = () => g.children.filter((c) => c.name.startsWith('yt-cup-die') && c.visible).length;
    r.hiddenAtStart = g.visible;
    sc.setCup({ mode: 'rest', t: 0 }); r.rest = snap(); r.restVis = g.visible; r.restDice = inside(); r.restMouth = mouthOf();
    sc.setCup({ mode: 'rest', t: 1, dice: 5 }); r.up = snap(); r.upDice = inside(); r.upMouth = mouthOf();
    sc.setCup({ mode: 'shake', t: 0, dice: 3 }); r.shake0 = snap(); r.shakeDice = inside();
    sc.setCup({ mode: 'shake', t: 0.37, dice: 5 }); r.shakeA = snap();
    sc.setCup({ mode: 'shake', t: 0.9, dice: 5 }); r.shakeB = snap();
    sc.setCup({ mode: 'shake', t: 0.37, dice: 5 }); r.shakeA2 = snap();
    sc.setCup({ mode: 'pour', t: 0 }); r.pour0 = snap();
    sc.setCup({ mode: 'pour', t: 1 }); r.pour1 = snap(); r.pourMouth = mouthOf();
    r.pourAxisY = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion).y;
    for (const t of [-1, 0.5, 2, NaN, undefined]) for (const mode of ['rest', 'shake', 'pour', 'hidden', 'zzz']) sc.setCup({ mode, t, dice: 9 });
    sc.setCup(); r.afterEmpty = g.visible;
    sc.setCup({ mode: 'hidden' }); r.hid = g.visible;
    let finite = true; sc.scene.traverse((o) => { o.updateMatrixWorld(); if (!o.matrixWorld.elements.every(Number.isFinite)) finite = false; });
    r.finite = finite; r.cup = mod.CUP;
    return r;
  });
  const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  ok(cup.hiddenAtStart === false && cup.hid === false && cup.afterEmpty === false && cup.restVis === true, '컵: 처음과 hidden·빈 값이면 안 보이고 rest 면 보임');
  ok(cup.cup.x === 3.4 && cup.cup.z === 2.4, '컵 자리 값 = sim.js 의 CUP (3.4, 2.4)');
  ok(Math.hypot(cup.upMouth[0] - 3.4, cup.upMouth[2] - 2.4) < 0.01 && cup.upMouth[1] > 5, `세워 든 컵의 입구가 쏟는 자리 위 (${cup.upMouth.map((v) => v.toFixed(2))})`);
  ok(cup.restMouth[0] > 4.4 && dist(cup.rest, cup.up) > 3, `눕힌 컵은 트레이 오른쪽 테두리 쪽 (입구 x ${cup.restMouth[0].toFixed(2)})`);
  ok(cup.restDice === 0 && cup.upDice === 5 && cup.shakeDice === 3, '컵 안 주사위 수 = dice 값');
  ok(dist(cup.shake0, cup.up) < 1e-6 && dist(cup.pour0, cup.up) < 1e-6, 'shake 0 초 = pour 0 = 세워 든 모습(동작이 끊기지 않고 이어진다)');
  ok(dist(cup.shakeA, cup.shakeB) > 0.05 && dist(cup.shakeA, cup.shakeA2) === 0, '흔들기: 시간에 따라 달라지고, 같은 t 면 같은 모습');
  ok(cup.pourAxisY < -0.3 && cup.pourMouth[0] < 3.4 && cup.pourMouth[2] < 2.4, `쏟기 끝: 입구가 아래·트레이 가운데 쪽 (축 y ${cup.pourAxisY.toFixed(2)})`);
  ok(cup.finite, '어떤 값을 넣어도 자리에 숫자가 아닌 값 없음');

  // 품질 단계
  const ql = await page.evaluate(() => {
    const { rest } = window.h, sc = window.sc, r = { tris: [], shadow: [], blobs: [], kept: [], res: [] };
    sc.setDie(1, { pos: [-3, 0.7, -2], quat: rest(3, 1) }); sc.setDieSlot(4, 2, 5); sc.setDieHidden(0, true);
    sc.setCup({ mode: 'shake', t: 0.5, dice: 2 });
    for (const q of [2, 1, 0, 1, 2, 7, -3]) {
      sc.setQuality(q);
      const s = sc.stats(); let key = null, blobs = 0;
      sc.scene.traverse((o) => { if (o.isDirectionalLight && o.shadow.camera.right === 12) key = o; if (o.name.startsWith('yt-blob')) blobs++; });
      r.tris.push(s.tris); r.shadow.push(key.castShadow ? key.shadow.mapSize.x : 0); r.blobs.push(blobs); r.res.push([s.quality, s.geometries, s.materials, s.textures]);
      const d1 = sc.scene.getObjectByName('yt-die-1'), d4 = sc.scene.getObjectByName('yt-die-4'), d0 = sc.scene.getObjectByName('yt-die-0'), cup = sc.scene.getObjectByName('yt-cup');
      r.kept.push(Math.abs(d1.position.x + 3) < 1e-6 && d1.visible && d4.visible && !d0.visible && cup.visible && cup.children.filter((c) => c.visible && c.name.startsWith('yt-cup-die')).length === 2);
    }
    return r;
  });
  ok(ql.tris[0] <= 60000 && ql.tris[0] > ql.tris[1] && ql.tris[1] > ql.tris[2], `삼각형 수(주사위 5 + 트레이 + 컵): 높음 ${ql.tris[0]} ≤ 6만, 보통 ${ql.tris[1]}, 낮음 ${ql.tris[2]}`);
  ok(JSON.stringify(ql.shadow) === '[2048,1024,0,1024,2048,2048,0]', `그림자: 높음 2048, 보통 절반, 낮음 없음 ${JSON.stringify(ql.shadow)}`);
  ok(JSON.stringify(ql.blobs) === '[0,0,5,0,0,0,5]', '낮음 단계에서만 주사위 아래 둥근 그림자 판 5개');
  ok(ql.kept.every(Boolean), '단계를 바꿔도 주사위·컵 모습이 그대로');
  ok(ql.res[0].join() === ql.res[4].join(), `단계를 오가도 자원 수가 늘지 않음 ${JSON.stringify(ql.res[0])}`);

  // 자동 내리기: 2초 평균 28ms 초과면 한 단계
  const watch = await page.evaluate(() => {
    const { quality } = window.h, r = {};
    const run = (dt, ms) => { let q = 2, n = 0; const w = quality.createQualityWatch({ get: () => q, lower: () => { q--; n++; } }); for (let t = 0; t < ms; t += dt) w.tick(dt); return [q, n]; };
    r.fast = run(16.7, 20000); r.ok27 = run(27, 20000); r.slow = run(40, 3700); r.slower = run(40, 20000); r.hidden = run(400, 20000);
    return r;
  });
  ok(watch.fast[1] === 0 && watch.ok27[1] === 0, '빠른 기기(16.7ms, 27ms)는 내리지 않음');
  ok(watch.slow[0] === 1 && watch.slower[0] === 0, `느리면(40ms) 약 3.5초 뒤 한 단계, 계속 느리면 0까지 ${JSON.stringify([watch.slow, watch.slower])}`);
  ok(watch.hidden[1] === 0, '가려졌던 탭의 긴 프레임은 세지 않음');

  // 버리기
  const d = await page.evaluate(() => {
    const { subs, mod, mkStage } = window.h, sc = window.sc, r = {};
    sc.setQuality(2);
    const res = new Set();
    sc.scene.traverse((o) => {
      if (o.geometry) res.add(o.geometry);
      for (const m of [].concat(o.material || [])) { res.add(m); for (const k in m) if (m[k] && m[k].isTexture) res.add(m[k]); }
    });
    let gone = 0; res.forEach((x) => x.addEventListener('dispose', () => gone++));
    r.total = res.size; r.subsBefore = subs.size;
    sc.dispose();
    r.gone = gone; r.kids = sc.scene.children.length; r.stats = sc.stats(); r.subsAfter = subs.size;
    sc.setDie(0, { pos: [0, 0.7, 0], quat: [0, 0, 0, 1] }); sc.setDieSlot(1, 1, 3); sc.setDieHidden(2, true); sc.setCup({ mode: 'pour', t: 0.5 });
    sc.setRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 10, h: 10 }); sc.setQuality(0); sc.resize(); sc.dispose();
    r.after = [sc.project([0, 0, 0]), sc.scene.children.length];
    // 주변 반사 그림은 빌려 쓰고 버리지 않는다
    const env = { isTexture: true, disposed: false, dispose() { this.disposed = true; } };
    const st = mkStage({ scene: { environment: env } }), s2 = mod.createYachtScene({ stage: st });
    subs.forEach((f) => f(16));
    r.env = s2.scene.environment === env; s2.dispose(); r.envKept = !env.disposed && s2.scene.environment === null;
    return r;
  });
  ok(d.total > 15 && d.gone === d.total, `dispose: geometry·material·texture ${d.total}개 전부 버림(${d.gone})`);
  ok(d.kids === 0 && d.stats.geometries === 0 && d.stats.materials === 0 && d.stats.textures === 0 && d.stats.tris === 0, 'dispose 뒤 장면이 비어 있음');
  ok(d.subsBefore >= 1 && d.subsAfter === d.subsBefore - 1, 'dispose 뒤 프레임 구독 해제');
  ok(d.after[0] === null && d.after[1] === 0, 'dispose 뒤에 불러도 오류 없이 아무 일도 없음');
  ok(d.env && d.envKept, 'stage 의 주변 반사 그림을 빌려 쓰고, 버리지 않고 돌려놓음');

  await page.close();
  ok(consoleErrors.length === 0, `콘솔 오류 0 ${consoleErrors.join(' | ')}`);
} catch (e) {
  fail++; console.log('FAIL 예외', e);
} finally {
  await browser.close();
  await server.close();
}
console.log(fail ? `실패 ${fail}` : '통과');
process.exit(fail ? 1 : 0);
