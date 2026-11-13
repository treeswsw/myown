// 가짜 상태(docs/YACHT-PLAN.md 4절 복사). 모양은 SPEC 19-3.
const E = { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, choice: null,
            fourKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yacht: null };
const P = (id, name, x = {}) => ({ id, name, connected: true, awayUntil: null, spectating: false, ...x });
const C = (id, name, scores = {}, x = {}) => ({ id, name, left: false, scores: { ...E, ...scores }, upper: 0, bonus: 0, total: 0, ...x });
const base = { code: 'ABCD', mode: 'yacht', hostId: 'me', you: 'me', now: 1_000_000, gameNo: 1, rounds: 12,
               rollNo: 0, shaking: false, waiting: null, dice: null, preview: null, pick: null, last: null, result: null };

export const lobby = { ...base, phase: 'lobby', gameNo: 0, round: 0, turn: null, rollsLeft: 0,
  players: [P('me', '민수'), P('jiwoo', '지우')], cols: [C('me', '민수'), C('jiwoo', '지우')] };

export const myTurnFresh = { ...base, phase: 'playing', round: 1, turn: 'me', rollsLeft: 3,
  players: [P('me', '민수'), P('jiwoo', '지우'), P('seoyeon', '서연', { spectating: true })],
  cols: [C('me', '민수'), C('jiwoo', '지우')] };

const DICE = [ { v: 4, slot: 0, x: -2.1, z: 1.3, yaw: 0.4 }, { v: 4, slot: 1, x: 0.5, z: -1.8, yaw: 1.9 },
               { v: 6, slot: null, x: 2.2, z: 2.0, yaw: 2.7 }, { v: 4, slot: null, x: -0.6, z: 2.9, yaw: 0.1 },
               { v: 2, slot: null, x: 3.1, z: -0.4, yaw: 5.2 } ];
const MINE = { ones: 3, twos: 4, fours: 12, sixes: 12, fourKind: 29, smallStraight: 15, largeStraight: 30 };
const THEIRS = { ones: 1, twos: 6, sixes: 18, choice: 27, fullHouse: 28, yacht: 50 };

export const myTurnRolled = { ...base, phase: 'playing', round: 7, turn: 'me', rollsLeft: 1, rollNo: 26,
  players: [P('me', '민수'), P('jiwoo', '지우')], dice: DICE,
  cols: [C('me', '민수', { ones: 3, twos: 4, fours: 12, sixes: 12, fourKind: 29, smallStraight: 15 }, { upper: 31, total: 75 }),
         C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 })],
  preview: { threes: 0, fives: 0, choice: 20, fullHouse: 0, largeStraight: 0, yacht: 0 }, pick: null,
  last: { id: 'jiwoo', cat: 'yacht', score: 50 } };

export const otherTurn = { ...myTurnRolled, turn: 'jiwoo', preview: null, pick: 'threes',
  cols: [C('me', '민수', MINE, { upper: 31, total: 105 }), C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 })],
  last: { id: 'me', cat: 'largeStraight', score: 30 } };

export const four = { ...otherTurn, turn: 'taeho', pick: null,
  players: [P('me', '민수'), P('jiwoo', '지우', { connected: false, awayUntil: 1_050_000 }), P('taeho', '태호')],
  cols: [C('me', '민수', MINE, { upper: 31, total: 105 }), C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 }),
         C('taeho', '태호', { sixes: 24, fives: 20, fours: 16, threes: 9 }, { upper: 69, bonus: 35, total: 104 }),
         C('harin', '하린', { choice: 11 }, { total: 11, left: true })] };

export const waitingTurn = { ...four, turn: 'jiwoo', waiting: 'jiwoo', pick: 'choice' };

const FULL = (o) => Object.fromEntries(Object.keys(E).map((k) => [k, o[k] ?? 0]));
export const result = { ...base, phase: 'result', round: 12, turn: null, rollsLeft: 0,
  players: [P('me', '민수'), P('jiwoo', '지우')],
  cols: [C('me', '민수', FULL(MINE), { upper: 31, total: 105 }), C('jiwoo', '지우', FULL(THEIRS), { upper: 25, total: 130 })],
  result: { reason: 'done', winners: ['jiwoo'], ranks: [{ id: 'jiwoo', name: '지우', total: 130, rank: 1 }, { id: 'me', name: '민수', total: 105, rank: 2 }] } };

// 시험용 추가
export const spectator = { ...otherTurn, you: 'seoyeon', players: [...otherTurn.players, P('seoyeon', '서연', { spectating: true })] };
export const evilName = { ...myTurnFresh, cols: [C('me', '<b>민수</b>'), C('jiwoo', '지우')] };
export const result4 = { ...result, gameNo: 2,
  players: [P('me', '민수'), P('jiwoo', '지우'), P('taeho', '태호'), P('harin', '하린')],
  cols: [C('me', '민수', FULL(MINE), { upper: 31, total: 130 }), C('jiwoo', '지우', FULL(THEIRS), { upper: 25, total: 130 }),
         C('taeho', '태호', FULL(MINE), { upper: 31, total: 99 }), C('harin', '하린', FULL(THEIRS), { upper: 25, total: 77 })],
  result: { reason: 'done', winners: ['me', 'jiwoo'], ranks: [
    { id: 'me', name: '민수', total: 130, rank: 1 }, { id: 'jiwoo', name: '지우', total: 130, rank: 1 },
    { id: 'taeho', name: '태호', total: 99, rank: 3 }, { id: 'harin', name: '하린', total: 77, rank: 4 }] } };

export const states = { lobby, myTurnFresh, myTurnRolled, otherTurn, four, waitingTurn, result, spectator, evilName, result4 };
