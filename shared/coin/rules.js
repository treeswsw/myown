// 갱식 코인 적립표 (SPEC 22-2, 22-14) + 관리자 경제 설정 (SPEC 21-7). 홀덤·표에 없는 mode 는 0.
// 아래 값은 "기본값"이다. 서버는 관리자가 바꾼 값(hub.econ())을 먼저 읽고, 없으면 이 값을 쓴다.
export const COIN_RULES = {
  bluff: { finish: 8, win: 4, gapMs: 30000 },
  liar: { finish: 4, win: 2, gapMs: 45000 }, // 판(라운드)마다
  draw: { finish: 10, win: 2, gapMs: 120000, graded: true }, // finish = 8문제 기준. 실제 문제 수에 비례(info.scale)
  yacht: { finish: 10, win: 5, gapMs: 240000, graded: true },
  mini: { finish: 1, win: 2, gapMs: 60000 }, // 매치당: 이김 3 / 짐 1. 기권·나감·무승부는 지급 없음
  // 미니게임 봇전(사람 1명 + 봇 자리): 난이도별 줄, mini 와 같은 규칙. 끝까지 두고 지면 finish, 이기면 finish + win. 기권·나감·무승부는 0 (SPEC 22-2)
  minibot_easy: { finish: 0, win: 2, gapMs: 60000 }, // 이김 2 / 짐 0
  minibot_mid: { finish: 1, win: 2, gapMs: 60000 }, // 이김 3 / 짐 1 (사람전 mini 와 같음)
  minibot_hard: { finish: 1, win: 9, gapMs: 60000 }, // 이김 10 / 짐 1
  // 체스 퍼즐(혼자 퀴즈 풀기, docs/mini/PLAN.md 6절). 줄마다 finish 만 쓴다: puzzle_<난이도 구간> = 첫 시도에 맞힌 코인
  // (1200 미만 1 / 1200~1800 2 / 1800~2200 3 / 2200 이상 5), puzzle_streak = 5연속마다 더하는 코인, puzzle_cap = 하루(한국 시간) 상한
  puzzle_1: { finish: 1, win: 0, gapMs: 0 },
  puzzle_2: { finish: 2, win: 0, gapMs: 0 },
  puzzle_3: { finish: 3, win: 0, gapMs: 0 },
  puzzle_5: { finish: 5, win: 0, gapMs: 0 },
  puzzle_streak: { finish: 2, win: 0, gapMs: 0 },
  puzzle_cap: { finish: 100, win: 0, gapMs: 0 },
  gsk: { finish: 10, win: 4, gapMs: 120000 },
};

// 갱식마인드 finish 의 기준 문제 수
export const DRAW_BASE_Q = 8;

// 경제 설정 저장 덩어리의 버전. 버전이 다른(없는) 옛 저장값은 버리고 기본값으로 시작한다.
export const ECON_VERSION = 2;

// 코인 ↔ 칩 교환 비율 기본값 (SPEC 22-3). 칩 → 코인은 1,000칩 = 1코인(시작 칩 10,000은 남겨야 한다).
export const CHIPS_PER_COIN = 100;
export const CHIPS_PER_COIN_BACK = 1000;

// 관리자가 넣을 수 있는 값의 범위 [최소, 최대] (정수)
export const ECON_LIMITS = {
  finish: [0, 100],
  win: [0, 100],
  gapMs: [0, 3_600_000],
  chipsPerCoin: [1, 10_000],
  chipsPerCoinBack: [1, 1_000_000],
};

const inLimit = (v, key) => Number.isInteger(v) && v >= ECON_LIMITS[key][0] && v <= ECON_LIMITS[key][1];

// 기본 설정 한 덩어리 (새 복사본)
export function defaultEcon() {
  const rules = {};
  for (const [k, r] of Object.entries(COIN_RULES)) rules[k] = { finish: r.finish, win: r.win, gapMs: r.gapMs, ...(r.graded ? { graded: true } : {}) };
  return { v: ECON_VERSION, rules, chipsPerCoin: CHIPS_PER_COIN, chipsPerCoinBack: CHIPS_PER_COIN_BACK };
}

// 저장소에서 읽은 값(손상됐을 수 있음)을 안전한 설정으로: 모르는 mode 는 버리고, 잘못된 칸은 기본값으로.
export function normalizeEcon(raw) {
  const out = defaultEcon();
  if (!raw || typeof raw !== 'object' || raw.v !== ECON_VERSION) return out; // 옛 저장값은 한 번 버린다
  if (inLimit(raw.chipsPerCoin, 'chipsPerCoin')) out.chipsPerCoin = raw.chipsPerCoin;
  if (inLimit(raw.chipsPerCoinBack, 'chipsPerCoinBack')) out.chipsPerCoinBack = raw.chipsPerCoinBack;
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
  if (!inLimit(raw.chipsPerCoin, 'chipsPerCoin') || !inLimit(raw.chipsPerCoinBack, 'chipsPerCoinBack')) return { ok: false };
  const rr = raw.rules;
  if (!rr || typeof rr !== 'object' || Array.isArray(rr)) return { ok: false };
  const keys = Object.keys(COIN_RULES);
  if (Object.keys(rr).length !== keys.length) return { ok: false };
  const econ = { v: ECON_VERSION, rules: {}, chipsPerCoin: raw.chipsPerCoin, chipsPerCoinBack: raw.chipsPerCoinBack };
  for (const mode of keys) {
    const r = Object.hasOwn(rr, mode) ? rr[mode] : null;
    if (!r || typeof r !== 'object') return { ok: false };
    const row = {};
    for (const key of ['finish', 'win', 'gapMs']) {
      if (!inLimit(r[key], key)) return { ok: false };
      row[key] = r[key];
    }
    if (COIN_RULES[mode].graded) row.graded = true;
    econ.rules[mode] = row;
  }
  return { ok: true, econ };
}

// 한 판의 지급. rows [{id, rank, won?, opp?}] (opp 있는 줄만 받는다) -> {[id]: 코인}. 모르는 mode 는 전부 0.
// 보통: finish + (이겼으면 win × opp). graded 게임: 꼴찌 finish, 1등 finish + win × opp,
// 중간 finish + round((1등 − finish) × (아래 사람 수 / (opp))²), 동점은 같은 값. 판을 나가 줄에 없는 사람은 아래로 센다.
// scale: finish 에 곱하는 비율(갱식마인드 문제 수 / 8). rules 를 안 주면 기본값 표.
export function payouts(mode, rows, rules = COIN_RULES, scale = 1) {
  const out = {};
  if (!Object.prototype.hasOwnProperty.call(rules, mode)) return out;
  const r = rules[mode];
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const finish = Math.round(r.finish * k);
  const paid = (rows ?? []).filter((x) => Number.isInteger(x.opp) && x.opp >= 0);
  for (const x of paid) {
    if (!r.graded) { out[x.id] = finish + (x.won ? r.win * x.opp : 0); continue; }
    const n = Math.max(...paid.map((y) => y.opp)) + 1; // 참가 인원
    if (n < 2) { out[x.id] = finish; continue; }
    // 공동 1등도 1등(n - 1). 그 밖에는 나보다 등수가 낮은 사람 + 나간 사람
    const below = x.rank === 1 ? n - 1 : paid.filter((y) => y.rank > x.rank).length + (n - paid.length);
    const top = finish + r.win * (n - 1);
    out[x.id] = finish + Math.round((top - finish) * (below / (n - 1)) ** 2);
  }
  return out;
}
