import { saved } from './state.js';

let transport = { send() {} };

export const send = (msg) => transport.send(msg);
export const useTransport = (t) => { transport = t; };

// Reconnects forever; every (re)open logs in again with the remembered id so the server restores the seat.
export function connect(onMessage, onStatus) {
  let ws;
  let delay = 500;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      delay = 500;
      onStatus(true);
      const id = saved.get('gk.id');
      if (id) ws.send(JSON.stringify({ t: 'login', id }));
    };
    ws.onmessage = (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch (err) { console.error('bad message', err); }
    };
    ws.onclose = () => {
      onStatus(false);
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
  };
  transport = { send: (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); } };
  open();
}
