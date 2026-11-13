// 요트다이스 3D 품질 단계. 2 높음 / 1 보통 / 0 낮음. (docs/YACHT-PLAN.md Y4C)
// 내리기만 한다(올리지 않는다). 화면 배율·그림자 끄기는 stage 가 따로 한다.

export const LEVELS = [
  // shadow: 실시간 그림자 지도 크기(0 = 없음, 주사위 아래 둥근 그림자 판) / round: 주사위 모서리 곡면 칸 수
  // arc: 트레이 둥근 귀퉁이 칸 수 / lathe: 컵 둘레 칸 수 / tex: 주사위 한 면 그림 크기(px) / fine: 고운 재질(요철·광택)
  { shadow: 0, round: 1, arc: 4, lathe: 20, tex: 96, fine: false, physical: false },
  { shadow: 1024, round: 2, arc: 8, lathe: 32, tex: 160, fine: true, physical: false },
  { shadow: 2048, round: 6, arc: 16, lathe: 72, tex: 256, fine: true, physical: true },
];

export const clampLevel = (q) => Math.max(0, Math.min(2, Math.round(Number(q) || 0)));

/** 시작 단계: 저사양이면 0, 휴대폰(짧은 변 500px 이하)은 1, 그 밖은 2. */
export function startLevel(stage) {
  if (stage?.isLowPower?.()) return 0;
  const w = stage?.size?.w ?? globalThis.innerWidth ?? 1280;
  const h = stage?.size?.h ?? globalThis.innerHeight ?? 720;
  return Math.min(w, h) <= 500 ? 1 : 2;
}

const WINDOW_MS = 2000, LIMIT_MS = 28, WARMUP_MS = 1500, SKIP_MS = 250;

/** 프레임 시간을 받아 2초 평균이 28ms 를 넘으면 한 단계 내린다. tick(dt 밀리초). */
export function createQualityWatch({ get, lower }) {
  let acc = 0, n = 0, warm = WARMUP_MS;
  return {
    tick(dt) {
      if (!(dt > 0) || dt > SKIP_MS) return;          // 탭이 가려졌다 돌아온 프레임은 세지 않는다
      if (warm > 0) { warm -= dt; return; }           // 처음(셰이더 준비)과 단계가 바뀐 직후는 세지 않는다
      acc += dt; n++;
      if (acc < WINDOW_MS) return;
      const avg = acc / n;
      acc = 0; n = 0;
      if (avg > LIMIT_MS && get() > 0) { lower(); warm = WARMUP_MS; }
    },
    reset() { acc = 0; n = 0; warm = WARMUP_MS; },
  };
}

/** 장식용 난수(재질 무늬). Math.random 을 쓰지 않는다. 같은 seed = 같은 무늬. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 만든 geometry·material·texture 를 모아 한 번에 버린다. */
export function createTracker() {
  const items = new Set();
  return {
    add(x) { items.add(x); return x; },
    count(kind) { let n = 0; items.forEach((x) => { if (x[kind]) n++; }); return n; },
    dispose() { items.forEach((x) => x.dispose()); items.clear(); },
  };
}
