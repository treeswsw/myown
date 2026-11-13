// 갱식 코인 적립표 (SPEC 22-2, 22-14) + 관리자 경제 설정 (SPEC 21-7). 홀덤·표에 없는 mode 는 0.
// 아래 값은 "기본값"이다. 서버는 관리자가 바꾼 값(hub.econ())을 먼저 읽고, 없으면 이 값을 쓴다.
export const COIN_RULES = {
  bluff: { finish: 1, win: 1, gapMs: 30000 },
  liar: { finish: 1, win: 1, gapMs: 45000 },
  draw: { finish: 2, win: 2, gapMs: 120000 },
  yacht: { finish: 3, win: 4, gapMs: 240000 },
  mini: { finish: 0, win: 1, gapMs: 60000 }, // 미니게임: 판에서 이긴 사람만 1코인(기권·나가기 승은 없음)
  gsk: { finish: 2, win: 2, gapMs: 120000 }, // 갱스껄: 한 판이 갱식마인드와 비슷한 길이
};

// 코인 ↔ 칩 교환 비율 기본값 (SPEC 22-3)
export const CHIPS_PER_COIN = 100;

// 관리자가 넣을 수 있는 값의 범위 [최소, 최대] (정수)
export const ECON_LIMITS = {
  finish: [0, 100],
  win: [0, 100],
  gapMs: [0, 3_600_000],
  chipsPerCoin: [1, 10_000],
};

const inLimit = (v, key) => Number.isInteger(v) && v >= ECON_LIMITS[key][0] && v <= ECON_LIMITS[key][1];

// 기본 설정 한 덩어리 (새 복사본)
export function defaultEcon() {
  const rules = {};
  for (const [k, r] of Object.entries(COIN_RULES)) rules[k] = { finish: r.finish, win: r.win, gapMs: r.gapMs };
  return { rules, chipsPerCoin: CHIPS_PER_COIN };
}

// 저장소에서 읽은 값(손상됐을 수 있음)을 안전한 설정으로: 모르는 mode 는 버리고, 잘못된 칸은 기본값으로.
export function normalizeEcon(raw) {
  const out = defaultEcon();
  if (!raw || typeof raw !== 'object') return out;
  if (inLimit(raw.chipsPerCoin, 'chipsPerCoin')) out.chipsPerCoin = raw.chipsPerCoin;
  const rr = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  for (const mode of Object.keys(out.rules)) {
    const r = Object.hasOwn(rr, mode) && rr[mode] && typeof rr[mode] === 'object' ? rr[mode] : {};
    for (const key of ['finish', 'win', 'gapMs']) if (inLimit(r[key], key)) out.rules[mode][key] = r[key];
  }
  return out;
}

// 관리자 요청 검사: 모든 mode·모든 칸이 있고 범위 안이어야 한다. 성공하면 {ok:true, econ}.
export function checkEcon(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  if (!inLimit(raw.chipsPerCoin, 'chipsPerCoin')) return { ok: false };
  const rr = raw.rules;
  if (!rr || typeof rr !== 'object' || Array.isArray(rr)) return { ok: false };
  const keys = Object.keys(COIN_RULES);
  if (Object.keys(rr).length !== keys.length) return { ok: false };
  const econ = { rules: {}, chipsPerCoin: raw.chipsPerCoin };
  for (const mode of keys) {
    const r = Object.hasOwn(rr, mode) ? rr[mode] : null;
    if (!r || typeof r !== 'object') return { ok: false };
    const row = {};
    for (const key of ['finish', 'win', 'gapMs']) {
      if (!inLimit(r[key], key)) return { ok: false };
      row[key] = r[key];
    }
    econ.rules[mode] = row;
  }
  return { ok: true, econ };
}

// 받는 코인 = finish + (이겼으면 win × 상대 수). opp 는 부르는 쪽이 정한다. rules 를 안 주면 기본값 표.
export function coinsFor(mode, { won = false, opp = 0 } = {}, rules = COIN_RULES) {
  if (!Object.prototype.hasOwnProperty.call(rules, mode)) return 0;
  const r = rules[mode];
  const o = Number.isInteger(opp) && opp > 0 ? opp : 0;
  return r.finish + (won ? r.win * o : 0);
}
