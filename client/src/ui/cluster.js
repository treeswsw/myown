import { h, cardEl, cardBack, fmtShort, fmt } from './dom.js';

const STREETS = ['프리플랍', '플랍', '턴', '리버'];

// Bottom-left holdem cluster: hole cards (face-up only while pressed), chips, board mirror, current bet.
export function createCluster(ui) {
  const root = h('div', 'cluster');
  const hole = h('div', 'hole');
  const stackNum = h('div', 'num');
  const hint = h('div', 'hint');
  const comm = h('div', 'comm');
  const betNum = h('div', 'num');
  root.append(hole, h('div', 'line', h('div', 'coin'), stackNum, hint), comm, h('div', 'line', h('div', 'coin g'), betNum));
  ui.append(root);
  let room = null;
  let shown = 0; // community cards already mirrored, so only new ones flip in
  let peeking = false;

  const renderHole = () => {
    const me = room.players.find((p) => p.id === room.you);
    const cards = room.myCards;
    hole.style.visibility = cards ? '' : 'hidden';
    hole.classList.toggle('peek', peeking);
    hole.replaceChildren(...(cards ? cards.map((c) => (peeking ? cardEl(c) : cardBack())) : []));
    hint.replaceChildren(...(peeking && room.myBest ? [room.myBest] : []));
    return me;
  };

  const press = (on) => { if (!room?.myCards) return; peeking = on; renderHole(); };
  hole.addEventListener('pointerdown', (e) => { hole.setPointerCapture?.(e.pointerId); press(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => hole.addEventListener(t, () => press(false)));
  hole.addEventListener('contextmenu', (e) => e.preventDefault());

  function zoom() {
    const slots = Array.from({ length: 5 }, (_, i) => (room.board[i] ? cardEl(room.board[i]) : h('div', 'slot')));
    const ov = h('div', 'ov', h('div', 't', `공용 카드 · ${STREETS[room.street] ?? ''}`), h('div', 'row', slots),
      room.myBest ? h('div', 'num r', room.myBest) : null, h('div', 'x', '화면을 누르면 닫힙니다'));
    ov.addEventListener('pointerdown', () => ov.remove());
    ui.append(ov);
  }
  comm.addEventListener('click', zoom);

  return {
    update(r, visible) {
      room = r;
      root.style.display = visible ? '' : 'none';
      if (!visible) return;
      const me = renderHole();
      stackNum.textContent = fmtShort(me?.stack ?? 0);
      betNum.textContent = fmt(me?.bet ?? 0);
      const old = shown;
      comm.replaceChildren(...Array.from({ length: 5 }, (_, i) => {
        if (!r.board[i]) return h('div', 'slot');
        return cardEl(r.board[i], i >= old ? 'flip' : '');
      }));
      shown = r.board.length;
    },
    isPeeking: () => peeking,
    pressBoard: zoom,
  };
}
