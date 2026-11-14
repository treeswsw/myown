// 포커 효과음 표. 소리 엔진·소리 끄기는 sound/core.js 하나(COMMON-CONTRACT 4-1).
import { tone, noise as burst, isMuted, setMuted } from './sound/core.js';

export const sfx = {
  card: () => burst({ dur: 0.07, f0: 2600, q: 0.8, gain: 0.35 }),
  chip: () => { tone({ f0: 2100, f1: 1500, dur: 0.05, type: 'triangle', gain: 0.18 }); burst({ dur: 0.05, f0: 4000, q: 2, gain: 0.2, at: 0.03 }); },
  turn: () => tone({ f0: 880, f1: 1175, dur: 0.12, gain: 0.15 }),
  thud: () => { tone({ f0: 120, f1: 40, dur: 0.35, gain: 0.5 }); burst({ dur: 0.2, type: 'lowpass', f0: 800, f1: 100, gain: 0.4 }); },
  click: () => { tone({ f0: 900, f1: 500, dur: 0.04, type: 'square', gain: 0.18 }); tone({ f0: 420, f1: 260, dur: 0.06, type: 'square', gain: 0.18, at: 0.05 }); burst({ dur: 0.04, type: 'highpass', f0: 3000, gain: 0.2 }); },
  shot: () => { burst({ dur: 0.45, type: 'lowpass', f0: 6000, f1: 200, gain: 0.9 }); tone({ f0: 110, f1: 35, dur: 0.4, gain: 0.7 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.35, type: 'triangle', gain: 0.22, at: i * 0.11 })),
};

export { isMuted, setMuted };
