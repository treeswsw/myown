> 지난 기록(지금 구조는 COMMON-CONTRACT.md)

# 코인·상점 작업 인계 (2026-11-13)

새 대화에서 이어 갈 때: "docs/HANDOFF-COIN.md, docs/SPEC.md 22절, docs/COIN-ITEMS.md 를 읽고 이어서 해" 라고 시작한다.

## 규칙 문서
- SPEC 22절(22-1~22-17): 갱식 코인, 적립, 교환, 카드 뽑기(22-15가 22-4를 대체), 상점, 비밀번호, 초기화 보호, 치장템·캡슐(22-16), 화면 약속(22-17).
- docs/COIN-ITEMS.md: 칭호·치장템 확정 목록(사용자와 정함, 수위 최대. 혐오 표현·KKK·"노+중력/코알라" 조합은 넣지 않기로 함).

## 일하는 방식 (사용자 지시)
- 기획·중요 화면(상점, 뽑기 화면 등)은 Fable, 단순 제작·덜 중요한 것(치장템 그림 등)은 Fable 지침대로 Sonnet. 검토는 돈·서버 묶음만 Opus.
- 토큰을 아낄 것: 과제를 작게, 무거운 전체 시험은 총괄이 합칠 때 한 번만.
- 브랜치: 개발 `claude/great-noether-tnbqu5` (2026-11-13 두 번째 대화. 그 전은 `claude/inspiring-wright-aq28a0`). 배포는 main(사용자에게 먼저 물어봄, 서버 재시작).

## 된 것 (개발 브랜치에 있음, 아직 main 배포 안 함)
- 코인 적립(블러핑·라이어·요트·갱식마인드, 홀덤 제외), 혼자 남은 판·봇 방 제외, 최소 간격.
- 교환 1코인=100칩(한도 없음), 코인 랭킹(번 합), "+N 코인" 알림.
- 카드 뽑기 서버(22-15: 5코인, 6등급, 금고, 60장 천장, 10장 보장, 무료 2시간·최대 2장, 기록, 잭팟 칭호). 화면은 옛 캡슐 화면을 숫자만 맞춘 상태 → 로비 [뽑기] 버튼은 일단 숨김(lobby.js SHOW_DRAW).
- 선택 비밀번호(4자리, 기기 토큰, 잠금·동시 시도 차단), 관리자 비밀번호 지우기, 초기화에 관리자 비밀번호.
- 품목 164개(shared/coin/items/*.js), 캡슐 규칙(shared/coin/capsule.js), 꾸미기 엔진(client/src/coin/look.js), 칭호 효과 21종(titlefx.js/css).
- 상점 화면: 사용자 시안("딜러의 테이블", https://claude.ai/artifact/GMJRU9ZYZTVvEePejfgjjb) 기반으로 Fable 이 제작 중/완료(칭호·테두리·글자 색·정장만).

## 남은 것 (순서대로)
1. 캡슐 뽑기 서버: 브랜치 `worktree-agent-a90b5848a72fd6f26`(커밋 c89c1c6)에 거의 완성본이 있음(중간에 멈춤: 시험 일부 갱신 필요). 병합 전 `npm run test:unit` 확인.
2. 치장템 그림(모자·기타 악세·페이셜, SPEC 22-17 형식 client/src/coin/art/*.js) — Fable 이 지침, Sonnet 제작.
3. 화면: 카드 뽑기(사용자 시안 Gacha.dc.html), 캡슐 뽑기 기계, 내 꾸미기(스티커 위치 조절) — Fable.
4. 방 안에서 남에게 꾸민 모습 보이기(`looks` 메시지, 게임 폴더는 고치지 않음).
5. 상점 "오늘의 패"(하루마다 4장, 하루 1회 무료 다시 깔기) — 서버 필요.
6. 정할 것: 무료 카드 뽑기 주기(지금 2시간·최대 2장, 사용자 다른 대화 메모는 1시간·최대 3장).

## 시안 캔버스
- 사용자 시안: https://claude.ai/artifact/GMJRU9ZYZTVvEePejfgjjb (공개 링크라 고쳐 올리려면 사용자 승인 필요)
- 총괄 시안(비공개): https://claude.ai/artifact/SQZc5yC3utSiCRugg8uJg8 (옛 시안 3장. 새 시안 작업은 중간에 멈춤)

## 다른 대화의 새 게임(갱스껄, 브랜치 claude/ecstatic-knuth-w3wto3)과 합칠 때
- 시험 병합 결과 겹치는 파일: CLAUDE.md, client/src/main.js, client/src/ui/lobby.js, docs/SPEC.md, package.json, server/rooms.js. 둘 다 "더하기"라 양쪽을 모두 살리면 된다.
- server/rooms.js `sendMe`: 갱스껄의 `gsk: hub.gsk` 와 코인의 `wallet: walletOf(...)`, `admin` 칸을 모두 남긴다. `createHub` 인자에 `gsk` 와 `coinSeed` 둘 다. dispatch 의 `gk` 줄과 `coin`/`pin` 줄 둘 다.
- package.json 시험 목록: `test/coin/*.test.js` 와 갱스껄 시험을 둘 다.
- 갱스껄 코인 적립은 아직 없음(COIN_RULES 에 없으면 0). 넣으려면 SPEC 22-13 대로 `shared/coin/rules.js` 한 줄 + `server/coin/hooks.js` 에 정산 감싸기(방 만들 때 `hookRoom`).
- 갱스껄 방 안의 코인 요청: 교환·뽑기·사기는 방 밖에서만이라 영향 없음. 끼기(equip)·`+N 코인` 알림은 방 종류와 무관하게 동작.

## 2026-11-13 두 번째 대화에서 한 것
- 상점 진열(SPEC 22-18): 사람마다, 위 5칸 5분 / 아래 5칸 1시간, 서버+화면 완료. 시안 그림 docs/coin/shop-preview.png. 가격 두 번 눌러 사기.
- 캡슐 뽑기 서버(cap·craft·pos, 조각, 수집 보상) 다시 만듦·병합(옛 작업본은 사라졌음). 응답: craft → {a:craft,id,shard,got?}, pos → 따로 답 없이 me 만 다시.
- 준비중 규칙(SPEC 22-19). 로비 버튼: 상점·뽑기·캡슐·꾸미기·교환·코인 랭킹.
- 진행 중이던 것(끝났는지 git log 로 확인): 카드 뽑기 화면(Fable, worktree-agent-aec3cce…), 캡슐 기계·내 꾸미기 화면(Fable, worktree-agent-a3ba2d08…). 끝나지 않았으면 client/src/coin/capsule.js·lookwin.js 는 "준비중" 자리 파일.
- 남은 것: 위 두 화면 병합 → lobby.js SHOW_DRAW=true, 버튼 이름 '카드 뽑기' → 돈·서버 묶음(진열+캡슐) Opus 검토 → npm test → 배포(사용자에게 먼저 묻기). 치장템 그림, 방 안 looks, 무료 뽑기 주기 결정.
- 카드 뽑기 화면: Fable 작업 중 멈춤. 만들다 만 것은 docs/coin/wip-card-gacha.patch (git apply 로 이어서). 로비 [카드 뽑기] 버튼은 켜져 있고 지금은 옛 화면이 열림(작동함). 서버 돈 묶음 Opus 검토는 시작 전에 멈춤 → 배포 전에 다시.

## 2026-11-14 정한 것 (치장·칭호 다음 단계, 상점 시안 확정 뒤 시작)
- 상점 시안 3안: https://claude.ai/artifact/4zTRgvkGTEBtx2G9oXUxZz (A 딜러 테이블 / B 네온 오락실 / C 거울 부티크). 사용자 선택 대기.
- 치장·칭호 시안은 Opus 가 Claude 디자인 캔버스로: 치장템 견본·칭호 효과·꾸미기 화면·게임 안 모습을 종류별 1~2개씩. 그림체 방향이 다르면 비교할 수 있게 여러 안. 전부 그리지 않는다.
- 스티커 조절: 끌기 + 크기·각도 슬라이더. 방 안 칭호: 이름 위 작은 배지.
