// 갱스껄 게임 훅 (GDD 3·4·8·9절, docs/COMMON-CONTRACT.md 1-4·1-7). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·끊김 유예·강퇴·채팅·이모티콘·소리·faces·빈 방 지우기는 Shell 이 맡는다(D2: 사람의 주인은 Shell).
// 이 파일은 규칙 엔진(shared/gsk/game.js, 순수 함수)을 감싸는 어댑터: 엔진 멤버는 Shell 멤버를 따라간다.
//  - 모든 요청 처리 전에 tick(now). 시계는 엔진의 nextDeadline 하나(ctx.timer 'dl').
//  - 방 상태는 사람마다 viewFor(s, id) 로 따로 나간다(mine 은 본인만). 프로필 사진은 없다(faces 알림).
//  - 난수는 hub.rng(crypto)만(Math.random 금지).
import {
  createGame, addPlayer, setConnected, start, act, leave, tick, nextDeadline, viewFor, pickColor,
} from '../../shared/gsk/game.js';
import { MAX_PLAYERS, MIN_PLAYERS, COLOR_HEX, errorMsg } from '../../shared/gsk/constants.js';

export { MAX_PLAYERS };

export function makeGskGame(ctx, opt = {}) {
  const { hub } = ctx;
  const rnd = opt.rnd ?? ((n) => Math.min(n - 1, Math.floor(ctx.rng() * n)));
  const err = (code, msg) => ctx.err(code, msg ?? errorMsg(code));
  const fresh = () => createGame({ code: ctx.code, hostId: ctx.hostId(), graceMs: hub.timing.grace });
  let s = fresh();
  let booked = new Set(); // 이번 판 전적을 이미 넣은 사람

  const fail = (fx) => err(fx.code, fx.error);

  // 사람마다 한 판에 한 번만. 방에 있는 계정에게만 넣을 수 있다.
  function book(id, won) {
    if (booked.has(id)) return;
    booked.add(id);
    const m = ctx.member(id);
    if (!m) return;
    const user = m.session.user;
    user.stats ??= {};
    const st = (user.stats.gsk ??= { games: 0, wins: 0 });
    st.games++;
    if (won) st.wins++;
    hub.persist(user);
    hub.sendMe(m.session);
  }

  function dispatch(events) {
    for (const { to, e } of events) ctx.emit([e], to === 'all' ? 'all' : [to]);
  }

  // 엔진 결과를 반영한다: 이벤트 전달, 기권 전적, 판 끝 전적·코인. 상태 전송은 ctx.push.
  function apply(fx) {
    if (fx.events.length) dispatch(fx.events);
    // 끊김 60초로 기권한 사람은 그 순간 games + 1
    for (const x of s.seats) if (x.out === 'away' && !booked.has(x.id)) book(x.id, false);
    const fin = fx.finished;
    if (fin) {
      for (const id of fin.players) book(id, id === fin.winner);
      if (fin.reason !== 'alone') {
        const opp = fin.players.length - 1;
        ctx.finish(fin.players.filter((id) => ctx.member(id)).map((id) => ({ id, won: id === fin.winner, opp })));
      }
    }
  }

  // 다음 시각 하나(엔진의 nextDeadline)로 타이머를 다시 건다.
  function rearm() {
    const d = nextDeadline(s);
    if (d === null) { ctx.clear('dl'); return; }
    ctx.timer('dl', Math.max(0, d - hub.now()), () => { apply(tick(s, hub.now(), rnd)); rearm(); ctx.push(); });
  }

  const step = () => apply(tick(s, hub.now(), rnd));

  return {
    // GDD 9-2. 프로필 사진은 없다. players 는 id·관전 여부·색만 싣는다(이름·연결·끊김 시각은 Shell 이 덮는다).
    view(viewerId) {
      const v = viewFor(s, viewerId);
      const hex = new Map(s.members.filter((m) => m.color != null).map((m) => [m.id, COLOR_HEX[m.color]]));
      return {
        ...v,
        players: v.players.map((p) => ({ id: p.id, spectating: p.spectating, color: hex.get(p.id) ?? null })),
      };
    },
    phase: () => s.phase,
    get state() { return s; }, // 시험이 엔진 상태를 직접 본다
    isWaiting: () => s.phase === 'lobby' || s.phase === 'result',

    canStart() {
      if (ctx.members().filter((m) => m.connected).length < MIN_PLAYERS) return err('gk_few');
      return null;
    },

    onStart(by) {
      step();
      s.hostId = by;
      const fx = start(s, by, hub.now(), rnd);
      if (!fx.ok) { rearm(); return fail(fx); }
      booked = new Set();
      apply(fx);
      rearm();
      return null;
    },

    onAction(session, raw) {
      if (!ctx.member(session.id)) return err('gk_now');
      step();
      const fx = act(s, session.id, raw, hub.now(), rnd);
      if (!fx.ok) { rearm(); ctx.push(); return fail(fx); }
      apply(fx);
      rearm();
      ctx.push();
      return null;
    },

    // 개인 칸: 내 색 (대기실 pick)
    pick(id, patch) {
      if (!patch || !Number.isInteger(patch.color)) return err('gk_bad');
      const fx = pickColor(s, id, patch.color);
      if (!fx.ok) return fail(fx);
      apply(fx);
      return null;
    },

    waitInfo() {
      return { set: {}, own: Object.fromEntries(s.members.map((m) => [m.id, { color: m.color }])) };
    },

    onJoin(m) {
      step();
      s.hostId = ctx.hostId();
      const r = addPlayer(s, { id: m.id, name: m.session.user.name });
      if (!r.ok) return fail(r);
      rearm();
      return null;
    },

    // 끊김·재접속: 끊긴 시각은 엔진이 적고, 60초 뒤 기권은 tick 이 한다(방에서 빼는 것은 Shell 유예).
    onAway(id) {
      step();
      setConnected(s, id, false, hub.now());
      rearm();
      return [];
    },
    onBack(id) {
      step();
      setConnected(s, id, true, hub.now());
      rearm();
      return [];
    },

    // 방을 떠난다(나가기·강퇴·유예 60초 지남): 판 도중 참가자는 기권(전적 games + 1)
    onLeave(id) {
      step();
      if (s.phase === 'playing' && s.seats.some((x) => x.id === id)) book(id, false);
      apply(leave(s, id, hub.now(), rnd));
      rearm();
      return [];
    },

    onHost(id) {
      s.hostId = id;
    },

    onEmpty() {
      ctx.clear('dl');
      s = fresh();
      booked = new Set();
    },
  };
}
