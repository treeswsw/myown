// 갱식마인드 대기실 설정 스키마 (docs/COMMON-CONTRACT.md 4-3). 서버 wait.set(waitInfo)의 칸과 같은 이름이다.
// 값 범위는 constants.js 와 같고, 서버 검사는 shared/draw/game.js setSettings 가 한다. DOM·node 없음.
import { ORDER_CHOICES, ROUND_CHOICES, TIME_CHOICES, MIN_PLAYERS, MAX_PLAYERS, WORD_CHOICES } from './constants.js';

const ORDER_LABELS = { seq: '순서대로', hit: '맞힌 사람', rand: '랜덤' };

// 45 → '45초', 140 → '2분 20초', 120 → '2분'
export function timeLabel(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

export const SETTINGS = [
  { type: 'info', rows: [['인원', `${MIN_PLAYERS}~${MAX_PLAYERS}명`], ['단어', `${WORD_CHOICES}개 중 고르기`]] },
  { k: 'order', label: '출제 순서', group: '규칙', type: 'seg', opts: ORDER_CHOICES.map((v) => [v, ORDER_LABELS[v]]) },
  { k: 'rounds', label: '라운드 수', group: '규칙', type: 'seg', opts: ROUND_CHOICES.map((v) => [v, `${v}`]) },
  { k: 'len', label: '글자 수 칸', group: '규칙', type: 'seg', opts: [[true, '켜기'], [false, '끄기']] },
  { k: 'time', label: '그리는 시간', group: '시간', type: 'seg', opts: TIME_CHOICES.map((v) => [v, timeLabel(v)]) },
  { k: 'topics', label: '주제', group: '주제', type: 'multi', opts: (set) => (set?.allTopics ?? []).map((n) => [n, n]), get: (set) => set?.topics ?? [] },
];
export const OWN = [];
