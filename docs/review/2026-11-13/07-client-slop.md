# 과제 07: 화면 쪽 군더더기(AI 슬롭) — client/ 전체 JS

## 요약 (5줄 이내)
- 복사해서 붙인 코드가 이미 실제로 어긋난 곳이 3곳 있다. 갱스껄 오류 알림이 두 번 뜬다. 갱스껄 상단 이모티콘 버튼을 다시 눌러도 창이 닫히지 않는다. 요트에서 같은 사람의 사진 대신 쓰는 동그라미 색이 판(6색)과 점수표·결과(4색)에서 다르다.
- main.js 안에 같은 덩어리가 5~6벌씩 있다. "포커 부품 치우기", "게임 모듈 늦게 불러오기", "이모티콘·사운드 알림 나눠 주기", "상단 줄 만들기", "모드 켜기 setX"가 그렇다. 새 게임을 붙일 때마다 6곳을 고쳐야 한다.
- 폴더마다 다시 만든 도우미가 많다. DOM 만들기 함수 35벌, 숫자 모양 맞추기 6벌, mulberry32 난수 4벌, 움직임 줄이기 설정 확인 8벌, AudioContext 7개, 이모티콘 그림 목록 4벌, JPEG 검사식 7벌.
- 안 쓰는 코드와 자산은 적은 편이다. 확인된 것만 적었다. 텍스처 2장(1.4MB, 배포만 됨), 미리 받기만 하는 그림 1장, 죽은 상수·함수·API 십여 개, 준비중 자리표시 파일 4개.
- 라이어 소리는 사이트 소리 끄기를 따르지 않는다. 다만 라이어 폴더는 복사본 제약이 있다.

## 범위와 커버리지
- 대상: `git ls-files client`의 JS·MJS·HTML 129개(데모 html 4개, index.html, vite.config.js 포함)와 비 CSS 자산 94개(public/ 60개, gsk/img 34개).
- 처음부터 끝까지 읽은 파일(43개):
  - 최상위: main.js, net.js, state.js, audio.js, media.js, mock.js(앞부분), vite.config.js, index.html
  - ui: ui/ 전체 13개
  - scene: stage, room, table, art, chips, timing
  - anim: tween, fx, win, events, special/index(앞뒤)
  - admin: fx.js
  - 게임 입구: draw/index, gsk/index, yacht/index, mini/index, liar/index, liar/pure
  - 요트: yacht/ui/board, yacht/ui/sheet(앞부분), dice2d(앞부분), dice3d(앞부분), yacht/scene/quality, yacht/audio
  - 그 밖: mini/sfx, mini/boards/util, mini/boards/index, gsk/art, gsk/actions, gsk/audio(앞뒤), draw/audio, liar/audio, liar/ui/emote, liar/ui/rank(앞부분), coin/index, coin/wallet(앞부분), coin/look(앞부분), coin/lookwin, coin/art/*
- 부분만 읽고 grep으로 확인한 파일(86개):
  - liar: scene, ui, anim의 나머지(복사본 제약)
  - draw: canvas/* 와 ui/*. *.pure.js 는 필요한 함수만 읽었다
  - gsk: ui/*, anim/fx.js, model.js
  - yacht: scene/{tray,die,cup,index}, anim/{player,fx}
  - coin: shop, gacha, pin, capsule, titlefx
  - special: mannequin, props
  - mini/boards: 게임별 5개
- 대신 기계로 전체를 확인했다:
  - (1) 정적·동적 import 그래프를 만들어 어디서도 불리지 않는 파일을 찾았다.
  - (2) export 이름마다 저장소 전체(test/, server/, shared/, html 포함)에서 쓰는 곳을 찾았다.
  - (3) 자산 파일 이름을 전부 찾아보았다.
  - (4) console, catch, typeof window/document, 이징·난수·reduced-motion·AudioContext·localStorage·visualViewport·resize 같은 무늬를 폴더별로 셌다.
- 이 보고서의 지적은 모두 경로:줄과 grep 근거가 있는 것만 적었다. 부분만 읽은 파일 안의 긴 함수 품질은 판단하지 않았다.

## 지금 구조 (게임별 같은 도우미가 어디에 있는가)

| 도우미 | 사이트 공용(있는 것) | 포커 | 라이어 | 요트 | 갱식마인드 | 갱스껄 | 미니 | 코인 | 관리자 |
|---|---|---|---|---|---|---|---|---|---|
| DOM 만들기 | ui/dom.js `h(tag,cls,...kids)` | dom.h | firstsays/rules/vote/rank `el(tag,cls,attrs)`, settings `mk`, hud/role/result/ending/unmask 안쪽 `h/mk(tag,cls,lg)`, index `el` | result/sheet/board `el(tag,cls,text)`, dice2d `el(tag,cls)`, index `el` | tools `h(tag,cls,attrs,html)`, hud `h(tag,cls,attrs,text)`, players/result `h(tag,cls,text)`, settings `mk`, index `el` | result/wait `h`, hand/table `el`, fx `mk`, index `el` | index `el`+`btn` | wallet.js `h`(dom.h 복사)+`btn`, pin/gacha/shop `el` | ui/admin.js `el`+`btn` |
| 사진 없을 때 동그라미 색 | 없음 | 없음(글자만) | 서버가 준 color | board 6색(id 해시), sheet·result 4색(id 해시) | settings FACE_COLORS(자리), players SEAT_COLORS(자리, 값이 조금 다름), result AV_COLORS(id 해시) | 고른 색 | 고정 색 | – | – |
| 첫 글자 | dom.avatar | dom | (서버) | `[...name][0]` 두 벌, `.slice(0,1)` 한 벌 | initialOf, firstChar, initial 세 벌 | – | – | – | – |
| JPEG 검사식 | dom.js:19 | – | – | result:4, sheet:14, board:117, index:11 | players.pure:14 | `IMG`(png/webp 허용, gsk/index:32) | – | – | – |
| 이모티콘 그림 6개 | ui/pins.js:4 | pins | ui/emote.js:5 | index.js:12 | (draw 안) | (gsk 안) | index.js:7 | – | – |
| 숫자 모양(1,234) | dom.fmt(en-US) | dom.fmt | – | – | – | – | – | wallet:3, gacha:12, capsule:8, shop:51 `won` (ko-KR) | admin.js:98-99 안에 그대로 |
| m:ss 시계 | – | – | 각 모듈 Math.ceil | – | hud.pure formatTime, result.pure clockText+secondsLeft | – | – | shop.js:55 | – |
| 서버 시계 차이 | – | – | `s.now-Date.now()`(index:168) | (서버 now만) | pure.clockOffset | `state.now-Date.now()`(index:189) | – | – | – |
| 이징 | anim/tween.js `ease` | tween | 각 장면 파일 | dice2d:22 easeOut, dice3d:14 smooth | – | fx.js 안 | – | gacha:185 안에 그대로 | – |
| 움직임 줄이기 확인 | anim/tween.js:1 `reducedMotion` | tween | camera:17, reveal:70, arrows:9 | fx.js:11, dice3d:133 | – | – | – | gacha:13 | – |
| 고정 씨앗 난수 | (shared/yacht/sim.prng) | chips.js LCG | audio.js xorshift | scene/quality.js `rng` + sim.prng(같은 폴더에 두 벌) | – | anim/fx.pure.js `prng` | – | – | – |
| AudioContext | audio.js, media.js(각각 따로) | audio.js | liar/audio.js | yacht/audio.js | draw/audio.js | gsk/audio.js | mini/sfx.js | – | – |
| 소리 끄기 | audio.js isMuted ('gk.muted') | 따름 | **안 따름**(자기 muted, setMuted 부르는 곳 없음) | 따름 | 따름 | 따름 | 따름 | – | – |
| 키보드 높이(visualViewport) | chat.js:177 `--chat-kb` | – | – | – | index.js:205 keyboardUp + hud.js:185 `--dr-kb-h` | – | – | – | – |
| 휴대폰 기준 높이 | – | – | – | tall() ≥720, quality ≤500 | pure PHONE_MAX_H=480, main.js:224 에 480 다시 적음 | table.pure <500 | – | – | – |
| 입구(mount) API 이름 | – | – | applyRoom/handleEvent/frame/anchorOf/chatMsg/lobbyPanel/dispose | applyRoom/handleEvent/frame/anchorOf/dispose | room/event/error/dispose/el/chatSlot | room/update/event/error/dispose | applyRoom/handleEvent/frame/anchorOf/dispose | – | – |
| 한 개만 남기기(current) | – | – | index.js:38-47 | 없음 | index.js:39-48 | index.js:38-47 | 없음 | – | – |
| 겹쳐 뜨는 창(Esc, 바깥 누름, 초점 되돌리기) | 없음 | wheel.js:35 확인창 | rank, rules, firstsays | – | tools 팝업 | – | `confirm()` | wallet.sheet, pin, gacha, shop 각자 | – |
| 로비 쪽 | lobby.showResetConfirm, showRank (wallet.sheet와 거의 같음), avatarCrop | | | | | | | | |

## 발견 사항

### [높음] 갱스껄 방에서 gk_ 오류 알림이 두 번 뜬다
- 위치: client/src/main.js:600-601, client/src/gsk/index.js:220-223, main.js:267
- 내용: main.js:600은 `gk_` 오류를 `g.error(msg)`로 넘긴다. 그런데 갱식마인드(593-598)처럼 `break`하지 않는다. 그래서 601줄의 `if (inGsk() …) toast(msg.msg)`까지 그대로 내려간다. gsk.error는 `toast?.(err.msg || '오류')`이고, 이 toast는 main의 toast다(267줄에서 넘김). 결국 갱스껄 방 안에서 서버가 gk_ 오류를 보내면 같은 글이 2번 뜬다. 갱식마인드 분기를 복사해 오면서 break가 빠진 사례다.
- 분류: 버그 / 불일치
- 제안: main.js:600에서 `withGsk(...)` 뒤에 `break` 하나를 넣는다. 또는 gsk.error에서 toast를 빼서 main이 한 곳에서만 띄우게 한다.
- 위험: 갱스껄 방 밖(로비)에서 gk_ 오류가 오면 지금은 lobby.setError로 간다. break를 넣으면 그 경로가 없어진다. 로비에서 gk_ 오류가 올 수 있는지 서버 쪽을 확인해야 한다.

### [높음] 갱스껄 상단 줄 '이모티콘' 버튼을 다시 눌러도 창이 닫히지 않는다
- 위치: client/src/main.js:170(gkEmote), 197(바깥 누름으로 닫기)
- 내용: 바깥을 누르면 닫는 처리(197)는 `lgEmote`와 `ytEmote`만 예외로 둔다. `gkEmote`는 예외가 아니다. 창이 열린 채로 gkEmote를 누르면 pointerdown에서 먼저 창이 닫힌다. 이어서 click에서 toggleLiarPanel이 열려 있지 않다고 보고 다시 연다. 그래서 버튼으로는 닫을 수 없다. ytEmote도 184-188에 toggleLiarPanel 내용을 그대로 다시 적었다.
- 분류: 버그 / 중복
- 제안: 상단 줄 이모티콘 버튼을 한 함수(`emoteBtn(cls)`)로 만들고 한 Set에 넣는다. 197줄은 그 Set을 검사한다.
- 위험: 없음에 가깝다. smoke.mjs의 data-gk="bar-emote" 클릭 줄로 확인한다.

### [높음] 요트: 같은 사람의 동그라미 색이 판과 점수표·결과에서 다르다
- 위치: client/src/yacht/ui/board.js:15,24 (6색), client/src/yacht/ui/sheet.js:13,53,157 (4색), client/src/yacht/ui/result.js:3,12,55 (4색)
- 내용: 세 파일이 똑같은 31배 해시를 따로 갖고 있다. board.js만 색이 6개라서 `hash % 6`과 `hash % 4`가 다른 사람은 차례 표시(판 위)와 점수표의 색이 다르다. 예를 들어 해시가 4면 판에서는 `#c9922f`, 점수표에서는 `#3b6fd4`다. 복사한 뒤 한 곳만 바뀐 사례다. 사진이 없는 사람에게만 보인다.
- 분류: 불일치 / 중복
- 제안: `yacht/ui/avatar.js` 하나(색 목록, 해시, JPEG 검사, 첫 글자)로 합친다. 사이트 전체로 넓히면 ui/dom.js `avatar()`에 색 옵션을 더하는 방법도 있다.
- 위험: 지금 보이는 색이 바뀐다(4색과 6색 중 하나를 고른다). 시안이 몇 색인지 사용자에게 묻는다.

### [중간] 갱식마인드: 같은 사람의 동그라미 색이 대기실, 게임, 결과마다 다를 수 있다
- 위치:
  - client/src/draw/ui/settings.pure.js:83-87 `faceColor(seat)` (대기실, 자리 번호)
  - client/src/draw/ui/players.pure.js:11-12 `seatColor(seat)` (게임, 자리 번호. 6번째 값이 `#0f9fb0`과 `#e08a1a`로 다르고, 나머지 hex도 조금씩 다르다)
  - client/src/draw/ui/result.pure.js:38-44 `avatarColor(id)` (결과, id 해시)
- 내용: 색을 정하는 함수가 세 개다. 첫 글자 함수도 initialOf, firstChar, initial 세 벌이다. 대기실에서는 seat가 null일 수 있어 모두 0번 색이 될 수 있고, 결과는 id 해시라 다른 색이 된다.
- 분류: 불일치 / 중복
- 분류(차이): (다) 시안(design/draw)이 화면마다 다른 색을 정했는지 사용자에게 묻는다.
- 제안: players.pure.js의 seatColor와 firstChar 하나로 모은다.
- 위험: 결과 화면에서 자리를 모르면(나간 사람) id 해시가 필요할 수 있다.

### [중간] 라이어 소리가 사이트 '소리 끄기'를 따르지 않는다 (복사본 제약 있음)
- 위치: client/src/liar/audio.js:31-36,65-66,102 (자기 `muted`만 본다), client/src/liar/index.js:65 (`createAudio()`에 아무것도 넘기지 않고 setMuted도 부르지 않음)
- 내용: 요트, 갱식마인드, 갱스껄, 미니, media.js는 모두 `audio.js isMuted()`('gk.muted')를 본다. 라이어만 보지 않는다. 포커나 요트에서 소리를 끈 사람도 라이어에서는 소리를 듣는다. 라이어 방 상단 줄(lgBar)에는 소리 버튼도 없다.
- 분류: 불일치
- 분류(차이): (다) gamemine 원본과 같게 둘지 물어야 한다.
- 제안: liar 폴더는 고치지 않는다. main.js에서 `mountLiar` 다음에 `setMuted`를 연결하는 방법이 있지만, 지금 liar/index.js는 audio를 밖에 내놓지 않는다. 총괄이 정한다.
- 위험: gamemine과 같게 유지한다는 규칙과 부딪친다.

### [중간] main.js: 게임마다 같은 덩어리 5~6벌
- 위치:
  - (a) 포커 부품 치우기: 229-231, 252-254, 276-278, 299-301, 324-326, (387-388)
  - (b) 늦게 불러오기: 238-244, 263-269, 286-292, 311-317, 336-342. withX는 36/41/46/51/56
  - (c) 방을 떠날 때 치우기: 346-379 (5벌)
  - (d) 이모티콘·사운드 알림 6종 나눠 주기: 491-496, 502-507, 515-520, 528-533, 541-546, 554-559 (6벌, 한 벌에 6줄)
  - (e) chat/chatLog 나눠 주기: 508-509, 521-522, 534-535, 560-561
  - (f) 상단 줄 세 벌: lgBar 160-164, gkBar 167-176, ytBar 179-196
  - (g) 모드 켜기: 448-452 URLSearchParams 5줄
  - (h) 461, 462의 긴 `mode === 'liar' || ...` 줄
  - (i) resetDone(466-481)이 backToLogin(424-435)을 거의 그대로 다시 적었다
- 내용: 새 게임을 붙일 때마다 6~8곳을 같이 고쳐야 한다. 위 높음 2건(break 빠짐, gkEmote 예외 빠짐)이 바로 이 구조에서 나왔다. 줄 수로는 약 200줄이 같은 내용이다.
- 분류: 중복 / 과복잡
- 제안: `const GAMES = { liar:{load, q}, yacht:…, draw:…, gsk:…, mini:… }` 표 하나와 `clearPoker()`, `routeMediaEvent(e)`(6종을 처리하면 true), `NON_POKER = new Set(Object.keys(GAMES))`로 줄인다. 입구 API 이름도 하나로 맞춘다(아래 공통화).
- 위험: 라이어 채팅은 `bubble` 옵션과 liar.handleEvent 동시 호출(547-548)이 있다. 갱식마인드는 사이트 채팅을 쓰지 않는다(489). 이 둘은 예외로 남겨야 한다. 대기 줄(liarQ를 liar, yacht, mini가 같이 씀)은 그대로 둔다.

### [중간] 같은 상태를 두 군데서 들고 있다
- 위치:
  - (a) 마지막 아이디: client/src/ui/lobby.js:36,124,188 은 localStorage를 직접 읽고 쓴다(`LAST_ID_KEY='gs.lastId'`). client/src/main.js:94,440 과 net.js:17 은 state.js `saved`를 쓴다.
  - (b) PIN 기기 토큰: main.js:568-571 과 client/src/coin/pin.js:107-109 가 같은 'pin ok' 메시지로 tokens.set을 두 번 한다.
  - (c) 3분 그림 초과 알림 묶기: main.js:221-222,595(2초) 와 client/src/draw/index.js:80,100-105(2초)
  - (d) 사이트 화면 배율 `--k`: ui/dom.js:47(문서 전체) 와 gsk/ui/hand.js:68(자기 root에 같은 이름) 이 겹친다. gsk에는 index.js:112-114의 `--gk-s`도 따로 있다.
- 내용:
  - (a) main.js:94의 주석은 "서버가 받아들인 다음에만 기억한다(초기화 예약 아이디는 받아들여지지 않는다)"이다. 그런데 lobby.js:188은 '입장'을 누르는 순간 저장한다. 그래서 주석과 실제 동작이 다르다. 의심: 초기화 아이디를 입력하고 확인창에서 취소한 뒤 새로고침하면, net.js가 그 아이디로 자동 로그인을 다시 보낼 수 있다. 서버가 resetAsk를 다시 보내는지 확인해야 한다.
  - (b) 지금은 같은 값을 쓴다. 다만 main은 has:false면 지우고 pin.js는 지우지 않는다.
  - (c) 같은 알림을 두 곳에서 따로 묶는다.
- 분류: 과복잡 / 불일치
- 제안: (a) lobby는 `saved`를 쓰고, 저장은 main의 'me' 처리 한 곳만 한다. (b) pin.js의 tokens.set을 지운다(main이 이미 한다). (c) draw의 onFull과 main의 throttle 중 하나만 남긴다.
- 위험: (a) 지금은 입장을 누르면 실패해도 다음에 아이디가 미리 채워진다. 이 편의가 사라진다. (b) pin.js가 main보다 먼저 불리는 순서에 기대는 곳이 없는지 확인한다.

### [중간] 폴더마다 다시 만든 DOM 만들기 도우미 35벌
- 위치: 위 표의 'DOM 만들기' 줄. 대표 몇 곳:
  - client/src/coin/wallet.js:5-10 (ui/dom.js `h`를 거의 그대로 복사해 다시 export)
  - client/src/draw/ui/tools.js:30-36 (attrs+innerHTML)
  - client/src/draw/ui/hud.js:18-24
  - client/src/draw/ui/players.js:14, draw/ui/result.js:13, draw/ui/settings.js:11, draw/index.js:33
  - client/src/gsk/ui/{result:11,wait:9,hand:14,table:19}, gsk/index.js:27, gsk/anim/fx.js:25
  - client/src/yacht/ui/{result:6,sheet:17,board:17,dice2d:25}, yacht/index.js:15
  - client/src/mini/index.js:17-28, client/src/ui/admin.js:13-24
  - client/src/coin/{pin:11,gacha:21,shop:45}
  - liar 11곳
- 내용: 모양이 네 가지뿐이다. `(tag, cls)`, `(tag, cls, text)`, `(tag, cls, attrs)`, `(tag, cls, attrs, html)`. 실제 차이는 "글자를 textContent로 넣는가, 아이를 append하는가, attrs를 받는가"뿐이다. dom.h는 아이를 글자 노드로 넣으므로 textContent를 쓰는 것과 같이 안전하다. draw/tools.js만 innerHTML(고정 SVG)을 받는다.
- 분류: 중복
- 분류(차이): (가) 우연한 차이. 라이어는 복사본 제약 때문에 제외.
- 제안: ui/dom.js에 `h(tag, cls, ...kids)`와 `attrs(e, obj)`를 두고, 버튼용 `btn(cls, label, onClick)`을 하나 더한다. 게임 폴더는 그것을 import한다(CLAUDE.md는 shared를 import하지 않는다고만 했고 ui/dom.js import는 막지 않는다. 다만 yacht와 draw 주석에 "다른 모듈을 가져오지 않는다"는 자기 규칙이 있다).
- 위험: 몇몇 모듈은 node 시험에서 document 없이 import된다(맨 위에서 document를 만지지 않는다는 주석). dom.h도 함수 안에서만 document를 쓰므로 괜찮지만 확인이 필요하다.

### [중간] 상수를 shared에서 가져오지 않고 숫자로 다시 적었다
- 위치:
  - client/src/yacht/scene/die.js:6 `DIE = 1.4`, client/src/yacht/scene/cup.js:11 `CUP = {x:3.4, z:2.4}`, client/src/yacht/ui/dice2d.js:14-15 (CUP 3.4/2.4를 숫자로). 원본: shared/yacht/sim.js:22 (dice3d.js:7과 anim/player.js:4는 거기서 import한다)
  - client/src/gsk/anim/fx.pure.js:5 `SERVER = {FLIP_MS:1700, TEASE_MS:1400, REVEAL_MS:3500}` (원본 shared/gsk/constants.js:11-13. test/gsk/fx.pure.test.js:24는 숫자 그대로 비교하므로 원본이 바뀌어도 시험이 실패하지 않는다)
  - client/src/gsk/model.js:19 `MIN_PLAYERS = 3` (shared/gsk/constants.js:2)
  - client/src/main.js:224 `innerHeight <= 480` (draw/pure.js:7 PHONE_MAX_H)
  - client/src/ui/admin.js:172 MODE_NAMES (lobby.js:23 MODES, shared/*/name.js와 따로. gsk와 mini 이름이 없다)
- 내용: 같은 폴더 안에서도 어떤 파일은 import하고 어떤 파일은 숫자로 적었다. 주석이 "같은 값"이라고 말하는 것 자체가 갈라질 위험이 있다는 표시다.
- 분류: 중복 / 불일치
- 제안: 모두 shared에서 import한다(yacht와 gsk 화면은 이미 shared를 import하는 파일이 있다). 시험은 `SERVER.FLIP_MS === constants.FLIP_MS`로 바꾼다.
- 위험: yacht/ui/board.js:2에 "shared/를 import하지 않는다"는 자기 규칙이 있다(board만 해당). dice2d는 2D 전용 묶음 크기 때문일 수 있다. sim.js 전체가 2D 묶음에 들어가므로, 상수만 constants.js로 옮기는 편이 낫다.

### [중간] 소리 엔진 7벌, AudioContext 최대 7개
- 위치: client/src/audio.js:3-10, client/src/media.js:39-56 (사이트 둘이 따로 갖고 있다), client/src/liar/audio.js:31-51, client/src/yacht/audio.js:5-21, client/src/draw/audio.js:19-37, client/src/gsk/audio.js:11-29, client/src/mini/sfx.js:4-16
- 내용: 모두 `new (AudioContext||webkitAudioContext)`, resume, 첫 누름 잠금 해제, tone(시작Hz→끝Hz, 사라짐), 잡음 버퍼를 따로 만든다. 첫 누름에 귀 기울이는 곳도 media.js:52-56, mini/sfx.js:11-15, gsk/audio.js:26, draw/index.js:83-87, liar/index.js:67 로 다섯 곳이다. 요트와 mini는 모듈을 불러오는 순간에 만든 것을 끝까지 들고 있다. 의심: iPad Safari는 한 페이지에 둘 수 있는 AudioContext 수가 정해져 있다고 알려져 있다. 여러 게임을 오가면 소리가 안 날 수 있다. 미확인(실기기 확인 필요).
- 분류: 중복 / 성능(의심)
- 제안: `client/src/sound.js`에 컨텍스트 하나(`getCtx()`), `unlock` 한 번, `tone({f0,f1,dur,type,gain,at})`, `noise(seed)`, `isMuted`를 두고, 게임 파일은 소리 표(SOUNDS)만 갖는다. 라이어와 갱식마인드의 `[시작초,길이,f0,f1,파형,음량]` 표 형식은 이미 같다.
- 위험: 각 게임의 음량(MASTER 0.5/0.7)과 dispose 때 close하는 동작이 다르다. 공용 컨텍스트는 닫지 않게 바꿔야 한다. 소리 느낌은 미확인(실기기 확인 필요).

### [중간] 키보드 높이와 화면 크기 처리 3벌
- 위치: client/src/ui/chat.js:176-183 (`--chat-kb`), client/src/draw/index.js:202-218 (keyboardUp), client/src/draw/ui/hud.js:184-201 (`--dr-kb-h`, `--dr-vvh`), client/src/draw/pure.js:12-15, draw/ui/hud.pure.js:121-125
- 내용: visualViewport resize/scroll 리스너가 갱식마인드 방 안에서 4개(chat 1, draw index 1, hud 1+1) 돈다. 모두 `innerHeight - vv.height - vv.offsetTop`을 계산한다. hud.js:190,219의 `try { style.setProperty } catch`는 setProperty가 던지지 않으므로 필요 없다.
- 분류: 중복 / 과복잡
- 제안: ui/viewport.js 하나가 `--kb`를 문서에 쓰고 구독 함수를 내놓는다.
- 위험: 휴대폰 키보드 동작은 사용자 우선순위가 낮다. iPad 키보드는 미확인(실기기 확인 필요).

### [중간] 겹쳐 뜨는 창(Esc, 바깥 누름, 초점 되돌리기)이 6벌 이상
- 위치: client/src/ui/lobby.js:363-413 (초기화 확인), 417-451 (라이어 랭킹), client/src/coin/wallet.js:20-50 (sheet), client/src/coin/pin.js:122-128, client/src/coin/gacha.js:350-353, client/src/coin/shop.js:433-440, client/src/ui/avatarCrop.js:97-118, client/src/ui/wheel.js:35
- 내용: lobby.showRank는 coin/wallet.sheet와 거의 같은 구조다(제목, 목록, 닫기 버튼, keydown capture, 바깥 pointerdown, prev.focus). lobby.js:416의 주석은 "rankLines와 같은 규칙을 여기에 둔다: 라이어 묶음을 로비가 받지 않게"이다. 즉 liar/ui/rank.js:8-20의 순위 계산을 일부러 복사한 것이다.
- 분류: 중복
- 분류(차이): 랭킹 계산 복사는 (나) 의도(묶음 분리). 창 틀은 (가).
- 제안: coin/wallet.js의 `sheet()`를 ui/sheet.js로 올려 lobby와 coin이 같이 쓴다. rankLines는 shared/liar/rank.js 같은 작은 순수 파일로 옮기면 두 묶음 모두 가볍게 쓸 수 있다(라이어 쪽은 복사본 제약이 있으니 lobby만 옮긴다).
- 위험: lobby 창 CSS(.lb-sheet)와 coin 창 CSS(.cn-sheet)가 다르다. 틀만 합치고 클래스는 인자로 받는다.

### [중간] 입구(mount) API 이름이 게임마다 달라 main이 맞춰 준다
- 위치: client/src/main.js:270,365 `(g.update ?? g.room).call(g, …)`, client/src/gsk/index.js:186,199 (room과 update 둘 다), draw/index.js:233 `room`/`event`, liar·yacht·mini는 `applyRoom`/`handleEvent`
- 내용: 쓰지 않는 공개 API도 있다.
  - draw/index.js:231-232 `el`, `chatSlot` (주석에 "쓰지 않아도 된다")
  - liar/index.js:214 `lobbyPanel`
  - mini/index.js:190 `anchorOf: () => null` (main.js:59가 mini일 때 null을 직접 준다)
  - yacht/ui/board.js:415,439 `resize`
  - gsk/index.js:199 `update` 별명
  - 모든 게임의 `dispose`는 main에서 부르지 않는다(시험과 current 교체용)
- 분류: 불일치 / 불필요
- 제안: `{ room(state|null), event(e), error?(err), frame?(dt), anchorOf?(id) }` 하나로 맞추고 별명을 지운다. 라이어는 main 쪽 어댑터로 맞춘다(복사본 제약).
- 위험: test/ui/*.mjs와 test/*/ harness가 이 이름을 부를 수 있다. grep으로 확인한 결과 lobbyPanel, chatSlot, anchorOf(mini)는 시험에 없다.

### [중간] 한 개만 남기기(current) 감싸개를 세 번 복사했다
- 위치: client/src/liar/index.js:38-47, client/src/draw/index.js:39-48, client/src/gsk/index.js:38-47
- 내용: 8줄짜리가 글자 그대로 같다. main.js가 이미 `if (gsk) return`으로 두 번 mount하지 않게 막고 있어서 한 겹 더 막는 셈이다.
- 분류: 중복 / 과복잡
- 제안: 그대로 두거나 ui/singleton.js 하나로 합친다. 우선순위는 낮다.
- 위험: harness 시험이 mount를 여러 번 부를 때 기대하는 동작이다.

### [낮음] 안 쓰는 자산
- 위치:
  - client/public/assets/tex/velour_velvet_Diffuse.jpg (735KB), fabric_leather_02_Diffuse.jpg (663KB): scene/room.js:80,86이 `nomap: true`라서 Diffuse를 부르지 않는다(room.js:37). 나머지 텍스처, 모델, hdr, sounds는 모두 쓰인다(모델 텍스처는 gltf가 전부 참조함을 확인).
  - client/src/gsk/img/floor-tile.webp (20KB): `floorTileUrl`(gsk/art.js:74)을 부르는 곳이 없다. 그런데 `ALL_URLS`(76-78)로 `preload()`(gsk/index.js:183)가 매번 내려받는다.
- 분류: 불필요
- 제안: jpg 2장을 지운다. floor-tile은 ALL_URLS에서 빼고 파일과 함수를 지운다.
- 위험: 펠트나 가죽에 무늬를 다시 켜면(`nomap` 해제) 필요하다. design/ 쪽 캔버스가 floor-tile을 쓰는지는 확인하지 않았다(design/은 범위 밖).

### [낮음] 안 쓰는 함수·상수·변수 (저장소 전체 grep으로 확인)
- client/src/scene/art.js:252 `suitGlyph`: 어디서도 쓰지 않는다. 251 SUIT는 ui/dom.js:50 SUITS와 같은 내용이다.
- client/src/anim/tween.js:8 `ease.back`: 쓰는 곳이 없다(special은 자기 easeBack을 쓴다).
- client/src/scene/table.js:359 `slot`, 364 `boardPos`: 쓰는 곳이 없다.
- client/src/ui/hud.js:30,72 `room`: 대입만 하고 읽지 않는다.
- client/src/ui/lobby.js:9-10,233 `SHOW_DRAW`와 `if (a === 'draw' && !SHOW_DRAW)`: 반복 목록이 shop과 rank뿐이라 이 분기에 닿지 않는다. 주석 "뽑기 버튼은 나중에 공개"도 옛 이야기다.
- client/src/ui/lobby.js:206: `syncPw()`를 세 번째로 부른다(194, 201에 이미 있음).
- client/src/ui/lobby.js:547: loginError의 'pin_need' 분기. main.js:579가 pin_need를 askPin으로 직접 보내므로 닿지 않는다.
- client/src/ui/emotePanel.js:356 `setMuted: setMediaMuted`: 부르는 곳이 없다. 그래서 media.js:40-42 `muted`는 늘 false이고, 60의 `muted ||` 검사도 의미가 없다.
- client/src/yacht/ui/board.js:29 `nogl`: 선언만 하고 쓰지 않는다(79는 stage.nogl을 쓴다). 393 `placeHitsAfter()`는 `layout()`만 부르는 한 줄짜리 감싸개다.
- client/src/liar/scene/mannequins.js:17 `TABLE_EDGE`: 쓰는 곳이 없다(복사본 제약).
- client/src/draw/index.js:31, client/src/liar/index.js:30: pure.js 함수를 다시 export하지만 그 경로로 가져가는 곳이 없다(시험은 pure.js를 직접 import한다).
- client/src/pins.js:94,115: 매 프레임 `potLabel.style.display='none'`을 넣었다가 다시 켠다. `${x - 0}`도 남아 있다.
- 분류: 불필요
- 제안: 지운다.
- 위험: 거의 없다. 데모 html이 쓰는지도 확인했다(쓰지 않음).

### [낮음] 준비중 자리표시 파일과 닿지 않는 창
- 위치: client/src/coin/art/{acc,face,hat}.js (`export default {}`), client/src/coin/look.js:4-9,43-47 (그래서 artOf가 늘 null이고 '?'만 그린다), client/src/coin/lookwin.js (준비중 문구), client/src/coin/index.js:17 `look`
- 내용: `open('look')`을 부르는 곳이 없다. lobby의 코인 버튼은 shop, rank, pin뿐이고(lobby.js:231) shop.js는 swap, draw, cap만 연다. 그래서 lookwin.js에는 화면에서 닿을 수 없다. SPEC 22-19는 "준비중 자리"를 의도했다. SPEC 22-17이 말하는 `{t:'looks'}`는 서버도 화면도 아직 다루지 않는다(grep 결과 없음).
- 분류: 불필요
- 분류(차이): (나) 의도된 자리표시(SPEC 22-19). 다만 닿지 않는 창은 (다).
- 제안: 사용자에게 물어서 남길지 정한다.
- 위험: SPEC과 어긋난다.

### [낮음] 일어날 수 없는 경우까지 막는 방어 코드와 삼키기만 하는 try/catch
- 위치:
  - client/src/gsk/ui/hand.js:89,99,121,146 (`try { ctx.anchor && ctx.anchor(...) } catch`): gsk/index.js:83-94가 늘 함수를 준다.
  - client/src/gsk/anim/fx.js:116, client/src/yacht/ui/board.js:113-118 (getFace를 try로 감싸고 객체 `.avatar`까지 받는다. getFace는 문자열 또는 null만 준다)
  - client/src/coin/gacha.js:256 (`try { send(...) } catch`: net.js send는 던지지 않는다), client/src/coin/gacha.js:88
  - client/src/coin/pin.js:108 (`saved`가 이미 삼킨다)
  - client/src/draw/ui/hud.js:190,219, client/src/draw/audio.js:44 (isMuted를 try로 감쌈), gsk/audio.js:36,40
  - client/src/yacht/ui/board.js:29,93,416-419,431-432 (`typeof document/window !== 'undefined'`): board는 3D 판과 DOM을 만드는 모듈이라 node에서 부를 일이 없다.
  - client/src/draw/index.js:144 `(leave || (() => send({t:'leave'})))` (main이 늘 leave를 준다)
- 내용: 오류를 숨겨 문제 찾기를 어렵게 한다. 줄 수도 늘린다. 소리와 연출을 감싸 "게임은 계속된다"고 한 곳(special/index.js:21-22, gsk/index.js:105-107)은 의도가 있으니 그대로 둔다.
- 분류: 과복잡
- 제안: 위 목록만 걷어낸다.
- 위험: node 시험(test/gsk/*.test.js 등)이 ctx를 일부만 넣어 부를 수 있다. 지우기 전에 시험의 ctx 모양을 확인한다.

### [낮음] 작은 도우미 복사본 (각각 따로는 사소하다)
- 숫자 모양: ui/dom.js:41 `fmt`(en-US), coin/wallet.js:3, coin/gacha.js:12, coin/capsule.js:8, coin/shop.js:51 `won`(ko-KR), ui/admin.js:98-99 안에 그대로. 출력은 같다.
- m:ss: draw/ui/hud.pure.js:21-27 `formatTime` 과 draw/ui/result.pure.js:13-24 `secondsLeft`+`clockText` (같은 폴더 안), coin/shop.js:55-58.
- mulberry32: ui/chatSize.js:30-41, gsk/anim/fx.pure.js:121-130, yacht/scene/quality.js:42-51, shared/yacht/sim.js:75 (요트 폴더 안에도 두 벌. yacht/audio.js와 anim/fx.js는 sim.prng를 쓴다).
- 움직임 줄이기 확인: anim/tween.js:1 말고도 7곳(special/index.js:25, yacht/anim/fx.js:11, yacht/ui/dice3d.js:133, coin/gacha.js:13, liar 세 곳).
- 이징: anim/special/index.js:11-14가 tween.js `ease`와 같은 식을 다시 적었다(Fable 구역). yacht/ui/dice2d.js:22, coin/gacha.js:185.
- f3(소수 셋째 자리): yacht/ui/board.js:23, dice2d.js:23, dice3d.js:15. data-* 속성 쓰기도 board.js:297-300과 dice2d.js:103-110이 같다.
- 이모티콘 그림 목록: ui/pins.js:4, yacht/index.js:12, mini/index.js:7, liar/ui/emote.js:5. pins는 이미 `emoteGlyphs`를 export한다.
- `?nogl` 판별: scene/stage.js:17 `.has('nogl')`, yacht/ui/dice2d.js:38과 board.js:29는 정규식 `nogl=1`. `?nogl`만 주면 판별이 갈린다.
- 폰트 링크 늦게 넣기: ui/chat.js:26-33, gsk/index.js:49-56.
- 관리자 연출 미리보기가 승리 화면 DOM을 다시 만든다: admin/fx.js:21-41이 anim/win.js:74-84,111-113(handRow, 승리 줄)과 같은 모양이다. 주석에도 "같은 모양"이라고 적혀 있다.
- gsk/actions.js:2-22: `act`에 이미 a, k, n, p, c가 있는데 7개 함수와 switch로 `{t:'gk', ...}`를 다시 만든다. 쓰는 곳은 requestFor 하나다.
- gsk/model.js:2 주석 "임시 화면(index.js)도, 나중에 만들 진짜 화면도"는 옛 이야기다(진짜 화면이 있다).
- 분류: 중복 / 불필요
- 제안: 대부분 ui/dom.js(또는 ui/util.js)에 `fmt`, `mmss`, `mulberry32`, `reducedMotion`, `EMOTE_GLYPHS`, `isNogl`을 하나씩 둔다. win.js는 `handRow`와 `winLine`을 export해 admin/fx.js가 쓴다.
- 위험: 라이어(복사본)와 special(Fable)은 건드리지 않는다. 요트의 소리 잡음은 같은 씨앗(20261113)을 유지해야 같은 소리가 난다.

### [낮음] 데모 페이지와 mock 경로
- 위치: client/{chat,emote,lobby,special}-demo.html, client/src/mock.js, main.js:610-616
- 내용: vite build 입력에 들어가지 않는다(vite.config.js에 rollupOptions.input 없음). test/에서도 부르지 않는다. 언급은 docs/SYNC.md뿐이다. CLAUDE.md는 "데모나 ?mock=만으로는 완료가 아니다"라고 한다. mock은 포커(holdem/bluff)만 지원하고 다른 게임은 없다.
- 분류: 불필요
- 분류(차이): (다) 사용자에게 남길지 묻는다.
- 제안: 남기려면 그대로 두고, 아니면 4개 html과 mock.js, main.js의 mock 분기를 지운다.
- 위험: 실기기 3D 확인 때 special-demo.html을 쓸 수 있다(SYNC.md:65,136).

## 폴더별 "복잡도에 비해 하는 일이 적은" 파일
- 최상위: main.js(627줄 중 약 200줄이 게임별 복사), mock.js(포커 전용 개발 도구 106줄).
- ui: lobby.js (setLiar, setYacht, setDraw, setGsk, setMini 5벌(461-492), keysFor와 renderRooms 필터와 applyKeys가 모드 이름을 줄줄이 늘어놓는다(34, 297, 455). 모드 Set 하나로 줄어든다.)
- scene: art.js (죽은 export 2개, SUIT 복사).
- anim: special/index.js의 이징 4줄과 reduced 판별(Fable 구역이라 보고만).
- liar(복사본 제약): index.js의 다시 export와 lobbyPanel, audio.js의 setMuted(부르는 곳 없음).
- yacht: ui/board.js (상태 변수 약 25개(55-76), 한 줄 감싸개, 안 쓰는 nogl과 resize, typeof 방어 12곳). scene/quality.js는 rng 복사.
- draw: index.js(쓰지 않는 다시 export와 chatSlot), ui/*.pure.js 세 파일의 색·첫 글자·시계 도우미 복사.
- gsk: actions.js(23줄짜리 감싸개), art.js(ALL_URLS에 쓰지 않는 그림), ui/hand.js(ctx 방어 try 4곳, 자기 --k).
- mini: index.js의 `anchorOf: () => null`, applyRoom(null)이 renderBoard 내부 `boardEl._mn`을 직접 지운다(mini/index.js:159).
- coin: lookwin.js와 art/*.js(자리표시, 닿지 않음), wallet.js(dom.h 복사본을 export).
- admin: fx.js(승리 화면 DOM 복사).

## 공통화 제안
**하나로 묶을 것**
1. `client/src/ui/dom.js` 확장: `h`, `attrs`, `btn`, `fmt`, `mmss`, `EMOTE_GLYPHS`, `JPEG`, `firstChar`, `colorFor(id|seat)`, `isNogl()`, `reducedMotion`, `mulberry32`. 게임 폴더의 사본 35벌 이상을 대신한다(라이어 제외).
2. `client/src/sound.js`: AudioContext 하나, 잠금 해제 한 번, `tone`, `noise`, `isMuted`. 게임은 SOUNDS 표만 갖는다.
3. main.js 게임 표 `GAMES` + `clearPoker()` + `routeMediaEvent()` + 상단 줄 만들기 함수 하나 + 입구 API 이름 통일(`room/event/error/frame/anchorOf`).
4. `client/src/ui/sheet.js`(coin/wallet.sheet를 올림): 로비 확인창, 랭킹, 코인 창이 같이 쓴다.
5. `client/src/ui/viewport.js`: 키보드 높이와 휴대폰 판별 기준 하나.
6. 상수는 shared에서만: yacht DIE/CUP, gsk 시간과 인원, PHONE 높이.

**예외로 남길 것 (근거)**
- 라이어 폴더 전체: gamemine 복사본 유지 규칙(CLAUDE.md "복사해 온 라이어 폴더는 gamemine과 같게 유지").
- lobby.showRank의 순위 계산 복사: 라이어 묶음을 로비가 받지 않게 하려는 것(lobby.js:416 주석). 단, 작은 순수 파일로 옮기는 것은 가능하다.
- anim/special(Fable 구역).
- 갱식마인드가 사이트 채팅을 쓰지 않는 것(main.js:489, SPEC 20절과 draw GDD 10절의 정답 가리기). 라이어 채팅의 bubble·say 처리(main.js:547).
- coin 자리표시(SPEC 22-19).

**사용자에게 물을 것**
1. 요트의 사진 대신 동그라미 색은 4색인가 6색인가? 갱식마인드는 대기실, 게임, 결과에서 같은 색이어야 하는가?
2. 라이어 소리도 사이트 '소리 끄기'를 따라야 하는가(gamemine과 달라져도 되는가)? 라이어, 갱식마인드, 갱스껄, 미니 방에도 소리 버튼이 있어야 하는가?
3. 데모 html 4개와 ?mock=은 계속 쓰는가?
4. 꾸미기 창(lookwin)과 빈 그림 파일은 언제 채우는가? 그때까지 남겨 둘 것인가?
5. 입장을 누르기만 해도(서버가 거절해도) 아이디를 기억하는 지금 동작을 유지할 것인가?

## 버린 후보 (검토했지만 문제 아님으로 판단한 것)
- console.error 줄들: 디버그 잔재가 아니라 모두 실패를 알리는 용도다. console.log는 데모 html에만 있다.
- 주석 처리된 코드: 없다. 찾은 4건은 사용법 설명 주석이다.
- 어디서도 불리지 않는 JS 파일: 없다(admin/fx.test.js는 package.json 시험이 부른다).
- public/sounds 6개, 모델 4개와 그 텍스처, hdr: 모두 쓰인다.
- gsk/img의 나머지 33개: 모두 art.js나 table.js, fx.js가 쓴다(meta.json은 fetch).
- chips.js의 LCG: 판돈별로 같은 더미 모양이 나와야 해서 일부러 고정했다.
- media.js의 IndexedDB 래퍼: emotePanel만 쓰는 정당한 저장소다.
- mini/boards/index.js의 `el._mn`: 한 요소에 판 하나라는 단순한 캐시다(결합은 낮음 항목에 적음).
- yacht의 2D와 3D 두 판: 의도된 구조다(CLAUDE.md `?nogl=1`은 2D로 끝까지).
- `*.pure.js` 분리(draw, gsk): node 시험용 의도된 구조다.
- stage.js adapt와 yacht quality watch가 둘 다 프레임 시간을 잰다: 목적이 다르다(포커 블룸·그림자 대 요트 품질 단계). 겹치지만 문제는 없다.
