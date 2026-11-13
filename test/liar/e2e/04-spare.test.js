// GDD 8절 13-4: 살리기, 방장 "이 판 끝내기", 정답 기회 1번
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, room3, setTimes, startRound, findLiar, citizenWordOf, until, waitPhase,
  speakAll, accuse, judgeMap, waitResult,
} from './helpers.js';

const T = { judge: 15, guess: 30 };

describe('13-4 살리기와 끝내기', { concurrency: true }, () => {
  it('살림 4번(동수·전원 아니다·기권 포함) 뒤 5번째에 처형, 쉬는 단계 없음, voteLog 5줄, 점수는 마지막 표만', async (t) => {
    const r = await roomN(5);
    t.after(() => r.close());
    await setTimes(r, T);
    await startRound(r);
    const liar = findLiar(r.cs);
    const [a, b, c, d] = r.cs.filter((x) => x !== liar);
    await speakAll(r);
    const rounds = [
      { [a.id]: 'yes', [b.id]: 'yes', [c.id]: 'no', [d.id]: 'no' }, // 2 대 2 동수 → 살림
      { [a.id]: 'no', [b.id]: 'no', [c.id]: 'no', [d.id]: 'no' }, // 전원 아니다
      { [a.id]: 'yes', [b.id]: 'no', [c.id]: 'no' }, // d 기권 → 1 대 2
      { [a.id]: 'yes', [b.id]: 'no', [c.id]: 'no', [d.id]: 'no' },
      { [a.id]: 'yes', [b.id]: 'yes', [c.id]: 'yes', [d.id]: 'no' }, // 3 대 1 → 처형
    ];
    for (let i = 0; i < rounds.length; i++) {
      await accuse(r, liar.id, i + 1);
      assert.equal(r.host.state.accuseNo, i + 1);
      await judgeMap(r, rounds[i]);
      if (i < rounds.length - 1) {
        await waitPhase(r, 'judged', i + 1);
        await waitPhase(r, 'discuss', i + 2);
      }
    }
    // 살린 뒤에는 쉬는 단계 없이 judged 다음이 바로 discuss
    const seq = r.host.phaseLog.map((x) => x.phase);
    for (let i = 0; i < seq.length - 1; i++) if (seq[i] === 'judged') assert.ok(['discuss', 'unmask'].includes(seq[i + 1]), `judged 다음 ${seq[i + 1]}`);
    await until(() => r.cs.every((x) => x.state.phase === 'guess'), 'guess', { clients: r.cs });
    liar.guess('틀린답');
    await waitResult(r);
    const res = r.host.state.result;
    assert.equal(res.voteLog.length, 5);
    assert.deepEqual(res.voteLog.map((x) => x.no), [1, 2, 3, 4, 5]);
    assert.deepEqual(res.voteLog.map((x) => x.executed), [false, false, false, false, true]);
    assert.ok(res.voteLog.every((x) => x.accused === liar.id));
    assert.deepEqual(res.voteLog[0].picks, rounds[0]);
    assert.deepEqual(res.voteLog[4].picks, rounds[4]);
    assert.equal(res.reason, 'executedLiar');
    assert.equal(res.winner, 'citizens');
    // 마지막 표만: a b c = 맞다 +2, d = 아니다 +1, 라이어는 들키고 오답 0
    assert.deepEqual(res.delta, { [liar.id]: 0, [a.id]: 2, [b.id]: 2, [c.id]: 2, [d.id]: 1 });
  });

  it('방장 "이 판 끝내기": 방장이 아니면 거절, 방장이면 무효로 방 대기, 점수 없음, 다시 시작 가능', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    await setTimes(r, T);
    await startRound(r);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const other = r.cs[1];
    other.lg('end');
    await until(() => other.errors.length > 0, 'non-host end refused', { clients: r.cs });
    assert.equal(r.host.state.phase, 'discuss');
    r.host.lg('end');
    await until(() => r.cs.every((x) => x.state.phase === 'lobby'), 'back to lobby', { clients: r.cs });
    assert.equal(r.host.state.result, null);
    assert.ok(r.host.state.players.every((p) => p.score === 0));
    assert.ok(r.cs.every((x) => x.state.my.word === null && x.state.my.role === null));
    // 다음 판은 시작할 수 있다
    await startRound(r, 2);
    assert.equal(r.host.state.round, 2);
  });

  it('3명 방에서도 정답 기회는 한 번: 두 번째 시도와 시민의 시도는 거절', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    await setTimes(r, T);
    await startRound(r);
    const liar = findLiar(r.cs);
    const word = citizenWordOf(r.cs, liar);
    const [a, b] = r.cs.filter((x) => x !== liar);
    await speakAll(r);
    await accuse(r, liar.id);
    await judgeMap(r, { [a.id]: 'yes', [b.id]: 'yes' });
    await waitPhase(r, 'guess');
    a.guess(word);
    await until(() => a.errors.length > 0, 'citizen guess refused', { clients: r.cs });
    assert.equal(r.host.state.phase, 'guess');
    liar.guess('틀린답');
    await waitResult(r);
    assert.equal(r.host.state.result.guessed, false);
    const before = JSON.stringify(r.host.state.result);
    liar.guess(word);
    await until(() => liar.errors.length > 0, 'second guess refused', { clients: r.cs });
    assert.equal(JSON.stringify(r.host.state.result), before);
    assert.equal(r.host.state.guess.correct, false);
  });
});
