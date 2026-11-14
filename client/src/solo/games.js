// 혼자 놀기 판 화면 불러오기 표 (docs/solo/PLAN.md 1-1·10절). 표 순서 = shared/solo/index.js 와 같게.
// 종목 하나 = 한 줄: id: () => import('./<id>/board.js')   (board.js 가 mountBoard(el, api) 를 내보낸다)
// 틀(index.js)은 이 표만 읽는다. 종목 폴더가 생기면 연결 과제(L)가 줄을 채운다.
export const BOARDS = {
  // g2048: () => import('./g2048/board.js'),
  // apple: () => import('./apple/board.js'),
  // suika: () => import('./suika/board.js'),
};
