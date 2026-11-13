import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtPts, secondsLeft, clockText, nameOf, initialOf, avatarColor, viewMode, pickCards, pickMessage,
  waitPickText, whyText, revealView, finalView, finalActions,
} from '../../client/src/draw/ui/result.pure.js';
import { checkDr } from '../../shared/draw/protocol.js';

const players = [
  { id: 'a', name: '강식' }, { id: 'b', name: '지호' }, { id: 'c', name: '민수' }, { id: 'd', name: '태양' },
];
const pickState = (extra = {}) => ({
  phase: 'pick', hostId: 'a', you: 'b', drawerId: 'b', players,
  choices: [{ w: '짜장면', topic: '음식' }, { w: '기린', topic: '동물' }, { w: '잠수함', topic: '탈것' }], ...extra,
});

test('점수·시간 표시', () => {
  assert.equal(fmtPts(112), '+112');
  assert.equal(fmtPts(0), '0');
  assert.equal(fmtPts(-5), '−5');
  assert.equal(fmtPts('x'), '0');
  assert.equal(secondsLeft(10500, 10000), 1);
  assert.equal(secondsLeft(9000, 10000), 0);
  assert.equal(secondsLeft(null, 1), null);
  assert.equal(clockText(7), '0:07');
  assert.equal(clockText(140), '2:20');
  assert.equal(clockText(null), '');
});

test('이름·프로필 글자·색', () => {
  assert.equal(nameOf({ players }, 'c'), '민수');
  assert.equal(nameOf({ players }, 'zz'), '?');
  assert.equal(nameOf(null, 'a'), '?');
  assert.equal(initialOf('강식'), '강');
  assert.equal(initialOf(''), '?');
  assert.equal(avatarColor('a'), avatarColor('a'));
});

test('viewMode: 누가 무엇을 보나', () => {
  assert.equal(viewMode(pickState(), 'b').kind, 'pick-drawer');
  assert.equal(viewMode(pickState(), 'a').kind, 'pick-wait');
  assert.equal(viewMode({ phase: 'draw' }, 'a').kind, 'none');
  assert.equal(viewMode({ phase: 'lobby' }, 'a').kind, 'none');
  assert.equal(viewMode({ phase: 'reveal', reveal: null }, 'a').kind, 'none');
  assert.equal(viewMode({ phase: 'reveal', reveal: {} }, 'a').kind, 'reveal');
  assert.equal(viewMode({ phase: 'final', ranking: [] }, 'a').kind, 'final');
  assert.equal(viewMode(null, 'a').kind, 'none');
});

test('★ 단어 후보는 그리는 사람의 pick 단계에서만 나온다', () => {
  const cards = pickCards(pickState(), 'b');
  assert.deepEqual(cards.map((c) => c.word), ['짜장면', '기린', '잠수함']);
  assert.deepEqual(cards.map((c) => c.topic), ['음식', '동물', '탈것']);
  // 다른 사람: 상태에 choices 가 (잘못) 들어 있어도 읽지 않는다
  assert.deepEqual(pickCards(pickState(), 'a'), []);
  assert.deepEqual(pickCards(pickState(), 'c'), []);
  assert.deepEqual(pickCards(pickState(), null), []);
  // 다른 단계
  for (const phase of ['lobby', 'draw', 'reveal', 'final']) {
    assert.deepEqual(pickCards(pickState({ phase }), 'b'), []);
  }
  assert.deepEqual(pickCards(pickState({ choices: null }), 'b'), []);
  assert.deepEqual(pickCards(null, 'b'), []);
  // 기다리는 사람에게 보여 줄 글에는 단어가 없다
  assert.ok(!waitPickText(pickState()).includes('짜장면'));
  assert.equal(waitPickText(pickState()), '지호 님이 단어를 고르는 중');
});

test('pick 요청은 protocol checkDr 를 통과한다', () => {
  for (let i = 0; i < 3; i++) {
    const m = pickMessage(i);
    assert.deepEqual(m, { t: 'dr', a: 'pick', i });
    const r = checkDr(m);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.msg, { a: 'pick', i });
  }
  assert.equal(pickMessage(3), null);
  assert.equal(pickMessage(-1), null);
  assert.equal(pickMessage(1.5), null);
  assert.equal(pickMessage('1'), null);
  assert.equal(checkDr({ a: 'pick', i: 3 }).ok, false);
});

test('끝난 이유 문구', () => {
  assert.equal(whyText('time', 0).title, '시간 끝!');
  assert.equal(whyText('time', 2).title, '시간이 끝났어요');
  assert.equal(whyText('all').title, '모두 맞혔어요!');
  for (const w of ['give', 'idle', 'skip', 'left', 'all', 'time', 'nope']) {
    const t = whyText(w, 0);
    assert.ok(t.title && t.sub);
  }
});

test('정답 공개: 맞힌 순서대로, 그린 사람 점수, 다음 사람', () => {
  const st = {
    phase: 'reveal', drawerId: 'b', players,
    reveal: {
      word: '짜장면', why: 'time',
      gains: [{ id: 'd', pts: 51, order: 2 }, { id: 'c', pts: 112, order: 1 }],
      drawerPts: 50, guessers: 3, nextId: 'c',
    },
  };
  const v = revealView(st);
  assert.equal(v.word, '짜장면');
  assert.deepEqual(v.gains.map((g) => g.name), ['민수', '태양']);
  assert.deepEqual(v.gains.map((g) => g.ptsText), ['+112', '+51']);
  assert.equal(v.drawer.name, '지호');
  assert.equal(v.drawer.ptsText, '+50');
  assert.equal(v.summary, '3명 중 2명이 맞혔어요');
  assert.deepEqual(v.next, { id: 'c', name: '민수' });
  const none = revealView({ ...st, reveal: { word: '기린', why: 'time', gains: [], drawerPts: 0, guessers: 3, nextId: null } });
  assert.equal(none.title, '시간 끝!');
  assert.equal(none.next, null);
  assert.equal(none.drawer.ptsText, '0');
  assert.equal(revealView({ phase: 'reveal' }), null);
});

test('최종 순위: 공동 순위·단상 배치', () => {
  const st = {
    phase: 'final', hostId: 'a', players,
    ranking: [
      { id: 'c', name: '민수', rank: 1, score: 1120, correct: 9 },
      { id: 'a', name: '강식', rank: 2, score: 960, correct: 8 },
      { id: 'b', name: '지호', rank: 2, score: 960, correct: 8 },
      { id: 'd', name: '태양', rank: 4, score: 720, correct: 7 },
    ],
  };
  const f = finalView(st, 'b');
  assert.deepEqual(f.podium.map((r) => r.name), ['강식', '민수', '지호']);
  assert.deepEqual(f.rows.map((r) => r.rank), [1, 2, 2, 4]);
  assert.deepEqual(f.rest.map((r) => r.name), ['태양']);
  assert.equal(f.rows.find((r) => r.id === 'b').isYou, true);
  // rank 칸이 없으면 직접: 점수 → 맞힌 횟수, 같으면 공동
  const g = finalView({ ranking: [{ id: 'x', name: 'x', score: 5, correct: 1 }, { id: 'y', name: 'y', score: 9, correct: 0 }, { id: 'z', name: 'z', score: 5, correct: 1 }] }, 'x');
  assert.deepEqual(g.rows.map((r) => [r.id, r.rank]), [['y', 1], ['x', 2], ['z', 2]]);
  assert.equal(finalView({ ranking: [{ id: 'x', name: 'x', rank: 1, score: 1, correct: 0 }] }, 'x').podium.length, 1);
  assert.deepEqual(finalView(null, 'x').rows, []);
  // 나간 사람(이름이 ranking 에만 있음)도 그대로
  assert.equal(finalView({ players: [], ranking: [{ id: 'q', name: '나간이', rank: 1, score: 1, correct: 1 }] }, 'x').rows[0].name, '나간이');
});

test('한 판 더는 방장만', () => {
  assert.deepEqual(finalActions({ hostId: 'a' }, 'a'), { canRestart: true, restartMsg: { t: 'start' }, lobbyMsg: { t: 'dr', a: 'lobby' }, waitText: '' });
  const o = finalActions({ hostId: 'a' }, 'b');
  assert.equal(o.canRestart, false);
  assert.equal(o.restartMsg, null);
  assert.equal(o.lobbyMsg, null);
  assert.ok(o.waitText);
});
