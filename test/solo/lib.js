// 혼자 놀기 시험용 가짜 엔진 (docs/solo/PLAN.md 8절 A). 종목 표(SOLO)와 상관없이 틀 시험이 쓴다.
import { makeRng } from '../../shared/solo/rng.js';

// 걸음 없는 종목: 입력 v(0~3)마다 v + rng 수를 점수에 더한다. v >= 4 는 안 되는 입력(false). 점수 30 이상이면 끝.
export const turnEngine = {
  id: 'fake_turn', name: '가짜 턴', desc: '시험용', limitMs: null, maxMs: 60_000, tick: false, rate: 30, maxV: 4,
  coin: [5, 10, 20],
  create(seed) { return { rng: makeRng(seed), score: 0, ev: [] }; },
  input(s, v) {
    if (v >= 4) return false;
    s.score += v + s.rng.int(3);
    s.ev.push({ k: 'add', v });
    return true;
  },
  score: (s) => s.score,
  over: (s) => s.score >= 30,
};

// 걸음 있는 종목: 걸음마다 rng 로 0~2 를 더하고, 입력 v 는 점수에 v 를 더한다(v 0 은 안 되는 입력).
export const tickEngine = {
  id: 'fake_tick', name: '가짜 틱', desc: '시험용', limitMs: 10_000, maxMs: 60_000, tick: true, rate: 3, maxV: 360,
  coin: [100, 200],
  create(seed) { return { rng: makeRng(seed), score: 0, steps: 0, ev: [] }; },
  input(s, v) {
    if (v === 0) return false;
    s.score += v;
    return true;
  },
  step(s) { s.steps++; s.score += s.rng.int(3); },
  score: (s) => s.score,
  over: (s) => s.steps >= 100000,
};
