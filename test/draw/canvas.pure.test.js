import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../client/src/draw/canvas/pure.js';
import * as O from '../../shared/draw/ops.js';
import { MAX_NUMS_PER_MSG, CANVAS_W, CANVAS_H } from '../../shared/draw/constants.js';

test('fitBox: 4:3 로 가장 크게', () => {
  assert.deepEqual(P.fitBox(800, 600), { w: 800, h: 600 });
  assert.deepEqual(P.fitBox(1000, 300), { w: 400, h: 300 });
  assert.deepEqual(P.fitBox(300, 1000), { w: 300, h: 225 });
  assert.deepEqual(P.fitBox(0, 100), { w: 0, h: 0 });
});

test('toLogical: 좌표 변환과 종이 안으로 붙이기', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  assert.deepEqual(P.toLogical(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(P.toLogical(500, 350, rect), { x: 800, y: 600 });
  assert.deepEqual(P.toLogical(900, 650, rect), { x: CANVAS_W, y: CANVAS_H });
  assert.deepEqual(P.toLogical(-50, 9999, rect), { x: 0, y: CANVAS_H });
});

test('smoothToward·farEnough', () => {
  assert.deepEqual(P.smoothToward({ x: 100, y: 100 }, { x: 200, y: 300 }, 0.65), { x: 165, y: 230 });
  assert.deepEqual(P.smoothToward({ x: 100, y: 100 }, { x: 200, y: 300 }, 1), { x: 200, y: 300 });
  assert.equal(P.farEnough({ x: 0, y: 0 }, { x: 3, y: 0 }), false); // 간격 4(논리) 미만
  assert.equal(P.farEnough({ x: 0, y: 0 }, { x: 4, y: 0 }), true);
  assert.equal(P.farEnough(null, { x: 0, y: 0 }), true);
});

test('packPoints·splitNums', () => {
  const pts = [{ x: 10, y: 20 }, { x: 15, y: 18 }, { x: 15, y: 30 }];
  assert.deepEqual(P.packPoints(pts, null), [10, 20, 5, -2, 0, 12]);
  assert.deepEqual(P.packPoints(pts, { x: 8, y: 8 }), [2, 12, 5, -2, 0, 12]);
  const chunks = P.splitNums(new Array(300).fill(1));
  assert.deepEqual(chunks.map((c) => c.length), [128, 128, 44]);
  assert.ok(chunks.every((c) => c.length % 2 === 0 && c.length <= MAX_NUMS_PER_MSG));
});

test('planMessages: 첫 묶음은 st, 끝 표시 f:1', () => {
  assert.deepEqual(P.planMessages([{ x: 5, y: 6 }], null, true), [{ kind: 'st', p: [5, 6] }, { kind: 'pt', p: [], f: 1 }]);
  assert.deepEqual(P.planMessages([], { x: 5, y: 6 }, true), [{ kind: 'pt', p: [], f: 1 }]);
  assert.deepEqual(P.planMessages([], { x: 5, y: 6 }, false), []);
  assert.deepEqual(P.planMessages([{ x: 8, y: 6 }], { x: 5, y: 6 }, true), [{ kind: 'pt', p: [3, 0], f: 1 }]);
  const many = Array.from({ length: 150 }, (_, i) => ({ x: i * 5, y: 7 }));
  const m = P.planMessages(many, null, true);
  assert.deepEqual(m.map((x) => x.kind), ['st', 'pt', 'pt']);
  assert.equal(m[0].p.length, 128);
  assert.equal(m[2].f, 1);
  assert.equal(m[1].f, undefined);
});

test('압축 → ops 적용 → absPoints 왕복이 원래 점과 같다', () => {
  const orig = [];
  let x = 400; let y = 300;
  for (let i = 0; i < 250; i++) { x = Math.max(0, Math.min(CANVAS_W, x + ((i * 37) % 41) - 20)); y = Math.max(0, Math.min(CANVAS_H, y + ((i * 53) % 29) - 14)); orig.push({ x, y }); }
  const s = O.createDrawing();
  // 보내는 쪽 흐름: 묶음마다 planMessages, 받는 쪽은 ops 로 적용
  const sent = [];
  let last = null;
  for (let i = 0; i < orig.length; i += 70) {
    const part = orig.slice(i, i + 70);
    const final = i + 70 >= orig.length;
    for (const m of P.planMessages(part, last, final)) sent.push(m);
    last = part[part.length - 1];
  }
  for (const m of sent) {
    const r = m.kind === 'st' ? O.st(s, { c: 3, w: 10, e: 0, p: m.p }) : O.pt(s, m.f ? { p: m.p, f: 1 } : { p: m.p });
    assert.equal(r.ok, true, JSON.stringify(m));
  }
  assert.equal(s.cur, null);
  assert.equal(s.ops.length, 1);
  const abs = O.absPoints(s.ops[0].p);
  assert.deepEqual(abs, orig.flatMap((p) => [p.x, p.y]));
  // 받는 쪽 이어 붙이기(appendAbs)도 같은 결과
  const a = [];
  for (const m of sent) P.appendAbs(a, m.p);
  assert.deepEqual(a, abs);
});

test('planRm: 50개씩, 둘째 묶음부터 g:1', () => {
  const ids = Array.from({ length: 120 }, (_, i) => i);
  const r = P.planRm(ids, false);
  assert.deepEqual(r.map((m) => m.ids.length), [50, 50, 20]);
  assert.deepEqual(r.map((m) => m.g), [undefined, 1, 1]);
  assert.equal(P.planRm([1], true)[0].g, 1);
});

test('segmentsFrom: 이어진 곡선, 점 하나는 동그라미', () => {
  assert.deepEqual(P.segmentsFrom([5, 6], 0), [{ dot: true, x: 5, y: 6 }]);
  assert.deepEqual(P.segmentsFrom([5, 6], 1), []);
  const a = [0, 0, 10, 0, 10, 10, 0, 10];
  const segs = P.segmentsFrom(a, 0);
  assert.equal(segs.length, 4);
  assert.deepEqual([segs[0].x0, segs[0].y0, segs[0].x1, segs[0].y1], [0, 0, 5, 0]);
  assert.deepEqual([segs[1].x0, segs[1].cx, segs[1].cy, segs[1].x1, segs[1].y1], [5, 10, 0, 10, 5]); // 점 (10,0) 으로 휨
  for (let i = 0; i < segs.length - 1; i++) assert.deepEqual([segs[i].x1, segs[i].y1], [segs[i + 1].x0, segs[i + 1].y0]);
  assert.deepEqual([segs[3].x1, segs[3].y1], [0, 10]);
  // 점이 늘어난 뒤 이어 그릴 때는 앞서 꼬리였던 조각부터
  assert.equal(P.resumeIndex(4), 3);
  assert.equal(P.resumeIndex(0), 0);
  assert.deepEqual(P.segmentsFrom(a, P.resumeIndex(3), 4).length, 2);
});

test('strokeHit: 선에 닿으면 true, 멀면 false', () => {
  const a = [100, 100, 500, 100]; // 가로선, 굵기 w=4 → 닿는 범위 16+4
  assert.equal(P.strokeHit(a, 4, 300, 110, 300, 110), true);
  assert.equal(P.strokeHit(a, 4, 300, 130, 300, 130), false);
  assert.equal(P.strokeHit(a, 4, 300, 0, 300, 300), true); // 가로지르며 지나감
  assert.equal(P.strokeHit(a, 4, 700, 100, 800, 100), false);
  assert.equal(P.strokeHit([200, 200], 10, 215, 200, 215, 200), true); // 점 하나짜리 선
  assert.equal(P.strokeHit([200, 200], 10, 260, 200, 260, 200), false);
  assert.equal(P.distSegSeg(0, 0, 10, 10, 0, 10, 10, 0), 0);
});

test('decideDown: 손바닥·펜슬 규칙', () => {
  const base = { penSeen: false, activeType: null, type: 'touch', button: 0, width: 20, height: 20 };
  assert.equal(P.decideDown(base), 'start');
  assert.equal(P.decideDown({ ...base, activeType: 'touch' }), 'ignore'); // 둘째 접촉
  assert.equal(P.decideDown({ ...base, width: 80 }), 'ignore'); // 손바닥처럼 넓은 닿음
  assert.equal(P.decideDown({ ...base, penSeen: true }), 'ignore'); // 펜슬을 본 뒤 손가락
  assert.equal(P.decideDown({ ...base, type: 'pen' }), 'start');
  assert.equal(P.decideDown({ ...base, type: 'pen', activeType: 'touch' }), 'replace');
  assert.equal(P.decideDown({ ...base, type: 'pen', activeType: 'pen' }), 'ignore');
  assert.equal(P.decideDown({ ...base, type: 'mouse', button: 2 }), 'ignore');
  assert.equal(P.decideDown({ ...base, type: 'mouse', width: 1, height: 1 }), 'start');
});

test('staleActive: 끝 알림을 못 받은 앞 누름 알아보기', () => {
  const pen = { id: 3, type: 'pen' };
  assert.equal(P.staleActive(pen, { id: 3, type: 'pen', isPrimary: true }), true); // 같은 번호가 다시 눌림
  assert.equal(P.staleActive(pen, { id: 4, type: 'pen', isPrimary: true }), true); // 펜은 하나뿐
  assert.equal(P.staleActive(pen, { id: 5, type: 'touch', isPrimary: true }), false); // 펜 긋는 중 손가락(손바닥)
  const finger = { id: 7, type: 'touch' };
  assert.equal(P.staleActive(finger, { id: 8, type: 'touch', isPrimary: false }), false); // 둘째 손가락: 무시 규칙 그대로
  assert.equal(P.staleActive(finger, { id: 8, type: 'touch', isPrimary: true }), true); // 다른 닿음 없음 = 앞 손가락은 떨어짐
  assert.equal(P.staleActive(null, { id: 1, type: 'mouse', isPrimary: true }), false);
});

test('confirmedSegments·tailSegment: 꼬리를 뺀 확정 조각만', () => {
  const a = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.equal(P.confirmedSegments(a, 0, 4).length, 3); // 0,1,2 번 (3 번이 꼬리)
  assert.deepEqual(P.tailSegment(a, 4), P.segmentsFrom(a, 3, 4)[0]);
  assert.equal(P.confirmedSegments(a, 0, 2).length, 1); // 점 둘: 첫 조각만 확정, 꼬리는 따로
  assert.deepEqual(P.confirmedSegments([5, 6], 0, 1), [{ dot: true, x: 5, y: 6 }]); // 점 하나는 확정
  assert.equal(P.tailSegment([5, 6], 1), null);
  // 점이 늘어난 뒤 이어 그리면 확정 조각이 빠짐없이 한 번씩만 이어진다
  const seen = [];
  let prevN = 0;
  for (const n of [1, 2, 3, 4]) {
    for (const g of P.confirmedSegments(a, prevN > 0 ? prevN - 1 : 0, n)) seen.push(g.dot ? 'dot' : `${g.x0},${g.y0}`);
    prevN = n;
  }
  assert.deepEqual(seen, ['dot', '0,0', '5,0', '10,5']);
  // 모든 확정 조각 + 마지막 꼬리 = 선 전체 조각
  assert.equal(P.confirmedSegments(a, 0, 4).length + 1, P.segmentsFrom(a, 0, 4).length);
});

test('finalPoint: 뗀 자리를 마지막 점으로(간격 규칙 지킴)', () => {
  const last = { x: 100, y: 100 };
  assert.deepEqual(P.finalPoint(last, { x: 150, y: 100 }), { x: 150, y: 100 });
  assert.equal(P.finalPoint(last, { x: 102, y: 101 }), null); // 너무 가까움(논리 4 미만)
  assert.equal(P.finalPoint(last, { x: NaN, y: 1 }), null);
  assert.equal(P.finalPoint(last, null), null);
  // 손가락 보정 뒤 남은 거리를 메운다: 보정 점 → 뗀 자리
  const sm = P.smoothToward(last, { x: 200, y: 100 }, 0.65);
  assert.ok(sm.x < 200);
  assert.deepEqual(P.finalPoint(sm, { x: 200, y: 100 }), { x: 200, y: 100 });
});
