// 관전 계정(관전N) 비밀 시험: 갱식마인드 문제 여러 개를 실제 허브로 돌리며, 공개(reveal) 전까지 관전자 기기에
// 후보 단어·정답(다른 이름 포함)·정답자끼리 글이 하나도 가지 않는다. 관전자는 게임 중 채팅할 수 없고(정답 판정·누설 길 차단),
// 그림 선·공개 글·맞힘 알림·방 상태는 받는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, events } from '../lib/hub.js';

const errOf = (c, from) => c.sock.msgs.slice(from).filter((m) => m.t === 'error').at(-1)?.code;

test('갱식마인드: 관전자에게는 공개 전까지 단어·정답자끼리 글이 없다', async () => {
  const h = makeHub();
  const cs = [];
  for (const id of ['ann1', 'bob1', 'cat1']) cs.push(await h.login(id));
  await cs[0].send({ t: 'create', mode: 'draw' });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  const s = await h.login('관전1');
  await s.send({ t: 'join', code });
  await cs[0].send({ t: 'start' });
  const room = h.hub.rooms.get(code);
  for (let q = 0; q < 2; q++) {
    const g = room.impl.g;
    assert.equal(g.phase, 'pick', `문제 ${q + 1}`);
    const names = g.cur.cands.flatMap((c) => [c.w, ...(c.alt ?? [])]);
    const mark = s.sock.msgs.length;
    const drawer = cs.find((c) => c.id === g.cur.drawerId);
    const [g1, g2] = cs.filter((c) => c !== drawer);
    await drawer.send({ t: 'dr', a: 'pick', i: q % 3 });
    await drawer.send({ t: 'dr', a: 'st', c: 1, w: 3, e: 0, p: [100, 100] });
    await h.tick(1100);
    await g1.send({ t: 'chat', text: drawer.state.word });
    await h.tick(1100);
    await g1.send({ t: 'chat', text: `비밀 대화 ${q}` });
    const n = s.sock.msgs.length;
    await s.send({ t: 'chat', text: drawer.state.word });
    assert.equal(errOf(s, n), 'dr_spec', '관전자는 게임 중 채팅 불가(정답 판정 길 없음)');
    assert.equal(g.cur.hits.some((x) => x.id === '관전1'), false);
    assert.equal(s.state.word, null);
    assert.equal(s.state.choices, null);
    const got = JSON.stringify(s.sock.msgs.slice(mark));
    for (const w of [...names, `비밀 대화 ${q}`]) assert.equal(got.includes(w), false, `관전자가 ${w} 를 받음`);
    assert.ok(events(s, 'drSt').length > q, '그림 선은 받는다');
    assert.ok(events(s, 'drHit').length > q, '맞힘 알림은 받는다');
    const n2 = s.sock.msgs.length;
    await s.send({ t: 'emote', e: 1 });
    assert.equal(errOf(s, n2), undefined, '이모티콘은 된다');
    await g2.send({ t: 'chat', text: drawer.state.word }); // 모두 맞힘 -> 공개
    await h.tick(1100);
    assert.equal(room.impl.g.phase, 'reveal');
    assert.ok(s.state.reveal, '공개 단계는 관전자도 본다');
    room.impl.skipNow(); // 다음 문제
  }
});
