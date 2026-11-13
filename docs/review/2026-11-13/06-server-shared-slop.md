# 과제 06 — 서버·shared 의 군더더기(AI 슬롭)와 도구 중복

## 요약 (5줄 이내)
- 높음 0건. 실제 오동작은 못 찾았고, 문제는 대부분 "같은 코드가 5~6벌" 과 "안 쓰는 export·과한 방어 코드" 다.
- 가장 큰 중복: 방마다 똑같이 복사된 소리·이모티콘·얼굴·채팅·타이머·나가기 마무리 코드(6벌, 소리 3함수는 6벌이 바이트 단위로 같음).
- 난수 도구(섞기 5벌, 0..n-1 정수 난수 4종, defaultRng 2벌, intRng 2벌, 가중치 뽑기 3벌), 요청 검사 도우미(isObj/has 5벌), "코드→문구" 오류표 6벌, 속도 제한 9가지가 흩어져 있다.
- 일관성: 오류 모양(문자열 / {msg,code} / {code,msg}), 단계 이름(playing/play, result/end), 시간 단위(초/ms), 끊김 유예(GRACE_MS 를 갱식마인드만 무시), 게임 이름 하드코딩(CLAUDE.md "이름은 한 곳" 위반).
- 제안: `shared/util/`(rand·check·text) 와 `server/roomkit.js`(방 공통 부품) 두 곳으로 모은다. 라이어 폴더는 복사본 제약 때문에 예외로 두거나 총괄 결정.

## 범위와 커버리지
- 대상: `git ls-files server shared scripts` 70개(words.json 데이터 1개 포함).
- 읽은 파일: JS/MJS 67개 전부(자료 파일 shared/coin/items/*.js 는 앞부분과 모양만, sim.js 는 머리말·export·빈자리 부분과 모든 내부 이름의 사용 횟수 확인). Python 2개(scripts/gsk-*.py)는 머리말과 구조만(그림 자르기 도구, 서버 코드 아님). words.json 은 모양만.
- 사용처 확인: 서버·shared 의 모든 export 를 저장소 전체(client/src, test, scripts, html 포함)에서 grep 으로 셌다(스크립트: scratchpad/exports.sh).

## 지금 구조 (방 공통 부품이 게임별로 어디 있는가)

| 부품 | 포커/블러핑 server/rooms.js | 라이어 server/liar/room.js | 요트 server/yacht/room.js | 갱스껄 server/gsk/room.js | 미니 server/mini/room.js | 갱식마인드 server/draw/room.js |
|---|---|---|---|---|---|---|
| member(id) | 61 | 83 | 46 | 46 | 34 | 68 |
| setTimer/clearTimer | 65-73 (undefined 검사 없음) | 87-95 | 50-58 | 50-58 | 38-46 | 70-78 |
| addSound/editSound/playSound | 97-123 | 173-199 | 248-273 | 232-257 | 189-214 | 401-426 |
| 소리 한도 상수 24/8 | 38-39 | 22-23 | 10-11 | 13-14 | 7-8 | 19-20 |
| emote | 200 | 201 | 275 | 259 | 216 | 396 |
| chat(일반) | 126 (로그 30) | 207 (규칙 다름, 로그 50) | 280 (30) | 264 (30) | 220 (30) | 엔진 chat (규칙 다름) |
| sendExtras | 89 (얼굴 없음) | 118 | 76 | 78 | 63 | 246 (순서 다름 + drSync) |
| sendFaces/faceChanged | 없음(상태에 사진) | 129/489 | 87/94 | 89/96 | 72/77 | 257/262 |
| sendEvents | 403 | 501 | 289 | 273 | 229 | 198 |
| push | 409 | 507 | 295 | 280(→flush) | 233 | 212 |
| 나가기 마무리(room:null·sendMe·sendRooms·세션 삭제·gc) | 165-175 | 244-254 | 147-156 | 121-132 | 100-110 | syncMembers 152-169 |
| 끊김 유예 | m.grace 타이머(hub.timing.grace) | 같음 + awayUntil | 같음 + awayUntil | 엔진 awayAt(+hub.timing.grace) | 같음 + awayUntil | 엔진 TIMES.seatKeep(60초 고정) |
| 오류 모양 | 문자열 | 문자열 | 문자열 | {msg,code} + 일부 문자열 | {code,msg} (start 는 문자열) | {msg,code} + 일부 문자열 |
| 단계 값(room.phase) | lobby/playing/result | 엔진 단계 그대로 | lobby/playing/result | lobby/playing/result | lobby/play/end | lobby/playing |
| 코인 연결 | afterBluff 직접 | hooks.js | hooks.js | 없음 | hooks.js | hooks.js |

| 도구 | 있는 곳 |
|---|---|
| 섞기(Fisher-Yates) | shared/cards.js:19 (제자리, 실수 rng), shared/liar/game.js:35 (복사, 정수 rng), shared/gsk/game.js:25 (복사, 정수 rnd), shared/yacht/game.js:78 (인라인, 실수 rng), server/draw/words.js:88 (부분 섞기, 정수 rng) |
| 0..n-1 정수 난수 | shared/liar/game.js:18 defaultRng, shared/draw/game.js:44 defaultRng(같은 코드), shared/liar/words.js:5 cryptoRng, server/draw/words.js:44 cryptoRng, server/gsk/room.js:17 secureRnd (셋 다 `randomInt(n)`) |
| 실수 rng → 정수 | server/liar/room.js:36 intRng, server/draw/room.js:25 intRng (같은 코드) |
| 범위 검사 감싸기 | shared/liar/game.js:28 pick, shared/draw/game.js:54 rand, shared/gsk/game.js:20 rand |
| 가중치 뽑기 | shared/coin/gacha.js:20 tierOf, shared/coin/capsule.js:17 gradeOf, shared/coin/stock.js:26 pickGrade |
| 요청 검사 도우미 isObj/has/good/bad | server/protocol.js:59-60, shared/liar/protocol.js:13-16, shared/yacht/protocol.js:6-9, shared/draw/protocol.js:11-16, shared/gsk/protocol.js:6-9, shared/coin/protocol.js:8-12 |
| 글 정리(제어문자 제거) | server/protocol.js:53 cleanText, 같은 파일 151-152(인라인 재작성), shared/liar/protocol.js:19, shared/liar/game.js:119 |
| 크기 표시(#,*) 떼기 | server/liar/room.js:29 stripSizeMark, shared/draw/game.js:559 stripMark, (화면 client/src/ui/chatSize.js) |
| 정답 비교 정리 | shared/liar/words.js:180 normalize, shared/draw/answer.js:7 normalizeAnswer(가운뎃점·마침표까지 뗌, 규칙 차이) |
| "코드→문구" 오류표 | server/admin/bots.js:14-25, server/coin/pin.js:16-24, server/coin/wallet.js:15-26, shared/draw/game.js:26-39 + server/draw/room.js:36, shared/gsk/constants.js:19-30 + server/gsk/room.js:18, server/mini/room.js:10 |
| 속도 제한 | rooms.js 연결 20/100(633-646), tooSoon(767), sndEdit 창(906-913), chat 창(920-926); yacht tooFast(201); wallet lastDraw/lastCap/lastStock(최소 간격), lastPos(창); draw 엔진 chatRateOk(game.js:568), draw resync(room.js:368) |
| 잠금(틀리면 잠금) | server/admin/bots.js:37-52 (LOCK_FAILS 5, 10분), server/coin/pin.js:150-165 (같은 값, 같은 방식) |
| 관리자 아이디 '관리자' | server/admin/bots.js:8, server/coin/pin.js:14, server/coin/wallet.js:13, server/store.js:36 (RANK_EXCLUDED_ID) |
| words.json 읽기 | server/liar/room.js:17, server/draw/words.js:12, server/admin/games/draw.js:12-23 (세 번 따로 파싱) |
| 봇 대기 시간 500~1500ms | server/admin/games/holdem.js:31, bluff.js:7, yacht.js:7, liar.js:52, draw.js:29 |
| 판 4방향 연속 검사 | shared/mini/gomoku.js:16, shared/mini/connect4.js:17 (숫자 5/4만 다름) |

## 발견 사항

### [중간] 방마다 복사된 소리·이모티콘·얼굴·채팅 코드 6벌
- 위치: 위 표의 addSound/editSound/playSound, emote, sendFaces/faceChanged, sendExtras, chat, sendEvents 행 전부.
- 내용: addSound·editSound·playSound 는 6개 파일에서 md5 가 같다(바이트 단위 동일). MAX_ROOM_SOUNDS=24 / MAX_ACCOUNT_SOUNDS=8 도 6벌. sendFaces·faceChanged 는 5벌, 일반 chat(로그 30)은 포커·요트·갱스껄·미니 4벌이 같다. 라이어 room.js:5 주석이 "copied from myown server/rooms.js" 라고 스스로 밝힌다.
- 분류: 중복 (가)
- 제안: `server/roomkit.js` 에 `installMedia(room)`(sounds 배열·add/edit/play·emote·sendEvents) 와 `sendFaces/faceChanged/sendExtras(session, extra)` 를 두고 각 방은 한 줄로 붙인다. 일반 chat 은 `basicChat(room, CHAT_LOG)`.
- 위험: 라이어는 복사본 제약(gamemine 과 같게)이 있어 라이어만 그대로 두거나 gamemine 도 같이 바꿔야 한다. 갱식마인드 sendExtras 는 순서(faces→chatLog→sndList→drSync)가 GDD 약속일 수 있어 그대로. 소리 한도를 바꾸면 test/media.test.js 류가 같이 맞아야 한다.

### [중간] 방 뼈대(member·타이머·나가기 마무리) 6벌
- 위치: 표의 member, setTimer/clearTimer, "나가기 마무리" 행.
- 내용: 나가기 뒤 `room:null → sendMe → sendRooms → (연결 없으면) sessions.delete → 비면 roomsChanged + gc 타이머` 가 6곳에서 손으로 되풀이된다. 포커 clearTimer(rooms.js:70)만 `undefined` 검사가 없다(지금은 timers 를 null 로 시작해 문제 없음).
- 분류: 중복 (가)
- 제안: `roomkit.js` 의 `timerMixin(room)` 과 `afterLeave(room, m)` 하나로. (방 운영 흐름 자체 비교는 다른 검토자 몫이라 여기서는 도구로서만 지적.)
- 위험: 갱스껄은 나가기 중에 엔진 apply 를 먼저 하고 flush 로 보내는 순서, 갱식마인드는 syncMembers 에서 방장을 먼저 바꾸는 순서가 있다(draw room.js:151 주석). 공통 함수에 "방장 갱신 시점" 을 인자로 둬야 한다.

### [중간] 섞기·정수 난수·가중치 뽑기가 게임마다 따로
- 위치: 표의 "섞기", "0..n-1 정수 난수", "실수 rng→정수", "범위 검사 감싸기", "가중치 뽑기" 행.
- 내용: 내용 비교 —
  - defaultRng: liar/game.js:18 과 draw/game.js:44 가 글자까지 같다(거절 추출, crypto).
  - intRng: liar/room.js:36 과 draw/room.js:25 가 같다.
  - cryptoRng/secureRnd: 셋 다 `(n) => randomInt(n)` 한 줄.
  - shuffle: cards.js 는 배열을 제자리에서 바꾸고 실수 rng 를 받는다. liar·gsk 는 복사본을 만들고 정수 rng + 범위 검사. yacht 는 인라인(실수 rng). 동작은 같고 rng 모양만 다르다.
  - 가중치: gacha tierOf(누적 비교), capsule gradeOf(누적 비교, r01 로 자름), stock pickGrade(빼 가며 비교). 같은 일.
  - 또 갱스껄 방(gsk/room.js:17)과 갱식마인드 단어(draw/words.js:44)는 hub.rng 를 거치지 않고 node crypto 를 직접 쓴다(다른 방은 hub.rng). 공정성 문제는 없지만 시험에서 hub.rng 하나로 난수를 바꿔 넣을 수 없다.
- 분류: 중복 (가), 불일치 (가)
- 제안: `shared/util/rand.js` 에 `secureInt(n)`(거절 추출), `toInt(rngFloat)`(지금 intRng), `checkedInt(rng, n)`, `shuffle(list, rngInt)`(복사본 반환), `weighted(rng, [[값, 무게]...])`. 서버는 hub 에 `hub.rngInt = toInt(hub.rng)` 를 하나 두고 방들이 쓴다.
- 위험: 시험이 "정해진 순서의 rng" 를 주입해 결과를 확인한다(test/liar/game.test.js, yacht·gsk 시험). 난수를 뽑는 횟수·순서·실수/정수 변환이 조금만 달라져도 기대값이 바뀐다. 섞기 한 방향(i 를 끝에서 앞으로)과 뽑는 순서를 그대로 지켜야 한다. 라이어는 복사본 제약.

### [중간] "코드→문구" 오류표와 오류 모양이 6가지
- 위치: 표의 "오류표" 행. 모양: 포커·라이어·요트는 문자열, 갱식마인드·갱스껄·코인·관리자·비밀번호는 `{msg, code}`, 미니는 `{code, msg}`(mini/room.js:10)인데 `start()` 만 문자열(mini/room.js:139). 갱스껄 join 은 '방이 가득 찼습니다.' 문자열(gsk/room.js:64), 갱식마인드도 같은 문자열(draw/room.js:221)과 소리 오류는 문자열.
- 엔진 결과 모양도 다르다: holdem/bluff `{ok,error}`, liar/yacht `{ok,error,events}`, draw fx `{ok,code,msg}`, gsk `{ok,code,error}`, mini apply 는 `null`, 요청 검사 결과는 server `{ok,error,code?}` / coin `{ok,code}`(문구 없음) / gsk `{ok,code,error}` / 나머지 `{ok,error}`.
- 같은 문구가 여러 곳 리터럴: '지금은 할 수 없습니다.'(rooms.js·yacht/room.js:14·yacht/game.js:9·draw ERRORS·gsk ERRORS·mini), '없는 아이디입니다.'(server/protocol.js:108,113 과 bots.js:23), '비밀번호는 숫자 4자리입니다.'(server/protocol.js:85,120 과 pin.js:20).
- 분류: 불일치 (가), 중복
- 제안: `server/errors.js` 에 `err(code, msg)` 하나와 공용 문구표(코드 없는 옛 문구 포함)를 둔다. 허브는 이미 두 모양을 다 보낸다(rooms.js:653).
- 위험: 화면이 오류를 `code` 접두사로 나눠 보낸다(client/src/main.js:582 `^(coin|shop|pin)_`, client/src/coin/index.js:105). 코드 이름을 바꾸면 안 된다. 라이어·요트 시험은 문구 문자열로 비교하는 곳이 많다.

### [중간] 게임 이름을 서버에 하드코딩 (CLAUDE.md "이름은 한 곳" 위반)
- 위치: server/rooms.js:834 '갱식마인드는 아직 열리지 않았습니다.'(shared/draw/game.js:27 ERRORS.dr_off 와 같은 글을 다시 씀), rooms.js:841 '갱스껄은 지금 열려 있지 않습니다.'(shared/gsk/constants.js:20 과 같은 글), rooms.js:891 '갱스껄은 방을 새로 만들어 주세요.', shared/gsk/constants.js:20 이 GAME_NAME(shared/gsk/name.js:2) 대신 리터럴.
- 내용: 갱식마인드 ERRORS 는 GAME_NAME 을 쓰는데 갱스껄은 안 쓴다. 이름을 바꾸면 4곳을 따로 고쳐야 한다(한 곳만 고쳐져 어긋날 자리).
- 분류: 규칙 위반, 중복 (가)
- 제안: rooms.js 는 `{msg: drErrorMsg('dr_off'), code:'dr_off'}`·`gskErrorMsg('gk_off')` 를 import 해서 쓰고, gsk ERRORS 는 `${GAME_NAME}` 템플릿으로.
- 위험: 거의 없음. 문구가 글자 그대로 같아 시험도 그대로 통과해야 한다.

### [중간] 끊김 유예 시간: 갱식마인드만 hub.timing.grace(GRACE_MS)를 무시
- 위치: shared/draw/constants.js:158 `seatKeep: 60`, shared/draw/game.js:527,661,689. 다른 방은 hub.timing.grace(server/index.js:127 GRACE_MS 환경 변수) 를 쓴다(liar/room.js:228, yacht 112, mini 87, gsk createGame graceMs).
- 내용: 값이 같은 60초라 지금은 겉으로 같지만, GRACE_MS 로 시험·운영 값을 바꾸면 갱식마인드만 그대로다. 시간 단위도 갱식마인드·라이어 상수는 초, 갱스껄·허브는 ms.
- 분류: 불일치 (다) — GDD 상 갱식마인드는 "그리는 사람 15초" 같은 자체 시계가 있어 의도일 수도 있다.
- 제안: 사용자/총괄에게 묻기: "끊김 60초를 모든 게임이 한 값(GRACE_MS)으로 따르게 할까?" 따르게 하면 draw room 이 env 에 seatKeepMs 를 넘긴다.
- 위험: test/draw 의 끊김 시험이 60초 고정을 기대한다.

### [중간] 같은 요청을 두 번 검사
- 위치: (1) server/protocol.js:119 parsePin → server/coin/pin.js:123 parsePin 다시. (2) server/protocol.js:123 parseCoin → server/coin/wallet.js:153 parseCoin 다시. (3) shared/liar/protocol.js checkSettings → server/liar/room.js:437-446 changeSettings 가 liarMode·topicMode·wordSet·goal·times 를 다시 검사(WORD_SETS·TOPIC_MODES 도 protocol.js:5-6 과 room.js:20-21 에 두 벌). (4) shared/draw/protocol.js checkSettings → shared/draw/game.js setSettings 가 order·rounds·time·len·topics 를 다시 검사. (5) shared/yacht/protocol.js → shared/yacht/game.js 가 cat·on·i 를 다시 검사(game.js:95,132,155,166). (6) shared/draw/protocol.js checkPoints 와 shared/draw/ops.js numsOk/styleOk.
- 내용: 앞 검사를 통과한 정리된 객체만 뒤로 가므로 뒤 검사는 서버 경로에서 늘 통과한다.
- 분류: 과복잡 (가)
- 제안: (1)(2)는 handle/coin 에서 parse 를 빼고 정리된 msg 를 믿는다. (3)~(6)은 엔진을 "검사 안 된 입력도 받는 순수 함수" 로 시험하는 설계라 남겨도 된다 — 지울지 총괄 판단.
- 위험: (1)(2) 는 tests 가 hub.coin / pinAuth.handle 을 직접 부르지 않음을 확인했다(grep 결과 없음). ops.js 검사는 화면이 받은 이벤트에도 쓰므로 지우면 안 된다. 라이어는 복사본 제약.

### [중간] 판 끝 칩 정산이 계정마다 저장을 두 번
- 위치: server/rooms.js:245-249 settleSeat 안의 `hub.persist(user)` 와 rooms.js:259 settleLive 의 `this.hub.persist(live)`.
- 내용: 접속 중인 사람은 settleLive → settleSeat(저장) → stats → 다시 저장. 한 판 끝마다 사람 수 × 2 번 Neon upsert. 나가기 경로(rooms.js:160)도 2번.
- 분류: 성능
- 제안: settleSeat 에서 persist 를 빼고 settleLive 끝에서 한 번만.
- 위험: settleSeat 를 직접 부르는 곳은 settleLive 뿐(grep). 저장 횟수를 세는 시험이 있으면 숫자가 바뀐다.

### [중간] 관리자 아이디·잠금 규칙·sha256 이 따로따로
- 위치: '관리자' — bots.js:8, pin.js:14, wallet.js:13, store.js:36. 잠금 LOCK_FAILS 5 / LOCK_WINDOW 10분 — bots.js:10-11 과 pin.js:12-13, 잠금 로직 bots.js:37-52 와 pin.js:150-165. sha256 — bots.js:27 digest, pin.js:26 sha. 관리자 기본 비밀번호 '9975' — bots.js:9 DEFAULT_ADMIN_KEY, rooms.js:605 `adminKey ?? '9975'`, index.js:142 주석.
- 내용: store.js:35 주석은 "bots.js 가 store 를 import 해서 못 가져온다" 고 하는데, 거꾸로 bots.js 가 store.js 의 값을 가져오면 된다(순환 없음). pin.js·wallet.js 는 아무 제약 없이 복사.
- 분류: 중복 (가)
- 제안: `server/ids.js`(ADMIN_ID, BOT_PREFIX '~bot') 하나. 잠금은 `server/lockout.js` 의 `createLockout({fails, windowMs, now})`. rooms.js:605 는 `adminKey` 를 그대로 넘긴다(createAdmin 기본값이 처리).
- 위험: 아이디 문자열이 바뀌면 저장된 계정과 랭킹 제외가 어긋난다 — 값은 그대로 두고 위치만 옮길 것.

### [중간] 속도 제한 9가지가 각자 구현
- 위치: 표의 "속도 제한" 행.
- 내용: 모양은 두 가지뿐이다 — "같은 키 최소 간격"(tooSoon, lastDraw/lastCap/lastStock, resync) 과 "최근 창 안 N번"(editTimes, chatTimes, yacht tooFast, lastPos, draw chatRateOk). 같은 일을 8번 다시 썼다. wallet 의 Map 들(lastEarn/lastDraw/lastCap/lastPos/lastStock, wallet.js:74-78)은 지워지지 않아 계정 수만큼 계속 자란다(reset 때도 안 비움 — 메모리 누수는 다른 검토자 몫이라 참고만).
- 분류: 중복 (가)
- 제안: `server/rate.js` 에 `gapOk(map, key, ms, now)` 와 `windowOk(list, ms, max, now)` 두 개.
- 위험: "거절된 시도는 대기 시간을 늘리지 않는다"(rooms.js:766 주석), pos 는 거절돼도 목록을 줄여 저장(wallet.js:252) 같은 미세한 차이를 인자로 살려야 한다.

### [낮음] 안 쓰는 상수·함수 (저장소 전체에서 정의 한 줄뿐)
- shared/gsk/constants.js:8 `DISC_TOTAL` — 어디서도 안 씀. 대신 shared/gsk/game.js:476 lobbySeat 이 `discs: 4, hand: 4` 로 숫자를 직접 씀. → 상수를 쓰거나 지운다.
- shared/draw/constants.js:135 `MAX_POINTS_PER_MSG`, :149 `UNDO_SNAPSHOT_EVERY` — 어디서도 안 씀(client 포함 grep).
- server/admin/games/yacht.js:60 `// eslint-disable-line no-unused-vars` — 저장소에 eslint 설정·의존성이 없다. 주석만 잡음.
- shared/gsk/game.js:332 enterPenalty 의 `fx, rnd, at`, :341 doDiscard 의 `rnd`, :372 dropMany 의 `rnd` — 받기만 하고 안 쓰는 인자.
- user.stats.refills(server/store.js:8) — 서버 어디서도 올리지 않는다(리필 기능 없음). 화면 client/src/ui/hud.js:59 가 늘 0 을 '리필' 로 보여 준다. (다): 리필을 다시 만들 계획인지 묻기.
- 시험에서만 쓰는 export: server/draw/words.js:39 offTopics, :97-98 isUsed/usedCount, shared/draw/answer.js letterCount, shared/gsk/game.js removePlayer. 시험이 있어 지우면 시험도 고쳐야 한다 — 남겨도 무방.
- 지우거나 합쳐도 안전한 이유: grep 으로 정의 외 사용처 0(또는 test 만). 깨질 수 있는 것: 시험 import 줄.

### [낮음] export 할 필요 없는 export (같은 파일 안에서만 씀)
- server/protocol.js MAX_RAW·MAX_PEMOTE·MAX_AVATAR·MAX_CHAT·AVATAR_PREFIX·normalizeId·validAvatar, server/rooms.js DEFAULT_TIMING·REPLACED_CODE, server/admin/bots.js DEFAULT_ADMIN_KEY·admErr, server/coin/pin.js hashPin·verifyPin, server/coin/wallet.js coinErr·stockOf, server/liar/room.js DEFAULT_SETTINGS, server/draw/room.js intRng, shared/bluff.js HAND_SIZE, shared/handeval.js HAND_NAMES, shared/coin/gacha.js POOL_STEP·GUARANTEE_CHIPS·JACKPOT_TIER·FREE_MS·FREE_MAX, shared/coin/stock.js GRADE_PRICE, shared/coin/capsule.js TRASH_NEED, shared/mini/gomoku.js SIZE, shared/mini/checkers.js QUIET_LIMIT, scripts/build-words.mjs SOURCES.
- 방 파일의 `export { MAX_PLAYERS }` 재수출 5개(server/liar/room.js:15, yacht:9, gsk:12, draw:18, mini:6) — 아무도 import 하지 않는다. 대신 server/rooms.js:29 가 `{ liar: 8, yacht: 4, draw: 8, gsk: 6, mini: 8 }` 표를 손으로 다시 적는다(값이 shared 상수와 따로 놀 위험).
- 제안: rooms.js 의 MAX_PLAYERS 표를 각 방/shared 상수에서 import 해 만들고, 나머지는 `export` 만 뗀다(지울 필요 없음).
- 위험: MAX_SOUND 는 client/src/media.js:6 에 따로 200000 으로 있다(서버 200*1024). 화면 쪽이 더 작아 문제는 없지만 같은 이름 두 값.

### [낮음] 일어날 수 없는 경우를 막는 방어 코드
- server/coin/wallet.js:32 `hub?.rng ?? Math.random` — stockOf 는 두 곳(wallet.js:69,282)에서 늘 hub 와 함께 불린다. 닿지 않는 Math.random 대체가 "무작위는 hub.rng 만" 약속과 어긋나 보인다. :30 `user.gear ?? (user.gear = {})`, :31·55 `hub?.now ? ... : 0`, :45 `try { hub?.persist?.(user) } catch {}`(persist 는 안에서 catch 해서 던지지 않는다, rooms.js:554-559).
- wallet.js:86-93 savePool, :97-104 ledger — store.setMeta/log 는 늘 Promise 를 돌려주는데 `typeof p.catch === 'function'` 과 try/catch 를 겹쳐 둠. pg log 는 이미 안에서 catch(store.js:204).
- wallet.js:95 hasBot `hub.admin?.botsIn?.(room)` — hub.admin 은 createHub 에서 늘 만든다(rooms.js:605). 뒤의 `members.some(session.bot)` 와 같은 일을 두 번. :117 `session.bot || String(row.id).startsWith('~bot')` 도 두 번.
- server/admin/bots.js:85 `hub.userEpoch?.set`, :91 `hub.store.log?.(...)?.catch?.(() => {})` — 둘 다 항상 있다.
- `user.stats ??= {}` — server/draw/room.js:184, gsk/room.js:188, liar/room.js:379,399, yacht/room.js:217. stats 는 newUser 와 DB NOT NULL 로 늘 있다.
- shared/yacht/game.js:70 `finish(g, 'alone', events); // 닿지 않는 길` — 주석이 스스로 도달 불가라고 함.
- server/draw/room.js:429 `flush() {}` — 허브는 `room.flush?.()`(rooms.js:592)로 부르므로 빈 함수가 필요 없다.
- 분류: 불필요 (가). 지워도 안전한 이유: 위 각 줄의 "늘 있다" 근거. 깨질 수 있는 것: 시험에서 hub 를 가짜로 만들어 wallet/stockOf 를 부르는 경우(test/coin/stock.test.js 가 stockOf 를 쓰는지 확인 필요 — grep 상 wallet.js 밖 사용처 없음).

### [낮음] 이름 겹침: flush 가 두 가지 뜻
- 위치: server/rooms.js:584-597 hub.close 는 `room.flush?.()` 를 "라이어 점수를 누적에 넣기" 뜻으로 부른다. server/gsk/room.js:215 의 flush 는 "모두에게 상태를 보내고 타이머 다시 걸기(+유예 지난 사람 내보내기)".
- 내용: 서버 종료 때 갱스껄 방에 상태 전송·leave 가 일어난다(타이머는 바로 뒤에서 지워져 해는 없음).
- 분류: 불일치 (가)
- 제안: 허브 쪽 이름을 `saveScores()` 같은 것으로 바꾸거나 gsk 쪽을 `sync()` 로.
- 위험: 라이어는 복사본 제약(이름 flush 유지 필요) → gsk 쪽을 바꾸는 편이 안전.

### [낮음] 낡거나 사실과 다른 주석
- server/liar/room.js:1 "Task 1-A: lobby only. Game flow comes in later tasks." — 판 진행이 다 들어 있다. (복사본 제약)
- server/draw/room.js:6-7 "(허브가 두 모양을 모두 {t:'error', msg, code?} 로 보내야 한다 — 보고 참고)" — 허브가 이미 한다(rooms.js:653).
- server/coin/hooks.js:1 "connect the liar / yacht / draw rooms" — mini 도 감싼다(hooks.js:83).
- server/protocol.js:1-3 — 파일 머리 주석이 import 두 줄 사이에 끼어 있다.
- server/admin/games/index.js:1 "A new game adds one line here" — gsk·mini 가 빠져 봇이 아무것도 안 한다(NONE). 의도인지 (다).
- scripts/build-words.mjs:10,37 — SOURCES 에 옛 경로 'docs/WORDS.md' 를 적고 읽을 때 정규식으로 'docs/liar/' 로 바꾼다(옮겨 온 흔적, 복사본 제약; test/liar/words.test.js:138 이 옛 키를 씀).

### [낮음] 작은 중복들
- server/protocol.js:151-152 chat 이 같은 파일 53 의 cleanText 를 그대로 다시 씀 → `cleanText(m.text)` 한 줄.
- server/rooms.js:37 DR_DRAW_OPS 와 server/draw/room.js:22 DRAW_ACTS — 같은 7개 이름. 그림 요청이 하나 늘면 두 곳을 고쳐야 한다(안 고치면 속도 제한 100 을 못 받음). → shared/draw/constants.js 에 하나.
- 세션 객체 모양 `{ id, user, conn, room, chatTimes, editTimes, lastSent }` — rooms.js:743 과 bots.js:222 두 벌 → `newSession(id, user)`.
- emptyScores — shared/yacht/game.js:19 와 server/yacht/room.js:23.
- words.json 을 세 번 따로 파싱(약 157KB): server/liar/room.js:17, server/draw/words.js:12, server/admin/games/draw.js:12-23(봇은 loadWords() 를 쓰면 됨).
- store.js:37-46 liarList/coinList 정렬·이름 비교 같은 모양, 메모리 store 의 topLiar/liarRank(87-93)만 async 가 아님(pg 쪽은 async).
- 봇 대기 `500 + rng*1000(또는 1001)` 5벌 → bot api 에 `bot.pause()` 하나.
- shared/mini/gomoku.js:16·connect4.js:17 wins() 동일(연속 수만 다름) → `lineOf(board,x,y,p,n)`.
- gacha.js 와 capsule.js 가 COST/TEN/PITY 같은 이름을 다른 값으로 export → wallet.js:6 이 `COST as CAP_COST` 로 바꿔 부름. 이름에 접두사를 붙이면 별칭이 필요 없다.
- shared/coin/items/*.js 의 `shop: true/false` 필드는 코드가 읽지 않는다(test/coin/shop.test.js 만 검사, 실제 진열은 stock.js 가 cap/g 로 정함). docs/COIN-ITEMS.md 와 맞추려는 자료라면 유지 (다).
- shared/liar/game.js:119 cleanText 의 "한 줄만" 거절은 서버 경로에서 닿지 않는다(protocol.js:21 이 줄바꿈을 먼저 빈칸으로 바꿈). 복사본 제약.

### [낮음] 방 상태 이름이 게임마다 다름
- 단계: 미니만 'play'/'end'(mini/room.js:22), 나머지 'playing'/'result'. 방 목록 화면은 'lobby' 만 보므로(client/src/ui/lobby.js:308) 지금은 영향 없음.
- 라운드: 갱식마인드 `roundNo`, 나머지 `round`. 끝 시각: 라이어 `phaseEndsAt`, 갱식마인드·갱스껄 `endsAt`. 끊김: 라이어·요트·미니·갱스껄 `awayUntil`, 갱식마인드는 상태에 없음, 포커는 connected 만.
- 미니 상태 `mn: this.mn`(mini/room.js:257)은 체스 반복 기록 `reps` 맵 전체를 매번 모두에게 보낸다(수가 쌓이면 커짐). 성능 낮음.
- 분류: 불일치 (가) — 화면 코드와 맞물려 있어 이름 통일은 통신 약속(SPEC 7절) 변경이 필요.

## 공통화 제안

### 하나로 묶을 것 (놓을 곳)
1. `server/roomkit.js` (서버 방 공통 부품): member, setTimer/clearTimer, installMedia(소리 3함수·한도·emote·sendEvents), sendFaces/faceChanged, sendExtras(뒤에 붙일 것 인자), basicChat(로그 수 인자), afterLeave(나가기 마무리). 포커·요트·갱스껄·미니·갱식마인드가 쓴다.
2. `shared/util/rand.js`: secureInt, toInt(실수→정수, 지금 intRng), checkedInt, shuffle(복사본), weighted. 허브에 `hub.rngInt` 추가하고 gsk/room.js·draw/words.js 도 그걸 쓰게.
3. `shared/util/check.js`: isObj, has, good, bad(error, code), inRange, idOk(maxLen) — 요청 검사 5벌을 대체.
4. `shared/util/text.js`: cleanText(제어문자 제거, ZWJ 유지; 줄바꿈→빈칸 옵션), stripSizeMark(서버 두 벌 + 화면 chatSize 가 같은 규칙이라고 주석에 적혀 있음).
5. `server/errors.js`: `err(code, msg)` 한 모양 + 공용 문구('지금은 할 수 없습니다.', '방이 가득 찼습니다.', 소리 오류 3개). 게임별 ERRORS 는 각 shared 에 두되 같은 함수로 만든다.
6. `server/rate.js`: gapOk, windowOk. `server/lockout.js`: 관리자·비밀번호 잠금.
7. `server/ids.js`: ADMIN_ID, BOT_PREFIX. 기본 관리자 비밀번호는 bots.js 한 곳.
8. rooms.js 의 MAX_PLAYERS 표·DR_DRAW_OPS 는 각 게임 상수에서 import.

### 예외로 남길 것 (근거)
- 라이어 폴더 전체(server/liar, shared/liar): CLAUDE.md "복사해 온 라이어 폴더는 gamemine 과 같게 유지" — 공통 부품을 쓰게 하려면 gamemine 도 같이 바꿔야 함. 총괄 결정.
- 라이어 채팅 규칙(perms.js, 80자, kind, 로그 50): docs/liar/GDD.md 4-4, 9-1, 9-4.
- 갱식마인드 채팅(정답 가리기·sec·40자·자체 속도 제한), sendExtras 순서와 drSync: docs/draw/GDD.md 10-6, CLAUDE.md "맞히기 전 사람에게 정답 글을 보내지 않는다".
- 정답 비교 정리 차이(갱식마인드는 가운뎃점·마침표까지 뗌): shared/draw/answer.js:3-5 주석, GDD 9절 ⑨.
- 채팅 길이(포커 120 / 라이어 80 / 갱식마인드 40): 각 GDD.
- 포커 sendExtras 에 얼굴이 없음: 포커 상태에는 avatar 가 들어 있다(rooms.js:423). 다른 게임은 "방 상태에 사진을 넣지 않는다(faces)" 약속(CLAUDE.md).
- shared/draw/ops.js 의 재검사: 화면이 받은 이벤트에도 같은 함수를 쓴다(ops.js:2, 21).
- 갱스껄 penalty.target·faceUp: 늘 같은 값이지만 docs/gsk/GDD.md 167, 293 의 통신 약속.

### 사용자에게 물을 것
1. 갱스껄만 코인을 안 준다(rooms.js:840-844 에 hookRoom 없음, shared/coin/rules.js COIN_RULES·SPEC 22-2 표에 없음). 의도인가?
2. 끊김 60초를 모든 게임이 같은 설정(GRACE_MS)을 따르게 할까? 지금 갱식마인드만 자체 60초.
3. 관리자 봇이 갱스껄·미니에서는 아무것도 안 한다(server/admin/games/index.js). 만들 계획인가?
4. '리필' 통계(store.js:8, hud.js:59)는 늘 0 이다. 지울까?
5. 라이어 폴더도 공통 부품을 쓰게 바꿀까(gamemine 쪽도 같이), 아니면 라이어만 복사본으로 둘까?

## 버린 후보 (검토했지만 문제 아님)
- hub.guard 타이머 감싸기: 한 곳(rooms.js:500)에서 모두 씀 — 중복 아님.
- server/index.js 의 정적 파일 MIME 표·경로 검사: 필요한 방어(경로 탈출 막기).
- holdem.js/handeval.js/bluff.js: 군더더기 없음, 함수 길이 적당.
- shared/yacht/sim.js: 내부 이름 전부 2회 이상 사용, `_test` export 는 시험용으로 명시. 비트 단위 재현 목적의 직접 구현이라 유지.
- store.js 의 `await writes.catch(() => {})` 반복: 읽기 전에 쓰기를 기다리는 의도된 순서 맞추기.
- server/coin/hooks.js 의 감싸기 방식: SPEC 22-2 가 "게임 폴더를 고치지 않고 감싼다" 로 정함.
- 갱스껄 room 이 grace 필드 없이 members 를 두어 hub.close 가 clearTimeout(undefined) 을 부름: 해 없음.
- 미니게임 상태 phase 'end' 가 목록에서 '게임 중' 으로 보임: 포커 'result'·라이어 'result' 도 같아 일관됨.
- scripts/sample-words.mjs 의 단어 파싱이 build-words.mjs parseWordsMd 와 거의 같음: 옮겨 온 라이어 도구(docs/LIAR-MOVE.md:29), 복사본 제약. 개발용 도구라 영향 없음.
- scripts/soak.js: test/e2e/bot.js 를 쓰는 부하 도구, docs/SYNC.md:76 에서 언급 — 살아 있는 도구.
- scripts/gsk-cut.py, gsk-matback.py: 그림 자르기 도구(client/src/gsk/art.js 주석이 참조), 서버 코드 아님.
- shared/liar/words.js 가 shared 폴더에서 node:crypto 를 씀: 화면이 import 하지 않음(grep) — 지금은 문제 없음, 복사본 제약.
