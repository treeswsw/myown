// 색·도구 칸의 계산 (DOM 없음). docs/draw/GDD.md 6-2, 6-2-1, 11-2.
import { COLORS, WIDTH_MIN, WIDTH_MAX, WIDTH_QUICK, PEN_WIDTH_DEFAULT, ERASER_WIDTH_DEFAULT } from '../../../../shared/draw/constants.js';

export const TOOLS = Object.freeze(['pen', 'erase', 'strokeErase']);

// 굵기를 2~40 정수로 정리한다. 숫자가 아니면 fallback.
export function clampWidth(v, fallback = PEN_WIDTH_DEFAULT) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, n));
}

// ctx.tool.get() 결과를 빠진 칸 없이 채운다.
export function normalizeTool(t) {
  const o = t && typeof t === 'object' ? t : {};
  const ci = Number.isInteger(o.color) && o.color >= 0 && o.color < COLORS.length ? o.color : 0;
  return {
    tool: TOOLS.includes(o.tool) ? o.tool : 'pen',
    color: ci,
    penW: clampWidth(o.penW, PEN_WIDTH_DEFAULT),
    eraseW: clampWidth(o.eraseW, ERASER_WIDTH_DEFAULT),
  };
}

// 지금 도구의 굵기. 획 지우개는 굵기가 없다(null).
export function currentWidth(t) {
  if (t.tool === 'pen') return t.penW;
  if (t.tool === 'erase') return t.eraseW;
  return null;
}

// 지금 도구에 굵기 w 를 적용하는 patch. 획 지우개면 null(바꿀 것 없음).
export function widthPatch(t, w) {
  if (t.tool === 'pen') return { penW: clampWidth(w, t.penW) };
  if (t.tool === 'erase') return { eraseW: clampWidth(w, t.eraseW) };
  return null;
}

// 빠른 굵기 버튼 번호(0..2). 같은 값이 없으면 -1 → 굵기 조정 버튼이 켜진 것으로 본다.
export function quickIndex(w) {
  return w == null ? -1 : WIDTH_QUICK.indexOf(w);
}

export function stepWidth(w, d) {
  return clampWidth((Number(w) || 0) + d, w);
}

// 굵기 막대 위치(0~1)와 그 반대
export function widthToRatio(w) {
  return (clampWidth(w) - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN);
}
export function ratioToWidth(r) {
  const x = Math.min(1, Math.max(0, Number(r) || 0));
  return clampWidth(WIDTH_MIN + x * (WIDTH_MAX - WIDTH_MIN));
}

// 도구 줄을 보이고 동작시킬 때: 내가 그리는 사람이고 draw 단계.
export function toolsVisible(state, meId) {
  return !!state && state.phase === 'draw' && state.drawerId != null && state.drawerId === meId;
}

// 버튼 켜고 끄기. hist = ctx.history.get() 결과({canUndo, canRedo}). 없으면(history 없음) 켜 둔다.
export function buttonStates(state, t, meId, hist) {
  const visible = toolsVisible(state, meId);
  return {
    visible,
    undo: visible && (hist ? !!hist.canUndo : true),
    redo: visible && (hist ? !!hist.canRedo : true),
    sizes: visible && t.tool !== 'strokeErase',
  };
}

// 글을 쓰는 중인 요소인가(단축키 무시)
export function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName || '').toUpperCase());
}

// 키 하나를 동작으로. e: {code, key, ctrlKey, metaKey, shiftKey, altKey}. 해당 없으면 null.
// 한글 자판이어도 눌리도록 code(물리 키)를 먼저 본다.
// 결과: {a:'tool', tool} | {a:'quick', i} | {a:'step', d} | {a:'undo'} | {a:'redo'}
export function keyAction(e, typing = false) {
  if (!e || typing || e.altKey) return null;
  const mod = !!(e.ctrlKey || e.metaKey);
  const code = e.code || '';
  const key = String(e.key || '').toLowerCase();
  const is = (c, k) => code === c || (!code && key === k);
  if (mod) {
    if (is('KeyZ', 'z')) return { a: e.shiftKey ? 'redo' : 'undo' };
    if (is('KeyY', 'y') && !e.shiftKey) return { a: 'redo' };
    return null;
  }
  if (is('KeyB', 'b')) return e.shiftKey ? null : { a: 'tool', tool: 'pen' };
  if (is('KeyE', 'e')) return { a: 'tool', tool: e.shiftKey ? 'strokeErase' : 'erase' };
  if (e.shiftKey) return null;
  for (let i = 0; i < WIDTH_QUICK.length; i++) {
    if (code === `Digit${i + 1}` || (!code && key === String(i + 1))) return { a: 'quick', i };
  }
  if (is('BracketLeft', '[')) return { a: 'step', d: -1 };
  if (is('BracketRight', ']')) return { a: 'step', d: 1 };
  return null;
}
