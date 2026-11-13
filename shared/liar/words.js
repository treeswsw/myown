// 제시어 뽑기와 정답 채점 (PLAN 1-8). 순수 함수만 둔다(파일·난수 장치는 밖에서 넣는다).
import { randomInt } from 'node:crypto';

/** 기본 난수: crypto. rng(n) → 0..n-1 정수. 시험에서는 다른 함수를 넣는다. */
export const cryptoRng = (n) => randomInt(n);

/** 채점·중복 비교용: NFC + 공백 제거 + 소문자 */
export function normalize(s) {
  return String(s ?? '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
}

function getSet(words, set) {
  const s = words && words.sets && words.sets[set];
  if (!s) throw new Error(`없는 제시어 묶음: ${set}`);
  return s;
}

/** 묶음의 주제 이름 배열 */
export function listTopics(words, set) {
  return getSet(words, set).topics.map((t) => t.name);
}

/**
 * 시민/라이어 제시어 뽑기.
 * used: { [`${set}:${topic}`]: string[] } — 이 방에서 이미 나온 단어(w). 이 함수가 직접 갱신한다.
 * liarMode 'notice' 면 liarWord 는 null. 반환 citizenEntry/liarEntry 는 채점용 {w, alt}.
 */
export function drawWords({ words, set, enabled, topic, used = {}, liarMode = 'word', rng = cryptoRng }) {
  const s = getSet(words, set);
  let name = topic;
  if (name == null) {
    if (!Array.isArray(enabled) || enabled.length === 0) throw new Error('켜진 주제가 없습니다');
    name = enabled[rng(enabled.length)];
  }
  const t = s.topics.find((x) => x.name === name);
  if (!t) throw new Error(`없는 주제: ${set}/${name}`);
  const key = `${set}:${name}`;
  // 같은 단어(w)가 목록에 두 번 있어도 한 번만 친다(두 사람에게 같은 단어가 가지 않게)
  const uniq = [...new Map(t.words.map((e) => [e.w, e])).values()];
  let seen = new Set(used[key] || []);
  let pool = uniq.filter((e) => !seen.has(e.w));
  const need = liarMode === 'notice' ? 1 : 2;
  if (pool.length < need) { // 다 썼다 → 이 주제 기록을 비운다
    seen = new Set();
    pool = uniq.slice();
  }
  if (pool.length < need) throw new Error(`단어가 모자란 주제: ${set}/${name}`);
  const a = rng(pool.length);
  const citizen = pool[a];
  let liar = null;
  if (need === 2) {
    let b = rng(pool.length - 1);
    if (b >= a) b += 1;
    liar = pool[b];
  }
  seen.add(citizen.w);
  if (liar) seen.add(liar.w);
  used[key] = [...seen];
  return {
    topic: name,
    citizenWord: citizen.w,
    liarWord: liar ? liar.w : null,
    citizenEntry: citizen,
    liarEntry: liar,
  };
}

/** 정답 채점: entry = {w, alt} (또는 문자열). 공백·대소문자 무시, 다른 이름도 인정. */
export function isCorrect(input, entry) {
  const x = normalize(input);
  if (!x) return false;
  const list = typeof entry === 'string' ? [entry] : [entry.w, ...(entry.alt || [])];
  return list.some((n) => normalize(n) === x);
}
