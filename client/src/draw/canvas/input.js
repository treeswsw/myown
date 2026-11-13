// Pointer Events 입력 (GDD 6-3, 15절 2026-11-13 "뗐다 바로 대도"). 손바닥·펜슬 규칙은 pure.js decideDown.
// handlers: enabled() → bool, down(x, y, type) → bool(받았나), move([{x,y}...]), up(x?, y?)(놓친 경우 좌표 없음), cancel()  (x, y 는 화면 좌표)
// 그리는 사람이 끊김 없이 그리는 것이 먼저다: 앞 누름의 pointerup 이 늦거나 빠져도(같은 포인터 번호가 다시 눌림,
// 또는 같은 종류의 isPrimary 누름 = 다른 닿음이 없음) 앞 선을 정상으로 끝내고 새 선을 바로 받는다.
// pointercancel 도 선을 지우지 않고 정상으로 끝낸다.
import { decideDown, staleActive } from './pure.js';

export function createInput(target, h) {
  let penSeen = false;
  let active = null; // { id, type }

  const stop = (e) => { e.preventDefault(); };

  function onDown(e) {
    if (e.pointerType === 'pen') penSeen = true;
    if (!h.enabled()) return;
    // 앞 누름이 끝났다는 알림을 못 받은 채 새 누름이 왔다: 앞 선을 정상으로 끝낸다(좌표 없음)
    if (active && staleActive(active, { id: e.pointerId, type: e.pointerType, isPrimary: e.isPrimary })) {
      active = null;
      h.up();
    }
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
    h.up(e.clientX, e.clientY);
  }

  // 브라우저가 누름을 취소함(iOS 가 빠른 두 번째 닿음을 몸짓으로 보는 경우 포함): 그은 선은 지우지 않고 정상으로 끝낸다.
  function onCancel(e) {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    h.up();
  }

  // pointerup 을 놓쳐도(캡처를 잃음) 긋던 선을 정상으로 끝낸다. 위치는 모르니 마지막 점은 더하지 않는다.
  function onLostCapture(e) {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    h.up();
  }

  // iOS Safari: touch-action:none 이어도 빠르게 다시 닿으면 두 번 탭·돋보기 몸짓이 끼어들어 포인터를 취소할 수 있다.
  // 그릴 수 있을 때 그림판의 touchstart/touchmove 기본 동작을 막아 몸짓 인식을 끈다(포인터 이벤트는 그대로 온다).
  const stopTouch = (e) => { if (e.cancelable && h.enabled()) e.preventDefault(); };

  const opt = { passive: false };
  const blocked = ['contextmenu', 'selectstart', 'dblclick', 'gesturestart', 'dragstart'];
  target.addEventListener('pointerdown', onDown, opt);
  target.addEventListener('pointermove', onMove, opt);
  target.addEventListener('pointerup', onUp, opt);
  target.addEventListener('pointercancel', onCancel, opt);
  target.addEventListener('lostpointercapture', onLostCapture, opt);
  target.addEventListener('touchstart', stopTouch, opt);
  target.addEventListener('touchmove', stopTouch, opt);
  // 길게 누르기 메뉴·글자 선택·두 번 눌러 확대 막기
  for (const t of blocked) target.addEventListener(t, stop, opt);

  return {
    // 지금 입력을 포기하고 다음 누름부터 새로 받는다 (코드가 먼저 선을 멈춘 경우)
    release() { active = null; },
    isActive: () => !!active,
    dispose() {
      target.removeEventListener('pointerdown', onDown, opt);
      target.removeEventListener('pointermove', onMove, opt);
      target.removeEventListener('pointerup', onUp, opt);
      target.removeEventListener('pointercancel', onCancel, opt);
      target.removeEventListener('lostpointercapture', onLostCapture, opt);
      target.removeEventListener('touchstart', stopTouch, opt);
      target.removeEventListener('touchmove', stopTouch, opt);
      for (const t of blocked) target.removeEventListener(t, stop, opt);
    },
  };
}
