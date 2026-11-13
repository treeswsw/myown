// 서버 게임 등록표 (docs/COMMON-CONTRACT.md 2-2). 키는 shared/games.js 와 같다.
// 항목마다 make(ctx, opt) 또는 legacy(hub, code, opt) 중 정확히 하나. 이행 중에는 모두 legacy(옛 방 그대로).
// 옮기기 과제가 자기 줄을 legacy -> make 로 바꾼다. bot: false = 관리자 봇 없음(adm_nobot).
import { makeLiarGame } from './liar/room.js';
import { makeYachtGame } from './yacht/room.js';
import { createDrawRoom } from './draw/room.js';
import { createGskRoom } from './gsk/room.js';
import { createMiniRoom } from './mini/room.js';
import { hookRoom } from './coin/hooks.js';
import * as holdemBot from './admin/games/holdem.js';
import * as bluffBot from './admin/games/bluff.js';
import * as liarBot from './admin/games/liar.js';
import * as yachtBot from './admin/games/yacht.js';
import * as drawBot from './admin/games/draw.js';

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
  holdem: { legacy: (hub, code) => hub.pokerRoom(code, 'holdem'), bot: holdemBot },
  bluff: { legacy: (hub, code) => hub.pokerRoom(code, 'bluff'), bot: bluffBot },
  liar: { make: makeLiarGame, bot: liarBot, hubMsg: liarRank },
  yacht: { make: makeYachtGame, bot: yachtBot },
  draw: { legacy: (hub, code) => hookRoom(hub, createDrawRoom(hub, code)), bot: drawBot },
  gsk: { legacy: (hub, code) => createGskRoom(hub, code), bot: false, errors: { gk_off: '갱스껄은 지금 열려 있지 않습니다.' } },
  mini: { legacy: (hub, code, opt) => hookRoom(hub, createMiniRoom(hub, code, opt.game)), bot: false },
};
