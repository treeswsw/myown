// 게임 등록표 (docs/COMMON-CONTRACT.md 2-1). 서버·화면·시험이 같이 읽는 사실. DOM·node 없음.
// 한 게임 = 한 줄. 빠진 칸이 있으면 test/common/games.test.js 가 실패한다(null/false/[] 는 "없음"을 적은 것).
import { GAME_NAME as DRAW_NAME } from './draw/name.js';
import { GAME_NAME as GSK_NAME } from './gsk/name.js';
import { GAME_NAME as SOLO_NAME } from './solo/name.js';
import { IDS as SOLO_IDS } from './solo/index.js';
import { parse as soloParse } from './solo/protocol.js';
import { SETTINGS as SOLO_SET, OWN as SOLO_OWN } from './solo/settings.js';
import { SETTINGS as LIAR_SET } from './liar/settings.js';
import { SETTINGS as DRAW_SET } from './draw/settings.js';
import { SETTINGS as MINI_SET, OWN as MINI_OWN, GAME_OPTS as MINI_OPTS, LEVELS as MINI_LEVELS } from './mini/settings.js';
import { OWN as GSK_OWN } from './gsk/settings.js';

const CHAT = { maxLen: 120, log: 30 };
const MINI_IDS = MINI_OPTS.map((o) => o[0]);

export const GAMES = {
  holdem: {
    name: '텍사스 홀덤', desc: '2~6명 · 블라인드 50/100',
    about: '2~6명 · 블라인드 50/100. 가진 칩을 걸고 손패 두 장과 바닥 카드 다섯 장으로 겨룹니다.',
    min: 2, max: 6, flag: null, msgs: ['act'], err: 'pk_', css: null, coin: null, chat: CHAT, settings: [], own: [],
  },
  bluff: {
    name: '블러핑 카드', desc: '2~4명 · 리볼버 벌칙',
    about: '2~4명 · 리볼버 벌칙. 카드를 엎어 내며 거짓말을 하고, 들키면 리볼버 벌칙을 받습니다.',
    min: 2, max: 4, flag: null, msgs: ['play', 'liar'], err: 'pk_', css: null, coin: 'bluff', chat: CHAT, settings: [], own: [],
  },
  liar: {
    name: '라이어게임', desc: '3~8명 · 말로 하는 추리',
    about: '3~8명 · 말로 하는 추리. 한 명만 다른 제시어를 받습니다. 설명하고 토론한 뒤 투표로 라이어를 찾으세요.',
    min: 3, max: 8, flag: 'liar', msgs: ['lg'], err: 'lg_', css: 'lg-', coin: 'liar', chat: { maxLen: 80, log: 50 }, settings: LIAR_SET, own: [],
  },
  yacht: {
    name: '요트다이스', desc: '2~4명 · 주사위 5개',
    about: '2~4명 · 주사위 5개. 세 번까지 굴려 족보를 만들고 점수표를 채웁니다. 합계가 높은 사람이 이깁니다.',
    min: 2, max: 4, flag: 'yacht', msgs: ['yt'], err: 'yt_', css: 'yt-', coin: 'yacht', chat: CHAT, settings: [], own: [],
  },
  draw: {
    name: DRAW_NAME, desc: '2~8명 · 그림 보고 단어 맞히기',
    about: '2~8명 · 그림 보고 단어 맞히기. 한 명이 그리고 나머지가 채팅으로 단어를 맞힙니다.',
    min: 2, max: 8, flag: 'draw', msgs: ['dr'], err: 'dr_', css: 'dr-', coin: 'draw', chat: null /* chatOwn */, settings: DRAW_SET, own: [],
    fast: { limit: 100, ops: ['st', 'pt', 'cx', 'rm', 'undo', 'redo', 'clear'] },
  },
  gsk: {
    name: GSK_NAME, desc: '3~6명 · 해골을 피해 꽃 뒤집기',
    about: '3~6명 · 해골을 피해 꽃 뒤집기. 원판을 엎어 놓고 "몇 장까지 꽃만 뒤집겠다"를 겨룹니다. 해골이 나오면 원판을 잃어요.',
    min: 3, max: 6, flag: 'gsk', msgs: ['gk'], err: 'gk_', css: 'gk-', coin: 'gsk', chat: CHAT, settings: [], own: GSK_OWN,
  },
  mini: {
    name: '미니게임', desc: '2명 · 오목·리버시·체커·체스·커넥트포',
    about: '2명 · 오목·리버시·체커·체스·커넥트포. 둘이서 두는 판 게임입니다. 종목과 승부 방식은 여기서 정합니다.',
    min: 2, max: 8, flag: 'mini', msgs: ['mn'], err: 'mn_', css: 'mn-', coin: 'mini', chat: CHAT, settings: MINI_SET, own: MINI_OWN,
    // create(m): 방 만들기 요청의 추가 칸을 걸러 돌려준다(server/protocol.js 가 부른다). 없으면 {mode} 만.
    create: (m) => {
      const game = MINI_IDS.includes(m.game) ? m.game : 'gomoku';
      if (m.vs === 'puzzle' && game === 'chess') return { game, vs: 'puzzle' };
      if (m.vs !== 'bot') return { game };
      return { game, vs: 'bot', level: MINI_LEVELS.includes(m.level) ? m.level : 'mid', side: m.side === 1 ? 1 : 0 };
    },
  },
  solo: {
    name: SOLO_NAME, desc: '1명 · 점수 겨루기 (2048·사과·수박)',
    about: '혼자 점수를 겨루는 게임입니다. 종목을 고르면 바로 시작하고, 다른 사람은 방 코드로 들어와 점수를 구경할 수 있어요.',
    min: 1, max: 4, flag: 'solo', msgs: ['so'], err: 'so_', css: 'so-', coin: null, chat: CHAT, settings: SOLO_SET, own: SOLO_OWN,
    // listed: false = 로비 방 목록에 안 나옴(없으면 true). create(m): 방 만들기 추가 칸. parse(m): 이 게임 요청 모양 검사(null = 거절).
    listed: false,
    create: (m) => ({ game: SOLO_IDS.includes(m.game) ? m.game : SOLO_IDS[0] }),
    parse: soloParse,
  },
};
