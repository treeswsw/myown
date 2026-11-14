// 혼자 놀기 효과음 이름표 (docs/solo/PLAN.md 6-1) — 소리 엔진·소리 끄기는 사이트 공용 sound/core.js 하나(끄면 아무것도 안 낸다). 파일 없이 합성.
// 종목 판은 이름만 부른다: sfx('merge', 단계). 이름: count go move pop merge drop warn over best
import { tone, noise, unlock } from '../sound/core.js';

const T = (type, f0, f1, dur, gain, at = 0) => tone({ type, f0, f1, dur, gain, at });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const NAMES = ['count', 'go', 'move', 'pop', 'merge', 'drop', 'warn', 'over', 'best'];

// n = 세기(pop: 한 번에 지운 개수, merge: 만든 단계). 없으면 0.
const SOUNDS = {
  count: (n, at) => T('sine', 620, 620, 0.12, 0.2, at),
  go: (n, at) => { T('sine', 740, 740, 0.1, 0.2, at); T('sine', 1110, 1110, 0.24, 0.22, at + 0.1); },
  move: (n, at) => T('triangle', 430, 300, 0.05, 0.1, at),
  pop: (n, at) => { // 톡: 많이 지울수록 높게
    const f = 520 + clamp(n, 0, 12) * 55;
    T('sine', f, f * 1.5, 0.07, 0.24, at);
    T('triangle', f * 2, f * 2.6, 0.03, 0.08, at);
  },
  merge: (n, at) => { // 합쳐짐: 단계가 높을수록 낮고 굵게
    const f = clamp(560 - n * 38, 140, 560);
    T('triangle', f, f * 0.72, 0.16, 0.3, at);
    T('sine', f * 2, f * 1.6, 0.08, 0.1, at + 0.01);
  },
  drop: (n, at) => { T('sine', 230, 120, 0.1, 0.24, at); noise({ dur: 0.04, f0: 900, q: 0.8, gain: 0.08, at }); },
  warn: (n, at) => { T('triangle', 880, 880, 0.08, 0.2, at); T('triangle', 880, 880, 0.08, 0.2, at + 0.13); },
  over: (n, at) => { T('sine', 520, 380, 0.22, 0.22, at); T('sine', 390, 260, 0.36, 0.22, at + 0.18); },
  best: (n, at) => { [660, 830, 990, 1320].forEach((f, i) => T('sine', f, f, 0.2, 0.2, at + i * 0.1)); },
};

let armed = false;
// play(name, 세기, 늦출 초)
export function play(name, n = 0, at = 0) {
  if (!armed) { armed = true; unlock(); }
  const fn = SOUNDS[name];
  if (!fn) return;
  try { fn(Number.isFinite(n) ? n : 0, at); } catch { /* 소리 못 씀 */ }
}
