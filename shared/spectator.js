// 관전 계정 규칙 (REFACTOR-PLAN 1절 "관전", COMMON-CONTRACT 6절). 서버(Shell·허브)와 화면이 이 한 곳만 본다.
// 아이디가 `관전` + 숫자(관전1, 관전2, …)인 계정은 어느 방에서든 관전자다. 로그인은 보통 계정과 같다.
export const SPEC_MAX = 4; // 방마다 관전 자리(정원 밖)
const SPEC_RE = /^관전\d+$/u;

/** 아이디(또는 이름)가 관전 계정인가 */
export const isSpectatorId = (id) => typeof id === 'string' && SPEC_RE.test(id.normalize('NFC').trim());
