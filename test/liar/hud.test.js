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
    // 잠기면 hint 는 글자, 안 잠기면 빈 글자
    for (const s of [base(), acc, spec]) {
      const r = chatLockFor(s);
      assert.equal(typeof r.hint, 'string');
      assert.equal(r.hint.length > 0, r.locked);
    }
  });
}

test('chatLockFor null/방 없음', () => {
  assert.deepEqual(chatLockFor(null), { locked: false, hint: '' });
});

test('chatLockFor 문구', () => {
  assert.match(chatLockFor(stateFor('speak', { you: 'u5' })).hint, /차례인 사람만/);
  assert.match(chatLockFor(stateFor('defense', { you: 'u5' })).hint, /지목된 사람만/);
});
