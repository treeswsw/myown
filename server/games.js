// 서버 게임 등록표 (docs/COMMON-CONTRACT.md 2-2). 키는 shared/games.js 와 같다.
// 항목마다 make(ctx, opt): 게임 객체(훅 모음, 1-4)를 돌려준다. 공용 방 틀(server/room/shell.js)이 그것을 품는다.
// bot: false = 관리자 봇 없음(adm_nobot). errors = 그 게임만의 오류 문구. hubMsg = 방 밖에서도 허브가 답하는 요청.
import { makeLiarGame } from './liar/room.js';
import { makeYachtGame } from './yacht/room.js';
import { makeDrawGame } from './draw/room.js';
import { makeGskGame } from './gsk/room.js';
import { makeMiniGame } from './mini/room.js';
import { makePoker, pokerModeMsg } from './poker/room.js';
import * as holdemBot from './admin/games/holdem.js';
import * as bluffBot from './admin/games/bluff.js';
import * as liarBot from './admin/games/liar.js';
import * as yachtBot from './admin/games/yacht.js';
import * as drawBot from './admin/games/draw.js';
import * as gskBot from './admin/games/gsk.js';

// {t:'lg', a:'rank'}: 라이어 전체 랭킹. 방 밖에서도, 어느 방 안에서도 허브가 답한다(방에 넘기지 않는다).
// 이 메시지가 아니면 undefined.
function liarRank(hub, session, msg) {
  if (msg.t !== 'lg' || msg.a !== 'rank') return undefined;
  return (async () => {
    if (hub.flags.liar === 'off') return '라이어게임은 아직 열리지 않았습니다.';
    try {
      const [top, mine] = await Promise.all([hub.store.topLiar(20), hub.store.liarRank(session.id)]);
      hub.send(session, { t: 'lgRank', top, mine });
    } catch (err) {
      console.error('liar rank failed:', err.message);
      return '랭킹을 불러오지 못했습니다.';
    }
    return null;
  })();
}

export const SERVER_GAMES = {
  // modeMsg: 옛 {t:'mode'}(방 안 홀덤↔블러핑 전환, 없어짐)에 답하는 안내. 묶음 3 청소 때 삭제.
  holdem: { make: makePoker('holdem'), bot: holdemBot, modeMsg: pokerModeMsg },
  bluff: { make: makePoker('bluff'), bot: bluffBot, modeMsg: pokerModeMsg },
  liar: { make: makeLiarGame, bot: liarBot, hubMsg: liarRank },
  yacht: { make: makeYachtGame, bot: yachtBot },
  draw: { make: makeDrawGame, bot: drawBot },
  gsk: { make: makeGskGame, bot: gskBot, errors: { gk_off: '갱스껄은 지금 열려 있지 않습니다.' } },
  mini: { make: makeMiniGame, bot: false },
};
