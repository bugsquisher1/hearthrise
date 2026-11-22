#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/preset-names.mjs — RENAME AND DELETE A SAVED SETUP; NAME THE ACTION SET (ruling C4).
//
//   node tests/preset-names.mjs           the rules
//   node tests/preset-names.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/hunt-prep/setups.js src/shell/inline-name.js src/shell/widgets/action-bar.js src/session/preset-intents.js src/shell/setup-words.js
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
//         row goes only with the re-read ("No saved setups" after a reload)
//   PN-5  THE BAR'S SET: the plaque's name renames in place with ONE
//         hr_action_set_rename naming the set the server shows, and the new name
//         stays after a reload
//   PN-6  zero console errors
// THE ONE-SETUP MODEL (designer ruling 2026-10-22: a setup owns its bar; the hero is on one):
//   PN-7  THE SETUP IN USE: the row the server's hunt_settings.preset names reads
//         "In use" and offers no Delete; the others keep theirs
//   PN-8  GEAR CHANGES IN TOWN, THE BAR SWAPS MID-HUNT (Tyler 2026-11-17, "Bar only,
//         keep gear"): with a hunt open, Use equipped and New setup are off and the
//         window says why; Use is on for a setup of the worn weapon type (the server's
//         discipline for each) and sends ONE hr_hunt_preset_apply ("Bar swapped, gear
//         kept"), off on the setup in use, and off on a setup of another weapon type
//         whose line says "Town only: needs a bow or crossbow"; once the hunt has ended,
//         the setup in use after a bar-only swap reads "In use (bar only)" and Save
//         current setup sends ONE hr_hunt_preset_save on the first free number
//   PN-9  FIVE AT MOST: with ACTION_SET_LIMITS.presets setups, New setup is off, also when the server's
//         setup_slots counts past that limit (the window then says the limit's number)
//   PN-11 SAVING A SETUP IS FREE (redesign direction 9, 1049-setups-free.sql): a hero with no gold and three setups saves a fourth
//         with ONE hr_hunt_preset_save and nothing else; the column has no Buy control and names no price or purchase; a save the server
//         refuses past its limit says the server's number and nothing to buy; Use equipped asks once then saves over the picked setup;
//         with every number used Save is off and the window says "Delete one to save a new setup."
//   PN-12 NO COUNT, NO FREE SLOT (audit 11-09 F5, §6 fail safe): with no setup_slots section and one setup saved, Save current setup
//         is off, nothing is for sale and the window says "Loading setup slots…"; with no hunt_presets the none line says
//         "Loading setups…" (both are projected: never "switch on when the server starts keeping them")
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
const { ACTION_SET_LIMITS } = await import(pathToFileURL(join(ROOT, 'src/data/rule-subjects.js')).href);
const RPCS = ['hr_hunt_preset_rename', 'hr_hunt_preset_delete', 'hr_action_set_rename'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted() {
  const s = { env: clone(FIXTURE), version: 1, calls: [], delayMs: 400, refuse: null, hang: false };
  /* What each setup fights as is the server's (hr_hunt_presets_view: fights_as, discipline, wearing; 2027-05-04-setup-swap-mid-hunt.sql),
     and so is the worn set's (hunt_settings.discipline): the fixture's hero wears a sword alone. "Archery" fights with a bow. */
  s.env.hunt_settings = Object.assign({}, s.env.hunt_settings, { discipline: 'sword' });
  const p0 = Object.assign(clone(s.env.hunt_presets[0]), { fights_as: 'sword', discipline: 'sword', wearing: true });
  s.env.hunt_presets = [p0, Object.assign(clone(p0), { preset: 3, name: 'Mill run', wearing: false }),
    Object.assign(clone(p0), { preset: 4, name: 'Archery', gear: { weapon: 'practice_bow' }, fights_as: 'ranged', discipline: 'ranged', wearing: false })];
  s.next = () => Object.assign(clone(s.env), { version: ++s.version, client_state: {} });
  /* The server's answer to one of the three verbs: a refusal leaves the record as it was. */
  s.answer = (name, b) => {
    if (s.refuse) return { ok: false, error: s.refuse };
    if (name === 'hr_hunt_preset_rename') s.env.hunt_presets.find((p) => p.preset === b.p_preset).name = b.p_name;
    if (name === 'hr_hunt_preset_delete') s.env.hunt_presets = s.env.hunt_presets.filter((p) => p.preset !== b.p_preset);
    if (name === 'hr_action_set_rename') s.env.hunt_settings.presets.find((p) => p.preset === b.p_preset).name = b.p_name;
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
    if (!use7[0] || !use7[0].cur || !/^In use, /.test(use7[0].small) || use7[1].cur || /In use/.test(use7[1].small)) fails.push('PN-7 the setup in use is not marked: ' + JSON.stringify(use7));
    await page.click(ROW(3) + ' small');
    await page.waitForTimeout(120);
    if (await page.isVisible(ROW(0) + ' .hw-del') || !(await page.isVisible(ROW(3) + ' .hw-del'))) fails.push('PN-7 Delete is offered on the setup in use (or not on the picked other)');
    await page.click(ROW(0) + ' small');
    await page.waitForTimeout(120);
    if (await page.isVisible(ROW(0) + ' .hw-del') || await page.isVisible(ROW(3) + ' .hw-del')) fails.push('PN-7 Delete shows on the setup in use once it is picked, or stays on a row not picked');
    // PN-8 (the fixture's hunt is open): Use swaps the bar to a setup of the worn weapon type only; New and Use equipped stay off
    const off8 = await page.evaluate((rows) => {
      const row = (sel) => { const li = document.querySelector(sel); return li && { use: li.querySelector('.hw-use').disabled, small: li.querySelector('small').textContent }; };
      return { rows: rows.map(row), over: document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="use-equipped"]').disabled, fresh: document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="new"]').disabled,
        add: document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]').disabled,
        why: !!document.querySelector('[data-hs-win="hunt-prep"] .hw-town-only.is-on') };
    }, [ROW(0), ROW(3), ROW(4)]);
    const [on0, same3, bow4] = off8.rows;
    if (!off8.over || !off8.add || !off8.fresh || !off8.why) fails.push('PN-8 with a hunt open New and Use equipped read ' + JSON.stringify(off8));
    if (!on0 || !on0.use || !/^In use, /.test(on0.small)) fails.push('PN-8 the setup in use offers Use in a hunt: ' + JSON.stringify(on0));
    if (!same3 || same3.use || /Town only/.test(same3.small)) fails.push('PN-8 a setup of the worn weapon type cannot swap in a hunt: ' + JSON.stringify(same3));
    if (!bow4 || !bow4.use || !/, Town only: needs a bow or crossbow$/.test(bow4.small)) fails.push('PN-8 a setup of another weapon type reads ' + JSON.stringify(bow4));
    await page.click(ROW(3) + ' .hw-use');
    await page.waitForTimeout(600);
    const ap8 = sent(s, 'hr_hunt_preset_apply');
    if (ap8.length !== 1 || ap8[0].body.p_slot !== 0 || ap8[0].body.p_preset !== 3 || !ap8[0].body.p_idem) fails.push('PN-8 Use in a hunt sent ' + JSON.stringify(ap8.map((c) => c.body)));
    if (await msgOf(page) !== 'Bar swapped, gear kept') fails.push('PN-8 a mid-hunt Use reads "' + await msgOf(page) + '"');
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
    // PN-4 (Delete sits on the picked row)
    await page.click(ROW(3) + ' small');
    await page.waitForTimeout(120);
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
    if (!/^No answer from the server/.test(late.msg) || late.name !== 'Tank bar' || late.off || errors.length > thrown)
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
    /* PN-11 none saved names the bar's set, so the plaque's name and this line agree (first-30 play 2026-11-12) */
    const noneLine = await page.evaluate(() => ({ line: document.querySelector('.hw-presets-none.is-on')?.textContent || '', bar: document.querySelector('.hb-set .hs-name-t')?.textContent || '' }));
    if (!noneLine.bar || noneLine.line !== 'Not saved: ' + noneLine.bar) fails.push('PN-11 none saved reads ' + JSON.stringify(noneLine));
    // PN-8 back in town: the hunt has ended; setups 0 and 2 exist, so the next is number 1.
    s.env.hunt.ended = true;
    /* the setup in use after a mid-hunt swap: another setup's gear is still on (the server's wearing false) */
    s.env.hunt_presets = [Object.assign(clone(FIXTURE.hunt_presets[0]), { wearing: false }), Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: 2, name: 'Mill run' })];
    await reload(page);
    await openPrep(page);
    await page.waitForTimeout(300);
    if (await page.isVisible('[data-hs-win="hunt-prep"] .hw-town-only')) fails.push('PN-8 in town the window still says setups change in town');
    const town8 = await page.evaluate((sel) => document.querySelector(sel + ' small').textContent, ROW(0));
    if (!/^In use \(bar only\), /.test(town8)) fails.push('PN-8 the setup in use after a bar-only swap reads "' + town8 + '"');
    await page.click('[data-hs-win="hunt-prep"] [data-hs-act="new"]');
    await page.waitForTimeout(120);
    await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Thicket solo');
    await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
    await page.waitForTimeout(600);
    const sv = sent(s, 'hr_hunt_preset_save');
    if (sv.length !== 1 || sv[0].body.p_slot !== 0 || sv[0].body.p_preset !== 1 || sv[0].body.p_name !== 'Thicket solo') fails.push('PN-8 New setup sent ' + JSON.stringify(sv.map((c) => c.body)));
    // PN-9
    s.env.hunt_presets = [0, 1, 2, 3, 4].map((n) => Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: n, name: 'Setup ' + (n + 1) }));
    await reload(page);
    await openPrep(page);
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.querySelector('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]').disabled))) fails.push('PN-9 a sixth setup can be saved');
    /* The data's limit holds even where the server's count says more (the fixture's count is the limit, so only this reaches it). */
    {
      const lim = ACTION_SET_LIMITS.presets, was = s.env.setup_slots;
      s.env.setup_slots = { count: lim + 1, max: lim + 1 };
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
      const max = ACTION_SET_LIMITS.presets;
      const setups = (nums) => nums.map((n) => Object.assign(clone(FIXTURE.hunt_presets[0]), { preset: n, name: 'Setup ' + (n + 1) }));
      const upTo = (n) => Array.from({ length: n }, (_, i) => i);
      const prep = () => page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-prep"]');
        return { save: w.querySelector('[data-hs-act="save-new"]').disabled, buy: !!w.querySelector('[data-hs-act="buy-slot"]'), why: w.querySelector('.hw-slot-why').hidden ? '' : w.querySelector('.hw-slot-why').textContent, msg: w.querySelector('.hh-intent-msg').textContent,
          /* the setups column only (its rows, New / Use equipped / the count, its notes): the builder beside it prices supplies */
          text: ['.hpb-sets', '.hpb-leftrow', '.hw-town-only', '.hw-slot-why'].map((sel) => (w.querySelector(sel) || {}).textContent || '').join(' ') }; });
      const at = async () => { await reload(page); await openPrep(page); await page.waitForTimeout(300); };
      /* SAVING IS FREE: a hero with no gold and three setups saves a fourth and a fifth, and no gold is ever named. */
      s.env.state = Object.assign({}, s.env.state, { gold: 0, gold_v: 1 });
      s.env.setup_slots = { count: max, max };
      s.env.hunt_presets = setups(upTo(3));
      await at();
      let p = await prep();
      if (p.save) fails.push('PN-11 with no gold and a free number, Save is off');
      if (p.buy) fails.push('PN-11 the window still has a Buy control');
      if (p.why) fails.push('PN-11 the window says ' + JSON.stringify(p.why));
      if (/\d gp\b|\bbuy\b/i.test(p.text)) fails.push('PN-11 the setups column names a price or a purchase: ' + JSON.stringify(p.text.match(/.{0,40}(\d gp|\bbuy\b).{0,20}/i)[0]));
      const savesBefore = sent(s, 'hr_hunt_preset_save').length;
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="new"]');
      await page.waitForTimeout(120);
      await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Fourth');
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
      await page.waitForTimeout(500);
      const sv11 = sent(s, 'hr_hunt_preset_save').slice(savesBefore);
      if (sv11.length !== 1 || sv11[0].body.p_preset !== 3) fails.push('PN-11 the fourth setup sent ' + JSON.stringify(sv11.map((c) => c.body)));
      if (s.calls.some((c) => /slot_buy/.test(c.name))) fails.push('PN-11 a slot purchase was sent');
      /* a save the server refuses past its limit: the refusal's own number, and nothing to buy */
      s.refuseSave = { ok: false, error: 'setup_locked', slots: max };
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="new"]');
      await page.waitForTimeout(120);
      await page.fill('[data-hs-win="hunt-prep"] .hw-preset-name', 'Refused');
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="save-new"]');
      await page.waitForTimeout(500);
      p = await prep();
      if (p.msg !== `This hero's ${max} setup slots are full. Delete one to save a new setup.`) fails.push('PN-11 a refused save says ' + JSON.stringify(p.msg));
      s.refuseSave = null;
      /* Use equipped asks once (nothing sent), then ONE hr_hunt_preset_save over the picked setup (the one in use, 0) */
      const overBefore = sent(s, 'hr_hunt_preset_save').length;
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="use-equipped"]');
      await page.waitForTimeout(120);
      if (sent(s, 'hr_hunt_preset_save').length !== overBefore) fails.push('PN-11 Use equipped sent at the first press');
      await page.click('[data-hs-win="hunt-prep"] [data-hs-act="use-equipped"]');
      await page.waitForTimeout(500);
      const over = sent(s, 'hr_hunt_preset_save').slice(overBefore);
      if (over.length !== 1 || over[0].body.p_preset !== 0) fails.push('PN-11 Use equipped sent ' + JSON.stringify(over.map((c) => c.body)));
      /* every number used: Save is off and the window says the only way left, with no price */
      s.env.hunt_presets = setups(upTo(max));
      await at();
      p = await prep();
      if (p.buy || !p.save || p.why !== `This hero's ${max} setup slots are full. Delete one to save a new setup.`) fails.push('PN-11 at the limit: ' + JSON.stringify({ save: p.save, buy: p.buy, why: p.why }));
      // PN-12
      delete s.env.setup_slots;
      s.env.hunt_presets = setups([0]);
      await at();
      p = await prep();
      if (!p.save || p.buy || p.why !== 'Loading setup slots…') fails.push('PN-12 with no setup_slots section the window reads ' + JSON.stringify({ save: p.save, buy: p.buy, why: p.why }));
      delete s.env.hunt_presets;
      await at();
      const none = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-prep"] .hw-presets-none.is-on')?.textContent || '');
      if (none !== 'Loading setups…') fails.push('PN-12 with no hunt_presets section the none line reads ' + JSON.stringify(none));
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
  ['the new name shows before the server', 'src/shell/windows/hunt-prep/setups.js', "      text(li.querySelector('.hs-name-t'), p.name);",
    "      text(li.querySelector('.hs-name-t'), (sc.typed && sc.typed[p.preset]) || p.name);",
    '  sc.naming = null;\n  repaint();\n  el.blur();', '  sc.naming = null;\n  sc.typed = { [preset]: name.trim() };\n  repaint();\n  el.blur();'],
  ['the setup stays pressable while a rename is in flight', 'src/shell/windows/hunt-prep/setups.js', "for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', sc.pending);", "for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', false);"],
  ['Delete sends at the first press', 'src/shell/windows/hunt-prep/setups.js', '    if (sc.arming !== setup.preset) { sc.arming = setup.preset; repaint(); return true; }\n', ''],
  ['Escape sends the rename', 'src/shell/inline-name.js', "ev.key === 'Escape' ? 'cancel'", "ev.key === 'Escape' ? 'commit'"],
  ['a refusal loses its reason', 'src/session/preset-intents.js', "error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused'", "error: 'refused'"],
  ['the plaque ignores the server\'s set name', 'src/shell/widgets/action-bar.js', "text(nm.querySelector('.hs-name-t'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '–');", "text(nm.querySelector('.hs-name-t'), s ? 'Set ' + (s.preset + 1) : '–');"],
  ['the setup in use offers Delete', 'src/shell/windows/hunt-prep/setups.js', "cls(li, 'is-current', current);", "cls(li, 'is-current', false);"],
  ['Use and Save stay on in a hunt', 'src/shell/windows/hunt-prep/setups.js', "prop(li.querySelector('.hw-use'), 'disabled', sc.pending || (hunting && !swap.ok));", "prop(li.querySelector('.hw-use'), 'disabled', sc.pending);",
    'const noNew = sc.pending || !presets || full || hunting;', 'const noNew = sc.pending || !presets || full;', "prop(from, 'disabled', sc.pending || hunting || !pickedRow);", "prop(from, 'disabled', sc.pending || !pickedRow);"],
  ['a new setup takes a used number', 'src/shell/windows/hunt-prep/setups.js', 'while (used.has(free) && free < MAX_PRESETS) free++;', 'free = used.size;'],
  ['a sixth setup can be saved', 'src/shell/windows/hunt-prep/setups.js', 'const MAX_PRESETS = ACTION_SET_LIMITS.presets;', 'const MAX_PRESETS = 8;'],
  ['the count is the limit again', 'src/shell/windows/hunt-prep/setups.js', 'const count = Math.min(slots ? slots.count : 0, MAX_PRESETS);', 'const count = MAX_PRESETS;'],
  ['with no server count every slot is free (PN-12)', 'src/shell/windows/hunt-prep/setups.js', 'const count = Math.min(slots ? slots.count : 0, MAX_PRESETS);', 'const count = Math.min(slots ? slots.count : MAX_PRESETS, MAX_PRESETS);'],
  /* SAVING IS FREE (1049-setups-free.sql): the full line offers a purchase again, and a free number stays shut (PN-11). */
  ['the full line offers a slot for sale', 'src/shell/setup-words.js', "return held + ' Delete one to save a new setup.';", "return held + ' Delete one, or buy a sixth for 15,000 gp.';"],
  ['a free number stays shut with no gold', 'src/shell/windows/hunt-prep/setups.js', 'const full = presets && firstFree(presets) >= count;', 'const full = presets && firstFree(presets) >= 3;'],
  /* SETUPS SWAP MID-HUNT, BAR ONLY (Tyler 2026-11-17): the old town-only rule back, and a setup of another weapon type let through */
  ['Use stays off for every setup in a hunt', 'src/shell/windows/hunt-prep/setups.js', "  if (p.discipline === set.discipline) return { ok: true, why: '' };", "  if (false) return { ok: true, why: '' };"],
  ['a setup of another weapon type swaps in a hunt', 'src/shell/windows/hunt-prep/setups.js', "  if (p.discipline === set.discipline) return { ok: true, why: '' };", "  if (p.discipline) return { ok: true, why: '' };"],
  ['a setup past the count loses its controls', 'src/shell/windows/hunt-prep/setups.js', "prop(li.querySelector('.hw-use'), 'disabled', sc.pending || (hunting && !swap.ok));", "prop(li.querySelector('.hw-use'), 'disabled', sc.pending || (hunting && !swap.ok) || p.preset >= count0(cs));", 'const MAX_PRESETS = ACTION_SET_LIMITS.presets;', 'const MAX_PRESETS = ACTION_SET_LIMITS.presets;\nconst count0 = (cs) => { const q = setupSlotsOf(cs); return q ? q.count : 99; };'],
  ['the window says the old full line', 'src/shell/windows/hunt-prep/setups.js', ": full ? setupFullWords(count) : ''", ": full ? 'All ' + MAX_PRESETS + ' setup slots are used.' : ''"],
  ['an answer hides why Save is off', 'src/shell/windows/hunt-prep/setups.js', "const why = hunting || !presets ? ''", "const why = sc.msg || hunting || !presets ? ''"],
  ['a bar rename that times out throws (PN-10)', 'src/shell/widgets/action-bar.js', "    text(msg, r.ok ? '' : refusalWords(r.error));", "    text(msg, r.ok ? '' : r.error === 'timeout' ? barRefusalWords(r.error) : refusalWords(r.error));"],
  ['the plaque renames another set','src/shell/widgets/action-bar.js', 'renameActionSet(ctx.account, ctx.character, s.preset, name)', 'renameActionSet(ctx.account, ctx.character, s.preset + 1, name)'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'preset-names: ' + fails.length + ' rule(s) RED'
      : 'preset-names: rename is one intent shown from the server, Escape sends nothing, refusals in words, delete asks once, the bar\'s set renames; all survive a reload; the setup in use has no Delete, gear changes in town and the bar swaps mid-hunt to the worn weapon type only, five at most');
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
