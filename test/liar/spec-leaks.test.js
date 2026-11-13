// 관전 계정(관전N) 비밀 시험: 라이어 한 판을 끝까지 걸으며, 제시어 공개(answer) 전까지 관전자 기기에
// 시민 제시어·라이어 제시어·역할이 하나도 가지 않는다(대기 중 들어온 관전자, 게임 중 들어온 관전자 둘 다). 실제 허브 + 가짜 시계.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHub, drain } from '../lib/hub.js';

for (const liarMode of ['word', 'notice']) {
  test(`라이어 ${liarMode} 방식: 관전자에게는 정답 공개 전까지 제시어·역할이 없다`, async () => {
    const h = makeHub();
    const cs = [];
    for (const id of ['ann1', 'bob1', 'cat1', 'dan1']) cs.push(await h.login(id));
    await cs[0].send({ t: 'create', mode: 'liar' });
    const code = cs[0].state.code;
    for (const c of cs.slice(1)) await c.send({ t: 'join', code });
    await cs[0].send({ t: 'set', patch: { liarMode } });
    const s1 = await h.login('관전1');
    await s1.send({ t: 'join', code });
    await cs[0].send({ t: 'start' });
    const s2 = await h.login('관전2');
    await s2.send({ t: 'join', code });
    const g = h.hub.rooms.get(code).impl.game;
    const words = [g.citizenWord, g.liarWord].filter(Boolean);
    assert.ok(words.length >= 1);
    const phases = [];
    for (let i = 0; i < 40; i++) {
      const st = cs[0].state;
      phases.push(st.phase);
      if (st.phase === 'answer' || st.phase === 'result') break;
      for (const s of [s1, s2]) {
        assert.deepEqual(s.state.my, { word: null, role: null }, `${st.phase}: ${s.id} my`);
        assert.equal(s.state.words, null);
        const all = JSON.stringify(s.sock.msgs);
        for (const w of words) assert.equal(all.includes(w), false, `${st.phase}: ${s.id} 가 제시어를 받음`);
        assert.equal(/"role":"(liar|citizen)"/.test(all), false, `${st.phase}: ${s.id} 가 역할을 받음`);
      }
      h.clock.advance(Math.max(1, st.phaseEndsAt - h.clock.now() + 1));
      await drain();
    }
    assert.ok(phases.includes('discuss'), `단계를 걸었다: ${phases.join(' ')}`);
  });
}
