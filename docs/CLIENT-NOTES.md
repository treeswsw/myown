# 클라이언트 메모

- 구조: `scene/`(three.js 장면: room, table 동기화, chips, art), `ui/`(DOM HUD), `anim/`(이벤트 큐, 승리, special/ = 몸 연출), `mock.js`(개발용).
- 데이터 흐름: `net` → `main.handle`. `event`는 `anim/events.js` 큐에서 순서대로 재생되고, 재생 중에는 `room`을 보류했다가 큐가 비면 `applyRoom`으로 한 번에 반영한다(연출이 상태보다 앞서지 않게). 이모티콘은 큐를 거치지 않는다. 탭이 숨겨져 있으면 이벤트를 버린다.
- `street`/`showdown` 이벤트는 보류 중인 상태에 보드·공개 패를 부분 적용(`applyPartial`)해 차례로 보여 준다.
- 내 자리는 항상 가까운 쪽 가운데(SPEC 8). 시안의 5인 화면은 내 자리가 왼쪽 앞이라 위치가 다르다.
- 팟 칩 더미는 `room.pot` 그대로, 숫자 라벨도 같은 값이다.
- 개발: `?mock=holdem|bluff&state=preflop|default|peek|board|raise|win|allin|bust|shot|shotsafe`.
- 지연 방지: 이벤트가 큐에서 2.5초를 넘기거나 5개를 넘으면 남은 연출을 버리고(`special.skipAll`, 오버레이·보류 제거) 최신 room을 바로 반영한다. 프레임 시간이 3초 구간 평균 50ms를 넘으면 저사양 모드(몸 연출 없이 소리·글자·사진 뒤집기만, 블룸·그림자 끄고 픽셀비 1). `&fx=full`로 강제 해제.
- 로비(대기방)가 보이는 동안 핀과 HUD는 숨긴다. 내 벌칙/탈락 연출 중에는 블러핑 손패가 아래로 내려간다.
