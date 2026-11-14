// 혼자 놀기 요청 모양 검사 (docs/solo/PLAN.md 5절). 등록표 칸 `parse` 로 server/protocol.js 가 부른다.
// 모양만 본다(누가·언제는 방, 값의 뜻은 엔진이 본다). 통과하면 걸러진 새 객체를, 아니면 null 을 돌려준다.
import { STEP_MAX } from './run.js';

export const OPS_MAX = 512; // 한 조각의 칸 수
export const OP_VALUE_MAX = 1048575; // 입력 값 최대 (엔진 maxV 는 방이 따로 본다)

const isInt = (v) => Number.isInteger(v);

export function parse(m) {
  switch (m.a) {
    case 'in': {
      if (!isInt(m.n) || m.n < 0 || m.n > 1e9) return null;
      const ops = m.ops;
      if (!Array.isArray(ops) || ops.length < 1 || ops.length > OPS_MAX) return null;
      if (!ops.every((v) => isInt(v) && v >= -STEP_MAX && v <= OP_VALUE_MAX)) return null;
      return { t: 'so', a: 'in', n: m.n, ops: ops.slice() };
    }
    case 'end':
      return isInt(m.score) && m.score >= 0 && m.score <= 1e12 ? { t: 'so', a: 'end', score: m.score } : null;
    case 'rank':
      return typeof m.game === 'string' && m.game.length > 0 && m.game.length <= 20 ? { t: 'so', a: 'rank', game: m.game } : null;
    default:
      return null;
  }
}
