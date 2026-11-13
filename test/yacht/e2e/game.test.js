// 요트 e2e (GDD 11절 1·4): 두 명 한 판 끝까지, 끊김(짧은 유예) 기다림과 기권.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startYacht, yachtRoom, until, sleep, bot } from './helpers.js';
import { totals } from '../../../shared/yacht/score.js';

const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];

test('two bots play 12 rounds; totals and stats are right', async (t) => {
  const s = await startYacht({ grace: 5000 });
  t.after(() => s.close());
  const cs = await yachtRoom(s.app, ['alpha', 'bravo']);
  cs[0].send({ t: 'start' });
  await until(() => cs[0].state.phase === 'playing', 'start');
  for (let n = 0; n < 24; n++) {
    await until(() => cs[0].state.turn && cs[0].state.round === Math.floor(n / 2) + 1 && !cs[0].state.dice, `turn ${n}`);
    const c = cs.find((x) => x.id === cs[0].state.turn);
    c.yt('roll');
    await until(() => c.state.dice, 'rolled');
    const cat = CATS[Math.floor(n / 2)];
    c.yt('pick', { cat });
    await until(() => cs[1].state.pick === cat, 'pick visible');
    c.yt('score', { cat });
    await sleep(250); // 연결당 초당 20개 제한을 넘지 않게
  }
  await until(() => cs.every((c) => c.state.phase === 'result'), 'result');
  const st = cs[0].state;
  assert.equal(st.result.reason, 'done');
  for (const col of st.cols) assert.equal(col.total, totals(col.scores).total);
  const top = Math.max(...st.cols.map((c) => c.total));
  assert.deepEqual([...st.result.winners].sort(), st.cols.filter((c) => c.total === top).map((c) => c.id).sort());
  await until(() => cs.every((c) => c.me.stats.yacht?.games === 1), 'stats');
  assert.equal(cs.reduce((a, c) => a + c.me.stats.yacht.wins, 0), st.result.winners.length);
  for (const c of cs) c.close();
});

test('disconnect on turn: waits, returns with same dice; then no return -> forfeit', async (t) => {
  const s = await startYacht({ grace: 700 });
  t.after(() => s.close());
  const cs = await yachtRoom(s.app, ['alpha', 'bravo', 'charl']);
  cs[0].send({ t: 'start' });
  await until(() => cs[0].state.phase === 'playing', 'start');
  const turnId = cs[0].state.turn;
  const me = cs.find((c) => c.id === turnId);
  const others = cs.filter((c) => c !== me);
  me.yt('roll');
  await until(() => me.state.dice, 'rolled');
  const dice = JSON.stringify(me.state.dice);
  me.close();
  await until(() => others[0].state.waiting === turnId, 'waiting');
  const back = await bot(s.app, turnId);
  await until(() => back.state, 'back state');
  assert.equal(JSON.stringify(back.state.dice), dice);
  assert.equal(back.state.waiting, null);
  back.close();
  await until(() => others[0].state.cols.find((c) => c.id === turnId).left, 'forfeit', 4000);
  assert.ok(others[0].events.some((e) => e.k === 'ytDrop' && e.id === turnId && e.reason === 'away'));
  assert.notEqual(others[0].state.turn, turnId);
  assert.equal(others[0].state.phase, 'playing');
  for (const c of others) c.close();
});
