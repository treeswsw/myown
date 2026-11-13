// 방 대기·설정 (docs/draw/GDD.md 7·8절⑧·10-2·11-2). 접두사 .dr-st-
// createSettings(parent, ctx) → { el, update(state), event(e), dispose(), slots }
//   slots.chat  참가자 카드 맨 아래 빈 칸 — 입구(index.js)가 채팅 모듈을 여기에 붙일 수 있다.
// phase === 'lobby' 일 때만 보인다. 사용자 글자는 textContent 로만 넣는다.
import {
  ORDER_CHOICES, ROUND_CHOICES, TIME_CHOICES, ORDER_LABELS, ORDER_HINTS, timeLabel,
  isHost, canEdit, canKick, isLastTopic, startState, summaryLine, seatsLabel, faceColor, initial,
  settingsMsg, topicMsg, kickMsg, startMsg,
} from './settings.pure.js';

const mk = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};
const txt = (tag, cls, text, attrs) => { const e = mk(tag, cls, attrs); e.textContent = text; return e; };

export function createSettings(parent, ctx) {
  const el = mk('div', 'dr-st-root', { 'aria-label': '방 대기' });
  el.hidden = true;
  const chatSlot = mk('div', 'dr-st-chat');
  parent.appendChild(el);
  let state = null;
  let sig = '';
  let copyTimer = 0;

  const send = (msg) => { if (msg) ctx.send(msg); };

  function seg(box, act, items, cur, locked, onPick) {
    const row = mk('div', 'dr-st-seg', { role: 'group' });
    for (const [v, label] of items) {
      const b = mk('button', 'dr-st-opt', { type: 'button', 'data-dr': act, 'data-v': String(v), 'aria-pressed': String(cur === v) });
      b.textContent = label;
      b.disabled = locked;
      b.addEventListener('click', () => { if (!b.disabled) onPick(v); });
      row.appendChild(b);
    }
    box.appendChild(row);
    return row;
  }
  function field(box, label, hint) {
    const f = mk('div', 'dr-st-field');
    const l = mk('div', 'dr-st-label');
    l.appendChild(document.createTextNode(label));
    if (hint) l.appendChild(txt('span', 'dr-st-hint', ' · ' + hint));
    f.appendChild(l);
    box.appendChild(f);
    return f;
  }

  // 카드 두 장과 chatSlot 은 한 번만 만들고, 안쪽(목록·설정 칸)만 다시 그린다.
  const left = mk('section', 'dr-st-card dr-st-people');
  const codeEl = txt('div', 'dr-st-code', '', { 'data-dr': 'st-code' });
  const copy = mk('button', 'dr-st-copy', { type: 'button', 'data-dr': 'st-copy' });
  copy.textContent = '복사';
  copy.addEventListener('click', () => {
    const code = String((state && state.code) || '');
    const done = () => {
      copy.textContent = '복사됨';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copy.textContent = '복사'; }, 1500);
    };
    try { navigator.clipboard.writeText(code).then(done, () => {}); } catch (e) { /* 복사 불가 환경 */ }
  });
  const codeRow = mk('div', 'dr-st-coderow');
  codeRow.append(codeEl, copy);
  const head = mk('div', 'dr-st-count');
  const list = mk('ul', 'dr-st-players');
  left.append(txt('div', 'dr-st-kicker', '갱식마인드 · 방 코드'), codeRow, head, list, chatSlot);
  const right = mk('section', 'dr-st-card dr-st-opts');
  el.append(left, right);

  function render() {
    const s = state;
    if (!s || s.phase !== 'lobby' || !s.settings) { el.hidden = true; return; }
    el.hidden = false;
    const st = s.settings;
    const host = isHost(s);
    const locked = !canEdit(s);

    codeEl.textContent = s.code || '';
    head.textContent = '';
    head.append('참가자 ', txt('b', '', seatsLabel(s)));
    list.textContent = '';
    for (const p of s.players || []) {
      const li = mk('li', 'dr-st-player', { 'data-id': p.id });
      if (p.connected === false) li.classList.add('dr-st-off');
      const face = txt('span', 'dr-st-face', initial(p.name));
      face.style.background = faceColor(p.seat);
      li.appendChild(face);
      li.appendChild(txt('span', 'dr-st-name', p.name));
      if (p.id === s.you) li.appendChild(txt('span', 'dr-st-tag dr-st-dim', '나'));
      if (p.id === s.hostId) li.appendChild(txt('span', 'dr-st-tag', '방장'));
      if (p.connected === false) li.appendChild(txt('span', 'dr-st-tag dr-st-dim', '끊김'));
      if (canKick(s, p.id)) {
        const k = mk('button', 'dr-st-kick', { type: 'button', 'data-dr': 'st-kick', 'data-id': p.id, 'aria-label': p.name + ' 내보내기' });
        k.textContent = '내보내기';
        k.addEventListener('click', () => send(kickMsg(state, p.id)));
        li.appendChild(k);
      }
      list.appendChild(li);
    }

    right.textContent = '';
    const title = mk('div', 'dr-st-title');
    title.append('방 설정');
    if (!host) title.appendChild(txt('span', 'dr-st-hint', ' 방장만 바꿀 수 있어요'));
    right.appendChild(title);

    const of = field(right, '출제 순서');
    seg(of, 'st-order', ORDER_CHOICES.map((v) => [v, ORDER_LABELS[v]]), st.order, locked,
      (v) => send(settingsMsg(state, { order: v })));
    of.appendChild(txt('div', 'dr-st-ohint', ORDER_HINTS[st.order] || '', { 'data-dr': 'st-orderHint' }));
    seg(field(right, '라운드 수', '한 라운드에 모두 한 번씩 그려요'), 'st-rounds', ROUND_CHOICES.map((v) => [v, String(v)]), st.rounds, locked,
      (v) => send(settingsMsg(state, { rounds: v })));
    seg(field(right, '그리는 시간'), 'st-time', TIME_CHOICES.map((v) => [v, timeLabel(v)]), st.time, locked,
      (v) => send(settingsMsg(state, { time: v })));
    seg(field(right, '글자 수 칸'), 'st-len', [[true, '켜기'], [false, '끄기']], !!st.len, locked,
      (v) => send(settingsMsg(state, { len: v })));

    const tf = field(right, '주제', locked ? '' : '눌러서 켜고 끄기');
    const trow = mk('div', 'dr-st-seg dr-st-wrap', { role: 'group' });
    for (const name of st.allTopics || []) {
      const on = (st.topics || []).includes(name);
      const b = mk('button', 'dr-st-chip', { type: 'button', 'data-dr': 'st-topic', 'data-name': name, 'aria-pressed': String(on) });
      b.textContent = name;
      b.disabled = locked || isLastTopic(st, name);
      b.addEventListener('click', () => { if (!b.disabled) send(topicMsg(state, name)); });
      trow.appendChild(b);
    }
    tf.appendChild(trow);

    right.appendChild(txt('div', 'dr-st-sum', summaryLine(s), { 'data-dr': 'st-summary' }));

    const ss = startState(s);
    if (ss.show) {
      const foot = mk('div', 'dr-st-foot');
      const go = mk('button', 'dr-st-start', { type: 'button', 'data-dr': 'st-start' });
      go.textContent = '시작';
      go.disabled = !ss.enabled;
      go.addEventListener('click', () => { if (!go.disabled) send(startMsg(state)); });
      foot.appendChild(go);
      right.appendChild(foot);
    }
    if (ss.note) right.appendChild(txt('div', 'dr-st-note', ss.note, { 'data-dr': 'st-note' }));
  }

  return {
    el,
    slots: { chat: chatSlot },
    update(s) {
      state = s || null;
      const key = JSON.stringify(state && [state.code, state.settings, state.players, state.hostId, state.you, state.phase]);
      if (key === sig) return;
      sig = key;
      const top = el.scrollTop;
      render();
      el.scrollTop = top;
    },
    event() { /* 이 모듈이 받을 알림 없음 */ },
    dispose() { clearTimeout(copyTimer); el.remove(); chatSlot.remove(); state = null; },
  };
}
