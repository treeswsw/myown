// 화면 쪽 게임 등록표 (COMMON-CONTRACT 2·4-1). 게임 사실(이름·정원·스위치·설정 스키마)은 shared/games.js 의 GAMES,
// 여기는 화면에만 있는 것(불러오기, 3D 무대 사용, 상단 줄 왼쪽 자리)만 키마다 한 줄.
// 모든 게임이 공통 틀(room/frame.js)로 그려진다: load() 가 돌려준 모듈의 mount(ctx) 를 부른다(mount: true 는 그 표시).

export { GAMES } from '../../shared/games.js';
import { GAMES } from '../../shared/games.js';

export const CLIENT_GAMES = {
  // 포커: 화면 모듈은 main.js 가 이미 불러 둔 것(3D 테이블·HUD 를 넘겨 준다). bar: false = 상단 줄 대신 포커 HUD
  holdem: { load: () => import('./poker/index.js'), stage: true, mount: true, bar: false },
  bluff: { load: () => import('./poker/index.js'), stage: true, mount: true, bar: false },
  liar: { load: () => import('./liar/index.js'), stage: true, mount: true },
  yacht: { load: () => import('./yacht/index.js'), stage: true, mount: true, bar: { leftVar: '--yt-sheet-w' } },
  draw: { load: () => import('./draw/index.js'), stage: false, mount: true },
  gsk: { load: () => import('./gsk/index.js'), stage: false, mount: true },
  mini: { load: () => import('./mini/index.js'), stage: false, mount: true },
  solo: { load: () => import('./solo/index.js'), stage: false, mount: true },
};

/** 이 방을 공통 틀이 그리는가(등록표에 load·mount 가 있는 게임 = 모든 게임). */
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
