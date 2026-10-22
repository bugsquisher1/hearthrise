#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-screen.mjs — THE HUNT SCREEN'S PANEL RULES, IN A REAL CHROMIUM.
//
//   node tests/hunt-screen.mjs                the rules
//   node tests/hunt-screen.mjs --mutate       every planted defect must turn a rule RED
//   node tests/hunt-screen.mjs --mutate --shard=K/N   only every Nth mutant from the Kth (CI splits them)
//     (on a push, tools/mutant-gate.mjs narrows a shard to the mutants its diff touches —
//      tools/lib/mutant-scope.mjs; the nightly runs every mutant)
//   node tests/hunt-screen.mjs --shots <dir>  also write the visual-gate screenshots
//                                             (1440x900 and 922x423)
//
// mutant-anchors: src/render/images.js src/world/atlas.js src/hunt-view/summary-model.js src/session/character-session.js src/session/hunt-leave.js src/session/hunt-poll.js src/shell/windows/hunts.js src/shell/widgets/hunt-topbar.js src/render/paint.js src/shell/shell.js src/shell/widgets/ src/shell/windows/ src/session/hunt-sections.js src/data/combat-text.js src/data/condition-metrics.js src/shell/action-facts.js src/shell/hud.js
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
//   HS-12 THE BAR PANEL holds target, stance, chase, distance and the gold to keep (nothing
//         else); each is ONE intent, shows the server value (the gold field keeps it while in
//         flight and after a refusal), survives a reload; no Hunt settings window
//   HS-13 no two hunt panels overlap at 1440x900 or on a narrower desktop, nor with a window docked
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
//   HS-17 AN IMAGE LOADS ONCE: five repaints, the bar leaving for an envelope and
//         back, and a loot line leaving and back fetch no image (the cache is
//         off here, so only a kept node passes); an atlas asked for thrice is one image
//         (Coordinator QA 2026-10-20: 216 repeated image requests in a hunt)
//   HS-18 THE VITALS HUB: HP, mana, level, XP and stamina from the envelope, replaced by
//         the next one; a melee hero with no mana pool still shows its mana gauge; regen
//         reads per second with one decimal (the server's per-minute mana over 60) while
//         hunting, and nothing once the hunt is over or in town (no server rate there)
//   HS-19 DRAG: onto an empty slot it moves; onto an action a menu (Swap with X / Insert
//         here, shift the rest / Escape or a press away cancels); one intent per choice;
//         nothing moves before the server's re-read says so; the status line always comes
//         back: cleared on the answer, the reason on a refusal, a plain line on the timeout
//   HS-20 every struck or waiting slot says why (glyph + the tooltip's first line), one slot a reason
//   HS-26 A DOCKED WINDOW NEVER COVERS THE ANALYZER (r11), at 1920x1080, 1440x900 and 922x423:
//         with the chat docked, then the Character window, the analyzer's box crosses no docked
//         window; where the row has room right of the fight (1920 with the chat) it moves beside
//         the dock instead of hiding; docking never moves the camera on a desktop
//   HS-22 THE PHONE BAR (922x423), in a hunt and in town: at most 100 px tall, the alerts dock
//         above its top, and the fight settings are a slide-out sheet (shut until the bar's
//         button opens it, then on top of everything, shut again on Escape)
//   HS-23 THE HEAL WARNING: a heal slot whose HP % is fewer HP than the hunt's biggest blow at the
//         party's size says so in Configure action's sticky foot beside Save ("The Rat King can hit for 75.
//         At 30% you have 66 HP, so one hit can kill you before you eat."), in view at 922x423 whenever Save is;
//         it hides at a safe threshold and for a solo hero (who skips the King's hall)
//   HS-21 THE COOLDOWN EMBER: the hero's played cast cools that ability's slot for its
//         catalogue cooldown; the ember rises and the seconds fall as it runs out
//   HS-24 THE PICKER'S PERSONAL BESTS (designer 2026-10-21): each ground's card shows the
//         server's hunt_bests for this hero, alone and in a party ("12,400 Level XP per hour ·
//         balance 3,100 gp per hour"), "No hunt of 10 min yet" where there is none, >= 12 px,
//         and the next envelope REPLACES them (never merged)
//   HS-25 THE HUNT SUMMARY shows the server's balance per hour to every character, and raw
//         XP per hour only when the server sent it (premium)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { pathToFileURL } from 'node:url';
import { scopeMutants, gateScope } from '../tools/lib/mutant-scope.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
/* The scene and its log play huntPlaybackDelayMs behind the server (src/session/config.js): the fixture's
   window is stated that far in the past, so its events are due the moment it lands. */
FIXTURE.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
const clone = (o) => JSON.parse(JSON.stringify(o));
/* LOAD-PROOF (2026-10-21, P1: HS-7/HS-8/HS-12/HS-15/HS-21 went red on loaded boxes, a different one each run).
   A rule waits for the STATE it checks, never for wall time: LOAD_MS is only how long a state may take to
   arrive on a slow box, never a rule. A rule ABOUT time (the leave countdown, the cooldown ember, the bar's
   answer wait) runs on the page's pinned clock (page.clock): virtual time moves only when the test moves it,
   and only while no request is out (drive), so a loaded box changes how long the run takes, not what it sees. */
const LOAD_MS = 15000;
const wait = (page, fn, arg, ms = LOAD_MS) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** Node-side: until `fn()` holds (a call reached the stub, a reply went out), or false after LOAD_MS. */
async function until(fn, ms = LOAD_MS) {
  for (const end = Date.now() + ms; !fn();) { if (Date.now() > end) return false; await sleep(20); }
  return true;
}
/* Which envelope the page has read: every server answer the client parses (src/session/server.js res.json())
   is noted, so a test can wait until the page HAS the envelope it pushed instead of guessing a delay. */
const SEEN_SCRIPT = `(() => { const j = Response.prototype.json;
  Response.prototype.json = async function () { const v = await j.call(this);
    if (v && Number.isInteger(v.version)) window.__hsSeen = Math.max(window.__hsSeen || 0, v.version); return v; }; })();`;

/* ── the pinned clock ── */
const CLOCKS = new WeakMap();   // page -> { paused, now }
/** Stop the page's clock (page.clock must be installed): from here virtual time moves only through drive(). */
async function pauseClock(page) {
  const c = CLOCKS.get(page);
  for (let margin = 500; ; margin *= 2) {
    const t = (await page.evaluate(() => Date.now())) + margin;
    try { await page.clock.pauseAt(t); c.now = t; c.paused = true; return c; } catch (e) { if (margin > 60000) throw e; }
  }
}
async function resumeClock(page) { const c = CLOCKS.get(page); await page.clock.resume(); c.paused = false; }
/**
 * Move the paused clock in `step` ms steps, ONLY while no request is out (a held stub reply does not
 * count): a slow box makes the network slow, never the page's time. Stops when `pred` (a page function)
 * holds, or after `maxMs` of virtual time. `onStep` runs before each step. -> { ok, used }
 */
async function drive(page, { maxMs, pred = null, arg, step = 50, onStep = null }) {
  const c = CLOCKS.get(page);
  let used = 0;
  for (;;) {
    if (pred && await page.evaluate(pred, arg)) return { ok: true, used };
    if (onStep) await onStep();
    if (used >= maxMs) return { ok: !pred, used };
    if (c.out.size > c.held.size) { await sleep(10); continue; }
    await page.clock.runFor(step);
    c.now += step;
    used += step;
  }
}

/** A scripted server: `env` is what hr_load and hr-accrue answer (version bumped each call). */
function scripted() {
  const s = { env: clone(FIXTURE), version: 1, calls: [], optionsReply: { ok: true }, optionsDelayMs: 300, waiting: {} };
  /* answer every held reply of a kind, and stop holding that kind */
  s.release = (kind) => {
    if (kind === 'accrue') s.holdAccrue = false; else s.holdOptions = false;
    for (const go of (s.waiting[kind] || []).splice(0)) go();
  };
  s.sent = (name) => s.calls.filter((c) => c.name === name);
  /* `clock`: a server clock of the test's own (ms); each answer then states it as `now` and hunt_server_now_ms. */
  s.next = () => Object.assign(clone(s.env), { version: ++s.version },
    s.clock ? { now: new Date(s.clock()).toISOString(), hunt_server_now_ms: s.clock() } : {});
  return s;
}

/** A reply the test holds back (a slow settle, an unanswered save) until s.release(kind): it is out, and drive() moves the clock past it. */
function hold(page, r, s, kind) {
  const c = CLOCKS.get(page);
  const req = r.request();
  if (c) c.held.add(req);
  return new Promise((ok) => { (s.waiting[kind] = s.waiting[kind] || []).push(() => { if (c) c.held.delete(req); ok(); }); });
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
      if (s.holdAccrue) await hold(page, r, s, 'accrue');
      s.accrueLive = (s.accrueLive || 0) + 1;   // answering now (not held)
      try {
        if (s.accrueDelayMs) await sleep(s.accrueDelayMs);
        if (s.onAccrue) s.onAccrue();
        return await json(Object.assign({ accrued: true }, s.next()));
      } finally { s.accrueLive--; }
    }
    if (name === 'hr_action_set_options') {
      if (s.holdOptions) await hold(page, r, s, 'options'); else await sleep(s.optionsDelayMs);
      /* the server saves what it confirms at the moment it answers (never before the gesture) */
      if (s.onOptions && s.optionsReply.ok) s.onOptions(body.p_opts);
      return json(s.optionsReply);
    }
    if (name === 'hr_hunt_leave' && s.onLeave) { await sleep(400); const out = s.onLeave(); await json(out); s.leaveAnswered = true; return undefined; }
    /* `keepResidue`: the server keeps what hr_put_client_state sends and hands it back in every envelope (as hr_state_of does). */
    if (name === 'hr_put_client_state' && s.keepResidue) s.env.client_state = Object.assign({}, s.env.client_state, body.p_patch);
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
  await page.evaluate(([uid, f, st]) => window.__hub.send('hr:' + uid + ':0', { t: 'delta', frame: f, patch: { state: st } }), [UID, frame, s.env.state]);
  /* Applied = the page has parsed an answer at least as new as the re-read this frame asks for (every
     answer from here on carries s.env as it is now), then its own tasks after that have run. */
  const c = CLOCKS.get(page);
  if (c && c.paused) { await drive(page, { maxMs: 2000, pred: (v) => (window.__hsSeen || 0) >= v, arg: frame + 1 }); return; }
  await wait(page, (v) => (window.__hsSeen || 0) >= v, frame + 1);
  await page.evaluate(() => new Promise((ok) => setTimeout(() => setTimeout(ok, 0), 0)));
}

const FLOAT_IDS = ['dealt', 'taken', 'heal', 'xp', 'miss', 'supply', 'loot', 'ability', 'bleed_badge'];
const NODES = `({ row: document.querySelector('.hp-m[data-key="0"]'), kills: document.querySelector('[data-sec="totals"] dd[data-stat="kills"]'),
  slot: document.querySelector('.hb-slot[data-slot="3"]'), hp: document.querySelector('.hb-read-v[data-v="hp"]') })`;

/* A mutant needs ONE red rule: its run stops at the first (stopAtFirst), so the state waits a planted defect
   leaves hanging (LOAD_MS each) cost one wait, not twenty. The clean control and the plain run see every rule. */
const STOP = Symbol('first red');
async function checks(overrides, shots, { stopAtFirst = false } = {}) {
  const fails = [];
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.addInitScript(SEEN_SCRIPT);
    if (o.clock) {
      /* the page's clock, installed running (boot as usual); a timing rule pauses it and drives it */
      await page.clock.install();
      const c = { paused: false, now: 0, out: new Set(), held: new Set() };
      CLOCKS.set(page, c);
      page.on('request', (q) => c.out.add(q));
      page.on('requestfinished', (q) => c.out.delete(q));
      page.on('requestfailed', (q) => c.out.delete(q));
    }
    const s = scripted();
    if (o.prep) o.prep(s, page);
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
        /* Tracker r44: Next level in is the LEVEL's eta (1.5 h), not a skill's: the fixture's maxed Melee carries eta_h 0 and used to pin it at 00:00:00. */
        const nextClock = await page.evaluate(() => { const el = document.querySelector('.ha-analyzer [data-clock="next"]'); return el && el.textContent; });
        if (!/^01:(2\d|30):\d\d$/.test(String(nextClock))) fails.push('HS-4 Next level in shows "' + nextClock + '"; the server sent a Level eta of ' + FIXTURE.hunt_analyzer.hero.level.eta_h + ' h');
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
        /* The Level is the server's Level XP (r09: the hub and the Character tab read one field): 577,109 is
           Level 24 and 62% of the way to 25 on the shared curve, the hunt hero's level and xp_pct. */
        s.env.state = Object.assign({}, s.env.state, { level_xp: 577109 });
        /* Its re-read answers 600 ms late, as on a slow runner: GitHub run 39640048955 (in-page-5, clean control)
           read these numbers 200 ms after the re-read was ASKED and saw kills 164, hp 180/220. pushEnvelope now
           waits until the page has parsed the answer, so the slow answer must still be read whole. */
        s.accrueDelayMs = 600;
        await pushEnvelope(page, s);
        s.accrueDelayMs = 0;
        const after = await page.evaluate((src) => {
          const now = (0, eval)(src);
          return { rebuilt: Object.keys(now).filter((k) => now[k] !== window.__nodes[k]), kills: now.kills && now.kills.textContent, hp: now.hp && now.hp.textContent };
        }, NODES);
        if (after.rebuilt.length) fails.push('HS-2 a new envelope rebuilt ' + after.rebuilt.join(', ') + ' instead of patching it');
        if (after.kills !== '170' || !/^90\/220$/.test(String(after.hp))) fails.push('HS-2 the patched nodes did not take the new numbers (kills ' + after.kills + ', hp ' + after.hp + ')');
        /* HS-18 THE VITALS HUB: HP, mana, level, XP and stamina are the envelope's, and the next envelope replaces them. */
        const hub = () => page.evaluate(() => {
          const q = (s) => document.querySelector(s);
          const dash = (s) => (q(s).getAttribute('stroke-dasharray') || '').split(' ')[0];
          return { hp: q('.hb-read-v[data-v="hp"]').textContent, mana: q('.hb-read-v[data-v="mana"]').textContent, lv: q('.hb-lv').textContent,
            xp: q('.hb-xp').textContent, stam: q('.hb-stam-v').textContent, hpArc: dash('.hb-arc.is-hp'), manaArc: dash('.hb-arc.is-mana'), xpArc: dash('.hb-arc.is-xp'),
            manaShown: q('.hb-read.is-mana').getClientRects().length > 0 && q('.hb-arc.is-mana').getClientRects().length > 0, gauges: document.querySelectorAll('.hb-bar .hh-gauge').length };
        });
        const h1 = await hub();
        if (h1.hp !== '90/220' || h1.mana !== '40/60' || h1.lv !== '24' || h1.xp !== 'XP 62%' || h1.hpArc !== '40.9' || h1.manaArc !== '66.7' || h1.xpArc !== '62' || !/\d/.test(h1.stam)) {
          fails.push('HS-18 the hub does not show the envelope: ' + JSON.stringify(h1));
        }
        if (h1.gauges) fails.push('HS-18 the old flat gauges are still on the bar');
        /* A melee hero the server sends no mana pool still shows its mana gauge (every hero has mana). */
        Object.assign(s.env.hunt.hero, { mana: 0, mana_max: 0, level: 25, xp_pct: 0.05, hp: 220, regen_pm: 1000, mana_regen: 18 });
        s.env.state = Object.assign({}, s.env.state, { level_xp: 614202 });   // Level 25, 5% on
        s.env.party.members[0].hp = 220;
        await pushEnvelope(page, s);
        const h2 = await hub();
        if (h2.hp !== '220/220' || h2.mana !== '0/0' || h2.lv !== '25' || h2.xp !== 'XP 5%' || h2.hpArc !== '100' || !h2.manaShown) fails.push('HS-18 the next envelope did not replace the hub (or hid the mana gauge): ' + JSON.stringify(h2));
        /* Regen per second, one decimal: mana_regen is per MINUTE (18/min = 0.3/s); HP is the in-fight rate (220 x 3 permille x 1000 permille = 0.66/s). */
        const rg = await page.evaluate(() => [document.querySelector('[data-r="hp"]').textContent, document.querySelector('[data-r="mana"]').textContent]);
        if (rg[0] !== '+0.7/s' || rg[1] !== '+0.3/s') fails.push('HS-18 the hub regen reads ' + JSON.stringify(rg) + ', want ["+0.7/s","+0.3/s"]');
        Object.assign(s.env.hunt.hero, { mana: 40, mana_max: 60, hp: 180, level: 24, xp_pct: 0.62 });   // back to the fixture for the screenshots
        s.env.state = Object.assign({}, s.env.state, { level_xp: FIXTURE.state.level_xp });
        s.env.party.members[0].hp = 180;
        await pushEnvelope(page, s);
        /* HS-6: the log shows each fixture event once, after a restated envelope too. */
        await page.keyboard.press('Enter');
        await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-log'));
        const ids = FIXTURE.hunt_events.map((e) => 'i:' + e.id);
        const allIn = (want) => want.every((k) => document.querySelector('.hc-line[data-key="' + k + '"]'));
        await wait(page, allIn, ids);
        await pushEnvelope(page, s);
        await wait(page, allIn, ids);
        const lines = await page.evaluate(() => Array.from(document.querySelectorAll('.hc-line')).map((l) => l.getAttribute('data-key')));
        const missing = ids.filter((k) => !lines.includes(k));
        const dupes = lines.filter((k, i) => lines.indexOf(k) !== i);
        if (missing.length || dupes.length) fails.push('HS-6 combat log lines: missing [' + missing.join(',') + '] repeated [' + dupes.join(',') + ']');
        /* HS-17: images load once. This page runs with the HTTP cache OFF (Playwright routes it), so any
           new <img> is a request: (a) five envelopes with moving numbers, (b) the server's bar leaving for
           one envelope and coming back, twice, (c) a loot line leaving and coming back, twice, all fetch
           no image. Garbage is collected while each is gone, so nothing rides on what the browser held. */
        const pngs = [];
        const onReq = (q) => { if (/\.png(\?|$)/.test(q.url())) pngs.push(q.url().replace(base + '/', '')); };
        page.on('request', onReq);
        const cdp = await page.context().newCDPSession(page);
        const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); };
        for (let i = 0; i < 5; i++) { s.env.hunt_analyzer.hero.kills += 1; s.env.hunt_analyzer.hero.loot.rat_tail += 1; await pushEnvelope(page, s); }
        const repaintPngs = pngs.length;
        const bar = s.env.hunt_settings;
        let rebuilt = 0, sameNode = 0;
        for (let i = 0; i < 2; i++) {
          /* the node itself must come back: the browser's memory cache can serve a NEW <img> of the same
             URL without a request, so the request count alone never saw a rebuilt slot */
          await page.evaluate(() => { const im = document.querySelector('.hb-slot[data-slot="0"] img'); if (im) im.__hs17 = true; });
          delete s.env.hunt_settings;
          await pushEnvelope(page, s);
          if (await wait(page, () => !document.querySelector('.hb-slot[data-slot="0"] img'), null)) rebuilt++;
          await gc();
          s.env.hunt_settings = bar;
          await pushEnvelope(page, s);
          await wait(page, () => !!document.querySelector('.hb-slot[data-slot="0"] img'), null);
          if (await page.evaluate(() => { const im = document.querySelector('.hb-slot[data-slot="0"] img'); return !!im && im.__hs17 === true; })) sameNode++;
        }
        const loot = s.env.hunt_analyzer.hero.loot;
        const gel = loot.slime_gel;
        let lootBack = 0;
        for (let i = 0; i < 2; i++) {
          delete loot.slime_gel;
          await pushEnvelope(page, s);
          const gone = await wait(page, () => !document.querySelector('[data-sec="loot"] .ha-line[data-key="slime_gel"]'), null);
          await gc();
          loot.slime_gel = gel;
          await pushEnvelope(page, s);
          if (gone && await wait(page, () => !!document.querySelector('[data-sec="loot"] .ha-line[data-key="slime_gel"] img'), null)) lootBack++;
        }
        const oneAtlas = await page.evaluate(async () => {
          const v = new URL(document.querySelector('script[type="module"]').src).searchParams.get('v');
          const m = await import('/src/world/atlas.js?v=' + v);
          const [a, b] = await Promise.all([m.loadAtlasSet({ doc: document, version: v }, 'hunt'), m.loadAtlasSet({ doc: document, version: v }, 'hunt')]);
          const c = await m.loadAtlasSet({ doc: document, version: v }, 'hunt');
          return a.image === b.image && b.image === c.image;
        });
        page.off('request', onReq);
        if (sameNode !== 2) fails.push('HS-17 a slot icon that left and came back is a new <img> (' + sameNode + '/2 kept)');
        if (rebuilt !== 2) fails.push('HS-17 the bar did not empty when the server sent none (' + rebuilt + '/2), so the rebuild was never exercised');
        if (lootBack !== 2) fails.push('HS-17 the slime gel loot line did not leave and come back (' + lootBack + '/2), so its return was never exercised');
        if (repaintPngs) fails.push('HS-17 five repaints fetched images: ' + pngs.slice(0, repaintPngs).join(', '));
        if (pngs.length > repaintPngs) fails.push('HS-17 an icon that left and came back fetched its image again: ' + pngs.slice(repaintPngs).join(', '));
        if (!oneAtlas) fails.push('HS-17 the hunt atlas asked for three times was not one decoded image');
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

    { // HS-3 intent-only edits on the bar's panel: confirmed, then refused; HS-12 the panel holds what Hunt settings held, and there is no Hunt settings window
      const { ctx, page, s, up } = await open();
      if (up) {
        /* Target, stance, chase and distance live on the bar's panel (Tyler 10-19). */
        const P = '.hb-plaque';
        await wait(page, (p) => document.querySelector(p + ' [data-opt="stance"]:not([disabled])'), P);
        const btn = P + ' [data-opt="stance"][data-val="offensive"]';
        /* What the server says once it has saved: it saves what it confirms AT its answer (s.onOptions), so
           no re-read before it (the live view polls) can show a value early; and the answer is HELD while
           the in-flight state is read, so a slow box cannot let it land first. */
        s.onOptions = (o) => Object.assign(s.env.hunt_settings, o);
        s.holdOptions = true;
        await page.click(btn);
        const mid = await page.evaluate(([b, p]) => ({ off: document.querySelector(b).disabled, pressed: document.querySelector(b).getAttribute('aria-pressed'),
          allOff: Array.from(document.querySelectorAll(p + ' [data-opt]')).every((c) => c.disabled) }), [btn, P]);
        if (!mid.off || !mid.allOff) fails.push('HS-3 the panel controls stayed on while the intent was in flight');
        if (mid.pressed !== 'false') fails.push('HS-3 the stance showed as chosen before the server confirmed it');
        await until(() => s.sent('hr_action_set_options').length >= 1);
        s.release('options');
        const sent = s.calls.filter((c) => c.name === 'hr_action_set_options');
        if (sent.length !== 1 || JSON.stringify(sent[0].body.p_opts) !== '{"stance":"offensive"}' || sent[0].body.p_slot !== 0) fails.push('HS-3 the press sent ' + JSON.stringify(sent.map((c) => c.body)));
        const done = await wait(page, (b) => !document.querySelector(b).disabled && document.querySelector(b).getAttribute('aria-pressed') === 'true', btn);
        if (!done) fails.push('HS-3 after the server confirmed, the stance did not show the server’s new value');
        /* Refused: the server's value stays and the panel says why. */
        s.optionsReply = { ok: false, error: 'bad_option' };
        const def = P + ' [data-opt="stance"][data-val="defensive"]';
        await page.click(def);
        await page.waitForTimeout(100);
        const back = await wait(page, (b) => !document.querySelector(b).disabled, def);
        const r = await page.evaluate(([b, p]) => ({ pressed: document.querySelector(b).getAttribute('aria-pressed'), msg: document.querySelector(p + ' .hh-intent-msg').textContent }), [def, P]);
        if (!back || r.pressed !== 'false' || !r.msg) fails.push('HS-3 a refusal did not keep the server’s stance with a reason (' + JSON.stringify(r) + ')');
        /* HS-12: exactly target, stance, chase and distance; no eat/drink thresholds, no supplies, no density, no gathering; J opens nothing. */
        s.optionsReply = { ok: true };
        const opts = await page.evaluate((p) => Array.from(new Set(Array.from(document.querySelectorAll(p + ' [data-opt]')).map((e) => e.getAttribute('data-opt')))).sort().join(), P);
        if (opts !== 'chase,distance,gold_floor,stance,target_mode') fails.push('HS-12 the panel holds ' + opts);
        if (await page.evaluate(() => document.querySelector('.hb-plaque .hb-more').getClientRects().length > 0)) fails.push('HS-12 the phone sheet button shows on a desktop');
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        if (await page.$('[data-hs-win="hunt-settings"]')) fails.push('HS-12 a Hunt settings window still opens');
        /* Each control is ONE intent and shows only the server's value. */
        const one = async (label, act, want, set) => {
          const before = s.calls.filter((c) => c.name === 'hr_action_set_options').length;
          /* The server saves the value at its answer (s.onOptions, as in HS-3), so the live view's own
             re-reads cannot show it early and make the gesture a no-change. `set` is what it saves. */
          await act();
          await until(() => s.sent('hr_action_set_options').length > before);
          await wait(page, (p) => !document.querySelector(p).classList.contains('is-pending'), P);
          if (Object.entries(set).some(([k, v]) => s.env.hunt_settings[k] !== v)) fails.push('HS-12 ' + label + ': the server did not save ' + JSON.stringify(set));
          await page.waitForTimeout(150);
          const got = s.calls.filter((c) => c.name === 'hr_action_set_options').slice(before).map((c) => JSON.stringify(c.body.p_opts));
          if (got.length !== 1 || got[0] !== want) fails.push('HS-12 ' + label + ' sent ' + JSON.stringify(got) + ' (all: ' + JSON.stringify(s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts)) + ')');
        };
        await one('the target', () => page.selectOption(P + ' [data-opt="target_mode"]', 'weakest'), '{"target_mode":"weakest"}', { target_mode: 'weakest' });
        const chase0 = FIXTURE.hunt_settings.chase;
        await one('chase', () => page.click(P + ' [data-opt="chase"]'), JSON.stringify({ chase: !chase0 }), { chase: !chase0 });
        const d0 = FIXTURE.hunt_settings.distance;
        await one('distance', () => page.click(P + ' [data-opt="distance"][data-val="1"]'), JSON.stringify({ distance: d0 + 1 }), { distance: d0 + 1 });
        /* The gold to keep: typed, sent once on change; in flight the field shows the server's 300, then the confirmed 500. */
        const G = P + ' [data-opt="gold_floor"]';
        const g0 = await page.evaluate((g) => document.querySelector(g) && document.querySelector(g).value, G);
        if (g0 !== '300') fails.push('HS-12 the gold to keep does not show the server’s 300: ' + JSON.stringify(g0));
        const gBefore = s.calls.filter((c) => c.name === 'hr_action_set_options').length;
        /* The server's 500 is saved at its answer (s.onOptions); it used to be set BEFORE the typing, so a
           live-view re-read landing first on a slow box made 500 the server's already: no change, no intent. */
        s.holdOptions = true;
        await page.fill(G, '500');
        await page.dispatchEvent(G, 'change');
        const gMid = await page.evaluate((g) => ({ v: document.querySelector(g).value, off: document.querySelector(g).disabled }), G);
        if (gMid.v !== '300' || !gMid.off) fails.push('HS-12 the gold to keep showed the new value (or stayed on) before the server confirmed: ' + JSON.stringify(gMid));
        await until(() => s.sent('hr_action_set_options').length > gBefore);
        s.release('options');
        const gDone = await wait(page, (g) => document.querySelector(g).value === '500' && !document.querySelector(g).disabled, G);
        const gSent = s.calls.filter((c) => c.name === 'hr_action_set_options').slice(gBefore).map((c) => JSON.stringify(c.body.p_opts));
        if (!gDone || gSent.length !== 1 || gSent[0] !== '{"gold_floor":500}') fails.push('HS-12 the gold to keep sent ' + JSON.stringify(gSent) + ', shows ' + await page.evaluate((g) => document.querySelector(g).value, G));
        /* Refused: the server's 500 stays, the line says why. */
        s.optionsReply = { ok: false, error: 'rate_limited' };
        await page.fill(G, '800');
        await page.dispatchEvent(G, 'change');
        const gBack = await wait(page, (g) => !document.querySelector(g).disabled && document.querySelector(g).value === '500'
          && /^Too many changes/.test(document.querySelector('.hb-plaque .hh-intent-msg').textContent), G);
        if (!gBack) fails.push('HS-12 a refused gold to keep did not go back to the server’s 500 with a reason');
        s.optionsReply = { ok: true };
        const shown = await page.evaluate((p) => ({ target: document.querySelector(p + ' [data-opt="target_mode"]').value,
          chase: document.querySelector(p + ' [data-opt="chase"]').getAttribute('aria-pressed'), distance: document.querySelector(p + ' [data-show="distance"]').textContent }), P);
        if (shown.target !== 'weakest' || shown.chase !== String(!chase0) || shown.distance !== String(d0 + 1)) fails.push('HS-12 the panel does not show the server’s values: ' + JSON.stringify(shown));
        /* After a reload, the same values come back from the server. */
        await page.reload({ waitUntil: 'load' });
        if (!(await signInAndPlay(page, ''))) fails.push('HS-12 the screen did not mount after a reload');
        else {
          const again = await page.evaluate((p) => ({ target: document.querySelector(p + ' [data-opt="target_mode"]').value, stance: (document.querySelector(p + ' [data-opt="stance"][aria-pressed="true"]') || {}).getAttribute ? document.querySelector(p + ' [data-opt="stance"][aria-pressed="true"]').getAttribute('data-val') : null,
            distance: document.querySelector(p + ' [data-show="distance"]').textContent }), P);
          if (await page.evaluate((g) => document.querySelector(g).value, G) !== '500') fails.push('HS-12 after a reload the gold to keep is not the server’s 500');
          if (again.target !== 'weakest' || again.stance !== 'offensive' || again.distance !== String(d0 + 1)) fails.push('HS-12 after a reload the panel is not the server’s: ' + JSON.stringify(again));
        }
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
        /* Designer 2026-10-21: before 10 minutes the server sends no rate (per_hour null, the Level eta null):
           the totals still show, the rates give way to one line, and Next level in says when. */
        s.env.hunt_analyzer.hero.per_hour = null;
        s.env.hunt_analyzer.hero.level.eta_h = null;
        await pushEnvelope(page, s);
        const early = await page.evaluate(() => {
          const p = document.querySelector('.ha-analyzer');
          const shown = (el) => !!el && el.getClientRects().length > 0;
          return { kills: p.querySelector('[data-sec="totals"] [data-stat="kills"]').textContent, rates: shown(p.querySelector('[data-sec="rates"] .ha-stats')),
            line: shown(p.querySelector('.ha-later')) ? p.querySelector('.ha-later').textContent : null, next: p.querySelector('[data-clock="next"]').textContent };
        });
        if (!/\d/.test(early.kills) || early.rates || early.line !== 'Per hour after 10 min.' || early.next !== 'after 10 min') {
          fails.push('HS-4 a session under 10 minutes (per_hour null) did not show totals plus "Per hour after 10 min.": ' + JSON.stringify(early));
        }
        s.env.hunt_analyzer = clone(FIXTURE.hunt_analyzer);
        await pushEnvelope(page, s);
        const later = await page.evaluate(() => document.querySelector('[data-sec="rates"] .ha-stats').getClientRects().length > 0
          && document.querySelector('.ha-later').getClientRects().length === 0);
        if (!later) fails.push('HS-4 once the server sent rates, the per-hour rows did not come back');
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
        await wait(page, () => !/On the way/.test(document.querySelector('[data-hs-win="hunts"] .hh-intent-msg').textContent)
          && /You are hunting in/.test(document.querySelector('[data-hs-win="hunts"] .hw-hunts-now').textContent));
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
        /* HS-18 the rate that applies NOW: a hunt that is over no longer fights, so its in-fight regen is gone from the hub. */
        const overRg = await page.evaluate(() => [document.querySelector('[data-r="hp"]').textContent, document.querySelector('[data-r="mana"]').textContent]);
        if (overRg.join('') !== '') fails.push('HS-18 the hub still shows the hunt’s regen once it is over: ' + JSON.stringify(overRg));
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: false });
        await pushEnvelope(page, s);
        const live = await page.evaluate(() => { const n = document.querySelector('.ht-bar [data-hs-act="leave"]'); return !!n && n.getClientRects().length > 0; });
        if (!live) fails.push('HS-10 a running hunt shows no Leave hunt');
        /* HS-10b (visual gate v0.2.23 P1): the tutorial card of a hunting hero hangs UNDER the top bar and never
           covers it (Leave hunt is what the Cash in card points at); with a window open there is no card at all. */
        s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
        await pushEnvelope(page, s);
        const withWin = await page.evaluate(() => document.querySelectorAll('.hs-pointer').length);
        if (withWin) fails.push('HS-10b the tutorial card is drawn over an open window (' + withWin + ')');
        for (let i = 0; i < 4 && await page.$('[data-hs-win] [data-hs-close]'); i++) { await page.click('[data-hs-win] [data-hs-close]'); await page.waitForTimeout(300); }
        await wait(page, () => !document.querySelector('[data-hs-win]'));
        await pushEnvelope(page, s);
        await wait(page, () => document.querySelectorAll('.hs-pointer').length === 1);
        const geo = await page.evaluate(() => {
          const ps = Array.from(document.querySelectorAll('.hs-pointer'));
          const b = document.querySelector('.ht-bar');
          if (!b) return { err: 'no bar' };
          const r = b.getBoundingClientRect();
          const hit = ps.filter((p) => { const q = p.getBoundingClientRect(); return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; });
          return { n: ps.length, hit: hit.length, inBar: ps.filter((p) => p.closest('.hs-launchers')).length, wins: Array.from(document.querySelectorAll('[data-hs-win]')).map((w) => w.getAttribute('data-hs-win')) };
        });
        if (geo.err || geo.n !== 1 || geo.hit || geo.inBar) fails.push('HS-10b the tutorial card must be one box under the hunt bar, clear of it: ' + JSON.stringify(geo));
      } else fails.push('HS-9 the screen did not mount');
      await ctx.close();
    }

    { // HS-15 LEAVE HUNT COUNTS DOWN TO THE SERVER'S CLOSE (live v0.2.20 "very buggy and delayed";
      // Tyler 10-20: "a countdown so they know it's not just stuck")
      /* ON THE PINNED CLOCK (2026-10-21, P1): this rule is about time, so the page's clock is paused once the
         screen is up and moves only through drive(); the stub's server clock is that same virtual time three
         hours ahead. Every number below is derived from it, so a loaded box (a reload taking 5 s, an answer
         taking 2 s) changes nothing the rule sees. The old wall-clock rule lost 3-5 s to a slow reload and read
         an empty line (the countdown had run out) or a "Leaving in 7s". */
      const SKEW = 3 * 3600000;
      const LEAVE_IN = 5500;
      let leaveAt = null, clockOf = null;
      const { ctx, page, s, errors, up } = await open({ clock: true, prep: (sc, pg) => {
        clockOf = CLOCKS.get(pg);
        sc.clock = () => (clockOf.paused ? clockOf.now : Date.now()) + SKEW;
        /* the live view's start-point asks wait for a first boundary an hour off, so only the ordinary
           poll and the leave's own close ask */
        sc.env.hunt = Object.assign({}, sc.env.hunt, { session: Object.assign({}, sc.env.hunt.session, { hunt_from: new Date(sc.clock() + 3600000).toISOString() }) });
        sc.onLeave = () => {
          if (leaveAt === null) leaveAt = sc.clock() + LEAVE_IN;
          /* every settle asked from the answer on is slow (held): the number must not wait for any of them */
          sc.holdAccrue = true;
          const session = Object.assign({}, sc.env.hunt.session, { id: sc.env.hunt.session_id, leave_at: new Date(leaveAt).toISOString(), phase: 'leaving' });
          sc.env.hunt = Object.assign({}, sc.env.hunt, { session });
          /* the server's answer: the session it set leave_at on (hr_hunt_leave -> hr_hunt_view) */
          return { ok: true, pending: true, session };
        };
        /* the hunter's settle closes it once the server's clock is past leave_at (hunt-settle.js: a pending leave is never held back) */
        sc.onAccrue = () => {
          if (leaveAt === null || sc.clock() < leaveAt || sc.env.hunt.ended) return;
          sc.closedAt = clockOf.now + SKEW;
          sc.env.hunt = Object.assign({}, sc.env.hunt, { ended: true, session: Object.assign({}, sc.env.hunt.session, { leave_at: null, phase: 'ended', ended_at: new Date(leaveAt).toISOString(), end_reason: 'left' }) });
          sc.env.state = Object.assign({}, sc.env.state, { active_kind: 'idle', active_id: null });
        };
      } });
      if (up) {
        const label = () => page.evaluate(() => { const b = document.querySelector('.ht-bar [data-hs-act="leave"]'); const l = document.querySelector('.ht-bar .ht-leaving');
          return b && l ? { t: l.textContent, line: l.getClientRects().length > 0, off: b.disabled, shown: b.getClientRects().length > 0,
            px: parseFloat(getComputedStyle(l).fontSize), gold: getComputedStyle(l).color === getComputedStyle(document.querySelector('.ht-ground')).color, next: l.nextElementSibling === b } : null; });
        const counting = () => { const l = document.querySelector('.ht-bar .ht-leaving'); return !!l && l.getClientRects().length > 0 && /^Leaving in \d+s$/.test(l.textContent); };
        const n = (x) => Number(((x && x.t) || '').replace(/\D+/g, '')) || 0;
        /* What the line must read now: ceil(seconds to leave_at) on the server's clock (hunt-leave.js), which the
           page measures from its answers, so it may run up to one step (50 ms) behind ours. */
        const due = () => { const left = leaveAt - (clockOf.now + SKEW); return [Math.ceil(left / 1000), Math.ceil((left + 100) / 1000)]; };
        const reads = (x, want) => !!x && want.includes(n(x)) && /^Leaving in \d+s$/.test(x.t);
        const press = () => page.evaluate(() => { const b = document.querySelector('.ht-bar [data-hs-act="leave"]'); if (b) b.click(); });
        await pauseClock(page);
        await press();
        const t0 = clockOf.now;
        const flight = await label();
        await press();   // a second press while it pends
        if (!flight || flight.t !== 'Leaving…' || !flight.line || !flight.off) fails.push('HS-15 the press does not answer at once with Leaving… beside an off button: ' + JSON.stringify(flight));
        /* NO WORDLESS GAP: a number within 1.5 s of the press (page time), while the settle after it is still out */
        await until(() => s.leaveAnswered);
        const quick = await drive(page, { maxMs: 1500, pred: counting });
        if (!quick.ok) fails.push('HS-15 no number within 1.5 s of the press while the settle after it is out: ' + JSON.stringify(await label()));
        const a = await label();
        const wantA = due();
        if (!reads(a, wantA) || !a.off) fails.push('HS-15 the line does not count down to the server’s leave_at (want Leaving in ' + wantA.join(' or ') + 's, ' + (clockOf.now - t0) + ' ms after the press): ' + JSON.stringify(a));
        else if (!(a.px >= 12) || !a.gold || !a.next) fails.push('HS-15 the countdown is not gold label text >= 12 px right beside Leave hunt: ' + JSON.stringify(a));
        await drive(page, { maxMs: 1300 });
        const b = await label();
        const wantB = due();
        if (!reads(b, wantB) || !(n(b) < n(a))) fails.push('HS-15 the countdown does not tick (1.3 s later want ' + wantB.join(' or ') + 's): ' + JSON.stringify([a, b]));
        if (await page.$('.ht-bar [data-hs-act="leave"]:not([disabled])')) fails.push('HS-15 Leave hunt is pressable again while the leave pends');
        s.release('accrue');
        /* RELOAD during the wait: the same countdown, from the server's leave_at (the clock stays pinned) */
        await page.reload({ waitUntil: 'load' });
        const mounted = await drive(page, { maxMs: 4000, pred: () => !!document.querySelector('[data-app="play"][data-slot="0"], .hb-bar') });
        if (mounted.ok && await page.$('[data-app="play"][data-slot="0"]')) await page.evaluate(() => document.querySelector('[data-app="play"][data-slot="0"]').click());
        const back = await drive(page, { maxMs: 2000, pred: counting });
        const r = await label();
        const wantR = due();
        if (!back.ok || !reads(r, wantR) || !(n(r) >= 1 && n(r) <= n(b)) || !r.off) fails.push('HS-15 a reload during the leave lost its countdown (want ' + wantR.join(' or ') + 's): ' + JSON.stringify([b, r]));
        const leaves = s.sent('hr_hunt_leave').length;
        if (leaves !== 1) fails.push('HS-15 the leave was sent ' + leaves + ' times (want once)');
        /* THE CLOSE: asked a hair after leave_at, the hunt ends on screen, back in town; every line seen on the
           way is a whole number of seconds >= 1 or "Leaving now…" */
        const seen = new Set();
        const done = () => { const bar = document.querySelector('.ht-bar'); const l = bar && bar.querySelector('[data-hs-act="leave"]');
          return !!(bar && l && l.getClientRects().length === 0 && bar.querySelector('[data-hs-act="summary"]').getClientRects().length > 0); };
        const end = await drive(page, { maxMs: LEAVE_IN + 4000, pred: done, onStep: async () => { const x = await label(); if (x && x.line) seen.add(x.t); } });
        const lineUp = await page.evaluate(() => { const l = document.querySelector('.ht-bar .ht-leaving'); return !!l && l.getClientRects().length > 0; });
        const lag = s.closedAt && leaveAt !== null ? s.closedAt - leaveAt : null;
        if (!end.ok) fails.push('HS-15 the hunt never ended on screen after leave_at: ' + JSON.stringify(await label()));
        else if (lag === null || lag > 1500) fails.push('HS-15 the close was asked ' + lag + ' ms after leave_at (want within 1.5 s)');
        const odd = [...seen].filter((x) => !/^Leaving in [1-9]\d*s$|^Leaving now…$/.test(x));
        if (odd.length) fails.push('HS-15 the countdown showed ' + JSON.stringify(odd) + ' on its way to the close');
        if (lineUp) fails.push('HS-15 the leaving line stays up after the hunt ended');
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
        const reads = (t) => wait(page, (x) => { const l = document.querySelector('.ht-bar .ht-leaving'); return !!l && l.getClientRects().length > 0 && l.textContent === x; }, t);
        if (!(await reads('Leaving now…'))) fails.push('HS-16 a leave past its leave_at does not read "Leaving now…": ' + JSON.stringify(await line()));
        /* the server's leave_at is now long past (the close is late): the line says so, plainly */
        const asked = s.sent('hr-accrue').length;
        s.env.hunt = Object.assign({}, s.env.hunt, { session: Object.assign({}, s.env.hunt.session, { leave_at: iso(20000) }) });
        if (!(await reads('Still processing your leave…'))) fails.push('HS-16 a late close never says it is still being processed: ' + JSON.stringify(await line()));
        const l = await line();
        if (!l || !l.off) fails.push('HS-16 Leave hunt is pressable while the late leave is processed: ' + JSON.stringify(l));
        if (!(await until(() => s.sent('hr-accrue').length > asked))) fails.push('HS-16 the late close is not asked again');
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
        /* layout settles on its own schedule (a resize, a docked window): read once it has, or after LOAD_MS */
        const settled = async () => { for (const end = Date.now() + LOAD_MS; ;) { const o = await overlaps(); if (!o.length || Date.now() > end) return o; await sleep(100); } };
        const bare = await settled();
        if (bare.length) fails.push('HS-13 hunt panels overlap with no window open: ' + bare.join(', '));
        /* A window floats over the World and never narrows it (Tyler 10-19), so the row that is too
           narrow comes from the screen: a narrow desktop makes the edge panels step below the bar. */
        for (const vp of [{ width: 1100, height: 800 }, { width: 1024, height: 700 }]) {
          await page.setViewportSize(vp);
          await page.waitForTimeout(500);
          const narrow = await settled();
          if (narrow.length) fails.push('HS-13 hunt panels overlap at ' + vp.width + 'x' + vp.height + ': ' + narrow.join(', '));
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(400);
        await page.keyboard.press('Enter');
        await wait(page, () => document.querySelector('[data-hs-win="chat"]'));
        await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        await page.waitForTimeout(400);
        const docked = await settled();
        if (docked.length) fails.push('HS-13 hunt panels overlap with the chat window docked: ' + docked.join(', '));
      } else fails.push('HS-13 the screen did not mount');
      await ctx.close();
    }

    for (const vp of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 922, height: 423 }]) { // HS-26 a docked window never covers the analyzer (r11)
      const phone = vp.width < 1000, tag = vp.width + 'x' + vp.height;
      /* The phone hides the analyzer by default: this player shows it (a display preference, residue hudLayout). */
      const { ctx, page, up } = await open({ viewport: vp, prep: (s) => { if (phone) s.env.client_state = { hudLayout: { phone: { analyzer: { visible: true } } } }; } });
      if (up && await wait(page, () => document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"]'))) {
        const cover = () => page.evaluate(() => {
          const an = document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"]');
          const a = an.getBoundingClientRect();
          const shown = getComputedStyle(an).visibility !== 'hidden';
          const wins = Array.from(document.querySelectorAll('.hs-win:not(.is-leaving):not(.is-floating):not(.is-modal)'));
          const hits = shown ? wins.filter((w) => { const q = w.getBoundingClientRect(); return a.left < q.right - 1 && a.right > q.left + 1 && a.top < q.bottom - 1 && a.bottom > q.top + 1; }) : [];
          return { shown, n: wins.length, hits: hits.map((w) => w.getAttribute('data-hs-win')) };
        });
        /* The analyzer moves, the World does not (Tyler 10-19): opening the windows publishes no new camera inset. */
        await page.evaluate(() => { window.__insets = []; window.addEventListener('hearthrise:shell-inset', (e) => window.__insets.push(JSON.stringify(e.detail))); });
        for (const [key, id] of [['Enter', 'chat'], ['c', 'character']]) {
          await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
          await page.keyboard.press(key);
          await wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"]:not(.is-entering)'), id);
          await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
          let r;
          for (const end = Date.now() + LOAD_MS; ;) { r = await cover(); if ((r.n && !r.hits.length) || Date.now() > end) break; await sleep(100); }
          if (!r.n) fails.push('HS-26 at ' + tag + ' no window docked after ' + key);
          if (r.hits.length) fails.push('HS-26 at ' + tag + ' the docked ' + r.hits.join(', ') + ' covers the analyzer');
          if (vp.width >= 1920 && id === 'chat' && !r.shown) fails.push('HS-26 at ' + tag + ' the analyzer hid with the chat docked instead of moving beside it');
          if (shots) await page.screenshot({ path: join(shots, 'hunt-' + tag + '-docked-' + id + '.png') });
        }
        const insets = await page.evaluate(() => window.__insets);
        /* Desktop only: the phone sheet hides the top bar's ground name (hunt.css), which moved the inset before r11 too. */
        if (!phone && insets.length) fails.push('HS-26 at ' + tag + ' docking a window moved the camera inset: ' + insets.slice(0, 2).join(' -> '));
      } else fails.push('HS-26 the analyzer did not mount at ' + tag);
      await ctx.close();
    }

    { // HS-7 Configure action: a bar slot opens it centred; registry pickers; one whole-bar intent; off until confirmed; refusals inline
      const { ctx, page, s, up } = await open();
      if (up) {
        await page.click('.hb-slot[data-slot="2"]');
        const opened = await wait(page, () => { const f = document.querySelector('[data-hs-win="configure-action"].is-modal .hc-cfg'); return f && !f.classList.contains('is-empty'); }, null);
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
          /* the server saves slot 3's new test AT its answer, held while the in-flight state is read (as HS-3) */
          s.onOptions = (o) => { if (o.slots && o.slots[2]) s.env.hunt_settings.slots[2].conditions = o.slots[2].conditions; };
          const tipBefore = await page.evaluate(() => { const li = document.querySelector('.hb-slot[data-slot="2"]'); li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip').textContent; });
          s.holdOptions = true;
          await page.click('.hc-foot [data-x="save"]');
          const mid = await page.evaluate(() => Array.from(document.querySelectorAll('.hc-form button, .hc-form select, .hc-form input')).every((b) => b.disabled));
          if (!mid) fails.push('HS-7 Configure action stayed on while its intent was in flight');
          if (!/at or below 50%/.test(tipBefore)) fails.push('HS-7 the slot tooltip did not show the server’s setup: ' + tipBefore);
          await until(() => s.sent('hr_action_set_options').length >= 1);
          s.release('options');
          const sent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts);
          const sl = sent[0] && sent[0].slots;
          if (sent.length !== 1 || !Array.isArray(sl) || sl.length !== 20 || JSON.stringify(sl[2].conditions) !== '[{"metric":"self_hp_pct","op":"lt","value":40}]'
            || JSON.stringify(sl[0]) !== JSON.stringify({ action: FIXTURE.hunt_settings.slots[0].action, conditions: FIXTURE.hunt_settings.slots[0].conditions, join: 'and' })) {
            fails.push('HS-7 the save sent ' + JSON.stringify(sent).slice(0, 300));
          }
          const done = await wait(page, () => !document.querySelector('[data-hs-win="configure-action"]'), null);
          const tipAfter = await page.evaluate(() => { const li = document.querySelector('.hb-slot[data-slot="2"]'); li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip').textContent; });
          if (!done || !/below 40%/.test(tipAfter)) fails.push('HS-7 after the server confirmed, the slot did not show the server’s new test and close: ' + tipAfter);
          /* A refusal: shown inline on the condition the server names; the server's bar stays. */
          s.optionsReply = { ok: false, error: 'bad_value', slot: 0, condition: 0 };
          await page.click('.hb-slot[data-slot="0"]');
          await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null);
          await page.click('.hc-conds-head [data-x="add"]');
          await page.click('.hc-foot [data-x="save"]');
          const shown = await wait(page, () => document.querySelector('.hc-cond[data-cond="0"]').classList.contains('is-error')
            && document.querySelector('.hc-form .hh-intent-msg').textContent.length > 0, null);
          if (!shown) fails.push('HS-7 a server validation error was not shown on its condition');
          if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-configure-action.png') });
        }
      } else fails.push('HS-7 the screen did not mount');
      await ctx.close();
    }

    { // HS-23 THE HEAL WARNING (designer 2026-10-21, Andy died in the Sewer healing at 40%)
      const { ctx, page, s, up } = await open({ prep: (st) => { st.env.hunt.hunt_id = 'millrace_sewer'; } });
      if (up) {
        await page.click('.hb-slot[data-slot="2"]');
        await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null);
        const warn = () => page.evaluate(() => { const w = document.querySelector('.hc-warn'); return w && w.getClientRects().length ? w.textContent : ''; });
        /* Wheat Bread at HP 50% or below of 220 = 110 HP: above the King's 75, nothing to say. */
        const safe = await warn();
        await page.fill('.hc-cond[data-cond="0"] [data-f="value"]', '30');
        await page.dispatchEvent('.hc-cond[data-cond="0"] [data-f="value"]', 'change');
        const shown = await warn();
        if (safe !== '' || shown !== 'The Rat King can hit for 75. At 30% you have 66 HP, so one hit can kill you before you eat.') {
          fails.push('HS-23 the heal warning did not follow the threshold in a party of two: at 50% "' + safe + '", at 30% "' + shown + '"');
        }
        /* Alone the King's hall is skipped (minParty 2): the biggest blow is a Cistern Spider's 48, under 66. */
        s.env.party.members = [s.env.party.members[0]];
        await pushEnvelope(page, s);
        const solo = await warn();
        if (solo !== '') fails.push('HS-23 a solo hero (who never meets the Rat King) was warned: "' + solo + '"');
      } else fails.push('HS-23 the screen did not mount on the Sewer');
      await ctx.close();
    }
    { // HS-23 at 922x423 (v0.2.24 visual gate): the warning is on screen, beside Save, never scrolled away below it
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, prep: (st) => { st.env.hunt.hunt_id = 'millrace_sewer'; } });
      if (up) {
        await page.click('.hb-slot[data-slot="2"]');
        await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null);
        await page.fill('.hc-cond[data-cond="0"] [data-f="value"]', '30');
        await page.dispatchEvent('.hc-cond[data-cond="0"] [data-f="value"]', 'change');
        const seen = await page.evaluate(() => {
          const inView = (el) => { const r = el && el.getBoundingClientRect(); return !!r && r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; };
          const w = document.querySelector('.hc-warn');
          return { warn: inView(w), save: inView(document.querySelector('.hc-foot [data-x="save"]')), inFoot: !!(w && w.closest('.hc-foot')), text: w && w.textContent };
        });
        if (!seen.warn || !seen.save || !seen.inFoot || !/one hit can kill you/.test(String(seen.text))) fails.push('HS-23 at 922x423 the heal warning is not in view beside Save: ' + JSON.stringify(seen));
      } else fails.push('HS-23 the screen did not mount at 922x423');
      await ctx.close();
    }

    { // HS-19 drag on the bar: onto an empty slot it moves; onto an action a menu (Swap / Insert / cancel); one intent per choice; the status line clears
      const { ctx, page, s, up } = await open({ clock: true });
      if (up) {
        const wire = (x) => (x ? { action: x.action, conditions: x.conditions, join: x.join || 'and' } : null);
        const base = Array.from({ length: 20 }, (_, i) => wire(FIXTURE.hunt_settings.slots[i]));
        const drag = (from, to) => page.evaluate(([f, t]) => {
          const dt = new DataTransfer();
          const a = document.querySelector('.hb-slot[data-slot="' + f + '"]'), b = document.querySelector('.hb-slot[data-slot="' + t + '"]');
          a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        }, [from, to]);
        const sent = () => s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts.slots);
        const lastIs = async (label, want) => {
          await until(() => sent().length >= want.n);
          const all = sent();
          if (all.length !== want.n || JSON.stringify(all[all.length - 1]) !== JSON.stringify(want.bar)) fails.push('HS-19 ' + label + ' sent ' + String(JSON.stringify(all[all.length - 1])).slice(0, 400));
          const cleared = await wait(page, () => document.querySelector('.hb-plaque .hh-intent-msg').textContent === '', null);
          if (!cleared) fails.push('HS-19 the status line stayed after the server answered ' + label);
        };
        const menuOn = () => page.evaluate(() => document.querySelector('.hb-drop').classList.contains('is-on'));
        /* Onto an empty slot: it just moves there. */
        await drag(4, 7);
        if (await menuOn()) fails.push('HS-19 a drop onto an empty slot opened the menu');
        const moved = base.slice(); moved[7] = base[4]; moved[4] = null;
        await lastIs('a move onto an empty slot', { n: 1, bar: moved });
        /* Onto an action: the menu names the dragged action and the target; Escape cancels with no intent. */
        await drag(0, 2);
        const menu = await page.evaluate(() => ({ on: document.querySelector('.hb-drop').classList.contains('is-on'), title: document.querySelector('.hb-drop-t').textContent,
          swap: document.querySelector('.hb-drop [data-x="swap"]').textContent, insert: document.querySelector('.hb-drop [data-x="insert"]').textContent }));
        if (!menu.on || menu.title !== 'Power Strike' || menu.swap !== 'Swap with Wheat Bread' || menu.insert !== 'Insert here (shift the rest)') fails.push('HS-19 the drop menu reads ' + JSON.stringify(menu));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        if (await menuOn() || sent().length !== 1) fails.push('HS-19 Escape did not cancel the drop (menu or an intent left)');
        /* A press elsewhere cancels too. */
        await drag(0, 2);
        await page.mouse.click(700, 300);
        await page.waitForTimeout(300);
        if (await menuOn() || sent().length !== 1) fails.push('HS-19 a press away did not cancel the drop');
        /* Swap: exactly the two change places. */
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="swap"]'); else fails.push('HS-19 the drop menu did not open for a swap');
        const swapped = base.slice(); swapped[0] = base[2]; swapped[2] = base[0];
        await lastIs('a swap', { n: 2, bar: swapped });
        /* Insert: the target and the slots after it shift one place, up to the first empty slot — never past it (slot 9 stays). */
        s.env.hunt_settings.slots[8] = { action: { type: 'ability', id: 'challenge' }, conditions: [], join: 'and', usable: true, mana: 0 };
        await pushEnvelope(page, s);
        base[8] = wire(s.env.hunt_settings.slots[8]);
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="insert"]'); else fails.push('HS-19 the drop menu did not open for an insert');
        const ins = base.slice(); ins[0] = null; ins[2] = base[0]; ins[3] = base[2]; ins[4] = base[3]; ins[5] = base[4];
        await lastIs('an insert', { n: 3, bar: ins });
        /* Nothing moves before the server says so: in flight the slots keep the server's actions, and after an
           answer that leaves the server's bar as it was (this stub's hr_load still holds it) they still do. */
        const items = () => page.evaluate(() => Array.from(document.querySelectorAll('.hb-slot')).sort((a, b) => a.getAttribute('data-slot') - b.getAttribute('data-slot')).map((l) => l.getAttribute('data-item') || ''));
        const line = () => page.evaluate(() => document.querySelector('.hb-plaque .hh-intent-msg').textContent);
        const before = await items();
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="swap"]'); else fails.push('HS-19 the drop menu did not open for the in-flight check');
        const mid = await items();
        const midLine = await line();
        if (JSON.stringify(mid) !== JSON.stringify(before)) fails.push('HS-19 the bar moved before the server answered: ' + JSON.stringify(mid.slice(0, 4)));
        if (midLine !== 'Moving it…') fails.push('HS-19 no in-flight line on a drop: ' + JSON.stringify(midLine));
        const sw = base.slice(); sw[0] = base[2]; sw[2] = base[0];
        await lastIs('the in-flight swap', { n: 4, bar: sw });
        if (JSON.stringify(await items()) !== JSON.stringify(before)) fails.push('HS-19 the bar shows a move the server’s bar does not hold');
        /* A refusal: the line says why (never stays on "Moving it…") and the bar is the server's. */
        s.optionsReply = { ok: false, error: 'rate_limited' };
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="swap"]'); else fails.push('HS-19 the drop menu did not open for the refusal');
        const refused = await wait(page, () => /^Too many changes at once/.test(document.querySelector('.hb-plaque .hh-intent-msg').textContent), null);
        if (!refused) fails.push('HS-19 a refused drop left the line on ' + JSON.stringify(await line()));
        if (JSON.stringify(await items()) !== JSON.stringify(before)) fails.push('HS-19 a refused drop moved the bar');
        /* No answer at all: the line comes back after the bar's wait (data/hunt-hud.js BAR_ANSWER_MS) and the next drop is taken. */
        /* ON THE PINNED CLOCK (2026-10-21, P1): the save is held unanswered and the page's clock driven past
           the bar's wait, so the timeout is measured in page time, not a wall-clock race on a loaded box. */
        s.optionsReply = { ok: true };
        const BAR_MS = await page.evaluate(async () => (await import('/src/data/hunt-hud.js?v=0.1.0')).BAR_ANSWER_MS);
        await pauseClock(page);
        s.holdOptions = true;
        const nHeld = sent().length;
        await drag(0, 2);
        if (await menuOn()) await page.evaluate(() => document.querySelector('.hb-drop [data-x="swap"]').click()); else fails.push('HS-19 the drop menu did not open for the timeout');
        await until(() => sent().length > nHeld);
        const timedOut = (await drive(page, { maxMs: BAR_MS + 500, pred: () => /^The server has not answered/.test(document.querySelector('.hb-plaque .hh-intent-msg').textContent) })).ok;
        if (!timedOut) fails.push('HS-19 a drop the server never answered left the line on ' + JSON.stringify(await line()));
        s.release('options');   // the late answer lands (its effect is the re-read, like any other)
        await resumeClock(page);
        await until(() => CLOCKS.get(page).out.size === 0);
        await page.evaluate(() => new Promise((ok) => setTimeout(ok, 0)));
        const n0 = sent().length;
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="swap"]');
        await until(() => sent().length > n0);
        if (sent().length !== n0 + 1) fails.push('HS-19 after a timeout the next drop sent nothing (still pending)');
        await wait(page, () => document.querySelector('.hb-plaque .hh-intent-msg').textContent === '', null);
        if (shots) { await drag(0, 2); await page.screenshot({ path: join(shots, 'hunt-1440x900-drop-menu.png') }); await page.keyboard.press('Escape'); }
      } else fails.push('HS-19 the screen did not mount');
      await ctx.close();
    }

    { // HS-20 every struck slot says why: a glyph on the slot, the reason first in its tooltip (the server's rules, action-facts.js reasonOf)
      const { ctx, page, s, up } = await open();
      if (up) {
        const why = (i) => page.evaluate((k) => {
          const li = document.querySelector('.hb-slot[data-slot="' + k + '"]');
          li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          const w = document.querySelector('.hb-tip .is-why');
          return { off: li.classList.contains('is-off'), wait: li.classList.contains('is-wait'), glyph: !!li.querySelector('.hb-why svg'), text: w ? w.textContent : '' };
        }, i);
        const S = s.env.hunt_settings;
        Object.assign(S, { role: 'tank', supply_source: 'mine', on_empty: 'end' });
        s.env.hunt.hero.mana = 2;
        S.slots[2] = Object.assign({}, S.slots[2], { count: 0 });
        S.slots[5] = { action: { type: 'consume', id: 'food' }, conditions: [], join: 'and', usable: true, count: 0 };
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        S.slots[7] = { action: { type: 'consume', id: 'food' }, conditions: [], join: 'and', usable: false, count: 3 };
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const want = [
          [0, 'mana', /^Needs 6 mana, you have 2\.$/, false],
          [1, 'rune', /^Needs a Fire Rune in the bag/, true],
          [2, 'stock', /^Out of stock and no store fallback/, true],
          [5, 'store off', /^Out of stock, and this hero is set to end the hunt rather than buy from the store/, true],
          [7, 'server', /^The server says this cannot fire now\.$/, true],
        ];
        /* EVERY struck or waiting slot on the bar, not only the ones named: a glyph on it, the reason as its tooltip's first line. */
        const sweep = async (label) => {
          const all = await page.evaluate(() => Array.from(document.querySelectorAll('.hb-slot.is-off, .hb-slot.is-wait')).map((li) => {
            li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            const first = document.querySelector('.hb-tip p');
            return { slot: li.getAttribute('data-slot'), glyph: !!li.querySelector('.hb-why svg'), why: !!first && first.classList.contains('is-why') && first.textContent.length > 8 };
          }));
          const bad = all.filter((x) => !x.glyph || !x.why);
          if (!all.length || bad.length) fails.push('HS-20 ' + label + ': a struck slot without its glyph or reason ' + JSON.stringify(bad.length ? bad : all));
        };
        await sweep('the tank bar');
        for (const [i, label, re, strike] of want) {
          const w = await why(i);
          if (!re.test(w.text) || !w.glyph || w.off !== strike || w.wait !== !strike) fails.push('HS-20 the ' + label + ' slot reads ' + JSON.stringify(w));
        }
        if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-slot-reasons.png') });
        S.role = 'healer';
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const wrong = await why(0);
        if (!/^Your weapon can’t use this\. Needs /.test(wrong.text) || !wrong.off || !wrong.glyph) fails.push('HS-20 the wrong-weapon slot reads ' + JSON.stringify(wrong));
        await sweep('the healer bar');
        delete S.role;
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const none = await why(0);
        if (!/^No weapon worn/.test(none.text) || !none.off || !none.glyph) fails.push('HS-20 the no-weapon slot reads ' + JSON.stringify(none));
        await sweep('the bar with no weapon');
      } else fails.push('HS-20 the screen did not mount');
      await ctx.close();
    }

    { // HS-24 THE PICKER'S PERSONAL BESTS are the server's (hunt_bests), replaced by each envelope; empty = "No hunt of 10 min yet"
      const { ctx, page, s, errors, up } = await open({ town: true, prep: (sc) => {
        sc.env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 12400, balance_h: 3100 } } } };
      } });
      if (up) {
        await page.keyboard.press('h');
        const card = (hunt) => page.evaluate((h) => {
          const li = document.querySelector('[data-hs-win="hunts"] .hw-hunt[data-hunt="' + h + '"]');
          const t = (q) => { const n = li && li.querySelector(q); return n && n.getClientRects().length > 0 ? n.textContent : null; };
          const px = li && li.querySelector('.hw-hunt-best-solo') ? parseFloat(getComputedStyle(li.querySelector('.hw-hunt-best-solo')).fontSize) : 0;
          return li ? { solo: t('.hw-hunt-best-solo'), party: t('.hw-hunt-best-party'), px } : null;
        }, hunt);
        await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt[data-hunt="mill_cellar"] .hw-hunt-best-solo'), null, 4000);
        const a = await card('mill_cellar');
        if (!a || a.solo !== 'Best alone: 12,400 Level XP per hour · balance 3,100 gp per hour' || a.party !== 'Best in a party: No hunt of 10 min yet' || !(a.px >= 12)) {
          fails.push('HS-24 the picker card does not show the server’s personal bests: ' + JSON.stringify(a));
        }
        const other = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="hunts"] .hw-hunt:not([data-hunt="mill_cellar"]) .hw-hunt-best-solo')).map((n) => n.textContent));
        if (!other.length || other.some((x) => x !== 'Best alone: No hunt of 10 min yet')) fails.push('HS-24 a ground with no best does not say so: ' + JSON.stringify(other.slice(0, 3)));
        /* The next envelope REPLACES the bests (a better party hunt landed, the solo one is gone from this read). */
        s.env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { party: { xp_h: 20500, balance_h: -450 } } } };
        await pushEnvelope(page, s);
        const b = await card('mill_cellar');
        if (!b || b.solo !== 'Best alone: No hunt of 10 min yet' || b.party !== 'Best in a party: 20,500 Level XP per hour · balance -450 gp per hour') {
          fails.push('HS-24 the picker card is not replaced by the next envelope: ' + JSON.stringify(b));
        }
        if (errors.length) fails.push('HS-24 console errors: ' + errors.slice(0, 3).join(' | '));
      } else fails.push('HS-24 the screen did not mount in town');
      await ctx.close();
    }

    for (const premium of [true, false]) { // HS-25 THE HUNT SUMMARY shows the server's balance per hour to everyone; raw XP per hour only to premium
      const { ctx, page, s, up } = await open({ prep: (sc) => {
        sc.keepResidue = true;   // the stored summary is display residue: the server hands it back on a re-read
        if (premium) return;
        /* A free character: the basic analyzer (2026-11-04-hunt-bests.sql) carries balance per hour, never raw XP. */
        sc.env.premium = Object.assign({}, sc.env.premium, { active: false });
        sc.env.hunt_analyzer.tier = 'basic';
        delete sc.env.hunt_analyzer.hero.per_hour.raw_xp;
        delete sc.env.hunt_analyzer.hero.per_hour.waste;
      } });
      const tag = premium ? 'premium' : 'free';
      if (up) {
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true });
        await pushEnvelope(page, s);
        /* A freshly ended hunt opens its summary; if it has not yet, the top bar's Summary does. */
        if (!(await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"]'), null, 2000))) await page.click('.ht-bar [data-hs-act="summary"]').catch(() => {});
        const shown = await wait(page, () => { const d = document.querySelector('[data-hs-win="hunt-summary"] .hsum-card.is-on [data-stat="balanceH"]'); return d && d.textContent !== ''; }, null, 4000);
        /* and it stays: a re-read after the end (before or after the residue put) keeps the card */
        await pushEnvelope(page, s);
        const got = await page.evaluate(() => {
          const v = (k) => { const d = document.querySelector('[data-hs-win="hunt-summary"] [data-stat="' + k + '"]'); return d && d.parentNode.getClientRects().length > 0 ? d.textContent : null; };
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          return { balanceH: v('balanceH'), rawXpH: v('rawXpH'), win: !!w, card: !!(w && w.querySelector('.hsum-card.is-on')),
            text: w ? w.textContent.slice(0, 160) : null };
        });
        const ph = FIXTURE.hunt_analyzer.hero.per_hour;
        const want = { balanceH: ph.balance.toLocaleString('en-US') + ' gp', rawXpH: premium ? ph.raw_xp.toLocaleString('en-US') : null };
        if (!shown || got.balanceH !== want.balanceH || got.rawXpH !== want.rawXpH) fails.push('HS-25 the ' + tag + ' summary shows ' + JSON.stringify(got) + '; the server sent ' + JSON.stringify(want));
      } else fails.push('HS-25 the ' + tag + ' screen did not mount');
      await ctx.close();
    }

    { // HS-21 the cooldown ember: the hero's played `cast` cools that ability's slot for its catalogue cooldown; the ember rises as it runs out
      /* ON THE PINNED CLOCK (2026-10-21, P1): paused before the cast lands, so the cooldown cannot run out
         between two reads on a loaded box (it was read at 0.2 s left, then over); 1 s of page time apart. */
      const { ctx, page, s, up } = await open({ clock: true });
      if (up) {
        const delay = await page.evaluate(async () => (await import('/src/session/config.js?v=0.1.0')).SESSION_CONFIG.huntPlaybackDelayMs);
        const D = Number.isFinite(delay) ? delay : 19000;
        const now = s.env.hunt_server_now_ms;
        /* A cast that plays at once (its time is already behind the playback delay) by the viewed hero (unit 1). */
        s.env.hunt_events = s.env.hunt_events.concat([{ id: 'cd:1', type: 'cast', atMs: now - D - 500, u: 1, t: 101, ability: 'power_strike' }]);
        await pauseClock(page);
        await pushEnvelope(page, s);
        const read = () => page.evaluate(() => {
          const li = document.querySelector('.hb-slot[data-slot="0"]');
          return { on: li.classList.contains('is-cooling'), h: parseFloat(li.querySelector('.hb-cd-ember').style.height) || 0, sec: li.querySelector('.hb-cd-s').textContent,
            other: document.querySelector('.hb-slot[data-slot="2"]').classList.contains('is-cooling') };
        });
        const ok1 = (await drive(page, { maxMs: 1000, pred: () => document.querySelector('.hb-slot[data-slot="0"]').classList.contains('is-cooling') })).ok;
        const a = await read();
        await drive(page, { maxMs: 1000 });
        const b = await read();
        const fell = Number(a.sec) - Number(b.sec);
        if (!ok1 || !(a.h > 0 && a.h < 100) || !(Number(a.sec) > 0 && Number(a.sec) <= 6) || a.other) fails.push('HS-21 the cast did not cool its slot with an ember: ' + JSON.stringify(a));
        /* 1 s of page time = four display ticks (shell.js DISPLAY_TICK_MS 250), so both reads sit at the same tick
           phase: the seconds fall by exactly 1.0 (one decimal shown) */
        else if (!(b.h > a.h) || !(Math.abs(fell - 1) < 0.05)) fails.push('HS-21 the ember did not rise as the cooldown ran out (1 s of page time apart, want 1.0 less): ' + JSON.stringify([a, b]));
        if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-cooldown.png') });
      } else fails.push('HS-21 the screen did not mount');
      await ctx.close();
    }

    { // HS-11 a slot that can never fire: the same action under weaker conditions earlier shows "!" and why; emptying the earlier one clears it
      const { ctx, page, s, up } = await open();
      if (up) {
        s.env.hunt_settings.slots[6] = { action: { type: 'ability', id: 'power_strike' }, conditions: [{ metric: 'enemies_in_aoe', op: 'lte', value: 1 }, { metric: 'self_hp_pct', op: 'gt', value: 50 }], join: 'and', usable: true, mana: 6 };
        await pushEnvelope(page, s);
        const blocked = await wait(page, () => document.querySelector('.hb-slot[data-slot="6"]').classList.contains('is-blocked')
          && !document.querySelector('.hb-slot[data-slot="0"]').classList.contains('is-blocked'), null);
        const tip = await page.evaluate(() => { document.querySelector('.hb-slot[data-slot="6"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip .is-warn:not(.is-why)') ? document.querySelector('.hb-tip .is-warn:not(.is-why)').textContent : ''; });
        if (!blocked || !/Blocked by Power Strike \(slot 1\)/.test(tip)) fails.push('HS-11 the never-firing slot shows no "!" or no reason: ' + tip);
        s.env.hunt_settings.slots[0] = null;
        await pushEnvelope(page, s);
        if (!(await wait(page, () => !document.querySelector('.hb-slot[data-slot="6"]').classList.contains('is-blocked'), null))) fails.push('HS-11 emptying the earlier slot did not clear the "!"');
      } else fails.push('HS-11 the screen did not mount');
      await ctx.close();
    }

    for (const vp of shots ? [{ width: 1440, height: 900 }, { width: 922, height: 423 }] : [{ width: 1440, height: 900 }]) { // HS-8 in town
      const { ctx, page, s, up } = await open({ town: true, viewport: vp });
      const tag = vp.width + 'x' + vp.height;
      if (!up) { fails.push('HS-8 the town bar did not mount (' + tag + ')'); await ctx.close(); continue; }
      const town = await page.evaluate(() => ({ bar: !!document.querySelector('.hb-bar.is-town'),
        mana: (document.querySelector('.hb-read.is-mana') || { getClientRects: () => [] }).getClientRects().length > 0,
        plus: getComputedStyle(document.querySelector('.hb-slot[data-slot="5"] .hb-plus')).display }));
      if (!town.bar || !town.mana) fails.push('HS-8 in town the bar or its vitals hub is missing: ' + JSON.stringify(town));
      if (town.plus === 'none') fails.push('HS-8 an empty slot shows no "+"');
      const townRg = await page.evaluate(() => [document.querySelector('[data-r="hp"]').textContent, document.querySelector('[data-r="mana"]').textContent]);
      if (townRg.join('') !== '') fails.push('HS-18 in town the hub shows a regen the server never sent: ' + JSON.stringify(townRg));
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-bar.png') });
      /* Configure an empty slot from its "+": Items, Any food (the store price shown, paid as used), IF My HP % below 60. */
      await page.click('.hb-slot[data-slot="5"]');
      await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .hc-title'), null);
      await page.click('.hc-tab[data-tab="items"]');
      await page.click('.hc-choice[data-id="food"]');
      const note = await page.evaluate(() => ({ choice: document.querySelector('.hc-choice[data-id="food"] .hc-choice-note').textContent,
        facts: document.querySelector('.hc-facts').textContent, type: document.querySelector('.hc-type').textContent }));
      if (!/store from \d+ g each/.test(note.choice) || !/paid as used/.test(note.facts)) fails.push('HS-8 Any food does not show the store price paid as used: ' + JSON.stringify(note));
      /* Designer 2026-10-21: "your best food first" misled Andy; the engine eats the SMALLEST own food that covers the gap (action-rules.js). */
      if (note.type !== 'Food: your own food first, the smallest that covers what you are missing, then the store’s, restoring health.') fails.push('HS-8 Any food does not say which food it eats: ' + JSON.stringify(note.type));
      /* A food slot starts at HP below 50% (Eat at is gone); the player moves it to 60. */
      if ((await page.$$eval('.hc-cond.is-on', (n) => n.length)) !== 1) fails.push('HS-8 a new food slot does not start with its HP condition');
      await page.fill('.hc-cond[data-cond="0"] [data-f="value"]', '60');
      await page.dispatchEvent('.hc-cond[data-cond="0"] [data-f="value"]', 'change');
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-configure-action.png') });
      const want = { action: { type: 'consume', id: 'food' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' };
      /* The server saves at its answer (never before the press, where a live re-read could show it early):
         the slot as sent; a density it answers with 4, not the 5 asked, so what shows after is the server's. */
      s.onOptions = (o) => {
        if (o.slots && o.slots[5]) s.env.hunt_settings.slots[5] = Object.assign({ usable: true, count: 0 }, want);
        if ('density' in o) s.env.hunt_settings.density = 4;
      };
      await page.click('.hc-foot [data-x="save"]');
      await until(() => s.sent('hr_action_set_options').length >= 1);
      const sent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts);
      if (sent.length !== 1 || JSON.stringify(sent[0].slots[5]) !== JSON.stringify(want)) fails.push('HS-8 the town save sent ' + JSON.stringify(sent).slice(0, 300));
      const saved = await wait(page, () => /Any food/.test(document.querySelector('.hb-slot[data-slot="5"]').getAttribute('aria-label')) && !document.querySelector('[data-hs-win="configure-action"]'), null);
      if (!saved) fails.push('HS-8 the town slot did not show the server’s Any food after it confirmed');
      /* Nobody is told to buy first (Tyler 10-19): with Any food on the bar and an empty bag, Hunt prep reads the store per use. */
      await page.keyboard.press('p');
      const prep = await wait(page, () => /Food: the store, from \d+ gp each as used/.test((document.querySelector('[data-hs-win="hunt-prep"] .hw-checks') || {}).textContent || ''), null);
      const prepText = await page.evaluate(() => (document.querySelector('[data-hs-win="hunt-prep"]') || {}).innerText || '');
      if (!prep || /0 food/.test(prepText)) fails.push('HS-8 Hunt prep does not read the store per use for Any food: ' + prepText.slice(0, 200));
      await page.keyboard.press('p');
      /* Density on the hunt picker: the press answers at once, a run of presses is ONE intent, the server's answer replaces the draft. */
      await page.keyboard.press('h');
      await wait(page, () => document.querySelector('.hw-hunt.is-picked .hw-density.is-on'), null);
      const dRead = () => page.evaluate(() => {
        const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val');
        return { v: v.textContent, pending: v.getAttribute('data-pending'), msg: document.querySelector('.hw-hunts .hh-intent-msg').textContent,
          facts: document.querySelector('.hw-hunt.is-picked .hw-hunt-facts').textContent };
      });
      const d0 = await dRead();
      if (d0.v !== '1 each') fails.push('HS-8 the density does not show the server’s pick of 1: ' + d0.v);
      if (!/ packs? of 1[ ,]/.test(d0.facts)) fails.push('HS-8 the facts line does not say the pull size at the server’s pick of 1: ' + d0.facts);
      /* the save answers 4 (not the 5 asked, s.onOptions): what shows afterwards is the server's. The answer
         is held while the unsaved draft is read, so a slow box cannot let it land first. */
      s.holdOptions = true;
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
      await until(() => s.sent('hr_action_set_options').length > sentBefore);
      s.release('options');
      if (!(await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val'); return v.textContent === '4 each' && v.getAttribute('data-pending') === 'false'; }, null))) fails.push('HS-8 the density did not show the server’s answer of 4 after the save: ' + JSON.stringify(await dRead()));
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
        return v.textContent === '4 each' && v.getAttribute('data-pending') === 'false' && m && !/Saving/.test(m); }, null);
      if (!refused) fails.push('HS-8 a refused density save does not show the server’s 4 and why: ' + JSON.stringify(await dRead()));
      s.optionsReply = { ok: true };
      /* Reload: the slot and the density come back from the server, nothing from the browser. */
      await page.reload({ waitUntil: 'load' });
      const back = await signInAndPlay(page, '', true);
      if (!back) fails.push('HS-8 the town did not mount after a reload');
      else {
        const slot = await wait(page, () => /Any food/.test(document.querySelector('.hb-slot[data-slot="5"]').getAttribute('aria-label')), null);
        await page.click('.hb-slot[data-slot="5"]');
        const cond = await wait(page, () => { const n = document.querySelector('.hc-cond[data-cond="0"].is-on [data-f="value"]'); return n && n.value === '60'; }, null);
        if (!slot || !cond) fails.push('HS-8 after a reload the slot or its condition is not the server’s');
        await page.keyboard.press('Escape');
        await page.keyboard.press('h');
        if (!(await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val'); return v && v.textContent === '4 each'; }, null))) fails.push('HS-8 after a reload the density is not the server’s');
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
        const shown = await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density.is-on .hh-step-val'); return v && /Set by/.test(v.textContent); }, null);
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
          return d && !/Set by/.test(d.querySelector('.hh-step-val').textContent) && [...d.querySelectorAll('[data-by]')].every((b) => b.offsetParent !== null); }, null);
        if (!lead) fails.push('HS-14 the leader does not get its density step back');
      } else fails.push('HS-14 the town did not mount');
      await ctx.close();
    }

    for (const town of [false, true]) { // HS-22 THE PHONE BAR at 922x423 (v0.2.23 gate: 874 x 178, 42% of the screen)
      const tag = town ? 'in town' : 'in a hunt';
      /* three party invites waiting: three alert lines, so the stack has a height to collide with */
      const { ctx, page, s, up } = await open({ viewport: { width: 922, height: 423 }, town, prep: (sc) => {
        sc.env.party_invites = [1, 2, 3].map((n) => ({ id: '00000000-0000-4000-8000-00000000000' + n, hunt: 'mill_cellar', from: 'Mira' }));
      } });
      if (up) {
        await wait(page, () => { const a = document.querySelector('[data-hs-widget="alerts"]'); return !!a && a.getBoundingClientRect().height >= 60; });
        const rect = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; }, sel);
        const bar = await rect('.hb-bar'), alerts = await rect('[data-hs-widget="alerts"]');
        if (!bar || bar.h > 100) fails.push('HS-22 ' + tag + ' the phone bar is ' + (bar && Math.round(bar.h)) + ' px tall (want <= 100)');
        if (!alerts || alerts.h < 60) fails.push('HS-22 ' + tag + ' CONTROL: three invites made no alert stack (' + (alerts && Math.round(alerts.h)) + ' px)');
        else if (bar && alerts.bottom > bar.top) fails.push('HS-22 ' + tag + ' the alerts reach ' + Math.round(alerts.bottom) + ', below the bar top ' + Math.round(bar.top));
        /* A stack that GROWS after it was placed (a new line, a late stylesheet) still ends above the bar: it is
           re-placed at its new size, never grown down over the bar's buttons (v0.2.24 run 39670839568: the
           "No thanks" of an invite took the Fight settings press on a runner). */
        if (!town) {
          /* no envelope lands meanwhile (its repaint would re-place the stack and hide the bug): the settles are held */
          s.holdAccrue = true;
          const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
          await until(() => !s.accrueLive);
          await page.evaluate(() => new Promise((ok) => setTimeout(ok, 0)));
          await frames();
          const grow = await page.addStyleTag({ content: '[data-hs-widget="alerts"] { padding-bottom: 48px !important; }' });
          const clear = (q) => { const a = document.querySelector(q.a).getBoundingClientRect(), b = document.querySelector(q.b).getBoundingClientRect(); return a.height > 0 && a.bottom <= b.top; };
          await frames();
          const grown = await rect('[data-hs-widget="alerts"]'), bar2 = await rect('.hb-bar');
          s.release('accrue');
          if (!grown || !bar2 || grown.bottom > bar2.top || grown.h < (alerts ? alerts.h + 40 : 100)) fails.push('HS-22 an alert stack that grew after it was placed reaches ' + (grown && Math.round(grown.bottom)) + ', below the bar top ' + (bar2 && Math.round(bar2.top)) + ' (' + (grown && Math.round(grown.h)) + ' px tall)');
          await grow.evaluate((n) => n.remove());
          await wait(page, clear, { a: '[data-hs-widget="alerts"]', b: '.hb-bar' });
        }
        /* The panel keeps the set and its buttons; the rest is a sheet: shut, then open on the bar's button, on top, then shut on Escape. */
        const onTopFn = () => { const c = document.querySelector('.hb-pl-more [data-opt="target_mode"]'); const b = c.getBoundingClientRect();
          const h = document.elementFromPoint(b.left + 6, b.top + 6); return b.width > 0 && b.right <= innerWidth && b.left >= 0 && (h === c || c.contains(h)); };
        const onTop = () => page.evaluate(onTopFn);
        if (await onTop()) fails.push('HS-22 ' + tag + ' the fight settings show on the bar before its sheet is opened');
        /* No alert over the Party panel (its HP and MP rows) */
        const party = await rect('.hp-party');
        if (party && alerts && !(alerts.right <= party.left || alerts.left >= party.right || alerts.bottom <= party.top || alerts.top >= party.bottom)) {
          fails.push('HS-22 ' + tag + ' the alerts lie over the Party panel: ' + JSON.stringify([alerts, party]));
        }
        await page.click('.hb-plaque .hb-more');
        await page.waitForTimeout(300);
        await wait(page, onTopFn);
        if (!(await onTop())) fails.push('HS-22 ' + tag + ' the bar’s settings button did not slide the fight settings out on top');
        /* The sheet opens inside the World, under the hunt bar: Leave hunt and the icon row stay in reach (gate P3). */
        const sheet = await rect('.hb-pl-more'), ht = town ? null : await rect('.ht-bar');
        if (sheet && ht && !(sheet.top >= ht.bottom || sheet.left >= ht.right || sheet.right <= ht.left)) fails.push('HS-22 the fight settings sheet covers the hunt bar: ' + JSON.stringify([sheet, ht]));
        if (sheet && sheet.top < 40) fails.push('HS-22 ' + tag + ' the fight settings sheet starts at ' + Math.round(sheet.top) + ', over the top strip');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        await wait(page, (src) => !(0, eval)(src)(), String(onTopFn));
        if (await onTop()) fails.push('HS-22 ' + tag + ' Escape did not close the fight settings sheet');
        /* An open window (Configure action, from a slot) has no alert drawn over it (gate P1: they hid its item names). */
        await page.click('.hb-slot[data-slot="2"]');
        if (await wait(page, () => document.querySelector('[data-hs-win="configure-action"]:not(.is-leaving)'), null)) {
          await page.waitForTimeout(300);
          const over = await page.evaluate(() => {
            const w = document.querySelector('[data-hs-win="configure-action"]').getBoundingClientRect(), a = document.querySelector('[data-hs-widget="alerts"]');
            const hits = [];
            for (const line of a.querySelectorAll('*')) {
              const b = line.getBoundingClientRect();
              const x0 = Math.max(b.left, w.left), x1 = Math.min(b.right, w.right), y0 = Math.max(b.top, w.top), y1 = Math.min(b.bottom, w.bottom);
              if (!(x1 > x0 && y1 > y0)) continue;
              const h = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
              if (a.contains(h)) hits.push(String(h.className || h.tagName));
            }
            return hits;
          });
          if (over.length) fails.push('HS-22 ' + tag + ' an alert draws over the open Configure action window: ' + over.slice(0, 3).join(','));
          await page.keyboard.press('Escape');
          await wait(page, () => !document.querySelector('[data-hs-win="configure-action"]'));
        } else fails.push('HS-22 ' + tag + ' a bar slot did not open Configure action');
        /* A slot's tooltip draws over the alert stack beside it (v0.2.23 gate P2a): every point where the two meet is the tooltip's. */
        /* a real hover: whatever covers the slot takes it (then no tooltip, and the rule says so) */
        await page.hover('.hb-slot[data-slot="8"]', { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        if (!town) await wait(page, () => document.querySelector('.hb-tip').classList.contains('is-on'));
        const tipOver = await page.evaluate(() => {
          const t = document.querySelector('.hb-tip'), a = document.querySelector('[data-hs-widget="alerts"]');
          if (!t.classList.contains('is-on')) return 'no tooltip';
          t.style.pointerEvents = 'auto';
          const tb = t.getBoundingClientRect(), ab = a.getBoundingClientRect();
          const x0 = Math.max(tb.left, ab.left) + 4, x1 = Math.min(tb.right, ab.right) - 4, y0 = Math.max(tb.top, ab.top) + 4, y1 = Math.min(tb.bottom, ab.bottom) - 4;
          if (!(x1 > x0 && y1 > y0)) return 'apart';
          const out = [];
          for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { const h = document.elementFromPoint(x, y); if (!t.contains(h)) out.push(String(h && h.className)); }
          t.style.pointerEvents = '';
          return out.length ? out.join(',') : 'ok';
        });
        if (!town && tipOver !== 'ok') fails.push('HS-22 the slot tooltip does not draw over the alerts: ' + tipOver);
      } else fails.push('HS-22 the phone screen did not mount ' + tag);
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
  } catch (e) { if (e !== STOP) throw e; } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the shell rebuilds a component on every paint', 'src/shell/shell.js', 'if (render.patch) render.patch(el, ctx);', 'if (render.patch) { el.innerHTML = render(ctx); render.patch(el, ctx); }'],
  ['keyed rows rebuild every row', 'src/render/paint.js', 'let el = held.get(k) || (kept && kept.get(k));', 'let el = null;'],
  ['a setting shows before the server confirms', 'src/shell/widgets/settings-intent.js', [["  attr(root, 'data-pending', true);\n", "  attr(root, 'data-pending', true);\n  root.__want = el;\n"],
    ["else if (key === 'stance') attr(el, 'aria-pressed', String(v === el.getAttribute('data-val')));", "else if (key === 'stance') attr(el, 'aria-pressed', String(pending ? root.__want === el : v === el.getAttribute('data-val')));"]]],
  ['controls stay on while an intent is in flight', 'src/shell/widgets/settings-intent.js', "prop(el, 'disabled', pending || v === null);", "prop(el, 'disabled', v === null);"],
  ['the analyzer ignores the premium gate', 'src/shell/widgets/analyzer.js', 'const premium = isPremium(ctx.character);', 'const premium = true;'],
  ['a null per_hour shows dashes, not "Per hour after 10 min."', 'src/shell/widgets/analyzer.js', "prop(sec.querySelector('.ha-later'), 'hidden', v.rated);", "prop(sec.querySelector('.ha-later'), 'hidden', true);"],
  ['Any food says it eats the best food first', 'src/shell/action-facts.js', 'your own \' + a.id + \' first, the smallest that covers what you are missing, then the store’s', 'your best \' + a.id + \' first'],
  ['Configure action never warns a heal slot', 'src/shell/windows/configure-action.js', "healWarning(d, set, blow, vitalsOf(cs).hpMax)", "''"],
  ['the heal warning sits above the foot, scrolled away below Save at 922x423', 'src/shell/windows/configure-action.js', "'<div class=\"hc-foot\"><p class=\"hc-warn\" role=\"status\" aria-live=\"polite\"></p>'", "'<p class=\"hc-warn\" role=\"status\" aria-live=\"polite\"></p><div class=\"hc-foot\">'"],
  ['the heal warning reads the whole ground whatever the party size', 'src/shell/windows/configure-action.js', 'biggestBlowOn(h.huntId, p ? p.members.length : 1)', 'biggestBlowOn(h.huntId, 4)'],
  ['the Hunts window keeps saying "On the way" while hunting', 'src/shell/windows/hunts.js', "  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }\n", ''],
  ['an edge panel never steps out of the hunt bar’s way', 'src/shell/shell.js', "        for (const p of at.push) edgeEls[p.i].style.top = p.top + 'px';\n", ''],
  ['the hunt bar draws no tutorial card under itself', 'src/shell/widgets/hunt-topbar.js', 'const html = pointerFor(ctx);', "const html = '';"],
  ['the tutorial card hangs over the hunt bar', 'src/styles/shell.css', '.hs-widget > .hs-pointer { left: 0; width: min(260px, 100%); }', '.hs-widget > .hs-pointer { left: 0; top: 0; width: min(260px, 100%); }'],
  ['an ended hunt still offers Leave hunt','src/shell/widgets/hunt-topbar.js', "  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));\n", ''],
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
  ['the mana gauge hides for a hero with no pool', 'src/shell/widgets/vitals-hub.js', "  fill(el.querySelector('.hb-arc.is-mana'), share(v.mana, v.manaMax));", "  fill(el.querySelector('.hb-arc.is-mana'), share(v.mana, v.manaMax));\n  el.querySelector('.hb-read.is-mana').style.display = v.manaMax > 0 ? '' : 'none';"],
  ['the hub keeps the first level it drew', 'src/shell/widgets/vitals-hub.js', '  const level = v.level;', '  const level = 24;'],
  ['the HP arc does not follow the server', 'src/shell/widgets/vitals-hub.js', "  fill(el.querySelector('.hb-arc.is-hp'), share(v.hp, v.hpMax));", "  fill(el.querySelector('.hb-arc.is-hp'), 1);"],
  ['a drop onto an action moves it without asking', 'src/shell/widgets/action-bar.js', '    else openDropMenu(ctx, el, t, from, to, bar);', '    else runDrop(ctx, el, (b) => swapPlan(b, from, to));'],
  ['insert shifts past the first empty slot', 'src/shell/bar-draft.js', '  while (k < SLOTS && out[k]) k++;', '  k = SLOTS - 1;'],
  ['the status line stays after a drop', 'src/shell/widgets/action-bar.js', ".then((r) => { text(msg, r.ok ? '' : barRefusalWords(r.error));", ".then((r) => { text(msg, r.ok ? 'Moving it…' : barRefusalWords(r.error));"],
  ['a refused drop leaves the line on Moving it', 'src/shell/widgets/action-bar.js', ".then((r) => { text(msg, r.ok ? '' : barRefusalWords(r.error));", ".then((r) => { text(msg, r.ok ? '' : 'Moving it…');"],
  ['a drop the server never answers stays pending', 'src/shell/bar-draft.js', '  return Promise.race([sent, late])', '  return Promise.race([sent])'],
  /* The record is deep-frozen (envelope.js), so an optimistic move can only be a client-side overlay the bar paints from. */
  ['a drop moves the bar before the server answers', 'src/shell/widgets/action-bar.js', [
    ["  text(msg, 'Moving it…');", "  text(msg, 'Moving it…'); el.__plan = plan(serverBar(ctx.character));"],
    ['  const slots = s ? Array.from({ length: SLOTS }, (_, i) => s.slots[i] || { empty: true }) : [];',
      '  const slots = s ? Array.from({ length: SLOTS }, (_, i) => (el.__plan ? (el.__plan[i] ? Object.assign({ usable: true }, el.__plan[i]) : null) : s.slots[i]) || { empty: true }) : [];']]],
  ['the hub prints the server’s per-minute mana regen as /s', 'src/shell/widgets/vitals-hub.js', "regen(hero.manaPerS) : ''", "regen(hero.manaPerS * 60) : ''"],
  ['the hub prints regen with two decimals', 'src/shell/widgets/vitals-hub.js', "'+' + r.toFixed(1)", "'+' + r.toFixed(2)"],
  ['a struck slot carries no glyph', 'src/shell/widgets/action-bar.js', "g.innerHTML = why ? glyphSvg(ctx.glyphs, why.glyph) : '';", "g.innerHTML = why && !why.strike ? glyphSvg(ctx.glyphs, why.glyph) : '';"],
  ['a server-refused slot is not struck', 'src/shell/action-facts.js', "  if (sl.usable === false) return { code: 'server', text: 'The server says this cannot fire now.', glyph: 'uiLock', strike: true };\n  const n =", '  const n ='],
  ['the panel’s chase sends nothing', 'src/shell/widgets/settings-intent.js', "  if (key === 'chase') return s.chase === null ? null : { chase: !s.chase };", "  if (key === 'chase') return null;"],
  ['a slot short of its rune says nothing', 'src/shell/action-facts.js', '    if (r.rune && !((bag', '    if (false && r.rune && !((bag'],
  ['the hub keeps an ended hunt’s in-fight regen', 'src/shell/widgets/vitals-hub.js', '  const hero = h && !h.ended ? h.hero : null;', '  const hero = h ? h.hero : null;'],
  ['the gold to keep shows the typed value before the server confirms', 'src/shell/widgets/settings-intent.js', "(pending || el.ownerDocument.activeElement !== el)", "(!pending && el.ownerDocument.activeElement !== el)"],
  ['the gold to keep sends nothing', 'src/shell/widgets/settings-intent.js', ": { gold_floor: n };", ": null;"],
  ['a press on the panel sends on pointerdown', 'src/shell/widgets/action-bar.js', "    if (ev.type !== (t.tagName === 'SELECT' || t.tagName === 'INPUT' ? 'change' : 'click')) return;", "    if ((t.tagName === 'SELECT') !== (ev.type === 'change')) return;"],
  ['a cast never cools its slot', 'src/shell/widgets/action-bar.js', '  const on = left > 0;', '  const on = false;'],
  ['the ember stands still', 'src/shell/widgets/action-bar.js', "style.height = (Math.round((1 - left / r.cdMs) * 1000) / 10) + '%';", "style.height = '50%';"],
  ['a slot that comes back builds a new icon', 'src/render/paint.js', '  const el = k ? (m.get(k) || build()) : null;', '  const el = k ? build() : null;'],
  ['a loot line that comes back is built again', 'src/shell/widgets/analyzer.js', '    keep: true,\n', ''],
  ['an atlas is decoded once per caller', 'src/world/atlas.js', 'heldImage(o.doc, url(p.image)),', "heldImage(o.doc, url(p.image) + '&n=' + Math.random()),"],
  ['the phone bar keeps the whole panel (HS-22)', 'src/styles/hunt.css', '  .hb-pl-more { position: fixed;', '  .hb-pl-more { display: contents; } .hb-xx { position: fixed;'],
  ['the phone hub keeps the big medal (HS-22)', 'src/styles/hunt.css', '  .hb-medal, .hb-arcs { width: 64px; height: 64px; }', '  .hb-medal, .hb-arcs { width: 88px; height: 88px; }'],
  ['the world HUD stays under the alerts while a tooltip is open (HS-22)', 'src/styles/hunt.css', '.hb-plaque.is-open) { z-index: 7; }', '.hb-plaque.is-open) { z-index: 2; }'],
  ['the phone alerts dock on the left, over the Party panel (HS-22)', 'src/data/hud-widgets.js', "phone: Object.freeze({ anchor: 'br', dx: 4, dy: 104 }),", "phone: Object.freeze({ anchor: 'bl', dx: 4, dy: 160 }),"],
  ['the phone alerts draw over an open window (HS-22)', 'src/styles/hunt.css', '  :root:has(.hs-win:not(.is-leaving)) .hs-widget.is-alerts { visibility: hidden; }', '.hs-widget.is-alerts { }'],
  ['the fight settings sheet starts at the top of the screen (HS-22)', 'src/shell/widgets/action-bar.js', "    sheet.style.top = Math.round(Math.max(box.top, hb ? hb.bottom + 4 : box.top)) + 'px';", "    sheet.style.top = '0px';"],
  ['a widget that grows after it is placed is never placed again (HS-22)', 'src/shell/shell.js', 'const sized = host.ResizeObserver ? ', 'const sized = false ? '],
  ['the bleed badge defaults on for regular monsters', 'src/data/combat-text.js', "label: 'Bleed stack count', on: on(false, true)", "label: 'Bleed stack count', on: on(true, true)"],
  ['the picker card never shows the personal best (HS-24)', 'src/shell/windows/hunts.js', "text(li.querySelector('.hw-hunt-best-solo'), best ? best.solo : '');", "text(li.querySelector('.hw-hunt-best-solo'), '');"],
  ['the picker merges a best the server no longer sends (HS-24)', 'src/session/hunt-sections.js', "  const b = section(cs, 'hunt_bests');\n", "  const b = section(cs, 'hunt_bests');\n  if (b && globalThis.__hb) for (const [k, v] of Object.entries(globalThis.__hb)) b.grounds[k] = Object.assign({}, v, b.grounds[k]);\n  if (b) globalThis.__hb = b.grounds;\n"],
  ['the summary has no balance per hour (HS-25)', 'src/hunt-view/summary-model.js', 'balanceH: ph ? ph.balance : null,', 'balanceH: null,'],
  ['a free summary shows raw XP per hour (HS-25)', 'src/shell/windows/hunt-summary.js', "prop(dd.parentNode, 'hidden', !!onlySent && (cur[k] === null || cur[k] === undefined));", "prop(dd.parentNode, 'hidden', false);"],
  ['a docked window covers the analyzer again (HS-26)', 'src/shell/shell.js', "clearOfDock(home, fixed, edgeEls.filter((o) => o !== e).map(rel), DOCK_EDGE, stage) : home.left;", 'home.left : home.left;'],
  ['the moved analyzer moves the camera (HS-26)', 'src/shell/shell.js', 'const left = dockHome.has(el) ? dockHome.get(el) : r.left - b.left;', 'const left = r.left - b.left;'],
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
  /* --shard=K/N (2026-10-21): the mutants split round-robin over N CI jobs (in-page-3/4/5). Each mutant
     is one clean boot of the whole page (~60 s on a runner since the action bar's rules), so 61 of them
     outgrew one job's budget. Every shard is registered in tests/ci-shape.baseline.json, so a dropped
     shard is loud; a shard that selects nothing is red. */
  const sh = process.argv.find((a) => a.startsWith('--shard='));
  const sm = sh ? /^--shard=(\d+)\/(\d+)$/.exec(sh) : null;
  if (sh && (!sm || +sm[1] < 1 || +sm[1] > +sm[2])) { console.log('  ✗ bad ' + sh + ' (want --shard=K/N, 1 <= K <= N)'); process.exit(1); }
  const shard = sm ? MUTANTS.filter((_, i) => i % +sm[2] === +sm[1] - 1) : MUTANTS;
  if (!shard.length) { console.log('  ✗ ' + sh + ' selects no mutant'); process.exit(1); }
  const tag = sm ? ' (shard ' + sm[1] + '/' + sm[2] + ')' : '';
  /* A push's gate hands over its diff (HR_MUTANT_SCOPE): only the mutants it can have moved run —
     the file a mutant patches changed, or its own entry here did; any other change to this file or
     to a tests/ helper it loads runs them all. No scope (nightly, manual, local) = all of them. */
  const scope = scopeMutants({ guard: 'tests/hunt-screen.mjs', root: ROOT, ...gateScope() });
  const mine = scope.all ? shard : shard.filter(([name]) => scope.keep.has(name));
  if (!scope.all) {
    console.log('  scope: ' + mine.length + ' of ' + shard.length + ' mutant(s)' + tag + ' touched by this diff');
    for (const [name] of mine) console.log('    ' + name + ' — ' + scope.why.get(name));
    if (!mine.length) { console.log('hunt-screen --mutate' + tag + ': no mutant in this shard is touched by this diff (the nightly sweep runs them)'); process.exit(0); }
  } else if (process.env.HR_MUTANT_SCOPE) console.log('  scope: every mutant — ' + scope.why);
  const clean = await checks(null, null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of mine) {
    let text = await readFile(join(ROOT, file), 'utf8');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([x]) => !text.includes(x));
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    for (const [x, y] of pairs) text = text.replace(x, y);
    const fails = await checks({ [file]: text }, null, { stopAtFirst: true });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'hunt-screen --mutate' + tag + ': ' + bad + ' escaped' : 'hunt-screen --mutate' + tag + ': ' + mine.length + '/' + mine.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
