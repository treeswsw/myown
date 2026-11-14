// 라이어게임 효과음 표. 파일 없이 WebAudio 로 만든다. 어떤 소리를 언제 틀지는 index.js 가 정한다.
// 소리 엔진(AudioContext·master 음량·사이트 소리 끄기·iPad 잠금 해제)은 공용 sound/core.js 것을 쓰고, 이 파일은 소리 표와 합성만 갖는다.
// 모듈을 불러올 때는 window 를 만지지 않는다.

export const SOUND_NAMES = ['phase', 'myTurn', 'turn', 'vote', 'accused', 'judge', 'executed', 'spared',
  'tick', 'tickBig', 'liar', 'guessOk', 'guessNo', 'win', 'champion'];

const MASTER = 0.5; // 이 게임 소리의 음량(공용 master 앞에 곱한다)

// 음 하나: [시작초, 길이초, 시작Hz, 끝Hz, 파형, 음량]. 낮고 어두운 톤 위주.
// 'noise' 는 [시작초, 길이초, 필터Hz, 0, 'noise', 음량].
const n = (t, d, f0, f1, type, g) => [t, d, f0, f1 ?? f0, type, g];
const SOUNDS = {
  phase: [n(0, 0.5, 110, 82, 'sine', 0.5), n(0, 0.5, 165, 123, 'triangle', 0.18)],
  myTurn: [n(0, 0.18, 262, 262, 'triangle', 0.35), n(0.14, 0.36, 392, 392, 'triangle', 0.35)],
  turn: [n(0, 0.14, 196, 196, 'triangle', 0.25)],
  vote: [n(0, 0.09, 150, 90, 'square', 0.12), n(0, 0.12, 80, 60, 'sine', 0.4)],
  accused: [n(0, 0.7, 98, 92, 'sawtooth', 0.12), n(0, 0.8, 49, 46, 'sine', 0.5), n(0.28, 0.5, 104, 98, 'sawtooth', 0.1)],
  judge: [n(0, 0.12, 73, 73, 'sine', 0.5), n(0.3, 0.12, 73, 73, 'sine', 0.5), n(0.6, 0.12, 73, 73, 'sine', 0.5)],
  executed: [n(0, 1.2, 130, 38, 'sawtooth', 0.2), n(0, 1.3, 65, 30, 'sine', 0.5), n(0, 0.4, 900, 0, 'noise', 0.18)],
  spared: [n(0, 0.4, 220, 220, 'sine', 0.3), n(0.25, 0.8, 330, 330, 'sine', 0.3), n(0.25, 0.8, 262, 262, 'triangle', 0.15)],
  tick: [n(0, 0.05, 1400, 700, 'square', 0.08)],
  tickBig: [n(0, 0.09, 600, 150, 'square', 0.14), n(0, 0.12, 90, 60, 'sine', 0.35)],
  liar: [n(0, 1.2, 55, 55, 'sine', 0.55), n(0, 1.2, 58, 58, 'sawtooth', 0.1), n(0.5, 0.7, 117, 110, 'triangle', 0.2)],
  guessOk: [n(0, 0.15, 262, 262, 'triangle', 0.3), n(0.12, 0.15, 330, 330, 'triangle', 0.3), n(0.24, 0.5, 392, 392, 'triangle', 0.3)],
  guessNo: [n(0, 0.25, 185, 175, 'sawtooth', 0.14), n(0.2, 0.5, 139, 120, 'sawtooth', 0.14)],
  win: [n(0, 0.2, 196, 196, 'triangle', 0.3), n(0.18, 0.2, 247, 247, 'triangle', 0.3), n(0.36, 0.2, 294, 294, 'triangle', 0.3), n(0.54, 0.8, 392, 392, 'triangle', 0.32)],
  champion: [n(0, 0.2, 262, 262, 'triangle', 0.3), n(0.18, 0.2, 330, 330, 'triangle', 0.3), n(0.36, 0.2, 392, 392, 'triangle', 0.3),
    n(0.54, 0.25, 523, 523, 'triangle', 0.3), n(0.8, 0.7, 659, 659, 'triangle', 0.3), n(0.8, 0.7, 392, 392, 'sine', 0.2)],
};

// sound = sound/core.js (context/output/isMuted). 꺼져 있으면(사이트 소리 끄기) 소리를 만들지 않는다.
export function createAudio(sound) {
  let disposed = false;
  let noiseBuf = null;
  let noiseCtx = null;

  function noise(ctx) {
    if (!noiseBuf || noiseCtx !== ctx) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      noiseCtx = ctx;
      const d = noiseBuf.getChannelData(0);
      // 소리용 잡음. 게임 난수가 아니므로 고정 씨앗 xorshift(Math.random 금지 규칙)
      let x = 0x9e3779b9;
      for (let i = 0; i < len; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 0x80000000) - 1; }
    }
    return noiseBuf;
  }

  function play(name) {
    if (disposed || !sound || sound.isMuted()) return;
    const notes = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
    if (!notes) return;
    try {
      const ctx = sound.context();
      const master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(sound.output());
      const t0 = ctx.currentTime;
      for (const [st, dur, f0, f1, type, vol] of notes) {
        const g = ctx.createGain();
        const a = t0 + st;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(vol, a + Math.min(0.02, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, a + dur);
        g.connect(master);
        let src;
        if (type === 'noise') {
          src = ctx.createBufferSource();
          src.buffer = noise(ctx);
          src.loop = true;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = f0;
          src.connect(lp);
          lp.connect(g);
        } else {
          src = ctx.createOscillator();
          src.type = type;
          src.frequency.setValueAtTime(f0, a);
          if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, a + dur);
          src.connect(g);
        }
        src.start(a);
        src.stop(a + dur + 0.02);
      }
    } catch { /* 소리는 없어도 게임은 계속된다 */ }
  }

  function dispose() { disposed = true; noiseBuf = null; noiseCtx = null; } // AudioContext 는 사이트 것이라 닫지 않는다

  return { play, dispose };
}
