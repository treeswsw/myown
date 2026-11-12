// 정체 공개 글 연출. 약속: docs/team/CONTRACTS.md 0절·1-2. 박자는 design/mockup-table.html 의 RV 값 그대로.
// 맨 위에서는 document·window 를 만지지 않는다(순수 함수를 node 에서 시험한다).

const RV = { lead: 1000, ch: 210, chBig: 270, gap: 700, gapVerdict: 850, hold: 1200, dark: 450, settle: 500 }; // ms
const TOTALS = { liar: 6, citizen: 11, fail: 5 }; // 초. 서버가 재는 unmask 시간(PLAN 1-7)

/** 어떤 경우인가: 지목 실패('fail') / 라이어 처형('liar') / 시민 처형('citizen'). */
export function unmaskKind(unmask) {
  if (!unmask || unmask.id == null) return 'fail';
  return unmask.wasLiar ? 'liar' : 'citizen';
}

/**
 * 시간표(초). steps: 글자 하나가 찍히는 순간 { at, stage, line(1|2), text(한 글자), big, scene(0|1), part('red'|'name'|'') }.
 * marks: clearAt(첫 두 줄을 치우는 때, 없으면 null), liarAt(라이어 장면이 켜지는 때), endAt(끝).
 */
export function unmaskPlan(unmask, name) {
  const kind = unmaskKind(unmask);
  const total = TOTALS[kind];
  const steps = [];
  const type = (t, parts, line, big, stage, scene) => {
    for (const [text, part] of parts) {
      for (const ch of text) {
        const blank = !ch.trim();
        steps.push({ at: t, stage, line, text: ch, big, scene, part: part || '' });
        t += blank ? RV.ch * 0.6 : big ? RV.chBig : RV.ch;
      }
    }
    return t;
  };
  let t = 0, clearAt = null, liarAt;
  if (kind === 'fail') {
    liarAt = 0;
    t = RV.settle;
  } else {
    t = RV.lead;
    t = type(t, [['그는 라이어가']], 1, false, 'line1', 0);
    t += RV.gapVerdict;
    t = type(t, [[kind === 'liar' ? '맞습니다' : '아닙니다']], 2, true, 'line2', 0);
    t += RV.hold;
    if (kind === 'liar') {
      liarAt = t;
    } else {
      clearAt = t;
      liarAt = t + RV.dark;
      t = liarAt + RV.settle;
    }
  }
  if (kind !== 'liar') {
    t = type(t, [['라이어는', 'red']], 1, false, 'liar', 1);
    t += RV.gap;
    t = type(t, [[String(name == null ? '' : name), 'name'], [' 입니다', 'red']], 2, true, 'liar', 1);
  }
  const textEnd = t;
  // 이름이 아주 길어 시간이 모자라면 박자를 같은 비율로 줄인다
  const room = total * 1000 - 200;
  const k = textEnd > room ? room / textEnd : 1;
  const s = (ms) => Math.round(ms * k) / 1000;
  for (const st of steps) st.at = s(st.at);
  return {
    total, kind, steps,
    marks: { clearAt: clearAt == null ? null : s(clearAt), liarAt: s(liarAt), endAt: total },
  };
}

export function createUnmask(ctx, opts = {}) {
  const doc = document;
  const onStage = opts.onStage || (() => {});
  const onTick = opts.onTick || (() => {});
  const h = (tag, cls, lg) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (lg) e.dataset.lg = lg;
    return e;
  };

  const el = h('section', 'lg-um-root', 'unmask');
  el.hidden = true;
  el.dataset.stage = 'dark';
  el.dataset.pos = 'mid';
  el.dataset.beam = 'off';
  el.setAttribute('aria-label', '정체 공개');
  if (ctx.nogl) el.classList.add('lg-um-nogl');
  const beam = h('div', 'lg-um-beam'); beam.setAttribute('aria-hidden', 'true');
  const text = h('div', 'lg-um-text'); text.setAttribute('aria-hidden', 'true');
  const sr = h('p', 'lg-um-sr'); sr.setAttribute('role', 'status');
  el.append(beam, text, sr);
  ctx.root.appendChild(el);

  let state = null, active = false, key = null, plan = null, color = '#efe6d8';
  let scene = -1, spans = [], fired = null, stageFired = null;

  const stop = () => {
    active = false; key = null; plan = null; scene = -1; spans = [];
    text.replaceChildren(); sr.textContent = '';
    el.hidden = true; el.classList.remove('lg-um-clearing');
    el.dataset.stage = 'dark'; el.dataset.pos = 'mid'; el.dataset.beam = 'off';
  };

  // 한 장면의 글자 자리를 미리 잡아 둔다(가운데 정렬이 흔들리지 않게). 아직 안 찍힌 글자는 visibility:hidden 이라 읽히지도 않는다.
  const build = (sc) => {
    scene = sc; spans = [];
    text.replaceChildren();
    el.classList.remove('lg-um-clearing');
    const lines = {};
    const make = (parent, n, lg) => {
      const p = h('p', 'lg-um-line' + (n === 2 ? ' lg-um-big' : ''), lg);
      parent.appendChild(p); lines[n] = p; return p;
    };
    if (sc === 0) {
      make(text, 1, 'um-l1'); make(text, 2, 'um-l2');
    } else {
      const box = h('div', 'lg-um-liar', 'um-liar');
      text.appendChild(box);
      make(box, 1); make(box, 2);
    }
    const parts = {};
    plan.steps.forEach((st, i) => {
      if (st.scene !== sc) return;
      const pk = st.line + ':' + st.part;
      let part = parts[pk];
      if (!part) {
        part = h('span', st.part ? 'lg-um-' + st.part : null);
        if (st.part === 'name') part.style.setProperty('--c', color);
        parts[pk] = part; lines[st.line].appendChild(part);
      }
      const c = h('span', 'lg-um-ch'); c.textContent = st.text;
      part.appendChild(c);
      spans[i] = c;
    });
  };

  const elapsedNow = () => {
    if (!plan) return 0;
    const end = state && state.phaseEndsAt;
    if (typeof end !== 'number') return 0;
    const remain = Math.max(0, (end - ctx.now()) / 1000);
    return Math.min(plan.total, Math.max(0, plan.total - remain));
  };

  const render = (e) => {
    const m = plan.marks;
    const sc = plan.kind === 'liar' ? 0 : e >= m.liarAt ? 1 : 0;
    if (sc !== scene) build(sc);
    const clearing = m.clearAt != null && e >= m.clearAt && e < m.liarAt;
    el.classList.toggle('lg-um-clearing', clearing);
    // 글자
    plan.steps.forEach((st, i) => {
      const on = st.at <= e;
      if (st.scene === sc && spans[i]) spans[i].classList.toggle('lg-um-on', on);
      if (on && !fired[i]) {
        fired[i] = true;
        if (st.text.trim()) onTick(st.big);
      }
    });
    // 단계
    const red = e >= m.liarAt;
    el.dataset.beam = red ? 'red' : 'off';
    el.dataset.pos = red ? 'top' : 'mid';
    if (plan.kind === 'liar') {
      const l2 = text.querySelector('[data-lg="um-l2"]');
      if (l2) l2.classList.toggle('lg-um-red', red);
    }
    let stage = 'dark';
    if (e >= m.endAt) stage = 'end';
    else if (red) stage = 'liar';
    else for (const st of plan.steps) if (st.scene === 0 && st.at <= e) stage = st.stage;
    el.dataset.stage = stage;
    const info = { id: state && state.unmask ? state.unmask.liarId : null };
    for (const [name, at] of [['dark', 0], ['liar', m.liarAt], ['end', m.endAt]]) {
      if (e >= at && !stageFired[name]) { stageFired[name] = true; onStage(name, info); }
    }
    // 읽기 프로그램용: 끝난 글만 한 번에
    if (stage === 'end' && !sr.textContent) {
      sr.textContent = [...text.querySelectorAll('.lg-um-line')].map((p) => p.textContent).join(' ');
    }
  };

  const start = () => {
    const u = state.unmask;
    const liarP = state.players.find((p) => p.id === (u && u.liarId));
    color = (liarP && liarP.color) || '#efe6d8';
    plan = unmaskPlan(u, liarP ? liarP.name : '');
    fired = {}; stageFired = {}; scene = -1;
    // 중간에 들어왔으면 이미 지난 글자는 소리 없이 찍힌 채로 시작한다
    const e0 = elapsedNow();
    plan.steps.forEach((st, i) => { if (st.at <= e0) fired[i] = true; });
    active = true;
    el.hidden = false;
  };

  return {
    el,
    get busy() { return active; },
    update(s) {
      state = s;
      if (!s || s.phase !== 'unmask' || !s.unmask) { if (active || !el.hidden) stop(); return; }
      const k = s.round + ':' + s.accuseNo;
      if (!active || k !== key) {
        if (active) stop();
        key = k;
        start();
      }
      render(elapsedNow());
    },
    event() {},
    frame() { if (active && state) render(elapsedNow()); },
    dispose() { stop(); el.remove(); },
  };
}
