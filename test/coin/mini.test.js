// 미니게임 코인(이긴 사람만 1코인, 기권·나가기·무승부는 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { hookRoom } from '../../server/coin/hooks.js';
import { coinsFor } from '../../shared/coin/rules.js';

function fake() {
  const calls = [];
  const hub = { award: (room, mode, rows) => calls.push({ mode, rows }) };
  const room = { mode: 'mini', seats: ['a', 'b'], phase: 'play', finish(w, r) { this.phase = 'end'; this.result = { winner: w, reason: r }; } };
  hookRoom(hub, room);
  return { room, calls };
}

test('mini: board win pays the winner 1 coin', () => {
  const { room, calls } = fake();
  room.finish(1, 'win');
  assert.equal(room.phase, 'end');
  assert.deepEqual(calls, [{ mode: 'mini', rows: [{ id: 'b', won: true, opp: 1 }] }]);
  assert.equal(coinsFor('mini', { won: true, opp: 1 }), 1);
  assert.equal(coinsFor('mini', { won: false, opp: 1 }), 0);
});

test('mini: resign, leave and draw pay nothing', () => {
  const { room, calls } = fake();
  room.finish(0, 'resign');
  room.finish(0, 'leave');
  room.finish('draw', 'draw');
  assert.equal(calls.length, 0);
});
