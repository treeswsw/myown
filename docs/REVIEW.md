# 코드 검토 기록 (검토자 소유)

심각도: 차단(게임이 깨지거나 부정 가능) / 중요(규칙·규약 오류, 견고성) / 권장(품질)
상태: 열림(발견, 미전달) / 전달됨(담당자에게 보냄) / 해결됨(코드에서 확인)

## 검토 회차

- 1회차: 소스 없음. SPEC·SYNC·시안 확인.
- 2회차: shared 엔진 4개, server protocol/store/rooms, 로비·크롭, e2e 일부 검토. 발견 1-9 전달.

## 발견 사항

| # | 심각도 | 위치 | 내용 | 담당 | 상태 |
|---|---|---|---|---|---|
| 1 | 중요 | server/rooms.js:178-183, 241-257; shared/holdem.js:156-162; shared/bluff.js:120 | 런아웃 street들·showdown·win, LIAR→reveal→shot→다음 bluffDeal이 한 묶음으로 즉시 전송되고 결과 타이머(6초)가 바로 시작. 연출 시간이 잠식되고 새 라운드 차례 30초가 리볼버 연출 중에 흐름 | 서버 | 전달됨 |
| 2 | 중요 | server/rooms.js:350-356 | 베팅 중 `pots`가 현 스트리트 베팅과 미콜 베팅(refund)까지 포함해 가짜 사이드팟이 보임(프리플랍부터 BB 50짜리 팟) | 서버 | 전달됨 |
| 3 | 권장 | server/rooms.js:465-466, 73-97 | 그레이스 만료로 방에서 나간 세션이 hub.sessions에 영구히 남음(메모리 누수) | 서버 | 전달됨 |
| 4 | 권장 | server/rooms.js:202, 250 | 방을 나간 뒤에도 접속 중인 사용자에게 판 종료 후 `me`가 안 감(conn:null 가짜 세션) | 서버 | 전달됨 |
| 5 | 권장 | server/rooms.js:94 → armTurn | 누가 나갈 때마다 현재 차례 타이머가 30초로 초기화됨. 관전자 입장/퇴장 반복으로 AFK 차례를 무한 지연 가능 | 서버 | 전달됨 |
| 6 | 권장 | shared/cards.js:1 | shared/가 node:crypto에 의존 → 브라우저에서 import 불가. globalThis.crypto 사용 권장 | 서버 | 전달됨 |
| 7 | 질문 | shared/holdem.js:47 | BB가 100 미만 올인일 때 curBet이 SB/BB 중 큰 값 → 다른 사람이 100이 아닌 금액으로 콜 가능. 의도인지 | 서버 | 전달됨 |
| 8 | 권장 | client/src/ui/avatarCrop.js:4,17 | 클라이언트는 이진 55KB 기준, 서버는 data URL 문자열 61,440자 기준(validAvatar) → 약 45~55KB 이미지는 서버 거절. `url.length <= 60*1024`로 맞출 것 | 로비 | 해결됨 |
| 9 | 권장 | client/src/ui/lobby.js:16-21, 55-71 | dom.js의 h/avatar와 중복 구현 | 로비 | 해결됨 |
