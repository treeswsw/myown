// 로비의 "혼자 놀기" 칸 (docs/solo/PLAN.md 4-3). 종목 카드(이름·한 줄 설명·내 최고) -> 고르면 그 종목 순위 칸 + "시작" 버튼.
// 로비가 스위치가 켜졌을 때만 이 파일을 따로 불러온다(포커만 하는 사람 낭비 없음). CSS .so-pk-, 순위 칸은 rank.js(.so-rk-).
// createSoloLobby({ send, onStart(game) }) -> { el, setUser(user|null), feed(msg), show() }
import './solo.css';
import { h } from '../ui/dom.js';
import { META } from '../../../shared/solo/meta.js';
import { createRankPanel } from './rank.js';
import { fmtScore } from './flow.js';

export function createSoloLobby({ send, onStart }) {
  let picked = META[0].id;
  let user = null;
  const rank = createRankPanel({ send, limit: 5 });
  const cards = META.map((m) => {
    const best = h('span', 'so-pk-best');
    const b = h('button', 'so-pk-card', h('b', 'so-pk-name', m.name), h('span', 'so-pk-desc', m.desc), best);
    b.type = 'button';
    b.dataset.so = `pick-${m.id}`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { picked = m.id; paint(); rank.show(picked); });
    return { id: m.id, b, best };
  });
  const group = h('div', 'so-pk-list', ...cards.map((c) => c.b));
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', '혼자 놀기 종목');
  const startBtn = h('button', 'lb-btn lb-primary so-pk-start', '시작');
  startBtn.type = 'button';
  startBtn.dataset.so = 'start';
  startBtn.addEventListener('click', () => onStart?.(picked));
  const el = h('div', 'so-pk', group, h('div', 'so-pk-rank', rank.el), startBtn);
  el.dataset.so = 'lobby';

  function paint() {
    for (const c of cards) {
      c.b.setAttribute('aria-checked', String(c.id === picked));
      const best = user?.solo?.[c.id]?.best;
      c.best.textContent = Number.isFinite(best) && best > 0 ? `내 최고 ${fmtScore(best)}` : '아직 기록 없음';
    }
  }
  paint();
  let shown = false;
  return {
    el,
    setUser(u) { user = u; paint(); },
    feed: (msg) => rank.feed(msg),
    // 처음 보일 때 한 번 순위를 묻는다
    show() { if (!shown) { shown = true; rank.show(picked); } },
  };
}
