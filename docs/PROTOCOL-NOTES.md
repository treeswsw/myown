# 통신 규약 보충 (SPEC 7장에 더해진 점)

SPEC과 충돌하지 않는 추가·구체화만 적는다. 화면 담당과 주고받은 내용은 `docs/SYNC.md`에도 있다.

## event 메시지

`{t:'event', e:{k:'<종류>', ...}}`. 종류는 `e.k`. (SPEC의 `emote{id,e}`와 이름이 겹치지 않게 종류 키를 `k`로 둠.)

| k | 필드 |
|---|---|
| `deal` | `dealer` |
| `blinds` | `sb{id,amount}`, `bb{id,amount}` |
| `action` | `id`, `a`(fold/check/call/raise), `amount`(이번 베팅 라운드의 내 총 베팅액). 올인도 call/raise로 오고 직후 `allin{id}` |
| `allin` | `id` |
| `street` | `street`(1~3), `cards` |
| `showdown` | `shown{id:[c,c]}` |
| `win` | `winners[{id,amount,handName,cards}]`, `pot`. 쇼다운 없이 끝나면 `handName:null`, `cards:[]` |
| `bust` | `id`, `by` |
| `bluffDeal` | `round`, `tableRank`, `turn` |
| `bluffPlay` | `id`, `count` |
| `liar` | `caller`, `by` |
| `reveal` | `by`, `caller`, `cards`, `lie`, `loser`, `dead`, `shots` |
| `shot` | `id`, `dead`, `shots` |
| `bluffWin` | `id` |
| `emote` | `id`, `e` |
| `chat` | `id`, `name`, `text`, `ts`(epoch ms). 방 전체(관전자·보낸 사람 포함)에 event로만 가고 `room`은 따로 오지 않는다 |
| `chatLog` | `items[{id,name,text,ts}]`(최근 30개, 오래된 순). 입장·재접속한 본인에게만 한 번. 비어 있으면 `[]` |

한 번의 처리 결과는 event들을 순서대로 보낸 뒤 `room` 전체 상태를 한 번 보낸다. 이모티콘은 event만 보낸다.

## room.state

- `players[]`에는 현재 모드의 필드만 들어간다(홀덤: `stack bet folded allin isDealer cards`, 블러핑: `alive handCount shots`).
- 홀덤 `pot`/`pots`는 이미 모인 칩만이다. 현재 베팅 라운드의 베팅은 `players[].bet`에 있고 라운드가 끝나면 팟으로 합쳐진다. 판이 끝나면(`result` 있음) 전체 팟(`pots`에 안 불린 베팅 환급 1건 포함 가능).
- `toCall`은 보는 사람 기준. `minRaiseTo`/`maxRaiseTo`는 보는 사람이 레이즈할 수 있을 때만 값이 있고 아니면 0. 레이즈 불가인데 올인(콜)만 가능한 경우 `allin` 요청은 가능한 만큼 콜로 처리한다.
- 블러핑 벌칙 직후에는 `reveal`이 채워지고 `turn:null`, `turnEndsAt:null`인 상태가 약 4초 이어진 뒤 새 라운드(`round` 증가)가 배분된다.
- 홀덤 결과 표시 시간: 쇼다운이 있으면 11초(`RESULT_MS`), 모두 폴드로 끝났으면 4초(`RESULT_FOLD_MS`) + 올인 런아웃으로 깐 카드 장면당 1.7초(`STREET_MS`) + 승자가 둘 이상이면 추가 승자당 2.5초(`TIE_EXTRA_MS`) + 탈락자가 있으면 3초(`BUST_EXTRA_MS`).
- 블러핑 종료 후 `phase:'result'`에서 6초(`BLUFF_RESULT_MS`) 뒤 `lobby`.

## 에러·검증

- 형식이 틀린 메시지, 로그인 전 요청, 차례가 아닌 행동 등은 상태를 바꾸지 않고 `{t:'error', msg}`(한국어)만 보낸다. 초당 20개 초과 메시지는 응답 없이 버린다.
- 접속이 끊긴 사람과 판 도중 들어온 사람은 다음 판부터 참가한다(`spectating`). 직전 연결은 같은 아이디가 새로 접속하면 오류 메시지 후 끊긴다.

## 타이머 환경 변수

`GRACE_MS`(60000) `ROOM_LIST_MS`(500) `ROOM_GC_MS`(60000) `RESULT_MS`(11000) `RESULT_FOLD_MS`(4000) `TIE_EXTRA_MS`(2500) `BLUFF_RESULT_MS`(6000) `BUST_EXTRA_MS`(3000) `STREET_MS`(1700) `REVEAL_MS`(4000). `PORT=0`이면 임의 포트를 쓰고 시작 시 `listening on <port>`를 출력한다.

## 알려진 한계

- 서버 재시작 시 방과 테이블에 올려둔 칩(방을 나가기 전 스택)은 사라진다. 계정의 `bank`는 저장된다.
- 아바타(최대 60KB)가 `room` 상태마다 실려 간다. 실제 160×160 JPEG는 보통 10KB 안팎이다.

## 연결 종료 코드

같은 아이디로 새로 접속하면 이전 연결은 오류 메시지 뒤 `close(4001, 'replaced')`로 닫힌다. 클라이언트는 4001에서 자동 재접속하지 않는다.

## 채팅

클라이언트 `{t:'chat', text}`. 서버는 제어 문자(줄바꿈 포함)와 보이지 않는 서식 문자(너비 0 공백, 방향 표시 등. 이모지용 U+200D만 유지)를 지우고 앞뒤 공백을 자른 뒤 1~120자(글자 수)만 받는다. 지운 뒤 눈에 보이는 글자가 없으면 거절한다. 아이디당(재접속·같은 아이디 새 접속으로 초기화되지 않음) 1초에 1개, 10초에 5개를 넘으면 `error`("채팅을 너무 빨리 보내고 있습니다")이고 버려진다. 방에 있을 때 모든 단계에서 가능하며 게임 상태와 차례 타이머에는 영향이 없다. 기록은 방 메모리에만 있고 방이 사라지면 함께 사라진다.

## 차례 시간제한 없음 (SPEC 13)

`turnEndsAt`은 항상 `null`이다. 접속 중인 사람의 차례에는 자동 행동이 없고 `TURN_MS`는 삭제되었다. 접속이 끊긴 사람은 끊긴 시점부터 `GRACE_MS`(60초) 뒤에 방에서 제거되며, 그 시점에 차례였다면 먼저 자동 행동(체크 가능하면 체크, 아니면 폴드 / 블러핑은 첫 카드 1장, 손패가 없으면 LIAR)을 한다. 차례가 끊긴 사람에게 넘어와도 이 60초 시계 하나만 적용된다. 60초 안에 같은 아이디로 재접속하면 취소된다. 접속이 끊긴 사람은 새 판/게임에는 참가하지 않으므로, 모두 끊기면 60초 뒤 방이 비고 `ROOM_GC_MS` 뒤 삭제된다.

## 방 목록

방 밖의 로그인 사용자에게 `{t:'rooms', list:[{code, mode, hostName, count, max, phase}]}`. `phase`는 `lobby|playing|result`, `max`는 홀덤 6 / 블러핑 4(가득 찬 방은 `count===max`). 사람이 없는 방(삭제 대기)은 제외한다. 로그인 직후와 방을 나온 직후에는 바로, 이후에는 목록이 실제로 바뀔 때 0.5초에 한 번으로 묶어 보낸다. 방 안에 있는 사람에게는 보내지 않는다. 입장은 `{t:'join', code}`이고 진행 중인 방에 들어가면 `spectating:true`로 다음 판/게임부터 참가한다.

## 칩과 탈락 (SPEC 14)

- `me.user.bank` = 계정 칩 전부. 은행/테이블 스택 구분과 5,000 입장 제한, 무료 리필은 없다(`stats.refills`는 호환용으로 항상 0). 판이 진행되는 동안 `bank`는 그 판 시작 시점 값이고, 판이 끝나거나 중간에 나갈 때 갱신되며 `me`가 다시 온다. 실시간 스택은 `room.players[].stack`.
- 홀덤 `players[].eliminated` = 계정 칩이 0. 판이 끝나는 상태에서 바로 true가 되고 `bust{id, by}`(by = 그 판 최다 획득자) 이벤트가 같이 온다. 탈락자와 칩 0 입장자는 딜되지 않고 `spectating:true`. 칩 0 계정은 홀덤 방을 만들 수 없다(error "칩이 없습니다. 새 아이디로 다시 시작하세요"). 칩은 저장되므로 재로그인해도 복구되지 않는다.
- 탈락으로 칩 가진 사람이 1명이 되면 결과 표시 뒤 `{k:'champion', id}`와 함께 `lobby`로 돌아간다. 홀덤 `start`는 접속 중이고 칩이 있는 사람이 2명 이상일 때만 가능하다.
- 진행 중 입장은 이번 판 관전 후 다음 판 자동 참가(칩이 있을 때). 중간 퇴장·유예 만료는 폴드(낸 칩은 팟에 남고, 남은 스택은 즉시 계정 칩으로 복귀), 블러핑은 탈락 처리.
- 중간 퇴장은 올인한 사람도 예외 없이 폴드다(이미 낸 칩은 몰수되어 남은 사람들의 팟이 된다). 폴드/퇴장한 사람은 어떤 팟에도 받을 자격이 없고 환급(콜 받지 못한 베팅 반환)도 받지 못한다. 그가 낸 칩 중 살아 있는 사람이 맞추지 못한 단계의 칩은 그 아래 팟에 합쳐져 남은 사람에게 간다.
