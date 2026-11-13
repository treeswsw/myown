// [임시 껍데기] 방 대기(색 고르기·시작) 모듈 자리. 진짜 ui/wait.js 가 병합 때 이 파일을 덮어쓴다.
// 약속: createWait(parent, ctx) → { el, update(view), event(e), dispose() }.
import { requestFor } from '../actions.js';
import { COLORS } from '../art.js';

export function createWait(parent, ctx) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;right:0;bottom:20px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;pointer-events:none;z-index:6';
  parent.appendChild(el);
  return {
    el,
    update(v) {
      el.replaceChildren();
      if (!v || v.phase !== 'lobby') return;
      for (const a of v.actions || []) {
        if (a.a !== 'color' && a.a !== 'start') continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.gk = a.key;
        b.textContent = a.a === 'color' ? COLORS[a.c].name : '시작';
        b.style.cssText = 'pointer-events:auto;min-height:34px;padding:0 12px;border:1px solid #c9a45c;border-radius:6px;background:#f4ecda;color:#2a1f17;font-weight:700;cursor:pointer';
        b.addEventListener('click', () => { const r = requestFor(a); if (r) ctx.send(r); });
        el.append(b);
      }
    },
    event() {},
    dispose() { el.remove(); },
  };
}
