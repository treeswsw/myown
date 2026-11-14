// 혼자 놀기 화면 틀 (docs/solo/PLAN.md 1·5·6절, COMMON-CONTRACT 4-2). 공용 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다.
// 대기실·상단 줄·채팅·이모티콘·결과 화면은 틀이 한다. 여기서는: 점수 칸(점수·최고·남은 시간·그만하기), 카운트다운, 판 자리,
// 입력 조각 보내기(flow.js), 구경 화면, 결과 칸(순위·오늘 코인). 종목 이름 분기는 없다 — 종목 판은 games.js 표로 불러온다.
// 글자는 textContent 로만.
import './solo.css';
import { SOLO, NAMES } from '../../../shared/solo/index.js';
import { BOARDS } from './games.js';
import { createFlow, countOf, mmss, fmtScore, resultTitleOf, coinLineOf } from './flow.js';
import { createRankPanel } from './rank.js';
import * as sfx from './sfx.js';

const NONE = { avatar: null, look: null };
const GO_MS = 800; // "시작!" 글자가 떠 있는 시간

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function mount(ctx) {
  const { send, clock } = ctx;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 화면 뼈대: 왼쪽 점수 칸 + 가운데 쟁반(판 자리) ----------
  const root = el('div', 'so-root');
  root.hidden = true;
  const side = el('aside', 'so-side');
  const who = el('div', 'so-who');
  const whoFace = el('span', 'so-who-face');
  const whoName = el('span', 'so-who-name');
  who.append(whoFace, whoName);
  const gameName = el('div', 'so-game');
  const scoreLabel = el('div', 'so-label', '점수');
  const scoreEl = el('div', 'so-score', '0');
  scoreEl.dataset.so = 'score';
  const bestEl = el('div', 'so-best');
  bestEl.dataset.so = 'best';
  const timeBox = el('div', 'so-time');
  const timeLabel = el('div', 'so-label', '남은 시간');
  const timeEl = el('div', 'so-clock');
  timeEl.dataset.so = 'time';
  const timeBar = el('div', 'so-bar');
  const timeFill = el('i', 'so-bar-fill');
  timeBar.append(timeFill);
  timeBox.append(timeLabel, timeEl, timeBar);
  const quitBtn = el('button', 'so-quit', '그만하기');
  quitBtn.type = 'button';
  quitBtn.dataset.so = 'quit';
  quitBtn.addEventListener('click', async () => {
    if (!flow || ended || room?.phase !== 'play') return;
    const ok = await ctx.confirm({ title: '그만할까요?', text: '지금 점수로 끝나요.', ok: '그만하기', danger: true });
    if (ok && flow && !ended && room?.phase === 'play') endRun('quit');
  });
  side.append(who, gameName, scoreLabel, scoreEl, bestEl, timeBox, quitBtn);

  const stage = el('div', 'so-stage');
  const tray = el('div', 'so-tray');
  const felt = el('div', 'so-felt');
  felt.dataset.so = 'board';
  tray.append(felt);
  const countEl = el('div', 'so-count');
  countEl.hidden = true;
  const watch = el('div', 'so-watch');
  watch.hidden = true;
  const watchWho = el('div', 'so-watch-who');
  const watchGame = el('div', 'so-watch-game');
  const watchScore = el('div', 'so-watch-score');
  const watchTime = el('div', 'so-watch-time');
  watch.append(watchWho, watchGame, watchScore, watchTime);
  stage.append(tray, countEl, watch);
  root.append(side, stage);
  ctx.root.append(root);

  // 결과 칸(공통 결과 안): 오늘 코인 + 순위
  const rs = el('div', 'so-rs');
  const rsCoin = el('p', 'so-rs-coin');
  rsCoin.dataset.so = 'coin';
  const rank = createRankPanel({ send, limit: 5 });
  rs.append(rsCoin, rank.el);
  let rsKey = '';

  // ---------- 상태 ----------
  let room = null;
  let alive = true;
  let flow = null;       // 내 판 진행 (내가 하는 사람이고 시작했을 때)
  let board = null;      // 종목 판 { reset, apply, frame?, lock, unmount }
  let boardGen = 0;
  let runKey = null;     // 이 판의 so.startAt
  let readySeen = null;  // 카운트다운을 본 판의 startAt
  let ended = false;     // 내 쪽에서 끝냈다(서버 정산을 기다림)
  let fallbackAt = 0;    // 제한 시간이 지났는데 서버가 안 끝냈을 때 end 를 보낼 시각
  let lastCount = -1;
  let warned = false;
  let boardWarns = false; // 판이 api.timeLeft 를 읽는다 = 10초 경고 소리는 판이 낸다
  let goUntil = 0;
  let spScore = 0;       // 구경: soProg 로 온 점수
  let shownScore = null;
  let faceKey = '';
  let endKey = '';
  const timers = new Set();

  const isPlayer = (rm) => Boolean(rm && rm.pid && rm.pid === rm.you);
  const nameOf = (g) => NAMES[g] ?? SOLO[g]?.name ?? g ?? '';
  const pidName = (rm) => rm.players?.find((p) => p.id === rm.pid)?.name ?? '플레이어';
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  // ---------- 판 불러오기·끝내기 ----------
  const api = {
    state: () => flow?.state,
    input: (v) => doInput(v),
    sfx: (name, n) => sfx.play(name, n),
    reduced,
    // 남은 시간 비율 0~1 (제한 시간이 없으면 null). 이걸 읽는 판은 10초 경고 소리를 직접 낸다(틀은 또 내지 않는다).
    timeLeft: () => {
      boardWarns = true;
      const so = room?.so;
      if (!so || !Number.isFinite(so.endsAt)) return null;
      return Math.max(0, Math.min(1, clock.left(so.endsAt) / Math.max(1, so.endsAt - so.startAt)));
    },
  };

  function doInput(v) {
    if (!flow || !board || ended || room?.phase !== 'play') return false;
    const ok = flow.input(v);
    if (ok) {
      board.apply([...flow.state.ev]);
      afterChange();
    }
    return ok;
  }

  function afterChange() {
    paintScore();
    if (flow && !ended && flow.over()) endRun('over');
  }

  // reason: over(엔진이 끝) / quit(그만하기) / time(제한 시간 — 서버가 끝낸다)
  function endRun(reason) {
    if (!flow || ended) return;
    ended = true;
    flow.lock(true);
    board?.lock(true);
    flow.flush(true);
    sfx.play('over');
    if (reason === 'time') fallbackAt = Date.now() + 4000;
    else send({ t: 'so', a: 'end', score: flow.score() });
    render();
  }

  function dropRun() {
    boardGen++;
    if (board) { try { board.unmount(); } catch (e) { console.error(e); } }
    board = null;
    felt.replaceChildren();
    flow = null;
    ended = false;
    fallbackAt = 0;
    runKey = null;
    warned = false;
    boardWarns = false;
    spScore = 0;
    shownScore = null;
  }

  // 새로 고침 등으로 카운트다운을 못 보고 판 중간에 들어왔다: 이어 할 수 없어 지금 점수로 끝낸다
  function stale(rm) {
    ended = true;
    ctx.toast('이어 할 수 없어 지금 점수로 끝냅니다', { key: 'so-stale' });
    send({ t: 'so', a: 'end', score: Number.isFinite(rm.so?.score) ? rm.so.score : 0 });
  }

  function startRun(rm) {
    const so = rm.so;
    runKey = so.startAt;
    const engine = SOLO[rm.game];
    const fresh = readySeen === so.startAt || clock.now() - so.startAt < 2000;
    if (!engine || !Number.isInteger(so.seed) || !fresh) { stale(rm); return; }
    flow = createFlow(engine, so.seed, { send });
    flow.lock(true); // 판이 준비될 때까지
    const gen = ++boardGen;
    loadBoard(rm.game).then((mod) => {
      if (!alive || gen !== boardGen || !flow) return;
      board = mod.mountBoard(felt, api);
      board.reset(flow.state);
      if (!ended) { flow.lock(false); board.lock(false); } else board.lock(true);
      render();
    }).catch((e) => {
      console.error(e);
      if (!alive || gen !== boardGen) return;
      ctx.toast('게임 화면을 여는 중 오류가 났어요.', { kind: 'error', key: 'so-board' });
      if (flow && !ended) { ended = true; send({ t: 'so', a: 'end', score: 0 }); }
    });
  }

  const preloaded = new Map();
  function loadBoard(game) {
    const load = BOARDS[game];
    if (!load) return Promise.reject(new Error(`solo: 판 화면 없음 (${game})`));
    if (!preloaded.has(game)) preloaded.set(game, load().catch((e) => { preloaded.delete(game); throw e; }));
    return preloaded.get(game);
  }

  // ---------- 그리기 ----------
  function paintScore() {
    const rm = room;
    if (!rm) return;
    let score;
    if (rm.phase === 'end' && rm.last) score = rm.last.score;
    else if (flow) score = flow.score();
    else score = isPlayer(rm) ? (rm.so?.score ?? 0) : Math.max(spScore, rm.so?.score ?? 0);
    if (score !== shownScore) {
      const up = shownScore !== null && score > shownScore;
      shownScore = score;
      scoreEl.textContent = fmtScore(score);
      watchScore.textContent = `점수 ${fmtScore(score)}`;
      if (up && !reduced) {
        scoreEl.classList.remove('so-pop');
        void scoreEl.offsetWidth; // 애니메이션 다시 시작
        scoreEl.classList.add('so-pop');
      }
    }
    const saved = ctx.me()?.solo?.[rm.game]?.best;
    const best = Math.max(Number.isFinite(saved) ? saved : 0, rm.phase === 'end' && rm.last ? rm.last.best || 0 : 0, isPlayer(rm) ? score : 0);
    bestEl.textContent = best > 0 ? `최고 ${fmtScore(best)}` : '첫 기록에 도전!';
    bestEl.classList.toggle('so-best-hit', best > 0 && score >= best && score > 0);
  }

  function paintFace(rm) {
    const id = rm.pid;
    const f = (id && ctx.faces.get(id)) || NONE;
    const name = id ? pidName(rm) : '';
    const key = `${id}|${name}|${f.avatar ?? ''}|${JSON.stringify(f.look ?? null)}`;
    if (key === faceKey) return;
    faceKey = key;
    whoFace.replaceChildren(id ? ctx.profile.playerAvatar({ id, name, face: f.avatar, look: f.look, size: 34 }) : '');
    whoName.replaceChildren(id ? ctx.profile.nameTag({ name, look: f.look }) : '');
  }

  function render() {
    const rm = room;
    if (!rm) return;
    const phase = rm.phase;
    root.hidden = phase === 'lobby';
    const player = isPlayer(rm);
    const live = phase === 'ready' || phase === 'play';
    gameName.textContent = nameOf(rm.game);
    paintFace(rm);
    paintScore();
    quitBtn.hidden = !(player && phase === 'play' && !ended);
    timeBox.hidden = !(live || phase === 'settle') || phase === 'ready';
    root.classList.toggle('so-over', phase === 'settle' || phase === 'end' || ended);
    root.classList.toggle('so-spec', !player);
    watch.hidden = player || !(live || phase === 'settle');
    if (!watch.hidden) {
      watchWho.textContent = `${pidName(rm)} 님이 하는 중`;
      watchGame.textContent = nameOf(rm.game);
    }
    tray.classList.toggle('so-wait', !board);
    updateClock();
  }

  // 카운트다운·남은 시간 (매 화면 갱신마다)
  function updateClock() {
    const rm = room;
    if (!rm?.so) { countEl.hidden = true; return; }
    const so = rm.so;
    if (rm.phase === 'ready') {
      const n = countOf(so.startAt - clock.now());
      if (n !== lastCount) {
        lastCount = n;
        if (n > 0) sfx.play('count', n);
      }
      countEl.hidden = n === 0;
      if (n > 0 && countEl.dataset.n !== String(n)) {
        countEl.dataset.n = String(n);
        countEl.textContent = String(n);
        countEl.classList.remove('so-go');
        countEl.classList.remove('so-tick');
        void countEl.offsetWidth;
        countEl.classList.add('so-tick');
      }
      return;
    }
    if (rm.phase === 'play' && goUntil === 0 && clock.now() - so.startAt < 2000) {
      goUntil = Date.now() + GO_MS;
      lastCount = -1;
      countEl.hidden = false;
      countEl.dataset.n = 'go';
      countEl.textContent = '시작!';
      countEl.classList.remove('so-tick');
      countEl.classList.add('so-go');
      sfx.play('go');
      later(() => { countEl.hidden = true; }, GO_MS);
    } else if (rm.phase !== 'play') {
      if (rm.phase !== 'settle') goUntil = 0;
      if (Date.now() > goUntil) countEl.hidden = true;
    }
    if (Number.isFinite(so.endsAt)) {
      const left = clock.left(so.endsAt);
      const total = Math.max(1, so.endsAt - so.startAt);
      const text = mmss(left);
      timeLabel.textContent = '남은 시간';
      if (timeEl.textContent !== text) timeEl.textContent = text;
      watchTime.textContent = `남은 시간 ${text}`;
      timeFill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
      timeBar.hidden = false;
      const low = rm.phase === 'play' && left <= 10000;
      timeBox.classList.toggle('so-low', low);
      if (low && !warned && !boardWarns && isPlayer(rm)) { warned = true; sfx.play('warn'); }
    } else {
      const el0 = rm.phase === 'play' ? Math.max(0, clock.now() - so.startAt) : 0;
      const text = mmss(el0 + 999);
      timeLabel.textContent = '지난 시간';
      if (rm.phase === 'play' && timeEl.textContent !== text) timeEl.textContent = text;
      watchTime.textContent = `지난 시간 ${rm.phase === 'play' ? text : ''}`;
      timeBar.hidden = true;
      timeBox.classList.remove('so-low');
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden' && flow) flow.flush(true);
  }
  document.addEventListener('visibilitychange', onVisibility);
  const offFaces = ctx.faces.onChange(() => { faceKey = ''; if (room) paintFace(room); });

  return {
    room(next) {
      room = next;
      if (!next) return;
      const so = next.so;
      const phase = next.phase;
      if (phase === 'lobby') { dropRun(); goUntil = 0; lastCount = -1; }
      if (phase === 'ready' && so) {
        if (readySeen !== so.startAt) {
          dropRun();
          goUntil = 0;
          lastCount = -1;
          readySeen = so.startAt;
          if (isPlayer(next)) loadBoard(next.game).catch(() => {}); // 카운트다운 동안 판 화면 파일을 미리 받는다
        }
      }
      if (phase === 'play' && so && isPlayer(next)) {
        if (runKey !== so.startAt) {
          if (flow || board) dropRun();
          startRun(next);
        } else if (flow && !ended) flow.check(so.n);
      }
      if (phase === 'end' && next.last) {
        const key = `${next.code}|${next.last.game}|${next.last.score}|${next.last.best}|${next.so?.startAt ?? ''}`;
        if (key !== endKey) {
          endKey = key;
          if (next.last.fresh && next.last.score > 0) sfx.play('best');
        }
      }
      render();
    },

    event(e) {
      if (!e) return;
      if (e.k === 'soProg') {
        if (Number.isFinite(e.score)) { spScore = e.score; paintScore(); }
      } else if (e.k === 'soRank') rank.feed(e); // 순위 답(메시지 t:'soRank' 를 k 로 바꿔 넘긴다)
    },

    // so_sync: 서버가 받은 칸 수가 모자라다 -> 그 칸부터 다시 보낸다. so_fast 는 조용히 넘어간다.
    error(err) {
      if (err?.code === 'so_sync' && flow) {
        const n = Number.isInteger(err.n) ? err.n : room?.so?.n;
        if (Number.isInteger(n)) flow.resync(Math.min(n, flow.sentN));
      }
    },

    // 말풍선·머리 위 이모티콘 자리: 하는 사람은 점수 칸 위쪽 사진 아래, 나머지는 같은 자리(구경꾼은 판 위쪽 가운데)
    anchorOf(id) {
      if (root.hidden || !room) return null;
      const r = (id === room.pid ? whoFace : stage).getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return id === room.pid ? { x: r.left + r.width / 2, y: r.bottom + 6 } : { x: r.left + r.width / 2, y: r.top + 24 };
    },

    frame(dt) {
      if (!alive || !room) return;
      updateClock();
      if (flow && board && !ended && room.phase === 'play') {
        const evs = flow.advance(dt);
        if (evs.length) board.apply(evs);
        if (evs.length) paintScore();
        if (flow.over()) endRun('over');
        else if (Number.isFinite(room.so?.endsAt) && clock.left(room.so.endsAt) <= 0) endRun('time');
      }
      if (board) { try { board.frame?.(dt); } catch (e) { console.error(e); } }
      if (flow) flow.flush();
      if (fallbackAt && Date.now() > fallbackAt) {
        fallbackAt = 0;
        if (room.phase === 'play' && flow) send({ t: 'so', a: 'end', score: flow.score() });
      }
    },

    // 공통 결과 제목: "사과 게임 · 87점" / "새 기록! · 전체 3위 · 이번 주 1위"
    resultTitle(s) {
      return resultTitleOf(nameOf(s.last?.game ?? s.game), s.last);
    },

    // 공통 결과 안의 칸: 오늘 코인 + 이 종목 순위
    resultPart(s) {
      const l = s.last;
      if (!l) return null;
      const key = `${s.code}|${l.game}|${l.score}|${l.best}|${s.so?.startAt ?? ''}`;
      if (key !== rsKey) {
        rsKey = key;
        const line = coinLineOf(l);
        rsCoin.textContent = line;
        rsCoin.hidden = !line;
        rank.show(l.game);
      }
      return rs;
    },

    // 하는 중에 나가면 그 판은 그때 점수로 끝난다. 결과 화면에서는 확인 없이 나간다(틀 규칙)
    leaveNote(s) {
      return isPlayer(s) && (s.phase === 'ready' || s.phase === 'play') ? '나가면 지금 점수로 끝나요' : null;
    },

    unmount() {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      offFaces();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      dropRun();
      rank.dispose();
      room = null;
      root.remove();
    },
  };
}
