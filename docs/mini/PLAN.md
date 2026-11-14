# 미니게임 (다섯 번째 모드) — 약속

사용자 요청(2026-11-13): "간단한 미니게임들 모아서 분류 하나 만들자. 미니게임 안에서 분류로 선택할 수 있게.
오목, 리버시, 체커, 체스, 커넥트포. 작동만 잘 되면 돼. 보드판만 퀄리티 괜찮게(깔끔하게). 효과·사운드 신경 X."

## 1. 사이트 쪽
- 모드 이름 `mini`, 화면 이름 "미니게임". 스위치 `MINI`: off / test(`?mini=1`) / on. 서버 기본값 on.
- 방 만들 때 또는 대기실에서 방장이 게임을 고른다: `gomoku`(오목) `reversi`(리버시) `checkers`(체커) `chess`(체스) `connect4`(커넥트포).
- 2명이 둔다. 3번째부터는 관전(서버 틀이 관전을 쉽게 못 받으면 최대 2명).
- 시작 시 서버가 crypto 난수로 선(seat 0)을 정한다. seat 0 = 흑(오목·리버시·체커) / 백(체스) / 빨강(커넥트포).
- 시간 제한 없음. 나가기 = 기권. 끊기면 기다리고 60초 뒤 기권(요트 GRACE 방식 그대로).
- 끝나면 결과 표시 → 방장 "다시" → 대기실로(자리 다시 정함).
- 사용자 글자는 textContent 로만. 무작위는 crypto 만.

## 2. 규칙 모듈 shared/mini/<game>.js (순수 함수, 화면·서버 공용)
모두 같은 모양:
- `init()` → 상태(JSON): `{ board, turn: 0|1, winner: null|0|1|'draw', last: 마지막 수|null, ...게임별 }`
- `legalMoves(state)` → 지금 둘 수 있는 수 배열
- `apply(state, move)` → 새 상태(원본 안 바꿈) 또는 잘못된 수면 `null`
- shared/mini/index.js: `GAMES = { gomoku, reversi, checkers, chess, connect4 }`, `NAMES = { gomoku:'오목', ... }`

판 모양과 수 모양 (board[y][x], y=0 이 화면 위쪽):
- gomoku: 15×15, 칸 `null|0|1`, 수 `{x,y}`. 가로·세로·대각 5개 이상 연속이면 승(자유룰). 판이 차면 무승부.
- connect4: 가로 7 × 세로 6, 칸 `null|0|1`, 수 `{x}`(열). 떨어진 자리는 `last = {x,y}`. 4목 승.
- reversi: 8×8, 칸 `null|0|1`, 시작 4알 표준. 수 `{x,y}`. 둘 곳 없으면 apply 안에서 자동 패스(turn 유지), 둘 다 없으면 끝(많은 쪽 승). `last` 에 뒤집힌 칸 `flips:[{x,y}]` 포함.
- checkers: 8×8 미국식, 칸 `null|{p:0|1,k:bool}`. seat 0 은 아래(y=5..7)에서 위로. 수 `{from:{x,y}, to:{x,y}}` 한 칸씩(연속 점프는 같은 말이 이어서, `state.chain={x,y}` 동안 turn 유지). 잡을 수 있으면 반드시 잡기. 끝줄 도달 시 킹. 둘 수 없으면 패.
- chess: 8×8, 칸 `null|'wK'|'bQ'...`(w/b + KQRBNP), y=0 = 8랭크(흑 쪽), seat 0 = 백(아래). 수 `{from:{x,y}, to:{x,y}, promo?:'Q'|'R'|'B'|'N'}`. 캐슬링·앙파상·승진·체크메이트·스테일메이트, 기물 부족·50수·3회 반복은 무승부. `state.check: bool`(둘 차례인 쪽이 체크).

## 3. 통신 (SPEC 7절 형식)
- 요청: `{t:'mn', a:'game', game}`(방장, 대기실) / `{t:'mn', a:'start'}`(방장, 2명일 때) / `{t:'mn', a:'move', move}` / `{t:'mn', a:'resign'}` / `{t:'mn', a:'again'}`(방장, 끝난 뒤).
- 방 상태(`{t:'room', state}`)의 미니게임 부분: `{ mode:'mini', phase:'lobby'|'play'|'between'|'end', game, seats:[id|null, id|null], mn: 규칙 상태|null, result: null|{winner:0|1|'draw', reason:'win'|'resign'|'leave'|'draw'} }` + 다른 모드와 같은 공통 칸(code, host, players 등). 프로필 사진 넣지 않음.
- 오류 코드 접두사 `mn_`.

## 4. 구역
- 규칙·서버: shared/mini/, server/mini/, test/mini/ (+ server/rooms.js·protocol.js·index.js 연결)
- 보드판(그림): client/src/mini/boards/ — `renderBoard(el, game, state, { mySeat, onMove })`. CSS 는 전부 `.mn-`, 파일 client/src/mini/mini.css.
- 화면 연결: client/src/mini/index.js(`mountMini`), main.js, lobby, smoke.

## 5. 설정·승부·베팅 (2026-11-13 사용자 요청)
대기실 설정은 공통 대기실 스키마(shared/mini/settings.js)로 그린다. 방장이 `{t:'set', patch}`, 본인이 `{t:'pick', patch}`.
- 종목 방식 `kind`: `fixed`(한 종목 고정, `game`) / `random`(고른 `games` 중 hub.rng 로 매 판) / `order`(고른 `games` 를 종목 목록 순서로 매 판, 한 바퀴 돌면 처음부터. 고른 순서가 아니라 목록 순서). random·order 는 2개 이상 골라야 시작(`mn_games`). 기본 `fixed`, 종목 `gomoku`, `games` 는 다섯 개 전부.
- 오목 규칙 `rule`: `free`(제한 없음, 기본: 5개 이상이면 승) / `renju`(렌주룰: 흑만 3-3·4-4·장목(6목 이상) 금지, 흑은 정확히 5목만 승, 백은 제한 없음·장목도 승, 5목이 되는 수는 금수보다 먼저). 금수 자리는 서버가 `mn_forbid` + 이유 글로 거절(차례 그대로). 판 상태 `mn.rule`.
- 승부 방식 `len`: 1(단판, 기본) / 3(3판 2선승) / 5(5판 3선승). 판 사이에 자리를 서로 바꿔 선(먼저 두는 사람)이 번갈아 바뀐다(첫 선은 난수). 한 판이 끝나고 매치가 안 끝났으면 `phase:'between'` 으로 `BETWEEN_MS`(5초) 쉬고 서버가 다음 판을 시작한다(관리자 skip 은 바로). 매치가 끝나야 `phase:'end'`(결과) → 대기실. 무승부 판은 승수에 넣지 않고 다시 한다(한 매치에서 3번 나오면 매치도 무승부, 단판은 무승부면 바로 끝). 판 중·판 사이의 기권/나감/60초 끊김은 매치 전체 패배.
- 방 상태 추가 칸: `phase` 에 `between`, `match: null | {len, kind, round, draws, bet, score:[자리0 승수, 자리1 승수], next: 다음 판 시작 시각|null, last: null|{winner: 자리|'draw', game}}`. `result` 는 매치 결과 `{winner: 마지막 판 기준 자리|'draw', reason: 'win'|'resign'|'leave'|'draw'}`(모양은 전과 같다). `wait.set = {game, kind, games, rule, len}`, `wait.own = {[id]: {bet}}`(두 사람 모두 보임).
- 코인 베팅(개인 칸 `bet`, 화면 `waitPart('mn-bet')`): 앉은 두 사람이 각자 가진 코인 이하로 건다(`pick {bet}`; 구경꾼은 0 만, 한도 초과는 `mn_coin`, 정수 아님 `mn_betval`). 둘의 수가 같아야 시작(`mn_bet`: "건 코인이 서로 달라요 (같게 맞추거나 둘 다 0)"), 시작 직전 잔액 재확인(`mn_coin`), 둘 다 0 이면 내기 없음, 봇과는 불가. 시작하면 `hub.stake`(SPEC 22-20)로 두 사람에게서 떼어 맡고, 매치가 끝나면 이긴 사람이 전부, 무승부·서버가 닫히는 경우는 돌려준다. 베팅 칸은 매치가 끝날 때마다 0 으로 비운다. 원래 승리 코인(미니 +1)은 매치를 판 승수로 이긴 사람에게 한 번.

## 5. 봇과 하기 — 2026-11-14 (사이트 공통 틀 그대로, docs/NEW-GAME.md 2절)
- 따로 화면·따로 흐름을 만들지 않는다. **미니게임 방 하나에 봇 자리**를 둔다. 방 만들기·대기실·시작·나가기·결과 화면·코인은 공용(Shell, `ctx.finish`, `client/src/room/result.js`) 그대로.
- 방 설정(shared/mini/settings.js): `vs: 'friend'|'bot'`, `level: 'easy'|'mid'|'hard'`, `side: 0|1`(사람이 선=0). 로비에서 "봇과 하기"를 고르면 이 설정으로 방을 만들고 바로 시작(대기실 생략 가능, 다시 시작은 공용 결과 화면의 "다시").
- 봇 방은 사람 1명. 다른 사람은 관전만. `seats = [사람id, 'bot']` 또는 반대. 봇 자리 이름 "봇 (초급/중급/고급)". 정원 예외(min 1)는 NEW-GAME 4절 예외 표에 한 줄.
- **봇 계산은 사람 기기에서**(서버 부담 0): 봇 차례가 되면 사람 화면이 `client/src/mini/bots/index.js` 의 `botMove(game, state, level)`(Web Worker, 체스는 Stockfish)로 수를 구해 `{t:'mn', a:'bot', move}` 를 보낸다. 서버는 그 방의 사람만, 봇 차례에만, shared 규칙으로 합법인 수만 받는다. 사람이 끊기면 판은 멈추고 공용 유예(60초) 뒤 기권.
- 봇 엔진 약속: `botMove(...) → Promise<move>`(2절 모양, legalMoves 안의 수, 최소 400ms, 실패 시 무작위 합법 수). 오목·커넥트포·리버시·체커 `bots/<game>.js` 의 `pickMove(state, level, deadlineMs)`, 체스 `bots/chess.js` 의 `chessMove(state, level)`. 세기: 오목 1(+실수)/2/4, 커넥트포 2/6/1.5초, 리버시 2/4/7+끝 12수, 체커 2/5/8(1초), 체스 Skill 0(+무작위 30%)/8/20.
- **코인**: `shared/coin/rules.js` COIN_RULES 에 `minibot_easy {finish 0, win 2}` / `minibot_mid {1, 2}` / `minibot_hard {1, 9}` (gapMs 60000, 사람전 mini 와 같은 모양·규칙: 이김 2·3·10, 끝까지 두고 지면 0·1·1, 기권·나감·무승부 0). 봇 방은 `ctx.finish(rows, { coin: 'minibot_<난이도>' })` 로 사람 한 줄만 낸다. "방에 봇이 있으면 지급 없음" 규칙은 관리자 봇(server/admin) 얘기라 이 봇 자리에는 적용하지 않는다(예외 표에 한 줄). 관리자 세부 설정(21-7)에서 값이 바뀌게 기존 줄과 같은 방식.
- 결과 화면: 공용 결과에 "봇(중급)에게 승리 +2" 처럼 `resultPart`/`note` 로.

## 6. 체스 퍼즐 (혼자 퀴즈 풀기) — 2026-11-14 사용자 결정
- 입구: 미니게임 → 체스 → "혼자 퀴즈 풀기". 미니게임 방(1인, 설정 `vs:'puzzle'`)으로 공용 틀 그대로(방·나가기·코인 `ctx.finish`). 원하는 만큼 연달아 푼다(한 문제 = 한 판).
- 문제: 리체스 공개 퍼즐 모음에서 고른 묶음 `server/mini/puzzles.json.gz`(scripts/build-puzzles.mjs 로 만듦). 칸: `[id, fen, moves(uci 공백 구분), rating]`. 리체스 형식: fen 은 상대가 첫 수를 두기 전, moves[0] 은 상대 수(서버가 자동으로 둠), 그다음부터 사람·상대 번갈아. 마지막 수가 체크메이트면 다른 메이트 수도 정답.
- **정답은 서버만 안다.** 화면에는 현재 판(우리 chess 상태)만 보낸다. 사람이 `{t:'mn', a:'move', move}` → 서버가 맞으면 상대 응수 자동, 틀리면 그 문제 실패(정답 수순을 그때 보여줌). "힌트"(갈 말 칸 표시) / "정답 보기" 있음 — 쓰면 그 문제 코인 0, 레이팅은 실패로.
- **내 퍼즐 레이팅**: 1500 시작. users 에 `puzzle jsonb {r, n, streak, best}` 칸 추가(22-1 과 같은 방식, newUser·rowToUser·save 모두). 문제는 내 레이팅 ±150 안에서(없으면 넓혀서) crypto 난수로, 최근 200문제 안 겹치게. Elo: 기대값 E=1/(1+10^((문제−나)/400)), K = 처음 20문제 40, 이후 20. 맞힘 +K(1−E), 틀림 −K·E.
- **코인**(COIN_RULES `puzzle` 줄, 관리자 설정으로 바뀜): 첫 시도에 맞혀야(힌트·정답 보기·틀림 = 0). 문제 난이도 1200 미만 1, 1200~1800 2, 1800~2200 3, 2200 이상 5. 5연속 정답마다 +2. **하루 100코인 상한**(한국 시간 자정 초기화; 넘으면 계속 풀 수 있고 레이팅은 오르지만 코인 0, 화면에 "오늘 코인 다 받음"). 최소 간격 없음. 오늘 받은 양은 coin_log 의 note `{mode:'puzzle'}` 합으로 셈(서버 재시작에도 유지).
- 화면: 체스판(boards 그대로, 내가 두는 쪽이 아래), 위에 "백 차례 — 최선의 수를 찾으세요", 내 레이팅(±변화), 문제 난이도, 연속 정답, 오늘 코인 n/100. 끝나면 "다음 문제" 큰 버튼(공용 결과 화면을 문제마다 띄우지 않고 판 아래 짧은 줄로 — 예외 표에 한 줄).
