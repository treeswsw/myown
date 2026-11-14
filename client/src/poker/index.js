// 포커(텍사스 홀덤·블러핑 카드) 화면 모듈 (COMMON-CONTRACT 4-2, D7). 공통 방 틀(room/frame.js)이 mount(ctx) 로 부른다.
// 3D 테이블·핀·HUD·휠·블러핑 손패·특수 연출은 main.js 가 한 번 만들어 createPoker(parts) 로 넘긴다(이 파일은 그것으로 그리기만).
// 연출 줄(animator)은 여기서 이어 붙인다: 연출이 도는 동안 새 방 상태는 미뤘다가 끝나면 그린다(옛 main.js applyRoom 그대로).
// 대기실·채팅·사진·사운드 표시·나가기 확인은 틀이 한다. 머리 위 기본 이모티콘은 핀이 그린다(showEmote).
// 방 상태에는 사진이 없다: ctx.faces 의 사진을 players[].avatar 로 붙여 핀·결과 연출에 넘긴다.
// 대기 상태(phase lobby)가 와도 연출(챔피언·우승 배너 등)이 도는 동안은 테이블을 보여 주고(holdWait), 끝나면 ctx.ready() 로 틀이 결과·대기실을 다시 고르게 한다.
import { createAnimator } from '../anim/events.js';
import { sfx } from '../audio.js';

// 틀이 처리하는 공용 알림(연출 줄에 넣지 않는다)
const COMMON = new Set(['faces', 'chat', 'chatLog', 'joined', 'left', 'away', 'back', 'emote', 'pemote', 'snd', 'sndAdd', 'sndList', 'sndDel', 'sndRename']);

let shared = null; // createPoker 가 만든 화면 하나(테이블은 사이트에 하나뿐)

/**
 * main.js 가 한 번 부른다. parts = {ui, stage, table, pins, hud, cluster, wheel, bluff, special, scenedim, send}
 * -> { flush(), busy(), leave() }  (로그아웃·초기화·탭 복귀 때 연출 비우기, HUD 의 나가기 버튼)
 */
export function createPoker(parts) {
  const { ui, stage, table, pins, hud, cluster, wheel, bluff, special, scenedim, send } = parts;
  let active = null; // 지금 그리는 방의 mount ctx
  let raw = null; // 마지막으로 받은 방 상태(서버 그대로)
  let latest = null; // 그것에 사진을 붙인 것
  let shown = null; // 화면이 지금 보여 주는 상태
  let wasMyTurn = false;
  let emphasized = false; // showdown emphasis is on screen

  const withFaces = (s) => ({ ...s, players: (s.players ?? []).map((p) => ({ ...p, avatar: active?.faces.get(p.id).avatar ?? p.avatar ?? null })) });

  function clear() {
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.clearDead(); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
    emphasized = false;
    shown = null;
    latest = null;
    raw = null;
  }

  // 옛 main.js applyRoom 의 포커 본문(로비·채팅 부분은 틀이 맡는다)
  function paint(room) {
    shown = room;
    const me = room.players.find((p) => p.id === room.you);
    const playing = room.phase !== 'lobby';
    const live = room.phase === 'playing';
    const holdem = room.mode === 'holdem';
    const myTurn = live && room.turn === room.you && Boolean(me) && !me.spectating;
    if (!room.result && emphasized) { emphasized = false; pins.emphasize(null); pins.clearHands(); table.highlight(null); cluster.highlight(null); }
    if (room.result) emphasized = true;
    const inLobby = room.phase === 'lobby';
    table.sync(room);
    pins.render(room);
    pins.setVisible(!inLobby);
    hud.update(inLobby ? null : room);
    cluster.update(room, holdem && playing && Boolean(me) && !me.spectating);
    wheel.update(room, me, holdem && myTurn && !me.folded && !animator.busy());
    bluff.update(room, !holdem && playing && Boolean(me) && me.alive !== false && !me.spectating, myTurn && !animator.busy());
    if (myTurn && !wasMyTurn) sfx.turn();
    wasMyTurn = myTurn;
  }

  const animator = createAnimator({
    ui, stage, table, pins, cluster, special,
    getRoom: () => latest ?? shown,
    setHandAway: (on) => bluff.setAway(on),
    setDim: (on) => scenedim.classList.toggle('on', on),
    applyPartial: (fn) => { if (shown && active) paint(fn(shown)); },
    onIdle: () => {
      if (!active || !latest) return;
      paint(latest);
      if (latest.wait) active.ready(); // 연출이 끝났다: 틀이 다시 고른다(이제 holdWait 가 false 라 결과·대기실)
    },
  });

  shared = {
    attach(ctx) { active = ctx; clear(); },
    detach(ctx) {
      if (active !== ctx) return;
      animator.flush();
      special.skipAll();
      clear();
      active = null;
    },
    room(s) {
      raw = s;
      latest = withFaces(s);
      if (!animator.busy()) paint(latest);
    },
    refaced() {
      if (!raw) return;
      latest = withFaces(raw);
      if (!animator.busy()) paint(latest);
    },
    event(e) {
      wheel.update(null, null, false);
      animator.push(e);
    },
    emote: (id, i) => pins.emote(id, i),
    anchor: (id) => pins.anchor(id),
    busy: () => animator.busy(),
  };

  return {
    flush: () => animator.flush(),
    busy: () => animator.busy(),
    // HUD 의 나가기(메뉴·안내 줄): 방 안이면 틀의 나가기(게임 중이면 확인 창)
    leave() { if (active) active.leave(); else send({ t: 'leave' }); },
  };
}

// 게임 중 나가기 확인 창 글. 관전·탈락·폴드·결과는 null(틀이 글 없는 확인 창을 띄운다), 대기실은 틀이 확인 없이 내보낸다.
export function leaveNote(s) {
  if (!s || s.phase !== 'playing') return null;
  const me = s.players?.find((p) => p.id === s.you);
  if (!me || me.spectating) return null;
  if (s.mode === 'holdem') return me.folded ? null : '나가면 이번 판은 폴드돼요. 이미 건 칩은 돌아오지 않아요';
  return me.alive !== false ? '나가면 이번 게임에서 탈락해요' : null;
}

export function mount(ctx) {
  if (!shared) throw new Error('poker: createPoker 가 먼저 불려야 합니다');
  const P = shared;
  P.attach(ctx);
  const offFaces = ctx.faces.onChange(() => P.refaced()); // 사진·꾸미기가 새로 왔다

  return {
    room: (s) => P.room(s),
    event(e) {
      if (!e || COMMON.has(e.k)) return;
      P.event(e);
    },
    showEmote(id, i) { P.emote(id, i); return true; },
    anchorOf: (id) => P.anchor(id),
    holdWait: () => P.busy(),
    leaveNote,
    unmount() {
      offFaces();
      P.detach(ctx);
    },
  };
}
