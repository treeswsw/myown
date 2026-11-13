import test from 'node:test';
import assert from 'node:assert/strict';
import { chatLockFor } from '../../client/src/liar/ui/hud.js';
import { stateFor, PHASES } from './ui/hud/fixtures.js';

// GDD 4-4. [단계] -> { 나(별일 없음), 차례인 사람, 지목된 사람, 관전자 } 가 글을 쓸 수 있는가
const open = {
  lobby: { me: true, speaker: true, accused: true, spec: true },
  reveal: { me: true, speaker: true, accused: true, spec: false },
  speak: { me: false, speaker: true, accused: false, spec: false },
  discuss: { me: true, speaker: true, accused: true, spec: false },
  revote: { me: true, speaker: true, accused: true, spec: false },
  defense: { me: false, speaker: false, accused: true, spec: false },
  judge: { me: false, speaker: false, accused: true, spec: false },
  judged: { me: false, speaker: false, accused: true, spec: false },
  unmask: { me: false, speaker: false, accused: false, spec: false },
  guess: { me: false, speaker: false, accused: false, spec: false },
  answer: { me: false, speaker: false, accused: false, spec: false },
  result: { me: true, speaker: true, accused: true, spec: true },
};

for (const phase of PHASES) {
  test(`chatLockFor ${phase}`, () => {
    const exp = open[phase];
    const base = () => stateFor(phase, { you: 'u5' }); // u5 = 그냥 나
    const as = (extra) => stateFor(phase, { speaker: phase === 'speak' ? 'u1' : null, ...extra });
    const lockedOf = (s) => chatLockFor(s).locked;
    assert.equal(lockedOf(base()), !exp.me, 'me');
    if (phase === 'speak') assert.equal(lockedOf(as({ you: 'u1' })), !exp.speaker, 'speaker');
    const acc = as({ you: 'u3', accused: 'u3' });
    assert.equal(lockedOf(acc), !exp.accused, 'accused');
    const spec = base();
    spec.players.find((p) => p.id === 'u5').spectating = true;
    assert.equal(lockedOf(spec), !exp.spec, 'spectator');
    // 잠기면 hint 는 글자. 안 잠겼는데 글자가 있으면 hot
    for (const s of [base(), acc, spec]) {
      const r = chatLockFor(s);
      assert.equal(typeof r.hint, 'string');
      assert.equal(typeof r.hot, 'boolean');
      if (r.locked) assert.ok(r.hint.length > 0 && !r.hot);
      else assert.equal(r.hint.length > 0, r.hot);
    }
  });
}

test('chatLockFor null/방 없음', () => {
  assert.deepEqual(chatLockFor(null), { locked: false, hint: '', hot: false });
});

test('chatLockFor 문구', () => {
  assert.match(chatLockFor(stateFor('speak', { you: 'u5' })).hint, /차례인 사람만/);
  assert.match(chatLockFor(stateFor('defense', { you: 'u5' })).hint, /지목된 사람만/);
});

test('chatLockFor answer 문구', () => {
  assert.equal(chatLockFor(stateFor('answer', { you: 'u5' })).hint, '정답 공개 중에는 글을 쓸 수 없어요');
});

test('chatLockFor hot: 내 차례·남의 차례·지목된 사람·구경', () => {
  const mine = chatLockFor(stateFor('speak', { you: 'u1', speaker: 'u1' }));
  assert.deepEqual(mine, { locked: false, hint: '첫 발언을 입력하세요', hot: true });
  const other = chatLockFor(stateFor('speak', { you: 'u5', speaker: 'u1' }));
  assert.equal(other.locked, true);
  assert.equal(other.hot, false);
  for (const ph of ['defense', 'judge', 'judged']) {
    const acc = chatLockFor(stateFor(ph, { you: 'u3', accused: 'u3' }));
    assert.deepEqual(acc, { locked: false, hint: '최후 변론을 입력하세요', hot: true }, ph);
  }
  for (const ph of ['lobby', 'reveal', 'discuss', 'revote', 'result']) {
    assert.deepEqual(chatLockFor(stateFor(ph, { you: 'u5' })), { locked: false, hint: '', hot: false }, ph);
  }
  const spec = stateFor('speak', { you: 'u5', speaker: 'u5' });
  spec.players.find((p) => p.id === 'u5').spectating = true;
  const r = chatLockFor(spec);
  assert.equal(r.locked, true);
  assert.equal(r.hot, false);
});

test('첫 설명을 쓴 뒤 3초 머묾(speakDone): 차례인 사람도 잠긴다', () => {
  const st = { phase: 'speak', speaker: 'u1', you: 'u1', speakDone: true, players: [{ id: 'u1' }] };
  assert.equal(chatLockFor(st).locked, true);
  assert.equal(chatLockFor({ ...st, speakDone: false }).locked, false);
});
