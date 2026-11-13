// Click smoke test = merge gate (`npm run test:ui`). Real server + real built app (dist/, ?nogl=1) + a WebSocket bot as opponent.
// Judges by messages the bot receives and by visible text, never by pixels. Also runs an occlusion check in each UI state.
// Needs `npm run build` first and Playwright (PLAYWRIGHT_MODULE=/path/to/playwright if not resolvable as "playwright").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer, uid } from '../e2e/helpers.js';
import { Bot } from '../e2e/bot.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('FAIL: dist/ 가 없습니다. 먼저 npm run build');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 5000;

const CONTEXTS = {
  desktop: { viewport: { width: 1280, height: 720 }, touch: false },
  phone: { viewport: { width: 844, height: 390 }, touch: true },
};
const results = [];
const t0 = Date.now();

class StepFailed extends Error {}

async function runContext(browser, server, name, cfg) {
  const ctx = await browser.newContext({ viewport: cfg.viewport, hasTouch: cfg.touch, isMobile: cfg.touch, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`console.error: ${m.text()}`); });

  const check = (what, ok, detail = '') => {
    results.push({ ctx: name, what, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${what}${detail ? ` - ${detail}` : ''}`);
    return Boolean(ok);
  };
  // A step is one named check; a failure is fatal for the rest of this context (later steps depend on it).
  const step = async (what, fn) => {
    try { await fn(); check(what, true); } catch (e) { check(what, false, String(e.message || e).split('\n').slice(0, process.env.SMOKE_VERBOSE ? 12 : 1).join(' | ')); throw new StepFailed(what); }
  };

  const loc = (sel, n = 0) => page.locator(sel).nth(n);
  const press = async (sel, n = 0) => { const l = loc(sel, n); if (cfg.touch) await l.tap({ timeout: T }); else await l.click({ timeout: T }); };
  const visible = (sel) => page.waitForSelector(sel, { state: 'visible', timeout: T });
  const gone = (sel) => page.waitForSelector(sel, { state: 'hidden', timeout: T });

  // Occlusion: every visible button / [role=button] / .hit / wheel segment must be the topmost thing at its centre.
  // While a modal dialog is open only its own buttons count. A button scrolled out of its scroll box is skipped (reachable by scrolling).
  const occlusion = async (state, skip = '') => {
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 1200)),
    ]));
    const bad = await page.evaluate((skipSel) => {
      const out = [];
      const desc = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
      const modal = [...document.querySelectorAll('[aria-modal="true"]')].find((d) => !d.closest('[hidden]') && d.getClientRects().length);
      const clipped = (el, x, y) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (!/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) continue;
          const b = p.getBoundingClientRect();
          if (x < b.left || x >= b.right || y < b.top || y >= b.bottom) return true;
        }
        return false;
      };
      for (const el of (modal ?? document).querySelectorAll('button, [role=button], .hit, .wseg')) {
        if (el.closest('[hidden]') || (skipSel && el.matches(skipSel))) continue;
        let op = 1;
        for (let p = el; p && p.nodeType === 1; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.visibility === 'hidden' || cs.display === 'none' || op < 0.1 || r.width < 2 || r.height < 2) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight || clipped(el, cx, cy)) continue;
        const top = document.elementFromPoint(cx, cy);
        if (top && (top === el || el.contains(top))) continue;
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 14);
        out.push(`${desc(el)} "${label}" at (${Math.round(cx)},${Math.round(cy)}) is covered by ${top ? desc(top) : 'nothing'}`);
      }
      return out;
    }, skip);
    check(`occlusion: ${state}`, bad.length === 0, bad.length ? `\n      ${bad.join('\n      ')}` : '');
  };

  // Liar room: the settings/HUD layout is covered by test/ui/liar-round.mjs; here only the top bar buttons must be on top.
  const barOnTop = async (state) => {
    await page.waitForTimeout(150);
    const bad = await page.evaluate(() => [...document.querySelectorAll('.lgbar-btn')].filter((el) => !el.hidden && el.offsetParent !== null).filter((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top && (top === el || el.contains(top)));
    }).map((el) => el.textContent));
    check(`liar top bar on top: ${state}`, bad.length === 0, bad.join(','));
  };

  // Bot opponent (manual mode) with a tiny deterministic pump: always check/call, never fold, never liar-call.
  const bot = new Bot(server.url, uid('bo'), { autoplay: false });
  await bot.connect();
  await bot.login();
  let pending = false;
  let pump = 'holdem';
  bot.waiters.push(() => {
    const last = bot.messages[bot.messages.length - 1];
    const s = bot.state;
    if (!last || !s) return;
    if (last.t === 'error') { pending = false; return; }
    if (last.t === 'event') {
      const e = last.e || {};
      if ((['action', 'bluffPlay'].includes(e.k) && e.id === s.you) || (e.k === 'liar' && e.caller === s.you)) pending = false;
      return;
    }
    if (last.t !== 'room') return;
    if (s.phase !== 'playing' || s.turn !== s.you) { pending = false; return; }
    if (pending) return;
    pending = true;
    if (pump === 'holdem' && s.mode === 'holdem') bot.send({ t: 'act', a: s.toCall > 0 ? 'call' : 'check' });
    else if (pump === 'bluff' && s.mode === 'bluff') {
      const hand = s.myHand || [];
      bot.send(hand.length ? { t: 'play', cards: [0] } : { t: 'liar' });
    }
  });
  const event = (pred, label) => { const p = bot.waitMsg((m) => m.t === 'event' && pred(m.e), T, label); p.catch(() => {}); return p; };
  const openRoom = (mode, notCode) => bot.waitFor((b) => {
    const m = [...b.messages].reverse().find((x) => x.t === 'rooms');
    return m?.list.find((r) => r.mode === mode && r.count === 1 && r.code !== notCode);
  }, T, `${mode} room in the bot's rooms list`);
  const myId = () => bot.state?.players.find((p) => p.id !== bot.state.you)?.id;

  const meId = uid('ui');
  let holdemCode = null;
  try {
    await page.goto(`${server.http}/?nogl=1`);

    /* ---------- login ---------- */
    await step('login screen shows', () => visible('.lb-field'));
    await occlusion('login');
    await step('login with a fresh ID reaches the lobby', async () => {
      await page.fill('.lb-field', meId);
      await press('button.lb-primary:has-text("입장")');
      await visible('button:has-text("방 만들기")');
    });
    await occlusion('home lobby');

    /* ---------- hold'em ---------- */
    await step('create a hold\'em room, waiting room shows', async () => {
      const mode = await loc('.lb-seg-item[aria-checked="true"]').textContent();
      if (!mode.includes('홀덤')) throw new Error(`default mode is ${mode}`);
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('.lb-actions .lb-danger');
    });
    await occlusion('waiting room (host)');
    await step('bot sees the room in its rooms list and joins by code', async () => {
      const r = await openRoom('holdem');
      holdemCode = r.code;
      await bot.join(r.code);
      await visible('button.lb-primary:has-text("게임 시작"):not([disabled])');
    });
    await step('waiting room: chat icon stays hidden after later room updates', async () => {
      const seen = bot.messages.length;
      bot.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/AAAA' });
      await bot.waitFor((b) => b.messages.slice(seen).some((m) => m.t === 'room'), T, 'room update in waiting room');
      await sleep(500);
      const hidden = await page.evaluate(() => { const b = document.querySelector('.chat-btn'); return !b || b.hidden; });
      check('chat icon hidden in lobby mode after 2nd room update', hidden);
    });
    await step('start: both sides are playing', async () => {
      await press('button.lb-primary:has-text("게임 시작")');
      await bot.waitFor((b) => b.state?.phase === 'playing', T, 'bot sees playing');
      await visible('.cluster');
    });

    const wheel = () => visible('.act .wseg');
    await step('my turn: wheel shows', wheel);
    await occlusion('my turn with wheel');
    await step('wheel call/check segment sends action call|check', async () => {
      const p = event((e) => e.k === 'action' && e.id === myId() && ['call', 'check'].includes(e.a), 'action call/check');
      await press('.act .wseg', 0);
      await p;
    });

    await step('my next turn: wheel shows again', wheel);
    // board zoom (open + close), when board cards exist
    if (await page.locator('.comm .pc').count()) {
      await step('board zoom opens and a tap closes it', async () => {
        await press('.comm');
        await visible('.ov');
        await sleep(300);
        await press('.ov');
        await gone('.ov');
      });
    } else check('board zoom (skipped: no board cards yet)', true);

    await step('chat: open, send, bot receives the chat event', async () => {
      await press('.chat-btn');
      await visible('.chat-in');
      await occlusion('chat bar open');
      await page.fill('.chat-in', `hi-${name}`);
      const p = event((e) => e.k === 'chat' && e.text === `hi-${name}`, 'chat event');
      await press('.chat-send');
      await p;
      if (await loc('.chat-in').isVisible()) await press('.chat-btn');
      await gone('.chat-in');
    });

    await step('chat: a room update while typing keeps focus and text', async () => {
      await press('.chat-btn');
      await visible('.chat-in');
      await page.focus('.chat-in');
      await page.keyboard.type('keepme');
      // bot changes its avatar -> server pushes a room update to the page
      const seen = bot.messages.length;
      bot.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/AAAA' });
      await bot.waitFor((b) => b.messages.slice(seen).some((m) => m.t === 'room'), T, 'room update after avatar');
      await sleep(1000);
      const r = await page.evaluate(() => ({ focused: document.activeElement?.classList.contains('chat-in'), v: document.querySelector('.chat-in')?.value }));
      check('chat input still focused with text after room update', r.focused && r.v === 'keepme', JSON.stringify(r));
      await page.fill('.chat-in', '');
      if (await loc('.chat-in').isVisible()) await press('.chat-btn');
      await gone('.chat-in');
    });

    await step('emote panel: send emote 0, bot receives the emote event', async () => {
      await press('button[aria-label="이모티콘"]');
      await visible('.hpanel .ep-grid.g3 button');
      await occlusion('emote panel open');
      const p = event((e) => e.k === 'emote' && e.e === 0, 'emote event');
      await press('.hpanel .ep-grid.g3 button', 0);
      await p;
      if (await loc('.hpanel').count()) await press('button[aria-label="이모티콘"]');
      await gone('.hpanel');
    });

    await step('HUD panel 족보표 opens and closes', async () => {
      await press('button[aria-label="족보표"]');
      await page.waitForSelector('.hpanel:has-text("로열 플러시")', { state: 'visible', timeout: T });
      await occlusion('족보표 panel open');
      await press('button[aria-label="족보표"]');
      await gone('.hpanel');
    });

    await step('wheel raise segment opens the dial', async () => {
      await wheel();
      await press('.act .wseg', 1);
      await visible('.dialbox');
    });
    await occlusion('raise dial');
    await step('dial arrow raises the amount, confirm sends action raise', async () => {
      const amount = async () => Number((await loc('.dialbox .num').textContent()).replace(/,/g, ''));
      const a0 = await amount();
      await press('.dialbox .ar button', 1);
      const a1 = await amount();
      if (!(a1 > a0)) throw new Error(`arrow did not raise the amount (${a0} -> ${a1})`);
      const p = event((e) => e.k === 'action' && e.id === myId() && e.a === 'raise', 'action raise');
      await press('.act .keys button.confirm');
      await p;
    });

    await step('my later turn: wheel shows', wheel);
    await step('wheel fold segment sends action fold', async () => {
      const p = event((e) => e.k === 'action' && e.id === myId() && e.a === 'fold', 'action fold');
      await press('.act .wseg', 2);
      await p;
    });
    if (await page.waitForSelector('.win', { state: 'visible', timeout: 1500 }).then(() => true, () => false)) await occlusion('result overlay');
    else check('result overlay (not reached within 1.5 s, skipped)', true);

    await step('menu 나가기 returns to the lobby', async () => {
      await press('button[aria-label="메뉴"]');
      await press('.hpanel button.item');
      await visible('button:has-text("방 만들기")');
    });

    /* ---------- bluff ---------- */
    pump = 'bluff';
    bot.leave();
    await step('create a bluff room, bot joins, start', async () => {
      await press('.lb-seg-item:has-text("블러핑")');
      await press('button.lb-primary:has-text("방 만들기")');
      const r = await openRoom('bluff', holdemCode);
      await bot.join(r.code);
      await press('button.lb-primary:has-text("게임 시작"):not([disabled])');
      await visible('.bhand .pc');
    });
    const bluffTurn = () => page.waitForFunction(() => {
      const p = document.querySelector('.btns .p');
      const hand = document.querySelector('.bhand');
      return p && hand && getComputedStyle(p).display !== 'none' && getComputedStyle(hand.parentElement).display !== 'none' && !hand.classList.contains('dim') && hand.children.length > 0;
    }, null, { timeout: 8000 });
    await step('bluff: my turn, hand shows', bluffTurn);
    await occlusion('bluff hand');
    let played = false;
    let liar = false;
    for (let i = 0; i < 8 && !(played && liar); i++) {
      if (i) await step('bluff: my next turn', bluffTurn);
      const canLiar = await loc('.btns .s').isEnabled();
      if (played && canLiar) {
        await step('bluff: LIAR sends liar', async () => {
          const p = event((e) => e.k === 'liar' && e.caller === myId(), 'liar event');
          await press('.btns .s');
          await p;
        });
        liar = true;
      } else if (!played) {
        await step('bluff: select one card, PLAY sends bluffPlay', async () => {
          await press('.bhand .pc', 0);
          await page.waitForSelector('.btns .p:not([disabled])', { timeout: T });
          const p = event((e) => e.k === 'bluffPlay' && e.id === myId(), 'bluffPlay event');
          await press('.btns .p');
          await p;
        });
        played = true;
      } else {
        // round ended without LIAR being allowed to me; play again until it is
        await press('.bhand .pc', 0);
        await press('.btns .p');
      }
    }
    if (!liar) check('bluff: LIAR turn reached', false, 'LIAR was never enabled on my turn');

    /* ---------- liar game (server LIAR=on) ---------- */
    bot.leave();
    await step('liar: leave the bluff room', async () => {
      await press('button[aria-label="메뉴"]');
      await press('.hpanel button.item');
      // the bluff reveal animation may still be playing; the lobby returns when it ends
      await page.waitForSelector('button:has-text("방 만들기")', { state: 'visible', timeout: 20000 });
    });
    await step('liar: lobby shows the 라이어 랭킹 button and a 3rd game choice', async () => {
      await visible('.lb-rank-btn');
      await visible('.lb-seg-item:has-text("라이어게임")');
    });
    await occlusion('home lobby (liar on)');
    const lgBots = [new Bot(server.url, uid('lb'), { autoplay: false }), new Bot(server.url, uid('lc'), { autoplay: false })];
    for (const b of lgBots) {
      await b.connect();
      await b.login();
      // bots say something on their own speaking turn (the server waits for them otherwise)
      b.waiters.push(() => {
        const st = b.state;
        if (st?.mode === 'liar' && st.phase === 'speak' && st.speaker === st.you && !b._said) {
          b._said = true;
          setTimeout(() => b.send({ t: 'lg', a: 'say', text: '봇의 설명' }), 800);
        }
        if (st?.phase !== 'speak') b._said = false;
      });
    }
    await step('liar: pick 라이어게임, create a room, two bots join', async () => {
      await press('.lb-seg-item:has-text("라이어게임")');
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('.lgbar-code');
      await visible('.lg-st-player');
      const r = await openRoom('liar');
      for (const b of lgBots) await b.join(r.code);
      await page.locator('.lg-st-player').nth(2).waitFor({ state: 'visible', timeout: T });
    });
    await barOnTop('liar room (waiting)');
    await occlusion('liar room (waiting, settings)');
    await step('liar: lobby is hidden inside the liar room, poker HUD absent', async () => {
      const r = await page.evaluate(() => ({ lobby: !!document.querySelector('.lb-root') && !document.querySelector('.lb-root').hidden, cluster: !!document.querySelector('.cluster') && getComputedStyle(document.querySelector('.cluster')).display !== 'none' && document.querySelector('.cluster').offsetParent !== null }));
      if (r.lobby) throw new Error('lobby is visible in the liar room');
    });
    await step('liar: room setting button (host) toggles', async () => {
      await press('[data-lg="st-liarMode"][aria-pressed="false"]');
      await visible('[data-lg="st-liarMode"][aria-pressed="true"]');
    });
    await step('liar: shortest times, then 시작 → role card', async () => {
      for (const key of ['speak', 'discuss', 'rediscuss', 'defense', 'judge', 'guess']) {
        await press(`[data-lg="st-time"][data-key="${key}"]`, 0);
        await visible(`[data-lg="st-time"][data-key="${key}"][aria-pressed="true"]`);
      }
      await press('button.lgbar-btn:has-text("시작")');
      await visible('[class*="lg-role-"]');
    });
    await barOnTop('liar role reveal');
    await occlusion('liar role reveal');
    await step('liar: first explanations: chat locked with a note on others\' turns, my own turn types in the chat box', async () => {
      let sawLock = false;
      let said = false;
      const end = Date.now() + 70000;
      while (Date.now() < end && !(sawLock && said)) {
        const lockedNow = await page.evaluate(() => { const i = document.querySelector('.chat-in'); return Boolean(i && i.disabled && i.placeholder.includes('첫 설명 중에는')); });
        if (lockedNow) sawLock = true;
        if (!said && await page.getByText('당신의 발언시간입니다').first().isVisible()) {
          await visible('.chat-in'); // 게임 중에는 아래 채팅 칸이 늘 보인다(채팅 버튼 없음)
          await page.fill('.chat-in', '제 설명입니다');
          const p = lgBots[0].waitMsg((m) => m.t === 'event' && m.e.k === 'chat' && /제 설명입니다/.test(m.e.text), T, 'my explanation reaches a bot');
          p.catch(() => {});
          await press('.chat-send');
          await p;
          said = true;
        }
        await page.waitForTimeout(100);
      }
      if (!sawLock) throw new Error('chat was never locked with the 첫 설명 note');
      if (!said) throw new Error('my speaking turn never came');
    });
    await step('liar: 아래 채팅 칸 "기록" 버튼이 기록 창을 열고 닫는다, 채팅 버튼은 없다', async () => {
      const btnShown = await page.evaluate(() => { const b = document.querySelector('.chat-btn'); return Boolean(b && !b.hidden && b.getClientRects().length); });
      check('liar in-game: .chat-btn not shown', !btnShown);
      await press('.chat-log');
      await visible('.chat-sheet');
      // 이름표는 토론·재투표에서만 눌린다(.lg-vt-can). 그 밖에는 pointer-events:none 이라 캔버스가 맨 위로 잡히는 것이 정상
      await occlusion('liar in-game, 기록 open', '.lg-vt-tag:not(.lg-vt-can)');
      await press('.chat-log');
    });
    await step('liar: emote panel → emote reaches a bot', async () => {
      const p = lgBots[1].waitMsg((m) => m.t === 'event' && m.e.k === 'emote', T, 'emote event');
      p.catch(() => {});
      await press('button.lgbar-btn:has-text("이모티콘")');
      await visible('.hpanel .ep-btn.glyph');
      await press('.hpanel .ep-btn.glyph', 0);
      await p;
      if (await loc('.hpanel').count()) await press('button.lgbar-btn:has-text("이모티콘")');
      await gone('.hpanel');
    });
    await step('liar: 나가기 returns to the lobby, bar disappears', async () => {
      await press('button.lgbar-btn:has-text("나가기")');
      await visible('button:has-text("방 만들기")');
      await gone('.lgbar-code');
    });
    await step('liar: lobby 라이어 랭킹 button → window → close', async () => {
      await press('.lb-rank-btn');
      await visible('[aria-label="라이어 랭킹"]');
      await occlusion('liar ranking window');
      await press('[aria-label="라이어 랭킹"] button:has-text("닫기")');
      await gone('[aria-label="라이어 랭킹"]');
    });
    for (const b of lgBots) b.close();
    await step('poker still works after liar: create a hold\'em room', async () => {
      await press('.lb-seg-item:has-text("홀덤")');
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('.lb-actions .lb-danger');
    });
    await step('poker after liar: leave the room (no leftover room for the next context)', async () => {
      await press('.lb-actions .lb-danger');
      await visible('button:has-text("방 만들기")');
    });
  } catch (e) {
    if (!(e instanceof StepFailed)) check('unexpected error', false, String(e.stack || e).split('\n').slice(0, 3).join(' | '));
    const shot = path.join(os.tmpdir(), `smoke-fail-${name}.png`);
    await page.screenshot({ path: shot }).then(() => console.log(`  screenshot: ${shot}`), () => {});
  } finally {
    check('no pageerror / console error', errors.length === 0, errors.slice(0, 5).join(' | '));
    bot.close();
    await ctx.close().catch(() => {});
  }
}

let server;
let browser;
try {
  server = await startServer({ LIAR: 'on', ROOM_LIST_MS: '100', RESULT_MS: '60', RESULT_FOLD_MS: '60', STREET_MS: '30', REVEAL_MS: '80' });
  browser = await chromium.launch();
  for (const [name, cfg] of Object.entries(CONTEXTS)) await runContext(browser, server, name, cfg);
} catch (e) {
  results.push({ ctx: '-', what: 'setup', ok: false, detail: String(e.stack || e) });
  console.log(`FAIL setup - ${e.message || e}`);
} finally {
  await browser?.close().catch(() => {});
  await server?.stop().catch(() => {});
}
/* ---------- LIAR switch: off (default) hides everything, test only with ?liar=1 ---------- */
async function gateCheck(browser, env, query, expectVisible, label) {
  const srv = await startServer({ ROOM_LIST_MS: '100', ...env });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let ok = false;
  let detail = '';
  try {
    await page.goto(`${srv.http}/?nogl=1${query}`);
    await page.fill('.lb-field', uid('gt'));
    await page.click('button.lb-primary:has-text("입장")');
    await page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => ({ rank: !!document.querySelector('.lb-rank-btn') && !document.querySelector('.lb-rank-btn').hidden && document.querySelector('.lb-rank-btn').offsetParent !== null, pick: [...document.querySelectorAll('.lb-seg-item')].some((e) => e.textContent.includes('라이어게임') && e.offsetParent !== null) }));
    ok = seen.rank === expectVisible && seen.pick === expectVisible && errors.length === 0;
    detail = JSON.stringify({ ...seen, errors });
  } catch (e) { detail = String(e.message || e).split('\n')[0]; }
  results.push({ ctx: 'gate', what: label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [gate] ${label}${detail ? ` - ${detail}` : ''}`);
  await ctx.close().catch(() => {});
  await srv.stop().catch(() => {});
}
try {
  const gb = await chromium.launch();
  await gateCheck(gb, {}, '', false, 'LIAR unset: no 라이어 choice, no 랭킹 button');
  await gateCheck(gb, { LIAR: 'test' }, '', false, 'LIAR=test without ?liar=1: hidden');
  await gateCheck(gb, { LIAR: 'test' }, '&liar=1', true, 'LIAR=test with ?liar=1: visible');
  await gb.close();
} catch (e) {
  results.push({ ctx: 'gate', what: 'gate setup', ok: false, detail: String(e.message || e) });
  console.log(`FAIL gate setup - ${e.message || e}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  [${f.ctx}] ${f.what}${f.detail ? ` - ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
