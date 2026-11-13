// index.js 의 순수 함수(CSS 를 가져오지 않아 node 시험에서 불러올 수 있다).


// 채팅 칸에 친 글이 어디로 가는가: 내 첫 설명 차례면 say, 아니면 일반 채팅.
export function chatMsgFor(state, text) {
  if (state?.phase === 'speak' && state.speaker != null && state.speaker === state.you) return { t: 'lg', a: 'say', text };
  return { t: 'chat', text };
}

// 글 앞의 크기 표시(`#` 한 개 또는 `*` 1~3개)를 뗀다. 뗀 뒤 남는 글이 없으면 원문 그대로.
export function plainChat(text) {
  const t = String(text ?? '');
  const out = t.replace(/^(?:#|\*{1,3})\s*(?=\S)/, '');
  // 표시뿐(`***`, `#*` 등)이면 원문 그대로. 서버 stripSizeMark(server/liar/room.js)와 같은 규칙
  return /[^\s#*]/u.test(out) ? out : t;
}

// 알림 하나에 틀 소리 이름(없으면 null). 역할과 무관하다.
export function soundForEvent(e, you) {
  switch (e?.k) {
    case 'phase': return 'phase';
    case 'turn': return e.id === you ? 'myTurn' : 'turn';
    case 'vote': return 'vote';
    case 'accused': return 'accused';
    case 'judge': return 'judge';
    case 'judged': return e.executed ? 'executed' : 'spared';
    case 'guess': return e.correct ? 'guessOk' : 'guessNo';
    default: return null;
  }
}

// result 단계에 처음 들어갈 때 틀 소리. 무효 판은 소리 없음.
export function resultSound(state) {
  if (state?.phase !== 'result') return null;
  if (state.result?.winner === 'void') return null;
  return state.result?.champions?.length ? 'champion' : 'win';
}

