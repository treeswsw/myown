// 갱식마인드 화면 모듈. 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/COMMON-CONTRACT.md 4-2, GDD 7·11절.
// 대기실(참가자·설정·시작·방 코드)·상단 줄(방 코드/소리/이모티콘/나가기)·이모티콘/사진/사운드 표시·대기실 채팅은 틀이 한다.
// 이 모듈은 게임 판만 그린다: 그림판·도구·문제 띠·플레이어 자리(말풍선)·단어 고르기/정답 공개/최종 순위.
// 게임 중 채팅은 이 화면의 정답 입력칸이 한다(chatRule.own): 정답 판정과 정답자끼리 글 가리기가 서버 엔진 한 함수에 묶여 있다(D8).
// 배치는 draw.css 가 루트 클래스(pure.js rootClasses)만 보고 한다. 이 파일은 DOM 을 만들고 모듈에 상태를 나눠 준다.
import './draw.css';
import './canvas/canvas.css';
import './ui/tools.css';
import './ui/hud.css';
import './ui/players.css';
import './ui/result.css';
import { createBoard } from './canvas/board.js';
import { createTools } from './ui/tools.js';
import { createHud } from './ui/hud.js';
import { createPlayers } from './ui/players.js';
import { createResult } from './ui/result.js';
import { toolsVisible } from './ui/tools.pure.js';
import { createAudio } from './audio.js';
import { CHAT } from '../../../shared/draw/constants.js';
import {
  layoutFor, keyboardUp, createToolStore, routesFor, rootClasses,
  soundForRoom, soundForEvent, tenSecondsKey,
} from './pure.js';

export { layoutFor, createToolStore, routesFor, rootClasses, soundForRoom, soundForEvent, tenSecondsKey };

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

const PLAYING = new Set(['pick', 'draw', 'reveal']);

export function mount(ctx) {
  const root = el('div', 'dr-root');
  root.hidden = true;
  const top = el('div', 'dr-top');          // 윗줄(문제 띠 제목·번호). 방 코드·버튼은 틀의 상단 줄이 그 위에 얹힌다
  const stage = el('div', 'dr-stage');      // 플레이어·그림판·도구 격자
  const spare = el('div', 'dr-spare');      // 지금 배치에서 쓰지 않는 조각을 잠시 두는 곳(보이지 않음)
  spare.hidden = true;
  root.append(top, stage, spare);
  ctx.root.append(root);

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
  let layout = layoutFor(window.innerHeight);
  let kb = false;
  let disposed = false;
  let firedTen = null;
  let lastFull = 0;
  const audio = createAudio({ sound: ctx.sound });
  ctx.sound.unlock(); // iPad: 첫 터치에서 소리 장치를 연다(공용 엔진)

  const meId = () => state?.you ?? ctx.me()?.id ?? null;
  const mods = {};
  const tool = createToolStore();
  const dctx = {
    send: (m) => { if (!disposed && m) ctx.send(m); },
    meId,
    now: () => ctx.clock.now(),
    layout: () => layout,
    tool,
    localAct: (a) => mods.board?.local(a),
    history: null,
    faces: ctx.faces,
    profile: ctx.profile,
    notice: (text) => ctx.toast(text, { key: 'dr-notice' }),
    onFull: () => {
      const t = Date.now();
      if (t - lastFull < 2000) return; // 한도가 찬 채로 계속 그으면 알림이 쌓이지 않게
      lastFull = t;
      ctx.toast('그림이 너무 많아요', { kind: 'error', key: 'dr_canvas_full' }); // 서버의 같은 안내와 한 알림으로
    },
  };

  // 그림판 → 도구 칸 순서(도구 칸이 ctx.history 를 읽는다)
  mods.board = createBoard(bd, dctx);
  dctx.history = mods.board.history;
  bd.append(cMeter);
  mods.hud = createHud(spare, dctx);
  mods.tools = createTools(spare, dctx);
  mods.players = createPlayers(stage, dctx);
  mods.result = createResult(bd, dctx);

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

  // 배치에 따라 윗줄과 격자에 조각을 나눠 담는다(휴대폰: 문제 띠·정답 입력·포기가 윗줄, PC·iPad: 격자 안).
  function place() {
    if (layout === 'phone') {
      top.replaceChildren(cBar, cAnswer, cGive);
      spare.append(hs.title, hs.num);
    } else {
      top.replaceChildren(hs.title, sp, hs.num);
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
    const s = state;
    mods.board.update(s);
    mods.tools.update(s);
    const vis = toolsVisible(s, meId());
    for (const c of toolCells) c.hidden = !vis;
    mods.hud.update(s);
    mods.players.update(s);
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

  // 사진·꾸미기가 새로 왔다: 자리의 프로필만 다시 그린다
  const offFaces = ctx.faces.onChange(() => {
    if (!disposed && state) mods.players.update(state);
  });

  // 10초 남음 소리(상태는 시간이 지나도 다시 오지 않으므로 직접 잰다)
  const tenTimer = setInterval(() => {
    const key = tenSecondsKey(state, ctx.clock.now(), firedTen);
    if (key) { firedTen = key; audio.play('tenLeft'); }
  }, 500);

  place();
  applyClasses();

  return {
    room(s) {
      if (disposed || !s) return;
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

    // 이모티콘·사진·말풍선이 뜰 자리: 플레이어 자리의 사진(최종 순위는 공통 결과 화면이 맡는다)
    anchorOf(id) {
      return disposed ? null : mods.players.anchor(id);
    },

    // 게임 중 채팅은 정답 입력칸(own)이고, 대기실·최종 순위에서는 사이트 채팅. 글은 40자까지(입력칸에서 막고 서버도 거절).
    chatRule: {
      maxLen: CHAT.max,
      own: (s) => PLAYING.has(s?.phase),
      route: (text) => ({ t: 'chat', text: [...String(text)].slice(0, CHAT.max).join('') }),
    },

    leaveNote: (s) => (PLAYING.has(s?.phase) ? '나가면 이번 판 코인을 받지 못해요' : null),

    unmount() {
      if (disposed) return;
      disposed = true;
      clearInterval(tenTimer);
      offFaces();
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
