// 정답이 새지 않는다 (GDD 9절, 12절 시나리오 2). 모든 단계·모든 사람 시점에서
// 못 맞힌 사람·관전자에게 가는 viewFor 결과, 보낼 event, 채팅 기록에 정답 단어(다른 이름 포함)가 없어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, join, back, away, leave, setSettings, start, toLobby, pickWord, give, skip,
  chat, chatLogFor, tick, viewFor, noteInk,
} from '../../shared/draw/game.js';

const S = 1000;
const T0 = 5_000_000;
const TOPICS = ['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '탈것', '영화·만화', '나라·도시', '인물'];

// 겹치지 않는 낱말: 부분 문자열로 찾아도 오탐이 없다
function makeWords() {
  let k = 0;
  return (topics) => {
    k++;
    return ['a', 'b', 'c'].map((x) => ({ w: `짜장${k}${x}면`, topic: topics[0], alt: [`자장${k}${x}면`, `ZZQ${k}${x}`] }));
  };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const namesOf = (cur) => (cur ? cur.cands.flatMap((c) => [c.w, ...c.alt]) : []);
const has = (obj, names) => { const j = JSON.stringify(obj); return names.find((n) => j.includes(n)) ?? null; };

// 한 번 부른 뒤의 검사. fx 는 방금 부른 함수의 반환값
function audit(s, fx, label, stats) {
  const secretPhase = s.phase === 'pick' || s.phase === 'draw';
  const names = namesOf(s.cur);
  const cur = s.cur;
  const knows = (id) => !!cur && (cur.drawerId === id || cur.hits.some((h) => h.id === id));

  // 1) 방 상태: 모든 사람 시점 + 방에 없는 관전자
  for (const id of [...s.players.map((p) => p.id), 'ghost']) {
    const v = viewFor(s, id);
    if (secretPhase && names.length) {
      const know = knows(id) && id !== 'ghost';
      if (!know) {
        assert.equal(has(v, names), null, `${label}: ${s.phase} ${id} 의 viewFor 에 정답 ${has(v, names)}`);
        assert.equal(v.word, null, `${label}: word`);
        assert.equal(v.choices, null, `${label}: choices`);
      } else if (cur.drawerId === id) {
        if (s.phase === 'pick') assert.equal(v.choices.length, 3);
        else assert.equal(v.word, cur.entry.w);
      } else {
        assert.equal(v.word, cur.entry.w);
      }
      if (s.phase === 'pick') assert.equal(v.mask, null, `${label}: pick 에 mask`);
      if (v.choices) assert.equal(cur.drawerId, id, `${label}: choices 가 그리는 사람이 아닌 사람에게`);
      assert.ok(v.choices === null || v.choices.every((c) => Object.keys(c).sort().join() === 'topic,w'), `${label}: choices 에 alt`);
      stats.views++;
    }
    if (s.phase === 'lobby' || s.phase === 'final') {
      assert.equal(v.word, null);
      assert.equal(v.choices, null);
    }
  }

  // 2) 보낼 event
  for (const ev of fx.events) {
    if (ev.e.sec) {
      stats.sec++;
      for (const id of ev.to) {
        const p = s.players.find((x) => x.id === id);
        assert.ok(p, `${label}: sec 를 방에 없는 사람에게`);
        assert.ok(cur && (cur.drawerId === id || cur.hits.some((h) => h.id === id)), `${label}: sec 채팅이 못 맞힌 사람 ${id} 에게`);
      }
    }
    if (secretPhase && names.length) {
      for (const id of ev.to) {
        if (knows(id)) continue;
        assert.equal(has(ev, names), null, `${label}: ${id} 에게 가는 ${ev.e.k} 에 정답`);
      }
    }
  }
  // 정답 글은 chat event 로 나가지 않는다: drHit 에는 글이 없다
  for (const ev of fx.events) if (ev.e.k === 'drHit') assert.deepEqual(Object.keys(ev.e).sort(), ['id', 'k', 'order']);

  // 3) 채팅 기록
  if (secretPhase && names.length) {
    for (const id of [...s.players.map((p) => p.id), 'ghost']) {
      const log = chatLogFor(s, id);
      if (!knows(id) || id === 'ghost') {
        const cutoff = log.filter((it) => it.sec);
        const secNow = s.chatLog.filter((it) => it.sec && it.q === s.q);
        for (const it of secNow) assert.ok(!log.some((x) => x.text === it.text && x.ts === it.ts && x.id === it.id), `${label}: ${id} 의 chatLog 에 이번 문제 sec`);
        assert.equal(cutoff.filter((it) => has(it, names)).length, 0);
      }
    }
  }
}

function runFuzz(seed, stats) {
  const rnd = mulberry32(seed);
  const R = (n) => Math.floor(rnd() * n);
  const words = makeWords();
  let now = T0;
  const E = () => ({ now, rng: (n) => R(n), words });
  const s = createRoom({ code: 'AAAA', host: { id: 'u0', name: 'n0' }, allTopics: TOPICS, topics: TOPICS.slice(0, 8), now });
  const pool = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
  for (const id of pool.slice(1, 4)) join(s, { id, name: `n${id}` }, E());
  const fillers = ['ㅋㅋㅋ', '모르겠다', '혹시 고양이?', '#크게', '**별', '뭐지', '사자', '와 잘 그린다'];

  for (let step = 0; step < 450; step++) {
    const label = `seed ${seed} step ${step}`;
    const who = s.players.length ? s.players[R(s.players.length)].id : 'u0';
    const p = s.players.find((x) => x.id === who);
    const cur = s.cur;
    const knower = !!cur && (cur.drawerId === who || cur.hits.some((h) => h.id === who));
    const pickAct = R(100);
    let fx;
    if (s.phase === 'lobby' || s.phase === 'final') {
      if (pickAct < 55) fx = start(s, s.hostId, E());
      else if (pickAct < 62 && s.phase === 'final') fx = toLobby(s, s.hostId, E());
      else if (pickAct < 75) fx = join(s, { id: pool[R(pool.length)], name: 'x' }, E());
      else if (pickAct < 85) fx = setSettings(s, s.hostId, { rounds: [1, 2, 3, 5][R(4)], order: ['seq', 'hit', 'rand'][R(3)], time: [60, 90, 140][R(3)] }, E());
      else fx = chat(s, who, fillers[R(fillers.length)], E());
    } else if (pickAct < 30) { // 채팅: 정답 시도, 다른 이름, 크기 표시, 일반 글, (아는 사람만) 힌트
      const t = R(6);
      const entry = cur && cur.entry;
      let text;
      if (t === 0 && entry) text = entry.w;
      else if (t === 1 && entry) text = entry.alt[R(2)];
      else if (t === 2 && entry) text = `# ${entry.w}`;
      else if (t === 3 && knower && entry) text = `힌트 ${entry.w} 맞아`;
      else text = fillers[R(fillers.length)];
      now += R(1500);
      fx = chat(s, who, text, E());
    } else if (pickAct < 40) {
      fx = pickWord(s, cur ? cur.drawerId : who, R(3), E());
    } else if (pickAct < 44) fx = give(s, cur ? cur.drawerId : who, E());
    else if (pickAct < 47) fx = skip(s, s.hostId, E());
    else if (pickAct < 52) { if (cur) noteInk(s, cur.drawerId); fx = { events: [], room: [] }; }
    else if (pickAct < 58) fx = p ? away(s, who, E()) : { events: [], room: [] };
    else if (pickAct < 66) fx = p ? back(s, who, E()) : join(s, { id: pool[R(pool.length)], name: 'y' }, E());
    else if (pickAct < 68) fx = s.players.length > 2 ? leave(s, who, E()) : { events: [], room: [] };
    else { now += 500 + R(30000); fx = tick(s, now, E()); }
    if (!fx.events) fx = { events: [], room: [] };
    // 모든 방 안 사람이 사라지면 새로 채운다
    if (s.players.length < 2) { for (const id of pool.slice(0, 3)) join(s, { id, name: `n${id}` }, E()); }
    audit(s, fx, label, stats);
    if (s.phase === 'draw') stats.draw++;
    if (s.cur && s.cur.hits.length) stats.hit++;
    if (s.phase === 'reveal') stats.reveal++;
    if (s.phase === 'final') stats.final++;
    // 방 안의 일관성
    assert.ok(s.players.length <= 8);
    assert.ok(s.players.some((x) => x.id === s.hostId) || s.players.length === 0, `${label}: 방장이 방에 없다`);
  }
}

test('무작위 진행 중 모든 단계·모든 시점에서 정답이 새지 않는다 (viewFor·event·chatLog)', () => {
  const stats = { views: 0, sec: 0, draw: 0, hit: 0, reveal: 0, final: 0 };
  for (let seed = 1; seed <= 30; seed++) runFuzz(seed, stats);
  // 시험이 실제로 민감한 단계를 지나갔는지
  assert.ok(stats.views > 500, `views ${stats.views}`);
  assert.ok(stats.sec > 10, `sec ${stats.sec}`);
  assert.ok(stats.draw > 200, `draw ${stats.draw}`);
  assert.ok(stats.hit > 50, `hit ${stats.hit}`);
  assert.ok(stats.reveal > 50, `reveal ${stats.reveal}`);
  assert.ok(stats.final > 0, `final ${stats.final}`);
});

test('정해진 시나리오: 못 맞힌 사람·관전자의 기기가 받은 모든 것에 단어가 없다', () => {
  const words = makeWords();
  const s = createRoom({ code: 'BBBB', host: { id: 'a', name: 'A' }, allTopics: TOPICS, topics: TOPICS.slice(0, 8), now: T0 });
  let now = T0;
  const E = () => ({ now, rng: () => 0, words });
  for (const id of ['b', 'c', 'd']) join(s, { id, name: id }, E());
  const inbox = { a: [], b: [], c: [], d: [], ghost: [] }; // 각자 기기가 받은 것
  const deliver = (fx) => {
    for (const id of fx.room) inbox[id].push(viewFor(s, id));
    for (const ev of fx.events) for (const id of ev.to) inbox[id].push(ev.e);
  };
  deliver(start(s, 'a', E()));
  const names = namesOf(s.cur);
  deliver(pickWord(s, 'a', 1, E()));
  inbox.ghost.push(viewFor(s, 'ghost'), chatLogFor(s, 'ghost'));
  const entry = s.cur.entry;
  deliver(chat(s, 'c', '오답 하나', E()));
  deliver(chat(s, 'b', entry.w, E()));                 // b 가 맞힘
  deliver(chat(s, 'b', `답은 ${entry.w} 야`, E()));      // 정답자끼리
  deliver(chat(s, 'b', `${entry.alt[0]} 라고도 해`, E()));
  inbox.c.push(chatLogFor(s, 'c'));
  inbox.d.push(chatLogFor(s, 'd'));
  assert.equal(JSON.stringify(inbox.a).includes(entry.w), true, '그리는 사람은 단어를 본다');
  assert.equal(JSON.stringify(inbox.b).includes(entry.w), true, '맞힌 사람은 단어를 본다');
  for (const id of ['c', 'd', 'ghost']) {
    assert.equal(has(inbox[id], names), null, `${id} 의 기기에 정답: ${has(inbox[id], names)}`);
  }
  // 공개 단계에서는 모두에게
  deliver(give(s, 'a', E()));
  assert.equal(JSON.stringify(inbox.c).includes(entry.w), true);
});
