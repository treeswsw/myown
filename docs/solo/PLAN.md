# 혼자 놀기 (일곱 번째 모드 `solo`) — 약속

상태: **기획 확정(2026-11-14). 코드는 이 문서대로.** 이 문서가 혼자 놀기의 GDD 다(SPEC 에는 25절 요약 + 7-5 통신만 옮긴다).
사용자 요청(2026-11-14): "사과 게임 똑같이. 2048·사과 게임·수박 게임 만들기 시작. 공통 로직은 붙일 때부터 잘 이어지게, 나중에 수정 편하고 오류 없게.
코인 고려, 호환, 공통 코드 일관성." + "혼자 놀기에는 랭킹: 종목별 최고 점수와 닉네임. 게임 고를 때 확인할 수 있게."
앞으로 혼자 하는 점수 게임을 계속 추가한다. 이번 3종: `g2048`(2048), `apple`(사과 게임), `suika`(수박 게임).

## 0. 핵심 결정 (한눈에)

1. **모드 하나 `solo` + 종목 표.** 방·시작·끝·결과·코인·기록·순위는 "혼자 놀기 틀"이 전부 한다. 종목 추가 = 규칙 파일 1 + 판 화면 폴더 1 + 표 2줄(shared·client) + 코인 줄 1.
2. **사이트 공용 방 틀 그대로**(NEW-GAME 2절). 혼자 놀기 방 = 사람 1명이 하는 방(대기실 없이 바로 시작). 다른 사람이 방 코드로 들어오면 구경(점수만 보임).
3. **점수는 서버가 센다 — "조각 전송 + 서버 같이 돌리기".** 서버가 crypto seed 를 주고, 화면은 shared 엔진으로 진행하며 입력을 1초마다 조각으로 보낸다. 서버는 **같은 엔진을 같은 입력으로 조금씩** 돌린다. 화면이 보낸 점수는 믿지 않는다.
   끝에 한꺼번에 재생하지 않으므로 서버가 멈칫하지 않고(수박 물리 포함), 끊기거나 나가도 서버에 그때까지의 점수가 있다.
4. **수박 물리는 직접 만든 원(圓) 전용 고정 간격 엔진**(1/60초, `+ − × ÷ Math.sqrt` 만). matter.js 는 쓰지 않는다(삼각함수 때문에 Safari 와 서버 결과가 달라질 수 있고 무겁다).
5. **코인**: 점수 문턱을 넘을 때마다 1코인(종목마다 문턱 표), 판당 최대는 관리자 설정, **혼자 놀기 전체 하루 60코인 상한**(coin_log 합, 한국 시간). 최소 간격 없음.
6. **기록·순위**: `users.solo jsonb` 한 칸(종목별 최고·날짜·판 수·이번 주 최고). 순위는 종목별 상위 20 + 내 순위, **전체 / 이번 주** 두 탭. 로비에서 종목을 고르면 바로 보이고, 결과 화면에 "새 기록 · n위".
7. 봉투 `{t:'so', a}`, 오류 `so_`, CSS `.so-`(틀) / `.so-g2-` `.so-ap-` `.so-sk-`(종목), 스위치 `SOLO`(서버 기본값 `on` — 2026-11-14 사용자 요청으로 공개, render.yaml 도 `on`; 끄려면 `off`/`test`).

## 1. 구조와 경계

### 1-1. 폴더
```
shared/solo/index.js      종목 표 SOLO = {id: 엔진}, IDS, NAMES (표 순서 = 로비 순서)
shared/solo/rng.js        seed 난수 (정수 연산만)
shared/solo/run.js        진행기: 엔진 + 입력 기록 (화면·서버가 같은 것을 쓴다)
shared/solo/coin.js       coinsFor(엔진, 점수, rules) / weekOf(t) / dayOf(t)
shared/solo/settings.js   SETTINGS(대기실 종목 고르기 한 칸 `game`), OWN = []
shared/solo/name.js       GAME_NAME = '혼자 놀기'
shared/solo/<id>.js       종목 규칙 엔진 (g2048.js, apple.js, suika.js)
server/solo/room.js       makeSoloGame(ctx, opt) — 틀(서버). 종목 이름을 모른다
server/solo/rank.js       hubMsg: {t:'so', a:'rank'} (방 밖에서도 답함)
client/src/solo/index.js  mount(ctx) — 틀(화면): 카운트다운·점수 줄·보내기·끝·결과 칸·구경
client/src/solo/games.js  판 화면 불러오기 표 {id: () => import('./<id>/board.js')}
client/src/solo/rank.js   순위 창·순위 칸(로비와 결과가 같이 씀), sfx.js(공용 효과음 이름표), solo.css(.so-)
client/src/solo/<id>/     board.js + <id>.css (종목 판 화면)
test/solo/                틀 시험 + 종목별 엔진 시험 + golden/ (기록해 둔 한 판)
```

### 1-2. 틀이 맡는 것 / 종목이 주는 것
| 일 | 틀 (공용) | 종목 |
|---|---|---|
| 방 만들기·바로 시작·나가기·끊김·방장 | 사이트 Shell + `server/solo/room.js` | 없음 |
| seed, 카운트다운(3초), 시간 제한, 최대 시간 | 서버 틀 | `limitMs`, `maxMs` |
| 입력 조각 받기·순서·속도 검사·서버 같이 돌리기 | 서버 틀 + `shared/solo/run.js` | `create/input/step/score/over` |
| 점수 줄(점수·최고·남은 시간), 그만하기, 구경 화면 | 화면 틀 | 없음 |
| 끝 판정 뒤 정산: 코인·하루 상한·기록·순위 | 서버 틀 | `coin` 문턱 표 |
| 결과 화면 | 사이트 공용 `room/result.js` + 틀의 `resultTitle/resultPart` | 없음 |
| 다시 하기 / 다른 종목 | 공용 결과의 "다시 시작"(`start`) / "대기실로" → 대기실 설정 `game`(`set`) | 없음 |
| 효과음 장치 | `ctx.sound` + `solo/sfx.js` 이름표 | 어느 때 무슨 이름을 낼지 |
| 판 그림·조작·움직임 | 없음 | `client/src/solo/<id>/board.js` |

종목 폴더에는 타이머·통신(`send`)·코인·기록·결과 화면 코드가 없다. 틀 파일에는 종목 이름 분기(`if (game === 'apple')`)가 없다.
일시정지 버튼은 없다: 사과는 서버 시계로 2분, 2048·수박은 손을 떼면 멈춘 것과 같다(수박은 화면이 가려지면 걸음이 멈춘다).

### 1-3. 엔진 약속 `shared/solo/<id>.js` (순수, DOM·시간·통신 없음)
```js
export default {
  id: 'apple', name: '사과 게임', desc: '합이 10이 되게 묶기 · 2분',
  limitMs: 120000 | null,   // 서버 시계 제한. null = 제한 없음
  maxMs: 3600000,           // 한 판 최대 시간(넘으면 서버가 그때 점수로 끝냄)
  tick: false | true,       // true = 1/60초 고정 걸음이 있는 종목(수박)
  rate: 30,                 // 초당 최대 입력 수(서버 속도 검사)
  maxV: 28899,              // 입력 값의 최대(0 이상 정수)
  coin: [40, 70, 90, ...],  // 점수 문턱(오름차순). 넘은 문턱 수 = 코인
  create(seed) → state,     // seed: uint32. state 안에 rng 상태를 든다
  input(state, v) → bool,   // 입력 하나. 안 되는 입력이면 false 이고 state 는 그대로
  step(state),              // tick 종목만: 한 걸음
  score(state) → 정수, over(state) → bool,
};
```
- state 는 바꿔 써도 된다(복사 불필요). `state.ev = []` 에 그 걸음의 연출 사건(`{k:'merge', ...}`)을 넣는다(진행기가 걸음 전에 비움, 화면 전용).
- **결정성 규칙(어기면 서버·화면 점수가 갈린다)**: `shared/solo/` 에서는 `Math.random Date performance Math.sin cos tan atan atan2 pow exp log hypot cbrt` 금지. 쓸 수 있는 것: 정수 연산, `+ − × ÷`, `Math.sqrt abs min max floor ceil round trunc imul`. 배열만 돌고(객체 키 순서에 기대지 않음), 정렬은 정수 비교 함수로. `test/solo/pure.test.js` 가 금지 글자를 검사한다.

### 1-4. 진행기 `shared/solo/run.js` (화면·서버 공용 — 기록 모양이 여기서만 정해진다)
```js
createRun(engine, seed) → run
run.input(v) → bool      // 엔진 input. 성공하면 기록에 v 를 붙인다
run.step()               // tick 종목: 한 걸음 + 기록(연속 걸음은 음수 하나로 합침: −k = k 걸음, 한 칸 최대 600)
run.feed(ops, budget?) → {ok, used, left}   // 서버: 기록 조각을 그대로 적용. 잘못된 입력이면 ok:false. budget = 이번에 돌릴 최대 걸음, left = 못 돌린 나머지 기록
run.take() → ops         // 화면: 아직 안 보낸 기록을 꺼낸다
run.state, run.n(지금까지 기록 칸 수), run.ticks, run.score(), run.over()
```
기록(ops) = 정수 배열. `0 이상` = 입력 값, `음수` = 그만큼의 걸음. tick 이 false 인 종목에 음수가 오면 잘못된 입력.

### 1-5. 판 화면 약속 `client/src/solo/<id>/board.js`
```js
export function mountBoard(el, api) → { reset(state), apply(evs), frame(dt)?, lock(on), unmount() }
// api = { state() 엔진 상태(읽기만), input(v) → bool, sfx(name, n?), reduced: 움직임 줄이기 여부 }
```
- `reset(state)`: 판 시작·다시 그리기. `apply(evs)`: 입력·걸음 뒤 `state.ev`. `frame(dt)`: 매 화면 갱신(틀의 rAF 하나). `lock(true)`: 카운트다운·끝난 뒤 조작 막기.
- 판은 `el` 크기에 맞춰 비율을 지키며 줄고 는다(`zoom` 금지). 조작은 `api.input` 으로만. 점수·시간·버튼은 틀이 그린다(판은 그리지 않는다).
- tick 종목: 틀이 `1/60초` 누적기로 `run.step()` 을 부르고 `frame(dt)` 를 부른다(한 화면에 최대 5걸음, 느린 기기는 게임이 천천히 간다). 판은 걸음을 직접 돌리지 않는다. 세계가 잠들면(`state.asleep`) 틀이 걸음을 멈춘다(기록도 안 늘어남).

## 2. 서버 틀 `server/solo/room.js`

### 2-1. 방
- 등록표: `solo: { name: '혼자 놀기', min: 1, max: 4, flag: 'solo', msgs: ['so'], err: 'so_', css: 'so-', coin: null, chat: CHAT, settings: SOLO_SET, own: [], listed: false, create: (m) => ({game}) }`.
  `max 4` = 하는 사람 1 + 구경 3. `coin: null` = 판 코인은 `ctx.finish` 의 적립표가 아니라 `hub.grant`(체스 퍼즐과 같은 길).
- **공용 쪽에 더하는 칸 3개(게임 이름 분기 대신. 미니도 같이 옮긴다)**:
  `shared/games.js` `create(m)`(방 만들기 요청의 추가 칸을 걸러 돌려줌 — protocol.js 의 `mode === 'mini'` 분기를 이것으로), `listed`(false 면 로비 방 목록에 안 나옴. 없으면 true),
  `server/games.js` `autoStart(opt)`(true 면 만들자마자 `start` — rooms.js 의 `mode === 'mini'` 분기를 이것으로). solo 는 언제나 true.
- 하는 사람 `pid` = 시작을 누른 방장. 그 밖의 멤버는 `players[].spectating: true`. 하는 사람이 나가면 그 판은 그때 점수로 정산하고 방장이 넘어간다(새 방장이 `start` 하면 자기 판).
- 관리자 봇 없음(`bot: false`). 관전 계정은 공용 그대로(`view` 가 자리 없는 id 에 seed 없는 상태).

### 2-2. 단계
`lobby`(대기실: 자동 시작이 실패했거나 "대기실로") → `ready`(3초) → `play` → `settle`(정산 중, 보통 0.1초) → `end`(공용 결과). `isWaiting` = lobby·end.
- `onStart`: seed = `ctx.rng` 로 uint32, `startAt = now + 3000`, `endsAt = limitMs ? startAt + limitMs : null`. **seed 는 `play` 가 된 뒤 하는 사람에게만 보낸다**(ready 동안은 아무에게도, 구경꾼에게는 끝까지 안 보냄).
- 타이머(전부 `ctx.timer`): `go`(startAt → play, push), `limit`(endsAt + 1500ms → 정산 `time`), `max`(startAt + maxMs → 정산 `max`), `pump`(밀린 걸음 처리).
- 끝나는 이유 `reason`: `over`(엔진이 끝) / `time`(제한 시간) / `quit`(그만하기) / `leave`(나감·60초 끊김) / `max`.

### 2-3. 입력 받기 `{a:'in', n, ops}`
1. `play` 가 아니거나 보낸 사람이 pid 가 아니면 거절(`so_now` / `so_spec`).
2. `n` 이 서버가 받은 칸 수와 같아야 한다. 작으면 조용히 버림(다시 보낸 것), 크면 `so_sync`(화면이 서버 `so.n` 부터 다시 보냄).
3. 시간: `endsAt` 가 있으면 `now ≤ endsAt + 1500` 일 때만 받는다(늦은 조각은 버림 — 서버 시계 기준).
4. 속도: 입력 수 ≤ `(now − startAt)/1000 × rate + 60`, 걸음 수 ≤ `(now − startAt)/1000 × 60 × 1.25 + 300`. 넘으면 `so_fast` 로 그 조각을 버린다(판은 계속).
5. 적용: `run.feed`. 잘못된 입력(`ok:false`)이면 그 판은 **그 자리에서 정산**(`reason:'over'`, 그때까지의 서버 점수) + `console.error`.
6. 걸음이 많으면 한 번에 240걸음까지만 돌리고 나머지는 `ctx.timer('pump', 0)` 으로 이어서(서버가 다른 방을 막지 않게).
7. 조각을 다 적용했는데 `run.over()` 면 정산(`over`). 구경꾼이 있으면 `ctx.emit([{k:'soProg', score, n}], 구경꾼들)` (조각마다 한 번, 방 상태 push 는 안 함).
- `{a:'end', score}`: 하는 사람. 밀린 걸음을 다 돌린 뒤 정산(`over` 면 `over`, 아니면 `quit`). `score` 가 서버 점수와 다르면 `console.error('solo desync', …)` + 결과에 `desync: true`(서버 점수가 기록).
- 서버는 입력 기록을 쌓아 두지 않는다(엔진 상태만). 그래서 **새로 고침하면 그 판은 이어 할 수 없다**: 화면 틀이 "이어 할 수 없어 지금 점수로 끝냅니다" 알림 뒤 `end` 를 보낸다. 같은 화면에서 잠깐 끊겼다 붙은 것은 `so.n` 부터 다시 보내 이어 간다.

### 2-4. 정산 (한 판에 한 번, `settled` 깃발)
1. `score = run.score()`. 타이머 정리, `phase = 'settle'`.
2. 기록: `user.solo[game]` 갱신(4절) → `hub.persist`, `hub.sendMe`.
3. 코인: `want = coinsFor(engine, score, rules)`. 줄 세워(퍼즐과 같은 방식의 `hub.soloQ`) `before = store.earnedOn(uid,'solo',day)` → `give = min(want, max(0, cap − before))` → `hub.grant(room, uid, give, {mode:'solo', game, day, win:true})`.
4. 순위: `store.soloRank(uid, game, null)` 과 `(…, week)`.
5. `ctx.finish([{id: pid, rank: 1, score}], {add: {by: {[pid]: got}}})` → `phase = 'end'` → `ctx.push()`. 하는 사람이 이미 나갔으면(`leave`) 2·3 만 하고 finish 는 빈 줄로.
- 관리자 봇이 있는 방·봇 계정은 `hub.grant` 가 0 을 준다(기존 그대로).

## 3. 코인 (SPEC 22-2 에 줄 추가)

`shared/coin/rules.js` `COIN_RULES` 에 네 줄(관리자 세부 설정에서 바뀜, `finish` 칸만 쓴다 — 퍼즐과 같은 방식):
| 줄 | finish | 뜻 |
|---|---|---|
| `solo_g2048` | 10 | 2048 한 판 최대 코인 |
| `solo_apple` | 7 | 사과 게임 한 판 최대 코인 |
| `solo_suika` | 8 | 수박 게임 한 판 최대 코인 |
| `solo_cap` | 60 | **혼자 놀기 전체** 하루 상한(한국 시간 자정 초기화). 종목이 늘어도 상한은 하나 |

(`win: 0, gapMs: 0`.)

`coinsFor(engine, score, rules)` = `min(rules['solo_'+id].finish, 넘은 문턱 수)`. 문턱은 엔진의 `coin` 배열(코드 값, 관리자 화면에 없음):
| 종목 | 문턱(점수) | 보통 실력 한 판 |
|---|---|---|
| g2048 | 1000, 3000, 6000, 10000, 15000, 20000, 30000, 45000, 70000, 100000 | 1024 타일(약 1만 점, 5~8분) = 4코인, 2048 타일(약 2만 점) = 6코인 |
| apple | 40, 70, 90, 105, 120, 135, 150 | 70~90점(2분) = 2~3코인 |
| suika | 300, 700, 1200, 1800, 2400, 3000, 3600, 4500 | 2000점 안팎(5~8분) = 4코인 |

- 균형 근거: 미니게임 한 판 이김 3코인/5~10분, 체스 퍼즐 문제당 1~5·하루 100. 혼자 놀기는 상대가 필요 없어 반복하기 쉬우므로 분당 벌이는 퍼즐 이하로, 하루 상한은 퍼즐보다 낮게(60) 잡았다.
- **최소 간격 없음**: 점수 문턱이 "대충 하고 끝내기"를 막고(낮은 점수 = 0코인), 하루 상한이 총량을 막는다.
- 상한에 닿으면 계속 할 수 있고 기록·순위는 오른다. 결과에 "오늘 코인 다 받음 (60/60)".
- 하루 합은 `store.earnedOn(uid, 'solo', day)`(coin_log note `{mode:'solo', day}` 합 — 이미 있는 함수, 재시작에도 유지).
- 알고 있는 한계(친구끼리 쓰는 사이트라 받아들임): seed 가 화면에 있으므로 개발자 도구로 다음 타일·과일을 미리 볼 수 있고, 자동 풀이 프로그램을 막지 못한다. 피해는 하루 60코인과 순위 한 줄로 묶인다.

## 4. 저장과 순위

### 4-1. 저장 (`server/store.js`, 22-1 의 puzzle 칸과 같은 방식)
- `users.solo jsonb`(`ALTER TABLE users ADD COLUMN IF NOT EXISTS solo jsonb`). `newUser`·`normalizeUser`·`rowToUser`·`save`(INSERT·UPDATE 문장 전부)·`getOrCreate`·메모리 저장소 모두 다룬다(빠지면 통째 저장이 지운다).
- 모양: `{ [종목 id]: { best, at, n, wk, wbest, wat } }` — `best` 최고 점수, `at` 그 기록을 세운 시각(ms), `n` 끝낸 판 수, `wk` 주 번호, `wbest`·`wat` 그 주의 최고와 시각. 1인 1줄 = 개인 최고.
  주 번호 `weekOf(t)` = 한국 시간 월요일 0시에 바뀌는 정수(shared/solo/coin.js). 정산 때 `wk` 가 이번 주가 아니면 `wbest` 를 0 에서 다시 시작. 음수·정수 아님은 읽을 때 버린다(`normalizeSolo`).
- 같은 점수면 먼저 세운 사람이 위(`at` 오름차순). 0점은 순위에 넣지 않는다.
- 새 저장소 함수(Postgres·메모리 같은 결과. 관전 계정과 순위 제외 계정(`RANK_EXCLUDED_ID`)은 뺌):
  `topSolo(game, n, week|null) → [{name, score, at}]`, `soloRank(id, game, week|null) → {rank|null, score, at, n}`. `week` 를 주면 `wk = week` 인 사람의 `wbest/wat` 로.
  Postgres: `SELECT name, (solo->$1->>'best')::int … WHERE (solo->$1->>'best')::int > 0 ORDER BY 2 DESC, (solo->$1->>'at')::bigint ASC LIMIT $2`(사용자 수가 적어 색인 없이). 저장 줄(`writes`) 뒤에 읽는다.
- 전체 초기화(17절)는 users 를 비우므로 같이 지워진다.

### 4-2. 순위 요청 (방 밖·방 안 어디서나, `server/games.js` 의 `hubMsg` — 라이어 랭킹과 같은 길)
`{t:'so', a:'rank', game}` → `{t:'soRank', game, week, all: {top:[{name, score, at}] (최대 20), mine:{rank, score, at, n}}, wk: {top, mine}}`.
- 상위 목록은 종목별로 5초 동안 서버가 기억해 다시 쓴다(DB 를 아끼려고). 정산이 끝나면 그 종목 기억을 지운다.

### 4-3. 어디서 보이나
- **로비**: 게임 고르기에서 "혼자 놀기"를 고르면 종목 카드 줄(이름·한 줄 설명·내 최고) + 그 아래 **고른 종목의 순위 칸**(탭 `전체 | 이번 주`, 상위 5줄 + 내 순위 줄, "더 보기" → 상위 20 창). 종목을 바꾸면 순위도 바뀐다. 버튼 글은 "방 만들기" 대신 "바로 시작".
- **결과 화면**(공용 결과 + 틀의 칸): 제목 "사과 게임 · 87점", 부제 "새 기록! · 전체 3위 · 이번 주 1위"(새 기록이 아니면 "최고 112점 · 전체 3위"), 칸에 순위 상위 5줄 + 내 줄, "오늘 코인 34/60". 버튼은 공용(다시 시작·대기실로·나가기).
- **게임 중**: 점수 줄에 "최고 112".
- 닉네임·점수·날짜(`at` → "11.14")를 보인다. 사용자 글자는 `textContent`.

## 5. 통신 (SPEC 7-5 로 옮긴다)

화면 → 서버 (`{t:'so', a}`. 방 만들기·시작·설정·나가기는 공용 `create/start/set/leave`)
| a | 필드 | 누가·언제 | 오류 |
|---|---|---|---|
| (create) | `{t:'create', mode:'solo', game}` | 로비. 모르는 game 은 표의 첫 종목 | `so_off` |
| (set) | `{t:'set', patch:{game}}` | 방장, 대기실 | `so_host` `so_now` `so_game` |
| `in` | `n`(0 이상 정수), `ops`(정수 1~512개, 각 −600 ~ 1048575) | 하는 사람, `play` | `so_now` `so_spec` `so_sync` `so_fast` |
| `end` | `score`(정수) | 하는 사람, `play` | `so_now` `so_spec` |
| `rank` | `game` | 누구나(로비 포함) | `so_game` |

서버 → 화면: 방 상태의 혼자 놀기 칸(공통 칸 `code, hostId, you, now, wait, players, specs` 위에)
```js
{ mode: 'solo', phase: 'lobby'|'ready'|'play'|'settle'|'end', game, pid: 하는 사람 id | null,
  so: null | { startAt, endsAt: 시각|null, n, score, seed?: uint32 },   // seed 는 play 부터 하는 사람에게만. n·score = 서버가 받은·센 값
  last: null | { game, score, reason, desync?: true,                    // 지난 판(end 동안). 다음 start 때 null
                 best: 최고, fresh: 새 기록인가, rank: {all: n|null, wk: n|null},
                 coin: {want, gain, capped}, today, cap } }
```
- 이벤트: `soProg {score, n}`(구경꾼에게만). 순위 답 `{t:'soRank', …}`(4-2).
- `me` 에 `solo`(내 기록 칸 그대로)와 스위치 값 `solo: 'on'|'test'|'off'` 를 싣는다.
- 화면이 조각을 보내는 때: 안 보낸 기록이 있고 마지막으로 보낸 지 1초가 지났을 때(초당 1번, 서버의 초당 요청 한도 안) + 끝날 때 즉시. 한 조각 512칸이 넘으면 나눠 보낸다.
- 오류 문구: `so_now` 지금은 할 수 없어요 / `so_spec` 구경 중이에요 / `so_game` 없는 게임이에요 / `so_fast`·`so_sync` 는 알림 없이 틀이 처리 / `so_off` 혼자 놀기는 지금 열려 있지 않습니다.
- 비밀 목록: seed(ready 동안 아무에게도, 구경꾼에게는 끝까지). 그 밖에 없음. 프로필 사진은 방 상태에 넣지 않는다(`faces`).

## 6. 화면·디자인

### 6-1. 공통 (틀 `.so-`)
- 가로 화면 기준(세로는 사이트 `#rotate` 안내 그대로). 배치: **가운데 판, 옆에 점수 칸**. 넓은 화면은 판 왼쪽에 세로 정보 칸(종목 이름, 점수 크게, 최고, 남은 시간, 그만하기), 휴대폰 가로(높이 430px 이하)는 같은 칸을 폭 좁게(글자만 줄임). 판은 남는 자리에서 비율을 지키며 최대.
- 톤: 미니게임 보드판과 같은 "실물 느낌" — 어두운 방 배경 위에 **나무 테두리 쟁반 + 안쪽 펠트/무광 판**, 조각은 광택 있는 입체(위쪽 밝은 띠·아래 그림자). 숫자는 굵고 또렷하게. 색은 종목마다 한 계열(2048 호박색 나무 타일, 사과 빨강+초록 잎, 수박 과일색). 번쩍임·흔들림은 과하지 않게.
- 카운트다운 3·2·1(판은 가려 둠) → 시작. 끝나면 판을 흐리게 두고 공용 결과.
- 터치와 마우스 모두(Pointer Events 하나로, `touch-action: none` 은 판에만). 버튼 높이 44px 이상. `#ui` 의 pointer-events 규칙 지킴(판·버튼이 스스로 auto).
- 움직임 최소 기준: 조각 이동·합쳐짐·사라짐 120~250ms, 점수 오를 때 숫자 톡. `prefers-reduced-motion` 이면 `api.reduced`(이동만 남기고 튐·흔들림 끔).
- 소리 최소 기준(`ctx.sound` 의 tone/noise 로 `solo/sfx.js` 가 만든 이름표, 끄기는 사이트 공용 하나): `count`(3·2·1) `go` `move` `pop`(n 이 클수록 높게) `merge`(단계가 높을수록 낮고 굵게) `drop` `warn`(10초 남음·선 넘음) `over` `best`. 종목은 이름만 부른다.
- 구경 화면: 판 대신 "○○ 님이 사과 게임을 하는 중 · 점수 n" 과 남은 시간(판 중계는 하지 않는다).
- 3D 무대를 쓰지 않는다(`stage: false`, `?nogl=1` 과 무관).

### 6-2. 2048 (`.so-g2-`)
- 4×4. 조작: 화살표·WASD, 판 위 스와이프(24px 넘게 민 쪽). 입력 값 `0 위 / 1 오른쪽 / 2 아래 / 3 왼쪽`.
- 타일은 나무 조각 느낌, 값이 커질수록 짙은 색→금색. 이동 120ms 미끄러짐, 합쳐질 때 살짝 커졌다 돌아옴, 새 타일은 작게→제 크기. 2048 을 만들면 알림 한 번("2048 달성! 계속할 수 있어요") 뒤 계속.

### 6-3. 사과 게임 (`.so-ap-`)
- 17×10 사과(빨간 사과에 흰 숫자, 초록 잎). 조작: 누르고 끌어 **직사각형**(반투명 노란 테두리), 상자 안에 **가운데가 들어온** 사과가 선택(밝게). 놓았을 때 합이 10 이면 사과가 톡 튀며 떨어져 사라지고 점수 +개수, 아니면 상자만 사라짐.
  입력 값 = `x0 + 17×(y0 + 10×(x1 + 17×y1))`(칸 좌표, x0≤x1, y0≤y1).
- 남은 시간은 판 옆 세로 막대(원작 느낌) + 틀의 숫자. 10초 남으면 `warn`.
- 원작과 같은 규칙·느낌, 그림과 이름 표기는 우리 것("사과 게임").

### 6-4. 수박 게임 (`.so-sk-`)
- 세로로 긴 유리 통(논리 크기 360×520), 위에 대기 과일과 안내선. 조작: 마우스는 움직이면 따라오고 누르면 떨어뜨림, 터치는 누른 채 좌우로 끌고 떼면 떨어뜨림, 키보드 ←→ + 스페이스. 입력 값 = 떨어뜨릴 x(정수 0~360, 엔진이 벽 안으로 자름).
- 옆에 "다음 과일"과 진화 순서 고리. 과일 11단계는 우리 그림(원 안에 단순한 얼굴·무늬를 한 번 그려 캐시). 그리기는 `<canvas>` 2D.
- 합쳐질 때 작은 퍼짐 + `merge`. 선을 넘은 과일이 있으면 선이 빨갛게 깜박(`warn`).

## 7. 종목 규칙 (엔진 숫자)

- **g2048**: 시작 타일 2개. 새 타일 2(90%)·4(10%), 빈 칸 중 rng. 판이 안 바뀌는 방향은 `input → false`. 점수 = 합쳐 만든 타일 값의 합. 움직일 수 없으면 `over`. `limitMs null, maxMs 3600000, rate 30, maxV 3`. (원작 gabrielecirulli/2048 은 MIT. 규칙만 참고해 새로 쓴다.)
- **apple**: 칸마다 1~9 를 rng 로 고르게. 직사각형 안 **남아 있는** 사과의 합이 정확히 10 이면 지우고 점수 += 개수, 아니면 `false`. `over` 는 엔진에서는 언제나 false(시간은 틀이 끝냄). `limitMs 120000, maxMs 130000, rate 10, maxV 28899`.
- **suika** (`tick: true`): 1걸음 = 1/60초. 통 360×520, 끝 선 y=90. 과일 반지름(단계 0~10): 12, 17, 23, 28, 36, 45, 52, 62, 72, 86, 100. 떨어뜨리는 과일은 단계 0~4 를 rng 로(다음 과일 1개 미리 보임). 떨어뜨린 뒤 30걸음은 다음 입력 `false`.
  같은 단계 두 과일이 닿으면 둘을 지우고 가운데에 다음 단계(수박 둘은 사라지기만), 점수 += 새 단계의 삼각수(1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66).
  물리: 원만, 중력 일정, 반-암시적 오일러, 겹침 풀기 반복 6회(위치 보정 + 충격량), 낮은 반발(0.15 안팎)·마찰·굴림 감쇠. 회전각은 그림 전용(충돌에 안 씀). 모든 과일 속도가 문턱 아래로 30걸음 이어지면 `state.asleep = true`(걸음 멈춤), 입력이 오면 깬다.
  끝: 떨어뜨린 지 60걸음 지난 과일의 윗끝이 끝 선 위에 연속 120걸음 있으면 `over`. 잠들 때 그런 과일이 있으면 바로 `over`. 총 걸음 200000 이면 `over`. `limitMs null, maxMs 3600000, rate 3, maxV 360`.
  손맛(중력·반발·마찰 값)은 엔진 과제가 원작 느낌에 맞춰 정하고 golden 에 고정한다. 숫자를 바꾸면 화면·서버가 같은 배포로 함께 바뀌므로 안전하지만 golden 은 다시 기록한다.
- `shared/solo/rng.js`: `makeRng(seed) → {next() uint32, int(n) 0..n−1, s 상태}`(mulberry32, `Math.imul`·`>>>` 만). `int(n) = Math.floor(next() / 4294967296 * n)`.

## 8. 작업 분배 (과제마다 구역 하나, 20분 분량)

순서: **A(약속 코드) → [틀] B·C·D·E·N + [엔진] F·G·H 병렬 → [판 화면] I·J·K 병렬 → L(연결) → M(문서·스위치)**. 엔진과 판 화면은 A 만 있으면 시작한다.

| # | 과제 | 구역·파일 | 의존 | 끝났다는 증거 |
|---|---|---|---|---|
| A | 약속 코드: rng·진행기·코인 계산·표 뼈대 | shared/solo/{rng,run,coin,index,settings,name}.js, test/solo/{run,coin,pure}.test.js (index 는 빈 표, 가짜 엔진은 test/solo/lib.js) | 없음 | 화면식(`input/step/take`)으로 만든 기록을 `feed` 로 다시 돌리면 상태·점수 같음, 음수 합치기·600 나누기, budget 이어 돌리기, 잘못된 입력 `ok:false`. `weekOf/dayOf` 경계(한국 시간 일요일 23:59·월요일 0:00). pure 시험 통과 |
| B | 저장: `users.solo` + 순위 함수 | server/store.js, test/solo/store.test.js | 없음(모양은 4-1) | 메모리 저장소로 `topSolo/soloRank` 전체·주간·동점·0점 제외·제외 계정, 옛 행 기본값, 통째 저장에 칸이 안 사라짐. Postgres 문장은 puzzle 칸이 있는 자리 전부(USER_COLS, INSERT 2곳, UPDATE 2곳) |
| C | 코인 줄 + 관리자 이름 | shared/coin/rules.js, test/coin/rules.test.js, client/src/ui/admin.js(이름 한 곳) | 없음 | `COIN_RULES` 네 줄, 키 순서 시험 고침, 관리자 화면 이름 "혼자 놀기 · 2048 판당 최대" 식. `ECON_VERSION` 은 올리지 않는다(저장된 설정에 없는 줄은 기본값으로 채워지는지 시험 한 줄) |
| D | 공용 칸 3개(`create`·`listed`·`autoStart`) + solo 등록 + 통신 검사 | shared/games.js, server/games.js, server/protocol.js, server/rooms.js, server/index.js(스위치 `SOLO`, me), test/common/{games,rooms,spectator}.test.js, test/roomlist.test.js, docs/SPEC.md 7-5 | A (E 가 끝나기 전에는 `makeSoloGame` 빈 껍데기로) | 미니 방 만들기·봇전·퍼즐 시험 그대로 통과(분기가 표로 옮겨짐), solo 방이 목록에 안 나옴, `{t:'so'}` 검사(ops 범위·개수), rooms.test MODES 에 solo 한 줄(`startFew: null` 이면 그 시험을 건너뛰는 옵션), spectator MODES 한 줄 |
| E | 서버 틀 | server/solo/room.js, server/solo/rank.js, test/solo/{room,settle,rank}.test.js (가짜 엔진으로) | A, B, C | 2절 전부: seed 는 play 뒤 하는 사람에게만, n 순서·`so_sync`, 속도 검사, 늦은 조각 버림(시계 돌려), 240걸음 나눠 돌리기, 정산 한 번, 하루 상한(59 받은 뒤 3 → 1), 새 기록·주 바뀜, 나가면 정산, desync 표시, 순위 기억 |
| N | 화면 틀 | client/src/solo/{index.js,games.js,rank.js,sfx.js,solo.css} | A, 5절 (서버 없이 가짜 state 로) | mount 약속 전부(`room/event/error/anchorOf/resultTitle/resultPart/unmount`), 카운트다운, 1초 조각 보내기·`so_sync` 다시 보내기, 새로 고침 뒤 `end`, 구경 화면, 순위 칸. 가짜 판으로 도는 node 시험 test/solo/frame.test.js |
| F | 엔진 2048 | shared/solo/g2048.js, test/solo/g2048.test.js, test/solo/golden/g2048.json | A | 규칙 시험(한 번에 한 번만 합침·안 바뀌는 방향 false·끝 판정), 같은 seed·같은 입력 = 같은 점수, golden(무작위 입력 500개의 점수·판) |
| G | 엔진 사과 | shared/solo/apple.js, test/solo/apple.test.js, golden/apple.json | A | 합 10 만 지움·빈 칸 무시·입력 값 묶기/풀기 왕복·범위 밖 false, golden |
| H | 엔진 수박(물리) | shared/solo/suika.js, test/solo/suika.test.js, golden/suika.json | A | 벽 밖으로 안 나감, 200개 무작위로 떨어뜨린 뒤 남은 겹침 < 1, 합치기·점수, 잠들기·깨기, 끝 판정, **같은 기록 두 번 = 완전히 같은 상태**, 1만 걸음이 0.5초 안(시험에 시간 한 줄), golden |
| I | 판 화면 2048 | client/src/solo/g2048/{board.js,g2048.css} | A, F | 1-5 약속 모양, 키·스와이프, `.so-g2-` 만 |
| J | 판 화면 사과 | client/src/solo/apple/{board.js,apple.css} | A, G | 끌기 상자·가운데 판정, `.so-ap-` 만 |
| K | 판 화면 수박 | client/src/solo/suika/{board.js,suika.css} | A, H | canvas 그리기·세 가지 조작·다음 과일·진화 고리, `.so-sk-` 만 |
| L | 연결(통합, 한 번에 한 에이전트) | client/src/games.js, client/src/ui/lobby.{js,css}(혼자 놀기 종목 카드·순위 칸·"바로 시작"), shared/solo/index.js·client/src/solo/games.js(세 종목 넣기), test/solo/all.test.js, test/ui/smoke.mjs, package.json(`test:unit` 에 test/solo) | 전부 | `npm run check` 통과. smoke: 로비에서 혼자 놀기 → 종목마다 바로 시작 → 입력 몇 번 → 그만하기 → 공용 결과에 점수 → 다시 시작, 순위 탭 누르기 |
| M | 문서·스위치 | docs/SPEC.md(25절 요약, 22-1·22-2 줄), docs/NEW-GAME.md(예외 표 + 공용 칸 3개), docs/COMMON-CONTRACT.md(2절 칸), CLAUDE.md(구역·게임 절), README(환경 변수), render.yaml | L | `npm test` 통과, 예외 표에 두 줄(아래) |

판 화면 과제(I·J·K)의 완료 판정은 L 의 smoke 다(데모 페이지만으로는 완료가 아니다).

NEW-GAME 4절 예외 표에 적을 것(사용자 확인 필요 — 11절):
- 혼자 놀기 | 정원 예외: 사람 1명이 하고 나머지는 구경. 대기실 없이 바로 시작(`autoStart`), 로비 방 목록에 안 나옴(`listed: false`).
- 혼자 놀기 | 코인 예외: 적립표 대신 `hub.grant`(점수 문턱 + 하루 상한). 결과 화면은 공용 그대로(`add.by` 로 코인 표시).

## 9. 시험

- **틀(가짜 엔진으로)**: test/solo/run.test.js(진행기), room.test.js(단계·입력·속도·시간), settle.test.js(코인·상한·기록·순위·desync), rank.test.js, store.test.js, coin.test.js, frame.test.js, pure.test.js(금지 글자).
- **종목**: test/solo/<id>.test.js = 규칙 + 결정성(같은 seed·기록을 두 번 돌려 `JSON.stringify(state)` 같음) + **golden**(`{seed, ops, score, hash}` 를 저장소에 두고 매번 대조 — 엔진을 고쳐 결과가 달라지면 여기서 걸린다. 일부러 바꿨으면 다시 기록).
- **표 시험**: `test/solo/all.test.js` 가 `SOLO` 표를 돌며 종목마다 — 필수 칸·`coin` 오름차순·`COIN_RULES['solo_'+id]` 있음·client `games.js` 에 같은 키·판 화면 파일 있음·무작위 입력 300개가 예외 없이 돎. 새 종목은 이 파일을 고치지 않는다.
- **공용**: test/common 세 파일에 solo 칸, test/coin/rules.test.js 키 순서, test/css.test.js(`so-`).
- **화면**: smoke.mjs 에 종목마다 한 판(8절 L), 순위 탭 클릭.
- **Safari·iPad 의 수박 결정성, 판 손맛, 소리, 터치 느낌**은 "미확인(실기기 확인 필요)". 현장에서 점수가 갈리면 서버 로그 `solo desync` 로 드러난다.

## 10. 새 종목을 붙이는 법 (이번 3종 뒤)
1. `shared/solo/<id>.js`(1-3 약속) + `test/solo/<id>.test.js` + golden.
2. `client/src/solo/<id>/board.js`(1-5 약속) + CSS(`.so-<두 글자>-`).
3. 표 세 줄: `shared/solo/meta.js`(이름·설명, 가벼운 표 — 첫 번들용), `shared/solo/index.js`(엔진), `client/src/solo/games.js`(판 화면). 코인 한 줄: `COIN_RULES.solo_<id>`(+ 관리자 이름).
4. smoke.mjs 한 판. 끝 — 틀·저장·순위·로비는 고치지 않는다(로비 카드·순위는 표에서 나온다).

## 11. 사용자에게 확인할 것
1. 예외 두 줄(8절 끝)을 예외 표에 적어도 되는지.
2. 코인 숫자(하루 60, 판당 최대 10/7/8)와 순위의 "이번 주" 탭.
3. 다른 사람이 방에 들어오면 **점수만 구경**(판 중계 없음)으로 시작하는 것. "같은 판으로 겨루기"는 나중 과제.
4. 새로 고침하면 그 판은 그때 점수로 끝나는 것(이어 하기는 나중 과제).
5. 공개 순서: `SOLO=test`(`?solo=1`)로 먼저 올려 확인한 뒤 `on`.
