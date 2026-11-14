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
  const fv = new THREE.Vector3();
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
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
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
      // 정체 공개: 없는 id 면 table 과 같게(조명도 그대로). liar = 빨강, spot = 하양(빨강에서 이어서 바뀜)
      if (rig.liar && view && (view.mode === 'liar' || view.mode === 'spot')) reveal.look(view.id, view.mode === 'spot' ? 'white' : 'red');
      else reveal.off();
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
      return { arrows: arrows.count, beam: reveal.beamVisible, beamOn: reveal.active, light: reveal.hue, lightHex: reveal.lightHex, judge: judge.count, yes: judge.yes, no: judge.no };
    },
    screenPos(id) { return disposed ? null : seats.screenPos(id); },
    // 화면 점(CSS px) → 사람 id | null. 마네킹을 직접 맞히거나, 빗나가면 머리 중심 48px 안의 가장 가까운 사람
    pick(x, y) {
      if (disposed || !seats.count) return null;
      const { w, h } = rig.size;
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let best = null, bestD = Infinity;
      for (const id of seats.order) {
        const e = seats.get(id);
        if (!e) continue;
        const hit = ray.intersectObject(e.body, true)[0];
        if (hit && hit.distance < bestD) { best = id; bestD = hit.distance; }
      }
      if (best) return best;
      let near = null, nearD = 48;
      for (const id of seats.order) {
        const e = seats.get(id);
        const p = e && project(e.face.x, e.face.y, e.face.z);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= nearD) { near = id; nearD = d; }
      }
      return near;
    },
    // 이름표 자리. 클로즈업(focus·liar·spot)된 사람이면 턱 바로 밑(below:true), 아니면 screenPos 와 같다
    tagPos(id) {
      if (disposed) return null;
      const e = seats.get(id);
      const view = rig.view;
      if (e && rig.focusing && view.id === id) {   // focus·liar·spot 모두 얼굴 아래
        const p = project(e.face.x, e.face.y - e.body.userData.faceR * 1.3, e.face.z);
        if (p) return { x: p.x, y: p.y, below: true };
      }
      return seats.screenPos(id);
    },
    // 얼굴 판의 화면 자리와 반지름(CSS px). 화면이 이 위에 프로필 판때기를 겹쳐 붙인다(SPEC 22-21).
    // 뒤통수가 보이거나(얼굴이 카메라 반대쪽) 카메라 뒤·화면 밖 깊이면 null
    facePos(id) {
      if (disposed) return null;
      const e = seats.get(id);
      if (!e || e.body.visible === false) return null;
      camera.updateMatrixWorld();
      fv.setFromMatrixPosition(camera.matrixWorld).sub(e.face);
      const dist = fv.length();
      if (!(dist > 0) || fv.dot(e.fwd) / dist < 0.2) return null;
      const c = project(e.face.x, e.face.y, e.face.z);
      if (!c) return null;
      const r = e.body.userData.faceR;
      fv.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(r).add(e.face);
      const t = project(fv.x, fv.y, fv.z);
      if (!t) return null;
      return { x: c.x, y: c.y, r: Math.hypot(t.x - c.x, t.y - c.y) };
    },
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
