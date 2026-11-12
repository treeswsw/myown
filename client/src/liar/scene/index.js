// 라이어게임 3D 장면. 렌더러는 만들지 않는다(진행자가 stage.use(scene, camera)).
// CONTRACTS 1-1.
import * as THREE from 'three';
import { createTable } from './table.js';
import { createSeats } from './seats.js';
import { createCameraRig } from './camera.js';
import { createArrows } from './arrows.js';
import { createReveal } from './reveal.js';
import { createJudge } from './judge.js';

export function createLiarScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 40);
  const table = createTable(scene);
  const rig = createCameraRig(camera);
  const v = new THREE.Vector3();
  const project = (x, y, z) => {
    camera.updateMatrixWorld();
    v.set(x, y, z).project(camera);
    if (v.z >= 1) return null;
    const { w, h } = rig.size;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  };
  const seats = createSeats({ scene, project });
  const arrows = createArrows({
    parent: table.tableGroup,
    seatOf: (id) => { const e = seats.get(id); return e ? { edge: e.slot.edge, n: e.slot.n, k: e.seat } : null; },
    colorOf: (id) => seats.get(id)?.player.color,
  });
  const reveal = createReveal({ scene, spot: table.spot, hemi: table.hemi, seats });
  const judge = createJudge({ scene, seats });
  let you = null;
  let lastVotes = {};
  let disposed = false;

  const info = (id) => {
    const e = seats.get(id);
    return e ? { face: e.face, fwd: e.fwd, faceR: e.body.userData.faceR } : null;
  };
  seats.onChange((slots) => {
    table.setSlots(slots);
    const pts = seats.order.map((id) => { const e = seats.get(id); return new THREE.Vector3(e.slot.x, e.tagY, e.slot.z); });
    const hasMe = seats.order[0] === you && you != null;
    rig.setLayout(pts, hasMe, info);
    table.setCenterVisible(!rig.focusing);
    arrows.setVotes(lastVotes);   // 자리가 바뀌면 화살표를 다시 놓는다(달라진 것만 다시 그려짐)
    judge.refresh();
  });

  return {
    scene, camera,
    resize(w, h) { if (!disposed) rig.resize(w, h); },
    setPlayers(players, youId) {
      if (disposed) return;
      you = youId;
      seats.setPlayers(players, youId);
    },
    setFace(id, dataUrl) { if (!disposed) seats.setFace(id, dataUrl || null); },
    setView(view, cut = false) {
      if (disposed) return;
      rig.setView(view, cut);
      table.setCenterVisible(!rig.focusing);
      // 정체 공개: 없는 id 면 table 과 같게(조명도 그대로)
      if (rig.liar && view && view.mode === 'liar') reveal.look(view.id); else reveal.off();
    },
    setVotes(votes) {   // state.votes 그대로 {찍은 사람: 찍힌 사람}. {}·null 이면 전부 지움
      if (disposed) return;
      lastVotes = votes && typeof votes === 'object' ? votes : {};
      arrows.setVotes(lastVotes);
    },
    setJudge(picks) {   // {id: 'yes'|'no'} | null
      if (!disposed) judge.set(picks);
    },
    stats() {           // 시험용: 지금 장면에 켜져 있는 것
      return { arrows: arrows.count, beam: reveal.beamVisible, beamOn: reveal.active, judge: judge.count, yes: judge.yes, no: judge.no };
    },
    screenPos(id) { return disposed ? null : seats.screenPos(id); },
    seatPos(id) { return disposed ? null : seats.seatPos(id); },
    frame(dt) {
      if (disposed) return;
      rig.step(dt);
      arrows.step(dt);
      reveal.step(dt);
      judge.step(dt);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      arrows.dispose();
      reveal.dispose();
      judge.dispose();
      seats.dispose();
      table.dispose();
    },
  };
}
