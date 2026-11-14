// 공통 대기실 (COMMON-CONTRACT 4-3, 시안 design/waiting-room). 3칸: 왼쪽 설정 / 가운데 참가자·시작·나가기 / 오른쪽 채팅.
// 지금 로비의 디자인(.lb-panel/.lb-group/.lb-seg-item/.lb-btn)을 클래스로 쓰기만 하고, 자리 맞춤은 room.css(.wr-)에서.
// 이 파일은 CSS 를 불러오지 않는다(node 시험이 waitModel 을 불러온다). room.css 는 frame.js 가 불러온다.
//
// createWait({send, sound, profile, faces, chat, toast?, onLeave}) -> { el, update(state, schema, parts), anchorOf(id), dispose() }
//   schema = GAMES[mode] (name, about, max, settings, own), parts(name) -> 게임 waitPart(name) ({el, update(state), dispose()}) 또는 null
// waitModel(state, schema, meId) -> 화면에 그릴 값(순수 함수, 시험용)
// patchFor('times.speak', 30) -> {times:{speak:30}}
import { h, svg } from '../ui/dom.js';
import { soundButton } from './bar.js';
import { SPEC_MAX } from '../../../shared/spectator.js';

const LOCK = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
const EYE = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>';

export const getPath = (obj, k) => String(k).split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
export function patchFor(k, v) {
  const parts = String(k).split('.');
  return parts.reduceRight((acc, p) => ({ [p]: acc }), v);
}
const call = (x, set) => (typeof x === 'function' ? x(set) : x);
// opts: [[값, 이름], …] 또는 [값, …](이름 = 값 글자)
const normOpts = (opts) => (Array.isArray(opts) ? opts : []).map((o) => (Array.isArray(o) ? { v: o[0], label: String(o[1] ?? o[0]) } : { v: o, label: String(o) }));

/** 한 칸(스키마 한 줄)을 그릴 값으로. editable = 이 사람이 바꿀 수 있는가 */
function fieldModel(f, set, editable) {
  if (!f || typeof f !== 'object') return null;
  if (typeof f.when === 'function' && !f.when(set)) return null;
  const base = { k: f.k ?? null, label: f.label ?? '', type: f.type, editable };
  if (f.type === 'seg') {
    const cur = getPath(set, f.k);
    return { ...base, opts: normOpts(call(f.opts, set)).map((o) => ({ ...o, on: o.v === cur })) };
  }
  if (f.type === 'multi') {
    const picked = typeof f.get === 'function' ? f.get(set) : getPath(set, f.k);
    const on = new Set(Array.isArray(picked) ? picked : []);
    return { ...base, opts: normOpts(call(f.opts, set)).map((o) => ({ ...o, on: on.has(o.v) })) };
  }
  if (f.type === 'info') return { ...base, rows: (Array.isArray(f.rows) ? f.rows : []).map(([a, b]) => [String(a), String(b)]) };
  if (f.type === 'custom') return { ...base, part: f.part };
  return null;
}

export function waitModel(state, schema, meId) {
  const wait = state?.wait ?? null;
  const set = wait?.set ?? {};
  const mine = wait?.own?.[meId] ?? {};
  const isHost = state?.hostId === meId;
  const players = (state?.players ?? []).map((p) => {
    const host = p.id === state.hostId, me = p.id === meId, off = p.connected === false;
    return {
      id: p.id, name: String(p.name ?? ''), host, me, off,
      color: typeof p.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : null,
      tags: [host && '방장', me && '나', off && '연결 끊김'].filter(Boolean).join(' · '),
      kick: isHost && !me && Boolean(wait),
    };
  });
  const specs = (Array.isArray(state?.specs) ? state.specs : []).map((s) => ({ id: s.id, name: String(s.name ?? ''), me: s.id === meId, kick: isHost }));
  // 왼쪽 칸: 개인 칸(OWN, 누구나 자기 것) 먼저, 그다음 방 설정(group 순서대로, 방장만)
  const sections = [];
  for (const f of wait ? schema?.own ?? [] : []) { // 대기·결과 동안만(게임 중에는 설정 값이 없다)
    const m = fieldModel(f, mine, Boolean(wait));
    if (m) sections.push({ title: m.label, own: true, hostOnly: false, fields: [m.type === 'custom' ? { ...m, label: '' } : m] });
  }
  const byGroup = new Map();
  for (const f of wait ? schema?.settings ?? [] : []) {
    const m = fieldModel(f, set, isHost && Boolean(wait));
    if (!m) continue;
    const g = f.group ?? '설정';
    if (!byGroup.has(g)) { byGroup.set(g, { title: g, own: false, hostOnly: false, fields: [] }); sections.push(byGroup.get(g)); }
    const sec = byGroup.get(g);
    sec.fields.push(m);
    if (m.type !== 'info') sec.hostOnly = true;
  }
  const hasSettings = (schema?.settings ?? []).some((f) => f && f.type !== 'info');
  if (!hasSettings) {
    const NOTE = '이 게임은 바꿀 설정이 없어요';
    const sec = sections.find((x) => !x.own);
    if (sec) sec.note = NOTE; else sections.push({ title: '설정', own: false, hostOnly: false, fields: [], note: NOTE });
  }
  const host = players.find((p) => p.host);
  return {
    game: schema?.name ?? state?.mode ?? '',
    code: state?.code ?? '',
    title: `${host?.name ?? ''}의 방`,
    about: schema?.about ?? '',
    isHost,
    count: players.length,
    max: schema?.max ?? players.length,
    players,
    specs,
    specMax: SPEC_MAX,
    sections,
    why: wait?.why?.msg ?? '',
    can: Boolean(wait?.can),
    waiting: Boolean(wait),
  };
}

export function createWait({ send, sound, profile, faces, chat, toast, onLeave }) {
  const btn = (cls, ...kids) => { const b = h('button', cls, ...kids); b.type = 'button'; return b; };

  // 왼쪽: 게임 이름 · 방 코드 · 소리 / "○○의 방" · 설명 / 설정
  const game = h('span', 'wr-game');
  const codeB = h('b');
  const codeBtn = btn('wr-code', '방 코드 ', codeB);
  codeBtn.title = '눌러서 복사';
  codeBtn.dataset.rm = 'wait-code';
  codeBtn.addEventListener('click', () => {
    const t = codeB.textContent;
    navigator.clipboard?.writeText(t).then(() => toast?.('방 코드를 복사했어요'), () => {});
  });
  const snd = soundButton(sound, 'wr-ic');
  snd.el.dataset.rm = 'wait-sound';
  const title = h('h2');
  const about = h('p', 'wr-desc');
  const setBox = h('div', 'wr-sets');
  const left = h('section', 'lb-panel wr-panel wr-left',
    h('div', 'wr-head', game, h('span', 'wr-sp'), codeBtn, snd.el),
    h('div', 'wr-titlebox', title, about), h('hr'), setBox);

  // 가운데: 참가자 · 관전 · 시작 · 나가기
  const count = h('h2');
  const list = h('ul', 'lb-group lb-players wr-players');
  const specCap = h('p', 'lb-sub wr-speccap');
  const specList = h('ul', 'lb-group wr-specs');
  const why = h('p', 'wr-why');
  const start = btn('lb-btn lb-primary', '게임 시작');
  start.dataset.rm = 'wait-start';
  start.addEventListener('click', () => send({ t: 'start' }));
  const guest = h('p', 'lb-cap lb-center wr-guest', '방장이 시작하기를 기다리는 중');
  const leave = btn('lb-btn lb-text lb-danger', '나가기');
  leave.dataset.rm = 'wait-leave';
  leave.addEventListener('click', () => onLeave());
  const mid = h('section', 'lb-panel wr-panel wr-mid', count, list, specCap, specList, h('div', 'lb-actions', why, start, guest, leave));

  // 오른쪽: 공용 채팅(chat.setMode('wait') 일 때 waitEl 안에 기록 + 입력 줄)
  const right = h('section', 'lb-panel wr-panel wr-chat', h('div', 'wr-head', h('h2', null, '채팅')), chat.waitEl);

  const el = h('div', 'lb-root wr-root', h('div', 'wr-grid', left, mid, right));
  el.hidden = true;

  const partCache = new Map(); // name -> part
  let last = null; // { state, schema, parts }
  const avatars = new Map(); // id -> avatar el (anchorOf)

  function segEl(f, onPick) {
    const box = h('div', `wr-seg${f.type === 'multi' || f.opts.length > 4 ? ' wr-wrap' : ''}`);
    box.setAttribute('role', f.type === 'multi' ? 'group' : 'radiogroup');
    if (f.label) box.setAttribute('aria-label', f.label);
    for (const o of f.opts) {
      const b = btn('lb-seg-item wr-opt', o.label);
      b.setAttribute('role', f.type === 'multi' ? 'checkbox' : 'radio');
      b.setAttribute('aria-checked', String(o.on));
      b.disabled = !f.editable;
      b.addEventListener('click', () => onPick(o));
      box.append(b);
    }
    return box;
  }

  function fieldEl(f, own, state, parts) {
    const kind = own ? 'pick' : 'set';
    if (f.type === 'info') {
      return h('dl', 'lb-group wr-info', f.rows.map(([a, b]) => h('div', 'lb-row', h('dt', null, a), h('dd', null, b))));
    }
    if (f.type === 'custom') {
      let part = partCache.get(f.part);
      if (!part) {
        part = parts?.(f.part) ?? null;
        if (part) partCache.set(f.part, part);
      }
      if (!part) return null;
      part.update?.(state);
      return f.label ? h('div', 'wr-f wr-top', h('div', 'wr-l', f.label), part.el) : part.el;
    }
    const onPick = (o) => {
      if (!f.editable) return;
      let v = o.v;
      if (f.type === 'multi') v = f.opts.filter((x) => (x === o ? !x.on : x.on)).map((x) => x.v);
      else if (o.on) return;
      send({ t: kind, patch: patchFor(f.k, v) });
    };
    return h('div', `wr-f${f.type === 'multi' || f.opts.length > 4 ? ' wr-top' : ''}`, h('div', 'wr-l', f.label), segEl(f, onPick));
  }

  function renderLeft(m, state, parts) {
    const kids = [];
    let locked = false;
    m.sections.forEach((sec, i) => {
      if (i) kids.push(h('hr'));
      const head = h('div', 'wr-sec', sec.title);
      if (sec.note) head.append(h('small', null, sec.note));
      if (sec.hostOnly && !m.isHost && !locked) { locked = true; head.append(h('small', 'wr-lock', svg(LOCK), '방장만 바꿀 수 있어요')); } // 시안: 첫 묶음에만
      kids.push(head, sec.fields.length && h('div', `wr-set${sec.hostOnly && !m.isHost ? ' wr-ro' : ''}`, sec.fields.map((f) => fieldEl(f, sec.own, state, parts))));
    });
    setBox.replaceChildren(...kids.filter(Boolean));
  }

  function playerRow(p) {
    const face = faces.get(p.id);
    const av = profile.playerAvatar({ id: p.id, name: p.name, face: face.avatar, look: face.look, size: 32 });
    avatars.set(p.id, av);
    const row = h('li', `lb-row${p.off ? ' lb-off' : ''}`, av, h('span', 'wr-who', profile.nameTag({ name: p.name, look: face.look })));
    if (p.color) { const d = h('i', 'wr-dot'); d.style.background = p.color; row.append(d); }
    row.append(h('span', 'lb-tags', p.tags));
    if (p.kick) row.append(kickBtn(p));
    return row;
  }
  function kickBtn(p) {
    const k = btn('wr-kick', '×');
    k.setAttribute('aria-label', `${p.name} 내보내기`);
    k.title = '내보내기';
    k.dataset.rm = 'wait-kick';
    k.addEventListener('click', () => send({ t: 'kick', id: p.id }));
    return k;
  }

  function render() {
    if (!last) return;
    const { state, schema, parts } = last;
    const m = waitModel(state, schema, state.you);
    game.textContent = m.game;
    codeB.textContent = m.code;
    title.textContent = m.title;
    about.textContent = m.about;
    about.hidden = !m.about;
    renderLeft(m, state, parts);
    count.textContent = `참가자 ${m.count}/${m.max}`;
    avatars.clear();
    list.replaceChildren(...m.players.map(playerRow));
    specCap.textContent = `관전 ${m.specs.length}/${m.specMax}`;
    specCap.hidden = specList.hidden = !m.specs.length;
    specList.replaceChildren(...m.specs.map((s) => {
      const face = faces.get(s.id);
      const eye = svg(EYE);
      eye.setAttribute('class', 'wr-eye');
      const row = h('li', 'lb-row', profile.playerAvatar({ id: s.id, name: s.name, face: face.avatar, look: face.look, size: 26 }),
        h('span', 'wr-who', profile.nameTag({ name: s.name, look: face.look })), eye, h('span', 'lb-tags', s.me ? '관전 · 나' : '관전'));
      if (s.kick) row.append(kickBtn(s));
      return row;
    }));
    why.hidden = start.hidden = !m.isHost;
    why.textContent = m.why;
    start.disabled = !m.can;
    guest.hidden = m.isHost;
  }

  const offFaces = faces.onChange(() => { if (!el.hidden) render(); });

  return {
    el,
    update(state, schema, parts) {
      last = { state, schema, parts };
      render();
    },
    // 대기실에서는 이모티콘·사진이 참가자 줄의 사진 위에 뜬다
    anchorOf(id) {
      const av = avatars.get(id);
      if (el.hidden || !av?.isConnected) return null;
      const r = av.getBoundingClientRect();
      return r.width ? { x: r.left + r.width / 2, y: r.top + 4 } : null;
    },
    dispose() {
      offFaces();
      snd.dispose();
      for (const p of partCache.values()) { try { p.dispose?.(); } catch (e) { console.error(e); } }
      partCache.clear();
      el.remove();
    },
  };
}
