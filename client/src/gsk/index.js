// mountGsk: 갱스껄 임시 화면 (서버와 끝까지 한 판을 돌리기 위한 단순한 화면. 나중에 진짜 화면으로 교체).
//   const gsk = mountGsk({ ui, send, getMe?, toast?, leave? });
//   gsk.room(state)   방 상태(GDD 9-2)가 올 때마다. 방을 나가면 room(null).
//   gsk.event(e)      event.e 하나. 지금은 faces(프로필 사진)만 쓴다.
//   gsk.error(err)    {code, msg}. toast 가 있으면 보여 준다.
//   gsk.dispose()     화면을 걷어낸다.
// 교체할 때: 화면 그리기(draw 함수)만 새로 만들고, toView(model.js)와 requestFor(actions.js)는 그대로 쓴다.
// 버튼은 toView().actions 에서만 만든다. data-gk 속성이 시험 자동화용 손잡이.
import './gsk.css';
import { toView } from './model.js';
import { requestFor } from './actions.js';
import { COLORS, discBackUrl, discFlowerUrl, discSkullUrl, matUrl, floorUrl, skullPhotoUrl, preload } from './art.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const IMG = /^data:image\/(jpeg|png|webp);base64,/;

let current = null;

export function mountGsk(opts) {
  current?.dispose();
  const inst = mountInner(opts);
  const d = inst.dispose;
  inst.dispose = () => { if (current === inst) current = null; d(); };
  current = inst;
  return inst;
}

function mountInner({ ui, send, getMe, toast, leave }) {
  const root = el('div', 'gk-tmp-root');
  root.style.backgroundImage = `url(${floorUrl()})`;
  root.hidden = true;
  ui.append(root);
  let state = null;
  let disposed = false;
  const faces = new Map();
  preload();

  const meId = () => state?.you ?? getMe?.()?.id ?? null;

  const act = (a) => {
    const req = requestFor(a);
    if (req && !disposed) send(req);
  };
  const btn = (a, label, cls) => {
    const b = el('button', 'gk-tmp-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.dataset.gk = a.key;
    b.addEventListener('click', () => act(a));
    return b;
  };
  const disc = (src, cls) => {
    const i = el('img', 'gk-tmp-disc' + (cls ? ' ' + cls : ''));
    i.src = src;
    i.alt = '';
    i.draggable = false;
    return i;
  };

  function draw() {
    root.replaceChildren();
    const v = toView(state, meId());
    if (!v) { root.hidden = true; return; }
    root.hidden = false;

    const top = el('div', 'gk-tmp-top');
    top.append(el('span', 'gk-tmp-code', `방 ${state.code}`));
    const lv = el('button', 'gk-tmp-btn gk-tmp-leave', '나가기');
    lv.type = 'button';
    lv.dataset.gk = 'leave';
    lv.addEventListener('click', () => (leave ? leave() : send({ t: 'leave' })));
    top.append(lv);
    root.append(top);

    const seatsBox = el('div', 'gk-tmp-seats');
    const isFlip = v.actions.filter((a) => a.a === 'flip');
    for (const s of v.seats) {
      const card = el('div', 'gk-tmp-seat' + (s.isMe ? ' gk-tmp-me' : '') + (s.isTurn ? ' gk-tmp-turn' : '') + (s.out ? ' gk-tmp-out' : ''));
      card.dataset.gkSeat = s.id;
      const mat = el('div', 'gk-tmp-mat');
      if (s.color != null) mat.style.backgroundImage = `url(${matUrl(s.color, s.points >= 1)})`;
      const name = el('div', 'gk-tmp-name', s.name);
      mat.append(name);
      const stk = el('div', 'gk-tmp-stack');
      for (let i = 0; i < s.stack; i++) {
        const shownIdx = i - (s.stack - s.shown.length); // 위에서부터 공개: 위쪽 shown.length 장
        const c = s.color == null ? 0 : s.color;
        if (shownIdx >= 0) {
          const kind = s.shown[s.stack - 1 - i];
          stk.append(disc(kind === 'S' ? discSkullUrl(c) : discFlowerUrl(c)));
        } else stk.append(disc(discBackUrl(c)));
      }
      mat.append(stk);
      card.append(mat);
      const info = [];
      if (state.phase !== 'lobby') info.push(`손 ${s.hand} · 판 ${s.stack}`, `${s.points}점`);
      if (s.status) info.push(s.status);
      if (info.length) card.append(el('div', 'gk-tmp-info', info.join(' · ')));
      const fl = isFlip.find((a) => a.p === s.id);
      if (fl) {
        card.append(btn(fl, '뒤집기', 'gk-tmp-flip'));
      }
      if (state.phase === 'lobby') {
        card.append(el('div', 'gk-tmp-info', s.color == null ? '색 안 고름' : COLORS[s.color].name));
      }
      seatsBox.append(card);
    }
    root.append(seatsBox);

    const mid = el('div', 'gk-tmp-center', v.center);
    mid.dataset.gk = 'center';
    root.append(mid);

    const bar = el('div', 'gk-tmp-actions');
    const by = (t) => v.actions.filter((a) => a.a === t);

    if (by('color').length) {
      const row = el('div', 'gk-tmp-row');
      row.append(el('span', 'gk-tmp-label', '색 고르기'));
      for (const a of by('color')) row.append(btn(a, COLORS[a.c].name, 'gk-tmp-color'));
      bar.append(row);
    }
    if (by('place').length) {
      const row = el('div', 'gk-tmp-row');
      for (const a of by('place')) {
        const b = btn(a, a.k === 'F' ? `꽃 내기 (${v.me.hand.F})` : `해골 내기 (${v.me.hand.S})`);
        row.append(b);
      }
      bar.append(row);
    }
    const bids = by('bid');
    if (bids.length) {
      const row = el('div', 'gk-tmp-row');
      row.append(el('span', 'gk-tmp-label', v.step === 'bid' ? '올리기' : '도전'));
      for (const a of bids) row.append(btn(a, String(a.n), 'gk-tmp-num'));
      bar.append(row);
    }
    for (const a of by('pass')) bar.append(btn(a, '패스'));
    const dis = by('discard');
    if (dis.length) {
      const row = el('div', 'gk-tmp-row');
      row.append(el('span', 'gk-tmp-label', '버릴 원판'));
      for (const a of dis) {
        if (a.k !== undefined) row.append(btn(a, a.k === 'F' ? '꽃' : '해골'));
        else {
          const b = btn(a, '');
          b.classList.add('gk-tmp-pick');
          b.append(disc(discBackUrl(0)));
          row.append(b);
        }
      }
      bar.append(row);
    }
    for (const a of by('start')) bar.append(btn(a, state.phase === 'result' ? '한 판 더' : '시작'));
    root.append(bar);

    if (v.me && (state.phase === 'playing')) {
      const hand = el('div', 'gk-tmp-hand');
      const me = v.seats.find((s) => s.isMe);
      const c = me && me.color != null ? me.color : 0;
      const kinds = [];
      for (let i = 0; i < v.me.hand.F; i++) kinds.push('F');
      for (let i = 0; i < v.me.hand.S; i++) kinds.push('S');
      for (const k of kinds) {
        const i = disc(k === 'S' ? discSkullUrl(c) : discFlowerUrl(c), 'gk-tmp-hand-disc');
        if (k === 'S') {
          const photo = faces.get(meId());
          if (photo) skullPhotoUrl(c, photo).then((u) => { if (!disposed) i.src = u; });
        }
        hand.append(i);
      }
      hand.append(el('span', 'gk-tmp-label', '내 손'));
      root.append(hand);
    }

    if (state.phase === 'result' && v.result) {
      const box = el('div', 'gk-tmp-result');
      box.dataset.gk = 'result';
      box.append(el('div', 'gk-tmp-result-title', v.result.winner ? '갱스껄 승리!' : '판 끝'));
      const ol = el('ol');
      for (const r of v.result.ranks || []) {
        ol.append(el('li', null, `${r.rank}위 ${r.name} — ${r.points}점, 원판 ${r.discs}`));
      }
      box.append(ol);
      root.append(box);
    }
  }

  return {
    room(s) {
      if (disposed) return;
      state = s || null;
      draw();
    },
    event(e) {
      if (disposed || !e) return;
      if (e.k === 'faces' && Array.isArray(e.items)) {
        for (const f of e.items) {
          if (f && typeof f.id === 'string') {
            if (typeof f.avatar === 'string' && IMG.test(f.avatar)) faces.set(f.id, f.avatar);
            else faces.delete(f.id);
          }
        }
        if (state) draw();
      }
    },
    error(err) {
      if (disposed || !err) return;
      toast?.(err.msg || '오류');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  };
}
