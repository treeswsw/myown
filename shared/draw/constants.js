// 갱식마인드 규칙 상수 (docs/draw/GDD.md 3·4·6·8·10절). 순수 데이터. 시간 단위: 초(별도 표기 없으면).
// 서버와 화면이 함께 쓰므로 node 전용 모듈을 쓰지 않는다.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  PICK: 'pick',
  DRAW: 'draw',
  REVEAL: 'reveal',
  FINAL: 'final',
});

// 색 12개 (6-2절 표 순서. 색 번호 c = 인덱스 0..11). 종이 색은 PAPER_COLOR
export const COLORS = Object.freeze([
  Object.freeze({ name: '검정', value: '#1c1c1e' }),
  Object.freeze({ name: '회색', value: '#8e8e93' }),
  Object.freeze({ name: '갈색', value: '#8a5a2b' }),
  Object.freeze({ name: '살구', value: '#f5c9a3' }),
  Object.freeze({ name: '빨강', value: '#e5352b' }),
  Object.freeze({ name: '주황', value: '#ff8a1f' }),
  Object.freeze({ name: '노랑', value: '#ffd426' }),
  Object.freeze({ name: '초록', value: '#1fa34a' }),
  Object.freeze({ name: '하늘', value: '#3bb8f5' }),
  Object.freeze({ name: '파랑', value: '#1f55d6' }),
  Object.freeze({ name: '보라', value: '#8b45d1' }),
  Object.freeze({ name: '분홍', value: '#ff7eb8' }),
]);
export const COLOR_COUNT = COLORS.length; // 12
export const PAPER_COLOR = '#fffdf8';

// 굵기 (800×600 기준 px)
export const WIDTH_MIN = 2;
export const WIDTH_MAX = 40;
export const WIDTH_QUICK = Object.freeze([4, 10, 24]); // 가늘게 / 보통 / 굵게
export const PEN_WIDTH_DEFAULT = 10;
export const ERASER_WIDTH_DEFAULT = 24;
export const STROKE_ERASER_RADIUS = 8; // 획 지우개 닿는 범위 반지름(800 기준 px)

// 좌표 (그림판 4:3, 내부 1600×1200)
export const CANVAS_W = 1600;
export const CANVAS_H = 1200;
export const DELTA_MAX = 1600; // pt 차이값 범위 -1600..1600

// 선 보내기·그리기 (6-3절, 10-1절)
export const MAX_NUMS_PER_MSG = 128; // 한 메시지에 숫자 128개 = 64점
export const MAX_POINTS_PER_MSG = 64;
export const SEND_INTERVAL_MS = 60;
export const MIN_POINT_GAP = 2; // 800 기준 px, 이보다 가까운 점은 버림
export const SMOOTH_FINGER = 0.65; // 새 점 = 앞 점 35% + 손 65%
export const SMOOTH_PEN = 1; // 펜슬은 보정 없음
export const DPR_MAX = 2;
export const PALM_MAX_CONTACT = 60; // px, 이보다 넓은 닿음은 무시

// 한 문제의 그림 한도 (10-1절)
export const MAX_OPS = 600;
export const MAX_POINTS_TOTAL = 60000;
export const MAX_POINTS_PER_STROKE = 4000;
export const MAX_RM_IDS = 50;
export const UNDO_SNAPSHOT_EVERY = 20; // 선 20개마다 중간 그림 저장

// 시간(초) (4절, 3-4절, 8절)
export const TIMES = Object.freeze({
  pick: 10, // 단어 고르기
  reveal: 5, // 정답 공개
  rush: 30, // 첫 정답 뒤 남은 시간 상한
  idle: 20, // 시작 후 첫 선이 없으면 넘김
  drawerAway: 15, // 그리는 사람 끊김 대기
  seatKeep: 60, // 맞히는 사람 끊김 자리 유지(기존 규칙)
});

// 방장이 고르는 값 (3-3절, 10-2절)
export const TIME_CHOICES = Object.freeze([60, 90, 140]); // 그리는 시간
export const TIME_DEFAULT = 140;
export const ROUND_CHOICES = Object.freeze([1, 2, 3, 5]);
export const ROUNDS_DEFAULT = 2;
export const ORDER_CHOICES = Object.freeze(['seq', 'hit', 'rand']);
export const ORDER_DEFAULT = 'seq';
export const LEN_DEFAULT = false; // 글자 수 칸 표시

export const WORD_CHOICES = 3; // 단어 후보 개수

// 기본으로 켜는/끄는 주제 (5절)
export const TOPICS_ON = Object.freeze(['음식', '동물', '직업', '장소', '스포츠', '물건', '취미', '탈것']);
export const TOPICS_OFF = Object.freeze(['영화·만화', '나라·도시', '인물']);

// 점수 (3-4절): 맞힌 사람 = 40 + 60 × (남은 시간 ÷ 그리는 시간) (+ 첫 정답 20), 그린 사람 = 100 × (맞힌 수 ÷ 맞힐 수 있던 수)
export const SCORE = Object.freeze({
  guessBase: 40,
  guessSpeed: 60,
  firstBonus: 20,
  drawerMax: 100,
});

// 채팅 (9절, 10-6절)
export const CHAT = Object.freeze({
  min: 1,
  max: 40,
  perSec: 3,
  perSecMs: 1000,
  per10s: 15,
  per10sMs: 10000,
  recent: 30, // 입장·재접속 때 주는 최근 기록 수
});

// 말풍선 표시 시간(ms) (7절)
export const BUBBLE_MS = 3500;

// 요청 봉투·글자 한도 (10-2절)
export const ACT_MAX = 20;
export const ID_MAX = 40;
export const TOPIC_NAME_MAX = 20;
export const TOPICS_MAX = 30; // 주제 이름 배열 길이 상한(주제는 11개)
