// 갱스껄 손패·버튼 (GDD 16절). createHand(parent, ctx) → { el, update(view), event(e), dispose() }
// ctx 에서 쓰는 것: send, meId, face(id), anchor('stack', meId) / anchor('handDock'), fx.sound?.('place').
// 1280×720 무대를 화면에 맞춰 줄여(--k) 쓴다. 사용자 글자는 쓰지 않는다(고정 문구만).
import './hand.css';
import { requestFor } from '../actions.js';
import { discBackUrl, discFlowerUrl, discSkullUrl, skullPhotoUrl } from '../art.js';
import { plan, normalizeLocal, slot, W } from './hand.pure.js';

const SW = 1280;
const SH = 720;
const FLY_MS = 580;
const PENDING_MS = 2500;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const DIAMOND = '<svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z"></path></svg>';
const diamond = () => {
  const s = el('span');
  s.style.display = 'inline-flex';
  s.innerHTML = DIAMOND; // 고정 문자열
  return s;
};

export function createHand(parent, ctx) {
  const root = el('div', 'gk-hd-root');
  const stage = el('div', 'gk-hd-stage');
  const scrim = el('div', 'gk-hd-scrim');
  const cap = el('div', 'gk-hd-cap');
  const controls = el('div'); // 버튼·동전이 바뀌는 자리
  const discsBox = el('div');
  const fxBox = el('div');
  stage.append(scrim, cap, controls, discsBox, fxBox);
  root.append(stage);
  parent.append(root);

  let view = null;
  let local = { mode: 'idle' };
  let pending = null; // { k, base }
  let pendingTimer = 0;
  let discEls = [];
  let handSig = '';
  let ctlSig = '';
  let disposed = false;
  const timers = new Set();
  let skullUrl = null;
  let skullKey = '';
  let ro = null;

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms);
    timers.add(t);
    return t;
  };

  const me = () => (view && view.seats.find((s) => s.isMe)) || null;
  const color = () => { const m = me(); return m ? m.color || 0 : 0; };

  // ---- 무대 크기 ----
  let k = 1;
  const fit = () => {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    k = w > 0 && h > 0 ? Math.min(w / SW, h / SH) : 1;
    root.style.setProperty('--k', String(k));
  };
  fit();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(fit);
    ro.observe(parent);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', fit);
  }

  // 화면 요소 중심 → 무대 좌표
  const toStage = (node) => {
    if (!node || !node.getBoundingClientRect) return null;
    const r = node.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const kk = s.width / SW || 1;
    return { x: (r.left - s.left) / kk, y: (r.top - s.top) / kk, cx: (r.left + r.width / 2 - s.left) / kk, cy: (r.top + r.height / 2 - s.top) / kk };
  };
  const dockPos = () => {
    let a = null;
    try { a = ctx.anchor && ctx.anchor('handDock'); } catch (e) { a = null; }
    const p = toStage(a);
    return p ? { x: p.x, y: p.y } : null;
  };

  // ---- 내 해골 그림(프로필 사진 합성) ----
  const wantSkull = () => {
    const m = me();
    if (!m) return;
    let face = null;
    try { face = ctx.face && ctx.face(m.id); } catch (e) { face = null; }
    const key = `${m.color}|${face || ''}`;
    if (key === skullKey) return;
    skullKey = key;
    skullUrl = discSkullUrl(m.color || 0);
    applySkull();
    if (face) {
      skullPhotoUrl(m.color || 0, face).then((u) => {
        if (disposed || key !== skullKey) return;
        skullUrl = u;
        applySkull();
      }, () => {});
    }
  };
  const applySkull = () => {
    for (const d of discEls) if (d.kind === 'S') d.img.src = skullUrl;
  };
  const faceSrc = (kind) => (kind === 'S' ? skullUrl || discSkullUrl(color()) : discFlowerUrl(color()));

  // ---- 동작 ----
  const send = (req) => { if (req && !disposed) ctx.send(req); };
  const actionByKey = (key) => (view && view.actions.find((a) => a.key === key)) || null;
  const sound = (name) => { try { ctx.fx && ctx.fx.sound && ctx.fx.sound(name); } catch (e) { /* 소리 없음 */ } };
  const setMode = (mode) => { local = { mode, sel: local && local.sel }; render(); };

  function clearPending() {
    pending = null;
    if (pendingTimer) { clearTimeout(pendingTimer); timers.delete(pendingTimer); pendingTimer = 0; }
  }

  function placeDisc(j, kind) {
    const a = actionByKey(`place-${kind}`);
    if (!a || pending) return;
    const p = plan(view, local, null);
    const from = slot(j, p.hand.length, true);
    const base = (view.me.hand[kind] | 0);
    pending = { k: kind, base };
    pendingTimer = later(() => { pendingTimer = 0; pending = null; render(); }, PENDING_MS);
    send(requestFor(a));
    local = { mode: 'idle' };
    fly(kind, from);
    render();
  }

  // 손패 자리 → 내 더미 위로 날아가 뒤집혀 탁 (캔버스 Main 의 playDisc)
  function fly(kind, from) {
    let target = null;
    try { target = toStage(ctx.anchor && ctx.anchor('stack', ctx.meId())); } catch (e) { target = null; }
    const DS = 80;
    const tx = target ? target.cx - DS / 2 : 640 - DS / 2;
    const ty = target ? target.cy - DS / 2 : 330;
    const wrap = el('div', 'gk-hd-fly');
    wrap.style.transform = `translate(${from.x}px,${from.y}px) scale(1)`;
    const arc = el('div', 'gk-hd-arc');
    const inn = el('div', 'gk-hd-in');
    const f = el('span', 'gk-hd-f');
    const img = el('img');
    img.alt = '';
    img.src = faceSrc(kind);
    f.append(img);
    const b = el('img', 'gk-hd-b');
    b.alt = '';
    b.src = discBackUrl(color());
    inn.append(f, b);
    arc.append(inn);
    wrap.append(arc);
    fxBox.append(wrap);
    later(() => {
      wrap.style.transition = 'transform .5s cubic-bezier(.45,0,.3,1)';
      wrap.style.transform = `translate(${tx}px,${ty}px) scale(${DS / W})`;
    }, 40);
    later(() => {
      wrap.remove();
      const land = el('div', 'gk-hd-land');
      land.style.left = `${tx + DS / 2}px`;
      land.style.top = `${ty + DS / 2}px`;
      land.append(el('i', 'gk-hd-shade'), el('i', 'gk-hd-dust'), el('i', 'gk-hd-puff'));
      fxBox.append(land);
      sound('place');
      later(() => land.remove(), 650);
    }, FLY_MS);
  }

  // ---- 그리기 ----
  function buildControls(p) {
    controls.textContent = '';
    if (p.buttons.length) {
      const acts = el('div', 'gk-hd-acts');
      for (const bt of p.buttons) {
        const b = el('button', 'gk-hd-btn' + (bt.tone === 'ink' ? ' gk-hd-ink' : ''));
        b.type = 'button';
        b.dataset.gk = bt.key;
        b.append(diamond(), el('span', '', bt.label), diamond());
        b.addEventListener('click', () => setMode(bt.key === 'choose-place' ? 'place' : 'bid'));
        acts.append(b);
      }
      controls.append(acts);
    }
    if (p.coins) {
      controls.append(el('div', 'gk-hd-ask', p.coins.ask));
      const rows = p.coins.rows;
      const acts = el('div', 'gk-hd-acts gk-hd-coins' + (rows.length > 1 ? ' gk-hd-two' : ''));
      rows.forEach((nums, ri) => {
        const row = el('div', 'gk-hd-row');
        for (const n of nums) {
          const c = el('button', 'gk-hd-coin', String(n));
          c.type = 'button';
          c.dataset.gk = `pick-${n}`;
          c.setAttribute('aria-label', `${n}`);
          c.setAttribute('aria-pressed', n === p.coins.sel ? 'true' : 'false');
          if (n === p.coins.sel) c.classList.add('gk-hd-sel');
          c.addEventListener('click', () => { local = { ...local, sel: n }; render(); });
          row.append(c);
        }
        if (ri === rows.length - 1) {
          row.append(el('i', 'gk-hd-sep'));
          const cf = p.coins.confirm;
          const ok = el('button', 'gk-hd-btn gk-hd-confirm');
          ok.type = 'button';
          ok.dataset.gk = cf.key || 'bid-none';
          ok.disabled = !cf.enabled;
          ok.append(diamond(), el('span', '', cf.label), diamond());
          ok.addEventListener('click', () => {
            const a = actionByKey(cf.key);
            if (!a) return;
            send(requestFor(a));
            local = { mode: 'idle' };
          });
          row.append(ok);
        }
        if (ri === rows.length - 1 && (p.cancel || p.pass)) {
          if (p.cancel) {
            const g = el('button', 'gk-hd-ghost', '취소');
            g.type = 'button';
            g.dataset.gk = 'cancel';
            g.addEventListener('click', () => setMode('idle'));
            row.append(g);
          }
          if (p.pass) {
            const g = el('button', 'gk-hd-btn gk-hd-ink gk-hd-pass');
            g.type = 'button';
            g.dataset.gk = 'pass';
            g.append(diamond(), el('span', '', '패스'), diamond());
            g.addEventListener('click', () => {
              const a = actionByKey('pass');
              if (a) send(requestFor(a));
            });
            row.append(g);
          }
        }
        acts.append(row);
      });
      controls.append(acts);
    }
    if (!p.coins && p.open && p.cancel) {
      const g = el('button', 'gk-hd-ghost gk-hd-abs', '취소');
      g.type = 'button';
      g.dataset.gk = 'cancel';
      g.addEventListener('click', () => setMode('idle'));
      controls.append(g);
    }
  }

  function buildDiscs(list) {
    discsBox.textContent = '';
    discEls = list.map((kind, j) => {
      const b = el('button', 'gk-hd-disc');
      b.type = 'button';
      const face = el('span', 'gk-hd-face');
      const img = el('img');
      img.alt = '';
      img.src = faceSrc(kind);
      face.append(img);
      const dc = el('span', 'gk-hd-dcap', kind === 'S' ? '해골' : '꽃');
      b.append(face, dc);
      b.setAttribute('aria-label', (kind === 'S' ? '해골' : '꽃') + ' 원판');
      b.addEventListener('click', () => {
        if (b.dataset.mode === 'place') placeDisc(j, kind);
        else if (b.dataset.mode === 'open') setMode('place');
      });
      discsBox.append(b);
      return { b, img, dc, kind };
    });
  }

  function render() {
    if (disposed) return;
    if (!view) { root.hidden = true; return; }
    local = normalizeLocal(view, local);
    wantSkull();
    const p = plan(view, local, pending && pending.k);
    root.hidden = !p.visible;
    if (!p.visible) return;

    const hs = p.hand.join('');
    if (hs !== handSig) { handSig = hs; buildDiscs(p.hand); }
    const dock = dockPos();
    const m = p.hand.length;
    discEls.forEach((d, j) => {
      const s = slot(j, m, p.open, dock);
      d.b.style.transform = `translate(${s.x}px,${s.y}px) scale(${s.s})`;
      d.dc.style.opacity = p.open ? '1' : '0';
      d.b.dataset.mode = p.discMode || '';
      d.b.classList.toggle('gk-hd-hit', !!p.discMode);
      if (p.discMode === 'place') d.b.dataset.gk = `place-${d.kind}`;
      else delete d.b.dataset.gk;
    });

    const sig = JSON.stringify([p.buttons, p.coins, p.pass, p.cancel, p.open]);
    if (sig !== ctlSig) { ctlSig = sig; buildControls(p); }

    scrim.classList.toggle('gk-hd-on', p.open || !!p.coins || p.buttons.length > 0);
    cap.textContent = p.caption;
    cap.style.opacity = p.open ? '0' : '1';
  }

  return {
    el: root,
    update(v) {
      view = v;
      if (pending && v && v.me && (v.me.hand[pending.k] | 0) < pending.base) clearPending();
      fit();
      render();
    },
    event() { /* 연출은 placeDisc 가 직접 한다. 서버 이벤트는 쓰지 않는다. */ },
    dispose() {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (ro) ro.disconnect();
      else if (typeof window !== 'undefined') window.removeEventListener('resize', fit);
      root.remove();
    },
  };
}
