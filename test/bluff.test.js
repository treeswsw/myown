import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../shared/bluff.js';
import { seeded } from './helpers.js';

const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const cur = (g) => g.players[g.turn];

function rig(g, hands, rank, turn = 0) {
  g.players.forEach((p, i) => { p.hand = [...hands[i]]; });
  g.tableRank = rank;
  g.turn = turn;
  g.pile = null;
}

test('deal: 20-card deck, 5 each to survivors, rank is A/K/Q', () => {
  const { game, events } = B.createGame(['a', 'b', 'c', 'd'], seeded(3));
  const all = game.players.flatMap((p) => p.hand);
  assert.equal(all.length, 20);
  assert.deepEqual(['A', 'K', 'Q', 'J'].map((r) => all.filter((c) => c === r).length), [6, 6, 6, 2]);
  assert.ok(['A', 'K', 'Q'].includes(game.tableRank));
  assert.equal(events[0].k, 'bluffDeal');
  assert.ok(game.players.every((p) => p.bullet >= 0 && p.bullet <= 5));
});

test('play validation', () => {
  const { game } = B.createGame(['a', 'b'], seeded(5));
  const other = game.players.find((p) => p !== cur(game));
  assert.equal(B.play(game, other.id, [0]).ok, false);
  assert.equal(B.play(game, cur(game).id, []).ok, false);
  assert.equal(B.play(game, cur(game).id, [0, 1, 2, 3]).ok, false);
  assert.equal(B.play(game, cur(game).id, [0, 0]).ok, false);
  assert.equal(B.play(game, cur(game).id, [5]).ok, false);
  assert.equal(B.liar(game, cur(game).id).ok, false, 'no pile at round start');
  const me = cur(game);
  ok(B.play(game, me.id, [0, 2]));
  assert.equal(me.hand.length, 3);
  assert.equal(game.pile.cards.length, 2);
  assert.notEqual(cur(game), me);
});

test('liar on a truthful play punishes the caller; jokers count as any card', () => {
  const { game } = B.createGame(['a', 'b'], seeded(5));
  rig(game, [['K', 'J', 'Q', 'Q', 'Q'], ['A', 'A', 'A', 'A', 'A']], 'K', 0);
  ok(B.play(game, 'a', [0, 1]));
  game.players[1].bullet = 5;
  const r = ok(B.liar(game, 'b'));
  assert.equal(game.reveal.lie, false);
  assert.equal(game.reveal.loser, 'b');
  assert.equal(game.players[1].shots, 1);
  assert.deepEqual(r.events.map((e) => e.k), ['liar', 'reveal', 'shot']);
  assert.equal(game.phase, 'reveal');
  assert.equal(B.play(game, 'a', [0]).ok, false, 'nobody acts during the reveal pause');
  assert.deepEqual(B.nextRound(game).events.map((e) => e.k), ['bluffDeal']);
  assert.equal(cur(game).id, 'b', 'penalised survivor starts the next round');
  assert.equal(game.players.every((p) => p.hand.length === 5), true);
});

test('liar on a lie punishes the player; first shot can kill; game ends with winner', () => {
  const { game } = B.createGame(['a', 'b'], seeded(5));
  rig(game, [['K', 'A', 'Q', 'Q', 'Q'], ['A', 'A', 'A', 'A', 'A']], 'K', 0);
  game.players[0].bullet = 0;
  ok(B.play(game, 'a', [0, 1]));
  const r = ok(B.liar(game, 'b'));
  assert.equal(game.reveal.lie, true);
  assert.equal(game.reveal.dead, true);
  assert.equal(game.phase, 'done');
  assert.equal(game.winner, 'b');
  assert.equal(r.events.at(-1).k, 'bluffWin');
  assert.equal(B.play(game, 'b', [0]).ok, false);
});

test('revolver: n-th pull kills when n-1 equals the bullet position', () => {
  const { game } = B.createGame(['a', 'b', 'c'], seeded(9));
  game.players[0].bullet = 2;
  for (let n = 1; n <= 3; n++) {
    rig(game, [['Q', 'Q', 'Q', 'Q', 'Q'], ['K', 'K', 'K', 'K', 'K'], ['K', 'K', 'K', 'K', 'K']], 'K', 0);
    ok(B.play(game, 'a', [0])); // a lies
    ok(B.liar(game, 'b'));
    B.nextRound(game);
    assert.equal(game.players[0].shots, n);
    assert.equal(game.players[0].alive, n < 3);
    assert.equal(game.reveal.dead, n === 3);
  }
  assert.equal(game.phase, 'playing');
  assert.equal(game.players.filter((p) => p.alive).length, 2);
  assert.deepEqual(game.players[0].hand, []);
  assert.notEqual(cur(game).id, 'a');
});

test('forced LIAR: when the previous player is the only one holding cards, the next survivor must call', () => {
  const { game } = B.createGame(['a', 'b', 'c'], seeded(11));
  rig(game, [['K', 'K', 'K', 'K', 'K'], [], []], 'K', 0);
  ok(B.play(game, 'a', [0, 1, 2]));
  assert.equal(cur(game).id, 'b');
  assert.equal(B.play(game, 'b', [0]).ok, false, 'no cards to play');
  game.players[1].bullet = 5;
  ok(B.liar(game, 'b'));
  assert.equal(game.reveal.lie, false);
});

test('players with empty hands are skipped while others still hold cards', () => {
  const { game } = B.createGame(['a', 'b', 'c'], seeded(11));
  rig(game, [['K', 'K'], [], ['K', 'K', 'K']], 'K', 0);
  ok(B.play(game, 'a', [0]));
  assert.equal(cur(game).id, 'c');
  ok(B.play(game, 'c', [0]));
  assert.equal(cur(game).id, 'a');
  ok(B.play(game, 'a', [0]));
  // a has no cards now; c is the only holder and b (no cards) comes after a... c may answer.
  assert.equal(cur(game).id, 'c');
});

test('timeoutAction plays the first card or calls LIAR with an empty hand', () => {
  const { game } = B.createGame(['a', 'b'], seeded(5));
  assert.deepEqual(B.timeoutAction(game), { t: 'play', cards: [0] });
  cur(game).hand = [];
  assert.deepEqual(B.timeoutAction(game), { t: 'liar' });
});

test('removePlayer eliminates and restarts the round; last survivor wins', () => {
  const { game } = B.createGame(['a', 'b', 'c'], seeded(2));
  const r = B.removePlayer(game, 'b');
  assert.equal(game.players[1].alive, false);
  assert.equal(r.events.at(-1).k, 'bluffDeal');
  assert.notEqual(cur(game).id, 'b');
  B.removePlayer(game, 'c');
  assert.equal(game.phase, 'done');
  assert.equal(game.winner, 'a');
});

test('full random games always terminate with one survivor', () => {
  const rng = seeded(77);
  for (let g = 0; g < 300; g++) {
    const n = 2 + Math.floor(rng() * 3);
    const { game } = B.createGame(Array.from({ length: n }, (_, i) => 'p' + i), rng);
    for (let step = 0; game.phase === 'playing'; step++) {
      assert.ok(step < 2000);
      const me = cur(game);
      assert.ok(me.alive);
      if (me.hand.length === 0 || (game.pile && rng() < 0.4)) {
        ok(B.liar(game, me.id));
        B.nextRound(game);
      }
      else ok(B.play(game, me.id, [0, 1, 2].slice(0, 1 + Math.floor(rng() * Math.min(3, me.hand.length)))));
    }
    assert.equal(game.players.filter((p) => p.alive).length, 1);
  }
});
