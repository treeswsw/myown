# 라이어게임 옮겨 넣기 계획 (PLAN 단계 3)

작성: 기획 총괄(Fable), 2026-11-12. 사용자 승인: "ㄱㄱ"(만들기·시험까지. **main 배포는 따로 다시 묻는다**).

- 원본: `/home/user/gamemine` 브랜치 `claude/busy-gates-oqcqtn` @ `3dca0fa` (읽기만 한다. 고치지 않는다)
- 대상: `/home/user/myown` 브랜치 `claude/agent-team-dev-mdhsjm` @ `1b9da83` (= main)
- 근거 문서: gamemine `docs/PLAN.md` 1-3~1-6, 3-3, 단계 3 / `docs/team/CONTRACTS.md` / 규칙은 `docs/GDD.md`(옮긴 뒤 `docs/liar/GDD.md`)
- 이 문서가 PLAN 3-3(C1~C7)을 대신한다. 다른 곳과 다르면 이 문서가 우선이다.

## 0. 원칙

1. **포커가 한 글자도 달라지지 않는다**(딱 하나 예외: 채팅 `*` 크기 표시 — 사용자 요청으로 포커 방에도 적용).
   `LIAR=off`(기본)면 화면도 서버도 지금과 똑같아야 한다. 기존 포커 시험은 **고치지 않고** 그대로 통과해야 한다.
2. 라이어 폴더 4개는 **그대로 복사**한다. 복사한 파일은 "host 를 가리키는 경로" 말고는 고치지 않는다.
   옮기다 라이어 모듈 안의 버그를 찾으면 고치지 말고 보고한다(총괄이 정한다).
3. host/ (임시 진행자)는 옮기지 않는다. 필요한 부분만 아래 이음매로 myown 파일에 넣는다.
4. 작업자는 자기 워크트리의 자기 브랜치에 커밋만 한다. **푸시 금지.** gamemine 과 myown 본 폴더는 건드리지 않는다.
5. 새 DB 표 없음. `users.stats` 안에 `liar` 칸만 생긴다. 포커 칩·전적은 건드리지 않는다.

## 1. 그대로 복사하는 것 (M1)

| gamemine | myown | 비고 |
|---|---|---|
| `shared/liar/` (4개) | 같은 경로 | 그대로 |
| `server/liar/` (room, perms, scores, words.json) | 같은 경로 | 그대로 |
| `client/src/liar/` (index, liar.css, audio, pure, ui/, scene/, anim/) | 같은 경로 | 그대로 |
| `test/liar/*.test.js`, `test/liar/ui/` | 같은 경로 | 그대로(전부 host 를 안 쓴다) |
| `test/liar/e2e/` | 같은 경로 | 복사는 M1, **경로 고침은 M2**(`helpers.js`, `start.test.js` 두 파일만 host 를 가리킨다) |
| `scripts/build-words.mjs`, `sample-words.mjs` | `scripts/` | 읽는 문서 경로만 `docs/liar/`로 |
| `docs/GDD.md`, `WORDS.md`, `WORDS-STAR.md`, `team/CONTRACTS.md` | `docs/liar/` | 참고 문서 |
| `host/client/src/ui/chatSize.js`, `host/test/chat.test.js` | `client/src/ui/chatSize.js`, `test/chatsize.test.js` | M4 |
| `host/test/smoke-round.mjs` | `test/ui/liar-round.mjs` | M6 (창 3개 한 판, 약 90초) |
| `host/test/server.test.js` 중 이음매 시험 | `test/liar-seam.test.js` (새 파일) | M2 |

옮기지 않는 것: `host/` 나머지, `design/`, gamemine 의 PLAN·OVERVIEW·REF-SCX·USER-ANSWERS·SYNC·BOARD·REVIEW.

## 2. 통신 약속 (M1 이 SPEC 7절 끝에 그대로 붙인다)

화면 → 서버
- `{t:'create', mode:'liar'}` — 라이어 방 만들기. `LIAR=off`면 `'라이어게임은 아직 열리지 않았습니다.'`
- `{t:'lg', a: 글자 1~20자, ...}` — 라이어 전용 요청 전부. 봉투만 protocol.js 가 보고 속은 방(`shared/liar/protocol.js`)이 검사한다.
  포커 방에서 보내면 `'알 수 없는 요청입니다.'`
- `{t:'lg', a:'rank'}` — 방 안팎 어디서나. 서버(hub)가 직접 `lgRank`로 답하고 방에 넘기지 않는다. `LIAR=off`면 거절.
- 라이어 방에서 `mode`·`act`·`play`·`liar`(블러핑) → `'지금은 할 수 없습니다.'` (오류로 죽지 않는다)
- 포커 방에서 `{t:'mode', mode:'liar'}` → `'라이어게임은 방을 새로 만들어 주세요.'`

서버 → 화면
- `{t:'me', user, liar:'off'|'test'|'on'}` — **`me`에 `liar` 칸 하나 추가**(새 메시지 종류 없음). 버튼 보이기 판단에 쓴다.
- `{t:'lgRank', top:[{name, score, games}], mine:{rank|null, score}}` — 누적 1점 이상 상위 20명. 사진 없음.
- `{t:'rooms', list}`의 항목에 `mode:'liar'`, `max:8`.
- `{t:'room', state}`에서 `state.mode==='liar'`이면 모양은 GDD 9-3(사진 없음). 알림 `event.e`는 GDD 9-4(`faces` 등).

버튼 보이기(화면): `보임 = liar==='on' || (liar==='test' && 주소에 ?liar=1)`. `test`는 "숨김"이지 "잠금"이 아니다(주소를 아는 사람은 만들 수 있다).

## 3. myown 에서 바뀌는 이음매

### 3-1. 서버 (M2) — `server/protocol.js`, `rooms.js`, `store.js`, `index.js`

- **protocol.js**: `create`는 `holdem|bluff|liar` 허용, `mode`는 받되 rooms 가 거절(위 문구). `case 'lg'` 추가(host 것 그대로: `a`가 1~20자 글자면 `good(m)`).
- **rooms.js**
  - `createHub({..., liar = 'off'})` → `hub.liar`. `sendMe`가 `liar: hub.liar`를 붙인다.
  - `MAX_PLAYERS`에 `liar: 8`(방 목록의 `max`용. 정원 검사는 라이어 방이 스스로 한다).
  - `create`: `mode==='liar'`이면 `hub.liar==='off'` 거절, 아니면 `createLiarRoom(hub, newCode(hub))`. 칩 0이어도 만들 수 있다.
  - `dispatch` 맨 앞(로그인 확인 뒤): `lg`+`rank` → `await hub.store.topLiar(20)`, `await hub.store.liarRank(id)` → `lgRank`.
    조회가 실패하면 그 사람에게만 `'랭킹을 불러오지 못했습니다.'`
  - `avatar`: `room?.push()` → `room.faceChanged ? room.faceChanged(session) : room.push()` (방이 있을 때).
  - `emote|pemote|snd|sndAdd`를 방에 넘기기 전: `const why = room.mediaBlocked?.(session, msg.t); if (why) return why;`
  - `case 'lg': return room.lg ? room.lg(session, msg) : '알 수 없는 요청입니다.'`
  - `mode|act|play|liar`: 방에 그 함수가 없으면(`room.setMode` 등) `'지금은 할 수 없습니다.'`
  - `hub.close()`: 타이머를 지우기 전에 모든 방에 `room.flush?.()`(try/catch). **`hub.resetting`일 때는 flush 하지 않는다**(초기화는 다 지우는 것).
  - 라이어 방이 쓰는 hub 항목은 전부 이미 있다(확인함): `send sendMe persist timers guard now rng timing.grace timing.roomGc roomsChanged sendRooms sessions rooms`. hub 의 다른 것은 바꾸지 않는다.
- **store.js**: `newUser`는 **바꾸지 않는다**(기존 시험·기존 줄 보호. `stats.liar`가 없으면 방이 0으로 만들어 쓴다).
  두 저장소 모두에 `topLiar(n)`, `liarRank(id)` 추가. 순서: 점수 큰 순 → 판 수 적은 순 → 이름 순. 0점은 목록에서 뺀다.
  `liarRank` = `{rank: 그 순서에서 몇 번째(0점이면 null), score}`. 메모리 저장소는 host 것 그대로.
  Postgres: `stats->'liar'->>'score'`를 정수로 읽는 **읽기 전용** 조회(`COALESCE(...,0)`, 이름은 `COLLATE "C"`, `row_number()`),
  대기 중인 저장(`writes`) 뒤에 실행. 표·열을 만들거나 바꾸지 않는다.
- **index.js**: `LIAR` 환경 변수(`off` 기본 / `test` / `on`, 그 밖의 값은 `off`)를 `hubOptions.liar`로. 끌 때(SIGTERM)는 지금 순서 그대로
  `app.close()`(안에서 `hub.close()` → flush) → `store.close()`(저장이 끝나길 기다림). 누적 점수가 DB에 남는지 시험으로 확인.

### 3-2. 로비 (M3) — `client/src/ui/lobby.js`, `lobby.css`

- `createLobby({..., onRank})`, 새 함수 `setLiar(보임)`, `showRank({top, mine})`.
- `setLiar(true)` 전에는 **지금과 완전히 같다**(게임 고르기 2칸, 기본 홀덤, 랭킹 버튼 없음, 방 목록에서 라이어 방 숨김).
- `setLiar(true)`: 방 만들기의 게임 고르기에 "라이어게임"(설명 `3~8명 · 말로 하는 추리`, 3칸 미끄럼 표시), 방 목록에 "라이어게임" 방 표시,
  로비 첫 화면에 "라이어 랭킹" 버튼 → `onRank()`. `showRank`는 `.lb-` 창으로 20줄 + 내 순위 줄(같은 점수는 같은 순위 —
  `client/src/liar/ui/rank.js`의 순수 함수 `rankLines`를 가져다 써도 된다. CSS 는 가져오지 않는다).
- **방 대기 화면의 게임 바꾸기는 홀덤·블러핑 2칸 그대로.** 라이어 방에서는 로비가 뜨지 않는다(main.js 가 숨긴다. 방 대기·설정은 라이어 모듈이 그린다).
- 이름은 `textContent`로만.

### 3-3. 채팅 (M4) — `client/src/ui/chat.js`, `chat.css`, `chatSize.js`(새), `test/chatsize.test.js`(새)

- host 복사본과의 차이를 그대로 옮긴다: `setLock(잠금, 문구)` 추가, 글 앞 `*`/`**`/`***` 크기(`**` = 지금의 `#`. **`#` 동작은 그대로**),
  `.chat-w.s1`, `.chat-w.s3` 두 줄 + 좁은 화면 한 줄. 그 밖의 chat.js 는 건드리지 않는다.
- 포커 방에도 적용된다(사이트 공통). `s1`, `s3`는 css.test.js 허용 목록에 M1 이 미리 넣는다.

### 3-4. 3D 판 (M5) — `client/src/scene/stage.js` 만

- 돌려주는 것에 `nogl`(참/거짓), `use(scene, camera)` 추가.
- `use(장면, 카메라)` 중: 그 장면·카메라를 `renderer.render`로 직접 그린다(포커 합성기·블룸은 쓰지 않는다). `use(null)`이면 지금 그대로.
  `scene`, `camera`, `project`, `shake`, `pushIn`, `onFrame`, 성능 조절은 그대로(포커 것). `?nogl=1`이면 `use`는 값만 기억한다.
- 라이어 장면이 시안과 같은 색으로 나오도록 `test/liar/ui/scene/`(시험 페이지)이 렌더러에 주는 설정(톤 매핑·색 공간·그림자)을 확인해,
  다르면 `use` 중에만 그 값으로 바꾸고 `use(null)`에서 되돌린다. 화면 비율은 라이어 모듈이 스스로 맞춘다(`scene.resize`).

### 3-5. 통합 (M6) — `client/src/main.js`, `style.css`, `test/ui/smoke.mjs`, `test/ui/liar-round.mjs`, `package.json`, `client/vite.config.js`, `render.yaml`, `CLAUDE.md`, `README.md`, `docs/SPEC.md`

main.js (host/client/src/main.js 가 본보기. 그 연결을 그대로 옮긴다)
- `me`: `lobby.setLiar(보임)`(2절 규칙).
- `room`/`applyRoom`: `room.mode==='liar'`이면 포커 것을 전부 비우고(`table.reset`, pins 숨김, `hud.update(null)`, cluster·wheel·bluff 비움) `lobby.hide()`,
  라이어 상단 줄을 보이고, 처음이면 `import('./liar/index.js')` → `mountLiar({ui, stage, send, getMe, chat, toast, emotePanel})`.
  불러오는 동안 온 메시지는 순서대로 줄 세운다(host 의 `liarQ`·`withLiar` 그대로. 재접속 때 두 번 붙지 않게).
  라이어 방은 `animator.busy()`를 보지 않고 바로 적용한다. 방을 나가거나 포커 방이면 `liar.applyRoom(null)`(→ `stage.use(null)`).
- 채팅: `onSend: (text) => send(liar && 라이어 방 ? liar.chatMsg(text) : {t:'chat', text})`. `chat.setMode`는 host 와 같게.
- 알림: 라이어 방에서는 `chat`·`chatLog`를 채팅에 넣은 **뒤** `liar.handleEvent`에도, `emote`는 pins 가 아니라 `liar.handleEvent`로,
  사진·사운드 알림은 지금처럼 emotePanel 로, 나머지 전부 `liar.handleEvent`(절대 `animator.push` 하지 않는다).
- `lgRank`: 라이어가 붙어 있고 방 안이면 `liar.handleEvent({k:'lgRank', top, mine})`, 아니면 `lobby.showRank(...)`.
- 머리 위 좌표: emotePanel·chat 의 `getAnchor` = 라이어 방이면 `liar.anchorOf(id)`, 아니면 `pins.anchor(id)`.
- 매 프레임: `liar?.frame(dt / 1000)` (**myown 의 `onFrame`은 밀리초, 라이어는 초**).
- 라이어 상단 줄(전역 클래스, style.css 에만. 예: `.lgbar`): 방 코드, 이모티콘(패널 열기), 시작(방장 + 방 대기일 때만), 나가기.
  **host 의 `.hb-bar`와 같은 높이·자리로** 만든다(점검 ①: 라이어 CSS 의 54px·100px 자리가 그대로 맞는다). 포커 hud.js 는 고치지 않는다.
- 오류 문구: 라이어 방에서는 항상 `toast`.
- `resetDone`: 라이어도 `applyRoom(null)`.

smoke.mjs: 서버를 `LIAR: 'on'`으로 띄우고 기존 포커 줄은 그대로 둔 채 뒤에 추가 — 라이어 고르기 → 방 만들기 → 봇 2명 참가 → 설정 한 번 →
시작 → 역할 카드 → 채팅 칸으로 첫 설명 → 채팅 잠금 문구 확인 → 이모티콘 한 번 → 나가기 → 로비의 랭킹 버튼 → 창 닫기 → 그 뒤 포커 방 만들기가 여전히 됨.
`LIAR` 없이 띄운 경우 한 번: 라이어 칸·랭킹 버튼이 없음. `?liar=1` + `LIAR=test`: 보임.

package.json: `test`에 `test/liar/*.test.js test/liar/e2e/*.test.js`와 `node test/ui/liar-round.mjs`, `test:unit`에 `test/liar/*.test.js`,
`words` 스크립트, `engines.node >=22`(M1·M2 가 넣은 것을 마무리). vite 개발 서버가 `shared/`를 막으면 `server.fs.allow: ['..']`.
render.yaml: `LIAR` 키 추가(값 `test`). CLAUDE.md: 구역에 "라이어"(gamemine CLAUDE.md 의 구역·게임 약속·CSS 접두사 요약)와 `LIAR` 스위치.
SPEC 18절 "라이어게임": 규칙은 `docs/liar/GDD.md`를 따른다 + 이 문서 2·3절 요약.

## 4. 점검 목록 (PLAN v0.12)

| # | 항목 | 누가 | 처리 |
|---|---|---|---|
| ① | 상단 줄 높이에 맞춘 자리 3곳(내 제시어 54px, 이름 목록 100px, 이 판 끝내기) | M6 | 상단 줄을 host 와 같은 높이로 만들어 라이어 CSS 는 안 고친다. 844×390 캡처로 안 겹치는지 확인 |
| ② | 판 끝내기 알림을 myown 채팅 알림 줄 모양으로 | — | myown 채팅에 알림 줄이 없다. 방장 이름의 채팅 한 줄 그대로(바꾸지 않음) |
| ③ | 로비 전체 랭킹 버튼 | M3·M6 | 3-2, 3-5 |
| ④ | 옮기기 직전 모듈 화면 시험 한 번 | 관리자(발송 전, gamemine) + M1(복사 뒤, myown) | `for d in test/liar/ui/*/; do node $d/run.mjs; done` |
| ⑤ | v0.12-1(누적 장부) 고침 포함 여부 | 관리자 | 원본이 `3dca0fa`인지 확인(그 커밋이 v0.12-1) |
| ⑥ | 실제 DB(Neon)에서 누적 점수·랭킹 저장 | 사용자 실기기 확인 때 | 이 환경에는 Postgres 가 없다 → 랭킹 조회문은 **미확인**. `LIAR=test` 배포 뒤 한 판 → 랭킹 창 → 재접속 뒤에도 남는지 |

## 5. 위험 (큰 것부터)

1. **포커가 깨짐** — rooms.js·main.js 는 포커의 심장이다. 막는 법: 기존 포커 시험·스모크 줄을 고치지 않고 통과, `LIAR=off` 스모크, Opus 가 두 파일의 변경을 줄 단위로 본다.
2. **3D 를 진짜 렌더러로 그려 본 적이 없다** — 임시 진행자는 아무것도 그리지 않았다. `stage.use`로 처음 그린다(색·그림자·성능·포커 장면으로 되돌아오기). 이 환경은 GPU 가 없어 **실기기 확인 전까지 미확인**. `?nogl=1`로는 끝까지 된다.
3. **Postgres 랭킹 조회문 미확인**(점검 ⑥). 읽기 전용이라 포커 자료는 안전하고, 실패해도 그 사람에게 문구만 뜬다.
4. **끌 때 점수 저장** — Render 가 SIGTERM 뒤 기다려 주는 시간 안에 flush + 저장이 끝나야 한다. 시험으로 순서를 확인하되 실제 배포에서는 미확인.
5. **포커에도 보이는 변화 2가지**: 채팅 `*` 크기 표시, (LIAR=on 뒤) 로비의 라이어 칸·랭킹 버튼. 배포 물을 때 사용자에게 같이 알린다.
6. **무료 서버 512MB** — 라이어 방 상태에 사진 없음(leaks·room 시험이 지킨다). 사운드 제한은 포커와 같다.
7. **채팅 자리** — 라이어 방 대기에서 로비가 숨겨진 채 `chat.setMode('lobby')`가 어떻게 보이는지 host 와 다를 수 있다. M6 이 캡처로 확인.
8. **두 번 붙기·남은 장면** — 재접속·방 옮기기(라이어 → 포커)에서 라이어 화면이 남거나 두 번 붙는 것. smoke 에 "라이어 나간 뒤 포커 방" 한 줄.
9. myown 에 다른 워크트리가 하나 남아 있다(`.claude/worktrees/agent-a106…` @ 22e0327). 진행 중인 포커 작업이면 먼저 병합하고 시작한다.

## 6. 과제와 순서

```
M1 (혼자 먼저) → 병합 → [M2 서버 | M3 로비 | M4 채팅 | M5 3D 판] 동시 → 병합 → M6 통합(혼자) → M7 실행 시험(다른 Sonnet) → Opus 검토 1번 → Fable 최종 확인
```

파일이 겹치지 않는다: M2 = server/4개 + test/liar/e2e/ + test/liar-seam.test.js + package.json(시험 경로 한 줄. 물결 안에서 M2 만),
M3 = lobby.js·lobby.css, M4 = chat.js·chat.css·chatSize.js·test/chatsize.test.js, M5 = scene/stage.js.
`test/ui/smoke.mjs`·`main.js`·`style.css`는 M6 만, `test/css.test.js`는 M1 만 고친다.

모든 과제 공통(지시문 끝에 붙인다):
> 먼저 `docs/LIAR-MOVE.md` 0절과 네 과제 절만 읽는다. myown 의 네 워크트리 안에서만 일하고 자기 브랜치에 커밋만 한다. **푸시·병합 금지.**
> `/home/user/gamemine`은 읽기만. 네 파일 목록 밖은 고치지 않는다(필요하면 멈추고 보고). 기존 포커 시험 파일과 smoke 의 기존 줄은 고치지 않는다.
> 끝났다는 증거: `npm run check` 통과 출력 끝부분 + 아래 과제별 증거. 보고는 한국어 15줄 이내(바꾼 파일, 시험 결과 숫자, 미확인, 발견한 문제).
> Playwright 는 `PLAYWRIGHT_MODULE` 환경 변수로 찾는다(관리자가 경로를 준다).

### M1 — 폴더 복사와 시험 연결 (Sonnet, 혼자 먼저)
> 무엇: gamemine `3dca0fa`의 라이어 폴더를 myown 에 그대로 복사한다(LIAR-MOVE 1절 표의 M1 몫).
> 파일: `shared/liar/**`, `server/liar/**`, `client/src/liar/**`, `test/liar/**`, `scripts/build-words.mjs`, `scripts/sample-words.mjs`, `docs/liar/*`(GDD, WORDS, WORDS-STAR, CONTRACTS),
> `test/css.test.js`, `package.json`, `docs/SPEC.md`(7절 끝에 LIAR-MOVE 2절을 그대로 붙이기만).
> 할 일: ① `cp -r`로 복사(내용을 고치지 않는다. `diff -r`로 같음을 확인). ② 스크립트의 문서 경로만 `docs/liar/`로 바꾸고 `node scripts/build-words.mjs` 결과가 복사한 words.json 과 같은지 확인.
> ③ `test/css.test.js`: `client/src/liar/` 아래 CSS 는 전부 `lg-`로 시작해야 한다는 규칙 추가(host/test/css.test.js 의 liar 규칙을 옮긴다), chat.css 허용 목록에 `s1`, `s3` 추가. 기존 규칙은 그대로.
> ④ `package.json`: `test:unit`과 `test`에 `test/liar/*.test.js` 추가, `words` 스크립트, `engines.node >=22`. (e2e 경로는 M2 가 넣는다)
> ⑤ 모듈 화면 시험 13개(`test/liar/ui/*/run.mjs`)를 myown 에서 한 번씩 돌린다.
> 하지 말 것: `test/liar/e2e/` 고치기, host/ 복사, main.js 연결, 라이어 코드 고치기.
> 증거: `diff -r` 결과, `node --test test/liar/*.test.js` 통과 수, 화면 시험 13개 결과, `npm run check` 통과, 포커 `npm test` 통과.

### M2 — 서버 이음매 (Sonnet)
> 무엇: LIAR-MOVE 2절·3-1절 그대로. 본보기는 gamemine `host/server/rooms.js`·`protocol.js`·`store.js`·`index.js`(myown 것을 복사해 포커를 뺀 것이라 차이가 곧 할 일이다).
> 파일: `server/protocol.js`, `server/rooms.js`, `server/store.js`, `server/index.js`, `test/liar/e2e/helpers.js`, `test/liar/e2e/start.test.js`(host 경로를 `server/`로, 서버를 `liar:'on'`으로 띄우기만),
> `test/liar-seam.test.js`(새 파일), `package.json`(`test`·`test:e2e`에 `test/liar/e2e/*.test.js` 한 줄).
> 시험(`test/liar-seam.test.js`, gamemine `host/test/server.test.js`에서 옮길 것 + 새 것): `LIAR=off`에서 라이어 방 만들기·rank 거절, `test`·`on`에서 됨, `me`에 `liar` 칸,
> 라이어 방 정원 8·방 목록 `max:8`, 라이어 방에서 `mode|act|play|liar`가 문구로 거절(서버 오류 아님), 포커 방에서 `lg` 거절·`mode:'liar'` 거절,
> `mediaBlocked`가 막으면 방에 안 넘어감(포커 방은 그대로), `avatar` → 라이어 방은 `faces` 알림·포커 방은 지금 그대로, `lgRank` 순서(점수 → 판 수 → 이름, 0점 제외, 내 순위 null),
> 끌 때 flush 로 누적 점수가 저장소에 남음, 초기화(`reset`) 때는 flush 하지 않음, 라이어 방 타이머 오류가 포커 방을 끊지 않음, 기존 줄에 `stats.liar`가 없어도 됨.
> 하지 말 것: `newUser` 바꾸기, 표·열 만들기, hub 의 기존 함수 모양 바꾸기, 기존 포커 시험 고치기, `shared/liar`·`server/liar` 고치기.
> 미확인으로 보고: Postgres 조회문(이 환경에 DB 없음) — 조회문 전문을 보고에 붙인다.
> 증거: `npm run check`, **`npm test` 전체**(포커 전부 + 라이어 단위 + 라이어 e2e 7개) 통과 수와 걸린 시간.

### M3 — 로비 (Sonnet)
> 무엇: LIAR-MOVE 3-2절 그대로. 파일: `client/src/ui/lobby.js`, `client/src/ui/lobby.css` 만.
> 약속: `createLobby({..., onRank})`, `setLiar(보임)`, `showRank({top:[{name,score,games}], mine:{rank|null, score}})`. `setLiar(true)`가 불리기 전에는 화면이 지금과 완전히 같아야 한다.
> 클래스는 `.lb-`만. `zoom` 금지. 이름은 `textContent`.
> 하지 말 것: main.js·smoke.mjs 고치기(M6 이 연결한다), 방 대기 화면의 게임 바꾸기에 라이어 넣기.
> 증거: `npm run check`(기존 스모크가 로비 그대로임을 증명) + 임시 Playwright 스크립트(커밋하지 않는다)로 `?nogl=1`에서 `setLiar(true)` 뒤 3칸·랭킹 버튼·`showRank` 20줄/0줄/내 순위 없음, 844×390 캡처 경로.

### M4 — 채팅 (Sonnet)
> 무엇: LIAR-MOVE 3-3절 그대로. `diff /home/user/myown/client/src/ui/chat.js /home/user/gamemine/host/client/src/ui/chat.js`(chat.css 도)의 차이를 그대로 옮긴다.
> 파일: `client/src/ui/chat.js`, `client/src/ui/chat.css`, `client/src/ui/chatSize.js`(복사), `test/chatsize.test.js`(gamemine `host/test/chat.test.js`를 경로만 고쳐 복사).
> 하지 말 것: `#` 동작 바꾸기, 그 밖의 chat.js 손대기, `test/chat.test.js`(서버 채팅 시험) 고치기.
> 증거: `npm run check`(기존 스모크의 채팅 줄 통과), `node --test test/chatsize.test.js`, `#안녕`이 지금과 같은 클래스로 뜨는 것과 `setLock(true,'문구')` 뒤 입력 칸 잠김·문구, `setLock(false)` 뒤 복구를 임시 스크립트로 확인.

### M5 — 3D 판 `stage.use` (Sonnet)
> 무엇: LIAR-MOVE 3-4절 그대로. 파일: `client/src/scene/stage.js` 만.
> 증거: `npm run check`(포커 스모크 그대로), `?nogl=1`에서 `use(a, b)` → `use(null)` 뒤 오류 없음을 임시 스크립트로. 실제 그림(색·그림자·블룸 없는 모습·성능)은 **미확인**으로 보고.
> 하지 말 것: 포커 장면·카메라·합성기 설정 바꾸기, 라이어 장면 파일 고치기.

### M6 — 통합 (Sonnet, M2~M5 병합 뒤 혼자)
> 무엇: LIAR-MOVE 3-5절 그대로. 본보기는 gamemine `host/client/src/main.js`, `host/test/smoke.mjs`, `host/test/smoke-round.mjs`.
> 파일: `client/src/main.js`, `client/src/style.css`, `test/ui/smoke.mjs`, `test/ui/liar-round.mjs`(새), `package.json`, `client/vite.config.js`(필요할 때만), `render.yaml`, `CLAUDE.md`, `README.md`, `docs/SPEC.md`(18절).
> 하지 말 것: hud.js·pins.js·lobby.js·chat.js·stage.js·라이어 폴더 고치기(모자라면 멈추고 보고), 포커 분기의 순서·동작 바꾸기.
> 증거: `npm run check`, **`npm test` 전체**, `node test/ui/liar-round.mjs`(창 3개 한 판) 출력, smoke 의 새 줄 목록, 844×390 `?nogl=1` 캡처 4장(라이어 방 대기, 첫 설명 중, 투표, 결과 — 상단 줄과 안 겹침),
> `LIAR` 없이 띄운 화면 캡처(지금과 같음), 빌드 결과에서 라이어 코드가 따로 떨어진 묶음(chunk)인지(포커만 하는 사람이 안 받는지).
> 미확인으로 보고: 3D 모양·연출·소리·iPad/Safari·가로 폰 키보드.

### M7 — 실행 시험 (M6 과 다른 Sonnet. 코드를 고치지 않는다)
> 실제 서버(`LIAR=on`, 메모리 저장) + 빌드된 화면 `?nogl=1` + 창 3~4개로: ① 라이어 한 판 끝까지(다른 제시어 방식) + 다음 판 ② 라이어 알림 방식 한 판 ③ 한 명 끊김 → 60초 안 재접속
> ④ 라이어 방에서 나와 홀덤 한 판·블러핑 한 판(포커가 그대로인지) ⑤ 포커 방에서 `*크게`·`#크게` 채팅 ⑥ 랭킹 창(방 안·로비) ⑦ `LIAR=off`로 다시 띄워 라이어 흔적이 없는지
> ⑧ `LIAR=test`: 주소에 `?liar=1`이 있을 때만 보이는지 ⑨ 서버에 SIGTERM → 다시 띄운 뒤… (메모리 저장이라 남지 않음 — 대신 서버 기록에 flush 가 찍혔는지).
> 증거: 단계별 캡처 경로, 서버 기록, 콘솔 오류 0. 이상한 점은 고치지 말고 적는다.

## 7. 배포 전 마지막 확인 (총괄·관리자. 이것이 끝나야 사용자에게 "올려도 되나요"를 묻는다)

1. 개발 브랜치에서 `npm run check`, `npm test` 전체(포커 + 라이어 + liar-round) 통과. 기존 포커 시험 파일이 **바뀌지 않았는지** `git diff 1b9da83 -- test/*.test.js test/e2e`로 확인(허용: css.test.js 뿐).
2. `git diff 1b9da83 -- server/rooms.js client/src/main.js`를 줄 단위로 읽는다(Opus 검토 + 총괄). 포커 분기에 뜻이 바뀐 줄이 없어야 한다.
3. 복사 폴더가 원본과 같은지 `diff -r`(허용: e2e 의 두 파일, 스크립트 경로).
4. `LIAR` 없이 띄운 스모크(지금 사이트와 같음), `LIAR=test` + `?liar=1`, `LIAR=on` 세 가지.
5. M7 증거 확인. Opus 검토 지적 처리(검토 ↔ 수정 최대 2회).
6. origin/main 이 그 사이 움직였는지 확인(움직였으면 합치고 1번부터 다시).
7. 사용자에게 묻는 글에 넣을 것: ① 올리면 서버가 다시 시작돼 진행 중인 포커 방이 끊긴다 ② 처음에는 숨김(`LIAR=test`) — Render 대시보드에 `LIAR=test`를 넣어야 한다(값을 바꿀 때도 재시작)
   ③ 포커에 보이는 변화는 채팅 `*` 크기뿐 ④ 사용자가 실기기(폰·iPad)로 `주소/?liar=1`에서 라이어 한 판 + 포커 한 판, 랭킹이 재접속 뒤에도 남는지(점검 ⑥) 확인
   ⑤ 미확인 목록: 3D 모양·연출·소리·iPad/Safari·가로 폰 키보드·실제 DB 랭킹.
8. 되돌리는 길: `LIAR=off`(포커는 그대로 돈다). 포커가 이상하면 병합 커밋을 되돌려 다시 올린다(강제 푸시 금지).
9. 실기기 확인이 끝나면 사용자에게 다시 묻고 `LIAR=on`(아무도 없을 때).
