// 머리 위 기본 이모티콘 (CONTRACTS 1절 emote). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다.

// 그림은 myown client/src/ui/pins.js EMOTES 와 같은 6종, 같은 순서.
export const EMOTE_GLYPHS = ['👍', '😂', '😮', '😡', '😭', '🔥'];
export const EMOTE_SECS = 2;

export function createEmote(ctx) {
  const root = document.createElement('div');
  root.className = 'lg-em-root';
  ctx.root.appendChild(root);
  const live = new Map(); // id -> { el, left }

  function place(it, pos) {
    if (!pos) { it.el.hidden = true; return; }
    const w = root.clientWidth, h = root.clientHeight;
    // 글자(88px × --lg-k)가 화면 밖으로 잘리지 않게 반 폭·높이만큼 가둔다
    const half = it.el.offsetWidth / 2 || 48, tall = it.el.offsetHeight || 92;
    let x = pos.x, y = pos.y;
    if (w) x = Math.min(w - half, Math.max(half, x));
    if (h) y = Math.min(h, Math.max(tall, y));
    it.el.style.left = x + 'px';
    it.el.style.top = y + 'px';
    it.el.hidden = false;
  }
  function remove(id) {
    const it = live.get(id);
    if (!it) return;
    it.el.remove();
    live.delete(id);
  }
  function clear() { for (const id of [...live.keys()]) remove(id); }

  return {
    el: root,
    update(state) { if (state == null) clear(); },
    event(e) {
      if (!e || e.k !== 'emote') return;
      if (!Number.isInteger(e.e) || e.e < 0 || e.e > 5) return;
      if (typeof e.id !== 'string' && typeof e.id !== 'number') return;
      const pos = ctx.anchor(e.id);
      if (!pos) return;
      remove(e.id);
      const el = document.createElement('div');
      el.className = 'lg-em-pin';
      el.setAttribute('data-lg', 'emote');
      el.setAttribute('data-id', String(e.id));
      const g = document.createElement('span');
      g.className = 'lg-em-glyph';
      g.textContent = EMOTE_GLYPHS[e.e];
      el.appendChild(g);
      root.appendChild(el);
      const it = { el, left: EMOTE_SECS };
      live.set(e.id, it);
      place(it, pos);
    },
    frame(dt) {
      for (const [id, it] of [...live]) {
        it.left -= dt;
        if (it.left <= 0) { remove(id); continue; }
        place(it, ctx.anchor(id));
      }
    },
    dispose() { clear(); root.remove(); },
  };
}
