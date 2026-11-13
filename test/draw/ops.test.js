// shared/draw/ops.js 시험. 출제자(그리는 사람)인지·단계가 draw 인지는 이 모듈 범위 밖이다(room 이 먼저 확인한다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../shared/draw/ops.js';
import * as K from '../../shared/draw/constants.js';

// 선 하나를 st + pt(f:1)로 긋는다. 반환: 선 번호
function line(s, x, y, { c = 0, w = 10, e = 0, steps = [[5, 5]] } = {}) {
  assert.equal(D.st(s, { c, w, e, p: [x, y] }).ok, true);
  const r = D.pt(s, { p: steps.flat(), f: 1 });
  assert.equal(r.ok, true);
  return s.ops.length - 1;
}
const visIds = (s) => D.visibleStrokes(s).map((v) => v.id);

test('선 긋기: st → pt → f:1 로 한 일이 하나 생긴다', () => {
  const s = D.createDrawing();
  const r = D.st(s, { c: 4, w: 10, e: 0, p: [100, 100, 3, 4] });
  assert.deepEqual(r, { ok: true, event: { k: 'drSt', c: 4, w: 10, e: 0, p: [100, 100, 3, 4] } });
  assert.equal(s.ops.length, 0); // 긋는 중에는 아직 ops 에 없다
  assert.equal(D.visibleStrokes(s).length, 1);
  assert.equal(D.visibleStrokes(s, { cur: false }).length, 0);
  assert.deepEqual(D.pt(s, { p: [1, 1] }), { ok: true, event: { k: 'drPt', p: [1, 1] } });
  assert.deepEqual(D.pt(s, { p: [], f: 1 }), { ok: true, event: { k: 'drPt', p: [], f: 1 } });
  assert.equal(s.ops.length, 1);
  assert.equal(s.at, 1);
  assert.deepEqual(s.ops[0].p, [100, 100, 3, 4, 1, 1]);
  assert.deepEqual(D.absPoints(s.ops[0].p), [100, 100, 103, 104, 104, 105]);
  assert.equal(D.pt(s, { p: [1, 1] }).ok, false); // 긋는 중이 아님
});

test('앞 선이 안 끝났는데 새 st 가 오면 앞 선은 끝난 것으로 친다', () => {
  const s = D.createDrawing();
  D.st(s, { c: 0, w: 4, e: 0, p: [10, 10] });
  D.st(s, { c: 1, w: 4, e: 0, p: [20, 20] });
  assert.equal(s.ops.length, 1);
  assert.equal(s.cur.c, 1);
});

test('되돌리기 3번 · 다시 하기 2번 뒤 상태', () => {
  const s = D.createDrawing();
  for (let i = 0; i < 5; i++) line(s, 100 + i * 10, 100);
  assert.equal(s.at, 5);
  for (let i = 0; i < 3; i++) assert.equal(D.undo(s).event.k, 'drUndo');
  assert.equal(s.at, 2);
  assert.deepEqual(visIds(s), [0, 1]);
  assert.equal(D.redo(s).ok, true);
  assert.equal(D.redo(s).ok, true);
  assert.equal(s.at, 4);
  assert.equal(s.ops.length, 5);
  assert.deepEqual(visIds(s), [0, 1, 2, 3]);
  assert.equal(D.canUndo(s), true);
  assert.equal(D.canRedo(s), true);
  D.redo(s);
  assert.equal(D.canRedo(s), false);
  assert.equal(D.redo(s).noop, true); // 더 살릴 것이 없으면 무시
});

test('처음까지 되돌리기, 더 못 되돌리면 무시', () => {
  const s = D.createDrawing();
  line(s, 10, 10);
  assert.equal(D.undo(s).ok, true);
  assert.equal(D.canUndo(s), false);
  assert.deepEqual(D.undo(s), { ok: true, noop: true });
  assert.equal(s.at, 0);
});

test('새 선을 그으면 다시 하기 목록이 비워진다', () => {
  const s = D.createDrawing();
  for (let i = 0; i < 4; i++) line(s, 100, 100 + i * 20);
  D.undo(s); D.undo(s);
  assert.equal(D.canRedo(s), true);
  line(s, 500, 500);
  assert.equal(s.ops.length, 3); // 2개 + 새 선
  assert.equal(s.at, 3);
  assert.equal(D.canRedo(s), false);
  assert.equal(D.redo(s).noop, true);
  assert.equal(s.ops[2].p[0], 500);
});

test('긋다가 cx 로 버린 선은 다시 하기 목록을 건드리지 않는다', () => {
  const s = D.createDrawing();
  line(s, 10, 10); line(s, 20, 20);
  D.undo(s);
  D.st(s, { c: 0, w: 4, e: 0, p: [300, 300] });
  assert.deepEqual(D.cx(s), { ok: true, event: { k: 'drCx' } });
  assert.equal(s.cur, null);
  assert.equal(D.canRedo(s), true);
  assert.equal(D.cx(s).noop, true);
});

test('전체 지우기는 한 일이고 되돌리기로 복구, 다시 하면 또 지워진다', () => {
  const s = D.createDrawing();
  line(s, 10, 10); line(s, 20, 20);
  assert.deepEqual(D.clear(s), { ok: true, event: { k: 'drClear' } });
  assert.equal(s.ops.length, 3);
  assert.deepEqual(visIds(s), []);
  assert.equal(D.clear(s).noop, true); // 이미 빈 종이
  assert.equal(s.ops.length, 3);
  D.undo(s);
  assert.deepEqual(visIds(s), [0, 1]);
  D.redo(s);
  assert.deepEqual(visIds(s), []);
  // 전체 지우기 뒤의 새 선만 보인다
  line(s, 30, 30);
  assert.deepEqual(visIds(s), [3]);
});

test('전체 지우기도 다시 하기 목록을 비운다', () => {
  const s = D.createDrawing();
  line(s, 10, 10); line(s, 20, 20);
  D.undo(s);
  D.clear(s);
  assert.equal(D.canRedo(s), false);
  assert.equal(s.ops.length, 2); // 선 1 + clear
});

test('획 지우개: 선을 통째로 지우고 되돌리기로 돌아온다', () => {
  const s = D.createDrawing();
  line(s, 10, 10); line(s, 20, 20); line(s, 30, 30);
  const r = D.rm(s, { ids: [1] });
  assert.deepEqual(r, { ok: true, event: { k: 'drRm', ids: [1] } });
  assert.deepEqual(visIds(s), [0, 2]);
  D.undo(s);
  assert.deepEqual(visIds(s), [0, 1, 2]);
  D.redo(s);
  assert.deepEqual(visIds(s), [0, 2]);
});

test('획 지우개: 한 번 문지른 것(g:1)은 한 묶음이라 되돌리기 한 번에 돌아온다', () => {
  const s = D.createDrawing();
  for (let i = 0; i < 4; i++) line(s, 10 + i, 10);
  assert.deepEqual(D.rm(s, { ids: [0] }).event, { k: 'drRm', ids: [0] });
  assert.deepEqual(D.rm(s, { ids: [1], g: 1 }).event, { k: 'drRm', ids: [1], g: 1 });
  assert.deepEqual(D.rm(s, { ids: [2], g: 1 }).event, { k: 'drRm', ids: [2], g: 1 });
  assert.equal(s.ops.length, 5);
  assert.deepEqual(s.ops[4].rm, [0, 1, 2]);
  assert.deepEqual(visIds(s), [3]);
  D.undo(s);
  assert.deepEqual(visIds(s), [0, 1, 2, 3]);
});

test('획 지우개 g:1 인데 합칠 수 없으면(마지막이 rm 이 아님) 새 묶음, 알림에 g 가 없다', () => {
  const s = D.createDrawing();
  line(s, 10, 10); line(s, 20, 20); line(s, 30, 30);
  const r = D.rm(s, { ids: [0], g: 1 });
  assert.deepEqual(r.event, { k: 'drRm', ids: [0] });
  line(s, 40, 40);
  assert.deepEqual(D.rm(s, { ids: [1], g: 1 }).event, { k: 'drRm', ids: [1] }); // 마지막이 선이라 새 묶음
  assert.equal(s.ops.length, 6);
  // 되돌린 뒤(at < length)에도 합치지 않는다
  D.undo(s);
  assert.deepEqual(D.rm(s, { ids: [2], g: 1 }).event, { k: 'drRm', ids: [2] });
});

test('획 지우개: 정밀 지우개 선·이미 지운 선·없는 번호·전체 지우기 앞의 선은 받지 않는다', () => {
  const s = D.createDrawing();
  line(s, 10, 10);                 // 0 펜
  line(s, 20, 20, { e: 1 });       // 1 정밀 지우개
  line(s, 30, 30);                 // 2 펜
  assert.equal(D.rm(s, { ids: [1] }).ok, false);
  assert.equal(D.rm(s, { ids: [3] }).ok, false);
  assert.equal(D.rm(s, { ids: [99] }).ok, false);
  assert.equal(D.rm(s, { ids: [-1] }).ok, false);
  assert.deepEqual(D.rm(s, { ids: [0, 1, 7] }).event, { k: 'drRm', ids: [0] }); // 받아들인 번호만 알린다
  assert.equal(D.rm(s, { ids: [0] }).ok, false); // 이미 지움
  assert.equal(D.rm(s, { ids: [] }).ok, false);
  D.clear(s);
  assert.equal(D.rm(s, { ids: [2] }).ok, false); // 전체 지우기 앞
  assert.equal(D.rm(s, { ids: Array.from({ length: K.MAX_RM_IDS + 1 }, (_, i) => i) }).ok, false);
});

test('획 지우개는 정밀 지우개 자국을 그대로 남긴다', () => {
  const s = D.createDrawing();
  line(s, 10, 10);                 // 0 펜
  line(s, 12, 12, { e: 1 });       // 1 정밀 지우개 (펜 위에 덧칠)
  D.rm(s, { ids: [0] });
  assert.deepEqual(visIds(s), [1]); // 자국은 남는다(종이 색이라 눈에는 안 보인다)
  assert.equal(D.visibleStrokes(s)[0].e, 1);
});

test('긋던 선이 있을 때 rm/undo/clear 는 그 선을 먼저 확정한다', () => {
  const s = D.createDrawing();
  line(s, 10, 10);
  D.st(s, { c: 0, w: 4, e: 0, p: [50, 50] });
  assert.equal(D.rm(s, { ids: [1] }).ok, true); // 긋던 선(번호 1)을 지움
  assert.equal(s.cur, null);
  assert.deepEqual(visIds(s), [0]);
  D.st(s, { c: 0, w: 4, e: 0, p: [60, 60] });
  assert.equal(D.undo(s).ok, true); // 긋던 선을 확정한 뒤 한 칸 뒤로: 그 선이 빠진다
  assert.equal(s.cur, null);
  assert.equal(s.at, 3);
  assert.equal(s.ops.length, 4);
});

test('정밀 지우개 선은 펜과 같은 길(st/pt)로 들어가고 순서대로 보인다', () => {
  const s = D.createDrawing();
  line(s, 10, 10);
  line(s, 10, 10, { e: 1, w: 24 });
  const v = D.visibleStrokes(s);
  assert.deepEqual(v.map((x) => x.e), [0, 1]);
  assert.equal(v[1].w, 24);
});

test('한도: 한 일 600개 (선, rm, clear 모두 센다)', () => {
  const s = D.createDrawing();
  for (let i = 0; i < K.MAX_OPS; i++) {
    const r = D.st(s, { c: 0, w: 2, e: 0, p: [i % 1000, 5] });
    assert.equal(r.ok, true, `i=${i}`);
    assert.equal(D.pt(s, { p: [], f: 1 }).ok, true);
  }
  assert.equal(s.ops.length, K.MAX_OPS);
  const before = JSON.stringify(s);
  assert.deepEqual(D.st(s, { c: 0, w: 2, e: 0, p: [1, 1] }), { ok: false, error: 'full' });
  assert.deepEqual(D.clear(s), { ok: false, error: 'full' });
  assert.deepEqual(D.rm(s, { ids: [0] }), { ok: false, error: 'full' });
  assert.equal(JSON.stringify(s), before); // 거절하면 상태가 그대로
  // 되돌리면 다시 그을 수 있다
  D.undo(s);
  assert.equal(D.st(s, { c: 0, w: 2, e: 0, p: [1, 1] }).ok, true);
  assert.equal(s.at, K.MAX_OPS - 1); // 긋는 중이라 아직 확정 전
});

test('한도: 선 하나 점 4000개를 넘으면 그 선을 버리고 drCx 를 알린다', () => {
  const s = D.createDrawing();
  D.st(s, { c: 0, w: 4, e: 0, p: [0, 0] });
  const chunk = []; // 64점, 오른쪽 위아래로 지그재그 (범위 안)
  for (let i = 0; i < 64; i++) chunk.push(i % 2 ? -1 : 1, 0);
  let n = 1;
  let last;
  while (n + 64 <= K.MAX_POINTS_PER_STROKE) { last = D.pt(s, { p: chunk }); assert.equal(last.ok, true); n += 64; }
  last = D.pt(s, { p: chunk });
  assert.equal(last.ok, false);
  assert.equal(last.error, 'full');
  assert.deepEqual(last.event, { k: 'drCx' });
  assert.equal(s.cur, null);
  assert.equal(s.ops.length, 0);
});

test('한도: 점 6만 개를 넘으면 거절', () => {
  const s = D.createDrawing();
  const chunk = [];
  for (let i = 0; i < 64; i++) chunk.push(i % 2 ? -1 : 1, 0);
  let total = 0;
  let r;
  outer: for (let line = 0; line < 100; line++) {
    r = D.st(s, { c: 0, w: 4, e: 0, p: [100, 100] });
    if (!r.ok) break;
    total += 1;
    for (let k = 0; k < 40; k++) {
      r = D.pt(s, { p: chunk, ...(k === 39 ? { f: 1 } : {}) });
      if (!r.ok) break outer;
      total += 64;
    }
  }
  assert.equal(r.ok, false);
  assert.equal(r.error, 'full');
  assert.ok(total <= K.MAX_POINTS_TOTAL && total > K.MAX_POINTS_TOTAL - 64 * 40);
});

test('범위 밖 누적 좌표는 상태를 바꾸지 않고 거절', () => {
  const s = D.createDrawing();
  D.st(s, { c: 0, w: 4, e: 0, p: [1590, 1190] });
  const before = JSON.stringify(s);
  assert.deepEqual(D.pt(s, { p: [11, 0] }), { ok: false, error: 'range' }); // x 1601
  assert.deepEqual(D.pt(s, { p: [0, 11] }), { ok: false, error: 'range' }); // y 1201
  assert.deepEqual(D.pt(s, { p: [5, 5, -1600, 0] }), { ok: false, error: 'range' }); // 중간에 벗어남
  assert.equal(JSON.stringify(s), before);
  assert.equal(D.pt(s, { p: [10, 10] }).ok, true); // 정확히 경계는 허용
  // 시작 점이 범위 밖, 시작 뒤 차이값이 범위 밖
  assert.equal(D.st(s, { c: 0, w: 4, e: 0, p: [1601, 0] }).ok, false);
  assert.equal(D.st(s, { c: 0, w: 4, e: 0, p: [0, 0, -1, 0] }).ok, false);
  assert.equal(s.cur.p[0], 1590); // 거절된 st 는 긋던 선을 건드리지 않는다
});

test('모양이 틀린 입력은 거절(상태 그대로)', () => {
  const s = D.createDrawing();
  assert.equal(D.st(s, { c: 12, w: 4, e: 0, p: [1, 1] }).ok, false);
  assert.equal(D.st(s, { c: 0, w: 1, e: 0, p: [1, 1] }).ok, false);
  assert.equal(D.st(s, { c: 0, w: 4, e: 2, p: [1, 1] }).ok, false);
  assert.equal(D.st(s, { c: 0, w: 4, e: 0, p: [1] }).ok, false);
  assert.equal(D.st(s, { c: 0, w: 4, e: 0, p: [1.5, 1] }).ok, false);
  assert.equal(D.st(s, null).ok, false);
  D.st(s, { c: 0, w: 4, e: 0, p: [10, 10] });
  assert.equal(D.pt(s, { p: [] }).ok, false); // 빈 p 는 f:1 일 때만
  assert.equal(D.pt(s, { p: [1] }).ok, false);
  assert.equal(D.pt(s, { p: [1, 1], f: 0 }).ok, false);
  assert.equal(s.cur.p.length, 2);
});

test('내보내기 → 받아 들이기 왕복이 같은 그림 (되돌린 상태·긋는 중인 선 포함)', () => {
  const s = D.createDrawing();
  line(s, 100, 100, { steps: [[5, 5], [-3, 2]] });
  line(s, 200, 200, { e: 1, w: 24 });
  line(s, 300, 300, { c: 7 });
  D.rm(s, { ids: [0] });
  D.rm(s, { ids: [2], g: 1 });
  D.clear(s);
  line(s, 400, 400);
  D.undo(s);
  D.undo(s);
  D.st(s, { c: 3, w: 12, e: 0, p: [700, 600, 2, 2] }); // 긋는 중. 이 시점에 redo 목록은 (cur 확정 전이라) 남아 있다
  const dump = D.exportSync(s);
  assert.deepEqual(dump.cur, { c: 3, w: 12, e: 0, p: [700, 600, 2, 2] });
  const wire = JSON.parse(JSON.stringify(dump)); // 네트워크를 건넌다
  const r = D.importSync(wire);
  assert.equal(r.ok, true);
  assert.deepEqual(D.exportSync(r.state), dump);
  assert.deepEqual(D.visibleStrokes(r.state), D.visibleStrokes(s));
  assert.equal(D.canRedo(r.state), true);
  // 받은 쪽이 이어서 같은 일을 하면 같은 결과
  const a = D.pt(s, { p: [4, 4], f: 1 });
  const b = D.pt(r.state, { p: [4, 4], f: 1 });
  assert.deepEqual(a, b);
  assert.deepEqual(D.exportSync(r.state), D.exportSync(s));
  // 상태는 평범한 객체
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('서버가 보낸 event 를 화면이 apply 하면 서버와 같은 상태가 된다', () => {
  const srv = D.createDrawing();
  const cli = D.createDrawing();
  const run = (r) => { assert.equal(r.ok, true); assert.equal(D.apply(cli, r.event).ok, true); };
  run(D.st(srv, { c: 1, w: 6, e: 0, p: [10, 10, 1, 1] }));
  run(D.pt(srv, { p: [2, 2], f: 1 }));
  run(D.st(srv, { c: 2, w: 6, e: 1, p: [30, 30] }));
  run(D.pt(srv, { p: [1, 0], f: 1 }));
  run(D.rm(srv, { ids: [0] }));
  run(D.undo(srv));
  run(D.undo(srv));
  run(D.redo(srv));
  run(D.clear(srv));
  run(D.undo(srv));
  assert.deepEqual(D.exportSync(cli), D.exportSync(srv));
});

test('잘못된 drSync 는 받지 않는다', () => {
  const ok = { ops: [{ c: 0, w: 4, e: 0, p: [1, 1] }], at: 1, cur: null };
  assert.equal(D.importSync(ok).ok, true);
  assert.equal(D.importSync({ ...ok, at: 2 }).ok, false);
  assert.equal(D.importSync({ ...ok, at: -1 }).ok, false);
  assert.equal(D.importSync({ ops: [{ c: 0, w: 4, e: 0, p: [1, 1, 2000, 0] }], at: 1, cur: null }).ok, false);
  assert.equal(D.importSync({ ops: [{ c: 0, w: 4, e: 0, p: [1, 1] }, { rm: [5] }], at: 2, cur: null }).ok, false);
  assert.equal(D.importSync({ ops: [{ c: 0, w: 4, e: 1, p: [1, 1] }, { rm: [0] }], at: 2, cur: null }).ok, false); // 정밀 지우개 선
  assert.equal(D.importSync({ ops: [{ x: 1 }], at: 1, cur: null }).ok, false);
  assert.equal(D.importSync(null).ok, false);
  assert.equal(D.importSync({ ops: [], at: 0, cur: { c: 99, w: 4, e: 0, p: [1, 1] } }).ok, false);
  const empty = D.importSync({ ops: [], at: 0, cur: null });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.state, D.createDrawing());
});
