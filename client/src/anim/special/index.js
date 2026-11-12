// Special sequences: a suited mannequin grows out from under a player's profile photo and acts.
// Every pose is a pure function of the sequence time, so a sequence can be frozen or scrubbed.
import * as THREE from 'three';
import { DIM, REACH, REST, createKit, buildMannequin } from './mannequin.js';
import { buildPistol, buildRevolver, buildFlash, buildSmoke } from './props.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const easeIn = (x) => x * x * x;
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
// Damped ring-out after an impact at t0 (0 before it).
const ring = (t, t0, freq, decay) => (t < t0 ? 0 : Math.exp(-(t - t0) * decay) * Math.sin((t - t0) * freq));
const GUN_SCALE = 1.35; // slightly oversized so the gun reads from the game camera

export function createSpecialFX({ scene, camera, getSeat, shake: hostShake, sfx: hostSfx }) {
  // Sound and shake are cosmetic: a missing or throwing host hook must never block a gameplay callback.
  const sfx = (name) => { try { hostSfx?.(name); } catch { /* cosmetic */ } };
  const shake = (strength, ms) => { try { hostShake?.(strength, ms); } catch { /* cosmetic */ } };
  const kit = createKit();
  const active = new Set();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const basis = new THREE.Matrix4();
  const bx = v(0, 0, 0), by = v(0, 0, 0);

  function spawnActor(playerId) {
    const seat = getSeat(playerId);
    const head = seat.head.clone();
    const scale = clamp(seat.headRadius / 0.14, 0.85, 1.45);
    const fwd = seat.tableCenter.clone().sub(head).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();

    const neck = head.clone().addScaledVector(UP, -seat.headRadius * 0.9).addScaledVector(fwd, -0.02);
    const hipHeight = (neck.y + DIM.hipY * scale) / scale;          // hips above the floor, in body units
    const footY = (0.05 * scale - neck.y) / scale;
    const standing = hipHeight > (DIM.thigh + DIM.shin) * 0.9;
    const feet = hipHeight > 0.16
      ? [-1, 1].map((side) => v(side * (standing ? 0.11 : 0.2), footY, standing ? 0.04 : 0.3))
      : null;

    const rig = buildMannequin(kit, feet);
    rig.position.copy(neck);
    rig.rotation.y = Math.atan2(fwd.x, fwd.z);
    rig.scale.setScalar(scale);
    scene.add(rig);
    rig.updateMatrixWorld(true);

    const toLocal = (world) => rig.worldToLocal(world.clone());
    const origin = toLocal(neck);
    const dirToLocal = (worldDir) => toLocal(neck.clone().add(worldDir)).sub(origin).normalize();
    // Local y for a point `clearance` (in body units) above the felt, so hands and guns stay visible over the rail.
    const aboveFelt = (clearance) => (seat.feltY - neck.y) / scale + clearance;
    return { seat, rig, scale, head, neck, feet, toLocal, dirToLocal, aboveFelt, headLocal: toLocal(head), apply: rig.userData.apply };
  }

  const basePose = (t, T) => ({
    growY: easeBack(seg(t, 0, 0.42)) * (1 - easeIn(seg(t, T - 0.4, T - 0.04))),
    growX: easeOut(seg(t, 0.06, 0.42)) * (1 - easeIn(seg(t, T - 0.36, T - 0.04))),
    lean: Math.sin(t * 2.6) * 0.008, twist: 0, roll: 0, shrug: 0, stretch: 1,
    R: { pos: REST.R.clone(), pole: v(-0.6, 0, -1), curl: 0.32 },
    L: { pos: REST.L.clone(), pole: v(0.6, 0, -1), curl: 0.32 },
  });

  // Orients a gun (barrel +z) along `dir` with its grip hanging down, seated in the fist at `wrist`.
  function holdGun(gun, wrist, dir, show) {
    bx.crossVectors(UP, dir);
    if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0);
    bx.normalize();
    by.crossVectors(dir, bx);
    gun.quaternion.setFromRotationMatrix(basis.makeBasis(bx, by, dir));
    gun.position.copy(wrist).addScaledVector(dir, 0.075).addScaledVector(by, 0.05);
    gun.scale.setScalar(Math.max(show, 1e-3) * GUN_SCALE);
    gun.visible = show > 0.01;
  }

  function setFlash(flash, gun, k) {
    flash.visible = k > 0;
    if (!flash.visible) return;
    const s = Math.sin(Math.PI * k);
    flash.position.copy(gun.userData.muzzle).multiplyScalar(GUN_SCALE).applyQuaternion(gun.quaternion).add(gun.position);
    flash.quaternion.copy(gun.quaternion);
    flash.scale.setScalar(0.4 + s * 1.3);
  }

  // Eases the camera toward a point and back; applied as a delta so it composes with the host's own shake.
  function makeDolly(target, amount) {
    const applied = v(0, 0, 0), want = v(0, 0, 0);
    return (k) => {
      want.copy(target).sub(camera.position).add(applied).multiplyScalar(amount * k);
      camera.position.add(want).sub(applied);
      applied.copy(want);
    };
  }

  function allIn(playerId, { onPush } = {}) {
    const actor = spawnActor(playerId);
    const { seat, scale, toLocal, dirToLocal } = actor;
    const push = seat.tableCenter.clone().sub(seat.chips).setY(0);
    const travel = Math.min(0.42, push.length() * 0.6);
    push.normalize();
    const across = v(push.z, 0, -push.x);
    const contactAt = (sign, along) => toLocal(seat.chips.clone().setY(seat.feltY + 0.075 * scale)
      .addScaledVector(push, along - 0.06 * scale).addScaledVector(across, sign * 0.085 * scale));
    // Whichever contact point is on the figure's right belongs to the right hand.
    const order = contactAt(1, 0).x < contactAt(-1, 0).x ? [1, -1] : [-1, 1];
    const hands = ['R', 'L'].map((key, i) => ({
      key, side: i ? 1 : -1,
      wind: v((i ? 1 : -1) * 0.36, 0.1, -0.24),
      contact: contactAt(order[i], 0), end: contactAt(order[i], travel),
    }));
    const pushLocal = dirToLocal(push);
    const palmDir = UP.clone().multiplyScalar(0.8).addScaledVector(pushLocal, 0.6).normalize();
    const T = 2.5;

    return {
      T,
      events: [
        { at: 0, fn: () => sfx('whoosh') },
        { at: 1.0, fn: () => sfx('whoosh') },
        { at: 1.25, fn: () => { onPush?.(); sfx('thud'); shake(0.6, 260); } },
      ],
      frame(t) {
        const pose = basePose(t, T);
        const wind = easeInOut(seg(t, 0.42, 0.95));
        const strike = easeIn(seg(t, 1.0, 1.25));
        const shove = easeOut(seg(t, 1.25, 1.62));
        const back = easeInOut(seg(t, 1.95, 2.3));
        pose.lean += -0.2 * wind * (1 - strike) + 0.32 * strike * (1 - back) + ring(t, 1.25, 22, 8) * 0.06;
        pose.shrug = -0.035 * wind * (1 - strike);
        pose.stretch = 1 + 0.45 * strike * (1 - back);
        for (const h of hands) {
          const p = pose[h.key];
          p.pos.lerp(h.wind, wind).lerp(h.contact, strike).lerp(h.end, shove);
          p.pos.y += Math.sin(Math.PI * strike) * 0.12 + ring(t, 1.62, 40, 9) * 0.006;
          p.pos.lerp(REST[h.key], back);
          p.pole.lerp(v(h.side, -0.1, -0.5), wind).lerp(v(h.side * 0.7, 0.9, -0.3), strike).lerp(v(h.side * 0.6, 0, -1), back);
          if (wind > 0.05 && back < 0.95) {
            p.dir = UP.clone().lerp(palmDir, strike);
            p.normal = pushLocal;
          }
          p.curl = 0.32 - 0.24 * wind * (1 - back);
          p.spread = wind * (1 - back);
        }
        actor.apply(pose);
      },
      end() { scene.remove(actor.rig); },
    };
  }

  function bust(winnerId, loserId, { onHit } = {}) {
    const actor = spawnActor(winnerId);
    const loser = getSeat(loserId);
    const { rig, dirToLocal } = actor;
    const shoulder = v(-DIM.shoulderX, DIM.shoulderY, 0);
    const toLoser = dirToLocal(loser.head.clone().sub(rig.localToWorld(shoulder.clone())).normalize());
    const aimPos = shoulder.clone().addScaledVector(toLoser, REACH * 0.94);
    aimPos.y = Math.max(aimPos.y, actor.aboveFelt(0.2));
    const aim = dirToLocal(loser.head.clone().sub(rig.localToWorld(aimPos.clone())).normalize());
    const mouth = actor.headLocal.clone().add(v(-0.03, -actor.headLocal.y - 0.02, 0.19));
    const yaw = clamp(Math.atan2(aim.x, aim.z), -1.2, 1.2);
    const gun = buildPistol(kit), flash = buildFlash(kit), smoke = buildSmoke(kit);
    rig.add(gun, flash, smoke);
    const dolly = makeDolly(loser.head, 0.1);
    const T = 3.0, FIRE = 1.35;
    const dir = v(0, 0, 0);

    return {
      T,
      events: [
        { at: 0, fn: () => sfx('whoosh') },
        { at: FIRE, fn: () => { onHit?.(); sfx('shot'); shake(1, 300); } },
      ],
      frame(t) {
        const pose = basePose(t, T);
        const raise = easeBack(seg(t, 0.36, 0.92));
        const lower = easeInOut(seg(t, 1.72, 2.12));
        const back = easeInOut(seg(t, 2.42, 2.8));
        const recoil = t < FIRE ? 0 : Math.exp(-(t - FIRE) * 8);
        const p = pose.R;
        p.pos.lerp(aimPos, raise).lerp(mouth, lower).lerp(REST.R, back);
        p.pos.addScaledVector(UP, 0.1 * recoil + Math.sin(t * 5) * 0.004).addScaledVector(aim, -0.07 * recoil);
        dir.copy(aim).lerp(UP, clamp(lower + recoil * 0.35, 0, 1) * (1 - back)).normalize();
        p.dir = dir; p.normal = v(1, 0, 0); p.curl = 1.05;
        p.pole.set(-0.5, -0.8, -0.3);
        pose.L.pos.z += 0.05; pose.L.curl = 0.55;
        pose.stretch = 1.15;
        pose.twist = yaw * 0.45 * clamp(raise, 0, 1) * (1 - lower);
        pose.lean += -0.05 * clamp(raise, 0, 1) * (1 - back) - 0.08 * recoil;
        actor.apply(pose);
        holdGun(gun, p.pos, dir, easeOut(seg(t, 0.28, 0.5)) * (1 - easeIn(seg(t, 2.45, 2.75))));
        setFlash(flash, gun, t >= FIRE && t < FIRE + 0.11 ? (t - FIRE) / 0.11 : 0);
        smoke.position.copy(gun.userData.muzzle).multiplyScalar(GUN_SCALE).applyQuaternion(gun.quaternion).add(gun.position);
        smoke.userData.set(t - FIRE - 0.08, Math.max(0, t - 2.2) * 0.9);
        dolly(easeInOut(seg(t, 0.5, FIRE)) * (1 - easeInOut(seg(t, FIRE + 0.25, 2.3))));
      },
      end() { dolly(0); scene.remove(actor.rig); flash.userData.dispose(); smoke.userData.dispose(); },
    };
  }

  function revolver(playerId, { dead = false, shots, onResult } = {}) {
    const actor = spawnActor(playerId);
    const { rig, seat, scale } = actor;
    const chest = v(-0.09, actor.aboveFelt(0.2), 0.36);
    const chestDir = v(0.55, 0.55, 0.4).normalize();
    const temple = actor.headLocal.clone().add(v(-(seat.headRadius / scale + 0.2), -0.02, 0.03));
    const lap = v(-0.13, actor.aboveFelt(0.07), 0.42);   // sets the gun down on the table edge
    const flung = v(-0.62, -0.05, -0.12);
    const spinHand = chest.clone().addScaledVector(chestDir, 0.13).add(v(0.07, -0.01, 0.02));
    const gun = buildRevolver(kit), flash = buildFlash(kit);
    rig.add(gun, flash);
    const dolly = makeDolly(seat.head, 0.12);
    const T = 3.0, PULL = 2.0;
    const dir = v(0, 0, 0);

    return {
      T,
      events: [
        { at: 0, fn: () => sfx('whoosh') },
        { at: 0.5, fn: () => sfx('spin') },
        { at: PULL, fn: () => { onResult?.(dead, shots); sfx(dead ? 'shot' : 'click'); if (dead) shake(1, 320); } },
      ],
      frame(t) {
        const pose = basePose(t, T);
        const present = easeOut(seg(t, 0.2, 0.5));
        const raise = easeInOut(seg(t, 0.95, 1.5));
        const tense = seg(t, 1.45, PULL) * (t < PULL ? 1 : 0);
        const after = easeInOut(seg(t, PULL + 0.06, 2.5));
        const back = easeInOut(seg(t, 2.5, 2.85));
        const p = pose.R;
        p.pos.lerp(chest, present).lerp(temple, raise);
        dir.copy(chestDir).lerp(v(1, 0, 0), raise);
        p.pole.lerp(v(-1, 0.5, -0.2), raise);
        const amp = 0.003 + 0.008 * tense;
        if (tense > 0) p.pos.add(v(Math.sin(t * 61) * amp, Math.sin(t * 47) * amp, 0));
        pose.roll = 0.05 * tense;
        pose.shrug = -0.02 * tense;
        if (dead) {
          const limp = easeOut(seg(t, PULL, PULL + 0.25));
          p.pos.lerp(flung, limp);
          dir.lerp(v(-0.4, 0.8, 0.2), limp);
          pose.roll = 0.45 * easeInOut(seg(t, PULL + 0.02, 2.4));
          pose.lean -= 0.15 * limp;
          pose.L.pos.lerp(v(0.3, -0.66, -0.08), limp);
          pose.L.curl = 0.1;
        } else {
          p.pos.x += ring(t, PULL, 50, 14) * 0.02;
          p.pos.lerp(lap, after);
          dir.lerp(v(0.35, -0.12, 0.93), after);
          pose.lean += 0.3 * after * (1 - back);   // relieved slump
          pose.shrug = 0.03 * after * (1 - back);
        }
        p.pos.lerp(REST.R, back);
        dir.normalize();
        p.dir = dir; p.normal = v(1, 0, 0); p.curl = 1.05;
        // The left hand reaches in to flick the cylinder, then falls away.
        const reach = easeInOut(seg(t, 0.25, 0.5)) * (1 - easeInOut(seg(t, 0.7, 1.0)));
        pose.L.pos.lerp(spinHand, reach);
        pose.L.curl = 0.32 + 0.4 * reach;
        pose.stretch = 1.12;
        actor.apply(pose);
        holdGun(gun, p.pos, dir, easeOut(seg(t, 0.2, 0.42)) * (1 - easeIn(seg(t, 2.55, 2.82))));
        const spun = Math.max(0, t - 0.5);
        gun.userData.cylinder.rotation.z = (40 * (1 - Math.exp(-2.4 * spun))) / 2.4;
        setFlash(flash, gun, dead && t >= PULL && t < PULL + 0.11 ? (t - PULL) / 0.11 : 0);
        dolly(easeInOut(seg(t, 0.9, PULL)) * (1 - easeInOut(seg(t, PULL + 0.3, 2.7))));
      },
      end() { dolly(0); scene.remove(actor.rig); flash.userData.dispose(); },
    };
  }

  // Winner of a hand: rises from a hunched, hands-on-the-table pose to full height and throws both fists up.
  // The neck anchor itself lifts by `rise`; the host may lift the photo with it (onUp / onDown).
  function stand(playerId, { onUp, onDown } = {}) {
    const actor = spawnActor(playerId);
    const { rig, scale, neck, feet } = actor;
    const rise = 0.24 * scale;
    const feetY = feet ? feet.map((f) => f.y) : null;
    const press = (side) => v(side * 0.2, actor.aboveFelt(0.03), 0.34);
    const high = (side) => v(side * 0.47, 0.3, 0.02);
    const T = 2.6, UP_AT = 0.62, DOWN_AT = 2.02;

    return {
      T,
      events: [
        { at: 0, fn: () => sfx('whoosh') },
        { at: UP_AT, fn: () => { onUp?.(rise); sfx('thud'); } },
        { at: 1.02, fn: () => sfx('whoosh') },
        { at: DOWN_AT, fn: () => onDown?.() },
      ],
      frame(t) {
        const pose = basePose(t, T);
        const lean = easeOut(seg(t, 0.1, 0.5));
        const up = easeBack(seg(t, UP_AT, 1.0));
        const arms = easeBack(seg(t, 0.92, 1.3));
        const down = easeInOut(seg(t, DOWN_AT, 2.3));
        const lift = rise * clamp(up, 0, 1.15) * (1 - down);
        rig.position.y = neck.y + lift;
        if (feet) feet.forEach((f, i) => { f.y = feetY[i] - lift / scale; });
        const sway = Math.sin((t - 1.3) * 7) * 0.012 * seg(t, 1.3, 1.5) * (1 - down);
        pose.lean += 0.4 * lean * (1 - up) - 0.1 * clamp(arms, 0, 1) * (1 - down);
        pose.roll = sway;
        pose.shrug = 0.03 * lean * (1 - up) - 0.045 * clamp(arms, 0, 1) * (1 - down);
        pose.stretch = 1.12;
        for (const [key, side] of [['R', -1], ['L', 1]]) {
          const p = pose[key];
          p.pos.lerp(press(side), lean).lerp(high(side), arms);
          p.pos.y += sway * side * 1.5 + ring(t, 1.3, 26, 7) * 0.02;
          p.pos.lerp(REST[key], down);
          p.pole.lerp(v(side, -0.2, -0.6), lean).lerp(v(side, -0.5, -0.35), clamp(arms, 0, 1)).lerp(v(side * 0.6, 0, -1), down);
          if (down < 0.9) {
            p.dir = v(0, 0.25, 1).normalize().lerp(v(side * 0.25, 1, 0).normalize(), clamp(arms, 0, 1)).normalize();
            p.normal = arms > 0.3 ? v(0, 0, 1) : UP.clone().negate();
          }
          p.curl = 0.12 + (1.0 - 0.12) * clamp(arms, 0, 1) * (1 - down) + 0.2 * down;
          p.spread = lean * (1 - clamp(arms, 0, 1));
        }
        actor.apply(pose);
      },
      end() { scene.remove(actor.rig); },
    };
  }

  // prefers-reduced-motion: no figure, only the gameplay-relevant callback and sound.
  const minimal = (sound, callback) => ({
    T: 0.3, frame() {}, end() {},
    events: [{ at: 0.12, fn: () => { callback?.(); sfx(sound); } }],
  });

  // Fires due events; a throwing host callback is reported but does not stall the sequence or the frame loop.
  function fire(seq, upTo) {
    while (seq.fired < seq.events.length && seq.events[seq.fired].at <= upTo) {
      try { seq.events[seq.fired++].fn(); } catch (err) { console.error(err); }
    }
  }

  function finish(seq) {
    fire(seq, Infinity); // skipped or cut-short sequences still deliver their gameplay callbacks
    active.delete(seq);
    seq.end();
    seq.resolve();
  }

  function run(seq) {
    return new Promise((resolve) => {
      seq.t = 0; seq.fired = 0; seq.resolve = resolve;
      active.add(seq);
      // requestAnimationFrame stops in background tabs, so update() would never finish the sequence there.
      if (typeof document !== 'undefined' && document.hidden) finish(seq);
      else seq.frame(0);
    });
  }

  return {
    playAllIn: (id, opts = {}) => run(reduced ? minimal('thud', opts.onPush) : allIn(id, opts)),
    playBust: (winnerId, loserId, opts = {}) => run(reduced ? minimal('shot', opts.onHit) : bust(winnerId, loserId, opts)),
    playRevolver: (id, opts = {}) => run(reduced
      ? minimal(opts.dead ? 'shot' : 'click', () => opts.onResult?.(!!opts.dead, opts.shots))
      : revolver(id, opts)),
    playStand: (id, opts = {}) => run(reduced
      ? { T: 0.3, frame() {}, end() {}, events: [{ at: 0.05, fn: () => opts.onUp?.(0) }, { at: 0.25, fn: () => opts.onDown?.() }] }
      : stand(id, opts)),
    update(dt) {
      for (const seq of [...active]) {
        seq.t += dt;
        fire(seq, seq.t);
        if (seq.t >= seq.T) finish(seq);
        else seq.frame(seq.t);
      }
    },
    /** Ends every running sequence now (callbacks still fire, promises resolve). */
    skipAll() { [...active].forEach(finish); },
    dispose() {
      [...active].forEach(finish);
      kit.dispose();
    },
  };
}
