// 미니게임 화면 모듈(판·결과). 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/mini/PLAN.md, COMMON-CONTRACT 4-2.
// 대기실(참가자·종목 고르기·시작·나가기)·상단 줄(방 코드/소리/이모티콘/나가기)·머리 위 이모티콘·채팅 말풍선·소리 끄기·나가기 확인은 틀이 한다.
// 이 모듈은 게임 판만 그린다. 글자는 textContent 로만. 판 그림은 boards/index.js(renderBoard).
import './mini.css';
import { renderBoard } from './boards/index.js';
import { NAMES } from '../../../shared/mini/index.js';
import { createBetPart } from './bet.js';

// 선(seat 0)과 후(seat 1)의 이름·색
const SIDES = {
  gomoku: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  reversi: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  checkers: [['흑', '#1d1b19'], ['백', '#f6f1e6']],
  chess: [['백', '#f6f1e6'], ['흑', '#1d1b19']],
  connect4: [['빨강', '#c4463b'], ['노랑', '#e0b23c']],
};
const NONE = { avatar: null, look: null };

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

export function mount(ctx) {
  const { send } = ctx;
  const root = el('div', 'mn-root');
  ctx.root.append(root);

  // 위: 두 사람 / 가운데: 판 / 아래: 안내 + 버튼
  const top = el('div', 'mn-top');
  const chips = [0, 1].map(() => {
    const c = el('div', 'mn-chip');
    const face = el('span', 'mn-chip-face');
    const name = el('span', 'mn-chip-name');
    const sub = el('span', 'mn-chip-sub');
    c.append(face, name, sub);
    return { c, face, name, sub, key: '' };
  });
  top.append(chips[0].c, el('span', 'mn-vs', 'VS'), chips[1].c);

  const boardWrap = el('div', 'mn-boardwrap');
  const boardEl = el('div', 'mn-boardbox');
  boardWrap.append(boardEl);

  const bottom = el('div', 'mn-bottom');
  const status = el('div', 'mn-status');
  status.dataset.mn = 'status';
  const resignBtn = btn('mn-act', '기권', async () => {
    const ok = await ctx.confirm({ title: '기권할까요?', text: '기권하면 상대가 이겨요.', ok: '기권', danger: true });
    if (ok) send({ t: 'mn', a: 'resign' });
  });
  resignBtn.dataset.mn = 'resign';
  const waitBtn = btn('mn-act mn-main', '대기실로', () => ctx.toWait());
  waitBtn.dataset.mn = 'to-wait';
  bottom.append(status, resignBtn, waitBtn);

  root.append(top, boardWrap, bottom);

  let room = null;

  const sideOf = (game, seat) => SIDES[game]?.[seat] ?? ['', '#888'];
  const countOf = (board, v) => board.reduce((n, row) => n + row.filter((x) => x === v).length, 0);

  function resultText(r, rm) {
    if (r.winner === 'draw') return '무승부';
    const [col] = sideOf(rm.game, r.winner);
    const who = rm.names[r.winner] || col;
    const tail = r.reason === 'resign' ? ' (상대 기권)' : r.reason === 'leave' ? ' (상대가 나감)' : '';
    const sc = rm.match?.len > 1 ? ` ${rm.match.score[r.winner]}:${rm.match.score[1 - r.winner]}` : '';
    return `${who} (${col}) 승리${sc}${tail}`;
  }

  // 사진·꾸미기는 공용 프로필 부품 하나. 바뀌었을 때만 다시 그린다.
  function paintFace(i, rm) {
    const ch = chips[i];
    const id = rm.seats[i];
    const f = (id && ctx.faces.get(id)) || NONE;
    const color = sideOf(rm.game, i)[1];
    const key = `${id}|${f.avatar ?? ''}|${JSON.stringify(f.look ?? null)}|${color}`;
    if (key === ch.key) return;
    ch.key = key;
    ch.face.replaceChildren(id ? ctx.profile.playerAvatar({ id, name: rm.names[i] || '', face: f.avatar, look: f.look, color, size: 30 }) : '');
  }

  function render() {
    const rm = room;
    if (!rm) return;
    const play = rm.phase === 'play';
    const between = rm.phase === 'between';
    const end = rm.phase === 'end';
    const series = (rm.match?.len ?? 1) > 1;

    for (let i = 0; i < 2; i++) {
      const [col] = sideOf(rm.game, i);
      const ch = chips[i];
      ch.name.textContent = rm.names[i] || '';
      let sub = col;
      if (rm.game === 'reversi' && rm.mn) sub += ` ${countOf(rm.mn.board, i)}`;
      if (rm.game === 'chess' && rm.mn?.check && play && rm.mn.turn === i) sub += ' · 체크!';
      if (series && rm.match) sub += ` · ${rm.match.score[i]}승`;
      if (i === rm.mySeat) sub += ' · 나';
      ch.sub.textContent = sub;
      ch.c.classList.toggle('mn-turn', play && rm.mn?.turn === i);
      ch.c.classList.toggle('mn-win', end && rm.result?.winner === i);
      paintFace(i, rm);
    }

    if (!rm.mn) {
      boardEl.textContent = '';
      boardEl._mn = null;
    } else {
      renderBoard(boardEl, rm.game, rm.mn, { mySeat: play && rm.mySeat >= 0 ? rm.mySeat : null, onMove: (move) => send({ t: 'mn', a: 'move', move }) });
    }

    resignBtn.hidden = !((play || between) && rm.mySeat >= 0);
    waitBtn.hidden = !end;
    const head = series && rm.match && (play || between) ? `${rm.match.round - (between ? 1 : 0)}/${rm.match.len}판 · ` : '';
    if (between) {
      const w = rm.match?.last?.winner;
      const who = w === 'draw' || w == null ? '무승부' : `${rm.names[w] || sideOf(rm.game, w)[0]} 승`;
      status.textContent = `${head}${who} · 다음 판이 곧 시작돼요`;
    } else if (play) {
      const t = rm.mn.turn;
      const [col] = sideOf(rm.game, t);
      let s;
      if (rm.waiting) s = `${rm.names[t] || col} 님이 연결을 기다리는 중`;
      else if (rm.mySeat < 0) s = `${rm.names[t] || col} (${col}) 차례 · 관전 중`;
      else s = t === rm.mySeat ? `내 차례 (${col})` : `${rm.names[t] || col} (${col}) 차례`;
      if (rm.game === 'chess' && rm.mn.check) s += ' · 체크!';
      if (rm.game === 'gomoku' && rm.mn.rule === 'renju') s += ' · 렌주룰';
      status.textContent = head + s;
    } else if (end && rm.result) {
      status.textContent = `${NAMES[rm.game] ?? ''} · ${resultText(rm.result, rm)}`;
    } else status.textContent = '';
    status.classList.toggle('mn-end', end);
  }

  const offFaces = ctx.faces.onChange(() => render());

  return {
    room(next) {
      room = next;
      render();
    },

    event() {},

    // 말풍선·머리 위 이모티콘 자리: 자리에 앉은 사람은 위쪽 줄의 사진 아래, 관전자는 위쪽 가운데
    anchorOf(id) {
      const seat = room ? room.seats.indexOf(id) : -1;
      const r = (seat >= 0 ? chips[seat].face : top).getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { x: r.left + r.width / 2, y: r.bottom + 6 };
    },

    // 판 중 자리에 앉아 있으면 안내. 결과 화면은 틀이 확인 없이 나가게 한다
    leaveNote(s) {
      return (s?.phase === 'play' || s?.phase === 'between') && s.mySeat >= 0 ? '나가면 기권 처리돼요' : null;
    },

    // 대기실 개인 칸: 코인 베팅
    waitPart(name) {
      return name === 'mn-bet' ? createBetPart({ send, me: ctx.me }) : null;
    },

    unmount() {
      offFaces();
      room = null;
      boardEl.textContent = '';
      boardEl._mn = null;
      root.remove();
    },
  };
}
