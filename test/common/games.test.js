// 게임 등록표 검사 (docs/COMMON-CONTRACT.md 2-4). 게임을 추가해도 이 파일은 고치지 않는다: 표를 읽어 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GAMES } from '../../shared/games.js';
import { SERVER_GAMES } from '../../server/games.js';
import { COIN_RULES } from '../../shared/coin/rules.js';
import { makeHub, errors } from '../lib/hub.js';

const KEYS = Object.keys(GAMES);
const CLIENT_FILE = new URL('../../client/src/games.js', import.meta.url);

test('세 표(shared·server·client)의 키가 같다', async () => {
  assert.deepEqual(Object.keys(SERVER_GAMES).sort(), [...KEYS].sort());
  // 화면 표는 화면 뼈대(C1)가 만든다. 있으면 같아야 한다.
  if (existsSync(CLIENT_FILE)) {
    const { CLIENT_GAMES } = await import(CLIENT_FILE.href);
    assert.deepEqual(Object.keys(CLIENT_GAMES).sort(), [...KEYS].sort());
  }
});

test('test/common/rooms.test.js 의 MODES 가 모든 게임을 덮는다', () => {
  const text = readFileSync(new URL('./rooms.test.js', import.meta.url), 'utf8');
  const covered = new Set([...text.matchAll(/^\s+mode: '(\w+)'/gm)].map((m) => m[1]));
  for (const k of KEYS) assert.ok(covered.has(k), `rooms.test.js MODES 에 ${k} 줄이 없다`);
});

test('test/common/spectator.test.js 의 MODES 가 모든 게임을 덮는다(관전 계정)', () => {
  const text = readFileSync(new URL('./spectator.test.js', import.meta.url), 'utf8');
  const covered = new Set([...text.matchAll(/^\s+mode: '(\w+)'/gm)].map((m) => m[1]));
  for (const k of KEYS) assert.ok(covered.has(k), `spectator.test.js MODES 에 ${k} 줄이 없다`);
});

const isStr = (v) => typeof v === 'string' && v.length > 0;
const FIELDS = {
  name: isStr, desc: isStr, about: isStr,
  min: Number.isInteger, max: Number.isInteger,
  flag: (v) => v === null || isStr(v),
  msgs: (v) => Array.isArray(v) && v.length > 0 && v.every(isStr),
  err: (v) => isStr(v) && v.endsWith('_'),
  css: (v) => v === null || (isStr(v) && v.endsWith('-')),
  coin: (v) => v === null || isStr(v),
  chat: (v) => v === null || (Number.isInteger(v?.maxLen) && Number.isInteger(v?.log)),
  settings: Array.isArray, own: Array.isArray,
};

test('shared 칸이 전부 있고 타입이 맞다', () => {
  for (const [k, g] of Object.entries(GAMES)) {
    for (const [f, ok] of Object.entries(FIELDS)) {
      assert.notEqual(g[f], undefined, `${k}.${f} 없음 (없음은 null/false/[] 로 적는다)`);
      assert.ok(ok(g[f]), `${k}.${f} 모양이 틀림: ${JSON.stringify(g[f])}`);
    }
    assert.ok(g.min >= 1 && g.min <= g.max, `${k}: min/max`);
    // 있을 때만 보는 칸 (SPEC 7-5): listed(false = 로비 방 목록에 안 나옴), create(방 만들기 추가 칸 거르기), parse(요청 모양 검사)
    if (g.listed !== undefined) assert.equal(typeof g.listed, 'boolean', `${k}.listed`);
    for (const f of ['create', 'parse']) if (g[f] !== undefined) assert.equal(typeof g[f], 'function', `${k}.${f}`);
    if (g.fast !== undefined) {
      assert.ok(Number.isInteger(g.fast.limit) && Array.isArray(g.fast.ops), `${k}.fast`);
    }
  }
});

test('err 은 서로 다르고(포커 둘은 pk_ 공유), msgs 는 겹치지 않고, css 는 서로 접두사가 아니다', () => {
  const POKER = new Set(['holdem', 'bluff']);
  const byErr = new Map();
  for (const [k, g] of Object.entries(GAMES)) {
    const prev = byErr.get(g.err);
    if (prev) assert.ok(POKER.has(prev) && POKER.has(k), `${k} 와 ${prev} 가 err ${g.err} 를 같이 씀`);
    byErr.set(g.err, k);
  }
  const seen = new Map();
  for (const [k, g] of Object.entries(GAMES)) {
    for (const t of g.msgs) {
      assert.ok(!seen.has(t), `msgs '${t}' 가 ${seen.get(t)} 와 ${k} 에 겹침`);
      seen.set(t, k);
    }
  }
  const css = Object.entries(GAMES).filter(([, g]) => g.css);
  for (const [a, ga] of css) {
    for (const [b, gb] of css) if (a !== b) assert.ok(!gb.css.startsWith(ga.css), `css ${ga.css}(${a}) 가 ${gb.css}(${b}) 의 접두사`);
  }
});

test('coin 은 COIN_RULES 에 있고, COIN_RULES 의 키는 모두 어떤 게임의 coin', () => {
  const used = new Set();
  for (const [k, g] of Object.entries(GAMES)) {
    if (g.coin === null) continue;
    assert.ok(Object.hasOwn(COIN_RULES, g.coin), `${k}.coin '${g.coin}' 이 COIN_RULES 에 없음`);
    used.add(g.coin);
  }
  for (const r of Object.keys(COIN_RULES)) assert.ok(used.has(r) || r.startsWith('minibot_') || r.startsWith('puzzle_') || r.startsWith('solo_'), `COIN_RULES.${r} 를 쓰는 게임이 없음`); // minibot_* = 미니게임 봇전 줄, puzzle_* = 체스 퍼즐 줄, solo_* = 혼자 놀기 줄(예외 표)
});

test('서버 항목: make 가 있고, bot 은 false 또는 {createBrain, skip}', () => {
  for (const [k, e] of Object.entries(SERVER_GAMES)) {
    assert.equal(typeof e.make, 'function', `${k}: make 없음`);
    assert.ok(e.bot === false || (typeof e.bot?.createBrain === 'function' && typeof e.bot?.skip === 'function'), `${k}.bot`);
    if (e.hubMsg !== undefined) assert.equal(typeof e.hubMsg, 'function', `${k}.hubMsg`);
    if (e.autoStart !== undefined) assert.equal(typeof e.autoStart, 'function', `${k}.autoStart`);
  }
});

// 4-3 설정 스키마 한 줄의 모양
function checkRow(where, row) {
  assert.ok(['seg', 'multi', 'info', 'custom'].includes(row.type), `${where}: type '${row.type}'`);
  if (row.type === 'info') {
    assert.ok(Array.isArray(row.rows), `${where}: info.rows`);
    return;
  }
  assert.ok(isStr(row.k) && isStr(row.label), `${where}: k/label`);
  if (row.type === 'custom') assert.ok(isStr(row.part), `${where}: custom.part`);
  else assert.ok(Array.isArray(row.opts) || typeof row.opts === 'function', `${where}: opts`);
  if (row.when !== undefined) assert.equal(typeof row.when, 'function', `${where}: when`);
}

test('settings·own 의 각 칸은 4-3 모양', () => {
  for (const [k, g] of Object.entries(GAMES)) {
    g.settings.forEach((row, i) => checkRow(`${k}.settings[${i}]`, row));
    g.own.forEach((row, i) => checkRow(`${k}.own[${i}]`, row));
  }
});

// 'times.speak' -> {times:{speak:v}}
const patchOf = (k, v) => k.split('.').reduceRight((acc, part) => ({ [part]: acc }), v);
const valueAt = (obj, k) => k.split('.').reduce((o, part) => o?.[part], obj);

// 모든 게임: 대기실 기본값을 set/pick 으로 그대로 보내면 거절되지 않는다(실제 허브).
for (const [k, g] of Object.entries(GAMES)) {
  test(`${k}: set/pick 으로 기본값을 보내면 거절되지 않는다`, async () => {
    const h = makeHub({ startCoins: 0 });
    const cs = [];
    for (const id of ['ann1', 'bob1', 'cat1'].slice(0, Math.max(1, Math.min(g.max, 3)))) cs.push(await h.login(id));
    await cs[0].send({ t: 'create', mode: k });
    for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
    const [a] = cs;
    assert.ok(a.state.wait, `${k}: 대기 상태에 wait 가 있다`);
    for (const row of g.settings) {
      if (row.type === 'info' || row.type === 'custom') continue;
      const v = valueAt(a.state.wait.set, row.k);
      if (v === undefined) continue; // when 으로 숨은 칸
      const before = errors(a).length;
      await a.send({ t: 'set', patch: patchOf(row.k, v) });
      assert.equal(errors(a).length, before, `${k}: set ${row.k} 거절: ${JSON.stringify(errors(a).at(-1))}`);
    }
    for (const row of g.own) {
      if (row.type === 'info') continue;
      const v = valueAt(a.state.wait.own[a.state.you], row.k);
      if (v === undefined || v === null) continue;
      const before = errors(a).length;
      await a.send({ t: 'pick', patch: patchOf(row.k, v) });
      assert.equal(errors(a).length, before, `${k}: pick ${row.k} 거절: ${JSON.stringify(errors(a).at(-1))}`);
    }
  });
}
