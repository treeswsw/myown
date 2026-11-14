// 공용 방 채팅 (docs/COMMON-CONTRACT.md 1-1, 1-6). 게임 이름을 모른다: 다른 점은 entry.chat 과 게임 훅으로만 받는다.

export function createChatLog(max) {
  const items = [];
  return {
    add(item) {
      items.push(item);
      if (items.length > max) items.shift();
    },
    list: () => items.map((x) => ({ ...x })),
  };
}

// 길이 -> chatCheck -> 속도(1초 1개·10초 5개, 계정 기준) -> 기록 -> 방송. chatOwn 이 있으면 그 게임이 전부 한다.
// spec = 관전 계정: chatOwn 게임이어도 이 길(Shell 은 대기·결과 중에만 부른다). chatCheck·chatKind 는 그대로 탄다(자리 없는 사람).
export function handleChat(shell, session, text, spec = false) {
  const { impl, entry, hub } = shell;
  if (impl.chatOwn && !spec) return impl.chatOwn(session, text) ?? null;
  const max = entry.chat?.maxLen ?? 120;
  if ([...text].length > max) return `채팅은 1~${max}자여야 합니다.`;
  const why = impl.chatCheck?.(session);
  if (why) return why;
  const t = hub.now();
  // Kept on the account, not the socket, so reconnecting or taking over does not reset it.
  const times = session.chatTimes.filter((x) => t - x < 10_000);
  const last = times.at(-1);
  if (times.length >= 5 || (last !== undefined && t - last < 1000)) return '채팅을 너무 빨리 보내고 있습니다';
  times.push(t);
  session.chatTimes = times;
  const kind = impl.chatKind?.(session);
  shell.chatLine({ id: session.id, name: session.user.name, text, ts: t, ...(kind !== undefined ? { kind } : {}) });
  return null;
}
