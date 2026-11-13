// 라이어게임 대기실 설정 스키마 (docs/COMMON-CONTRACT.md 4-3). 공통 대기실(client/src/room/wait.js)이 이 표대로 그린다.
// 값은 서버가 주는 wait.set (= 방 설정 사본, 비밀 없음). 보낼 때는 {t:'set', patch}, 키의 점은 중첩(times.speak -> {times:{speak:30}}).
// topics 는 '고른 이름 배열' 로 보낸다(서버 어댑터가 [{name,on}] 로 바꾼다. 옛 [{name,on}] 모양도 받는다).
// node 전용·DOM 모듈을 쓰지 않는다(서버·화면·시험이 같이 읽는다).
import { TIME_CHOICES, GOAL_CHOICES } from './constants.js';

// 45 -> '45초', 120 -> '2분', 90 -> '1분 30초'
export function timeLabel(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

export const TIME_NAMES = { speak: '첫 설명', discuss: '토론·투표', rediscuss: '살린 뒤 토론', defense: '최후 변론', judge: '찬반 투표', guess: '정답 맞히기' };

const topicNames = (set) => (Array.isArray(set?.topics) ? set.topics.map((t) => t.name) : []);

export const SETTINGS = [
  { k: 'liarMode', label: '라이어 방식', group: '규칙', type: 'seg', opts: [['word', '다른 제시어'], ['notice', '라이어 알림']] },
  { k: 'wordSet', label: '제시어 묶음', group: '규칙', type: 'seg', opts: [['mine', '내 버전'], ['star', '스타 버전']] },
  { k: 'topicMode', label: '주제 방식', group: '규칙', type: 'seg', opts: [['random', '체크한 것 중 무작위'], ['host', '매판 방장이 직접']] },
  {
    k: 'topics', label: '주제 (체크한 것 중 무작위)', group: '규칙', type: 'multi',
    when: (set) => set?.topicMode !== 'host',
    opts: (set) => topicNames(set),
    get: (set) => (Array.isArray(set?.topics) ? set.topics.filter((t) => t.on).map((t) => t.name) : []),
  },
  {
    k: 'nextTopic', label: '다음 판 주제', group: '규칙', type: 'seg',
    when: (set) => set?.topicMode === 'host',
    opts: (set) => topicNames(set),
  },
  ...Object.entries(TIME_NAMES).map(([key, label]) => ({
    k: `times.${key}`, label, group: '시간', type: 'seg', opts: TIME_CHOICES[key].map((v) => [v, timeLabel(v)]),
  })),
  { k: 'goal', label: '목표 점수', group: '점수', type: 'seg', opts: GOAL_CHOICES.map((g) => [g, g === 0 ? '없음' : `${g}점`]) },
  { k: 'rank', label: '전체 랭킹', group: '점수', type: 'custom', part: 'lg-rank' }, // 화면 waitPart('lg-rank'): 랭킹 버튼(값 없음, 보내지 않음)
];

export const OWN = [];
