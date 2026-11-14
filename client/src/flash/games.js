// 놀이터(플래시) 게임 목록 한 곳. 게임 추가 = 한 줄 + client/public/flash/<file>.
// players: 1 = 혼자, 2+ = 여럿(아직 혼자용만 지원). keys: 조작 안내 글자. '방향키'·'스페이스'·'엔터'가 들어 있으면 휴대폰에 그 화면 버튼을 띄운다.
export const FLASH_GAMES = [
  { id: 'bloxorz', name: '블록소즈', file: 'bloxorz.swf', players: 1, keys: '방향키', desc: '직육면체 블록을 굴려 구멍에 넣기' },
];
