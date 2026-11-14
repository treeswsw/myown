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

// 벌칙 창에 그릴 칸. null 이면 창 없음. (GDD 17절: 고르는 사람은 늘 도전자 본인, 앞면)
//  { mode: 'front', cells:[{key, k, count}] }   내가 도전자 → 내 원판 종류별로 고름
//  { mode: 'watch', name }                       남이 고르는 중 (view.penalty.by 의 이름)
export function penaltyPlan(view) {
  if (!view || view.phase !== 'playing' || view.step !== 'penalty') return null;
  const dis = (view.actions || []).filter((a) => a.a === 'discard');
  if (dis.length) {
    const cnt = ownCounts(view);
    return { mode: 'front', cells: dis.map((a) => ({ key: a.key, k: a.k, count: cnt[a.k] || 0 })) };
  }
  const by = view.penalty && view.penalty.by;
  const who = by ? (view.seats || []).find((s) => s.id === by) : null;
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

// 대기실 개인 칸(waitPart 'gk-color'): 색 6개의 상태. state = 'mine' | 'free' | 'taken'
// 값은 방 상태의 wait.own[사람] = { color: 0..5 | null } (서버가 줌). by = 그 색을 쓰는 사람 이름.
export function colorStates(state) {
  const own = (state && state.wait && state.wait.own) || {};
  const me = state && state.you;
  const names = new Map(((state && state.players) || []).map((p) => [p.id, p.name]));
  const out = [];
  for (let c = 0; c < 6; c++) {
    const holder = Object.keys(own).find((id) => own[id] && own[id].color === c) || null;
    out.push({ c, state: !holder ? 'free' : holder === me ? 'mine' : 'taken', by: holder ? names.get(holder) || '' : '' });
  }
  return out;
}
