// [임시 껍데기] 손·버튼 모듈 자리. 진짜 ui/hand.js 가 병합 때 이 파일을 덮어쓴다.
// 약속: createHand(parent, ctx) → { el, update(view), event(e), dispose() }. 지금은 시험이 돌도록 단추만 단순하게 그린다.
import { requestFor } from '../actions.js';

export function createHand(parent, ctx) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;right:0;bottom:6px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;pointer-events:none;z-index:6';
  parent.appendChild(el);
  return {
    el,
    update(v) {
      el.replaceChildren();
      for (const a of (v && v.actions) || []) {
        if (!['place', 'bid', 'pass'].includes(a.a)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.gk = a.key;
        b.textContent = a.a === 'place' ? (a.k === 'F' ? '꽃' : '해골') : a.a === 'bid' ? String(a.n) : '패스';
        b.style.cssText = 'pointer-events:auto;min-width:34px;min-height:34px;padding:0 8px;border:1px solid #c9a45c;border-radius:6px;background:#f4ecda;color:#2a1f17;font-weight:700;cursor:pointer';
        b.addEventListener('click', () => { const r = requestFor(a); if (r) ctx.send(r); });
        el.append(b);
      }
    },
    event() {},
    dispose() { el.remove(); },
  };
}
