// 체스 퍼즐: 리체스 주제(Themes) 한국어 이름과 목표 문구. 서버가 보낸 themes(공백 구분)와 humanMoves 로 만든다.
export const THEME_KO = {
  fork: '포크', pin: '핀', skewer: '꼬치', discoveredAttack: '발견 공격', sacrifice: '희생', attraction: '유인', deflection: '유도',
  doubleCheck: '이중 체크', hangingPiece: '놓인 기물', trappedPiece: '갇힌 기물', clearance: '길 비우기', interference: '가로막기',
  quietMove: '조용한 수', xRayAttack: '엑스레이', zugzwang: '추크츠방', capturingDefender: '수비수 잡기', intermezzo: '중간 수',
  defensiveMove: '수비 수', exposedKing: '노출된 킹', kingsideAttack: '킹사이드 공격', queensideAttack: '퀸사이드 공격', attackingF2F7: 'f2/f7 공격',
  advancedPawn: '전진한 폰', promotion: '승진', underPromotion: '언더 승진', enPassant: '앙파상', castling: '캐슬링',
  mate: '체크메이트', mateIn1: '1수 메이트', mateIn2: '2수 메이트', mateIn3: '3수 메이트', mateIn4: '4수 메이트', mateIn5: '5수 메이트',
  backRankMate: '백랭크 메이트', smotheredMate: '질식 메이트', anastasiaMate: '아나스타샤 메이트', arabianMate: '아라비안 메이트', bodenMate: '보덴 메이트',
  doubleBishopMate: '비숍 둘 메이트', dovetailMate: '도브테일 메이트', hookMate: '훅 메이트', killBoxMate: '킬박스 메이트', vukovicMate: '부코비치 메이트',
  rookEndgame: '룩 엔드게임', pawnEndgame: '폰 엔드게임', bishopEndgame: '비숍 엔드게임', knightEndgame: '나이트 엔드게임',
  queenEndgame: '퀸 엔드게임', queenRookEndgame: '퀸·룩 엔드게임',
};

// 목표 문구: 메이트 > 기물 이득 > 동점 > 승진 > 기본
export function goalText(themes, humanMoves) {
  const t = String(themes || '').split(' ').filter(Boolean);
  const m = t.map((x) => /^mateIn(\d)$/.exec(x)).find(Boolean);
  if (m) return `${m[1]}수 안에 체크메이트`;
  if (t.includes('mate')) return `${humanMoves}수 안에 체크메이트`;
  if (t.includes('advantage') || t.includes('crushing')) return '기물 이득';
  if (t.includes('equality')) return '동점 만들기';
  if (t.includes('promotion')) return '승진';
  return '최선의 수 찾기';
}

// 화면에 보일 주제 이름표 (길이·시기·대국 종류 같은 분류와 목표 문구에 쓴 것은 뺀다)
const HIDE = new Set(['short', 'long', 'veryLong', 'oneMove', 'advantage', 'crushing', 'equality', 'master', 'masterVsMaster', 'superGM', 'playerGames', 'opening', 'middlegame', 'endgame']);
export function themeTags(themes) {
  return String(themes || '').split(' ').filter((x) => x && !HIDE.has(x)).map((x) => THEME_KO[x] ?? x);
}
