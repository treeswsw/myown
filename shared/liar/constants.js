// 라이어게임 규칙 상수 (GDD 4-2, 4-1, 5-3 / PLAN 1-7). 시간 단위는 초, 글자 수는 문자(코드포인트) 수.
// 서버와 화면이 함께 쓰므로 node 전용 모듈을 쓰지 않는다.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  REVEAL: 'reveal',
  SPEAK: 'speak',
  DISCUSS: 'discuss',
  REVOTE: 'revote',
  DEFENSE: 'defense',
  JUDGE: 'judge',
  JUDGED: 'judged',
  UNMASK: 'unmask',
  GUESS: 'guess',
  RESULT: 'result',
});

// 방장이 바꿀 수 있는 시간의 기본값 (GDD 4-2)
export const DEFAULT_TIMES = Object.freeze({
  speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 15, guess: 15,
});

// 고를 수 있는 값 (GDD 4-2)
export const TIME_CHOICES = Object.freeze({
  speak: Object.freeze([20, 30, 45, 60]),
  discuss: Object.freeze([60, 90, 120, 180]),
  rediscuss: Object.freeze([30, 60, 90]),
  defense: Object.freeze([15, 20, 30]),
  judge: Object.freeze([10, 15, 20]),
  guess: Object.freeze([10, 15, 30]),
});

// 설정이 없는 고정 시간 (GDD 4-2 아래 "고정")
export const FIXED_TIMES = Object.freeze({
  reveal: 8,
  revote: 30,
  judged: 3,
  unmaskLiar: 6,      // 라이어 처형
  unmaskCitizen: 11,  // 시민 처형 (두 줄 6초 + 라이어 클로즈업 5초)
  unmaskFail: 5,      // 지목 실패 (라이어 클로즈업만)
});

// 글자 수 제한 (GDD 9-1)
export const LIMITS = Object.freeze({ say: 80, chat: 80, guess: 30 });

// 첫 토론·투표는 시작 후 이 시간(초)이 지나기 전에는 단축하지 않는다 (GDD 4-1의 4)
export const DISCUSS_FLOOR = 30;
// 전원이 고르면 남은 시간을 이 값(초)으로 줄인다
export const SHORTEN_TO = 5;

export const GOAL_CHOICES = Object.freeze([0, 10, 15, 20]);

export const LIAR_MODES = Object.freeze(['word', 'notice']);

// 이름표·마네킹 고유 색 8개
export const COLORS = Object.freeze([
  '#e5484d', '#f5a524', '#f7e04a', '#46c26a', '#2fb7c9', '#4d7cff', '#a35cf0', '#ef6fb1',
]);
