# 갱식 클럽

친구끼리 각자 기기에서 함께 즐기는 실시간 게임 사이트: 텍사스 홀덤, 블러핑 카드, 라이어게임, 요트다이스, 갱식마인드(그림 맞히기), 갱스껄(해골 피하기), 미니게임(오목·리버시·체커·체스·커넥트포). 규칙과 통신 규약은 `docs/SPEC.md`, 새 게임을 붙이는 법은 `docs/NEW-GAME.md`, 공용 약속은 `docs/COMMON-CONTRACT.md`가 기준이다.

## 로컬 실행

Node.js 22 이상이 필요하다(`package.json` engines, Render 도 22).

```sh
npm ci
npm run dev        # 서버(8080) + Vite 개발 서버
```

배포와 같은 방식으로 확인하려면:

```sh
npm run build      # client/ -> dist/
npm start          # http://localhost:8080 (PORT 환경 변수로 변경)
```

`DATABASE_URL`이 없으면 계정이 메모리에만 저장된다(서버를 끄면 사라짐).

## 테스트

| 스크립트 | 내용 |
| --- | --- |
| `npm run test:unit` | 모든 단위 시험 (`test/*.test.js`, `test/{common,room,liar,yacht,draw,gsk,mini,admin,coin}/`, `client/src/admin/`, CSS 검사 포함) |
| `npm run test:e2e` | 실제 서버 e2e 시험 (`test/e2e`, `test/{liar,yacht,draw}/e2e`) |
| `npm run test:ui` | 화면 스모크 시험 (`test/ui/smoke.mjs`, 실제 서버 + `?nogl=1`) |
| `npm run test:rounds` | 한 판 시험 4개: `test/ui/{liar,yacht,draw,gsk}-round.mjs` (창 3개씩) |
| `npm run check` | 빌드 → 단위 → UI 스모크 순서로 실행, 처음 실패에서 중단. 약 3분. **머지 게이트** |
| `npm test` | 빌드 → 단위 → e2e → 한 판 4개. 스모크는 `check` 쪽. 약 10분. main 배포 전에 실행 |

화면 오른쪽 아래의 작은 `v커밋` 글자는 빌드된 커밋(Render의 `RENDER_GIT_COMMIT`, 없으면 git, 그것도 없으면 `dev`)이다.
화면 시험은 Playwright 와 헤드리스 브라우저가 필요하다. 이 환경에는 GPU 가 없어 3D 모양·소리·실기기(iPad/Safari)는 시험하지 못한다.

## 환경 변수

| 이름 | 설명 |
|---|---|
| `PORT` | 서버 포트 (기본 8080) |
| `LIAR` `YACHT` `GSK` `DRAW` `MINI` | 게임 스위치: `off`(화면·서버 모두 흔적 없음) / `test`(주소에 `?liar=1` 처럼 `?<게임>=1` 이 있을 때만 로비 버튼이 보임) / `on`(모두에게 보임). **값이 없거나 그 밖의 값이면 다섯 모두 `on`**(server/index.js). render.yaml 도 다섯 모두 `on`. Render 는 이미 만든 서비스에 render.yaml 환경 변수를 자동 반영하지 않아 서버 기본값 자체를 `on` 으로 둔다. 끄려면 `off`/`test` |
| `ADMIN_KEY` | 관리자 로그인 비밀번호. 없으면 `9975` (SPEC 21절) |
| `COIN_SEED` | 새 계정이 시작할 때 받는 코인 수를 이 값으로 고정(클릭 시험 전용, 서버 운영에서는 쓰지 않는다. 0 이하·없음이면 꺼짐). 운영의 시작 코인은 코드의 20 |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 있으면 `users` 테이블을 자동 생성해 사용 |
| `GRACE_MS` `ROOM_GC_MS` `RESULT_MS` `RESULT_FOLD_MS` `TIE_EXTRA_MS` `BLUFF_RESULT_MS` `BUST_EXTRA_MS` `STREET_MS` `REVEAL_MS` `ROOM_LIST_MS` | 타이머 조정(밀리초). 테스트용이며 기본값은 SPEC대로 |

## 배포 (Render + Neon)

1. [Neon](https://neon.tech)에서 프로젝트를 만들고 연결 문자열(`postgresql://...?sslmode=require`)을 복사한다.
2. 이 저장소를 GitHub에 올린다.
3. Render에서 **New > Blueprint**로 저장소를 연결하면 `render.yaml`을 읽어 웹 서비스가 만들어진다.
4. 서비스 환경 변수 `DATABASE_URL`에 Neon 연결 문자열을 붙여 넣고 배포한다.
5. 배포 뒤 `https://<서비스>.onrender.com/healthz`가 `ok`를 돌려주면 정상이다.

무료 플랜은 한동안 접속이 없으면 서버가 잠들어 첫 접속이 느리고, 그때 진행 중이던 방은 사라진다(계정은 Neon에 남는다).
