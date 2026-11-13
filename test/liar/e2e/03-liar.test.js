// GDD 8절 13-3: 라이어 쪽 세 가지 (가) 라이어 처형+정답 (나) 시민 처형 (다) 동점 두 번 → 연장 투표
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, setTimes, startRound, findLiar, citizenWordOf, spaced, until, waitPhase,
  speakAll, accuse, judgeMap, voteMap, waitResult,
} from './helpers.js';

const T = { judge: 15, guess: 30 };

async function begin(n, t) {
  const r = await roomN(n);
  t.after(() => r.close());
  await setTimes(r, T);
  await startRound(r);
  const liar = findLiar(r.cs);
  return { r, liar, word: citizenWordOf(r.cs, liar) };
}

async function guessNow(r, liar, text) {
  await waitPhase(r, 'guess');
  liar.guess(text);
  await waitResult(r);
}

describe('13-3 라이어 쪽 세 가지', { concurrency: true }, () => {
  it('(가) 처형된 라이어가 띄어쓰기를 바꿔 입력해도 정답 → 라이어 +1, 시민은 맞다 +2 / 아니다 +1', async (t) => {
    const { r, liar, word } = await begin(4, t);
    const [a, b, c] = r.cs.filter((x) => x !== liar);
    await speakAll(r);
    await accuse(r, liar.id);
    await judgeMap(r, { [a.id]: 'yes', [b.id]: 'yes', [c.id]: 'no' });
    await until(() => r.cs.every((c) => c.state.phase === 'unmask'), 'unmask', { clients: r.cs });
    assert.equal(r.host.state.unmask.wasLiar, true);
    const guess = spaced(word);
    await guessNow(r, liar, guess);
    const res = r.host.state.result;
    assert.equal(res.reason, 'executedLiar');
    assert.equal(res.caught, true);
    assert.equal(res.guessed, true);
    assert.equal(res.winner, 'liar');
    assert.deepEqual(res.delta, { [liar.id]: 1, [a.id]: 2, [b.id]: 2, [c.id]: 1 });
    assert.equal(r.host.state.guess.correct, true);
  });

  it('(나) 시민이 처형됨, 오답: 라이어 +1, 맞다 시민 -1, 아니다 시민 0, 처형된 시민 0', async (t) => {
    const { r, liar } = await begin(4, t);
    const [c1, c2, c3] = r.cs.filter((c) => c !== liar);
    await speakAll(r);
    await accuse(r, c1.id);
    await judgeMap(r, { [liar.id]: 'yes', [c2.id]: 'yes', [c3.id]: 'no' });
    await until(() => r.cs.every((c) => c.state.phase === 'unmask'), 'unmask', { clients: r.cs });
    assert.equal(r.host.state.unmask.id, c1.id);
    assert.equal(r.host.state.unmask.wasLiar, false);
    assert.equal(r.host.state.unmask.liarId, liar.id);
    await guessNow(r, liar, '틀린답');
    const res = r.host.state.result;
    assert.equal(res.reason, 'executedCitizen');
    assert.equal(res.caught, false);
    assert.equal(res.guessed, false);
    assert.equal(res.winner, 'liar');
    assert.deepEqual(res.delta, { [liar.id]: 1, [c1.id]: 0, [c2.id]: -1, [c3.id]: 0 });
  });

  it('(나) 시민이 처형됨, 정답: 라이어 +3', async (t) => {
    const { r, liar, word } = await begin(4, t);
    const [c1, c2, c3] = r.cs.filter((c) => c !== liar);
    await speakAll(r);
    await accuse(r, c1.id);
    await judgeMap(r, { [liar.id]: 'yes', [c2.id]: 'yes', [c3.id]: 'yes' });
    await until(() => r.cs.every((c) => c.state.phase === 'unmask'), 'unmask', { clients: r.cs });
    await guessNow(r, liar, spaced(word).toUpperCase());
    const res = r.host.state.result;
    assert.equal(res.guessed, true);
    assert.deepEqual(res.delta, { [liar.id]: 3, [c1.id]: 0, [c2.id]: -1, [c3.id]: -1 });
  });

  it('(다) 동점 → 동점자만 재투표 → 또 동점: 판은 끝나지 않고 연장 투표 → 라이어 처형으로 끝', async (t) => {
    const { r, liar, word } = await begin(6, t);
    const [p1, p2, p3, p4, p5, p6] = r.cs.map((c) => c.id);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p1, [p4]: p2, [p5]: p3, [p6]: p4 });
    await waitPhase(r, 'revote');
    assert.deepEqual([...r.host.state.candidates].sort(), [p1, p2].sort());
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p1, [p4]: p2, [p5]: p1, [p6]: p2 });
    await until(() => r.cs.every((c) => c.state.phase === 'discuss' && c.state.extendNo === 1), 'extended vote', { clients: r.cs });
    assert.equal(r.host.state.result, null);
    assert.equal(r.host.state.unmask, null);
    assert.equal(r.host.state.accused, null);
    await accuse(r, liar.id);
    await judgeMap(r, Object.fromEntries(r.cs.filter((c) => c !== liar).map((c) => [c.id, 'yes'])));
    await guessNow(r, liar, spaced(word));
    const res = r.host.state.result;
    assert.equal(res.reason, 'executedLiar');
    assert.equal(res.caught, true);
    assert.equal(res.guessed, true);
    assert.equal(res.voteLog.length, 2);
    assert.equal(res.voteLog[0].accused, null);
  });

  it('(라) 동점 두 번 → 연장 투표 중에도 방장 "이 판 끝내기"는 된다', async (t) => {
    const { r } = await begin(4, t);
    const [p1, p2, p3, p4] = r.cs.map((c) => c.id);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p4, [p4]: p3 });
    await waitPhase(r, 'revote');
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p4, [p4]: p3 });
    await until(() => r.cs.every((c) => c.state.phase === 'discuss' && c.state.extendNo === 1), 'extended vote', { clients: r.cs });
    r.host.lg('end');
    await until(() => r.cs.every((x) => x.state.phase === 'lobby'), 'back to lobby', { clients: r.cs });
    assert.equal(r.host.state.result, null);
  });
});
