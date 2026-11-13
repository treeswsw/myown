# 라이어게임 마지막 단계 다시 짜기 — 구현 계획서 (2026-11-13)

사용자 요청: 정체 공개 클로즈업 뒤 **라이어가 답을 쓰는 동안 하얀 조명 + 큰 초 세기**, 제출(또는 시간 끝) 뒤
**"제시어 : X / 미스매치 : Y" → 라이어의 답 → "맞혔습니다 / 맞히지 못했습니다"** 를 **천천히, 글자가 써지면서** 보여 주고 결과로.
레퍼런스 두 장은 다른 게임 캡처다. 화면 구성·순서·느낌만 따르고 그림·이름·로고는 쓰지 않는다.

이 문서는 계획이다. 코드는 아직 바뀌지 않았다. 아래 "⬜ 사용자 확인" 표시는 6절 질문의 답에 따라 바뀔 수 있다.

---


## 0. 사용자 결정 (2026-11-13, 이 절이 아래 모든 절보다 우선)
- 답 입력 시간: 방장 설정 그대로(10/15/30, 기본 15).
- 둘째 칸 이름: "미스매치". "라이어 알림" 방식은 "제시어 : X" 만.
- 정답 공개(`answer`) 연출(사용자 말 그대로: "제시어랑 미스매치는 바로 보이고 라이어답만 나타나고 좀 유지 10초정도?"): 단계 시작과 동시에 "제시어 : X   미스매치 : Y" 한 줄을 **바로 보인다**(써지는 효과 없음, 정적 없음). 1.0초에 라이어의 답(말풍선 포함)이 써지며 나타난다. 3.5초쯤 판정 글이 써지며 나온다(끝에 소리). 그대로 머물다 10초에 결과 창. 즉 `FIXED_TIMES.answer = 10`, "라이어 알림" 방식도 10. 건너뛰기 없음. ③절의 15초 타임라인은 이 줄로 대체한다.
- 판정 문구: "라이어가 답을 맞혔습니다" / "라이어가 답을 맞히지 못했습니다". 답이 없으면 답 자리에 "시간 초과".
- ② 답 입력 단계의 "라이어는 제시어를 제출하세요" 써지는 제목과 큰 초 카운트다운, 하얀 조명은 계획대로.

## 1. 지금 흐름 (코드 기준)

| 순서 | 서버 단계(`phase`) | 시간 | 화면 | 근거 |
|---|---|---|---|---|
| 1 | `unmask` | 라이어 처형 6초 / 시민 처형 11초 / 지목 실패 5초 (`FIXED_TIMES.unmaskLiar·unmaskCitizen·unmaskFail`) | 검은 화면에 "그는 라이어가 / 맞습니다·아닙니다" 한 글자씩 → 빨간 빛기둥 아래 라이어 클로즈업 "라이어는 [이름] 입니다". 건너뛸 수 없음. 채팅·이모티콘 전부 막힘 | `shared/liar/game.js` `afterJudged`·`failAccusation`, `client/src/liar/anim/unmask.js`, `scene/reveal.js`(빨간 조명), `scene/camera.js`(`mode:'liar'`) |
| 2 | `guess` | 방 설정 `times.guess` (10 / 15 / 30, 기본 15초) | 카메라가 **테이블 전체 보기로 돌아가고** 빨간 조명이 꺼진다. 작은 상자 "정답 맞히기 / 라이어가 정답을 고민하고 있습니다 / 남은 시간 N초". 라이어만 아래 조작 줄에 입력 칸 | `game.js` `startGuess`, `ui/result.js` `renderGuess`, `ui/hud.js`(제목 "정답 맞히기"), `scene/layout.js` `cameraFor`(guess → table) |
| 3 | (단계 없음) | 0초 | 라이어가 보내거나 시간이 끝나면 **그 순간 바로** `result` 로 넘어간다. 알림 `guess{text,correct}` 와 함께 맞음/틀림 소리가 즉시 난다 | `game.js` `finishGuess` → `finish`, `pure.js` `soundForEvent` |
| 4 | `result` | 방장이 "다음 판" 누를 때까지 | 결과 창(이긴 쪽, 라이어, 두 제시어, 라이어의 답, 점수, 투표 내역) | `ui/result.js` `renderResult` |

문제: 3번에 머무는 시간이 없어 답·정답·판정이 결과 창 안의 작은 글로 한꺼번에 나온다("휙휙").
또 시민의 제시어·라이어의 제시어는 지금 `result` 안에만 들어 있다(`result.citizenWord`, `result.liarWord`).

---

## 2. 새 흐름 (초 단위)

### 한눈에

| 순서 | 단계 | 서버가 재는 시간 | 요약 |
|---|---|---|---|
| ① | `unmask` | 6 / 11 / 5초 (그대로) | "라이어는 ○○ 입니다" 빨간 클로즈업 (그대로) |
| ② | `guess` | 방 설정 그대로 (기본 15초) | 클로즈업 유지 + **하얀 조명** + "라이어는 제시어를 제출하세요" 타자 + 큰 "N초" |
| ③ | **`answer` (새 단계)** | **15초** ("라이어 알림" 방식은 12초) | 정적 → 제시어 → 미스매치 → 라이어의 답(말풍선) → 판정 글 → 머묾 |
| ④ | `result` | 방장이 넘길 때까지 (그대로) | 결과 창 (그대로) |

제출부터 결과 창까지: 지금 0초 → **15초**. 마지막 구간 전체(①~③)는 답을 빨리 내면 약 22~28초, 시간을 다 쓰면 35~41초.
**건너뛰기 없음**(정체 공개와 같다. 모두가 같은 박자로 본다).

### ① 정체 공개 — 바꾸지 않는다

끝나는 순간 카메라가 테이블로 돌아가던 것만 고친다(②가 클로즈업을 이어받는다. 4절 과제 I).

### ② 답 입력 (`guess`)

| 단계 안 시각 | 모두의 화면 | 소리 |
|---|---|---|
| 0.0초 | 정체 공개 글이 사라진다. 카메라는 라이어 클로즈업 그대로. **빨간 빛이 꺼지고 하얀 조명이 "탁" 켜진다**(0.4초). 다른 사람·테이블은 어둡게 | 기존 단계 전환 소리 |
| 0.5~2.4초 | 화면 위 큰 흰 글씨 **"라이어는 제시어를 제출하세요"** 가 한 글자씩(글자당 약 0.13초) | 글자마다 기존 `tick` |
| 2.4초~ | 그 아래 더 큰 **"N초"**(서버 `phaseEndsAt` 으로 센 실제 남은 초). 마지막 5초는 빨간색 | 마지막 5초 매초 `tickBig` |
| 줄곧 | 라이어: 아래 조작 줄에 입력 칸 + "정답 보내기"(0.0초부터 쓸 수 있음, 한 번만, 1~30자). 그 밖: 제목 아래 작은 글 "라이어가 답을 쓰고 있습니다". 채팅 잠김(지금과 같음) | |

- 입력 시간은 **기존 설정값을 그대로** 쓴다(기본 15초, 방장이 10/15/30). 제목이 써지는 2.4초는 이 시간 안에 들어간다(서버 시간을 늘리지 않는다). ⬜ 사용자 확인(질문 1)
- 라이어가 치는 글자는 지금처럼 남에게 실시간으로 보이지 않는다.
- 중간에 들어온 사람은 제목이 이미 다 써진 상태로 본다.

**하얀 조명 — 3D**: `scene/reveal.js` 의 빨간 빛기둥과 같은 장치에 **색(tone)** 을 더한다. 라이어 자리 위에서 내리쬐는 하얀(조금 따뜻한 흰색) 스포트라이트 + 옅은 흰 빛기둥,
테이블 등·환경광은 정체 공개 때처럼 낮춘다. 카메라는 정체 공개의 라이어 구도(`revealPose`)를 그대로 쓰고 다시 밀고 들어가지 않는다. 이름표는 얼굴 아래로(레퍼런스처럼 가슴 자리).

**하얀 조명 — `?nogl=1` (2D)**: 새 엔딩 모듈이 화면을 어둡게 깔고(조작 줄보다 아래 층), 위에서 내려오는 **CSS 흰 빛기둥**(정체 공개의 `.lg-um-beam` 과 같은 방식, 색만 흰색)
아래에 라이어의 **프로필 동그라미 + 이름(그 사람 색)** 을 가운데에 세운다. 글·초·입력 칸은 3D 와 같다.

### ③ 정답 공개 (`answer`, 새 단계) — "다른 제시어" 방식 15초

| 단계 안 시각 | 화면 | 소리 |
|---|---|---|
| 0.0~1.2초 | **정적.** 제목·초·입력 칸이 사라진다(0.4초에 걸쳐 흐려짐). 하얀 조명과 라이어 클로즈업만 남는다 | 없음 |
| 1.2~2.9초 | 위쪽 한 줄 왼쪽에 **"제시어 : 도서관"** — "제시어 : " 는 빠르게(글자당 0.12초), 단어는 크게 또박또박(글자당 0.26초) | `tick` / 단어는 `tickBig` |
| 2.9~3.8초 | 멈춤 | |
| 3.8~5.6초 | 같은 줄 오른쪽에 **"미스매치 : 놀이공원"** 같은 박자 | 같음 |
| 5.6~6.6초 | 멈춤 | |
| 6.6~7.8초 | 그 아래 가운데에 **라이어의 답**이 가장 큰 글씨로 한 글자씩(글자당 0.22초, 길면 최대 2.5초 안에 끝나게 빨라짐). 같은 순간 라이어 머리 위 **말풍선**에도 같은 글 | `tickBig` |
| 7.8~9.6초 | 멈춤(쫄깃하게, 가장 길게) | |
| 9.6~11.4초 | 답 아래에 판정 글이 한 글자씩: **"라이어가 답을 맞혔습니다"**(금색) / **"라이어가 답을 맞히지 못했습니다"**(빨강). 마지막 글자에서 소리 | 끝에 `guessOk` / `guessNo` |
| 11.4~15.0초 | 그대로 머문다(최소 2.5초 보장) | |
| 15.0초 | `result` 로. 조명·카메라가 테이블로 돌아가고 결과 창이 뜬다 | 기존 `win` / `champion` |

- 글이 길어 15초에 안 들어가면 정체 공개처럼 박자를 같은 비율로 줄인다(마지막 머묾 2.5초는 지킨다).
- 답을 못 냈으면(시간 끝) 답 자리에 흐린 글 **"시간 초과"**, 말풍선은 "…", 판정은 "맞히지 못했습니다".
- 휴대폰 가로처럼 좁으면 "제시어 : X" 와 "미스매치 : Y" 가 두 줄로 내려간다(글자 크기는 `--lg-k` 로 줄어듦).
- 채팅·이모티콘·사운드는 정체 공개와 같이 전부 잠근다. "이 판 끝내기" 버튼은 이 단계에서 숨긴다.
- 중간에 들어오거나 다시 붙은 사람은 남은 시간에 맞는 지점부터 본다(지난 글자는 이미 찍힌 상태, 소리 없음).

**라이어 방식별 표시** (GDD 3절의 방식은 두 가지뿐이다)

| 방식 | 위쪽 줄 | 서버 시간 |
|---|---|---|
| 다른 제시어 (`liarMode: 'word'`, 기본) | "제시어 : [시민 제시어]" + "미스매치 : [라이어가 받은 제시어]" | 15초 |
| 라이어 알림 (`liarMode: 'notice'`) | "제시어 : [시민 제시어]" 한 덩어리만 가운데. 미스매치 칸과 그 박자(3.8~6.6초)는 없다 | 12초 (제시어 1.2 → 답 3.8 → 판정 6.8 → 끝 8.6 → 머묾 → 12.0) |

⬜ 사용자 확인(질문 2): 둘째 칸 이름을 레퍼런스대로 "미스매치" 로 쓸지.

**연출 없이 바로 결과로 가는 경우** (지금 규칙 그대로, GDD 4-1 의 8 "예외")
- 라이어가 정체 공개 전에 빠짐(`liarLeft`), 3명 미만(`tooFew`), 방장이 끝냄(`hostEnded`): 정답 맞히기도 `answer` 도 없다.
- 라이어가 `unmask`·`guess` 중에 빠짐: 지금처럼 오답 처리하고 **`answer` 없이** 바로 `result`.
- `answer` 가 시작된 뒤에는 누가 빠져도 판을 무효로 하지 않고 끝까지 보여 준 뒤 `result`(답이 이미 나왔다. 빠진 사람 점수는 기존 규칙대로 0).

---

## 3. 서버가 정하는 것 (통신·상태 변경)

통신 약속의 기준은 GDD 9절이다(SPEC 7-1 은 "모양은 GDD 9-3·9-4" 라고만 가리킨다). 과제 D 가 아래를 GDD·CONTRACTS 에 먼저 적고 나서 나머지를 띄운다.

### 3-1. 상수 (`shared/liar/constants.js`)

```js
PHASES.ANSWER = 'answer'                     // guess 와 result 사이
FIXED_TIMES.answer = 15                      // 'word' 방식 (초)
FIXED_TIMES.answerNotice = 12                // 'notice' 방식 (초)
// DEFAULT_TIMES.guess / TIME_CHOICES.guess / LIMITS.guess 는 그대로
```

### 3-2. 요청 (화면 → 서버) — 바뀌지 않는다

`{t:'lg', a:'guess', text}` 그대로(`shared/liar/protocol.js` 수정 없음). `guess` 단계에서 라이어만, 한 번.

### 3-3. `room.state` (GDD 9-3 에 더할 것)

```js
phase: ... | 'guess' | 'answer' | 'result',   // 'answer' 추가
phaseEndsAt,                                  // 'answer' 에서는 시작 + 15초(또는 12초). 서버가 잰다
guess: null | { text: string | null, correct: bool },   // 모양 그대로. 채워지는 때 = 'answer' 시작(전에는 result 시작)
words: null | { citizen: string,              // (새 칸) 시민 제시어
                liar: string | null },        //          라이어가 받은 제시어. 'notice' 방식이면 null
        // 'answer' 와 'result' 에서만 채운다. 그 전(lobby 포함)에는 누구에게나 null. 받는 사람과 무관하게 같은 값(관전자 포함)
```

- `words` 칸은 **항상 있다**(값만 null). 그래서 정체 공개 전 라이어/시민의 상태 모양(칸 이름·개수·순서)이 지금처럼 같다.
- `result.citizenWord`·`result.liarWord` 는 그대로 둔다(결과 창이 쓴다).
- `my.role` 공개 범위(`unmask` 부터)에 `answer` 를 넣는다.

### 3-4. 알림 `event.e` (GDD 9-4)

| k | 바뀌는 점 |
|---|---|
| `guess` `{text, correct}` | 모양 그대로. 나가는 때가 "결과 직전" → "`answer` 시작" 이 된다. **화면은 이 알림으로 맞음/틀림 소리를 내지 않는다**(판정 글이 다 써진 순간에 낸다) |
| `phase` `{phase:'answer', round, accuseNo}` | 새 단계에도 지금처럼 나간다 |

새 알림 종류는 없다.

### 3-5. 엔진 (`shared/liar/game.js`)

- `finishGuess`(제출 또는 `guess` 시간 끝): `g.guess` 기록 + `guess` 알림 → **`answer` 단계로**(15초 / 12초). 점수·`result` 는 아직 만들지 않는다.
- `answer` 시간이 끝나면 지금의 `finish`(점수 계산, `result` 로). `caught`·`reason` 계산은 지금 식 그대로.
- 라이어가 `unmask`·`guess` 중 빠짐: `guess = {text:null, correct:false}` 로 **바로 `finish`**(연출 없음).
- `answer` 중 빠짐: 아무 일도 하지 않는다(무효 처리·끝내기 없음). 방장 `end` 는 `answer` 에서도 지금처럼 무효로 끝낼 수 있다(화면에는 버튼이 없다).
- `viewFor`: `revealed` 에 `answer` 포함, `words` 칸 추가(3-3).
- `wakeAt`·`tick` 은 그대로 쓰면 된다(`answer` 는 끝 시각이 있는 보통 단계).

### 3-6. 방 (`server/liar/room.js`, `perms.js`)

- `view()` 에 `words: v ? v.words : null` 을 `guess` 다음 자리에 넣는다(누구에게나 같은 자리).
- 채점(`isCorrect`)·점수 기록(`settle`, `result` 에 들어갈 때 한 번)은 그대로. `settle` 이 15초 늦게 불릴 뿐이다.
- `perms.js`: `answer` 는 `unmask` 와 같게 — 글 "정답 공개 중에는 글을 쓸 수 없습니다.", 이모티콘·사진·사운드 전부 막음.
- 도중 입장 막기(`lobby`·`result` 가 아니면 진행 중)는 손대지 않아도 `answer` 가 포함된다.

### 3-7. 비밀 유지 확인

| 걱정 | 판단 |
|---|---|
| "다른 제시어" 라이어가 정체 공개 전에 자기가 라이어임을 알게 되나 | **아니다.** 새 연출은 전부 `unmask` 뒤다. `unmask` 전 상태는 `words: null` 칸 하나가 모두에게 똑같이 늘 뿐이라 라이어/시민 모양이 같다(leaks 시험으로 확인) |
| 라이어가 답을 쓰기 전에 시민 제시어를 받나 | **받으면 안 된다.** `words` 는 `answer` 부터만 채운다. `unmask`·`guess` 동안 라이어가 받는 상태·알림 어디에도 시민 제시어가 없어야 한다(시험 추가). 시민 화면도 `guess` 동안 제시어를 화면에 띄우지 않는다(옆에서 보일 수 있다) |
| 판정(`correct`)이 글보다 먼저 드러나나 | 서버는 `answer` 시작에 답·판정·두 제시어를 한꺼번에 보낸다(정체 공개의 `unmask` 와 같은 방식). **화면이 박자대로 늦게 보여 준다** — 엔딩 모듈 밖(상단 표시, 이름표, 소리)은 `result` 전까지 `guess.correct`·`words` 를 쓰지 않는다 |
| 정답의 다른 이름(alt) | 지금처럼 화면으로 보내지 않는다 |
| 관전자 | `answer` 부터는 모두에게 공개된 정보라 같은 값을 받는다 |

---

## 4. 작업 나누기

순서: **D(약속 글) → [S1 → S2] 와 [E, R, H, G] 를 동시에 → I(조립) → T(한 판 시험)**.
화면 과제 E·R·H·G 는 가짜 상태(CONTRACTS 3절 표본에 `words` 와 `phase:'answer'` 를 더한 것)로 서버 없이 만든다.

| 과제 | 구역·모듈 | 바꿀 파일 | 약속 | 끝 조건 |
|---|---|---|---|---|
| **D** 약속 글 (총괄) | 통합(docs) | `docs/liar/GDD.md`(새 14절 "v0.14 마지막 단계": 4-1 의 8, 4-2 고정 시간, 4-4 표, 9-3, 9-4 를 이 문서 2·3절대로), `docs/liar/CONTRACTS.md`(엔딩 모듈 줄·`data-lg`·z-index·장면 `spot`), `docs/SPEC.md` 18절 한 줄, `CLAUDE.md` 접두사에 "엔딩 `.lg-ed-`" | 이 문서 3절 그대로 옮긴다 | 문서만. 6절 질문의 답 반영 |
| **S1** 엔진 | 라이어 서버 `shared/liar/` | `constants.js`, `game.js`, `test/liar/game.test.js`, `test/liar/leaks.test.js` | 3-1, 3-3, 3-5. `protocol.js` 는 안 바뀜 | `node --test test/liar/game.test.js test/liar/leaks.test.js`. 새 시험: 제출→`answer`→15초 뒤 `result`(점수 지금과 같음) / 시간 끝→`answer` / notice 12초 / `unmask`·`guess` 중 라이어 빠짐은 바로 `result` / `answer` 중 빠져도 무효 아님 / **`unmask`·`guess` 동안 라이어 view·모든 알림에 시민 제시어 없음** / `words` 칸이 모든 단계·모든 사람에게 있고 `answer` 전에는 null / 기존 "모양 같음" 시험 그대로 통과 |
| **S2** 방 | 라이어 서버 `server/liar/` | `room.js`, `perms.js`, `test/liar/room.test.js`, `test/liar/perms.test.js`, `test/liar/e2e/helpers.js`(공개 뒤 단계 목록에 `answer`), `test/liar/e2e/02·03·05`(결과를 기다리는 곳) | 3-6 | 위 시험 + `npm test`(서버 변경 과제). S1 뒤에 시작 |
| **E** 엔딩 화면 (새 모듈) | 라이어 화면 `anim/ending` 접두사 `.lg-ed-` | 새 `client/src/liar/anim/ending.js`, `ending.css`, `test/liar/ending.test.js`, `test/liar/ui/ending/`(harness·fixtures·run) | 아래 4-1 | 순수 함수 시험 + 자기 시험 페이지(844×390, 3명·8명, word·notice, 시간 초과, 중간 입장, `?nogl=1`) |
| **R** 정답·결과 | 라이어 화면 `ui/result` `.lg-rs-` | `ui/result.js`, `result.css`, `test/liar/result.test.js`, `test/liar/ui/result/` | `guess` 에서는 **라이어의 입력 칸만** 남긴다(작은 상자 `guess-wait`·`guess-shown`·"남은 시간" 삭제 — 엔딩 모듈이 맡는다). `answer` 에서는 전부 숨김. `result` 창은 그대로. `data-lg` `guess-input`·`guess-send`·`result`·`result-winner`·`result-row`·`next` 유지 | 자기 시험 통과. 입력 칸이 `answer` 에 들어가면 바로 사라짐 |
| **H** 상단 표시 | 라이어 화면 `ui/hud` `.lg-hud-` | `ui/hud.js`, `hud.css`(필요하면), `test/liar/hud.test.js`, `test/liar/ui/hud/` | `guess`·`answer` 에서는 맨 위 작은 줄(Round·주제)만 남기고 제목·초·안내를 숨긴다(큰 글과 겹치지 않게). `chatLockFor`: `answer` → 잠김 "정답 공개 중에는 글을 쓸 수 없어요". "이 판 끝내기" 는 `answer` 에서 숨김 | 자기 시험 통과 |
| **G** 3D 조명·카메라 | 3D `client/src/liar/scene/` | `layout.js`(`cameraFor`), `camera.js`, `reveal.js`, `index.js`, `test/liar/scene.test.js` | `cameraFor`: `guess`·`answer` 이고 `unmask.liarId` 가 있으면 `{mode:'spot', id}`. `spot` = `liar` 와 같은 구도(이미 `liar` 였으면 다시 밀고 들어가지 않음) + **하얀** 조명·빛기둥(`reveal.look(id, 'white')`). `tagPos` 는 `liar`·`spot` 에서도 얼굴 아래(`below:true`). `stats()` 에 조명 색 표시 추가(시험용) | `scene.test.js`(순수 함수·가짜 장면). 실제 모양은 미확인 |
| **I** 조립 | 통합 `client/src/liar/index.js`, `pure.js` | `index.js`, `pure.js`, `test/liar/index.test.js`, `test/liar/ui/index/` | `ending.css`·`createEnding` 연결. 정체 공개 `onStage('end')` 에서 단계가 아직 `unmask` 면 카메라를 테이블로 돌리지 않는다(깜빡임 방지). `soundForEvent` 의 `guess` → 소리 없음, 엔딩 `onStage('verdict', {correct})` 에서 `guessOk`/`guessNo`, `onTick` 은 기존 `tick`/`tickBig`. 새 소리 파일·이름 없음 | `npm run check`. E·R·H·G·S2 가 모두 들어온 뒤 |
| **T** 한 판 시험 | UI 시험 `test/ui/` | `test/ui/liar-round.mjs` (필요하면 `smoke.mjs` 한 줄) | `guess`: `[data-lg="ending"][data-stage="ask"]`·`ed-title`·`ed-secs` 가 모든 창에 보임, 라이어 창에서 입력→보내기 클릭. `answer`: `ed-word`·`ed-answer`·`ed-verdict` 가 차례로 보임, 답을 내기 전 라이어 창 글에 시민 제시어가 없음. 결과 대기 시간 20초 → 40초 | `npm test` 통과(라이어 한 판 포함). 그 뒤 배포 묶음 |

구역이 겹치지 않는다: S1·S2 는 서버, E·R·H 는 서로 다른 화면 파일, G 는 `scene/` 만, I 는 `index.js`·`pure.js` 만, T 는 `test/ui/` 만.
`firstsays`·`rules`·`vote`·`role`·`emote`·`audio` 는 바꾸지 않는다(I 가 `answer` 단계에서 깨지지 않는지 확인만 — 깨지면 고치지 말고 보고).

### 4-1. 엔딩 모듈 약속 (`client/src/liar/anim/ending.js`, 과제 E)

```js
createEnding(ctx, { onStage, onTick }) → { el, update(state), event(), frame(dt), dispose(), get busy }
endingPlan(state, liarName) → { total, steps:[{at, part, text, big}], marks:{...} }   // 순수 함수(node 시험). unmaskPlan 과 같은 꼴
```

- CONTRACTS 0절 규칙 그대로(다른 화면 모듈·`shared/` 를 가져오지 않는다, 글자는 `textContent`, 맨 위에서 `document` 금지, `prefers-reduced-motion` 이면 전환 없이).
- 보이는 때: `phase` 가 `guess` 또는 `answer` 이고 `unmask.liarId` 가 있을 때. 그 밖에는 `hidden`. 같은 state 로 여러 번 불러도 같다.
- 시각 계산: `guess` 는 "단계 시작부터 흐른 시간" 을 알 수 없으므로 **화면이 처음 `guess` 를 본 순간**부터 제목을 타자한다(다시 붙은 사람은 다 써진 채로). 초는 `phaseEndsAt - ctx.now()`.
  `answer` 는 정체 공개처럼 `총 길이 − 남은 시간` 으로 지점을 구한다(총 길이 = `words.liar` 가 있으면 15, 없으면 12 — 값은 opts 로 받거나 모듈 상수).
- 읽는 값: `unmask.liarId`, `players`(이름·색), `you`, `guess`, `words`, `phaseEndsAt`. `my`·`result` 는 읽지 않는다.
- `data-lg`: `ending`(+ `data-stage`: `ask` → `hush` → `word` → `mismatch` → `answer` → `verdict` → `hold`), `ed-title`, `ed-secs`, `ed-wait`, `ed-word`, `ed-mismatch`, `ed-answer`, `ed-verdict`(+ `data-ok="1|0"`), `ed-bubble`.
- `onStage(stage, info)`: `'ask'`, `'hush'`, `'answer'`(`info.id` = 라이어), `'verdict'`(`info.correct`), `'end'`. `onTick(big)`: 글자 하나가 찍힐 때.
- 층: `z-index: 28`(이름표 10·상단 표시 20 위, **조작 줄 30 아래** — 라이어의 입력 칸을 가리지 않는다). 뿌리는 `pointer-events: none`(누를 것이 없다).
  3D 에서는 배경이 옅은 테두리 어둠뿐, `ctx.nogl` 이면 어두운 배경 + 흰 빛기둥 + 가운데 라이어 카드(프로필은 `ctx.faceOf`).
- 말풍선(`ed-bubble`): `answer` 지점부터 `ctx.anchor(liarId)` 자리에 띄우고 `frame` 에서 따라간다. 좌표가 `null` 이면 nogl 카드 위에 붙인다. 채팅 기록에는 넣지 않는다.
- 문구(확정 전): 제목 "라이어는 제시어를 제출하세요", 기다림 "라이어가 답을 쓰고 있습니다", "제시어 : ", "미스매치 : ", "시간 초과", "라이어가 답을 맞혔습니다" / "라이어가 답을 맞히지 못했습니다".
- 글꼴·색은 정체 공개와 같은 변수(`--lg-serif`, `--lg-ink`, `--lg-red`, `--lg-gold`), 크기는 `calc(px * var(--lg-k, 1))`. zoom 금지.

### 4-2. gamemine 과 달라지는 점 (기록)

CLAUDE.md 의 "복사해 온 라이어 폴더는 gamemine 과 같게 유지" 와 달리, **이번은 사용자가 이 사이트에서 직접 요청한 변경**이라 myown 쪽이 앞서게 된다.
달라지는 파일: `shared/liar/constants.js`·`game.js`, `server/liar/room.js`·`perms.js`, `client/src/liar/index.js`·`pure.js`·`ui/result.*`·`ui/hud.*`·`scene/{layout,camera,reveal,index}.js`,
새 파일 `client/src/liar/anim/ending.{js,css}`, 시험(`test/liar/…`), 문서(`docs/liar/GDD.md`·`CONTRACTS.md`·이 문서).
달라지는 약속: 새 단계 `answer`, 새 상태 칸 `words`, 고정 시간 2개, `guess` 알림이 나가는 때, 맞음/틀림 소리가 나는 때.
gamemine 에 되옮길지는 총괄이 정한다(과제 D 가 `docs/LIAR-MOVE.md` 에 한 줄 남긴다).

---

## 5. 미확인으로 남을 것 (실기기 확인 필요)

- 3D 하얀 조명의 모양·밝기, 빨강 → 하양으로 바뀌는 느낌, 클로즈업 구도에서 얼굴·이름표·말풍선 자리 (이 환경에는 GPU 가 없다)
- 글자가 써지는 속도와 멈춤의 느낌("천천히" 가 맞는지 — 숫자는 2절 표, 고치기 쉽게 한 곳의 상수로 둔다)
- 소리(글자 소리, 판정 소리의 때)
- iPad/Safari·휴대폰 가로: 라이어가 입력할 때 키보드가 화면을 가리는 정도, 큰 글씨가 두 줄로 내려갈 때의 모양
- `?nogl=1` 2D 화면은 스모크로 "보인다·눌린다" 까지만 확인된다(예쁜지는 사람이 본다)

---

## 6. 사용자에게 물어볼 것

1. **답 입력 시간** — 지금처럼 방장 설정(10 / 15 / 30초, 기본 15초)을 그대로 쓸까요? **추천: 그대로.** (레퍼런스처럼 짧게 고정하고 싶으면 값만 알려 주세요.)
2. **둘째 칸 이름과 "라이어 알림" 방식** — "다른 제시어" 방식에서 레퍼런스대로 **"제시어 : X  미스매치 : Y"** 로 쓸까요, "라이어 제시어 : Y" 로 쓸까요? **추천: "미스매치"**(말씀하신 그대로).
   "라이어 알림" 방식(라이어가 단어를 안 받음)은 **"제시어 : X" 만** 보여 주는 것을 추천합니다.
3. **공개 연출 길이** — 답을 낸 뒤 결과 창까지 **15초**(추천: 정적 1초 → 제시어 → 미스매치 → 답 → 2초 뜸 → 판정 → 3초 머묾), 건너뛰기 없음. 더 짧게(약 11초) 또는 더 길게(약 20초)도 됩니다.
4. **판정 문구 표기** — 맞춤법대로 **"라이어가 답을 맞혔습니다 / 맞히지 못했습니다"**(추천) 로 쓸까요, 말씀하신 "맞췄습니다 / 맞추지 못했습니다" 로 쓸까요?
