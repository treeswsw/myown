import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { runHoldem, stopAll, readAccounts } from './play.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

for (const n of [2, 3, 6]) {
  test(`holdem: ${n} bots play 50 hands`, { timeout: 240000 }, async () => {
    const HANDS = 50;
    const { bots, hands } = await runHoldem(server, n, HANDS);
    assert.ok(hands >= HANDS);

    // no errors for legal moves
    for (const b of bots) assert.deepEqual(b.errors, [], `bot ${b.id} got errors: ${JSON.stringify(b.errors)}`);

    const host = bots[0];
    // every hand produced a result with winners whose amounts sum to the pot
    const wins = host.messages.filter((m) => m.t === 'event' && m.e.k === 'win');
    for (const w of wins) {
      assert.ok(w.e.winners.length >= 1);
      const sum = w.e.winners.reduce((a, x) => a + x.amount, 0);
      assert.equal(sum, w.e.pot, 'winner amounts must sum to the pot');
    }
    const deals = host.messages.filter((m) => m.t === 'event' && m.e.k === 'deal').length;
    assert.ok(deals >= wins.length, 'a deal precedes each win');

    // per-state sanity: stacks non-negative integers, board <= 5
    for (const s of host.stateHistory) {
      for (const p of s.players) if (s.mode === 'holdem') {
        assert.ok(Number.isInteger(p.stack) && p.stack >= 0, `bad stack ${p.stack}`);
      }
      assert.ok(s.board.length <= 5);
    }

    // result phase: chips conserved (stacks + banks = initial + refills*10000)
    const ids = bots.map((b) => b.id);
    await stopAll(bots);
    await new Promise((r) => setTimeout(r, 300));
    const acc = await readAccounts(server, ids);
    let total = 0;
    let refills = 0;
    for (const id of ids) {
      total += acc[id].bank;
      refills += acc[id].stats.refills;
      assert.ok(acc[id].stats.hands >= 1, 'hands stat');
    }
    assert.equal(total, ids.length * 10000 + refills * 10000, `chips not conserved: total=${total} refills=${refills}`);
    const winsStat = ids.reduce((a, id) => a + acc[id].stats.wins, 0);
    assert.ok(winsStat >= HANDS, `wins stat ${winsStat}`);
    assert.ok(server.alive());
  });
}
