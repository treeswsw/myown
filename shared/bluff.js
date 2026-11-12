import { shuffle, secureRng } from './cards.js';

export const HAND_SIZE = 5;
const CHAMBERS = 6;
const TABLE_RANKS = ['A', 'K', 'Q'];

const fail = (error) => ({ ok: false, error });

function newDeck() {
  const deck = [];
  for (const r of TABLE_RANKS) for (let i = 0; i < 6; i++) deck.push(r);
  deck.push('J', 'J'); // J = joker
  return deck;
}

function nextAlive(game, from, skip = -1) {
  const n = game.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (j !== skip && game.players[j].alive) return j;
  }
  return -1;
}

function dealRound(game, starter, rng) {
  const deck = shuffle(newDeck(), rng);
  for (const p of game.players) p.hand = p.alive ? deck.splice(0, HAND_SIZE) : [];
  game.tableRank = TABLE_RANKS[Math.floor(rng() * TABLE_RANKS.length)];
  game.round++;
  game.pile = null;
  game.turn = starter;
  return { k: 'bluffDeal', round: game.round, tableRank: game.tableRank, turn: game.players[starter].id };
}

// ids: 2..4 player ids in seat order. Each player's bullet chamber is chosen here and never leaves the server.
export function createGame(ids, rng = secureRng) {
  const game = {
    players: ids.map((id) => ({
      id, hand: [], alive: true, shots: 0, bullet: Math.floor(rng() * CHAMBERS),
    })),
    tableRank: null, round: 0, turn: 0, pile: null, reveal: null,
    phase: 'playing', winner: null, next: 0, rng,
  };
  const events = [dealRound(game, Math.floor(rng() * ids.length), rng)];
  return { game, events };
}

// Who answers next after `from` acted: the next survivor holding cards (never the pile's owner).
// If nobody else holds cards, the next survivor gets the turn with no hand and must call LIAR.
function passTurn(game, from) {
  const n = game.players.length;
  const owner = game.pile ? game.players.findIndex((p) => p.id === game.pile.by) : -1;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    const p = game.players[j];
    if (j !== owner && p.alive && p.hand.length > 0) {
      game.turn = j;
      return;
    }
  }
  game.turn = nextAlive(game, from, owner);
}

function current(game) {
  return game.players[game.turn];
}

export function play(game, id, indices) {
  if (game.phase !== 'playing') return fail('진행 중인 게임이 없습니다.');
  const me = current(game);
  if (me.id !== id) return fail('내 차례가 아닙니다.');
  if (!Array.isArray(indices) || indices.length < 1 || indices.length > 3) return fail('카드를 1~3장 선택하세요.');
  const unique = new Set(indices);
  if (unique.size !== indices.length || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= me.hand.length)) {
    return fail('잘못된 카드 선택입니다.');
  }
  const cards = indices.map((i) => me.hand[i]);
  me.hand = me.hand.filter((_, i) => !unique.has(i));
  game.pile = { by: id, cards };
  game.reveal = null;
  passTurn(game, game.turn);
  return { ok: true, events: [{ k: 'bluffPlay', id, count: cards.length }] };
}

export function liar(game, id) {
  if (game.phase !== 'playing') return fail('진행 중인 게임이 없습니다.');
  const caller = current(game);
  if (caller.id !== id) return fail('내 차례가 아닙니다.');
  if (!game.pile) return fail('지목할 카드가 없습니다.');
  const { by, cards } = game.pile;
  const lie = cards.some((c) => c !== game.tableRank && c !== 'J');
  const loserIdx = game.players.findIndex((p) => p.id === (lie ? by : id));
  const loser = game.players[loserIdx];
  loser.shots++;
  const dead = loser.shots - 1 === loser.bullet;
  if (dead) {
    loser.alive = false;
    loser.hand = [];
  }
  game.reveal = { by, caller: id, cards: [...cards], lie, loser: loser.id, dead, shots: loser.shots };
  const events = [
    { k: 'liar', caller: id, by },
    { k: 'reveal', ...game.reveal },
    { k: 'shot', id: loser.id, dead, shots: loser.shots },
  ];
  game.pile = null;
  game.turn = -1;
  // The server pauses here ('reveal') so the penalty can be shown; nextRound() continues.
  game.phase = 'reveal';
  game.next = loserIdx;
  declareWinner(game, events);
  return { ok: true, events };
}

function declareWinner(game, events) {
  const alive = game.players.filter((p) => p.alive);
  if (alive.length > 1) return false;
  game.phase = 'done';
  game.winner = alive[0].id;
  game.pile = null;
  game.turn = -1;
  events.push({ k: 'bluffWin', id: alive[0].id });
  return true;
}

function starterFrom(game, idx) {
  return game.players[idx].alive ? idx : nextAlive(game, idx);
}

// Deals the next round after a penalty (the penalised survivor starts, else the next survivor).
export function nextRound(game) {
  if (game.phase !== 'reveal') return { ok: true, events: [] };
  game.phase = 'playing';
  return { ok: true, events: [dealRound(game, starterFrom(game, game.next), game.rng)] };
}

// A player who leaves is eliminated; during play the round restarts so no turn is left dangling.
export function removePlayer(game, id) {
  const idx = game.players.findIndex((p) => p.id === id);
  if (game.phase === 'done' || idx < 0 || !game.players[idx].alive) return { ok: true, events: [] };
  game.players[idx].alive = false;
  game.players[idx].hand = [];
  const events = [];
  if (!declareWinner(game, events) && game.phase === 'playing') {
    game.reveal = null;
    events.push(dealRound(game, starterFrom(game, idx), game.rng));
  }
  return { ok: true, events };
}

export function timeoutAction(game) {
  return current(game).hand.length > 0 ? { t: 'play', cards: [0] } : { t: 'liar' };
}
