import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomShell } from '../../server/room/shell.js';
import { GAMES } from '../../shared/games.js';
import { SERVER_GAMES } from '../../server/games.js';
import { stripSizeMark, intRng } from '../../server/liar/room.js';

const ENTRY = { mode: 'liar', ...GAMES.liar, ...SERVER_GAMES.liar };
const sentence = (e) => (e && typeof e === 'object' ? e.msg : e ?? null);

// 공용 방 틀(Shell) 안의 라이어 게임을 예전 방 객체 모양으로 보여 주는 시험용 겉옷.
// 오류는 {msg, code} 대신 문장(성공은 null)으로 돌려준다. 채팅 속도 제한은 Shell 시험(test/room)이 보므로 여기서는 매번 비운다.
function createLiarRoom(hub, code) {
  hub.award ??= (room, mode, rows) => (hub.awards ??= []).push({ mode, rows });
  const shell = createRoomShell(hub, code, ENTRY);
  const impl = shell.impl;
  const ready = (s) => { s.chatTimes = []; s.lastSent ??= {}; s.editTimes ??= []; return s; };
  return {
    shell, impl,
    get members() { return shell.members; },
    get hostId() { return shell.hostId; },
    get phase() { return impl.phase(); },
    get game() { return impl.game; },
    get settings() { return impl.settings; },
    get scores() { return impl.scores; },
    get round() { return impl.round; },
    get settledGame() { return impl.settledGame; },
    get citizenEntry() { return impl.citizenEntry; },
    set citizenEntry(v) { impl.citizenEntry = v; },
    sync: () => impl.sync(),
    view: (id) => shell.view(id),
    join: (s) => sentence(shell.join(ready(s))),
    leave: (id) => shell.leave(id),
    setConnected: (id, on) => shell.setConnected(id, on),
    start: (id) => sentence(shell.start(id)),
    kick: (by, id) => sentence(shell.kick(by, id)),
    lg: (s, m) => sentence(shell.request(ready(s), { t: 'lg', ...m })),
    set: (s, patch) => sentence(shell.request(ready(s), { t: 'set', patch })),
    chat: (s, text) => sentence(shell.request(ready(s), { t: 'chat', text })) ?? undefined,
    mediaBlocked: (s, k) => sentence(impl.mediaBlocked(s, k)),
    play: (s, action) => (action.type === 'end' ? sentence(shell.request(ready(s), { t: 'lg', a: 'end' })) : 'unsupported'),
    flush: () => shell.flush(),
    faceChanged: (s, prev) => shell.faceChanged(s, prev),
    sendExtras: (s) => shell.sendExtras(s),
    push: (e) => shell.push(e),
  };
}

function setup(n = 3) {
  const out = [];
  const hub = {
    send: (s, m) => out.push({ to: s.id, m }),
    sendMe() {}, sendRooms() {}, persist() {}, roomsChanged() {},
    timers: { setTimeout: () => 1, clearTimeout() {} },
    guard: (f) => f, now: () => 1000, rng: () => 0,
    timing: { grace: 60000, roomGc: 60000 },
    rooms: new Map(), sessions: new Map(),
  };
  const room = createLiarRoom(hub, 'ABCD');
  const ss = [];
  for (let i = 0; i < n; i++) {
    const s = { id: 'u' + i, user: { name: 'N' + i, avatar: 'av' + i }, conn: {}, room: null };
    hub.sessions.set(s.id, s);
    assert.equal(room.join(s), null);
    ss.push(s);
  }
  out.length = 0;
  return { room, ss, out, hub };
}
const host = (x) => x.ss[0];

test('초기 주제: mine 11개 전부 켜짐, 단어 없음', () => {
  const { room } = setup();
  assert.equal(room.settings.topics.length, 11);
  assert.ok(room.settings.topics.every((t) => t.on === true));
  const json = JSON.stringify(room.view('u0'));
  assert.ok(!json.includes('짜장면'));
  assert.ok(!json.includes('citizenEntry') && !json.includes('liarEntry'));
  assert.ok(!json.includes('avatar') && !json.includes('av0'));
  assert.ok(!JSON.stringify(room.view('u0').wait).match(/citizen|liarWord|alt/), 'wait 에 단어·역할이 없다');
});

test('설정: 칸마다 성공', () => {
  const x = setup();
  const r = (m) => x.room.lg(host(x), { a: 'settings', ...m });
  assert.equal(r({ liarMode: 'notice' }), null);
  assert.equal(x.room.settings.liarMode, 'notice');
  assert.equal(r({ topicMode: 'host' }), null);
  assert.equal(x.room.settings.topicMode, 'host');
  assert.equal(r({ goal: 15 }), null);
  assert.equal(x.room.settings.goal, 15);
  assert.equal(r({ times: { speak: 45, guess: 30 } }), null);
  assert.deepEqual(
    [x.room.settings.times.speak, x.room.settings.times.guess, x.room.settings.times.discuss], [45, 30, 90]);
  const name = x.room.settings.topics[2].name;
  assert.equal(r({ topics: [{ name, on: false }] }), null);
  assert.equal(x.room.settings.topics[2].on, false);
  assert.equal(r({ topicMode: 'host', nextTopic: name }), null);
  assert.equal(x.room.settings.nextTopic, name);
  assert.equal(r({ nextTopic: null }), null);
  assert.equal(x.room.settings.nextTopic, null);
  assert.ok(x.out.some((o) => o.m.t === 'room'));
});

test('설정: 칸마다 거절하고 아무것도 바뀌지 않음', () => {
  const x = setup();
  const before = JSON.stringify(x.room.settings);
  const r = (m) => x.room.lg(host(x), { a: 'settings', ...m });
  for (const bad of [
    { liarMode: 'x' }, { topicMode: 'x' }, { wordSet: 'zzz' }, { goal: 7 },
    { times: { speak: 31 } }, { times: { nope: 1 } }, { times: null },
    { nextTopic: '없는주제' }, { topics: 'x' },
  ]) {
    assert.equal(typeof r(bad), 'string', JSON.stringify(bad));
  }
  assert.equal(r({ liarMode: 'notice', goal: 7 }) !== null, true);
  assert.equal(JSON.stringify(x.room.settings), before);
});

test('설정: 방장 아님·단계 아님 거절', () => {
  const x = game3();
  assert.equal(typeof x.room.lg(x.ss[1], { a: 'settings', goal: 10 }), 'string');
  assert.equal(typeof x.room.set(x.ss[1], { goal: 10 }), 'string');
  assert.equal(x.room.settings.goal, 0);
  assert.equal(x.room.start('u0'), null); // 진행 중
  assert.equal(typeof x.room.lg(host(x), { a: 'settings', goal: 10 }), 'string');
  assert.equal(typeof x.room.set(host(x), { goal: 10 }), 'string');
  x.room.game.phase = 'result'; x.room.sync(); // 결과 화면도 대기 상태(D5)
  assert.equal(x.room.set(host(x), { goal: 10 }), null);
  assert.equal(x.room.settings.goal, 10);
});

test('공통 set: 중첩 시간·고른 주제 이름 배열·옛 [{name,on}] 모양을 모두 받고, 거절하면 아무것도 안 바뀐다', () => {
  const x = setup();
  const names = x.room.settings.topics.map((t) => t.name);
  assert.equal(x.room.set(host(x), { times: { speak: 45 } }), null);
  assert.equal(x.room.settings.times.speak, 45);
  assert.equal(x.room.set(host(x), { topics: names.slice(0, 2) }), null);
  assert.deepEqual(x.room.settings.topics.filter((t) => t.on).map((t) => t.name), names.slice(0, 2));
  assert.equal(x.room.set(host(x), { topics: [{ name: names[5], on: true }] }), null);
  assert.equal(x.room.settings.topics.filter((t) => t.on).length, 3);
  const before = JSON.stringify(x.room.settings);
  assert.equal(x.room.set(host(x), { topics: [] }), '주제를 하나 이상 켜 주세요.');
  assert.equal(x.room.set(host(x), { topics: ['없는주제'] }), '주제를 하나 이상 켜 주세요.');
  assert.equal(typeof x.room.set(host(x), { times: { speak: 31 } }), 'string');
  assert.equal(typeof x.room.set(host(x), 'x'), 'string');
  assert.equal(JSON.stringify(x.room.settings), before);
  // wait.set 은 화면이 그릴 방 설정 사본(단어·역할 없음)
  const w = x.room.view('u1').wait;
  assert.equal(w.can, true);
  assert.equal(w.why, null);
  assert.deepEqual(w.set, JSON.parse(JSON.stringify(x.room.settings)));
  assert.deepEqual(w.own, {});
});

test('묶음을 바꾸면 주제 11개 <-> 10개, 전부 켜짐, nextTopic 비움', () => {
  const x = setup();
  const r = (m) => x.room.lg(host(x), { a: 'settings', ...m });
  const first = x.room.settings.topics[0].name;
  r({ topics: [{ name: first, on: false }], nextTopic: first });
  assert.equal(r({ wordSet: 'star' }), null);
  assert.equal(x.room.settings.wordSet, 'star');
  assert.equal(x.room.settings.topics.length, 10);
  assert.ok(x.room.settings.topics.every((t) => t.on));
  assert.equal(x.room.settings.nextTopic, null);
  assert.equal(r({ wordSet: 'mine' }), null);
  assert.equal(x.room.settings.topics.length, 11);
});

test('주제: 마지막 하나 끄기 거절, 없는 이름은 무시', () => {
  const x = setup();
  const r = (m) => x.room.lg(host(x), { a: 'settings', ...m });
  const names = x.room.settings.topics.map((t) => t.name);
  assert.equal(r({ topics: names.slice(1).map((name) => ({ name, on: false })) }), null);
  assert.equal(x.room.settings.topics.filter((t) => t.on).length, 1);
  assert.equal(r({ topics: [{ name: names[0], on: false }] }), '주제를 하나 이상 켜 주세요.');
  assert.equal(x.room.settings.topics.filter((t) => t.on).length, 1);
  assert.equal(r({ topics: [{ name: '없는주제', on: false }] }), null);
  assert.equal(x.room.settings.topics.length, 11);
});

test('kick 4가지 (옛 lg kick 과 공통 kick)', () => {
  const x = game3();
  assert.equal(typeof x.room.lg(x.ss[1], { a: 'kick', id: 'u2' }), 'string'); // 방장 아님
  assert.equal(typeof x.room.kick('u1', 'u2'), 'string');
  assert.equal(typeof x.room.lg(host(x), { a: 'kick', id: 'u0' }), 'string'); // 자기 자신
  assert.equal(typeof x.room.kick('u0', 'u0'), 'string');
  assert.equal(typeof x.room.lg(host(x), { a: 'kick', id: 'nobody' }), 'string'); // 없는 사람
  assert.equal(typeof x.room.kick('u0', 'nobody'), 'string');
  x.room.start('u0');
  assert.equal(typeof x.room.lg(host(x), { a: 'kick', id: 'u2' }), 'string'); // 방 대기 아님
  assert.equal(typeof x.room.kick('u0', 'u2'), 'string');
  x.room.lg(host(x), { a: 'end' }); // 방 대기로
  x.out.length = 0;
  assert.equal(x.room.lg(host(x), { a: 'kick', id: 'u2' }), null);
  assert.equal(x.room.members.length, 2);
  const msgs = x.out.filter((o) => o.to === 'u2').map((o) => o.m);
  assert.deepEqual(msgs[0], { t: 'error', msg: '방장이 내보냈습니다.', code: 'lg_kicked' });
  assert.ok(msgs.some((m) => m.t === 'room' && m.state === null));
  assert.equal(x.room.kick('u0', 'u1'), null); // 공통 kick
  assert.equal(x.room.members.length, 1);
});

test('faceChanged: 전원에게 한 번씩, 사진 포함', () => {
  const x = setup();
  x.ss[1].user.avatar = 'new';
  x.room.faceChanged(x.ss[1]);
  const faces = x.out.filter((o) => o.m.t === 'event' && o.m.e.k === 'faces');
  assert.equal(faces.length, 3);
  assert.deepEqual(faces.map((f) => f.to).sort(), ['u0', 'u1', 'u2']);
  assert.deepEqual(faces[0].m.e.items, [{ id: 'u1', avatar: 'new', look: {} }]);
  assert.equal(x.out.filter((o) => o.m.t === 'room').length, 0);
});

// ---------- R1b: 판 진행 ----------

// Fake clock + fake timers so whole rounds run synchronously.
function game3(n = 3, setupSettings) {
  const out = [];
  const clock = { now: 1_000_000 };
  const timers = new Map();
  let seq = 0;
  const hub = {
    send: (s, m) => out.push({ to: s.id, m }),
    sendMe() {}, sendRooms() {}, persist() {}, roomsChanged() {},
    timers: {
      setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: clock.now + ms }); return seq; },
      clearTimeout: (id) => { timers.delete(id); },
    },
    guard: (f) => f, now: () => clock.now, rng: () => 0,
    timing: { grace: 60000, roomGc: 60000 },
    rooms: new Map(), sessions: new Map(),
  };
  const room = createLiarRoom(hub, 'ABCD');
  const ss = [];
  for (let i = 0; i < n; i++) {
    const s = { id: 'u' + i, user: { name: 'N' + i, avatar: null }, conn: {}, room: null };
    hub.sessions.set(s.id, s);
    room.join(s);
    ss.push(s);
  }
  if (setupSettings) setupSettings(room);
  out.length = 0;
  const x = { room, ss, out, timers, clock, hub };
  // Fire the single game timer; the game timer count must always be 0 or 1.
  x.fire = () => {
    assert.ok(timers.size <= 1, `timers=${timers.size}`);
    const [id, t] = [...timers.entries()][0];
    timers.delete(id);
    clock.now = Math.max(clock.now, t.at);
    t.fn();
    assert.ok(timers.size <= 1);
  };
  x.until = (phase, max = 60) => {
    for (let i = 0; i < max && room.phase !== phase; i++) x.fire();
    assert.equal(room.phase, phase);
  };
  x.liar = () => room.game.liarId;
  x.byId = (id) => ss.find((s) => s.id === id);
  x.lg = (id, m) => room.lg(x.byId(id), m);
  x.speakAll = () => {
    for (let i = 0; i < n; i++) {
      const sp = room.game.order[room.game.speakerIdx];
      assert.equal(x.lg(sp, { a: 'say', text: `설명${i}` }), null);
      assert.equal(room.view(sp).speakDone, true);   // 3초 머문 뒤 다음 차례(타이머 하나)
      x.fire();
    }
  };
  return x;
}

test('start 거절: 방장 아님 / 2명 / 주제 미선택 / 진행 중', () => {
  const x = game3(2);
  assert.equal(x.room.start('u1'), '방장만 시작할 수 있습니다.');
  assert.equal(x.room.start('u0'), '3명 이상 필요합니다.');
  const y = game3(3, (r) => { r.settings.topicMode = 'host'; });
  assert.equal(y.room.start('u0'), '주제를 먼저 골라 주세요.');
  assert.equal(y.timers.size, 0);
  const z = game3(3);
  assert.equal(z.room.start('u0'), null);
  assert.equal(z.room.round, 1);
  assert.equal(z.room.start('u0'), '이미 게임이 진행 중입니다.');
  assert.equal(z.timers.size, 1);
});

test('start: 주제 직접 고르기는 쓰고 나면 비워짐', () => {
  const name = game3().room.settings.topics[1].name;
  const x = game3(3, (r) => { r.settings.topicMode = 'host'; r.settings.nextTopic = name; });
  assert.equal(x.room.start('u0'), null);
  assert.equal(x.room.game.topic, name);
  assert.equal(x.room.settings.nextTopic, null);
});

test('길 1: 라이어 처형 + 정답 입력 → 결과, liarName 은 라이어가 나가도 남음', () => {
  const x = game3(4);
  assert.equal(x.room.start('u0'), null);
  assert.equal(x.room.view('u0').result, null);
  x.until('speak');
  x.speakAll();
  assert.equal(x.room.phase, 'discuss');
  const liar = x.liar();
  for (const s of x.ss) {
    if (s.id === liar) continue;
    assert.equal(x.lg(s.id, { a: 'vote', target: liar }), null);
  }
  x.lg(liar, { a: 'vote', target: x.ss.find((s) => s.id !== liar).id });
  x.until('defense');
  x.until('judge');
  for (const s of x.ss) if (s.id !== liar) x.lg(s.id, { a: 'judge', v: 'yes' });
  x.until('unmask');
  assert.equal(x.room.view('u0').result, null);
  x.until('guess');
  // a different (alternate) name is graded as correct
  x.room.citizenEntry = { w: '짜장면', alt: ['자장면'] };
  assert.equal(x.room.view('u0').words, null);
  assert.equal(x.lg(liar, { a: 'guess', text: '자장면' }), null);
  assert.equal(x.room.phase, 'answer');
  assert.equal(x.timers.size, 1);
  assert.equal(x.room.view('u0').result, null);
  assert.deepEqual(x.room.view('u0').guess, { text: '자장면', correct: true });
  assert.equal(x.room.view('u0').words.citizen, x.room.game.citizenWord);
  assert.deepEqual(x.room.view(liar).words, x.room.view('u1').words);
  assert.equal(x.room.settledGame, null); // 점수는 result 진입 때 한 번
  x.until('result');
  assert.equal(x.timers.size, 0);
  assert.equal(x.room.settledGame, x.room.game);
  const r = x.room.view('u0').result;
  assert.equal(r.guessed, true);
  assert.equal(r.liarName, x.byId(liar).user.name);
  x.room.leave(liar);
  const other = x.ss.find((s) => s.id !== liar).id;
  assert.equal(x.room.view(other).result.liarName, x.byId(liar).user.name);
  assert.equal(x.room.phase, 'result'); // stays until the next start
  assert.equal(x.room.start(x.room.hostId), null);
  assert.equal(x.room.round, 2);
});

test('길 2: 살림 뒤 다시 토론', () => {
  const x = game3();
  x.room.start('u0');
  x.until('speak');
  x.speakAll();
  const target = x.room.game.order[0];
  for (const s of x.ss) if (s.id !== target) x.lg(s.id, { a: 'vote', target });
  x.until('judge');
  for (const s of x.ss) if (s.id !== target) x.lg(s.id, { a: 'judge', v: 'no' });
  x.until('discuss');
  assert.equal(x.room.view('u0').accuseNo, 2);
  assert.equal(x.timers.size, 1);
});

test('길 3: 투표 무산 → 판은 끝나지 않고 연장 투표 → 방장 끝내기로만 끝난다', () => {
  const x = game3();
  x.room.start('u0');
  x.until('speak');
  x.speakAll();
  x.until('discuss');
  for (let i = 1; i <= 3; i++) { // nobody voted: every time-out extends the vote instead of ending the game
    x.fire();
    assert.equal(x.room.phase, 'discuss');
    assert.equal(x.room.view('u0').extendNo, i);
  }
  assert.equal(x.room.view('u0').result, null);
  assert.equal(x.room.phase, 'discuss');
  assert.equal(x.lg('u0', { a: 'end' }), null); // the host can still end it during an extended vote
  assert.equal(x.room.phase, 'lobby');
  assert.equal(x.timers.size, 0);
});

test('방장 end → 방 대기, 타이머 0개 / 방장 아니면 거절', () => {
  const x = game3();
  x.room.start('u0');
  assert.equal(x.lg('u1', { a: 'end' }), '방장만 끝낼 수 있습니다.');
  x.out.length = 0;
  assert.equal(x.lg('u0', { a: 'end' }), null);
  const notices = x.out.filter((o) => o.m.t === 'event' && o.m.e.k === 'chat' && o.m.e.text === '방장이 판을 끝냈습니다.');
  assert.deepEqual(notices.map((o) => o.to).sort(), ['u0', 'u1', 'u2']); // everyone, once
  assert.equal(notices[0].m.e.kind, 'talk');
  assert.equal(x.room.phase, 'lobby');
  assert.equal(x.room.view('u0').result, null);
  assert.equal(x.timers.size, 0);
  assert.equal(x.lg('u0', { a: 'end' }), '진행 중인 판이 없습니다.');
});

test('word 방식: 라이어와 시민이 받은 메시지 모양이 unmask 전까지 같고 비밀이 없다', () => {
  const x = game3(3, (r) => { r.settings.liarMode = 'word'; });
  x.room.start('u0');
  x.until('speak');
  x.speakAll();
  const liar = x.liar();
  const cit = x.ss.find((s) => s.id !== liar).id;
  for (const s of x.ss) x.lg(s.id, { a: 'vote', target: s.id === liar ? cit : liar });
  x.until('defense');
  const shape = (v) => (Array.isArray(v) ? `[${v.length}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).map((k) => `${k}:${shape(v[k])}`).join(',')}}` : typeof v);
  const seq = (id) => x.out.filter((o) => o.to === id).map((o) => o.m);
  const cut = (msgs) => {
    const i = msgs.findIndex((m) => m.t === 'room' && ['unmask', 'guess', 'result'].includes(m.state.phase));
    return i < 0 ? msgs : msgs.slice(0, i);
  };
  const a = cut(seq(liar));
  const b = cut(seq(cit));
  assert.ok(a.length > 5);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) assert.equal(shape(a[i]), shape(b[i]), `msg ${i}`);
  const g = x.room.game;
  const citText = JSON.stringify(b);
  const liarText = JSON.stringify(a);
  for (const t of [citText, liarText]) {
    assert.ok(!/citizenEntry|liarEntry|"alt"/.test(t));
  }
  assert.ok(!citText.includes(`"${g.liarWord}"`));
  assert.ok(!liarText.includes(`"${g.citizenWord}"`));
  assert.ok(a.some((m) => m.t === 'room' && m.state.my.word === g.liarWord));
});

test('say 글 앞 크기 표시는 떼고 엔진에 넘김', () => {
  assert.equal(stripSizeMark('**조용한 곳'), '조용한 곳');
  assert.equal(stripSizeMark('#a'), 'a');
  assert.equal(stripSizeMark('*a'), 'a');
  assert.equal(stripSizeMark('***a'), 'a');
  assert.equal(stripSizeMark('# a'), 'a');
  assert.equal(stripSizeMark('#'), '#');
  assert.equal(stripSizeMark('***'), '***');
  assert.equal(stripSizeMark('a*'), 'a*');
  const x = game3();
  x.room.start('u0');
  x.until('speak');
  const sp = x.room.game.order[0];
  assert.equal(x.lg(sp, { a: 'say', text: '**조용한 곳' }), null);
  const v = x.room.view(sp);
  assert.equal(v.firstSays[0].text, '조용한 곳');
  const chat = x.out.find((o) => o.m.t === 'event' && o.m.e.k === 'chat').m.e;
  assert.equal(chat.name, x.byId(sp).user.name);
  assert.equal(chat.text, '조용한 곳');
  assert.equal(chat.kind, 'say');
});

test('lg: 맨 앞에서 checkLg', () => {
  const x = game3();
  assert.equal(x.room.lg(x.ss[0], null), '잘못된 요청입니다.');
  assert.equal(x.room.lg(x.ss[0], { a: 'zzz' }), '잘못된 요청입니다.');
  assert.equal(x.room.lg(x.ss[0], { a: 'settings', times: { speak: 99 } }), '고를 수 없는 시간입니다.');
  assert.equal(x.room.lg(x.ss[0], { a: 'vote', target: 5 }), '잘못된 요청입니다.');
  assert.equal(x.room.lg(x.ss[0], { a: 'say', text: 'hi' }), '진행 중인 판이 없습니다.');
});

test('관전자: 판에 없는 사람은 spectating, seat 는 players 에만', () => {
  const x = game3(3);
  const s = { id: 'u9', user: { name: 'N9', avatar: null }, conn: {}, room: null };
  x.hub.sessions.set(s.id, s);
  x.room.join(s);
  x.room.setConnected('u9', false);
  x.out.length = 0;
  x.room.start('u0');
  const v = x.room.view('u0');
  assert.equal(v.players.find((p) => p.id === 'u9').spectating, true);
  assert.equal(v.players.find((p) => p.id === 'u9').seat, null);
  assert.equal(typeof v.players[0].seat, 'number');
  assert.ok(!('seats' in v));
});

test('hub.rng 는 0..1 실수(진행자·myown): 방이 정수로 바꿔 판을 시작한다', () => {
  const x = setup();
  x.hub.rng = () => 0.73;
  assert.equal(x.room.lg && x.room.start('u0'), null);
  assert.equal(x.room.phase, 'reveal');
  const r = intRng(() => 0.999999);
  for (const n of [1, 3, 7, 11]) { const v = r(n); assert.ok(Number.isInteger(v) && v >= 0 && v < n); }
  assert.equal(intRng(() => 0)(5), 0);
});

// ---- R1c: 단계별 글·이모티콘 권한 (GDD 4-4) ----
function permRoom() {
  const x = game3(3);
  const s = { id: 'u9', user: { name: 'N9', avatar: null }, conn: {}, room: null };
  x.hub.sessions.set(s.id, s);
  x.spec = s;
  x.joinSpec = () => x.room.join(s);
  return x;
}
const chats = (x) => x.out.filter((o) => o.m.t === 'event' && o.m.e.k === 'chat');

test('권한: 방 대기·결과는 전원(관전자 포함) 글·이모티콘 가능', () => {
  const x = permRoom();
  x.joinSpec();
  x.out.length = 0;
  assert.equal(x.room.chat(x.ss[0], 'hi'), undefined);
  assert.equal(x.room.chat(x.spec, 'hi'), undefined);
  assert.ok(chats(x).every((o) => o.m.e.kind === 'talk'));
  for (const k of ['emote', 'pemote', 'snd', 'sndAdd']) assert.equal(x.room.mediaBlocked(x.spec, k), null);
  x.room.start('u0');
  x.room.game.phase = 'result'; x.room.sync();
  assert.equal(x.room.chat(x.spec, 'gg'), undefined);
  assert.equal(x.room.mediaBlocked(x.spec, 'snd'), null);
});

test('권한: 단계별 글 (speak 거절 / discuss 전원 talk / 변론류 지목자만 plea / unmask·guess 거절)', () => {
  const x = permRoom();
  x.room.start('u0');
  x.until('speak');
  const sp = x.room.game.order[x.room.game.speakerIdx];
  assert.equal(typeof x.room.chat(x.byId(sp), 'hi'), 'string'); // 차례인 사람도 chat 은 거절
  x.out.length = 0;
  x.room.chat(x.ss[0], 'hi');
  assert.equal(chats(x).length, 0);
  x.speakAll();
  assert.equal(x.room.phase, 'discuss');
  x.out.length = 0;
  assert.equal(x.room.chat(x.ss[1], 'yo'), undefined);
  assert.equal(chats(x)[0].m.e.kind, 'talk');
  const g = x.room.game;
  g.accused = 'u1';
  for (const ph of ['defense', 'judge', 'judged']) {
    g.phase = ph; x.room.sync();
    x.out.length = 0;
    assert.equal(typeof x.room.chat(x.ss[0], 'no'), 'string', ph);
    assert.equal(chats(x).length, 0);
    assert.equal(x.room.chat(x.ss[1], 'plea'), undefined, ph);
    assert.equal(chats(x)[0].m.e.kind, 'plea');
  }
  g.phase = 'unmask'; x.room.sync();
  for (const k of ['emote', 'pemote', 'snd', 'sndAdd']) assert.equal(typeof x.room.mediaBlocked(x.ss[0], k), 'string', k);
  assert.equal(typeof x.room.chat(x.ss[1], 'x'), 'string');
  g.phase = 'guess'; x.room.sync();
  assert.equal(typeof x.room.chat(x.ss[2], 'x'), 'string');
  assert.equal(x.room.mediaBlocked(x.ss[2], 'emote'), null);
  for (const k of ['pemote', 'snd', 'sndAdd']) assert.equal(typeof x.room.mediaBlocked(x.ss[2], k), 'string', k);
  g.phase = 'answer'; x.room.sync();
  assert.equal(x.room.chat(x.ss[2], 'x'), '정답 공개 중에는 글을 쓸 수 없습니다.');
  for (const k of ['emote', 'pemote', 'snd', 'sndAdd']) assert.equal(typeof x.room.mediaBlocked(x.ss[2], k), 'string', k);
});

test('권한: 판 도중 들어온 관전자는 글·pemote·snd·sndAdd 거절, emote 가능, 판이 끝나면 다시 가능', () => {
  const x = permRoom();
  x.room.start('u0');
  x.joinSpec();
  x.until('speak');
  x.speakAll();
  assert.equal(x.room.phase, 'discuss');
  assert.equal(typeof x.room.chat(x.spec, 'x'), 'string');
  for (const k of ['pemote', 'snd', 'sndAdd']) assert.equal(typeof x.room.mediaBlocked(x.spec, k), 'string', k);
  assert.equal(x.room.mediaBlocked(x.spec, 'emote'), null);
  assert.equal(x.room.chat(x.ss[0], 'x'), undefined); // 참가자는 가능
  x.room.play(x.ss[0], { type: 'end' });
  assert.equal(x.room.phase, 'lobby');
  assert.equal(x.room.chat(x.spec, 'x'), undefined);
});

// ---- R2a: 끊김·돌아옴·나감을 엔진에 알리기 ----
const evs = (x, k) => x.out.filter((o) => o.m.t === 'event' && o.m.e.k === k);
function atDiscuss(n = 4) {
  const x = game3(n);
  assert.equal(x.room.start('u0'), null);
  x.until('speak');
  x.speakAll();
  assert.equal(x.room.phase, 'discuss');
  return x;
}
const other = (x, ...not) => x.ss.map((s) => s.id).filter((id) => !not.includes(id));

test('R2a: 차례인 사람이 끊기면 다음 차례(turn 알림), 타이머는 하나', () => {
  const x = game3(4);
  x.room.start('u0');
  x.until('speak');
  const g = x.room.game;
  const first = g.order[g.speakerIdx];
  x.out.length = 0;
  x.room.setConnected(first, false);
  assert.notEqual(g.order[g.speakerIdx], first);
  assert.ok(evs(x, 'turn').length > 0);
  assert.ok(x.timers.size <= 2); // game timer + that player's 60s grace timer
  assert.equal(x.room.view('u0').speaker, g.order[g.speakerIdx]);
});

test('R2a: 한 명이 끊긴 채 나머지 전원이 찍으면 5초로 단축', () => {
  const x = atDiscuss(4);
  const away = other(x, x.liar())[0];
  x.room.setConnected(away, false);
  x.clock.now += 31_000; // 첫 토론 보장 시간 지남
  const ids = other(x, away);
  for (const id of ids) assert.equal(x.lg(id, { a: 'vote', target: id === ids[0] ? ids[1] : ids[0] }), null);
  assert.equal(x.room.view('u0').phaseEndsAt, x.clock.now + 5000);
  assert.ok(x.timers.size <= 2); // game timer + the away player's grace timer
});

test('R2a: 60초 안에 돌아오면 같은 자리·제시어·awayUntil null', () => {
  const x = atDiscuss(4);
  const id = 'u2';
  const before = x.room.view(id);
  x.room.setConnected(id, false);
  assert.ok(x.room.view('u0').players.find((p) => p.id === id).awayUntil > 0);
  x.clock.now += 30_000;
  x.out.length = 0;
  x.room.setConnected(id, true);
  assert.ok(evs(x, 'back').length > 0);
  const after = x.room.view(id);
  assert.equal(after.my.word, before.my.word);
  assert.equal(after.players.find((p) => p.id === id).seat, before.players.find((p) => p.id === id).seat);
  assert.equal(after.players.find((p) => p.id === id).awayUntil, null);
  assert.equal(after.players.find((p) => p.id === id).spectating, false);
  assert.equal(x.room.game.away.length, 0);
});

test('R2a: 라이어가 끊긴 채 60초 → liarLeft, 시민 +1, liarName 남음', () => {
  const x = atDiscuss(4);
  const liar = x.liar();
  const name = x.byId(liar).user.name;
  x.room.setConnected(liar, false);
  const t = [...x.timers.values()].find((v) => v.at === x.clock.now + 60_000);
  assert.ok(t);
  x.clock.now += 60_000;
  const pair = [...x.timers.entries()].find(([, v]) => v === t);
  x.timers.delete(pair[0]);
  t.fn(); // grace expires -> leave
  assert.equal(x.room.phase, 'result');
  const o = other(x, liar)[0];
  const r = x.room.view(o).result;
  assert.equal(r.winner, 'citizens');
  assert.equal(r.reason, 'liarLeft');
  assert.equal(r.liarName, name);
  for (const id of other(x, liar)) assert.equal(r.delta[id], 1);
  assert.equal(x.timers.size, 0);
});

test('R2a: 시민이 나가 2명이 되면 void·tooFew', () => {
  const x = atDiscuss(3);
  const c = other(x, x.liar())[0];
  x.room.leave(c);
  assert.equal(x.room.phase, 'result');
  const r = x.room.view(x.liar()).result;
  assert.equal(r.winner, 'void');
  assert.equal(r.reason, 'tooFew');
  assert.equal(x.timers.size, 0);
});

test('R2a: 내보내기(kick)는 방 대기에서만 — 판 도중 나가기는 같은 길(drop)', () => {
  const x = atDiscuss(4);
  const c = other(x, x.liar(), 'u0')[0];
  x.room.leave(c);
  assert.ok(x.room.game.dropped.includes(c));
  assert.equal(x.room.phase, 'discuss');
  assert.ok(x.timers.size <= 1);
  // 대기실에서 kick 하면 엔진을 부르지 않는다
  const y = game3(3);
  assert.equal(y.room.kick('u0', 'u1'), null);
  assert.equal(y.room.game, null);
});

test('R2a: 판 도중 들어온 사람·빠졌다 돌아온 사람은 spectating, 다음 start 에는 참가', () => {
  const x = atDiscuss(4);
  const late = { id: 'u9', user: { name: 'N9', avatar: null }, conn: {}, room: null };
  x.hub.sessions.set(late.id, late);
  x.room.join(late);
  let v = x.room.view('u9');
  assert.equal(v.players.find((p) => p.id === 'u9').spectating, true);
  assert.equal(v.my.word, null);
  // 빠졌다가 같은 아이디로 다시 들어옴
  const c = other(x, x.liar(), 'u0')[0];
  x.room.leave(c);
  x.room.join(x.byId(c));
  v = x.room.view(c);
  assert.equal(v.players.find((p) => p.id === c).spectating, true);
  assert.equal(v.my.word, null);
  assert.equal(typeof x.room.chat(x.byId(c), 'x'), 'string');
  x.room.setConnected(c, false);
  x.room.setConnected(c, true); // 엔진은 부르지 않는다(오류 없이)
  x.room.play(x.ss[0], { type: 'end' });
  assert.equal(x.room.start('u0'), null);
  v = x.room.view('u0');
  assert.equal(v.players.find((p) => p.id === 'u9').spectating, false);
  assert.equal(v.players.find((p) => p.id === c).spectating, false);
});

test('R2a: 방장이 나가면 다음 사람이 방장, 결과 단계에서는 엔진을 부르지 않음', () => {
  const x = game3(4);
  x.room.leave('u0');
  assert.equal(x.room.hostId, 'u1');
  x.room.start('u1');
  x.until('speak');
  x.room.play(x.ss[1], { type: 'end' });
  x.room.start('u1');
  x.room.game.phase = 'result'; // 결과 단계
  const before = JSON.stringify(x.room.game.dropped);
  x.room.leave('u2');
  assert.equal(JSON.stringify(x.room.game.dropped), before);
  assert.equal(x.room.hostId, 'u1');
});

// ---- R2b: 방 점수 장부 ----
// 토론에서 전원이 라이어를 찍고, 찬반은 전원 yes, 라이어는 틀린 답 → 시민 승(rng 0 이라 라이어는 고정).
function finishRound(x, { vote = 'liar', guess = '틀린답' } = {}) {
  const liar = x.liar();
  const ids = x.room.game.players;
  const target = vote === 'liar' ? liar : ids.find((id) => id !== liar);
  for (const id of ids) x.lg(id, { a: 'vote', target: id === target ? ids.find((o) => o !== target) : target });
  let judged = false;
  for (let i = 0; i < 60 && x.room.phase !== 'result'; i++) {
    if (x.room.phase === 'judge' && !judged) {
      judged = true;
      for (const id of ids) if (id !== x.room.game.accused) x.lg(id, { a: 'judge', v: 'yes' });
    } else if (x.room.phase === 'guess') {
      x.room.citizenEntry = { w: '짜장면', alt: [] };
      x.lg(liar, { a: 'guess', text: guess });
    } else x.fire();
  }
  assert.equal(x.room.phase, 'result');
  return x.room.view('u0');
}
const scoreOf = (x, id) => x.room.view('u0').players.find((p) => p.id === id).score;
const withStats = (x) => { for (const s of x.ss) s.user.stats = { liar: { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 } }; return x; };
const sumOf = (x) => x.ss.map((s) => s.user.stats.liar.score);

test('R2b: 판 도중 score 불변·champions 없음, 결과에서 delta 만큼 쌓이고 두 판 누적', () => {
  const x = withStats(atDiscuss(4));
  x.room.settings.goal = 0;
  assert.ok(x.room.view('u0').players.every((p) => p.score === 0));
  assert.equal(x.room.view('u0').result, null);
  const v = finishRound(x);
  assert.equal(v.result.champions, null);
  for (const p of v.players) assert.equal(p.score, v.result.delta[p.id] ?? 0);
  const first = v.players.map((p) => p.score);
  assert.ok(first.some((n) => n > 0));
  assert.equal(x.room.start('u0'), null);
  assert.deepEqual(x.room.view('u0').players.map((p) => p.score), first); // 판 도중 그대로
  assert.equal(x.room.view('u0').result, null);
  x.until('speak'); x.speakAll();
  const v2 = finishRound(x);
  for (const p of v2.players) assert.equal(p.score, first[v2.players.indexOf(p)] + (v2.result.delta[p.id] ?? 0));
});

test('R2b: 음수 delta(-1)도 방 점수에 반영, 누적은 0 아래로 안 감, 나가면 누적 증가 + persist', () => {
  const x = withStats(atDiscuss(4));
  const persisted = [];
  x.hub.persist = (u) => persisted.push(u);
  x.room.scores.set('u1', { score: -1, flushed: 0 });
  x.room.flush();
  assert.equal(x.ss[1].user.stats.liar.score, 0);
  assert.equal(persisted.length, 1);
  x.room.scores.set('u2', { score: 4, flushed: 0 });
  x.room.leave('u2');
  assert.equal(x.ss[2].user.stats.liar.score, 4);
  assert.ok(persisted.includes(x.ss[2].user));
});

test('R2b (v0.12-1): 방 점수 -1에서 나갔다 돌아와 +2로 끝나면 누적은 +2', () => {
  const x = withStats(atDiscuss(4));
  x.room.scores.set('u1', { score: -1, flushed: 0 });
  x.room.leave('u1');
  assert.equal(x.ss[1].user.stats.liar.score, 0);
  x.room.join(x.ss[1]);
  assert.equal(scoreOf(x, 'u1'), -1);
  x.room.scores.get('u1').score = 2;
  x.room.leave('u1');
  assert.equal(x.ss[1].user.stats.liar.score, 2);
  x.room.flush();
  assert.equal(x.ss[1].user.stats.liar.score, 2);
});

test('R2b: 판 끝에 -1 이 나오면 방 점수가 -1', () => {
  const x = withStats(atDiscuss(4));
  const liar = x.liar();
  const wrong = other(x, liar)[0];
  const v = finishRound(x, { vote: 'wrong' });
  const neg = Object.entries(v.result.delta).filter(([, d]) => d < 0);
  assert.ok(neg.length > 0);
  for (const [id, d] of neg) assert.equal(v.players.find((p) => p.id === id).score, d);
  void wrong;
});

test('R2b: 다시 들어오면 방 점수 이어지고, 또 나가도 두 번 안 더함. flush() 두 번 = 한 번', () => {
  const x = withStats(atDiscuss(4));
  const v = finishRound(x);
  const id = other(x, x.liar())[0];
  const mine = v.players.find((p) => p.id === id).score;
  x.room.leave(id);
  assert.equal(x.byId(id).user.stats.liar.score, mine);
  x.room.join(x.byId(id));
  assert.equal(scoreOf(x, id), mine);
  x.room.leave(id);
  assert.equal(x.byId(id).user.stats.liar.score, mine);
  const before = sumOf(x);
  x.room.flush(); x.room.flush();
  const once = sumOf(x);
  x.room.flush();
  assert.deepEqual(sumOf(x), once);
  assert.ok(once.every((n, i) => n >= before[i]));
});

test('R2b: 목표 1: 닿으면 champions(공동 우승 포함), 다음 start 뒤 전원 0 + 누적에 더해짐', () => {
  const x = withStats(game3(4, (r) => { r.settings.goal = 5; }));
  x.room.scores.set('u0', { score: 4, flushed: 0 });
  x.room.scores.set('u1', { score: 4, flushed: 0 });
  x.room.start('u0'); x.until('speak'); x.speakAll();
  const v = finishRound(x);
  const top = Math.max(...v.players.map((p) => p.score));
  assert.ok(top >= 5);
  const exp = v.players.filter((p) => p.score === top).map((p) => p.id);
  assert.deepEqual([...v.result.champions].sort(), exp.sort());
  x.room.settings.goal = 0; // 나중에 설정이 바뀌어도 그 판의 값은 그대로
  assert.deepEqual([...x.room.view('u0').result.champions].sort(), exp);
  const scores = v.players.map((p) => p.score);
  assert.equal(x.room.start('u0'), null);
  assert.ok(x.room.view('u0').players.every((p) => p.score === 0));
  assert.deepEqual(sumOf(x), scores.map((n) => Math.max(0, n)));
});

test('R2b: 목표가 없으면 champions null 이고 점수는 쌓이기만', () => {
  const x = withStats(atDiscuss(4));
  x.room.scores.set('u0', { score: 99, flushed: 0 });
  const v = finishRound(x);
  assert.equal(v.result.champions, null);
  x.room.start('u0');
  assert.ok(x.room.view('u0').players.find((p) => p.id === 'u0').score >= 99);
});

test('R2b: 전적 4칸 — 시민 승 / 라이어 승 / 무효 판은 변화 없음 / 도중에 빠진 사람은 안 셈', () => {
  const x = withStats(atDiscuss(4));
  const liar = x.liar();
  finishRound(x);
  for (const s of x.ss) {
    const l = s.user.stats.liar;
    if (s.id === liar) assert.deepEqual([l.games, l.wins, l.liarGames, l.liarWins], [1, 0, 1, 0]);
    else assert.deepEqual([l.games, l.wins, l.liarGames, l.liarWins], [1, 1, 0, 0]);
  }
  // 라이어 승: 라이어가 정답을 맞힘 → 정답 단어를 알아낼 수 없으니 엔진 결과를 직접 확인하는 대신 투표를 다른 사람에게
  const y = withStats(atDiscuss(4));
  const l2 = y.liar();
  finishRound(y, { vote: 'wrong' });
  const w = y.room.view('u0').result.winner;
  const ll = y.byId(l2).user.stats.liar;
  assert.equal(w, 'liar');
  assert.equal(ll.liarWins, 1);
  assert.equal(ll.wins, 1);
  assert.equal(ll.liarGames, 1);
  // 무효
  const z = withStats(atDiscuss(3));
  z.room.leave(other(z, z.liar())[0]);
  assert.equal(z.room.view(z.liar()).result.winner, 'void');
  assert.ok(z.ss.every((s) => s.user.stats.liar.games === 0));
  // 도중에 빠진 사람은 안 셈
  const q = withStats(atDiscuss(5));
  const gone = other(q, q.liar())[0];
  q.room.leave(gone);
  finishRound(q);
  assert.equal(q.byId(gone).user.stats.liar.games, 0);
  assert.ok(q.ss.filter((s) => s.id !== gone).every((s) => s.user.stats.liar.games === 1));
});

test('R2b: 중간 입장은 0점, 전적도 없음', () => {
  const x = withStats(atDiscuss(4));
  const late = { id: 'u9', user: { name: 'N9', avatar: null, stats: { liar: { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 } } }, conn: {}, room: null };
  x.hub.sessions.set(late.id, late);
  x.room.join(late);
  assert.equal(x.room.view('u9').players.find((p) => p.id === 'u9').score, 0);
  finishRound(x);
  assert.equal(late.user.stats.liar.games, 0);
  assert.equal(x.room.view('u9').players.find((p) => p.id === 'u9').score, 0);
});

test('사진 바꾸기: 매체가 막힌 단계(unmask)의 새 사진은 풀릴 때까지 방에 안 나간다', () => {
  const x = permRoom();
  x.room.start('u0');
  x.until('speak');
  const g = x.room.game;
  g.phase = 'unmask'; x.room.sync();
  x.out.length = 0;
  const prev = x.ss[0].user.avatar;
  x.ss[0].user.avatar = 'NEWFACE';
  x.room.faceChanged(x.ss[0], prev);
  const faces = () => x.out.filter((o) => o.m.t === 'event' && o.m.e.k === 'faces').flatMap((o) => o.m.e.items);
  assert.equal(faces().length, 0);
  x.room.sendExtras(x.ss[1]);
  assert.equal(faces().find((i) => i.id === 'u0').avatar, prev);
  x.out.length = 0;
  g.phase = 'discuss'; x.room.sync(); x.room.push();
  assert.equal(faces().find((i) => i.id === 'u0').avatar, 'NEWFACE');
  // 막히지 않은 단계에서는 바로
  x.out.length = 0;
  x.ss[0].user.avatar = 'AGAIN';
  x.room.faceChanged(x.ss[0], 'NEWFACE');
  assert.equal(faces()[0].avatar, 'AGAIN');
});

// ---- 공용 방 틀로 옮긴 뒤 새로 생긴 약속 ----

test('코인: 판이 결과에 닿으면 ctx.finish 가 한 번 (끝까지 한 사람만, 라이어 opp=시민 수), 무효 판은 0번', () => {
  const x = withStats(atDiscuss(4));
  const liar = x.liar();
  finishRound(x);
  assert.equal(x.hub.awards.length, 1);
  assert.equal(x.hub.awards[0].mode, 'liar');
  const rows = x.hub.awards[0].rows;
  assert.deepEqual(rows.map((r) => r.id).sort(), ['u0', 'u1', 'u2', 'u3']);
  assert.equal(rows.find((r) => r.id === liar).opp, 3);
  assert.ok(rows.filter((r) => r.id !== liar).every((r) => r.opp === 1));
  // 다음 판도 한 번씩
  x.room.start('u0'); x.until('speak'); x.speakAll();
  finishRound(x);
  assert.equal(x.hub.awards.length, 2);
  // 무효 판(2명만 남음)은 지급 없음
  const z = withStats(atDiscuss(3));
  z.room.leave(other(z, z.liar())[0]);
  assert.equal(z.room.view(z.liar()).result.winner, 'void');
  assert.equal((z.hub.awards ?? []).length, 0);
  // 도중에 나간 사람은 지급 대상이 아니다
  const q = withStats(atDiscuss(5));
  const gone = other(q, q.liar())[0];
  q.room.leave(gone);
  finishRound(q);
  assert.ok(!q.hub.awards[0].rows.some((r) => r.id === gone));
});

test('관리자 건너뛰기: 돌고 있는 타이머가 있으면 지금 넘기고, 대기실·결과에서는 false', () => {
  const x = game3();
  assert.equal(x.room.impl.skipPhase(), false); // 대기실
  x.room.start('u0');
  assert.equal(x.room.phase, 'reveal');
  assert.equal(x.room.impl.skipPhase(), true);
  assert.equal(x.room.phase, 'speak');
  assert.ok(x.timers.size <= 1);
  x.room.game.phase = 'result'; x.room.sync();
  assert.equal(x.room.impl.skipPhase(), false);
});

test('모두 나가면 판이 정리된다(빈 방에 남은 판이 다음 사람에게 보이지 않는다)', () => {
  const x = game3(3);
  x.room.start('u0');
  assert.equal(x.timers.size, 1);
  for (const s of x.ss) x.room.leave(s.id);
  assert.equal(x.room.game, null);
  assert.equal(x.room.phase, 'lobby');
  assert.ok([...x.timers.values()].every((t) => t.at >= x.clock.now + 60_000)); // 남은 것은 빈 방 지우기(60초) 뿐
});

test('채팅 80자: 80자는 보내지고 81자는 막힌다(화면 입력 한도 80과 같다)', () => {
  const x = game3();
  assert.equal(x.room.chat(x.ss[0], '가'.repeat(80)), undefined);
  assert.equal(x.room.chat(x.ss[0], '가'.repeat(81)), '채팅은 1~80자여야 합니다.');
});

test('설정: 첫 설명 바퀴 수는 1~3 만 받고, 판에 전해지고, view 에 나간다', () => {
  const x = game3();
  assert.equal(x.room.settings.speakRounds, 1);
  assert.equal(typeof x.lg('u0', { a: 'settings', speakRounds: 4 }), 'string');
  assert.equal(x.room.settings.speakRounds, 1);
  assert.equal(x.lg('u0', { a: 'settings', speakRounds: 2 }), null);
  assert.equal(x.room.settings.speakRounds, 2);
  x.room.start('u0');
  assert.equal(x.room.game.speakRounds, 2);
  assert.equal(x.room.view('u0').speakRounds, 2);
  assert.equal(x.room.view('u0').speakRound, 1);
});
