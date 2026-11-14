// 단어 고르기·정답 공개·최종 순위 (docs/draw/GDD.md 4·7·10-2·10-4·11-2절). 접두사 .dr-rs-
// createResult(parent, ctx) → { el, update(state), event(e), anchor(id), redraw(), dispose() }
// ctx 에 faces·profile(공용 프로필 부품)·leave·toWait 가 있다. 최종 순위의 사진·칭호는 공용 프로필 부품이 그린다.
// el 은 그림판 영역을 덮는 투명 층(pointer-events:none). 보일 것이 없으면 hidden.
//   pick   : 그림판 위 가운데 — 그리는 사람은 단어 카드 3장, 나머지는 "○○ 님이 단어를 고르는 중"
//   reveal : 그림판 아래쪽 정답 카드
//   final  : 화면 전체 최종 순위
// 사용자 글자(이름)는 textContent 로만 넣는다. 단어 후보는 pickCards() 를 통해서만 읽는다.
import {
  viewMode, pickCards, pickMessage, waitPickText, revealView, finalView,
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
  const avs = new Map(); // id -> 최종 순위의 사진 칸(이모티콘·사진·말풍선 자리)

  function avatar(id, name, size) {
    const a = h('span', `dr-rs-av dr-rs-av-${size}`);
    const f = ctx.faces?.get(id) ?? { avatar: null, look: null };
    a.append(ctx.profile.playerAvatar({ id, name, face: f.avatar, look: f.look, size: size === 'lg' ? 64 : 30 }));
    avs.set(id, a);
    return a;
  }

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

  // ---- 최종 순위 ----
  function renderFinal() {
    const f = finalView(state, meId());
    avs.clear();
    const box = h('div', 'dr-rs-card dr-rs-final');
    box.appendChild(h('div', 'dr-rs-title dr-rs-final-title', '최종 순위'));

    const body = h('div', 'dr-rs-final-body');
    const pod = h('div', 'dr-rs-podium');
    f.podium.forEach((r) => {
      const col = h('div', `dr-rs-pcol dr-rs-p${Math.min(r.rank, 3)}${r.isYou ? ' dr-rs-me' : ''}`);
      col.appendChild(avatar(r.id, r.name, 'lg'));
      col.appendChild(h('div', 'dr-rs-pname', r.name));
      const step = h('div', 'dr-rs-step');
      step.appendChild(h('div', 'dr-rs-prank', String(r.rank)));
      step.appendChild(h('div', 'dr-rs-pscore', `${r.score}점`));
      col.appendChild(step);
      pod.appendChild(col);
    });
    body.appendChild(pod);

    const side = h('div', 'dr-rs-side');
    if (f.rest.length) {
      const list = h('ol', 'dr-rs-list');
      f.rest.forEach((r) => {
        const li = h('li', `dr-rs-row${r.isYou ? ' dr-rs-me' : ''}`);
        li.appendChild(h('span', 'dr-rs-rk', String(r.rank)));
        li.appendChild(avatar(r.id, r.name, 'sm'));
        li.appendChild(h('span', 'dr-rs-rname', r.name));
        li.appendChild(h('span', 'dr-rs-rhit', `맞힘 ${r.correct}`));
        li.appendChild(h('span', 'dr-rs-rscore', `${r.score}점`));
        list.appendChild(li);
      });
      side.appendChild(list);
    }
    side.appendChild(h('div', 'dr-rs-note', '빨리 맞힐수록, 내 그림을 많이 맞힐수록 점수가 높아요. 점수가 같으면 맞힌 횟수가 많은 사람이 위.'));
    const btns = h('div', 'dr-rs-btns');
    const leave = h('button', 'dr-rs-btn dr-rs-btn-sub', '나가기');
    leave.type = 'button';
    leave.dataset.dr = 'rs-leave';
    leave.addEventListener('click', () => {
      if (ctx && typeof ctx.leave === 'function') ctx.leave();
      else send({ t: 'leave' });
    });
    // 다시 하려면 대기실로: 방장이 설정을 바꾸고 시작한다(시작·설정은 공통 대기실이 맡는다)
    const wait = h('button', 'dr-rs-btn dr-rs-btn-main', '대기실로');
    wait.type = 'button';
    wait.dataset.dr = 'rs-wait';
    wait.addEventListener('click', () => ctx.toWait?.());
    btns.append(leave, wait);
    side.appendChild(btns);
    body.appendChild(side);
    box.appendChild(body);
    el.appendChild(box);
  }

  function signature(mode) {
    if (!state) return 'none';
    switch (mode.kind) {
      case 'pick-drawer': return `pd|${state.q}|${JSON.stringify(state.choices)}`;
      case 'pick-wait': return `pw|${state.q}|${state.drawerId}|${nameOf(state, state.drawerId)}`;
      case 'reveal': return `rv|${state.q}|${JSON.stringify(state.reveal)}|${JSON.stringify((state.players || []).map((p) => [p.id, p.name]))}`;
      case 'final': return `fn|${JSON.stringify(state.ranking)}`;
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
        case 'final': renderFinal(); break;
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

  // 사진이 새로 왔다: 최종 순위를 다시 그린다
  function redraw() {
    if (disposed || !state) return;
    sig = '';
    update(state);
  }

  // 최종 순위일 때 그 사람 사진 위쪽(이모티콘·사진·말풍선 자리). 아니면 null
  function anchor(id) {
    const a = avs.get(id);
    if (el.hidden || !a?.isConnected) return null;
    const r = a.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + 4 } : null;
  }

  return { el, update, event, anchor, redraw, dispose };
}
