import { randomInt } from 'node:crypto';

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export function secureRng() {
  return randomInt(2 ** 32) / 2 ** 32;
}

export function rankValue(card) {
  return RANKS.indexOf(card[0]) + 2;
}

export function newDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

// Fisher-Yates, in place. rng() must return a float in [0, 1).
export function shuffle(arr, rng = secureRng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
