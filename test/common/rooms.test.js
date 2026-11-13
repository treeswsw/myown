// 방 공통 기능 안전망 (모드 x 기능 표). 실제 허브(server/rooms.js) + 가짜 시계 + 메모리 저장소.
//
// 목적: 서버의 방 공통 기능(채팅·이모티콘·사운드·나가기·방장·끊김·시작)을 게임별 복사본에서 공용 모듈로 옮기는
// 정리가 동작을 깨면 바로 잡히게 한다. 기대값은 "지금 동작 그대로"다. 게임마다 다른 곳은 `// 통일 예정:` 주석으로 표시했다
// (docs/REFACTOR-PLAN.md 1절: 끊김 60초 통일, 방장은 연결된 사람에게 등). 통일하면 그 칸의 기대값만 바꾼다.
//
// 새 게임을 추가하면 아래 MODES 에 한 줄(표 한 칸 묶음)을 더하면 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, freeLimits, events, drain } from '../lib/hub.js';
import { SERVER_GAMES } from '../../server/games.js';

const JPG = 'data:image/jpeg;base64,/9j/AAAA';
const AUD = 'data:audio/webm;base64,AAAA';
const GRACE = 60_000; // 허브 기본 끊김 유예(DEFAULT_TIMING.grace) = 방 비움 대기(roomGc)

// ---- 모드별 기대값 표 -------------------------------------------------------------------------

// 허브 공통 도배 제한: 한 순간에 1개, 10초에 5개. (draw 는 엔진이 따로 세어 3/초·15/10초)
const HUB_FLOOD = { burst: 1, gap: 1100, per10s: 5, err: '채팅을 너무 빨리 보내고 있습니다' };
const HUB_LONG = '채팅은 1~120자여야 합니다.';
const HOST_ERR = '방장만 시작할 수 있습니다.';

const ALL_OK = {};
// 게임 중 한 단계의 표: roles(r) = { 역할이름: 클라이언트 }, expect[역할][종류] = 'ok' 또는 오류 코드/문장.
// 적지 않은 칸은 'ok'(방 전원에게 감). chatTo = 채팅이 가는 역할 목록(적지 않으면 방 전원).
const plain = (name = '진행 중') => ({ name, roles: (r) => ({ host: r.cs[0], guest: r.cs[2] }), expect: { host: ALL_OK, guest: ALL_OK } });

// 라이어: 단계별 글·매체 잠금 (server/liar/perms.js). 모든 사람이 같은 칸이다(라이어도, 관전도 아닌 일반 참가자 기준).
const liarStage = (phase, expectAll = {}) => ({
  name: `라이어 ${phase}`,
  enter: async (r) => { await liarWalkTo(r, phase); },
  roles: (r) => ({ a: r.cs[0], b: r.cs[1], c: r.cs[2] }),
  expect: { a: expectAll, b: expectAll, c: expectAll },
});
const SPEAK_CHAT = '첫 설명 중에는 차례가 되었을 때 설명으로만 글을 쓸 수 있습니다.'; // 설명은 lg say 로만
const UNMASK = { chat: '정체 공개 중에는 글을 쓸 수 없습니다.', emote: '정체 공개 중에는 쓸 수 없습니다.', pemote: '정체 공개 중에는 쓸 수 없습니다.', sndAdd: '정체 공개 중에는 쓸 수 없습니다.', snd: '정체 공개 중에는 쓸 수 없습니다.' };
const GUESS_MEDIA = '정답 맞히기 중에는 기본 이모티콘만 쓸 수 있습니다.';
const ANSWER = { chat: '정답 공개 중에는 글을 쓸 수 없습니다.', emote: '정답 공개 중에는 쓸 수 없습니다.', pemote: '정답 공개 중에는 쓸 수 없습니다.', sndAdd: '정답 공개 중에는 쓸 수 없습니다.', snd: '정답 공개 중에는 쓸 수 없습니다.' };

// 갱식마인드: 그리는 사람은 글·이모티콘·소리 전부 금지, 이미 맞힌 사람은 사진 이모티콘·소리 금지, 맞힌 사람의 글은 맞힌 사람과 그리는 사람에게만.
const DRAWER_MUTE = { chat: 'dr_drawer_mute', emote: 'dr_drawer_mute', pemote: 'dr_drawer_mute', sndAdd: 'dr_drawer_mute', snd: 'dr_drawer_mute' };
const drawRoles = (r) => {
  const drawer = r.cs.find((c) => c.state.you === c.state.drawerId);
  const [g1, g2] = r.cs.filter((c) => c !== drawer);
  return { drawer, g1, g2 };
};

const MODES = [
  {
    mode: 'holdem', create: { mode: 'holdem' }, max: 6, chatMax: 120, chatLong: HUB_LONG, flood: HUB_FLOOD,
    startFew: 'pk_need2', startNonHost: 'pk_host', startedPhase: 'playing',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (Shell)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [plain()],
  },
  {
    mode: 'bluff', create: { mode: 'bluff' }, max: 4, chatMax: 120, chatLong: HUB_LONG, flood: HUB_FLOOD,
    startFew: 'pk_need2', startNonHost: 'pk_host', startedPhase: 'playing',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (Shell)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [plain()],
  },
  {
    mode: 'liar', create: { mode: 'liar' }, max: 8, chatMax: 80, // 통일 예정?: 라이어만 80자(GDD 규칙일 수 있음)
    chatLong: '채팅은 1~80자여야 합니다.', flood: HUB_FLOOD,
    startFew: '3명 이상 필요합니다.', startNonHost: HOST_ERR, startedPhase: 'reveal',
    hostWhenNextAway: 'bob1', // 통일 예정: 방장은 연결된 사람에게
    leftEvent: true, awayEvents: true, faces: true,
    stages: [
      liarStage('reveal'),
      liarStage('speak', { chat: SPEAK_CHAT }), // 예외: 첫 설명 중 글 잠금(이모티콘·소리는 가능)
      liarStage('discuss'),
      liarStage('unmask', UNMASK), // 예외: 정체 공개 중 글·이모티콘·소리 전부 금지
      liarStage('guess', { chat: '정답 맞히기 중에는 글을 쓸 수 없습니다.', pemote: GUESS_MEDIA, sndAdd: GUESS_MEDIA, snd: GUESS_MEDIA }), // 기본 이모티콘만 가능
      liarStage('answer', ANSWER),
      liarStage('result'),
    ],
  },
  {
    mode: 'yacht', create: { mode: 'yacht' }, max: 4, chatMax: 120, chatLong: HUB_LONG, flood: HUB_FLOOD,
    startFew: 'yt_need2', startNonHost: 'yt_host', startedPhase: 'playing',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (Shell)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [plain()],
  },
  {
    mode: 'draw', create: { mode: 'draw' }, max: 8, chatMax: 40, // 갱식마인드 규칙: 40자, 3/초·15/10초(엔진이 셈)
    chatLong: 'dr_bad', flood: { burst: 3, gap: 400, per10s: 15, err: 'dr_chat_fast', engine: true },
    startFew: 'dr_need2', startNonHost: 'dr_host', startedPhase: 'pick',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (엔진 transferHost)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [
      {
        name: '그리기 전(단어 고르는 중)',
        roles: (r) => { const { drawer, g1, g2 } = drawRoles(r); return { drawer, g1, g2 }; },
        expect: { drawer: DRAWER_MUTE, g1: ALL_OK, g2: ALL_OK },
      },
      {
        name: '그리는 중',
        enter: async (r) => { const { drawer } = drawRoles(r); await drawer.send({ t: 'dr', a: 'pick', i: 0 }); },
        roles: (r) => { const { drawer, g1, g2 } = drawRoles(r); return { drawer, g1, g2 }; },
        expect: { drawer: DRAWER_MUTE, g1: ALL_OK, g2: ALL_OK },
      },
      {
        name: '그리는 중(g1 이 맞힘)',
        enter: async (r) => {
          const { drawer, g1 } = drawRoles(r);
          await r.tick(1100);
          await g1.send({ t: 'chat', text: drawer.state.word });
          assert.equal(g1.state.phase, 'draw', '두 명이 남아 있어 한 명 맞힌 걸로는 안 끝난다');
        },
        roles: (r) => { const { drawer, g1, g2 } = drawRoles(r); return { drawer, hit: g1, g2 }; },
        expect: {
          drawer: DRAWER_MUTE,
          hit: { pemote: 'dr_hit_media', sndAdd: 'dr_hit_media', snd: 'dr_hit_media', chatTo: ['drawer', 'hit'] }, // 맞힌 사람 글은 맞힌 사람·그리는 사람에게만
          g2: ALL_OK,
        },
      },
    ],
  },
  {
    mode: 'gsk', create: { mode: 'gsk' }, max: 6, chatMax: 120, chatLong: HUB_LONG, flood: HUB_FLOOD,
    startFew: 'gk_few', startNonHost: 'gk_host', startedPhase: 'playing',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (Shell)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [plain()],
  },
  {
    mode: 'mini', create: { mode: 'mini' }, max: 8, chatMax: 120, chatLong: HUB_LONG, flood: HUB_FLOOD,
    startFew: 'mn_need2', startNonHost: 'mn_host', startedPhase: 'play',
    hostWhenNextAway: 'cat1', // 연결된 사람 우선 (Shell)
    leftEvent: true, awayEvents: true, faces: true,
    stages: [plain('진행 중(셋째 사람은 관전)')],
  },
];

// ---- 도우미 ----------------------------------------------------------------------------------

// n 명이 들어간 방. cs[0] 이 방장.
async function seat(spec, n, hubOpts) {
  const h = makeHub(hubOpts);
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1', 'dan1'].slice(0, n)) cs.push(await h.login(id));
  await cs[0].send({ t: 'create', ...spec.create });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  return { ...h, cs, code, room: h.hub.rooms.get(code), ids: () => h.hub.rooms.get(code)?.members.map((m) => m.id) ?? null };
}
const startGame = async (r) => { await r.cs[0].send({ t: 'start' }); };
const errKey = (e) => e && (e.code ?? e.msg);
const lastErr = (c, since = 0) => errKey(c.sock.msgs.slice(since).filter((m) => m.t === 'error').at(-1));

// 라이어: 가짜 시계를 단계 끝 시각까지 보내며 원하는 단계가 될 때까지 걷는다.
async function liarWalkTo(r, phase) {
  for (let i = 0; i < 30; i++) {
    const st = r.cs[0].state;
    if (st.phase === phase) return;
    assert.notEqual(st.phase, 'result', `라이어 판이 ${phase} 를 거치지 않고 끝남`);
    r.clock.advance(Math.max(1, st.phaseEndsAt - r.clock.now() + 1));
    await drain();
  }
  assert.fail(`라이어 ${phase} 단계에 도달하지 못함`);
}

const KINDS = ['chat', 'emote', 'pemote', 'sndAdd', 'snd'];
const EVENT_OF = { chat: 'chat', emote: 'emote', pemote: 'pemote', sndAdd: 'sndAdd', snd: 'snd' };
let sidSeq = 0;
const MSG = {
  chat: () => ({ t: 'chat', text: 'hello' }),
  emote: () => ({ t: 'emote', e: 2 }),
  pemote: () => ({ t: 'pemote', data: JPG }),
  sndAdd: () => ({ t: 'sndAdd', sid: `tst${String(++sidSeq).padStart(4, '0')}`, name: 'boom', data: AUD }),
  snd: () => ({ t: 'snd', sid: 'builtin:clap' }),
};

// sender 가 kind 를 한 번 보낸다. 오류면 { err }, 아니면 { to: 그 event 를 받은 사람 id 정렬 목록 }.
async function trySend(r, sender, kind, spec) {
  freeLimits(r.hub);
  if (kind === 'chat' && spec.flood.engine) await r.tick(1100); // draw 채팅 속도는 엔진이 세므로 시계로 푼다
  const marks = r.cs.map((c) => c.sock.msgs.length);
  const si = r.cs.indexOf(sender);
  await sender.send(MSG[kind]());
  const err = lastErr(sender, marks[si]);
  if (err) return { err };
  const to = r.cs.filter((c, i) => c.sock.msgs.slice(marks[i]).some((m) => m.t === 'event' && m.e.k === EVENT_OF[kind])).map((c) => c.id).sort();
  return { to };
}

// ---- 표 시험 ---------------------------------------------------------------------------------

for (const spec of MODES) {
  const M = spec.mode;

  // 1) 대기 중 채팅
  test(`${M}: 대기 중 채팅 - 방 전원(보낸 사람 포함)에게 가고, 밖에는 안 가며, 상태 push 가 없다`, async () => {
    const r = await seat(spec, 3);
    const outsider = await r.login('zed1');
    const o2 = await r.login('yan1');
    await o2.send({ t: 'create', mode: 'holdem' });
    const marks = [...r.cs, outsider, o2].map((c) => c.sock.msgs.length);
    await r.cs[1].send({ t: 'chat', text: '  안녕하세요  ' });
    r.cs.forEach((c, i) => {
      const got = c.sock.msgs.slice(marks[i]);
      const chat = got.filter((m) => m.t === 'event' && m.e.k === 'chat');
      assert.equal(chat.length, 1, `${c.id} 는 채팅 1개`);
      assert.equal(chat[0].e.text, '안녕하세요', '앞뒤 공백 제거');
      assert.equal(chat[0].e.id, 'bob1');
      assert.equal(chat[0].e.name, 'bob1');
      assert.equal(typeof chat[0].e.ts, 'number');
      assert.equal(got.filter((m) => m.t === 'room').length, 0, '채팅은 방 상태를 다시 보내지 않는다');
    });
    assert.equal(outsider.sock.msgs.slice(marks[3]).filter((m) => m.t === 'event').length, 0, '방 밖 사람');
    assert.equal(o2.sock.msgs.slice(marks[4]).filter((m) => m.t === 'event').length, 0, '다른 방 사람');
  });

  test(`${M}: 채팅 기록은 늦게 들어온 사람·재접속한 사람에게 간다`, async () => {
    const r = await seat(spec, 3);
    await r.cs[0].send({ t: 'chat', text: '첫 글' });
    const late = await r.login('dan1');
    await late.send({ t: 'join', code: r.code });
    const log = events(late, 'chatLog').at(-1);
    assert.ok(log, 'chatLog 이벤트');
    assert.deepEqual(log.items.map((x) => x.text), ['첫 글']);
    // 재접속
    r.cs[1].conn.close();
    const back = await r.login('bob1');
    assert.deepEqual(events(back, 'chatLog').at(-1).items.map((x) => x.text), ['첫 글']);
  });

  test(`${M}: 채팅 길이 - 최대 ${spec.chatMax}자 통과, 넘으면 거절, 빈 글 거절`, async () => {
    const r = await seat(spec, 2);
    const [a, b] = r.cs;
    const n0 = b.sock.msgs.length;
    await a.send({ t: 'chat', text: '가'.repeat(spec.chatMax) });
    assert.equal(lastErr(a), undefined, '최대 길이는 통과');
    assert.equal(events(b, 'chat').length, 1);
    await r.tick(1100);
    const e0 = a.sock.msgs.length;
    await a.send({ t: 'chat', text: '가'.repeat(spec.chatMax + 1) });
    assert.equal(lastErr(a, e0), spec.chatLong);
    await r.tick(1100);
    const e1 = a.sock.msgs.length;
    await a.send({ t: 'chat', text: '   ' });
    assert.equal(lastErr(a, e1), HUB_LONG, '공백뿐인 글은 허브(검사 단계)가 거절 - 모든 모드 같은 문장');
    assert.equal(events(b, 'chat').length, 1, '거절된 글은 안 간다');
    assert.ok(n0 >= 0);
  });

  test(`${M}: 채팅 도배 제한 (한 순간 ${spec.flood.burst}개, 10초에 ${spec.flood.per10s}개)`, async () => {
    const f = spec.flood;
    const r = await seat(spec, 2);
    const [a, b] = r.cs;
    // 한 순간에 보낸 것 중 burst 개만 통과
    const got = [];
    for (let i = 0; i < f.burst + 2; i++) {
      const n = a.sock.msgs.length;
      await a.send({ t: 'chat', text: `m${i}` });
      got.push(lastErr(a, n) ?? 'ok');
    }
    assert.deepEqual(got, [...Array(f.burst).fill('ok'), f.err, f.err]);
    assert.equal(events(b, 'chat').length, f.burst, '거절된 글은 방에 안 간다');
    // 10초 지나면 풀리고, 간격을 두고 계속 보내면 per10s 개째까지만 통과
    await r.tick(11_000);
    let passed = 0;
    for (let i = 0; i < f.per10s + 3; i++) {
      const n = a.sock.msgs.length;
      await a.send({ t: 'chat', text: `n${i}` });
      if (lastErr(a, n) === undefined) passed++;
      else assert.equal(lastErr(a, n), f.err);
      await r.tick(f.gap);
      if (passed > f.per10s) break;
    }
    assert.equal(passed, f.per10s, '10초 안에 통과하는 개수');
  });

  // 2) 기본 이모티콘·사진 이모티콘·사운드
  test(`${M}: 이모티콘(기본·사진)이 방 전원에게 가고 속도 제한이 있다`, async () => {
    const r = await seat(spec, 3);
    const outsider = await r.login('zed1');
    const m0 = outsider.sock.msgs.length;
    await r.cs[1].send({ t: 'emote', e: 0 });
    await r.cs[1].send({ t: 'emote', e: 5 });
    for (const c of r.cs) assert.deepEqual(events(c, 'emote').map((e) => [e.id, e.e]), [['bob1', 0], ['bob1', 5]], c.id);
    await r.cs[1].send({ t: 'emote', e: 6 });
    assert.equal(lastErr(r.cs[1]), '잘못된 이모티콘입니다.');
    // 사진 이모티콘
    await r.cs[2].send({ t: 'pemote', data: JPG });
    for (const c of r.cs) assert.deepEqual(events(c, 'pemote').map((e) => [e.id, e.data]), [['cat1', JPG]], c.id);
    await r.cs[2].send({ t: 'pemote', data: JPG });
    assert.equal(lastErr(r.cs[2]), '사진 이모티콘을 너무 빨리 보내고 있습니다');
    await r.tick(3100);
    await r.cs[2].send({ t: 'pemote', data: JPG });
    assert.equal(events(r.cs[0], 'pemote').length, 2);
    await r.cs[2].send({ t: 'pemote', data: 'data:text/plain;base64,AAAA' });
    assert.equal(lastErr(r.cs[2]), '사진은 40KB 이하의 JPEG여야 합니다.');
    assert.equal(outsider.sock.msgs.slice(m0).filter((m) => m.t === 'event').length, 0);
  });

  test(`${M}: 사운드 추가·재생·이름 바꾸기·지우기(권한 포함)가 방 전원에게 간다`, async () => {
    const r = await seat(spec, 3);
    const [a, b, c] = r.cs;
    await b.send({ t: 'sndAdd', sid: 'abc123', name: '쾅', data: AUD });
    for (const x of r.cs) assert.deepEqual(events(x, 'sndAdd'), [{ k: 'sndAdd', sid: 'abc123', by: 'bob1', name: '쾅', data: AUD }], x.id);
    await b.send({ t: 'sndAdd', sid: 'abc124', name: '쾅2', data: AUD });
    assert.equal(lastErr(b), '소리를 너무 빨리 올리고 있습니다');
    // 재생: 방 소리·기본 소리 가능, 없는 소리는 거절, 속도 제한
    await c.send({ t: 'snd', sid: 'abc123' });
    for (const x of r.cs) assert.deepEqual(events(x, 'snd').map((e) => [e.id, e.sid]), [['cat1', 'abc123']], x.id);
    await r.tick(2100);
    await c.send({ t: 'snd', sid: 'zzzzzz' });
    assert.equal(lastErr(c), '없는 소리입니다.');
    await r.tick(2100);
    await c.send({ t: 'snd', sid: 'builtin:clap' });
    assert.equal(events(a, 'snd').length, 2);
    await c.send({ t: 'snd', sid: 'builtin:clap' });
    assert.equal(lastErr(c), '소리를 너무 빨리 재생하고 있습니다');
    // 이름 바꾸기: 올린 사람과 방장만
    await r.tick(1100);
    await c.send({ t: 'sndRename', sid: 'abc123', name: '남의것' });
    assert.equal(lastErr(c), '이 사운드를 수정할 권한이 없습니다.');
    await b.send({ t: 'sndRename', sid: 'abc123', name: '새이름' });
    for (const x of r.cs) assert.deepEqual(events(x, 'sndRename'), [{ k: 'sndRename', sid: 'abc123', name: '새이름' }], x.id);
    await r.tick(1100);
    await a.send({ t: 'sndRename', sid: 'abc123', name: '방장이' }); // 방장은 남이 올린 것도 고칠 수 있다
    assert.equal(events(c, 'sndRename').length, 2);
    // 늦게 들어온 사람은 소리 목록을 받는다
    const late = await r.login('dan1');
    await late.send({ t: 'join', code: r.code });
    assert.deepEqual(events(late, 'sndList').at(-1).items.map((x) => [x.sid, x.name, x.by]), [['abc123', '방장이', 'bob1']]);
    // 지우기: 권한 없으면 거절, 올린 사람이 지우면 전원에게
    await r.tick(1100);
    await c.send({ t: 'sndDel', sid: 'abc123' });
    assert.equal(lastErr(c), '이 사운드를 수정할 권한이 없습니다.');
    await b.send({ t: 'sndDel', sid: 'abc123' });
    for (const x of r.cs) assert.deepEqual(events(x, 'sndDel'), [{ k: 'sndDel', sid: 'abc123' }], x.id);
    await r.tick(2100);
    await c.send({ t: 'snd', sid: 'abc123' });
    assert.equal(lastErr(c), '없는 소리입니다.');
  });

  test(`${M}: 사운드 한도 - 한 사람 8개, 넘기면 가장 오래된 것부터 밀려난다`, async () => {
    const r = await seat(spec, 2);
    const [, b] = r.cs;
    for (let i = 0; i < 9; i++) {
      await r.tick(10_100);
      await b.send({ t: 'sndAdd', sid: `snd${String(i).padStart(3, '0')}`, name: `s${i}`, data: AUD });
      assert.equal(lastErr(b), undefined, `${i}번째`);
    }
    const late = await r.login('cat1');
    await late.send({ t: 'join', code: r.code });
    assert.deepEqual(events(late, 'sndList').at(-1).items.map((x) => x.sid), Array.from({ length: 8 }, (_, i) => `snd${String(i + 1).padStart(3, '0')}`));
  });

  // 3) 나가기
  test(`${M}: 나가기 - 나간 사람은 방 상태 null, 남은 사람에게 알림(${spec.leftEvent ? 'left 이벤트+상태' : '상태만'})`, async () => {
    const r = await seat(spec, 3);
    const [a, b, c] = r.cs;
    const mA = a.sock.msgs.length;
    await c.send({ t: 'leave' });
    assert.equal(c.sock.last('room').state, null, '나간 사람 화면은 방 없음');
    assert.ok(c.sock.last('me'), '나가면 me 를 다시 받는다');
    assert.equal(c.conn.session.room, null);
    assert.deepEqual(r.ids(), ['ann1', 'bob1']);
    const roomMsgs = a.sock.msgs.slice(mA).filter((m) => m.t === 'room');
    assert.ok(roomMsgs.length >= 1, '남은 사람은 갱신된 방 상태를 받는다');
    assert.deepEqual(roomMsgs.at(-1).state.players.map((p) => p.id).filter((id) => id === 'cat1'), [], '나간 사람은 명단에서 빠진다');
    const left = a.sock.msgs.slice(mA).filter((m) => m.t === 'event' && m.e.k === 'left');
    assert.equal(left.length, spec.leftEvent ? 1 : 0);
    if (spec.leftEvent) assert.equal(left[0].e.id, 'cat1');
    assert.equal(b.state.players.some((p) => p.id === 'cat1'), false);
    // 나간 사람은 다른 방을 만들 수 있다
    await c.send({ t: 'create', mode: 'holdem' });
    assert.equal(c.state.mode, 'holdem');
  });

  test(`${M}: 마지막 사람이 나가면 방 목록에서 바로 사라지고 ${GRACE / 1000}초 뒤 방이 지워진다`, async () => {
    const r = await seat(spec, 2);
    const watcher = await r.login('zed1');
    assert.equal(r.hub.roomList().length, 1);
    await r.cs[1].send({ t: 'leave' });
    await r.cs[0].send({ t: 'leave' });
    assert.equal(r.hub.roomList().length, 0, '빈 방은 목록에 안 나온다');
    assert.equal(r.hub.rooms.has(r.code), true, '지우기 전 대기(roomGc) 중');
    await r.tick(GRACE - 1000);
    assert.equal(r.hub.rooms.has(r.code), true);
    await r.tick(2000);
    assert.equal(r.hub.rooms.has(r.code), false, '대기가 지나면 허브에서 지워진다');
    await watcher.send({ t: 'join', code: r.code });
    assert.equal(lastErr(watcher), '존재하지 않는 방입니다.');
  });

  // 4) 방장 넘김
  test(`${M}: 방장이 나가면 방장이 넘어간다(다음 사람이 연결 중이면 ${'bob1'}, 끊겨 있으면 ${spec.hostWhenNextAway})`, async () => {
    const r = await seat(spec, 3);
    assert.equal(r.room.hostId, 'ann1');
    await r.cs[0].send({ t: 'leave' });
    assert.equal(r.room.hostId, 'bob1');
    assert.equal(r.cs[1].state.hostId, 'bob1');
    assert.equal(r.cs[2].state.hostId, 'bob1');
    // 다음 사람(bob1)이 끊겨 있을 때
    const r2 = await seat(spec, 3);
    r2.cs[1].conn.close();
    await r2.cs[0].send({ t: 'leave' });
    assert.equal(r2.room.hostId, spec.hostWhenNextAway);
  });

  test(`${M}: 방장이 끊기기만 하면 유예 동안 방장 그대로, 유예가 지나 나간 것으로 처리되면 넘어간다`, async () => {
    const r = await seat(spec, 3);
    r.cs[0].conn.close();
    assert.equal(r.room.hostId, 'ann1');
    await r.tick(GRACE - 1000);
    assert.equal(r.room.hostId, 'ann1');
    assert.deepEqual(r.ids(), ['ann1', 'bob1', 'cat1']);
    await r.tick(2000);
    assert.deepEqual(r.ids(), ['bob1', 'cat1']);
    assert.equal(r.room.hostId, 'bob1');
  });

  // 5) 끊김
  test(`${M}: 끊김(대기 중) - 유예 안에 재접속하면 자리·상태 유지, 유예 뒤에는 나간 것으로 처리`, async () => {
    const r = await seat(spec, 3);
    const [a, , c] = r.cs;
    const mA = a.sock.msgs.length;
    c.conn.close();
    const away = a.sock.msgs.slice(mA);
    assert.equal(away.filter((m) => m.t === 'event' && m.e.k === 'away').length, spec.awayEvents ? 1 : 0);
    assert.equal(a.state.players.find((p) => p.id === 'cat1').connected, false);
    assert.equal(r.room.members.find((m) => m.id === 'cat1').connected, false);
    await r.tick(30_000);
    const back = await r.login('cat1');
    assert.equal(back.state.code, r.code, '재접속하면 같은 방 상태를 받는다');
    assert.equal(back.state.you, 'cat1');
    assert.equal(back.state.phase, a.state.phase);
    assert.equal(a.state.players.find((p) => p.id === 'cat1').connected, true);
    assert.equal(a.sock.msgs.slice(mA).filter((m) => m.t === 'event' && m.e.k === 'back').length, spec.awayEvents ? 1 : 0);
    assert.equal(back.sock.msgs.some((m) => m.t === 'event' && m.e.k === 'faces'), spec.faces);
    assert.ok(events(back, 'chatLog').length >= 1);
    await r.tick(40_000); // 처음 끊긴 때부터 70초 - 재접속했으니 유예 타이머는 취소됐어야 한다
    assert.deepEqual(r.ids(), ['ann1', 'bob1', 'cat1']);
    // 이제 bob1 이 끊기고 유예를 넘긴다
    r.cs[1].conn.close();
    await r.tick(GRACE - 1000);
    assert.deepEqual(r.ids(), ['ann1', 'bob1', 'cat1'], '유예 직전까지는 자리 유지');
    await r.tick(2000);
    assert.deepEqual(r.ids(), ['ann1', 'cat1'], '유예가 지나면 나간 것으로 처리');
    const gone = await r.login('bob1');
    assert.equal(gone.state, null, '나간 뒤 로그인하면 방 없음');
    assert.equal(a.state.players.some((p) => p.id === 'bob1'), false);
  });

  test(`${M}: 같은 아이디로 다시 접속하면 옛 연결을 끊고 자리를 이어받는다`, async () => {
    const r = await seat(spec, 3);
    const old = r.cs[2];
    const again = await r.login('cat1');
    assert.equal(old.sock.closed, true);
    assert.equal(errKey(old.sock.last('error')), '다른 곳에서 접속하여 연결이 종료됩니다.');
    assert.equal(again.state.code, r.code);
    assert.deepEqual(r.ids(), ['ann1', 'bob1', 'cat1']);
    assert.equal(r.room.members.find((m) => m.id === 'cat1').connected, true);
    await r.tick(GRACE + 5000);
    assert.deepEqual(r.ids(), ['ann1', 'bob1', 'cat1'], '이어받았으니 유예 만료로 나가지 않는다');
  });

  // 6) 게임 시작
  test(`${M}: 게임 시작 - 인원 부족 거절, 방장 아니면 거절, 충족하면 시작`, async () => {
    const solo = await seat(spec, 1);
    await solo.cs[0].send({ t: 'start' });
    assert.equal(lastErr(solo.cs[0]), spec.startFew);
    assert.equal(solo.cs[0].state.phase, 'lobby');
    const r = await seat(spec, 3);
    assert.equal(r.cs[0].state.phase, 'lobby');
    await r.cs[1].send({ t: 'start' });
    assert.equal(lastErr(r.cs[1]), spec.startNonHost);
    assert.equal(r.cs[0].state.phase, 'lobby', '방장이 아니면 시작되지 않는다');
    await r.cs[0].send({ t: 'start' });
    assert.equal(lastErr(r.cs[0]), undefined);
    for (const c of r.cs) assert.equal(c.state.phase, spec.startedPhase, c.id);
  });

  // 7) 게임 진행 중 채팅·이모티콘·사운드 (그 게임의 규칙대로)
  test(`${M}: 게임 중 채팅·이모티콘·사운드 - 그 게임의 규칙대로 (${spec.stages.map((s) => s.name).join(' / ')})`, async () => {
    const r = await seat(spec, 3);
    await startGame(r);
    assert.equal(r.cs[0].state.phase, spec.startedPhase);
    for (const st of spec.stages) {
      await st.enter?.(r);
      const roles = st.roles(r);
      for (const [role, sender] of Object.entries(roles)) {
        for (const kind of KINDS) {
          const exp = st.expect?.[role] ?? ALL_OK;
          const want = exp[kind] ?? 'ok';
          const got = await trySend(r, sender, kind, spec);
          const where = `[${st.name}] ${role}(${sender.id}) ${kind}`;
          if (want === 'ok') {
            assert.equal(got.err, undefined, `${where}: 막히면 안 됨 (${got.err})`);
            const everyone = kind === 'chat' && exp.chatTo ? exp.chatTo.map((rl) => roles[rl].id) : r.cs.map((c) => c.id);
            assert.deepEqual(got.to, [...everyone].sort(), `${where}: 받는 사람`);
          } else {
            assert.equal(got.err, want, `${where}: 막혀야 함`);
          }
        }
      }
    }
  });

  // 8) 게임 중 나가기·끊김
  test(`${M}: 게임 중 - 나가면 남은 사람은 계속, 끊긴 사람은 유예 안 재접속하면 자리 유지·유예 뒤에는 나감`, async () => {
    const r = await seat(spec, 4);
    await startGame(r);
    const code = r.code;
    const phase = r.cs[0].state.phase;
    assert.equal(phase, spec.startedPhase);
    // 끊고 곧바로 재접속
    r.cs[3].conn.close();
    await r.tick(1000);
    const back = await r.login('dan1');
    assert.equal(back.state.code, code);
    assert.equal(back.state.you, 'dan1');
    assert.equal(back.state.phase, phase, '재접속하면 진행 중이던 판 상태를 받는다');
    // 다시 끊고 유예를 넘김
    back.conn.close();
    await r.tick(GRACE + 2000);
    assert.equal(r.ids().includes('dan1'), false, '유예 뒤 나간 것으로 처리');
    // 나가기
    const c = r.cs[2];
    await c.send({ t: 'leave' });
    assert.equal(c.sock.last('room').state, null);
    assert.equal(r.ids().includes('cat1'), false);
    assert.ok(r.hub.rooms.has(code) && r.ids().length >= 2, '남은 사람의 방은 유지');
  });
}

// ---- 공통 방(Shell)으로 옮긴 게임만 (server/games.js 에서 legacy 가 아닌 줄). docs/COMMON-CONTRACT.md 5-4 마지막 줄 ----
// "결과 뒤 대기실 시작" 은 게임마다 판을 끝내는 길이 달라 각 게임 과제가 자기 시험에 둔다.
for (const spec of MODES.filter((s) => !SERVER_GAMES[s.mode].legacy)) {
  const M = spec.mode;

  test(`${M}: 공통 방 - wait 모양(대기 중에만), 강퇴(방장·대기·자기 아님)`, async () => {
    const r = await seat(spec, 3);
    const [a, b, c] = r.cs;
    const w = a.state.wait;
    assert.ok(w, '대기 중 wait');
    assert.equal(typeof w.can, 'boolean');
    assert.ok(w.why === null || (typeof w.why.msg === 'string' && typeof w.why.code === 'string'));
    assert.equal(typeof w.set, 'object');
    assert.equal(typeof w.own, 'object');
    assert.deepEqual(a.state.specs, []);
    const pre = a.state.players.map((p) => p.id).length;
    await b.send({ t: 'kick', id: 'cat1' });
    assert.match(lastErr(b), /_host$/);
    await a.send({ t: 'kick', id: 'ann1' });
    assert.match(lastErr(a), /_bad$/);
    await a.send({ t: 'kick', id: 'cat1' });
    const kicked = c.sock.msgs.filter((m) => m.t === 'error').at(-1);
    assert.match(kicked.code, /_kicked$/);
    assert.equal(c.sock.last('room').state, null);
    assert.equal(a.state.players.length, pre - 1);
  });
}
