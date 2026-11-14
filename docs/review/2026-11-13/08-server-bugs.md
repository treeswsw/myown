# 과제 08: 서버 버그·안정성·성능·규칙 위반 (server/, shared/)

## 요약 (5줄 이내)
- 실제 오동작(높음) 1건: Postgres 에서 `getOrCreate(id)` 를 이름 없이 부르면 NOT NULL 위반으로 실패한다. 그래서 **관리자 칩·코인 주기가 접속 안 한 계정에는 배포 환경에서 항상 "서버 오류"**가 난다. 시험은 메모리 저장소만 써서 잡지 못한다.
- 서버 전체가 죽을 수 있는 길: 프로세스 수준 예외 처리기가 없다. 게다가 **끊김(ws close) 경로와 봇 정리 microtask 는 guard 밖**에서 방 코드를 돈다. 타이머만 감싸 두었다.
- DB가 응답 없이 멈추면 시간 제한이 없다. 그래서 로그인·저장 줄이 끝없이 쌓이고, 쌓인 저장마다 사용자 사본(프로필 사진 포함)을 메모리에 쥐고 있다.
- 성능: 포커(홀덤·블러핑)는 행동마다 모든 사람에게 **전원 프로필 사진이 든 상태**를 다시 보낸다. 저장(persist)도 매번 사진까지 DB에 쓴다. 방 사운드(최대 약 6MB)는 들어오거나 다시 붙을 때마다 통째로 다시 보낸다.
- 비밀 유지: 각 게임의 방송 payload 를 따라가 봤고 새 누출은 없다. 구멍 1건: 갱식마인드에서 이미 맞힌 사람의 **프로필 사진 바꾸기**는 사진 이모티콘과 달리 막히지 않는다.

## 범위와 커버리지
- 대상: `git ls-files server shared` 66개 파일.
- 끝까지 읽은 파일: 포커와 공통 서버 전부(server/index.js, protocol.js, rooms.js, store.js), 코인 서버 전부(server/coin/*), server/admin/bots.js, 각 게임 서버 방 전부(server/liar/room.js·scores.js·perms.js, server/yacht/room.js, server/draw/room.js·words.js, server/gsk/room.js, server/mini/room.js).
- shared 쪽 끝까지 읽은 것: holdem.js, bluff.js, cards.js, handeval.js, coin/* 규칙 파일, yacht/game.js·protocol.js·constants.js, gsk/game.js·protocol.js, draw/protocol.js, draw/game.js 의 대부분(60~766줄), liar/protocol.js·words.js, liar/game.js 의 앞부분과 viewFor·score·이벤트 목록, mini 5종 규칙(chess 는 apply 부분).
- 훑어본 것: yacht/sim.js(반복 상한·비용만), draw/ops.js(한도·검사만), admin/games/*.js(skip 과 yacht 두뇌), coin/items/*(데이터).
- 안 읽은 것: server/liar/words.json(단어 데이터), shared/draw/score.js·answer.js, shared/yacht/score.js(순수 계산. 서버 안정성과 무관해 건너뜀).
- 시험·서버는 돌리지 않았다(읽기 전용 규칙). "Postgres 에서만 생기는 문제"는 Postgres 실행 순서(NOT NULL 검사가 ON CONFLICT 판정보다 먼저)를 근거로 판단했고, 실제 DB로 재현하지는 않았다.

## 지금 구조 (게임별 안정성 장치)
| 게임 | 방 파일 | 타이머 | 끊김 처리 | 방 상태에 사진 | 비밀이 나가는 문 |
|---|---|---|---|---|---|
| 홀덤·블러핑 | server/rooms.js `Room` | `next`, `gc`, 사람별 grace (모두 hub.guard) | grace 60초 뒤 차례면 autoAct, 그 뒤 leave | **있음**(players[].avatar, 매 push) | `holdemView`/`bluffView` (자기 카드만) |
| 라이어 (복사본 제약) | server/liar/room.js | `game`, `gc`, grace (guard) | grace → leave, 엔진에 away/back/drop | 없음(faces) | `viewFor` |
| 요트 | server/yacht/room.js | `gc`, grace (guard) | grace → 기권+leave | 없음 | `viewOf` (눈과 seed 는 따로 뽑음) |
| 갱식마인드 | server/draw/room.js | `game`, `gc` (guard + onTimer 자체 try) | 엔진의 seatKeep/drawerAway | 없음 | `viewFor`·`chat`(sec 는 정답자에게만)·`chatLogFor` |
| 갱스껄 | server/gsk/room.js | `dl`, `gc` (guard) | 엔진 awayAt + graceMs (tick) | 없음 | `viewFor.mine` 본인만, `gkLoseMine` 본인만 |
| 미니 | server/mini/room.js | `gc`, grace (guard) | grace → 기권+leave | 없음 | 비밀 없음 |
| 코인 | server/coin/wallet.js, hooks.js | 없음 | — | — | — |

공통: 메시지는 연결마다 `conn.queue` 로 차례대로 처리하고 `.catch` 로 감싼다(rooms.js:651-657). 속도 제한은 연결당 1초 20개(그림 100개)다. 저장은 `writes` 체인 하나로 순서대로 한다(store.js:126-137).

## 발견 사항

### [높음] Postgres 에서 이름 없는 `getOrCreate(id)` 가 항상 실패해 관리자 칩·코인 주기가 접속 안 한 계정에서 깨진다
- 위치: server/store.js:180-188, server/admin/bots.js:83-84, server/rooms.js:267
- 내용: Postgres 판 `getOrCreate(id, name)` 은 먼저 `INSERT ... VALUES ($1,$2,...) ON CONFLICT (id) DO NOTHING` 을 실행한다. `name` 칸은 `text NOT NULL` 이다(store.js:142). 관리자 칩·코인 주기(bots.js:84 `hub.store.getOrCreate(msg.id)`)와 홀덤 정산의 오프라인 경로(rooms.js:267 `getOrCreate(seat.id)`)는 이름을 넘기지 않는다. 그러면 `$2` 가 null 로 간다. Postgres 는 NOT NULL 검사(ExecConstraints)를 ON CONFLICT 판정보다 **먼저** 하므로, 행이 이미 있어도 23502 오류가 난다.
  - 순서: 관리자가 로그인 → 접속하지 않은 기존 아이디에 `{t:'adm',a:'coins',id,n}` 을 보낸다 → `exists` 는 true → `getOrCreate` 가 throw → dispatch catch → 관리자 화면에 "서버 오류가 발생했습니다", 코인은 안 들어감.
  - test/admin/give.test.js:31-37 이 바로 이 "오프라인" 경우를 시험하지만 메모리 저장소(`createStore(undefined)`)라서 통과한다. 메모리판은 이미 있는 행이면 새로 만들지 않기 때문이다.
  - rooms.js:267 은 실제로는 delta 가 0 인 경우가 대부분이라 거의 도달하지 않는다. 도달하면 칩 차이가 사라지고 'settle failed' 로그만 남는다.
- 분류: 버그
- 제안: 기존 행을 읽기만 하는 `store.get(id)` 를 따로 두고 bots.js·rooms.js 는 그것을 쓴다. 또는 `getOrCreate` 에서 `name ?? id` 로 채운다(이름이 바뀌지 않게 ON CONFLICT 쪽은 그대로).
- 위험: `name ?? id` 로 고치면 혹시 새로 만들어지는 행의 표시 이름이 소문자 key 가 된다. bots.js 는 `exists` 확인 뒤라 새로 만들어질 일은 없다.

### [중간] 프로세스 수준 처리기가 없고, 끊김 경로·봇 정리 microtask 가 guard 밖이라 방 코드의 예외 하나가 서버 전체를 끝낸다
- 위치: server/index.js:82-94(ws `close` → `conn.close()`), server/rooms.js:663-670(`conn.close` → `s.room.setConnected(s.id,false)`), server/admin/bots.js:169-173, 239-242(queueMicrotask 안에서 `admin.clearRoom` / `bot.leave` → `room.leave`). `process.on('uncaughtException'|'unhandledRejection')` 는 server/ 어디에도 없다(grep 확인).
- 내용: 타이머는 `hub.guard` 로, 요청은 `conn.queue.catch` 로 감싸 놓았다. 하지만 소켓이 닫힐 때(브라우저 닫기, heartbeat terminate, 배포 종료)는 EventEmitter 에서 동기로 각 방의 `setConnected(false)` 가 돈다. 그 안에서 라이어 `notifyEngine→act`, 갱식마인드 `run→tick→apply`(단어 뽑기·다음 문제까지 갈 수 있음), 갱스껄 `tick`, 포커 `push→view` 가 실행된다. 여기서 예외가 나면 잡는 곳이 없어 Node 프로세스가 끝난다. Render 가 다시 띄우지만 모든 방이 사라진다. 봇 정리 microtask 의 예외도 같다. 지금 바로 터지는 입력은 찾지 못했다. 그래서 "안전망 부재"로 중간에 둔다(갱식마인드 onTimer 는 같은 위험 때문에 따로 try 를 둠, draw/room.js:107-113).
- 분류: 버그(의심) / 안정성
- 제안: `conn.close` 와 `setConnected` 호출을 `hub.guard` 로 감싼다(rooms.js:668 한 곳). bots.js 두 microtask 에도 try/catch 를 넣는다. index.js 에는 로그만 남기는 `process.on('uncaughtException')`·`unhandledRejection` 을 둔다.
- 위험: 예외를 삼키면 방 상태가 반쯤 바뀐 채 남을 수 있다. 그래도 서버 전체가 죽는 것보다 낫다.

### [중간] DB 가 멈추면(응답 없이) 시간 제한이 없어 로그인·저장이 끝없이 쌓인다
- 위치: server/store.js:123(`new pg.Pool({ connectionString, ssl })`, `connectionTimeoutMillis`·`query_timeout`·`statement_timeout` 없음), store.js:126-137(쓰기 체인 하나), store.js:207(`exists` 는 `await writes`), rooms.js:712(배포 설정 startCoins=20 이라 모든 새 로그인이 `exists` 를 기다림), rooms.js:651(연결마다 메시지 직렬 처리)
- 내용: Neon 연결이 오류 없이 멈추면(반만 열린 TCP, 무료 요금제 깨어나기 지연이 길어질 때) `save` 하나가 끝나지 않는다. 그러면 뒤의 모든 저장과 `exists`·랭킹·`ledgerFor` 가 체인 뒤에서 기다린다.
  - 결과 ① 새로 로그인하는 사람은 전부 응답 없음.
  - 결과 ② 그 사람 연결의 메시지 줄이 막혀 채팅·게임 요청도 모두 멈춤.
  - 결과 ③ 체인에 쌓인 저장마다 `structuredClone(user)`(프로필 사진 최대 60KB 포함)를 쥐고 있어 메모리가 계속 는다. 예: 홀덤 6명 × 판마다 저장이면 시간당 수십 MB.
- 분류: 안정성 / 성능
- 제안: Pool 에 `connectionTimeoutMillis: 5000`, `query_timeout: 10000` 정도와 `idleTimeoutMillis` 를 준다. 같은 사용자에 대해 줄에 남은 저장은 마지막 것만 남기는 방식(coalesce)도 생각할 만하다.
- 위험: 시간 제한으로 실패한 저장은 로그만 남고 버려진다(지금도 오류 시 그렇다).

### [중간] 포커 방은 행동마다 모든 사람에게 전원 프로필 사진을 보내고, 모든 저장이 사진까지 다시 쓴다
- 위치: server/rooms.js:422-425(`common` 에 `avatar: m.session.user.avatar`), 409-413(`push` 가 매 행동마다 전원에게 `view`), 42·530(`publicUser` 가 `me` 에 사진 포함, `sendMe` 는 판 끝·정산·코인마다 호출), store.js:189-196(`save` 가 avatar 칸까지 매번 UPDATE)
- 내용: 사진은 160×160 JPEG 로 보통 10~20KB, 최대 60KB(client/src/ui/avatarCrop.js:3-12)다. 홀덤 6명이면 상태 하나가 약 60~360KB이고, 6명에게 보내면 체크·콜 한 번에 0.4~2MB를 JSON.stringify 하고 내보낸다. Render 무료 CPU·대역폭을 갉아먹는다. 다른 게임은 `faces` 알림으로 한 번만 보낸다. 저장 쪽은 홀덤 한 판마다 앉은 사람 수만큼 `persist` 를 하고(rooms.js:248·259), 매번 사진 문자열을 Neon 으로 보낸다.
- 분류: 성능 / 불일치(다른 게임은 faces 방식)
- 제안: 포커 화면도 `faces` 알림을 쓰도록 바꾸고 상태에서 avatar 를 뺀다(서버·화면 동시 과제). 저장은 사진이 바뀔 때만 avatar 칸을 쓰도록 나누거나, 다른 칸만 UPDATE 하는 쿼리를 둔다.
- 위험: 포커 화면(client/src/ui, scene)이 `players[].avatar` 를 직접 읽는다. 통합 구역과 화면 구역을 함께 고쳐야 한다(SPEC 7절 먼저).

### [중간] 갱식마인드: 이미 맞힌 사람이 프로필 사진을 바꾸면 맞히기 전 사람에게 그대로 간다(사진 이모티콘은 막혀 있음)
- 위치: server/rooms.js:807-815(`avatar` 는 `mediaBlocked` 검사 없이 `room.faceChanged`), server/draw/room.js:262-265(`faceChanged` → 전원에게 `faces`), shared/draw/game.js:639-647(`mediaCheck` 는 DRAW 단계 정답자의 'media' 를 막음), rooms.js:30(`MEDIA` 에 avatar 없음)
- 내용: GDD 10-6 은 정답자의 사진 이모티콘·사운드를 막는다. 그림으로 답을 흘리는 것을 막으려는 뜻이다. 그런데 같은 정답자가 `{t:'avatar', data}` 로 답을 쓴 사진을 올리면 `faces` 가 전원에게 즉시 간다. 그리는 사람도 같다(drawer_mute 우회). 라이어의 정체 공개·정답 공개 중 매체 금지(perms.js:62-65)도 같은 방식으로 우회된다.
- 분류: 규칙 위반(공정성 구멍)
- 제안: dispatch 의 `avatar` 처리에서 방에 있으면 `room.mediaBlocked?.(session, 'pemote')` 를 먼저 묻는다. 또는 방 안에서는 `faces` 방송을 다음 단계로 미룬다.
- 위험: 게임 중 사진 바꾸기가 거절되면 화면에 오류 글이 뜬다. 문구가 필요하다.

### [중간] 방 사운드가 방마다 최대 약 6MB 를 메모리에 두고, 들어오거나 다시 붙을 때마다 통째로 보낸다
- 위치: server/rooms.js:38·91-93·97-106(같은 코드가 liar/room.js:124-126·173-182, yacht/room.js:82-84·248-257, draw/room.js:253·401-410, gsk/room.js:84-86·232-241, mini/room.js:69·189-198 에 복사), protocol.js:165(MAX_SOUND 200KB 문자열)
- 내용: 방당 24개 × 최대 약 200KB 이고, sndAdd 이벤트·sndList 사본까지 생긴다. `sendExtras` 는 재접속(login, rooms.js:761)마다 `sndList` 전체를 다시 보낸다. 와이파이가 흔들려 몇 번 다시 붙으면 그때마다 수 MB가 나간다. 방 10개가 가득 차면 상주 메모리만 60MB 이상이다(512MB 한도). 계정당 10초 1개 제한(rooms.js:903)이 있어 친구끼리 쓰는 규모에서는 당장 위험하지 않다.
- 분류: 성능
- 제안: 재접속 때는 sid·이름 목록만 보내고 data 는 화면이 요청할 때 보낸다. 또는 방 전체 사운드 바이트에 상한(예: 2MB)을 둔다.
- 위험: 화면의 사운드 패널이 sndList 의 data 를 바로 쓴다고 가정하고 있을 수 있다.

### [중간·의심] 느린 연결에 대한 배압(backpressure)이 없다
- 위치: server/index.js:86(`send: (text) => { if (ws.readyState === ws.OPEN) ws.send(text); }`)
- 내용: `ws.bufferedAmount` 를 보지 않는다. 회선이 느린 iPad 하나가 포커 방(위 항목)이나 그림 그리기 이벤트(초당 최대 50)를 못 따라가면, 그 소켓의 송신 버퍼가 서버 메모리에 계속 쌓인다. heartbeat(30초)는 pong 만 오면 끊지 않는다. 실제로 얼마나 쌓이는지는 실기기·실회선 확인이 필요하다.
- 분류: 성능(의심)
- 제안: `bufferedAmount` 가 일정 값(예: 4MB)을 넘으면 그 소켓을 끊는다. 끊기면 grace 가 돌고 다시 붙으면 상태를 새로 받는다.
- 위험: 너무 낮게 잡으면 큰 sndList·drSync 를 받는 정상 사용자도 끊긴다.

### [낮음] 서버 코인 코드에 Math.random 대체값이 남아 있다
- 위치: server/coin/wallet.js:32 (`const rng = hub?.rng ?? Math.random;`)
- 내용: CLAUDE.md 는 코인 무작위를 hub.rng(crypto)만 쓰라고 한다. 지금 부르는 곳(rooms.js:530 `walletOf(s.user, hub)`, wallet.js:282 `stockOf(u, hub)`)은 모두 hub 를 넘기므로 실제로는 쓰이지 않는다. 다만 hub 없이 부르면 조용히 Math.random 으로 상점 진열을 굴린다.
- 분류: 규칙 위반(잠재)
- 제안: 대체값을 지우고 rng 가 없으면 throw 한다.
- 위험: hub 없이 `walletOf(user)` 를 부르는 시험이 있으면 깨진다(test/ 확인 필요).

### [낮음·의심] `getOrCreate` 는 밀린 저장을 기다리지 않아 빠른 재로그인 때 옛 행을 읽을 수 있다
- 위치: server/store.js:180-188(`await writes` 없음; `exists`·`getMeta` 등은 기다림), server/rooms.js:712-713
- 내용: 방 밖에서 연결이 닫히면 세션은 바로 지워진다(rooms.js:669). 직전에 큐에 들어간 저장(예: 뽑기로 코인 차감)이 아직 DB에 닿기 전에 다시 로그인하면, `getOrCreate` 의 SELECT 가 저장 전 행을 읽는다. 그 뒤 그 옛 값으로 저장하면 코인이 되살아나거나 사라진다.
  - 지금 배포는 startCoins=20 이라 로그인이 먼저 `exists()`(`await writes` 포함)를 거친다. 우연히 막혀 있는 셈이다. startCoins 를 0 으로 바꾸거나 시험 설정이면 열린다.
- 분류: 버그(잠재)
- 제안: `getOrCreate` 첫 줄에 `await writes.catch(() => {})` 를 넣는다.
- 위험: 거의 없음(로그인이 저장 대기만큼 늦어짐).

### [낮음] 랭킹 요청은 제한 없이 전체 테이블을 window 함수로 훑는다
- 위치: server/rooms.js:795-805(`lg rank`), server/coin/wallet.js:313-322(`coin rank`), store.js:104-119
- 내용: 한 사람이 1초에 20번까지 보낼 수 있고, 매번 전체 users 를 정렬한다. 가입자가 적은 지금은 문제가 없다. 계정은 아이디를 쳐 보기만 해도 생기므로 행이 계속 늘어난다.
- 분류: 성능
- 제안: 결과를 5~10초 캐시하거나 사람당 간격을 둔다(tooSoon 재사용).
- 위험: 없음.

### [낮음] 지워지지 않는 Map 들 (아주 작음)
- 위치: server/coin/wallet.js:74-78(`lastEarn`·`lastDraw`·`lastCap`·`lastPos`·`lastStock`), server/coin/pin.js:43(`locks`, 성공 시에만 지움)
- 내용: 한 번이라도 요청한 아이디마다 항목이 남는다. 항목 하나가 수십 바이트라 실제 위험은 없다. pin `locks` 는 틀린 비밀번호를 친 아이디마다 남는다.
- 분류: 누수(사소)
- 제안: 오래된 항목을 가끔 지우거나, 세션이 사라질 때 같이 지운다.
- 위험: 없음.

### [낮음] 체스 상태의 `reps`(반복 기록)가 수마다 커지고 매 push 마다 전원에게 간다
- 위치: shared/mini/chess.js:181-184, server/mini/room.js:257(`mn: this.mn` 통째로)
- 내용: 수마다 위치 키(약 70자)가 하나씩 늘어난다. 200수면 상태가 10KB 이상이다. 화면에는 필요 없다.
- 분류: 성능(사소)
- 제안: 보낼 때 `reps` 를 뺀다(view 에서 `{...this.mn, reps: undefined}`).
- 위험: 화면이 reps 를 읽는지 확인 필요.

### [낮음] 라이어 방이 빈 채로 GC 를 기다릴 때 판 상태를 비우지 않는다 (복사본 제약 있음)
- 위치: server/liar/room.js:249-253
- 내용: 마지막 사람이 나가면 `game` 타이머만 지운다. `this.game` 은 남는다. 60초 안에 누군가 코드로 들어오면, 모두 drop 된 판이 그대로 보인다. 엔진은 3명 미만이면 결과로 가므로 멈추지는 않을 것으로 보인다(엔진 drop 경로 확인 필요). 요트·갱스껄·포커는 비슷한 경우에 정리한다.
- 분류: 불일치(의심)
- 제안: 고치지 말고 총괄 판단(라이어 폴더는 gamemine 과 같게 유지).
- 위험: —

### [낮음] hooks.js 의 갱식마인드 설명이 사실과 다르다
- 위치: server/coin/hooks.js:239-240("before anyone can join mid-game") ↔ shared/draw/game.js:141-163(판 도중 입장 허용)
- 내용: 동작은 맞다. `starters` 를 판 시작 직후에 적으므로 도중 입장자는 빠진다. 설명만 틀렸다.
- 분류: 불일치(문서)
- 제안: 주석을 "도중 입장자는 starters 에 없으므로 0" 으로 고친다.
- 위험: 없음.

## 공통화 제안 (이 과제와 관련된 것만)
- **하나로 묶을 것 (가 우연한 차이)**:
  - `setTimer/clearTimer`, `addSound/editSound/playSound/emote/chat/sendEvents/sendFaces/sendExtras` 가 6개 방 파일에 거의 같은 글자로 복사돼 있다(rooms.js, yacht, draw, gsk, mini; liar 는 복사본 제약).
  - `intRng` 가 liar/room.js:36-45 와 draw/room.js:25-34 에 같은 코드로 있다.
  - 위의 "사운드 재전송" "배압" "guard" 를 한 곳에서 고치려면 `server/common/roomKit.js`(가칭)에 소리·이모티콘·채팅·faces 를 두고 각 방이 부르면 된다.
- **예외로 남길 것 (나 규칙상 의도)**:
  - 라이어 채팅 허용표(server/liar/perms.js, GDD 4-4).
  - 갱식마인드 채팅·정답자 비밀 채팅·매체 금지(shared/draw/game.js chat/mediaCheck, GDD 10-6).
  - 라이어 chatLog 50개(GDD 9-4) 대 다른 방 30개.
- **사용자에게 물을 것 (다)**:
  1. 갱스껄은 코인을 주지 않는다(COIN_RULES 에 gsk 없음, rooms.js:840-844 는 hookRoom 을 부르지 않음). 의도인가, 아직 안 정한 것인가?
  2. 포커 화면도 다른 게임처럼 `faces` 방식으로 바꿔도 되는가(포커 화면 수정이 필요)?

## 버린 후보 (검토했지만 문제 아님)
- parseMessage 의 예외 가능성: 모든 분기가 typeof/Array.isArray 로 먼저 거르고 JSON.parse 는 try 안에 있다. 큐 밖에서 예외가 날 길이 없다.
- `{"t":"sndAdd","t":"gk"...}` 중복 키로 70KB 한도 우회: 결과는 크기만 큰 gk 요청이고 방 검사에서 버려진다. 무해하다.
- 요트 굴림 계산기(sim.js): 최대 8번 시도 × 300단계 × 5개 주사위다. 수십 ms 안쪽이고 차례당 3번까지라 블로킹 위험이 없다. 화면 계산(frames)은 서버에서 하지 않는다(`frames:false`).
- 요트 seed 공개: 눈은 seed 와 따로 crypto 로 뽑는다(game.js:112-113). seed 는 움직임용이라 공개가 맞다.
- 홀덤 `endHand` 의 `res.winners.reduce` 초기값 없음: 블라인드로 팟이 항상 0보다 커서 승자가 비지 않는다.
- 홀덤 나간 사람 정산: leave 때 stack=0·start=0 이 되어 endHand 의 delta 가 0 이다. 칩이 보존된다.
- 코인 이중 지급: 라이어·요트는 `settledGame`, 갱식마인드는 `finished.save` 한 번, 미니는 phase 'end' 뒤 요청 거절, 블러핑은 done 한 번. 같은 사람 두 연결은 이전 연결의 session=null 로 막힌다. 뽑기는 await 뒤에 잔액을 검사해 경합이 없다.
- 코인 음수: swap·draw·cap·buy 모두 차감 전에 잔액을 검사한다. 관리자 지급은 1~10,000,000 정수만 받는다.
- 비밀 누출 추적: 라이어 viewFor·이벤트(phase/turn/accused/unmask/judged/guess), 갱식마인드 viewFor·chat sec·chatLogFor, 갱스껄 viewFor·gkPlace/gkLose(개수만)·gkLoseMine(본인만), 블러핑 bullet(서버에만), 홀덤 카드(본인·쇼다운만) 모두 이상 없다.
- 방 상태 사진 규칙: 라이어·요트·갱식마인드·갱스껄·미니 view 에 avatar 가 없다(faces 만). 포커는 규칙 대상이 아니다(성능 항목으로만 지적).
- 클라이언트 시간 신뢰: server/·shared/ 에 클라이언트가 보낸 시각을 쓰는 곳이 없다. 모두 hub.now 다.
- 갱스껄 flush ↔ leave 재귀: `s.members` 와 `this.members` 가 항상 같이 바뀌어 무한 반복이나 멈춤 경로가 없다. 판 중 손 구성은 `mine` 에만 있다.
- 미니 `msg.move` 무검사 전달: 5개 apply 모두 Number.isInteger·legalMoves 대조로 거르고 새 상태를 돌려준다. 이상한 모양이면 null 이다.
- 빈 방 GC: 모든 방이 members 0 일 때 gc 타이머를 걸고, join 때 지운다. 세션 정리(conn 없으면 sessions.delete)도 모든 leave 경로에 있다.
- DB 연결 수: pg Pool 기본 10개이고 쓰기는 직렬이다. Neon 무료 한도 안이다. pool 'error' 처리기도 있다.
