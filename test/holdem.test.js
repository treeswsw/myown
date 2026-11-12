import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../shared/holdem.js';
import { newDeck } from '../shared/cards.js';
import { seeded } from './helpers.js';

// Starts a hand and rigs hole cards / board. `board` is dealt in order.
function rigged(stacks, hole, board, dealer = 0) {
  const { st, events } = H.startHand(stacks.map((stack, i) => ({ id: 'p' + i, stack })), dealer, seeded(1));
  const used = new Set([...Object.values(hole).flat(), ...board]);
  st.seats.forEach((s, i) => { s.cards = hole['p' + i]; });
  st.deck = [...newDeck().filter((c) => !used.has(c)), ...[...board].reverse()];
  return { st, events };
}
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

test('heads-up: dealer is small blind and acts first preflop, big blind first after', () => {
  const { st, events } = rigged([1000, 1000], { p0: ['As', 'Ad'], p1: ['2c', '3d'] }, ['7h', '8c', '9s', 'Jd', '3c'], 0);
  assert.deepEqual(events[1], { k: 'blinds', sb: { id: 'p0', amount: 50 }, bb: { id: 'p1', amount: 100 } });
  assert.equal(st.seats[st.turn].id, 'p0');
  ok(H.act(st, 'p0', 'call'));
  assert.equal(st.seats[st.turn].id, 'p1');
  ok(H.act(st, 'p1', 'check'));
  assert.equal(st.street, 1);
  assert.equal(st.seats[st.turn].id, 'p1');
});

test('three-handed: blinds left of dealer, UTG acts first', () => {
  const { st } = rigged([1000, 1000, 1000], { p0: ['As', 'Ad'], p1: ['2c', '3d'], p2: ['4c', '5d'] }, ['7h', '8c', '9s', 'Jd', '3c'], 0);
  assert.equal(st.seats[1].bet, 50);
  assert.equal(st.seats[2].bet, 100);
  assert.equal(st.seats[st.turn].id, 'p0');
});

test('min-raise follows the previous raise size', () => {
  const { st } = rigged([5000, 5000], { p0: ['As', 'Ad'], p1: ['2c', '3d'] }, ['7h', '8c', '9s', 'Jd', '3c']);
  assert.equal(H.options(st, 'p0').minRaiseTo, 200);
  assert.equal(H.act(st, 'p0', 'raise', 150).ok, false);
  assert.equal(H.act(st, 'p0', 'raise', 99999).ok, false);
  assert.equal(H.act(st, 'p0', 'raise', 200.5).ok, false);
  ok(H.act(st, 'p0', 'raise', 200));
  assert.equal(H.options(st, 'p1').minRaiseTo, 300);
  assert.equal(H.act(st, 'p1', 'raise', 250).ok, false);
  ok(H.act(st, 'p1', 'raise', 500)); // raise of 300
  assert.equal(H.options(st, 'p0').minRaiseTo, 800);
  assert.equal(H.act(st, 'p1', 'fold').ok, false, 'not your turn');
});

test('check is refused when facing a bet, call refused when nothing to call', () => {
  const { st } = rigged([5000, 5000], { p0: ['As', 'Ad'], p1: ['2c', '3d'] }, ['7h', '8c', '9s', 'Jd', '3c']);
  assert.equal(H.act(st, 'p0', 'check').ok, false);
  ok(H.act(st, 'p0', 'call'));
  assert.equal(H.act(st, 'p1', 'call').ok, false);
});

test('short all-in raise does not reopen raising for players who already acted', () => {
  const { st } = rigged([1000, 350, 1000], { p0: ['As', 'Ad'], p1: ['2c', '3d'], p2: ['4c', '5d'] }, ['7h', '8c', '9s', 'Jd', '3c']);
  ok(H.act(st, 'p0', 'raise', 300));
  const r = ok(H.act(st, 'p1', 'allin')); // 350 total, +50 only
  assert.deepEqual(r.events.map((e) => e.k), ['action', 'allin']);
  assert.equal(H.options(st, 'p2').canRaise, true);
  ok(H.act(st, 'p2', 'call'));
  assert.equal(st.seats[st.turn].id, 'p0');
  const o = H.options(st, 'p0');
  assert.equal(o.canRaise, false);
  assert.equal(o.toCall, 50);
  assert.equal(H.act(st, 'p0', 'raise', 1000).ok, false);
  ok(H.act(st, 'p0', 'call'));
  assert.equal(st.street, 1);
});

test('a raise below the minimum is allowed only as an all-in', () => {
  const { st } = rigged([5000, 220], { p0: ['As', 'Ad'], p1: ['2c', '3d'] }, ['7h', '8c', '9s', 'Jd', '3c'], 0);
  ok(H.act(st, 'p0', 'raise', 200));
  const o = H.options(st, 'p1');
  assert.equal(o.minRaiseTo, 220); // capped at the stack
  assert.equal(H.act(st, 'p1', 'raise', 210).ok, false);
  ok(H.act(st, 'p1', 'raise', 220));
  assert.equal(H.options(st, 'p0').canRaise, false);
  assert.equal(H.options(st, 'p0').toCall, 20);
});

test('exact side pots, uncalled bet refunded, ranked by hand', () => {
  const { st } = rigged([100, 300, 600], {
    p0: ['As', 'Ad'], p1: ['Ks', 'Kd'], p2: ['Qs', 'Qd'],
  }, ['2c', '5h', '7d', '9c', 'Jh'], 0);
  ok(H.act(st, 'p0', 'allin'));
  ok(H.act(st, 'p1', 'allin'));
  ok(H.act(st, 'p2', 'allin'));
  assert.equal(st.phase, 'done');
  const byId = Object.fromEntries(st.seats.map((s) => [s.id, s.stack]));
  assert.deepEqual(byId, { p0: 300, p1: 400, p2: 300 });
  assert.deepEqual(st.result.winners.map((w) => [w.id, w.amount]), [['p0', 300], ['p1', 400]]);
  assert.deepEqual(st.result.busted, []);
});

test('buildPots merges equal eligibility and drops nothing', () => {
  const seats = [
    { id: 'a', total: 100, folded: true }, { id: 'b', total: 300, folded: false },
    { id: 'c', total: 300, folded: false }, { id: 'd', total: 50, folded: false },
  ];
  const { pots, refund } = H.buildPots(seats);
  assert.deepEqual(pots, [{ amount: 200, eligible: ['b', 'c', 'd'] }, { amount: 550, eligible: ['b', 'c'] }]);
  assert.equal(refund, null);
  assert.equal(pots.reduce((s, p) => s + p.amount, 0), 750);
});

test('odd chips go to the winner closest left of the dealer', () => {
  // p0 dealer, p1 SB, p2 BB with only 25 chips (posts all-in 25).
  const { st } = rigged([1000, 1000, 25], {
    p0: ['As', 'Kd'], p1: ['4d', '5d'], p2: ['Ac', 'Kh'],
  }, ['7h', '8c', '9s', 'Jd', '3c'], 0);
  ok(H.act(st, 'p0', 'call')); // matches 50
  ok(H.act(st, 'p1', 'check'));
  while (st.phase === 'betting') ok(H.act(st, st.seats[st.turn].id, 'check'));
  const byId = Object.fromEntries(st.seats.map((s) => [s.id, s.stack]));
  // main pot 75 splits 38 (p2, first left of dealer) / 37 (p0); side pot 50 to p0.
  assert.equal(byId.p2, 38);
  assert.equal(byId.p0, 950 + 37 + 50);
  assert.equal(byId.p1, 950);
});

test('everyone all-in preflop: board is run out automatically', () => {
  const { st } = rigged([500, 500], { p0: ['As', 'Ad'], p1: ['Kc', 'Kd'] }, ['2c', '5h', '7d', '9c', 'Jh']);
  ok(H.act(st, 'p0', 'allin'));
  const r = ok(H.act(st, 'p1', 'call'));
  assert.deepEqual(r.events.map((e) => e.k), ['action', 'allin', 'street', 'street', 'street', 'showdown']);
  assert.equal(st.board.length, 5);
  assert.equal(st.result.winners[0].id, 'p0');
  assert.equal(st.result.winners[0].handName, '원페어');
  assert.deepEqual(st.result.busted, ['p1']);
});

test('call all-in for less runs out the board when only one player can still act', () => {
  const { st } = rigged([1000, 300], { p0: ['2c', '3d'], p1: ['Ac', 'Ad'] }, ['7h', '8c', '9s', 'Jd', 'Kc'], 0);
  ok(H.act(st, 'p0', 'raise', 600));
  ok(H.act(st, 'p1', 'call'));
  assert.equal(st.phase, 'done');
  assert.equal(st.board.length, 5);
  // p0's uncalled 300 is returned and is not counted as winnings.
  assert.deepEqual(st.seats.map((s) => s.stack), [700, 600]);
  assert.deepEqual(st.result.winners.map((w) => [w.id, w.amount]), [['p1', 600]]);
});

test('last player standing wins without showing cards', () => {
  const { st } = rigged([1000, 1000, 1000], { p0: ['As', 'Ad'], p1: ['2c', '3d'], p2: ['4c', '5d'] }, ['7h', '8c', '9s', 'Jd', '3c']);
  ok(H.act(st, 'p0', 'raise', 300));
  ok(H.act(st, 'p1', 'fold'));
  const r = ok(H.act(st, 'p2', 'fold'));
  assert.equal(st.phase, 'done');
  assert.ok(!r.events.some((e) => e.k === 'showdown'));
  assert.deepEqual(st.result.shown, {});
  assert.deepEqual(st.result.winners, [{ id: 'p0', amount: 250, handName: null, cards: [] }]);
  assert.equal(st.board.length, 0);
});

test('forceFold out of turn ends the hand when one player remains', () => {
  const { st } = rigged([1000, 1000], { p0: ['As', 'Ad'], p1: ['2c', '3d'] }, ['7h', '8c', '9s', 'Jd', '3c']);
  H.forceFold(st, 'p1');
  assert.equal(st.phase, 'done');
  assert.equal(st.result.winners[0].id, 'p0');
});

test('chips are conserved over thousands of random hands', () => {
  const rng = seeded(20240601);
  let hands = 0;
  let showdowns = 0;
  for (let g = 0; g < 600; g++) {
    const n = 2 + Math.floor(rng() * 5);
    const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, stack: 1 + Math.floor(rng() * rng() * 3000) }));
    const sum = players.reduce((s, p) => s + p.stack, 0);
    for (let h = 0; h < 6; h++) {
      const live = players.filter((p) => p.stack > 0);
      if (live.length < 2) break;
      const { st } = H.startHand(live.map((p) => ({ ...p })), Math.floor(rng() * live.length), rng);
      let guard = 0;
      while (st.phase === 'betting') {
        assert.ok(++guard < 200, 'hand must terminate');
        const id = st.seats[st.turn].id;
        const o = H.options(st, id);
        const roll = rng();
        let r;
        if (roll < 0.1) r = H.act(st, id, 'fold');
        else if (roll < 0.25 && o.canRaise) r = H.act(st, id, 'allin');
        else if (roll < 0.5 && o.canRaise) {
          r = H.act(st, id, 'raise', o.minRaiseTo + Math.floor(rng() * (o.maxRaiseTo - o.minRaiseTo + 1)));
        } else r = H.act(st, id, o.canCheck ? 'check' : 'call');
        assert.ok(r.ok, r.error);
      }
      hands++;
      if (Object.keys(st.result.shown).length) showdowns++;
      assert.equal(st.seats.reduce((s, x) => s + x.stack, 0), live.reduce((s, p) => s + p.stack, 0));
      assert.ok(st.seats.every((s) => s.stack >= 0));
      assert.equal(st.result.winners.reduce((s, w) => s + w.amount, 0) <= st.result.pot, true);
      for (const s of st.seats) players.find((p) => p.id === s.id).stack = s.stack;
    }
    assert.equal(players.reduce((s, p) => s + p.stack, 0), sum);
  }
  assert.ok(hands > 2000, `ran ${hands} hands`);
  assert.ok(showdowns > 300);
});
