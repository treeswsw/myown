// 뽑기(카드 gacha · 캡슐 capsule · 상점 진열 stock)가 "표에 적힌 확률대로" 나오는지 치우침 시험 (test/common/random.test.js 방식).
// 천장(PITY)·10장 보장은 SPEC 22-15/16 에 적힌 규칙이다. 표 확률 자체는 한 장씩 뽑을 때(천장 0, 10장 보장 없음) 그대로여야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { secureRng } from '../../shared/cards.js';
import { seeded } from '../helpers.js';
import { assertRate } from '../lib/stats.js';
import { TIERS, ROLL, PITY, POOL_START, draw } from '../../shared/coin/gacha.js';
import { WEIGHTS, PITY as CAP_PITY, capsule } from '../../shared/coin/capsule.js';
import { ROWS, rollRow } from '../../shared/coin/stock.js';
import { ITEMS } from '../../shared/coin/shop.js';

const SOURCES = [['고정 씨앗', () => seeded(11)], ['crypto', () => secureRng]];

for (const [name, mk] of SOURCES) {
  test(`카드 뽑기(${name}): 한 장씩(천장 0) 뽑으면 등급별 비율이 표와 같다`, () => {
    const rng = mk();
    const N = 400_000;
    const hit = new Array(TIERS.length).fill(0);
    for (let i = 0; i < N; i++) hit[draw(rng, 1, 0, POOL_START).pulls[0].tier]++;
    TIERS.forEach((t, i) => assertRate(hit[i], N, t.w / ROLL, `gacha tier ${i} ${t.name}`));
  });

  test(`캡슐(${name}): 한 개씩(천장 0) 뽑으면 등급별 비율이 표와 같다`, () => {
    const rng = mk();
    const N = 300_000;
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    const hit = new Array(WEIGHTS.length).fill(0);
    for (let i = 0; i < N; i++) hit[capsule(rng, 1, 0, []).pulls[0].g]++;
    WEIGHTS.forEach((w, g) => assertRate(hit[g], N, w / total, `capsule grade ${g}`));
  });

  test(`캡슐(${name}): 같은 등급 안에서는 아이템이 고르게 나온다`, () => {
    const rng = mk();
    const N = 200_000;
    const byId = new Map();
    for (let i = 0; i < N; i++) {
      const p = capsule(rng, 1, 0, []).pulls[0];
      byId.set(p.id, (byId.get(p.id) ?? 0) + 1);
    }
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    for (const g of [0, 1, 2]) {
      const items = ITEMS.filter((i) => i.g === g && i.cap === true);
      for (const it of items) assertRate(byId.get(it.id) ?? 0, N, WEIGHTS[g] / total / items.length, `capsule ${it.id}`);
    }
  });

  test(`상점 진열(${name}): 칸마다 등급 비율이 줄(row)의 가중치와 같다`, () => {
    const rng = mk();
    const gradeOf = new Map(ITEMS.map((i) => [i.id, i.g]));
    for (const [rowName, row] of Object.entries(ROWS)) {
      const N = 40_000; // 줄 40000번 × 칸 5
      const hit = new Map(row.w.map(([g]) => [g, 0]));
      for (let i = 0; i < N; i++) for (const id of rollRow(rng, row, [], [])) hit.set(gradeOf.get(id), (hit.get(gradeOf.get(id)) ?? 0) + 1);
      const sum = row.w.reduce((s, [, w]) => s + w, 0);
      // 한 줄 안에서는 같은 물건이 겹치지 않으므로 칸끼리 아주 조금 상관이 있다. 6.5 시그마 기준은 그래도 넉넉하다.
      for (const [g, w] of row.w) assertRate(hit.get(g), N * row.n, w / sum, `stock ${rowName} grade ${g}`);
    }
  });
}

// ---- 조작이 있다면 이것만이다: 문서에 적힌 천장·보장을 "그대로" 고정해 둔다(몰래 늘리지 못하게) ----

test('카드 뽑기: 보정은 SPEC 에 적힌 두 가지뿐(천장 PITY, 10장 보장) — 그 밖의 보정은 없다', () => {
  // 가장 낮은 roll(동)만 내는 rng: 천장 직전까지는 계속 동, PITY 번째에 대박으로 바뀐다
  const lowest = () => 0;
  let p = 0;
  for (let i = 1; i < PITY; i++) {
    const r = draw(lowest, 1, p);
    assert.equal(r.pulls[0].tier, 0, `${i}번째는 동`);
    p = r.pity;
  }
  assert.equal(draw(lowest, 1, p).pulls[0].tier, 3, `${PITY}번째는 대박(천장)`);
  // 10장에 금 이상이 없으면 마지막 장만 금
  const ten = draw(lowest, 10, 0);
  assert.deepEqual(ten.pulls.map((x) => x.tier), [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
});

test('캡슐: 보정은 천장 CAP_PITY, 10개 보장뿐', () => {
  const lowest = () => 0;
  let p = 0;
  for (let i = 1; i < CAP_PITY; i++) {
    const r = capsule(lowest, 1, p, []);
    assert.equal(r.pulls[0].g, 0);
    p = r.cpity;
  }
  assert.equal(capsule(lowest, 1, p, []).pulls[0].g, 3);
  assert.deepEqual(capsule(lowest, 10, 0, []).pulls.map((x) => x.g).slice(0, 9), new Array(9).fill(0));
  assert.equal(capsule(lowest, 10, 0, []).pulls[9].g, 2);
});

test('뽑기 코드 어디에도 Math.random·Date 기반 난수가 없다 (shared/coin, server/coin)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files = [];
  for (const dir of ['shared/coin', 'server/coin']) {
    const walk = (d) => {
      for (const f of readdirSync(path.join(root, d), { withFileTypes: true })) {
        if (f.isDirectory()) walk(path.join(d, f.name));
        else if (f.name.endsWith('.js')) files.push(path.join(d, f.name));
      }
    };
    walk(dir);
  }
  for (const f of files) {
    const src = readFileSync(path.join(root, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|crypto\.getRandomValues\(.*\)\s*\/\s*|Date\.now\(\)\s*%/.test(src), `${f}: 숨은 난수/시간 기반 보정`);
  }
});
