// 2048 엔진 (docs/solo/PLAN.md 1-3, 6-2, 7). 규칙은 원작(gabrielecirulli/2048, MIT)을 참고해 새로 썼다.
// 4×4 판, 입력 값 = 방향(0 위 / 1 오른쪽 / 2 아래 / 3 왼쪽). 칸 번호 = 줄*4 + 칸(왼쪽 위가 0).
// 새 타일은 2(90%)·4(10%)이고 빈 칸 중 rng 로 고른다. 한 번 밀 때 한 타일은 한 번만 합쳐진다. 점수 = 합쳐 만든 타일 값의 합.
// 연출 사건 state.ev: {k:'mv',id,to} 움직임 / {k:'mg',id,a,b,at,v} a·b 가 합쳐져 새 타일 id / {k:'sp',id,at,v} 새 타일 / {k:'sc',v} 점수 증가 / {k:'win'} 2048 첫 달성.
import { makeRng } from './rng.js';

const N = 4;

// 방향별 줄: 벽 쪽 칸부터 반대편으로 4칸씩 4줄
const LINES = [0, 1, 2, 3].map((d) => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const line = [];
    for (let j = 0; j < N; j++) {
      if (d === 0) line.push(j * N + i);
      else if (d === 1) line.push(i * N + (N - 1 - j));
      else if (d === 2) line.push((N - 1 - j) * N + i);
      else line.push(i * N + j);
    }
    out.push(line);
  }
  return out;
});

function spawn(s) {
  const empty = [];
  for (let i = 0; i < N * N; i++) if (s.cells[i] === 0) empty.push(i);
  if (!empty.length) return;
  const v = s.rng.int(10) === 0 ? 4 : 2;
  const at = empty[s.rng.int(empty.length)];
  const id = s.nid++;
  s.cells[at] = v;
  s.ids[at] = id;
  s.ev.push({ k: 'sp', id, at, v });
}

function stuck(s) {
  for (let i = 0; i < N * N; i++) {
    const v = s.cells[i];
    if (v === 0) return false;
    if (i % N < N - 1 && s.cells[i + 1] === v) return false;
    if (i + N < N * N && s.cells[i + N] === v) return false;
  }
  return true;
}

export default {
  id: 'g2048', name: '2048', desc: '밀어서 같은 숫자를 합쳐 2048 을 만드세요',
  limitMs: null, maxMs: 3600000, tick: false, rate: 30, maxV: 3,
  coin: [1000, 3000, 6000, 10000, 15000, 20000, 30000, 45000, 70000, 100000],
  create(seed) {
    const s = { rng: makeRng(seed), cells: new Array(N * N).fill(0), ids: new Array(N * N).fill(0), nid: 1, sc: 0, won: false, dead: false, ev: [] };
    spawn(s);
    spawn(s);
    s.ev.length = 0;
    return s;
  },
  input(s, d) {
    if (s.dead || !Number.isInteger(d) || d < 0 || d > 3) return false;
    const cells = new Array(N * N).fill(0);
    const ids = new Array(N * N).fill(0);
    const evs = [];
    let gain = 0, moved = false, won = false, nid = s.nid;
    for (const line of LINES[d]) {
      const tiles = [];
      for (const p of line) if (s.cells[p]) tiles.push(p);
      let w = 0;
      for (let t = 0; t < tiles.length; t++) {
        const p = tiles[t];
        const q = t + 1 < tiles.length ? tiles[t + 1] : -1;
        const to = line[w++];
        if (q >= 0 && s.cells[q] === s.cells[p]) {
          const v = s.cells[p] * 2;
          const id = nid++;
          cells[to] = v; ids[to] = id;
          evs.push({ k: 'mv', id: s.ids[p], to }, { k: 'mv', id: s.ids[q], to }, { k: 'mg', id, a: s.ids[p], b: s.ids[q], at: to, v });
          gain += v;
          if (v === 2048 && !s.won) won = true;
          moved = true;
          t++;
        } else {
          cells[to] = s.cells[p]; ids[to] = s.ids[p];
          if (p !== to) { evs.push({ k: 'mv', id: s.ids[p], to }); moved = true; }
        }
      }
    }
    if (!moved) return false;
    s.cells = cells; s.ids = ids; s.nid = nid;
    s.sc += gain;
    for (const e of evs) s.ev.push(e);
    if (gain) s.ev.push({ k: 'sc', v: gain });
    spawn(s);
    if (won) { s.won = true; s.ev.push({ k: 'win' }); }
    s.dead = stuck(s);
    return true;
  },
  score: (s) => s.sc,
  over: (s) => s.dead,
};
