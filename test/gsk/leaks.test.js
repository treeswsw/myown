// 갱스껄 비밀 시험 (GDD 4절, 12절 시나리오 3).
// 꽃을 놓든 해골을 놓든 다른 사람·관전자가 받는 이벤트와 viewFor 결과는 글자 하나까지 같아야 한다.
// 공개 전 원판 종류·손 구성·버린 종류·벌칙 칸 순서는 남의 시점 어디에도 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, act, tick, viewFor, leave, start } from '../../shared/gsk/game.js';

const T0 = 2_000_000;
const rng0 = () => 0;
const rngLast = (n) => n - 1;
const IDS = ['p0', 'p1', 'p2', 'p3'];

// 4명 + 관전자 1명. 로그: viewer 별로 [이벤트 JSON, viewFor JSON] 을 순서대로 쌓는다.
function world(rnd = rng0) {
  const s = createGame({ code: 'ZZZZ', hostId: 'p0' });
  for (const id of IDS) addPlayer(s, { id, name: id });
  const log = { p0: [], p1: [], p2: [], p3: [], spec: [] };
  const w = { s, log, rnd, now: T0 };
  const viewers = [...IDS, 'spec'];
  const record = (fx) => {
    for (const v of viewers) {
      const evs = fx.events.filter((x) => x.to === 'all' || x.to === v).map((x) => x.e);
      log[v].push(JSON.stringify(evs), JSON.stringify(viewFor(s, v)));
    }
  };
  w.record = record;
  const fx0 = start(s, 'p0', T0, rnd);
  addPlayer(s, { id: 'spec', name: 'spec' }); // 판 중 들어온 관전자
  record(fx0);
  w.act = (id, msg) => {
    if (msg.a === 'flip' && s.busyUntil != null) w.now = Math.max(w.now, s.busyUntil); // 앞 장 연출이 끝난 뒤에만 누를 수 있다
    const r = act(s, id, msg, w.now, rnd); assert.equal(r.ok, true, `${id} ${JSON.stringify(msg)} ${r.code}`); record(r);
    while (msg.a === 'flip' && s.pend) w.tickTo(s.flipAt); // 판정은 연출 시간 뒤
    return r;
  };
  w.tickTo = (t) => { w.now = t; record(tick(s, t, rnd)); };
  return w;
}
const order = (s) => s.seats.map((x) => x.id);

// 모든 말단 값 경로
function leaves(o, path = '', out = []) {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) leaves(v, `${path}/${k}`, out);
  else out.push([path, o]);
  return out;
}

// ----- 1. 놓는 것이 꽃이든 해골이든 남이 받는 것은 똑같다 -----
function placeScenario(kind) {
  const w = world();
  const [a, b, c, d] = order(w.s);
  // setup: a 가 kind, 나머지는 꽃. 놓는 순서도 같게.
  w.act(a, { a: 'place', k: kind });
  for (const id of [b, c, d]) w.act(id, { a: 'place', k: 'F' });
  // 차례 단계: 시작 사람이 꽃을 한 장 더 쌓는다
  const st = w.s.starter;
  w.act(st, { a: 'place', k: 'F' });
  return { w, a, st };
}

test('setup 에서 꽃/해골을 놓아도 다른 사람·관전자가 받는 모든 것이 완전히 같다', () => {
  const F = placeScenario('F');
  const S = placeScenario('S');
  assert.deepEqual(order(F.w.s), order(S.w.s));
  const a = F.a;
  for (const v of [...IDS, 'spec']) {
    if (v === a) continue; // 놓은 본인은 자기 손을 안다
    assert.deepEqual(S.w.log[v], F.w.log[v], `${v} 시점이 다르다`);
  }
  // 본인에게는 다르다(자기 손/더미): 시험이 아무것도 안 보는 게 아님을 확인
  assert.notDeepEqual(S.w.log[a], F.w.log[a]);
});

test('차례 단계에서 꽃/해골을 쌓아도 남의 시점은 같다 (이벤트 모양·키 순서 포함)', () => {
  function run(kind) {
    const w = world();
    const ids = order(w.s);
    for (const id of ids) w.act(id, { a: 'place', k: 'F' });
    const me = w.s.turnId;
    w.act(me, { a: 'place', k: kind });
    return { w, me };
  }
  const F = run('F'), S = run('S');
  const me = F.me;
  const lastEv = (w, v) => w.log[v][w.log[v].length - 2];
  for (const v of [...IDS, 'spec']) {
    if (v === me) continue;
    assert.equal(lastEv(S.w, v), lastEv(F.w, v), `${v} 이벤트`);
    assert.equal(S.w.log[v][S.w.log[v].length - 1], F.w.log[v][F.w.log[v].length - 1], `${v} 화면`);
  }
  assert.match(lastEv(F.w, 'p1').replace(/"id":"p\d"/g, '"id":"X"'), /^\[\{"k":"gkPlace","id":"X","stack":2\},\{"k":"gkTurn","id":"X"\}\]$/);
});

// ----- 2. 공개 전에는 종류('F'/'S')가 남의 시점 어디에도 없다 -----
test('공개 전 원판 종류·손 구성은 남의 이벤트와 화면 어디에도 없다', () => {
  const w = world();
  const [a, b, c, d] = order(w.s);
  w.act(a, { a: 'place', k: 'S' }); w.act(b, { a: 'place', k: 'F' }); w.act(c, { a: 'place', k: 'S' }); w.act(d, { a: 'place', k: 'F' });
  const me = w.s.turnId;
  w.act(me, { a: 'place', k: 'F' });
  for (const v of IDS.filter((x) => x !== a && x !== c)) {
    const mine = viewFor(w.s, v).mine;
    assert.ok(mine);
    // 남(a, c)의 칸/장면에서 종류 글자가 없다. 본인의 mine 만 빼고 말단 검사
    const view = viewFor(w.s, v); delete view.mine;
    const bad = leaves(view).filter(([, val]) => val === 'F' || val === 'S');
    assert.deepEqual(bad, [], `${v} 화면에 종류 글자`);
  }
  // 관전자: mine 자체가 없다
  assert.equal(viewFor(w.s, 'spec').mine, null);
  assert.deepEqual(leaves(viewFor(w.s, 'spec')).filter(([, val]) => val === 'F' || val === 'S'), []);
  // 이벤트 로그에도 종류 필드 없음(공개 전)
  for (const v of ['p1', 'p2', 'p3', 'spec']) {
    const joined = w.log[v].filter((_, i) => i % 2 === 0).join('');
    assert.equal(/"disc"|gkFlip|gkLoseMine/.test(joined), false);
  }
  // 손 구성: 다른 사람이 보는 seats 엔 장수만
  const sv = viewFor(w.s, b).seats.find((x) => x.id === a);
  assert.equal(typeof sv.hand, 'number'); assert.equal(typeof sv.stack, 'number'); assert.deepEqual(sv.shown, []);
});

// ----- 3. 공개된 것만 모두에게, 라운드가 끝나면 다시 비밀 -----
test('뒤집힌 원판만 모두에게 보이고, 다음 라운드엔 다시 비밀', () => {
  const w = world();
  const [a, b, c, d] = order(w.s);
  for (const id of [a, b, c, d]) w.act(id, { a: 'place', k: id === b ? 'S' : 'F' });
  const ch = w.s.turnId;
  w.act(ch, { a: 'bid', n: 2 });
  while (w.s.step === 'bid') w.act(w.s.turnId, { a: 'pass' });
  while (w.s.flipAt != null) w.tickTo(w.s.flipAt);
  const target = ch === b ? c : b;
  if (w.s.step === 'flip') w.act(ch, { a: 'flip', p: target });
  // 공개된 쪽: 모든 시점의 shown 이 같다
  const shownOf = (v) => viewFor(w.s, v).seats.map((x) => x.shown.join(''));
  assert.deepEqual(shownOf('p1'), shownOf('spec'));
  assert.deepEqual(shownOf('p2'), shownOf('p3'));
  w.tickTo(w.s.endsAt);
  if (w.s.step === 'penalty') {
    const pen = viewFor(w.s, 'spec').penalty;
    w.act(pen.by, { a: 'discard', k: 'F' });
  }
  w.tickTo(w.s.endsAt);
  assert.equal(w.s.step, 'setup');
  for (const v of ['p0', 'p1', 'p2', 'p3', 'spec']) {
    assert.ok(viewFor(w.s, v).seats.every((x) => x.shown.length === 0 && x.stack === 0));
  }
});

// ----- 4. 벌칙: 버린 종류는 도전자만 (GDD 17절) -----
function penaltyWorld(kind) {
  const w = world();
  const st = w.s.starter;
  const skullMan = order(w.s).find((x) => x !== st);
  for (const id of order(w.s)) w.act(id, { a: 'place', k: id === skullMan ? 'S' : 'F' });
  w.act(st, { a: 'bid', n: 2 });
  while (w.s.step === 'bid') w.act(w.s.turnId, { a: 'pass' });
  while (w.s.flipAt != null) w.tickTo(w.s.flipAt);
  w.act(st, { a: 'flip', p: skullMan });
  w.now = w.s.endsAt;
  w.record(tick(w.s, w.now, rng0));
  assert.deepEqual(viewFor(w.s, 'spec').penalty, { by: st, target: st, n: 4, faceUp: true });
  w.act(st, { a: 'discard', k: kind });
  return { w, st, skullMan };
}

test('버린 종류는 도전자 본인 말고는 모른다 (관전자 포함)', () => {
  const X = penaltyWorld('F');
  const Y = penaltyWorld('S');
  assert.equal(X.st, Y.st);
  const ch = X.st;
  assert.notDeepEqual(viewFor(X.w.s, ch).mine.lost, viewFor(Y.w.s, ch).mine.lost);
  for (const v of [...IDS, 'spec']) {
    if (v === ch) continue;
    assert.deepEqual(X.w.log[v], Y.w.log[v], `${v}: 버린 종류가 남의 시점에 영향을 줌`);
  }
  const has = (w, v) => w.log[v].filter((_, i) => i % 2 === 0).join('').includes('gkLoseMine');
  for (const v of IDS.filter((x) => x !== ch).concat('spec')) assert.equal(has(X.w, v), false, v);
  assert.equal(has(X.w, ch), true);
  for (const v of [...IDS.filter((x) => x !== ch), 'spec']) {
    const view = viewFor(X.w.s, v);
    delete view.mine;
    assert.deepEqual(leaves(view).filter(([, val]) => val === 'F' || val === 'S'), []);
  }
});

test('자기 해골로 실패해도 남이 보는 것은 도전자 본인 선택 종류가 없다', () => {
  const w = world();
  const st = w.s.starter;
  for (const id of order(w.s)) w.act(id, { a: 'place', k: id === st ? 'S' : 'F' });
  w.act(st, { a: 'bid', n: 2 });
  while (w.s.step === 'bid') w.act(w.s.turnId, { a: 'pass' });
  while (w.s.flipAt != null) w.tickTo(w.s.flipAt); // 자기 해골이 먼저 공개, 연출 뒤 판정
  w.tickTo(w.s.endsAt);
  assert.equal(viewFor(w.s, 'spec').penalty.faceUp, true);
  w.act(st, { a: 'discard', k: 'F' }); // 해골이 공개돼도 "무엇을 버렸는지"는 남이 모른다
  for (const v of IDS.filter((x) => x !== st).concat('spec')) {
    const j = w.log[v].filter((_, i) => i % 2 === 0).join('');
    assert.equal(j.includes('gkLoseMine'), false);
    const view = viewFor(w.s, v);
    assert.equal(view.mine === null || v !== 'spec', true);
    delete view.mine;
    assert.deepEqual(leaves(view).filter(([, val]) => val === 'F' || val === 'S'), []);
  }
});

// ----- 5. 해골 주인이 나가도 버린 종류는 도전자만 안다 -----
test('해골 주인 이탈 뒤에도 버린 종류는 도전자 말고 아무에게도 가지 않는다', () => {
  const w = world();
  const st = w.s.starter;
  const skullMan = order(w.s).find((x) => x !== st);
  for (const id of order(w.s)) w.act(id, { a: 'place', k: id === skullMan ? 'S' : 'F' });
  w.act(st, { a: 'bid', n: 2 });
  while (w.s.step === 'bid') w.act(w.s.turnId, { a: 'pass' });
  while (w.s.flipAt != null) w.tickTo(w.s.flipAt);
  w.act(st, { a: 'flip', p: skullMan });
  w.record(leave(w.s, skullMan, w.now, rng0));
  w.now = w.s.endsAt;
  w.record(tick(w.s, w.now, rngLast));
  assert.equal(w.s.step, 'penalty');
  w.act(st, { a: 'discard', k: 'S' });
  assert.equal(w.s.step, 'between');
  const has = (v) => w.log[v].filter((_, i) => i % 2 === 0).join('').includes('gkLoseMine');
  assert.equal(has(st), true);
  for (const v of [...IDS.filter((x) => x !== st), 'spec']) assert.equal(has(v), false, v);
});
