// 코인 정산 표 시험: 등록표(shared/games.js)를 돌며 코인 있는 게임마다
// 한 번 지급 · 동점 · 지급 간격(gapMs) · 돌려주는 gain(0 포함) · 봇 방을 덮는다. 판 끝 finish 중복 방지(Shell.finish)는 test/room/shell.test.js.
// 게임별 실제 판(블러핑·요트·갱식마인드·라이어 지급, 혼자 남은 판·무효 판)은 award.test.js, 미니는 mini.test.js, 갱스껄 혼자 남은 판은 test/gsk/room.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub } from '../lib/hub.js';
import { GAMES } from '../../shared/games.js';
import { COIN_RULES, payouts } from '../../shared/coin/rules.js';

const withCoin = Object.entries(GAMES).filter(([, g]) => g.coin);

async function table(mode) {
  const h = makeHub();
  const a = await h.login('ann1');
  const b = await h.login('bob1');
  const c = await h.login('cat1');
  await a.send({ t: 'create', mode, ...(mode === 'mini' ? { game: 'connect4' } : {}) });
  const room = [...h.hub.rooms.values()][0];
  return { ...h, a, b, c, room, coins: (id) => h.hub.sessions.get(id).user.coins };
}

test('등록표의 coin 키는 모두 COIN_RULES 에 있고 홀덤만 코인이 없다', () => {
  for (const [id, g] of Object.entries(GAMES)) {
    if (id === 'holdem') assert.equal(g.coin, null);
    else assert.ok(Object.hasOwn(COIN_RULES, g.coin), `${id}.coin`);
  }
});

for (const [id, g] of withCoin) {
  const r = COIN_RULES[g.coin];

  test(`${id}: 끝까지 한 사람 finish, 이긴 사람(차등이면 등수별) 더 받고, 지급은 사람마다 한 번`, async () => {
    const t = await table(id);
    const rows = [{ id: 'ann1', rank: 1, won: true, opp: 2 }, { id: 'bob1', rank: 2, won: false, opp: 2 }, { id: 'cat1', rank: 3, won: false, opp: 2 }];
    const gain = t.hub.award(t.room, g.coin, rows);
    const top = r.finish + r.win * 2;
    const mid = r.graded ? payouts(g.coin, rows).bob1 : r.finish;
    assert.equal(t.coins('ann1'), top);
    assert.equal(t.coins('bob1'), mid);
    assert.equal(t.hub.sessions.get('ann1').user.coinsTotal, top);
    assert.deepEqual(gain, { ann1: top, bob1: mid, cat1: r.finish }, '못 이긴 사람도 gain 에 있다');
  });

  test(`${id}: 동점 1등은 둘 다 보너스를 온전히 받는다`, async () => {
    const t = await table(id);
    t.hub.award(t.room, g.coin, [{ id: 'ann1', rank: 1, won: true, opp: 2 }, { id: 'bob1', rank: 1, won: true, opp: 2 }, { id: 'cat1', rank: 3, won: false, opp: 2 }]);
    assert.equal(t.coins('ann1'), r.finish + r.win * 2);
    assert.equal(t.coins('bob1'), r.finish + r.win * 2);
    assert.equal(t.coins('cat1'), r.finish);
  });

  test(`${id}: 지급 간격 gapMs(${r.gapMs}ms) 안에는 못 받고(gain 0), 간격이 지나면 다시 받는다`, async () => {
    const t = await table(id);
    const rows = [{ id: 'ann1', rank: 1, won: true, opp: 1 }];
    const pay = r.finish + r.win;
    t.hub.award(t.room, g.coin, rows);
    assert.equal(t.coins('ann1'), pay);
    await t.tick(r.gapMs - 1);
    assert.deepEqual(t.hub.award(t.room, g.coin, rows), { ann1: 0 });
    assert.equal(t.coins('ann1'), pay, '간격 안: 그대로');
    await t.tick(1);
    t.hub.award(t.room, g.coin, rows);
    assert.equal(t.coins('ann1'), pay * 2, '간격 끝: 다시 지급');
    // 다른 게임 표는 따로 센다
    const other = Object.keys(COIN_RULES).find((k) => k !== g.coin);
    t.hub.award(t.room, other, rows);
    assert.equal(t.coins('ann1'), pay * 2 + coinsOf(other, true, 1));
  });

  test(`${id}: 봇이 있는 방·사람이 아닌 아이디·빈 줄은 아무도 못 받는다`, async () => {
    const t = await table(id);
    t.hub.award(t.room, g.coin, []);
    t.hub.award(t.room, g.coin, [{ id: 'ghost', won: true, opp: 1 }]);
    t.hub.award(null, g.coin, [{ id: 'ann1', won: true, opp: 1 }]);
    assert.equal(t.coins('ann1'), 0);
    t.room.members.push({ id: '~bot1', session: { bot: true } });
    t.hub.award(t.room, g.coin, [{ id: 'ann1', won: true, opp: 1 }]);
    assert.equal(t.coins('ann1'), 0, '봇 방');
  });
}

function coinsOf(mode, won, opp) {
  const r = COIN_RULES[mode];
  return r.finish + (won ? r.win * opp : 0);
}

test('코인 0 인 판도 gain 에 0 으로: 미니 기권·무승부(opp 없음)', async () => {
  const t = await table('mini');
  assert.deepEqual(t.hub.award(t.room, 'mini', [{ id: 'ann1', won: false }]), { ann1: 0 });
  assert.equal(t.coins('ann1'), 0);
});

test('미니 진 사람도 완주 1코인, 이긴 사람 3코인', async () => {
  const t = await table('mini');
  assert.deepEqual(t.hub.award(t.room, 'mini', [{ id: 'ann1', rank: 1, won: true, opp: 1 }, { id: 'bob1', rank: 2, won: false, opp: 1 }]), { ann1: 3, bob1: 1 });
});

test('홀덤(코인 없음)은 지급이 없다', async () => {
  const t = await table('holdem');
  assert.deepEqual(t.hub.award(t.room, 'holdem', [{ id: 'ann1', won: true, opp: 3 }]), {});
  assert.equal(t.coins('ann1'), 0);
});
