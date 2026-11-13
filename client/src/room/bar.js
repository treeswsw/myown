// 게임 중 상단 줄 (COMMON-CONTRACT 4-1): 방 코드 · 소리 · 이모티콘 · 나가기. 시작 버튼은 두지 않는다(대기실 안에만).
// 이모티콘 창 열고 닫기·바깥 누름 닫기는 createEmoteToggle 하나.
import { h, svg } from '../ui/dom.js';

export const ICON = {
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  emo: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0M9 9.8v.4M15 9.8v.4"/>',
};

/** 소리 켜기/끄기 버튼(대기실 머리줄·상단 줄 공용). sound = sound/core.js. -> { el, dispose() } */
export function soundButton(sound, cls) {
  const b = h('button', cls);
  b.type = 'button';
  const paint = (m = sound.isMuted()) => {
    b.replaceChildren(svg(m ? ICON.mute : ICON.sound));
    b.setAttribute('aria-label', m ? '소리 켜기' : '소리 끄기');
    b.setAttribute('aria-pressed', String(m));
  };
  b.addEventListener('click', () => sound.setMuted(!sound.isMuted()));
  paint();
  const off = sound.onMute(paint);
  return { el: b, dispose: off };
}

/** 이모티콘 창(.hpanel.lgpanel, style.css) 하나. 등록한 버튼이 아닌 곳을 누르면 닫힌다. */
export function createEmoteToggle(ui, emotePanel) {
  let panel = null;
  const owners = new Set();
  const close = () => { panel?.remove(); panel = null; };
  const open = () => { if (panel) return; panel = h('div', 'hpanel lgpanel', emotePanel.el); ui.append(panel); };
  document.addEventListener('pointerdown', (e) => {
    if (!panel || panel.contains(e.target)) return;
    for (const b of owners) if (b.contains(e.target)) return;
    close();
  });
  return {
    open, close,
    toggle() { if (panel) close(); else open(); },
    isOpen: () => Boolean(panel),
    owner(el) { owners.add(el); return el; }, // 이 버튼을 누르는 것은 "바깥 누름"이 아니다
  };
}

/** createRoomBar({ui, sound, emote, onLeave}) -> { el, update(state, entry), dispose() } */
export function createRoomBar({ ui, sound, emote, onLeave }) {
  const code = h('span', 'rm-code');
  const snd = soundButton(sound, 'rm-btn rm-ic');
  snd.el.dataset.rm = 'bar-sound';
  const emo = h('button', 'rm-btn', '이모티콘');
  emo.type = 'button';
  emo.dataset.rm = 'bar-emote';
  emo.addEventListener('click', () => emote.toggle());
  emote.owner(emo);
  const leave = h('button', 'rm-btn', '나가기');
  leave.type = 'button';
  leave.dataset.rm = 'bar-leave';
  leave.addEventListener('click', () => onLeave());
  const el = h('div', 'rm-bar', code, h('span', 'rm-sp'), snd.el, emo, leave);
  el.hidden = true;
  ui.append(el);
  return {
    el,
    update(state, entry) {
      code.textContent = `방 코드 ${state.code}`;
      const v = entry?.bar?.leftVar;
      el.style.left = v ? `var(${v}, 0px)` : '';
    },
    dispose() { snd.dispose(); el.remove(); },
  };
}
