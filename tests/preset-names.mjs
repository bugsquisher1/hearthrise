#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/preset-names.mjs — RENAME AND DELETE A SAVED SETUP; NAME THE ACTION SET (ruling C4).
//
//   node tests/preset-names.mjs           the rules
//   node tests/preset-names.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/hunt-prep.js src/shell/inline-name.js src/shell/widgets/action-bar.js src/session/preset-intents.js src/shell/setup-words.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json. The stub plays the server
// of supabase/migrations/2026-11-15-preset-names.sql: an accepted rename or delete
// changes ITS envelope, which every later hr_load returns (a reload reads it).
//   PN-1  RENAME IS ONE INTENT, SERVER FIRST: pressing a setup's name opens a field
//         holding it; Enter sends exactly ONE hr_hunt_preset_rename {slot, preset,
//         name}; the old name stays and the setup's controls are off until the
//         answer; the new name shows from the re-read and again after a reload
//   PN-2  ESCAPE SENDS NOTHING: a typed name and Escape put the old name back
//   PN-3  A REFUSAL IN PLAIN WORDS: a refused name (bad_preset_name) says why and
//         the name stays the server's
//   PN-4  DELETE ASKS ONCE: the first press sends nothing and reads "Delete it?";
//         Keep backs out; the second press sends ONE hr_hunt_preset_delete and the
//         row goes only with the re-read ("No saved setups yet." after a reload)
//   PN-5  THE BAR'S SET: the plaque's name renames in place with ONE
//         hr_action_set_rename naming the set the server shows, and the new name
//         stays after a reload
//   PN-6  zero console errors
// THE ONE-SETUP MODEL (designer ruling 2026-10-22: a setup owns its bar; the hero is on one):
//   PN-7  THE SETUP IN USE: the row the server's hunt_settings.preset names reads
//         "In use" and offers no Delete; the others keep theirs
//   PN-8  SETUPS CHANGE IN TOWN: with a hunt open, Use, Save here and Save current
//         setup are off and the window says why; once the hunt has ended, Save
//         current setup sends ONE hr_hunt_preset_save on the first free number
//   PN-9  FIVE AT MOST: with ACTION_SET_LIMITS.presets setups, Save current setup is off, also when the server's
//         setup_slots counts past that limit (the window then says the limit's number)
//   PN-11 THE SLOT IS BOUGHT (Tyler 2026-11-04; every number from the row, src/data/gold-sinks.js): past the server's count Save is off, the
//         window says so in the design's words, and Buy sends ONE hr_setup_slot_buy with the QUOTE; the next slot opens only from the re-read,
//         and the save lands on the bought number; a short purse says how much more; past the top there is no button; A SETUP ALREADY SAVED
//         past the count keeps every control; a save the server refuses says the server's numbers
//   PN-12 NO COUNT, NO FREE SLOT (audit 11-09 F5, §6 fail safe): with no setup_slots section and one setup saved, Save current setup
//         is off, nothing is for sale and the window says "Reading your setup slots…"; with no hunt_presets the none line says
//         "Reading your saved setups…" (both are projected: never "switch on when the server starts keeping them")
//   PN-10 A BAR RENAME THE SERVER NEVER ANSWERS (lane/b-action-bar-fix: renameSet called an undefined function on
//         the timeout, so the line stuck on "Renaming…" and the page threw): after BAR_ANSWER_MS the plaque says the
//         server has not answered, keeps the server's name and turns its name control back on, with no page error
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { pathToFileURL } from 'node:url';
import { pinFonts } from './_test-fonts.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const { BAR_ANSWER_MS } = await import(pathToFileURL(join(ROOT, 'src/data/hunt-hud.js')).href);
const { SINK_RULES } = await import(pathToFileURL(join(ROOT, 'src/data/gold-sinks.js')).href);
const { ACTION_SET_LIMITS } = await import(pathToFileURL(join(ROOT, 'src/data/rule-subjects.js')).href);
const RPCS = ['hr_hunt_preset_rename', 'hr_hunt_preset_delete', 'hr_action_set_rename', 'hr_setup_slot_buy'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted() {
  const s = { env: clone(FIXTURE), version: 1, calls: [], delayMs: 400, refuse: null, hang: false };
  s.env.hunt_presets = [s.env.hunt_presets[0], Object.assign(clone(s.env.hunt_presets[0]), { preset: 3, name: 'Mill run' })];
  s.next = () => Object.assign(clone(s.env), { version: ++s.version, client_state: {} });
  /* The server's answer to one of the three verbs: a refusal leaves the record as it was. */
  s.answer = (name, b) => {
    if (s.refuse) return { ok: false, error: s.refuse };
    if (name === 'hr_hunt_preset_rename') s.env.hunt_presets.find((p) => p.preset === b.p_preset).name = b.p_name;
    if (name === 'hr_hunt_preset_delete') s.env.hunt_presets = s.env.hunt_presets.filter((p) => p.preset !== b.p_preset);
    if (name === 'hr_action_set_rename') s.env.hunt_settings.presets.find((p) => p.preset === b.p_preset).name = b.p_name;
    if (name === 'hr_setup_slot_buy') {
      const R = SINK_RULES.setup_slot, was = s.env.setup_slots;
      s.env.setup_slots = { ...was, count: was.count + 1, bought: was.bought + 1, price: R.prices[was.bought + 1] === undefined ? null : R.prices[was.bought + 1] };
    }
    return { ok: true };
  };
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next()));
    /* s.hang: the server never answers (the request stays open until the page closes). */
    if (RPCS.includes(name) && s.hang) return;
    if (name === 'hr_hunt_preset_save' && s.refuseSave) return json(s.refuseSave);
    if (RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(s.answer(name, body)); }
    return json({ ok: true });
  });
}

/* A (re)load waits for DOMContentLoaded and its STATE, never the `load` event (alpha-windows' LOAD-PROOF): no rule here is
   about how fast a page boots, and on a busy machine the default 6 s ran out on the boot itself (2026-11-09, base and lane alike). */
const BOOTED = 'domcontentloaded';
const BOOT_MS = 60000;
async function play(page) {
  await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'), null, BOOT_MS);
  if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'), null, BOOT_MS);
}
async function signIn(page, base) {
  await page.goto(base + '/play.html', { waitUntil: BOOTED, timeout: BOOT_MS });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'), null, BOOT_MS);
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  return play(page);
}
async function reload(page) { await page.reload({ waitUntil: BOOTED, timeout: BOOT_MS }); return play(page); }
async function openPrep(page) {
  if (await page.$('[data-hs-win="hunt-prep"] [data-hs-built]')) return true;
  await page.keyboard.press('p');
  return wait(page, () => document.querySelector('[data-hs-win="hunt-prep"] [data-hs-built]'), null, 3000);
}
const ROW = (n) => '[data-hs-win="hunt-prep"] .hw-setup:has([data-preset="' + n + '"])';
const nameOf = (page, n) => page.evaluate((sel) => { const b = document.querySelector(sel + ' .hs-name-t'); return b ? b.textContent : null; }, ROW(n));
const msgOf = (page) => page.evaluate(() => document.querySelector('[data-hs-win="hunt-prep"] .hh-intent-msg').textContent);
const sent = (s, name) => s.calls.filter((c) => c.name === name);

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides || {});
  const browser = await leaseBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const s = scripted();
  try {
    await stub(page, s);
    /* The page's timers on a clock this test can move (PN-10 jumps past BAR_ANSWER_MS); it runs at real speed otherwise. */
    await page.clock.install();
    if (!(await signIn(page, 'http://127.0.0.1:' + port)) || !(await openPrep(page))) throw new Error('the shell or Hunt prep did not open');
    // PN-7 (the fixture's hero is on set 0)
    const use7 = await page.evaluate((sels) => sels.map((sel) => { const li = document.querySelector(sel); return li && { cur: li.classList.contains('is-current'), small: li.querySelector('small').textContent }; }), [ROW(0), ROW(3)]);
    if (!use7[0] || !use7[0].cur || !/^In use · /.test(use7[0].small) || use7[1].cur || /In use/.test(use7[1].small)) fails.push('PN-7 the setup in use is not marked: ' + JSON.stringify(use7));
    if (await page.isVisible(ROW(0) + ' .hw-del') || !(await page.isVisible(ROW(3) + ' .hw-del'))) fails.push('PN-7 Delete is offered on the setup in use (or not on the other)');
    // PN-8 (the fixture's hunt is open)
    const off8 = await page.evaluate((sel) => ({ use: document.querySelector(sel + ' .hw-use').disabled, over: document.querySelector(sel + ' [data-hs-act="save-over"]').disabled,
      add: document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]').disabled,
      why: !!document.querySelector('[data-hs-win="hunt-prep"] .hw-town-only.is-on') }), ROW(3));
    if (!off8.use || !off8.over || !off8.add || !off8.why) fails.push('PN-8 with a hunt open the setup controls read ' + JSON.stringify(off8));
    // PN-1
    await page.click(ROW(0) + ' .hs-name');
    const field = ROW(0) + ' .hs-name-edit';
    if (!(await page.isVisible(field)) || (await page.inputValue(field)) !== 'Cellar rats') fails.push('PN-1 pressing the name opened no field holding it');
    await page.fill(field, '  Rat cellar ');
    await page.press(field, 'Enter');
    await page.waitForTimeout(120);
    const mid = { name: await nameOf(page, 0), off: await page.evaluate((sel) => document.querySelector(sel + ' .hs-name').disabled, ROW(0)) };
    if (mid.name !== 'Cellar rats') fails.push('PN-1 the name changed before the server answered: ' + mid.name);
    if (!mid.off) fails.push('PN-1 the setup\'s controls stayed on while the rename was with the server');
    await page.waitForTimeout(800);
    const rn = sent(s, 'hr_hunt_preset_rename');
    if (rn.length !== 1 || rn[0].body.p_slot !== 0 || rn[0].body.p_preset !== 0 || rn[0].body.p_name !== 'Rat cellar' || !rn[0].body.p_idem)
      fails.push('PN-1 Enter sent ' + JSON.stringify(rn.map((c) => c.body)));
    if (await nameOf(page, 0) !== 'Rat cellar') fails.push('PN-1 the re-read name reads ' + await nameOf(page, 0));
    // PN-2
    await page.click(ROW(3) + ' .hs-name');
    await page.fill(ROW(3) + ' .hs-name-edit', 'Nope');
    await page.press(ROW(3) + ' .hs-name-edit', 'Escape');
    await page.waitForTimeout(500);
    if (sent(s, 'hr_hunt_preset_rename').length !== 1 || await nameOf(page, 3) !== 'Mill run' || await page.isVisible(ROW(3) + ' .hs-name-edit'))
      fails.push('PN-2 Escape sent a rename or left the field open (' + await nameOf(page, 3) + ')');
    // PN-3
    s.refuse = 'bad_preset_name';
    await page.click(ROW(3) + ' .hs-name');
    await page.fill(ROW(3) + ' .hs-name-edit', 'Bad word');
    await page.press(ROW(3) + ' .hs-name-edit', 'Enter');
    await page.waitForTimeout(900);
    if (!/1 to 24 characters/.test(await msgOf(page)) || await nameOf(page, 3) !== 'Mill run') fails.push('PN-3 a refused name reads "' + await msgOf(page) + '" / ' + await nameOf(page, 3));
    s.refuse = null;
    // PN-4
    await page.click(ROW(3) + ' .hw-del');
    await page.waitForTimeout(150);
    const asked = await page.evaluate((sel) => document.querySelector(sel + ' .hw-del').textContent, ROW(3));
    if (sent(s, 'hr_hunt_preset_delete').length || asked !== 'Delete it?') fails.push('PN-4 the first Delete press sent or did not ask (' + asked + ')');
    await page.click(ROW(3) + ' .hw-keep');
    await page.waitForTimeout(150);
    if (await page.evaluate((sel) => document.querySelector(sel + ' .hw-del').textContent, ROW(3)) !== 'Delete') fails.push('PN-4 Keep did not back out');
    await page.click(ROW(3) + ' .hw-del');
    await page.click(ROW(3) + ' .hw-del');
    await page.waitForTimeout(120);
    if (!(await page.$(ROW(3)))) fails.push('PN-4 the row went before the server answered');
    await page.waitForTimeout(800);
    const dl = sent(s, 'hr_hunt_preset_delete');
    if (dl.length !== 1 || dl[0].body.p_preset !== 3) fails.push('PN-4 Delete sent ' + JSON.stringify(dl.map((c) => c.body)));
    if (await page.$(ROW(3))) fails.push('PN-4 the deleted setup is still listed after the re-read');
    // PN-5
    await page.click('.hb-set .hs-name');
    await page.fill('.hb-set .hs-name-edit', 'Tank bar');
    await page.press('.hb-set .hs-name-edit', 'Enter');
    await page.waitForTimeout(900);
    const ar = sent(s, 'hr_action_set_rename');
    if (ar.length !== 1 || ar[0].body.p_preset !== FIXTURE.hunt_settings.preset || ar[0].body.p_name !== 'Tank bar') fails.push('PN-5 the plaque sent ' + JSON.stringify(ar.map((c) => c.body)));
    // PN-10
    s.hang = true;
    const thrown = errors.length;
    await page.click('.hb-set .hs-name');
    await page.fill('.hb-set .hs-name-edit', 'Late name');
    await page.press('.hb-set .hs-name-edit', 'Enter');
    await page.waitForTimeout(150);
    await page.clock.fastForward(BAR_ANSWER_MS + 500);
    await page.waitForTimeout(300);
    const late = await page.evaluate(() => ({ msg: document.querySelector('.hb-plaque .hh-intent-msg').textContent, name: document.querySelector('.hb-set .hs-name-t').textContent,
      off: document.querySelector('.hb-set .hs-name').disabled }));
    if (!/has not answered/.test(late.msg) || late.name !== 'Tank bar' || late.off || errors.length > thrown)
      fails.push('PN-10 a rename the server never answers left ' + JSON.stringify(late) + (errors.length > thrown ? ' and threw: ' + errors[thrown] : ''));
    s.hang = false;
    // after a reload, everything reads from the server's record
    if (!(await reload(page)) || !(await openPrep(page))) throw new Error('the reload did not come back');
    await page.waitForTimeout(300);
    if (await nameOf(page, 0) !== 'Rat cellar') fails.push('PN-1 after a reload the setup reads ' + await nameOf(page, 0));
    if (await page.$(ROW(3))) fails.push('PN-4 after a reload the deleted setup is back');
    const bar = await page.evaluate(() => document.querySelector('.hb-set .hs-name-t').textContent);
    if (bar !== 'Tank bar') fails.push('PN-5 after a reload the plaque reads ' + bar);
    s.env.hunt_presets = [];
    await reload(page);
    await openPrep(page);
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => /No saved setups yet/.test(document.querySelector('.hw-presets-none.is-on')?.textContent || '')))) fails.push('PN-4 none left does not say so');
    // PN-8 back in town: the hunt has ended; setups 0 and 2 exist, so the next is number 1.
    s.env.hunt.ended = true;
    s.env.hunt_presets = [clone(FIXTURE.hunt_presets[0]), Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: 2, name: 'Mill run' })];
    await reload(page);
    await openPrep(page);
    await page.waitForTimeout(300);
    if (await page.isVisible('[data-hs-win="hunt-prep"] .hw-town-only')) fails.push('PN-8 in town the window still says setups change in town');
    await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Thicket solo');
    await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
    await page.waitForTimeout(600);
    const sv = sent(s, 'hr_hunt_preset_save');
    if (sv.length !== 1 || sv[0].body.p_slot !== 0 || sv[0].body.p_preset !== 1 || sv[0].body.p_name !== 'Thicket solo') fails.push('PN-8 Save current setup sent ' + JSON.stringify(sv.map((c) => c.body)));
    // PN-9
    s.env.hunt_presets = [0, 1, 2, 3, 4].map((n) => Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: n, name: 'Setup ' + (n + 1) }));
    await reload(page);
    await openPrep(page);
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]').disabled))) fails.push('PN-9 a sixth setup can be saved');
    /* The data's limit holds even where the server's count says more (the fixture's count is the limit, so only this reaches it). */
    {
      const lim = ACTION_SET_LIMITS.presets, was = s.env.setup_slots;
      s.env.setup_slots = { count: lim + 1, free: lim + 1, bought: 0, max: lim + 1, price: null };
      await reload(page);
      await openPrep(page);
      await page.waitForTimeout(300);
      const past = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-prep"]');
        return { save: w.querySelector('[data-hs-act="save-new"]').disabled, why: w.querySelector('.hw-slot-why').hidden ? '' : w.querySelector('.hw-slot-why').textContent }; });
      if (!past.save || past.why !== `This hero's ${lim} setup slots are full. Delete one to save a new setup.`) fails.push('PN-9 a sixth setup can be saved when the server counts past the limit: ' + JSON.stringify(past));
      s.env.setup_slots = was;
    }
    // PN-11
    {
      const R = SINK_RULES.setup_slot, max = ACTION_SET_LIMITS.presets;
      const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
      const gp = (n) => n.toLocaleString('en-US') + ' gp';
      const setups = (nums) => nums.map((n) => Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: n, name: 'Setup ' + (n + 1) }));
      const upTo = (n) => Array.from({ length: n }, (_, i) => i);
      const prep = () => page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-prep"]'), b = w.querySelector('.hw-slot-buy');
        return { save: w.querySelector('[data-hs-act="save-new"]').disabled, buy: b.getBoundingClientRect().width > 0 ? b.textContent : null, off: b.disabled, why: w.querySelector('.hw-slot-why').hidden ? '' : w.querySelector('.hw-slot-why').textContent, msg: w.querySelector('.hh-intent-msg').textContent }; });
      const at = async () => { await reload(page); await openPrep(page); await page.waitForTimeout(300); };
      s.env.state = Object.assign({}, s.env.state, { gold: 10000000, gold_v: 1 });
      s.env.setup_slots = { count: R.free, free: R.free, bought: 0, max, price: R.prices[0] };
      s.env.hunt_presets = setups(upTo(R.free));
      await at();
      let p = await prep();
      const third = `Buy a ${ORD[R.free]} setup: ${gp(R.prices[0])}`;
      if (!p.save) fails.push('PN-11 Save is on with every slot used');
      if (p.buy !== third || p.off) fails.push('PN-11 the button reads ' + JSON.stringify(p));
      if (p.why !== `This hero's ${R.free} setup slots are full. Delete one, or buy a ${ORD[R.free]} for ${gp(R.prices[0])}.`) fails.push('PN-11 the window says ' + JSON.stringify(p.why));
      const before = sent(s, 'hr_setup_slot_buy').length;
      await page.click('[data-hs-win="hunt-prep"] .hw-slot-buy');
      await page.waitForTimeout(100);
      p = await prep();
      if (!p.off || p.buy !== third) fails.push('PN-11 while the purchase is in flight: ' + JSON.stringify(p));
      await page.waitForTimeout(900);
      const bought = sent(s, 'hr_setup_slot_buy').slice(before);
      if (bought.length !== 1 || bought[0].body.p_slot !== 0 || bought[0].body.p_price !== R.prices[0] || !bought[0].body.p_idem) fails.push('PN-11 Buy sent ' + JSON.stringify(bought.map((c) => c.body)));
      p = await prep();
      if (p.save) fails.push('PN-11 after the re-read Save is still off');
      if (p.buy !== null) fails.push('PN-11 with a slot open the button still shows: ' + p.buy);
      const savesBefore = sent(s, 'hr_hunt_preset_save').length;
      await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Bought one');
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
      await page.waitForTimeout(500);
      const sv11 = sent(s, 'hr_hunt_preset_save').slice(savesBefore);
      if (sv11.length !== 1 || sv11[0].body.p_preset !== R.free) fails.push('PN-11 the save on the bought slot sent ' + JSON.stringify(sv11.map((c) => c.body)));
      /* a save the server refuses (this window's numbers behind the server's): the refusal's own numbers */
      s.refuseSave = { ok: false, error: 'setup_locked', slots: R.free, price: R.prices[0] };
      await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Refused');
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
      await page.waitForTimeout(500);
      p = await prep();
      if (!p.msg.startsWith(`This hero's ${R.free} setup slots are full.`)) fails.push('PN-11 a refused save says ' + JSON.stringify(p.msg));
      s.refuseSave = null;
      /* a short purse: off, and says how much more; an answer's news on the line below doesn't hide it */
      s.env.state = Object.assign({}, s.env.state, { gold: R.prices[0] - 1, gold_v: 2 });
      s.env.setup_slots = { count: R.free, free: R.free, bought: 0, max, price: R.prices[0] };
      s.env.hunt_presets = setups(upTo(R.free));
      await at();
      p = await prep();
      if (!p.off || !p.why.endsWith('You need 1 gp more.')) fails.push('PN-11 a short purse reads ' + JSON.stringify(p));
      await page.click(ROW(0) + ' [data-hs-act="save-over"]');
      await page.waitForTimeout(500);
      p = await prep();
      if (!/^Saved over/.test(p.msg) || !p.why.endsWith('You need 1 gp more.')) fails.push('PN-11 an answer hid why Save is off: ' + JSON.stringify(p));
      /* A SETUP ALREADY SAVED past the count: every control stays, and the first free number is still under the count */
      s.env.state = Object.assign({}, s.env.state, { gold: 10000000, gold_v: 3 });
      s.env.hunt_presets = setups([0, max - 1]);
      await at();
      const kept = await page.evaluate((sel) => { const li = document.querySelector(sel); return li && { use: li.querySelector('.hw-use').disabled, over: li.querySelector('[data-hs-act="save-over"]').disabled }; }, ROW(max - 1));
      if (!kept || kept.use || kept.over) fails.push('PN-11 a setup past the count reads ' + JSON.stringify(kept));
      if (!(await page.isVisible(ROW(max - 1) + ' .hw-del'))) fails.push('PN-11 a setup past the count has no Delete');
      /* past the top: no button, and the window says the only way left */
      s.env.setup_slots = { count: max, free: R.free, bought: R.prices.length, max, price: null };
      s.env.hunt_presets = setups(upTo(max));
      await at();
      p = await prep();
      if (p.buy !== null || !p.save || p.why !== `This hero's ${max} setup slots are full. Delete one to save a new setup.`) fails.push('PN-11 at the top: ' + JSON.stringify(p));
      // PN-12
      delete s.env.setup_slots;
      s.env.hunt_presets = setups([0]);
      await at();
      p = await prep();
      if (!p.save || p.buy !== null || p.why !== 'Reading your setup slots…') fails.push('PN-12 with no setup_slots section the window reads ' + JSON.stringify(p));
      delete s.env.hunt_presets;
      await at();
      const none = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-prep"] .hw-presets-none.is-on')?.textContent || '');
      if (none !== 'Reading your saved setups…') fails.push('PN-12 with no hunt_presets section the none line reads ' + JSON.stringify(none));
    }
    if (errors.length) fails.push('PN-6 console errors: ' + errors.slice(0, 3).join(' | '));
  } catch (e) {
    /* a step that threw is HARNESS, never a rule (2026-10-22, tests/_mutant-verdict.mjs) */
    fails.push(harnessFail('a page step', e));
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  /* An optimistic rename: the window keeps the typed name and shows it over the server's (two plants, one file). */
  ['the new name shows before the server', 'src/shell/windows/hunt-prep.js', "      text(li.querySelector('.hs-name-t'), p.name);",
    "      text(li.querySelector('.hs-name-t'), (sc.typed && sc.typed[p.preset]) || p.name);",
    '  sc.naming = null;\n  repaint();\n  el.blur();', '  sc.naming = null;\n  sc.typed = { [preset]: name.trim() };\n  repaint();\n  el.blur();'],
  ['the setup stays pressable while a rename is in flight', 'src/shell/windows/hunt-prep.js', "for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', sc.pending);", "for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', false);"],
  ['Delete sends at the first press', 'src/shell/windows/hunt-prep.js', '    if (sc.arming !== setup.preset) { sc.arming = setup.preset; repaint(); return true; }\n', ''],
  ['Escape sends the rename', 'src/shell/inline-name.js', "ev.key === 'Escape' ? 'cancel'", "ev.key === 'Escape' ? 'commit'"],
  ['a refusal loses its reason', 'src/session/preset-intents.js', "error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused'", "error: 'refused'"],
  ['the plaque ignores the server\'s set name', 'src/shell/widgets/action-bar.js', "text(nm.querySelector('.hs-name-t'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '–');", "text(nm.querySelector('.hs-name-t'), s ? 'Set ' + (s.preset + 1) : '–');"],
  ['the setup in use offers Delete', 'src/shell/windows/hunt-prep.js', "cls(li, 'is-current', inUse);", "cls(li, 'is-current', false);"],
  ['Use and Save stay on in a hunt', 'src/shell/windows/hunt-prep.js', "prop(b, 'disabled', sc.pending || hunting);", "prop(b, 'disabled', sc.pending);",
    "prop(el, 'disabled', sc.pending || !presets || full || hunting);", "prop(el, 'disabled', sc.pending || !presets || full);"],
  ['a new setup takes a used number', 'src/shell/windows/hunt-prep.js', 'while (used.has(free) && free < MAX_PRESETS) free++;', 'free = used.size;'],
  ['a sixth setup can be saved', 'src/shell/windows/hunt-prep.js', 'const MAX_PRESETS = ACTION_SET_LIMITS.presets;', 'const MAX_PRESETS = 8;'],
  ['the count is the limit again', 'src/shell/windows/hunt-prep.js', 'const count = Math.min(slots ? slots.count : 0, MAX_PRESETS);', 'const count = MAX_PRESETS;'],
  ['with no server count every slot is free (PN-12)', 'src/shell/windows/hunt-prep.js', 'const count = Math.min(slots ? slots.count : 0, MAX_PRESETS);', 'const count = Math.min(slots ? slots.count : MAX_PRESETS, MAX_PRESETS);'],
  ['Buy sends a price of its own', 'src/shell/windows/hunt-prep.js', 'buySetupSlot(ctx.account, cs, q.price)', 'buySetupSlot(ctx.account, cs, 1)'],
  ['Buy stays on with a short purse', 'src/shell/windows/hunt-prep.js', "prop(buy, 'disabled', sc.pending || short > 0);", "prop(buy, 'disabled', sc.pending);"],
  ['Buy stays on while it is in flight', 'src/shell/windows/hunt-prep.js', "prop(buy, 'disabled', sc.pending || short > 0);", "prop(buy, 'disabled', short > 0);"],
  ['a setup past the count loses its controls', 'src/shell/windows/hunt-prep.js', "prop(b, 'disabled', sc.pending || hunting);", "prop(b, 'disabled', sc.pending || hunting || p.preset >= count0(cs));", "const SCRATCH = new WeakMap();", "const SCRATCH = new WeakMap();\nconst count0 = (cs) => { const q = setupSlotsOf(cs); return q ? q.count : 99; };"],
  ['the button hides past the free count', 'src/shell/windows/hunt-prep.js', "prop(buy, 'hidden', price === null);", "prop(buy, 'hidden', true);"],
  ['the window says the old full line', 'src/shell/windows/hunt-prep.js', ": full ? setupFullWords(count, price) + ", ": full ? 'All ' + MAX_PRESETS + ' setup slots are used.' + "],
  ['an answer hides why Save is off', 'src/shell/windows/hunt-prep.js', "const why = hunting || !presets ? ''", "const why = sc.msg || hunting || !presets ? ''"],
  ['a bar rename that times out throws (PN-10)', 'src/shell/widgets/action-bar.js', "    text(msg, r.ok ? '' : refusalWords(r.error));", "    text(msg, r.ok ? '' : r.error === 'timeout' ? barRefusalWords(r.error) : refusalWords(r.error));"],
  ['the plaque renames another set','src/shell/widgets/action-bar.js', 'renameActionSet(ctx.account, ctx.character, s.preset, name)', 'renameActionSet(ctx.account, ctx.character, s.preset + 1, name)'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'preset-names: ' + fails.length + ' rule(s) RED'
      : 'preset-names: rename is one intent shown from the server, Escape sends nothing, refusals in words, delete asks once, the bar\'s set renames; all survive a reload; the setup in use has no Delete, setups change in town, five at most');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, ...pairs] of MUTANTS) {
    let text = await readFile(join(ROOT, file), 'utf8');
    let missing = false;
    for (let i = 0; i < pairs.length; i += 2) { if (!text.includes(pairs[i])) missing = true; else text = text.replace(pairs[i], pairs[i + 1]); }
    if (missing) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text })), counts));
  }
  console.log(exitOf(counts) ? 'preset-names --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'preset-names --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}
main();
