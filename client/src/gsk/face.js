// 갱스껄 — 프로필 겉모습(SPEC 22-21). 공용 playerAvatar/nameTag 만 쓴다(여기서 따로 그리지 않는다).
// 겉모습은 "누구인가"만 나타낸다. 원판 종류·손 구성과 무관하며, 해골 판때기는 이미 해골 그림이 보이는 곳에만 붙인다.
//   gskLook(look)                        -> 갱스껄에서 쓰는 겉모습(모자 제외. 2026-11-14 사용자 결정). 모든 갱스껄 화면이 이 한 규칙.
//   lookKey(look)                        -> 바뀜 감지용 글자
//   skullFace(host, {id,name,face,look}) -> 해골 원판 속 사진 자리 위에 공용 프사를 판때기처럼 겹친다(치장이 없으면 아무것도 안 붙임)
import { playerAvatar } from '../ui/kit/avatar.js';

const HOLE_D = 0.7; // 테두리 링까지 원판 안에 들어오게 조금 작게(2026-11-14)
const ROUND = 'circle(50% at 50% 50%)'; // iPad Safari 에서 둥근 잘림이 풀리는 일 막기 // 해골 원판 가운데 사진 구멍 지름 / 원판 너비 (img/meta.json skullHole r≈0.4, 중심 0.5·0.5)
const SLOTS = ['face', 'acc', 'frame'];

export function gskLook(look) {
  if (!look || typeof look !== 'object') return null;
  const { hat, ...rest } = look;
  if (hat != null && rest.pos && typeof rest.pos === 'object') {
    const { [hat]: _drop, ...pos } = rest.pos;
    if (Object.keys(pos).length) rest.pos = pos; else delete rest.pos;
  }
  return rest;
}

export function lookKey(look) {
  if (!look) return '';
  try { return JSON.stringify(look); } catch (e) { return ''; }
}

export function skullFace(host, who) {
  if (!host) return;
  const old = host.querySelector(':scope > .gk-pf-ov');
  if (old) { if (old._ro) old._ro.disconnect(); old.remove(); }
  const look = who && who.look;
  if (!look || !SLOTS.some((s) => look[s])) return; // 사진만이면 합성 그림 그대로
  const ov = document.createElement('span');
  ov.className = 'gk-pf-ov';
  host.append(ov);
  let last = 0;
  const fit = () => {
    const w = host.offsetWidth || 0;
    if (!(w > 0) || w === last) return;
    last = w;
    const box = playerAvatar({ id: who.id, name: who.name || '', face: who.face || null, look, size: Math.round(w * HOLE_D) });
    // 사진이 없으면 그림 해골이 그대로 보이고 치장만 얹힌다
    const pic = box.querySelector('.ui-av');
    if (pic) { pic.style.clipPath = ROUND; pic.style.webkitClipPath = ROUND; }
    for (const c of box.querySelectorAll('.lk-cover')) { c.style.clipPath = ROUND; c.style.webkitClipPath = ROUND; }
    if (!who.face && pic) pic.style.opacity = '0';
    ov.replaceChildren(box);
  };
  fit();
  if (typeof ResizeObserver === 'function') {
    ov._ro = new ResizeObserver(fit);
    ov._ro.observe(host);
  } else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fit);
}
