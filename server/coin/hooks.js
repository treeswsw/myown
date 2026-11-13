// Coin hooks (SPEC 22-2, 22-13): connect the liar / yacht / draw rooms to hub.award WITHOUT touching their folders.
// hookRoom(hub, room) is called once, right after a room object is created. It wraps the room's own settle step
// (called through `this.`, so wrapping the instance works): original first, then read the result and award.
// If the function we expect is missing, we throw at room creation so tests catch API drift.

function need(room, name) {
  if (typeof room[name] !== 'function') throw new Error(`coin hooks: ${room.mode} room has no ${name}() to wrap`);
  return room[name].bind(room);
}

const inRoom = (room, id) => !!room.members?.some((m) => m.id === id);

// Liar: settle() runs once when the round enters `result`. Void rounds give nothing.
// Finishers = round players who did not drop and are still in the room. Citizens opp = 1, liar opp = #citizens.
function hookLiar(hub, room) {
  const settle = need(room, 'settle');
  room.settle = function coinSettle(...args) {
    const out = settle(...args);
    const g = room.game;
    const r = g?.result;
    if (!r || r.winner === 'void') return out;
    const rows = g.players
      .filter((id) => !g.dropped.includes(id) && inRoom(room, id))
      .map((id) => {
        const liar = id === g.liarId;
        return { id, won: liar ? r.winner === 'liar' : r.winner === 'citizens', opp: liar ? g.players.length - 1 : 1 };
      });
    hub.award(room, 'liar', rows);
    return out;
  };
}

// Yacht: settle() runs once at the result. ranks hold only players who did not forfeit. Ties are all winners.
function hookYacht(hub, room) {
  const settle = need(room, 'settle');
  room.settle = function coinSettle(...args) {
    const out = settle(...args);
    const g = room.game;
    const r = g?.result;
    if (!r) return out;
    const opp = g.cols.length - 1;
    const rows = r.ranks
      .filter((row) => inRoom(room, row.id))
      .map((row) => ({ id: row.id, won: r.winners.includes(row.id), opp }));
    hub.award(room, 'yacht', rows);
    return out;
  };
}

// Draw: save(ranking) runs when a game ends. Only people who were there at the start count (late joiners get 0).
// Starters are noted from syncMembers(), which runs after every engine step and before anyone can join mid-game.
function hookDraw(hub, room) {
  const save = need(room, 'save');
  const sync = need(room, 'syncMembers');
  let starters = null;
  room.syncMembers = function coinSync(...args) {
    const out = sync(...args);
    const ph = room.g?.phase;
    if (ph === 'lobby' || ph === 'final') starters = null;
    else if (ph && !starters) starters = new Set(room.g.players.map((p) => p.id));
    return out;
  };
  room.save = function coinSave(ranking, ...rest) {
    const out = save(ranking, ...rest);
    const who = starters ?? new Set(ranking.map((r) => r.id));
    const opp = who.size - 1;
    const rows = ranking
      .filter((r) => !r.left && who.has(r.id))
      .map((r) => ({ id: r.id, won: r.rank === 1, opp }));
    hub.award(room, 'draw', rows);
    return out;
  };
}

export function hookRoom(hub, room) {
  if (typeof hub.award !== 'function') throw new Error('coin hooks: hub.award is missing');
  switch (room.mode) {
    case 'liar': hookLiar(hub, room); break;
    case 'yacht': hookYacht(hub, room); break;
    case 'draw': hookDraw(hub, room); break;
    default: throw new Error(`coin hooks: no hook for mode ${room.mode}`);
  }
  return room;
}
