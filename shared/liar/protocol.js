// {t:'lg'} 요청의 모양 검사 (GDD 9-1, CONTRACTS 4절). 모양만 본다 — 방장인가·단계가 맞는가·주제 이름이 있는가는 방·엔진이 본다.
// node 전용 모듈을 쓰지 않는다(화면도 쓸 수 있게). 받은 객체는 고치지 않고 새 객체를 돌려준다.
import { LIMITS, TIME_CHOICES, GOAL_CHOICES, LIAR_MODES, SPEAK_ROUND_CHOICES } from './constants.js';

export const WORD_SETS = Object.freeze(['mine', 'star']);
export const TOPIC_MODES = Object.freeze(['random', 'host']);

const MAX_TOPIC_NAME = 20;
const MAX_TOPICS = 30;
const MAX_ID = 40;
const BAD = '잘못된 요청입니다.';

const good = (msg) => ({ ok: true, msg });
const bad = (error) => ({ ok: false, error });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// host/server/protocol.js 의 chat 처리와 같은 규칙(복사). 줄바꿈·탭 → 빈칸, 제어·보이지 않는 글자 삭제(U+200D 는 유지), 앞뒤 빈칸 제거.
function cleanText(raw, max) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\n\r\t]/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '‍' ? c : '')).trim();
  if (!/[^\s‍️]/u.test(text)) return null;
  return [...text].length <= max ? text : null;
}

function idOk(v) {
  return typeof v === 'string' && v.length >= 1 && v.length <= MAX_ID;
}

function topicName(v) {
  return typeof v === 'string' && v.length >= 1 && [...v].length <= MAX_TOPIC_NAME;
}

function checkSettings(m) {
  const out = {};
  if (has(m, 'liarMode')) {
    if (!LIAR_MODES.includes(m.liarMode)) return bad('라이어 방식이 올바르지 않습니다.');
    out.liarMode = m.liarMode;
  }
  if (has(m, 'wordSet')) {
    if (!WORD_SETS.includes(m.wordSet)) return bad('제시어 묶음이 올바르지 않습니다.');
    out.wordSet = m.wordSet;
  }
  if (has(m, 'topicMode')) {
    if (!TOPIC_MODES.includes(m.topicMode)) return bad('주제 방식이 올바르지 않습니다.');
    out.topicMode = m.topicMode;
  }
  if (has(m, 'goal')) {
    if (!GOAL_CHOICES.includes(m.goal)) return bad('목표 점수가 올바르지 않습니다.');
    out.goal = m.goal;
  }
  if (has(m, 'speakRounds')) {
    if (!SPEAK_ROUND_CHOICES.includes(m.speakRounds)) return bad('첫 설명 바퀴 수가 올바르지 않습니다.');
    out.speakRounds = m.speakRounds;
  }
  if (has(m, 'times')) {
    if (!isObj(m.times)) return bad('시간 설정이 올바르지 않습니다.');
    const times = {};
    for (const k of Object.keys(TIME_CHOICES)) {
      if (!has(m.times, k)) continue;
      if (!TIME_CHOICES[k].includes(m.times[k])) return bad('고를 수 없는 시간입니다.');
      times[k] = m.times[k];
    }
    if (Object.keys(times).length) out.times = times;
  }
  if (has(m, 'topics')) {
    const t = m.topics;
    if (!Array.isArray(t) || t.length < 1 || t.length > MAX_TOPICS) return bad('주제 목록이 올바르지 않습니다.');
    const topics = [];
    for (const item of t) {
      if (!isObj(item) || !topicName(item.name) || typeof item.on !== 'boolean') return bad('주제 목록이 올바르지 않습니다.');
      topics.push({ name: item.name, on: item.on });
    }
    out.topics = topics;
  }
  if (has(m, 'nextTopic')) {
    if (m.nextTopic !== null && !topicName(m.nextTopic)) return bad('다음 주제가 올바르지 않습니다.');
    out.nextTopic = m.nextTopic;
  }
  return Object.keys(out).length ? good({ a: 'settings', ...out }) : bad('바꿀 설정이 없습니다.');
}

export function checkLg(msg) {
  if (!isObj(msg) || typeof msg.a !== 'string') return bad(BAD);
  switch (msg.a) {
    case 'settings':
      return checkSettings(msg);
    case 'kick':
      return idOk(msg.id) ? good({ a: 'kick', id: msg.id }) : bad(BAD);
    case 'say': {
      const text = cleanText(msg.text, LIMITS.say);
      return text !== null ? good({ a: 'say', text }) : bad(`한마디는 1~${LIMITS.say}자여야 합니다.`);
    }
    case 'vote':
      if (msg.target === null) return good({ a: 'vote', target: null });
      return idOk(msg.target) ? good({ a: 'vote', target: msg.target }) : bad(BAD);
    case 'judge':
      return msg.v === 'yes' || msg.v === 'no' ? good({ a: 'judge', v: msg.v }) : bad(BAD);
    case 'guess': {
      const text = cleanText(msg.text, LIMITS.guess);
      return text !== null ? good({ a: 'guess', text }) : bad(`정답은 1~${LIMITS.guess}자여야 합니다.`);
    }
    case 'end':
    case 'rank':
      return good({ a: msg.a });
    default:
      return bad(BAD);
  }
}
