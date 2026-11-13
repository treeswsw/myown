// SPEC 21 (2026-11-13 사용자 요청): 관리자 계정은 공개 랭킹(라이어 전체 랭킹)에 나오지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, RANK_EXCLUDED_ID } from '../../server/store.js';
import { ADMIN_ID } from '../../server/admin/bots.js';

test('admin id used by the ranking filter matches the admin login id', () => {
  assert.equal(RANK_EXCLUDED_ID, ADMIN_ID);
});

test('memory store: the admin never appears in topLiar and has no rank; others rank as if absent', async () => {
  const store = createStore();
  await store.init();
  const put = async (id, score, games) => {
    const u = await store.getOrCreate(id, id);
    u.stats.liar = { score, games };
    await store.save(u);
  };
  await put(ADMIN_ID, 100, 1);
  await put('a1', 50, 1);
  await put('b2', 10, 1);
  const top = await store.topLiar(20);
  assert.deepEqual(top.map((r) => r.name), ['a1', 'b2']);
  assert.equal((await store.liarRank('a1')).rank, 1);
  assert.equal((await store.liarRank(ADMIN_ID)).rank, null);
});
