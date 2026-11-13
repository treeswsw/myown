import test from 'node:test';
import assert from 'node:assert/strict';
import { chatMsgFor, plainChat, soundForEvent, resultSound } from '../../client/src/liar/pure.js';

test('chatMsgFor: 내 차례 / 남의 차례 / 토론 / state null', () => {
  assert.deepEqual(chatMsgFor({ phase: 'speak', speaker: 'a', you: 'a' }, 'x'), { t: 'lg', a: 'say', text: 'x' });
  assert.deepEqual(chatMsgFor({ phase: 'speak', speaker: 'b', you: 'a' }, 'x'), { t: 'chat', text: 'x' });
  assert.deepEqual(chatMsgFor({ phase: 'discuss', speaker: 'a', you: 'a' }, 'x'), { t: 'chat', text: 'x' });
  assert.deepEqual(chatMsgFor(null, 'x'), { t: 'chat', text: 'x' });
});

test('plainChat: 크기 표시 떼기', () => {
  assert.equal(plainChat('#a'), 'a');
  assert.equal(plainChat('*a'), 'a');
  assert.equal(plainChat('***a'), 'a');
  assert.equal(plainChat('#'), '#');
  assert.equal(plainChat('***'), '***');
  assert.equal(plainChat('a*'), 'a*');
});

test('soundForEvent / resultSound: 역할과 무관', () => {
  assert.equal(soundForEvent({ k: 'turn', id: 'a' }, 'a'), 'myTurn');
  assert.equal(soundForEvent({ k: 'turn', id: 'b' }, 'a'), 'turn');
  assert.equal(soundForEvent({ k: 'judged', executed: false }, 'a'), 'spared');
  assert.equal(soundForEvent({ k: 'guess', correct: true }, 'a'), null); // 소리는 엔딩이 판정 때 낸다
  assert.equal(soundForEvent({ k: 'guess', correct: false }, 'a'), null);
  assert.equal(soundForEvent({ k: 'unmask' }, 'a'), null);
  assert.equal(resultSound({ phase: 'result', result: { winner: 'void' } }), null);
  assert.equal(resultSound({ phase: 'result', result: { winner: 'liar', champions: ['a'] } }), 'champion');
  assert.equal(resultSound({ phase: 'result', result: { winner: 'liar' } }), 'win');
});

test('plainChat 은 서버 stripSizeMark 와 같은 결과(표시뿐인 글은 원문)', async () => {
  const { stripSizeMark } = await import('../../server/liar/room.js');
  for (const s of ['***', '**', '#', '#*', '* *', '** #', '***hi', '** hi', '#*hi', '*  안녕', '#제목', 'a*']) {
    assert.equal(plainChat(s), stripSizeMark(s), s);
  }
});

test('chatMsgFor: 쓴 뒤 머무는 동안(speakDone)에는 say 로 보내지 않는다', () => {
  assert.deepEqual(chatMsgFor({ phase: 'speak', speaker: 'a', you: 'a', speakDone: true }, 'x'), { t: 'chat', text: 'x' });
});
