// seed 난수 (mulberry32). 정수 연산(Math.imul, >>>)만 써서 서버·화면·모든 브라우저가 같은 수를 낸다. Math.random 금지.
// makeRng(seed) -> { s 상태(uint32), next() uint32, int(n) 0..n-1 }. 엔진 state 안에 든다(상태는 s 하나).
export function makeRng(seed) {
  const r = {
    s: seed >>> 0,
    next() {
      r.s = (r.s + 0x6d2b79f5) >>> 0;
      let t = r.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    },
    int(n) { return Math.floor(r.next() / 4294967296 * n); },
  };
  return r;
}
