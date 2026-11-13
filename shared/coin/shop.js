// 상점 목록 (SPEC 22-5). 지금은 임시 품목.
export const SLOTS = ['title', 'frame', 'color', 'suit'];

export const ITEMS = [
  { id: 'title.rookie', slot: 'title', name: '새내기', price: 20, v: { text: '새내기' } },
  { id: 'title.veteran', slot: 'title', name: '고인물', price: 100, v: { text: '고인물' } },
  { id: 'frame.silver', slot: 'frame', name: '은빛 테두리', price: 40, v: { hex: 0xc0c8d4 } },
  { id: 'frame.gold', slot: 'frame', name: '금빛 테두리', price: 150, v: { hex: 0xffc93c } },
  { id: 'color.sky', slot: 'color', name: '하늘색 글자', price: 30, v: { hex: 0x5ab4ff } },
  { id: 'color.rose', slot: 'color', name: '분홍색 글자', price: 80, v: { hex: 0xff6fa8 } },
  { id: 'suit.navy', slot: 'suit', name: '남색 정장', price: 60, v: { suit: 0x1c2a4a, tie: 0xd8353c } },
  { id: 'suit.white', slot: 'suit', name: '흰색 정장', price: 200, v: { suit: 0xf0f0f0, tie: 0x2a2a2a } },
  // 뽑기 전용 (상점에서 팔지 않음)
  { id: 'title.jackpot', slot: 'title', name: '잭팟의 주인', price: 0, shop: false, v: { text: '잭팟의 주인' } },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function item(id) {
  return typeof id === 'string' ? BY_ID.get(id) || null : null;
}
