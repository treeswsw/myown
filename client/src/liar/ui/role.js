// 역할 카드: reveal 단계의 카드(누르는 동안만 제시어)와 판 중 구석 "내 제시어" 버튼. 약속: docs/team/CONTRACTS.md 1절 role.
// 맨 위에서는 document·window 를 만지지 않는다(node 시험에서 roleText 를 불러올 수 있게).
// 비밀(0-5): state.my 만 본다. role 이 null 인지 'citizen' 인지로 화면을 다르게 하지 않는다.

const LIAR_TEXT = '당신은 라이어입니다';
const BUTTON_PHASES = ['speak', 'discuss', 'revote', 'defense', 'judge', 'judged'];

// 내 카드에 쓸 글. 보여 줄 것이 없으면 null (관전자, 방 대기, 제시어도 역할도 없음).
export function roleText(state) {
  if (!state || !state.phase || state.phase === 'lobby') return null;
  const me = (state.players || []).find((p) => p.id === state.you);
  if (me && me.spectating) return null;
  const my = state.my;
  if (!my) return null;
  let text = null;
  if (my.role === 'liar') text = LIAR_TEXT;
  else if (typeof my.word === 'string' && my.word !== '') text = my.word;
  if (text == null) return null;
  return { topic: state.topic == null ? '' : String(state.topic), text };
}

export function createRole(ctx) {
  const doc = document;
  const win = window;
  const mk = (tag, cls, lg) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (lg) n.dataset.lg = lg;
    return n;
  };

  // ---- reveal 카드 ----
  const root = mk('div', 'lg-role-root');
  root.hidden = true;
  const card = mk('div', 'lg-role-card', 'role-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', '내 제시어 (누르고 있는 동안만 보임)');
  const round = mk('div', 'lg-role-round');
  const rule = mk('div', 'lg-role-rule');
  const dl = mk('dl', 'lg-role-dl');
  const topicBox = mk('div', 'lg-role-item');
  const topicDt = mk('dt');
  topicDt.textContent = '주제';
  const topicDd = mk('dd', 'lg-role-topic');
  topicBox.append(topicDt, topicDd);
  const wordBox = mk('div', 'lg-role-item');
  const wordDt = mk('dt');
  wordDt.textContent = '제시어';
  const wordDd = mk('dd', 'lg-role-word', 'role-word');
  wordDd.setAttribute('aria-hidden', 'true');
  wordBox.append(wordDt, wordDd);
  dl.append(topicBox, wordBox);
  const hint = mk('div', 'lg-role-hint');
  hint.textContent = '카드를 꾹 누르고 있는 동안만 보여요. 옆 사람이 못 보게 하세요.';
  card.append(round, rule, dl, hint);
  root.append(card);

  // ---- 구석 버튼 ----
  const corner = mk('div', 'lg-role-corner');
  corner.hidden = true;
  const btn = mk('button', 'lg-role-btn', 'myword');
  btn.type = 'button';
  btn.textContent = '내 제시어';
  btn.setAttribute('aria-pressed', 'false');
  const bubble = mk('div', 'lg-role-bubble');
  bubble.hidden = true;
  bubble.setAttribute('aria-hidden', 'true');
  const bTopic = mk('div', 'lg-role-btopic');
  const bText = mk('div', 'lg-role-btext');
  bubble.append(bTopic, bText);
  corner.append(btn, bubble);

  const wrap = mk('div', 'lg-role-wrap');
  wrap.append(root, corner);
  ctx.root.append(wrap);

  let state = null;
  let held = null; // 'card' | 'btn' | null

  const draw = () => {
    const rt = roleText(state);
    const phase = state && state.phase;
    const showCard = !!rt && phase === 'reveal';
    const showBtn = !!rt && BUTTON_PHASES.includes(phase);
    if (held === 'card' && !showCard) held = null;
    if (held === 'btn' && !showBtn) held = null;
    root.hidden = !showCard;
    corner.hidden = !showBtn;
    // 카드
    if (showCard) {
      round.textContent = `Round ${state.round}`;
      topicDd.textContent = rt.topic;
      const open = held === 'card';
      wordDd.textContent = open ? rt.text : '';
      wordDd.classList.toggle('lg-role-open', open);
      card.setAttribute('aria-pressed', open ? 'true' : 'false');
    } else {
      wordDd.textContent = '';
      topicDd.textContent = '';
      wordDd.classList.remove('lg-role-open');
      card.setAttribute('aria-pressed', 'false');
    }
    // 구석 버튼
    const bopen = showBtn && held === 'btn';
    bubble.hidden = !bopen;
    bTopic.textContent = bopen ? rt.topic : '';
    bText.textContent = bopen ? rt.text : '';
    btn.setAttribute('aria-pressed', bopen ? 'true' : 'false');
  };

  const open = (which) => { if (held !== which) { held = which; draw(); } };
  const close = (which) => { if (held === which) { held = null; draw(); } };
  const closeAll = () => { if (held) { held = null; draw(); } };

  const wire = (target, which) => {
    target.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      open(which);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(t, () => close(which));
    target.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); open(which); }
    });
    target.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); close(which); }
    });
    target.addEventListener('blur', () => close(which));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  wire(card, 'card');
  wire(btn, 'btn');

  const onHide = () => closeAll();
  const onVis = () => { if (doc.hidden) closeAll(); };
  win.addEventListener('blur', onHide);
  win.addEventListener('pagehide', onHide);
  doc.addEventListener('visibilitychange', onVis);

  return {
    el: wrap,
    update(s) { state = s || null; draw(); },
    dispose() {
      win.removeEventListener('blur', onHide);
      win.removeEventListener('pagehide', onHide);
      doc.removeEventListener('visibilitychange', onVis);
      wrap.remove();
    },
  };
}
