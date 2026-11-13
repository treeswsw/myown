# 갱식 클럽 — 작업 규칙

실시간 카드게임 웹사이트. Node `ws` 서버(server/, shared/) + Vite/three.js 화면(client/).
Render 무료 요금제 + Neon Postgres. 기획 문서는 docs/SPEC.md (뒤 절이 앞 절보다 우선).
사용자는 개발자가 아니다. 보고는 쉬운 한국어로, 짧게.
새 게임을 추가하거나 게임 사이에 겹치는 기능을 고칠 때는 docs/NEW-GAME.md (공용 부품·예외 표·확장성 조건)를 따른다.

일하는 방식 전체(역할, 분배, 검토, 검증, 보고)는 스킬 `agent-team-dev`를 따른다
(.claude/skills/agent-team-dev/SKILL.md). 아래는 이 저장소에만 해당하는 내용이다.

## 구역 (과제 하나는 구역 하나만 건드린다)
- 서버: server/, shared/, test/*.test.js, test/e2e/ (공용 방 틀 server/room/{shell,chat,media}.js, 포커 방 server/poker/, 공통 표 시험 test/common/·test/room/)
- 공용 방 틀(화면): client/src/room/(frame·wait·bar·faces·float, CSS .rm- .wr-), client/src/ui/kit/(창·알림·프로필, .ui-), client/src/sound/core.js. 약속은 docs/COMMON-CONTRACT.md
- 로비: client/src/ui/lobby.*, avatarCrop.js
- 채팅: client/src/ui/chat.*
- 이모티콘·사운드: client/src/ui/emotePanel.*, client/src/media.js, audio.js
- 게임 UI(포커): client/src/poker/index.js, client/src/ui/hud.js, cluster.js, wheel.js, bluff.js, pins.js
- 라이어게임: shared/liar/, server/liar/, client/src/liar/, test/liar/, scripts/build-words.mjs, docs/liar/ (한 과제는 그 안의 한 모듈만. 구역 나눔·모듈 접두사는 docs/liar/GDD.md 대로: 설정 .lg-st-, 첫 발언 .lg-fs-, 상단 표시 .lg-hud-, 역할 .lg-role-, 투표 .lg-vt-, 결과 .lg-rs-, 랭킹 .lg-rk-, 규칙 .lg-rule-, 이모티콘 .lg-em-, 정체 공개 .lg-um-, 엔딩 .lg-ed-. 라이어 CSS 클래스는 전부 `.lg-`)
- 요트다이스: shared/yacht/, server/yacht/, client/src/yacht/, test/yacht/, docs/yacht/ (한 과제는 그 안의 한 모듈만. 모듈·접두사는 docs/YACHT-PLAN.md 1절:
  규칙 shared/yacht/{constants,score,game,protocol}.js, 굴림 계산기 shared/yacht/sim.js, 점수표 .yt-sc-, 결과 .yt-rs-, 판 .yt-bd-, 연출 .yt-fx-, 3D 모델 client/src/yacht/scene/. 요트 CSS 클래스는 전부 `.yt-`)
- 갱식마인드: shared/draw/, server/draw/, client/src/draw/, test/draw/, docs/draw/, design/draw/ (한 과제는 그 안의 한 모듈만. CSS 는 전부 .dr-, 모듈 접두사 GDD 11-1)
- 코인(SPEC 22절, 모든 게임 공용): shared/coin/, server/coin/, client/src/coin/, test/coin/ (CSS 지갑·랭킹 .cn-, 뽑기 .gc-, 상점 .sh-, 비밀번호 .pn-, 꾸미기 .lk-, 칭호 효과 .tfx-, 캡슐 .cp-). 판 끝 정산은 게임이 공용 방 틀의 ctx.finish(rows) 를 판마다 한 번 부른다(docs/COMMON-CONTRACT.md 1-3). 코인 규칙은 shared/coin/rules.js + 등록표 coin 키. 무작위는 hub.rng(crypto)만.
- 미니게임: shared/mini/, server/mini/, client/src/mini/, test/mini/, docs/mini/ (CSS 는 전부 .mn-)
- 3D·연출: client/src/scene/, client/src/anim/ (anim/special 은 Fable)
- UI 시험: test/ui/, client/src/mock.js
- 관리자(SPEC 21절): 서버 틀 server/admin/*.js, 게임별 봇 server/admin/games/<모드>.js (한 과제는 한 게임만), 시험 test/admin/, 화면 client/src/ui/admin.*(.adm-), 연출 목록 client/src/admin/
- 갱스껄: shared/gsk/, server/gsk/, client/src/gsk/, test/gsk/, docs/gsk/, design/gsk/ (한 과제는 그 안의 한 모듈만. CSS 는 전부 .gk-, 모듈 접두사 GDD 10절)
- 통합(한 번에 한 에이전트만): 게임 등록표 shared/games.js·server/games.js·client/src/games.js, client/src/main.js, style.css, ui/dom.js, index.html,
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

## 라이어게임 (같은 사이트 안의 두 번째 게임)
- 스위치 환경 변수 `LIAR`: `off`(화면·서버 흔적 없음) / `test`(주소에 `?liar=1` 일 때만 버튼 보임) / `on`.
  기본 on(2026-11-13 사용자 요청으로 공개, 끄려면 LIAR=off/test). render.yaml 도 `on`. 규칙은 docs/liar/GDD.md, 옮긴 방법은 docs/LIAR-MOVE.md.
- 반드시 지킬 약속: "다른 제시어" 방식의 라이어는 정체 공개 전까지 자신이 라이어인지 알 수 없다(화면·문구·순서·소리·서버 메시지 모양까지 시민과 같게, test/liar/leaks.test.js).
  남의 제시어·역할은 그 사람 기기에 보내지 않는다. 라이어·순서·자리·단어는 crypto 난수만(Math.random 금지). 시간은 서버가 잰다. 사용자 글자는 textContent 로만.
- 라이어 전용 요청은 전부 `{t:'lg', a: 종류, ...}`. 라이어 방 상태에는 프로필 사진을 넣지 않는다(`faces` 알림).
- 화면 연결: 공용 방 틀(client/src/room/frame.js)이 등록표의 `import('./liar/index.js')` 로 따로 불러와 `mount(ctx)` 한다(포커만 하는 사람은 받지 않는다). 대기실·상단 줄(.rm-bar)·채팅 칸은 틀이 그린다.
- `npm test` 는 라이어 한 판(test/ui/liar-round.mjs)을 포함한다. 새 라이어 화면이 생기면 거기에도 클릭 한 줄을 추가한다.
- 라이어 폴더는 이 저장소가 원본이다(2026-11-13 gamemine 과 같게 유지하던 약속을 풀었다).

## 요트다이스 (같은 사이트 안의 세 번째 게임)
- 스위치 환경 변수 `YACHT`: `off` / `test`(주소에 `?yacht=1` 일 때만 버튼 보임) / `on`(설정이 없을 때의 값). render.yaml 은 `on`(2026-11-13 사용자 지시로 모두에게 공개, 플레이하며 수정).
  규칙은 docs/yacht/GDD.md, 통신은 SPEC 19절.
- 반드시 지킬 약속: 눈·seed·차례 순서는 서버가 crypto 난수로만(요트 폴더에 Math.random 금지). 화면은 서버가 준 눈과 멈춘 자리로 끝낸다.
  모든 사람(관전자 포함)이 같은 트레이·같은 주사위 자리·같은 움직임을 본다. 움직이는 것은 주사위와 컵뿐. 차례인 사람만 조작(화면에 버튼이 없고 서버도 거절).
  점수 칸은 두 번 눌러 기록하고 첫 누름(선택)은 방 전체에 보인다. 차례 시간 제한 없음(자동 굴림·기록 없음). 끊긴 사람 차례는 멈추고 기다리며, 끊긴 지 60초(GRACE_MS)면 기권.
  가로 전용(세로는 사이트 #rotate 안내, 세로 배치 없음). 휴대폰 가로는 점수표 두 덩어리. 시간은 서버가 잰다. 사용자 글자는 textContent 로만.
- 요트 전용 요청은 전부 `{t:'yt', a: 종류, ...}`. 요트 방 상태에는 프로필 사진을 넣지 않는다(`faces` 알림).
- 화면 연결: 공용 방 틀이 `import('./yacht/index.js')` 의 `mount(ctx)` 를 부른다. 상단 줄은 공용 .rm-bar(왼쪽은 점수표 `--yt-sheet-w` 만큼 비움, 등록표 `bar.leftVar`). 3D 무대(stage.use 는 하나)는 틀의 불러오기 줄 하나가 차례를 지킨다.
- `npm test` 는 요트 한 판(test/ui/yacht-round.mjs)을 포함한다. 새 요트 화면이 생기면 smoke.mjs 와 거기에 클릭 한 줄을 추가한다.
- 3D 주사위·컵·소리·저사양 폰은 항상 "미확인(실기기 확인 필요)"으로 보고한다. `?nogl=1` 은 2D 판으로 끝까지 된다.

## 갱식마인드 (같은 사이트 안의 네 번째 게임, 그림 맞히기)
- 스위치 환경 변수 `DRAW`: `off`(흔적 없음) / `test`(주소에 `?draw=1` 일 때만 버튼 보임) / `on`(기본 on, 끄려면 DRAW=off. Render 는 기존 서비스에 render.yaml 환경 변수를 반영하지 않아 서버 기본값 자체를 on 으로 함). 규칙·통신은 docs/draw/GDD.md (10절이 약속), 사이트 쪽 요약은 SPEC 20절.
- render.yaml 은 `on`(2026-11-13 사용자 요청으로 공개). 서버 기본값은 그대로 `off`.
- 반드시 지킬 약속: 단어는 그리는 사람 기기(와 이미 맞힌 사람)에만 보낸다. 맞히기 전 사람에게 정답 글·정답자끼리 채팅을 보내지 않는다(test/draw/leaks.test.js). 시간·정답 판정은 서버. 무작위는 crypto 난수만. 사용자 글자는 textContent 로만.
- 단어는 server/liar/words.json 을 읽기만 한다(고치거나 옮기지 않는다). 이름은 shared/draw/name.js 한 곳.
- 화면 연결: 공용 방 틀이 `import('./draw/index.js')` 의 `mount(ctx)` 를 부른다. 전용 요청은 전부 `{t:'dr', a: 종류, ...}`. 게임 중 채팅은 엔진 몫(`chatOwn`), 대기실·최종 순위는 공용 채팅.
- `npm test` 는 갱식마인드 한 판(test/ui/draw-round.mjs)을 포함한다.
- 선 느낌·펜슬·손바닥·키보드·모션·소리는 항상 "미확인(실기기 확인 필요)"으로 보고한다.

## 갱스껄 (같은 사이트 안의 다섯 번째 게임, 해골 피하기 블러핑)
- 스위치 환경 변수 `GSK`: `off`(흔적 없음) / `test`(주소에 `?gsk=1` 일 때만 버튼 보임) / `on`. 서버 기본값 `on`, render.yaml 도 `on`(2026-11-13 사용자 요청으로 모두에게 공개, 끄려면 GSK=off/test. Render 는 기존 서비스에 환경 변수를 반영하지 않아 서버 기본값 자체를 on 으로 함). 규칙·통신은 docs/gsk/GDD.md (9절 통신, 4절 비밀), 사이트 쪽 요약은 SPEC 23절.
- 반드시 지킬 약속: 공개 전 원판 종류·손 구성·버린 종류는 그 사람 기기 밖으로 보내지 않는다(test/gsk/leaks.test.js). 시간·판정은 서버, 무작위는 crypto 난수만. 사용자 글자는 textContent 로만. 갱스껄 방 상태에는 프로필 사진을 넣지 않는다(`faces` 알림).
- 전용 요청은 전부 `{t:'gk', a: 종류, ...}`. 이름은 shared/gsk/name.js 한 곳.
- 화면 연결: 공용 방 틀이 `import('./gsk/index.js')` 의 `mount(ctx)` 를 부른다. 상단 줄은 공용 .rm-bar, 색 고르기는 대기실 칸 `waitPart('gk-color')`.
- `npm test` 는 test/gsk/ 와 test/gsk-seam.test.js 를 포함한다. 게임 화면 안쪽 클릭은 화면이 확정된 뒤 smoke.mjs 에 붙인다.
- 3D·연출·소리·iPad/Safari 는 항상 "미확인(실기기 확인 필요)"으로 보고한다.

## 미니게임 (같은 사이트 안의 여섯 번째 모드: 오목·리버시·체커·체스·커넥트포, 2명)
- 스위치 환경 변수 `MINI`: `off` / `test`(주소에 `?mini=1` 일 때만 보임) / `on`(기본 on). render.yaml 도 `on`. 약속·규칙·통신은 docs/mini/PLAN.md.
- 구역: shared/mini(규칙), server/mini(방), client/src/mini(화면, boards/ 는 판 그림), test/mini. CSS 는 `.mn-`. 전용 요청은 전부 `{t:'mn', a: 종류, ...}`, 오류 코드 `mn_`.
- 방 만들기는 `{t:'create', mode:'mini', game}`. 방 상태에 프로필 사진을 넣지 않는다(`faces` 알림).
- 화면 연결: 공용 방 틀이 `import('./mini/index.js')` 의 `mount(ctx)` 를 부른다. 상단 줄·채팅·이모티콘은 공용, 종목 고르기는 대기실 설정(`set`).
- test/ui/smoke.mjs 에 미니게임 한 판(커넥트포) 클릭이 있다. 판 모양·소리·터치 느낌은 "미확인(실기기 확인 필요)".

## CSS
- 접두사: 로비 .lb-, 채팅 .chat-, 이모티콘·사운드 .ep-. 새 모듈은 새 접두사.
- 전역 클래스는 style.css에만. 같은 클래스를 두 파일에 정의하지 않는다.
- zoom 속성 금지(Safari). 크기 조절은 transform: scale(var(--k)) 또는 calc(px * var(--k)).
- #ui 는 pointer-events: none. 눌러야 하는 요소가 스스로 auto 또는 .hit.
  `#ui > *` 같은 넓은 선택자로 pointer-events를 바꾸지 않는다.

## 브랜치와 배포
- 개발: claude/wizardly-maxwell-ksh6e1 (배포되지 않음, 자유롭게 푸시, 항상 check 통과 상태 유지).
- 배포: main (Render 자동 배포). 검토·check·npm test·최종 확인을 통과한 묶음만
  git push origin HEAD:main 으로 올린다. 강제 푸시, main 직접 커밋 금지.
- 배포하면 서버가 재시작되어 진행 중인 방이 끊긴다. 사용자가 시험 중이면 먼저 묻는다.
- 그 밖의 브랜치로 푸시하려면 사용자 허락이 필요하다.
