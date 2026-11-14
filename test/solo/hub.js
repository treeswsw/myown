// 혼자 놀기 서버 틀 시험 도우미: 실제 허브 + 가짜 시계 + 메모리 저장소 + 가짜 엔진(test/solo/lib.js).
import { makeHub, drain } from '../lib/hub.js';
import { createRun } from '../../shared/solo/run.js';
import { turnEngine, tickEngine } from './lib.js';

export const ENGINES = { [turnEngine.id]: turnEngine, [tickEngine.id]: tickEngine };

// opt.first: 방을 만들 때 첫 종목이 될 엔진 id (표의 첫 칸이 기본 종목). opt.cap: 하루 상한. 코인 줄은 판당 최대 turn 10 / tick 5.
export function soloHub(opt = {}) {
  const { first = turnEngine.id, cap, ...hubOpts } = opt;
  const h = makeHub({ solo: 'on', ...hubOpts });
  h.hub.soloEngines = { [first]: ENGINES[first], ...Object.fromEntries(Object.entries(ENGINES).filter(([k]) => k !== first)) };
  const rules = h.hub.econ().rules;
  rules.solo_fake_turn = { finish: 10, win: 0, gapMs: 0 };
  rules.solo_fake_tick = { finish: 5, win: 0, gapMs: 0 };
  if (cap !== undefined) rules.solo_cap = { finish: cap, win: 0, gapMs: 0 };
  return { ...h, rules };
}

export const settled = async () => { for (let i = 0; i < 8; i++) await drain(); };
export const errOf = (c, since = 0) => c.sock.msgs.slice(since).filter((m) => m.t === 'error').at(-1)?.code;
export const mark = (c) => c.sock.msgs.length;

// 하는 사람이 방을 만들고 카운트다운(3초)까지 지나 play 가 된 상태. 돌려주는 값 = 화면 쪽 진행기와 조각 보내기 도우미.
export async function startPlay(h, id = 'ann1') {
  const c = await h.login(id);
  await c.send({ t: 'create', mode: 'solo' });
  await h.tick(3000);
  return attach(h, c);
}

export function attach(h, c) {
  const so = c.state.so;
  const engine = h.hub.soloEngines[c.state.game];
  const run = createRun(engine, so.seed);
  let sent = 0;
  const api = {
    c, run, engine, seed: so.seed,
    // 화면이 안 보낸 기록을 한 조각으로 보낸다. 돌려주는 값 = 오류 코드(없으면 undefined)
    async flush(n = sent) {
      const ops = run.take();
      if (!ops.length) return undefined;
      const m = mark(c);
      await c.send({ t: 'so', a: 'in', n, ops });
      const e = errOf(c, m);
      if (!e) sent = n + ops.length;
      return e;
    },
    get sent() { return sent; },
    async end(score = run.score()) {
      const m = mark(c);
      await c.send({ t: 'so', a: 'end', score });
      await settled();
      return errOf(c, m);
    },
  };
  return api;
}
