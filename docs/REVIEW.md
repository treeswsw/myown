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
- 7~8회차: 채팅 범위 추가 후 보류(코드 없음). 화면 21·22 반영 확인.
- 9회차(최종): [서버]·[화면] 완료 후 전체 확인. `npm test` 80/80 통과, `npm run build` 성공(번들 680KB 한 덩어리). 누출 재확인: 남의 홀 카드는 쇼다운 공개분만, 덱·탄 위치·남의 블러핑 손패는 어떤 상태·이벤트에도 없음. 차단·중요 미해결 0건.

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
| 18 | 중요 | test/e2e/bluff.test.js:38 | reveal 대기 중 turn=null을 실패로 판정(서버 동작이 맞음) | QA | 해결됨(e2e 24/24 통과) |
| 19 | 권장 | test/e2e/holdem.test.js:55-68 | leave 후 400ms 고정 대기 → 부하 시 칩 보존 오탐 | QA | 해결됨(e2e 24/24 통과) |
| 20 | 권장 | server/protocol.js:20-23 | 아바타 base64 길이·JPEG 시그니처 미검사 | 서버 | 해결됨 |
| 21 | 권장 | client/src/ui/pins.js:85 | 차례 링이 서버 시각 turnEndsAt과 기기 Date.now()를 직접 비교 → 기기 시계 오차만큼 틀림 | 화면 | 해결됨(처음 본 시점 기준, 아래 23 참고) |
| 22 | 권장 | client/src/anim/events.js(allin) vs server/rooms.js endHand 대기 | 올인 2회+런아웃+승리 연출 ≈13초 > 서버 대기 ≈9.6초 → 다음 판 휠이 몇 초 늦게 뜸 | 화면 | 해결됨(한 판의 두 번째 올인부터 칩만 밀기) |
| 23 | 권장 | client/src/ui/pins.js:45 | 링 기준 시각을 room 적용 시점에 잡음 → 연출 중 보류된 만큼 남은 시간을 길게 표시(서버가 먼저 자동 폴드). 수신 시각 기준으로 | 화면 | 해결됨(수신 시 noteTurn) |

## 채팅 검토

10회차: SPEC 12, PROTOCOL-NOTES 채팅, SYNC `[서버] 채팅`·`[채팅]` 기준으로 server/protocol.js, server/rooms.js, test/chat.test.js, client/src/ui/chat.js·chat.css, main.js, pins.js(`anchor`) 확인. `npm test` 87/87 통과, `npm run build` 성공(번들 686KB). 말풍선 배경 스타일은 작업 중이라 제외.

확인된 것(문제 없음)
- 사용자 글은 모두 `h()`(dom.js:4-9, 텍스트 노드)로만 들어간다. 말풍선·토스트(`: ${text}`도 텍스트 노드)·기록·대기 막대 모두. innerHTML은 `svg()`의 고정 아이콘 문자열뿐. 링크 변환 없음.
- 서버: 문자열이 아니면 거절, 원문은 `MAX_RAW`/`maxPayload` 70,000자에서 먼저 잘림. `\p{Cc}`(줄바꿈 포함) 제거 → trim → 1자 이상, 코드 포인트 120개 이하. 😀×120(UTF-16 240단위)은 통과, ×121은 거절(직접 확인). ZWJ 가족 이모지는 1개가 7코드 포인트라 17개까지. 크기는 최대 240 UTF-16 단위로 묶이므로 문제 없음.
- 이벤트의 `name`은 `session.user.name`(서버 저장값). 로그인 전 `먼저 로그인하세요.`, 방 밖 `방에 들어가 있지 않습니다.`. 거절된 채팅은 시간 기록에 안 들어감.
- `chat()`은 `sendEvents`만 부르고 `push`·타이머·게임 상태를 건드리지 않음. 기록은 30개에서 shift. `chatLog`는 join(room 다음)과 login 재접속(room 다음) 때 그 세션에게만, 그 방의 것만. 방 객체와 함께 GC(빈 방 60초 후 `rooms.delete`).
- 클라이언트: 입력창 keydown은 `isComposing`/229에서 무시, Enter는 preventDefault 후 submit, 빈 값·`#`만은 막음, 버튼 포커스 Enter는 전역 단축키에서 제외 → 이중 전송 없음. 전역 Enter는 INPUT/TEXTAREA/BUTTON/SELECT/A 포커스와 `.crop-overlay`에서 제외. 휠(레이즈 다이얼)은 포인터 전용이라 키 충돌 없음. chat/chatLog는 `animator.push` 전에 분기해 큐·뒤처짐 방지(events.js:114)를 거치지 않음. `#` 해석은 push·setLog 모두 같은 `norm`. 말풍선 수는 보낸 사람당 속도 제한으로 묶이고 animationend에서 제거, 토스트 최대 3개.

| # | 심각도 | 위치 | 내용 | 기대 수정 | 담당 | 상태 |
|---|---|---|---|---|---|---|
| 24 | 중요 | server/rooms.js:485, 589-593 (login 528-552) | 속도 제한 기록 `chatTimes`가 연결(conn)에 있어 같은 아이디로 새 소켓을 열어 인수(takeover)할 때마다 초기화됨. 인수에는 DB 조회도 없어 순식간에 반복 가능. 20번 인수 + 매번 채팅 → 같은 시각에 20개 모두 방에 전달됨(직접 재현). 30개 기록도 바로 덮어씀 | `chatTimes`를 session(아이디)에 두기. PROTOCOL-NOTES "연결당"을 "아이디당"으로 고치고 인수 후에도 제한이 이어지는 테스트 추가 | 서버 | 열림 |
| 25 | 중요 | client/src/main.js:79; client/src/ui/chat.js:127-137, 182-189 | 방을 나가 `room:null`이 되면 `chat.close()`와 아이콘 숨김만 하고 모드를 되돌리지 않음. (a) 대기실에서 나가면 `mode==='lobby'`가 남아 메인 로비 화면에 대기 막대(이전 방 최근 3줄 + 입력창)가 그대로 보이고 `html.chat-docked`도 남아 로비 패널 높이가 줄어듦. (b) 방 밖에서도 전역 Enter가 `open()`을 불러 입력창이 뜸(게임 중 나간 경우 오른쪽 위 막대). 보내면 `방에 들어가 있지 않습니다.`. (c) `log`가 비워지지 않음 | applyRoom(null)에서 `chat.setMode('game')`과 `chat.setLog([])` 호출, 그리고 chat에 활성 여부(예: `setEnabled(false)`)를 두어 방 밖에서는 전역 Enter·open을 무시 | 화면(채팅) | 열림 |
| 26 | 권장 | client/src/ui/chat.js:66-76, 219-221; main.js:140 | `update()`가 매 프레임 슬롯마다 `offsetWidth/offsetHeight`를 읽고 바로 `style.transform`을 씀. 바로 앞의 `pins.frame()`이 transform·`potLabel.textContent`·fontSize를 쓰므로 말풍선이 하나라도 있으면 매 프레임 강제 레이아웃, 슬롯이 여럿이면 읽기·쓰기 교차로 슬롯 수만큼 스타일 재계산 | 말풍선 크기는 생성 시(또는 ResizeObserver로) 한 번 재서 슬롯에 저장하고 update에서는 읽지 않기. 최소한 모든 슬롯을 먼저 읽고 나중에 쓰기 | 화면(채팅) | 열림 |
| 27 | 권장 | server/protocol.js:73-74 | `\p{Cc}`만 지워 `\p{Cf}`(U+200B 등 폭 없는 문자, U+202E 등 bidi 제어)가 통과. U+200B만 보내면 빈 말풍선, `#`+U+200B는 "`#`만은 안 보냄" 규칙을 우회해 빈 큰 말풍선, RLO로 글자 순서 뒤집기 가능(이름은 별도 요소라 이름 위조까지는 안 됨) | U+200D(이모지 ZWJ)를 뺀 `\p{Cf}`도 제거하고, 남은 글에 보이는 글자가 없으면 거절. 클라이언트 `norm`도 같은 기준 | 서버 | 열림 |
| 28 | 권장 | client/src/ui/chat.js:29, 166-169 | 입력 `maxLength`와 글자 수 표시가 UTF-16 단위라 서버(코드 포인트)와 다름. 한글은 같지만 😀는 클라이언트에서 60개까지만, 표시도 "120/120" | 서버와 같이 `[...value].length`로 세고 maxLength 대신 input에서 잘라내기(또는 차이를 문서에 명시) | 화면(채팅) | 열림 |
| 29 | 권장 | client/src/ui/chat.js:44, 102-107, 131; chat.css:5 | 토스트가 `col` 안에 있어 대기 모드(`col.hidden` → display:none)로 바뀌면 애니메이션이 취소되고 animationend가 안 옴. 다음 판에서 col이 다시 보이면 지난 토스트가 처음부터 다시 재생됨(최대 3개라 누수는 아님) | setMode에서 `toasts.replaceChildren()`, 또는 토스트를 `layer`처럼 숨겨지지 않는 곳에 두기 | 화면(채팅) | 열림 |
| 30 | 권장 | server/rooms.js:23 | `CHAT_LOG = 30` 주석이 "messages per second per connection"으로 잘못됨(기록 개수) | 주석 수정 | 서버 | 열림 |
| 31 | 권장 | test/chat.test.js:23-31, 67, 71-96, 124-131 | (a) 120자 테스트가 `x`·`가`(BMP)뿐이라 `[...text].length`를 `text.length`로 바꿔도 통과 → 😀×120 통과/×121 거절 추가. (b) 67행 `notEqual(phase==='playing' && turnEndsAt, …)`은 시간 초과 뒤 항상 `false`라 의미 없는 단언(실제 검증은 65·68행). 채팅 직후 `turnEndsAt` 그대로인지 단언할 것. (c) "per connection"은 다른 사용자로만 확인 → 24 수정 후 같은 아이디 인수 시 제한 유지 테스트. (d) "every phase"는 lobby·playing만, result/reveal 없음. (e) 다른 방에 chat·chatLog가 안 가는지 테스트 없음 | 위 항목 보강 | QA·서버 | 열림 |
| 32 | 질문 | client/src/ui/chat.css:108 | 동작 줄이기에서 큰 말풍선이 흔들리는 `chat-big`을 쓰던 부분 | 작업 중 `chat-big-rm`으로 바뀐 것 확인 | 화면(채팅) | 해결됨 |
