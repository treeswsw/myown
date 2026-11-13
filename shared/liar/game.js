// 라이어게임 규칙 엔진 (PLAN 1-7). 통신·시간·난수를 모르는 순수 함수 모음.
//  - 시간은 모두 인자 `now`(ms)로 받는다. Date.now 를 쓰지 않는다.
//  - 난수는 `rng(n)`(0..n-1 정수)로 받는다. 기본값은 crypto 기반이며 Math.random 은 쓰지 않는다.
//  - game 은 일반 객체다. 직접 읽지 말고 viewFor 로만 화면에 내보낸다(비밀 유지의 유일한 문).
// 범위: reveal → speak → discuss → revote → defense → judge → judged → (살림: discuss 반복 / 처형: unmask)
//       → guess → answer(정답 공개 연출) → result, 점수(score), end, away/back/drop(끊김·돌아옴·빠짐. 60초는 방이 잰다).

import {
  PHASES as P, MIN_PLAYERS, DEFAULT_TIMES, FIXED_TIMES, LIMITS,
  DISCUSS_FLOOR, SHORTEN_TO, LIAR_MODES, SPEAK_HOLD,
} from './constants.js';

const ms = (sec) => sec * 1000;

// ---------- 난수 ----------

// 안전한 난수 0..n-1 (crypto, 치우침 없는 거절 추출). 브라우저와 node 20+ 모두 globalThis.crypto 가 있다.
export function defaultRng(n) {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError('rng 범위 오류');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

function pick(rng, n) {
  const v = rng(n);
  if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError('rng 가 범위 밖의 값을 돌려줌');
  return v;
}

// 피셔-예이츠. 원본을 바꾸지 않는다.
function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 만들기 ----------

// 난수 사용 순서(시험이 정해진 순서를 주입할 수 있도록 고정):
//   ① 라이어 = rng(인원)  ② 발언 순서 = 섞기  ③ 자리 = 섞기(순서와 따로)
export function createGame({ players, settings = {}, draw, rng = defaultRng, now, round = 1 }) {
  if (!Array.isArray(players) || new Set(players).size !== players.length) throw new Error('players 오류');
  if (players.length < MIN_PLAYERS) throw new Error('3명 이상이어야 합니다');
  if (!Number.isFinite(now)) throw new Error('now 가 필요합니다');
  const liarMode = settings.liarMode ?? 'word';
  if (!LIAR_MODES.includes(liarMode)) throw new Error('liarMode 오류');
  if (!draw || typeof draw.citizenWord !== 'string' || !draw.citizenWord) throw new Error('draw 오류');
  if (liarMode === 'word' && (typeof draw.liarWord !== 'string' || !draw.liarWord)) throw new Error('draw.liarWord 가 필요합니다');

  const times = { ...DEFAULT_TIMES };
  for (const k of Object.keys(DEFAULT_TIMES)) {
    const v = settings.times?.[k];
    if (Number.isFinite(v) && v > 0) times[k] = v;
  }

  const liarId = players[pick(rng, players.length)];
  const order = shuffle(players, rng);
  const seatOrder = shuffle(players, rng);
  const seats = {};
  seatOrder.forEach((id, i) => { seats[id] = i; });
  const firstSays = {};
  for (const id of players) firstSays[id] = { text: null, late: false };

  return {
    liarMode, times, round,
    players: players.slice(), order, seats, liarId,
    topic: draw.topic ?? null,
    citizenWord: draw.citizenWord,
    liarWord: liarMode === 'word' ? draw.liarWord : null,
    phase: P.REVEAL,
    phaseStartedAt: now,
    phaseEndsAt: now + ms(FIXED_TIMES.reveal),
    accuseNo: 1,
    speakerIdx: -1,
    speakHold: false,   // 차례인 사람이 첫 설명을 쓴 뒤 SPEAK_HOLD 초 동안 그 사람에 머무는 중
    firstSays,
    votes: {},
    candidates: null,
    accused: null,
    tally: null,
    unmask: null,
    judge: null,        // { picks, executed } — judge 단계부터. 살리면 비운다
    firstVotes: null,   // 재투표로 넘어간 첫 투표(이 지목의 voteLog 줄에 남긴다)
    guess: null,        // { text, correct } — 제출되거나 시간이 끝난 뒤
    pendingOutcome: null, // answer 단계 동안 쥐고 있다가 끝나면 finish 로 넘길 결과 사실
    outcome: null,      // result 로 넘어갈 때의 결과 사실(score 가 읽는다)
    result: null,
    failReason: null,   // 'tie' | 'noVotes' (지목 실패 때)
    away: [],           // 다음 과제(away/back): 끊긴 사람. 첫 설명 차례에서 건너뛴다
    dropped: [],        // 다음 과제(drop): 판에서 빠진 사람
    shortened: false,
    pendingShortenAt: null,
    voteLog: [],
  };
}

// ---------- 내부 도우미 ----------

const active = (g) => g.players.filter((id) => !g.dropped.includes(id));
const isActive = (g, id) => g.players.includes(id) && !g.dropped.includes(id);
const speakerOf = (g) => (g.phase === P.SPEAK ? g.order[g.speakerIdx] ?? null : null);

function enter(g, phase, now, seconds, events) {
  g.phase = phase;
  g.phaseStartedAt = now;
  g.phaseEndsAt = now + ms(seconds);
  g.shortened = false;
  g.pendingShortenAt = null;
  events.push({ k: 'phase', phase, round: g.round, accuseNo: g.accuseNo });
}

function cleanText(text, max) {
  if (typeof text !== 'string') return { error: '글을 입력해 주세요.' };
  const t = text.trim();
  if (!t) return { error: '글을 입력해 주세요.' };
  if (/[\r\n]/.test(t)) return { error: '한 줄만 쓸 수 있습니다.' };
  if ([...t].length > max) return { error: `${max}자까지 쓸 수 있습니다.` };
  return { text: t };
}

function startSpeak(g, now, events) {
  g.speakerIdx = -1;
  enter(g, P.SPEAK, now, g.times.speak, events);
  nextSpeaker(g, now, events);
}

// 다음 차례로. away/빠진 사람은 건너뛴다(빈 채로 남아 나중에 추가할 수 있다). 다 돌았으면 토론·투표.
function nextSpeaker(g, now, events) {
  g.speakHold = false;
  do { g.speakerIdx++; }
  while (g.speakerIdx < g.order.length &&
         (g.away.includes(g.order[g.speakerIdx]) || g.dropped.includes(g.order[g.speakerIdx])));
  if (g.speakerIdx >= g.order.length) {
    g.speakerIdx = g.order.length;
    startDiscuss(g, now, events);
    return;
  }
  g.phaseStartedAt = now;
  g.phaseEndsAt = now + ms(g.times.speak);
  events.push({ k: 'turn', id: g.order[g.speakerIdx] });
}

function startDiscuss(g, now, events) {
  g.votes = {};
  g.candidates = null;
  g.firstVotes = null;
  enter(g, P.DISCUSS, now, g.accuseNo === 1 ? g.times.discuss : g.times.rediscuss, events);
}

function startRevote(g, now, events, leaders) {
  g.firstVotes = { ...g.votes };
  g.votes = {};
  g.candidates = g.order.filter((id) => leaders.includes(id));
  enter(g, P.REVOTE, now, FIXED_TIMES.revote, events);
}

// 끊긴 사람은 "전원"에서 뺀다(끊기기 전에 한 표는 그대로 유효)
const allVoted = (g) => active(g).filter((id) => !g.away.includes(id)).every((id) => g.votes[id] != null);
// 찬반을 고를 수 있는 사람: 지목된 사람을 뺀 판 참가자(끊긴 사람은 "전원"에서 뺀다)
const judgeVoters = (g) => active(g).filter((id) => id !== g.accused);
const allJudged = (g) => judgeVoters(g).filter((id) => !g.away.includes(id)).every((id) => g.judge.picks[id] != null);

// 전원이 찍었으면 끝나는 시각을 지금 + 5초로 줄인다. 첫 토론·투표는 DISCUSS_FLOOR 가 지난 뒤부터.
function refreshShorten(g, now) {
  if (g.phase === P.JUDGE) {   // 찬반: 보장 시간 없이 전원이 고르면 바로 5초
    if (g.shortened || !allJudged(g)) return;
    g.shortened = true;
    g.phaseEndsAt = Math.min(g.phaseEndsAt, now + ms(SHORTEN_TO));
    return;
  }
  if (g.shortened || (g.phase !== P.DISCUSS && g.phase !== P.REVOTE)) return;
  if (!allVoted(g)) { g.pendingShortenAt = null; return; }
  const floorAt = g.phase === P.DISCUSS && g.accuseNo === 1 ? g.phaseStartedAt + ms(DISCUSS_FLOOR) : 0;
  if (now < floorAt) { g.pendingShortenAt = floorAt; return; }
  g.shortened = true;
  g.pendingShortenAt = null;
  g.phaseEndsAt = Math.min(g.phaseEndsAt, now + ms(SHORTEN_TO));
}

// 시간이 끝난 토론·투표/재투표 판정
function decideAccusation(g, now, events) {
  const tally = {};
  for (const id of active(g)) {
    const to = g.votes[id];
    if (to != null) tally[to] = (tally[to] || 0) + 1;
  }
  const entries = Object.entries(tally);
  const top = entries.length ? Math.max(...entries.map(([, n]) => n)) : 0;
  const leaders = entries.filter(([, n]) => n === top).map(([id]) => id);
  const log = {
    no: g.accuseNo, stage: g.phase, votes: { ...g.votes }, firstVotes: g.phase === P.REVOTE ? g.firstVotes : null,
    tally, accused: null, picks: {}, executed: null,
  };

  if (!leaders.length) return failAccusation(g, now, events, 'noVotes', log);
  if (leaders.length === 1) {
    log.accused = leaders[0];
    g.voteLog.push(log);
    g.accused = leaders[0];
    g.tally = tally;
    events.push({ k: 'accused', id: leaders[0], tally });
    enter(g, P.DEFENSE, now, g.times.defense, events);
    if (g.away.includes(g.accused)) startJudge(g, now, events);   // 끊긴 채면 변론 없이 바로 찬반
    return undefined;
  }
  if (g.phase === P.DISCUSS) { startRevote(g, now, events, leaders); return undefined; }
  return failAccusation(g, now, events, 'tie', log);
}

// 지목 실패: 처형 없이 라이어 공개만(unmask{id:null}). 이어서 guess.
function failAccusation(g, now, events, reason, log) {
  g.voteLog.push(log);
  g.failReason = reason;
  g.accused = null;
  g.unmask = { id: null, wasLiar: null, liarId: g.liarId };
  enter(g, P.UNMASK, now, FIXED_TIMES.unmaskFail, events);
  events.push({ k: 'unmask', ...g.unmask });
}

// 끝난 단계를 하나 넘긴다. 더 넘길 수 없으면(다음 과제 단계) false.
function stepExpired(g, now, events) {
  switch (g.phase) {
    case P.REVEAL: startSpeak(g, now, events); return true;
    case P.SPEAK: nextSpeaker(g, now, events); return true;
    case P.DISCUSS:
    case P.REVOTE: decideAccusation(g, now, events); return true;
    case P.DEFENSE: startJudge(g, now, events); return true;
    case P.JUDGE: endJudge(g, now, events); return true;
    case P.JUDGED: afterJudged(g, now, events); return true;
    case P.UNMASK: startGuess(g, now, events); return true;
    case P.GUESS: finishGuess(g, now, events, null, false); return true;
    case P.ANSWER: finish(g, now, events, g.pendingOutcome); return true;
    default: return false;   // result(끝난 판)
  }
}

// ---------- 변론 이후 ----------

function startJudge(g, now, events) {
  g.judge = { picks: {}, executed: null };
  enter(g, P.JUDGE, now, g.times.judge, events);
}

// 찬반 마감: yes 수 > no 수면 처형. 안 고른 사람은 기권(어느 쪽에도 안 넣음). 동수·전원 기권은 살림.
function endJudge(g, now, events) {
  const voters = judgeVoters(g);
  const yes = voters.filter((id) => g.judge.picks[id] === 'yes').length;
  const no = voters.filter((id) => g.judge.picks[id] === 'no').length;
  const executed = yes > no;
  g.judge.executed = executed;
  const log = g.voteLog[g.voteLog.length - 1];
  log.picks = { ...g.judge.picks };
  log.executed = executed;
  enter(g, P.JUDGED, now, FIXED_TIMES.judged, events);
  events.push({ k: 'judged', picks: { ...g.judge.picks }, executed });
}

function afterJudged(g, now, events) {
  if (!g.judge.executed) {              // 살림: 지목 횟수 +1, 바로 다시 토론·투표
    g.accuseNo += 1;
    g.accused = null;
    g.tally = null;
    g.judge = null;
    startDiscuss(g, now, events);
    return;
  }
  const wasLiar = g.accused === g.liarId;
  g.unmask = { id: g.accused, wasLiar, liarId: g.liarId };
  enter(g, P.UNMASK, now, wasLiar ? FIXED_TIMES.unmaskLiar : FIXED_TIMES.unmaskCitizen, events);
  events.push({ k: 'unmask', ...g.unmask });
}

function startGuess(g, now, events) {
  enter(g, P.GUESS, now, g.times.guess, events);
}

// 제출 또는 guess 시간 끝: 답을 기록하고 answer(정답 공개 연출)로. 점수·result 는 answer 가 끝난 뒤.
// immediate: 라이어가 unmask·guess 중에 빠짐 — 연출 없이 바로 result.
function finishGuess(g, now, events, text, correct, immediate = false) {
  g.guess = { text, correct };
  events.push({ k: 'guess', text, correct });
  const caught = g.unmask?.id != null ? g.unmask.wasLiar : false;
  const reason = g.unmask?.id == null ? g.failReason
    : (g.unmask.wasLiar ? 'executedLiar' : 'executedCitizen');
  const outcome = { void: false, caught, guessed: correct, reason };
  if (immediate) { finish(g, now, events, outcome); return; }
  g.pendingOutcome = outcome;
  enter(g, P.ANSWER, now, g.liarMode === 'word' ? FIXED_TIMES.answer : FIXED_TIMES.answerNotice, events);
}

// result 로. outcome 은 score 가 읽는 사실.
function finish(g, now, events, outcome) {
  g.outcome = outcome;
  g.pendingOutcome = null;
  enter(g, P.RESULT, now, 0, events);
  g.phaseEndsAt = null;
  g.shortened = false;
  const delta = score(g);
  const winner = outcome.void ? 'void'
    : (outcome.reason === 'liarLeft' || (outcome.caught && !outcome.guessed) ? 'citizens' : 'liar');
  g.result = {
    winner,
    caught: outcome.void ? null : outcome.caught,
    guessed: outcome.void ? null : outcome.guessed,
    reason: outcome.reason,
    liarId: g.liarId,
    citizenWord: g.citizenWord,
    liarWord: g.liarWord,
    voteLog: g.voteLog.map(({ no, votes, firstVotes, accused, picks, executed }) =>
      ({ no, votes: { ...votes }, firstVotes: firstVotes ? { ...firstVotes } : null, accused, picks: { ...picks }, executed })),
    delta,
    champions: null,   // 방이 채운다
  };
}

// ---------- tick ----------

export function tick(g, now) {
  const events = [];
  for (let guard = 0; guard < 100; guard++) {
    if (g.phase === P.RESULT) break;
    // 예약된 단축은 예약 시각 기준으로 처리한다(tick 이 늦게 와도 끝나는 시각 = 30초 + 5초)
    if (g.pendingShortenAt != null && now >= g.pendingShortenAt) refreshShorten(g, g.pendingShortenAt);
    if (now < g.phaseEndsAt) break;
    if (!stepExpired(g, now, events)) break;
  }
  return { events };
}

// 방이 다음에 tick 을 불러야 할 시각. 단계 끝 외에 "첫 토론 30초 뒤 단축"이 있어 따로 알려 준다.
export function wakeAt(g) {
  if (g.phase === P.RESULT || g.phaseEndsAt == null) return null;
  if (g.pendingShortenAt != null) return Math.min(g.pendingShortenAt, g.phaseEndsAt);
  return g.phaseEndsAt;
}

// ---------- act ----------

const fail = (error) => ({ ok: false, error, events: [] });

export function act(g, action, now) {
  if (!action || typeof action !== 'object') return fail('잘못된 요청입니다.');
  const pre = tick(g, now).events;   // 마감이 지났는데 아직 tick 이 안 왔으면 먼저 넘긴다
  let res;
  switch (action.type) {
    case 'say': res = actSay(g, action, now); break;
    case 'vote': res = actVote(g, action, now); break;
    case 'judge': res = actJudge(g, action, now); break;
    case 'guess': res = actGuess(g, action, now); break;
    case 'end': res = actEnd(g, now); break;
    case 'away': res = actAway(g, action, now); break;
    case 'back': res = actBack(g, action, now); break;
    case 'drop': res = actDrop(g, action, now); break;
    default: res = fail('지금은 할 수 없습니다.');
  }
  res.events = [...pre, ...res.events];
  return res;
}

function actSay(g, { by, text }, now) {
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  const lateOk = g.phase === P.SPEAK ||
    (g.accuseNo === 1 && (g.phase === P.DISCUSS || g.phase === P.REVOTE));
  if (!lateOk) return fail('지금은 첫 설명을 쓸 수 없습니다.');
  const c = cleanText(text, LIMITS.say);
  if (c.error) return fail(c.error);
  const mine = g.firstSays[by];

  if (g.phase === P.SPEAK && g.speakHold) return fail('곧 다음 차례로 넘어갑니다.');
  if (g.phase === P.SPEAK && speakerOf(g) === by) {          // 차례인 사람: 기록하고 SPEAK_HOLD 초 머문 뒤 다음 차례
    mine.text = c.text;
    g.speakHold = true;
    g.phaseEndsAt = now + ms(SPEAK_HOLD);
    return { ok: true, events: [{ k: 'chat', id: by, text: c.text, ts: now, kind: 'say' }] };
  }
  if (mine.text != null) return fail('이미 첫 설명을 썼습니다.');
  if (g.phase === P.SPEAK && g.order.indexOf(by) > g.speakerIdx) return fail('아직 차례가 아닙니다.');
  mine.text = c.text;                                         // 늦은 추가: 차례·시각은 그대로
  mine.late = true;
  return { ok: true, events: [{ k: 'chat', id: by, text: c.text, ts: now, kind: 'late' }] };
}

function actVote(g, { by, target }, now) {
  if (g.phase !== P.DISCUSS && g.phase !== P.REVOTE) return fail('지금은 투표할 수 없습니다.');
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  if (target != null) {
    if (typeof target !== 'string' || !isActive(g, target)) return fail('없는 사람입니다.');
    if (target === by) return fail('자기 자신은 찍을 수 없습니다.');
    if (g.phase === P.REVOTE && !g.candidates.includes(target)) return fail('후보가 아닙니다.');
  }
  const prev = g.votes[by] ?? null;
  const to = target == null || target === prev ? null : target;   // 같은 사람을 다시 누르면 취소
  if (to === prev) return { ok: true, events: [] };
  if (to == null) delete g.votes[by]; else g.votes[by] = to;
  refreshShorten(g, now);
  return { ok: true, events: [{ k: 'vote', from: by, to, prev }] };
}

function actJudge(g, { by, v }, now) {
  if (g.phase !== P.JUDGE) return fail('지금은 찬반을 고를 수 없습니다.');
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  if (by === g.accused) return fail('지목된 사람은 고를 수 없습니다.');
  if (v !== 'yes' && v !== 'no') return fail('맞다 또는 아니다만 고를 수 있습니다.');
  const prev = g.judge.picks[by] ?? null;
  if (prev === v) return { ok: true, events: [] };
  g.judge.picks[by] = v;
  refreshShorten(g, now);
  return { ok: true, events: [{ k: 'judge', id: by, v, prev }] };
}

// correct 는 방이 단어 채점을 해서 넘긴다(엔진은 채점을 모른다)
function actGuess(g, { by, text, correct }, now) {
  if (g.phase !== P.GUESS) return fail('지금은 정답을 맞힐 수 없습니다.');
  if (by !== g.liarId || !isActive(g, by)) return fail('라이어만 정답을 맞힐 수 있습니다.');
  if (g.guess) return fail('정답은 한 번만 낼 수 있습니다.');
  const c = cleanText(text, LIMITS.guess);
  if (c.error) return fail(c.error);
  const events = [];
  finishGuess(g, now, events, c.text, correct === true);
  return { ok: true, events };
}

// ---------- 끊김·돌아옴·빠짐 (60초 재기는 방이 한다) ----------

function actAway(g, { by }, now) {
  if (g.phase === P.RESULT) return fail('이미 끝난 판입니다.');
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  if (g.away.includes(by)) return { ok: true, events: [] };
  g.away.push(by);
  const events = [];
  if (speakerOf(g) === by) nextSpeaker(g, now, events);   // 지금 차례인 사람이 끊기면 바로 다음 차례
  else refreshShorten(g, now);                              // "전원" 계산이 바뀜
  return { ok: true, events };
}

function actBack(g, { by }, now) {
  if (g.phase === P.RESULT) return fail('이미 끝난 판입니다.');
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  if (!g.away.includes(by)) return { ok: true, events: [] };
  g.away = g.away.filter((id) => id !== by);
  refreshShorten(g, now);   // 이미 줄어든 시간은 되돌리지 않는다. 예약된 단축만 다시 계산
  return { ok: true, events: [] };
}

function actDrop(g, { by }, now) {
  if (g.phase === P.RESULT) return fail('이미 끝난 판입니다.');
  if (!isActive(g, by)) return fail('이 판의 참가자가 아닙니다.');
  const events = [];
  const wasSpeaker = speakerOf(g) === by;
  g.dropped.push(by);
  g.away = g.away.filter((id) => id !== by);
  // 그 사람이 한 표와 그 사람을 찍은 표를 지운다
  for (const votes of [g.votes, g.firstVotes]) {
    if (!votes) continue;
    delete votes[by];
    for (const k of Object.keys(votes)) if (votes[k] === by) delete votes[k];
  }
  if (g.judge) delete g.judge.picks[by];
  if (g.candidates) g.candidates = g.candidates.filter((id) => id !== by);

  if (g.phase === P.ANSWER) return { ok: true, events };   // 정답 공개 중: 무효·끝내기 없이 끝까지 보여 준다(빠진 사람 점수는 0)
  if (by === g.liarId) {
    if (g.phase === P.UNMASK || g.phase === P.GUESS) {   // 정체 공개 뒤: 오답으로 바로 결과(연출 없음)
      finishGuess(g, now, events, null, false, true);
    } else {
      finish(g, now, events, { void: false, caught: null, guessed: null, reason: 'liarLeft' });
    }
    return { ok: true, events };
  }
  if (active(g).length < MIN_PLAYERS) {
    finish(g, now, events, { void: true, caught: null, guessed: null, reason: 'tooFew' });
    return { ok: true, events };
  }
  if (by === g.accused && (g.phase === P.DEFENSE || g.phase === P.JUDGE || g.phase === P.JUDGED)) {
    // 지목된 시민이 빠짐: 그 지목을 취소하고 지목 횟수는 그대로 다시 토론·투표
    g.voteLog.pop();
    g.accused = null;
    g.tally = null;
    g.judge = null;
    g.votes = {};
    g.firstVotes = null;
    g.candidates = null;
    enter(g, P.DISCUSS, now, g.times.rediscuss, events);
    return { ok: true, events };
  }
  if (wasSpeaker) nextSpeaker(g, now, events);
  else refreshShorten(g, now);
  return { ok: true, events };
}

// 방장 확인은 방이 한다. 어느 단계든 무효 판으로 끝낸다(이미 끝난 판은 거절).
function actEnd(g, now) {
  if (g.phase === P.RESULT) return fail('이미 끝난 판입니다.');
  const events = [];
  finish(g, now, events, { void: true, caught: null, guessed: null, reason: 'hostEnded' });
  return { ok: true, events };
}

// ---------- viewFor (받는 사람 시점, GDD 9-3 의 판 진행 부분) ----------
// 키 이름·순서·개수는 누구에게나 같다. 달라지는 것은 my 의 값뿐. ('word' 방식의 비밀 유지)

export function viewFor(g, playerId) {
  const mine = isActive(g, playerId);   // 빠진 사람은 관전자처럼
  const isLiar = mine && playerId === g.liarId;
  const revealed = g.phase === P.UNMASK || g.phase === P.GUESS || g.phase === P.ANSWER || g.phase === P.RESULT;
  const showWords = g.phase === P.ANSWER || g.phase === P.RESULT;
  let word = null;
  let role = null;
  if (mine) {
    if (g.liarMode === 'word') {
      word = isLiar ? g.liarWord : g.citizenWord;
      role = revealed ? (isLiar ? 'liar' : 'citizen') : null;
    } else {
      word = isLiar ? null : g.citizenWord;
      role = isLiar ? 'liar' : 'citizen';
    }
  }
  const shown = g.phase === P.REVEAL ? 0
    : g.phase === P.SPEAK ? g.speakerIdx + 1 : g.order.length;
  return {
    phase: g.phase,
    phaseEndsAt: g.phaseEndsAt,
    round: g.round,
    seats: { ...g.seats },
    topic: g.topic,
    my: { word, role },
    order: g.order.slice(),
    speaker: speakerOf(g),
    speakDone: g.phase === P.SPEAK && g.speakHold,   // 차례인 사람이 이미 썼다(곧 다음 차례). 모두에게 같다
    firstSays: g.order.slice(0, shown).map((id) => ({ id, text: g.firstSays[id].text, late: g.firstSays[id].late })),
    votes: { ...g.votes },
    candidates: g.candidates ? g.candidates.slice() : null,
    accuseNo: g.accuseNo,
    accused: g.accused,
    judge: g.judge ? { picks: { ...g.judge.picks }, executed: g.judge.executed } : null,
    unmask: g.unmask ? { ...g.unmask } : null,
    guess: g.guess ? { ...g.guess } : null,
    words: showWords ? { citizen: g.citizenWord, liar: g.liarMode === 'word' ? g.liarWord : null } : null,
    result: g.result ? JSON.parse(JSON.stringify(g.result)) : null,
  };
}

// 점수 변화 (GDD 5-1, 스타 유즈맵 방식). 판이 끝나(outcome 이 정해지)면 의미가 있다. 끝나기 전·무효 판은 전원 0.
export function score(g) {
  const delta = {};
  for (const id of g.players) delta[id] = 0;
  const o = g.outcome;
  if (!o || o.void) return delta;
  if (o.reason === 'liarLeft') {   // 라이어가 정체 공개 전에 빠짐: 남은 시민 +1
    for (const id of active(g)) if (id !== g.liarId) delta[id] = 1;
    return delta;
  }
  // 라이어: 들킴+오답 0 / 들킴+정답 +1 / 안 들킴+오답 +1 / 안 들킴+정답 +3
  if (isActive(g, g.liarId)) delta[g.liarId] = o.caught ? (o.guessed ? 1 : 0) : (o.guessed ? 3 : 1);
  // 시민: 처형을 결정한 마지막 찬반의 표로. 지목 실패(찬반 없음)면 0
  const last = g.voteLog[g.voteLog.length - 1];
  if (last?.executed) {
    for (const id of active(g)) {
      if (id === g.liarId || id === last.accused) continue;
      const v = last.picks[id];
      if (v !== 'yes' && v !== 'no') continue;   // 기권 0점
      const yes = v === 'yes';
      delta[id] = o.reason === 'executedLiar' ? (yes ? 2 : 1) : (yes ? -1 : 0);
    }
  }
  return delta;
}
