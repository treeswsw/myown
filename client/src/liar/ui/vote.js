// 이름표·지목·찬반 투표 (CONTRACTS 1절 vote). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다.

const PICK_PHASES = ['discuss', 'revote'];
const TAG_PHASES = ['speak', 'discuss', 'revote', 'defense', 'judge', 'judged'];
const JUDGE_LABEL = { no: '아니다', yes: '맞다', abs: '기권' };

const seated = (p) => p && typeof p.seat === 'number' && !p.spectating;

// "투표 N / M"의 M: 앉아 있고(seat !== null) 끊기지 않은 사람 수 (서버의 "전원"과 같게)
export function voterCount(players) {
  return (players || []).filter((p) => seated(p) && p.connected !== false).length;
}

// 지금 targetId 를 지목(또는 지목 취소)할 수 있는가. 순수 함수.
export function canPick(state, targetId) {
  if (!state || !state.you || !PICK_PHASES.includes(state.phase)) return false;
  const players = state.players || [];
  const me = players.find((p) => p.id === state.you);
  if (!seated(me)) return false;
  if (targetId === state.you) return false;
  const target = players.find((p) => p.id === targetId);
  if (!seated(target)) return false;
  if (state.phase === 'revote' && Array.isArray(state.candidates) && !state.candidates.includes(targetId)) return false;
  return true;
}

// 찬반 집계. picks = { [id]: 'yes'|'no' } 또는 null → { yes, no }
export function tallyOf(picks) {
  const out = { yes: 0, no: 0 };
  if (!picks) return out;
  for (const v of Object.values(picks)) if (v === 'yes' || v === 'no') out[v]++;
  return out;
}

// 기권 수: 앉아 있는 사람 중 지목된 사람을 뺀 수 − 낸 표 수. 순수 함수.
export function absentOf(players, accused, picks) {
  const n = (players || []).filter((p) => seated(p) && p.id !== accused).length;
  const t = tallyOf(picks);
  return Math.max(0, n - t.yes - t.no);
}

// 집계 글. judged 에서 기권이 있으면 " · 기권 K"
export function tallyText(picks, absent, showAbsent) {
  const t = tallyOf(picks);
  return '맞다 ' + t.yes + ' · 아니다 ' + t.no + (showAbsent && absent > 0 ? ' · 기권 ' + absent : '');
}

const el = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};

export function createVote(ctx) {
  const root = el('div', 'lg-vt-root');
  root.hidden = true;
  const layer = el('div', 'lg-vt-layer');       // 좌표를 따라다니는 이름표
  const list = el('div', 'lg-vt-list');         // 좌표가 없을 때의 이름 버튼 목록
  const board = el('div', 'lg-vt-board');       // 오른쪽 현황판
  const tally = el('div', 'lg-vt-tally', { 'data-lg': 'tally', role: 'status' });
  const voteStatus = el('div', 'lg-vt-status', { 'data-lg': 'vote-status', role: 'status' });
  const judgeStatus = el('div', 'lg-vt-status', { 'data-lg': 'judge-status', role: 'status' });
  board.append(voteStatus, judgeStatus);
  root.append(layer, list, board);
  ctx.root.appendChild(root);

  // 조작 줄에 붙이는 것: 투표 수, 찬반 버튼
  const voted = el('div', 'lg-vt-count', { 'data-lg': 'voted' });
  const judgebox = el('div', 'lg-vt-judgebox');
  const verdicts = el('div', 'lg-vt-verdicts');
  const verdictBtns = {};
  for (const v of ['no', 'yes']) {
    const b = el('button', 'lg-vt-verdict lg-vt-' + v, { type: 'button', 'data-lg': 'judge', 'data-v': v, 'aria-pressed': 'false' });
    b.textContent = JUDGE_LABEL[v];
    b.addEventListener('click', () => {
      if (!canJudge(state)) return;
      ctx.send({ t: 'lg', a: 'judge', v });
    });
    verdictBtns[v] = b;
    verdicts.appendChild(b);
  }
  voted.hidden = true;
  verdicts.hidden = true;
  judgebox.hidden = true;
  judgebox.append(tally, verdicts);
  ctx.action.append(voted, judgebox);

  let state = null;
  const tags = new Map();   // id → { btn, name, who, away, av, avKey, chip, inList, w, h, x, y }
  let prevPicks = {};

  function canJudge(s) {
    if (!s || s.phase !== 'judge') return false;
    const me = (s.players || []).find((p) => p.id === s.you);
    return seated(me) && s.you !== s.accused;
  }

  function onTag(id) {
    if (!canPick(state, id)) return;
    const cur = state.votes && state.votes[state.you];
    ctx.send({ t: 'lg', a: 'vote', target: cur === id ? null : id });
  }

  function makeTag(id) {
    const btn = el('button', 'lg-vt-tag', { type: 'button', 'data-lg': 'tag', 'data-id': id });
    const body = el('span', 'lg-vt-body');
    const av = el('span', 'lg-vt-av');
    const name = el('span', 'lg-vt-name');
    const who = el('span', 'lg-vt-me');
    const away = el('span', 'lg-vt-away');
    const mark = el('span', 'lg-vt-mark');
    body.append(av, name, who, away, mark);
    const chip = el('i', 'lg-vt-jv');
    btn.append(body, chip);
    btn.addEventListener('click', () => onTag(id));
    const t = { btn, av, name, who, away, chip, avKey: undefined, inList: null, w: 44, h: 44, awayText: '' };
    tags.set(id, t);
    return t;
  }

  function setAv(t, p) {
    const key = ctx.avatarKey ? ctx.avatarKey(p) : 'c:' + (p.name || '?').slice(0, 1) + p.color;
    if (t.avKey === key) return;
    t.avKey = key;
    t.av.replaceChildren();
    if (ctx.avatar) { // 사진·꾸미기는 공용 프로필 부품
      t.av.appendChild(ctx.avatar(p, 24));
      t.av.classList.remove('lg-vt-initial');
    } else {
      t.av.textContent = Array.from(p.name || '?')[0] || '?';
      t.av.classList.add('lg-vt-initial');
    }
  }

  function lineOf(parts) {
    const d = el('div', 'lg-vt-line');
    for (const [text, color] of parts) {
      const s = el('span');
      s.textContent = text;
      if (color) s.style.color = color;
      d.appendChild(s);
    }
    return d;
  }

  function render() {
    const s = state;
    const on = !!s && s.phase !== 'lobby';
    if (!on) {
      root.hidden = true; voted.hidden = true; verdicts.hidden = true; judgebox.hidden = true;
      return;
    }
    const phase = s.phase;
    const players = s.players || [];
    const byId = new Map(players.map((p) => [p.id, p]));
    const sitting = players.filter(seated);
    const showTags = TAG_PHASES.includes(phase);
    root.hidden = !showTags;
    // 사라진 사람 정리
    for (const [id, t] of tags) {
      if (!sitting.some((p) => p.id === id)) { t.btn.remove(); tags.delete(id); }
    }
    const picks = (s.judge && s.judge.picks) || {};
    const votes = s.votes || {};
    const myPick = votes[s.you];
    const judgeOn = phase === 'judge' || phase === 'judged';
    for (const p of sitting) {
      const t = tags.get(p.id) || makeTag(p.id);
      t.btn.style.setProperty('--c', p.color);
      t.name.textContent = p.name;
      t.who.textContent = p.id === s.you ? '(나)' : '';
      t.btn.classList.toggle('lg-vt-self', p.id === s.you);
      t.btn.classList.toggle('lg-vt-off', !p.connected);
      setAv(t, p);
      const can = canPick(s, p.id);
      t.btn.classList.toggle('lg-vt-can', can);
      t.btn.setAttribute('aria-disabled', can ? 'false' : 'true');
      const picked = PICK_PHASES.includes(phase) && myPick === p.id;
      if (PICK_PHASES.includes(phase)) t.btn.setAttribute('aria-pressed', String(picked)); else t.btn.removeAttribute('aria-pressed');
      t.btn.classList.toggle('lg-vt-picked', picked);
      const accused = s.accused === p.id && ['defense', 'judge', 'judged'].includes(phase);
      t.btn.classList.toggle('lg-vt-accused', accused);
      t.btn.dataset.mark = picked ? '지목' : accused ? '지목됨' : '';
      // 찬반 딱지 (judge·judged 에서만, 지목된 사람은 없음)
      let chipV = '';
      if (judgeOn && p.id !== s.accused) chipV = picks[p.id] || (phase === 'judge' ? 'wait' : 'abs');
      const chipText = !chipV ? '' : chipV === 'wait' ? '고르는 중' : JUDGE_LABEL[chipV];
      if (t.chip.textContent !== chipText) t.chip.textContent = chipText;
      if (chipV) t.chip.dataset.v = chipV; else delete t.chip.dataset.v;
      if (chipV && prevPicks[p.id] !== undefined && prevPicks[p.id] !== chipV) {
        t.chip.classList.remove('lg-vt-pop'); void t.chip.offsetWidth; t.chip.classList.add('lg-vt-pop');
      }
      // 목록 순서는 자리 순서
      t.order = p.seat;
    }
    prevPicks = judgeOn ? { ...picks } : {};
    [...tags.values()].sort((a, b) => a.order - b.order).forEach((t) => { if (t.inList) list.appendChild(t.btn); });
    list.dataset.count = String(sitting.length);

    // 글자 현황
    const showVotes = PICK_PHASES.includes(phase);
    voteStatus.hidden = !showVotes;
    if (showVotes) {
      const rows = [];
      for (const p of sitting) {
        const to = byId.get(votes[p.id]);
        if (to) rows.push(lineOf([[p.name, p.color], [' → ', null], [to.name, to.color]]));
      }
      if (!rows.length) { const d = el('div', 'lg-vt-line lg-vt-none'); d.textContent = '아직 아무도 지목하지 않았어요'; rows.push(d); }
      voteStatus.replaceChildren(...rows);
      const n = sitting.filter((p) => byId.has(votes[p.id])).length;
      voted.textContent = '투표 ' + n + ' / ' + voterCount(players);
    }
    voted.hidden = !showVotes;

    // 찬반
    tally.hidden = !judgeOn;
    judgebox.hidden = !judgeOn;
    tally.textContent = judgeOn ? tallyText(picks, absentOf(players, s.accused, picks), phase === 'judged') : '';
    judgeStatus.hidden = !judgeOn;
    if (judgeOn) {
      const rows = [];
      for (const p of sitting) {
        if (picks[p.id]) rows.push(lineOf([[p.name, p.color], [': ' + JUDGE_LABEL[picks[p.id]], null]]));
      }
      judgeStatus.replaceChildren(...rows);
    }
    verdicts.hidden = !canJudge(s);
    const mine = picks[s.you];
    for (const v of ['no', 'yes']) verdictBtns[v].setAttribute('aria-pressed', String(mine === v));
    root.classList.toggle('lg-vt-nogl', !!ctx.nogl);
    place(true);
  }

  function put(t, inList) {
    if (t.inList === inList) return;
    t.inList = inList;
    t.btn.classList.toggle('lg-vt-listed', inList);
    if (inList) { list.appendChild(t.btn); t.btn.style.transform = ''; } else layer.appendChild(t.btn);
  }

  // 좌표를 따라가거나 목록으로 둔다
  function place(measure) {
    if (!state || root.hidden) return;
    const W = root.clientWidth || ctx.root.clientWidth || 0;
    const H = root.clientHeight || ctx.root.clientHeight || 0;
    let anyList = false;
    for (const [id, t] of tags) {
      const a = ctx.nogl ? null : (ctx.tagAnchor || ctx.anchor)(id);
      if (!a) { put(t, true); anyList = true; continue; }
      put(t, false);
      if (measure || !t.w) { t.w = t.btn.offsetWidth || 44; t.h = t.btn.offsetHeight || 44; }
      const mx = t.w / 2 + 8;
      const x = Math.min(Math.max(a.x, mx), Math.max(mx, W - mx));
      const below = !!a.below;
      const y = below
        ? Math.min(Math.max(a.y, 4), Math.max(4, H - t.h - 4))
        : Math.min(Math.max(a.y, t.h + 4), Math.max(t.h + 4, H - 4));
      if (t.x !== x || t.y !== y || t.below !== below) {
        t.x = x; t.y = y; t.below = below;
        t.btn.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,' + (below ? '0' : '-100%') + ')';
      }
    }
    list.hidden = !anyList;
    // 정렬: 목록으로 간 이름표를 자리 순서로
    if (anyList) {
      [...tags.values()].filter((t) => t.inList).sort((a, b) => a.order - b.order).forEach((t) => list.appendChild(t.btn));
    }
  }

  function tickAway() {
    if (!state) return;
    for (const p of state.players || []) {
      const t = tags.get(p.id);
      if (!t) continue;
      let text = '';
      if (!p.connected) {
        const sec = p.awayUntil ? Math.max(0, Math.ceil((p.awayUntil - ctx.now()) / 1000)) : null;
        text = sec === null ? '끊김' : '끊김 ' + sec + '초';
      }
      if (t.awayText !== text) { t.awayText = text; t.away.textContent = text; }
      // 유예 시간이 끝난 사람(나간 사람)은 이름표에서 뺀다 (멈춘 카운트다운을 남기지 않는다)
      const gone = !p.connected && !!p.awayUntil && ctx.now() >= p.awayUntil;
      t.btn.classList.toggle('lg-vt-gone', gone);
    }
  }

  return {
    el: root,
    pick(id) { onTag(id); },
    update(s) { state = s || null; render(); tickAway(); },
    frame() { place(false); tickAway(); },
    // 이름표 가운데(root 기준 CSS px). 안 보이면 null
    tagPos(id) {
      const t = tags.get(id);
      if (!t || root.hidden || !t.btn.isConnected) return null;
      const r = t.btn.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      const base = root.getBoundingClientRect();
      // 목록(nogl)일 때는 이름표 오른쪽 옆을 알려 준다: 말풍선·이모티콘이 이름표를 덮지 않게
      if (t.inList) return { x: r.right - base.left + 90, y: r.top - base.top + r.height / 2 + 12 };
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
    },
    dispose() {
      root.remove(); voted.remove(); judgebox.remove(); tags.clear(); state = null;
    },
  };
}
