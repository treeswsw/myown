// e2e 도우미 (T1a). 진짜 진행자 서버(host/server) + ws 접속으로 한 판을 몇 초에 돌린다.
// 실제 코드를 고치지 않고 "빠른 시계"만 hubOptions 로 넣는다:
//   now()           = t0 + (Date.now() - t0) * k
//   timers.setTimeout(fn, ms) = setTimeout(fn, ms / k)
// 서버는 시각과 대기 시간을 모두 이 시계로 재므로 "30초"는 실제로 30/k 초다. 화면(시험 클라이언트)은 시간을 재지 않는다.
// 이 파일은 T1b·T1c 도 읽어서 쓴다. 이름과 모양을 바꾸지 않는다.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../../../host/server/index.js';
import { createStore } from '../../../host/server/store.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 로그인 아이디 (2~12자, 소문자·숫자). 순서가 곧 방 참가 순서(첫 사람 = 방장).
export const NAMES = ['alpha', 'bravo', 'charl', 'delta', 'echo1', 'fox12', 'golf1', 'hotel'];

// 시간 설정을 고를 수 있는 최솟값으로 (GDD 4-2 표의 맨 앞 값)
export const MIN_TIMES = Object.freeze({ speak: 20, discuss: 60, rediscuss: 30, defense: 15, judge: 10, guess: 10 });

/**
 * 빠른 시계 서버. k = 몇 배 빠르게. timing 은 hub.timing 덮어쓰기(grace 등, 빠른 시계의 ms).
 * 돌려주는 것: { app, store, k, now, close() }
 */
export async function startFast({ k = 20, timing = {} } = {}) {
  const t0 = Date.now();
  const now = () => t0 + (Date.now() - t0) * k;
  const timers = { setTimeout: (fn, ms) => setTimeout(fn, ms / k).unref(), clearTimeout };
  const store = createStore();
  await store.init?.();
  const app = await startServer({ port: 0, store, hubOptions: { now, timers, timing } });
  return {
    app, store, k, now,
    async close() {
      await app.close();
      await store.close?.();
    },
  };
}

/**
 * 조건이 참이 될 때까지 기다린다(실제 시간 기준). 실패하면 이름과 받은 오류를 보여 준다.
 * opts: { timeout = 8000, clients = [] }
 */
export async function until(fn, what, { timeout = 8000, clients = [] } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) {
      const errs = clients.flatMap((c) => c.errors.map((e) => `${c.id}: ${e}`));
      assert.fail(`timeout: ${what}${errs.length ? ` (errors: ${errs.join(' | ')})` : ''}`);
    }
    await sleep(4);
  }
}

/**
 * 접속 하나. 받은 원본을 전부 기록한다.
 *   raw      받은 문자열 전부
 *   msgs     같은 순서로 JSON.parse 한 것
 *   state    마지막 room.state (방 밖이면 null)
 *   states   받은 room.state 전부(순서대로)
 *   events   받은 event.e 전부
 *   errors   받은 error 문장
 *   phaseLog 단계가 바뀔 때마다 { phase, accuseNo }
 *   me, lgRank 마지막으로 받은 것
 */
export async function client(app, id) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
  const c = {
    id, ws, raw: [], msgs: [], state: null, states: [], events: [], errors: [], phaseLog: [], me: null, lgRank: null,
    send: (obj) => ws.send(JSON.stringify(obj)),
    lg: (a, extra = {}) => ws.send(JSON.stringify({ t: 'lg', a, ...extra })),
    say: (text) => c.lg('say', { text }),
    vote: (target) => c.lg('vote', { target }),
    judge: (v) => c.lg('judge', { v }),
    guess: (text) => c.lg('guess', { text }),
    close: () => ws.close(),
  };
  ws.on('message', (d) => {
    const text = d.toString();
    const m = JSON.parse(text);
    c.raw.push(text);
    c.msgs.push(m);
    if (m.t === 'room') {
      c.state = m.state;
      c.states.push(m.state);
      const last = c.phaseLog.at(-1);
      if (m.state && (!last || last.phase !== m.state.phase || last.accuseNo !== m.state.accuseNo)) {
        c.phaseLog.push({ phase: m.state.phase, accuseNo: m.state.accuseNo });
      }
    } else if (m.t === 'event') c.events.push(m.e);
    else if (m.t === 'error') c.errors.push(m.msg);
    else if (m.t === 'me') c.me = m.user;
    else if (m.t === 'lgRank') c.lgRank = m;
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  c.send({ t: 'login', id });
  await until(() => c.me, `login ${id}`);
  return c;
}

/**
 * 서버 + n명 접속 + 한 명이 방을 만들고 나머지가 코드로 참가. 첫 사람이 방장.
 * 돌려주는 것: { fast, app, cs, host, code, close() } — close 는 접속과 서버를 닫는다.
 */
export async function roomN(n, { k = 20, timing } = {}) {
  assert.ok(n >= 1 && n <= NAMES.length, 'n 은 1~8');
  const fast = await startFast({ k, timing });
  const { app } = fast;
  const cs = [];
  for (const id of NAMES.slice(0, n)) cs.push(await client(app, id));
  const host = cs[0];
  host.send({ t: 'create', mode: 'liar' });
  await until(() => host.state?.code, 'create', { clients: cs });
  const code = host.state.code;
  for (const c of cs.slice(1)) c.send({ t: 'join', code });
  await until(() => cs.every((c) => c.state?.players?.length === n), 'join', { clients: cs });
  return {
    fast, app, cs, host, code,
    async close() {
      for (const c of cs) c.close();
      await fast.close();
    },
  };
}

export const room3 = (opts) => roomN(3, opts);

/** 방장이 시간 설정을 바꾸고 모두에게 반영될 때까지 기다린다. 기본은 전부 최솟값. */
export async function setTimes(r, over = {}) {
  const times = { ...MIN_TIMES, ...over };
  r.host.lg('settings', { times });
  await until(() => r.cs.every((c) => Object.entries(times).every(([key, v]) => c.state.settings.times[key] === v)),
    'settings.times', { clients: r.cs });
}

/** 방장이 설정을 바꾸고(예: { liarMode: 'notice' }) 반영될 때까지 기다린다. */
export async function setSettings(r, change) {
  r.host.lg('settings', change);
  const same = (s) => Object.entries(change).every(([key, v]) => (key === 'times' || key === 'topics' ? true : s[key] === v));
  await until(() => r.cs.every((c) => same(c.state.settings)), 'settings', { clients: r.cs });
}

/** 방장이 시작하고 모두 역할 공개(reveal) 단계에 들어올 때까지 기다린다. round = 기대하는 판 번호. */
export async function startRound(r, round = 1) {
  r.host.send({ t: 'start' });
  await until(() => r.cs.every((c) => c.state?.phase === 'reveal' && c.state.round === round), `reveal ${round}`, { clients: r.cs });
}

/**
 * 라이어 찾기(역할 공개 단계 이후, 정체 공개 전). 시험이 알아내는 방법이다 — 화면이 아니다.
 *  - 'notice' 방식: my.role === 'liar'
 *  - 'word' 방식: 혼자 다른 제시어를 받은 사람
 */
export function findLiar(cs) {
  if (cs[0].state.settings.liarMode === 'notice') {
    const liars = cs.filter((c) => c.state.my.role === 'liar');
    assert.equal(liars.length, 1, 'notice 방식: role 이 liar 인 사람은 정확히 한 명');
    return liars[0];
  }
  const count = new Map();
  for (const c of cs) count.set(c.state.my.word, (count.get(c.state.my.word) ?? 0) + 1);
  const odd = cs.filter((c) => count.get(c.state.my.word) === 1);
  assert.equal(odd.length, 1, `word 방식: 혼자 다른 제시어를 받은 사람은 정확히 한 명 (제시어 ${[...count.keys()].join(', ')})`);
  return odd[0];
}

/** 시민의 제시어(정답). 라이어가 아닌 아무 사람의 my.word. */
export function citizenWordOf(cs, liar) {
  const w = cs.find((c) => c !== liar).state.my.word;
  assert.equal(typeof w, 'string');
  return w;
}

/** 정답을 띄어쓰기만 바꿔서 입력할 글로. (한 글자 단어는 바꿀 수 없어 그대로) */
export function spaced(word) {
  const chars = [...word.replace(/\s+/g, '')];
  return chars.length >= 2 ? chars.join(' ') : word;
}

export const waitPhase = (r, phase, accuseNo) => until(
  () => r.cs.every((c) => c.state?.phase === phase && (accuseNo === undefined || c.state.accuseNo === accuseNo)),
  `phase ${phase}${accuseNo === undefined ? '' : `#${accuseNo}`}`, { clients: r.cs },
);

/** 첫 설명: 차례인 사람이 한 줄씩 보내 한 바퀴 돈다. 끝나면 speak 를 벗어난다. */
export async function speakAll(r) {
  await until(() => r.cs.every((c) => c.state?.phase === 'speak' && c.state.speaker), 'speak start', { clients: r.cs });
  for (let i = 0; i < r.cs.length + 1; i++) {
    const st = r.host.state;
    if (st.phase !== 'speak') break;
    const id = st.speaker;
    const sp = r.cs.find((c) => c.id === id);
    assert.ok(sp, `speaker ${id} 는 접속 중인 사람`);
    sp.say(`힌트${i + 1}`);
    await until(() => r.host.state.phase !== 'speak' || r.host.state.speaker !== id, `next speaker after ${id}`, { clients: r.cs });
  }
  await until(() => r.cs.every((c) => c.state.phase !== 'speak'), 'speak end', { clients: r.cs });
}

/** 투표를 한꺼번에: map = { 찍는 사람 id: 찍힌 사람 id | null }. 서버가 모두 반영할 때까지 기다린다. */
export async function voteMap(r, map) {
  const want = {};
  for (const [from, to] of Object.entries(map)) {
    r.cs.find((c) => c.id === from).vote(to);
    if (to !== null) want[from] = to;
  }
  await until(() => JSON.stringify(sortKeys(r.host.state.votes)) === JSON.stringify(sortKeys(want)), 'votes applied', { clients: r.cs });
}

/** 한 명(target)을 모두가 찍게 한다(target 본인은 target 이 아닌 다른 사람 하나). 첫 토론·투표라면 처음 phase 를 기다린 뒤. */
export async function accuse(r, targetId, accuseNo = 1) {
  await waitPhase(r, 'discuss', accuseNo);
  const other = r.cs.find((c) => c.id !== targetId).id;
  const map = {};
  for (const c of r.cs) map[c.id] = c.id === targetId ? other : targetId;
  await voteMap(r, map);
  await waitPhase(r, 'defense', accuseNo);
  assert.equal(r.host.state.accused, targetId);
}

/** 찬반: picks = { id: 'yes'|'no' } (빠진 사람은 안 고른 것). 변론이 끝나 judge 단계에 들어온 뒤 보낸다. */
export async function judgeMap(r, picks) {
  await until(() => r.cs.every((c) => c.state?.phase === 'judge'), 'phase judge', { clients: r.cs });
  for (const [id, v] of Object.entries(picks)) r.cs.find((c) => c.id === id).judge(v);
  await until(() => JSON.stringify(sortKeys(r.host.state.judge?.picks ?? {})) === JSON.stringify(sortKeys(picks)) ||
    r.host.state.phase !== 'judge', 'judge picks applied', { clients: r.cs });
}

function sortKeys(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** 결과 화면까지 기다린다. */
export const waitResult = (r) => until(() => r.cs.every((c) => c.state?.phase === 'result'), 'phase result', { clients: r.cs });

// ---- 비밀 유지 시험용 ----

/** c 가 받은 것 중 "정체 공개 전"까지의 인덱스 끝(포함 안 함). unmask 이벤트나 unmask 가 든 room 이 처음 나온 자리. */
export function preUnmaskEnd(c) {
  const i = c.msgs.findIndex((m) => (m.t === 'event' && m.e.k === 'unmask') ||
    (m.t === 'room' && m.state && (m.state.unmask !== null || ['unmask', 'guess', 'result'].includes(m.state.phase))));
  return i < 0 ? c.msgs.length : i;
}

/** 값을 빼고 모양(키 이름·순서·종류)만 남긴다. */
export function shape(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

/** 역할 공개(reveal) 이후부터 정체 공개 전까지 받은 원본 문자열들. */
export function rawFromRevealToUnmask(c) {
  const end = preUnmaskEnd(c);
  const start = c.msgs.findIndex((m) => m.t === 'room' && m.state?.phase === 'reveal');
  assert.ok(start >= 0, `${c.id}: reveal room 을 받았어야 함`);
  return c.raw.slice(start, end);
}
