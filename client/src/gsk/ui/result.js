// [임시 껍데기] 벌칙·결과 모듈 자리. 진짜 ui/result.js 가 병합 때 이 파일을 덮어쓴다.
// 약속: createResult(parent, ctx) → { el, update(view), event(e), dispose() }.
import { requestFor } from '../actions.js';

export function createResult(parent, ctx) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;padding-bottom:70px;pointer-events:none;z-index:7';
  parent.appendChild(el);
  const mk = (a, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.gk = a.key;
    b.textContent = label;
    b.style.cssText = 'pointer-events:auto;min-height:34px;padding:0 12px;border:1px solid #c9a45c;border-radius:6px;background:#f4ecda;color:#2a1f17;font-weight:700;cursor:pointer';
    b.addEventListener('click', () => { const r = requestFor(a); if (r) ctx.send(r); });
    return b;
  };
  return {
    el,
    update(v) {
      el.replaceChildren();
      if (!v) return;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px';
      for (const a of v.actions || []) {
        if (a.a === 'discard') row.append(mk(a, a.k !== undefined ? (a.k === 'F' ? '꽃' : '해골') : '?'));
        else if (a.a === 'start' && v.phase === 'result') row.append(mk(a, '한 판 더'));
      }
      if (v.phase === 'result' && v.result) {
        const box = document.createElement('div');
        box.dataset.gk = 'result';
        box.style.cssText = 'background:rgba(0,0,0,.75);padding:10px 18px;border-radius:12px;color:#fff';
        const t = document.createElement('div');
        t.style.fontWeight = '800';
        t.textContent = v.result.winner ? '갱스껄 승리!' : '판 끝';
        box.append(t);
        for (const r of v.result.ranks || []) {
          const d = document.createElement('div');
          d.textContent = `${r.rank}위 ${r.name} - ${r.points}점, 원판 ${r.discs}`;
          box.append(d);
        }
        el.append(box);
      }
      if (row.childNodes.length) el.append(row);
    },
    event() {},
    dispose() { el.remove(); },
  };
}
