// Headless bot client for e2e / soak tests. Speaks the SPEC section 7 protocol.
import WebSocket from 'ws';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class Bot {
  constructor(url, id, opts = {}) {
    this.url = url;
    this.id = id;
    this.opts = { autoplay: true, thinkMs: [0, 15], ...opts };
    this.messages = []; // every parsed message received
    this.raw = [];
    this.errors = [];
    this.me = null;
    this.state = null;
    this.waiters = [];
    this.stateHistory = [];
    this.actionsSent = 0;
    this.pending = null; // last action timestamp, for stall detection
    this.closed = false;
    this.lastTurnKey = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(this.url));
      ws.on('open', () => resolve(this));
      ws.on('error', (e) => { if (!this.closed) reject(e); });
      ws.on('close', () => { this.closed = true; this._wake(); });
      ws.on('message', (d) => this._onMessage(d.toString()));
    });
  }

  _onMessage(text) {
    this.raw.push(text);
    let m;
    try { m = JSON.parse(text); } catch { this.errors.push({ parse: text }); return; }
    this.messages.push(m);
    if (m.t === 'me') this.me = m.user;
    else if (m.t === 'room') {
      this.state = m.state;
      if (m.state) this.stateHistory.push(m.state);
      if (this.opts.autoplay) this._maybeAct();
    } else if (m.t === 'event') {
      // my own action echoed back (events precede the resulting room state) -> allow acting on the next turn
      const e = m.e || {};
      const me = this.state && this.state.you;
      if (me && ((['action', 'bluffPlay'].includes(e.k) && e.id === me) || (e.k === 'liar' && e.caller === me))) this._acted = false;
    } else if (m.t === 'error') { this.errors.push(m); this._acted = false; }
    this._wake();
  }

  _wake() {
    for (const w of [...this.waiters]) w();
  }

  // The server drops anything above 20 msgs/s per connection, silently. Autoplay bots therefore
  // space their sends (>= 55ms apart); manual/abuse bots (autoplay:false) send immediately.
  send(obj) {
    const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const go = () => { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data); };
    if (!this.opts.autoplay) return go();
    const now = Date.now();
    this._slot = Math.max(now, (this._slot || 0) + 55);
    const wait = this._slot - now;
    if (wait <= 0) go(); else setTimeout(go, wait);
  }

  /** Resolve when pred(bot) is truthy; reject on timeout. */
  waitFor(pred, timeout = 5000, label = 'condition') {
    return new Promise((resolve, reject) => {
      let timer;
      const check = () => {
        let v;
        try { v = pred(this); } catch { v = false; }
        if (v) { cleanup(); resolve(v); }
      };
      const cleanup = () => {
        clearTimeout(timer);
        const i = this.waiters.indexOf(check);
        if (i >= 0) this.waiters.splice(i, 1);
      };
      timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${label} (bot ${this.id})`)); }, timeout);
      this.waiters.push(check);
      check();
    });
  }

  async waitMsg(pred, timeout = 5000, label = 'message') {
    const start = this.messages.length;
    return this.waitFor(() => this.messages.slice(start).find(pred), timeout, label);
  }

  async login() {
    this.send({ t: 'login', id: this.id });
    await this.waitFor(() => this.me, 5000, 'me');
    return this.me;
  }
  async create(mode) { this.send({ t: 'create', mode }); return (await this.waitFor(() => this.state, 5000, 'room')).code; }
  async join(code) { this.send({ t: 'join', code }); await this.waitFor(() => this.state && this.state.code === code, 5000, 'join'); }
  leave() { this.send({ t: 'leave' }); }
  start() { this.send({ t: 'start' }); }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
  terminate() { this.closed = true; try { this.ws.terminate(); } catch {} }

  // turnEndsAt is always null (no turn limit), so state keys cannot tell turns apart (and the same player can be
  // on turn twice in a row, e.g. heads-up after a street ends). The bot acts once per turn: after sending it waits
  // until the server echoes its own action event (or an error / a state without its turn) before acting again.
  _maybeAct() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || s.turn !== s.you) { this._acted = false; return; }
    if (this._acted) return;
    this._acted = true;
    const [lo, hi] = this.opts.thinkMs;
    setTimeout(() => {
      if (this.closed) return;
      const cur = this.state;
      if (!cur || cur.phase !== 'playing' || cur.turn !== cur.you) return;
      const act = cur.mode === 'holdem' ? this.chooseHoldem(cur) : this.chooseBluff(cur);
      if (act) { this.actionsSent++; this.send(act); } else this._acted = false;
    }, ri(lo, hi));
  }

  chooseHoldem(s) {
    const r = Math.random();
    const canRaise = s.maxRaiseTo > 0 && s.maxRaiseTo >= s.minRaiseTo;
    if (s.toCall === 0) {
      if (r < 0.55) return { t: 'act', a: 'check' };
      if (r < 0.62) return { t: 'act', a: 'fold' };
      if (r < 0.66 && canRaise) return { t: 'act', a: 'allin' };
    } else {
      if (r < 0.2) return { t: 'act', a: 'fold' };
      if (r < 0.6) return { t: 'act', a: 'call' };
      if (r < 0.65) return { t: 'act', a: 'allin' };
    }
    if (canRaise) return { t: 'act', a: 'raise', amount: ri(s.minRaiseTo, Math.min(s.maxRaiseTo, s.minRaiseTo + 600)) };
    return { t: 'act', a: s.toCall === 0 ? 'check' : 'call' };
  }

  chooseBluff(s) {
    const hand = s.myHand || [];
    const me = s.players.find((p) => p.id === s.you);
    if (!hand.length) return { t: 'liar' };
    if (!s.lastPlay) return this._play(hand);
    // others with cards? if only the last player had cards we'd have none (forced liar handled above)
    if (Math.random() < 0.35) return { t: 'liar' };
    void me;
    return this._play(hand);
  }

  _play(hand) {
    const n = ri(1, Math.min(3, hand.length));
    const idx = hand.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
    return { t: 'play', cards: idx };
  }
}

export { sleep };
