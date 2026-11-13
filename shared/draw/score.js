// 갱식마인드 점수와 순위 (GDD 3-4절). 순수 함수. 시각은 전부 인자로 받는다.
import { SCORE } from './constants.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 맞힌 사람 점수 = round(40 + 60 × 남은시간 ÷ 그리는시간) (+ 첫 정답 20).
 * remainingSec: 맞힌 순간 남은 시간(초, 첫 정답으로 줄어든 뒤라면 줄어든 시계 기준).
 * totalSec: 방장이 고른 그리는 시간(60·90·140). 남은 시간은 0..total 로 자른다.
 * 결과는 40..120.
 */
export function guesserPoints({ remainingSec, totalSec, first = false }) {
  const ratio = totalSec > 0 ? clamp01(remainingSec / totalSec) : 0;
  return Math.round(SCORE.guessBase + SCORE.guessSpeed * ratio) + (first ? SCORE.firstBonus : 0);
}

/** 시각(ms)으로 계산하는 편의 함수. endsAtMs = 그 순간의 끝 시각, nowMs = 맞힌 시각. order 1 이 첫 정답자. */
export function guesserPointsAt({ endsAtMs, nowMs, totalSec, order }) {
  return guesserPoints({ remainingSec: (endsAtMs - nowMs) / 1000, totalSec, first: order === 1 });
}

/** 그린 사람 점수 = round(100 × 맞힌 수 ÷ 맞힐 수 있던 수). 맞힐 수 있던 사람이 0이면 0. */
export function drawerPoints({ hits, guessers }) {
  if (!(guessers > 0) || !(hits > 0)) return 0;
  return Math.round(SCORE.drawerMax * Math.min(hits, guessers) / guessers);
}

/**
 * 순위: 점수 큰 순 → 맞힌 횟수 큰 순 → 같으면 공동 순위(1, 1, 3 식).
 * list: [{ id, score, correct, ...나머지 }]. 동점 안에서는 입력 순서를 유지한 새 배열(각 항목에 rank 추가).
 */
export function rankPlayers(list) {
  const sorted = list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.score - a.p.score) || ((b.p.correct || 0) - (a.p.correct || 0)) || (a.i - b.i))
    .map((x) => x.p);
  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.score !== p.score || (prev.correct || 0) !== (p.correct || 0)) rank = i + 1;
    return { ...p, rank };
  });
}
