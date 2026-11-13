// 갱식마인드 정답 판정과 글자 수 칸 (GDD 9절 ⑨, 10-6절). 순수 함수.

/**
 * 비교용 정리: 앞뒤 공백 제거 → NFC → 공백·가운뎃점(·)·마침표 제거 → 영문 소문자.
 * 공백은 모든 종류(전각 공백 포함)를 뗀다.
 */
export function normalizeAnswer(s) {
  return String(s ?? '')
    .trim()
    .normalize('NFC')
    .replace(/[\s 　·・•.]/g, '')
    .toLowerCase();
}

/** entry = {w, alt?: string[]} 또는 문자열. 정답으로 인정하는 이름 전부(w 먼저). */
export function acceptedNames(entry) {
  if (typeof entry === 'string') return [entry];
  if (!entry) return [];
  return [entry.w, ...(Array.isArray(entry.alt) ? entry.alt : [])].filter((x) => typeof x === 'string');
}

/** 입력이 단어(w) 또는 다른 이름(alt)과 정리 후 완전히 같을 때만 true. 빈 입력은 false. */
export function isCorrect(input, entry) {
  const x = normalizeAnswer(input);
  if (!x) return false;
  return acceptedNames(entry).some((n) => normalizeAnswer(n) === x);
}

/**
 * 글자 수 칸: 글자마다 □, 띄어쓰기 자리는 공백 하나 ('골든 리트리버' → '□□ □□□□').
 * 가운뎃점·마침표도 한 칸으로 센다(정답 판정에서는 빠지지만 화면에서는 보이는 글자이므로).
 */
export function makeMask(word) {
  let out = '';
  for (const ch of String(word ?? '').normalize('NFC')) out += /\s/.test(ch) ? ' ' : '□';
  return out;
}

/** 글자 수(공백 제외) — 화면의 "3글자" 표시용 */
export function letterCount(word) {
  let n = 0;
  for (const ch of String(word ?? '').normalize('NFC')) if (!/\s/.test(ch)) n++;
  return n;
}
