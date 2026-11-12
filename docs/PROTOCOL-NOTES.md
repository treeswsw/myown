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

한 번의 처리 결과는 event들을 순서대로 보낸 뒤 `room` 전체 상태를 한 번 보낸다. 이모티콘은 event만 보낸다.

## room.state

- `players[]`에는 현재 모드의 필드만 들어간다(홀덤: `stack bet folded allin isDealer cards`, 블러핑: `alive handCount shots`).
- 홀덤 `pot`/`pots`는 이미 모인 칩만이다. 현재 베팅 라운드의 베팅은 `players[].bet`에 있고 라운드가 끝나면 팟으로 합쳐진다. 판이 끝나면(`result` 있음) 전체 팟(`pots`에 안 불린 베팅 환급 1건 포함 가능).
- `toCall`은 보는 사람 기준. `minRaiseTo`/`maxRaiseTo`는 보는 사람이 레이즈할 수 있을 때만 값이 있고 아니면 0. 레이즈 불가인데 올인(콜)만 가능한 경우 `allin` 요청은 가능한 만큼 콜로 처리한다.
- 블러핑 벌칙 직후에는 `reveal`이 채워지고 `turn:null`, `turnEndsAt:null`인 상태가 약 4초 이어진 뒤 새 라운드(`round` 증가)가 배분된다.
- 홀덤 결과 표시 시간: 6초 + 올인 런아웃으로 깐 카드 장면당 1.2초 + 탈락자가 있으면 3초.
- 블러핑 종료 후 `phase:'result'`에서 6초 뒤 `lobby`.

## 에러·검증

- 형식이 틀린 메시지, 로그인 전 요청, 차례가 아닌 행동 등은 상태를 바꾸지 않고 `{t:'error', msg}`(한국어)만 보낸다. 초당 20개 초과 메시지는 응답 없이 버린다.
- 접속이 끊긴 사람과 판 도중 들어온 사람은 다음 판부터 참가한다(`spectating`). 직전 연결은 같은 아이디가 새로 접속하면 오류 메시지 후 끊긴다.

## 타이머 환경 변수

`TURN_MS`(30000) `GRACE_MS`(60000) `ROOM_GC_MS`(60000) `RESULT_MS`(6000) `BUST_EXTRA_MS`(3000) `STREET_MS`(1200) `REVEAL_MS`(4000). `PORT=0`이면 임의 포트를 쓰고 시작 시 `listening on <port>`를 출력한다.

## 알려진 한계

- 서버 재시작 시 방과 테이블에 올려둔 칩(방을 나가기 전 스택)은 사라진다. 계정의 `bank`는 저장된다.
- 아바타(최대 60KB)가 `room` 상태마다 실려 간다. 실제 160×160 JPEG는 보통 10KB 안팎이다.
