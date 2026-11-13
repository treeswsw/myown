// 관리자 연출 보기 목록 (SPEC 21-4, 21-6). 관리자 기기에서만 가짜 자료로 재생한다. 서버에 보내지 않는다.
// 항목: { mode: 'holdem'|'bluff'|'liar'|'yacht'|'draw'|..., id, label, play(): void|Promise }
const FX = [];

// mode 가 없으면(로비) 전부, 있으면 그 게임 것만.
export function listFx(mode) {
  return mode ? FX.filter((f) => f.mode === mode) : FX.slice();
}
