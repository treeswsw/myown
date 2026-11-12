import { h, svg, fmt } from './dom.js';
import { TOP } from './icons.js';
import { emoteGlyphs } from './pins.js';
import { isMuted, setMuted } from '../audio.js';

const RANKS = [
  ['로열 플러시', 'A K Q J 10 같은 무늬'], ['스트레이트 플러시', '같은 무늬 연속 5장'], ['포카드', '같은 숫자 4장'],
  ['풀하우스', '트리플 + 원페어'], ['플러시', '같은 무늬 5장'], ['스트레이트', '연속된 숫자 5장'],
  ['트리플', '같은 숫자 3장'], ['투페어', '페어 2개'], ['원페어', '같은 숫자 2장'], ['하이카드', '위 족보가 없을 때'],
];

const circle = (icon, label, big = false) => {
  const b = h('button', `ic ${big ? 'big' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.append(svg(icon));
  return b;
};

// Top-left icon row (menu, emote, hand ranks, stats, sound) and the room info at the top right.
export function createHud(ui, { send, getMe }) {
  const row = h('div', 'hud-tl');
  const info = h('div', 'hud-tr');
  const msg = h('span');
  const leaveBtn = h('button', '', '나가기');
  leaveBtn.type = 'button';
  leaveBtn.onclick = () => send({ t: 'leave' });
  const notice = h('div', 'notice', msg, leaveBtn);
  ui.append(row, info, notice);
  let panel = null;
  let room = null;

  const closePanel = () => { panel?.remove(); panel = null; };
  const open = (key, ...kids) => {
    const same = panel?.dataset.key === key;
    closePanel();
    if (same) return;
    panel = h('div', 'hpanel', ...kids);
    panel.dataset.key = key;
    ui.append(panel);
  };

  const logo = circle(TOP.logo, '메뉴', true);
  logo.onclick = () => {
    const leave = h('button', 'item', '나가기');
    leave.onclick = () => { closePanel(); send({ t: 'leave' }); };
    open('menu', h('h3', '', '메뉴'), leave);
  };
  const emote = circle(TOP.emote, '이모티콘');
  emote.onclick = () => {
    const grid = h('div', 'emotes', emoteGlyphs.map((g, i) => {
      const b = h('button', '', g);
      b.onclick = () => { send({ t: 'emote', e: i }); closePanel(); };
      return b;
    }));
    open('emote', grid);
  };
  const ranks = circle(TOP.ranks, '족보표');
  ranks.onclick = () => open('ranks', h('h3', '', '족보표'), h('div', 'hr', RANKS.flatMap(([a, b]) => [h('b', '', a), h('span', '', b)])));
  const stats = circle(TOP.stats, '전적');
  stats.onclick = () => {
    const me = getMe();
    if (!me) return;
    const s = me.stats ?? {};
    const line = (k, v) => h('div', 'stat', k, h('b', '', fmt(v ?? 0)));
    open('stats', h('h3', '', me.name), line('보유 칩', me.bank), line('홀덤 판수', s.hands), line('홀덤 승리', s.wins), line('최고 획득', s.biggestWin),
      line('리필', s.refills), line('블러핑 판수', s.bluffGames), line('블러핑 승리', s.bluffWins));
  };
  const sound = circle(isMuted() ? TOP.muted : TOP.sound, '소리');
  sound.onclick = () => {
    setMuted(!isMuted());
    sound.replaceChildren(svg(isMuted() ? TOP.muted : TOP.sound));
  };
  row.append(logo, emote, ranks, stats, sound);
  document.addEventListener('pointerdown', (e) => { if (panel && !panel.contains(e.target) && !row.contains(e.target)) closePanel(); });

  return {
    update(r) {
      room = r;
      row.style.display = info.style.display = r ? '' : 'none';
      const me = r?.players.find((p) => p.id === r.you);
      // The menu is always there, but spectators and the result screen get a plain leave button too.
      const out = me?.eliminated;
      const text = out ? '탈락했습니다. 관전 중' : me?.spectating && r.phase === 'playing' ? '다음 판부터 참가합니다' : '';
      msg.textContent = text;
      notice.style.display = r && (text || me?.spectating || r.phase === 'result') ? '' : 'none';
      notice.classList.toggle('solo', !text);
      if (!r) { closePanel(); return; }
      const sub = r.mode === 'holdem' ? '텍사스 홀덤 · 블라인드 50/100'
        : r.phase === 'lobby' ? '블러핑 카드 · 대기 중'
        : `블러핑 카드 · ${r.round ?? 0}라운드 · ${r.players.filter((p) => p.alive !== false).length}명 생존`;
      info.replaceChildren(sub);
    },
  };
}
