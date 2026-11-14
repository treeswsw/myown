// 혼자 놀기 종목 엔진 표 (docs/solo/PLAN.md 1-1). 표 순서 = 로비 순서(meta.js 와 같게). 서버 방과 판 화면 틀이 읽는다.
// 이름·id 만 필요한 곳(등록표·로비·설정)은 가벼운 ./meta.js 를 읽는다 — 엔진을 첫 번들에 넣지 않으려고.
import g2048 from './g2048.js';
import apple from './apple.js';
import suika from './suika.js';
import { IDS, NAMES } from './meta.js';

export const SOLO = { g2048, apple, suika };
export { IDS, NAMES };
