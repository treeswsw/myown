// 갱식마인드 규칙 엔진 (GDD 3·4·8·9·10절). 통신·시계·난수·파일을 모르는 순수 함수 모음.
//  - 시간은 인자 `now`(ms)로 받는다. Date.now 를 쓰지 않는다. 시간 진행은 tick(state, now, env) 를 호출자가 타이머로 부른다.
//  - 난수는 env.rng(n)(0..n-1 정수), 단어 3개 후보는 env.words(topics) 로 받는다(둘 다 호출자가 준다. Math.random 금지).
//  - state 는 일반 객체다. 직접 읽어 내보내지 말고 viewFor 로만 화면에 내보낸다(비밀 유지의 유일한 문).
//  - 그림(st/pt/...)은 이 엔진 범위 밖(room 이 ops.js 로 처리). canDraw / noteInk / setCanvasFlags 로만 이어진다.
//
// 모든 변경 함수의 반환값 = "보낼 것" 객체 fx:
//   { ok: bool,
//     code?, msg?,                 // ok:false 일 때 오류 (code 는 10-7, 기존 오류는 code:null)
//     room: [id...],               // 이 사람들에게 room.state(viewFor) 를 다시 보낸다 (접속 중인 사람만 담긴다)
//     events: [{ to: [id...], e }],// e = 10-5 의 event.e. to 는 접속 중인 사람만
//     use: [w...],                 // 단어 뽑기(picker)에 use(w) 로 기억시킬 단어
//     kicked: [id...],             // 내보낸 사람(room:null + dr_kicked 를 보낼 것)
//     finished: null | { reason: 'done'|'alone'|'end', save: bool, ranking: [{id,name,rank,score,correct,left}] } }

import {
  PHASES as P, MIN_PLAYERS, MAX_PLAYERS, TIMES, TIME_CHOICES, TIME_DEFAULT, ROUND_CHOICES, ROUNDS_DEFAULT,
  ORDER_CHOICES, ORDER_DEFAULT, LEN_DEFAULT, CHAT, TOPIC_NAME_MAX, TOPICS_MAX,
} from './constants.js';
import { isCorrect, makeMask } from './answer.js';
import { guesserPointsAt, drawerPoints, rankPlayers } from './score.js';
import { GAME_NAME } from './name.js';

const ms = (sec) => sec * 1000;

export const ERRORS = Object.freeze({
  dr_off: `${GAME_NAME}는 아직 열리지 않았습니다.`,
  dr_host: '방장만 할 수 있습니다.',
  dr_now: '지금은 할 수 없습니다.',
  dr_bad: '알 수 없는 요청입니다.',
  dr_need2: '2명 이상이어야 시작할 수 있습니다.',
  dr_topics: '주제를 하나 이상 켜 주세요.',
  dr_drawer_mute: '그림으로만 설명해 주세요.',
  dr_hit_media: '정답 공개 전에는 쓸 수 없습니다.',
  dr_chat_fast: '채팅을 너무 빨리 보내고 있습니다',
  dr_canvas_full: '그림이 너무 많아요. 전체 지우기를 눌러 주세요.',
  dr_kicked: '방장이 내보냈습니다.',
});
export const errorMsg = (code) => ERRORS[code] ?? ERRORS.dr_bad;

// ---------- 난수 ----------

/** 안전한 난수 0..n-1 (crypto, 치우침 없는 거절 추출). 시험·서버가 env.rng 를 주지 않았을 때만 쓴다. */
export function defaultRng(n) {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError('rng 범위 오류');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

function rand(env, n) {
  const v = (env.rng ?? defaultRng)(n);
  if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError('rng 가 범위 밖의 값을 돌려줌');
  return v;
}

// ---------- 보낼 것 ----------

function newFx() { return { ok: true, room: [], events: [], use: [], kicked: [], finished: null }; }
function fail(code, msg) {
  const fx = newFx();
  fx.ok = false;
  fx.code = code;
  fx.msg = msg ?? errorMsg(code);
  return fx;
}

const connectedIds = (s) => s.players.filter((p) => p.connected).map((p) => p.id);
const findP = (s, id) => s.players.find((p) => p.id === id) || null;
const bySeat = (s) => s.players.slice().sort((a, b) => a.seat - b.seat);
const inGame = (s) => s.phase === P.PICK || s.phase === P.DRAW || s.phase === P.REVEAL;
const isHost = (s, id) => s.hostId === id;

function roomAll(s, fx) { fx.room = connectedIds(s); }
function emit(s, fx, e, to) {
  const ids = (to ?? connectedIds(s)).filter((id) => findP(s, id)?.connected);
  if (ids.length) fx.events.push({ to: ids, e });
}

// ---------- 만들기 ----------

/**
 * 방 만들기. host = {id, name}. allTopics = 고를 수 있는 주제 전부(11개), topics = 처음 켜 둘 주제(없으면 전부).
 * 방장은 자리 0번에 앉는다.
 */
export function createRoom({ code, host, allTopics, topics, now }) {
  if (!host || typeof host.id !== 'string' || !host.id) throw new Error('host 가 필요합니다');
  if (!Array.isArray(allTopics) || allTopics.length === 0) throw new Error('allTopics 가 필요합니다');
  if (!Number.isFinite(now)) throw new Error('now 가 필요합니다');
  const on = (Array.isArray(topics) ? topics : allTopics).filter((t, i, a) => allTopics.includes(t) && a.indexOf(t) === i);
  const s = {
    code,
    mode: 'draw',
    hostId: host.id,
    phase: P.LOBBY,
    settings: { order: ORDER_DEFAULT, rounds: ROUNDS_DEFAULT, time: TIME_DEFAULT, len: LEN_DEFAULT, topics: on, allTopics: allTopics.slice() },
    players: [],
    waiting: false,      // reveal 이 끝났는데 접속 중인 사람이 모자라 기다리는 중
    gone: [],            // 이번 판 도중 나간 사람 {id,name,score,correct} — 순위에 남긴다
    joinSeq: 0,
    roundNo: 0, q: 0, qTotal: 0, qBase: 0, roundSize: 0,
    lastSeat: -1,        // 방금 그린 사람의 자리(순서대로 방식의 기준)
    lastDrawerId: null,
    cur: null,           // 지금 문제 { drawerId, cands, entry, hits, guessers, inked, startAt }
    plan: null,          // 다음 문제 계획 { drawerId, roundNo, newRound } | { final:true } | { abort:true }
    phaseStartedAt: now,
    endsAt: null,
    rushed: false,
    reveal: null,
    ranking: null,
    canUndo: false, canRedo: false,
    chatLog: [],
  };
  addPlayer(s, host);
  return s;
}

function freeSeat(s) {
  const used = new Set(s.players.map((p) => p.seat));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

function addPlayer(s, { id, name }) {
  const p = {
    id, name: String(name ?? id), seat: freeSeat(s), joinNo: s.joinSeq++,
    connected: true, awaySince: null,
    score: 0, correct: 0, hit: false, drew: false, chatTs: [],
  };
  s.players.push(p);
  if (!s.players.some((x) => x.id === s.hostId)) s.hostId = id; // 방이 비었다가 다시 채워질 때
  return p;
}

// ---------- 들어오기·나가기·끊김·다시 붙기 ----------

/** 들어오기. 이미 있는 아이디면 다시 붙기(back)와 같다. 진행 중에 들어온 사람은 다음 라운드부터 그린다. */
export function join(s, user, env = {}) {
  const existing = findP(s, user?.id);
  if (existing) return back(s, user.id, env);
  if (!user || typeof user.id !== 'string' || !user.id) return fail('dr_bad');
  if (s.players.length >= MAX_PLAYERS) return fail(null, '방이 가득 찼습니다.');
  const fx = newFx();
  const np = addPlayer(s, user);
  np.drew = inGame(s); // 도중에 새로 들어온 사람은 이번 라운드엔 그리지 않는다(다음 라운드부터)
  const gi = s.gone.findIndex((g) => g.id === user.id); // 같은 판에서 나갔다 다시 들어옴: 점수 되살림
  if (gi >= 0) {
    const g = s.gone.splice(gi, 1)[0];
    np.score = g.score; np.correct = g.correct;
    np.drew = g.roundNo === s.roundNo ? !!g.drew : inGame(s); // 같은 라운드일 때만 그린 기록을 되살림
    if (s.cur && s.cur.hits.some((h) => h.id === np.id)) np.hit = true;
  }
  // 도중에 들어온 사람도 지금 문제를 바로 맞힐 수 있다
  const cur = s.cur;
  if (inGame(s) && cur && (s.phase === P.PICK || s.phase === P.DRAW) && cur.drawerId !== user.id && !cur.guessers.includes(user.id)) cur.guessers.push(user.id);
  emit(s, fx, { k: 'joined', id: user.id, name: findP(s, user.id).name }, connectedIds(s).filter((x) => x !== user.id));
  if (s.waiting && s.phase === P.REVEAL && env.now != null && connectedIds(s).length >= MIN_PLAYERS) executeNext(s, env, fx);
  roomAll(s, fx);
  return fx;
}

/** 다시 붙기: 자리를 그대로 이어받는다. 그리는 사람이 돌아오면 15초 대기가 풀린다. */
export function back(s, id, env = {}) {
  const p = findP(s, id);
  if (!p) return fail('dr_bad');
  const fx = newFx();
  p.connected = true;
  p.awaySince = null;
  emit(s, fx, { k: 'back', id, name: p.name }, connectedIds(s).filter((x) => x !== id));
  if (s.waiting && s.phase === P.REVEAL && env.now != null && connectedIds(s).length >= MIN_PLAYERS) executeNext(s, env, fx);
  roomAll(s, fx);
  return fx;
}

/** 끊김. 자리는 TIMES.seatKeep 동안 유지(tick 이 자른다). 그리는 사람이면 TIMES.drawerAway 뒤에 그 문제가 끝난다(tick). */
export function away(s, id, env) {
  const p = findP(s, id);
  if (!p) return fail('dr_bad');
  const fx = newFx();
  if (!p.connected) { roomAll(s, fx); return fx; }
  const now = env.now;
  p.connected = false;
  p.awaySince = now;
  emit(s, fx, { k: 'away', id, name: p.name });
  if (s.phase === P.DRAW) checkAllHit(s, env, fx);
  roomAll(s, fx);
  return fx;
}

function transferHost(s) {
  if (findP(s, s.hostId)) return;
  const left = s.players.slice().sort((a, b) => a.joinNo - b.joinNo);
  const next = left.find((p) => p.connected) ?? left[0];
  if (next) s.hostId = next.id;
}

/** 나가기(스스로 나감·끊긴 지 60초·내보냄이 모두 이 길). 자리를 비운다. */
export function leave(s, id, env, { silent = false } = {}) {
  const p = findP(s, id);
  if (!p) return fail('dr_bad');
  const fx = newFx();
  const drawerLeft = s.cur && s.cur.drawerId === id && (s.phase === P.PICK || s.phase === P.DRAW);
  s.players = s.players.filter((x) => x !== p);
  if (inGame(s)) s.gone.push({ id: p.id, name: p.name, score: p.score, correct: p.correct, drew: p.drew, roundNo: s.roundNo });
  transferHost(s);
  if (!silent) emit(s, fx, { k: 'left', id: p.id, name: p.name });
  if (inGame(s)) {
    if (s.players.length < MIN_PLAYERS) { abortToLobby(s, 'alone', env, fx); return fx; }
    if (drawerLeft) finishQuestion(s, 'left', env, fx);
    else if (s.phase === P.DRAW) checkAllHit(s, env, fx);
  }
  roomAll(s, fx);
  return fx;
}

/** 방장이 내보냄: 방 대기·최종 순위에서만. 내보낸 사람은 fx.kicked 에 담긴다. */
export function kick(s, by, targetId, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (s.phase !== P.LOBBY && s.phase !== P.FINAL) return fail('dr_now');
  if (typeof targetId !== 'string' || targetId === by || !findP(s, targetId)) return fail('dr_bad');
  const fx = leave(s, targetId, env);
  fx.kicked = [targetId];
  return fx;
}

// ---------- 설정 ----------

/** 방장만, 방 대기·최종 순위에서만. 보낸 칸만 바뀐다(전부 맞아야 하나도 안 바뀌는 일 없이 적용). */
export function setSettings(s, by, patch, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (s.phase !== P.LOBBY && s.phase !== P.FINAL) return fail('dr_now');
  if (!patch || typeof patch !== 'object') return fail('dr_bad');
  const has = (k) => patch[k] !== undefined;
  const next = {};
  if (has('order')) { if (!ORDER_CHOICES.includes(patch.order)) return fail('dr_bad'); next.order = patch.order; }
  if (has('rounds')) { if (!ROUND_CHOICES.includes(patch.rounds)) return fail('dr_bad'); next.rounds = patch.rounds; }
  if (has('time')) { if (!TIME_CHOICES.includes(patch.time)) return fail('dr_bad'); next.time = patch.time; }
  if (has('len')) { if (typeof patch.len !== 'boolean') return fail('dr_bad'); next.len = patch.len; }
  if (has('topics')) {
    const t = patch.topics;
    if (!Array.isArray(t) || t.length < 1 || t.length > TOPICS_MAX) return fail('dr_bad');
    const names = [];
    for (const n of t) {
      if (typeof n !== 'string' || n.length < 1 || [...n].length > TOPIC_NAME_MAX) return fail('dr_bad');
      if (s.settings.allTopics.includes(n) && !names.includes(n)) names.push(n); // 없는 주제는 무시, 중복은 지움
    }
    if (names.length === 0) return fail('dr_bad');
    next.topics = names;
  }
  if (Object.keys(next).length === 0) return fail('dr_bad');
  Object.assign(s.settings, next);
  const fx = newFx();
  roomAll(s, fx);
  return fx;
}

// ---------- 시작·한 판 더·방으로 ----------

/** 시작(방 대기) 또는 한 판 더(최종 순위). 같은 설정으로 새 판. */
export function start(s, by, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (s.phase !== P.LOBBY && s.phase !== P.FINAL) return fail('dr_now');
  if (s.players.filter((p) => p.connected).length < MIN_PLAYERS) return fail('dr_need2');
  if (s.settings.topics.length === 0) return fail('dr_topics');
  if (typeof env.words !== 'function') throw new Error('env.words 가 필요합니다');
  const fx = newFx();
  resetGame(s);
  const live = bySeat(s).filter((p) => p.connected);
  const first = live[rand(env, live.length)];
  s.roundNo = 1; s.qBase = 0; s.roundSize = s.players.length;
  for (const p of s.players) p.drew = false;
  beginQuestion(s, first.id, env, fx);
  roomAll(s, fx);
  return fx;
}

/** 최종 순위에서 "방으로". */
export function toLobby(s, by, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (s.phase !== P.FINAL) return fail('dr_now');
  const fx = newFx();
  resetGame(s);
  s.phase = P.LOBBY;
  s.phaseStartedAt = env.now;
  roomAll(s, fx);
  return fx;
}

/** 진행 중 "이 판 끝내기": 점수 저장 안 함. */
export function end(s, by, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (!inGame(s)) return fail('dr_now');
  const fx = newFx();
  abortToLobby(s, 'end', env, fx);
  return fx;
}

function resetGame(s) {
  s.gone = [];
  s.ranking = null;
  s.cur = null; s.plan = null; s.reveal = null;
  s.roundNo = 0; s.q = 0; s.qTotal = 0; s.qBase = 0; s.roundSize = 0;
  s.lastSeat = -1; s.lastDrawerId = null;
  s.endsAt = null; s.rushed = false; s.waiting = false;
  s.canUndo = false; s.canRedo = false;
  for (const p of s.players) { p.score = 0; p.correct = 0; p.hit = false; p.drew = false; }
}

function rankingNow(s) {
  const list = [
    ...bySeat(s).map((p) => ({ id: p.id, name: p.name, score: p.score, correct: p.correct, left: false })),
    ...s.gone.map((g) => ({ ...g, left: true })),
  ];
  return rankPlayers(list).map((r) => ({ id: r.id, name: r.name, rank: r.rank, score: r.score, correct: r.correct, left: r.left }));
}

// 판이 중간에 끝남(혼자 남음·방장이 끝냄): 방 대기로. 'alone' 은 그때까지 점수를 저장할 것.
function abortToLobby(s, reason, env, fx) {
  if (s.cur && (s.phase === P.PICK || s.phase === P.DRAW)) applyHits(s, s.cur); // 이미 맞힌 점수는 인정
  fx.finished = { reason, save: reason === 'alone', ranking: rankingNow(s) };
  resetGame(s);
  s.phase = P.LOBBY;
  s.phaseStartedAt = env.now;
  roomAll(s, fx);
}

// ---------- 출제 순서 ----------

function nextBySeq(cand, lastSeat) {
  const sorted = cand.slice().sort((a, b) => a.seat - b.seat);
  return sorted.find((p) => p.seat > lastSeat) ?? sorted[0];
}

/** 다음 문제 계획 (상태를 바꾸지 않는다. 난수는 rand 방식에서만 쓴다). */
function planNext(s, env) {
  if (s.players.length < MIN_PLAYERS) return { abort: true };
  const live = s.players.filter((p) => p.connected);
  if (live.length < MIN_PLAYERS) return { wait: true }; // 끊긴 사람이 돌아오길 기다림
  let cand = live.filter((p) => !p.drew);
  let roundNo = s.roundNo;
  let newRound = false;
  if (cand.length === 0) {
    roundNo += 1;
    if (roundNo > s.settings.rounds) return { final: true };
    newRound = true;
    cand = live;
  }
  let pick = null;
  const { order } = s.settings;
  if (order === 'hit' && s.cur) {
    for (const h of s.cur.hits) { // 먼저 맞힌 순
      const p = cand.find((c) => c.id === h.id);
      if (p) { pick = p; break; }
    }
  }
  if (!pick && order === 'rand') {
    let pool = cand;
    if (newRound && live.length > 2 && pool.length > 1) pool = pool.filter((p) => p.id !== s.lastDrawerId);
    pool = pool.slice().sort((a, b) => a.seat - b.seat);
    pick = pool[rand(env, pool.length)];
  }
  if (!pick) pick = nextBySeq(cand, s.lastSeat);
  return { drawerId: pick.id, roundNo, newRound };
}

function planValid(s, plan) {
  if (!plan || plan.abort || plan.final || plan.wait) return false; // 끝·중단 계획은 그 사이 사람이 돌아왔을 수 있어 다시 본다
  const p = findP(s, plan.drawerId);
  if (!p || !p.connected) return false;
  if (plan.newRound) return plan.roundNo === s.roundNo + 1;
  return !p.drew && plan.roundNo === s.roundNo;
}

// ---------- 한 문제 ----------

function beginQuestion(s, drawerId, env, fx) {
  const now = env.now;
  if (typeof env.words !== 'function') throw new Error('env.words 가 필요합니다');
  const cands = env.words(s.settings.topics);
  if (!Array.isArray(cands) || cands.length < 1) throw new Error('단어 후보가 없습니다');
  const drawer = findP(s, drawerId);
  drawer.drew = true;
  s.lastDrawerId = drawerId;
  s.lastSeat = drawer.seat;
  s.q += 1;
  s.qTotal = s.qBase + s.roundSize + (s.settings.rounds - s.roundNo) * s.players.length;
  for (const p of s.players) p.hit = false;
  s.cur = {
    drawerId,
    cands: cands.map((c) => ({ w: c.w, topic: c.topic, alt: Array.isArray(c.alt) ? c.alt.slice() : [] })),
    entry: null,
    hits: [],            // [{id, pts, order}] 맞힌 순서
    guessers: s.players.filter((p) => p.id !== drawerId).map((p) => p.id), // 맞힐 수 있던 사람(끊긴 사람 포함)
    inked: false,
    startAt: null,
  };
  s.plan = null;
  s.reveal = null;
  s.rushed = false;
  s.canUndo = false; s.canRedo = false;
  s.phase = P.PICK;
  s.phaseStartedAt = now;
  s.endsAt = now + ms(TIMES.pick);
  emit(s, fx, { k: 'drNew' });
  roomAll(s, fx);
}

/** 단어 고르기. i = 0..2. 시간이 끝나면 tick 이 0번을 자동으로 고른다. */
export function pickWord(s, by, i, env) {
  if (s.phase !== P.PICK || !s.cur) return fail('dr_now');
  if (s.cur.drawerId !== by) return fail('dr_now');
  if (!Number.isInteger(i) || i < 0 || i >= s.cur.cands.length) return fail('dr_bad');
  const fx = newFx();
  choose(s, i, env, fx);
  return fx;
}

function choose(s, i, env, fx) {
  const now = env.now;
  const cur = s.cur;
  cur.entry = cur.cands[i];
  fx.use.push(cur.entry.w);
  cur.startAt = now;
  s.phase = P.DRAW;
  s.phaseStartedAt = now;
  s.endsAt = now + ms(s.settings.time);
  roomAll(s, fx);
}

/** 그리는 사람이고 draw 단계인가 (room 이 그림 요청을 받기 전에 확인). */
export function canDraw(s, id) {
  return s.phase === P.DRAW && !!s.cur && s.cur.drawerId === id;
}

/** 첫 선이 들어왔음을 알린다(무입력 판정 해제). 그리는 사람이 아니거나 draw 가 아니면 false. */
export function noteInk(s, id) {
  if (!canDraw(s, id)) return false;
  s.cur.inked = true;
  return true;
}

/** 그림 쪽 되돌리기·다시 하기 가능 여부를 알린다 (그리는 사람에게만 뜻이 있다). 바뀌었으면 그리는 사람에게만 room 을 다시 보낼 것. */
export function setCanvasFlags(s, { canUndo, canRedo }) {
  const fx = newFx();
  const a = !!canUndo; const b = !!canRedo;
  if (a !== s.canUndo || b !== s.canRedo) {
    s.canUndo = a; s.canRedo = b;
    if (s.cur && findP(s, s.cur.drawerId)?.connected) fx.room = [s.cur.drawerId];
  }
  return fx;
}

/** 포기(그리는 사람, draw). */
export function give(s, by, env) {
  if (s.phase !== P.DRAW || !s.cur || s.cur.drawerId !== by) return fail('dr_now');
  const fx = newFx();
  finishQuestion(s, 'give', env, fx);
  return fx;
}

/** 이 문제 넘기기(방장, pick·draw). */
export function skip(s, by, env) {
  if (!isHost(s, by)) return fail('dr_host');
  if (s.phase !== P.PICK && s.phase !== P.DRAW) return fail('dr_now');
  const fx = newFx();
  finishQuestion(s, 'skip', env, fx);
  return fx;
}

function applyHits(s, cur) { // 맞힌 사람 점수와 횟수를 더한다 (문제당 한 번)
  if (cur.applied) return;
  cur.applied = true;
  for (const h of cur.hits) {
    const p = findP(s, h.id) ?? s.gone.find((g) => g.id === h.id);
    if (p) { p.score += h.pts; p.correct += 1; }
  }
}

function finishQuestion(s, why, env, fx) {
  const now = env.now;
  const cur = s.cur;
  if (s.phase === P.PICK) { // 고르기 전에 끝남: 첫 단어를 정답으로 공개
    cur.entry = cur.cands[0];
    fx.use.push(cur.entry.w);
  }
  applyHits(s, cur);
  const hits = cur.hits.length;
  const guessers = cur.guessers.filter((id) => findP(s, id)).length; // 아직 방에 남은 사람
  const hitsIn = cur.hits.filter((h) => findP(s, h.id)).length; // 아직 방에 남은 맞힌 사람(그린 사람 점수용)
  const drawerPts = (why === 'all' || why === 'time') ? drawerPoints({ hits: hitsIn, guessers }) : 0;
  const drawer = findP(s, cur.drawerId) ?? s.gone.find((g) => g.id === cur.drawerId);
  if (drawer) drawer.score += drawerPts;
  s.plan = planNext(s, env);
  s.reveal = {
    word: cur.entry.w,
    why,
    gains: cur.hits.map((h) => ({ id: h.id, pts: h.pts, order: h.order })),
    drawerPts,
    guessers,
    nextId: s.plan.drawerId ?? null,
  };
  s.phase = P.REVEAL;
  s.phaseStartedAt = now;
  s.endsAt = now + ms(TIMES.reveal);
  s.rushed = false;
  roomAll(s, fx);
}

// 접속 중인 맞힐 사람이 모두 맞혔으면 끝
function checkAllHit(s, env, fx) {
  const cur = s.cur;
  if (s.phase !== P.DRAW || !cur || cur.hits.length === 0) return;
  const hitIds = new Set(cur.hits.map((h) => h.id));
  const waiting = cur.guessers.filter((id) => findP(s, id)?.connected && !hitIds.has(id));
  if (waiting.length === 0) finishQuestion(s, 'all', env, fx);
}

function executeNext(s, env, fx) {
  let plan = s.plan;
  if (!planValid(s, plan)) plan = planNext(s, env);
  s.plan = null;
  s.waiting = false;
  if (plan.wait) { // 접속 중인 사람이 모자람: 가장 빨리 자리가 비는 때까지 reveal 에서 기다린다
    const exp = Math.min(...s.players.filter((p) => !p.connected).map((p) => p.awaySince + ms(TIMES.seatKeep)));
    s.waiting = true;
    s.endsAt = Math.max(exp, env.now + 1000);
    roomAll(s, fx);
    return;
  }
  if (plan.abort) { abortToLobby(s, 'alone', env, fx); return; }
  if (plan.final) { enterFinal(s, env, fx); return; }
  if (plan.newRound) {
    s.roundNo = plan.roundNo;
    s.qBase = s.q;
    s.roundSize = s.players.length;
    for (const p of s.players) p.drew = false;
  }
  beginQuestion(s, plan.drawerId, env, fx);
}

function enterFinal(s, env, fx) {
  s.ranking = rankingNow(s);
  fx.finished = { reason: 'done', save: true, ranking: s.ranking.map((r) => ({ ...r })) };
  s.cur = null; s.plan = null; s.reveal = null;
  s.phase = P.FINAL;
  s.phaseStartedAt = env.now;
  s.endsAt = null;
  s.rushed = false;
  for (const p of s.players) p.hit = false;
  roomAll(s, fx);
}

// ---------- 채팅 ----------

// 앞의 크기 표시(#, *, **, ***)를 뗀다. 뗀 뒤 남는 글이 없으면 원래 글 그대로(chatSize.js 와 같은 규칙).
function stripMark(raw) {
  const t = String(raw).trim();
  let rest = null;
  if (t.startsWith('#')) rest = t.slice(1).trimStart();
  else { const m = /^\*{1,3}/.exec(t); if (m) rest = t.slice(m[0].length).trimStart(); }
  if (rest === null) return t;
  return /[^\s#*]/u.test(rest) ? rest : t;
}

function chatRateOk(p, now) {
  p.chatTs = p.chatTs.filter((t) => now - t < CHAT.per10sMs);
  if (p.chatTs.length >= CHAT.per10s) return false;
  if (p.chatTs.filter((t) => now - t < CHAT.perSecMs).length >= CHAT.perSec) return false;
  return true;
}

/**
 * 채팅 한 줄 (10-6). 못 맞힌 사람의 정답은 채팅으로 나가지 않고 drHit 이 된다.
 * 오류: dr_bad(길이·없는 사람), dr_drawer_mute, dr_chat_fast.
 */
export function chat(s, id, text, env) {
  const p = findP(s, id);
  if (!p) return fail('dr_bad');
  if (typeof text !== 'string') return fail('dr_bad');
  const t = text.trim();
  const len = [...t].length;
  if (len < CHAT.min || len > CHAT.max) return fail('dr_bad');
  const now = env.now;
  const playing = s.phase === P.PICK || s.phase === P.DRAW;
  if (playing && s.cur && s.cur.drawerId === id) return fail('dr_drawer_mute');
  if (!chatRateOk(p, now)) return fail('dr_chat_fast');
  const fx = newFx();
  const cur = s.cur;
  const hitIds = cur ? cur.hits.map((h) => h.id) : [];
  const correct = s.phase === P.DRAW && cur && cur.entry && !hitIds.includes(id) && isCorrect(stripMark(t), cur.entry);
  if (correct) {
    p.chatTs.push(now);
    const order = cur.hits.length + 1;
    const pts = guesserPointsAt({ endsAtMs: s.endsAt, nowMs: now, totalSec: s.settings.time, order }); // 단축 전 끝 시각 기준
    cur.hits.push({ id, pts, order });
    p.hit = true;
    if (order === 1) {
      const shortened = now + ms(TIMES.rush);
      if (shortened < s.endsAt) { s.endsAt = shortened; s.rushed = true; }
    }
    emit(s, fx, { k: 'drHit', id, order });
    roomAll(s, fx);
    checkAllHit(s, env, fx);
    return fx;
  }
  p.chatTs.push(now);
  const e = { k: 'chat', id, name: p.name, text: t, ts: now };
  const secret = s.phase === P.DRAW && hitIds.includes(id);
  const item = { id, name: p.name, text: t, ts: now, q: s.q };
  if (secret) {
    e.sec = 1; item.sec = 1;
    const to = connectedIds(s).filter((x) => hitIds.includes(x) || x === cur.drawerId);
    emit(s, fx, e, to);
  } else {
    emit(s, fx, e);
  }
  s.chatLog.push(item);
  if (s.chatLog.length > CHAT.recent) s.chatLog.splice(0, s.chatLog.length - CHAT.recent);
  return fx;
}

/** 입장·재접속 때 주는 최근 기록. 지금 문제를 못 맞힌 사람에게는 이번 문제의 정답자끼리 글(sec)을 뺀다. */
export function chatLogFor(s, id) {
  const p = findP(s, id);
  const playing = s.phase === P.PICK || s.phase === P.DRAW;
  const blind = playing && s.cur && s.cur.drawerId !== id && !(p && p.hit);
  return s.chatLog
    .filter((it) => !(it.sec && blind && it.q === s.q))
    .map(({ q, ...rest }) => ({ ...rest }));
}

/**
 * 이모티콘·사운드 허용 확인 (10-6). kind = 'basic'(기본 이모티콘) | 'media'(사진 이모티콘·사운드).
 * 허용이면 {ok:true}, 아니면 fail 객체(code 포함).
 */
export function mediaCheck(s, id, kind) {
  const p = findP(s, id);
  if (!p) return fail('dr_bad');
  if (s.phase === P.PICK || s.phase === P.DRAW) {
    if (s.cur && s.cur.drawerId === id) return fail('dr_drawer_mute');
    if (s.phase === P.DRAW && p.hit && kind !== 'basic') return fail('dr_hit_media');
  }
  return newFx();
}

// ---------- 시간 ----------

/** 다음에 tick 을 불러야 하는 시각(ms). 없으면 null. 호출자는 이 시각에 타이머를 건다. */
export function nextDeadline(s) {
  const t = [];
  if (s.endsAt != null && (s.phase === P.PICK || s.phase === P.DRAW || s.phase === P.REVEAL)) t.push(s.endsAt);
  const cur = s.cur;
  if (cur && s.phase === P.DRAW && !cur.inked) t.push(cur.startAt + ms(TIMES.idle));
  if (cur && (s.phase === P.PICK || s.phase === P.DRAW)) {
    const d = findP(s, cur.drawerId);
    if (d && !d.connected) t.push(d.awaySince + ms(TIMES.drawerAway));
  }
  for (const p of s.players) if (!p.connected) t.push(p.awaySince + ms(TIMES.seatKeep));
  return t.length ? Math.min(...t) : null;
}

/** 시간 진행. 그동안 일어난 일을 모은 fx 하나를 돌려준다 (fx.room 은 마지막 상태 기준 전원, events 는 순서대로). */
export function tick(s, now, env = {}) {
  const e = { ...env, now };
  const fx = newFx();
  const merge = (f) => {
    fx.events.push(...f.events);
    fx.use.push(...f.use);
    fx.kicked.push(...f.kicked);
    if (f.finished) fx.finished = f.finished;
    for (const id of f.room) if (!fx.room.includes(id)) fx.room.push(id);
  };
  for (let guard = 0; guard < 100; guard++) {
    const f = newFx();
    if (!step(s, e, f)) break;
    merge(f);
  }
  fx.room = fx.room.filter((id) => findP(s, id)?.connected);
  return fx;
}

// 한 걸음: 일이 있었으면 true
function step(s, env, fx) {
  const now = env.now;
  // 자리 유지 시간이 지난 끊긴 사람은 나간 것으로
  const gone = s.players.find((p) => !p.connected && now >= p.awaySince + ms(TIMES.seatKeep));
  if (gone) {
    const f = leave(s, gone.id, env);
    Object.assign(fx, { events: f.events, room: f.room, use: f.use, finished: f.finished });
    return true;
  }
  if (s.phase === P.PICK || s.phase === P.DRAW) {
    const d = findP(s, s.cur.drawerId);
    if (d && !d.connected && now >= d.awaySince + ms(TIMES.drawerAway)) { finishQuestion(s, 'left', env, fx); return true; }
  }
  if (s.phase === P.PICK) {
    if (now >= s.endsAt) { choose(s, 0, env, fx); return true; }
    return false;
  }
  if (s.phase === P.DRAW) {
    if (now >= s.endsAt) { finishQuestion(s, 'time', env, fx); return true; }
    if (!s.cur.inked && now >= s.cur.startAt + ms(TIMES.idle)) { finishQuestion(s, 'idle', env, fx); return true; }
    return false;
  }
  if (s.phase === P.REVEAL) {
    if (now >= s.endsAt) { executeNext(s, env, fx); return true; }
  }
  return false;
}

// ---------- 받는 사람 시점 ----------

/** 10-4 room.state 를 id 의 시점으로 만든다. ★ word·choices 는 GDD 9절 규칙대로만 넣는다. */
export function viewFor(s, id) {
  const playing = s.phase === P.PICK || s.phase === P.DRAW;
  const timed = playing || s.phase === P.REVEAL;
  const me = findP(s, id);
  const cur = s.cur;
  const isDrawer = !!cur && cur.drawerId === id && s.phase !== P.LOBBY && s.phase !== P.FINAL;
  const iHit = !!me && !!me.hit && s.phase === P.DRAW;

  let word = null;
  if (cur && cur.entry) {
    if (s.phase === P.REVEAL) word = s.reveal ? s.reveal.word : cur.entry.w;
    else if (s.phase === P.DRAW && (isDrawer || iHit)) word = cur.entry.w;
  }
  const choices = (s.phase === P.PICK && isDrawer && cur) ? cur.cands.map((c) => ({ w: c.w, topic: c.topic })) : null;

  const mask = (s.phase === P.DRAW && cur && cur.entry && s.settings.len) ? makeMask(cur.entry.w) : null;

  return {
    code: s.code,
    mode: 'draw',
    hostId: s.hostId,
    you: id,
    phase: s.phase,
    settings: {
      order: s.settings.order, rounds: s.settings.rounds, time: s.settings.time, len: s.settings.len,
      topics: s.settings.topics.slice(), allTopics: s.settings.allTopics.slice(),
    },
    players: bySeat(s).map((p) => ({
      id: p.id, name: p.name, seat: p.seat, connected: p.connected,
      score: p.score, correct: p.correct,
      hit: playing ? !!p.hit : false,
      drew: !!p.drew,
    })),
    roundNo: s.roundNo, q: s.q, qTotal: s.qTotal,
    drawerId: timed && cur ? cur.drawerId : null,
    endsAt: timed ? s.endsAt : null,
    rushed: s.phase === P.DRAW ? s.rushed : false,
    mask,
    word,
    choices,
    canUndo: isDrawer && s.phase === P.DRAW ? s.canUndo : false,
    canRedo: isDrawer && s.phase === P.DRAW ? s.canRedo : false,
    reveal: s.phase === P.REVEAL && s.reveal ? {
      word: s.reveal.word, why: s.reveal.why,
      gains: s.reveal.gains.map((g) => ({ ...g })),
      drawerPts: s.reveal.drawerPts, guessers: s.reveal.guessers, nextId: s.reveal.nextId,
    } : null,
    ranking: s.phase === P.FINAL && s.ranking ? s.ranking.map((r) => ({ ...r })) : null,
  };
}
