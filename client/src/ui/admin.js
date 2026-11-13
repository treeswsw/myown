// 관리자 패널 (SPEC 21-5). me.admin 일 때만 DOM 이 생긴다. CSS 는 전부 .adm- (admin.css).
// createAdmin({ send, getRoom }) -> { setAdmin(bool), refresh(), ok(msg), error(msg) -> true 면 여기서 처리함 }
import './admin.css';
import { listFx } from '../admin/fx.js';

const MODE_NAMES = { holdem: '홀덤', bluff: '블러핑', liar: '라이어', yacht: '요트', draw: '갱식마인드' };
const RECENT_MS = 2000; // 관리자 요청 직후 도착한 오류는 이 패널의 것으로 본다

export function createAdmin({ send, getRoom }) {
  let root = null, panel = null, status = null, fxBox = null, roomBtns = [];
  let lastReq = 0, bots = null;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (cls, text, onclick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = onclick;
    return b;
  };
  const setStatus = (text) => { if (status) status.textContent = text || ''; };
  const request = (a) => { lastReq = Date.now(); setStatus(''); send({ t: 'adm', a }); };

  function renderFx() {
    if (!fxBox) return;
    const room = getRoom();
    const list = listFx(room ? room.mode : null);
    fxBox.replaceChildren();
    if (!list.length) { fxBox.append(el('p', 'adm-empty', '연출 없음')); return; }
    for (const f of list) {
      const label = room ? f.label : `${MODE_NAMES[f.mode] ?? f.mode} · ${f.label}`;
      fxBox.append(btn('adm-fx', label, async () => {
        try { await f.play(); } catch (e) { console.error(e); setStatus('연출을 재생하지 못했습니다.'); }
      }));
    }
  }
  function refresh() {
    if (!root) return;
    const inRoom = Boolean(getRoom());
    for (const b of roomBtns) b.hidden = !inRoom;
    if (panel && !panel.hidden) renderFx();
  }
  function build() {
    root = el('div', 'adm-root');
    const toggle = btn('adm-toggle', '관리자', () => { panel.hidden = !panel.hidden; refresh(); });
    panel = el('div', 'adm-panel');
    panel.hidden = true;
    roomBtns = [
      btn('adm-btn', '봇 추가', () => request('bot+')),
      btn('adm-btn', '봇 빼기', () => request('bot-')),
      btn('adm-btn', '단계 건너뛰기', () => request('skip')),
    ];
    status = el('p', 'adm-status');
    status.setAttribute('role', 'status');
    fxBox = el('div', 'adm-fxbox');
    panel.append(el('h3', 'adm-title', '관리자'), el('div', 'adm-row', ...roomBtns), status,
      el('h4', 'adm-sub', '연출 보기'), fxBox, btn('adm-btn adm-close', '닫기', () => { panel.hidden = true; }));
    root.append(panel, toggle);
    document.body.append(root);
    refresh();
  }
  function destroy() { root?.remove(); root = panel = status = fxBox = null; roomBtns = []; bots = null; }

  return {
    setAdmin(on) { if (on && !root) build(); else if (!on && root) destroy(); else refresh(); },
    refresh,
    ok(msg) {
      if (Number.isFinite(msg.bots)) bots = msg.bots;
      setStatus(bots == null ? '완료' : `봇 ${bots}명`);
    },
    // true: this error belongs to the panel (the caller shows no toast)
    error(msg) {
      if (!root) return false;
      const mine = (typeof msg.code === 'string' && msg.code.startsWith('adm_')) || Date.now() - lastReq < RECENT_MS;
      if (!mine) return false;
      lastReq = 0;
      setStatus(msg.msg);
      return true;
    },
  };
}
