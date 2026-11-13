// 전체 랭킹 창 (CONTRACTS 1절 rank). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다.

const PHASES = ['lobby', 'result'];

// 순수. top: [{name,score,games}] (점수 큰 순), mine: {rank|null, score}
// → { rows: [{rank,name,score,games}], mine: 글자 }. 점수가 같으면 같은 순위(공동 순위, 다음은 건너뜀).
export function rankLines(top, mine) {
  const list = Array.isArray(top) ? top : [];
  const rows = [];
  list.forEach((r, i) => {
    const prev = rows[i - 1];
    const score = Number(r && r.score) || 0;
    const rank = prev && prev.score === score ? prev.rank : i + 1;
    rows.push({ rank, name: String((r && r.name) ?? ''), score, games: Number(r && r.games) || 0 });
  });
  let text = '아직 순위 없음';
  if (mine && Number.isInteger(mine.rank)) text = `내 순위 ${mine.rank}위 · ${Number(mine.score) || 0}점`;
  return { rows, mine: text };
}

const el = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};

export function createRank(ctx) {
  const root = el('div', 'lg-rk-root');
  root.hidden = true;
  const panel = el('div', 'lg-rk-panel', { 'data-lg': 'rank-panel', role: 'dialog', 'aria-label': '전체 랭킹' });
  panel.hidden = true;
  const head = el('div', 'lg-rk-head');
  const title = el('div', 'lg-rk-title');
  title.textContent = '전체 랭킹';
  const close = el('button', 'lg-rk-close', { type: 'button', 'data-lg': 'rank-close' });
  close.textContent = '닫기';
  head.append(title, close);
  const body = el('div', 'lg-rk-body', { role: 'status' });
  const mineEl = el('div', 'lg-rk-mine', { 'data-lg': 'rank-mine' });
  panel.append(head, body, mineEl);
  root.appendChild(panel);
  ctx.root.appendChild(root);

  const open = el('button', 'lg-rk-open', { type: 'button', 'data-lg': 'rank-open' });
  open.textContent = '전체 랭킹';
  open.hidden = true;
  ctx.action.appendChild(open);

  let opened = false;

  function setLoading() {
    body.replaceChildren();
    const p = el('div', 'lg-rk-note');
    p.textContent = '불러오는 중';
    body.appendChild(p);
    mineEl.hidden = true;
  }
  function hide() { opened = false; panel.hidden = true; root.hidden = true; }

  open.addEventListener('click', () => {
    opened = true;
    root.hidden = false;
    panel.hidden = false;
    setLoading();
    ctx.send({ t: 'lg', a: 'rank' });
  });
  close.addEventListener('click', hide);

  return {
    el: root,
    update(state) {
      const on = !!state && PHASES.includes(state.phase);
      open.hidden = !on;
      if (!on) hide();
    },
    event(e) {
      if (!e || e.k !== 'lgRank' || !opened) return;
      const { rows, mine } = rankLines(e.top, e.mine);
      body.replaceChildren();
      if (!rows.length) {
        const p = el('div', 'lg-rk-note');
        p.textContent = '아직 기록이 없어요';
        body.appendChild(p);
      }
      for (const r of rows) {
        const row = el('div', 'lg-rk-row', { 'data-lg': 'rank-row' });
        const a = el('span', 'lg-rk-no'); a.textContent = String(r.rank);
        const b = el('span', 'lg-rk-name'); b.textContent = r.name;
        const c = el('span', 'lg-rk-score'); c.textContent = `${r.score}점`;
        const d = el('span', 'lg-rk-games'); d.textContent = `${r.games}판`;
        row.append(a, b, c, d);
        body.appendChild(row);
      }
      mineEl.textContent = mine;
      mineEl.hidden = false;
    },
    dispose() { root.remove(); open.remove(); },
  };
}
