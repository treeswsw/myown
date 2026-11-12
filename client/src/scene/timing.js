// Card animation timings in ms, tuned in one place (about 1.4x the first version). The tween engine
// shortens everything uniformly under prefers-reduced-motion, so the proportions stay the same.
export const CARD_TIMING = {
  deal: 530, // one card flying to its seat
  dealRound: 196, // gap between a seat's first and second card
  dealGap: 126, // gap between seats
  flip: 630, // a card turning over (showdown reveal)
  flipGap: 168, // gap between the two cards of one hand
  board: 730, // a community card flying in and flipping
  boardGap: 210, // gap between community cards of one street
  pile: 590, // bluff card flying onto the pile
  pileGap: 126,
};
