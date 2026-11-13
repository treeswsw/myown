// GDD 8절 13-6: 이모티콘·사운드. 기본 이모티콘, 사진 이모티콘, 사운드 추가·재생이 방 전원에게 전달되고,
// 정체 공개 연출 중에는 거절되며, 나중에 들어온 사람도 방의 사운드 목록을 받는다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roomN, room3, setTimes, startRound, findLiar, until, waitPhase,
  speakAll, accuse, judgeMap, client, sleep,
} from './helpers.js';

// 최소한의 올바른 데이터: JPEG 은 base64 가 "/9j/" 로 시작하고 4의 배수, 소리는 data:audio/...;base64,
const PHOTO = 'data:image/jpeg;base64,/9j/AAAA';
const SOUND = 'data:audio/webm;base64,AAAA';
const SID = { a: 'sidalpha01', b: 'sidbravo01', c: 'sidcharl01' };
const BLOCKED_UNMASK = '정체 공개 중에는 쓸 수 없습니다.';

const eventsOf = (c, k) => c.events.filter((e) => e.k === k);
const gotAll = (r, k, pred) => r.cs.every((c) => eventsOf(c, k).some(pred));

describe('13-6 이모티콘과 사운드', { concurrency: true }, () => {
  it('기본 이모티콘 6개(0~5)가 보낸 사람을 포함한 방 전원에게 전달된다', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    for (let e = 0; e <= 5; e++) r.cs[1].send({ t: 'emote', e });
    await until(() => r.cs.every((c) => eventsOf(c, 'emote').length === 6), 'emote x6', { clients: r.cs });
    for (const c of r.cs) {
      assert.deepEqual(eventsOf(c, 'emote').map((x) => [x.id, x.e]), [0, 1, 2, 3, 4, 5].map((e) => [r.cs[1].id, e]));
    }
    // 범위 밖은 거절
    r.cs[1].send({ t: 'emote', e: 6 });
    await until(() => r.cs[1].errors.length > 0, 'emote 6 refused', { clients: r.cs });
    assert.equal(eventsOf(r.cs[0], 'emote').length, 6);
  });

  it('사진 이모티콘: 전원에게 pemote 가 전달되고, 잘못된 사진은 거절, 너무 빠른 연속은 거절', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    const [a, b] = r.cs;
    a.send({ t: 'pemote', data: PHOTO });
    await until(() => gotAll(r, 'pemote', (x) => x.id === a.id && x.data === PHOTO), 'pemote delivered', { clients: r.cs });
    // 바로 또 보내면 속도 제한 (가짜 시계 기준 3초 = 실제 150ms 이내)
    a.send({ t: 'pemote', data: PHOTO });
    await until(() => a.errors.length > 0, 'pemote too fast', { clients: r.cs });
    assert.match(a.errors.at(-1), /빨리/);
    assert.equal(eventsOf(b, 'pemote').length, 1);
    // JPEG 가 아니면 거절
    b.send({ t: 'pemote', data: 'data:image/png;base64,AAAA' });
    await until(() => b.errors.length > 0, 'pemote not jpeg', { clients: r.cs });
    assert.equal(eventsOf(a, 'pemote').length, 1);
  });

  it('사운드 추가(sndAdd) → 전원 수신, 재생(snd) → 전원 수신, 없는 소리·기본 소리·이름 바꾸기·지우기 권한', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    const [a, b, c] = r.cs; // a = 방장
    b.send({ t: 'sndAdd', sid: SID.b, name: '박수', data: SOUND });
    await until(() => gotAll(r, 'sndAdd', (x) => x.sid === SID.b && x.by === b.id && x.name === '박수' && x.data === SOUND), 'sndAdd delivered', { clients: r.cs });
    // 재생: 업로드한 사람이 아닌 c 가 쳐도 전원에게 { id: 친 사람, sid }
    c.send({ t: 'snd', sid: SID.b });
    await until(() => gotAll(r, 'snd', (x) => x.id === c.id && x.sid === SID.b), 'snd delivered', { clients: r.cs });
    // 기본 소리는 목록에 없어도 재생된다
    await sleep(150); // 재생 속도 제한(가짜 시계 2초)
    c.send({ t: 'snd', sid: 'builtin:clap' });
    await until(() => gotAll(r, 'snd', (x) => x.sid === 'builtin:clap'), 'builtin snd', { clients: r.cs });
    // 목록에 없는 소리는 거절
    await sleep(150);
    const before = c.errors.length;
    c.send({ t: 'snd', sid: 'nosuchsound1' });
    await until(() => c.errors.length > before, 'unknown snd refused', { clients: r.cs });
    assert.equal(eventsOf(a, 'snd').length, 2);
    // 이름 바꾸기: 올린 사람 b 와 방장 a 는 되고, c 는 거절
    c.send({ t: 'sndRename', sid: SID.b, name: '남의것' });
    await until(() => c.errors.length > before + 1, 'rename by stranger refused', { clients: r.cs });
    a.send({ t: 'sndRename', sid: SID.b, name: '방장이름' });
    await until(() => gotAll(r, 'sndRename', (x) => x.sid === SID.b && x.name === '방장이름'), 'rename by host', { clients: r.cs });
    await sleep(60); // 소리 수정 속도 제한(가짜 시계 1초)이 지나길 기다림
    b.send({ t: 'sndDel', sid: SID.b });
    await until(() => gotAll(r, 'sndDel', (x) => x.sid === SID.b), 'sndDel by owner', { clients: r.cs });
  });

  it('나중에 들어온 사람은 방에 쌓인 사운드 목록(sndList)을 받는다 (이름·주인·데이터 포함)', async (t) => {
    const r = await room3();
    t.after(() => r.close());
    const [a, b] = r.cs;
    a.send({ t: 'sndAdd', sid: SID.a, name: '하나', data: SOUND });
    b.send({ t: 'sndAdd', sid: SID.b, name: '둘', data: SOUND });
    await until(() => gotAll(r, 'sndAdd', (x) => x.sid === SID.b) && gotAll(r, 'sndAdd', (x) => x.sid === SID.a), 'both sounds', { clients: r.cs });
    const late = await client(r.app, 'echo1');
    t.after(() => late.close());
    late.send({ t: 'join', code: r.code });
    await until(() => late.state?.players?.length === 4, 'late join', { clients: [late] });
    await until(() => eventsOf(late, 'sndList').length === 1, 'sndList for late joiner', { clients: [late] });
    const list = eventsOf(late, 'sndList')[0].items;
    assert.deepEqual(list.map((x) => x.sid).sort(), [SID.a, SID.b].sort());
    const one = list.find((x) => x.sid === SID.a);
    assert.equal(one.by, a.id);
    assert.equal(one.name, '하나');
    assert.equal(one.data, SOUND);
    // 소리가 하나도 없던 방에는 sndList 를 보내지 않는다: 새 방에서 확인
    const r2 = await room3();
    t.after(() => r2.close());
    await sleep(100);
    assert.equal(r2.cs.flatMap((c) => eventsOf(c, 'sndList')).length, 0);
  });

  it('정체 공개(unmask) 연출 중에는 기본 이모티콘·사진·사운드 추가·재생이 모두 거절되고, 끝나면 다시 된다', async (t) => {
    const r = await roomN(3, { k: 8 }); // 시민 처형 연출 11초 = 실제 1.4초
    t.after(() => r.close());
    await setTimes(r, { judge: 15, guess: 30 });
    await startRound(r);
    // 정체 공개 전에 올려 둔 소리(재생 시도에 쓴다)
    r.cs[0].send({ t: 'sndAdd', sid: SID.a, name: '하나', data: SOUND });
    await until(() => gotAll(r, 'sndAdd', (x) => x.sid === SID.a), 'sound before game', { clients: r.cs });
    const liar = findLiar(r.cs);
    const [c1, c2] = r.cs.filter((x) => x !== liar);
    await speakAll(r);
    await accuse(r, c1.id); // 시민을 처형 → unmask 11초(가장 길다)
    await judgeMap(r, { [liar.id]: 'yes', [c2.id]: 'yes' });
    await waitPhase(r, 'unmask');
    const sender = r.cs[2];
    const e0 = sender.errors.length;
    sender.send({ t: 'emote', e: 1 });
    sender.send({ t: 'pemote', data: PHOTO });
    sender.send({ t: 'sndAdd', sid: SID.c, name: '새것', data: SOUND });
    sender.send({ t: 'snd', sid: SID.a });
    await until(() => sender.errors.length >= e0 + 4 || r.host.state.phase !== 'unmask', 'four refusals', { clients: r.cs });
    assert.equal(r.host.state.phase, 'unmask', '연출이 끝나기 전에 보냈어야 한다 (시험 속도 문제면 k 를 낮춘다)');
    assert.deepEqual(sender.errors.slice(e0), [BLOCKED_UNMASK, BLOCKED_UNMASK, BLOCKED_UNMASK, BLOCKED_UNMASK]);
    for (const c of r.cs) {
      assert.equal(eventsOf(c, 'emote').length, 0);
      assert.equal(eventsOf(c, 'pemote').length, 0);
      assert.equal(eventsOf(c, 'snd').length, 0);
      assert.ok(!eventsOf(c, 'sndAdd').some((x) => x.sid === SID.c));
    }
    // 정답 맞히기 단계로 넘어가면: 참가자는 기본 이모티콘만 되고 사진·사운드는 거절
    await waitPhase(r, 'guess');
    const e1 = sender.errors.length;
    sender.send({ t: 'emote', e: 2 });
    await until(() => gotAll(r, 'emote', (x) => x.id === sender.id && x.e === 2), 'emote in guess', { clients: r.cs });
    sender.send({ t: 'pemote', data: PHOTO });
    sender.send({ t: 'snd', sid: SID.a });
    await until(() => sender.errors.length >= e1 + 2, 'photo/sound refused in guess', { clients: r.cs });
    assert.match(sender.errors[e1], /기본 이모티콘만/);
    // 결과에서는 모두 다시 가능
    liar.guess('틀린답');
    await waitPhase(r, 'answer'); // 정답 공개 중에는 기본 이모티콘도 거절
    const e2 = sender.errors.length;
    sender.send({ t: 'emote', e: 3 });
    await until(() => sender.errors.length >= e2 + 1 || r.host.state.phase !== 'answer', 'emote refused in answer', { clients: r.cs });
    if (r.host.state.phase === 'answer') assert.match(sender.errors[e2], /정답 공개 중/);
    await until(() => r.cs.every((c) => c.state.phase === 'result'), 'result', { clients: r.cs });
    sender.send({ t: 'pemote', data: PHOTO });
    await until(() => gotAll(r, 'pemote', (x) => x.id === sender.id), 'pemote in result', { clients: r.cs });
  });
});
