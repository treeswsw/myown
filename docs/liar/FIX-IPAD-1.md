# 라이어게임 수정 묶음 FIX-IPAD-1 (2026-11-13, iPad Safari 가로 실기기 시험 뒤)

기준: GDD 13절(v0.13), CONTRACTS 9절. 저장소 myown, 개발 브랜치 `claude/agent-team-dev-mdhsjm`(8b3f314 에서 시작).
이 문서는 기획 총괄이 쓴다. 과제문은 그대로 복사해 Sonnet 작업자에게 준다.

## 0. 결정 (한 줄씩)

| # | 사용자 요청·발견 | 결정 |
|---|---|---|
| 1 | 첫 발언·최후 변론 때 아래 가운데 입력 칸 / 채팅 칸 항상 아래 가운데 | 입력 칸은 **하나**. 채팅 칸을 아래 가운데에 항상 띄우고, 내 첫 발언·변론 차례에는 같은 칸이 빨갛게 강조되고 안내 글이 바뀐다. 정답 입력만 지금처럼 조작 줄에 따로. |
| 2 | 오른쪽 위에 최근 채팅 기록 | 상단 줄·"이 판 끝내기" 아래 오른쪽에 최근 6줄(누를 수 없음). "기록" 버튼으로 전체 기록. **둥근 채팅 버튼은 라이어 방에서 없앤다**(방 대기는 지금 그대로). |
| 3 | 클로즈업 때 작은 말풍선이 큰 글씨와 겹침 | `say`·`plea` 글은 머리 위 말풍선을 띄우지 않는다(큰 글씨만). 토론 중 잡담 말풍선은 그대로. 라이어 방에서는 오른쪽 알림(toast)도 끈다(기록이 대신한다). |
| 4 | 클로즈업 때 이름·지목됨이 위에 있어 겹침 | 클로즈업된 사람의 이름표는 얼굴 아래(턱 밑)에 단다. |
| 5 | 찬반 칸이 작다 / "아니다"가 두 줄 | 버튼 가로 132px 이상·세로 60px 이상·한 줄. 집계는 버튼 바로 위로 옮긴다. |
| 6 | 마네킹 눌러도 투표 | 토론·투표·재투표에서 캔버스를 누르면 그 자리 마네킹 주인을 지목(이름표와 같은 동작). |
| 7 | 오른쪽 위 겹침("이 판 끝내기"·집계·채팅 버튼) | 채팅 버튼 없앰 + 집계 이동 + "이 판 끝내기"를 상단 줄 바로 아래로. 아래 "자리 약속" 표대로. |
| 8 | 찬반 안 하면 아니다 → **기권**, 기본 **15초** | 낸 표끼리만 센다(맞다 > 아니다 면 처형, 같으면 살림). 기권 0점. 표시 "기권". 메시지 모양 그대로. |
| 9 | (총괄 발견) iPad 키보드가 아래 입력 칸을 가릴 수 있음 | 채팅 칸을 키보드 위로 올린다(visualViewport). 실기기 확인 필요. |
| 10 | (총괄 발견) 보낸 뒤 키보드가 닫힘 | 라이어 방에서는 보낸 뒤에도 입력 칸에 머문다. |
| 11 | (총괄 발견) 아래 칸이 늘어 마네킹·얼굴이 가려짐 | 카메라의 아래 여백을 채팅 칸 높이만큼 늘린다. |
| 미룸 | 정답 맞히기 가운데 상자의 "남은 시간"이 위 숫자와 겹쳐 두 번 보임 | 이번 묶음에서 안 한다(다음 묶음 후보). |

고치는 곳: **myown 에서 바로 고친다**(채팅·main.js·실제 시험이 여기에만 있다). 병합·시험 통과 뒤 관리자가 gamemine 으로 한 번에 되돌려 복사한다(5절).

## 1. 자리 약속 (모든 과제가 같은 숫자를 쓴다. CSS px)

오른쪽 위(위에서 아래로):
- 0~54: 상단 줄 `.lgbar`(그대로).
- 58~98: "이 판 끝내기"(`.lg-hud-endbox`). `top: calc(env(safe-area-inset-top, 0px) + 58px)`, `right: 10px`.
- 104~: 최근 채팅 기록 `.chat-feed`. `top: calc(env(safe-area-inset-top, 0px) + 104px)`, `right: 10px`, 너비 `min(300px, 30vw)`, 높이 최대 `min(34vh, 220px)`.
- 그 아래: 3D 없는 화면의 글자 현황판 `.lg-vt-board`. `top: calc(env(safe-area-inset-top, 0px) + 112px + min(34vh, 220px))`.

아래 가운데(아래에서 위로):
- 채팅 칸: `bottom: calc(12px + var(--chat-kb, 0px))`, 너비 `min(560px, 100vw - 24px)`, 높이 48px. 이때 `html`에 `chat-docked`·`chat-liar`가 붙고 `--chat-dock: 48px`(→ `--chat-docked-h` = 60px).
- 조작 줄 `.lg-action`: 채팅 칸 바로 위. style.css 에 이미 있는 `bottom: calc(12px * var(--lg-k, 1) + var(--chat-docked-h, 0px))`가 그대로 맡는다.
- 클로즈업 이름표: 얼굴 아래. 조작 줄보다 위.

## 2. 모듈 사이 약속 (CONTRACTS 9절과 같다)

- `chat.setMode('liar')` / `chat.setLock(locked, note, hot)` / `chat.push(msg, { mine, bubble })`.
- `chatLockFor(state) → { locked, hint, hot }`.
- `ctx.tagAnchor(id) → { x, y, below? } | null`, 장면 `tagPos(id)`, 장면 `pick(x, y) → id | null`, `vote.pick(id)`.
- `picks`에 이름이 없으면 기권. `DEFAULT_TIMES.judge = 15`.
- **새로 부르는 쪽은 상대가 아직 없어도 깨지지 않게 쓴다**(`scene.pick?.()`, `mods.vote.pick?.()`, `ctx.tagAnchor || ctx.anchor`). gamemine 의 임시 진행자에는 새 채팅 기능이 없다.

## 3. 과제 (1차 다섯 개는 동시에, 파일이 겹치지 않는다. 각 30분 이내)

모든 과제 공통:
- 워크트리의 자기 브랜치에 커밋만 한다(푸시·병합은 관리자). 적힌 파일 밖은 건드리지 않는다. 밖을 고쳐야 하면 멈추고 보고.
- CSS: 라이어 모듈은 `.lg-` + 자기 접두사만, 채팅은 `.chat-`. 같은 클래스를 두 파일에 정의하지 않는다. `zoom` 금지(크기는 `calc(px * var(--lg-k, 1))`). `#ui`·`.lg-root`는 `pointer-events: none`이고 눌리는 요소만 스스로 `auto`. 넓은 선택자로 pointer-events 를 바꾸지 않는다.
- 사용자 글자는 `textContent`로만. `Math.random` 금지. 화면은 역할(`state.my`)에 따라 달라지면 안 된다(라이어와 시민이 같은 화면).
- 끝낼 때: `npm run check` 통과(서버·shared 를 고친 과제는 `npm test`까지). 보고는 15줄 이내: 바꾼 파일, 시험 결과(명령과 통과 수), 못 한 것. 3D 모양·iPad·키보드는 "미확인(실기기 확인 필요)"으로 적는다.

### E — 규칙 엔진: 찬반 기권, 기본 15초
- 파일: `shared/liar/game.js`, `shared/liar/constants.js`, `server/liar/room.js`(기본 시간 한 곳만. 총괄이 허락한 예외), `test/liar/game.test.js`, `test/liar/leaks.test.js`, `test/liar/room.test.js`, `test/liar/e2e/*.test.js`·`helpers.js`(기대값만).
- 읽을 것: GDD 13-1.
- 할 일:
  1. `DEFAULT_TIMES.judge` 10 → 15. `server/liar/room.js` 49행 근처의 기본 `times.judge`도 15(가능하면 `DEFAULT_TIMES`를 가져다 쓴다). `TIME_CHOICES`는 그대로.
  2. 판정(`game.js` 249~251행 근처): `yes` = `'yes'`를 낸 수, `no` = `'no'`를 낸 수, `executed = yes > no`. 안 낸 사람은 어느 쪽에도 넣지 않는다. 둘 다 0이면 살림.
  3. 점수(`game.js` 548~553행 근처): 마지막 찬반에서 `picks[id]`가 없으면 0. `'yes'`는 +2 / −1, `'no'`는 +1 / 0 그대로.
  4. 메시지·상태 모양은 바꾸지 않는다(`picks`에 기권을 값으로 넣지 않는다). 끊긴 사람·나간 사람 처리(`delete picks[by]`)는 그대로면 기권이 된다. 주석의 "안 고르면 아니다"를 고친다.
  5. 시험: 전원 기권 → 살림 / 맞다 1·기권 2 → 처형 / 맞다 1·아니다 1·기권 1 → 살림 / 기권자 점수 0(라이어 처형, 시민 처형 둘 다) / 기본 시간 15. 기존 기대값 중 "안 고르면 아니다"에 기댄 것을 새 규칙으로 고친다. `leaks.test.js`는 라이어와 시민의 메시지 모양이 여전히 같은지만 확인(새 필드 없음).
- 완료: `npm run check`와 `npm test` 통과.

### C — 채팅: 라이어 방 모드
- 파일: `client/src/ui/chat.js`, `client/src/ui/chat.css`(채팅 시험 파일이 있으면 그것도).
- 읽을 것: 이 문서 1절·2절, `chat.js` 전체(265줄). 방 대기(`lobby`) 모드가 이미 "아래에 붙은 칸"을 한다. 그것을 본떠 만든다.
- 할 일:
  1. `setMode('liar')` 추가. 이 모드에서: 입력 줄(`.chat-bar`)이 아래 가운데에 **항상** 보인다(1절 숫자). 둥근 버튼(`chat.button`)은 숨긴다. `html`에 `chat-docked`와 `chat-liar`를 붙이고 `html.chat-liar { --chat-dock: 48px }`. 다른 모드로 바뀌면 뗀다. `game`·`lobby` 모드의 동작은 바꾸지 않는다(포커 방이 쓴다).
  2. 최근 기록 `.chat-feed`: 오른쪽 위(1절 숫자)에 최근 6줄, "이름 글" 한 줄씩(이름 굵게, 내 글은 이름 색 강조, 한 줄당 최대 2줄까지 보이고 넘치면 자름, 오래된 줄일수록 흐리게). `pointer-events: none`. 글자는 `max(12px, 14px)` 정도, 반투명 어두운 바탕. `push`·`setLog` 때 다시 그린다.
  3. "기록" 버튼은 이 모드에서도 보이고, 누르면 전체 기록(`.chat-sheet`)이 `.chat-feed` 자리에 열린다(열려 있는 동안 `.chat-feed`는 숨김). 밖을 누르면 기록만 닫히고 입력 줄은 남는다.
  4. `push(msg, { mine, bubble })`: 라이어 모드에서는 알림(toast)을 띄우지 않는다. `bubble === false`면 머리 위 말풍선도 띄우지 않는다(기록에는 남는다). 읽지 않음 점도 이 모드에서는 쓰지 않는다.
  5. `setLock(locked, note, hot)`: 잠기지 않았어도 `note`가 있으면 안내 글(placeholder)로 쓴다. `!locked && hot`이면 `.chat-bar`에 `hot` 클래스(빨간 테두리 `#ea3a3d`와 은은한 빛). 잠겼을 때는 흐리게.
  6. 라이어 모드에서는 보낸 뒤 입력 칸에서 나가지 않는다(터치 기기에서도 `blur` 하지 않음). Enter 로 열기는 "입력 칸에 초점"으로.
  7. 키보드: `window.visualViewport`가 있으면 `resize`·`scroll` 때 `html`에 `--chat-kb`(가려진 높이 px)를 적고, 붙은 칸의 `bottom`에 더한다(라이어·방 대기 모드). 없으면 0.
  8. 방 정보가 올 때마다 `setMode`가 다시 불린다. 같은 모드면 입력 칸을 다시 끼워 넣지 않는다(초점·한글 조합이 깨진다. 기존 주석 참고).
- 완료: `npm run check` 통과(포커 방 채팅 스모크가 그대로 통과해야 한다). `?nogl=1` 라이어 방에서 직접 확인은 2차 과제 I 가 한다.

### V — 이름표·찬반 (vote)
- 파일: `client/src/liar/ui/vote.js`, `client/src/liar/ui/vote.css`, `test/liar/vote.test.js`, `test/liar/ui/vote/`.
- 읽을 것: 이 문서 1절·2절, GDD 13-1 표시 줄.
- 할 일:
  1. 찬반 버튼 크게: `.lg-vt-verdict`에 `min-width: max(132px, calc(150px * var(--lg-k, 1)))`, `min-height: max(60px, calc(66px * var(--lg-k, 1)))`, `font-size: max(18px, calc(24px * var(--lg-k, 1)))`, `white-space: nowrap`. 버튼 사이 12px. "투표 N / M"(`.lg-vt-count`)도 `white-space: nowrap`과 `min-width: 132px`.
  2. 집계(`data-lg="tally"`)를 오른쪽 현황판에서 꺼내 조작 줄로 옮긴다: `ctx.action`에 세로 상자 `.lg-vt-judgebox`(위 집계, 아래 버튼)를 붙인다. 집계는 찬반·판정 단계에 모두에게 보이고(지목된 사람·구경하는 사람은 버튼 없이 집계만), `pointer-events: none`.
  3. 기권: `judged`에서 안 고른 사람 딱지는 `data-v="abs"`, 글 "기권"(지금은 `no`로 그린다). `judge` 중에는 지금처럼 "고르는 중". 집계 글은 "맞다 N · 아니다 M", `judged`에서 기권이 1명 이상이면 " · 기권 K"(K = 앉아 있는 사람 중 지목된 사람을 뺀 수 − 낸 표 수). `tallyOf`는 그대로 두고 필요하면 순수 함수 하나를 더 내보낸다. `.lg-vt-jv[data-v="abs"]` 모양은 "고르는 중"과 비슷한 흐린 딱지.
  4. 이름표 자리: `const a = ctx.nogl ? null : (ctx.tagAnchor || ctx.anchor)(id)`. `a.below`가 참이면 이름표를 그 점 **아래로** 단다(`translate(-50%, 0)`, y 는 `H - t.h - 4`를 넘지 않게). 아니면 지금처럼 위로.
  5. `pick(id)`를 돌려주는 객체에 더한다(`onTag(id)`와 같다. `canPick`이 거절하면 아무 일도 없다).
  6. 3D 없는 화면의 현황판 `.lg-vt-board`의 `top`을 1절 숫자로 내린다(최근 채팅 기록 아래).
  7. 시험: 기권 딱지·집계 글, `pick(id)`가 `{t:'lg',a:'vote',target}`을 보내는지, `below` 처리.
- 완료: `npm run check` 통과. 자기 시험 페이지(`test/liar/ui/vote/`)에서 찬반 버튼이 한 줄인지 확인(가로 1000px 기준).

### H — 상단 표시·규칙 안내 (hud, rules. 작은 두 모듈을 한 과제로. 총괄 허락)
- 파일: `client/src/liar/ui/hud.js`, `test/liar/hud.test.js`, `client/src/liar/ui/rules.js`, `test/liar/rules.test.js`.
- 할 일:
  1. `chatLockFor(state)`가 `{ locked, hint, hot }`을 돌려준다(`hot` 기본 `false`). 잠기지 않은 경우 중:
     - `speak`이고 내 차례: `hint: '첫 발언을 입력하세요'`, `hot: true`.
     - `defense`·`judge`·`judged`이고 내가 지목된 사람: `hint: '최후 변론을 입력하세요'`, `hot: true`.
     - 그 밖(방 대기, 역할 확인, 토론·투표, 재투표, 결과): `hint: ''`, `hot: false`.
     잠긴 경우의 글은 그대로. `state.my`(역할)는 보지 않는다.
  2. 규칙 안내(`rules.js`): 진행 순서 ④ 끝에 "시간 안에 안 고르면 기권" 한 마디. 점수표에 기권 칸(성공·실패 모두 0)을 더한다. GDD 13-1.
  3. 시험 보강: `chatLockFor`의 새 값(내 차례·남의 차례·지목된 사람·구경), 규칙 글.
- `hud.css`는 고치지 않는다("이 판 끝내기" 자리는 과제 I 가 style.css 에서 옮긴다).
- 완료: `npm run check` 통과.

### S — 3D 장면: 누르기, 이름표 자리, 아래 여백
- 파일: `client/src/liar/scene/index.js`, `seats.js`, `camera.js`, `layout.js`(필요하면), `test/liar/scene.test.js`, `test/liar/ui/scene/`. `mannequins.js`는 고정 자산이라 고치지 않는다.
- 읽을 것: 이 문서 1절·2절, `scene/index.js`, `camera.js`의 `speakPose`·`fitTable`.
- 할 일:
  1. `pick(x, y) → id | null`(화면 CSS px, `rig.size` 기준): `THREE.Raycaster`로 각 자리의 마네킹(`e.body`, 자식 포함)을 쏴서 가장 가까운 것의 주인 id. 빗나가면 머리 중심(`e.face`)을 화면에 투영한 점에서 48px 안에 있는 가장 가까운 사람. 없으면 null. 의자만 맞은 것은 치지 않는다.
  2. `tagPos(id) → { x, y, below? } | null`: 지금 클로즈업(`focus`)된 사람이면 얼굴 아래 점(`face.y − faceR × 1.3` 근처, 턱 바로 밑)을 투영해 `below: true`와 함께. 그 밖의 사람·전체 보기·정체 공개(`liar`)에서는 `screenPos(id)`와 같은 값.
  3. 아래 여백: 채팅 칸이 늘었으므로 `fitTable`의 `barH`와 `speakPose`의 아래 여백에 60px(채팅 칸 48 + 간격 12, 배율 없이)을 더한다. 클로즈업에서는 턱 밑 이름표 한 줄(약 40px)과 조작 줄이 얼굴·이름표를 덮지 않게 얼굴 중심을 조금 올린다(`centerPx` 비율 조정). 위쪽의 큰 글씨 자리는 줄이지 않는다.
  4. 시험(`scene.test.js`, node): 3명·8명 자리에서 각 머리 중심의 화면 좌표로 `pick`하면 그 사람 id / 빈 곳은 null / 클로즈업 때 `tagPos`가 `below: true`이고 y 가 `screenPos`보다 아래 / 전체 보기에서는 `screenPos`와 같음.
- 완료: `npm run check` 통과. 모양은 "미확인(실기기 확인 필요)".

### I — 연결·시험 (2차. 위 다섯 개가 병합된 뒤 한 명이)
- 파일: `client/src/liar/index.js`, `client/src/liar/liar.css`, `client/src/main.js`, `client/src/style.css`, `test/liar/index.test.js`, `test/liar/ui/index/`, `test/ui/smoke.mjs`, `test/ui/liar-round.mjs`.
- 할 일:
  1. `main.js`: 라이어 방에서 `chat.setMode(room.phase === 'lobby' ? 'lobby' : 'liar')`. 라이어 방의 `chat` 알림은 `chat.push(e, { mine, bubble: !(e.kind === 'say' || e.kind === 'plea') })`. 라이어 방에서 `chat.button.hidden = false`로 되살리는 줄을 없앤다(게임 중에는 버튼이 없다). 포커 방 쪽 코드는 그대로.
  2. `liar/index.js`: `const lock = chatLockFor(s); chat.setLock(lock.locked, lock.hint, lock.hot)`. `ctx.tagAnchor = (id) => scene ? (scene.tagPos?.(id) ?? scene.screenPos(id)) : null`(3D 없는 화면에서는 null → 이름 버튼 목록). 캔버스 누르기: `document`의 `click`에서 `e.target`이 `CANVAS`이고 지금 단계가 `discuss`·`revote`이면 `const id = scene?.pick?.(e.clientX, e.clientY); if (id) mods.vote.pick?.(id)`. `dispose`에서 떼어 낸다.
  3. `style.css`: `.lg-root .lg-hud-endbox`의 `top`을 `calc(env(safe-area-inset-top, 0px) + 58px)`, `right: 10px`으로. 252행 주석을 1절에 맞게 고친다. 결과 창·정답 상자가 아래 채팅 칸이나 오른쪽 위 기록에 가려지면 여기서(또는 `liar.css`) 여백을 준다.
  4. 시험:
     - `test/ui/liar-round.mjs`: 게임 중 `.chat-btn`이 안 보이고 `.chat-in`이 보이는지(단계마다), 내 첫 발언 차례에 `.chat-bar.hot`, 남의 차례에 입력 칸이 잠겼는지, `.chat-feed`에 방금 보낸 글이 있는지, 찬반 단계에서 `[data-lg="judge"]` 버튼 두 개의 높이가 같고 글이 한 줄인지(높이 ≤ 80px), 한 명이 찬반을 고르지 않게 해서 판정 때 그 사람 딱지가 "기권"인지, 가림 검사(`occAll`)가 새 자리에서도 통과하는지.
     - `test/ui/smoke.mjs`: 라이어 방 게임 단계에서 아래 채팅 칸 클릭·보내기 한 줄, "기록" 버튼 클릭 한 줄. 포커 방의 채팅 버튼 단계는 그대로 통과해야 한다.
     - `test/liar/index.test.js`: 가짜 장면에 `pick`·`tagPos`를 넣어 "캔버스 클릭 → vote 전송", `setLock`에 세 번째 값이 넘어가는지.
  5. 가로 1000×750 과 844×390(`?nogl=1`)에서 겹침이 없는지 눈으로 한 번씩 보고, 본 것만 보고에 적는다.
- 완료: `npm run check`와 `npm test`(`test/ui/liar-round.mjs` 포함) 통과.

## 4. 순서

1. 1차(동시에 5명): **E, C, V, H, S**. 파일이 겹치지 않는다. 각자 `npm run check`(E 는 `npm test`까지).
2. 관리자가 다섯 개를 병합 → `npm run check`.
3. 2차(1명): **I**. `npm run check` + `npm test`.
4. Opus 검토 한 번(이 문서 0~2절·GDD 13절과 대조, 누출 시험, 포커 방 채팅이 그대로인지). 단순한 것은 Opus 가 바로 고친다. 최대 2회.
5. gamemine 되돌려 복사(5절) → 사용자에게 배포해도 되는지 묻고(서버가 다시 시작되어 진행 중인 방이 끊긴다) → `git push origin HEAD:main`.
6. 사용자 실기기 확인 목록: 아래 채팅 칸이 키보드 위로 올라오는지 / 클로즈업에서 이름표가 얼굴 아래에 있고 큰 글씨와 안 겹치는지 / 찬반 버튼 크기 / 마네킹 눌러 지목 / 오른쪽 위 기록과 "이 판 끝내기"가 안 겹치는지 / 기권 표시.

## 5. gamemine 과 맞추기 (관리자가 한다)

- 1~4가 끝난 뒤 myown → gamemine 으로 복사: `shared/liar/`, `server/liar/`, `client/src/liar/`, `test/liar/`, 그리고 `docs/liar/GDD.md` → `docs/GDD.md`, `docs/liar/CONTRACTS.md` → `docs/team/CONTRACTS.md`, 이 문서 → `docs/FIX-IPAD-1.md`.
- `test/liar/e2e/helpers.js`와 `test/liar/e2e/start.test.js`는 지금도 두 저장소가 다르다(옮길 때 생긴 차이). 덮어쓰지 말고, 이번에 바뀐 줄만 손으로 옮긴다.
- 복사 뒤 gamemine 에서 `npm run check`. gamemine 의 임시 진행자(`host/`)에는 새 채팅 모드가 없으므로 예전 모양(둥근 버튼)으로 돌아가는 것이 정상이다. 깨지면 2절의 "없어도 깨지지 않게"를 어긴 것이니 myown 에서 고치고 다시 복사한다.
- gamemine 은 자기 개발 브랜치에 커밋만. 앞으로도 라이어 폴더 수정은 "myown 에서 고침 → 되돌려 복사" 한 방향으로 한다.
