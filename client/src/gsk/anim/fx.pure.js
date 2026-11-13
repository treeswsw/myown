// 갱스껄 연출 — DOM 없는 계산(단계·시간표·꽃잎 배치·악마 기운 모양). test/gsk/fx.pure.test.js 가 본다.
// 시간표는 디자인 캔버스(design/gsk/canvas/Flip.dc.html)의 flipTop() 을 그대로 옮긴 것. Math.random 없음(모두 같은 모습).

// 서버가 재는 시간(GDD 16절, 값의 원본은 shared/gsk/constants.js). 연출은 이 안에 끝나야 한다.
export const SERVER = Object.freeze({ FLIP_MS: 1700, TEASE_MS: 1400, REVEAL_MS: 3500 });

// 고조 단계: "이 장을 뒤집고 나면 몇 장 더 필요한가(r)". r>=4 → 1 · 3 → 2 · 2 → 3 · 1 → 4 · 0 이하 → 5(마지막 장).
export function levelFor(r) {
  const n = Number(r);
  if (!(n > 0)) return 5;
  return n >= 4 ? 1 : 5 - Math.floor(n);
}

// 멈칫 여부: 해골은 늘, 꽃은 서버가 tease:1 을 줄 때만.
export const isTease = (disc, tease) => disc === 'S' || !!tease;

// 한 장 공개 시간표(ms). 멈칫이면 split(1760)까지 꽃·해골이 완전히 같다.
export const T_PLAIN = Object.freeze({ up: 40, turn: 300, bloom: 520, fly: 1150, land: 1670 });
export const T_TEASE = Object.freeze({ up: 40, tease1: 300, tease2: 850, tease3: 1300, split: 1760, fly: 2520, land: 3040 });

// [{ at, stage }] — stage: up, turn, bloom, fly, land / tease1~3, relief, doom, hold
export function flipTimeline(disc, tease) {
  if (!isTease(disc, tease)) {
    const t = T_PLAIN;
    return [
      { at: t.up, stage: 'up' }, { at: t.turn, stage: 'turn' }, { at: t.bloom, stage: 'bloom' },
      { at: t.fly, stage: 'fly' }, { at: t.land, stage: 'land' },
    ];
  }
  const t = T_TEASE;
  const head = [
    { at: t.up, stage: 'up' }, { at: t.tease1, stage: 'tease1' },
    { at: t.tease2, stage: 'tease2' }, { at: t.tease3, stage: 'tease3' },
  ];
  if (disc === 'S') return [...head, { at: t.split, stage: 'doom' }, { at: t.land, stage: 'hold' }];
  return [...head, { at: t.split, stage: 'relief' }, { at: t.fly, stage: 'fly' }, { at: t.land, stage: 'land' }];
}

// flip() 의 Promise 가 끝나는 때. 해골도 멈칫 꽃과 같은 길이(패배 연출은 그 뒤에도 남는다).
export function flipDuration(disc, tease) {
  const tl = flipTimeline(disc, tease);
  return tl[tl.length - 1].at;
}

// 서버가 이 장 뒤에 기다리는 시간.
export const serverGap = (disc, tease) => SERVER.FLIP_MS + (isTease(disc, tease) ? SERVER.TEASE_MS : 0);

// 판정(gkReveal) 뒤 성공 피날레·해골 패배를 보여 주는 시간. REVEAL_MS 보다 조금 짧게(다음 화면이 밀리지 않게).
export const REVEAL_HOLD_MS = 3300;
// 성공 때 개인판이 1점 면으로 넘어가는 움직임(캔버스 .fx-bd-in: 0.45초 뒤 0.9초)
export const MAT_FLIP = Object.freeze({ delay: 450, dur: 900 });
// 남이 원판을 놓을 때의 내려앉음
export const PLACE_MS = 550;
// 다음 화면 소식이 끝내 안 올 때 남은 연출을 걷는 시간
export const LINGER_MAX_MS = 9000;

// 멈칫 뒤의 꽃은 한 단계쯤 더 시원하게
export const effLevel = (lv, disc, tease) => lv + (disc === 'F' && tease ? 0.7 : 0);

// 꽃 효과 크기(단계가 오를수록 꽃잎·반짝임이 많아지고 빛이 커진다)
export function burstSpec(lvl) {
  return {
    petals: Math.round(5 + lvl * 3),
    sparks: Math.round(2 + lvl * 2),
    size: Math.round(130 + lvl * 38),
    spread: +(0.85 + lvl * 0.09).toFixed(2),
  };
}
export const WIN_BURST = Object.freeze({ petals: 26, sparks: 18, size: 620, spread: 2.5 });

// 꽃잎 i 번(전체 np 장): 방향·종류·길이·늦춤. 고정 계산.
export function petalAt(i, np) {
  return {
    rot: Math.round((i * 360) / np + (i % 2 ? 9 : -7)),
    kind: i % 3,
    dur: +(0.7 + (i % 4) * 0.08).toFixed(2),
    delay: +((i % 5) * 0.03).toFixed(2),
  };
}
export function sparkAt(j, ns, spread) {
  return {
    rot: Math.round((j * 360) / ns + 17),
    scale: +(spread * (j % 2 ? 1.15 : 0.85)).toFixed(3),
    dur: +(0.6 + (j % 3) * 0.1).toFixed(2),
    delay: +(0.05 + (j % 4) * 0.04).toFixed(2),
  };
}

// 악마 기운(불꽃 16갈래 × 2겹). 캔버스 SVG 의 path 를 그대로.
const FLAME_A = [
  'M145 90 C141 64.96512 155 51.195936 160 27.4128 C167 53.699424 180 67.468608 175 90 Z',
  'M145 90 C141 58.8 155 41.64 160 12 C167 44.76 180 61.92 175 90 Z',
  'M145 90 C141 68.784 155 57.1152 160 36.96 C167 59.2368 180 70.9056 175 90 Z',
  'M145 90 C141 53.184 155 32.9352 160 -2.04 C167 36.6168 180 56.8656 175 90 Z',
];
const FLAME_B = [
  'M151 90 C147 75.23584 155 67.115552 160 53.0896 C167 68.591968 174 76.712256 169 90 Z',
  'M151 90 C147 71.6 155 61.48 160 44 C167 63.32 174 73.44 169 90 Z',
  'M151 90 C147 77.488 155 70.6064 160 58.72 C167 71.8576 174 78.7392 169 90 Z',
  'M151 90 C147 68.288 155 56.3464 160 35.72 C167 58.5176 174 70.4592 169 90 Z',
];
const FLAME_ORDER = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
// → [{ rot, d }] 16개. layer: 'a'(어두운 겹) | 'b'(밝은 겹)
export function auraPaths(layer) {
  const shapes = layer === 'b' ? FLAME_B : FLAME_A;
  return FLAME_ORDER.map((s, i) => ({ rot: (i >> 1) * 45 + (i % 2 ? 26.5 : -3), d: shapes[s] }));
}
export const HORNS = [
  'M84 96 C58 92 34 70 30 22 C52 50 78 60 104 66 Z',
  'M206 96 C232 92 256 70 260 22 C238 50 212 60 186 66 Z',
];

// 꽃 단계음의 음높이(반음). 1단계는 장마다 도/레 번갈아.
export function stageSemi(lv, n) {
  const l = Math.max(1, Math.min(lv | 0, 5));
  if (l <= 1) return n % 2 ? 0 : 2;
  return [0, 4, 7, 11, 12][l - 1];
}

// 고정 시드 난수(잡음 버퍼용). 0 이상 1 미만.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 화면 문구(이름은 textContent 로만 넣는다)
export const doomLine = (owner, challenger) => `${owner} 님의 해골 · ${challenger} 님 도전 실패`;
export const winLine = (challenger, need) => `${challenger} 님이 꽃 ${need}장을 모두 뒤집었습니다 · 1점`;
