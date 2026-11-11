#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/training-window.mjs — THE TRAINING YARD'S CLIENT HALF, IN A REAL CHROMIUM (lane/b-training-window).
//
//   node tests/training-window.mjs                the rules
//   node tests/training-window.mjs --mutate       every planted defect must turn a rule RED
//   node tests/training-window.mjs --shots <dir>  also write the desktop and phone screenshots
//
// mutant-anchors: src/shell/windows/training.js src/session/training-intents.js src/session/training-poll.js src/shell/training-words.js src/shell/launcher.js src/shell/town-work.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json
// ("Tyler", slot 0, 5,200 gold) in town. The three verbs answer in the shape of 2027-04-06-training-yard.sql (the server half and its
// money are guarded by tests/training-yard.mjs on the replayed chain).
//   TR-0  EVERY REFUSAL HAS WORDS: each code hr_training_start / hr_training_stop can answer (read from the migration's bodies) reads as
//         a sentence, never the fallback; the yard's own codes in the yard's own words, the ones with numbers with the server's numbers;
//         every end reason names the hero and the skill
//   TR-1  SWITCH OFF, NOTHING SHOWS: no `training` section, no icon (and rowOffered says no; the yard's tap opens Hunts instead); the
//         section going away closes an open window and takes the icon
//   TR-2  START: the icon opens the window on the server's rates and the hero's levels; ONE hr_training_start names the slot, the
//         skill, the yard, the hours, the gold to keep and a key, and nothing else (no price, rate or time); the run shows the
//         server's numbers
//   TR-3  THE TICK: a run past the server's minute is ticked ONCE with the slot alone; a tick that paid is re-read and the new numbers
//         REPLACE the old ones on screen
//   TR-4  STOP: ONE hr_training_stop; the window says why it ended and what it came to, from the section, and the choices come back
//   TR-5  BOTH PATHS: a page opened after hours away shows the server's numbers as its sweep left them (a running run, or one its
//         "Stop after" ended), before any tick
//   TR-6  THE REFUSALS ON SCREEN: each start refusal reads its words in the window's line; the play cap opens its popup instead;
//         settle_first settles the engine once and asks ONCE more under a new key
//   TR-7  SAY WHY BEFORE THE PRESS: out hunting, under the yard's Level, and a keep of the whole purse turn Start off with the words
//   TR-8  SIZES: no text in the window under 12 px on the desktop, and the phone (922x423) sheet stays inside the screen
//   TR-9  ANOTHER JOB: a town job stops the run by its own verb first, then asks for the job; a hunt leaves the run for the hunt's start
//         to close (`hunt`), and a setup change stops it first
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots') ? ARGS[ARGS.indexOf('--shots') + 1] : null;
const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const MIG = (await readFile(join(ROOT, 'supabase/migrations/2027-04-06-training-yard.sql'), 'utf8')).replace(/\r\n/g, '\n');
const clone = (o) => JSON.parse(JSON.stringify(o));
const MIN = 60000, HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/** The `training` section in hr_training_view's shape. */
const SECTION = (o) => Object.assign({ open: true, level: 20, min_level: 10, xp_h: 8000, gold_h: 1000, per_level: { xp_h: 400, gold_h: 50 },
  skills: ['defense', 'magic', 'melee', 'ranged'], places: ['yard'], stop_after: { min: 1, max: 24 }, keep_max: 1000000000,
  settings: null, run: null, last_stop: null }, o);
const RUN = (o) => Object.assign({ skill: 'defense', place: 'yard', since: iso(Date.now()), settled_to: iso(Date.now()), stop_at: iso(Date.now() + 4 * HOUR),
  keep_gold: 1000, level: 20, ms: 0, xp: 0, gold: 0 }, o);

/** Every code a body of `fn` in the migration answers with. */
function codesOf(fn) {
  const at = MIG.indexOf('create or replace function public.' + fn + '(');
  const body = MIG.slice(at, MIG.indexOf('end $fn$;', at));
  return [...new Set([...body.matchAll(/'error',\s*'([a-z0-9_]+)'/g)].map((m) => m[1]))];
}

/* The stubbed server: `s` is the world it answers from (the section, the pointer, the purse) and every call it heard. */
async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(envOf(s));
    if (name === 'hr_training_start') return json(s.onStart(body));
    if (name === 'hr_training_stop') return json(s.onStop(body));
    if (name === 'hr_training_tick') return json(s.onTick(body));
    return json({ ok: true });
  });
}

function envOf(s) {
  const env = Object.assign(clone(BASE_ENV), { hunt: s.hunt || null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null,
    now: iso(Date.now()), version: ++s.version, ok: true, level: { xp: 90000, level: s.level, into: 0, need: 10000 } });
  env.state = Object.assign({}, env.state, { active_kind: s.active, active_id: s.active === 'training' ? 'yard_defense' : null, gold: s.gold });
  if (s.training) env.training = s.training;
  else delete env.training;
  return env;
}

/** A world: the switch on (a section) or off (null), the hero idle, Level 20. Default answers move it the server's way. */
function world(o) {
  const s = Object.assign({ calls: [], version: 1, active: 'idle', gold: 5200, level: 20, hunt: null, training: SECTION({}) }, o);
  s.onStart = s.onStart || ((b) => {
    s.active = 'training';
    s.training = SECTION({ settings: { skill: b.p_skill, place: 'yard', stop_after_h: b.p_stop_after_h, keep_gold: b.p_keep_gold },
      run: RUN({ skill: b.p_skill, keep_gold: b.p_keep_gold, stop_at: b.p_stop_after_h ? iso(Date.now() + b.p_stop_after_h * HOUR) : null,
        /* the server's mark a minute and more back: the viewed hero's tick is due at once */
        settled_to: iso(Date.now() - 70000), since: iso(Date.now() - 70000) }) });
    return { ok: true, skill: b.p_skill, place: 'yard', stop_after_h: b.p_stop_after_h, keep_gold: b.p_keep_gold, since: iso(Date.now()), version: s.version + 1, training: s.training };
  });
  s.onTick = s.onTick || (() => {
    const run = s.training && s.training.run;
    if (!run) return { ok: true, settled: null, version: s.version, training: s.training };
    Object.assign(run, { settled_to: iso(Date.now()), ms: run.ms + 70000, xp: run.xp + 156, gold: run.gold + 19 });
    s.gold -= 19;
    return { ok: true, settled: { skill: run.skill, ms: 70000, xp: 156, gold: 19, level: 20 }, version: s.version + 1, training: s.training };
  });
  s.onStop = s.onStop || (() => {
    const run = s.training && s.training.run;
    if (!run) return { ok: false, error: 'not_training' };
    s.active = 'idle';
    s.training = SECTION({ settings: s.training.settings, last_stop: { reason: 'stopped', at: iso(Date.now()), skill: run.skill, ms: run.ms, xp: run.xp, gold: run.gold } });
    return { ok: true, stopped: { skill: run.skill }, version: s.version + 1, training: s.training };
  });
  return s;
}

async function signInAndPlay(page, base) {
  /* the page's first load is the harness, not a rule (tests/tally-window.mjs) */
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (s, viewport) => {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await stub(page, s);
    if (!await signInAndPlay(page, base)) fails.push('harness: the page never reached the World');
    await page.waitForTimeout(300);
    return { ctx, page, errors };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const q = (page, sel) => page.evaluate((x) => { const e = document.querySelector('[data-hs-win="training"] ' + x); return e ? e.textContent : null; }, sel);
  const shown = (page, sel) => page.evaluate((x) => { const e = document.querySelector(x); return !!e && e.offsetParent !== null; }, sel);
  const msg = (page) => q(page, '.hh-intent-msg');
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 2000 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const openWindow = async (page, rule) => {
    if (!await press(page, '[data-hs-open="training"]', rule)) return false;
    return wait(page, () => !!document.querySelector('[data-hs-win="training"] .tw-train'), null, 4000);
  };
  /* the modules as this page serves them (a mutant's text included), at the build's cache-buster */
  const mod = (page, path) => page.evaluate((p) => { const v = new URL(document.querySelector('link[rel="modulepreload"]').href).search; return p + v; }, path);

  try {
    /* TR-0: every refusal has words; the module the page serves */
    {
      const s = world({});
      const { ctx, page } = await open(s);
      const starts = codesOf('hr_training_start'), stops = codesOf('hr_training_stop');
      const r = await page.evaluate(async ({ iw, rw, tw, starts, stops }) => {
        const IW = await import(iw), RW = await import(rw), TW = await import(tw);
        const cs = { read: (k) => (k === 'name' ? 'Tyler' : null) };
        const say = (o) => IW.refusalText(Object.assign({ ok: false }, o), cs);
        const out = { fallback: RW.REFUSAL_FALLBACK, start: {}, stop: {}, figures: {}, ended: {} };
        for (const c of starts) out.start[c] = say({ error: c, verb: 'training_start' });
        for (const c of stops) out.stop[c] = say({ error: c, verb: 'training_stop' });
        out.figures = {
          level_low: say({ error: 'level_low', verb: 'training_start', level: 7, need: 10 }),
          cannot_pay: say({ error: 'cannot_pay', verb: 'training_start', purse: 20050, keep: 20000, need: 17 }),
          bad_hours: say({ error: 'bad_hours', verb: 'training_start', min: 1, max: 24 }),
          bad_keep: say({ error: 'bad_keep', verb: 'training_start', max: 1000000000 }),
          in_hunt: say({ error: 'in_hunt', verb: 'training_start' }),
          not_training: say({ error: 'not_training', verb: 'training_stop' }),
        };
        for (const reason of ['stop_after', 'keep_gold', 'stopped', 'hunt', 'switched', 'feature_off', 'catalogue']) {
          out.ended[reason] = TW.endedWords({ reason, skill: 'defense', ms: 4 * 3600000, xp: 32000, gold: 4000 }, 'Tyler');
        }
        return out;
      }, { iw: await mod(page, '/src/shell/intent-words.js'), rw: await mod(page, '/src/data/refusal-words.js'), tw: await mod(page, '/src/shell/training-words.js'), starts, stops });
      if (starts.length < 15 || !starts.includes('cannot_pay') || !starts.includes('no_dummy') || !stops.includes('not_training')) fails.push('TR-0 the migration read found only ' + starts.join(','));
      /* the yard's own codes: never a generic family line */
      const generic = /request was not valid|not possible right now|game was catching up|did not go through|catching up\. Try again in a few/;
      const OWN = ['feature_off', 'level_low', 'bad_skill', 'bad_place', 'no_dummy', 'bad_hours', 'bad_keep', 'in_hunt', 'settle_first', 'cannot_pay', 'catalogue_missing'];
      for (const [c, w] of Object.entries(r.start)) {
        if (!w || w === r.fallback) fails.push('TR-0 hr_training_start ' + c + ' has no words');
        else if (OWN.includes(c) && generic.test(w)) fails.push('TR-0 hr_training_start ' + c + ' reads a generic line: ' + w);
      }
      for (const [c, w] of Object.entries(r.stop)) if (!w || w === r.fallback || (c === 'not_training' && generic.test(w))) fails.push('TR-0 hr_training_stop ' + c + ' reads ' + JSON.stringify(w));
      const want = {
        level_low: 'The yard opens at Level 10. Tyler is Level 7.',
        cannot_pay: 'You have 20,050 gold and want to keep 20,000. That isn\'t enough to start.',
        bad_hours: 'Pick 1 to 24 hours, or until you stop it.',
        bad_keep: 'You can keep at most 1,000,000,000 gold.',
        in_hunt: 'Tyler is out hunting. Come back to town to train.',
        not_training: 'Tyler isn\'t training right now.',
      };
      for (const [c, w] of Object.entries(want)) if (r.figures[c] !== w) fails.push('TR-0 ' + c + ' with the server\'s numbers reads ' + JSON.stringify(r.figures[c]));
      for (const [reason, [why]] of Object.entries(r.ended)) {
        if (!/Tyler/.test(why) || !/Defense/.test(why)) fails.push('TR-0 the end ' + reason + ' reads ' + JSON.stringify(why));
      }
      if (r.ended.stop_after[0] !== 'Tyler finished 4 hours of Defense training.' || r.ended.stop_after[1] !== 'Tyler earned 32,000 Defense XP for 4,000 gold.') fails.push('TR-0 a "Stop after" end reads ' + JSON.stringify(r.ended.stop_after));
      if (r.ended.hunt[0] !== 'Tyler stopped training Defense to go hunting.') fails.push('TR-0 a hunt\'s end reads ' + JSON.stringify(r.ended.hunt[0]));
      await ctx.close();
    }

    /* TR-1: the switch off; the section going away */
    {
      const s = world({ training: null });
      const { ctx, page, errors } = await open(s);
      if (await page.$('[data-hs-open="training"]')) fails.push('TR-1 the switch is off and the Training icon shows');
      const r = await page.evaluate(async ({ la, sw, st }) => {
        const L = await import(la), W = await import(sw), S = await import(st);
        const row = W.SHELL_WINDOWS.find((x) => x.id === 'training');
        const yard = S.STATIONS.find((x) => x.id === 'training_yard');
        const off = { read: () => null }, on = { read: (k) => (k === 'training' ? { open: true } : null) };
        return { off: L.rowOffered(row, off), on: L.rowOffered(row, on), orElse: row && row.orElse, opens: yard && yard.opens && yard.opens.window };
      }, { la: await mod(page, '/src/shell/launcher.js'), sw: await mod(page, '/src/data/shell-windows.js'), st: await mod(page, '/src/data/world/stations.js') });
      if (r.off !== false || r.on !== true) fails.push('TR-1 rowOffered reads ' + JSON.stringify(r));
      if (r.opens !== 'training' || r.orElse !== 'hunts') fails.push('TR-1 the yard opens ' + r.opens + ', else ' + r.orElse);
      if (sent(s, 'hr_training_tick').length) fails.push('TR-1 a tick went out with the switch off');
      if (errors.length) fails.push('TR-1 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    {
      const s = world({});
      const { ctx, page } = await open(s);
      if (!await openWindow(page, 'TR-1')) fails.push('TR-1 the switch on: the window did not open from its icon');
      s.training = null;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.click('[data-hs-open="hunts"]').catch(() => {});
      await page.waitForTimeout(200);
      /* a re-read: the server no longer sends the section */
      await page.evaluate(async () => { const b = document.querySelector('[data-hs-act="train-start"]'); if (b) b.blur(); });
      s.calls.length = 0;
      await page.reload({ waitUntil: 'load' });
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]') || document.querySelector('.hs-launchers'));
      if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
      await wait(page, () => document.querySelector('.hs-launchers'));
      await page.waitForTimeout(400);
      if (await page.$('[data-hs-open="training"]')) fails.push('TR-1 the section went away and the icon stayed');
      if (await shown(page, '[data-hs-win="training"] .tw-train')) fails.push('TR-1 the section went away and the window stayed open');
      await ctx.close();
    }

    /* TR-2, TR-3, TR-4: start, tick, stop on one page */
    {
      const s = world({});
      const { ctx, page, errors } = await open(s);
      if (!await openWindow(page, 'TR-2')) fails.push('TR-2 the window did not open from its icon');
      const rate = await q(page, '.tw-rate');
      if (rate !== 'At Level 20, an hour here earns 8,000 skill XP and costs 1,000 gold.') fails.push('TR-2 the rate reads ' + JSON.stringify(rate));
      const skills = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="training"] .tw-skill'), (b) => b.getAttribute('data-skill') + ':' + b.querySelector('.tw-skill-level').textContent));
      if (skills.join(' ') !== 'melee:1 ranged:5 magic:1 defense:19') fails.push('TR-2 the skills read ' + skills.join(' '));
      await press(page, '[data-hs-win="training"] .tw-skill[data-skill="defense"]', 'TR-2');
      const next = await q(page, '.tw-next');
      if (!/^Defense is 19\. The next level takes about .+ here\.$/.test(next || '')) fails.push('TR-2 the next level reads ' + JSON.stringify(next));
      await press(page, '[data-hs-win="training"] .tw-hour[data-hours="4"]', 'TR-2');
      await page.fill('[data-hs-win="training"] .tw-keep', '1000');
      await page.waitForTimeout(150);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-pick.png') });
      await press(page, '[data-hs-act="train-start"]', 'TR-2');
      await wait(page, () => { const e = document.querySelector('[data-hs-win="training"] .tw-run'); return !!e && !e.hidden; }, null, 4000);
      const starts = sent(s, 'hr_training_start');
      const b = starts[0] && starts[0].body;
      if (starts.length !== 1) fails.push('TR-2 ' + starts.length + ' starts went out');
      else if (b.p_slot !== 0 || b.p_skill !== 'defense' || b.p_place !== 'yard' || b.p_stop_after_h !== 4 || b.p_keep_gold !== 1000
        || !/^[0-9a-f-]{36}$/.test(b.p_idem || '') || Object.keys(b).sort().join(',') !== 'p_idem,p_keep_gold,p_place,p_skill,p_slot,p_stop_after_h') fails.push('TR-2 the start sent ' + JSON.stringify(b));
      const now = await q(page, '.tw-now');
      if (now !== 'Tyler is training Defense.') fails.push('TR-2 the run reads ' + JSON.stringify(now));
      if (!/^It stops in (3 hours 5\d minutes|4 hours)\.$/.test(await q(page, '.tw-left') || '')) fails.push('TR-2 the time left reads ' + JSON.stringify(await q(page, '.tw-left')));
      if (await q(page, '.tw-keep-line') !== 'It also stops if your gold gets down to 1,000.') fails.push('TR-2 the keep reads ' + JSON.stringify(await q(page, '.tw-keep-line')));
      if (await shown(page, '[data-hs-win="training"] .tw-form')) fails.push('TR-2 the choices still show while it runs');
      /* TR-3: the run's mark is over a minute back: ONE tick, the slot alone, then the re-read's numbers replace the first answer's */
      await wait(page, (n) => document.querySelector('[data-hs-win="training"] .tw-so-far') && /156 XP/.test(document.querySelector('[data-hs-win="training"] .tw-so-far').textContent), null, 6000);
      const ticks = sent(s, 'hr_training_tick');
      if (ticks.length !== 1 || JSON.stringify(ticks[0].body) !== '{"p_slot":0}') fails.push('TR-3 the ticks sent ' + JSON.stringify(ticks.map((c) => c.body)));
      const soFar = await q(page, '.tw-so-far');
      if (soFar !== 'So far Tyler has earned 156 XP and spent 19 gold.') fails.push('TR-3 after the tick the run reads ' + JSON.stringify(soFar));
      const afterTick = s.calls.slice(s.calls.findIndex((c) => c.name === 'hr_training_tick') + 1).map((c) => c.name);
      if (!afterTick.includes('hr_load')) fails.push('TR-3 a tick that paid was not re-read: ' + afterTick.join(','));
      const purse = await q(page, '.tw-purse');
      if (purse !== 'You have 5,181 gold.') fails.push('TR-3 the purse after the tick reads ' + JSON.stringify(purse));
      await page.waitForTimeout(1200);
      if (sent(s, 'hr_training_tick').length !== 1) fails.push('TR-3 the tick went out again before the server\'s next minute');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-running.png') });
      /* TR-4 */
      await press(page, '[data-hs-act="train-stop"]', 'TR-4');
      await wait(page, () => { const e = document.querySelector('[data-hs-win="training"] .tw-ended'); return !!e && !e.hidden; }, null, 4000);
      const stops = sent(s, 'hr_training_stop');
      if (stops.length !== 1 || stops[0].body.p_slot !== 0 || !stops[0].body.p_idem || Object.keys(stops[0].body).length !== 2) fails.push('TR-4 the stop sent ' + JSON.stringify(stops.map((c) => c.body)));
      if (await q(page, '.tw-why-ended') !== 'You stopped Tyler\'s Defense training.') fails.push('TR-4 the end reads ' + JSON.stringify(await q(page, '.tw-why-ended')));
      if (await q(page, '.tw-earned') !== 'Tyler earned 156 Defense XP for 19 gold.') fails.push('TR-4 what it came to reads ' + JSON.stringify(await q(page, '.tw-earned')));
      if (!await shown(page, '[data-hs-win="training"] .tw-form') || await shown(page, '[data-hs-win="training"] .tw-run')) fails.push('TR-4 the choices did not come back');
      /* the remembered settings are the server's: Defense, 4 hours, keep 1,000 */
      const picks = await page.evaluate(() => ({ skill: (document.querySelector('[data-hs-win="training"] .tw-skill[aria-checked="true"]') || {}).dataset,
        hours: (document.querySelector('[data-hs-win="training"] .tw-hour[aria-checked="true"]') || {}).dataset, keep: document.querySelector('[data-hs-win="training"] .tw-keep').value }));
      if (!picks.skill || picks.skill.skill !== 'defense' || !picks.hours || picks.hours.hours !== '4' || picks.keep !== '1000') fails.push('TR-4 the picks after the stop read ' + JSON.stringify(picks));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-stopped.png') });
      if (errors.length) fails.push('TR-2/4 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }

    /* TR-5: the page closed for hours; the server's sweep paid it */
    {
      const s = world({ active: 'training', gold: 3200, training: SECTION({ settings: { skill: 'magic', place: 'yard', stop_after_h: 8, keep_gold: 0 },
        run: RUN({ skill: 'magic', keep_gold: 0, since: iso(Date.now() - 6 * HOUR), settled_to: iso(Date.now() - 5000), stop_at: iso(Date.now() + 2 * HOUR), ms: 6 * HOUR, xp: 48000, gold: 6000 }) }) });
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-5');
      if (await q(page, '.tw-so-far') !== 'So far Tyler has earned 48,000 XP and spent 6,000 gold.') fails.push('TR-5 reopened, the run reads ' + JSON.stringify(await q(page, '.tw-so-far')));
      if (await q(page, '.tw-now') !== 'Tyler is training Magic.') fails.push('TR-5 reopened, the hero reads ' + JSON.stringify(await q(page, '.tw-now')));
      if (await q(page, '.tw-keep-line') !== 'It also stops if your gold runs out.') fails.push('TR-5 a keep of 0 reads ' + JSON.stringify(await q(page, '.tw-keep-line')));
      if (sent(s, 'hr_training_tick').length) fails.push('TR-5 a tick went out before the server\'s minute');
      await ctx.close();
    }
    {
      const s = world({ training: SECTION({ settings: { skill: 'defense', place: 'yard', stop_after_h: 4, keep_gold: 500 },
        last_stop: { reason: 'stop_after', at: iso(Date.now() - HOUR), skill: 'defense', ms: 4 * HOUR, xp: 32000, gold: 4000 } }) });
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-5');
      if (await q(page, '.tw-why-ended') !== 'Tyler finished 4 hours of Defense training.' || await q(page, '.tw-earned') !== 'Tyler earned 32,000 Defense XP for 4,000 gold.') {
        fails.push('TR-5 a run its "Stop after" ended reads ' + JSON.stringify([await q(page, '.tw-why-ended'), await q(page, '.tw-earned')]));
      }
      await ctx.close();
    }

    /* TR-6: each refusal on screen; the play cap; settle_first */
    {
      const CASES = [
        [{ error: 'feature_off' }, 'The training yard is closed right now.'],
        [{ error: 'level_low', level: 7, need: 10 }, 'The yard opens at Level 10. Tyler is Level 7.'],
        [{ error: 'no_dummy' }, 'You don\'t have a training dummy at home yet. Train at the yard.'],
        [{ error: 'bad_hours', min: 1, max: 24 }, 'Pick 1 to 24 hours, or until you stop it.'],
        [{ error: 'bad_keep', max: 1000000000 }, 'You can keep at most 1,000,000,000 gold.'],
        [{ error: 'in_hunt' }, 'Tyler is out hunting. Come back to town to train.'],
        [{ error: 'cannot_pay', purse: 1010, keep: 1000, need: 17 }, 'You have 1,010 gold and want to keep 1,000. That isn\'t enough to start.'],
        [{ error: 'bad_skill' }, 'You can train Melee, Ranged, Magic or Defense at the yard.'],
        [{ error: 'rate_limited' }, null],
      ];
      let answer = null;
      const s = world({ onStart: () => answer });
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-6');
      await page.fill('[data-hs-win="training"] .tw-keep', '1000');
      for (const [a, words] of CASES) {
        answer = Object.assign({ ok: false }, a);
        await press(page, '[data-hs-act="train-start"]', 'TR-6');
        await wait(page, () => { const m = document.querySelector('[data-hs-win="training"] .hh-intent-msg'); return !!m && m.textContent && !/…$/.test(m.textContent); }, null, 3000);
        const said = await msg(page);
        if (words ? said !== words : (!said || /did not go through/.test(said))) fails.push('TR-6 ' + a.error + ' reads ' + JSON.stringify(said));
        if (a.error === 'level_low' && SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-refused.png') });
      }
      /* the play cap: its popup, and the window's line stays empty */
      answer = { ok: false, error: 'too_many_playing' };
      await press(page, '[data-hs-act="train-start"]', 'TR-6');
      if (!await wait(page, () => !!document.querySelector('[data-hs-win="play-cap"]'), null, 3000)) fails.push('TR-6 the play cap opened no popup');
      if (await msg(page)) fails.push('TR-6 the play cap also wrote the window\'s line: ' + JSON.stringify(await msg(page)));
      await page.click('[data-hs-act="play-cap-ok"]').catch(() => {});
      /* settle_first: the engine settles the town job once, then ONE more ask under a new key */
      const before = s.calls.length;
      let n = 0;
      s.onStart = (b) => (++n === 1 ? { ok: false, error: 'settle_first' } : world({}).onStart.call(null, b) && { ok: true, skill: b.p_skill, training: SECTION({}) });
      await press(page, '[data-hs-act="train-start"]', 'TR-6');
      await page.waitForTimeout(800);
      const seq = s.calls.slice(before).map((c) => c.name).filter((x) => x === 'hr_training_start' || x === 'hr-accrue');
      const keys = s.calls.slice(before).filter((c) => c.name === 'hr_training_start').map((c) => c.body.p_idem);
      if (seq.slice(0, 3).join(',') !== 'hr_training_start,hr-accrue,hr_training_start' || keys.length !== 2 || keys[0] === keys[1]) fails.push('TR-6 settle_first sent ' + seq.join(',') + ' keys ' + JSON.stringify(keys));
      await ctx.close();
    }

    /* TR-7: say why before the press */
    {
      const s = world({ level: 7, training: SECTION({ open: false, level: 7, xp_h: 2800, gold_h: 350 }) });
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-7');
      const off = await page.evaluate(() => { const b = document.querySelector('[data-hs-act="train-start"]'); return { off: b.disabled, why: document.querySelector('[data-hs-win="training"] .tw-off-why').textContent }; });
      if (!off.off || off.why !== 'The yard opens at Level 10. Tyler is Level 7.') fails.push('TR-7 under the yard\'s Level: ' + JSON.stringify(off));
      await ctx.close();
    }
    {
      const s = world({});
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-7');
      await page.fill('[data-hs-win="training"] .tw-keep', '5200');
      await page.waitForTimeout(150);
      const off = await page.evaluate(() => { const b = document.querySelector('[data-hs-act="train-start"]'); return { off: b.disabled, why: document.querySelector('[data-hs-win="training"] .tw-off-why').textContent }; });
      if (!off.off || off.why !== 'You have 5,200 gold. Keep less than that to train.') fails.push('TR-7 a keep of the whole purse: ' + JSON.stringify(off));
      await page.fill('[data-hs-win="training"] .tw-keep', 'lots');
      await page.waitForTimeout(150);
      const typed = await page.evaluate(() => document.querySelector('[data-hs-win="training"] .tw-off-why').textContent);
      if (typed !== 'Type how much gold to keep, as a whole number.') fails.push('TR-7 a keep that isn\'t a number: ' + JSON.stringify(typed));
      if (sent(s, 'hr_training_start').length) fails.push('TR-7 a start went out from a press that was off');
      await ctx.close();
    }
    {
      const s = world({ active: 'combat', hunt: Object.assign(clone(BASE_ENV.hunt), { ended: false }) });
      const { ctx, page } = await open(s);
      await openWindow(page, 'TR-7');
      const why = await page.evaluate(() => (document.querySelector('[data-hs-win="training"] .tw-off-why') || {}).textContent);
      if (why !== 'Tyler is out hunting. Come back to town to train.') fails.push('TR-7 out hunting: ' + JSON.stringify(why));
      await ctx.close();
    }

    /* TR-8: sizes on the desktop and the phone */
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 922, height: 423 }]]) {
      const s = world({ training: SECTION({ settings: { skill: 'defense', place: 'yard', stop_after_h: 4, keep_gold: 500 },
        last_stop: { reason: 'keep_gold', at: iso(Date.now() - HOUR), skill: 'defense', ms: 2 * HOUR, xp: 16000, gold: 2000 } }) });
      const { ctx, page } = await open(s, viewport);
      if (label === 'phone') await page.evaluate(() => { const b = document.querySelector('[data-hs-open="training"]'); if (!b) { const c = document.querySelector('[data-hs-open="characters"]'); if (c) c.click(); } });
      const opened = await page.evaluate(() => !!document.querySelector('[data-hs-open="training"]'));
      if (opened) await openWindow(page, 'TR-8'); else fails.push('TR-8 ' + label + ': no way to the Training window');
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const win = document.querySelector('[data-hs-win="training"]');
        if (!win) return null;
        const small = [];
        for (const el of win.querySelectorAll('*')) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.offsetParent === null) continue;
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px < 12) small.push(el.className + ' ' + px);
        }
        const r = win.getBoundingClientRect();
        const body = win.querySelector('[data-hs-body]');
        return { small, right: r.right, left: r.left, vw: innerWidth, wide: body ? body.scrollWidth > body.clientWidth + 1 : true };
      });
      if (!m) fails.push('TR-8 ' + label + ': the window did not open');
      else {
        if (m.small.length) fails.push('TR-8 ' + label + ': text under 12 px: ' + m.small.slice(0, 4).join(', '));
        if (m.left < -1 || m.right > m.vw + 1) fails.push('TR-8 ' + label + ': the window runs off the screen ' + JSON.stringify(m));
        if (m.wide) fails.push('TR-8 ' + label + ': the window scrolls sideways');
      }
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-' + label + '-ended.png') });
      await ctx.close();
    }

    /* TR-9: another job, a hunt, a setup change */
    {
      const s = world({});
      const { ctx, page } = await open(s);
      const r = await page.evaluate(async ({ tw, pi }) => {
        const T = await import(tw), P = await import(pi);
        const make = () => {
          const calls = [];
          const cs = { slot: 0, status: 'ready', intents: null, read: (k) => (k === 'state' ? { active_kind: 'training', active_id: 'yard_defense' } : null),
            edgeIntent: async (v, f) => { calls.push('edge:' + v + ':' + (f.activity ? f.activity.kind : '')); return { ok: true }; }, load: async () => true };
          const account = { server: { rpc: async (n) => { calls.push('rpc:' + n); return { ok: true, body: { ok: true } }; } } };
          return { cs, account, calls };
        };
        const job = make();
        await T.startWork(job.cs, T.workRow('gather', 'normal_tree'), (fn) => fn(), () => {}, undefined, null, job.account);
        const hunt = make();
        await P.settleTownActivity(hunt.cs);
        const setup = make();
        await P.settleTownActivity(setup.cs, setup.account);
        return { job: job.calls, hunt: hunt.calls, setup: setup.calls };
      }, { tw: await mod(page, '/src/shell/town-work.js'), pi: await mod(page, '/src/session/party-intents.js') });
      if (r.job.join(' ') !== 'rpc:hr_training_stop edge:set_activity:gather') fails.push('TR-9 a town job from the yard sent ' + r.job.join(' '));
      if (r.hunt.length) fails.push('TR-9 a hunt from the yard sent ' + r.hunt.join(' ') + ' (the hunt\'s start closes the run)');
      if (r.setup.join(' ') !== 'rpc:hr_training_stop') fails.push('TR-9 a setup change from the yard sent ' + r.setup.join(' '));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  { name: 'the icon shows with the switch off', file: 'src/shell/launcher.js', from: "if (typeof r.section === 'string') {", to: "if (false) {", want: /TR-1/ },
  { name: 'the window stays when the section goes', file: 'src/shell/windows/training.js', from: "if (!tr) { if (ctx.wm && typeof ctx.wm.close === 'function') ctx.wm.close('training'); return; }", to: 'if (!tr) return;', want: /TR-1/ },
  { name: 'the start sends a rate', file: 'src/session/training-intents.js', from: 'p_stop_after_h: hours, p_keep_gold: keep, p_idem: newIdem() });', to: 'p_stop_after_h: hours, p_keep_gold: keep, p_gold_h: 1000, p_idem: newIdem() });', want: /TR-2/ },
  { name: 'the tick never goes', file: 'src/session/training-poll.js', from: 'if (a.busy || !trainingTickDue(tr.run, serverNowOf(cs), a.at, now)) return false;', to: 'if (true) return false;', want: /TR-3/ },
  { name: 'a tick that paid is not re-read', file: 'src/session/training-poll.js', from: "return moved && typeof cs.load === 'function' ? cs.load() : false;", to: 'return false;', want: /TR-3/ },
  { name: 'the tick goes on every display tick', file: 'src/session/training-poll.js', from: 'if (Number.isFinite(lastAskMs) && nowMs - lastAskMs < TICK_FLOOR_MS) return false;', to: 'if (Number.isFinite(lastAskMs) && nowMs - lastAskMs < 100) return false;\n  return true;', want: /TR-3|TR-5/ },
  { name: 'every end reads as the player\'s stop', file: 'src/shell/training-words.js', from: "t('training.ended_' + last.reason,", to: "t('training.ended_stopped',", want: /TR-0|TR-5/ },
  { name: 'cannot_pay loses the server\'s numbers', file: 'src/shell/training-words.js', from: "if (r.error === 'cannot_pay' && num(r.purse) && num(r.keep))", to: 'if (false)', want: /TR-0|TR-6/ },
  { name: 'settle_first is not settled and asked again', file: 'src/session/training-intents.js', from: "if (bodyOf(ans).error === 'settle_first' && typeof cs.hello === 'function') {", to: 'if (false) {', want: /TR-6/ },
  { name: 'Start is on for a keep of the whole purse', file: 'src/shell/windows/training.js', from: 'if (purse !== null && purse <= keep)', to: 'if (purse !== null && purse < keep)', want: /TR-7/ },
  { name: 'a town job does not stop the run first', file: 'src/shell/town-work.js', from: 'return send(() => (account ? leave().then((left) => (left.ok ? go() : left)) : go()),', to: 'return send(() => go(),', want: /TR-9/ },
  { name: 'a hunt stops the run through the engine', file: 'src/session/party-intents.js', from: "const TOWN_KINDS = Object.freeze(['gather', 'artisan']);", to: "const TOWN_KINDS = Object.freeze(['gather', 'artisan', 'training']);", want: /TR-9/ },
];

async function main() {
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  if (ARGS.includes('--mutate') || ARGS.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('training-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    for (const m of MUTANTS) {
      const src = (await readFile(join(ROOT, m.file), 'utf8')).replace(/\r\n/g, '\n');
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `training-window --mutate: ${escaped} ESCAPED` : `training-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'training-window: ' + fails.length + ' FAILED' : 'training-window: green (every refusal has words, nothing shows with the switch off, start, tick, stop, both paths, say why, sizes, another job)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
