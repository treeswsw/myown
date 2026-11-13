// 테두리 (docs/COIN-ITEMS.md 와 같게 유지, SPEC 22-16)
export default [
  { id: "frame.silver", slot: "frame", g: 0, name: "은빛 테두리", shop: true, price: 20, cap: true, v: { hex: 0xc0c8d4 } },
  { id: "frame.ice", slot: "frame", g: 1, name: "얼음 테두리", shop: true, price: 80, cap: true, v: { hex: 0x9fe4ff } },
  { id: "frame.ruby", slot: "frame", g: 1, name: "루비 테두리", shop: true, price: 90, cap: true, v: { hex: 0xe0115f } },
  { id: "frame.neon", slot: "frame", g: 2, name: "네온 테두리", shop: false, cap: true, v: { hex: 0x39ff14, fx: "blink" } },
  { id: "frame.platinum", slot: "frame", g: 3, name: "백금 테두리", shop: false, cap: true, v: { hex: 0xe5e4e2, fx: "spin" } },
  { id: "frame.rainbow", slot: "frame", g: 4, name: "무지개 테두리", shop: false, cap: true, v: { hex: 0xff6ad5, fx: "rainbow" } },
];
