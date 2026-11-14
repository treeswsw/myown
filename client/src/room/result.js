// 공통 결과 화면 (COMMON-CONTRACT 4-2). 판이 끝나 state.wait.result 가 오면 게임 판 위에 띄운다(판은 뒤에 흐리게).
// 누가 이겼나 · 순위 · 점수 · 이번 판 코인(홀덤은 칩) 증감을 모든 사람 것으로, 그 아래 게임 칸(게임 resultPart), 버튼 셋.
// 대기실(.lb-panel/.lb-btn)을 클래스로 쓰기만 하고 자리 맞춤은 room.css(.rm-rs-). 이 파일은 CSS 를 불러오지 않는다(node 시험).
//
// createResult({send, profile, faces, onWait, onLeave}) -> { el, update(state|null, game), peek(), anchorOf(id), dispose() }
//   update(null) = 숨김. game = 게임 mount 반환: resultTitle?(state) -> {title, sub?} | null, resultPart?(state) -> HTMLElement | null
//   peek() = 판을 보도록 패널을 접는다("결과 보기" 버튼 하나만 남김, 게임 ctx.peekResult, 요트 점수표 보기).
// resultModel(state, meId, title?) -> 화면에 그릴 값(순수 함수, 시험용)
import { h } from '../ui/dom.js';

const MINUS = '−';
const signed = (n) => (n > 0 ? `+${n.toLocaleString('ko-KR')}` : n < 0 ? `${MINUS}${(-n).toLocaleString('ko-KR')}` : '0');

export function resultModel(state, meId, title = null) {
  const r = state?.wait?.result;
  if (!r) return null;
  const unit = r.unit === 'chip' ? '칩' : '코인';
  const rows = r.rows.map((x) => {
    const n = Number(r.gain?.[x.id]) || 0;
    const add = r.add ? Number(r.add.by?.[x.id]) || 0 : 0;
    return {
      id: x.id, name: String(x.name ?? ''), rank: x.rank, me: x.id === meId, top: x.rank === 1,
      score: x.score === undefined ? null : Number(x.score).toLocaleString('ko-KR'),
      note: x.note ? String(x.note) : '',
      gain: n === 0 ? '0' : `${signed(n)} ${unit}`, zero: n === 0, down: n < 0,
      // 지급과 더한 증감을 나눠 한 줄로(미니: 판 코인 +1 · 베팅 +5)
      split: add !== 0 ? `판 ${unit} ${signed(n - add)} · ${r.add.label} ${signed(add)}` : '',
    };
  });
  const winners = rows.filter((x) => x.top).map((x) => x.name);
  const isHost = state.hostId === meId;
  return {
    title: title?.title || (winners.length ? `${winners.join(', ')} 승리` : '게임 끝'),
    sub: title?.sub ?? '',
    rows,
    isHost,
    can: Boolean(state.wait.can),
    why: state.wait.why?.msg ?? '',
  };
}

export function createResult({ send, profile, faces, onWait, onLeave }) {
  const btn = (cls, text, rm, fn) => {
    const b = h('button', cls, text);
    b.type = 'button';
    b.dataset.rm = rm;
    b.addEventListener('click', fn);
    return b;
  };
  const title = h('h2', 'rm-rs-title');
  const sub = h('p', 'rm-rs-sub');
  const list = h('ul', 'lb-group rm-rs-rows');
  const cols = h('div', 'rm-rs-cols'); // 열 이름: 게임 점수 / 받은 코인 (2026-11-14 사용자 요청)
  const part = h('div', 'rm-rs-part');
  const why = h('p', 'rm-rs-why');
  const again = btn('lb-btn lb-primary', '다시 시작', 'result-again', () => send({ t: 'start' }));
  const guest = h('p', 'lb-cap rm-rs-guest', '방장이 다시 시작하기를 기다리는 중');
  const foot = h('div', 'rm-rs-foot',
    btn('lb-btn lb-text lb-danger', '나가기', 'result-leave', () => onLeave()),
    h('span', 'rm-rs-sp'),
    btn('lb-btn lb-tint', '대기실로', 'result-wait', () => onWait()),
    again, guest);
  const panel = h('section', 'lb-panel rm-rs-panel', h('div', 'rm-rs-head', title, sub), cols, list, part, why, foot);
  panel.dataset.rm = 'result';
  const back = btn('lb-btn lb-primary rm-rs-back', '결과 보기', 'result-back', () => setPeek(false));
  const el = h('div', 'lb-root rm-rs-root', panel, back);
  el.hidden = true;
  const avatars = new Map(); // id -> 사진 el (anchorOf)
  let last = null;
  let peeking = false;
  function setPeek(on) {
    peeking = on;
    el.classList.toggle('rm-rs-peek', on);
    panel.hidden = on;
    back.hidden = !on;
  }
  setPeek(false);

  function row(x) {
    const face = faces.get(x.id);
    const av = profile.playerAvatar({ id: x.id, name: x.name, face: face.avatar, look: face.look, size: x.top ? 52 : 40 });
    avatars.set(x.id, av);
    const who = h('span', 'rm-rs-who', profile.nameTag({ name: x.me ? `${x.name} (나)` : x.name, look: face.look }));
    if (x.note) who.append(h('small', null, x.note));
    const gain = h('span', `rm-rs-gain${x.zero ? ' rm-rs-zero' : ''}${x.down ? ' rm-rs-down' : ''}`, h('b', null, x.gain));
    if (x.split) gain.append(h('small', null, x.split));
    const li = h('li', `lb-row rm-rs-row${x.top ? ' rm-rs-top' : ''}${x.me ? ' rm-rs-me' : ''}`,
      h('span', 'rm-rs-rank', String(x.rank)), av, who);
    if (x.score !== null) li.append(h('span', 'rm-rs-score', x.score));
    li.append(gain);
    li.dataset.id = x.id;
    return li;
  }

  function render() {
    if (!last) return;
    const { state, game } = last;
    const safe = (fn) => { try { return fn(); } catch (e) { console.error(e); return null; } };
    const m = resultModel(state, state.you, safe(() => game?.resultTitle?.(state) ?? null));
    if (!m) return;
    title.textContent = m.title;
    sub.textContent = m.sub;
    sub.hidden = !m.sub;
    avatars.clear();
    list.replaceChildren(...m.rows.map(row));
    const unitName = state.wait?.result?.unit === 'chip' ? '받은 칩' : '받은 코인';
    cols.replaceChildren(h('span', 'rm-rs-sp'), ...(m.rows.some((x) => x.score !== null) ? [h('span', 'rm-rs-col-score', '게임 점수')] : []), h('span', 'rm-rs-col-gain', unitName));
    const g = safe(() => game?.resultPart?.(state) ?? null);
    if (part.firstChild !== g) part.replaceChildren(...(g ? [g] : []));
    part.hidden = !g;
    again.hidden = why.hidden = !m.isHost;
    again.disabled = !m.can;
    why.textContent = m.can ? '' : m.why;
    guest.hidden = m.isHost;
  }

  const offFaces = faces.onChange(() => { if (!el.hidden) render(); });

  return {
    el,
    update(state, game) {
      if (!state) { el.hidden = true; last = null; setPeek(false); return; }
      el.hidden = false;
      last = { state, game };
      render();
    },
    peek: () => setPeek(true),
    anchorOf(id) {
      const av = avatars.get(id);
      if (el.hidden || peeking || !av?.isConnected) return null;
      const r = av.getBoundingClientRect();
      return r.width ? { x: r.left + r.width / 2, y: r.top + 4 } : null;
    },
    dispose() {
      offFaces();
      el.remove();
    },
  };
}
