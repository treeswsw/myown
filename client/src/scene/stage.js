import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildRoom } from './room.js';
import { tick, tween, ease, reducedMotion } from '../anim/tween.js';

const BASE_POS = new THREE.Vector3(-1.75, 3.25, 3.45);
const BASE_LOOK = new THREE.Vector3(0.02, 0.62, -0.02);

const isWeak = () => matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4;

export function createStage(canvas) {
  const weak = isWeak();
  // ?nogl=1: headless UI tests. No WebGL renderer/composer and no render calls; scene, camera, loop and projection still work.
  const nogl = new URLSearchParams(location.search).has('nogl');
  const renderer = nogl ? null : new THREE.WebGLRenderer({ canvas, antialias: true });
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070605);
  scene.fog = new THREE.Fog(0x070605, 9, 20);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
  const room = buildRoom(scene, renderer, weak ? 1024 : 2048);

  let pixelRatio = Math.min(devicePixelRatio || 1, weak ? 1.5 : 2);
  let composer = null;
  const makeComposer = () => {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.5, 1.0));
    composer.addPass(new OutputPass());
  };
  if (!weak && renderer) makeComposer();

  const size = { w: 1, h: 1 };
  function resize() {
    size.w = innerWidth; size.h = innerHeight;
    renderer?.setPixelRatio(pixelRatio);
    renderer?.setSize(size.w, size.h, false);
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    composer?.setPixelRatio(pixelRatio);
    composer?.setSize(size.w, size.h);
    const aspect = size.w / size.h;
    camera.aspect = aspect;
    // Keep the table fully visible on screens narrower than the 16:9 the mockups were framed for.
    camera.fov = aspect < 16 / 9 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) * (16 / 9) / aspect)) : 36;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  /* camera shake and a slow push-in toward a world point (the special-fx module nudges the camera on its own) */
  const fx = { shake: 0, push: 0, target: new THREE.Vector3() };
  const applyCamera = () => {
    const look = BASE_LOOK.clone();
    camera.position.copy(BASE_POS);
    if (fx.push > 0) {
      camera.position.lerp(fx.target, fx.push * 0.3);
      look.lerp(fx.target, fx.push * 0.8);
    }
    if (fx.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake));
    camera.lookAt(look);
    camera.updateMatrixWorld();
  };
  const shake = (amp = 0.04, dur = 350) => {
    if (reducedMotion) return;
    tween(dur, (p) => { fx.shake = amp * (1 - p); }, ease.linear);
  };

  const pushIn = (target, k, dur) => {
    if (target) fx.target.copy(target);
    const from = fx.push;
    return tween(dur, (p) => { fx.push = from + (k - from) * p; }, ease.inOut);
  };

  const project = (v) => {
    const p = v.clone().project(camera);
    return [(p.x + 1) / 2 * size.w, (1 - p.y) / 2 * size.h];
  };

  /* loop */
  const subs = new Set();
  let last = performance.now();
  let frames = 0;
  let acc = 0;
  let windowStart = last;
  let lowPower = false;
  const forceFull = new URLSearchParams(location.search).get('fx') === 'full';
  // Judge speed per 3s of wall time (a frame count would take minutes on a very slow device).
  // >50ms average: drop to reduced mode (no body sequences, no bloom, 1x pixels, no shadows).
  // >36ms: just bloom off.
  function adapt(now, dt) {
    frames++; acc += dt;
    if (now - windowStart < 3000) return;
    const avg = acc / frames;
    frames = 0; acc = 0; windowStart = now;
    if (now < 6000 || forceFull) return;
    if (avg > 50 && !lowPower) {
      lowPower = true;
      composer = null;
      pixelRatio = 1;
      if (renderer) renderer.shadowMap.enabled = false;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      resize();
    } else if (avg > 36 && composer) composer = null;
  }
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(now - last, 1000); // one slow frame must still advance animations by real time
    last = now;
    tick(now);
    applyCamera();
    subs.forEach((f) => f(dt));
    if (composer) composer.render(); else renderer?.render(scene, camera);
    adapt(now, dt);
  };
  requestAnimationFrame(loop);

  return {
    scene, camera, size, project, shake, pushIn,
    isLowPower: () => lowPower,
    ready: room.ready,
    setMode: room.setMode,
    onFrame: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}
