// 공용 시험 도우미: 실제 허브(server/rooms.js) + 가짜 시계 + 메모리 저장소 + 가짜 소켓.
// 기존 test/*.test.js 가 복사해 쓰던 setup()/login() 를 한 곳에 모은 것이다(기존 시험은 그대로 둔다).
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

export const drain = () => new Promise((r) => setImmediate(r));

// 모든 게임이 켜진 허브. opts 로 허브 인자를 덮어쓸 수 있다(예: { timing: { grace: 5000 } }).
export function makeHub(opts = {}) {
  const clock = new FakeClock();
  const store = createStore();
  const { seed = 1, ...rest } = opts;
  const hub = createHub({
    store, rng: seeded(seed), now: clock.now, timers: clock,
    liar: 'on', yacht: 'on', draw: 'on', gsk: 'on', mini: 'on', solo: 'on', ...rest,
  });
  // 새 접속 -> 로그인한 클라이언트. 같은 아이디로 다시 부르면 새 소켓(재접속)이다.
  async function login(id) {
    const c = client(hub);
    await c.send({ t: 'login', id });
    c.id = id;
    return c;
  }
  // 시간을 흘려보낸다(가짜 시계 + 허브가 만든 promise 들이 끝나도록 한 번 비운다).
  async function tick(ms) {
    clock.advance(ms);
    await drain();
  }
  return { hub, clock, store, login, tick };
}

// 계정별 속도 제한 기록(채팅·이모티콘·소리)을 비운다. 시계를 흘려보내지 않고 여러 종류를 연달아 시험할 때 쓴다.
// (허브 세션의 lastSent/chatTimes/editTimes 를 직접 비우므로, 속도 제한 자체를 시험할 때는 쓰지 않는다.)
export function freeLimits(hub) {
  for (const s of hub.sessions.values()) {
    s.lastSent = {};
    s.chatTimes = [];
    s.editTimes = [];
  }
}

// 한 클라이언트가 받은 event 중 종류가 k 인 것들.
export const events = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);
export const errors = (c) => c.sock.msgs.filter((m) => m.t === 'error');
