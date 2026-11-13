// 화면 쪽 게임 등록표 (COMMON-CONTRACT 2·4-1). 게임 사실(이름·정원·스위치·설정 스키마)은 shared/games.js 의 GAMES,
// 여기는 화면에만 있는 것(불러오기, 3D 무대 사용, 상단 줄 왼쪽 자리)만 키마다 한 줄.
// mount: true 인 게임만 공통 틀(room/frame.js)로 그린다. 아직 옮기지 않은 게임은 false → main.js 의 옛 길.
import { GAME_NAME as GSK_NAME } from '../../shared/gsk/name.js';
import { GAME_NAME as DRAW_NAME } from '../../shared/draw/name.js';

// ---- 임시 사본: S1(서버 뼈대)이 shared/games.js 를 만들면 아래 TEMP 덩어리를 지우고
//      `export { GAMES } from '../../shared/games.js';` 한 줄로 바꾼다. 필드 이름은 문서 2-1 그대로.
// TEMP-GAMES-BEGIN
const P = { chat: { maxLen: 120, log: 30 }, settings: [], own: [] };
export const GAMES = {
  holdem: { name: '텍사스 홀덤', desc: '2~6명 · 블라인드 50/100', about: '2~6명 · 블라인드 50/100. 칩을 걸고 가장 좋은 패를 만드세요.', min: 2, max: 6, flag: null, msgs: ['act'], err: 'pk_', css: null, coin: null, ...P },
  bluff: { name: '블러핑 카드', desc: '2~4명 · 리볼버 벌칙', about: '2~4명 · 카드를 엎어 내고 거짓말을 잡아내세요. 들키면 리볼버 벌칙.', min: 2, max: 4, flag: null, msgs: ['play', 'liar'], err: 'pk_', css: null, coin: 'bluff', ...P },
  liar: { name: '라이어게임', desc: '3~8명 · 말로 하는 추리', about: '3~8명 · 말로 하는 추리. 한 명만 다른 제시어를 받습니다. 설명하고 토론한 뒤 투표로 라이어를 찾으세요.', min: 3, max: 8, flag: 'liar', msgs: ['lg'], err: 'lg_', css: 'lg-', coin: 'liar', ...P, chat: { maxLen: 80, log: 50 } },
  yacht: { name: '요트다이스', desc: '2~4명 · 주사위 5개', about: '2~4명 · 주사위 5개를 세 번까지 굴려 점수표 칸을 채웁니다. 합계가 높은 사람이 이깁니다.', min: 2, max: 4, flag: 'yacht', msgs: ['yt'], err: 'yt_', css: 'yt-', coin: 'yacht', ...P },
  draw: { name: DRAW_NAME, desc: '2~8명 · 그림 보고 단어 맞히기', about: '2~8명 · 한 사람이 그리고 나머지가 단어를 맞힙니다. 빨리 맞힐수록 점수가 큽니다.', min: 2, max: 8, flag: 'draw', msgs: ['dr'], err: 'dr_', css: 'dr-', coin: 'draw', ...P, chat: null, fast: { limit: 100, ops: ['st', 'pt', 'cx', 'rm', 'undo', 'redo', 'clear'] } },
  gsk: { name: GSK_NAME, desc: '3~6명 · 해골을 피해 꽃 뒤집기', about: '3~6명 · 해골을 피해 꽃 뒤집기. 원판을 엎어 놓고 "몇 장까지 꽃만 뒤집겠다"를 겨룹니다. 해골이 나오면 원판을 잃어요.', min: 3, max: 6, flag: 'gsk', msgs: ['gk'], err: 'gk_', css: 'gk-', coin: null, ...P },
  mini: { name: '미니게임', desc: '2명 · 오목·리버시·체커·체스·커넥트포', about: '2명 · 오목·리버시·체커·체스·커넥트포. 둘이서 두는 판 게임입니다.', min: 2, max: 8, flag: 'mini', msgs: ['mn'], err: 'mn_', css: 'mn-', coin: 'mini', ...P },
};
// TEMP-GAMES-END

export const CLIENT_GAMES = {
  holdem: { builtin: 'poker', stage: true, mount: false },
  bluff: { builtin: 'poker', stage: true, mount: false },
  liar: { load: () => import('./liar/index.js'), stage: true, mount: false },
  yacht: { load: () => import('./yacht/index.js'), stage: true, mount: false, bar: { leftVar: '--yt-sheet-w' } },
  draw: { load: () => import('./draw/index.js'), stage: false, mount: false },
  gsk: { load: () => import('./gsk/index.js'), stage: false, mount: false },
  mini: { load: () => import('./mini/index.js'), stage: false, mount: false },
};

/** 이 방을 공통 틀이 그리는가(옮긴 게임). */
export const isFramed = (mode) => Boolean(mode && CLIENT_GAMES[mode]?.mount && CLIENT_GAMES[mode].load);

/** 로비에 보일 게임 키(등록표 순서). me = 서버 'me' 메시지(스위치 값 'on'|'test'|'off'), search = location.search */
export function visibleModes(me, search = '') {
  const q = new URLSearchParams(search);
  return Object.keys(GAMES).filter((k) => {
    const f = GAMES[k].flag;
    if (!f) return true;
    const v = me?.[f];
    return v === 'on' || (v === 'test' && q.get(f) === '1');
  });
}
