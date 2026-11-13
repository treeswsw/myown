// 미니게임 대기실 개인 칸: 코인 베팅 (공통 대기실의 waitPart('mn-bet')). 사용자 글자는 textContent 로만.
// 두 사람이 건 수가 같아야 내기가 성립한다(다르면 시작 버튼이 막히고 이유는 공통 대기실이 보여 준다). 둘 다 0 이면 내기 없는 판.
// createBetPart({ send, me }) -> { el, update(state), dispose() }
//   state = 방 상태 (wait.own[사람] = {bet}), me() = 내 계정(me.wallet.coins 가 가진 코인)
import { betModel } from './bet.pure.js';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createBetPart({ send, me }) {
  const el = h('div', 'mn-bet');
  const coins = h('div', 'mn-bet-coins');
  const minus = h('button', 'mn-bet-step', '−');
  const plus = h('button', 'mn-bet-step', '+');
  const input = h('input', 'mn-bet-input');
  minus.type = plus.type = 'button';
  minus.dataset.mn = 'bet-minus';
  plus.dataset.mn = 'bet-plus';
  input.dataset.mn = 'bet-input';
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', '건 코인');
  const row = h('div', 'mn-bet-row');
  row.append(minus, input, plus);
  const opp = h('div', 'mn-bet-opp');
  const match = h('button', 'mn-bet-match', '상대 베팅에 맞추기');
  match.type = 'button';
  match.dataset.mn = 'bet-match';
  const note = h('div', 'mn-bet-note');
  el.append(coins, row, opp, match, note);

  let m = null;
  let disposed = false;
  const pick = (n) => {
    if (disposed || !m || !m.canBet) return;
    send({ t: 'pick', patch: { bet: Math.max(0, Math.floor(n)) } });
  };
  minus.addEventListener('click', () => pick((m?.mine ?? 0) - 1));
  plus.addEventListener('click', () => pick((m?.mine ?? 0) + 1));
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n) || n < 0) { input.value = String(m?.mine ?? 0); return; }
    pick(n);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  match.addEventListener('click', () => { if (m?.canMatch) pick(m.oppBet); });

  function update(state) {
    if (disposed) return;
    m = betModel(state, me()?.wallet?.coins);
    el.hidden = false;
    coins.textContent = `가진 코인 ${m.coins}`;
    if (document.activeElement !== input) input.value = String(m.mine);
    input.max = String(m.coins);
    input.disabled = minus.disabled = plus.disabled = !m.canBet;
    minus.disabled ||= m.mine <= 0;
    plus.disabled ||= m.mine >= m.coins;
    opp.textContent = m.oppName ? `${m.oppName} 님이 건 코인: ${m.oppBet}` : '상대를 기다리는 중';
    match.disabled = !m.canMatch;
    match.hidden = !m.oppName;
    note.textContent = m.note;
  }

  return {
    el,
    update,
    dispose() {
      disposed = true;
      el.remove();
    },
  };
}
