# 09 화면 쪽 버그·성능·규칙 위반 (client/src 전체, client/index.html)

## 요약 (5줄 이내)
- 규칙 위반(사용자 글자를 innerHTML 로 넣는 곳, 판정용 Math.random, zoom, `#ui > *`)은 **찾지 못했다**. innerHTML 12곳은 모두 고정 SVG·숫자다.
- 높음 4건: ① 갱식마인드·갱스껄·미니게임 방에서 **사진 이모티콘·사운드 이름표가 아무에게도 안 보인다** ② 블러핑 2판째부터 **앞 판에서 죽은 사람이 계속 죽은 모습(회색)** ③ 배포 뒤 열려 있던 탭은 **새 게임 화면을 못 불러와 빈 화면**(안내 없음) ④ 라이어 3D 장면이 늦게 도착하면 **라이어 방을 나간 뒤 포커·요트 3D 를 덮어쓴다**(라이어 폴더, 복사본 제약).
- 중간: 갱스껄 오류 알림 두 번, 갱스껄 이모티콘 버튼으로 창이 안 닫힘, 블러핑 판마다 3D 그림이 쌓임, 다른 게임 화면 뒤에서도 포커 3D 를 매 프레임 그림, iPad 에서 포커·요트 소리 잠금 해제 안 됨(의심), 화면을 세로로 긴 창으로 쓰면 사이트 전체가 막힘(PC 반쪽 창·iPad 화면 분할) 등.
- 공통화 기회: main.js 의 게임별 "이벤트 나눠 주기"·"상단 줄"·"방 화면 들어가기/나가기" 가 5벌 복사돼 있고, 여기서 생긴 어긋남이 위 높음 ①·중간 2건의 원인이다.

## 범위와 커버리지
- 대상: `git ls-files client/src client/index.html` 중 JS·CSS·HTML 167개(약 1.1MB). 그림 파일 제외.
- **처음부터 끝까지 읽은 파일 (약 40개)**: index.html, main.js, net.js, state.js, audio.js, media.js, style.css(일부 줄 확인), ui/{dom,chat,lobby,emotePanel,hud,bluff,wheel,pins}.js, anim/events.js, scene/{stage,art}.js, scene/table.js(관련 부분), yacht/{index,audio}.js, yacht/ui/board.js, yacht/ui/sheet.js(180~299줄), yacht/ui/dice3d.js(playRoll 부분), mini/index.js, mini/boards/{index,chess}.js, mini/mini.css(앞부분), liar/index.js, draw/index.js, draw/canvas/input.js, draw/canvas/board.js(60~140줄), draw/ui/tools.js(앞부분), gsk/index.js, gsk/art.js(부분), gsk/ui/hand.js(부분), coin/index.js, coin/shop.js(앞·뒤), coin/gacha.js(뒤), coin/wallet.js(부분), coin/capsule.js(앞).
- **grep 으로만 훑은 파일 (나머지 약 125개)**: innerHTML/insertAdjacentHTML/outerHTML, Math.random, zoom, pointer-events 선택자, 100vh/dvh/safe-area, backdrop-filter, touch/mouse 이벤트, 전역 addEventListener·setInterval·requestAnimationFrame 과 짝이 되는 해제, img.src/href, three.js dispose, 동적 import 경계, CSS 클래스 중복(스크립트로 전체 CSS 검사), 접두사 위반(모듈별 CSS 전체 검사).
- 못 읽은 것: liar/ui·liar/anim·liar/scene 의 세부, draw/ui 세부, gsk/ui/table·result·wait·anim/fx 세부, coin/gacha·shop 의 연출 본문. 분량 때문이며, 위 grep 검사에는 모두 포함했다.
- 화면은 띄우지 않았다(GPU 없음, 지침). 3D·소리·iPad 실제 동작은 전부 **미확인(실기기 확인 필요)**.

## 지금 구조 (게임별 화면 연결)
| 기능 | 포커/블러핑 | 라이어 | 요트 | 갱식마인드 | 갱스껄 | 미니 |
|---|---|---|---|---|---|---|
| 불러오기 | main.js 정적 | import() + liarQ | import() + liarQ | import() + drawQ | import() + gskQ | import() + liarQ |
| 상단 줄 | hud.js | lgBar | ytBar | lgBar(시작 숨김) | gkBar | lgBar + `.lgbar-mini` |
| 이모티콘 창 | hud 의 .hpanel | liarPanel(toggleLiarPanel) | ytEmote 가 같은 코드를 **따로 복사** | openEmote → toggleLiarPanel | gkEmote → toggleLiarPanel | lgEmote |
| 말풍선·사진 자리(anchorOf) | pins.anchor | liar.anchorOf | yacht.anchorOf | **null** | **null** | **null** |
| 이벤트 나눠 주기 | main.js 534~545 | 518~531 | 505~516 | 456~467 | 469~481 | 483~494 (거의 같은 12줄이 6벌) |
| 사이트 채팅 | 말풍선/알림 | 고정 칸(liar 모드) | 알림 | 끔(자체 채팅) | 알림 | 알림 |
| 소리 | audio.js(자체 AudioContext) | liar/audio.js | yacht/audio.js | draw/audio.js | gsk/audio.js | mini/sfx.js (+ media.js) → **AudioContext 최대 7개** |

## 발견 사항

### [높음] 갱식마인드·갱스껄·미니게임 방에서 사진 이모티콘과 사운드 이름표가 보이지 않는다
- 위치: client/src/main.js:59 (`anchorOf`), client/src/ui/emotePanel.js:262-271 (`place`), main.js:458·471·485 (pemote 를 emotePanel.showPhoto 로만 보냄)
- 내용: `anchorOf = (id) => (... inDraw() || inGsk() || inMini() ? null : pins.anchor(id))`. emotePanel 의 `place(f)` 는 자리가 null 이면 `f.el.style.visibility = 'hidden'` 으로 끝난다. 세 게임은 pemote·snd 를 자기 모듈에 넘기지 않으므로(main.js 가 emotePanel 에만 줌) **사진 이모티콘은 보낸 사람 포함 누구에게도 안 보이고**, 사운드는 소리만 나고 "누가 틀었는지" 이름표가 안 뜬다. 패널의 "사진" 버튼은 그대로 있어 눌러도 아무 일이 없는 것처럼 보인다. SPEC 16절("모두에게 보인다"), draw GDD 366·455줄("기존과 같음"), gsk GDD 121줄("그대로")과 어긋남.
- 순서: 갱스껄 방 → 이모티콘 → 사진 고르기 → 서버가 방 전체에 `{k:'pemote'}` → 모든 화면에서 visibility hidden.
- 분류: 버그 / 불일치
- 제안: 각 게임 모듈이 `anchorOf(id)`(이름표·사진 자리 화면 좌표)를 내놓게 하고 main.js 에서 연결하거나, 자리가 없을 때 emotePanel 이 화면 위 가운데에 띄우는 기본 자리를 둔다.
- 위험: 갱식마인드는 그리는 사람·맞힌 사람의 사진·사운드를 서버가 막는 때가 있다(GDD 101·304줄) — 서버가 이미 거절하므로 화면만 고치면 된다.

### [높음] 블러핑: 앞 판에서 죽은 사람이 다음 판에서도 죽은(회색) 모습으로 남는다
- 위치: client/src/ui/pins.js:58-64 (`dead.has(p.id)` 로 dim·dead), client/src/anim/events.js:35 (`clearDead` 는 홀덤 `deal` 에서만), 76 (`bluffDeal` 은 clearActs 만), shared/bluff.js:32
- 내용: `dead` 집합은 `shot`/`bust` 때 추가되고 **홀덤의 `deal` 이벤트에서만** 지워진다. 블러핑은 `deal` 이 없고 `bluffDeal` 만 온다. 같은 방에서 블러핑 2판째를 시작하면 1판에서 죽은 사람이 살아 있어도 사진이 회색·"dead" 로 그려진다. 방을 나가도 지워지지 않아(applyRoom(null) 은 pins.render 만 부름) 같은 아이디가 새 블러핑 방에 오면 처음부터 죽어 보인다. 새로고침해야 풀린다.
- 순서: 블러핑 1판, A 가 총에 맞아 탈락 → 승자 결정 → 방장이 다시 시작 → A 의 핀이 회색.
- 분류: 버그
- 제안: 새 판 시작(`bluffDeal` 의 round 1, 또는 room.phase 가 lobby→playing 으로 바뀔 때)과 방 나갈 때(main.js applyRoom(null)) `pins.clearDead()` 를 부른다. 판 중 죽음 표시는 서버의 `p.alive === false` 로도 이미 그려진다.
- 위험: 같은 판의 라운드 사이(`bluffDeal` round>1)에서 지우면 탈락자가 살아나 보인다 — round 1 일 때만 지울 것.

### [높음] 배포 뒤 열려 있던 탭은 새 게임 화면을 못 불러와 빈 화면이 된다(안내 없음)
- 위치: client/src/main.js:237-241, 260-264, 283-287, 307-311, 331-335 (게임 import 실패를 console.error 로만), 132-142 (코인 import), client/src/net.js:27-32 (끊기면 계속 다시 접속), server/index.js:60 (JS 는 max-age=3600, 이전 빌드 파일은 배포 때 사라짐)
- 내용: 배포하면 서버가 재시작되고 net.js 는 같은 탭에서 자동으로 다시 붙는다. 그 탭의 main.js 는 **이전 빌드의 조각 이름**(`liar-xxxx.js` 등)을 들고 있는데 새 dist 에는 없어 404 → `import()` 실패 → `.catch(console.error)` 뿐이다. 그 탭에서 아직 안 연 게임(요트·라이어·갱식마인드·갱스껄·미니·코인 창)에 들어가면 포커 화면은 이미 치워졌고(table.reset 등) 상단 줄만 남은 빈 화면이 된다. 방에 들어갈 때마다 다시 시도하지만 계속 실패하고 사용자에게는 아무 말이 없다.
- 순서: 탭 열어 둠 → main 배포 → 자동 재접속 → 로비에서 요트 방 만들기 → 빈 화면.
- 분류: 버그
- 제안: 동적 import 실패를 한 곳(공용 `loadChunk(name, fn)`)에서 잡아 "새 버전이 있어요. 눌러서 새로고침" 알림(main.js 의 4001 알림과 같은 `.toast.hit`)을 띄운다. 또는 `me` 메시지에 서버 빌드 번호를 넣고 `__BUILD__` 와 다르면 새로고침 안내.
- 위험: 게임 중 자동 새로고침은 하지 말 것(진행 중 방이 끊긴다). 눌러서 새로고침만.

### [높음] 라이어 3D 장면이 늦게 오면 라이어 방을 나간 뒤에도 그 장면이 포커·요트 3D 를 덮는다 (복사본 제약 있음)
- 위치: client/src/liar/index.js:128-141 (`loadScene`: `disposed` 만 보고 `stage.use(scene.scene, scene.camera)`), 152-163 (`applyRoom(null)` 이 `stage.use(null)`), client/src/scene/stage.js:111-127 (ext 가 있으면 포커 장면을 그리지 않음)
- 내용: main.js 는 라이어 모듈을 한 번 만들면 dispose 하지 않고 `applyRoom(null)` 로 숨기기만 한다. `loadScene` 의 `import('./scene/index.js')` 가 끝나기 전에 방을 나가면 `applyRoom(null)`(stage.use(null))이 먼저 실행되고, 그 뒤 import 가 끝나 `stage.use(라이어 장면)` 이 실행된다. 이후 포커 방에서는 포커 테이블 대신 라이어 방이 그려지고(핀은 포커 자리에 떠 있음), 요트 3D 판이 이미 걸려 있었다면 요트 판도 라이어 장면으로 바뀐다. 다음에 라이어 방을 드나들기 전까지 풀리지 않는다.
- 순서: 처음 라이어 방 입장(장면 조각 내려받는 중, iPad·느린 망에서 수 초) → 바로 나가기 → 포커 방 → 포커 테이블이 안 보임.
- 분류: 버그
- 제안: loadScene 이 끝났을 때 `state` 가 null 이면 stage.use 를 하지 않는다(라이어 폴더 수정 → 총괄 판단). 라이어를 못 고치면 main.js 쪽에서 `stage.use` 를 "지금 방 모드의 주인만 걸 수 있게"(stage.use(owner, scene, cam) 처럼 주인 이름을 받는) 문지기로 감싼다.
- 위험: 라이어 폴더는 gamemine 과 같게 유지해야 한다 — 고치려면 원본에도 같은 수정이 필요.

### [중간] 갱스껄 오류 알림이 두 번 뜬다
- 위치: client/src/main.js:600-601, client/src/gsk/index.js:221-224
- 내용: `gk_` 오류면 `withGsk((g) => g.error?.(msg))` → gsk 의 `error()` 가 `toast?.(err.msg)`. 그 줄에 `break` 가 없어 바로 다음 줄 `if (... inGsk() ...) toast(msg.msg)` 가 또 띄운다. 같은 글자 알림 2장. (그 앞 590줄 `emotePanel.handleError` 도 이 오류를 받는다 — 아래 낮음 참고)
- 분류: 버그
- 제안: 600줄 뒤에 `break`. 공용 오류 처리 표(게임 접두사 → 처리기, 기본 알림 1회)로 묶으면 다시 생기지 않는다.
- 위험: 없음.

### [중간] 갱스껄 상단 "이모티콘" 버튼으로 이모티콘 창이 닫히지 않는다
- 위치: client/src/main.js:197 (바깥 누름 닫기에서 `lgEmote`·`ytEmote` 만 예외), 177 (`gkEmote` → toggleLiarPanel)
- 내용: 창이 열린 채 gkEmote 를 누르면 pointerdown 단계에서 "바깥 누름"으로 먼저 닫히고, 이어지는 click 의 toggle 이 다시 연다. 버튼을 눌러 닫을 수 없다(바깥을 눌러야 닫힘). 요트는 ytEmote 를 따로 예외 처리해 두었는데 갱스껄을 붙이면서 빠졌다 — 복사한 코드가 한 곳만 고쳐진 사례.
- 분류: 버그 / 중복
- 제안: 상단 줄 세 개(lgBar·gkBar·ytBar)를 만드는 공용 함수 하나로 묶고, 이모티콘 버튼은 `data-emote-toggle` 같은 표시로 예외 처리. ytEmote 의 onclick(184-188줄)도 toggleLiarPanel 복사본이다.
- 위험: smoke.mjs 의 data-gk / data-yt 선택자는 그대로 유지해야 한다.

### [중간] 블러핑 판(라운드)마다 3D 표지판 그림이 새로 만들어지고 지워지지 않는다
- 위치: client/src/scene/table.js:257-259 (`plaque.material = plaqueMaterials(room.tableRank)`), client/src/scene/art.js:101-114 (부를 때마다 CanvasTexture 300×240 + 재질 2개 새로 만듦), 같은 식으로 table.js:249 / art.js:93-100 (`dealerButton()` 이 판마다 새 원기둥·재질 3개·텍스처)
- 내용: 이번 카드가 바뀔 때마다 새 텍스처를 만들고 이전 것은 dispose 하지 않는다. 카드 종류는 몇 개뿐인데 캐시가 없다. 블러핑을 오래 하면 GPU 메모리가 조금씩 쌓인다(라운드당 약 0.3~0.4MB). iPad Safari 는 GPU 메모리가 차면 탭을 새로고침해 버린다(미확인).
- 분류: 성능(누수)
- 제안: `plaqueMaterials` 를 rank 별로 캐시(chipMaterials 처럼), dealerButton 도 한 번만 만들고 재사용.
- 위험: 없음.

### [중간] 다른 게임 화면·로비 뒤에서도 포커 3D 를 매 프레임 그린다 (성능)
- 위치: client/src/scene/stage.js:120-134 (항상 requestAnimationFrame 으로 그림), main.js:225-232·250-254 (갱식마인드·갱스껄은 table.reset 후에도 렌더 계속), client/src/draw/draw.css:33, client/src/gsk/gsk.css:6 (불투명 배경), client/src/ui/lobby.css:11 (로비 판 blur(40px))
- 내용: 갱식마인드·갱스껄 방은 불투명 배경으로 3D 를 완전히 가리는데도 포커 방(그림자 포함, PC 는 bloom)을 60fps 로 계속 그린다. 로비에서는 반투명 판 2장이 `backdrop-filter: blur(40px) saturate(180%)` 이라, 뒤 3D 가 매 프레임 바뀌는 만큼 블러를 매 프레임 다시 계산한다. iPad 에서 배터리·발열과 갱식마인드 그리기 반응에 영향(미확인, 실기기 확인 필요).
- 분류: 성능
- 제안: stage 에 `setPaused(bool)` 을 두고 갱식마인드·갱스껄·(미니)일 때 멈춤. 로비는 움직임이 없을 때 그리기 횟수를 낮추거나(예: 10fps) 장면이 바뀔 때만 그린다.
- 위험: 특수 연출·핀 위치 계산(onFrame)은 렌더와 따로 계속 돌아야 한다(subs 는 그대로, render 호출만 생략).

### [중간·의심] iPad 에서 포커·블러핑·요트 소리가 안 날 수 있다 (실기기 확인 필요)
- 위치: client/src/audio.js:6-10, client/src/yacht/audio.js:7-11 (첫 소리를 낼 때 AudioContext 를 만들고 `resume()`), 부르는 곳은 전부 서버 이벤트 쪽(anim/events.js, scene/table.js, main.js:410, yacht/ui/board.js 의 handleEvent·frame)
- 내용: 사이트 소리(audio.js)와 요트 소리는 **사용자 누름 안에서 한 번도 만들어지거나 풀리지 않는다**. media.js(이모티콘 소리)·라이어·갱식마인드·갱스껄·미니는 각자 pointerdown 에서 푸는 코드가 있다. Safari 는 누름 밖에서 만든 AudioContext 를 멈춤 상태로 두는 정책이 있어, iPad 에서 포커 효과음·요트 효과음이 계속 안 날 가능성이 있다. 또 게임을 돌아다니면 AudioContext 가 최대 7개(사이트·media·라이어·요트·갱식마인드·갱스껄·미니) 생긴다. `ctx.resume()` 의 Promise 거절도 잡지 않는다(audio.js:8, yacht/audio.js:9).
- 분류: 호환(의심)
- 제안: AudioContext 하나를 media.js 에 두고 `unlockAudio()` 가 그것을 풀게 한 뒤 모든 게임 소리가 그 하나를 받아 쓰게 한다(`getAudioContext()` 공용 함수).
- 위험: 라이어 audio.js 는 복사본 제약. 확인 방법: iPad 에서 첫 화면 터치 후 포커 한 판 → 카드 소리 나는지.

### [중간] 세로로 긴 창이면 사이트 전체가 "가로로 돌려주세요"로 막힌다 (PC 반쪽 창·iPad 화면 분할)
- 위치: client/src/style.css:11 (`@media (orientation: portrait) { #rotate { display: flex; } }`), client/index.html:14
- 내용: orientation 은 창의 가로·세로 비율로 정해진다. PC 에서 1920×1080 화면에 창을 반으로 붙이면(960×1080) 세로가 되어 로그인 화면부터 모든 게임이 덮인다. iPad 가로 상태에서 Split View 50:50 으로 쓰면 각 창이 세로라 같은 일이 생긴다. 요트는 "가로 전용"이 약속(CLAUDE.md)이지만, 포커·로비·갱식마인드까지 막는 것은 의도인지 알 수 없다.
- 분류: (다) 불명 → 사용자 질문: "PC 반쪽 창·iPad 화면 분할에서도 막을까요, 아니면 요트처럼 꼭 가로가 필요한 화면에서만 안내할까요?"
- 제안: `(orientation: portrait) and (pointer: coarse)` 로 터치 기기에만 적용하거나, 비율 기준을 낮춘다(`max-aspect-ratio: 3/4`).
- 위험: 휴대폰 세로 안내는 그대로 남게 할 것.

### [중간·의심] 연출이 중간에 끊겨도(flush) 뒤처리가 늦게 실행되어 새 판 화면을 지울 수 있다
- 위치: client/src/anim/events.js:84-92 (`reveal` 이 2.2초 뒤 `table.clearPile()`), 128-131 (`Promise.race` 로 abort 해도 handle 은 계속 돈다), 141-156 (flush)
- 내용: flush(탭 복귀·밀린 연출 정리·방 입장)는 기다림만 끝내고 진행 중인 `handle(e)` 를 멈추지 않는다. `reveal` 도중 flush 되면 2.2초 뒤 `table.clearPile()` 이 다음 라운드에 이미 놓인 카드 더미를 지울 수 있다. `shot`·`bust` 도 늦게 `pins.setDead` 를 부른다.
- 확인 필요: 탭을 숨겼다 블러핑 LIAR 직후 돌아와 다음 라운드 카드가 사라지는지.
- 분류: 버그(의심)
- 제안: 이벤트마다 번호를 두고 flush 때 번호를 올려, 끝난 뒤의 뒤처리는 번호가 같을 때만 실행.

### [중간] 상점을 빠르게 두 번 열면 앞 창의 1초 타이머·리스너가 남는다
- 위치: client/src/coin/shop.js:75-77 (`old.remove()` 만 하고 앞 창의 `end()` 를 부르지 않음), 430-445; client/src/coin/index.js:110-119 (`open` 은 import 를 기다려 두 번 부를 수 있음); client/src/coin/gacha.js:28 (중복 방지 없음 → 창 두 장)
- 내용: 첫 상점 열기는 import 를 기다리므로 그 사이 두 번 누르면 openShop 이 두 번 실행된다. 첫 창은 DOM 만 지워지고 `setInterval(tick, 1000)`, keydown·resize·`ctx.on` 리스너가 계속 남아 떨어진 DOM 을 다시 그린다. 뽑기 창은 두 장이 겹친다.
- 분류: 누수 / 두 번 눌림
- 제안: 코인 창 열기에 "열리는 중/열린 창" 표시를 두고 같은 종류면 앞 창의 close 를 부른 뒤 연다(coin/index.js open 한 곳).

### [낮음] 서버 오류 아무거나 오면 올리는 중인 사운드가 "다시 시도"로 바뀐다
- 위치: client/src/main.js:590, client/src/ui/emotePanel.js:345-348
- 내용: 앞에서 걸러지지 않은 모든 오류(요트 "차례 아님", 라이어·미니 오류 등)가 `emotePanel.handleError` 로 가서 pending 업로드를 전부 실패로 바꾸고 이모티콘 창 안내 줄에 그 오류 글을 남긴다. 서버가 나중에 sndAdd 를 보내면 되돌아오긴 한다.
- 분류: 버그(작음)
- 제안: 사운드 관련 오류 코드만 handleError 로 보낸다.

### [낮음] 두 번 눌림: 방 만들기·방 들어가기·블러핑 PLAY
- 위치: client/src/ui/lobby.js:268 (createBtn), 284 (방 줄), client/src/ui/bluff.js:39 (play 누른 뒤 refresh 안 함 → 버튼이 그대로 켜짐)
- 내용: 느린 망에서 두 번 누르면 두 번째 요청이 "이미 방에 있습니다." 알림을 띄우거나, 블러핑은 빈 카드 `{cards: []}` 를 보내 오류 알림이 뜬다. 판에는 영향 없음.
- 제안: 보낸 뒤 서버 답(room) 올 때까지 버튼을 잠근다 / bluff 는 onclick 끝에 `refresh()`.

### [낮음] 방을 나가도 pins 의 연출용 기록(acts·stacks·lifts·dead)이 남는다
- 위치: client/src/ui/pins.js:14-19, main.js:356-361
- 내용: 위 "블러핑 죽음" 과 같은 원인. acts 는 `deal`/`bluffDeal` 에서 지워져 실제로 보이는 문제는 dead 뿐.
- 제안: pins 에 `reset()` 을 두고 applyRoom(null)·방 코드가 바뀔 때 부른다.

### [낮음] 매 프레임 레이아웃 읽기
- 위치: client/src/yacht/ui/sheet.js:286-292 (`anchor` 가 getBoundingClientRect), main.js:608 (onFrame 에서 chat.update·emotePanel.update 가 anchor 를 부름), yacht/ui/board.js:404 (`placeHits` 가 매 프레임 style·속성 8개씩 씀)
- 내용: 말풍선·이름표가 떠 있는 동안 요트에서 매 프레임 "쓰기 → 읽기"가 섞여 강제 레이아웃이 한 번씩 생긴다. 체감은 작을 것.
- 제안: 점수표 머리 위치는 resize·update 때만 재서 저장.

### [낮음] 갱스껄 CSS 에 접두사 없는 보조 클래스
- 위치: client/src/gsk/ui/hand.css:9-10,16-18,22 (`.coins` `.two` `.ink` `.pass` `.abs`)
- 내용: `.gk-hd-acts.coins` 처럼 접두사 클래스와 붙어 있어 충돌은 없지만 "CSS 는 전부 .gk-" 규칙과 다르다. (라이어 CSS 의 `.btn .seg .tag .verdict .late .md .jv` 도 같음 — 복사본 제약 있음)
- 분류: 규칙 위반(가벼움)

### [낮음] 같은 클래스를 두 파일에서 정의
- 위치: style.css:54 `.chat-btn::after` ↔ ui/chat.css:11; style.css:289-292 가 라이어 클래스(`.lg-action` `.lg-hud-endbox` `.lg-lobbybox` `.lg-rs-panel`)를 다시 정의(라이어 원본을 안 고치려는 의도로 보임); style.css `.lobby` ↔ chat.css:115
- 분류: 규칙 위반(가벼움). 라이어 덮어쓰기는 (나) 복사본 제약 때문의 의도로 보이나 주석으로 근거를 남기면 좋다.

### [낮음] 포커만 하는 사람도 받는 코드
- 위치: client/src/ui/lobby.js:6 (`shared/mini/index.js` → 체스·체커 등 규칙 전부, 약 16KB), :7 (`shared/coin/shop.js` → 아이템 목록 전부, 약 25KB)
- 내용: 이름(NAMES)·칭호 글자 몇 개 때문에 규칙·목록 전체가 첫 화면 묶음에 들어간다. 크지는 않다.
- 제안: `shared/mini/names.js` 처럼 이름만 따로 둔다.

### [낮음] 첫 화면이 글꼴 4개를 기다린다
- 위치: client/src/main.js:28-29 (top-level await `document.fonts.load`)
- 내용: Google Fonts 가 느리면(학교·회사 망) 3D·로비가 그만큼 늦게 뜬다. 실패는 catch 하지만 "느림"은 기다린다.
- 제안: `Promise.race([..., sleep(1500)])`.

## 공통화 제안
- **하나로 묶을 것**
  1. main.js 의 "사이트 공통 이벤트 나눠 주기"(pemote·snd·sndAdd·sndList·sndDel·sndRename·chat·chatLog) — 6벌(456~545줄). `routeCommon(e, {chat: true|false})` 하나로. 높음 ①의 원인(게임마다 anchor 연결 누락)도 여기서 같이 막는다.
  2. 상단 줄(lgBar·gkBar·ytBar)과 이모티콘 창 열고 닫기 — `createRoomBar({prefix, buttons})` 하나로. 중간 "갱스껄 이모티콘 버튼" 원인.
  3. 게임 화면 들어가기/나가기(applyXxxRoom 5벌, 포커 부품 치우기 5줄 복사) — `enterGame(mode)`/`leaveGame(mode)` 표로.
  4. 동적 import + 줄 세우기(liarQ·drawQ·gskQ) + 실패 처리 — `loadChunk` 한 곳에서 "새로고침 안내"까지(높음 ③).
  5. AudioContext — 하나를 만들어 모든 게임이 같이 쓰기(iPad 잠금 해제 한 번, 컨텍스트 개수 제한 회피).
  6. 오류 처리(main.js 571~603) — 코드 접두사 → 처리기 표, 알림은 한 번.
- **예외로 남길 것(근거)**
  - 라이어 채팅 고정 칸·잠금(liar GDD 4-4, CLAUDE.md 라이어 약속): chat.js 의 'liar' 모드 유지.
  - 갱식마인드 자체 채팅(정답 가리기, CLAUDE.md 갱식마인드 약속·draw GDD 10절): 사이트 채팅 끔 유지.
  - 요트 상단 줄의 소리 버튼·점수표 오른쪽 배치(--yt-sheet-w).
- **사용자에게 물을 것**
  - 세로로 긴 창(PC 반쪽 창, iPad 화면 분할)에서도 사이트 전체를 막을까요?
  - 갱식마인드·갱스껄·미니에서 사진 이모티콘을 어디에 띄울까요(그 사람 자리 위 / 화면 위 가운데)?

## 버린 후보 (문제 아님으로 판단)
- innerHTML 12곳(dom.js svg, wheel.js 3곳, draw tools.js, coin/look.js, gsk hand·table, mini boards, yacht board): 모두 고정 SVG·숫자·서버가 만든 판 값. 사용자 글자 없음.
- Math.random: audio.js 잡음, emotePanel 사운드 id, stage 흔들림, chips·table 연출 위치 — 전부 연출용. 요트·갱스껄·미니·라이어 폴더에는 없음.
- CSS zoom 없음. `#ui > *` 같은 넓은 pointer-events 선택자 없음(`.hud-tl > *`, `.lgbar > *` 등은 자기 줄 안쪽만).
- 요트 주사위: dice3d·dice2d 모두 서버의 `dice`(눈·자리)로 끝냄. 차례 아닌 사람에게 버튼 없음(board.js `mine()`·sheet.js `canPress`).
- 미니게임 판: 차례(`mySeat === state.turn`)일 때만 눌림, 수는 서버가 판정.
- 갱스껄 버튼: 서버가 준 `acts` 로만 만든다(hand.pure.js).
- draw 입력: pointercancel·lostpointercapture·touch 기본 동작 막기·dispose 모두 있음.
- three.js: 특수 연출(anim/special)·요트 장면·라이어 좌석은 dispose 가 있음.
- 서버 재시작 뒤 방이 사라진 경우: 서버가 로그인 때 `{t:'room', state:null}` 을 보내 화면이 로비로 돌아감(server/rooms.js:760).
- `msg.msg.includes` 의 undefined: 서버의 msg 없는 오류 2개는 모두 dr_ 분기에서 먼저 끝남.
- 사용자 사진 `img.src`: JPEG 데이터 주소 검사(dom.js, emotePanel, yacht) 또는 서버 값만.
