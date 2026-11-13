// 갱식마인드 방(server/draw/room.js) 시험: 가짜 세션·가짜 타이머·가짜 단어 뽑기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawRoom } from '../../server/draw/room.js';

function setup(n = 3, { saveDraw } = {}) {
  let now = 1_000_000;
  let tid = 0;
  const pending = [];
  const out = []; // {to, m}
  const persisted = [];
  const hub = {
    send: (s, m) => out.push({ to: s.id, m }),
    sendMe() {}, sendRooms() {}, roomsChanged() {},
    persist: (u) => persisted.push(u),
    timers: {
      setTimeout: (fn, ms) => { const id = ++tid; pending.push({ id, at: now + ms, fn }); return id; },
      clearTimeout: (id) => { const i = pending.findIndex((p) => p.id === id); if (i >= 0) pending.splice(i, 1); },
    },
    guard: (f) => () => f(),
    now: () => now, rng: () => 0,
    timing: { grace: 60000, roomGc: 60000 },
    rooms: new Map(), sessions: new Map(),
  };
  let k = 0;
  const picker = {
    pick: () => { k++; return ['a', 'b', 'c'].map((x) => ({ w: `ZZ${k}${x}`, topic: '음식', alt: [] })); },
    use() {},
  };
  const room = createDrawRoom(hub, 'ABCD', { picker, saveDraw });
  const ss = [];
  const addUser = (i) => {
    const s = { id: 'u' + i, user: { name: 'N' + i, avatar: 'av' + i, stats: {} }, conn: {}, room: null };
    hub.sessions.set(s.id, s);
    assert.equal(room.join(s), null);
    return s;
  };
  for (let i = 0; i < n; i++) ss.push(addUser(i));
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      pending.sort((a, b) => a.at - b.at);
      const p = pending[0];
      if (!p || p.at > target) break;
      pending.shift();
      now = Math.max(now, p.at);
      p.fn();
    }
    now = target;
  };
  const dr = (s, msg) => room.dr(s, { t: 'dr', ...msg });
  const to = (id, from = 0) => out.slice(from).filter((o) => o.to === id).map((o) => o.m);
  const events = (id, k2, from = 0) => to(id, from).filter((m) => m.t === 'event' && m.e.k === k2).map((m) => m.e);
  const lastState = (id) => to(id).filter((m) => m.t === 'room' && m.state).at(-1).state;
  return { room, ss, out, hub, pending, advance, dr, to, events, lastState, addUser, persisted, clock: () => now };
}

const LINE = { c: 1, w: 10, e: 0, p: [100, 100, 5, 5, 5, 5] };

function startPick(x, rounds = 1) {
  assert.equal(x.dr(x.ss[0], { a: 'settings', rounds }), null);
  assert.equal(x.room.start('u0'), null);
  assert.equal(x.lastState('u0').phase, 'pick');
}

test('한 판 전체: 시작 → 고르기 → 그리기 → 정답 → 단축 → 모두 맞힘 → 공개 → 다음 문제 → 최종', () => {
  const x = setup(3);
  startPick(x);
  assert.equal(x.room.phase, 'playing');
  const choices = x.lastState('u0').choices;
  assert.equal(choices.length, 3);
  assert.deepEqual(Object.keys(choices[0]).sort(), ['topic', 'w']);
  const word = choices[0].w;
  assert.equal(x.dr(x.ss[0], { a: 'pick', i: 0 }), null);
  assert.equal(x.lastState('u0').phase, 'draw');

  // 선: 그리는 사람 제외 전원 수신
  const from = x.out.length;
  assert.equal(x.dr(x.ss[0], { a: 'st', ...LINE }), null);
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [3, 3], f: 1 }), null);
  for (const id of ['u1', 'u2']) {
    assert.deepEqual(x.events(id, 'drSt', from)[0], { k: 'drSt', ...LINE });
    assert.equal(x.events(id, 'drPt', from).length, 1);
  }
  assert.equal(x.events('u0', 'drSt', from).length, 0);
  assert.equal(x.events('u0', 'drPt', from).length, 0);

  // 첫 정답: 30초 단축
  const t0 = x.clock();
  assert.equal(x.room.chat(x.ss[1], word), null);
  for (const id of ['u0', 'u1', 'u2']) assert.equal(x.events(id, 'drHit', from).length, 1);
  const st = x.lastState('u0');
  assert.equal(st.rushed, true);
  assert.ok(st.endsAt <= t0 + 30_000);
  assert.equal(x.room.chat(x.ss[2], word), null); // 모두 맞힘 → 공개
  assert.equal(x.lastState('u0').phase, 'reveal');
  assert.equal(x.lastState('u2').reveal.word, word);

  // 공개 5초 뒤 다음 문제(그리는 사람 u1)
  x.advance(5000);
  let s1 = x.lastState('u1');
  assert.equal(s1.phase, 'pick');
  assert.equal(s1.drawerId, 'u1');
  assert.equal(x.events('u2', 'drNew').length, 2);
  // 방장이 두 번 넘기면 최종
  assert.equal(x.dr(x.ss[0], { a: 'skip' }), null);
  x.advance(5000);
  assert.equal(x.lastState('u2').drawerId, 'u2');
  assert.equal(x.dr(x.ss[0], { a: 'skip' }), null);
  x.advance(5000);
  const fin = x.lastState('u0');
  assert.equal(fin.phase, 'final');
  assert.equal(fin.ranking.length, 3);
  assert.equal(x.room.phase, 'lobby');
  // 기록 저장
  assert.equal(x.ss[1].user.stats.draw.games, 1);
  assert.equal(x.ss[1].user.stats.draw.correct, 1);
  assert.ok(x.persisted.length >= 3);
  // 방으로
  assert.equal(x.dr(x.ss[1], { a: 'lobby' }).code, 'dr_host');
  assert.equal(x.dr(x.ss[0], { a: 'lobby' }), null);
  assert.equal(x.lastState('u0').phase, 'lobby');
});

test('saveDraw 콜백이 있으면 rows 를 넘기고 직접 더하지 않는다', () => {
  const rows = [];
  const x = setup(2, { saveDraw: (r) => rows.push(...r) });
  startPick(x);
  x.dr(x.ss[0], { a: 'skip' });
  x.advance(5000);
  x.dr(x.ss[0], { a: 'skip' });
  x.advance(5000);
  assert.equal(x.lastState('u0').phase, 'final');
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['correct', 'games', 'id', 'left', 'name', 'points', 'rank', 'wins']);
  assert.equal(x.ss[0].user.stats.draw, undefined);
});

test('못 맞힌 사람에게 단어·후보·비밀 채팅이 한 번도 가지 않는다', () => {
  const x = setup(3);
  startPick(x);
  const cands = x.lastState('u0').choices.map((c) => c.w);
  const from = x.out.length;
  x.dr(x.ss[0], { a: 'pick', i: 1 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  assert.equal(x.room.chat(x.ss[2], '엉뚱한 답'), null);
  assert.equal(x.room.chat(x.ss[1], cands[1]), null); // u1 정답
  assert.equal(x.room.chat(x.ss[1], '비밀속삭임'), null); // u1 -> sec
  x.room.emote('u1', 'smile');
  assert.equal(x.room.phase, 'playing');
  assert.equal(x.lastState('u0').phase, 'draw');
  const blind = JSON.stringify(x.to('u2', from));
  for (const w of cands) assert.ok(!blind.includes(w), `u2 에게 ${w} 가 갔다`);
  assert.ok(!blind.includes('비밀속삭임'));
  assert.ok(!blind.includes('"sec"'));
  assert.ok(x.to('u2', from).some((m) => m.t === 'room'));
  assert.equal(x.lastState('u2').word, null);
  // 그리는 사람과 맞힌 사람은 받는다
  for (const id of ['u0', 'u1']) {
    const c = x.events(id, 'chat', from).find((e) => e.text === '비밀속삭임');
    assert.equal(c.sec, 1);
  }
  assert.ok(JSON.stringify(x.to('u1', from)).includes(cands[1]));
  // 못 맞힌 사람의 재접속 기록에도 없다
  const f2 = x.out.length;
  x.room.sendExtras(x.ss[2]);
  assert.ok(!JSON.stringify(x.to('u2', f2)).includes('비밀속삭임'));
});

test('그리는 사람 채팅·이모티콘 거절 dr_drawer_mute, 맞힌 사람 사진 이모티콘 거절', () => {
  const x = setup(3);
  startPick(x);
  assert.equal(x.room.chat(x.ss[0], '힌트').code, 'dr_drawer_mute');
  assert.equal(x.room.mediaBlocked(x.ss[0], 'emote').code, 'dr_drawer_mute');
  assert.equal(x.room.mediaBlocked(x.ss[1], 'emote'), null);
  const word = x.lastState('u0').choices[0].w;
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.room.chat(x.ss[1], word);
  assert.equal(x.room.mediaBlocked(x.ss[1], 'pemote').code, 'dr_hit_media');
  assert.equal(x.room.mediaBlocked(x.ss[1], 'emote'), null);
  assert.equal(x.room.mediaBlocked(x.ss[2], 'snd'), null);
});

test('잘못된 그림 요청: 오류 글 없이 버리고 drSync 는 1초에 1번', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  const from = x.out.length;
  // 누적 좌표가 범위 밖
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [1600, 0] }), null);
  assert.equal(x.events('u0', 'drSync', from).length, 1);
  assert.equal(x.to('u0', from).filter((m) => m.t === 'error').length, 0);
  // 같은 순간 또 틀려도(형식 오류 포함) 더 보내지 않는다
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [1, 2, 3] }), null);
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [1600, 0] }), null);
  assert.equal(x.events('u0', 'drSync', from).length, 1);
  // 1초 뒤에는 다시
  x.advance(1000);
  x.dr(x.ss[0], { a: 'rm', ids: [5] });
  assert.equal(x.events('u0', 'drSync', from).length, 2);
  // 보는 사람에게는 가지 않는다
  assert.equal(x.events('u1', 'drSync', from).length, 0);
});

test('draw 단계 밖이거나 그리는 사람이 아니면 조용히 버린다(오류도 drSync 도 없음)', () => {
  const x = setup(3);
  startPick(x);
  const from = x.out.length;
  // pick 단계의 그리는 사람, draw 의 다른 사람
  assert.equal(x.dr(x.ss[0], { a: 'st', ...LINE }), null);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  const f2 = x.out.length;
  assert.equal(x.dr(x.ss[1], { a: 'st', ...LINE }), null);
  assert.equal(x.dr(x.ss[1], { a: 'pt', p: [1, 1, 1] }), null);
  for (const id of ['u0', 'u1', 'u2']) {
    assert.equal(x.events(id, 'drSync', from).length, 0);
    assert.equal(x.events(id, 'drSt', f2).length, 0);
    assert.equal(x.to(id, from).filter((m) => m.t === 'error').length, 0);
  }
  // 공개 단계에서 늦게 온 pt f:1
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.dr(x.ss[0], { a: 'give' });
  assert.equal(x.lastState('u0').phase, 'reveal');
  const f3 = x.out.length;
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [], f: 1 }), null);
  assert.equal(x.dr(x.ss[0], { a: 'pt', p: [1] }), null);
  assert.equal(x.out.length, f3);
});

test('한도 초과: dr_canvas_full + drSync, 보는 사람에게 drCx', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  for (let i = 0; i < 600; i++) x.dr(x.ss[0], { a: 'st', c: 0, w: 4, e: 0, p: [10, 10] });
  const from = x.out.length;
  const before = x.events('u1', 'drSt').length;
  x.advance(1000);
  x.dr(x.ss[0], { a: 'st', c: 0, w: 4, e: 0, p: [10, 10] });
  assert.equal(before, 600);
  assert.equal(x.to('u0', from).filter((m) => m.t === 'error' && m.code === 'dr_canvas_full').length, 1);
  assert.equal(x.events('u0', 'drSync', from).length, 1);
});

test('canUndo / canRedo 가 그리는 사람 상태에 반영된다(긋는 동안 canRedo 꺼짐)', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  assert.equal(x.lastState('u0').canUndo, false);
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.dr(x.ss[0], { a: 'pt', p: [], f: 1 });
  assert.equal(x.lastState('u0').canUndo, true);
  x.dr(x.ss[0], { a: 'undo' });
  assert.equal(x.lastState('u0').canUndo, false);
  assert.equal(x.lastState('u0').canRedo, true);
  assert.equal(x.events('u1', 'drUndo').length, 1);
  x.dr(x.ss[0], { a: 'st', ...LINE }); // 긋는 중
  assert.equal(x.lastState('u0').canRedo, false);
});

test('재접속 순서와 drSync 내용', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.dr(x.ss[0], { a: 'pt', p: [], f: 1 });
  x.dr(x.ss[0], { a: 'st', c: 2, w: 4, e: 0, p: [50, 50, 1, 1] }); // 긋는 중
  x.room.addSound(x.ss[1], 'sid1', '소리', 'data');
  x.room.setConnected('u2', false);
  assert.equal(x.lastState('u0').players.find((p) => p.id === 'u2').connected, false);
  const from = x.out.length;
  x.room.setConnected('u2', true);
  // 허브 login 이 하는 일
  x.hub.send(x.ss[2], { t: 'room', state: x.room.view('u2') });
  x.room.sendExtras(x.ss[2]);
  const seq = x.to('u2', from).map((m) => (m.t === 'event' ? m.e.k : m.t));
  const at = (k) => seq.lastIndexOf(k);
  assert.ok(at('room') < seq.indexOf('faces'));
  assert.ok(seq.indexOf('faces') < seq.indexOf('chatLog'));
  assert.ok(seq.indexOf('chatLog') < seq.indexOf('sndList'));
  assert.ok(seq.indexOf('sndList') < seq.indexOf('drSync'));
  const sync = x.events('u2', 'drSync', from)[0];
  assert.equal(sync.ops.length, 1);
  assert.equal(sync.at, 1);
  assert.deepEqual(sync.cur, { c: 2, w: 4, e: 0, p: [50, 50, 1, 1] });
  assert.equal(x.events('u2', 'faces', from)[0].items.length, 3);
  assert.equal(x.events('u2', 'faces', from)[0].items[0].avatar, 'av0');
  // 상태에 프로필 사진이 없다
  assert.ok(!JSON.stringify(x.lastState('u2')).includes('av0'));
});

test('도중 입장자도 그 문제를 바로 맞힌다', () => {
  const x = setup(3);
  startPick(x);
  const word = x.lastState('u0').choices[0].w;
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.dr(x.ss[0], { a: 'pt', p: [], f: 1 });
  const s3 = x.addUser(3);
  const from = x.out.length;
  x.room.sendExtras(s3);
  assert.equal(x.events('u3', 'drSync', from)[0].ops.length, 1);
  assert.equal(x.lastState('u3').word, null);
  assert.equal(x.room.chat(s3, word), null);
  for (const id of ['u0', 'u1', 'u2', 'u3']) assert.equal(x.events(id, 'drHit', from).length, 1);
  assert.equal(x.lastState('u3').word, word);
  assert.equal(x.lastState('u0').phase, 'draw'); // u1·u2 가 아직
  assert.equal(x.events('u3', 'joined').length, 0);
  assert.equal(x.events('u0', 'joined').length, 4 - 1);
});

test('타이머는 하나만 걸리고 시간이 끝나면 공개, 방장 요청 오류 코드', () => {
  const x = setup(3);
  assert.equal(x.dr(x.ss[1], { a: 'settings', rounds: 1 }).code, 'dr_host');
  assert.equal(x.dr(x.ss[0], { a: 'settings' }).code, 'dr_bad');
  assert.equal(x.room.start('u1').code, 'dr_host');
  startPick(x);
  assert.equal(x.room.timers.game !== null, true);
  x.advance(10_000); // 고르기 시간 끝 -> 자동 선택
  assert.equal(x.lastState('u0').phase, 'draw');
  x.advance(20_000); // 첫 선이 없어 넘김
  assert.equal(x.lastState('u0').phase, 'reveal');
  assert.equal(x.lastState('u0').reveal.why, 'idle');
});

test('나가기·내보내기·방 비면 정리', () => {
  const x = setup(3);
  assert.equal(x.dr(x.ss[0], { a: 'kick', id: 'u2' }), null);
  assert.ok(x.to('u2').some((m) => m.t === 'error' && m.code === 'dr_kicked'));
  assert.equal(x.ss[2].room, null);
  assert.equal(x.room.members.length, 2);
  x.room.leave('u1');
  x.room.leave('u0');
  assert.equal(x.room.members.length, 0);
  x.hub.rooms.set('ABCD', x.room);
  x.advance(60_000);
  assert.equal(x.hub.rooms.has('ABCD'), false);
});

test('판이 끝날 때 나간 사람은 지금 로그인한 user 객체에만 저장하고 옛 사본은 건드리지 않는다', () => {
  const x = setup(3);
  startPick(x);
  const oldUser = x.ss[2].user;
  x.room.leave('u2');
  const fresh = { name: 'N2', bank: 777, stats: { hands: 5 } };
  x.hub.sessions.set('u2', { id: 'u2', user: fresh, conn: {}, room: null });
  for (let i = 0; i < 6 && x.lastState('u0').phase !== 'final'; i++) {
    if (['pick', 'draw'].includes(x.lastState('u0').phase)) x.dr(x.ss[0], { a: 'skip' });
    x.advance(5000);
  }
  assert.equal(x.lastState('u0').phase, 'final');
  assert.ok(x.persisted.includes(fresh));
  assert.ok(!x.persisted.includes(oldUser));
  assert.equal(fresh.bank, 777);
  assert.equal(fresh.stats.hands, 5);
  assert.equal(fresh.stats.draw.games, 1);
  assert.equal(oldUser.stats.draw, undefined);
});

test('새 문제가 시작되면 그림이 비워져 늦게 온 사람의 drSync 는 ops:[]', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.dr(x.ss[0], { a: 'pt', p: [], f: 1 });
  x.dr(x.ss[0], { a: 'give' });
  x.advance(5000);
  assert.equal(x.lastState('u1').phase, 'pick');
  const s3 = x.addUser(3);
  const from = x.out.length;
  x.room.sendExtras(s3);
  const sync = x.events('u3', 'drSync', from)[0];
  assert.deepEqual(sync.ops, []);
  assert.equal(sync.cur, null);
});

test('끊긴 지 60초 뒤 타이머로 방에서 빠지고 허브 세션도 정리된다', () => {
  const x = setup(3);
  x.ss[2].conn = null;
  x.room.setConnected('u2', false);
  assert.equal(x.room.members.length, 3);
  x.advance(59_000);
  assert.equal(x.room.members.length, 3);
  x.advance(1000);
  assert.equal(x.room.members.length, 2);
  assert.equal(x.hub.sessions.has('u2'), false);
  assert.equal(x.ss[2].room, null);
});

test('그리는 사람이 15초 끊기면 그 문제는 reveal why:left', () => {
  const x = setup(3);
  startPick(x);
  x.dr(x.ss[0], { a: 'pick', i: 0 });
  x.dr(x.ss[0], { a: 'st', ...LINE });
  x.room.setConnected('u0', false);
  x.advance(14_000);
  assert.equal(x.lastState('u1').phase, 'draw');
  x.advance(1000);
  const st = x.lastState('u1');
  assert.equal(st.phase, 'reveal');
  assert.equal(st.reveal.why, 'left');
});

test('게임 중 전원이 나가면 게임 타이머 없이 정리 타이머 하나만 남는다', () => {
  const x = setup(3);
  startPick(x);
  assert.equal(x.room.timers.game !== null, true);
  x.room.leave('u1');
  x.room.leave('u2');
  x.room.leave('u0');
  assert.equal(x.room.members.length, 0);
  assert.equal(x.room.timers.game, null);
  assert.equal(x.pending.length, 1);
  assert.equal(x.room.timers.gc, x.pending[0].id);
});
