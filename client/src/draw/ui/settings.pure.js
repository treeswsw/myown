// 방 대기 설정의 계산 (DOM 없음). docs/draw/GDD.md 3-3, 5, 7, 8절⑧, 10-2, 10-4.
import {
  MIN_PLAYERS, MAX_PLAYERS, ORDER_CHOICES, ROUND_CHOICES, TIME_CHOICES, WORD_CHOICES,
} from '../../../../shared/draw/constants.js';
import { checkDr } from '../../../../shared/draw/protocol.js';

export const ORDER_LABELS = Object.freeze({ seq: '순서대로', hit: '맞힌 사람', rand: '랜덤' });
export const ORDER_HINTS = Object.freeze({
  seq: '자리 순서대로 돌아가며 그려요',
  hit: '방금 문제를 먼저 맞힌 사람이 그려요',
  rand: '아직 안 그린 사람 중 무작위로 그려요',
});
export const START_MSG = Object.freeze({ t: 'start' }); // GDD 10-2: 시작은 기존 start

export { ORDER_CHOICES, ROUND_CHOICES, TIME_CHOICES };

// 45 → '45초', 140 → '2분 20초', 120 → '2분'
export function timeLabel(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s + '초';
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

// 방 대기에서 방장만 바꿀 수 있다.
export function isHost(state) {
  return !!state && state.hostId != null && state.hostId === state.you;
}
export function canEdit(state) {
  return isHost(state) && state.phase === 'lobby';
}
// 내보내기: 방장이, 방 대기에서, 자기가 아닌 사람에게만
export function canKick(state, id) {
  return canEdit(state) && id !== state.you && !!(state.players || []).some((p) => p.id === id);
}

export function connectedCount(state) {
  return ((state && state.players) || []).filter((p) => p.connected !== false).length;
}

// 주제 하나를 켜고 끈 새 배열(고를 수 있는 주제 순서대로). 마지막 켜진 하나를 끄려 하거나 없는 이름이면 null(= 안 보냄).
export function toggleTopic(settings, name) {
  if (!settings || !Array.isArray(settings.allTopics) || !Array.isArray(settings.topics)) return null;
  if (!settings.allTopics.includes(name)) return null;
  const on = settings.topics.filter((t) => settings.allTopics.includes(t));
  if (on.includes(name)) {
    if (on.length <= 1) return null;
    return settings.allTopics.filter((t) => t !== name && on.includes(t));
  }
  return settings.allTopics.filter((t) => t === name || on.includes(t));
}
// 그 주제가 켜진 마지막 하나인가(끌 수 없다)
export function isLastTopic(settings, name) {
  if (!settings || !Array.isArray(settings.topics)) return false;
  return settings.topics.length <= 1 && settings.topics.includes(name);
}

// 시작 버튼 상태. { show, enabled, note }  note = 안내 문구('' 이면 없음)
export function startState(state) {
  if (!state || state.phase !== 'lobby') return { show: false, enabled: false, note: '' };
  const n = connectedCount(state);
  const topicsOn = state.settings && Array.isArray(state.settings.topics) ? state.settings.topics.length : 0;
  if (!isHost(state)) return { show: true, enabled: false, note: '방장이 시작해요.' };
  if (n < MIN_PLAYERS) return { show: true, enabled: false, note: `${MIN_PLAYERS}명 이상 모이면 시작할 수 있어요.` };
  if (topicsOn < 1) return { show: true, enabled: false, note: '주제를 하나 이상 켜 주세요.' };
  return { show: true, enabled: true, note: '' };
}

// 요약 한 줄: '5명 × 2라운드 = 문제 10개 · 단어 3개 중 고르기 · 글자 수 표시'
export function summaryLine(state) {
  const st = (state && state.settings) || {};
  const n = ((state && state.players) || []).length;
  const rounds = st.rounds || 0;
  return `${n}명 × ${rounds}라운드 = 문제 ${n * rounds}개 · 단어 ${WORD_CHOICES}개 중 고르기 · 글자 수 ${st.len ? '표시' : '숨김'}`;
}

// 참가자 칸 "5 / 8"
export function seatsLabel(state) {
  return `${((state && state.players) || []).length} / ${MAX_PLAYERS}`;
}

// 프로필 사진이 없을 때 쓰는 동그라미 색(자리 번호별)
const FACE_COLORS = ['#b8651b', '#2f6fdd', '#1fa34a', '#d6446c', '#8b45d1', '#0f9fb0', '#c98a00', '#6b7280'];
export function faceColor(seat) {
  const i = Number.isInteger(seat) ? ((seat % FACE_COLORS.length) + FACE_COLORS.length) % FACE_COLORS.length : 0;
  return FACE_COLORS[i];
}
export function initial(name) {
  const c = [...String(name == null ? '' : name).trim()][0];
  return c || '?';
}

// 보낼 요청 만들기. 못 보내는 것(방장 아님·값 오류)은 null. 검사는 shared/draw/protocol.js checkDr 와 같다.
export function settingsMsg(state, patch) {
  if (!canEdit(state) || !patch || typeof patch !== 'object') return null;
  const r = checkDr({ a: 'settings', ...patch });
  return r.ok ? { t: 'dr', ...r.msg } : null;
}
export function topicMsg(state, name) {
  if (!state) return null;
  const next = toggleTopic(state.settings, name);
  return next ? settingsMsg(state, { topics: next }) : null;
}
export function kickMsg(state, id) {
  if (!canKick(state, id)) return null;
  const r = checkDr({ a: 'kick', id });
  return r.ok ? { t: 'dr', ...r.msg } : null;
}
// 시작 요청(누를 수 있을 때만)
export function startMsg(state) {
  return startState(state).enabled ? { ...START_MSG } : null;
}
