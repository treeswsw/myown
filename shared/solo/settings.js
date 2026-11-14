// 혼자 놀기 대기실 설정 (docs/COMMON-CONTRACT.md 4-3). 종목 고르기 한 칸 `game`. 옵션은 종목 표에서 나온다.
import { IDS, NAMES } from './meta.js';

export const SETTINGS = [
  { k: 'game', label: '종목', group: '게임', type: 'seg', opts: () => IDS.map((id) => [id, NAMES[id]]) },
  { type: 'info', group: '게임', rows: [['인원', '1명이 하고 나머지는 구경']] },
];
export const OWN = [];
