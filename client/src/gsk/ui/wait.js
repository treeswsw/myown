// 갱스껄 대기실 개인 칸: 내 색 고르기 (공통 대기실의 waitPart('gk-color')). 사용자 글자는 textContent 로만.
// 방 설정은 없고, 대기실의 나머지(참가자·시작·나가기·채팅)는 공통 대기실이 그린다. 시작 버튼은 여기 두지 않는다.
// createColorPart({ send }) → { el, update(state), dispose() }   state = 방 상태(wait.own 에 사람마다 { color })
import './wait.css';
import { pickColor } from '../actions.js';
import { COLORS, matUrl } from '../art.js';
import { colorStates } from './result.pure.js';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createColorPart({ send }) {
  const el = h('div', 'gk-wt-colors');
  let sig = '';
  let disposed = false;

  function update(state) {
    if (disposed) return;
    const cs = colorStates(state);
    const next = JSON.stringify(cs.map((c) => [c.state, c.by]));
    if (next === sig) return;
    sig = next;
    el.textContent = '';
    for (const c of cs) {
      const b = h('button', 'gk-wt-color gk-wt-' + c.state);
      b.type = 'button';
      b.dataset.gk = `color-${c.c}`;
      b.title = COLORS[c.c].name + (c.state === 'taken' ? ` (${c.by} 님)` : '');
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(c.state === 'mine'));
      const im = h('img', 'gk-wt-mat');
      im.alt = '';
      im.draggable = false;
      im.src = matUrl(c.c, false);
      b.append(im, h('span', 'gk-wt-cname', COLORS[c.c].name));
      if (c.state === 'taken') b.disabled = true;
      else b.addEventListener('click', () => { if (!disposed && c.state !== 'mine') send(pickColor(c.c)); });
      el.append(b);
    }
  }

  return {
    el,
    update,
    dispose() {
      disposed = true;
      el.remove();
    },
  };
}
