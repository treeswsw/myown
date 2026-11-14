# 과제 04: 방 운영(서버 쪽) 비교 검토

## 요약 (5줄 이내)
- 방 클래스가 7종(포커 Room, Liar, Yacht, Draw, Gsk, Mini) 따로 있고, 멤버·타이머·소리·채팅·이모티콘·faces·내보내기 코드 약 100줄이 6벌 복사돼 있다(글자까지 같음).
- 실제 어긋남: 갱스껄은 GDD 18절에 "✅ 코인"으로 적혀 있지만 `COIN_RULES` 줄도, `hookRoom` 연결도 없어 코인을 하나도 안 준다(rooms.js:840-845).
- 방장 넘김(연결된 사람 우선 vs 그냥 맨 앞), 끊김 유예(GRACE_MS 를 따르는 방 vs 갱식마인드 60초 고정), 오류 모양(문자열/`{msg,code}`/`{code,msg}`)이 게임마다 다르다.
- 서버가 죽을 수 있는 메시지 경로는 찾지 못했다(모든 처리가 promise catch·hub.guard 안). 포커 방은 매 상태마다 프로필 사진(최대 60KB×6)을 다시 보내서 대역폭 부담이 크다.
- 서버에 게임 하나를 붙이려면 7개 파일, 약 15곳을 고치고 방 파일에 같은 코드 약 120줄을 다시 써야 한다.

## 범위와 커버리지
- 대상 파일 27개 중 읽은 파일 27개(일부는 관련 함수만).
  - 전부 읽음: server/index.js, server/protocol.js, server/rooms.js, server/liar/room.js, server/yacht/room.js, server/draw/room.js, server/gsk/room.js, server/mini/room.js, server/coin/hooks.js, server/admin/bots.js, server/admin/games/index.js, shared/coin/rules.js, shared/coin/protocol.js, shared/yacht/protocol.js, shared/liar/protocol.js, shared/gsk/protocol.js, shared/gsk/constants.js, shared/mini/{index,connect4,gomoku}.js
  - 관련 부분만 읽음: shared/gsk/game.js(만들기·입장·나가기·끊김·tick·view, 50-130·200-240·390-470줄), shared/draw/game.js(55-300·640-716줄: 입장·끊김·나가기·내보내기·설정·시작·tick), shared/liar/game.js(425-500줄: away/back/drop/end), shared/mini/{reversi,checkers,chess}.js(apply 앞부분), server/admin/games/{holdem,bluff,liar,yacht,draw}.js(skip), server/coin/wallet.js(award 앞부분), docs/SPEC.md 4·7·7-1·7-2·19·20·21·22-2·22-13·23·24절, docs/gsk/GDD.md 14·17·18절, docs/mini/PLAN.md 방 상태 줄.
  - 읽지 않음: server/store.js, server/coin/pin.js, server/liar/{perms,scores}.js, 엔진의 게임 규칙 부분. 방 운영과 관계가 적어서 뺐다.
- 아무것도 실행하지 않았다(읽기 전용).

## 지금 구조 (게임별 표)

### 1) 만들기·등록·메시지 나누기
| 게임 | 방 클래스/팩토리 | 허브 등록(만들기) | 전용 요청 분배 | 코인 감싸기 | 관리자 봇 |
|---|---|---|---|---|---|
| 홀덤·블러핑 | `class Room` server/rooms.js:44 | rooms.js:853-855 `new Room` | `act`/`play`/`liar`/`mode` rooms.js:882-896 | 블러핑만 직접 `hub.award` rooms.js:359 | holdem.js, bluff.js |
| 라이어 | `createLiarRoom` server/liar/room.js:57 | rooms.js:819-825 | `lg` → `room.lg` rooms.js:876 (`lg rank`는 허브가 795-805에서 직접) | `hookLiar` hooks.js:15 | liar.js |
| 요트 | `createYachtRoom` server/yacht/room.js:25 | rooms.js:826-832 | `yt` → `room.yt` rooms.js:877 | `hookYacht` hooks.js:34 | yacht.js(skip 없음) |
| 갱식마인드 | `createDrawRoom` server/draw/room.js:44 | rooms.js:833-839 | `dr` → `room.dr` rooms.js:880, 다른 요청 거절 791 | `hookDraw` hooks.js:52 | draw.js |
| 갱스껄 | `createGskRoom` server/gsk/room.js:20 | rooms.js:840-845 (**hookRoom 없음**) | `gk` → `room.gk` rooms.js:878, 다른 요청 거절 793 | **없음** | **없음**(NONE) |
| 미니 | `createMiniRoom` server/mini/room.js:12 | rooms.js:846-852 | `mn` → `room.request` rooms.js:879 | `hookMini` hooks.js:83 | **없음**(NONE) |

모드 분기는 rooms.js에 다섯 덩어리로 흩어져 있다: 791/793(거절), 816-855(만들기), 874-896(분배), 887-892(포커 요청 거절과 안내 문구), 919(채팅 속도 예외). 정원표 `MAX_PLAYERS` rooms.js:29 도 따로 있다.

### 2) 방 운영 기능별 위치
| 기능 | 포커 Room | 라이어 | 요트 | 갱식마인드 | 갱스껄 | 미니 |
|---|---|---|---|---|---|---|
| 입장 | join :77 | join :99 | join :62 | join :219(엔진 gJoin) | join :62(엔진 addPlayer) | join :50 |
| 정원 검사 | MAX_PLAYERS[mode] 6/4 | 8 | 4 | 8(방+엔진 두 번) | 6(방). 엔진은 12(관전 포함) 허용 | 8(2자리+관전) |
| 정원 초과 응답 | 문자열 | 문자열 | 문자열 | 문자열 | 문자열 + 상태 다시 보냄(:64) | `{code:'mn_full',msg}` |
| 나가기 | leave :148 | leave :236 | leave :131 | leave :276 → 엔진 → syncMembers :146 | leave :113 | leave :92 |
| 방장 넘김 | `members[0]` :165 | `members[0]` :244 | `members[0]` :147 | 엔진 transferHost: 연결된 사람 중 먼저 온 사람, 없으면 맨 앞 (draw/game.js:192-198) | 엔진 dropMember: 연결된 사람 먼저 (gsk/game.js:88-91) | `members[0]` :101 |
| 강퇴 | 없음 | `lg kick` 대기 중만 :477 | 없음 | `dr kick` 대기·최종 순위 (draw/game.js:220) | 없음 | 없음 |
| 강퇴 알림 | - | `{t:'error', msg}` 코드 없음 :483 | - | `{t:'error', code:'dr_kicked'}` :134 | - | - |
| 시작 조건 | 방장, lobby, 연결 2명↑(홀덤은 칩도) :190 | 방장, lobby/result, 연결 3명↑, 주제 :259 | 방장, lobby/result, 연결 2명↑ :163 | 방장, lobby/final, 연결 2명↑ (엔진) | 방장, playing 아님, 연결 3명↑, 앞 6명 (엔진) | 방장, lobby만(end 뒤엔 `again` 먼저), 앞 2명 :122 |
| 방장 설정 | `mode`(홀덤↔블러핑) :181 | `lg settings` :433 | 없음 | `dr settings` (엔진) | 없음(색은 각자) | `mn game` :146 |
| 관전 | `phase!=='lobby' && !inHand` | 이번 판 참가자 아님 | 이번 판 참가자 아님(기권 포함) | 엔진 | 엔진 `spec` | 자리 없음 |
| 끊김 유예 | 사람마다 setTimeout `timing.grace` :138, 끝나면 차례면 자동 행동 후 leave | 사람마다 setTimeout `timing.grace` :228 → leave | 사람마다 setTimeout :112 → leave(id,'away') | 타이머 없음. 엔진 `TIMES.seatKeep`=60초 고정, 그리는 사람 15초 (draw/constants.js:70-71) | 타이머 없음. 엔진 `awayAt + graceMs`(=timing.grace), 방 deadline/flush :197-228 | 사람마다 setTimeout :87 → leave(판 중이면 기권) |
| away/back 알림 | **없음** | 있음 | 있음 | 엔진 | 있음 | 있음 |
| 재접속 복구 | 허브 login :759-761(setConnected→view→sendExtras) | 같음 | 같음 | 같음 + drSync | 같음 | 같음 |
| 빈 방 지우기 | gc 타이머 :173 | :252 | :154 | syncMembers :166 | :130 | :108 |
| 비울 때 타이머 정리 | toLobby가 next 정리 | game 정리 | 정리할 것 없음 | game 정리 | dl 정리 | 정리할 것 없음 |
| faces | 없음. 상태에 avatar를 넣음 :423 | sendExtras/sendFaces/faceChanged | 같음(복사) | 같음(복사, 순서만 다름) | 같음(복사) | 같음(복사) |
| 상태 방송 | push(): roomsChanged+events+view | 같음 | 같음 | 엔진 fx.room 대상만, push()는 허브용 | flush(): 상태+타이머 다시 걸기, push=events+flush | 같음(포커형) |
| 오류 모양 | 문자열 | 문자열 | 문자열 | 문자열 또는 `{msg,code}` | `{msg,code}` | `{code,msg}`. 다만 `{t:'start'}`는 :139에서 msg만 돌려줘 코드가 빠짐 |
| 허브 close 때 flush | 없음 | 점수 넘기기 :495 | 없음 | 빈 함수 :429 | **상태 방송 함수**(이름만 같음) :215 | 없음 |

## 발견 사항

### [높음] 갱스껄은 코인을 안 준다 (문서는 "✅ 완료")
- 위치: server/rooms.js:840-845 (gsk만 `hookRoom` 없음), shared/coin/rules.js:2-8 (gsk 줄 없음), server/coin/hooks.js:95-103 (gsk case 없음), docs/gsk/GDD.md:296-297
- 내용: GDD 18절 "✅ 코인 (2026-11-13 사용자 '코인 주는거도 추가해')"에는 `gsk: { finish: 2, win: 2, gapMs: 180000 }`와 `hookRoom`을 붙인다고 적혀 있다. 그런데 rules.js에 gsk 줄이 없어 `coinsFor('gsk')`는 0이고, 방을 만들 때 hookRoom도 부르지 않는다. server/gsk·shared/gsk·test/gsk 어디에도 `award`가 없다(grep으로 확인). 사용자가 시킨 일이 완료로 표시됐지만 실제로는 안 돌아간다.
- 분류: 불일치(한 곳만 고쳐진 실제 사례)
- 제안: rules.js에 한 줄 넣고, hooks.js에 `hookGsk`를 만든다. GskRoom.apply의 `fx.finished`(players, winner)를 감싸고, 끝까지 한 사람 = finished.players 중 방에 남은 사람, opp = 시작 인원 − 1. rooms.js:842 뒤에 `hookRoom(hub, gr)`. SPEC 22-14 표와 test/coin/award.test.js에도 한 줄씩.
- 위험: 갱스껄의 "판 끝"은 tick 안에서도 생긴다(타이머로 끝나는 판). 감싼 apply가 거기서도 불리는지 시험해야 한다. 공개 전 비밀 약속(GDD 4절) 때문에 지급은 결과가 공개된 뒤여야 한다(SPEC 22-13 3번).

### [중간] 방장 넘김 규칙이 게임마다 다르고, 셋은 끊긴 사람에게 방장을 넘긴다
- 위치: rooms.js:165, liar/room.js:244, yacht/room.js:147, mini/room.js:101 (`members[0]`) / draw/game.js:192-198, gsk/game.js:88-91 (연결된 사람 우선)
- 내용: SPEC 4절은 "가장 먼저 들어온 사람"이라고만 적었다. 포커·라이어·요트·미니는 맨 앞 사람이 끊겨 있어도(유예 60초 중) 그 사람을 방장으로 만든다. 이 방들은 시작·설정·강퇴가 방장만 되니, 최대 60초 동안 아무도 판을 시작하지 못한다. 갱식마인드·갱스껄은 연결된 사람을 먼저 고르니 이 문제가 없다. 방장이 *끊기기만* 한 경우에는 여섯 방 모두 방장을 넘기지 않는다.
- 분류: 불일치 (가) 우연한 차이
- 제안: 공용 `nextHost(members)` = 연결된 사람 중 먼저 들어온 사람, 없으면 맨 앞. 모든 방이 이것을 쓰게 한다.
- 위험: 시험 중 "나가면 다음 사람이 방장"을 확인하는 것이 있으면 기대값이 바뀔 수 있다. 라이어는 복사본 제약이 있다(gamemine과 같이 고쳐야 함).

### [중간] 끊김 유예: 갱식마인드만 GRACE_MS를 무시하고 60초 고정
- 위치: shared/draw/constants.js:71 `seatKeep: 60`, shared/draw/game.js:661·690. 나머지는 hub.timing.grace(rooms.js:18, index.js:127 GRACE_MS)를 쓴다.
- 내용: SPEC 19-3은 "시간 관련 환경 변수는 사이트 공통 GRACE_MS 하나뿐"이라고 한다. GRACE_MS를 바꾸면(test/ui/yacht-round.mjs:117은 10000을 씀) 갱식마인드만 60초 그대로다. 유예를 재는 방식도 세 가지다. ① 사람마다 setTimeout(포커·라이어·요트·미니) ② 엔진의 마감 시각을 방이 한 타이머로 재기(갱스껄) ③ 엔진 tick에서 나가기 처리(갱식마인드).
- 분류: 불일치 (가). 그리는 사람 15초는 (나): draw GDD 규칙이다.
- 제안: 방이 엔진에 `graceMs`를 넘기는 갱스껄 방식으로 맞춘다(엔진 기본값은 유지).
- 위험: 낮음. draw 시험 중 60초에 기대는 것이 있으면 값만 맞추면 된다.

### [중간] 같은 방 운영 코드 약 100줄이 6벌
- 위치: member/setTimer/clearTimer, addSound/editSound/playSound, emote, chat, sendEvents, push, sendExtras/sendFaces/faceChanged, 상수 `MAX_ROOM_SOUNDS=24`·`MAX_ACCOUNT_SOUNDS=8`·`CHAT_LOG`
  - rooms.js:61-131·403-413, liar/room.js:83-134·170-218·501-511, yacht/room.js:46-97·248-299, draw/room.js:68-78·246-265·396-426, gsk/room.js:46-99·232-277, mini/room.js:34-79·189-237
- 내용: 글자까지 같은 복사본이다(라이어 머리 주석 :5 "copied from myown server/rooms.js"). 소리 한도나 편집 권한 규칙 하나를 바꾸려면 6곳을 고쳐야 한다. 이미 생긴 작은 차이도 있다. clearTimer의 null 검사는 포커만 `!== null`이고 나머지는 undefined도 본다. sendExtras 순서는 갱식마인드만 faces가 먼저다. `CHAT_LOG`는 라이어만 50(GDD 9-4, (나)).
- 분류: 중복
- 제안: 아래 "공통화 제안"의 BaseRoom으로 옮긴다.
- 위험: 라이어는 복사본 제약이 있다. 갱식마인드 채팅은 엔진이 기록하므로(chatLogFor) 예외로 남긴다.

### [중간] 포커 방은 상태를 보낼 때마다 모든 사람의 프로필 사진을 다시 보낸다
- 위치: rooms.js:423 (`avatar: m.session.user.avatar`), push :409-413, setConnected :139, 허브 avatar :811-814
- 내용: 다른 모든 방은 사진을 상태에서 빼고 `faces` 알림으로 한 번만 보낸다. 포커 Room.view는 players마다 avatar(최대 60KB, protocol.js:166)를 넣는다. 그래서 홀덤 6명이면 행동 하나마다 한 사람에게 최대 약 360KB, 방 전체로는 약 2MB가 나간다. Render 무료 요금제에서 대역폭과 JSON 만들기 부담이 된다.
- 분류: 성능 / 불일치 (가). SPEC 7절 상태 모양에 avatar가 적혀 있어 화면 쪽 수정도 함께 해야 한다.
- 제안: 포커도 faces 알림을 쓰고(BaseRoom 공용) 상태에서 avatar를 뺀다. client의 포커 HUD가 faces를 읽도록 함께 고친다.
- 위험: 포커 화면(hud.js 등)이 `players[].avatar`를 읽는다. 화면 구역과 같이 움직여야 한다.

### [중간] 서버에 게임 하나를 붙이려면 7개 파일 약 15곳 + 방 파일 보일러플레이트
- 위치(세어 본 곳):
  1. server/index.js:137-141 스위치 환경 변수
  2. server/protocol.js:177 MODES
  3. server/protocol.js:288-292 봉투 `t` 목록 (+ :256처럼 create에 추가 칸이 있으면 한 곳 더)
  4. rooms.js:5-9 import
  5. rooms.js:29 MAX_PLAYERS (방 파일의 MAX_PLAYERS와 같은 값을 다시 적음)
  6. rooms.js:494 createHub 인자
  7. rooms.js:510-514 hub 필드
  8. rooms.js:530 sendMe 스위치 칸
  9. rooms.js:816-852 create 분기(만들기·hookRoom·rooms.set·join 4줄 복사)
  10. rooms.js:791/793 다른 게임 요청 거절 목록(새 `t`를 기존 목록에도 넣어야 함)
  11. rooms.js:876-880 분배 case
  12. rooms.js:887-891 포커 요청 거절과 "방을 새로 만들어 주세요" 문구
  13. server/coin/hooks.js 감싸기 함수와 switch
  14. shared/coin/rules.js 한 줄
  15. server/admin/games/<mode>.js + index.js
  16. 새 방 파일에 보일러플레이트 약 120줄
- 분류: 과복잡
- 제안: 게임 등록표 하나(`server/games.js`: `{mode, create, max, envKey, envelope:'gk', offMsg, hook}`)로 2~12번을 한 줄 등록으로 줄인다. 방은 `room.handle(session, msg)` 하나만 내보내고, 다른 게임 요청 거절은 "그 방의 envelope가 아니면 거절"로 바꾼다.
- 위험: 오류 문구와 코드가 지금 게임마다 다르다(아래). SPEC 7-1·7-2·19-2·23에 적힌 문구를 그대로 지키는 시험이 있을 수 있다.

### [중간] 갱스껄·미니는 관리자 봇이 아무것도 안 한다 (SPEC 21-6 약속 빠짐)
- 위치: server/admin/games/index.js:8 (`{ holdem, bluff, liar, yacht, draw }`), :16 `gameOf` → NONE
- 내용: SPEC 21-6은 새 게임마다 createBrain/skip을 등록하라고 한다. 갱스껄·미니 방에 넣은 봇은 들어가기만 하고 움직이지 않는다. 갱스껄은 봇 2명 + 관리자로 시작 조건(연결 3명)을 채울 수 있다. 시작하면 봇 차례에서 판이 멈춘다(엔진에 차례 시간 제한이 없음: gsk/game.js:411-419 nextDeadline에 차례 마감이 없음). skip도 false라 풀 방법이 나가기뿐이다.
- 분류: 불일치 (다): 의도적으로 미룬 것인지 물어야 함
- 제안: 각각 server/admin/games/gsk.js·mini.js를 만들거나, 봇이 없는 모드는 `bot+`를 `adm_nobot` 같은 오류로 거절한다.
- 위험: 관리자만 영향을 받는다.

### [낮음] 오류 모양이 세 가지
- 위치: 포커·라이어·요트 문자열. 갱식마인드 `{msg,code}`/문자열 섞임(draw/room.js:36-37). 갱스껄 `{msg,code}`. 미니 `{code,msg}`. 단 mini/room.js:139 `start()`는 `.msg`만 돌려줘 `{t:'start'}`로 시작하면 `mn_host`/`mn_need2` 코드가 빠진다(`{t:'mn',a:'start'}`에는 있음). 같은 거절인데 길에 따라 모양이 다르다.
- 분류: 불일치 (가)
- 제안: 공용 `err(code, msg)`로 모두 `{msg, code}`. 허브는 이미 두 모양을 다 받는다(rooms.js:653).
- 위험: 화면이 code로 분기하는 곳(dr_/gk_/mn_)은 그대로 둔다.

### [낮음] 강퇴는 라이어·갱식마인드에만, 그 둘도 조건·알림이 다르다
- 위치: liar/room.js:477-486(대기 중만, 오류 문자열 '방장이 내보냈습니다.', 코드 없음), draw/game.js:220-227(대기·최종 순위, `dr_kicked` 코드)
- 분류: (나) 각 GDD 규칙 / (다) 다른 게임(포커·요트·갱스껄·미니)에도 강퇴가 필요한지 물어볼 것
- 제안: BaseRoom에 `kick(by, target, {phases})` 하나. 허용 단계는 게임별 설정.

### [낮음] 라이어: 정답 공개(answer) 중에 모두 나가면 판이 멈춘 채 남는다 (복사본 제약 있음)
- 위치: shared/liar/game.js:470 (`P.ANSWER`에서 drop하면 끝내지 않고 return), server/liar/room.js:249-253(빈 방이면 game 타이머만 지우고 game은 남김), join :99-115(arm 안 함)
- 경로: answer 단계에서 전원이 나가거나 끊겨 60초가 지남 → members 0 → `clearTimer('game')`. 60초 gc 안에 누가 같은 코드로 들어옴 → 상태는 phase 'answer', phaseEndsAt은 과거, 타이머 없음 → `start`는 "이미 게임이 진행 중입니다."로 거절됨. 방장이 `lg end`를 보내야만 풀린다.
- 분류: 버그(드묾)
- 제안: 빈 방이 되면 `this.game = null; this.phase='lobby'`로 되돌리거나, join에서 `arm()`을 부른다.
- 위험: 라이어는 gamemine과 같게 유지해야 하므로 총괄이 정한다.

### [낮음] 유예 만료 콜백이 중간에 예외를 내면 그 사람은 방에서 영영 안 빠진다 (의심)
- 위치: rooms.js:143-146(`autoAct()` 다음 `leave`), liar/room.js:240(leave 안에서 notifyEngine이 멤버 제거보다 먼저), yacht/room.js:138-143(drop/sync가 멤버 제거보다 먼저)
- 내용: hub.guard가 예외를 삼키므로 서버는 죽지 않는다. 하지만 members에서 빼기 전에 던지면 그 사람은 `connected:false`인 채 남는다. 유예 타이머는 이미 소비됐으니 다시 걸리지 않고, 방도 영영 비지 않아 gc 대상이 안 된다. 그 세션도 hub.sessions에 남는다. 실제로 던지는 입력은 찾지 못했다.
- 분류: 버그(의심). 확인하려면 엔진 drop/forceFold가 던질 수 있는지 시험해야 한다.
- 제안: BaseRoom.leave에서 "멤버 빼기·session.room=null·빈 방 gc"를 `finally`에 둔다.

### [낮음] 갱스껄 `flush()` 이름이 허브 종료용 flush와 겹친다
- 위치: rooms.js:590-596(`room.flush?.()`는 "점수 넘기기" 뜻), gsk/room.js:215(상태 방송과 끊긴 사람 내보내기)
- 내용: 서버가 끝날 때 갱스껄 방은 모두에게 상태를 한 번 더 보내고, 유예가 지난 사람을 leave시킨다. 지금은 해가 없다. GDD 14절 대기열에도 이미 적혀 있다.
- 분류: 과복잡
- 제안: 허브 쪽 훅 이름을 `onShutdown()` 같은 뜻이 분명한 이름으로 바꾼다.

### [낮음] 갱스껄은 실패한 요청에도 방 전체에 상태를 다시 보낸다
- 위치: gsk/room.js:64(가득 참), :143(start 실패), :155(gk 실패)
- 내용: 거절 하나마다 모든 사람에게 view를 보낸다. 장난 요청 20개/초 × 6명이면 상태 120개/초다. GDD 14절 대기열에 이미 있다.
- 분류: 성능
- 제안: 실패할 때는 tick 결과가 있을 때만 flush한다.

### [낮음] 정원 숫자가 두 곳에 있다
- 위치: rooms.js:29 `MAX_PLAYERS` 표 / 각 방 파일의 `export { MAX_PLAYERS }`(liar :15, yacht :9, draw :18, gsk :12, mini :6). 지금은 값이 같다. 방 목록의 `max`는 허브 표를 쓰고, 실제 입장 거절은 방의 값을 쓴다. 한쪽만 바꾸면 목록의 "가득 참" 표시가 틀린다.
- 분류: 중복
- 제안: 허브가 방의 `MAX_PLAYERS`(또는 `room.max`)를 읽는다.
- 갱스껄 엔진은 관전 포함 12명까지 받는데(gsk/game.js:70), 방이 6명에서 먼저 막으니 엔진 검사는 쓰이지 않는다. 관전 자리를 6명 넘게 둘지는 (다).

### [낮음] 방 목록 phase 값이 게임마다 다르다
- 위치: rooms.js:536 `phase: r.phase`. 포커 lobby/playing/result, 라이어는 엔진 단계 이름 그대로, 갱식마인드 lobby/playing, 미니 lobby/play/end.
- 내용: 화면(lobby.js:308)은 'lobby'인지만 보니 지금은 문제가 없다.
- 분류: 불일치 (가)
- 제안: roomList에서 `'lobby'|'playing'` 두 값으로 맞춘다.

### [낮음] 포커 방만 away/back 알림이 없다
- 위치: rooms.js:133-140. 다른 방은 `changed`일 때 `{k:'away'|'back'}`을 보낸다(SPEC 19-3 "사이트 공통 모양").
- 분류: 불일치 (가)

### [낮음] 재접속하면 room 상태를 두 번 받는다
- 위치: rooms.js:759(`setConnected(true)` → 방이 그 사람 포함 전원에게 push) 다음 :760에서 허브가 같은 사람에게 room을 또 보낸다. 갱식마인드(가로채기 접속)·갱스껄도 같다.
- 분류: 성능(작음)

## 공통화 제안

### 하나로 묶을 것: `server/room/base.js` (BaseRoom)
```
class BaseRoom {
  constructor(hub, code, mode, { max, chatLog = 30 })
  // 공용(지금 6벌 복사본): member, setTimer/clearTimer, addSound/editSound/playSound, emote, chat(기본),
  //   sendEvents, push(events) = roomsChanged + events + 사람마다 view, sendExtras(chatLog·faces·sndList + extraFor(session)),
  //   sendFaces/faceChanged, nextHost() = 연결된 사람 중 먼저 온 사람 → 없으면 맨 앞
  join(session)        // 정원 → gc 해제 → members.push → hostId → onJoin(m) → push → faces → joined → sendExtras
  setConnected(id, c)  // changed 계산, away/back 알림, 유예(hub.timing.grace) 시작·해제, awayUntil, onAway/onBack 훅
  leave(id, reason)    // onLeave(id, reason) 훅 → (finally) 멤버 빼기, session.room=null, 방장 넘김, room:null·me·rooms, 세션 정리, 빈 방이면 onEmpty() + gc
  kick(by, target)     // 허용 단계는 게임이 정함(kickPhases), 알림은 {t:'error', code:'<p>_kicked'}
  start(by)            // 방장·단계 검사 공용, 나머지는 canStart()/onStart()
  err(code, msg)       // 항상 {msg, code}
}
```
- 게임이 채울 훅: `view(id)`, `handle(session, msg)`(전용 봉투), `canStart/onStart`, `onLeave(id, reason)`, `onAway(id)/onBack(id)`, `onGraceExpired(id)`(기본 = leave(id,'away')), `onEmpty()`(타이머 정리, 게임 초기화), `settle` 지점(코인 훅이 감쌀 곳), `mediaBlocked`, `extraFor(session)`.
- 허브 쪽: 등록표 `server/games.js` 하나로 만들기·스위치·봉투 분배·다른 게임 요청 거절·정원·방 목록·me 스위치를 처리한다(위 "15곳"을 1곳으로).
- 코인: 각 방이 `onSettle(rows)` 같은 한 지점을 두고, hooks.js는 그 하나만 감싼다(이번 갱스껄 누락 같은 일이 생기지 않게, 감싸기가 빠지면 등록표 검사에서 실패하게).

### 예외로 남길 것 (근거)
- 요트: 끊긴 사람 차례에서 기다림, 차례 시간 제한 없음, 유예 끝나면 기권(`leave(id,'away')` → ytDrop). CLAUDE.md 요트 절, SPEC 19 "확정". 끊길 때 흔들기를 끝내는 처리(stopShake, yacht/room.js:115·120)도 남긴다. → `onAway` 훅.
- 포커: 유예가 끝날 때 차례면 자동 행동(SPEC 4절 마지막 줄). 칩 정산(settleLive). 홀덤↔블러핑 `mode` 바꾸기. → `onGraceExpired` 훅.
- 갱식마인드: 멤버 목록을 엔진이 갖는다(syncMembers). 그리는 사람이 끊기면 15초(draw GDD, constants.js:70). 채팅·정답 가리기와 채팅 속도는 엔진이 잰다(rooms.js:919, CLAUDE.md "정답자끼리 채팅"). drSync를 sendExtras에 덧붙인다. 다만 seatKeep 60은 timing.grace로 받게 바꿀 수 있다.
- 갱스껄: 마감 시각 하나로 모든 시간을 잰다(엔진 nextDeadline, gsk/room.js:2-3). 사람마다 따로 보내는 이벤트(`to`). 공개 전 비밀(CLAUDE.md, GDD 4절). → BaseRoom의 사람마다 setTimeout 대신 "deadline 모드"를 고를 수 있게 하거나, setConnected를 덮어쓴다.
- 라이어: 채팅 규칙·길이 80·기록 50, mediaBlocked, 점수 넘기기(flushOne), 대기 중만 강퇴, faces를 상태에서 뺌(CLAUDE.md, GDD 4-4·9-1·9-4). 복사본 제약이 있어 BaseRoom으로 옮길지는 총괄이 정한다.
- 미니: 자리 2개 + 관전, `again` 단계, 나가기·끊김 60초 = 기권(docs/mini/PLAN.md).

### 사용자에게 물을 것
1. 갱스껄 코인(GDD 18 "✅")이 실제로는 빠져 있다. 바로 붙일까?
2. 방장이 끊기면(나가지 않고) 다른 사람에게 방장을 넘길까, 아니면 지금처럼 60초 기다릴까? 나갔을 때 "연결된 사람 우선"으로 모든 게임을 맞춰도 될까?
3. 강퇴를 모든 게임(포커·요트·갱스껄·미니)에 넣을까?
4. 갱스껄·미니에 관리자 봇이 필요한가, 아니면 봇 추가를 막을까?
5. 포커 방도 프로필 사진을 faces 알림으로 바꿔도 될까? 화면 수정이 함께 필요하다.

## 버린 후보
- 이상한 메시지로 서버가 죽는 경로: parseMessage는 JSON.parse를 try로 감싸고, 처리는 conn.queue `.catch`(rooms.js:654), 타이머는 hub.guard 안이다. 미니 `move`는 검사 없이 들어가지만 다섯 규칙의 apply가 모양을 먼저 확인한다. 문제 아님.
- 갱스껄 flush ↔ leave 재귀: leave는 멤버가 없으면 바로 return하고 엔진 멤버와 방 멤버가 어긋나는 길이 없어 무한 반복이 없다.
- 빈 방 gc 뒤 남는 타이머: 각 방이 빌 때 자기 타이머를 정리한다(포커 toLobby, 라이어·갱식마인드 game, 갱스껄 dl). 유예 타이머는 leave에서 지운다. 봇 타이머는 bot.stop. 누수 없음.
- 같은 코드로 방이 겹침: newCode가 아직 지워지지 않은 방 코드도 피한다(rooms.js:615).
- 끊김과 나가기가 동시에 일어남: 끊긴 사람은 leave를 보낼 수 없다. 가로채기 접속은 old.session=null로 끊김 처리를 막는다(rooms.js:750). 강퇴·leave는 유예 타이머를 지운다.
- 관리자 방장 감시(defineProperty on session.room): 모든 퇴장 길이 session.room=null로 끝나 정상 동작한다.
- hub.close가 갱스껄 members의 없는 `grace`로 clearTimeout(undefined)를 부르는 것: 해가 없다.
- 라이어·요트의 `faces`가 끊긴 사람 사진까지 보내는 것: 의도된 동작(방에 있는 사람 전원).
