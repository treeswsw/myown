// 미니게임 방 시험 공용 도구 (가짜 시계). 시험 파일이 아니다(*.test.js 아님).
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

export const GRACE = 60_000;
export const mnMsg = (c, o) => c.send({ t: 'mn', ...o });
export const lastErr = (c) => c.sock.last('error');

// 두 사람(ann1 방장, bob1)이 한 방에 들어간 상태. opts.coins = 둘이 가진 코인.
export async function pair({ game, coins = 0, seed = 3, hubOptions = {}, set } = {}) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(seed), now: clock.now, timers: clock, mini: 'on', ...hubOptions });
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  hub.sessions.get('ann1').user.coins = coins;
  hub.sessions.get('bob1').user.coins = coins;
  await a.send({ t: 'create', mode: 'mini', ...(game ? { game } : {}) });
  await b.send({ t: 'join', code: a.state.code });
  if (set) await a.send({ t: 'set', patch: set });
  const by = (seat) => (a.state.seats[seat] === 'ann1' ? a : b);
  const coinsOf = (id) => hub.sessions.get(id)?.user.coins ?? 0;
  return { clock, hub, a, b, by, coinsOf, mn: mnMsg };
}

// 커넥트포에서 first(지금 seat 0)가 세로 4목으로 이긴다.
export async function c4Win(r) {
  const first = r.by(0);
  const second = r.by(1);
  for (let i = 0; i < 3; i++) {
    await mnMsg(first, { a: 'move', move: { x: 0 } });
    await mnMsg(second, { a: 'move', move: { x: 1 } });
  }
  await mnMsg(first, { a: 'move', move: { x: 0 } });
}

// 커넥트포 무승부 수순 (42수, 이긴 줄 없음)
export const C4_DRAW = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 4, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];
export async function c4Draw(r) {
  for (let i = 0; i < C4_DRAW.length; i++) {
    await mnMsg(r.by(i % 2), { a: 'move', move: { x: C4_DRAW[i] } });
    if (i % 8 === 7 && r.a.state.phase === 'play') r.clock.advance(1000); // 연결당 초당 20개 제한을 비켜 간다
  }
}

// 오목에서 first(seat 0, 흑)가 가로 5목으로 이긴다.
export async function gomokuWin(r) {
  const first = r.by(0);
  const second = r.by(1);
  for (let i = 0; i < 4; i++) {
    await mnMsg(first, { a: 'move', move: { x: i, y: 0 } });
    await mnMsg(second, { a: 'move', move: { x: i, y: 2 } });
  }
  await mnMsg(first, { a: 'move', move: { x: 4, y: 0 } });
}
