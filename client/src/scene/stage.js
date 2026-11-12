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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

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
  if (!weak) makeComposer();

  const size = { w: 1, h: 1 };
  function resize() {
    size.w = innerWidth; size.h = innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.w, size.h, false);
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

  /* camera shake (the special-fx module nudges the camera itself for push-ins) */
  const fx = { shake: 0 };
  const applyCamera = () => {
    camera.position.copy(BASE_POS);
    if (fx.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake));
    camera.lookAt(BASE_LOOK);
    camera.updateMatrixWorld();
  };
  const shake = (amp = 0.04, dur = 350) => {
    if (reducedMotion) return;
    tween(dur, (p) => { fx.shake = amp * (1 - p); }, ease.linear);
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
  let stage;
  // Degrade once if the first seconds run slower than ~30fps: bloom first, then resolution and shadows.
  let degraded = 0;
  function adapt(dt) {
    frames++; acc += dt;
    if (frames < 90 || degraded >= 2) return;
    if (acc / frames > 36) {
      degraded++;
      if (degraded === 1 && composer) composer = null;
      else { pixelRatio = 1; renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); resize(); }
    }
    frames = 0; acc = 0;
  }
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    tick(now);
    applyCamera();
    subs.forEach((f) => f(dt));
    if (composer) composer.render(); else renderer.render(scene, camera);
    adapt(dt);
  };
  requestAnimationFrame(loop);

  stage = {
    scene, camera, size, project, shake,
    ready: room.ready,
    setMode: room.setMode,
    onFrame: (f) => { subs.add(f); return () => subs.delete(f); },
  };
  return stage;
}
