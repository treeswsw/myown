// 요트다이스 점수표(왼쪽). 규칙·점수 계산은 하지 않는다: 점수·합계·예상 점수는 방 상태에 들어 있다.
// 두 번 눌러 기록: 첫 누름 = {t:'yt',a:'pick',cat}, 선택된 칸(state.pick)을 다시 누름 = {t:'yt',a:'score',cat}.
// 강조는 state.pick 만 보고 그린다(내가 누른 직후의 임시 강조만 예외, 다음 상태가 오면 상태를 따른다).

const UP = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LO = ['choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
const ALL = [...UP, ...LO];
const NAME = {
  ones: '에이스', twos: '듀스', threes: '트레이', fours: '포', fives: '파이브', sixes: '식스',
  choice: '초이스', fourKind: '포카드', fullHouse: '풀하우스', smallStraight: 'S 스트레이트', largeStraight: 'L 스트레이트', yacht: '요트',
};
const PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
import { createWho } from './who.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function sv(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function svg(children, cls) {
  const s = sv('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', class: cls });
  for (const c of children) s.append(c);
  return s;
}
const dot = (x, y, r, fill) => sv('circle', { cx: x, cy: y, r, fill });
const pips = (list, r, fill) => list.map((i) => dot(5 + (i % 3) * 5, 5 + Math.floor(i / 3) * 5, r, fill));

function icon(k) {
  const d = '#1a1613';
  const i = UP.indexOf(k);
  if (i >= 0) return svg([sv('rect', { x: 1, y: 1, width: 18, height: 18, rx: 3.5, fill: d }), ...pips(PIP[i + 1], 1.9, '#fff')], 'yt-sc-ico');
  const c = (x, y) => dot(x, y, 2.1, d);
  let list;
  if (k === 'choice') list = pips([0, 2, 4, 6, 8], 2.1, d);
  else if (k === 'fourKind') list = [c(6, 6), c(14, 6), c(6, 14), c(14, 14)];
  else if (k === 'fullHouse') list = [c(4, 6), c(10, 6), c(16, 6), c(7, 14), c(13, 14)];
  else if (k === 'smallStraight') list = [c(3, 16), c(7.7, 12), c(12.3, 8), c(17, 4)];
  else if (k === 'largeStraight') list = [c(2.5, 17), c(6.2, 13.5), c(10, 10), c(13.8, 6.5), c(17.5, 3)];
  else list = [sv('path', { d: 'M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.8z', fill: d })];
  return svg(list, 'yt-sc-ico');
}
function crown() {
  return svg([sv('path', { d: 'M2 15h16l1-9-5 4-4-7-4 7-5-4z', fill: '#ffc62a', stroke: '#1a1613', 'stroke-width': 1.6, 'stroke-linejoin': 'round' })], 'yt-sc-crown');
}

export function createSheet({ host, send, who = createWho() }) {
  const root = el('div', 'yt-sc');
  root.dataset.yt = 'sheet';
  host.append(root);

  let state = null;
  let settled = true;
  let localPick = null;          // 누른 직후의 임시 강조(다음 update 에서 지운다)
  let key = '';
  let refs = null;
  const timers = new Set();

  function build(cols) {
    root.replaceChildren();
    const n = Math.max(1, cols.length);
    root.style.setProperty('--n', String(n));
    root.dataset.n = String(n);
    const r = { n, head: [], cells: {}, rows: {}, sub: [], bon: [], tot: [], away: [], drop: [], face: [], nameEl: [], crown: [] };

    const row = (cls, label, cellFn) => {
      const w = el('div', 'yt-sc-row ' + cls);
      w.append(label);
      for (let i = 0; i < n; i++) w.append(cellFn(i));
      return w;
    };
    const lab = (k, text) => {
      const l = el('div', 'yt-sc-lab');
      if (k) l.append(icon(k));
      l.append(el('span', '', text));
      return l;
    };
    const header = (second) => {
      const t = el('div', second ? 'yt-sc-turn yt-sc-hint' : 'yt-sc-turn');
      if (second) { r.hint = t; t.dataset.yt = 'hint'; }
      else {
        t.append(el('span', '', '턴'));
        r.round = el('b', '');
        r.round.dataset.yt = 'round';
        t.append(r.round);
      }
      return row('yt-sc-hd yt-sc-first' + (second ? ' yt-sc-hd2' : ''), t, (i) => {
        const c = el('div', 'yt-sc-pc');
        if (second) return c;
        c.dataset.yt = 'head-' + i;
        const face = el('div', 'yt-sc-av');
        const nm = el('span', '');
        const away = el('em', 'yt-sc-badge', '끊김');
        away.dataset.yt = 'away-' + i;
        const drop = el('em', 'yt-sc-badge', '기권');
        drop.dataset.yt = 'drop-' + i;
        away.hidden = true; drop.hidden = true;
        const cr = crown(); cr.style.display = 'none';
        c.append(face, nm, away, drop, cr);
        r.head[i] = c; r.face[i] = face; r.nameEl[i] = nm; r.away[i] = away; r.drop[i] = drop; r.crown[i] = cr;
        return c;
      });
    };
    const cat = (k, gap) => {
      r.cells[k] = [];
      const w = row('yt-sc-cat' + (gap ? ' yt-sc-gap' : ''), lab(k, NAME[k]), (i) => {
        const c = el('div', 'yt-sc-c');
        c.dataset.yt = `cell-${k}-${i}`;
        r.cells[k][i] = c;
        return c;
      });
      r.rows[k] = w;
      return w;
    };

    const A = el('div', 'yt-sc-blk');
    const B = el('div', 'yt-sc-blk');
    A.append(header(false));
    for (const k of UP) A.append(cat(k));
    A.append(row('yt-sc-sub', lab(null, '소계'), (i) => { const c = el('div', 'yt-sc-s'); r.sub[i] = c; return c; }));
    A.append(row('yt-sc-bon', lab(null, '보너스 +35'), (i) => { const c = el('div', 'yt-sc-b'); r.bon[i] = c; return c; }));
    A.append(el('div', 'yt-sc-note', '1~6 칸 합이 63점 이상이면 보너스 +35'));
    B.append(header(true));
    LO.forEach((k, j) => B.append(cat(k, j === 0)));
    B.append(row('yt-sc-tot yt-sc-gap', lab(null, '합계'), (i) => {
      const c = el('div', 'yt-sc-c');
      c.dataset.yt = 'total-' + i;
      r.tot[i] = c;
      return c;
    }));
    root.append(A, B);
    return r;
  }

  function setFace(i, c) {
    const box = refs.face[i];
    const k = who.key(c.id) + '|' + (c.name || '?');
    if (box.dataset.k === k) return;
    box.dataset.k = k;
    box.replaceChildren(who.face(c.id, c.name, 'yt-sc-avi', 32));
  }

  // 칸 안: 숫자(.yt-sc-n)와 작은 글(.yt-sc-tag)
  function setCell(c, num, tag) {
    let n = c.firstChild, t = c.lastChild;
    if (!n || n.className !== 'yt-sc-n') { c.replaceChildren(); n = el('span', 'yt-sc-n'); t = el('span', 'yt-sc-tag'); c.append(n, t); }
    if (n.textContent !== num) n.textContent = num;
    if (t.textContent !== tag) t.textContent = tag;
    t.style.display = tag ? '' : 'none';
  }

  function render() {
    const next = state;
    if (!next) { root.hidden = true; return; }
    root.hidden = false;
    const cols = next.cols || [];
    const k = cols.map((c) => c.id).join('|') + '#' + cols.length;
    if (k !== key || !refs) { key = k; refs = build(cols); }
    const playing = next.phase === 'playing';
    const mineIdx = cols.findIndex((c) => c.id === next.you);
    const myTurn = playing && next.turn === next.you && mineIdx >= 0;
    const canPress = myTurn && !!next.preview && settled && !next.waiting;
    const winners = next.result && next.result.winners ? next.result.winners : [];
    const showWin = next.phase === 'result';
    const pickOf = (c, i) => (i === mineIdx && localPick ? localPick : (playing && c.id === next.turn ? next.pick : null));

    refs.round.textContent = next.phase === 'lobby' ? '-' : `${next.round || 0}/${next.rounds || 12}`;
    const effMine = mineIdx >= 0 ? pickOf(cols[mineIdx], mineIdx) : null;
    refs.hint.textContent = canPress ? (effMine ? '한 번 더 누르면 기록' : '노란 칸을 두 번 눌러 기록') : '';

    cols.forEach((c, i) => {
      const on = playing && c.id === next.turn;
      const win = showWin && winners.includes(c.id);
      const player = (next.players || []).find((p) => p.id === c.id);
      const away = !!player && player.connected === false && !c.left;
      const col = (cls) => cls + (on || win ? ' yt-sc-on' : '') + (c.left ? ' yt-sc-off' : '');
      refs.head[i].className = col('yt-sc-pc');
      refs.nameEl[i].textContent = c.name || '';
      refs.away[i].hidden = !away;
      refs.drop[i].hidden = !c.left;
      refs.crown[i].style.display = win ? '' : 'none';
      setFace(i, c);

      const pk = pickOf(c, i);
      const mine = i === mineIdx;
      for (const cat of ALL) {
        const cell = refs.cells[cat][i];
        const v = c.scores ? c.scores[cat] : null;
        let cls = col('yt-sc-c'), num = '', tag = '';
        const pv = mine && v == null && canPress && next.preview[cat] != null;
        if (v != null) num = String(v);
        else if (pv) { num = String(next.preview[cat]); cls = 'yt-sc-c yt-sc-pv' + (next.preview[cat] === 0 ? ' yt-sc-zero' : ''); }
        const sel = pk === cat;
        if (sel) { cls += ' yt-sc-sel'; tag = mine ? '한 번 더' : '고민 중'; }
        if (cell.classList.contains('yt-sc-flash')) cls += ' yt-sc-flash';
        if (cell.className !== cls) cell.className = cls;
        setCell(cell, num, tag);
        const mark = cell.querySelector('[data-yt="pickmark"]');
        if (sel && !mine) { if (!mark) { const m = el('i', 'yt-sc-mark'); m.dataset.yt = 'pickmark'; cell.append(m); } }
        else if (mark) mark.remove();
      }
      const u = c.upper || 0;
      const sub = refs.sub[i];
      const sk = u + '|' + (u >= 63 ? 1 : 0);
      if (sub.dataset.k !== sk) {
        sub.dataset.k = sk;
        sub.className = 'yt-sc-s' + (u >= 63 ? ' yt-sc-ok' : '');
        sub.replaceChildren(el('b', '', String(u)), document.createTextNode('/63'));
      }
      const allUp = UP.every((cat) => c.scores && c.scores[cat] != null);
      refs.bon[i].className = 'yt-sc-b' + (c.bonus >= 35 ? ' yt-sc-ok' : '');
      refs.bon[i].textContent = c.bonus >= 35 ? '+35' : (allUp ? '+0' : '');
      const t = refs.tot[i];
      t.className = col('yt-sc-c') + (win ? ' yt-sc-win' : '');
      t.textContent = next.phase === 'lobby' ? '' : String(c.total || 0);
    });

    // 내 줄의 눌리는 가로줄(빈칸만). 이미 있는 버튼은 그대로 두고 필요 없는 것만 지운다(누르는 도중 바뀌지 않게).
    for (const cat of ALL) {
      const rowEl = refs.rows[cat];
      let btn = rowEl.querySelector('button');
      const want = canPress && mineIdx >= 0 && cols[mineIdx].scores[cat] == null && next.preview[cat] != null;
      if (!want) { if (btn) btn.remove(); continue; }
      if (!btn) {
        btn = el('button', 'yt-sc-hit');
        btn.type = 'button';
        btn.dataset.yt = 'row-' + cat;
        btn.dataset.cat = cat;
        rowEl.append(btn);
      }
      btn.setAttribute('aria-pressed', effMine === cat ? 'true' : 'false');
      btn.setAttribute('aria-label', `${NAME[cat]} ${next.preview[cat]}점 기록`);
    }
  }

  function update(next, opts = {}) {
    state = next || null;
    who.setPlayers(state && state.players);
    settled = !opts || opts.settled !== false;
    localPick = null;
    render();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-cat]');
    if (!b || !state) return;
    const cat = b.dataset.cat;
    if (state.pick === cat) { send({ t: 'yt', a: 'score', cat }); return; }
    send({ t: 'yt', a: 'pick', cat });
    localPick = cat;
    render();
  });

  function flash(e) {
    if (!refs || !state || !e) return;
    const i = (state.cols || []).findIndex((c) => c.id === e.id);
    const cell = i >= 0 && refs.cells[e.cat] ? refs.cells[e.cat][i] : null;
    if (!cell) return;
    cell.classList.remove('yt-sc-flash');
    void cell.offsetWidth;
    cell.classList.add('yt-sc-flash');
    const t = setTimeout(() => { timers.delete(t); cell.classList.remove('yt-sc-flash'); }, 1500);
    timers.add(t);
  }

  function anchor(id) {
    if (!refs || !state) return null;
    const i = (state.cols || []).findIndex((c) => c.id === id);
    if (i < 0) return null;
    const r = refs.head[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dispose() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    root.remove();
  }

  return { el: root, update, flash, anchor, dispose };
}
