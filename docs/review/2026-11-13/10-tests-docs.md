# 과제 10: 시험·문서·설정

## 요약 (5줄 이내)
- 시험은 많지만(시험·도우미 약 27,000줄) "사이트 공통 기능을 실제 허브(server/rooms.js)를 거쳐 게임별로" 지키는 시험은 한쪽으로 쏠려 있다. 채팅·이모티콘은 포커(홀덤·블러핑)·라이어만 허브 경로로 시험되고, **요트·미니게임은 채팅·이모티콘 시험이 아예 없다**. 갱스껄·갱식마인드는 가짜 허브로 방 객체만 시험한다.
- 시험 도우미가 게임마다 복사돼 있다: 가짜 허브+로그인 `setup()` 약 22벌, 방 단위 가짜 허브 4벌(모양이 서로 다름), 실제 서버+ws 클라이언트 5벌, 브라우저 시험 머리 부분 5벌(+수동 하네스 19개).
- 수동 하네스 `test/liar/ui/*/run.mjs`(14개)·`test/yacht/ui/*/run.mjs`(5개)는 package.json 어느 스크립트에서도 돌지 않는다. `npm test` 는 빌드 없이 dist/ 를 그대로 쓰고 smoke.mjs 도 포함하지 않는다.
- 문서: CLAUDE.md 의 갱식마인드 스위치 설명이 스스로 모순(실제 서버 기본값 on), draw GDD·README(GSK)·LIAR-MOVE·YACHT-PLAN 이 옛 기본값(off/test)을 적고 있다. README 는 없는 파일(click.e2e.mjs), Node 20(실제 22), MINI 누락. CLAUDE.md 의 개발 브랜치 이름이 현재 브랜치와 다르다.
- 의존성은 4개 모두 사용 중. 단 Playwright 는 package.json 에 없는데 `npm run check` 의 필수 조건이다.

## 범위와 커버리지
- 대상: `git ls-files test docs scripts design .claude` 320개 + CLAUDE.md, README.md, package.json, render.yaml, client/vite.config.js, client/src/admin/fx.test.js(시험 파일이 client 안에 있음) = 326개. 이 중 그림(png/jpg/webp) 약 150개, design/*.html 시안 약 18개는 내용 검토 대상이 아니라 쓰임새·크기만 확인.
- 전부 읽은 것(약 30개): test/helpers.js, test/e2e/helpers.js, test/admin/helpers.js, test/liar/e2e/helpers.js, test/yacht/e2e/helpers.js, test/liar/e2e/start.test.js, test/draw/e2e/draw.e2e.test.js(앞 78줄+이름), test/e2e/rooms.test.js·connection.test.js·timeouts.test.js(해당 부분), test/css.test.js(설정부), test/chat.test.js(검증부), test/mini/room.test.js(130~170), test/liar/room.test.js(1~37, 478~560), test/draw/room.test.js(1~40), test/gsk/room.test.js(1~70), test/gsk/protocol.test.js(앞), 4개 한 판 스모크의 앞부분·모든 step 이름, smoke.mjs 앞 140줄·모든 step 이름, package.json, render.yaml, client/vite.config.js, README.md, CLAUDE.md, SKILL.md, docs/REVIEW.md, docs/CLIENT-NOTES.md, docs/SYNC.md, docs/HANDOFF-COIN.md, docs/mini/PLAN.md, scripts/* 머리말.
- 이름·단언·패턴만 훑은 것: 나머지 test/**/*.test.js 약 120개(모든 test()/it() 이름 목록, 단언 없는 블록 자동 검사, skip/only 검사, sleep 검사, import 해석 검사), docs/SPEC.md·각 GDD·YACHT-PLAN·LIAR-MOVE·liar 문서(제목·스위치·경로·render.yaml·기본값 줄만 grep).
- 못 한 것: 시험 실행(지침상 금지). 그래서 "이 시험이 실제로 통과하는가"는 판단하지 않았다. 대형 시험 본문(liar/game 1310줄, draw/game 1068줄 등)은 줄 단위로 다 읽지 않았다.

## 지금 구조

### 시험 종류와 실행 위치
| 종류 | 파일 | 어느 명령에서 도는가 |
|---|---|---|
| 허브 단위(FakeClock + createHub + FakeSocket) | test/*.test.js, test/coin, test/admin, test/mini, test/yacht/room, *-seam | check(test:unit), test |
| 방 단위(가짜 허브로 방 객체 직접 호출) | test/liar/room, test/draw/room, test/gsk/room·game | check, test |
| 엔진·순수 함수 | test/*/game, score, protocol, *.pure.test.js | check, test (gsk 는 posttest:unit / posttest 로 따로) |
| 실제 서버 e2e(자식 프로세스) | test/e2e/*.test.js | test, test:e2e |
| 실제 서버 e2e(같은 프로세스 startServer) | test/liar/e2e, test/yacht/e2e, test/draw/e2e | test, test:e2e |
| 브라우저 클릭 | test/ui/smoke.mjs | check(test:ui) — **npm test 에는 없음** |
| 브라우저 한 판 | test/ui/{liar,yacht,draw}-round.mjs, gsk-round.mjs(posttest) | test 만 |
| 브라우저 모듈 하네스(vite 띄움) | test/liar/ui/*/run.mjs(14), test/yacht/ui/*/run.mjs(5) | **어디서도 안 돔(수동)** |

### 보호망 지도 (C = `npm run check` 에서 돎, T = `npm test` 에서만, 허브 = 실제 server/rooms.js 를 거침, 가짜 = 방 객체 직접 호출)
| 기능 | 홀덤 | 블러핑 | 라이어 | 요트 | 갱식마인드 | 갱스껄 | 미니게임 |
|---|---|---|---|---|---|---|---|
| 채팅(서버) | chat.test.js 허브 C | chat.test.js:155,188 허브 C | room.test:400,450 가짜 C; e2e/02,05 허브 T | **없음** | game.test:783-842 엔진 C; room.test:139,170 가짜 C; coin/leaks 허브 C; draw.e2e:122 허브 T | room.test:254,292 가짜 C | **없음** |
| 채팅(화면) | smoke:208,220 C | 없음 | smoke:418,439 C; liar-round T | **없음** | players.pure C; draw-round(정답 입력) T | **없음** | **없음** |
| 이모티콘·사진·사운드(서버) | 없음(media.test 는 bluff 방) | media.test.js 허브 C | liar-seam:127 허브 C; room.test:400,450 가짜 C; e2e/05,06 허브 T | **없음** | room.test:149,170 가짜 C | room.test:255,297 가짜 C | **없음** |
| 이모티콘(화면) | smoke:237 C | 없음 | smoke:448 C | **없음** | draw-round:396(패널 열림만, 전달 확인 없음) T | **없음** | **없음** |
| 나가기 | rooms.test:342 허브 C; e2e connection·chips T; smoke:308 C | award:304 허브 C; smoke:364 C | room.test:553,591 가짜 C; e2e/05:163 T; smoke:458 C | yacht/room:154 허브 C; smoke:606 C | room.test:326 가짜 C; game.test:664 C; smoke:648 C | game.test:457~ C; room.test:242 가짜 C; smoke:673 C | mini/room:155 허브 C(게임 중만, 대기실 나가기 없음); smoke:730 C |
| 설정 | 모드 바꾸기: e2e abuse:228, e2e rooms T (허브 단위 없음) | 같음 | room.test:38-75 가짜 C; protocol C; smoke:404,408 C | (설정 없음) | game.test:616 C; protocol C; settings.pure C; smoke:644 C | 색 고르기 room.test:70 가짜 C; gsk-round T | 게임 고르기 mini/room:44 허브 C; smoke:698 C |
| 게임 시작(방장만·인원) | rooms.test:127 허브 C; e2e abuse:228 T; smoke:177 C | smoke:318 C | room.test:195 가짜 C; e2e/01:107 T; smoke:408 C | yacht/room:33 허브 C; smoke:540 C | game.test:511 C; smoke 는 시작 안 함, draw-round T | game.test:78 C; gsk-seam:41 허브 C; smoke 는 버튼 보임만, gsk-round T | mini/room:44 허브 C; smoke:704 C |
| 방장 넘김(나갈 때 자동) | rooms.test:127-143 허브 C; e2e connection:50 T | (홀덤과 같은 코드, 별도 시험 없음) | room.test:591 가짜 C; e2e/05:163,183 T | yacht/room:154 허브 C | game.test:664, room.test:424 가짜 C | game.test:571, room.test:242,281 가짜 C | **없음** |
| 방장 위임(수동) | 기능 없음 | 기능 없음 | 기능 없음 | 기능 없음 | 기능 없음 | 기능 없음 | 기능 없음 |
| 내보내기(kick) | 기능 없음 | 기능 없음 | room.test:111 가짜 C | 기능 없음 | game.test:637, room.test:326 C | 기능 없음 | 기능 없음 |
| 끊김·재접속(서버) | rooms.test:199,221,244 허브 C; e2e connection·timeouts T | rooms.test:416 허브 C; e2e timeouts T | room.test R2a 가짜 C; game.test away/drop C; e2e/05 T | yacht/room:90,119 허브 C; yacht e2e:37 T | game/room 여러 개 가짜 C | room.test:190,281 가짜 C | mini/room:130 허브 C |
| 끊김·재접속(화면) | 없음 | 없음 | liar-round F5 T | yacht-round 창 닫았다 다시 T | draw-round F5 T | **없음** | **없음** |
| 비밀 누출 | leaks.test, e2e/leaks | 같음 | liar/leaks C | (비밀 없음) | draw/leaks C, coin/leaks C | gsk/leaks C, gsk-round T | (비밀 없음) |

읽는 법: "가짜" 칸만 있는 게임(갱스껄 채팅·이모티콘·방장 넘김, 갱식마인드 이모티콘·방장 넘김·끊김)은 **허브 쪽으로 공통 코드를 옮기면 그 시험이 아무것도 지켜 주지 못한다**(방 객체의 메서드를 직접 부르기 때문, 아래 [높음] 2번).

### 게임별 시험 도우미 위치
| 도우미 | 위치 |
|---|---|
| FakeClock / FakeSocket / client(hub) / seeded | test/helpers.js:1-85 (공용, 잘 쓰임) |
| 허브 setup()+login() 복사본 | test/admin/admin.test.js:13, admin/give.test.js:9-15, chat.test.js:8, coin/award.test.js:13-19, coin/cap-server.test.js:8-14, coin/holdem-live.test.js:10, coin/leaks.test.js:69, coin/pin.test.js:9-20, coin/serial.test.js:8, coin/stock.test.js:10-16, coin/wallet.test.js:10-16,196, gsk-seam.test.js:9-14, leaks.test.js:12, liar-seam.test.js:13-20,38, media.test.js:13, mini/room.test.js:9, reset.test.js:8, roomlist.test.js:7-12, rooms.test.js:9-16, yacht-seam.test.js:11-18,36, yacht/room.test.js:10 — 그리고 이것들을 이미 묶은 test/admin/helpers.js:29 setupAdmin (관리자 전용) |
| 방 단위 가짜 허브 | test/liar/room.test.js:5-25(timers 가 실행 안 됨 `setTimeout: () => 1`, `guard: (f) => f`), liar/room.test.js 의 game3 두 번째 판, test/draw/room.test.js:6-40(`guard: (f) => () => f()`, 자체 타이머 배열), test/gsk/room.test.js:10-24(FakeClock 사용) |
| 실제 서버 + ws 클라이언트 | test/e2e/helpers.js:31(자식 프로세스 spawn, 환경 변수로 타이머) + test/e2e/bot.js(이벤트 대기 waitFor), test/liar/e2e/helpers.js:24-125(같은 프로세스, 빠른 시계 k배, 4ms 폴링 until), test/yacht/e2e/helpers.js:9-48(같은 프로세스, 실제 시계), test/draw/e2e/draw.e2e.test.js:9-65(liar 도우미를 거의 그대로 다시 씀), test/liar/e2e/start.test.js:9-31(또 한 벌, 20ms 폴링) |
| until/sleep | 위 5곳 + test/ui/yacht-round.mjs:80-83, gsk-round.mjs:84, smoke.mjs:19, yacht/ui/{board,roll}/run.mjs, client/src/admin/fx.js:5 |
| 브라우저 머리(dist 확인·playwright require·check/step/StepFailed·openPage·폰트 차단·오류 수집·WebSocket 엿보기 `__coinGot`) | test/ui/smoke.mjs:12-50, liar-round.mjs:12-63, yacht-round.mjs:12-65, draw-round.mjs:12-65, gsk-round.mjs:14-68. `__coinGot` 엿보기 코드는 liar·yacht·draw-round 에 같은 글자로 3벌 |
| 가림 검사(elementFromPoint) | smoke.mjs:56(가장 완전), liar-round.mjs:~90, draw-round.mjs:~80,402, 하네스 14곳 |

## 발견 사항

### [높음] 요트·미니게임은 채팅·이모티콘을 지키는 시험이 하나도 없다
- 위치: test/yacht/*, test/yacht-seam.test.js, test/mini/*, test/ui/yacht-round.mjs, test/ui/smoke.mjs:522-736 (grep `chat|emote|snd` 결과 요트·미니 쪽 0건)
- 내용: SPEC 19절 "같은 아이디·…·채팅·이모티콘·사운드를 쓴다", CLAUDE.md 미니게임 "사이트 채팅·이모티콘은 요트처럼". 하지만 서버 시험(요트 방에서 chat/emote 가 방 전원에게 가는가, 다른 방으로 새지 않는가)도, 화면 시험(요트·미니 상단 줄 이모티콘 버튼, 채팅 칸)도 없다. 갱스껄은 가짜 허브 시험만 있다(test/gsk/room.test.js:254,292). 채팅·이모티콘을 한 곳으로 묶으면 이 세 게임이 깨져도 check·test 모두 통과한다.
- 분류: 시험 구멍
- 제안: 공통화 전에 허브 단위 표 시험 하나를 먼저 만든다: `for (const mode of ['holdem','bluff','liar','yacht','draw','gsk','mini'])` 로 방을 만들고 두 명이 들어와 대기실·게임 중에 chat / emote / pemote / snd 를 보내 "방 전원 도착, 다른 방 미도착, 방 상태 push 없음, 규칙상 막히는 경우는 오류 코드" 를 확인(test/site-media.test.js 같은 곳, test/helpers.js 의 client 사용). smoke 에는 요트·미니 방에서 이모티콘 1개 보내 봇이 받는지 한 줄씩.
- 위험: 라이어(첫 설명 중 잠금)·갱식마인드(그리는 사람 채팅 금지, 정답 숨김)는 (나) 예외라 표에서 "막혀야 함" 칸으로 따로 적어야 한다.

### [높음] 갱스껄·갱식마인드·라이어 방 시험은 방 객체를 직접 불러 허브 경로를 지키지 못한다
- 위치: test/gsk/room.test.js:10-24,254-297 (`t.room.chat(...)`, `t.room.emote(...)`), test/draw/room.test.js:6-40,90-179 (`x.room.chat`, `x.room.mediaBlocked`), test/liar/room.test.js:5-25 (`room.join(s)`, `room.leave`, `room.setConnected`)
- 내용: 세 파일 모두 hub 를 손으로 만든 객체로 바꿔 끼우고 방 메서드를 직접 호출한다. 그래서 (1) 허브가 그 메서드를 실제로 부르는지, 어떤 순서로(room → chatLog → sndList, SYNC.md 사진 이모티콘 항목) 부르는지는 시험되지 않는다. (2) 공통화로 `room.chat` 을 없애고 허브가 처리하게 바꾸면 이 시험들은 "메서드 없음"으로 깨지거나, 남겨 두면 쓰이지 않는 메서드를 계속 시험하게 된다. 가짜 허브끼리도 모양이 다르다: liar 는 타이머가 아예 실행되지 않고(`setTimeout: () => 1`) `guard: (f) => f`, draw 는 `guard: (f) => () => f()`, 실제 허브는 예외를 잡는 `guard`(server/rooms.js:500). 타이머 콜백이 던지는 경우의 동작은 가짜 쪽에서 실제와 다르다.
- 분류: 시험 구멍 / 중복
- 제안: 공통화 전에 허브 이음매 시험(test/*-seam.test.js 형식)을 갱식마인드·갱스껄에도 "채팅·이모티콘·나가기·끊김 60초·방장 넘김" 까지 늘린다. 방 단위 가짜 허브는 `test/lib/fakeHub.js` 하나로 합치고 실제 허브와 같은 `guard`·FakeClock 을 쓴다.
- 위험: 라이어 room.test.js 는 복사본 제약(gamemine 과 같게 유지) — 그 파일 자체는 고치지 말고 바깥에 이음매 시험을 더하는 방식으로.

### [중간] 미니게임의 방장 넘김·대기실 나가기 시험이 없다
- 위치: test/mini/room.test.js (8개 시험 중 host 관련은 `mn_host` 거절뿐, :44-94), smoke.mjs:683-736
- 내용: 다른 모든 게임은 "방장이 나가면 다음 사람이 방장" 시험이 있는데 미니게임은 없다. 대기실에서 나가기(게임 전)도 없다(:155 는 게임 중 나가기=기권만).
- 분류: 시험 구멍
- 제안: 공통 "방 사람 관리"(입장·나가기·방장 넘김)로 묶을 때 위 표 시험에 미니게임을 포함.
- 위험: 없음.

### [중간] 시험 도우미가 게임마다 복사돼 있다 (허브 setup 22벌, ws 클라이언트 5벌, 브라우저 머리 5벌)
- 위치: 위 "게임별 시험 도우미 위치" 표 전부.
- 내용: 예) `createHub({ store, rng: seeded(n), now: clock.now, timers: clock, ... })` + `async function login(hub, id)` 가 rooms/roomlist/liar-seam/yacht-seam/gsk-seam/award/stock/wallet/cap-server 에 같은 모양으로 반복. 실제 서버 띄우기도 두 종류(test/e2e/helpers.js:31 은 `server/index.js` 를 자식 프로세스로 spawn, liar/yacht/draw 는 `server/index.js` 의 `startServer` 를 같은 프로세스로 import)에 이름이 둘 다 `startServer`. ws 클라이언트는 e2e/bot.js 가 이미 메시지 도착 때 깨어나는 waitFor 를 갖고 있는데, liar·yacht·draw 는 4ms 폴링 until 을 각자 다시 썼다. 브라우저 쪽은 liar·yacht·draw-round 의 `addInitScript` WebSocket 엿보기 코드가 글자까지 같다(liar-round.mjs:38-50, yacht-round.mjs:43-55, draw-round.mjs:36-50).
- 분류: 중복
- 제안: `test/lib/` 를 만들어
  - `hub.js`: `makeHub(opts)` → `{ hub, clock, store, login(id, extra), drain, tick, until }` (test/admin/helpers.js:29 setupAdmin 의 앞부분이 이미 이 모양이다. setupAdmin 은 이걸 부르게).
  - `fakeHub.js`: 방 단위 가짜 허브 하나(FakeClock, 실제와 같은 guard, send 기록, persist 기록).
  - `ws.js`: Bot 의 일반 부분(connect/login/create/join/leave/start/waitFor/errors/events/state) + 게임별 짧은 함수(`lg(a)`, `yt(a)`, `dr(a)`, `gk(a)`, `mn(a)`). 빠른 시계 서버 `startFast({k, hubOptions})` 는 liar 것을 일반화.
  - `browser.js`: `requireDist()`, `launch()`, `runner()`(check/step/StepFailed/결과 집계·종료 코드), `openPage(browser, url, {viewport, query, spy:['coin','room','drSt']})`, `occlusion(page, state, skip)`(smoke.mjs:56 판).
- 위험: liar/e2e/helpers.js 머리말 "이름과 모양을 바꾸지 않는다"(:6) + 라이어 복사본 제약 → 라이어 도우미는 그대로 두고 새 lib 가 감싸는 방식. 한 판 스모크는 각자 시간 상수(T=5000/8000/10000)가 달라 인자로 받아야 한다.

### [중간] 수동 하네스 19개가 어떤 명령에서도 돌지 않는다
- 위치: test/liar/ui/{audio,emote,ending,firstsays,hud,index,rank,result,role,rules,scene,settings,unmask,vote}/run.mjs, test/yacht/ui/{board,result,roll,scene,sheet}/run.mjs (+ 각 harness.html, fixtures.js). package.json:10-18 어디에도 없음.
- 내용: 문서상 과제 완료 증거로만 쓰였다(docs/liar/CONTRACTS.md:52-58, docs/YACHT-PLAN.md:262,281,309,326, docs/LIAR-MOVE.md:139). 지금은 아무도 돌리지 않아 import 경로는 살아 있지만(전부 해석됨 확인) 단언이 지금 화면과 맞는지는 모른다. 공통화로 liar/yacht 화면 모듈의 모양(예: 이모티콘·상단 줄)을 바꾸면 이 하네스들은 조용히 썩는다. 갱식마인드·갱스껄은 같은 목적을 `*.pure.test.js`(check 에서 돎)로 해결했다.
- 분류: 불필요(실행 안 됨) / 불일치
- 제안: (다) 사용자에게 물을 것 — 하네스를 `npm run test:harness` 로 묶어 npm test 에 넣을지, 아니면 지울지. 라이어 것은 복사본 제약이 있어 지우려면 총괄 결정.
- 위험: npm test 에 넣으면 vite 서버를 19번 띄워 시간이 늘어난다.

### [중간] `npm test` 는 빌드를 하지 않아 옛 dist/ 로 화면 한 판을 시험할 수 있고, smoke.mjs 도 빠져 있다
- 위치: package.json:12 `"test": "node --test ... && node test/ui/liar-round.mjs && ..."`, :17 posttest. test/ui/*-round.mjs:13 은 dist/index.html 이 "있는지"만 본다.
- 내용: CLAUDE.md 는 `npm test` 를 "전체"·"main 배포 직전" 명령이라고 하지만 (1) `npm run build` 가 없어 마지막 빌드 이후 바뀐 화면은 한 판 스모크가 보지 못한다, (2) 클릭 스모크(smoke.mjs)는 test 에 없다(check 에만). 배포 직전 check 를 먼저 돌리는 습관이면 문제없지만 명령 이름만 보면 오해한다.
- 분류: 설정 구멍
- 제안: `"pretest": "npm run build"` 를 두거나 README·CLAUDE.md 에 "npm test 전에 npm run check" 를 명시.
- 위험: pretest 를 두면 test:unit 처럼 빠른 실행이 느려지지 않도록 test 에만.

### [중간] CSS 접두사 검사가 로비·채팅·이모티콘·라이어·요트에만 있다
- 위치: test/css.test.js:77-106(PREFIX_RULES 3개), :146-160(lg-, yt-)
- 내용: CLAUDE.md 는 갱식마인드 `.dr-`, 갱스껄 `.gk-`, 미니 `.mn-`, 코인 `.cn- .gc- .sh- .pn- .lk- .tfx- .cp-`, 관리자 `.adm-` 를 약속하지만 검사가 없다. "같은 클래스를 두 파일에 정의하지 않는다"(:135)는 전체를 보므로 충돌은 잡힌다. 공통 모듈(예: 공통 상단 줄·대기실)을 만들면 새 접두사를 이 표에 넣어야 한다.
- 분류: 시험 구멍
- 제안: client/src/<모듈>/ 폴더 → 접두사 표 하나로 일반화(liar/yacht 처럼 폴더 단위 검사).
- 위험: 지금 규칙을 어긴 클래스가 있으면 바로 실패한다(실행 안 해 봐서 모름).

### [중간] 문서: 갱식마인드 스위치 기본값이 CLAUDE.md 안에서 모순, draw GDD 는 옛값
- 위치: CLAUDE.md:61("`on`(기본 on, …서버 기본값 자체를 on 으로 함)") 과 CLAUDE.md:62("서버 기본값은 그대로 `off`"); docs/draw/GDD.md:495("`off`(기본…)"), :496·:606("render.yaml 은 test"), :605("기본 off"); 실제 server/index.js:140 `draw: ['test','off'].includes(process.env.DRAW) ? process.env.DRAW : 'on'`, render.yaml:18 `"on"`.
- 내용: 실제는 기본 on·render.yaml on. CLAUDE.md:62 와 draw GDD 11절이 틀렸다. 게다가 SPEC 20절(:421)은 "다르면 GDD 가 갱식마인드에 한해 우선"이라 적혀 있어, 규칙대로 읽으면 틀린 GDD(off)가 이긴다. 갱스껄 GDD 는 19절(:299)에 "on, 11절보다 우선"을 덧붙여 해결했지만 draw GDD 에는 그런 절이 없다.
- 분류: 불일치
- 제안: CLAUDE.md:62 삭제, draw GDD 에 gsk GDD 19절 같은 "공개" 결정 절 추가.
- 위험: 없음(문서만).

### [중간] README 가 사실과 다른 곳 여럿
- 위치: README.md:7 "Node.js 20 이상"(package.json:5 engines `>=22`, render.yaml:10 NODE_VERSION 22); :45-46 `test/ui/click.e2e.mjs`(없음, test/ui 에는 smoke·round 5개뿐), "tablet(1024x768)"(smoke.mjs:22-25 는 desktop·phone 둘); :57 GSK "값이 없을 때는 test(render.yaml 도 test)"(실제 server/index.js:139 on, render.yaml:20 on); :34 "약 6분"(CLAUDE.md "약 3분"), npm test 구성에 갱스껄(posttest) 없음; :49-59 환경 변수 표에 `MINI`, `ADMIN_KEY`(server/index.js:142), `COIN_SEED`(:144) 없음; :3 소개가 홀덤·블러핑뿐.
- 분류: 불일치
- 제안: README 테스트·환경 변수 표를 package.json·server/index.js 기준으로 다시 쓴다.
- 위험: 없음.

### [낮음] CLAUDE.md 의 개발 브랜치 이름이 현재와 다르다
- 위치: CLAUDE.md:93 `claude/awesome-tesla-yeb0y1`; 현재 `git branch` 는 `claude/wizardly-maxwell-ksh6e1`(로컬·원격 모두 awesome-tesla 없음). docs/HANDOFF-COIN.md:12, docs/LIAR-MOVE.md:5-6, docs/liar/FIX-IPAD-1.md:3 도 각각 다른 옛 브랜치.
- 분류: 불일치
- 제안: (다) 대화마다 브랜치가 바뀌는 환경이면 CLAUDE.md 에는 "개발 브랜치 = 이 세션의 작업 브랜치(claude/...)"처럼 이름 없이 적을지 사용자에게 확인.
- 위험: 작업자가 없는 브랜치로 푸시 시도.

### [낮음] 옛 계획·인계 문서가 지금 값과 다르게 남아 있다
- 위치: docs/LIAR-MOVE.md:13,77,129(LIAR 기본 off·그 밖 값 off·render.yaml test), docs/YACHT-PLAN.md:361,398(render.yaml test), docs/gsk/GDD.md:240(서버 기본 test — 단 :299 가 덮음), docs/HANDOFF-COIN.md 전체(SHOW_DRAW 숨김·남은 일 목록, 실제 client/src/ui/lobby.js:10 `SHOW_DRAW = true`), docs/coin/wip-card-gacha.patch(1192줄, `git apply --check` 정·역방향 모두 실패 → 지금 코드와 맞지 않는 죽은 패치), docs/REVIEW.md:79(#30 CHAT_LOG 주석 "열림" 이지만 server/rooms.js:40 은 이미 "messages remembered per room"), docs/gsk/GDD.md:79,228(`design/gsk/index.html` 없음, 실제 시안은 design/gsk/canvas/*).
- 분류: 불일치 / 불필요
- 제안: 계획 문서 머리에 "완료·역사 기록, 값은 SPEC·CLAUDE.md 기준" 한 줄을 달거나 docs/archive/ 로 옮긴다. wip 패치는 (다) 사용자에게 버려도 되는지 확인.
- 위험: 라이어 문서(docs/liar/*)는 gamemine 경로(docs/GDD.md, test/smoke-round.mjs 등)를 가리키는데 이는 복사본 제약으로 의도된 것 — 고치지 않는다.

### [낮음] 스위치 "기본값"이 두 층이라 시험 이름과 문서가 반대로 읽힌다
- 위치: server/rooms.js:494 `createHub({ liar='off', yacht='off', draw='off', gsk='off', mini='off' })` vs server/index.js:137-141 전부 `'on'`. 시험 이름 test/yacht-seam.test.js:33 "yacht switch (off by default)", test/gsk-seam.test.js:20 "(off by default)", test/liar-seam.test.js:35.
- 내용: 허브 함수 기본은 off(시험용), 실제 서버 기본은 on. 둘 다 맞지만 문서는 "서버 기본값" 하나만 말한다.
- 분류: 불일치(설명)
- 제안: (가) 공통화 때 스위치 목록을 한 곳(예: shared/modes.js 의 `MODES = [{id, env, default}]`)에 두고 index.js·rooms.js·README 가 같은 표를 쓰게.
- 위험: createHub 기본을 on 으로 바꾸면 "off 일 때 흔적 없음" 시험 다수가 명시 인자를 요구.

### [낮음] Playwright 가 package.json 에 없다
- 위치: package.json:19-24(의존성 pg, ws, three, vite 뿐); test/ui/*.mjs:18-23 `require(process.env.PLAYWRIGHT_MODULE || 'playwright')`.
- 내용: `npm run check` 의 마지막 단계가 Playwright 없으면 바로 죽는다. 새 환경에서 `npm ci` 만으로는 병합 조건을 돌릴 수 없다. (이 환경은 PLAYWRIGHT_MODULE 로 외부 설치본을 쓰는 것으로 보임 — 의도일 수 있음)
- 분류: 설정
- 제안: (다) devDependencies 에 넣을지(Render 빌드 시간 증가) 사용자/총괄 확인. 최소한 README 테스트 표에 적기.

### [낮음] 고정 sleep 에 기대는 시험
- 위치: test/e2e/connection.test.js:73(나간 뒤 300ms 후 계정 칩 확인 — 저장이 늦으면 오탐), :85,:91; test/e2e/rooms.test.js:53,65,69(500~700ms "그동안 안 왔다" 확인); test/e2e/abuse.test.js 다수(40~150ms); test/liar/e2e/start.test.js:32(`await sleep(100)` 로 로그인 완료를 가정, me 를 기다리지 않음); test/ui/smoke.mjs 약 15곳 waitForTimeout(150~1000ms); gsk-round.mjs:130.
- 내용: 대부분 "없어야 함" 확인이라 고정 대기가 불가피하지만, connection:73 과 start.test:32 는 "있어야 함"을 sleep 으로 기다린다. REVIEW.md #19 가 같은 종류(고정 400ms)로 부하 시 오탐을 낸 기록이 있다.
- 분류: 불안정
- 제안: 공용 ws 도우미의 `waitFor` 로 바꾼다(`me` 도착, bank 갱신 `me` 도착).

### [낮음] 약한 단언·남은 찌꺼기
- 위치: test/e2e/rooms.test.js:63 `assert.equal(roomsMsgs(b, nb).filter(() => true).length >= 1, true, ...)` + 주석 "nothing while inside" 는 단언되지 않음, :27·:33 `const n = ...; void n;`; test/mini/room.test.js:152 `assert.equal(b.state.mode, 'mini')` 는 두 번째 판(g)이 아니라 첫 판의 b 를 본다(재접속한 사람이 같은 자리인지는 확인 안 함).
- 분류: 시험 품질
- 제안: 공통화 때 함께 정리(재접속 뒤 `mySeat` 같음 단언 추가).

### [낮음] 커밋된 시안·참고 그림이 87MB
- 위치: design/ (git ls-files 합계 87M; 가장 큰 것 design/gsk/ref/ref-5-bid.png 6.5MB, ref-3-flip 6.5MB, ref-2-turn 6.5MB, shots/pieces.png 6.2MB), docs/coin 1.3MB.
- 내용: 코드·시험은 design/ 을 쓰지 않는다(주석 참조만). scripts/gsk-cut.py·gsk-matback.py 가 design/gsk/ref·shots/mat-back-old 를 입력으로 읽는다. Render 는 배포마다 저장소를 받는다.
- 분류: 불필요(크기)
- 제안: (다) 사용자에게 — 실행에 필요 없는 큰 그림을 저장소 밖(아티팩트 등)으로 옮길지.

### [낮음] 시험 파일이 client 안에 있다
- 위치: client/src/admin/fx.test.js (package.json:12,14 가 `client/src/admin/*.test.js` 를 따로 적음)
- 내용: CLAUDE.md 구역은 관리자 시험을 test/admin/ 로 정했다. 빌드에는 안 들어가지만(아무도 import 안 함) 구역 규칙과 다르다.
- 분류: 불일치
- 제안: test/admin/fx.test.js 로 옮기고 스크립트 줄 정리.

### [낮음] gsk 시험만 별도 node --test 로 돈다
- 위치: package.json:17-18 `posttest`, `posttest:unit`
- 내용: 다른 게임은 메인 glob 에 있고 gsk 만 post 스크립트. 동작은 같지만(check 에도 posttest:unit 으로 포함) 다른 브랜치를 합칠 때 생긴 흔적(docs/HANDOFF-COIN.md:34-38)으로 보인다.
- 분류: 과복잡 (가)
- 제안: `test/gsk/*.test.js` 를 test·test:unit glob 에 넣고 gsk-round 는 test 끝에.

## 공통화 제안

### 하나로 묶을 것 (시험 도우미)
1. `test/lib/hub.js` — FakeClock 허브 + 로그인 + drain/tick/until (22벌 대체, setupAdmin 도 이걸 사용).
2. `test/lib/ws.js` — 실제 서버(같은 프로세스, 빠른 시계 선택) + 이벤트 대기형 클라이언트(e2e/bot.js 일반부 + 게임별 봉투 함수). e2e/helpers.js 의 자식 프로세스 방식은 "환경 변수 해석까지 본다"는 장점이 있어 `spawnServer` 로 이름만 구분해 남긴다.
3. `test/lib/browser.js` — 한 판 스모크 4개 + smoke.mjs 의 공통 머리, 가림 검사, WebSocket 엿보기.
4. `test/lib/fakeHub.js` — 방 단위 가짜 허브(실제와 같은 guard·FakeClock).
5. **공통화 전에 먼저 만들 시험**: 위 보호망 지도의 빈칸을 채우는 "모드 표" 허브 시험 하나(채팅·이모티콘·사진·사운드·나가기·방장 넘김·끊김 60초·재접속 시 chatLog/sndList 순서 × 7개 모드). 이것이 공통화의 안전망이 된다.

### 예외로 남길 것 (근거)
- 라이어 시험·도우미(test/liar/**): CLAUDE.md "복사해 온 라이어 폴더는 gamemine 과 같게 유지", test/liar/e2e/helpers.js:6 "이름과 모양을 바꾸지 않는다". 새 lib 가 감싸기만.
- 라이어 채팅 잠금(첫 설명·변론), 갱식마인드 그리는 사람 채팅 금지·정답 숨김·채팅 1~40자(draw/game.test.js:783-842)는 규칙상 다른 동작(docs/liar/GDD.md, docs/draw/GDD.md 10절) — 모드 표 시험에서 "막혀야 함" 칸으로 둔다.

### 사용자에게 물을 것
- 수동 하네스 19개(test/liar/ui, test/yacht/ui)를 자동 시험에 넣을지, 지울지.
- `npm test` 를 빌드+smoke 까지 포함한 "진짜 전체"로 바꿀지.
- 개발 브랜치 이름을 CLAUDE.md 에 고정해 둘지.
- docs/coin/wip-card-gacha.patch, docs/HANDOFF-COIN.md, 옛 계획 문서(LIAR-MOVE, YACHT-PLAN)를 보관 폴더로 옮길지.
- design/ 의 큰 그림(87MB)을 저장소에 둘지.
- Playwright 를 package.json 에 넣을지.
- 방장 위임(수동)은 어느 게임에도 없다 — 공통화 목록에 "방장 설정/위임"이 있다면 새 기능인지 확인.

## 버린 후보
- 단언 없는 시험: 자동 검사에서 13개가 걸렸지만 전부 도우미 함수(okOf/badOf/same) 안에서 단언함 — 문제 아님.
- skip/only/todo: 없음(test/admin/yacht.test.js:112 의 `.skip(` 은 게임 함수 이름).
- 안 쓰는 의존성: pg(server/store.js), ws(server·test), three(client 24곳), vite(빌드·하네스) 모두 사용.
- 하네스 import 경로: 전부 해석됨(test/yacht/ui/roll/run.mjs:37 의 './dice3d.js' 는 정규식 문자열).
- FAST_TIMERS 이름(test/e2e/helpers.js:10-21): server/index.js:126-129 가 전부 읽음.
- test/yacht/room.test.js 가 shared/yacht/sim.js 로 기대값을 만드는 것: 화면·서버가 같은 시뮬레이터를 쓰는 설계(GDD) 확인용이라 "구현 베끼기" 아님.
- 옛 시간제한 시험(test/e2e/timeouts.test.js): "시간제한 없음"을 확인하는 현행 시험.
- docs/liar/* 의 gamemine 경로 참조: 복사본 제약으로 의도됨.
- scripts/soak.js·sample-words.mjs·gsk-*.py: 수동 도구로 머리말에 사용법이 있음, 문제 아님(soak 은 홀덤·블러핑만 지원).
- client/src/mock.js: 포커 전용 수동 확인용(main.js:610), 시험에서 안 씀 — CLAUDE.md 도 완료 판정으로 인정하지 않음.
- .claude/: 스킬 하나뿐, settings 없음.
