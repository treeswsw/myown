// 치장템 목록 모음 (SPEC 22-16). 품목은 items/<slot>.js, 기준 문서는 docs/COIN-ITEMS.md.
import title from './items/title.js';
import hat from './items/hat.js';
import acc from './items/acc.js';
import face from './items/face.js';
import frame from './items/frame.js';
import color from './items/color.js';
import suit from './items/suit.js';

export const SLOTS = ['title', 'hat', 'acc', 'face', 'frame', 'color', 'suit'];

export const GRADES = [
  { g: 0, name: '잡템', color: '#9a9a9a' },
  { g: 1, name: '흔템', color: '#3d8bff' },
  { g: 2, name: '컨셉', color: '#b45cff' },
  { g: 3, name: '레전드', color: '#ffc93c' },
  { g: 4, name: '갱식', color: 'rainbow' },
];

export const ITEMS = [...title, ...hat, ...acc, ...face, ...frame, ...color, ...suit];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function item(id) {
  return typeof id === 'string' ? BY_ID.get(id) || null : null;
}
