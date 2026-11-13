// 화면 자리 계산 (three.js 를 가져오지 않는 순수 함수). node 시험 대상.
export const TA = 1.45;        // 테이블 타원 가로 반지름
export const TB = 0.95;        // 테이블 타원 세로 반지름
export const SEAT_GAP = 0.34;  // 테이블 가장자리에서 의자 중심까지

// 화면 자리 순서. [0] = 화면 앞(내 자리).
// seat 이 숫자인 사람만 seat 순으로 놓고 내가 [0]이 되게 돌린다.
// 전원 seat 이 null(방 대기)이면 배열 순서로(내가 있으면 내가 [0]이 되게 돌린다). 내가 관전자면 seat 0 이 [0].
export function seatOrder(players, you) {
  const list = Array.isArray(players) ? players : [];
  const seated = list.filter((p) => Number.isInteger(p.seat));
  let ids;
  if (seated.length) {
    ids = seated.slice().sort((a, b) => a.seat - b.seat).map((p) => p.id);
  } else {
    ids = list.map((p) => p.id);
  }
  const at = ids.indexOf(you);
  if (at > 0) ids = ids.slice(at).concat(ids.slice(0, at));
  return ids;
}

// n = 3..8. 타원 위 고른 간격. [0]이 화면 앞(+z), 시계 방향. yaw 는 테이블 쪽을 보는 각.
export function seatSlots(n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const ex = TA * Math.sin(t), ez = TB * Math.cos(t);
    let nx = Math.sin(t) / TA, nz = Math.cos(t) / TB;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    out.push({ x: ex + nx * SEAT_GAP, z: ez + nz * SEAT_GAP, yaw: Math.atan2(-nx, -nz),
      edge: { x: ex, z: ez }, n: { x: nx, z: nz } });
  }
  return out;
}

// 단계별 카메라. guess·answer 이고 unmask.liarId 가 있으면 라이어 클로즈업 유지(spot, 하얀 조명). speak 이고 speaker 있음 → 발언자. defense·judge·judged → 지목된 사람. 그 밖은 전체 보기.
export function cameraFor(state) {
  if (!state) return { mode: 'table' };
  if ((state.phase === 'guess' || state.phase === 'answer') && state.unmask && state.unmask.liarId) {
    return { mode: 'spot', id: state.unmask.liarId };
  }
  if (state.phase === 'speak' && state.speaker) return { mode: 'focus', id: state.speaker };
  if ((state.phase === 'defense' || state.phase === 'judge' || state.phase === 'judged') && state.accused) {
    return { mode: 'focus', id: state.accused };
  }
  return { mode: 'table' };
}

// 투표 화살표 계획 (시안 planArrows 의 계산 부분). votes = {찍은 사람: 찍힌 사람},
// seatOf(id) → {edge:{x,z}, n:{x,z}, k} | null (k = 화면 자리 번호). 없는 id·자기 자신을 찍은 표는 뺀다.
// 반환: [{from, to, a:[x,z], b:[x,z], c:[x,z], layer}] 찍은 사람의 자리 번호 순.
// a = 출발점, b = 도착점(한 사람에게 여러 표면 옆으로 나란히), c = 휘는 점(2차 베지어), layer = 높이 겹침 순서(자리 번호).
export function arrowPlan(votes, seatOf) {
  if (!votes || typeof votes !== 'object') return [];
  const incoming = new Map();
  for (const voter of Object.keys(votes)) {
    const target = votes[voter];
    if (typeof target !== 'string' || voter === target) continue;
    if (!seatOf(voter) || !seatOf(target)) continue;
    if (!incoming.has(target)) incoming.set(target, []);
    incoming.get(target).push(voter);
  }
  const out = [];
  for (const [t, list] of incoming) {
    const to = seatOf(t);
    const side = { x: -to.n.z, z: to.n.x };
    const sideOf = (v) => { const e = seatOf(v).edge; return side.x * (e.x - to.edge.x) + side.z * (e.z - to.edge.z); };
    // 오른쪽에서 온 화살표는 오른쪽에 닿게: 끝에서 서로 엇갈리지 않는다
    list.sort((p, q) => (sideOf(p) - sideOf(q)) || (seatOf(p).k - seatOf(q).k));
    list.forEach((voter, j) => {
      const from = seatOf(voter);
      const off = (j - (list.length - 1) / 2) * 0.13;
      const a = [from.edge.x - from.n.x * 0.17, from.edge.z - from.n.z * 0.17];
      const inward = 0.2 + off * off * 0.6;
      const b = [to.edge.x - to.n.x * inward + side.x * off, to.edge.z - to.n.z * inward + side.z * off];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      const bend = len * (0.14 + 0.05 * (from.k % 3));
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let px = dz / len, pz = -dx / len;
      // 가까운 자리끼리는 테이블 밖으로 나가지 않게 가운데 쪽으로 휜다
      if (len < 1.3 && Math.hypot(mx + px, mz + pz) > Math.hypot(mx - px, mz - pz)) { px = -px; pz = -pz; }
      out.push({ from: voter, to: t, a, b, c: [mx + px * bend, mz + pz * bend], layer: from.k });
    });
  }
  return out.sort((p, q) => p.layer - q.layer);
}
