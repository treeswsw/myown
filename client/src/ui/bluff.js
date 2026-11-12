import { h, cardEl } from './dom.js';

const SUIT_CYCLE = ['s', 'h', 'c', 'd'];
export const handCode = (rank, i) => (rank === 'J' ? 'JK' : `${rank}${SUIT_CYCLE[i % 4]}`);

// Bluff mode: my whole hand at the bottom, PLAY / LIAR on the right, tip chip above, revolver count bottom-left.
export function createBluff(ui, send) {
  const hand = h('div', 'bhand');
  const tip = h('div', 'tip glass sys');
  const play = h('button', 'gb p sys');
  const liar = h('button', 'gb s glass sys', 'LIAR');
  const btns = h('div', 'btns', play, liar);
  const rv = h('div', 'rvtxt');
  play.type = liar.type = 'button';
  ui.append(hand, tip, btns, rv);
  const all = [hand, tip, btns, rv];
  let selected = new Set();
  let room = null;
  let handKey = '';
  let mine = false;

  const refresh = () => {
    const n = selected.size;
    const my = room.players.find((p) => p.id === room.you);
    tip.replaceChildren('이번 카드 ', h('b', '', room.tableRank), ...(mine
      ? (n ? [' · ', h('b', '', `${n}장`), ' 선택'] : [' · 낼 카드를 고르세요'])
      : [' · 상대 차례']));
    play.replaceChildren('PLAY', n ? h('i', '', n) : null);
    play.disabled = !mine || n === 0;
    liar.disabled = !mine || !room.lastPlay;
    hand.classList.toggle('dim', !mine);
    [...hand.children].forEach((c, i) => c.classList.toggle('sel', selected.has(i)));
    rv.replaceChildren('벌칙 ', h('b', '', `${my?.shots ?? 0} / 6`));
  };

  play.onclick = () => { send({ t: 'play', cards: [...selected].sort() }); selected = new Set(); };
  liar.onclick = () => send({ t: 'liar' });

  return {
    update(r, visible, canAct) {
      room = r;
      mine = canAct;
      all.forEach((e) => { e.style.display = visible ? '' : 'none'; });
      if (!visible) return;
      const key = r.myHand.join();
      if (key !== handKey || !canAct) { handKey = key; selected = new Set(); }
      if (hand.children.length !== r.myHand.length || hand.dataset.key !== key) {
        hand.dataset.key = key;
        hand.replaceChildren(...r.myHand.map((rank, i) => {
          const c = cardEl(handCode(rank, i));
          c.addEventListener('click', () => {
            if (!mine) return;
            if (selected.has(i)) selected.delete(i);
            else if (selected.size < 3) selected.add(i);
            refresh();
          });
          return c;
        }));
      }
      refresh();
    },
  };
}
