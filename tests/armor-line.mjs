#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/armor-line.mjs — PAST DAWNSTEEL, A UNIQUE PIECE OF ARMOR SPENDS THE LINE'S BUDGET ITS OWN WAY, NEVER OVER IT, AND THE
// SAMPLE IS HIDDEN (designer, lane/d-armor-past-dawnsteel, re-done as a budget in lane/d-armor-line-v2; PRIORITY_BOARD
// "2026-11-16 The armor line past Dawnsteel, as a budget"; Tyler 2026-11-14 "after tier 7 we start getting unique with the
// itemization ... more like tibia", binding 2026-11-14/16: named pieces with their own stat mix, the lines are budgets).
//
//   AL1  THE BASE IS DAWNSTEEL: armor-line.js LINE_BASE names the generated tier-7 row of every slot and weight, with its armor.
//   AL2  HIDDEN: no src/ file imports armor-line.js, no sample id is an item, and no item or other staged sample has its name.
//   AL3  NEVER OVER THE LINE: on every late ground, worn by a hero of its Level (or the ground's floor, if higher) with the line
//        elsewhere, the mean of its pace and safety over the line's piece of its slot and weight is at most 1, and neither is more
//        than LINE_TRADE over (tools/balance-sim/armor-power.mjs, the engine's own rolls and armor chain).
//   AL4  A BUDGET, NOT A TEMPLATE: each piece wins somewhere (on a ground its Level is sent to, worn in fully tempered Dawnsteel, it
//        beats the tempered Dawnsteel piece of its slot and every other piece of its slot and weight a hero of its Level can wear),
//        and a piece under its weight's first Level wins on its own ground (once that ground is built: a planned place has no
//        monsters to read, so until then the first clause is the whole rule). A piece with the line's own armor and its base's style
//        numbers (an attribute on top or not) is a template, not a unique: the first sample's twins.
//   AL5  THE ROW: every field but its words, numbers, Level, book and rarity is its Dawnsteel base's; it is worn from its home's
//        floor (staged/morrow-grid.js homeOf); its book is the base's times the line; a caster's damage (magicStrB, rangeStrB) is never
//        over its base's, so the line can't re-open the Mage gap (lane/d-mage-110).
//   AL6  AT MOST ONE ATTRIBUTE, AT TIER 7's SIZE: from special-attributes.js, on a slot it allows, a key it knows, on the field the
//        catalogue names for that key (a + skill is the engine's `<skill>Plus`, the designer 2026-11-18 row 1c), one the engine reads
//        today (no hook owed), so the measure sees what the player gets.
//   AL7  A HOME AND A USE: the source monster is placed on the ground named, the band is Rare, a daily kill or a trophy, a kill's
//        chance is under 5%, no monster gives more than two armor slots, and the use is to be worn. A Morrow piece sits on its place's
//        armor cell on the region grid (the designer 2026-11-18 row 1b: "the grid wins"); on a place not built yet it says `planned`
//        and names no monster, and the day the place is built it must name one.
//   AL8  THE ELEMENT HAS A JOB THERE: a resistance names an element a monster on its own ground casts (a boss's: the ground it is
//        called from), so a piece on a ground not built yet carries none.
//   AL9  WORDS: no banned filler word, no semicolon or em dash, the first sentence carries a number.
//   AL10 THE FIRST LEVEL IS MEASURED: LINE_FIRST_LEVEL is what armor-power.mjs firstLevel measures for each weight, and the anchor is 110.
//
//   node tests/armor-line.mjs            the guard
//   node tests/armor-line.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy of the sample (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ITEMS, MONSTERS, AWAITING_ROSTER } from '../src/data/catalogue-coherence.js';
import { HEARTH_CHEST_KEYS } from '../src/data/chests.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { MONSTER_SPELLS } from '../src/data/monster-spells.js';
import { SPECIAL_ATTRIBUTES, SPECIAL_SAMPLE } from '../src/data/special-attributes.js';
import { SKILL_PLUS_FIELDS } from '../src/core/combat.js';
import { WEAPON_SAMPLE } from '../tools/balance-sim/staged/weapon-line.js';
import * as LINE from '../tools/balance-sim/staged/armor-line.js';
import { MORROW_GRID, homeOf } from '../tools/balance-sim/staged/morrow-grid.js';
import { armorPower, loadArmorPower } from '../tools/balance-sim/armor-power.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* the fields a sample row may differ from its base in: its words, its numbers, Level, value, rarity and its one attribute (a + skill on the
   engine's own field, row 1c) */
const OWN = new Set(['n', 'icon', 'v', 'reqLv', 'rarity', 'defB', 'atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'critB', 'resistPm', ...Object.values(SKILL_PLUS_FIELDS)]);
/* the item field attribute `def` writes for `key`: its one field, or the one its key names */
const fieldOf = (def, key) => (typeof def.field === 'string' ? def.field : (def.field || {})[key]);
const CASTER_DAMAGE = ['magicStrB', 'rangeStrB'];
const ATTR_TIER = 7;
/* a piece's style numbers: what it does to the hero's own blow */
const STYLE = Object.freeze(['atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'critB']);
const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

function srcFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) srcFiles(p, out); else if (/\.(js|mjs|ts|html)$/.test(f)) out.push(p);
  }
  return out;
}
const importers = () => srcFiles(join(ROOT, 'src')).filter((p) => !p.endsWith('armor-line.js') && /armor-line\.js/.test(readFileSync(p, 'utf8')));
/* every monster a ground places (packs, spawns, adds), open or staged: Map monster -> Set of grounds */
function homes() {
  const m = new Map();
  for (const [gid, g] of Object.entries(HUNT_GROUNDS)) for (const p of g.pockets || []) for (const s of [...(p.spawns || []), ...(p.pack || []), ...(p.adds || [])]) {
    if (!m.has(s.monster)) m.set(s.monster, new Set());
    m.get(s.monster).add(gid);
  }
  return m;
}
/* the elements cast on a ground: every spell of every monster it places */
function castOn(gid, H) {
  const out = new Set();
  for (const [mon, gs] of H) if (gs.has(gid)) for (const sp of (MONSTERS[mon] && MONSTERS[mon].spells) || []) { const row = MONSTER_SPELLS[sp]; if (row && row.element) out.add(row.element); }
  return out;
}
/* the special attributes a row carries (resistances and + skills) */
function attributesOf(row) {
  const out = [];
  for (const [k, v] of Object.entries(row.resistPm || {})) out.push({ field: 'resistPm', key: k, value: v });
  for (const [k, f] of Object.entries(SKILL_PLUS_FIELDS)) if (row[f] !== undefined) out.push({ field: f, key: k, value: row[f] });
  return out;
}
/* the shipped pieces a hero can wear past Dawnsteel, by slot and weight: tier 7 or more, not Dawnsteel itself, not awaiting a roster */
const awaiting = new Set(AWAITING_ROSTER);
/* every Hearth Chest armor piece (chests.js HEARTH_CHEST_KEYS: the Catacomb keys' helmets and boots) */
const CHEST_ARMOR = new Set(HEARTH_CHEST_KEYS.flatMap((k) => Object.values(k.armor || {})));
const { mods: MODS } = await loadArmorPower(ROOT);

/** Every broken rule, as strings. Empty = sound. `open`: what importers() and homes() answer, the region grid (`grid`) and the monsters the
    grid's bosses are looked up in (`monsters`; a mutant plants one). */
export function problems(line = LINE, A = SPECIAL_ATTRIBUTES, open = {}) {
  open = { importers: importers(), homes: homes(), grid: MORROW_GRID, ...open };
  const out = [];
  const S = line.LINE_SAMPLE, B = line.LINE_BASE;
  const homeFor = (src) => homeOf(src, { HUNT_GROUNDS, HUNT_INDEX, MONSTERS: open.monsters || MONSTERS }, open.grid);
  /* AL1 */
  for (const [cls, b] of Object.entries(B)) for (const [slot, id] of Object.entries(b.ids)) {
    const it = ITEMS[id];
    if (!it) { out.push('AL1 ' + cls + ' ' + slot + ': ' + id + ' is not an item'); continue; }
    if (it.tier !== 7 || it.armourClass !== cls || it.slot !== slot) out.push('AL1 ' + id + ' is not the tier-7 ' + cls + ' ' + slot + ' (tier ' + it.tier + ', ' + it.armourClass + ', ' + it.slot + ')');
    if (it.defB !== b.defB[slot]) out.push('AL1 ' + cls + ' ' + slot + ': the line says ' + b.defB[slot] + ' armor, ' + id + ' has ' + it.defB);
  }
  /* AL2 */
  for (const p of open.importers) out.push('AL2 ' + p.replace(ROOT, '') + ' imports armor-line.js: the sample is hidden until it is approved');
  const otherNames = new Map([...Object.entries(WEAPON_SAMPLE), ...Object.entries(SPECIAL_SAMPLE)].map(([id, s]) => [s.row.n, id]));
  const P = armorPower({ ...MODS, line });
  const G = P.lateGrounds();
  if (G.length < 2) out.push('AL3 the line answers to ' + G.length + ' late ground(s): the measure has nothing to hold it to');
  /* AL10 */
  if (line.LINE_ANCHOR_LEVEL !== 110) out.push('AL10 the anchor is ' + line.LINE_ANCHOR_LEVEL + ', Tyler\'s slope is x Level / 110 (and the Tempering bands key on 110)');
  for (const w of Object.keys(B)) {
    const f = P.firstLevel(w, G);
    if (f !== (line.LINE_FIRST_LEVEL || {})[w]) out.push('AL10 ' + w + ': LINE_FIRST_LEVEL says ' + (line.LINE_FIRST_LEVEL || {})[w] + ', the measure says ' + f);
  }
  const perMonster = new Map();
  for (const [id, s] of Object.entries(S)) {
    const row = s.row, base = ITEMS[s.base];
    if (ITEMS[id]) out.push('AL2 ' + id + ' is already an item a catalogue can serve');
    for (const [other, it] of Object.entries(ITEMS)) if (it && it.n === row.n) out.push('AL2 ' + id + ': ' + other + ' is already named ' + row.n);
    if (otherNames.has(row.n)) out.push('AL2 ' + id + ': the staged ' + otherNames.get(row.n) + ' is already named ' + row.n);
    if (!base) { out.push('AL5 ' + id + ': base ' + s.base + ' is not an item'); continue; }
    if (!B[row.armourClass] || B[row.armourClass].ids[row.slot] !== s.base) out.push('AL5 ' + id + ': its base is ' + s.base + ', the Dawnsteel ' + row.armourClass + ' ' + row.slot + ' is ' + ((B[row.armourClass] || { ids: {} }).ids[row.slot]));
    /* AL3 */
    const ln = P.againstLine(row, row.reqLv, G);
    for (const r of ln) {
      if (r.score === undefined) { out.push('AL3 ' + id + ': no measure on ' + r.ground); continue; }
      if (r.score > 1 + 1e-9) out.push('AL3 ' + id + ': ' + (r.score * 100).toFixed(2) + '% of the line on ' + r.ground + ' at Level ' + r.L + ' (pace ' + r.pace.toFixed(4) + ', safety ' + r.safety.toFixed(4) + ')');
      if (r.pace > 1 + line.LINE_TRADE + 1e-9 || r.safety > 1 + line.LINE_TRADE + 1e-9) out.push('AL3 ' + id + ': past the trade on ' + r.ground + ' (pace ' + r.pace.toFixed(4) + ', safety ' + r.safety.toFixed(4) + ', at most ' + (1 + line.LINE_TRADE) + ')');
    }
    /* AL4: a template is the line's own numbers: the line's armor and every style number its base's (an attribute or not on top) */
    if (row.defB === line.lineArmor(row.slot, row.armourClass, row.reqLv) && STYLE.every((k) => (Number(row[k]) || 0) === (Number(base[k]) || 0))) out.push('AL4 ' + id + ': the line\'s own armor and its base\'s numbers, a template and not a unique');
    /* AL5 */
    for (const k of new Set([...Object.keys(base), ...Object.keys(row)])) {
      if (OWN.has(k)) continue;
      if (JSON.stringify(base[k]) !== JSON.stringify(row[k])) out.push('AL5 ' + id + '.' + k + ' = ' + JSON.stringify(row[k]) + ', its base ' + s.base + ' has ' + JSON.stringify(base[k]));
    }
    for (const k of CASTER_DAMAGE) if ((Number(row[k]) || 0) > (Number(base[k]) || 0)) out.push('AL5 ' + id + '.' + k + ' = ' + row[k] + ' over its base\'s ' + (base[k] || 0) + ': a caster\'s damage never climbs with the line (the Mage gap)');
    const src = s.source || {}, home = homeFor(src);
    if (home.floor === null) out.push('AL5 ' + id + ': ' + (src.place || src.ground) + ' has no band');
    else if (row.reqLv !== home.floor) out.push('AL5 ' + id + ': worn from ' + row.reqLv + ', its home ' + (src.place || src.ground) + ' opens at ' + home.floor);
    if (!(row.reqLv > line.LINE_ANCHOR_LEVEL)) out.push('AL5 ' + id + ': worn from ' + row.reqLv + ', the line starts past ' + line.LINE_ANCHOR_LEVEL);
    if (row.v !== round5(base.v * line.lineScale(row.reqLv))) out.push('AL5 ' + id + ': book ' + row.v + ', its base\'s times the line is ' + round5(base.v * line.lineScale(row.reqLv)));
    /* AL6 */
    const found = attributesOf(row), def = s.attr ? A[s.attr[0]] : null;
    if (found.length > 1) out.push('AL6 ' + id + ' carries ' + found.length + ' attributes, a unique carries at most one');
    if (!s.attr && found.length) out.push('AL6 ' + id + ' carries ' + found[0].field + '.' + found[0].key + ' and names no attribute');
    if (s.attr && !def) out.push('AL6 ' + id + ': ' + s.attr[0] + ' is not in the attribute catalogue');
    else if (def && found.length !== 1) out.push('AL6 ' + id + ': names ' + s.attr[0] + ' and carries ' + found.length);
    else if (def) {
      const f = found[0];
      if (f.field !== fieldOf(def, s.attr[1]) || f.key !== s.attr[1]) out.push('AL6 ' + id + ': the row carries ' + f.field + '.' + f.key + ', the sample says ' + fieldOf(def, s.attr[1]) + '.' + s.attr[1]);
      if (def.keys && !def.keys.includes(f.key)) out.push('AL6 ' + id + ': ' + f.key + ' is not a key of ' + s.attr[0]);
      if ((def.unproven || []).includes(f.key)) out.push('AL6 ' + id + ': ' + f.key + ' is unproven');
      if (def.hook) out.push('AL6 ' + id + ': ' + s.attr[0] + ' waits on an engine hook (' + def.hook + '), so it would play as nothing');
      if (def.at[ATTR_TIER] === undefined || Math.abs(def.at[ATTR_TIER] - f.value) > 1e-9) out.push('AL6 ' + id + ': ' + f.value + ', the catalogue says ' + def.at[ATTR_TIER] + ' at tier ' + ATTR_TIER);
      if (!def.slots.includes(row.slot)) out.push('AL6 ' + id + ': ' + s.attr[0] + ' is not carried on the ' + row.slot + ' slot');
    }
    /* AL7: the home, and the grid cell */
    for (const p of home.problems) out.push('AL7 ' + id + ': ' + p);
    if (!home.planned) {
      const gs = open.homes.get(src.monster);
      if (!MONSTERS[src.monster]) out.push('AL7 ' + id + ': source ' + src.monster + ' is not a monster');
      else if (!gs || !gs.has(src.ground)) out.push('AL7 ' + id + ': ' + src.monster + ' is not placed on ' + src.ground);
      if (src.how === 'rare' && !(src.ch > 0 && src.ch < 0.05)) out.push('AL7 ' + id + ': a Rare\'s chance a kill is over 0 and under 5% (got ' + src.ch + ')');
    }
    const cell = row.slot + ':' + row.armourClass;
    if (home.place && !(home.place.armor || []).includes(cell)) out.push('AL7 ' + id + ': ' + cell + ' on ' + src.place + ', whose grid cells are ' + (home.place.armor || []).join(', ') + ' (the grid wins)');
    if (!['rare', 'trophy', 'daily'].includes(src.how)) out.push('AL7 ' + id + ': a unique drops in the Rare band, as a trophy or on a daily kill');
    if (s.use !== 'worn') out.push('AL7 ' + id + ': its use is to be worn');
    if (src.monster) perMonster.set(src.monster, (perMonster.get(src.monster) || 0) + 1);
    /* AL8: the element is cast on the built ground it drops on (a boss's: the one it is called from) */
    for (const f of found) if (f.field === 'resistPm' && f.key !== 'physical' && !(home.ground && castOn(home.ground, open.homes).has(f.key))) out.push('AL8 ' + id + ': ' + f.key + ' resistance on ' + (home.ground || (src.place + ' (not built)')) + ', where nothing casts ' + f.key);
    /* AL9 */
    if (BANNED.test(row.n) || BANNED.test(s.text)) out.push('AL9 ' + id + ': a banned filler word (DESIGN_STANDARDS §2)');
    if (/[;—]/.test(s.text)) out.push('AL9 ' + id + ': no semicolon or em dash in item text');
    if (!/\d/.test(String(s.text).split('. ')[0])) out.push('AL9 ' + id + ': the first sentence says what the piece does, with its number');
  }
  for (const [mon, n] of perMonster) if (n > 2) out.push('AL7 ' + mon + ' gives ' + n + ' armor slots, at most two a monster (loot redesign 10-23)');
  /* AL4: each wins somewhere, at its own Level, on a ground that Level is sent to, worn in fully tempered Dawnsteel, against the tempered
     Dawnsteel piece of its slot (1.000) and every other piece of its slot and weight a hero of its Level can wear (the sample's and the
     shipped tier-7+ rows past Dawnsteel) */
  const ids = Object.keys(S).filter((id) => ITEMS[S[id].base]);
  /* a Hearth Chest piece is no rival: the chest's pieces are the all-rounders and a unique is best in its own case (plan §3, the sidegrade rule),
     and the grade wears ground and boss drops only (the designer 2026-11-18 row 1f). WL4 never read the Tower's weapons either. Without this the
     Catacombs' Platinum Vault-Cutter's Helm (Dawnsteel's helm + 3 Melee, a chest piece) out-won the Watchman's Helm (set/v0.2.141) */
  const shipped = Object.entries(ITEMS).filter(([iid, it]) => it && it.type === 'armor' && B[it.armourClass] && Number(it.tier) >= 7 && !awaiting.has(iid)
    && !CHEST_ARMOR.has(iid) && !Object.values(B).some((b) => Object.values(b.ids).includes(iid)));
  for (const id of ids) {
    const s = S[id], R = s.row.reqLv, H = P.huntedAt(R, G);
    const rivals = ids.filter((o) => o !== id && S[o].row.slot === s.row.slot && S[o].row.armourClass === s.row.armourClass && S[o].row.reqLv <= R).map((o) => S[o].row)
      .concat(shipped.filter(([, it]) => it.slot === s.row.slot && it.armourClass === s.row.armourClass && (Number(it.reqLv) || 1) <= R).map(([, it]) => it));
    const wins = H.filter((g) => { const p = P.scoreOnDawn(s.row, g, R); return p > 1 + 1e-9 && rivals.every((r) => p > P.scoreOnDawn(r, g, R)); });
    if (!wins.length) out.push('AL4 ' + id + ': at Level ' + R + ' it wins on no ground that Level is sent to (' + H.join(', ') + ') against tempered Dawnsteel' + (rivals.length ? ' and ' + rivals.map((r) => r.n).join(', ') : ''));
    const first = (line.LINE_FIRST_LEVEL || {})[s.row.armourClass], own = homeFor(s.source).ground;
    if (wins.length && first && R < first && own && !wins.includes(own)) out.push('AL4 ' + id + ': worn from ' + R + ', under ' + s.row.armourClass + '\'s first Level ' + first + ', it must win on its own ground ' + own + ' (wins on ' + wins.join(', ') + ')');
  }
  return out;
}

/* a copy of the line module with its tables swapped for copies a mutant may edit (lineArmor reads the copied base) */
function lineCopy() {
  const LINE_BASE = structuredClone(LINE.LINE_BASE), LINE_SAMPLE = structuredClone(LINE.LINE_SAMPLE), LINE_FIRST_LEVEL = { ...LINE.LINE_FIRST_LEVEL };
  const c = { ...LINE, LINE_BASE, LINE_SAMPLE, LINE_FIRST_LEVEL };
  c.lineArmor = (slot, cls, reqLv) => { const b = c.LINE_BASE[cls]; return b && own(b.defB, slot) ? Math.round(b.defB[slot] * c.lineScale(reqLv)) : null; };
  return c;
}

const MUTANTS = [
  ['the base drifts from Dawnsteel', 'AL1', (L) => { L.LINE_BASE.plate.defB.body = 91; }],
  ['an importer appears', 'AL2', (L, A, o) => { o.importers = ['/src/data/items.js']; }],
  ['a sample takes an item\'s name', 'AL2', (L) => { L.LINE_SAMPLE.watchmans_helm.row.n = 'Dawnsteel Helm'; }],
  ['a sample takes the weapon line\'s name', 'AL2', (L) => { L.LINE_SAMPLE.watchmans_helm.row.n = 'Watchman\'s Sword'; }],
  ['the heavy helm sheds its Melee cost (safety over, pace even)', 'AL3', (L) => { delete L.LINE_SAMPLE.watchmans_helm.row.atkB; }],
  ['poison at the line\'s armor (the first sample\'s twin)', 'AL3', (L) => { L.LINE_SAMPLE.limewashed_plate.row.defB = 135; }],
  ['fire resistance at the line\'s armor (over on the capped Ox Road)', 'AL3', (L) => { const r = L.LINE_SAMPLE.burnt_crag_leg_plates.row; r.defB = 73; delete r.strB; }],
  ['a jerkin far past the trade (dodge for a bow that hits much lighter)', 'AL3', (L) => { const r = L.LINE_SAMPLE.haulers_jerkin.row; r.defB = 200; r.rangeStrB = -15; }],
  ['the line read at a lower Level (the scale lies)', 'AL3', (L) => { L.lineScale = () => 1; }],
  ['the Visor re-sized by the ratio alone, 71 (1.0005 of the line at the Catacombs)', 'AL3', (L) => { L.LINE_SAMPLE.outriders_visor.row.defB = 71; }],
  ['a template: the line\'s own armor, Dawnsteel\'s numbers', 'AL4', (L) => { const r = L.LINE_SAMPLE.limewashed_plate.row; r.defB = 135; delete r.atkB; }],
  ['the Visor under tempered Dawnsteel everywhere', 'AL4', (L) => { L.LINE_SAMPLE.outriders_visor.row.defB = 40; }],
  ['a second Vaults helm out-wins the Watchman\'s everywhere', 'AL4', (L) => { L.LINE_SAMPLE.rival_helm = { ...structuredClone(L.LINE_SAMPLE.watchmans_helm), row: { ...L.LINE_SAMPLE.watchmans_helm.row, n: 'Rival Helm', defB: 85 } }; L.LINE_SAMPLE.rival_helm.source = { ...L.LINE_SAMPLE.rival_helm.source, monster: 'bone_wall' }; }],
  /* the Leg Plates at 125 (under plate's 129) win on the Roost alone (1.004 measured): dropped on the Ox Road, they win only off their own ground */
  ['a plate piece under its first Level wins only off its own ground', 'AL4', (L) => { L.LINE_SAMPLE.burnt_crag_leg_plates.source = { monster: 'dead_teamster', ground: 'ox_road', how: 'rare', ch: 0.002 }; }],
  ['the jerkin changes weight', 'AL5', (L) => { L.LINE_SAMPLE.haulers_jerkin.row.armourClass = 'plate'; }],
  ['worn under its ground\'s floor', 'AL5', (L) => { L.LINE_SAMPLE.haulers_jerkin.row.reqLv = 150; }],
  ['the Breastplate kept at the Roost\'s 125 on the Night Shift (122)', 'AL5', (L) => { L.LINE_SAMPLE.wagon_guards_breastplate.row.reqLv = 125; }],
  ['a book under the base', 'AL5', (L) => { L.LINE_SAMPLE.limewashed_plate.row.v = 108000; }],
  ['the shroud carries a caster\'s damage up (the old red)', 'AL5', (L) => { L.LINE_SAMPLE.paupers_shroud.row.magicStrB = 36; }],
  ['a second attribute', 'AL6', (L) => { L.LINE_SAMPLE.keepers_leg_plates.row.rangedPlus = 3; }],
  ['the resistance at 20%', 'AL6', (L) => { L.LINE_SAMPLE.keepers_leg_plates.row.resistPm = { frost: 200 }; }],
  /* every attribute is hooked since row 1c (+ skill on the engine's `<skill>Plus`), so a hook still owed is planted on the catalogue's copy */
  ['an attribute the engine doesn\'t read yet', 'AL6', (L, A) => { A.skill.hook = 'owed'; L.LINE_SAMPLE.haulers_jerkin.row.rangedPlus = 3; L.LINE_SAMPLE.haulers_jerkin.attr = ['skill', 'ranged']; }],
  ['+ Ranged on `skillB`, the field nothing reads (the catalogue\'s until 11-18)', 'AL6', (L) => { L.LINE_SAMPLE.haulers_jerkin.row.skillB = { ranged: 3 }; L.LINE_SAMPLE.haulers_jerkin.attr = ['skill', 'ranged']; }],
  ['a + Defense helm (one point out-guards the next tier\'s helm)', 'AL6', (L) => { L.LINE_SAMPLE.watchmans_helm.row.defensePlus = 1; L.LINE_SAMPLE.watchmans_helm.attr = ['defense', 'defense']; }],
  ['an unnamed attribute', 'AL6', (L) => { L.LINE_SAMPLE.watchmans_helm.row.resistPm = { frost: 100 }; }],
  ['a home that is not there', 'AL7', (L) => { L.LINE_SAMPLE.haulers_jerkin.source.monster = 'troll_picker'; }],
  ['a common drop', 'AL7', (L) => { L.LINE_SAMPLE.paupers_shroud.source.ch = 0.08; }],
  ['three armor slots off one monster', 'AL7', (L) => { L.LINE_SAMPLE.haulers_jerkin.source.monster = 'shrouded_pauper'; L.LINE_SAMPLE.haulers_jerkin.source.ch = 0.0007; }],
  /* row 1b: the grid wins */
  ['the Breastplate back on the Roost (boots plate, legs plate, helmet cloth: the 11-16 placement)', 'AL7', (L) => { L.LINE_SAMPLE.wagon_guards_breastplate.source = { place: 'wyvern_roost', monster: 'brood_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0093 }; }],
  /* row 2: the legs cells swapped, so the plate legs are the Roost's and the Roost Mother's are leather */
  ['the Leg Plates on the Roost Mother again (her legs cell is leather since row 2)', 'AL7', (L) => { L.LINE_SAMPLE.burnt_crag_leg_plates.source = { place: 'roost_mother', planned: true, how: 'rare' }; }],
  ['a piece on a place not built names a monster as if it were', 'AL7', (L) => { L.LINE_SAMPLE.outriders_visor.source = { place: 'old_guard', planned: true, monster: 'ledge_wyvern', how: 'rare' }; }],
  /* her one cell a sample could fill is legs leather: a leather piece planted there, then the Roost Mother made a monster */
  ['the Roost Mother is built and a piece of hers still says planned', 'AL7', (L, A, o) => {
    const s = L.LINE_SAMPLE.haulers_jerkin; s.row = { ...s.row, slot: 'pants', reqLv: 125 }; s.source = { place: 'roost_mother', planned: true, how: 'rare' };
    o.monsters = { ...MONSTERS, roost_mother: { ...MONSTERS.brood_wyvern, boss: true } }; }],
  ['frost resistance where nothing casts ice', 'AL8', (L) => { const s = L.LINE_SAMPLE.burnt_crag_leg_plates; s.row.resistPm = { frost: 100 }; s.attr = ['resist_element', 'frost']; }],
  ['a resistance on a place not built (no spells to read)', 'AL8', (L) => { const s = L.LINE_SAMPLE.outriders_visor; s.row.resistPm = { ember: 100 }; s.attr = ['resist_element', 'ember']; }],
  ['a banned word', 'AL9', (L) => { L.LINE_SAMPLE.paupers_shroud.text = 'You take 10% less ice damage. Woven in the Void.'; }],
  ['text that leads with flavour', 'AL9', (L) => { L.LINE_SAMPLE.haulers_jerkin.text = 'A coat stiff with lime. It helps with poison.'; }],
  ['the first Level written, not measured', 'AL10', (L) => { L.LINE_FIRST_LEVEL.plate = 110; }],
  ['the anchor moved', 'AL10', (L) => { L.LINE_ANCHOR_LEVEL = 102; }],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('armor-line --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant] of MUTANTS) {
    const L = lineCopy(), A = structuredClone(SPECIAL_ATTRIBUTES), o = { importers: importers(), homes: homes() };
    plant(L, A, o);
    const got = problems(L, A, o);
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'armor-line --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'armor-line --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems();
  if (bad.length) { console.error('armor-line: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('armor-line: ' + Object.keys(LINE.LINE_SAMPLE).length + ' sample pieces under the line past Dawnsteel on every late ground, each winning somewhere, no template, at most one attribute each, '
    + 'on its grid cell (' + Object.values(LINE.LINE_SAMPLE).filter((s) => s.source && s.source.planned).length + ' on a place not built yet), hidden, the first Levels measured');
}
