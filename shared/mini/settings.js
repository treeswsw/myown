// 대기실 설정 스키마 (docs/COMMON-CONTRACT.md 4-3, docs/mini/PLAN.md 5절).
// 로비가 불러오는 파일이라 규칙 파일(index.js)을 끌어오지 않는다. 종목 목록은 shared/mini/index.js 와 같아야 한다(test/mini/room.test.js 가 비교).
// 방 설정(방장, {t:'set', patch}):
//   kind  종목 방식 'fixed'(한 종목 고정) | 'random'(고른 종목 중 매 판 무작위) | 'order'(고른 종목을 목록 순서로 매 판)
//   game  fixed 일 때의 종목      games  random·order 일 때 고른 종목들(2개 이상)
//   rule  오목 규칙 'free'(제한 없음) | 'renju'(렌주룰)      len  승부 방식 1(단판) | 3(3판 2선승) | 5(5판 3선승)
// 개인 칸(본인, {t:'pick', patch:{bet}}): bet = 건 코인 수(0 이상 정수, 가진 코인 이하). 화면은 waitPart('mn-bet').
export const GAME_OPTS = [['gomoku', '오목'], ['reversi', '리버시'], ['checkers', '체커'], ['chess', '체스'], ['connect4', '커넥트포']];
export const KINDS = ['fixed', 'random', 'order'];
export const LENS = [1, 3, 5];
export const DEFAULTS = { kind: 'fixed', rule: 'free', len: 1 };
const hasGomoku = (s) => (s.kind === 'fixed' || !s.kind ? s.game === 'gomoku' : (s.games ?? []).includes('gomoku'));

export const SETTINGS = [
  { k: 'kind', label: '종목 방식', group: '게임', type: 'seg', opts: [['fixed', '한 종목'], ['random', '랜덤'], ['order', '순서대로']] },
  { k: 'game', label: '종목', group: '게임', type: 'seg', when: (s) => !s.kind || s.kind === 'fixed', opts: GAME_OPTS },
  { k: 'games', label: '종목 (2개 이상)', group: '게임', type: 'multi', when: (s) => s.kind === 'random' || s.kind === 'order', opts: GAME_OPTS },
  { k: 'len', label: '승부 방식', group: '게임', type: 'seg', opts: [[1, '단판'], [3, '3판 2선승'], [5, '5판 3선승']] },
  { k: 'rule', label: '오목 규칙', group: '규칙', type: 'seg', when: hasGomoku, opts: [['free', '제한 없음'], ['renju', '렌주룰']] },
  { type: 'info', group: '게임', rows: [['인원', '2명이 겨루고 나머지는 구경']] },
];
export const OWN = [
  { k: 'bet', label: '코인 베팅', type: 'custom', part: 'mn-bet' },
];
