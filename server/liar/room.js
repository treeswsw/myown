// 라이어게임 게임 훅 (GDD 4·5·9절, docs/COMMON-CONTRACT.md 1-4). 공용 방 틀(server/room/shell.js)이 쓴다.
// 멤버·방장·끊김 유예·강퇴·채팅 기록/속도·이모티콘·소리·faces(heldFaces)·빈 방 지우기·코인 지급 한 번은 Shell 이 맡는다.
// 이 파일은 규칙(shared/liar)·설정·점수책·전적·글/매체 허용 표(perms.js)만. 비밀 약속(CLAUDE.md 라이어 절)은 그대로:
// 시민 제시어(citizenEntry)·역할은 view 의 my 로만 그 사람에게 나가고, wait(설정 사본)에는 단어가 없다.

import { readFileSync } from 'node:fs';
import { COLORS, DEFAULT_TIMES, MAX_PLAYERS, TIME_CHOICES, GOAL_CHOICES, LIAR_MODES, SPEAK_ROUND_CHOICES, DEFAULT_SPEAK_ROUNDS } from '../../shared/liar/constants.js';
import { listTopics, drawWords, isCorrect } from '../../shared/liar/words.js';
import { createGame, tick, wakeAt, act, viewFor } from '../../shared/liar/game.js';
import { checkLg } from '../../shared/liar/protocol.js';
import { applyDelta, champions, unflushed, flushEntry, roundStats } from './scores.js';
import { chatBlocked, mediaBlocked, chatKind } from './perms.js';

export { MAX_PLAYERS };
// Word lists stay on the server; only topic names go into room state.
const WORDS = JSON.parse(readFileSync(new URL('./words.json', import.meta.url), 'utf8'));
const topicNames = (set) => listTopics(WORDS, set);
const topicsAllOn = (set) => topicNames(set).map((name) => ({ name, on: true }));
const WORD_SETS = Object.keys(WORDS.sets);
const TOPIC_MODES = ['random', 'host'];
// Size mark in front of a first-say text (`#` or `*`..`***`): stripped before the engine sees it.
// If nothing real is left after stripping, the original text stays.
const SIZE_MARK = /^(?:#|\*{1,3})\s*(?=\S)/;
export function stripSizeMark(text) {
  const out = text.replace(SIZE_MARK, '');
  return /[^\s#*]/u.test(out) ? out : text;
}

// hub.rng() is myown's crypto float in [0,1) (32-bit). The engine and drawWords want an unbiased int 0..n-1
// (PLAN 1-4 rng(n)), so turn the float back into its 32-bit value and reject the uneven tail.
export function intRng(rng) {
  return (n) => {
    const limit = Math.floor(2 ** 32 / n) * n;
    for (let i = 0; i < 64; i++) {
      const u = Math.floor(rng() * 2 ** 32);
      if (u < limit) return u % n;
    }
    return Math.min(n - 1, Math.floor(rng() * n));
  };
}

export const DEFAULT_SETTINGS = () => ({
  liarMode: 'word',
  times: { ...DEFAULT_TIMES },
  wordSet: 'mine',
  topicMode: 'random',
  topics: topicsAllOn('mine'),
  goal: 0,
  speakRounds: DEFAULT_SPEAK_ROUNDS,
  nextTopic: null,
});

export function makeLiarGame(ctx) {
  const { hub } = ctx;
  const err = (c, msg) => ctx.err(`lg_${c}`, msg);
  let phase = 'lobby';
  let round = 0;
  const settings = DEFAULT_SETTINGS();
  let game = null; // engine state; only ever leaves through viewFor
  let citizenEntry = null; // private: {w, alt} for grading guesses. Never in view/events/errors.
  let liarName = null; // GDD 9-3 result.liarName: written at round start, survives the liar leaving
  const scores = new Map(); // id -> {score, flushed}: the room's score book (R2b). Lives as long as the room.
  let settledGame = null; // the game object whose result is already booked (once per round)
  let won = false; // a champion exists: the next start pays out and resets the book
  const used = {}; // words already drawn in this room (drawWords updates it)
  let armed = false; // a game timer is pending
  const body = new Map(); // id -> mannequin slot 0..7 (kept while the player is in the room)

  const nameOf = (id) => ctx.member(id)?.session.user.name ?? '';

  // ---- permissions (GDD 4-4): perms.js decides, the room only feeds it ----

  // g = {phase, speaker, accused}
  function permG() {
    const g = game;
    if (!g) return { phase: 'lobby', speaker: null, accused: null };
    return { phase: g.phase, speaker: g.phase === 'speak' ? g.order[g.speakerIdx] ?? null : null, accused: g.accused };
  }

  // In the current round and not dropped out of it. (A player who left and came back stays a spectator until the round ends.)
  function inGame(id) {
    const g = game;
    return !!g && g.players.includes(id) && !g.dropped.includes(id);
  }

  const permWho = (id) => ({ id, spectating: game ? !inGame(id) : false });

  // ---- engine plumbing ----

  // Engine `chat` events get the speaker's name and go into the shared chat log (the engine does not know names).
  // They are sent as chat lines right away; every other event is returned for the caller's push.
  function engineEvents(events) {
    const out = [];
    for (const e of events) {
      if (e.k === 'chat') ctx.chatLine({ id: e.id, name: nameOf(e.id), text: e.text, ts: e.ts, kind: e.kind });
      else out.push(e);
    }
    return out;
  }

  // Tell the engine about away/back/drop. Only a running round (not the result) and only its participants.
  // Returns the engine events (already named) for the caller to send with its own push.
  function notifyEngine(type, id) {
    if (!game || game.phase === 'result' || !inGame(id)) return [];
    const r = act(game, { type, by: id }, hub.now());
    if (!r.ok) return [];
    const events = engineEvents(r.events);
    sync();
    arm();
    return events;
  }

  function sync() {
    phase = game ? game.phase : 'lobby';
    if (game && game.phase === 'result' && settledGame !== game) settle();
  }

  // The round just reached its result: book it exactly once (GDD 5). A void round books nothing and pays nothing.
  function settle() {
    const g = game;
    settledGame = g;
    const r = g.result;
    if (!r || r.winner === 'void') return;
    const book = {};
    for (const [id, e] of scores) book[id] = e.score;
    const next = applyDelta(book, r.delta);
    for (const id of Object.keys(next)) {
      const e = scores.get(id) ?? { score: 0, flushed: 0 };
      e.score = next[id];
      scores.set(id, e);
    }
    const stay = g.players.filter((id) => !g.dropped.includes(id));
    for (const [id, st] of Object.entries(roundStats(r, stay))) {
      const m = ctx.member(id);
      if (!m) continue;
      const user = m.session.user;
      user.stats ??= {};
      const l = (user.stats.liar ??= { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 });
      l.games += st.games; l.wins += st.wins; l.liarGames += st.liarGames; l.liarWins += st.liarWins;
      hub.persist(user);
      hub.sendMe(m.session);
    }
    const all = {};
    for (const [id, e] of scores) all[id] = e.score;
    r.champions = champions(all, settings.goal);
    won = r.champions !== null;
    // Coins (SPEC 22-2): finishers = round players who did not drop and are still in the room. Citizens opp = 1, liar opp = #citizens.
    ctx.finish(g.players
      .filter((id) => !g.dropped.includes(id) && ctx.member(id))
      .map((id) => {
        const liar = id === g.liarId;
        return { id, won: liar ? r.winner === 'liar' : r.winner === 'citizens', opp: liar ? g.players.length - 1 : 1 };
      }));
  }

  // Add one person's not-yet-booked room score to their running total (once per point).
  function flushOne(id) {
    const e = scores.get(id);
    const m = ctx.member(id);
    if (!e || !m) return;
    const add = unflushed(e);
    if (add === 0) return;
    const user = m.session.user;
    user.stats ??= {};
    const r = flushEntry(user.stats.liar ?? { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 }, e);
    user.stats.liar = r.stats;
    e.flushed = r.flushed;
    hub.persist(user);
    if (m.connected) hub.sendMe(m.session);
  }

  // The one game timer (0 or 1): cleared and re-set from wakeAt after every start/act/tick.
  function arm() {
    ctx.clear('game');
    armed = false;
    const at = game ? wakeAt(game) : null;
    if (at === null || at === undefined) return;
    armed = true;
    ctx.timer('game', Math.max(0, at - hub.now()), () => onTimer());
  }

  function onTimer() {
    armed = false;
    if (!game) return;
    const now = hub.now();
    const { events } = tick(game, now);
    sync();
    const next = wakeAt(game);
    if (events.length === 0 && next !== null && next <= now) {
      // tick did nothing and the wake time is still in the past: re-arming would loop forever.
      console.error(`liar room ${ctx.code}: tick made no progress in phase ${game.phase}; timer not re-armed`);
      ctx.push();
      return;
    }
    arm();
    ctx.push(engineEvents(events));
  }

  // One engine action. Timer is re-armed after every action.
  function play(action) {
    if (!game) return err('now', '진행 중인 판이 없습니다.');
    const r = act(game, action, hub.now());
    if (!r.ok) return err('act', r.error);
    if (action.type === 'end') { // discarded: back to the waiting room
      game = null;
      citizenEntry = null;
    }
    sync();
    arm();
    ctx.push(engineEvents(r.events));
    if (action.type === 'end') endNotice();
    return null;
  }

  // GDD 4-1: everyone sees one system chat line when the host discards the round (existing chat channel, kind 'talk').
  function endNotice() {
    const host = ctx.hostId();
    ctx.chatLine({ id: host, name: nameOf(host), text: '방장이 판을 끝냈습니다.', ts: hub.now(), kind: 'talk' });
  }

  // ---- settings ----

  // GDD 9-1: validate everything first, then apply, so a bad field changes nothing. The host and the waiting state are the Shell's job.
  // `topics` arrives as the picked names (set) or as the old [{name,on}] list (lg settings).
  function setSettings(byId, msg) {
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return err('bad', '설정이 올바르지 않습니다.');
    const st = settings;
    if (msg.liarMode !== undefined && !LIAR_MODES.includes(msg.liarMode)) return err('set', '라이어 방식이 올바르지 않습니다.');
    if (msg.topicMode !== undefined && !TOPIC_MODES.includes(msg.topicMode)) return err('set', '주제 방식이 올바르지 않습니다.');
    if (msg.wordSet !== undefined && !WORD_SETS.includes(msg.wordSet)) return err('set', '제시어 묶음이 올바르지 않습니다.');
    if (msg.goal !== undefined && !GOAL_CHOICES.includes(msg.goal)) return err('set', '목표 점수가 올바르지 않습니다.');
    if (msg.speakRounds !== undefined && !SPEAK_ROUND_CHOICES.includes(msg.speakRounds)) return err('set', '첫 설명 바퀴 수가 올바르지 않습니다.');
    if (msg.times !== undefined) {
      if (msg.times === null || typeof msg.times !== 'object' || Array.isArray(msg.times)) return err('set', '시간 설정이 올바르지 않습니다.');
      for (const [k, v] of Object.entries(msg.times)) {
        if (!Object.hasOwn(TIME_CHOICES, k) || !TIME_CHOICES[k].includes(v)) return err('set', '시간 설정이 올바르지 않습니다.');
      }
    }
    const newSet = msg.wordSet !== undefined && msg.wordSet !== st.wordSet;
    const set = msg.wordSet ?? st.wordSet;
    const names = topicNames(set);
    let topics = newSet ? topicsAllOn(set) : st.topics;
    if (msg.topics !== undefined && !newSet) {
      if (!Array.isArray(msg.topics) || msg.topics.length > 30) return err('set', '주제 설정이 올바르지 않습니다.');
      const on = new Map(topics.map((t) => [t.name, t.on]));
      if (msg.topics.every((t) => typeof t === 'string')) { // picked names: everything else goes off
        for (const name of on.keys()) on.set(name, msg.topics.includes(name));
      } else {
        for (const t of msg.topics) {
          if (t && on.has(t.name) && typeof t.on === 'boolean') on.set(t.name, t.on); // unknown names are ignored
        }
      }
      topics = names.map((name) => ({ name, on: on.get(name) }));
      if (!topics.some((t) => t.on)) return err('set', '주제를 하나 이상 켜 주세요.');
    }
    let nextTopic = newSet ? null : st.nextTopic;
    if (msg.nextTopic !== undefined && !newSet) {
      if (msg.nextTopic !== null && !names.includes(msg.nextTopic)) return err('set', '없는 주제입니다.');
      nextTopic = msg.nextTopic;
    }
    if (msg.liarMode !== undefined) st.liarMode = msg.liarMode;
    if (msg.topicMode !== undefined) st.topicMode = msg.topicMode;
    if (msg.goal !== undefined) st.goal = msg.goal;
    if (msg.speakRounds !== undefined) st.speakRounds = msg.speakRounds;
    if (msg.times !== undefined) Object.assign(st.times, msg.times);
    st.wordSet = set;
    st.topics = topics;
    st.nextTopic = nextTopic;
    return null;
  }

  const waiting = () => phase === 'lobby' || phase === 'result';

  // Every {t:'lg'} request. Returns an error or null.
  function lg(session, raw) {
    const c = checkLg(raw);
    if (!c.ok) return err('bad', c.error);
    const msg = c.msg;
    const id = session.id;
    switch (msg.a) {
      case 'say': return play({ type: 'say', by: id, text: stripSizeMark(msg.text) });
      case 'vote': return play({ type: 'vote', by: id, target: msg.target });
      case 'judge': return play({ type: 'judge', by: id, v: msg.v });
      case 'guess':
        return play({ type: 'guess', by: id, text: msg.text, correct: citizenEntry ? isCorrect(msg.text, citizenEntry) : false });
      case 'end':
        if (id !== ctx.hostId()) return err('host', '방장만 끝낼 수 있습니다.');
        return play({ type: 'end', by: id });
      default: return err('now'); // rank is answered by the host server, never by a room
    }
  }

  return {
    // GDD 9-3. No photos here (they travel as 'faces' events). The common fields (code·mode·hostId·you·now·wait·specs) come from the Shell.
    view(viewerId) {
      const g = game;
      const v = g ? viewFor(g, viewerId) : null;
      return {
        phase: v ? v.phase : phase,
        phaseEndsAt: v ? v.phaseEndsAt : null,
        round,
        settings: structuredClone(settings),
        players: ctx.members().map((m) => ({
          id: m.id, color: COLORS[body.get(m.id) ?? 0], body: body.get(m.id) ?? 0,
          seat: v ? v.seats[m.id] ?? null : null,
          spectating: g ? !inGame(m.id) : false, score: scores.get(m.id)?.score ?? 0,
        })),
        topic: v ? v.topic : null,
        my: v ? v.my : { word: null, role: null },
        order: v ? v.order : [],
        speaker: v ? v.speaker : null,
        speakDone: v ? v.speakDone : false,
        firstSays: v ? v.firstSays : [],
        speakRound: v ? v.speakRound : 1,
        speakRounds: v ? v.speakRounds : 1,
        extraSays: v ? v.extraSays : [],
        extendNo: v ? v.extendNo : 0,
        votes: v ? v.votes : {},
        candidates: v ? v.candidates : null,
        accuseNo: v ? v.accuseNo : 0,
        accused: v ? v.accused : null,
        judge: v ? v.judge : null,
        unmask: v ? v.unmask : null,
        guess: v ? v.guess : null,
        words: v ? v.words : null,
        result: v?.result ? { ...v.result, liarName } : null,
      };
    },
    phase: () => phase,
    get game() { return game; }, // 시험이 판 상태를 직접 본다
    get settings() { return settings; },
    get scores() { return scores; },
    get round() { return round; },
    get citizenEntry() { return citizenEntry; },
    set citizenEntry(v) { citizenEntry = v; }, // 시험이 정답 판정용 항목을 넣는다
    get settledGame() { return settledGame; },
    sync, // 시험이 판 상태를 직접 바꾼 뒤 맞춘다
    isWaiting: waiting,

    // 대기실이 그릴 값. 방 설정 사본뿐(단어·역할 없음).
    waitInfo: () => ({ set: structuredClone(settings), own: {} }),

    canStart() {
      if (ctx.members().filter((m) => m.connected).length < 3) return err('need3', '3명 이상 필요합니다.');
      if (settings.topicMode === 'host' && !settings.nextTopic) return err('topic', '주제를 먼저 골라 주세요.');
      return null;
    },

    onStart() {
      const players = ctx.members().filter((m) => m.connected).map((m) => m.id);
      const st = settings;
      let drawn;
      try {
        drawn = drawWords({
          words: WORDS, set: st.wordSet, enabled: st.topics.filter((t) => t.on).map((t) => t.name),
          topic: st.topicMode === 'host' ? st.nextTopic : null,
          used, liarMode: st.liarMode, rng: intRng(hub.rng),
        });
      } catch {
        return err('words', '제시어를 고를 수 없습니다.');
      }
      if (won) { // someone won the last game: pay everyone out, then start from zero
        for (const m of ctx.members()) flushOne(m.id);
        scores.clear();
        won = false;
      }
      const next = round + 1;
      game = createGame({
        players,
        settings: { liarMode: st.liarMode, times: st.times, speakRounds: st.speakRounds },
        draw: { topic: drawn.topic, citizenWord: drawn.citizenWord, liarWord: drawn.liarWord },
        rng: intRng(hub.rng), now: hub.now(), round: next,
      });
      citizenEntry = drawn.citizenEntry;
      liarName = nameOf(game.liarId);
      round = next;
      st.nextTopic = null;
      sync();
      arm();
      return null;
    },

    setSettings,
    onAction: lg,

    // Mannequin slot (and so the color) = lowest free one; fixed while the player is in the room.
    onJoin(m) {
      const taken = new Set(body.values());
      let b = 0;
      while (taken.has(b)) b++;
      body.set(m.id, b);
      return null;
    },

    onAway: (id) => notifyEngine('away', id),
    onBack: (id) => notifyEngine('back', id),

    // The player leaves (leave / kick / 60 s grace over): the engine drops them while their name still resolves.
    onLeave(id) {
      const events = notifyEngine('drop', id);
      flushOne(id);
      body.delete(id);
      return events;
    },

    onEmpty() {
      ctx.clear('game');
      armed = false;
      game = null;
      citizenEntry = null;
      phase = 'lobby';
      body.clear();
    },

    // Shell asks before it relays a chat line (GDD 4-4).
    chatCheck(session) {
      const why = chatBlocked(permG(), permWho(session.id));
      return why ? err('chat', why) : null;
    },
    chatKind: (session) => chatKind(permG(), permWho(session.id)),
    mediaBlocked(session, kind) {
      const why = mediaBlocked(permG(), permWho(session.id), kind);
      return why ? err('media', why) : null;
    },

    // Adds the room's score to everyone's total (safe to call twice).
    flush() {
      for (const m of ctx.members()) flushOne(m.id);
    },

    // Admin "skip": the pending game timer fires now (see server/admin/games/liar.js).
    skipPhase() {
      if (!game || game.phase === 'result' || !armed) return false;
      game.phaseEndsAt = hub.now();
      game.pendingShortenAt = null;
      ctx.clear('game');
      onTimer();
      return true;
    },
  };
}
