import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeLabel, isHost, canEdit, canKick, toggleTopic, isLastTopic, startState, summaryLine, seatsLabel,
  faceColor, initial, settingsMsg, topicMsg, kickMsg, startMsg,
} from '../../client/src/draw/ui/settings.pure.js';
import { checkDr } from '../../shared/draw/protocol.js';
import { TOPICS_ON, TOPICS_OFF } from '../../shared/draw/constants.js';

const ALL = [...TOPICS_ON, ...TOPICS_OFF];
const mkState = (over = {}) => ({
  code: 'KQZT', mode: 'draw', hostId: 'a', you: 'a', phase: 'lobby',
  settings: { order: 'seq', rounds: 2, time: 140, len: true, topics: [...TOPICS_ON], allTopics: ALL },
  players: [
    { id: 'a', name: '강식', seat: 0, connected: true },
    { id: 'b', name: '지호', seat: 1, connected: true },
  ],
  ...over,
});

test('timeLabel', () => {
  assert.equal(timeLabel(60), '1분');
  assert.equal(timeLabel(90), '1분 30초');
  assert.equal(timeLabel(140), '2분 20초');
  assert.equal(timeLabel(45), '45초');
});

test('방장·편집·내보내기 권한', () => {
  assert.equal(isHost(mkState()), true);
  assert.equal(isHost(mkState({ you: 'b' })), false);
  assert.equal(canEdit(mkState()), true);
  assert.equal(canEdit(mkState({ you: 'b' })), false);
  assert.equal(canEdit(mkState({ phase: 'draw' })), false);
  assert.equal(canKick(mkState(), 'b'), true);
  assert.equal(canKick(mkState(), 'a'), false);
  assert.equal(canKick(mkState(), 'zz'), false);
  assert.equal(canKick(mkState({ you: 'b' }), 'a'), false);
});

test('toggleTopic: 켜기·끄기·마지막 하나·없는 이름', () => {
  const s = mkState().settings;
  const off = toggleTopic(s, '음식');
  assert.equal(off.includes('음식'), false);
  assert.equal(off.length, TOPICS_ON.length - 1);
  const on = toggleTopic(s, '인물');
  assert.deepEqual(on, ALL.filter((t) => TOPICS_ON.includes(t) || t === '인물'));
  assert.equal(toggleTopic(s, '없는주제'), null);
  const one = { ...s, topics: ['음식'] };
  assert.equal(toggleTopic(one, '음식'), null);
  assert.equal(isLastTopic(one, '음식'), true);
  assert.equal(isLastTopic(s, '음식'), false);
  assert.deepEqual(toggleTopic(one, '동물'), ['음식', '동물']);
});

test('startState: 방장·인원·주제', () => {
  assert.deepEqual(startState(mkState()), { show: true, enabled: true, note: '' });
  const solo = mkState({ players: [{ id: 'a', name: '강식', seat: 0, connected: true }] });
  const r = startState(solo);
  assert.equal(r.enabled, false);
  assert.match(r.note, /2명 이상/);
  const away = mkState({ players: [{ id: 'a', connected: true }, { id: 'b', connected: false }] });
  assert.equal(startState(away).enabled, false);
  assert.equal(startState(mkState({ you: 'b' })).enabled, false);
  assert.equal(startState(mkState({ phase: 'draw' })).show, false);
  const nt = mkState(); nt.settings.topics = [];
  assert.equal(startState(nt).enabled, false);
});

test('summaryLine·seatsLabel', () => {
  const s = mkState();
  assert.equal(summaryLine(s), '2명 × 2라운드 = 문제 4개 · 단어 3개 중 고르기 · 글자 수 표시');
  s.settings.len = false;
  assert.match(summaryLine(s), /글자 수 숨김$/);
  assert.equal(seatsLabel(s), '2 / 8');
});

test('faceColor·initial', () => {
  assert.equal(faceColor(0), faceColor(8));
  assert.match(faceColor(undefined), /^#/);
  assert.equal(initial(' 강식'), '강');
  assert.equal(initial(''), '?');
});

test('settingsMsg: checkDr 를 통과하는 모양, 방장만', () => {
  const s = mkState();
  for (const patch of [{ order: 'hit' }, { order: 'rand' }, { rounds: 5 }, { time: 60 }, { len: false }, { topics: ['음식', '동물'] }]) {
    const m = settingsMsg(s, patch);
    assert.equal(m.t, 'dr');
    assert.equal(m.a, 'settings');
    assert.equal(checkDr(m).ok, true, JSON.stringify(m));
    for (const k of Object.keys(patch)) assert.deepEqual(m[k], patch[k]);
  }
  assert.equal(settingsMsg(mkState({ you: 'b' }), { order: 'hit' }), null);
  assert.equal(settingsMsg(s, { order: 'zzz' }), null);
  assert.equal(settingsMsg(s, { rounds: 4 }), null);
  assert.equal(settingsMsg(s, { time: 100 }), null);
  assert.equal(settingsMsg(s, {}), null);
  assert.equal(settingsMsg(s, { topics: [] }), null);
});

test('topicMsg·kickMsg·startMsg', () => {
  const s = mkState();
  const tm = topicMsg(s, '음식');
  assert.equal(checkDr(tm).ok, true);
  assert.equal(tm.topics.includes('음식'), false);
  const one = mkState(); one.settings.topics = ['음식'];
  assert.equal(topicMsg(one, '음식'), null);
  assert.deepEqual(kickMsg(s, 'b'), { t: 'dr', a: 'kick', id: 'b' });
  assert.equal(checkDr(kickMsg(s, 'b')).ok, true);
  assert.equal(kickMsg(s, 'a'), null);
  assert.deepEqual(startMsg(s), { t: 'start' });
  assert.equal(startMsg(mkState({ you: 'b' })), null);
});
