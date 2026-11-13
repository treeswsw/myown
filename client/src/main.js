import './style.css';
import * as THREE from 'three';
import { createStage } from './scene/stage.js';
import { createTable } from './scene/table.js';
import { createPins } from './ui/pins.js';
import { createHud } from './ui/hud.js';
import { createCluster } from './ui/cluster.js';
import { createWheel } from './ui/wheel.js';
import { createBluff } from './ui/bluff.js';
import { createLobby } from './ui/lobby.js';
import { createChat } from './ui/chat.js';
import { createEmotePanel } from './ui/emotePanel.js';
import { h, updateScale, view } from './ui/dom.js';
import { createAnimator } from './anim/events.js';
import { createSpecialFX } from './anim/special/index.js';
import { connect, send, useTransport } from './net.js';
import { state, saved } from './state.js';
import { sfx } from './audio.js';
import { TY } from './scene/room.js';

document.body.append(h('div', 'buildtag', `v${__BUILD__}`));

const ui = document.getElementById('ui');
updateScale();
addEventListener('resize', updateScale);

await Promise.all(['700 30px "Libre Baskerville"', '30px Bangers', '30px "Black Han Sans"', '700 30px "Noto Sans KR"']
  .map((f) => document.fonts.load(f, 'K9레이즈♠').catch(() => {})));

const stage = createStage(document.getElementById('cv'));

/* liar game: loaded on first use (separate chunk, so poker-only players never download it) */
let liar = null;
let liarQ = Promise.resolve(); // keeps liar calls in message order while the module loads
const withLiar = (fn) => { liarQ = liarQ.then(async () => { if (liar) fn(liar); }).catch((e) => console.error(e)); };
const inLiar = () => state.room?.mode === 'liar';
const liarAnchor = (id) => (liar && inLiar() ? liar.anchorOf(id) : null);

const table = createTable(stage);
table.reset();
const scenedim = h('div', 'scenedim');
ui.append(h('div', 'vig'), scenedim);
const pins = createPins(ui, stage, table);
const emotePanel = createEmotePanel({
  onEmote: (i) => send({ t: 'emote', e: i }),
  onPhoto: (data) => send({ t: 'pemote', data }),
  onSoundAdd: (s) => send({ t: 'sndAdd', ...s }),
  onSound: (sid) => send({ t: 'snd', sid }),
  onSoundDelete: (sid) => send({ t: 'sndDel', sid }),
  onSoundRename: (sid, name) => send({ t: 'sndRename', sid, name }),
  getName: (id) => state.room?.players.find((p) => p.id === id)?.name ?? '',
  isHost: () => state.room?.hostId === state.room?.you,
  getAnchor: (id) => (inLiar() ? liarAnchor(id) : pins.anchor(id)),
  getSelf: () => state.me?.id ?? null,
  onClose: () => { hud.closePanel(); closeLiarPanel(); },
});
const hud = createHud(ui, { send, getMe: () => state.me, emotePanel });
const cluster = createCluster(ui);
const wheel = createWheel(ui, send);
const bluff = createBluff(ui, send);

const chat = createChat({
  onSend: (text) => send(liar && inLiar() ? liar.chatMsg(text) : { t: 'chat', text }),
  getAnchor: (id) => (inLiar() ? liarAnchor(id) : pins.anchor(id)),
});
document.body.append(chat.el, chat.button);
chat.button.hidden = true;

let pendingAvatar = null;
let loginId = null; // remembered only once the server accepts it (the reserved reset ID is never accepted)
const lobby = createLobby({
  onLogin: (id, avatar) => { pendingAvatar = avatar; loginId = id; send({ t: 'login', id }); },
  onResetConfirm: () => send({ t: 'reset', confirm: true }),
  onAvatar: (data) => send({ t: 'avatar', data }),
  onCreate: (mode) => send({ t: 'create', mode }),
  onJoin: (code) => send({ t: 'join', code }),
  onMode: (mode) => send({ t: 'mode', mode }),
  onStart: () => send({ t: 'start' }),
  onLeave: () => send({ t: 'leave' }),
  onLogout: () => { saved.del('gs.lastId'); location.reload(); },
  onRank: () => send({ t: 'lg', a: 'rank' }),
});
document.body.append(lobby.el);

const toast = (msg) => {
  const t = h('div', 'toast', msg);
  ui.append(t);
  setTimeout(() => t.remove(), 3000);
};

/* liar room top bar (global classes, style.css): room code / emote / start / leave */
let liarPanel = null;
const closeLiarPanel = () => { liarPanel?.remove(); liarPanel = null; };
const lgBtn = (cls, text, onclick) => { const b = h('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };
const lgCode = h('span', 'lgbar-code');
const lgEmote = lgBtn('lgbar-btn', '이모티콘', () => {
  if (liarPanel) { closeLiarPanel(); return; }
  liarPanel = h('div', 'hpanel lgpanel', emotePanel.el);
  ui.append(liarPanel);
});
const lgStart = lgBtn('lgbar-btn main', '시작', () => send({ t: 'start' }));
const lgBar = h('div', 'lgbar', lgCode, h('span', 'lgbar-sp'), lgEmote, lgStart, lgBtn('lgbar-btn', '나가기', () => send({ t: 'leave' })));
lgBar.hidden = true;
ui.append(lgBar);
document.addEventListener('pointerdown', (e) => { if (liarPanel && !liarPanel.contains(e.target) && !lgEmote.contains(e.target)) closeLiarPanel(); });

/* special animations: the host supplies seat geometry and the camera shake */
const seatInfo = (id) => {
  const head = table.head(id);
  const cam = stage.camera;
  const depth = head.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3()));
  const perPx = (2 * depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / stage.size.h;
  return { head, headRadius: 38 * view.k * perPx, chips: table.stackPos(id), tableCenter: new THREE.Vector3(0, TY, 0), feltY: TY };
};
// The special-fx module asks for sounds by name.
const SFX_NAMES = { whoosh: 'card', spin: 'chip', click: 'click', shot: 'shot', thud: 'thud' };
const playSfx = (name) => sfx[SFX_NAMES[name]]?.();
const special = createSpecialFX({ scene: stage.scene, camera: stage.camera, getSeat: seatInfo, shake: (strength, ms) => stage.shake(0.05 * strength, ms), sfx: playSfx });

/* applying server state to the screen */
let shown = null; // what the screen currently reflects
let wasMyTurn = false;
let emphasized = false; // showdown emphasis is on screen
let liarShown = false; // the screen currently shows a liar room (poker parts are cleared)
function applyLiarRoom(room) {
  shown = room;
  if (!liarShown) {
    liarShown = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
  }
  lobby.hide();
  lgBar.hidden = false;
  lgCode.textContent = `방 코드 ${room.code}`;
  lgStart.hidden = room.hostId !== room.you || room.phase !== 'lobby';
  chat.setEnabled(true);
  chat.setMode(room.phase === 'lobby' ? 'lobby' : 'liar');
  if (!liar) {
    liarQ = liarQ.then(async () => {
      if (liar) return; // reconnects can queue several mounts: check again inside the queue
      const { mountLiar } = await import('./liar/index.js');
      liar = mountLiar({ ui, stage, send, getMe: () => state.me, chat, toast, emotePanel });
    }).catch((e) => console.error(e));
  }
  withLiar((l) => l.applyRoom(state.room));
}
function applyRoom(room) {
  if (room?.mode === 'liar') { applyLiarRoom(room); return; }
  if (liarShown) {
    liarShown = false;
    lgBar.hidden = true;
    closeLiarPanel();
    withLiar((l) => l.applyRoom(null));
  }
  shown = room;
  if (!room) {
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null); emotePanel.clearRoom(); chat.close(); chat.setEnabled(false); chat.button.hidden = true;
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    lobby.setRoom(null); lobby.show();
    return;
  }
  const me = room.players.find((p) => p.id === room.you);
  const playing = room.phase !== 'lobby';
  const live = room.phase === 'playing';
  const holdem = room.mode === 'holdem';
  const myTurn = live && room.turn === room.you && Boolean(me) && !me.spectating;
  if (!room.result && emphasized) { emphasized = false; pins.emphasize(null); pins.clearHands(); table.highlight(null); cluster.highlight(null); }
  if (room.result) emphasized = true;
  const inLobby = room.phase === 'lobby';
  chat.setEnabled(true);
  chat.button.hidden = false;
  chat.setMode(inLobby ? 'lobby' : 'game');
  table.sync(room);
  pins.render(room);
  pins.setVisible(!inLobby);
  hud.update(inLobby ? null : room);
  cluster.update(room, holdem && playing && Boolean(me) && !me.spectating);
  wheel.update(room, me, holdem && myTurn && !me.folded && !animator.busy());
  bluff.update(room, !holdem && playing && Boolean(me) && me.alive !== false && !me.spectating, myTurn && !animator.busy());
  if (myTurn && !wasMyTurn) sfx.turn();
  wasMyTurn = myTurn;
  if (playing) lobby.hide(); else { lobby.setRoom(room); lobby.show(); }
}

const animator = createAnimator({
  ui, stage, table, pins, cluster, special,
  getRoom: () => state.room ?? shown,
  setHandAway: (on) => bluff.setAway(on),
  setDim: (on) => scenedim.classList.toggle('on', on),
  applyPartial: (fn) => { if (shown) applyRoom(fn(shown)); },
  onIdle: () => applyRoom(state.room),
});

function handle(msg) {
  switch (msg.t) {
    case 'me':
      if (loginId) { saved.set('gs.lastId', loginId); loginId = null; }
      state.me = msg.user;
      lobby.setUser(msg.user);
      lobby.setLiar(msg.liar === 'on' || (msg.liar === 'test' && new URLSearchParams(location.search).get('liar') === '1'));
      if (pendingAvatar && !msg.user.avatar) send({ t: 'avatar', data: pendingAvatar });
      pendingAvatar = null;
      break;
    case 'room':
      // One room's chat log must never show in another (the server resends chatLog on join).
      if (msg.state?.code !== state.room?.code) { chat.setLog([]); emotePanel.clearRoom(); }
      state.room = msg.state;
      if (msg.state?.mode === 'liar' && !liarShown) { animator.flush(); special.skipAll(); }
      if (msg.state?.mode === 'liar' || !animator.busy()) applyRoom(msg.state);
      break;
    case 'resetAsk': loginId = null; lobby.showResetConfirm(); break;
    case 'resetDone':
      // Everything was wiped: drop the remembered ID and any local room state, then show the login screen.
      saved.del('gs.lastId');
      animator.flush();
      special.skipAll();
      state.me = null;
      state.room = null;
      emotePanel.clearRoom();
      chat.setLog([]);
      applyRoom(null);
      lobby.setUser(null);
      lobby.showNotice('초기화되었습니다');
      break;
    case 'rooms': lobby.setRooms(msg.list); break;
    case 'lgRank':
      if (liar && inLiar()) withLiar((l) => l.handleEvent({ k: 'lgRank', top: msg.top, mine: msg.mine }));
      else lobby.showRank({ top: msg.top, mine: msg.mine });
      break;
    case 'event':
      if (inLiar()) { // liar rooms never use the poker animator
        const e = msg.e;
        if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        else if (e.k === 'chat') { chat.push(e, { mine: e.id === state.room?.you, bubble: !(e.kind === 'say' || e.kind === 'plea') }); withLiar((l) => l.handleEvent(e)); }
        else if (e.k === 'chatLog') { chat.setLog(e.items, state.room?.you); withLiar((l) => l.handleEvent(e)); }
        else withLiar((l) => l.handleEvent(e)); // includes emote
        break;
      }
      // Emotes and chat are not choreography: they bypass the queue so animations never delay them.
      if (msg.e.k === 'emote') pins.emote(msg.e.id, msg.e.e);
      else if (msg.e.k === 'pemote') emotePanel.showPhoto(msg.e.id, msg.e.data);
      else if (msg.e.k === 'snd') emotePanel.playSound(msg.e.id, msg.e.sid);
      else if (msg.e.k === 'sndAdd') emotePanel.addRoomSound(msg.e);
      else if (msg.e.k === 'sndList') { emotePanel.setRoomSounds(msg.e.items); emotePanel.syncMine(); }
      else if (msg.e.k === 'sndDel') emotePanel.removeRoomSound(msg.e.sid);
      else if (msg.e.k === 'sndRename') emotePanel.renameRoomSound(msg.e.sid, msg.e.name);
      else if (msg.e.k === 'chat') chat.push(msg.e, { mine: msg.e.id === state.room?.you });
      else if (msg.e.k === 'chatLog') chat.setLog(msg.e.items, state.room?.you);
      else { wheel.update(null, null, false); animator.push(msg.e); }
      break;
    case 'error':
      emotePanel.handleError(msg.msg);
      if (inLiar() || msg.msg.includes('채팅') || (state.room && state.room.phase !== 'lobby')) toast(msg.msg); else lobby.setError(msg.msg);
      break;
    default: break;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { animator.flush(); applyRoom(state.room); } });
stage.onFrame((dt) => { special.update(dt / 1000); pins.frame(); chat.update(); emotePanel.update(); liar?.frame(dt / 1000); }); // onFrame is ms, liar takes seconds

const mock = new URLSearchParams(location.search).get('mock');
if (mock) {
  useTransport({ send: (m) => console.debug('mock send', m) });
  const { startMock } = await import('./mock.js');
  await stage.ready;
  startMock(handle, { mode: mock, state: new URLSearchParams(location.search).get('state') ?? 'default' });
} else {
  applyRoom(null); // hides every in-game element until a room arrives
  connect(handle, (up, code) => {
    if (up) return;
    if (code === 4001) {
      const t = h('div', 'toast hit', '다른 곳에서 접속했어요. 눌러서 다시 접속');
      t.onclick = () => location.reload();
      ui.append(t);
    } else toast('서버와 연결이 끊겼어요. 다시 연결 중…');
  });
}
