// 혼자 놀기 코인·날짜 계산 (docs/solo/PLAN.md 3절). 한국 시간(UTC+9) 기준.
const KST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

// 한국 시간 날짜 번호 (자정에 바뀜). server/mini/puzzleRun.js 의 kstDay 와 같은 값.
export const dayOf = (t) => Math.floor((t + KST_MS) / DAY_MS);
// 주 번호: 한국 시간 월요일 0시에 바뀌는 정수 (1970-01-01 은 목요일이라 +3)
export const weekOf = (t) => Math.floor((dayOf(t) + 3) / 7);

// 점수 -> 코인: 넘은 문턱 수, 관리자 설정 rules['solo_'+id].finish 가 판당 최대. 규칙이 없으면 0.
export function coinsFor(engine, score, rules) {
  const row = rules?.['solo_' + engine.id];
  const max = Number.isInteger(row?.finish) ? row.finish : 0;
  if (!Number.isFinite(score) || score <= 0) return 0;
  let n = 0;
  for (const th of engine.coin ?? []) if (score >= th) n++;
  return Math.min(max, n);
}

// 혼자 놀기 전체 하루 상한 (rules.solo_cap.finish). 없으면 0.
export const dailyCap = (rules) => (Number.isInteger(rules?.solo_cap?.finish) ? rules.solo_cap.finish : 0);
