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

## [채팅] 추가: setEnabled(bool)
- `chat.setEnabled(false)`: 방이 없을 때(`room:null`) 호출. 아이콘·입력창·기록·대기 막대를 숨기고, 말풍선·토스트·안 읽은 점을 지우고, `html.chat-docked` 로비 축소를 해제하며, 전역 Enter와 `open()/toggle()`을 무시하고 `push()`도 무시한다. `setEnabled(true)`는 방에 들어갈 때(현재 mode 그대로 복원). 기본값은 true.
- `setLog([])`는 기록과 대기 막대를 완전히 비운다. 모드가 바뀌면(`setMode`) 남은 토스트와 말풍선을 지우고 대기 모드에서는 입력창 열림 상태도 닫는다.
- `update()`는 매 프레임 불러도 레이아웃을 읽지 않는다(말풍선 크기는 생성·리사이즈 때만 측정, 값이 안 바뀌면 transform도 쓰지 않음). 120자 제한은 코드 포인트 기준(서버와 동일).

## [서버] 채팅 보완
속도 제한은 이제 아이디(세션) 단위라 같은 아이디 새 접속으로 초기화되지 않는다. 너비 0 공백·방향 표시 등 서식 문자는 지우고(이모지용 U+200D만 유지) 보이는 글자가 없으면 거절한다(error "채팅은 1~120자여야 합니다.").

## [서버] 방 목록 / 시간제한 제거
- 방 목록: 방 밖의 로그인 사용자에게 `{t:'rooms', list:[{code, mode, hostName, count, max, phase}]}` (phase는 'lobby'|'playing'|'result', max는 홀덤 6/블러핑 4, 가득 찬 방은 count===max, 사람이 없는 방은 제외). 로그인 직후·방을 나온 직후에는 바로, 이후 목록이 실제로 바뀌면 0.5초에 한 번으로 묶어 보낸다. 방 안에 있는 사람에게는 보내지 않는다. 입장은 그대로 `{t:'join', code}`; 진행 중인 방(홀덤·블러핑 모두)에 들어가면 `spectating:true`로 다음 판/게임부터 참가. 가득 찬 방에 join하면 error "방이 가득 찼습니다.".
- 시간제한 제거: `turnEndsAt`는 항상 null. 접속 중인 사람의 차례는 무한정 기다린다. 접속이 끊긴 사람은 끊긴 시점부터 60초 뒤(GRACE_MS) 차례였다면 자동 행동(체크 가능하면 체크, 아니면 폴드 / 블러핑은 첫 카드 1장 또는 LIAR) 후 방에서 제거된다. 60초 안에 재접속하면 취소. 끊긴 사람에게 차례가 오면 별도 유예 없이 이 같은 60초 시계가 이미 가고 있다. `TURN_MS`는 삭제됨, 새 환경 변수 `ROOM_LIST_MS`(500).

## [로비] 방 목록 (코드 입력 제거)
- 새 메서드 `lobby.setRooms(list)`, `list = [{code, mode:'holdem'|'bluff', hostName, count, max, phase}]`. 서버 `{t:'rooms', list}`를 받을 때마다 그대로 넘기면 됨(code로 비교해 갱신, 스크롤 유지). 빈 배열이면 빈 상태 문구 표시.
- 방 행을 누르면 `onJoin(code)` 호출(시그니처 동일). `count >= max`인 행은 "가득 참"으로 비활성. 입장 실패는 `setError(msg)`가 목록 아래에 표시.
- 방 코드 입력칸, 대기실의 큰 코드·복사 버튼은 제거. 대기실 제목은 "방장이름의 방". `onMode/onStart/onLeave` 동작 동일.

## [로비] 칩 0 처리 (리필 없음)
- 칩은 `user.chips ?? user.bank`로 읽는다. 0이면 프로필 아래에 "칩을 모두 잃었습니다…" 안내와 "새 아이디로 시작"(→ `onLogout()`)이 보이고, 홀덤 선택 시 방 만들기가 비활성(사유 표시). 홀덤 방 행은 chevron 대신 "관전" 표시(누르면 그대로 `onJoin(code)`). 블러핑은 그대로 사용 가능. "리필" 통계 행 제거.

## [서버] 탈락/칩 규칙 변경
- `me.user.bank` = 계정 칩 전부(은행/스택 구분 없음, 신규 10000). 판이 진행되는 동안에는 그 판 시작 시점 값이고 판이 끝날 때(또는 중간 퇴장 때) 갱신되어 `me`가 다시 온다. 판 중 실시간 스택은 `room.players[].stack`을 쓸 것. `stats.refills`는 호환용으로 남기되 항상 0.
- 홀덤 `room.players[]`에 `eliminated: bool` 추가 = 계정 칩이 0(탈락 또는 칩 없이 입장). 판이 끝나는 `room` 상태에서 바로 true가 되므로 연출은 `bust` 이벤트(`{k:'bust', id, by}`, by = 그 판 최다 획득자)에 맞춰 늦춰서 반영할 것. 탈락자는 다음 판부터 딜되지 않는다(`spectating:true`, 칩 0). 칩 0 계정은 홀덤 방 입장은 되지만 관전만, `create` holdem은 error "칩이 없습니다. 새 아이디로 다시 시작하세요". 블러핑은 칩과 무관.
- 챔피언: 탈락 직후 칩 가진 사람이 1명이면 결과 표시(기존 대기시간) 뒤 `{k:'champion', id}` 이벤트와 함께 `phase:'lobby'`로 돌아간다. 홀덤 `start`는 접속 중이고 칩이 있는 사람이 2명 이상일 때만(아니면 error "칩이 있는 사람이 2명 이상 필요합니다.").
- 난입은 이번 판 관전(`spectating:true`) 후 다음 판 자동 참가(칩 있을 때). 나가기/유예 만료는 폴드(낸 칩은 팟에 남음)이고 남은 스택은 즉시 계정 칩으로 돌아간다. 블러핑은 탈락 처리.

## [연출] playStand
- `special.playStand(winnerId, { onUp, onDown }) -> Promise` (client/src/anim/special/index.js). 쇼다운 승자가 자리에서 일어나 두 주먹을 치켜드는 연출. 총 2.6초, 소품 없음.
- 흐름: 0~0.5초 몸이 자라나 테이블을 짚고 웅크림 → **0.62초 `onUp(dy)`** 와 함께 일어섬(약 0.4초, 살짝 오버슈트) → 0.92~1.3초 두 팔을 V자로 올림 → 유지 → **2.02초 `onDown()`** 후 약 0.3초 동안 내려오고 사진 속으로 들어감.
- 호스트가 할 일: `onUp(dy)`에서 승자 프로필 사진(핀)을 월드 좌표 y로 `dy`만큼(약 0.24 × 몸 배율) 0.4초에 걸쳐 올리고, `onDown()`에서 0.3초에 걸쳐 원위치. 몸의 목 위치도 같은 만큼 올라가므로, 사진을 올리지 않으면 목이 사진 뒤로 들어가 보인다(깨지지는 않음). 화면 좌표로는 `getSeat`의 head에 dy를 더해 투영하면 된다.
- 다른 연출과 같이 한 번에 하나만: 호출 전에 `skipAll()`. 건너뛰어도 `onUp`·`onDown`은 호출되고 Promise는 해결된다.
- 동작 줄이기 설정에서는 몸 없이 `onUp(0)`, `onDown()`만 호출하고 0.3초에 끝난다.
- 데모: `client/special-demo.html?seq=stand&seat=<n>&t=<초>`

## [서버] 결과 표시 시간 (SPEC 15)
홀덤 결과 유지: 쇼다운 있음 11000ms(`RESULT_MS`), 모두 폴드 4000ms(`RESULT_FOLD_MS`); 추가: 올인 런아웃 카드 장면당 1700ms(`STREET_MS`), 공동 승자 추가 1명당 2500ms(`TIE_EXTRA_MS`), 탈락자 있으면 3000ms(`BUST_EXTRA_MS`). 블러핑 종료 후 로비 복귀는 6000ms(`BLUFF_RESULT_MS`). 챔피언 이벤트는 이 대기가 끝난 시점에 나간다.

## [서버] 팟 버그 수정 (퇴장자의 콜 안 받은 레이즈)
`buildPots`: 환급(콜 받지 못한 베팅)은 아직 판에 있는 사람에게만 한다. 폴드·퇴장한 사람이 낸 칩은 어떤 경우에도 몰수되어 남은 사람의 팟에 합쳐진다(재현: 딜러 200 레이즈 후 퇴장, SB 폴드 → BB가 350 획득, 합계 30000 유지). 올인한 사람이 나가도 폴드로 처리되어 몰수된다(쇼다운에 남지 않음). 회귀 테스트 3개 추가.

## [서버] 사진 이모티콘/사운드
클라이언트 → 서버: `{t:'pemote', data}`(JPEG 데이터 URL ≤40KB, 아이디당 3초 1개), `{t:'sndAdd', sid, name, data}`(sid `[a-z0-9]{6,16}`, name 1~8자, data `data:audio/...;base64,...` ≤200KB 문자열, 아이디당 10초 1개), `{t:'snd', sid}`(sid는 방에 올라간 소리 또는 `builtin:<a-z 1~16자>`, 아이디당 2초 1개). 큰 메시지(sndAdd)는 JSON에서 `t`가 **첫 번째 키**여야 한다(`JSON.stringify({t:'sndAdd', ...})`처럼); 프레임 한도는 300KB, 나머지 메시지는 70KB.
서버 → 방 전체(관전자·보낸 사람 포함, `room` 없이 event만): `{k:'pemote', id, data}`, `{k:'sndAdd', sid, by, name, data}`, `{k:'snd', id, sid}`. 입장·재접속 시 `room` 다음에 chatLog, 그다음(소리가 있을 때만) `{k:'sndList', items:[{sid,by,name,data}]}`. 같은 sid를 같은 사람이 다시 올리면 조용히 무시(재전송 없음), 다른 사람이 쓰던 sid면 error. 아이디당 8개 초과 시 그 사람의 가장 오래된 것, 방 24개 초과 시 가장 오래된 것이 삭제되며 삭제 알림은 없다(없는 sid 재생은 error "없는 소리입니다."). 제한 초과 error: "사진 이모티콘을 너무 빨리 보내고 있습니다" / "소리를 너무 빨리 올리고 있습니다" / "소리를 너무 빨리 재생하고 있습니다".

## [이모티콘/사운드] 모듈 사용법
`client/src/ui/emotePanel.js` (+ `emotePanel.css`, `client/src/media.js`). 네트워크를 모르는 DOM 모듈. 데모: `client/emote-demo.html?state=emote|sound|sound-edit|photo|playing&t=<ms>` (`&host`, `&fail`=서버가 응답하지 않는 경우).
```js
import { createEmotePanel } from './ui/emotePanel.js';
const ep = createEmotePanel({
  onEmote: (i) => send({ t: 'emote', e: i }),
  onPhoto: (data) => send({ t: 'pemote', data }),                // JPEG 데이터 URL <= 40000자, <= 256x256
  onSoundAdd: ({ sid, name, data }) => send(JSON.stringify({ t: 'sndAdd', sid, name, data })), // t가 반드시 첫 키(서버가 70KB 초과 프레임을 접두어로 판별), 데이터 URL <= 200000자
  onSound: (sid) => send({ t: 'snd', sid }),                      // 'builtin:clap' | 방 사운드 sid
  onSoundDelete: (sid) => send({ t: 'sndDel', sid }),
  onSoundRename: (sid, name) => send({ t: 'sndRename', sid, name }),
  getAnchor: (id) => pins.anchor(id),                             // 핀 위쪽 화면 px {x,y} | null (chat과 동일)
  getSelf: () => state.me.id,                                     // 내 id (내 사운드 수정 권한, "다른 사람 사운드 끄기"가 내 소리 제외)
  getName: (id) => name,                                          // 버튼에 작게 표시할 추가한 사람 이름
  isHost: () => room.hostId === state.me.id,                      // 방장은 남의 사운드도 이름 변경/삭제 가능
  onClose: () => closePanel(),                                    // 선택: 이모티콘/사진을 보낸 뒤 호출(사운드는 호출 안 함)
});
```
- `ep.el`: 탭 두 개가 있는 패널 내용. `h('div','hpanel', ep.el)`로 기존 이모티콘 격자 자리에 넣는다(`.hpanel`은 `scale(var(--k))`이라 44px 터치 영역은 `calc(44px / var(--k))`). 한 번만 만들어 재사용(떼었다 다시 붙여도 상태 유지).
- 서버 메시지: `{k:'pemote',id,data}` → `ep.showPhoto(id,data)`; `{k:'snd',id,sid}` → `ep.playSound(id,sid)`; `{k:'sndAdd',sid,by,name,data}` → `ep.addRoomSound({sid,by,name,data})`; `{k:'sndList',items}` → `ep.setRoomSounds(items)`; `{k:'sndDel',sid}` → `ep.removeRoomSound(sid)`; `{k:'sndRename',sid,name}` → `ep.renameRoomSound(sid,name)`; 서버 `error` 문구 → `ep.handleError(msg)`; 방을 나가면(room null) `ep.clearRoom()`.
- **사운드는 방 공유**: 방의 모든 사운드가 "방 사운드" 버튼(추가한 사람 이름 작게)으로 보이고 누구나 `onSound(sid)`. 사운드를 추가하면 즉시 `onSoundAdd`; 서버 `sndAdd` 이벤트가 오면 버튼이 생기고, 그 전에는 "올리는 중…", 5초 안에 안 오거나 `handleError`가 불리면 "다시 시도"(누르면 재업로드).
- **방에 들어간 뒤 `await ep.syncMine()`** (`setRoomSounds` 처리 뒤): 내 기기(IndexedDB)에 저장된 내 사운드 중 방에 없는 것을 10.5초 간격으로 차례로 올린다(서버 10초 제한). 최대 8개.
- **편집**: 사운드 탭 "편집" 버튼 → 각 방 사운드에 미리듣기(나만 들림) / 이름(≤8자) / 삭제(확인). 이름·삭제는 추가한 사람과 방장만(`getSelf`/`isHost`), 나머지는 미리듣기만. 서버가 `sndDel`/`sndRename`을 보내면 그때 반영(낙관적 갱신 없음); 내 사운드가 삭제되면 IndexedDB에서도 지우고, 이름이 바뀌면 IndexedDB도 갱신. 기본 효과음은 편집 불가. 길게 눌러 삭제는 없음.
- 매 프레임(또는 핀 위치가 바뀔 때) `ep.update()`. 떠 있는 요소는 `document.body`의 `.ep-layer`(pointer-events:none). 음소거는 `audio.js`의 `isMuted()`를 media.js가 직접 확인. 사진/사운드는 도착 즉시 표시·재생, 재생은 최대 5초/동시 3개.
- 한계값은 서버(40*1024, 200*1024)보다 약간 작은 40000/200000자.

## [서버] 사운드 편집
`{t:'sndDel', sid}` → 방 전체에 `{k:'sndDel', sid}`; `{t:'sndRename', sid, name}` → `{k:'sndRename', sid, name}` (이름 1~8자, 공백 정리). 올린 사람 또는 방장만 가능, 아니면 error "이 사운드를 수정할 권한이 없습니다."; 없는 sid는 "없는 소리입니다."; 아이디당 1초에 2번(초과 시 "소리를 너무 빨리 수정하고 있습니다"). `snd`(재생)는 누구나 저장된 sid를 재생 가능(그대로). `sndList`는 수정·삭제가 반영된 최신 목록이고, 삭제하면 올린 사람의 8개 제한 칸이 비어 다음 업로드 때 오래된 것이 밀려나지 않는다.

## [서버] 전체 초기화
`{t:'login', id:'초기화'}` → 그 연결에만 `{t:'resetAsk'}`(로그인/계정 생성 없음). `{t:'reset', confirm:true}`(로그인 안 한 연결, resetAsk 후 60초 안) → 모든 계정·방 삭제 후 접속 중인 모든 연결(방 안 사람, 관전자, 로그인 안 한 연결 포함)에 `{t:'resetDone'}`; 소켓은 열린 채 로그아웃 상태이고 바로 다시 로그인 가능(새 10,000칩 계정). 1분 쿨다운: error "방금 초기화했습니다. 잠시 후 다시 시도하세요". 그 외 error: "초기화 확인이 필요합니다." / "로그인 상태에서는 초기화할 수 없습니다." / 삭제 도중 로그인 시 "초기화 중입니다. 잠시 후 다시 시도하세요". `resetDone`을 받으면 클라이언트는 저장된 아이디를 지우고 로그인 화면으로 돌아갈 것.
