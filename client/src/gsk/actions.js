// 갱스껄 요청 만들기 (GDD 9-1). 보내는 일은 index.js 의 send 가 한다.
const gk = (a, o) => ({ t: 'gk', a, ...o });
export const place = (k) => gk('place', { k });
export const bid = (n) => gk('bid', { n });
export const pass = () => gk('pass');
export const flip = (p) => gk('flip', { p });
export const discard = (o) => gk('discard', { k: o.k });
// 색 고르기는 공통 대기실의 개인 칸: {t:'pick', patch:{color}}. 시작은 대기실의 버튼 하나({t:'start'}).
export const pickColor = (c) => ({ t: 'pick', patch: { color: c } });

// model 의 행동 하나(action 항목) → 보낼 요청
export function requestFor(act) {
  switch (act.a) {
    case 'place': return place(act.k);
    case 'bid': return bid(act.n);
    case 'pass': return pass();
    case 'flip': return flip(act.p);
    case 'discard': return discard({ k: act.k });
    default: return null;
  }
}
