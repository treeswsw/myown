// 관전 계정(관전N) 비밀 시험: 갱스껄을 실제 허브로 돌리며 관전자 기기에 원판 종류·손 구성(mine)이 가지 않고,
// 관전자가 받은 알림은 모두 참가자 전원도 받은 것(방 전체 알림)뿐이다. 해골을 놓든 꽃을 놓든 관전자가 받는 것은 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub } from '../lib/hub.js';

async function run(skullBy) {
  const h = makeHub();
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1']) cs.push(await h.login(id));
  await cs[0].send({ t: 'create', mode: 'gsk' });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  const s = await h.login('관전1');
  await s.send({ t: 'join', code });
  await cs[0].send({ t: 'start' });
  const marks = cs.map((c) => c.sock.msgs.length);
  const sm = s.sock.msgs.length;
  for (const c of cs) await c.send({ t: 'gk', a: 'place', k: c.id === skullBy ? 'S' : 'F' });
  const ev = (c, from) => c.sock.msgs.slice(from).filter((m) => m.t === 'event').map((m) => JSON.stringify(m.e));
  const mine = ev(s, sm);
  cs.forEach((c, i) => { const got = new Set(ev(c, marks[i])); for (const e of mine) assert.ok(got.has(e), `${c.id} 가 못 받은 알림: ${e}`); });
  for (const m of s.sock.msgs.filter((x) => x.t === 'room' && x.state)) assert.equal(m.state.mine, null, '관전자 mine 없음');
  const strip = (m) => (m.t === 'room' && m.state ? { ...m.state, now: 0 } : m);
  return s.sock.msgs.slice(sm).map((m) => JSON.stringify(strip(m)));
}

test('갱스껄: 관전자에게는 손·원판 종류가 없고, 해골을 누가 놓든 관전자가 받는 것이 같다', async () => {
  const a = await run('ann1');
  const b = await run('bob1');
  assert.deepEqual(a, b);
});
