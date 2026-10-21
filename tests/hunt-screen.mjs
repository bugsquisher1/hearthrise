#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-screen.mjs — THE HUNT SCREEN'S PANEL RULES, IN A REAL CHROMIUM.
//
//   node tests/hunt-screen.mjs                the rules
//   node tests/hunt-screen.mjs --mutate       every planted defect must turn a rule RED
//   node tests/hunt-screen.mjs --shots <dir>  also write the visual-gate screenshots
//                                             (1440x900 and 922x423)
//
// mutant-anchors: src/session/character-session.js src/session/hunt-leave.js src/session/hunt-poll.js src/shell/windows/hunts.js src/shell/widgets/hunt-topbar.js src/render/paint.js src/shell/shell.js src/shell/widgets/ src/shell/windows/ src/session/hunt-sections.js src/data/combat-text.js src/data/condition-metrics.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character's envelope is tests/fixtures/hunt-envelope.json.
//   HS-1  a hunting character mounts the four hunt panels, zero console errors
//   HS-2  PATCH IN PLACE: a new envelope changes the numbers on the SAME nodes
//         (party rows, analyzer stats, bar slots), and an idle display tick
//         writes nothing to the DOM
//   HS-3  INTENT-ONLY EDITS: a stance press sends exactly one hr_action_set_options
//         with that option, turns the plaque's controls off at once, and the
//         pressed stance stays the server's until the re-read envelope says
//         otherwise; a refusal keeps the server's value and says why
//   HS-4  THE ANALYZER RENDERS ONLY SERVER DATA: its numbers are the section's;
//         an envelope without the section shows none; a free character sees
//         the basic rows, none of the premium ones and one quiet line; premium
//         sees every row (Tyler 2026-10-19)
//   HS-5  BADGE DEFAULTS: Settings shows the bleed count on bosses and off on
//         regular monsters; every other float type on for both
//   HS-6  the combat log (Chat, Combat tab) shows each server event once, even
//         when the next envelope restates the same events
//   HS-7  CONFIGURE ACTION: a bar slot opens it, centred, on that slot and its
//         tab; its metric picker is the registry (src/data/condition-metrics.js);
//         Save sends ONE intent with the whole bar; the slot's tooltip keeps the
//         server's setup until the re-read envelope; a refusal shows on its condition
//   HS-8  IN TOWN: the bar shows (no hunt vitals, a "+" on empty slots); an empty
//         slot is set to Any food (its store price shown, paid as used) IF My HP %
//         below 60 - ONE intent; the density step on the hunt picker answers on
//         the press (Tyler 10-20, "incredibly laggy"): four quick + presses show
//         the new number at once, marked Saving..., send ONE intent with the last
//         value, and the server's answer replaces it; the line's facts say the
//         pull size at the pick ("6 packs of 5"); a refused save shows the server's
//         value again and why; after a reload both come back
//   HS-9  the Hunts window follows the server's hunt: once the hero is hunting
//         it says so, never a stale "On the way to ..." (Tyler 10-19)
//   HS-10 a hunt that is over keeps only the way back to its summary: no Leave
//         hunt, no Hunt details; a running hunt shows Leave hunt
//   HS-11 A SLOT THAT NEVER FIRES: an earlier slot with the same action under
//         weaker conditions marks it "!" with the reason; emptying it clears that
//   HS-12 the bar carries no fight controls; Hunt settings no density, no gathering
//   HS-13 no two hunt panels overlap at 1440x900 or on a narrower desktop
//   HS-14 THE LEADER CHOOSES (Tyler 2026-10-20): a party member's hunt picker shows
//         the leader's density read-only ("Set by Fingerguns: 7 each", the server's
//         leader_density) with no step and sends nothing; the leader keeps its step
//   HS-15 LEAVE HUNT: the press answers at once ("Leaving…" beside the button, which is off, sent
//         once); a number shows within about a second (from the leave's own answer, the settle after
//         it still out): "Leaving in Ns" to the SERVER's leave_at on the server's clock (3 h ahead of
//         the device here), ticking, in gold label text >= 12 px; a reload keeps it; never 0 or below;
//         a hair after leave_at the hunt ends on screen (only Summary left)
//   HS-16 a leave past its leave_at reads "Leaving now…"; one still open a while later says it is
//         still being processed, the button stays off, and the close is still asked
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { pathToFileURL } from 'node:url';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
/* The scene and its log play huntPlaybackDelayMs behind the server (src/session/config.js): the fixture's
   window is stated that far in the past, so its events are due the moment it lands. */
FIXTURE.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/** A scripted server: `env` is what hr_load and hr-accrue answer (version bumped each call). */
function scripted() {
  const s = { env: clone(FIXTURE), version: 1, calls: [], optionsReply: { ok: true }, optionsDelayMs: 300 };
  /* `clock`: a server clock of the test's own (ms); each answer then states it as `now` and hunt_server_now_ms. */
  s.next = () => Object.assign(clone(s.env), { version: ++s.version },
    s.clock ? { now: new Date(s.clock()).toISOString(), hunt_server_now_ms: s.clock() } : {});
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    const name = url.split('?')[0].split('/').pop();
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') {
      const d = s.accrueDelay ? s.accrueDelay() : 0;
      if (d) await new Promise((ok) => setTimeout(ok, d));
      if (s.onAccrue) s.onAccrue();
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (name === 'hr_action_set_options') { await new Promise((ok) => setTimeout(ok, s.optionsDelayMs)); return json(s.optionsReply); }
    if (name === 'hr_hunt_leave' && s.onLeave) { await new Promise((ok) => setTimeout(ok, 400)); return json(s.onLeave()); }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base, town) {
  if (base) await page.goto(base + '/play.html', { waitUntil: 'load' });
  /* A reload keeps the signed-in session: the sign-in form, the character list or the World, whichever comes. */
  await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
  }
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  if (town) return wait(page, () => document.querySelector('.hb-bar') && document.querySelectorAll('.hb-slot[data-item]').length === 20);
  /* Mounted = the party lists both heroes and the analyzer (where the size class shows it) has its numbers. */
  return wait(page, () => document.querySelectorAll('.hp-m').length === 2 && (!document.querySelector('.ha-analyzer')
    || document.querySelector('.ha-stats dd[data-stat="kills"]').textContent !== ''));
}

/**
 * A new full envelope for the shown character, the way the live game gets one:
 * a pushed frame that skips a version makes the client re-read (hello), and
 * the scripted server answers with `s.env`. Resolves when it has been applied.
 */
async function pushEnvelope(page, s) {
  const frame = s.version + 2;
  s.version = frame;
  const before = s.calls.filter((c) => c.name === 'hr-accrue').length;
  await page.evaluate(([uid, f, st]) => window.__hub.send('hr:' + uid + ':0', { t: 'delta', frame: f, patch: { state: st } }), [UID, frame, s.env.state]);
  for (let i = 0; i < 60 && s.calls.filter((c) => c.name === 'hr-accrue').length <= before; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(200);
}

const FLOAT_IDS = ['dealt', 'taken', 'heal', 'xp', 'miss', 'supply', 'loot', 'ability', 'bleed_badge'];
const NODES = `({ row: document.querySelector('.hp-m[data-key="0"]'), kills: document.querySelector('[data-sec="totals"] dd[data-stat="kills"]'),
  slot: document.querySelector('.hb-slot[data-slot="3"]'), hp: document.querySelector('.hb-vital .is-hp .hh-gauge-text') })`;

async function checks(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted();
    if (o.prep) o.prep(s);
    /* In town: no hunt sections and no combat activity (the World's own "in a hunt" reads both). */
    if (o.town) {
      for (const k of ['hunt', 'party', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'hunt_server_now_ms']) delete s.env[k];
      s.env.state = Object.assign({}, s.env.state, { active_kind: null, active_id: null });
    }
    await stub(page, s);
    const up = await signInAndPlay(page, base, !!o.town);
    return { ctx, page, errors, s, up };
  };
  try {
    { // HS-1, HS-2, HS-4 numbers, HS-6
      const { ctx, page, errors, s, up } = await open();
      if (!up) fails.push('HS-1 the hunt panels did not mount for the fixture character' + (errors.length ? ' (' + errors.slice(0, 3).join(' | ') + ')' : ''));
      else {
        await page.evaluate((src) => { window.__nodes = (0, eval)(src); }, NODES);
        const a = FIXTURE.hunt_analyzer.hero;
        const got = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-sec="totals"] dd')).map((d) => [d.getAttribute('data-stat'), d.textContent])));
        const n = (v) => v.toLocaleString('en-US');
        const xpSum = Object.values(a.xp).reduce((x, y) => x + y, 0); /* the server sends XP per skill */
        const want = { kills: n(a.kills), xp: n(xpSum), gold: n(a.gold) + ' gp', waste: n(a.waste) + ' gp', balance: n(a.balance) + ' gp' };
        for (const k of Object.keys(want)) if (got[k] !== want[k]) fails.push('HS-4 analyzer ' + k + ' shows "' + got[k] + '"; the server sent ' + want[k]);
        /* Idle: display ticks with nothing new write nothing but the running session clocks. */
        const idle = await page.evaluate(async () => {
          const paint = await import('/src/render/paint.js?v=0.1.0');
          const before = paint.writes();
          await new Promise((ok) => setTimeout(ok, 1100));
          return paint.writes() - before;
        });
        if (idle > 6) fails.push('HS-2 idle display ticks wrote ' + idle + ' DOM changes; only the session clocks may move');
        /* A new envelope: the hero is hurt, the kills rise. The same nodes carry the new numbers. */
        s.env.party.members[0].hp = 90;
        s.env.hunt.hero.hp = 90;
        s.env.hunt_analyzer.hero.kills = 170;
        await pushEnvelope(page, s);
        const after = await page.evaluate((src) => {
          const now = (0, eval)(src);
          return { rebuilt: Object.keys(now).filter((k) => now[k] !== window.__nodes[k]), kills: now.kills && now.kills.textContent, hp: now.hp && now.hp.textContent };
        }, NODES);
        if (after.rebuilt.length) fails.push('HS-2 a new envelope rebuilt ' + after.rebuilt.join(', ') + ' instead of patching it');
        if (after.kills !== '170' || !/^HP 90 \//.test(String(after.hp))) fails.push('HS-2 the patched nodes did not take the new numbers (kills ' + after.kills + ', hp ' + after.hp + ')');
        /* HS-6: the log shows each fixture event once, after a restated envelope too. */
        await page.keyboard.press('Enter');
        await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-log'));
        await page.waitForTimeout(900);
        await pushEnvelope(page, s);
        await page.waitForTimeout(900);
        const lines = await page.evaluate(() => Array.from(document.querySelectorAll('.hc-line')).map((l) => l.getAttribute('data-key')));
        const ids = FIXTURE.hunt_events.map((e) => 'i:' + e.id);
        const missing = ids.filter((k) => !lines.includes(k));
        const dupes = lines.filter((k, i) => lines.indexOf(k) !== i);
        if (missing.length || dupes.length) fails.push('HS-6 combat log lines: missing [' + missing.join(',') + '] repeated [' + dupes.join(',') + ']');
        if (shots) {
          await page.screenshot({ path: join(shots, 'hunt-1440x900-log.png') });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(shots, 'hunt-1440x900.png') });
          await page.keyboard.press('j');
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(shots, 'hunt-1440x900-settings.png') });
        }
      }
      if (errors.length) fails.push('HS-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // HS-3 intent-only edits: confirmed, then refused
      const { ctx, page, s, up } = await open();
      if (up) {
        /* Target, stance and chase live in Hunt settings (J), not on the bar (Tyler 10-18). */
        await page.keyboard.press('j');
        await wait(page, () => document.querySelector('[data-hs-win="hunt-settings"] .he-form [data-opt="stance"]:not([disabled])'), null, 3000);
        const btn = '.he-form [data-opt="stance"][data-val="offensive"]';
        await page.click(btn);
        /* What the server says once it has saved: set after the press, so no re-read before it (the live
           view asks for its start point at once) can show the new stance early. */
        s.env.hunt_settings.stance = 'offensive';
        const mid = await page.evaluate((b) => ({ off: document.querySelector(b).disabled, pressed: document.querySelector(b).getAttribute('aria-pressed'),
          allOff: Array.from(document.querySelectorAll('.he-form [data-opt]')).every((c) => c.disabled) }), btn);
        if (!mid.off || !mid.allOff) fails.push('HS-3 the settings controls stayed on while the intent was in flight');
        if (mid.pressed !== 'false') fails.push('HS-3 the stance showed as chosen before the server confirmed it');
        const sent = s.calls.filter((c) => c.name === 'hr_action_set_options');
        if (sent.length !== 1 || JSON.stringify(sent[0].body.p_opts) !== '{"stance":"offensive"}' || sent[0].body.p_slot !== 0) fails.push('HS-3 the press sent ' + JSON.stringify(sent.map((c) => c.body)));
        const done = await wait(page, (b) => !document.querySelector(b).disabled && document.querySelector(b).getAttribute('aria-pressed') === 'true', btn, 3000);
        if (!done) fails.push('HS-3 after the server confirmed, the stance did not show the server’s new value');
        /* Refused: the server's value stays and the plaque says why. */
        s.optionsReply = { ok: false, error: 'bad_option' };
        const def = '.he-form [data-opt="stance"][data-val="defensive"]';
        await page.click(def);
        await page.waitForTimeout(100);
        const back = await wait(page, (b) => !document.querySelector(b).disabled, def, 3000);
        const r = await page.evaluate((b) => ({ pressed: document.querySelector(b).getAttribute('aria-pressed'), msg: document.querySelector('.he-form .hh-intent-msg').textContent }), def);
        /* HS-12: the bar keeps no fight controls; Hunt settings keeps no density (the hunt picker's) and no gathering share (not live). */
        const left = await page.evaluate(() => ({ plaque: document.querySelectorAll('.hb-plaque [data-opt]').length,
          settings: Array.from(document.querySelectorAll('[data-hs-win="hunt-settings"] [data-opt]')).map((e) => e.getAttribute('data-opt')),
          words: document.querySelector('[data-hs-win="hunt-settings"]').innerText }));
        if (left.plaque) fails.push('HS-12 the bar still carries ' + left.plaque + ' fight controls');
        if (left.settings.includes('density') || left.settings.includes('gather_share') || /gather/i.test(left.words)) fails.push('HS-12 Hunt settings still shows density or gathering: ' + left.settings.join(','));
        if (!back || r.pressed !== 'false' || !r.msg) fails.push('HS-3 a refusal did not keep the server’s stance with a reason (' + JSON.stringify(r) + ')');
      } else fails.push('HS-3 the screen did not mount');
      await ctx.close();
    }

    { // HS-4 no section / free character; HS-5 badge defaults
      const { ctx, page, s, up } = await open();
      if (up) {
        delete s.env.hunt_analyzer;
        await pushEnvelope(page, s);
        const gone = await page.evaluate(() => ({ waiting: document.querySelector('.ha-analyzer').classList.contains('is-waiting'),
          shown: getComputedStyle(document.querySelector('.ha-main')).display !== 'none' }));
        if (!gone.waiting || gone.shown) fails.push('HS-4 with no hunt_analyzer section the analyzer still showed numbers');
        s.env.premium = { active: false, premium_until: null };
        s.env.hunt_analyzer = clone(FIXTURE.hunt_analyzer);
        await pushEnvelope(page, s);
        /* Tyler 2026-10-19: a free character sees the BASIC rows, none of the premium ones, and one quiet line. */
        const free = await page.evaluate(() => {
          const p = document.querySelector('.ha-analyzer');
          const shown = (el) => !!el && el.getClientRects().length > 0;
          const stat = (sec, k) => p.querySelector('[data-sec="' + sec + '"] [data-stat="' + k + '"]');
          return {
            basic: [['totals', 'kills'], ['totals', 'xp'], ['totals', 'gold'], ['totals', 'balance'], ['rates', 'xp'], ['rates', 'gold']].map(([a, k]) => shown(stat(a, k)) && /\d/.test(stat(a, k).textContent)),
            premium: [['totals', 'waste'], ['rates', 'rawXp'], ['rates', 'waste']].map(([a, k]) => shown(stat(a, k)) || /\d/.test(stat(a, k).textContent))
              .concat([shown(p.querySelector('[data-clock="next"]')), /\d/.test(p.querySelector('[data-clock="next"]').textContent),
                shown(p.querySelector('.ha-tab[data-tab="taken"]')), shown(p.querySelector('.ha-tab[data-tab="dealt"]')), shown(p.querySelector('.ha-scope'))]),
            supplies: shown(p.querySelector('[data-sec="supplies"]')),
            more: shown(p.querySelector('.ha-more')) ? p.querySelector('.ha-more').textContent : null,
          };
        });
        if (free.basic.some((x) => !x) || !free.supplies) fails.push('HS-4 a free character does not see the basic analyzer rows: ' + JSON.stringify(free));
        if (free.premium.some((x) => x)) fails.push('HS-4 a free character sees a premium analyzer row: ' + JSON.stringify(free.premium));
        if (free.more !== 'More detail with premium.') fails.push('HS-4 a free character has no quiet premium line: ' + JSON.stringify(free.more));
        s.env.premium = { active: true, premium_until: '2099-01-01T00:00:00Z' };
        await pushEnvelope(page, s);
        const paid = await page.evaluate(() => {
          const p = document.querySelector('.ha-analyzer');
          return { waste: p.querySelector('[data-sec="totals"] [data-stat="waste"]').getClientRects().length > 0 && /\d/.test(p.querySelector('[data-sec="totals"] [data-stat="waste"]').textContent),
            taken: p.querySelector('.ha-tab[data-tab="taken"]').getClientRects().length > 0, more: p.querySelector('.ha-more').getClientRects().length > 0 };
        });
        if (!paid.waste || !paid.taken || paid.more) fails.push('HS-4 a premium character does not see every analyzer row: ' + JSON.stringify(paid));
        await page.keyboard.press('Escape');
        await wait(page, () => document.querySelector('[data-hs-win="settings"] input[data-float]'));
        await page.waitForTimeout(300);
        const boxes = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('input[data-float]')).map((c) => [c.getAttribute('data-float') + ':' + c.getAttribute('data-target'), c.checked])));
        if (boxes['bleed_badge:regular'] !== false || boxes['bleed_badge:boss'] !== true) fails.push('HS-5 the bleed count default is not off on monsters and on for bosses: ' + JSON.stringify(boxes));
        for (const id of FLOAT_IDS.filter((x) => x !== 'bleed_badge')) if (boxes[id + ':regular'] !== true || boxes[id + ':boss'] !== true) fails.push('HS-5 ' + id + ' is not on by default');
        if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-free-settings.png') });
      } else fails.push('HS-4 the screen did not mount');
      await ctx.close();
    }

    { // HS-9 the Hunts window follows the server's hunt; HS-10 a hunt that is over keeps only its summary (Tyler 10-19)
      const { ctx, page, s, up } = await open();
      if (up) {
        const hunting = clone(s.env);
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete s.env[k];
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        await page.keyboard.press('h');
        await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt.is-picked .hw-hunt-enter'));
        s.env = hunting;   // the server's answer to Enter: the hero is hunting
        await page.click('[data-hs-win="hunts"] .hw-hunt.is-picked .hw-hunt-enter');
        await page.waitForTimeout(900);
        await pushEnvelope(page, s);
        const w = await page.evaluate(() => ({ msg: document.querySelector('[data-hs-win="hunts"] .hh-intent-msg').textContent,
          now: document.querySelector('[data-hs-win="hunts"] .hw-hunts-now').textContent }));
        if (/On the way/.test(w.msg) || !/You are hunting in/.test(w.now)) fails.push('HS-9 the Hunts window does not follow the server’s hunt: ' + JSON.stringify(w));
        /* HS-10: the server says the hunt is over: the top bar keeps the summary, never Leave hunt. */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true });
        await pushEnvelope(page, s);
        const bar = await page.evaluate(() => {
          const b = document.querySelector('.ht-bar');
          const shown = (q) => { const n = b && b.querySelector(q); return !!n && n.getClientRects().length > 0; };
          return b ? { leave: shown('[data-hs-act="leave"]'), details: shown('[data-hs-act="details"]'), summary: shown('[data-hs-act="summary"]') } : null;
        });
        if (bar && (bar.leave || bar.details || !bar.summary)) fails.push('HS-10 a hunt that is over still offers more than its summary: ' + JSON.stringify(bar));
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: false });
        await pushEnvelope(page, s);
        const live = await page.evaluate(() => { const n = document.querySelector('.ht-bar [data-hs-act="leave"]'); return !!n && n.getClientRects().length > 0; });
        if (!live) fails.push('HS-10 a running hunt shows no Leave hunt');
      } else fails.push('HS-9 the screen did not mount');
      await ctx.close();
    }

    { // HS-15 LEAVE HUNT COUNTS DOWN TO THE SERVER'S CLOSE (live v0.2.20 "very buggy and delayed";
      // Tyler 10-20: "a countdown so they know it's not just stuck")
      /* The server runs three hours ahead of this device: a countdown off the device clock reads nothing like it. */
      const SKEW = 3 * 3600000;
      let leaveAt = null, slowUntil = 0;
      const { ctx, page, s, errors, up } = await open({ prep: (sc) => {
        sc.clock = () => Date.now() + SKEW;
        /* the live view's start-point asks wait for a first boundary an hour off, so only the ordinary
           poll and the leave's own close ask: the asks' backoff could land a settle near leave_at by
           chance and hide a close that waits a whole poll */
        sc.env.hunt = Object.assign({}, sc.env.hunt, { session: Object.assign({}, sc.env.hunt.session, { hunt_from: new Date(sc.clock() + 3600000).toISOString() }) });
        sc.onLeave = () => {
          if (leaveAt === null) leaveAt = sc.clock() + 6000;
          const session = Object.assign({}, sc.env.hunt.session, { id: sc.env.hunt.session_id, leave_at: new Date(leaveAt).toISOString(), phase: 'leaving' });
          sc.env.hunt = Object.assign({}, sc.env.hunt, { session });
          slowUntil = Date.now() + 2500;
          /* the server's answer: the session it set leave_at on (hr_hunt_leave -> hr_hunt_view) */
          return { ok: true, pending: true, session };
        };
        /* every settle asked in the 2.5 s after the press is slow (the live view's own asks too, which
           never give up): the number must not wait for any of them */
        sc.accrueDelay = () => Math.max(0, slowUntil - Date.now());
        /* the hunter's settle closes it once the server's clock is past leave_at (hunt-settle.js: a pending leave is never held back) */
        sc.onAccrue = () => {
          if (leaveAt === null || sc.clock() < leaveAt || sc.env.hunt.ended) return;
          sc.closedAt = Date.now();
          sc.env.hunt = Object.assign({}, sc.env.hunt, { ended: true, session: Object.assign({}, sc.env.hunt.session, { leave_at: null, phase: 'ended', ended_at: new Date(leaveAt).toISOString(), end_reason: 'left' }) });
          sc.env.state = Object.assign({}, sc.env.state, { active_kind: 'idle', active_id: null });
        };
      } });
      if (up) {
        const label = () => page.evaluate(() => { const b = document.querySelector('.ht-bar [data-hs-act="leave"]'); const l = document.querySelector('.ht-bar .ht-leaving');
          return b && l ? { t: l.textContent, line: l.getClientRects().length > 0, off: b.disabled, shown: b.getClientRects().length > 0,
            px: parseFloat(getComputedStyle(l).fontSize), gold: getComputedStyle(l).color === getComputedStyle(document.querySelector('.ht-ground')).color, next: l.nextElementSibling === b } : null; });
        const counting = () => { const l = document.querySelector('.ht-bar .ht-leaving'); return !!l && l.getClientRects().length > 0 && /^Leaving in \d+s$/.test(l.textContent); };
        await page.click('.ht-bar [data-hs-act="leave"]');
        const t0 = Date.now();
        const flight = await label();
        await page.click('.ht-bar [data-hs-act="leave"]', { force: true, timeout: 1000 }).catch(() => {});
        if (!flight || flight.t !== 'Leaving…' || !flight.line || !flight.off) fails.push('HS-15 the press does not answer at once with Leaving… beside an off button: ' + JSON.stringify(flight));
        /* NO WORDLESS GAP: a number within about a second of the press, while the settle after it is still out */
        const quick = await wait(page, counting, null, 1500);
        const gap = Date.now() - t0;
        if (!quick || gap > 1500) fails.push('HS-15 no number within a second of the press (the settle after it is slow): ' + gap + ' ms, ' + JSON.stringify(await label()));
        const a = await label();
        const n = (x) => Number(((x && x.t) || '').replace(/\D+/g, '')) || 0;
        if (!a || !/^Leaving in [4-6]s$/.test(a.t) || !a.off) fails.push('HS-15 the line does not count down to the server’s leave_at (want 4-6s): ' + JSON.stringify(a));
        else if (!(a.px >= 12) || !a.gold || !a.next) fails.push('HS-15 the countdown is not gold label text >= 12 px right beside Leave hunt: ' + JSON.stringify(a));
        await page.click('.ht-bar [data-hs-act="leave"]', { force: true, timeout: 1000 }).catch(() => {});   // a second press while it pends
        await page.waitForTimeout(1300);
        const b = await label();
        if (!(n(b) < n(a))) fails.push('HS-15 the countdown does not tick: ' + JSON.stringify([a, b]));
        if (await page.$('.ht-bar [data-hs-act="leave"]:not([disabled])')) fails.push('HS-15 Leave hunt is pressable again while the leave pends');
        /* RELOAD during the wait: the same countdown, from the server's leave_at */
        await page.reload({ waitUntil: 'load' });
        await signInAndPlay(page, null);
        await wait(page, counting, null, 3000);
        const r = await label();
        if (!r || !/^Leaving in \d+s$/.test(r.t) || !(n(r) >= 1 && n(r) <= n(b)) || !r.off) fails.push('HS-15 a reload during the leave lost its countdown: ' + JSON.stringify([b, r]));
        const leaves = s.calls.filter((c) => c.name === 'hr_hunt_leave').length;
        if (leaves !== 1) fails.push('HS-15 the leave was sent ' + leaves + ' times (want once)');
        /* THE CLOSE: asked a hair after leave_at, the hunt ends on screen within about a second, back in town;
           every line seen on the way is a whole number of seconds >= 1 or "Leaving now…" */
        const end = await page.evaluate(async () => {
          const seen = new Set();
          for (let i = 0; i < 90; i++) {
            const bar = document.querySelector('.ht-bar'); const l = bar && bar.querySelector('[data-hs-act="leave"]'); const line = bar && bar.querySelector('.ht-leaving');
            if (line && line.getClientRects().length > 0) seen.add(line.textContent);
            if (bar && l && l.getClientRects().length === 0 && bar.querySelector('[data-hs-act="summary"]').getClientRects().length > 0) return { done: true, seen: [...seen], line: !!line && line.getClientRects().length > 0 };
            await new Promise((ok) => setTimeout(ok, 100));
          }
          return { done: false, seen: [...seen] };
        });
        const lag = s.closedAt && leaveAt !== null ? s.closedAt - (leaveAt - SKEW) : null;
        if (!end.done) fails.push('HS-15 the hunt never ended on screen after leave_at: ' + JSON.stringify(await label()));
        else if (lag === null || lag > 1500) fails.push('HS-15 the close was asked ' + lag + ' ms after leave_at (want within 1.5 s)');
        const odd = end.seen.filter((x) => !/^Leaving in [1-9]\d*s$|^Leaving now…$/.test(x));
        if (odd.length) fails.push('HS-15 the countdown showed ' + JSON.stringify(odd) + ' on its way to the close');
        if (end.line) fails.push('HS-15 the leaving line stays up after the hunt ended');
        if (errors.length) fails.push('HS-15 console errors: ' + errors.slice(0, 3).join(' | '));
      } else fails.push('HS-15 the screen did not mount');
      await ctx.close();
    }

    { // HS-16 PAST leave_at: "Leaving now…"; still open a while later: a plain still-processing line, still asked
      let iso = null;
      const { ctx, page, s, errors, up } = await open({ prep: (sc) => {
        sc.clock = () => Date.now();
        iso = (ago) => new Date(sc.clock() - ago).toISOString();
        /* a reload into a leave whose leave_at passed 3 s ago and whose close has not landed */
        sc.env.hunt = Object.assign({}, sc.env.hunt, { session: Object.assign({}, sc.env.hunt.session, { leave_at: iso(3000), phase: 'leaving' }) });
      } });
      if (up) {
        const line = () => page.evaluate(() => { const l = document.querySelector('.ht-bar .ht-leaving'); const b = document.querySelector('.ht-bar [data-hs-act="leave"]');
          return l && b ? { t: l.getClientRects().length > 0 ? l.textContent : null, off: b.disabled } : null; });
        const reads = (t) => page.waitForFunction((x) => { const l = document.querySelector('.ht-bar .ht-leaving'); return !!l && l.getClientRects().length > 0 && l.textContent === x; }, t, { timeout: 4000 }).then(() => true, () => false);
        if (!(await reads('Leaving now…'))) fails.push('HS-16 a leave past its leave_at does not read "Leaving now…": ' + JSON.stringify(await line()));
        /* the server's leave_at is now long past (the close is late): the line says so, plainly */
        const asked = s.calls.filter((c) => c.name === 'hr-accrue').length;
        s.env.hunt = Object.assign({}, s.env.hunt, { session: Object.assign({}, s.env.hunt.session, { leave_at: iso(20000) }) });
        if (!(await reads('Still processing your leave…'))) fails.push('HS-16 a late close never says it is still being processed: ' + JSON.stringify(await line()));
        const l = await line();
        if (!l || !l.off) fails.push('HS-16 Leave hunt is pressable while the late leave is processed: ' + JSON.stringify(l));
        if (!(s.calls.filter((c) => c.name === 'hr-accrue').length > asked)) fails.push('HS-16 the late close is not asked again');
        if (errors.length) fails.push('HS-16 console errors: ' + errors.slice(0, 3).join(' | '));
      } else fails.push('HS-16 the screen did not mount');
      await ctx.close();
    }

    { // HS-13 no two hunt panels overlap at 1440x900 or on a narrower desktop (Tyler 10-19)
      const { ctx, page, up } = await open();
      if (up) {
        const overlaps = () => page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[data-hs-hud="world"] [data-hs-widget]')).map((e) => [e.getAttribute('data-hs-widget'), e.getBoundingClientRect()]);
          const out = [];
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const [a, p] = els[i], [b, q] = els[j];
            if (p.width && q.width && p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1) out.push(a + ' x ' + b);
          }
          return out;
        });
        const bare = await overlaps();
        if (bare.length) fails.push('HS-13 hunt panels overlap with no window open: ' + bare.join(', '));
        /* A window floats over the World and never narrows it (Tyler 10-19), so the row that is too
           narrow comes from the screen: a narrow desktop makes the edge panels step below the bar. */
        for (const vp of [{ width: 1100, height: 800 }, { width: 1024, height: 700 }]) {
          await page.setViewportSize(vp);
          await page.waitForTimeout(500);
          const narrow = await overlaps();
          if (narrow.length) fails.push('HS-13 hunt panels overlap at ' + vp.width + 'x' + vp.height + ': ' + narrow.join(', '));
        }
      } else fails.push('HS-13 the screen did not mount');
      await ctx.close();
    }

    { // HS-7 Configure action: a bar slot opens it centred; registry pickers; one whole-bar intent; off until confirmed; refusals inline
      const { ctx, page, s, up } = await open();
      if (up) {
        await page.click('.hb-slot[data-slot="2"]');
        const opened = await wait(page, () => { const f = document.querySelector('[data-hs-win="configure-action"].is-modal .hc-cfg'); return f && !f.classList.contains('is-empty'); }, null, 3000);
        if (!opened) fails.push('HS-7 pressing a bar slot did not open Configure action as a centred modal');
        else {
          const picks = await page.evaluate(async () => {
            const reg = await import('/src/data/condition-metrics.js?v=0.1.0');
            const shown = Array.from(document.querySelectorAll('.hc-cond[data-cond="0"] [data-f="metric"] option')).map((o) => o.value);
            const win = document.querySelector('[data-hs-win="configure-action"]').getBoundingClientRect();
            const mid = Math.abs((win.left + win.width / 2) - window.innerWidth / 2);
            return { ok: JSON.stringify(shown) === JSON.stringify(reg.METRICS.map((m) => m.id)), shown, title: document.querySelector('.hc-title').textContent,
              picked: (document.querySelector('.hc-list .is-on .hc-choice-name') || {}).textContent, tab: (document.querySelector('.hc-tab[aria-selected="true"]') || {}).textContent, mid };
          });
          if (!picks.ok) fails.push('HS-7 the metric picker is not the registry: ' + picks.shown.join(','));
          if (picks.title !== 'Slot 3') fails.push('HS-7 the window opened on "' + picks.title + '", not slot 3');
          if (picks.picked !== 'Wheat Bread' || picks.tab !== 'Items') fails.push('HS-7 the server’s action is not the picked choice on its tab: ' + picks.picked + ' / ' + picks.tab);
          if (picks.mid > 30) fails.push('HS-7 the modal is not centred (' + Math.round(picks.mid) + ' px off)');
          await page.selectOption('.hc-cond[data-cond="0"] [data-f="op"]', 'lt');
          await page.fill('.hc-cond[data-cond="0"] [data-f="value"]', '40');
          await page.dispatchEvent('.hc-cond[data-cond="0"] [data-f="value"]', 'change');
          s.env.hunt_settings.slots[2].conditions = [{ metric: 'self_hp_pct', op: 'lt', value: 40 }];
          const tipBefore = await page.evaluate(() => { const li = document.querySelector('.hb-slot[data-slot="2"]'); li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip').textContent; });
          await page.click('.hc-foot [data-x="save"]');
          const mid = await page.evaluate(() => Array.from(document.querySelectorAll('.hc-form button, .hc-form select, .hc-form input')).every((b) => b.disabled));
          if (!mid) fails.push('HS-7 Configure action stayed on while its intent was in flight');
          if (!/at or below 50%/.test(tipBefore)) fails.push('HS-7 the slot tooltip did not show the server’s setup: ' + tipBefore);
          const sent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts);
          const sl = sent[0] && sent[0].slots;
          if (sent.length !== 1 || !Array.isArray(sl) || sl.length !== 20 || JSON.stringify(sl[2].conditions) !== '[{"metric":"self_hp_pct","op":"lt","value":40}]'
            || JSON.stringify(sl[0]) !== JSON.stringify({ action: FIXTURE.hunt_settings.slots[0].action, conditions: FIXTURE.hunt_settings.slots[0].conditions, join: 'and' })) {
            fails.push('HS-7 the save sent ' + JSON.stringify(sent).slice(0, 300));
          }
          const done = await wait(page, () => !document.querySelector('[data-hs-win="configure-action"]'), null, 3000);
          const tipAfter = await page.evaluate(() => { const li = document.querySelector('.hb-slot[data-slot="2"]'); li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip').textContent; });
          if (!done || !/below 40%/.test(tipAfter)) fails.push('HS-7 after the server confirmed, the slot did not show the server’s new test and close: ' + tipAfter);
          /* A refusal: shown inline on the condition the server names; the server's bar stays. */
          s.optionsReply = { ok: false, error: 'bad_value', slot: 0, condition: 0 };
          await page.click('.hb-slot[data-slot="0"]');
          await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null, 3000);
          await page.click('.hc-conds-head [data-x="add"]');
          await page.click('.hc-foot [data-x="save"]');
          const shown = await wait(page, () => document.querySelector('.hc-cond[data-cond="0"]').classList.contains('is-error')
            && document.querySelector('.hc-form .hh-intent-msg').textContent.length > 0, null, 3000);
          if (!shown) fails.push('HS-7 a server validation error was not shown on its condition');
          if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-configure-action.png') });
        }
      } else fails.push('HS-7 the screen did not mount');
      await ctx.close();
    }

    { // HS-11 a slot that can never fire: the same action under weaker conditions earlier shows "!" and why; emptying the earlier one clears it
      const { ctx, page, s, up } = await open();
      if (up) {
        s.env.hunt_settings.slots[6] = { action: { type: 'ability', id: 'power_strike' }, conditions: [{ metric: 'enemies_in_aoe', op: 'lte', value: 1 }, { metric: 'self_hp_pct', op: 'gt', value: 50 }], join: 'and', usable: true, mana: 6 };
        await pushEnvelope(page, s);
        const blocked = await wait(page, () => document.querySelector('.hb-slot[data-slot="6"]').classList.contains('is-blocked')
          && !document.querySelector('.hb-slot[data-slot="0"]').classList.contains('is-blocked'), null, 3000);
        const tip = await page.evaluate(() => { document.querySelector('.hb-slot[data-slot="6"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip .is-warn') ? document.querySelector('.hb-tip .is-warn').textContent : ''; });
        if (!blocked || !/Blocked by Power Strike \(slot 1\)/.test(tip)) fails.push('HS-11 the never-firing slot shows no "!" or no reason: ' + tip);
        s.env.hunt_settings.slots[0] = null;
        await pushEnvelope(page, s);
        if (!(await wait(page, () => !document.querySelector('.hb-slot[data-slot="6"]').classList.contains('is-blocked'), null, 3000))) fails.push('HS-11 emptying the earlier slot did not clear the "!"');
      } else fails.push('HS-11 the screen did not mount');
      await ctx.close();
    }

    for (const vp of shots ? [{ width: 1440, height: 900 }, { width: 922, height: 423 }] : [{ width: 1440, height: 900 }]) { // HS-8 in town
      const { ctx, page, s, up } = await open({ town: true, viewport: vp });
      const tag = vp.width + 'x' + vp.height;
      if (!up) { fails.push('HS-8 the town bar did not mount (' + tag + ')'); await ctx.close(); continue; }
      const town = await page.evaluate(() => ({ bar: !!document.querySelector('.hb-bar.is-town'),
        vitals: getComputedStyle(document.querySelector('.hb-vitals')).display,
        plus: getComputedStyle(document.querySelector('.hb-slot[data-slot="5"] .hb-plus')).display }));
      if (!town.bar || town.vitals !== 'none') fails.push('HS-8 in town the bar is missing or shows hunt vitals: ' + JSON.stringify(town));
      if (town.plus === 'none') fails.push('HS-8 an empty slot shows no "+"');
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-bar.png') });
      /* Configure an empty slot from its "+": Items, Any food (the store price shown, paid as used), IF My HP % below 60. */
      await page.click('.hb-slot[data-slot="5"]');
      await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null, 3000);
      await page.click('.hc-tab[data-tab="items"]');
      await page.click('.hc-choice[data-id="food"]');
      const note = await page.evaluate(() => ({ choice: document.querySelector('.hc-choice[data-id="food"] .hc-choice-note').textContent,
        facts: document.querySelector('.hc-facts').textContent }));
      if (!/store from \d+ g each/.test(note.choice) || !/paid as used/.test(note.facts)) fails.push('HS-8 Any food does not show the store price paid as used: ' + JSON.stringify(note));
      await page.click('.hc-conds-head [data-x="add"]');
      await page.fill('.hc-cond[data-cond="0"] [data-f="value"]', '60');
      await page.dispatchEvent('.hc-cond[data-cond="0"] [data-f="value"]', 'change');
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-configure-action.png') });
      const want = { action: { type: 'consume', id: 'food' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' };
      s.env.hunt_settings.slots[5] = Object.assign({ usable: true, count: 0 }, want);
      await page.click('.hc-foot [data-x="save"]');
      const sent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts);
      if (sent.length !== 1 || JSON.stringify(sent[0].slots[5]) !== JSON.stringify(want)) fails.push('HS-8 the town save sent ' + JSON.stringify(sent).slice(0, 300));
      const saved = await wait(page, () => /Any food/.test(document.querySelector('.hb-slot[data-slot="5"]').getAttribute('aria-label')) && !document.querySelector('[data-hs-win="configure-action"]'), null, 3000);
      if (!saved) fails.push('HS-8 the town slot did not show the server’s Any food after it confirmed');
      /* Nobody is told to buy first (Tyler 10-19): with Any food on the bar and an empty bag, Hunt prep reads the store per use. */
      await page.keyboard.press('p');
      const prep = await wait(page, () => /Food: the store, from \d+ gp each as used/.test((document.querySelector('[data-hs-win="hunt-prep"] .hw-checks') || {}).textContent || ''), null, 3000);
      const prepText = await page.evaluate(() => (document.querySelector('[data-hs-win="hunt-prep"]') || {}).innerText || '');
      if (!prep || /0 food/.test(prepText)) fails.push('HS-8 Hunt prep does not read the store per use for Any food: ' + prepText.slice(0, 200));
      await page.keyboard.press('p');
      /* Density on the hunt picker: the press answers at once, a run of presses is ONE intent, the server's answer replaces the draft. */
      await page.keyboard.press('h');
      await wait(page, () => document.querySelector('.hw-hunt.is-picked .hw-density.is-on'), null, 3000);
      const dRead = () => page.evaluate(() => {
        const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val');
        return { v: v.textContent, pending: v.getAttribute('data-pending'), msg: document.querySelector('.hw-hunts .hh-intent-msg').textContent,
          facts: document.querySelector('.hw-hunt.is-picked .hw-hunt-facts').textContent };
      });
      const d0 = await dRead();
      if (d0.v !== '1 each') fails.push('HS-8 the density does not show the server’s pick of 1: ' + d0.v);
      if (!/ packs? of 1[ ,]/.test(d0.facts)) fails.push('HS-8 the facts line does not say the pull size at the server’s pick of 1: ' + d0.facts);
      /* the re-read after the save answers 4 (not the 5 asked): what shows afterwards is the server's */
      s.env.hunt_settings.density = 4;
      const sentBefore = s.calls.filter((c) => c.name === 'hr_action_set_options').length;
      const plusOn = await page.evaluate(() => {
        const b = document.querySelector('.hw-hunt.is-picked .hw-density [data-by="1"]');
        if (b.disabled) return false;
        for (let i = 0; i < 4; i++) document.querySelector('.hw-hunt.is-picked .hw-density [data-by="1"]').click();
        return true;
      });
      if (!plusOn) fails.push('HS-8 the density + is off below the ground’s most');
      const dMid = await dRead();
      if (dMid.v !== '5 each' || dMid.pending !== 'true' || !/Saving/.test(dMid.msg)) fails.push('HS-8 four quick presses did not show 5 at once, marked unsaved: ' + JSON.stringify(dMid));
      if (!/ packs? of 5[ ,]/.test(dMid.facts)) fails.push('HS-8 the facts line does not follow the pick: ' + dMid.facts);
      if (!(await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val'); return v.textContent === '4 each' && v.getAttribute('data-pending') === 'false'; }, null, 4000))) fails.push('HS-8 the density did not show the server’s answer of 4 after the save: ' + JSON.stringify(await dRead()));
      const dSent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts).slice(sentBefore);
      if (JSON.stringify(dSent) !== '[{"density":5}]') fails.push('HS-8 four quick density presses sent ' + JSON.stringify(dSent) + ' (want ONE intent with 5)');
      const dAfter = await dRead();
      if (!/ packs? of 4[ ,]/.test(dAfter.facts) || /Saving/.test(dAfter.msg)) fails.push('HS-8 after the save the line does not read the server’s 4: ' + JSON.stringify(dAfter));
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-hunts-density.png') });
      /* A refused save: the server's value shows again, with the reason in words. */
      s.optionsReply = { ok: false, error: 'rate_limited' };
      await page.evaluate(() => { const b = document.querySelector('.hw-hunt.is-picked .hw-density [data-by="1"]'); if (!b.disabled) b.click(); });
      const refused = await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val');
        const m = document.querySelector('.hw-hunts .hh-intent-msg').textContent;
        return v.textContent === '4 each' && v.getAttribute('data-pending') === 'false' && m && !/Saving/.test(m); }, null, 4000);
      if (!refused) fails.push('HS-8 a refused density save does not show the server’s 4 and why: ' + JSON.stringify(await dRead()));
      s.optionsReply = { ok: true };
      /* Reload: the slot and the density come back from the server, nothing from the browser. */
      await page.reload({ waitUntil: 'load' });
      const back = await signInAndPlay(page, '', true);
      if (!back) fails.push('HS-8 the town did not mount after a reload');
      else {
        const slot = await wait(page, () => /Any food/.test(document.querySelector('.hb-slot[data-slot="5"]').getAttribute('aria-label')), null, 3000);
        await page.click('.hb-slot[data-slot="5"]');
        const cond = await wait(page, () => { const n = document.querySelector('.hc-cond[data-cond="0"].is-on [data-f="value"]'); return n && n.value === '60'; }, null, 3000);
        if (!slot || !cond) fails.push('HS-8 after a reload the slot or its condition is not the server’s');
        await page.keyboard.press('Escape');
        await page.keyboard.press('h');
        if (!(await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val'); return v && v.textContent === '4 each'; }, null, 3000))) fails.push('HS-8 after a reload the density is not the server’s');
      }
      await ctx.close();
    }

    { // HS-14 a party member's density is the leader's, read-only; the leader keeps its step
      const { ctx, page, s, up } = await open({ town: true });
      if (up) {
        const seat = (n, name, weapon) => ({ unit: null, seat: n, hunting: false, name, level: 20, weapon });
        s.env.party = { id: '0a47c0de-0000-4000-a000-00000000aa01', hunt: null, max: 4, open: true, listed: false, leader: null, self: null,
          leader_seat: 1, self_seat: 0, leader_density: 7, members: [seat(0, 'Tyler', 'shield'), seat(1, 'Fingerguns', 'bow')] };
        await pushEnvelope(page, s);
        await page.keyboard.press('h');
        const shown = await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density.is-on .hh-step-val'); return v && /Set by/.test(v.textContent); }, null, 4000);
        const m = await page.evaluate(() => {
          const d = document.querySelector('.hw-hunt.is-picked .hw-density');
          const steps = [...d.querySelectorAll('[data-by]')];
          return { v: d.querySelector('.hh-step-val').textContent, visible: steps.filter((b) => b.offsetParent !== null).length,
            facts: document.querySelector('.hw-hunt.is-picked .hw-hunt-facts').textContent };
        });
        if (!shown || m.v !== 'Set by Fingerguns: 7 each') fails.push('HS-14 a member does not see the leader\'s density read-only: ' + JSON.stringify(m));
        if (m.visible !== 0) fails.push('HS-14 a member\'s picker still shows ' + m.visible + ' density step(s)');
        if (!/ packs? of 7[ ,]/.test(m.facts)) fails.push('HS-14 a member\'s facts line does not say the leader\'s pull: ' + m.facts);
        const before = s.calls.filter((c) => c.name === 'hr_action_set_options').length;
        await page.evaluate(() => { for (const b of document.querySelectorAll('.hw-hunt.is-picked .hw-density [data-by]')) b.click(); });
        await page.waitForTimeout(500);
        if (s.calls.filter((c) => c.name === 'hr_action_set_options').length !== before) fails.push('HS-14 a member\'s density press sent an intent');
        /* The leader (the crown passes to seat 0): its own pick and its step are back. */
        s.env.party = Object.assign({}, s.env.party, { leader_seat: 0 });
        await pushEnvelope(page, s);
        const lead = await wait(page, () => { const d = document.querySelector('.hw-hunt.is-picked .hw-density.is-on');
          return d && !/Set by/.test(d.querySelector('.hh-step-val').textContent) && [...d.querySelectorAll('[data-by]')].every((b) => b.offsetParent !== null); }, null, 4000);
        if (!lead) fails.push('HS-14 the leader does not get its density step back');
      } else fails.push('HS-14 the town did not mount');
      await ctx.close();
    }

    if (shots) { // the phone size class
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 } });
      if (up) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(shots, 'hunt-922x423.png') });
        await page.keyboard.press('j');
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(shots, 'hunt-922x423-settings.png') });
        await page.keyboard.press('j');   // the phone sheet: the category list, then one page
        await page.keyboard.press('Escape');
        await wait(page, () => document.querySelector('[data-hs-win="settings"] .st-tab'));
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(shots, 'hunt-922x423-settings-list.png') });
        await page.click('[data-hs-win="settings"] .st-tab[data-cat="combat_text"]');
        await page.waitForTimeout(200);
        await page.screenshot({ path: join(shots, 'hunt-922x423-settings-page.png') });
      } else fails.push('HS-1 the phone size did not mount');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the shell rebuilds a component on every paint', 'src/shell/shell.js', 'if (render.patch) render.patch(el, ctx);', 'if (render.patch) { el.innerHTML = render(ctx); render.patch(el, ctx); }'],
  ['keyed rows rebuild every row', 'src/render/paint.js', 'let el = held.get(k);', 'let el = null;'],
  ['a setting shows before the server confirms', 'src/shell/widgets/settings-intent.js', [["  attr(root, 'data-pending', true);\n", "  attr(root, 'data-pending', true);\n  root.__want = el;\n"],
    ["else if (key === 'stance') attr(el, 'aria-pressed', String(v === el.getAttribute('data-val')));", "else if (key === 'stance') attr(el, 'aria-pressed', String(pending ? root.__want === el : v === el.getAttribute('data-val')));"]]],
  ['controls stay on while an intent is in flight', 'src/shell/widgets/settings-intent.js', "prop(el, 'disabled', pending || v === null);", "prop(el, 'disabled', v === null);"],
  ['the analyzer ignores the premium gate', 'src/shell/widgets/analyzer.js', 'const premium = isPremium(ctx.character);', 'const premium = true;'],
  ['the Hunts window keeps saying "On the way" while hunting', 'src/shell/windows/hunts.js', "  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }\n", ''],
  ['an edge panel never steps out of the hunt bar’s way', 'src/shell/shell.js', "        for (const p of at.push) edgeEls[p.i].style.top = p.top + 'px';\n", ''],
  ['an ended hunt still offers Leave hunt', 'src/shell/widgets/hunt-topbar.js', "  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));\n", ''],
  ['Leave hunt forgets a pending leave', 'src/shell/widgets/hunt-topbar.js', "  const cd = over ? null : ctx.character.leaveCountdown();", "  const cd = null;"],
  ['the leave countdown reads the device clock', 'src/session/character-session.js', "leaveCountdown(at, this.serverNow());", "leaveCountdown(at, Date.now());"],
  ['the countdown waits for the settle after the press', 'src/session/character-session.js', "      this._leaveAsk = leaveAskOf(ans.body.session);\n", ""],
  ['a late close never says so', 'src/shell/widgets/hunt-topbar.js', "late: 'Still processing your leave…'", "late: 'Leaving now…'"],
  ['the countdown line is not shown', 'src/shell/widgets/hunt-topbar.js', "  prop(line, 'hidden', !leaving || over);", "  prop(line, 'hidden', true);"],
  ['the leave closes a whole poll late', 'src/session/hunt-poll.js', "  return closeMs === null ? ms : Math.min(ms, closeMs);", "  return ms;"],
  ['a free character gets no basic analyzer', 'src/shell/widgets/analyzer.js', 'const a = analyzerOf(ctx.character);', 'const a = premium ? analyzerOf(ctx.character) : null;'],
  ['the analyzer keeps the last numbers when the section goes', 'src/session/hunt-sections.js', "  const a = section(cs, 'hunt_analyzer');\n", "  const a = section(cs, 'hunt_analyzer') || globalThis.__lastA;\n  globalThis.__lastA = a;\n"],
  ['the metric picker is a hard-coded list', 'src/shell/windows/configure-action.js', "aria-label=\"Test ' + (i + 1) + '\">' + options(METRICS.map((m) => [m.id, m.label]))", "aria-label=\"Test ' + (i + 1) + '\">' + options([['self_hp_pct', 'My HP %'], ['self_mana_pct', 'My mana %']])"],
  ['the controls stay on while a bar intent is in flight', 'src/shell/windows/configure-action.js', '  const off = s.pending;', '  const off = false;'],
  ['a server validation error is not shown inline', 'src/shell/bar-draft.js', '  else { s.error = r;', '  else { s.error = null;'],
  ['the bar hides in town', 'src/data/hud-widgets.js', "removable: true, when: 'always',\n    phone: Object.freeze({ dy: 2 }),", "removable: true, when: 'hunt',\n    phone: Object.freeze({ dy: 2 }),"],
  ['the store price is not shown on Any food', 'src/shell/windows/configure-action.js', "(st.from ? 'store from ' : 'store ') + st.price + ' g each'", "''"],
  ['the density step sends no intent', 'src/shell/windows/hunts.js', '    try { r = await cs.setHuntOptions(d.preset, { density: d.n }); } catch (e) { r = null; }', '    try { r = { ok: true }; } catch (e) { r = null; }'],
  ['every density press sends its own intent', 'src/shell/windows/hunts.js', '      sc.timer = setTimeout(() => saveDensity(cs, sc, repaint), DENSITY_SAVE_MS);', '      saveDensity(cs, sc, repaint);'],
  ['the density waits for the server before it moves', 'src/shell/windows/hunts.js', '  if (!dn || !sc.draft) return dn;', '  if (dn) return dn;'],
  ['the density draft outlives the server answer', 'src/shell/windows/hunts.js', '    if (sc.draft === d) { sc.draft = null;', '    if (sc.draft === d) { sc.draft = r.ok ? d : null;'],
  ['the facts line ignores the density pick', 'src/shell/windows/hunts.js', "densityWords(r, dn ? dn.now : null)", "densityWords(r, null)"],
  ['the density shows the ground max, not the server pick', 'src/shell/windows/hunts.js', '  return { now: densityFor(g, size, set.density), max };', '  return { now: max, max };'],
  ['a party member steps its own density', 'src/shell/windows/hunts.js', "  if (party && !party.isLeader) return densityOf(Number.isInteger(party.density) ? { density: party.density } : null, hunt, size);\n", ''],
  ['a party member keeps the density step', 'src/shell/windows/hunts.js', "prop(b, 'hidden', follower);", "prop(b, 'hidden', false);"],
  ['a blocked slot is not flagged', 'src/shell/action-facts.js', '      if (same || kind) {', '      if (false) {'],
  ['the modal docks instead of centring', 'src/shell/window-manager.js', "  const isModal = (id) => rows.get(id).modal === true;", "  const isModal = () => false;"],
  ['Hunt prep tells a player to buy first', 'src/shell/readiness.js', '      const st = storeOn ? storeOf(sl.action) : null;', '      const st = null;'],
  ['the bleed badge defaults on for regular monsters', 'src/data/combat-text.js', "label: 'Bleed stack count', on: on(false, true)", "label: 'Bleed stack count', on: on(true, true)"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'hunt-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'hunt-screen: ' + fails.length + ' rule(s) RED'
      : 'hunt-screen: panels mount; patch in place; intents only; the analyzer is the server’s; badge defaults; each log line once' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null, null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    let text = await readFile(join(ROOT, file), 'utf8');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([x]) => !text.includes(x));
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    for (const [x, y] of pairs) text = text.replace(x, y);
    const fails = await checks({ [file]: text }, null);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'hunt-screen --mutate: ' + bad + ' escaped' : 'hunt-screen --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
