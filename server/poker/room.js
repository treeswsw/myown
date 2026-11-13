// 포커(텍사스 홀덤·블러핑 카드) 게임 훅 (docs/COMMON-CONTRACT.md 1-4, D7). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·강퇴·끊김 유예·채팅·이모티콘·소리·faces·빈 방 지우기는 Shell 이 맡는다. 이 파일은 규칙(shared/holdem.js·bluff.js)과 칩·전적·코인만.
// 약속: 섞기·판정은 서버(hub.rng = crypto), 남의 손패는 보내지 않는다, 끊긴 사람은 유예가 끝날 때 차례면 자동 행동,
// 판 끝 저장은 사람마다 한 번. 방 상태에는 프로필 사진을 넣지 않는다(faces 알림).
// 홀덤은 판이 테이블에서 이어진다(결과 → 다음 판). 처음 시작 전·챔피언·블러핑 판 끝(결과 뒤)은 대기(lobby) = 공통 대기실.
import { describe } from '../../shared/handeval.js';
import * as holdem from '../../shared/holdem.js';
import * as bluff from '../../shared/bluff.js';

const GAME_NAME = { holdem: '텍사스 홀덤', bluff: '블러핑 카드' };

// {t:'mode'}: 방 안 홀덤↔블러핑 전환은 없어졌다(COMMON-CONTRACT 7-3). 한 배포 동안 받아서 안내만 하고, 묶음 3 청소 때 지운다.
const OTHER_GAME = { liar: '라이어게임은 ', yacht: '요트다이스는 ', gsk: '갱스껄은 ' };
export const pokerModeMsg = (msg) => ({ msg: `${OTHER_GAME[msg.mode] ?? ''}방을 새로 만들어 주세요.`, code: 'pk_mode' });

/** makePoker('holdem'|'bluff') -> make(ctx) : 게임 훅 객체 */
export function makePoker(mode) {
  return (ctx) => createPoker(ctx, mode);
}

function createPoker(ctx, mode) {
  const { hub } = ctx;
  const err = (c, msg) => ctx.err(`pk_${c}`, msg);
  let phase = 'lobby';
  let hand = null; // holdem: { st, users: Map id -> user, start: Map id -> chips at hand start }
  let game = null; // bluff: { g, users }
  let result = null;
  let lastDealer = null;
  let leaving = null; // onLeave 중인 사람(멤버 목록에는 아직 있다)
  const inHand = new Set(); // 이번 판에 앉은 사람

  const present = () => ctx.members().filter((m) => m.id !== leaving);

  // ---- holdem ----

  function startHoldem() {
    // Everything the account owns is the stack. Busted (0 chips) and disconnected players sit out.
    const seated = present().filter((m) => m.connected && m.session.user.bank > 0);
    if (seated.length < 2) return toLobby();
    const at = seated.findIndex((m) => m.id === lastDealer);
    const dealer = (at + 1) % seated.length;
    const { st, events } = holdem.startHand(
      seated.map((m) => ({ id: m.id, stack: m.session.user.bank })), dealer, hub.rng,
    );
    lastDealer = seated[dealer].id;
    // user.bank keeps the pre-hand amount; only the difference is applied (settleSeat), so chips
    // are conserved even when a leaver's refund arrives after they joined another room.
    hand = {
      st, users: new Map(seated.map((m) => [m.id, m.session.user])),
      start: new Map(seated.map((m) => [m.id, m.session.user.bank])),
    };
    inHand.clear();
    for (const m of seated) inHand.add(m.id);
    phase = 'playing';
    result = null;
    return afterHoldem(events);
  }

  // 판이 끝났으면 정산. 이벤트를 돌려준다(push 는 부른 쪽이 한 번).
  function afterHoldem(events) {
    if (hand.st.phase === 'done') endHand(events);
    return events;
  }

  function holdemAct(id, a, amount) {
    if (mode !== 'holdem' || phase !== 'playing') return { error: err('now', '지금은 할 수 없습니다.') };
    const r = holdem.act(hand.st, id, a, amount);
    if (!r.ok) return { error: err('rule', r.error) };
    return { events: afterHoldem(r.events) };
  }

  // 칩 차이만 반영한다. 저장은 하지 않는다(부른 쪽이 한 번).
  function settleSeat(seat, user) {
    user.bank += seat.stack - hand.start.get(seat.id);
    hand.start.set(seat.id, seat.stack);
  }

  // Only the chip difference is applied, and always to the account that is live now (the object
  // captured at hand start may be stale after a re-login). Nobody logged in: the stored row gets
  // the difference (re-checking for a login meanwhile), never a saved stale copy. 저장은 한 번.
  function settleLive(seat, stats) {
    const live = hub.sessions.get(seat.id)?.user;
    if (live) {
      settleSeat(seat, live);
      if (stats) stats(live);
      hub.persist(live);
      return;
    }
    const delta = seat.stack - hand.start.get(seat.id);
    hand.start.set(seat.id, seat.stack);
    if (delta === 0) return;
    const epoch = hub.epoch;
    hub.store.getOrCreate(seat.id).then((row) => {
      if (epoch !== hub.epoch) return; // account wipe meanwhile
      if (!row) return; // account is gone
      hub.userEpoch.set(row, epoch);
      const target = hub.sessions.get(seat.id)?.user ?? row;
      target.bank += delta;
      hub.persist(target);
    }).catch((e) => console.error('settle failed', e));
  }

  function endHand(events) {
    const { st } = hand;
    const res = st.result;
    for (const seat of st.seats) {
      const w = res.winners.find((x) => x.id === seat.id);
      settleLive(seat, (user) => {
        user.stats.hands++;
        if (w) {
          user.stats.wins++;
          user.stats.biggestWin = Math.max(user.stats.biggestWin, w.amount);
        }
      });
      const session = hub.sessions.get(seat.id);
      if (session) hub.sendMe(session);
    }
    result = { winners: res.winners, shown: res.shown, busted: res.busted };
    events.push({ k: 'win', winners: res.winners, pot: res.pot });
    const by = res.winners.reduce((best, w) => (w.amount > best.amount ? w : best)).id;
    for (const id of res.busted) events.push({ k: 'bust', id, by });
    phase = 'result';
    const runout = events.filter((ev) => ev.k === 'street').length;
    const t = hub.timing;
    const wait = (Object.keys(res.shown).length ? t.result : t.resultFold) + runout * t.street +
      (res.winners.length - 1) * t.tieExtra +
      (res.busted.length ? t.bustExtra : 0);
    const busted = res.busted.length > 0;
    ctx.timer('next', wait, () => ctx.push(afterResult(busted)));
  }

  // After the result display: next hand, or the room's champion when a bust left one player with chips.
  function afterResult(busted) {
    const withChips = present().filter((m) => m.session.user.bank > 0);
    if (busted && withChips.length === 1) return toLobby([{ k: 'champion', id: withChips[0].id }]);
    return startHoldem();
  }

  // ---- bluff ----

  function startBluff() {
    const players = present().filter((m) => m.connected);
    const { game: g, events } = bluff.createGame(players.map((m) => m.id), hub.rng);
    game = { g, users: new Map(players.map((m) => [m.id, m.session.user])) };
    inHand.clear();
    for (const m of players) inHand.add(m.id);
    phase = 'playing';
    result = null;
    return afterBluff(events);
  }

  function bluffMove(id, fn) {
    if (mode !== 'bluff' || phase !== 'playing') return { error: err('now', '지금은 할 수 없습니다.') };
    const r = fn(game.g);
    if (!r.ok) return { error: err('rule', r.error) };
    return { events: afterBluff(r.events) };
  }

  function afterBluff(events) {
    const { g, users } = game;
    if (g.phase === 'reveal') {
      ctx.timer('next', hub.timing.reveal, () => ctx.push(afterBluff(bluff.nextRound(g).events)));
    } else if (g.phase === 'done' && phase === 'playing') {
      const rows = [];
      const here = new Set(present().map((m) => m.id));
      for (const id of users.keys()) {
        const session = hub.sessions.get(id);
        const user = session?.user; // always the live account (the one captured at start may be stale)
        if (here.has(id)) rows.push({ id, won: id === g.winner, opp: users.size - 1 });
        if (!user) continue;
        user.stats.bluffGames++;
        if (id === g.winner) user.stats.bluffWins++;
        hub.persist(user);
        hub.sendMe(session);
      }
      if (rows.length >= 2) ctx.finish(rows); // a lone survivor of leavers gets nothing
      phase = 'result';
      ctx.timer('next', hub.timing.bluffResult, () => ctx.push(toLobby()));
    }
    return events;
  }

  function toLobby(events = []) {
    ctx.clear('next');
    phase = 'lobby';
    hand = null;
    game = null;
    result = null;
    inHand.clear();
    return events;
  }

  // ---- turns: no time limit for connected players; only a disconnected one is auto-played ----

  function turnId() {
    if (phase !== 'playing') return null;
    if (hand) {
      const { st } = hand;
      return st.turn >= 0 ? st.seats[st.turn].id : null;
    }
    const g = game.g;
    return g.phase === 'playing' ? g.players[g.turn].id : null;
  }

  // Check (or fold) / the bluff default for the player on turn.
  function autoAct() {
    const id = turnId();
    if (id === null) return [];
    if (hand) return holdemAct(id, holdem.options(hand.st, id).canCheck ? 'check' : 'fold').events ?? [];
    const a = bluff.timeoutAction(game.g);
    return bluffMove(id, (g) => (a.t === 'play' ? bluff.play(g, id, a.cards) : bluff.liar(g, id))).events ?? [];
  }

  // ---- output ----

  const spectating = (id) => phase !== 'lobby' && !inHand.has(id);

  function holdemView(viewerId) {
    const st = hand?.st;
    const seatOf = (id) => st?.seats.find((s) => s.id === id);
    const players = ctx.members().map((m, i) => {
      const seat = seatOf(m.id);
      const shown = result?.shown[m.id];
      return {
        id: m.id, name: m.session.user.name, seat: i, connected: m.connected, spectating: spectating(m.id),
        stack: seat ? seat.stack : m.session.user.bank,
        eliminated: m.session.user.bank <= 0,
        bet: seat && st.phase === 'betting' ? seat.bet : 0,
        folded: seat?.folded ?? false,
        allin: seat?.allin ?? false,
        isDealer: !!seat && st.seats[st.dealer].id === m.id,
        cards: m.id === viewerId ? (seat?.cards ?? null) : (shown ?? null),
      };
    });
    const mine = seatOf(viewerId);
    const o = st ? holdem.options(st, viewerId) : null;
    // While betting, pots only hold collected chips; the current street's bets stay in front of the players.
    const betting = st?.phase === 'betting';
    const collected = st ? st.seats.map((s) => ({ ...s, total: betting ? s.total - s.bet : s.total })) : [];
    const { pots, refund } = holdem.buildPots(collected);
    return {
      players,
      board: st ? [...st.board] : [],
      pot: st ? holdem.totalPot({ seats: collected }) : 0,
      pots: refund && !betting ? [...pots, { amount: refund.amount, eligible: [refund.id] }] : pots,
      street: st?.street ?? 0,
      toCall: o?.toCall ?? 0,
      minRaiseTo: o?.minRaiseTo ?? 0,
      maxRaiseTo: o?.maxRaiseTo ?? 0,
      myCards: mine ? [...mine.cards] : null,
      myBest: mine ? describe([...mine.cards, ...st.board]) : null,
      result,
    };
  }

  function bluffView(viewerId) {
    const g = game?.g;
    const players = ctx.members().map((m, i) => {
      const p = g?.players.find((x) => x.id === m.id);
      return {
        id: m.id, name: m.session.user.name, seat: i, connected: m.connected, spectating: spectating(m.id),
        alive: p?.alive ?? false,
        handCount: p?.hand.length ?? 0,
        shots: p?.shots ?? 0,
      };
    });
    const me = g?.players.find((x) => x.id === viewerId);
    return {
      players,
      tableRank: g?.tableRank ?? null,
      round: g?.round ?? 0,
      myHand: me ? [...me.hand] : [],
      lastPlay: g?.pile ? { by: g.pile.by, count: g.pile.cards.length } : null,
      reveal: g?.reveal ?? null,
      winnerId: g?.winner ?? null,
    };
  }

  const done = (r) => {
    if (r.error) return r.error;
    ctx.push(r.events);
    return null;
  };

  return {
    // 공통 칸(code·mode·hostId·you·now·phase·wait·specs)은 Shell 이 덮는다. 사진 없음(faces).
    view(viewerId) {
      const base = { turn: turnId(), turnEndsAt: null };
      return { ...base, ...(mode === 'holdem' ? holdemView(viewerId) : bluffView(viewerId)) };
    },
    phase: () => phase,
    isWaiting: () => phase === 'lobby',

    canStart() {
      const ready = ctx.members().filter((m) => m.connected && (mode === 'bluff' || m.session.user.bank > 0));
      if (ready.length < 2) return err('need2', mode === 'bluff' ? '2명 이상 필요합니다.' : '칩이 있는 사람이 2명 이상 필요합니다.');
      return null;
    },

    // Shell 이 방장·대기·canStart 를 먼저 보고, 성공하면 push 한다. 시작 이벤트는 여기서 보낸다.
    onStart() {
      const events = mode === 'holdem' ? startHoldem() : startBluff();
      ctx.emit(events);
      return null;
    },

    onAction(session, msg) {
      const id = session.id;
      if (msg.t === 'act') return done(holdemAct(id, msg.a, msg.amount));
      if (msg.t === 'play') return done(bluffMove(id, (g) => bluff.play(g, id, msg.cards)));
      if (msg.t === 'liar') return done(bluffMove(id, (g) => bluff.liar(g, id)));
      return err('bad', '알 수 없는 요청입니다.');
    },

    // 방을 떠난다(나가기·강퇴·유예 60초 지남). 유예가 끝난 사람이 차례면 먼저 자동 행동, 그다음 폴드/탈락.
    onLeave(id, reason) {
      const events = [];
      if (reason === 'away' && turnId() === id) events.push(...autoAct());
      leaving = id;
      try {
        if (hand && phase === 'playing' && inHand.has(id)) {
          const fold = holdem.forceFold(hand.st, id).events;
          // A leaver folds: committed chips stay in the pot, the rest goes home now. Only an
          // uncalled-bet refund can still arrive later (see settleSeat).
          const seat = hand.st.seats.find((x) => x.id === id);
          settleLive(seat);
          seat.stack = 0;
          hand.start.set(id, 0);
          events.push(...afterHoldem(fold));
        }
        if (game && phase === 'playing') events.push(...afterBluff(bluff.removePlayer(game.g, id).events));
      } finally {
        leaving = null;
      }
      return events;
    },

    onEmpty() {
      toLobby();
      inHand.clear();
    },

    // ---- 관리자 봇의 skip (server/admin/games/{holdem,bluff}.js) ----
    get mode() { return mode; },
    get name() { return GAME_NAME[mode]; },
    // 홀덤 결과 표시를 지금 끝낸다(다음 판 또는 챔피언 대기실)
    skipResult() {
      if (mode !== 'holdem' || phase !== 'result') return false;
      const busted = (result?.busted?.length ?? 0) > 0;
      ctx.clear('next');
      hub.guard(() => ctx.push(afterResult(busted)))();
      return true;
    },
    // 블러핑: 벌칙 표시 뒤 다음 라운드 / 우승 표시 뒤 대기실을 지금
    skipBluff() {
      if (mode !== 'bluff' || !game) return false;
      if (phase === 'playing' && game.g.phase === 'reveal') {
        ctx.clear('next');
        ctx.push(afterBluff(bluff.nextRound(game.g).events));
        return true;
      }
      if (phase === 'result') {
        ctx.push(toLobby());
        return true;
      }
      return false;
    },
    // 시험용(판 상태를 직접 본다)
    turnId,
    settleLive,
    afterBluff: (events) => ctx.push(afterBluff(events)),
    get hand() { return hand; },
    get game() { return game; },
    get result() { return result; },
  };
}
