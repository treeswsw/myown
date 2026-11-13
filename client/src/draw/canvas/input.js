// Pointer Events 입력 (GDD 6-3). 손바닥·펜슬 규칙은 pure.js decideDown.
// handlers: enabled() → bool, down(x, y, type) → bool(받았나), move([{x,y}...]), up(), cancel()  (x, y 는 화면 좌표)
import { decideDown } from './pure.js';

export function createInput(target, h) {
  let penSeen = false;
  let active = null; // { id, type }

  const stop = (e) => { e.preventDefault(); };

  function onDown(e) {
    if (e.pointerType === 'pen') penSeen = true;
    if (!h.enabled()) return;
    const d = decideDown({
      penSeen, activeType: active ? active.type : null, type: e.pointerType,
      button: e.button, width: e.width, height: e.height,
    });
    if (d === 'ignore') return;
    e.preventDefault();
    if (d === 'replace') { h.cancel(); active = null; }
    if (!h.down(e.clientX, e.clientY, e.pointerType)) return;
    active = { id: e.pointerId, type: e.pointerType };
    try { target.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    const src = list && list.length ? list : [e];
    h.move(src.map((p) => ({ x: p.clientX, y: p.clientY })));
  }

  function onUp(e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    active = null;
    try { target.releasePointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    h.up();
  }

  function onCancel(e) {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    h.cancel(); // 브라우저가 "손바닥이었다"고 알림 → 선 통째로 취소
  }

  const opt = { passive: false };
  target.addEventListener('pointerdown', onDown, opt);
  target.addEventListener('pointermove', onMove, opt);
  target.addEventListener('pointerup', onUp, opt);
  target.addEventListener('pointercancel', onCancel, opt);
  // 길게 누르기 메뉴·글자 선택·두 번 눌러 확대 막기
  for (const t of ['contextmenu', 'selectstart', 'dblclick', 'gesturestart', 'dragstart']) target.addEventListener(t, stop, opt);

  return {
    // 지금 입력을 포기하고 다음 누름부터 새로 받는다 (코드가 먼저 선을 멈춘 경우)
    release() { active = null; },
    isActive: () => !!active,
    dispose() {
      target.removeEventListener('pointerdown', onDown, opt);
      target.removeEventListener('pointermove', onMove, opt);
      target.removeEventListener('pointerup', onUp, opt);
      target.removeEventListener('pointercancel', onCancel, opt);
      for (const t of ['contextmenu', 'selectstart', 'dblclick', 'gesturestart', 'dragstart']) target.removeEventListener(t, stop, opt);
    },
  };
}
