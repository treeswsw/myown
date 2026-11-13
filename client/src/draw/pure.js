// 갱식마인드 입구(index.js)의 순수 계산. DOM·window 를 만지지 않아 node 시험에서 불러올 수 있다.
import { toolsVisible, normalizeTool } from './ui/tools.pure.js';
import { logMode, iAmDrawer } from './ui/players.pure.js';
import { keyboardHeight } from './ui/hud.pure.js';

// ---- 화면 배치 판정 (GDD 7절: 높이 480px 이하이면 휴대폰 가로 배치) ----
export const PHONE_MAX_H = 480;
export function layoutFor(innerH) {
  return Number.isFinite(innerH) && innerH > 0 && innerH <= PHONE_MAX_H ? 'phone' : 'wide';
}

// 휴대폰에서 키보드가 올라와 보이는 높이가 줄었는가
export function keyboardUp(layout, innerH, vvH, vvTop = 0) {
  return layout === 'phone' && keyboardHeight(innerH, vvH, vvTop) > 0;
}

// ---- ctx.tool (GDD 11-2): { get(), set(patch), on(fn) → off } ----
export const TOOL_DEFAULT = Object.freeze({ tool: 'pen', color: 0, penW: 10, eraseW: 24 });
export function createToolStore(initial) {
  let cur = normalizeTool({ ...TOOL_DEFAULT, ...(initial || {}) });
  const fns = new Set();
  return {
    get: () => ({ ...cur }),
    set(patch) {
      const next = normalizeTool({ ...cur, ...(patch && typeof patch === 'object' ? patch : {}) });
      if (JSON.stringify(next) === JSON.stringify(cur)) return;
      cur = next;
      for (const fn of [...fns]) { try { fn({ ...cur }); } catch (_) { /* 한 구독자의 오류가 나머지를 막지 않게 */ } }
    },
    on(fn) {
      if (typeof fn !== 'function') return () => {};
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

// ---- 이벤트 나눠 주기 (GDD 10-5). 모듈 이름 목록을 돌려준다. 모르는 k 는 모두에게(모듈이 알아서 무시) ----
export const MODULES = Object.freeze(['board', 'tools', 'hud', 'players', 'settings', 'result']);
const ROUTES = {
  drSt: ['board'], drPt: ['board'], drCx: ['board'], drRm: ['board'],
  drUndo: ['board'], drRedo: ['board'], drClear: ['board'], drSync: ['board'],
  drNew: ['board', 'hud', 'players', 'result'],
  drHit: ['players'],
  chat: ['players'], chatLog: ['players'],
  faces: ['players'], left: ['players'],
  joined: [], away: [], back: [],
};
export function routesFor(e) {
  const k = e && typeof e.k === 'string' ? e.k : null;
  if (!k) return [];
  return Object.prototype.hasOwnProperty.call(ROUTES, k) ? ROUTES[k] : [...MODULES];
}

// ---- 루트 요소에 붙일 상태 클래스 (draw.css 가 이것만 보고 배치한다) ----
//   dr-wide|dr-phone / dr-ph-<단계> / dr-tools(내가 그리는 중)|dr-plain / dr-lg-<full|small|hidden>(채팅 기록 칸) / dr-kb
export function rootClasses({ state, meId, layout, kb }) {
  const lay = layout === 'phone' ? 'phone' : 'wide';
  const out = [`dr-${lay}`];
  if (state) {
    out.push(`dr-ph-${state.phase}`);
    out.push(toolsVisible(state, meId) ? 'dr-tools' : 'dr-plain');
    out.push(`dr-lg-${logMode(lay, iAmDrawer(state, meId))}`);
  }
  if (kb && lay === 'phone') out.push('dr-kb');
  return out;
}

// ---- 소리 고르기 ----
// 방 상태가 바뀔 때 (prev → next). 없으면 null.
export function soundForRoom(prev, next, meId) {
  if (!next || !meId) return null;
  if (next.drawerId === meId && next.phase === 'pick'
    && (!prev || prev.phase !== 'pick' || prev.drawerId !== meId || prev.q !== next.q)) return 'myTurn';
  if (prev && prev.phase === 'draw' && next.phase === 'reveal' && next.reveal && next.reveal.why === 'time') return 'timeUp';
  return null;
}

// 알림 하나. 내가 맞히면 'correct', 남이 맞히면 작은 'hit'.
export function soundForEvent(e, meId) {
  if (!e || e.k !== 'drHit') return null;
  return e.id === meId ? 'correct' : 'hit';
}

// 10초 남음: 한 문제에 한 번만. 울려야 하면 그 문제의 열쇠(문자열)를, 아니면 null.
export function tenSecondsKey(state, nowMs, firedKey) {
  if (!state || state.phase !== 'draw' || !Number.isFinite(state.endsAt) || !Number.isFinite(nowMs)) return null;
  const remain = state.endsAt - nowMs;
  if (!(remain > 0 && remain <= 10000)) return null;
  const key = `${state.roundNo}:${state.q}`;
  return key === firedKey ? null : key;
}

// 서버 시각 보정: 상태에 now(서버 epochMs)가 있으면 그것과 내 시계의 차이. 없으면 이전 값 유지.
export function clockOffset(state, localNow, prev = 0) {
  return state && Number.isFinite(state.now) ? state.now - localNow : prev;
}

// ---- 휴대폰 가로 메뉴 버튼(≡): 게임 진행 중(pick·draw·reveal)의 휴대폰 배치에서만 보인다(그 밖에는 사이트 상단 줄이 있다) ----
export function menuVisible(layout, state) {
  return layout === 'phone' && !!state && (state.phase === 'pick' || state.phase === 'draw' || state.phase === 'reveal');
}

// 메뉴 창 항목 이름 순서. 이모티콘은 콜백이 있을 때만.
export function menuItems(hasEmote) {
  return hasEmote ? ['emote', 'leave'] : ['leave'];
}
