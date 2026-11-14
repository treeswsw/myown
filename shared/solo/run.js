// 진행기 (docs/solo/PLAN.md 1-4): 엔진 + 입력 기록. 화면과 서버가 같은 것을 쓴다 — 기록(ops) 모양은 여기서만 정해진다.
// ops = 정수 배열. 0 이상 = 입력 값, 음수 = 그만큼의 걸음(tick 종목, 연속 걸음은 한 칸으로 합침, 한 칸 최대 STEP_MAX).
// 이미 take 로 꺼내 간 칸은 다시 바꾸지 않는다(서버가 받은 칸과 화면의 칸이 늘 같도록).
export const STEP_MAX = 600;

// opt.record: false 면 기록을 저장하지 않는다(서버: 엔진 상태만 든다). 기본 true.
export function createRun(engine, seed, opt = {}) {
  const record = opt.record !== false;
  const state = engine.create(seed >>> 0);
  if (!Array.isArray(state.ev)) state.ev = [];
  const rec = [];   // 전체 기록(record 일 때)
  let taken = 0;    // take 로 꺼내 간 칸 수
  const run = {
    state,
    ticks: 0,
    n: 0, // 지금까지의 기록 칸 수
    input(v) {
      if (!Number.isInteger(v) || v < 0 || v > (engine.maxV ?? Infinity)) return false;
      state.ev.length = 0;
      if (!engine.input(state, v)) return false;
      if (record) rec.push(v);
      run.n++;
      return true;
    },
    // 한 걸음 (tick 종목만). 연속 걸음은 아직 안 꺼낸 마지막 칸에 합친다.
    step() {
      if (!engine.tick) return false;
      state.ev.length = 0;
      engine.step(state);
      run.ticks++;
      const last = run.n - 1;
      if (record && last >= taken && rec[last] < 0 && rec[last] > -STEP_MAX) rec[last]--;
      else {
        if (record) rec.push(-1);
        run.n++;
      }
      return true;
    },
    // 서버: 기록 조각을 그대로 적용. 잘못된 입력이면 ok:false. budget = 이번에 돌릴 최대 걸음 수.
    // budget 을 넘는 걸음 칸은 나눠서, 못 돌린 나머지 ops 를 left 로 돌려준다(그대로 다시 feed 하면 이어진다).
    feed(ops, budget = Infinity) {
      let used = 0;
      for (let i = 0; i < ops.length; i++) {
        const v = ops[i];
        if (!Number.isInteger(v)) return { ok: false, used, left: [] };
        if (v >= 0) {
          if (!run.input(v)) return { ok: false, used, left: [] };
          continue;
        }
        if (!engine.tick || -v > STEP_MAX) return { ok: false, used, left: [] };
        const k = -v;
        const can = Math.min(k, budget - used);
        for (let j = 0; j < can; j++) run.step();
        used += can;
        if (can < k) return { ok: true, used, left: [-(k - can), ...ops.slice(i + 1)] };
      }
      return { ok: true, used, left: [] };
    },
    // 화면: 아직 안 보낸 기록을 꺼낸다(한 번 꺼내면 다시 안 나온다).
    take() {
      const out = rec.slice(taken);
      taken = rec.length;
      return out;
    },
    // 화면: 서버가 받은 칸 수가 n 일 때(so_sync) n 칸 뒤부터 전부 다시 꺼낸다.
    resend(n) {
      taken = Math.max(0, Math.min(n, rec.length));
      return run.take();
    },
    score() { return engine.score(state); },
    over() { return engine.over(state); },
  };
  return run;
}
