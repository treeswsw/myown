// 공용 창·확인 (COMMON-CONTRACT 4-1). CSS 는 kit.css(.ui-).
// openModal({label, content, buttons:[{text, kind?:'primary'|'danger', onClick?(close) }], onClose}) -> { el, close() }
//   버튼의 onClick 이 false 를 돌려주면 창을 닫지 않는다. 바깥 누름·Esc 는 닫기(onClose).
// confirmBox({title, text, ok='확인', cancel='취소', danger}) -> Promise<bool>
import './kit.css';
import { h } from '../dom.js';

export function openModal({ label = '', content = null, buttons = [{ text: '닫기' }], onClose } = {}) {
  const prev = document.activeElement;
  const btns = buttons.map((b) => {
    const el = h('button', `ui-mbtn${b.kind ? ` ui-${b.kind}` : ''}`, b.text);
    el.type = 'button';
    el.addEventListener('click', () => { if (b.onClick?.(close) !== false) close(); });
    return el;
  });
  const box = h('div', 'ui-modal', h('div', 'ui-mbody', content), h('div', `ui-mbtns${btns.length === 1 ? ' ui-one' : ''}`, btns));
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  if (label) box.setAttribute('aria-label', label);
  const el = h('div', 'ui-overlay', box);
  let open = true;
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    onClose?.();
    prev?.focus?.();
  }
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(el);
  btns[btns.length - 1]?.focus();
  return { el, close };
}

export function confirmBox({ title = '', text = '', ok = '확인', cancel = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const content = h('div', 'ui-confirm', title ? h('b', null, title) : null, text ? h('p', null, text) : null);
    openModal({
      label: title || text,
      content,
      buttons: [{ text: cancel }, { text: ok, kind: danger ? 'danger' : 'primary', onClick: () => { answer = true; } }],
      onClose: () => resolve(answer),
    });
  });
}
