// 공용 프로필 부품 (COMMON-CONTRACT 4-1). 사진·색·칭호·꾸미기를 이 한 곳에서 그린다.
// 칭호·테두리·글자 색은 coin/look.js 의 decorate/titleBadge/nameColor 만 부른다 → 상점 개편 때 look.js 만 고치면 모든 게임 반영.
// playerAvatar({id, name, face, look, color, size}) -> el    face = 사진 data URL(faces 알림), look = 장착 아이템(faces.items[].look)
// nameTag({name, look}) -> el                                 칭호 배지 + 이름(꾸미기 글자 색)
import './kit.css';
import '../../coin/look.css';
import '../../coin/titlefx.css';
import { h, avatar } from '../dom.js';
import { decorate, titleBadge, nameColor } from '../../coin/look.js';

export function playerAvatar({ id, name = '', face = null, look = null, color = null, size = 32 } = {}) {
  const pic = avatar({ avatar: face, name }, 'ui-av');
  pic.style.width = pic.style.height = `${size}px`;
  pic.style.fontSize = `${Math.round(size * 0.44)}px`;
  if (color) pic.style.boxShadow = `0 0 0 2px ${color}`;
  const box = h('span', 'ui-avbox', pic);
  if (id != null) box.dataset.id = String(id);
  if (look) decorate(pic, look, { size });
  return box;
}

export function nameTag({ name = '', look = null } = {}) {
  const nm = h('span', 'ui-name', String(name));
  const c = look ? nameColor(look) : null;
  if (c) nm.style.color = c;
  const badge = look ? titleBadge(look) : null;
  return h('span', 'ui-tag', badge, nm);
}

export const profile = { playerAvatar, nameTag };
