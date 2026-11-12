// docs/liar/WORDS.md(내 버전)와 docs/liar/WORDS-STAR.md(스타 버전)를 읽어 server/liar/words.json 을 만든다.
// 사용: npm run words   (원본 md 는 읽기만 한다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize as norm } from '../shared/liar/words.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
export const SOURCES = { mine: 'docs/WORDS.md', star: 'docs/WORDS-STAR.md' };
export const OUT = path.join(root, 'server', 'liar', 'words.json');

// 정답 비교용 정규화는 shared/liar/words.js 의 normalize 를 그대로 쓴다(둘이 어긋나지 않게)

export function parseWordsMd(text) {
  const topics = [];
  for (const sec of text.split(/^## /m).slice(1)) {
    const [head, ...lines] = sec.split('\n');
    const words = [];
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('(총')) continue;
      line = line.replace(/^(특이·어려운|유행·웃긴):/, '');
      for (const item of line.split(' · ')) {
        const m = item.trim().match(/^(.*?)\s*\((.*)\)\s*$/);
        const w = (m ? m[1] : item).trim();
        if (!w) continue;
        const alt = m ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [];
        words.push({ w, alt });
      }
    }
    topics.push({ name: head.trim(), words });
  }
  return topics;
}

export function buildAll(readFile = (p) => fs.readFileSync(path.join(root, p.replace(/^docs\//, 'docs/liar/')), 'utf8')) {
  const sets = {};
  const warnings = [];
  for (const [id, file] of Object.entries(SOURCES)) {
    const topics = parseWordsMd(readFile(file));
    const seen = new Map(); // 정규화한 이름 → { label: "주제/단어", e: 그 항목 }
    for (const t of topics) {
      for (const e of t.words) {
        for (const n of [e.w, ...e.alt]) {
          const k = norm(n);
          const prev = seen.get(k);
          // 같은 항목 안(w 와 alt)은 겹쳐도 괜찮다. 다른 항목이면 같은 주제 안이어도 경고한다.
          if (prev && prev.e !== e) warnings.push(`[${id}] 중복: "${n}" (${t.name}/${e.w} ↔ ${prev.label})`);
          else if (!prev) seen.set(k, { label: `${t.name}/${e.w}`, e });
        }
      }
    }
    sets[id] = { topics };
  }
  return { json: { sets }, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { json, warnings } = buildAll();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(json, null, 1) + '\n');
  for (const w of warnings) console.warn('경고', w);
  for (const [id, s] of Object.entries(json.sets)) {
    console.log(`${id}: ${s.topics.length}주제, ${s.topics.reduce((n, t) => n + t.words.length, 0)}단어`);
  }
  console.log(`경고 ${warnings.length}건 → ${path.relative(root, OUT)}`);
}
