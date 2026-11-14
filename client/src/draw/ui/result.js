// 단어 고르기·정답 공개 (docs/draw/GDD.md 4·7·10-2·10-4절). 접두사 .dr-rs-. 최종 순위는 공통 결과 화면(room/result.js).
// createResult(parent, ctx) → { el, update(state), event(e), dispose() }
// el 은 그림판 영역을 덮는 투명 층(pointer-events:none). 보일 것이 없으면 hidden.
//   pick   : 그림판 위 가운데 — 그리는 사람은 단어 카드 3장, 나머지는 "○○ 님이 단어를 고르는 중"
//   reveal : 그림판 아래쪽 정답 카드
// 사용자 글자(이름)는 textContent 로만 넣는다. 단어 후보는 pickCards() 를 통해서만 읽는다.
import {
  viewMode, pickCards, pickMessage, waitPickText, revealView,
  secondsLeft, clockText, nameOf,
} from './result.pure.js';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createResult(parent, ctx) {
  const el = h('div', 'dr-rs');
  el.hidden = true;
  parent.appendChild(el);

  let state = null;
  let sig = '';
  let timerEl = null; // 남은 초를 그리는 칸(pick, reveal)
  let timerKind = '';
  let pickLocked = false; // 이미 눌렀으면 다시 보내지 않는다
  let tick = null;
  let disposed = false;

  const meId = () => (ctx && typeof ctx.meId === 'function' ? ctx.meId() : null);
  const now = () => (ctx && typeof ctx.now === 'function' ? ctx.now() : Date.now());
  const send = (m) => { if (m && ctx && typeof ctx.send === 'function') ctx.send(m); };

  function paintTimer() {
    if (!timerEl || !state) return;
    const s = secondsLeft(state.endsAt, now());
    if (timerKind === 'pick') {
      timerEl.textContent = s == null ? '' : `${s}초 뒤 자동으로 고릅니다`;
    } else if (timerKind === 'reveal') {
      timerEl.textContent = s == null ? '' : (s > 0 ? `${s}초 뒤 다음 문제` : '다음 문제로 넘어가요');
    }
    const clock = el.querySelector('.dr-rs-clock');
    if (clock) clock.textContent = clockText(s);
  }

  function startTick() {
    if (tick != null) return;
    tick = setInterval(paintTimer, 250);
  }
  function stopTick() {
    if (tick != null) { clearInterval(tick); tick = null; }
  }

  function clear() {
    el.textContent = '';
    timerEl = null;
    timerKind = '';
  }

  // ---- 단어 고르기 ----
  function renderPickDrawer(cards) {
    const box = h('div', 'dr-rs-card dr-rs-pick');
    box.appendChild(h('div', 'dr-rs-title', '그릴 단어를 고르세요'));
    const row = h('div', 'dr-rs-words');
    cards.forEach((c) => {
      const b = h('button', 'dr-rs-word');
      b.type = 'button';
      b.appendChild(h('span', 'dr-rs-topic', c.topic));
      b.appendChild(h('span', 'dr-rs-w', c.word));
      b.addEventListener('click', () => {
        if (pickLocked) return;
        const m = pickMessage(c.i);
        if (!m) return;
        pickLocked = true;
        row.classList.add('dr-rs-locked');
        b.classList.add('dr-rs-chosen');
        send(m);
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    timerEl = h('div', 'dr-rs-count');
    timerKind = 'pick';
    box.appendChild(timerEl);
    box.appendChild(h('div', 'dr-rs-note', '글자·숫자는 쓰지 않고 그림으로만 설명해요'));
    el.appendChild(box);
  }

  function renderPickWait() {
    const box = h('div', 'dr-rs-card dr-rs-wait');
    box.appendChild(h('div', 'dr-rs-title', waitPickText(state)));
    timerEl = h('div', 'dr-rs-count');
    timerKind = 'pick';
    box.appendChild(timerEl);
    el.appendChild(box);
  }

  // ---- 정답 공개 ----
  function renderReveal() {
    const v = revealView(state);
    if (!v) return;
    const box = h('div', 'dr-rs-card dr-rs-reveal');
    box.appendChild(h('div', 'dr-rs-why', v.summary ? `${v.title} · ${v.summary}` : v.title));
    const word = h('div', 'dr-rs-answer');
    word.textContent = v.word;
    box.appendChild(word);

    const line = h('div', 'dr-rs-gains');
    if (!v.gains.length) line.appendChild(h('span', 'dr-rs-none', '맞힌 사람이 없어요'));
    v.gains.forEach((g, i) => {
      if (i > 0) line.appendChild(h('span', 'dr-rs-dot', '·'));
      const item = h('span', 'dr-rs-gain');
      item.appendChild(h('span', 'dr-rs-gname', g.name));
      item.appendChild(document.createTextNode(' '));
      item.appendChild(h('span', 'dr-rs-pts', g.ptsText));
      line.appendChild(item);
    });
    if (v.drawer) {
      line.appendChild(h('span', 'dr-rs-dot', '·'));
      const item = h('span', 'dr-rs-gain');
      item.appendChild(document.createTextNode('그린 사람 '));
      item.appendChild(h('span', 'dr-rs-gname', v.drawer.name));
      item.appendChild(document.createTextNode(' '));
      item.appendChild(h('span', 'dr-rs-pts', v.drawer.ptsText));
      line.appendChild(item);
    }
    box.appendChild(line);

    const foot = h('div', 'dr-rs-next');
    timerEl = h('span', 'dr-rs-count-s');
    timerKind = 'reveal';
    foot.appendChild(timerEl);
    if (v.next) {
      foot.appendChild(h('span', 'dr-rs-dot', '·'));
      foot.appendChild(document.createTextNode('다음 차례 '));
      foot.appendChild(h('span', 'dr-rs-gname', v.next.name));
    }
    box.appendChild(foot);
    el.appendChild(box);
  }

  function signature(mode) {
    if (!state) return 'none';
    switch (mode.kind) {
      case 'pick-drawer': return `pd|${state.q}|${JSON.stringify(state.choices)}`;
      case 'pick-wait': return `pw|${state.q}|${state.drawerId}|${nameOf(state, state.drawerId)}`;
      case 'reveal': return `rv|${state.q}|${JSON.stringify(state.reveal)}|${JSON.stringify((state.players || []).map((p) => [p.id, p.name]))}`;
      default: return 'none';
    }
  }

  function update(s) {
    if (disposed) return;
    const prevQ = state && state.q;
    const prevPhase = state && state.phase;
    state = s || null;
    const mode = viewMode(state, meId());
    if (mode.kind === 'pick-drawer' && (prevPhase !== 'pick' || prevQ !== state.q)) pickLocked = false;
    const next = signature(mode);
    if (next !== sig) {
      sig = next;
      clear();
      el.dataset.mode = mode.kind;
      switch (mode.kind) {
        case 'pick-drawer': renderPickDrawer(pickCards(state, meId())); break;
        case 'pick-wait': renderPickWait(); break;
        case 'reveal': renderReveal(); break;
        default: break;
      }
    }
    el.hidden = mode.kind === 'none';
    if (timerEl) { paintTimer(); startTick(); } else stopTick();
  }

  function event(e) {
    // 이 모듈이 따로 듣는 이벤트는 없다(상태만 본다). 새 문제가 시작되면 눌림 잠금만 푼다.
    if (e && e.k === 'drNew') pickLocked = false;
  }

  function dispose() {
    disposed = true;
    stopTick();
    el.remove();
  }

  return { el, update, event, dispose };
}
