export const state = { me: null, room: null };

export const saved = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

/* PIN device tokens, one per id: localStorage 'gs.tok' = JSON {lowercased id: token}. The old plain-string format is discarded. */
const tokKey = (id) => String(id ?? '').trim().toLowerCase();
function tokMap() {
  try {
    const o = JSON.parse(saved.get('gs.tok') ?? 'null');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}
export const tokens = {
  get(id) { const t = tokMap()[tokKey(id)]; return typeof t === 'string' && t ? t : null; },
  set(id, tok) { const k = tokKey(id); if (!k) return; const o = tokMap(); o[k] = tok; saved.set('gs.tok', JSON.stringify(o)); },
  del(id) {
    const o = tokMap(); delete o[tokKey(id)];
    if (Object.keys(o).length) saved.set('gs.tok', JSON.stringify(o)); else saved.del('gs.tok');
  },
};
