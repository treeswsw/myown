# 01 채팅 — 게임별 채팅 구현 비교

## 요약 (5줄 이내)
- 화면: 포커·라이어·요트·갱스껄·미니는 사이트 공용 `client/src/ui/chat.js` 하나를 쓴다. 갱식마인드만 자체 입력칸(hud.js)과 말풍선·기록(players.js)을 따로 만들었다. 그런데 **방 대기·최종 결과 단계에는 입력칸이 아예 없다**(GDD 7절 a2는 대기 화면에 채팅이 있다고 적음).
- 서버: 같은 `chat(session,text)`(기록 push/shift, sendEvents)가 포커·요트·갱스껄·미니에 **글자 하나 다르지 않게 4벌**, 라이어에 변형 3벌(chat·endNotice·engineEvents) 있다. 갱식마인드만 엔진(shared/draw/game.js)이 따로 처리한다.
- 글자 수 제한이 화면과 서버에서 서로 다르다. 화면은 120자(라이어 서버 80자), 갱식마인드 입력칸은 80자(서버 40자). 라이어에서는 81~120자를 보내면 **입력칸이 비워진 채 거절돼 글이 사라진다**(첫 설명 차례도 마찬가지). 갱식마인드는 41~80자에서 Enter를 눌러도 아무 반응이 없다.
- 크기 표시(`#`,`*`) 떼기가 4곳(chatSize.js, liar/pure.js, server/liar/room.js, shared/draw/game.js)에 따로 구현돼 있다. 갱식마인드 화면은 크기 표시를 해석하지 않고 `#`를 글자 그대로 보여 준다(SPEC 12절은 "네 게임 공통"이라고 적음).
- 공통화하기 좋은 것: 서버 `ChatLog`와 `chatGate` 훅(보내도 되나·누구에게·몇 자·속도), 화면 `chat.js`에 `maxLen`·`canSend`·`filter` 훅. 일부러 다르게 둔 것: 라이어 단계별 잠금·첫 설명 경로, 갱식마인드 정답 판정·정답자끼리 글 가리기·속도 3/15.

## 범위와 커버리지
- 대상 파일 33개, 모두 읽었다. 단 큰 파일(main.js, rooms.js, 각 room.js, shared/draw/game.js, liar index/hud, draw hud)은 채팅 관련 부분만 grep 결과와 앞뒤 문맥으로 읽었다.
  - 화면 공용: client/src/ui/chat.js, chat.css, chatSize.js, client/src/main.js(84-89, 220-405, 455-561, 608), client/src/style.css(54, 288-292), client/chat-demo.html
  - 라이어: client/src/liar/index.js(140-215), pure.js, ui/hud.js(1-60, 215-260), server/liar/room.js(1-40, 100-220, 295-360), server/liar/perms.js, shared/liar/protocol.js(14-26, 86-88), shared/liar/constants.js(53), shared/liar/game.js(366-388)
  - 요트·갱스껄·미니: client/src/yacht/index.js(24, 85-100), client/src/mini/index.js(160-190), client/src/gsk/index.js(anchor 부분), server/yacht/room.js(60-82, 270-290), server/gsk/room.js(66-90, 255-275), server/mini/room.js(55-72, 210-230)
  - 갱식마인드: client/src/draw/index.js(1-30, 232), ui/players.js(전부), ui/players.pure.js(전부), ui/hud.js(55-90, 160-215), ui/hud.pure.js(90-125), ui/settings.js(채팅 칸), server/draw/room.js(240-260, 370-400), shared/draw/game.js(550-650), shared/draw/constants.js(7-13, 96-106)
  - 서버 공용: server/protocol.js(1-20, 147-154), server/rooms.js(35-135, 743, 880-930), server/admin/bots.js(222), server/admin/games/draw.js(67)
  - 시험: test/chat.test.js(시험 이름), test/chatsize.test.js
  - 문서: docs/SPEC.md 12절·22-5·23절, docs/liar/GDD.md 4-4·9-1·9-4·13-2·14-3, docs/draw/GDD.md 3-5·7·9·10-6, docs/yacht/GDD.md, docs/gsk/GDD.md, docs/mini/PLAN.md(채팅 언급 없음)
- 아무것도 실행하지 않았다(지침). 화면 동작은 코드만 읽고 판단했다.

## 지금 구조

### 화면
| 항목 | 포커 | 라이어 | 요트 | 갱스껄 | 미니 | 갱식마인드 |
|---|---|---|---|---|---|---|
| 구현 | 공용 chat.js | 공용 chat.js, mode `'liar'` | 공용 chat.js `'game'` | 공용 chat.js `'game'` | 공용 chat.js `'game'` | **자체**: draw/ui/hud.js(입력), players.js(말풍선·기록). 사이트 채팅은 끔(main.js:232) |
| 대기 화면 | `'lobby'` 아래 붙은 줄 (main.js:402) | `'lobby'` (main.js:285) | `'game'`, 아이콘·토스트 (main.js:310) | `'game'` (main.js:262) | `'game'` (main.js:335) | **입력칸 없음** (hud.pure.js:103, settings.js의 chatSlot 비어 있음) |
| 입력칸 | 오른쪽 위 아이콘→막대 (chat.js:56-70, 214-222) | 아래 가운데 고정 + 잠금 안내 (chat.js:98-105, 186-212) | 포커와 같음 | 같음 | 같음 | 그림판 아래 form (hud.js:60-81), `maxlength=80` |
| 글자 수(화면) | 120 (chat.js:9) | 120 (같은 상수) | 120 | 120 | 120 | 입력 80, 보낼 때 40 (hud.pure.js:113-118) |
| 말풍선 | 핀 위 (pins.anchor, main.js:59) | 마네킹 위 (liar.anchorOf), say·plea는 말풍선 대신 큰 글 (main.js:547, liar/ui/hud.js:225-240) | 점수표 사진 (yacht/index.js:90) | **없음**: anchorOf가 null이라 토스트만 (main.js:59) | **없음** (mini/index.js:189 `anchorOf: () => null`) | 자리 옆으로 튀어나오는 말풍선 (players.js:159-176) |
| 크기 표시 | chatSize.js `#`/`*`/`**`/`***` | 같음. 화면 위 큰 글은 plainChat으로 표시만 뗌 (liar/index.js:197) | 같음 | 같음 | 같음 | **해석하지 않음**, 글자 그대로 (players.pure.js:98) |
| 기록 | "기록" 시트 30개 (chat.js:11, 158-162) | 오른쪽 위 6줄 + 시트 (chat.js:164) | 시트 | 시트 | 시트 | `.dr-pl-log` 30개 (players.pure.js:7) |
| 읽지 않음 | 노란 점 (chat.js:94, 295) | 없음(늘 보이는 기록) | 노란 점 | 노란 점 | 노란 점 | 없음 |
| 키보드 | Enter 열기, Esc 닫기, 한글 조합 처리 (chat.js:253-268), iPad `--chat-kb`는 붙은 줄일 때만 (chat.js:177-183) | 같음 | 같음 | 같음 | 같음 | Enter·한글 조합 (hud.js:71-73), 키보드 높이는 휴대폰 배치일 때만 (hud.js:190-205) |
| 자동 스크롤 | 바닥에서 40px 안이면 따라감 (chat.js:159) | 같음 | 같음 | 같음 | 같음 | 24px (players.pure.js:154) |
| 시스템 줄 | 없음 | "방장이 판을 끝냈습니다"를 방장 이름의 채팅으로 (server/liar/room.js:338) | 없음 | 없음 | 없음 | 화면에서만 만든 "OO 님 정답!" (players.pure.js:128), 서버 기록에는 없음 |
| 글 넣기 | `h()`가 textNode 사용 (dom.js:7) | 같음 | 같음 | 같음 | 같음 | textContent / createTextNode (players.js:17, 144) |

### 서버
| 항목 | 포커 | 라이어 | 요트 | 갱스껄 | 미니 | 갱식마인드 |
|---|---|---|---|---|---|---|
| 형식 검사 | protocol.js:147-154 (제어·보이지 않는 글자 삭제, 1~120자). 모든 방이 거친다 | 같음 + room.chat에서 80자 (liar/room.js:208) | 같음 | 같음 | 같음 | 같음 + 엔진에서 1~40자 (game.js:585) |
| 도배 제한 | rooms.js:920-926 (계정당 1초 1개, 10초 5개) | 같음 | 같음 | 같음 | 같음 | 허브 제한을 건너뜀 (rooms.js:919). 엔진이 1초 3개, 10초 15개 (game.js:568-574) |
| 금칙(단계) | 없음 | perms.js `chatBlocked` (단계·관전자·지목된 사람) | 없음 | 없음 | 없음 | 그리는 사람은 pick·draw 동안 막음 (game.js:587) |
| 방송 대상 | 방 전원 (rooms.js:130) | 전원 + `kind` (talk/plea, 엔진 say/late) | 전원 | 전원 | 전원 | 전원. 정답을 맞힌 뒤의 글(sec)은 정답자와 그리는 사람만 (game.js:603-608). 정답 글 자체는 `drHit`로 바뀜 |
| 관전자 | 가능 | 결과 화면 전까지 막음 | 가능 | 가능 | 가능 | 관전 상태 없음(GDD 287) |
| 기록 | 30개 (rooms.js:40, 126-131) | **50개** (liar/room.js:24). push가 3곳 (207-217, 338-343, 346-353) | 30개 (yacht/room.js:12, 280-285) | 30개 (gsk/room.js:15, 264-269) | 30개 (mini/room.js:9, 220-225) | 30개, 받는 사람별로 거름 (game.js:620-633 `chatLogFor`) |
| 입장 때 기록 | sendExtras (rooms.js:90) | 같은 모양 (liar/room.js:119) | yacht/room.js:77 | gsk/room.js:79 | mini/room.js:64 | draw/room.js:252 (받는 사람별) |

## 발견 사항

### [높음] 갱식마인드 방 대기·최종 결과 화면에서 채팅을 할 수 없다
- 위치: client/src/main.js:232, client/src/draw/ui/hud.pure.js:99-110, client/src/draw/ui/settings.js:3,22,70,151, client/src/draw/index.js:8,232
- 내용: draw 방에 들어오면 사이트 채팅을 끈다(`chat.setEnabled(false)`, 주석 "the draw screen has its own chat"). 그런데 자체 입력칸 `answerBox`는 `pick`·`draw`·`reveal` 단계에서만 보인다(`if (phase !== 'pick' && phase !== 'draw' && phase !== 'reveal') return none`). 단계 목록은 lobby·pick·draw·reveal·final이다(shared/draw/constants.js:7-13). 방 대기 화면에는 채팅을 붙이라고 `chatSlot`을 만들어 두었지만, 저장소 어디에서도 여기에 무언가를 붙이지 않는다(grep 결과 정의와 주석뿐). 서버는 lobby·final에서도 채팅을 받는다(game.js:579-, lobby에서 막는 곳 없음). 따라서 갱식마인드 방에서는 시작 전과 끝난 뒤에 글을 쓸 방법이 없다. docs/draw/GDD.md:235(a2 방 대기 "왼쪽 방 코드·참가자·채팅")와 GDD:25("채팅…은 사이트의 것을 그대로 쓰되")와 맞지 않는다. 다른 다섯 게임은 대기 화면에서 채팅이 된다.
- 분류: 버그 / 불일치
- 제안: lobby·final 단계에서는 사이트 채팅(`chat.setMode('lobby')`)을 켜서 chatSlot 자리에 붙이거나, answerBox가 lobby·final에서도 `{show:true, placeholder:'채팅'}`을 돌려주게 한다. 공통화한다면 전자.
- 위험: 사이트 채팅을 다시 켜면 draw 이벤트(`chat`/`chatLog`, `sec`)를 main.js가 사이트 채팅에도 넘겨야 한다. 이때 `sec` 글이 사이트 채팅으로 새지 않게 해야 한다. 서버가 이미 대상만 골라 보내지만 chatLog는 받는 사람별로 걸러진다는 점을 지켜야 한다. test/draw/leaks.test.js로 확인.

### [중간] 라이어: 81~120자를 보내면 입력칸이 비워진 채 거절돼 글이 사라진다(첫 설명 포함)
- 위치: client/src/ui/chat.js:9,233-240,249-250, server/liar/room.js:25,208, shared/liar/protocol.js:86-88, shared/liar/constants.js:53
- 내용: 화면 상한은 모든 모드에서 `MAX_LEN = 120`이다. 라이어 서버는 일반 채팅을 80자(`'채팅은 1~80자여야 합니다.'`)로, `lg say`를 `LIMITS.say=80`으로 자른다. 그런데 `submit()`은 `onSend` 직후 `input.value = ''`로 입력칸을 비운다. 그래서 81자 이상의 첫 설명을 보내면 서버가 거절하고, 글은 지워진 상태에서 발언 시간만 계속 흐른다. 크기 표시도 글자 수에 들어간다(GDD 281).
- 분류: 버그 / 불일치
- 제안: `createChat`이 `maxLen`(또는 `setLimit(n)`)을 받게 하고, 라이어 화면이 `LIMITS.chat`을 넘겨준다. 서버가 거절하면 지운 글을 되돌리는 방법도 있다.
- 위험: 라이어 폴더는 복사본 제약이 있다. 하지만 수정은 chat.js와 main.js의 연결 쪽만 하면 된다.

### [중간] 갱식마인드: 입력칸은 80자까지 받는데 41~80자는 아무 반응 없이 안 보내진다
- 위치: client/src/draw/ui/hud.js:65(`maxlength: '80'`), hud.js:75-79, hud.pure.js:113-118, shared/draw/constants.js:100(`max: 40`)
- 내용: `prepareText`가 40자를 넘으면 `null`을 돌려주고, `submit()`은 그냥 return한다. 안내도 글자 수 표시도 없다. 공용 chat.js에는 글자 수 표시(`chat-cnt`)가 있지만 draw에는 없다.
- 분류: 불일치
- 제안: `maxlength`를 `CHAT.max`(40)로 맞추거나 글자 수 표시를 넣는다.
- 위험: 낮음.

### [중간] 서버 채팅 기록 코드가 똑같이 7벌
- 위치: server/rooms.js:126-131, server/yacht/room.js:280-285, server/gsk/room.js:264-269, server/mini/room.js:220-225(이 넷은 글자까지 같음), server/liar/room.js:207-217, 337-343, 346-353, `CHAT_LOG` 상수 5곳(rooms.js:40, yacht:12, gsk:15, mini:9, liar:24), sendExtras의 chatLog 한 줄 5곳
- 내용: `{id,name,text,ts}`를 만들고 push하고 길이가 넘치면 shift하고 sendEvents로 보내는 일이 반복된다. 주석까지 "포커 방과 같다"(yacht:12, gsk:15)고 적혀 있다. 이 상태라면 예를 들어 기록에 금칙 처리나 시스템 줄을 넣는 변경을 한 곳에만 하기 쉽다.
- 분류: 중복
- 제안: `server/chat.js`에 `createChatLog(max)` → `{ add(item), items(forId?) }`와 `roomChat(room, session, text, hooks)`를 둔다(아래 공통화 제안 참고).
- 위험: 라이어 room은 복사본 제약이 있다. gamemine과 맞춰야 하므로 라이어는 그대로 두고 나머지 넷만 묶는 방법도 있다.

### [중간] 크기 표시(`#`,`*`) 떼기가 4곳에 따로 있고, 갱식마인드 화면은 해석하지 않는다
- 위치: client/src/ui/chatSize.js:332-344, client/src/liar/pure.js:11-16, server/liar/room.js:26-32, shared/draw/game.js:558-566, client/src/draw/ui/players.pure.js:98-111
- 내용: 네 구현은 결과가 같도록 맞춰져 있고 주석으로 서로를 가리킨다("chatSize.js 와 같은 규칙", "서버 stripSizeMark와 같은 규칙"). 정규식으로 하는 곳과 trim 후 잘라내는 곳으로 방식은 다르다. 갱식마인드는 정답 판정 전에 표시를 떼지만(GDD 468), 화면 말풍선과 기록은 `#사과`를 글자 그대로 보여 준다. SPEC 12절(SPEC.md:254)은 크기 표시를 "네 게임 공통"이라고 적었다.
- 분류: 중복 / 불일치
- 제안: `shared/chatMark.js` 하나(`splitMark(text) -> {size, text}`)를 서버·화면이 함께 쓰고, draw players가 size를 쓰든지 적어도 표시를 떼게 한다.
- 위험: 라이어 복사본 제약. shared/liar와 server/liar는 그대로 두어야 할 수 있다.

### [중간] 갱스껄·미니는 채팅 말풍선이 없고 오른쪽 위 토스트로만 보인다
- 위치: client/src/main.js:59(`inDraw() || inGsk() || inMini() ? null : pins.anchor(id)`), client/src/mini/index.js:189, client/src/gsk/index.js:89(갱스껄 화면에는 `anchor(kind,id)`가 있음)
- 내용: SPEC 12절은 보낸 사람 프로필 위에 말풍선이 뜬다고 적었다. 갱스껄은 자리 표(`table.anchor('tag', id)` 등)가 있는데도 사이트 채팅에 연결하지 않았다. 미니는 이모티콘을 자리 칩에 띄우지만(mini/index.js:166-172) 채팅 위치는 null이다.
- 분류: 불일치 (다: 의도인지 알 수 없음)
- 제안: 각 게임 mount가 `anchorOf(id)`를 내놓고 main.js가 이를 한 표(모드 → 게임 객체)로 고르게 한다.
- 위험: 말풍선이 판·카드를 가릴 수 있다. 실기기 확인 필요.

### [중간] 대기 화면 채팅 모양이 게임마다 다르다
- 위치: client/src/main.js:285(라이어 `'lobby'`), 402(포커 `'lobby'`), 262·310·335(갱스껄·요트·미니는 대기 중에도 `'game'`)
- 내용: SPEC 12절(SPEC.md:251)은 대기 화면에서 패널 아래에 최근 몇 줄과 입력창을 보인다고 적었다. 포커와 라이어만 그렇게 하고, 요트·갱스껄·미니는 아이콘과 토스트로 보인다. 갱식마인드는 아예 없다(위 높음 항목).
- 분류: 불일치 (다)
- 제안: 게임마다 "대기 단계 = 붙은 줄" 규칙을 공용으로 한 번만 정한다.
- 위험: 붙은 줄이 각 게임 대기 화면의 아래 버튼을 가릴 수 있다. `--chat-docked-h`로 비켜 앉아야 한다(style.css:288-292의 라이어 예).

### [낮음] 라이어 서버 기록 50개인데 화면은 30개만 남긴다
- 위치: server/liar/room.js:24, client/src/ui/chat.js:11, 302
- 내용: `setLog`가 `items.slice(-LOG_MAX)`로 30개만 남긴다. GDD 9-4의 50개 중 20개는 보내기만 하고 버려진다.
- 분류: 불일치
- 제안: 화면 상한을 모드별로 넘기거나, 서버를 30으로 맞춘다(사용자에게 물을 것).

### [낮음] 라이어 화면이 chat.js 내부 요소를 직접 건드린다
- 위치: client/src/liar/index.js:146-150(`chat.el.querySelector('.chat-feed').style.visibility`)
- 내용: 공용 모듈 내부 클래스에 의존한다. chat.js의 `syncFeed`(165)는 `hidden`을, 라이어는 `visibility`를 바꿔서 두 곳이 같은 요소를 따로 가린다.
- 분류: 과복잡
- 제안: chat.js에 `setFeedVisible(v)`를 둔다. 복사본 제약이 있다.

### [낮음] 라이어 채팅 잠금 표가 화면과 서버에 두 벌
- 위치: client/src/liar/ui/hud.js:12-45(`chatLockFor`), server/liar/perms.js:8-18(`chatBlocked`)
- 내용: 같은 GDD 4-4 표를 두 번 옮겨 적었다. 안내 문구도 서로 다르다. 지금은 동작이 맞는다. 다만 화면은 `me`가 players에 없으면 잠그지 않고, 서버는 `inGame`이 아니면 관전자로 친다(의심: 순수 관전자가 players에 들어 있는지 확인 필요).
- 분류: 중복 (복사본 제약)
- 제안: shared/liar에 하나만 두고 양쪽이 불러 쓴다.

### [낮음] 도배 제한 카운터가 거절될 글에도 쓰인다
- 위치: server/rooms.js:920-927
- 내용: `times.push(t)` 뒤에 `room.chat`이 라이어 단계 금칙으로 거절해도 카운트는 남는다. 관전자가 잠긴 단계에 다섯 번 시도하면 10초 동안 막힌다. 영향은 작다.
- 분류: 불일치
- 제안: 방의 "보내도 되나" 훅을 속도 검사보다 먼저 부른다(공통화 제안의 순서).

### [낮음] 갱식마인드 "OO 님 정답!" 줄은 다시 들어오면 사라진다
- 위치: client/src/draw/ui/players.pure.js:128, players.js:216-221, shared/draw/game.js:620(chatLog에는 drHit 줄이 없다)
- 내용: 화면에서만 만든 시스템 줄이라 chatLog로 다시 그리면 없어진다. 라이어의 시스템 줄은 서버 기록에 남는다(liar/room.js:338).
- 분류: 불일치
- 제안: 시스템 줄을 서버 기록의 `kind:'sys'`로 통일한다.

### [낮음] 줄바꿈 처리 차이
- 위치: server/protocol.js:151(`\n`을 지움 → "a\nb"는 "ab"), shared/liar/protocol.js:21(`\n`을 빈칸으로 바꿈 → "a b"), client/src/draw/ui/hud.pure.js:115(C0만 지우고 \p{Cf}는 남김. 서버가 다시 지움)
- 분류: 중복(가)
- 제안: 공용 `cleanText(raw, max)` 하나로.

## 공통화 제안

### 서버: `server/chat.js`
```
createChatLog(max = 30) -> { add(item), list(viewerId?, filter?) }   // push/shift, 복사본 반환
handleChat(room, session, text, now, rules)
rules = {
  maxLen: 120,                       // 라이어 80, 갱식마인드 40
  rate: { perSec: 1, per10s: 5 },    // 갱식마인드 {3, 15}. 계정(session) 단위
  canSend(session) -> null | 오류,   // 라이어 chatBlocked, 갱식마인드 drawer_mute
  transform(item) -> item | {event, ...}, // 라이어 kind, 갱식마인드 정답이면 drHit 으로 바꾸고 null
  audience(item) -> ids | 'all',     // 갱식마인드 sec 대상
  logFilter(item, viewerId) -> bool, // 갱식마인드 chatLogFor
}
```
- 순서: 형식(cleanText) → 길이 → canSend → 속도 → transform → 기록 → audience로 보내기.
- 포커·요트·갱스껄·미니는 기본값만 쓰면 지금과 같다. 라이어는 복사본 제약이 있으니 나중에 하거나 그대로 둔다. 갱식마인드는 엔진이 정답 판정·점수를 같이 하므로 `transform`만 엔진에 위임한다.

### 화면: `client/src/ui/chat.js` 확장
```
createChat({ onSend, getAnchor, maxLen?, rules? })
rules (방마다 setRules 로 바꿈) = {
  maxLen,                  // 라이어 80, 갱식마인드 40
  lock(state) -> {locked, hint, hot},   // 지금 setLock 을 대신. 라이어 chatLockFor, 갱식마인드 answerBox
  route(text) -> msg,      // 라이어 chatMsgFor(say/chat). 지금 main.js:85 의 특례
  show(e, me) -> 'bubble'|'log'|'hide', // 라이어 say·plea 는 말풍선 없음, 갱식마인드 sec 거르기
  layout: 'game'|'lobby'|'bottom',      // 지금 'liar' 모드를 일반화(아래 고정 줄 + 오른쪽 위 기록)
}
```
- main.js의 모드별 `if (e.k==='chat') chat.push(...)` 5벌(508, 521, 534, 547, 560)과 `chatLog` 5벌은 "현재 게임 객체의 rules"를 찾는 한 줄로 줄일 수 있다.
- 갱식마인드는 말풍선 모양(옆으로 튀어나옴, 통통 모션)은 GDD 7절에서 사용자가 승인했으니 그대로 둔다. 입력·크기 표시·대기 화면 채팅은 공용으로 할 수 있다.

### 예외로 남길 것(근거)
- 라이어 단계별 잠금, 첫 설명은 채팅 칸에서 `lg say`로 보냄, 지목된 사람만 변론, 관전자 금지, say·plea는 말풍선 대신 화면 위 큰 글: docs/liar/GDD.md 4-4, 9-1, 13-2, 14-3.
- 라이어 80자, 기록 50개: GDD 9-1, 9-4.
- 라이어 "방장이 판을 끝냈습니다" 시스템 줄: GDD 4-1, 12절(716줄).
- 갱식마인드: 그리는 사람 채팅 금지(GDD 46), 정답 글은 `drHit`로 바꾸고 정답자끼리 글은 정답자·그리는 사람만(3-5, 10-5), 재접속 기록도 걸러냄(GDD 104, 452), 1~40자·1초 3개·10초 15개(GDD 307, 468), 옆으로 튀는 말풍선(GDD 253).
- 이름·채팅 글자 색(코인 꾸미기)은 아직 방 안에 적용하지 않기로 함: SPEC 22-5("지금은 로비의 내 프로필에만").

### 사용자에게 물을 것
1. 갱식마인드 방 대기·결과 화면에도 채팅이 있어야 하나요? (GDD는 있다고 적었는데 지금은 없음)
2. 갱스껄·미니에서도 채팅이 프로필 위 말풍선으로 떠야 하나요, 지금처럼 오른쪽 위 알림이면 되나요?
3. 요트·갱스껄·미니 대기 화면에서도 포커·라이어처럼 아래에 붙은 채팅 줄을 보일까요?
4. 갱식마인드에서도 `#`, `*` 크기 표시가 먹어야 하나요? (지금은 글자 그대로 보임)
5. 라이어 기록 50개를 화면에서도 50개 보일까요, 30개로 맞출까요?

## 버린 후보
- 사용자 글을 innerHTML로 넣는 곳: 없음. chat.js는 `h()`가 textNode를 쓰고(dom.js:7), draw는 textContent를 쓰고, `svg()`에는 고정 아이콘만 들어간다.
- 서버 메모리 누수: chatLog는 방마다 30/50으로 묶여 있고, `session.chatTimes`는 5개 이하, draw `p.chatTs`는 15개 이하라 문제 없다. 방이 사라지면 함께 사라진다.
- 갱식마인드 정답 누출: 정답 글은 `drHit`로만 나간다. sec는 대상만 받고 chatLogFor는 현재 문제의 sec를 거른다. 지난 문제의 sec가 보이는 것은 정답 공개 뒤라 문제 없다. 화면도 한 번 더 거른다(players.pure.js:106-108).
- 라이어 누출: 채팅 `kind`는 역할과 무관하다(chatKind는 단계와 지목된 사람만 본다).
- 라이어 방을 떠날 때 잠금이 남는가: applyRoom(null)에서 `chat.setLock(false)`(liar/index.js:161)로 풀린다.
- 방이 바뀔 때 다른 방 기록이 보이는가: main.js:458에서 코드가 바뀌면 `setLog([])`로 비운다.
- `client/chat-demo.html`: 빌드에 들어가지 않는 데모 페이지다(다른 *-demo.html과 같은 관례). docs/SYNC.md:102에서 참조하므로 안 쓰는 코드로 보지 않았다.
- 상점 미리보기의 "채팅:" 글자 색(coin/shop.js:118-120, 379): 미리보기일 뿐이고 방 안 적용은 SPEC 22-5에서 나중으로 정했다.
- 갱식마인드 iPad 키보드(`--dr-kb-h`가 휴대폰 배치만): 실기기 없이는 판단할 수 없어 뺐다(미확인, 실기기 확인 필요).
