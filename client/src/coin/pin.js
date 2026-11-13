// 비밀번호 창 (걸기·바꾸기·없애기). SPEC 22-8, 22-10, 22-11. 사용자 글자는 textContent 로만.
import { saved, tokens } from '../state.js';
import './pin.css';

const ERR = {
  pin_bad: '비밀번호가 틀렸습니다.', pin_lock: '잠시 후 다시 시도하세요.', pin_fmt: '비밀번호는 숫자 4자리입니다.',
  pin_adm: '관리자 계정에는 걸 수 없습니다.',
};
const PIN_RE = /^\d{4}$/;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function field(label, ac) {
  const wrap = el('label', 'pn-label');
  wrap.append(el('span', 'pn-cap', label));
  const i = document.createElement('input');
  i.className = 'pn-field';
  i.type = 'password';
  i.inputMode = 'numeric';
  i.maxLength = 4;
  i.autocomplete = ac || 'off';
  i.setAttribute('pattern', '[0-9]*');
  i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); });
  wrap.append(i);
  return { wrap, input: i };
}

export function openPin(ctx) {
  const old = ctx.root.querySelector('.pn-root');
  if (old) old.remove();

  const root = el('div', 'pn-root');
  const panel = el('div', 'pn-panel');
  const head = el('div', 'pn-head');
  head.append(el('h2', 'pn-title', '비밀번호'));
  const close = el('button', 'pn-close', '닫기');
  close.type = 'button';
  head.append(close);
  const body = el('div', 'pn-body');
  const msg = el('p', 'pn-msg');
  msg.setAttribute('role', 'status');
  panel.append(head, body, msg);
  root.append(panel);
  ctx.root.append(root);

  let busy = false;
  let mode = 'home'; // home | change | clear
  const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('pn-bad', !!bad); };
  const hasPin = () => !!(ctx.wallet() && ctx.wallet().hasPin);

  function btn(text, kind, fn) {
    const b = el('button', 'pn-btn' + (kind ? ' pn-' + kind : ''), text);
    b.type = 'button';
    b.disabled = busy;
    b.addEventListener('click', fn);
    return b;
  }
  function send(obj) {
    if (busy) return;
    busy = true;
    say('');
    ctx.send(obj);
    render();
  }

  function render() {
    body.textContent = '';
    if (!hasPin()) {
      mode = 'home';
      body.append(el('p', 'pn-note', '숫자 4자리 비밀번호를 걸면 다른 사람이 내 아이디로 들어올 수 없습니다.'));
      const f = field('새 비밀번호 (숫자 4자리)', 'new-password');
      body.append(f.wrap, btn('비밀번호 걸기', 'primary', () => {
        if (!PIN_RE.test(f.input.value)) return say(ERR.pin_fmt, true);
        send({ t: 'pin', a: 'set', pin: f.input.value });
      }));
    } else if (mode === 'change') {
      const c = field('지금 비밀번호', 'current-password');
      const n = field('새 비밀번호 (숫자 4자리)', 'new-password');
      body.append(c.wrap, n.wrap, btn('바꾸기', 'primary', () => {
        if (!PIN_RE.test(c.input.value) || !PIN_RE.test(n.input.value)) return say(ERR.pin_fmt, true);
        send({ t: 'pin', a: 'set', pin: n.input.value, cur: c.input.value });
      }), btn('뒤로', 'text', () => { mode = 'home'; say(''); render(); }));
    } else if (mode === 'clear') {
      const c = field('지금 비밀번호', 'current-password');
      body.append(c.wrap, btn('없애기', 'danger', () => {
        if (!PIN_RE.test(c.input.value)) return say(ERR.pin_fmt, true);
        send({ t: 'pin', a: 'clear', cur: c.input.value });
      }), btn('뒤로', 'text', () => { mode = 'home'; say(''); render(); }));
    } else {
      body.append(el('p', 'pn-note', '비밀번호가 걸려 있습니다.'),
        btn('바꾸기', 'primary', () => { mode = 'change'; say(''); render(); }),
        btn('없애기', 'tint', () => { mode = 'clear'; say(''); render(); }));
    }
    const first = body.querySelector('input');
    if (first && !busy) first.focus({ preventScroll: true });
  }

  const offs = [];
  offs.push(ctx.on('pin', (m) => {
    if (!m || m.a !== 'ok') return;
    busy = false;
    if (m.tok) {
      try { tokens.set(saved.get('gs.lastId'), m.tok); } catch (e) { /* 저장 못 해도 계속 */ }
    }
    mode = 'home';
    render();
    say(m.has ? '비밀번호를 걸었습니다.' : '비밀번호를 없앴습니다.');
  }));
  offs.push(ctx.on('me', () => { if (!busy) render(); }));
  offs.push(ctx.on('error', (m) => {
    if (!m || !/^pin_/.test(m.code || '')) return;
    busy = false;
    render();
    say(ERR[m.code] || m.msg || '안 됩니다.', true);
  }));

  function end() {
    for (const o of offs) { try { if (o) o(); } catch (e) { /* 무시 */ } }
    document.removeEventListener('keydown', onKey);
    root.remove();
  }
  function onKey(e) { if (e.key === 'Escape') end(); }
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', end);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) end(); });

  render();
  return end;
}
