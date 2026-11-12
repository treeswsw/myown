// Shared test utilities (seeded rng, fake clock, fake sockets).
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FakeClock {
  constructor() {
    this.t = 1_000_000;
    this.timers = new Map();
    this.nextId = 1;
    this.setTimeout = (fn, ms) => {
      const id = this.nextId++;
      this.timers.set(id, { at: this.t + ms, fn });
      return id;
    };
    this.clearTimeout = (id) => { this.timers.delete(id); };
    this.now = () => this.t;
  }

  get pending() {
    return this.timers.size;
  }

  // Runs due timers in order, including ones scheduled while advancing.
  advance(ms) {
    const end = this.t + ms;
    for (;;) {
      let nextId = null;
      for (const [id, tm] of this.timers) {
        if (tm.at <= end && (nextId === null || tm.at < this.timers.get(nextId).at)) nextId = id;
      }
      if (nextId === null) break;
      const tm = this.timers.get(nextId);
      this.timers.delete(nextId);
      this.t = Math.max(this.t, tm.at);
      tm.fn();
    }
    this.t = end;
  }
}

export class FakeSocket {
  constructor() {
    this.raw = [];
    this.closed = false;
  }

  send(text) {
    this.raw.push(text);
  }

  close() {
    this.closed = true;
  }

  get msgs() {
    return this.raw.map((r) => JSON.parse(r));
  }

  last(t) {
    return this.msgs.filter((m) => m.t === t).at(-1);
  }

  get state() {
    return this.last('room')?.state;
  }
}

export function client(hub) {
  const sock = new FakeSocket();
  const conn = hub.connect(sock);
  const c = {
    sock, conn,
    send: (obj) => conn.message(JSON.stringify(obj)),
    get state() { return sock.state; },
  };
  return c;
}
