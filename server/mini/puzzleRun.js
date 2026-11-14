// 체스 퍼즐 혼자 풀기 (docs/mini/PLAN.md 6절). 미니게임 방 하나에 사람 1명, 문제를 연달아 푼다.
// 정답 수순은 서버만 안다: 화면에는 지금 판과 (실패·정답 보기 뒤에만) 남은 정답 수순을 보낸다.
// 문제 하나: 상대 첫 수(자동) -> 사람 수 -> 상대 응수(자동) -> ... 틀리거나, 정답 보기를 누르거나, 끝까지 맞히면 그 문제가 끝난다.
// 끝나면 레이팅(Elo) 갱신, 첫 시도에 맞힌 문제만 코인(난이도별 + 5연속 보너스, 하루 상한은 coin_log 의 note {mode:'puzzle', day} 합으로).
import { GAMES } from '../../shared/mini/index.js';
import { fromFen } from '../../shared/mini/fen.js';
import { PUZZLE_RECENT } from '../store.js';
import { pickPuzzle, checkMove } from './puzzles.js';

const chess = GAMES.chess;
export const STREAK_EVERY = 5;
const KST_MS = 9 * 3600_000;
export const kstDay = (t) => Math.floor((t + KST_MS) / 86_400_000);
export const tierKey = (rating) => (rating < 1200 ? 'puzzle_1' : rating < 1800 ? 'puzzle_2' : rating < 2200 ? 'puzzle_3' : 'puzzle_5');

const FILES = 'abcdefgh';
function uciToMove(u) {
  const m = { from: { x: FILES.indexOf(u[0]), y: 8 - Number(u[1]) }, to: { x: FILES.indexOf(u[2]), y: 8 - Number(u[3]) } };
  if (u[4]) m.promo = u[4].toUpperCase();
  return m;
}
const okSq = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 8 && p.y >= 0 && p.y < 8;

export function elo(rating, puzzleRating, n, success) {
  const e = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
  const k = n < 20 ? 40 : 20;
  return Math.round(success ? k * (1 - e) : -k * e);
}

export function makePuzzleRun(ctx, err, uid) {
  const user = () => ctx.member(uid)?.session.user ?? null;
  const rules = () => ctx.hub.coinRules?.() ?? {};
  let pz = null; // 지금 문제
  let alive = true;
  let today = null; // 오늘 받은 퍼즐 코인 (읽는 중 null)
  const day = () => kstDay(ctx.now());
  const cap = () => rules().puzzle_cap?.finish ?? 100;

  // 코인 계산은 저장소를 읽으므로 한 줄로 세워 처리한다(상한이 겹쳐 넘지 않게)
  const queue = (fn) => {
    const hub = ctx.hub;
    hub.puzzleQ = (hub.puzzleQ ?? Promise.resolve()).then(fn).catch((e) => console.error('puzzle coin failed:', e?.message ?? e));
    return hub.puzzleQ;
  };

  function begin() {
    const u = user();
    if (!u) return;
    const p = u.puzzle;
    const pick = pickPuzzle(p.r, p.recent, () => ctx.rng());
    if (!pick) return;
    const moves = pick[2].split(' ');
    const s1 = chess.apply(fromFen(pick[1]), uciToMove(moves[0]));
    pz = { puzzle: pick, moves, idx: 1, state: s1, seat: s1.turn, status: 'play', hinted: false, failed: false, wrong: 0, hint: null, solution: null, delta: null, success: null, coin: null };
    if (today === null) queue(async () => { today = await ctx.hub.store.earnedOn(uid, 'puzzle', day()); if (alive) ctx.push(); });
  }

  // 리체스처럼: 틀린 수는 두지 않고 "다시 시도"(fail=true 로 실패 기록은 한 번만), 힌트만 쓰고 맞히면 레이팅·연속 그대로
  function record(u, kind) { // kind: 'success' | 'fail' | 'hinted'
    const p = u.puzzle;
    pz.delta = kind === 'hinted' ? 0 : elo(p.r, pz.puzzle[3], p.n, kind === 'success');
    p.r = Math.max(100, p.r + pz.delta);
    if (kind !== 'hinted') p.n += 1;
    if (kind === 'success') p.streak += 1;
    else if (kind === 'fail') p.streak = 0;
    p.best = Math.max(p.best, p.streak);
    p.recent = [...p.recent, pz.puzzle[0]].slice(-PUZZLE_RECENT);
    ctx.hub.persist(u);
    ctx.hub.sendMe(ctx.member(uid).session);
  }

  function fail() { // 틀린 수 / 정답 보기: 이 문제는 실패로 한 번만 기록
    if (pz.failed) return;
    pz.failed = true;
    const u = user();
    if (u) record(u, 'fail');
  }

  function finish(status) {
    pz.status = status;
    pz.hint = null;
    const u = user();
    if (!u) return;
    const p = u.puzzle;
    if (status !== 'solved') fail();
    else if (!pz.failed) record(u, pz.hinted ? 'hinted' : 'success');
    const success = status === 'solved' && !pz.hinted && !pz.failed;
    pz.success = success;
    ctx.hub.persist(u);
    ctx.hub.sendMe(ctx.member(uid).session);
    const r = rules();
    const base = success ? r[tierKey(pz.puzzle[3])]?.finish ?? 0 : 0;
    const bonus = success && p.streak % STREAK_EVERY === 0 ? r.puzzle_streak?.finish ?? 0 : 0;
    const want = base + bonus;
    pz.coin = { want, bonus, gain: want > 0 ? null : 0, capped: false }; // gain null = 계산 중
    if (want <= 0) return;
    const cur = pz;
    queue(async () => {
      const d = day();
      const before = await ctx.hub.store.earnedOn(uid, 'puzzle', d);
      const give = Math.min(want, Math.max(0, cap() - before));
      const got = give > 0 ? ctx.hub.grant(ctx.hub.rooms.get(ctx.code), uid, give, { mode: 'puzzle', day: d, win: true }) : 0;
      today = before + got;
      cur.coin = { want, bonus, gain: got, capped: got < want };
      if (alive) ctx.push();
    });
  }

  return {
    begin,
    // 요청 {a:'move'|'hint'|'reveal'|'retry'|'next'}. 방에 앉은 사람(uid)만.
    onAction(session, msg) {
      if (session.id !== uid) return err('seat', '관전 중입니다.');
      if (!pz) return err('now');
      switch (msg.a) {
        case 'move': {
          if (pz.status !== 'play') return err('now');
          const mv = msg.move;
          if (!mv || !okSq(mv.from) || !okSq(mv.to)) return err('move', '둘 수 없는 곳입니다.');
          const one = { from: { x: mv.from.x, y: mv.from.y }, to: { x: mv.to.x, y: mv.to.y }, ...(typeof mv.promo === 'string' ? { promo: mv.promo } : {}) };
          const after = chess.apply(pz.state, one);
          if (!after) return err('move', '둘 수 없는 곳입니다.');
          if (!checkMove(pz.puzzle, pz.idx, one, after)) {
            // 틀린 수: 두지 않고 그대로 두어 다시 시도하게 한다 (이 문제는 실패로 기록, 코인 0). 정답은 보내지 않는다.
            pz.wrong += 1;
            fail();
          } else if (pz.idx === pz.moves.length - 1 || after.winner !== null) {
            pz.state = after;
            finish('solved');
          } else {
            pz.state = chess.apply(after, uciToMove(pz.moves[pz.idx + 1]));
            pz.idx += 2;
            pz.hint = null;
          }
          ctx.push();
          return null;
        }
        case 'hint':
          if (pz.status !== 'play') return err('now');
          pz.hinted = true;
          pz.hint = uciToMove(pz.moves[pz.idx]).from;
          ctx.push();
          return null;
        case 'reveal':
          if (pz.status !== 'play') return err('now');
          pz.solution = pz.moves.slice(pz.idx);
          finish('revealed');
          ctx.push();
          return null;
        case 'retry': // 틀린 수 알림을 닫고 계속 푼다 (판은 서버에서 그대로이므로 상태만 다시 보낸다)
          if (pz.status !== 'play') return err('now');
          ctx.push();
          return null;
        case 'next':
          if (pz.status === 'play') return err('now', '문제를 풀거나 정답을 본 뒤에 넘어갈 수 있어요.');
          begin();
          ctx.push();
          return null;
        default: return err('bad');
      }
    },
    // 화면용 문제 상태. 정답 수순(solution)·전체 수순(line)은 끝난 뒤(solved·revealed)에만 들어간다.
    view() {
      if (!pz) return null;
      const p = user()?.puzzle ?? {};
      const ended = pz.status !== 'play';
      const last = pz.moves.length - 1;
      return {
        status: pz.status,
        id: ended ? pz.puzzle[0] : null,
        rating: pz.puzzle[3],
        themes: pz.puzzle[4] ?? '',
        humanMoves: Math.ceil(last / 2),
        seat: pz.seat,
        hint: pz.hint,
        hinted: pz.hinted,
        failed: pz.failed,
        wrong: pz.wrong,
        solution: ended && pz.status === 'revealed' ? pz.solution : null,
        line: ended ? { fen: pz.puzzle[1], moves: pz.moves, at: pz.idx, solved: pz.status === 'solved' } : null,
        me: { r: p.r ?? null, n: p.n ?? 0, streak: p.streak ?? 0, best: p.best ?? 0, delta: ended || pz.failed ? pz.delta : null },
        coin: { today, cap: cap(), ...(ended && pz.coin ? pz.coin : {}) },
      };
    },
    state: () => pz?.state ?? null,
    seat: () => pz?.seat ?? 0,
    stop() { alive = false; pz = null; },
  };
}
