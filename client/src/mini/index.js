// 미니게임 화면 모듈(판). 결과는 공통 결과 화면(room/result.js)에 제목만 준다. 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/mini/PLAN.md, COMMON-CONTRACT 4-2.
// 대기실(참가자·종목 고르기·시작·나가기)·상단 줄(방 코드/소리/이모티콘/나가기)·머리 위 이모티콘·채팅 말풍선·소리 끄기·나가기 확인은 틀이 한다.
// 이 모듈은 게임 판만 그린다. 글자는 textContent 로만. 판 그림은 boards/index.js(renderBoard).
import './mini.css';
import { renderBoard } from './boards/index.js';
import { NAMES, GAMES } from '../../../shared/mini/index.js';
import { createBetPart } from './bet.js';
import { fromFen } from '../../../shared/mini/fen.js';
import { goalText, themeTags } from './puzzleThemes.js';

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
  bottom.append(status, resignBtn);

  // 체스 퍼즐(혼자 퀴즈 풀기, docs/mini/PLAN.md 6절): 위 줄 대신 안내 + 숫자 넷, 아래 줄에 힌트·정답 보기·다음 문제
  const pz = el('div', 'mn-pz');
  pz.hidden = true;
  const pzHead = el('div', 'mn-pz-head');
  const pzStats = el('div', 'mn-pz-stats');
  const pzStat = (k) => { const e = el('span', 'mn-pz-stat'); e.dataset.pz = k; pzStats.append(e); return e; };
  const pzRate = pzStat('rate'), pzLevel = pzStat('level'), pzStreak = pzStat('streak'), pzCoin = pzStat('coin');
  pz.append(pzHead, pzStats);
  const pzGoal = el('div', 'mn-pz-goal');
  pzGoal.dataset.pz = 'goal';
  const pzThemes = el('div', 'mn-pz-themes');
  pzThemes.dataset.pz = 'themes';
  const themesBtn = btn('mn-act mn-pz-small', '주제 보기', () => { showThemes = !showThemes; render(); });
  themesBtn.dataset.mn = 'themes';
  const pzNote = el('div', 'mn-pz-note');
  pzNote.dataset.pz = 'note';
  const retryBtn = btn('mn-act mn-pz-small', '다시 시도', () => { wrongShown = false; send({ t: 'mn', a: 'retry' }); render(); });
  retryBtn.dataset.mn = 'retry';
  pzNote.append(el('span', 'mn-pz-notetext', '그 수가 아니에요.'), retryBtn);
  pzNote.hidden = true;
  const pzLink = el('div', 'mn-pz-link');
  const pzId = el('span', '', '');
  pzId.dataset.pz = 'id';
  const pzA = el('a', 'mn-pz-a', '리체스에서 보기');
  pzA.target = '_blank';
  pzA.rel = 'noopener noreferrer';
  pzLink.append(pzId, pzA);
  pzLink.hidden = true;
  pz.append(pzGoal, themesBtn, pzThemes, pzNote, pzLink);
  const pzBtns = el('div', 'mn-pz-btns');
  const hintBtn = btn('mn-act', '힌트', () => send({ t: 'mn', a: 'hint' }));
  const revealBtn = btn('mn-act', '정답 보기', () => send({ t: 'mn', a: 'reveal' }));
  const nextBtn = btn('mn-act mn-pz-next', '다음 문제', () => { showThemes = false; flipped = false; wrongShown = false; send({ t: 'mn', a: 'next' }); });
  const flipBtn = btn('mn-act', '판 뒤집기', () => { flipped = !flipped; render(); });
  const navBtns = [['first', '⏮', '처음'], ['prev', '◀', '이전'], ['next', '▶', '다음'], ['last', '⏭', '끝']].map(([k, t, label]) => {
    const b = btn('mn-act mn-pz-nav', t, () => navGo(k));
    b.dataset.mn = `nav-${k}`;
    b.setAttribute('aria-label', label);
    return b;
  });
  const pzNav = el('div', 'mn-pz-btns');
  pzNav.append(...navBtns);
  pzNav.hidden = true;
  hintBtn.dataset.mn = 'hint'; revealBtn.dataset.mn = 'reveal'; nextBtn.dataset.mn = 'next'; flipBtn.dataset.mn = 'flip';
  pzBtns.append(hintBtn, revealBtn, nextBtn, flipBtn);
  pzBtns.hidden = true;
  bottom.append(pzNav, pzBtns);

  // 퍼즐: 정보는 판 옆 패널 하나에 모은다(판 크기는 글자 줄 수와 무관). 패널은 퍼즐일 때만 보인다.
  const pzPanel = el('div', 'mn-pz-panel');
  pzPanel.hidden = true;
  pzPanel.append(pz);
  root.append(top, pzPanel, boardWrap, bottom);

  let room = null;
  let botKey = null; // 봇 수를 구하는 중인 판 모습 (같은 판 모습으로는 한 번만)
  let alive = true;
  let showThemes = false, flipped = false, wrongShown = false, seenWrong = 0; // 퍼즐 화면 상태(문제마다 처음으로)

  // 봇전: 봇 차례이고 내가 이 방의 사람이면 내 기기에서 수를 구해 서버에 낸다 (계산은 bots/, 서버는 합법 수만 받는다)
  function askBot(rm) {
    const key = `${rm.game}|${rm.match?.round}|${JSON.stringify(rm.mn)}`;
    if (key === botKey) return;
    botKey = key;
    import('./bots/index.js')
      .then((m) => m.botMove(rm.game, rm.mn, rm.bot.level))
      .then((move) => { if (alive && botKey === key && move) send({ t: 'mn', a: 'bot', move }); })
      .catch(() => { if (botKey === key) botKey = null; });
  }

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
    const key = `${id}|${rm.names[i] || ''}|${f.avatar ?? ''}|${JSON.stringify(f.look ?? null)}|${color}`;
    if (key === ch.key) return;
    ch.key = key;
    ch.face.replaceChildren(id ? ctx.profile.playerAvatar({ id, name: rm.names[i] || '', face: f.avatar, look: f.look, color, size: 30 }) : '');
    ch.name.replaceChildren(ctx.profile.nameTag({ name: rm.names[i] || '', look: id ? f.look : null })); // 칭호 + 이름 (SPEC 22-21)
  }

  function render() {
    const rm = room;
    if (!rm) return;
    const play = rm.phase === 'play';
    const between = rm.phase === 'between';
    const end = rm.phase === 'end';
    const series = (rm.match?.len ?? 1) > 1;
    if (rm.puzzle) {
      resignBtn.hidden = true;
      renderPuzzle(rm);
      return;
    }
    stopNav(); nav = null;
    pz.hidden = true; pzBtns.hidden = true; pzNav.hidden = true; top.hidden = false; status.hidden = false;
    pzPanel.hidden = true; root.classList.remove('mn-puz');
    if (status.parentNode !== bottom) bottom.prepend(status);

    for (let i = 0; i < 2; i++) {
      const [col] = sideOf(rm.game, i);
      const ch = chips[i];
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

    const botTurn = play && rm.bot && rm.mySeat >= 0 && rm.turn === '~bot';
    if (botTurn) askBot(rm); else if (!play) botKey = null;

    resignBtn.hidden = !((play || between) && rm.mySeat >= 0);
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
      else if (botTurn) s = `${rm.names[t]} 생각 중…`;
      else s = t === rm.mySeat ? `내 차례 (${col})` : `${rm.names[t] || col} (${col}) 차례`;
      if (rm.game === 'chess' && rm.mn.check) s += ' · 체크!';
      if (rm.game === 'gomoku' && rm.mn.rule === 'renju') s += ' · 렌주룰';
      status.textContent = head + s;
    } else status.textContent = '';
  }

  // 끝난 문제: 서버가 준 전체 수순(line)으로 판을 앞뒤로 볼 수 있다 (이 기기에서만, 서버 상태는 그대로)
  let nav = null; // { key, states, i, timers }
  const stopNav = () => { if (nav) nav.timers.forEach(clearTimeout); if (nav) nav.timers = []; };
  const FILES = 'abcdefgh';
  const uci = (u) => ({ from: { x: FILES.indexOf(u[0]), y: 8 - Number(u[1]) }, to: { x: FILES.indexOf(u[2]), y: 8 - Number(u[3]) }, ...(u[4] ? { promo: u[4].toUpperCase() } : {}) });
  function buildNav(rm) {
    const ln = rm.puzzle.line;
    const key = JSON.stringify([ln.fen, ln.moves, ln.at, ln.solved]);
    if (nav?.key === key) return;
    stopNav();
    const states = [];
    let st = null;
    try { st = fromFen(ln.fen); } catch { st = null; }
    const upto = ln.solved ? ln.at : ln.moves.length; // 맞힌 문제는 마지막 수를 실제 판(rm.mn)으로 대신한다
    if (st) states.push(st);
    for (let k = 0; st && k < upto; k++) {
      st = GAMES.chess.apply(st, uci(ln.moves[k]));
      if (st) states.push(st);
    }
    if (ln.solved || !states.length) states.push(rm.mn);
    nav = { key, states, i: ln.solved ? states.length - 1 : Math.min(ln.at, states.length - 1), timers: [] };
    if (!ln.solved) { // 정답 보기: 남은 수순을 한 수씩 보여 준다
      for (let k = nav.i; k < states.length - 1; k++) {
        const me = nav;
        nav.timers.push(setTimeout(() => { if (alive && nav === me) { me.i = k + 1; render(); } }, 900 * (k - nav.i + 1)));
      }
    }
  }
  function navGo(k) {
    if (!nav) return;
    stopNav();
    const last = nav.states.length - 1;
    nav.i = k === 'first' ? 0 : k === 'last' ? last : Math.max(0, Math.min(last, nav.i + (k === 'next' ? 1 : -1)));
    render();
  }

  function renderPuzzle(rm) {
    const q = rm.puzzle;
    const play = q.status === 'play';
    pz.hidden = false;
    top.hidden = true;
    pzPanel.hidden = false; root.classList.add('mn-puz');
    if (status.parentNode !== pzPanel) pzPanel.append(status, pzNav, pzBtns);
    if (q.wrong < seenWrong) seenWrong = 0;
    if (q.wrong > seenWrong) { seenWrong = q.wrong; wrongShown = true; }
    if (!play) wrongShown = false;
    const col = q.seat === 0 ? '백' : '흑';
    const goal = goalText(q.themes, q.humanMoves);
    pzHead.textContent = play ? `${col} 차례${rm.mn.check ? ' (체크!)' : ''}` : q.status === 'solved' ? '정답이에요!' : '정답 수순을 보여 드려요';
    pzGoal.textContent = `목표: ${goal} · 내가 둘 수: ${q.humanMoves}수`;
    const tags = themeTags(q.themes);
    const seeThemes = showThemes || !play;
    themesBtn.hidden = !play;
    themesBtn.textContent = showThemes ? '주제 숨기기' : '주제 보기';
    pzThemes.textContent = seeThemes ? `주제: ${tags.length ? tags.join(' · ') : '따로 없음'}` : '';
    pzThemes.hidden = !pzThemes.textContent;
    pzNote.hidden = !(play && wrongShown);
    pzLink.hidden = play;
    if (!play) {
      pzId.textContent = `문제 #${q.id} · `;
      pzA.href = `https://lichess.org/training/${encodeURIComponent(q.id)}`;
    }
    const d = q.me.delta;
    pzRate.textContent = `내 레이팅 ${q.me.r ?? ''}${d ? ` (${d > 0 ? '+' : ''}${d})` : d === 0 && !play ? ' (변화 없음)' : ''}`;
    pzRate.classList.toggle('mn-pz-up', d > 0);
    pzRate.classList.toggle('mn-pz-down', d < 0);
    pzLevel.textContent = `문제 난이도 ${q.rating}`;
    pzStreak.textContent = `연속 정답 ${q.me.streak}`;
    pzCoin.textContent = `오늘 코인 ${q.coin.today ?? '…'}/${q.coin.cap}`;
    let st = rm.mn;
    if (!play && q.line) { buildNav(rm); st = nav.states[nav.i]; } else { stopNav(); nav = null; }
    const seat = flipped ? 1 - q.seat : q.seat;
    renderBoard(boardEl, 'chess', st, { mySeat: seat, onMove: play && rm.mySeat >= 0 ? (move) => { wrongShown = false; send({ t: 'mn', a: 'move', move }); } : null });
    // 힌트: 움직일 말이 선 칸을 표시 (판 그림 좌표: 여백 5, 칸 10)
    const h = play && q.hint;
    if (h) {
      const px = (v) => 5 + (seat === 1 ? 7 - v : v) * 10;
      boardEl.querySelector('svg')?.insertAdjacentHTML('beforeend', `<rect class="mn-pz-hint" x="${px(h.x)}" y="${px(h.y)}" width="10" height="10"/>`);
    }
    const mine = rm.mySeat >= 0;
    pzBtns.hidden = !mine;
    hintBtn.hidden = revealBtn.hidden = !play;
    nextBtn.hidden = play;
    pzNav.hidden = play || !nav;
    if (nav) {
      const last = nav.states.length - 1;
      navBtns[0].disabled = navBtns[1].disabled = nav.i <= 0;
      navBtns[2].disabled = navBtns[3].disabled = nav.i >= last;
    }
    let line = '';
    if (play) line = q.hint ? '힌트: 표시된 칸의 말을 움직이세요 (이 문제는 코인 없음)' : q.failed ? '이 문제는 실패로 기록됐어요. 계속 풀어 볼 수 있어요' : '';
    else if (q.status === 'solved') line = q.failed ? '풀었어요 (한 번 틀려서 코인 없음)' : q.hinted ? '풀었어요 (힌트를 써서 코인·레이팅 변화 없음)' : coinLine(q);
    else line = '코인 없음';
    status.textContent = line;
    status.hidden = !line;
  }
  function coinLine(q) {
    const c = q.coin;
    if (c.gain == null) return '정답이에요!';
    if (c.gain > 0) return `정답! 코인 +${c.gain}${c.bonus ? ` (5연속 보너스 +${c.bonus})` : ''}${c.capped ? ' · 오늘 상한에 도달' : ''}`;
    return c.capped ? '정답! 오늘 코인 다 받음 (레이팅은 올랐어요)' : '정답!';
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

    // 공통 결과 화면 제목: 매치 승자와 승수
    resultTitle(s) {
      if (!s.result) return null;
      return { title: resultText(s.result, s), sub: `${NAMES[s.game] ?? ''}${(s.match?.len ?? 1) > 1 ? ` · ${s.match.len}판 승부` : ''}` };
    },

    // 판 중 자리에 앉아 있으면 안내. 결과 화면은 틀이 확인 없이 나가게 한다
    leaveNote(s) {
      return !s?.puzzle && (s?.phase === 'play' || s?.phase === 'between') && s.mySeat >= 0 ? '나가면 기권 처리돼요' : null;
    },

    // 대기실 개인 칸: 코인 베팅
    waitPart(name) {
      return name === 'mn-bet' ? createBetPart({ send, me: ctx.me }) : null;
    },

    unmount() {
      offFaces();
      stopNav();
      alive = false;
      room = null;
      boardEl.textContent = '';
      boardEl._mn = null;
      root.remove();
    },
  };
}
