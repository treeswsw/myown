// CSS lint: no `zoom`, no `#ui > *` + pointer-events, module class prefixes, no class defined in two CSS files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../shared/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(ROOT, 'client');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Returns [{ selector, body }] for every style rule (descends into @media/@supports, skips @keyframes/@font-face).
function parseRules(css) {
  const rules = [];
  const walkBlock = (s) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const prelude = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (/^@(media|supports|layer)/i.test(prelude)) walkBlock(body);
      else if (!prelude.startsWith('@')) rules.push({ selector: prelude, body });
      i = j;
    }
  };
  walkBlock(css);
  return rules;
}

const classesOf = (selector) => {
  const s = selector.replace(/\[[^\]]*\]/g, '');
  return [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
};

const files = walk(CLIENT).map((p) => {
  const rel = relative(ROOT, p).split('\\').join('/');
  const text = stripComments(readFileSync(p, 'utf8'));
  const rules = parseRules(text);
  const classes = new Set(rules.flatMap((r) => classesOf(r.selector)));
  return { rel, text, rules, classes };
});

test('css files were found', () => {
  assert.ok(files.length >= 4, `expected >= 4 css files, found ${files.length}`);
});

test('no `zoom` property', () => {
  const bad = files.filter((f) => /(^|[;{\s])zoom\s*:/.test(f.text)).map((f) => f.rel);
  assert.deepEqual(bad, [], `non-standard CSS "zoom" used in: ${bad.join(', ')} (use --k + transform: scale())`);
});

test('no `#ui > *` rule sets pointer-events', () => {
  const bad = [];
  for (const f of files) {
    for (const r of f.rules) {
      if (/#ui\s*>\s*\*/.test(r.selector) && /pointer-events\s*:/.test(r.body)) bad.push(`${f.rel}: "${r.selector}"`);
    }
  }
  assert.deepEqual(bad, [], `"#ui > *" must not set pointer-events:\n  ${bad.join('\n  ')}`);
});

// Class-name prefix rules per module. `allow` = documented hook classes that are intentionally unprefixed.
const PREFIX_RULES = [
  {
    file: 'client/src/ui/lobby.css',
    ok: (c) => c.startsWith('lb-'),
    allow: new Set([
      'letter', // set by dom.js avatar() on every initial-letter avatar; lobby styles `.lb-av.letter`
    ]),
    hint: 'must start with "lb-"',
  },
  {
    file: 'client/src/ui/chat.css',
    ok: (c) => c === 'chat' || c.startsWith('chat-'),
    allow: new Set([
      // Hook classes of the lobby module that chat.css targets (`html.chat-docked .lobby .panel:not(.narrow)`); lobby.js keeps them on the elements.
      // TODO(integrator): switch chat.css to `.lb-root` / `.lb-panel` / `.lb-narrow`, then drop these three.
      'lobby', 'panel', 'narrow',
      // TODO(chat.css owner): unprefixed state modifiers (`.chat-b.big`, `.old`, `.meta`, `.full`, `.mine`); rename to `chat-big` etc. and drop these.
      'big', 'old', 'meta', 'full', 'mine',
      // size markers for lines starting with `*` / `***` (chatSize.js)
      's1', 's3',
    ]),
    hint: 'must be "chat" or start with "chat-"' },
  {
    file: 'client/src/ui/emotePanel.css',
    ok: (c) => c.startsWith('ep-'),
    // TODO(emotePanel.css owner): unprefixed classes (root `.ep`, modifiers/buttons); rename to `ep-*` and drop these.
    allow: new Set(['ep', 'g3', 'g2', 'glyph', 'snd', 'wait', 'add', 'wide', 'ok', 'danger']),
    hint: 'must start with "ep-"' },
];

test('module class prefixes', () => {
  const bad = [];
  for (const rule of PREFIX_RULES) {
    const f = files.find((x) => x.rel === rule.file);
    assert.ok(f, `${rule.file} not found`);
    for (const c of f.classes) {
      if (!rule.ok(c) && !rule.allow.has(c)) bad.push(`${rule.file}: class ".${c}" ${rule.hint}`);
    }
  }
  assert.deepEqual(bad, [], `prefix violations:\n  ${bad.join('\n  ')}`);
});

// Classes that may legitimately appear in selectors of several CSS files.
const CROSS_FILE_ALLOW = new Map([
  ['letter', 'dom.js avatar() adds it to every avatar; style.css styles `.pav.letter`, lobby.css styles `.lb-av.letter` (each scoped by its own base class)'],
  ['big', 'TODO: style.css `.ic.big` and chat.css `.chat-b.big` are unrelated modifiers scoped by different base classes; rename chat.css one to chat-big'],
  ['chat-btn', 'TODO: style.css `.chat-btn::after` (hit-area extension) targets the chat.css button; move that rule into chat.css'],
  // Host-side layout overrides for the liar module; positions only, scoped by `.lg-root`.
  ['lg-root', 'style.css lifts liar parts above the docked chat (chat.css --chat-docked-h)'],
  ['lg-action', 'style.css `.lg-root .lg-action`: lifted above the docked chat'],
  ['lobby', 'style.css `.lobby[hidden]` and chat.css `html.chat-docked .lobby` reference the lobby root hook class kept on the element by lobby.js; TODO switch both to `.lb-root`'],
  // 입구가 .dr-root 에 붙이는 키보드 상태 클래스, 모듈은 조상 선택자로 읽기만
  ['dr-kb', '입구가 .dr-root 에 붙이는 키보드 상태 클래스, 모듈은 조상 선택자로 읽기만'],
]);

test('a class is not defined in two CSS files', () => {
  const seen = new Map(); // class -> [files]
  for (const f of files) for (const c of f.classes) seen.set(c, [...(seen.get(c) ?? []), f.rel]);
  const bad = [];
  for (const [c, fs] of seen) {
    if (fs.length > 1 && !CROSS_FILE_ALLOW.has(c)) bad.push(`class ".${c}" appears in selectors of: ${fs.join(', ')}`);
  }
  assert.deepEqual(bad, [], `duplicate class definitions across CSS files (add to CROSS_FILE_ALLOW with a reason if intended):\n  ${bad.join('\n  ')}`);
});

// Game modules (client/src/<mode>/): every class starts with the game's prefix from the registry (shared/games.js `css`).
// A game with css: null (poker) has no module folder of its own.
test('liar module css exists', () => {
  assert.ok(files.some((f) => f.rel === 'client/src/liar/liar.css'), 'client/src/liar/liar.css missing');
});

// Known unprefixed classes per game. Empty: every class in a game folder starts with the game's prefix.
const GAME_CSS_ALLOW = {};

for (const [mode, g] of Object.entries(GAMES)) {
  if (!g.css) continue;
  test(`every class in client/src/${mode} css starts with ${g.css}`, () => {
    const mine = files.filter((f) => f.rel.startsWith(`client/src/${mode}/`));
    const bad = [];
    for (const f of mine) for (const c of f.classes) if (!c.startsWith(g.css) && !GAME_CSS_ALLOW[mode]?.has(c)) bad.push(`${f.rel}: ".${c}"`);
    assert.deepEqual(bad, [], `classes must start with "${g.css}":\n  ${bad.join('\n  ')}`);
  });
}

// 게임이 아닌 공용 폴더: 코인·관리자·공용 방 틀·공용 부품의 클래스도 접두사를 지킨다.
const SHARED_PREFIX = [
  { dir: 'client/src/coin/', prefixes: ['cn-', 'gc-', 'sh-', 'pn-', 'lk-', 'tfx-', 'cp-'], allow: ['tfx'] },
  { dir: 'client/src/room/', prefixes: ['rm-', 'wr-'] },
  { dir: 'client/src/ui/kit/', prefixes: ['ui-'], allow: ['letter'] },
  { file: 'client/src/ui/admin.css', prefixes: ['adm-'] },
];
for (const rule of SHARED_PREFIX) {
  const label = rule.dir ?? rule.file;
  test(`every class in ${label} starts with ${rule.prefixes.join(' / ')}`, () => {
    const mine = files.filter((f) => (rule.dir ? f.rel.startsWith(rule.dir) : f.rel === rule.file));
    assert.ok(mine.length > 0, `${label}: no css files`);
    const bad = [];
    for (const f of mine) for (const c of f.classes) if (!rule.prefixes.some((p) => c.startsWith(p)) && !rule.allow?.includes(c)) bad.push(`${f.rel}: ".${c}"`);
    assert.deepEqual(bad, [], `classes must start with ${rule.prefixes.join(' / ')}:\n  ${bad.join('\n  ')}`);
  });
}
