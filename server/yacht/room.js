// 요트다이스 게임 훅 (SPEC 19, GDD 5·7·8·9절, docs/COMMON-CONTRACT.md 1-4). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·끊김 유예·강퇴·채팅·이모티콘·소리·faces·빈 방 지우기는 Shell 이 맡는다. 이 파일은 규칙(shared/yacht/game.js)과 전적·코인만.
// 차례 타이머는 없다. 시계는 Shell 의 끊김 유예(hub.timing.grace) 하나뿐이다.
import { createGame, shake, roll, keep, pick, score, drop, viewOf } from '../../shared/yacht/game.js';
import { parseYt } from '../../shared/yacht/protocol.js';
import { CATS, ROUNDS, MAX_PLAYERS } from '../../shared/yacht/constants.js';
import { simulateRoll, freeSpot } from '../../shared/yacht/sim.js';

export { MAX_PLAYERS };
const RATE = { shake: 4, pick: 8 }; // 1초에 이만큼까지, 넘으면 조용히 버린다(계정 기준)

// 상태에 넣는 자리는 소수 3자리(SPEC 19-3). 서버가 계산한 자리가 곧 모두가 보는 자리다.
const r3 = (n) => Math.round(n * 1000) / 1000;
const place = (seed, thrown) => simulateRoll(seed, thrown, { frames: false }).rest.map((s) => ({ i: s.i, x: r3(s.x), z: r3(s.z), yaw: r3(s.yaw) }));
const spotFor = (others, prefer) => {
  const s = freeSpot(others, prefer);
  return { x: r3(s.x), z: r3(s.z), yaw: r3(s.yaw) };
};
const emptyScores = () => Object.fromEntries(CATS.map((c) => [c, null]));

// 한 사람 한 색(6색). 들어온 순서대로 비어 있는 색을 받고, 방에 있는 동안 바뀌지 않는다. 화면(대기실·판·점수표·결과)이 이 값 하나를 쓴다.
export const PLAYER_COLORS = ['#3b6fd4', '#d4573b', '#2f9e6e', '#8a55c9', '#c9922f', '#2b9bb5'];

export function makeYachtGame(ctx) {
  const { hub } = ctx;
  const err = (c, msg) => ctx.err(`yt_${c}`, msg);
  const E_NOW = () => err('now');
  let phase = 'lobby';
  let gameNo = 0;
  let game = null; // 규칙 엔진 상태. viewOf 로만 나간다
  let settledGame = null; // 전적을 이미 넣은 판
  const rate = new Map(); // id -> {shake: [ms], pick: [ms]}
  const color = new Map(); // id -> 색 칸 번호

  // 이번 판의 참가자(기권하지 않은)인가
  const inGame = (id) => {
    const c = game?.cols.find((x) => x.id === id);
    return !!c && !c.left;
  };

  // id 가 차례이고 컵을 흔들던 중이면 끝낸다(엔진의 drop 은 이 알림을 내지 않는다)
  function stopShake(id) {
    const g = game;
    if (!g || g.phase !== 'playing' || !g.shaking || g.cols[g.turnIdx].id !== id) return [];
    return shake(g, id, false).events;
  }

  function tooFast(id, kind) {
    const t = hub.now();
    const rec = rate.get(id) ?? { shake: [], pick: [] };
    rate.set(id, rec);
    rec[kind] = rec[kind].filter((x) => t - x < 1000);
    if (rec[kind].length >= RATE[kind]) return true;
    rec[kind].push(t);
    return false;
  }

  const yachtStats = (user) => {
    user.stats ??= {};
    return (user.stats.yacht ??= { games: 0, wins: 0, best: 0 });
  };

  function sync() {
    phase = game ? game.phase : 'lobby';
    if (game && game.phase === 'result' && settledGame !== game) settle();
  }

  // 판이 끝났다: 끝까지 한 사람(기권 아닌)에게 전적을 한 번만 넣는다. best 는 끝까지 간 판('done')만. 코인은 ctx.finish 한 번.
  function settle() {
    const g = game;
    settledGame = g;
    const r = g.result;
    if (!r) return;
    for (const row of r.ranks) {
      const m = ctx.member(row.id);
      if (!m) continue;
      const st = yachtStats(m.session.user);
      st.games++;
      if (r.winners.includes(row.id)) st.wins++;
      if (r.reason === 'done') st.best = Math.max(st.best, row.total);
      hub.persist(m.session.user);
      hub.sendMe(m.session);
    }
    if (r.reason === 'alone') return; // 모두 나가고 한 명만 남은 판: 코인 없음(SPEC 22-2)
    const opp = g.cols.length - 1;
    ctx.finish(r.ranks.filter((row) => ctx.member(row.id)).map((row) => ({ id: row.id, won: r.winners.includes(row.id), opp })));
  }

  // 기권하는 순간 games + 1
  function bookDrop(session) {
    yachtStats(session.user).games++;
    hub.persist(session.user);
    hub.sendMe(session);
  }

  // 모든 {t:'yt'} 요청. 오류 또는 null.
  function yt(session, raw) {
    const c = parseYt(raw);
    if (!c.ok) return err('bad', c.error);
    const msg = c.msg;
    const g = game;
    if (!g) return E_NOW();
    if ((msg.a === 'shake' || msg.a === 'pick') && tooFast(session.id, msg.a)) return null; // 조용히 버린다
    let r;
    switch (msg.a) {
      case 'shake': r = shake(g, session.id, msg.on); break;
      case 'roll': r = roll(g, session.id, hub.rng, place); break;
      case 'keep': r = keep(g, session.id, msg.i, msg.on, spotFor); break;
      case 'pick': r = pick(g, session.id, msg.cat); break;
      case 'score': r = score(g, session.id, msg.cat); break;
      default: return E_NOW();
    }
    if (!r.ok) return err('turn', r.error);
    if (r.events.length === 0) return null; // 이미 그 상태: 아무 일 없음
    sync();
    ctx.push(r.events);
    return null;
  }

  return {
    // SPEC 19-3. 프로필 사진은 없다(faces 알림). 키 순서는 모두에게 같다. 공통 칸(code·mode·hostId·you·now·wait·specs)은 Shell 이 덮는다.
    view(viewerId) {
      const g = game;
      const v = g ? viewOf(g, viewerId) : null;
      const turnMember = v?.turn ? ctx.member(v.turn) : null;
      const ms = ctx.members();
      return {
        phase: v ? v.phase : 'lobby',
        gameNo,
        players: ms.map((m) => ({ id: m.id, spectating: g ? !inGame(m.id) : false, color: PLAYER_COLORS[color.get(m.id) ?? 0] })),
        cols: v ? v.cols : ms.filter((m) => m.connected).map((m) => ({
          id: m.id, name: m.session.user.name, left: false, scores: emptyScores(), upper: 0, bonus: 0, total: 0,
        })),
        round: v ? v.round : 0,
        rounds: ROUNDS,
        turn: v ? v.turn : null,
        waiting: turnMember && !turnMember.connected ? turnMember.id : null,
        rollsLeft: v && v.phase === 'playing' ? v.rollsLeft : 0,
        rollNo: v ? v.rollNo : 0,
        shaking: v ? v.shaking : false,
        dice: v ? v.dice : null,
        preview: v ? v.preview : null,
        pick: v ? v.pick : null,
        last: v ? v.last : null,
        result: v ? v.result : null,
      };
    },
    phase: () => phase,
    get game() { return game; }, // 시험이 판 상태를 직접 본다
    isWaiting: () => phase === 'lobby' || phase === 'result',

    canStart() {
      if (ctx.members().filter((m) => m.connected).length < 2) return err('need2', '2명 이상 필요합니다.');
      return null;
    },

    onStart() {
      const players = ctx.members().filter((m) => m.connected).map((m) => ({ id: m.id, name: m.session.user.name }));
      const r = createGame({ players, rng: hub.rng, gameNo: gameNo + 1 });
      if (!r.ok) return err('start', r.error);
      gameNo++;
      game = r.game;
      sync();
      ctx.emit(r.events);
      return null;
    },

    onAction: (session, msg) => yt(session, msg),

    // 색: 아직 안 쓰는 첫 칸(방에 있는 사람 기준)
    onJoin(m) {
      const used = new Set(color.values());
      let i = 0;
      while (used.has(i)) i++;
      color.set(m.id, i % PLAYER_COLORS.length);
      return null;
    },

    // 끊김: 차례인 사람이면 흔들기를 끝낸다(상태의 waiting 은 view 가 계산한다)
    onAway: (id) => stopShake(id),
    onBack: () => [],

    // 방을 떠난다(나가기·강퇴 아님은 대기 중뿐·유예 60초 지남): 진행 중인 판이면 기권
    onLeave(id, reason) {
      const events = [];
      if (game && game.phase === 'playing' && inGame(id)) {
        events.push(...stopShake(id));
        events.push(...drop(game, id, reason).events);
        bookDrop(ctx.member(id).session);
        sync();
      }
      rate.delete(id);
      color.delete(id);
      return events;
    },

    onEmpty() {
      game = null;
      settledGame = null;
      phase = 'lobby';
      rate.clear();
      color.clear();
    },
  };
}
