// Secret-keeping with coins (SPEC 22-7, 22-12 #5): before the round result / final ranking nobody gets a changed wallet
// or the common result (wait.result), and the liar receives the same kinds of messages in the same order as a citizen.
// Coins show up only in the common result; there is no separate `coin` message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import * as L from '../liar/e2e/helpers.js';

// message kind: type plus event kind / room phase, never the values
const kind = (m) => (m.t === 'event' ? `event:${m.e.k}` : m.t === 'room' ? `room:${m.state?.phase ?? 'null'}` : m.t);

// Index where coins first show up: the `me` that carries the new wallet, or the first room state with the common result.
const hasResult = (m) => m.t === 'room' && Boolean(m.state?.wait?.result);
function coinCut(msgs) {
  const cut = msgs.findIndex((m) => hasResult(m) || (m.t === 'me' && (m.wallet?.coins ?? 0) > 0));
  if (cut < 0) return msgs.length;
  let at = cut;
  while (at > 0 && msgs[at - 1].t === 'me') at--; // the stats `me` sent in the same step
  return at;
}

function assertQuiet(c, endPhase) {
  const cut = coinCut(c.msgs);
  assert.ok(cut < c.msgs.length, `${c.id}: coin arrives at the end`);
  for (const m of c.msgs.slice(0, cut)) {
    if (m.t === 'me') assert.equal(m.wallet?.coins ?? 0, 0, `${c.id}: wallet unchanged before the result`);
    if (m.t === 'room') assert.notEqual(m.state?.phase, endPhase, `${c.id}: coin comes with, not before, the result`);
  }
}

test('liar: no coin message and no wallet change before the result; liar sees the same message kinds as a citizen', async (t) => {
  const r = await L.roomN(4);
  t.after(() => r.close());
  await L.setTimes(r, { judge: 15, guess: 30 });
  await L.startRound(r);
  const liar = L.findLiar(r.cs);
  const others = r.cs.filter((c) => c !== liar);
  await L.speakAll(r);
  await L.accuse(r, liar.id);
  await L.judgeMap(r, Object.fromEntries(others.slice(0, 3).map((c) => [c.id, 'yes'])));
  await L.until(() => r.cs.every((c) => c.state.phase === 'unmask'), 'unmask', { clients: r.cs });
  await L.waitPhase(r, 'guess');
  liar.guess('틀린답');
  await L.waitResult(r);
  await L.until(() => r.cs.every((c) => c.msgs.some(hasResult)), 'coins arrive', { clients: r.cs });

  for (const c of r.cs) {
    assertQuiet(c, 'result');
    assert.ok(!c.msgs.some((m) => m.t === 'coin'), `${c.id}: no separate coin message`);
  }
  // from the reveal on, the liar's kinds in order equal a (non-host) citizen's, up to the first coin
  const seq = (c) => {
    const from = c.msgs.findIndex((m) => m.t === 'room' && m.state?.phase === 'reveal');
    return c.msgs.slice(from, coinCut(c.msgs)).map(kind);
  };
  const citizens = others.filter((c) => c !== r.host);
  assert.ok(citizens.length >= 2);
  for (const c of citizens) assert.deepEqual(seq(liar), seq(c), `liar vs ${c.id}`);
  // after the result: the same kinds again (only the amount differs)
  const tail = (c) => c.msgs.slice(coinCut(c.msgs)).map(kind);
  for (const c of citizens) assert.deepEqual(tail(liar), tail(c), `liar vs ${c.id} after the result`);
  const gain = r.host.msgs.find(hasResult).state.wait.result.gain; // everyone sees everyone's coins
  assert.equal(gain[liar.id], 4);
  assert.equal(gain[citizens[0].id], 6);
});

test('draw: no coin message and no wallet change before the final ranking', async () => {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(undefined), rng: seeded(4), now: clock.now, timers: clock, draw: 'on' });
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1']) {
    const c = client(hub);
    await c.send({ t: 'login', id });
    c.id = id;
    cs.push(c);
  }
  await cs[0].send({ t: 'create', mode: 'draw' });
  for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
  await cs[0].send({ t: 'set', patch: { rounds: 1, time: 60 } });
  await cs[0].send({ t: 'start' });
  for (let n = 0; n < 600 && cs[0].state?.phase !== 'final'; n++) {
    for (const c of cs) {
      const st = c.state;
      if (st?.phase === 'pick' && st.drawerId === st.you && st.choices) await c.send({ t: 'dr', a: 'pick', i: 0 });
      if (st?.phase === 'draw' && st.drawerId !== st.you && st.you === 'bob1') {
        const word = cs.find((x) => x.state?.you === st.drawerId)?.state?.word;
        if (word) await c.send({ t: 'chat', text: word });
      }
    }
    clock.advance(1000);
  }
  assert.equal(cs[0].state.phase, 'final');
  for (const c of cs) {
    c.msgs = c.sock.msgs;
    // the final ranking room message carries the common result (coins) in the same step
    assertQuiet(c, 'final');
    const finalAt = c.msgs.findIndex((m) => m.t === 'room' && m.state?.phase === 'final');
    assert.ok(hasResult(c.msgs[finalAt]), `${c.id}: the final ranking comes with the result`);
    assert.ok(!c.msgs.some((m) => m.t === 'coin'), `${c.id}: no separate coin message`);
  }
});
