import test from 'node:test';
import assert from 'node:assert/strict';
import { chatBlocked, mediaBlocked, chatKind } from '../../server/liar/perms.js';

const PHASES = ['lobby', 'reveal', 'speak', 'discuss', 'revote', 'defense', 'judge', 'judged', 'unmask', 'guess', 'result'];
const ROLES = { normal: { id: 'a', spectating: false }, speaker: { id: 's', spectating: false }, accused: { id: 'x', spectating: false }, spectator: { id: 'p', spectating: true } };
const KINDS = ['emote', 'pemote', 'snd', 'sndAdd'];
const g = (phase) => ({ phase, speaker: 's', accused: 'x' });

// 기대표: 글 가능(true) — GDD 4-4. 차례인 사람은 speak 에서도 chatBlocked 는 막는다(첫 설명은 say).
function chatOk(phase, role) {
  if (phase === 'lobby' || phase === 'result') return true;
  if (role === 'spectator') return false;
  if (phase === 'reveal' || phase === 'discuss' || phase === 'revote') return true;
  if (phase === 'defense' || phase === 'judge' || phase === 'judged') return role === 'accused';
  return false; // speak, unmask, guess
}
function mediaOk(phase, role, kind) {
  if (phase === 'unmask') return false;
  if (phase === 'lobby' || phase === 'result') return true;
  if (kind === 'emote') return true;
  if (role === 'spectator') return false;
  if (phase === 'guess') return false;
  return true;
}

for (const phase of PHASES) {
  for (const [role, who] of Object.entries(ROLES)) {
    test(`글: ${phase} / ${role}`, () => {
      const r = chatBlocked(g(phase), who);
      if (chatOk(phase, role)) assert.equal(r, null);
      else assert.equal(typeof r, 'string'), assert.ok(r.length > 0);
    });
    for (const kind of KINDS) {
      test(`${kind}: ${phase} / ${role}`, () => {
        const r = mediaBlocked(g(phase), who, kind);
        if (mediaOk(phase, role, kind)) assert.equal(r, null);
        else assert.ok(typeof r === 'string' && r.length > 0);
      });
    }
  }
}

test('chatKind: 지목된 사람의 변론·찬반·판정 글만 plea', () => {
  for (const phase of PHASES) {
    for (const [role, who] of Object.entries(ROLES)) {
      const want = ['defense', 'judge', 'judged'].includes(phase) && role === 'accused' ? 'plea' : 'talk';
      assert.equal(chatKind(g(phase), who), want, `${phase}/${role}`);
    }
  }
});

test('accused 가 null 이어도 (id 가 없는 사람이) 우연히 맞지 않는다', () => {
  const gg = { phase: 'defense', speaker: null, accused: null };
  assert.ok(chatBlocked(gg, { id: undefined, spectating: false }));
  assert.equal(chatKind(gg, { id: undefined, spectating: false }), 'talk');
});
