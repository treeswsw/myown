// 갱스껄 상수 (GDD 1·2·3·9-4절). 이름·문구는 여기 한 곳.
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
// 색 번호 0~5 (이름만. 실제 색값은 화면 몫)
export const COLORS = Object.freeze(['초록', '보라', '노랑', '빨강', '파랑', '주황']);
// 원판 구성: 꽃(F) 3 + 해골(S) 1
export const DISCS = Object.freeze({ F: 3, S: 1 });
export const DISC_TOTAL = 4;
export const WIN_POINTS = 2;
// 연출 시간(서버가 잼)
export const REVEAL_MS = 3500; // 판정 뒤 피날레(해골 패배·성공)가 보일 시간
export const FLIP_MS = 1700; // 꽃 한 장 뒤집기 연출. 자동 공개 간격·판정 대기
export const TEASE_MS = 1400; // tease 이면 한 장당 추가
export const BETWEEN_MS = 1500;
export const AUTO_FLIP_MS = 500;
// 끊긴 지 이 시간이 지나면 기권 (사이트 공통 60초. 방이 다른 값을 넘겨도 된다)
export const GRACE_MS = 60_000;

export const ERRORS = Object.freeze({
  gk_off: '갱스껄은 지금 열려 있지 않습니다.',
  gk_now: '지금은 할 수 없습니다.',
  gk_turn: '내 차례가 아닙니다.',
  gk_bad: '잘못된 요청입니다.',
  gk_bid: '지금 숫자보다 크고 원판 합계 이하로 불러 주세요.',
  gk_color: '이미 다른 사람이 고른 색입니다.',
  gk_host: '방장만 할 수 있습니다.',
  gk_few: '3명 이상이 있어야 시작할 수 있습니다.',
  gk_hand: '손에 그 원판이 없습니다.',
});
export const errorMsg = (code) => ERRORS[code] ?? ERRORS.gk_bad;
