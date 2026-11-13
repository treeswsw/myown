// 색·도구 칸 (docs/draw/GDD.md 6-2, 6-2-1, 11-2). 접두사 .dr-tb-
// createTools(parent, ctx) → { el, update(state), event(e), dispose(), slots }
// el 은 display:contents 라서 아래 조각(slots)이 입구(index.js)가 만든 격자 칸에 바로 놓인다.
//   slots.pal   색 12개 (2열×6행)            → 그림판 왼쪽
//   slots.tools 도구 줄(휴대폰은 굵기까지)    → 그림판 오른쪽
//   slots.under 굵기 빠른 3개 + 조정 버튼 + 조정 창(PC·iPad) → 그림판 아래 줄
//   slots.give  포기 버튼                     → PC: 아래 줄 오른쪽 / 휴대폰: 윗줄
// 사용자 글자는 다루지 않는다(고정 글자와 SVG 만 innerHTML).
import { COLORS, WIDTH_MIN, WIDTH_MAX, WIDTH_QUICK } from '../../../../shared/draw/constants.js';
import {
  normalizeTool, currentWidth, widthPatch, quickIndex, stepWidth, widthToRatio, ratioToWidth,
  buttonStates, isTypingTarget, keyAction, layoutOf,
} from './tools.pure.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  pen: svg('<path d="M4 20l1-5L16 4l4 4L9 19l-5 1z"/><path d="M14 6l4 4"/>'),
  erase: svg('<path d="M8 19l-4-4a2 2 0 010-3l8-8a2 2 0 013 0l5 5a2 2 0 010 3l-7 7H8z"/><path d="M9 9l7 7M12 19h8"/>'),
  strokeErase: svg('<path d="M3 14c3-6 5 4 8-1s4-7 7-2 2 5 3 3"/><path d="M6 20L18 5" stroke-width="2.6"/>'),
  adj: svg('<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.6" fill="currentColor"/><circle cx="15" cy="16" r="2.6" fill="currentColor"/>'),
  undo: svg('<path d="M9 13L4 8l5-5"/><path d="M4 8h10a6 6 0 010 12h-4"/>'),
  redo: svg('<path d="M15 13l5-5-5-5"/><path d="M20 8H10a6 6 0 000 12h4"/>'),
  palm: svg('<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V13M17 11.5V9a1.5 1.5 0 013 0v5.5c0 4-3 7-7 7h-1.2c-2.2 0-3.6-.9-4.9-2.7L4 14.4a1.5 1.5 0 012.3-1.9L8 14"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
};
const QUICK_LABEL = ['가늘게', '보통', '굵게'];
const QUICK_DOT = [5, 11, 22]; // 빠른 버튼 속 점 지름(그림)
const PAPER = '#fffdf8';

function h(tag, cls, attrs = {}, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (html) e.innerHTML = html;
  return e;
}
const btn = (cls, label, html, extra = {}) => h('button', cls, { type: 'button', 'aria-label': label, ...extra }, html);

export function createTools(parent, ctx) {
  const el = h('div', 'dr-tb dr-tb-wide');
  el.hidden = true;
  parent.appendChild(el);

  let state = null;
  let popOpen = false;
  let disposed = false;
  const offs = [];
  const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); offs.push(() => target.removeEventListener(type, fn, opt)); };

  // ---- 색 ----
  const pal = h('div', 'dr-tb-pal', { role: 'radiogroup', 'aria-label': '색' });
  const swatches = COLORS.map((c, i) => {
    const b = btn('dr-tb-sw', c.name, '', { role: 'radio', 'aria-checked': 'false' });
    b.style.background = c.value;
    on(b, 'click', () => setTool({ color: i, tool: 'pen' })); // 지우개로 있다가 색을 고르면 펜으로
    pal.appendChild(b);
    return b;
  });

  // ---- 도구 ----
  const tools = h('div', 'dr-tb-tools', { role: 'toolbar', 'aria-label': '그리기 도구' });
  const toolBtn = {};
  const mkTool = (id, label, text) => {
    const b = btn('dr-tb-tool', label, ICON[id] + `<span class="dr-tb-txt">${text}</span>`, { 'aria-pressed': 'false' });
    on(b, 'click', () => setTool({ tool: id }));
    toolBtn[id] = b;
    return b;
  };
  const hr = () => h('hr', 'dr-tb-hr');
  const undoB = btn('dr-tb-tool', '되돌리기', ICON.undo + '<span class="dr-tb-txt">되돌리기</span>');
  const redoB = btn('dr-tb-tool', '다시 하기', ICON.redo + '<span class="dr-tb-txt">다시 하기</span>');
  const clearB = btn('dr-tb-tool dr-tb-clear', '전체 지우기', ICON.trash + '<span class="dr-tb-txt">전체 지우기</span>');
  on(undoB, 'click', () => act('undo'));
  on(redoB, 'click', () => act('redo'));
  on(clearB, 'click', () => act('clear'));
  // 손바닥 방지 켜기/끄기: 켜짐 = 펜슬 우선·넓은 닿음 무시·손가락 취소 대기. 꺼짐 = 어떤 닿음이든 바로 그림
  const palmB = btn('dr-tb-tool dr-tb-palm', '손바닥 방지', ICON.palm + '<span class="dr-tb-txt">손바닥 방지</span>', { 'aria-pressed': 'true' });
  on(palmB, 'click', () => setTool({ palm: !tool().palm }));

  // 굵기 빠른 버튼 3개 + 조정 버튼. 두 벌: 아래 줄(PC·iPad), 도구 줄 안(휴대폰). CSS 가 하나만 보인다.
  const quickSets = [];
  const adjBtns = [];
  const mkSizes = (where) => {
    const quick = WIDTH_QUICK.map((w, i) => {
      const b = btn('dr-tb-size', `굵기 ${QUICK_LABEL[i]} ${w}`, `<i style="width:${QUICK_DOT[i]}px;height:${QUICK_DOT[i]}px"></i>`, { role: 'radio', 'aria-checked': 'false' });
      on(b, 'click', () => applyWidth(w));
      return b;
    });
    const adj = btn('dr-tb-size dr-tb-adj', '굵기 조정', ICON.adj, { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    on(adj, 'click', () => setPop(!popOpen));
    quickSets.push(quick);
    adjBtns.push(adj);
    return [...quick, adj].map((b) => { b.classList.add(where); return b; });
  };
  const wideSizes = mkSizes('dr-tb-wd');
  const phoneSizes = mkSizes('dr-tb-ph');

  tools.append(
    mkTool('pen', '펜', '펜'), mkTool('erase', '정밀 지우개', '정밀 지우개'), mkTool('strokeErase', '획 지우개', '획 지우개'), hr(),
    undoB, redoB, hr(), clearB, hr(), palmB,
    ...phoneSizes,
  );
  // 휴대폰 격자(세로 흐름 5행): 왼쪽 펜·지우개 둘·되돌리기·다시 하기 / 오른쪽 굵기 3개·조정·전체 지우기
  // 전체 지우기를 굵기 뒤로 보내기 위해 phone 에서는 CSS order 를 쓴다.

  // ---- 아래 줄(PC·iPad): 굵기 + 조정 창 ----
  const under = h('div', 'dr-tb-under');
  const sizes = h('div', 'dr-tb-sizes', { role: 'radiogroup', 'aria-label': '굵기' });
  sizes.append(...wideSizes);
  under.appendChild(sizes);

  // ---- 굵기 조정 창 ----
  const pop = h('div', 'dr-tb-pop', { role: 'dialog', 'aria-label': '굵기 조정' });
  pop.hidden = true;
  const prev = h('div', 'dr-tb-prev');
  const prevDot = h('i');
  prev.appendChild(prevDot);
  const num = h('span', 'dr-tb-num', { 'aria-live': 'polite' });
  const minus = btn('dr-tb-step', '굵기 1 줄이기', '−');
  const plus = btn('dr-tb-step', '굵기 1 늘리기', '+');
  const track = h('div', 'dr-tb-track', { role: 'slider', tabindex: '0', 'aria-label': '굵기', 'aria-valuemin': String(WIDTH_MIN), 'aria-valuemax': String(WIDTH_MAX) });
  const fill = h('i', 'dr-tb-fill');
  const knob = h('u', 'dr-tb-knob');
  track.append(fill, knob);
  pop.append(prev, num, minus, track, plus);
  under.appendChild(pop);
  on(minus, 'click', () => stepBy(-1));
  on(plus, 'click', () => stepBy(1));
  on(track, 'keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (d) { e.preventDefault(); stepBy(d); }
    else if (e.key === 'Escape') { setPop(false); }
  });
  let dragging = false;
  const fromPointer = (e) => {
    const r = track.getBoundingClientRect();
    if (r.width > 0) applyWidth(ratioToWidth((e.clientX - r.left) / r.width));
  };
  on(track, 'pointerdown', (e) => {
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    fromPointer(e);
    e.preventDefault();
  });
  on(track, 'pointermove', (e) => { if (dragging) fromPointer(e); });
  const endDrag = () => { dragging = false; };
  on(track, 'lostpointercapture', endDrag);
  on(track, 'pointerup', endDrag);
  on(track, 'pointercancel', endDrag);

  // ---- 포기 ----
  const give = h('div', 'dr-tb-giveslot');
  const giveB = btn('dr-tb-give', '포기', '포기');
  on(giveB, 'click', () => act('give'));
  give.appendChild(giveB);

  el.append(pal, tools, under, give);

  // ---- 동작 ----
  function states(t = tool()) {
    return buttonStates(state, t, ctx.meId(), ctx.history && ctx.history.get ? ctx.history.get() : null);
  }
  function tool() { return normalizeTool(ctx.tool && ctx.tool.get && ctx.tool.get()); }
  function setTool(patch) {
    if (!buttonStates(state, tool(), ctx.meId()).visible) return;
    ctx.tool.set(patch);
    render();
  }
  function applyWidth(w) {
    const p = widthPatch(tool(), w);
    if (p) setTool(p);
  }
  function stepBy(d) {
    const w = currentWidth(tool());
    if (w != null) applyWidth(stepWidth(w, d));
  }
  // 누르면 서버에 알린다. 그리는 사람 화면의 즉시 반영은 그림판 몫이라, 있으면 ctx.localAct 로 먼저 알려 준다.
  function act(a) {
    const bs = states();
    if (!bs.visible) return;
    if (a === 'undo' && !bs.undo) return;
    if (a === 'redo' && !bs.redo) return;
    if (a === 'undo' || a === 'redo' || a === 'clear') {
      if (typeof ctx.localAct === 'function') ctx.localAct(a);
    }
    if (a === 'give') setPop(false);
    ctx.send({ t: 'dr', a });
  }

  // ---- 조정 창 열고 닫기 ----
  const onOutside = (e) => {
    if (pop.contains(e.target) || adjBtns.some((b) => b.contains(e.target))) return;
    setPop(false);
  };
  function setPop(open) {
    open = !!open && buttonStates(state, tool(), ctx.meId()).sizes;
    if (open === popOpen) return;
    popOpen = open;
    if (open) document.addEventListener('pointerdown', onOutside, true);
    else document.removeEventListener('pointerdown', onOutside, true);
    render();
  }

  // ---- 그리기 ----
  function render() {
    if (disposed) return;
    const lay = layoutOf(ctx.layout && ctx.layout());
    // 조각이 .dr-tb 밖으로 옮겨져도 같은 모양이 나오도록 조각마다 배치 클래스를 직접 단다
    for (const n of [el, pal, tools, under, give, pop]) {
      n.classList.toggle('dr-tb-phone', lay === 'phone');
      n.classList.toggle('dr-tb-wide', lay === 'wide');
    }
    const t = tool();
    const bs = states(t);
    el.hidden = !bs.visible;
    for (const n of [pal, tools, under, give]) n.hidden = !bs.visible;
    if (!bs.visible) {
      if (popOpen) { popOpen = false; document.removeEventListener('pointerdown', onOutside, true); }
      pop.hidden = true;
      return;
    }
    if (popOpen && !bs.sizes) { popOpen = false; document.removeEventListener('pointerdown', onOutside, true); }

    swatches.forEach((b, i) => {
      const sel = i === t.color;
      b.classList.toggle('dr-tb-on', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    for (const id in toolBtn) {
      const on_ = t.tool === id;
      toolBtn[id].classList.toggle('dr-tb-on', on_);
      toolBtn[id].setAttribute('aria-pressed', String(on_));
    }
    palmB.classList.toggle('dr-tb-on', t.palm);
    palmB.setAttribute('aria-pressed', String(t.palm));
    undoB.disabled = !bs.undo;
    redoB.disabled = !bs.redo;

    const w = currentWidth(t);
    const qi = quickIndex(w);
    quickSets.forEach((set) => set.forEach((b, i) => {
      b.disabled = !bs.sizes;
      b.classList.toggle('dr-tb-on', i === qi);
      b.setAttribute('aria-checked', String(i === qi));
    }));
    adjBtns.forEach((b) => {
      b.disabled = !bs.sizes;
      b.classList.toggle('dr-tb-on', bs.sizes && qi < 0 || popOpen);
      b.setAttribute('aria-expanded', String(popOpen));
    });

    pop.hidden = !popOpen;
    if (popOpen && w != null) {
      const erasing = t.tool === 'erase';
      prev.classList.toggle('dr-tb-erase', erasing);
      prevDot.style.width = prevDot.style.height = `${w}px`;
      prevDot.style.background = erasing ? PAPER : COLORS[t.color].value;
      num.textContent = String(w);
      minus.disabled = w <= WIDTH_MIN;
      plus.disabled = w >= WIDTH_MAX;
      const pct = `${(widthToRatio(w) * 100).toFixed(2)}%`;
      fill.style.width = pct;
      knob.style.left = pct;
      track.setAttribute('aria-valuenow', String(w));
    }
  }

  // ---- 단축키 ----
  on(document, 'keydown', (e) => {
    if (el.hidden) return;
    const typing = isTypingTarget(e.target) || isTypingTarget(document.activeElement);
    const a = keyAction(e, typing);
    if (!a) {
      if (e.key === 'Escape' && popOpen) setPop(false);
      return;
    }
    e.preventDefault();
    if (e.repeat && (a.a === 'undo' || a.a === 'redo')) return;
    if (a.a === 'tool') setTool({ tool: a.tool });
    else if (a.a === 'quick') applyWidth(WIDTH_QUICK[a.i]);
    else if (a.a === 'step') stepBy(a.d);
    else if (a.a === 'undo') act('undo');
    else if (a.a === 'redo') act('redo');
  });
  on(window, 'resize', render);

  // 그림판이 바꾼 도구(예: 그림판 쪽 단축키)도 따라간다
  let offTool = null;
  if (ctx.tool && typeof ctx.tool.on === 'function') offTool = ctx.tool.on(render);

  let offHist = null;
  if (ctx.history && typeof ctx.history.on === 'function') offHist = ctx.history.on(render);

  render();

  return {
    el,
    slots: { pal, tools, under, give },
    update(s) { state = s || null; render(); },
    event() { /* 이 칸은 event 를 쓰지 않는다 */ },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof offTool === 'function') offTool();
      if (typeof offHist === 'function') offHist();
      document.removeEventListener('pointerdown', onOutside, true);
      offs.forEach((f) => f());
      el.remove();
    },
  };
}
