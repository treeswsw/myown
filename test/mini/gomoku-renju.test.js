// 오목 규칙 선택: 제한 없음(기본, 지금까지의 동작) / 렌주룰(흑만 3-3·4-4·장목 금지, 백은 제한 없음·장목도 승).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../shared/mini/index.js';

const { gomoku } = GAMES;

// black/white = [[x,y], ...]. turn 0 = 흑.
function pos(rule, black, white = [], turn = 0) {
  const s = gomoku.init({ rule });
  for (const [x, y] of black) s.board[y][x] = 0;
  for (const [x, y] of white) s.board[y][x] = 1;
  s.turn = turn;
  return s;
}
const why = (s, x, y) => gomoku.forbidden(s, { x, y });

test('gomoku: init defaults to the free rule; unknown rule falls back to free', () => {
  assert.equal(gomoku.init().rule, 'free');
  assert.equal(gomoku.init({ rule: 'nope' }).rule, 'free');
  assert.equal(gomoku.init({ rule: 'renju' }).rule, 'renju');
});

test('free rule: 3-3, 4-4 and six in a row are all allowed (six wins)', () => {
  const dbl3 = pos('free', [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.ok(gomoku.apply(dbl3, { x: 7, y: 7 }));
  const dbl4 = pos('free', [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]);
  assert.ok(gomoku.apply(dbl4, { x: 7, y: 7 }));
  const six = pos('free', [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]]);
  assert.equal(gomoku.apply(six, { x: 6, y: 7 }).winner, 0);
});

test('renju: black 3-3 is refused with a reason; the same shape is fine for white', () => {
  const s = pos('renju', [[5, 7], [6, 7], [7, 5], [7, 6]], [[0, 0], [14, 0]]);
  assert.equal(why(s, 7, 7), '3-3');
  assert.equal(gomoku.apply(s, { x: 7, y: 7 }), null);
  assert.match(gomoku.reject(s, { x: 7, y: 7 }), /3-3/);
  // 금수 자리도 둘 수 있는 곳 목록에는 있다(눌러 보면 서버가 이유와 함께 거절한다)
  assert.ok(gomoku.legalMoves(s).some((m) => m.x === 7 && m.y === 7));
  // 다른 자리는 문제없다
  assert.ok(gomoku.apply(s, { x: 12, y: 12 }));
  // 백 차례에 같은 모양은 제한이 없다
  const w = pos('renju', [[0, 0], [14, 0]], [[5, 7], [6, 7], [7, 5], [7, 6]], 1);
  assert.ok(gomoku.apply(w, { x: 7, y: 7 }));
  assert.equal(gomoku.reject(w, { x: 7, y: 7 }), null);
});

test('renju: a three that is blocked is not a three (single open three is allowed)', () => {
  // 가로 5,6,7 은 양쪽이 막혀 있다(백 (4,7), (8,7))
  const s = pos('renju', [[5, 7], [6, 7], [7, 5], [7, 6]], [[4, 7], [8, 7]]);
  assert.equal(why(s, 7, 7), null);
  assert.ok(gomoku.apply(s, { x: 7, y: 7 }));
});

test('renju: black 4-4 is refused', () => {
  const s = pos('renju', [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]);
  assert.equal(why(s, 7, 7), '4-4');
  assert.equal(gomoku.apply(s, { x: 7, y: 7 }), null);
  const w = pos('renju', [], [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]], 1);
  assert.ok(gomoku.apply(w, { x: 7, y: 7 }));
});

test('renju: one four plus one open three (4-3) is allowed', () => {
  const s = pos('renju', [[4, 7], [5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.equal(why(s, 7, 7), null);
  assert.ok(gomoku.apply(s, { x: 7, y: 7 }));
});

test('renju: black overline (6+) is refused, exactly five wins, white six also wins', () => {
  const six = pos('renju', [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]]);
  assert.equal(why(six, 6, 7), 'overline');
  assert.equal(gomoku.apply(six, { x: 6, y: 7 }), null);
  const five = pos('renju', [[3, 7], [4, 7], [5, 7], [6, 7]]);
  const won = gomoku.apply(five, { x: 7, y: 7 });
  assert.equal(won.winner, 0);
  // 흑 5목은 금수 판정보다 먼저: 같은 수가 3-3 모양이어도 5목이면 이긴다
  const fiveAnd33 = pos('renju', [[3, 7], [4, 7], [5, 7], [6, 7], [7, 5], [7, 6], [8, 5], [9, 5]]);
  assert.equal(gomoku.apply(fiveAnd33, { x: 7, y: 7 }).winner, 0);
  const wsix = pos('renju', [[0, 0]], [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]], 1);
  assert.equal(gomoku.apply(wsix, { x: 6, y: 7 }).winner, 1);
});

test('renju: state carries the rule through the moves', () => {
  let s = gomoku.init({ rule: 'renju' });
  s = gomoku.apply(s, { x: 7, y: 7 });
  assert.equal(s.rule, 'renju');
  assert.equal(s.turn, 1);
});
