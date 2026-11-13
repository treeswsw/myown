// 갱스껄 연출 층 (GDD 15·16절). 디자인 캔버스 Flip.dc.html 의 뒤집기·꽃 효과·해골 패배·성공 피날레를 실제 화면 위에 덧그린다.
//   const fx = createFx(parent, ctx)
//   fx.flip(e, info) → Promise   gkFlip 한 장. 끝나면 resolve(꽃: 펼친 줄에 닿았을 때 / 해골: 패배 연출이 자리 잡았을 때).
//   fx.reveal(e, info) → Promise gkReveal. 성공이면 피날레 + 개인판 1점 면으로. 실패면 패배 연출을 그대로 둔다.
//   fx.place(e) → Promise        gkPlace(남의 것). 그 더미 위 내려앉는 먼지 + 작은 "탁".
//   fx.busy()                    flip·reveal 이 돌고 있으면 true(남아 있는 패배·성공 글씨는 세지 않는다).
//   fx.sound(name)               'place' | 'tick' (손·탁자가 부르는 짧은 소리)
//   fx.update(view)              화면 상태가 바뀔 때마다. step 이 flip·reveal 이 아니게 되면 남은 연출을 걷는다.
//   fx.event(e)                  gkReveal 만 받아 reveal 로 넘긴다(같은 이벤트를 reveal 로도 불렀다면 한 번만 돈다).
//   fx.dispose()
// 자리는 ctx.anchor(kind, id) 가 주는 DOM 요소의 화면 위치로 잰다. 이 층은 눌리지 않는다(pointer-events: none).
// 무작위 없음: 꽃잎·반짝임 배치는 고정 계산(fx.pure.js) → 모든 사람이 같은 모습.
import './fx.css';
import { createAudio } from '../audio.js';
import { discBackUrl, discFlowerUrl, discSkullUrl, matUrl, setSkullImg } from '../art.js';
import {
  levelFor, isTease, flipTimeline, flipDuration, effLevel, burstSpec, WIN_BURST, petalAt, sparkAt,
  auraPaths, HORNS, REVEAL_HOLD_MS, PLACE_MS, LINGER_MAX_MS, doomLine, winLine,
} from './fx.pure.js';

// 가운데 해골 그림(색 뺀 해골). 파일이 아직 없으면 뿔·눈빛만 보인다.
const DEMON_SKULL = new URL('../img/marker-skull.png', import.meta.url).href;
const SVG = 'http://www.w3.org/2000/svg';

const mk = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
const img = (cls, src) => {
  const n = mk('img', cls);
  n.alt = '';
  n.draggable = false;
  if (src) n.src = src;
  return n;
};
const svg = (cls, box, attrs) => {
  const s = document.createElementNS(SVG, 'svg');
  if (cls) s.setAttribute('class', cls);
  s.setAttribute('viewBox', box);
  s.setAttribute('aria-hidden', 'true');
  for (const k of Object.keys(attrs || {})) s.setAttribute(k, attrs[k]);
  return s;
};
const path = (d, transform) => {
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  if (transform) p.setAttribute('transform', transform);
  return p;
};
const px = (v) => `${Math.round(v * 100) / 100}px`;

export function createFx(parent, ctx = {}) {
  const el = mk('div', 'gk-fx-layer');
  el.setAttribute('aria-hidden', 'true');
  const vig = mk('div', 'gk-fx-vig');
  el.append(vig);
  parent.append(el);

  const audio = createAudio();
  let disposed = false;
  let active = 0;            // 돌고 있는 flip·reveal 수
  let view = null;
  let linger = null;         // { nodes:[], undo:[], timer } — 다음 화면까지 남겨 두는 패배·성공 연출
  let edge = null;
  let revealed = false;      // 이번 도전의 판정 연출을 이미 했는가
  const seen = new WeakSet();
  const timers = new Set();
  const pending = new Set(); // 끝나지 않은 Promise 의 resolve

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (disposed) return;
      try { fn(); } catch { /* 연출이 깨져도 게임은 계속된다 */ }
    }, ms);
    timers.add(id);
    return id;
  };
  const drop = (node, ms) => later(() => node.remove(), ms);

  // ── 자리 재기: 층 안 좌표(층이 scale 된 부모 안에 있어도 맞게)
  function scaleK() {
    const w = el.offsetWidth;
    if (!w) return 1;
    const k = el.getBoundingClientRect().width / w;
    return k > 0 ? k : 1;
  }
  function measure(node) {
    if (!node || !node.getBoundingClientRect || !el.isConnected) return null;
    const k = scaleK();
    const L = el.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height && !node.isConnected) return null;
    // 돌려 놓은 자리(개인판)를 위해 부모까지의 회전·배율을 모은다
    let rot = 0, sc = 1;
    try {
      for (let a = node; a && a !== parent && a.nodeType === 1; a = a.parentElement) {
        const t = getComputedStyle(a).transform;
        if (!t || t === 'none') continue;
        const m = new DOMMatrix(t);
        rot += Math.atan2(m.b, m.a);
        sc *= Math.hypot(m.a, m.b) || 1;
      }
    } catch { rot = 0; sc = 1; }
    const w = node.offsetWidth ? node.offsetWidth * sc : r.width / k;
    const h = node.offsetHeight ? node.offsetHeight * sc : r.height / k;
    return {
      x: (r.left + r.width / 2 - L.left) / k,
      y: (r.top + r.height / 2 - L.top) / k,
      w, h, rot: (rot * 180) / Math.PI,
    };
  }
  const unitS = () => (el.offsetHeight || 720) / 720;
  const anchor = (kind, id) => {
    try { return ctx.anchor ? ctx.anchor(kind, id) : null; } catch { return null; }
  };
  const seatOf = (v, id) => ((v && v.seats) || []).find((s) => s.id === id) || null;
  const nameOf = (v, id) => {
    const s = seatOf(v, id);
    return s ? String(s.name ?? '') : '';
  };

  // 한 점에 붙는 효과 묶음
  function spot(x, y, u, z) {
    const s = mk('div', `gk-fx-spot gk-fx-z${z}`);
    s.style.transform = `translate(${px(x)},${px(y)}) scale(${u})`;
    el.append(s);
    return s;
  }
  // 꽃 효과(빛·고리·꽃잎·반짝임)
  function burst(x, y, u, spec) {
    const s = spot(x, y, u, 24);
    const glow = mk('div', 'gk-fx-glow');
    const gs = spec.size, rs = spec.size * 0.74;
    glow.style.cssText = `left:${-gs / 2}px;top:${-gs / 2}px;width:${gs}px;height:${gs}px`;
    const ring = mk('div', 'gk-fx-ring');
    ring.style.cssText = `left:${-rs / 2}px;top:${-rs / 2}px;width:${rs}px;height:${rs}px`;
    s.append(glow, ring);
    for (let i = 0; i < spec.petals; i++) {
      const p = petalAt(i, spec.petals);
      const w = mk('i', 'gk-fx-p');
      w.style.transform = `rotate(${p.rot}deg) scale(${spec.spread})`;
      const pet = mk('i', 'gk-fx-pet');
      pet.style.animation = `gk-fx-pet${p.kind} ${p.dur}s cubic-bezier(.15,.7,.3,1) ${p.delay}s both`;
      w.append(pet);
      s.append(w);
    }
    for (let j = 0; j < spec.sparks; j++) {
      const p = sparkAt(j, spec.sparks, spec.spread);
      const w = mk('i', 'gk-fx-p');
      w.style.transform = `rotate(${p.rot}deg) scale(${p.scale})`;
      const sw = mk('i', 'gk-fx-spk-w');
      sw.style.animation = `gk-fx-spk ${p.dur}s ease-out ${p.delay}s both`;
      sw.append(mk('i', 'gk-fx-spk'));
      w.append(sw);
      s.append(w);
    }
    drop(s, 1400);
    return s;
  }

  // ── 남겨 두는 연출(패배·성공) 걷기
  function clearLinger(now) {
    const l = linger;
    if (!l) return;
    linger = null;
    clearTimeout(l.timer);
    timers.delete(l.timer);
    for (const u of l.undo) { try { u(); } catch { /* 무시 */ } }
    el.classList.remove('gk-fx-shake');
    for (const n of l.nodes) {
      if (now) n.remove();
      else { n.style.transition = ''; n.classList.add('gk-fx-out'); drop(n, 420); }
    }
  }
  function keep(nodes, undo = []) {
    if (!linger) {
      linger = { nodes: [], undo: [], timer: 0 };
      linger.timer = later(() => clearLinger(false), LINGER_MAX_MS);
    }
    linger.nodes.push(...nodes);
    linger.undo.push(...undo);
  }
  function setEdge(on) {
    if (on && !edge) { edge = mk('div', 'gk-fx-edge'); el.prepend(edge); }
    if (!on && edge) { edge.remove(); edge = null; }
  }

  const showing = (v) => !!v && v.phase === 'playing' && (v.step === 'flip' || v.step === 'reveal');

  // Promise 를 만들고, dispose 때도 반드시 끝나게 한다
  function run(body, ms) {
    if (disposed) return Promise.resolve();
    active++;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pending.delete(finish);
        active = Math.max(0, active - 1);
        // 연출이 밀린 사이 이미 다음 화면으로 넘어갔다면 남은 것을 바로 걷는다
        if (active === 0 && linger && view && !showing(view)) clearLinger(false);
        resolve();
      };
      pending.add(finish);
      let after = null;
      try { after = body(); } catch { after = null; }
      later(() => {
        try { if (after) after(); } catch { /* 무시 */ }
        finish();
      }, ms);
    });
  }

  // ── 한 장 공개
  function flip(e, info = {}) {
    if (!e || disposed) return Promise.resolve();
    const disc = e.disc === 'S' ? 'S' : 'F';
    const tz = isTease(disc, e.tease);
    const v = info.view || view;
    return run(() => {
      clearLinger(true);
      revealed = false;
      const need = Number(info.need ?? (v && v.progress && v.progress.need) ?? 0) || 0;
      const flipped = Number(info.flipped ?? e.flipped ?? 0) || 0;
      const r = need - flipped;
      const lv = levelFor(r);
      const owner = seatOf(v, e.p);
      const color = owner && owner.color != null ? owner.color : 0;
      const back = info.back || discBackUrl(color);
      const faceIn = info.face || (disc === 'S' ? discSkullUrl(color) : discFlowerUrl(color));

      const fromEl = info.from || anchor('stack', e.p);
      const toEl = disc === 'F' ? (info.to || anchor('rowSlot', flipped - 1)) : null;
      const A = measure(fromEl);
      const B = measure(toEl);
      const tl = flipTimeline(disc, tz);
      const at = (stage) => (tl.find((x) => x.stage === stage) || {}).at;

      // 소리(자리를 못 재도 소리는 낸다)
      if (!tz) later(() => audio.stage(lv, flipped, 0.2, false), at('turn'));
      else {
        later(() => audio.beat(0.05), at('tease1'));
        later(() => audio.beat(0), at('tease2'));
        later(() => audio.beat(0), at('tease3'));
        if (disc === 'S') later(() => audio.doom(), at('doom'));
        else later(() => { audio.relief(); audio.stage(lv, flipped, 0.06, true); }, at('relief'));
      }
      const afterLand = () => { if (disc === 'F') setEdge(r === 1); };
      if (!A) return afterLand;

      const s = unitS();
      let DS = Math.min(A.w || 0, A.h || 0);
      if (!(DS > 8)) DS = B && B.w > 8 ? B.w * 1.25 : 80 * s;
      const u = DS / 80;
      const X = A.x - DS / 2, Y = A.y - DS / 2, UP = Y - 24 * u;
      const cx = A.x, cy = UP + DS / 2;
      // 해골이 커질 자리: 화면 위로 잘리지 않게 내려 잡는다(캔버스: max(UP, 136))
      const DY = Math.max(UP, 176 * u - DS / 2);
      const dcy = DY + DS / 2;

      const card = mk('div', 'gk-fx-card');
      card.style.width = px(DS);
      card.style.height = px(DS);
      const trem = mk('div', 'gk-fx-trem');
      const per = mk('div', 'gk-fx-per');
      const inn = mk('div', 'gk-fx-in');
      const f = mk('div', 'gk-fx-f');
      const face = img('', typeof faceIn === 'string' ? faceIn : '');
      // 공개된 해골은 주인의 프로필 사진으로(없으면 그림 해골)
      if (disc === 'S' && !info.face) setSkullImg(face, color, ctx.face && e.p ? ctx.face(e.p) : null, () => !disposed);
      if (faceIn && typeof faceIn.then === 'function') {
        faceIn.then((url) => { if (url) face.src = url; }, () => { face.src = disc === 'S' ? discSkullUrl(color) : discFlowerUrl(color); });
      }
      f.append(face);
      inn.append(img('gk-fx-b', back), f);
      per.append(inn);
      trem.append(per);
      card.append(trem);
      const pose = (x, y, sc, tt) => {
        card.style.transition = tt;
        card.style.transform = `translate(${px(x)},${px(y)}) scale(${sc})`;
      };
      const turn = (deg, tt) => {
        inn.style.transition = tt;
        inn.style.transform = `rotateY(${deg}deg)`;
      };
      const dim = (o, fast) => {
        vig.style.transition = fast ? 'opacity .22s ease-out' : '';
        vig.style.opacity = String(o);
      };
      pose(X, Y, 1, 'none');
      turn(0, 'none');
      el.append(card);
      const hidden = info.hide && info.hide.style ? info.hide : null;
      if (hidden) hidden.style.visibility = 'hidden';
      const unhide = () => { if (hidden) hidden.style.visibility = ''; };
      const flyTo = () => {
        trem.className = 'gk-fx-trem';
        if (B) pose(B.x - DS / 2, B.y - DS / 2, (B.w > 8 ? B.w : DS * 0.8) / DS, 'transform .5s cubic-bezier(.5,0,.2,1)');
        turn(180, 'transform .42s');
      };
      const bloom = () => burst(cx, cy, u, burstSpec(effLevel(lv, disc, tz && disc === 'F')));

      later(() => pose(X, UP, 1.4, 'transform .26s cubic-bezier(.3,.8,.3,1)'), at('up'));
      if (!tz) {
        later(() => turn(180, 'transform .42s cubic-bezier(.45,.05,.3,1)'), at('turn'));
        later(bloom, at('bloom'));
        later(flyTo, at('fly'));
      } else {
        // 여기부터 split 까지는 꽃·해골이 완전히 같다(움직임·떨림·어두워짐·심장 박동)
        later(() => { pose(X, UP, 1.46, 'transform .5s ease-out'); turn(76, 'transform .5s cubic-bezier(.2,.7,.3,1)'); trem.className = 'gk-fx-trem gk-fx-t1'; dim(0.34); }, at('tease1'));
        later(() => { pose(X, UP, 1.44, 'transform .3s ease-out'); turn(54, 'transform .32s ease-in-out'); dim(0.54); }, at('tease2'));
        later(() => { pose(X, UP, 1.52, 'transform .4s ease-out'); turn(86, 'transform .42s cubic-bezier(.2,.7,.3,1)'); trem.className = 'gk-fx-trem gk-fx-t2'; dim(0.72); }, at('tease3'));
        if (disc === 'F') {
          later(() => {
            trem.className = 'gk-fx-trem';
            pose(X, UP, 1.6, 'transform .34s cubic-bezier(.2,1.6,.4,1)');
            turn(180, 'transform .16s ease-out');
            dim(0, true);
            const warm = spot(cx, cy, u, 19);
            warm.append(mk('div', 'gk-fx-warm'));
            drop(warm, 1000);
            bloom();
          }, at('relief'));
          later(flyTo, at('fly'));
        } else {
          later(() => {
            trem.className = 'gk-fx-trem';
            dim(0, true);
            trem.prepend(mk('div', 'gk-fx-rim'));
            pose(X, DY, 1.95, 'transform .3s cubic-bezier(.2,1.8,.4,1)');
            turn(180, 'transform .13s ease-in');
            const dark = mk('div', 'gk-fx-dark');
            const red = spot(A.x, dcy, u, 20);
            red.append(mk('div', 'gk-fx-red'));
            const demon = spot(A.x, dcy, u, 21);
            const dm = mk('div', 'gk-fx-demon');
            const horns = svg('', '0 0 290 290', { fill: '#160505', stroke: '#b02a1c', 'stroke-width': '1.6', 'stroke-linejoin': 'round' });
            for (const d of HORNS) horns.append(path(d));
            const skull = img('', DEMON_SKULL);
            skull.addEventListener('error', () => skull.remove());
            dm.append(horns, mk('i'), skull);
            demon.append(dm);
            const aura = spot(A.x, dcy, u, 22);
            const au = mk('div', 'gk-fx-aura');
            const sa = svg('', '0 0 320 320', { fill: '#5a0d09' });
            for (const p of auraPaths('a')) sa.append(path(p.d, `rotate(${p.rot} 160 160)`));
            const sb = svg('gk-fx-fl2', '0 0 320 320', { fill: '#c8381f' });
            for (const p of auraPaths('b')) sb.append(path(p.d, `rotate(${p.rot} 160 160)`));
            au.append(sa, sb);
            aura.append(au);
            const txt = mk('div', 'gk-fx-doomtxt');
            const big = mk('b');
            big.textContent = '해골';
            const line = mk('span');
            line.textContent = doomLine(nameOf(v, e.p), nameOf(v, e.id));
            txt.append(big, line);
            el.style.setProperty('--gk-fx-s', String(s));
            el.append(dark, txt);
            el.classList.remove('gk-fx-shake');
            void el.offsetWidth;
            el.classList.add('gk-fx-shake');
            setEdge(false);
            keep([dark, red, demon, aura, txt, card], [unhide]);
          }, at('doom'));
        }
      }
      return () => {
        if (disc === 'S') return;     // 패배 연출은 남긴다
        card.remove();
        unhide();
        dim(0);
        afterLand();
      };
    }, flipDuration(disc, tz));
  }

  // ── 판정
  function reveal(e, info = {}) {
    if (!e || disposed) return Promise.resolve();
    if (seen.has(e) || revealed) return Promise.resolve();
    seen.add(e);
    revealed = true;
    const v = info.view || view;
    return run(() => {
      setEdge(false);
      if (!e.ok) return null;       // 실패: flip 이 띄운 패배 연출이 그대로 남아 있다
      clearLinger(true);
      const s = unitS();
      el.style.setProperty('--gk-fx-s', String(s));
      const need = Number(info.need ?? (v && v.bid && v.bid.n) ?? (v && v.progress && v.progress.need) ?? 0) || 0;
      const who = e.challenger;
      const row = measure(info.row || anchor('row')) || measure(anchor('center'));
      const nodes = [];
      const undo = [];
      if (row) {
        const b = burst(row.x, row.y, s, WIN_BURST);
        nodes.push(b);
      }
      const txt = mk('div', 'gk-fx-wtxt');
      const big = mk('b');
      big.textContent = '성공';
      const line = mk('span');
      line.textContent = need > 0 ? winLine(nameOf(v, who), need) : `${nameOf(v, who)} 님 도전 성공 · 1점`;
      txt.append(big, line);
      el.append(txt);
      nodes.push(txt);
      audio.win();

      // 도전자 개인판: 0점이면 1점 면으로 넘어가고, 이미 1점 면이면 금빛 테두리만
      const matEl = info.mat || anchor('mat', who);
      const M = measure(matEl);
      const seat = seatOf(v, who);
      if (M && M.w > 8 && M.h > 8) {
        const bd = mk('div', 'gk-fx-bd');
        bd.style.width = px(M.w);
        bd.style.height = px(M.h);
        bd.style.transform = `translate(${px(M.x - M.w / 2)},${px(M.y - M.h / 2)}) rotate(${Math.round(M.rot * 10) / 10}deg)`;
        const points = Number(info.points ?? (seat && seat.points) ?? 0) || 0;
        if (seat && seat.color != null && points === 0) {
          const inn = mk('div', 'gk-fx-bd-in');
          inn.append(img('gk-fx-bf', matUrl(seat.color, false)), img('gk-fx-bf gk-fx-back', matUrl(seat.color, true)));
          bd.append(inn);
          el.append(bd);
          // 덧그린 판이 도는 동안 아래 판(그림 한 장일 때만)을 숨긴다
          if (matEl && matEl.tagName === 'IMG') {
            matEl.style.visibility = 'hidden';
            undo.push(() => { matEl.style.visibility = ''; });
          }
          later(() => inn.classList.add('gk-fx-on'), 40);
        } else {
          bd.append(mk('div', 'gk-fx-matglow'));
          el.append(bd);
        }
        nodes.push(bd);
      }
      keep(nodes, undo);
      return null;
    }, REVEAL_HOLD_MS);
  }

  // ── 남이 원판을 놓음
  function place(e) {
    if (!e || disposed || seen.has(e)) return Promise.resolve();
    seen.add(e);
    audio.play('placeSoft');
    const A = measure(anchor('stack', e.id)) || measure(anchor('mat', e.id));
    if (A) {
      let DS = Math.min(A.w || 0, A.h || 0);
      if (!(DS > 8)) DS = 80 * unitS();
      const s = spot(A.x, A.y, Math.min(DS / 80, 2), 19);
      s.append(mk('i', 'gk-fx-shade'), mk('i', 'gk-fx-puff'), mk('i', 'gk-fx-dust'));
      drop(s, PLACE_MS + 50);
    }
    return new Promise((resolve) => {
      const done = () => { pending.delete(done); resolve(); };
      pending.add(done);
      later(done, PLACE_MS);
    });
  }

  function update(next) {
    view = next || null;
    if (!showing(view)) {
      setEdge(false);
      revealed = false;
      if (linger && active === 0) clearLinger(false);
    } else if (active === 0 && view.step === 'flip' && view.progress) {
      const held = (view.hold && view.hold.row) || 0;
      setEdge(view.progress.need - (view.progress.flipped - held) === 1);
    }
  }

  // 판정 소식이 뒤집기 연출보다 먼저 와도 앞 연출이 끝난 뒤에 돈다
  function event(e) {
    if (!e || e.k !== 'gkReveal' || disposed) return;
    if (active > 0) later(() => event(e), 60);
    else reveal(e);
  }

  function sound(name) {
    audio.play(name);
  }

  function dispose() {
    if (disposed) return;
    clearLinger(true);
    disposed = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const fin of [...pending]) fin();
    pending.clear();
    audio.dispose();
    el.remove();
  }

  return { el, flip, place, reveal, busy: () => active > 0, sound, update, event, dispose };
}
