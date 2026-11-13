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
- 방 상태(`{t:'room', state}`)의 미니게임 부분: `{ mode:'mini', phase:'lobby'|'play'|'end', game, seats:[id|null, id|null], mn: 규칙 상태|null, result: null|{winner:0|1|'draw', reason:'win'|'resign'|'leave'|'draw'} }` + 다른 모드와 같은 공통 칸(code, host, players 등). 프로필 사진 넣지 않음.
- 오류 코드 접두사 `mn_`.

## 4. 구역
- 규칙·서버: shared/mini/, server/mini/, test/mini/ (+ server/rooms.js·protocol.js·index.js 연결)
- 보드판(그림): client/src/mini/boards/ — `renderBoard(el, game, state, { mySeat, onMove })`. CSS 는 전부 `.mn-`, 파일 client/src/mini/mini.css.
- 화면 연결: client/src/mini/index.js(`mountMini`), main.js, lobby, smoke.
