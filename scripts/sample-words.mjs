// WORDS.md 를 읽어 주제마다 무작위 "시민 / 라이어" 짝 5개를 보여 준다. (의존성 없음)
// 사용: node scripts/sample-words.mjs [WORDS.md 경로] [주제당 개수]
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'docs', 'liar', 'WORDS.md');
const perTopic = Number(process.argv[3]) || 5;

function parseWords(text) {
  const topics = [];
  for (const sec of text.split(/^## /m).slice(1)) {
    const [head, ...lines] = sec.split('\n');
    const words = [];
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('(총')) continue;
      line = line.replace(/^(특이·어려운|유행·웃긴):/, '');
      for (const w of line.split(' · ')) {
        const main = w.replace(/\(.*\)\s*$/, '').trim(); // 괄호 별칭은 빼고 표시
        if (main) words.push(main);
      }
    }
    topics.push({ name: head.trim(), words });
  }
  return topics;
}

const topics = parseWords(fs.readFileSync(file, 'utf8'));
for (const { name, words } of topics) {
  console.log(`## ${name} (${words.length}개)`);
  for (let i = 0; i < perTopic; i++) {
    const a = randomInt(words.length);
    let b = randomInt(words.length - 1);
    if (b >= a) b++; // 서로 다른 두 단어
    console.log(`  시민 ${words[a]} / 라이어 ${words[b]}`);
  }
}
