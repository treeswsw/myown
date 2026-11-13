// 방 설정 패널 (CONTRACTS 1절 settings). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다.

const LIAR_MODES = [['word', '다른 제시어'], ['notice', '라이어 알림']];
const WORD_SETS = [['mine', '내 버전'], ['star', '스타 버전']];
const TOPIC_MODES = [['random', '체크한 것 중 무작위'], ['host', '매판 방장이 직접']];
const TIME_NAMES = { speak: '첫 설명', discuss: '토론·투표', rediscuss: '살린 뒤 토론', defense: '최후 변론', judge: '찬반 투표', guess: '정답 맞히기' };
const TIME_KEYS = Object.keys(TIME_NAMES);
const EDIT_PHASES = ['lobby', 'result'];

// 주제 하나를 켜고 끈 새 배열. 마지막 켜진 하나를 끄려 하거나 없는 이름이면 null(= 안 보냄).
export function toggleTopic(topics, name) {
  if (!Array.isArray(topics)) return null;
  const t = topics.find((x) => x && x.name === name);
  if (!t) return null;
  if (t.on && topics.filter((x) => x && x.on).length <= 1) return null;
  return topics.map((x) => ({ name: x.name, on: x.name === name ? !x.on : !!x.on }));
}

// 45 → '45초', 120 → '2분', 90 → '1분 30초'
export function timeLabel(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s + '초';
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

const mk = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};

export function createSettings(ctx, opts = {}) {
  const timeChoices = opts.timeChoices || {};
  const goalChoices = opts.goalChoices || [0, 10, 15, 20];
  const el = mk('div', 'lg-st-root', { 'aria-label': '방 설정' });
  el.hidden = true;
  let state = null;
  let sig = '';

  const seg = (parent, lg, items, cur, locked, onPick, extra) => {
    const row = mk('div', 'lg-st-seg', { role: 'group' });
    for (const [v, label] of items) {
      const b = mk('button', 'lg-st-opt', { type: 'button', 'data-lg': lg, 'data-v': String(v), 'aria-pressed': String(cur === v) });
      if (extra) for (const k of Object.keys(extra)) b.setAttribute(k, extra[k]);
      b.textContent = label;
      b.disabled = locked;
      b.addEventListener('click', () => { if (!b.disabled) onPick(v); });
      row.appendChild(b);
    }
    parent.appendChild(row);
    return row;
  };
  const field = (parent, label) => {
    const f = mk('div', 'lg-st-field');
    const l = mk('div', 'lg-st-label');
    l.textContent = label;
    f.appendChild(l);
    parent.appendChild(f);
    return f;
  };
  const sendSettings = (patch) => ctx.send({ t: 'lg', a: 'settings', ...patch });

  function render() {
    const s = state;
    el.textContent = '';
    if (!s || !s.settings) { el.hidden = true; return; }
    el.hidden = false;
    const st = s.settings;
    const isHost = s.hostId === s.you;
    const locked = !isHost || !EDIT_PHASES.includes(s.phase);

    const left = mk('div', 'lg-st-col lg-st-rules');
    seg(field(left, '라이어 방식'), 'st-liarMode', LIAR_MODES, st.liarMode, locked, (v) => sendSettings({ liarMode: v }));
    seg(field(left, '제시어 묶음'), 'st-wordSet', WORD_SETS, st.wordSet, locked, (v) => sendSettings({ wordSet: v }));
    seg(field(left, '주제 방식'), 'st-topicMode', TOPIC_MODES, st.topicMode, locked, (v) => sendSettings({ topicMode: v }));

    const topics = Array.isArray(st.topics) ? st.topics : [];
    if (st.topicMode === 'host') {
      const f = field(left, '다음 판 주제');
      const row = mk('div', 'lg-st-seg lg-st-wrap', { role: 'group' });
      for (const t of topics) {
        const b = mk('button', 'lg-st-opt', { type: 'button', 'data-lg': 'st-nextTopic', 'data-name': t.name, 'aria-pressed': String(st.nextTopic === t.name) });
        b.textContent = t.name;
        b.disabled = locked;
        b.addEventListener('click', () => { if (!b.disabled) sendSettings({ nextTopic: t.name }); });
        row.appendChild(b);
      }
      f.appendChild(row);
    } else {
      const f = field(left, '주제 (체크한 것 중 무작위)');
      const row = mk('div', 'lg-st-seg lg-st-wrap', { role: 'group' });
      for (const t of topics) {
        const b = mk('button', 'lg-st-opt', { type: 'button', 'data-lg': 'st-topic', 'data-name': t.name, 'aria-pressed': String(!!t.on) });
        b.textContent = t.name;
        b.disabled = locked;
        b.addEventListener('click', () => {
          if (b.disabled) return;
          const next = toggleTopic(((state && state.settings && state.settings.topics) || []), t.name);
          if (next) sendSettings({ topics: next });
        });
        row.appendChild(b);
      }
      f.appendChild(row);
    }

    for (const key of TIME_KEYS) {
      const vals = timeChoices[key] || (st.times && st.times[key] != null ? [st.times[key]] : []);
      const items = vals.map((v) => [v, timeLabel(v)]);
      seg(field(left, TIME_NAMES[key]), 'st-time', items, st.times ? st.times[key] : null, locked,
        (v) => sendSettings({ times: { [key]: v } }), { 'data-key': key });
    }
    seg(field(left, '목표 점수'), 'st-goal', goalChoices.map((g) => [g, g === 0 ? '없음' : g + '점']), st.goal, locked,
      (v) => sendSettings({ goal: v }));

    const right = mk('div', 'lg-st-col lg-st-people');
    const head = mk('div', 'lg-st-label');
    head.textContent = `참가자 ${(s.players || []).length}명`;
    right.appendChild(head);
    const list = mk('ul', 'lg-st-players');
    for (const p of s.players || []) {
      const li = mk('li', 'lg-st-player', { 'data-id': p.id });
      if (!p.connected) li.classList.add('lg-st-off');
      const dot = mk('span', 'lg-st-dot');
      dot.style.background = p.color || '#888';
      const name = mk('span', 'lg-st-name');
      name.textContent = p.name;
      name.style.color = p.color || '';
      li.append(dot, name);
      if (p.id === s.hostId) { const m = mk('span', 'lg-st-tag'); m.textContent = '방장'; li.appendChild(m); }
      if (p.id === s.you) { const m = mk('span', 'lg-st-tag lg-st-dim'); m.textContent = '나'; li.appendChild(m); }
      if (!p.connected) { const m = mk('span', 'lg-st-tag lg-st-dim'); m.textContent = '끊김'; li.appendChild(m); }
      const sc = mk('span', 'lg-st-score');
      sc.textContent = (p.score || 0) + '점';
      li.appendChild(sc);
      if (isHost && s.phase === 'lobby' && p.id !== s.you) {
        const k = mk('button', 'lg-st-kick', { type: 'button', 'data-lg': 'st-kick', 'data-id': p.id });
        k.textContent = '내보내기';
        k.addEventListener('click', () => ctx.send({ t: 'lg', a: 'kick', id: p.id }));
        li.appendChild(k);
      }
      list.appendChild(li);
    }
    right.appendChild(list);
    if (!isHost) {
      const note = mk('div', 'lg-st-note');
      note.textContent = '방장만 바꿀 수 있어요.';
      right.appendChild(note);
    }
    el.append(left, right);
  }

  return {
    el,
    update(s) {
      state = s || null;
      const key = JSON.stringify(state && [state.settings, state.players, state.hostId, state.you, state.phase]);
      if (key === sig) return;
      sig = key;
      const top = el.scrollTop;
      render();
      el.scrollTop = top;
    },
    dispose() { el.remove(); state = null; },
  };
}
