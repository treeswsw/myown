// 정답 입력 칸(guess, 라이어만)과 공통 결과 화면의 라이어 칸(라이어·제시어·라이어의 답·우승·투표 내역).
// 순위·점수·코인·버튼은 공통 결과 화면(client/src/room/result.js)이 그린다. 제목은 winnerText 를 index.js 가 resultTitle 로 준다.
// 맨 위에서는 document·window 를 만지지 않는다(순수 함수를 node 에서 시험한다).

/** 이긴 쪽 글 {title, sub}. */
export function winnerText(result) {
  if (!result) return { title: '', sub: '' };
  const title = result.winner === 'liar' ? '라이어 승리' : result.winner === 'citizens' ? '시민 승리' : '무효';
  let sub = '';
  switch (result.reason) {
    case 'executedLiar':
      sub = result.guessed ? '라이어가 잡혔지만 정답을 맞혔어요'
        : result.guessed === false ? '라이어를 잡았고 정답은 못 맞혔어요' : '라이어를 잡았어요';
      break;
    case 'executedCitizen':
      sub = result.guessed ? '시민이 처형되었고 라이어가 정답까지 맞혔어요' : '시민이 처형되어 라이어가 들키지 않았어요';
      break;
    case 'tie': sub = '표가 갈려 라이어를 지목하지 못했어요'; break;
    case 'noVotes': sub = '아무도 투표하지 않아 지목하지 못했어요'; break;
    case 'liarLeft': sub = '라이어가 빠져서 시민이 이겼어요'; break;
    case 'tooFew': sub = '3명보다 적어져서 무효예요'; break;
    case 'hostEnded': sub = '방장이 이 판을 끝냈어요'; break;
    default: sub = '';
  }
  return { title, sub };
}

/** id 의 이름: players → (라이어면) result.liarName → '?'. */
export function nameFor(state, id) {
  const p = state && Array.isArray(state.players) ? state.players.find((x) => x.id === id) : null;
  if (p) return p.name;
  const r = state && state.result;
  if (r && id != null && id === r.liarId && r.liarName) return r.liarName;
  return '?';
}

export function createResult(ctx) {
  const doc = document;
  const h = (tag, cls, text, lg) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (lg) e.dataset.lg = lg;
    return e;
  };

  // ---- guess: 라이어의 입력 칸만 (안내 글·초·답 표시는 엔딩 모듈이 맡는다) ----
  const form = h('form', 'lg-rs-form'); form.hidden = true;
  const input = h('input', 'lg-rs-input', null, 'guess-input');
  input.type = 'text'; input.maxLength = (ctx.limits && ctx.limits.guess) || 30;
  input.placeholder = '제시어를 맞혀 보세요 (한 번만)';
  input.autocomplete = 'off'; input.setAttribute('aria-label', '정답');
  const sendBtn = h('button', 'lg-rs-btn lg-rs-send', '정답 보내기', 'guess-send');
  sendBtn.type = 'button';
  form.append(input, sendBtn);
  ctx.action.appendChild(form);

  // ---- 공통 결과 화면의 게임 칸 ----
  const part = h('div', 'lg-rs-part', null, 'result');
  const champ = h('div', 'lg-rs-champ');
  const info = h('div', 'lg-rs-info');
  const logBox = h('div', 'lg-rs-log');
  part.append(champ, info, logBox);

  let state = null;
  let sentKey = null; // 이 판에서 정답을 이미 보냈다
  let shownKey = null;

  const nameOf = (id) => nameFor(state, id);
  const colorOf = (id) => {
    const p = state && state.players.find((x) => x.id === id);
    return p ? p.color : null;
  };
  const nameSpan = (id) => {
    const s = h('span', 'lg-rs-name', nameOf(id));
    const c = colorOf(id); if (c) s.style.color = c;
    return s;
  };
  const gKey = () => `${state.round}:${state.accuseNo}`;
  function renderGuess() {
    const liarId = state.unmask ? state.unmask.liarId : null;
    const g = state.guess;
    const answered = !!(g && (g.text != null || g.correct != null));
    const isLiar = liarId != null && liarId === state.you;
    form.hidden = !(isLiar && !answered);
    if (shownKey !== gKey()) { shownKey = gKey(); input.value = ''; }
    const locked = sentKey === gKey();
    input.disabled = locked; sendBtn.disabled = locked;
  }

  function renderPart(s) {
    state = s;
    const r = s.result;
    if (!r) return null;

    champ.textContent = '';
    const ch = Array.isArray(r.champions) && r.champions.length ? r.champions : null;
    champ.hidden = !ch;
    if (ch) {
      champ.append(h('span', 'lg-rs-champlabel', '우승 '));
      ch.forEach((id, i) => { if (i) champ.append(', '); champ.append(nameSpan(id)); });
    }

    info.textContent = '';
    const line = (label, node) => {
      const row = h('div', 'lg-rs-line');
      row.append(h('span', 'lg-rs-label', label), node);
      info.append(row);
    };
    line('라이어', r.liarId != null ? nameSpan(r.liarId) : h('span', 'lg-rs-val', '없음'));
    line('시민 제시어', h('b', 'lg-rs-val', r.citizenWord != null ? r.citizenWord : '-'));
    line('라이어 제시어', r.liarWord != null ? h('b', 'lg-rs-val', r.liarWord)
      : h('span', 'lg-rs-val lg-rs-dim', '없음 (라이어 알림 방식)'));
    const g = state.guess;
    if (r.guessed !== null && r.guessed !== undefined || (g && g.text != null)) {
      const v = h('span', 'lg-rs-val');
      v.append(h('b', null, g && g.text != null && g.text !== '' ? g.text : '(답 없음)'),
        h('span', (r.guessed || (g && g.correct)) ? 'lg-rs-ok' : 'lg-rs-no', (r.guessed || (g && g.correct)) ? ' 맞음' : ' 틀림'));
      line('라이어의 답', v);
    }

    logBox.textContent = '';
    const log = Array.isArray(r.voteLog) ? r.voteLog : [];
    logBox.hidden = !log.length;
    if (log.length) {
      const det = doc.createElement('details');
      det.className = 'lg-rs-details';
      if (log.length === 1) det.open = true;
      const sum = h('summary', 'lg-rs-sum', `투표 내역 (${log.length}번 지목)`);
      det.append(sum);
      for (const e of log) {
        const box = h('div', 'lg-rs-entry');
        const head = h('div', 'lg-rs-ehead');
        head.append(h('b', null, `${e.no}번째 지목 `));
        if (e.accused != null) head.append(nameSpan(e.accused)); else head.append(h('span', 'lg-rs-dim', '투표 무산(연장)'));
        if (e.executed === true) head.append(h('span', 'lg-rs-no', ' 처형'));
        else if (e.executed === false) head.append(h('span', 'lg-rs-ok', ' 살림'));
        box.append(head);
        const fmtVotes = (m) => {
          const vs = Object.entries(m || {});
          return vs.length ? vs.map(([a, b]) => `${nameOf(a)} → ${nameOf(b)}`).join(', ') : '투표 없음';
        };
        if (e.firstVotes) {
          box.append(h('div', 'lg-rs-evotes', '첫 투표: ' + fmtVotes(e.firstVotes)));
          box.append(h('div', 'lg-rs-evotes', '재투표: ' + fmtVotes(e.votes)));
        } else {
          box.append(h('div', 'lg-rs-evotes', fmtVotes(e.votes)));
        }
        const ps = Object.entries(e.picks || {});
        if (ps.length) {
          const yes = ps.filter(([, v]) => v === 'yes').length;
          box.append(h('div', 'lg-rs-epicks',
            `맞다 ${yes} · 아니다 ${ps.length - yes}: ` + ps.map(([a, v]) => `${nameOf(a)} ${v === 'yes' ? '맞다' : '아니다'}`).join(', ')));
        }
        det.append(box);
      }
      logBox.append(det);
    }
    return part;
  }

  function update(s) {
    state = s;
    if (s && s.phase === 'guess') renderGuess();
    else form.hidden = true;
  }

  function submit() {
    if (!state || state.phase !== 'guess' || sentKey === gKey()) return;
    const text = input.value.trim().slice(0, (ctx.limits && ctx.limits.guess) || 30);
    if (!text) return;
    sentKey = gKey();
    input.disabled = true; sendBtn.disabled = true;
    ctx.send({ t: 'lg', a: 'guess', text });
  }
  sendBtn.addEventListener('click', submit);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  return {
    update,
    part: renderPart,
    frame() {},
    dispose() { form.remove(); },
  };
}
