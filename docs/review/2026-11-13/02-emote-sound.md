# 02 이모티콘·소리

## 요약 (5줄 이내)
- 이모티콘 패널·사진·방 사운드는 화면 쪽 한 벌(`ui/emotePanel.js` + `media.js`)을 모든 게임이 같이 쓴다. 하지만 **머리 위 표시**는 게임마다 따로(포커 pins / 라이어 lg-em / 요트 yt-em / 미니 칩 글자)이고, **갱식마인드·갱스껄에는 아예 없다**. 사진 이모티콘·사운드 이름표도 갱식마인드·갱스껄·미니에서는 보이지 않는다(자리를 null 로 줌).
- 서버의 사운드·이모티콘 코드(addSound/editSound/playSound/emote)는 **똑같은 복사본이 6벌**(포커·라이어·요트·갱스껄·미니·갱식마인드)이다. 방 사운드가 넘쳐 서버가 몰래 지운 것을 알리지 않는 버그도 6벌 모두에 있다.
- 효과음은 **AudioContext 를 최대 7개** 만든다(사이트·media·요트·미니·라이어·갱식마인드·갱스껄). iPad 첫 터치 잠금 해제 방법이 5가지로 다르고, 포커·요트는 해제 처리가 없다(의심).
- 라이어 효과음은 사이트 음소거를 **따르지 않는다**. 음소거 버튼은 포커·요트에만 있다.
- 공정성 누출: `sndRename` 은 막는 표(MEDIA) 밖이라, 그리는 사람/맞힌 사람/라이어게임 정답 맞히기 중인 시민이 소리 이름을 정답으로 바꿔 모두에게 보낼 수 있다.

## 범위와 커버리지
- 대상 파일 33개 중 읽은 파일 33개(일부는 해당 부분만).
  - 전부 읽음: client/src/audio.js, media.js, ui/emotePanel.js, liar/audio.js, liar/ui/emote.js·css, yacht/audio.js, mini/sfx.js, draw/audio.js, gsk/audio.js, server/liar/perms.js
  - 해당 부분 읽음: client/src/main.js(1~627 전체), ui/pins.js(emote), ui/hud.js(소리·이모티콘 버튼), style.css(.hpanel·.pl .emote), liar/index.js·pure.js, yacht/index.js·ui/board.js, mini/index.js, draw/index.js·pure.js, gsk/index.js·anim/fx.js·ui/hand.js, ui/emotePanel.css(선택자 목록), yacht/yacht.css, mini/mini.css, client/emote-demo.html, server/rooms.js(MEDIA·sendExtras·addSound~playSound·emote·dispatch·tooSoon), server/protocol.js(emote~snd 검사), server/{liar,yacht,gsk,mini,draw}/room.js(사운드·이모티콘 부분), shared/draw/game.js(mediaCheck), docs(draw/gsk/liar GDD·SPEC 이모티콘 부분)
- 효과음을 부르는 쪽(scene/table.js, anim/events.js, anim/win.js, admin/fx.js, yacht/ui/dice3d.js)은 grep 으로 호출 줄만 확인. 시험 파일은 grep 으로 사용처만 확인.
- 실행(서버·시험·빌드)은 하지 않았다. 소리·iPad 동작은 전부 **미확인(실기기 확인 필요)**.

## 지금 구조

### 이모티콘
| 게임 | 패널·버튼 | 기본 이모티콘이 뜨는 곳(코드) | 사진·사운드 이름표 자리 | 서버 처리 |
|---|---|---|---|---|
| 포커 | hud 왼쪽 위 원형 버튼 → `.hpanel` 안 emotePanel (ui/hud.js:48-49) | 자기 핀 위 `.pl .emote` 60px, 3.4s CSS 애니메이션 (ui/pins.js:157-163, style.css:39-41) | `pins.anchor(id)` (main.js:59) | server/rooms.js:200-203, 쿨다운 없음 |
| 라이어 | `.lgbar` "이모티콘" → `.hpanel.lgpanel` (main.js:155-160) | 마네킹 머리 위 `.lg-em-pin` 88px×k, 2s, 매 프레임 따라감 (liar/ui/emote.js) | `liar.anchorOf` (main.js:48) | server/liar/room.js:201-204 + 단계별 막기 server/liar/perms.js:20-29 |
| 요트 | `.ytbar` "이모티콘" (main.js:184-188, 같은 코드를 한 번 더 씀) | 점수표 사진 아래 `.yt-em` 44px, 2s, 생성 때 자리 고정 (yacht/index.js:90-104, yacht.css:7) | `yacht.anchorOf` (main.js:58) | server/yacht/room.js:275-278, 막지 않음 |
| 미니 | `.lgbar` 재사용 | 자리 칩 안 글자 18px, 2s (mini/index.js:167-183, mini.css:112). 자리 없는 관전자는 표시 안 함 | **null → 안 보임** (main.js:59, mini/index.js:190) | server/mini/room.js:216-218 |
| 갱식마인드 | `.lgbar` + 휴대폰 메뉴 ≡ "이모티콘" (draw/index.js:143) | **없음** (event 가 모든 모듈로 가지만 'emote' 처리 코드 없음, draw/pure.js:58-62) | **null → 안 보임** | server/draw/room.js:396-399 + mediaCheck(그리는 사람 전부 막음, 맞힌 사람 사진·사운드 막음) shared/draw/game.js:639-647 |
| 갱스껄 | `.gkbar` "이모티콘" (main.js:170) | **없음** (gsk/index.js:200-218 에 'emote' 처리 없음) | **null → 안 보임** | server/gsk/room.js:259-262 |

- 이모티콘 그림 목록(👍😂😮😡😭🔥)은 4곳에 따로: ui/pins.js:4, liar/ui/emote.js:5, yacht/index.js:12, mini/index.js:7. 범위 0..5 검사는 server/protocol.js:174-175 한 곳(+ liar/ui/emote.js:39).
- 사진·사운드 이름표는 emotePanel 한 곳(`float`/`place`, emotePanel.js:260-284)이 `getAnchor` → main.js `anchorOf` 로 자리를 받는다.

### 서버 사운드·사진 처리
| 항목 | 위치 | 값 |
|---|---|---|
| 허용 형식 | server/protocol.js:155-175 | 사진 JPEG 40KB, 사운드 data:audio 200KB, 이름 1~8자, 이모티콘 0..5 |
| 쿨다운(계정 단위) | server/rooms.js:767-773, 897-917 | pemote 3s, sndAdd 10s, snd 2s, sndDel/Rename 초당 2번, **emote 없음**(전체 20개/초만, rooms.js:35·642) |
| 막기 훅 | server/rooms.js:30, 869-873 | MEDIA = emote, pemote, snd, sndAdd → `room.mediaBlocked` (라이어·갱식마인드만 구현) |
| 방 사운드 저장·편집·재생 | rooms.js:96-123 / liar/room.js:170-199 / yacht/room.js:246-273 / gsk/room.js:230-257 / mini/room.js:187-214 / draw/room.js:401-427 | 6벌 글자까지 같음. 방 24개·계정 8개 |
| 입장 시 목록 | rooms.js:89-94, liar/room.js:124, yacht/room.js:82, gsk/room.js:84, mini/room.js:69, draw/room.js:253 | sndList 6벌 |
| 방송 대상 | 각 room.sendEvents | 방 전원 |

### 효과음·음소거
| 게임 | 효과음 코드 | AudioContext | 첫 터치 잠금 해제 | 음소거 따름 | 음소거 버튼 | 전체 음량 |
|---|---|---|---|---|---|---|
| 사이트(포커·특수 연출·관리자 연출) | client/src/audio.js (합성) | 모듈 전역 1개, 첫 소리 때 생성 | **없음** | 자기 변수 `muted`(=localStorage `gk.muted`) | 포커 hud (ui/hud.js:61-65), 요트 ytbar (main.js:180-183) | 없음 |
| 사진·사운드 이모티콘 | client/src/media.js (파일·data URL 재생) | 모듈 전역 1개 | `unlockAudio()`: pointerdown·touchend·keydown 첫 번 + 무음 버퍼 재생 (media.js:117-124) | `isMuted()` + "다른 사람 사운드 끄기" `gk.ep.others` (emotePanel.js:35,133,309) | 위와 같음 | 0.9 고정 |
| 요트 | yacht/audio.js | 모듈 전역 1개 | **없음**(첫 소리 때 생성, 대부분 서버 알림에서) | `isMuted()` | ytbar | 없음 |
| 미니 | mini/sfx.js | 모듈 전역 1개 | 불러올 때 pointerdown·keydown 첫 번에 생성 | `isMuted()` | **없음** | 없음 |
| 라이어 | liar/audio.js `createAudio()` | mount 마다 1개 | pointerdown `once` (liar/index.js:66-67) | **자기 `muted`, 아무도 setMuted 안 부름 → 사이트 음소거 무시** | **없음** | 0.5 |
| 갱식마인드 | draw/audio.js `createAudio({isMuted})` | mount 마다 1개 | pointerdown, running 될 때까지 매번 재시도 (draw/index.js:82-86) | `siteMuted` | **없음**(GDD 266·320 은 "소리" 버튼을 말함) | 0.5 |
| 갱스껄 | gsk/audio.js `createAudio()` (fx.js:60) | mount 마다 1개 | pointerdown·touchend·keydown 계속 + `userActivation.hasBeenActive` (gsk/audio.js:26-43) | `siteMuted` | **없음** | 0.7 |

- 저장 위치: 음소거 `localStorage gk.muted`(audio.js:4,66), 다른 사람 사운드 끄기 `gk.ep.others`, 최근 사진 `gk.ep.photos`(emotePanel.js:35-37), 내 사운드 IndexedDB `gk-media/sounds`(media.js:139-162). 전부 `state.js saved` 경유, 게임별 저장 키는 없음.
- 볼륨 조절 UI 는 어느 게임에도 없다.
- main.js 는 게임 모듈을 한 번 만들면 dispose 하지 않는다(main.js 에 dispose 호출 없음) → 라이어·갱식마인드·갱스껄의 AudioContext 는 한 번 들어간 뒤 페이지가 살아 있는 동안 계속 남는다.

## 발견 사항

### [높음] 갱식마인드·갱스껄에서 기본 이모티콘이 화면에 전혀 안 뜬다
- 위치: client/src/main.js:497, 510 (emote 를 게임 모듈로 넘김) / client/src/draw/pure.js:58-62, client/src/draw/ui/players.js:197-227 (emote 처리 없음) / client/src/gsk/index.js:200-218 (emote 처리 없음)
- 내용: 서버는 emote 를 방 전원에게 보내지만(server/draw/room.js:396-399, server/gsk/room.js:259-262) 두 화면 모두 `k:'emote'` 를 처리하는 코드가 없다(client/src/draw·gsk 전체 grep 결과 'emote' 처리 0건). 누르면 패널이 닫히고 아무 일도 없다. draw GDD 25줄 "채팅·이모티콘·사운드는 사이트의 것을 그대로", gsk GDD 9줄 "같은 … 이모티콘·사운드를 쓴다"와 어긋난다. 시험(smoke.mjs:237, 448)은 포커·라이어만 본다.
- 분류: 버그
- 제안: 공용 "머리 위 이모티콘" 모듈(아래 공통화) 하나를 만들고 각 게임은 `anchorOf(id)` 만 제공. 당장은 draw·gsk 에 `anchorOf` 를 주고 공용 표시를 쓰면 된다.
- 위험: draw 는 휴대폰 가로에서 사람 목록이 다르게 배치됨(자리 함수가 배치별로 필요). gsk 는 .gk-stage 가 scale 되어 있어 DOM 자리 → 화면 좌표 변환 필요.

### [높음] 갱식마인드·갱스껄·미니에서 사진 이모티콘과 사운드 이름표가 안 보인다
- 위치: client/src/main.js:59 (`inDraw() || inGsk() || inMini() ? null`), client/src/mini/index.js:190 (`anchorOf: () => null`), client/src/ui/emotePanel.js:264-265 (자리 null 이면 `visibility:hidden`)
- 내용: 사진을 보내면 40KB 가 방 전원에게 방송되지만 누구 화면에도 안 보인다. 사운드는 소리만 나고 누가 틀었는지 이름표가 숨는다. 패널의 "사진" 버튼은 그대로 눌린다.
- 분류: 버그
- 제안: 위와 같이 각 게임이 `anchorOf` 를 내놓게 하고 main.js 의 분기를 `currentGame?.anchorOf?.(id) ?? pins.anchor(id)` 한 줄로. 자리를 줄 수 없는 게임은 화면 가운데 위 같은 기본 자리로 띄운다.
- 위험: 갱식마인드 그림판 위를 사진이 가리면 안 됨(자리 위치 결정 필요).

### [높음] `sndRename` 이 막는 표 밖이라 정답을 흘릴 수 있다 (갱식마인드·라이어)
- 위치: server/rooms.js:30 (`MEDIA = emote, pemote, snd, sndAdd`), 869-873, 905-913
- 내용: 갱식마인드는 "사진·사운드 이름으로 정답을 흘릴 수 있어서" 그리는 사람의 사운드를 막고 맞힌 사람의 사운드도 막는다(draw GDD 101·304줄, shared/draw/game.js:642-645). 하지만 `sndRename` 은 MEDIA 에 없어서 `mediaBlocked` 를 거치지 않는다. 경로: 그리는 사람(또는 이미 맞힌 사람)이 사운드 탭 → 편집 → 자기 사운드 "이름" → 정답 입력(8자) → 서버가 `sndRename` 을 방 전원에게 방송 → 못 맞힌 사람 패널에 정답이 이름으로 보인다. 라이어도 같다: 정답 맞히기(guess) 중 사진·사운드는 "답을 흘릴 수 있음"으로 막지만(liar GDD 168-171, perms.js:27) 시민이 사운드 이름을 제시어로 바꾸면 라이어 기기에 간다. test/draw/leaks.test.js·test/liar 는 sndRename 을 안 본다.
- 분류: 규칙 위반(공정성 누출)
- 제안: MEDIA 에 `sndRename` 을 넣는다(rooms.js 한 줄). 라이어 perms / draw mediaCheck 의 kind 가 'sndRename' 이면 'media' 로 취급되는지 확인. 이름 바꾸기만 막고 삭제(sndDel)는 허용.
- 위험: 라이어 perms.js 는 복사본 제약(gamemine). 단 막는 입구는 rooms.js(라이어 폴더 밖)라 rooms.js 만 고치면 된다. kind 문자열이 'sndRename' 인 경우 perms.js:25 의 `kind === 'emote'` 가 아니므로 'media' 와 같이 막힌다(코드상 확인).

### [높음] 서버가 방 사운드를 넘쳐서 지울 때 아무에게도 알리지 않는다 (6벌 모두)
- 위치: server/rooms.js:102-103, server/liar/room.js:178-179, server/yacht/room.js:253-254, server/gsk/room.js:237-238, server/mini/room.js:194-195, server/draw/room.js:406-407
- 내용: `mine.length > 8` 이면 그 사람 가장 오래된 것을, `sounds.length > 24` 면 방에서 가장 오래된 것을 `splice/shift` 로 지우지만 `sndDel` 을 보내지 않는다. 화면(emotePanel.js:286-292)은 지워진 소리를 계속 목록에 보여 준다. 누르면 서버가 "없는 소리입니다." → main.js:592 `emotePanel.handleError` → **올리는 중인 모든 내 소리를 '다시 시도'로 바꾼다**(emotePanel.js:342-345). 쉽게 일어나는 경로: 사운드 8개씩 저장한 4명이 같은 방에 들어오면 `syncMine`(emotePanel.js:337-341)이 자동으로 32개를 올려 앞의 8개가 몰래 지워진다.
- 분류: 버그 / 중복(같은 버그가 6곳)
- 제안: 공용 `server/media.js` 의 `RoomSounds` 클래스(add/edit/play/list) 하나로 묶고, 지울 때 `{k:'sndDel', sid}` 도 함께 보낸다.
- 위험: 라이어 room.js 는 복사본 제약 — 공용 모듈로 바꾸면 gamemine 과 달라진다(총괄 결정 필요).

### [높음] 라이어 효과음은 사이트 음소거를 따르지 않는다 (복사본 제약 있음)
- 위치: client/src/liar/audio.js:34, 66, 102 / client/src/liar/index.js:65 (`createAudio()` 만 부르고 `setMuted` 를 아무도 안 부름 — client 전체 grep 결과 test 에서만 호출)
- 내용: 포커·요트에서 소리를 끈 사람도 라이어 방에서는 효과음이 그대로 난다. 라이어 상단 줄에는 소리 버튼도 없어 끌 방법이 없다(사진·사운드 이모티콘만 media.js 가 `isMuted()` 로 꺼진다 → 같은 방에서 일부만 꺼지는 어긋남). 갱식마인드·갱스껄·미니·요트는 모두 `isMuted()` 를 따른다.
- 분류: 버그 / 불일치
- 제안: 라이어 폴더를 고치지 않고 해결하려면 main.js 또는 liar/index.js 연결부에서 `audio.setMuted(isMuted())` 를 부르는 길이 필요. 공용 audio 모듈로 옮기면 자연히 해결.
- 위험: liar/index.js 는 복사본. 총괄 결정 필요.

### [중간] AudioContext 를 최대 7개 만든다 / iPad 첫 터치 처리 5가지
- 위치: client/src/audio.js:6-10, media.js:111-124, yacht/audio.js:7-11, mini/sfx.js:5-17, liar/audio.js:38-51 + liar/index.js:66-67, draw/audio.js:136-151 + draw/index.js:82-86, gsk/audio.js:15-43
- 내용: 같은 일(합성음 재생, 잠금 해제)을 7번 따로 구현. 한 번 들어간 게임 모듈은 dispose 되지 않으므로 여러 게임을 돌아다니면 컨텍스트가 계속 쌓인다. 잠금 해제는 (1) 없음(사이트 audio.js·요트), (2) 무음 버퍼 + 3종 이벤트(media), (3) pointerdown·keydown 한 번(미니), (4) pointerdown once(라이어), (5) running 될 때까지 재시도(갱식마인드), (6) 3종 이벤트 계속 + userActivation(갱스껄).
  - **의심**: 포커·요트는 첫 소리가 대개 서버 알림(카드 돌리기, ytRoll)에서 나서 컨텍스트가 사용자 동작 밖에서 생긴다. iOS Safari 는 동작 밖 `resume()` 을 거절하므로 포커·요트 효과음이 iPad 에서 안 날 수 있다(media.js:117 주석도 "iOS only starts audio from inside a gesture"라고 적고 자기 컨텍스트만 푼다). 확인: iPad 에서 포커 첫 판 카드 소리가 나는지.
  - **의심**: 한 페이지에서 컨텍스트 여러 개를 동시에 여는 것은 Safari 에서 제한·배터리 문제가 알려져 있다. 실기기 확인 필요.
  - 미니·라이어·갱식마인드는 touchend 를 듣지 않는다(media·갱스껄은 듣는다). iOS 버전에 따라 pointerdown 만으로 안 풀리는 경우가 있다는 것이 media.js 가 touchend 를 넣은 이유로 보인다(의심).
- 분류: 중복 / 불일치 / 성능
- 제안: `client/src/sound/core.js` 하나: 컨텍스트 1개 + master gain(음소거·볼륨) + media.js 방식 잠금 해제 + `tone/noise/notes` 도우미. 각 게임 audio.js 는 "소리 표"만 남기고 `core.play(표)` 를 부른다.
- 위험: 갱스껄 소리는 "꺼짐·아직 안 풀림이면 버린다" 규칙(gsk/audio.js:32)이 있어 공용에도 같은 옵션 필요. liar/audio.js 는 복사본.

### [중간] 서버 사운드·이모티콘 코드 6벌 복사
- 위치: 위 "서버 사운드·사진 처리" 표의 6곳 + 각 파일의 `MAX_ROOM_SOUNDS/MAX_ACCOUNT_SOUNDS` 상수 6쌍(rooms.js:38-39, liar/room.js:22-23, yacht/room.js:10-11, gsk/room.js:13-14, mini/room.js:7-8, draw/room.js:19-20)
- 내용: addSound·editSound·playSound·emote·sndList 전송이 글자까지 같다. 위 "몰래 지우기" 버그처럼 고치려면 6곳을 다 고쳐야 한다.
- 분류: 중복
- 제안: `server/media.js` 에 `createRoomMedia(room)` → `{ addSound, editSound, playSound, emote, extras(session) }`, 각 방은 `Object.assign(this, createRoomMedia(this))` 또는 위임.
- 위험: 라이어 복사본 제약. draw 의 `this.run(...)` 래핑 여부 확인.

### [중간] main.js 이벤트 분기 6벌 복사 (pemote/snd/sndAdd/sndList/sndDel/sndRename)
- 위치: client/src/main.js:491-496, 502-507, 515-520, 528-533, 541-546, 554-559
- 내용: 같은 6줄이 게임 수만큼 반복. 새 게임마다 한 벌씩 늘어난다.
- 분류: 중복
- 제안: `if (emotePanel.handleEvent(e)) break;` 같은 한 줄로(패널이 자기 이벤트 6종을 소비하고 true 반환). 그다음 게임별 분기.
- 위험: 없음(순서만 유지).

### [중간] 갱스껄 상단 "이모티콘" 버튼으로 패널을 닫을 수 없다
- 위치: client/src/main.js:197 (바깥 누름 닫기에서 `lgEmote`·`ytEmote` 만 예외), 170 (`gkEmote` 는 toggle)
- 내용: 패널이 열린 상태에서 gkEmote 를 누르면 pointerdown 에서 먼저 닫히고(gkEmote 는 예외 목록에 없음) 이어서 click 의 toggle 이 다시 연다. 결과적으로 버튼으로 닫히지 않는다.
- 분류: 버그
- 제안: 상단 줄 세 개(lgBar·gkBar·ytBar)의 이모티콘 버튼을 하나의 함수로 만들고 예외 목록도 그 함수가 관리. 요트 ytEmote 는 toggleLiarPanel 과 같은 코드를 한 번 더 썼다(main.js:184-188 vs 155-159).
- 위험: 낮음.

### [중간] 음소거 상태가 버튼끼리 맞지 않는다
- 위치: client/src/ui/hud.js:61-65 (아이콘은 만들 때와 누를 때만 그림), client/src/main.js:180-183, 307
- 내용: 요트에서 소리를 끄고 포커 방으로 가면 hud 아이콘은 여전히 "켜짐" 그림. 라이어·갱식마인드·갱스껄·미니는 버튼이 없어 방 안에서 끌 수 없다(갱식마인드 GDD 266줄은 상단 줄에 "소리"를 적었다).
- 분류: 불일치
- 제안: 공용 사운드 모듈이 `onMuteChange` 를 내고, 모든 상단 줄에 같은 소리 버튼 하나.
- 위험: 휴대폰 가로 상단 줄 폭(무시 가능).

### [낮음] 안 쓰는 코드·스타일
- client/src/media.js:107, 109 `muted` / `setMediaMuted` 와 client/src/ui/emotePanel.js:356 `setMuted` — 아무도 부르지 않음(client·test 전체 grep). playBuffer 의 `muted ||` 는 항상 false.
- client/src/style.css:61-62 `.hpanel .emotes …` — `emotes` 클래스를 쓰는 곳 없음(client·test·html grep). 예전 이모티콘 격자 흔적.
- client/src/gsk/audio.js:110-113 `tick` — 정의만 있고 부르는 곳 없음(fx.js:7 주석은 'tick' 을 말하지만 hand.js 는 'place' 만 부름).
- client/src/liar/index.js:49, client/src/yacht/index.js:24 — `emotePanel` 인자를 받고 안 씀(eslint-disable 로 가림). 라이어는 복사본.
- client/emote-demo.html — 빌드·시험에서 안 쓰는 개발용 데모(docs/SYNC.md:149 만 언급). CLAUDE.md 는 "데모 페이지로는 완료가 아니다"라 했으니 남길지 사용자에게.
- 소리 파일 client/public/sounds/s1~s6.mp3 은 모두 BUILTINS(media.js:156-157)가 씀 — 안 쓰는 자산 없음.

### [낮음] 이모티콘 그림 목록 4벌, 크기·시간 제각각
- 위치: ui/pins.js:4, liar/ui/emote.js:5, yacht/index.js:12, mini/index.js:7
- 내용: 같은 6개 그림을 따로 적었다. 표시 크기 60px/88px×k/44px/18px, 시간 3.4s/2s/2s/2s. 하나를 바꾸면(예: 이모티콘 팩, SPEC 22절 547줄이 예고) 4곳을 고쳐야 한다.
- 분류: 중복
- 제안: `shared/emote.js` 에 `EMOTES` 와 `MAX = EMOTES.length - 1` 을 두고 server/protocol.js:175 의 `<= 5` 도 이것을 쓴다.
- 위험: 라이어 emote.js 는 복사본.

### [낮음] 서버 오류가 모두 이모티콘 패널로도 간다
- 위치: client/src/main.js:592, client/src/ui/emotePanel.js:342-345
- 내용: 채팅 속도 제한, 요트 "지금은 할 수 없습니다" 같은 무관한 오류도 패널 안 문구로 뜨고, 올리는 중인 내 소리를 전부 '다시 시도'로 바꾼다(곧 서버 sndAdd 가 오면 원래대로 돌아오긴 한다). 사운드 2초 쿨다운에 걸려도 같은 일이 생긴다.
- 분류: 과복잡 / 불일치
- 제안: `snd*`·`pemote` 관련 오류만 패널로(오류 코드 `media_*` 를 서버가 붙이면 깔끔).
- 위험: 낮음.

### [낮음] 서버 메모리: 방마다 사운드 최대 약 4.8MB, 입장할 때마다 통째로 전송
- 위치: server/rooms.js:38 (24개) × protocol 200KB, sendExtras(rooms.js:89-94 외 5곳)
- 내용: 방 하나가 최대 24×200KB 를 들고 있고, 재접속·입장마다 그 전부를 한 메시지로 보낸다. 올린 사람이 나가도 방이 사라질 때까지 남는다. 무료 요금제 512MB 에서 방 수십 개면 의미 있는 양(의심 수준, 실제 사용량 확인 필요). 화면 쪽 media.js:140-148 도 data URL(최대 200KB 문자열)을 키로 24개까지 디코딩 버퍼를 들고 있다.
- 분류: 성능
- 제안: 공용 모듈로 묶은 뒤 방 전체 바이트 상한(예: 2MB)을 두는 것을 검토.
- 위험: 사운드 개수 규칙(SPEC 16절) 변경이면 사용자 확인.

### [낮음] 기본 이모티콘은 쿨다운이 없다
- 위치: server/rooms.js:897 (emote 는 tooSoon 없음)
- 내용: 사진 3s·사운드 2s 와 달리 기본 이모티콘은 전체 20개/초 제한만 있다. 서버가 죽을 정도는 아님. 의도인지 불명.
- 분류: 불일치 (다) — 사용자에게: "기본 이모티콘도 1초에 1번 같은 제한을 둘까요?"

## 공통화 제안

하나로 묶을 것
1. **화면 소리 엔진** `client/src/sound/core.js`: AudioContext 1개, master gain(음소거·나중의 볼륨), media.js 방식의 잠금 해제(3종 이벤트 + 무음 버퍼), `tone/noise/notes/playBuffer`. `isMuted/setMuted/onChange` 도 여기(지금 audio.js 의 것 이동, 저장 키 `gk.muted` 유지). 각 게임 audio.js 는 "소리 표 + 이름"만 남긴다.
2. **머리 위 이모티콘** `client/src/ui/emoteFloat.js`(또는 emotePanel 안): `show(id, i)` 를 emotePanel 이 직접 하고 게임은 `anchorOf(id)` 만 제공. 이모티콘·사진·사운드 이름표가 같은 자리 함수를 쓴다. main.js 의 `anchorOf` 분기를 `game?.anchorOf ?? pins.anchor` 로.
3. **main.js 이벤트 분기**: `emotePanel.handleEvent(e)` 한 줄로 6벌 제거. 상단 줄 이모티콘·소리 버튼을 함수 하나로(lg/gk/yt).
4. **서버** `server/media.js`: addSound/editSound/playSound/emote/sndList + 넘침 시 sndDel 방송. MEDIA 에 sndRename 추가. 상수는 한 곳.
5. **이모티콘 목록** `shared/emote.js`: 그림 6개 + 최대 번호(서버 검사 공용).

예외로 남길 것(근거)
- 라이어 단계별 막기(정체 공개·정답 공개 중 전부, 정답 맞히기 중 기본만, 관전자 기본만): liar GDD 4-4절(158-173줄), server/liar/perms.js. `mediaBlocked` 훅 모양으로 유지.
- 라이어 효과음이 역할과 무관한 것: CLAUDE.md "라이어는 정체 공개 전까지 자신이 라이어인지 알 수 없다", liar/pure.js:18 주석. 공용 엔진으로 옮겨도 소리 고르는 함수는 그대로.
- 갱식마인드 그리는 사람 전부 막기·맞힌 사람 사진·사운드 막기: draw GDD 101·304줄, shared/draw/game.js:639-647.
- 갱스껄 "안 풀렸으면 밀린 소리 버림"(gsk/audio.js:32-42): 연출 타이밍 규칙. 공용 엔진의 옵션으로.
- 요트는 아무 때나 이모티콘·사운드 허용: SPEC 347줄.
- 라이어 폴더(liar/audio.js, liar/ui/emote.js, server/liar/room.js 사운드 부분)는 gamemine 복사본 제약 — 공용화 범위에 넣을지 총괄 결정.

사용자에게 물을 것
- 갱식마인드·갱스껄·미니에서 머리 위 이모티콘·사진을 어디에 띄울까요(그림판·탁자 가림 문제)?
- 라이어·갱식마인드·갱스껄·미니 상단 줄에도 소리 켜기/끄기 버튼을 둘까요? 볼륨 조절도 필요할까요?
- 라이어 효과음을 사이트 음소거에 맞추려면 라이어 연결부를 고쳐야 합니다(복사본 제약). 괜찮을까요?
- 기본 이모티콘에도 보내기 간격 제한을 둘까요?
- 이모티콘 크기·머무는 시간을 게임마다 다르게 둘까요, 하나로 맞출까요?
- client/emote-demo.html(개발용 데모)을 지워도 될까요?

## 버린 후보
- emotePanel 의 `ep-layer`·resize 리스너 누수: createEmotePanel 은 main.js:66 에서 한 번만 불림 — 누수 아님.
- 사진·사운드 이름표 DOM 누수: `animationend` 로 지워지고 clearRoom 에서도 지움(emotePanel.js:276, 354) — 문제 없음.
- media.js `active` 카운터가 막힐 가능성: 컨텍스트가 멈춰 있으면 늦게 끝날 뿐, 풀리면 onended 가 와서 줄어든다 — 문제 아님.
- 라이어 효과음이 라이어/시민에 따라 달라 정체를 흘리는가: soundForEvent·resultSound 는 역할을 보지 않음(liar/pure.js:18-37) — 누출 없음.
- 사운드 파일 s1~s6 미사용 여부: 모두 BUILTINS 가 씀.
- 요트 소리 잡음 난수: 고정 씨앗 prng 사용(yacht/audio.js:15), 라이어도 xorshift — 요트·라이어 "Math.random 금지" 지킴. 사이트 audio.js:15 의 Math.random 은 포커 소리용(규칙 대상 아님).
- 갱스껄 잠금 해제 리스너가 성공 뒤에도 남는 것: 매 누름마다 가벼운 함수 한 번, dispose 때 지움 — 누수 아님.
- 서버가 잘못된 emote 값으로 죽는가: protocol.js:175 에서 정수 0..5 만 통과 — 안전.
