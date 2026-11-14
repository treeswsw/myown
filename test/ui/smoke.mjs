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
  const sent = []; // outgoing WebSocket frames from the page
  page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
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
      const modal = [...document.querySelectorAll('[aria-modal="true"], .aic-ov')].find((d) => !d.closest('[hidden]') && d.getClientRects().length); // a modal dialog (incl. the all-in confirm) legitimately covers the rest
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

  // Liar room (common frame): the HUD layout is covered by test/ui/liar-round.mjs; here only the common top bar / waiting-room buttons must be on top.
  const rmBarOnTop = async (state) => {
    await page.waitForTimeout(150);
    const bad = await page.evaluate(() => [...document.querySelectorAll('.rm-bar .rm-btn, .wr-root [data-rm]')].filter((el) => !el.hidden && el.offsetParent !== null).filter((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top && (top === el || el.contains(top)));
    }).map((el) => el.textContent));
    check(`liar top bar on top: ${state}`, bad.length === 0, bad.join(','));
  };

  // Leaving a poker room from the HUD menu: a confirm window while the table plays (press 나가기), none when already waiting.
  const leaveConfirm = async (ms) => {
    const lobbyBtn = 'button:has-text("방 만들기")';
    const first = await Promise.race([
      page.waitForSelector('.ui-confirm', { state: 'visible', timeout: ms }).then(() => 'confirm'),
      page.waitForSelector(lobbyBtn, { state: 'visible', timeout: ms }).then(() => 'lobby'),
    ]);
    if (first === 'confirm') await press('.ui-mbtn.ui-danger');
    // After an all-in the run-out animation may still play; the lobby returns at once on leaving.
    await page.waitForSelector(lobbyBtn, { state: 'visible', timeout: ms });
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
    await page.goto(`${server.http}/?nogl=1&draw=1&gsk=1`);

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
    await step('create a hold\'em room, the common waiting room shows (no in-room game switch)', async () => {
      const mode = await loc('.lb-seg-item[aria-checked="true"]').textContent();
      if (!mode.includes('홀덤')) throw new Error(`default mode is ${mode}`);
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-leave"]');
      await visible('.wr-root:has-text("텍사스 홀덤")');
      if (await page.locator('.wr-root .lb-seg-item:has-text("블러핑")').count()) throw new Error('the waiting room still offers 블러핑');
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
      bot.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/AAAA' }); // a photo now comes as a faces notice, never in the room state
      await bot.waitFor((b) => b.messages.slice(seen).some((m) => m.t === 'event' && m.e.k === 'faces'), T, 'faces in waiting room');
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
    await step('amount tag beside the call/check segment shows the amount', async () => {
      const t = (await loc('.act .wtag').textContent()).replace(/\s+/g, ' ').trim();
      if (!/^(콜|체크|올인)\s*[\d,]+$/.test(t)) throw new Error(`unexpected tag "${t}"`);
    });
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
      // bot changes its avatar -> the page gets a faces notice and redraws the seat photos
      const seen = bot.messages.length;
      bot.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/BBBB' });
      await bot.waitFor((b) => b.messages.slice(seen).some((m) => m.t === 'event' && m.e.k === 'faces'), T, 'faces after avatar');
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
      await page.evaluate(() => { document.querySelector('.hpanel .ep-reload').dataset.test = '1'; }); // 새로고침 버튼: 보이고 눌리는지만 (실제 새로고침 막음)
      await visible('.hpanel .ep-reload[aria-label="새로고침"]');
      await press('.hpanel .ep-reload');
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
    await step('my next turn: wheel shows (all-in flow)', wheel);
    await step('raise dial all-in key opens the confirm dialog', async () => {
      await press('.act .wseg', 1);
      await visible('.dialbox');
      await press('.act .keys button.allin');
      await visible('.aic-sheet');
      if ((await page.locator('.aic-sheet').count()) !== 1) throw new Error('more than one dialog');
    });
    await occlusion('all-in confirm dialog');
    await step('all-in dialog 취소 closes it and keeps the dial', async () => {
      await press('.aic-cancel');
      await gone('.aic-sheet');
      await visible('.dialbox');
    });
    await step('all-in dialog confirm sends action allin', async () => {
      await press('.act .keys button.allin');
      await visible('.aic-sheet');
      const p = event((e) => e.k === 'allin' && e.id === myId(), 'allin event (server reports an all-in act as raise + allin)');
      await press('.aic-go');
      await p;
      await gone('.aic-sheet');
      if (!sent.some((m) => { try { const j = JSON.parse(m); return j.t === 'act' && j.a === 'allin'; } catch { return false; } })) throw new Error("page never sent {t:'act',a:'allin'}");
    });
    if (await page.waitForSelector('.win', { state: 'visible', timeout: 1500 }).then(() => true, () => false)) await occlusion('result overlay');
    else check('result overlay (not reached within 1.5 s, skipped)', true);

    await step('menu 나가기 asks first while the table plays (확인 창), then returns to the lobby', async () => {
      await press('button[aria-label="메뉴"]');
      await press('.hpanel button.item');
      // While the table plays the frame asks first; a room already back in the waiting state leaves at once.
      await leaveConfirm(25000);
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
      await leaveConfirm(20000);
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
    await step('liar: pick 라이어게임, create a room → common waiting room; two bots join and 게임 시작 is enabled', async () => {
      await press('.lb-seg-item:has-text("라이어게임")');
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-start"]');
      const r = await openRoom('liar');
      for (const b of lgBots) await b.join(r.code);
      await page.waitForFunction(() => document.querySelectorAll('.wr-players li').length === 3 && !document.querySelector('[data-rm="wait-start"]').disabled, null, { timeout: T });
    });
    await rmBarOnTop('liar room (waiting)');
    await occlusion('liar room (waiting, settings)');
    await step('liar: lobby is hidden inside the liar room, poker HUD absent', async () => {
      const r = await page.evaluate(() => ({ lobby: !!document.querySelector('.lb-root:not(.wr-root)') && !document.querySelector('.lb-root:not(.wr-root)').hidden, cluster: !!document.querySelector('.cluster') && getComputedStyle(document.querySelector('.cluster')).display !== 'none' && document.querySelector('.cluster').offsetParent !== null }));
      if (r.lobby) throw new Error('lobby is visible in the liar room');
    });
    await step('liar: waiting room 전체 랭킹 (waitPart lg-rank) opens the ranking window, 닫기 closes it', async () => {
      await press('[data-lg="rank-wait"]');
      await visible('.ui-modal [data-lg="rank-mine"]');
      await press('.ui-modal .ui-mbtn:has-text("닫기")');
      await page.waitForSelector('.ui-modal', { state: 'detached', timeout: T });
    });
    await step('liar: room setting button (host) toggles (set → wait.set)', async () => {
      await press('.wr-seg[aria-label="라이어 방식"] .wr-opt[aria-checked="false"]');
      await visible('.wr-seg[aria-label="라이어 방식"] .wr-opt[aria-checked="true"]:has-text("라이어 알림")');
      await press('.wr-seg[aria-label="라이어 방식"] .wr-opt[aria-checked="false"]'); // back to 다른 제시어
    });
    await step('liar: shortest times, then 게임 시작 → role card', async () => {
      for (const label of ['첫 설명', '토론·투표', '살린 뒤 토론', '최후 변론', '찬반 투표', '정답 맞히기']) {
        await press(`.wr-seg[aria-label="${label}"] .wr-opt`, 0);
        await visible(`.wr-seg[aria-label="${label}"] .wr-opt:first-child[aria-checked="true"]`);
      }
      await press('[data-rm="wait-start"]');
      await visible('[class*="lg-role-"]');
    });
    await rmBarOnTop('liar role reveal');
    await occlusion('liar role reveal');
    await step('liar: first explanations: chat locked with a note on others\' turns, my own turn types in the chat box', async () => {
      let sawLock = false;
      let said = false;
      const end = Date.now() + 70000;
      while (Date.now() < end && !(sawLock && said)) {
        const lockedNow = await page.evaluate(() => { const i = document.querySelector('.chat-in'); return Boolean(i && i.disabled && i.placeholder.includes('첫 설명 중에는')); });
        if (lockedNow) sawLock = true;
        if (!said && await page.getByText('당신의 발언시간입니다').first().isVisible()) {
          await visible('.chat-in'); // 내 입력 차례가 오면 채팅 칸이 저절로 열린다
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
    await step('liar: 사이트 채팅 버튼으로 채팅 칸을 열면 "기록" 버튼이 기록 창을 열고 닫는다', async () => {
      const btnShown = await page.evaluate(() => { const b = document.querySelector('.chat-btn'); return Boolean(b && !b.hidden && b.getClientRects().length); });
      check('liar in-game: site .chat-btn shown', btnShown);
      if (!(await page.locator('.chat-in').isVisible())) await press('.chat-btn');
      await visible('.chat-in');
      await press('.chat-log');
      await visible('.chat-sheet');
      // 이름표는 토론·재투표에서만 눌린다(.lg-vt-can). 그 밖에는 pointer-events:none 이라 캔버스가 맨 위로 잡히는 것이 정상
      await occlusion('liar in-game, 기록 open', '.lg-vt-tag:not(.lg-vt-can)');
      await press('.chat-log');
      if (await page.locator('.chat-btn[aria-expanded="true"]').count()) await press('.chat-btn'); // 채팅 칸 닫기
    });
    await step('liar: emote panel → emote reaches a bot', async () => {
      const p = lgBots[1].waitMsg((m) => m.t === 'event' && m.e.k === 'emote', T, 'emote event');
      p.catch(() => {});
      await press('[data-rm="bar-emote"]');
      await visible('.hpanel .ep-btn.glyph');
      await press('.hpanel .ep-btn.glyph', 0);
      await p;
      if (await loc('.hpanel').count()) await press('[data-rm="bar-emote"]');
      await gone('.hpanel');
    });
    await step('liar: 나가기 mid-game asks first, 취소 keeps me in, 나가기 returns to the lobby', async () => {
      await press('[data-rm="bar-leave"]');
      await visible('.ui-confirm:has-text("나가면 이번 판에서 빠져요")');
      await press('.ui-mbtn:has-text("취소")');
      await visible('.rm-bar:not([hidden])');
      await press('[data-rm="bar-leave"]');
      await press('.ui-mbtn.ui-danger');
      await visible('button:has-text("방 만들기")');
      await gone('.rm-bar:not([hidden])');
      await page.waitForFunction(() => document.querySelector('.lg-root') === null, null, { timeout: T }); // 3D·화면 요소가 남지 않는다
    });
    await step('liar: lobby 라이어 랭킹 button → window → close', async () => {
      await press('.lb-rank-btn');
      await visible('[aria-label="라이어 랭킹"]');
      await occlusion('liar ranking window');
      await press('[aria-label="라이어 랭킹"] button:has-text("닫기")');
      await gone('[aria-label="라이어 랭킹"]');
    });
    for (const b of lgBots) b.close();
    // The all-in step above may have busted this account (the bot calls; the showdown is random). A bust is a legitimate
    // state: hold'em must then be refused with the "새 아이디로 시작" notice instead of creating a room.
    const busted = await page.locator('button:has-text("새 아이디로 시작")').first().isVisible().catch(() => false);
    if (busted) {
      await step('poker after liar: busted account cannot create a hold\'em room (create button disabled)', async () => {
        await press('.lb-seg-item:has-text("홀덤")');
        if (!(await page.locator('button.lb-primary:has-text("방 만들기")').first().isDisabled())) throw new Error('create button enabled with 0 chips');
      });
    } else {
      await step('poker still works after liar: create a hold\'em room', async () => {
        await press('.lb-seg-item:has-text("홀덤")');
        await press('button.lb-primary:has-text("방 만들기")');
        await visible('.lb-actions .lb-danger');
      });
      await step('poker after liar: leave the room (no leftover room for the next context)', async () => {
        await press('.lb-actions .lb-danger');
        await visible('button:has-text("방 만들기")');
      });
    }

    /* ---------- yacht game (server YACHT=on) ---------- */
    const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
    const yBot = new Bot(server.url, uid('yb'), { autoplay: false });
    await yBot.connect();
    await yBot.login();
    // the bot rolls and then scores the first empty row on its own turn, 700 ms apart (so its turn can be seen)
    let yKey = '';
    yBot.waiters.push(() => {
      const st = yBot.state;
      if (st?.mode !== 'yacht' || st.phase !== 'playing' || st.turn !== st.you || st.waiting) return;
      const key = `${st.gameNo}:${st.round}:${st.rollNo}`;
      if (key === yKey) return;
      yKey = key;
      setTimeout(() => {
        if (!st.dice) yBot.send({ t: 'yt', a: 'roll' });
        else {
          const mine = st.cols.find((c) => c.id === st.you);
          yBot.send({ t: 'yt', a: 'score', cat: CATS.find((c) => mine.scores[c] == null) });
        }
      }, 700);
    });
    const yEvent = (pred, label) => { const q = yBot.waitMsg((m) => m.t === 'event' && pred(m.e), T, label); q.catch(() => {}); return q; };
    const ytBarOnTop = async (state) => {
      await page.waitForTimeout(150);
      const bad = await page.evaluate(() => [...document.querySelectorAll('.rm-bar .rm-btn, .wr-root button')].filter((el) => !el.hidden && el.offsetParent !== null).filter((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(top && (top === el || el.contains(top)));
      }).map((el) => el.textContent));
      check(`yacht top bar on top: ${state}`, bad.length === 0, bad.join(','));
    };
    await step('yacht: lobby shows 요트다이스 as a game choice', async () => {
      await visible('.lb-seg-item:has-text("요트다이스")');
    });
    await step('yacht: pick 요트다이스, create a room → common waiting room; the bot joins and 게임 시작 is enabled', async () => {
      await press('.lb-seg-item:has-text("요트다이스")');
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-start"]');
      const r = await openRoom('yacht');
      await yBot.join(r.code);
      await page.waitForFunction(() => { const b = document.querySelector('[data-rm="wait-start"]'); return b && !b.disabled; }, null, { timeout: T });
    });
    await step('yacht: a 관전N account joins → waiting room shows "관전 1/4" apart from players; host × kicks it', async () => {
      const sBot = new Bot(server.url, `관전${String(Date.now()).slice(-7)}${cfg.touch ? 2 : 1}`, { autoplay: false });
      await sBot.connect();
      await sBot.login();
      await sBot.join(yBot.state.code);
      await visible('.wr-specs .lb-row');
      const cap = await page.evaluate(() => document.querySelector('.wr-speccap')?.textContent ?? '');
      if (cap !== '관전 1/4') throw new Error(`caption "${cap}"`);
      await press('.wr-specs [data-rm="wait-kick"]');
      await sBot.waitFor(() => sBot.state === null, T, 'spec kicked');
      await gone('.wr-specs .lb-row');
      sBot.close();
    });
    await ytBarOnTop('yacht room (waiting)');
    await occlusion('yacht room (waiting)');
    await step('yacht: lobby hidden inside the room, old top bars gone', async () => {
      const r = await page.evaluate(() => ({ lobby: !!document.querySelector('.lb-root:not(.wr-root)') && !document.querySelector('.lb-root:not(.wr-root)').hidden, lg: !!document.querySelector('.lgbar, .ytbar, .gkbar') }));
      if (r.lobby || r.lg) throw new Error(`lobby=${r.lobby} liarBar=${r.lg}`);
    });
    await step('yacht: 시작 → my turn comes (cup button)', async () => {
      await press('[data-rm="wait-start"]');
      await visible('[data-yt="cup"]');
      await visible('[data-yt="sheet"]');
    });
    await ytBarOnTop('yacht my turn');
    await step('yacht: top bar starts at the right edge of the score sheet (--yt-sheet-w)', async () => {
      const r = await page.evaluate(() => ({ sheet: Math.round(document.querySelector('[data-yt="sheet"]').getBoundingClientRect().width), bar: Math.round(document.querySelector('.rm-bar').getBoundingClientRect().left) }));
      if (Math.abs(r.sheet - r.bar) > 2) throw new Error(`sheet ${r.sheet}px, bar left ${r.bar}px`);
    });
    await step('yacht: hold the cup and release → the bot receives ytRoll', async () => {
      const p = yEvent((e) => e.k === 'ytRoll', 'ytRoll event');
      const b = await loc('[data-yt="cup"]').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
      await p;
      await visible('[data-yt="die-0"]');
    });
    await step('yacht: tap a die → the bot receives ytKeep and the die sits in slot-0', async () => {
      const p = yEvent((e) => e.k === 'ytKeep', 'ytKeep event');
      await press('[data-yt="die-0"]');
      await p;
      await visible('[data-yt="slot-0"][data-v]');
    });
    await ytBarOnTop('yacht after rolling');
    await occlusion('yacht after rolling');
    let cat = '';
    await step('yacht: first press on a row → ytPick only; second press → ytScore', async () => {
      const row = loc('[data-yt^="row-"]');
      await row.first().waitFor({ state: 'visible', timeout: 8000 });
      cat = (await row.first().getAttribute('data-yt')).slice(4);
      const h = (await row.first().boundingBox()).height;
      if (h < 44) throw new Error(`row height ${h}px < 44`);
      const pick = yEvent((e) => e.k === 'ytPick' && e.cat === cat, 'ytPick event');
      const from = yBot.messages.length;
      await row.first().click();
      await pick;
      await page.waitForTimeout(400);
      if (yBot.messages.slice(from).some((m) => m.t === 'event' && m.e.k === 'ytScore')) throw new Error('ytScore after a single press');
      await page.locator(`[data-yt="row-${cat}"][aria-pressed="true"]`).waitFor({ state: 'visible', timeout: T });
      const sc = yEvent((e) => e.k === 'ytScore' && e.cat === cat, 'ytScore event');
      await page.locator(`[data-yt="row-${cat}"]`).click();
      await sc;
    });
    await step('yacht: 390x844 shows #rotate over the cup, back to landscape hides it', async () => {
      // (the turn already passed to the bot after the score, so only the rotate overlay is checked here)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      const shown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none' && document.elementFromPoint(195, 420)?.closest('#rotate') != null);
      if (!shown) throw new Error('#rotate does not cover the portrait screen');
      await page.setViewportSize(cfg.viewport);
      await page.waitForTimeout(200);
      const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'none');
      if (!hidden) throw new Error('#rotate still visible in landscape');
    });
    await step('yacht: on the bot\'s turn I have no cup / row buttons', async () => {
      await page.waitForFunction(() => /차례/.test(document.querySelector('[data-yt="turn"]')?.textContent || '') && !/내 차례/.test(document.querySelector('[data-yt="turn"]')?.textContent || ''), null, { timeout: T }).catch(() => {});
      const n = await page.locator('[data-yt="cup"], [data-yt^="row-"]').count();
      if (n) throw new Error(`${n} buttons on the bot's turn`);
    });
    await ytBarOnTop('yacht bot turn');
    await occlusion('yacht bot turn');
    await step('yacht: sound button toggles', async () => {
      const before = await loc('[data-rm="bar-sound"]').getAttribute('aria-label');
      await press('[data-rm="bar-sound"]');
      const after = await loc('[data-rm="bar-sound"]').getAttribute('aria-label');
      if (before === after) throw new Error('label did not change');
      await press('[data-rm="bar-sound"]');
    });
    await step('yacht: 나가기 mid-game asks first ("나가면 기권 처리돼요"), 취소 keeps me in, 나가기 returns to the lobby', async () => {
      await press('[data-rm="bar-leave"]');
      await visible('.ui-confirm:has-text("나가면 기권 처리돼요")');
      await press('.ui-mbtn:has-text("취소")');
      await visible('[data-yt="sheet"]');
      await press('[data-rm="bar-leave"]');
      await press('.ui-mbtn.ui-danger');
      await visible('button:has-text("방 만들기")');
      await gone('.rm-bar:not([hidden])');
      await page.waitForFunction(() => document.querySelector('.yt-root')?.hidden !== false);
    });
    yBot.close();
    if (!busted) {
      await step('poker still works after yacht: create a hold\'em room', async () => {
        await press('.lb-seg-item:has-text("홀덤")');
        await press('button.lb-primary:has-text("방 만들기")');
        await visible('[data-rm="wait-leave"]');
      });
      await step('poker after yacht: leave the room', async () => {
        await press('[data-rm="wait-leave"]');
        await visible('button:has-text("방 만들기")');
      });
    }

    /* ---------- draw game 갱식마인드 (server DRAW=test, page ?draw=1) ---------- */
    await step('draw: lobby shows the 갱식마인드 choice with its caption', async () => {
      await press('.lb-seg-item:has-text("갱식마인드")');
      await page.waitForSelector('.lb-cap:has-text("2~8명 · 그림 보고 단어 맞히기")', { state: 'attached', timeout: T }); // phone landscape hides the caption by design
    });
    await occlusion('home lobby (draw on)');
    await step('draw: create a room → common waiting room (room code, settings, start button)', async () => {
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-code"]');
      await visible('[data-rm="wait-start"]');
      await visible('.wr-opt:has-text("맞힌 사람")');
    });
    await occlusion('draw room (waiting)');
    await step('draw: lobby and poker/liar parts are hidden inside the draw room', async () => {
      const r = await page.evaluate(() => ({ lobby: !!document.querySelector('.lb-root:not(.wr-root)') && !document.querySelector('.lb-root:not(.wr-root)').hidden, chatBtn: !!document.querySelector('.chat-btn') && !document.querySelector('.chat-btn').hidden }));
      if (r.lobby) throw new Error('lobby is visible in the draw room');
      if (r.chatBtn) throw new Error('site chat button is visible in the draw room');
    });
    await step('draw: pick an order option (출제 순서) and it turns on', async () => {
      await press('.wr-opt:has-text("맞힌 사람")');
      await page.waitForFunction(() => [...document.querySelectorAll('.wr-opt')].some((b) => b.textContent === '맞힌 사람' && b.getAttribute('aria-checked') === 'true'), null, { timeout: T });
    });
    await step('draw: waiting-room chat works, and a 41+ character line is stopped at 40 in the input', async () => {
      const inp = loc('.wr-chat .chat-in');
      await inp.fill('가'.repeat(60));
      const n = await inp.evaluate((e) => [...e.value].length);
      if (n !== 40) throw new Error(`input kept ${n} characters`);
      await inp.fill('hello-draw-wait');
      await inp.press('Enter');
      await visible('.wr-chat .chat-row:has-text("hello-draw-wait")');
    });
    await step('draw: 나가기 in the waiting room returns to the lobby', async () => {
      await press('[data-rm="wait-leave"]');
      await visible('button:has-text("방 만들기")');
      await gone('.dr-root');
    });

    /* ---------- gsk game 갱스껄 (server GSK=test, page ?gsk=1) ---------- */
    await step('gsk: lobby shows the 갱스껄 choice with its caption', async () => {
      await press('.lb-seg-item:has-text("갱스껄")');
      await page.waitForSelector('.lb-cap:has-text("3~6명 · 해골을 피해 꽃 뒤집기")', { state: 'attached', timeout: T });
    });
    await step('gsk: create a room → common waiting room (code, 내 색 고르기); 시작은 대기실 버튼 하나뿐', async () => {
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-start"]');
      await page.waitForFunction(() => /[A-Z0-9]{4,}/.test(document.querySelector('[data-rm="wait-code"] b')?.textContent ?? ''), null, { timeout: T });
      const own = await page.evaluate(() => ({ gkStart: !!document.querySelector('[data-gk="start"]'), gkbar: !!document.querySelector('.gkbar:not([hidden])') }));
      if (own.gkStart || own.gkbar) throw new Error(`old start/bar left: ${JSON.stringify(own)}`);
    });
    await step('gsk: in the waiting room, color-0 shows and can be pressed (pick) → my row gets the color dot', async () => {
      await visible('[data-gk="color-0"]');
      await press('[data-gk="color-0"]');
      await page.waitForFunction(() => !!document.querySelector('.wr-players .wr-dot'), null, { timeout: T });
    });
    await step('gsk: 시작 버튼은 3명 전에는 꺼져 있다. 원판 내기·도전 버튼(choose-place)은 3명 판이 필요해 gsk-round.mjs 가 본다', async () => {
      await page.waitForFunction(() => document.querySelector('[data-rm="wait-start"]')?.disabled === true, null, { timeout: T });
    });
    await step('gsk: 나가기 (대기실은 확인 없이) returns to the lobby', async () => {
      await press('[data-rm="wait-leave"]');
      await visible('button:has-text("방 만들기")');
      await gone('.wr-root:not([hidden])');
    });
    /* ---------- mini games 미니게임 (server MINI default on) ---------- */
    const mBot = new Bot(server.url, uid('mb'), { autoplay: false });
    await mBot.connect();
    await mBot.login();
    const mState = () => mBot.state;
    await step('mini: lobby shows 미니게임 with the five-game picker', async () => {
      await press('.lb-seg-item:has-text("미니게임")');
      for (const g of ['오목', '리버시', '체커', '체스', '커넥트포']) await visible(`.lb-mini-item:has-text("${g}")`);
    });
    await step('mini: pick 커넥트포, create a room → common waiting room lists the host, the room list names the game', async () => {
      await press('.lb-mini-item:has-text("커넥트포")');
      await press('button.lb-primary:has-text("방 만들기")');
      await visible('[data-rm="wait-start"]');
      const r = await openRoom('mini');
      if (r.game !== 'connect4') throw new Error(`room list game=${r.game}`);
      await mBot.join(r.code);
      await page.waitForFunction(() => { const b = document.querySelector('[data-rm="wait-start"]'); return b && !b.disabled; }, null, { timeout: T });
      await visible('.wr-root :text("커넥트포")');
    });
    await occlusion('mini room (waiting)');
    await step('mini: the host switches the game to 체스 in the waiting room (set), then back to 커넥트포', async () => {
      await press('.wr-root .lb-seg-item:has-text("체스")');
      await mBot.waitFor((b) => b.state?.game === 'chess', T, 'game chess');
      await press('.wr-root .lb-seg-item:has-text("커넥트포")');
      await mBot.waitFor((b) => b.state?.game === 'connect4', T, 'game connect4');
    });
    await step('mini: 승부 방식 3판 2선승 → 단판 (set); the 코인 베팅 panel shows', async () => {
      await press('.wr-root .lb-seg-item:has-text("3판 2선승")');
      await mBot.waitFor((b) => b.state?.wait?.set?.len === 3, T, 'len 3');
      await press('.wr-root .lb-seg-item:has-text("단판")');
      await mBot.waitFor((b) => b.state?.wait?.set?.len === 1, T, 'len 1');
      await visible('[data-mn="bet-input"]');
    });
    await step('mini: 베팅 + makes the bets differ (start blocked with the reason), 상대 베팅에 맞추기 equalises, back to 0', async () => {
      const host = () => mState().hostId; // the page user created the room
      const betOf = (b, id) => b.state?.wait?.own?.[id]?.bet;
      await press('[data-mn="bet-plus"]');
      await mBot.waitFor((b) => betOf(b, b.state.hostId) === 1, T, 'host bet 1');
      await page.waitForFunction(() => document.querySelector('[data-rm="wait-start"]')?.disabled, null, { timeout: T });
      await visible('.wr-why:has-text("서로 달라요")');
      mBot.send({ t: 'pick', patch: { bet: 2 } });
      await mBot.waitFor((b) => betOf(b, b.id) === 2, T, 'bot bet 2');
      await press('[data-mn="bet-match"]');
      await mBot.waitFor((b) => betOf(b, b.state.hostId) === 2, T, 'matched to 2');
      await page.waitForFunction(() => !document.querySelector('[data-rm="wait-start"]')?.disabled, null, { timeout: T });
      mBot.send({ t: 'pick', patch: { bet: 0 } });
      await mBot.waitFor((b) => betOf(b, b.id) === 0, T, 'bot bet 0');
      await press('[data-mn="bet-match"]');
      await mBot.waitFor((b) => betOf(b, host()) === 0, T, 'host back to 0');
    });
    await step('mini: 시작 → board shows, status says whose turn', async () => {
      await press('[data-rm="wait-start"]');
      await mBot.waitFor((b) => b.state?.phase === 'play', T, 'play phase');
      await visible('.mn-board');
      await page.waitForFunction(() => /차례/.test(document.querySelector('[data-mn="status"]')?.textContent || ''), null, { timeout: T });
    });
    await step('mini: 기권 asks with the common confirm box (not the browser one); 취소 keeps playing', async () => {
      await press('[data-mn="resign"]');
      await visible('.ui-confirm');
      await press('.ui-mbtn:has-text("취소")');
      if (mState().phase !== 'play') throw new Error('cancelled resign ended the game');
    });
    await step('mini: both players drop four stones in a column → result text shows 승리', async () => {
      const bs = () => mState();
      const count = (st) => st.mn.board.reduce((n, row) => n + row.filter((v) => v != null).length, 0);
      for (let i = 0; i < 7; i++) {
        const st = bs();
        const n = count(st);
        const botTurn = st.mn.turn === st.mySeat;
        const x = st.mn.turn === 0 ? 0 : 1; // seat 0 stacks column 0, seat 1 plays column 1
        if (botTurn) mBot.send({ t: 'mn', a: 'move', move: { x } });
        else await press(`.mn-board .mn-hit[data-x="${x}"]`);
        await mBot.waitFor((b) => count(b.state) === n + 1 || b.state.phase === 'end', T, `stone ${i + 1}`);
      }
      await mBot.waitFor((b) => b.state?.phase === 'end', T, 'end phase');
      await visible('[data-rm="result"]');
      await page.waitForFunction(() => /승리/.test(document.querySelector('.rm-rs-title')?.textContent || ''), null, { timeout: T });
    });
    await step('mini: common result shows both players and their coins, 대기실로 → wait room → 게임 시작 again (host)', async () => {
      const rows = await page.locator('[data-rm="result"] .rm-rs-row').count();
      if (rows !== 2) throw new Error(`result rows ${rows}`);
      await visible('[data-rm="result"] .rm-rs-top .rm-rs-gain');
      await press('[data-rm="result-wait"]');
      await visible('[data-rm="wait-start"]');
      await press('[data-rm="wait-start"]');
      await mBot.waitFor((b) => b.state?.phase === 'play', T, 'second play phase');
      await visible('.mn-board');
    });
    await step('mini: 다시 시작 from the common result starts a new match at once', async () => {
      await press('[data-mn="resign"]');
      await press('.ui-mbtn.ui-danger');
      await mBot.waitFor((b) => b.state?.phase === 'end', T, 'end by resign');
      await visible('[data-rm="result-again"]');
      await press('[data-rm="result-again"]');
      await mBot.waitFor((b) => b.state?.phase === 'play', T, 'third play phase');
      await gone('[data-rm="result"]');
    });
    await step('mini: 나가기 mid-game asks ("나가면 기권 처리돼요"), then returns to the lobby', async () => {
      await press('[data-rm="bar-leave"]');
      await visible('.ui-confirm:has-text("나가면 기권 처리돼요")');
      await press('.ui-mbtn.ui-danger');
      await visible('button:has-text("방 만들기")');
      await gone('.rm-bar:not([hidden])');
      await page.waitForFunction(() => !document.querySelector('.mn-root'));
    });
    mBot.close();
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
  server = await startServer({ LIAR: 'on', YACHT: 'on', DRAW: 'test', GSK: 'test', ROOM_LIST_MS: '100', RESULT_MS: '60', RESULT_FOLD_MS: '60', STREET_MS: '30', REVEAL_MS: '80' });
  browser = await chromium.launch();
  for (const [name, cfg] of Object.entries(CONTEXTS)) await runContext(browser, server, name, cfg);
} catch (e) {
  results.push({ ctx: '-', what: 'setup', ok: false, detail: String(e.stack || e) });
  console.log(`FAIL setup - ${e.message || e}`);
} finally {
  await browser?.close().catch(() => {});
  await server?.stop().catch(() => {});
}
/* ---------- LIAR switch: off hides everything, test only with ?liar=1 ---------- */
async function gateCheck(browser, env, query, expectVisible, label, expectDraw = false, expectGsk = false) {
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
    const seen = await page.evaluate(() => ({ rank: !!document.querySelector('.lb-rank-btn') && !document.querySelector('.lb-rank-btn').hidden && document.querySelector('.lb-rank-btn').offsetParent !== null, pick: [...document.querySelectorAll('.lb-seg-item')].some((e) => e.textContent.includes('라이어게임') && e.offsetParent !== null), draw: [...document.querySelectorAll('.lb-seg-item')].some((e) => e.textContent.includes('갱식마인드') && e.offsetParent !== null), gsk: [...document.querySelectorAll('.lb-seg-item')].some((e) => e.textContent.includes('갱스껄') && e.offsetParent !== null) }));
    ok = seen.rank === expectVisible && seen.pick === expectVisible && seen.draw === expectDraw && seen.gsk === expectGsk && errors.length === 0;
    detail = JSON.stringify({ ...seen, errors });
  } catch (e) { detail = String(e.message || e).split('\n')[0]; }
  results.push({ ctx: 'gate', what: label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [gate] ${label}${detail ? ` - ${detail}` : ''}`);
  await ctx.close().catch(() => {});
  await srv.stop().catch(() => {});
}
try {
  const gb = await chromium.launch();
  await gateCheck(gb, { GSK: 'off', LIAR: 'off', DRAW: 'off' }, '', false, 'LIAR=off: no 라이어 choice, no 랭킹 button');
  await gateCheck(gb, { GSK: 'off', DRAW: 'off' }, '', true, 'LIAR unset (default on): visible');
  await gateCheck(gb, { GSK: 'off', LIAR: 'test', DRAW: 'off' }, '', false, 'LIAR=test without ?liar=1: hidden');
  await gateCheck(gb, { GSK: 'off', LIAR: 'test', DRAW: 'off' }, '&liar=1', true, 'LIAR=test with ?liar=1: visible');
  await gateCheck(gb, { GSK: 'off', LIAR: 'off', DRAW: 'off' }, '&draw=1', false, 'DRAW=off: no 갱식마인드 choice');
  await gateCheck(gb, { GSK: 'off', LIAR: 'off' }, '', false, 'DRAW unset (default on): 갱식마인드 visible', true);
  await gateCheck(gb, { GSK: 'off', LIAR: 'off', DRAW: 'test' }, '', false, 'DRAW=test without ?draw=1: hidden');
  await gateCheck(gb, { GSK: 'off', LIAR: 'off', DRAW: 'test' }, '&draw=1', false, 'DRAW=test with ?draw=1: visible', true);
  await gateCheck(gb, { LIAR: 'off', DRAW: 'off', GSK: 'off' }, '&gsk=1', false, 'GSK=off: no 갱스껄 choice');
  await gateCheck(gb, { LIAR: 'off', DRAW: 'off', GSK: 'test' }, '', false, 'GSK=test without ?gsk=1: hidden');
  await gateCheck(gb, { LIAR: 'off', DRAW: 'off', GSK: 'test' }, '&gsk=1', false, 'GSK=test with ?gsk=1: visible', false, true);
  await gateCheck(gb, { LIAR: 'off', DRAW: 'off' }, '', false, 'GSK unset (default on): visible for everyone', false, true);
  await gateCheck(gb, { LIAR: 'off', DRAW: 'off', GSK: 'on' }, '', false, 'GSK=on: visible for everyone', false, true);
  await gb.close();
} catch (e) {
  results.push({ ctx: 'gate', what: 'gate setup', ok: false, detail: String(e.message || e) });
  console.log(`FAIL gate setup - ${e.message || e}`);
}
/* ---------- YACHT switch: off hides the choice, test only with ?yacht=1 ---------- */
async function yachtGate(browser, env, query, expectVisible, label) {
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
    await page.fill('.lb-field', uid('yg'));
    await page.click('button.lb-primary:has-text("입장")');
    await page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    await page.waitForTimeout(300);
    const pick = await page.evaluate(() => [...document.querySelectorAll('.lb-seg-item')].some((e) => e.textContent.includes('요트다이스') && e.offsetParent !== null));
    ok = pick === expectVisible && errors.length === 0;
    detail = JSON.stringify({ pick, errors });
  } catch (e) { detail = String(e.message || e).split('\n')[0]; }
  results.push({ ctx: 'gate', what: label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [gate] ${label}${detail ? ` - ${detail}` : ''}`);
  await ctx.close().catch(() => {});
  await srv.stop().catch(() => {});
}
try {
  const yb = await chromium.launch();
  await yachtGate(yb, { YACHT: 'off' }, '', false, 'YACHT=off: no 요트다이스 choice');
  await yachtGate(yb, { YACHT: 'test' }, '', false, 'YACHT=test without ?yacht=1: hidden');
  await yachtGate(yb, { YACHT: 'test' }, '&yacht=1', true, 'YACHT=test with ?yacht=1: visible');
  await yb.close();
} catch (e) {
  results.push({ ctx: 'gate', what: 'yacht gate setup', ok: false, detail: String(e.message || e) });
  console.log(`FAIL yacht gate setup - ${e.message || e}`);
}
/* ---------- ADMIN (SPEC 21): normal users see no .adm- element; 관리자 + 9975 gets the panel ---------- */
async function adminCheck(browser) {
  const srv = await startServer({ ROOM_LIST_MS: '100' });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(T);
    return { ctx, page };
  };
  const rep = (what, ok, detail = '') => {
    results.push({ ctx: 'admin', what, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} [admin] ${what}${detail ? ` - ${detail}` : ''}`);
  };
  const a = await mk();
  const b = await mk();
  try {
    await a.page.goto(`${srv.http}/?nogl=1`);
    await a.page.fill('.lb-field', uid('nu'));
    await a.page.click('button.lb-primary:has-text("입장")');
    await a.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
    await a.page.waitForTimeout(500);
    const n = await a.page.evaluate(() => document.querySelectorAll('[class*="adm-"]').length);
    rep('normal user: no .adm- element', n === 0, `${n} found`);

    await b.page.goto(`${srv.http}/?nogl=1`);
    await b.page.fill('.lb-field', '관리자');
    await b.page.waitForSelector('input[type=password]', { state: 'visible' });
    rep('login screen shows password field for 관리자', true);
    await b.page.fill('input[type=password]', '9975');
    await b.page.click('button.lb-primary:has-text("입장")');
    const got = await b.page.waitForSelector('.adm-toggle', { state: 'visible', timeout: 3000 }).then(() => true, () => false);
    if (!got) {
      rep('admin login shows the 관리자 button', false, 'me.admin never arrived within 3s');
    } else {
      await b.page.click('.adm-toggle');
      await b.page.waitForSelector('.adm-panel', { state: 'visible' });
      rep('admin panel opens with 닫기', await b.page.locator('.adm-close').isVisible());
      const roomBtnsHidden = await b.page.evaluate(() => [...document.querySelectorAll('.adm-row .adm-btn')].filter((x) => /봇|단계/.test(x.textContent)).every((x) => x.hidden));
      rep('in lobby the bot/skip buttons are hidden', roomBtnsHidden);
      // 세부 설정(SPEC 21-7): 열면 게임별 코인 칸이 서버 값으로 채워지고, 닫을 수 있다
      await b.page.click('.adm-open-detail');
      await b.page.waitForSelector('.adm-detail .adm-game', { state: 'visible', timeout: 4000 });
      const games = await b.page.locator('.adm-detail .adm-game').count();
      rep('세부 설정 shows per-game coin rows + 상점 note', games >= 6 && (await b.page.locator('.adm-note').innerText()).includes('상점 가격'), `${games} rows`);
      await b.page.click('.adm-dclose');
      await b.page.waitForSelector('.adm-detail', { state: 'hidden' });
      await b.page.click('.adm-close');
      await b.page.waitForSelector('button:has-text("방 만들기")', { state: 'visible' });
      await b.page.click('button.lb-primary:has-text("방 만들기")');
      await b.page.waitForSelector('.lb-actions .lb-danger', { state: 'visible' });
      await b.page.click('.adm-toggle');
      await b.page.click('.adm-row .adm-btn:has-text("봇 추가")');
      await b.page.waitForFunction(() => /봇 \d+명/.test(document.querySelector('.adm-status')?.textContent || ''), null, { timeout: 4000 });
      rep('봇 추가 shows 봇 N명', true);
      await b.page.click('.adm-row .adm-btn:has-text("봇 빼기")');
      await b.page.waitForFunction(() => /봇 0명/.test(document.querySelector('.adm-status')?.textContent || ''), null, { timeout: 4000 });
      rep('봇 빼기 shows 봇 0명', true);
      await b.page.click('.adm-row .adm-btn:has-text("단계 건너뛰기")');
      await b.page.waitForFunction(() => (document.querySelector('.adm-status')?.textContent || '').includes('건너뛸 단계가 없습니다.'), null, { timeout: 4000 });
      rep('단계 건너뛰기 in a fresh lobby says nothing to skip', true);
      await b.page.click('.adm-fx:has-text("화면 번쩍")');
      await b.page.waitForSelector('[data-admin-fx]', { state: 'attached', timeout: 2000 }).catch(() => {});
      await b.page.waitForSelector('[data-admin-fx]', { state: 'detached', timeout: 4000 });
      await b.page.click('.adm-close');
      await b.page.locator('.lb-actions .lb-danger').click({ trial: true, timeout: 3000 });
      rep('연출 button ends, no [data-admin-fx] left, game button still clickable', true);
      await b.page.reload();
      await b.page.waitForSelector('.adm-toggle', { state: 'visible', timeout: 4000 });
      rep('reload re-logs in with the remembered password', true);
    }
  } catch (e) {
    rep('admin check', false, String(e.message || e).split('\n')[0]);
  }
  await a.ctx.close().catch(() => {});
  await b.ctx.close().catch(() => {});
  await srv.stop().catch(() => {});
}
try {
  const ab = await chromium.launch();
  await adminCheck(ab);
  await ab.close();
} catch (e) {
  results.push({ ctx: 'admin', what: 'admin setup', ok: false, detail: String(e.message || e) });
  console.log(`FAIL admin setup - ${e.message || e}`);
}
/* ---------- COIN (SPEC 22): balance, swap, draw, shop, rank, PIN login, reset sheet ---------- */
async function coinCheck(browser) {
  const srv = await startServer({ ROOM_LIST_MS: '100', COIN_SEED: '500' });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  const rep = (what, ok, detail = '') => {
    results.push({ ctx: 'coin', what, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} [coin] ${what}${detail ? ` - ${detail}` : ''}`);
  };
  const step = async (what, fn) => {
    try { await fn(); rep(what, true); } catch (e) { rep(what, false, String(e.message || e).split('\n')[0]); throw new StepFailed(what); }
  };
  const coinsNow = () => page.evaluate(() => Number((document.querySelector('.lb-coins')?.textContent || '').replace(/[^\d]/g, '')));
  const waitCoins = (pred, label) => page.waitForFunction(`(${pred})(Number((document.querySelector('.lb-coins')?.textContent || '').replace(/[^\\d]/g, '')))`, null, { timeout: T }).catch(() => { throw new Error(label); });
  const id = uid('cn');
  const enter = async (pin) => {
    await page.fill('.lb-field >> nth=0', id);
    if (pin) { await page.fill('input[placeholder="비밀번호 4자리"]', pin); }
    await page.click('button.lb-primary:has-text("입장")');
  };
  try {
    await page.goto(`${srv.http}/?nogl=1`);
    await step('reset sheet has the admin password field', async () => {
      await page.fill('.lb-field >> nth=0', '초기화');
      await page.click('button.lb-primary:has-text("입장")');
      await visible2(page, '.lb-reset-pw');
      await page.fill('.lb-reset-pw', '0000');
      await page.click('.lb-sheet-btns .lb-danger');
      await page.waitForFunction(() => (document.querySelector('.lb-reset-err')?.textContent || '').length > 0, null, { timeout: T });
      await page.click('.lb-sheet-btns button:has-text("취소")');
    });
    await step('login with a new PIN (비밀번호 설정)', async () => {
      await page.fill('.lb-field >> nth=0', id);
      await page.check('.lb-pin-chk');
      await page.fill('input[placeholder="새 비밀번호 4자리"]', '1234');
      await page.click('button.lb-primary:has-text("입장")');
      await visible2(page, 'button:has-text("방 만들기")');
    });
    await step('coin balance is shown (500)', async () => { await waitCoins('(n) => n === 500', 'balance not 500'); });
    await step('swap window: 3 coins -> chips', async () => {
      await page.click('.lb-coin-btn:has-text("상점")'); // 교환·뽑기는 상점 안에서만 (2026-11-13)
      await visible2(page, '.sh-panel');
      await page.click('.sh-swap:has-text("칩 교환")');
      await visible2(page, '.cn-field');
      await page.fill('.cn-field', '3');
      await page.click('.cn-btn.cn-primary:has-text("바꾸기")');
      await page.waitForSelector('.cn-msg.cn-ok', { timeout: T });
      await page.click('.cn-sheet .cn-btns button');
      await page.click('.sh-close');
      await waitCoins('(n) => n === 497', 'balance not 497');
    });
    await step('draw 1 with skip, then 10', async () => {
      await page.click('.lb-coin-btn:has-text("상점")');
      await page.click('.sh-swap:has-text("카드 뽑기")');
      await visible2(page, '.gc-panel');
      await page.click('.gc-btn:has-text("1회")');
      await page.waitForFunction(() => document.querySelector('.gc-panel')?.dataset.mode !== 'idle', null, { timeout: T });
      await page.click('.gc-btn-skip', { timeout: 2500 }).catch(() => {}); // skip while it plays (if it already ended, fine)
      await page.waitForSelector('.gc-panel[data-mode="done"]', { timeout: T });
      await page.waitForTimeout(450); // the window ignores clicks for 0.35 s after a draw
      await page.click('.gc-btn:has-text("10연") >> visible=true');
      await page.waitForFunction(() => document.querySelector('.gc-panel')?.dataset.mode !== 'done', null, { timeout: T });
      await page.click('.gc-btn-skip', { timeout: 2500 }).catch(() => {});
      await page.waitForSelector('.gc-panel[data-mode="done"]', { timeout: T });
      await page.click('.gc-btn:has-text("닫기")');
      await waitCoins('(n) => n === 442', 'balance not 442 after 11 pulls');
    });
    await step('capsule: title draw 1', async () => {
      await page.click('.lb-coin-btn:has-text("상점")');
      await page.click('.sh-swap:has-text("칭호 뽑기")');
      await visible2(page, '.cp-sheet');
      await page.click('.cp-sheet .cn-primary >> nth=0');
      await page.waitForSelector('.cp-row', { timeout: T });
      await page.keyboard.press('Escape');
    });
    await step('shop: buy then equip', async () => {
      await page.click('.lb-coin-btn:has-text("상점")');
      await visible2(page, '.sh-panel');
      await visible2(page, '.sh-row[data-row="a"] .sh-timer'); // SPEC 22-18: two stock rows with a countdown
      await page.click('.sh-card >> nth=0 >> .sh-act.sh-buy'); // first card of the stock: price button, pressed twice to buy
      await page.click('.sh-card >> nth=0 >> .sh-act.sh-sure');
      await page.waitForFunction(() => /샀습니다/.test(document.querySelector('.sh-msg')?.textContent || ''), null, { timeout: T });
      await page.click('.sh-card >> nth=0 >> .sh-act:has-text("끼기")');
      await page.waitForFunction(() => /꼈습니다/.test(document.querySelector('.sh-msg')?.textContent || ''), null, { timeout: T });
      if (!(await page.locator('.sh-card.sh-worn .sh-stamp').count())) throw new Error('no 착용 중 stamp');
      if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 || document.querySelector('.sh-rows').getBoundingClientRect().bottom > innerHeight)) throw new Error('shop overflows the phone screen');
      await page.click('.sh-swap'); // [칩 교환] opens the swap window over the shop
      await visible2(page, '.cn-field');
      await page.click('.cn-sheet .cn-btns button');
      await page.click('.sh-close');
    });
    await step('coin rank opens', async () => {
      await page.click('.lb-coin-btn:has-text("코인 랭킹")');
      await visible2(page, '.cn-mine');
      await page.click('.cn-sheet .cn-btns button');
    });
    await step('PIN window shows it is set', async () => {
      await page.click('.lb-pin-btn');
      await visible2(page, '.pn-panel');
      await page.waitForFunction(() => /걸려 있습니다/.test(document.querySelector('.pn-body')?.textContent || ''), null, { timeout: T });
      await page.click('.pn-close');
    });
    await step('logout, login without PIN asks for it, wrong PIN refused, right PIN enters', async () => {
      await page.click('button:has-text("로그아웃")');
      await visible2(page, '.lb-field');
      await page.fill('.lb-field >> nth=0', id);
      await page.click('button.lb-primary:has-text("입장")');
      await visible2(page, 'input[placeholder="비밀번호 4자리"]');
      await page.fill('input[placeholder="비밀번호 4자리"]', '9999');
      await page.click('button.lb-primary:has-text("입장")');
      await page.waitForFunction(() => /틀렸/.test(document.body.textContent || ''), null, { timeout: T });
      await page.fill('input[placeholder="비밀번호 4자리"]', '1234');
      await page.click('button.lb-primary:has-text("입장")');
      await visible2(page, 'button:has-text("방 만들기")');
    });
    await step('reload logs in again with the device token (no PIN prompt)', async () => {
      await page.reload();
      await visible2(page, 'button:has-text("방 만들기")');
    });
  } catch (e) {
    if (!(e instanceof StepFailed)) rep('coin check', false, String(e.message || e).split('\n')[0]);
  }
  rep('coin: no pageerror / console error', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close().catch(() => {});
  await srv.stop().catch(() => {});
}
const visible2 = (page, sel) => page.waitForSelector(sel, { state: 'visible', timeout: T });
try {
  const cb = await chromium.launch();
  await coinCheck(cb);
  await cb.close();
} catch (e) {
  results.push({ ctx: 'coin', what: 'coin setup', ok: false, detail: String(e.message || e) });
  console.log(`FAIL coin setup - ${e.message || e}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  [${f.ctx}] ${f.what}${f.detail ? ` - ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
