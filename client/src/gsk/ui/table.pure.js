// 갱스껄 탁자 계산 — DOM 없는 순수 함수. 시안(design/gsk/canvas/Main·Flip·Phone)의 계산식을 그대로 옮겼다.
// 화면 좌표는 모두 "시안 크기" 기준이다(PC 1280x720, 휴대폰 가로 844x390). 실제 크기 맞춤은 index.js 가 상자째 scale 한다.

export const LAYOUTS = {
  pc: {
    kind: 'pc', W: 1280, H: 720,
    G: { cx: 640, cy: 300, rx: 235, ry: 180, gap: 66, lw: 82, lh: 20 },
    STEP: 6, DS: 80, BS: 28,
    mid: { x: 640, y: 300 },
    // 펼친 줄(flip 단계): 위쪽 숫자 줄 / 줄 높이 / 문구 높이
    flip: { capTop: 196, rowY: 306, gapMax: 58, ssMax: 64, span: 272, two: { y1: 292, gapY: 6 }, sayPad: 12 },
    tagPad: 40,
  },
  phone: {
    kind: 'phone', W: 844, H: 390,
    G: { cx: 422, cy: 152, rx: 168, ry: 100, gap: 40, lw: 52, lh: 14 },
    STEP: 4, DS: 46, BS: 22,
    mid: { x: 422, y: 152 },
    flip: { capTop: 80, rowY: 144, gapMax: 22, ssMax: 24, span: 150, two: { y1: 138, gapY: 3 }, sayPad: 8 },
    tagPad: 22,
  },
};

export const TINT = ['#7fb56a', '#a98bd0', '#dcae45', '#d0655a', '#62aecb', '#de8b4c'];
export const tintOf = (c) => TINT[c == null ? 0 : Math.max(0, Math.min(5, c | 0))];

// 높이 500 미만이면 휴대폰 가로(CLAUDE.md)
export const layoutFor = (innerHeight) => (innerHeight < 500 ? 'phone' : 'pc');

const r1 = (v) => Math.round(v * 10) / 10;

// 정다각형 자리. i=0 이 맨 아래 가운데(나). 시계 방향. lx,ly = 이름표 가운데.
export function seatGeom(n, lay) {
  const L = typeof lay === 'string' ? LAYOUTS[lay] : lay;
  const G = L.G;
  const out = [];
  for (let i = 0; i < n; i++) {
    const deg = 90 + (i * 360) / n;
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const x = G.cx + G.rx * ux, y = G.cy + G.ry * uy;
    const d = G.gap + Math.abs(ux) * G.lw + Math.abs(uy) * G.lh;
    let lx = x + ux * d, ly = y + uy * d;
    if (L.kind === 'phone' && i === 0) { lx = x - 104; ly = y + 6; } // 시안 Phone: 내 이름표는 개인판 왼쪽
    const p = L.tagPad;
    lx = Math.max(p, Math.min(L.W - p, lx));
    ly = Math.max(p * 0.6, Math.min(L.H - p * 0.6, ly));
    out.push({ x: r1(x), y: r1(y), rot: r1(deg - 90), lx: r1(lx), ly: r1(ly), side: x > G.cx + 1 ? -1 : 1 });
  }
  return out;
}

// 더미: count 장을 아래에서 위로. 시안 pile() 과 같은 어긋남(옆면 띠가 보이게 한 장마다 step 만큼 위로).
export function pileSpots(count, step) {
  const spots = [];
  for (let k = 0; k < count; k++) {
    const dx = k === 0 ? 0 : k % 2 ? 2.5 : -2;
    spots.push({ x: dx, y: k === 0 ? 0 : -k * step, rot: (k * 37 + 11) % 360 });
  }
  return spots;
}

// 장수 표시(×n) 위치: 더미가 가운데보다 오른쪽 자리면 왼쪽, 아니면 오른쪽
export function badgePos(side, lay) {
  const L = typeof lay === 'string' ? LAYOUTS[lay] : lay;
  return { x: side < 0 ? -(L.DS / 2 + 5 + L.BS) : L.DS / 2 + 5, y: 2 - L.BS / 2 };
}

// hold: 연출 중이라 아직 안 뒤집힌 것처럼 그릴 장수(공개된 것의 맨 끝부터)
export function visibleShown(shown, hold) {
  const list = Array.isArray(shown) ? shown : [];
  const h = Math.max(0, Math.min(list.length, hold | 0));
  return list.slice(0, list.length - h);
}

// 한 자리의 더미 모양: 아직 안 뒤집힌 뒷면 + 공개된 해골(제자리). 공개된 꽃은 가운데 줄로 갔으므로 더미에 없다.
export function pileModel(seat, hold, lay) {
  const shown = visibleShown(seat.shown, hold);
  const stack = Math.max(0, seat.stack | 0);
  const skulls = shown.filter((k) => k === 'S').length;
  const backs = Math.max(0, stack - shown.length);
  const L = typeof lay === 'string' ? LAYOUTS[lay] : lay;
  const spots = pileSpots(backs + skulls, L.STEP);
  const discs = spots.map((p, i) => ({ ...p, kind: i < backs ? 'B' : 'S', rot: i < backs ? p.rot : 0 }));
  const top = discs.length ? discs[discs.length - 1] : { x: 0, y: 0 };
  return { discs, count: discs.length, label: `×${discs.length}`, topX: top.x, topY: top.y, backs, skulls };
}

// 가운데 펼친 줄. 앞 연출 중 가려야 할 칸은 호출한 쪽(table.js)이 hidden 처리.
// need 9 이하: 한 줄, 10 이상: 두 줄(윗줄이 ceil(n/2)). count = 칸 수(도전 숫자와 실제 뒤집은 수 중 큰 쪽).
export function rowLayout(count, lay) {
  const L = typeof lay === 'string' ? LAYOUTS[lay] : lay;
  const F = L.flip;
  const n = Math.max(0, count | 0);
  const rows = n >= 10 ? 2 : 1;
  const perRow = rows === 2 ? Math.ceil(n / 2) : Math.max(1, n);
  const gap = Math.min(F.gapMax, Math.round(F.span / Math.max(1, perRow - 1)));
  const ss = Math.min(F.ssMax, gap + (L.kind === 'phone' ? 4 : 8));
  const y1 = rows === 2 ? F.two.y1 : F.rowY;
  const y2 = y1 + ss + F.two.gapY;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = rows === 2 && i >= perRow ? 1 : 0;
    const idx = row ? i - perRow : i;
    const inRow = row ? n - perRow : perRow;
    slots.push({ x: r1(L.G.cx - ((inRow - 1) * gap) / 2 + idx * gap), y: row ? y2 : y1, row });
  }
  const lastY = rows === 2 ? y2 : y1;
  return { n, rows, perRow, gap, ss, slots, sayTop: lastY + ss / 2 + F.sayPad, capTop: F.capTop };
}

// 가운데 줄: 뒤집혀 공개된 꽃의 주인 목록(뒤집은 순서). 상태에는 순서가 없으므로 이전 줄을 이어 쓰고,
// 새로 늘어난 것은 도전자(자기 더미부터 열기 때문) → 나머지 자리 순으로 붙인다.
export function reconcileRow(prev, seats, challengerId) {
  const want = new Map();
  for (const s of seats) {
    const f = (s.shown || []).filter((k) => k === 'F').length;
    if (f) want.set(s.id, f);
  }
  const left = new Map(want);
  const row = [];
  for (const o of prev || []) {
    const c = left.get(o) || 0;
    if (c > 0) { row.push(o); left.set(o, c - 1); }
  }
  const order = seats.map((s) => s.id);
  if (challengerId && order.includes(challengerId)) order.unshift(challengerId);
  const seen = new Set();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    for (let c = left.get(id) || 0; c > 0; c--) row.push(id);
  }
  return row;
}

export const isFlipStep = (v) => !!v && v.phase === 'playing' && ['flip', 'reveal', 'penalty'].includes(v.step) && (v.progress ? v.progress.need : v.need) > 0;

// 가운데 덩어리의 글자들(DOM 없음).
//   mode 'flip'  : 위에 "뒤집은 꽃 n / need", 아래에 펼친 줄. 'plain': 큰 숫자(있으면) + 해골 그림 + 문구
export function midModel(v, extra = {}) {
  const holdRow = Math.max(0, (extra.holdRow | 0));
  const me = v.me ? v.seats.find((s) => s.isMe) : null;
  const nameOf = (id) => (v.seats.find((s) => s.id === id) || {}).name || '';
  const out = { mode: 'plain', cap: '', num: null, small: null, say: v.center || '', sub: '' };
  if (v.phase === 'lobby' || v.phase === 'result') return out;
  const sumStacks = v.seats.reduce((a, s) => a + (s.out ? 0 : s.stack || 0), 0);
  switch (v.step) {
    case 'setup':
      out.cap = '판 위 원판';
      out.num = sumStacks;
      if (me && !me.out && !me.placed) out.sub = '낼 원판을 고르세요';
      break;
    case 'turn':
      out.cap = '판 위 원판';
      out.num = v.total || sumStacks;
      if (me && me.isTurn) out.sub = '원판을 내거나 도전하세요';
      break;
    case 'bid':
      out.cap = '도전';
      out.num = v.bid ? v.bid.n : null;
      if (me && me.isTurn) out.sub = '올리거나 패스하세요';
      else if (v.bid) out.sub = `${nameOf(v.bid.by)} 님이 ${v.bid.n}개에 도전했습니다`;
      break;
    case 'flip':
    case 'reveal':
    case 'penalty': {
      const need = v.progress ? v.progress.need : extra.need || 0;
      if (need > 0) {
        out.mode = 'flip';
        out.cap = '뒤집은 꽃';
        const flipped = v.progress ? v.progress.flipped : extra.flipped || 0;
        out.num = Math.max(0, flipped - holdRow);
        out.small = `/ ${need}`;
        const rem = need - out.num;
        if (v.step === 'flip') {
          const chId = (v.seats.find((s) => s.isChallenger) || {}).id;
          if (me && me.isChallenger) {
            out.say = v.ranges && v.ranges.flipPiles.length ? '상대 더미를 눌러 뒤집으세요' : v.center;
          } else if (chId) out.say = `${nameOf(chId)} 님이 뒤집는 중`;
          out.sub = rem <= 0 ? '' : rem === 1 ? '마지막 한 장' : `앞으로 ${rem}장`;
        }
      }
      break;
    }
    default:
      break;
  }
  return out;
}

// 이름표 옆 작은 알약 글자. null 이면 없음. kind: '' | 'red' | 'mute'
export function chipFor(seat, v) {
  if (seat.out) return { text: '탈락', kind: 'mute' };
  const o = v.outcome;
  const judged = ['reveal', 'penalty', 'between'].includes(v.step);
  if (judged && o && !o.ok && o.skullOf === seat.id) return { text: '해골', kind: 'red' };
  if (judged && o && seat.isChallenger) return o.ok ? { text: '성공', kind: '' } : { text: '도전 실패', kind: 'mute' };
  if (seat.isChallenger && v.step === 'flip' && v.progress) return { text: `도전 ${v.progress.need}`, kind: '' };
  if (v.step === 'bid' && v.bid && v.bid.by === seat.id) return { text: `도전 ${v.bid.n}`, kind: '' };
  if (!seat.connected) return { text: '끊김', kind: 'mute' };
  if (v.step === 'bid' && seat.passed) return { text: '패스', kind: 'mute' };
  if (v.step === 'setup' && seat.placed) return { text: '놓음', kind: 'mute' };
  return null;
}

// 테 강조: 'red'(해골 주인) | 'gold'(차례·벌칙 고르는 사람) | ''
export function ringFor(seat, v) {
  const judged = ['reveal', 'penalty', 'between'].includes(v.step);
  if (judged && v.outcome && !v.outcome.ok && v.outcome.skullOf === seat.id) return 'red';
  if (seat.isTurn && v.step !== 'reveal' && v.step !== 'penalty' && v.step !== 'between') return 'gold';
  if (v.step === 'penalty' && v.penalty && v.penalty.by === seat.id) return 'gold';
  return '';
}

// 자리 순서: 내가 맨 앞(참가자일 때), 나머지는 시계 방향 그대로
export function orderSeats(seats) {
  const i = seats.findIndex((s) => s.isMe);
  return i <= 0 ? seats.slice() : seats.slice(i).concat(seats.slice(0, i));
}
