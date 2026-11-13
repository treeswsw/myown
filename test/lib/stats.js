// 치우침 검사용 통계 도우미. 거짓 실패 확률이 사실상 0이 되도록 기준을 아주 넉넉하게 잡는다.
//   - 칸마다 z 점수 |z| < Z_MAX (6.5 시그마, 한 칸 거짓 실패 약 8e-11)
//   - 전체 카이제곱이 같은 수준(z=6.5)의 임계값 이하 (윌슨-힐퍼티 근사)
// 시험은 고정 씨앗(seeded) 난수나 실제 crypto 난수 어느 쪽으로도 돌릴 수 있다.
import assert from 'node:assert/strict';

export const Z_MAX = 6.5;

// 자유도 df 의 카이제곱 분포에서 상위 확률 ~8e-11 에 해당하는 임계값(윌슨-힐퍼티 근사; df=1 은 z²).
export function chiCrit(df, z = Z_MAX) {
  if (df <= 1) return z * z;
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}

// 같은 확률의 k 칸에 관측값 counts 가 고르게 떨어졌는가.
export function assertUniform(counts, label = '') {
  const k = counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(total > 0, `${label}: 표본이 없다`);
  const e = total / k;
  const sd = Math.sqrt(total * (1 / k) * (1 - 1 / k));
  let chi = 0;
  counts.forEach((o, i) => {
    chi += (o - e) ** 2 / e;
    const z = sd === 0 ? 0 : (o - e) / sd;
    assert.ok(Math.abs(z) < Z_MAX, `${label}: ${i}번 칸 ${o} (기대 ${e.toFixed(1)}, z=${z.toFixed(2)})`);
  });
  assert.ok(chi < chiCrit(k - 1), `${label}: 카이제곱 ${chi.toFixed(1)} >= ${chiCrit(k - 1).toFixed(1)} (칸 ${k}개)`);
}

// 합 sum(n 개)의 평균이 mu 인가 (한 개의 표준편차 sigma). 상관 없는 표본 가정이라 보수적이다.
export function assertMean(sum, n, mu, sigma, label = '') {
  const z = (sum / n - mu) / (sigma / Math.sqrt(n));
  assert.ok(Math.abs(z) < Z_MAX, `${label}: 평균 ${(sum / n).toFixed(4)} (기대 ${mu}, z=${z.toFixed(2)})`);
}

// 성공 횟수 hits / n 이 확률 p 와 같은가.
export function assertRate(hits, n, p, label = '') {
  const z = (hits - n * p) / Math.sqrt(n * p * (1 - p));
  assert.ok(Math.abs(z) < Z_MAX, `${label}: ${hits}/${n} (기대 확률 ${p}, z=${z.toFixed(2)})`);
}

// 검사기가 눈뜬장님이 아닌지 확인할 때 쓴다: 통과하면 true.
export function passes(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
