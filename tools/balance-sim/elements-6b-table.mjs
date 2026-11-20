#!/usr/bin/env node
// tools/balance-sim/elements-6b-table.mjs — NECROTIC AND STORM, THE FOUR-SPELL SAMPLE, MEASURED ON THE REAL ENGINE
// (itemization plan Appendix B3 and §11 phase 6b; lane/d-elements-6b; DESIGN_STANDARDS §10: a sample, played and reviewed).
//
// The sample ships DARK (src/data/necrotic-storm.js NECROTIC_STORM.live false): this tool plays a planted copy of src/core, src/data and the
// edge settle with the switch on (tests/hunt-core/fixtures/h1.js plant), through the settle the world tick runs (cell.mjs), and leaves the
// tree untouched.
//
// WHAT IS COMPARED: each new spell against the same weapon's spells at its UNLOCK BAND, by adding it to the hero's bar and nothing else
// (paired: the same seeds, the same dice up to the first cast that differs). The hero is the PLAYED profile (played.mjs: the bar real
// players run, accessories on the kit) with every combat skill pinned at the band's level, every supply bought at the store (supply
// 'store': a rune spell buys its store rune of the tier its skill casts, so the gold column is the whole bill, new runes and old alike).
//   sword alone  Brand at Melee 25 (the Glade, Level 25); Reave at Melee 40 (the Warrens, Level 40), with Brand already on the bar
//   wand (Mage)  Updraft at Magic 25 (the Glade, Level 25); Blight at Magic 40 (the Warrens, Level 40), with Updraft already on the bar
//   a four       tank, healer, Mage, sword at the same two bands on Dangerous: the sword and the Mage take each band's new spells
// Updraft and Blight go right after Hoarfrost (the bar's spell of the same shape, on its "at least 2 under it" trigger). Brand and Reave
// STAND IN FOR a strike (abilities.js `replaces`, the designer's ruling 2 of 2026-11-20): they share Flame Strike's and Power Strike's
// cooldowns, so a slot after Flame Strike would only ever take Power Strike's turn. They go right after Turning Cut, AHEAD of Flame
// Strike: Brand in place of the family's best strike (the audit's change 3 budget), Reave on the turn Brand leaves.
//
// --neutral   the class layer off for the new two (src/data/monster-classes.js newElementLayer returns the profile as built), so every
//             monster is neutral to Necrotic and Storm: the designer's band is "on a neutral monster", and the living the two grounds
//             hold are 15% weak to Necrotic as built (Storm is neutral on both grounds either way)
// --styles sword,mage   the solo styles to run (both by default)
// --sword-after flame_strike   the sword's new slots after that ability instead (after Flame Strike they take Power Strike's turns: the
//             other bar a player can build, so the band is held by the better of the two)
//
// THE COLUMNS (per hero per hunting hour unless named): Level XP, the weapon skill's XP (Melee or Magic), damage dealt, each rune spell's
// SHARE of that damage, its casts, the mana it kept and the mana it gave back, drinks, store gold, deaths, the low-HP decile of an
// encounter (encMinHpPct p10).
//
//   node tools/balance-sim/elements-6b-table.mjs solo [--hours 2] [--seeds 3] [--neutral] [--styles sword]
//   node tools/balance-sim/elements-6b-table.mjs four [--hours 1] [--seeds 3] [--neutral]
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from './cell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const hours = Number(arg('hours', mode === 'solo' ? 2 : 1)), seeds = Number(arg('seeds', 3));

const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const NEUTRAL = process.argv.includes('--neutral');
const STYLES = arg('styles', 'sword,mage').split(',');

async function withSample(fn) {
  const edits = [['src/data/necrotic-storm.js', 'live: false,', 'live: true,'],
    ...(NEUTRAL ? [['src/data/monster-classes.js', '  if (!NECROTIC_STORM.live) return profile;\n', '  return profile;\n']] : [])];
  const p = plant(edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try { return await fn(await loadCellRunner(p.root)); } finally { p.done(); }
}

/* The store rune of the tier a skill level casts (versions at 1 / 15 / 30 / 45 / 60), the played bar's own rule. */
const TIERS = [[60, 'graven'], [45, 'carved'], [30, 'etched'], [15, 'scored'], [1, 'chalked']];
const tierAt = (lv) => TIERS.find(([l]) => lv >= l)[1];
const storeRune = (family, lv) => (tierAt(lv) === 'chalked' ? 'plain_' + family + '_rune' : 'plain_' + tierAt(lv) + '_' + family + '_rune');
const ownRunes = (family) => TIERS.map(([, t]) => t + '_' + family + '_rune').reverse();
const spell = (id, family, lv, conditions = []) => ({ id: 'p_' + id, join: 'and', conditions, action: { id, type: 'ability', own: ownRunes(family), store: storeRune(family, lv), onEmpty: 'store' } });
const AOE2 = [{ op: 'gte', value: 2, metric: 'enemies_in_aoe' }];

const BANDS = { 25: ['mosslight_glade', 25], 40: ['coppercap_warrens', 40] };
/* the new slots a band adds, by role: [after, [slots]] */
const NEW = {
  melee_dps: { 25: (lv) => [spell('brand', 'storm', lv)], 40: (lv) => [spell('brand', 'storm', lv), spell('reave', 'bone', lv)] },
  mage: { 25: (lv) => [spell('updraft', 'storm', lv, AOE2)], 40: (lv) => [spell('updraft', 'storm', lv, AOE2), spell('blight', 'bone', lv, AOE2)] },
};
const AFTER = { melee_dps: arg('sword-after', 'turning_cut'), mage: 'hoarfrost' };
/* the bar at a band: the played bar, plus `upto` of the band's new slots (0: none, the control) */
const adds = (role, band, upto) => (upto ? { [role]: { after: AFTER[role], slots: NEW[role][band](band).slice(0, upto) } } : null);

const RUNE_SPELLS = { melee_dps: ['flame_strike', 'brand', 'reave'], mage: ['fireball', 'hoarfrost', 'frost_lance', 'updraft', 'blight', 'arcane_barrier'] };
const pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
/* a spell's share of everything the hero dealt (dealtBy: the cell's damage by ability, the swing's 'basic' included) */
const share = (h, id) => { const all = Object.values(h.dealtBy || {}).reduce((a, n) => a + n, 0); return all ? ((100 * (h.dealtBy[id] || 0)) / all).toFixed(1) + '%' : '0%'; };
const skillOf = (role) => (role === 'mage' ? 'magic' : 'melee');

function row(label, h, role, base) {
  const sk = skillOf(role);
  const spells = RUNE_SPELLS[role].filter((id) => (h.castsPerH || {})[id]).map((id) => id + ' ' + share(h, id) + ' (' + h.castsPerH[id] + '/h, '
    + ((h.castManaPerH || {})[id] || 0) + ' mana' + ((h.manaBackPerH || {})[id] ? ', +' + h.manaBackPerH[id] + ' back' : '') + ')').join('; ');
  return [label, h.levelXpPerH, base ? pct(h.levelXpPerH, base.levelXpPerH) : '', (h.skillXpPerH || {})[sk] || 0, base ? pct((h.skillXpPerH || {})[sk] || 0, (base.skillXpPerH || {})[sk] || 0) : '',
    h.dealtPerH, +(h.drinksPerH.own + h.drinksPerH.store).toFixed(1), h.storePerH, h.deaths, h.encMinHpPct.p10, spells].join(' | ');
}

async function solo() {
  await withSample(async (R) => {
    console.log('ELEMENTS 6B SAMPLE, ALONE ON NORMAL: played profile, every combat skill at the band, supply store; ' + seeds + ' seeds x ' + hours + ' h a cell'
      + (NEUTRAL ? '; every monster neutral to Necrotic and Storm' : '; the class layer as built') + '; the sword\'s new slots after ' + AFTER.melee_dps);
    console.log('cell | Level XP/h | vs control | skill XP/h | vs control | dealt/h | drinks/h | store g/h | deaths | low HP p10 % | rune spells: share of damage (casts/h, mana kept/h, mana back/h)');
    for (const [style, role] of [['sword', 'melee_dps'], ['mage', 'mage']].filter(([s]) => STYLES.includes(s))) for (const band of [25, 40]) {
      const [ground, L] = BANDS[band];
      const skills = { melee: band, ranged: band, magic: band, defense: band };
      let base = null;
      for (const upto of band === 25 ? [0, 1] : [0, 1, 2]) {
        const cell = { id: ['e6b', style, band, upto].join(':'), ground, party: [style], level: L, hours, seeds, profile: 'played', supply: 'store',
          skillsBySeat: [skills], ...(upto ? { addSlots: adds(role, band, upto) } : {}) };
        const h = R.runCell(cell).heroes[0];
        const label = style + ' ' + ground.split('_')[1] + ' L' + L + ' skill ' + band + ': ' + (upto ? '+ ' + NEW[role][band](band).slice(0, upto).map((s) => s.action.id).join(' + ') : 'control (played bar)');
        console.log(row(label, h, role, base));
        if (!base) base = h;
      }
    }
  });
}

async function four() {
  await withSample(async (R) => {
    console.log('ELEMENTS 6B SAMPLE, A FOUR ON DANGEROUS: tank, healer, Mage, sword; played profile, skills at the band, supply store; ' + seeds + ' seeds x ' + hours + ' h a cell'
      + (NEUTRAL ? '; every monster neutral to Necrotic and Storm' : '; the class layer as built'));
    console.log('cell | Level XP/h a hero | vs control | deaths (all seats) | store g/h a hero | sword: ' + 'dealt/h, shares | Mage: dealt/h, shares');
    for (const band of [25, 40]) {
      const [ground, L] = BANDS[band];
      const skills = { melee: band, ranged: band, magic: band, defense: band };
      const party = ['tank', 'healer', 'mage', 'sword'];
      let base = null;
      for (const upto of band === 25 ? [0, 1] : [0, 2]) {
        const add = upto ? { ...adds('melee_dps', band, upto), ...adds('mage', band, upto) } : null;
        const cell = { id: ['e6b4', band, upto].join(':'), ground, party, level: L, hours, seeds, segmentH: 1, profile: 'played', supply: 'store',
          skillsBySeat: party.map(() => skills), options: { tier: 'dangerous' }, ...(add ? { addSlots: add } : {}) };
        let m;
        try { m = R.runCell(cell); } catch (e) { console.log(['band ' + band, 'ERROR ' + (e && e.stack || e)].join(' | ')); continue; }
        const xp = m.party.levelXpPerHeroPerH;
        const deaths = m.heroes.reduce((s, h) => s + h.deaths, 0), store = Math.round(m.heroes.reduce((s, h) => s + h.storePerH, 0) / m.heroes.length);
        const sw = m.heroes[3], mg = m.heroes[2];
        const shares = (h, role) => h.dealtPerH + ' (' + RUNE_SPELLS[role].filter((id) => (h.castsPerH || {})[id]).map((id) => id + ' ' + share(h, id)).join(', ') + ')';
        const label = ground.split('_')[1] + ' L' + L + ' skill ' + band + ': ' + (upto ? '+ ' + [...NEW.melee_dps[band](band), ...NEW.mage[band](band)].map((s) => s.action.id).join(' + ') : 'control');
        console.log([label, xp, base === null ? '' : pct(xp, base), deaths, store, shares(sw, 'melee_dps'), shares(mg, 'mage')].join(' | '));
        if (base === null) base = xp;
      }
    }
  });
}

if (mode === 'solo') await solo();
else if (mode === 'four') await four();
else console.log('usage: node tools/balance-sim/elements-6b-table.mjs solo|four [--hours N] [--seeds N]');
