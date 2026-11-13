// 글·이모티콘 허용 표 (GDD 4-4). 순수 함수: 통신·시간·난수 없음.
// g = { phase, speaker, accused }, who = { id, spectating }
// 단계: lobby reveal speak discuss revote defense judge judged unmask guess answer result

const OPEN = new Set(['lobby', 'result']); // 관전자도 모두 가능
const PLEA = new Set(['defense', 'judge', 'judged']); // 지목된 사람만 글

export function chatBlocked(g, who) {
  const phase = g?.phase;
  if (OPEN.has(phase)) return null;
  if (who?.spectating) return '판이 끝날 때까지 글을 쓸 수 없습니다.';
  if (phase === 'speak') return '첫 설명 중에는 차례가 되었을 때 설명으로만 글을 쓸 수 있습니다.';
  if (PLEA.has(phase)) return who?.id != null && who.id === g.accused ? null : '지목된 사람만 글을 쓸 수 있습니다.';
  if (phase === 'unmask') return '정체 공개 중에는 글을 쓸 수 없습니다.';
  if (phase === 'guess') return '정답 맞히기 중에는 글을 쓸 수 없습니다.';
  if (phase === 'answer') return '정답 공개 중에는 글을 쓸 수 없습니다.';
  return null; // reveal, discuss, revote
}

export function mediaBlocked(g, who, kind) {
  const phase = g?.phase;
  if (phase === 'unmask') return '정체 공개 중에는 쓸 수 없습니다.';
  if (phase === 'answer') return '정답 공개 중에는 쓸 수 없습니다.';
  if (OPEN.has(phase)) return null;
  if (kind === 'emote') return null; // 기본 이모티콘은 관전자도, 정답 맞히기 중에도 가능
  if (who?.spectating) return '관전 중에는 기본 이모티콘만 쓸 수 있습니다.';
  if (phase === 'guess') return '정답 맞히기 중에는 기본 이모티콘만 쓸 수 있습니다.';
  return null;
}

export function chatKind(g, who) {
  return PLEA.has(g?.phase) && who?.id != null && who.id === g.accused ? 'plea' : 'talk';
}
