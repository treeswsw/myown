# 새 게임 추가 지침

상태: **확정(2026-11-13, 묶음 2 청소 X).** 모든 게임(홀덤·블러핑·라이어·요트·갱식마인드·갱스껄·미니)이 이 방식으로 돌아간다.
약속의 자세한 모양(훅 표, ctx, 통신)은 docs/COMMON-CONTRACT.md 1~4절. 이 문서는 새 게임을 붙이는 순서와 규칙이다.

## 1. 원칙

1. **게임 폴더에는 그 게임만의 것만 둔다.** 규칙, 판(게임 화면), 그 게임만의 연출·소리 표.
2. **모든 게임이 똑같이 쓰는 것은 공용 부품을 가져다 쓴다.** 새로 만들지 않고, 복사하지도 않는다.
3. **다르게 해야 하면 "예외"로 신고한다.** 공용 부품을 복사해서 고치지 않는다. 훅(끼워 넣는 자리)을 쓰고, 4절 예외 표에 한 줄 적는다.
4. **게임 추가는 등록표 세 줄이다.** `shared/games.js`(사실), `server/games.js`(서버), `client/src/games.js`(화면). `if (mode === '새게임')` 같은 분기를 공용 파일에 늘리지 않는다.
5. **한 곳을 고치면 모든 게임에 적용돼야 한다.** 공용 부품을 고쳤다면 test/common 의 모든 게임 칸이 통과해야 한다.

## 2. 게임이 만들지 않는 것 (공용 부품)

| 기능 | 공용(파일) | 게임이 주는 것 |
|---|---|---|
| 방 만들기·입장·나가기·빈 방·정원 | `server/room/shell.js` | `shared/games.js` 의 `min`·`max` |
| 방장, 방장 넘김, 강퇴 | shell.js (`{t:'kick'}`) | 없음 (엔진이 방장을 들고 있으면 `onHost`) |
| 대기실·게임 시작·설정 | 서버 shell.js `start/set/pick`, 화면 `client/src/room/wait.js` | `canStart`·`onStart`·`setSettings`·`pick`·`waitInfo`, 스키마 `shared/<모드>/settings.js` 의 `SETTINGS`·`OWN`, 특수 칸은 `waitPart(name)` |
| 끊김·재접속 | shell.js (60초 유예, `away/back`) | `onAway`·`onBack`·`onLeave(id, reason)` |
| 채팅 | 서버 `server/room/chat.js`, 화면 `ui/chat.js` + 틀 | 훅(있을 때만): `chatCheck`·`chatKind`·`chatOwn`, 화면 `chatRule` |
| 이모티콘·사진·사운드·faces | 서버 `server/room/media.js`, 화면 frame + `ui/emotePanel.js` + `room/float.js` | `anchorOf(id)`, 막을 단계는 `mediaBlocked` |
| 소리 | `client/src/sound/core.js` (끄기 하나, iPad 잠금 해제) | 소리 표 |
| 상단 줄·나가기 확인 | `client/src/room/bar.js`, frame `leave` | `leaveNote(state)`, 줄 왼쪽 자리는 등록표 `bar: {leftVar}` |
| 프로필 사진·칭호 | `client/src/ui/kit/avatar.js`, `room/faces.js` | 없음 (방 상태에 사진을 넣지 않는다) |
| 창·확인 창·알림 | `client/src/ui/kit/{modal,toast}.js` (ctx.modal·confirm·toast) | 내용 |
| 오류 | `{msg, code}`, 알림은 틀이 한 번 | 접두사(`err`), 문구는 `ctx.err(code, msg)` 또는 등록표 `errors` |
| 타이머·시간 | `ctx.timer/clear`(예외 안전, 방이 비면 정리), 화면 `ctx.clock` | 마감 시각 |
| 난수 | `ctx.rng` (= hub.rng, crypto) | 없음 (Math.random·crypto 직접 호출 금지) |
| 코인 | `ctx.finish(rows)` → `hub.award` (판마다 한 번) | 등록표 `coin` 키 + `shared/coin/rules.js` 의 `COIN_RULES` 한 줄, 판 끝 `ctx.finish([{id, won, opp}])` |
| 관리자 봇 | `server/admin/bots.js` | `server/admin/games/<모드>.js`(`createBrain`, `skip`), 없으면 `bot: false` |
| 스위치 | `off` / `test`(`?<flag>=1`) / `on` | 등록표 `flag`, server/index.js 의 환경 변수 한 줄 |

## 3. 게임이 만드는 것

### 3-1. 정할 것 (코드보다 먼저)
- 모드 이름(영문 소문자), 화면 이름(`shared/<모드>/name.js` 한 곳), CSS 접두사(`css`, 기존과 서로 접두사가 아니게), 요청 봉투(`msgs`, `{t:'xx', a: 종류}`), 오류 접두사(`err`, `xx_`), 스위치(`flag`).
- 기획 문서 `docs/<모드>/GDD.md`: 규칙, 단계, 통신 모양, **비밀 목록**(누구 기기에만 가야 하는 정보), 예외(4절). SPEC 7절에 통신 모양을 먼저 적는다.

### 3-2. 폴더
```
shared/<모드>/      규칙 + settings.js(SETTINGS·OWN) (DOM·ws·시간 직접 사용 금지)
server/<모드>/room.js  make(ctx, opt) → 게임 객체(훅)
client/src/<모드>/  판 화면 (index.js 의 mount(ctx) 가 입구)
test/<모드>/        규칙 시험, 비밀 누출 시험(leaks.test.js)
docs/<모드>/        GDD
```

### 3-3. 서버 훅 (`server/games.js` 의 `make(ctx, opt)` 가 돌려주는 객체, COMMON-CONTRACT 1-4)
- 필수: `view(viewerId)`(**비밀은 여기서 걸러 낸다**), `phase()`, `isWaiting()`, `canStart()`(부작용 금지), `onStart(byId)`, `onAction(session, msg)`.
- 있을 때만: `setSettings`·`pick`·`waitInfo`(대기실 값, 비밀 금지), `onJoin`·`onAway`·`onBack`·`onLeave`·`onHost`·`onEmpty`, `chatCheck`·`chatKind`·`chatOwn`+`chatLogFor`, `mediaBlocked`, `extrasFor`, `flush`, `listExtra`.
- ctx 로 쓰는 것: `members()`·`member(id)`·`hostId()`, `timer/clear`, `emit/push/pushTo/sendTo`, `chatLine`, `finish(rows)`, `drop(id, reason)`, `err(code, msg)`. 공용 이벤트 `joined/left/away/back` 은 Shell 만 보낸다.
- 오류는 언제나 `{msg, code}`. 훅이 던져도 Shell 은 나가기·방장 넘김·빈 방 정리를 끝까지 한다.
- 관전 계정(`관전`+숫자, SPEC 7-4)은 Shell 이 따로 맡는다: 게임 훅·`ctx.members()` 에 나오지 않는다. 게임은 **`view(id)` 가 자리 없는 id 에 비밀 없는 시점을 주면** 끝(관전자는 `emit('all')`·`push` 를 받는다). 알림을 참가자 목록으로만 보내는 게임은 공개 알림에 `ctx.specIds()` 를 더한다(갱식마인드). `chatCheck`·`mediaBlocked` 는 관전자에게도 불린다(`ctx.isSpec(id)`). 새 게임은 test/common/spectator.test.js MODES 에 한 줄.

### 3-4. 화면 계약 (`client/src/<모드>/index.js`, COMMON-CONTRACT 4-2)
```js
export function mount(ctx) { // ctx: root, ui, stage(등록표 stage 일 때), send, me(), faces, clock, sound, toast, confirm, modal, profile, openEmote, leave, toWait
  return {
    room(state) {},        // 상태가 올 때마다(대기 중에도. 대기실은 틀이 그린다)
    event(e) {},           // 공용이 다 쓰지 않은 이벤트
    error(err) {},         // 이 게임 접두사 오류 (알림은 틀이 띄운다)
    anchorOf(id) {},       // 말풍선·이모티콘 자리
    // 있을 때만: frame(dt), chatRule {maxLen, lock, route, bubble, own, input}, waitPart(name), leaveNote(state), showEmote, holdWait
    unmount() {},          // 리스너·타이머·3D·소리 전부. 틀은 이것이 끝난 뒤 다음 mount
  };
}
```
- 화면 등록표 한 줄: `<모드>: { load: () => import('./<모드>/index.js'), stage, mount: true, bar? }`. main.js 는 고치지 않는다(틀이 불러온다, 그 게임을 안 하는 사람은 받지 않는다).
- 화면은 서버가 준 결과로만 끝낸다. 시간은 서버 마감 시각(`ctx.clock`)으로. 사용자 글자는 `textContent` 로만. `?nogl=1` 에서 끝까지 진행돼야 한다.

## 4. 예외 표

공용과 다르게 동작하는 것은 여기에 적는다. 여기에 없는 차이는 버그다.

| 게임 | 예외 | 근거 |
|---|---|---|
| 라이어 | 단계별 채팅 잠금, 첫 설명 차례(입력 줄 열어 둠 `chatRule.input`), 80자, 정체 공개 중 이모티콘·매체 금지 | docs/liar/GDD.md |
| 갱식마인드 | 정답 판정, 정답자끼리 글 가리기, 그리는 사람 채팅·이모티콘 금지, 40자·도배 제한 값(엔진 `chatOwn`), 게임 중 자기 입력칸, 그리는 사람 끊김 15초 | docs/draw/GDD.md 10절 |
| 요트 | 끊긴 사람 차례는 기다리고 60초에 기권 | docs/yacht/GDD.md |
| (새 게임) | | |

새 예외는 사용자 확인을 받은 뒤 적는다.

## 5. 추가 순서와 체크리스트

1. [ ] GDD 와 SPEC 7절(통신), 비밀 목록, 예외 확정 (화면이 있으면 시안 먼저)
2. [ ] `shared/<모드>/` 규칙 + 규칙 시험
3. [ ] 등록표 세 줄: `shared/games.js`(이름·정원·flag·msgs·err·css·coin·chat·settings·own), `server/games.js`(`make`, `bot`), `client/src/games.js`(`load`, `stage`, `mount: true`)
4. [ ] 서버 훅 `server/<모드>/room.js` + 비밀 누출 시험 `test/<모드>/leaks.test.js`
5. [ ] 화면 `mount(ctx)` (로비 버튼은 등록표에서 자동)
6. [ ] `test/common/rooms.test.js` 의 MODES 에 한 줄, `test/ui/smoke.mjs` 에 한 판 클릭 추가
7. [ ] CLAUDE.md 구역 지도와 게임 절, README 환경 변수 표
8. [ ] 스위치 `test` 로 배포해 `?<모드>=1` 로 확인한 뒤 `on`

## 6. 완료 조건

- `npm run check` 와 `npm test` 통과.
- **공통 표 시험**이 새 게임 칸까지 통과: `test/common/rooms.test.js`(채팅·이모티콘·사진·사운드·나가기·방장 넘김·끊김 유예·재접속·강퇴·set 기본값·결과 뒤 시작), `test/common/games.test.js`(등록표 칸·스키마 모양), `test/ui-room.test.js`(모든 게임이 mount).
- 공용 파일에 새 게임 이름으로 된 분기가 없다(등록표 제외).
- 게임 폴더에 채팅·이모티콘·소리 장치·상단 줄·나가기·창을 새로 만든 코드가 없다.
- 3D·소리·iPad 는 "미확인(실기기 확인 필요)"으로 보고.

## 7. 확장성 조건 (공용 부품을 고칠 때 지킨다)

- 등록표 세 곳(`shared/games.js`·`server/games.js`·`client/src/games.js`)이 **유일한 게임 목록**이다. 정원, 스위치, 봉투 글자, 오류 접두사, 코인 규칙, 봇, 로비 버튼, CSS 접두사 검사가 전부 등록표에서 나온다.
- 등록표에 빠진 칸이 있으면 시험이 실패한다(예: 코인 규칙 없음, 봇 여부 없음).
- CSS 접두사 검사·등록표 검사(games.test)·set 기본값 시험은 등록표를 읽어 돈다. 공통 표(rooms.test)는 MODES 한 줄만 더하고, 빠지면 games.test 가 실패한다.
- 공용 부품은 게임 이름을 모른다. 게임별 차이는 훅과 옵션으로만 받는다.
- 화면 `unmount` 는 반드시 불리고, 다시 들어오면 새로 `mount` 한다.
