import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SOUND_NAMES } from '../../client/src/liar/audio.js';

test('이름 15개', () => {
  assert.equal(SOUND_NAMES.length, 15);
  assert.equal(new Set(SOUND_NAMES).size, 15);
});

test('소리 엔진이 없거나 못 내는 곳에서 오류 없이 지나간다', () => {
  const a = createAudio(null);
  for (const n of SOUND_NAMES) a.play(n);
  const broken = createAudio({ isMuted: () => false, context() { throw new Error('no audio'); }, output() { return {}; } });
  for (const n of SOUND_NAMES) broken.play(n);
  broken.play('없는이름'); broken.play('constructor'); broken.play(undefined);
  broken.dispose();
  broken.play('phase');
});

function fakeSound(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running',
    createGain() { return { gain: param(), connect() {} }; },
    createOscillator() { log.osc++; return { frequency: param(), connect() {}, start() {}, stop() {} }; },
    createBiquadFilter() { return { frequency: param(), connect() {} }; },
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; },
  };
  return { muted: false, isMuted() { return this.muted; }, context() { log.ctx++; return ctx; }, output() { return {}; } };
}

test('공용 소리 엔진 위에서 재생: 사이트 소리 끄기를 따르고, 모르는 이름은 소리 없음, 정리 뒤에는 조용', () => {
  const log = { osc: 0, ctx: 0 };
  const sound = fakeSound(log);
  const a = createAudio(sound);
  a.play('nope');
  assert.equal(log.osc, 0);
  for (const n of SOUND_NAMES) a.play(n);
  assert.ok(log.osc > 15);
  const before = log.osc;
  sound.muted = true; // 사이트 소리 끄기
  a.play('win');
  assert.equal(log.osc, before);
  sound.muted = false;
  a.play('win');
  assert.ok(log.osc > before);
  const again = log.osc;
  a.dispose();
  a.play('win');
  assert.equal(log.osc, again);
});
