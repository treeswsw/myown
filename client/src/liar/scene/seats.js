// 자리: 사람마다 마네킹 + 의자. 머리 = 프로필.
import * as THREE from 'three';
import { createMannequin, createChair, disposeMannequin, setMannequinProfile, makeInitialAvatar } from './mannequins.js';
import { seatOrder, seatSlots } from './layout.js';

// ctx: { scene, project(x, y, z) → {x, y} | null }
export function createSeats({ scene, project }) {
  const group = new THREE.Group();
  group.name = 'liar-seats';
  scene.add(group);
  const byId = new Map();   // id → { id, key, body, chair, slot, seat, face, tagY, fwd }
  const faces = new Map();  // id → dataURL
  let order = [];
  let slots = [];
  let onChange = () => {};
  const texLoads = new Map();

  function dropEntry(e) {
    group.remove(e.body, e.chair);
    e.chair.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    e.chair.traverse((o) => { if (o.isMesh && o.material) o.material.dispose?.(); });
    const map = e.body.userData.face?.material?.map;
    if (map && !map.userData.madeByMannequin) map.dispose();
    disposeMannequin(e.body);
  }

  function applyFace(e) {
    const url = faces.get(e.id);
    const player = e.player;
    if (url && typeof Image !== 'undefined') {
      const token = {};
      texLoads.set(e.id, token);
      const img = new Image();
      img.onload = () => {
        if (texLoads.get(e.id) !== token || byId.get(e.id) !== e) return;
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        const old = e.body.userData.face?.material?.map;
        setMannequinProfile(e.body, tex);
        if (old && !old.userData.madeByMannequin) old.dispose();
      };
      img.src = url;
    } else {
      texLoads.delete(e.id);
      setMannequinProfile(e.body, makeInitialAvatar(player.name, player.color));
    }
  }

  function place(e, slot) {
    e.slot = slot;
    e.body.position.set(slot.x, 0, slot.z);
    e.body.rotation.y = slot.yaw;
    e.chair.position.set(slot.x, 0, slot.z);
    e.chair.rotation.y = slot.yaw;
    const u = e.body.userData;
    const fwd = new THREE.Vector3(-slot.n.x, 0, -slot.n.z);
    e.fwd = fwd;
    e.face = new THREE.Vector3(slot.x, u.faceY, slot.z).addScaledVector(fwd, u.faceZ);
    e.tagY = u.tagY;
  }

  function setPlayers(players, you) {
    const list = Array.isArray(players) ? players : [];
    const ids = seatOrder(list, you);
    const shown = ids.slice(0, 8);
    const pl = new Map(list.map((p) => [p.id, p]));
    // 나간 사람(또는 관전자로 빠진 사람) 치우기
    for (const [id, e] of byId) {
      if (!shown.includes(id)) { dropEntry(e); byId.delete(id); texLoads.delete(id); }
    }
    const n = shown.length;
    slots = n >= 1 ? seatSlots(Math.max(n, 3)) : [];
    order = shown;
    shown.forEach((id, k) => {
      const p = pl.get(id);
      const key = [p.body, p.color, p.name].join('|');
      let e = byId.get(id);
      if (e && e.key !== key) { dropEntry(e); byId.delete(id); e = null; }
      if (!e) {
        const body = createMannequin(p.body, { color: p.color, name: p.name, profile: makeInitialAvatar(p.name, p.color) });
        const chair = createChair();
        group.add(chair, body);
        e = { id, key, body, chair, player: p };
        byId.set(id, e);
        if (faces.has(id)) applyFace(e);
      }
      e.player = p;
      e.seat = k;
      place(e, slots[k]);
    });
    onChange(slots, order);
  }

  function setFace(id, dataUrl) {
    if (dataUrl) faces.set(id, dataUrl); else faces.delete(id);
    const e = byId.get(id);
    if (e) applyFace(e);
  }

  function seatPos(id) {
    const e = byId.get(id);
    return e ? { x: e.slot.x, z: e.slot.z, yaw: e.slot.yaw } : null;
  }
  function screenPos(id) {
    const e = byId.get(id);
    return e ? project(e.slot.x, e.tagY, e.slot.z) : null;
  }

  function dispose() {
    for (const e of byId.values()) dropEntry(e);
    byId.clear(); faces.clear(); texLoads.clear();
    scene.remove(group);
  }
  return {
    setPlayers, setFace, seatPos, screenPos, dispose,
    get slots() { return slots; },
    get order() { return order; },
    get(id) { return byId.get(id) || null; },
    get count() { return byId.size; },
    onChange(fn) { onChange = fn; },
  };
}
