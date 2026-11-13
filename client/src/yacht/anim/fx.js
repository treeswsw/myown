// 요트다이스 연출: 색종이(요트). 족보 큰 글자는 board.js 의 data-yt="combo" 가 그린다.
// 배치는 prng(seed) 로만 정한다(모든 기기가 같은 모습). 누를 수 없다. 줄인 연출에서는 색종이 없음.
import './fx.css';
import { prng } from '../../../../shared/yacht/sim.js';

const COLORS = ['#ffc62a', '#ff5d5d', '#4fb3ff', '#59d98e', '#ffffff', '#c48bff'];
const LIFE_MS = 2600;

export function createFx({ host } = {}) {
  let layer = null, timer = null;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (layer) { layer.remove(); layer = null; }
  }
  function confetti(seed = 0, count = 60) {
    clear();
    if (!host || reduced()) return;
    const r = prng(seed >>> 0);
    layer = document.createElement('div');
    layer.className = 'yt-fx-layer';
    layer.setAttribute('data-yt', 'confetti');
    for (let k = 0; k < count; k++) {
      const b = document.createElement('i');
      b.className = 'yt-fx-bit';
      b.style.left = (r() * 100).toFixed(1) + '%';
      b.style.background = COLORS[Math.floor(r() * COLORS.length)];
      b.style.setProperty('--dx', Math.round((r() * 2 - 1) * 700) + '%');
      b.style.setProperty('--rot', Math.round((r() * 2 - 1) * 900) + 'deg');
      b.style.animationDelay = (r() * 0.5).toFixed(2) + 's';
      b.style.animationDuration = (1.3 + r() * 0.8).toFixed(2) + 's';
      layer.appendChild(b);
    }
    host.appendChild(layer);
    timer = setTimeout(clear, LIFE_MS);
  }
  return { confetti, clear, dispose: clear };
}
