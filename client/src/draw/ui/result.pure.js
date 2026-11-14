// 고르기·정답 공개의 계산 (DOM 없음). docs/draw/GDD.md 4·7·10-2·10-4절.
// 약속: 단어 후보(choices)는 "그리는 사람의 pick 단계"에서만 읽는다. 그 밖에는 빈 배열.
import { WORD_CHOICES } from '../../../../shared/draw/constants.js';

const MINUS = '−';

/** 점수 표시: 양수 +n, 음수 −n, 0 은 0. */
export function fmtPts(n) {
  const v = Math.round(Number(n)) || 0;
  return v > 0 ? `+${v}` : v < 0 ? `${MINUS}${-v}` : '0';
}

/** 남은 초(올림, 0 이상). endsAt 이 없으면 null. */
export function secondsLeft(endsAt, nowMs) {
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return null;
  return Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
}

/** 'm:ss' */
export function clockText(sec) {
  if (sec == null) return '';
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** id 의 이름 (players 에서). 없으면 '?'. 사용자 글자이므로 호출하는 쪽이 textContent 로 넣는다. */
export function nameOf(state, id) {
  const p = state && Array.isArray(state.players) ? state.players.find((x) => x && x.id === id) : null;
  return p && typeof p.name === 'string' && p.name ? p.name : '?';
}

/**
 * 지금 이 화면 모듈이 무엇을 보여 줄지.
 * kind: 'none' | 'pick-drawer' | 'pick-wait' | 'reveal'
 */
export function viewMode(state, meId) {
  if (!state || typeof state !== 'object') return { kind: 'none' };
  switch (state.phase) {
    case 'pick':
      return state.drawerId != null && state.drawerId === meId ? { kind: 'pick-drawer' } : { kind: 'pick-wait' };
    case 'reveal':
      return state.reveal ? { kind: 'reveal' } : { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}

/**
 * 단어 카드 [{i, word, topic}]. ★ 그리는 사람 본인의 pick 단계가 아니면 항상 빈 배열.
 * (서버도 다른 사람에게 choices 를 주지 않지만, 화면도 이 경로 말고는 읽지 않는다.)
 */
export function pickCards(state, meId) {
  if (viewMode(state, meId).kind !== 'pick-drawer') return [];
  const c = state.choices;
  if (!Array.isArray(c)) return [];
  return c.slice(0, WORD_CHOICES).map((x, i) => ({
    i, word: x && typeof x.w === 'string' ? x.w : '', topic: x && typeof x.topic === 'string' ? x.topic : '',
  }));
}

/** 단어 고르기 요청 (GDD 10-2). 범위 밖이면 null. */
export function pickMessage(i) {
  return Number.isInteger(i) && i >= 0 && i < WORD_CHOICES ? { t: 'dr', a: 'pick', i } : null;
}

/** "○○ 님이 단어를 고르는 중" (이름은 호출하는 쪽이 textContent 로 넣을 글자). */
export function waitPickText(state) {
  return `${nameOf(state, state && state.drawerId)} 님이 단어를 고르는 중`;
}

/** 끝난 이유 문구 {title, sub}. hits = 맞힌 사람 수. */
export function whyText(why, hits = 0) {
  switch (why) {
    case 'all': return { title: '모두 맞혔어요!', sub: '정답은' };
    case 'time': return hits > 0 ? { title: '시간이 끝났어요', sub: '정답은' } : { title: '시간 끝!', sub: '정답은' };
    case 'give': return { title: '그린 사람이 포기했어요', sub: '정답은' };
    case 'idle': return { title: '그림이 시작되지 않아 넘겼어요', sub: '정답은' };
    case 'skip': return { title: '방장이 넘겼어요', sub: '정답은' };
    case 'left': return { title: '그린 사람이 나갔어요', sub: '정답은' };
    default: return { title: '문제가 끝났어요', sub: '정답은' };
  }
}

/**
 * 정답 공개 카드 내용.
 * { word, title, sub, summary, gains:[{id,name,pts,ptsText,order}], drawer:{id,name,pts,ptsText}|null, next:{id,name}|null }
 * gains 는 맞힌 순서(order)대로.
 */
export function revealView(state) {
  const r = state && state.reveal;
  if (!r) return null;
  const list = Array.isArray(r.gains) ? r.gains : [];
  const gains = list
    .map((g) => ({ id: g.id, name: nameOf(state, g.id), pts: g.pts, ptsText: fmtPts(g.pts), order: g.order }))
    .sort((a, b) => a.order - b.order);
  const hits = gains.length;
  const guessers = Number(r.guessers) || 0;
  const t = whyText(r.why, hits);
  const drawerId = state.drawerId != null ? state.drawerId : null;
  const drawer = drawerId != null
    ? { id: drawerId, name: nameOf(state, drawerId), pts: r.drawerPts || 0, ptsText: fmtPts(r.drawerPts || 0) }
    : null;
  return {
    word: typeof r.word === 'string' ? r.word : '',
    title: t.title,
    sub: t.sub,
    summary: guessers > 0 ? `${guessers}명 중 ${hits}명이 맞혔어요` : '',
    gains,
    drawer,
    next: r.nextId != null ? { id: r.nextId, name: nameOf(state, r.nextId) } : null,
  };
}
