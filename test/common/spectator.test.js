// 관전 계정(관전 + 숫자) 안전망: 모드 7종 x 관전 기능 표. 실제 허브 + 가짜 시계 (shared/spectator.js, SPEC 7-4).
// 관전자는 정원·자리·차례·시작 인원·방장 밖이고, 게임 요청은 게임에 가지 않으며, 기기에 비밀이 하나도 가지 않는다.
// 비밀 검사: 관전자가 받은 모든 메시지(JSON)에 그 판의 비밀 글자가 없다 + 관전자가 받은 게임 알림은 "비밀을 모르는 참가자"도 받은 것뿐.
// 새 게임을 추가하면 MODES 에 한 줄.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, freeLimits, events, drain } from '../lib/hub.js';
import { turnEngine } from '../solo/lib.js';

const errKey = (e) => e && (e.code ?? e.msg);
const lastErr = (c, since = 0) => errKey(c.sock.msgs.slice(since).filter((m) => m.t === 'error').at(-1));
const SHELL_OWN = new Set(['chatLog', 'faces', 'sndList', 'drSync']); // 들어올 때 그 사람에게만 가는 것

const cardStrs = (cards) => (cards ?? []).map((c) => `"${c}"`);

// 라이어: 원하는 단계까지 시계를 보낸다
async function liarWalk(r, phase) {
  for (let i = 0; i < 30 && r.cs[0].state.phase !== phase; i++) {
    r.clock.advance(Math.max(1, r.cs[0].state.phaseEndsAt - r.clock.now() + 1));
    await drain();
  }
  assert.equal(r.cs[0].state.phase, phase);
}

const MODES = [
  {
    mode: 'holdem', n: 2, act: { t: 'act', a: 'fold' }, actErr: 'pk_spec', chat: 'ok',
    secrets: (r) => r.room.impl.hand.st.seats.flatMap((s) => cardStrs(s.cards)),
    view: (st) => { assert.equal(st.myCards, null); assert.ok(st.players.every((p) => p.cards === null), '남의 손패 없음'); },
    blind: (r) => r.cs[1],
  },
  {
    mode: 'bluff', n: 2, act: { t: 'liar' }, actErr: 'pk_spec', chat: 'ok',
    secrets: (r) => [JSON.stringify(r.room.impl.game.g.players.map((p) => p.hand))],
    view: (st) => assert.deepEqual(st.myHand, []),
    blind: (r) => r.cs[1],
  },
  {
    mode: 'liar', n: 3, act: { t: 'lg', a: 'vote', target: 'ann1' }, actErr: 'lg_spec', chat: 'lg_chat',
    play: (r) => liarWalk(r, 'discuss'),
    secrets: (r) => [r.room.impl.game.citizenWord, r.room.impl.game.liarWord].filter(Boolean),
    view: (st) => assert.deepEqual(st.my, { word: null, role: null }),
    blind: null, // 참가자는 모두 단어를 안다: 알림 비교 대신 비밀 글자 검사만
  },
  {
    mode: 'yacht', n: 2, act: { t: 'yt', a: 'roll' }, actErr: 'yt_spec', chat: 'ok',
    secrets: () => [], view: () => {}, blind: (r) => r.cs[1],
  },
  {
    mode: 'draw', n: 3, act: { t: 'dr', a: 'skip' }, actErr: 'dr_spec', chat: 'dr_spec',
    // 고르는 중(choices 가 그리는 사람에게만)부터, 고른 뒤 선 하나·한 명 정답·정답자끼리 글까지
    play: async (r) => {
      const drawer = r.cs.find((c) => c.state.you === c.state.drawerId);
      r.drawWords = r.room.impl.g.cur.cands.flatMap((c) => [c.w, ...(c.alt ?? [])]);
      await drawer.send({ t: 'dr', a: 'pick', i: 0 });
      await drawer.send({ t: 'dr', a: 'st', c: 0, w: 2, e: 0, p: [10, 10] });
      await drawer.send({ t: 'dr', a: 'pt', p: [5, 5] });
      const [g1, g2] = r.cs.filter((c) => c !== drawer);
      await r.tick(1100);
      await g1.send({ t: 'chat', text: drawer.state.word });
      await r.tick(1100);
      await g1.send({ t: 'chat', text: '정답자끼리 글' });
      await r.tick(1100);
      await g2.send({ t: 'chat', text: '틀린 답' });
      r.blindOne = g2;
      r.drawer = drawer;
    },
    secrets: (r) => [...r.drawWords, '정답자끼리 글'],
    view: (st) => { assert.equal(st.word, null); assert.equal(st.choices, null); },
    blind: (r) => r.blindOne,
    after: (r, s) => {
      assert.ok(events(s, 'drSt').length >= 1 && events(s, 'drPt').length >= 1, '관전자도 그림 선을 받는다');
      assert.ok(events(s, 'drHit').length >= 1, '맞힘 알림은 받는다');
      assert.ok(events(s, 'chat').some((e) => e.text === '틀린 답'), '공개 글은 받는다');
      assert.equal(events(s, 'chat').some((e) => e.sec), false, '정답자끼리 글은 안 받는다');
    },
  },
  {
    mode: 'gsk', n: 3, act: { t: 'gk', a: 'place', k: 'F' }, actErr: 'gk_spec', chat: 'ok',
    play: async (r) => { for (const c of r.cs) await c.send({ t: 'gk', a: 'place', k: c.id === 'bob1' ? 'S' : 'F' }); },
    secrets: () => [],
    view: (st) => { assert.equal(st.mine, null); assert.ok(st.seats.every((x) => x.id !== st.you)); },
    blind: (r) => r.cs[2],
  },
  {
    mode: 'mini', n: 2, act: { t: 'mn', a: 'resign' }, actErr: 'mn_spec', chat: 'ok',
    secrets: () => [], view: (st) => assert.equal(st.mySeat, -1), blind: (r) => r.cs[1],
  },
  {
    // 혼자 놀기: 종목 표를 비워 만들어(자동 시작 실패 = 대기실) 시작 직전에 가짜 종목을 넣는다. 비밀 = seed(하는 사람에게만, play 부터)
    mode: 'solo', n: 2, act: { t: 'so', a: 'end', score: 0 }, actErr: 'so_spec', chat: 'ok',
    setup: (h) => { h.hub.soloEngines = {}; },
    beforeStart: async (r) => { r.hub.soloEngines = { [turnEngine.id]: turnEngine }; await r.cs[0].send({ t: 'set', patch: { game: turnEngine.id } }); },
    play: async (r) => { await r.tick(3100); r.seed = r.cs[0].state.so.seed; assert.ok(Number.isInteger(r.seed), '하는 사람은 play 에서 seed 를 받는다'); },
    secrets: (r) => [String(r.seed)],
    view: (st) => { assert.equal(st.so?.seed, undefined); assert.ok(st.players.every((p) => p.id === st.pid || p.spectating)); },
    blind: (r) => r.cs[1],
  },
];

async function seat(spec) {
  const h = makeHub();
  spec.setup?.(h);
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1'].slice(0, spec.n)) cs.push(await h.login(id));
  await cs[0].send({ t: 'create', mode: spec.mode });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  return { ...h, cs, code, room: h.hub.rooms.get(code) };
}

for (const spec of MODES) {
  const M = spec.mode;

  test(`${M}: 관전자는 대기 중에 들어와 관전 줄에만, 게임을 시작해도 자리·차례·방장 밖`, async () => {
    const r = await seat(spec);
    const s = await r.login('관전1');
    await s.send({ t: 'join', code: r.code });
    assert.equal(lastErr(s), undefined);
    assert.deepEqual(r.room.members.map((m) => m.id), r.cs.map((c) => c.id), '참가자 그대로');
    assert.deepEqual(r.cs[0].state.specs.map((x) => x.id), ['관전1']);
    assert.ok(!s.state.players.some((p) => p.id === '관전1'));
    await spec.beforeStart?.(r);
    await r.cs[0].send({ t: 'start' });
    assert.equal(lastErr(r.cs[0]), undefined, '시작');
    assert.equal(r.cs[0].state.wait, null, '게임 중');
    assert.ok(!s.state.players.some((p) => p.id === '관전1'), '게임 중에도 참가자 줄에 없음');
    assert.notEqual(s.state.hostId, '관전1');
    spec.view(s.state);
  });

  test(`${M}: 관전자 기기에는 비밀이 가지 않는다(게임 중 들어온 관전자 포함), 게임 요청은 ${spec.actErr}`, async () => {
    const r = await seat(spec);
    const s = await r.login('관전1');
    await s.send({ t: 'join', code: r.code });
    await spec.beforeStart?.(r);
    await r.cs[0].send({ t: 'start' });
    const late = await r.login('관전2');
    await late.send({ t: 'join', code: r.code });
    assert.equal(lastErr(late), undefined, '게임 중에도 들어온다');
    const b = spec.blind?.(r);
    const marks = { s: s.sock.msgs.length, b: b?.sock.msgs.length };
    await spec.play?.(r);
    const secrets = spec.secrets(r);
    for (const c of [s, late]) {
      spec.view(c.state);
      const all = JSON.stringify(c.sock.msgs);
      for (const x of secrets) assert.equal(all.includes(x), false, `${c.id} 가 비밀 ${x} 를 받음`);
      const n = c.sock.msgs.length;
      await c.send(spec.act);
      assert.equal(lastErr(c, n), spec.actErr, '게임 요청은 게임에 가지 않는다');
    }
    if (b) { // 관전자가 받은 게임 알림 ⊆ 비밀을 모르는 참가자가 받은 알림
      const evs = (c, from) => c.sock.msgs.slice(from).filter((m) => m.t === 'event' && !SHELL_OWN.has(m.e.k)).map((m) => JSON.stringify(m.e));
      const seen = new Set(evs(b, marks.b));
      for (const e of evs(s, marks.s)) assert.ok(seen.has(e), `참가자가 못 받은 알림을 관전자가 받음: ${e}`);
    }
    spec.after?.(r, s);
  });

  test(`${M}: 관전자 채팅은 그 게임 규칙(게임 중 ${spec.chat}), 이모티콘 가능, 방장이 내보낼 수 있다`, async () => {
    const r = await seat(spec);
    const s = await r.login('관전1');
    await s.send({ t: 'join', code: r.code });
    let n = s.sock.msgs.length;
    await s.send({ t: 'chat', text: '대기 중 인사' });
    assert.equal(lastErr(s, n), undefined, '대기 중 채팅');
    assert.ok(events(r.cs[0], 'chat').some((e) => e.id === '관전1'), '참가자가 받는다');
    await spec.beforeStart?.(r);
    await r.cs[0].send({ t: 'start' });
    if (M === 'liar') await liarWalk(r, 'discuss');
    freeLimits(r.hub);
    await r.tick(1100);
    n = s.sock.msgs.length;
    await s.send({ t: 'chat', text: '게임 중 한마디' });
    assert.equal(lastErr(s, n) ?? 'ok', spec.chat);
    n = s.sock.msgs.length;
    await s.send({ t: 'emote', e: 1 });
    assert.equal(lastErr(s, n), undefined, '기본 이모티콘');
    assert.ok(events(r.cs[0], 'emote').some((e) => e.id === '관전1'));
    await r.cs[0].send({ t: 'kick', id: '관전1' });
    assert.equal(s.state, null, '내보냄');
    assert.equal(r.room.specs.length, 0);
  });

  test(`${M}: 참가자가 모두 나가면 관전자에게 알리고 방을 닫는다, 관전 계정은 방을 못 만든다`, async () => {
    const r = await seat(spec);
    const s = await r.login('관전1');
    await s.send({ t: 'join', code: r.code });
    for (const c of r.cs) await c.send({ t: 'leave' });
    assert.equal(s.state, null);
    assert.match(lastErr(s), /_closed$/);
    const n = s.sock.msgs.length;
    await s.send({ t: 'create', mode: M });
    assert.equal(lastErr(s, n), 'spec_create');
  });
}
