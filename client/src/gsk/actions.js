// 갱스껄 요청 만들기 (GDD 9-1). 보내는 일은 index.js 의 send 가 한다.
const gk = (a, o) => ({ t: 'gk', a, ...o });
export const place = (k) => gk('place', { k });
export const bid = (n) => gk('bid', { n });
export const pass = () => gk('pass');
export const flip = (p) => gk('flip', { p });
export const discard = (o) => gk('discard', o && o.k !== undefined ? { k: o.k } : { i: o.i });
export const color = (c) => gk('color', { c });
export const start = () => ({ t: 'start' });

// model 의 행동 하나(action 항목) → 보낼 요청
export function requestFor(act) {
  switch (act.a) {
    case 'place': return place(act.k);
    case 'bid': return bid(act.n);
    case 'pass': return pass();
    case 'flip': return flip(act.p);
    case 'discard': return discard(act.k !== undefined ? { k: act.k } : { i: act.i });
    case 'color': return color(act.c);
    case 'start': return start();
    default: return null;
  }
}
