// 미니게임 효과음 표 — 소리 엔진·소리 끄기는 사이트 공용 sound/core.js 하나(끄면 아무것도 안 낸다). 파일 없이 합성.
import { tone, unlock } from '../sound/core.js';

const T = (type, f0, f1, dur, gain, at = 0) => tone({ type, f0, f1, dur, gain, at });

const SOUNDS = {
  place: (at) => { T('triangle', 620, 240, 0.07, 0.3, at); T('sine', 1500, 700, 0.025, 0.12, at); }, // 딱
  flip: (at) => T('triangle', 980, 620, 0.05, 0.14, at),
  capture: (at) => { T('triangle', 300, 110, 0.11, 0.32, at); T('sine', 900, 400, 0.04, 0.12, at + 0.02); },
  end: (at) => { T('sine', 660, 660, 0.28, 0.2, at); T('sine', 880, 880, 0.4, 0.2, at + 0.13); },
};

let armed = false;
// play('place'|'flip'|'capture'|'end', 늦출 초)
export function play(name, at = 0) {
  if (!armed) { armed = true; unlock(); }
  if (!SOUNDS[name]) return;
  try { SOUNDS[name](at); } catch { /* 소리 못 씀 */ }
}
