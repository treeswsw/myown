// 대기실 설정 스키마 (docs/COMMON-CONTRACT.md 4-3). 종목 고르기 = 방장이 `set` {game}. 개인 칸 없음(베팅은 다음 묶음).
// 로비가 불러오는 파일이라 규칙 파일(index.js)을 끌어오지 않는다. 종목 목록은 shared/mini/index.js 와 같아야 한다(test/mini/room.test.js 가 비교).
export const SETTINGS = [
  {
    k: 'game', label: '종목', group: '게임', type: 'seg',
    opts: [['gomoku', '오목'], ['reversi', '리버시'], ['checkers', '체커'], ['chess', '체스'], ['connect4', '커넥트포']],
  },
  { type: 'info', group: '게임', rows: [['인원', '2명이 겨루고 나머지는 구경']] },
];
export const OWN = [];
