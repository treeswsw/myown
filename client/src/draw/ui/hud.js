// 상단·문제 띠 (docs/draw/GDD.md 7절, 11-2). 접두사 .dr-hud-
// createHud(parent, ctx) → { el, update(state), event(e), dispose(), slots }
// el 은 display:contents 라서 아래 조각(slots)이 입구(index.js)가 만든 격자 칸에 바로 놓인다.
//   slots.title   게임 이름                          → 상단 줄 왼쪽 (방 코드 옆)
//   slots.num     "문제 5 / 14"                      → PC: 상단 줄 오른쪽 / 휴대폰: 윗줄 시간 옆
//   slots.bar     문제 띠(단어/칸) + 맞힌 사람 + 남은 시간 → 그림판 위 (휴대폰은 윗줄)
//   slots.meter   줄어드는 막대(높이 4px)            → 그림판 맨 위 가장자리에 겹침
//   slots.answer  정답 입력 칸 + 보내기              → PC: 그림판 아래 / 휴대폰: 윗줄
// 사용자 글자·단어는 textContent 로만 넣는다.
import { GAME_NAME } from '../../../../shared/draw/name.js';
import {
  remainMs, formatTime, barFraction, isUrgent, questionView, hitCounts, showHitCount,
  questionNo, answerBox, prepareText, keyboardHeight,
} from './hud.pure.js';

const TICK_MS = 250;

function h(tag, cls, attrs = {}, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

export function createHud(parent, ctx) {
  const el = h('div', 'dr-hud dr-hud-wide');
  el.hidden = true;
  parent.appendChild(el);

  let state = null;
  let disposed = false;
  let timer = 0;
  const offs = [];
  const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); offs.push(() => target.removeEventListener(type, fn, opt)); };

  // ---- 게임 이름·문제 번호 ----
  const title = h('span', 'dr-hud-title', {}, GAME_NAME);
  const num = h('span', 'dr-hud-num');
  const numLab = h('span', 'dr-hud-numlab', {}, '문제');
  const numQ = h('b', 'dr-hud-numq');
  const numTot = h('span', 'dr-hud-numtot');
  num.append(numLab, ' ', numQ, numTot);
  num.hidden = true;

  // ---- 문제 띠 ----
  const bar = h('div', 'dr-hud-bar', { 'aria-live': 'polite' });
  const tag = h('span', 'dr-hud-tag', {}, '문제');
  const q = h('span', 'dr-hud-q');
  const qLen = h('span', 'dr-hud-len');
  const hits = h('span', 'dr-hud-hits');
  const time = h('span', 'dr-hud-time', { role: 'timer' }, '0:00');
  const numInBar = h('span', 'dr-hud-barnum'); // 휴대폰: 윗줄에 번호를 띠 안에 둔다(CSS 로 보임/숨김)
  bar.append(tag, q, qLen, h('span', 'dr-hud-fill'), hits, numInBar, time);

  const meter = h('div', 'dr-hud-meter', { 'aria-hidden': 'true' });
  const meterFill = h('i', 'dr-hud-meterfill');
  meter.appendChild(meterFill);

  // ---- 정답 입력 ----
  const answer = h('form', 'dr-hud-answer', { autocomplete: 'off' });
  answer.hidden = true;
  const input = h('input', 'dr-hud-input', {
    type: 'text', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', maxlength: '80', 'aria-label': '정답 입력',
  });
  const sendBtn = h('button', 'dr-hud-send', { type: 'submit' }, '보내기');
  answer.append(input, sendBtn);

  on(answer, 'submit', (e) => { e.preventDefault(); submit(); });
  on(input, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
  });

  function submit() {
    if (!answerBox(state, ctx.meId()).enabled) return;
    const text = prepareText(input.value);
    if (text == null) return;
    ctx.send({ t: 'chat', text });
    input.value = '';
    input.focus();
  }

  // ---- 그리기 ----
  let lastMs = -1;
  let lastQKey = '';

  function renderQuestion(v) {
    const key = JSON.stringify(v);
    if (key === lastQKey) return;
    lastQKey = key;
    q.textContent = '';
    qLen.textContent = '';
    q.className = 'dr-hud-q';
    if (v.kind === 'word') {
      q.classList.add('dr-hud-word');
      q.textContent = v.text;
    } else if (v.kind === 'mask') {
      q.classList.add('dr-hud-mask');
      for (const isBox of v.cells) q.appendChild(h('span', isBox ? 'dr-hud-box' : 'dr-hud-gap'));
      qLen.textContent = `${v.len}글자`;
      q.setAttribute('aria-label', `${v.len}글자`);
    } else {
      q.classList.add('dr-hud-note');
      q.textContent = v.text;
    }
  }

  function renderTime() {
    if (!state) return;
    const ms = remainMs(state.endsAt, ctx.now());
    const left = ms == null ? null : Math.ceil(ms / 1000);
    if (left === lastMs) return;
    lastMs = left;
    time.textContent = ms == null ? '' : formatTime(ms);
    meterFill.style.transform = `scaleX(${barFraction(state, ms)})`;
    bar.classList.toggle('dr-hud-urgent', isUrgent(state, ms));
  }

  function updateTimer() {
    const need = !!state && state.endsAt != null && state.phase !== 'lobby' && state.phase !== 'final';
    if (need && !timer) timer = setInterval(renderTime, TICK_MS);
    else if (!need && timer) { clearInterval(timer); timer = 0; }
  }

  function applyLayout() {
    const lay = ctx.layout && ctx.layout() === 'phone' ? 'phone' : 'wide';
    el.classList.toggle('dr-hud-phone', lay === 'phone');
    el.classList.toggle('dr-hud-wide', lay === 'wide');
    for (const n of [title, num, bar, meter, answer]) {
      n.classList.toggle('dr-hud-phone', lay === 'phone');
      n.classList.toggle('dr-hud-wide', lay === 'wide');
    }
    return lay;
  }

  function render() {
    if (disposed) return;
    applyLayout();
    const s = state;
    const inGame = !!s && (s.phase === 'pick' || s.phase === 'draw' || s.phase === 'reveal');
    el.hidden = !s;
    bar.hidden = !inGame;
    meter.hidden = !inGame;
    title.hidden = !s;
    if (!s) { answer.hidden = true; num.hidden = true; return; }

    renderQuestion(questionView(s, ctx.meId()));

    const no = questionNo(s);
    num.hidden = !no || s.phase === 'lobby';
    numInBar.hidden = num.hidden;
    if (no) {
      numQ.textContent = String(no.q);
      numTot.textContent = ` / ${no.total}`;
      numInBar.textContent = `문제 ${no.q} / ${no.total}`;
    }

    const showHits = showHitCount(s);
    hits.hidden = !showHits;
    if (showHits) {
      const c = hitCounts(s);
      hits.textContent = `맞힌 사람 ${c.n} / ${c.m}`;
    }

    bar.classList.toggle('dr-hud-rush', !!s.rushed && s.phase === 'draw');
    meter.classList.toggle('dr-hud-rush', !!s.rushed && s.phase === 'draw');
    bar.classList.toggle('dr-hud-reveal', s.phase === 'reveal');

    const ab = answerBox(s, ctx.meId());
    answer.hidden = !ab.show;
    input.disabled = !ab.enabled;
    sendBtn.disabled = !ab.enabled;
    input.placeholder = ab.placeholder;
    input.setAttribute('aria-label', ab.placeholder || '정답 입력');
    answer.classList.toggle('dr-hud-hit', ab.hit);
    if (!ab.show && document.activeElement === input) input.blur();

    lastMs = -1;
    renderTime();
    updateTimer();
  }

  // ---- 휴대폰 키보드 (visualViewport). 가림 높이를 --dr-kb-h, 보이는 높이를 --dr-vvh 로 문서에 알린다 ----
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const root = document.documentElement;
  function onViewport() {
    if (disposed || !vv) return;
    const kb = ctx.layout && ctx.layout() === 'phone' ? keyboardHeight(window.innerHeight, vv.height, vv.offsetTop) : 0;
    try {
      if (kb > 0) {
        root.style.setProperty('--dr-kb-h', `${kb}px`);
        root.style.setProperty('--dr-vvh', `${Math.round(vv.height)}px`);
      } else {
        root.style.removeProperty('--dr-kb-h');
        root.style.removeProperty('--dr-vvh');
      }
    } catch (_) { /* 무시 */ }
    el.classList.toggle('dr-hud-kb', kb > 0);
    answer.classList.toggle('dr-hud-kb', kb > 0);
  }
  if (vv) { on(vv, 'resize', onViewport); on(vv, 'scroll', onViewport); }

  el.append(title, num, bar, meter, answer);

  return {
    el,
    slots: { title, num, bar, meter, answer },
    update(s) { if (disposed) return; state = s || null; render(); onViewport(); },
    event(e) {
      // 정답 알림·점수는 방 상태(update)로 오므로 따로 할 일이 없다. 새 문제가 시작되면 입력만 비운다.
      if (e && e.k === 'drNew') { input.value = ''; lastQKey = ''; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) { clearInterval(timer); timer = 0; }
      offs.splice(0).forEach((f) => f());
      try { root.style.removeProperty('--dr-kb-h'); root.style.removeProperty('--dr-vvh'); } catch (_) { /* 무시 */ }
      for (const n of [title, num, bar, meter, answer, el]) n.remove();
    },
  };
}
