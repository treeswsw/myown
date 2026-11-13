// 비밀 유지 시험: '다른 제시어'(word) 방식에서 라이어가 받는 것은 시민이 받는 것과 모양이 같아야 한다.
// 다른 것은 my.word 의 값뿐. (정체 공개 unmask 전까지 reveal·speak·discuss·revote 단계마다 검사)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, tick, viewFor } from '../../shared/liar/game.js';

const T0 = 5_000_000;
const S = 1000;
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const identity = (n) => Array.from({ length: n - 1 }, (_, i) => n - 1 - i);
const seqRng = (values) => { let i = 0; return (n) => { const v = values[i++]; assert.ok(v >= 0 && v < n); return v; }; };
const DRAW = { topic: '장소', citizenWord: '도서관', liarWord: '놀이공원' };

// 토론·투표 중인 판에서 p0 을 처형해 unmask 까지 간다(알림을 모아 돌려준다). 투표가 무산되면 판이 끝나지 않으므로 처형으로만 정체가 공개된다.
function executeP0(g) {
  const ev = [];
  const at = (t) => g.phaseStartedAt ?? t;
  for (const id of g.players) if (id !== 'p0') ev.push(...act(g, { type: 'vote', by: id, target: 'p0' }, at()).events);
  ev.push(...act(g, { type: 'vote', by: 'p0', target: 'p1' }, at()).events);
  ev.push(...tick(g, g.phaseEndsAt).events);   // defense
  ev.push(...tick(g, g.phaseEndsAt).events);   // judge
  for (const id of g.players) if (id !== 'p0') ev.push(...act(g, { type: 'judge', by: id, v: 'yes' }, g.phaseStartedAt).events);
  ev.push(...tick(g, g.phaseEndsAt).events);   // judged
  ev.push(...tick(g, g.phaseEndsAt).events);   // unmask
  return ev;
}

function make(n, liarIdx, extra = {}) {
  return createGame({
    players: ids(n), draw: DRAW, now: T0, settings: extra.settings,
    rng: seqRng([liarIdx, ...identity(n), ...identity(n)]),
  });
}

// 키 이름·순서·값 종류를 경로 목록으로 만든다 (my.word 의 값은 제외하고 모양만)
function shape(value, path = '$', out = []) {
  if (Array.isArray(value)) {
    out.push(`${path}:array(${value.length})`);
    value.forEach((v, i) => shape(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    out.push(`${path}:{${Object.keys(value).join(',')}}`);
    for (const k of Object.keys(value)) shape(value[k], `${path}.${k}`, out);
  } else {
    out.push(`${path}:${value === null ? 'null' : typeof value}`);
  }
  return out;
}
// my.word 만 지운 복사본: 이것까지 같아야 "다른 것은 my.word 뿐"
const withoutWord = (v) => ({ ...v, my: { ...v.my, word: '<단어>' } });

function assertIndistinguishable(g, label) {
  const liar = viewFor(g, g.liarId);
  const citizens = g.players.filter((id) => id !== g.liarId).map((id) => viewFor(g, id));
  assert.ok(citizens.length >= 2, label);
  for (const c of citizens) {
    assert.deepEqual(shape(liar), shape(c), `${label}: 모양`);
    assert.deepEqual(Object.keys(liar), Object.keys(c), `${label}: 키 순서`);
    assert.deepEqual(Object.keys(liar.my), Object.keys(c.my), `${label}: my 키`);
    assert.deepEqual(withoutWord(liar), withoutWord(c), `${label}: my.word 외 값`);
    assert.equal(liar.my.role, null, `${label}: 라이어 role`);
    assert.equal(c.my.role, null, `${label}: 시민 role`);
  }
  // 라이어 것에는 "라이어"를 알려 주는 글자가 어디에도 없다
  const s = JSON.stringify(liar);
  assert.ok(!s.includes('"liar"') && !s.includes('liarId') && !s.includes('wasLiar') && !s.includes('citizen'), `${label}: 글자 누출`);
  assert.ok(!s.includes(DRAW.citizenWord), `${label}: 라이어가 시민 단어를 받음`);
  // 시민 것에도 라이어의 단어가 없다
  for (const c of citizens) assert.ok(!JSON.stringify(c).includes(DRAW.liarWord), `${label}: 시민이 라이어 단어를 받음`);
}


// 첫 설명을 쓰고 3초 머무는 시간까지 넘긴다(알림은 합쳐서 돌려준다)
function sayT(g, by, text, t) {
  const r = act(g, { type: 'say', by, text }, t);
  if (r.ok && g.speakHold) r.events = [...r.events, ...tick(g, g.phaseEndsAt).events];
  return r;
}

for (const N of [3, 8]) {
  for (const liarIdx of [0, N - 1]) {
    test(`[${N}명, 라이어 p${liarIdx}] word 방식: reveal·speak·discuss·revote 마다 라이어/시민 view 모양이 같다`, () => {
      const g = make(N, liarIdx);
      assertIndistinguishable(g, 'reveal');

      tick(g, g.phaseEndsAt);
      assertIndistinguishable(g, 'speak 시작');
      // 한 명은 쓰고 한 명은 못 쓰고 지나가는 등 여러 순간
      act(g, { type: 'say', by: g.order[0], text: '조용한 곳' }, g.phaseStartedAt + S);
      assertIndistinguishable(g, 'speak 첫 설명 뒤(3초 머묾)');
      tick(g, g.phaseEndsAt);
      assertIndistinguishable(g, 'speak 머문 뒤 다음 차례');
      tick(g, g.phaseEndsAt);
      assertIndistinguishable(g, 'speak 시간 초과 뒤');
      act(g, { type: 'say', by: g.order[0], text: '이미 씀' }, g.phaseStartedAt);   // 거절돼도 상태 변화 없음
      assertIndistinguishable(g, 'speak 거절 뒤');
      for (const id of g.order.slice(2)) sayT(g, id, `${id}의 설명`, g.phaseStartedAt);
      assert.equal(g.phase, 'discuss');
      assertIndistinguishable(g, 'discuss 시작');
      act(g, { type: 'say', by: g.order[1], text: '늦은 설명' }, g.phaseStartedAt + S);
      assertIndistinguishable(g, 'discuss 늦은 추가 뒤');

      // 라이어를 포함한 표가 오가도 view 는 같다
      act(g, { type: 'vote', by: g.liarId, target: g.players.find((p) => p !== g.liarId) }, g.phaseStartedAt + 2 * S);
      act(g, { type: 'vote', by: g.players.find((p) => p !== g.liarId), target: g.liarId }, g.phaseStartedAt + 2 * S);
      assertIndistinguishable(g, 'discuss 표 뒤');

      // 동점으로 revote: 두 사람이 서로를 찍고 나머지는 기권
      const h = make(N, liarIdx);
      tick(h, h.phaseEndsAt);                              // reveal → speak
      for (let i = 0; i < N; i++) tick(h, h.phaseEndsAt);  // 모두 시간 초과로 지나감 → discuss
      assert.equal(h.phase, 'discuss');
      act(h, { type: 'vote', by: 'p0', target: 'p1' }, h.phaseStartedAt);
      act(h, { type: 'vote', by: 'p1', target: 'p0' }, h.phaseStartedAt);
      tick(h, h.phaseEndsAt);
      assert.equal(h.phase, 'revote');
      assertIndistinguishable(h, 'revote');
      act(h, { type: 'vote', by: 'p2', target: 'p1' }, h.phaseStartedAt + S);
      assertIndistinguishable(h, 'revote 표 뒤');
    });

    test(`[${N}명, 라이어 p${liarIdx}] 같은 행동에 대한 응답(성공·거절 문구·알림)이 라이어일 때와 시민일 때 똑같다`, () => {
      // 라이어만 다르고 나머지는 똑같은 두 판에서 같은 행동을 하면 결과가 한 글자도 다르면 안 된다
      const script = (g) => {
        const out = [];
        const rec = (r) => out.push(JSON.stringify(r));
        const t = (x) => rec(tick(g, x));
        t(g.phaseEndsAt);
        const t0 = g.phaseStartedAt;
        for (const id of ids(N)) {
          rec(act(g, { type: 'say', by: id, text: `${id} 설명` }, t0 + S));
          rec(act(g, { type: 'say', by: id, text: `${id} 또` }, t0 + S));
          rec(act(g, { type: 'vote', by: id, target: id }, t0 + S));
          rec(act(g, { type: 'vote', by: id, target: 'p0' }, t0 + S));
          rec(act(g, { type: 'judge', by: id, v: 'yes' }, t0 + S));
          rec(act(g, { type: 'guess', by: id, text: '도서관' }, t0 + S));
        }
        while (g.phase === 'speak') t(g.phaseEndsAt);
        for (const id of ids(N)) {
          rec(act(g, { type: 'say', by: id, text: `${id} 토론중` }, g.phaseStartedAt + S));
          rec(act(g, { type: 'vote', by: id, target: ids(N)[(Number(id.slice(1)) + 1) % N] }, g.phaseStartedAt + 2 * S));
        }
        t(g.phaseEndsAt); t(g.phaseEndsAt); t(g.phaseEndsAt);
        out.push(JSON.stringify(Object.keys(viewFor(g, 'p0'))));
        return out;
      };
      const other = (liarIdx + 1) % N;
      const a = script(make(N, liarIdx));
      const b = script(make(N, other));
      assert.equal(a.length, b.length);
      // 응답 속 아이디는 "누가 한 행동인가"에만 쓰이고, 라이어 여부에 따라 달라지는 칸은 없다.
      // 단, 마지막 unmask 알림의 liarId 는 정체 공개 알림이므로 비교에서 뺀다.
      const strip = (x) => x.replace(/"liarId":"p\d"/g, '"liarId":"-"');
      assert.deepEqual(a.map(strip), b.map(strip));
    });
  }

  test(`[${N}명] 한 판 전체에서 나온 모든 알림(event)에 역할·단어가 없다`, () => {
    const g = make(N, 1);
    const events = [];
    const push = (r) => events.push(...r.events);
    push(tick(g, g.phaseEndsAt));
    for (const id of g.order) push(sayT(g, id, `${id}: 설명`, g.phaseStartedAt));
    events.push(...executeP0(g));
    assert.equal(g.phase, 'unmask');
    // unmask 알림 전까지의 알림은 역할·단어·라이어 글자를 담지 않는다
    const before = events.filter((e) => e.k !== 'unmask');
    const s = JSON.stringify(before);
    for (const bad of ['도서관', '놀이공원', 'role', 'liarId', 'wasLiar', '"liar"', 'citizen']) assert.ok(!s.includes(bad), bad);
    // 정체 공개 알림은 있고, 거기서 비로소 라이어가 나온다
    const un = events.find((e) => e.k === 'unmask');
    assert.deepEqual(un, { k: 'unmask', id: 'p0', wasLiar: false, liarId: 'p1' });
  });

  test(`[${N}명] 알림(event)은 모두에게 같다: 받는 사람별로 다른 알림 모양이 없다`, () => {
    // 엔진은 알림을 한 벌만 만든다. 라이어/시민에 따라 갈라지는 인자가 없음을 확인
    const g1 = make(N, 0); const g2 = make(N, N - 1);
    const drive = (g) => {
      const ev = [];
      ev.push(...tick(g, g.phaseEndsAt).events);
      for (const id of g.order) ev.push(...sayT(g, id, '같은 글', g.phaseStartedAt).events);
      return ev.map((e) => ({ ...e, id: undefined })).map((e) => Object.keys(e).join(','));
    };
    assert.deepEqual(drive(g1), drive(g2));
  });
}

test('word 방식이 아닌 notice 방식은 라이어가 다르게 보이는 것이 정상(탐지기 점검)', () => {
  const g = make(3, 0, { settings: { liarMode: 'notice' } });
  const liar = viewFor(g, 'p0'); const citizen = viewFor(g, 'p1');
  assert.notDeepEqual(withoutWord(liar), withoutWord(citizen));
});

test('notice 방식: 시민끼리는 view 가 똑같고, 시민 view 에 누가 라이어인지 없다. liarWord 를 넣어도 아무에게도 안 간다', () => {
  const g = createGame({
    players: ids(5), draw: DRAW, now: T0, settings: { liarMode: 'notice' },
    rng: seqRng([2, ...identity(5), ...identity(5)]),
  });
  const check = (label) => {
    const cs = g.players.filter((id) => id !== g.liarId).map((id) => viewFor(g, id));
    for (const c of cs) {
      assert.deepEqual(c, cs[0], `${label}: 시민 view 가 서로 다름`);
      const s = JSON.stringify(c);
      assert.ok(!s.includes('"liar"') && !s.includes('liarId') && !s.includes(DRAW.liarWord), `${label}: 시민 view 누출`);
    }
    const l = JSON.stringify(viewFor(g, g.liarId));
    assert.ok(!l.includes(DRAW.citizenWord) && !l.includes(DRAW.liarWord), `${label}: 라이어가 단어를 받음`);
    assert.ok(!JSON.stringify(viewFor(g, 'zzz')).includes(DRAW.citizenWord), `${label}: 관전자가 단어를 받음`);
  };
  check('reveal');
  tick(g, g.phaseEndsAt);
  check('speak');
  while (g.phase === 'speak') tick(g, g.phaseEndsAt);
  check('discuss');
});

test('탐지기 점검: 모양이 달라진 view 를 실제로 잡아낸다', () => {
  const g = make(3, 0);
  const liar = viewFor(g, 'p0'); const citizen = viewFor(g, 'p1');
  assert.deepEqual(shape(liar), shape(citizen));
  const leaked = { ...liar, my: { ...liar.my, role: 'liar' } };
  assert.notDeepEqual(withoutWord(leaked), withoutWord(citizen));
  const extra = { ...liar, hint: true };
  assert.notDeepEqual(shape(extra), shape(citizen));
  const reordered = { my: liar.my, ...liar };
  assert.notDeepEqual(Object.keys(liar), Object.keys({ phaseEndsAt: 1, ...liar }));
  assert.ok(reordered);
});

test('unmask(정체 공개) 뒤에는 역할이 드러난다 — 이전 단계에서만 가려진다', () => {
  const g = make(3, 2);
  tick(g, g.phaseEndsAt);
  for (let i = 0; i < 3; i++) tick(g, g.phaseEndsAt);
  executeP0(g);                               // p0 처형 → unmask
  assert.equal(g.phase, 'unmask');
  assert.equal(viewFor(g, 'p2').my.role, 'liar');
  assert.equal(viewFor(g, 'p0').my.role, 'citizen');
  assert.equal(viewFor(g, 'p0').unmask.liarId, 'p2');
});

// ---- 2-A: defense · judge · judged · 살린 뒤 discuss 까지 ----
for (const N of [3, 8]) {
  for (const liarIdx of [0, N - 1]) {
    test(`[${N}명, 라이어 p${liarIdx}] word 방식: defense·judge·judged·살린 뒤 discuss 에서도 라이어/시민 view 모양이 같다`, () => {
      const g = make(N, liarIdx);
      tick(g, g.phaseEndsAt);
      while (g.phase === 'speak') tick(g, g.phaseEndsAt);
      const target = g.players.find((p) => p !== g.liarId && p !== 'p0') ?? 'p1';
      const other = g.players.find((p) => p !== target);
      for (const id of g.players) if (id !== target) act(g, { type: 'vote', by: id, target }, g.phaseStartedAt);
      act(g, { type: 'vote', by: target, target: other }, g.phaseStartedAt);
      tick(g, g.phaseEndsAt);
      assert.equal(g.phase, 'defense');
      assertIndistinguishable(g, 'defense');
      assert.equal(act(g, { type: 'judge', by: other, v: 'no' }, g.phaseStartedAt).ok, false);
      assertIndistinguishable(g, 'defense judge 거절 뒤');
      tick(g, g.phaseEndsAt);
      assert.equal(g.phase, 'judge');
      assertIndistinguishable(g, 'judge 시작');
      for (const id of g.players) if (id !== target) {
        const r = act(g, { type: 'judge', by: id, v: id === g.liarId ? 'yes' : 'no' }, g.phaseStartedAt + S);
        assert.ok(r.ok);
        assertIndistinguishable(g, `judge ${id} 뒤`);
      }
      assert.equal(act(g, { type: 'guess', by: g.liarId, text: '도서관', correct: true }, g.phaseStartedAt).ok, false);
      assertIndistinguishable(g, 'judge guess 거절 뒤');
      const evs = tick(g, g.phaseEndsAt).events;
      assert.equal(g.phase, 'judged');
      assertIndistinguishable(g, 'judged');
      const all = JSON.stringify(evs);
      for (const bad of ['도서관', '놀이공원', 'role', 'wasLiar', '"liar"', 'citizen', g.liarId === target ? '' : 'liarId']) if (bad) assert.ok(!all.includes(bad), bad);
      tick(g, g.phaseEndsAt);                  // 전원 no(라이어 제외 시민 반대) → 살림
      if (g.phase === 'discuss') {
        assert.equal(g.accuseNo, 2);
        assertIndistinguishable(g, '살린 뒤 discuss');
        act(g, { type: 'vote', by: g.liarId, target: g.players.find((p) => p !== g.liarId) }, g.phaseStartedAt);
        assertIndistinguishable(g, '살린 뒤 discuss 표');
      }
    });
  }
}

// ---- 정답 공개(answer) 개편: 라이어가 답을 쓰기 전에는 시민 제시어를 받지 않는다 ----
for (const N of [3, 8]) {
  test(`[${N}명] unmask·guess 동안 라이어의 view·알림에 시민 제시어가 없고 words 는 모두에게 null, answer 부터 공개`, () => {
    const g = make(N, 1);
    const events = [];
    const push = (r) => events.push(...r.events);
    push(tick(g, g.phaseEndsAt));
    for (const id of g.order) push(sayT(g, id, `${id}: 설명`, g.phaseStartedAt));
    events.push(...executeP0(g).slice(0, -1));   // p0 처형 → unmask 시작
    for (const phase of ['unmask', 'guess']) {
      assert.equal(g.phase, phase);
      for (const id of g.players) {
        const v = viewFor(g, id);
        assert.ok('words' in v, `${phase} ${id}: words 칸`);
        assert.equal(v.words, null, `${phase} ${id}`);
      }
      assert.ok(!JSON.stringify(viewFor(g, 'p1')).includes(DRAW.citizenWord), `${phase}: 라이어 view`);
      push(tick(g, g.phaseEndsAt));
    }
    assert.equal(g.phase, 'answer');
    // answer 시작까지 나온 모든 알림(guess·phase 포함)에 제시어가 없다 — 제시어는 상태의 words 로만 간다
    assert.ok(!JSON.stringify(events).includes(DRAW.citizenWord));
    assert.ok(!JSON.stringify(events).includes(DRAW.liarWord));
    for (const id of g.players) assert.deepEqual(viewFor(g, id).words, { citizen: DRAW.citizenWord, liar: DRAW.liarWord });
  });
}
