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
