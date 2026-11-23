#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/content-checklist.mjs — WHAT ADDING ONE MOVE OR ONE WEAPON TAKES, TICKED FROM THE DATA (lane/content-pipeline, 2026-11-22).
//
//   node tools/content-checklist.mjs move <ability id>       e.g. move fireball, or a move not yet written
//   node tools/content-checklist.mjs weapon <discipline id>  e.g. weapon destruction (a weapon is its Roads country)
//
// docs/design/redesign/24-content-pipeline.md sections 3.6 and 3.7 are the tables; this prints them as a checklist for one id, with
// every step the data can answer ticked ([x] done, [ ] owed, [-] not this one's) and the rest left for the author (what it needs,
// the tool to run, the guard that holds it, the Lab run that proves it). Read-only: it never writes a file.
// Exit 0 printed · 2 usage.
// ════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const optional = async (p) => (existsSync(join(ROOT, p)) ? imp(p) : null);

/** Everything the checks read, loaded once. */
export async function load() {
  const A = await imp('src/data/abilities.js');
  const { ABILITY_ART, ABILITY_DIR } = await imp('src/data/item-art.js');
  const { HIT_FX } = await imp('src/data/hunt-vfx.js');
  const { ROLE_RULES } = await imp('src/data/rule-subjects.js');
  const { RUNE_FAMILIES } = await imp('src/data/runes.js');
  const { ROLE_KEYS } = await imp('src/data/hunt-roles.js');
  const { FAMILY_SKILL, DAMAGE_XP_FAMILIES } = await imp('src/data/skills.js');
  const { WEAPON_FAMILIES } = await imp('src/data/gear-tiers.js');
  const { PREP_TEXT } = await imp('src/data/text/prep.js');
  const talents = await optional('src/data/talents.js');
  const sigs = await optional('src/data/signatures.js');
  return {
    abilities: A.ABILITIES, disciplines: A.DISCIPLINES, art: ABILITY_ART, artDir: ABILITY_DIR, hitFx: HIT_FX, roleRules: ROLE_RULES,
    runeFamilies: RUNE_FAMILIES, roleKeys: ROLE_KEYS, familySkill: FAMILY_SKILL, damageXp: DAMAGE_XP_FAMILIES,
    weaponFamilies: WEAPON_FAMILIES, prep: PREP_TEXT,
    nodes: talents ? Object.values(talents.TALENT_NODES || {}) : null, signatures: sigs ? Object.values(sigs.SIGNATURES || {}) : null,
    fileExists: (rel) => existsSync(join(ROOT, rel)),
  };
}

const yes = (b) => (b === undefined ? '?' : b === null ? '-' : b ? 'x' : ' ');
const step = (what, done, how) => ({ what, done, how });

/** The steps for one move. `done` is true / false from the data, or undefined (the author's to judge). */
export function moveSteps(c, id) {
  const row = c.abilities[id];
  /* a default slot's id is 'd_' + the ability's (rule-subjects.js slot) */
  const roleSlots = Object.entries(c.roleRules).filter(([, slots]) => slots.some((s) => s.id === 'd_' + id)).map(([r]) => r);
  /* a rune's id ends in its family (runes.js runeId: <tier>_<family>_rune) */
  const fam = row && row.rune ? Object.keys(c.runeFamilies).find((f) => row.rune.endsWith('_' + f + '_rune')) || null : null;
  const mine = c.nodes ? c.nodes.filter((n) => n.move === id) : null;
  return [
    step('The row: src/data/abilities.js ABILITIES.' + id + ' (disciplines, lane, cdMs, mana, target, hitPm / healPm / shieldPm, base, versions, rune)', !!row,
      'the spell rule in the file header; one discipline names it or it is `universal`'),
    step('It is live (`active: true`)', row ? row.active === true : false, 'a move ships hidden until its Roads road and Signature exist (24 section 3.6)'),
    step('Its share fitted on the spell rule', undefined, 'Lab: node tools/balance-sim/staged/spell-audit.mjs (lands today\'s Level 60 worth; its base floor for the first hours)'),
    step('Its rune family exists' + (fam ? ' (' + fam + ')' : ''), row ? (row.rune ? !!fam && !!c.runeFamilies[fam] : null) : false, 'src/data/runes.js RUNE_FAMILIES; a new family is 3.10 of 24'),
    step('Its icon: src/data/item-art.js ABILITY_ART and ' + c.artDir + id + '.png', c.art.includes(id) && c.fileExists(c.artDir + id + '.png'),
      'tools/world-art/ability-tiles.mjs or PixelLab; guard tests/pixel-icons.mjs, tests/content-coherence.mjs CC-4'),
    step('Its hit effect: src/data/hunt-vfx.js HIT_FX.ability.' + id + ' (else the role\'s)', c.hitFx.ability[id] ? true : undefined, 'optional: the role\'s effect plays without it'),
    step('On an unedited bar: src/data/rule-subjects.js ROLE_RULES' + (roleSlots.length ? ' (' + roleSlots.join(', ') + ')' : ''), roleSlots.length ? true : undefined,
      'only if a style\'s default bar should hold it; a sidegrade uses `replaces`'),
    step('Server catalogue: node tools/gen-hunt-sessions.mjs (hr_hunt_abilities), and gen-catalogues.mjs if it spends a rune', undefined,
      'a staged migration (node tools/new-migration.mjs <slug>); lane C; edge deploy (the engine reads the row)'),
    step('Its road on the Roads: ' + 5 + ' rank stones, 2 crossroads of 3 options, 2 waystones, an open road and a final form (17 sections 2 and 4)',
      mine ? mine.filter((n) => n.kind === 'rank').length >= 5 && mine.filter((n) => n.kind === 'crossroads').length >= 2 : false,
      mine ? 'src/data/talents.js TALENT_NODES (24 section 4); guard content-coherence CC-5, CC-7' : 'owed: src/data/talents.js does not exist yet (Roads sample lane R-S)'),
    step('Its branches sized: best and worst option of a crossroads at most 3 steps apart on any ground; a waystone at most 3', undefined,
      'Lab: the dummy analyzer and the build library (17 section 9), every option fires on the dummy'),
    step('Its Signature: one row in src/data/signatures.js with `move: \'' + id + '\'` and one home (ground, monster or chest)', c.signatures ? c.signatures.some((s) => s.move === id) : false,
      c.signatures ? 'guard content-coherence CC-5, CC-6; 15 rules: never repeats a branch, works with every branch, 10 steps' : 'owed: src/data/signatures.js does not exist yet'),
    step('Every new effect on a stacking key (15 "Stacking keys") and every new status in src/data/statuses.js', undefined, 'a new key is a design call (STATUS_KEYS); a new status on the built effects is a row, a new kind of effect is engine code (24 section 5)'),
    step('Borrowable: its V0 measured and its border band (17 section 3, 18-roads-review-measured section 3)', undefined, 'Lab: tools/balance-program/redesign/roads/roads-run.mjs'),
    step('Its words: the row\'s `n`, its tooltip, in Tyler\'s voice, plain English, American spelling', row ? !!row.n : false, 'docs/DESIGN_STANDARDS.md'),
    step('Tests: node tests/content-coherence.mjs, node tests/pixel-icons.mjs, node tests/hunt-core/spell-rule.mjs, node tools/gen-hunt-sessions.mjs --check', undefined, 'run alone, with timeout'),
  ];
}

/** The steps for one weapon (a discipline: its Roads country). */
export function weaponSteps(c, id) {
  const d = c.disciplines[id];
  const fam = d && d.weapon ? c.weaponFamilies.find((w) => w.key === d.weapon) : null;
  const keys = Object.entries(c.roleKeys).filter(([, k]) => k.discipline === id).map(([k]) => k);
  const moves = Object.values(c.abilities).filter((a) => a.disciplines.includes(id));
  const country = c.nodes ? c.nodes.filter((n) => n.country === id) : null;
  const borders = c.nodes ? c.nodes.filter((n) => n.kind === 'border' && (n.countries || []).includes(id)) : null;
  return [
    step('Its line of weapons: src/data/gear-tiers.js WEAPON_FAMILIES' + (fam ? ' (' + fam.key + ')' : '') + ', or its own module with a `live` switch as src/data/fists.js',
      d ? (d.weapon ? !!fam : undefined) : false, 'every tier a row; items reach ITEMS through the line (guard tests/catalogue-coherence.mjs C1, C2, C8)'),
    step('Its discipline: src/data/abilities.js DISCIPLINES.' + id + ' (skill, native weapon)', !!d, 'one row; the borrowed blow reads `weapon` (src/core/borrow-blow.js)'),
    step('Its role keys: src/data/hunt-roles.js ROLE_KEYS' + (keys.length ? ' (' + keys.join(', ') + ')' : ''), keys.length > 0, 'each key: the roles it can play, its discipline'),
    step('Its skill: src/data/skills.js FAMILY_SKILL' + (fam ? ' (' + fam.weaponType + ')' : '') + ', and DAMAGE_XP_FAMILIES for a damage weapon',
      fam ? !!c.familySkill[fam.weaponType] && (c.familySkill[fam.weaponType] === 'magic' || c.damageXp.includes(fam.weaponType) || c.damageXp.includes(c.familySkill[fam.weaponType])) : undefined,
      'keyed by the weaponType its items carry'),
    step('Its moves: ' + (moves.length ? moves.map((m) => m.id).join(', ') : 'none yet') + ' (each: node tools/content-checklist.mjs move <id>)', moves.length > 0, '17 section 4: 1 to 6 moves a country'),
    step('Its default bar: src/data/rule-subjects.js ROLE_RULES for its role', undefined, 'only a new role needs a new set'),
    step('Its words: src/data/text/prep.js basic_weapon_' + id, !!c.prep['basic_weapon_' + id], 'the hunt prep line names the weapon'),
    step('Its hit effect: src/data/hunt-vfx.js HIT_FX.role for a new role', undefined, 'a role it shares plays that role\'s'),
    step('Its country on the Roads: its moves\' roads, 4 vows (+18 on a condition, -8 always), its first crossroads', country ? country.filter((n) => n.kind === 'vow').length >= 4 : false,
      country ? 'src/data/talents.js (24 section 4)' : 'owed: src/data/talents.js does not exist yet'),
    step('Its borders: one row per neighbor (town, hybrid crossroads, hybrid vow); a new country ADDS rows and never cuts one (17 section 6)', borders ? borders.length > 0 : false,
      'a border is a design call: which countries touch'),
    step('In the Lab: a style in tools/balance-program/progression-grid.mjs MAIN and a kit in grid-kit.mjs', undefined,
      'CODE today (24 gap G6): the Lab\'s styles are a hand list; v1-climb.mjs --styles takes the style once it is there'),
    step('Balanced: the build library (17 section 9: top 3 in some cell, top in under 25%), borrow pricing (18), the seat\'s comparison (22 section 4 for a support)', undefined,
      'Lab: v1-climb.mjs --styles with the new seat in the mixed four; tools/balance-sim/fist-table.mjs is the precedent'),
    step('Server: node tools/gen-hunt-sessions.mjs (hr_hunt_weapon_roles), node tools/gen-catalogues.mjs (its items)', undefined, 'staged migrations, lane C; edge deploy'),
    step('Traits and Signatures that serve its seat (22 section 7 is the precedent)', undefined, 'design; guard content-coherence CC-3, CC-6'),
  ];
}

export function render(kind, id, steps) {
  const lines = ['Adding ' + kind + ' `' + id + '` (docs/design/redesign/24-content-pipeline.md)', ''];
  for (const s of steps) lines.push('- [' + yes(s.done) + '] ' + s.what + '\n      ' + s.how);
  lines.push('', '[x] done  [ ] owed  [-] not this one\'s  [?] the author\'s to check (the data cannot say)');
  const counted = steps.filter((s) => s.done === true || s.done === false);
  lines.push('', counted.filter((s) => s.done).length + ' of ' + counted.length + ' steps the data can answer are done; ' + steps.filter((s) => s.done === undefined).length + ' are the author\'s to check');
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const [kind, id] = process.argv.slice(2);
  if (!['move', 'weapon'].includes(kind) || !id) { console.error('usage: node tools/content-checklist.mjs move|weapon <id>'); process.exit(2); }
  const c = await load();
  console.log(render(kind, id, kind === 'move' ? moveSteps(c, id) : weaponSteps(c, id)));
}
