// 머리 위 기본 이모티콘 (COMMON-CONTRACT 4-1, 요트 yt-em 방식: 2초 떠 있다 사라짐). 자리는 게임의 anchorOf(id).
// 사진·사운드 이름표는 emotePanel 이 그대로 그리고, 자리는 같은 anchorOf 를 쓴다(main.js 가 getAnchor 로 넘김).
// createFloat(root, anchorOf) -> { emote(id, i), frame(dt), clear() }
import { h } from '../ui/dom.js';
import { emoteGlyphs } from '../ui/pins.js';

const LIFE = 2;

export function createFloat(root, anchorOf) {
  const live = new Map(); // id -> { el, t }
  const place = (id, el) => {
    const a = anchorOf(id);
    el.style.visibility = a ? '' : 'hidden';
    if (!a) return;
    el.style.left = `${Math.min(innerWidth - 30, Math.max(30, a.x))}px`;
    el.style.top = `${Math.min(innerHeight - 10, Math.max(60, a.y))}px`;
  };
  return {
    emote(id, i) {
      const g = emoteGlyphs[i];
      if (!g || !anchorOf(id)) return;
      live.get(id)?.el.remove();
      const el = h('div', 'rm-em', g);
      root.append(el);
      place(id, el);
      live.set(id, { el, t: LIFE });
    },
    frame(dt) {
      for (const [id, it] of live) {
        it.t -= dt;
        if (it.t <= 0) { it.el.remove(); live.delete(id); } else place(id, it.el);
      }
    },
    clear() { for (const it of live.values()) it.el.remove(); live.clear(); },
  };
}
