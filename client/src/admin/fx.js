// 관리자 연출 보기: 이미 있는 연출을 이 기기에서만, 가짜 자료로 다시 틀어 본다. 서버로는 아무것도 보내지 않는다.
// 진짜 게임 상태는 건드리지 않는다(덮개 판을 따로 만들고 끝나면 지운다). 게임 폴더의 코드는 필요할 때만 import() 한다.
// 새 게임이 생기면 이 배열에 { mode, id, label, play } 를 더한다. mode 가 'all' 이면 어느 방에서나 보인다.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = (z = 395) => {
  const d = document.createElement('div');
  d.dataset.adminFx = '1';
  d.style.cssText = `position:fixed;inset:0;z-index:${z};overflow:hidden`;
  document.body.append(d);
  return d;
};
// 화면을 누르면 바로 끝낸다
const dismissable = (box) => {
  const st = { off: false };
  box.addEventListener('click', () => { st.off = true; }, { once: true });
  return st;
};

// ---- 홀덤: 승리 화면 (anim/win.js 와 같은 모양, style.css 의 .win 을 쓴다) ----
async function pokerWin({ showdown, tie }) {
  const [{ h, avatar, cardEl, fmt }, { sfx }] = await Promise.all([import('../ui/dom.js'), import('../audio.js')]);
  const hole = ['Ah', 'Ad'];
  const board = ['As', 'Kc', '7d', '7s', '2h'];
  const best = new Set(['Ah', 'Ad', 'As', '7d', '7s']);
  let n = 0;
  const card = (c) => {
    const el = cardEl(c, best.has(c) ? 'valid' : 'invalid');
    if (best.has(c)) el.style.setProperty('--d', `${0.5 + 0.25 * n++}s`);
    return el;
  };
  const row = () => h('div', 'show', avatar({ name: '민수', avatar: null }, 'pav'), h('div', 'cardrow', hole.map(card)), h('div', 'gap'), h('div', 'cardrow', board.map(card)));
  const names = tie ? ['민수', '지우'] : ['민수'];
  const wins = names.map((nm) => h('div', 'w', h('span', 'ko', nm), h('span', 'num', 'WINS'), h('span', 'num', `+${fmt(12500)}`)));
  const root = mount();
  try {
  try { sfx.win?.(); } catch { /* 소리는 없어도 된다 */ }
  const overlay = showdown
    ? h('div', `win ${tie ? 'small' : ''}`, h('div', 'sc', h('div', 'ko wt', '풀하우스'), row(), h('div', 'ws', wins)))
    : h('div', 'win small', h('div', 'sc', h('div', 'ws', wins)));
  root.append(overlay);
  const st = dismissable(root);
  const t0 = Date.now();
  const hold = showdown ? 4000 : 1800;
  while (!st.off && Date.now() - t0 < hold) await sleep(100);
  overlay.classList.add('out');
  await sleep(400);
  } finally { root.remove(); }
}

async function pokerAllIn() {
  const [{ bigText }, { sfx }] = await Promise.all([import('../anim/fx.js'), import('../audio.js')]);
  const root = mount();
  try {
    bigText(root, 'ALL IN', [innerWidth / 2, innerHeight / 2]);
    try { sfx.thud?.(); } catch { /* */ }
    await sleep(1500);
  } finally { root.remove(); }
}

async function pokerFlash() {
  const { flash } = await import('../anim/fx.js');
  const root = mount();
  try {
    flash(root);
    await sleep(400);
  } finally { root.remove(); }
}

// ---- 요트: 색종이 ----
async function yachtConfetti() {
  const { createFx } = await import('../yacht/anim/fx.js');
  const host = mount();
  let fx = null;
  try {
    fx = createFx({ host });
    fx.confetti(Date.now() % 1e9, 80);
    await sleep(2800);
  } finally { try { fx?.dispose(); } finally { host.remove(); } }
}

// ---- 라이어: 정체 공개 / 정답 공개 (liar/anim 의 실제 모듈을 가짜 상태로 돌린다) ----
const LIAR_PLAYERS = [
  { id: 'a', name: '민수', color: '#e0524f' }, { id: 'b', name: '지우', color: '#4f9be0' }, { id: 'c', name: '서연', color: '#5fbf7a' },
];
async function liarRun(which, mk, totalSec) {
  const [mod] = await Promise.all([
    import(which === 'unmask' ? '../liar/anim/unmask.js' : '../liar/anim/ending.js'),
    import('../liar/anim/unmask.css'), import('../liar/anim/ending.css'),
  ]);
  const root = mount();
  let m = null;
  try {
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;inset:0;background:#040305';
    root.append(inner);
    const ctx = { root: inner, nogl: true, now: () => Date.now(), faceOf: () => null, anchor: null };
    m = which === 'unmask' ? mod.createUnmask(ctx) : mod.createEnding(ctx);
    const state = mk(Date.now() + totalSec * 1000);
    const st = dismissable(root);
    const t0 = Date.now();
    while (!st.off && Date.now() - t0 < totalSec * 1000 + 300) {
      m.update(state);
      m.frame();
      await sleep(50);
    }
  } finally {
    try { m?.dispose(); } finally { root.remove(); }
  }
}
const liarBase = { players: LIAR_PLAYERS, you: 'b', round: 1, accuseNo: 1, settings: { times: { guess: 30 } }, words: { citizen: '사과', liar: '배' } };
const unmaskState = (wasLiar) => (end) => ({ ...liarBase, phase: 'unmask', phaseEndsAt: end, unmask: { id: 'a', liarId: 'a', wasLiar } });
const unmaskFail = (end) => ({ ...liarBase, phase: 'unmask', phaseEndsAt: end, unmask: { id: null, liarId: 'a', wasLiar: false } });
const endState = (correct) => (end) => ({ ...liarBase, phase: 'answer', phaseEndsAt: end, unmask: { id: 'a', liarId: 'a', wasLiar: true }, guess: { text: '배', correct } });

export const FX = [
  { mode: 'holdem', id: 'holdem-win', label: '승리 (쇼다운)', play: () => pokerWin({ showdown: true }) },
  { mode: 'holdem', id: 'holdem-win-tie', label: '승리 (무승부 둘)', play: () => pokerWin({ showdown: true, tie: true }) },
  { mode: 'holdem', id: 'holdem-win-fold', label: '승리 (모두 포기)', play: () => pokerWin({ showdown: false }) },
  { mode: 'holdem', id: 'holdem-allin', label: 'ALL IN 글자', play: pokerAllIn },
  { mode: 'holdem', id: 'holdem-flash', label: '화면 번쩍', play: pokerFlash },
  { mode: 'yacht', id: 'yacht-confetti', label: '색종이', play: yachtConfetti },
  { mode: 'liar', id: 'liar-unmask-liar', label: '정체 공개 (라이어 맞음)', play: () => liarRun('unmask', unmaskState(true), 6) },
  { mode: 'liar', id: 'liar-unmask-citizen', label: '정체 공개 (시민이었음)', play: () => liarRun('unmask', unmaskState(false), 11) },
  { mode: 'liar', id: 'liar-unmask-fail', label: '정체 공개 (지목 실패)', play: () => liarRun('unmask', unmaskFail, 5) },
  { mode: 'liar', id: 'liar-ending-ok', label: '정답 공개 (맞힘)', play: () => liarRun('ending', endState(true), 10) },
  { mode: 'liar', id: 'liar-ending-no', label: '정답 공개 (틀림)', play: () => liarRun('ending', endState(false), 10) },
];

/** mode 가 없으면(로비 등) 전부, 있으면 그 게임 것 + 'all'. */
export function listFx(mode) {
  return mode ? FX.filter((e) => e.mode === mode || e.mode === 'all') : FX.slice();
}
