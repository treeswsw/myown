// 혼자 놀기 순위 요청 (docs/solo/PLAN.md 4-2): {t:'so', a:'rank', game} -> {t:'soRank', game, week, all:{top, mine}, wk:{top, mine}}.
// 방 밖에서도 방 안에서도 허브가 답한다(SERVER_GAMES.solo.hubMsg, 라이어 랭킹과 같은 길). 이 요청이 아니면 undefined.
import { SOLO } from '../../shared/solo/index.js';
import { weekOf } from '../../shared/solo/coin.js';

export const TOP_N = 20;
export const CACHE_MS = 5000; // 상위 목록을 이만큼 기억해 DB 를 아낀다

// 종목 표: 시험은 가짜 표를 hub.soloEngines 에 넣는다. 기본은 shared/solo/index.js 의 SOLO.
export const enginesOf = (hub) => hub.soloEngines ?? SOLO;

const cacheOf = (hub) => (hub.soloTop ??= new Map()); // `${game}|${week|all}` -> { at, top }

// 정산이 끝나면 그 종목의 기억을 지운다
export function dropRankCache(hub, game) {
  for (const k of [...cacheOf(hub).keys()]) if (k.startsWith(`${game}|`)) cacheOf(hub).delete(k);
}

async function topOf(hub, game, week) {
  const cache = cacheOf(hub);
  const key = `${game}|${week ?? 'all'}`;
  const hit = cache.get(key);
  if (hit && hub.now() - hit.at < CACHE_MS) return hit.top;
  const top = await hub.store.topSolo(game, TOP_N, week);
  cache.set(key, { at: hub.now(), top });
  return top;
}

export function soloRank(hub, session, msg) {
  if (msg.t !== 'so' || msg.a !== 'rank') return undefined;
  return (async () => {
    if (hub.flags.solo === 'off') return { msg: '혼자 놀기는 지금 열려 있지 않습니다.', code: 'so_off' };
    if (typeof msg.game !== 'string' || !Object.hasOwn(enginesOf(hub), msg.game)) return { msg: '없는 게임이에요.', code: 'so_game' };
    const game = msg.game;
    const week = weekOf(hub.now());
    try {
      const [topAll, topWk, mineAll, mineWk] = await Promise.all([
        topOf(hub, game, null), topOf(hub, game, week),
        hub.store.soloRank(session.id, game, null), hub.store.soloRank(session.id, game, week),
      ]);
      hub.send(session, { t: 'soRank', game, week, all: { top: topAll, mine: mineAll }, wk: { top: topWk, mine: mineWk } });
    } catch (err) {
      console.error('solo rank failed:', err.message);
      return '순위를 불러오지 못했습니다.';
    }
    return null;
  })();
}
