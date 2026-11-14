// 갱식마인드 플레이어 표시 + 말풍선 (GDD 7절, 11-2 화면 모듈 약속). 접두사 .dr-pl-
// createPlayers(parent, ctx) -> { el, update(state), event(e), dispose() }
// ctx = { send, meId(), now(), layout(), faces(공용 faces: get(id) → {avatar, look}), profile(공용 프로필 부품) }. 사용자 글자는 textContent 로만 넣는다.
// 사진·꾸미기·칭호는 공용 프로필 부품(ctx.profile)만 그린다. anchor(id) = 그 사람 사진 위쪽 자리(이모티콘·사진·말풍선 위치).
import { BUBBLE_MS } from '../../../../shared/draw/constants.js';
import {
  SEAT_COUNT, SEATS_PER_SIDE, seatSlots, bubbleMode, iAmDrawer, playerView,
  bubbleFromChat, bubbleFromHit, logEntryFromChat, logEntryFromHit, logFromChatLog, pushLog, logMode, shouldFollow,
} from './players.pure.js';

const TALK_MS = 380;   // 통통 (CSS .dr-pl-talk 와 같은 값)
const CHEER_MS = 750;  // 정답 모션 (CSS .dr-pl-cheer)
const FADE_MS = 400;   // 말풍선 흐려짐 (CSS .dr-pl-say.out)

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createPlayers(parent, ctx) {
  const root = h('div', 'dr-pl-root dr-pl-wide');
  const cols = { l: h('div', 'dr-pl-col dr-pl-l'), r: h('div', 'dr-pl-col dr-pl-r') };
  const log = h('div', 'dr-pl-log');
  root.append(cols.l, cols.r, log);
  parent.appendChild(root);

  // 자리 8개 (왼쪽 0~3, 오른쪽 4~7). 칸 요소는 계속 재사용해 움직임이 끊기지 않게 한다.
  const seats = [];
  for (let i = 0; i < SEAT_COUNT; i++) {
    const seat = h('div', 'dr-pl-seat');
    const who = h('div', 'dr-pl-who');
    const avw = h('span', 'dr-pl-avw');
    const av = h('span', 'dr-pl-av');
    const tag = h('span', 'dr-pl-tag');
    avw.append(av, tag);
    const info = h('div', 'dr-pl-info');
    const nm = h('div', 'dr-pl-nm');
    const sc = h('div', 'dr-pl-sc');
    const scNum = h('b');
    const scUnit = h('span', 'dr-pl-unit', '점');
    const plus = h('span', 'dr-pl-plus');
    sc.append(scNum, scUnit, plus);
    info.append(nm, sc);
    who.append(avw, info);
    seat.append(who);
    cols[i < SEATS_PER_SIDE ? 'l' : 'r'].appendChild(seat);
    seats.push({ seat, avw, av, tag, nm, scNum, plus, id: null, bubble: null, bTimer: 0, bTimer2: 0, aTimer: 0 });
  }

  let state = null;
  let layout = 'wide';
  let disposed = false;
  const slotOf = new Map();  // id -> 자리 번호(칸 번호 0..7)
  const logItems = [];

  const me = () => (typeof ctx.meId === 'function' ? ctx.meId() : null);
  const lay = () => (typeof ctx.layout === 'function' && ctx.layout() === 'phone' ? 'phone' : 'wide');

  function clearBubble(s) {
    clearTimeout(s.bTimer); clearTimeout(s.bTimer2);
    s.bTimer = s.bTimer2 = 0;
    if (s.bubble) { s.bubble.remove(); s.bubble = null; }
    s.seat.classList.remove('dr-pl-say-on');
  }

  // 사진·꾸미기는 공용 프로필 부품 한 곳(ctx.profile). 같은 사진·이름이면 다시 그리지 않는다.
  function drawAvatar(s, v) {
    const f = ctx.faces?.get(v.id) ?? { avatar: null, look: null };
    const size = layout === 'phone' ? 28 : 72;
    const key = `${v.id}|${size}|${f.avatar ? f.avatar.length + f.avatar.slice(-24) : ''}|${JSON.stringify(f.look ?? null)}`;
    if (s.av.dataset.k === key) return;
    s.av.dataset.k = key;
    s.av.classList.remove('dr-pl-none');
    s.av.replaceChildren(ctx.profile.playerAvatar({ id: v.id, name: v.name, face: f.avatar, look: f.look, size }));
  }

  function drawName(s, v) {
    const f = ctx.faces?.get(v.id) ?? { look: null };
    const key = `${v.name}|${JSON.stringify(f.look ?? null)}`;
    if (s.nm.dataset.k === key) return;
    s.nm.dataset.k = key;
    const tag = ctx.profile.nameTag({ name: v.name, look: f.look });
    tag.style.alignItems = 'center'; // 칭호가 이름 위에 가운데로
    s.nm.replaceChildren(tag);
  }

  function render() {
    layout = lay();
    root.classList.toggle('dr-pl-wide', layout === 'wide');
    root.classList.toggle('dr-pl-phone', layout === 'phone');
    const mine = iAmDrawer(state, me());
    root.classList.toggle('dr-pl-mine', mine);
    const lm = logMode(layout, mine);
    root.classList.toggle('dr-pl-log-full', lm === 'full');
    root.classList.toggle('dr-pl-log-small', lm === 'small');
    root.classList.toggle('dr-pl-log-hidden', lm === 'hidden');
    slotOf.clear();
    const slots = seatSlots(state?.players);
    for (let i = 0; i < SEAT_COUNT; i++) {
      const s = seats[i];
      const p = slots[i];
      const col = i < SEATS_PER_SIDE ? 'l' : 'r';
      s.seat.dataset.mode = bubbleMode(layout, col, mine);
      s.seat.classList.toggle('dr-pl-inrow', s.seat.dataset.mode === 'inrow');
      if (!p) {
        if (s.id !== null || s.av.dataset.k !== 'none') {
          clearBubble(s);
          s.id = null;
          s.av.dataset.k = 'none';
          s.av.replaceChildren(h('span', 'dr-pl-emptytxt', '빈 자리'));
          s.av.style.background = '';
          s.av.className = 'dr-pl-av dr-pl-none';
        }
        s.seat.className = 'dr-pl-seat dr-pl-empty';
        s.seat.dataset.mode = bubbleMode(layout, col, mine);
        s.tag.textContent = ''; s.tag.className = 'dr-pl-tag';
        s.nm.textContent = ''; s.nm.dataset.k = ''; s.scNum.textContent = ''; s.plus.textContent = '';
        continue;
      }
      if (s.id !== p.id) { clearBubble(s); s.id = p.id; s.av.dataset.k = ''; }
      slotOf.set(p.id, i);
      const v = playerView(state, p);
      s.av.className = 'dr-pl-av' + (s.av.classList.contains('dr-pl-talk') ? ' dr-pl-talk' : '') + (s.av.classList.contains('dr-pl-cheer') ? ' dr-pl-cheer' : '');
      drawAvatar(s, v);
      const keep = s.seat.classList.contains('dr-pl-say-on');
      s.seat.className = 'dr-pl-seat' + (v.gone ? ' dr-pl-off' : '') + (v.drawing ? ' dr-pl-turn' : '') + (v.hit ? ' dr-pl-hit' : '') + (s.seat.classList.contains('dr-pl-inrow') ? ' dr-pl-inrow' : '') + (keep ? ' dr-pl-say-on' : '');
      s.tag.textContent = v.badge ? v.badge.text : '';
      s.tag.className = 'dr-pl-tag' + (v.badge ? ' dr-pl-' + v.badge.kind : '');
      drawName(s, v);
      s.scNum.textContent = String(v.score);
      s.plus.textContent = v.gain > 0 ? '+' + v.gain : '';
    }
    renderLog();
  }

  function renderLog() {
    // 보이는 동안만 위치를 잰다(숨김이면 0 이라 항상 따라가기로 본다). 새로 그리기 전에 판단해야 한다.
    const follow = shouldFollow(log.scrollTop, log.clientHeight, log.scrollHeight);
    log.replaceChildren();
    for (const it of logItems) {
      const p = h('p', it.kind === 'sys' ? 'dr-pl-sys' : it.kind === 'sec' ? 'dr-pl-sec' : '');
      if (it.name) p.appendChild(h('b', null, it.name));
      p.appendChild(document.createTextNode(it.text));
      log.appendChild(p);
    }
    if (follow) log.scrollTop = log.scrollHeight;
  }

  function restart(el, cls, ms, key) {
    const s = key;
    clearTimeout(s.aTimer);
    el.classList.remove('dr-pl-talk', 'dr-pl-cheer');
    void el.offsetWidth; // 같은 모션을 다시 처음부터
    el.classList.add(cls);
    s.aTimer = setTimeout(() => el.classList.remove(cls), ms + 40);
  }

  function showBubble(b) {
    const i = slotOf.get(b.id);
    if (i == null) return;
    const s = seats[i];
    clearBubble(s); // 새 말이면 교체
    const el = h('span', 'dr-pl-say dr-pl-' + b.kind);
    el.appendChild(h('span', 'dr-pl-say-t', b.text));
    el.setAttribute('aria-hidden', 'true');
    s.avw.appendChild(el);
    s.bubble = el;
    s.seat.classList.add('dr-pl-say-on');
    s.bTimer = setTimeout(() => {
      el.classList.add('dr-pl-out');
      s.bTimer2 = setTimeout(() => { if (s.bubble === el) clearBubble(s); }, FADE_MS);
    }, BUBBLE_MS);
    if (b.kind === 'ok') restart(s.av, 'dr-pl-cheer', CHEER_MS, s);
    else restart(s.av, 'dr-pl-talk', TALK_MS, s);
  }

  function nameOf(id) {
    const p = (state?.players ?? []).find((x) => x && x.id === id);
    return p ? String(p.name ?? '') : '';
  }

  const onResize = () => { if (!disposed && lay() !== layout) render(); };
  window.addEventListener('resize', onResize);

  render();

  return {
    el: root,
    update(st) {
      state = st ?? null;
      render();
    },
    // 사진 이모티콘·기본 이모티콘·말풍선이 뜰 자리: 그 사람 사진의 위쪽 가운데
    anchor(id) {
      const i = slotOf.get(id);
      if (i == null || root.closest('[hidden]')) return null;
      const r = seats[i].av.getBoundingClientRect();
      return r.width ? { x: r.left + r.width / 2, y: r.top + 4 } : null;
    },
    event(e) {
      if (disposed || !e || typeof e.k !== 'string') return;
      switch (e.k) {
        case 'faces':
          for (const f of Array.isArray(e.items) ? e.items : []) {
            if (f && typeof f.id === 'string') { const i = slotOf.get(f.id); if (i != null) { seats[i].av.dataset.k = ''; seats[i].nm.dataset.k = ''; } }
          }
          render();
          break;
        case 'chat': {
          const b = bubbleFromChat(e, state, me());
          if (!b) break;
          showBubble(b);
          pushLog(logItems, logEntryFromChat(e, state, me()));
          renderLog();
          break;
        }
        case 'chatLog':
          logItems.length = 0;
          logItems.push(...logFromChatLog(e.items, state, me()));
          renderLog();
          break;
        case 'drHit': {
          const b = bubbleFromHit(e);
          if (!b) break;
          showBubble(b);
          pushLog(logItems, logEntryFromHit(nameOf(e.id)));
          renderLog();
          break;
        }
        case 'drNew':
          for (const s of seats) clearBubble(s);
          break;
        case 'left':
          if (typeof e.id === 'string') { const i = slotOf.get(e.id); if (i != null) clearBubble(seats[i]); }
          break;
        default:
      }
    },
    dispose() {
      disposed = true;
      window.removeEventListener('resize', onResize);
      for (const s of seats) { clearBubble(s); clearTimeout(s.aTimer); }
      root.remove();
    },
  };
}
