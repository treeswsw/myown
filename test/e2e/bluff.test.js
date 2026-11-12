import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { runBluff, stopAll, readAccounts } from './play.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

for (const [n, games] of [[2, 20], [4, 20]]) {
  test(`bluff: ${n} bots play ${games} games`, { timeout: 240000 }, async () => {
    const { bots, games: done } = await runBluff(server, n, games);
    assert.ok(done >= games);
    const host = bots[0];
    for (const b of bots) assert.deepEqual(b.errors, [], `errors for ${b.id}: ${JSON.stringify(b.errors)}`);

    // one bluffWin per game; walk the host's state history game by game
    const winEvents = host.messages.filter((m) => m.t === 'event' && m.e.k === 'bluffWin');
    assert.equal(winEvents.length, done);

    let prevShots = {};
    let games_seen = 0;
    let prevPhase = 'lobby';
    for (const s of host.stateHistory) {
      if (s.phase === 'playing' && prevPhase !== 'playing') { prevShots = {}; games_seen++; }
      prevPhase = s.phase;
      const alive = s.players.filter((p) => p.alive && !p.spectating);
      for (const p of s.players) {
        assert.ok(Number.isInteger(p.shots) && p.shots >= 0 && p.shots <= 6, `shots ${p.shots}`);
        if (s.phase !== 'lobby') {
          if (prevShots[p.id] !== undefined) assert.ok(p.shots >= prevShots[p.id], `shots decreased for ${p.id}`);
          prevShots[p.id] = p.shots;
        }
      }
      if (s.phase === 'playing') {
        assert.ok(alive.length >= 2, 'playing with <2 alive');
        if (s.turn === null) assert.ok(s.reveal, 'turn may only be null while a reveal is shown');
      }
      if (s.phase === 'playing' && s.turn) {
        const turnP = s.players.find((p) => p.id === s.turn);
        assert.ok(turnP && turnP.alive, `turn must belong to a living player: ${JSON.stringify(s).slice(0, 700)}`);
        if (turnP.handCount === 0) {
          // forced LIAR: nobody except the last player may hold cards
          assert.ok(s.lastPlay, 'empty-handed player on turn needs a lastPlay');
          const others = s.players.filter((p) => p.alive && p.id !== s.lastPlay.by && p.handCount > 0);
          assert.equal(others.length, 0, 'player with 0 cards got a turn while others still hold cards');
        }
      }
      if (s.phase === 'result') {
        assert.equal(alive.length, 1, 'exactly one survivor at game end');
        assert.equal(s.winnerId, alive[0].id);
      }
    }
    assert.ok(games_seen >= done);

    // each result: exactly one winner, and it is a participant
    const resultStates = host.stateHistory.filter((s) => s.phase === 'result');
    assert.ok(resultStates.length >= done);

    const ids = bots.map((b) => b.id);
    await stopAll(bots);
    const acc = await readAccounts(server, ids);
    const gamesStat = ids.reduce((a, id) => a + acc[id].stats.bluffGames, 0);
    const winsStat = ids.reduce((a, id) => a + acc[id].stats.bluffWins, 0);
    assert.ok(winsStat >= done, `bluffWins ${winsStat}`);
    assert.ok(gamesStat >= done * n, `bluffGames ${gamesStat}`);
  });
}
