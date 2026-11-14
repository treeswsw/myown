// 마지막 단계(답 입력 + 정답 공개) 글 연출. 약속: docs/liar/ENDING.md 0절·4-1. 접두사 .lg-ed-
// 맨 위에서는 document·window 를 만지지 않는다(순수 함수를 node 에서 시험한다).

// 박자(초). 고치기 쉽게 한 곳에 둔다.
export const ED = {
  title: '라이어는 제시어를 제출하세요',
  wait: '라이어가 답을 쓰고 있습니다',
  wordLabel: '제시어 : ',
  mismatchLabel: '미스매치 : ',
  timeout: '시간 초과',
  okText: '라이어가 답을 맞혔습니다',
  noText: '라이어가 답을 맞히지 못했습니다',
  titleStart: 0.5, titleCh: 0.13, // 제목 글자 간격
  answerTotal: 10,   // 서버 answer 단계 길이(두 방식 모두)
  answerAt: 1.0,     // 라이어 답이 써지기 시작
  answerCh: 0.22, answerMax: 2.0, // 글자 간격과 답 전체 최대 길이
  verdictAt: 3.5,    // 판정 글이 써지기 시작(답이 더 늦게 끝나면 그 뒤 0.3초)
  verdictCh: 0.1,
  urgent: 5,         // 마지막 몇 초를 빨갛게
};

const round = (x) => Math.round(x * 1000) / 1000;

export function verdictText(correct) { return correct ? ED.okText : ED.noText; }

/** 위쪽 줄 문구. 라이어 제시어가 없으면(라이어 알림 방식) mismatch 는 null. */
export function wordLines(words) {
  if (!words) return { word: null, mismatch: null };
  return {
    word: words.citizen == null ? null : ED.wordLabel + words.citizen,
    mismatch: words.liar == null ? null : ED.mismatchLabel + words.liar,
  };
}

/** 라이어 답 칸에 들어갈 글(답이 없으면 "시간 초과"). */
export function answerText(guess) {
  const t = guess && typeof guess.text === 'string' ? guess.text.trim() : '';
  return t || ED.timeout;
}

export function secsText(remainMs) {
  return Math.max(0, Math.ceil(remainMs / 1000)) + '초';
}

/**
 * 시간표(초). steps: 글자 하나가 찍히는 순간 { at, part('title'|'answer'|'verdict'), text(한 글자), big }.
 * guess: total = 방 설정 시간(없으면 null), marks { secsAt(큰 초가 나오는 때) }.
 * answer: total = 10, marks { wordAt:0, answerAt, answerEnd, verdictAt, verdictEnd, endAt }.
 * 그 밖 단계는 null.
 */
export function endingPlan(state, liarName) {
  if (!state || (state.phase !== 'guess' && state.phase !== 'answer')) return null;
  const steps = [];
  const type = (t0, str, ch, part, big) => {
    let t = t0;
    for (const c of str) {
      steps.push({ at: round(t), part, text: c, big });
      t += c.trim() ? ch : ch * 0.6;
    }
    return t;
  };
  if (state.phase === 'guess') {
    const end = type(ED.titleStart, ED.title, ED.titleCh, 'title', false);
    const times = state.settings && state.settings.times;
    const total = times && typeof times.guess === 'number' ? times.guess : null;
    return { phase: 'guess', total, steps, marks: { secsAt: round(end + 0.1) } };
  }
  const text = answerText(state.guess);
  const n = [...text].length;
  const ch = Math.min(ED.answerCh, ED.answerMax / Math.max(1, n));
  const answerEnd = type(ED.answerAt, text, ch, 'answer', true);
  const verdictAt = Math.max(ED.verdictAt, answerEnd + 0.3);
  const vtext = verdictText(!!(state.guess && state.guess.correct));
  const verdictEnd = type(verdictAt, vtext, ED.verdictCh, 'verdict', false);
  return {
    phase: 'answer', total: ED.answerTotal, steps, name: liarName == null ? '' : String(liarName),
    marks: { wordAt: 0, answerAt: ED.answerAt, answerEnd: round(answerEnd), verdictAt: round(verdictAt), verdictEnd: round(verdictEnd), endAt: ED.answerTotal },
  };
}

/** 지금 단계 이름. guess: 'ask' / answer: 'word' → 'answer' → 'verdict' → 'hold' → 'end'. */
export function stageAt(plan, e) {
  if (!plan) return null;
  if (plan.phase === 'guess') return 'ask';
  const m = plan.marks;
  if (e >= m.endAt) return 'end';
  if (e >= m.verdictEnd) return 'hold';
  if (e >= m.verdictAt) return 'verdict';
  if (e >= m.answerAt) return 'answer';
  return 'word';
}

export function createEnding(ctx, opts = {}) {
  const doc = document;
  const onStage = opts.onStage || (() => {});
  const onTick = opts.onTick || (() => {});
  const h = (tag, cls, lg) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (lg) e.dataset.lg = lg;
    return e;
  };

  const el = h('section', 'lg-ed-root', 'ending');
  el.hidden = true;
  el.dataset.stage = 'ask';
  el.setAttribute('aria-label', '정답 공개');
  if (ctx.nogl) el.classList.add('lg-ed-nogl');
  const beam = h('div', 'lg-ed-beam'); beam.setAttribute('aria-hidden', 'true');
  const col = h('div', 'lg-ed-col');
  const title = h('p', 'lg-ed-title', 'ed-title');
  const secs = h('p', 'lg-ed-secs', 'ed-secs');
  const wait = h('p', 'lg-ed-wait', 'ed-wait');
  const words = h('div', 'lg-ed-words');
  const wordEl = h('p', 'lg-ed-word', 'ed-word');
  const misEl = h('p', 'lg-ed-mismatch', 'ed-mismatch');
  words.append(wordEl, misEl);
  const answerEl = h('p', 'lg-ed-answer', 'ed-answer');
  const verdictEl = h('p', 'lg-ed-verdict', 'ed-verdict');
  col.append(title, secs, wait, words, answerEl, verdictEl);
  const mid = h('div', 'lg-ed-mid');
  const card = h('div', 'lg-ed-card');
  const face = h('div', 'lg-ed-face');
  const cname = h('div', 'lg-ed-name');
  card.append(face, cname);
  mid.append(card);
  const sr = h('p', 'lg-ed-sr'); sr.setAttribute('role', 'status');
  el.append(beam, col, mid, sr);
  ctx.root.appendChild(el);

  let state = null, active = false, key = null, plan = null;
  let spans = {}, fired = null, stageFired = null, seenAt = 0, lastSec = null, liarId = null;

  const stop = () => {
    active = false; key = null; plan = null; spans = {};
    for (const p of [title, answerEl, verdictEl, wordEl, misEl, secs, wait, cname, sr]) p.textContent = '';
    face.replaceChildren();
    el.hidden = true;
    el.dataset.stage = 'ask'; el.dataset.phase = '';
    delete verdictEl.dataset.ok;
  };

  // 글자 자리를 미리 잡는다(가운데 정렬이 흔들리지 않게). 안 찍힌 글자는 visibility:hidden 이라 읽히지도 않는다.
  const build = () => {
    spans = { title: [], answer: [], verdict: [] };
    const parents = { title, answer: answerEl, verdict: verdictEl };
    plan.steps.forEach((st, i) => {
      const c = h('span', 'lg-ed-ch'); c.textContent = st.text;
      parents[st.part].appendChild(c);
      spans[st.part][i] = c;
    });
  };

  const elapsedNow = () => {
    if (!plan || !state) return 0;
    const end = state.phaseEndsAt;
    if (typeof end !== 'number' || plan.total == null) return (ctx.now() - seenAt) / 1000;
    const remain = Math.max(0, (end - ctx.now()) / 1000);
    return Math.min(plan.total, Math.max(0, plan.total - remain));
  };

  const fire = (name, info) => {
    if (stageFired[name]) return;
    stageFired[name] = true;
    onStage(name, info);
  };

  const render = (e) => {
    const m = plan.marks;
    plan.steps.forEach((st, i) => {
      const on = st.at <= e;
      const sp = spans[st.part][i];
      if (sp) sp.classList.toggle('lg-ed-on', on);
      if (on && !fired[i]) {
        fired[i] = true;
        if (st.text.trim()) onTick(st.big);
      }
    });
    const info = { id: liarId };
    const stage = stageAt(plan, e);
    el.dataset.stage = stage;
    if (plan.phase === 'guess') {
      fire('ask', info);
      const showSecs = e >= m.secsAt;
      secs.hidden = !showSecs;
      wait.hidden = !showSecs || state.you === liarId;
      const remainMs = typeof state.phaseEndsAt === 'number' ? state.phaseEndsAt - ctx.now() : 0;
      const sec = Math.max(0, Math.ceil(remainMs / 1000));
      secs.textContent = secsText(remainMs);
      secs.dataset.urgent = sec <= ED.urgent ? '1' : '0';
      if (showSecs && lastSec !== sec) {
        if (lastSec != null && sec <= ED.urgent && sec > 0) onTick(true);
        lastSec = sec;
      }
      return;
    }
    // answer
    fire('hush', info);
    if (e >= m.answerAt) fire('answer', info);
    if (e >= m.verdictEnd) fire('verdict', { id: liarId, correct: !!(state.guess && state.guess.correct) });
    if (e >= m.endAt) fire('end', info);
    const empty = !(state.guess && typeof state.guess.text === 'string' && state.guess.text.trim());
    answerEl.dataset.empty = empty ? '1' : '0';
    const full = answerText(state.guess);
    const len = [...full].length;
    answerEl.dataset.len = len <= 8 ? 's' : len <= 14 ? 'm' : 'l';
    verdictEl.dataset.ok = state.guess && state.guess.correct ? '1' : '0';
    if ((stage === 'hold' || stage === 'end') && !sr.textContent) {
      sr.textContent = [wordEl.textContent, misEl.textContent, full, verdictEl.textContent].filter(Boolean).join(' ');
    }
  };

  const start = () => {
    liarId = state.unmask.liarId;
    const liarP = (state.players || []).find((p) => p.id === liarId);
    const color = (liarP && liarP.color) || '#efe6d8';
    seenAt = ctx.now();
    lastSec = null;
    plan = endingPlan(state, liarP ? liarP.name : '');
    fired = {}; stageFired = {};
    build();
    el.dataset.phase = plan.phase;
    el.style.setProperty('--c', color);
    wait.textContent = ED.wait;
    if (ctx.nameTag && liarP) { const nt = ctx.nameTag(liarP); nt.classList.add('lg-nt-mid'); cname.replaceChildren(nt); } // 이름 + 칭호(공용 프로필 부품)
    else cname.textContent = liarP ? liarP.name || '' : '';
    face.replaceChildren();
    if (ctx.avatar && liarP) {
      face.appendChild(ctx.avatar(liarP, 84)); // 공용 프로필 부품
    } else {
      face.textContent = liarP && liarP.name ? [...liarP.name][0] : '?';
    }
    secs.hidden = true; wait.hidden = true;
    if (plan.phase === 'answer') {
      const w = wordLines(state.words);
      wordEl.textContent = w.word || '';
      misEl.textContent = w.mismatch || '';
      wordEl.hidden = !w.word; misEl.hidden = !w.mismatch;
    } else {
      wordEl.textContent = ''; misEl.textContent = '';
    }
    // 중간에 들어왔으면 이미 지난 글자는 소리 없이 찍힌 채로 시작한다
    const e0 = elapsedNow();
    plan.steps.forEach((st, i) => { if (st.at <= e0) fired[i] = true; });
    if (plan.phase === 'guess' && typeof state.phaseEndsAt === 'number') {
      lastSec = Math.max(0, Math.ceil((state.phaseEndsAt - ctx.now()) / 1000));
    }
    active = true;
    el.hidden = false;
  };

  return {
    el,
    get busy() { return active; },
    update(s) {
      state = s;
      const ok = s && (s.phase === 'guess' || s.phase === 'answer') && s.unmask && s.unmask.liarId != null;
      if (!ok) { if (active || !el.hidden) stop(); return; }
      const k = s.phase + ':' + s.round + ':' + s.accuseNo;
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
