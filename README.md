# 갱식 클럽

친구끼리 각자 기기에서 함께 즐기는 실시간 카드 게임 (텍사스 홀덤, 블러핑 카드). 규칙과 통신 규약은 `docs/SPEC.md`가 기준이다.

## 로컬 실행

Node.js 20 이상이 필요하다.

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

```sh
node --test test/*.test.js
```

### 화면 클릭 테스트 (`npm test`에 포함되지 않음)

실제 서버와 헤드리스 브라우저로 진짜 클릭/탭을 눌러 휠·다이얼·보드 확대·이모티콘·채팅·메뉴 나가기·블러핑 PLAY/LIAR를 확인한다.
소프트웨어 렌더링이라 느리다(컨텍스트당 수 분). Playwright가 필요하다.

```sh
npm run build
PLAYWRIGHT_MODULE=/경로/playwright node test/ui/click.e2e.mjs          # desktop, phone(844x390 터치), tablet(1024x768 터치) 전부
PLAYWRIGHT_MODULE=/경로/playwright node test/ui/click.e2e.mjs phone    # 하나만
```

## 환경 변수

| 이름 | 설명 |
|---|---|
| `PORT` | 서버 포트 (기본 8080) |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 있으면 `users` 테이블을 자동 생성해 사용 |
| `GRACE_MS` `ROOM_GC_MS` `RESULT_MS` `RESULT_FOLD_MS` `TIE_EXTRA_MS` `BLUFF_RESULT_MS` `BUST_EXTRA_MS` `STREET_MS` `REVEAL_MS` `ROOM_LIST_MS` | 타이머 조정(밀리초). 테스트용이며 기본값은 SPEC대로 |

## 배포 (Render + Neon)

1. [Neon](https://neon.tech)에서 프로젝트를 만들고 연결 문자열(`postgresql://...?sslmode=require`)을 복사한다.
2. 이 저장소를 GitHub에 올린다.
3. Render에서 **New > Blueprint**로 저장소를 연결하면 `render.yaml`을 읽어 웹 서비스가 만들어진다.
4. 서비스 환경 변수 `DATABASE_URL`에 Neon 연결 문자열을 붙여 넣고 배포한다.
5. 배포 뒤 `https://<서비스>.onrender.com/healthz`가 `ok`를 돌려주면 정상이다.

무료 플랜은 한동안 접속이 없으면 서버가 잠들어 첫 접속이 느리고, 그때 진행 중이던 방은 사라진다(계정은 Neon에 남는다).
