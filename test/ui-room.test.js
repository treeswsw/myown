// 화면 공통 방 틀의 순수 함수 (COMMON-CONTRACT 4-3): 대기실 그릴 값(waitModel), 설정 보낼 모양(patchFor), 사진 저장소(faces).
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitModel, patchFor, getPath } from '../client/src/room/wait.js';
import { createFaces } from '../client/src/room/faces.js';
import { visibleModes, GAMES, CLIENT_GAMES, isFramed } from '../client/src/games.js';

const SCHEMA = {
  name: '시험게임', about: '설명 글', max: 6,
  settings: [
    { k: 'mode', label: '방식', group: '규칙', type: 'seg', opts: [['a', '가'], ['b', '나']] },
    { k: 'times.speak', label: '첫 설명', group: '시간', type: 'seg', opts: [[20, '20초'], [30, '30초']] },
    { k: 'topics', label: '주제', group: '규칙', type: 'multi', opts: () => ['음식', '동물', '직업'], get: (set) => set.topics.filter((t) => t.on).map((t) => t.name) },
    { k: 'next', label: '이번 주제', group: '규칙', type: 'seg', when: (set) => set.mode === 'b', opts: [['x', 'X']] },
    { type: 'info', group: '규칙', rows: [['인원', '3~6명']] },
  ],
  own: [{ k: 'color', label: '내 색 고르기', type: 'custom', part: 'gk-color' }],
};
const STATE = {
  code: 'AB12', mode: 'test', hostId: 'h', you: 'h', phase: 'lobby', now: 0,
  players: [{ id: 'h', name: '성원', connected: true }, { id: 'g', name: '민지', connected: false, color: '#d61b18' }],
  wait: { can: false, why: { msg: '1명 더 필요해요', code: 'x_need' },
    set: { mode: 'a', times: { speak: 30 }, topics: [{ name: '음식', on: false }, { name: '동물', on: true }, { name: '직업', on: true }] },
    own: { h: { color: 'green' } } },
  specs: [],
};

test('patchFor: 점 이름은 중첩 객체로', () => {
  assert.deepEqual(patchFor('times.speak', 30), { times: { speak: 30 } });
  assert.deepEqual(patchFor('mode', 'b'), { mode: 'b' });
  assert.equal(getPath({ a: { b: 1 } }, 'a.b'), 1);
  assert.equal(getPath({}, 'a.b'), undefined);
});

test('waitModel: 머리·참가자·시작', () => {
  const m = waitModel(STATE, SCHEMA, 'h');
  assert.equal(m.title, '성원의 방');
  assert.equal(m.game, '시험게임');
  assert.equal(m.about, '설명 글');
  assert.equal(`${m.count}/${m.max}`, '2/6');
  assert.equal(m.isHost, true);
  assert.equal(m.can, false);
  assert.equal(m.why, '1명 더 필요해요');
  assert.deepEqual(m.players.map((p) => [p.tags, p.kick, p.off]), [['방장 · 나', false, false], ['연결 끊김', true, true]]);
  assert.equal(m.players[1].color, '#d61b18');
  const guest = waitModel(STATE, SCHEMA, 'g');
  assert.equal(guest.isHost, false);
  assert.ok(guest.players.every((p) => !p.kick), '방장이 아니면 내보내기 없음');
});

test('waitModel: 스키마 4종(seg·multi·info·custom)과 when·group 순서', () => {
  const m = waitModel(STATE, SCHEMA, 'h');
  assert.deepEqual(m.sections.map((s) => s.title), ['내 색 고르기', '규칙', '시간'], '개인 칸 먼저, 그다음 group 이 처음 나온 순서');
  const rule = m.sections[1];
  assert.equal(rule.hostOnly, true);
  assert.deepEqual(rule.fields.map((f) => f.type), ['seg', 'multi', 'info'], 'when 이 거짓인 칸은 빠진다');
  assert.deepEqual(rule.fields[0].opts.map((o) => o.on), [true, false]);
  assert.deepEqual(rule.fields[1].opts.filter((o) => o.on).map((o) => o.v), ['동물', '직업']);
  assert.deepEqual(rule.fields[2].rows, [['인원', '3~6명']]);
  assert.deepEqual(m.sections[2].fields[0].opts.map((o) => o.on), [false, true], '중첩 값 times.speak');
  assert.equal(m.sections[0].own, true);
  assert.equal(m.sections[0].fields[0].type, 'custom');
  assert.equal(m.sections[0].fields[0].part, 'gk-color');
  assert.ok(rule.fields.filter((f) => f.type !== 'info').every((f) => f.editable), '방장은 바꿀 수 있다');
  const guest = waitModel(STATE, SCHEMA, 'g');
  assert.ok(guest.sections[1].fields.filter((f) => f.type !== 'info').every((f) => !f.editable), '방장이 아니면 읽기 전용');
  assert.equal(guest.sections[0].fields[0].editable, true, '개인 칸은 누구나 자기 것');
  const b = waitModel({ ...STATE, wait: { ...STATE.wait, set: { ...STATE.wait.set, mode: 'b' } } }, SCHEMA, 'h');
  assert.equal(b.sections[1].fields.length, 4, 'when 이 참이면 나온다');
});

test('waitModel: 설정 없는 게임은 안내 한 줄, 게임 중(wait=null)은 누를 수 없음', () => {
  const m = waitModel(STATE, { name: '요트', max: 4, settings: [], own: [] }, 'h');
  assert.deepEqual(m.sections.map((s) => [s.title, s.note]), [['설정', '이 게임은 바꿀 설정이 없어요']]);
  const info = waitModel(STATE, { name: 'x', max: 4, settings: [{ type: 'info', group: '규칙', rows: [['a', 'b']] }], own: [] }, 'h');
  assert.equal(info.sections[0].note, '이 게임은 바꿀 설정이 없어요');
  const playing = waitModel({ ...STATE, wait: null }, SCHEMA, 'h');
  assert.equal(playing.waiting, false);
  assert.ok(playing.players.every((p) => !p.kick));
});

test('faces: 받은 사람만 덮어쓰고 잘못된 사진은 버림', () => {
  const f = createFaces();
  let n = 0;
  f.onChange(() => n++);
  f.apply({ k: 'faces', items: [{ id: 'a', avatar: 'data:image/jpeg;base64,AAAA', look: { title: 't1' } }, { id: 'b', avatar: 'javascript:x' }] });
  assert.deepEqual(f.get('a'), { avatar: 'data:image/jpeg;base64,AAAA', look: { title: 't1' } });
  assert.deepEqual(f.get('b'), { avatar: null, look: null });
  assert.deepEqual(f.get('z'), { avatar: null, look: null });
  f.drop('a');
  assert.equal(f.get('a').avatar, null);
  assert.equal(n, 2);
});

test('games.js: 화면 등록표와 게임 사실의 키가 같고, 옮긴 게임만 mount 가 있다', () => {
  assert.deepEqual(Object.keys(CLIENT_GAMES), Object.keys(GAMES));
  const MOVED = ['yacht', 'mini', 'gsk', 'draw', 'holdem', 'bluff']; // 옮기기 과제가 끝날 때마다 한 줄씩 늘린다
  assert.deepEqual(Object.keys(GAMES).filter((k) => isFramed(k)).sort(), [...MOVED].sort());
  assert.deepEqual(visibleModes({}, ''), ['holdem', 'bluff']);
  assert.deepEqual(visibleModes({ liar: 'on', yacht: 'test', mini: 'test' }, '?mini=1'), ['holdem', 'bluff', 'liar', 'mini']);
});
