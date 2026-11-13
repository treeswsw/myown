import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SOUND_NAMES } from '../../client/src/liar/audio.js';

test('이름 15개', () => {
  assert.equal(SOUND_NAMES.length, 15);
  assert.equal(new Set(SOUND_NAMES).size, 15);
});

test('AudioContext 없는 node 에서 오류 없이 지나간다', () => {
  const a = createAudio();
  for (const n of SOUND_NAMES) a.play(n);
  a.play('없는이름'); a.play('constructor'); a.play(undefined);
  a.unlock();
  for (const n of SOUND_NAMES) a.play(n);
  a.setMuted(true);
  assert.equal(a.muted, true);
  a.play('phase');
  a.dispose();
  a.play('phase');
});

function fakeCtx(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = {}; log.created++; }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() { log.osc++; return { frequency: param(), connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { frequency: param(), connect() {} }; }
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
    resume() {}
    close() { log.closed++; }
  };
}

test('가짜 AudioContext: unlock 전에는 만들지 않고, 끔·모르는 이름은 소리 없음', () => {
  const log = { created: 0, osc: 0, closed: 0 };
  globalThis.AudioContext = fakeCtx(log);
  try {
    const a = createAudio();
    assert.equal(log.created, 0);
    a.play('phase');
    assert.equal(log.osc, 0, '잠금 상태');
    a.unlock(); a.unlock();
    assert.equal(log.created, 1);
    a.play('nope');
    assert.equal(log.osc, 0);
    for (const n of SOUND_NAMES) a.play(n);
    assert.ok(log.osc > 15);
    const before = log.osc;
    a.setMuted(true); a.play('win');
    assert.equal(log.osc, before);
    a.dispose();
    assert.equal(log.closed, 1);
    a.setMuted(false); a.play('win');
    assert.equal(log.osc, before);
  } finally { delete globalThis.AudioContext; }
});
