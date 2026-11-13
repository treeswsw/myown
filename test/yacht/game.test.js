import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS } from '../../shared/yacht/constants.js';
import { scoreOf, totals } from '../../shared/yacht/score.js';
import { createGame, shake, roll, keep, pick, score, drop, viewOf } from '../../shared/yacht/game.js';

// 씨앗 고정 rng (시험 전용)
function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r3 = (n) => Math.round(n * 1000) / 1000;
const placeCalls = [];
const place = (seed, thrown) => { placeCalls.push({ seed, thrown }); return thrown.map((i) => ({ i, x: r3((i - 2) * 1.8), z: r3(((seed % 7) - 3) * 0.5), yaw: r3(0.1 * i) })); };
const freeCalls = [];
const freeSpot = (others, prefer) => { freeCalls.push({ others, prefer }); return others.some((o) => Math.hypot(o.x - prefer.x, o.z - prefer.z) < 2.1) ? { x: 0, z: -3, yaw: 0 } : prefer; };

const P = (...names) => names.map((n) => ({ id: n, name: n.toUpperCase() }));
const start = (names, seed = 1) => {
  const rng = mulberry32(seed);
  const r = createGame({ players: P(...names), rng, gameNo: 3 });
  assert.equal(r.ok, true);
  return { g: r.game, rng, events: r.events };
};
const must = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const turnOf = (g) => viewOf(g, null).turn;
const snap = (g) => JSON.stringify(g);

// 한 차례: rolls 번 굴리고(중간에 0번 주사위를 보관), 첫 빈칸에 기록
function playTurn(g, rng, rolls = 2) {
  const id = turnOf(g);
  const evs = [];
  for (let n = 0; n < rolls; n++) {
    evs.push(...must(roll(g, id, rng, place)).events);
    if (n === 0 && rolls > 1) evs.push(...must(keep(g, id, 0, true, freeSpot)).events);
  }
  const col = viewOf(g, id).cols.find((c) => c.id === id);
  const cat = CATS.find((c) => col.scores[c] == null);
  evs.push(...must(pick(g, id, cat)).events);
  evs.push(...must(score(g, id, cat)).events);
  return evs;
}

test('createGame: 순서 섞기·시작 알림·인원 검사', () => {
  const a = start(['a', 'b', 'c', 'd'], 7);
  const b = start(['a', 'b', 'c', 'd'], 7);
  assert.deepEqual(a.events, b.events);
  const [s, t] = a.events;
  assert.equal(s.k, 'ytStart'); assert.equal(s.gameNo, 3);
  assert.deepEqual([...s.order].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(t, { k: 'ytTurn', id: s.order[0], round: 1 });
  assert.deepEqual(viewOf(a.g, null).cols.map((c) => c.id), s.order);
  const orders = new Set();
  for (let seed = 1; seed < 60; seed++) orders.add(start(['a', 'b', 'c', 'd'], seed).events[0].order.join(''));
  assert.ok(orders.size > 10, '순서가 섞인다');
  assert.equal(createGame({ players: P('a'), rng: mulberry32(1) }).ok, false);
  assert.equal(createGame({ players: P('a', 'b', 'c', 'd', 'e'), rng: mulberry32(1) }).ok, false);
  assert.equal(createGame({ players: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], rng: mulberry32(1) }).ok, false);
  const v = viewOf(a.g, 'a');
  assert.equal(v.phase, 'playing'); assert.equal(v.round, 1); assert.equal(v.rollsLeft, 3); assert.equal(v.dice, null);
  assert.equal(v.rollNo, 0); assert.equal(v.last, null); assert.equal(v.result, null); assert.equal(v.pick, null); assert.equal(v.shaking, false);
});

for (const n of [2, 3, 4]) {
  test(`${n}명 한 판 끝까지: 12바퀴·순서·합계`, () => {
    const names = ['a', 'b', 'c', 'd'].slice(0, n);
    const { g, rng, events } = start(names, 100 + n);
    const order = events[0].order;
    const seen = [];
    let all = [];
    for (let guard = 0; guard < n * 12; guard++) {
      assert.equal(viewOf(g, null).phase, 'playing');
      const v = viewOf(g, null);
      assert.equal(v.round, Math.floor(guard / n) + 1);
      seen.push(v.turn);
      all = all.concat(playTurn(g, rng, 1 + (guard % 3)));
    }
    const expected = Array.from({ length: n * 12 }, (_, i) => order[i % n]);
    assert.deepEqual(seen, expected);
    const v = viewOf(g, null);
    assert.equal(v.phase, 'result'); assert.equal(v.turn, null); assert.equal(v.round, 12); assert.equal(v.dice, null);
    assert.equal(v.result.reason, 'done');
    assert.equal(all.filter((e) => e.k === 'ytScore').length, n * 12);
    assert.equal(all.filter((e) => e.k === 'ytTurn').length, n * 12 - 1);
    assert.equal(all.at(-1).k, 'ytEnd');
    for (const c of v.cols) {
      assert.ok(CATS.every((k) => c.scores[k] != null), '12칸 모두 채움');
      const sum = CATS.reduce((a, k) => a + c.scores[k], 0);
      const upper = CATS.slice(0, 6).reduce((a, k) => a + c.scores[k], 0);
      assert.equal(c.total, sum + (upper >= 63 ? 35 : 0));
      assert.equal(c.bonus, upper >= 63 ? 35 : 0);
      assert.equal(c.upper, upper);
    }
    const best = Math.max(...v.cols.map((c) => c.total));
    assert.deepEqual(v.result.winners, v.cols.filter((c) => c.total === best).map((c) => c.id));
    assert.deepEqual(v.result.ranks.map((r) => r.total), [...v.result.ranks.map((r) => r.total)].sort((a, b) => b - a));
    assert.deepEqual(all.at(-1).ranks, v.result.ranks);
    // 끝난 뒤에는 무엇도 받지 않는다
    assert.equal(roll(g, order[0], rng, place).error, '지금은 할 수 없습니다.');
  });
}

test('같은 씨앗 = 같은 판', () => {
  const run = () => { const { g, rng } = start(['a', 'b', 'c'], 5); for (let i = 0; i < 36; i++) playTurn(g, rng, 3); return JSON.stringify(viewOf(g, null)); };
  assert.equal(run(), run());
});

test('roll: seed·눈·보관 칸·자리', () => {
  placeCalls.length = 0;
  const { g, rng } = start(['a', 'b'], 9);
  const id = turnOf(g);
  const r = must(roll(g, id, rng, place));
  const ev = r.events.find((e) => e.k === 'ytRoll');
  assert.equal(Number.isInteger(ev.seed) && ev.seed >= 0 && ev.seed < 2 ** 32, true);
  assert.deepEqual(ev.thrown, [0, 1, 2, 3, 4]);
  assert.equal(ev.rollsLeft, 2); assert.equal(ev.rollNo, 1);
  assert.deepEqual(placeCalls.at(-1), { seed: ev.seed, thrown: [0, 1, 2, 3, 4] });
  assert.equal(ev.dice.length, 5);
  ev.dice.forEach((d, i) => { assert.ok(d.v >= 1 && d.v <= 6); assert.equal(d.slot, null); assert.equal(d.x, r3((i - 2) * 1.8)); });
  assert.equal(ev.combo, viewOf(g, id).dice && ev.combo);
  // 보관: 왼쪽부터 빈칸
  must(keep(g, id, 3, true, freeSpot)); must(keep(g, id, 1, true, freeSpot));
  assert.deepEqual(viewOf(g, id).dice.map((d) => d.slot), [null, 1, null, 0, null]);
  must(keep(g, id, 3, false, freeSpot));
  must(keep(g, id, 4, true, freeSpot));
  assert.deepEqual(viewOf(g, id).dice.map((d) => d.slot), [null, 1, null, null, 0]);
  const before = viewOf(g, id).dice;
  const ev2 = must(roll(g, id, rng, place)).events.find((e) => e.k === 'ytRoll');
  assert.deepEqual(ev2.thrown, [0, 2, 3]);
  assert.deepEqual(placeCalls.at(-1).thrown, [0, 2, 3]);
  const after = viewOf(g, id).dice;
  for (const i of [1, 4]) assert.deepEqual(after[i], before[i]);
  assert.equal(ev2.rollsLeft, 1); assert.equal(ev2.rollNo, 2);
});

test('keep: 빼기는 freeSpot 에 물어 자리를 받는다·이미 그 상태면 아무 일 없음', () => {
  freeCalls.length = 0;
  const { g, rng } = start(['a', 'b'], 11);
  const id = turnOf(g);
  must(roll(g, id, rng, place));
  const d1 = viewOf(g, id).dice[1];
  const on = must(keep(g, id, 1, true, freeSpot)).events[0];
  assert.deepEqual(on, { k: 'ytKeep', id, i: 1, on: true, slot: 0, x: d1.x, z: d1.z, yaw: d1.yaw });
  const dup = must(keep(g, id, 1, true, freeSpot));
  assert.deepEqual(dup.events, []);
  const off = must(keep(g, id, 1, false, freeSpot)).events[0];
  assert.equal(off.on, false); assert.equal(off.slot, null);
  assert.equal(freeCalls.length, 1);
  assert.equal(freeCalls[0].others.length, 4);
  assert.deepEqual(freeCalls[0].prefer, { x: d1.x, z: d1.z, yaw: d1.yaw });
  assert.deepEqual(must(keep(g, id, 1, false, freeSpot)).events, []);
  assert.equal(freeCalls.length, 1);
  // 자리가 막혀 있으면 freeSpot 이 준 자리로
  const blocked = (others, prefer) => ({ x: 9, z: 9, yaw: 1 });
  must(keep(g, id, 2, true, freeSpot));
  const ev = must(keep(g, id, 2, false, blocked)).events[0];
  assert.deepEqual([ev.x, ev.z, ev.yaw], [9, 9, 1]);
  assert.deepEqual(viewOf(g, id).dice[2], { v: viewOf(g, id).dice[2].v, slot: null, x: 9, z: 9, yaw: 1 });
});

test('pick: 굴림·보관·빼기·기록·차례 끝에 지워지고 ytPick 알림', () => {
  const { g, rng } = start(['a', 'b'], 12);
  const id = turnOf(g);
  must(roll(g, id, rng, place));
  assert.deepEqual(must(pick(g, id, 'choice')).events, [{ k: 'ytPick', id, cat: 'choice' }]);
  assert.deepEqual(must(pick(g, id, 'choice')).events, []);
  assert.deepEqual(must(pick(g, id, 'yacht')).events, [{ k: 'ytPick', id, cat: 'yacht' }]);
  assert.equal(viewOf(g, 'b').pick, 'yacht'); // 모두에게
  assert.equal(viewOf(g, id).pick, 'yacht');
  let r = must(keep(g, id, 0, true, freeSpot));
  assert.deepEqual(r.events.map((e) => e.k), ['ytKeep', 'ytPick']);
  assert.equal(r.events[1].cat, null); assert.equal(viewOf(g, id).pick, null);
  must(pick(g, id, 'fours'));
  r = must(keep(g, id, 0, false, freeSpot));
  assert.equal(viewOf(g, id).pick, null);
  must(pick(g, id, 'fours'));
  r = must(roll(g, id, rng, place));
  assert.deepEqual(r.events.map((e) => e.k), ['ytRoll', 'ytPick']);
  assert.equal(viewOf(g, id).pick, null);
  assert.deepEqual(must(pick(g, id, null)).events, []);
  must(pick(g, id, 'sixes'));
  assert.deepEqual(must(pick(g, id, null)).events, [{ k: 'ytPick', id, cat: null }]);
  must(pick(g, id, 'sixes'));
  r = must(score(g, id, 'sixes'));
  assert.deepEqual(r.events.map((e) => e.k), ['ytScore', 'ytPick', 'ytTurn']);
  assert.equal(viewOf(g, id).pick, null);
  // 다음 사람은 깨끗하게 시작
  const v = viewOf(g, null);
  assert.equal(v.dice, null); assert.equal(v.rollsLeft, 3); assert.equal(v.pick, null);
});

test('score: 기록·last·보너스 알림·차례 넘김', () => {
  const { g, rng } = start(['a', 'b'], 13);
  const id = turnOf(g);
  must(roll(g, id, rng, place));
  const dice = viewOf(g, id).dice.map((d) => d.v);
  const r = must(score(g, id, 'choice'));
  const ev = r.events[0];
  assert.deepEqual(ev, { k: 'ytScore', id, cat: 'choice', score: dice.reduce((a, b) => a + b), bonus: false, total: dice.reduce((a, b) => a + b) });
  const v = viewOf(g, null);
  assert.deepEqual(v.last, { id, cat: 'choice', score: ev.score });
  assert.notEqual(v.turn, id);
  assert.equal(v.cols.find((c) => c.id === id).scores.choice, ev.score);
  // 보너스는 63 을 넘기는 그 기록에서 한 번만
  const { g: h, rng: r2 } = start(['a', 'b'], 14);
  const pid = turnOf(h);
  const col = h.cols.find((c) => c.id === pid);
  Object.assign(col.scores, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 }); // 45
  must(roll(h, pid, r2, place));
  h.dice.forEach((d) => { d.v = 6; }); // 6 이 다섯 개 = 30 → 75
  const e = must(score(h, pid, 'sixes')).events[0];
  assert.equal(e.score, 30); assert.equal(e.bonus, true); assert.equal(e.total, 45 + 30 + 35);
});

test('요트를 채운 뒤 또 요트 → 추가 점수 없음', () => {
  const { g, rng } = start(['a', 'b'], 15);
  const first = turnOf(g);
  must(roll(g, first, rng, place)); g.dice.forEach((d) => { d.v = 6; });
  assert.equal(must(score(g, first, 'yacht')).events[0].score, 50);
  playTurn(g, rng, 1); // 상대 차례
  assert.equal(turnOf(g), first);
  must(roll(g, first, rng, place)); g.dice.forEach((d) => { d.v = 6; });
  const before = snap(g);
  assert.equal(score(g, first, 'yacht').error, '이미 채운 칸입니다.');
  assert.equal(snap(g), before);
  assert.equal(viewOf(g, first).preview.yacht, undefined);
  const ev = must(score(g, first, 'sixes')).events[0];
  assert.equal(ev.score, 30); assert.equal(ev.total, 80); // 50 + 30, 추가 점수 없음
});

test('차례 아닌 사람의 5가지 요청 거절·상태 불변', () => {
  const { g, rng } = start(['a', 'b', 'c'], 16);
  const id = turnOf(g);
  const others = g.cols.map((c) => c.id).filter((x) => x !== id).concat(['spectator']);
  for (const stage of ['fresh', 'rolled']) {
    if (stage === 'rolled') must(roll(g, id, rng, place));
    for (const who of others) {
      const before = snap(g);
      const rs = [shake(g, who, true), shake(g, who, false), roll(g, who, rng, place), keep(g, who, 0, true, freeSpot), pick(g, who, 'ones'), score(g, who, 'ones')];
      for (const r of rs) { assert.equal(r.ok, false); assert.equal(r.error, '내 차례가 아닙니다.'); assert.deepEqual(r.events, []); }
      assert.equal(snap(g), before);
    }
  }
});

test('굴림 4번째 거절', () => {
  const { g, rng } = start(['a', 'b'], 17);
  const id = turnOf(g);
  for (let i = 0; i < 3; i++) must(roll(g, id, rng, place));
  const before = snap(g);
  const r = roll(g, id, rng, place);
  assert.equal(r.ok, false); assert.equal(r.error, '더 굴릴 수 없습니다.');
  assert.equal(snap(g), before);
  assert.equal(viewOf(g, id).rollsLeft, 0);
  assert.equal(shake(g, id, true).error, '더 굴릴 수 없습니다.');
  assert.equal(keep(g, id, 0, true, freeSpot).error, '지금은 보관할 수 없습니다.');
  assert.equal(keep(g, id, 0, false, freeSpot).error, '지금은 보관할 수 없습니다.');
  must(pick(g, id, 'ones')); must(score(g, id, 'ones')); // 기록은 된다
});

test('5개 보관 뒤 굴림 거절', () => {
  const { g, rng } = start(['a', 'b'], 18);
  const id = turnOf(g);
  must(roll(g, id, rng, place));
  for (let i = 0; i < 5; i++) must(keep(g, id, i, true, freeSpot));
  assert.deepEqual(viewOf(g, id).dice.map((d) => d.slot).sort(), [0, 1, 2, 3, 4]);
  const before = snap(g);
  assert.equal(roll(g, id, rng, place).error, '굴릴 주사위가 없습니다.');
  assert.equal(shake(g, id, true).error, '굴릴 주사위가 없습니다.');
  assert.equal(snap(g), before);
  must(keep(g, id, 2, false, freeSpot));
  must(roll(g, id, rng, place)); // 하나만 굴린다
});

test('굴리기 전 keep·pick·score 거절', () => {
  const { g } = start(['a', 'b'], 19);
  const id = turnOf(g);
  const before = snap(g);
  assert.equal(keep(g, id, 0, true, freeSpot).error, '지금은 보관할 수 없습니다.');
  assert.equal(pick(g, id, 'ones').error, '먼저 주사위를 굴리세요.');
  assert.equal(score(g, id, 'ones').error, '먼저 주사위를 굴리세요.');
  assert.equal(snap(g), before);
});

test('채운 칸 거절·모양 틀린 요청', () => {
  const { g, rng } = start(['a', 'b'], 20);
  const first = turnOf(g);
  must(roll(g, first, rng, place)); must(score(g, first, 'twos'));
  playTurn(g, rng, 1);
  must(roll(g, first, rng, place));
  const before = snap(g);
  assert.equal(pick(g, first, 'twos').error, '이미 채운 칸입니다.');
  assert.equal(score(g, first, 'twos').error, '이미 채운 칸입니다.');
  for (const bad of ['nope', '', 3, undefined, '__proto__']) assert.equal(score(g, first, bad).error, '잘못된 요청입니다.');
  assert.equal(pick(g, first, 'nope').error, '잘못된 요청입니다.');
  assert.equal(keep(g, first, 5, true, freeSpot).error, '잘못된 요청입니다.');
  assert.equal(keep(g, first, 0, 'x', freeSpot).error, '잘못된 요청입니다.');
  assert.equal(shake(g, first, 'x').error, '잘못된 요청입니다.');
  assert.equal(snap(g), before);
});

test('shake: 켜기·끄기·굴림이 끝냄', () => {
  const { g, rng } = start(['a', 'b'], 21);
  const id = turnOf(g);
  assert.deepEqual(must(shake(g, id, true)).events, [{ k: 'ytShake', id, on: true }]);
  assert.equal(viewOf(g, 'b').shaking, true);
  assert.deepEqual(must(shake(g, id, true)).events, []);
  must(roll(g, id, rng, place));
  assert.equal(viewOf(g, id).shaking, false);
  must(shake(g, id, true));
  assert.deepEqual(must(shake(g, id, false)).events, [{ k: 'ytShake', id, on: false }]);
  assert.deepEqual(must(shake(g, id, false)).events, []);
  must(shake(g, id, true));
  must(pick(g, id, 'ones')); must(score(g, id, 'ones'));
  assert.equal(viewOf(g, null).shaking, false);
});

test('기권: 차례 중 → 기록 없이 다음 사람, 주사위·선택 지움', () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 22);
  const [x, y, z] = events[0].order;
  must(roll(g, x, rng, place)); must(shake(g, x, true)); must(pick(g, x, 'choice'));
  const r = must(drop(g, x, 'away'));
  assert.deepEqual(r.events, [{ k: 'ytDrop', id: x, reason: 'away' }, { k: 'ytPick', id: x, cat: null }, { k: 'ytTurn', id: y, round: 1 }]);
  const v = viewOf(g, y);
  assert.equal(v.turn, y); assert.equal(v.dice, null); assert.equal(v.pick, null); assert.equal(v.shaking, false); assert.equal(v.rollsLeft, 3);
  const cx = v.cols.find((c) => c.id === x);
  assert.equal(cx.left, true); assert.ok(CATS.every((k) => cx.scores[k] == null)); assert.equal(cx.total, 0);
  assert.equal(v.cols.length, 3);
  // 이후 그 사람 차례는 건너뜀
  const seen = [];
  for (let i = 0; i < 4; i++) { seen.push(turnOf(g)); playTurn(g, rng, 1); }
  assert.deepEqual(seen, [y, z, y, z]);
  assert.equal(viewOf(g, null).round, 3);
  assert.equal(drop(g, x, 'leave').events.length, 0); // 이미 기권
});

test('기권: 차례 아닐 때 → 그 사람 차례를 건너뜀, 진행은 그대로', () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 23);
  const [x, y, z] = events[0].order;
  must(roll(g, x, rng, place));
  const r = must(drop(g, y, 'leave'));
  assert.deepEqual(r.events, [{ k: 'ytDrop', id: y, reason: 'leave' }]);
  assert.equal(turnOf(g), x);
  assert.equal(viewOf(g, x).dice.length, 5); // 그대로
  must(pick(g, x, 'ones')); must(score(g, x, 'ones'));
  assert.equal(turnOf(g), z);
  playTurn(g, rng, 1);
  assert.equal(turnOf(g), x);
  assert.equal(viewOf(g, null).round, 2);
});

test('기권: 마지막 순서 사람이 차례 중 → 다음 바퀴 첫 사람', () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 24);
  const [x, y, z] = events[0].order;
  playTurn(g, rng, 1); playTurn(g, rng, 1);
  assert.equal(turnOf(g), z);
  const r = must(drop(g, z, 'away'));
  assert.deepEqual(r.events.at(-1), { k: 'ytTurn', id: x, round: 2 });
});

test('기권: 1명 남음 → alone 우승 (차례 중이든 아니든)', () => {
  for (const dropTurn of [true, false]) {
    const { g, rng, events } = start(['a', 'b'], 25);
    const [x, y] = events[0].order;
    playTurn(g, rng, 1); // x 가 0 칸 기록
    const sx = viewOf(g, null).cols.find((c) => c.id === x).total;
    must(roll(g, y, rng, place));
    const who = dropTurn ? y : x;
    const stay = dropTurn ? x : y;
    const r = must(drop(g, who, 'away'));
    const end = r.events.at(-1);
    assert.equal(end.k, 'ytEnd'); assert.equal(end.reason, 'alone');
    assert.deepEqual(end.winners, [stay]);
    assert.deepEqual(end.ranks.map((q) => [q.id, q.rank]), [[stay, 1]]);
    const v = viewOf(g, stay);
    assert.equal(v.phase, 'result'); assert.equal(v.turn, null); assert.equal(v.dice, null); assert.equal(v.pick, null);
    assert.equal(v.cols.find((c) => c.id === who).left, true);
    assert.deepEqual(v.result, { reason: 'alone', ranks: end.ranks, winners: [stay] });
    assert.equal(typeof sx, 'number');
    assert.deepEqual(drop(g, stay, 'leave').events, []); // 끝난 판에서는 아무 일 없음
  }
});

test('기권: 4명 중 한 명씩 → 마지막에 alone', () => {
  const { g, events } = start(['a', 'b', 'c', 'd'], 26);
  const [w, x, y, z] = events[0].order;
  assert.equal(drop(g, x, 'away').events.at(-1).k, 'ytDrop');
  assert.equal(drop(g, y, 'away').events.at(-1).k, 'ytDrop');
  const r = must(drop(g, z, 'leave'));
  assert.equal(r.events.at(-1).reason, 'alone');
  assert.deepEqual(r.events.at(-1).winners, [w]);
});

test('기권: 동시에 모두 → 0명, 우승자 없음', () => {
  const { g, events } = start(['a', 'b'], 27);
  const r = must(drop(g, events[0].order, 'away'));
  assert.deepEqual(r.events.map((e) => e.k), ['ytDrop', 'ytDrop', 'ytEnd']);
  assert.deepEqual(r.events.at(-1), { k: 'ytEnd', reason: 'alone', ranks: [], winners: [] });
  const v = viewOf(g, 'a');
  assert.equal(v.phase, 'result'); assert.deepEqual(v.result, { reason: 'alone', ranks: [], winners: [] });
});

test('기권: 잘못된 reason·참가자 아님', () => {
  const { g } = start(['a', 'b', 'c'], 28);
  assert.equal(drop(g, 'a', 'timeout').ok, false);
  const before = snap(g);
  assert.deepEqual(must(drop(g, 'stranger', 'away')).events, []);
  assert.equal(snap(g), before);
});

test('기권자는 순위에서 빠진다', () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 29);
  const [x, y, z] = events[0].order;
  must(drop(g, x, 'away'));
  let last;
  while (turnOf(g) != null) last = playTurn(g, rng, 1);
  const end = last.at(-1);
  assert.equal(end.k, 'ytEnd'); assert.equal(end.reason, 'done');
  assert.deepEqual(end.ranks.map((r) => r.id).sort(), [y, z].sort());
  assert.equal(viewOf(g, x).cols.find((c) => c.id === x).left, true);
});

function setupFinal(names, totalsByIdx) {
  const { g, rng, events } = start(names, 31);
  g.round = 12;
  g.turnIdx = 0;
  g.cols.forEach((col, i) => {
    for (const k of CATS) col.scores[k] = 0;
    col.scores.yacht = null;
    col.scores.choice = totalsByIdx[i];
  });
  return { g, rng, events };
}

test('동점 공동 우승 (2명)', () => {
  const { g, rng } = setupFinal(['a', 'b'], [20, 20]);
  for (let i = 0; i < 2; i++) {
    const id = turnOf(g);
    must(roll(g, id, rng, place)); g.dice.forEach((d, n) => { d.v = n === 0 ? 1 : 2; }); // 요트 아님 → 0점
    must(score(g, id, 'yacht'));
  }
  const v = viewOf(g, 'a');
  assert.equal(v.phase, 'result');
  assert.equal(v.result.winners.length, 2);
  assert.deepEqual(v.result.ranks.map((r) => r.rank), [1, 1]);
});

test('동점: 1,1,3 등', () => {
  const { g, rng } = setupFinal(['a', 'b', 'c'], [10, 10, 5]);
  g.cols[0].scores.choice = 10; g.cols[1].scores.choice = 10; g.cols[2].scores.choice = 5;
  const ids = g.cols.map((c) => c.id);
  for (let i = 0; i < 3; i++) {
    const id = turnOf(g);
    must(roll(g, id, rng, place)); g.dice.forEach((d, n) => { d.v = n === 0 ? 1 : 2; });
    must(score(g, id, 'yacht'));
  }
  const v = viewOf(g, null);
  assert.deepEqual(v.result.ranks.map((r) => [r.id, r.rank, r.total]), [[ids[0], 1, 10], [ids[1], 1, 10], [ids[2], 3, 5]]);
  assert.deepEqual(v.result.winners, [ids[0], ids[1]]);
});

test('viewOf: preview 는 차례인 사람에게만, pick 은 모두에게', () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 32);
  const [x, y] = events[0].order;
  assert.equal(viewOf(g, x).preview, null); // 굴리기 전
  must(roll(g, x, rng, place)); must(pick(g, x, 'fours'));
  const dice = g.dice.map((d) => d.v);
  const mine = viewOf(g, x);
  assert.equal(Object.keys(mine.preview).length, 12);
  assert.equal(mine.preview.fours, scoreOf('fours', dice));
  for (const who of [y, 'spectator', null]) {
    const v = viewOf(g, who);
    assert.equal(v.preview, null);
    assert.equal(v.pick, 'fours');
    assert.deepEqual(v.dice, mine.dice);
    assert.equal(v.turn, x);
  }
  must(score(g, x, 'fours'));
  const next = viewOf(g, y);
  assert.equal(next.preview, null); // 아직 굴리기 전
  must(roll(g, y, rng, place));
  const p = viewOf(g, y).preview;
  assert.equal(Object.keys(p).length, 12);
  playTurn(g, rng, 1); // y
  playTurn(g, rng, 1); // z
  assert.equal(turnOf(g), events[0].order[0]);
  must(roll(g, turnOf(g), rng, place));
  assert.equal('fours' in viewOf(g, x).preview, false); // 채운 칸은 빠진다
  assert.equal(Object.keys(viewOf(g, x).preview).length, 11);
});

test('viewOf: 복사본을 준다', () => {
  const { g, rng } = start(['a', 'b'], 33);
  const id = turnOf(g);
  must(roll(g, id, rng, place));
  const v = viewOf(g, id);
  const before = snap(g);
  v.dice[0].v = 9; v.cols[0].scores.ones = 99; v.cols.push(1); v.preview.ones = 99;
  assert.equal(snap(g), before);
});

test('알림·상태에 auto·turnEndsAt 이 없다, timeout·autoPick 도 없다', async () => {
  const { g, rng, events } = start(['a', 'b', 'c'], 34);
  let all = [...events];
  for (let i = 0; i < 36; i++) all = all.concat(playTurn(g, rng, 3));
  const text = JSON.stringify(all) + JSON.stringify(viewOf(g, 'a')) + JSON.stringify(viewOf(g, null));
  assert.equal(/auto|turnEndsAt/.test(text), false);
  const mod = await import('../../shared/yacht/game.js');
  assert.equal('timeout' in mod, false); assert.equal('autoPick' in mod, false);
});

test('눈 분포: 6만 개에서 각 눈 9,000~11,000', () => {
  const rng = mulberry32(2024);
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  while (total < 60000) {
    const g = createGame({ players: P('a', 'b'), rng }).game;
    for (let t = 0; t < 24 && total < 60000; t++) {
      const id = turnOf(g);
      for (let k = 0; k < 3; k++) {
        const ev = must(roll(g, id, rng, place)).events[0];
        for (const i of ev.thrown) { if (total < 60000) { cnt[ev.dice[i].v]++; total++; } }
      }
      must(score(g, id, CATS.find((c) => viewOf(g, id).cols.find((x) => x.id === id).scores[c] == null)));
    }
  }
  for (let v = 1; v <= 6; v++) assert.ok(cnt[v] >= 9000 && cnt[v] <= 11000, `눈 ${v}: ${cnt[v]}`);
});

test('소스에 Math.random·Date·setTimeout 이 없다', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['constants', 'score', 'game', 'protocol']) {
    const src = readFileSync(new URL(`../../shared/yacht/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.equal(/Math\.random|Date\.|new Date|setTimeout|setInterval|performance\./.test(src), false, f);
  }
});
