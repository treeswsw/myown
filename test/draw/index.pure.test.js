// 갱식마인드 입구(client/src/draw/pure.js, audio.js)의 순수 계산 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutFor, keyboardUp, createToolStore, TOOL_DEFAULT, routesFor, MODULES, rootClasses,
  soundForRoom, soundForEvent, tenSecondsKey, clockOffset,
} from '../../client/src/draw/pure.js';
import { createAudio, SOUNDS, SOUND_NAMES } from '../../client/src/draw/audio.js';

test('layoutFor: 높이 480 이하는 휴대폰, 그 위는 PC·iPad', () => {
  assert.equal(layoutFor(390), 'phone');
  assert.equal(layoutFor(480), 'phone');
  assert.equal(layoutFor(481), 'wide');
  assert.equal(layoutFor(800), 'wide');
  assert.equal(layoutFor(0), 'wide');
  assert.equal(layoutFor(NaN), 'wide');
});

test('keyboardUp: 휴대폰에서 보이는 높이가 80px 넘게 줄면 키보드', () => {
  assert.equal(keyboardUp('phone', 390, 190, 0), true);
  assert.equal(keyboardUp('phone', 390, 380, 0), false);
  assert.equal(keyboardUp('wide', 800, 400, 0), false);
});

test('createToolStore: 기본값, 정리, 구독', () => {
  const t = createToolStore();
  assert.deepEqual(t.get(), TOOL_DEFAULT);
  assert.deepEqual(TOOL_DEFAULT, { tool: 'pen', color: 0, penW: 10, eraseW: 24 });
  const seen = [];
  const off = t.on((v) => seen.push(v));
  t.set({ color: 5 });
  assert.equal(t.get().color, 5);
  t.set({ color: 5 }); // 같은 값은 알리지 않는다
  assert.equal(seen.length, 1);
  t.set({ tool: 'bogus', penW: 999, color: -1 });
  assert.equal(t.get().tool, 'pen');
  assert.equal(t.get().penW, 40);
  assert.equal(t.get().color, 0);
  t.set({ tool: 'erase', eraseW: 2 });
  assert.deepEqual(t.get(), { tool: 'erase', color: 0, penW: 40, eraseW: 2 });
  off();
  const n = seen.length;
  t.set({ tool: 'pen' });
  assert.equal(seen.length, n);
  t.get().color = 9; // 돌려받은 객체를 고쳐도 안쪽은 그대로
  assert.equal(t.get().color, 0);
  t.set(null);
  assert.doesNotThrow(() => t.set(undefined));
});

test('createToolStore: 구독자 하나가 던져도 나머지는 불린다', () => {
  const t = createToolStore();
  let n = 0;
  t.on(() => { throw new Error('x'); });
  t.on(() => { n++; });
  t.set({ color: 3 });
  assert.equal(n, 1);
});

test('routesFor: 그림은 그림판만, 새 문제는 여럿, 모르는 것은 모두', () => {
  for (const k of ['drSt', 'drPt', 'drCx', 'drRm', 'drUndo', 'drRedo', 'drClear', 'drSync']) assert.deepEqual(routesFor({ k }), ['board'], k);
  assert.deepEqual(routesFor({ k: 'drNew' }), ['board', 'hud', 'players', 'result']);
  assert.deepEqual(routesFor({ k: 'drHit' }), ['players']);
  assert.deepEqual(routesFor({ k: 'chat' }), ['players']);
  assert.deepEqual(routesFor({ k: 'chatLog' }), ['players']);
  assert.deepEqual(routesFor({ k: 'faces' }), ['players']);
  assert.deepEqual(routesFor({ k: 'joined' }), []);
  assert.deepEqual(routesFor({ k: 'whatever' }), [...MODULES]);
  assert.deepEqual(routesFor(null), []);
  assert.deepEqual(routesFor({}), []);
  assert.deepEqual(routesFor({ k: 'toString' }), [...MODULES]); // 객체 기본 속성 이름에 속지 않는다
});

test('rootClasses: 배치·단계·내 역할·기록 칸·키보드', () => {
  const draw = { phase: 'draw', drawerId: 'me' };
  assert.deepEqual(rootClasses({ state: null, meId: 'me', layout: 'wide' }), ['dr-wide']);
  assert.deepEqual(rootClasses({ state: draw, meId: 'me', layout: 'wide' }), ['dr-wide', 'dr-ph-draw', 'dr-tools', 'dr-lg-small']);
  assert.deepEqual(rootClasses({ state: draw, meId: 'me', layout: 'phone' }), ['dr-phone', 'dr-ph-draw', 'dr-tools', 'dr-lg-hidden']);
  assert.deepEqual(rootClasses({ state: draw, meId: 'you', layout: 'wide' }), ['dr-wide', 'dr-ph-draw', 'dr-plain', 'dr-lg-full']);
  assert.deepEqual(rootClasses({ state: draw, meId: 'you', layout: 'phone', kb: true }), ['dr-phone', 'dr-ph-draw', 'dr-plain', 'dr-lg-full', 'dr-kb']);
  assert.ok(!rootClasses({ state: draw, meId: 'you', layout: 'wide', kb: true }).includes('dr-kb'), 'PC 에는 키보드 배치가 없다');
  // 그리는 사람이어도 단어 고르는 중에는 도구가 없다
  assert.ok(rootClasses({ state: { phase: 'pick', drawerId: 'me' }, meId: 'me', layout: 'wide' }).includes('dr-plain'));
  assert.ok(rootClasses({ state: { phase: 'lobby' }, meId: 'me', layout: 'wide' }).includes('dr-ph-lobby'));
});

test('soundForRoom: 내 차례(단어 고르기 시작)와 시간 끝', () => {
  const pick = { phase: 'pick', drawerId: 'me', q: 3 };
  assert.equal(soundForRoom(null, pick, 'me'), 'myTurn');
  assert.equal(soundForRoom({ phase: 'reveal', drawerId: 'x', q: 2 }, pick, 'me'), 'myTurn');
  assert.equal(soundForRoom(pick, { ...pick }, 'me'), null, '같은 단계가 다시 와도 한 번만');
  assert.equal(soundForRoom(pick, { phase: 'draw', drawerId: 'me', q: 3 }, 'me'), null);
  assert.equal(soundForRoom(null, { phase: 'pick', drawerId: 'you', q: 1 }, 'me'), null);
  const prev = { phase: 'draw' };
  assert.equal(soundForRoom(prev, { phase: 'reveal', reveal: { why: 'time' } }, 'me'), 'timeUp');
  assert.equal(soundForRoom(prev, { phase: 'reveal', reveal: { why: 'all' } }, 'me'), null);
  assert.equal(soundForRoom({ phase: 'reveal' }, { phase: 'reveal', reveal: { why: 'time' } }, 'me'), null);
  assert.equal(soundForRoom(prev, null, 'me'), null);
  assert.equal(soundForRoom(prev, pick, null), null);
});

test('soundForEvent: 내가 맞히면 정답, 남이 맞히면 작은 소리', () => {
  assert.equal(soundForEvent({ k: 'drHit', id: 'me', order: 1 }, 'me'), 'correct');
  assert.equal(soundForEvent({ k: 'drHit', id: 'x', order: 2 }, 'me'), 'hit');
  assert.equal(soundForEvent({ k: 'chat', id: 'me' }, 'me'), null);
  assert.equal(soundForEvent(null, 'me'), null);
});

test('tenSecondsKey: 10초 안쪽에서 한 문제에 한 번', () => {
  const s = { phase: 'draw', endsAt: 100000, roundNo: 1, q: 4 };
  assert.equal(tenSecondsKey(s, 85000, null), null);
  assert.equal(tenSecondsKey(s, 90000, null), '1:4');
  assert.equal(tenSecondsKey(s, 95000, '1:4'), null);
  assert.equal(tenSecondsKey(s, 95000, '1:3'), '1:4');
  assert.equal(tenSecondsKey(s, 100000, null), null, '시간이 다 된 뒤에는 울리지 않는다');
  assert.equal(tenSecondsKey({ ...s, phase: 'reveal' }, 95000, null), null);
  assert.equal(tenSecondsKey({ ...s, endsAt: null }, 95000, null), null);
  assert.equal(tenSecondsKey(null, 95000, null), null);
});

test('clockOffset: 상태에 서버 시각이 있을 때만 보정', () => {
  assert.equal(clockOffset({ now: 5000 }, 4000, 7), 1000);
  assert.equal(clockOffset({}, 4000, 7), 7);
  assert.equal(clockOffset(null, 4000), 0);
});

test('audio: 소리 이름마다 음이 있고, 소리 장치가 없어도 던지지 않는다', () => {
  for (const n of SOUND_NAMES) assert.ok(Array.isArray(SOUNDS[n]) && SOUNDS[n].length > 0, n);
  const a = createAudio();
  assert.doesNotThrow(() => { a.unlock(); a.play('correct'); a.play('nope'); a.dispose(); a.play('correct'); });
});

test('audio: 끄기 설정이면 틀지 않고, 켜면 튼다', () => {
  let started = 0;
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class FakeAC {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: { ...param, value: 0 }, connect() {} }; }
    createOscillator() { return { type: '', frequency: param, connect() {}, start() { started++; }, stop() {} }; }
    close() {}
  }
  const prev = globalThis.AudioContext;
  globalThis.AudioContext = FakeAC;
  try {
    let muted = true;
    const a = createAudio({ isMuted: () => muted });
    a.unlock();
    a.play('correct');
    assert.equal(started, 0);
    muted = false;
    a.play('correct');
    assert.equal(started, SOUNDS.correct.length);
    a.play('bogus');
    assert.equal(started, SOUNDS.correct.length);
    a.dispose();
  } finally {
    if (prev === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = prev;
  }
});
