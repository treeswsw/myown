// mountDraw: 갱식마인드 화면 모듈 6개를 하나로 묶는다 (GDD 7절, 11-1, 11-2). 라이어 index.js(mountLiar)와 같은 방식.
//   const draw = mountDraw({ ui, send, getMe, toast, isMuted?, leave?, openEmote? });
//   휴대폰 가로·게임 진행 중에는 윗줄 왼쪽에 메뉴 버튼(≡): 나가기, (openEmote 가 있으면) 이모티콘. 방 코드도 작게 보인다.
//   draw.room(state)   방 상태(10-4)가 올 때마다. 방을 나가면 room(null).
//   draw.event(e)      event.e (10-5) 하나.
//   draw.error(err)    {code, msg} 오류. dr_canvas_full 이면 긋던 선을 멈춘다.
//   draw.dispose()     화면을 걷어낸다.
//   draw.chatSlot      방 대기 화면 참가자 카드 아래 빈 칸(사이트 채팅을 붙이고 싶을 때). 쓰지 않아도 된다.
// 배치는 draw.css 가 루트 클래스(pure.js rootClasses)만 보고 한다. 이 파일은 DOM 을 만들고 모듈에 상태를 나눠 준다.
import './draw.css';
import './canvas/canvas.css';
import './ui/tools.css';
import './ui/hud.css';
import './ui/players.css';
import './ui/settings.css';
import './ui/result.css';
import { createBoard } from './canvas/board.js';
import { createTools } from './ui/tools.js';
import { createHud } from './ui/hud.js';
import { createPlayers } from './ui/players.js';
import { createSettings } from './ui/settings.js';
import { createResult } from './ui/result.js';
import { toolsVisible } from './ui/tools.pure.js';
import { createAudio } from './audio.js';
import { isMuted as siteMuted } from '../audio.js';
import {
  layoutFor, keyboardUp, createToolStore, routesFor, rootClasses,
  soundForRoom, soundForEvent, tenSecondsKey, clockOffset, menuVisible, menuItems,
} from './pure.js';

export { layoutFor, createToolStore, routesFor, rootClasses, soundForRoom, soundForEvent, tenSecondsKey };

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

let current = null; // 이미 마운트된 인스턴스. 다시 마운트하면 먼저 정리해 화면이 하나만 남게 한다.

export function mountDraw(opts) {
  current?.dispose();
  const inst = mountDrawInner(opts);
  const dispose = inst.dispose;
  inst.dispose = () => { if (current === inst) current = null; dispose(); };
  current = inst;
  return inst;
}

function mountDrawInner({ ui, send, getMe, toast, isMuted, leave, openEmote }) {
  const root = el('div', 'dr-root');
  root.hidden = true;
  const top = el('div', 'dr-top');          // 윗줄
  const stage = el('div', 'dr-stage');      // 플레이어·그림판·도구 격자
  const lobby = el('div', 'dr-lobby');      // 방 대기 화면
  const spare = el('div', 'dr-spare');      // 지금 배치에서 쓰지 않는 조각을 잠시 두는 곳(보이지 않음)
  spare.hidden = true;
  root.append(top, stage, lobby, spare);
  ui.append(root);

  // 칸(cell): 모듈이 내놓은 조각을 감싸 격자 자리를 주는 상자. 격자 규칙은 draw.css 가 이 상자의 클래스로만 쓴다.
  const cell = (cls) => el('div', `dr-c dr-c-${cls}`);
  const cBar = cell('bar');
  const cAnswer = cell('answer');
  const cGive = cell('give');
  const cPal = cell('pal');
  const cTools = cell('tools');
  const cUnder = cell('under');
  const cMeter = cell('meter');
  const bd = el('div', 'dr-bd');            // 그림판 칸(그림판 + 줄어드는 막대 + 고르기·결과 층)
  const sp = el('div', 'dr-sp');
  const toolCells = [cPal, cTools, cUnder, cGive];

  let state = null;
  let offset = 0;
  let layout = layoutFor(window.innerHeight);
  let kb = false;
  let disposed = false;
  let firedTen = null;
  let lastFull = 0;
  const audio = createAudio({ isMuted: isMuted || siteMuted });
  // 소리 장치가 실제로 풀릴 때까지 다음 터치마다 다시 시도한다(브라우저가 첫 터치에서 거절할 수 있다)
  const unlock = () => {
    if (audio.ready()) { removeEventListener('pointerdown', unlock, { capture: true }); return; }
    audio.unlock();
  };
  addEventListener('pointerdown', unlock, { capture: true });

  const meId = () => state?.you ?? getMe?.()?.id ?? null;
  const mods = {};
  const tool = createToolStore();
  const ctx = {
    send: (m) => { if (!disposed && m) send(m); },
    meId,
    now: () => Date.now() + offset,
    layout: () => layout,
    tool,
    localAct: (a) => mods.board?.local(a),
    history: null,
    onFull: () => {
      const t = Date.now();
      if (t - lastFull < 2000) return; // 한도가 찬 채로 계속 그으면 알림이 쌓이지 않게
      lastFull = t;
      toast?.('그림이 너무 많아요');
    },
  };
  if (leave) ctx.leave = leave;

  // 그림판 → 도구 칸 순서(도구 칸이 ctx.history 를 읽는다)
  mods.board = createBoard(bd, ctx);
  ctx.history = mods.board.history;
  bd.append(cMeter);
  mods.hud = createHud(spare, ctx);
  mods.tools = createTools(spare, ctx);
  mods.players = createPlayers(stage, ctx);
  mods.settings = createSettings(lobby, ctx);
  mods.result = createResult(bd, ctx);

  const hs = mods.hud.slots;
  const ts = mods.tools.slots;
  cBar.append(hs.bar);
  cAnswer.append(hs.answer);
  cMeter.append(hs.meter);
  cPal.append(ts.pal);
  cTools.append(ts.tools);
  cUnder.append(ts.under);
  cGive.append(ts.give);
  stage.append(cPal, bd, cTools, cUnder);

  // 휴대폰 가로 메뉴: 버튼(≡) + 작은 창(바깥을 누르면 닫힘). 사용자 글자 없음(방 코드는 textContent).
  const menuBtn = el('button', 'dr-menu-btn');
  menuBtn.type = 'button';
  menuBtn.textContent = '\u2261';
  menuBtn.setAttribute('aria-label', '메뉴');
  menuBtn.dataset.dr = 'menu';
  const menuBack = el('div', 'dr-menu-back');
  const menuBox = el('div', 'dr-menu-box');
  const menuCode = el('div', 'dr-menu-code');
  menuBack.hidden = true;
  menuBox.hidden = true;
  const closeMenu = () => { menuBack.hidden = true; menuBox.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  const items = {
    emote: ['이모티콘', 'menu-emote', () => { closeMenu(); openEmote?.(); }],
    leave: ['나가기', 'menu-leave', () => { closeMenu(); (leave || (() => send({ t: 'leave' })))(); }],
  };
  menuBox.append(menuCode);
  for (const name of menuItems(typeof openEmote === 'function')) {
    const [label, dr, fn] = items[name];
    const b = el('button', 'dr-menu-item');
    b.type = 'button';
    b.textContent = label;
    b.dataset.dr = dr;
    b.addEventListener('click', fn);
    menuBox.append(b);
  }
  menuBtn.addEventListener('click', () => {
    const open = menuBox.hidden;
    menuCode.textContent = state?.code ? `방 ${state.code}` : '';
    menuCode.hidden = !state?.code;
    menuBack.hidden = !open;
    menuBox.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  menuBack.addEventListener('pointerdown', closeMenu);
  root.append(menuBack, menuBox);

  // 배치에 따라 윗줄과 격자에 조각을 나눠 담는다(휴대폰: 문제 띠·정답 입력·포기가 윗줄, PC·iPad: 격자 안).
  function place() {
    if (layout === 'phone') {
      top.replaceChildren(menuBtn, cBar, cAnswer, cGive);
      spare.append(hs.title, hs.num);
    } else {
      top.replaceChildren(hs.title, sp, hs.num);
      closeMenu();
      stage.append(cBar, cAnswer, cGive);
    }
  }

  function applyClasses() {
    const want = rootClasses({ state, meId: meId(), layout, kb });
    for (const c of [...root.classList]) if (c.startsWith('dr-') && c !== 'dr-root') root.classList.remove(c);
    root.classList.add(...want);
  }

  function refresh() {
    applyClasses();
    const showMenu = menuVisible(layout, state);
    menuBtn.hidden = !showMenu;
    if (!showMenu) closeMenu();
    const s = state;
    mods.board.update(s);
    mods.tools.update(s);
    const vis = toolsVisible(s, meId());
    for (const c of toolCells) c.hidden = !vis;
    mods.hud.update(s);
    mods.players.update(s);
    mods.settings.update(s);
    mods.result.update(s);
  }

  // 화면 크기·키보드가 바뀌면 배치를 다시 정하고 모듈이 다시 그리게 한다.
  function onResize() {
    if (disposed) return;
    const next = layoutFor(window.innerHeight);
    const vv = window.visualViewport;
    const nextKb = vv ? keyboardUp(next, window.innerHeight, vv.height, vv.offsetTop) : false;
    if (next === layout && nextKb === kb) return;
    const flipped = next !== layout;
    layout = next;
    kb = nextKb;
    if (flipped) place();
    if (state) refresh(); else applyClasses();
  }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', onResize);

  // 10초 남음 소리(상태는 시간이 지나도 다시 오지 않으므로 직접 잰다)
  const tenTimer = setInterval(() => {
    const key = tenSecondsKey(state, ctx.now(), firedTen);
    if (key) { firedTen = key; audio.play('tenLeft'); }
  }, 500);

  place();
  applyClasses();
  menuBtn.hidden = true;

  return {
    el: root,
    chatSlot: mods.settings.slots.chat,
    room(s) {
      if (disposed) return;
      if (!s) {
        state = null;
        root.hidden = true;
        closeMenu();
        applyClasses();
        for (const m of Object.values(mods)) m.update(null);
        return;
      }
      offset = clockOffset(s, Date.now(), offset);
      const prev = state;
      state = s;
      root.hidden = false;
      refresh();
      const snd = soundForRoom(prev, s, meId());
      if (snd) audio.play(snd);
    },
    event(e) {
      if (disposed || !e) return;
      for (const name of routesFor(e)) mods[name]?.event?.(e);
      const snd = soundForEvent(e, meId());
      if (snd) audio.play(snd);
    },
    error(err) {
      if (disposed || !err) return;
      if (err.code === 'dr_canvas_full') mods.board.stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(tenTimer);
      removeEventListener('pointerdown', unlock, { capture: true });
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', onResize);
      for (const m of Object.values(mods)) m.dispose?.();
      audio.dispose();
      root.remove();
    },
  };
}
