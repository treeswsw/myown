// 갱스껄 벌칙·결과·대기 화면의 DOM 없는 계산. view = model.js 의 toView 결과.

// 내 원판 종류별 장수(손 + 내 더미). 자기 해골 고르기용.
export function ownCounts(view) {
  const c = { F: 0, S: 0 };
  if (view && view.me) {
    c.F = view.me.hand.F || 0;
    c.S = view.me.hand.S || 0;
    for (const k of view.me.stack || []) c[k] = (c[k] || 0) + 1;
  }
  return c;
}

// 벌칙 창에 그릴 칸. null 이면 창 없음.
//  { mode: 'back'|'front', cells:[{key, i?|k?, count?}] }  내가 고르는 사람
//  { mode: 'watch', name }                                   남이 고르는 중
export function penaltyPlan(view) {
  if (!view || view.phase !== 'playing' || view.step !== 'penalty') return null;
  const dis = (view.actions || []).filter((a) => a.a === 'discard');
  if (dis.length) {
    if (dis[0].k !== undefined) {
      const cnt = ownCounts(view);
      return { mode: 'front', cells: dis.map((a) => ({ key: a.key, k: a.k, count: cnt[a.k] || 0 })) };
    }
    return { mode: 'back', cells: dis.map((a) => ({ key: a.key, i: a.i })) };
  }
  const who = (view.seats || []).find((s) => s.status === '고르는 중');
  return { mode: 'watch', name: who ? who.name : '' };
}

// 순위 줄. pips = 점수 칸 두 개의 채움.
export function rankRows(view) {
  const r = view && view.result;
  if (!r || !Array.isArray(r.ranks)) return [];
  return r.ranks.map((x) => {
    const seat = (view.seats || []).find((s) => s.id === x.id) || null;
    const pts = Math.max(0, Math.min(2, x.points | 0));
    return {
      rank: x.rank, id: x.id, name: x.name, color: seat && seat.color != null ? seat.color : null,
      points: pts, discs: x.discs | 0, pips: [pts >= 1, pts >= 2],
      out: !!(seat && seat.out), isMe: !!(seat && seat.isMe), isWinner: r.winner === x.id,
    };
  });
}

export function winnerInfo(view) {
  const r = view && view.result;
  if (!r) return null;
  const seat = r.winner ? (view.seats || []).find((s) => s.id === r.winner) : null;
  const row = r.winner ? (r.ranks || []).find((x) => x.id === r.winner) : null;
  return {
    id: r.winner || null,
    name: row ? row.name : seat ? seat.name : '',
    color: seat && seat.color != null ? seat.color : 0,
    reason: r.reason || null,
  };
}

// 결과 한 줄 설명
export function winCaption(info) {
  if (!info || !info.id) return '판이 끝났습니다';
  return info.reason === 'alone' ? '마지막까지 남았습니다' : '꽃만 두 번 뒤집었습니다';
}

// 방 대기: 색 6개의 상태. state = 'mine' | 'free' | 'taken'
export function colorStates(view) {
  const seats = (view && view.seats) || [];
  const free = new Set((view && view.ranges && view.ranges.colorsFree) || []);
  const out = [];
  for (let c = 0; c < 6; c++) {
    const holder = seats.find((s) => s.color === c) || null;
    let state = 'free';
    if (holder && holder.isMe) state = 'mine';
    else if (!free.has(c)) state = 'taken';
    out.push({ c, key: `color-${c}`, state, by: holder ? holder.name : '' });
  }
  return out;
}

export function waitInfo(view) {
  const seats = (view && view.seats) || [];
  const canStart = !!(view && view.ranges && view.ranges.canStart);
  const isHost = !!(view && (view.actions || []).some((a) => a.a === 'start'));
  return { count: seats.length, canStart, isHost, needMore: seats.length < 3 };
}
