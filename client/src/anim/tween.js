export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

const active = new Set();

// Advanced by the stage render loop so every animation shares one clock.
export function tick(now) {
  for (const tw of active) {
    const p = (now - tw.t0 - tw.delay) / tw.dur;
    if (p < 0) continue;
    tw.update(tw.easing(Math.min(p, 1)));
    if (p >= 1) { active.delete(tw); tw.done(); }
  }
}

export function tween(dur, update, easing = ease.inOut, delay = 0) {
  const k = reducedMotion ? 0.15 : 1;
  return new Promise((done) => {
    active.add({ t0: performance.now(), dur: Math.max(dur * k, 1), delay: delay * k, update, easing, done });
  });
}

export const sleep = (ms) => tween(ms, () => {}, ease.linear);
