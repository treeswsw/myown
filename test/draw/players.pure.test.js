import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seatSlots, splitColumns, bubbleMode, playerView, gainOf, canSeeSec, iAmDrawer,
  bubbleFromChat, bubbleFromHit, logEntryFromChat, logEntryFromHit, pushLog, logFromChatLog,
  avatarSrc, firstChar, seatColor, LOG_MAX,
} from '../../client/src/draw/ui/players.pure.js';

const P = (id, seat, extra = {}) => ({ id, name: id, seat, connected: true, score: 10, hit: false, ...extra });
const S = (extra = {}) => ({
  phase: 'draw', hostId: 'a', drawerId: 'b', reveal: null,
  players: [P('a', 0), P('b', 1), P('c', 2), P('d', 5)], ...extra,
});

test('seatSlots: 자리 번호대로, 빈 자리는 null, 겹치면 빈 칸에', () => {
  const s = seatSlots(S().players);
  assert.equal(s.length, 8);
  assert.equal(s[0].id, 'a'); assert.equal(s[5].id, 'd'); assert.equal(s[3], null);
  const dup = seatSlots([P('x', 2), P('y', 2), P('z', 99)]);
  assert.equal(dup[2].id, 'x'); assert.equal(dup[0].id, 'y'); assert.equal(dup[1].id, 'z');
  assert.equal(seatSlots(null).length, 8);
});

test('splitColumns: 0~3 왼쪽, 4~7 오른쪽', () => {
  const { l, r } = splitColumns(seatSlots(S().players));
  assert.equal(l.length, 4); assert.equal(r.length, 4);
  assert.equal(l[2].id, 'c'); assert.equal(r[1].id, 'd');
});

test('bubbleMode: 방향', () => {
  assert.equal(bubbleMode('wide', 'l', false), 'right');
  assert.equal(bubbleMode('wide', 'r', false), 'left');
  assert.equal(bubbleMode('wide', 'l', true), 'up');
  assert.equal(bubbleMode('wide', 'r', true), 'up');
  assert.equal(bubbleMode('phone', 'l', false), 'right');
  assert.equal(bubbleMode('phone', 'r', false), 'right');
  assert.equal(bubbleMode('phone', 'r', true), 'inrow');
});

test('배지: 끊김 > 그리는 중 > 맞힘 > 방장', () => {
  const st = S({ players: [P('a', 0), P('b', 1), P('c', 2, { hit: true }), P('d', 3, { connected: false, hit: true }), P('e', 4)] });
  const k = (id) => playerView(st, st.players.find((p) => p.id === id)).badge;
  assert.deepEqual(k('a'), { kind: 'host', text: '방장' });
  assert.deepEqual(k('b'), { kind: 'draw', text: '그리는 중' });
  assert.deepEqual(k('c'), { kind: 'hit', text: '맞힘' });
  assert.deepEqual(k('d'), { kind: 'gone', text: '끊김' });
  assert.equal(k('e'), null);
});

test('그리는 중·맞힘은 pick/draw 에서만, reveal 에서는 gains 로 맞힘', () => {
  const lobby = S({ phase: 'lobby', drawerId: null });
  assert.equal(playerView(lobby, lobby.players[1]).drawing, false);
  const rv = S({ phase: 'reveal', reveal: { gains: [{ id: 'c', pts: 80, order: 1 }], drawerPts: 30 } });
  assert.equal(playerView(rv, rv.players[2]).hit, true);
  assert.equal(playerView(rv, rv.players[2]).gain, 80);
  assert.equal(playerView(rv, rv.players[1]).gain, 30);
  assert.equal(playerView(rv, rv.players[1]).drawing, false);
  assert.equal(gainOf(S(), 'c'), 0);
});

test('canSeeSec / iAmDrawer', () => {
  const st = S({ players: [P('a', 0), P('b', 1), P('c', 2, { hit: true }), P('d', 3)] });
  assert.equal(canSeeSec(st, 'b'), true);
  assert.equal(canSeeSec(st, 'c'), true);
  assert.equal(canSeeSec(st, 'd'), false);
  assert.equal(canSeeSec(null, 'a'), false);
  assert.equal(iAmDrawer(st, 'b'), true);
  assert.equal(iAmDrawer(st, 'c'), false);
  assert.equal(iAmDrawer(S({ phase: 'reveal' }), 'b'), false);
});

test('bubbleFromChat: 보통 / 정답자끼리 / 걸러냄', () => {
  const st = S({ players: [P('a', 0), P('b', 1), P('c', 2, { hit: true }), P('d', 3)] });
  assert.deepEqual(bubbleFromChat({ k: 'chat', id: 'a', text: '  라면\n 같아 ' }, st, 'd'), { id: 'a', text: '라면 같아', kind: 'say' });
  assert.deepEqual(bubbleFromChat({ k: 'chat', id: 'c', text: '힌트', sec: 1 }, st, 'b'), { id: 'c', text: '힌트', kind: 'sec' });
  assert.equal(bubbleFromChat({ k: 'chat', id: 'c', text: '힌트', sec: 1 }, st, 'd'), null);
  assert.equal(bubbleFromChat({ k: 'chat', id: 'a', text: '   ' }, st, 'd'), null);
  assert.equal(bubbleFromChat({ k: 'emote', id: 'a', text: 'x' }, st, 'd'), null);
  assert.equal(bubbleFromChat({ k: 'chat', id: 5, text: 'x' }, st, 'd'), null);
  assert.equal(bubbleFromChat({ k: 'chat', id: 'a', text: 'x'.repeat(500) }, st, 'd').text.length, 80);
});

test('bubbleFromHit: 정답 글자 없이 "정답!" 만', () => {
  assert.deepEqual(bubbleFromHit({ k: 'drHit', id: 'c', order: 1, text: '짜장면', word: '짜장면' }), { id: 'c', text: '정답!', kind: 'ok' });
  assert.equal(bubbleFromHit({ k: 'drHit' }), null);
  assert.equal(bubbleFromHit({ k: 'chat', id: 'c' }), null);
});

test('채팅 기록: 정답 알림, 최대 30줄, 정답자끼리 걸러냄', () => {
  assert.deepEqual(logEntryFromHit('민수'), { kind: 'sys', name: '', text: '민수 님 정답!' });
  const l = [];
  for (let i = 0; i < 40; i++) pushLog(l, { kind: 'say', name: 'a', text: String(i) });
  assert.equal(l.length, LOG_MAX); assert.equal(l[0].text, '10');
  const st = S({ players: [P('a', 0), P('b', 1), P('d', 3)] });
  const items = [{ id: 'a', name: 'a', text: '둘', ts: 2 }, { id: 'a', name: 'a', text: '하나', ts: 1 }, { id: 'c', name: 'c', text: '비밀', ts: 3, sec: 1 }];
  assert.deepEqual(logFromChatLog(items, st, 'd').map((x) => x.text), ['하나', '둘']);
  assert.deepEqual(logFromChatLog(items, st, 'b').map((x) => x.text), ['하나', '둘', '비밀']);
  assert.equal(logEntryFromChat({ text: '' }, st, 'b'), null);
});

test('사진·글자·색', () => {
  assert.equal(avatarSrc('data:image/jpeg;base64,/9j/AAA='), 'data:image/jpeg;base64,/9j/AAA=');
  assert.equal(avatarSrc('javascript:alert(1)'), null);
  assert.equal(avatarSrc('data:image/svg+xml;base64,AAA'), null);
  assert.equal(avatarSrc(null), null);
  assert.equal(firstChar('강식'), '강'); assert.equal(firstChar(''), '?'); assert.equal(firstChar('😀x'), '😀');
  assert.equal(seatColor(0), '#b5651d'); assert.equal(seatColor(9), seatColor(1)); assert.equal(seatColor(undefined), seatColor(0));
});
