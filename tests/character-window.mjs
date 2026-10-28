#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/character-window.mjs — THE CHARACTER WINDOW'S RULES, IN A REAL CHROMIUM.
//
//   node tests/character-window.mjs                the rules
//   node tests/character-window.mjs --mutate       every planted defect must turn a rule RED
//   node tests/character-window.mjs --shots <dir>  also write the visual-gate screenshots
//                                                  (1440x900 and 922x423)
//
// mutant-anchors: src/shell/widgets/vitals-hub.js src/shell/windows/character/sheet.js src/shell/windows/character/index.js src/shell/windows/character/outfit.js src/session/character-sections.js src/shell/windows/skills.js src/styles/character.css src/data/item-uses.js src/data/skill-unlocks.js supabase/functions/hr-accrue/character-sheet.js src/core/progression.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus the three sections
// 2026-10-25-character-sheet.sql projects (built here, below).
//   CW-D2 src/data/outfits.js validate() is clean (the server rows are GENERATED
//         from it and the --dye-N tokens: tools/gen-outfits.mjs --check)
//   CW-1  C opens the Character window from the key and the launcher, with zero
//         console errors; its three tabs are Character, Outfit and Deaths
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
//         tried on and never saved
//   CW-5  THE DEATH LOG is the server's rows: who killed the hero, where, the XP
//   CW-7  the sheet lays out from the window's own width: every vital row whole, none over the identity
//   CW-8  THE TAB MATCHES THE HUD (r09: Level 4 on the tab, 11 on the HUD): the
//         Character tab's Level, max health and max mana equal the vitals hub's,
//         in a hunt, after a pushed frame that restates only `state`, and in town
//   CW-6  THE SKILLS: Gathering and crafting lists no combat skill; the combat
//         ledger is the Character window's; an unlock line names each thing and
//         its kind ("Bronze Axe (woodcutting tool)")
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* Level totals on the shipped curve (src/core/xp.js), never typed: the curve is data (lane/b-level-curve). */
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
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
  env.outfit = { worn: 'berserker', colors: {}, owned: ['knight', 'berserker', 'ranger', 'sorcerer', 'druid'] };
  env.death_log = [{ id: 901, at: '2026-10-18T09:30:00Z', hunt: 'mill_cellar', monster: 'rat_king', xp: 140, xp_lost: { level: 90, melee: 50 } },
    { id: 877, at: '2026-10-17T20:00:00Z', hunt: 'mill_cellar', monster: 'rat', xp: 0, xp_lost: null }];
  return env;
}

function scripted(o) {
  const s = { env: withSections(clone(FIXTURE), o), version: 1, calls: [], residue: {}, sheetFresh: o && o.fresh === false ? false : true };
  s.next = () => Object.assign(clone(s.env), { version: ++s.version, client_state: clone(s.residue) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
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
    const up = await signInAndPlay(page, base);
    return { ctx, page, errors, s, up };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  try {
    { // CW-1 CW-2 CW-4 CW-5 CW-6
      const { ctx, page, errors, s, up } = await open();
      if (!up) fails.push('CW-1 the shell did not mount');
      else {
        const launchers = await page.evaluate(() => Array.from(document.querySelectorAll('.hs-launch')).map((b) => b.getAttribute('data-hs-open')));
        if (!launchers.includes('character') || launchers.includes('skills-combat')) fails.push('CW-1 the launcher row is ' + launchers.join(','));
        if (!(await openWin(page, 'c', 'character'))) fails.push('CW-1 the C key did not open the Character window');
        await waitCombat(page);
        const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-tab[data-tab]')).map((b) => b.textContent));
        if (tabs.join('|') !== 'Character|Outfit|Deaths') fails.push('CW-1 the tabs are ' + tabs.join('|'));
        /* CW-2: exactly the section's numbers. */
        const L = await lines(page);
        const want = { Damage: '1–17', 'Hit chance': '74.5% against no armour', 'Critical chance': '4.5%', Defence: '23', Dodge: '12.5% of blows', Absorb: '31% of each blow', Ward: '4 off each blow', 'Max mana': '60', 'Max health': '220',
          Regeneration: '+1.9% (Inner Flame)', 'Home and renown': '+2%', Total: '+2%' };
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
        const magic = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="character"] .hw-skill')).map((li) => li.textContent).find((t) => /^\s*Magic/.test(t)) || '');
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
        /* CW-4: try on an owned outfit, save: ONE intent. */
        await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
        await page.waitForTimeout(300);
        if (shots) await shot(page, 'character-1440x900-outfit');
        const saveOff0 = await page.evaluate(() => document.querySelector('[data-hs-act="of-save"]').disabled);
        if (!saveOff0) fails.push('CW-4 Save is on with nothing changed');
        await page.click('[data-hs-act="of-pick"][data-outfit="witch"]');
        await page.waitForTimeout(150);
        const witch = await page.evaluate(() => ({ off: document.querySelector('[data-hs-act="of-save"]').disabled, name: document.querySelector('.hw-of-name').textContent }));
        if (!witch.off || !/Premium · not owned/.test(witch.name)) fails.push('CW-4 a premium outfit not owned can be saved, or is not marked: ' + JSON.stringify(witch));
        await page.click('[data-hs-act="of-pick"][data-outfit="ranger"]');
        await page.waitForTimeout(150);
        await page.click('[data-hs-act="of-save"]');
        await page.waitForTimeout(80);
        const mid = await page.evaluate(() => ({ off: document.querySelector('[data-hs-act="of-save"]').disabled, worn: Array.from(document.querySelectorAll('.hw-of-card.is-worn')).map((b) => b.getAttribute('data-outfit')) }));
        if (!mid.off || mid.worn.join() !== 'berserker') fails.push('CW-4 while the save is in flight: ' + JSON.stringify(mid));
        await page.waitForTimeout(900);
        const saves = s.calls.filter((c) => c.name === 'hr_outfit_set');
        if (saves.length !== 1 || saves[0].body.p_outfit !== 'ranger' || JSON.stringify(saves[0].body.p_colors) !== '{}' || saves[0].body.p_slot !== 0) fails.push('CW-4 Save sent ' + JSON.stringify(saves.map((c) => c.body)));
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
        const trade = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="skills-trade"] .hw-skill')).map((li) => li.textContent));
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
        for (const k of ['Damage', 'Hit chance', 'Critical chance', 'Defence', 'Dodge', 'Absorb', 'Ward', 'Speed', 'Total']) if (k in L) fails.push('CW-3 a stale sheet still draws ' + k + ' = ' + L[k]);
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
  ['the vitals no longer wrap under the identity', 'src/styles/character.css', '.hw-cs-vitals { flex: 1 1 260px; min-width: 0;', '.hw-cs-vitals { flex: none; grid-template-columns: auto auto !important;'],
  ['the damage is derived in the browser', 'src/shell/windows/character/sheet.js', "c && c.damage ? c.damage.min + '–' + c.damage.max : null", "c && c.damage ? '1–' + (Math.floor(c.defence * 0.35) + 2) : null"],
  ['the absorb is derived in the browser', 'src/shell/windows/character/sheet.js', "c && c.absorbPct !== null ? c.absorbPct + '% of each blow' : null", "c && c.absorbPct !== null ? Math.round(c.defence * 1.5) + '% of each blow' : null"],
  ['a stale sheet keeps the last numbers', 'src/session/character-sections.js', '    combat: s.fresh === true ? combatOf(s.combat) : null,', '    combat: (globalThis.__lc = s.fresh === true ? combatOf(s.combat) : (globalThis.__lc || null)),'],
  ['an absent stat draws a zero', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"mana\"]', hv.manaMax !== null ? whole(hv.manaMax) : null);", "line(root, '[data-vital=\"mana\"]', whole(hv.manaMax || 0));"],
  ['a wand reads (staff) again', 'src/data/item-uses.js', "  if (it.type === 'weapon') return WEAPON_WORD[roleWeaponOf(it)] || 'weapon';", "  if (it.type === 'weapon') return ({ magic: 'staff' })[it.weaponType] || WEAPON_WORD[it.weaponType] || 'weapon';"],
  ['a spellbook reads (offhand)', 'src/data/item-uses.js', "  if (it.slot === 'shield' && it.discipline) return 'spellbook';\n", ''],
  ['the HUD reads the hunt hero Level again (r09)', 'src/shell/widgets/vitals-hub.js', '  const level = v.level;', '  const level = hero && Number.isFinite(hero.level) ? hero.level : v.level;'],
  ['the tab reads the sheet section max HP again (r09)', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"hp\"]', hv.hpMax !== null ? whole(hv.hpMax) : null);", "line(root, '[data-vital=\"hp\"]', sh && sh.fresh !== undefined ? whole(cs.read('character_sheet').max_hp) : null);"],
  ['the tab reads the engine sheet max mana again (r09)', 'src/shell/windows/character/sheet.js', "line(root, '[data-vital=\"mana\"]', hv.manaMax !== null ? whole(hv.manaMax) : null);", "line(root, '[data-vital=\"mana\"]', c && c.role ? whole(cs.read('character_sheet').combat.max_mana) : hv.manaMax !== null ? whole(hv.manaMax) : null);"],
  ['a leech line the engine does not have', 'src/shell/windows/character/sheet.js', "const COMBAT = Object.freeze([['damage', 'Damage'],", "const COMBAT = Object.freeze([['leech', 'Life Leech'], ['damage', 'Damage'],"],
  ['the sheet is asked for every paint', 'src/shell/windows/character/index.js', "  if (!sh || sc.sheetAsking || v === null) return;\n  if (sc.opening !== 'due' && (sh.fresh || sc.sheetAsked === v)) return;", "  if (!sh) return;"],
  ['an opening never asks the engine', 'src/shell/windows/character/index.js', "if (sc.opening !== 'due' && (sh.fresh || sc.sheetAsked === v)) return;", "if (sh.fresh || sc.sheetAsked === v) return;"],
  ['the old sheet shows before the opening asked', 'src/shell/windows/character/index.js', "PORTRAIT_SCALE, []), sc.opening === 'done');", "PORTRAIT_SCALE, []), true);"],
  ['Save sends the outfit twice', 'src/shell/windows/character/outfit.js', "runIntent(sc, repaint, () => cs.saveOutfit(d.outfit, d.colors), 'Saving…',", "cs.saveOutfit(d.outfit, d.colors); runIntent(sc, repaint, () => cs.saveOutfit(d.outfit, d.colors), 'Saving…',"],
  ['the worn mark follows the draft', 'src/shell/windows/character/outfit.js', "cls(b, 'is-worn', !!o && o.worn === id);", "cls(b, 'is-worn', id === d.outfit);"],
  ['a premium outfit not owned can be saved', 'src/shell/windows/character/outfit.js', "sc.pending || !o || !owned || !changed(o, d)", "sc.pending || !o || !changed(o, d)"],
  ['the trade skills list the combat skills', 'src/shell/windows/skills.js', "export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);", "export const renderTradeSkills = skillsWindow([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Crafting']]);"],
  ['the unlock line drops the kind', 'src/data/item-uses.js', "  if (it.type === 'tool' && it.toolSkill) return it.toolSkill + ' tool';", "  if (it.type === 'tool' && it.toolSkill) return '';"],
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
  const clean = await cleanControl(() => checks(null, null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text.replace(from, to) }, null)), counts));
  }
  console.log(exitOf(counts) ? 'character-window --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'character-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
