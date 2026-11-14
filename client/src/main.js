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
import { createAdmin } from './ui/admin.js';
import { createEmotePanel } from './ui/emotePanel.js';
import { h, updateScale, view } from './ui/dom.js';
import { createSpecialFX } from './anim/special/index.js';
import { connect, send } from './net.js';
import { state, saved, tokens } from './state.js';
import { sfx } from './audio.js';
import { TY } from './scene/room.js';
import { sound } from './sound/core.js';
import { isFramed } from './games.js';
import { createRoomFrame } from './room/frame.js';
import { createEmoteToggle } from './room/bar.js';
import { createPoker } from './poker/index.js';
import { toast as kitToast } from './ui/kit/toast.js';

document.body.append(h('div', 'buildtag', `v${__BUILD__}`));

const ui = document.getElementById('ui');
updateScale();
addEventListener('resize', updateScale);

await Promise.all(['700 30px "Libre Baskerville"', '30px Bangers', '30px "Black Han Sans"', '700 30px "Noto Sans KR"']
  .map((f) => document.fonts.load(f, 'K9레이즈♠').catch(() => {})));

const stage = createStage(document.getElementById('cv'));

/* Every room is drawn by the common frame (room/frame.js, games.js); poker is one of its games (poker/index.js). */
let frame = null; // created once chat / emote panel exist
const inFrame = () => isFramed(state.room?.mode);
const anchorOf = (id) => (inFrame() ? frame.anchorOf(id) : pins.anchor(id));

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
  getAnchor: (id) => anchorOf(id),
  getSelf: () => state.me?.id ?? null,
  onClose: () => { hud.closePanel(); emoteToggle.close(); },
});
const emoteToggle = createEmoteToggle(ui, emotePanel); // the one emote window outside the poker HUD (room/bar.js)
let poker = null; // poker/index.js createPoker (below): the HUD's leave buttons go through the frame's leave (confirm while playing)
const hud = createHud(ui, { send: (m) => (m.t === 'leave' && poker ? poker.leave() : send(m)), getMe: () => state.me, emotePanel });
const cluster = createCluster(ui);
const wheel = createWheel(ui, send);
const bluff = createBluff(ui, send);

const chat = createChat({
  onSend: (text) => send(inFrame() ? frame.chatMsg(text) : { t: 'chat', text }),
  getAnchor: (id) => anchorOf(id),
  onEmote: () => emoteToggle.toggle(),
});
document.body.append(chat.el, chat.button);
chat.button.hidden = true;

let pendingAvatar = null;
let loginPw = null; // admin password typed on the login screen; remembered with the ID once the server accepts
let resetWait = false; // a reset confirmation was sent and its answer is pending (adm_pw/adm_lock then belong to the reset sheet)
let loginId = null; // remembered only once the server accepts it (the reserved reset ID is never accepted)
const lobby = createLobby({
  onLogin: (id, avatar, pw, pinFields) => {
    resetWait = false;
    pendingAvatar = avatar; loginId = id; loginPw = pw ?? null;
    const m = { t: 'login', id };
    if (pw) m.pw = pw;
    const tok = tokens.get(id);
    if (tok) m.tok = tok;
    if (pinFields?.pin) m.pin = pinFields.pin;
    if (pinFields?.newPin) m.newPin = pinFields.newPin;
    send(m);
  },
  onResetConfirm: (pw) => { resetWait = true; send({ t: 'reset', confirm: true, pw }); },
  onCoin: (kind) => { if (coin) coin.open(kind); else { pendingCoin = kind; loadCoin(); } },
  onAvatar: (data) => send({ t: 'avatar', data }),
  onCreate: (mode, game, bot) => send(mode === 'mini' ? { t: 'create', mode, game, ...(bot ?? {}) } : { t: 'create', mode }),
  onJoin: (code) => send({ t: 'join', code }),
  onLogout: () => {
    send({ t: 'pin', a: 'forget' }); // server forgets this device's token first
    tokens.del(saved.get('gs.lastId') ?? loginId); // only this id's token
    saved.del('gs.lastId'); saved.del('gs.adminPw');
    setTimeout(() => location.reload(), 150); // let the message leave before the socket closes
  },
  onRank: () => send({ t: 'lg', a: 'rank' }),
  onFlash: () => import('./flash/index.js').then((m) => m.open()), // 놀이터(플래시): 서버 없이 화면만
});
document.body.append(lobby.el);
/* coin module (SPEC 22): loaded right after login; messages are buffered until it is ready */
let coin = null;
let coinLoading = false;
let coinBuf = [];
let pendingCoin = null; // a coin button pressed while the module was still loading
let authed = false; // true between the server's first 'me' and the next disconnect: decides whether PIN messages belong to the login screen or the PIN window
function loadCoin() {
  if (coin || coinLoading) return;
  coinLoading = true;
  import('./coin/index.js').then(({ createCoin }) => {
    coin = createCoin({ send, root: document.body }); // body, not #ui: #ui is a stacking context under the lobby (z 20), so windows would sit behind it
    const buf = coinBuf; coinBuf = [];
    if (state.me?.wallet) coin.onMe({ user: state.me, wallet: state.me.wallet });
    for (const m of buf) coin.onMsg(m);
    if (pendingCoin) { const k = pendingCoin; pendingCoin = null; coin.open(k); }
  }).catch((e) => { coinLoading = false; console.error(e); });
}
const toCoin = (msg) => { if (coin) coin.onMsg(msg); else { coinBuf.push(msg); loadCoin(); } };
const admin = createAdmin({ send, getRoom: () => state.room });

const toast = (msg, opt) => kitToast(msg, opt); // ui/kit/toast.js: up to 3 stacked
/* the common room frame (COMMON-CONTRACT 4): every game in CLIENT_GAMES */
let framePoker = false; // poker parts were cleared for the frame
frame = createRoomFrame({
  ui, stage, send, chat, emotePanel, emote: emoteToggle, sound, toast,
  getMe: () => state.me,
  onEnter: () => {
    framePoker = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    lobby.hide();
  },
  onExit: () => { framePoker = false; },
});

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
/* poker (hold'em / bluff) rooms are drawn by poker/index.js through the common frame; it gets the one table, pins and HUD made here */
poker = createPoker({ ui, stage, table, pins, hud, cluster, wheel, bluff, special, scenedim, send });

/* applying server state to the screen: a room goes to the frame, no room shows the lobby */
function applyRoom(room) {
  if (frame.apply(room)) return;
  table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.clearDead(); pins.setVisible(false); hud.update(null); emotePanel.clearRoom(); chat.close(); chat.setEnabled(false); chat.button.hidden = true;
  cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
  lobby.show();
}

function backToLogin() {
  poker.flush();
  special.skipAll();
  state.me = null;
  authed = false;
  admin.setAdmin(false);
  state.room = null;
  emotePanel.clearRoom();
  chat.setLog([]);
  applyRoom(null);
  lobby.setUser(null);
}

function handle(msg) {
  switch (msg.t) {
    case 'me':
      if (loginId) { saved.set('gs.lastId', loginId); loginId = null; }
      if (loginPw && msg.admin === true) saved.set('gs.adminPw', loginPw);
      loginPw = null;
      state.me = msg.user;
      authed = true;
      if (msg.wallet) { state.me.wallet = msg.wallet; if (coin) coin.onMe(msg); else loadCoin(); }
      admin.setAdmin(msg.admin === true);
      lobby.setUser(msg.user);
      lobby.setFlags(msg); // games.js: which games the lobby shows (server switches + ?<flag>=1 for 'test')
      if (pendingAvatar && !msg.user.avatar) send({ t: 'avatar', data: pendingAvatar });
      pendingAvatar = null;
      break;
    case 'room':
      // One room's chat log must never show in another (the server resends chatLog on join).
      if (msg.state?.code !== state.room?.code) { chat.setLog([]); emotePanel.clearRoom(); }
      state.room = msg.state;
      admin.refresh();
      if (isFramed(msg.state?.mode) && !framePoker) { poker.flush(); special.skipAll(); }
      applyRoom(msg.state); // poker holds states back during its animations itself (poker/index.js)
      break;
    case 'resetAsk': loginId = null; lobby.showResetConfirm(); break;
    case 'resetDone':
      // Everything was wiped: drop the remembered ID and any local room state, then show the login screen.
      saved.del('gs.lastId');
      poker.flush();
      special.skipAll();
      saved.del('gs.adminPw');
      state.me = null;
      admin.setAdmin(false);
      state.room = null;
      emotePanel.clearRoom();
      chat.setLog([]);
      applyRoom(null);
      resetWait = false;
      lobby.closeReset();
      authed = false;
      lobby.setUser(null);
      lobby.showNotice('초기화되었습니다');
      break;
    case 'rooms': lobby.setRooms(msg.list); break;
    case 'lgRank':
      if (inFrame() && frame.current()) frame.event({ k: 'lgRank', top: msg.top, mine: msg.mine });
      else lobby.showRank({ top: msg.top, mine: msg.mine });
      break;
    case 'event':
      if (inFrame()) frame.event(msg.e); // the frame handles media / chat / faces and passes the rest to the game
      break; // outside any room (a late event after leaving): nothing to show
    case 'admOk': admin.ok(msg); break;
    case 'coin': toCoin(msg); break;
    case 'pin':
      // login-time answer: keep this device's token (has:false = no PIN on the account any more)
      if (msg.a === 'ok') {
        if (msg.has === false) tokens.del(loginId ?? saved.get('gs.lastId'));
        else if (typeof msg.tok === 'string' && msg.tok) tokens.set(loginId ?? saved.get('gs.lastId'), msg.tok);
      }
      toCoin(msg);
      break;
    case 'error':
      if (/^pin_(need|bad|lock|exists|fmt)$/.test(msg.code ?? '') && !authed) { // login-time PIN problem (belongs to the login screen)
        if (msg.code === 'pin_need') tokens.del(loginId ?? saved.get('gs.lastId')); // a stale token: ask the PIN
        loginPw = null;
        if (state.me) backToLogin(); // reconnect refused after a drop: the login screen again
        if (msg.code === 'pin_need') lobby.askPin(msg.msg); else lobby.loginError(msg.code, msg.msg);
        break;
      }
      if (typeof msg.code === 'string' && /^(coin|shop|pin)_/.test(msg.code)) { toCoin(msg); break; }
      if (msg.code === 'adm_pw' || msg.code === 'adm_lock') { // admin login refused (SPEC 21-1) or reset password refused (22-9)
        if (resetWait) { lobby.resetError(msg.msg); break; } // reset sheet open: stay logged out / in as is
        if (msg.code === 'adm_pw') saved.del('gs.adminPw');
        loginId = null; loginPw = null;
        if (state.me) backToLogin(); // the server session is not an admin one: always fall back to the login screen
        lobby.setError(msg.msg);
        break;
      }
      if (admin.error(msg)) break;
      emotePanel.handleError(msg.msg);
      if (inFrame() && frame.error(msg)) break; // the frame shows the notice once and passes the game's own codes to it
      if (msg.msg.includes('채팅') || (state.room && state.room.phase !== 'lobby')) toast(msg.msg); else lobby.setError(msg.msg);
      break;
    default: break;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { poker.flush(); applyRoom(state.room); } });
stage.onFrame((dt) => { special.update(dt / 1000); pins.frame(); chat.update(); emotePanel.update(); frame.frame(dt / 1000); }); // onFrame is ms, the games take seconds

applyRoom(null); // hides every in-game element until a room arrives
connect(handle, (up, code) => {
  if (up) return;
  authed = false;
  if (code === 4001) {
    const t = h('div', 'toast hit', '다른 곳에서 접속했어요. 눌러서 다시 접속');
    t.onclick = () => location.reload();
    ui.append(t);
  } else toast('서버와 연결이 끊겼어요. 다시 연결 중…');
});
