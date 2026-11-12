import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, walk, CARD_RE } from './helpers.js';
import { runHoldem, runBluff, stopAll } from './play.js';
import { makeBots } from './helpers.js';
import { sleep } from './bot.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const FORBIDDEN_KEY = /deck|bullet|chamber|cylinder|revolver|loaded|fatal|rng|seed|slot/i;

function checkKeys(bot) {
  for (const m of bot.messages) {
    for (const [p] of walk(m)) {
      const segs = p.split('.').filter((s) => !/^\d+$/.test(s));
      for (const s of segs) {
        // player ids are map keys in result.shown / event shown; they are user ids, not schema keys
        if (FORBIDDEN_KEY.test(s) && !/^(shown)$/.test(s)) {
          // a user could be named e.g. "slot1": only flag schema paths (not under shown)
          if (!/(^|\.)shown\./.test(p)) assert.fail(`forbidden key "${s}" in message ${JSON.stringify(m).slice(0, 300)}`);
        }
      }
    }
  }
}

test('leaks: holdem never exposes opponents hole cards or deck', { timeout: 240000 }, async () => {
  const { bots } = await runHoldem(server, 3, 25);
  await stopAll(bots);
  for (const b of bots) checkKeys(b);

  // Split every bot's message stream into hands at each `deal` event.
  const segs = bots.map((b) => {
    const out = [[]];
    for (const m of b.messages) {
      if (m.t === 'event' && m.e.k === 'deal') out.push([]);
      out[out.length - 1].push(m);
    }
    return out;
  });
  const nHands = Math.min(...segs.map((s) => s.length));
  assert.ok(nHands > 10);

  const states = (seg) => seg.filter((m) => m.t === 'room' && m.state).map((m) => m.state);
  for (let h = 1; h < nHands; h++) {
    const holes = bots.map((b, i) => {
      const set = new Set();
      for (const s of states(segs[i][h])) for (const c of s.myCards || []) set.add(c);
      return set;
    });
    for (let i = 0; i < bots.length; i++) {
      const seg = segs[i][h];
      // cards legitimately visible to this bot in this hand
      const legit = new Set(holes[i]);
      for (const m of seg) {
        if (m.t === 'room' && m.state) {
          for (const c of m.state.board || []) legit.add(c);
          const sh = m.state.result && m.state.result.shown;
          if (sh) for (const cs of Object.values(sh)) cs.forEach((c) => legit.add(c));
        }
        if (m.t === 'event' && m.e.k === 'street') (m.e.cards || []).forEach((c) => legit.add(c));
        if (m.t === 'event' && m.e.k === 'showdown') for (const cs of Object.values(m.e.shown || {})) cs.forEach((c) => legit.add(c));
      }
      for (const m of seg) {
        // 1. structural: other players' cards must be null unless shown
        if (m.t === 'room' && m.state) {
          const s = m.state;
          const shown = (s.result && s.result.shown) || {};
          for (const p of s.players) {
            if (p.id === s.you) continue;
            if (p.cards != null) {
              assert.ok(shown[p.id], `opponent ${p.id} cards exposed without showdown: ${JSON.stringify(p.cards)}`);
              assert.deepEqual(p.cards, shown[p.id]);
            }
          }
          const me = s.players.find((p) => p.id === s.you);
          if (me && me.cards) assert.deepEqual(me.cards, s.myCards);
        }
        // 2. every card-looking leaf must be explainable
        for (const [path, v] of walk(m)) {
          if (typeof v === 'string' && CARD_RE.test(v)) {
            if (legit.has(v)) continue;
            // a card of another player, never legitimately shown to me?
            const leakedFrom = bots.findIndex((b, j) => j !== i && holes[j].has(v));
            assert.equal(leakedFrom, -1, `bot ${bots[i].id} saw hidden card ${v} at ${path} (held by ${bots[leakedFrom]?.id}): ${JSON.stringify(m).slice(0, 400)}`);
          }
        }
      }
    }
  }
});

test('leaks: bluff never exposes other hands or bullet positions', { timeout: 240000 }, async () => {
  const { bots } = await runBluff(server, 3, 6);
  await stopAll(bots);
  for (const b of bots) checkKeys(b);
  const allowedPlayerKeys = new Set(['id', 'name', 'avatar', 'seat', 'connected', 'spectating', 'alive', 'handCount', 'shots', 'isDealer', 'stack', 'bet', 'folded', 'allin', 'cards']);
  for (const b of bots) {
    for (const m of b.messages) {
      if (m.t !== 'room' || !m.state) continue;
      const s = m.state;
      for (const p of s.players) {
        for (const k of Object.keys(p)) assert.ok(allowedPlayerKeys.has(k), `unexpected player key ${k}`);
        assert.ok(!p.cards, 'bluff players must not carry cards');
        for (const v of Object.values(p)) assert.ok(!Array.isArray(v), 'no array fields on bluff players');
      }
      if (s.lastPlay) assert.deepEqual(Object.keys(s.lastPlay).sort(), ['by', 'count']);
      if (s.myHand) {
        assert.ok(Array.isArray(s.myHand));
        const me = s.players.find((p) => p.id === s.you);
        assert.equal(s.myHand.length, me.handCount, 'myHand length must equal own handCount');
      }
      // card-rank arrays may only appear at myHand and reveal.cards
      for (const [path, v] of walk(s)) {
        if (typeof v === 'string' && /^[AKQJ]$/.test(v)) {
          assert.ok(/^(myHand|reveal\.cards|tableRank)(\.|$)/.test(path), `rank leaf at unexpected path ${path}`);
        }
      }
      // reveal: only the cards played by `by`, shots within 1..6
      if (s.reveal) {
        assert.ok(s.reveal.cards.length >= 1 && s.reveal.cards.length <= 3);
        assert.ok(s.reveal.shots >= 0 && s.reveal.shots <= 6);
      }
    }
    // events: no hands/bullets
    for (const m of b.messages) if (m.t === 'event' && m.e.k === 'shot') {
      assert.deepEqual(Object.keys(m.e).filter((k) => !['k', 'id', 'dead', 'shots'].includes(k)), [], 'shot event carries extra fields');
    }
  }
});

test('leaks: rooms lists carry only public fields, never game data; outsiders see no room state', { timeout: 120000 }, async () => {
  const obs = (await makeBots(server, 1, { autoplay: false }))[0];
  const h = await runHoldem(server, 3, 8);
  const b = await runBluff(server, 3, 3);
  await sleep(700);
  const lists = obs.messages.filter((m) => m.t === 'rooms');
  assert.ok(lists.length >= 2, 'observer got room list updates');
  const nonPublic = obs.messages.filter((m) => !['me', 'rooms', 'room', 'error'].includes(m.t));
  assert.deepEqual(nonPublic, [], 'outsider received events/chat/etc');
  for (const m of obs.messages.filter((x) => x.t === 'room')) assert.equal(m.state, null, 'outsider received a room state');
  for (const m of lists) {
    assert.deepEqual(Object.keys(m).sort(), ['list', 't']);
    for (const r of m.list) {
      assert.deepEqual(Object.keys(r).sort(), ['code', 'count', 'hostName', 'max', 'mode', 'phase']);
      assert.ok(r.count >= 1 && r.count <= r.max);
    }
    for (const [p, v] of walk(m)) {
      assert.ok(!(typeof v === 'string' && CARD_RE.test(v)), `card-like value in rooms message at ${p}`);
    }
  }
  checkKeys(obs);
  // players inside rooms never get lists
  for (const bot of [...h.bots, ...b.bots]) {
    let inRoom = false;
    for (const m of bot.messages) {
      if (m.t === 'room') inRoom = m.state !== null;
      else if (m.t === 'rooms') assert.equal(inRoom, false, 'rooms list sent to a player inside a room');
    }
  }
  await stopAll([...h.bots, ...b.bots, obs]);
});
