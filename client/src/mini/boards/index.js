// 미니게임 보드판 그리기 (SVG). renderBoard(el, game, state, { mySeat, onMove })
// 같은 el 에 다시 부르면 다시 그린다. mySeat === state.turn 일 때만 눌러서 onMove(move).
// 이전 상태와 마지막 수가 달라졌을 때만 효과·소리를 낸다(처음 그릴 때는 없음).
import { GAMES } from '../../../../shared/mini/index.js';
import { play } from '../sfx.js';
import './boards.css';
import * as gomoku from './gomoku.js';
import * as reversi from './reversi.js';
import * as checkers from './checkers.js';
import * as chess from './chess.js';
import * as connect4 from './connect4.js';

const MODS = { gomoku, reversi, checkers, chess, connect4 };
const NS = 'http://www.w3.org/2000/svg';
const rg = (id, a, b, c) =>
  `<radialGradient id="mn-g-${id}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
const lg = (id, dir, stops, extra = '') =>
  `<linearGradient id="mn-g-${id}" ${dir}${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`;
const DIAG = 'x1="0" y1="0" x2="1" y2="1"', DOWN = 'x1="0" y1="0" x2="0" y2="1"';
const PIECE = 'x1="24" y1="0" x2="78" y2="0"'; // 체스 말(100×100 좌표) 왼쪽 빛 → 오른쪽 그늘
// 정의는 판마다 한 번. 필터는 쓰지 않는다(그라디언트·무늬만).
const DEFS = '<defs>' +
  rg('b', '#77716a', '#2a2725', '#0b0a09') + rg('w', '#ffffff', '#f1ebdf', '#b5ac99') +
  rg('r', '#f08a7c', '#cc4338', '#8a2620') + rg('y', '#fbe38f', '#e6b534', '#a57a18') +
  lg('wood', DIAG, [[0, '#9a6d45'], [.5, '#774f2e'], [1, '#573821']]) +
  lg('bevel', DOWN, [[0, '#fff', .38], [.5, '#fff', 0], [1, '#000', .4]]) +
  lg('gloss', DIAG, [[0, '#fff', .17], [.45, '#fff', 0], [1, '#000', .12]]) +
  lg('kaya', DIAG, [[0, '#f6dc9c', .55], [.5, '#e9c47c', .1], [1, '#b98343', .3]]) +
  lg('c4', DOWN, [[0, '#5b8cc0'], [.5, '#3c6796'], [1, '#294a70']]) +
  lg('c4rim', DOWN, [[0, '#000', .55], [.5, '#000', .1], [1, '#fff', .4]]) +
  lg('pw', PIECE, [[0, '#ffffff'], [.5, '#f4ecdb'], [1, '#c4b28e']], ' gradientUnits="userSpaceOnUse"') +
  lg('pb', PIECE, [[0, '#8d8078'], [.4, '#3d3531'], [1, '#141110']], ' gradientUnits="userSpaceOnUse"') +
  '<radialGradient id="mn-g-sh"><stop offset=".55" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="mn-g-hl"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="mn-g-felt" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#6fb38a" stop-opacity=".4"/><stop offset="1" stop-color="#0d3a25" stop-opacity=".4"/></radialGradient>' +
  '<radialGradient id="mn-g-hole" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="#22364a"/><stop offset="1" stop-color="#0c1620"/></radialGradient>' +
  '<pattern id="mn-p-grain" width="60" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-2)" fill="none" stroke="#3a2208">' +
  '<path d="M0 2Q15 .7 30 2T60 2" stroke-width=".45" opacity=".16"/><path d="M0 5.6Q15 6.8 30 5.6T60 5.6" stroke-width=".3" opacity=".22"/>' +
  '<path d="M0 9Q15 8 30 9.3T60 9" stroke-width=".6" opacity=".1"/><path d="M0 11.2Q20 10.6 40 11.4T60 11.2" stroke-width=".2" opacity=".2"/></pattern>' +
  '<pattern id="mn-p-felt" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><circle cx=".4" cy=".4" r=".24" fill="#fff" opacity=".07"/><circle cx="1.2" cy="1.2" r=".24" fill="#000" opacity=".11"/></pattern>' +
  '<pattern id="mn-p-marble" width="40" height="40" patternUnits="userSpaceOnUse" fill="none" stroke-linejoin="round">' +
  '<path d="M0 8Q8 13 15 10T28 16T40 8M22 0Q17 10 23 20T22 40" stroke="#48525e" stroke-width=".22" opacity=".2"/>' +
  '<path d="M0 30Q10 25 20 31T40 30M6 0Q11 12 5 22T6 40M34 0Q30 13 35 25T34 40" stroke="#fff" stroke-width=".3" opacity=".22"/></pattern>' +
  '</defs>';

const count = (board) => board.reduce((n, row) => n + row.filter((v) => v != null).length, 0);

export function renderBoard(el, game, state, { mySeat = null, onMove = null } = {}) {
  const mod = MODS[game];
  if (!el || !mod) return;
  let s = el._mn;
  if (!s || s.game !== game || !el.contains(s.svg)) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mn-board mn-' + game);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    s = el._mn = { game, svg, ui: {}, state: null, lastKey: '' };
    svg.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-x],[data-promo],[data-cancel]');
      if (!t || !s.ctx || !s.ctx.can) return;
      const move = MODS[s.game].tap(t.dataset, s.ctx);
      paint(s, null);
      if (move && s.onMove) s.onMove(move);
    });
    el.textContent = '';
    el.appendChild(svg);
  }
  if (!state) { try { state = GAMES[game].init(); } catch { return; } }
  if (state !== s.state) s.ui = {}; // 새 상태가 오면 고른 말·승진 창은 지운다
  const key = JSON.stringify(state.last || null);
  const prev = s.state && state.last && key !== s.lastKey ? s.state : null;
  s.state = state; s.lastKey = key; s.mySeat = mySeat; s.onMove = onMove;
  paint(s, prev);
  if (!prev) return;
  const board = game === 'checkers' || game === 'chess';
  // 소리는 알·말이 내려앉는 순간에 맞춘다(boards.css 의 효과 길이와 짝).
  play(board && count(state.board) < count(prev.board) ? 'capture' : 'place', game === 'connect4' ? 0.29 : board ? 0.26 : 0.16);
  if (game === 'reversi' && state.last.flips && state.last.flips.length) play('flip', 0.3);
  if (state.winner != null && prev.winner == null) play('end', 0.4);
}

function paint(s, prev) {
  const { state, mySeat } = s;
  const can = mySeat != null && mySeat === state.turn && state.winner == null && !!s.onMove;
  let moves = [];
  if (can) { try { moves = GAMES[s.game].legalMoves(state) || []; } catch { moves = []; } }
  s.ctx = { state, prev, can, moves, ui: s.ui, mySeat, flip: mySeat === 1 };
  const v = MODS[s.game].view(s.ctx);
  s.svg.setAttribute('viewBox', `0 0 ${v.w} ${v.h}`);
  s.svg.classList.toggle('mn-can', can);
  s.svg.innerHTML = DEFS + v.html;
}
