# 갱식 클럽 — 작업 규칙

실시간 카드게임 웹사이트. Node `ws` 서버(server/, shared/) + Vite/three.js 화면(client/).
Render 무료 요금제 + Neon Postgres. 기획 문서는 docs/SPEC.md (뒤 절이 앞 절보다 우선).
사용자는 개발자가 아니다. 보고는 쉬운 한국어로, 짧게.

일하는 방식 전체(역할, 분배, 검토, 검증, 보고)는 스킬 `agent-team-dev`를 따른다
(.claude/skills/agent-team-dev/SKILL.md). 아래는 이 저장소에만 해당하는 내용이다.

## 구역 (과제 하나는 구역 하나만 건드린다)
- 서버: server/, shared/, test/*.test.js, test/e2e/
- 로비: client/src/ui/lobby.*, avatarCrop.js
- 채팅: client/src/ui/chat.*
- 이모티콘·사운드: client/src/ui/emotePanel.*, client/src/media.js, audio.js
- 게임 UI: client/src/ui/hud.js, cluster.js, wheel.js, bluff.js, pins.js
- 3D·연출: client/src/scene/, client/src/anim/ (anim/special 은 Fable)
- UI 시험: test/ui/, client/src/mock.js
- 통합(한 번에 한 에이전트만): client/src/main.js, style.css, ui/dom.js, index.html,
  net.js, state.js, vite.config.js, package.json, README.md, docs/, CLAUDE.md, .claude/
- 통신 메시지가 바뀌면 먼저 SPEC 7절에 모양을 적고, 그다음 서버·화면을 병렬로 띄운다.
- docs/SYNC.md는 관리자만 쓴다.

## 검증 명령
- npm run check : 빌드 + 단위 시험 + CSS 검사 + 클릭 스모크. 병합 조건.
- npm test : 전체(약 3분). 서버·shared 변경 과제와 main 배포 직전에만.
- 화면 완료 판정: test/ui/smoke.mjs (실제 서버 + ?nogl=1). 데모 페이지나 ?mock= 만으로는 완료가 아니다.
- 새 버튼·화면을 만들면 smoke.mjs에 클릭 한 줄을 추가한다.
- 이 환경에는 GPU가 없다. 3D 스크린샷과 화면 크기 순회는 사용자가 요청할 때만.
- 3D 모양·연출·소리·iPad/Safari는 항상 "미확인(실기기 확인 필요)"으로 보고한다.

## CSS
- 접두사: 로비 .lb-, 채팅 .chat-, 이모티콘·사운드 .ep-. 새 모듈은 새 접두사.
- 전역 클래스는 style.css에만. 같은 클래스를 두 파일에 정의하지 않는다.
- zoom 속성 금지(Safari). 크기 조절은 transform: scale(var(--k)) 또는 calc(px * var(--k)).
- #ui 는 pointer-events: none. 눌러야 하는 요소가 스스로 auto 또는 .hit.
  `#ui > *` 같은 넓은 선택자로 pointer-events를 바꾸지 않는다.

## 브랜치와 배포
- 개발: claude/awesome-tesla-yeb0y1 (배포되지 않음, 자유롭게 푸시, 항상 check 통과 상태 유지).
- 배포: main (Render 자동 배포). 검토·check·npm test·최종 확인을 통과한 묶음만
  git push origin HEAD:main 으로 올린다. 강제 푸시, main 직접 커밋 금지.
- 배포하면 서버가 재시작되어 진행 중인 방이 끊긴다. 사용자가 시험 중이면 먼저 묻는다.
- 그 밖의 브랜치로 푸시하려면 사용자 허락이 필요하다.
