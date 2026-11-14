// 혼자 놀기 코인·날짜 계산 시험 (docs/solo/PLAN.md 3절)
import test from 'node:test';
import assert from 'node:assert/strict';
import { coinsFor, dailyCap, dayOf, weekOf } from '../../shared/solo/coin.js';
import { COIN_RULES, defaultEcon, normalizeEcon, ECON_VERSION } from '../../shared/coin/rules.js';
import { turnEngine } from './lib.js';

const eng = { ...turnEngine, id: 'g2048', coin: [1000, 3000, 6000, 10000] };
const rules = { solo_g2048: { finish: 3, win: 0, gapMs: 0 }, solo_cap: { finish: 60, win: 0, gapMs: 0 } };

test('coinsFor: 넘은 문턱 수, 판당 최대로 자름', () => {
  assert.equal(coinsFor(eng, 0, rules), 0);
  assert.equal(coinsFor(eng, 999, rules), 0);
  assert.equal(coinsFor(eng, 1000, rules), 1);
  assert.equal(coinsFor(eng, 3000, rules), 2);
  assert.equal(coinsFor(eng, 6000, rules), 3);
  assert.equal(coinsFor(eng, 10000, rules), 3); // 문턱 4개를 넘었지만 최대 3
  assert.equal(coinsFor(eng, 10000, { ...rules, solo_g2048: { finish: 0 } }), 0);
});

test('coinsFor: 규칙 줄이 없거나 점수가 이상하면 0', () => {
  assert.equal(coinsFor(eng, 99999, {}), 0);
  assert.equal(coinsFor(eng, 99999, undefined), 0);
  assert.equal(coinsFor(eng, NaN, rules), 0);
  assert.equal(coinsFor(eng, -5, rules), 0);
  assert.equal(coinsFor({ id: 'x' }, 50, { solo_x: { finish: 5 } }), 0); // 문턱 표 없음
});

test('기본 코인 표: 판당 최대 10/7/8, 하루 상한 60, win·gapMs 는 0', () => {
  const r = defaultEcon().rules;
  assert.equal(dailyCap(r), 60);
  assert.equal(dailyCap({}), 0);
  assert.equal(dailyCap(COIN_RULES), 60);
  assert.deepEqual([r.solo_g2048.finish, r.solo_apple.finish, r.solo_suika.finish], [10, 7, 8]);
  for (const k of ['solo_g2048', 'solo_apple', 'solo_suika', 'solo_cap']) assert.deepEqual([r[k].win, r[k].gapMs], [0, 0]);
});

test('저장된 설정에 혼자 놀기 줄이 없어도 기본값으로 채워진다(ECON_VERSION 그대로)', () => {
  const saved = defaultEcon();
  for (const k of Object.keys(saved.rules)) if (k.startsWith('solo_')) delete saved.rules[k];
  saved.rules.yacht.finish = 12;
  const n = normalizeEcon({ ...saved, v: ECON_VERSION });
  assert.equal(n.rules.yacht.finish, 12);
  assert.deepEqual(n.rules.solo_cap, { finish: 60, win: 0, gapMs: 0 });
  assert.equal(n.rules.solo_apple.finish, 7);
});

const kst = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh - 9, mm); // 한국 시간 -> epoch ms

test('dayOf: 한국 시간 자정에 바뀐다', () => {
  assert.equal(dayOf(kst(2026, 11, 14, 23, 59)), dayOf(kst(2026, 11, 14, 0, 0)));
  assert.equal(dayOf(kst(2026, 11, 15, 0, 0)), dayOf(kst(2026, 11, 14, 23, 59)) + 1);
  assert.equal(dayOf(kst(1970, 1, 1, 9, 0)), 0);
});

test('weekOf: 한국 시간 월요일 0시에 바뀐다', () => {
  // 2026-11-15 일요일, 2026-11-16 월요일
  assert.equal(new Date(kst(2026, 11, 16, 12, 0) + 9 * 3600_000).getUTCDay(), 1);
  const sunLate = weekOf(kst(2026, 11, 15, 23, 59));
  const monStart = weekOf(kst(2026, 11, 16, 0, 0));
  assert.equal(monStart, sunLate + 1);
  assert.equal(weekOf(kst(2026, 11, 9, 0, 0)), sunLate); // 같은 주 월요일
  assert.equal(weekOf(kst(2026, 11, 22, 23, 59)), monStart); // 다음 일요일 끝까지 같은 주
  assert.equal(weekOf(kst(1970, 1, 5, 0, 0)), 1); // 1970-01-05 월요일
  assert.equal(weekOf(kst(1970, 1, 4, 23, 59)), 0);
});
