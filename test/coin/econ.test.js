// 관리자 경제 설정 (SPEC 21-7): 권한, 값 검사, 바로 적용, 저장·다시 읽기, 기본값으로 되돌리기, 갱스껄 코인 줄.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { makeHub, drain } from '../lib/hub.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { COIN_RULES, ECON_LIMITS, defaultEcon, normalizeEcon, checkEcon, payouts, ECON_VERSION } from '../../shared/coin/rules.js';
import { GAMES } from '../../shared/games.js';

const lastErr = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1);
const econMsg = (c) => c.sock.msgs.filter((m) => m.t === 'admOk' && m.a === 'econ').at(-1);

async function loginAdmin(h) {
  const c = client(h.hub);
  await c.send({ t: 'login', id: '관리자', pw: '9975' });
  return c;
}

test('규칙: 갱스껄 줄이 있고 등록표 coin 과 맞는다', () => {
  assert.deepEqual(COIN_RULES.gsk, { finish: 10, win: 4, gapMs: 120000 });
  assert.equal(GAMES.gsk.coin, 'gsk');
  assert.equal(payouts('gsk', [{ id: 'a', rank: 1, won: true, opp: 3 }]).a, 22);
  assert.equal(payouts('gsk', [{ id: 'a', rank: 2, won: false, opp: 3 }]).a, 10);
});

test('normalizeEcon / checkEcon: 기본값, 손상된 값, 범위', () => {
  assert.deepEqual(normalizeEcon(null), defaultEcon());
  assert.deepEqual(normalizeEcon({ v: ECON_VERSION, rules: { yacht: { finish: -1, win: 1.5, gapMs: 'x' }, nope: { finish: 3 } }, chipsPerCoin: 0, chipsPerCoinBack: 0 }), defaultEcon());
  // 버전이 없거나 다른 옛 저장값은 통째로 버리고 새 기본값
  const old = defaultEcon();
  old.rules.yacht.finish = 99;
  delete old.v;
  assert.deepEqual(normalizeEcon(old), defaultEcon());
  assert.deepEqual(normalizeEcon({ ...old, v: 1 }), defaultEcon());
  assert.equal(defaultEcon().chipsPerCoinBack, 1000);
  assert.equal(defaultEcon().rules.yacht.graded, true);
  assert.equal(defaultEcon().rules.draw.graded, true);
  assert.equal(defaultEcon().rules.gsk.graded, undefined);
  const e = defaultEcon();
  e.rules.yacht.win = 7;
  assert.equal(normalizeEcon(e).rules.yacht.win, 7);
  assert.equal(checkEcon(e).ok, true);
  const mut = (fn) => { const x = defaultEcon(); fn(x); return checkEcon(x).ok; };
  assert.equal(mut((x) => { x.rules.bluff.finish = -1; }), false);
  assert.equal(mut((x) => { x.rules.bluff.finish = ECON_LIMITS.finish[1] + 1; }), false);
  assert.equal(mut((x) => { x.rules.bluff.win = 1.5; }), false);
  assert.equal(mut((x) => { x.rules.bluff.gapMs = '100'; }), false);
  assert.equal(mut((x) => { x.chipsPerCoin = 0; }), false);
  assert.equal(mut((x) => { x.chipsPerCoinBack = 0; }), false);
  assert.equal(mut((x) => { x.chipsPerCoinBack = 1.5; }), false);
  assert.equal(mut((x) => { x.chipsPerCoinBack = ECON_LIMITS.chipsPerCoinBack[1] + 1; }), false);
  assert.equal(mut((x) => { x.chipsPerCoinBack = 2000; }), true);
  assert.equal(mut((x) => { delete x.chipsPerCoinBack; }), false);
  assert.equal(mut((x) => { delete x.rules.mini; }), false);
  assert.equal(mut((x) => { x.rules.holdem = { finish: 1, win: 1, gapMs: 1 }; }), false);
  assert.equal(mut((x) => { x.rules.bluff.finish = 0; x.rules.bluff.win = 0; x.rules.bluff.gapMs = 0; }), true);
  assert.equal(checkEcon('x').ok, false);
  assert.equal(checkEcon({ rules: [], chipsPerCoin: 100, chipsPerCoinBack: 1000 }).ok, false);
});

test('관리자만: 일반 사용자는 adm_no, 관리자는 현재값·기본값·범위를 받는다', async () => {
  const h = makeHub();
  const user = await h.login('ann1');
  await user.send({ t: 'adm', a: 'econ' });
  assert.equal(lastErr(user).code, 'adm_no');
  await user.send({ t: 'adm', a: 'econSet', econ: defaultEcon() });
  assert.equal(lastErr(user).code, 'adm_no');
  await user.send({ t: 'adm', a: 'econReset' });
  assert.equal(lastErr(user).code, 'adm_no');
  const adm = await loginAdmin(h);
  await adm.send({ t: 'adm', a: 'econ' });
  const m = econMsg(adm);
  assert.deepEqual(m.econ, defaultEcon());
  assert.deepEqual(m.defaults, defaultEcon());
  assert.deepEqual(m.limits, ECON_LIMITS);
  assert.equal(m.saved, false);
});

test('바꾸면 서버 재시작 없이 바로: 정산 · 지급 간격 · 교환 시세', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const a = await h.login('ann1');
  await a.send({ t: 'create', mode: 'yacht' });
  const room = [...h.hub.rooms.values()][0];
  const e = defaultEcon();
  e.rules.liar = { finish: 10, win: 20, gapMs: 1000 };
  e.chipsPerCoin = 50;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  assert.equal(econMsg(adm).saved, true);
  assert.equal(h.hub.econ().rules.liar.finish, 10);
  assert.deepEqual(h.hub.award(room, 'liar', [{ id: 'ann1', rank: 1, won: true, opp: 2 }]), { ann1: 50 });
  assert.equal(h.hub.sessions.get('ann1').user.coins, 50);
  await h.tick(999);
  h.hub.award(room, 'liar', [{ id: 'ann1', rank: 1, won: true, opp: 2 }]); // 간격 1초 안: 못 받음
  assert.equal(h.hub.sessions.get('ann1').user.coins, 50);
  await h.tick(1);
  h.hub.award(room, 'liar', [{ id: 'ann1', rank: 3, won: false, opp: 2 }]); // 꼴찌 = 완주
  assert.equal(h.hub.sessions.get('ann1').user.coins, 60);
  // 교환 시세
  await a.send({ t: 'leave' });
  const bank0 = h.hub.sessions.get('ann1').user.bank;
  await a.send({ t: 'coin', a: 'swap', n: 4 });
  assert.equal(h.hub.sessions.get('ann1').user.bank, bank0 + 200);
  assert.equal(a.sock.msgs.filter((m) => m.t === 'me').at(-1).wallet.chipsPerCoin, 50);
});

test('잘못된 값은 adm_bad 로 거절되고 설정은 그대로', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const e = defaultEcon();
  e.rules.bluff.finish = -3;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  assert.equal(lastErr(adm).code, 'adm_bad');
  await adm.send({ t: 'adm', a: 'econSet', econ: { rules: {}, chipsPerCoin: 100, chipsPerCoinBack: 1000 } });
  assert.equal(lastErr(adm).code, 'adm_bad');
  assert.deepEqual(h.hub.econ(), defaultEcon());
});

test('기본값으로 되돌리기', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const e = defaultEcon();
  e.rules.draw.win = 9;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  assert.equal(h.hub.econ().rules.draw.win, 9);
  await adm.send({ t: 'adm', a: 'econReset' });
  assert.deepEqual(h.hub.econ(), defaultEcon());
  assert.deepEqual(econMsg(adm).econ, defaultEcon());
});

test('저장: 같은 저장소로 새 서버를 띄우면 바꾼 값을 읽는다 (메모리 저장소; Postgres 도 같은 getMeta/setMeta)', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const e = defaultEcon();
  e.rules.liar.finish = 5;
  e.chipsPerCoin = 250;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  const clock = new FakeClock();
  const hub2 = createHub({ store: h.store, rng: seeded(2), now: clock.now, timers: clock });
  await drain();
  await drain();
  assert.equal(hub2.econ().rules.liar.finish, 5);
  assert.equal(hub2.econ().chipsPerCoin, 250);
  assert.equal(hub2.coinRules().liar.finish, 5);
});

test('저장소에 손상된 값이 있어도 서버는 기본값으로 뜬다', async () => {
  const h = makeHub();
  await h.store.setMeta('econ', { v: ECON_VERSION, rules: { yacht: { finish: 'a' } }, chipsPerCoin: -5 });
  const clock = new FakeClock();
  const hub2 = createHub({ store: h.store, rng: seeded(2), now: clock.now, timers: clock });
  await drain();
  await drain();
  assert.deepEqual(hub2.econ(), defaultEcon());
});

test('시작 때 읽기가 끝나기 전에 setEcon 이 불렸으면, 늦게 온 옛 값은 버린다', async () => {
  const h = makeHub();
  const old = defaultEcon();
  old.rules.liar.finish = 7;
  let release;
  const gate = new Promise((r) => { release = r; });
  const store = Object.create(h.store);
  store.getMeta = async () => { await gate; return old; };
  const hub2 = createHub({ store, rng: seeded(3), now: new FakeClock().now, timers: new FakeClock() });
  const fresh = defaultEcon();
  fresh.rules.liar.finish = 3;
  await hub2.setEcon(fresh);
  release();
  await drain();
  assert.equal(hub2.econ().rules.liar.finish, 3);
});

test('옛 저장값(버전 없음)은 새 기본값에 가려지지 않는다', async () => {
  const h = makeHub();
  await h.store.setMeta('econ', { rules: { yacht: { finish: 3, win: 4, gapMs: 240000 } }, chipsPerCoin: 100 });
  const clock = new FakeClock();
  const hub2 = createHub({ store: h.store, rng: seeded(2), now: clock.now, timers: clock });
  await drain();
  await drain();
  assert.deepEqual(hub2.econ(), defaultEcon());
  assert.equal(hub2.coinRules().yacht.finish, 10);
});

test('관리자가 칩 → 코인 시세를 바꾸면 바로 적용된다', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const e = defaultEcon();
  e.chipsPerCoinBack = 2500;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  assert.equal(h.hub.econ().chipsPerCoinBack, 2500);
  assert.equal(h.hub.econ().v, ECON_VERSION);
});

test('graded 는 규칙 표시: 관리자가 보내도 서버가 기본 표시로 되돌린다', async () => {
  const h = makeHub();
  const adm = await loginAdmin(h);
  const e = defaultEcon();
  e.rules.yacht.graded = false;
  e.rules.gsk.graded = true;
  await adm.send({ t: 'adm', a: 'econSet', econ: e });
  assert.equal(h.hub.econ().rules.yacht.graded, true);
  assert.equal(h.hub.econ().rules.gsk.graded, undefined);
});
