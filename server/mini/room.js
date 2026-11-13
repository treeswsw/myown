// 미니게임 게임 훅 (docs/mini/PLAN.md, docs/COMMON-CONTRACT.md 1-4). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·끊김 유예·강퇴·채팅·이모티콘·소리·faces·빈 방 지우기는 Shell 이 맡는다. 이 파일은 규칙 전달과 판 끝(코인)만.
// 규칙은 shared/mini 가 판정한다. 시간 제한 없음. 자리(seats)는 먼저 들어온 연결된 2명, 선(seat 0)은 crypto 난수로 정한다. 나머지는 관전.
import { GAMES, GAME_IDS } from '../../shared/mini/index.js';

export function makeMiniGame(ctx, opt = {}) {
  const err = (c, msg) => ctx.err(`mn_${c}`, msg);
  let phase = 'lobby'; // 'lobby' | 'play' | 'end'  (end = 결과 화면, 대기 상태)
  let setting = GAME_IDS.includes(opt.game) ? opt.game : 'gomoku'; // 방장이 고른 종목
  let played = setting; // 지금 판(또는 방금 끝난 판)의 종목
  let seats = [null, null];
  let names = [null, null];
  let mn = null; // 규칙 상태
  let result = null;

  // 판이 끝났다. 보드에서 이긴 때만(기권·나감·무승부 제외) 이긴 사람에게 코인 한 번.
  function finish(winner, reason) {
    phase = 'end';
    result = { winner, reason };
    if (reason === 'win' && (winner === 0 || winner === 1) && seats[winner]) {
      ctx.finish([{ id: seats[winner], won: true, opp: 1 }]);
    }
  }

  const ready = () => ctx.members().filter((m) => m.connected).slice(0, 2);

  function setSettings(byId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return err('bad');
    if (!Object.keys(patch).every((k) => k === 'game')) return err('bad');
    if (!GAME_IDS.includes(patch.game)) return err('game', '알 수 없는 게임입니다.');
    setting = patch.game;
    return null;
  }

  // 모든 {t:'mn'} 요청. 시작·종목·다시는 공용 {t:'start'}·{t:'set'} 이 맡는다(Shell).
  function onAction(session, msg) {
    const id = session.id;
    switch (msg.a) {
      case 'game': { // 옛 요청(호환): {t:'set', patch:{game}} 와 같다
        if (id !== ctx.hostId()) return err('host', '방장만 고를 수 있습니다.');
        if (phase === 'play') return err('now');
        const bad = setSettings(id, { game: msg.game });
        if (bad) return bad;
        ctx.push();
        return null;
      }
      case 'move': {
        if (phase !== 'play') return err('now');
        const seat = seats.indexOf(id);
        if (seat < 0) return err('seat', '관전 중입니다.');
        if (seat !== mn.turn) return err('turn', '당신 차례가 아닙니다.');
        const next = GAMES[played].apply(mn, msg.move);
        if (!next) return err('move', '둘 수 없는 곳입니다.');
        mn = next;
        if (next.winner !== null) finish(next.winner, next.winner === 'draw' ? 'draw' : 'win');
        ctx.push();
        return null;
      }
      case 'resign': {
        const seat = seats.indexOf(id);
        if (phase !== 'play' || seat < 0) return err('now');
        finish(1 - seat, 'resign');
        ctx.push();
        return null;
      }
      default: return err('bad');
    }
  }

  return {
    // 프로필 사진은 없다(faces 알림). 판은 모두에게 같다. 공통 칸(code·mode·hostId·you·now·wait·specs)은 Shell 이 덮는다.
    view(viewerId) {
      const turnId = phase === 'play' ? seats[mn.turn] : null;
      const turnMember = turnId ? ctx.member(turnId) : null;
      return {
        phase,
        game: phase === 'lobby' ? setting : played, // 판 그림은 지금 판의 종목, 대기실은 고른 종목
        seats: [...seats],
        names: [...names],
        mySeat: seats.indexOf(viewerId), // -1 = 관전
        players: ctx.members().map((m) => ({ id: m.id, spectating: phase !== 'lobby' && !seats.includes(m.id) })),
        turn: turnId,
        waiting: turnMember && !turnMember.connected ? turnMember.id : null,
        mn,
        result,
      };
    },
    phase: () => phase,
    isWaiting: () => phase !== 'play',

    canStart() {
      if (ready().length < 2) return err('need2', '2명이 필요합니다.');
      return null;
    },

    onStart() {
      const two = ready();
      if (ctx.rng() < 0.5) two.reverse();
      seats = two.map((m) => m.id);
      names = two.map((m) => m.session.user.name);
      played = setting;
      mn = GAMES[played].init();
      result = null;
      phase = 'play';
      ctx.emit([{ k: 'mnStart', game: played }]);
      return null;
    },

    setSettings,
    waitInfo: () => ({ set: { game: setting }, own: {} }),
    listExtra: () => ({ game: setting }),
    onAction,

    // 판 중 자리에 앉은 사람이 나가거나 끊김 60초가 지나면 기권(상대 승리, 코인 없음)
    onLeave(id) {
      const seat = seats.indexOf(id);
      if (phase === 'play' && seat >= 0) finish(1 - seat, 'leave');
      return [];
    },

    onEmpty() {
      phase = 'lobby';
      seats = [null, null];
      names = [null, null];
      mn = null;
      result = null;
    },
  };
}
