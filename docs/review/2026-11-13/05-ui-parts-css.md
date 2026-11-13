# 과제 05: 공용 화면 부품과 CSS

## 요약 (5줄 이내)
- `ui/dom.js` 의 `h/avatar/fmt/svg` 는 포커·로비·채팅·이모티콘만 쓴다. 라이어·요트·갱식마인드·갱스껄·미니게임·코인·관리자는 DOM 도우미를 **35벌** 따로 만들었다(모양이 서로 조금씩 다름).
- 프로필(사진/첫 글자 동그라미)은 **11곳**에서 따로 그린다. 그래서 같은 사람의 글자 동그라미 색이 **요트 판과 요트 점수표·결과에서 서로 다르고**, 갱식마인드 목록과 최종 순위에서도 다르다(실제로 어긋난 사례).
- CSS 는 "로비식 어두운 유리" 색 묶음(`--ink/--ink2/--fill/--hair/--accent/--red`)을 로비·채팅·코인·비밀번호·갱식마인드(+모듈 4개 `--dr-xx-` 이름)에 **9번 복사**했고 값이 조금씩 갈라졌다(.6/.62, .3/.32/.34, 초록 3가지, 금색 2가지).
- `--k` 이름이 "사이트 배율"과 "모듈 배율"로 겹쳐 쓰인다. 갱스껄 결과·대기 창은 이미 배율이 걸린 무대 안에서 사이트 `--k` 를 한 번 더 곱해 시안보다 커진다(PC 1080p 에서 약 1.3배).
- 확인된 부품 버그: 갱스껄 오류 토스트 두 번, 요트 재접속 초 표시가 탭 복귀 뒤 어긋남, 쓰이지 않는 `lookwin.js`(열리면 지워지지 않는 토스트). zoom·`#ui > *` 위반은 없음.

## 범위와 커버리지
- 대상: client/src 의 화면 JS·CSS(3D scene/, anim/special 제외) 약 150개 + client/index.html. 확인한 CSS 43개 전부.
- **전부 읽은 파일(약 30개)**: ui/dom.js, ui/icons.js, style.css, net.js, index.html, mini/index.js, yacht/ui/result.js, draw/ui/result.js, draw/ui/result.pure.js, draw/ui/players.pure.js, coin/{index,wallet,capsule,pin,lookwin}.js, coin/coin.css, liar/ui/{rank,result}.js, liar/ui/rank.css, gsk/ui/result.pure.js, gsk/gsk.css, test/css.test.js.
- **필요한 부분만 읽은 파일**: draw/ui/{players,hud,tools,settings}.js, draw/index.js, yacht/ui/{sheet,board}.js, yacht/index.js, gsk/index.js, gsk/ui/{result,hand,wait,table}.js·css, liar/ui/{rules,firstsays,vote,hud}.js, liar/scene/seats.js, liar/anim/ending.js, coin/{gacha,shop,look}.js, ui/{lobby,wheel,admin}.js, main.js(토스트·오류·연결 부분), lobby.css, pin.css, mini.css, 그리고 grep 으로 부품별 사용처 전부.
- CSS 는 scratchpad 의 읽기 전용 분석 스크립트(r05/css.mjs)로 전 파일 규칙을 파싱해 접두사, 쓰이지 않는 클래스(저장소 전체 js/html/mjs grep + 문자열 이어 붙이기 손 확인), `> *` pointer-events, z-index, 반복 값, 변수 정의, Safari 속성을 검사했다.
- 채팅·이모티콘·소리·상단 줄(.lgbar/.gkbar/.ytbar)·나가기·설정·시작 버튼은 다른 검토자 몫이라 비교 대상으로만 봤다.

## 지금 구조

### 부품 × 게임 표 (공=ui/dom.js 등 공용 사용, 자=자체 구현, –=없음)
| 부품 | 포커/로비 | 라이어 (복사본) | 요트 | 갱식마인드 | 갱스껄 | 미니 | 코인 | 관리자 |
|---|---|---|---|---|---|---|---|---|
| DOM 도우미 | 공 `dom.js h()` (자식 여러 개, 글자는 text node) | 자 9벌: `el(tag,cls,attrs)` firstsays·rules·vote·rank / `mk(tag,cls,attrs)` settings / `h(tag,cls,text,lg)` result·ending·unmask / `mk(tag,cls,lg)` hud·role / `el(tag,cls)` index | 자 5벌: `el(tag,cls,text)` result·sheet·board, `el(tag,cls)` dice2d·index | 자 6벌: tools `h(tag,cls,attrs,html)`(innerHTML), hud `h(tag,cls,attrs,text)`, players·result `h(tag,cls,text)`, settings `mk+txt`, index `el` | 자 6벌: result·wait `h`, hand·table·mini `el`, index `el`, fx `mk` | 자 `el`,`btn` | 자 4벌: wallet `h(...kids)`+`btn`+`sheet`(수출), pin·gacha·shop `el(tag,cls,text)` | 자 `el`,`btn` (admin.js:13) |
| 프로필(사진/첫 글자) | 공 `dom.avatar()` (pins, lobby, win) | 자 3곳: firstsays.js:92, vote.js:123, ending.js:256 (+3D seats.js) | 자 3곳: result.js:47(색4), sheet.js:143(색4), board.js:113(색6) | 자 2곳: players.js:65(자리색 8), result.js:20(id색 8, **사진 없음**) | 자 2곳: wait.js:68, table.js(해골 사진 합성) | – (이름·색 점만) | shop.js:356 | – |
| faces 받기 | – | liar/index.js:190 (검증 없음) | yacht/index.js:109 (JPEG 검사) | players.js:197 (JPEG 검사) | gsk/index.js:202 (jpeg/png/webp) | – | – | – |
| JPEG 검사 정규식 | dom.js:19 | – | 4벌 result:4, sheet:14, board:117(줄 안), index:11 | players.pure.js:14 ("dom.js 와 같은 모양" 주석) | index.js:32(png/webp 포함) | – | shop.js:52(png/webp) | – |
| 결과 화면 | anim/win.js `.win` | result.js `.lg-rs-` | result.js `.yt-rs-` | result.js `.dr-rs-final` | result.js `.gk-rs-` | 아래 줄 글자뿐(mini/index.js:148) | – | – |
| 순위 줄 계산(동점 처리) | lobby.js:416 showRank(라이어 랭킹 복제, 주석으로 인정) | rank.js:8 rankLines, result.js:12 rankRows | 서버 rank 사용 | result.pure.js:135 finalView | 서버 rank 사용 | – | wallet.js:119 (동점 처리 없음 i+1) | – |
| 랭킹 창 | lobby.js:418 `.lb-rank-sheet` | rank.js `.lg-rk-` | – | – (GDD: 1차에 없음) | – | – | wallet.js:103 `.cn-rank-sheet` | – |
| 규칙 창 | – | rules.js `.lg-rule-` | – | – | – | – | – | – |
| 남은 시간 | – | hud.js:146, ending.js:276, vote.js:283 (`ctx.now()`=Date.now()+offset) | board.js:163 (`s.now + 프레임 누적`) | hud.pure.js `remainMs/formatTime` + result.pure.js `secondsLeft/clockText` (같은 일 2벌) | 표시 없음 | 없음 | shop.js:57 h:mm:ss | – |
| 서버 시계 보정 | – | index.js:168 | 없음(frame dt 누적) | pure.js:104 clockOffset | index.js:189 | 없음 | – | – |
| 토스트 | main.js:144 `.toast`(3초, 쌓임 처리 없음) | main 의 toast 받음 | main 의 toast | main 의 toast(drawToast 2초 중복 막기) | main 의 toast + **스스로도 toast** | – | coin/index.js:47 `.cn-toast/.cn-news` | 상태 글 |
| 확인 창 | wheel.js:42 `.aic-` (Esc·바깥·취소), lobby.js 초기화 `.lb-sheet`(초점 가둠) | hud.js:119 "정말 끝낼까요?" 줄 안 | – | – | – | **브라우저 `confirm()`** (mini/index.js:69) | – | – |
| 모달(덮개 창) | lobby `.lb-sheet-overlay`, avatarCrop, `.ov` | rules·firstsays·rank 패널 | result 접기 | tools 굵기 pop | – | – | wallet.js `sheet()`(swap·rank·capsule만 씀), pin·gacha·shop 은 따로 | `.adm-` |
| Esc 처리 | 캡처+stopPropagation(lobby, wheel, avatarCrop) | 버블, stopPropagation 없음(rules·firstsays), **rank 는 Esc 없음** | – | tools 버블 | – | – | wallet 캡처, pin·gacha·shop 버블(shop 은 `.cn-overlay` 있으면 무시하는 땜질) | – |
| 버튼 모양 | `.gb`, `.lb-btn(.lb-primary 흰 바탕)`, `.aic-row button`, `.notice button` | `.lg-rs-btn` 등 고유 | `.yt-bd-btn`(금색) | `.dr-rs-btn(-main 흰)` | `.gk-hd-btn/.gk-rs-btn/.gk-wt-btn`(같은 종이 버튼 3벌) | `.mn-act(.mn-main 빨강)` = `.lgbar-btn` 과 같은 값 | `.cn-btn(.cn-primary 금)`, `.pn-btn(.pn-primary 흰)`=lb-btn 복제, `.gc-btn`, `.sh-act` | `.adm-btn` = lgbar 값 |
| 아이콘 | icons.js(PIN/LINE/TOP) + dom.svg | 이모지 글자(📖 등) | 줄 안 SVG 문자열 | tools.js ICON | DIAMOND 2벌(hand.js 문자열, result.js DOM으로 다시 만듦) | boards 줄 안 SVG | shop backIcon | – |
| 숫자 포맷 | dom.fmt `en-US`, fmtShort | fmtDelta(−) | String | fmtPts(−, liar 와 같은 글자) | – | – | `ko-KR` 4벌(wallet, gacha, capsule, shop.won) | ko-KR |
| 화면 배율 | `--k`=innerHeight/720(0.6~1.3), `transform: scale(var(--k))` | `--lg-k: var(--k)` | `--yt-sheet-w` 등 자체 | `.dr-root{--k:1}` 로 사이트 배율을 끔 | `--gk-s` 무대 맞춤 + hand.js 가 자기 `--k` 를 다시 씀 + result·wait 는 사이트 `--k` | 없음 | gacha `--k:1` | – |
| 재접속/로딩 | main.js:625 토스트 3초(5초마다 다시) | vote "끊김 N초" | board "재접속 기다리는 중 (N초)", sheet "끊김" | 배지 "끊김" | wait·table "연결 끊김/끊김" | "연결을 기다리는 중" | "불러오는 중…" | – |

## 발견 사항

### [중간] 요트: 같은 사람의 글자 프로필 색이 판과 점수표·결과에서 다르다 (복사본이 갈라진 실제 사례)
- 위치: client/src/yacht/ui/board.js:15,24 (`COLORS` 6색, `charCodeAt`), client/src/yacht/ui/sheet.js:13,53,157 (4색, `codePointAt`), client/src/yacht/ui/result.js:3,12,55 (4색)
- 내용: 사진이 없는 사람은 id 해시로 색을 고르는데 board 는 `h % 6`, sheet·result 는 `h % 4` 이다. 해시 값이 4 이상인 경우가 많아 판 위 "○○ 차례" 동그라미와 점수표 머리 동그라미 색이 다르게 나온다. git 기록상 Y3(점수표)와 Y4A(판)가 따로 만들었다.
- 분류: 불일치 / 중복
- 제안: `yacht/ui/face.js` 같은 한 곳(또는 아래 ui/kit `playerAvatar`)에서 색표·해시·사진 검사를 하나로.
- 위험: 낮음(색만 바뀜). 시안이 6색인지 4색인지 사용자 확인.

### [중간] 갱식마인드: 목록과 최종 순위의 프로필이 다르다 (색 규칙 둘, 순위에는 사진 없음)
- 위치: client/src/draw/ui/players.pure.js:11-12 (자리 번호로 `SEAT_COLORS` 8색), client/src/draw/ui/result.pure.js:38-44 (id 해시로 `AV_COLORS` 8색, 다른 순서), client/src/draw/ui/result.js:20-24 (사진을 아예 안 씀)
- 내용: 같은 사람이 게임 중에는 자리색 동그라미 또는 사진으로, 최종 순위 단상에서는 다른 색 글자 동그라미로 나온다.
- 분류: 불일치 (다: 순위에 사진을 빼는 것이 의도인지 GDD 에 없다)
- 제안: 결과 모듈도 players 의 `faces`·`seatColor` 를 받아 같은 부품으로 그린다.
- 위험: 결과 모듈이 faces 를 모르므로 ctx 에 `face(id)` 를 넘겨야 한다(gsk 처럼).

### [중간] `--k` 이름이 겹쳐 갱스껄 결과·대기 창이 두 번 커진다
- 위치: client/src/ui/dom.js:45-47 (사이트 `--k` = innerHeight/720, 0.6~1.3, :root), client/src/gsk/gsk.css:13 (`.gk-stage` 가 이미 `scale(var(--gk-s))`), client/src/gsk/ui/result.css (var(--k) 40번), client/src/gsk/ui/wait.css (21번), client/src/gsk/ui/hand.js:63-68 (hand 만 자기 `--k` 를 root 에 다시 넣음, PC 는 1)
- 내용: 결과·대기 창은 1280×720 무대 안에 있어 이미 `--gk-s` 로 맞춰지는데, 안의 크기는 `calc(px * var(--k))` 로 사이트 `--k` 를 또 곱한다. 1920×1080 이면 `--gk-s`=1.5, `--k`=1.3 → 버튼 높이 54×1.3×1.5≈105px(시안 81px). iPad Air 가로(1180×820)는 약 14% 큼. hand 는 자기 `--k` 를 써서 괜찮다. 갱식마인드(draw.css:17)·뽑기(gacha.css:3)는 이 충돌을 알고 `--k:1` 로 막아 두었다 → 같은 문제를 모듈마다 따로 막고 있다.
- 분류: 버그(의심 아님, 계산으로 확인. 실제 보이는 크기는 실기기 확인 필요) / 불일치
- 제안: 사이트 배율은 `--site-k`(또는 `--k` 유지)로, 모듈 무대 배율은 각자 `--gk-k` 처럼 이름을 나눈다. 갱스껄은 result·wait 를 hand 처럼 `.gk-stage` 기준으로 맞추면 된다.
- 위험: `--k` 를 쓰는 곳이 많다(chat, emotePanel, lobby, liar `--lg-k`). 이름만 바꾸는 큰 교체는 한 번에 하나씩.

### [중간] DOM 만들기 도우미 35벌
- 위치: 위 표 첫 줄. 대표: client/src/liar/ui/rules.js:49, client/src/yacht/ui/sheet.js:17, client/src/draw/ui/hud.js:18, client/src/gsk/ui/table.js:19, client/src/mini/index.js:17, client/src/coin/pin.js:11, client/src/ui/admin.js:13, client/src/coin/wallet.js:5 (dom.js 의 `h` 와 이름이 같지만 동작 다름)
- 내용: 대부분 `createElement + className + textContent` 3줄. 차이는 우연한 것뿐: `text != null` 과 `text !== undefined`(null 이 "null" 글자로 들어감: gsk·mini), 세 번째 인자가 attrs 냐 text 냐, `data-lg` 를 붙이냐. draw/ui/tools.js:30 만 innerHTML(고정 아이콘) 을 받는다.
- 분류: 중복 (가)
- 제안: `ui/dom.js` 에 `el(tag, cls, {text, attrs, data})` 하나와 `button(cls, text, onClick)` 를 더하고 새 코드는 이것만 쓴다. 기존 파일은 손댈 때 바꾼다.
- 위험: 라이어는 복사본 제약(gamemine 과 같게 유지) — 라이어는 그대로 두는 것이 맞다. liar 의 "맨 위에서 document 를 만지지 않는다"(node 시험) 약속도 지켜야 한다(공용 도우미도 호출할 때만 document 사용).

### [중간] 프로필(사진/첫 글자) 그리는 코드 11곳, 사진 검사 정규식 7벌
- 위치: client/src/ui/dom.js:19-34, client/src/yacht/ui/result.js:47, sheet.js:143, board.js:113, client/src/draw/ui/players.js:65, result.js:20, client/src/liar/ui/firstsays.js:92, vote.js:123, client/src/liar/anim/ending.js:256, client/src/gsk/ui/wait.js:68, client/src/coin/shop.js:356. 정규식: dom.js:19, emotePanel.js:19, players.pure.js:14, yacht result:4, sheet:14, board:117, yacht/index.js:11, gsk/index.js:32, shop.js:52
- 내용: 서버는 `data:image/jpeg;base64,` 만 허용한다(server/protocol.js:11). gsk·shop 의 png/webp 허용은 쓰이지 않는 갈래. 라이어는 faces 를 검사 없이 받아 그대로 img.src 에 넣는다(liar/index.js:191 — 서버가 이미 막아 위험 낮음, 복사본 제약).
- 분류: 중복 / 불일치
- 제안: `ui/kit/avatar.js` 의 `playerAvatar({id, name, face, color, size})` + `isFace(url)` 한 곳. 색은 "자리색 우선, 없으면 id 해시" 하나의 규칙.
- 위험: 갱스껄은 사진을 해골 원판에 합성하는 고유 연출(table.js:104) — 그 부분은 남긴다.

### [중간] "어두운 유리" 디자인 변수 9벌 복사, 값이 갈라짐
- 위치: client/src/ui/lobby.css:1, client/src/ui/chat.css(--ink3 .34, --hair .14), client/src/coin/coin.css:3-4(--green #32d74b), client/src/coin/pin.css:1, client/src/draw/draw.css:12-15(--ink2 .62, --ink3 .32, --green #34c759), draw/ui/hud.css·result.css(--dr-rs-green #2ecc71)·settings.css·tools.css 가 같은 값을 `--dr-hud-ink` 식 이름으로 또 정의
- 내용: 같은 색 묶음(흰 글자 / .6 흐린 글자 / .09 채움 / .12 선 / #f2c444 강조 / #ff453a 빨강)을 파일마다 다시 적는다. 금색도 두 가지다: style.css `--gold:#ffc62a`(포커·요트·이모티콘) 와 `--accent:#f2c444`(로비·코인·갱식마인드), shop.css 는 `--gold:#f2c444` 로 같은 이름에 다른 값.
- 분류: 중복 / 불일치 (가)
- 제안: style.css `:root` 에 `--ui-ink, --ui-ink2, --ui-ink3, --ui-fill, --ui-fill2, --ui-hair, --ui-accent, --ui-on-accent, --ui-red, --ui-green, --ui-ease, --ui-panel` 와 둥글기 `--ui-r-s:10px, --ui-r-m:14px, --ui-r-l:24px, --ui-r-pill:999px`, 글꼴 `--ui-font-sys` 를 두고 모듈은 `var(--ui-…)` 만 쓴다.
- 위험: 값이 미세하게 바뀐다(.62→.6 등). 눈으로 거의 차이 없음.

### [중간] 같은 버튼·창 모양을 접두사만 바꿔 반복
- 위치:
  - 흰 바탕 기본 버튼: client/src/ui/lobby.css:52-56 `.lb-btn.lb-primary` = client/src/coin/pin.css:18-23 `.pn-btn.pn-primary`(크기 48/50 말고 같음, `:active scale(.97)`, disabled .35까지 같음), client/src/draw/ui/result.css:81-84 `.dr-rs-btn-main`.
  - 시트(확인/정보 창): client/src/ui/lobby.css:101-112 `.lb-sheet*` ≈ client/src/coin/coin.css:8-12,26-33 `.cn-overlay/.cn-sheet/.cn-btns` ≈ client/src/coin/pin.css:2-9 `.pn-root/.pn-panel` ≈ client/src/style.css:239-248 `.aic-*` (모두 rgba(0,0,0,.5) 덮개 + blur(40px) 둥근 판 + 위 선 버튼 줄).
  - 회색 사각 버튼(.16 흰 바탕, 둥글기 10, 굵게, `.main` 빨강 #ea3a3d): client/src/mini/mini.css:125-128 `.mn-act` = style.css:263-264 `.lgbar-btn` = :275 `.gkbar-btn` = :283 `.ytbar-btn`, client/src/ui/admin.css:10 `.adm-btn`.
  - 갱스껄 종이 버튼 3벌: client/src/gsk/ui/hand.css:12-15 `.gk-hd-btn`, result.css:78-86 `.gk-rs-btn`, wait.css:37-45 `.gk-wt-btn` (그림자·::before 테두리까지 같음).
  - 랭킹 창 3벌: lobby.js:418(+lobby.css `.lb-rank-*`), liar/ui/rank.js(+rank.css), coin/wallet.js:103(+coin.css `.cn-row` 등).
- 분류: 중복 (가). 단 갱스껄 종이 버튼·라이어·요트 금색 버튼은 게임 고유 디자인(나).
- 제안: 아래 "공통화 제안" 의 `.ui-btn`, `.ui-sheet`. 갱스껄은 자기 폴더 안에서 `.gk-btn` 하나로.
- 위험: 클래스를 바꾸면 smoke.mjs·각 게임 시험의 선택자(data-* 를 주로 쓰지만 확인 필요)가 깨질 수 있다.

### [중간] 모달·확인 창이 6가지 방식, Esc·초점 처리가 제각각
- 위치: client/src/coin/wallet.js:20-44 (`sheet()`: Esc 캡처+stopPropagation, 바깥 누름, 초점 되돌림, 구독 끄기 — 가장 잘 된 것), client/src/coin/pin.js:122-130 (버블 Esc, 초점 되돌림 없음), client/src/coin/gacha.js:349-354, client/src/coin/shop.js:437-444 (`.cn-overlay` 가 있으면 Esc 무시하는 땜질), client/src/ui/lobby.js:390-412(초점 가둠까지), 436-450, client/src/ui/wheel.js:33-62, client/src/liar/ui/rank.js (Esc·초점 없음, role=dialog 만), client/src/liar/ui/rules.js:146-154, client/src/mini/index.js:69 (브라우저 `confirm()`)
- 내용: 같은 코인 구역 안에서도 swap·rank·capsule 은 `sheet()` 를 쓰고 pin·gacha·shop 은 따로 만들었다. Esc 를 캡처로 먹는 창과 버블로 받는 창이 섞여 있어 겹쳐 열리면 순서가 우연에 맡겨진다(지금은 shop 이 땜질로 피함). 미니게임 기권만 브라우저 기본 확인 창이라 사이트 모양과 다르다.
- 분류: 중복 / 불일치 (가)
- 제안: `ui/kit/modal.js` 하나: `openModal({label, content, buttons, onClose, dismiss:true})` → `{close}`. 맨 위 창만 Esc 를 받는 "창 쌓기" 목록을 그 안에 두고, `confirmBox({title, text, ok, cancel, danger})` 를 그 위에 얹는다. wallet.js `sheet()` 를 옮겨 오면 거의 끝.
- 위험: 라이어 창들은 복사본 제약이라 그대로. 미니 `confirm()` 교체 시 smoke.mjs 의 기권 클릭(있다면) 수정 필요.

### [중간] 재접속·로딩 표시가 사라졌다 나타났다 한다
- 위치: client/src/main.js:618-626, client/src/net.js:28-34
- 내용: 연결이 끊기면 3초짜리 토스트만 뜨고, 재시도(최대 5초 간격)마다 또 뜬다. Render 무료 요금제의 잠깨움(수십 초) 동안 "끊김 → 없어짐 → 또 끊김" 이 반복되고, 그 사이 누른 버튼은 소리 없이 버려진다(net.js:36 readyState 검사). 다시 연결돼도 알림이 없다. 처음 접속 중 표시도 없다(index.html 에 없음).
- 분류: 과복잡 아님 / 공용 부품 부족 (가)
- 제안: `ui/kit/connBanner.js`: 끊긴 동안 계속 보이는 상단 띠("다시 연결 중…"), 붙으면 사라짐. onStatus(true/false) 에 연결.
- 위험: 낮음. 다른 화면 요소(상단 줄 54px)와 겹치지 않게 자리만 정하면 된다.

### [낮음] 갱스껄 오류는 토스트가 두 번 뜬다
- 위치: client/src/main.js:600-601, client/src/gsk/index.js:220-223
- 내용: `gk_` 오류가 오면 600줄에서 `g.error(msg)` → gsk 가 `toast(err.msg)`, 이어서 601줄 조건(`inGsk()`)이 참이라 main 이 또 `toast(msg.msg)`. 같은 자리(.toast 는 쌓임 처리 없음)에 같은 글 두 장이 겹쳐 배경이 진해지고, 두 요소가 3초 동안 남는다.
- 분류: 버그
- 제안: 600줄에서 gsk 로 넘겼으면 `break`(draw 처럼), 또는 gsk.error 의 toast 를 지운다.
- 위험: 없음.

### [낮음] 요트 "재접속 기다리는 중 (N초)" 가 탭을 다녀오면 어긋난다
- 위치: client/src/yacht/ui/board.js:69,159-173,321-324,395-398, client/src/main.js:607
- 내용: 남은 초 = `awayUntil - (s.now + elapsed)` 이고 `elapsed` 는 그림 프레임(dt)으로만 늘어난다. 탭이 숨으면 프레임이 멈추고, 돌아오면 main.js:607 이 `applyRoom(state.room)` 을 다시 불러 `update()` 가 `elapsed = 0` 으로 되돌린다. `s.now` 는 예전 서버 시각 그대로라, 30초 숨어 있었다면 30초 많게 보인다(다음 방 상태가 올 때까지). 라이어·갱식마인드·갱스껄은 `Date.now()+offset` 을 써서 이 문제가 없다.
- 분류: 버그(타이머 어긋남)
- 제안: 다른 게임처럼 받을 때 `offset = s.now - Date.now()` 를 저장하고 `Date.now()+offset` 으로 잰다. 공용 `ui/kit/clock.js`(`serverClock.sync(state.now)`, `.now()`, `secondsLeft(endsAt)`) 로 묶으면 4게임이 같은 시계를 쓴다.
- 위험: 낮음.

### [낮음] 갱식마인드 남은 시간 계산 2벌 + 없는 요소를 찾는 코드
- 위치: client/src/draw/ui/hud.pure.js:15-27 (`remainMs/formatTime`), client/src/draw/ui/result.pure.js:13-24 (`secondsLeft/clockText`), client/src/draw/ui/result.js:52-53 (`.dr-rs-clock` 을 찾지만 그런 요소를 만드는 곳이 저장소에 없음, 250ms 마다 querySelector)
- 분류: 중복 / 불필요
- 제안: result.js 52-53줄과 `clockText` import 를 지우고, 시간 글자는 공용 clock 하나로.
- 위험: 없음(test/draw 에 clockText 시험이 있으면 함께 정리).

### [낮음] 쓰이지 않는 `coin/lookwin.js` 와 그 안의 지워지지 않는 토스트
- 위치: client/src/coin/lookwin.js:2-4, client/src/coin/index.js:17, client/src/ui/lobby.js:18(주석), 229(목록은 shop·rank 뿐)
- 내용: `open('look')` 을 부르는 곳이 저장소 전체에 없다(lobby 버튼 목록·shop 모두 확인). 열리더라도 `.cn-toast` 를 붙이기만 하고 지우지 않아, 누를 때마다 요소가 쌓이고 `prefers-reduced-motion` 이면(coin.css:56) 화면에 영구히 남는다. 같은 줄 lobby.js:233 `if (a === 'draw' && !SHOW_DRAW)` 도 목록에 draw 가 없어 죽은 조건.
- 분류: 불필요(+잠재 버그)
- 제안: lookwin.js 와 WINDOWS.look 을 지우거나, 공용 toast 를 쓰게 한다.
- 위험: 없음.

### [낮음] 토스트 3종, 쌓임·겹침 처리 없음
- 위치: client/src/main.js:144-148 `.toast`(style.css:67, 아래 가운데, z 50), client/src/coin/index.js:47-65 `.cn-toast/.cn-news`(위 가운데, z 70, 같은 종류는 하나만), client/src/ui/chat.js:149 `.chat-toast`(채팅 몫)
- 내용: main 토스트는 여러 개가 같은 자리에 겹친다(위 gsk 이중 토스트가 그 예). 코인 쪽만 "하나만 두고 시간 다시 재기" 를 한다.
- 분류: 중복 (가)
- 제안: `ui/kit/toast.js`: `toast(text, {kind:'info'|'good'|'err', ms, where:'top'|'bottom', key})` — 같은 key 는 갈아 끼우고, 다른 것은 위로 쌓기(최대 3). coin 의 flash 를 이것으로.
- 위험: 낮음.

### [낮음] 숫자 포맷 7벌, 점수 증감 포맷 2벌
- 위치: client/src/ui/dom.js:36-41 (`fmt` en-US, `fmtShort`), client/src/coin/wallet.js:3, gacha.js:12, capsule.js:8, shop.js:51 (`ko-KR`), client/src/ui/admin.js:98-99, client/src/liar/ui/result.js:4-9 `fmtDelta` = client/src/draw/ui/result.pure.js:5-11 `fmtPts`(같은 '−' 글자)
- 내용: en-US 와 ko-KR 은 둘 다 "1,234" 라 결과는 같다(우연한 차이).
- 분류: 중복 (가)
- 제안: `ui/kit/format.js`: `num(n)`, `short(n)`, `delta(n)`, `clock(sec)`. 라이어는 복사본이라 그대로.

### [낮음] 갱스껄 hand.css 의 접두사 없는 클래스, 접두사 시험이 없는 모듈
- 위치: client/src/gsk/ui/hand.css:9,10,16-18,22 (`.coins`, `.two`, `.ink`, `.pass`, `.abs`), client/src/coin/titlefx.css (`.tfx` — 접두사 자체라 괜찮음), test/css.test.js (접두사 검사는 lobby·chat·emotePanel·liar·yacht 만)
- 내용: CLAUDE.md "갱스껄 CSS 는 전부 .gk-" 위반. 지금은 다른 파일에 같은 이름이 없어 css.test 가 통과하지만, 다른 모듈이 `.ink`·`.pass` 를 쓰면 바로 충돌. 갱식마인드(.dr-)·갱스껄(.gk-)·미니(.mn-)·코인·관리자(.adm-) 는 접두사 시험이 없다(이번 검사로는 위 5개 말고 위반 없음).
- 분류: 규칙 위반
- 제안: `.gk-hd-coins` 등으로 이름 바꾸고 css.test.js 의 접두사 표에 dr/gk/mn/cn·gc·sh·pn·lk·tfx·cp/adm 를 추가.

### [낮음] `.mn-root > *` 로 판 전체가 누름 받기
- 위치: client/src/mini/mini.css:100-102
- 내용: `#ui > *` 규칙 위반은 아니고(CLAUDE.md 는 #ui 넓은 선택자만 금지), 미니게임 화면 밑에는 3D 가 없어 지금 문제는 없다. 다만 화면 대부분(판 칸 flex:1, 대기 칸)이 누름을 먹는다. 상단 줄·채팅(z 30~32)이 위라 가려지지 않음을 z-index 표로 확인.
- 분류: 규칙 정신 위반(약)
- 제안: 버튼·판에만 auto.

### [낮음] iPad Safari 에서 효과가 없는 속성
- 위치: client/src/draw/canvas/canvas.css:12,24, client/src/draw/ui/players.css:19, client/src/gsk/ui/table.css:17,21,67, client/src/style.css:255 (`user-select` 만 있고 `-webkit-user-select` 없음 — Safari 는 접두사판만 앎. html/body 에 `-webkit-user-select:none` 이 있어 실제 영향은 없음), client/src/liar/ui/{vote.css:20, firstsays.css:11, rules.css:10}, liar/anim/unmask.css:35 (`color-mix()` — Safari 16.2 미만이면 그 줄이 버려져 테두리 없음. 복사본 제약), client/src/yacht/ui/sheet.css:59 (`:has()` Safari 15.4+), `100dvh`(15.4+) 여러 곳
- 분류: 낮음(iPadOS 16.2 이상이면 문제 없음)
- 제안: 지원 하한(예: iPadOS 16.4)을 정해 두면 나머지는 버린 후보.

### [낮음] 라이어 세리프 글꼴(Noto Serif KR)을 사이트가 불러오지 않는다
- 위치: client/src/liar/liar.css:4 `--lg-serif "Noto Serif KR", "Apple SD Gothic Neo", serif` (제목·역할·엔딩·투표 등 9개 파일에서 사용), client/index.html:9 (Noto Sans KR·Black Han Sans·Bangers·Libre Baskerville 만), 갱스껄은 스스로 글꼴을 불러옴(gsk/index.js:33,49)
- 내용: iPad 에는 Noto Serif KR 이 없어 라이어 세리프 제목이 Apple SD Gothic Neo(고딕)로 나온다. gamemine 쪽 index.html 이 불러오던 것을 옮기면서 빠진 것으로 보인다(다).
- 분류: 불일치 (다)
- 제안: 사용자에게 확인 후 main.js 의 라이어 연결에서 글꼴 링크를 넣는다(갱스껄 ensureFonts 와 같은 공용 `loadFonts(href)` 로).
- 위험: 글꼴 내려받기 크기(한글 세리프는 큼, unicode-range 로 나뉘어 받음).

## 공통화 제안

### 하나로 묶을 것 (제안 위치 client/src/ui/kit/, 각 파일은 document 를 호출할 때만 만짐)
| 파일 | 모양 | 지금 대체할 곳 |
|---|---|---|
| `ui/dom.js` 확장 | `el(tag, cls, {text, attrs, data})`, `button(cls, text, onClick)` (기존 `h` 유지) | 35벌 도우미(라이어 제외) |
| `kit/avatar.js` | `isFace(url)`, `avatarColor({seat, id})`, `playerAvatar({id, name, face, color, size, cls})` → span(사진 또는 첫 글자, 바뀔 때만 다시 그림 = draw players 의 `dataset.k` 방식) | dom.avatar, yacht 3곳, draw 2곳, gsk wait, shop |
| `kit/faces.js` | `createFaces()` → `{apply(e /* faces 이벤트 */), get(id), drop(id), onChange(fn)}` (JPEG 검사 포함) | liar/yacht/draw/gsk index 의 faces Map 4벌 |
| `kit/clock.js` | `serverClock()` → `{sync(stateNow), now(), left(endsAt) /*초, 올림*/}`, `fmtClock(sec)` "m:ss" | liar·draw·gsk offset, yacht 프레임 누적, draw 2벌 |
| `kit/modal.js` | `openModal({label, content, buttons, onClose, dismiss})` → `{close, track(off), focus(el)}` + 창 쌓기(맨 위만 Esc) + `confirmBox({title, text, ok, cancel, danger})` → Promise<boolean> | coin `sheet()`(그대로 옮김), pin, gacha 겉틀, lobby 초기화·랭킹 시트, wheel 올인 확인(.aic 디자인은 클래스만 바꿔 유지), mini `confirm()` |
| `kit/toast.js` | `toast(text, {kind, ms, where, key})` 쌓기 최대 3 | main toast, coin flash, lookwin |
| `kit/rankList.js` | `rankRows(list, {score, tieBy})` (동점 같은 순위) + `renderRankList(rows, cols)` | lobby showRank, liar rankLines/rankRows(복사본이라 계산만 참고), draw finalView, coin openRank(동점 처리 없음 → 통일 여부 질문) |
| `kit/format.js` | `num`, `short`, `delta`, `clock` | dom.fmt/fmtShort, coin 4벌, draw fmtPts |
| `kit/connBanner.js` | `createConnBanner(ui)` → `{set(up, code)}` | main.js 연결 토스트 |
| style.css `:root` 변수 | `--ui-ink/ink2/ink3/fill/fill2/hair/panel/accent/on-accent/red/green/ease`, `--ui-r-s/m/l/pill`, `--ui-font-sys`, z 층 `--z-game:10 --z-hud:20 --z-chat:30 --z-bar:32 --z-panel:40 --z-modal:60 --z-toast:70 --z-top:100` | lobby·chat·coin·pin·draw(+모듈 4개) 의 복사 변수, 흩어진 z-index 숫자(1~100, 40여 종) |
| style.css 전역 클래스 | `.ui-btn` (`.ui-primary` 흰 바탕 / `.ui-accent` 금 / `.ui-tint` / `.ui-danger`), `.ui-sheet-ov`, `.ui-sheet`, `.ui-sheet-btns`, `.ui-bar-btn`(.16 회색 + `.main` 빨강) | .lb-btn·.pn-btn·.cn-btn·.dr-rs-btn / .lb-sheet·.cn-sheet·.pn-panel·.aic-sheet / .lgbar-btn·.gkbar-btn·.ytbar-btn·.mn-act·.adm-btn |
| 배율 이름 | 사이트 배율은 `--k` 하나로 두고, 모듈 무대 배율은 반드시 자기 이름(`--gk-k`, `--yt-…`) | gsk result·wait 이중 배율, draw/gacha 의 `--k:1` 막기 |

### 예외로 남길 것 (근거)
- 라이어 폴더 전체의 화면 부품·CSS: CLAUDE.md "복사해 온 라이어 폴더는 gamemine 과 같게 유지". 사이트 쪽 덮어쓰기는 지금처럼 style.css `.lg-root …` 로만.
- 갱스껄 종이·나무 디자인(.gk-*-btn, Gowun Batang 글꼴, 해골 원판 사진 합성): docs/gsk/GDD.md 와 design/gsk 시안에서 온 고유 디자인. 다만 갱스껄 폴더 안 3벌은 하나로.
- 요트 금색 큰 버튼·점수표 종이(.yt-bd-btn, sheet `--paper`), 포커 카드·핀·휠(.pc, .pin, .act): 게임 고유 모양.
- 갱식마인드 프로필 "통통" 모션·말풍선 위치, 정답 가리기(canSeeSec): GDD 7절·3-5 약속(사이트 공용 avatar 위에 모션 클래스만 얹는다).
- 뽑기(gacha)·상점(shop) 연출 화면: 디자인이 다름. 겉틀(덮개·Esc·닫기)만 modal 로.

### 사용자에게 물을 것
1. 요트 글자 프로필 색은 4색과 6색 중 무엇이 맞나? (판과 점수표가 지금 다름)
2. 갱식마인드 최종 순위에 프로필 사진을 넣을까, 글자 동그라미만이 의도인가?
3. 코인 랭킹도 라이어처럼 같은 점수는 같은 순위로 할까?
4. 미니게임 기권 확인을 사이트 확인 창(포커 올인 확인과 같은 모양)으로 바꿀까?
5. 라이어 세리프 제목 글꼴(Noto Serif KR)을 불러올까, 지금처럼 고딕으로 둘까?
6. 금색을 하나(#ffc62a 또는 #f2c444)로 맞출까? 지금 포커·요트와 로비·코인·갱식마인드가 서로 다른 금색.
7. iPad 지원 하한(iPadOS 버전)을 정할까? (color-mix, :has, dvh 처리 기준)

## 버린 후보
- `zoom` 속성: client 전체 CSS 에 없음(css.test 도 검사).
- `#ui > *` pointer-events: 없음. `.hud-tl > *`, `.lgbar > *` 등은 작은 줄 안이라 문제 아님.
- 같은 클래스를 두 CSS 파일에 정의: css.test.js 의 CROSS_FILE_ALLOW 목록 말고는 없음(스크립트로 다시 확인).
- 쓰이지 않는 CSS 클래스: 기계 검사로 걸린 60여 개(gc-t1~4, tfx-*, dr-c-*, dr-pl-host/gone/ok, dr-rs-p1~3, gk-fx-z19~24, gk-tb-mute, gk-wt-mine/taken, lg-vt-yes, mn-ghost-*, mn-ck-ring-*, mn-ch-w/b, lk-cover, pn-primary 등)는 전부 JS 에서 문자열을 이어 붙여 쓰는 것을 손으로 확인 → 확인된 미사용 없음.
- backdrop-filter: 모든 곳에 `-webkit-` 판이 함께 있음.
- 모듈 리스너 누수: draw/index.js dispose, gsk hand ResizeObserver, liar rules·firstsays, yacht board visibilitychange, coin 창들의 `ctx.on` 끄기 모두 정리됨. gacha 500ms·shop 1초 interval 도 close 에서 정리.
- 이름 첫 글자를 `slice(0,1)` 로 자르는 곳(yacht board, liar vote): 아이디가 한글·영문·숫자·_ 만 허용(server/protocol.js:13)이라 깨질 일 없음.
- draw/ui/tools.js 의 innerHTML 도우미: 고정 아이콘·숫자만 넣음(사용자 글자 없음).
- gsk table.js 사진 해골 캐시 Map: 사람 수×색으로 한정, 판이 바뀌어도 커지지 않음.
- 토스트 z-index(50)가 결과 창(60)보다 낮은 것: 결과 창들은 각 게임 루트(z 5~10) 안의 층이라 실제로는 토스트가 위.
