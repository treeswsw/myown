// 혼자 놀기 순위 칸 (docs/solo/PLAN.md 4-3). 로비(종목 고르기 아래)와 결과 화면이 같이 쓴다.
// 서버 답 {t:'soRank', game, week, all:{top:[{name,score,at}], mine:{rank,score,at,n}}, wk:{top, mine}} 를 feed 로 받는다.
// 탭 `전체 | 이번 주`, 상위 limit 줄 + 내 순위 줄, "더 보기"(상위 20 까지 그 자리에서 펼침). 사용자 글자는 textContent 로만.
// CSS 는 solo.css(.so-rk-) — 이 파일은 CSS 를 불러오지 않는다(node 시험). 불러오는 쪽이 solo.css 를 import 한다.
import { h } from '../ui/dom.js';

export const TOP_MAX = 20;
export const TABS = [['all', '전체'], ['wk', '이번 주']];

// 한국 시간 "11.14"
export function fmtDate(at) {
  if (!Number.isFinite(at) || at <= 0) return '';
  const d = new Date(at + 9 * 3600_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

const num = (n) => Number(n || 0).toLocaleString('ko-KR');

// 그릴 값 (순수 함수, 시험용). data = soRank 답 또는 null, tab = 'all' | 'wk', limit = 접었을 때 줄 수, open = 펼침
export function rankModel(data, tab, limit = 5, open = false) {
  const part = data?.[tab];
  if (!part) return { loading: true, rows: [], mine: null, mineOut: false, more: false, empty: false };
  const top = (Array.isArray(part.top) ? part.top : []).slice(0, TOP_MAX);
  const shown = open ? top : top.slice(0, limit);
  const mineRank = Number.isInteger(part.mine?.rank) ? part.mine.rank : null;
  const rows = shown.map((r, i) => ({
    rank: i + 1, name: String(r.name ?? ''), score: num(r.score), date: fmtDate(r.at), me: mineRank === i + 1,
  }));
  const mine = part.mine && mineRank ? { rank: mineRank, score: num(part.mine.score), date: fmtDate(part.mine.at), n: part.mine.n ?? 0 } : null;
  return {
    loading: false, rows, mine,
    mineOut: Boolean(mine) && mineRank > shown.length, // 내 순위가 보이는 줄 밖이면 아래에 따로
    more: !open && top.length > limit,
    empty: top.length === 0,
  };
}

// createRankPanel({send, limit = 5}) -> { el, show(game), feed(msg), setTab(t), dispose() }
export function createRankPanel({ send, limit = 5 }) {
  let game = null;
  let tab = 'all';
  let open = false;
  const cache = new Map(); // game -> 마지막 답
  const tabBtns = TABS.map(([k, label]) => {
    const b = h('button', 'so-rk-tab', label);
    b.type = 'button';
    b.dataset.so = `rank-tab-${k}`;
    b.addEventListener('click', () => { tab = k; render(); });
    return b;
  });
  const list = h('ol', 'so-rk-list');
  const mineRow = h('div', 'so-rk-mine');
  const note = h('p', 'so-rk-note');
  const more = h('button', 'so-rk-more', '더 보기');
  more.type = 'button';
  more.dataset.so = 'rank-more';
  more.addEventListener('click', () => { open = true; render(); });
  const el = h('div', 'so-rk', h('div', 'so-rk-tabs', tabBtns), list, mineRow, note, more);
  el.dataset.so = 'rank';

  function line(r) {
    const li = h('li', `so-rk-row${r.me ? ' so-rk-me' : ''}`,
      h('span', 'so-rk-n', String(r.rank)), h('span', 'so-rk-name', r.name), h('span', 'so-rk-sc', r.score), h('span', 'so-rk-dt', r.date));
    return li;
  }

  function render() {
    tabBtns.forEach((b, i) => {
      const on = TABS[i][0] === tab;
      b.classList.toggle('so-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const m = rankModel(game ? cache.get(game) : null, tab, limit, open);
    list.replaceChildren(...m.rows.map(line));
    list.hidden = !m.rows.length;
    note.hidden = !(m.loading || m.empty);
    note.textContent = m.loading ? '순위를 불러오는 중…' : m.empty ? '아직 기록이 없어요. 첫 기록을 세워 보세요!' : '';
    more.hidden = !m.more;
    mineRow.hidden = !m.mine || !m.mineOut;
    if (m.mine && m.mineOut) {
      mineRow.replaceChildren(h('span', 'so-rk-n', String(m.mine.rank)), h('span', 'so-rk-name', '내 순위'), h('span', 'so-rk-sc', m.mine.score), h('span', 'so-rk-dt', m.mine.date));
    } else mineRow.replaceChildren();
    el.classList.toggle('so-rk-open', open);
  }

  render();
  return {
    el,
    // 종목을 바꾸거나 새로 보인다: 기억해 둔 답을 먼저 보이고 서버에 다시 묻는다
    show(g) {
      if (g !== game) { game = g; open = false; }
      render();
      if (g) send({ t: 'so', a: 'rank', game: g });
    },
    feed(msg) {
      if (!msg || typeof msg.game !== 'string') return false;
      cache.set(msg.game, msg);
      if (msg.game === game) render();
      return true;
    },
    setTab(t) { if (TABS.some(([k]) => k === t)) { tab = t; render(); } },
    dispose() { el.remove(); cache.clear(); },
  };
}
