// GDD 8절 13-1: 모이기와 역할 (진짜 서버 + ws, 빠른 시계)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, room3, setTimes, setSettings, startRound, findLiar, citizenWordOf, until, waitPhase,
  speakAll, accuse, judgeMap, shape, preUnmaskEnd, rawFromRevealToUnmask,
} from './helpers.js';

const stripPrivate = (s) => { const { now, you, my, ...rest } = s; return rest; };

function noLiarMarks(c, others = []) {
  const text = rawFromRevealToUnmask(c).join('\n');
  assert.ok(!/"role":"(liar|citizen)"/.test(text), `${c.id}: 역할 표시가 없어야 함`);
  assert.ok(!/"liarId":"/.test(text), `${c.id}: liarId 가 없어야 함`);
  assert.ok(!/"liarWord"|"citizenWord"|"wasLiar":(true|false)/.test(text), `${c.id}: 정답·정체 칸이 없어야 함`);
  assert.ok(!/당신은 라이어|라이어입니다/.test(text), `${c.id}: 라이어 안내 문구가 없어야 함`);
  for (const w of others) assert.ok(!text.includes(`"${w}"`), `${c.id}: 남의 제시어 ${w} 가 없어야 함`);
}

describe('13-1 모이기와 역할', { concurrency: true }, () => {
  it('다른 제시어 방식: 시민 둘은 같은 제시어, 라이어는 다른 제시어, 라이어가 받은 원본에 라이어 표시 없음', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    assert.equal(r.host.state.hostId, 'alpha');
    assert.equal(r.host.state.settings.liarMode, 'word');
    await setTimes(r);
    await startRound(r);
    const liar = findLiar(r.cs);
    const citizens = r.cs.filter((c) => c !== liar);
    const cw = citizenWordOf(r.cs, liar);
    const lw = liar.state.my.word;
    assert.notEqual(cw, lw);
    assert.equal(citizens[0].state.my.word, citizens[1].state.my.word);
    assert.ok(r.cs.every((c) => c.state.topic && c.state.topic === r.host.state.topic));
    assert.ok(r.cs.every((c) => c.state.my.role === null), '정체 공개 전에는 아무도 role 이 없다');

    // 판을 정체 공개까지 돌린다: 라이어를 처형
    await speakAll(r);
    await accuse(r, liar.id);
    await judgeMap(r, Object.fromEntries(citizens.map((c) => [c.id, 'yes'])));
    await until(() => r.cs.every((c) => ['unmask', 'guess'].includes(c.state.phase)), 'unmask', { clients: r.cs });

    // 라이어가 정체 공개 전까지 받은 원본: 라이어 표시·남의 제시어 없음
    noLiarMarks(liar, [cw]);
    for (const c of citizens) noLiarMarks(c, [lw]);
    // 라이어 시점과 시민 시점의 메시지 모양이 같다 (종류 순서, room 모양, my 와 now 와 you 를 뺀 값)
    const kinds = (c) => c.msgs.slice(c.msgs.findIndex((m) => m.t === 'room' && m.state?.phase === 'reveal'), preUnmaskEnd(c))
      .map((m) => (m.t === 'event' ? `event:${m.e.k}` : m.t));
    const rooms = (c) => c.msgs.slice(c.msgs.findIndex((m) => m.t === 'room' && m.state?.phase === 'reveal'), preUnmaskEnd(c))
      .filter((m) => m.t === 'room').map((m) => m.state);
    assert.deepEqual(kinds(liar), kinds(citizens[0]));
    const lr = rooms(liar);
    const cr = rooms(citizens[0]);
    assert.equal(lr.length, cr.length);
    for (let i = 0; i < lr.length; i++) {
      assert.deepEqual(shape(lr[i]), shape(cr[i]), `room ${i} 모양`);
      assert.deepEqual(stripPrivate(lr[i]), stripPrivate(cr[i]), `room ${i} 값(my·now·you 제외)`);
    }
    // 정체 공개 순간부터는 알려진다
    assert.equal(liar.state.unmask.liarId, liar.id);
    assert.equal(liar.state.unmask.wasLiar, true);
    assert.equal(liar.state.my.role, 'liar');
  });

  it('라이어 알림 방식: 라이어만 role 과 주제를 받고 제시어는 없다', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    await setSettings(r, { liarMode: 'notice' });
    await setTimes(r);
    await startRound(r);
    const liar = findLiar(r.cs);
    const citizens = r.cs.filter((c) => c !== liar);
    assert.equal(liar.state.my.role, 'liar');
    assert.equal(liar.state.my.word, null);
    assert.ok(liar.state.topic);
    for (const c of citizens) {
      assert.equal(c.state.my.role, 'citizen');
      assert.equal(typeof c.state.my.word, 'string');
    }
    assert.equal(citizens[0].state.my.word, citizens[1].state.my.word);
    // 시민이 받은 원본에는 라이어가 누군지 없다
    for (const c of citizens) {
      const text = rawFromRevealToUnmask(c).join('\n');
      assert.ok(!/"role":"liar"/.test(text) && !/"liarId":"/.test(text), `${c.id}: 라이어 정체가 없어야 함`);
    }
    // 라이어의 받은 원본에도 시민 제시어는 없다
    assert.ok(!rawFromRevealToUnmask(liar).join('\n').includes(`"${citizens[0].state.my.word}"`));
  });

  it('방장이 직접 주제: 고른 주제로 시작하고, 안 고르면 거절', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    await setSettings(r, { topicMode: 'host' });
    r.host.send({ t: 'start' });
    await until(() => r.host.errors.some((e) => e.includes('주제를 먼저 골라')), 'start refused', { clients: r.cs });
    assert.equal(r.host.state.phase, 'lobby');
    const topics = r.host.state.settings.topics.map((x) => x.name);
    assert.ok(topics.length >= 3);
    const pick = topics[2];
    r.host.lg('settings', { nextTopic: pick });
    await until(() => r.host.state.settings.nextTopic === pick, 'nextTopic', { clients: r.cs });
    await startRound(r);
    assert.ok(r.cs.every((c) => c.state.topic === pick), '고른 주제로 시작');
    assert.equal(r.host.state.settings.nextTopic, null, '시작하면 nextTopic 이 비워진다');
  });

  it('방장이 아니면 시작할 수 없고, 3명 미만이면 시작할 수 없다', async (t) => {
    const r = await roomN(2);
    t.after(() => r.close());
    r.cs[1].send({ t: 'start' });
    await until(() => r.cs[1].errors.length > 0, 'non-host start refused', { clients: r.cs });
    r.host.send({ t: 'start' });
    await until(() => r.host.errors.some((e) => e.includes('3명')), 'too few', { clients: r.cs });
    assert.ok(r.cs.every((c) => c.state.phase === 'lobby'));
  });
});
