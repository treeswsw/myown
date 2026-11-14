// 사과 게임 규칙 엔진 (docs/solo/PLAN.md 1-3, 7절). 순수: DOM·시간·통신 없음.
// 17×10 칸에 1~9 사과. 직사각형 안에 남은 사과의 합이 정확히 10 이면 지우고 점수 += 개수.
// 입력 값 v = x0 + 17×(y0 + 10×(x1 + 17×y1)) (칸 좌표, x0≤x1, y0≤y1). 시간 제한(2분)은 틀이 잰다.
import { makeRng } from './rng.js';

export const COLS = 17;
export const ROWS = 10;
export const TARGET = 10;
const MAXV = COLS - 1 + COLS * (ROWS - 1 + ROWS * (COLS - 1 + COLS * (ROWS - 1))); // 28899

export function pack(x0, y0, x1, y1) { return x0 + COLS * (y0 + ROWS * (x1 + COLS * y1)); }
export function unpack(v) {
  const x0 = v % COLS; let q = (v - x0) / COLS;
  const y0 = q % ROWS; q = (q - y0) / ROWS;
  const x1 = q % COLS; const y1 = (q - x1) / COLS;
  return { x0, y0, x1, y1 };
}

// 상자 안 남은 사과의 합·개수 (화면이 드래그 중 미리보기에도 쓴다. 상태는 안 바꿈)
export function measure(cells, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = cells[y * COLS + x]; if (c) { sum += c; n++; } }
  return { sum, n };
}

export default {
  id: 'apple', name: '사과 게임', desc: '합이 10이 되게 묶기 · 2분',
  limitMs: 120000, maxMs: 130000, tick: false, rate: 10, maxV: MAXV,
  coin: [40, 70, 90, 105, 120, 135, 150],
  create(seed) {
    const rng = makeRng(seed);
    const cells = [];
    for (let i = 0; i < COLS * ROWS; i++) cells.push(1 + rng.int(9));
    return { rng, cells, score: 0, ev: [] };
  },
  input(s, v) {
    if (!Number.isInteger(v) || v < 0 || v > MAXV) return false;
    const { x0, y0, x1, y1 } = unpack(v);
    if (x0 > x1 || y0 > y1) return false;
    const { sum, n } = measure(s.cells, x0, y0, x1, y1);
    if (sum !== TARGET) return false;
    const gone = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * COLS + x;
      if (s.cells[i]) { gone.push({ i, n: s.cells[i] }); s.cells[i] = 0; }
    }
    s.score += n;
    s.ev.push({ k: 'clear', gone, n, x0, y0, x1, y1 });
    return true;
  },
  score: (s) => s.score,
  over: () => false,
};
