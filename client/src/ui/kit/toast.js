// 공용 알림 (COMMON-CONTRACT 4-1, main.js 의 옛 toast 대체). 화면 아래 가운데, 최대 3개 쌓임.
// toast(text, {kind?:'info'|'error', ms=3000, key?, onClick?}) -> el
//   key(없으면 글 자체)가 같은 알림이 떠 있으면 새로 쌓지 않고 그 글을 바꾼다. onClick 이 있으면 눌러야 하고, ms=0 이면 누를 때까지 남는다.
import './kit.css';
import { h } from '../dom.js';

const MAX = 3;
let stack = null;

export function toast(text, { kind = 'info', ms = 3000, key, onClick } = {}) {
  if (!stack || !stack.isConnected) { stack = h('div', 'ui-toasts'); document.body.append(stack); }
  key ??= String(text ?? ''); // 같은 글은 쌓지 않고 다시 띄운다
  let el = key ? [...stack.children].find((c) => c.dataset.key === key) : null;
  if (el) { el.textContent = String(text ?? ''); clearTimeout(el._t); } else {
    el = h('div', `ui-toast ui-${kind}`, String(text ?? ''));
    el.setAttribute('role', 'status');
    if (key) el.dataset.key = key;
    stack.append(el);
    while (stack.children.length > MAX) stack.firstChild.remove();
  }
  if (onClick) { el.classList.add('ui-hit'); el.onclick = onClick; }
  if (ms > 0) el._t = setTimeout(() => el.remove(), ms);
  return el;
}
