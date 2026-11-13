// mountMini: 미니게임 화면(대기실·판·결과). 약속: docs/mini/PLAN.md. 본보기: yacht/index.js.
// 글자는 textContent 로만. 판 그림은 boards/index.js(renderBoard). 방이 없어지면(applyRoom(null)) 전부 치운다.
import './mini.css';
import { renderBoard } from './boards/index.js';
import { NAMES, GAME_IDS } from '../../../shared/mini/index.js';

const GLYPHS = ['👍', '😂', '😮', '😡', '😭', '🔥'];
// 선(seat 0)과 후(seat 1)의 이름·색
const SIDES = {
  gomoku: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  reversi: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  checkers: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  chess: [['백', '#f6f1e6'], ['흑', '#1d1b19']],
  connect4: [['빨강', '#c4463b'], ['노랑', '#e0b23c']],
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (cls, text, onclick) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onclick);
  return b;
};

export function mountMini({ ui, send }) {
  const root = el('div', 'mn-root');
  root.hidden = true;
  ui.append(root);

  // 위: 두 사람 / 가운데: 판 또는 대기실 / 아래: 안내 + 버튼
  const top = el('div', 'mn-top');
  const chips = [0, 1].map(() => {
    const c = el('div', 'mn-chip');
    const dot = el('span', 'mn-dot-c');
    const name = el('span', 'mn-chip-name');
    const sub = el('span', 'mn-chip-sub');
    const em = el('span', 'mn-chip-em');
    c.append(dot, name, sub, em);
    return { c, dot, name, sub, em, t: 0 };
  });
  top.append(chips[0].c, el('span', 'mn-vs', 'VS'), chips[1].c);

  const boardWrap = el('div', 'mn-boardwrap');
  const boardEl = el('div', 'mn-boardbox');
  boardWrap.append(boardEl);

  const wait = el('div', 'mn-wait');
  const waitTitle = el('h2', 'mn-wait-title');
  const gameRow = el('div', 'mn-gamerow');
  const gameBtns = GAME_IDS.map((g) => {
    const b = btn('mn-gbtn', NAMES[g], () => send({ t: 'mn', a: 'game', game: g }));
    b.dataset.mn = 'game-' + g;
    gameRow.append(b);
    return [g, b];
  });
  const waitNote = el('p', 'mn-wait-note');
  const startBtn = btn('mn-act mn-main', '시작', () => send({ t: 'mn', a: 'start' }));
  startBtn.dataset.mn = 'start';
  wait.append(waitTitle, gameRow, waitNote, startBtn);

  const bottom = el('div', 'mn-bottom');
  const status = el('div', 'mn-status');
  status.dataset.mn = 'status';
  const resignBtn = btn('mn-act', '기권', () => { if (confirm('기권할까요?')) send({ t: 'mn', a: 'resign' }); });
  resignBtn.dataset.mn = 'resign';
  const againBtn = btn('mn-act mn-main', '다시', () => send({ t: 'mn', a: 'again' }));
  againBtn.dataset.mn = 'again';
  bottom.append(status, resignBtn, againBtn);

  root.append(top, boardWrap, wait, bottom);

  let room = null;

  const sideOf = (game, seat) => SIDES[game]?.[seat] ?? ['', '#888'];
  const countOf = (board, v) => board.reduce((n, row) => n + row.filter((x) => x === v).length, 0);

  function resultText(r, rm) {
    if (r.winner === 'draw') return '무승부';
    const [col] = sideOf(rm.game, r.winner);
    const who = rm.names[r.winner] || col;
    const tail = r.reason === 'resign' ? ' (상대 기권)' : r.reason === 'leave' ? ' (상대가 나감)' : '';
    return `${who} (${col}) 승리${tail}`;
  }

  function render() {
    const rm = room;
    const lobby = rm.phase === 'lobby';
    const play = rm.phase === 'play';
    const end = rm.phase === 'end';
    const isHost = rm.hostId === rm.you;
    const gname = NAMES[rm.game] || rm.game;

    // 두 사람 줄
    top.hidden = lobby;
    for (let i = 0; i < 2; i++) {
      const [col, color] = sideOf(rm.game, i);
      const ch = chips[i];
      ch.dot.style.background = color;
      ch.name.textContent = rm.names[i] || '';
      let sub = col;
      if (rm.game === 'reversi' && rm.mn) sub += ` ${countOf(rm.mn.board, i)}`;
      if (rm.game === 'chess' && rm.mn?.check && play && rm.mn.turn === i) sub += ' · 체크!';
      if (i === rm.mySeat) sub += ' · 나';
      ch.sub.textContent = sub;
      ch.c.classList.toggle('mn-turn', play && rm.mn?.turn === i);
      ch.c.classList.toggle('mn-win', end && rm.result?.winner === i);
    }

    // 대기실
    wait.hidden = !lobby;
    boardWrap.hidden = lobby;
    if (lobby) {
      waitTitle.textContent = `미니게임 · ${gname}`;
      for (const [g, b] of gameBtns) {
        b.setAttribute('aria-pressed', String(g === rm.game));
        b.disabled = !isHost;
      }
      const ready = rm.players.filter((p) => p.connected).length;
      const names = rm.players.map((p) => p.name).join(', ');
      waitNote.textContent = `참가자 ${rm.players.length}명 (${names}). ` + (ready < 2 ? '2명이 모이면 시작할 수 있습니다.' : isHost ? '시작을 누르세요.' : '방장이 시작하기를 기다립니다.');
      startBtn.hidden = !isHost;
      startBtn.disabled = ready < 2;
    }

    // 판
    if (!lobby && rm.mn) {
      renderBoard(boardEl, rm.game, rm.mn, { mySeat: play && rm.mySeat >= 0 ? rm.mySeat : null, onMove: (move) => send({ t: 'mn', a: 'move', move }) });
    }

    // 아래 줄
    bottom.hidden = lobby;
    resignBtn.hidden = !(play && rm.mySeat >= 0);
    againBtn.hidden = !(end && isHost);
    if (play) {
      const t = rm.mn.turn;
      const [col] = sideOf(rm.game, t);
      let s;
      if (rm.waiting) s = `${rm.names[t] || col} 님이 연결을 기다리는 중`;
      else if (rm.mySeat < 0) s = `${rm.names[t] || col} (${col}) 차례 · 관전 중`;
      else s = t === rm.mySeat ? `내 차례 (${col})` : `${rm.names[t] || col} (${col}) 차례`;
      if (rm.game === 'chess' && rm.mn.check) s += ' · 체크!';
      status.textContent = s;
    } else if (end && rm.result) {
      status.textContent = resultText(rm.result, rm) + (isHost ? '' : ' · 방장이 다시 시작합니다');
    } else status.textContent = '';
    status.classList.toggle('mn-end', end);
  }

  function applyRoom(next) {
    if (!next || next.mode !== 'mini') {
      room = null;
      root.hidden = true;
      boardEl.textContent = '';
      boardEl._mn = null;
      return;
    }
    room = next;
    root.hidden = false;
    render();
  }

  function showEmote(id, i) {
    if (!room || !GLYPHS[i]) return;
    const seat = room.seats.indexOf(id);
    if (seat < 0) return;
    chips[seat].em.textContent = GLYPHS[i];
    chips[seat].t = 2;
  }

  function handleEvent(e) {
    if (e && e.k === 'emote') showEmote(e.id, e.e);
  }

  function frame(dt) {
    for (const c of chips) {
      if (c.t > 0) { c.t -= dt; if (c.t <= 0) c.em.textContent = ''; }
    }
  }

  function dispose() {
    applyRoom(null);
    root.remove();
  }

  return { applyRoom, handleEvent, frame, dispose, anchorOf: () => null };
}
