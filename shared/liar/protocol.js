// {t:'lg'} 요청의 모양 검사 (GDD 9-1, CONTRACTS 4절). 모양만 본다 — 방장인가·단계가 맞는가·주제 이름이 있는가는 방·엔진이 본다.
// node 전용 모듈을 쓰지 않는다(화면도 쓸 수 있게). 받은 객체는 고치지 않고 새 객체를 돌려준다.
import { LIMITS } from './constants.js';


const MAX_ID = 40;
const BAD = '잘못된 요청입니다.';

const good = (msg) => ({ ok: true, msg });
const bad = (error) => ({ ok: false, error });
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

export function checkLg(msg) {
  if (!isObj(msg) || typeof msg.a !== 'string') return bad(BAD);
  switch (msg.a) {
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
