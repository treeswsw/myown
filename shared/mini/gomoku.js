// 오목. 15x15, board[y][x] = null|0|1 (0 = 흑 = 선), 수 {x,y}.
// 규칙 rule: 'free'(제한 없음: 5개 이상 연속이면 승) | 'renju'(렌주룰: 흑만 3-3·4-4·장목(6목 이상) 금지, 백은 제한 없음·장목도 승,
// 흑은 정확히 5개일 때만 승. 5목이 되는 수는 금수 판정보다 먼저라 금수 자리여도 둘 수 있다).
// init({rule}) 로 정한다. 금수는 apply 가 null 을 주고, forbidden(s, m) 이 이유('3-3'|'4-4'|'overline')를 준다.
export const SIZE = 15;
export const RULES = ['free', 'renju'];
export const FORBID_TEXT = {
  '3-3': '렌주룰: 흑은 3-3(열린 삼 두 개)을 둘 수 없어요',
  '4-4': '렌주룰: 흑은 4-4(사 두 개)를 둘 수 없어요',
  overline: '렌주룰: 흑은 6목 이상(장목)을 둘 수 없어요',
};
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function init(opt = {}) {
  const rule = RULES.includes(opt.rule) ? opt.rule : 'free';
  return { board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)), turn: 0, winner: null, last: null, rule };
}

// 둘 수 있는 곳 = 빈 칸 전부. (렌주룰 금수 자리도 포함: 눌러 보면 서버가 이유와 함께 거절한다. 봇은 apply 로 걸러 쓴다)
export function legalMoves(s) {
  const out = [];
  if (s.winner !== null) return out;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (s.board[y][x] === null) out.push({ x, y });
  return out;
}

const at = (board, x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? '#' : board[y][x] === null ? '.' : board[y][x] === 0 ? 'B' : 'W');

// (x,y) 가운데 11칸 한 줄 ('B' 흑, 'W' 백, '.' 빈 칸, '#' 밖). 인덱스 5 가 (x,y).
function lineOf(board, x, y, dx, dy) {
  const L = [];
  for (let i = -5; i <= 5; i++) L.push(at(board, x + dx * i, y + dy * i));
  return L;
}
function runAt(L, i) { // 인덱스 i 의 흑이 속한 연속 구간 [a, b]
  let a = i, b = i;
  while (a > 0 && L[a - 1] === 'B') a--;
  while (b < L.length - 1 && L[b + 1] === 'B') b++;
  return [a, b];
}
const exactFiveAt = (L, i) => { // i 칸에 흑을 두면 그 줄에서 정확히 5목
  const t = L.slice();
  t[i] = 'B';
  const [a, b] = runAt(t, i);
  return b - a + 1 === 5;
};

// 흑이 (x,y) 에 둔 뒤(board 에 이미 놓인 상태)의 금수 이유. 없으면 null. depth 는 3-3 안쪽 판정 재귀 제한.
function blackForbidden(board, x, y, depth) {
  const lines = DIRS.map(([dx, dy]) => lineOf(board, x, y, dx, dy));
  let over = false;
  for (const L of lines) {
    const [a, b] = runAt(L, 5);
    if (b - a + 1 === 5) return null; // 5목이면 금수보다 먼저(승리)
    if (b - a + 1 >= 6) over = true;
  }
  if (over) return 'overline';
  // 사(4): 한 수를 더하면 정확히 5목이 되는 4개 묶음. 같은 돌 묶음은 한 번만 센다(열린 4 도 하나).
  const fours = new Set();
  lines.forEach((L, d) => {
    for (let s = 1; s <= 5; s++) {
      const w = L.slice(s, s + 5);
      if (w.includes('W') || w.includes('#')) continue;
      if (w.filter((c) => c === 'B').length !== 4) continue;
      if (!exactFiveAt(L, s + w.indexOf('.'))) continue;
      fours.add(d + ':' + w.map((c, i) => (c === 'B' ? s + i : 0)).filter(Boolean).join(','));
    }
  });
  if (fours.size >= 2) return '4-4';
  // 열린 삼(3): 한 수를 더하면 양끝이 열린 4(양쪽 모두 정확히 5목으로 이어짐)가 되는 모양. 그 수가 금수이면 삼이 아니다.
  let threes = 0;
  lines.forEach((L, d) => {
    const [dx, dy] = DIRS[d];
    for (let p = 1; p <= 9; p++) {
      if (L[p] !== '.') continue;
      const t = L.slice();
      t[p] = 'B';
      const [a, b] = runAt(t, p);
      if (b - a + 1 !== 4 || a > 5 || b < 5) continue; // 새 4 가 (x,y) 를 포함해야 한다
      if (t[a - 1] !== '.' || t[b + 1] !== '.') continue;
      if (!exactFiveAt(t, a - 1) || !exactFiveAt(t, b + 1)) continue;
      if (depth < 3) { // 그 수 자리가 금수이면 삼이 아니다
        const px = x + dx * (p - 5), py = y + dy * (p - 5);
        board[py][px] = 0;
        const bad = blackForbidden(board, px, py, depth + 1);
        board[py][px] = null;
        if (bad) continue;
      }
      threes++;
      break;
    }
  });
  if (threes >= 2) return '3-3';
  return null;
}

// 지금 차례의 수 m 이 렌주룰 금수이면 이유, 아니면 null. (rule 이 renju 이고 흑 차례일 때만)
export function forbidden(s, m) {
  if (s.rule !== 'renju' || s.turn !== 0 || s.winner !== null || !m || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return null;
  if (m.x < 0 || m.y < 0 || m.x >= SIZE || m.y >= SIZE || s.board[m.y][m.x] !== null) return null;
  const board = s.board.map((r) => r.slice());
  board[m.y][m.x] = 0;
  return blackForbidden(board, m.x, m.y, 0);
}
// 서버가 사용자에게 보일 거절 이유(금수가 아니면 null)
export const reject = (s, m) => {
  const why = forbidden(s, m);
  return why ? FORBID_TEXT[why] : null;
};

function wins(board, x, y, p, exact) {
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (const sg of [1, -1]) {
      for (let k = 1; ; k++) {
        if (board[y + dy * k * sg]?.[x + dx * k * sg] !== p) break;
        n++;
      }
    }
    if (exact ? n === 5 : n >= 5) return true;
  }
  return false;
}

export function apply(s, m) {
  if (s.winner !== null || !m || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return null;
  if (m.x < 0 || m.y < 0 || m.x >= SIZE || m.y >= SIZE || s.board[m.y][m.x] !== null) return null;
  if (forbidden(s, m)) return null;
  const board = s.board.map((r) => r.slice());
  board[m.y][m.x] = s.turn;
  let winner = null;
  if (wins(board, m.x, m.y, s.turn, s.rule === 'renju' && s.turn === 0)) winner = s.turn;
  else if (board.every((r) => r.every((c) => c !== null))) winner = 'draw';
  return { board, turn: 1 - s.turn, winner, last: { x: m.x, y: m.y }, rule: s.rule ?? 'free' };
}
