#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-screen.mjs — THE HUNT SCREEN'S PANEL RULES, IN A REAL CHROMIUM.
//
//   node tests/hunt-screen.mjs                the rules
//   node tests/hunt-screen.mjs --mutate       every planted defect must turn a rule RED
//   node tests/hunt-screen.mjs --shots <dir>  also write the visual-gate screenshots
//                                             (1440x900 and 922x423)
//
// mutant-anchors: src/shell/windows/hunts.js src/shell/widgets/hunt-topbar.js src/render/paint.js src/shell/shell.js src/shell/widgets/ src/shell/windows/ src/session/hunt-sections.js src/data/combat-text.js src/data/condition-metrics.js
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
//         below 60 - ONE intent; the density step on the hunt picker sends ONE
//         intent and shows only the server's value; after a reload both come back
//   HS-9  the Hunts window follows the server's hunt: once the hero is hunting
//         it says so, never a stale "On the way to ..." (Tyler 10-19)
//   HS-10 a hunt that is over keeps only the way back to its summary: no Leave
//         hunt, no Hunt details; a running hunt shows Leave hunt
//   HS-11 A SLOT THAT NEVER FIRES: an earlier slot with the same action under
//         weaker conditions marks it "!" with the reason; emptying it clears that
//   HS-12 THE BAR PANEL holds target, stance, chase, distance (nothing else); each is ONE
//         intent, shows the server value, survives a reload; no Hunt settings window
//   HS-13 THE VITALS HUB: HP, mana, level, XP and stamina from the envelope, replaced by
//         the next one; a melee hero with no mana pool still shows its mana gauge
//   HS-14 DRAG: onto an empty slot it moves; onto an action a menu (Swap with X / Insert
//         here, shift the rest / Escape or a press away cancels); one intent per choice;
//         the status line clears on the server's answer
//   HS-15 every struck slot says why (glyph + the tooltip's first line), one slot a reason
//   HS-16 THE COOLDOWN EMBER: the hero's played cast cools that ability's slot for its
//         catalogue cooldown; the ember rises and the seconds fall as it runs out
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
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
  s.next = () => Object.assign(clone(s.env), { version: ++s.version });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    const name = url.split('/').pop();
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next()));
    if (name === 'hr_action_set_options') { await new Promise((ok) => setTimeout(ok, s.optionsDelayMs)); return json(s.optionsReply); }
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
const NODES = `({ row: document.querySelector('.hp-m[data-key="1"]'), kills: document.querySelector('[data-sec="totals"] dd[data-stat="kills"]'),
  slot: document.querySelector('.hb-slot[data-slot="3"]'), hp: document.querySelector('.hb-read-v[data-v="hp"]') })`;

async function checks(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted();
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
      if (!up) fails.push('HS-1 the hunt panels did not mount for the fixture character');
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
        if (after.kills !== '170' || !/^90\/220$/.test(String(after.hp))) fails.push('HS-2 the patched nodes did not take the new numbers (kills ' + after.kills + ', hp ' + after.hp + ')');
        /* HS-13 THE VITALS HUB: HP, mana, level, XP and stamina are the envelope's, and the next envelope replaces them. */
        const hub = () => page.evaluate(() => {
          const q = (s) => document.querySelector(s);
          const dash = (s) => (q(s).getAttribute('stroke-dasharray') || '').split(' ')[0];
          return { hp: q('.hb-read-v[data-v="hp"]').textContent, mana: q('.hb-read-v[data-v="mana"]').textContent, lv: q('.hb-lv').textContent,
            xp: q('.hb-xp').textContent, stam: q('.hb-stam-v').textContent, hpArc: dash('.hb-arc.is-hp'), manaArc: dash('.hb-arc.is-mana'), xpArc: dash('.hb-arc.is-xp'),
            manaShown: q('.hb-read.is-mana').getClientRects().length > 0 && q('.hb-arc.is-mana').getClientRects().length > 0, gauges: document.querySelectorAll('.hb-bar .hh-gauge').length };
        });
        const h1 = await hub();
        if (h1.hp !== '90/220' || h1.mana !== '40/60' || h1.lv !== '24' || h1.xp !== 'XP 62%' || h1.hpArc !== '40.9' || h1.manaArc !== '66.7' || h1.xpArc !== '62' || !/\d/.test(h1.stam)) {
          fails.push('HS-13 the hub does not show the envelope: ' + JSON.stringify(h1));
        }
        if (h1.gauges) fails.push('HS-13 the old flat gauges are still on the bar');
        /* A melee hero the server sends no mana pool still shows its mana gauge (every hero has mana). */
        Object.assign(s.env.hunt.hero, { mana: 0, mana_max: 0, level: 25, xp_pct: 0.05, hp: 220 });
        s.env.party.members[0].hp = 220;
        await pushEnvelope(page, s);
        const h2 = await hub();
        if (h2.hp !== '220/220' || h2.mana !== '0/0' || h2.lv !== '25' || h2.xp !== 'XP 5%' || h2.hpArc !== '100' || !h2.manaShown) fails.push('HS-13 the next envelope did not replace the hub (or hid the mana gauge): ' + JSON.stringify(h2));
        Object.assign(s.env.hunt.hero, { mana: 40, mana_max: 60, hp: 180, level: 24, xp_pct: 0.62 });   // back to the fixture for the screenshots
        s.env.party.members[0].hp = 180;
        await pushEnvelope(page, s);
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

    { // HS-3 intent-only edits on the bar's panel: confirmed, then refused; HS-12 the panel holds what Hunt settings held, and there is no Hunt settings window
      const { ctx, page, s, up } = await open();
      if (up) {
        s.env.hunt_settings.stance = 'offensive';   // what the server says once it has saved
        /* Target, stance, chase and distance live on the bar's panel (Tyler 10-19). */
        const P = '.hb-plaque';
        await wait(page, (p) => document.querySelector(p + ' [data-opt="stance"]:not([disabled])'), P, 3000);
        const btn = P + ' [data-opt="stance"][data-val="offensive"]';
        await page.click(btn);
        const mid = await page.evaluate(([b, p]) => ({ off: document.querySelector(b).disabled, pressed: document.querySelector(b).getAttribute('aria-pressed'),
          allOff: Array.from(document.querySelectorAll(p + ' [data-opt]')).every((c) => c.disabled) }), [btn, P]);
        if (!mid.off || !mid.allOff) fails.push('HS-3 the panel controls stayed on while the intent was in flight');
        if (mid.pressed !== 'false') fails.push('HS-3 the stance showed as chosen before the server confirmed it');
        const sent = s.calls.filter((c) => c.name === 'hr_action_set_options');
        if (sent.length !== 1 || JSON.stringify(sent[0].body.p_opts) !== '{"stance":"offensive"}' || sent[0].body.p_slot !== 0) fails.push('HS-3 the press sent ' + JSON.stringify(sent.map((c) => c.body)));
        const done = await wait(page, (b) => !document.querySelector(b).disabled && document.querySelector(b).getAttribute('aria-pressed') === 'true', btn, 3000);
        if (!done) fails.push('HS-3 after the server confirmed, the stance did not show the server’s new value');
        /* Refused: the server's value stays and the panel says why. */
        s.optionsReply = { ok: false, error: 'bad_option' };
        const def = P + ' [data-opt="stance"][data-val="defensive"]';
        await page.click(def);
        await page.waitForTimeout(100);
        const back = await wait(page, (b) => !document.querySelector(b).disabled, def, 3000);
        const r = await page.evaluate(([b, p]) => ({ pressed: document.querySelector(b).getAttribute('aria-pressed'), msg: document.querySelector(p + ' .hh-intent-msg').textContent }), [def, P]);
        if (!back || r.pressed !== 'false' || !r.msg) fails.push('HS-3 a refusal did not keep the server’s stance with a reason (' + JSON.stringify(r) + ')');
        /* HS-12: exactly target, stance, chase and distance; no eat/drink thresholds, no supplies, no density, no gathering; J opens nothing. */
        s.optionsReply = { ok: true };
        const opts = await page.evaluate((p) => Array.from(new Set(Array.from(document.querySelectorAll(p + ' [data-opt]')).map((e) => e.getAttribute('data-opt')))).sort().join(), P);
        if (opts !== 'chase,distance,stance,target_mode') fails.push('HS-12 the panel holds ' + opts);
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        if (await page.$('[data-hs-win="hunt-settings"]')) fails.push('HS-12 a Hunt settings window still opens');
        /* Each control is ONE intent and shows only the server's value. */
        const one = async (label, act, want, set) => {
          const before = s.calls.filter((c) => c.name === 'hr_action_set_options').length;
          Object.assign(s.env.hunt_settings, set);
          await act();
          await wait(page, (p) => !document.querySelector(p).classList.contains('is-pending'), P, 3000);
          await page.waitForTimeout(150);
          const got = s.calls.filter((c) => c.name === 'hr_action_set_options').slice(before).map((c) => JSON.stringify(c.body.p_opts));
          if (got.length !== 1 || got[0] !== want) fails.push('HS-12 ' + label + ' sent ' + JSON.stringify(got) + ' (all: ' + JSON.stringify(s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts)) + ')');
        };
        await one('the target', () => page.selectOption(P + ' [data-opt="target_mode"]', 'weakest'), '{"target_mode":"weakest"}', { target_mode: 'weakest' });
        const chase0 = FIXTURE.hunt_settings.chase;
        await one('chase', () => page.click(P + ' [data-opt="chase"]'), JSON.stringify({ chase: !chase0 }), { chase: !chase0 });
        const d0 = FIXTURE.hunt_settings.distance;
        await one('distance', () => page.click(P + ' [data-opt="distance"][data-val="1"]'), JSON.stringify({ distance: d0 + 1 }), { distance: d0 + 1 });
        const shown = await page.evaluate((p) => ({ target: document.querySelector(p + ' [data-opt="target_mode"]').value,
          chase: document.querySelector(p + ' [data-opt="chase"]').getAttribute('aria-pressed'), distance: document.querySelector(p + ' [data-show="distance"]').textContent }), P);
        if (shown.target !== 'weakest' || shown.chase !== String(!chase0) || shown.distance !== String(d0 + 1)) fails.push('HS-12 the panel does not show the server’s values: ' + JSON.stringify(shown));
        /* After a reload, the same values come back from the server. */
        await page.reload({ waitUntil: 'load' });
        if (!(await signInAndPlay(page, ''))) fails.push('HS-12 the screen did not mount after a reload');
        else {
          const again = await page.evaluate((p) => ({ target: document.querySelector(p + ' [data-opt="target_mode"]').value, stance: (document.querySelector(p + ' [data-opt="stance"][aria-pressed="true"]') || {}).getAttribute ? document.querySelector(p + ' [data-opt="stance"][aria-pressed="true"]').getAttribute('data-val') : null,
            distance: document.querySelector(p + ' [data-show="distance"]').textContent }), P);
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

    { // HS-14 drag on the bar: onto an empty slot it moves; onto an action a menu (Swap / Insert / cancel); one intent per choice; the status line clears
      const { ctx, page, s, up } = await open();
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
          for (let i = 0; i < 40 && sent().length < want.n; i++) await page.waitForTimeout(50);
          const all = sent();
          if (all.length !== want.n || JSON.stringify(all[all.length - 1]) !== JSON.stringify(want.bar)) fails.push('HS-14 ' + label + ' sent ' + JSON.stringify(all[all.length - 1]).slice(0, 400));
          const cleared = await wait(page, () => document.querySelector('.hb-plaque .hh-intent-msg').textContent === '', null, 3000);
          if (!cleared) fails.push('HS-14 the status line stayed after the server answered ' + label);
        };
        const menuOn = () => page.evaluate(() => document.querySelector('.hb-drop').classList.contains('is-on'));
        /* Onto an empty slot: it just moves there. */
        await drag(4, 7);
        if (await menuOn()) fails.push('HS-14 a drop onto an empty slot opened the menu');
        const moved = base.slice(); moved[7] = base[4]; moved[4] = null;
        await lastIs('a move onto an empty slot', { n: 1, bar: moved });
        /* Onto an action: the menu names the dragged action and the target; Escape cancels with no intent. */
        await drag(0, 2);
        const menu = await page.evaluate(() => ({ on: document.querySelector('.hb-drop').classList.contains('is-on'), title: document.querySelector('.hb-drop-t').textContent,
          swap: document.querySelector('.hb-drop [data-x="swap"]').textContent, insert: document.querySelector('.hb-drop [data-x="insert"]').textContent }));
        if (!menu.on || menu.title !== 'Power Strike' || menu.swap !== 'Swap with Wheat Bread' || menu.insert !== 'Insert here (shift the rest)') fails.push('HS-14 the drop menu reads ' + JSON.stringify(menu));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        if (await menuOn() || sent().length !== 1) fails.push('HS-14 Escape did not cancel the drop (menu or an intent left)');
        /* A press elsewhere cancels too. */
        await drag(0, 2);
        await page.mouse.click(700, 300);
        await page.waitForTimeout(300);
        if (await menuOn() || sent().length !== 1) fails.push('HS-14 a press away did not cancel the drop');
        /* Swap: exactly the two change places. */
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="swap"]'); else fails.push('HS-14 the drop menu did not open for a swap');
        const swapped = base.slice(); swapped[0] = base[2]; swapped[2] = base[0];
        await lastIs('a swap', { n: 2, bar: swapped });
        /* Insert: the target and the slots after it shift one place, up to the first empty slot — never past it (slot 9 stays). */
        s.env.hunt_settings.slots[8] = { action: { type: 'ability', id: 'challenge' }, conditions: [], join: 'and', usable: true, mana: 0 };
        await pushEnvelope(page, s);
        base[8] = wire(s.env.hunt_settings.slots[8]);
        await drag(0, 2);
        if (await menuOn()) await page.click('.hb-drop [data-x="insert"]'); else fails.push('HS-14 the drop menu did not open for an insert');
        const ins = base.slice(); ins[0] = null; ins[2] = base[0]; ins[3] = base[2]; ins[4] = base[3]; ins[5] = base[4];
        await lastIs('an insert', { n: 3, bar: ins });
        if (shots) { await drag(0, 2); await page.screenshot({ path: join(shots, 'hunt-1440x900-drop-menu.png') }); await page.keyboard.press('Escape'); }
      } else fails.push('HS-14 the screen did not mount');
      await ctx.close();
    }

    { // HS-15 every struck slot says why: a glyph on the slot, the reason first in its tooltip (the server's rules, action-facts.js reasonOf)
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
        const want = [
          [0, 'mana', /^Needs 6 mana, you have 2\.$/, false],
          [1, 'rune', /^Needs a Fire Rune in the bag/, true],
          [2, 'stock', /^Out of stock and no store fallback/, true],
          [5, 'store off', /^Out of stock, and this hero is set to end the hunt rather than buy from the store/, true],
        ];
        for (const [i, label, re, strike] of want) {
          const w = await why(i);
          if (!re.test(w.text) || !w.glyph || w.off !== strike || w.wait !== !strike) fails.push('HS-15 the ' + label + ' slot reads ' + JSON.stringify(w));
        }
        if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-slot-reasons.png') });
        S.role = 'healer';
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const wrong = await why(0);
        if (!/^Your weapon can’t use this\. Needs /.test(wrong.text) || !wrong.off || !wrong.glyph) fails.push('HS-15 the wrong-weapon slot reads ' + JSON.stringify(wrong));
        delete S.role;
        await pushEnvelope(page, s);
        await page.waitForTimeout(300);
        const none = await why(0);
        if (!/^No weapon worn/.test(none.text) || !none.off) fails.push('HS-15 the no-weapon slot reads ' + JSON.stringify(none));
      } else fails.push('HS-15 the screen did not mount');
      await ctx.close();
    }

    { // HS-16 the cooldown ember: the hero's played `cast` cools that ability's slot for its catalogue cooldown; the ember rises as it runs out
      const { ctx, page, s, up } = await open();
      if (up) {
        const delay = await page.evaluate(async () => (await import('/src/session/config.js?v=0.1.0')).SESSION_CONFIG.huntPlaybackDelayMs);
        const D = Number.isFinite(delay) ? delay : 19000;
        const now = s.env.hunt_server_now_ms;
        /* A cast that plays at once (its time is already behind the playback delay) by the viewed hero (unit 1). */
        s.env.hunt_events = s.env.hunt_events.concat([{ id: 'cd:1', type: 'cast', atMs: now - D - 500, u: 1, t: 101, ability: 'power_strike' }]);
        await pushEnvelope(page, s);
        const read = () => page.evaluate(() => {
          const li = document.querySelector('.hb-slot[data-slot="0"]');
          return { on: li.classList.contains('is-cooling'), h: parseFloat(li.querySelector('.hb-cd-ember').style.height) || 0, sec: li.querySelector('.hb-cd-s').textContent,
            other: document.querySelector('.hb-slot[data-slot="2"]').classList.contains('is-cooling') };
        });
        const ok1 = await wait(page, () => document.querySelector('.hb-slot[data-slot="0"]').classList.contains('is-cooling'), null, 4000);
        const a = await read();
        await page.waitForTimeout(1200);
        const b = await read();
        if (!ok1 || !(a.h > 0 && a.h < 100) || !(Number(a.sec) > 0 && Number(a.sec) <= 6) || a.other) fails.push('HS-16 the cast did not cool its slot with an ember: ' + JSON.stringify(a));
        else if (!(b.h > a.h) || !(Number(b.sec) < Number(a.sec))) fails.push('HS-16 the ember did not rise as the cooldown ran out: ' + JSON.stringify([a, b]));
        if (shots) await page.screenshot({ path: join(shots, 'hunt-1440x900-cooldown.png') });
      } else fails.push('HS-16 the screen did not mount');
      await ctx.close();
    }

    { // HS-11 a slot that can never fire: the same action under weaker conditions earlier shows "!" and why; emptying the earlier one clears it
      const { ctx, page, s, up } = await open();
      if (up) {
        s.env.hunt_settings.slots[6] = { action: { type: 'ability', id: 'power_strike' }, conditions: [{ metric: 'enemies_in_aoe', op: 'lte', value: 1 }, { metric: 'self_hp_pct', op: 'gt', value: 50 }], join: 'and', usable: true, mana: 6 };
        await pushEnvelope(page, s);
        const blocked = await wait(page, () => document.querySelector('.hb-slot[data-slot="6"]').classList.contains('is-blocked')
          && !document.querySelector('.hb-slot[data-slot="0"]').classList.contains('is-blocked'), null, 3000);
        const tip = await page.evaluate(() => { document.querySelector('.hb-slot[data-slot="6"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector('.hb-tip .is-warn:not(.is-why)') ? document.querySelector('.hb-tip .is-warn:not(.is-why)').textContent : ''; });
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
        mana: (document.querySelector('.hb-read.is-mana') || { getClientRects: () => [] }).getClientRects().length > 0,
        plus: getComputedStyle(document.querySelector('.hb-slot[data-slot="5"] .hb-plus')).display }));
      if (!town.bar || !town.mana) fails.push('HS-8 in town the bar or its vitals hub is missing: ' + JSON.stringify(town));
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
      /* A food slot starts at HP below 50% (Eat at is gone); the player moves it to 60. */
      if ((await page.$$eval('.hc-cond.is-on', (n) => n.length)) !== 1) fails.push('HS-8 a new food slot does not start with its HP condition');
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
      /* Density on the hunt picker: a −/+ step, one intent, the server's value only. */
      await page.keyboard.press('h');
      await wait(page, () => document.querySelector('.hw-hunt.is-picked .hw-density.is-on'), null, 3000);
      const d0 = await page.evaluate(() => document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val').textContent);
      s.env.hunt_settings.density = 2;
      if (d0 !== '1 each') fails.push('HS-8 the density does not show the server’s pick of 1: ' + d0);
      if (await page.evaluate(() => document.querySelector('.hw-hunt.is-picked .hw-density [data-by="1"]').disabled)) fails.push('HS-8 the density + is off below the ground’s most');
      else await page.click('.hw-hunt.is-picked .hw-density [data-by="1"]');
      const dMid = await page.evaluate(() => document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val').textContent);
      const dSent = s.calls.filter((c) => c.name === 'hr_action_set_options').map((c) => c.body.p_opts).slice(1);
      if (JSON.stringify(dSent) !== '[{"density":2}]') fails.push('HS-8 the density step sent ' + JSON.stringify(dSent));
      if (dMid !== d0) fails.push('HS-8 the density showed ' + dMid + ' before the server confirmed it');
      if (!(await wait(page, () => document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val').textContent === '2 each', null, 3000))) fails.push('HS-8 the density did not show the server’s 2');
      if (shots) await page.screenshot({ path: join(shots, 'town-' + tag + '-hunts-density.png') });
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
        if (!(await wait(page, () => { const v = document.querySelector('.hw-hunt.is-picked .hw-density .hh-step-val'); return v && v.textContent === '2 each'; }, null, 3000))) fails.push('HS-8 after a reload the density is not the server’s');
      }
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
  ['an ended hunt still offers Leave hunt', 'src/shell/widgets/hunt-topbar.js', "  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));\n", ''],
  ['a free character gets no basic analyzer', 'src/shell/widgets/analyzer.js', 'const a = analyzerOf(ctx.character);', 'const a = premium ? analyzerOf(ctx.character) : null;'],
  ['the analyzer keeps the last numbers when the section goes', 'src/session/hunt-sections.js', "  const a = section(cs, 'hunt_analyzer');\n", "  const a = section(cs, 'hunt_analyzer') || globalThis.__lastA;\n  globalThis.__lastA = a;\n"],
  ['the metric picker is a hard-coded list', 'src/shell/windows/configure-action.js', "aria-label=\"Test ' + (i + 1) + '\">' + options(METRICS.map((m) => [m.id, m.label]))", "aria-label=\"Test ' + (i + 1) + '\">' + options([['self_hp_pct', 'My HP %'], ['self_mana_pct', 'My mana %']])"],
  ['the controls stay on while a bar intent is in flight', 'src/shell/windows/configure-action.js', '  const off = s.pending;', '  const off = false;'],
  ['a server validation error is not shown inline', 'src/shell/bar-draft.js', '  else { s.error = r;', '  else { s.error = null;'],
  ['the bar hides in town', 'src/data/hud-widgets.js', "removable: true, when: 'always',\n    phone: Object.freeze({ dy: 2 }),", "removable: true, when: 'hunt',\n    phone: Object.freeze({ dy: 2 }),"],
  ['the store price is not shown on Any food', 'src/shell/windows/configure-action.js', "(st.from ? 'store from ' : 'store ') + st.price + ' g each'", "''"],
  ['the density step sends no intent', 'src/shell/windows/hunts.js', "    runIntent(sc, repaint, () => cs.setHuntOptions(s.preset, { density: n }), 'Saving…', () => '');", "    runIntent(sc, repaint, () => Promise.resolve({ ok: true }), 'Saving…', () => '');"],
  ['the density shows the ground max, not the server pick', 'src/shell/windows/hunts.js', '  return { now: densityFor(g, size, [set.density]), max };', '  return { now: max, max };'],
  ['a blocked slot is not flagged', 'src/shell/action-facts.js', '      if (same || kind) {', '      if (false) {'],
  ['the modal docks instead of centring', 'src/shell/window-manager.js', "  const isModal = (id) => rows.get(id).modal === true;", "  const isModal = () => false;"],
  ['Hunt prep tells a player to buy first', 'src/shell/readiness.js', '      const st = storeOn ? storeOf(sl.action) : null;', '      const st = null;'],
  ['the mana gauge hides for a hero with no pool', 'src/shell/widgets/vitals-hub.js', "  fill(el.querySelector('.hb-arc.is-mana'), share(v.mana, v.manaMax));", "  fill(el.querySelector('.hb-arc.is-mana'), share(v.mana, v.manaMax));\n  el.querySelector('.hb-read.is-mana').style.display = v.manaMax > 0 ? '' : 'none';"],
  ['the hub keeps the first level it drew', 'src/shell/widgets/vitals-hub.js', '  const level = hero && ok(hero.level) ? hero.level :', '  const level = 24 || hero ? 24 :'],
  ['the HP arc does not follow the server', 'src/shell/widgets/vitals-hub.js', "  fill(el.querySelector('.hb-arc.is-hp'), share(v.hp, v.hpMax));", "  fill(el.querySelector('.hb-arc.is-hp'), 1);"],
  ['a drop onto an action moves it without asking', 'src/shell/widgets/action-bar.js', '    else openDropMenu(ctx, el, t, from, to, bar);', '    else runDrop(ctx, el, (b) => swapPlan(b, from, to));'],
  ['insert shifts past the first empty slot', 'src/shell/bar-draft.js', '  while (k < SLOTS && out[k]) k++;', '  k = SLOTS - 1;'],
  ['the status line stays after a drop', 'src/shell/widgets/action-bar.js', ".then((r) => { text(msg, r.ok ? '' : r.error === 'no_room'", ".then((r) => { text(msg, r.ok ? 'Moving it…' : r.error === 'no_room'"],
  ['a slot short of its rune says nothing', 'src/shell/action-facts.js', '    if (r.rune && !((bag', '    if (false && r.rune && !((bag'],
  ['a press on the panel sends on pointerdown', 'src/shell/widgets/action-bar.js', "    if (ev.type !== (t.tagName === 'SELECT' ? 'change' : 'click')) return;", "    if ((t.tagName === 'SELECT') !== (ev.type === 'change')) return;"],
  ['a cast never cools its slot', 'src/shell/widgets/action-bar.js', '  const on = left > 0;', '  const on = false;'],
  ['the ember stands still', 'src/shell/widgets/action-bar.js', "style.height = (Math.round((1 - left / r.cdMs) * 1000) / 10) + '%';", "style.height = '50%';"],
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
