export const state = { me: null, room: null };

export const myPlayer = () => state.room?.players.find((p) => p.id === state.room.you) ?? null;

export const saved = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
