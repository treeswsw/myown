// 훅(docs/COMMON-CONTRACT.md 1-4)을 전부 쓰는 가짜 게임. test/room/shell.test.js 가 Shell 을 이것으로 시험한다.
// 봉투는 'yt' 를 빌려 쓴다(protocol 이 아는 글자여야 허브를 통과한다). 오류 접두사 dm_.
// opt: { chatOwn: true }  -> chatOwn/chatLogFor 사용
//      { block: {on} }    -> block.on 이면 mediaBlocked 가 막는다(시험이 켜고 끈다)
//      { mute: Set(ids) } -> chatCheck 가 그 사람 글을 막는다
import { createRoomShell } from '../../server/room/shell.js';

export function makeDummy(ctx, opt = {}) {
  const calls = []; // [hook, ...args] 부른 순서
  let phase = 'lobby';
  const set = { speed: 1 };
  const own = {}; // id -> {color}
  const ownLog = [];
  let ticks = 0;

  const game = {
    calls,
    get ticks() { return ticks; },
    view: (id) => ({
      players: ctx.members().map((m) => ({ id: m.id, color: own[m.id]?.color ?? null })),
      secret: id === ctx.hostId() ? 'host-only' : null,
    }),
    phase: () => phase,
    isWaiting: () => phase !== 'play',
    canStart: () => (ctx.members().filter((m) => m.connected).length < 2 ? ctx.err('dm_need2', '2명이 필요합니다.') : null),
    onStart(by) {
      calls.push(['start', by]);
      phase = 'play';
      return null;
    },
    onAction(session, msg) {
      switch (msg.a) {
        case 'end': // 판 끝: 코인 한 번 + 결과(대기 상태)
          if (phase !== 'play') return ctx.err('dm_now');
          phase = 'end';
          ctx.finish(ctx.members().map((m) => ({ id: m.id, won: m.id === session.id, opp: ctx.members().length - 1 })));
          ctx.push([{ k: 'over', by: session.id }]);
          return null;
        case 'finishAgain':
          ctx.finish([{ id: session.id, won: true, opp: 1 }]);
          return null;
        case 'drop':
          ctx.drop(msg.id, 'away');
          return null;
        case 'ping':
          ctx.emit([{ k: 'pong' }], [session.id]);
          ctx.sendTo(session.id, { t: 'dmRaw' });
          ctx.pushTo([session.id]);
          return null;
        case 'tick':
          ctx.timer('t', 1000, () => { ticks++; });
          return null;
        default:
          return ctx.err('dm_bad', '모르는 요청');
      }
    },
    setSettings(by, patch) {
      if (![1, 2, 3].includes(patch.speed)) return ctx.err('dm_val', '잘못된 값입니다.');
      set.speed = patch.speed;
      calls.push(['set', by, patch.speed]);
      return null;
    },
    pick(id, patch) {
      if (!['red', 'blue'].includes(patch.color)) return ctx.err('dm_val', '잘못된 값입니다.');
      if (Object.entries(own).some(([k, v]) => k !== id && v.color === patch.color)) return ctx.err('dm_taken', '이미 고른 색입니다.');
      own[id] = { color: patch.color };
      return null;
    },
    waitInfo: () => ({ set: { ...set }, own: structuredClone(own) }),
    onJoin(m) {
      calls.push(['join', m.id]);
      return m.id.startsWith('no') ? ctx.err('dm_bad', '들어올 수 없습니다.') : null;
    },
    onAway(id) { calls.push(['away', id]); return [{ k: 'dmAway', id }]; },
    onBack(id) { calls.push(['back', id]); return [{ k: 'dmBack', id }]; },
    onLeave(id, reason) {
      calls.push(['leave', id, reason, !!ctx.member(id)]);
      delete own[id];
      return [{ k: 'dmLeft', id }];
    },
    onHost(id) { calls.push(['host', id]); },
    onEmpty() { calls.push(['empty']); phase = 'lobby'; },
    chatCheck: (session) => (opt.mute?.has(session.id) ? ctx.err('dm_mute', '지금은 글을 쓸 수 없습니다.') : null),
    chatKind: () => 'talk',
    mediaBlocked: (session, kind) => (opt.block?.on ? ctx.err('dm_media', `${kind} 막힘`) : null),
    extrasFor: (session) => [{ k: 'dmSync', id: session.id }],
    flush() { calls.push(['flush']); },
    listExtra: () => ({ game: 'dummy' }),
  };
  if (opt.chatOwn) {
    game.chatOwn = (session, text) => {
      const item = { id: session.id, name: session.user.name, text, own: true };
      ownLog.push(item);
      ctx.emit([{ k: 'chat', ...item }]);
      return null;
    };
    game.chatLogFor = (id) => ownLog.filter((x) => x.id === id);
  }
  return game;
}

export const DUMMY_ENTRY = {
  mode: 'dummy', name: '가짜', desc: '', about: '', min: 2, max: 3, flag: null, msgs: ['yt'], err: 'dm_', css: null,
  coin: 'bluff', chat: { maxLen: 20, log: 3 }, settings: [], own: [], make: makeDummy, bot: false,
};

// 허브에 가짜 방 하나를 넣는다. 사람은 {t:'join', code} 로 들어온다.
export function addDummyRoom(hub, opt = {}, code = 'DUMY') {
  const room = createRoomShell(hub, code, DUMMY_ENTRY, opt);
  hub.rooms.set(code, room);
  return room;
}
