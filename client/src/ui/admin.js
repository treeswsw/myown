// 관리자 패널 (SPEC 21-5). me.admin 일 때만 DOM 이 생긴다. CSS 는 전부 .adm- (admin.css).
// createAdmin({ send, getRoom }) -> { setAdmin(bool), refresh(), ok(msg), error(msg) -> true 면 여기서 처리함 }
import './admin.css';
import { listFx } from '../admin/fx.js';
import { GAMES } from '../../../shared/games.js';

const MODE_NAMES = { holdem: '홀덤', bluff: '블러핑', liar: '라이어', yacht: '요트', draw: '갱식마인드' };
const RECENT_MS = 2000; // 관리자 요청 직후 도착한 오류는 이 패널의 것으로 본다

export function createAdmin({ send, getRoom }) {
  let root = null, panel = null, status = null, fxBox = null, roomBtns = [];
  let lastReq = 0, bots = null;
  let detail = null, detailBox = null, detailStatus = null, econ = null, fields = null; // 세부 설정 화면 (SPEC 21-7)

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

  // ---- 세부 설정 (SPEC 21-7): 게임별 코인, 교환 시세 ----
  const gameName = (key) => Object.values(GAMES).find((g) => g.coin === key)?.name ?? key;
  const numInput = (value, label) => {
    const i = el('input', 'adm-input adm-num');
    i.type = 'text'; i.inputMode = 'numeric'; i.maxLength = 8; i.autocomplete = 'off';
    i.value = String(value);
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => { i.value = i.value.replace(/[^\d]/g, ''); });
    return i;
  };
  const setDetailStatus = (t) => { if (detailStatus) detailStatus.textContent = t || ''; };
  function renderDetail(msg) {
    if (!detailBox) return;
    econ = msg.econ;
    const lim = msg.limits;
    fields = { rules: {}, cpc: null, back: null, lim };
    detailBox.replaceChildren();
    const sec = (t) => detailBox.append(el('h4', 'adm-sub', t));
    sec('코인 교환 시세');
    const cpcRow = el('label', 'adm-field');
    fields.cpc = numInput(econ.chipsPerCoin, '1코인당 칩');
    cpcRow.append(el('span', 'adm-flabel', '1코인 = 칩'), fields.cpc, el('span', 'adm-fhint', `(${lim.chipsPerCoin[0]}~${lim.chipsPerCoin[1]}, 기본 ${msg.defaults.chipsPerCoin})`));
    detailBox.append(cpcRow);
    const backRow = el('label', 'adm-field');
    fields.back = numInput(econ.chipsPerCoinBack, '코인 1개를 얻는 칩');
    backRow.append(el('span', 'adm-flabel', '칩 → 코인: 칩'), fields.back, el('span', 'adm-fhint', `= 1코인 (${lim.chipsPerCoinBack[0]}~${lim.chipsPerCoinBack[1]}, 기본 ${msg.defaults.chipsPerCoinBack}, 시작 칩 10,000은 남김)`));
    detailBox.append(backRow);
    sec('게임별 코인 (받는 코인 = 완주 + 승리 × 상대 수)');
    for (const key of Object.keys(econ.rules)) {
      const r = econ.rules[key], d = msg.defaults.rules[key];
      const box = el('div', 'adm-game');
      box.append(el('b', 'adm-gname', gameName(key) + (r.graded ? ' (등수별 차등: 꼴찌 완주, 1등 완주 + 승리 × 상대 수)' : '')));
      const f = { finish: numInput(r.finish, `${gameName(key)} 완주 코인`), win: numInput(r.win, `${gameName(key)} 승리 코인`), gap: numInput(Math.round(r.gapMs / 1000), `${gameName(key)} 지급 간격(초)`) };
      fields.rules[key] = f;
      const row = (label, input, hint) => { const l = el('label', 'adm-field'); l.append(el('span', 'adm-flabel', label), input, el('span', 'adm-fhint', hint)); box.append(l); };
      row(key === 'draw' ? '완주 (8문제 기준)' : '완주', f.finish, `기본 ${d.finish}`);
      row('승리(상대 1명당)', f.win, `기본 ${d.win}`);
      row('지급 간격(초)', f.gap, `기본 ${Math.round(d.gapMs / 1000)}`);
      detailBox.append(box);
    }
    detailBox.append(el('p', 'adm-note', '상점 가격은 상점 개편 뒤 추가'));
  }
  function saveDetail() {
    if (!fields) return;
    const lim = fields.lim;
    const rules = {};
    const cpc = Number(fields.cpc.value);
    const back = Number(fields.back.value);
    if (!fields.back.value || back < lim.chipsPerCoinBack[0] || back > lim.chipsPerCoinBack[1]) { setDetailStatus(`칩 → 코인 시세는 ${lim.chipsPerCoinBack[0]}~${lim.chipsPerCoinBack[1]} 사이로 적으세요.`); return; }
    if (!fields.cpc.value || cpc < lim.chipsPerCoin[0] || cpc > lim.chipsPerCoin[1]) { setDetailStatus(`교환 시세는 ${lim.chipsPerCoin[0]}~${lim.chipsPerCoin[1]} 사이로 적으세요.`); return; }
    for (const [key, f] of Object.entries(fields.rules)) {
      const cols = [['finish', f.finish, 1, '완주 코인'], ['win', f.win, 1, '승리 코인'], ['gapMs', f.gap, 1000, '지급 간격(초)']];
      const v = {};
      for (const [k, input, mul, label] of cols) {
        const n = Number(input.value) * mul;
        if (input.value === '' || n < lim[k][0] || n > lim[k][1]) { setDetailStatus(`${gameName(key)} ${label}: ${lim[k][0] / mul}~${lim[k][1] / mul} 사이로 적으세요.`); return; }
        v[k] = n;
      }
      rules[key] = v;
    }
    lastReq = Date.now(); setDetailStatus('');
    send({ t: 'adm', a: 'econSet', econ: { rules, chipsPerCoin: cpc, chipsPerCoinBack: back } });
  }
  function openDetail() {
    if (!detail) {
      detail = el('div', 'adm-detail');
      const card = el('div', 'adm-dcard');
      detailBox = el('div', 'adm-dbox');
      detailStatus = el('p', 'adm-status');
      detailStatus.setAttribute('role', 'status');
      const bar = el('div', 'adm-row');
      bar.append(
        btn('adm-btn adm-save', '저장', saveDetail),
        btn('adm-btn adm-reset', '기본값으로 되돌리기', () => { lastReq = Date.now(); setDetailStatus(''); send({ t: 'adm', a: 'econReset' }); }),
        btn('adm-btn adm-dclose', '닫기', () => { detail.hidden = true; }),
      );
      card.append(el('h3', 'adm-title', '세부 설정'), detailBox, detailStatus, bar);
      detail.append(card);
      document.body.append(detail);
    }
    detail.hidden = false;
    setDetailStatus('');
    detailBox.replaceChildren(el('p', 'adm-empty', '불러오는 중…'));
    lastReq = Date.now();
    send({ t: 'adm', a: 'econ' });
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
    const row = el('div', 'adm-row');
    row.append(...roomBtns);
    const pinId = el('input', 'adm-input');
    pinId.type = 'text'; pinId.placeholder = '아이디'; pinId.maxLength = 12; pinId.autocomplete = 'off';
    pinId.setAttribute('aria-label', '비밀번호를 지울 아이디');
    const pinRow = el('div', 'adm-row');
    pinRow.append(pinId, btn('adm-btn', '비밀번호 지우기', () => {
      const id = pinId.value.trim();
      if (!id) { setStatus('아이디를 적으세요.'); return; }
      lastReq = Date.now(); setStatus('');
      send({ t: 'adm', a: 'pinclr', id });
    }));
    const chipN = el('input', 'adm-input');
    chipN.type = 'text'; chipN.inputMode = 'numeric'; chipN.placeholder = '수'; chipN.maxLength = 8; chipN.autocomplete = 'off';
    chipN.setAttribute('aria-label', '추가할 칩');
    const give = (a) => () => {
      const id = pinId.value.trim();
      const n = Number(chipN.value.replace(/[^\d]/g, ''));
      if (!id) { setStatus('아이디를 적으세요.'); return; }
      if (!n) { setStatus('수를 적으세요.'); return; }
      lastReq = Date.now(); setStatus('');
      send({ t: 'adm', a, id, n });
    };
    const chipRow = el('div', 'adm-row');
    chipRow.append(chipN, btn('adm-btn', '칩 추가', give('chips')), btn('adm-btn', '코인 추가', give('coins')));
    panel.append(el('h3', 'adm-title', '관리자'), row, pinRow, chipRow, btn('adm-btn adm-open-detail', '세부 설정', openDetail), status,
      el('h4', 'adm-sub', '연출 보기'), fxBox, btn('adm-btn adm-close', '닫기', () => { panel.hidden = true; }));
    root.append(panel, toggle);
    document.body.append(root);
    refresh();
  }
  function destroy() { detail?.remove(); detail = detailBox = detailStatus = econ = fields = null; root?.remove(); root = panel = status = fxBox = null; roomBtns = []; bots = null; }

  return {
    setAdmin(on) { if (on && !root) build(); else if (!on && root) destroy(); else refresh(); },
    refresh,
    ok(msg) {
      if (msg.a === 'econ') {
        if (detail && !detail.hidden) { renderDetail(msg); setDetailStatus(msg.saved ? '저장했습니다. 바로 적용됩니다.' : ''); }
        return;
      }
      if (msg.a === 'pinclr') { setStatus('비밀번호를 지웠습니다.'); return; }
      if (msg.a === 'chips') { setStatus(`${msg.id}에게 칩 ${Number(msg.n).toLocaleString('ko-KR')}개 추가 (지금 ${Number(msg.bank).toLocaleString('ko-KR')})`); return; }
      if (msg.a === 'coins') { setStatus(`${msg.id}에게 코인 ${Number(msg.n).toLocaleString('ko-KR')}개 추가 (지금 ${Number(msg.coins).toLocaleString('ko-KR')})`); return; }
      if (Number.isFinite(msg.bots)) bots = msg.bots;
      setStatus(bots == null ? '완료' : `봇 ${bots}명`);
    },
    // true: this error belongs to the panel (the caller shows no toast)
    error(msg) {
      if (!root) return false;
      // adm_ codes, or an uncoded error (the room's join-refusal text for bot+) right after an admin request; other coded errors keep their normal handling
      const coded = typeof msg.code === 'string' && msg.code !== '';
      const mine = coded ? msg.code.startsWith('adm_') : Date.now() - lastReq < RECENT_MS;
      if (!mine) return false;
      lastReq = 0;
      if (detail && !detail.hidden) setDetailStatus(msg.msg); else setStatus(msg.msg);
      return true;
    },
  };
}
