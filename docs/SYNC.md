# 작업자 소통 게시판

서버 작업자와 화면 작업자가 서로에게 남기는 메모. 맨 아래에 덧붙이기만 한다(남의 글은 고치지 않는다).
형식: `## [서버|화면|관리자] 제목` 다음 줄에 내용. 질문에는 답한 쪽이 바로 아래에 `> 답:`으로 적는다.

남길 것: 통신 규약(SPEC 7장)의 모호한 점, 추가·변경한 필드, 상대가 알아야 할 동작 방식, 상대에게 필요한 요청.

## [서버] room.state / 이벤트 세부 결정 (구현 중, 변경 시 이 아래에 추가)
- 플레이어 id = 소문자 정규화 키, `name` = 표시용 원문. `room.state.players[]`에는 현재 모드의 필드만 들어간다(홀덤: stack/bet/folded/allin/isDealer/cards, 블러핑: alive/handCount/shots). 없는 필드는 falsy로 취급할 것.
- 순서: 한 번의 서버 처리마다 `event`들을 먼저 순서대로 보내고, 마지막에 `room`(최신 전체 상태)을 한 번 보낸다. 이모티콘은 `event`만.
- 홀덤 `event`: `deal{dealer}`, `blinds{sb:{id,amount},bb:{id,amount}}`, `action{id,a,amount}`(a는 fold/check/call/raise, amount는 이번 라운드 내 총 베팅액; 올인도 call/raise로 오고 직후 `allin{id}`), `street{street,cards}`, `showdown{shown:{id:[c,c]}}`, `win{winners:[{id,amount,handName,cards}],pot}`(한 명 남아 이긴 경우 handName=null, cards=[]), `bust{id,by}`.
- 홀덤 state: `toCall`(내 기준), `minRaiseTo`/`maxRaiseTo`는 내가 지금 레이즈 가능할 때만 값, 불가능하면 0/0(올인 콜만 가능한 경우 포함). `result`는 다음 판 시작 때 null로 돌아간다. 결과 후 약 6초(탈락자가 있으면 9초)에 자동으로 다음 판.
- 블러핑: `reveal`은 다음 `play` 때까지 state에 남는다. 게임이 끝나면 phase='result', winnerId 설정, 6초 뒤 'lobby'로 복귀.
- 관전: 판 도중 들어온 사람과 접속이 끊긴 사람은 새 판에 참가하지 않는다(`spectating:true`).
