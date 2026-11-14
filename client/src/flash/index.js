// 놀이터: 서버 방·코인·랭킹 없이 화면만. 플래시 게임을 Ruffle(셀프호스트, client/public/ruffle/)로 연다.
// Ruffle 은 게임을 처음 누를 때만 받는다(동적 로드).
import './flash.css';
import { FLASH_GAMES } from './games.js';
import { sound } from '../sound/core.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (label, cls, fn) => { const b = el('button', 'fl-btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
const OPTS = { publicPath: `${BASE}ruffle/`, autoplay: 'on', unmuteOverlay: 'hidden', splashScreen: false, letterbox: 'on', warnOnUnsupportedContent: false, contextMenu: 'off' };

let loading = null;
function loadRuffle() {
  if (window.RufflePlayer?.newest) return Promise.resolve(window.RufflePlayer);
  return (loading ??= new Promise((resolve, reject) => {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = { ...OPTS };
    const s = document.createElement('script');
    s.src = `${BASE}ruffle/ruffle.js`;
    s.onload = () => (window.RufflePlayer?.newest ? resolve(window.RufflePlayer) : reject(new Error('ruffle')));
    s.onerror = () => reject(new Error('ruffle'));
    document.head.append(s);
  }).catch((e) => { loading = null; throw e; }));
}

// keys 글자 -> 화면 버튼들. [표시, KeyboardEvent.key, code, keyCode]
const PADS = {
  방향키: [['▲', 'ArrowUp', 'ArrowUp', 38], ['◀', 'ArrowLeft', 'ArrowLeft', 37], ['▼', 'ArrowDown', 'ArrowDown', 40], ['▶', 'ArrowRight', 'ArrowRight', 39]],
  스페이스: [['스페이스', ' ', 'Space', 32]],
  엔터: [['엔터', 'Enter', 'Enter', 13]],
};

function fire(target, type, [, key, code, keyCode]) {
  target.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true }));
}

let root = null;

export function close() { root?.destroy(); }

// startId 가 있으면 목록을 건너뛰고 그 게임으로 바로 간다(로비 놀이터 카드)
export function open(startId) {
  if (root) return;
  const ov = el('div', 'fl-root');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', '놀이터');
  document.body.append(ov);
  let player = null, offMute = null, token = 0;
  const destroyPlayer = () => { token++; offMute?.(); offMute = null; player?.remove(); player = null; };
  root = { destroy() { destroyPlayer(); ov.remove(); root = null; } };

  function showList() {
    destroyPlayer();
    const top = el('div', 'fl-top');
    top.append(btn('로비로', 'fl-back', () => root.destroy()), el('b', 'fl-title', '놀이터'));
    const grid = el('div', 'fl-grid');
    for (const g of FLASH_GAMES) {
      const card = el('button', 'fl-card');
      card.type = 'button';
      card.dataset.flash = g.id;
      card.append(el('b', 'fl-card-name', g.name), el('span', 'fl-card-desc', g.desc),
        el('span', 'fl-card-meta', `${g.players > 1 ? `${g.players}명` : '혼자'} · ${g.keys}`));
      card.addEventListener('click', () => play(g));
      grid.append(card);
    }
    ov.replaceChildren(top, grid, el('p', 'fl-note', '플레이만 가능해요. 코인·랭킹에는 반영되지 않아요.'));
  }

  async function play(g) {
    destroyPlayer();
    const my = token;
    const top = el('div', 'fl-top');
    const stage = el('div', 'fl-stage');
    const status = el('p', 'fl-status', '불러오는 중…');
    stage.append(status);
    top.append(btn('나가기', 'fl-back', showList), el('b', 'fl-title', g.name), el('span', 'fl-help', g.keys));
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      top.append(btn('전체화면', 'fl-full', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (ov.requestFullscreen || ov.webkitRequestFullscreen).call(ov);
      }));
    }
    const parts = [top, stage];
    const pads = Object.keys(PADS).filter((k) => g.keys.includes(k));
    if (pads.length && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)) {
      const pad = el('div', 'fl-pad');
      for (const k of pads) {
        const grp = el('div', 'fl-pad-' + (k === '방향키' ? 'arrows' : 'one'));
        for (const def of PADS[k]) {
          const b = el('button', 'fl-key fl-key-' + def[2].toLowerCase(), def[0]);
          b.type = 'button';
          b.setAttribute('aria-label', def[0]);
          const down = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); if (player) { player.focus(); fire(player, 'keydown', def); } b.classList.add('fl-on'); };
          const up = (e) => { e.preventDefault(); if (player) fire(player, 'keyup', def); b.classList.remove('fl-on'); };
          b.addEventListener('pointerdown', down);
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('contextmenu', (e) => e.preventDefault());
          grp.append(b);
        }
        pad.append(grp);
      }
      parts.push(pad);
    }
    ov.replaceChildren(...parts);
    try {
      const R = await loadRuffle();
      if (my !== token) return;
      const p = R.newest().createPlayer();
      p.className = 'fl-player';
      stage.append(p);
      player = p;
      const vol = () => { try { p.volume = sound.isMuted() ? 0 : 1; } catch { /* 이 버전에 없으면 그대로 */ } };
      offMute = sound.onMute(vol);
      await p.load({ ...OPTS, url: `${BASE}flash/${g.file}` });
      if (my !== token) return;
      vol();
      status.remove();
      p.focus();
    } catch (e) {
      console.warn('flash load failed', e);
      if (my === token) status.textContent = '게임을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    }
  }

  const first = startId && FLASH_GAMES.find((g) => g.id === startId);
  if (first) play(first); else showList();
}
