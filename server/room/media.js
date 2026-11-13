// 공용 방 매체: 이모티콘·사진 이모티콘·방 소리·프로필 사진(faces) (docs/COMMON-CONTRACT.md 1-1, 1-6).
// 게임 상태·타이머는 건드리지 않는다. 게임은 mediaBlocked(session, kind) 훅으로만 막는다.

export const MAX_ROOM_SOUNDS = 24;
export const MAX_ACCOUNT_SOUNDS = 8;
export const MEDIA = new Set(['emote', 'pemote', 'snd', 'sndAdd', 'sndDel', 'sndRename']);
const BLOCKABLE = new Set(['emote', 'pemote', 'snd', 'sndAdd', 'sndRename']); // sndDel 은 막지 않는다(지금 그대로)

// Per-account (not per-socket) minimum spacing; a refused attempt does not extend the wait.
export function tooSoon(hub, session, key, ms) {
  const t = hub.now();
  const last = session.lastSent[key];
  if (last !== undefined && t - last < ms) return true;
  session.lastSent[key] = t;
  return false;
}

export function createMedia(shell) {
  const { hub } = shell;
  const sounds = []; // [{sid, by, name, data}], oldest first; lives and dies with the room
  const held = new Map(); // id -> 사진이 막힌 동안 바꾼 사람의, 방에 보여 준(바뀌기 전) 사진
  const blocked = (session, kind) => shell.impl.mediaBlocked?.(session, kind) ?? null;

  const who = (id) => shell.member(id) ?? shell.spec(id); // 참가자 또는 관전자
  const faceOf = (m) => (held.has(m.id) ? held.get(m.id) : m.session.user.avatar) ?? null;
  const faceItem = (m) => ({ id: m.id, avatar: faceOf(m), look: { ...(m.session.user.gear?.equip ?? {}) } });
  const facesEvent = (ms) => ({ k: 'faces', items: ms.map(faceItem) });

  function sendFaces(ids, filter = () => true) {
    const e = facesEvent(ids.map(who).filter(Boolean));
    for (const m of shell.everyone) if (filter(m)) hub.send(m.session, { t: 'event', e });
  }

  function addSound(session, sid, name, data) {
    const existing = sounds.find((x) => x.sid === sid);
    if (existing) return existing.by === session.id ? null : '이미 사용 중인 소리 번호입니다.';
    sounds.push({ sid, by: session.id, name, data });
    const gone = [];
    const mine = sounds.filter((x) => x.by === session.id);
    if (mine.length > MAX_ACCOUNT_SOUNDS) gone.push(...sounds.splice(sounds.indexOf(mine[0]), 1));
    if (sounds.length > MAX_ROOM_SOUNDS) gone.push(sounds.shift());
    // 넘쳐 지운 소리는 화면에서도 지워지게 sndDel 을 뒤에 붙인다(B18).
    shell.sendEvents([{ k: 'sndAdd', sid, by: session.id, name, data }, ...gone.map((x) => ({ k: 'sndDel', sid: x.sid }))]);
    return null;
  }

  // Only the uploader or the host may edit a shared sound.
  function editSound(session, sid, change) {
    const sound = sounds.find((x) => x.sid === sid);
    if (!sound) return '없는 소리입니다.';
    if (sound.by !== session.id && shell.hostId !== session.id) return '이 사운드를 수정할 권한이 없습니다.';
    if (change.name === undefined) sounds.splice(sounds.indexOf(sound), 1);
    else sound.name = change.name;
    shell.sendEvents([change.name === undefined ? { k: 'sndDel', sid } : { k: 'sndRename', sid, name: change.name }]);
    return null;
  }

  return {
    // 들어오거나 다시 붙는 사람에게: faces(전원) -> sndList(있으면)
    extras(session) {
      hub.send(session, { t: 'event', e: facesEvent(shell.everyone) });
      if (sounds.length) hub.send(session, { t: 'event', e: { k: 'sndList', items: sounds.map((x) => ({ ...x })) } });
    },
    sendFaces,

    // 사진을 바꿨다. 사진 이모티콘이 막힌 동안이면 막힘이 풀릴 때까지 바뀌기 전 사진을 보여 준다(B4).
    faceChanged(session, prev) {
      if (!who(session.id)) return;
      if (blocked(session, 'pemote')) {
        if (!held.has(session.id)) held.set(session.id, prev ?? null);
        return;
      }
      held.delete(session.id);
      sendFaces([session.id]);
    },

    // push 마다 부른다: 막힘이 풀린 사람의 새 사진을 보낸다.
    releaseFaces() {
      if (!held.size) return;
      const ids = [];
      for (const id of [...held.keys()]) {
        const m = who(id);
        if (!m) held.delete(id);
        else if (!blocked(m.session, 'pemote')) { held.delete(id); ids.push(id); }
      }
      if (ids.length) sendFaces(ids);
    },

    // emote pemote snd sndAdd sndDel sndRename
    handle(session, msg) {
      if (BLOCKABLE.has(msg.t)) {
        const why = blocked(session, msg.t);
        if (why) return why;
      }
      switch (msg.t) {
        case 'emote':
          shell.sendEvents([{ k: 'emote', id: session.id, e: msg.e }]);
          return null;
        case 'pemote':
          if (tooSoon(hub, session, 'pemote', 3000)) return '사진 이모티콘을 너무 빨리 보내고 있습니다';
          shell.sendEvents([{ k: 'pemote', id: session.id, data: msg.data }]);
          return null;
        case 'sndAdd':
          if (tooSoon(hub, session, 'sndAdd', 10_000)) return '소리를 너무 빨리 올리고 있습니다';
          return addSound(session, msg.sid, msg.name, msg.data);
        case 'sndDel':
        case 'sndRename': {
          // 2 edits per second per account
          const t = hub.now();
          const recent = session.editTimes.filter((x) => t - x < 1000);
          if (recent.length >= 2) return '소리를 너무 빨리 수정하고 있습니다';
          recent.push(t);
          session.editTimes = recent;
          return editSound(session, msg.sid, msg.t === 'sndRename' ? { name: msg.name } : {});
        }
        case 'snd':
          if (tooSoon(hub, session, 'snd', 2000)) return '소리를 너무 빨리 재생하고 있습니다';
          if (!msg.sid.startsWith('builtin:') && !sounds.some((x) => x.sid === msg.sid)) return '없는 소리입니다.';
          shell.sendEvents([{ k: 'snd', id: session.id, sid: msg.sid }]);
          return null;
        default:
          return null;
      }
    },
  };
}
