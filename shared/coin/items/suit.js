// 정장 (docs/COIN-ITEMS.md 와 같게 유지, SPEC 22-16)
export default [
  { id: "suit.navy", slot: "suit", g: 0, name: "남색 정장", shop: true, price: 20, cap: true, v: { suit: 0x1c2a4a, tie: 0xd8353c } },
  { id: "suit.gray", slot: "suit", g: 0, name: "회색 정장", shop: true, price: 30, cap: true, v: { suit: 0x6b7280, tie: 0x1f2937 } },
  { id: "suit.wine", slot: "suit", g: 1, name: "와인 정장", shop: true, price: 80, cap: true, v: { suit: 0x6d1a2b, tie: 0xe8d9a0 } },
  { id: "suit.white", slot: "suit", g: 1, name: "흰색 정장", shop: true, price: 90, cap: true, v: { suit: 0xf0f0f0, tie: 0x2a2a2a } },
  { id: "suit.tuxedo", slot: "suit", g: 2, name: "검정 턱시도", shop: false, cap: true, v: { suit: 0x111114, tie: 0xf5f5f5 } },
  { id: "suit.gold", slot: "suit", g: 3, name: "황금 정장", shop: false, cap: true, v: { suit: 0xd4a017, tie: 0x3a2a00 } },
  { id: "suit.boss", slot: "suit", g: 4, name: "갱식 사장 정장", shop: false, cap: true, v: { suit: 0x1a0f2e, tie: 0xffc93c } },
];
