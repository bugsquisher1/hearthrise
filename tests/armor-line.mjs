#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/armor-line.mjs — PAST DAWNSTEEL, A UNIQUE CARRIES THE ARMOR LINE AND ONE ATTRIBUTE, AND THE SAMPLE IS HIDDEN
// (designer, lane/d-armor-past-dawnsteel; PRIORITY_BOARD "2026-11-15 Armor past Dawnsteel"; Tyler 2026-11-14: "after tier 7
//  we start getting unique with the itemization and it goes away from being just standard upgrades", "Boss gear to mix and
//  match, rare drops from hunts").
//
//   AL1  THE BASE IS DAWNSTEEL: armor-line.js LINE_BASE names the generated tier-7 row of every slot and weight, with its armor.
//   AL2  HIDDEN: no src/ file imports armor-line.js, no sample id is an item, and no item carries a sample's name.
//   AL3  ON THE LINE, NEVER OVER IT: a sample row's armor is lineArmor(slot, weight, its Level). A row marked `underLine`
//        (a unique whose trade is armor) sits under it, never over.
//   AL4  THE LINE MOVES ARMOR ONLY: every other number is its Dawnsteel base's (slot, weight, tier, style bonuses and penalties);
//        its Level is its ground's floor; its book value is the base's times the line, so it never sells under its base.
//   AL5  ONE ATTRIBUTE, AT TIER 7's SIZE: exactly one, from src/data/special-attributes.js, on a slot it allows, a key it knows,
//        never an unproven one.
//   AL6  A HOME AND A USE: the source monster is placed on the ground named (an open or a staged pack), the band is Rare, a daily
//        kill or a trophy, a kill's chance is under 5%, no monster gives more than two armor slots, and the use is to be worn.
//   AL7  THE ELEMENT HAS A JOB THERE: a resistance names an element a monster on the same ground casts.
//   AL8  WORDS: the name and text use no banned filler word, no semicolon or em dash, and the first sentence carries the number.
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
import { ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { MONSTER_SPELLS } from '../src/data/monster-spells.js';
import { SPECIAL_ATTRIBUTES } from '../src/data/special-attributes.js';
import { LINE_BASE, LINE_SAMPLE, lineArmor, lineScale } from '../src/data/armor-line.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* the fields a sample row may differ from its base in: its words, the line's armor, Level and value, its rarity, its one attribute */
const OWN = new Set(['n', 'icon', 'defB', 'reqLv', 'v', 'rarity', 'resistPm', 'skillB']);
const ATTR_TIER = 7;
const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);

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
function attributesOf(row) {
  const out = [];
  for (const [k, v] of Object.entries(row.resistPm || {})) out.push({ field: 'resistPm', key: k, value: v });
  for (const [k, v] of Object.entries(row.skillB || {})) out.push({ field: 'skillB', key: k, value: v });
  return out;
}

/** Every broken rule, as strings. Empty = sound. */
export function problems(S = LINE_SAMPLE, B = LINE_BASE, A = SPECIAL_ATTRIBUTES, open = { importers: importers(), homes: homes() }) {
  const out = [];
  /* AL1 */
  for (const [cls, b] of Object.entries(B)) for (const [slot, id] of Object.entries(b.ids)) {
    const it = ITEMS[id];
    if (!it) { out.push('AL1 ' + cls + ' ' + slot + ': ' + id + ' is not an item'); continue; }
    if (it.tier !== 7 || it.armourClass !== cls || it.slot !== slot) out.push('AL1 ' + id + ' is not the tier-7 ' + cls + ' ' + slot + ' (tier ' + it.tier + ', ' + it.armourClass + ', ' + it.slot + ')');
    if (it.defB !== b.defB[slot]) out.push('AL1 ' + cls + ' ' + slot + ': the line says ' + b.defB[slot] + ' armor, ' + id + ' has ' + it.defB);
  }
  /* AL2 */
  for (const p of open.importers) out.push('AL2 ' + p.replace(ROOT, '') + ' imports armor-line.js: the sample is hidden until it is approved');
  const perMonster = new Map();
  for (const [id, s] of Object.entries(S)) {
    const row = s.row, base = ITEMS[s.base];
    if (ITEMS[id]) out.push('AL2 ' + id + ' is already an item a catalogue can serve');
    for (const [other, it] of Object.entries(ITEMS)) if (it && it.n === row.n) out.push('AL2 ' + id + ': ' + other + ' is already named ' + row.n);
    if (!base) { out.push('AL4 ' + id + ': base ' + s.base + ' is not an item'); continue; }
    /* AL3 */
    const want = lineArmor(row.slot, row.armourClass, row.reqLv);
    if (want === null) out.push('AL3 ' + id + ': no line for a ' + row.armourClass + ' ' + row.slot);
    else if (s.underLine ? !(row.defB < want) : row.defB !== want) out.push('AL3 ' + id + ': ' + row.defB + ' armor, the line at Level ' + row.reqLv + ' is ' + want + (s.underLine ? ' (marked under the line)' : ''));
    if (s.underLine && !String(s.underLine).trim()) out.push('AL3 ' + id + ': under the line with no reason');
    /* AL4 */
    if (B[row.armourClass] && B[row.armourClass].ids[row.slot] !== s.base) out.push('AL4 ' + id + ': its base is ' + s.base + ', the Dawnsteel ' + row.armourClass + ' ' + row.slot + ' is ' + (B[row.armourClass] || { ids: {} }).ids[row.slot]);
    for (const k of new Set([...Object.keys(base), ...Object.keys(row)])) {
      if (OWN.has(k)) continue;
      if (JSON.stringify(base[k]) !== JSON.stringify(row[k])) out.push('AL4 ' + id + '.' + k + ' = ' + JSON.stringify(row[k]) + ', its base ' + s.base + ' has ' + JSON.stringify(base[k]) + ': the line moves armor only');
    }
    const src = s.source || {}, g = HUNT_GROUNDS[src.ground], band = g && HUNT_INDEX[g.hunt] && HUNT_INDEX[g.hunt].band;
    if (band && row.reqLv !== band[0]) out.push('AL4 ' + id + ': worn from ' + row.reqLv + ', its ground ' + src.ground + ' opens at ' + band[0]);
    if (row.v !== round5(base.v * lineScale(row.reqLv))) out.push('AL4 ' + id + ': book ' + row.v + ', its base\'s times the line is ' + round5(base.v * lineScale(row.reqLv)));
    /* AL5 */
    const found = attributesOf(row), def = A[s.attr && s.attr[0]];
    if (found.length !== 1) out.push('AL5 ' + id + ' carries ' + found.length + ' attributes, a unique carries one');
    if (!def) out.push('AL5 ' + id + ': ' + (s.attr && s.attr[0]) + ' is not in the attribute catalogue');
    else if (found.length === 1) {
      const f = found[0];
      if (f.field !== def.field || f.key !== s.attr[1]) out.push('AL5 ' + id + ': the row carries ' + f.field + '.' + f.key + ', the sample says ' + def.field + '.' + s.attr[1]);
      if (def.keys && !def.keys.includes(f.key)) out.push('AL5 ' + id + ': ' + f.key + ' is not a key of ' + s.attr[0]);
      if ((def.unproven || []).includes(f.key)) out.push('AL5 ' + id + ': ' + f.key + ' is unproven');
      if (def.at[ATTR_TIER] === undefined || Math.abs(def.at[ATTR_TIER] - f.value) > 1e-9) out.push('AL5 ' + id + ': ' + f.value + ', the catalogue says ' + def.at[ATTR_TIER] + ' at tier ' + ATTR_TIER);
      if (!def.slots.includes(row.slot)) out.push('AL5 ' + id + ': ' + s.attr[0] + ' is not carried on the ' + row.slot + ' slot');
    }
    /* AL6 */
    const gs = open.homes.get(src.monster);
    if (!MONSTERS[src.monster]) out.push('AL6 ' + id + ': source ' + src.monster + ' is not a monster');
    else if (!gs || !gs.has(src.ground)) out.push('AL6 ' + id + ': ' + src.monster + ' is not placed on ' + src.ground);
    if (!['rare', 'trophy', 'daily'].includes(src.how)) out.push('AL6 ' + id + ': a unique drops in the Rare band, as a trophy or on a daily kill');
    if (src.how === 'rare' && !(src.ch > 0 && src.ch < 0.05)) out.push('AL6 ' + id + ': a Rare\'s chance a kill is over 0 and under 5% (got ' + src.ch + ')');
    if (s.use !== 'worn') out.push('AL6 ' + id + ': its use is to be worn');
    perMonster.set(src.monster, (perMonster.get(src.monster) || 0) + 1);
    /* AL7 */
    if (def && def.field === 'resistPm' && found.length === 1 && found[0].key !== 'physical' && !castOn(src.ground, open.homes).has(found[0].key)) {
      out.push('AL7 ' + id + ': ' + found[0].key + ' resistance on ' + src.ground + ', where nothing casts ' + found[0].key);
    }
    /* AL8 */
    if (BANNED.test(row.n) || BANNED.test(s.text)) out.push('AL8 ' + id + ': a banned filler word (DESIGN_STANDARDS §2)');
    if (/[;—]/.test(s.text)) out.push('AL8 ' + id + ': no semicolon or em dash in item text');
    if (!/\d/.test(String(s.text).split('. ')[0])) out.push('AL8 ' + id + ': the first sentence says what the piece does, with its number');
  }
  for (const [mon, n] of perMonster) if (n > 2) out.push('AL6 ' + mon + ' gives ' + n + ' armor slots, at most two a monster (loot redesign 10-23)');
  return out;
}

const MUTANTS = [
  ['the base drifts from Dawnsteel', 'AL1', (S, B) => { B.plate.defB.body = 91; }],
  ['an importer appears', 'AL2', (S, B, A, o) => { o.importers = ['/src/data/items.js']; }],
  ['a sample takes an item\'s name', 'AL2', (S) => { S.watchmans_helm.row.n = 'Dawnsteel Helm'; }],
  ['the plate sits over the line', 'AL3', (S) => { S.limewashed_plate.row.defB = 136; }],
  ['the shroud sits under the line unmarked', 'AL3', (S) => { S.paupers_shroud.row.defB = 30; }],
  ['the line carries a caster\'s damage up', 'AL4', (S) => { S.paupers_shroud.row.magicStrB = 54; }],
  ['the helm sheds its plate penalty', 'AL4', (S) => { delete S.watchmans_helm.row.magicAtkB; }],
  ['worn under its ground\'s floor', 'AL4', (S) => { S.haulers_jerkin.row.reqLv = 150; S.haulers_jerkin.row.defB = 68; }],
  ['a book under the base', 'AL4', (S) => { S.limewashed_leg_plates.row.v = 79200; }],
  ['a second attribute', 'AL5', (S) => { S.haulers_jerkin.row.skillB = { ranged: 3 }; }],
  ['the resistance at 20%', 'AL5', (S) => { S.watchmans_helm.row.resistPm = { frost: 200 }; }],
  ['physical resistance on a body', 'AL5', (S) => { S.limewashed_plate.row.resistPm = { physical: 30 }; S.limewashed_plate.attr = ['resist_physical', 'physical']; }],
  ['a home that is not there', 'AL6', (S) => { S.haulers_jerkin.source.monster = 'troll_picker'; }],
  ['a common drop', 'AL6', (S) => { S.paupers_shroud.source.ch = 0.08; }],
  ['three armor slots off one monster', 'AL6', (S) => { S.haulers_jerkin.source.monster = 'bone_wall'; }],
  ['fire resistance where nothing burns', 'AL7', (S) => { S.watchmans_helm.row.resistPm = { ember: 100 }; S.watchmans_helm.attr = ['resist_element', 'ember']; }],
  ['a banned word', 'AL8', (S) => { S.paupers_shroud.text = 'You take 10% less ice damage. Woven in the Void.'; }],
  ['text that leads with flavour', 'AL8', (S) => { S.haulers_jerkin.text = 'A coat stiff with lime. It helps with poison.'; }],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('armor-line --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant] of MUTANTS) {
    const S = structuredClone(LINE_SAMPLE), B = structuredClone(LINE_BASE), A = structuredClone(SPECIAL_ATTRIBUTES), o = { importers: importers(), homes: homes() };
    plant(S, B, A, o);
    const got = problems(S, B, A, o);
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
  console.log('armor-line: ' + Object.keys(LINE_SAMPLE).length + ' sample rows on the line past Dawnsteel, armor only, one attribute each, hidden, each with a home and a job on its ground');
}
