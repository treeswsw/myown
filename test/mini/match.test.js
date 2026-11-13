// 미니게임 승부 방식(단판/3판 2선승/5판 3선승)·종목 방식(고정/랜덤/순서대로)·오목 규칙 선택 (방 단위, 가짜 시계).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_IDS } from '../../shared/mini/index.js';
import { SETTINGS, OWN } from '../../shared/mini/settings.js';
import { BETWEEN_MS, MAX_DRAWS } from '../../server/mini/room.js';
import { pair, c4Win, c4Draw, gomokuWin, mnMsg, lastErr, GRACE } from './lib.js';

test('settings: kind/game/games/rule/len are validated, host only, and shown in wait.set', async () => {
  const r = await pair();
  const set = r.a.state.wait.set;
  assert.deepEqual(set, { game: 'gomoku', kind: 'fixed', games: GAME_IDS, rule: 'free', len: 1 });
  assert.deepEqual(r.a.state.wait.own, { ann1: { bet: 0 }, bob1: { bet: 0 } });
  await r.b.send({ t: 'set', patch: { len: 3 } });
  assert.equal(lastErr(r.b).code, 'mn_host');
  for (const [patch, code] of [
    [{ kind: 'x' }, 'mn_kind'], [{ games: [] }, 'mn_games'], [{ games: ['nope'] }, 'mn_games'], [{ games: ['chess', 'chess'] }, 'mn_games'],
    [{ games: 'chess' }, 'mn_games'], [{ rule: 'x' }, 'mn_rule'], [{ len: 2 }, 'mn_len'], [{ len: '3' }, 'mn_len'], [{ other: 1 }, 'mn_bad'], [{}, 'mn_bad'],
    [{ len: 3, kind: 'x' }, 'mn_kind'],
  ]) {
    await r.a.send({ t: 'set', patch });
    assert.equal(lastErr(r.a).code, code, JSON.stringify(patch));
  }
  assert.equal(r.a.state.wait.set.len, 1, '거절된 묶음은 하나도 적용되지 않는다 (len 3 + 나쁜 kind)');
  await r.a.send({ t: 'set', patch: { len: 5, kind: 'order', games: ['connect4', 'gomoku'], rule: 'renju' } });
  assert.deepEqual(r.b.state.wait.set, { game: 'gomoku', kind: 'order', games: ['gomoku', 'connect4'], rule: 'renju', len: 5 });
});

test('settings schema: fields show/hide by kind and by whether gomoku is played', () => {
  const field = (k) => SETTINGS.find((f) => f.k === k);
  assert.equal(field('game').when({ kind: 'fixed' }), true);
  assert.equal(field('game').when({ kind: 'random' }), false);
  assert.equal(field('games').when({ kind: 'fixed' }), false);
  assert.equal(field('games').when({ kind: 'order' }), true);
  assert.equal(field('rule').when({ kind: 'fixed', game: 'gomoku' }), true);
  assert.equal(field('rule').when({ kind: 'fixed', game: 'chess' }), false);
  assert.equal(field('rule').when({ kind: 'random', games: ['chess', 'gomoku'] }), true);
  assert.equal(field('rule').when({ kind: 'random', games: ['chess', 'connect4'] }), false);
  assert.deepEqual(field('len').opts.map((o) => o[0]), [1, 3, 5]);
  assert.deepEqual(OWN.map((f) => [f.k, f.part]), [['bet', 'mn-bet']]);
});

test('random/order need at least two games before the match can start', async () => {
  const r = await pair({ set: { kind: 'random', games: ['chess'] } });
  assert.equal(r.a.state.wait.can, false);
  assert.equal(r.a.state.wait.why.code, 'mn_games');
  await r.a.send({ t: 'start' });
  assert.equal(lastErr(r.a).code, 'mn_games');
  await r.a.send({ t: 'set', patch: { games: ['chess', 'reversi'] } });
  assert.equal(r.a.state.wait.can, true);
  await r.a.send({ t: 'set', patch: { kind: 'fixed' } });
  await r.a.send({ t: 'set', patch: { games: ['chess'] } }); // 한 종목 고정이면 1개여도 된다
  assert.equal(r.a.state.wait.can, true);
});

test('single game stays as before: result right after the game, then the waiting room', async () => {
  const r = await pair({ game: 'connect4' });
  await r.a.send({ t: 'start' });
  assert.equal(r.a.state.match.len, 1);
  await c4Win(r);
  assert.equal(r.a.state.phase, 'end');
  assert.deepEqual(r.a.state.result, { winner: 0, reason: 'win' });
  assert.equal(r.a.state.wait.can, true);
});

test('best of 3: between games, seats swap (the first move alternates), the second win ends the match', async () => {
  const r = await pair({ game: 'connect4', set: { len: 3 } });
  await r.a.send({ t: 'start' });
  assert.equal(r.a.state.match.len, 3);
  assert.equal(r.a.state.match.round, 1);
  const p0 = r.a.state.seats[0];
  const p1 = r.a.state.seats[1];
  await c4Win(r); // p0 이 1승
  assert.equal(r.a.state.phase, 'between');
  assert.equal(r.a.state.result, null, '매치가 끝나야 결과');
  assert.equal(r.a.state.wait, null, '판 사이에는 대기실로 가지 않는다');
  assert.deepEqual(r.a.state.match.score, [1, 0]);
  assert.deepEqual(r.a.state.match.last, { winner: 0, game: 'connect4' });
  assert.equal(r.a.state.match.next > 0, true);
  await mnMsg(r.by(1), { a: 'move', move: { x: 3 } });
  assert.equal(lastErr(r.by(1)).code, 'mn_now');
  await r.a.send({ t: 'set', patch: { len: 1 } });
  assert.ok(lastErr(r.a).code.startsWith('mn_'), '판 사이에는 설정을 못 바꾼다');
  r.clock.advance(BETWEEN_MS - 1);
  assert.equal(r.a.state.phase, 'between');
  r.clock.advance(1);
  assert.equal(r.a.state.phase, 'play');
  assert.equal(r.a.state.match.round, 2);
  assert.deepEqual(r.a.state.seats, [p1, p0], '선이 번갈아 바뀐다');
  assert.deepEqual(r.a.state.match.score, [0, 1], '점수는 자리 순서대로');
  assert.equal(r.a.state.mn.board[5].every((c) => c === null), true, '새 판');
  await c4Win(r); // 이번엔 p1(seat 0)이 이겨 1:1
  assert.equal(r.a.state.phase, 'between');
  assert.deepEqual(r.a.state.match.score, [1, 1]);
  r.clock.advance(BETWEEN_MS);
  assert.deepEqual(r.a.state.seats, [p0, p1]);
  await c4Win(r); // p0 이 2승 -> 매치 끝
  assert.equal(r.a.state.phase, 'end');
  assert.deepEqual(r.a.state.result, { winner: 0, reason: 'win' });
  assert.deepEqual(r.a.state.match.score, [2, 1]);
  assert.equal(r.a.state.wait.can, true);
  assert.equal(r.clock.pending > 0 ? r.a.state.phase : 'end', 'end');
});

test('best of 5 needs three wins; coin win reward is paid once per match, to the match winner', async () => {
  const r = await pair({ game: 'connect4', set: { len: 5 } });
  await r.a.send({ t: 'start' });
  const win = async () => { await c4Win(r); if (r.a.state.phase === 'between') r.clock.advance(BETWEEN_MS); };
  const winner = r.a.state.seats[0];
  await win(); // 승자 p0:1
  await win(); // 이번엔 상대가 선 -> 상대:1
  await win(); // p0:2
  await win(); // 상대:2
  assert.equal(r.a.state.phase, 'play');
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 0, '매치 중에는 아직 코인이 없다');
  await win(); // p0:3 -> 끝
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.a.state.seats[r.a.state.result.winner], winner);
  assert.equal(r.coinsOf(winner), 1);
  assert.equal(r.coinsOf(winner === 'ann1' ? 'bob1' : 'ann1'), 0);
});

test('a drawn game is not counted and is played again; a single game ends in a draw', async () => {
  const one = await pair({ game: 'connect4' });
  await one.a.send({ t: 'start' });
  await c4Draw(one);
  assert.equal(one.a.state.phase, 'end');
  assert.deepEqual(one.a.state.result, { winner: 'draw', reason: 'draw' });

  const r = await pair({ game: 'connect4', set: { len: 3 } });
  await r.a.send({ t: 'start' });
  await c4Draw(r);
  assert.equal(r.a.state.phase, 'between');
  assert.deepEqual(r.a.state.match.score, [0, 0]);
  assert.deepEqual(r.a.state.match.last, { winner: 'draw', game: 'connect4' });
  assert.equal(r.a.state.match.draws, 1);
  r.clock.advance(BETWEEN_MS);
  assert.equal(r.a.state.phase, 'play');
  assert.equal(r.a.state.match.round, 2, '무승부 판도 다시 하는 판 번호는 올라간다');
  await c4Win(r);
  assert.deepEqual(r.a.state.match.score, [1, 0]);
  assert.equal(r.a.state.phase, 'between');
});

test('too many drawn games end the match as a draw', async () => {
  const r = await pair({ game: 'connect4', set: { len: 3 } });
  await r.a.send({ t: 'start' });
  for (let i = 0; i < MAX_DRAWS; i++) {
    assert.equal(r.a.state.phase, 'play');
    await c4Draw(r);
    if (r.a.state.phase === 'between') r.clock.advance(BETWEEN_MS);
  }
  assert.equal(r.a.state.phase, 'end');
  assert.deepEqual(r.a.state.result, { winner: 'draw', reason: 'draw' });
});

test('resign between games or during a game ends the whole match (the other side wins)', async () => {
  const r = await pair({ game: 'connect4', set: { len: 3 } });
  await r.a.send({ t: 'start' });
  await c4Win(r);
  const loser = r.a.state.seats[1];
  const winnerSeat = r.a.state.seats.indexOf(r.a.state.seats[0]);
  assert.equal(r.a.state.phase, 'between');
  await mnMsg(r.by(1), { a: 'resign' });
  assert.equal(r.a.state.phase, 'end');
  assert.deepEqual(r.a.state.result, { winner: winnerSeat, reason: 'resign' });
  assert.equal(r.a.state.seats[1], loser);
  r.clock.advance(BETWEEN_MS * 2);
  assert.equal(r.a.state.phase, 'end', '남은 타이머가 새 판을 시작하지 않는다');
  assert.equal(r.coinsOf('ann1') + r.coinsOf('bob1'), 0, '기권 승은 승리 코인이 없다');
});

test('leaving or a 60 s disconnect during a match forfeits it, also between games', async () => {
  const r = await pair({ game: 'connect4', set: { len: 3 } });
  await r.a.send({ t: 'start' });
  await c4Win(r);
  const leaver = r.by(1);
  const stayer = r.by(0);
  leaver.conn.close();
  r.clock.advance(GRACE + 1000);
  assert.equal(stayer.state.phase, 'end');
  assert.equal(stayer.state.result.reason, 'leave');
  assert.equal(stayer.state.result.winner, stayer.state.mySeat);
});

test('order: games follow the chosen list each game', async () => {
  const r = await pair({ set: { kind: 'order', games: ['gomoku', 'connect4'], len: 5 } });
  await r.a.send({ t: 'start' });
  assert.equal(r.a.state.game, 'gomoku');
  await gomokuWin(r);
  r.clock.advance(BETWEEN_MS);
  assert.equal(r.a.state.game, 'connect4');
  await c4Win(r);
  r.clock.advance(BETWEEN_MS);
  assert.equal(r.a.state.game, 'gomoku', '목록을 다 돌면 처음부터');

});

test('random: every game comes from the chosen list (seeded rng, many games)', async () => {
  const picked = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const r = await pair({ seed, set: { kind: 'random', games: ['connect4', 'gomoku'], len: 3 } });
    await r.a.send({ t: 'start' });
    picked.add(r.a.state.game);
  }
  assert.ok([...picked].every((g) => ['connect4', 'gomoku'].includes(g)));
  assert.equal(picked.size, 2, '여러 방에서 두 종목이 다 나온다');
});

test('renju over the wire: a forbidden 3-3 is refused with the reason, free rule allows it', async () => {
  for (const [rule, ok] of [['renju', false], ['free', true]]) {
    const r = await pair({ game: 'gomoku', set: { rule } });
    await r.a.send({ t: 'start' });
    assert.equal(r.a.state.mn.rule, rule);
    const black = [[5, 7], [6, 7], [7, 5], [7, 6]];
    const white = [[0, 0], [0, 2], [0, 4], [0, 6]];
    for (let i = 0; i < 4; i++) {
      await mnMsg(r.by(0), { a: 'move', move: { x: black[i][0], y: black[i][1] } });
      await mnMsg(r.by(1), { a: 'move', move: { x: white[i][0], y: white[i][1] } });
    }
    await mnMsg(r.by(0), { a: 'move', move: { x: 7, y: 7 } });
    if (ok) {
      assert.equal(r.a.state.mn.board[7][7], 0);
    } else {
      const e = lastErr(r.by(0));
      assert.equal(e.code, 'mn_forbid');
      assert.match(e.msg, /3-3/);
      assert.equal(r.a.state.mn.board[7][7], null);
      assert.equal(r.a.state.mn.turn, 0, '거절되어도 차례는 그대로');
      await mnMsg(r.by(0), { a: 'move', move: { x: 12, y: 12 } });
      assert.equal(r.a.state.mn.board[12][12], 0);
    }
  }
});

test('new players joining mid-match only watch; the pair stays the same', async () => {
  const r = await pair({ game: 'connect4', set: { len: 3 } });
  const { client } = await import('../helpers.js');
  const c = client(r.hub);
  await c.send({ t: 'login', id: 'cat1' });
  await c.send({ t: 'join', code: r.a.state.code });
  await r.a.send({ t: 'start' });
  await c4Win(r);
  assert.equal(c.state.phase, 'between');
  assert.equal(c.state.mySeat, -1);
  assert.equal(c.state.players.find((p) => p.id === 'cat1').spectating, true);
  r.clock.advance(BETWEEN_MS);
  assert.equal(c.state.phase, 'play');
});
