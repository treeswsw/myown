// 갱식마인드 규칙 엔진 시험 (GDD 3·4·8·10절). 시계·난수·단어는 전부 시험이 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, join, back, away, leave, kick, setSettings, start, toLobby, end, pickWord, give, skip,
  chat, chatLogFor, mediaCheck, tick, nextDeadline, viewFor, canDraw, noteInk, setCanvasFlags, errorMsg, ERRORS,
} from '../../shared/draw/game.js';
import { TIMES } from '../../shared/draw/constants.js';

const S = 1000;
const T0 = 1_000_000;
const TOPICS = ['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '탈것', '영화·만화', '나라·도시', '인물'];
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);

// 단어: 부를 때마다 새 후보 3개 (정답 = 'W{k}a' 등, 다른 이름 = 'A{k}a')
function makeWords() {
  let k = 0;
  const w = (topics) => {
    k++;
    return ['a', 'b', 'c'].map((x) => ({ w: `단어${k}${x}`, topic: topics[0], alt: [`별명${k}${x}`] }));
  };
  return w;
}

// n명이 들어온 방. rng 는 기본 항상 0(첫 출제자 = 자리 0)
function room(n, settings = {}, rng = () => 0) {
  const words = makeWords();
  const E = (now) => ({ now, rng, words });
  const s = createRoom({ code: 'KQZT', host: { id: 'p0', name: 'n0' }, allTopics: TOPICS, topics: TOPICS.slice(0, 8), now: T0 });
  for (let i = 1; i < n; i++) assert.ok(join(s, { id: `p${i}`, name: `n${i}` }, E(T0)).ok);
  if (Object.keys(settings).length) assert.ok(setSettings(s, 'p0', settings, E(T0)).ok);
  return { s, E, words };
}
const ok = (fx) => { assert.ok(fx.ok, `${fx.code} ${fx.msg}`); return fx; };

// 시작해서 그리기 단계까지 (첫 단어 고르기). 돌려주는 값 = 그리기 시작 시각
function toDraw(s, E, t, i = 0) {
  assert.equal(s.phase, 'pick');
  ok(pickWord(s, s.cur.drawerId, i, E(t)));
  assert.equal(s.phase, 'draw');
  return t;
}
const answer = (s) => s.cur.entry.w;
const drawer = (s) => s.cur.drawerId;
// 그리기 → 정답 공개까지 포기로 넘기고, 공개 5초 뒤 다음으로. 돌려주는 값 = 다음 시각
function giveAndNext(s, E, t) {
  toDraw(s, E, t);
  ok(give(s, drawer(s), E(t)));
  assert.equal(s.phase, 'reveal');
  t += TIMES.reveal * S;
  tick(s, t, E(t));
  return t;
}

// ---------- 출제 순서와 라운드 ----------

test('순서대로: 첫 출제자만 난수, 이후 자리 순서. 한 라운드에 한 번씩, 라운드 수만큼', () => {
  const { s, E } = room(4, { order: 'seq', rounds: 2 }, () => 2); // 첫 출제자 = 자리 2 (p2)
  let t = T0;
  ok(start(s, 'p0', E(t)));
  assert.equal(s.qTotal, 8);
  const seen = [];
  while (s.phase !== 'final') {
    seen.push(drawer(s));
    t = giveAndNext(s, E, t);
  }
  assert.deepEqual(seen, ['p2', 'p3', 'p0', 'p1', 'p2', 'p3', 'p0', 'p1']);
  assert.equal(viewFor(s, 'p0').qTotal, 8);
  assert.equal(viewFor(s, 'p0').roundNo, 2);
});

test('라운드 수 1·2·3·5 만큼 문제가 나온다 (인원 × 라운드)', () => {
  for (const rounds of [1, 2, 3, 5]) {
    const { s, E } = room(3, { rounds });
    let t = T0; let n = 0;
    ok(start(s, 'p0', E(t)));
    while (s.phase !== 'final') { n++; t = giveAndNext(s, E, t); }
    assert.equal(n, 3 * rounds, `rounds ${rounds}`);
  }
});

test('맞힌 사람: 가장 먼저 맞힌 사람이 다음에 그린다. 이미 그렸으면 다음으로 빨리 맞힌 사람. 한 라운드에 두 번 그리지 않는다', () => {
  const { s, E } = room(4, { order: 'hit', rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  // q1: p0 이 그린다. p2 가 먼저, p1 이 나중에 맞힘 → 다음은 p2
  assert.equal(drawer(s), 'p0');
  toDraw(s, E, t);
  ok(chat(s, 'p2', answer(s), E(t + 1 * S)));
  ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  tick(s, t + 40 * S, E(t + 40 * S)); // 30초 단축 뒤 시간 끝
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.nextId, 'p2');
  t += 40 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  assert.equal(drawer(s), 'p2');
  // q2: p0(이미 그림)이 가장 먼저, p1 이 두 번째로 맞힘 → 다음은 p1
  toDraw(s, E, t);
  ok(chat(s, 'p0', answer(s), E(t + 1 * S)));
  ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  tick(s, t + 40 * S, E(t + 40 * S));
  t += 40 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  assert.equal(drawer(s), 'p1');
  // q3: 맞힌 사람 중 안 그린 사람이 없다(p0·p2 는 그림, p3 는 안 맞힘) → 안 그린 p3
  toDraw(s, E, t);
  ok(chat(s, 'p0', answer(s), E(t + 1 * S)));
  ok(chat(s, 'p2', answer(s), E(t + 2 * S)));
  tick(s, t + 40 * S, E(t + 40 * S));
  t += 40 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  assert.equal(drawer(s), 'p3');
  // q4 (마지막): 아무도 못 맞힘 → 라운드가 끝나 최종 순위
  t = giveAndNext(s, E, t);
  assert.equal(s.phase, 'final');
});

test('맞힌 사람: 아무도 못 맞히면 안 그린 사람 중 자리 순서', () => {
  const { s, E } = room(3, { order: 'hit', rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  const seen = [];
  while (s.phase !== 'final') { seen.push(drawer(s)); t = giveAndNext(s, E, t); }
  assert.deepEqual(seen, ['p0', 'p1', 'p2']);
});

test('랜덤: 안 그린 사람 중 인자 난수로. 모두 한 번씩 그린 뒤에야 다음 라운드, 라운드 바뀔 때 바로 또 뽑히지 않음', () => {
  // start 의 첫 출제자 rng(3)=1 → p1. 그다음 후보 [p0,p2] 에서 rng(2)=1 → p2, 남은 p0 는 rng(1)=0.
  // 라운드 2: 방금 그린 p0 를 빼고 [p1,p2] 에서 rng(2)=0 → p1 ...
  const vals = [1, 1, 0, 0, 1, 0];
  const calls = [];
  const rng = (n) => { const v = vals.shift(); calls.push(n); assert.ok(v >= 0 && v < n, `rng(${n}) 에 ${v}`); return v; };
  const { s, E } = room(3, { order: 'rand', rounds: 2 }, rng);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  const seen = [];
  while (s.phase !== 'final') { seen.push(drawer(s)); t = giveAndNext(s, E, t); }
  assert.deepEqual(seen.slice(0, 3), ['p1', 'p2', 'p0']);
  assert.notEqual(seen[3], 'p0', '라운드가 바뀌면서 방금 그린 사람이 또 뽑힘');
  assert.deepEqual([...seen.slice(3)].sort(), ['p0', 'p1', 'p2']);
  assert.deepEqual(calls.slice(0, 3), [3, 2, 1]);
});

test('랜덤: 2명이면 라운드 경계 제외 규칙이 없다 (난수 그대로)', () => {
  const vals = [0, 0, 0, 0];
  const { s, E } = room(2, { order: 'rand', rounds: 2 }, () => vals.shift());
  let t = T0;
  ok(start(s, 'p0', E(t)));
  const seen = [];
  while (s.phase !== 'final') { seen.push(drawer(s)); t = giveAndNext(s, E, t); }
  assert.deepEqual(seen, ['p0', 'p1', 'p0', 'p1']);
});

test('끊긴 사람 차례는 건너뛴다 (그 라운드에 그린 것으로 침)', () => {
  const { s, E } = room(4, { order: 'seq', rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  ok(away(s, 'p2', E(t)));
  const seen = [];
  while (s.phase !== 'final') { seen.push(drawer(s)); t = giveAndNext(s, E, t); }
  assert.deepEqual(seen, ['p0', 'p1', 'p3']);
});

test('진행 중에 들어온 사람은 다음 라운드부터 그린다', () => {
  const { s, E } = room(3, { order: 'seq', rounds: 2 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  ok(join(s, { id: 'p3', name: 'n3' }, E(t)));
  assert.equal(findDrew(s, 'p3'), true);
  const seen = [];
  while (s.phase !== 'final') { seen.push(drawer(s)); t = giveAndNext(s, E, t); }
  // 라운드 1 은 처음 있던 3명(들어온 p3 는 건너뜀), 라운드 2 는 방금 그린 p2 다음 자리인 p3 부터
  assert.deepEqual(seen, ['p0', 'p1', 'p2', 'p3', 'p0', 'p1', 'p2']);
});
const findDrew = (s, id) => s.players.find((p) => p.id === id).drew;

// ---------- 점수 (GDD 3-4 예시) ----------

test('점수: 2분 20초, 18초에 첫 정답 = 112, 30초로 줄고 25초 남기고 51, 14초 남기고 46', () => {
  const { s, E } = room(5, { time: 140 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  const startAt = t;
  const endsAt0 = s.endsAt;
  assert.equal(endsAt0, startAt + 140 * S);
  const fx = ok(chat(s, 'p1', answer(s), E(startAt + 18 * S)));
  assert.equal(s.cur.hits[0].pts, 112);
  assert.equal(s.endsAt, startAt + 18 * S + 30 * S); // 30초로 줄어듦
  assert.equal(s.rushed, true);
  assert.deepEqual(fx.events.map((e) => e.e), [{ k: 'drHit', id: 'p1', order: 1 }]);
  ok(chat(s, 'p2', answer(s), E(startAt + 23 * S))); // 25초 남김
  assert.equal(s.cur.hits[1].pts, 51);
  ok(chat(s, 'p3', answer(s), E(startAt + 34 * S))); // 14초 남김
  assert.equal(s.cur.hits[2].pts, 46);
  assert.equal(s.cur.hits[1].order, 2);
});

test('점수: 단축 전에 이미 30초 이하로 남았으면 시간은 그대로이고 rushed 는 false', () => {
  const { s, E } = room(3, { time: 60 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  const end0 = s.endsAt;
  ok(chat(s, 'p1', answer(s), E(t + 45 * S))); // 15초 남음
  assert.equal(s.endsAt, end0);
  assert.equal(s.rushed, false);
  assert.equal(s.cur.hits[0].pts, 40 + 15 + 20); // 40 + 60×15/60 + 20
});

test('점수: 첫 정답자는 단축 전 끝 시각으로 계산, 분모는 settings.time', () => {
  const { s, E } = room(3, { time: 90 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t))); // 바로 맞힘 = 40 + 60 + 20
  assert.equal(s.cur.hits[0].pts, 120);
});

test('모두 맞히면 즉시 정답 공개, 그린 사람 100점, 점수는 공개 때 합산', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + 10 * S)));
  assert.equal(s.phase, 'draw');
  assert.equal(s.players.find((p) => p.id === 'p1').score, 0, '공개 전에는 점수를 더하지 않는다');
  const fx = ok(chat(s, 'p2', answer(s), E(t + 20 * S)));
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.why, 'all');
  assert.equal(s.reveal.drawerPts, 100);
  assert.equal(s.reveal.guessers, 2);
  assert.equal(s.reveal.gains.length, 2);
  assert.equal(s.reveal.nextId, 'p1');
  const v = viewFor(s, 'p2');
  assert.equal(v.players.find((p) => p.id === 'p0').score, 100);
  assert.equal(v.players.find((p) => p.id === 'p1').correct, 1);
  assert.ok(fx.room.length === 3);
});

test('시간 끝: 일부만 맞힘 → 그린 사람 = 100 × 맞힌 수 ÷ 맞힐 수 있던 수 (맞힐 수 있던 5명 중 3명 = 60)', () => {
  const { s, E } = room(6);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  for (const id of ['p1', 'p2', 'p3']) ok(chat(s, id, answer(s), E(t + 5 * S)));
  assert.equal(s.cur.guessers.length, 5);
  tick(s, t + 5 * S + 30 * S, E(t + 35 * S));
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.why, 'time');
  assert.equal(s.reveal.drawerPts, 60);
});

test('아무도 못 맞히고 시간 끝: 모두 0점', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  const idle = ok(chat(s, 'p1', '틀린말', E(t + S))); // 오답 한 번
  assert.equal(idle.events[0].e.k, 'chat');
  noteInk(s, 'p0');
  tick(s, t + 140 * S, E(t + 140 * S));
  assert.equal(s.reveal.why, 'time');
  assert.ok(s.players.every((p) => p.score === 0));
});

test('같은 사람이 정답을 또 쳐도 점수는 한 번 (두 번째부터는 정답자끼리 글)', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + S)));
  const fx = ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  assert.equal(s.cur.hits.length, 1);
  assert.equal(fx.events[0].e.sec, 1);
});

test('다른 이름(alt)·띄어쓰기·크기 표시(#,*)도 정답. 비슷한 글은 오답', () => {
  const { s, E } = room(6);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  const w = answer(s);
  const alt = s.cur.entry.alt[0];
  ok(chat(s, 'p1', alt, E(t + S)));
  ok(chat(s, 'p2', `# ${w}`, E(t + 2 * S)));
  ok(chat(s, 'p3', `*** ${w.slice(0, 2)} ${w.slice(2)}`, E(t + 3 * S)));
  ok(chat(s, 'p4', `${w}인가`, E(t + 4 * S)));
  assert.deepEqual(s.cur.hits.map((h) => h.id), ['p1', 'p2', 'p3']);
});

test('동시 정답: 먼저 도착한 사람이 첫 정답자 (+20)', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p2', answer(s), E(t + 10 * S)));
  ok(chat(s, 'p1', answer(s), E(t + 10 * S)));
  assert.equal(s.cur.hits[0].id, 'p2');
  assert.ok(s.cur.hits[0].pts > s.cur.hits[1].pts);
});

// ---------- 끝 조건 ----------

test('포기: 그린 사람 0점, 이미 맞힌 사람 점수는 그대로', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + 10 * S)));
  const pts = s.cur.hits[0].pts;
  assert.equal(give(s, 'p1', E(t + 11 * S)).ok, false); // 그리는 사람만
  ok(give(s, 'p0', E(t + 11 * S)));
  assert.equal(s.reveal.why, 'give');
  assert.equal(s.reveal.drawerPts, 0);
  assert.equal(viewFor(s, 'p2').players.find((p) => p.id === 'p1').score, pts);
});

test('무입력: 시작 후 20초 안에 첫 선이 없으면 넘김, 첫 선이 있으면 넘기지 않음', () => {
  const a = room(3);
  let t = T0;
  ok(start(a.s, 'p0', a.E(t)));
  toDraw(a.s, a.E, t);
  tick(a.s, t + 19 * S, a.E(t + 19 * S));
  assert.equal(a.s.phase, 'draw');
  assert.equal(nextDeadline(a.s), t + 20 * S);
  tick(a.s, t + 20 * S, a.E(t + 20 * S));
  assert.equal(a.s.phase, 'reveal');
  assert.equal(a.s.reveal.why, 'idle');
  assert.equal(a.s.reveal.drawerPts, 0);

  const b = room(3);
  ok(start(b.s, 'p0', b.E(t)));
  toDraw(b.s, b.E, t);
  assert.equal(noteInk(b.s, 'p1'), false); // 그리는 사람만
  assert.equal(noteInk(b.s, 'p0'), true);
  tick(b.s, t + 100 * S, b.E(t + 100 * S));
  assert.equal(b.s.phase, 'draw');
  assert.equal(nextDeadline(b.s), b.s.endsAt);
});

test('넘기기: 방장만, pick·draw 에서', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  assert.equal(skip(s, 'p1', E(t)).code, 'dr_host');
  const fx = ok(skip(s, 'p0', E(t + S))); // pick 중에 넘김 → 첫 단어가 정답으로 공개
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.why, 'skip');
  assert.deepEqual(fx.use, [s.reveal.word]);
  assert.equal(skip(s, 'p0', E(t + 2 * S)).code, 'dr_now');
  t += TIMES.reveal * S + S;
  tick(s, t, E(t));
  toDraw(s, E, t);
  ok(chat(s, 'p2', answer(s), E(t + S)));
  ok(skip(s, 'p0', E(t + 2 * S)));
  assert.equal(s.reveal.why, 'skip');
  assert.equal(s.reveal.drawerPts, 0);
  assert.equal(s.reveal.gains.length, 1);
});

test('그리는 사람이 나감: 즉시 끝(점수 없음), 공개 뒤 다음 사람', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + S)));
  const fx = ok(leave(s, 'p0', E(t + 2 * S)));
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.why, 'left');
  assert.equal(s.reveal.drawerPts, 0);
  assert.equal(s.hostId, 'p1'); // 방장이 나가면 가장 먼저 들어온 사람
  assert.ok(fx.events.some((e) => e.e.k === 'left' && e.e.id === 'p0'));
  assert.ok(!fx.room.includes('p0'));
  t += TIMES.reveal * S + 2 * S;
  tick(s, t, E(t));
  assert.equal(s.phase, 'pick');
  assert.equal(drawer(s), 'p1');
});

test('그리는 사람 끊김 15초: 14초엔 기다리고 15초에 정답 없이 끝, 돌아오면 이어서', () => {
  const a = room(3);
  let t = T0;
  ok(start(a.s, 'p0', a.E(t)));
  toDraw(a.s, a.E, t);
  noteInk(a.s, 'p0');
  ok(away(a.s, 'p0', a.E(t + 5 * S)));
  assert.equal(nextDeadline(a.s), t + 20 * S);
  tick(a.s, t + 19 * S, a.E(t + 19 * S));
  assert.equal(a.s.phase, 'draw');
  tick(a.s, t + 20 * S, a.E(t + 20 * S));
  assert.equal(a.s.phase, 'reveal');
  assert.equal(a.s.reveal.why, 'left');

  const b = room(3);
  ok(start(b.s, 'p0', b.E(t)));
  toDraw(b.s, b.E, t);
  noteInk(b.s, 'p0');
  ok(away(b.s, 'p0', b.E(t + 5 * S)));
  ok(back(b.s, 'p0', b.E(t + 18 * S)));
  tick(b.s, t + 60 * S, b.E(t + 60 * S));
  assert.equal(b.s.phase, 'draw');
});

test('맞히는 사람 끊김: 60초 자리 유지 뒤 나감, 그 전에 돌아오면 자리 그대로. 끊긴 사람을 빼고 모두 맞히면 끝', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  noteInk(s, 'p0');
  ok(away(s, 'p3', E(t + S)));
  const seat3 = s.players.find((p) => p.id === 'p3').seat;
  ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  assert.equal(s.phase, 'draw');
  ok(chat(s, 'p2', answer(s), E(t + 3 * S)));
  assert.equal(s.phase, 'reveal'); // 접속 중인 사람은 모두 맞힘
  assert.equal(s.reveal.guessers, 3); // 맞힐 수 있던 사람 수는 시작 때 기준
  // 60초 지나면 나감
  tick(s, t + S + 59 * S, E(t + 60 * S));
  assert.ok(s.players.some((p) => p.id === 'p3'));
  const fx = tick(s, t + S + 60 * S, E(t + 61 * S));
  assert.ok(!s.players.some((p) => p.id === 'p3'));
  assert.ok(fx.events.some((e) => e.e.k === 'left' && e.e.id === 'p3'));
  // 돌아오기: 자리 이어받기
  const r = room(3);
  ok(start(r.s, 'p0', r.E(t)));
  ok(away(r.s, 'p2', r.E(t)));
  ok(join(r.s, { id: 'p2', name: 'n2' }, r.E(t + 30 * S)));
  assert.equal(r.s.players.find((p) => p.id === 'p2').connected, true);
  assert.equal(seat3, 3);
});

test('남은 사람이 1명이 되면 판을 끝내고 방 대기로 (점수 저장 표시)', () => {
  const { s, E } = room(2);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + S))); // 모두 맞힘 → 공개
  const fx = ok(leave(s, 'p1', E(t + 2 * S)));
  assert.equal(s.phase, 'lobby');
  assert.equal(fx.finished.reason, 'alone');
  assert.equal(fx.finished.save, true);
  assert.equal(fx.finished.ranking.length, 2);
  assert.equal(fx.finished.ranking.find((r) => r.id === 'p1').left, true);
  assert.ok(s.players.every((p) => p.score === 0));
});

test('방장 "이 판 끝내기": 방 대기로, 저장 안 함', () => {
  const { s, E } = room(3);
  ok(start(s, 'p0', E(T0)));
  assert.equal(end(s, 'p1', E(T0)).code, 'dr_host');
  const fx = ok(end(s, 'p0', E(T0)));
  assert.equal(s.phase, 'lobby');
  assert.equal(fx.finished.save, false);
  assert.equal(end(s, 'p0', E(T0)).code, 'dr_now');
});

// ---------- 단어 고르기 ----------

test('단어 고르기: 그리는 사람만 i, 10초 지나면 첫 단어 자동, use 로 알림', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  assert.equal(pickWord(s, 'p1', 0, E(t)).code, 'dr_now');
  assert.equal(pickWord(s, 'p0', 3, E(t)).code, 'dr_bad');
  const first = s.cur.cands[0].w;
  const fx = tick(s, t + 10 * S, E(t + 10 * S));
  assert.equal(s.phase, 'draw');
  assert.equal(answer(s), first);
  assert.deepEqual(fx.use, [first]);
  assert.equal(s.endsAt, t + 10 * S + 140 * S);

  const b = room(3);
  ok(start(b.s, 'p0', b.E(t)));
  const w2 = b.s.cur.cands[2].w;
  assert.deepEqual(ok(pickWord(b.s, 'p0', 2, b.E(t + 3 * S))).use, [w2]);
  assert.equal(answer(b.s), w2);
  assert.equal(b.s.endsAt, t + 3 * S + 140 * S);
});

test('시작: 방장만·2명 이상·접속 중 2명 이상', () => {
  const { s, E } = room(1);
  assert.equal(start(s, 'p0', E(T0)).code, 'dr_need2');
  join(s, { id: 'p1', name: 'n1' }, E(T0));
  assert.equal(start(s, 'p1', E(T0)).code, 'dr_host');
  away(s, 'p1', E(T0));
  assert.equal(start(s, 'p0', E(T0)).code, 'dr_need2');
  back(s, 'p1', E(T0));
  assert.ok(start(s, 'p0', E(T0)).ok);
  assert.equal(start(s, 'p0', E(T0)).code, 'dr_now');
});

// ---------- 최종 순위·한 판 더 ----------

test('최종 순위: 점수 → 맞힌 횟수, 동점 공동 순위(1·1·3), finished 로 저장할 값', () => {
  const { s, E } = room(3, { rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  // q1(p0): p1,p2 둘 다 맞힘(같은 시각이 아니라 순서 차) / q2(p1): 아무도 못 맞힘 / q3(p2): 아무도 못 맞힘
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + 10 * S)));
  ok(chat(s, 'p2', answer(s), E(t + 10 * S)));
  t += 10 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  t = giveAndNext(s, E, t);
  t = giveAndNext(s, E, t);
  assert.equal(s.phase, 'final');
  const v = viewFor(s, 'p1');
  assert.equal(v.ranking.length, 3);
  // p0 100점(1 맞힘 0), p1 점수 > p2 점수(첫 정답 +20), 같은 시각이어도 +20 때문에 p1 이 위
  assert.deepEqual(v.ranking.map((r) => r.id), ['p1', 'p0', 'p2'].sort((a, b) => v.ranking.findIndex((r) => r.id === a) - v.ranking.findIndex((r) => r.id === b)));
  assert.equal(v.ranking[0].rank, 1);
  assert.equal(v.endsAt, null);
});

test('동점은 공동 순위 (점수와 맞힌 횟수가 모두 같을 때)', () => {
  const { s, E } = room(2, { rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  t = giveAndNext(s, E, t);
  t = giveAndNext(s, E, t);
  assert.equal(s.phase, 'final');
  const r = viewFor(s, 'p0').ranking;
  assert.deepEqual(r.map((x) => x.rank), [1, 1]);
});

test('끝나면 finished(save:true, 순위)를 돌려준다. 한 판 더는 같은 설정으로 새 판, 방으로는 방 대기', () => {
  const { s, E } = room(2, { rounds: 1, order: 'hit', time: 60 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + S)));
  t += S + TIMES.reveal * S;
  tick(s, t, E(t));
  toDraw(s, E, t);
  ok(chat(s, 'p0', answer(s), E(t + S)));
  t += S;
  const fx = tick(s, t + TIMES.reveal * S, E(t + TIMES.reveal * S));
  assert.equal(s.phase, 'final');
  assert.equal(fx.finished.reason, 'done');
  assert.equal(fx.finished.save, true);
  assert.equal(fx.finished.ranking.length, 2);
  t += TIMES.reveal * S;
  // 방장이 아니면 못 한다
  assert.equal(start(s, 'p1', E(t)).code, 'dr_host');
  assert.equal(toLobby(s, 'p1', E(t)).code, 'dr_host');
  ok(start(s, 'p0', E(t)));
  assert.equal(s.phase, 'pick');
  assert.equal(s.q, 1);
  assert.equal(s.settings.order, 'hit');
  assert.equal(s.settings.time, 60);
  assert.ok(s.players.every((p) => p.score === 0 && p.correct === 0));
  // 방으로
  const c = room(2, { rounds: 1 });
  ok(start(c.s, 'p0', c.E(t)));
  let u = t;
  u = giveAndNext(c.s, c.E, u);
  u = giveAndNext(c.s, c.E, u);
  assert.equal(c.s.phase, 'final');
  ok(toLobby(c.s, 'p0', c.E(u)));
  assert.equal(c.s.phase, 'lobby');
  assert.equal(viewFor(c.s, 'p0').ranking, null);
});

test('판 도중 나간 사람(그리는 차례였던 사람)도 순위에 남는다', () => {
  const { s, E } = room(3, { rounds: 1 });
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p1', answer(s), E(t + S)));
  ok(chat(s, 'p2', answer(s), E(t + 2 * S)));
  t += 2 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  ok(leave(s, 'p1', E(t))); // 판 도중 나감 (2명 남음)
  assert.equal(s.phase, 'reveal');
  t += TIMES.reveal * S;
  tick(s, t, E(t));
  assert.equal(s.phase, 'pick');
  while (s.phase !== 'final') t = giveAndNext(s, E, t);
  const r = viewFor(s, 'p0').ranking;
  assert.ok(r.some((x) => x.id === 'p1' && x.left === true));
});

// ---------- 설정 (10-2) ----------

test('설정: 방장만, lobby·final 만, 보낸 칸만 바뀜, 값이 틀리면 dr_bad', () => {
  const { s, E } = room(2);
  assert.equal(setSettings(s, 'p1', { rounds: 3 }, E(T0)).code, 'dr_host');
  const fx = ok(setSettings(s, 'p0', { rounds: 3, time: 60, order: 'rand', len: false }, E(T0)));
  assert.deepEqual(fx.room.sort(), ['p0', 'p1']);
  assert.deepEqual([s.settings.rounds, s.settings.time, s.settings.order, s.settings.len], [3, 60, 'rand', false]);
  for (const bad of [{ rounds: 4 }, { time: 100 }, { order: 'x' }, { len: 'yes' }, {}, { foo: 1 }, { topics: [] }, { topics: ['없는주제'] }, { topics: 'x' }]) {
    const before = JSON.stringify(s.settings);
    assert.equal(setSettings(s, 'p0', bad, E(T0)).code, 'dr_bad', JSON.stringify(bad));
    assert.equal(JSON.stringify(s.settings), before);
  }
  // 한 칸이라도 틀리면 아무것도 바뀌지 않는다
  assert.equal(setSettings(s, 'p0', { rounds: 1, time: 77 }, E(T0)).code, 'dr_bad');
  assert.equal(s.settings.rounds, 3);
  // 없는 주제는 무시, 중복은 지움
  ok(setSettings(s, 'p0', { topics: ['동물', '없는것', '동물', '음식'] }, E(T0)));
  assert.deepEqual(s.settings.topics, ['동물', '음식']);
  ok(start(s, 'p0', E(T0)));
  assert.equal(setSettings(s, 'p0', { rounds: 1 }, E(T0)).code, 'dr_now');
});

test('내보내기: 방장만, lobby·final, 자기 자신·없는 사람은 안 됨', () => {
  const { s, E } = room(3);
  assert.equal(kick(s, 'p1', 'p2', E(T0)).code, 'dr_host');
  assert.equal(kick(s, 'p0', 'p0', E(T0)).code, 'dr_bad');
  assert.equal(kick(s, 'p0', 'zz', E(T0)).code, 'dr_bad');
  const fx = ok(kick(s, 'p0', 'p2', E(T0)));
  assert.deepEqual(fx.kicked, ['p2']);
  assert.ok(!s.players.some((p) => p.id === 'p2'));
  ok(start(s, 'p0', E(T0)));
  assert.equal(kick(s, 'p0', 'p1', E(T0)).code, 'dr_now');
});

// ---------- 자리·방장·들어오기 ----------

test('자리: 빈 번호를 채우고, 8명이 넘으면 막고, 다시 붙으면 자리 그대로', () => {
  const { s, E } = room(8);
  assert.deepEqual(s.players.map((p) => p.seat), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(join(s, { id: 'x', name: 'x' }, E(T0)).ok, false);
  ok(leave(s, 'p3', E(T0)));
  ok(join(s, { id: 'y', name: 'y' }, E(T0)));
  assert.equal(s.players.find((p) => p.id === 'y').seat, 3);
  ok(away(s, 'p5', E(T0)));
  ok(join(s, { id: 'p5', name: 'n5' }, E(T0 + S)));
  assert.equal(s.players.find((p) => p.id === 'p5').seat, 5);
  assert.equal(viewFor(s, 'p0').players.map((p) => p.seat).join(), '0,1,2,3,4,5,6,7');
});

test('방장이 나가면 가장 먼저 들어온 사람', () => {
  const { s, E } = room(3);
  ok(leave(s, 'p0', E(T0)));
  assert.equal(s.hostId, 'p1');
  ok(leave(s, 'p1', E(T0)));
  assert.equal(s.hostId, 'p2');
});

test('들어오기·끊김·돌아옴 알림은 본인을 뺀 접속 중인 사람에게', () => {
  const { s, E } = room(2);
  const fx = ok(join(s, { id: 'p9', name: 'n9' }, E(T0)));
  assert.deepEqual(fx.events, [{ to: ['p0', 'p1'], e: { k: 'joined', id: 'p9', name: 'n9' } }]);
  assert.deepEqual(fx.room.sort(), ['p0', 'p1', 'p9']);
  const a = ok(away(s, 'p1', E(T0)));
  assert.deepEqual(a.events[0].to.sort(), ['p0', 'p9']);
  const b = ok(back(s, 'p1', E(T0)));
  assert.deepEqual(b.events[0].to.sort(), ['p0', 'p9']);
});

test('진행 중에 들어온 사람: 이번 문제는 못 맞히고(정답을 치면 dr_now) 다음 문제부터 맞힌다', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  noteInk(s, 'p0');
  ok(join(s, { id: 'p3', name: 'n3' }, E(t + S)));
  assert.equal(chat(s, 'p3', answer(s), E(t + 2 * S)).code, 'dr_now');
  assert.equal(s.cur.hits.length, 0);
  ok(chat(s, 'p1', answer(s), E(t + 3 * S)));
  ok(chat(s, 'p2', answer(s), E(t + 4 * S)));
  assert.equal(s.phase, 'reveal', 'p3 는 맞힐 사람에 들지 않아 기다리지 않는다 → 끝나야 한다');
  assert.equal(s.reveal.guessers, 2);
  t += 4 * S + TIMES.reveal * S;
  tick(s, t, E(t));
  assert.equal(s.phase, 'pick');
  toDraw(s, E, t);
  noteInk(s, drawer(s));
  assert.equal(s.cur.guessers.includes('p3') || drawer(s) === 'p3', true);
});

// ---------- 채팅 (10-6) ----------

test('채팅 권한: 그리는 사람은 pick·draw 동안 채팅·이모티콘·사진 이모티콘 모두 거절', () => {
  const { s, E } = room(3);
  let t = T0;
  assert.ok(chat(s, 'p0', '방에서는 말할 수 있다', E(t)).ok);
  ok(start(s, 'p0', E(t)));
  assert.equal(chat(s, 'p0', '힌트', E(t)).code, 'dr_drawer_mute');
  assert.equal(chat(s, 'p0', '힌트', E(t)).msg, '그림으로만 설명해 주세요.');
  assert.equal(mediaCheck(s, 'p0', 'basic').code, 'dr_drawer_mute');
  assert.equal(mediaCheck(s, 'p0', 'media').code, 'dr_drawer_mute');
  assert.ok(mediaCheck(s, 'p1', 'media').ok);
  toDraw(s, E, t);
  assert.equal(chat(s, 'p0', '힌트', E(t)).code, 'dr_drawer_mute');
  ok(chat(s, 'p1', answer(s), E(t + S)));
  assert.ok(mediaCheck(s, 'p1', 'basic').ok);
  assert.equal(mediaCheck(s, 'p1', 'media').code, 'dr_hit_media');
  assert.ok(mediaCheck(s, 'p2', 'media').ok);
  give(s, 'p0', E(t + 2 * S));
  assert.ok(chat(s, 'p0', '이제 말할 수 있다', E(t + 3 * S)).ok); // reveal
  assert.ok(mediaCheck(s, 'p1', 'media').ok);
});

test('채팅 전달: 못 맞힌 사람의 글은 방 전원, 정답은 채팅으로 안 나가고 drHit, 정답자 글은 sec 로 정답자·그리는 사람에게만', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  let fx = ok(chat(s, 'p2', '고양이?', E(t + S)));
  assert.deepEqual(fx.events[0].to.sort(), ['p0', 'p1', 'p2', 'p3']);
  assert.equal(fx.events[0].e.sec, undefined);
  fx = ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  assert.deepEqual(fx.events.map((e) => e.e.k), ['drHit']);
  assert.deepEqual(fx.events[0].to.sort(), ['p0', 'p1', 'p2', 'p3']);
  fx = ok(chat(s, 'p1', '이건 힌트야', E(t + 3 * S)));
  assert.deepEqual(fx.events[0].to.sort(), ['p0', 'p1']);
  assert.equal(fx.events[0].e.sec, 1);
  // 두 번째 정답자가 생기면 정답자끼리
  ok(chat(s, 'p2', answer(s), E(t + 4 * S)));
  fx = ok(chat(s, 'p1', '또 힌트', E(t + 5 * S)));
  assert.deepEqual(fx.events[0].to.sort(), ['p0', 'p1', 'p2']);
});

test('채팅 기록(chatLog): 못 맞힌 사람에게는 이번 문제의 sec 글을 뺀다', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(chat(s, 'p2', '오답이야', E(t + S)));
  ok(chat(s, 'p1', answer(s), E(t + 2 * S)));
  ok(chat(s, 'p1', '비밀 힌트', E(t + 3 * S)));
  assert.deepEqual(chatLogFor(s, 'p3').map((x) => x.text), ['오답이야']);
  assert.deepEqual(chatLogFor(s, 'p2').map((x) => x.text), ['오답이야']);
  assert.deepEqual(chatLogFor(s, 'p1').map((x) => x.text), ['오답이야', '비밀 힌트']);
  assert.deepEqual(chatLogFor(s, 'p0').map((x) => x.text), ['오답이야', '비밀 힌트']);
  assert.ok(!('q' in chatLogFor(s, 'p1')[0]));
  // 공개 뒤에는 모두
  give(s, 'p0', E(t + 4 * S));
  assert.deepEqual(chatLogFor(s, 'p3').map((x) => x.text), ['오답이야', '비밀 힌트']);
});

test('채팅 형식·속도: 1~40자, 1초 3개, 10초 15개', () => {
  const { s, E } = room(2);
  let t = T0;
  assert.equal(chat(s, 'p1', '', E(t)).code, 'dr_bad');
  assert.equal(chat(s, 'p1', '   ', E(t)).code, 'dr_bad');
  assert.equal(chat(s, 'p1', 'ㅋ'.repeat(41), E(t)).code, 'dr_bad');
  assert.ok(chat(s, 'p1', 'ㅋ'.repeat(40), E(t)).ok);
  assert.ok(chat(s, 'p1', 'a', E(t + 100)).ok);
  assert.ok(chat(s, 'p1', 'b', E(t + 200)).ok);
  assert.equal(chat(s, 'p1', 'c', E(t + 300)).code, 'dr_chat_fast');
  assert.ok(chat(s, 'p1', 'c', E(t + 1100)).ok);
  // 10초에 15개: 1초마다 3개씩 보내면 5초 만에 15개
  let n = 0;
  const q = room(2);
  for (let sec = 0; sec < 5; sec++) for (let k = 0; k < 3; k++) { assert.ok(chat(q.s, 'p1', `m${n++}`, q.E(t + sec * 1000 + k)).ok); }
  assert.equal(chat(q.s, 'p1', 'x', q.E(t + 5 * 1000)).code, 'dr_chat_fast');
  assert.ok(chat(q.s, 'p1', 'x', q.E(t + 10 * 1000 + 3)).ok);
});

// ---------- 보기·시계 ----------

test('viewFor: 단계별 모양 (10-4)', () => {
  const { s, E } = room(3);
  let t = T0;
  let v = viewFor(s, 'p1');
  assert.equal(v.phase, 'lobby');
  assert.deepEqual([v.roundNo, v.q, v.qTotal, v.drawerId, v.endsAt, v.word, v.choices, v.mask, v.reveal, v.ranking], [0, 0, 0, null, null, null, null, null, null, null]);
  assert.equal(v.you, 'p1');
  assert.equal(v.hostId, 'p0');
  assert.equal(v.settings.allTopics.length, 11);
  ok(start(s, 'p0', E(t)));
  v = viewFor(s, 'p0');
  assert.equal(v.phase, 'pick');
  assert.equal(v.choices.length, 3);
  assert.deepEqual(Object.keys(v.choices[0]).sort(), ['topic', 'w']);
  assert.equal(v.endsAt, t + 10 * S);
  assert.equal(v.q, 1);
  assert.equal(viewFor(s, 'p1').choices, null);
  ok(pickWord(s, 'p0', 0, E(t)));
  v = viewFor(s, 'p0');
  assert.equal(v.word, answer(s));
  assert.equal(v.mask.replace(/ /g, '').length, answer(s).length);
  assert.equal(viewFor(s, 'p1').word, null);
  assert.equal(viewFor(s, 'p1').mask, v.mask);
  // 글자 수 표시 끄기
  const off = room(2, { len: false });
  ok(start(off.s, 'p0', off.E(t)));
  pickWord(off.s, 'p0', 0, off.E(t));
  assert.equal(viewFor(off.s, 'p1').mask, null);
});

test('viewFor: 맞힌 사람은 단어가 보이고 hit 표시, 공개 단계에서는 모두 단어. canUndo/canRedo 는 그리는 사람만', () => {
  const { s, E } = room(4);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  const fx = setCanvasFlags(s, { canUndo: true, canRedo: false });
  assert.deepEqual(fx.room, ['p0']);
  assert.deepEqual(setCanvasFlags(s, { canUndo: true, canRedo: false }).room, []);
  assert.equal(viewFor(s, 'p0').canUndo, true);
  assert.equal(viewFor(s, 'p1').canUndo, false);
  ok(chat(s, 'p1', answer(s), E(t + S)));
  assert.equal(viewFor(s, 'p1').word, answer(s));
  assert.equal(viewFor(s, 'p2').word, null);
  assert.equal(viewFor(s, 'p2').players.find((p) => p.id === 'p1').hit, true);
  assert.equal(canDraw(s, 'p0'), true);
  assert.equal(canDraw(s, 'p1'), false);
  give(s, 'p0', E(t + 2 * S));
  for (const id of ['p0', 'p1', 'p2', 'p3']) {
    const v = viewFor(s, id);
    assert.equal(v.word, v.reveal.word);
    assert.equal(v.players.every((p) => p.hit === false), true);
    assert.equal(v.mask, null);
    assert.equal(v.choices, null);
  }
  assert.equal(canDraw(s, 'p0'), false);
});

test('nextDeadline / tick: 단계마다 정확한 시각, 아무것도 없으면 null', () => {
  const { s, E } = room(2);
  assert.equal(nextDeadline(s), null);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  assert.equal(nextDeadline(s), t + 10 * S);
  assert.equal(tick(s, t + 9999, E(t + 9999)).room.length, 0);
  ok(pickWord(s, 'p0', 0, E(t)));
  assert.equal(nextDeadline(s), t + 20 * S); // 무입력 20초가 먼저
  noteInk(s, 'p0');
  assert.equal(nextDeadline(s), t + 140 * S);
  tick(s, t + 140 * S, E(t + 140 * S));
  assert.equal(s.phase, 'reveal');
  assert.equal(nextDeadline(s), t + 145 * S);
  assert.equal(s.reveal.nextId, 'p1');
});

test('tick 이 한참 늦어도 한 걸음씩 따라잡는다 (공개 → 다음 고르기)', () => {
  const { s, E } = room(3);
  let t = T0;
  ok(start(s, 'p0', E(t)));
  toDraw(s, E, t);
  ok(give(s, 'p0', E(t + S)));
  const fx = tick(s, t + 500 * S, E(t + 500 * S));
  assert.equal(s.phase, 'pick');
  assert.equal(drawer(s), 'p1');
  assert.equal(s.endsAt, t + 510 * S);
  assert.ok(fx.events.some((e) => e.e.k === 'drNew'));
  assert.equal(fx.room.length, 3);
});

test('오류 글: GAME_NAME 으로 만든다', () => {
  assert.equal(errorMsg('dr_off'), '갱식마인드는 아직 열리지 않았습니다.');
  assert.equal(ERRORS.dr_kicked, '방장이 내보냈습니다.');
  assert.equal(errorMsg('없는코드'), ERRORS.dr_bad);
});

test('drNew 는 새 문제마다 방 전원에게, 한 번 고른 단어는 use 로 알린다', () => {
  const { s, E } = room(3);
  const fx = ok(start(s, 'p0', E(T0)));
  assert.deepEqual(fx.events.filter((e) => e.e.k === 'drNew').map((e) => e.to.sort()), [['p0', 'p1', 'p2']]);
  assert.deepEqual(fx.use, []);
  assert.deepEqual(pickWord(s, 'p0', 1, E(T0)).use, [s.cur.cands[1].w]);
});
