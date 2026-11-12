import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { runHoldem, stopAll, readAccounts } from './play.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

for (const n of [2, 3, 6]) {
  test(`holdem: ${n} bots play 50 hands (in sessions until a champion)`, { timeout: 300000 }, async () => {
    const HANDS = 50;
    const { sessions, hands } = await runHoldem(server, n, HANDS);
    assert.ok(hands >= HANDS);

    for (const sess of sessions) {
      const { bots, stateHistory: states } = sess;
      for (const b of bots) assert.deepEqual(b.errors, [], `bot ${b.id} got errors: ${JSON.stringify(b.errors)}`);
      const host = bots[0];
      const total = n * 10000;

      // every result has winners within the pot
      for (const w of host.messages.filter((m) => m.t === 'event' && m.e.k === 'win')) {
        const sum = w.e.winners.reduce((a, x) => a + x.amount, 0);
        assert.ok(sum > 0 && sum <= w.e.pot, `winner amounts ${sum} must be within pot ${w.e.pot}`);
      }

      // chips are conserved at every state: stacks + bets + pot (playing) / stacks (result) = accounts x 10,000, no refills
      const gone = new Set(); // eliminated players
      let lastResult = null;
      for (const s of states) {
        if (s.mode !== 'holdem') continue;
        const stacks = s.players.reduce((a, p) => a + p.stack, 0);
        if (s.phase === 'playing') {
          assert.equal(stacks + s.players.reduce((a, p) => a + p.bet, 0) + s.pot, total, 'chips created/destroyed during a hand');
        } else if (s.phase === 'result') {
          assert.equal(stacks, total, 'chips created/destroyed at result');
          assert.ok(s.result && s.result.winners.length >= 1);
          lastResult = s;
        }
        for (const p of s.players) {
          assert.ok(Number.isInteger(p.stack) && p.stack >= 0 && p.stack <= total, `bad stack ${p.stack}`);
          if (gone.has(p.id) && s.phase !== 'lobby') {
            assert.equal(p.stack, 0, 'eliminated player has chips');
            assert.equal(p.spectating, true, 'eliminated player is dealt in');
            assert.ok(!p.cards, 'eliminated player has cards');
            assert.ok(p.eliminated, 'eliminated flag dropped');
            if (p.id === s.you) assert.ok(!s.myCards, 'eliminated player was dealt cards');
          }
          if (p.eliminated) {
            gone.add(p.id);
            assert.equal(p.stack, 0);
          } else if (s.phase === 'result' && p.stack === 0) assert.fail('stack 0 after a hand but not eliminated');
        }
      }
      // exactly one champion when the session ended that way, and it is the only chip holder
      const champs = host.messages.filter((m) => m.t === 'event' && m.e.k === 'champion');
      assert.ok(champs.length <= 1);
      if (champs.length) {
        assert.equal(sess.champion, champs[0].e.id);
        const holders = lastResult.players.filter((p) => p.stack > 0);
        assert.deepEqual(holders.map((p) => p.id), [sess.champion]);
        assert.equal(gone.size, n - 1);
      }

      // account chips: nothing created, nothing lost, no refills; eliminated accounts at exactly 0
      const acc = await readAccounts(server, bots.map((b) => b.id));
      let sum = 0;
      for (const b of bots) {
        const a = acc[b.id];
        sum += a.bank;
        assert.equal(a.stats.refills, 0, 'refills must be 0');
        if (gone.has(b.id)) assert.equal(a.bank, 0, 'eliminated account must hold 0');
      }
      assert.equal(sum, total, `account chips not conserved: ${sum} != ${total}`);
      await stopAll(bots);
    }
    assert.ok(server.alive());
  });
}
