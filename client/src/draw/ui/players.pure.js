// 플레이어 표시·말풍선의 계산 부분 (DOM 없음). players.js 가 쓰고 test/draw/players.pure.test.js 가 시험한다.
// 위치: GDD 7절(화면), 10-4(상태), 10-5(event), 3-5(맞힌 뒤의 채팅).

export const SEAT_COUNT = 8;
export const SEATS_PER_SIDE = 4;
export const BUBBLE_TEXT_MAX = 80; // 서버 한도는 40자. 방어용 여유
export const LOG_MAX = 30;
export const HIT_TEXT = '정답!';

// 시안(design/draw/index.html)의 자리별 색. 사진이 없을 때 이름 첫 글자 원의 바탕.
export const SEAT_COLORS = Object.freeze(['#b5651d', '#2f6fde', '#1fa34a', '#d1456f', '#8b45d1', '#e08a1a', '#3a9aa8', '#6b7a2c']);
export const seatColor = (seat) => SEAT_COLORS[(((Number.isInteger(seat) ? seat : 0) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT];

const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/; // ui/dom.js 와 같은 모양
export const avatarSrc = (a) => (typeof a === 'string' && JPEG.test(a) ? a : null);

export const firstChar = (name) => [...String(name ?? '').trim()][0] ?? '?';

// players(seat 0..7) -> 길이 8 배열(빈 자리는 null). seat 이 겹치거나 범위 밖이면 남는 첫 빈 칸에 넣는다.
export function seatSlots(players) {
  const slots = new Array(SEAT_COUNT).fill(null);
  const rest = [];
  for (const p of Array.isArray(players) ? players : []) {
    if (p && Number.isInteger(p.seat) && p.seat >= 0 && p.seat < SEAT_COUNT && !slots[p.seat]) slots[p.seat] = p;
    else if (p) rest.push(p);
  }
  for (const p of rest) {
    const i = slots.indexOf(null);
    if (i < 0) break;
    slots[i] = p;
  }
  return slots;
}

// 자리 0~3 = 왼쪽, 4~7 = 오른쪽 (휴대폰도 같은 4+4로 위아래에 쌓는다)
export function splitColumns(slots) {
  return { l: slots.slice(0, SEATS_PER_SIDE), r: slots.slice(SEATS_PER_SIDE, SEAT_COUNT) };
}

// 말풍선이 어디로 튀어나오나.
//  'right' 그림판이 오른쪽(왼쪽 칸 사람) · 'left' 그림판이 왼쪽(오른쪽 칸 사람)
//  'up' 프로필 위(내가 그리는 사람, PC·iPad) · 'inrow' 줄 안(내가 그리는 사람, 휴대폰)
//  휴대폰 목록은 전부 왼쪽 끝이라 그림판은 항상 오른쪽이다.
export function bubbleMode(layout, col, drawerIsMe) {
  if (layout === 'phone') return drawerIsMe ? 'inrow' : 'right';
  if (drawerIsMe) return 'up';
  return col === 'r' ? 'left' : 'right';
}

const isId = (v) => typeof v === 'string' && v !== '';

export function iAmDrawer(state, meId) {
  return !!state && isId(meId) && state.drawerId === meId && (state.phase === 'pick' || state.phase === 'draw');
}

// 정답자끼리 글(sec:1)을 볼 수 있는 사람: 이미 맞힌 사람과 그리는 사람 (3-5, 10-5)
export function canSeeSec(state, meId) {
  if (!state || !isId(meId)) return false;
  if (state.drawerId === meId) return true;
  const me = (state.players ?? []).find((p) => p && p.id === meId);
  return !!(me && me.hit);
}

// 정답 공개 때 이번 문제로 얻은 점수 (맞힌 사람 pts, 그린 사람 drawerPts). 없으면 0.
export function gainOf(state, id) {
  const r = state && state.reveal;
  if (!r || state.phase !== 'reveal') return 0;
  const g = (r.gains ?? []).find((x) => x && x.id === id);
  if (g && g.pts > 0) return g.pts;
  if (id === state.drawerId && r.drawerPts > 0) return r.drawerPts;
  return 0;
}

// 칸 하나가 보여 줄 모든 것. 배지 우선순위: 끊김 > 그리는 중 > 맞힘 > 방장
export function playerView(state, p) {
  const phase = state?.phase;
  const live = phase === 'pick' || phase === 'draw';
  const gone = p.connected === false;
  const drawing = live && state.drawerId === p.id;
  const hit = !drawing && ((phase === 'draw' && !!p.hit) || (phase === 'reveal' && (state.reveal?.gains ?? []).some((g) => g && g.id === p.id)));
  const isHost = state?.hostId === p.id;
  let badge = null;
  if (gone) badge = { kind: 'gone', text: '끊김' };
  else if (drawing) badge = { kind: 'draw', text: '그리는 중' };
  else if (hit) badge = { kind: 'hit', text: '맞힘' };
  else if (isHost) badge = { kind: 'host', text: '방장' };
  return {
    id: p.id,
    name: String(p.name ?? ''),
    score: Number.isFinite(p.score) ? p.score : 0,
    gone, drawing, hit, badge,
    gain: gainOf(state, p.id),
    color: seatColor(p.seat),
    letter: firstChar(p.name),
  };
}

const clean = (t) => t.replace(/\s+/g, ' ').trim().slice(0, BUBBLE_TEXT_MAX);

// chat 이벤트 -> 말풍선 {id, text, kind:'say'|'sec'} 또는 null.
// sec:1 은 서버가 이미 대상에게만 보내지만, 한 번 더 걸러 못 맞힌 사람 화면에 새지 않게 한다.
export function bubbleFromChat(e, state, meId) {
  if (!e || e.k !== 'chat' || !isId(e.id) || typeof e.text !== 'string') return null;
  const text = clean(e.text);
  if (!text) return null;
  if (e.sec) {
    if (!canSeeSec(state, meId) && e.id !== meId) return null;
    return { id: e.id, text, kind: 'sec' };
  }
  return { id: e.id, text, kind: 'say' };
}

// drHit 이벤트 -> 초록 "정답!" 말풍선. 정답 글자는 절대 넣지 않는다.
export function bubbleFromHit(e) {
  if (!e || e.k !== 'drHit' || !isId(e.id)) return null;
  return { id: e.id, text: HIT_TEXT, kind: 'ok' };
}

// 채팅 기록 칸(휴대폰, 맞히는 사람 화면) 한 줄: {kind, name, text} 또는 null
export function logEntryFromChat(item, state, meId) {
  if (!item || typeof item.text !== 'string') return null;
  const text = clean(item.text);
  if (!text) return null;
  const sec = !!item.sec;
  if (sec && !canSeeSec(state, meId) && item.id !== meId) return null;
  return { kind: sec ? 'sec' : 'say', name: String(item.name ?? ''), text };
}
export const logEntryFromHit = (name) => ({ kind: 'sys', name: '', text: `${name || '누군가'} 님 정답!` });

export function pushLog(list, entry, max = LOG_MAX) {
  if (!entry) return list;
  list.push(entry);
  if (list.length > max) list.splice(0, list.length - max);
  return list;
}

// chatLog(입장·재접속 때 최근 기록) -> 기록 줄 배열. ts 순서, 최대 LOG_MAX, sec 은 볼 수 있는 사람만.
export function logFromChatLog(items, state, meId) {
  const rows = (Array.isArray(items) ? items : []).filter((x) => x && typeof x.text === 'string');
  rows.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const out = [];
  for (const it of rows) pushLog(out, logEntryFromChat(it, state, meId));
  return out;
}

// 채팅 기록 칸을 어떻게 보이나 (GDD 15절 결정). 'full' 맞히는 사람 · 'small' 그리는 사람(PC·iPad 만) · 'hidden'
//  휴대폰에서 그리는 사람은 자리가 없어 숨긴다.
export function logMode(layout, drawerIsMe) {
  if (!drawerIsMe) return 'full';
  return layout === 'phone' ? 'hidden' : 'small';
}

// 새 글이 오면 맨 아래로 따라갈까. 사용자가 위로 올려 보고 있으면(맨 아래에서 slack px 넘게 떨어짐) 따라가지 않는다.
export function shouldFollow(scrollTop, clientHeight, scrollHeight, slack = 24) {
  const nums = [scrollTop, clientHeight, scrollHeight];
  if (!nums.every((n) => Number.isFinite(n))) return true;
  return scrollHeight - (scrollTop + clientHeight) <= slack;
}
