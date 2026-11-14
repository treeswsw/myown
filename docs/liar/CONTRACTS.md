# 약속 문서 (Fable 기획 총괄만 고친다)

작업자끼리 맞물리는 지점의 유일한 기준. 지금은 아래 절이 약속이다(중복 작성하지 않는다).
- 통신 메시지, 방 상태 모양, 연출 알림, 비밀 유지: docs/GDD.md 9절
- 모듈 이음매(createLiarRoom, mountLiar, anchorOf, mediaBlocked 등)와 함수 모양: docs/PLAN.md 1절(1-4, 1-7)
- 폴더·구역: CLAUDE.md "구역"
약속이 틀렸거나 부족하면 고치지 말고 BOARD.md "계약 변경 제안"에 적는다.

---

# 화면 모듈 약속 (v1, 2026-11-12 — 병렬 선행 개발용)

화면 조각을 **서로 모르는 독립 모듈**로 먼저 만들고, 나중에 `client/src/liar/index.js`(mountLiar)가 조립만 한다.
모듈은 진짜 서버 없이 **가짜 상태(GDD 9-3 모양)** 로 돌아가는 자기 시험 페이지에서 완료 판정을 받는다.
방 상태·알림·요청의 모양은 GDD 9절 그대로다(여기서 새로 만들지 않는다).

## 0. 공통 규칙

1. **모양**: 모듈마다 `createXxx(ctx, opts?)` 하나를 내보내고, 돌려주는 것은
   `{ el, update(state), event?(e), frame?(dt), dispose() }` + 모듈별 추가 함수(아래 표).
   - `update(state)`: `room.state` 전체(GDD 9-3) 또는 `null`(방을 나감 → 전부 숨김). **같은 state로 여러 번 불러도
     화면이 같아야 한다**(멱등). 자기와 무관한 단계에서는 자기 요소를 `hidden`으로 둔다. 재접속으로 중간 단계부터 받아도 맞게 그린다.
   - `event(e)`: GDD 9-4의 `e` 그대로. 연출용이다. 놓쳐도 `update`만으로 화면이 틀리지 않아야 한다.
   - `frame(dt)`: 초 단위. 매 화면 갱신마다 불린다(남은 시간 숫자, 위치 따라가기).
2. **ctx**(모든 모듈이 같은 것을 받는다. 없는 칸을 쓰지 않는다):
   ```js
   ctx = {
     root,      // 자기 요소 하나를 붙일 곳(진행자의 ui). 모듈은 root 의 다른 자식을 만지지 않는다
     action,    // 화면 아래 가운데 "조작 줄" 요소(가로 flex). 찬반 버튼·정답 칸·늦은 첫 설명 칸은 여기에 붙인다
     send,      // send(msg). msg 는 GDD 9-1 모양 그대로. 예: send({t:'lg', a:'vote', target:id})
     now,       // now() → 서버 시각(ms). 남은 초 = Math.ceil((state.phaseEndsAt - ctx.now()) / 1000), 0 아래는 0. Date.now 금지
     anchor,    // anchor(id) → {x, y} | null. 그 사람 머리 위 화면 좌표(root 기준 CSS px). null = 3D 없음 또는 화면 밖
     faceOf,    // faceOf(id) → 프로필 사진 dataURL | null (없으면 이름 첫 글자 + 그 사람 색 동그라미를 CSS로)
     toast,     // toast(문구)
     nogl,      // true 면 3D 없음. 글자만으로 게임이 끝까지 되어야 한다
     limits,    // { say: 80, chat: 80, guess: 30 }
   }
   ```
3. **가져오기 금지 목록**: 모듈 JS는 ① 다른 화면 모듈 ② 진행자(host/) ③ CSS 파일(`import './x.css'` 금지 — index.js가 모아서 가져온다.
   시험 페이지는 `<link>`로) ④ `shared/liar/*`(값은 ctx·opts로 받는다)를 가져오지 않는다. three.js는 `scene/`만 쓴다.
   파일을 불러오는 순간(맨 위)에는 `document`·`window`를 만지지 않는다(순수 함수를 node 시험에서 불러올 수 있게).
4. **글자**: 사용자가 쓴 글·이름은 `textContent`로만. 사람 이름은 `state.players`의 `name`·`color`로 찾는다.
5. **비밀**: `state.my` 밖에서 역할을 추측해 그리지 않는다. `'word'` 방식에서는 `unmask` 연출이 끝나기 전까지
   라이어와 시민의 화면(요소·문구·순서·소리)이 같아야 한다. `unmask.liarId`·`wasLiar`는 정체 공개 모듈만 쓴다(연출 끝 = `guess` 단계부터 다른 모듈도 사용 가능).
6. **CSS**: 모듈 자기 접두사만(`.lg-hud-` 등). 색·크기는 아래 변수를 **기본값과 함께** 쓴다(변수 정의는 liar.css가 한다):
   `var(--lg-bg, #070608)` `--lg-ink #efe6d8` `--lg-ink-dim #a39a8f` `--lg-red #ea3a3d` `--lg-red-deep #6f1216` `--lg-gold #d9b26a`
   `--lg-panel rgba(13,10,11,.8)` `--lg-panel-solid #141012` `--lg-line rgba(239,230,216,.16)` `--lg-k 1`(크기 배율)
   `--lg-serif "Noto Serif KR","Apple SD Gothic Neo",serif` `--lg-sans "Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif`.
   크기는 `calc(px * var(--lg-k, 1))`. zoom 금지. 모듈 뿌리 요소는 `pointer-events: none`, 눌러야 하는 것만 `auto`. 모양은 시안(design/mockup-table.html)을 따른다.
7. **겹침 순서(z-index)**: 이름표 10 / 상단 표시 20 / 조작 줄 30 / 첫 발언 모음 40 / 역할 카드 50 / 결과 60 / 정체 공개 70. 진행자의 채팅·이모티콘 패널은 진행자가 정한다.
8. **시험용 표식**: 누르거나 판정에 쓰는 요소에는 `data-lg="이름"`을 단다(아래 표의 이름 그대로. 스모크가 이것으로 찾는다). 사람별 요소는 `data-id`.
9. **완료 판정(통합 전)**: 과제마다 ① `node --test test/liar/<모듈>.test.js`(순수 함수) ② `node test/liar/ui/<모듈>/run.mjs`
   (자기 시험 페이지 `test/liar/ui/<모듈>/harness.html`을 Playwright 로 열어 실제 클릭). 시험 페이지 규칙:
   - `run.mjs`가 vite를 코드로 띄운다(공용 파일 없음. 각자 자기 run.mjs 안에):
     `createServer({ root: 저장소 뿌리, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1' } })` → `listen()` →
     `server.resolvedUrls.local[0] + 'test/liar/ui/<모듈>/harness.html?nogl=1'`. Playwright 는
     `createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')`의 `chromium.launch()`(옵션 없이. 설치 명령 금지). 끝나면 둘 다 닫고, 실패하면 종료 코드 1.
   - 화면 크기 844×390(가로 폰). `harness.html`은 `window.h = { mod, sent: [], set(이름) , clock }`을 내놓는다: `set('speak')`처럼
     미리 만든 가짜 상태로 `mod.update()`를 부르고, `send`는 `h.sent`에 쌓고, `now`는 `h.clock`(고정 시각, 시험이 움직임)을 돌려준다.
   - 가짜 상태는 3절의 표본을 복사해 단계별로 바꿔 쓴다(각자 `fixtures.js`). 3명·8명 둘 다.
   - 보이는 버튼마다 **중심점이 실제로 눌리는지**(`document.elementFromPoint`가 그 버튼 또는 그 자식인지) 확인한다.
   - 이것은 통합 전 판정이다. 통합 뒤의 완료 판정은 CLAUDE.md대로 host/test/smoke.mjs(실제 서버)다.

## 1. 모듈별 약속

| 모듈(파일) | 만들기 | 추가로 돌려주는 것 | 보내는 요청 | `data-lg` |
|---|---|---|---|---|
| 3D 장면 `scene/index.js` | `createLiarScene()` (ctx 없음) | 아래 1-1 | 없음 | 없음 |
| 상단 표시 `ui/hud.js` `.lg-hud-` | `createHud(ctx)` | `chatLockFor(state) → {locked, hint}`(순수, 따로 export) | `{t:'lg',a:'end'}` | `hud-kicker` `hud-title` `hud-secs` `hud-alert` `hud-said` `end` `end-yes` `end-no` |
| 이름표·지목·찬반 `ui/vote.js` `.lg-vt-` | `createVote(ctx)` | `tagPos(id) → {x,y}\|null`(이름표 가운데) | `{t:'lg',a:'vote',target}` `{t:'lg',a:'judge',v}` | `tag`(+`data-id`) `judge`(+`data-v`) `tally` `vote-status` `judge-status` `voted` |
| 정답·결과 `ui/result.js` `.lg-rs-` | `createResult(ctx)` | — | `{t:'lg',a:'guess',text}` `{t:'start'}` | `guess-input` `guess-send` `guess-wait` `guess-shown` `result` `result-winner` `result-row`(+`data-id`) `next` |
| 역할 카드 `ui/role.js` `.lg-role-` | `createRole(ctx)` | — | 없음 | `role-card` `role-word` `myword` |
| 첫 발언 모음 `ui/firstsays.js` `.lg-fs-` | `createFirstSays(ctx)` | `canLate(state) → bool`(순수, 따로 export) | `{t:'lg',a:'say',text}`(늦은 추가만) | `fs-open` `fs-panel` `fs-row`(+`data-id`) `fs-close` `late-input` `late-send` |
| 방 설정 `ui/settings.js` `.lg-st-` | `createSettings(ctx, { timeChoices, goalChoices })` — `el`을 root에 붙이지 **않는다**(`lobbyPanel`이 돌려준다) | — | `{t:'lg',a:'settings',…바뀐 칸만}` `{t:'lg',a:'kick',id}` | `st-liarMode` `st-wordSet` `st-topicMode` `st-topic`(+`data-name`) `st-nextTopic` `st-time`(+`data-key`) `st-goal` `st-kick`(+`data-id`) |
| 정체 공개 글 `anim/unmask.js` `.lg-um-` | `createUnmask(ctx, { onStage, onTick })` | `busy` (연출 중이면 true) | 없음 | `unmask`(+`data-stage`) `um-l1` `um-l2` `um-liar` |
| 효과음 `audio.js` | `createAudio()` (ctx 없음) | 아래 1-3 | 없음 | 없음 |
| 머리 위 이모티콘 `ui/emote.js` `.lg-em-` | `createEmote(ctx)` | — | 없음 | `emote`(+`data-id`) |

모듈이 맡는 화면(단계 = `state.phase`):

- **hud**: 맨 위 작은 줄(`Round N` · 주제 · `accuseNo`가 2 이상이면 "N번째 지목"), 단계별 제목·안내 문구, 남은 초, 화면 위 큰 발언 글.
  문구는 시안의 `STATES`·`setAlert`·`renderSpeak` 것을 그대로 옮긴다. 꼭 들어갈 글자: 내 차례 "당신의 발언시간입니다" / "라이어가 눈치채지 못하게 발언하세요",
  남의 차례 "상대방의 발언을 기다리고 있습니다", "남은 발언시간 N초", 토론·투표 "투표 결과까지 N초", 재투표 "재투표", 변론 "최후 변론", 찬반 "찬반 투표",
  판정 "처형" / "살림"(`state.judge.executed`), 관전자 "구경 중 — 채팅은 다음 판부터".
  큰 발언 글: `event chat`의 `kind:'say'`(첫 설명)와 `'plea'`(변론)만 띄운다(이름은 그 사람 색, 다음 글이 오거나 4초 뒤 사라짐. `'late'`·`'talk'`는 띄우지 않는다).
  방장 "이 판 끝내기"(`reveal`~`guess` 사이, `hostId === you`): 누르면 "정말 끝낼까요?" 예/아니오가 뜨고 예에서만 보낸다(`window.confirm` 금지).
  `chatLockFor(state)`: GDD 4-4 표 그대로(나 = `state.you`). 잠기면 `hint`는 한국어 한 줄(예: "첫 설명 중에는 차례인 사람만 쓸 수 있어요"). index.js가 `chat.setLock`에 넘긴다.
- **vote**: 판 진행 중(`lobby` 아님) 앉은 사람(`seat !== null`)마다 이름표 버튼 하나(작은 프로필 + 이름(그 사람 색) + 나면 "(나)" + 끊김이면 "끊김 N초"(`awayUntil`) + 찬반 표시 칸).
  `frame`에서 `ctx.anchor(id)`가 좌표를 주면 그 자리로(root 안으로 가둔다), `null`이면 화면 한쪽에 **이름 버튼 목록**으로 줄 세운다(`?nogl=1`).
  `discuss`·`revote`에서 누르면 지목(같은 사람 다시 = `target:null`, 나 자신·관전자·재투표 때 후보 아닌 사람은 눌리지 않음). 내가 찍은 사람 표시.
  `vote-status`: "민수 → 서아" 줄들(항상 DOM에 있고 nogl에서 보인다). `voted`: "투표 5 / 8".
  `judge` 단계: 지목된 사람·관전자가 아니면 `ctx.action`에 "아니다 / 맞다" 버튼(`aria-pressed`). 모두에게 `tally` "맞다 3 · 아니다 2"와
  이름표의 찬반 표시(`state.judge.picks`, 안 고른 사람은 빈 칸), `judge-status` "서아: 맞다" 줄들. `defense`에서는 버튼이 없다.
- **result**: `guess` 단계 — 라이어(`state.unmask.liarId === you`)는 `ctx.action`에 정답 칸(1~30자, 한 번), 그 밖은 "라이어가 정답을 고민하고 있습니다" + 남은 초.
  `state.guess.text`가 오면 낸 답과 맞음/틀림. `result` 단계 — 누가 이겼나(`winner`: "시민 승리" / "라이어 승리" / "무효"와 `reason` 한 줄), 라이어 이름, 두 제시어,
  낸 답, 사람별 점수 변화(`delta`: +2 / +1 / 0 / −1)와 방 점수 순위표(점수 높은 순), 투표 내역(`voteLog`. 2번 이상이면 접어 둠), `champions`가 있으면 우승 표시를 맨 위에.
  방장에게 "다음 판"(`{t:'start'}`), 나머지에게 "방장이 다음 판을 시작하기를 기다리는 중". 전체 랭킹 창은 이 과제에 없다(뒤 과제).
- **role**: `reveal` 단계의 카드("Round N", 주제, 제시어). **누르고 있는 동안만** 제시어가 보인다(pointerdown~up/leave/cancel, 키보드는 스페이스·엔터를 누르는 동안).
  `'notice'` 방식의 라이어(`my.role === 'liar'`)는 제시어 자리에 "당신은 라이어입니다". 두 방식의 카드 크기·움직임이 같다. 관전자에게는 카드 없음.
  `speak`~`judged` 동안 구석에 "내 제시어" 버튼(누르고 있는 동안만 주제·제시어).
- **firstsays**: 판 진행 중 항상 보이는 상단 가운데 버튼("첫 발언" + 쓴 사람 수)과 창(발언 순서 = `firstSays` 순서, 이름은 그 사람 색, `late`면 "늦게 씀",
  `text === null`이면 `canLate`가 가능한 동안 "아직" 그 뒤에는 "(발언 없음)"). `canLate(state)` = GDD 9-3 아래 첫 항목의 조건 그대로 — 참이면 `ctx.action`에 "내 첫 설명 쓰기"(한 줄, 한 번).
- **settings**: 방 대기에서 라이어 방식 2 / 제시어 묶음 2 / 주제 방식 2 / 주제 체크(무작위 방식) 또는 다음 판 주제 고르기(방장 직접 방식) / 시간 6종(`timeChoices`) / 목표 점수(`goalChoices`)
  + 참가자(이름·방 점수·끊김, 방장에게만 내보내기). 방장이 아니면 전부 읽기 전용. 값은 항상 `state.settings`에서 다시 그린다(누른 즉시 바꿔 그리지 않고 서버 답을 기다린다).
- **unmask**: 1-2.
- **emote**: `event {k:'emote', id, e}`를 받으면 `ctx.anchor(id)` 자리에 기본 이모티콘(0~5, 그림은 myown `client/src/ui/pins.js`와 같은 6종)을 2초 띄운다. `frame`에서 따라간다. 좌표가 `null`이면 띄우지 않는다.

### 1-1. 3D 장면 (`client/src/liar/scene/`)

```js
createLiarScene() → {
  scene, camera,                    // THREE.Scene, THREE.PerspectiveCamera. index.js 가 stage.use(scene, camera) 에 넘긴다. 렌더러는 만들지 않는다
  resize(w, h),                     // CSS px. 카메라 비율과 "전체 보기" 자세를 다시 잡는다
  setPlayers(players, you),         // state.players 와 state.you. 달라진 사람만 다시 만든다. 같은 값으로 다시 불러도 그대로
  setFace(id, dataUrl | null),      // faces 알림. null 이면 이름 첫 글자
  setView(view, cut = false),       // {mode:'table'} | {mode:'focus', id}   (cut = 보간 없이 바로)
  screenPos(id) → {x, y} | null,    // 머리 위(이름표 자리) CSS px. **카메라 뒤이거나 없는 사람일 때만 null**(v0.10. 화면 밖 좌표는 그대로 주고 쓰는 쪽이 root 안으로 가둔다)
  seatPos(id) → {x, z, yaw} | null, // 테이블 좌표(화살표용)
  frame(dt), dispose(),
}
// scene/layout.js (three.js 를 가져오지 않는 순수 함수. node 시험 대상)
seatOrder(players, you) → [id]      // 화면 자리 순서. [0] = 화면 앞. seat 이 숫자인 사람만 seat 순으로 놓고 내가 [0]이 되게 돌린다.
                                    // 전원 seat 이 null(방 대기)이면 배열 순서에서 내가 [0]이 되게 돌린다(v0.10). 내가 관전자면 seat 0 이 [0]
seatSlots(n) → [{x, z, yaw, edge, n}] // n = 3..8(`edge`·`n`은 P1 이 더한 칸, v0.10 인정). 시안의 타원(TA 1.45, TB 0.95, SEAT_GAP 0.34) 위 고른 간격
cameraFor(state) → view             // speak 이고 speaker 있음 → focus(speaker). defense·judge·judged → focus(accused). 그 밖은 table
```
뒤 과제(3D-2)가 같은 객체에 더한다: `setVotes(votes)`(화살표. `state.votes` 그대로), `setView({mode:'liar', id})`(빨간 빛기둥 아래 라이어 클로즈업), `setJudge(picks|null)`.
(v0.11) `setJudge`의 `picks = { [id]: 'yes' | 'no' }`. 장면 객체의 `stats()`는 시험용이다 — index.js 는 부르지 않는다. 자세한 것은 7절.
index.js는 `scene.setVotes?.()`처럼 있을 때만 부른다. `?nogl=1`이면 index.js가 장면 모듈을 아예 불러오지 않는다(`scene = null`).

### 1-2. 정체 공개 글 (`client/src/liar/anim/unmask.js`)

- `update(state)`에서 `phase === 'unmask'`를 처음 보면(판 `round` + `accuseNo`로 한 번만) 연출을 시작한다. 박자·문구는 시안(`RV`, `startReveal`, `rvType`) 그대로:
  검은 화면 → "그는 라이어가" / "아닙니다"(또는 "맞습니다") 한 글자씩 → (`wasLiar === false` 또는 `id === null`이면) "라이어는"(빨강) "[이름]"(그 사람 색) "입니다"(빨강).
  `id === null`(지목 실패)이면 첫 두 줄 없이 라이어 장면만. 건너뛸 수 없다. `phase`가 `unmask`가 아니게 되면 바로 치운다.
  중간에 들어온 사람(남은 시간이 연출 길이보다 짧음)은 남은 시간에 맞는 지점부터 보여 준다(글자는 이미 찍힌 상태로).
- `onStage(stage, info)`: `'dark'`(시작) → `'liar'`(`info.id` = 라이어. 3D가 클로즈업할 순간) → `'end'`. `onTick(big)`: 글자 하나가 찍힐 때(소리용).
- `?nogl=1`에서도 글은 똑같이 보인다. `data-stage`에 지금 단계(`dark`·`line1`·`line2`·`liar`·`end`)를 적는다.

### 1-3. 효과음 (`client/src/liar/audio.js`)

```js
createAudio() → { play(name), setMuted(bool), get muted, unlock(), dispose() }
// name: 'phase' | 'myTurn' | 'turn' | 'vote' | 'accused' | 'judge' | 'executed' | 'spared' | 'tick' | 'tickBig' | 'liar' | 'guessOk' | 'guessNo' | 'win' | 'champion'
```
파일 없이 WebAudio로 만든 짧은 소리만. 모르는 이름·잠긴 오디오·끔 상태에서는 조용히 아무것도 안 한다(오류 없음). 첫 사용자 입력에서 `unlock()`.
어떤 소리를 언제 틀지는 index.js가 정한다(역할에 따라 다른 소리를 `unmask` 전에 틀지 않는다).

## 2. 조립 (`client/src/liar/index.js` — 통합 과제 I-1이 이대로 만든다)

```js
mountLiar({ ui, stage, send, getMe, chat, toast, emotePanel }) {
  // ctx: root = ui 안의 .lg-root, action = .lg-action(조작 줄), now = () => Date.now() + offset (offset = state.now - 받은 순간의 Date.now()),
  //      anchor = id => scene ? scene.screenPos(id) : vote.tagPos(id),  faceOf = id => faces.get(id) ?? null,  limits = shared/liar/constants.js 의 LIMITS
  // scene = nogl ? null : (await import('./scene/index.js')).createLiarScene();  stage.use(scene.scene, scene.camera)
  applyRoom(state):  offset 갱신 → scene?.setPlayers(state.players, state.you); scene?.setView(cameraFor(state)) (unmask 중에는 unmask 모듈의 onStage 가 정한다);
                     scene?.setVotes?.(state.votes) → 모든 모듈 .update(state) → chat.setLock(...chatLockFor(state))
                     state === null 이면 전부 update(null), stage.use(null)
  handleEvent(e):    'faces' → faces 갱신 + scene?.setFace + 모든 모듈 update(마지막 state);  그 밖은 모든 모듈 .event?.(e) + 소리
  lobbyPanel(room):  settings.update(room); return settings.el
  anchorOf(id):      ctx.anchor(id)
  frame(dt):         scene?.resize(크기가 바뀌었으면); scene?.frame(dt); 모든 모듈 .frame?.(dt)
  dispose():         전부 dispose, stage.use(null)
}
```

## 3. 가짜 상태 표본 (시험 페이지용. 복사해서 단계별로 바꿔 쓴다)

```js
const players = ['민수','서아','지호','병철','유나','도윤','하린','태오'].map((name, i) => ({
  id: 'u' + i, name, color: ['#e5484d','#f2a33a','#e9d758','#46a758','#3db9cf','#4c7dff','#a06cff','#ff6fb5'][i],
  body: i, seat: i, connected: true, awayUntil: null, spectating: false, score: 0 }));
const base = {
  code: 'ABCD', mode: 'liar', hostId: 'u0', you: 'u0', now: 1_000_000, phase: 'speak', phaseEndsAt: 1_030_000, round: 1,
  settings: { liarMode: 'word', times: { speak: 30, discuss: 90, rediscuss: 60, defense: 20, judge: 10, guess: 15 },
              wordSet: 'mine', topicMode: 'random', topics: [{ name: '장소', on: true }, { name: '음식', on: true }], goal: 0, nextTopic: null },
  players, topic: '장소', my: { word: '도서관', role: null },
  order: ['u2','u6','u4','u5','u1','u0','u3','u7'], speaker: 'u4',
  firstSays: [{ id: 'u2', text: '조용한 곳', late: false }, { id: 'u6', text: null, late: false }],
  votes: {}, candidates: null, accuseNo: 1, accused: null, judge: null, unmask: null, guess: null, result: null,
};
// 방 대기: phase 'lobby', phaseEndsAt null, 전원 seat null, topic~result 전부 null.
// 3명 판: players 앞의 3명만, order 도 그 3명.
```

## 4. 서버 순수 도우미 (라이어 서버 구역. room.js 가 가져다 쓴다)

```js
// server/liar/perms.js — GDD 4-4 표. who = { id, spectating }, g = { phase, speaker, accused } (방 대기면 phase 'lobby')
chatBlocked(g, who) → null | 한국어 문구          // speak 중에는 누구든 문구(첫 설명은 say 로 보낸다). 관전자는 lobby·result 에서만 가능
mediaBlocked(g, who, kind) → null | 한국어 문구   // kind: 'emote' | 'pemote' | 'snd' | 'sndAdd'. unmask = 전부 막음, guess = 'emote' 만 가능,
                                                  // 관전자 = lobby·result 밖에서는 'emote' 만 가능
chatKind(g, who) → 'talk' | 'plea'                // defense·judge·judged 에서 지목된 사람의 글은 'plea'

// shared/liar/protocol.js — GDD 9-1 의 lg 요청 모양 검사(v0.9. 과제 R0). node 전용 모듈을 쓰지 않는다
checkLg(msg) → { ok: true, msg: 정리된 새 객체 } | { ok: false, error: 한국어 문구 }
                                                  // 모양만 본다(종류 8개: settings kick say vote judge guess end rank, 글자 수, 선택지). 모르는 칸은 버린다.
                                                  // "지금 해도 되는가"(방장인가, 단계가 맞는가, 주제 이름이 있는가)는 room.js·엔진이 본다

// server/liar/scores.js — GDD 5절. 전부 새 객체를 돌려준다(받은 것을 고치지 않는다)
applyDelta(scores, delta) → scores                // 방 점수. 음수 가능. 없는 사람은 0 에서
champions(scores, goal) → [id] | null             // goal 0 → null. goal 이상인 사람이 있으면 최고점자 전원
unflushed(entry) → number                         // entry = { score, flushed }. 아직 누적에 안 더한 만큼(score - flushed, 음수 가능)
addToTotal(liarStats, add) → liarStats            // stats.liar.score = max(0, score + add). 나머지 칸 그대로
roundStats(result, playerIds) → { [id]: { games, wins, liarGames, liarWins } }   // 이 판으로 늘어날 전적. winner 'void' 면 빈 객체.
                                                  // playerIds = 판 끝까지 남은 사람. 이긴 판: 시민은 winner 'citizens', 라이어는 winner 'liar'
```

## 5. v0.9 덧붙임 (묶음 1 검토 결정. 자세한 것은 PLAN 1-4·1-7)

- 방(`room.js`)의 선택 함수 `faceChanged(session)`: 사진이 바뀐 사람의 `faces`를 방 전원에게. 진행자는 있으면 이것만 부른다.
- 방 ↔ 엔진: 타이머는 `wakeAt(game)`, `players[].seat`는 `viewFor().seats`에서, 채팅 알림의 `name`은 방이, 정답 채점은 방이 해서 `act({type:'guess', by, text, correct})`.
- `result.voteLog[]`에 `firstVotes: {..} | null`이 더해졌다(GDD 9-3). 화면 모듈은 모르는 칸을 무시하면 된다(P5 는 그대로, 표시는 P12 에서).
- `citizenEntry`·`liarEntry`·`alt`는 서버 밖으로 나가지 않는다.
- 시험 명령은 파일 글롭(`node --test test/liar/*.test.js`). Node 22 이상.

## 6. v0.10 덧붙임 (물결 0·0′·1 검토 결정 + 사용자 답변 5차. 위 절과 다르면 이 절이 우선)

**고친 약속**
- **hud**: 제목 문구 `reveal` "역할 확인" / `unmask` "정체 공개" / `guess` "정답 맞히기" / `result` "결과". 역할 카드(z 50)가 hud 를 덮는 것은 그대로. `chatLockFor`는 `speaker`·`accused`가 null 이면 아무도 "차례/지목된 사람"이 아니다.
- **vote**: 이름표는 `speak`~`judged`에만 보인다(`reveal`·`unmask`·`guess`·`result`에는 없음 → 그때 `tagPos`는 null). `voted`·찬반 버튼은 조작 줄(`ctx.action`). `voted` "투표 N / M"의 M = `seat !== null && connected`인 사람 수(과제 G1).
- **result**: `guess.text === null`이면 "(답하지 못했어요)". 라이어 이름 = `players`에서 찾고 없으면 `result.liarName`, 그것도 없으면 "?"(G1). `voteLog[].firstVotes` 표시(G1).
- **unmask**: `data-stage`는 라이어 처형에서도 `liar`(빛기둥 순간)를 거친다. `um-liar` 요소는 시민 처형·지목 실패에만 있다. `onStage`는 단계마다 한 번(중간 입장이면 지난 단계도 차례로).
- **emote**: 글자 크기 기준 `calc(72px * var(--lg-k, 1))`(사용자: 더 크게). 글자 6개의 유일한 출처는 `ui/emote.js`의 `EMOTE_GLYPHS`.
- **firstsays**: "아직" / "(발언 없음)" 해석과 버튼 숫자(글이 있는 칸 수 / `order.length`)는 P8 기록대로 확정.
- **settings**: `timeChoices`·`goalChoices`는 index.js 가 `shared/liar/constants.js`의 `TIME_CHOICES`·`GOAL_CHOICES`를 넘긴다.

**새 모듈**(0절 규칙 그대로)

| 모듈(파일) | 만들기 | 보내는 요청 | `data-lg` | z-index |
|---|---|---|---|---|
| 규칙 안내 `ui/rules.js` `.lg-rule-` | `createRules(ctx)` → `{el, update, dispose}` + 순수 `ruleSections(settings)` | 없음 | `rule-open` `rule-panel` `rule-close` `rule-mode`(+`data-v`) | 45 |
| 전체 랭킹 `ui/rank.js` `.lg-rk-` | `createRank(ctx)` → `{el, update, event, dispose}` + 순수 `rankLines(top, mine)` | `{t:'lg',a:'rank'}` | `rank-open` `rank-panel` `rank-row` `rank-mine` `rank-close` | 65 |

- **rules**: 버튼은 상단 가운데 왼쪽(`right: calc(50% + max(104px, calc(150px * var(--lg-k, 1))))`, `top`은 `.lg-fs-` 버튼과 같게). `lobby`~`result` 항상, `unmask`·`null`에서 숨김. 글은 GDD 7-1 "규칙 안내" 그대로. `state.my`·`unmask`·`result`를 읽지 않는다.
- **rank**: 버튼은 `ctx.action`에, `lobby`·`result`에만. `event({k:'lgRank', top:[{name,score,games}], mine:{rank|null, score}})`를 받아 그린다(진행자가 최상위 `lgRank` 메시지를 이 모양으로 `handleEvent`에 넘긴다).

**조립(2절에 더한다)**
- `mountLiar`가 돌려주는 것에 `chatMsg(text) → msg` 추가. 순수 `chatMsgFor(state, text)`: `state?.phase === 'speak' && state.speaker === state.you` → `{t:'lg', a:'say', text}`, 아니면 `{t:'chat', text}`.
- 진행자는 `chat`·`chatLog` 알림도 `handleEvent`로 넘긴다. index.js 는 `chat` 알림의 글에서 크기 표시를 뗀 사본을 모듈에 준다: `plainChat(text) = text.replace(/^(?:#|\*{1,3})\s*(?=\S)/, '')`.
  크기 단계(채팅 쪽, C1): `#` → 2, `*` → 1, `**` → 2, `***` → 3, 표시 뒤에 글이 없으면 0.
- 3D: `unmask`의 `onStage('dark')` → `scene?.setView({mode:'table'})`, `'liar'` → `scene?.setView({mode:'liar', id})`, `'end'` 뒤 `cameraFor(state)`. `unmask.busy` 동안 `applyRoom`은 카메라를 건드리지 않는다. `setVotes`·`setJudge(state.judge?.picks ?? null)`는 있을 때만(`?.`).
- 소리(index.js 가 튼다. 전부 역할과 무관): `phase` 알림 → `phase` / `turn` → 나면 `myTurn`, 남이면 `turn` / `vote` → `vote` / `accused` → `accused` / `judge` → `judge` / `judged` → `executed` 또는 `spared` /
  정체 공개 `onTick(big)` → `tickBig` 또는 `tick`, `onStage('liar')` → `liar` / `guess` 알림 → `guessOk` 또는 `guessNo` / `result` 단계에 처음 들어갈 때 `champions`가 있으면 `champion`, 없으면 `win`(무효 판은 소리 없음).
- 서버(R1b): `view().result.liarName`, `say` 글의 크기 표시 떼기(같은 정규식).

## 7. v0.11 덧붙임 (물결 2 검토 결정. 위 절과 다르면 이 절이 우선)

- **크기 표시 떼기(한 규칙, 세 곳)**: `/^(?:#|\*{1,3})\s*(?=\S)/`로 떼되, **떼고 남는 글이 `#`·`*`·빈칸뿐이면 원문 그대로(크기 0)**. 서버 `stripSizeMark`(say), 화면 `plainChat`(pure.js), 채팅 `chatSize`가 같은 결과를 낸다(대조 시험 있음).
- **rules**: 창은 **버튼 바로 아래, 위쪽 가운데**(z 45). 화면 정중앙이 아니다.
- **3D(1-1에 더함)**: `setJudge(picks | null)`의 `picks = { [id]: 'yes' | 'no' }`. `stats()`는 시험용 — index.js 는 부르지 않는다. `scene/judge.js`·`reveal.js`·`arrows.js` 인정. index.js 는 `liar` 단계에 항상 `setView({mode:'liar', id})`.
- **조립**: `mods`에 `rules`·`rank`가 더해진다(I-2). `applyRoom`: `scene?.setVotes?.(state?.votes ?? null)`, `scene?.setJudge?.(state?.judge?.picks ?? null)`. `lobbyPanel()`은 index.js 가 붙여 둔 `.lg-lobbybox`를 돌려준다.
- **role**: `ctx.root`에 붙이는 요소는 하나(`el`). 카드와 구석 버튼은 그 안에(F1).
- **`lg rank`**: 진행자가 답한다. 방은 받지 않는다.

**방 ↔ 엔진(끊김, R2a)**
- `setConnected(id, false)` → 진행 중인 판의 참가자면 `act({type:'away', by})`. `true` → `act({type:'back', by})`(다른 요청보다 먼저).
- `leave(id)`(나가기·내보내기·60초 만료) → 참가자면 `act({type:'drop', by})`를 먼저, 그다음 방 정리. 세 경우 모두 알림 `sendEvents` → `wakeAt`으로 타이머 다시 → `push()`.
- 판이 없거나 결과 단계거나 참가자가 아니면 엔진을 부르지 않는다. 도중에 들어온·빠졌다 돌아온 사람은 판이 끝날 때까지 `spectating`.

**방 점수 장부(R2b)** — 계산은 전부 scores.js(4절). 방은 들고만 있는다
- `scores: Map<id, {score, flushed}>`. 방이 살아 있는 동안 아이디별로 기억(나가도 남는다). `players[].score = scores.get(id)?.score ?? 0`. **판 도중에는 바뀌지 않는다.**
- 결과에 닿는 순간 한 번: `applyDelta(result.delta)` → `roundStats`를 `user.stats.liar`의 games·wins·liarGames·liarWins 에 더하고 `hub.persist`·`hub.sendMe` → `champions(scores, settings.goal)`을 그 판 결과에 적는다(`view().result.champions`, 그 판 동안 고정). 무효 판은 아무것도 없음(`champions: null`).
- 누적에 더하기(`unflushed` → `addToTotal` → `flushed = score` → `persist`·`sendMe`): `leave` 때 그 사람, `flush()` 때 방에 있는 전원(여러 번 불려도 한 번만), 우승 뒤 다음 `start` 때 전원 + 장부 전부 0.

**시험**: e2e(test/liar/e2e/)는 `helpers.js`의 `startFast({k})`로 진행자에 빠른 시계(`hubOptions.now`·`timers`)를 넣는다. 실제 코드에는 시간 배율이 없다. 브라우저 한 판(`host/test/smoke-round.mjs`)은 실제 시간.

## 8. v0.12 덧붙임 (마일스톤 최종 확인 결정. 위 절과 다르면 이 절이 우선)

- **hud**: 마지막 사람의 첫 설명(`say`, kind first)은 단계가 `discuss`로 넘어간 뒤에 도착해도 화면 위 큰 글로 4초 보여 준다.
- **조립**: `mountLiar(ctx, { sceneFactory })` — `sceneFactory`는 **시험 전용** 인자(가짜 장면을 넣는다). 진행자와 myown main.js 는 넘기지 않는다.
- **scores**: 누적에 더할 때 0 아래로 못 깎은 몫은 반영된 것으로 치지 않는다(`flushed`는 실제 반영분만큼만 오른다). 코드 고침은 PLAN v0.12-1.
- **rank**: 목록은 누적 1점 이상만(상위 20). 0점인 사람은 "내 순위" 줄에만.
- **판 끝내기 알림**: 방장 이름의 `chat` 한 줄. 새 메시지 종류를 만들지 않는다.

## 9. v0.13 덧붙임 (2026-11-13 iPad 시험 뒤. GDD 13절. 위 절과 다르면 이 절이 우선. 과제는 docs/liar/FIX-IPAD-1.md)

- **메시지 모양은 그대로다.** `picks = { [id]: 'yes' | 'no' }`에 이름이 없으면 **기권**. `DEFAULT_TIMES.judge = 15`(3절 표본의 `judge: 10`도 15로 읽는다).
- **game**: 처형 = 낸 표 중 `yes` 수 > `no` 수. 점수: 기권 0(성공·실패 모두).
- **vote**: `judged`에서 안 고른 사람 딱지는 `data-v="abs"` "기권"(이전에는 `no`). `tally`는 조작 줄(`ctx.action`)의 찬반 상자 안, "맞다 N · 아니다 M[ · 기권 K]". 새 메서드 `pick(id)`(이름표를 누른 것과 같다).
  이름표 자리는 `ctx.tagAnchor`가 있으면 그것을, 없으면 `ctx.anchor`를 쓴다. 돌려받은 값에 `below: true`가 있으면 이름표를 그 점 **아래로** 단다.
- **ctx(index.js 가 더한다)**: `tagAnchor(id) → { x, y, below? } | null`.
- **3D**: `tagPos(id) → { x, y, below? } | null`(클로즈업된 사람은 얼굴 아래 점 + `below: true`, 그 밖은 `screenPos`와 같다), `pick(x, y) → id | null`(화면 CSS px. 그 자리의 마네킹 주인).
- **hud**: `chatLockFor(state) → { locked, hint, hot }`. 내 첫 설명 차례·내 최후 변론(변론·찬반·판정)에는 `locked: false`, `hint`에 안내 글, `hot: true`. 역할(`state.my`)은 보지 않는다.
- **진행자 chat**: `chat.setLock(locked, note, hot)` — 잠기지 않았어도 `note`가 있으면 안내 글로 쓴다. `chat.setMode('liar')`, `chat.push(msg, { mine, bubble })`. 없는 진행자(gamemine host)에서도 깨지지 않게 index.js 는 더 넘기기만 한다.
- **index.js**: 토론·투표·재투표 중 캔버스를 누르면 `scene.pick?.(x, y)` → `mods.vote.pick?.(id)`.

## 10. v0.14 덧붙임 (2026-11-13 마지막 단계 개편. GDD 14절, 계획 docs/liar/ENDING.md. 위 절과 다르면 이 절이 우선)

- **엔딩 모듈** `client/src/liar/anim/ending.js` (`.lg-ed-`, 과제 E): `createEnding(ctx, { onStage, onTick }) → { el, update(state), event(), frame(dt), dispose(), get busy }`, 순수 함수 `endingPlan(state, liarName) → { total, steps, marks }`.
  보이는 때: `phase` 가 `guess`·`answer` 이고 `unmask.liarId` 가 있을 때. 읽는 값: `unmask.liarId`, `players`, `you`, `guess`, `words`, `phaseEndsAt`(`my`·`result` 는 읽지 않는다). 규칙은 0절 그대로.
  `answer` 의 총 길이는 `FIXED_TIMES.answer`(10, notice 도 10).
- **`data-lg`**: `ending`(+ `data-stage`: `ask` → `hush` → `word` → `mismatch` → `answer` → `verdict` → `hold`; 0절 사용자 결정으로 `hush` 정적은 길이 0, `word`·`mismatch` 는 시작과 동시), `ed-title`, `ed-secs`, `ed-wait`, `ed-word`, `ed-mismatch`, `ed-answer`, `ed-verdict`(+ `data-ok="1|0"`).
  `onStage(stage, info)`: `'ask'`, `'hush'`, `'answer'`(`info.id` = 라이어), `'verdict'`(`info.correct`), `'end'`. `onTick(big)`: 글자 하나가 찍힐 때.
- **z-index**: 엔딩 28 (이름표 10 · 상단 표시 20 < 엔딩 28 < 조작 줄 30). 라이어의 입력 칸을 가리지 않는다. 뿌리는 `pointer-events: none`.
- **장면**: `cameraFor`: `guess`·`answer` 이고 `unmask.liarId` 가 있으면 `{mode:'spot', id}`. `spot` = `liar` 와 같은 구도(이미 `liar` 였으면 다시 밀고 들어가지 않음) + 하얀 조명·빛기둥 `reveal.look(id, 'white')`. `tagPos` 는 `liar`·`spot` 에서도 얼굴 아래(`below:true`). `stats()` 에 조명 색 표시.
- **result 모듈**: `guess` 에서는 라이어의 입력 칸(`guess-input`·`guess-send`)만, `answer` 에서는 전부 숨김. **hud**: `guess`·`answer` 에서는 맨 위 작은 줄만 남기고, `chatLockFor`: `answer` → 잠김 "정답 공개 중에는 글을 쓸 수 없어요", "이 판 끝내기" 숨김.
- **조립**: 정체 공개 `onStage('end')` 에서 단계가 아직 `unmask` 면 카메라를 테이블로 돌리지 않는다. `soundForEvent` 의 `guess` → 소리 없음, 엔딩 `onStage('verdict', {correct})` 에서 `guessOk`/`guessNo`. 새 소리 없음.
- **3절 표본**: `words: null` 칸을 더하고, `phase:'answer'` 표본은 `words: { citizen, liar }`(notice 는 `liar: null`), `guess: { text, correct }` 를 채운다.
