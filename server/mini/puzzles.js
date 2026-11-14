// 체스 퍼즐 묶음(server/mini/puzzles.json.gz, scripts/build-puzzles.mjs 로 만듦). docs/mini/PLAN.md 6절.
// 칸: [id, fen, moves(uci 공백 구분), rating] rating 오름차순. moves[0] 은 상대 수(서버가 먼저 둠).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

let all = null;

export function loadPuzzles(file = fileURLToPath(new URL('./puzzles.json.gz', import.meta.url))) {
  if (!all) all = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  return all;
}

// rating 에 가까운 문제 하나. ±150 안에서, 없으면 150씩 넓힌다. recentIds(배열/Set) 는 제외(다 겹치면 무시).
// rng() 는 [0,1) 을 돌려주는 함수(crypto 기반을 주입).
export function pickPuzzle(rating, recentIds = [], rng) {
  const list = loadPuzzles();
  const recent = recentIds instanceof Set ? recentIds : new Set(recentIds);
  const lowerBound = (v) => { // rating >= v 인 첫 자리
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid][3] < v) lo = mid + 1; else hi = mid; }
    return lo;
  };
  for (let w = 150; ; w += 150) {
    const a = lowerBound(rating - w), b = lowerBound(rating + w + 1);
    const cand = [];
    for (let i = a; i < b; i++) if (!recent.has(list[i][0])) cand.push(list[i]);
    if (cand.length) return cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))];
    if (a === 0 && b === list.length) return list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : null;
  }
}

// 사람이 stepIndex 번째 수(moves 배열 위치, 홀수 자리: 1,3,5...)로 둔 수가 정답인지.
// move 는 {from:{x,y}, to:{x,y}, promo?}, stateAfter 는 그 수를 둔 뒤의 chess 상태.
// 정답 수와 같거나, 마지막 수일 때 체크메이트면 정답.
export function checkMove(puzzle, stepIndex, move, stateAfter) {
  const moves = puzzle[2].split(' ');
  const want = moves[stepIndex];
  if (!want || !move?.from || !move?.to) return false;
  const sq = (p) => 'abcdefgh'[p.x] + (8 - p.y);
  const got = sq(move.from) + sq(move.to) + (move.promo ? move.promo.toLowerCase() : '');
  if (got === want) return true;
  // 승급 글자 생략(퀸 기본)도 같은 수로 본다
  if (want.length === 5 && want[4] === 'q' && got === want.slice(0, 4)) return true;
  return stepIndex === moves.length - 1 && stateAfter?.end === 'checkmate';
}
