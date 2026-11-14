// 요트다이스 화면 모듈(점수표·판). 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/COMMON-CONTRACT.md 4-2, SPEC 19절.
// 대기실·상단 줄(방 코드/소리/이모티콘/나가기)·이모티콘 머리 위 표시·채팅·소리 끄기·나가기 확인은 틀이 한다.
// 이 모듈은 게임 판만 그린다: 대기실에서 게임으로 넘어갈 때 틀이 root 를 보이게 하고, 방을 나가면 unmount 를 부른다(3D 장면도 stage.use(null)).
import './yacht.css';
import './ui/sheet.css';
import './ui/board.css';
import { createSheet } from './ui/sheet.js';
import { createBoard } from './ui/board.js';
import { createWho } from './ui/who.js';

const YT_EVENTS = new Set(['ytRoll', 'ytKeep', 'ytShake', 'ytTurn', 'ytScore', 'ytEnd', 'ytStart', 'ytPick', 'ytDrop']);

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

// 판이 끝난 뒤(result·lobby)에는 서버가 남겨 둔 waiting 을 무시한다.
const shown = (s) => (s && s.phase !== 'playing' && s.waiting ? { ...s, waiting: null } : s);

export function mount(ctx) {
  const { stage, send } = ctx;
  const root = el('div', 'yt-root');
  ctx.root.append(root);

  const who = createWho({ faces: ctx.faces, profile: ctx.profile });
  let state = null;
  let busy = false;
  let ro = null;

  const sheet = createSheet({ host: root, send, who });
  const pane = el('div', 'yt-pane');
  root.append(pane);
  const board = createBoard({
    host: pane, stage, send, who,
    onBusy: (b) => { busy = b; if (state) sheet.update(shown(state), { settled: !busy }); },
  });

  // 상단 줄이 점수표 오른쪽에서 시작하도록 점수표 폭을 알린다(틀의 상단 줄이 --yt-sheet-w 를 읽는다)
  function measure() {
    const w = Math.round(sheet.el.getBoundingClientRect().width);
    if (w) document.documentElement.style.setProperty('--yt-sheet-w', `${w}px`);
  }
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(sheet.el); }
  measure();

  function paint() {
    if (!state) return;
    const s = shown(state);
    sheet.update(s, { settled: !busy });
    board.update(s);
  }

  // 사진·꾸미기가 새로 왔다: 점수표의 사진만 다시 그린다
  const offFaces = ctx.faces.onChange(() => {
    if (state) sheet.update(shown(state), { settled: !busy });
  });

  // 공통 결과 화면의 게임 칸: 내 요트 전적 + 점수표 보기(패널을 접어 판을 본다)
  const stat = el('p', 'yt-rs-stat');
  const peek = el('button', 'lb-btn lb-tint yt-rs-peek');
  peek.type = 'button';
  peek.textContent = '점수표 보기';
  peek.dataset.yt = 'result-sheet';
  peek.addEventListener('click', () => ctx.peekResult());
  const part = el('div', 'yt-rs');
  part.append(stat, peek);

  return {
    room(next) {
      state = next;
      paint();
      requestAnimationFrame(measure);
    },

    event(e) {
      if (!e || !YT_EVENTS.has(e.k)) return;
      if (e.k === 'ytScore') sheet.flash(e);
      board.handleEvent(e);
    },

    // 점수표의 그 사람 사진 아래쪽(말풍선·이모티콘이 화면 위로 잘리지 않게)
    anchorOf(id) {
      const p = sheet.anchor(id);
      return p ? { x: p.x, y: p.y + 22 } : null;
    },

    frame(dt) {
      board.frame(dt);
    },

    resultTitle(s) {
      const res = s.result;
      if (!res) return null;
      const w = res.winners ?? [];
      const title = w.length > 1 ? '공동 우승' : w[0] === s.you ? '승리!' : `${res.ranks.find((r) => r.id === w[0])?.name ?? ''} 우승`;
      return { title, sub: res.reason === 'alone' ? '기권으로 종료' : `${s.rounds || 12}턴 종료` };
    },

    resultPart() {
      const st = ctx.me()?.stats?.yacht ?? {};
      stat.textContent = `요트다이스 ${st.games || 0}판 · 우승 ${st.wins || 0}회 · 최고 ${st.best || 0}점`;
      return part;
    },

    // 판이 진행 중이고 내가 기권하지 않은 참가자면 안내. 아니면 null(대기·결과·관전은 확인 없이/기본 확인)
    leaveNote(s) {
      const mine = s?.phase === 'playing' && (s.cols ?? []).find((c) => c.id === s.you);
      return mine && !mine.left ? '나가면 기권 처리돼요' : null;
    },

    unmount() {
      offFaces();
      ro?.disconnect();
      for (const m of [board, sheet]) { try { m.dispose(); } catch (e) { console.error(e); } }
      document.documentElement.style.removeProperty('--yt-sheet-w');
      try { stage?.use?.(null); } catch { /* the scene is already gone */ }
      root.remove();
    },
  };
}
