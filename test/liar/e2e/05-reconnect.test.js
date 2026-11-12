// GDD 8절 13-5: 끊김과 재접속 (진짜 서버 + ws, 빠른 시계)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, setTimes, setSettings, startRound, findLiar, until, waitPhase, speakAll, waitResult, client, sleep,
} from './helpers.js';

const T = { judge: 15, guess: 30, discuss: 180 };
const JPEG = 'data:image/jpeg;base64,/9j/AAAA';
const AUDIO = 'data:audio/webm;base64,AAAA';

async function begin(n, t, { k = 20, timing, times = T, settings } = {}) {
  const r = await roomN(n, { k, timing });
  t.after(() => r.close());
  await setTimes(r, times);
  if (settings) await setSettings(r, settings);
  await startRound(r);
  return r;
}

const byId = (r, id) => r.cs.find((c) => c.id === id);

/** 접속을 끊고(서버가 끊김을 알아챌 때까지) 같은 아이디로 다시 붙는다. r.cs 의 자리를 새 접속으로 바꾼다. */
async function dropAndBack(r, id, { waitAway = true } = {}) {
  const old = byId(r, id);
  const watcher = r.cs.find((c) => c.id !== id);
  old.close();
  if (waitAway) {
    await until(() => watcher.state.players.find((p) => p.id === id)?.connected === false, `${id} 끊김`, { clients: r.cs });
  }
  const fresh = await client(r.app, id);
  r.cs[r.cs.indexOf(old)] = fresh;
  if (r.host === old) r.host = fresh;
  await until(() => fresh.state?.phase, `${id} 복구 state`, { clients: r.cs });
  return fresh;
}

describe('13-5 끊김과 재접속', { concurrency: true }, () => {
  it('새로고침: 같은 자리·제시어·남은 시간·첫 발언 모음·채팅 기록이 복구되고 다른 사람은 away → back 을 봄', async (t) => {
    const r = await begin(4, t);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const target = r.cs[2];
    const talker = r.cs[1];
    talker.send({ t: 'chat', text: '토론중 한마디' });
    await until(() => target.events.some((e) => e.k === 'chat' && e.kind === 'talk'), 'talk chat', { clients: r.cs });
    const before = target.state;
    const seat = before.players.find((p) => p.id === target.id);
    const watcher = r.cs[0];

    const fresh = await dropAndBack(r, target.id);
    assert.ok(watcher.events.some((e) => e.k === 'away' && e.id === target.id), 'away 알림');
    const mid = watcher.state.players; // back 이후 상태가 아니라 away 중 상태는 위에서 확인됨
    void mid;
    await until(() => watcher.state.players.find((p) => p.id === target.id).connected === true, 'back', { clients: r.cs });
    assert.ok(watcher.events.some((e) => e.k === 'back' && e.id === target.id), 'back 알림');
    assert.equal(watcher.state.players.find((p) => p.id === target.id).awayUntil, null);

    const after = fresh.state;
    assert.equal(after.phase, 'discuss');
    assert.equal(after.my.word, before.my.word);
    assert.equal(after.my.role, before.my.role);
    assert.equal(after.phaseEndsAt, before.phaseEndsAt, '남은 시간(끝나는 시각) 그대로');
    assert.deepEqual(after.firstSays, before.firstSays);
    assert.deepEqual(after.order, before.order);
    assert.equal(after.topic, before.topic);
    assert.equal(after.round, before.round);
    const seat2 = after.players.find((p) => p.id === target.id);
    assert.equal(seat2.seat, seat.seat);
    assert.equal(seat2.body, seat.body);
    assert.equal(seat2.color, seat.color);
    // 채팅 기록 알림(chatLog)에 첫 설명과 토론 채팅이 들어 있음
    const log = fresh.events.find((e) => e.k === 'chatLog');
    assert.ok(log, 'chatLog 알림');
    assert.deepEqual(log.items.filter((x) => x.kind === 'say').map((x) => x.text), ['힌트1', '힌트2', '힌트3', '힌트4']);
    assert.ok(log.items.some((x) => x.text === '토론중 한마디' && x.kind === 'talk'));
    // 이어서 투표가 된다
    fresh.vote(watcher.id);
    await until(() => watcher.state.votes[target.id] === watcher.id, 'vote after relog', { clients: r.cs });
  });

  it('끊김을 서버가 알아채기 전에 같은 아이디로 새로 접속(자리 이어받기)해도 같은 자리·제시어', async (t) => {
    const r = await begin(3, t);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const old = r.cs[1];
    const before = old.state;
    const fresh = await client(r.app, old.id); // old 는 닫지 않음: 서버가 old 를 내보낸다
    r.cs[1] = fresh;
    await until(() => fresh.state?.phase === 'discuss', 'takeover state', { clients: r.cs });
    assert.equal(fresh.state.my.word, before.my.word);
    assert.equal(fresh.state.phaseEndsAt, before.phaseEndsAt);
    assert.deepEqual(fresh.state.firstSays, before.firstSays);
    assert.equal(fresh.state.players.find((p) => p.id === fresh.id).seat, before.players.find((p) => p.id === fresh.id).seat);
    await until(() => old.errors.some((e) => /다른 곳에서 접속/.test(e)), 'old 연결 종료 안내', { clients: r.cs });
    assert.ok(r.cs[0].state.players.every((p) => p.connected));
  });

  it('끊긴 사람의 발언 차례는 건너뛰고(칸은 비움), 지금 차례인 사람이 끊기면 바로 다음 사람, 돌아와서 늦은 한 줄은 됨', async (t) => {
    const r = await begin(5, t, { timing: { grace: 600_000 } });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    const gone = order[2];
    const watcher = r.cs.find((c) => c.id !== gone);
    byId(r, gone).close();
    await until(() => watcher.state.players.find((p) => p.id === gone).connected === false, 'gone away', { clients: r.cs });
    assert.ok(watcher.state.players.find((p) => p.id === gone).awayUntil > r.fast.now());
    byId(r, order[0]).say('하나');
    await until(() => watcher.state.speaker === order[1], 'turn 2', { clients: r.cs });
    byId(r, order[1]).say('둘');
    await until(() => watcher.state.speaker !== order[1], 'after 2', { clients: r.cs });
    assert.equal(watcher.state.speaker, order[3], '끊긴 사람(셋째)을 건너뛰고 넷째');
    byId(r, order[3]).say('넷');
    await until(() => watcher.state.speaker === order[4], 'turn 5', { clients: r.cs });
    byId(r, order[4]).say('다섯');
    await until(() => watcher.state.phase === 'discuss', 'discuss', { clients: r.cs });
    assert.deepEqual(watcher.state.firstSays.map((x) => x.text), ['하나', '둘', null, '넷', '다섯']);
    // 돌아오면 같은 자리, 자기 칸이 비었으니 늦은 한 줄은 된다
    const fresh = await client(r.app, gone);
    r.cs[r.cs.findIndex((c) => c.id === gone)] = fresh;
    await until(() => fresh.state?.phase === 'discuss', 'back in discuss', { clients: r.cs });
    fresh.say('돌아와서 씀');
    await until(() => watcher.state.firstSays[2].text === '돌아와서 씀', 'late say after back', { clients: r.cs });
    assert.equal(watcher.state.firstSays[2].late, true);
  });

  it('지금 차례인 사람이 끊기면 시간을 기다리지 않고 바로 다음 사람 차례', async (t) => {
    const r = await begin(4, t, { k: 5, timing: { grace: 600_000 } });
    await until(() => r.cs.every((c) => c.state.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
    const order = [...r.host.state.order];
    const watcher = r.cs.find((c) => c.id !== order[0]);
    const endsBefore = watcher.state.phaseEndsAt;
    byId(r, order[0]).close();
    await until(() => watcher.state.speaker === order[1], 'skip to next', { clients: r.cs });
    assert.ok(watcher.state.phaseEndsAt > endsBefore, '다음 사람은 새 30초(최솟값 20초)를 받는다');
    assert.equal(watcher.state.firstSays[0].text, null);
  });

  it('라이어가 끊긴 채 60초(grace)가 지나면 시민 승리로 끝남, 시민 +1, 라이어는 방에서 빠짐', async (t) => {
    const r = await begin(4, t, { timing: { grace: 20_000 } });
    const liar = findLiar(r.cs);
    const citizens = r.cs.filter((c) => c !== liar);
    await speakAll(r);
    await waitPhase(r, 'discuss', 1);
    const watcher = citizens[0];
    liar.close();
    await until(() => watcher.state.players.find((p) => p.id === liar.id)?.connected === false, 'liar away', { clients: citizens });
    const awayUntil = watcher.state.players.find((p) => p.id === liar.id)?.awayUntil;
    if (awayUntil !== undefined) assert.ok(awayUntil > 0);
    await until(() => citizens.every((c) => c.state.phase === 'result'), 'result', { clients: citizens, timeout: 8000 });
    const res = watcher.state.result;
    assert.equal(res.reason, 'liarLeft');
    assert.equal(res.winner, 'citizens');
    assert.equal(res.liarId, liar.id);
    assert.equal(res.liarName, liar.id);
    assert.deepEqual(res.delta, Object.fromEntries([[liar.id, 0], ...citizens.map((c) => [c.id, 1])]));
    assert.ok(watcher.state.players.every((p) => p.id !== liar.id), '라이어는 방에서 빠짐');
    for (const c of citizens) {
      assert.equal(c.state.players.find((p) => p.id === c.id).score, 1);
    }
  });

  it('방장이 나가면(끊김 60초 또는 나가기) 들어온 순서의 다음 사람이 방장', async (t) => {
    const r = await roomN(4, { timing: { grace: 20_000 } });
    t.after(() => r.close());
    const [alpha, bravo, charl, delta] = r.cs;
    assert.equal(alpha.state.hostId, 'alpha');
    alpha.close();
    await until(() => [bravo, charl, delta].every((c) => c.state.hostId === 'bravo'), '끊겨서 방장 넘김', { clients: r.cs, timeout: 8000 });
    assert.ok(bravo.state.players.every((p) => p.id !== 'alpha'));
    // 새 방장이 설정을 바꿀 수 있다
    bravo.lg('settings', { goal: 10 });
    await until(() => charl.state.settings.goal === 10, '새 방장 설정', { clients: r.cs });
    // 나가기 버튼도 같음
    bravo.send({ t: 'leave' });
    await until(() => [charl, delta].every((c) => c.state.hostId === 'charl'), '나가서 방장 넘김', { clients: r.cs });
    // 방장이 아닌 사람은 설정 못 바꿈
    delta.lg('settings', { goal: 15 });
    await until(() => delta.errors.some((e) => /방장만/.test(e)), '방장만 오류', { clients: r.cs });
    assert.equal(charl.state.settings.goal, 10);
  });

  it('게임 도중 방장이 끊겨 60초가 지나도 방장이 넘어가고 방은 계속됨', async (t) => {
    const r = await begin(5, t, { timing: { grace: 20_000 } });
    const rest = r.cs.slice(1);
    r.cs[0].close();
    await until(() => rest.every((c) => c.state.hostId === 'bravo'), '방장 넘김', { clients: r.cs, timeout: 8000 });
    assert.ok(['speak', 'result'].includes(rest[0].state.phase) || rest[0].state.round === 1);
    assert.ok(rest.every((c) => c.state.players.length === 4));
  });

  it('"라이어 알림" 방식: 라이어만 role liar 와 제시어 없음, 시민은 role citizen. 재접속해도 그대로, 남에게 라이어 표시는 안 보냄', async (t) => {
    const r = await begin(4, t, { settings: { liarMode: 'notice' } });
    const liar = findLiar(r.cs);
    const citizens = r.cs.filter((c) => c !== liar);
    assert.equal(liar.state.my.role, 'liar');
    assert.equal(liar.state.my.word, null);
    for (const c of citizens) {
      assert.equal(c.state.my.role, 'citizen');
      assert.equal(typeof c.state.my.word, 'string');
    }
    const word = citizens[0].state.my.word;
    assert.ok(citizens.every((c) => c.state.my.word === word));
    for (const c of citizens) {
      const text = c.raw.join('\n');
      assert.ok(!/"role":"liar"/.test(text), `${c.id}: 남의 라이어 표시가 없어야 함`);
      assert.ok(!/"liarId":"/.test(text));
    }
    const fresh = await dropAndBack(byIdWrap(r), liar.id);
    assert.equal(fresh.state.my.role, 'liar');
    assert.equal(fresh.state.my.word, null);
  });

  it('도중 입장자: 글·사진 이모티콘·사운드 거절(기본 이모티콘은 됨), 판이 끝나면 다 됨', async (t) => {
    const r = await begin(3, t);
    const late = await client(r.app, 'delta');
    t.after(() => late.close());
    late.send({ t: 'join', code: r.code });
    await until(() => late.state?.players?.length === 4, 'late join', { clients: [...r.cs, late] });
    const me = late.state.players.find((p) => p.id === 'delta');
    assert.equal(me.spectating, true);
    assert.equal(late.state.my.word, null);
    assert.equal(late.state.my.role, null);
    assert.ok(r.cs.every((c) => c.state.players.find((p) => p.id === 'delta')?.spectating === true));

    const err = async (send) => {
      const n = late.errors.length;
      send();
      await until(() => late.errors.length > n, '거절 오류', { clients: [late] });
      return late.errors.at(-1);
    };
    assert.match(await err(() => late.send({ t: 'chat', text: '안녕' })), /판이 끝날 때까지|글을 쓸 수 없/);
    assert.match(await err(() => late.send({ t: 'pemote', data: JPEG })), /관전 중에는 기본 이모티콘만/);
    assert.match(await err(() => late.send({ t: 'sndAdd', sid: 'abc123', name: '소리', data: AUDIO })), /관전 중에는 기본 이모티콘만/);
    assert.ok(!r.host.events.some((e) => e.k === 'pemote' || e.k === 'sndAdd'));
    assert.ok(!r.host.events.some((e) => e.k === 'chat' && e.id === 'delta'));
    // 기본 이모티콘은 관전자도 가능
    late.send({ t: 'emote', e: 2 });
    await until(() => r.host.events.some((e) => e.k === 'emote' && e.id === 'delta' && e.e === 2), '기본 이모티콘', { clients: r.cs });
    // 참가자의 사진 이모티콘은 됨
    r.cs[1].send({ t: 'pemote', data: JPEG });
    await until(() => late.events.some((e) => e.k === 'pemote' && e.id === r.cs[1].id), '참가자 사진 이모티콘', { clients: r.cs });

    // 방장이 판을 끝내면(무효) 방 대기: 그제야 글·사진 이모티콘·사운드가 된다
    r.host.lg('end');
    await until(() => late.state.phase === 'lobby', 'lobby', { clients: r.cs });
    await sleep(120); // 채팅 간격 1초(빠른 시계 20배 = 실제 50ms)
    late.send({ t: 'chat', text: '이제 쓴다' });
    await until(() => r.host.events.some((e) => e.k === 'chat' && e.id === 'delta' && e.text === '이제 쓴다'), '대기 중 채팅', { clients: r.cs });
    late.send({ t: 'pemote', data: JPEG });
    await until(() => r.host.events.some((e) => e.k === 'pemote' && e.id === 'delta'), '대기 중 사진 이모티콘', { clients: r.cs });
    late.send({ t: 'sndAdd', sid: 'abc123', name: '소리', data: AUDIO });
    await until(() => r.host.events.some((e) => e.k === 'sndAdd' && e.sid === 'abc123'), '대기 중 사운드', { clients: r.cs });
  });
});

// dropAndBack 이 r.cs / r.host 를 직접 바꾸므로 r 자체를 그대로 쓴다 (이름만 읽기 좋게)
function byIdWrap(r) { return r; }
