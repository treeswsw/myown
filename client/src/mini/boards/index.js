// 미니게임 보드판 그리기 (SVG). renderBoard(el, game, state, { mySeat, onMove })
// 같은 el 에 다시 부르면 다시 그린다. mySeat === state.turn 일 때만 눌러서 onMove(move).
// 이전 상태와 마지막 수가 달라졌을 때만 효과·소리를 낸다(처음 그릴 때는 없음).
import { GAMES } from '../../../../shared/mini/index.js';
import { play } from '../sfx.js';
import * as gomoku from './gomoku.js';
import * as reversi from './reversi.js';
import * as checkers from './checkers.js';
import * as chess from './chess.js';
import * as connect4 from './connect4.js';

const MODS = { gomoku, reversi, checkers, chess, connect4 };
const NS = 'http://www.w3.org/2000/svg';
const rg = (id, a, b, c) =>
  `<radialGradient id="mn-g-${id}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
const DEFS = '<defs>' +
  rg('b', '#6b665f', '#262321', '#0d0c0b') + rg('w', '#ffffff', '#ece6d9', '#b9b1a0') +
  rg('r', '#e9776a', '#c4463b', '#8f2d26') + rg('y', '#f6da7e', '#e0b23c', '#a87f1f') +
  '<linearGradient id="mn-g-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6240"/><stop offset=".5" stop-color="#74502f"/><stop offset="1" stop-color="#5e3f25"/></linearGradient>' +
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
  play(board && count(state.board) < count(prev.board) ? 'capture' : 'place', game === 'connect4' ? 0.2 : 0);
  if (game === 'reversi' && state.last.flips && state.last.flips.length) play('flip', 0.16);
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
