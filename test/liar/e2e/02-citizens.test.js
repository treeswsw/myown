// GDD 8절 13-2: 시민 승리 한 판 (진짜 서버 + ws, 빠른 시계)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, setTimes, startRound, findLiar, until, waitPhase, speakAll, accuse, judgeMap, voteMap, waitResult, sleep,
} from './helpers.js';

const T = { judge: 15, guess: 30 };

async function begin(n, t, { k = 20, times = T } = {}) {
  const r = await roomN(n, { k });
  t.after(() => r.close());
  await setTimes(r, times);
  await startRound(r);
  return { r, liar: findLiar(r.cs) };
}

/** c 가 다음에 받을 오류 문장을 기다린다. */
async function nextError(r, c, send) {
  const before = c.errors.length;
  send();
  await until(() => c.errors.length > before, `${c.id} 오류 응답`, { clients: r.cs });
  return c.errors.at(-1);
}

const byId = (r, id) => r.cs.find((c) => c.id === id);

describe('13-2 시민 승리 한 판', { concurrency: true }, () => {
  it('첫 설명: 차례 아닌 사람은 못 침, 한 줄 보내면 바로 다음 사람, 첫 발언 모음에 순서대로 쌓임', async (t) => {
    const { r } = await begin(5, t, { k: 10 });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    assert.equal(order.length, 5);
    assert.equal(r.host.state.speaker, order[0]);
    assert.equal(r.host.state.settings.times.speak, 20);
    // 첫 발언 모음은 지금 차례인 사람 칸(비어 있음)까지만 보인다
    assert.deepEqual(r.host.state.firstSays, [{ id: order[0], text: null, late: false }]);

    // 차례가 아직 안 온 사람: say 거절
    const later = byId(r, order[3]);
    assert.match(await nextError(r, later, () => later.say('먼저 쓸래')), /아직 차례가 아닙니다/);
    // 첫 설명 중에는 보통 채팅도 거절
    assert.match(await nextError(r, later, () => later.send({ t: 'chat', text: '채팅' })), /첫 설명 중에는/);
    assert.equal(r.host.state.speaker, order[0]);
    assert.deepEqual(r.host.state.firstSays.map((x) => x.text), [null]);

    // 차례인 사람이 한 줄 → 바로 다음 사람
    const first = byId(r, order[0]);
    first.say('첫번째 설명');
    await until(() => r.cs.every((c) => c.state.speaker === order[1]), 'next speaker', { clients: r.cs });
    assert.deepEqual(r.host.state.firstSays, [
      { id: order[0], text: '첫번째 설명', late: false },
      { id: order[1], text: null, late: false },
    ]);
    // 이미 쓴 사람이 또 쓰면 거절
    assert.match(await nextError(r, first, () => first.say('한 번 더')), /이미 첫 설명을 썼습니다/);

    // 나머지도 차례대로, 끝나면 토론·투표
    for (let i = 1; i < order.length; i++) {
      assert.equal(r.host.state.speaker, order[i]);
      const sp = byId(r, order[i]);
      sp.say(`설명${i + 1}`);
      await until(() => r.cs.every((c) => c.state.speaker !== order[i] || c.state.phase !== 'speak'), `after ${order[i]}`, { clients: r.cs });
    }
    await waitPhase(r, 'discuss', 1);
    assert.deepEqual(r.host.state.firstSays.map((x) => x.id), order);
    assert.deepEqual(r.host.state.firstSays.map((x) => x.text), ['첫번째 설명', '설명2', '설명3', '설명4', '설명5']);
    assert.ok(r.host.state.firstSays.every((x) => x.late === false));
    // 모두에게 같은 모음, chat 알림은 말한 순서
    for (const c of r.cs) assert.deepEqual(c.state.firstSays, r.host.state.firstSays);
    const says = r.host.events.filter((e) => e.k === 'chat' && e.kind === 'say');
    assert.deepEqual(says.map((e) => e.id), order);
  });

  it('(가) 다른 사람이 첫 설명 중일 때 늦은 한 줄: 차례·시간 그대로, 안 온 차례·이미 쓴 사람은 거절', async (t) => {
    const { r } = await begin(5, t, { k: 10 });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    // 첫 사람이 시간 안에 못 씀 → 다음 사람 차례로 넘어감 (20초 = 실제 2초)
    await until(() => r.host.state.speaker === order[1], '시간 초과로 다음 차례', { clients: r.cs, timeout: 6000 });
    assert.equal(r.host.state.phase, 'speak');
    assert.equal(r.host.state.firstSays[0].text, null);

    const endsBefore = r.host.state.phaseEndsAt;
    const late = byId(r, order[0]);
    late.say('늦게 씀');
    await until(() => r.cs.every((c) => c.state.firstSays[0].text === '늦게 씀'), 'late say', { clients: r.cs });
    assert.equal(r.host.state.firstSays[0].late, true);
    assert.equal(r.host.state.speaker, order[1], '늦은 한 줄은 차례를 바꾸지 않는다');
    assert.equal(r.host.state.phase, 'speak');
    assert.equal(r.host.state.phaseEndsAt, endsBefore, '남은 시간도 그대로');
    assert.ok(r.host.events.some((e) => e.k === 'chat' && e.id === order[0] && e.kind === 'late' && e.text === '늦게 씀'));

    // 거절: 이미 쓴 사람, 차례가 아직 안 온 사람
    assert.match(await nextError(r, late, () => late.say('또 씀')), /이미 첫 설명을 썼습니다/);
    const notYet = byId(r, order[4]);
    assert.match(await nextError(r, notYet, () => notYet.say('미리 씀')), /아직 차례가 아닙니다/);
    assert.equal(r.host.state.firstSays.find((x) => x.id === order[4])?.text ?? null, null);
    assert.equal(r.host.state.speaker, order[1]);

    // 정상 차례는 영향 없이 계속
    for (let i = 1; i < order.length; i++) {
      const sp = byId(r, order[i]);
      await until(() => r.host.state.speaker === order[i] || r.host.state.phase !== 'speak', `turn ${order[i]}`, { clients: r.cs });
      if (r.host.state.phase !== 'speak') break;
      sp.say(`설명${i + 1}`);
    }
    await waitPhase(r, 'discuss', 1);
    assert.equal(r.host.state.firstSays[0].text, '늦게 씀');
    assert.equal(r.host.state.firstSays[0].late, true);
  });

  it('(나) 첫 토론·투표(재투표 포함) 중 늦은 한 줄은 되고, 첫 지목이 결정된 뒤에는 거절', async (t) => {
    const { r } = await begin(4, t, { k: 20 });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    // 앞의 둘은 쓰지 않고 시간 초과 (20초 = 실제 1초씩)
    await until(() => r.host.state.speaker === order[2], '둘 건너뜀', { clients: r.cs, timeout: 6000 });
    byId(r, order[2]).say('셋째');
    await until(() => r.host.state.speaker === order[3], 'speaker 4', { clients: r.cs });
    byId(r, order[3]).say('넷째');
    await waitPhase(r, 'discuss', 1);
    assert.deepEqual(r.host.state.firstSays.map((x) => x.text), [null, null, '셋째', '넷째']);

    // 첫 토론·투표 중 늦은 한 줄
    byId(r, order[0]).say('첫째 늦게');
    await until(() => r.host.state.firstSays[0].text === '첫째 늦게', 'late in discuss', { clients: r.cs });
    assert.equal(r.host.state.firstSays[0].late, true);
    assert.equal(r.host.state.phase, 'discuss');
    assert.equal(r.host.state.accuseNo, 1);

    // 동점 → 재투표(첫 지목이 아직 안 정해짐): 이때도 된다
    const [p1, p2, p3, p4] = order;
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p4, [p4]: p3 });
    await waitPhase(r, 'revote');
    assert.equal(r.host.state.accuseNo, 1);
    byId(r, order[1]).say('둘째 재투표 중');
    await until(() => r.host.state.firstSays[1].text === '둘째 재투표 중', 'late in revote', { clients: r.cs });
    assert.equal(r.host.state.firstSays[1].late, true);
    assert.equal(r.host.state.phase, 'revote');

    // 첫 지목이 결정되면 (변론) 더 이상 거절. 위에서 다 썼으니 이미 쓴 사람 말고 새로 비우는 방법이 없어
    // 대신 "거절 문장"이 이미 쓴 것과 같은지 확인하는 대신 단계 자체로 거절되는지를 본다.
    await voteMap(r, { [p1]: p2, [p2]: p1, [p3]: p1, [p4]: p1 });
    await waitPhase(r, 'defense', 1);
    const before = JSON.stringify(r.host.state.firstSays);
    assert.match(await nextError(r, byId(r, p3), () => byId(r, p3).say('변론 때 추가')), /이미 첫 설명을 썼습니다|지금은 첫 설명을 쓸 수 없습니다/);
    assert.equal(JSON.stringify(r.host.state.firstSays), before);
  });

  it('첫 지목 뒤에는 비어 있는 사람도 늦은 한 줄을 못 쓴다 (변론·재토론)', async (t) => {
    const { r } = await begin(4, t, { k: 20 });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    // 첫 사람만 건너뜀
    await until(() => r.host.state.speaker === order[1], '하나 건너뜀', { clients: r.cs, timeout: 6000 });
    for (let i = 1; i < 4; i++) {
      await until(() => r.host.state.speaker === order[i], `turn ${i}`, { clients: r.cs });
      byId(r, order[i]).say(`설명${i}`);
    }
    await waitPhase(r, 'discuss', 1);
    const target = order[1];
    await accuse(r, target, 1);
    const empty = byId(r, order[0]);
    assert.equal(r.host.state.firstSays[0].text, null);
    assert.match(await nextError(r, empty, () => empty.say('지목 뒤 추가')), /지금은 첫 설명을 쓸 수 없습니다/);
    assert.equal(r.host.state.firstSays[0].text, null);
    // 변론이 끝나고 찬반에서 살리면 두 번째 지목 토론: 거절
    await judgeMap(r, Object.fromEntries(r.cs.filter((c) => c.id !== target).map((c) => [c.id, 'no'])));
    await waitPhase(r, 'discuss', 2);
    assert.match(await nextError(r, empty, () => empty.say('두번째 토론 추가')), /지금은 첫 설명을 쓸 수 없습니다/);
    assert.equal(r.host.state.firstSays[0].text, null);
  });

  it('표 바꾸기: 화살표가 옮겨 가고, 같은 사람을 다시 찍으면 취소', async (t) => {
    const { r } = await begin(4, t);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const [a, b, c, d] = r.cs.map((x) => x.id);
    r.cs[0].vote(b);
    await until(() => r.cs.every((x) => x.state.votes[a] === b), 'vote a->b', { clients: r.cs });
    r.cs[0].vote(c); // 바꾸기
    await until(() => r.cs.every((x) => x.state.votes[a] === c), 'vote a->c', { clients: r.cs });
    assert.deepEqual(r.host.state.votes, { [a]: c });
    r.cs[0].vote(c); // 같은 사람 다시 = 취소
    await until(() => r.cs.every((x) => x.state.votes[a] === undefined), 'vote cancel', { clients: r.cs });
    assert.deepEqual(r.host.state.votes, {});
    // 자기 자신은 못 찍음
    assert.match(await nextError(r, r.cs[3], () => r.cs[3].vote(d)), /자기 자신/);
    // 이벤트는 prev 를 담아 화살표가 옮겨 가게 함
    const ev = r.host.events.filter((e) => e.k === 'vote' && e.from === a);
    assert.deepEqual(ev.map((e) => [e.to, e.prev]), [[b, null], [c, b], [null, c]]);
  });

  it('토론·투표 30초 뒤 전원이 찍으면 5초로 줄어듦 (30초 전에 찍으면 30초까지 기다렸다가)', async (t) => {
    const { r } = await begin(4, t);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const end0 = r.host.state.phaseEndsAt;
    const start = end0 - 60_000; // 토론·투표 60초(최솟값)
    const [a, b, c, d] = r.cs.map((x) => x.id);
    await voteMap(r, { [a]: b, [b]: a, [c]: b, [d]: b });
    // 30초가 지나기 전이라 아직 안 줄어듦 (빠른 시계 20배: 30초 = 실제 1.5초)
    assert.ok(r.fast.now() < start + 30_000, '아직 30초 전');
    assert.equal(r.host.state.phaseEndsAt, end0);
    assert.equal(r.host.state.phase, 'discuss');
    // 30초 지점에 5초로 줄어듦 → 끝나는 시각 = 시작 + 35초
    await until(() => r.host.state.phaseEndsAt !== end0, '5초로 줄어듦', { clients: r.cs });
    assert.equal(r.host.state.phaseEndsAt, start + 35_000);
    assert.equal(r.host.state.phase, 'discuss');
    await waitPhase(r, 'defense', 1);
    assert.equal(r.host.state.accused, b);
    assert.ok(r.fast.now() < end0 - 20_000, '60초를 다 채우지 않고 넘어옴');
  });

  it('찬반: "아니다 / 맞다"만, 지목된 사람은 못 고름, 누가 무엇을 골랐는지 바로 모두에게 보이고 전원 선택 시 5초로 줄어듦', async (t) => {
    const { r, liar } = await begin(5, t, { k: 10 });
    const others = r.cs.filter((c) => c !== liar);
    await speakAll(r);
    await accuse(r, liar.id);
    await until(() => r.cs.every((c) => c.state.phase === 'judge'), 'judge', { clients: r.cs });
    const endBefore = r.host.state.phaseEndsAt;
    assert.deepEqual(r.host.state.judge, { picks: {}, executed: null });
    // 지목된 사람은 못 고름, 이상한 값도 거절
    assert.match(await nextError(r, liar, () => liar.judge('yes')), /지목된 사람은 고를 수 없습니다/);
    assert.match(await nextError(r, others[0], () => others[0].judge('maybe')), /잘못된 요청|맞다 또는 아니다만/);
    // 고르는 대로 모두에게 바로 보임
    others[0].judge('yes');
    await until(() => r.cs.every((c) => c.state.judge?.picks[others[0].id] === 'yes'), 'pick 1', { clients: r.cs });
    others[1].judge('no');
    await until(() => r.cs.every((c) => c.state.judge?.picks[others[1].id] === 'no'), 'pick 2', { clients: r.cs });
    others[1].judge('yes'); // 바꾸기
    await until(() => r.cs.every((c) => c.state.judge?.picks[others[1].id] === 'yes'), 'pick change', { clients: r.cs });
    assert.equal(r.host.state.phaseEndsAt, endBefore, '전원이 안 골랐으면 그대로');
    others[2].judge('no');
    others[3].judge('yes');
    await until(() => r.host.state.phaseEndsAt < endBefore || r.host.state.phase !== 'judge', '전원 선택 → 줄어듦', { clients: r.cs });
    if (r.host.state.phase === 'judge') assert.ok(r.host.state.phaseEndsAt - r.fast.now() <= 5000);
    for (const c of r.cs.filter((x) => x.state.phase === 'judge')) {
      assert.deepEqual(c.state.judge.picks, {
        [others[0].id]: 'yes', [others[1].id]: 'yes', [others[2].id]: 'no', [others[3].id]: 'yes',
      });
    }
    await waitPhase(r, 'judged');
    assert.equal(r.host.state.judge.executed, true);
    assert.ok(r.host.events.some((e) => e.k === 'judged' && e.executed === true));
  });

  it('최후 변론: 지목된 사람만 글을 쓰고 kind 는 plea', async (t) => {
    const { r, liar } = await begin(5, t, { k: 10 });
    const others = r.cs.filter((c) => c !== liar);
    await speakAll(r);
    await accuse(r, liar.id);
    assert.equal(r.host.state.phase, 'defense');
    // 지목되지 않은 사람은 거절
    assert.match(await nextError(r, others[0], () => others[0].send({ t: 'chat', text: '나도 말할래' })), /지목된 사람만/);
    liar.send({ t: 'chat', text: '저는 라이어가 아닙니다' });
    await until(() => r.cs.every((c) => c.events.some((e) => e.k === 'chat' && e.kind === 'plea')), 'plea event', { clients: r.cs });
    const plea = r.host.events.find((e) => e.k === 'chat' && e.kind === 'plea');
    assert.equal(plea.id, liar.id);
    assert.equal(plea.text, '저는 라이어가 아닙니다');
    // 찬반 중에도 지목된 사람만
    await until(() => r.cs.every((c) => c.state.phase === 'judge'), 'judge', { clients: r.cs });
    assert.match(await nextError(r, others[1], () => others[1].send({ t: 'chat', text: '끼어들기' })), /지목된 사람만/);
    await sleep(60); // 채팅 간격 1초(빠른 시계)를 넘김
    liar.send({ t: 'chat', text: '찬반 중 한마디' });
    await until(() => r.cs.every((c) => c.events.some((e) => e.k === 'chat' && e.text === '찬반 중 한마디' && e.kind === 'plea')), 'plea in judge', { clients: r.cs });
    // 변론 글은 채팅 기록에도 plea 로 남음
    assert.ok(r.host.events.filter((e) => e.k === 'chat' && e.kind === 'plea').length >= 2);
  });

  it('처형(라이어) → "그는 라이어가 맞습니다" → 오답 → 시민 +2/+1, 라이어 0, players[].score 반영, 나가면 누적에 더해짐', async (t) => {
    const { r, liar } = await begin(5, t, { k: 10 });
    const [a, b, c, d] = r.cs.filter((x) => x !== liar);
    await speakAll(r);
    await accuse(r, liar.id);
    // a b c 맞다, d 기권 → 처형 (3 대 0)
    await judgeMap(r, { [a.id]: 'yes', [b.id]: 'yes', [c.id]: 'yes' });
    await until(() => r.cs.every((x) => x.state.phase === 'unmask'), 'unmask', { clients: r.cs });
    assert.equal(r.host.state.unmask.id, liar.id);
    assert.equal(r.host.state.unmask.wasLiar, true);
    // 점수는 결과 전까지 0
    assert.ok(r.host.state.players.every((p) => p.score === 0));
    await waitPhase(r, 'guess');
    liar.guess('완전히틀린답');
    await waitResult(r);
    const res = r.host.state.result;
    assert.equal(res.winner, 'citizens');
    assert.equal(res.reason, 'executedLiar');
    assert.equal(res.liarId, liar.id);
    assert.deepEqual(res.delta, { [liar.id]: 0, [a.id]: 2, [b.id]: 2, [c.id]: 2, [d.id]: 0 });
    // 방 점수 반영: 모두의 화면에서 같음
    for (const x of r.cs) {
      const scores = Object.fromEntries(x.state.players.map((p) => [p.id, p.score]));
      assert.deepEqual(scores, { [liar.id]: 0, [a.id]: 2, [b.id]: 2, [c.id]: 2, [d.id]: 0 }, `${x.id} 가 보는 점수`);
    }
    // 방에 있는 동안 누적은 아직 그대로 0
    const rank = async (x) => {
      x.lgRank = null;
      x.lg('rank');
      await until(() => x.lgRank, `rank ${x.id}`, { clients: r.cs });
      return x.lgRank;
    };
    assert.equal((await rank(a)).mine.score, 0);
    // 나가면 누적에 더해짐
    for (const [x, want] of [[a, 2], [d, 0], [liar, 0]]) {
      x.send({ t: 'leave' });
      await until(() => x.state === null || x.msgs.at(-1)?.t === 'me' || x.msgs.some((m) => m.t === 'room' && m.state === null), `leave ${x.id}`, { clients: r.cs });
      assert.equal((await rank(x)).mine.score, want, `${x.id} 누적`);
    }
    // 나간 사람 몫은 남은 사람 화면의 방 점수에서 빠지지만, 남은 사람(b, c)의 방 점수는 그대로
    const watcher = r.cs.find((x) => [b.id, c.id].includes(x.id));
    await until(() => watcher.state.players.length === 2, 'two left', { clients: r.cs });
    assert.deepEqual(Object.fromEntries(watcher.state.players.map((p) => [p.id, p.score])), { [b.id]: 2, [c.id]: 2 });
    assert.equal((await rank(b)).mine.score, 0, 'b 는 아직 방에 있으니 누적 그대로');
    const top = (await rank(watcher)).top;
    assert.ok(Array.isArray(top));
  });
});
