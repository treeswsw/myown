// 규칙 엔진 시험 (1-B): 시작 → 역할 공개 → 첫 설명 → 토론·투표 → 재투표 → 지목 결정/실패.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, act, tick, viewFor, wakeAt, defaultRng } from '../../shared/liar/game.js';
import { DEFAULT_TIMES, FIXED_TIMES, DISCUSS_FLOOR, SHORTEN_TO, COLORS, GOAL_CHOICES, TIME_CHOICES, LIMITS } from '../../shared/liar/constants.js';

const S = 1000;
const T0 = 1_000_000;
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
// 섞기에서 아무것도 바꾸지 않는 난수열(피셔-예이츠: i = n-1..1 에서 j = i)
const identity = (n) => Array.from({ length: n - 1 }, (_, i) => n - 1 - i);
const seqRng = (values) => { let i = 0; return (n) => { const v = values[i++]; assert.ok(v >= 0 && v < n, `rng(${n}) 에 ${v}`); return v; }; };
const DRAW = { topic: '장소', citizenWord: '도서관', liarWord: '놀이공원' };

// liarIdx 번째 사람이 라이어, 발언 순서·자리는 그대로
function make(n, { liarIdx = 0, settings = {}, draw = DRAW, now = T0 } = {}) {
  const rng = seqRng([liarIdx, ...identity(n), ...identity(n)]);
  return createGame({ players: ids(n), settings, draw, rng, now });
}
// reveal 을 넘겨 첫 설명 시작 시각을 돌려준다
function toSpeak(g) { const t = g.phaseEndsAt; tick(g, t); return t; }
// 전원이 차례대로 설명해서 토론·투표로. 돌려주는 값 = 토론 시작 시각
function toDiscuss(g, now = g.phaseEndsAt) {
  let t = now;
  tick(g, t);
  for (const id of g.order) { const r = act(g, { type: 'say', by: id, text: `${id} 설명` }, t); assert.ok(r.ok, r.error); }
  assert.equal(g.phase, 'discuss');
  return t;
}
const vote = (g, by, target, t) => act(g, { type: 'vote', by, target }, t);
function everyoneVotes(g, target, t, except = []) {
  for (const id of ids(g.players.length)) if (id !== target && !except.includes(id)) assert.ok(vote(g, id, target, t).ok);
}

for (const N of [3, 8]) {
  test(`[${N}명] 만들기: 라이어·순서·자리는 rng 순서대로, 서로 따로`, () => {
    // 3명: 라이어 idx 1. 순서 섞기 [0,0] → [p1,p2,p0]. 자리 섞기 identity
    const rng = seqRng(N === 3
      ? [1, 0, 0, ...identity(3)]
      : [5, ...Array(7).fill(0), ...identity(8)]);
    const g = createGame({ players: ids(N), draw: DRAW, rng, now: T0 });
    assert.equal(g.liarId, N === 3 ? 'p1' : 'p5');
    if (N === 3) assert.deepEqual(g.order, ['p1', 'p2', 'p0']);
    assert.equal(g.order.length, N);
    assert.deepEqual([...g.order].sort(), ids(N).sort());
    // 자리는 순서와 따로 뽑는다: 자리를 identity 로 줬으므로 p_i 가 i 번 자리
    assert.deepEqual(g.seats, Object.fromEntries(ids(N).map((id, i) => [id, i])));
    assert.equal(g.phase, 'reveal');
    assert.equal(g.phaseEndsAt, T0 + FIXED_TIMES.reveal * S);
    assert.equal(g.accuseNo, 1);
  });

  test(`[${N}명] 만들기: 라이어는 시험이 고른 사람(모든 자리)`, () => {
    for (let i = 0; i < N; i++) assert.equal(make(N, { liarIdx: i }).liarId, `p${i}`);
  });

  test(`[${N}명] 역할 공개 8초 뒤 첫 설명으로, 첫 차례 알림`, () => {
    const g = make(N);
    assert.deepEqual(tick(g, T0 + 7999).events, []);
    assert.equal(g.phase, 'reveal');
    const { events } = tick(g, T0 + 8000);
    assert.equal(g.phase, 'speak');
    assert.deepEqual(events, [
      { k: 'phase', phase: 'speak', round: 1, accuseNo: 1 },
      { k: 'turn', id: g.order[0] },
    ]);
    assert.equal(viewFor(g, 'p0').speaker, g.order[0]);
    assert.equal(g.phaseEndsAt, T0 + 8000 + DEFAULT_TIMES.speak * S);
  });

  test(`[${N}명] 첫 설명: 차례 아닌 사람(차례 전)은 거절`, () => {
    const g = make(N); toSpeak(g);
    const notYet = g.order[N - 1];
    const r = act(g, { type: 'say', by: notYet, text: '안녕' }, g.phaseEndsAt - 1);
    assert.equal(r.ok, false);
    assert.equal(viewFor(g, notYet).firstSays.some((f) => f.id === notYet), false);
  });

  test(`[${N}명] 첫 설명: 차례인 사람의 한 줄은 기록되고 즉시 다음 차례`, () => {
    const g = make(N); const t = toSpeak(g);
    const r = act(g, { type: 'say', by: g.order[0], text: '  넓고 조용해요  ' }, t + 3 * S);
    assert.equal(r.ok, true);
    assert.deepEqual(r.events, [
      { k: 'chat', id: g.order[0], text: '넓고 조용해요', ts: t + 3 * S, kind: 'say' },
      { k: 'turn', id: g.order[1] },
    ]);
    const v = viewFor(g, 'p0');
    assert.equal(v.speaker, g.order[1]);
    assert.equal(g.phaseEndsAt, t + 3 * S + DEFAULT_TIMES.speak * S);   // 새 차례는 30초를 새로 받는다
    assert.deepEqual(v.firstSays, [
      { id: g.order[0], text: '넓고 조용해요', late: false },
      { id: g.order[1], text: null, late: false },
    ]);
  });

  test(`[${N}명] 첫 설명: 한 줄만(줄바꿈·빈 글·81자 거절, 80자는 허용)`, () => {
    const g = make(N); toSpeak(g);
    const me = g.order[0]; const now = g.phaseStartedAt;
    assert.equal(act(g, { type: 'say', by: me, text: '한 줄\n두 줄' }, now).ok, false);
    assert.equal(act(g, { type: 'say', by: me, text: '   ' }, now).ok, false);
    assert.equal(act(g, { type: 'say', by: me, text: 42 }, now).ok, false);
    assert.equal(act(g, { type: 'say', by: me, text: '가'.repeat(LIMITS.say + 1) }, now).ok, false);
    assert.equal(g.speakerIdx, 0);                       // 거절은 상태를 바꾸지 않는다
    assert.equal(act(g, { type: 'say', by: me, text: '가'.repeat(LIMITS.say) }, now).ok, true);
  });

  test(`[${N}명] 첫 설명: 시간이 끝나면 빈 채로 넘어가고, 마지막 뒤 토론·투표 90초`, () => {
    const g = make(N); let t = toSpeak(g);
    for (let i = 0; i < N; i++) {
      assert.equal(g.phase, 'speak');
      assert.equal(viewFor(g, 'p0').speaker, g.order[i]);
      t += DEFAULT_TIMES.speak * S;
      const { events } = tick(g, t);
      if (i < N - 1) assert.deepEqual(events, [{ k: 'turn', id: g.order[i + 1] }]);
    }
    assert.equal(g.phase, 'discuss');
    assert.equal(g.phaseEndsAt, t + DEFAULT_TIMES.discuss * S);
    const v = viewFor(g, 'p0');
    assert.equal(v.speaker, null);
    assert.equal(v.firstSays.length, N);
    assert.ok(v.firstSays.every((f) => f.text === null && f.late === false));
    assert.deepEqual(v.firstSays.map((f) => f.id), g.order);
  });

  test(`[${N}명] 첫 설명: 설정한 시간(45초)을 따른다`, () => {
    const g = make(N, { settings: { times: { speak: 45, discuss: 120 } } }); const t = toSpeak(g);
    assert.equal(g.phaseEndsAt, t + 45 * S);
    for (let i = 0; i < N; i++) tick(g, g.phaseEndsAt);
    assert.equal(g.phaseEndsAt - g.phaseStartedAt, 120 * S);
  });

  test(`[${N}명] 늦은 추가(speak): 지난 차례의 빈 사람만 한 번, 차례·시각은 그대로`, () => {
    const g = make(N); const t = toSpeak(g);
    const first = g.order[0];
    tick(g, t + DEFAULT_TIMES.speak * S);        // 첫 사람이 못 쓰고 넘어감
    const speaker = g.order[1]; const ends = g.phaseEndsAt;
    const at = t + DEFAULT_TIMES.speak * S + 4 * S;
    const r = act(g, { type: 'say', by: first, text: '늦었어요' }, at);
    assert.deepEqual(r, { ok: true, events: [{ k: 'chat', id: first, text: '늦었어요', ts: at, kind: 'late' }] });
    assert.equal(viewFor(g, 'p0').speaker, speaker);
    assert.equal(g.phaseEndsAt, ends);
    assert.deepEqual(viewFor(g, 'p0').firstSays[0], { id: first, text: '늦었어요', late: true });
    // 한 번만
    assert.equal(act(g, { type: 'say', by: first, text: '또' }, at).ok, false);
    // 아직 차례가 안 온 사람은 거절
    assert.equal(act(g, { type: 'say', by: g.order[N - 1], text: '미리' }, at).ok, false);
    // 차례인 사람이 그대로 쓰면 평범한 설명이다
    assert.equal(act(g, { type: 'say', by: speaker, text: '제 차례' }, at).events[0].kind, 'say');
  });

  test(`[${N}명] 늦은 추가(speak): 이미 쓴 사람은 거절`, () => {
    const g = make(N); const t = toSpeak(g);
    act(g, { type: 'say', by: g.order[0], text: '먼저' }, t + S);
    assert.equal(act(g, { type: 'say', by: g.order[0], text: '다시' }, t + 2 * S).ok, false);
    assert.equal(viewFor(g, 'p0').firstSays[0].text, '먼저');
  });

  test(`[${N}명] 늦은 추가: away 로 건너뛴 사람도 쓸 수 있다`, () => {
    const g = make(N); toSpeak(g);
    // 다음 과제(away)가 채울 자리를 직접 채워 건너뛰기만 확인
    g.away.push(g.order[1]);
    act(g, { type: 'say', by: g.order[0], text: '첫째' }, g.phaseStartedAt + S);
    assert.equal(viewFor(g, 'p0').speaker, g.order[2]);          // 둘째는 건너뜀
    assert.equal(viewFor(g, 'p0').firstSays[1].text, null);
    assert.equal(act(g, { type: 'say', by: g.order[1], text: '복귀' }, g.phaseStartedAt + 2 * S).events[0].kind, 'late');
  });

  test(`[${N}명] 늦은 추가(첫 discuss): 빈 사람만 한 번, 쓴 사람은 거절, 시각 그대로`, () => {
    const g = make(N); let t = toSpeak(g);
    for (let i = 0; i < N; i++) { if (i !== 1) act(g, { type: 'say', by: g.order[i], text: `s${i}` }, t); else tick(g, g.phaseEndsAt); t = g.phaseStartedAt; }
    assert.equal(g.phase, 'discuss');
    const ends = g.phaseEndsAt;
    const r = act(g, { type: 'say', by: g.order[1], text: '토론 중 추가' }, g.phaseStartedAt + 10 * S);
    assert.equal(r.events[0].kind, 'late');
    assert.equal(g.phaseEndsAt, ends);
    assert.equal(act(g, { type: 'say', by: g.order[1], text: '두번' }, g.phaseStartedAt + 11 * S).ok, false);
    assert.equal(act(g, { type: 'say', by: g.order[0], text: '이미씀' }, g.phaseStartedAt + 11 * S).ok, false);
    assert.equal(viewFor(g, 'p0').firstSays[1].late, true);
  });

  test(`[${N}명] 늦은 추가: 재투표에서도 가능, 지목이 결정된 뒤(defense)나 두 번째 지목부터는 거절`, () => {
    const g = make(N); toSpeak(g);
    tick(g, g.phaseEndsAt);                                  // 첫 사람 못 씀
    for (let i = 1; i < N; i++) act(g, { type: 'say', by: g.order[i], text: 'x' }, g.phaseStartedAt);
    assert.equal(g.phase, 'discuss');
    // 동점 상황(두 명이 한 표씩)을 만들어 재투표로
    vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'revote');
    assert.equal(act(g, { type: 'say', by: g.order[0], text: '재투표 중' }, g.phaseStartedAt + S).events[0].kind, 'late');
    // 지목이 결정된 뒤
    const h = make(N); toDiscuss(h); vote(h, 'p1', 'p0', h.phaseStartedAt);
    tick(h, h.phaseEndsAt);
    assert.equal(h.phase, 'defense');
    assert.equal(act(h, { type: 'say', by: 'p2', text: '늦음' }, h.phaseStartedAt).ok, false);
    // 두 번째 지목 이후의 토론(accuseNo 2)에서는 거절 — 살린 뒤 반복은 다음 과제라 값을 직접 만든다
    const k = make(N); toSpeak(k); tick(k, k.phaseEndsAt);
    for (let i = 1; i < N; i++) act(k, { type: 'say', by: k.order[i], text: 'x' }, k.phaseStartedAt);
    k.accuseNo = 2;
    assert.equal(act(k, { type: 'say', by: k.order[0], text: '못 씀' }, k.phaseStartedAt).ok, false);
  });

  test(`[${N}명] 역할 공개 중·참가자 아닌 사람의 say 는 거절`, () => {
    const g = make(N);
    assert.equal(act(g, { type: 'say', by: 'p0', text: '이른' }, T0 + 1).ok, false);
    toSpeak(g);
    assert.equal(act(g, { type: 'say', by: 'stranger', text: '난 누구' }, g.phaseStartedAt).ok, false);
  });

  test(`[${N}명] 투표: 찍기·바꾸기·같은 사람 다시 누르면 취소·null 취소`, () => {
    const g = make(N); const t = toDiscuss(g);
    let r = vote(g, 'p0', 'p1', t);
    assert.deepEqual(r.events, [{ k: 'vote', from: 'p0', to: 'p1', prev: null }]);
    r = vote(g, 'p0', 'p2', t + S);
    assert.deepEqual(r.events, [{ k: 'vote', from: 'p0', to: 'p2', prev: 'p1' }]);
    assert.deepEqual(viewFor(g, 'p5' in g.seats ? 'p5' : 'p0').votes, { p0: 'p2' });
    r = vote(g, 'p0', 'p2', t + 2 * S);                       // 같은 사람 다시 누름 = 취소
    assert.deepEqual(r.events, [{ k: 'vote', from: 'p0', to: null, prev: 'p2' }]);
    assert.deepEqual(viewFor(g, 'p0').votes, {});
    vote(g, 'p0', 'p1', t);
    r = vote(g, 'p0', null, t);                               // 명시적 취소
    assert.deepEqual(r.events, [{ k: 'vote', from: 'p0', to: null, prev: 'p1' }]);
    assert.deepEqual(vote(g, 'p0', null, t), { ok: true, events: [] });   // 이미 없음
  });

  test(`[${N}명] 투표: 자기 지목·없는 사람·참가자 아님·단계 밖은 거절`, () => {
    const g = make(N);
    assert.equal(vote(g, 'p0', 'p1', T0).ok, false);          // reveal
    toSpeak(g);
    assert.equal(vote(g, 'p0', 'p1', g.phaseStartedAt).ok, false);   // speak
    const t = toDiscuss(g);
    assert.equal(vote(g, 'p0', 'p0', t).ok, false);
    assert.equal(vote(g, 'p0', 'nobody', t).ok, false);
    assert.equal(vote(g, 'nobody', 'p1', t).ok, false);
    assert.equal(vote(g, 'p0', 5, t).ok, false);
    assert.deepEqual(g.votes, {});
  });

  test(`[${N}명] 단축: 30초 이후 전원이 찍으면 끝나는 시각이 지금 + 5초`, () => {
    const g = make(N); const t = toDiscuss(g);
    const at = t + 40 * S;
    everyoneVotes(g, 'p0', at, ['p1']); vote(g, 'p0', 'p2', at);
    assert.equal(g.phaseEndsAt, t + 90 * S);                  // 아직 한 명 남음
    const before = g.phaseEndsAt;
    const r = vote(g, 'p1', 'p2', at + S);
    assert.ok(r.ok);
    assert.equal(g.phaseEndsAt, at + S + SHORTEN_TO * S);
    assert.ok(g.phaseEndsAt < before);
    // 그 5초 동안 바꿀 수 있고, 바꿔도 시각은 늘지 않는다
    assert.ok(vote(g, 'p1', 'p0', at + 2 * S).ok);
    assert.equal(g.phaseEndsAt, at + S + SHORTEN_TO * S);
    assert.equal(viewFor(g, 'p0').phaseEndsAt, g.phaseEndsAt);
  });

  test(`[${N}명] 단축: 시작 30초 전에는 줄이지 않고, 30초가 되었을 때 전원이 찍혀 있으면 그때 5초`, () => {
    const g = make(N); const t = toDiscuss(g);
    const end = g.phaseEndsAt;
    everyoneVotes(g, 'p0', t + 10 * S); vote(g, 'p0', 'p1', t + 10 * S);   // 전원 투표 완료(10초)
    assert.equal(g.phaseEndsAt, end);
    assert.equal(wakeAt(g), t + DISCUSS_FLOOR * S);             // 방이 이 시각에 tick 을 부르면 된다
    tick(g, t + DISCUSS_FLOOR * S - 1);
    assert.equal(g.phaseEndsAt, end);
    tick(g, t + DISCUSS_FLOOR * S);
    assert.equal(g.phaseEndsAt, t + (DISCUSS_FLOOR + SHORTEN_TO) * S);
    assert.equal(wakeAt(g), g.phaseEndsAt);
  });

  test(`[${N}명] 단축: 예약된 30초 단축은 tick 이 늦게 와도 30초 + 5초에 끝난다`, () => {
    const g = make(N); const t = toDiscuss(g);
    everyoneVotes(g, 'p0', t + 10 * S); vote(g, 'p0', 'p1', t + 10 * S);
    tick(g, t + (DISCUSS_FLOOR + 2) * S);                      // 2초 늦은 tick
    assert.equal(g.phase, 'discuss');
    assert.equal(g.phaseEndsAt, t + (DISCUSS_FLOOR + SHORTEN_TO) * S);
    const h = make(N); const u = toDiscuss(h);
    everyoneVotes(h, 'p0', u + 10 * S); vote(h, 'p0', 'p1', u + 10 * S);
    tick(h, u + (DISCUSS_FLOOR + SHORTEN_TO) * S);              // 단축 끝 시각에 처음 온 tick: 바로 지목
    assert.equal(h.phase, 'defense');
    assert.equal(h.accused, 'p0');
  });

  test(`[${N}명] 단축: 30초 전에 표를 취소해 전원이 아니게 되면 예약이 풀린다`, () => {
    const g = make(N); const t = toDiscuss(g);
    const end = g.phaseEndsAt;
    everyoneVotes(g, 'p0', t + 5 * S); vote(g, 'p0', 'p1', t + 5 * S);
    assert.notEqual(g.pendingShortenAt, null);
    vote(g, 'p0', null, t + 6 * S);
    assert.equal(g.pendingShortenAt, null);
    tick(g, t + 31 * S);
    assert.equal(g.phaseEndsAt, end);
  });

  test(`[${N}명] 단축: 이미 5초 이하로 남았으면 그대로`, () => {
    const g = make(N); const t = toDiscuss(g);
    const at = t + 87 * S;                                      // 남은 3초
    everyoneVotes(g, 'p0', at); vote(g, 'p0', 'p1', at);
    assert.equal(g.phaseEndsAt, t + 90 * S);
  });

  test(`[${N}명] 단축: 살린 뒤 토론(accuseNo 2)은 30초 보장 없이 바로`, () => {
    const g = make(N); const t = toDiscuss(g);
    g.accuseNo = 2;                                             // 살린 뒤 반복은 다음 과제: 값을 직접 만든다
    // 새 토론 시작과 같은 상태로
    g.phaseStartedAt = t; g.phaseEndsAt = t + DEFAULT_TIMES.rediscuss * S;
    const at = t + 3 * S;
    everyoneVotes(g, 'p0', at); vote(g, 'p0', 'p1', at);
    assert.equal(g.phaseEndsAt, at + SHORTEN_TO * S);
  });

  test(`[${N}명] 시간 끝: 최다 득표자가 지목되어 최후 변론(defense)으로`, () => {
    const g = make(N); const t = toDiscuss(g);
    vote(g, 'p1', 'p0', t + S); vote(g, 'p2', 'p0', t + S); vote(g, 'p0', 'p1', t + S);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'defense');
    assert.deepEqual(events, [
      { k: 'accused', id: 'p0', tally: { p0: 2, p1: 1 } },
      { k: 'phase', phase: 'defense', round: 1, accuseNo: 1 },
    ]);
    const v = viewFor(g, 'p3' in g.seats ? 'p3' : 'p1');
    assert.equal(v.accused, 'p0');
    assert.equal(g.phaseEndsAt - g.phaseStartedAt, DEFAULT_TIMES.defense * S);
  });

  test(`[${N}명] 시간 끝: 한 표만 있어도 그 사람이 지목된다`, () => {
    const g = make(N); const t = toDiscuss(g);
    vote(g, 'p0', 'p2', t + S);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'defense');
    assert.equal(viewFor(g, 'p0').accused, 'p2');
  });

  test(`[${N}명] 동점이면 동점자만 후보로 재투표 30초, 표는 비워진다`, () => {
    const g = make(N); const t = toDiscuss(g);
    vote(g, 'p0', 'p1', t + S); vote(g, 'p1', 'p2', t + S); vote(g, 'p2', 'p3' in g.seats ? 'p3' : 'p0', t + S);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'revote');
    assert.deepEqual(events, [{ k: 'phase', phase: 'revote', round: 1, accuseNo: 1 }]);
    const v = viewFor(g, 'p0');
    assert.deepEqual(v.votes, {});
    assert.ok(v.candidates.length >= 2);
    assert.deepEqual(v.candidates, g.order.filter((id) => v.candidates.includes(id)));   // 발언 순서대로
    assert.equal(g.phaseEndsAt - g.phaseStartedAt, FIXED_TIMES.revote * S);
  });

  test(`[${N}명] 재투표: 후보가 아닌 사람은 못 찍고, 후보끼리/후보 밖 사람의 표 모두 후보만`, () => {
    const g = make(N); const t = toDiscuss(g);
    vote(g, 'p0', 'p1', t); vote(g, 'p1', 'p0', t);
    tick(g, g.phaseEndsAt);
    assert.deepEqual(viewFor(g, 'p0').candidates, ['p0', 'p1']);
    const at = g.phaseStartedAt;
    assert.equal(vote(g, 'p2', 'p2', at).ok, false);
    assert.equal(vote(g, 'p0', 'p0', at).ok, false);          // 자기 지목
    if (N > 3) assert.equal(vote(g, 'p0', 'p2', at).ok, false);   // 후보 아님
    assert.ok(vote(g, 'p2', 'p1', at).ok);
    assert.ok(vote(g, 'p0', 'p1', at).ok);
  });

  test(`[${N}명] 재투표에서 결판이 나면 지목`, () => {
    const g = make(N); const t = toDiscuss(g);
    vote(g, 'p0', 'p1', t); vote(g, 'p1', 'p0', t);
    tick(g, g.phaseEndsAt);
    vote(g, 'p2', 'p1', g.phaseStartedAt);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'defense');
    assert.equal(events[0].k, 'accused');
    assert.equal(events[0].id, 'p1');
    assert.equal(viewFor(g, 'p0').accused, 'p1');
  });

  test(`[${N}명] 재투표도 동점이면 지목 실패: 처형 없이 라이어 공개(unmask{id:null})`, () => {
    const g = make(N, { liarIdx: 2 }); const t = toDiscuss(g);
    vote(g, 'p0', 'p1', t); vote(g, 'p1', 'p0', t);
    tick(g, g.phaseEndsAt);
    vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.deepEqual(events, [
      { k: 'phase', phase: 'unmask', round: 1, accuseNo: 1 },
      { k: 'unmask', id: null, wasLiar: null, liarId: 'p2' },
    ]);
    const v = viewFor(g, 'p0');
    assert.deepEqual(v.unmask, { id: null, wasLiar: null, liarId: 'p2' });
    assert.equal(v.accused, null);
    assert.equal(g.failReason, 'tie');
    assert.equal(g.phaseEndsAt - g.phaseStartedAt, FIXED_TIMES.unmaskFail * S);
  });

  test(`[${N}명] 표가 하나도 없으면(토론·재투표 모두) 지목 실패`, () => {
    const g = make(N); toDiscuss(g);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.equal(g.failReason, 'noVotes');
    assert.equal(viewFor(g, 'p0').unmask.liarId, g.liarId);
    // 재투표에서 표가 없는 경우
    const h = make(N); const t = toDiscuss(h);
    vote(h, 'p0', 'p1', t); vote(h, 'p1', 'p0', t);
    tick(h, h.phaseEndsAt);
    assert.equal(h.phase, 'revote');
    tick(h, h.phaseEndsAt);
    assert.equal(h.phase, 'unmask');
    assert.equal(h.failReason, 'noVotes');
  });

  test(`[${N}명] 늦게 tick 이 와도 act 가 마감을 먼저 처리한다`, () => {
    const g = make(N); toSpeak(g);
    const late = g.phaseEndsAt + 1;                              // 첫 사람 마감이 이미 지남
    const r = act(g, { type: 'say', by: g.order[0], text: '지각' }, late);
    assert.equal(r.ok, true);
    assert.equal(r.events.find((e) => e.k === 'chat').kind, 'late');
    assert.equal(r.events[0].k, 'turn');
  });

  test(`[${N}명] 알 수 없는 type·discuss 중 judge·guess 는 거절`, () => {
    const g = make(N); toDiscuss(g);
    for (const type of ['nope', 'judge', 'guess', undefined]) {
      const r = act(g, { type, by: 'p0', v: 'yes', text: 'x' }, g.phaseStartedAt);
      assert.equal(r.ok, false, String(type));
      assert.ok(r.error);
    }
    assert.equal(act(g, null, g.phaseStartedAt).ok, false);
  });

  test(`[${N}명] viewFor: 시민/라이어/관전자의 my, 남의 것은 없다`, () => {
    const g = make(N, { liarIdx: 1 });
    assert.deepEqual(viewFor(g, 'p0').my, { word: '도서관', role: null });
    assert.deepEqual(viewFor(g, 'p1').my, { word: '놀이공원', role: null });
    assert.deepEqual(viewFor(g, 'zzz').my, { word: null, role: null });
    const s = JSON.stringify(viewFor(g, 'p0'));
    assert.ok(!s.includes('놀이공원'));
    assert.ok(!s.includes('liarId'));
    assert.equal(viewFor(g, 'p0').topic, '장소');
  });

  test(`[${N}명] viewFor: 라이어 알림 방식은 라이어만 role/word 가 다르다`, () => {
    const g = make(N, { liarIdx: 1, settings: { liarMode: 'notice' }, draw: { topic: '장소', citizenWord: '도서관', liarWord: null } });
    assert.deepEqual(viewFor(g, 'p1').my, { word: null, role: 'liar' });
    assert.deepEqual(viewFor(g, 'p0').my, { word: '도서관', role: 'citizen' });
  });

  test(`[${N}명] viewFor: 지목 실패 후 unmask 에서는 역할이 드러난다`, () => {
    const g = make(N, { liarIdx: 1 }); toDiscuss(g);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.deepEqual(viewFor(g, 'p1').my, { word: '놀이공원', role: 'liar' });
    assert.deepEqual(viewFor(g, 'p0').my, { word: '도서관', role: 'citizen' });
  });
}

test('게임 인원 3명 미만·잘못된 입력은 만들 수 없다', () => {
  assert.throws(() => createGame({ players: ids(2), draw: DRAW, now: T0 }));
  assert.throws(() => createGame({ players: ['a', 'a', 'b'], draw: DRAW, now: T0 }));
  assert.throws(() => createGame({ players: ids(3), draw: DRAW }));                          // now 없음
  assert.throws(() => createGame({ players: ids(3), draw: { citizenWord: 'a' }, now: T0 })); // word 방식인데 liarWord 없음
  assert.throws(() => createGame({ players: ids(3), draw: DRAW, now: T0, rng: () => 99 }));   // 범위 밖 rng
});

test('같은 rng 순서면 같은 판, 다른 라이어 번호면 다른 판 (순수함수)', () => {
  const a = make(8, { liarIdx: 3 }); const b = make(8, { liarIdx: 3 });
  assert.deepEqual(a, b);
  assert.notEqual(make(8, { liarIdx: 4 }).liarId, a.liarId);
});

test('발언 순서와 자리는 따로 섞인다', () => {
  // 순서 [0,0] → [p1,p2,p0], 자리 [1,0] → i=2,j=1: [p0,p2,p1]; i=1,j=0: [p2,p0,p1]
  const g = createGame({ players: ids(3), draw: DRAW, rng: seqRng([0, 0, 0, 1, 0]), now: T0 });
  assert.deepEqual(g.order, ['p1', 'p2', 'p0']);
  assert.deepEqual(g.seats, { p2: 0, p0: 1, p1: 2 });
});

test('기본 난수는 crypto 기반: 범위 안, 치우침 없이 퍼진다', () => {
  const hit = new Set();
  for (let i = 0; i < 400; i++) { const v = defaultRng(8); assert.ok(Number.isInteger(v) && v >= 0 && v < 8); hit.add(v); }
  assert.equal(hit.size, 8);
  assert.equal(defaultRng(1), 0);
  assert.throws(() => defaultRng(0));
  // rng 를 안 넘기면 기본 난수로 정상 생성
  const g = createGame({ players: ids(5), draw: DRAW, now: T0 });
  assert.deepEqual([...g.order].sort(), ids(5).sort());
});

test('엔진 소스에 Math.random / Date.now / new Date 가 없다', () => {
  for (const f of ['game.js', 'constants.js']) {
    const src = readFileSync(new URL(`../../shared/liar/${f}`, import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/Math\.random|Date\.now|new Date|setTimeout|setInterval/.test(code), f);
  }
});

test('상수: 시간 기본값이 선택지 안에 있고 고정값·색·목표 점수가 GDD 와 같다', () => {
  for (const k of Object.keys(DEFAULT_TIMES)) assert.ok(TIME_CHOICES[k].includes(DEFAULT_TIMES[k]), k);
  assert.deepEqual(DEFAULT_TIMES, { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 });
  assert.deepEqual(FIXED_TIMES, { reveal: 8, revote: 30, judged: 3, unmaskLiar: 6, unmaskCitizen: 11, unmaskFail: 5 });
  assert.deepEqual(LIMITS, { say: 80, chat: 80, guess: 30 });
  assert.equal(DISCUSS_FLOOR, 30);
  assert.equal(SHORTEN_TO, 5);
  assert.deepEqual([...GOAL_CHOICES], [0, 10, 15, 20]);
  assert.equal(COLORS.length, 8);
  assert.equal(new Set(COLORS).size, 8);
  assert.deepEqual(TIME_CHOICES.speak, [20, 30, 45, 60]);
  assert.deepEqual(TIME_CHOICES.guess, [10, 15, 30]);
});

// ================= 2-A: 변론 → 찬반 → 판정 → 정체 공개 → 정답 → 결과, 점수 =================
const judgeAct = (g, by, v, t) => act(g, { type: 'judge', by, v }, t);
// 지목(target)이 결정되어 defense 가 시작된 상태로. 돌려주는 값 = defense 시작 시각
function toDefense(g, target, { voteTime } = {}) {
  const t = toDiscuss(g);
  for (const id of g.players) if (id !== target) assert.ok(vote(g, id, target, voteTime ?? t).ok);
  assert.ok(vote(g, target, g.players.find((p) => p !== target), voteTime ?? t).ok);
  tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'defense');
  assert.equal(g.accused, target);
  return g.phaseStartedAt;
}
// defense → judge. picks = { id: 'yes'|'no' }
function toJudge(g, target) { toDefense(g, target); tick(g, g.phaseEndsAt); assert.equal(g.phase, 'judge'); }
function judgeAll(g, target, v, t = g.phaseStartedAt) {
  for (const id of g.players) if (id !== target) assert.ok(judgeAct(g, id, v, t).ok);
}
// 마감까지 돌려 judged → (처형이면) unmask
function pastJudge(g) { tick(g, g.phaseEndsAt); }

for (const N of [3, 8]) {
  const liar = 'p0';
  const cit = (k = 1) => `p${k}`;

  test(`[${N}명] defense: 최후 변론 20초 뒤 judge, defense 중 judge 는 거절`, () => {
    const g = make(N, { liarIdx: 0 });
    const t = toDefense(g, cit());
    assert.equal(g.phaseEndsAt, t + DEFAULT_TIMES.defense * S);
    assert.equal(judgeAct(g, cit(2), 'yes', t).ok, false);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'judge');
    assert.deepEqual(events, [{ k: 'phase', phase: 'judge', round: 1, accuseNo: 1 }]);
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + DEFAULT_TIMES.judge * S);
    assert.deepEqual(viewFor(g, 'p0').judge, { picks: {}, executed: null });
  });

  test(`[${N}명] judge: 값 검사·지목된 사람/참가자 아님 거절, 바꾸기, 알림 judge{id,v,prev}`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, cit());
    const t = g.phaseStartedAt;
    assert.equal(judgeAct(g, cit(), 'yes', t).ok, false);          // 지목된 사람
    assert.equal(judgeAct(g, 'zzz', 'yes', t).ok, false);          // 관전자
    assert.equal(judgeAct(g, cit(2), 'maybe', t).ok, false);       // 중립 없음
    assert.equal(judgeAct(g, cit(2), null, t).ok, false);
    assert.deepEqual(judgeAct(g, cit(2), 'yes', t), { ok: true, events: [{ k: 'judge', id: 'p2', v: 'yes', prev: null }] });
    assert.deepEqual(judgeAct(g, cit(2), 'no', t).events, [{ k: 'judge', id: 'p2', v: 'no', prev: 'yes' }]);
    assert.deepEqual(judgeAct(g, cit(2), 'no', t).events, []);      // 같은 값은 변화 없음
    assert.deepEqual(viewFor(g, cit()).judge.picks, { p2: 'no' });  // 지목된 사람에게도 실시간 공개
    assert.deepEqual(viewFor(g, 'zzz').judge.picks, { p2: 'no' });
  });

  test(`[${N}명] judge: 지목된 사람을 뺀 전원이 고르면 끝나는 시각이 지금 + 5초`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, cit());
    const t = g.phaseStartedAt;
    const voters = g.players.filter((p) => p !== cit());
    for (const id of voters.slice(0, -1)) judgeAct(g, id, 'yes', t + S);
    assert.equal(g.phaseEndsAt, t + DEFAULT_TIMES.judge * S);
    judgeAct(g, voters.at(-1), 'yes', t + 2 * S);
    assert.equal(g.phaseEndsAt, t + 2 * S + SHORTEN_TO * S);
    assert.equal(wakeAt(g), g.phaseEndsAt);
  });

  test(`[${N}명] judge 마감: yes > no 면 처형, 안 고른 사람은 no, 동수는 살림`, () => {
    const voters = ids(N).filter((p) => p !== 'p1');   // N-1 명
    // 안 고름 = no: yes 가 과반 미만
    let g = make(N, { liarIdx: 0 }); toJudge(g, 'p1');
    judgeAct(g, voters[0], 'yes', g.phaseStartedAt);
    let r = tick(g, g.phaseEndsAt);
    const ev = r.events.find((e) => e.k === 'judged');
    assert.equal(ev.executed, false);       // yes 1 뿐, 나머지는 안 고름 = no
    assert.deepEqual(ev.picks, { [voters[0]]: 'yes' });
    // 전원 yes → 처형
    g = make(N, { liarIdx: 0 }); toJudge(g, 'p1'); judgeAll(g, 'p1', 'yes');
    r = tick(g, g.phaseEndsAt);
    assert.equal(r.events.find((e) => e.k === 'judged').executed, true);
    assert.equal(g.phase, 'judged');
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + 3 * S);
    // 동수 (짝수 명 투표자일 때만 만들 수 있다: 3명 = 2표 → yes 1 no 1)
    if (N === 3) {
      g = make(N, { liarIdx: 0 }); toJudge(g, 'p1');
      judgeAct(g, 'p0', 'yes', g.phaseStartedAt); judgeAct(g, 'p2', 'no', g.phaseStartedAt);
      pastJudge(g);
      assert.equal(g.judge.executed, false);
    } else {
      g = make(N, { liarIdx: 0 }); toJudge(g, 'p1');
      const vs = voters;          // 7명: yes 3 : no 4
      vs.forEach((id, i) => judgeAct(g, id, i < 3 ? 'yes' : 'no', g.phaseStartedAt));
      pastJudge(g); assert.equal(g.judge.executed, false);
      g = make(N, { liarIdx: 0 }); toJudge(g, 'p1');
      vs.forEach((id, i) => judgeAct(g, id, i < 4 ? 'yes' : 'no', g.phaseStartedAt));
      pastJudge(g); assert.equal(g.judge.executed, true);
    }
  });

  test(`[${N}명] 살림: 3초 뒤 accuseNo+1, 표·후보·지목·찬반을 비우고 rediscuss 60초 토론`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, cit()); judgeAll(g, cit(), 'no');
    pastJudge(g);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'discuss');
    assert.deepEqual(events, [{ k: 'phase', phase: 'discuss', round: 1, accuseNo: 2 }]);
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + DEFAULT_TIMES.rediscuss * S);
    const v = viewFor(g, 'p2');
    assert.deepEqual([v.votes, v.candidates, v.accused, v.judge, v.accuseNo], [{}, null, null, null, 2]);
    // 살린 뒤 첫 설명 추가(late)는 거절
    assert.equal(act(g, { type: 'say', by: 'p2', text: '또' }, g.phaseStartedAt).ok, false);
  });

  test(`[${N}명] 살림 2번 뒤 처형: accuseNo 3, voteLog 3줄, 라이어 처형 + 오답`, () => {
    const g = make(N, { liarIdx: 0 });
    toJudge(g, 'p1'); judgeAll(g, 'p1', 'no'); pastJudge(g); tick(g, g.phaseEndsAt);
    // 2번째 지목
    for (const id of g.players) if (id !== 'p2') vote(g, id, 'p2', g.phaseStartedAt);
    vote(g, 'p2', 'p1', g.phaseStartedAt);
    tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'judge'); judgeAll(g, 'p2', 'no'); pastJudge(g); tick(g, g.phaseEndsAt);
    // 3번째: 라이어 지목
    assert.equal(g.accuseNo, 3);
    for (const id of g.players) if (id !== liar) vote(g, id, liar, g.phaseStartedAt);
    vote(g, liar, 'p1', g.phaseStartedAt);
    tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
    judgeAll(g, liar, 'yes'); pastJudge(g);
    assert.equal(g.judge.executed, true);
    const { events } = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.deepEqual(events.at(-1), { k: 'unmask', id: liar, wasLiar: true, liarId: liar });
    tick(g, g.phaseEndsAt); assert.equal(g.phase, 'guess');
    act(g, { type: 'guess', by: liar, text: '틀림', correct: false }, g.phaseStartedAt + S);
    assert.equal(g.phase, 'result');
    const res = viewFor(g, 'p1').result;
    assert.equal(res.voteLog.length, 3);
    assert.deepEqual(res.voteLog.map((l) => [l.no, l.accused, l.executed]), [[1, 'p1', false], [2, 'p2', false], [3, liar, true]]);
    assert.equal(res.winner, 'citizens');
  });

  test(`[${N}명] unmask 시간: 라이어 처형 6초 / 시민 처형 11초, 그 뒤 guess(15초)`, () => {
    let g = make(N, { liarIdx: 0 }); toJudge(g, liar); judgeAll(g, liar, 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + FIXED_TIMES.unmaskLiar * S);
    let r = tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'guess');
    assert.deepEqual(r.events, [{ k: 'phase', phase: 'guess', round: 1, accuseNo: 1 }]);
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + DEFAULT_TIMES.guess * S);
    g = make(N, { liarIdx: 0 }); toJudge(g, cit()); judgeAll(g, cit(), 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
    assert.deepEqual(viewFor(g, 'p2').unmask, { id: 'p1', wasLiar: false, liarId: liar });
    assert.equal(g.phaseEndsAt, g.phaseStartedAt + FIXED_TIMES.unmaskCitizen * S);
  });

  test(`[${N}명] guess: 라이어만·한 번만·시민 거절·단계 밖 거절, 시간 초과는 오답`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, liar); judgeAll(g, liar, 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
    assert.equal(act(g, { type: 'guess', by: liar, text: '도서관', correct: true }, g.phaseStartedAt).ok, false);   // unmask 중
    tick(g, g.phaseEndsAt);
    const t = g.phaseStartedAt;
    assert.equal(act(g, { type: 'guess', by: 'p1', text: '도서관', correct: true }, t).ok, false);
    assert.equal(act(g, { type: 'guess', by: liar, text: '   ', correct: true }, t).ok, false);
    assert.equal(g.phase, 'guess');
    const r = act(g, { type: 'guess', by: liar, text: '도서관', correct: true }, t + S);
    assert.equal(r.ok, true);
    assert.deepEqual(r.events.map((e) => e.k), ['guess', 'phase']);
    assert.deepEqual(r.events[0], { k: 'guess', text: '도서관', correct: true });
    assert.equal(g.phase, 'result');
    assert.equal(act(g, { type: 'guess', by: liar, text: '또', correct: false }, t + 2 * S).ok, false);
    // 시간 초과
    const h = make(N, { liarIdx: 0 }); toJudge(h, liar); judgeAll(h, liar, 'yes'); pastJudge(h); tick(h, h.phaseEndsAt); tick(h, h.phaseEndsAt);
    const e = tick(h, h.phaseEndsAt).events;
    assert.deepEqual(e[0], { k: 'guess', text: null, correct: false });
    assert.equal(h.phase, 'result');
    assert.deepEqual(viewFor(h, 'p1').guess, { text: null, correct: false });
  });

  test(`[${N}명] result: 라이어 처형+정답 → 라이어 승, 점수 라이어 +1 / 찬성 시민 +2 / 반대 시민 +1`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, liar);
    ids(N).slice(1).forEach((id, i) => judgeAct(g, id, i === 0 ? 'no' : 'yes', g.phaseStartedAt));
    // N=3 이면 yes 1 : no 1 → 동수 살림이라 처형이 안 된다. 3명은 전원 yes 로
    if (N === 3) judgeAct(g, 'p1', 'yes', g.phaseStartedAt);
    pastJudge(g); tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
    act(g, { type: 'guess', by: liar, text: '도서관', correct: true }, g.phaseStartedAt);
    const res = viewFor(g, 'p3' in g.seats ? 'p3' : 'p2').result;
    assert.equal(res.winner, 'liar'); assert.equal(res.reason, 'executedLiar');
    assert.equal(res.caught, true); assert.equal(res.guessed, true);
    assert.equal(res.liarId, liar); assert.equal(res.citizenWord, '도서관'); assert.equal(res.liarWord, '놀이공원');
    assert.equal(res.champions, null);
    assert.equal(res.delta[liar], 1);
    if (N === 8) { assert.equal(res.delta.p1, 1); assert.equal(res.delta.p2, 2); }
    else { assert.equal(res.delta.p1, 2); assert.equal(res.delta.p2, 2); }
    assert.equal(viewFor(g, 'p1').phaseEndsAt, null);
    assert.equal(wakeAt(g), null);
  });

  test(`[${N}명] result: 라이어 처형+오답 → 시민 승, 라이어 0`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, liar); judgeAll(g, liar, 'yes'); pastJudge(g);
    tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
    act(g, { type: 'guess', by: liar, text: '엉뚱', correct: false }, g.phaseStartedAt);
    const res = g.result;
    assert.deepEqual([res.winner, res.caught, res.guessed], ['citizens', true, false]);
    assert.equal(res.delta[liar], 0);
    for (const id of ids(N).slice(1)) assert.equal(res.delta[id], 2);
  });

  test(`[${N}명] result: 시민 처형 → 라이어 승(+1 / 정답이면 +3), 찬성 −1, 반대·안 고름 0, 처형된 시민 0`, () => {
    for (const correct of [false, true]) {
      const g = make(N, { liarIdx: 0 }); toJudge(g, 'p1');
      const vs = ids(N).filter((p) => p !== 'p1');
      vs.forEach((id) => judgeAct(g, id, 'yes', g.phaseStartedAt));
      if (N === 8) { judgeAct(g, 'p6', 'no', g.phaseStartedAt); judgeAct(g, 'p7', 'no', g.phaseStartedAt); }   // yes 5 no 2
      pastJudge(g); tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
      act(g, { type: 'guess', by: liar, text: 'x', correct }, g.phaseStartedAt);
      const res = g.result;
      assert.deepEqual([res.winner, res.reason, res.caught, res.guessed], ['liar', 'executedCitizen', false, correct]);
      assert.equal(res.delta[liar], correct ? 3 : 1);
      assert.equal(res.delta.p1, 0);
      assert.equal(res.delta.p2, -1);
      if (N === 8) { assert.equal(res.delta.p6, 0); assert.equal(res.delta.p7, 0); }
    }
  });

  test(`[${N}명] result: 지목 실패(tie / noVotes)는 라이어 승, 시민 0, 마지막 투표 기준 이유`, () => {
    // noVotes: 표가 하나도 없음
    let g = make(N, { liarIdx: 0 }); toDiscuss(g); tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    tick(g, g.phaseEndsAt);
    act(g, { type: 'guess', by: liar, text: '도서관', correct: true }, g.phaseStartedAt);
    assert.deepEqual([g.result.reason, g.result.winner, g.result.delta[liar], g.result.delta.p1], ['noVotes', 'liar', 3, 0]);
    // tie: 재투표도 동점
    g = make(N, { liarIdx: 0 }); toDiscuss(g);
    vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt);
    tick(g, g.phaseEndsAt); assert.equal(g.phase, 'revote');
    vote(g, 'p2', 'p0', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt); vote(g, 'p0', 'p1', g.phaseStartedAt);
    // p0:2? p0 got p2,p1 → 2, p1 got p0 → 1. 동점이 되게 p2 를 취소
    vote(g, 'p2', 'p0', g.phaseStartedAt);   // 같은 사람 다시 누르면 취소
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'unmask');
    assert.equal(g.failReason, 'tie');
    tick(g, g.phaseEndsAt);
    act(g, { type: 'guess', by: liar, text: 'x', correct: false }, g.phaseStartedAt);
    assert.equal(g.result.caught, false);
    assert.equal(g.result.delta[liar], 1);
    assert.equal(g.result.delta.p1, 0);
    assert.equal(g.result.reason, 'tie');
  });

  test(`[${N}명] 재투표의 첫 투표는 voteLog.firstVotes 에, 재투표 없던 줄은 null. 재투표 0표면 noVotes`, () => {
    // 재투표로 결판
    let g = make(N, { liarIdx: 0 }); toDiscuss(g);
    vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'revote');
    vote(g, 'p2', 'p1', g.phaseStartedAt);
    tick(g, g.phaseEndsAt);
    assert.equal(g.phase, 'defense');
    tick(g, g.phaseEndsAt); judgeAll(g, 'p1', 'no'); pastJudge(g); tick(g, g.phaseEndsAt);
    // 두 번째 지목은 재투표 없이
    for (const id of g.players) if (id !== 'p2') vote(g, id, 'p2', g.phaseStartedAt);
    vote(g, 'p2', 'p0', g.phaseStartedAt);
    tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt); judgeAll(g, 'p2', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
    tick(g, g.phaseEndsAt);
    act(g, { type: 'guess', by: liar, text: 'x', correct: false }, g.phaseStartedAt);
    const log = g.result.voteLog;
    assert.deepEqual(log[0].firstVotes, { p0: 'p1', p1: 'p0' });
    assert.deepEqual(log[0].votes, { p2: 'p1' });
    assert.equal(log[1].firstVotes, null);
    assert.deepEqual(Object.keys(log[0]).sort(), ['accused', 'executed', 'firstVotes', 'no', 'picks', 'votes']);
    // 재투표에서 표 0 → noVotes (첫 투표는 남는다)
    g = make(N, { liarIdx: 0 }); toDiscuss(g);
    vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt);
    tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
    assert.equal(g.failReason, 'noVotes');
    assert.deepEqual(g.voteLog[0].firstVotes, { p0: 'p1', p1: 'p0' });
  });

  test(`[${N}명] end: 어느 단계에서든 무효 판 result{void, hostEnded}, 점수 전원 0, 끝난 뒤엔 거절`, () => {
    const stages = {
      reveal: (g) => g,
      speak: (g) => { tick(g, g.phaseEndsAt); return g; },
      discuss: (g) => { toDiscuss(g); return g; },
      revote: (g) => { toDiscuss(g); vote(g, 'p0', 'p1', g.phaseStartedAt); vote(g, 'p1', 'p0', g.phaseStartedAt); tick(g, g.phaseEndsAt); return g; },
      defense: (g) => { toDefense(g, 'p1'); return g; },
      judge: (g) => { toJudge(g, 'p1'); return g; },
      judged: (g) => { toJudge(g, 'p1'); judgeAll(g, 'p1', 'yes'); pastJudge(g); return g; },
      unmask: (g) => { toJudge(g, 'p0'); judgeAll(g, 'p0', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt); return g; },
      guess: (g) => { toJudge(g, 'p0'); judgeAll(g, 'p0', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt); return g; },
    };
    for (const [name, build] of Object.entries(stages)) {
      const g = build(make(N, { liarIdx: 0 }));
      assert.equal(g.phase, name);
      const r = act(g, { type: 'end', by: 'p0' }, g.phaseStartedAt + S);
      assert.equal(r.ok, true, name);
      assert.equal(g.phase, 'result', name);
      assert.deepEqual([g.result.winner, g.result.reason, g.result.caught, g.result.guessed], ['void', 'hostEnded', null, null], name);
      assert.deepEqual(Object.values(g.result.delta), Array(N).fill(0), name);
      assert.equal(g.phaseEndsAt, null); assert.equal(wakeAt(g), null);
      assert.equal(act(g, { type: 'end', by: 'p0' }, g.phaseStartedAt + 2 * S).ok, false, name);
    }
  });

  test(`[${N}명] 모든 단계에서 wakeAt 은 미래이거나 null — 끝난 단계에서 0초 타이머가 반복되지 않는다`, () => {
    const g = make(N, { liarIdx: 0 });
    let now = T0;
    const seen = new Set();
    for (let i = 0; i < 400 && g.phase !== 'result'; i++) {
      const w = wakeAt(g);
      assert.ok(w == null || w > now, `${g.phase}: wakeAt ${w} <= now ${now}`);
      seen.add(g.phase);
      if (g.phase === 'discuss' && g.accuseNo === 1) for (const id of g.players) if (id !== 'p1') vote(g, id, 'p1', now);
      if (g.phase === 'discuss') { for (const id of g.players) if (id !== 'p1') vote(g, id, 'p1', now); vote(g, 'p1', 'p0', now); }
      if (g.phase === 'judge') for (const id of g.players) if (id !== g.accused) judgeAct(g, id, g.accuseNo < 2 ? 'no' : 'yes', now);
      now = wakeAt(g);
      tick(g, now);
    }
    assert.equal(g.phase, 'result');
    assert.equal(wakeAt(g), null);
    for (const p of ['reveal', 'speak', 'discuss', 'defense', 'judge', 'judged', 'unmask', 'guess']) assert.ok(seen.has(p), p);
  });

  test(`[${N}명] viewFor: 관전자 id 는 my 가 비고 나머지는 같다, word 방식 role 은 unmask 부터`, () => {
    const g = make(N, { liarIdx: 0 }); toJudge(g, cit());
    assert.equal(viewFor(g, liar).my.role, null);
    judgeAll(g, cit(), 'yes'); pastJudge(g);
    assert.equal(viewFor(g, liar).my.role, null);          // judged 까지는 가림
    tick(g, g.phaseEndsAt);
    assert.equal(viewFor(g, liar).my.role, 'liar');
    assert.equal(viewFor(g, 'p2').my.role, 'citizen');
    assert.deepEqual(viewFor(g, 'zzz').my, { word: null, role: null });
    const strip = (v) => ({ ...v, my: null });
    assert.deepEqual(strip(viewFor(g, 'zzz')), strip(viewFor(g, liar)));
    assert.deepEqual(viewFor(g, 'zzz').judge, viewFor(g, liar).judge);
  });

  test(`[${N}명] 같은 rng 순서 + 같은 행동 → 같은 결과`, () => {
    const run = () => {
      const g = make(N, { liarIdx: 1 }); toJudge(g, 'p1'); judgeAll(g, 'p1', 'yes'); pastJudge(g);
      tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
      act(g, { type: 'guess', by: 'p1', text: 'x', correct: false }, g.phaseStartedAt);
      return JSON.stringify(viewFor(g, 'p2'));
    };
    assert.equal(run(), run());
  });
}

// ---------- 2-B: 끊김·돌아옴·빠짐 ----------
const A = (g, type, by, t = g.phaseStartedAt) => act(g, { type, by }, t);
const futureOrNull = (g) => { const w = wakeAt(g); assert.ok(w === null || w > g.phaseStartedAt, `wakeAt ${w}`); };

test('away: 지금 차례인 사람이 끊기면 바로 다음 차례, 돌아오면 늦은 추가', () => {
  const g = make(4); const t = toSpeak(g);
  const first = g.order[0];
  const r = A(g, 'away', first, t + 1000);
  assert.ok(r.ok); assert.equal(g.order[g.speakerIdx], g.order[1]);
  assert.deepEqual(r.events, [{ k: 'turn', id: g.order[1] }]);
  assert.ok(A(g, 'back', first, t + 2000).ok);
  assert.ok(act(g, { type: 'say', by: first, text: '늦게' }, t + 3000).ok);
  assert.equal(g.firstSays[first].late, true);
  futureOrNull(g);
});

test('away: 모두 끊기면 첫 설명이 끝나 토론으로', () => {
  const g = make(3); const t = toSpeak(g);
  for (const id of g.order) A(g, 'away', id, t + 100);
  assert.equal(g.phase, 'discuss'); futureOrNull(g);
});

test('away: 끊긴 사람은 지목 "전원"에서 빠져 5초로 단축, 돌아와도 되돌리지 않음', () => {
  const g = make(4); const t = toDiscuss(g);
  const later = t + 60 * S;                       // 보장 30초 지난 뒤
  for (const id of ['p0', 'p1', 'p2']) vote(g, id, id === 'p0' ? 'p1' : 'p0', later);
  assert.equal(g.shortened, false);
  assert.ok(A(g, 'away', 'p3', later).ok);        // p3 만 안 찍었는데 끊김 → 전원
  assert.equal(g.shortened, true);
  assert.equal(g.phaseEndsAt, later + SHORTEN_TO * S);
  A(g, 'back', 'p3', later + 1000);
  assert.equal(g.phaseEndsAt, later + SHORTEN_TO * S);
  futureOrNull(g);
});

test('away: 끊기기 전에 한 표는 유효, 돌아오면 다시 전원에 포함(단축 전)', () => {
  const g = make(4); const t = toDiscuss(g);
  const later = t + 60 * S;
  vote(g, 'p3', 'p0', later); A(g, 'away', 'p3', later);
  for (const id of ['p0', 'p1']) vote(g, id, 'p2', later);
  assert.equal(g.shortened, false);
  A(g, 'back', 'p3', later);
  assert.equal(g.shortened, false);               // p2 가 아직 안 찍음
  vote(g, 'p2', 'p0', later);
  assert.equal(g.shortened, true);
});

test('away: 지목된 사람이 끊긴 채 defense 가 시작되면 바로 judge', () => {
  const g = make(4); const t = toDiscuss(g);
  A(g, 'away', 'p1', t);
  for (const id of ['p0', 'p2', 'p3']) vote(g, id, 'p1', t);
  vote(g, 'p1', 'p0', t);
  tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'judge'); assert.equal(g.accused, 'p1');
  assert.equal(g.phaseEndsAt, g.phaseStartedAt + DEFAULT_TIMES.judge * S); futureOrNull(g);
});

test('away: 찬반 "전원"에서도 빠져 5초 단축', () => {
  const g = make(4, { liarIdx: 0 }); toJudge(g, 'p1');
  const t = g.phaseStartedAt;
  judgeAct(g, 'p0', 'yes', t); judgeAct(g, 'p2', 'yes', t);
  assert.equal(g.shortened, false);
  A(g, 'away', 'p3', t + 1000);
  assert.equal(g.shortened, true); assert.equal(g.phaseEndsAt, t + 1000 + SHORTEN_TO * S);
});

test('away: 끊긴 라이어의 정답 시간은 그대로 흐른다', () => {
  const g = make(4, { liarIdx: 0 }); toJudge(g, 'p1');
  judgeAll(g, 'p1', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'unmask'); // 시민 처형
  tick(g, g.phaseEndsAt); assert.equal(g.phase, 'guess');
  const end = g.phaseEndsAt;
  A(g, 'away', 'p0'); assert.equal(g.phaseEndsAt, end);
  tick(g, end); assert.equal(g.phase, 'result'); assert.equal(wakeAt(g), null);
});

test('away/back/drop: 참가자 아님·끝난 판은 거절, away 중복은 무해', () => {
  const g = make(4); toSpeak(g);
  assert.equal(A(g, 'away', 'zz').ok, false);
  assert.ok(A(g, 'away', 'p1').ok); assert.ok(A(g, 'away', 'p1').ok);
  assert.deepEqual(g.away, ['p1']);
  A(g, 'end', 'p0');
  for (const type of ['away', 'back', 'drop']) assert.equal(A(g, type, 'p2').ok, false);
});

test('drop: 라이어가 unmask 전에 빠지면 시민 승리(liarLeft), 남은 시민 +1', () => {
  for (const setup of ['speak', 'discuss']) {
    const g = make(4, { liarIdx: 0 });
    if (setup === 'speak') toSpeak(g); else toDiscuss(g);
    const r = A(g, 'drop', 'p0', g.phaseStartedAt + 1000);
    assert.ok(r.ok); assert.equal(g.phase, 'result');
    const res = viewFor(g, 'p1').result;
    assert.equal(res.winner, 'citizens'); assert.equal(res.reason, 'liarLeft');
    assert.equal(res.caught, null); assert.equal(res.guessed, null);
    assert.deepEqual(res.delta, { p0: 0, p1: 1, p2: 1, p3: 1 });
    assert.equal(wakeAt(g), null);
  }
});

test('drop: 라이어가 빠지면 3명 미만이어도 liarLeft 가 먼저', () => {
  const g = make(3, { liarIdx: 0 }); toDiscuss(g);
  A(g, 'drop', 'p0');
  assert.equal(g.result.reason, 'liarLeft');
});

test('drop: 라이어가 아닌 사람이 빠져 3명 미만이면 void/tooFew', () => {
  const g = make(3, { liarIdx: 0 }); toDiscuss(g);
  A(g, 'drop', 'p1');
  assert.equal(g.phase, 'result'); assert.equal(g.result.winner, 'void'); assert.equal(g.result.reason, 'tooFew');
  assert.deepEqual(g.result.delta, { p0: 0, p1: 0, p2: 0 });
});

test('drop: guess 중 라이어가 빠지면 오답으로 정상 결과', () => {
  const g = make(4, { liarIdx: 0 }); toJudge(g, 'p1');
  judgeAll(g, 'p1', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'guess');
  A(g, 'drop', 'p0');
  assert.equal(g.phase, 'result'); assert.equal(g.result.reason, 'executedCitizen');
  assert.equal(g.result.guessed, false); assert.equal(g.result.delta.p0, 0);
});

test('drop: unmask 중 라이어가 빠지면 오답 정상 결과(라이어 처형)', () => {
  const g = make(4, { liarIdx: 0 }); toJudge(g, 'p0');
  judgeAll(g, 'p0', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'unmask');
  A(g, 'drop', 'p0');
  assert.equal(g.result.winner, 'citizens'); assert.equal(g.result.reason, 'executedLiar');
  assert.equal(g.result.delta.p0, 0); assert.equal(g.result.delta.p1, 2);
});

test('drop: 그 사람의 표와 그 사람을 찍은 표가 지워진다', () => {
  const g = make(5); const t = toDiscuss(g);
  vote(g, 'p0', 'p1', t); vote(g, 'p1', 'p2', t); vote(g, 'p3', 'p1', t);
  A(g, 'drop', 'p1', t);
  assert.deepEqual(g.votes, {});
  vote(g, 'p0', 'p2', t);
  const v = viewFor(g, 'p0'); assert.deepEqual(v.votes, { p0: 'p2' });
  assert.equal(vote(g, 'p0', 'p1', t).ok, false);
});

test('drop: 모두 찍은 상태가 되면 단축, 빠진 사람은 관전자처럼 보인다', () => {
  const g = make(4, { liarIdx: 0 }); const t = toDiscuss(g);
  const later = t + 60 * S;
  for (const id of ['p0', 'p1', 'p2']) vote(g, id, id === 'p0' ? 'p1' : 'p0', later);
  A(g, 'drop', 'p3', later);
  assert.equal(g.shortened, true);
  const v = viewFor(g, 'p3'); assert.equal(v.my.word, null); assert.equal(v.my.role, null);
  assert.equal(vote(g, 'p3', 'p0', later).ok, false);
  futureOrNull(g);
});

test('drop: 지금 차례인 사람이 빠지면 다음 차례', () => {
  const g = make(4, { liarIdx: 3 }); toSpeak(g);
  const cur = g.order[g.speakerIdx];
  const r = A(g, 'drop', cur);
  assert.ok(r.ok); assert.equal(g.order[g.speakerIdx], g.order[1]);
  assert.equal(act(g, { type: 'say', by: cur, text: 'x' }, g.phaseStartedAt).ok, false);
  futureOrNull(g);
});

test('drop: 재투표 후보가 빠지면 후보에서만 뺀다', () => {
  const g = make(5, { liarIdx: 0 }); const t = toDiscuss(g);
  vote(g, 'p0', 'p1', t); vote(g, 'p1', 'p0', t); vote(g, 'p2', 'p1', t); vote(g, 'p3', 'p0', t);
  tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'revote');
  const before = g.candidates.slice();
  A(g, 'drop', 'p1');
  if (g.phase === 'revote') { assert.deepEqual(g.candidates, before.filter((x) => x !== 'p1')); futureOrNull(g); }
});

for (const stage of ['defense', 'judge', 'judged']) {
  test(`drop: 지목된 시민이 ${stage} 에 빠지면 지목 취소, accuseNo 그대로 다시 토론`, () => {
    const g = make(5, { liarIdx: 0 });
    toJudge(g, 'p1');
    if (stage === 'defense') { /* toJudge 는 judge 까지 감 */ }
    if (stage === 'judged') { judgeAll(g, 'p1', 'no'); tick(g, g.phaseEndsAt); assert.equal(g.phase, 'judged'); }
    const logLen = g.voteLog.length;
    const t = g.phaseStartedAt + 1000;
    const r = A(g, 'drop', 'p1', t);
    assert.ok(r.ok);
    assert.equal(g.phase, 'discuss'); assert.equal(g.accuseNo, 1);
    assert.equal(g.accused, null); assert.equal(g.judge, null);
    assert.equal(g.voteLog.length, logLen - 1);
    assert.equal(g.phaseEndsAt, t + DEFAULT_TIMES.rediscuss * S);
    assert.deepEqual(viewFor(g, 'p2').votes, {});
    futureOrNull(g);
  });
}

test('drop: 처형된 시민이 unmask 중 빠져도 정상 진행, 빠진 사람 delta 0', () => {
  const g = make(5, { liarIdx: 0 }); toJudge(g, 'p1');
  judgeAll(g, 'p1', 'yes'); pastJudge(g); tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'unmask');
  A(g, 'drop', 'p2');
  tick(g, g.phaseEndsAt); tick(g, g.phaseEndsAt);
  assert.equal(g.phase, 'result'); assert.equal(g.result.delta.p2, 0);
});

test('drop: 무작위로 끊고 빠지며 끝까지 돌려도 wakeAt 이 과거가 아니다', () => {
  for (let seed = 0; seed < 40; seed++) {
    let x = seed + 1; const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
    const g = make(6, { liarIdx: rnd(6) }); let t = T0;
    for (let step = 0; step < 300 && g.phase !== 'result'; step++) {
      const id = `p${rnd(6)}`; const k = rnd(8);
      if (k === 0) act(g, { type: 'away', by: id }, t);
      else if (k === 1) act(g, { type: 'back', by: id }, t);
      else if (k === 2 && rnd(6) === 0) act(g, { type: 'drop', by: id }, t);
      else if (k === 3) act(g, { type: 'vote', by: id, target: `p${rnd(6)}` }, t);
      else if (k === 4) act(g, { type: 'judge', by: id, v: rnd(2) ? 'yes' : 'no' }, t);
      else if (k === 5) act(g, { type: 'say', by: id, text: 'a' }, t);
      const w = wakeAt(g);
      if (g.phase === 'result') { assert.equal(w, null); break; }
      assert.ok(w > t, `seed ${seed} phase ${g.phase} wake ${w} now ${t}`);
      t = w; tick(g, t);
    }
  }
});
