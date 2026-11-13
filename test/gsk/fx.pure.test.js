// 갱스껄 연출의 DOM 없는 부분: 고조 단계, 시간표, 서버 시간(GDD 16절)과의 맞춤, 고정 계산.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../../client/src/gsk/anim/fx.pure.js';

test('levelFor: 남은 장수 기준, 마지막 장은 항상 5', () => {
  assert.deepEqual([24, 5, 4, 3, 2, 1, 0, -1, -3].map(P.levelFor), [1, 1, 1, 2, 3, 4, 5, 5, 5]);
  assert.equal(P.levelFor(undefined), 5);
  assert.equal(P.levelFor(NaN), 5);
  // 도전 숫자 1~24 어느 경우든: 단계는 장마다 내려가지 않고, 마지막 필요한 장은 5
  for (let need = 1; need <= 24; need++) {
    let prev = 0;
    for (let flipped = 1; flipped <= need; flipped++) {
      const lv = P.levelFor(need - flipped);
      assert.ok(lv >= prev && lv >= 1 && lv <= 5, `need ${need} flipped ${flipped}`);
      prev = lv;
    }
    assert.equal(prev, 5, `need ${need} 마지막 장`);
  }
});

test('서버 시간 값은 GDD 16절 그대로', () => {
  assert.deepEqual({ ...P.SERVER }, { FLIP_MS: 1700, TEASE_MS: 1400, REVEAL_MS: 3500 });
  const gdd = readFileSync(new URL('../../docs/gsk/GDD.md', import.meta.url), 'utf8');
  assert.match(gdd, /자동 공개 간격 = 꽃 1700ms, tease 이면 \+1400ms/);
  assert.match(gdd, /`REVEAL_MS` 3500/);
  assert.equal(P.serverGap('F', 0), 1700);
  assert.equal(P.serverGap('F', 1), 3100);
  assert.equal(P.serverGap('S', 0), 3100);
  assert.equal(P.serverGap('S', 1), 3100);
});

test('한 장 연출은 서버 간격 안에 끝나고, 너무 일찍 끝나지도 않는다', () => {
  for (const [disc, tease] of [['F', 0], ['F', 1], ['S', 1], ['S', 0]]) {
    const d = P.flipDuration(disc, tease);
    const gap = P.serverGap(disc, tease);
    assert.ok(d <= gap, `${disc}${tease}: ${d} <= ${gap}`);
    assert.ok(gap - d <= 100, `${disc}${tease}: 빈 시간 ${gap - d}ms`);
  }
  assert.equal(P.flipDuration('F', 0), 1670);
  assert.equal(P.flipDuration('F', 1), 3040);
  assert.equal(P.flipDuration('S', 1), 3040);
});

test('시간표: 시간 순서, 마지막 움직임(0.5초 날아가기)이 끝난 뒤 land', () => {
  for (const [disc, tease] of [['F', 0], ['F', 1], ['S', 1]]) {
    const tl = P.flipTimeline(disc, tease);
    for (let i = 1; i < tl.length; i++) assert.ok(tl[i].at > tl[i - 1].at);
    assert.equal(tl[0].stage, 'up');
  }
  const stages = (d, t) => P.flipTimeline(d, t).map((x) => x.stage);
  assert.deepEqual(stages('F', 0), ['up', 'turn', 'bloom', 'fly', 'land']);
  assert.deepEqual(stages('F', 1), ['up', 'tease1', 'tease2', 'tease3', 'relief', 'fly', 'land']);
  assert.deepEqual(stages('S', 1), ['up', 'tease1', 'tease2', 'tease3', 'doom', 'hold']);
  assert.ok(P.T_PLAIN.land - P.T_PLAIN.fly >= 500);
  assert.ok(P.T_TEASE.land - P.T_TEASE.fly >= 500);
});

test('멈칫: 갈라지는 순간(1.76초)까지 꽃·해골 시간표가 완전히 같다', () => {
  const cut = (d) => P.flipTimeline(d, 1).filter((x) => x.at < P.T_TEASE.split);
  assert.deepEqual(cut('F'), cut('S'));
  assert.equal(cut('F').length, 4);
  const split = (d) => P.flipTimeline(d, 1).find((x) => x.at === P.T_TEASE.split).stage;
  assert.equal(split('F'), 'relief');
  assert.equal(split('S'), 'doom');
  assert.equal(P.T_TEASE.split, 1760);
  assert.equal(P.isTease('S', 0), true);
  assert.equal(P.isTease('F', 0), false);
  assert.equal(P.isTease('F', 1), true);
});

test('판정 뒤 연출 길이: 서버가 다음 화면을 보내기 전에 끝난다', () => {
  assert.ok(P.REVEAL_HOLD_MS <= P.SERVER.REVEAL_MS);
  assert.ok(P.SERVER.REVEAL_MS - P.REVEAL_HOLD_MS <= 500);
  assert.ok(P.MAT_FLIP.delay + P.MAT_FLIP.dur <= P.REVEAL_HOLD_MS);
  // 마지막 장 + 판정 연출의 합 ≤ 서버가 그 장 뒤에 쓰는 시간(간격 + REVEAL_MS)
  for (const [disc, tease] of [['F', 0], ['F', 1], ['S', 1]]) {
    const ours = P.flipDuration(disc, tease) + P.REVEAL_HOLD_MS;
    assert.ok(ours <= P.serverGap(disc, tease) + P.SERVER.REVEAL_MS, `${disc}${tease}`);
  }
  // 해골이 보이는 시간(등장 ~ 벌칙 화면): 3초 이상
  assert.ok(P.serverGap('S', 1) - P.T_TEASE.split + P.SERVER.REVEAL_MS >= 3000);
  assert.ok(P.LINGER_MAX_MS > P.SERVER.REVEAL_MS + P.SERVER.FLIP_MS + P.SERVER.TEASE_MS);
});

test('여러 장 자동 공개: 연출 줄이 서버보다 밀리지 않는다', () => {
  const seq = [['F', 0], ['F', 1], ['F', 0], ['F', 0], ['S', 1]];
  let server = 0, ours = 0;
  for (const [d, t] of seq) {
    ours = Math.max(ours, server) + P.flipDuration(d, t);   // 이벤트가 온 뒤에야 시작
    server += P.serverGap(d, t);
    assert.ok(ours <= server);
  }
});

test('꽃 효과: 단계가 오를수록 커지고, 멈칫 뒤 꽃은 더 크다. 배치는 고정', () => {
  let prev = { petals: 0, sparks: 0, size: 0, spread: 0 };
  for (let lv = 1; lv <= 5; lv++) {
    const b = P.burstSpec(lv);
    assert.ok(b.petals > prev.petals && b.sparks > prev.sparks && b.size > prev.size && b.spread > prev.spread);
    prev = b;
  }
  assert.deepEqual(P.burstSpec(1), { petals: 8, sparks: 4, size: 168, spread: 0.94 });
  assert.deepEqual(P.burstSpec(5), { petals: 20, sparks: 12, size: 320, spread: 1.3 });
  assert.equal(P.effLevel(3, 'F', 1), 3.7);
  assert.equal(P.effLevel(3, 'F', 0), 3);
  assert.equal(P.effLevel(3, 'S', 1), 3);
  assert.ok(P.WIN_BURST.size > P.burstSpec(5.7).size);
  // 같은 입력 → 같은 값(무작위 없음)
  assert.deepEqual(P.petalAt(3, 8), P.petalAt(3, 8));
  assert.deepEqual(P.petalAt(0, 8), { rot: -7, kind: 0, dur: 0.7, delay: 0 });
  assert.deepEqual(P.petalAt(3, 8), { rot: 144, kind: 0, dur: 0.94, delay: 0.09 });
  assert.deepEqual(P.sparkAt(1, 4, 1), { rot: 107, scale: 1.15, dur: 0.7, delay: 0.09 });
});

test('악마 기운: 16갈래 × 2겹, 캔버스와 같은 각도', () => {
  for (const layer of ['a', 'b']) {
    const ps = P.auraPaths(layer);
    assert.equal(ps.length, 16);
    assert.deepEqual(ps.slice(0, 4).map((p) => p.rot), [-3, 26.5, 42, 71.5]);
    assert.equal(ps[15].rot, 341.5);
    for (const p of ps) assert.match(p.d, /^M1\d\d 90 C/);
  }
  assert.notEqual(P.auraPaths('a')[0].d, P.auraPaths('b')[0].d);
  assert.equal(P.HORNS.length, 2);
});

test('단계음 음높이: 1단계는 도/레 번갈아, 그 뒤 미·솔·시·높은 도', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => P.stageSemi(1, n)), [0, 2, 0, 2]);
  assert.deepEqual([2, 3, 4, 5].map((lv) => P.stageSemi(lv, 1)), [4, 7, 11, 12]);
  assert.equal(P.stageSemi(9, 1), 12);
});

test('잡음 난수는 고정 시드(모두 같은 소리), 0 이상 1 미만', () => {
  const a = P.prng(20261113), b = P.prng(20261113);
  let sum = 0;
  for (let i = 0; i < 2000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
    sum += x;
  }
  assert.ok(Math.abs(sum / 2000 - 0.5) < 0.05);
});

test('문구', () => {
  assert.equal(P.doomLine('서아', '하린'), '서아 님의 해골 · 하린 님 도전 실패');
  assert.equal(P.winLine('하린', 5), '하린 님이 꽃 5장을 모두 뒤집었습니다 · 1점');
});

test('연출·소리 파일에 Math.random·zoom·innerHTML 이 없고, CSS 는 .gk-fx- 만 쓴다', () => {
  const read = (f) => readFileSync(new URL('../../client/src/gsk/' + f, import.meta.url), 'utf8');
  for (const f of ['anim/fx.js', 'anim/fx.pure.js', 'audio.js']) {
    const code = read(f).replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random/.test(code), f + ' Math.random');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(code), f + ' innerHTML');
  }
  const css = read('anim/fx.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/(^|[;{\s])zoom\s*:/.test(css));
  const classes = [...css.replace(/\{[^}]*\}/g, '{}').matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  assert.ok(classes.length > 20);
  for (const c of classes) assert.ok(c.startsWith('gk-fx-'), '.' + c);
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) assert.ok(m[1].startsWith('gk-fx-'), m[1]);
  assert.ok(!/(^|[;{\s])(translate|scale|rotate)\s*:/.test(css), '개별 translate/scale/rotate 속성 금지');
  assert.match(css, /\.gk-fx-layer\{[^}]*pointer-events:none/);
});
