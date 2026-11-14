// 요트 화면의 "사람" 그리기 하나: 점수표·판·결과가 같은 사진·같은 색을 쓴다.
// 사진·꾸미기는 공용 부품(ui/kit/avatar.js 의 playerAvatar), 사진 데이터는 방 틀의 faces, 색은 서버가 준 players[].color 한 가지 규칙.
// createWho({ faces?, profile? }) -> { setPlayers(players), color(id), key(id), face(id, name, cls, size) -> el }
import { profile as kitProfile } from '../../ui/kit/avatar.js';

const FALLBACK = ['#3b6fd4', '#d4573b', '#2f9e6e', '#8a55c9', '#c9922f', '#2b9bb5']; // 서버(PLAYER_COLORS)와 같은 6색. 서버 값이 오기 전에만
const NONE = { avatar: null, look: null };
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
const HEX = /^#[0-9a-f]{3,8}$/i;

export function createWho({ faces = null, profile = kitProfile } = {}) {
  let colors = new Map();
  const faceOf = (id) => faces?.get(id) ?? NONE;
  const color = (id) => colors.get(id) ?? FALLBACK[hash(id) % FALLBACK.length];
  return {
    setPlayers(players) {
      colors = new Map((players ?? []).filter((p) => p && typeof p.color === 'string' && HEX.test(p.color)).map((p) => [p.id, p.color]));
    },
    color,
    /** 장착 꾸미기(칭호·글자 색) 또는 null */
    look(id) { return faceOf(id).look ?? null; },
    /** 사진·꾸미기·색이 바뀌었는지 비교하는 열쇠 */
    key(id) {
      const f = faceOf(id);
      return `${f.avatar ?? ''}|${JSON.stringify(f.look ?? null)}|${color(id)}`;
    },
    /** cls 크기의 상자 하나(안에 공용 프로필 사진). */
    face(id, name, cls, size) {
      const f = faceOf(id);
      const box = document.createElement('div');
      box.className = cls;
      box.append(profile.playerAvatar({ id, name, face: f.avatar, look: f.look, color: color(id), size }));
      return box;
    },
  };
}
