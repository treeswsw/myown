# 공통 방 약속 (묶음 2: 공통화 + 공통 대기실)

상태: **총괄 승인 대기.** 근거: REFACTOR-PLAN.md 1·5절, NEW-GAME.md 8절, review/2026-11-13/01~06, design/waiting-room.
줄 번호는 2026-11-13 작업 트리 기준. 이 문서가 정한 이름·시그니처를 뼈대·게임 과제가 그대로 쓴다.
판단이 갈린 곳은 **[결정]** 으로 표시하고 이유를 한 줄 붙였다.

## 0. 핵심 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | 서버는 **조합**: 공용 `RoomShell` 이 게임 객체(훅 모음)를 품는다. 상속 안 함 | 갱식마인드·갱스껄 엔진이 멤버·방장을 자기 모양으로 들고 있어(draw/room.js:148, gsk/room.js:38) 부모 클래스 필드와 겹친다. 바깥(Shell)이 사람을, 안(게임)이 규칙을 맡으면 어댑터로 맞출 수 있다 |
| D2 | **사람·방장·끊김의 주인은 Shell**. 엔진이 따로 지운 사람은 어댑터가 `ctx.drop` 으로 Shell 에 알린다 | 시계·방장 규칙이 한 곳이어야 B19 같은 어긋남이 다시 안 생긴다 |
| D3 | 게임 사실은 `shared/games.js` 하나, 서버 `server/games.js`·화면 `client/src/games.js` 는 그 키에 붙는 한 줄씩 | 이름·정원·접두사를 세 곳에 쓰지 않으면서 서버/화면 의존(엔진, import())은 각자 둔다 |
| D4 | 코인은 `server/coin/hooks.js` 의 메서드 감싸기를 없애고 게임이 판 끝에 `ctx.finish(rows)` 를 부른다 | 감싸기는 내부 메서드 이름에 기대서 빠져도 모른다(B5). CLAUDE.md 코인 구역 문장 "hooks.js 에서 감싼다"는 총괄이 고친다 |
| D5 | "결과 화면"도 대기 상태로 본다: 결과에서 바로 설정·강퇴·시작 가능. "대기실로"는 화면만 바꾼다(새 메시지 없음) | 라이어·요트·갱스껄이 이미 결과에서 시작을 받는다(liar/room.js:262, yacht:165). 메시지를 늘리지 않는다 |
| D6 | 옛 방식과 새 방식은 **등록표 칸 하나**(`legacy`)로 공존. 게임 하나씩 옮기고 마지막 청소 과제가 옛 길을 지운다 | 단계마다 `npm run check` 통과 |
| D7 | 포커는 이번에 대기실·등록표·공용 부품(채팅·매체·끊김·방장·강퇴)까지. 테이블·HUD·animator 는 그대로, main.js 의 포커 그리기만 `client/src/poker/index.js` 로 묶는다 | 3D 테이블·연출 사슬(main.js:208-219, 424-431)을 이번에 흔들면 위험 대비 얻는 것이 없다 |
| D8 | 갱식마인드 채팅은 **엔진 어댑터로 둔다**(서버 `chatOwn`, 화면은 게임 중 자기 입력칸). 대기실·최종 순위에서는 공용 채팅 칸을 쓴다 | 정답 판정·점수·정답자 글 가리기가 엔진 한 함수(shared/draw/game.js:579)에 묶여 있어 떼면 누출 위험. 대기실 채팅은 B10 해결 |

## 1. 서버 공용 방 기반 `server/room/`

### 1-1. 파일
| 파일 | 하는 일 | 지금 복사본 |
|---|---|---|
| `server/room/shell.js` | `createRoomShell(hub, code, entry, opt)`: 멤버·자리·방장·강퇴·끊김 유예·재접속·빈 방 지우기·타이머·시작·설정·상태 합치기·요청 분배 | rooms.js:44-180, liar:84-258, yacht:46-159, mini:34-113, gsk:46-135, draw:69-305 |
| `server/room/chat.js` | `createChatLog(max)`, `handleChat(shell, session, text)` (길이 → `chatCheck` → 속도 → 기록 → 방송) | rooms.js:126-131·924-934, 방 6종 chat() |
| `server/room/media.js` | 소리 3함수·이모티콘·사진·faces·heldFaces·속도 제한. 넘쳐 지울 때 `sndDel` 방송(B18) | rooms.js:96-123·903-923, 방 6종 addSound…, liar:489-515, draw:259-289 |

### 1-2. Shell 이 허브에 보이는 모양 (허브는 이것만 안다)
```js
room = {
  shell: true, code, mode, entry, impl,            // impl = 게임 객체(아래 훅). 관리자 skip 은 room.impl 을 받는다
  get hostId(), get phase(),                        // phase = impl.phase()
  members,                                          // [{id, session, connected, grace, awayUntil, joinNo}] 입장 순서
  member(id), join(session) → null|err, leave(id, reason = 'leave'|'away'|'kick'),
  setConnected(id, on), sendExtras(session), faceChanged(session, prevAvatar),
  view(id), push(events = []), sendEvents(events),
  request(session, msg) → null|err,                 // 방 안 요청 전부(아래 1-6)
  listInfo() → {code, mode, hostName, count, max, phase, ...impl.listExtra?.()},
  flush(), close(),                                 // flush = impl.flush?.(). close = 타이머 전부 해제(게임·gc·유예). 허브는 초기화가 아닐 때 flush 를 먼저 부른다
}
```

### 1-3. 게임이 받는 `ctx`
```js
ctx = {
  hub, code, mode, rng: hub.rng, now: () => hub.now(),
  members(), member(id), hostId(),
  timer(name, ms, fn), clear(name),        // hub.guard 로 감쌈. 방이 비거나 close 때 Shell 이 전부 지운다
  emit(events, to = 'all' | [ids]),        // {t:'event', e}
  push(events = []),                       // emit + 사람마다 view + roomsChanged + heldFaces 풀기
  pushTo(ids),                             // 그 사람들에게만 상태 (draw fx.room)
  sendTo(id, msg),                         // 원시 메시지 (dr_canvas_full 등)
  chatLine(item),                          // 기록 + 방송 (라이어 엔진 chat liar:347, "방장이 판을 끝냈습니다" liar:339)
  finish(rows),                            // [{id, won, opp}] → entry.coin 이 있으면 hub.award(room, entry.coin, rows)
  drop(id, reason),                        // 엔진이 사람을 지웠다 → Shell.leave(id, reason) (이미 없으면 무시)
  err(code, msg?) → {msg, code},           // msg 없으면 entry 오류표 → 공용 문구
}
```

### 1-4. 게임 훅 (게임 객체 = `entry.make(ctx, opt)` 의 반환)
| 훅 | 시그니처 → 반환 | 필수 | 실제 쓰는 곳 (지금 코드) |
|---|---|---|---|
| `view` | `(viewerId) → object` | 필수 | 6종 view. Shell 이 `code, mode, hostId, you, now, wait, specs` 를 위에 덮는다 |
| `phase` | `() → string` | 필수 | 방 목록·상태 |
| `isWaiting` | `() → bool` | 필수 | 포커 lobby / 라이어·요트·갱스껄 lobby·result / draw lobby·final / mini lobby·end |
| `onAction` | `(session, msg) → null\|err` | 필수 | liar lg(301), yacht yt(178), draw dr(326), gsk gk(151), mini request(143), 포커 act·play·liar(232·328·336) |
| `canStart` | `() → null\|{msg, code}` | 필수 | 매 push 때 `wait.why` 계산에도 씀(부작용 금지). rooms:193, liar:263-266, yacht:166, mini:125, draw·gsk 엔진 검사 |
| `onStart` | `(byId) → null\|err` | 필수 | Shell 이 방장·대기 상태·canStart 를 먼저 본다 |
| `setSettings` | `(byId, patch) → null\|err` | 설정 있을 때 | liar changeSettings(434), draw setSettings, mini `game`(146) |
| `pick` | `(id, patch) → null\|err` | 개인 칸 있을 때 | gsk pickColor(shared/gsk/game.js:103). 묶음 3: mini 베팅 |
| `waitInfo` | `() → {set, own}` | 설정 있을 때 | 대기실이 그릴 값(비밀 금지) |
| `onJoin` | `(m) → null\|err` (err면 Shell 이 입장을 되돌림) | 선택 | liar 마네킹·색(103-107), draw gJoin(235), gsk addPlayer(66) |
| `onAway` / `onBack` | `(id) → events[]` | 선택 | liar notifyEngine(233), yacht stopShake(115), draw gAway/gBack(296), gsk setConnected(108) |
| `onLeave` | `(id, reason) → events[]` (멤버가 아직 있을 때 부름) | 선택 | 포커 forceFold·settleLive(155-164) + reason 'away' 이고 차례면 autoAct(144), liar drop·flushOne(241), yacht drop·bookDrop(138), mini 기권(98), draw gLeave(303), gsk book·leave(118) |
| `onHost` | `(id) → void` | 선택 | draw `g.hostId`, gsk `s.hostId` 를 Shell 값에 맞춤 |
| `onEmpty` | `() → void` | 선택 | 포커 toLobby(171), liar game 정리(251) |
| `chatCheck` | `(session) → null\|err` | 선택 | liar chatBlocked(212) |
| `chatKind` | `(session) → string\|undefined` | 선택 | liar chatKind(214) |
| `chatOwn` | `(session, text) → null\|err` | 선택 | draw gChat(404). 있으면 Shell 은 기록·속도를 하지 않는다 |
| `chatLogFor` | `(id) → items` | chatOwn 이면 필수 | draw chatLogFor(254) |
| `mediaBlocked` | `(session, kind) → null\|err` | 선택 | liar perms(167), draw mediaCheck(412). heldFaces 판단에도 `kind='pemote'` 로 씀 |
| `extrasFor` | `(session) → events[]` | 선택 | draw drSync(256) |
| `flush` | `() → void` | 선택 | liar 점수 넘기기(518) |
| `listExtra` | `() → object` | 선택 | mini `{game}`(rooms.js:538) |

오류 `err` 는 언제나 `{msg, code}`. 문자열을 돌려주던 옛 코드는 어댑터가 `ctx.err(code, 문자열)` 로 감싼다.

### 1-5. Shell 의 흐름 (훅 부르는 순서)
- **join**: 정원(`entry.max`, 넘으면 `{msg:'방이 가득 찼습니다.', code:'<p>full'}`) → gc 해제 → 멤버 추가·`hostId ??=` → `onJoin(m)`(err면 되돌림) → `push()` → 남들에게 faces → `joined` 방송 → `sendExtras`.
- **setConnected**: 바뀌었을 때만 `away/back` 방송 + `onAway/onBack` 이벤트. 끊기면 `awayUntil = now + hub.timing.grace`, 타이머 끝에 `leave(id,'away')`. 다시 붙으면 해제. `push(events)`.
- **leave**: 유예 해제 → `onLeave(id, reason)` → 멤버 빼기 → 방장이면 **연결된 사람 중 먼저 온 사람, 없으면 맨 앞** → `onHost` → 나간 사람에게 `room:null`·me·rooms, 세션 정리 → 비었으면 `onEmpty` + 타이머 전부 해제 + gc → 아니면 `left` 방송 + `push(events)`.
- **kick(by, id)**: 방장·`isWaiting()`·자기 아님·멤버 → 대상에게 `{t:'error', msg:'방장이 내보냈습니다.', code:'<접두사>kicked'}` → `leave(id,'kick')`.
- **start(by)**: 방장(`<p>host`) → `isWaiting()`(`<p>now`) → `canStart()` → `onStart(by)` → 성공이면 Shell 이 `push()`.
- **set/pick**: set 은 방장+대기, pick 은 본인+대기. 그다음 `setSettings/pick` → 성공이면 `push()`.
- **view(id)**: `{...impl.view(id), code, mode, hostId, you:id, now, wait, specs:[]}`,
  `wait = isWaiting() ? {can: !why, why, ...(waitInfo?.() ?? {set:{}, own:{}})} : null` (why = canStart()).
- **sendExtras**: chatLog(`chatLogFor?.(id)` 우선) → faces(전원) → sndList(있으면) → `extrasFor?.(session)`.
- 공용 이벤트 `joined·left·away·back` 은 Shell 만 보낸다. 엔진 fx 에 같은 종류가 있으면 어댑터가 버린다(draw 엔진 join/back/away/leave 가 냄).

### 1-6. `request(session, msg)` 분배 (rooms.js:874-934 대체)
| msg.t | 처리 |
|---|---|
| `leave` / `start` / `kick` / `set` / `pick` | Shell |
| `chat` | `chatOwn` 있으면 그것, 아니면 chat.js: 길이(`entry.chat.maxLen`) → `chatCheck` → 속도(1초 1개·10초 5개, session.chatTimes 그대로) → 기록(`entry.chat.log`) |
| `emote` `pemote` `snd` `sndAdd` `sndDel` `sndRename` | media.js. 먼저 `mediaBlocked(session, t)` (지금 MEDIA 집합 rooms.js:30 + `sndDel` 는 막지 않음 그대로) |
| `entry.msgs` 에 든 것 | `impl.onAction(session, msg)` |
| 다른 게임의 `msgs` | 포커 글자(`act play liar mode`) → `{msg:'지금은 할 수 없습니다.', code:'<p>now'}`, 봉투(`lg yt dr gk mn`) → `{msg:'알 수 없는 요청입니다.', code:'<p>bad'}` (지금 문구 유지) |

### 1-7. 갱식마인드 어댑터 (`server/draw/room.js` → `makeDrawGame(ctx)`)
- 엔진 상태 `g`·그림 `drawing`·`picker` 는 어댑터가 그대로 든다. 모든 훅을 지금의 `run(fn)`(tick 먼저, 끝나면 arm, draw:87) 으로 감싼다. 타이머는 `ctx.timer('game')`.
- `onJoin(m)`: 첫 사람이면 `createRoom({host:m})`, 아니면 `gJoin` (실패면 err 반환 → Shell 이 되돌림).
- `apply(fx)`: `fx.events` → `ctx.emit([e], to)` (공용 4종 제외), `fx.room` → `ctx.pushTo(ids)`, `fx.kicked` 무시(Shell 이 함), `fx.finished?.save` → 전적 저장 + `ctx.finish(rows)`(reason 'alone' 이면 안 줌, 시작할 때 `onStart` 에서 적어 둔 참가자만 — hooks.js:52-79 를 옮김).
  끝에 **맞추기**: `ctx.members()` 중 `g.players` 에 없는 사람 → `ctx.drop(id,'away')` (엔진 seatKeep 60초가 Shell 유예보다 먼저 끝난 경우).
- `onLeave(id)`: `gLeave` 결과가 `dr_bad`(이미 엔진에 없음)면 무시. `onHost(id)`: `g.hostId = id`. `kick` 은 Shell 몫(엔진 `gKick` 안 씀, 결과는 같은 `gLeave` 길).
- 채팅·매체: `chatOwn`=gChat, `chatLogFor`=chatLogFor, `mediaBlocked`=mediaCheck(emote→'basic'), `extrasFor`=drSync. 그리는 사람 끊김 15초는 엔진 그대로(예외 표).
- **[결정]** 엔진의 seatKeep 은 바꾸지 않는다(shared/draw 무수정). 두 시계가 같은 60초라 먼저 온 쪽이 같은 `Shell.leave` 로 간다.
- 갱스껄도 같은 방식: `s.members` 는 엔진 것, `onJoin`=addPlayer, `onAway/onBack`=엔진 setConnected, gsk/room.js:196-212 의 "끊긴 사람 빼기"(waiting·deadline)는 지우고 Shell 유예가 한다. `ctx.timer('dl')` 은 `nextDeadline` 만.

## 2. 게임 등록표

### 2-1. `shared/games.js` (서버·화면·시험이 같이 읽는 사실. DOM·node 없음)
```js
// 한 게임 = 한 줄. 빠진 칸이 있으면 test/common/games.test.js 가 실패한다(null/false/[] 는 "없음"을 적은 것).
export const GAMES = {
  holdem: { name:'텍사스 홀덤', desc:'2~6명 · 블라인드 50/100', about:'…', min:2, max:6, flag:null,  msgs:['act'],         err:'pk_', css:null,  coin:null,    chat:{maxLen:120, log:30}, settings:[], own:[] },
  bluff:  { name:'블러핑 카드', desc:'2~4명 · 리볼버 벌칙',     about:'…', min:2, max:4, flag:null,  msgs:['play','liar'], err:'pk_', css:null,  coin:'bluff', chat:{maxLen:120, log:30}, settings:[], own:[] },
  liar:   { name:'라이어게임', …, min:3, max:8, flag:'liar',  msgs:['lg'], err:'lg_', css:'lg-', coin:'liar',  chat:{maxLen:80, log:50}, settings:LIAR_SET, own:[] },
  yacht:  { name:'요트다이스', …, min:2, max:4, flag:'yacht', msgs:['yt'], err:'yt_', css:'yt-', coin:'yacht', chat:{maxLen:120, log:30}, settings:[], own:[] },
  draw:   { name:DRAW_NAME,   …, min:2, max:8, flag:'draw',  msgs:['dr'], err:'dr_', css:'dr-', coin:'draw',  chat:null /* chatOwn */, settings:DRAW_SET, own:[],
            fast:{ limit:100, ops:['st','pt','cx','rm','undo','redo','clear'] } },
  gsk:    { name:GSK_NAME,    …, min:3, max:6, flag:'gsk',   msgs:['gk'], err:'gk_', css:'gk-', coin:null /* 묶음 3 */, chat:{maxLen:120, log:30}, settings:[], own:GSK_OWN },
  mini:   { name:'미니게임',   …, min:2, max:8, flag:'mini',  msgs:['mn'], err:'mn_', css:'mn-', coin:'mini',  chat:{maxLen:120, log:30}, settings:MINI_SET, own:[] },
};
```
- `desc`·`max` 는 lobby.js:23-31 의 MODES 값 그대로. `about` 은 대기실 왼쪽 설명(시안의 desc 글).
- 설정 스키마는 `shared/<모드>/settings.js` 가 내보낸다(포커·요트는 빈 배열). 모양은 4-3.

### 2-2. `server/games.js`
```js
export const SERVER_GAMES = {
  holdem: { make: makePoker('holdem'), bot: holdemBot },   // 이행 중에는 make 대신 legacy: (hub, code, opt) => 옛 방
  bluff:  { make: makePoker('bluff'),  bot: bluffBot },
  liar:   { make: makeLiarGame, bot: liarBot, hubMsg: liarRank },  // hubMsg = {t:'lg',a:'rank'} (rooms.js:800-810) 를 방 밖에서 답함
  yacht:  { make: makeYachtGame, bot: yachtBot },
  draw:   { make: makeDrawGame, bot: drawBot },
  gsk:    { make: makeGskGame, bot: false },               // 묶음 3 에서 봇
  mini:   { make: makeMiniGame, bot: false },
};
```
`bot: false` 인 방에서 `adm bot+` 는 `adm_nobot` 로 거절(B9). 선택 칸 `errors: {코드: 문구}` = entry 오류표(`ctx.err`·`<p>off` 문구가 공용 문구보다 먼저 본다, 예: gsk `gk_off`). `server/admin/games/index.js:8` 의 games 표는 이 칸에서 만든다.

### 2-3. 이 표로 대체되는 곳
| 파일:줄 | 지금 | 바뀐 뒤 |
|---|---|---|
| rooms.js:5-9 | 방 팩토리 import 5개 | `import { SERVER_GAMES } from './games.js'` |
| rooms.js:29 | MAX_PLAYERS 표 | `GAMES[mode].max` |
| rooms.js:36-37, 640-647 | DR 전용 속도 | `GAMES[*].fast` 를 돌며 접두사 `{"t":"<msgs[0]>"` 검사 |
| rooms.js:495, 511-515 | 인자 liar…mini, hub 필드 5개 | `hub.flags[mode] = opts[flag] ?? 'off'` (인자 이름은 그대로 받아 시험·index.js 호환) |
| rooms.js:531 | sendMe 의 liar…mini | flag 있는 항목을 돌며 같은 키로 |
| rooms.js:535-539 | roomList 의 max·mini game | `r.listInfo()` |
| rooms.js:590-602 | close 의 flush·타이머 | `room.close()` |
| rooms.js:795-798 | draw·gsk 의 남의 요청 거절 | Shell 1-6 |
| rooms.js:800-810 | 라이어 랭킹 | `SERVER_GAMES[*].hubMsg` |
| rooms.js:822-862 | create 분기 6개 + hookRoom | `entry = SERVER_GAMES[msg.mode]` → flag off 면 `{msg:'<이름>은(는) 아직 열리지 않았습니다.', code:'<p>off'}` → `createRoomShell` |
| rooms.js:876-934 | MEDIA·봉투·포커·채팅 분기 | `room.shell ? room.request(session, msg) : 옛 분기` |
| rooms.js:44-492 | 포커 Room 클래스 | `server/poker/room.js` 의 `makePoker(mode)` (포커 과제) |
| protocol.js:22, 151-155 | MODES, 봉투 목록 | `Object.keys(GAMES)`, 모든 `msgs` |
| coin/hooks.js 전체 | 메서드 감싸기 | `ctx.finish(rows)` (청소 과제에서 파일 삭제) |

### 2-4. "빠진 칸이면 실패" 검사 `test/common/games.test.js` (뼈대 S1)
- 세 표(shared·server·client)의 키가 같다. `test/common/rooms.test.js` 의 MODES 가 모든 키를 덮는다.
- shared 칸이 전부 있고 타입이 맞다(`undefined` 금지. 없음은 `null`/`false`/`[]`). `err` 은 `_` 로 끝나고 서로 다름(포커 둘은 `pk_` 공유 허용), `msgs` 는 게임 사이에 겹치지 않음, `css` 는 서로 접두사가 아님.
- `coin` 이 null 이 아니면 `COIN_RULES` 에 있고, `COIN_RULES` 의 키는 모두 어떤 게임의 `coin`.
- 서버 항목은 `make` 와 `legacy` 중 정확히 하나. `bot` 은 `false` 또는 `{createBrain, skip}`.
- settings·own 의 각 칸은 4-3 모양. 서버에 `set`/`pick` 으로 기본값을 보내면 거절되지 않는다(게임별 한 번 실제 허브로).
- `test/css.test.js` 의 접두사 목록을 `GAMES[*].css` 에서 읽는다.

## 3. 통신 변경 (SPEC 7절에 7-3 으로 그대로)

### 7-3. 공통 방 (2026-11-13, 묶음 2)
접두사 `<p>` = 그 게임의 오류 코드 앞 글자(`pk_ lg_ yt_ dr_ gk_ mn_`). 모든 방 오류는 `{t:'error', msg, code}`.

화면 → 서버
| t | 필드 | 누가·언제 | 오류 code |
|---|---|---|---|
| `create` | `mode`, `game?` | 로비 | `<p>off` |
| `start` | | 방장, `wait≠null` | `<p>host`, `<p>now`, canStart 의 코드 |
| `set` | `patch: {키: 값}` (스키마 키, 중첩은 객체 그대로 예: `{times:{speak:30}}`) | 방장, `wait≠null` | `<p>host`, `<p>now`, 게임 검사 코드 |
| `pick` | `patch: {키: 값}` (개인 칸: 갱스껄 `color`) | 본인, `wait≠null` | `<p>now`, 게임 검사 코드 |
| `kick` | `id` | 방장, `wait≠null`, 자기 아님 | `<p>host`, `<p>now`, `<p>bad` |
| `leave` `chat` `emote` `pemote` `snd*` | 그대로 | | |
| ~~`mode`~~ | | **없어짐**(방 안 홀덤↔블러핑 전환) | 한 배포 동안 받아서 `{msg:'방을 새로 만들어 주세요.', code:'pk_mode'}`, 묶음 3 청소 때 protocol 에서 삭제 |

서버 → 화면
- `room.state` 공통 칸(모든 게임, 게임 칸은 그 아래에 그대로):
```js
{ code, mode, hostId, you, now, phase,
  players: [{ id, name, connected, awayUntil, spectating, ...게임 칸 }],   // 사진 없음(포커는 이행 기간 avatar 유지, S3 때 뺌)
  wait: null | { can, why: null | {msg, code}, set: {...방 설정}, own: { [id]: {...개인 칸} } },  // 대기·결과 동안만
  specs: [] }                                   // 관전 계정 자리(묶음 3). 지금은 늘 빈 배열
```
- 강퇴된 사람: `{t:'error', msg:'방장이 내보냈습니다.', code:'<p>kicked'}` 다음 `room:null`.
- `event.e`: `joined{id,name}` `left{id,name}` `away{id}` `back{id}` 를 **모든 게임**이 보낸다(포커 새로). `faces.items[]` 에 `look`(장착 아이템 `{title?, frame?, color?, …}`, 상점의 `g.equip` 그대로) 추가.
- 판 끝 코인 알림은 기존 `{t:'coin', a:'got', n, mode, win}`(22-10) 그대로. 이제 `ctx.finish` 한 길이라 코인 규칙이 있는 모든 게임에서 온다.
- `sndAdd` 로 방 소리가 넘쳐 지워지면 지워진 것마다 `sndDel{sid}` 가 뒤따른다.

호환·이행
- 옛 전용 요청은 그대로 받는다(같은 함수로 감): `lg settings/kick`, `dr settings/kick/lobby`, `gk color`, `mn game/again/start`. 화면이 새 메시지로 다 옮긴 뒤 묶음 3 청소에서 지운다.
- 옛 상태 칸(라이어 `settings`, 갱식마인드 `settings` 등)도 그대로 둔다. `wait.set` 은 대기실용 사본이다.
- 옮기기 전 게임은 옛 모양 그대로(공통 칸 없음). 화면 틀은 `client/src/games.js` 의 `mount` 가 있는 게임만 새 길로 그린다.

## 4. 화면 공통 방 틀 `client/src/room/`

### 4-1. 파일과 CSS 접두사
| 파일 | 하는 일 | CSS |
|---|---|---|
| `client/src/games.js` | `CLIENT_GAMES[mode] = { load: () => import('./<m>/index.js'), stage: bool, mount: bool, bar?: {leftVar} }`, 포커 `{ builtin:'poker', stage:true, mount:false }`. **`mount: true` 인 게임만 새 길**(옮기는 과제가 자기 줄을 true 로). `isFramed(mode)`, `visibleModes(me, search)` | |
| `room/frame.js` | `createRoomFrame(deps) → { apply(state\|null) → bool, event(e) → bool, error(err) → bool, frame(dt), current(), anchorOf(id), chatMsg(text) → msg, enqueue(fn) }` (C1 추가: anchorOf = 대기실이면 참가자 사진 위·게임이면 게임 anchorOf, chatMsg = chatRule.route, enqueue = 옛 liarQ). 불러오기 줄 하나(liarQ 대체), mount/unmount, 대기실↔게임 전환, 공용 이벤트 처리 | `.rm-` |
| `room/wait.js` | 공통 대기실(시안 3칸). `createWait(deps) → { el, update(state, schema, parts), anchorOf(id), dispose() }` + 순수 함수 `waitModel(state, entry, meId)` (시험용) | `.wr-` (`.lb-panel/.lb-group/.lb-seg-item/.lb-btn` 은 쓰기만) |
| `room/bar.js` | 게임 중 상단 줄: 방 코드·소리·이모티콘·나가기. 이모티콘 창 열고 닫기·바깥 누름 닫기 한 번(main.js:159-206 대체) | `.rm-bar` |
| `room/faces.js` | `createFaces() → { apply(e), get(id) → {avatar, look}, drop(id), clear(), onChange(fn) → off }` | |
| `room/float.js` | 머리 위 기본 이모티콘(요트 yt-em 방식 2초) — 사진·사운드 이름표는 emotePanel 그대로, 자리는 모두 `anchorOf` | `.rm-em` |
| `ui/kit/modal.js` | `openModal({label, content, buttons, onClose})`, `confirmBox({title, text, ok, cancel, danger}) → Promise<bool>` | `.ui-` |
| `ui/kit/toast.js` | `toast(text, {kind, ms, key})` 최대 3개 쌓기 (main.js:144 대체) | `.ui-` |
| `ui/kit/avatar.js` | `playerAvatar({id, name, face, look, color, size}) → el`, `nameTag({name, look}) → el`. 칭호·테두리·글자 색은 `coin/look.js` 의 `decorate/titleBadge/nameColor` 만 부른다 → **상점 개편 때 look.js 한 곳만 고치면 모든 게임 반영** | `.ui-` |
| `sound/core.js` | AudioContext 1개, master gain, `isMuted/setMuted/onMute`(저장 키 `gk.muted` 유지), iPad 잠금 해제(media.js 방식), `tone/noise/playBuffer`. audio.js·media.js 는 이것을 쓴다(B22) | |

### 4-2. mount 계약 (각 `client/src/<m>/index.js` 가 `export function mount(ctx)`)
```js
ctx = {
  root,            // 이 게임 판 자리(.rm-game, #ui 안). unmount 뒤 Shell 이 비운다
  ui, stage,       // stage 는 entry.stage 일 때만, 아니면 null (stage.use 는 하나: 틀이 줄을 세운다)
  send(msg), me() /* state.me */, faces, clock /* {sync(now), now(), left(endsAt)} */,
  sound,           // sound/core.js
  toast, confirm, modal, profile /* ui/kit/avatar.js */,
  openEmote(), leave() /* 확인 창 포함 */, toWait() /* 결과 화면의 "대기실로" */,
}
return {
  room(state),                 // 상태가 올 때마다(대기 중에도. 게임은 자기 대기 화면을 그리지 않는다)
  event(e),                    // 공용이 다 쓰지 않은 이벤트 + 넘겨주는 공용 이벤트(아래)
  error?(err),                 // 이 게임 접두사 오류. 알림(toast)은 틀이 한 번만 띄운다(B6)
  anchorOf(id) → {x, y} | null,// 말풍선·이모티콘·이름표 자리
  frame?(dt),                  // 초 단위
  chatRule?: { maxLen, lock(state) → {locked, hint, hot}, route(text) → msg, bubble(e) → bool, own(state) → bool },
  waitPart?(name) → { el, update(state), dispose() },  // 대기실 커스텀 칸
  leaveNote?(state) → string | null,                    // 게임 중 나가기 확인 창 글("나가면 기권이 됩니다" 등)
  showEmote?(id, i) → bool,    // 스스로 그리면 true (포커 pins.emote)
  unmount(),                   // 리스너·타이머·3D·소리 전부. 방을 나가면 반드시 불리고, 다시 들어오면 새 mount
}
```
- 틀이 먼저 처리하는 이벤트: `emote pemote snd sndAdd sndList sndDel sndRename`(게임에 안 넘김), `faces chat chatLog joined left away back`(처리하고 게임에도 넘김). `joined/left` 는 채팅에 시스템 줄("○○ 님이 들어왔어요").
- 화면 전환: `state.wait && (state.phase === 'lobby' || toWait 를 눌렀음)` 이면 대기실, 아니면 게임 판 + 상단 줄. 새 판이 시작되면(phase 가 대기에서 벗어남) toWait 표시를 지운다.
- 불러오기 실패: `staleReload`(main.js:151) 를 틀이 쓴다(B15). 게임이 바뀌면 `await current.unmount()` 뒤 새 mount(B16·S6).
- 소리 버튼: 대기실 머리줄·상단 줄 모두 `sound.setMuted`. 게임 audio.js 는 core 위에서 소리 표만(B20).

### 4-3. 설정 스키마 (`shared/<모드>/settings.js` 의 `SETTINGS`·`OWN` 배열)
```js
{ k: 'liarMode', label: '라이어 방식', group: '규칙', type: 'seg', opts: [['word','다른 제시어'], ['notice','라이어 알림']] }
{ k: 'times.speak', label: '첫 설명', group: '시간', type: 'seg', opts: [[20,'20초'], [30,'30초'], …] }   // k 의 점 = 중첩. set 을 보낼 때 {times:{speak:30}}
{ k: 'topics', label: '주제', group: '규칙', type: 'multi', opts: (set) => …, get: (set) => 고른 이름들 }   // 보낼 값은 고른 이름 배열. 라이어 어댑터가 [{name,on}] 로 바꾼다
{ k: 'nextTopic', label: '이번 주제', type: 'seg', when: (set) => set.topicMode === 'host', opts: (set) => … }
{ k: 'color', label: '내 색 고르기', type: 'custom', part: 'gk-color' }   // OWN 쪽. waitPart('gk-color') 가 그린다
{ type: 'info', rows: [['인원','3~6명'], …] }                             // 읽기 전용 줄
```
- 종류는 `seg`·`multi`·`info`·`custom` 넷뿐. 값은 `wait.set`(OWN 은 `wait.own[me]`). 방장이 아니면 읽기 전용 + "방장만 바꿀 수 있어요"(OWN 은 누구나 자기 것).
- 갱스껄 색 고르기 = `custom` + 게임 `waitPart('gk-color')` (gsk/ui/wait.js 를 줄여 옮김). 미니 종목 = `seg`(host). 미니 베팅은 묶음 3 에서 `custom 'mn-bet'`.
- 가운데 칸: 참가자(`profile.playerAvatar` + 칭호 + `p.color` 점 + 태그 방장·나·연결 끊김), 방장에게만 줄 끝 × → `{t:'kick', id}`, 관전 줄(`specs`), `wait.why.msg`, "게임 시작"(`lb-btn lb-primary`, `!wait.can` 이면 꺼짐) → `{t:'start'}`, 비방장은 "방장이 시작하기를 기다리는 중", 나가기(대기실은 확인 없이 바로).
- 오른쪽 칸: 공용 채팅을 `chat.setMode('wait')` 로 이 칸에 넣는다. 이모티콘 버튼은 입력 줄 왼쪽.

### 4-4. 채팅 규칙 훅 (화면 `ui/chat.js` 에 `setRule(rule|null)` 추가. C1: chat.setRule 은 maxLen 만 받고 lock·route·bubble·own 은 frame 이 부른다. own 이면 `setMode('own')`(입력 숨김·기록 계속), 대기실은 `setMode('wait')` + `chat.waitEl`, 시스템 줄 `chat.system(text)`)
| 게임 | rule | 근거 |
|---|---|---|
| 라이어 | `maxLen 80`, `lock` = chatLockFor, `route` = chatMsgFor(say/chat), `bubble` = kind 가 say·plea 면 false | liar/index.js:179·213, main.js:85·556 |
| 갱식마인드 | `maxLen 40`, `own(state)` = 대기·최종이 아니면 true(그동안 사이트 입력칸 숨김, 기록은 계속 받음) | B10·B12, D8 |
| 나머지 | 없음(120자, 말풍선) | |

### 4-5. main.js 에서 없어지는 것 / 남는 것
| 없어짐 (→ 어디로) | 줄 |
|---|---|
| 게임별 불러오기·큐·in*()·anchorOf 사슬 (→ frame) | 33-59 |
| `.lgbar/.gkbar/.ytbar` 와 이모티콘 창 토글 (→ room/bar.js) | 159-206 |
| `liarShown…gskShown`, applyDraw/Gsk/Liar/Yacht/MiniRoom, 퇴장 블록 5개 (→ frame) | 225-393 |
| `lobby.setLiar…setMini` (→ `lobby.setFlags(me)`, games.js 를 돈다) | 457-461 |
| 모드 OR 조건 2줄 (→ `frame.apply`) | 470-471 |
| 모드별 event 분기 5벌 (→ `frame.event(e)`) | 497-560 |
| dr_/gk_/모드별 오류 분기 (→ `frame.error(err)`) | 601-610 |
| `liar?.frame…mini?.frame` (→ `frame.frame(dt)`) | 617 |
| 포커 그리기 applyRoom 본문·animator 연결 (→ `client/src/poker/index.js` `mountPoker(deps)`, 포커 과제) | 394-431 |

**남는 것**: 로그인·PIN·초기화·관리자·코인 연결(91-142, 446-492, 573-599), 3D 무대·테이블·핀·HUD·연출 객체 생성(31, 61-90, 208-219), `connect`(616-636), lgRank 분기(493-496, `frame.current()` 로 바꿈).
lobby.js: 23-34(MODES·keysFor → shared/games.js), 297·305(목록 거르기), 453-495(setLiar…) → 뼈대 C1. 322-361(포커 대기 화면) → 포커 과제가 지움.

## 5. 이행 순서와 과제

### 5-1. 순서
```
0 총괄: 이 문서 승인, SPEC 7-3 붙이기, CLAUDE.md 코인 구역 문장(D4)·구역 지도에 server/room·client/src/room 추가
1 S1(서버 뼈대, Opus) ─┐ 병렬 (계약이 이 문서로 고정)
1 C1(화면 뼈대, Opus) ─┘
2 G-yacht (시범, Sonnet. 막히면 Opus) — 두 뼈대를 실제로 처음 쓰는 과제. 끝나면 뼈대 계약 수정이 있으면 여기서
3 G-poker / G-liar / G-draw / G-gsk / G-mini (Sonnet 병렬)
4 X 청소(Opus): legacy 길·hooks.js·옛 상단 줄 CSS·main.js/rooms.js 죽은 분기 삭제 → Opus 검토 → npm test → 배포 2
```
각 단계 끝 `npm run check` 통과. 서버를 고친 단계(S1, G-*, X)는 합칠 때 `npm test` 도.

### 5-2. 뼈대 과제
| 과제 | 만드는 파일 | 고치는 공용 파일 | 완료 조건 |
|---|---|---|---|
| **S1 서버 뼈대** | shared/games.js(+ shared/{liar,draw,mini,gsk}/settings.js 는 빈 배열로 자리만), server/games.js(전부 `legacy`), server/room/{shell,chat,media}.js, test/lib/dummyGame.js(훅 전부 쓰는 가짜 게임), test/room/shell.test.js, test/common/games.test.js | rooms.js(2-3 표의 줄: create·dispatch·flags·roomList·close, `room.shell ?` 갈림), protocol.js(MODES·봉투·`set/pick/kick`), server/admin/games/index.js·bots.js:114(`room.impl ?? room`, `adm_nobot`), test/css.test.js(접두사를 표에서), package.json(test 목록에 test/room) | 가짜 게임으로 1-5 의 흐름(입장 되돌리기, 방장→연결된 사람, 유예, 강퇴, set/pick, wait.why, chatOwn, mediaBlocked·heldFaces, sndDel 넘침, finish→award 한 번) 시험 통과. 옛 게임 동작·기존 시험 무변경 |
| **C1 화면 뼈대** | client/src/games.js(전부 mount 없음 → 옛 길), room/{frame,wait,bar,faces,float}.js + room.css, ui/kit/{modal,toast,avatar}.js, sound/core.js, test/ui 순수 함수 시험(waitModel·스키마 4종 그리기) | main.js(frame 연결: `CLIENT_GAMES[mode].mount` 있으면 frame, 아니면 옛 applyXRoom), lobby.js(games.js 로 목록·`setFlags`), ui/chat.js(`setRule`, `'wait'` 배치), ui/emotePanel.js(getAnchor 를 frame 으로), audio.js·media.js(core 위로) | check 통과, 옛 화면 그대로(스모크 무변경). 새 길은 G-yacht 가 첫 실사용 |

### 5-3. 게임별 옮기기 과제 (Sonnet 병렬, 서로 겹치지 않음)
공통 규칙: **main.js·rooms.js·style.css·lobby.js·index.html 은 고치지 않는다(포커 과제만 예외, 아래).** 등록표 두 줄(server/games.js·client/src/games.js 의 자기 줄: `legacy` → `make`, `mount` 추가)과 test/common/rooms.test.js 의 자기 MODES 줄, test/ui/smoke.mjs 의 자기 덩어리만 고친다. 이웃 줄이라 병합 충돌이 나면 총괄이 합치며 그 줄만 손으로 맞춘다. 옛 게임 전용 화면(대기 화면·상단 줄 의존)은 그 게임 폴더 안에서 지운다.

| 과제 | 고칠 수 있는 파일 | 완료 조건(추가 시험) |
|---|---|---|
| **G-yacht** | server/yacht/room.js, server/admin/games/yacht.js, client/src/yacht/**(index.js·yacht.css 포함), test/yacht/**, test/yacht-seam.test.js 1-91줄, test/ui/yacht-round.mjs | 결과→대기실→재시작, 강퇴, 나가기 확인(기권 안내), 상단 줄 왼쪽 = `--yt-sheet-w`, 기존 yacht leaks·e2e 통과 |
| **G-liar** | server/liar/**, shared/liar/settings.js(+엔진 무수정), server/admin/games/liar.js, client/src/liar/**(ui/settings.js 는 스키마로 대체 후 삭제, audio.js → core), test/liar/**, test/liar-seam.test.js, test/ui/liar-round.mjs | test/liar/leaks.test.js 무변경 통과(`wait.set` 에 비밀 없음), 채팅 잠금·80자 화면/서버 일치(B11), 소리 끄기 따름(B20), 3D 정리(B16) |
| **G-draw** | server/draw/room.js(1-7 어댑터), shared/draw/settings.js, server/admin/games/draw.js, client/src/draw/**(≡ 메뉴 삭제 → 공용 상단 줄 [결정: 휴대폰은 신경 쓰지 않음], 설정 화면 → 스키마, audio → core), test/draw/**, test/ui/draw-round.mjs | test/draw/leaks.test.js 무변경 통과, 대기·최종 순위 채팅(B10), 41자↑ 안내(B12), 기본 이모티콘 보임(B1·B2), 그리는 사람 끊김 15초 유지 |
| **G-gsk** | server/gsk/room.js, shared/gsk/settings.js(OWN color), client/src/gsk/**(ui/wait.js → `waitPart('gk-color')` 로 축소, 자체 시작 버튼 삭제 B8, 배율 B21), test/gsk/**, test/gsk-seam.test.js, test/ui/gsk-round.mjs | test/gsk/leaks.test.js 통과, 색 고르기 `pick`, 공개 연출 중 이모티콘 보임, `coin:null` 유지(묶음 3) |
| **G-mini** | server/mini/room.js, shared/mini/settings.js(game seg), client/src/mini/**, test/mini/** | `{t:'start'}` 도 코드 포함(`mn_need2`·`mn_host`), 결과(end)→대기실→시작, 종목 고르기 = `set` |
| **G-poker** | rooms.js:44-492 → server/poker/room.js(`makePoker(mode)`), server/admin/games/{holdem,bluff}.js, client/src/poker/index.js(새, main.js 394-431 옮김), **main.js 포커 부분, lobby.js 322-361·onMode 삭제**, test/rooms.test.js·bluff.test.js·holdem.test.js·media.test.js·roomlist.test.js·chat.test.js 의 포커 기대값, test/yacht-seam.test.js 93-108(`mode` 거절), smoke 포커 덩어리 | 포커 대기 = 공통 대기실(설정 없음, 시작 조건 "칩이 있는 사람 2명"), 블러핑 회색(B14) 무변경, 테이블·HUD·연출 그대로, `mode` 는 `pk_mode` 로 거절. 다른 게임 과제보다 main.js 를 먼저 만지므로 **G-yacht 다음, 다른 G-* 와 병렬이되 main.js 는 이 과제만** |

### 5-4. `test/common/rooms.test.js` 기대값 중 이번에 바뀌는 것
| 칸 | 지금 → 바뀐 뒤 | 게임 (바꾸는 과제) |
|---|---|---|
| `hostWhenNextAway` | `'bob1'` → `'cat1'` | holdem·bluff(G-poker), liar, yacht, mini |
| `leftEvent` / `awayEvents` / `faces` | `false` → `true` | holdem·bluff (G-poker) |
| `startFew` / `startNonHost` | `'2명이 필요합니다.'`·HOST_ERR → `'mn_need2'`·`'mn_host'` | mini |
| 라이어 `chatMax: 80` 의 "통일 예정?" 주석 | 주석만 지움(예외 확정, NEW-GAME 4절) | liar |
| 새 칸(S1 이 추가, `legacy` 아닌 모드만 돈다) | 강퇴, `set` 기본값 통과, 결과 뒤 대기실 시작, `wait.why` 모양 | 옮긴 게임 전부 자동 |

### 5-5. 위험한 지점과 피하는 법
| 위험 | 피하는 법 |
|---|---|
| 갱식마인드·갱스껄: Shell 과 엔진이 같은 사람을 따로 지워 어긋남(유령 멤버, 방장 불일치) | Shell 이 주인(D2). 어댑터는 apply 끝마다 맞추기 + `onHost` 로 엔진 방장 덮기. 끊김·강퇴·그리는 사람 나감을 test/common 표에 그대로 둔다 |
| 코인 두 번/0번: 옮긴 방에 hookRoom 이 또 붙거나 finish 를 두 번 부름 | Shell 방에는 hookRoom 을 부르지 않는다(rooms.js create 갈림에서). `ctx.finish` 는 판마다 한 번만 받는다(같은 판 두 번째는 무시 + console.error). test/coin 이 옮긴 게임마다 한 번 지급 확인 |
| 새 공통 칸으로 비밀이 샘(`wait`, `faces.look`, 강퇴 오류) | Shell 은 게임 내부를 읽지 않고 `waitInfo` 반환만 싣는다. leaks 시험 3개(liar·draw·gsk)를 각 과제 완료 조건에 넣음. heldFaces 는 공용으로 계속(B4) |
| stage 하나를 라이어·요트가 나눠 씀, 빠른 나가기/들어오기에서 3D 가 남음 | frame 의 불러오기 줄 하나 + 다음 mount 전에 반드시 `await unmount()`. 옮기는 동안 옛 길 게임도 같은 줄(liarQ)을 쓰게 C1 이 묶는다 |
| 옛 길·새 길 공존이 길어져 두 벌 유지 | 갈림은 rooms.js `room.shell`, main.js `CLIENT_GAMES[mode].mount` 각 한 곳. 모든 G-* 가 끝나면 X 가 즉시 지운다 |

## 6. 묶음 3 을 위한 자리 (지금 만들지 않는다)
| 기능 | 끼우는 곳 |
|---|---|
| 관전 계정(관전N) | Shell.join: 이름이 `/^관전\d+$/` 면 `specs`(최대 4, 정원 밖)로만 넣고 게임 `onJoin` 안 부름. `view(id)` 는 참가자 아닌 id 에 비밀 없는 시점을 이미 준다(누출 시험에 관전 칸 추가). 채팅은 `chatCheck` 가 `spectating` 으로 판단 |
| 미니 승부·종목 방식, 오목 규칙 | shared/mini/settings.js 에 `seg/multi` 줄 추가 + 어댑터 `setSettings/onStart` |
| 미니 코인 베팅 | `OWN` 에 `{k:'bet', type:'custom', part:'mn-bet'}`, `pick({bet})`, `canStart` 가 "건 수가 다름" 이유. 코인 이동은 server/coin 에 `hub.stake(room, rows)`·`hub.settleStake(room, winnerId\|null)` 를 두고 미니 `onStart`·`onLeave`·판 끝에서 부른다 |
| 라이어 규칙 변경(투표 계속, 첫 발언 다시 보기, 설명 바퀴 1~3) | 엔진 shared/liar + settings.js 에 `rounds` seg 한 줄 |
| 관리자 경제 설정(게임별 코인, 시세) | wallet `hub.award` 가 `COIN_RULES` 대신 `hub.coinRules()`(DB 설정, 없으면 COIN_RULES) 를 읽는다. 등록표 `coin` 키는 그대로 |
| 갱스껄 코인 | `shared/games.js` gsk `coin:'gsk'` + COIN_RULES.gsk + 어댑터 판 끝 `ctx.finish` |
| 갱스껄·미니 봇 | server/admin/games/{gsk,mini}.js(합법 수 중 무작위) + server/games.js 의 `bot:false` → 모듈 |
