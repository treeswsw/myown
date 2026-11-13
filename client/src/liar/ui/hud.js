// 상단 표시: 단계 문구·남은 시간·큰 발언 글·판 끝내기. 약속: docs/team/CONTRACTS.md 1절 hud.
// 맨 위에서는 document·window 를 만지지 않는다(node 시험에서 chatLockFor 를 불러올 수 있게).

const IN_GAME = ['reveal', 'speak', 'discuss', 'revote', 'defense', 'judge', 'judged', 'unmask', 'guess'];
const SAID_PHASES = ['speak', 'defense', 'judge', 'judged'];
const SAID_MS = 4000;

const meOf = (state) => (state.players || []).find((p) => p.id === state.you) || null;
const nameOf = (state, id) => ((state && state.players) || []).find((p) => p.id === id)?.name ?? '';

// GDD 4-4 표. 글(채팅)을 쓸 수 있는가. 순수 함수.
export function chatLockFor(state) {
  const open = { locked: false, hint: '', hot: false };
  if (!state || !state.phase) return open;
  const phase = state.phase;
  if (phase === 'lobby' || phase === 'result') return open;
  const me = meOf(state);
  if (me && me.spectating) return { locked: true, hint: '구경 중에는 다음 판부터 글을 쓸 수 있어요', hot: false };
  switch (phase) {
    case 'reveal':
    case 'discuss':
    case 'revote':
      return open;
    case 'speak':
      return state.speaker === state.you
        ? { locked: false, hint: '첫 발언을 입력하세요', hot: true }
        : { locked: true, hint: '첫 설명 중에는 차례인 사람만 쓸 수 있어요', hot: false };
    case 'defense':
    case 'judge':
    case 'judged':
      return state.accused === state.you
        ? { locked: false, hint: '최후 변론을 입력하세요', hot: true }
        : { locked: true, hint: '변론·찬반 중에는 지목된 사람만 쓸 수 있어요', hot: false };
    case 'unmask':
      return { locked: true, hint: '정체 공개 중에는 글을 쓸 수 없어요', hot: false };
    case 'guess':
      return { locked: true, hint: '정답 맞히기 중에는 글을 쓸 수 없어요', hot: false };
    default:
      return open;
  }
}

// 단계별 제목·안내. 라이어/시민을 구분하지 않는다(state.my 를 보지 않는다).
function textsFor(state) {
  const who = nameOf(state, state.accused);
  switch (state.phase) {
    case 'reveal':
      return { title: '역할 확인', alert: [], plain: true, timed: false };
    case 'speak': {
      if (state.speaker === state.you) {
        return { title: '남은 발언시간', alert: ['당신의 발언시간입니다', '라이어가 눈치채지 못하게 발언하세요'], plain: false, timed: true };
      }
      return { title: '남은 발언시간', alert: ['상대방의 발언을 기다리고 있습니다'], plain: true, timed: true };
    }
    case 'discuss':
      return { title: '투표 결과까지', alert: ['대화하면서 의심되는 사람을 눌러 지목하세요'], plain: false, timed: true };
    case 'revote':
      return { title: '재투표', alert: ['동점인 사람 중에서 다시 지목하세요'], plain: false, timed: true };
    case 'defense':
      return { title: '최후 변론', alert: [`${who} 님의 최후 변론입니다`], plain: false, timed: true };
    case 'judge':
      return { title: '찬반 투표', alert: [`${who} 님이 라이어가 맞습니까?`], plain: false, timed: true };
    case 'judged': {
      const ex = state.judge ? state.judge.executed : null;
      if (ex === true) return { title: '처형', alert: [`${who} 님을 처형합니다`], plain: false, timed: false };
      if (ex === false) return { title: '살림', alert: [`${who} 님을 살립니다`], plain: false, timed: false };
      return { title: '판정', alert: [], plain: true, timed: false };
    }
    case 'unmask':
      return { title: '정체 공개', alert: [], plain: true, timed: false };
    case 'guess':
      return { title: '정답 맞히기', alert: [], plain: true, timed: true };
    case 'result':
      return { title: '결과', alert: [], plain: true, timed: false };
    default:
      return null;
  }
}

export function createHud(ctx) {
  const doc = document;
  const el = doc.createElement('header');
  el.className = 'lg-hud-root';
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;

  const mk = (tag, cls, lg) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (lg) n.dataset.lg = lg;
    return n;
  };
  const kicker = mk('div', 'lg-hud-kicker', 'hud-kicker');
  const title = mk('div', 'lg-hud-title', 'hud-title');
  const num = mk('div', 'lg-hud-num');
  const secsEl = mk('span', '', 'hud-secs');
  const unit = mk('small');
  unit.textContent = '초';
  num.append(secsEl, unit);
  const alertEl = mk('div', 'lg-hud-alert', 'hud-alert');
  const said = mk('div', 'lg-hud-said', 'hud-said');
  const saidWho = mk('div', 'lg-hud-who');
  const saidLine = mk('p', 'lg-hud-line');
  said.append(saidWho, saidLine);
  said.hidden = true;

  const endBox = mk('div', 'lg-hud-endbox');
  const endBtn = mk('button', 'lg-hud-end', 'end');
  endBtn.type = 'button';
  endBtn.textContent = '이 판 끝내기';
  const ask = mk('div', 'lg-hud-ask');
  const askText = mk('span');
  askText.textContent = '정말 끝낼까요?';
  const yes = mk('button', 'lg-hud-yes', 'end-yes');
  yes.type = 'button';
  yes.textContent = '예';
  const no = mk('button', 'lg-hud-no', 'end-no');
  no.type = 'button';
  no.textContent = '아니오';
  ask.append(askText, yes, no);
  ask.hidden = true;
  endBox.append(endBtn, ask);
  endBox.hidden = true;

  el.append(kicker, title, num, alertEl, said, endBox);
  ctx.root.append(el);

  let state = null;
  // 마지막 첫 설명은 서버가 곧바로 discuss 로 넘긴다. speak→discuss 직후 그 사람의 say 는 받아서 4초 보여 주고,
  // 이미 떠 있는 say 도 끄지 않는다(한 번만).
  let tailFrom = null;
  let saidKind = null;
  let secs = -1;
  let saidLeft = 0;
  let confirming = false;
  let timed = false;

  const remaining = () => {
    if (!state || state.phaseEndsAt == null) return 0;
    return Math.max(0, Math.ceil((state.phaseEndsAt - ctx.now()) / 1000));
  };
  const drawSecs = () => {
    const s = timed ? remaining() : -1;
    if (s === secs) return;
    secs = s;
    num.hidden = s < 0;
    if (s >= 0) {
      secsEl.textContent = String(s);
      num.classList.toggle('lg-hud-urgent', s <= 5);
    }
  };
  const hideSaid = () => { said.hidden = true; saidLeft = 0; saidKind = null; };
  const setConfirm = (on) => {
    confirming = on;
    ask.hidden = !on;
    endBtn.hidden = on;
  };

  endBtn.addEventListener('click', () => setConfirm(true));
  no.addEventListener('click', () => setConfirm(false));
  yes.addEventListener('click', () => {
    setConfirm(false);
    ctx.send({ t: 'lg', a: 'end' });
  });

  function update(next) {
    const prev = state;
    state = next || null;
    tailFrom = prev && state && prev.phase === 'speak' && state.phase === 'discuss' ? prev.speaker ?? null
      : state && state.phase === 'discuss' ? tailFrom : null;
    if (!state || !state.phase || state.phase === 'lobby') {
      el.hidden = true;
      hideSaid();
      endBox.hidden = true;
      setConfirm(false);
      timed = false;
      secs = -1;
      return;
    }
    const tx = textsFor(state);
    if (!tx) { el.hidden = true; return; }
    el.hidden = false;

    const parts = [`Round ${state.round}`];
    if (state.topic) parts.push(state.topic);
    if (state.accuseNo >= 2) parts.push(`${state.accuseNo}번째 지목`);
    kicker.textContent = parts.join(' · ');
    title.textContent = tx.title;

    const me = meOf(state);
    let lines = tx.alert;
    let plain = tx.plain;
    if (me && me.spectating && state.phase !== 'result') {
      lines = ['구경 중 — 채팅은 다음 판부터'];
      plain = true;
    }
    alertEl.classList.toggle('lg-hud-plain', plain);
    alertEl.replaceChildren(...lines.map((t) => {
      const s = doc.createElement('span');
      s.textContent = t;
      return s;
    }));
    alertEl.hidden = lines.length === 0;

    timed = tx.timed && state.phaseEndsAt != null;
    secs = -2; // 강제로 다시 그림
    drawSecs();

    if (!SAID_PHASES.includes(state.phase) && !(state.phase === 'discuss' && saidKind === 'say')) hideSaid();

    const canEnd = state.hostId === state.you && IN_GAME.includes(state.phase);
    endBox.hidden = !canEnd;
    if (!canEnd) setConfirm(false);
  }

  function event(e) {
    if (!e || e.k !== 'chat' || !state) return;
    if (e.kind !== 'say' && e.kind !== 'plea') return;
    const tail = state.phase === 'discuss' && e.kind === 'say' && tailFrom !== null && e.id === tailFrom;
    if (!SAID_PHASES.includes(state.phase) && !tail) return;
    if (tail) tailFrom = null;
    saidKind = e.kind;
    const p = (state.players || []).find((q) => q.id === e.id);
    saidWho.textContent = (p && p.name) || e.name || '';
    saidWho.style.color = (p && p.color) || '';
    saidLine.textContent = e.text == null ? '' : String(e.text);
    said.hidden = true;
    void said.offsetWidth; // 같은 사람이 다시 말해도 등장 효과가 다시 나오게
    said.hidden = false;
    saidLeft = SAID_MS;
  }

  function frame(dt) {
    drawSecs();
    if (!said.hidden) {
      saidLeft -= (dt || 0) * 1000;
      if (saidLeft <= 0) hideSaid();
    }
  }

  function dispose() {
    el.remove();
  }

  return { el, update, event, frame, dispose };
}
