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
    for (const x of c) { assert.ok(on.includes(x.topic)); assert.ok(Array.isArray(x.alt)); }
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
