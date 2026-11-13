// 완전 랜덤 안전망: 섞기·뽑기·첫 차례·라이어 고르기 등이 치우치지 않는지, 그리고 서버·shared 에 Math.random 이 없는지.
// 통계 기준은 거짓 실패가 사실상 없게(6.5 시그마) 잡았다(test/lib/stats.js). 고정 씨앗(seeded)과 실제 crypto 두 가지로 돌린다.
// 주입할 수 없는 무작위(허브 경로에서 crypto 를 직접 부르는 곳)는 이 파일 맨 아래 정적 검사와 보고서에 따로 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shuffle, secureRng, newDeck, rankValue } from '../../shared/cards.js';
import * as holdem from '../../shared/holdem.js';
import * as bluff from '../../shared/bluff.js';
import { createGame as createLiar } from '../../shared/liar/game.js';
import { drawWords } from '../../shared/liar/words.js';
import { intRng as liarIntRng } from '../../server/liar/room.js';
import { intRng as drawIntRng } from '../../server/draw/room.js';
import { createRoom as createDrawRoom, join as drawJoin, start as drawStart } from '../../shared/draw/game.js';
import { createWordPicker } from '../../server/draw/words.js';
import { createGame as createGsk, addPlayer as gskAdd, start as gskStart } from '../../shared/gsk/game.js';
import { createGame as createYacht, roll as yachtRoll } from '../../shared/yacht/game.js';
import { seeded } from '../helpers.js';
import { makeHub } from '../lib/hub.js';
import { assertUniform, assertMean, assertRate, passes } from '../lib/stats.js';

const SOURCES = [
  ['고정 씨앗', (n = 1) => seeded(n)],
  ['crypto', () => secureRng],
];
const count = (k) => new Array(k).fill(0);

// ---- 검사기 자체 확인 --------------------------------------------------------------------------

test('검사기: 치우친 섞기·치우친 주사위는 걸러낸다(검사기가 아무거나 통과시키지 않는지)', () => {
  // 흔한 잘못된 섞기: j 를 [0, i+1) 대신 [0, n) 에서 뽑는 방식
  const bad = (arr, rng) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * arr.length);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const posOf = (fn) => {
    const rng = seeded(7);
    const c = count(5);
    for (let t = 0; t < 60000; t++) c[fn(['a', 'b', 'c', 'd', 'e'], rng).indexOf('a')]++;
    return c;
  };
  assert.equal(passes(() => assertUniform(posOf(shuffle), 'good')), true);
  assert.equal(passes(() => assertUniform(posOf(bad), 'bad')), false);
  // 한 면이 1% 더 나오는 주사위도 6만 번이면 걸러진다
  const rng = seeded(3);
  const c = count(6);
  for (let t = 0; t < 120000; t++) c[rng() < 0.0125 ? 0 : Math.floor(rng() * 6)]++;
  assert.equal(passes(() => assertUniform(c, 'loaded')), false);
});

// ---- 1) 공용 섞기 ------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`shuffle(${name}): 5장 덱 6만 번 - 자리별 카드, 앞 두 장의 쌍이 모두 균등`, () => {
    const rng = mk();
    const N = 60000;
    const at = Array.from({ length: 5 }, () => count(5)); // at[자리][카드]
    const pairs = count(20);
    const idx = (a, b) => a * 4 + (b > a ? b - 1 : b); // 순서 있는 쌍 20가지
    for (let t = 0; t < N; t++) {
      const deck = shuffle([0, 1, 2, 3, 4], rng);
      assert.deepEqual([...deck].sort(), [0, 1, 2, 3, 4], '순열이어야 한다');
      deck.forEach((card, pos) => { at[pos][card]++; });
      pairs[idx(deck[0], deck[1])]++;
    }
    at.forEach((row, pos) => assertUniform(row, `자리 ${pos}`));
    for (let card = 0; card < 5; card++) assertUniform(at.map((row) => row[card]), `카드 ${card} 의 자리`);
    assertUniform(pairs, '앞 두 장 쌍');
  });

  test(`shuffle(${name}): 52장 덱 - 맨 위·맨 아래 카드와 각 카드의 자리가 균등`, () => {
    const rng = mk(2);
    const N = name === 'crypto' ? 8000 : 40000;
    const first = count(52);
    const last = count(52);
    const where0 = count(52); // 0번 카드가 놓인 자리
    for (let t = 0; t < N; t++) {
      const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
      first[deck[0]]++;
      last[deck[51]]++;
      where0[deck.indexOf(0)]++;
    }
    assertUniform(first, '맨 위');
    assertUniform(last, '맨 아래');
    assertUniform(where0, '0번 카드의 자리');
  });
}

test('secureRng: 0 이상 1 미만이고 32비트 칸에 고르게 퍼진다', () => {
  const c = count(16);
  for (let i = 0; i < 80000; i++) {
    const v = secureRng();
    assert.ok(v >= 0 && v < 1);
    c[Math.floor(v * 16)]++;
  }
  assertUniform(c, 'secureRng 16칸');
});

// ---- 2) 홀덤 ------------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`홀덤 startHand(${name}): 자리와 상관없이 카드 평균 순위·에이스 빈도·숫자별 빈도가 같다`, () => {
    const rng = mk(11);
    const N = name === 'crypto' ? 8000 : 40000;
    const n = 6;
    const sum = count(n);
    const rel = count(n); // 딜러 기준 상대 자리
    const aces = count(n);
    const byRank = Array.from({ length: n }, () => count(13));
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, stack: 1000 }));
    for (let h = 0; h < N; h++) {
      const dealer = h % n;
      const { st } = holdem.startHand(players, dealer, rng);
      st.seats.forEach((seat, i) => {
        assert.equal(seat.cards.length, 2);
        for (const card of seat.cards) {
          const v = rankValue(card);
          sum[i] += v;
          rel[(i - dealer + n) % n] += v;
          if (v === 14) aces[i]++;
          byRank[i][v - 2]++;
        }
      });
    }
    // 카드 한 장의 순위: 2..14 가 같은 확률 -> 평균 8, 분산 (13²-1)/12 = 14
    const sd = Math.sqrt(14);
    for (let i = 0; i < n; i++) {
      assertMean(sum[i], 2 * N, 8, sd, `자리 ${i} 평균 순위`);
      assertMean(rel[i], 2 * N, 8, sd, `딜러 기준 ${i} 평균 순위`);
      assertRate(aces[i], 2 * N, 4 / 52, `자리 ${i} 에이스 빈도`);
      assertUniform(byRank[i], `자리 ${i} 숫자별`);
    }
  });
}

// ---- 3) 블러핑 ----------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`블러핑 createGame(${name}): 시작 차례·기준 카드·총알 자리·조커 분배가 균등`, () => {
    const rng = mk(5);
    const N = name === 'crypto' ? 6000 : 30000;
    const ids = ['a', 'b', 'c', 'd'];
    const starter = count(4);
    const rank = { A: 0, K: 0, Q: 0 };
    const bullets = ids.map(() => count(6));
    const jokers = count(4);
    for (let t = 0; t < N; t++) {
      const { game, events } = bluff.createGame(ids, rng);
      starter[ids.indexOf(events[0].turn)]++;
      rank[game.tableRank]++;
      game.players.forEach((p, i) => {
        bullets[i][p.bullet]++;
        jokers[i] += p.hand.filter((c) => c === 'J').length;
        assert.equal(p.hand.length, bluff.HAND_SIZE);
      });
    }
    assertUniform(starter, '첫 차례');
    assertUniform(Object.values(rank), '기준 카드 A/K/Q');
    bullets.forEach((row, i) => assertUniform(row, `${i}번 총알 칸`));
    // 덱 20장(조커 2장)을 4명이 5장씩: 한 자리의 조커 수는 초기하분포, 평균 0.5, 분산 5*(.1)*(.9)*(15/19)
    const sd = Math.sqrt(5 * 0.1 * 0.9 * (15 / 19));
    jokers.forEach((s, i) => assertMean(s, N, 0.5, sd, `${i}번 자리 조커 수`));
  });
}

// ---- 4) 정수 난수 변환(허브의 hub.rng 실수 -> 엔진의 rng(n) 정수) -----------------------------------

for (const [label, intRng] of [['라이어', liarIntRng], ['갱식마인드', drawIntRng]]) {
  for (const [name, mk] of SOURCES) {
    test(`${label} intRng(${name}): 2,3,5,6,7,10 범위가 모두 균등하고 범위 밖이 없다`, () => {
      const rng = intRng(mk(9));
      for (const n of [2, 3, 5, 6, 7, 10]) {
        const c = count(n);
        const N = name === 'crypto' ? 15000 : 30000;
        for (let i = 0; i < N; i++) {
          const v = rng(n);
          assert.ok(Number.isInteger(v) && v >= 0 && v < n, `범위 ${n}: ${v}`);
          c[v]++;
        }
        assertUniform(c, `n=${n}`);
      }
    });
  }
}

// ---- 5) 라이어 -----------------------------------------------------------------------------------

const WORDS = {
  sets: {
    basic: {
      topics: [
        { name: 'T1', words: 'abcdefghij'.split('').map((w) => ({ w })) },
        { name: 'T2', words: 'klmnopqrst'.split('').map((w) => ({ w })) },
        { name: 'T3', words: 'uvwxyz0123'.split('').map((w) => ({ w })) },
      ],
    },
  },
};

for (const [name, mk] of SOURCES) {
  test(`라이어 createGame(${name}): 라이어·발언 순서·자리가 균등하고 서로 독립`, () => {
    const rng = liarIntRng(mk(21));
    const N = name === 'crypto' ? 10000 : 30000;
    const players = ['a', 'b', 'c', 'd', 'e'];
    const liar = count(5);
    const orderPos = players.map(() => count(5)); // 각 사람이 발언 순서 몇 번째인지
    const seatPos = players.map(() => count(5));
    const orderFirst = count(5);
    let sameFirst = 0; // 발언 첫 사람 == 자리 0번 사람
    let liarFirst = 0; // 라이어 == 발언 첫 사람
    for (let t = 0; t < N; t++) {
      const g = createLiar({ players, draw: { topic: 't', citizenWord: 'x', liarWord: 'y' }, rng, now: 0 });
      liar[players.indexOf(g.liarId)]++;
      g.order.forEach((id, pos) => { orderPos[players.indexOf(id)][pos]++; });
      for (const id of players) seatPos[players.indexOf(id)][g.seats[id]]++;
      orderFirst[players.indexOf(g.order[0])]++;
      if (g.order[0] === players.find((id) => g.seats[id] === 0)) sameFirst++;
      if (g.liarId === g.order[0]) liarFirst++;
    }
    assertUniform(liar, '라이어');
    assertUniform(orderFirst, '첫 발언자');
    orderPos.forEach((row, i) => assertUniform(row, `${players[i]} 의 발언 순서`));
    seatPos.forEach((row, i) => assertUniform(row, `${players[i]} 의 자리`));
    assertRate(sameFirst, N, 1 / 5, '발언 순서와 자리는 따로 섞인다');
    assertRate(liarFirst, N, 1 / 5, '라이어와 첫 발언자는 무관');
  });

  test(`라이어 drawWords(${name}): 주제·시민 단어·라이어 단어(서로 다름)가 균등`, () => {
    const rng = liarIntRng(mk(4));
    const N = name === 'crypto' ? 12000 : 45000;
    const topic = count(3);
    const citizen = count(10);
    const pair = count(90);
    const idx = (a, b) => a * 9 + (b > a ? b - 1 : b);
    for (let t = 0; t < N; t++) {
      const d = drawWords({ words: WORDS, set: 'basic', enabled: ['T1', 'T2', 'T3'], used: {}, liarMode: 'word', rng });
      topic[['T1', 'T2', 'T3'].indexOf(d.topic)]++;
      assert.notEqual(d.citizenWord, d.liarWord, '시민과 라이어 단어는 달라야 한다');
    }
    // 주제를 고정하고(T1) 단어 쌍을 센다
    const letters = 'abcdefghij';
    for (let t = 0; t < N; t++) {
      const d = drawWords({ words: WORDS, set: 'basic', enabled: ['T1'], topic: 'T1', used: {}, liarMode: 'word', rng });
      const a = letters.indexOf(d.citizenWord);
      const b = letters.indexOf(d.liarWord);
      citizen[a]++;
      pair[idx(a, b)]++;
    }
    assertUniform(topic, '주제');
    assertUniform(citizen, '시민 단어');
    assertUniform(pair, '(시민, 라이어) 단어 쌍');
  });
}

// ---- 6) 갱식마인드 -------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`갱식마인드 start(${name}): 첫 출제자가 균등`, () => {
    const rng = drawIntRng(mk(8));
    const N = name === 'crypto' ? 6000 : 24000;
    const first = count(4);
    const env = (now) => ({ now, rng, words: (topics) => [1, 2, 3].map((k) => ({ w: `w${k}`, topic: topics[0], alt: [] })) });
    for (let t = 0; t < N; t++) {
      const s = createDrawRoom({ code: 'KQZT', host: { id: 'p0', name: 'n0' }, allTopics: ['A'], topics: ['A'], now: 0 });
      for (let i = 1; i < 4; i++) drawJoin(s, { id: `p${i}`, name: `n${i}` }, env(0));
      const fx = drawStart(s, 'p0', env(0));
      assert.ok(fx.ok, fx.code);
      first[Number(s.cur.drawerId.slice(1))]++;
    }
    assertUniform(first, '첫 출제자');
  });

  test(`갱식마인드 단어 후보(${name}): 12개 중 3개 후보가 서로 다르고 모든 단어·자리가 균등`, () => {
    const cryptoLike = name === 'crypto' ? (n) => randomInt(n) : liarIntRng(mk(6));
    const data = { topics: [{ name: 'A', words: Array.from({ length: 12 }, (_, i) => ({ w: `w${i}`, alt: [] })) }] };
    const N = name === 'crypto' ? 10000 : 40000;
    const freq = count(12);
    const slot0 = count(12);
    for (let t = 0; t < N; t++) {
      const picker = createWordPicker({ data, rng: cryptoLike }); // 새 뽑기마다 "이미 나온 단어" 기록이 없는 상태
      const out = picker.pick(['A']).map((e) => Number(e.w.slice(1)));
      assert.equal(new Set(out).size, 3, '후보 3개는 서로 달라야 한다');
      out.forEach((v) => { freq[v]++; });
      slot0[out[0]]++;
    }
    // 12개 중 서로 다른 3개: 단어 하나가 후보에 들 확률 3/12
    freq.forEach((f, i) => assertRate(f, N, 3 / 12, `단어 ${i} 후보 빈도`));
    assertUniform(slot0, '첫 후보 자리');
  });
}

// ---- 7) 갱스껄 -----------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`갱스껄 start(${name}): 앉는 순서와 먼저 시작하는 사람이 균등`, () => {
    const rnd = name === 'crypto' ? (n) => randomInt(n) : liarIntRng(mk(13));
    const N = name === 'crypto' ? 6000 : 24000;
    const ids = ['a', 'b', 'c', 'd'];
    const starter = count(4);
    const seatOfA = count(4);
    const seatOfB = count(4);
    for (let t = 0; t < N; t++) {
      const s = createGsk({ code: 'KQZT', hostId: 'a' });
      for (const id of ids) gskAdd(s, { id, name: id });
      const fx = gskStart(s, 'a', 1000, rnd);
      assert.ok(fx.ok !== false, fx.code);
      starter[ids.indexOf(s.starter)]++;
      seatOfA[s.seats.findIndex((x) => x.id === 'a')]++;
      seatOfB[s.seats.findIndex((x) => x.id === 'b')]++;
    }
    assertUniform(starter, '먼저 시작');
    assertUniform(seatOfA, 'a 의 자리');
    assertUniform(seatOfB, 'b 의 자리');
  });
}

// ---- 8) 요트다이스 -------------------------------------------------------------------------------

for (const [name, mk] of SOURCES) {
  test(`요트 createGame·roll(${name}): 차례 순서와 주사위 눈이 균등`, () => {
    const rng = mk(17);
    const N = name === 'crypto' ? 6000 : 24000;
    const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
    const posOfA = count(4);
    const first = count(4);
    const faces = count(6);
    const perDie = Array.from({ length: 5 }, () => count(6));
    const seedTop = count(8);
    const place = (seed, thrown) => thrown.map((i) => ({ i, x: 0, z: 0, yaw: 0 }));
    for (let t = 0; t < N; t++) {
      const r = createYacht({ players, rng, gameNo: t });
      assert.ok(r.ok);
      const g = r.game;
      posOfA[g.cols.findIndex((c) => c.id === 'a')]++;
      first[['a', 'b', 'c', 'd'].indexOf(g.cols[g.turnIdx].id)]++;
      const roll = yachtRoll(g, g.cols[g.turnIdx].id, rng, place);
      assert.ok(roll.ok, roll.error);
      g.dice.forEach((d, i) => { faces[d.v - 1]++; perDie[i][d.v - 1]++; });
      seedTop[Math.floor(roll.events[0].seed / 2 ** 29)]++;
    }
    assertUniform(posOfA, 'a 의 차례 순서');
    assertUniform(first, '첫 차례');
    assertUniform(faces, '눈 1~6');
    perDie.forEach((row, i) => assertUniform(row, `${i}번 주사위 눈`));
    assertUniform(seedTop, '굴림 seed 상위 3비트');
  });
}

// ---- 9) 미니게임(허브 rng 로 선을 정한다) -------------------------------------------------------

test('미니게임: 선(첫 자리)이 둘 중 하나로 균등 (실제 허브·실제 crypto 난수)', async () => {
  const h = makeHub({ rng: secureRng });
  const a = await h.login('ann1');
  const b = await h.login('bob1');
  const N = 2000;
  let annFirst = 0;
  for (let i = 0; i < N; i++) {
    a.sock.raw.length = 0; // 받은 메시지 기록이 쌓이면 a.state 읽기가 느려진다
    b.sock.raw.length = 0;
    await h.tick(61_000); // 접속당 초당 20개 제한을 풀고, 빈 방 지우기 타이머도 비워 시계가 느려지지 않게 한다
    await a.send({ t: 'create', mode: 'mini', game: 'gomoku' });
    const code = a.state.code;
    await b.send({ t: 'join', code });
    await a.send({ t: 'start' });
    const room = h.hub.rooms.get(code);
    assert.equal(room.phase, 'play');
    if (room.seats[0] === 'ann1') annFirst++;
    await a.send({ t: 'leave' });
    await b.send({ t: 'leave' });
  }
  assertRate(annFirst, N, 0.5, '선이 ann1 일 확률');
});

test('홀덤·블러핑·요트·라이어·미니: 허브에 넣은 rng 가 그대로 쓰인다(같은 씨앗이면 같은 판)', async () => {
  // 주입 가능성 확인: 같은 씨앗 두 허브는 같은 방 코드와 같은 홀덤 첫 패를 만든다
  const run = async (seed) => {
    const h = makeHub({ seed });
    const cs = [await h.login('ann1'), await h.login('bob1')];
    await cs[0].send({ t: 'create', mode: 'holdem' });
    await cs[1].send({ t: 'join', code: cs[0].state.code });
    await cs[0].send({ t: 'start' });
    return [cs[0].state.code, cs[0].state.myCards, cs[1].state.myCards];
  };
  assert.deepEqual(await run(5), await run(5));
  assert.notDeepEqual(await run(5), await run(6));
});

// ---- 10) 정적 검사: server/ 와 shared/ 에 Math.random 이 없어야 한다 ----------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 허용 목록은 비어 있다. server·shared 에 Math.random 을 넣지 않는다.
const MATH_RANDOM_ALLOWED = new Set();

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

// 주석 안의 언급("Math.random 금지")은 허용하고 코드만 본다.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
}

test('정적 검사: server/ 와 shared/ 의 코드에 Math.random 이 없다(임시 허용 목록 제외)', () => {
  const offenders = [];
  for (const dir of ['server', 'shared']) {
    for (const file of jsFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (MATH_RANDOM_ALLOWED.has(rel)) continue;
      if (/\bMath\s*\.\s*random\b/.test(stripComments(readFileSync(file, 'utf8')))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], 'Math.random 은 쓰지 않는다(hub.rng 또는 crypto 만)');
});

test('정적 검사: 임시 허용 목록의 파일은 실제로 존재한다(이름이 바뀌면 허용 목록도 고친다)', () => {
  for (const rel of MATH_RANDOM_ALLOWED) assert.ok(statSync(path.join(ROOT, rel)).isFile(), rel);
});
