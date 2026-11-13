# 과제 03: 방 화면 틀(화면 쪽)

## 요약 (5줄 이내)
- 방 틀은 main.js 한 파일에 게임마다 복사돼 있다. 게임 화면 함수 5개(applyXRoom), 퇴장 처리 블록 5개, 사이트 공통 이벤트 분배 블록 6개(포커 포함), 상단 줄 3벌(lgbar/gkbar/ytbar)과 거의 같은 CSS 3벌이 있다.
- 실제로 어긋난 사례: 갱식마인드·갱스껄은 기본 이모티콘을 받아도 아무 데도 그리지 않고, 사진 이모티콘·사운드 이름표도 숨겨진다(anchor 가 null). 갱스껄 이모티콘 버튼은 다시 눌러도 창이 닫히지 않는다. 갱스껄 오류는 토스트가 두 번 뜬다. 라이어는 사이트 소리 끄기를 따르지 않고 끄는 버튼도 없다.
- 시작 버튼 조건 표시, 나가기 확인, 소리 버튼, 내보내기(kick)가 게임마다 제각각이다. 갱스껄은 방장에게 시작 버튼이 두 개 보인다.
- main.js 는 어떤 게임 모듈의 dispose 도 부르지 않는다. 방을 나가도 모듈은 숨겨진 채 남는다(라이어 3D 장면, 갱식마인드 500ms 타이머, 창 리스너).
- 게임 하나를 더 붙이려면 main.js 약 13곳, lobby.js 약 7곳, style.css 1곳을 고쳐야 한다. 등록표 하나 + 공용 상단 줄 하나로 줄일 수 있다.

## 범위와 커버리지
- 대상 파일 17개 중 17개를 읽었다: client/src/main.js(627줄 전체), net.js, state.js, style.css(전체), index.html, ui/dom.js, ui/hud.js, ui/lobby.js(방 만들기·입장·대기실·게임 켜기 부분, 20-40, 220-362, 450-564), liar/index.js, yacht/index.js, draw/index.js, gsk/index.js, mini/index.js, gsk/ui/wait.js, liar/ui/settings.js(방장 설정·참가자 목록), draw/ui/settings.js·settings.pure.js(시작 조건·방장 설정).
- 확인용으로 일부만 읽은 파일: ui/chat.js(setMode/setEnabled), ui/emotePanel.js(getAnchor), draw/pure.js(routesFor), draw/ui/players.js(event), gsk/model.js(시작 행동), gsk/ui/result.js, liar/audio.js, yacht/audio.js, test/ui/smoke.mjs·draw-round.mjs(상단 줄 선택자), docs/gsk·draw·yacht GDD 의 상단 줄 문단, server/mini/room.js(start 처리).
- 서버 쪽 방 처리는 이 과제 범위가 아니다(서버 검토 과제 담당).

## 지금 구조

### 진입 함수 모양
| 게임 | 진입 | 넘기는 것(main.js) | 실제로 쓰는 것 | 반환 | 해제 | 다시 마운트 막기 |
|---|---|---|---|---|---|---|
| 포커 | 처음부터 붙어 있음(hud/pins/cluster/wheel/bluff/lobby) | – | – | – | 없음(update(null)) | – |
| 라이어 | `mountLiar(opts)` liar/index.js:40 | ui, stage, send, getMe, chat, toast, emotePanel (main.js:285) | getMe·emotePanel 은 안 씀(:49 eslint-disable) | applyRoom, handleEvent, chatMsg, lobbyPanel, anchorOf, frame, dispose | applyRoom(null) 은 숨기기만. dispose 는 있지만 main.js 가 부르지 않음 | 모듈의 `current` + 큐 안의 `if (liar) return` |
| 요트 | `mountYacht` yacht/index.js:24 | ui, stage, send, getMe, chat, toast, emotePanel (:309) | chat·toast·emotePanel 은 안 씀(:24 eslint-disable) | applyRoom, handleEvent, anchorOf, frame, dispose | applyRoom(null) 이 teardown 으로 실제 정리(:61-72) | 큐 안의 `if (yacht) return` 만 |
| 갱식마인드 | `mountDraw` draw/index.js:41 | ui, send, getMe, toast(drawToast), leave, openEmote (:242) | 다 씀(isMuted 는 선택) | el, chatSlot, room, event, error, dispose | room(null) 은 숨기기만. dispose 를 부르지 않음 | `current` + 큐 |
| 갱스껄 | `mountGsk` gsk/index.js:40 | ui, send, getMe, toast, leave, openEmote (:267) | openEmote 는 받지 않음(:58), ctx.leave 는 아무 모듈도 안 씀 | room, update, event, error, dispose | room(null) 은 숨기기만 | `current` + 큐 |
| 미니 | `mountMini` mini/index.js:30 | ui, send (:333) | ui, send | applyRoom, handleEvent, frame, dispose, anchorOf | applyRoom(null) 이 판을 비움 | 큐 |

함수 이름이 두 가지(applyRoom/handleEvent 대 room/event)라서 main.js 가 게임마다 다르게 부른다(gsk 는 `(g.update ?? g.room).call(g, …)`, main.js:270, 365).

### 방 틀 기능
| 기능 | 포커 | 라이어 | 요트 | 갱식마인드 | 갱스껄 | 미니 |
|---|---|---|---|---|---|---|
| 상단 줄 | 왼쪽 위 원형 아이콘 hud.js:21 `.hud-tl` | main.js:162 `.lgbar` | main.js:196 `.ytbar`(왼쪽 = 점수표 너비) | `.lgbar` 재사용. 휴대폰 가로·게임 중에는 숨기고 화면 안 ≡ 메뉴(draw/index.js:131-165, main.js:222) | main.js:174 `.gkbar` | `.lgbar` + `.lgbar-mini` (main.js:331) |
| 방 코드 글 | – | `방 코드 X` | `방 X` | `방 코드 X` | `방 코드 X` | `방 코드 X` |
| 나가기 | 메뉴 안 + 관전·결과 때 알림 줄(hud.js:24-27,44-45), 대기실 lobby.js:335 | 상단 줄 | 상단 줄 | 상단 줄 / ≡ 메뉴 / 결과 화면(draw/ui/result.js:193) | 상단 줄 | 상단 줄 |
| 나가기 확인 창 | 없음 | 없음 | 없음 | 없음 | 없음 | 없음(기권만 `confirm()` mini/index.js:69) |
| 보내는 메시지 | `{t:'leave'}` 전부 같음 | | | | | |
| 나간 뒤 정리 | applyRoom(null) | applyRoom(null), 모듈 남음 | teardown 정리 | room(null), 모듈 남음 | room(null), 모듈 남음 | applyRoom(null), 모듈 남음 |
| 이모티콘 버튼 | hud 아이콘 | lgEmote | ytEmote(같은 코드를 안에 다시 씀, :186-189) | lgEmote + ≡ 메뉴(openEmote) | gkEmote | lgEmote |
| 기본 이모티콘 표시 | pins.emote | liar/ui/emote.js | yt-em(yacht/index.js:95) | **없음** | **없음** | 칩 옆 글자(mini/index.js:167) |
| 소리 켜기/끄기 버튼 | hud 아이콘 | **없음, 사이트 소리 끄기도 무시** | ytSound | 없음(사이트 설정은 따름) | 없음(따름) | 없음(따름) |
| 시작 버튼 | 대기실 lobby.js:332 (2명 미만이면 꺼짐 + 안내) | 상단 줄, 방장·lobby 만, 조건 표시 없음 | 상단 줄, 방장·lobby/result, 조건 표시 없음 | 상단 줄 시작은 숨기고 설정 화면 안 시작(꺼짐 + 안내, settings.pure.js:59) | 상단 줄(방장·lobby/result, 언제나 켜짐) **+** 대기 화면 시작(3명 미만 흐림 + 안내, wait.js:93) **+** 결과 화면 시작 | 상단 줄 시작은 숨기고 대기실 안 시작(`{t:'mn',a:'start'}`, 2명 미만 꺼짐 + 안내) |
| 방장 설정 화면 | 모드 고르기(홀덤/블러핑) lobby.js:326 | liar/ui/settings.js(방식·묶음·주제·시간·목표) | 없음 | draw/ui/settings.js(순서·라운드·시간·글자 수·주제) | 색 고르기만(방장 아님) | 게임 고르기(방장만) |
| 설정 저장 | 서버 방 상태 | 서버(`{t:'lg',a:'settings'}`) | – | 서버(`{t:'dr',a:'settings'}`) | 서버(`gk color`) | 서버(`mn game`) |
| 대기실·참가자 목록 | lobby.js renderRoom(방장·나·연결 끊김 표시) | settings 오른쪽 목록(방장·나·끊김·점수, 내보내기) | 점수표 열 | settings 목록(방장, 내보내기) | wait.js(색·끊김) | 이름을 쉼표로 이은 한 줄 |
| 내보내기(kick) | 없음 | 있음 | 없음 | 있음 | 없음 | 없음 |
| 가로 전용 안내 | 모두 index.html `#rotate` + style.css:10 하나 | 같음 | 같음 | 같음 | 같음 | 같음 |
| 재접속 시 복구 | net.js:13-25 가 다시 로그인 → 서버가 room 을 다시 보냄 → main.js 가 같은 함수로 다시 그림. 화면 쪽 별도 복구 코드 없음(모든 게임 같음). 시계 차이는 라이어(offset), 갱식마인드(clockOffset), 갱스껄(offset)이 각자 계산 | | | | | |

## 발견 사항

### [높음] 갱식마인드·갱스껄에서 이모티콘이 아무에게도 보이지 않는다
- 위치: client/src/main.js:58, 497, 510; client/src/draw/ui/players.js:196-231; client/src/gsk/index.js:200-219; client/src/ui/emotePanel.js:264-265
- 내용: 두 게임 모두 상단 줄에 "이모티콘" 버튼이 있고(서버도 `{k:'emote'}` 를 방 전체에 보낸다, server/draw/room.js:398, server/gsk/room.js:261), main.js 는 그 이벤트를 게임 모듈로 넘긴다(:497 `withDraw(d.event(e))`, :510 `withGsk(g.event(e))`). 그런데 갱식마인드의 players.js 에는 `emote` 경우가 없고, 갱스껄 폴더에는 `emote` 라는 글자가 아예 없다. 사진 이모티콘과 사운드 이름표는 emotePanel 이 `getAnchor` 로 자리를 잡는데, main.js:58 의 anchorOf 가 draw·gsk·mini 에서 null 을 돌려주고 emotePanel.js:265 가 이때 `visibility='hidden'` 으로 숨긴다. 결과: 누르면 창은 닫히지만 화면에 아무것도 뜨지 않는다(사운드 소리만 난다). 갱식마인드 GDD 101줄은 "기본 이모티콘 6개는 된다"고 적혀 있다. 미니는 기본 이모티콘만 보이고 사진·사운드 이름표는 똑같이 숨는다.
- 분류: 버그 / 불일치(한쪽만 구현)
- 제안: 게임 모듈 계약에 `anchorOf(id)` 를 필수로 두고(갱식마인드는 플레이어 칸, 갱스껄은 `table.anchor('tag', id)` 위치), 기본 이모티콘은 요트 방식(yt-em)을 공용 함수로 꺼내 main.js 가 anchorOf 로 띄운다.
- 위험: 갱식마인드는 그리는 사람의 이모티콘·사진을 정해진 때 막는다(GDD 10-6). 막는 것은 서버라 화면에서 띄우기만 하면 되지만, 그 규칙을 함께 확인해야 한다.

### [중간] 라이어는 사이트 소리 끄기를 따르지 않고, 방 안에 끄는 버튼도 없다
- 위치: client/src/liar/audio.js:34, 102; client/src/liar/index.js:65; client/src/audio.js:4, 63
- 내용: 요트·갱식마인드·갱스껄·미니의 소리는 `client/src/audio.js` 의 `isMuted()`(저장 키 `gk.muted`)를 확인한다. 라이어 audio 는 자기 `muted=false` 만 보고, `setMuted` 를 부르는 곳이 저장소 안에 없다. 그래서 포커에서 소리를 꺼도 라이어 효과음은 난다. 라이어 상단 줄에는 소리 버튼도 없다. GDD 11절(docs/liar/GDD.md:390)은 "소리 끄기 버튼(기기에 기억. 갱식 클럽 것과 같은 버튼)"을 요구한다.
- 분류: 규칙 위반 / 불일치
- 제안: 공용 상단 줄에 소리 버튼을 두고, main.js 가 mute 를 바꿀 때 `liar.setMuted?.(v)` 를 부른다. mountLiar 가 audio 를 밖에 내놓지 않으므로 라이어 모듈 수정이 필요하다(복사본 제약 있음: gamemine 과 같이 고쳐야 함).
- 위험: 라이어 폴더는 gamemine 과 같게 유지해야 한다.

### [중간] 갱스껄 이모티콘 버튼을 다시 눌러도 창이 닫히지 않는다
- 위치: client/src/main.js:170, 198
- 내용: 바깥을 누르면 닫는 리스너(:198)는 `lgEmote`·`ytEmote` 만 예외로 둔다. 갱스껄 버튼(`gkEmote`)을 누르면 pointerdown 에서 창이 먼저 닫히고, 이어지는 click 의 `toggleLiarPanel()` 이 다시 연다. 그래서 이 버튼으로는 닫을 수 없다. 요트 버튼만 예외 목록에 들어가 있어서 생긴 차이다.
- 분류: 버그(한 곳만 고쳐져 어긋난 사례)
- 제안: 상단 줄을 하나로 합치면 버튼도 하나라 저절로 없어진다. 당장은 예외 목록에 gkEmote 를 더한다.
- 위험: 낮음.

### [중간] 갱스껄 오류는 토스트가 두 번 뜬다
- 위치: client/src/main.js:600-601; client/src/gsk/index.js:220-223
- 내용: `gk_` 오류가 오면 :600 이 `g.error(msg)` 를 부르고, 이 함수는 `toast(err.msg)` 를 띄운다. 이어서 :601 이 `inGsk()` 이므로 `toast(msg.msg)` 를 한 번 더 띄운다. 두 토스트는 같은 자리에 3초 동안 겹친다(겉으로는 하나처럼 보이지만 배경이 진해지고 DOM 이 두 개 생긴다). 갱식마인드는 :591-597 에서 `break` 로 막아 두었다.
- 분류: 버그 / 불일치
- 제안: 오류를 보여 주는 곳을 main.js 한 곳으로 정하고 모듈 `error()` 는 상태만 고치게 한다(갱식마인드 방식).
- 위험: 낮음.

### [중간] 갱스껄 방장에게 시작 버튼이 두 개 보인다. 시작 조건 표시는 게임마다 다르다
- 위치: client/src/main.js:168, 256; client/src/gsk/ui/wait.js:93-104; client/src/gsk/ui/result.js:167-181
- 내용: 대기(lobby) 때 상단 줄 `gkStart` 와 대기 화면 `[data-gk=start]` 가 함께 보인다. 결과(result) 때는 상단 줄 시작과 결과 화면 시작이 함께 보인다. 상단 줄 시작은 3명 조건과 상관없이 늘 켜져 있고(누르면 서버 오류 토스트), 대기 화면 시작은 흐리게 "3명 이상 필요"를 보여 준다. 다른 게임도 제각각이다. 라이어·요트는 상단 줄 시작만 있고 조건 표시가 없다. 갱식마인드·미니·포커는 꺼진 버튼과 안내 글을 쓴다.
- 분류: 중복 / 불일치
- 제안: 공용 틀에 `startPolicy: 'bar' | 'own'` 을 두고, 'bar' 일 때는 공용 `canStart(room)` + 안내 글을 쓴다. 갱스껄은 하나만 남긴다(사용자 확인 필요).
- 위험: smoke.mjs 가 `[data-gk="start"]`, `[data-yt="bar-start"]`, `.lgbar-btn:has-text("시작")` 을 누른다.

### [중간] 게임 모듈을 한 번도 해제하지 않는다(나간 뒤에도 남는 것)
- 위치: client/src/main.js 전체(`dispose` 호출 0곳); liar/index.js:152-166, 208, 224-236; draw/index.js:214-224, 235-241; gsk/index.js:174-175, 190-195
- 내용: 방을 나가면 각 모듈에 `applyRoom(null)`/`room(null)` 만 보낸다. 라이어는 루트를 숨기기만 하고, 불러온 3D 장면(three.js 메시·텍스처)과 document click 리스너, firstsays 의 document pointerdown/keydown 리스너(liar/ui/firstsays.js:188-189)가 탭을 닫을 때까지 남는다. 갱식마인드는 500ms `setInterval`(tenTimer)과 resize/orientation/visualViewport 리스너 4개가 계속 돈다. 갱스껄은 resize 리스너 2개와 hand.js:75 resize 가 남는다. 요트만 teardown 으로 실제로 정리한다. 게임마다 한 번만 생기므로 계속 늘어나는 누수는 아니다(다시 마운트할 때는 `current` 로 막는다). 라이어 3D 를 붙잡고 있어서 iPad 메모리가 쓰인다(미확인, 실기기 확인 필요).
- 분류: 누수(작음) / 불필요(dispose 는 시험에서만 쓰임)
- 제안: 공통 계약을 `unmount()` 로 정하고, main.js 는 방을 나갈 때 unmount 한 뒤 변수를 null 로 돌린다. 다음 입장 때는 다시 마운트한다(청크는 브라우저 캐시에 남는다).
- 위험: 다시 마운트하면 라이어 3D 장면을 다시 만드는 비용이 든다. 큐 순서(unmount → mount)를 지켜야 한다.

### [중간] main.js 의 게임별 분기 반복: 게임 하나 추가에 약 21곳
- 위치(main.js): 
  1. 모듈 변수·큐·withX·inX :34-56
  2. anchorOf 사슬 :58
  3. 상단 줄 만들기 :153-197(3벌)
  4. 바깥 누름 닫기 예외 :198
  5. xShown 표시 :215-219
  6. applyXRoom 함수 5개 :223-344. "포커 부품 치우기" 4줄이 5번 반복된다(:229, 252, 276, 299, 324)
  7. 퇴장 블록 5개 :346-378
  8. 입장 분기 :380-384
  9. 'room' 처리의 긴 OR 조건 두 줄 :459-460
  10. 'me' 의 lobby.setX + 스위치 해석 5줄 :448-452
  11. 이벤트 분배 블록 5개 :489-549. pemote/snd/sndAdd/sndList/sndDel/sndRename 6줄이 포커까지 6번 같다
  12. 오류 분기 :591-601
  13. stage.onFrame :608
  14. (라이어만) 채팅 onSend :85, lgRank :484
- lobby.js: MODES :23, keysFor :34, xOn 변수 :94, renderRooms 필터 :297, applyKeys 조건 :455, setX 함수 :461-492, 반환 목록 :555-559 → 7곳
- style.css: 상단 줄 CSS 한 벌(:259-284) → 1곳
- 합계: main.js 13곳(+라이어 전용 1), lobby.js 7곳, CSS 1곳.
- 분류: 중복 / 과복잡
- 제안: 아래 "공통화 제안"의 등록표.
- 위험: 큐 공유(stage.use 가 하나뿐인 라이어·요트)와 'room' 처리 순서(animator.flush)를 지켜야 한다.

### [낮음] 상단 줄 CSS 3벌이 거의 같다
- 위치: client/src/style.css:259-267(.lgbar), 272-279(.gkbar), 280-288(.ytbar)
- 내용: .gkbar 는 .lgbar 를 글자 하나 다르지 않게 복사한 것이다. .ytbar 는 left·gap·글자 크기만 다르다. 요트 주석(:269-270) 아래에 .gkbar 블록이 끼어 있어서 주석이 엉뚱한 블록을 설명한다(gsk GDD 306줄에도 적혀 있음).
- 분류: 중복
- 제안: `.rmbar` 한 벌 + 변형 클래스(`.rmbar-yt` left, `.rmbar-mini` right)로 합친다.
- 위험: 시험 선택자(.lgbar-code, .gkbar-btn, .ytbar-btn, data-yt/gk="bar-*")를 함께 바꿔야 한다.

### [낮음] 갱식마인드 상단 줄에 문서에 적힌 소리 버튼이 없다
- 위치: docs/draw/GDD.md:266 "상단 줄은 … (방 코드, 메뉴, 소리, 나가기)"; main.js:162
- 내용: 갱식마인드는 lgBar 를 그대로 써서 소리 버튼이 없다. 사이트 설정은 따르지만 방 안에서는 바꿀 수 없다. 갱스껄·미니도 같다.
- 분류: 불일치
- 제안: 공용 상단 줄에 소리 버튼을 기본으로 넣는다.

### [낮음] 죽은 코드·쓰지 않는 인자
- liar/index.js:214 `lobbyPanel()`: 저장소 전체에서 쓰는 곳이 없다(복사본 제약 있음).
- liar/index.js:49 `getMe`, `emotePanel` / yacht/index.js:24 `chat`, `toast`, `emotePanel`: 받기만 하고 쓰지 않는다(eslint-disable 로 가려 둠). main.js 가 넘기는 것도 함께 정리할 수 있다.
- gsk/index.js:58: main.js:267 이 넘기는 `openEmote` 를 받지 않는다. gsk/index.js:95 `ctx.leave` 를 읽는 gsk 모듈이 없다.
- gsk/index.js:199 `update(s){this.room(s)}` 와 main.js:270, 365 `(g.update ?? g.room).call(g, …)`: 이름 하나로 정하면 된다.
- gsk/ui/wait.js:109-113: `view.hostId(model.js 에 추가되면)` 주석은 이미 낡았다(model.js:166 에 isHost·hostId 가 있다). `ctx.isHost` 는 아무도 넣지 않는다.
- draw/index.js:232 `chatSlot`: main.js 가 쓰지 않는다(주석상 선택이라 의도된 것일 수 있다).
- ui/lobby.js:10, 233 `SHOW_DRAW`: 반복 목록에 'draw' 가 없어서 조건이 늘 거짓이다(로비 과제와 겹침).
- main.js:52-56 미니가 liarQ 를 공유한다. 미니는 stage 를 쓰지 않으므로 공유할 이유가 없다(해는 없음).

### [낮음] 요트 이모티콘 버튼이 toggleLiarPanel 을 다시 쓴다
- 위치: main.js:186-189 대 :155-158
- 내용: 같은 4줄이다. 이름도 "liar" 로 시작하지만 모든 게임이 쓴다(liarPanel, closeLiarPanel, `.lgpanel`).
- 분류: 중복

## 공통화 제안

### 하나로 묶을 것
1. **게임 등록표 + 공통 계약**(main.js 안, 또는 client/src/rooms/registry.js)
   ```
   GAMES = {
     liar:  { load: () => import('./liar/index.js').then(m => m.mountLiar), useStage: true,  chat: 'liar', bar: { start: 'bar' } },
     yacht: { load: …mountYacht, useStage: true,  chat: 'site', bar: { start: 'bar', sound: true, leftVar: '--yt-sheet-w' } },
     draw:  { load: …mountDraw,  useStage: false, chat: 'own',  bar: { start: 'own', hidden: (room) => innerHeight <= 480 && room.phase !== 'lobby' } },
     gsk:   { load: …mountGsk,   useStage: false, chat: 'site', bar: { start: 'own'? } },
     mini:  { load: …mountMini,  useStage: false, chat: 'site', bar: { start: 'own', cls: 'rmbar-mini' } },
   }
   mount(ctx) → { room(state|null), event(e), error?(err), frame?(dt), anchorOf(id), chatMsg?(text), setMuted?(v), unmount() }
   ctx = { ui, stage, send, getMe, chat, toast, leave, openEmote, isMuted }
   ```
   그러면 main.js 의 applyXRoom 5개, 퇴장 블록 5개, OR 조건, onFrame, anchorOf 사슬이 각각 반복문 하나가 된다. 게임 하나를 더할 때 main.js 는 등록표 한 줄만 고치면 된다.
2. **사이트 공통 이벤트 분배**: pemote/snd/sndAdd/sndList/sndDel/sndRename 은 모드와 상관없이 맨 앞에서 한 번 처리한다. chat/chatLog 는 `chat` 값('site'|'own'|'liar')으로 나눈다.
3. **공용 상단 줄**(client/src/ui/roomBar.js, CSS `.rmbar`): 방 코드, 소리, 이모티콘, 시작, 나가기. 옵션은 시작 정책, 숨김 조건, 왼쪽 위치 변수, 추가 클래스. 바깥 누름 닫기와 이모티콘 창 토글도 여기서 한 번만 처리한다.
4. **시작 조건 표시**: `canStart(room) → {enabled, note}` 를 게임마다 내놓게 하고(갱식마인드 startState 모양), 상단 줄 시작 버튼이 그것으로 켜고 끄고 안내를 붙인다.
5. **오류 표시**: 토스트는 main.js 한 곳에서만 띄운다. 모듈 error() 는 상태 처리만 한다.
6. **이모티콘 띄우기**: 요트의 yt-em 방식(anchorOf + 2초)을 공용으로 꺼내 모든 게임에 쓴다.
7. **unmount**: 방을 나가면 해제하고 다시 들어오면 다시 마운트한다.

### 예외로 남길 것(근거)
- 라이어 채팅: 말풍선 규칙, `chatMsgFor`, 붙은 채팅, 잠금(CLAUDE.md 라이어 약속, docs/liar/GDD.md). 라이어 폴더 자체는 복사본 제약이 있어 main.js 쪽 어댑터로만 맞춘다.
- 갱식마인드 자체 채팅, 사이트 채팅 끄기(CLAUDE.md 갱식마인드 약속, docs/draw/GDD.md 10-6 유출 방지).
- 갱식마인드 휴대폰 가로에서 상단 줄 대신 ≡ 메뉴(draw/index.js:3 설계). 단, 사용자 우선순위가 태블릿·PC 라서 정리 대상으로 볼 수도 있다.
- 요트 상단 줄 왼쪽 위치 = 점수표 너비(docs/yacht/GDD.md:58).
- 라이어·요트만 3D stage 사용 → 큐 공유(CLAUDE.md "stage.use 는 하나").
- 포커는 hud.js 원형 아이콘과 lobby.js 대기실을 쓰는 다른 구조라서, 공용 상단 줄에 넣을지는 따로 정한다.

### 사용자에게 물을 것
1. 게임 중 나가기에 확인 창을 모든 게임에 넣을까요? 지금은 어느 게임에도 없습니다(미니 기권만 있음). 요트는 나가면 기권이 됩니다.
2. 시작 버튼은 상단 줄과 대기 화면 중 어디에 둘까요? 갱스껄은 지금 둘 다 있습니다.
3. 소리 끄기 버튼을 모든 게임 상단 줄에 넣을까요? 지금은 포커·요트에만 있고, 라이어는 소리를 끌 방법이 없습니다.
4. 방장의 "내보내기"는 라이어·갱식마인드에만 있습니다. 모든 게임에 넣을까요?
5. 방 코드 표시는 "방 코드 X"와 "방 X"(요트) 중 어느 쪽으로 맞출까요?

## 버린 후보
- 라이어 방에서 chat.button.hidden 을 따로 풀지 않는 것: chat.setMode('lobby'|'liar') 가 버튼을 일부러 숨긴다(붙은 채팅, chat.js:306-309). 문제 아님.
- 갱식마인드에서 다른 게임으로 바로 옮길 때 lgStart 가 숨겨진 채 남는 것: 퇴장 블록이 :371 에서 되살린다. 문제 아님.
- 미니 시작이 `{t:'mn',a:'start'}` 이고 다른 게임은 `{t:'start'}` 인 것: 서버가 둘 다 받는다(server/mini/room.js:137, 153). 동작은 같고, 이름 차이만 있다.
- 가로 전용 안내: 모든 게임이 index.html `#rotate` 하나를 쓴다. 어긋남 없음.
- 재접속: 모든 게임이 같은 길(net.js 다시 로그인 → room 다시 그리기)을 쓰고, 마운트 중복은 큐 안 검사와 `current` 로 막는다. 문제를 찾지 못했다.
- 퇴장 → 입장 순서: 라이어·요트·미니는 같은 큐, 갱식마인드·갱스껄은 각자 큐지만 stage 를 쓰지 않아 순서가 섞여도 해가 없다.
- 요트 faces Map 을 teardown 에서 비우지 않는 것: 다음 'faces' 알림이 덮어쓰고 크기도 작다. 버림.
