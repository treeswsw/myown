// 요트다이스 결과 창(판이 끝났을 때). 순위는 state.result 에 들어 있다. 접기/다시 열기는 이 안에서만 처리한다.

const COLORS = ['#3b6fd4', '#d4573b', '#2f9e6e', '#8a55c9'];
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }

export function createResult({ host, getFace, getMe }) {
  const root = el('div', 'yt-rs');
  root.hidden = true;
  const dim = el('div', 'yt-rs-dim');
  const win = el('div', 'yt-rs-win');
  const body = el('div', 'yt-rs-body');
  body.dataset.yt = 'result';
  const title = el('h2', 'yt-rs-title');
  const big = el('span', '');
  const small = el('small', '');
  title.append(big, small);
  const list = el('div', 'yt-rs-list');
  const stat = el('p', 'yt-rs-stat');
  body.append(title, list, stat);
  const toggle = el('button', 'yt-rs-toggle');
  toggle.type = 'button';
  toggle.dataset.yt = 'result-toggle';
  win.append(body, toggle);
  root.append(dim, win);
  host.append(root);

  let open = true;
  let lastGame = null;

  function setOpen(v) {
    open = v;
    root.dataset.open = v ? '1' : '0';
    body.hidden = !v;
    toggle.textContent = v ? '점수표 보기' : '결과 보기';
    toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  toggle.addEventListener('click', () => setOpen(!open));

  function face(id, name) {
    const box = el('div', 'yt-rs-av');
    const src = getFace ? getFace(id) : null;
    if (typeof src === 'string' && JPEG.test(src)) {
      const img = el('img');
      img.alt = ''; img.draggable = false; img.src = src;
      box.append(img);
    } else {
      box.style.background = COLORS[hash(id) % COLORS.length];
      box.append(el('span', '', [...(name || '?')][0]));
    }
    return box;
  }

  function update(state) {
    const res = state && state.phase === 'result' ? state.result : null;
    if (!res) { root.hidden = true; lastGame = null; return; }
    root.hidden = false;
    if (lastGame !== state.gameNo) { lastGame = state.gameNo; setOpen(true); }
    else setOpen(open);

    const ranks = res.ranks || [];
    const winners = res.winners || [];
    if (!ranks.length) big.textContent = '게임 종료';
    else if (winners.length > 1) big.textContent = '공동 우승';
    else if (winners[0] === state.you) big.textContent = '승리!';
    else { const w = ranks.find((r) => r.id === winners[0]); big.textContent = `${w ? w.name : ''} 우승`; }
    small.textContent = res.reason === 'alone' ? '기권으로 종료' : `${state.rounds || 12}턴 종료`;

    list.replaceChildren();
    ranks.forEach((r, i) => {
      const row = el('div', 'yt-rs-row' + (r.rank === 1 ? ' yt-rs-first' : ''));
      row.dataset.yt = 'rank-' + i;
      row.append(el('em', '', String(r.rank)), face(r.id, r.name), el('span', '', r.name || ''), el('b', '', String(r.total)));
      list.append(row);
    });

    const me = getMe ? getMe() : null;
    const st = (me && me.stats && me.stats.yacht) || {};
    stat.textContent = `요트다이스 ${st.games || 0}판 · 우승 ${st.wins || 0}회 · 최고 ${st.best || 0}점`;
  }

  function dispose() { root.remove(); }

  setOpen(true);
  return { el: root, update, dispose };
}
