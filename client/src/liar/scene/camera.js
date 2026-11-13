// 카메라: 전체 보기(화면 비율에 맞춤) ↔ 발언자 정면 클로즈업. 시안 fitTablePose·speakPose·stepCamera 를 옮김.
import * as THREE from 'three';

// seatInfo(id) → { face: Vector3, fwd: Vector3, faceR } | null ; tagPoint(i) → Vector3 (i번째 자리 이름표 위치)
export function createCameraRig(camera) {
  const probe = camera.clone();
  const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const goal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const tablePose = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const tmp = new THREE.Vector3();
  let vw = 1280, vh = 720, k = 1;
  let view = { mode: 'table' };
  let cutNext = true;
  let tagPoints = [];   // 전체 보기 맞춤에 쓸 이름표 3D 위치(내 자리가 [0])
  let hasMe = true;
  let seatInfo = () => null;
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function apply() {
    camera.position.copy(cur.pos);
    camera.lookAt(cur.tgt);
    camera.updateMatrixWorld(true);
  }
  function cut() {
    cur.pos.copy(goal.pos); cur.tgt.copy(goal.tgt);
    cutNext = false;
    apply();
  }

  function fitTable() {
    const px = (min, base) => Math.max(min, base * k);
    const hudH = px(6, 16) + px(10, 12) * 1.45 + 4 * k + px(12, 21) * 1.45 + px(30, 70) * 1.08 + 2 * k + px(13, 21) * 1.35;
    const tagH = px(11, 14) * 2.3 + 6 + px(11, 13) * 1.65 + 5;
    const barH = px(54, 58) + px(6, 10) + 60;   // + 채팅 칸(48) 과 간격(12), 배율 없이
    const elev = 0.44, limitX = 0.84;
    const limitTop = 1 - 2 * (hudH + tagH + 6) / vh;
    const limitBottom = 1 - 2 * (vh - barH - 8) / vh;
    const place = (d, ty) => {
      tablePose.tgt.set(0, ty, -0.15);
      tablePose.pos.set(0, ty + d * Math.sin(elev), tablePose.tgt.z + d * Math.cos(elev));
      probe.position.copy(tablePose.pos);
      probe.lookAt(tablePose.tgt);
      probe.updateMatrixWorld(true);
    };
    if (!tagPoints.length) { place(5, 0.7); return; }
    for (let d = 3.2; d <= 12; d += 0.1) {
      let ty = 0.7, maxX = 0, top = -1, mine = 1;
      for (let i = 0; i < 60; i++) {
        place(d, ty);
        maxX = 0; top = -1; mine = 1;
        tagPoints.forEach((pt, idx) => {
          tmp.copy(pt).project(probe);
          maxX = Math.max(maxX, Math.abs(tmp.x));
          if (idx === 0 && hasMe) mine = tmp.y; else top = Math.max(top, tmp.y);
        });
        if (top <= limitTop) break;
        ty += 0.05;
      }
      if (maxX <= limitX && top <= limitTop && mine >= limitBottom) break;
    }
  }

  function speakPose(s, out) {
    const px = (min, base) => Math.max(min, base * k);
    const topPx = px(6, 16) + px(10, 12) * 1.45 + 4 * k + px(12, 21) * 1.45 + px(30, 70) * 1.08 + 2 * k
      + px(13, 21) * 1.35 * 2 + px(6, 18) + px(13, 24) * 1.45 + px(18, 40) * 1.3;
    const band = Math.max(vh - (px(54, 58) + px(6, 10) + 60) - topPx, 80);   // 60 = 채팅 칸 48 + 간격 12
    const facePx = band * 0.24;
    const centerPx = topPx + band * 0.36;   // 턱 밑 이름표 한 줄(약 40px) 자리를 위해 얼굴을 조금 올림
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = THREE.MathUtils.clamp((s.faceR * vh) / (2 * facePx * tanHalf), 0.8, 1.4);
    const lift = ((centerPx - vh / 2) / (vh / 2)) * d * tanHalf;
    out.pos.copy(s.face).addScaledVector(s.fwd, d);
    out.pos.y = s.face.y - 0.2 * d;
    out.tgt.set(s.face.x, s.face.y + lift, s.face.z);
  }

  // 정체 공개 구도(시안 revealPose): 한 사람의 정면. 얼굴은 화면 아래쪽 2/3 지점, 그 위는 큰 글씨 자리. wide = 조금 물러난 시작 구도
  function revealPose(s, out, wide = false) {
    const facePx = vh * 0.105, centerPx = vh * 0.64;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = THREE.MathUtils.clamp((s.faceR * vh) / (2 * facePx * tanHalf), 0.9, 1.5) * (wide ? 1.28 : 1);
    const lift = ((centerPx - vh / 2) / (vh / 2)) * d * tanHalf;
    out.pos.copy(s.face).addScaledVector(s.fwd, d);
    out.pos.y = s.face.y - 0.16 * d;
    out.tgt.set(s.face.x, s.face.y + lift, s.face.z);
  }

  const isClose = (m) => m === 'liar' || m === 'spot';   // 정체 공개 구도 (spot = 같은 구도 + 하얀 조명)
  function aim() {
    const s = view.mode === 'focus' || isClose(view.mode) ? seatInfo(view.id) : null;
    if (s && isClose(view.mode)) revealPose(s, goal);
    else if (s) speakPose(s, goal);
    else { goal.pos.copy(tablePose.pos); goal.tgt.copy(tablePose.tgt); }
  }

  return {
    resize(w, h) {
      vw = Math.max(w, 1); vh = Math.max(h, 1);
      k = Math.min(vw / 1280, vh / 720);
      camera.aspect = probe.aspect = vw / vh;
      camera.updateProjectionMatrix();
      probe.updateProjectionMatrix();
      fitTable(); aim(); cut();
    },
    setLayout(points, me, info) {   // 자리가 바뀔 때
      tagPoints = points; hasMe = me; seatInfo = info;
      fitTable(); aim();
      if (cutNext) cut();
    },
    setView(v, doCut = false) {
      const was = view;
      view = v && (v.mode === 'focus' || isClose(v.mode)) ? { mode: v.mode, id: v.id } : { mode: 'table' };
      aim();
      if (doCut) cut();
      else if (isClose(view.mode) && !isClose(was.mode) && !reduce() && seatInfo(view.id)) {
        revealPose(seatInfo(view.id), cur, true);   // 조금 물러난 구도에서 천천히 밀고 들어간다
        cutNext = false;
        apply();
      }
    },
    refresh() { aim(); },
    step(dt) {
      if (cutNext || reduce()) return cut();
      const a = 1 - Math.exp(-dt * 4.2);
      cur.pos.lerp(goal.pos, a); cur.tgt.lerp(goal.tgt, a);
      apply();
    },
    get size() { return { w: vw, h: vh }; },
    get view() { return view; },
    get focusing() { return (view.mode === 'focus' || isClose(view.mode)) && !!seatInfo(view.id); },
    get liar() { return isClose(view.mode) && !!seatInfo(view.id); },
    get spot() { return view.mode === 'spot' && !!seatInfo(view.id); },
  };
}
