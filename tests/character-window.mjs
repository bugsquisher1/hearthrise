#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/character-window.mjs — THE CHARACTER WINDOW'S RULES, IN A REAL CHROMIUM.
//
//   node tests/character-window.mjs                the rules
//   node tests/character-window.mjs --mutate       every planted defect must turn a rule RED
//   node tests/character-window.mjs --shots <dir>  also write the visual-gate screenshots
//                                                  (1440x900 and 922x423)
//
// mutant-anchors: src/shell/widgets/vitals-hub.js src/shell/windows/character/sheet.js src/shell/windows/character/index.js src/shell/windows/character/outfit.js src/shell/windows/character/outfit-looks.js src/shell/windows/character/titles.js src/session/character-sections.js src/shell/windows/skills.js src/styles/character.css src/data/item-uses.js src/data/skill-unlocks.js supabase/functions/hr-accrue/character-sheet.js src/core/progression.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the three sections
// 2026-10-25-character-sheet.sql projects (built here, below).
//   CW-D2 src/data/outfits.js validate() is clean (the server rows are GENERATED
//         from it and the --dye-N tokens: tools/gen-outfits.mjs --check)
//   CW-1  C opens the Character window from the key and the launcher, with zero
//         console errors; its four tabs are Character, Outfit, Titles and Deaths (Faction shows only with the server's `factions` section: tests/faction-window.mjs)
//   CW-2  STATS ONLY FROM THE SERVER: the combat lines show exactly the
//         section's numbers, and a new envelope replaces them on the same nodes
//   CW-3  NOTHING THAT DOES NOT EXIST: each opening asks the engine ONCE and
//         shows no combat number before that ask answers; a stale sheet hides
//         every combat line (no zero, no dash) and is asked for ONCE per
//         version; an absent number has no line; no leech, protection,
//         proficiency or mounts line is ever drawn
//   CW-4  OUTFIT SAVE IS ONE INTENT: trying on an owned outfit and pressing Save
//         sends exactly ONE hr_outfit_set naming it, the worn mark stays on the
//         server's outfit until the re-read; a premium outfit not owned can be
//         tried on and never saved; CW-4c a bundle outfit (the Key Warden) has no
//         card until the server's owned list names it
//   CW-5  THE DEATH LOG is the server's rows: who killed the hero, where, the XP
//   CW-7  the sheet lays out from the window's own width: every vital row whole, none over the identity
//   CW-8  THE TAB MATCHES THE HUD (r09: Level 4 on the tab, 11 on the HUD): the
//         Character tab's Level, max health and max mana equal the vitals hub's,
//         in a hunt, after a pushed frame that restates only `state`, and in town
//   CW-9  THE TITLES TAB (Tyler 2026-11-04, 2027-02-28-titles.sql; every number from the data's rows): a locked row reads "Wolves: 3,214 of 5,000, then 3,000 gp" with
//         nothing to press; an earned one's "Claim for 3,000 gp" sends ONE hr_title_buy with the QUOTE and no count; Equip and Unequip are ONE
//         hr_title_wear; each changes only from the re-read; a short purse is off and says how much more; a refusal says the server's numbers;
//         the sheet's header shows (no title row says party-only: a lone hero walks the King's hall too, 2026-11-08)
//   CW-6  THE SKILLS: Gathering and crafting lists no combat skill; the combat
//         ledger is the Character window's; an unlock line's tooltip names each
//         thing and its kind ("Bronze Axe (woodcutting tool)")
//   CW-11 THE FACTION LOOKS (the designer 2026-11-18; the six staged looks listed here on borrowed sheets, the test's alone): ONE card an
//         outfit, never an add-on's; with the factions off no locked faction card; on, both sides' outfits show locked, captioned with
//         the SECTION's own number ("Requires First Flame standing: 37 h", not the data's 25); owned, the card's add-on picker offers
//         None and the owned add-on, greys the unowned one with its requirement, and Equip sends ONE hr_outfit_set naming the picked
//         add-on's look; off again, the owned outfit stays and the locked ones go. THE SECOND HERO SET: the two worn faction looks are
//         in `factionwear` (heroes is full), a worn set fetched only for a sprite drawn from it: the Outfit tab's card and preview draw
//         them, the portrait's recolour and the World's dye both reach their masks (factionwear-masks); the dye picker presses no swatch
//         while a faction look wears its side's own colors at the creation defaults, the tried-on one after a press, none again after Undo
//         (blind faction QA 2026-11-19 #5)
//   CW-10 THE SHEET READS AS A CHARACTER SHEET (UI audit 2026-11-18 #8), at 1440x900
//         and 922x423: the portrait is the 42x45 FIGURE at a whole 2x or more; every
//         combat skill's bar is 40% of its entry or more and its unlock one line; no
//         stat value wraps; nothing is cut at 1440x900; the Outfit wardrobe stands
//         every figure at one whole scale, three or more to a row; and the FIGURE
//         holds every outfit's idle art in every facing, in every hero set (heroes, factionwear)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';
import { barWindows } from './_bar.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* Level totals on the shipped curve (src/core/xp.js), never typed: the curve is data (lane/b-level-curve). */
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
const { TITLES } = await import(pathToFileURL(join(ROOT, 'src/data/titles.js')).href);
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* The three sections, as hr_character_sheet_view / hr_outfit_view / hr_death_log_view answer them. */
const COMBAT = { role: 'melee_dps', weapon_type: 'sword', max_mana: 60, move_speed: 3200, damage: { min: 1, max: 17 },
  accuracy_pct: 74.5, crit_pct: 4.5, defence: 23, dodge_pct: 12.5, absorb_pct: 31, ward: 4, regen_pct: 101.9, set: null, xp: { perks: 0.02, buffs: 0, combat: 0 } };
function withSections(env, o = {}) {
  /* The Level is read off state.level_xp on the shared curve (Level 21's total, CORE_MODEL.md §2). */
  env.state = Object.assign({}, env.state, { level_xp: charXpForLevel(21) });
  env.character_sheet = { level: 21, max_hp: 24, bestiary: { slain: 7, total: 119 }, fresh: o.fresh !== false,
    combat: o.fresh === false ? null : Object.assign(clone(COMBAT), o.combat || {}), computed_at: '2026-10-18T10:00:00Z' };
  if (o.dropMana && env.character_sheet.combat) delete env.character_sheet.combat.max_mana;
  if (o.dropMana && env.hunt && env.hunt.hero) delete env.hunt.hero.mana_max;
  env.outfit = { worn: 'berserker', base: { head: 13, body: 5, legs: 3, feet: 0 }, owned: ['knight', 'berserker', 'ranger', 'sorcerer', 'druid'] };
  env.death_log = [{ id: 901, at: '2026-10-18T09:30:00Z', hunt: 'mill_cellar', monster: 'rat_king', xp: 140, xp_lost: { level: 90, melee: 50 } },
    { id: 877, at: '2026-10-17T20:00:00Z', hunt: 'mill_cellar', monster: 'rat', xp: 0, xp_lost: null }];
  return env;
}

function scripted(o) {
  const s = { env: withSections(clone(FIXTURE), o), version: 1, calls: [], residue: {}, sheetFresh: o && o.fresh === false ? false : true };
  /* The server states the Level itself (hr_state_of's `level` block): the stub states it for the XP a case set (./_server-level.mjs). */
  s.next = () => withServerLevel(Object.assign(clone(s.env), { version: ++s.version, client_state: clone(s.residue) }));
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(withServerLevel(b)) });
    /* A read restates the record at the server's version (a sheet put moves no version). */
    if (name === 'hr_load') return json(Object.assign(clone(s.env), { version: s.version, client_state: clone(s.residue) }));
    if (name === 'hr-accrue') {
      /* The sheet verb answers at the SAME version (the put moves no version) and, here, still stale. */
      if (body.verb === 'sheet') { await new Promise((ok) => setTimeout(ok, s.sheetDelay || 200)); return json(Object.assign(clone(s.env), { version: s.version, verb: 'sheet', client_state: clone(s.residue) })); }
      /* A plain ask under the settle floor writes nothing and restates the version (hunt-settle.js
         below_min_span): the open hunt's live ask re-asks with back-off until a start point comes. */
      if (!body.verb) return json(Object.assign(clone(s.env), { ok: true, settled: false, reason: 'below_min_span', version: s.version, client_state: clone(s.residue) }));
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (name === 'hr_outfit_set') { await new Promise((ok) => setTimeout(ok, 300)); return json({ ok: true }); }
    if (name === 'hr_hero_colors_view') return json({ ok: true, price: 1550 });
    if (name === 'hr_title_buy' || name === 'hr_title_wear') { await new Promise((ok) => setTimeout(ok, 300)); return json(s.titleAnswer ? s.titleAnswer(name, body) : { ok: true }); }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function openWin(page, key, id) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  }
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 3000);
}

/* The visible number lines of the Character tab: { label: value }. */
const lines = (page) => page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-hs-win="character"] .hw-cs-line')) {
    if (getComputedStyle(el).display === 'none') continue;
    out[el.querySelector('dt').textContent] = el.querySelector('dd').textContent;
  }
  return out;
});
/* A new full envelope, the way the live game gets one: a pushed frame carrying the whole character at the next
   version (2026-12-25-frame-push-revive.sql), applied like a load. */
async function push(page, s) {
  const e = s.next();
  await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: env.version, env }), [UID, e]);
  await page.waitForTimeout(500);
}
/* Until this opening's ask has answered and the damage line is drawn (or 5 s). */
const waitCombat = (page) => wait(page, () => { const e = document.querySelector('[data-hs-win="character"] [data-combat="damage"]'); return !!e && e.classList.contains('is-on'); }, null, 5000);
const sheetAsks = (s) => s.calls.filter((c) => c.name === 'hr-accrue' && c.body.verb === 'sheet');

async function pure() {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { validate } = await imp('src/data/outfits.js');
  for (const p of validate()) fails.push('CW-D2 ' + p);
  return fails;
}

/* CW-11's STAND-INS: the staged add-on looks listed on borrowed sheets (this test's alone, never shipped; the two base looks are the real
   rows on their `factionwear` sheets), on top of any mutant's text. */
const LOOK_SHEETS = Object.freeze({ flamebearer_shield: 'outfit_berserker', flamebearer_light: 'outfit_ranger',
  emberkeeper_lantern: 'outfit_witch', emberkeeper_coal: 'outfit_brute' });
/* the files CW-11 reads: a mutant elsewhere is judged by the other rules, so CW-11 runs only on the clean tree and on these */
const LOOK_FILES = Object.freeze(['src/render/outfit-sprite.js', 'src/world/hero-dye.js', 'src/data/world/atlas-sets.js', 'src/shell/windows/character/outfit.js', 'src/shell/windows/character/outfit-looks.js', 'src/shell/windows/character/index.js',
  'src/data/outfits.js', 'src/data/hunt-outfits.js', 'src/data/text/factions.js', 'src/session/faction-sections.js', 'src/session/character-sections.js', 'src/shell/faction-words.js']);
async function lookPlants(overrides) {
  const src = async (f) => (overrides && overrides[f]) || readFile(join(ROOT, f), 'utf8');
  const plant = (text, find, repl, f) => { if (!find.test(text)) throw new Error('CW-11 HARNESS: the stand-in anchor is not in ' + f); return text.replace(find, repl); };
  const { STAGED_OUTFITS } = await import(pathToFileURL(join(ROOT, 'src/data/outfits.js')).href);
  const rows = Object.entries(STAGED_OUTFITS).map(([id, pieces]) => "  " + id + ": row('" + (pieces.length === 1 ? id[0].toUpperCase() + id.slice(1) : id) + "', false, {}, 'Stand-in art', null, "
    + JSON.stringify(pieces).replace(/"/g, "'") + '),\n').join('');
  let outfits = await src('src/data/outfits.js');
  outfits = plant(outfits, /(  sweeps_coat: row\('Key Warden'[^\n]*\n)/, '$1' + rows, 'src/data/outfits.js');
  outfits = plant(outfits, /export const STAGED_OUTFITS = Object\.freeze\(\{[\s\S]*?\n\}\);/, 'export const STAGED_OUTFITS = Object.freeze({});', 'src/data/outfits.js');
  let sheets = await src('src/data/hunt-outfits.js');
  sheets = plant(sheets, /(  sweeps_coat: 'outfit_sweeps_coat',\n)/, '$1' + Object.entries(LOOK_SHEETS).map(([k, v]) => "  " + k + ": '" + v + "',\n").join(''), 'src/data/hunt-outfits.js');
  return Object.assign({}, overrides || {}, { 'src/data/outfits.js': outfits, 'src/data/hunt-outfits.js': sheets });
}
/* The `factions` section as hr_faction_section answers it: every need a number NO data row has, so a label that reads the data, or a
   literal, is caught. */
const H_MS = 3600000;
const LOOK_NEEDS = Object.freeze({ flamebearer: 37, flamebearer_shield: 101, flamebearer_light: 301, emberkeeper: 38, emberkeeper_lantern: 102, emberkeeper_coal: 302 });
const factionsSection = () => ({ faction: 'first_flame', can_join: false, joined_at: '2026-11-10T10:00:00Z', swap: null, swap_ready_at: '2026-11-17T10:00:00Z',
  standing: { first_flame: 30 * H_MS, last_ember: 0 }, today_ms: 0, day_cap_ms: 86400000, swap_need_ms: 36000000, cooldown_ms: 604800000,
  pieces: Object.entries(LOOK_NEEDS).map(([id, h]) => ({ id, faction: id.startsWith('flame') ? 'first_flame' : 'last_ember', need_ms: h * H_MS, held: false })) });

async function checks(overrides, shots) {
  const fails = overrides ? [] : await pure();
  const { server, port } = await serve(overrides || {});
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted(o.sections);
    await stub(page, s);
    const up = await signInAndPlay(page, o.base || base);
    return { ctx, page, errors, s, up };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  try {
    { // CW-1 CW-2 CW-4 CW-5 CW-6
      const { ctx, page, errors, s, up } = await open();
      if (!up) fails.push('CW-1 the shell did not mount');
      else {
        /* every window the top bar reaches, its groups' menus too (tests/_bar.mjs) */
        const launchers = await barWindows(page);
        if (!launchers.includes('character') || launchers.includes('skills-combat')) fails.push('CW-1 the top bar reaches ' + launchers.join(','));
        if (!(await openWin(page, 'c', 'character'))) fails.push('CW-1 the C key did not open the Character window');
        await waitCombat(page);
        const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-tab[data-tab]')).filter((b) => !b.hidden && b.getClientRects().length).map((b) => b.textContent));
        if (tabs.join('|') !== 'Character|Outfit|Titles|Deaths') fails.push('CW-1 the tabs are ' + tabs.join('|'));
        /* CW-2: exactly the section's numbers. */
        const L = await lines(page);
        const want = { Damage: '1–17', 'Hit chance': '74.5%', 'Critical chance': '4.5%', Defense: '23', Dodge: '12.5%', Absorb: '31%', Ward: '4', 'Max mana': '60', 'Max health': '220',
          Regeneration: '+1.9%', Speed: '3.2 tiles/s', 'Home and renown': '+2%', Total: '+2%' };
        for (const [k, v] of Object.entries(want)) if (L[k] !== v) fails.push('CW-2 ' + k + ' reads ' + JSON.stringify(L[k]) + ', the server sent ' + v);
        if ('Prayer ward' in L || 'Gear' in L || 'Food and drink' in L) fails.push('CW-3 a zero line is drawn: ' + JSON.stringify(L));
        const level = await page.evaluate(() => document.querySelector('[data-hs-win="character"] .hw-cs-lv').textContent);
        if (level !== 'Level 21') fails.push('CW-2 the level reads ' + JSON.stringify(level));
        const words = await page.evaluate(() => document.querySelector('[data-hs-win="character"]').textContent);
        for (const w of ['Leech', 'Protection', 'Proficiency', 'Mount']) if (words.includes(w)) fails.push('CW-3 the window draws a "' + w + '" line the engine does not have');
        if (!/7 of 119 creatures slain/.test(words)) fails.push('CW-2 the bestiary line is missing');
        const combatSkills = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-skill-name')).map((b) => b.textContent));
        if (!combatSkills.includes('Melee') || combatSkills.includes('Attack') || combatSkills.includes('Mining')) fails.push('CW-6 the Character window\'s skills are ' + combatSkills.join(','));
        /* CW-6b (Tyler 10-19: "Oak Wand (staff)"): a wand reads (wand), a staff (staff), a spellbook (spellbook). Gear is
           worn by the hero's LEVEL since 2026-10-24, so the Magic line names its runes (a supply keeps its skill) and the
           weapons are read off the Level unlocks the coach names ("What next": src/data/hunt-tutorial.js), each role's own. */
        /* CW-6c Inner Flame's line says what it gives now, the Regeneration line's own number (lane/b-first-hour) */
        const flameNext = await page.evaluate(() => { const li = Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-skill')).find((x) => /^\s*Inner Flame/.test(x.textContent)); return li ? li.querySelector('.hw-skill-next').textContent : ''; });
        if (!flameNext.startsWith('Recovery +1.9%')) fails.push('CW-6c the Inner Flame line does not say its recovery: ' + JSON.stringify(flameNext));
        /* the unlock line names one thing; every one, with its kind, is its tooltip (CW-10) */
        const magic = await page.evaluate(() => { const li = Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-skill')).find((x) => /^\s*Magic/.test(x.textContent)); return li ? li.querySelector('.hw-skill-next').getAttribute('title') || '' : ''; });
        if (!/\(rune for staves\)/.test(magic) || /\((wand|staff|spellbook)\)/.test(magic)) fails.push('CW-6 the Magic line does not name its runes alone: ' + JSON.stringify(magic));
        const kinds = await page.evaluate(async () => {
          const t = await import('/src/data/hunt-tutorial.js');
          const u = await import('/src/data/skill-unlocks.js');
          return ['mage', 'healer'].map((r) => u.nextUnlock('level', 14, (id) => t.wornByRole(id, r))).join(' | ');
        });
        if (!/Oak Wand \(wand\)/.test(kinds) || !/Oak Staff \(staff\)/.test(kinds) || !/Spellbook \(spellbook\)/.test(kinds)) fails.push('CW-6 the magic unlock words are wrong: ' + JSON.stringify(kinds));
        if (sheetAsks(s).length !== 1) fails.push('CW-3 one opening asked the engine ' + sheetAsks(s).length + ' time(s), not once');
        if (shots) await shot(page, 'character-1440x900-sheet');
        /* CW-2b: a new envelope replaces the numbers on the same node. */
        await page.evaluate(() => { window.__dmg = document.querySelector('[data-hs-win="character"] [data-combat="damage"] dd'); });
        s.env.character_sheet.combat.damage.max = 31;
        await push(page, s);
        /* The re-read and the repaint can land after push's fixed 500 ms on a loaded box: wait for the number (4 s). */
        await wait(page, () => { const d = document.querySelector('[data-hs-win="character"] [data-combat="damage"] dd'); return !!d && d.textContent === '1–31'; }, null, 4000);
        const same = await page.evaluate(() => { const d = document.querySelector('[data-hs-win="character"] [data-combat="damage"] dd'); return { same: d === window.__dmg, t: d.textContent }; });
        if (same.t !== '1–31' || !same.same) fails.push('CW-2 after a new envelope the damage reads ' + same.t + (same.same ? '' : ' on a rebuilt node'));
        /* CW-2c THE BONUS THE SERVER PAYS IS ON THE SHEET (retention dive 2026-11-20: "None right now" under a "+25% Level XP" plate): the
           server's live XP event is its own line, out of the Total, and goes with the next envelope that drops it. */
        s.env.live_events = [{ id: 'bonus_weekend', type: 'xp_bonus', dial: 'xpPm', pm: 1250, scope: ['world'], starts: '2020-01-01T00:00:00Z', ends: '2099-01-01T00:00:00Z', live: true }];
        await push(page, s);
        await wait(page, () => { const e = document.querySelector('[data-hs-win="character"] [data-xp="event"]'); return !!e && getComputedStyle(e).display !== 'none'; }, null, 4000);
        const evOn = await lines(page), noneOn = await page.evaluate(() => getComputedStyle(document.querySelector('[data-hs-win="character"] .hw-cs-xnone')).display !== 'none');
        if (evOn['Bonus XP weekend'] !== '+25% Level XP' || evOn.Total !== '+2%' || noneOn) fails.push('CW-2c with the Bonus XP weekend on the sheet reads ' + JSON.stringify(evOn) + (noneOn ? ' and "None right now"' : ''));
        delete s.env.live_events;
        await push(page, s);
        await wait(page, () => { const e = document.querySelector('[data-hs-win="character"] [data-xp="event"]'); return !!e && getComputedStyle(e).display === 'none'; }, null, 4000);
        if ('Bonus XP weekend' in await lines(page)) fails.push('CW-2c the event line stays after the server dropped the event');
        /* CW-4: try on an owned outfit, save: ONE intent. */
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
        await page.waitForTimeout(300);
        if (shots) await shot(page, 'character-1440x900-outfit');
        const saveOff0 = await page.evaluate(() => document.querySelector('[data-hs-act="of-save"]').disabled);
        if (!saveOff0) fails.push('CW-4 Save is on with nothing changed');
        await page.click('[data-hs-act="of-pick"][data-outfit="witch"]');
        await page.waitForTimeout(150);
        const witch = await page.evaluate(() => ({ off: document.querySelector('[data-hs-act="of-save"]').disabled, name: document.querySelector('.hw-of-name').textContent }));
        if (!witch.off || !/Premium, not owned/.test(witch.name)) fails.push('CW-4 a premium outfit not owned can be saved, or is not marked: ' + JSON.stringify(witch));
        /* CW-4c A BUNDLE OUTFIT IS A FIND (src/data/outfits.js `bundle`, the Key Warden): no card while the server's owned list lacks it,
           its card once the server says the hero owns it. */
        const coatCard = () => page.evaluate(() => !!document.querySelector('[data-hs-act="of-pick"][data-outfit="sweeps_coat"]'));
        if (await coatCard()) fails.push('CW-4c the Key Warden shows in the grid of a hero who does not own it');
        const ownedWas = s.env.outfit;
        s.env.outfit = Object.assign({}, ownedWas, { owned: ownedWas.owned.concat(['sweeps_coat']) });
        await push(page, s);
        if (!(await wait(page, () => !!document.querySelector('[data-hs-act="of-pick"][data-outfit="sweeps_coat"]'), null, 4000))) fails.push('CW-4c the Key Warden is missing from the grid of a hero the server says owns it');
        s.env.outfit = ownedWas;
        await push(page, s);
        await wait(page, () => !document.querySelector('[data-hs-act="of-pick"][data-outfit="sweeps_coat"]'), null, 4000);
        await page.click('[data-hs-act="of-pick"][data-outfit="ranger"]');
        await page.waitForTimeout(150);
        await page.click('[data-hs-act="of-save"]');
        await page.waitForTimeout(80);
        const mid = await page.evaluate(() => ({ off: document.querySelector('[data-hs-act="of-save"]').disabled, worn: Array.from(document.querySelectorAll('.hw-of-card.is-worn')).map((b) => b.getAttribute('data-outfit')) }));
        if (!mid.off || mid.worn.join() !== 'berserker') fails.push('CW-4 while the save is in flight: ' + JSON.stringify(mid));
        await page.waitForTimeout(900);
        const saves = s.calls.filter((c) => c.name === 'hr_outfit_set');
        if (saves.length !== 1 || saves[0].body.p_outfit !== 'ranger' || JSON.stringify(saves[0].body.p_colors) !== '{}' || saves[0].body.p_slot !== 0) fails.push('CW-4 Save sent ' + JSON.stringify(saves.map((c) => c.body)));
        /* CW-4b: SAVE COLORS THE PURSE CAN'T PAY (v0.2.97 gate: "Save colors: 1,550 gp" live on a 400 gp purse, refused only after the press): off before the press,
           the line under it says how much more, a press sends nothing; the envelope's next purse turns it back on. */
        await page.click('[data-hs-act="of-pick"][data-outfit="knight"]');
        if (!(await wait(page, () => document.querySelector('.hw-of-dye.is-on [data-hs-act="of-dye"]'), null, 8000))) fails.push('CW-4b CONTROL: the knight offers no colors to try on');
        else {
          await page.click('[data-hs-act="of-dye"][data-dye="7"]');
          const colors = () => page.evaluate(() => { const b = document.querySelector('[data-hs-act="of-colors"]'); return { words: b.textContent, off: b.disabled, why: b.getAttribute('data-off-why'), line: document.querySelector('.hw-of-why').textContent }; });
          await wait(page, () => /Save colors: 1,550 gp/.test(document.querySelector('[data-hs-act="of-colors"]').textContent), null, 4000);
          const rich = await colors();
          if (rich.words !== 'Save colors: 1,550 gp' || rich.off || rich.line) fails.push('CW-4b with 5,200 gp Save colors reads ' + JSON.stringify(rich));
          const was = s.env.state;
          s.env.state = Object.assign({}, was, { gold: 400, gold_v: 3 });
          await push(page, s);
          await wait(page, () => document.querySelector('[data-hs-act="of-colors"]').disabled, null, 4000);
          const poor = await colors();
          if (!poor.off || poor.line !== 'Need 1,150 gp more' || poor.why !== 'Need 1,150 gp more' || poor.words !== 'Save colors: 1,550 gp') fails.push('CW-4b with 400 gp Save colors reads ' + JSON.stringify(poor));
          await page.evaluate(() => document.querySelector('[data-hs-act="of-colors"]').click());
          await page.waitForTimeout(300);
          if (s.calls.some((c) => c.name === 'hr_hero_colors_set')) fails.push('CW-4b a press on a 400 gp purse went to the server');
          s.env.state = Object.assign({}, was, { gold: 5200, gold_v: 4 });
          await push(page, s);
          await wait(page, () => !document.querySelector('[data-hs-act="of-colors"]').disabled, null, 4000);
          const back = await colors();
          if (back.off || back.line) fails.push('CW-4b the next envelope\'s purse leaves Save colors off: ' + JSON.stringify(back));
          await page.click('[data-hs-act="of-undo"]');
        }
        /* CW-5: the death log. */
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="deaths"]');
        await page.waitForTimeout(300);
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-dl-head')).map((b) => ({ by: b.querySelector('.hw-dl-by').textContent, where: b.querySelector('.hw-dl-where').textContent, xp: b.querySelector('.hw-dl-xp').textContent, ev: b.getAttribute('data-event') })));
        if (rows.length !== 2 || rows[0].by !== 'Killed by Rat King' || rows[0].where !== 'Died in Mill Cellar and returned to town' || rows[0].xp !== '140 XP lost' || rows[0].ev !== '901' || rows[1].xp !== 'No XP lost')
          fails.push('CW-5 the death rows are ' + JSON.stringify(rows));
        await page.click('.hw-dl-head[data-event="901"]');
        await page.waitForTimeout(150);
        const more = await page.evaluate(() => document.querySelector('.hw-dl-row.is-open .hw-dl-more').textContent);
        if (!/90 Level XP, 50 Melee XP/.test(more)) fails.push('CW-5 the open row says ' + JSON.stringify(more));
        if (shots) await shot(page, 'character-1440x900-deaths');
        /* CW-6: Gathering and crafting has no combat skill; the unlock names its kind. */
        await openWin(page, 'g', 'skills-trade');
        await page.waitForTimeout(300);
        const trade = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="skills-trade"] .hw-skill')).map((li) => li.textContent + '|' + (li.querySelector('.hw-skill-next').getAttribute('title') || '')));
        if (trade.some((t) => /^\s*(Melee|Defense|Inner Flame|Magic|Ranged)/.test(t))) fails.push('CW-6 Gathering and crafting lists a combat skill');
        const wc = trade.find((t) => /^\s*Smithing/.test(t)) || '';
        if (!/Next at level \d+: .*\((woodcutting|mining) tool\)/.test(wc)) fails.push('CW-6 the smithing unlock does not name its kind: ' + JSON.stringify(wc));
      }
      if (errors.length) fails.push('CW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // CW-3: a sheet the server calls stale shows no combat line (none kept from before) and asks ONCE for its version
      const { ctx, page, errors, s, up } = await open();
      if (up && await openWin(page, 'c', 'character')) {
        await waitCombat(page);
        if ((await lines(page)).Damage !== '1–17') fails.push('CW-3 the fresh sheet did not draw before the stale one');
        s.env.character_sheet = Object.assign({}, s.env.character_sheet, { fresh: false, combat: null, computed_at: null });
        await push(page, s);
        await page.waitForTimeout(1000);
        const L = await lines(page);
        for (const k of ['Damage', 'Hit chance', 'Critical chance', 'Defense', 'Dodge', 'Absorb', 'Ward', 'Speed', 'Total']) if (k in L) fails.push('CW-3 a stale sheet still draws ' + k + ' = ' + L[k]);
        if (L['Max health'] !== '220') fails.push('CW-3 the server-owned max health is gone with the stale sheet: ' + JSON.stringify(L));
        /* Max mana is a vital like max health (Tyler 10-19): the server's hunt vitals carry it when the sheet is stale. */
        if (L['Max mana'] !== '60') fails.push('CW-3 max mana went with the stale sheet instead of reading the server vitals: ' + JSON.stringify(L));
        if (sheetAsks(s).length !== 2) fails.push('CW-3 the opening plus a stale version asked the engine ' + sheetAsks(s).length + ' times, not 2');
        const ask = sheetAsks(s)[1];
        if (ask && Object.keys(ask.body).some((k) => !['slot', 'verb', 'intentId'].includes(k))) fails.push('CW-3 the sheet ask carries ' + JSON.stringify(ask.body));
      } else fails.push('CW-3 the character did not open');
      if (errors.length) fails.push('CW-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // CW-8 THE TAB MATCHES THE HUD: Level, max health and max mana, in a hunt, after a state-only frame, in town
      const { ctx, page, errors, s, up } = await open();
      if (up && await openWin(page, 'c', 'character')) {
        await waitCombat(page);
        const both = () => page.evaluate(() => {
          const t = (q) => { const e = document.querySelector(q); return e ? e.textContent : null; };
          const L = {};
          for (const el of document.querySelectorAll('[data-hs-win="character"] .hw-cs-line')) if (getComputedStyle(el).display !== 'none') L[el.querySelector('dt').textContent] = el.querySelector('dd').textContent;
          const max = (q) => { const v = t(q); return v && v.includes('/') ? v.split('/')[1].replace(/,/g, '') : null; };
          return { tab: { level: (t('[data-hs-win="character"] .hw-cs-lv') || '').replace('Level ', ''), hp: (L['Max health'] || '').replace(/,/g, ''), mana: (L['Max mana'] || '').replace(/,/g, '') },
            hud: { level: t('.hb-lv'), hp: max('.hb-read-v[data-v="hp"]'), mana: max('.hb-read-v[data-v="mana"]') } };
        });
        const same = (when, want) => both().then((r) => {
          for (const k of ['level', 'hp', 'mana']) if (!r.tab[k] || r.tab[k] !== r.hud[k]) fails.push('CW-8 ' + when + ': the tab says ' + k + ' ' + JSON.stringify(r.tab[k]) + ', the HUD ' + JSON.stringify(r.hud[k]));
          if (want && r.tab.level !== want) fails.push('CW-8 ' + when + ': the Level reads ' + r.tab.level + ', the server Level XP makes ' + want);
        });
        await same('in a hunt', '21');
        /* A frame (the whole character, 2026-12-25-frame-push-revive.sql) with a new Level XP: both read the server's Level. */
        s.env.state = Object.assign({}, s.env.state, { level_xp: charXpForLevel(23) + 1684 });
        await push(page, s);
        await same('after a pushed frame', '23');
        /* Back in town: the character's own vitals on both. */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true });
        s.env.state = Object.assign({}, s.env.state, { hp: 280, max_hp: 300 });
        s.env.vitals = { level: 23, max_hp: 300, max_mana: 140, regen_pm: 1000 };
        await push(page, s);
        /* The hunt's end opens its summary in the Character window's place: open the tab again. */
        if (!(await openWin(page, 'c', 'character'))) fails.push('CW-8 the Character window did not open in town');
        await waitCombat(page);
        await same('in town', '23');
        const r = await both();
        if (r.tab.hp !== '300' || r.tab.mana !== '140') fails.push('CW-8 in town the tab reads ' + JSON.stringify(r.tab) + ', the server sent max HP 300, max mana 140');
      } else fails.push('CW-8 the character did not open');
      if (errors.length) fails.push('CW-8 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // CW-9
      const { ctx, page, errors, s, up } = await open();
      const ids = Object.keys(TITLES);
      const [earned, locked, claimable] = [ids[0], ids[1], ids[2]];
      const row = (id, o) => ({ id, words: TITLES[id].words, price: TITLES[id].price, kills: TITLES[id].kills, have: 0, held: false, worn: false, ...o });
      s.env.state = Object.assign({}, s.env.state, { gold: 10000000, gold_v: 1 });
      s.env.titles = { worn: null, rows: [row(earned, { have: TITLES[earned].kills + 7 }), row(locked, { have: 3214 }), row(claimable, { have: TITLES[claimable].kills })] };
      s.env.name = 'Marlow';
      const gp = (n) => n.toLocaleString('en-US') + ' gp';
      /* an accepted press changes the record, as the server would */
      s.titleAnswer = (name, b) => {
        const rows = s.env.titles.rows;
        if (name === 'hr_title_buy') rows.find((r) => r.id === b.p_title).held = true;
        else for (const r of rows) r.worn = r.id === b.p_title;
        s.env.titles.worn = name === 'hr_title_wear' ? b.p_title : s.env.titles.worn;
        return { ok: true };
      };
      const read = () => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-title')).map((li) => {
        const b = li.querySelector('button');
        return [b.getAttribute('data-title'), { name: li.querySelector('b').textContent, small: li.querySelector('small').textContent, press: b.getBoundingClientRect().width > 0 ? b.textContent : null, off: b.disabled }];
      })));
      const press = (id) => page.click('[data-hs-win="character"] [data-hs-act="title-go"][data-title="' + id + '"]');
      const buys = () => s.calls.filter((c) => c.name === 'hr_title_buy');
      const wears = () => s.calls.filter((c) => c.name === 'hr_title_wear');
      if (up) {
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'));
        if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers'));
        if (!(await openWin(page, 'c', 'character'))) fails.push('CW-9 the window did not open');
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="titles"]');
        await wait(page, () => document.querySelector('[data-hs-win="character"] .hw-title'));
        let t = await read();
        /* LOCKED: the count, and nothing to press */
        const d = TITLES[locked];
        /* ...and the gold it will cost, before the kills are done (retention dive 2026-11-20: the price was hidden until then) */
        if (!t[locked] || t[locked].small !== `${d.label}: 3,214 of ${d.kills.toLocaleString('en-US')}, then ${gp(d.price)}` || t[locked].press !== null) fails.push('CW-9 the locked row reads ' + JSON.stringify(t[locked]));
        /* EARNED: one claim, with the quote, and the row moves only from the re-read */
        const e = TITLES[earned];
        if (!t[earned] || t[earned].press !== `Claim for ${gp(e.price)}` || t[earned].off) fails.push('CW-9 the earned row reads ' + JSON.stringify(t[earned]));
        await press(earned);
        await page.waitForTimeout(100);
        t = await read();
        if (t[earned].press !== `Claim for ${gp(e.price)}` || !t[earned].off) fails.push('CW-9 while the claim is in flight: ' + JSON.stringify(t[earned]));
        await page.waitForTimeout(900);
        if (buys().length !== 1 || buys()[0].body.p_title !== earned || buys()[0].body.p_price !== e.price || buys()[0].body.p_slot !== 0 || !buys()[0].body.p_idem
            || Object.keys(buys()[0].body).sort().join() !== 'p_idem,p_price,p_slot,p_title') fails.push('CW-9 Claim sent ' + JSON.stringify(buys().map((c) => c.body)));
        t = await read();
        if (t[earned].press !== 'Equip') fails.push('CW-9 after the re-read the claimed row reads ' + JSON.stringify(t[earned]));
        /* WEAR, one intent; the sheet's header follows the server; TAKE OFF, null */
        await press(earned);
        await page.waitForTimeout(900);
        if (wears().length !== 1 || wears()[0].body.p_title !== earned || wears()[0].body.p_slot !== 0) fails.push('CW-9 Wear sent ' + JSON.stringify(wears().map((c) => c.body)));
        t = await read();
        if (t[earned].press !== 'Unequip') fails.push('CW-9 a worn row reads ' + JSON.stringify(t[earned]));
        await shot(page, 'character-titles');
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="sheet"]');
        await page.waitForTimeout(150);
        const head = await page.evaluate(() => document.querySelector('[data-hs-win="character"] .hw-cs-name').textContent);
        if (head !== 'Marlow ' + e.words) fails.push('CW-9 the sheet\'s header reads ' + JSON.stringify(head));
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="titles"]');
        await page.waitForTimeout(150);
        await press(earned);
        await page.waitForTimeout(900);
        if (wears().length !== 2 || wears()[1].body.p_title !== null) fails.push('CW-9 Unequip sent ' + JSON.stringify(wears().map((c) => c.body)));
        /* A SHORT PURSE: off, and says how much more; A REFUSAL: the server's numbers in the design's words */
        const c = TITLES[claimable];
        s.env.state = Object.assign({}, s.env.state, { gold: c.price - 1, gold_v: 5 });
        await push(page, s);
        t = await read();
        if (!t[claimable].off || !t[claimable].small.endsWith('Need 1 gp more')) fails.push('CW-9 a short purse reads ' + JSON.stringify(t[claimable]));
        s.env.state = Object.assign({}, s.env.state, { gold: 10000000, gold_v: 6 });
        await push(page, s);
        s.titleAnswer = () => ({ ok: false, error: 'title_kills', title: claimable, need: c.kills, have: c.kills - 1 });
        await press(claimable);
        await page.waitForTimeout(900);
        const said = await page.evaluate(() => document.querySelector('[data-hs-win="character"] .hw-cs-titles .hh-intent-msg').textContent);
        if (said !== `${c.name} takes ${c.kills.toLocaleString('en-US')} ${c.noun}. Marlow has ${(c.kills - 1).toLocaleString('en-US')}. Gold can't skip kills.`) fails.push('CW-9 the refusal says ' + JSON.stringify(said));
      } else fails.push('CW-9 the character did not open');
      if (errors.length) fails.push('CW-9 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // CW-3c: no combat number before this opening's ask has answered (a deploy may have moved the engine)
      const { ctx, page, s, up } = await open();
      s.sheetDelay = 2500;
      if (up && await openWin(page, 'c', 'character')) {
        await page.waitForTimeout(800);
        const early = await lines(page);
        if ('Damage' in early) fails.push('CW-3 a combat number showed before the opening\'s ask answered: ' + early.Damage);
        await page.waitForTimeout(2600);
        if ((await lines(page)).Damage !== '1–17') fails.push('CW-3 the answered sheet did not show');
      } else fails.push('CW-3c the character did not open');
      await ctx.close();
    }
    { // CW-3b: a number the server did not send has no line
      const { ctx, page, up } = await open({ sections: { dropMana: true } });
      if (up && await openWin(page, 'c', 'character')) {
        await waitCombat(page);
        const L = await lines(page);
        if ('Max mana' in L) fails.push('CW-3 a max mana the server did not send reads ' + L['Max mana']);
        if (L.Damage !== '1–17') fails.push('CW-3 the other lines went with it: ' + JSON.stringify(L));
      } else fails.push('CW-3 the no-mana character did not open');
      await ctx.close();
    }
    { // CW-7 THE SHEET LAYS OUT FROM THE WINDOW'S OWN WIDTH: at every browser size (and a squeezed window)
      // every vital row is drawn whole inside the window and no identity box crosses a vital box.
      for (const vp of [[922, 423], [1280, 720], [1440, 900], [1920, 1080], [1440, 900, 300]]) {
        const { ctx, page, up } = await open({ viewport: { width: vp[0], height: vp[1] } });
        if (up && await openWin(page, 'c', 'character')) {
          await waitCombat(page);
          const r = await page.evaluate((w) => {
            const win = document.querySelector('[data-hs-win="character"]');
            if (w) win.style.width = w + 'px';
            const box = (e) => e.getBoundingClientRect();
            const W = box(win);
            const ids = Array.from(win.querySelectorAll('.hw-cs-portrait, .hw-cs-name, .hw-cs-role, .hw-cs-lv, .hw-cs-level .hw-skill-bar, .hw-cs-lvxp')).map(box).filter((b) => b.width > 0);
            const vit = Array.from(win.querySelectorAll('.hw-cs-vitals .hw-cs-line.is-on'));
            const bad = [];
            for (const v of vit) {
              const b = box(v);
              const name = v.querySelector('dt').textContent;
              if (b.width < 1 || b.height < 1 || b.left < W.left - 0.5 || b.right > W.right + 0.5 || v.scrollWidth > v.clientWidth + 1) bad.push(name + ' not drawn whole');
              for (const d of v.children) { const q = box(d); if (ids.some((i) => q.left < i.right && i.left < q.right && q.top < i.bottom && i.top < q.bottom)) bad.push(name + ' overlaps the identity'); }
            }
            return { n: vit.length, names: vit.map((v) => v.querySelector('dt').textContent), bad };
          }, vp[2] || 0);
          if (['Max health', 'Max mana', 'Regeneration', 'Speed'].some((k) => !r.names.includes(k))) fails.push('CW-7 at ' + vp.join('x') + ' only ' + r.names.join(',') + ' show');
          if (r.bad.length) fails.push('CW-7 at ' + vp.join('x') + ': ' + r.bad.join('; '));
        } else fails.push('CW-7 the window did not open at ' + vp.join('x'));
        await ctx.close();
      }
    }
    { // CW-10 THE SHEET READS AS A CHARACTER SHEET (UI audit 2026-11-18 #8), at 1440x900 and on the 922x423 sheet
      for (const vp of [[1440, 900], [922, 423]]) {
        const tag = vp.join('x');
        const { ctx, page, up } = await open({ viewport: { width: vp[0], height: vp[1] } });
        if (up && await openWin(page, 'c', 'character')) {
          await waitCombat(page);
          await wait(page, () => { const c = document.querySelector('[data-hs-win="character"] .hw-cs-portrait'); return !!c && c.hasAttribute('data-sig'); }, null, 5000);
          const r = await page.evaluate(() => {
            const win = document.querySelector('[data-hs-win="character"]');
            const body = win.querySelector('.hs-win-body');
            const box = (e) => e.getBoundingClientRect();
            const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.25;
            const pc = win.querySelector('.hw-cs-portrait');
            /* the portrait: the FIGURE drawn at art size and shown at a WHOLE number of px an art px, 2 or more */
            const k = box(pc).width / pc.width;
            const portrait = { w: pc.width, h: pc.height, k, whole: Math.abs(k - Math.round(k)) < 0.01 && Math.abs(box(pc).height / pc.height - k) < 0.01 };
            /* each combat skill: its bar a real width (40% of the entry or more), its unlock one line */
            const skills = Array.from(win.querySelectorAll('.hw-cs .hw-skill')).map((li) => {
              const bar = box(li.querySelector('.hw-skill-bar')), next = li.querySelector('.hw-skill-next');
              const shown = next.getClientRects().length > 0;
              return { name: li.querySelector('.hw-skill-name').textContent, bar: Math.round(bar.width), of: Math.round(box(li).width),
                lines: shown ? Math.round(box(next).height / lh(next)) : 0, one: li.querySelector('.hw-skill-one').textContent };
            });
            /* every stat value on one line */
            const wrapped = Array.from(win.querySelectorAll('.hw-cs-line.is-on dd')).filter((d) => box(d).height > lh(d) * 1.5).map((d) => d.parentElement.querySelector('dt').textContent);
            return { portrait, skills, wrapped, cut: body.scrollHeight - body.clientHeight };
          });
          if (r.portrait.w !== 42 || r.portrait.h !== 45 || !r.portrait.whole || r.portrait.k < 2) fails.push('CW-10 at ' + tag + ' the portrait is ' + JSON.stringify(r.portrait) + ', not the 42x45 figure at a whole 2x or more');
          for (const s of r.skills) {
            if (s.bar < s.of * 0.4) fails.push('CW-10 at ' + tag + ' the ' + s.name + ' bar is ' + s.bar + ' px of a ' + s.of + ' px entry');
            if (s.lines > 1) fails.push('CW-10 at ' + tag + ' the ' + s.name + ' unlock runs ' + s.lines + ' lines');
            /* ONE thing on the line, by name only: "Lv 15: Scored Earth Rune" (its kind and the rest are the tooltip) */
            if (s.one && !/^(Recovery \+[\d.]+%\. )?Lv \d+: [^,()]+$/.test(s.one)) fails.push('CW-10 at ' + tag + ' the ' + s.name + ' unlock line reads ' + JSON.stringify(s.one));
          }
          if (r.skills.length < 4) fails.push('CW-10 at ' + tag + ' CONTROL: ' + r.skills.length + ' combat skills drawn');
          if (r.wrapped.length) fails.push('CW-10 at ' + tag + ' these values wrap: ' + r.wrapped.join(', '));
          /* nothing cut at 1440x900: the whole sheet stands in the window (the phone's sheet scrolls by design) */
          if (vp[0] === 1440 && r.cut > 1) fails.push('CW-10 at ' + tag + ' the sheet is cut: ' + r.cut + ' px under the window');
          /* THE WARDROBE: every outfit's figure at the portrait's whole scale, three or more to a row */
          await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
          await wait(page, () => document.querySelectorAll('[data-hs-win="character"] .hw-of-face[data-sig]').length >= 5, null, 5000);
          const o = await page.evaluate(() => {
            const faces = Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-of-face'));
            const ks = faces.map((c) => c.getBoundingClientRect().width / c.width);
            const tops = new Set(faces.map((c) => Math.round(c.getBoundingClientRect().top)));
            return { n: faces.length, sizes: [...new Set(faces.map((c) => c.width + 'x' + c.height))], ks: [...new Set(ks.map((k) => Math.round(k * 100) / 100))], perRow: Math.round(faces.length / tops.size) };
          });
          if (o.sizes.join() !== '42x45' || o.ks.length !== 1 || o.ks[0] < 2 || Math.abs(o.ks[0] - Math.round(o.ks[0])) > 0.01) fails.push('CW-10 at ' + tag + ' the wardrobe figures are ' + JSON.stringify(o));
          if (o.perRow < 3) fails.push('CW-10 at ' + tag + ' the wardrobe stands ' + o.perRow + ' to a row');
        } else fails.push('CW-10 the window did not open at ' + tag);
        if (shots) await shot(page, 'character-' + tag + '-cw10');
        await ctx.close();
      }
      /* THE FIGURE holds every outfit: no opaque art px of any idle facing lies outside it (a new outfit with a taller plume would be cut) */
      const { ctx, page, up } = await open();
      if (up) {
        const out = await page.evaluate(async () => {
          const { FIGURE } = await import('/src/render/outfit-sprite.js');
          /* every hero set the portrait draws from (heroes, and factionwear since heroes is full) */
          const { HERO_SETS } = await import('/src/data/world/atlas-sets.js');
          const [fx, fy, fw, fh] = FIGURE, bad = [];
          let n = 0;
          for (const set of HERO_SETS) {
            const man = await (await fetch('/assets/world/atlas-' + set + '.json')).json();
            const img = new Image(); img.src = '/assets/world/atlas-' + set + '.png'; await img.decode();
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            n += Object.keys(man.sprites).length;
            for (const [id, s] of Object.entries(man.sprites)) for (const [dir, frames] of Object.entries(s.anims.idle.dirs)) for (const [sx, sy] of frames) {
              const d = g.getImageData(sx, sy, s.frame[0], s.frame[1]).data;
              for (let y = 0; y < s.frame[1]; y++) for (let x = 0; x < s.frame[0]; x++) {
                if (d[(y * s.frame[0] + x) * 4 + 3] && (x < fx || y < fy || x >= fx + fw || y >= fy + fh)) { bad.push(id + ' ' + dir + ' at ' + x + ',' + y); y = s.frame[1]; break; }
              }
            }
          }
          return { n, bad: [...new Set(bad)].slice(0, 6) };
        });
        if (out.n < 5 || out.bad.length) fails.push('CW-10 the FIGURE cuts an outfit: ' + JSON.stringify(out));
      } else fails.push('CW-10 the figure check did not mount');
      await ctx.close();
    }
    if (!overrides || Object.keys(overrides).some((f) => LOOK_FILES.includes(f))) { // CW-11 THE FACTION LOOKS, on the stand-ins
      const looks = await serve(await lookPlants(overrides));
      try {
        const { ctx, page, s, up } = await open({ base: 'http://127.0.0.1:' + looks.port });
        if (!up || !(await openWin(page, 'c', 'character'))) fails.push('CW-11 the Character window did not open on the stand-ins');
        else {
          await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
          await page.waitForTimeout(300);
          const cards = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-act="of-pick"]')).map((b) => ({ id: b.getAttribute('data-outfit'),
            locked: b.classList.contains('is-locked'), mark: b.querySelector('.hw-of-mark').textContent })));
          const faction = (list) => list.filter((c) => c.id.startsWith('flamebearer') || c.id.startsWith('emberkeeper'));
          /* OFF: no faction card at all */
          let list = faction(await cards());
          if (list.length) fails.push('CW-11 with the factions off the grid shows ' + JSON.stringify(list));
          /* ON: both sides' outfits, locked, each with the section's own requirement; never an add-on's card; never the Key Warden */
          s.env.factions = factionsSection();
          await push(page, s);
          await wait(page, () => !!document.querySelector('[data-hs-act="of-pick"][data-outfit="emberkeeper"]'), null, 4000);
          list = await cards();
          const want = [{ id: 'flamebearer', locked: true, mark: 'Requires First Flame standing: 37 h' }, { id: 'emberkeeper', locked: true, mark: 'Requires Last Ember standing: 38 h' }];
          if (JSON.stringify(faction(list)) !== JSON.stringify(want)) fails.push('CW-11 with the factions on the faction cards are ' + JSON.stringify(faction(list)));
          /* the cards draw from the second hero set: each face is painted from its own sheet (the canvas keeps the sprite it drew) */
          const faces = await wait(page, () => ['flamebearer', 'emberkeeper'].every((id) => { const c = document.querySelector('[data-hs-act="of-pick"][data-outfit="' + id + '"] canvas');
            return !!c && String(c.getAttribute('data-sig') || '').startsWith('outfit_' + id + '|'); }), null, 6000);
          if (!faces) fails.push('CW-11 a faction card\'s face was not drawn from its factionwear sheet');
          /* the portrait's recolour and the World's dye both reach the faction looks' masks */
          const dyedOk = await page.evaluate(async () => {
            const S = await import('/src/render/outfit-sprite.js');
            const D = await import('/src/world/hero-dye.js');
            const A = await import('/src/world/atlas.js');
            /* asked by the sprites drawn: a worn set (factionwear) comes only for a sprite of its own */
            const ids = ['outfit_flamebearer', 'outfit_emberkeeper'];
            const [art, masks] = await Promise.all([S.outfitArt(document, '', ids), S.outfitMasks(document, '', ids)]);
            const out = {};
            for (const id of ids) {
              const draw = (dyes) => { const c = document.createElement('canvas'); S.drawOutfit(c, art, id, { dir: 's', scale: 1, dyes, masks }); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
              const a = draw([]), b = draw(['#00ff00', '#00ff00', '#00ff00', '#00ff00']);
              let moved = 0;
              for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) moved++;
              out[id] = { portrait: moved };
            }
            const fw = await A.loadAtlasSet({ doc: document, version: '' }, 'factionwear');
            const dye = D.createHeroDye({ doc: document, version: '' });
            for (let t = 0; t < 40; t++) {
              for (const id of ['outfit_flamebearer', 'outfit_emberkeeper']) dye.want(id, '11.11.11.11', true, fw.manifest.sprites[id], fw.image);
              dye.pump();
              if (['outfit_flamebearer', 'outfit_emberkeeper'].every((id) => dye.has(id, '11.11.11.11'))) break;
              await new Promise((ok) => setTimeout(ok, 100));
            }
            for (const id of ['outfit_flamebearer', 'outfit_emberkeeper']) out[id].world = dye.has(id, '11.11.11.11');
            return out;
          });
          if (!(dyedOk.outfit_flamebearer.portrait > 0 && dyedOk.outfit_emberkeeper.portrait > 0 && dyedOk.outfit_flamebearer.world && dyedOk.outfit_emberkeeper.world)) {
            fails.push('CW-11 the faction looks do not take their colors (portrait px moved, World look baked): ' + JSON.stringify(dyedOk));
          }
          if (list.some((c) => c.id === 'sweeps_coat')) fails.push('CW-11 the Key Warden shows to a hero who does not own it');
          /* OWNED: the outfit and its Shield; the card's picker offers None and Shield, greys Light with its requirement */
          s.env.outfit = Object.assign({}, s.env.outfit, { owned: s.env.outfit.owned.concat(['flamebearer', 'flamebearer_shield']) });
          await push(page, s);
          await wait(page, () => { const b = document.querySelector('[data-hs-act="of-pick"][data-outfit="flamebearer"]'); return !!b && !b.classList.contains('is-locked'); }, null, 4000);
          await page.click('[data-hs-act="of-pick"][data-outfit="flamebearer"]');
          await page.waitForTimeout(150);
          /* the dye picker presses the dye the preview wears: none while the Flamebearer wears its side's own colors at the creation defaults,
             the press once one is tried on, none again after Undo (blind faction QA 2026-11-19 #5) */
          const pressed = () => page.evaluate(() => Array.from(document.querySelectorAll('.hw-of-dye.is-on .hw-of-swatch[aria-pressed="true"]')).map((b) => b.getAttribute('data-dye')).join());
          await wait(page, () => !!document.querySelector('.hw-of-dye.is-on .hw-of-swatch'), null, 4000);
          const dyePress = [await pressed()];
          await page.click('.hw-of-swatch[data-dye="13"]');
          await page.waitForTimeout(150);
          dyePress.push(await pressed());
          await page.click('[data-hs-act="of-undo"]');
          await page.waitForTimeout(150);
          dyePress.push(await pressed());
          if (JSON.stringify(dyePress) !== '["","13",""]') fails.push('CW-11 the Flamebearer\'s Tabard swatch pressed at the defaults, after a press and after Undo reads ' + JSON.stringify(dyePress));
          const picker = () => page.evaluate(() => { const box = document.querySelector('.hw-of-addons');
            return { on: !!box && box.classList.contains('is-on'), head: box ? box.querySelector('.hw-of-addons-head').textContent : '',
              opts: Array.from(document.querySelectorAll('[data-hs-act="of-addon"]')).map((b) => ({ look: b.getAttribute('data-outfit'), label: b.querySelector('b').textContent,
                need: b.querySelector('small').textContent, off: b.disabled, on: b.getAttribute('aria-checked') === 'true' })) }; });
          let pk = await picker();
          const wantPk = { on: true, head: 'Add-on', opts: [{ look: 'flamebearer', label: 'None', need: '', off: false, on: true }, { look: 'flamebearer_shield', label: 'Shield', need: '', off: false, on: false },
            { look: 'flamebearer_light', label: 'Light', need: 'Requires First Flame standing: 301 h', off: true, on: false }] };
          if (JSON.stringify(pk) !== JSON.stringify(wantPk)) fails.push('CW-11 the Flamebearer\'s picker reads ' + JSON.stringify(pk));
          if (faction(await cards()).length !== 2) fails.push('CW-11 an add-on\'s look has a card of its own: ' + JSON.stringify(faction(await cards())));
          /* the pick is the look Equip names: ONE hr_outfit_set */
          await page.click('[data-hs-act="of-addon"][data-outfit="flamebearer_shield"]');
          await page.waitForTimeout(150);
          pk = await picker();
          const shieldOn = pk.opts.find((x) => x.look === 'flamebearer_shield');
          if (!shieldOn || !shieldOn.on) fails.push('CW-11 the Shield press did not try it on: ' + JSON.stringify(pk.opts));
          const before = s.calls.filter((c) => c.name === 'hr_outfit_set').length;
          const saveOn = await page.evaluate(() => !document.querySelector('[data-hs-act="of-save"]').disabled);
          if (saveOn) await page.click('[data-hs-act="of-save"]');
          await page.waitForTimeout(700);
          const sent = s.calls.filter((c) => c.name === 'hr_outfit_set').slice(before);
          if (!saveOn || sent.length !== 1 || sent[0].body.p_outfit !== 'flamebearer_shield') fails.push('CW-11 Equip on the Shield sent ' + JSON.stringify(sent.map((c) => c.body)) + (saveOn ? '' : ' (Equip was off)'));
          /* OFF AGAIN: the owned outfit stays, the locked one goes, the unowned add-on has no number to say and is not offered */
          delete s.env.factions;
          await push(page, s);
          await wait(page, () => !document.querySelector('[data-hs-act="of-pick"][data-outfit="emberkeeper"]'), null, 4000);
          list = faction(await cards());
          if (JSON.stringify(list.map((c) => c.id)) !== '["flamebearer"]') fails.push('CW-11 with the factions off again the faction cards are ' + JSON.stringify(list));
          await page.click('[data-hs-act="of-pick"][data-outfit="flamebearer"]');
          await page.waitForTimeout(150);
          pk = await picker();
          if (pk.opts.map((x) => x.look).join() !== 'flamebearer,flamebearer_shield') fails.push('CW-11 with the factions off the picker offers ' + JSON.stringify(pk.opts));
        }
        await ctx.close();
      } finally { looks.server.close(); }
    }
    if (shots) { // the phone size class
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 } });
      if (up && await openWin(page, 'c', 'character')) {
        await page.waitForTimeout(1200);
        await shot(page, 'character-922x423-sheet');
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
        await page.waitForTimeout(300);
        await shot(page, 'character-922x423-outfit');
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="deaths"]');
        await page.waitForTimeout(300);
        await shot(page, 'character-922x423-deaths');
      } else fails.push('CW-1 the phone size did not mount');
      await ctx.close();
    }
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
  ['the sheet lists no live XP event (CW-2c)', 'src/shell/windows/character/sheet.js', '  const ev = c ? sheetXpLine(cs) : null;', '  const ev = c ? null : sheetXpLine(cs);'],
  ['an add-on not owned can be picked (CW-11)', 'src/shell/windows/character/outfit-looks.js', '    const own = owns(o, look);', '    const own = true;'],
  ['the requirement is a literal, not the server\'s number (CW-11)', 'src/shell/windows/character/outfit-looks.js', 'time: spanWords(p.needMs) })', 'time: spanWords(25 * 3600000) })'],
  ['a locked faction outfit shows with the factions off (CW-11)', 'src/shell/windows/character/outfit-looks.js', "    return !!r.pieces && requiresWords(f, r.pieces[0]) !== '';", '    return !!r.pieces;'],
  ['an add-on\'s look gets a card of its own (CW-11)', 'src/shell/windows/character/outfit-looks.js', '    if (outfitOfLook(id) !== id) return false;\n', ''],
  ['the Character window never loads a worn set (CW-11)', 'src/render/outfit-sprite.js', '  return Promise.allSettled(heroSetsFor(sprites).map((set) => {', '  return Promise.allSettled(heroSetsFor([]).map((set) => {'],
  ['the portrait finds only the first hero set\'s masks (CW-11)', 'src/render/outfit-sprite.js', "  const masks = dyes.some(Boolean) ? setsOf(opt.masks).find(", "  const masks = dyes.some(Boolean) ? setsOf(opt.masks).slice(0, 1).find("],
  ['the World dyes from the first mask set only (CW-11)', 'src/world/hero-dye.js', "(Array.isArray(m.sets) ? m.sets : [m]).find(", "(Array.isArray(m.sets) ? m.sets.slice(0, 1) : [m]).find("],
  ['Equip names the outfit, not the picked add-on (CW-11)', 'src/shell/windows/character/outfit.js', '    sc.draft = { outfit: id, colors: draftOf(cs, sc).colors };', '    sc.draft = { outfit: outfitOfLook(id), colors: draftOf(cs, sc).colors };'],
  ['the vitals no longer wrap under the identity', 'src/styles/character.css', '.hw-cs-vitals { flex: 1 1 190px; min-width: 0;', '.hw-cs-vitals { flex: none; grid-template-columns: auto auto !important;'],
  ['the damage is derived in the browser', 'src/shell/windows/character/sheet.js', "c && c.damage ? c.damage.min + '–' + c.damage.max : null", "c && c.damage ? '1–' + (Math.floor(c.defence * 0.35) + 2) : null"],
  ['the absorb is derived in the browser', 'src/shell/windows/character/sheet.js', "c && c.absorbPct !== null ? c.absorbPct + '%' : null", "c && c.absorbPct !== null ? Math.round(c.defence * 1.5) + '%' : null"],
  ['a stale sheet keeps the last numbers', 'src/session/character-sections.js', '    combat: s.fresh === true ? combatOf(s.combat) : null,', '    combat: (globalThis.__lc = s.fresh === true ? combatOf(s.combat) : (globalThis.__lc || null)),'],
  ['an absent stat draws a zero', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"mana\"]', hv.manaMax !== null ? whole(hv.manaMax) : null);", "line(root, '[data-vital=\"mana\"]', whole(hv.manaMax || 0));"],
  ['a wand reads (staff) again', 'src/data/item-uses.js', "  if (it.type === 'weapon') return WEAPON_WORD[roleWeaponOf(it)] || 'weapon';", "  if (it.type === 'weapon') return ({ magic: 'staff' })[it.weaponType] || WEAPON_WORD[it.weaponType] || 'weapon';"],
  ['a spellbook reads (offhand)', 'src/data/item-uses.js', "  if (it.slot === 'shield' && it.discipline) return 'spellbook';\n", ''],
  ['the HUD reads the hunt hero Level again (r09)', 'src/shell/widgets/vitals-hub.js', '  const level = v.level;', '  const level = hero && Number.isFinite(hero.level) ? hero.level : v.level;'],
  ['the tab reads the sheet section max HP again (r09)', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"hp\"]', hv.hpMax !== null ? whole(hv.hpMax) : null);", "line(root, '[data-vital=\"hp\"]', sh && sh.fresh !== undefined ? whole(cs.read('character_sheet').max_hp) : null);"],
  ['the tab reads the engine sheet max mana again (r09)', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"mana\"]', hv.manaMax !== null ? whole(hv.manaMax) : null);", "line(root, '[data-vital=\"mana\"]', c && c.role ? whole(cs.read('character_sheet').combat.max_mana) : hv.manaMax !== null ? whole(hv.manaMax) : null);"],
  ['a leech line the engine does not have', 'src/shell/windows/character/sheet.js', "const COMBAT = Object.freeze([['damage', 'Damage'],", "const COMBAT = Object.freeze([['leech', 'Life Leech'], ['damage', 'Damage'],"],
  ['a locked title can be pressed', 'src/shell/windows/character/titles.js', "if (r.have < r.kills) return { small: count + (r.price ? ', then ' + gold(r.price) : ''), press: null, off: true };", "if (r.have < r.kills) return { small: count + (r.price ? ', then ' + gold(r.price) : ''), press: 'Claim', off: false };"],
  ['a locked title hides its price until the kills are done (CW-9)', 'src/shell/windows/character/titles.js', "return { small: count + (r.price ? ', then ' + gold(r.price) : ''), press: null, off: true };", "return { small: count, press: null, off: true };"],
  ['a claim sends a price of its own', 'src/shell/windows/character/titles.js', 'buyTitle(ctx.account, cs, r.id, r.price)', 'buyTitle(ctx.account, cs, r.id, 1)'],
  ['Unequip wears it again', 'src/shell/windows/character/titles.js', 'wearTitle(ctx.account, cs, r.worn ? null : r.id)', 'wearTitle(ctx.account, cs, r.id)'],
  ['a title stays pressable in flight', 'src/shell/windows/character/titles.js', "prop(b, 'disabled', sc.pending || w.off);", "prop(b, 'disabled', w.off);"],
  ['a short purse can press Claim', 'src/shell/windows/character/titles.js', "off: short > 0 };", "off: false };"],
  ['a refusal does not name the hero', 'src/shell/windows/character/titles.js', "() => name + ' claimed, press Equip to show it', cs);", "() => name + ' claimed, press Equip to show it');"],
  ['the sheet header drops the title', 'src/shell/windows/character/sheet.js', "(nameOf(cs) || '') + (worn ? ' ' + worn : '')", "(nameOf(cs) || '')"],
  ['the sheet is asked for every paint', 'src/shell/windows/character/index.js', "  if (!sh || sc.sheetAsking || v === null) return;\n  if (sc.opening !== 'due' && (sh.fresh || sc.sheetAsked === v)) return;", "  if (!sh) return;"],
  ['an opening never asks the engine', 'src/shell/windows/character/index.js', "if (sc.opening !== 'due' && (sh.fresh || sc.sheetAsked === v)) return;", "if (sh.fresh || sc.sheetAsked === v) return;"],
  ['the old sheet shows before the opening asked', 'src/shell/windows/character/index.js', "PORTRAIT_SCALE, dyesOf(lookColors(heroSprite(cs), base), ctx.doc), FIGURE), sc.opening === 'done');", "PORTRAIT_SCALE, dyesOf(lookColors(heroSprite(cs), base), ctx.doc), FIGURE), true);"],
  ['Save sends the outfit twice', 'src/shell/windows/character/outfit.js', "runIntent(sc, repaint, () => cs.saveOutfit(d.outfit), 'Saving…',", "cs.saveOutfit(d.outfit); runIntent(sc, repaint, () => cs.saveOutfit(d.outfit), 'Saving…',"],
  ['the worn mark follows the draft', 'src/shell/windows/character/outfit.js', 'const worn = !!o && !!o.worn && outfitOfLook(o.worn) === id;', 'const worn = id === d.outfit;'],
  ['Save colors stays live on a short purse (CW-4b)', 'src/shell/windows/character/outfit.js', "prop(save, 'disabled', sc.pending || !offer || sc.price === null || short > 0);", "prop(save, 'disabled', sc.pending || !offer || sc.price === null);"],
  ['a short purse says nothing under Save colors (CW-4b)', 'src/shell/windows/character/outfit.js', "text(root.querySelector('.hw-of-why'), short ? 'Need ' + gold(short) + ' more' : '');", "text(root.querySelector('.hw-of-why'), '');"],
  ['a premium outfit not owned can be saved', 'src/shell/windows/character/outfit.js', "sc.pending || !o || !owned || (o.worn || null) === d.outfit", "sc.pending || !o || (o.worn || null) === d.outfit"],
  ['an earned outfit (a bundle, faction pieces) shows to a hero who does not own it (CW-4c)', 'src/shell/windows/character/outfit-looks.js', '    if (!earnedOnly(r) || owns(o, id)) return true;', '    return true;'],
  ['the trade skills list the combat skills', 'src/shell/windows/skills.js', "export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);", "export const renderTradeSkills = skillsWindow([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Crafting']]);"],
  ['the unlock line drops the kind', 'src/data/item-uses.js', "  if (it.type === 'tool' && it.toolSkill) return it.toolSkill + ' tool';", "  if (it.type === 'tool' && it.toolSkill) return '';"],
  ['the portrait is the whole 64 px frame at 1x again (CW-10)', 'src/shell/windows/character/index.js', "PORTRAIT_SCALE, dyesOf(lookColors(heroSprite(cs), base), ctx.doc), FIGURE), sc.opening === 'done');", "PORTRAIT_SCALE, dyesOf(lookColors(heroSprite(cs), base), ctx.doc), null), sc.opening === 'done');"],
  ['the portrait shows at 1.5 px an art px (CW-10)', 'src/styles/character.css', '.hw-cs-portrait { flex: none; width: calc(42 * var(--art-px));', '.hw-cs-portrait { flex: none; width: 60px;'],
  ['the sheet bar shares its row with the name again (CW-10)', 'src/styles/character.css', 'grid-template-areas: "glyph name xp lv" ". bar bar bar" ". next next next"; row-gap: 2px;', 'grid-template-areas: "glyph name bar lv" ". xp xp xp" ". next next next"; row-gap: 2px;'],
  ['every unlock is on the line again (CW-10)', 'src/shell/windows/skills.js', "text(nx.querySelector('.hw-skill-one'), u.one);", "text(nx.querySelector('.hw-skill-one'), u.all);"],
  ['a value says what it is measured against again (CW-10)', 'src/shell/windows/character/sheet.js', "c && c.dodgePct !== null ? c.dodgePct + '%' : null", "c && c.dodgePct !== null ? c.dodgePct + '% of blows vs a monster of the same Level' : null"],
  ['the wardrobe shows the whole frame again (CW-10)', 'src/shell/windows/character/index.js', "paintCanvas(ctx.doc, canvas, OUTFITS[id], 's', 1, dyesFor(id), FIGURE)", "paintCanvas(ctx.doc, canvas, OUTFITS[id], 's', 1, dyesFor(id), null)"],
  ['the FIGURE is cut to the body (CW-10)', 'src/render/outfit-sprite.js', 'export const FIGURE = Object.freeze([13, 15, 42, 45]);', 'export const FIGURE = Object.freeze([16, 19, 32, 40]);'],
  ['the picker presses the stored dye while a faction look wears its side colors (CW-11)', 'src/shell/windows/character/outfit.js', 'const worn = lookColors(d.outfit, shown);', 'const worn = shown;'],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'character-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'character-window: ' + fails.length + ' rule(s) RED'
      : 'character-window: rows match the server; stats only from the server section; nothing that does not exist is drawn; one sheet ask per version; outfit save is one intent; the death log is the server\'s; skills split with named unlocks' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/character-window.mjs', MUTANTS);
  if (!MINE.length) process.exit(0);
  const clean = await cleanControl(() => checks(null, null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MINE) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text.replace(from, to) }, null)), counts));
  }
  console.log(exitOf(counts) ? 'character-window --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'character-window --mutate: ' + MINE.length + '/' + MINE.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
