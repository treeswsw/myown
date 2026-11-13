// 갱스껄 손패·버튼 — DOM 없는 계산 (hand.js 가 그림, 여기서는 "무엇을 보일지"만 정한다).
// local = { mode: 'idle' | 'place' | 'bid' }  (내 차례에서 고른 갈래)
// pending = 방금 내려고 날린 원판 종류 'F'|'S'|null  (서버 확인 전까지 손패에서 감춘다)

export const PER_ROW = 12; // 숫자 동전 한 줄 최대 (넘으면 두 줄)

// {F,S} → ['F','F','S'] (꽃 먼저, 해골 나중). pending 이면 그 종류 한 장을 뺀다.
export function handList(hand, pending) {
  const f = Math.max(0, (hand && hand.F) | 0);
  const s = Math.max(0, (hand && hand.S) | 0);
  const out = [];
  for (let i = 0; i < f; i++) out.push('F');
  for (let i = 0; i < s; i++) out.push('S');
  if (pending) {
    const i = out.lastIndexOf(pending);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

// 숫자 목록 → 줄 나누기 (perRow 이하면 한 줄, 넘으면 위아래 균형 두 줄)
export function splitRows(nums, perRow = PER_ROW) {
  if (!nums.length) return [];
  if (nums.length <= perRow) return [nums.slice()];
  const first = Math.ceil(nums.length / 2);
  return [nums.slice(0, first), nums.slice(first)];
}

export function bidNums(view) {
  const r = view && view.ranges && view.ranges.bid;
  if (!r || r.max < r.min) return [];
  const out = [];
  for (let n = r.min; n <= r.max; n++) out.push(n);
  return out;
}

// 화면 계획. 반환:
// { visible, hand:[kinds], open, discMode:'place'|'open'|null, buttons:[{key,label,tone}],
//   coins:{rows,ask}|null, pass:bool, cancel:bool, caption }
export function plan(view, local, pending) {
  const none = { visible: false, hand: [], open: false, discMode: null, buttons: [], coins: null, pass: false, cancel: false, caption: '' };
  if (!view || view.phase !== 'playing' || !view.me || !view.me.seated) return none;
  const acts = view.actions || [];
  const hasPlace = acts.some((a) => a.a === 'place');
  const bidActs = acts.some((a) => a.a === 'bid');
  const hasPass = acts.some((a) => a.a === 'pass');
  const mode = (local && local.mode) || 'idle';
  const hand = handList(view.me.hand, pending);
  const res = { ...none, visible: true, hand, caption: `내 원판 ${hand.length}` };

  if (view.step === 'setup' && hasPlace) return { ...res, open: true, discMode: 'place' };
  if (view.step === 'turn' && (hasPlace || bidActs)) {
    if (mode === 'place' && hasPlace) return { ...res, open: true, discMode: 'place', cancel: true };
    if (mode === 'bid' && bidActs) return { ...res, coins: { rows: splitRows(bidNums(view)), ask: '꽃만 몇 개 뒤집겠습니까' }, cancel: true };
    const buttons = [];
    if (hasPlace) buttons.push({ key: 'choose-place', label: '원판 내기', tone: 'paper' });
    if (bidActs) buttons.push({ key: 'choose-bid', label: '도전', tone: 'ink' });
    return { ...res, buttons, discMode: hasPlace ? 'open' : null };
  }
  if (view.step === 'bid' && (bidActs || hasPass)) {
    return { ...res, coins: { rows: splitRows(bidNums(view)), ask: '몇으로 올리겠습니까' }, pass: hasPass };
  }
  return res;
}

// 내 차례 갈래가 더는 맞지 않으면(차례가 지나감) idle 로
export function normalizeLocal(view, local) {
  const acts = (view && view.actions) || [];
  const mode = (local && local.mode) || 'idle';
  if (view && view.step === 'turn') {
    if (mode === 'place' && acts.some((a) => a.a === 'place')) return local;
    if (mode === 'bid' && acts.some((a) => a.a === 'bid')) return local;
  }
  return { mode: 'idle' };
}

// 손패 한 장의 자리(1280×720 무대 좌표). open 이면 가운데 아래로 펼침, 아니면 왼쪽 아래 독.
export const W = 112;
export const GAP = 22;
export function slot(j, m, open, dock) {
  if (open) {
    const x0 = 640 - (m * W + (m - 1) * GAP) / 2;
    return { x: x0 + j * (W + GAP), y: 546, s: 1 };
  }
  const d = dock || { x: 36, y: 632 };
  return { x: d.x + j * 34, y: d.y, s: 0.5 };
}
