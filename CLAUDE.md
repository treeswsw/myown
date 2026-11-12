# 갱식 클럽 — 작업 규칙 (모든 세션이 따른다)

실시간 카드게임 웹사이트. Node `ws` 서버(server/, shared/) + Vite/three.js 화면(client/).
Render 무료 요금제 + Neon Postgres. 기획 문서는 docs/SPEC.md (뒤 절이 앞 절보다 우선).
사용자는 개발자가 아니다. 보고는 쉬운 한국어로, 짧게. 화면 모양·연출·실기기 확인은 사용자가 한다.
일반적인 팀 운영 방식은 스킬 `agent-team-dev`를 따른다. 이 파일은 이 저장소에만 해당하는 내용이다.

## 역할
- 관리자(메인 대화): 기획 확정, 작업 분배, 병합, 최종 확인, 보고. 코드를 직접 쓰지 않는다.
- Sonnet: 코드 작성. 과제 1개 = 새 에이전트 1개, 항목 3개 이하, 20분 이내 분량. 재사용 금지.
- Opus: 과제별 diff를 병합 전에 검토. 버그·규칙 위반만 막고 나머지는 대기열로.
- Fable: 기획 결정, 배포 직전 최종 확인(요청 항목 ↔ 병합 결과 대조), 특수 연출(anim/special).
- 메인이 Fable이 아니면 기획 결정과 최종 확인은 Fable 서브에이전트에게 맡긴다.

## 구역 (과제 하나는 구역 하나만 건드린다)
- 서버: server/, shared/, test/*.test.js, test/e2e/
- 로비: client/src/ui/lobby.*, avatarCrop.js
- 채팅: client/src/ui/chat.*
- 이모티콘·사운드: client/src/ui/emotePanel.*, client/src/media.js, audio.js
- 게임 UI: client/src/ui/hud.js, cluster.js, wheel.js, bluff.js, pins.js
- 3D·연출: client/src/scene/, client/src/anim/
- UI 시험: test/ui/, client/src/mock.js
- 통합(한 번에 한 에이전트만): client/src/main.js, style.css, ui/dom.js, index.html,
  net.js, state.js, vite.config.js, package.json, docs/, CLAUDE.md

## 분배
- 코드 쓰는 에이전트는 모두 isolation: "worktree". 자기 브랜치에 커밋만 하고 푸시하지 않는다.
- 통합 파일 변경이 필요하면 직접 고치지 말고 반환 보고에 "어디에 무엇을"로 적는다.
  병합 후 통합 담당 에이전트 하나가 모아서 반영한다.
- 통신 메시지가 바뀌면 관리자가 먼저 SPEC 7절에 모양을 적고, 그다음 서버·화면을 병렬로 띄운다.
- docs/SYNC.md는 관리자만 쓴다(에이전트 반환 보고를 옮겨 적는다).
- 실행 중인 에이전트에게 새 요청을 덧붙이지 않는다.
  빈 구역이면 새 에이전트, 작업 중인 구역이면 대기열, 진행 작업이 무효가 되면 중단 후 재시작.
- 병합 순서: 반환 → Opus 검토 → 작업 브랜치에 병합 → npm run check.
  충돌·실패는 관리자가 고치지 않고 새 Sonnet에게 넘긴다.

## 검증
- 병합 조건: npm run check 통과 (빌드 + 단위 시험 + CSS 검사 + 클릭 스모크, 60초 이내 목표).
- 전체 npm test(약 3분)는 서버·shared 변경 과제와 배포 직전에만.
- 3D 스크린샷, 여러 화면 크기 순회는 하지 않는다(사용자가 요청할 때만).
- 화면 과제의 완료 판정은 실제 앱(?nogl=1 + 실제 서버)의 test/ui/smoke.mjs로 한다.
  데모 페이지(*-demo.html)나 ?mock= 만으로 완료라 하지 않는다.
- 새 버튼·화면을 만들면 smoke.mjs에 클릭 한 줄을 추가한다.
- 보고에는 반드시 등급을 붙인다:
  ① 자동 시험 통과 ② 실제 서버 클릭 확인 ③ 가짜 데이터 화면만 확인 ④ 미확인(실기기 확인 필요)
- 3D 모양·연출·소리·iPad/Safari는 항상 ④. "확인했다"고 쓰지 않는다.

## CSS
- 모듈 CSS는 접두사 필수: 로비 .lb-, 채팅 .chat-, 이모티콘·사운드 .ep-. 새 모듈은 새 접두사.
- 전역 클래스는 style.css에만. 같은 클래스 이름을 두 파일에 정의하지 않는다.
- zoom 속성 금지(Safari에서 깨짐). 크기 조절은 transform: scale(var(--k)) 또는 calc(px * var(--k)).
- #ui 는 pointer-events: none. 눌러야 하는 요소는 스스로 pointer-events: auto 또는 .hit.
  `#ui > *` 같은 넓은 선택자로 pointer-events를 바꾸지 않는다.

## 기획 (새 게임·기능은 코드 전에 아래를 SPEC에 적는다)
인원·중간 입장·관전 / 칩 위치·입장 금액·0칩 처리 / 시간제한 / 끊김·퇴장·재접속 /
판 종료·게임 종료·승자 / 결과 표시 방식과 시간 / 방 입장 방식·방장 / 동점·올인 예외 /
저장·초기화 / 지원 기기 / 소리·연출 / 완성 확인 시나리오 3~5개.
정해지지 않은 항목은 기본값을 제안하고 사용자의 "이대로"를 받은 뒤 시작한다.
규칙을 바꾸는 요청은 SPEC을 먼저 고치고 서버 → 시험 → 화면 순서로 반영한다.

## 배포
- Render는 `main`을 배포한다. `main` = 사이트에 올라간 판.
- 작업 브랜치 `claude/awesome-tesla-yeb0y1`(또는 세션이 정한 작업 브랜치)에는 자유롭게 커밋·푸시한다.
- 검토와 check, 배포 직전 전체 npm test, Fable 최종 확인을 통과한 묶음만 `main`으로 올린다:
  git push origin HEAD:main (fast-forward만. 강제 푸시 금지)
- main 푸시는 묶음당 1회. 배포 때 서버가 재시작되어 진행 중인 방이 끊긴다는 점을 사용자에게 알린다.
- 그 밖의 브랜치로 푸시하려면 사용자 허락이 있어야 한다.

## 사용자 보고
- 접수 즉시: 몇 건, 어떻게 나눴는지, 예상 시간.
- 배포 시: 항목별 "고침 / 등급 / 직접 확인할 것" + 커밋 번호(화면 구석 번호와 같음).
- 하지 못한 것, 확인하지 못한 것을 먼저 적는다.
