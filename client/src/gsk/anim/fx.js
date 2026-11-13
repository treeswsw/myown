// [임시 껍데기] 연출 모듈 자리. 진짜 anim/fx.js 가 병합 때 이 파일을 덮어쓴다.
// 약속: createFx(parent, ctx) → { flip(e, ctx), place(e, ctx), reveal(e, ctx) (모두 Promise), busy(), dispose() }.
export function createFx() {
  return {
    el: null,
    flip: async () => {},
    place: async () => {},
    reveal: async () => {},
    busy: () => false,
    update() {},
    event() {},
    dispose() {},
  };
}
