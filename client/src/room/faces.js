// 방 사람들의 프로필 사진·꾸미기 (COMMON-CONTRACT 3·4-1). 방 상태에는 사진이 없고 `faces` 알림으로만 온다.
// createFaces() -> { apply(e), get(id) -> {avatar, look}, drop(id), clear(), onChange(fn) -> off }
//   e = {k:'faces', items:[{id, avatar, look?}]} (받은 사람만 덮어쓴다)
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const NONE = Object.freeze({ avatar: null, look: null });

export function createFaces() {
  const map = new Map();
  const subs = new Set();
  const changed = () => { for (const fn of subs) { try { fn(); } catch (e) { console.error(e); } } };
  return {
    apply(e) {
      let n = 0;
      for (const it of Array.isArray(e?.items) ? e.items : []) {
        if (!it || typeof it.id !== 'string') continue;
        const avatar = typeof it.avatar === 'string' && JPEG.test(it.avatar) ? it.avatar : null;
        const look = it.look && typeof it.look === 'object' && !Array.isArray(it.look) ? it.look : null;
        map.set(it.id, { avatar, look });
        n++;
      }
      if (n) changed();
    },
    get(id) { return map.get(id) ?? NONE; },
    drop(id) { if (map.delete(id)) changed(); },
    clear() { if (map.size) { map.clear(); changed(); } },
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
