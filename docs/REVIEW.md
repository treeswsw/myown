# 코드 검토 기록 (검토자 소유)

심각도: 차단(게임이 깨지거나 부정 가능) / 중요(규칙·규약 오류, 견고성) / 권장(품질)
상태: 열림(발견, 미전달) / 전달됨(담당자에게 보냄) / 해결됨(코드에서 확인)

## 검토 회차

- 1회차: 소스 없음. SPEC·SYNC·시안 확인.
- 2회차: shared 엔진 4개, server protocol/store/rooms, 로비·크롭, e2e 일부 검토. 발견 1-9 전달.
- 3회차: server/index.js, 클라이언트 main/net/events/wheel/bluff/hud/dom, special/index.js 검토. 1-6, 8-9 해결 확인. 단위 테스트 55/55 통과(직접 실행), `npm test`는 실패, vite build 성공. 발견 10-16 전달.
- 4회차: e2e 24개 중 8개 실패 분석. 서버 크래시(17) 재현, 블러핑 e2e 단언은 테스트 쪽 오류(18), 홀덤 칩 보존은 단독 실행 시 통과(부하 시 불안정). special 13·14(연출 쪽) 반영 확인.
- 5회차: 11·12(종료 코드 4001, 재연결 안 함)·14·15·17(빈 팟은 생존자에게 + 타이머 guard)·20 해결 확인. 퍼즈 2만 판 이상 없음. 단위+e2e 80개 중 79 통과, 남은 1개도 직후 수정 확인. 10(`npm test`)은 아직 열림.
- 6회차: [서버] 완료 확인. package.json test 수정, render.yaml·README 확인. 7·10 해결.

## 발견 사항

| # | 심각도 | 위치 | 내용 | 담당 | 상태 |
|---|---|---|---|---|---|
| 1 | 중요 | server/rooms.js:178-183, 241-257; shared/holdem.js:156-162; shared/bluff.js:120 | 런아웃 street들·showdown·win, LIAR→reveal→shot→다음 bluffDeal이 한 묶음으로 즉시 전송되고 결과 타이머(6초)가 바로 시작. 연출 시간이 잠식되고 새 라운드 차례 30초가 리볼버 연출 중에 흐름 | 서버 | 해결됨 |
| 2 | 중요 | server/rooms.js:350-356 | 베팅 중 `pots`가 현 스트리트 베팅과 미콜 베팅(refund)까지 포함해 가짜 사이드팟이 보임(프리플랍부터 BB 50짜리 팟) | 서버 | 해결됨 |
| 3 | 권장 | server/rooms.js:465-466, 73-97 | 그레이스 만료로 방에서 나간 세션이 hub.sessions에 영구히 남음(메모리 누수) | 서버 | 해결됨 |
| 4 | 권장 | server/rooms.js:202, 250 | 방을 나간 뒤에도 접속 중인 사용자에게 판 종료 후 `me`가 안 감(conn:null 가짜 세션) | 서버 | 해결됨 |
| 5 | 권장 | server/rooms.js:94 → armTurn | 누가 나갈 때마다 현재 차례 타이머가 30초로 초기화됨. 관전자 입장/퇴장 반복으로 AFK 차례를 무한 지연 가능 | 서버 | 해결됨 |
| 6 | 권장 | shared/cards.js:1 | shared/가 node:crypto에 의존 → 브라우저에서 import 불가. globalThis.crypto 사용 권장 | 서버 | 해결됨 |
| 7 | 질문 | shared/holdem.js:47 | BB가 100 미만 올인일 때 curBet이 SB/BB 중 큰 값 → 다른 사람이 100이 아닌 금액으로 콜 가능. 의도인지 | 서버 | 해결됨(콜 금액 항상 100) |
| 8 | 권장 | client/src/ui/avatarCrop.js:4,17 | 클라이언트는 이진 55KB 기준, 서버는 data URL 문자열 61,440자 기준(validAvatar) → 약 45~55KB 이미지는 서버 거절. `url.length <= 60*1024`로 맞출 것 | 로비 | 해결됨 |
| 9 | 권장 | client/src/ui/lobby.js:16-21, 55-71 | dom.js의 h/avatar와 중복 구현 | 로비 | 해결됨 |
| 10 | 차단 | package.json "test" | `node --test test/`가 Node 22에서 디렉터리 인자를 못 받아 테스트 0개 실행 후 실패 | 서버 | 해결됨(glob으로 변경) |
| 11 | 차단 | client/src/net.js:17 vs client/src/main.js:38,45 | 자동 로그인 키 불일치(`gk.id` 읽기, `gs.lastId` 쓰기) → 새로고침·재연결 시 로그인 안 됨, 끊긴 자리 복귀 불가 | 화면 | 해결됨 |
| 12 | 차단 | server/rooms.js:517 + client/src/net.js:22-25 | 같은 아이디 두 탭: 서버가 옛 소켓을 닫고 클라이언트는 무조건 재연결·재로그인 → 서로 무한히 쫓아냄. 종료 코드 4001 + 재연결 안 함으로 합의 요청 | 서버·화면 | 해결됨 |
| 13 | 중요 | client/src/anim/special/index.js (sfx('…') 호출) vs client/src/main.js:63 | special은 sfx를 함수로 호출, 호스트는 객체를 넘김 → TypeError로 onHit/onResult/shake 미실행(탈락·리볼버 결과 표시 안 됨), 프레임 렌더 건너뜀 | 화면·연출 | 해결됨(연출 쪽 방어 + main.js 어댑터) |
| 14 | 중요 | client/src/anim/events.js:212-219, main.js:84,108 | 백그라운드 탭에서 rAF 정지 → special 약속이 안 끝나 큐 정체, room 갱신 보류, 복귀 시 밀린 연출 재생 중 차례 시간 초과 | 화면·연출 | 해결됨 |
| 15 | 권장 | client/src/anim/events.js:207 | 이모티콘이 연출 큐에 들어가 수 초 지연, busy()로 room 갱신도 막음 | 화면 | 해결됨 |
| 16 | 질문 | client/src/anim/events.js:147 | `deal` 이벤트가 소리만 냄. SPEC 9 카드 배분 연출 구현 위치 | 화면 | 해결됨(table.sync에서 dealerSpot 기준 배분) |
| 17 | 차단 | shared/holdem.js:166-190, 226-229; server/rooms.js:219 | 유일한 생존자가 팟에 0을 낸 상태(블라인드들이 forceFold)에서 모든 팟 eligible=[] → 칩 증발 + winners=[] → endHand에서 TypeError, 타이머 콜백이라 서버 프로세스 전체 종료. 엔진 퍼즈로 재현 | 서버 | 해결됨 |
| 18 | 중요 | test/e2e/bluff.test.js:38 | reveal 대기 중 turn=null을 실패로 판정(서버 동작이 맞음) | QA | 전달됨 |
| 19 | 권장 | test/e2e/holdem.test.js:55-68 | leave 후 400ms 고정 대기 → 부하 시 칩 보존 오탐 | QA | 전달됨 |
| 20 | 권장 | server/protocol.js:20-23 | 아바타 base64 길이·JPEG 시그니처 미검사 | 서버 | 해결됨 |
| 21 | 권장 | client/src/ui/pins.js:85 | 차례 링이 서버 시각 turnEndsAt과 기기 Date.now()를 직접 비교 → 기기 시계 오차만큼 틀림 | 화면 | 전달됨 |
| 22 | 권장 | client/src/anim/events.js(allin) vs server/rooms.js endHand 대기 | 올인 2회+런아웃+승리 연출 ≈13초 > 서버 대기 ≈9.6초 → 다음 판 휠이 몇 초 늦게 뜸 | 화면 | 전달됨 |
