// 혼자 놀기 화면 틀의 "판 진행" 부분 (DOM 없음 — node 시험 가능). docs/solo/PLAN.md 1-4·1-5·2-3·5절.
// 진행기(shared/solo/run.js) + 입력 조각 보내기(1초마다, 512칸씩) + 1/60초 걸음 누적기 + so_sync 다시 보내기.
// 종목 이름을 모른다: 엔진만 받는다.
import { createRun } from '../../../shared/solo/run.js';

export const SEND_MS = 1000;   // 조각을 보내는 간격
export const CHUNK = 512;      // 한 조각 최대 칸 수 (서버 검사와 같다)
export const STEP_S = 1 / 60;  // 걸음 하나의 길이(초)
export const MAX_STEPS_PER_FRAME = 5; // 한 화면에 최대 걸음 수 (느린 기기는 게임이 천천히 간다)
export const RESYNC_QUIET_MS = 3000;  // 서버가 받은 수가 모자란 채로 이만큼 지나면 다시 보낸다

// opt: { send(msg), now() -> ms }
export function createFlow(engine, seed, opt) {
  const { send, now = () => Date.now() } = opt;
  const run = createRun(engine, seed);
  let pending = [];   // 꺼냈지만 아직 안 보낸 기록
  let sentN = 0;      // 보낸 칸 수
  let lastSend = now();
  let acc = 0;        // 걸음 누적(초)
  let locked = false; // 입력·걸음 막기(카운트다운·끝난 뒤)
  const flow = {
    run,
    get state() { return run.state; },
    get sentN() { return sentN; },
    get locked() { return locked; },
    lock(on) { locked = Boolean(on); },
    score: () => run.score(),
    over: () => run.over(),

    // 입력 하나. 막혀 있거나 안 되는 입력이면 false (이때 상태는 그대로)
    input(v) {
      if (locked || run.over()) return false;
      return run.input(v);
    },

    // 걸음 누적기: dt 초가 지났다. 한 일(걸음)의 연출 사건 목록을 돌려준다. 잠든 세계·막힌 상태·걸음 없는 종목은 아무것도 안 한다.
    advance(dt) {
      const evs = [];
      if (!engine.tick || locked || run.over() || run.state.asleep) { acc = 0; return evs; }
      acc += Math.min(Math.max(dt, 0), 0.25);
      let k = 0;
      while (acc >= STEP_S && k < MAX_STEPS_PER_FRAME) {
        acc -= STEP_S;
        run.step();
        k++;
        if (run.state.ev.length) evs.push(...run.state.ev);
        if (run.over() || run.state.asleep) { acc = 0; break; }
      }
      if (acc > STEP_S) acc = 0; // 못 따라가면 버린다(천천히 가는 것과 같다)
      return evs;
    },

    // 안 보낸 기록을 서버로. force 가 아니면 마지막으로 보낸 지 SEND_MS 가 지났을 때만. 보냈으면 true.
    flush(force = false) {
      pending.push(...run.take());
      if (!pending.length) return false;
      const t = now();
      if (!force && t - lastSend < SEND_MS) return false;
      lastSend = t;
      while (pending.length) {
        const ops = pending.splice(0, CHUNK);
        send({ t: 'so', a: 'in', n: sentN, ops });
        sentN += ops.length;
      }
      return true;
    },

    // 서버가 받은 칸 수가 n 이다(so_sync 오류, 또는 다시 붙은 뒤 방 상태). n 칸 뒤부터 전부 다시 보낸다.
    resync(n) {
      if (!Number.isInteger(n) || n < 0 || n > sentN) return false;
      pending = run.resend(n);
      sentN = n;
      return flow.flush(true);
    },

    // 방 상태가 왔다: 서버가 받은 수가 우리가 보낸 수보다 모자라고 한참 지났으면 다시 보낸다.
    check(serverN) {
      if (!Number.isInteger(serverN) || serverN >= sentN) return false;
      if (now() - lastSend < RESYNC_QUIET_MS) return false;
      return flow.resync(serverN);
    },
  };
  return flow;
}

// 카운트다운 숫자: startAt 까지 남은 ms -> 3·2·1, 시작 뒤에는 0
export const countOf = (leftMs) => (leftMs > 0 ? Math.min(3, Math.ceil(leftMs / 1000)) : 0);

// 남은/지난 시간 글자 m:ss
export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const fmtScore = (n) => Number(n || 0).toLocaleString('ko-KR');

// 공통 결과 제목·부제 (순수 함수, 시험용). last = 방 상태의 last 칸.
export function resultTitleOf(name, last) {
  if (!last) return null;
  const rk = last.rank ?? {};
  const parts = [];
  if (last.fresh) parts.push('새 기록!');
  else if (Number.isFinite(last.best)) parts.push(`최고 ${fmtScore(last.best)}점`);
  if (rk.all) parts.push(`전체 ${rk.all}위`);
  if (rk.wk) parts.push(`이번 주 ${rk.wk}위`);
  return { title: `${name} · ${fmtScore(last.score)}점`, sub: parts.join(' · ') };
}

// 오늘 코인 줄 (순수 함수)
export function coinLineOf(last) {
  if (!last?.coin) return '';
  const { today, cap } = last;
  if (!Number.isFinite(today) || !Number.isFinite(cap)) return '';
  return last.coin.capped || today >= cap ? `오늘 코인 다 받음 (${cap}/${cap})` : `오늘 코인 ${today}/${cap}`;
}
