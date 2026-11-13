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
import { connect, send, useTransport } from './net.js';
import { state, saved, tokens } from './state.js';
import { sfx, isMuted, setMuted } from './audio.js';
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

/* Rooms of games moved to the common frame (games.js mount: true) are drawn by room/frame.js; the rest take the old paths below. */
let frame = null; // created once chat / emote panel exist
const inFrame = () => isFramed(state.room?.mode);
/* liar game: loaded on first use (separate chunk, so poker-only players never download it) */
let liar = null;
// One queue (the frame's) for liar, yacht, mini and the framed games: keeps their calls in message order while the modules load (stage.use is a single slot)
const withLiar = (fn) => { frame.enqueue(async () => { if (liar) fn(liar); }); };
const loadQ = (fn) => frame.enqueue(() => Promise.resolve().then(fn).catch(staleReload));
const inLiar = () => state.room?.mode === 'liar';
/* draw game (갱식마인드): same pattern, own chunk */
let draw = null;
let drawQ = Promise.resolve();
const withDraw = (fn) => { drawQ = drawQ.then(async () => { if (draw) fn(draw); }).catch((e) => console.error(e)); };
const inDraw = () => state.room?.mode === 'draw';
/* gsk game (갱스껄): same pattern, own chunk and own queue */
let gsk = null;
let gskQ = Promise.resolve();
const withGsk = (fn) => { gskQ = gskQ.then(async () => { if (gsk) fn(gsk); }).catch((e) => console.error(e)); };
const inGsk = () => state.room?.mode === 'gsk';
const liarAnchor = (id) => (liar && inLiar() ? liar.anchorOf(id) : null);
/* yacht game: same idea, own chunk */
let yacht = null;
const withYacht = (fn) => { frame.enqueue(async () => { if (yacht) fn(yacht); }); };
const inYacht = () => state.room?.mode === 'yacht';

/* mini games (미니게임): same queue as liar/yacht, own chunk */
let mini = null;
const withMini = (fn) => { frame.enqueue(async () => { if (mini) fn(mini); }); };
const inMini = () => state.room?.mode === 'mini';
const yachtAnchor = (id) => (yacht && inYacht() ? yacht.anchorOf(id) : null);
const anchorOf = (id) => (inFrame() ? frame.anchorOf(id) : inLiar() ? liarAnchor(id) : inYacht() ? yachtAnchor(id) : inDraw() || inGsk() || inMini() ? null : pins.anchor(id));

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
  onClose: () => { hud.closePanel(); closeLiarPanel(); },
});
const emoteToggle = createEmoteToggle(ui, emotePanel); // the one emote window outside the poker HUD (room/bar.js)
let poker = null; // poker/index.js createPoker (below): the HUD's leave buttons go through the frame's leave (confirm while playing)
const hud = createHud(ui, { send: (m) => (m.t === 'leave' && poker ? poker.leave() : send(m)), getMe: () => state.me, emotePanel });
const cluster = createCluster(ui);
const wheel = createWheel(ui, send);
const bluff = createBluff(ui, send);

const chat = createChat({
  onSend: (text) => send(inFrame() ? frame.chatMsg(text) : liar && inLiar() ? liar.chatMsg(text) : { t: 'chat', text }),
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
  onCreate: (mode, game) => send(mode === 'mini' ? { t: 'create', mode, game } : { t: 'create', mode }),
  onJoin: (code) => send({ t: 'join', code }),
  onLogout: () => {
    send({ t: 'pin', a: 'forget' }); // server forgets this device's token first
    tokens.del(saved.get('gs.lastId') ?? loginId); // only this id's token
    saved.del('gs.lastId'); saved.del('gs.adminPw');
    setTimeout(() => location.reload(), 150); // let the message leave before the socket closes
  },
  onRank: () => send({ t: 'lg', a: 'rank' }),
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
/* a game screen file failed to load (usually a new version was deployed): stays until tapped, then reloads */
const staleReload = (e) => {
  console.error(e);
  toast('새 버전이 나왔어요. 눌러서 새로고침', { ms: 0, key: 'stale', onClick: () => location.reload() });
};

/* old room top bars (liar / draw / gsk / yacht / mini, global classes in style.css) until each game moves to the frame's .rm-bar */
const closeLiarPanel = () => emoteToggle.close();
const toggleLiarPanel = () => emoteToggle.toggle();
const lgBtn = (cls, text, onclick) => { const b = h('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };
const lgCode = h('span', 'lgbar-code');
const lgEmote = emoteToggle.owner(lgBtn('lgbar-btn', '이모티콘', toggleLiarPanel));
const lgStart = lgBtn('lgbar-btn main', '시작', () => send({ t: 'start' }));
const lgBar = h('div', 'lgbar', lgCode, h('span', 'lgbar-sp'), lgEmote, lgStart, lgBtn('lgbar-btn', '나가기', () => send({ t: 'leave' })));
lgBar.hidden = true;
ui.append(lgBar);

/* gsk room top bar (.gkbar, style.css): room code / emote / start / leave */
const gkCode = h('span', 'gkbar-code');
const gkStart = lgBtn('gkbar-btn main', '시작', () => send({ t: 'start' }));
gkStart.dataset.gk = 'bar-start';
const gkEmote = emoteToggle.owner(lgBtn('gkbar-btn', '이모티콘', () => toggleLiarPanel()));
gkEmote.dataset.gk = 'bar-emote';
const gkLeave = lgBtn('gkbar-btn', '나가기', () => send({ t: 'leave' }));
gkLeave.dataset.gk = 'bar-leave';
const gkBar = h('div', 'gkbar', gkCode, h('span', 'gkbar-sp'), gkEmote, gkStart, gkLeave);
gkBar.hidden = true;
ui.append(gkBar);

/* yacht room top bar (.ytbar, style.css): room code / sound / emote / start / leave. Sits to the right of the score sheet (--yt-sheet-w) */
const ytCode = h('span', 'ytbar-code');
const ytSound = lgBtn('ytbar-btn', '', () => { setMuted(!isMuted()); syncYtSound(); });
ytSound.dataset.yt = 'bar-sound';
function syncYtSound() { ytSound.textContent = isMuted() ? '🔇' : '🔊'; ytSound.setAttribute('aria-label', isMuted() ? '소리 켜기' : '소리 끄기'); }
syncYtSound();
const ytEmote = emoteToggle.owner(lgBtn('ytbar-btn', '이모티콘', toggleLiarPanel));
ytEmote.dataset.yt = 'bar-emote';
const ytStart = lgBtn('ytbar-btn main', '시작', () => send({ t: 'start' }));
ytStart.dataset.yt = 'bar-start';
const ytLeave = lgBtn('ytbar-btn', '나가기', () => send({ t: 'leave' }));
ytLeave.dataset.yt = 'bar-leave';
const ytBar = h('div', 'ytbar', ytCode, h('span', 'ytbar-sp'), ytSound, ytEmote, ytStart, ytLeave);
ytBar.hidden = true;
ui.append(ytBar);

/* the common room frame (COMMON-CONTRACT 4): rooms of games whose CLIENT_GAMES entry has mount: true */
let framePoker = false; // poker parts were cleared for the frame
frame = createRoomFrame({
  ui, stage, send, chat, emotePanel, emote: emoteToggle, sound, toast, staleReload,
  getMe: () => state.me,
  onEnter: () => {
    framePoker = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
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

/* applying server state to the screen */
let shown = null; // (old-path games set it; poker keeps its own in poker/index.js)
let wasMyTurn = false;
let liarShown = false; // the screen currently shows a liar room (poker parts are cleared)
let yachtShown = false; // the screen currently shows a yacht room (poker parts are cleared)
let miniShown = false; // the screen currently shows a mini-game room (poker parts are cleared)
let drawShown = false; // the screen currently shows a draw room (poker parts are cleared)
let gskShown = false; // the screen currently shows a gsk room (poker parts are cleared)
let lastDrawToast = 0;
const drawToast = (msg) => { lastDrawToast = Date.now(); toast(msg); };
// Phone landscape: the draw screen uses its own top row, so the site bar is hidden there except in the waiting room.
const drawBarHidden = (room) => innerHeight <= 480 && room.phase !== 'lobby';
function applyDrawRoom(room) {
  shown = room;
  if (!drawShown) {
    drawShown = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
    chat.close(); chat.setEnabled(false); chat.button.hidden = true; // the draw screen has its own chat
  }
  lobby.hide();
  lgBar.hidden = drawBarHidden(room);
  lgCode.textContent = `방 코드 ${room.code}`;
  lgStart.hidden = true; // the draw waiting room has its own start button
  if (!draw) {
    drawQ = drawQ.then(async () => {
      if (draw) return;
      const { mountDraw } = await import('./draw/index.js');
      draw = mountDraw({ ui, send, getMe: () => state.me, toast: drawToast, leave: () => send({ t: 'leave' }), openEmote: () => emoteToggle.open() });
    }).catch(staleReload);
  }
  withDraw((d) => d.room(state.room));
}
addEventListener('resize', () => { if (drawShown && state.room?.mode === 'draw') lgBar.hidden = drawBarHidden(state.room); });
function applyGskRoom(room) {
  shown = room;
  if (!gskShown) {
    gskShown = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
  }
  lobby.hide();
  gkBar.hidden = false;
  gkCode.textContent = `방 코드 ${room.code}`;
  gkStart.hidden = room.hostId !== room.you || (room.phase !== 'lobby' && room.phase !== 'result');
  chat.setEnabled(true);
  chat.button.hidden = false;
  chat.setMode('game');
  if (!gsk) {
    gskQ = gskQ.then(async () => {
      if (gsk) return;
      const { mountGsk } = await import('./gsk/index.js');
      gsk = mountGsk({ ui, send, getMe: () => state.me, toast, leave: () => send({ t: 'leave' }), openEmote: () => emoteToggle.open() });
    }).catch(staleReload);
  }
  withGsk((g) => (g.update ?? g.room).call(g, state.room));
}
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
    loadQ(async () => {
      if (liar) return; // reconnects can queue several mounts: check again inside the queue
      const { mountLiar } = await import('./liar/index.js');
      liar = mountLiar({ ui, stage, send, getMe: () => state.me, chat, toast, emotePanel });
    });
  }
  withLiar((l) => l.applyRoom(state.room));
}
function applyYachtRoom(room) {
  shown = room;
  if (!yachtShown) {
    yachtShown = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
  }
  lobby.hide();
  ytBar.hidden = false;
  ytCode.textContent = `방 ${room.code}`;
  ytStart.hidden = room.hostId !== room.you || (room.phase !== 'lobby' && room.phase !== 'result');
  syncYtSound();
  chat.setEnabled(true);
  chat.button.hidden = false;
  chat.setMode('game');
  if (!yacht) {
    loadQ(async () => {
      if (yacht) return;
      const { mountYacht } = await import('./yacht/index.js');
      yacht = mountYacht({ ui, stage, send, getMe: () => state.me, chat, toast, emotePanel });
    });
  }
  withYacht((y) => y.applyRoom(state.room));
}
function applyMiniRoom(room) {
  shown = room;
  if (!miniShown) {
    miniShown = true;
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.setVisible(false); hud.update(null);
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    wasMyTurn = false;
  }
  lobby.hide();
  lgBar.hidden = false;
  lgCode.textContent = `방 코드 ${room.code}`;
  lgStart.hidden = true; // the mini screen has its own start button
  lgBar.classList.add('lgbar-mini');
  chat.setEnabled(true);
  chat.button.hidden = false;
  chat.setMode('game');
  if (!mini) {
    loadQ(async () => {
      if (mini) return;
      const { mountMini } = await import('./mini/index.js');
      mini = mountMini({ ui, send });
    });
  }
  withMini((m) => m.applyRoom(state.room));
}
function applyRoom(room) {
  if (miniShown && room?.mode !== 'mini') {
    miniShown = false;
    lgBar.hidden = true;
    lgBar.classList.remove('lgbar-mini');
    lgStart.hidden = false;
    closeLiarPanel();
    withMini((m) => m.applyRoom(null));
  }
  // Leaving one game's screen first clears it, whichever screen comes next.
  if (yachtShown && room?.mode !== 'yacht') {
    yachtShown = false;
    ytBar.hidden = true;
    closeLiarPanel();
    withYacht((y) => y.applyRoom(null));
  }
  if (gskShown && room?.mode !== 'gsk') {
    gskShown = false;
    gkBar.hidden = true;
    closeLiarPanel();
    withGsk((g) => (g.update ?? g.room).call(g, null));
  }
  if (drawShown && room?.mode !== 'draw') {
    drawShown = false;
    lgBar.hidden = true;
    lgStart.hidden = false;
    closeLiarPanel();
    withDraw((d) => d.room(null));
  }
  if (liarShown && room?.mode !== 'liar') {
    liarShown = false;
    lgBar.hidden = true;
    closeLiarPanel();
    withLiar((l) => l.applyRoom(null));
  }
  if (frame.apply(room)) return; // a game moved to the common frame (games.js mount: true)
  if (room?.mode === 'mini') { applyMiniRoom(room); return; }
  if (room?.mode === 'yacht') { applyYachtRoom(room); return; }
  if (room?.mode === 'liar') { applyLiarRoom(room); return; }
  if (room?.mode === 'draw') { applyDrawRoom(room); return; }
  if (room?.mode === 'gsk') { applyGskRoom(room); return; }
  shown = room;
  if (!room) {
    table.reset(); pins.render({ players: [], mode: 'holdem' }); pins.clearDead(); pins.setVisible(false); hud.update(null); emotePanel.clearRoom(); chat.close(); chat.setEnabled(false); chat.button.hidden = true;
    cluster.update(null, false); wheel.update(null, null, false); bluff.update(null, false, false);
    lobby.show();
  }
  // every room is drawn above: poker rooms by the frame (poker/index.js), the others by their old paths
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
      if ((isFramed(msg.state?.mode) && !framePoker) || (msg.state?.mode === 'liar' && !liarShown) || (msg.state?.mode === 'yacht' && !yachtShown) || (msg.state?.mode === 'draw' && !drawShown) || (msg.state?.mode === 'gsk' && !gskShown) || (msg.state?.mode === 'mini' && !miniShown)) { poker.flush(); special.skipAll(); }
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
      else if (liar && inLiar()) withLiar((l) => l.handleEvent({ k: 'lgRank', top: msg.top, mine: msg.mine }));
      else lobby.showRank({ top: msg.top, mine: msg.mine });
      break;
    case 'event':
      if (inFrame()) { frame.event(msg.e); break; } // the frame handles media / chat / faces and passes the rest to the game
      if (inDraw()) { // draw rooms never use the poker animator; the draw screen has its own chat, so the site chat stays out
        const e = msg.e;
        if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        else withDraw((d) => d.event(e)); // includes emote, faces, chat, chatLog, left, drSt ...
        break;
      }
      if (inGsk()) { // gsk rooms never use the poker animator; chat goes to the site chat
        const e = msg.e;
        if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        else if (e.k === 'chat') chat.push(e, { mine: e.id === state.room?.you });
        else if (e.k === 'chatLog') chat.setLog(e.items, state.room?.you);
        else withGsk((g) => g.event(e)); // includes emote, faces, gk* ...
        break;
      }
      if (inMini()) { // mini rooms: no poker animator; site chat and emote panel as in yacht
        const e = msg.e;
        if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        else if (e.k === 'chat') chat.push(e, { mine: e.id === state.room?.you });
        else if (e.k === 'chatLog') chat.setLog(e.items, state.room?.you);
        else withMini((m) => m.handleEvent(e));
        break;
      }
      if (inYacht()) { // yacht rooms never use the poker animator either
        const e = msg.e;
        if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        else if (e.k === 'chat') chat.push(e, { mine: e.id === state.room?.you });
        else if (e.k === 'chatLog') chat.setLog(e.items, state.room?.you);
        else withYacht((y) => y.handleEvent(e)); // includes emote
        break;
      }
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
      if (typeof msg.code === 'string' && msg.code.startsWith('dr_')) {
        withDraw((d) => d.error(msg));
        if (msg.code === 'dr_canvas_full') { if (Date.now() - lastDrawToast > 2000) drawToast(msg.msg); } // the draw screen may have just told the same thing
        else if (inDraw()) toast(msg.msg);
        else lobby.setError(msg.msg);
        break;
      }
      if (typeof msg.code === 'string' && msg.code.startsWith('gk_') && gsk) { withGsk((g) => g.error?.(msg)); break; } // the gsk screen shows the notice itself
      if (inLiar() || inYacht() || inDraw() || inGsk() || inMini() || msg.msg.includes('채팅') || (state.room && state.room.phase !== 'lobby')) toast(msg.msg); else lobby.setError(msg.msg);
      break;
    default: break;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { poker.flush(); applyRoom(state.room); } });
stage.onFrame((dt) => { special.update(dt / 1000); pins.frame(); chat.update(); emotePanel.update(); frame.frame(dt / 1000); liar?.frame(dt / 1000); yacht?.frame(dt / 1000); mini?.frame(dt / 1000); }); // onFrame is ms, the games take seconds

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
    authed = false;
    if (code === 4001) {
      const t = h('div', 'toast hit', '다른 곳에서 접속했어요. 눌러서 다시 접속');
      t.onclick = () => location.reload();
      ui.append(t);
    } else toast('서버와 연결이 끊겼어요. 다시 연결 중…');
  });
}
