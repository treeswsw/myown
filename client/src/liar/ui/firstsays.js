// 첫 발언 모음과 늦은 첫 설명 (CONTRACTS 1절 firstsays). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다.

const WRITE_PHASES = ['speak'];
const REDO_PHASES = ['discuss', 'revote'];
const SEND_RETRY_SEC = 4;   // 서버 답이 안 오면(거절 등) 이 시간 뒤에 다시 보낼 수 있다

// 아직 첫 설명을 쓸 수 있는 때인가(사람과 무관한 단계 조건). GDD 9-3 아래 첫 항목.
function windowOpen(state) {
  if (!state) return false;
  if (WRITE_PHASES.includes(state.phase)) return true;
  return state.accuseNo === 1 && REDO_PHASES.includes(state.phase);
}

// 내가 지금 "내 첫 설명 쓰기" 칸을 보여 줄 때인가. 순수 함수.
export function canLate(state) {
  if (!state || !state.you || !windowOpen(state)) return false;
  const me = (state.players || []).find((p) => p.id === state.you);
  if (!me || me.spectating) return false;
  if (state.speaker === state.you) return false;
  if (state.phase === 'speak' && state.speakDone) return false;   // 곧 다음 차례(서버가 받지 않는다)
  const mine = (state.firstSays || []).find((f) => f && f.id === state.you);
  return !!mine && mine.text === null;
}

const el = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};

export function createFirstSays(ctx) {
  const root = el('div', 'lg-fs-root');
  root.hidden = true;
  const btn = el('button', 'lg-fs-btn', {
    type: 'button', 'data-lg': 'fs-open', 'aria-expanded': 'false', 'aria-controls': 'lg-fs-panel', 'aria-label': '첫 발언 모음 열기',
  });
  const icon = el('span', 'lg-fs-ico', { 'aria-hidden': 'true' });
  icon.textContent = '💬';
  const label = el('span', 'lg-fs-label');
  label.textContent = '첫 발언';
  const count = el('b', 'lg-fs-count');
  btn.append(icon, label, count);

  const panel = el('section', 'lg-fs-panel', { id: 'lg-fs-panel', 'data-lg': 'fs-panel', 'aria-label': '첫 발언 모음' });
  panel.hidden = true;
  const head = el('div', 'lg-fs-head');
  const h2 = el('h2');
  h2.textContent = '첫 발언 모음';
  const sub = el('span', 'lg-fs-sub');
  const close = el('button', 'lg-fs-close', { type: 'button', 'data-lg': 'fs-close', 'aria-label': '닫기' });
  close.textContent = '×';
  head.append(h2, sub, close);
  const list = el('ol', 'lg-fs-list');
  const empty = el('p', 'lg-fs-empty');
  empty.hidden = true;
  empty.textContent = '아직 발언이 없습니다.';
  panel.append(head, list, empty);
  root.append(btn, panel);
  ctx.root.appendChild(root);

  // 조작 줄: 늦은 첫 설명
  const form = el('form', 'lg-fs-late', { autocomplete: 'off' });
  form.hidden = true;
  const lbl = el('label', 'lg-fs-late-label', { for: 'lg-fs-late-input' });
  lbl.textContent = '내 첫 설명 쓰기';
  const input = el('input', 'lg-fs-late-input', {
    id: 'lg-fs-late-input', type: 'text', maxlength: String((ctx.limits && ctx.limits.say) || 80), enterkeyhint: 'send',
    placeholder: '한 줄, 한 번만', 'data-lg': 'late-input',
  });
  const sendBtn = el('button', 'lg-fs-late-send', { type: 'submit', 'data-lg': 'late-send' });
  sendBtn.textContent = '추가';
  form.append(lbl, input, sendBtn);
  ctx.action.appendChild(form);

  const maxSay = (ctx.limits && ctx.limits.say) || 80;
  let state = null;
  let open = false;
  let sending = false;
  let sendAge = 0;

  const setOpen = (v) => {
    open = !!v;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '첫 발언 모음 닫기' : '첫 발언 모음 열기');
    if (open) renderList();
  };

  const nameOf = (id) => (state.players || []).find((p) => p.id === id);

  // 이름 + 칭호(공용 프로필 부품). 부품이 없으면 글자만
  function putName(node, p, text) {
    if (ctx.nameTag && p) node.replaceChildren(ctx.nameTag(p, text));
    else node.textContent = text;
  }

  function avatar(p) {
    const a = el('span', 'lg-fs-av');
    a.style.setProperty('--c', p ? p.color : '#888');
    if (p && ctx.avatar) { // 사진·꾸미기는 공용 프로필 부품(ctx.avatar = ui/kit/avatar.js)
      a.appendChild(ctx.avatar(p, 32));
    } else {
      a.classList.add('lg-fs-initial');
      a.textContent = p && p.name ? Array.from(p.name)[0] : '?';
    }
    return a;
  }

  function renderList() {
    if (!state) return;
    const order = state.order || [];
    const fs = state.firstSays || [];
    const writable = windowOpen(state);
    const done = fs.filter((f) => typeof f.text === 'string').length;
    const rounds = state.speakRounds || 1;
    const extra = state.extraSays || [];
    sub.textContent = `${done}명 · 발언 순서대로` + (rounds > 1 ? ` · ${rounds}바퀴` : '');
    empty.hidden = order.length > 0;
    const head = (n) => {
      const h = el('li', 'lg-fs-round', { 'data-lg': 'fs-round' });
      h.textContent = `${n}바퀴째`;
      return h;
    };
    const rows = order.map((id, i) => {
      const p = nameOf(id);
      const entry = fs.find((f) => f.id === id);
      const li = el('li', 'lg-fs-row', { 'data-lg': 'fs-row', 'data-id': id });
      li.style.setProperty('--c', p ? p.color : '#efe6d8');
      const no = el('span', 'lg-fs-no');
      no.textContent = String(i + 1);
      const box = el('div', 'lg-fs-box');
      const name = el('span', 'lg-fs-name');
      putName(name, p, (p ? p.name : '?') + (id === state.you ? ' (나)' : ''));
      box.appendChild(name);
      const line = el('p', 'lg-fs-text');
      if (!entry) {
        line.textContent = '—';
        line.classList.add('lg-fs-none');
      } else if (typeof entry.text === 'string') {
        line.textContent = entry.text;
        if (entry.late) {
          const mark = el('span', 'lg-fs-latemark');
          mark.textContent = '늦게 씀';
          name.after(mark);
        }
      } else {
        line.textContent = writable ? '아직' : '(발언 없음)';
        line.classList.add('lg-fs-none');
      }
      box.appendChild(line);
      li.append(no, avatar(p), box);
      return li;
    });
    const nodes = rounds > 1 ? [head(1), ...rows] : rows;
    // 2바퀴째부터의 발언(모두가 이미 본 공개 글). 바퀴마다 구분 줄을 넣는다
    for (let rd = 2; rd <= rounds; rd++) {
      const said = extra.filter((x) => x.rd === rd);
      if (!said.length) continue;
      nodes.push(head(rd));
      for (const x of said) {
        const p = nameOf(x.id);
        const li = el('li', 'lg-fs-row', { 'data-lg': 'fs-row', 'data-id': x.id, 'data-rd': String(rd) });
        li.style.setProperty('--c', p ? p.color : '#efe6d8');
        const no = el('span', 'lg-fs-no');
        no.textContent = String(order.indexOf(x.id) + 1);
        const box = el('div', 'lg-fs-box');
        const name = el('span', 'lg-fs-name');
        putName(name, p, (p ? p.name : '?') + (x.id === state.you ? ' (나)' : ''));
        const line = el('p', 'lg-fs-text');
        line.textContent = x.text;
        box.append(name, line);
        li.append(no, avatar(p), box);
        nodes.push(li);
      }
    }
    list.replaceChildren(...nodes);
  }

  function renderCount() {
    const order = state.order || [];
    const done = (state.firstSays || []).filter((f) => typeof f.text === 'string').length;
    count.textContent = `${done}/${order.length}`;
    btn.setAttribute('data-count', `${done}/${order.length}`);
  }

  function renderLate() {
    const show = canLate(state);
    if (!show) {
      if (!form.hidden) input.value = '';
      sending = false;
      form.hidden = true;
      return;
    }
    form.hidden = false;
    sendBtn.disabled = sending;
    input.disabled = sending;
  }

  function submit() {
    if (sending || !state || !canLate(state)) return;
    const text = input.value.trim();
    if (!text || Array.from(text).length > maxSay || /[\r\n]/.test(text)) return;
    sending = true;
    sendAge = 0;
    sendBtn.disabled = true;
    input.disabled = true;
    ctx.send({ t: 'lg', a: 'say', text });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  btn.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => { setOpen(false); btn.focus(); });
  const onDown = (e) => {
    if (open && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  };
  const onKey = (e) => {
    if (open && e.key === 'Escape') { setOpen(false); btn.focus(); }
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);

  return {
    el: root,
    update(s) {
      state = s || null;
      const on = !!state && state.phase !== 'lobby' && state.phase !== 'unmask';
      if (!state || state.phase === 'lobby' || state.phase === 'unmask') {
        if (open) setOpen(false);
      }
      root.hidden = !on;
      if (!state) { renderLateOff(); return; }
      if (on) { renderCount(); if (open) renderList(); }
      renderLate();
    },
    frame(dt) {
      if (sending) {
        sendAge += dt || 0;
        if (sendAge > SEND_RETRY_SEC) { sending = false; if (state) renderLate(); }
      }
    },
    dispose() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      root.remove();
      form.remove();
    },
  };

  function renderLateOff() {
    input.value = '';
    sending = false;
    form.hidden = true;
  }
}
