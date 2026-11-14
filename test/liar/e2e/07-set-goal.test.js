// GDD 8절 13-7: 제시어 묶음과 목표 점수. 스타 버전이면 주제 10개와 그 묶음의 단어가 나오고,
// 목표 점수 10에서 누군가 닿으면 결과에 우승이 실리며, 다음 판을 시작하면 방 점수는 0, 누적 점수에는 더해져 있다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  roomN, setTimes, setSettings, startRound, findLiar, until, waitPhase, speakAll, accuse, judgeMap, waitResult,
} from './helpers.js';

const WORDS = JSON.parse(readFileSync(new URL('../../../server/liar/words.json', import.meta.url), 'utf8'));
const STAR = WORDS.sets.star.topics;
const MINE = WORDS.sets.mine.topics;
const wordsOf = (topic) => new Set(topic.words.flatMap((e) => [e.w, ...(e.alt ?? [])]));

async function myRank(c) {
  c.lgRank = null;
  c.lg('rank');
  await until(() => c.lgRank, `lgRank ${c.id}`);
  return c.lgRank.mine.score;
}

// 시민 둘이 "맞다"로 라이어를 처형하고 라이어는 오답: 시민 +2 씩, 라이어 0. 결과 화면까지.
async function citizensWinRound(r, round) {
  await startRound(r, round);
  const liar = findLiar(r.cs);
  const citizens = r.cs.filter((c) => c !== liar);
  await speakAll(r);
  await accuse(r, liar.id);
  await judgeMap(r, Object.fromEntries(citizens.map((c) => [c.id, 'yes'])));
  await waitPhase(r, 'guess');
  liar.guess('틀린답');
  await waitResult(r);
  return { liar, result: r.host.state.result };
}

describe('13-7 제시어 묶음과 목표 점수', { concurrency: true }, () => {
  it('스타 버전으로 바꾸면 주제 목록이 10개로 바뀌고, 그 묶음의 주제·단어가 나온다 (기본은 내 버전)', async (t) => {
    const r = await roomN(3);
    t.after(() => r.close());
    const names = (c) => c.state.settings.topics.map((x) => x.name);
    assert.equal(r.host.state.settings.wordSet, 'mine');
    assert.deepEqual(names(r.host), MINE.map((x) => x.name));
    assert.equal(STAR.length, 10);
    // 방장이 아니면 못 바꾼다
    r.cs[1].set({ wordSet: 'star' });
    await until(() => r.cs[1].errors.length > 0, 'non-host refused', { clients: r.cs });
    assert.equal(r.host.state.settings.wordSet, 'mine');
    await setSettings(r, { wordSet: 'star' });
    for (const c of r.cs) {
      assert.equal(c.state.settings.topics.length, 10);
      assert.deepEqual(names(c), STAR.map((x) => x.name));
      assert.ok(c.state.settings.topics.every((x) => x.on === true));
    }
    await setTimes(r);
    // 여러 판 돌려서 매번 스타 묶음의 주제·단어인지 확인 (판마다 새로 뽑는다)
    for (let round = 1; round <= 3; round++) {
      r.host.send({ t: 'start' });
      await until(() => r.cs.every((c) => c.state?.phase === 'reveal' && c.state.round === round), `reveal ${round}`, { clients: r.cs });
      const topic = STAR.find((x) => x.name === r.host.state.topic);
      assert.ok(topic, `주제 ${r.host.state.topic} 는 스타 버전의 주제`);
      const pool = wordsOf(topic);
      for (const c of r.cs) assert.ok(pool.has(c.state.my.word), `${c.id} 의 제시어 ${c.state.my.word} 는 ${topic.name} 의 단어`);
      // 판을 방 대기로 돌려 다음 판을 시작한다
      r.host.lg('end');
      await until(() => r.cs.every((c) => c.state.phase === 'lobby'), 'lobby', { clients: r.cs });
    }
    // 도로 내 버전으로 바꾸면 주제 목록이 원래대로
    await setSettings(r, { wordSet: 'mine' });
    assert.deepEqual(names(r.host), MINE.map((x) => x.name));
  });

  it('주제를 방장이 직접 고르는 방식에서도 스타 주제의 단어가 나온다 (롤챔프)', async (t) => {
    const r = await roomN(3);
    t.after(() => r.close());
    await setSettings(r, { wordSet: 'star' });
    await setSettings(r, { topicMode: 'host' });
    r.host.set({ nextTopic: '롤챔프' });
    await until(() => r.cs.every((c) => c.state.settings.nextTopic === '롤챔프'), 'nextTopic', { clients: r.cs });
    await startRound(r);
    assert.equal(r.host.state.topic, '롤챔프');
    const pool = wordsOf(STAR.find((x) => x.name === '롤챔프'));
    for (const c of r.cs) assert.ok(pool.has(c.state.my.word));
  });

  it('목표 점수 10: 판을 거듭해 누군가 10점에 닿으면 결과에 우승, 다음 판 시작 뒤 방 점수 0 · 누적에 더해짐', { timeout: 60_000 }, async (t) => {
    const r = await roomN(3, { k: 60 });
    t.after(() => r.close());
    await setTimes(r, { judge: 15, guess: 30 });
    await setSettings(r, { goal: 10 });
    for (const c of r.cs) assert.equal(c.state.settings.goal, 10);
    const book = Object.fromEntries(r.cs.map((c) => [c.id, 0])); // 시험이 따로 세는 방 점수
    let champions = null;
    let round = 0;
    while (champions === null) {
      round++;
      assert.ok(round <= 8, `8판 안에 누군가 10점에 닿아야 한다 (시민 +2 씩이면 늦어도 5판): ${JSON.stringify(book)}`);
      const { liar, result } = await citizensWinRound(r, round);
      assert.equal(result.reason, 'executedLiar');
      assert.equal(result.winner, 'citizens');
      for (const [id, d] of Object.entries(result.delta)) book[id] += d;
      // 방 점수는 판이 결과에 닿는 순간 반영된다
      await until(() => r.cs.every((c) => c.state.players.every((p) => p.score === book[p.id])), `scores after round ${round}`, { clients: r.cs });
      const reached = Object.entries(book).filter(([, s]) => s >= 10);
      if (reached.length === 0) {
        assert.ok(!result.champions, `${round}판: 아직 우승자가 없어야 한다`);
        assert.equal(liar.state.my.role, 'liar');
      } else {
        const top = Math.max(...reached.map(([, s]) => s));
        const want = reached.filter(([, s]) => s === top).map(([id]) => id).sort();
        assert.deepEqual([...result.champions].sort(), want);
        champions = want;
      }
    }
    // 모든 사람에게 같은 우승자가 간다
    for (const c of r.cs) assert.deepEqual([...c.state.result.champions].sort(), champions);
    // 결과 단계에서는 아직 누적에 더해지지 않았고(나갈 때/다음 판 때 더한다), 방 점수는 그대로
    for (const c of r.cs) assert.equal(await myRank(c), 0, `${c.id}: 다음 판 시작 전 누적`);
    const total = { ...book };
    // 다음 판 시작 → 방 점수 전원 0, 누적에는 더해짐
    r.host.send({ t: 'start' });
    await until(() => r.cs.every((c) => c.state?.phase === 'reveal' && c.state.round === round + 1), 'next round', { clients: r.cs });
    for (const c of r.cs) assert.ok(c.state.players.every((p) => p.score === 0), `${c.id}: 방 점수 0`);
    for (const c of r.cs) assert.equal(await myRank(c), total[c.id], `${c.id}: 누적 ${total[c.id]}`);
    assert.ok(champions.every((id) => total[id] >= 10));
    // 새 판에서는 우승 표시가 없다
    assert.ok(!r.host.state.result);
  });
});
