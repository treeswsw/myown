// 상단·문제 띠의 계산 (DOM 없음). docs/draw/GDD.md 3-4, 3-5, 6절 글자 수 칸, 10-4, 10-6.
// ★ 못 맞힌 사람 시점에서는 state.word 가 있어도 절대 표시하지 않는다(questionView).
import { CHAT, TIMES } from '../../../../shared/draw/constants.js';

export const URGENT_SEC = 10; // 이 이하면 강조

const players = (s) => (s && Array.isArray(s.players) ? s.players : []);
export function meOf(state, meId) {
  const id = meId != null ? meId : state && state.you;
  return players(state).find((p) => p.id === id) || null;
}
const isDrawer = (state, meId) => !!state && state.drawerId != null && state.drawerId === (meId != null ? meId : state.you);

// 남은 시간(ms). endsAt 이 없으면 null. 음수는 0.
export function remainMs(endsAt, now) {
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return null;
  return Math.max(0, endsAt - now);
}

// "0:26" 꼴. 올림(0.1초 남아도 0:01), 끝나면 0:00.
export function formatTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '0:00';
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 막대 길이 비율 0..1 (남은 ÷ 전체). 전체 = 단계별 시간. 첫 정답으로 줄면(rushed) 30초가 전체.
export function totalSec(state) {
  if (!state) return 0;
  if (state.phase === 'pick') return TIMES.pick;
  if (state.phase === 'reveal') return TIMES.reveal;
  if (state.phase === 'draw') return state.rushed ? TIMES.rush : (state.settings && state.settings.time) || 0;
  return 0;
}
export function barFraction(state, ms) {
  const total = totalSec(state) * 1000;
  if (!total || ms == null) return 0;
  return Math.min(1, Math.max(0, ms / total));
}

// 10초 이하 남았는가(그리는 단계에서만)
export function isUrgent(state, ms) {
  return !!state && state.phase === 'draw' && ms != null && ms > 0 && ms <= URGENT_SEC * 1000;
}

// 글자 수 칸: mask 문자열 -> { cells: [true(칸)|false(띄어쓰기)], len }. mask 가 없으면 null.
export function maskCells(mask) {
  if (typeof mask !== 'string' || !mask) return null;
  const cells = [...mask].map((ch) => ch !== ' ');
  return { cells, len: cells.filter(Boolean).length };
}

// 문제 띠에 무엇을 보일까.
//  kind 'word' : text = 단어 (그리는 사람·이미 맞힌 사람의 draw, 모두의 reveal)
//  kind 'mask' : cells/len = 글자 수 칸 (settings.len 켜짐)
//  kind 'note' : text = 안내 글 (칸 없음, pick, lobby 등)
export function questionView(state, meId) {
  if (!state) return { kind: 'note', text: '' };
  const me = meOf(state, meId);
  const drawer = isDrawer(state, meId);
  const phase = state.phase;
  if (phase === 'reveal') {
    const w = state.word || (state.reveal && state.reveal.word) || '';
    return w ? { kind: 'word', text: w } : { kind: 'note', text: '정답 공개' };
  }
  if (phase === 'draw') {
    // 단어는 ★ 그리는 사람과 이미 맞힌 사람에게만. 그 밖에는 state.word 를 보지도 않는다.
    if ((drawer || (me && me.hit === true)) && state.word) return { kind: 'word', text: state.word };
    const lenOn = !state.settings || state.settings.len !== false;
    const m = lenOn ? maskCells(state.mask) : null;
    if (m) return { kind: 'mask', cells: m.cells, len: m.len };
    return { kind: 'note', text: '그림을 보고 맞혀 보세요' };
  }
  if (phase === 'pick') {
    return { kind: 'note', text: drawer ? '단어를 고르세요' : '그리는 사람이 단어를 고르고 있어요' };
  }
  return { kind: 'note', text: '' };
}

// 맞힌 사람 n / 접속 중인 맞히는 사람 m. (그리는 사람 제외, 맞힌 사람은 끊겨도 센다)
export function hitCounts(state) {
  const guessers = players(state).filter((p) => p.id !== state.drawerId);
  const n = guessers.filter((p) => p.hit === true).length;
  const m = guessers.filter((p) => p.connected !== false || p.hit === true).length;
  return { n, m };
}
export function showHitCount(state) {
  return !!state && state.phase === 'draw' && !!state.drawerId;
}

export function questionNo(state) {
  if (!state || !(state.qTotal > 0)) return null;
  return { q: state.q, total: state.qTotal };
}

// 정답 입력 칸 상태 (GDD 10-6). show: 칸을 보일까, enabled: 쓸 수 있나
export function answerBox(state, meId) {
  const none = { show: false, enabled: false, placeholder: '', hit: false };
  if (!state) return none;
  const phase = state.phase;
  if (phase !== 'pick' && phase !== 'draw' && phase !== 'reveal') return none;
  if (phase === 'reveal') return { show: true, enabled: true, placeholder: '채팅', hit: false };
  if (isDrawer(state, meId)) return none; // 그리는 사람은 pick·draw 동안 글을 쓸 수 없다
  const me = meOf(state, meId);
  const hit = !!(me && me.hit === true && phase === 'draw');
  if (hit) return { show: true, enabled: true, placeholder: '맞힌 사람끼리만 보여요', hit: true };
  return { show: true, enabled: true, placeholder: phase === 'pick' ? '채팅' : '정답 입력', hit: false };
}

// 보낼 글. 제어 문자 제거 + 앞뒤 공백 제거 뒤 1~40자. 안 되면 null.
export function prepareText(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const n = [...t].length;
  if (n < CHAT.min || n > CHAT.max) return null;
  return t;
}

// 휴대폰 키보드: visualViewport 값으로 키보드 높이(px). 작은 흔들림은 0.
export function keyboardHeight(innerH, vvH, vvTop = 0) {
  if (!(innerH > 0) || !(vvH > 0)) return 0;
  const h = Math.round(innerH - vvH - (vvTop || 0));
  return h > 80 ? h : 0;
}
