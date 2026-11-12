import { newDeck, shuffle, secureRng } from './cards.js';
import { evaluate, compareScores } from './handeval.js';

export const SB = 50;
export const BB = 100;

const fail = (error) => ({ ok: false, error });

function pay(seat, amount) {
  const paid = Math.min(amount, seat.stack);
  seat.stack -= paid;
  seat.bet += paid;
  seat.total += paid;
  if (seat.stack === 0) seat.allin = true;
  return paid;
}

function nextSeat(st, from, pred) {
  const n = st.seats.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (pred(st.seats[j])) return j;
  }
  return -1;
}

// players: [{id, stack}] in seat order, stack > 0. Returns { st, events }.
export function startHand(players, dealer, rng = secureRng) {
  if (players.length < 2) throw new Error('need at least 2 players');
  const seats = players.map((p) => ({
    id: p.id, stack: p.stack, bet: 0, total: 0,
    folded: false, allin: false, acted: false, cards: [],
  }));
  const n = seats.length;
  const st = {
    seats, dealer, deck: shuffle(newDeck(), rng), board: [], street: 0,
    curBet: 0, minRaise: BB, turn: -1, phase: 'betting', result: null,
  };
  const events = [{ k: 'deal', dealer: seats[dealer].id }];
  for (let r = 0; r < 2; r++) {
    for (let k = 1; k <= n; k++) seats[(dealer + k) % n].cards.push(st.deck.pop());
  }
  const sb = n === 2 ? dealer : (dealer + 1) % n;
  const bb = (sb + 1) % n;
  const sbPaid = pay(seats[sb], SB);
  const bbPaid = pay(seats[bb], BB);
  st.curBet = Math.max(sbPaid, bbPaid);
  events.push({
    k: 'blinds',
    sb: { id: seats[sb].id, amount: sbPaid },
    bb: { id: seats[bb].id, amount: bbPaid },
  });
  for (const i of [sb, bb]) if (seats[i].allin) events.push({ k: 'allin', id: seats[i].id });
  advance(st, bb, events);
  return { st, events };
}

// What the seat may do right now (independent of whose turn it is).
export function options(st, id) {
  if (st.phase !== 'betting') return null;
  const seat = st.seats.find((s) => s.id === id);
  if (!seat || seat.folded || seat.allin) return null;
  const max = seat.bet + seat.stack;
  // A seat that already acted may not raise again unless a full raise reopened the betting;
  // a short all-in raise leaves it with call/fold only.
  const canRaise = !seat.acted && max > st.curBet &&
    st.seats.some((o) => o !== seat && !o.folded && !o.allin);
  return {
    toCall: Math.min(Math.max(st.curBet - seat.bet, 0), seat.stack),
    canCheck: seat.bet >= st.curBet,
    canRaise,
    minRaiseTo: canRaise ? Math.min(st.curBet + st.minRaise, max) : 0,
    maxRaiseTo: canRaise ? max : 0,
  };
}

function raiseTo(st, seat, amount) {
  const increment = amount - st.curBet;
  pay(seat, amount - seat.bet);
  st.curBet = amount;
  if (increment >= st.minRaise) {
    st.minRaise = increment;
    for (const o of st.seats) if (o !== seat) o.acted = false;
  }
}

export function act(st, id, a, amount) {
  if (st.phase !== 'betting') return fail('진행 중인 판이 없습니다.');
  const seat = st.seats[st.turn];
  if (!seat || seat.id !== id) return fail('내 차례가 아닙니다.');
  const o = options(st, id);
  let kind = a;
  if (a === 'check') {
    if (!o.canCheck) return fail('체크할 수 없습니다. 콜 또는 폴드하세요.');
  } else if (a === 'call') {
    if (o.canCheck) return fail('콜할 금액이 없습니다.');
    pay(seat, o.toCall);
  } else if (a === 'raise') {
    if (!o.canRaise) return fail('지금은 레이즈할 수 없습니다.');
    if (!Number.isInteger(amount) || amount < o.minRaiseTo || amount > o.maxRaiseTo) {
      return fail(`레이즈 금액은 ${o.minRaiseTo}~${o.maxRaiseTo} 사이여야 합니다.`);
    }
    raiseTo(st, seat, amount);
  } else if (a === 'allin') {
    if (o.canRaise) {
      raiseTo(st, seat, o.maxRaiseTo);
      kind = 'raise';
    } else if (o.toCall > 0) {
      // Nothing more can be raised, so all-in means calling as much as possible.
      pay(seat, o.toCall);
      kind = 'call';
    } else {
      return fail('지금은 올인할 수 없습니다.');
    }
  } else if (a === 'fold') {
    seat.folded = true;
  } else {
    return fail('알 수 없는 행동입니다.');
  }
  seat.acted = true;
  const events = [{ k: 'action', id, a: kind, amount: seat.bet }];
  if (seat.allin) events.push({ k: 'allin', id });
  advance(st, st.turn, events);
  return { ok: true, events };
}

// Folds a seat out of turn (player left the room).
export function forceFold(st, id) {
  const idx = st.seats.findIndex((s) => s.id === id);
  if (st.phase !== 'betting' || idx < 0 || st.seats[idx].folded) return { ok: true, events: [] };
  st.seats[idx].folded = true;
  const events = [{ k: 'action', id, a: 'fold', amount: st.seats[idx].bet }];
  const n = st.seats.length;
  advance(st, (st.turn - 1 + n) % n, events);
  return { ok: true, events };
}

// Moves the hand forward: next actor, next street, auto run-out or settlement.
function advance(st, from, events) {
  for (;;) {
    const live = st.seats.filter((s) => !s.folded);
    if (live.length === 1) return finish(st, events, false);
    const canAct = live.filter((s) => !s.allin);
    const next = nextSeat(st, from, (s) => !s.folded && !s.allin && (!s.acted || s.bet < st.curBet));
    // A lone non-all-in player who already matches the bet has nobody to bet against.
    if (next >= 0 && !(canAct.length <= 1 && st.seats[next].bet >= st.curBet)) {
      st.turn = next;
      return;
    }
    st.turn = -1;
    for (const s of st.seats) {
      s.bet = 0;
      s.acted = false;
    }
    st.curBet = 0;
    st.minRaise = BB;
    if (st.street === 3) return finish(st, events, true);
    st.street++;
    const cards = [];
    for (let i = st.street === 1 ? 3 : 1; i > 0; i--) cards.push(st.deck.pop());
    st.board.push(...cards);
    events.push({ k: 'street', street: st.street, cards });
    from = st.dealer;
  }
}

// Exact side pots from total contributions. A level only one seat reached is an
// uncalled bet and is returned as `refund` instead of becoming a pot.
export function buildPots(seats) {
  const levels = [...new Set(seats.map((s) => s.total).filter((t) => t > 0))].sort((a, b) => a - b);
  const pots = [];
  let refund = null;
  let prev = 0;
  for (const level of levels) {
    const contributors = seats.filter((s) => s.total >= level);
    const amount = seats.reduce((sum, s) => sum + Math.min(s.total, level) - Math.min(s.total, prev), 0);
    prev = level;
    if (contributors.length === 1) {
      refund = { id: contributors[0].id, amount };
      continue;
    }
    const eligible = contributors.filter((s) => !s.folded).map((s) => s.id);
    const last = pots[pots.length - 1];
    if (last && (eligible.length === 0 || (eligible.length === last.eligible.length &&
        eligible.every((id) => last.eligible.includes(id))))) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return { pots, refund };
}

export function totalPot(st) {
  return st.seats.reduce((sum, s) => sum + s.total, 0);
}

function finish(st, events, showdown) {
  st.phase = 'done';
  st.turn = -1;
  const { pots, refund } = buildPots(st.seats);
  const byId = new Map(st.seats.map((s) => [s.id, s]));
  if (refund) byId.get(refund.id).stack += refund.amount;

  const shown = {};
  const evals = new Map();
  if (showdown) {
    for (const s of st.seats) {
      if (s.folded) continue;
      shown[s.id] = [...s.cards];
      evals.set(s.id, evaluate([...s.cards, ...st.board]));
    }
    events.push({ k: 'showdown', shown });
  }

  const n = st.seats.length;
  const fromDealerLeft = [];
  for (let k = 1; k <= n; k++) fromDealerLeft.push(st.seats[(st.dealer + k) % n].id);

  const won = new Map();
  for (const pot of pots) {
    let winners = pot.eligible;
    if (showdown && winners.length > 1) {
      const top = winners.reduce((b, id) => (compareScores(evals.get(id).score, evals.get(b).score) > 0 ? id : b));
      winners = winners.filter((id) => compareScores(evals.get(id).score, evals.get(top).score) === 0);
    }
    const ordered = fromDealerLeft.filter((id) => winners.includes(id));
    const share = Math.floor(pot.amount / ordered.length);
    const extra = pot.amount - share * ordered.length;
    ordered.forEach((id, i) => won.set(id, (won.get(id) ?? 0) + share + (i < extra ? 1 : 0)));
  }

  const winners = [];
  for (const s of st.seats) {
    const amount = won.get(s.id);
    if (!amount) continue;
    s.stack += amount;
    const ev = evals.get(s.id);
    winners.push({ id: s.id, amount, handName: ev ? ev.name : null, cards: ev ? ev.cards : [] });
  }
  st.result = {
    winners,
    shown,
    busted: st.seats.filter((s) => s.stack === 0).map((s) => s.id),
    pot: totalPot(st),
  };
}
