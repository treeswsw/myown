import { h } from './dom.js';

// openAvatarCrop(file) -> Promise<string|null>: 160x160 JPEG data URL (data URL <= 60KB) or null if cancelled/failed.
const V = 220; // viewport px
const OUT = 160;
const MAX_LEN = 60 * 1024; // server limit on the data URL string length

function encode(canvas) {
  for (let q = 0.9; q >= 0.3; q -= 0.1) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_LEN) return url;
  }
  return null;
}

export async function openAvatarCrop(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return null; }
  const base = Math.max(V / bmp.width, V / bmp.height);
  let zoom = 1, cx = bmp.width / 2, cy = bmp.height / 2; // cx,cy: image point at viewport center

  const overlay = h('div', 'lb-crop-overlay crop-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '프로필 사진 자르기');
  const view = h('canvas', 'lb-crop-view');
  view.width = view.height = V;
  view.tabIndex = 0;
  view.setAttribute('aria-label', '사진 위치 조절. 화살표 키로 이동, +/- 키로 확대');
  const slider = h('input', 'lb-crop-zoom');
  slider.type = 'range'; slider.min = '1'; slider.max = '4'; slider.step = '0.01'; slider.value = '1';
  slider.setAttribute('aria-label', '확대');
  const ok = h('button', 'lb-ok', '확인');
  const cancel = h('button', null, '취소');
  ok.type = cancel.type = 'button';
  const hint = h('p', 'lb-crop-hint', '끌어서 옮기고, 슬라이더로 확대합니다');
  overlay.append(h('div', 'lb-crop-box',
    h('div', 'lb-crop-bar', cancel, h('b', null, '사진 자르기'), ok),
    h('div', 'lb-crop-body', view, h('div', 'lb-crop-side', slider, hint))));

  const ctx = view.getContext('2d');
  function draw() {
    const s = base * zoom, half = V / 2 / s;
    cx = Math.min(bmp.width - half, Math.max(half, cx));
    cy = Math.min(bmp.height - half, Math.max(half, cy));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, V, V);
    ctx.drawImage(bmp, cx - half, cy - half, half * 2, half * 2, 0, 0, V, V);
  }
  function setZoom(z) {
    zoom = Math.min(4, Math.max(1, z));
    slider.value = String(zoom);
    draw();
  }

  const pts = new Map();
  let pinch = 0;
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, e);
    pinch = 0;
  });
  view.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, e);
    const s = base * zoom * view.clientWidth / V;
    if (pts.size === 1) {
      cx -= (e.clientX - prev.clientX) / s;
      cy -= (e.clientY - prev.clientY) / s;
      draw();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) setZoom(zoom * d / pinch);
      pinch = d;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
  slider.addEventListener('input', () => setZoom(parseFloat(slider.value)));
  view.addEventListener('keydown', (e) => {
    const step = 10 / (base * zoom);
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) { cx += k[0]; cy += k[1]; draw(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.1);
    else if (e.key === '-') setZoom(zoom / 1.1);
  });

  const prevFocus = document.activeElement;
  document.body.append(overlay);
  draw();

  return new Promise((resolve) => {
    const finish = (val) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      bmp.close?.();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
      else if (e.key === 'Enter' && e.target === view) submit();
    };
    function result() {
      const out = document.createElement('canvas');
      out.width = out.height = OUT;
      const o = out.getContext('2d');
      o.fillStyle = '#fff';
      o.fillRect(0, 0, OUT, OUT);
      o.drawImage(view, 0, 0, OUT, OUT);
      return encode(out);
    }
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => finish(null));
    function submit() {
      const url = result();
      if (url) finish(url);
      else hint.textContent = '사진이 너무 큽니다. 다른 사진을 골라 주세요.';
    }
    ok.addEventListener('click', submit);
  });
}
