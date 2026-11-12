// Real-click UI check against the real server (not part of `npm test`; see README "UI click test").
// Drives one browser page with real mouse clicks (desktop) or taps (touch contexts) while a WebSocket bot
// plays the opponent, and asserts what the server saw. Requires `npm run build` first and Playwright
// (PLAYWRIGHT_MODULE=/path/to/playwright if it is not resolvable as "playwright").
import { createRequire } from 'node:module';
import { startServer, uid } from '../e2e/helpers.js';
import { Bot } from '../e2e/bot.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONTEXTS = {
  desktop: { viewport: { width: 1280, height: 720 }, touch: false },
  phone: { viewport: { width: 844, height: 390 }, touch: true },
  tablet: { viewport: { width: 1024, height: 768 }, touch: true },
  tabletL: { viewport: { width: 1180, height: 820 }, touch: true },
};
const only = process.argv[2];
const results = [];

async function runContext(browser, server, name, cfg) {
  const ctx = await browser.newContext({
    viewport: cfg.viewport, hasTouch: cfg.touch, isMobile: cfg.touch, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(60000);
  const check = (what, ok, detail = '') => {
    results.push({ ctx: name, what, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${what}${detail ? ` - ${detail}` : ''}`);
  };

  // Real pointer input: click for mouse, tap for touch. Both go through the element centre.
  const press = async (sel) => {
    const el = page.locator(sel).first();
    await el.waitFor({ state: 'visible' });
    if (cfg.touch) await el.tap(); else await el.click();
  };
  const topAt = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(t && el.contains(t));
  }, sel);
  const reachable = async (what, sel) => check(`${what} is the top element at its centre`, await topAt(sel));
  const dragPath = async (points) => {
    if (cfg.touch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      for (const p of points.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await sleep(60); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (const p of points.slice(1)) { await page.mouse.move(p.x, p.y); await sleep(60); }
      await page.mouse.up();
    }
  };

  const meId = uid('ui').toLowerCase();
  const bot = new Bot(server.url, uid('bo'), { autoplay: true, thinkMs: [300, 700] });
  await bot.connect();
  await bot.login();

  await page.goto(`${server.http}/`);
  await page.waitForSelector('.lobby input');
  await page.fill('.lobby input', meId);
  await press('.lobby button.primary');
  await page.waitForSelector('.lobby .rooms', { state: 'attached' });

  /* ---------- hold'em ---------- */
  const code = await bot.create('holdem');
  const roomBtn = page.locator(`.lobby .rooms button:not([disabled]):has-text("${bot.me.name}")`).first();
  await roomBtn.waitFor({ state: 'visible' });
  await reachable('room list row', '.lobby .rooms button');
  if (cfg.touch) await roomBtn.tap(); else await roomBtn.click();
  await page.waitForFunction(() => document.body.textContent.includes('게임 시작') || document.querySelector('.cluster'));
  await bot.waitFor((b) => b.state?.players.length === 2, 20000, 'bot sees 2 players');
  check('joined a room by tapping it in the list', bot.state.code === code);
  bot.start();
  await page.waitForSelector('.cluster', { state: 'visible' });
  const myId = () => bot.state?.players.find((p) => p.id !== bot.state.you)?.id;

  const myTurnWheel = async (needRaise = false) => {
    for (let i = 0; i < 400; i++) {
      const ok = await page.evaluate((nr) => {
        const w = document.querySelectorAll('.act .wseg');
        return w.length === 3 && (!nr || !w[1].classList.contains('off'));
      }, needRaise);
      if (ok) { await sleep(500); return true; }
      await sleep(500);
    }
    return false;
  };
  const turnKey = () => { const s = bot.state; return `${s.street}|${s.turn}|${s.players.map((p) => `${p.bet}${p.folded}`).join()}`; };

  // check / call
  check('wheel appears on my turn', await myTurnWheel());
  await reachable('wheel check/call segment', '.act .wseg:nth-of-type(1)');
  await reachable('wheel raise segment', '.act .wseg:nth-of-type(2)');
  await reachable('wheel fold segment', '.act .wseg:nth-of-type(3)');
  const before = turnKey();
  const handBefore = bot.stateHistory.length;
  await press('.act .wseg:nth-of-type(1)');
  await bot.waitFor((b) => b.stateHistory.length > handBefore && turnKey() !== before, 20000, 'server advanced after check/call').then(
    () => check('check/call click advanced the server turn', true), () => check('check/call click advanced the server turn', false));

  // raise: arrows, drag, confirm
  check('wheel appears again', await myTurnWheel(true));
  await press('.act .wseg:nth-of-type(2)');
  await page.waitForSelector('.dialbox', { state: 'visible' });
  const amount = async () => Number((await page.locator('.dialbox .num').textContent()).replace(/,/g, ''));
  const a0 = await amount();
  await reachable('dial right arrow', '.dialbox .ar button:nth-child(2)');
  await reachable('dial left arrow', '.dialbox .ar button:nth-child(1)');
  await press('.dialbox .ar button:nth-child(2)');
  await press('.dialbox .ar button:nth-child(2)');
  const a1 = await amount();
  check('right arrow raised the amount by 100 per tap', a1 === a0 + 200, `${a0} -> ${a1}`);
  await press('.dialbox .ar button:nth-child(1)');
  const a2 = await amount();
  check('left arrow lowered it by 100', a2 === a1 - 100, `${a1} -> ${a2}`);
  const box = await page.locator('.dialbox > svg').boundingBox();
  const s = box.width / 190;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await dragPath([{ x: c.x - 58 * s, y: c.y + 58 * s }, { x: c.x - 80 * s, y: c.y }, { x: c.x, y: c.y - 82 * s }, { x: c.x + 60 * s, y: c.y - 55 * s }]);
  const a3 = await amount();
  const min = Number((await page.locator('.dialbox .lim').first().textContent()).replace(/[^\d.]/g, '')) || 0;
  check('dragging the gauge changed the amount', a3 !== a2 && a3 > 0, `${a2} -> ${a3} (min label ${min})`);
  await reachable('dial confirm button', '.keys button:nth-child(3)');
  await reachable('dial all-in button', '.keys button:nth-child(1)');
  await reachable('dial cancel button', '.keys button:nth-child(2)');
  const hist = bot.stateHistory.length;
  await press('.keys button:nth-child(3)');
  const me = () => bot.state.players.find((p) => p.id === myId());
  await bot.waitFor((b) => b.stateHistory.slice(hist).some((st) => st.players.find((p) => p.id === myId())?.bet === a3), 20000, 'bet seen by server').then(
    () => check(`confirm placed the bet of ${a3} on the server`, true), () => check(`confirm placed the bet of ${a3} on the server`, false, `bet=${me()?.bet}`));

  // board zoom (open + close)
  await page.waitForSelector('.comm', { state: 'visible' });
  await reachable('board mirror', '.comm');
  await press('.comm');
  await page.waitForSelector('.ov', { state: 'visible' });
  await sleep(400);
  check('board zoom overlay is on top', await topAt('.ov'));
  await page.mouse.move(5, 5).catch(() => {});
  if (cfg.touch) await page.touchscreen.tap(cfg.viewport.width / 2, cfg.viewport.height - 20); else await page.mouse.click(cfg.viewport.width / 2, cfg.viewport.height - 20);
  await page.waitForSelector('.ov', { state: 'detached', timeout: 5000 }).then(() => check('tapping anywhere closes the board zoom', true), () => check('tapping anywhere closes the board zoom', false));

  // emote above my pin
  await reachable('emote icon', '.hud-tl .ic[aria-label="이모티콘"]');
  await press('.hud-tl .ic[aria-label="이모티콘"]');
  await reachable('first emote button', '.hpanel .ep-grid.g3 button');
  await press('.hpanel .ep-grid.g3 button:nth-child(2)');
  const emote = await page.waitForFunction(() => {
    const pin = [...document.querySelectorAll('.pl')].find((n) => n.querySelector('.emote.show'));
    if (!pin) return null;
    const e = pin.querySelector('.emote').getBoundingClientRect();
    const a = pin.querySelector('.pav').getBoundingClientRect();
    return { glyph: pin.querySelector('.emote').textContent, above: e.bottom <= a.top + 4, name: pin.querySelector('.nm').textContent };
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  check('emote appears above a profile (my own, echoed by the server)', emote?.glyph && emote.above && emote.name.startsWith(meId.slice(0, 5)), JSON.stringify(emote));

  // chat
  await press('.chat-btn');
  await page.fill('.chat-in', `hello-${name}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t) => [...document.querySelectorAll('.chat-b')].some((n) => n.textContent === t), `hello-${name}`, { timeout: 15000 })
    .then(() => check('chat message bubble appears', true), () => check('chat message bubble appears', false));
  await page.keyboard.press('Escape');

  // fold (needs my turn again)
  check('wheel appears for fold', await myTurnWheel());
  const foldHist = bot.stateHistory.length;
  await press('.act .wseg:nth-of-type(3)');
  await bot.waitFor((b) => b.stateHistory.slice(foldHist).some((st) => st.players.find((p) => p.id === myId())?.folded || st.result), 20000, 'fold seen')
    .then(() => check('fold click folded me on the server', true), () => check('fold click folded me on the server', false));

  // play on (always check/call) until a showdown happens, then look for the winner emphasis
  let showdown = null;
  for (let i = 0; i < 150 && !showdown; i++) {
    showdown = await page.evaluate(() => {
      const row = document.querySelector('.win .show');
      if (!row) return null;
      return { valid: row.querySelectorAll('.pc.valid').length, invalid: row.querySelectorAll('.pc.invalid').length, champ: document.querySelectorAll('.pl.champ').length, oneRow: new Set([...row.querySelectorAll('.pc')].map((c) => Math.round(c.getBoundingClientRect().top / 40))).size === 1 };
    });
    if (showdown) break;
    if (await page.evaluate(() => document.querySelectorAll('.act .wseg').length === 3 && !document.querySelector('.dialbox'))) await press('.act .wseg:nth-of-type(1)').catch(() => {});
    await sleep(800);
  }
  if (showdown) {
    check('showdown: five winning cards highlighted, two dimmed', showdown.valid === 5 && showdown.invalid === 2, JSON.stringify(showdown));
    check('showdown: winner profile emphasised on the table', showdown.champ >= 1);
    check('showdown: the 7-card row stays on one line inside the viewport', showdown.oneRow);
  } else check('showdown reached within the time limit (not exercised if this fails)', false);

  // menu -> leave
  await reachable('menu (logo) icon', '.hud-tl .ic.big');
  await press('.hud-tl .ic.big');
  await reachable('menu leave item', '.hpanel button.item');
  await press('.hpanel button.item');
  await page.waitForSelector('.lobby button:has-text("방 만들기")', { state: 'visible', timeout: 20000 })
    .then(() => check('menu 나가기 returned to the lobby', true), () => check('menu 나가기 returned to the lobby', false));
  await bot.waitFor((b) => b.state?.players.length === 1, 10000, 'server removed me').then(
    () => check('server sees me gone from the room', true), () => check('server sees me gone from the room', false));

  /* ---------- bluff ---------- */
  bot.leave();
  await sleep(500);
  const code2 = await bot.create('bluff');
  const row2 = page.locator(`.lobby .rooms button:not([disabled]):has-text("${bot.me.name}")`).first();
  await row2.waitFor({ state: 'visible' });
  if (cfg.touch) await row2.tap(); else await row2.click();
  await bot.waitFor((b) => b.state?.players.length === 2 && b.state.code === code2, 20000, 'bluff join');
  bot.start();
  await page.waitForSelector('.bhand .pc', { state: 'visible' });
  const waitBluffTurn = async () => {
    for (let i = 0; i < 400; i++) {
      const ok = await page.evaluate(() => { const p = document.querySelector('.btns .p'); return p && getComputedStyle(p).display !== 'none' && !document.querySelector('.bhand.dim') && document.querySelectorAll('.bhand .pc').length > 0; });
      if (ok) { await sleep(500); return true; }
      await sleep(500);
    }
    return false;
  };
  check('bluff hand and buttons usable on my turn', await waitBluffTurn());
  await reachable('bluff card 1', '.bhand .pc:nth-child(1)');
  await press('.bhand .pc:nth-child(1)');
  await press('.bhand .pc:nth-child(2)');
  const badge = await page.locator('.btns .p i').textContent().catch(() => '');
  check('selecting two cards shows the count badge', badge === '2', `badge=${badge}`);
  await reachable('PLAY button', '.btns .p');
  await reachable('LIAR button', '.btns .s');
  const pb = bot.stateHistory.length;
  await press('.btns .p');
  await bot.waitFor((b) => b.stateHistory.slice(pb).some((st) => st.lastPlay && st.lastPlay.count === 2), 20000, 'play seen')
    .then(() => check('PLAY sent two cards (server lastPlay.count = 2)', true), () => check('PLAY sent two cards (server lastPlay.count = 2)', false));
  // the next time it is my turn with a play on the table, call LIAR
  let liarSent = false;
  const quiet = () => page.waitForSelector('.ov', { state: 'detached', timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 8 && !liarSent; i++) {
    if (!(await waitBluffTurn())) break;
    await quiet();
    try {
      const enabled = await page.evaluate(() => !document.querySelector('.btns .s').disabled);
      if (enabled) {
        const lh = bot.stateHistory.length;
        await press('.btns .s');
        liarSent = await bot.waitFor((b) => b.stateHistory.slice(lh).some((st) => st.reveal), 20000, 'reveal').then(() => true, () => false);
      } else {
        await press('.bhand .pc:nth-child(1)');
        await press('.btns .p');
      }
    } catch (e) { await sleep(1000); }
  }
  check('LIAR click produced a reveal on the server', liarSent);
  const css = await page.evaluate(() => ({
    zoom: [...document.styleSheets].some((sh) => [...sh.cssRules].some((r) => /(^|[;{\s])zoom\s*:/.test(r.cssText))),
    wraps: [...document.querySelectorAll('.comm, .bhand, .win .show, .keys')].filter((n) => getComputedStyle(n).flexWrap !== 'nowrap').length,
  }));
  check('no stylesheet rule uses the non-standard zoom property', !css.zoom);
  check('card/button rows are flex-wrap: nowrap', css.wraps === 0);
  check('no console/page errors in the page', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
  bot.close();
}

const server = await startServer({ RESULT_MS: '3000', STREET_MS: '300', REVEAL_MS: '1000' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [name, cfg] of Object.entries(CONTEXTS)) {
    if (only && only !== name) continue;
    try { await runContext(browser, server, name, cfg); } catch (e) {
      results.push({ ctx: name, what: 'context run aborted', ok: false, detail: e.message.split('\n')[0] });
      console.log(`FAIL [${name}] aborted - ${e.message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
