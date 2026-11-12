# 작업자 소통 게시판

서버 작업자와 화면 작업자가 서로에게 남기는 메모. 맨 아래에 덧붙이기만 한다(남의 글은 고치지 않는다).
형식: `## [서버|화면|관리자] 제목` 다음 줄에 내용. 질문에는 답한 쪽이 바로 아래에 `> 답:`으로 적는다.

남길 것: 통신 규약(SPEC 7장)의 모호한 점, 추가·변경한 필드, 상대가 알아야 할 동작 방식, 상대에게 필요한 요청.

## [서버] room.state / 이벤트 세부 결정 (구현 중, 변경 시 이 아래에 추가)
- 플레이어 id = 소문자 정규화 키, `name` = 표시용 원문. `room.state.players[]`에는 현재 모드의 필드만 들어간다(홀덤: stack/bet/folded/allin/isDealer/cards, 블러핑: alive/handCount/shots). 없는 필드는 falsy로 취급할 것.
- 순서: 한 번의 서버 처리마다 `event`들을 먼저 순서대로 보내고, 마지막에 `room`(최신 전체 상태)을 한 번 보낸다. 이모티콘은 `event`만.
- 홀덤 `event`: `deal{dealer}`, `blinds{sb:{id,amount},bb:{id,amount}}`, `action{id,a,amount}`(a는 fold/check/call/raise, amount는 이번 라운드 내 총 베팅액; 올인도 call/raise로 오고 직후 `allin{id}`), `street{street,cards}`, `showdown{shown:{id:[c,c]}}`, `win{winners:[{id,amount,handName,cards}],pot}`(한 명 남아 이긴 경우 handName=null, cards=[]), `bust{id,by}`.
- 홀덤 state: `toCall`(내 기준), `minRaiseTo`/`maxRaiseTo`는 내가 지금 레이즈 가능할 때만 값, 불가능하면 0/0(올인 콜만 가능한 경우 포함). `result`는 다음 판 시작 때 null로 돌아간다. 결과 후 약 6초(탈락자가 있으면 9초)에 자동으로 다음 판.
- 블러핑: `reveal`은 다음 `play` 때까지 state에 남는다. 게임이 끝나면 phase='result', winnerId 설정, 6초 뒤 'lobby'로 복귀.
- 관전: 판 도중 들어온 사람과 접속이 끊긴 사람은 새 판에 참가하지 않는다(`spectating:true`).

## [서버] 중요: event 메시지 형식 확정
`{t:'event', e:{k:'<종류>', ...필드}}` — 종류는 `e.k`(SPEC의 `e` 자리). 위 목록의 `action{...}` 등은 모두 `e.k==='action'` 형태이고, 이모티콘은 `{k:'emote', id, e:0..5}`. (SPEC 표기에서 `emote{id,e}`의 `e`와 충돌을 피하려고 종류 키를 `k`로 둠.) 블러핑 `bluffDeal{round,tableRank,turn}`, `bluffPlay{id,count}`, `liar{caller,by}`, `reveal{by,caller,cards,lie,loser,dead,shots}`, `shot{id,dead,shots}`, `bluffWin{id}`.

## [로비] createLobby 사용법 (client/src/ui/lobby.js)
```js
import { createLobby } from './ui/lobby.js';   // CSS는 lobby.js가 import
const lobby = createLobby({ onLogin(id, avatarDataUrl|null), onAvatar(dataUrl), onCreate(mode), onJoin(code), onMode(mode), onStart(), onLeave(), onLogout() });
document.body.append(lobby.el);   // position:fixed 전체 화면 오버레이, 배경은 비워 두므로 3D 장면이 비친다(패널만 유리)
lobby.setUser(user|null); lobby.setRoom(roomState|null); lobby.setError(msg|null); lobby.show(); lobby.hide();
```
- 화면은 setUser/setRoom 상태로만 결정: user 없음=로그인, user만=홈, user+room=대기방(phase==='lobby'일 때만 setRoom에 넘길 것; 게임 중엔 `lobby.hide()`).
- `onLogin`의 2번째 인자는 로그인 화면에서 미리 고른 사진(없으면 null). 로그인 성공 후 `avatar` 메시지로 보내 주세요. 아이디 형식 검사와 localStorage(`gs.lastId`) 저장은 로비가 함. 자동 로그인은 호출자가 `gs.lastId`를 읽어 직접 처리.
- `setError`는 현재 화면의 입력 근처에 표시(서버 error.msg를 그대로 넘기면 됨). 다음 입력 때 지워짐(로그인/입장 코드).
- 한글 폰트(Black Han Sans, Bangers, Noto Sans KR)는 index.html에서 불러와야 함(데모는 lobby-demo.html 참고). 데모: `lobby-demo.html?state=out|in|room-host|room-guest|crop`.
- `avatarCrop.js`: `openAvatarCrop(file) -> Promise<string|null>`(160x160 JPEG, 55KB 미만).

## [검토] 1차 검토 — 양쪽이 알아야 할 점
- 이벤트 형식은 서버 결정대로 `{t:'event', e:{k:'<종류>', ...}}`. 화면 쪽은 `msg.e.k`로 분기할 것(`msg.e`가 종류 문자열이 아님). 이모티콘 번호는 `msg.e.e`.
- 홀덤 올인은 `action{a:'call'|'raise'}` 직후 `allin{id}`로 온다(`a:'allin'` 이벤트는 없음). 클라이언트→서버 `act{a:'allin'}`은 레이즈가 가능할 때만 받아들여지고, 못 하면 짧은 올인 콜로 처리, 둘 다 아니면 오류.
- 한 번의 처리에서 이벤트가 몰아서 온다: 올인 런아웃이면 `street`×N + `showdown` + `win`이, 블러핑 LIAR면 `liar`+`reveal`+`shot`+다음 라운드 `bluffDeal`이 같은 묶음이고, 바로 뒤 `room`은 이미 다음 상태다. 화면은 연출 큐를 두고 연출이 끝날 때까지 해당 부분(보드·손패·reveal)의 갱신을 미뤄야 한다. 서버에도 지연을 요청함(아래 검토 기록 참고).
- 블러핑 `myHand`는 무늬 없는 `'A'|'K'|'Q'|'J'`. 시안의 무늬는 화면 쪽에서 장식으로 정할 것.
- 로그아웃 전용 메시지는 규약에 없다. 화면은 localStorage 아이디를 지우고 소켓을 닫았다 다시 여는 방식으로 처리(서버는 소켓 종료 = 연결 끊김으로 처리하므로 방에 있었다면 60초 자리 유지 후 퇴장).

## [로비] 디자인 변경 (API 동일)
로비를 시스템 글꼴(-apple-system 계열) 기반 iOS 스타일로 다시 만들었다. 위 `[로비]` 항의 "한글 폰트를 index.html에서 불러와야 함"은 로비에 한해 더 이상 필요 없다(Bangers·Black Han Sans 미사용). createLobby 인자·반환값·동작은 그대로.

## [서버] 검토 반영 + 타이머/포트 (확정)
- 환경 변수(index.js): `PORT`(0이면 임의 포트, 시작 시 `listening on <port>` 한 줄 출력), `TURN_MS`=30000, `GRACE_MS`=60000, `ROOM_GC_MS`=60000, `RESULT_MS`=6000, `BUST_EXTRA_MS`=3000, `STREET_MS`=1200(올인 런아웃 카드 장면당 결과 대기 추가), `REVEAL_MS`=4000(블러핑 벌칙 표시 뒤 다음 라운드). 자세한 건 `docs/PROTOCOL-NOTES.md`.
- 블러핑: LIAR 처리 후 `reveal` 채운 상태로 turn=null 4초, 이후 `bluffDeal` 이벤트와 새 `room`이 온다(`liar/reveal/shot`과 `bluffDeal`은 별개 배치). 홀덤 `pot`/`pots`는 모인 칩만(현재 라운드 베팅은 `players[].bet`).
- 짧은 빅블라인드가 올인해도 콜 금액은 항상 100.
- 주의(관리자): Node 22에서 `node --test test/`는 디렉터리를 모듈로 읽어 실패한다. package.json은 건드리지 말라는 지시라 두었다. `node --test test/*.test.js` 또는 `node --test`를 써야 한다.

## [서버] 같은 아이디 새 접속 시 이전 연결 종료 코드 = 4001
이전 연결에는 먼저 `{t:'error', msg:'다른 곳에서 접속하여 연결이 종료됩니다.'}`를 보내고 WebSocket을 `close(4001, 'replaced')`로 닫는다. 클라이언트는 4001이면 자동 재접속하지 말 것. `pot` 의미: 이미 모인 칩만(현재 베팅 라운드의 베팅은 `players[].bet`), 결과(`result`) 단계에서는 전체 팟. 타이머 env: TURN_MS GRACE_MS ROOM_GC_MS RESULT_MS BUST_EXTRA_MS STREET_MS REVEAL_MS 모두 index.js가 읽는다.

## [연출] 특수 연출 모듈 사용법 (client/src/anim/special/index.js) — 사용 가능
```js
import { createSpecialFX } from './anim/special/index.js';
const fx = createSpecialFX({ scene, camera, getSeat, shake, sfx });
await fx.playAllIn(id, { onPush });                    // 약 2.5초, onPush는 1.25초(손이 칩에 닿는 순간)
await fx.playBust(winnerId, loserId, { onHit });       // 약 3초, onHit은 1.35초(발사 순간)
await fx.playRevolver(id, { dead, shots, onResult });  // 약 3초, onResult(dead, shots)는 2.0초(방아쇠 순간)
fx.update(dt);   // 매 프레임(초 단위)   fx.dispose();
```
- `getSeat(id)` → `{ head: Vector3(사진 중심의 월드 좌표), headRadius(월드 단위), chips: Vector3(그 사람 칩 더미, 펠트 위), tableCenter: Vector3, feltY }`. 호출할 때마다 새로 계산해도 됨(시퀀스 시작 때 한 번 읽음).
- 몸은 `head` 바로 아래(목 = head.y − headRadius×0.9)에서 테이블 중심을 바라보며 자라고, 크기는 `headRadius/0.14`(0.85~1.45배)로 맞춘다. **사진의 월드 높이가 높을수록 몸이 테이블 위로 많이 보인다**(먼 쪽 자리는 head.y가 1.0 이하면 어깨·팔만 보임). 가능하면 `head.y`를 1.05~1.3으로 주면 좋다.
- 모듈이 하는 일: 몸·총·섬광·연기를 `scene`에 넣었다가 끝나면 제거. 탈락/리볼버 연출 중 카메라를 대상 쪽으로 최대 10~12% 살짝 당겼다 되돌림(카메라 위치에 차이값만 더하므로 호스트의 흔들림과 같이 써도 됨. 단, 연출 중 호스트가 `camera.position`을 절대값으로 덮어쓰면 당김이 사라질 뿐 문제는 없음).
- 호스트가 할 일: `onPush`에서 실제 칩을 중앙으로 밀고 "ALL IN" 글자 표시 / `onHit`에서 탈락자 사진을 뒤집어 흑백으로 / `onResult(dead, shots)`에서 n/6 숫자 갱신 또는 사진 뒤집기. `shake(strength 0~1, ms)`와 `sfx('whoosh'|'spin'|'click'|'shot'|'thud')` 제공. 조명은 추가하지 않는다(재질 재컴파일 방지).
- `prefers-reduced-motion`이면 몸 없이 0.12초에 소리와 콜백만 실행하고 0.3초에 끝난다.
- 확인용: `client/special-demo.html?seq=allin|bust|revolver-click|revolver-shot&seat=0..5&target=0..5&t=<초>`(t를 주면 그 시점에서 정지). 빌드 입력에는 포함되지 않는다.

## [연출] 검토 반영: 효과음 실패가 콜백을 막지 않음, skipAll 추가
- `sfx`/`shake`가 없거나 함수가 아니거나 예외를 던져도 무시하고, 각 시점에서 게임 콜백(onPush/onHit/onResult)을 먼저 호출한다. 콜백 자체의 예외는 console.error로만 남기고 프레임 루프를 멈추지 않는다.
- `fx.skipAll()`: 진행 중인 연출을 즉시 끝낸다(남은 콜백은 모두 실행되고 Promise도 끝남). 탭이 숨겨진 상태(`document.hidden`)에서 play*를 부르면 바로 콜백을 실행하고 끝난다. 탭이 숨겨질 때(visibilitychange) 호스트가 `skipAll()`을 불러 주면 이벤트 큐가 멈추지 않는다.

## [서버] 완료
엔진(shared/), 서버(server/), 단위·방·누출·서버 테스트(`node --test test/*.test.js` 56개 통과), render.yaml, README, PROTOCOL-NOTES 작성 완료. 검토 지적(관리자): 사이드 팟 빈 적격자, 타이머 예외 보호, 아바타 검증 강화, 4001 종료 코드, 블러핑 reveal 지연, 팟 의미 모두 반영.
참고: package.json의 `"test": "node --test test/"`는 Node 22에서 실패하므로 `node --test`(또는 `node --test test/*.test.js test/e2e/*.test.js`)로 바꿔야 한다. 지시상 package.json은 건드리지 않았다.

## [QA] e2e 스위트 결과
- `node --test test/e2e/*.test.js` 24개 전부 통과 (홀덤 2/3/6명 50판, 블러핑 2/4명 20판, 누출, 남용, 접속). `scripts/soak.js`로 부하 확인 가능.
- 참고(버그 아님): 올인은 레이즈도 콜도 불가능할 때(체크만 가능, 상대 전원 올인) 오류를 돌려준다. 승자 `win.winners[].amount` 합은 `pot`보다 작을 수 있다(돌려받은 미콜 베팅 제외). 70KB 초과 프레임은 연결을 끊는다.
- 테스트용 타이머 환경 변수: TURN_MS, RESULT_MS, BUST_EXTRA_MS, STREET_MS, REVEAL_MS, GRACE_MS, ROOM_GC_MS.

## [화면] 완료
클라이언트 구현 완료(`npm run build` 통과). 목업 상태 8종과 실제 서버(홀덤 2인 여러 판, 블러핑 라운드 진행)로 확인. 이벤트는 큐에서 재생하고 재생 중에는 room을 보류했다가 끝나면 반영한다(자세한 내용 docs/CLIENT-NOTES.md). 몸 연출은 `anim/special/`, 로비는 `ui/lobby.js`를 통합.

## [검토] 최종 검토 결과
양쪽 완료 후 전체 확인. `npm test` 80/80, `npm run build` 성공. 검토 중 나온 차단 4건(npm test 스크립트, 자동 로그인 키 불일치, 같은 아이디 두 탭 무한 쫓아내기, 빈 적격자 팟으로 서버 종료·칩 증발)과 중요 사항 모두 해결 확인. 기록은 docs/REVIEW.md.

## [서버] 채팅
`{t:'chat', text}` 구현됨(제어문자 제거·trim, 1~120자, 연결당 1초 1개/10초 5개, 초과 시 error "채팅을 너무 빨리 보내고 있습니다"). 방 전체(보낸 사람·관전자 포함)에 `{t:'event', e:{k:'chat', id, name, text, ts}}`만 가고 `room` 상태는 오지 않는다. 입장·재접속 시 본인에게만 `{k:'chatLog', items:[{id,name,text,ts}]}` 한 번(최근 30개, 비어 있으면 []). 입장할 때는 `room` 다음에 오고, 재접속할 때도 `room` 다음. 방에 없으면 error "방에 들어가 있지 않습니다."

## [채팅] UI 모듈 사용법 (client/src/ui/chat.js) — 사용 가능
```js
import { createChat } from './ui/chat.js';           // chat.css는 모듈이 스스로 import
const chat = createChat({ onSend: (text) => send({ t: 'chat', text }),
                          getAnchor: (playerId) => /* 그 사람 핀 맨 위(행동 핀이 있으면 그 위)의 화면 px {x,y} 또는 null */ });
ui.append(chat.el, chat.button);                     // 둘 다 position:fixed. #ui 안에 넣으면 됨
```
- 반환: `{ el, button, push(msg,{mine}), setLog(items, myId?), open(), close(), toggle(), setMode('game'|'lobby'), update() }`, `msg = {id, name, text, ts}` (id = 보낸 사람 id).
- 연결할 것: `event.k==='chat'` → `chat.push(e, {mine: e.id === me})`, `event.k==='chatLog'` → `chat.setLog(e.items, me)`(myId는 선택, 내 글 표시용; 기록만 채우고 말풍선은 띄우지 않음), 핀이 움직이거나 리사이즈할 때(매 프레임 호출해도 가벼움) `chat.update()`, 방 단계가 대기면 `chat.setMode('lobby')`, 게임 중이면 `'game'`.
- `button`은 기본으로 오른쪽 위(방 코드·모드 글자 아래, top=56px×--k, right=16px)에 고정돼 있다(대기 모드에서는 숨김). 읽지 않은 점은 자체 처리. 높이가 `--k`(updateScale)에 따라 변하므로 `updateScale()` 뒤에 `chat.update()`.
- 말풍선은 `getAnchor`가 null이면 오른쪽 위 아이콘 아래에 "이름: 내용" 토스트로 표시. 입력창은 아이콘 아래 오른쪽 정렬(키보드에 안 가림).
- 입력 중 키 입력은 stopPropagation 하므로 호스트의 전역 단축키는 입력 중에 동작하지 않는다. 호스트가 window 캡처 단계에서 키를 가로채지 않게 할 것. Enter(입력 포커스·버튼 포커스·아바타 크롭 중이 아닐 때)가 입력창을 연다.
- 대기 모드: 하단 중앙 막대(최근 3줄 + 입력). 로비 패널과 겹치지 않도록 `chat.css`가 `html.chat-docked .lobby`(padding-bottom)와 `.panel`(max-height)를 조정한다(lobby.css는 건드리지 않음; 짧은 화면에서는 패널이 약 45px 낮아져 내부 스크롤). 게임 시작 시 반드시 `setMode('game')`을 불러야 이 보정이 풀린다.
- 확인용: `client/chat-demo.html?state=bubbles|replace|input|history|toast|lobby&t=<ms>`(t는 말풍선·토스트 애니메이션을 그 시점에서 정지).
