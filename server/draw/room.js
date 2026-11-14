// 갱식마인드 게임 훅 (GDD 9·10절, docs/COMMON-CONTRACT.md 1-4·1-7). 공용 방 틀(server/room/shell.js)이 쓴다.
// 사람(멤버)·방장·강퇴·끊김 유예·이모티콘·소리·faces·빈 방 지우기는 Shell 이 주인이다. 엔진(shared/draw/game.js)도 자기 사람 목록을
// 들고 있어서, 이 어댑터가 두 쪽을 맞춘다(엔진에서 사라진 사람은 ctx.drop 으로 Shell 에 알리고, 방장은 onHost 로 엔진을 맞춘다).
// 채팅은 엔진이 맡는다(chatOwn): 정답 판정·정답자끼리 글 가리기·속도 제한이 엔진 한 함수에 묶여 있다(D8).
// 비밀: 단어는 그리는 사람과 이미 맞힌 사람의 viewFor 에만 들어간다. 맞히기 전 사람에게 정답 글·정답자끼리 채팅은 가지 않는다.
// 프로필 사진은 상태에 넣지 않고 faces 알림으로 보낸다(Shell).

import { createRoom, join as gJoin, back as gBack, away as gAway, leave as gLeave, setSettings as gSetSettings, start as gStart,
  end as gEnd, pickWord, give, skip, chat as gChat, chatLogFor, mediaCheck, tick, nextDeadline, viewFor,
  canDraw, noteInk, setCanvasFlags, ERRORS } from '../../shared/draw/game.js';
import * as ops from '../../shared/draw/ops.js';
import { checkDr } from '../../shared/draw/protocol.js';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/draw/constants.js';
import { createWordPicker, listTopics, defaultTopics } from './words.js';

export { MAX_PLAYERS };
const SYNC_GAP_MS = 1000; // 거절 뒤 drSync 는 한 사람에게 1초에 1번
const DRAW_ACTS = new Set(['st', 'pt', 'cx', 'rm', 'undo', 'redo', 'clear']);
// 이 네 가지는 Shell 이 보낸다. 엔진이 같은 종류를 내면 버린다(1-5).
const SHELL_EVENTS = new Set(['joined', 'left', 'away', 'back']);
const SPEC_OK = new Set(['drNew', 'drHit', 'chat']); // 관전자에게도 보내는 엔진 알림(chat 은 sec 아닌 것만)

// hub.rng() 는 [0,1) 실수(32비트). 엔진이 원하는 0..n-1 정수로 바꾼다(치우침 없이).
export function intRng(rng) {
  return (n) => {
    const limit = Math.floor(2 ** 32 / n) * n;
    for (let i = 0; i < 64; i++) {
      const u = Math.floor(rng() * 2 ** 32);
      if (u < limit) return u % n;
    }
    return Math.min(n - 1, Math.floor(rng() * n));
  };
}

/**
 * opt: { picker?, saveDraw?(rows) }
 *  - saveDraw 가 있으면 판이 끝날 때(finished.save) rows 를 넘기고, 없으면 user.stats.draw 에 직접 더하고 hub.persist 한다.
 *    rows = [{id, name, rank, left, games:1, wins, correct, points}]
 */
export function makeDrawGame(ctx, opt = {}) {
  const { hub } = ctx;
  const errOf = (code) => ctx.err(code, ERRORS[code]);
  const errFx = (fx) => (fx.code ? { msg: fx.msg, code: fx.code } : ctx.err('dr_bad', fx.msg));
  const picker = opt.picker ?? createWordPicker();
  const saveDraw = opt.saveDraw ?? null;
  const allTopics = listTopics();
  const rng = intRng(hub.rng);
  let g = null; // 엔진 상태. 첫 입장 때 만든다. viewFor 로만 밖에 나간다.
  let drawing = ops.createDrawing();
  let drawnQ = 0; // 그림을 비운 마지막 문제 번호
  let starters = null; // 이번 판을 시작할 때 있던 사람(코인은 이 사람들만)
  let pendingJoin = null; // 지금 입장 처리 중인 사람(엔진에 넣기 전이라 "맞추기"가 지우지 않는다)
  let flow = 0; // > 0 이면 Shell 이 이어서 push 한다(입장·나감·끊김·시작·설정): 여기서는 상태를 따로 보내지 않는다
  const lastSync = new Map(); // id -> 마지막으로 거절 뒤 drSync 를 보낸 시각

  const env = (now) => ({ now, rng, words: (topics) => picker.pick(topics) });
  const inG = (id) => !!g && g.players.some((p) => p.id === id);
  const flowed = (fn) => { flow++; try { return fn(); } finally { flow--; } };

  // ---- 모든 진입점: 먼저 tick, 끝나면 타이머 다시 걸기 ----

  function run(fn) {
    const now = hub.now();
    if (g) apply(tick(g, now, env(now)));
    const r = fn(now);
    arm();
    return r;
  }

  function arm() {
    ctx.clear('game');
    if (!g || g.players.length === 0) return;
    const at = nextDeadline(g);
    if (at === null || at === undefined) return;
    ctx.timer('game', Math.max(0, at - hub.now()), onTimer);
  }

  function onTimer() {
    if (!g) return;
    const now = hub.now();
    try {
      apply(tick(g, now, env(now)));
    } catch (err) {
      console.error(`draw room ${ctx.code}: timer failed:`, err.stack);
      ctx.timer('game', 1000, onTimer);
      return;
    }
    if (!g) return;
    const next = g.players.length ? nextDeadline(g) : null;
    if (next !== null && next <= now) { // 일이 없는데 시각이 과거면 무한 반복이 된다: 1초 뒤에 다시
      console.error(`draw room ${ctx.code}: tick made no progress in phase ${g.phase}`);
      ctx.timer('game', 1000, onTimer);
      return;
    }
    arm();
  }

  // ---- 엔진이 돌려준 fx 를 실제로 보낸다 ----

  function apply(fx) {
    if (!fx || fx.ok === false || !g) return;
    if (g.q !== drawnQ && g.q > 0) { // 새 문제가 시작됨(받는 사람이 없어도)
      drawing = ops.createDrawing();
      drawnQ = g.q;
    }
    for (const w of fx.use) picker.use(w);
    // 관전 계정(엔진 밖)은 "못 맞힌 사람"과 같은 것만 받는다: 공개 알림(정답자끼리 글 sec 은 빼고)과 비밀 없는 view
    for (const { to, e } of fx.events) if (!SHELL_EVENTS.has(e.k)) ctx.emit([e], SPEC_OK.has(e.k) && !e.sec ? [...to, ...ctx.specIds()] : to);
    if (fx.finished?.save) save(fx.finished.ranking, fx.finished.reason); // 상태보다 먼저: 공통 결과(wait.result)가 같은 상태에 실린다
    if (fx.room.length && flow === 0) {
      const everyone = ctx.members().filter((m) => m.connected).every((m) => fx.room.includes(m.id));
      if (everyone) ctx.push(); else ctx.pushTo([...fx.room, ...ctx.specIds()]);
    }
    syncMembers();
  }

  // 엔진에서 사라진 사람을 Shell 에서도 뺀다(엔진 자리 유지 60초가 Shell 유예보다 먼저 끝난 경우). 목록 단계·그림도 맞춘다.
  function syncMembers() {
    const alive = new Set(g.players.map((p) => p.id));
    for (const m of ctx.members()) if (!alive.has(m.id) && m.id !== pendingJoin) ctx.drop(m.id, 'away');
    if (!g) return; // 마지막 사람이 빠지면 onEmpty 가 g 를 지운다
    for (const id of [...lastSync.keys()]) if (!alive.has(id)) lastSync.delete(id);
    if (g.phase === 'lobby') {
      drawnQ = 0;
      if (drawing.ops.length || drawing.cur) drawing = ops.createDrawing();
    }
    if (g.phase === 'lobby' || g.phase === 'final') starters = null;
    else if (!starters) starters = new Set(g.players.map((p) => p.id));
  }

  // 판이 끝나 누적 기록을 남기고(finished.save), 코인은 판마다 한 번(혼자 남아 끝난 판은 없음)
  function save(ranking, reason) {
    const rows = ranking.map((r) => ({
      id: r.id, name: r.name, rank: r.rank, left: !!r.left,
      games: 1, wins: r.rank === 1 ? 1 : 0, correct: r.correct, points: r.score,
    }));
    if (saveDraw) saveDraw(rows);
    else {
      for (const row of rows) {
        // 지금 로그인해 있는 사람의 지금 user 만 쓴다(옛 사본을 저장하면 그 사이 바뀐 값을 덮어쓴다)
        const session = ctx.member(row.id)?.session ?? hub.sessions.get(row.id);
        const user = session?.user;
        if (!user) continue;
        user.stats ??= {};
        const d = (user.stats.draw ??= { games: 0, wins: 0, correct: 0, points: 0 });
        d.games += row.games; d.wins += row.wins; d.correct += row.correct; d.points += row.points;
        hub.persist(user);
        if (session.conn) hub.sendMe(session);
      }
    }
    const who = starters ?? new Set(ranking.map((r) => r.id));
    const opp = reason === 'alone' ? undefined : who.size - 1; // 혼자 남아 끝난 판: 결과만, 코인 없음
    ctx.finish(ranking.filter((r) => !r.left && who.has(r.id))
      .map((r) => ({ id: r.id, rank: r.rank, score: r.score, note: `맞힘 ${r.correct}`, won: r.rank === 1, opp })));
  }

  // ---- 그림 요청 ----

  // 그리는 사람을 뺀 방 전원(관전자 포함)
  const toWatchers = (drawerId, e) => ctx.emit([e], [...ctx.members().map((m) => m.id).filter((id) => id !== drawerId), ...ctx.specIds()]);

  // 거절 뒤 drSync: 한 사람에게 1초에 1번 이하
  function resync(id, now) {
    const last = lastSync.get(id);
    if (last !== undefined && now - last < SYNC_GAP_MS) return;
    lastSync.set(id, now);
    ctx.emit([{ k: 'drSync', ...ops.exportSync(drawing) }], [id]);
  }

  // 되돌리기·다시 하기 가능 여부를 엔진에 알린다(바뀌면 그리는 사람에게만 room)
  function flags() {
    apply(setCanvasFlags(g, { canUndo: ops.canUndo(drawing), canRedo: !drawing.cur && ops.canRedo(drawing) }));
  }

  // 그림 요청. checkDr 를 통과한 것만 온다.
  function drawReq(session, msg, now) {
    const id = session.id;
    // draw 단계 밖이거나 그리는 사람이 아니면 조용히 버린다(오류도 drSync 도 없음).
    if (!canDraw(g, id)) return null;
    const d = drawing;
    let r;
    switch (msg.a) {
      case 'st': r = ops.st(d, msg); break;
      case 'pt': r = ops.pt(d, msg); break;
      case 'rm': r = ops.rm(d, msg); break;
      case 'cx': r = ops.cx(d); break;
      case 'undo': r = ops.undo(d); break;
      case 'redo': r = ops.redo(d); break;
      default: r = ops.clear(d);
    }
    if (r.event) toWatchers(id, r.event); // 성공한 전달, 또는 거절되며 닫힌 선을 보는 사람들에게 알림
    if (!r.ok) {
      if (r.error === 'full') ctx.sendTo(id, { t: 'error', ...errOf('dr_canvas_full') });
      resync(id, now); // bad·range·full 모두 오류 글 없이(full 은 위 오류 글만) 화면을 서버와 맞춘다
    } else if (!r.noop && msg.a === 'st') {
      noteInk(g, id);
    }
    flags();
    return null;
  }

  // 방장 설정 바꾸기(새 set 과 옛 dr settings 가 같은 길). 주제를 전부 끄려 하면 알맞은 안내를 준다.
  function changeSettings(by, patch) {
    return run((now) => {
      if (!g || !inG(by)) return errOf('dr_now');
      if (Array.isArray(patch?.topics) && patch.topics.length === 0) return errOf('dr_topics');
      const fx = gSetSettings(g, by, patch, env(now));
      if (!fx.ok) return errFx(fx);
      apply(fx);
      return null;
    });
  }

  // 모든 {t:'dr'} 요청
  function dr(session, raw) {
    return run((now) => {
      const id = session.id;
      if (!g || !inG(id)) return errOf('dr_now');
      const c = checkDr(raw);
      if (!c.ok) {
        if (DRAW_ACTS.has(raw?.a)) { // 그림 요청의 형식 오류: 오류 글 없이 버리고, 지금 그리는 사람이면 drSync
          if (canDraw(g, id)) resync(id, now);
          return null;
        }
        return errOf('dr_bad');
      }
      const msg = c.msg;
      if (DRAW_ACTS.has(msg.a)) return drawReq(session, msg, now);
      let fx;
      switch (msg.a) {
        case 'pick': fx = pickWord(g, id, msg.i, env(now)); break;
        case 'give': fx = give(g, id, env(now)); break;
        case 'skip': fx = skip(g, id, env(now)); break;
        case 'end': fx = gEnd(g, id, env(now)); break;
        default: return errOf('dr_bad');
      }
      if (!fx.ok) return errFx(fx);
      apply(fx);
      return null;
    });
  }

  return {
    view(id) {
      return g ? viewFor(g, id) : { players: [], settings: null };
    },
    phase: () => g?.phase ?? 'lobby',
    isWaiting: () => !g || g.phase === 'lobby' || g.phase === 'final',
    get g() { return g; }, // 시험이 엔진 상태·그림을 직접 본다
    get drawing() { return drawing; },
    listExtra: () => ({ phase: !g || g.phase === 'lobby' || g.phase === 'final' ? 'lobby' : 'playing' }), // 방 목록은 대기/게임 중 두 가지만 본다

    // 부작용 없음(매 push 마다 wait.why 를 계산하는 데도 쓴다)
    canStart() {
      if (!g || g.players.filter((p) => p.connected).length < MIN_PLAYERS) return errOf('dr_need2');
      if (g.settings.topics.length === 0) return errOf('dr_topics');
      return null;
    },

    onStart(by) {
      return flowed(() => run((now) => {
        if (!g || !inG(by)) return errOf('dr_now');
        let fx;
        try {
          fx = gStart(g, by, env(now));
        } catch (err) {
          console.error(`draw room ${ctx.code}: start failed:`, err.message);
          return errOf('dr_topics');
        }
        if (!fx.ok) return errFx(fx);
        apply(fx);
        return null;
      }));
    },

    setSettings: (by, patch) => flowed(() => changeSettings(by, patch)),

    waitInfo() {
      const s = g?.settings;
      return {
        set: s ? { order: s.order, rounds: s.rounds, time: s.time, len: s.len, topics: s.topics.slice(), allTopics: s.allTopics.slice() } : {},
        own: {},
      };
    },

    onAction: (session, msg) => dr(session, msg),

    // 첫 사람이면 엔진 방을 만들고, 아니면 엔진에 들인다(실패면 Shell 이 입장을 되돌린다)
    onJoin(m) {
      pendingJoin = m.id;
      try {
        return flowed(() => {
          const now = hub.now();
          if (g) apply(tick(g, now, env(now)));
          const user = { id: m.id, name: m.session.user.name };
          if (!g) {
            g = createRoom({ code: ctx.code, host: user, allTopics, topics: defaultTopics(), now });
            drawing = ops.createDrawing();
            drawnQ = 0;
            starters = null;
            arm();
            return null;
          }
          const fx = gJoin(g, user, env(now));
          if (!fx.ok) return errFx(fx);
          apply(fx);
          arm();
          return null;
        });
      } finally {
        pendingJoin = null;
      }
    },

    onAway(id) {
      flowed(() => run((now) => { if (inG(id)) apply(gAway(g, id, env(now))); }));
      return [];
    },
    onBack(id) {
      flowed(() => run((now) => { if (inG(id)) apply(gBack(g, id, env(now))); }));
      return [];
    },

    // 방을 떠난다(나가기·강퇴·유예 끝). 엔진이 이미 지운 사람(자리 유지 60초)이면 할 일 없음.
    onLeave(id) {
      if (!inG(id)) return [];
      flowed(() => run((now) => apply(gLeave(g, id, env(now)))));
      return [];
    },
    onHost(id) { if (g) g.hostId = id; },
    onEmpty() {
      g = null;
      drawing = ops.createDrawing();
      drawnQ = 0;
      starters = null;
      lastSync.clear();
    },

    // 채팅·매체: 엔진 어댑터
    chatOwn(session, text) {
      return run((now) => {
        if (!g || !inG(session.id)) return errOf('dr_now');
        const fx = gChat(g, session.id, text, env(now));
        if (!fx.ok) return errFx(fx);
        apply(fx);
        return null;
      });
    },
    chatLogFor: (id) => (g ? chatLogFor(g, id) : []),
    mediaBlocked(session, kind) {
      if (!g || ctx.isSpec(session.id)) return null; // 관전자는 단어를 모른다: 이모티콘·소리 그대로
      const r = mediaCheck(g, session.id, kind === 'emote' ? 'basic' : 'media');
      return r.ok === false ? errFx(r) : null;
    },
    extrasFor: () => [{ k: 'drSync', ...ops.exportSync(drawing) }],

    // 관리자 "넘기기": 기다리는 시간(고르기·그리기·공개)을 지금 끝낸다. 아무것도 없으면 false.
    skipNow() {
      if (!g || (g.phase !== 'pick' && g.phase !== 'draw' && g.phase !== 'reveal')) return false;
      g.endsAt = hub.now();
      ctx.clear('game');
      onTimer();
      return true;
    },
  };
}
