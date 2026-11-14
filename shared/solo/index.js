// 혼자 놀기 종목 표 (docs/solo/PLAN.md 1-1). 표 순서 = 로비 순서. 새 종목은 여기 한 줄 + client/src/solo/games.js 한 줄.
// 틀(서버·화면)은 종목 이름을 모른다: 이 표만 읽는다. (이번 과제에서는 빈 표 — 종목 엔진이 생기면 연결 과제 L 이 채운다.)
export const SOLO = {};
export const IDS = Object.keys(SOLO);
export const NAMES = Object.fromEntries(IDS.map((id) => [id, SOLO[id].name]));
