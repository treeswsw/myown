> 지난 기록(지금 구조는 COMMON-CONTRACT.md)

# 요트다이스 만들기 계획 (구역·과제 지시문)

작성: 기획 담당, 2026-11-13. 규칙은 `docs/yacht/GDD.md`, 통신 약속은 `docs/SPEC.md` 19절. 다르면 SPEC 19절 → GDD → 이 문서 순으로 우선.
사용자 말(모든 지시문에 그대로 넣는다):
> "너무 유명한 게임이고 규칙은 하나밖에 없어서 만들기 쉬울거야. 내가 만든 시안을 레퍼런스로 첨부할테니 그대로 만들어주면 돼. 게임 이름은 요트다이스야."
> 추가: ① 참여자·관전자 모두 같은 화면(같은 트레이, 같은 주사위 위치·움직임) ② 움직이는 것은 주사위와 컵뿐, 3D로 품질 높게 ③ 자기 차례인 사람만 조작
> ④ 점수 칸은 두 번 눌러 기록(첫 누름 = 선택, 같은 칸 다시 = 기록, 다른 조작을 하면 선택 해제) ⑤ 선택한 칸은 방 전체에 실시간으로 보인다.
> 확정 답(2026-11-13): "2.이미 쓴칸에는 못쓰는거고. 그 모든 룰은 요트 다이스 공식 룰로 가고. 시간제한은 그냥 없애도 될듯? 8.끊긴 사람있으면 최대한 기다려줘. 1분이상 안들어오면 기권으로만. 게임은 가로로만 플레이 할수있게 15. 가로로볼때 두덩이로 나눠줘. 16. 그대로 17. 너가 판단 나머지는 알아서 해"

**시작 조건**: 충족(2026-11-13, GDD 0절 "확정 사항" Q1~Q21). 답이 다시 바뀌면 GDD·SPEC 을 먼저 고친다.
요약: 공식 룰 점수(GDD 3-2), **차례 시간 없음**(자동 굴림·자동 기록 없음), 끊긴 사람 차례는 멈추고 기다림 → 끊긴 지 60초 뒤 기권, **가로 전용**, 휴대폰 가로 점수표 두 덩어리(44px), "N left" 영어, 휴대폰 보관 안내는 첫 굴림 뒤 3초 한 번.

**모델 배정**(사용자 지시): Fable = Y4C(3D 판·컵·주사위 모델)·Y4D(3D 굴림 재생·연출) 두 과제만. Opus = Y1S(굴림 계산기), 검토, 최종 확인(검토자와 다른 새 에이전트). 나머지 코드 과제(Y1·Y2·Y3·Y4A·Y5·Y6·Y7)는 Sonnet.
스킬 2-1(시안 먼저): 참고 화면 4장이 시안 역할을 한다. Y3·Y4A 의 시험 페이지 캡처(844×390, 1280×720)를 사용자에게 한 번 보여 주고 통합(Y6)으로 넘어가길 권한다.

## 0. 원칙

1. **포커·라이어가 한 글자도 달라지지 않는다.** `YACHT=off`면 화면·서버 모두 지금과 같다. 기존 시험 파일과 smoke 의 기존 줄은 고치지 않는다(허용: `test/css.test.js` 에 규칙 추가).
2. 요트는 독립 모듈이다. 라이어 폴더(`shared/liar` `server/liar` `client/src/liar` `test/liar`)는 읽기만 한다(본보기).
3. 눈·seed·순서는 서버가 crypto 난수(`hub.rng`)로만. 요트 폴더 어디에도 `Math.random` 금지. 시간은 서버가 잰다. 사용자 글자는 `textContent` 로만.
4. 방 상태에 프로필 사진을 넣지 않는다(`faces` 알림).
5. 작업자는 자기 워크트리의 자기 브랜치에 커밋만. 푸시·병합 금지.

## 1. 구역 (파일 주인)

| 구역 | 파일 | 과제 |
|---|---|---|
| 요트 규칙 | `shared/yacht/constants.js` `score.js` `game.js` `protocol.js`, `test/yacht/score.test.js` `game.test.js` `protocol.test.js` | Y1 |
| 요트 굴림 계산기 | `shared/yacht/sim.js`, `test/yacht/sim.test.js` | Y1S |
| 요트 서버 | `server/yacht/room.js`, `test/yacht/room.test.js`, `test/yacht-seam.test.js`, `test/yacht/e2e/`, 이음매: `server/protocol.js` `rooms.js` `index.js` | Y2 |
| 요트 점수표 | `client/src/yacht/ui/sheet.js` `sheet.css` `result.js` `result.css`, `test/yacht/ui/sheet/` `result/` | Y3 |
| 요트 판(조작·2D) | `client/src/yacht/ui/board.js` `board.css` `dice2d.js`, `test/yacht/ui/board/` | Y4A → (Y4D 가 이어서) |
| 요트 3D 모델 | `client/src/yacht/scene/` (`index.js` `tray.js` `cup.js` `die.js` `quality.js`), `test/yacht/ui/scene/` | Y4C |
| 요트 3D 재생·연출 | `client/src/yacht/anim/` (`player.js` `fx.js` `fx.css`), `client/src/yacht/audio.js`, `client/src/yacht/ui/dice3d.js`, `board.js` 의 "그리는 쪽 고르기" 한 곳, `test/yacht/ui/roll/` | Y4D |
| 로비 | `client/src/ui/lobby.js` `lobby.css` | Y5 |
| 통합 | `client/src/yacht/index.js` `yacht.css`, `client/src/main.js` `style.css`, `test/ui/smoke.mjs` `test/ui/yacht-round.mjs`, `package.json` `render.yaml` `CLAUDE.md` `README.md` | Y6 |
| 뼈대(Y1 이 같이) | `package.json`(시험 경로), `test/css.test.js`(`.yt-` 규칙) | Y1 |

CSS 접두사(전부 `.yt-`): 틀 `.yt-root`(yacht.css) / 점수표 `.yt-sc-` / 결과 `.yt-rs-` / 판 `.yt-bd-` / 연출 `.yt-fx-`. 상단 줄만 전역 `.ytbar`(style.css).
시험이 잡는 표식은 `data-yt="…"`(3절). 클래스 이름으로 시험하지 않는다.

## 2. 순서

```
1차(동시 6개): Y1 규칙 | Y1S 굴림 계산기 | Y3 점수표 | Y4A 판(조작·2D) | Y4C 3D 모델 | Y5 로비
2차(동시 2개): Y2 서버(Y1·Y1S 병합 뒤) | Y4D 3D 재생·연출(Y1S·Y4A·Y4C 병합 뒤)
3차(혼자):     Y6 통합(Y2·Y3·Y4A·Y5 병합 뒤. Y4D 는 기다리지 않아도 된다 — ?nogl=1 로 끝까지 된다)
4차:           Y7 실행 시험(다른 Sonnet, 코드 안 고침) → Opus 검토 → Opus 최종 확인(검토자와 다른 새 에이전트)
```

- 관리자가 처음에 말한 ①~⑤ 와의 대응: ① = Y1 + Y1S, ② = Y2, ③ = Y3, ④ = Y4A + Y4C + Y4D(사용자 지시 "3D 품질 높게"에 따라 셋으로 나눔), ⑤ = Y5(로비는 구역이 달라 따로) + Y6.
- 화면 과제(Y3·Y4A·Y4C)는 서버·엔진을 기다리지 않는다. 4절의 가짜 상태만 쓴다. `shared/yacht/` 를 import 하지 않는다(예상 점수·합계는 서버가 준다). 예외: Y4D 만 `shared/yacht/sim.js` 를 쓴다.
- 각 과제는 스킬의 "20분·항목 3개"보다 크다(특히 Y2·Y4D·Y6). 관리자가 더 자르려면: Y2 → 방(room.js) / 이음매 + e2e, Y4D → 재생기 / 컵·연출·소리, Y6 → index.js + main.js / smoke + round + 설정.

## 3. 모듈 사이의 약속 (SPEC 19절에 더해, 화면 안쪽)

### 3-1. `shared/yacht/` (Y1, Y1S)

```js
// constants.js
export const CATS = ['ones','twos','threes','fours','fives','sixes','choice','fourKind','fullHouse','smallStraight','largeStraight','yacht'];
export const UPPER = CATS.slice(0, 6);
export const ROUNDS = 12, MAX_ROLLS = 3, DICE = 5, BONUS_AT = 63, BONUS = 35, MIN_PLAYERS = 2, MAX_PLAYERS = 4;

// score.js  (dice = 눈 5개 배열, scores = {칸: n|null})
scoreOf(cat, dice) -> n
previewOf(dice, scores) -> {빈칸: n}
totals(scores) -> { upper, bonus, total }
comboOf(dice) -> null | 'yacht' | 'largeStraight' | 'fourKind' | 'fullHouse' | 'smallStraight'

// game.js  (시계 없음. rng = () => [0,1), 방이 hub.rng 를 넘긴다. 모든 함수는 { ok, error?, events } 를 돌려준다)
createGame({ players: [{id, name}], rng }) -> { game, events }     // 순서 섞기, ytStart·ytTurn
shake(game, id, on) / roll(game, id, rng, place) / keep(game, id, i, on, freeSpot) / pick(game, id, cat) / score(game, id, cat)
//   place(seed, thrown) -> [{i, x, z, yaw}] 와 freeSpot 은 주입받는다(방이 sim.js 것을 넘긴다. 엔진은 sim.js 를 import 하지 않는다)
//   시간 제한·자동 기록이 없으므로 timeout()·autoPick() 은 만들지 않는다.
drop(game, id, reason)    // 기권('away' | 'leave'). ytDrop 알림. 차례 중이면 기록 없이 다음 사람. 1명(또는 0명) 남으면 끝(reason 'alone')
viewOf(game, viewerId)    // SPEC 19-3 의 cols·round·turn·rollsLeft·rollNo·shaking·dice·preview·pick·last·result
//   끊김(connected·awayUntil·waiting)은 엔진이 모른다. 방(Y2)이 상태에 붙인다.

// protocol.js
parseYt(msg) -> { ok, msg } | { ok: false }     // a 와 필드 모양만 검사(roll / shake{on} / keep{i,on} / pick{cat|null} / score{cat})

// sim.js (Y1S)  — 좌표는 GDD 4절
export const TRAY = 10, DIE = 1.4, STEP_MS = 1000 / 120, MAX_MS = 2500, CUP = { x: 3.4, z: 2.4 };   // 컵이 쏟는 자리(트레이 오른쪽 아래)
prng(seed) -> () => [0,1)                       // 장식(색종이 등)도 이것만 쓴다
simulateRoll(seed, thrown, { frames = true } = {}) ->
  { ms, steps, frames: Float32Array | null,     // steps × thrown.length × 7 (x, y, z, qx, qy, qz, qw). frames:false 면 null(서버용)
    rest: [{ i, x, z, yaw, up }] }              // 멈춘 자리. up = 기본 번호 배치에서 위를 본 면
restQuat(v, yaw) -> [qx, qy, qz, qw]            // "눈 v 가 위, 세로축으로 yaw 만큼 돈" 자세. 멈춘 주사위를 바로 그릴 때
faceFix(up, v) -> [qx, qy, qz, qw]              // 주사위 그림에 먼저 적용할 회전. 경로 자세 × faceFix = 끝에서 restQuat(v, yaw)
freeSpot(others: [{x, z}], prefer: {x, z, yaw}) -> {x, z, yaw}   // 뺀 주사위가 돌아갈 자리: prefer 가 비어 있으면 그대로, 아니면 정해진 후보 중 첫 빈자리
```

- 기본 번호 배치(면 → 눈): +y 1, −y 6, +x 3, −x 4, +z 2, −z 5. 3D 주사위 모델(Y4C)도 이 배치로 만든다.
- 서버(Y2)는 굴릴 때 `simulateRoll(seed, thrown, {frames:false}).rest` 의 `x, z, yaw` 를 소수 3자리로 잘라 상태에 넣는다.

### 3-2. `client/src/yacht/` (Y3, Y4A, Y4C, Y4D, Y6)

```js
// index.js (Y6)
mountYacht({ ui, stage, send, getMe, chat, toast, emotePanel }) ->
  { applyRoom(state | null), handleEvent(e), anchorOf(id) -> {x, y} | null, frame(dtSeconds), dispose() }
//   faces 알림을 모아 getFace(id) 로 모듈에 준다. 판이 연출 중(board.onBusy)이면 sheet 에 settled:false 를 준다.

// ui/sheet.js (Y3)
createSheet({ host, send, getFace }) -> { el, update(state, { settled }), flash(e /* ytScore */), anchor(id), dispose() }
// ui/result.js (Y3)
createResult({ host, getFace, getMe }) -> { el, update(state), dispose() }

// ui/board.js (Y4A)
createBoard({ host, stage, send, getFace, onBusy(bool) }) ->
  { el, update(state), handleEvent(e), frame(dt), resize(), dispose() }
// 그리는 쪽(2D·3D 공통 모양. Y4A 가 dice2d.js 로 2D 를, Y4D 가 dice3d.js 로 3D 를 만든다)
createDiceView({ host, stage }) ->
  { draw({ dice, shaking, cupHasDice }),           // 연출 없이 지금 모습(늦게 온 사람·재접속·상태 고침)
    playRoll({ seed, thrown, dice }) -> Promise,   // 컵에 담기 → 쏟기 → 구르기 → 멈춤. 끝나면 resolve
    playKeep({ i, on, slot, x, z, yaw }) -> Promise, setShaking(bool),
    hitOf(i) -> { x, y, w, h } | null,             // 주사위 i 의 화면 자리(host 기준 px). board 가 여기에 투명 버튼을 올린다
    skip(), frame(dt), resize(), dispose() }
```

- 조작은 항상 DOM 버튼이다(3D 를 직접 누르지 않는다). board 가 `hitOf(i)` 자리에 투명 버튼(`data-yt="die-i"`)을 올린다 → `?nogl=1` 과 3D 가 같은 방식으로 눌린다.
- 판의 틀: `.yt-root` 가 화면 전체(가로 전용. 세로는 사이트 `#rotate` 가 덮으므로 세로 배치를 만들지 않는다), 왼쪽이 점수표, 그 오른쪽에서 위 54px(상단 줄)을 뺀 곳이 판. 트레이는 판 영역 안에서 가장 큰 정사각형.
  점수표 폭은 점수표가 정한다: 높이 720 이상은 한 덩어리 `min(360px, 30vw)`, 720 미만은 두 덩어리(GDD 2-1, 844×390 에서 2명 약 400px · 4명 약 540px).
  index(Y6)가 `sheet.el` 의 실제 폭을 재어(ResizeObserver) `--yt-sheet-w` 를 `document.documentElement` 에 넣는다 → 판과 `.ytbar` 가 그 오른쪽에 붙는다.
- `data-yt` 표식: `cup`(컵 흔들기 버튼) `left`(남은 굴림 "N left", 숫자는 `data-n`) `die-0`~`die-4` `slot-0`~`slot-4`(보관 칸. 주사위가 있으면 `data-v="눈"`) `turn`(차례인 사람 이름) `idle`(대기 글)
  `wait`(끊긴 사람 기다림 글 "OO 재접속 기다리는 중 (n초)") `keephint`(보관 안내)
  `row-<칸>`(내 줄의 누르는 가로줄. 선택되면 `aria-pressed="true"`) `cell-<칸>-<줄번호>`(점수 칸 글자) `total-<줄번호>` `away-<줄번호>`("끊김") `drop-<줄번호>`("기권") `round` `pickmark`(남의 화면의 선택 강조) `result` `result-toggle` `combo`(족보 큰 글자)
  (차례 시간이 없으므로 `timer` 는 없다.)
  상단 줄: `bar-start` `bar-leave` `bar-emote` `bar-sound`.
- 각 주사위 버튼에는 `data-v`(눈), `data-x` `data-z`(멈춘 자리, 소수 3자리 글자)를 붙인다 → "모두 같은 자리" 시험이 이것을 비교한다.

## 4. 가짜 상태 (Y3·Y4A·Y4C 가 자기 시험 폴더의 `fixtures.js` 에 복사해 쓴다. 모양은 SPEC 19-3)

```js
const E = { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, choice: null,
            fourKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yacht: null };
const P = (id, name, x = {}) => ({ id, name, connected: true, awayUntil: null, spectating: false, ...x });
const C = (id, name, scores = {}, x = {}) => ({ id, name, left: false, scores: { ...E, ...scores }, upper: 0, bonus: 0, total: 0, ...x });
const base = { code: 'ABCD', mode: 'yacht', hostId: 'me', you: 'me', now: 1_000_000, gameNo: 1, rounds: 12,
               rollNo: 0, shaking: false, waiting: null, dice: null, preview: null, pick: null, last: null, result: null };

export const lobby = { ...base, phase: 'lobby', gameNo: 0, round: 0, turn: null, rollsLeft: 0,
  players: [P('me', '민수'), P('jiwoo', '지우')], cols: [C('me', '민수'), C('jiwoo', '지우')] };

export const myTurnFresh = { ...base, phase: 'playing', round: 1, turn: 'me', rollsLeft: 3,
  players: [P('me', '민수'), P('jiwoo', '지우'), P('seoyeon', '서연', { spectating: true })],
  cols: [C('me', '민수'), C('jiwoo', '지우')] };

const DICE = [ { v: 4, slot: 0, x: -2.1, z: 1.3, yaw: 0.4 }, { v: 4, slot: 1, x: 0.5, z: -1.8, yaw: 1.9 },
               { v: 6, slot: null, x: 2.2, z: 2.0, yaw: 2.7 }, { v: 4, slot: null, x: -0.6, z: 2.9, yaw: 0.1 },
               { v: 2, slot: null, x: 3.1, z: -0.4, yaw: 5.2 } ];
const MINE = { ones: 3, twos: 4, fours: 12, sixes: 12, fourKind: 29, smallStraight: 15, largeStraight: 30 };   // 7칸
const THEIRS = { ones: 1, twos: 6, sixes: 18, choice: 27, fullHouse: 28, yacht: 50 };                          // 6칸

export const myTurnRolled = { ...base, phase: 'playing', round: 7, turn: 'me', rollsLeft: 1, rollNo: 26,
  players: [P('me', '민수'), P('jiwoo', '지우')], dice: DICE,
  cols: [C('me', '민수', { ones: 3, twos: 4, fours: 12, sixes: 12, fourKind: 29, smallStraight: 15 }, { upper: 31, total: 75 }),
         C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 })],
  preview: { threes: 0, fives: 0, choice: 20, fullHouse: 0, largeStraight: 0, yacht: 0 }, pick: 'choice',
  last: { id: 'jiwoo', cat: 'yacht', score: 50 } };

export const otherTurn = { ...myTurnRolled, turn: 'jiwoo', preview: null, pick: 'threes',            // 남의 차례: 버튼·노란 숫자 없음, 선택 강조만
  cols: [C('me', '민수', MINE, { upper: 31, total: 105 }), C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 })],
  last: { id: 'me', cat: 'largeStraight', score: 30 } };

export const four = { ...otherTurn, turn: 'taeho', pick: null,                                        // 4명 + 끊김 + 기권
  players: [P('me', '민수'), P('jiwoo', '지우', { connected: false, awayUntil: 1_050_000 }), P('taeho', '태호')],
  cols: [C('me', '민수', MINE, { upper: 31, total: 105 }), C('jiwoo', '지우', THEIRS, { upper: 25, total: 130 }),
         C('taeho', '태호', { sixes: 24, fives: 20, fours: 16, threes: 9 }, { upper: 69, bonus: 35, total: 104 }),
         C('harin', '하린', { choice: 11 }, { total: 11, left: true })] };

export const waitingTurn = { ...four, turn: 'jiwoo', waiting: 'jiwoo', pick: 'choice' };          // 끊긴 사람 차례: 판이 멈추고 "지우 재접속 기다리는 중 (50초)", 버튼 0개

const FULL = (o) => Object.fromEntries(Object.keys(E).map((k) => [k, o[k] ?? 0]));
export const result = { ...base, phase: 'result', round: 12, turn: null, rollsLeft: 0,
  players: [P('me', '민수'), P('jiwoo', '지우')],
  cols: [C('me', '민수', FULL(MINE), { upper: 31, total: 105 }), C('jiwoo', '지우', FULL(THEIRS), { upper: 25, total: 130 })],
  result: { reason: 'done', winners: ['jiwoo'], ranks: [{ id: 'jiwoo', name: '지우', total: 130, rank: 1 }, { id: 'me', name: '민수', total: 105, rank: 2 }] } };

export const rollEvent = { k: 'ytRoll', id: 'me', seed: 123456789, thrown: [2, 3, 4], dice: DICE, rollsLeft: 1, rollNo: 26, combo: null };
export const yachtEvent = { k: 'ytRoll', id: 'me', seed: 42, thrown: [0, 1, 2, 3, 4], rollsLeft: 2, rollNo: 1, combo: 'yacht',
  dice: [-3, -1.5, 0, 1.5, 3].map((x, i) => ({ v: 6, slot: null, x, z: (i % 2) * 2 - 1, yaw: i })) };
export const dropEvent = { k: 'ytDrop', id: 'harin', reason: 'away' };
export const faces = { k: 'faces', items: [{ id: 'me', avatar: null }, { id: 'jiwoo', avatar: null }] };   // 사진 없음 = 이름 첫 글자
```

시험 페이지는 라이어와 같은 모양으로 만든다: `test/yacht/ui/<모듈>/{fixtures.js, harness.html, run.mjs}`
(본보기 `test/liar/ui/hud/`. vite 로 띄우고 Playwright 로 `data-yt` 를 눌러 본다. `PLAYWRIGHT_MODULE` 환경 변수).

## 5. 과제 지시문

모든 과제 공통(지시문 끝에 붙인다):
> 먼저 `docs/yacht/GDD.md`, `docs/SPEC.md` 19절, `docs/YACHT-PLAN.md` 0·1·3절과 네 과제 절을 읽는다. 네 워크트리 안에서만 일하고 자기 브랜치에 커밋만 한다. **푸시·병합 금지.**
> 네 파일 목록 밖은 고치지 않는다(필요하면 멈추고 보고). 기존 포커·라이어 시험 파일과 smoke 의 기존 줄, 라이어 폴더는 고치지 않는다.
> 느린 시각 확인(3D 스크린샷, 화면 크기 순회)은 하지 않는다. `Math.random` 금지. CSS 에 `zoom` 금지, 클래스는 네 접두사만.
> 반환(한국어 15줄 이내): 바꾼 것 / 확인한 것과 등급(① 자동 시험 ② 실제 서버 실제 클릭 ③ 가짜 데이터 화면 ④ 미확인) / 못 한 것 / 통합 구역에 필요한 변경.

### Y1 — 규칙 엔진과 뼈대 (Sonnet, 1차)
> **무엇·왜**: 요트다이스의 규칙 전부를 순수 함수로 만든다. 서버(Y2)가 이것만 불러 판정한다. (사용자 말 전문)
> **고쳐도 되는 파일**: `shared/yacht/constants.js` `score.js` `game.js` `protocol.js`, `test/yacht/score.test.js` `game.test.js` `protocol.test.js`,
> `package.json`(`test`·`test:unit` 에 `test/yacht/*.test.js` 추가만), `test/css.test.js`(규칙 하나 추가: `client/src/yacht/` 아래 CSS 의 클래스는 전부 `yt-` 로 시작. 파일이 아직 없어도 통과해야 한다. 기존 규칙은 그대로).
> **고치면 안 되는 파일**: 그 밖의 전부. `shared/yacht/sim.js` 는 Y1S 것이라 만들지 않는다 — `game.js` 는 굴림 자리 계산을 **주입받는다**: `roll(game, id, rng, place)` 에서 `place(seed, thrown) -> [{i, x, z, yaw}]`, `keep(…, place)` 의 빼기는 `freeSpot` 을 주입받는다(시험은 가짜 함수로).
> **약속**: GDD 3절(공식 룰 점수·예시 표)·5-3(기권)·6절·9절(문구), SPEC 19-3(상태·알림 모양), 이 문서 3-1(함수 모양). 시간 제한·자동 기록은 없다(`timeout`·`autoPick` 을 만들지 않는다).
> seed = `Math.floor(rng() * 2 ** 32)`, 눈 = `1 + Math.floor(rng() * 6)`(seed 와 따로), 순서 섞기는 rng 로 피셔-예이츠. 보관 칸은 왼쪽부터 빈칸. `pick` 은 굴림·보관·빼기·기록·차례 끝에 지운다(지워질 때 `ytPick{cat:null}` 알림).
> `viewOf` 의 `preview` 는 차례인 사람에게만, `pick` 은 모두에게.
> **끝났다는 증거**: `node --test test/yacht/*.test.js` 통과 수, `npm run check` 통과. 시험에 반드시: GDD 3-2 예시 표 20줄 전부, 보너스 62/63, 최고 합계 323, `comboOf` 우선순위, 요트를 채운 뒤 또 요트 → 추가 점수 없음,
> 씨앗 고정 rng 로 2·3·4명 한 판 끝까지(12바퀴, 차례 순서, 합계 = 칸 합 + 보너스), 차례 아닌 사람의 5가지 요청 거절과 상태 불변, 굴림 4번째 거절, 5개 보관 뒤 굴림 거절, 굴리기 전 keep·pick·score 거절, 채운 칸 거절,
> 기권(차례 중 → 기록 없이 다음 사람·주사위와 선택 지움 / 차례 아닐 때 → 그 사람 차례 건너뜀 / 1명 남음 → `alone` 우승 / 0명 → 우승자 없음, `ytDrop` 의 `reason`), 동점 공동 우승, 눈 분포(6만 번에 각 눈 9,000~11,000), `preview` 가 남에게 `null`, 알림·상태에 `auto`·`turnEndsAt` 이 없음.
> **하지 말 것**: 시계·타이머 넣기, DOM·네트워크 의존, `server/` 손대기.

### Y1S — 굴림 계산기 (Opus, 1차)
> **무엇·왜**: 사용자 지시 "모두 같은 주사위 위치·움직임"을 위해, seed 하나로 주사위가 컵에서 쏟아져 구르고 멈추는 경로를 계산하는 순수 함수를 만든다(GDD 4절). 서버는 멈춘 자리만, 화면은 경로 전체를 쓴다. (사용자 말 전문)
> **고쳐도 되는 파일**: `shared/yacht/sim.js`, `test/yacht/sim.test.js` 만.
> **약속**: 이 문서 3-1 의 `sim.js` 모양 그대로. 좌표는 GDD 4절. 새 의존성(물리 라이브러리)을 넣지 않는다 — 작은 강체 계산을 직접 만든다:
> 고정 간격(1/120초), 중력, 바닥·네 벽과 주사위 꼭짓점 8개의 충돌(튕김·마찰), 주사위끼리는 구(반지름 약 0.9)로 어림한 충돌이면 충분하다.
> 경로 계산에는 `+ − × ÷` 와 `Math.sqrt` 만 쓴다(`Math.sin` 등은 브라우저마다 끝자리가 다를 수 있다. 필요한 초기 회전은 seed 로 만든 벡터를 정규화해서). 마지막 `yaw` 계산에만 `Math.atan2` 허용.
> 반드시 유효하게 끝난다: 2.5초 안에 5개 모두 평평하게 멈추고, 중심이 |x|,|z| ≤ 4.0, 서로 2.1 이상. 안 되면 `seed + 1` 로 다시(최대 8번, 전부 결정적), 그래도 안 되면 정해진 격자 자리로 미끄러져 멈추는 경로(항상 성공).
> 멈추기 직전 0.2초는 가장 가까운 평평한 자세(`restQuat(up, yaw)`)로 부드럽게 맞춘다. 주사위는 `CUP` 자리 위에서 트레이 가운데 쪽으로 쏟아진다. 보기 좋게: 최소 0.9초는 구르고, 두 번 이상 튕긴다.
> **끝났다는 증거**: `node --test test/yacht/sim.test.js` — 같은 입력 두 번 = 완전히 같은 결과(`frames` 바이트까지), seed 2,000개 × 굴린 개수 1~5 에서 유효 조건 전부, 경로 중 바닥 아래·벽 밖으로 나간 프레임 0,
> `faceFix`: 모든 (up, v) 36쌍에서 `마지막 자세 × faceFix` 의 윗면 눈 = v 이고 마주 보는 면 합 7, `restQuat`·`freeSpot` 단위 시험, 소스에 `Math.random`·`Date` 없음(글자 검사), 한 번 계산 평균 30ms 이하(node), `frames:false` 는 5ms 이하.
> **하지 말 것**: three.js·DOM 쓰기, 눈(1~6)을 정하기(눈은 서버 난수), 그 밖의 파일 손대기.
> **미확인으로 보고**: 움직임이 "진짜 같아 보이는지"(실기기에서 사용자가 본다).

### Y2 — 서버 (Sonnet, 2차. Y1·Y1S 병합 뒤)
> **무엇·왜**: 요트 방과 사이트 서버의 이음매. 본보기는 라이어(`server/liar/room.js` 와 `docs/LIAR-MOVE.md` 3-1). (사용자 말 전문)
> **고쳐도 되는 파일**: `server/yacht/room.js`(새), `server/protocol.js`, `server/rooms.js`, `server/index.js`, `test/yacht/room.test.js`, `test/yacht-seam.test.js`, `test/yacht/e2e/*.test.js`(+ 필요하면 `test/yacht/e2e/helpers.js`), `package.json`(`test`·`test:e2e` 에 `test/yacht/e2e/*.test.js` 한 줄).
> **고치면 안 되는 파일**: `server/store.js`(`newUser` 포함), `shared/yacht/`(버그는 보고), 라이어 폴더, 기존 시험.
> **약속**: SPEC 19절 전부, GDD 5절(시간 제한 없음, 끊김 기다림·60초 기권)·7절·8절 2번·9절.
> - `protocol.js`: `MODES` 에 `'yacht'`, `case 'yt'`(= `lg` 와 같은 봉투 검사).
> - `rooms.js`: `createHub({..., yacht = 'off'})` → `hub.yacht`, `sendMe` 에 `yacht`. `MAX_PLAYERS.yacht = 4`. `create` 의 `mode==='yacht'`: off 면 거절, 아니면 `createYachtRoom(hub, newCode(hub))`.
>   `case 'yt': return room.yt ? room.yt(session, msg) : '알 수 없는 요청입니다.'`. `mode|act|play|liar` 분기의 `room.mode === 'liar'` 검사를 요트 방에도 적용, `mode:'yacht'` 문구. **포커 분기의 순서·동작은 바꾸지 않는다.**
> - `index.js`: `YACHT` 환경 변수(`LIAR` 줄과 같은 식: `test`/`on`/`off`, 없으면 `test`) → `hubOptions.yacht`. 요트 전용 시간 변수는 없다(끊김 유예는 기존 `GRACE_MS` → `timing.grace`).
> - `room.js` 가 hub 에 보여야 하는 것(rooms.js 가 이미 부르는 것): `code mode phase hostId members[{id, session, connected, grace}] timers member(id) clearTimer(name) join leave setConnected view sendExtras start emote chat addSound editSound playSound sendEvents push faceChanged yt`.
>   채팅·사운드는 포커 `Room` 과 같은 동작(기록 30개). 사진은 `faces`(라이어 `sendFaces`·`sendExtras`·`faceChanged` 와 같은 식). `joined`·`left`·`away`·`back` 알림.
> - 시간: **차례 타이머는 없다.** 끊김(`setConnected(id, false)`) → 사이트 공통 유예 타이머(`timing.grace`) 하나. 그 사람이 차례면 흔들기를 끝내고(`shake(game, id, false)` → `ytShake on:false`) 상태 `waiting = id`.
>   돌아오면(`setConnected(id, true)`) 유예 타이머를 지우고 `waiting = null`, 주사위·보관·남은 굴림·`pick` 은 그대로. 유예 끝(`graceExpired`)이면 진행 중인 판에서 `drop(game, id, 'away')` 후 방에서 뺀다(`left`). 나가기는 `drop(game, id, 'leave')`.
>   끊긴 사람이 차례가 아니면 판은 그대로 진행되고, 차례가 오면 그때 `waiting` 이 채워진다(남은 유예는 다시 세지 않는다).
> - `shake` 1초 4번·`pick` 1초 8번 초과는 조용히 버린다(계정 기준).
> - 판이 끝나면 `stats.yacht`(없으면 `{games:0, wins:0, best:0}`)를 고치고 `hub.persist` + `hub.sendMe`. 기권자는 기권하는 순간 `games + 1`.
> **끝났다는 증거**: `npm run check`, **`npm test` 전체**(통과 수·걸린 시간). 새 시험에 반드시:
> `YACHT=off` 에서 방 만들기 거절·`me.yacht`, `test`·`on` 에서 됨, 방 목록 `mode:'yacht'`·`max:4`, 5번째 입장 거절, 요트 방에서 `mode|act|play|liar|lg` 가 문구로 거절(서버 오류 아님), 포커·라이어 방에서 `yt` 거절, 포커 방 `mode:'yacht'` 거절,
> 가짜 시계로: 차례인 사람이 아무것도 안 하고 10분 → 상태 그대로(자동 굴림·기록 없음), 차례 중 끊김 → `waiting`·`ytShake off`·59초 뒤에도 그대로 → 돌아오면 같은 `dice`·`rollsLeft`·`pick` 으로 이어서,
> 60초 → `ytDrop{reason:'away'}`·`left:true`·다음 사람 차례, 차례 아닐 때 끊김 → 다른 사람 차례는 멈추지 않음·60초 뒤 기권·그 사람 차례 건너뜀, 끊긴 채 차례가 오면 남은 유예만큼만 기다림, 1명 남으면 `alone` 으로 끝, 방장 승계, 관전자 다음 판 참가,
> 방 상태에 `avatar`·`data:image` 글자가 없음, `preview` 는 차례인 사람만·`pick` 은 전원 같은 값, `ytPick` 이 전원에게 감, 재접속 직후 받은 상태의 `dice`(눈·보관·자리)가 끊기기 전과 같음,
> 상태의 `x,z,yaw` = `simulateRoll(seed, thrown).rest`, 판 끝 `stats.yacht` 저장(기존 계정에 `stats.yacht` 가 없어도 됨), 요트 방 타이머 오류가 다른 방을 끊지 않음, `reset` 뒤 방 없음.
> e2e(`test/yacht/e2e/`, 실제 서버·봇 2~3명, `GRACE_MS` 를 짧게): GDD 11절 시나리오 1·2·3·4.
> **하지 말 것**: 새 DB 표·열, hub 의 기존 함수 모양 바꾸기, 화면 파일 손대기.

### Y3 — 점수표와 결과 창 (Sonnet, 1차)
> **무엇·왜**: 화면 왼쪽 점수표(참고 화면 `design/yacht/ref/` 의 왼쪽)와 판 끝 순위 창. (사용자 말 전문 — 특히 ③④⑤)
> **고쳐도 되는 파일**: `client/src/yacht/ui/sheet.js` `sheet.css` `result.js` `result.css`, `test/yacht/ui/sheet/` `test/yacht/ui/result/`.
> **고치면 안 되는 파일**: 그 밖의 전부(`index.js`·`main.js`·`style.css` 는 Y6).
> **약속**: GDD 2절·**2-1절(두 덩어리)**·6-2절·7절, 이 문서 3-2(함수 모양·`data-yt`)·4절(가짜 상태). `shared/` 를 import 하지 않는다(점수·합계·예상 점수는 상태에 있다). 시안 `design/yacht/mock.html` 의 점수표 부분을 본보기로 한다.
> 1. 점수표: "턴 n/12", 줄마다 사진(`getFace(id)`, 없으면 이름 첫 글자)·이름, 12칸, 소계 `n/63`, 보너스(`+35` 또는 `+0`), 합계. 2~4줄. 차례인 줄은 노란 바탕. 끊긴 사람 "끊김"(`away-<줄번호>`), 기권 줄은 흐리게 + "기권"(`drop-<줄번호>`). `last` 칸은 잠깐 반짝(`flash`).
>    높이 720 이상: 한 덩어리 세로 점수표. **높이 720 미만: 두 덩어리**(왼쪽 1~6+소계·보너스 / 오른쪽 초이스~요트+합계, 나란히), 머리·12칸·합계 줄 높이 44px 이상, 이름 숨기고 사진만(mock 의 `@media (max-height: 719px)`).
>    844×390 에서 가로·세로 스크롤 없이 전부 보인다. 세로 배치는 만들지 않는다(가로 전용). 크기는 `calc(px * var(--k))` 또는 `transform: scale`.
> 2. 두 번 누르기: **`turn === you` 이고 `preview` 가 있고 `settled` 일 때만** 내 줄 빈칸에 노란 예상 점수가 보이고 그 가로줄(`data-yt="row-<칸>"`)이 눌린다.
>    첫 누름 → `send({t:'yt', a:'pick', cat})`, 선택된 칸(= `state.pick`)을 다시 누름 → `send({t:'yt', a:'score', cat})`. 다른 칸 → `pick` 으로 옮김. 강조는 **`state.pick` 만 보고** 그린다(내 화면·남의 화면 같은 모양. 누르자마자의 임시 강조는 해도 되지만 상태가 오면 상태를 따른다).
>    남의 차례·관전: 예상 점수 숫자 없음, 눌리는 요소 없음(`button` 을 만들지 않거나 `disabled`), `state.pick` 칸에 강조(`data-yt="pickmark"`)만.
> 3. 결과 창: GDD 7절. `data-yt="result"`, 접기·다시 열기 `result-toggle`. 내 전적은 `getMe().stats.yacht`(없으면 0).
> **끝났다는 증거**: `node test/yacht/ui/sheet/run.mjs`, `node test/yacht/ui/result/run.mjs` 출력, `npm run check`. 시험 페이지가 확인할 것: 가짜 상태 7개가 오류 없이 그려짐, 844×390 에서 두 덩어리이고 `row-*` 높이 44px 이상·1280×720 에서 한 덩어리, `four` 에서 `away-1`·`drop-3` 표시,
> `myTurnRolled` 에서 빈칸 6개만 눌림·중심점이 실제로 눌림(가림 검사), 첫 누름 = `pick` 한 번만 전송(score 없음), `state.pick` 을 넣은 뒤 같은 칸 = `score` 전송, 다른 칸 = `pick`,
> `settled:false` 면 예상 점수·버튼 없음, `otherTurn`·`waitingTurn`·관전(`you` 가 cols 에 없음)에서 버튼 0개·노란 숫자 0개·`pickmark` 1개, 4줄이 844×390 에 넘치지 않음(`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`), 이름에 `<b>` 를 넣어도 글자로 보임.
> **하지 말 것**: 선택을 화면 안에서만 처리하기(서버로 보낸다), 3D·주사위 그리기, 실제 서버 연결.
> **등급**: 이 과제의 확인은 ③(가짜 데이터)까지다. 실제 앱 확인은 Y6.

### Y4A — 주사위 판: 조작과 2D (Sonnet, 1차)
> **무엇·왜**: 화면 오른쪽 판의 눌리는 것 전부와, 3D 가 없을 때(`?nogl=1`, WebGL 실패)의 2D 그림. 이것만으로 게임을 끝까지 할 수 있어야 한다. (사용자 말 전문 — 특히 ①③)
> **고쳐도 되는 파일**: `client/src/yacht/ui/board.js` `board.css` `dice2d.js`, `test/yacht/ui/board/`.
> **약속**: GDD 2절·4절(좌표)·6-1절, 이 문서 3-2·4절. `shared/` 를 import 하지 않는다(Y4D 가 나중에 계산기를 연결한다).
> 1. 틀: 트레이(정사각형), 보관 칸 5개(트레이 위쪽 안), **"N left"**(`left`, 영어 그대로 — 주사위 그림 + 숫자 + `left`, mock 의 `.yt-left`), 차례인 사람 사진·이름(`turn`. 남은 시간은 없다), 방 대기 글(`idle`), 족보 큰 글자 자리(`combo`).
>    `waiting` 이 있으면 트레이 위에 "OO 재접속 기다리는 중 (n초)"(`wait`, `n` = 그 사람 `awayUntil − now` 를 초로, 0 아래로 내려가지 않음. 이름은 `textContent`).
>    보관 안내(`keephint`, GDD 6-1 Q21): 높이 720 이상은 내 차례·굴린 뒤·보관 가능·선택 없음일 때 늘 보임. 720 미만은 그 판(`gameNo`) 내 첫 차례(`round === 1`)의 첫 굴림(`rollsLeft === 2`) 연출이 끝난 뒤 3초 한 번만.
> 2. 조작(**`turn === you` 일 때만 요소가 있다**): 컵 흔들기 버튼(`cup`. 누르는 순간 `shake on`, 떼면 `shake off` + `roll`. 톡 눌러도 0.4초 뒤 굴림. 굴릴 수 없으면 없음),
>    주사위 버튼 `die-i`(`hitOf(i)` 자리의 투명 버튼. 트레이 주사위 → `keep on`, 보관 칸 주사위 → `keep off`. `rollsLeft === 0` 이면 없음). 연출 중에는 전부 막고 `onBusy(true/false)` 를 부른다.
>    남의 차례·관전: 버튼 0개. 주사위·컵 모습은 똑같이 보인다.
> 3. 2D 그림(`dice2d.js`, 3-2 의 `createDiceView` 모양): 위에서 본 트레이에 주사위를 상태의 `x, z, yaw` 자리에(트레이 단위 → px 는 곱하기만) 눈 점으로 그린다. 보관 주사위는 `slot` 칸에.
>    `playRoll` 은 컵 자리에서 멈춘 자리까지 0.5초 미끄러짐(`?nogl=1` 시험에서는 0.15초), `playKeep` 0.15초. `draw` 는 연출 없이 바로.
> 4. 알림 처리: `ytRoll`(같은 `rollNo` 는 한 번만) → `playRoll`, `ytKeep` → `playKeep`, `ytShake` → `setShaking`. 알림 없이 상태만 와도(재접속·늦은 입장) `draw` 로 지금 모습을 바로 그린다. 연출 중에 다음 알림이 오면 `skip()` 으로 끝내고 이어서.
> **끝났다는 증거**: `node test/yacht/ui/board/run.mjs` 출력, `npm run check`. 시험 페이지가 확인할 것: 가짜 상태 7개, `myTurnFresh` 에서 `cup` 을 누르고 떼면 `shake on` → `shake off` → `roll` 순서로 전송,
> `left` 글자가 "N left" 모양, `waitingTurn` 에서 `wait` 에 "지우"·"50" 이 보이고 버튼 0개, 844×390 에서 `rollEvent`(round 1 로 바꾼 것) 뒤 `keephint` 가 3초 보였다 사라지고 두 번째 굴림에는 안 뜸·1280×720 에서는 늘 보임, `timer` 요소 없음,
> `rollEvent` 뒤 `die-2..4` 의 `data-x`·`data-z`·`data-v` 가 상태와 같고 `die-0,1` 은 보관 칸에, 주사위 누름 = `keep` 전송(i·on 맞음), `otherTurn` 에서 버튼 0개인데 주사위 5개는 보임,
> 알림 없이 `myTurnRolled` 만 넣어도 같은 모습, 버튼 중심점 가림 검사, 844×390(점수표 두 덩어리 폭 약 540px 를 뺀 판)·1280×720 에서 트레이가 판 영역 안.
> **하지 말 것**: three.js import, 끌기 조작, 선택(`pick`) 다루기(점수표 것. 단 `roll`·`keep` 을 보내면 서버가 선택을 지운다), `Math.random`.

### Y4C — 3D 모델: 트레이·컵·주사위 (Fable — 디자인 감각이 필요한 과제, 1차)
> **무엇·왜**: 사용자 지시 "움직이는 것은 주사위와 컵뿐, 3D로 품질 높게". 움직임을 받아 그리기만 하는 장면을 만든다(움직임 계산은 Y1S, 재생은 Y4D). (사용자 말 전문)
> **고쳐도 되는 파일**: `client/src/yacht/scene/index.js` `tray.js` `cup.js` `die.js` `quality.js`, `test/yacht/ui/scene/`.
> **고치면 안 되는 파일**: `client/src/scene/stage.js`(모자라면 무엇이 필요한지 보고), 그 밖의 전부.
> **약속**
> ```js
> createYachtScene({ stage }) -> {
>   scene, camera,                         // index 가 stage.use(scene, camera) 로 건다
>   setRect({ x, y, w, h }, viewport),     // 트레이가 화면의 이 네모에 꼭 맞게(모든 기기에서 트레이 안 모습이 같게). 카메라는 고정 각도, 이때만 맞춘다
>   setDie(i, { pos: [x, y, z], quat: [x, y, z, w], fix: [x, y, z, w] }),   // 트레이 단위. fix = 면 배치 회전(3-1 faceFix)
>   setDieSlot(i, slot, v),                // 보관 칸에 눈 v 가 위로
>   setDieHidden(i, bool),                 // 컵 안에 있을 때
>   setCup({ mode: 'hidden' | 'rest' | 'shake' | 'pour', t }),   // t: 0..1 진행도(흔들기는 초). 컵 자리는 sim.js 의 CUP 과 같은 곳(값 3.4, 2.4 를 그대로 쓴다)
>   project([x, y, z]) -> { x, y },        // 화면 px (hitOf 용)
>   setQuality(0 | 1 | 2), resize(), dispose() }
> ```
> - 모양: 네모 트레이(둥근 모서리 금속 테, 계단 모양 안쪽 벽, 빨간 펠트 바닥), 보관 칸 5개(트레이 위쪽 안, 왼쪽부터), 가죽 느낌 컵(안쪽 빨강), 흰 주사위(모서리 둥글게, 파인 검은 눈. 1 과 4 는 빨강으로 해도 좋다), 나무 탁자 바닥. 번호 배치는 3-1.
>   참고 화면의 배치·분위기는 따르되 **닌텐도 고유 모양·무늬·글자·연필은 만들지 않는다.** 소재는 코드로 만든 캔버스 텍스처나 `client/public/assets/` 의 기존 CC0 소재. 새 파일을 받아 오지 않는다.
> - 카메라: 참고 화면처럼 거의 위에서 본 각도(조금 기울임). 움직이지 않는다. 조명 1~2개 + 주변광, 주사위 그림자가 바닥에 떨어진다.
> - 저사양 단계(`quality.js`): **2 높음** — 부드러운 그림자, 둥근 주사위 고운 모양, 펠트·금속 재질 / **1 보통** — 그림자 해상도 절반, 모양 단순화 / **0 낮음** — 실시간 그림자 없이 주사위 아래 둥근 그림자 판, 단순 재질.
>   시작 단계: `stage.isLowPower()` 면 0, 휴대폰(짧은 변 500px 이하)은 1, 그 밖은 2. 2초 동안 프레임 평균이 28ms 를 넘으면 한 단계 내린다(올리지 않는다). 화면 배율·그림자 끄기는 stage 가 이미 한다.
>   주사위 5개 + 트레이 + 컵의 삼각형 수는 단계 2에서 6만 이하.
> **끝났다는 증거**: `node test/yacht/ui/scene/run.mjs`(`?nogl=1`: 렌더러 없이 장면을 만들고 `setDie`·`setCup`·`setRect`·`project`·`setQuality 0/1/2`·`dispose` 가 오류 없이 돌고, `project` 가 트레이 네 귀퉁이를 `setRect` 네모의 네 귀퉁이 ±2px 로 돌려줌,
> `dispose` 뒤 geometry·material·texture 가 남지 않음), `npm run check`.
> **미확인으로 보고(④)**: 3D 모양·색·그림자·성능 전부(이 환경에 GPU 없음). 사용자가 실기기에서 볼 것을 적는다.
> **하지 말 것**: 움직임 계산(물리), DOM 버튼, 카메라 움직임, 스크린샷 찍기.

### Y4D — 3D 재생과 연출 (Fable, 2차. Y1S·Y4A·Y4C 병합 뒤)
> **무엇·왜**: 굴림 계산기의 경로를 3D 장면에서 재생해 모든 기기가 같은 움직임을 보게 하고, 컵 동작·족보 알림·소리를 붙인다. (사용자 말 전문 — 특히 ①②)
> **고쳐도 되는 파일**: `client/src/yacht/ui/dice3d.js`(새), `client/src/yacht/anim/player.js` `fx.js` `fx.css`, `client/src/yacht/audio.js`, `client/src/yacht/ui/board.js`(**그리는 쪽을 고르는 한 곳과 `combo`·소리 연결만**), `client/src/yacht/ui/dice2d.js`(계산기 연결만), `test/yacht/ui/roll/`.
> **약속**: GDD 4절·3-3절·8절 11번, 이 문서 3-1(`sim.js`)·3-2(`createDiceView`).
> 1. `dice3d.js`: `createDiceView` 모양의 3D 판. `stage.nogl` 이거나 WebGL 을 못 쓰면 board 는 `dice2d.js` 를 쓴다. 3D 코드는 `import()` 로 따로 불러 2D 만 쓰는 기기는 받지 않는다.
> 2. `playRoll({seed, thrown, dice})`: ① 트레이의 굴릴 주사위가 컵으로(0.3초) ② 컵 쏟기 ③ `simulateRoll(seed, thrown)` 의 `frames` 를 시간에 맞춰 재생(프레임 사이는 보간, 기기 속도와 무관하게 같은 시각에 같은 자리)
>    ④ 주사위마다 `faceFix(rest.up, dice[i].v)` 를 미리 걸어 멈췄을 때 서버 눈이 위 ⑤ 마지막 0.2초는 서버 자리(`dice[i].x, z, yaw` → `restQuat`)로 맞춰 끝냄. 보관 주사위는 움직이지 않는다.
>    `draw` 는 계산 없이 `restQuat(v, yaw)` 로 바로. `skip()` 은 즉시 끝 모습. `prefers-reduced-motion`: 마지막 0.4초만 재생.
> 3. 컵: `setShaking(true)` 동안 흔들림(모든 화면에서, `ytShake` 로), 굴릴 주사위가 있을 때만 컵 안에 주사위가 있는 것으로, 세 번 다 굴렸으면 컵을 치운다.
> 4. 연출(`fx.js`, `.yt-fx-`): `combo` 큰 글자(약 1.6초), `yacht` 면 색종이(DOM 또는 캔버스, 배치는 `prng(seed)`), 보너스 달성 `+35` 반짝, 우승 색종이. 줄인 연출에서는 색종이 없음. 누를 수 없다(`pointer-events: none`).
> 5. 소리(`audio.js`, Web Audio 합성): 컵 흔들기, 주사위 부딪힘(경로에서 튕기는 순간에 맞춰), 보관 딸깍, 기록, 족보·요트·우승, 내 차례. 사이트 음소거(`client/src/audio.js` 의 `isMuted()`)를 따른다.
> 6. `dice2d.js` 도 같은 계산기의 멈춘 자리(= 상태의 자리)를 쓰므로 바꿀 것이 없으면 그대로 둔다.
> **끝났다는 증거**: `node test/yacht/ui/roll/run.mjs`(`?nogl=1` 에서 3D 재생기를 가짜 장면으로: 같은 `rollEvent` 를 두 페이지에 넣으면 0.5초·1.0초·끝 시각의 다섯 주사위 자리가 같고, 끝 자리 = 상태 자리, 끝 윗면 눈 = 서버 눈(36쌍),
> `skip()` 직후 끝 모습, 재생 중 프레임을 일부러 건너뛰어도 끝 시각이 같음), `node --test test/yacht/*.test.js`, `npm run check`, 빌드 결과에서 3D 요트 코드가 따로 떨어진 묶음인지.
> **미확인으로 보고(④)**: 3D 움직임의 느낌, 소리, 색종이, 저사양 폰 성능, iPad/Safari.
> **하지 말 것**: 눈을 화면에서 정하기, `sim.js` 고치기(문제는 보고), 카메라·트레이 움직이기, `stage.js` 고치기.

### Y5 — 로비 (Sonnet, 1차)
> **무엇·왜**: 로비 "새 게임"에 요트다이스 칸. (사용자 말 전문)
> **고쳐도 되는 파일**: `client/src/ui/lobby.js`, `client/src/ui/lobby.css` 만.
> **약속**: 새 함수 `setYacht(보임)`. `MODES.yacht = { name: '요트다이스', desc: '2~4명 · 주사위 5개', max: 4 }`. `setYacht(true)` 전에는 화면이 지금과 완전히 같다(방 목록에서 요트 방 숨김 포함).
> 게임 고르기 칸 수 = 2(기본) + 라이어(켜짐) + 요트(켜짐) → 2·3·4칸 모두 미끄럼 표시가 맞아야 한다(순서: 홀덤, 블러핑, 라이어, 요트). 844×390 에서 4칸 글자가 잘리지 않는다.
> **방 대기 화면의 게임 바꾸기는 홀덤·블러핑 2칸 그대로**(요트 방에서는 로비가 뜨지 않는다). 전적 줄은 바꾸지 않는다. 클래스는 `.lb-` 만.
> **끝났다는 증거**: `npm run check`(기존 smoke 가 로비·라이어 칸 그대로임을 증명) + 커밋하지 않는 임시 스크립트로 `?nogl=1` 에서 `setYacht(true)` × `setLiar(true/false)` 네 조합의 칸 수·선택·방 만들기 전송(`{t:'create', mode:'yacht'}`), 방 목록의 요트 방 표시/숨김.
> **하지 말 것**: main.js·smoke.mjs 고치기, 라이어 랭킹 버튼 건드리기.

### Y6 — 통합 (Sonnet, 3차 혼자. Y2·Y3·Y4A·Y5 병합 뒤)
> **무엇·왜**: 요트 화면 모듈을 하나로 묶어 사이트에 연결하고, 실제 서버에서 실제 클릭으로 한 판이 되는지 확인한다. (사용자 말 전문)
> **고쳐도 되는 파일**: `client/src/yacht/index.js` `yacht.css`(새), `client/src/main.js`, `client/src/style.css`, `test/ui/smoke.mjs`, `test/ui/yacht-round.mjs`(새), `package.json`, `render.yaml`, `CLAUDE.md`, `README.md`.
> **고치면 안 되는 파일**: `hud.js` `pins.js` `lobby.js` `chat.js` `stage.js`, 라이어 폴더, 요트의 `ui/` `scene/` `anim/`(모자라면 멈추고 보고), 포커·라이어 분기의 순서·동작, smoke 의 기존 줄.
> **약속**: SPEC 19절, 이 문서 3-2. 본보기는 main.js 의 라이어 연결(`applyLiarRoom`, `withLiar`, `.lgbar`).
> 1. `index.js`(`mountYacht`): `.yt-root` 틀을 만들고 sheet·result·board 를 건다. `faces` 를 모아 `getFace`. `applyRoom(null)` 이면 숨기고 `stage.use(null)`. 3D 장면이 있으면 `stage.use(scene, camera)`.
>    `anchorOf(id)` = 점수표의 그 사람 사진 **아래쪽** 한 점(말풍선·이모티콘이 화면 위로 잘리지 않게. 잘리면 캡처와 함께 보고). `frame(dt)` 는 초.
>    `sheet.el` 의 실제 폭을 재어 `--yt-sheet-w` 를 `document.documentElement` 에 넣는다(3-2. 두 덩어리 ↔ 한 덩어리로 바뀔 때도). 사이트 `#rotate`(세로 안내)는 건드리지 않는다.
> 2. `main.js`: `me` → `lobby.setYacht(보임)`(SPEC 19-1). `room.mode === 'yacht'` → 포커 것을 비우고 로비 숨김, `.ytbar` 보임, 처음이면 `import('./yacht/index.js')`.
>    **라이어와 요트가 같은 줄(queue) 하나를 쓰게 한다**(지금의 `liarQ`). `stage.use` 는 하나뿐이라, 라이어 방 → 로비 → 요트 방으로 빨리 옮길 때 "라이어 끄기"가 "요트 켜기"보다 늦게 실행되면 요트 장면이 꺼진다.
>    알림: 사진·사운드는 emotePanel, `chat`·`chatLog` 는 채팅에 넣고, `emote` 포함 나머지는 `yacht.handleEvent`(포커 animator 에 넣지 않는다). 채팅은 항상 `chat.setMode('game')`(방 대기에서도).
>    `getAnchor` 는 요트 방이면 `yacht.anchorOf`. 오류 문구는 요트 방에서 항상 `toast`. `resetDone` 도 `applyRoom(null)`. 매 프레임 `yacht?.frame(dt / 1000)`.
> 3. `style.css`: `.ytbar`(전역). 점수표를 가리지 않게 **오른쪽 영역 위에만**(왼쪽 = `--yt-sheet-w`, 휴대폰 가로 4명이면 약 540px 라 남는 폭이 약 300px — 넘치지 않게 방 코드를 줄인다), 높이 54px. 방 코드 / 소리 켜기·끄기(`setMuted`) / 이모티콘 / 시작(방장 + `lobby`·`result`) / 나가기. `.lgbar` 는 고치지 않는다.
>    채팅 버튼(오른쪽 위 고정)과 겹치지 않게 한다.
> 4. `smoke.mjs`: 서버를 `YACHT: 'on'` 도 주고 띄우고, 기존 줄 뒤에 추가 — 요트 고르기 → 방 만들기 → 봇 1명 입장 → 가림 검사 → 시작 → (내 차례가 될 때까지 봇이 `roll`·`score`) → `cup` 누르고 떼기 → 봇이 `ytRoll` 받음 →
>    `die-n` 누름 → 봇이 `ytKeep` 받음·`slot-0` 에 주사위 → **`row-<칸>` 한 번 누름 → 봇이 `ytPick` 받고 `ytScore` 는 안 받음 → 같은 줄 한 번 더 → 봇이 `ytScore` 받음** → 봇 차례에 `cup`·`row-*` 버튼이 0개 → 가림 검사 → 나가기 → 로비 → 포커 방 만들기가 여전히 됨.
>    스위치 3줄: `YACHT=off` 숨김, `YACHT=test` 는 `?yacht=1` 없이 숨김·있으면 보임.
>    가로 전용 1줄: 요트 방에서 화면을 390×844 로 바꾸면 `#rotate` 가 보이고 `cup` 의 중심점을 누르면 `#rotate` 가 맞음(가림), 844×390 으로 돌리면 `#rotate` 숨김·`row-*` 높이 44px 이상.
> 5. `yacht-round.mjs`(본보기 `test/ui/liar-round.mjs`): 창 2개 + 늦게 들어오는 창 1개(`?nogl=1`)로 12바퀴 끝까지. 매 차례 굴린 뒤 두 창의 `die-*` `data-x`·`data-z`·`data-v` 가 같은지, 중간에 들어온 관전 창도 같은지, 관전 창에 버튼이 없는지,
>    한 번은 **자기 차례에 굴린 뒤** 창을 닫았다 다시 열어(재접속) — 그 사이 다른 창에 `wait`("OO 재접속 기다리는 중")가 보이고 버튼이 없으며, 돌아온 뒤 같은 눈·보관·남은 굴림으로 이어서 하는지,
>    끝나면 `result` 창과 합계 = 칸 합 + 보너스, 방장 `bar-start` 로 새 판이 시작되고 관전자가 줄에 들어오는지. `package.json` 의 `test` 끝에 `&& node test/ui/yacht-round.mjs`.
> 6. `render.yaml`: `YACHT` 키(값 `test`, `LIAR` 줄과 같은 설명). `CLAUDE.md`: 이 문서 7절 초안. `README.md`: 스위치 한 줄.
> **끝났다는 증거**: `npm run check`, **`npm test` 전체**, `node test/ui/yacht-round.mjs` 출력, smoke 의 새 줄 목록, 844×390·1280×720 `?nogl=1` 캡처 5장(방 대기, 내 차례 굴린 뒤, 남의 차례, 끊긴 사람 기다림, 결과 — 상단 줄·채팅 버튼·점수표가 안 겹침. 844×390 은 두 덩어리),
> `YACHT=off` 로 띄운 로비 캡처(지금과 같음), 빌드 결과에서 요트 코드가 따로 떨어진 묶음인지.
> **미확인으로 보고(④)**: 3D 모양·연출·소리·iPad/Safari·저사양 폰.
> **하지 말 것**: 요트 모듈 안의 버그를 직접 고치기(보고), 포커·라이어 동작 바꾸기, 푸시.

### Y7 — 실행 시험 (Y6 과 다른 Sonnet. 코드를 고치지 않는다)
> 실제 서버(`YACHT=on`, 메모리 저장, `GRACE_MS` 기본 60초) + 빌드된 화면 `?nogl=1` + 창 2~4개로: ① 4명 한 판 끝까지 + 다음 판 ② 차례 아닌 창·관전 창에서 누를 것이 없는지 ③ 한 번 눌러 둔 칸이 다른 창에도 강조되는지, 그대로 2분 → 아무 일도 없는지(시간 제한 없음), 채운 칸이 다시 안 눌리는지
> ④ 차례인 창을 닫음 → 다른 창에 "OO 재접속 기다리는 중", 판 멈춤 → 60초 안 재접속하면 그대로 이어짐 / 다시 닫고 60초 넘김 → 기권·"기권" 표시·차례 건너뜀 / 차례 아닌 창을 닫음 → 다른 사람 차례는 계속, 60초 뒤 기권
> ⑤ 요트 방에서 나와 홀덤 한 판·라이어 방 만들기(그대로인지) ⑥ `YACHT=off`·`test`·`?yacht=1` ⑦ 채팅 말풍선·이모티콘이 점수표 사진 근처에 뜨는지 ⑧ 844×390 두 덩어리 점수표·"N left"·첫 굴림 보관 안내 3초, 390×844 세로 안내.
> 증거: 단계별 캡처 경로, 서버 기록, 콘솔 오류 0. 이상한 점은 고치지 말고 적는다.

## 6. 위험 (큰 것부터)

1. **직접 만든 굴림 계산기의 품질** — "진짜처럼" 구르는지는 실기기에서만 알 수 있다. 막는 법: 눈과 멈춘 자리는 계산기 품질과 무관하게 항상 맞다(서버 값). 느낌이 부족하면 Y1S 만 다시 만들면 된다(약속이 같으면 다른 곳은 안 바뀐다).
2. **3D 를 이 환경에서 볼 수 없다**(GPU 없음) — Y4C·Y4D 는 전부 ④ 미확인으로 넘어간다. `?nogl=1` 2D 로는 끝까지 된다. `YACHT=test` 로 올린 뒤 사용자 실기기 확인이 필수.
3. **rooms.js·main.js 는 포커·라이어의 심장** — 기존 시험·smoke 줄을 안 고치고 통과, `YACHT=off` smoke, Opus 가 두 파일 변경을 줄 단위로 본다.
4. **`stage.use` 가 하나** — 라이어와 요트가 번갈아 쓸 때 순서(Y6 의 2번).
5. **휴대폰 가로에서 판이 좁다** — 점수표를 두 덩어리로 나눠 칸 높이 44px 를 얻은 대신 4명이면 판 폭이 약 300px. 트레이·컵 버튼이 작아 보이는지 실기기에서 사용자가 확인.
5-1. **끊긴 사람 기다림** — 차례 시간이 없어 한 사람이 끊기면 최대 60초 멈춘다(사용자 결정). 끊기지 않고 손을 놓은 사람은 끝없이 기다린다 — 방장 권한(내보내기)은 1차에 없으므로 나머지는 나가기만 할 수 있다. 문제가 되면 사용자에게 다시 묻는다.
6. **말풍선 자리** — 점수표 사진이 화면 맨 위라 말풍선이 위로 잘릴 수 있다. chat.js 는 고치지 않으므로 기준점을 아래로 내린다. 안 되면 채팅 구역 과제를 따로.
7. **기기마다 소수 계산이 다를 가능성** — 경로 중간이 미세하게 다를 수 있으나 끝은 서버 자리로 맞춘다. 사칙연산과 제곱근만 쓰게 해 차이를 없앤다.
8. **무료 서버** — 방 상태에 사진 없음(시험으로 지킴). 굴림마다 서버 계산 수 ms.
9. `YACHT` 가 없을 때 `test`(주소를 아는 사람은 만들 수 있음) — 라이어와 같은 선택이다. 완전히 끄려면 Render 에 `YACHT=off`.

## 7. CLAUDE.md 에 넣을 문구 초안 (Y6 이 넣는다. 지금은 고치지 않는다)

구역 목록에 추가:
```
- 요트다이스: shared/yacht/, server/yacht/, client/src/yacht/, test/yacht/, docs/yacht/ (한 과제는 그 안의 한 모듈만. 모듈·접두사는 docs/YACHT-PLAN.md 1절:
  규칙 shared/yacht/{constants,score,game,protocol}.js, 굴림 계산기 shared/yacht/sim.js, 점수표 .yt-sc-, 결과 .yt-rs-, 판 .yt-bd-, 연출 .yt-fx-, 3D 모델 client/src/yacht/scene/. 요트 CSS 클래스는 전부 `.yt-`)
```
통합 구역 줄에 `client/src/yacht/index.js, yacht.css` 를 더한다.

새 절:
```
## 요트다이스 (같은 사이트 안의 세 번째 게임)
- 스위치 환경 변수 `YACHT`: `off` / `test`(주소에 `?yacht=1` 일 때만 버튼 보임, 설정이 없을 때의 값) / `on`. render.yaml 은 `test`. 사용자 실기기 확인 뒤 `on`.
  규칙은 docs/yacht/GDD.md, 통신은 SPEC 19절.
- 반드시 지킬 약속: 눈·seed·차례 순서는 서버가 crypto 난수로만(요트 폴더에 Math.random 금지). 화면은 서버가 준 눈과 멈춘 자리로 끝낸다.
  모든 사람(관전자 포함)이 같은 트레이·같은 주사위 자리·같은 움직임을 본다. 움직이는 것은 주사위와 컵뿐. 차례인 사람만 조작(화면에 버튼이 없고 서버도 거절).
  점수 칸은 두 번 눌러 기록하고 첫 누름(선택)은 방 전체에 보인다. 차례 시간 제한 없음(자동 굴림·기록 없음). 끊긴 사람 차례는 멈추고 기다리며, 끊긴 지 60초(GRACE_MS)면 기권.
  가로 전용(세로는 사이트 #rotate 안내, 세로 배치 없음). 휴대폰 가로는 점수표 두 덩어리. 시간은 서버가 잰다. 사용자 글자는 textContent 로만.
- 요트 전용 요청은 전부 `{t:'yt', a: 종류, ...}`. 요트 방 상태에는 프로필 사진을 넣지 않는다(`faces` 알림).
- main.js 의 요트 연결: `import('./yacht/index.js')` 로 따로 불러온다. 상단 줄은 `.ytbar`(style.css). 라이어와 같은 대기 줄을 쓴다(stage.use 는 하나).
- `npm test` 는 요트 한 판(test/ui/yacht-round.mjs)을 포함한다. 새 요트 화면이 생기면 smoke.mjs 와 거기에 클릭 한 줄을 추가한다.
- 3D 주사위·컵·소리·저사양 폰은 항상 "미확인(실기기 확인 필요)"으로 보고한다. `?nogl=1` 은 2D 판으로 끝까지 된다.
```
