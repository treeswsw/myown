// 글자 색 (docs/COIN-ITEMS.md 와 같게 유지, SPEC 22-16)
export default [
  { id: "color.sky", slot: "color", g: 0, name: "하늘색 글자", shop: true, price: 20, cap: true, v: { hex: 0x5ab4ff } },
  { id: "color.mint", slot: "color", g: 0, name: "민트 글자", shop: true, price: 30, cap: true, v: { hex: 0x7fe8c4 } },
  { id: "color.rose", slot: "color", g: 1, name: "분홍색 글자", shop: true, price: 80, cap: true, v: { hex: 0xff6fa8 } },
  { id: "color.coral", slot: "color", g: 1, name: "산호 글자", shop: true, price: 90, cap: true, v: { hex: 0xff7f6e } },
  { id: "color.ice", slot: "color", g: 2, name: "얼음 글자", shop: false, cap: true, v: { hex: 0xbfefff, fx: "sparkle" } },
  { id: "color.gold", slot: "color", g: 3, name: "황금 글자", shop: false, cap: true, v: { hex: 0xffc93c } },
  { id: "color.rainbow", slot: "color", g: 4, name: "무지개 글자", shop: false, cap: true, v: { hex: 0xff6ad5, fx: "rainbow" } },
];
