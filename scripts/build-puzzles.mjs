// 리체스 퍼즐 CSV(zst) -> server/mini/puzzles.json.gz. 사용: node scripts/build-puzzles.mjs <csv.zst 경로> [구간당 최대=1000]
// 기준: Popularity>=85, NbPlays>=500, RatingDeviation<=90, rating 600~2900 을 100 단위 구간으로, 구간마다 PuzzleId 해시 순 앞에서 N 개.
// 결과: [[id, fen, moves, rating, themes(리체스 주제, 공백 구분)], ...] rating 오름차순. 마지막에 모든 문제의 수순이 합법인지 chess.js 로 확인(불합법은 버림).
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../shared/mini/index.js';
import { fromFen } from '../shared/mini/fen.js';
import { uciToMove } from '../client/src/mini/bots/fen.js';

const src = process.argv[2];
const PER = Number(process.argv[3] ?? 1000);
if (!src) { console.error('사용: node scripts/build-puzzles.mjs <lichess_db_puzzle.csv.zst> [구간당 개수]'); process.exit(1); }
const out = fileURLToPath(new URL('../server/mini/puzzles.json.gz', import.meta.url));
const { chess } = GAMES;

// 리체스 파일은 zstd 프레임 앞마다 건너뛰는 프레임(0x184D2A5x, 12바이트)이 붙어 있어 Node 해제기가 한 번에 못 읽는다.
// 건너뛰는 프레임 위치를 찾아 프레임별로 스트리밍 해제한다(메모리에 CSV 전체를 올리지 않는다).
function frames(p) {
  const b = fs.readFileSync(p), starts = [];
  for (let i = 0; i + 12 <= b.length;) {
    const m = b.readUInt32LE(i);
    if ((m & 0xfffffff0) === 0x184d2a50) { starts.push(i + 8 + b.readUInt32LE(i + 4)); i += 8 + b.readUInt32LE(i + 4); }
    else { // 건너뛰는 프레임이 아니면 다음 건너뛰는 프레임 앞까지가 한 프레임
      const n = b.indexOf(Buffer.from([0x50, 0x2a, 0x4d, 0x18]), i + 1);
      if (n < 0) break;
      i = n;
    }
  }
  const ends = starts.map((_, k) => (k + 1 < starts.length ? starts[k + 1] - 12 : b.length));
  return starts.map((st, k) => b.subarray(st, ends[k]));
}
async function* lines(p) {
  let rest = '';
  for (const fr of frames(p)) {
    const dec = zlib.createZstdDecompress();
    dec.end(fr);
    for await (const chunk of dec) {
      const parts = (rest + chunk.toString('utf8')).split('\n');
      rest = parts.pop();
      yield* parts;
    }
  }
  if (rest) yield rest;
}

const buckets = new Map();
let rows = 0, kept = 0;
for await (const line of lines(src)) {
  rows++;
  const f = line.split(',');
  if (f[0] === 'PuzzleId') continue;
  const rating = Number(f[3]), dev = Number(f[4]), pop = Number(f[5]), plays = Number(f[6]);
  if (!(pop >= 85 && plays >= 500 && dev <= 90 && rating >= 600 && rating < 3000)) continue;
  const b = Math.min(22, Math.floor((rating - 600) / 100));
  const h = crypto.createHash('sha1').update(f[0]).digest().readUInt32BE(0);
  if (!buckets.has(b)) buckets.set(b, []);
  buckets.get(b).push({ h, p: [f[0], f[1], f[2], rating, f[7] ?? ""] });
  kept++;
}
console.log(`읽은 줄 ${rows}, 기준 통과 ${kept}`);

function legal(p) {
  try {
    let s = fromFen(p[1]);
    for (const u of p[2].split(' ')) {
      const m = uciToMove(u);
      if (!m) return false;
      s = chess.apply(s, m);
      if (!s) return false;
    }
    return true;
  } catch { return false; }
}

const result = [];
let dropped = 0;
for (const b of [...buckets.keys()].sort((a, c) => a - c)) {
  const arr = buckets.get(b).sort((x, y) => x.h - y.h);
  let n = 0;
  for (const { p } of arr) {
    if (n >= PER) break;
    if (!legal(p)) { dropped++; continue; }
    result.push(p); n++;
  }
  console.log(`${600 + b * 100}~${600 + b * 100 + 99}: 후보 ${arr.length} -> ${n}`);
}
result.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : 1));
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(result), { level: 9 }));
console.log(`불합법으로 버린 수 ${dropped}, 총 ${result.length}개, 파일 ${(fs.statSync(out).size / 1048576).toFixed(2)}MB`);
