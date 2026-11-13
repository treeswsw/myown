// 대기실 설정 스키마 (docs/COMMON-CONTRACT.md 4-3). 갱스껄은 방 설정이 없고 개인 칸(내 색 고르기)만 있다.
// 'gk-color' 는 화면 모듈(client/src/gsk/index.js)의 waitPart('gk-color') 가 그린다.
// 값은 wait.own[나].color(0~5 또는 null), 보낼 때는 {t:'pick', patch:{color}}.
export const SETTINGS = [];
export const OWN = [
  { k: 'color', label: '내 색 고르기', type: 'custom', part: 'gk-color' },
];
