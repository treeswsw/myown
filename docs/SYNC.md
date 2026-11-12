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
