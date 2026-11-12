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
import { h, updateScale, view } from './ui/dom.js';
import { createAnimator } from './anim/events.js';
import { createSpecialFX } from './anim/special/index.js';
import { connect, send, useTransport } from './net.js';
import { state, saved } from './state.js';
import { sfx } from './audio.js';
import { TY } from './scene/room.js';

const ui = document.getElementById('ui');
updateScale();
addEventListener('resize', updateScale);

await Promise.all(['700 30px "Libre Baskerville"', '30px Bangers', '30px "Black Han Sans"', '700 30px "Noto Sans KR"']
  .map((f) => document.fonts.load(f, 'K9레이즈♠').catch(() => {})));

const stage = createStage(document.getElementById('cv'));
const table = createTable(stage);
table.reset();
ui.append(h('div', 'vig'));
const pins = createPins(ui, stage, table);
const hud = createHud(ui, { send, getMe: () => state.me });
const cluster = createCluster(ui);
const wheel = createWheel(ui, send);
const bluff = createBluff(ui, send);

let pendingAvatar = null;
const lobby = createLobby({
  onLogin: (id, avatar) => { pendingAvatar = avatar; saved.set('gs.lastId', id); send({ t: 'login', id }); },
  onAvatar: (data) => send({ t: 'avatar', data }),
  onCreate: (mode) => send({ t: 'create', mode }),
  onJoin: (code) => send({ t: 'join', code }),
  onMode: (mode) => send({ t: 'mode', mode }),
  onStart: () => send({ t: 'start' }),
  onLeave: () => send({ t: 'leave' }),
  onLogout: () => { saved.del('gs.lastId'); location.reload(); },
});
document.body.append(lobby.el);

const toast = (msg) => {
  const t = h('div', 'toast', msg);
  ui.append(t);
  setTimeout(() => t.remove(), 3000);
};

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
function applyRoom(room) {
  shown = room;
  if (!room) {
    table.reset(); pins.render({ players: [], mode: 'holdem' }); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    lobby.setRoom(null); lobby.show();
    return;
  }
  const me = room.players.find((p) => p.id === room.you);
  const playing = room.phase !== 'lobby';
  const holdem = room.mode === 'holdem';
  const myTurn = playing && room.turn === room.you && Boolean(me) && !me.spectating;
  table.sync(room);
  pins.render(room);
  hud.update(room);
  cluster.update(room, holdem && playing && Boolean(me) && !me.spectating);
  wheel.update(room, me, holdem && myTurn && !me.folded && !animator.busy());
  bluff.update(room, !holdem && playing && Boolean(me) && me.alive !== false && !me.spectating, myTurn && !animator.busy());
  if (myTurn && !wasMyTurn) sfx.turn();
  wasMyTurn = myTurn;
  if (playing) lobby.hide(); else { lobby.setRoom(room); lobby.show(); }
}

const animator = createAnimator({
  ui, stage, table, pins, special,
  getRoom: () => state.room ?? shown,
  applyPartial: (fn) => { if (shown) applyRoom(fn(shown)); },
  onIdle: () => applyRoom(state.room),
});

function handle(msg) {
  switch (msg.t) {
    case 'me':
      state.me = msg.user;
      lobby.setUser(msg.user);
      if (pendingAvatar && !msg.user.avatar) send({ t: 'avatar', data: pendingAvatar });
      pendingAvatar = null;
      break;
    case 'room':
      state.room = msg.state;
      if (!animator.busy()) applyRoom(msg.state);
      break;
    case 'event':
      if (msg.e.k === 'emote') pins.emote(msg.e.id, msg.e.e); else animator.push(msg.e);
      break;
    case 'error':
      if (!state.room || state.room.phase === 'lobby') lobby.setError(msg.msg); else toast(msg.msg);
      break;
    default: break;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { animator.flush(); applyRoom(state.room); } });
stage.onFrame((dt) => { special.update(dt / 1000); pins.frame(); });

const mock = new URLSearchParams(location.search).get('mock');
if (mock) {
  useTransport({ send: (m) => console.debug('mock send', m) });
  const { startMock } = await import('./mock.js');
  await stage.ready;
  startMock(handle, { mode: mock, state: new URLSearchParams(location.search).get('state') ?? 'default' });
} else {
  lobby.show();
  connect(handle, (up, code) => {
    if (up) return;
    if (code === 4001) {
      const t = h('div', 'toast hit', '다른 곳에서 접속했어요. 눌러서 다시 접속');
      t.onclick = () => location.reload();
      ui.append(t);
    } else toast('서버와 연결이 끊겼어요. 다시 연결 중…');
  });
}
