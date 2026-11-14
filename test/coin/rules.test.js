import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN_RULES, payouts } from '../../shared/coin/rules.js';

// 한 판의 줄: rank 순으로 인원 n명 (동점은 ranks 로 직접)
const rowsOf = (ranks, winnerRank = 1) => ranks.map((rank, i) => ({ id: `p${i}`, rank, won: rank === winnerRank, opp: ranks.length - 1 }));
const list = (mode, ranks, scale) => Object.values(payouts(mode, rowsOf(ranks), COIN_RULES, scale));

test('차등 지급 표 (요트 10/5, 갱식마인드 10/2)', () => {
  assert.deepEqual(list('yacht', [1, 2, 3, 4]), [25, 17, 12, 10]);
  assert.deepEqual(list('yacht', [1, 2, 3]), [20, 13, 10]);
  assert.deepEqual(list('yacht', [1, 2]), [15, 10]);
  assert.deepEqual(list('draw', [1, 2, 3, 4, 5]), [18, 15, 12, 11, 10]);
});

test('차등 지급: 동점은 같은 코인, 나간 사람(줄 없음)은 아래로 센다', () => {
  assert.deepEqual(list('yacht', [1, 2, 2, 4]), [25, 12, 12, 10]);
  assert.deepEqual(list('yacht', [1, 1, 3, 4]), [25, 25, 12, 10]);
  const rows = rowsOf([1, 2, 3, 4]).slice(0, 3); // 4명으로 시작해 한 명이 나감
  assert.deepEqual(Object.values(payouts('yacht', rows)), [25, 17, 12]);
  assert.deepEqual(list('yacht', [1, 2], 1), [15, 10]);
});

test('갱식마인드 완주 코인은 문제 수에 비례 (scale = 문제 수 / 8)', () => {
  const fin = (q) => list('draw', [2, 1], q / 8); // 2명: 꼴찌가 완주 코인
  assert.deepEqual([4, 8, 12, 16].map((q) => Math.min(...fin(q))), [5, 10, 15, 20]);
  assert.deepEqual(list('draw', [1, 2], 12 / 8), [15 + 2, 15]);
});

test('그 밖의 게임은 finish + (이기면 win × 상대 수)', () => {
  const p = (mode, won, opp) => payouts(mode, [{ id: 'a', rank: 1, won, opp }]).a;
  assert.equal(p('gsk', true, 3), 22);
  assert.equal(p('gsk', false, 3), 10);
  assert.equal(p('bluff', true, 3), 20);
  assert.equal(p('bluff', false, 3), 8);
  assert.equal(p('liar', true, 1), 6); // 시민 승
  assert.equal(p('liar', false, 4), 4);
  assert.equal(p('liar', true, 4), 12); // 라이어 승
  assert.equal(p('mini', true, 1), 3);
  assert.equal(p('mini', false, 1), 1);
});

test('opp 없는 줄·홀덤·모르는 mode 는 0 / 안전', () => {
  assert.deepEqual(payouts('yacht', [{ id: 'a', rank: 1, won: true }]), {});
  assert.deepEqual(payouts('holdem', [{ id: 'a', rank: 1, won: true, opp: 5 }]), {});
  assert.deepEqual(payouts('toString', [{ id: 'a', rank: 1, won: true, opp: 5 }]), {});
  assert.equal(payouts('yacht', [{ id: 'a', rank: 1, won: true, opp: 0 }]).a, 10);
  assert.equal(payouts('yacht', [{ id: 'a', rank: 1, won: true, opp: 1.5 }]).a, undefined);
  assert.deepEqual(payouts('yacht'), {});
});

test('기본값 표', () => {
  assert.deepEqual(COIN_RULES.yacht, { finish: 10, win: 5, gapMs: 240000, graded: true });
  assert.deepEqual(COIN_RULES.draw, { finish: 10, win: 2, gapMs: 120000, graded: true });
  assert.deepEqual(COIN_RULES.gsk, { finish: 10, win: 4, gapMs: 120000 });
  assert.deepEqual(COIN_RULES.bluff, { finish: 8, win: 4, gapMs: 30000 });
  assert.deepEqual(COIN_RULES.liar, { finish: 4, win: 2, gapMs: 45000 });
  assert.deepEqual(COIN_RULES.mini, { finish: 1, win: 2, gapMs: 60000 });
  assert.deepEqual(Object.keys(COIN_RULES), ['bluff', 'liar', 'draw', 'yacht', 'mini', 'gsk']);
});
