// CSS lint: no `zoom`, no `#ui > *` + pointer-events, module class prefixes, no class defined in two CSS files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Host-side layout overrides for the copied liar module (client/src/liar stays identical to gamemine); positions only, scoped by `.lg-root`.
  ['lg-root', 'style.css overrides liar positions for the site top bar / docked chat; client/src/liar must stay a copy of gamemine'],
  ['lg-hud-endbox', 'style.css `.lg-root .lg-hud-endbox`: moved below the 54px .lgbar'],
  ['lg-action', 'style.css `.lg-root .lg-action`: lifted above the docked chat'],
  ['lg-lobbybox', 'style.css `.lg-root .lg-lobbybox`: kept between .lgbar, the action row and the docked chat'],
  ['lg-rs-panel', 'style.css `.lg-root .lg-rs-panel`: result window kept above the lifted action row and docked chat'],
  ['lobby', 'style.css `.lobby[hidden]` and chat.css `html.chat-docked .lobby` reference the lobby root hook class kept on the element by lobby.js; TODO switch both to `.lb-root`'],
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

// Liar module (client/src/liar/): every class starts with lg-.
test('every class in client/src/liar css starts with lg-', () => {
  const liar = files.filter((f) => f.rel.startsWith('client/src/liar/'));
  assert.ok(liar.some((f) => f.rel === 'client/src/liar/liar.css'), 'client/src/liar/liar.css missing');
  const bad = [];
  for (const f of liar) for (const c of f.classes) if (!c.startsWith('lg-')) bad.push(`${f.rel}: ".${c}"`);
  assert.deepEqual(bad, [], `classes must start with "lg-":\n  ${bad.join('\n  ')}`);
});

// Yacht module (client/src/yacht/): every class starts with yt-. Passes while no yacht css exists yet.
test('every class in client/src/yacht css starts with yt-', () => {
  const yacht = files.filter((f) => f.rel.startsWith('client/src/yacht/'));
  const bad = [];
  for (const f of yacht) for (const c of f.classes) if (!c.startsWith('yt-')) bad.push(`${f.rel}: ".${c}"`);
  assert.deepEqual(bad, [], `classes must start with "yt-":\n  ${bad.join('\n  ')}`);
});
