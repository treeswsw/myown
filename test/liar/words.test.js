import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTopics, drawWords, isCorrect, normalize } from '../../shared/liar/words.js';
import { buildAll, OUT } from '../../scripts/build-words.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'server', 'liar', 'words.json'), 'utf8'));

// 결정적 난수(시험용)
function lcg(seed) {
  let s = seed >>> 0;
  return (n) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); };
}

test('두 묶음이 읽힌다: mine 11주제, star 10주제, 주제마다 50개 이상', () => {
  assert.equal(listTopics(words, 'mine').length, 11);
  assert.equal(listTopics(words, 'star').length, 10);
  for (const set of ['mine', 'star']) {
    for (const t of words.sets[set].topics) assert.ok(t.words.length >= 50, `${set}/${t.name} ${t.words.length}개`);
  }
});

test('두 단어는 항상 다르고 같은 주제다 (여러 난수)', () => {
  for (const set of ['mine', 'star']) {
    const topics = listTopics(words, set);
    for (let seed = 1; seed <= 300; seed++) {
      const used = {};
      const r = drawWords({ words, set, enabled: topics, used, liarMode: 'word', rng: lcg(seed) });
      assert.notEqual(r.citizenWord, r.liarWord);
      const t = words.sets[set].topics.find((x) => x.name === r.topic);
      assert.ok(t.words.some((e) => e.w === r.citizenWord));
      assert.ok(t.words.some((e) => e.w === r.liarWord));
    }
  }
});

test('기본 난수는 crypto 이고 Math.random 을 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(here, '..', '..', 'shared', 'liar', 'words.js'), 'utf8');
  assert.ok(!/Math\.random/.test(src.replace(/\/\/.*$/gm, '')));
  const r = drawWords({ words, set: 'mine', enabled: listTopics(words, 'mine') });
  assert.notEqual(r.citizenWord, r.liarWord);
});

test('notice 방식은 liarWord 가 null', () => {
  const r = drawWords({ words, set: 'star', enabled: ['동물'], liarMode: 'notice', rng: lcg(3) });
  assert.equal(r.liarWord, null);
  assert.equal(r.topic, '동물');
  assert.ok(r.citizenWord);
});

test('used 에 있는 단어는 나오지 않고, 다 쓰면 그 주제 기록이 비워진다', () => {
  const topic = '동물';
  const all = words.sets.star.topics.find((t) => t.name === topic).words.map((e) => e.w);
  const keep = all.slice(0, all.length - 2); // 2개만 남긴다
  const used = { [`star:${topic}`]: keep.slice() };
  const r = drawWords({ words, set: 'star', enabled: [topic], used, rng: lcg(9) });
  assert.deepEqual([r.citizenWord, r.liarWord].sort(), all.slice(-2).sort());
  // 이제 전부 소진 → 다음 판은 기록을 비우고 다시 뽑는다
  assert.equal(used[`star:${topic}`].length, all.length);
  const r2 = drawWords({ words, set: 'star', enabled: [topic], used, rng: lcg(10) });
  assert.notEqual(r2.citizenWord, r2.liarWord);
  assert.equal(used[`star:${topic}`].length, 2);
  // 다른 주제·묶음 기록은 건드리지 않는다
  used['mine:동물'] = ['사자'];
  drawWords({ words, set: 'star', enabled: [topic], used, rng: lcg(11) });
  assert.deepEqual(used['mine:동물'], ['사자']);
});

test('여러 판 연속 뽑아도 소진 전에는 겹치지 않는다', () => {
  const used = {};
  const seen = new Set();
  const rng = lcg(5);
  for (let i = 0; i < 40; i++) {
    const r = drawWords({ words, set: 'mine', enabled: ['음식'], used, rng });
    for (const w of [r.citizenWord, r.liarWord]) { assert.ok(!seen.has(w), w); seen.add(w); }
  }
});

test('topic 을 주면 그 주제에서만 나온다 (enabled 무시)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = drawWords({ words, set: 'mine', enabled: ['음식', '동물'], topic: '직업', rng: lcg(seed) });
    assert.equal(r.topic, '직업');
  }
});

test('enabled 중에서만 주제가 골라진다', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = drawWords({ words, set: 'star', enabled: ['장소', '영화'], rng: lcg(seed) });
    assert.ok(['장소', '영화'].includes(r.topic));
  }
});

test('없는 묶음·주제, 빈 enabled 는 오류', () => {
  assert.throws(() => drawWords({ words, set: 'nope', enabled: ['음식'] }));
  assert.throws(() => listTopics(words, 'nope'));
  assert.throws(() => drawWords({ words, set: 'mine', topic: '없는주제' }));
  assert.throws(() => drawWords({ words, set: 'mine', enabled: ['없는주제'] }));
  assert.throws(() => drawWords({ words, set: 'mine', enabled: [] }));
  assert.throws(() => drawWords({ words, set: 'mine' }));
});

test('채점: 다른 이름, 띄어쓰기, 대소문자', () => {
  const mine = words.sets.mine.topics.find((t) => t.name === '음식');
  const dg = mine.words.find((e) => e.w === '돈가스');
  assert.deepEqual(dg.alt, ['돈까스']);
  assert.ok(isCorrect('돈가스', dg));
  assert.ok(isCorrect('돈까스', dg));
  assert.ok(isCorrect(' 돈 까 스 ', dg));
  assert.ok(!isCorrect('', dg));
  assert.ok(!isCorrect('짜장면', dg));
  const e = { w: 'PC방', alt: ['Internet Cafe'] };
  assert.ok(isCorrect('pc방', e));
  assert.ok(isCorrect('internetcafe', e));
  assert.ok(isCorrect('INTERNET  cafe', e));
  // NFD 입력도 같게 본다
  assert.ok(isCorrect('돈가스'.normalize('NFD'), dg));
  assert.equal(normalize(' A b '), 'ab');
});

test('words.json 이 두 md 파일과 같다', () => {
  const { json } = buildAll();
  const onDisk = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.deepEqual(onDisk, json, 'words.json 이 원본과 다릅니다. npm run words 를 다시 돌리세요');
});

test('md 파싱: 머리말 줄, (총 N개), 쉼표 여러 별칭', async () => {
  const { parseWordsMd } = await import('../../scripts/build-words.mjs');
  const t = parseWordsMd('# 제목\n- 머리말\n\n## 가\n하나(일, 원) · 둘\n특이·어려운: 셋\n유행·웃긴: 넷(4)\n(총 4개)\n');
  assert.deepEqual(t, [{ name: '가', words: [
    { w: '하나', alt: ['일', '원'] }, { w: '둘', alt: [] }, { w: '셋', alt: [] }, { w: '넷', alt: ['4'] },
  ] }]);
});

test('같은 주제 안의 중복도 경고한다 (같은 항목의 w·alt 는 제외)', () => {
  const md = { 'docs/WORDS.md': '## 가\n사자 · 호랑이(범) · 사자\n## 나\n범 · 곰(곰)\n', 'docs/WORDS-STAR.md': '## 다\n하나 · 둘\n' };
  const { warnings } = buildAll((p) => md[p]);
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.ok(warnings.some((w) => w.includes('"사자"')));
  assert.ok(warnings.some((w) => w.includes('"범"')));
});

test('목록에 같은 단어가 두 번 있어도 두 사람에게 같은 단어가 가지 않는다', () => {
  const w = { sets: { x: { topics: [{ name: 't', words: [{ w: 'a', alt: [] }, { w: 'a', alt: [] }, { w: 'b', alt: [] }] }] } } };
  for (let seed = 1; seed <= 50; seed++) {
    const used = {};
    const r = drawWords({ words: w, set: 'x', enabled: ['t'], used, rng: lcg(seed) });
    assert.notEqual(r.citizenWord, r.liarWord);
  }
});

test('notice 방식: 하나 남으면 그것을 쓰고, 다 쓰면 기록을 비운다', () => {
  const w = { sets: { x: { topics: [{ name: 't', words: [{ w: 'a', alt: [] }, { w: 'b', alt: [] }] }] } } };
  const used = { 'x:t': ['a'] };
  const r = drawWords({ words: w, set: 'x', topic: 't', used, liarMode: 'notice', rng: lcg(1) });
  assert.equal(r.citizenWord, 'b');
  assert.equal(r.liarWord, null);
  assert.equal(r.liarEntry, null);
  drawWords({ words: w, set: 'x', topic: 't', used, liarMode: 'notice', rng: lcg(2) });
  assert.equal(used['x:t'].length, 1);
});
