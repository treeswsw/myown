// 혼자 놀기 종목 "겉모습" 표 (id·이름·한 줄 설명). 엔진 없이 가볍게 불러오려고 따로 둔다:
// 공용 등록표(shared/games.js)·로비·대기실 설정이 이 파일만 읽어 첫 번들에 엔진이 딸려 들어가지 않는다.
// 표 순서 = 로비 순서. 새 종목은 여기 한 줄 + shared/solo/index.js 한 줄 + client/src/solo/games.js 한 줄.
// 엔진의 id·name·desc 와 같아야 한다(test/solo/meta.test.js 가 검사).
export const META = [
  { id: 'g2048', name: '2048', desc: '밀어서 같은 숫자를 합쳐 2048 을 만드세요' },
  { id: 'apple', name: '사과 게임', desc: '합이 10이 되게 묶기 · 2분' },
  { id: 'suika', name: '수박 게임', desc: '같은 과일을 붙여 수박까지 · 선을 넘으면 끝' },
];
export const IDS = META.map((m) => m.id);
export const NAMES = Object.fromEntries(META.map((m) => [m.id, m.name]));
export const DESCS = Object.fromEntries(META.map((m) => [m.id, m.desc]));
