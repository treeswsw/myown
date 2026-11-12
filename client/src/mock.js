// Dev-only: ?mock=holdem|bluff&state=preflop|default|peek|board|raise|win|allin|bust|shot|shotsafe|flood (flood: bluff only)
// Add &fx=full to keep the full effects even on a slow machine.
// Feeds canned messages through the same handler the WebSocket uses.
const PEOPLE = [
  ['me', '민수', '#7a3b3b', '#2a1a12'], ['jiwoo', '지우', '#3b5a7a', '#5a3a1c'], ['seoyeon', '서연', '#4a6b4a', '#1a1411'],
  ['taeho', '태호', '#6a4a7a', '#3a2a1a'], ['harin', '하린', '#8a6a2a', '#2a1a12'],
];

function photo(col, hair) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(80, 50, 6, 80, 80, 106);
  r.addColorStop(0, '#7a6858'); r.addColorStop(1, '#241c17');
  g.fillStyle = r; g.fillRect(0, 0, 160, 160);
  g.fillStyle = col; g.beginPath(); g.ellipse(80, 164, 70, 52, 0, 0, 7); g.fill();
  g.fillStyle = '#c99b7a'; g.fillRect(69, 88, 22, 31);
  g.fillStyle = '#e0b592'; g.beginPath(); g.arc(80, 69, 30, 0, 7); g.fill();
  g.fillStyle = hair; g.beginPath(); g.arc(80, 65, 31, Math.PI, 0); g.quadraticCurveTo(80, 50, 49, 65); g.fill();
  return c.toDataURL('image/jpeg', 0.85);
}

const player = (i, extra) => {
  const [id, name, col, hair] = PEOPLE[i];
  return { id, name, avatar: photo(col, hair), seat: i, connected: true, spectating: false, ...extra };
};

function holdemRoom(st) {
  const preflop = st === 'preflop';
  return {
    code: 'KMPT', mode: 'holdem', hostId: 'me', phase: 'playing', you: 'me',
    players: [
      player(0, { stack: 9650, bet: 350, folded: false, allin: false, isDealer: true, cards: ['Kh', '9s'] }),
      player(1, { stack: 8900, bet: 0, folded: true, allin: false, isDealer: false, cards: null }),
      player(2, { stack: 21300, bet: 700, folded: false, allin: false, isDealer: false, cards: null }),
      player(3, { stack: 5100, bet: 0, folded: false, allin: false, isDealer: false, cards: null }),
      player(4, { stack: 15700, bet: 350, folded: false, allin: false, isDealer: false, cards: null }),
    ],
    turn: 'me', turnEndsAt: null,
    board: preflop ? [] : ['Ks', '9h', '4d', '9c'], pot: 2450, pots: [{ amount: 2450, eligible: ['me', 'seoyeon', 'taeho', 'harin'] }],
    street: preflop ? 0 : 2, toCall: 350, minRaiseTo: 1050, maxRaiseTo: 10000,
    myCards: ['Kh', '9s'], myBest: preflop ? null : '트리플', result: null,
  };
}

function bluffRoom() {
  const me = { id: 'seoyeon', name: '서연', avatar: photo(...PEOPLE[2].slice(2)), seat: 0, connected: true, spectating: false, alive: true, handCount: 5, shots: 2 };
  const other = (i, handCount, shots) => ({ ...player(i, { alive: true, handCount, shots }) });
  return {
    code: 'RQWX', mode: 'bluff', hostId: 'seoyeon', phase: 'playing', you: 'seoyeon',
    players: [me, other(0, 3, 1), other(4, 2, 0), other(1, 4, 0)],
    turn: 'seoyeon', turnEndsAt: null,
    tableRank: 'K', round: 3, myHand: ['A', 'K', 'K', 'Q', 'J'], lastPlay: { by: 'harin', count: 2 }, reveal: null, winnerId: null,
  };
}

export function startMock(handle, { mode, state }) {
  const send = (msg) => handle(msg);
  const event = (e) => send({ t: 'event', e });
  const bluff = mode === 'bluff';
  const room = bluff ? bluffRoom() : holdemRoom(state);
  send({ t: 'me', user: { id: room.you, name: bluff ? '서연' : '민수', bank: 9650, avatar: null, stats: { hands: 42, wins: 17, biggestWin: 4900, refills: 1, bluffGames: 6, bluffWins: 2 } } });
  if (!bluff) {
    event({ k: 'action', id: 'seoyeon', a: 'raise', amount: 700 });
    event({ k: 'action', id: 'harin', a: 'call', amount: 350 });
    event({ k: 'action', id: 'me', a: 'call', amount: 350 });
  }
  send({ t: 'room', state: room });

  const later = (ms, fn) => setTimeout(() => { fn(); document.body.dataset.fired = '1'; }, ms); // marker lets screenshot scripts sync
  if (state === 'peek') later(1500, () => document.querySelector('.hole').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  if (state === 'board') later(1500, () => document.querySelector('.comm').click());
  if (state === 'raise') later(1500, () => document.querySelector('.act .wseg:nth-of-type(2)').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  if (bluff && state === 'default') later(1500, () => document.querySelectorAll('.bhand .pc').forEach((c, i) => { if (i === 1 || i === 2) c.click(); }));
  if (state === 'win') {
    later(1500, () => {
      const winners = [{ id: 'seoyeon', amount: 4900, handName: '풀하우스', cards: ['9h', '9c', '9s', 'Kh', 'Ks'] }];
      const shown = { me: ['Kh', '9s'], seoyeon: ['Qd', 'Jd'] };
      event({ k: 'showdown', shown });
      event({ k: 'win', winners, pot: 4900 });
      send({ t: 'room', state: { ...room, phase: 'result', turn: null, pot: 0, result: { winners, shown, busted: [] },
        players: room.players.map((p) => (p.id === 'seoyeon' ? { ...p, stack: p.stack + 4900 } : { ...p, bet: 0 })) } });
    });
  }
  if (state === 'allin') later(1500, () => { event({ k: 'allin', id: 'harin' }); send({ t: 'room', state: { ...room, players: room.players.map((p) => (p.id === 'harin' ? { ...p, stack: 0, bet: 16050, allin: true } : p)) } }); });
  if (state === 'bust') {
    later(1500, () => {
      event({ k: 'bust', id: 'jiwoo', by: 'seoyeon' });
      send({ t: 'room', state: { ...room, phase: 'result', result: { winners: [], shown: {}, busted: ['jiwoo'] }, players: room.players.map((p) => (p.id === 'jiwoo' ? { ...p, stack: 0, eliminated: true, spectating: true } : p)) } });
    });
  }
  if (state === 'shot' || state === 'shotsafe') later(1500, () => event({ k: 'shot', id: 'seoyeon', dead: state === 'shot', shots: 3 }));
  if (state === 'flood') {
    later(1500, () => {
      for (let i = 0; i < 4; i++) {
        event({ k: 'liar', caller: 'seoyeon', by: 'harin' });
        event({ k: 'reveal', by: 'harin', caller: 'seoyeon', cards: ['K', 'Q'], lie: true, loser: 'harin', dead: false, shots: i + 1 });
        event({ k: 'shot', id: 'harin', dead: false, shots: i + 1 });
      }
      send({ t: 'room', state: { ...room, round: 7, players: room.players.map((p) => ({ ...p, shots: 4 })) } });
    });
  }
}
