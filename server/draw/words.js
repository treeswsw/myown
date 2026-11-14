// 갱식마인드 단어: server/liar/words.json 을 읽기만 한다(파일은 고치지 않는다). GDD 5절.
// 난수는 crypto 만. 시험에서는 rng 를 바꿔 넣을 수 있다.
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { WORD_CHOICES, TOPICS_ON, TOPICS_OFF, GANGSIK_LABEL } from '../../shared/draw/constants.js';

const WORDS_URL = new URL('../liar/words.json', import.meta.url);
const SET = 'mine';

let cache = null;
/**
 * words.json 의 sets.mine 을 읽어 {topics:[{name, words:[{w, alt, g?}]}], drawOnly:[{w, alt}]} 로 돌려준다(기본 파일은 한 번만 읽음).
 * g:1 = 갱식 표시 단어, drawOnly = 어느 주제에도 안 들어가는 갱식마인드 전용 단어(라이어는 안 읽음).
 */
export function loadWords(url = WORDS_URL) {
  if (url === WORDS_URL && cache) return cache;
  const json = JSON.parse(readFileSync(url, 'utf8'));
  const set = json && json.sets && json.sets[SET];
  if (!set || !Array.isArray(set.topics)) throw new Error('단어 파일 모양이 다릅니다');
  const data = {
    topics: set.topics.map((t) => ({
      name: t.name,
      words: t.words.map((e) => ({ w: e.w, alt: Array.isArray(e.alt) ? e.alt : [], ...(e.g ? { g: 1 } : {}) })),
    })),
    drawOnly: (Array.isArray(set.drawOnly) ? set.drawOnly : []).map((e) => ({ w: e.w, alt: Array.isArray(e.alt) ? e.alt : [] })),
  };
  if (url === WORDS_URL) cache = data;
  return data;
}

/** 고를 수 있는 주제 이름 전부(파일 순서, 11개) */
export function listTopics(data = loadWords()) {
  return data.topics.map((t) => t.name);
}

/** 처음 켜 두는 주제(5절: 8개). 파일에 없는 이름은 뺀다. */
export function defaultTopics(data = loadWords()) {
  const all = new Set(listTopics(data));
  return TOPICS_ON.filter((n) => all.has(n));
}

/** 처음 꺼 두는 주제(3개) */
export function offTopics(data = loadWords()) {
  const all = new Set(listTopics(data));
  return TOPICS_OFF.filter((n) => all.has(n));
}

const cryptoRng = (n) => randomInt(n);

/**
 * 방 하나가 쓰는 단어 뽑기. 고른 단어를 기억해 한 판에서 다시 나오지 않게 한다.
 *  - pick(topics): 켜진 주제들의 단어를 한데 모아(단어마다 같은 확률) 서로 다른 3개를 뽑는다.
 *    반환 [{w, topic, alt}] x3. 화면에 보낼 때는 {w, topic}만 보낼 것(alt 는 서버가 정답 판정에만 쓴다).
 *    뽑는다고 "나온 것"이 되지는 않는다(보여 준 3개 중 안 고른 것은 다시 나올 수 있다).
 *  - use(w): 고른 단어를 기억. 이후 pick 에서 빠진다.
 *  - entry(w): 단어 하나의 {w, topic, alt}. 없으면 null.
 *  - reset(): 기억을 비운다(새 판 시작 때).
 * 남은 단어가 3개보다 적으면 켜진 주제의 기록만 비우고 다시 뽑는다.
 */
export function createWordPicker({ data = loadWords(), rng = cryptoRng } = {}) {
  const used = new Set();
  const byWord = new Map();
  for (const t of data.topics) for (const e of t.words) if (!byWord.has(e.w)) byWord.set(e.w, { w: e.w, topic: t.name, alt: e.alt });
  for (const e of data.drawOnly || []) if (!byWord.has(e.w)) byWord.set(e.w, { w: e.w, topic: GANGSIK_LABEL, alt: e.alt });
  // 갱식 풀: 주제와 상관없이 g 표시 단어 + 전용 단어(같은 단어는 한 번만, 첫 주제 소속)
  const gangsik = [];
  { const seenG = new Set();
    for (const t of data.topics) for (const e of t.words) if (e.g && !seenG.has(e.w)) { seenG.add(e.w); gangsik.push({ w: e.w, topic: t.name, alt: e.alt }); }
    for (const e of data.drawOnly || []) if (!seenG.has(e.w)) { seenG.add(e.w); gangsik.push({ w: e.w, topic: GANGSIK_LABEL, alt: e.alt }); } }

  function pool(topics) {
    const names = new Set(topics);
    const seen = new Set();
    const out = [];
    for (const t of data.topics) {
      if (!names.has(t.name)) continue;
      for (const e of t.words) {
        if (seen.has(e.w)) continue;
        seen.add(e.w);
        out.push({ w: e.w, topic: t.name, alt: e.alt });
      }
    }
    return out;
  }

  return {
    pick(topics) {
      if (!Array.isArray(topics) || topics.length === 0) throw new Error('켜진 주제가 없습니다');
      const all = pool(topics);
      if (all.length === 0) throw new Error('켜진 주제에 단어가 없습니다');
      // 후보 하나는 갱식 풀(g 표시 + 전용)에서. 안 쓴 갱식 단어가 없으면 기존 방식(3개 모두 켜진 주제)으로 대체.
      const gFree = gangsik.filter((e) => !used.has(e.w));
      const g = gFree.length ? gFree[rng(gFree.length)] : null;
      const need = g ? WORD_CHOICES - 1 : WORD_CHOICES;
      let free = all.filter((e) => !used.has(e.w) && (!g || e.w !== g.w));
      if (free.length < need) { // 다 썼다 → 켜진 주제의 기록만 비운다
        for (const e of all) used.delete(e.w);
        free = g ? all.filter((e) => e.w !== g.w) : all;
      }
      if (free.length < need) throw new Error('단어가 모자랍니다');
      const out = [];
      for (let k = 0; k < need; k++) { // 부분 섞기: 뽑은 칸에 맨 뒤 것을 옮겨 중복을 막는다
        const last = free.length - 1 - k;
        const i = rng(last + 1);
        out.push(free[i]);
        free[i] = free[last];
      }
      if (g) out.splice(rng(out.length + 1), 0, g); // 갱식 단어 자리는 섞는다
      return out.map((e) => ({ w: e.w, topic: e.topic, alt: e.alt }));
    },
    use(w) { used.add(w); },
    isUsed(w) { return used.has(w); },
    usedCount() { return used.size; },
    entry(w) { const e = byWord.get(w); return e ? { ...e } : null; },
    reset() { used.clear(); },
  };
}
