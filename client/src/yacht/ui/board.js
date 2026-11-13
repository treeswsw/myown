// 요트다이스 주사위 판: 눌리는 것 전부(컵 흔들기·주사위 보관/빼기)와 판의 글자(N left, 차례, 기다림, 안내, 족보).
// 그림은 dice2d.js(2D)가 그린다. 약속: docs/YACHT-PLAN.md 3-2. shared/ 를 import 하지 않는다. three.js 도 쓰지 않는다.
// 조작은 항상 DOM 버튼이다. 차례인 사람(turn === you)에게만 버튼이 생긴다. 남의 차례·관전은 버튼 0개.
// 맨 위에서는 document·window 를 만지지 않는다.
import { createDiceView } from './dice2d.js';

const COMBO_TEXT = { yacht: '요트!', largeStraight: 'L 스트레이트', smallStraight: 'S 스트레이트', fourKind: '포카드', fullHouse: '풀하우스' };
const HINT_TEXT = '주사위를 누르면 위 칸에 보관';
const HINT_MS = 3;          // 초
const COMBO_S = 1.8;        // 초
const MIN_HOLD_S = 0.4;     // 톡 눌러도 이만큼 흔든 뒤 굴린다
const SHAKE_OFF_S = 0.3;    // 흔들기 끝 알림 뒤 굴림이 안 오면 컵에서 꺼낸다
const COLORS = ['#3b6fd4', '#d4573b', '#2f9e6e', '#8a55c9', '#c9922f', '#2b9bb5'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const f3 = (n) => (Number.isFinite(n) ? n : 0).toFixed(3);
const colorOf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const SVG_DIE = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="#fff"/>'
  + [[5, 5], [15, 5], [10, 10], [5, 15], [15, 15]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#1a1613"/>`).join('') + '</svg>';

export function createBoard({ host, stage, send, getFace, onBusy } = {}) {
  const nogl = typeof location !== 'undefined' && /[?&]nogl=1/.test(location.search || '');
  const root = el('div', 'yt-bd-root');
  // 위 줄: 차례인 사람, N left
  const hud = el('div', 'yt-bd-hud');
  const turnEl = el('div', 'yt-bd-turn'); turnEl.setAttribute('data-yt', 'turn');
  const leftEl = el('div', 'yt-bd-left'); leftEl.setAttribute('data-yt', 'left');
  hud.append(turnEl, el('div', 'yt-bd-grow'), leftEl);
  root.appendChild(hud);
  host.appendChild(root);

  const view = createDiceView({ host: root, stage });

  // 트레이 위에 얹는 글·버튼(트레이와 같은 네모. 눌리는 것만 pointer-events: auto)
  const fx = el('div', 'yt-bd-fx');
  const waitEl = el('div', 'yt-bd-wait'); waitEl.setAttribute('data-yt', 'wait');
  const idleEl = el('div', 'yt-bd-idle'); idleEl.setAttribute('data-yt', 'idle');
  const comboEl = el('div', 'yt-bd-combo'); comboEl.setAttribute('data-yt', 'combo');
  const act = el('div', 'yt-bd-act');
  const hintEl = el('div', 'yt-bd-hint', HINT_TEXT); hintEl.setAttribute('data-yt', 'keephint');
  act.appendChild(hintEl);
  fx.append(waitEl, idleEl, comboEl, act);
  root.appendChild(fx);
  const hits = el('div', 'yt-bd-hits');   // 주사위 위 투명 버튼
  root.appendChild(hits);

  let state = null;
  let busy = false;
  let gameSeen = -1;
  let animatedRollNo = 0;         // 연출을 끝낸(시작한) 가장 큰 rollNo
  let liveDice = null;             // 지금 그려진 주사위(상태 또는 알림에서)
  let sig = '';                    // 마지막으로 그린 상태의 서명
  let cupBtn = null;
  let holding = null;              // { t, released }
  let sentRoll = false;
  let sentFor = 0;                 // 굴림 요청을 보낸 뒤 알림을 기다리는 초(서버가 거절하면 풀린다)
  let shakeOffIn = null;           // 초
  let comboLeft = 0;
  let hintLeft = 0;
  let hintShownGame = -1;
  let elapsed = 0;                 // 마지막 update 뒤 지난 초(기다림 글 줄이기)
  let lastWaitN = null;
  const btns = new Map();          // i -> button
  let ro = null;
  let dead = false;
  let seq = 0;                     // 연출 번호(지난 연출의 뒤처리는 무시)

  const tall = () => (typeof window !== 'undefined' ? window.innerHeight >= 720 : true);
  const mine = () => !!state && state.phase === 'playing' && state.turn === state.you && !state.waiting;
  const setBusy = (b) => { if (busy === b) return; busy = b; if (onBusy) onBusy(b); };

  // ---------- 배치 ----------
  function layout() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    const hudH = tall() ? 52 : 40;
    const t = Math.max(120, Math.min(w - 10, h - hudH - 10));
    const tx = (w - t) / 2, ty = hudH + (h - hudH - t) / 2;
    root.style.setProperty('--t', t + 'px');
    root.style.setProperty('--tx', tx + 'px');
    root.style.setProperty('--ty', ty + 'px');
    root.style.setProperty('--hud', hudH + 'px');
    view.resize();
    placeHits();
  }

  // ---------- 보여 주기 ----------
  function faceOf(id) {
    let f = null;
    try { f = getFace ? getFace(id) : null; } catch { f = null; }
    const src = typeof f === 'string' ? f : (f && f.avatar) || null;
    return typeof src === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null;
  }
  function avatar(id, name) {
    const a = el('span', 'yt-bd-av');
    const src = faceOf(id);
    if (src) { const im = el('img'); im.alt = ''; im.src = src; a.appendChild(im); }
    else { a.textContent = (name || '?').trim().slice(0, 1); a.style.background = colorOf(id); }
    return a;
  }
  const nameOf = (id) => {
    const p = (state.players || []).find((x) => x.id === id) || (state.cols || []).find((x) => x.id === id);
    return p ? p.name : '';
  };

  function renderStatic() {
    const s = state;
    // 차례
    turnEl.textContent = '';
    if (s && s.phase === 'playing' && s.turn) {
      const nm = nameOf(s.turn);
      turnEl.hidden = false;
      turnEl.setAttribute('data-id', s.turn);
      turnEl.append(avatar(s.turn, nm), el('span', 'yt-bd-turn-name', s.turn === s.you ? '내 차례' : `${nm} 차례`));
    } else if (s && s.phase === 'result') {
      turnEl.hidden = false; turnEl.removeAttribute('data-id');
      turnEl.appendChild(el('span', 'yt-bd-turn-name yt-bd-turn-end', '게임 끝'));
    } else turnEl.hidden = true;
    // N left
    leftEl.textContent = '';
    if (s && s.phase === 'playing') {
      leftEl.hidden = false;
      leftEl.setAttribute('data-n', String(s.rollsLeft));
      const ico = el('span', 'yt-bd-left-ico'); ico.innerHTML = SVG_DIE;
      leftEl.append(ico, el('b', '', String(s.rollsLeft)), document.createTextNode(' '), el('span', '', 'left'));
    } else leftEl.hidden = true;
    // 방 대기 글
    const lobby = !s || s.phase === 'lobby';
    idleEl.hidden = !lobby;
    idleEl.textContent = lobby ? '방장이 시작을 누르면 시작합니다 (2명 이상)' : '';
    renderWait();
  }

  function waitSeconds() {
    const s = state;
    const p = (s.players || []).find((x) => x.id === s.waiting);
    if (!p || p.awayUntil == null) return 0;
    return Math.max(0, Math.ceil((p.awayUntil - (s.now + elapsed * 1000)) / 1000));
  }
  function renderWait() {
    const s = state;
    if (!s || s.phase !== 'playing' || !s.waiting) { waitEl.hidden = true; waitEl.textContent = ''; lastWaitN = null; return; }
    const n = waitSeconds();
    if (n === lastWaitN && !waitEl.hidden) return;
    lastWaitN = n;
    waitEl.hidden = false;
    waitEl.textContent = `${nameOf(s.waiting)} 재접속 기다리는 중 (${n}초)`;
  }

  function showCombo(c) {
    if (!c || !COMBO_TEXT[c]) return;
    comboEl.textContent = COMBO_TEXT[c];
    comboEl.setAttribute('data-combo', c);
    comboEl.hidden = false;
    comboEl.classList.remove('yt-bd-pop'); void comboEl.offsetWidth; comboEl.classList.add('yt-bd-pop');
    comboLeft = COMBO_S;
  }

  // 보관 안내(GDD 6-1, Q21)
  function updateHint() {
    const s = state;
    let show = false;
    if (s && mine() && !busy && !holding) {
      const canKeep = !!liveDice && s.rollsLeft > 0 && s.rollsLeft < 3;
      if (tall()) show = canKeep && !s.pick;
      else {
        if (canKeep && s.round === 1 && s.rollsLeft === 2 && hintShownGame !== s.gameNo) { hintShownGame = s.gameNo; hintLeft = HINT_MS; }
        show = hintLeft > 0 && !s.pick && canKeep;
      }
    } else if (!tall() && !(s && mine())) hintLeft = 0;
    hintEl.hidden = !show;
  }

  // ---------- 눌리는 것 ----------
  function canShake() {
    const s = state;
    if (!s || !mine() || busy) return false;
    if (s.rollsLeft < 1) return false;
    if (liveDice && liveDice.every((d) => d && d.slot != null)) return false;
    return true;
  }
  function canKeep() {
    const s = state;
    return !!s && mine() && !busy && !holding && !!liveDice && s.rollsLeft > 0;
  }

  function syncCup() {
    const want = canShake() || (holding && mine());
    if (want && !cupBtn) {
      cupBtn = el('button', 'yt-bd-btn');
      cupBtn.type = 'button';
      cupBtn.setAttribute('data-yt', 'cup');
      cupBtn.appendChild(el('span', ''));
      cupBtn.addEventListener('pointerdown', onCupDown);
      cupBtn.addEventListener('pointerup', onCupUp);
      cupBtn.addEventListener('pointercancel', onCupUp);
      cupBtn.addEventListener('pointerleave', onCupUp);
      cupBtn.addEventListener('click', onCupClick);
      cupBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      act.appendChild(cupBtn);
    } else if (!want && cupBtn) { cupBtn.remove(); cupBtn = null; }
    if (cupBtn) cupBtn.firstChild.textContent = liveDice ? '다시 굴리기' : '컵 흔들기';
  }

  function sendYt(m) { if (send) send({ t: 'yt', ...m }); }

  function onCupDown(e) {
    if (holding || sentRoll || !canShake()) return;
    e.preventDefault();
    holding = { t: 0, released: false, ptr: true };
    sendYt({ a: 'shake', on: true });
    view.setShaking(true);
    shakeOffIn = null;
    syncHits();
  }
  function onCupUp() {
    if (!holding || !holding.ptr || holding.released) return;
    holding.released = true;
    if (holding.t >= MIN_HOLD_S) finishHold();     // 아니면 frame 이 0.4초를 채운 뒤 finishHold
  }
  function onCupClick(e) {
    if (e.detail !== 0) return;                    // 마우스·터치는 pointer 이벤트가 이미 처리. 키보드만
    if (holding || sentRoll || !canShake()) return;
    sendYt({ a: 'shake', on: true });
    view.setShaking(true);
    holding = { t: MIN_HOLD_S, released: true, ptr: false };
    finishHold();
  }
  function finishHold() {
    if (!holding) return;
    holding = null;
    sentRoll = true; sentFor = 2;
    sendYt({ a: 'shake', on: false });
    sendYt({ a: 'roll' });
    syncCup(); syncHits();
  }

  function onDie(i) {
    if (!canKeep()) return;
    const d = liveDice[i];
    if (!d) return;
    sendYt({ a: 'keep', i, on: d.slot == null });
  }

  function syncHits() {
    const want = canKeep();
    for (const [i, b] of btns) {
      if (!want || !liveDice || !liveDice[i]) { b.remove(); btns.delete(i); }
    }
    if (!want) return;
    for (let i = 0; i < 5; i++) {
      if (!liveDice[i] || btns.has(i)) continue;
      const b = el('button', 'yt-bd-dieb');
      b.type = 'button';
      b.setAttribute('data-yt', `die-${i}`);
      b.setAttribute('aria-label', `주사위 ${i + 1} ${liveDice[i].slot == null ? '보관' : '빼기'}`);
      b.addEventListener('click', () => onDie(i));
      hits.appendChild(b);
      btns.set(i, b);
    }
    placeHits();
  }

  function placeHits() {
    for (const [i, b] of btns) {
      const d = liveDice && liveDice[i];
      const r = view.hitOf(i);
      if (!d || !r) { b.style.display = 'none'; continue; }
      b.style.display = '';
      b.style.left = r.x + 'px'; b.style.top = r.y + 'px'; b.style.width = r.w + 'px'; b.style.height = r.h + 'px';
      b.setAttribute('data-v', String(d.v));
      b.setAttribute('data-x', f3(d.x));
      b.setAttribute('data-z', f3(d.z));
      b.setAttribute('data-slot', d.slot == null ? '' : String(d.slot));
    }
  }

  // ---------- 상태·알림 ----------
  const signature = (s) => JSON.stringify([s.phase, s.turn, s.rollNo, s.shaking, s.dice ? s.dice.map((d) => [d.v, d.slot, d.x, d.z, d.yaw]) : null]);

  function redraw() {
    const s = state;
    const dice = s && s.phase === 'playing' ? s.dice : (s && s.phase === 'result' ? s.dice : null);
    liveDice = dice ? dice.map((d) => ({ ...d })) : null;
    const playing = s && (s.phase === 'playing');
    view.draw({
      dice: liveDice,
      shaking: !!(s && s.shaking) || !!holding || sentRoll,
      cupHasDice: !liveDice && !!playing,
    });
    // 새 차례(주사위 없음)면 5개가 컵에 있다. 방 대기·결과에서도 같은 모습(컵 안에 5개)
    sig = s ? signature(s) : '';
  }

  function update(next) {
    state = next || null;
    if (holding && !mine()) { holding = null; shakeOffIn = null; view.setShaking(false); }   // 누르는 중 차례가 끝남
    elapsed = 0; lastWaitN = null;
    if (!state) {
      liveDice = null; sig = '';
      view.draw({ dice: null, shaking: false, cupHasDice: true });
      renderStatic(); syncCup(); syncHits(); updateHint();
      return;
    }
    if (state.gameNo !== gameSeen) { gameSeen = state.gameNo; animatedRollNo = 0; }
    if (!busy) {
      const sg = signature(state);
      if (sg !== sig) redraw();
    }
    renderStatic(); syncCup(); syncHits(); updateHint();
    layout();
  }

  function handleEvent(e) {
    if (!e || dead) return;
    if (e.k === 'ytRoll') {
      if (e.rollNo <= animatedRollNo) return;
      animatedRollNo = e.rollNo;
      sentRoll = false; holding = null; shakeOffIn = null;
      view.skip();
      liveDice = (e.dice || []).map((d) => ({ ...d }));
      sig = '';
      setBusy(true);
      syncCup(); syncHits();
      const my = ++seq;
      view.playRoll({ seed: e.seed, thrown: e.thrown || [], dice: e.dice || [] }).then(() => {
        if (dead || my !== seq) return;
        setBusy(false);
        if (state) { const sg = signature(state); if (state.rollNo >= e.rollNo) { redraw(); } else { sig = sg; } }
        placeHitsAfter();
        showCombo(e.combo);
        syncCup(); syncHits(); updateHint();
      });
    } else if (e.k === 'ytKeep') {
      view.skip();
      if (liveDice && liveDice[e.i]) {
        liveDice[e.i].slot = e.on ? e.slot : null;
        if (!e.on) { liveDice[e.i].x = e.x; liveDice[e.i].z = e.z; liveDice[e.i].yaw = e.yaw; }
      }
      const b = btns.get(e.i);
      setBusy(true);
      const my = ++seq;
      view.playKeep({ i: e.i, on: !!e.on, slot: e.slot, x: e.x, z: e.z, yaw: e.yaw }).then(() => {
        if (dead || my !== seq) return;
        setBusy(false);
        if (b) { b.remove(); btns.delete(e.i); }
        sig = '';
        if (state) { redraw(); }
        syncCup(); syncHits(); updateHint();
      });
      syncCup(); syncHits();
    } else if (e.k === 'ytShake') {
      if (state && e.id === state.you && holding) return;     // 내가 누르고 있는 동안은 내 화면이 이미 흔들고 있다
      if (e.on) { shakeOffIn = null; view.setShaking(true); }
      else shakeOffIn = SHAKE_OFF_S;
    } else if (e.k === 'ytStart') {
      animatedRollNo = 0; gameSeen = e.gameNo;
    } else if (e.k === 'ytTurn' || e.k === 'ytDrop') {
      comboLeft = 0; comboEl.hidden = true;
    }
  }
  function placeHitsAfter() { layout(); }

  function frame(dt = 0) {
    if (dead) return;
    view.frame(dt);
    elapsed += dt;
    if (sentRoll) { sentFor -= dt; if (sentFor <= 0) { sentRoll = false; if (state && !busy) { sig = ''; redraw(); syncCup(); syncHits(); } } }
    if (holding) {
      holding.t += dt;
      if (holding.released && holding.t >= MIN_HOLD_S) finishHold();
    }
    if (shakeOffIn != null) {
      shakeOffIn -= dt;
      if (shakeOffIn <= 0) { shakeOffIn = null; if (!busy) { view.setShaking(false); } }
    }
    if (comboLeft > 0) { comboLeft -= dt; if (comboLeft <= 0) comboEl.hidden = true; }
    if (hintLeft > 0) { hintLeft -= dt; if (hintLeft <= 0) { hintLeft = 0; updateHint(); } }
    if (state && state.waiting) renderWait();
    if (btns.size) placeHits();
  }

  function resize() { layout(); }
  const onAway = () => { if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'hidden') return; onCupUp(); };
  const onBlur = () => onCupUp();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onAway);
  if (typeof window !== 'undefined') window.addEventListener('blur', onBlur);

  comboEl.hidden = true;
  hintEl.hidden = true;
  waitEl.hidden = true;
  turnEl.hidden = true;
  leftEl.hidden = true;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => layout()); ro.observe(root); }
  layout();

  function dispose() {
    dead = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onAway);
    if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur);
    if (ro) ro.disconnect();
    view.dispose();
    root.remove();
  }

  return { el: root, update, handleEvent, frame, resize, dispose };
}
