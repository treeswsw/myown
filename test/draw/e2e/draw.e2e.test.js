// 갱식마인드 허브 연결 e2e: 진짜 서버(server/index.js startServer) + ws 접속.
// 라이어 e2e 처럼 서버 시계만 빠르게 넣는다(k배). 요청 한도 시험만 k=1(진짜 시계)로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../../../server/index.js';
import { createStore } from '../../../server/store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['alpha', 'bravo', 'charl'];

async function until(fn, what, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) assert.fail(`timeout: ${what}`);
    await sleep(4);
  }
}

async function boot({ k = 20, draw = 'test', liar = 'on' } = {}) {
  const t0 = Date.now();
  const now = () => t0 + (Date.now() - t0) * k;
  const timers = { setTimeout: (fn, ms) => setTimeout(fn, ms / k).unref(), clearTimeout };
  const store = createStore();
  await store.init?.();
  const app = await startServer({ port: 0, store, hubOptions: { now, timers, draw, liar } });
  const clients = [];
  return {
    app,
    async client(id) {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
      const c = { id, ws, state: null, me: null, rooms: null, errors: [], events: [] };
      c.send = (obj) => ws.send(JSON.stringify(obj));
      c.set = (patch) => ws.send(JSON.stringify({ t: 'set', patch }));
      c.dr = (a, extra = {}) => ws.send(JSON.stringify({ t: 'dr', a, ...extra }));
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        if (m.t === 'room') c.state = m.state;
        else if (m.t === 'me') c.me = m;
        else if (m.t === 'rooms') c.rooms = m.list;
        else if (m.t === 'error') c.errors.push(m);
        else if (m.t === 'event') c.events.push(m.e);
      });
      await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
      c.send({ t: 'login', id });
      await until(() => c.me, `login ${id}`);
      clients.push(c);
      return c;
    },
    async close() {
      for (const c of clients) c.ws.close();
      await app.close();
      await store.close?.();
    },
  };
}

async function room3(s) {
  const cs = [];
  for (const id of NAMES) cs.push(await s.client(id));
  cs[0].send({ t: 'create', mode: 'draw' });
  await until(() => cs[0].state?.code, 'create draw room');
  for (const c of cs.slice(1)) c.send({ t: 'join', code: cs[0].state.code });
  await until(() => cs.every((c) => c.state?.players?.length === 3), 'join');
  return cs;
}

test('DRAW 꺼짐: create mode:draw 는 dr_off', async (t) => {
  const s = await boot({ draw: 'off' });
  t.after(() => s.close());
  const a = await s.client('alpha');
  assert.equal(a.me.draw, 'off');
  a.send({ t: 'create', mode: 'draw' });
  await until(() => a.errors.length, 'error');
  assert.equal(a.errors[0].code, 'dr_off');
  assert.equal(a.errors[0].msg, '갱식마인드는 아직 열리지 않았습니다.');
  assert.equal(a.state, null);
});

test('DRAW=test: 한 판 — 만들기·입장·시작·pick·그림 전달·정답·drHit·reveal·final, me.draw, 방 목록', async (t) => {
  const s = await boot({ k: 20 });
  t.after(() => s.close());
  const watcher = await s.client('delta'); // 로비에 남아 방 목록을 본다
  const cs = await room3(s);
  const [a] = cs;
  assert.ok(cs.every((x) => x.me.draw === 'test'), 'me.draw');
  assert.equal(a.state.mode, 'draw');

  await until(() => watcher.rooms?.some((r) => r.code === a.state.code && r.count === 3), 'rooms list');
  const row = watcher.rooms.find((r) => r.code === a.state.code);
  assert.equal(row.mode, 'draw');
  assert.equal(row.max, 8);
  assert.equal(row.phase, 'lobby');

  a.set({ rounds: 1, time: 60 });
  await until(() => cs.every((x) => x.state.settings.rounds === 1 && x.state.settings.time === 60), 'settings');
  a.send({ t: 'start' });

  for (let q = 1; q <= 3; q++) {
    await until(() => cs.every((x) => x.state.phase === 'pick' && x.state.q === q), `pick q${q}`);
    const drawer = cs.find((x) => x.id === a.state.drawerId);
    const guessers = cs.filter((x) => x !== drawer);
    assert.equal(drawer.state.choices.length, 3);
    assert.ok(guessers.every((x) => x.state.choices === null && x.state.word === null), '정답 후보는 그리는 사람만');
    if (q === 1) {
      await until(() => watcher.rooms.find((r) => r.code === a.state.code)?.phase === 'playing', 'rooms phase playing');
    }
    drawer.dr('pick', { i: 0 });
    await until(() => cs.every((x) => x.state.phase === 'draw'), `draw q${q}`);
    const word = drawer.state.word;
    assert.equal(typeof word, 'string');

    // 그림: 다른 두 명에게 st/pt 가 도착한다
    const drawerSt = drawer.events.filter((e) => e.k === 'drSt').length;
    const nSt = guessers.map((g) => g.events.filter((e) => e.k === 'drSt').length);
    drawer.dr('st', { c: 4, w: 10, e: 0, p: [100, 100, 5, 5] });
    drawer.dr('pt', { p: [5, 5, 5, 5], f: 1 });
    await until(() => guessers.every((g, i) => g.events.filter((e) => e.k === 'drSt').length > nSt[i] &&
      g.events.some((e) => e.k === 'drPt')), 'strokes arrive');
    assert.equal(drawer.events.filter((e) => e.k === 'drSt').length, drawerSt, '그린 사람에게는 되돌려 보내지 않음');

    // 정답 chat → drHit (정답 글은 chat 으로 나가지 않는다)
    for (const g of guessers) g.send({ t: 'chat', text: word });
    await until(() => cs.every((x) => x.events.filter((e) => e.k === 'drHit').length >= 2 * q), `drHit q${q}`);
    await until(() => cs.every((x) => x.state.phase === 'reveal' || x.state.phase === 'final'), `reveal q${q}`);
    if (cs[0].state.phase === 'reveal') {
      assert.equal(cs[0].state.reveal.word, word);
      assert.equal(cs[0].state.reveal.why, 'all');
    }
    assert.ok(!cs.some((x) => x.events.some((e) => e.k === 'chat' && e.text === word && !e.sec)), '정답이 모두에게 새지 않음');
  }
  await until(() => cs.every((x) => x.state.phase === 'final'), 'final');
  assert.equal(a.state.ranking.length, 3);
  assert.deepEqual(cs.flatMap((x) => x.errors), [], '오류 없이 끝남');
});

test('다른 방·다른 요청: 포커·라이어 방의 dr, draw 방의 act/mode/play/liar/lg', async (t) => {
  const s = await boot({ k: 20 });
  t.after(() => s.close());
  const a = await s.client('alpha');
  const b = await s.client('bravo');
  const c = await s.client('charl');
  const d = await s.client('delta');

  // 포커 방
  a.send({ t: 'create', mode: 'holdem' });
  await until(() => a.state?.code, 'holdem room');
  a.dr('give');
  a.send({ t: 'mode', mode: 'draw' });
  await until(() => a.errors.length >= 2, 'holdem errors');
  assert.equal(a.errors[0].msg, '알 수 없는 요청입니다.');
  assert.equal(a.errors[1].msg, '방을 새로 만들어 주세요.');

  // 라이어 방
  b.send({ t: 'create', mode: 'liar' });
  await until(() => b.state?.code, 'liar room');
  b.dr('give');
  await until(() => b.errors.length >= 1, 'liar error');
  assert.equal(b.errors[0].msg, '알 수 없는 요청입니다.');

  // draw 방
  c.send({ t: 'create', mode: 'draw' });
  await until(() => c.state?.code, 'draw room');
  d.send({ t: 'join', code: c.state.code });
  await until(() => d.state?.players?.length === 2, 'join draw');
  for (const m of [{ t: 'act', a: 'fold' }, { t: 'mode', mode: 'bluff' }, { t: 'play', cards: [0] }, { t: 'liar' }]) {
    c.errors.length = 0;
    c.send(m);
    await until(() => c.errors.length, `dr_now for ${m.t}`);
    assert.equal(c.errors[0].code, 'dr_now', JSON.stringify(m));
    assert.equal(c.errors[0].msg, '지금은 할 수 없습니다.');
  }
  // 공용 방 틀(1-6): 다른 게임의 봉투는 dr_bad
  c.errors.length = 0;
  c.send({ t: 'lg', a: 'end' });
  await until(() => c.errors.length, 'dr_bad for lg');
  assert.equal(c.errors[0].code, 'dr_bad');
  assert.equal(c.errors[0].msg, '알 수 없는 요청입니다.');
  // 봉투 검사: a 가 없거나 너무 길면 형식 오류
  c.errors.length = 0;
  c.send({ t: 'dr' });
  c.send({ t: 'dr', a: 'x'.repeat(21) });
  await until(() => c.errors.length >= 2, 'envelope errors');
  assert.ok(c.errors.every((e) => e.msg === '잘못된 메시지 형식입니다.'));
  // 방 안의 일반 오류(코드 있음): 방장이 아닌 사람의 settings
  d.set({ rounds: 2 });
  await until(() => d.errors.length, 'host only');
  assert.equal(d.errors[0].code, 'dr_host');
});

test('그리는 사람이 초당 30개 pt 를 보내도 버려지지 않는다 (진짜 시계)', async (t) => {
  const s = await boot({ k: 1 });
  t.after(() => s.close());
  const cs = await room3(s);
  cs[0].send({ t: 'start' });
  await until(() => cs.every((x) => x.state.phase === 'pick'), 'pick');
  const drawer = cs.find((x) => x.id === cs[0].state.drawerId);
  const others = cs.filter((x) => x !== drawer);
  drawer.dr('pick', { i: 1 });
  await until(() => cs.every((x) => x.state.phase === 'draw'), 'draw');
  drawer.dr('st', { c: 0, w: 4, e: 0, p: [200, 200, 1, 1] });
  for (let i = 0; i < 40; i++) { // 약 30/초로 40개
    drawer.dr('pt', { p: [1, 1] });
    await sleep(33);
  }
  drawer.dr('pt', { p: [], f: 1 });
  await until(() => others.every((o) => o.events.filter((e) => e.k === 'drPt').length >= 41), 'all pt delivered', 4000);
  assert.deepEqual(drawer.errors, []);
});
