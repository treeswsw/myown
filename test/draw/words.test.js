import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWords, listTopics, defaultTopics, offTopics, createWordPicker } from '../../server/draw/words.js';

test('소스에 Math.random 이 없다 (crypto 난수만)', () => {
  for (const f of ['../../server/draw/words.js', '../../shared/draw/answer.js', '../../shared/draw/score.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!src.includes('Math.random'), f);
  }
});

test('주제 목록', () => {
  const d = loadWords();
  assert.equal(listTopics(d).length, 11);
  assert.deepEqual(defaultTopics(d), ['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '탈것']);
  assert.deepEqual(offTopics(d), ['영화·만화', '나라·도시', '인물']);
});

test('단어 3개: 서로 다르고 켜진 주제에서만, alt 제공', () => {
  const p = createWordPicker();
  const on = ['음식', '동물'];
  for (let i = 0; i < 200; i++) {
    const c = p.pick(on);
    assert.equal(c.length, 3);
    assert.equal(new Set(c.map((x) => x.w)).size, 3);
    for (const x of c) { assert.ok(Array.isArray(x.alt)); }
  }
  const e = p.entry('돈가스');
  assert.deepEqual(e.alt, ['돈까스']);
  assert.equal(e.topic, '음식');
  assert.equal(p.entry('없는단어없음'), null);
});

test('고른 단어는 다시 나오지 않고, 안 고른 것은 다시 나올 수 있다', () => {
  const p = createWordPicker();
  const topics = ['음식'];
  const chosen = new Set();
  for (let i = 0; i < 90; i++) { // 음식 100개 중 90개 사용: 아직 모자라지 않음
    const c = p.pick(topics);
    for (const x of c) assert.ok(!chosen.has(x.w), '고른 단어 재등장');
    chosen.add(c[0].w); p.use(c[0].w);
  }
  assert.equal(p.usedCount(), 90);
  // 고르지 않으면 기억되지 않아 같은 후보가 다시 나올 수 있다 (rng 고정)
  const q = createWordPicker({ rng: () => 0 });
  assert.deepEqual(q.pick(topics).map((x) => x.w), q.pick(topics).map((x) => x.w));
});

test('다 쓰면 켜진 주제 기록만 비우고 계속 뽑는다', () => {
  const d = loadWords();
  const p = createWordPicker();
  for (const t of d.topics) for (const e of t.words) p.use(e.w);
  assert.equal(p.pick(['음식']).length, 3);
  assert.ok(!p.isUsed(d.topics[0].words[0].w)); // 음식 기록은 비워짐
  assert.ok(p.isUsed(d.topics.find((t) => t.name === '동물').words[0].w)); // 다른 주제 기록은 남음
  p.reset();
  assert.equal(p.usedCount(), 0);
});

test('오류: 주제 없음', () => {
  const p = createWordPicker();
  assert.throws(() => p.pick([]));
  assert.throws(() => p.pick(['없는주제']));
});

test('난수가 고르게 퍼진다 (crypto)', () => {
  const p = createWordPicker();
  const seen = new Set();
  for (let i = 0; i < 300; i++) for (const x of p.pick(['음식'])) seen.add(x.w);
  assert.ok(seen.size > 60);
});

test('words.json 은 읽기만 한다', () => {
  const f = new URL('../../server/liar/words.json', import.meta.url);
  const before = readFileSync(f, 'utf8');
  createWordPicker().pick(['음식']);
  assert.equal(readFileSync(f, 'utf8'), before);
});

const gSet = (d) => new Set([...d.topics.flatMap((t) => t.words.filter((e) => e.g).map((e) => e.w)), ...d.drawOnly.map((e) => e.w)]);

test('갱식: words.json 에 표시 단어(117)와 전용 단어(78)가 있다', () => {
  const d = loadWords();
  assert.equal(d.topics.flatMap((t) => t.words).filter((e) => e.g).length, 117);
  assert.equal(d.drawOnly.length, 78);
  assert.equal(listTopics(d).length, 11);
});

test('갱식: 후보 3개 중 정확히 하나는 갱식 단어, 나머지 둘은 켜진 주제 (자리는 섞임)', () => {
  const d = loadWords();
  const g = gSet(d);
  const p = createWordPicker();
  const pos = new Set();
  for (let i = 0; i < 300; i++) {
    const c = p.pick(['음식', '동물']);
    assert.equal(c.length, 3);
    assert.equal(new Set(c.map((x) => x.w)).size, 3);
    const gi = c.map((x, k) => (g.has(x.w) ? k : -1)).filter((k) => k >= 0);
    // 켜진 주제(음식·동물)에도 갱식 표시 단어(컵라면 등)가 있어 둘 이상일 수 있으나, 적어도 하나는 갱식
    assert.ok(gi.length >= 1);
    pos.add(gi[0]);
  }
  assert.ok(pos.size >= 2);
});

test('갱식: 주제와 무관하게 하나가 갱식 (켜진 주제가 갱식 단어 없는 곳이어도)', () => {
  const data = { topics: [
    { name: '가', words: [{ w: 'a', alt: [] }, { w: 'b', alt: [] }, { w: 'c', alt: [] }] },
    { name: '나', words: [{ w: 'x', alt: [], g: 1 }] },
  ], drawOnly: [{ w: 'o', alt: ['오'] }] };
  const p = createWordPicker({ data });
  for (let i = 0; i < 100; i++) {
    const c = p.pick(['가']);
    assert.equal(c.filter((x) => x.w === 'x' || x.w === 'o').length, 1);
    assert.equal(c.filter((x) => ['a', 'b', 'c'].includes(x.w)).length, 2);
  }
  assert.deepEqual(p.entry('o'), { w: 'o', topic: '갱식', alt: ['오'] });
});

test('갱식: 고른 갱식 단어는 다시 안 나오고, 다 쓰면 기존 방식으로 대체', () => {
  const d = loadWords();
  const p = createWordPicker();
  const all = [...gSet(d)];
  for (const w of all.slice(0, all.length - 1)) p.use(w);
  const last = all[all.length - 1];
  assert.ok(p.pick(['음식']).some((x) => x.w === last));
  p.use(last);
  for (let i = 0; i < 50; i++) for (const x of p.pick(['음식'])) { assert.equal(x.topic, '음식'); }
});
