// 혼자 놀기 게임 훅 (docs/solo/PLAN.md 2절, docs/COMMON-CONTRACT.md 1-4). 공용 방 틀(server/room/shell.js)이 쓴다.
// 이 파일은 종목 이름을 모른다: 종목 표(shared/solo/index.js SOLO)와 엔진 약속(PLAN 1-3)만 읽는다.
// 점수는 서버가 센다: 서버가 crypto seed 를 주고, 화면이 보낸 입력 조각(1초마다)을 같은 엔진으로 같이 돌린다. 화면이 보낸 점수는 믿지 않는다.
// 멤버·방장·끊김 유예·강퇴·채팅·이모티콘·소리·faces·빈 방은 Shell 이 맡는다. 하는 사람(pid) 1명 + 구경(나머지 멤버, 점수만 보임).
import { createRun } from '../../shared/solo/run.js';
import { coinsFor, dailyCap, dayOf, weekOf } from '../../shared/solo/coin.js';
import { dropRankCache, enginesOf } from './rank.js';

export const READY_MS = 3000; // 카운트다운
export const GRACE_LATE_MS = 1500; // 제한 시간 뒤 늦게 오는 조각·정산 여유
export const PUMP_STEPS = 240; // 한 번에 돌리는 최대 걸음(서버가 다른 방을 오래 막지 않게)
const RATE_SLACK = 60; // 입력 수 여유
const STEP_SLACK = 300; // 걸음 수 여유
const STEP_RATE = 60 * 1.25; // 초당 걸음(1/60초 × 여유 25%)

export function makeSoloGame(ctx, opt = {}) {
  const err = (c, msg) => ctx.err(`so_${c}`, msg);
  const engines = () => enginesOf(ctx.hub);
  const ids = () => Object.keys(engines());
  let game = engines()[opt.game] ? opt.game : ids()[0]; // 고른 종목(대기실 설정)
  let phase = 'lobby'; // 'lobby' | 'ready'(3초) | 'play' | 'settle'(정산 중) | 'end'(공용 결과, 대기 상태)
  let pid = null; // 하는 사람(시작을 누른 방장)
  let played = game; // 지금 판(또는 방금 끝난 판)의 종목
  let run = null; // 진행기(record: false — 서버는 엔진 상태만 든다)
  let seed = null;
  let startAt = null;
  let endsAt = null;
  let recv = 0; // 받은 기록 칸 수 (so.n)
  let inputs = 0; // 받은 입력 수 (속도 검사)
  let steps = 0; // 받은 걸음 수 (속도 검사)
  let pending = []; // 받았지만 아직 못 돌린 기록 (걸음이 많을 때 나눠 돌린다)
  let settled = false;
  let last = null; // 지난 판 결과 (end 동안)

  const engine = () => engines()[played];
  const others = () => [...ctx.members().filter((m) => m.id !== pid).map((m) => m.id), ...ctx.specIds()];

  // ---- 진행 ----
  function emitProg() {
    const to = others();
    if (to.length) ctx.emit([{ k: 'soProg', score: run.score(), n: recv }], to);
  }

  // 밀린 기록을 돌린다. 한 번에 budget 걸음까지만, 남으면 pump 타이머로 이어서. 끝났으면(over) 정산.
  function drain(budget = PUMP_STEPS) {
    if (phase !== 'play') return;
    if (pending.length) {
      const r = run.feed(pending, budget);
      if (!r.ok) {
        // 잘못된 입력: 엔진이 이미 끝난 뒤의 입력이면 조용히, 아니면 기록(화면과 엔진이 어긋남)하고 그 자리에서 정산
        if (!run.over()) console.error(`solo bad input room ${ctx.code} game ${played}`);
        pending = [];
        return settle('over');
      }
      pending = r.left;
    }
    if (pending.length) {
      ctx.timer('pump', 0, () => { drain(); if (phase === 'play') emitProg(); });
      return;
    }
    if (run.over()) settle('over');
  }

  // ---- 정산 (한 판에 한 번) ----
  function settle(reason, desync = false) {
    if (settled || !run) return;
    settled = true;
    ctx.clear('go');
    ctx.clear('limit');
    ctx.clear('max');
    ctx.clear('pump');
    phase = 'settle';
    const uid = pid;
    const game0 = played;
    const eng = engine();
    const score = run.score();
    const member = ctx.member(uid);
    const session0 = member?.session ?? ctx.hub.sessions.get(uid) ?? null; // 나가는 중이어도 아직 member 다
    const t = ctx.now();
    const day = dayOf(t);
    const wk = weekOf(t);

    // 2. 기록 (바로, 동기): 최고·판 수·이번 주 최고
    const live = ctx.hub.sessions.get(uid)?.user ?? session0?.user ?? null;
    let best = score;
    let fresh = false;
    if (live) {
      live.solo ??= {};
      const rec = live.solo[game0] ?? { best: 0, at: 0, n: 0, wk, wbest: 0, wat: 0 };
      rec.n += 1;
      if (score > rec.best) { rec.best = score; rec.at = t; fresh = score > 0; }
      if (rec.wk !== wk) { rec.wk = wk; rec.wbest = 0; rec.wat = 0; }
      if (score > rec.wbest) { rec.wbest = score; rec.wat = t; }
      live.solo[game0] = rec;
      best = rec.best;
      ctx.hub.persist(live);
      if (session0) ctx.hub.sendMe(session0);
    }
    if (reason !== 'leave') ctx.push(); // 나가는 중이면 Shell 이 곧 push 한다

    // 3~5. 코인 -> 순위 -> 공용 결과 (저장소를 읽으므로 한 줄로 세워 상한이 겹쳐 넘지 않게)
    const hub = ctx.hub;
    const rules = hub.coinRules?.() ?? {};
    const want = coinsFor(eng, score, rules);
    const cap = dailyCap(rules);
    queue(async () => {
      let gain = 0;
      let today = 0;
      let rank = { all: null, wk: null };
      try {
        const before = await hub.store.earnedOn(uid, 'solo', day);
        const give = Math.min(want, Math.max(0, cap - before));
        if (give > 0 && session0) {
          // 나가서(60초 끊김) 세션이 이미 지워졌어도 코인은 준다: hub.grant 는 같은 순간(동기)에 세션을 찾는다
          const had = hub.sessions.has(uid);
          if (!had) hub.sessions.set(uid, session0);
          try { gain = hub.grant(hub.rooms.get(ctx.code), uid, give, { mode: 'solo', game: game0, day, win: true }); } finally { if (!had) hub.sessions.delete(uid); }
        }
        today = before + gain;
        if (live) {
          await Promise.all([...hub.pendingSaves]); // 순위는 저장 줄 뒤에 읽는다
          const [a, w] = await Promise.all([hub.store.soloRank(uid, game0, null), hub.store.soloRank(uid, game0, wk)]);
          rank = { all: a.rank, wk: w.rank };
        }
      } catch (e) {
        console.error('solo settle failed:', e?.message ?? e);
      }
      dropRankCache(hub, game0);
      last = {
        game: game0, score, reason, ...(desync ? { desync: true } : {}),
        best, fresh, rank, coin: { want, gain, capped: gain < want }, today, cap,
      };
      ctx.finish(ctx.member(uid) ? [{ id: uid, rank: 1, score }] : [], { add: { by: { [uid]: gain } } });
      phase = 'end';
      ctx.push();
    });
  }

  function queue(fn) {
    const hub = ctx.hub;
    hub.soloQ = (hub.soloQ ?? Promise.resolve()).then(fn).catch((e) => console.error('solo coin failed:', e?.message ?? e));
    return hub.soloQ;
  }

  // ---- 입력 ----
  function onIn(session, msg) {
    if (phase !== 'play') return err('now');
    if (session.id !== pid) return err('spec');
    if (!Array.isArray(msg.ops) || !Number.isInteger(msg.n) || msg.n < 0) return err('bad');
    if (msg.n < recv) return null; // 이미 받은 조각을 다시 보낸 것
    if (msg.n > recv) { ctx.pushTo([pid]); return err('sync'); } // 빠진 칸이 있다: 화면이 so.n 부터 다시 보낸다
    const now = ctx.now();
    if (endsAt !== null && now > endsAt + GRACE_LATE_MS) return null; // 늦은 조각은 버린다(서버 시계 기준)
    const eng = engine();
    let ins = 0;
    let stp = 0;
    for (const v of msg.ops) {
      if (!Number.isInteger(v)) return err('bad');
      if (v >= 0) ins++; else stp -= v;
    }
    const sec = Math.max(0, now - startAt) / 1000;
    if (inputs + ins > sec * eng.rate + RATE_SLACK || steps + stp > sec * STEP_RATE + STEP_SLACK) {
      ctx.pushTo([pid]);
      return err('fast'); // 이 조각은 버린다(판은 계속)
    }
    inputs += ins;
    steps += stp;
    recv += msg.ops.length;
    pending.push(...msg.ops);
    drain();
    if (phase === 'play') emitProg();
    return null;
  }

  function onEnd(session, msg) {
    if (phase !== 'play') return err('now');
    if (session.id !== pid) return err('spec');
    drain(Infinity);
    if (phase !== 'play') return null; // 밀린 기록을 돌리다 끝났다
    const server = run.score();
    const desync = Number.isInteger(msg.score) && msg.score !== server;
    if (desync) console.error('solo desync', JSON.stringify({ room: ctx.code, game: played, client: msg.score, server, n: recv }));
    settle(run.over() ? 'over' : 'quit', desync);
    return null;
  }

  function setSettings(byId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return err('bad');
    const keys = Object.keys(patch);
    if (keys.length !== 1 || keys[0] !== 'game') return err('bad');
    if (typeof patch.game !== 'string' || !engines()[patch.game]) return err('game');
    game = patch.game;
    return null;
  }

  return {
    // 비밀: seed 는 play 부터 하는 사람에게만(ready 동안은 아무에게도, 구경꾼에게는 끝까지 안 보낸다). 프로필 사진은 넣지 않는다(faces).
    view(id) {
      const showRun = phase === 'ready' || phase === 'play' || phase === 'settle';
      return {
        game: showRun ? played : game,
        pid,
        players: ctx.members().map((m) => ({ id: m.id, spectating: phase !== 'lobby' && m.id !== pid })),
        so: showRun && run ? {
          startAt, endsAt, n: recv, score: run.score(),
          ...(phase === 'play' && id === pid ? { seed } : {}),
        } : null,
        last: phase === 'end' ? last : null,
      };
    },
    phase: () => phase,
    isWaiting: () => phase === 'lobby' || phase === 'end',

    canStart() {
      if (!engines()[game]) return err('game');
      if (!ctx.members().some((m) => m.connected)) return err('need1', '방에 사람이 있어야 해요.');
      return null;
    },

    onStart(byId) {
      const eng = engines()[game];
      if (!eng) return err('game');
      played = game;
      pid = byId;
      // seed 는 crypto 난수만 (hub.rng = ctx.rng, 0 이상 1 미만)
      seed = Math.floor(ctx.rng() * 4294967296) >>> 0;
      run = createRun(eng, seed, { record: false });
      recv = 0; inputs = 0; steps = 0; pending = []; settled = false; last = null;
      startAt = ctx.now() + READY_MS;
      endsAt = eng.limitMs ? startAt + eng.limitMs : null;
      phase = 'ready';
      ctx.timer('go', READY_MS, () => {
        phase = 'play';
        if (endsAt !== null) ctx.timer('limit', endsAt + GRACE_LATE_MS - ctx.now(), () => { drain(Infinity); settle('time'); });
        ctx.timer('max', startAt + eng.maxMs - ctx.now(), () => { drain(Infinity); settle('max'); });
        ctx.push();
      });
      return null;
    },

    setSettings,
    waitInfo: () => ({ set: { game }, own: {} }),

    onAction(session, msg) {
      switch (msg.a) {
        case 'in': return onIn(session, msg);
        case 'end': return onEnd(session, msg);
        default: return err('bad'); // rank 는 허브가 답한다(server/solo/rank.js)
      }
    },

    // 하는 사람이 나가거나 끊김 60초가 지나면 그 판은 그때 점수로 정산한다(카운트다운 중이면 취소).
    onLeave(id) {
      if (id !== pid) return [];
      if (phase === 'ready') {
        ctx.clear('go');
        phase = 'lobby';
        pid = null;
        run = null;
      } else if (phase === 'play') {
        drain(Infinity);
        settle('leave');
      }
      return [];
    },
  };
}
