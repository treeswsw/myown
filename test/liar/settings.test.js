import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS, OWN, timeLabel } from '../../shared/liar/settings.js';
import { waitModel, patchFor } from '../../client/src/room/wait.js';
import { GAMES } from '../../shared/games.js';
import { DEFAULT_SETTINGS } from '../../server/liar/room.js';
import { TIME_CHOICES, GOAL_CHOICES } from '../../shared/liar/constants.js';

test('timeLabel', () => {
  assert.equal(timeLabel(45), '45초');
  assert.equal(timeLabel(60), '1분');
  assert.equal(timeLabel(120), '2분');
  assert.equal(timeLabel(90), '1분 30초');
  assert.equal(timeLabel(0), '0초');
});

test('스키마: 옛 설정 화면이 보여 주던 칸이 모두 있다(방식·묶음·주제 방식·주제·시간 6개·목표 점수)', () => {
  assert.deepEqual(OWN, []);
  const ks = SETTINGS.map((r) => r.k);
  assert.deepEqual(ks, ['liarMode', 'wordSet', 'topicMode', 'topics', 'nextTopic',
    'times.speak', 'times.discuss', 'times.rediscuss', 'times.defense', 'times.judge', 'times.guess', 'goal']);
  for (const key of Object.keys(TIME_CHOICES)) {
    const row = SETTINGS.find((r) => r.k === `times.${key}`);
    assert.deepEqual(row.opts.map((o) => o[0]), [...TIME_CHOICES[key]]);
  }
  assert.deepEqual(SETTINGS.find((r) => r.k === 'goal').opts.map((o) => o[0]), [...GOAL_CHOICES]);
  assert.equal(SETTINGS.find((r) => r.k === 'goal').opts[0][1], '없음');
  assert.equal(GAMES.liar.settings, SETTINGS);
});

const stateOf = (set, extra = {}) => ({
  mode: 'liar', code: 'ABCD', hostId: 'a', you: 'a', phase: 'lobby',
  players: [{ id: 'a', name: '가', connected: true, color: '#e5484d' }, { id: 'b', name: '나', connected: true, color: '#f5a524' }],
  wait: { can: true, why: null, set, own: {} }, ...extra,
});

test('waitModel: 방장은 바꿀 수 있고 값이 켜져 있다 / 주제는 무작위일 때만 체크 목록, 직접일 때만 다음 주제', () => {
  const set = DEFAULT_SETTINGS();
  const m = waitModel(stateOf(set), GAMES.liar, 'a');
  assert.equal(m.isHost, true);
  assert.deepEqual(m.sections.map((s) => s.title), ['규칙', '시간', '점수']);
  const rule = m.sections[0].fields;
  assert.deepEqual(rule.map((f) => f.k), ['liarMode', 'wordSet', 'topicMode', 'topics']);
  assert.equal(rule[0].opts.find((o) => o.on).v, 'word');
  assert.equal(rule[3].type, 'multi');
  assert.equal(rule[3].opts.length, 11);
  assert.ok(rule[3].opts.every((o) => o.on));
  const host = waitModel(stateOf({ ...set, topicMode: 'host', nextTopic: set.topics[1].name }), GAMES.liar, 'a');
  assert.deepEqual(host.sections[0].fields.map((f) => f.k), ['liarMode', 'wordSet', 'topicMode', 'nextTopic']);
  assert.equal(host.sections[0].fields[3].opts.find((o) => o.on).v, set.topics[1].name);
  const times = m.sections[1].fields;
  assert.equal(times[0].opts.find((o) => o.on).v, 30);
  assert.ok(times.every((f) => f.editable));
});

test('waitModel: 방장이 아니면 읽기 전용', () => {
  const m = waitModel(stateOf(DEFAULT_SETTINGS(), { you: 'b' }), GAMES.liar, 'b');
  assert.equal(m.isHost, false);
  assert.ok(m.sections.every((s) => s.fields.every((f) => !f.editable)));
});

test('patchFor: 시간은 중첩 객체로, 서버가 받는 모양과 같다', () => {
  assert.deepEqual(patchFor('times.speak', 45), { times: { speak: 45 } });
  assert.deepEqual(patchFor('goal', 10), { goal: 10 });
});
