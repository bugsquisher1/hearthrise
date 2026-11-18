#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catacomb-armor.mjs — THE CATACOMBS' 24 HELMETS AND BOOTS ARE THEIR STANDARD TWINS PLUS ONE ATTRIBUTE, AND THEY ARE HIDDEN
// (designer, lane/d-catacomb-armor; PRIORITY_BOARD "2026-11-16 The Unmarked Catacombs descent" §6; Tyler 2026-11-16: armor
//  "instead of weapons", Bone Keys lean helmets, Waterlogged Keys lean boots, a special attribute each, tiered close to the grounds).
//
//   CA1  SHIPPED AS RULED (lane/c-catacombs, 2026-11-18; it read HIDDEN until the Catacomb keys were built): only the shipping files import
//        src/data/catacomb-armor.js (items.js, item-descriptions.js, chests.js); the rows of CATACOMB_ARMOR_NOW's tiers are items, each exactly
//        its generated row, and every other row is no item (nothing ships by accident); no row's id or name belongs to another item.
//   CA2  ONE OF EACH: 24 rows, every key tier x helmet and boots x plate, leather and cloth exactly once, ids and names unique.
//   CA3  THE TWIN: a row's twin is the gear ladder's piece of its slot and weight at its key's tier, and the shipped row is that twin
//        with every field copied: no extra armor, no lost penalty, the same Level, book value, rarity and tier.
//   CA4  ONE ATTRIBUTE, ON A FIELD THE ENGINE READS, UNDER THE BUDGET: exactly one field beyond the twin's (and the row's tier tag),
//        on +skill (the engine's SKILL_PLUS_FIELDS when it exports them), resistPm of a real element, or steadyPm; at most the
//        special-attribute catalogue's size (+Defense 1, + the style's skill 2 to tier 4 and 3 from tier 5, an element 10%, steady 3%);
//        never smaller at a higher key; and the same kind at every tier of a slot and weight.
//   CA5  A NAME OF ITS OWN: none of the banned filler words, and the name names its slot (a helmet word or a boots word).
//   CA6  THE CARD SAYS WHAT IT DOES FIRST: the first sentence carries the attribute's number, and no line uses a semicolon or a dash.
//   CA7  THE LEAN: each wing's key leans its own slot (Bone helmets, Waterlogged boots) and its two shares make 1000.
//
//   node tests/catacomb-armor.mjs            the guard
//   node tests/catacomb-armor.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ITEMS } from '../src/data/items.js';
import { GEAR_LADDERS } from '../src/data/gear-tiers.js';
import { ELEMENTS } from '../src/data/elements.js';
import * as COMBAT from '../src/core/combat.js';
import { CATACOMB_ARMOR, CATACOMB_ATTRS, CATACOMB_TIERS, WING_LEAN, CATACOMB_ARMOR_NOW, catacombArmorItems, cardOf } from '../src/data/catacomb-armor.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* The +skill fields: the engine's own once it exports them (lane/d-tower-weapons), the same four names until then. */
const SKILL_FIELDS = new Set(COMBAT.SKILL_PLUS_FIELDS ? Object.values(COMBAT.SKILL_PLUS_FIELDS) : ['meleePlus', 'rangedPlus', 'magicPlus', 'defensePlus']);
/* THE BUDGET: the special-attribute catalogue's sizes (lane/d-special-attributes) a piece may not pass. */
const BUDGET = Object.freeze({ defensePlus: () => 1, skill: (tier) => (tier <= 4 ? 2 : 3), resistPm: () => 100, steadyPm: () => 30 });
const SLOT_WORDS = Object.freeze({ helmet: /\b(helm|hood|hat|cap|kettle|visor)\b/i, boots: /\b(boots|slippers|shoes)\b/i });
const WEIGHTS = ['plate', 'leather', 'cloth'], SLOTS = ['helmet', 'boots'];

/* every src file's text, once (CA1) */
function srcTexts() {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|html)$/.test(n)) out.push([p, readFileSync(p, 'utf8')]); } };
  walk(join(ROOT, 'src'));
  return out;
}

/** Every problem, as 'CAn ...' strings. `d` is the data (a copy for a mutant), `gen` the row builder. */
export function problems(d, gen = catacombArmorItems, files = srcTexts()) {
  const out = [];
  const { rows, attrs, tiers, lean, items, now } = d;
  /* CA1 */
  const SHIPPERS = /src[\\/]data[\\/](catacomb-armor|items|item-descriptions|chests)\.js$/;
  for (const [f, txt] of files) if (/from\s*['"][^'"]*catacomb-armor\.js/.test(txt) && !SHIPPERS.test(f)) out.push('CA1 ' + f + ' imports the armor outside the shipping files');
  const mine = new Set(rows.map((r) => r.id));
  const itemNames = new Set(Object.entries(items).filter(([id]) => !mine.has(id)).map(([, it]) => it && it.n).filter(Boolean));
  let shippedRows = {};
  try { shippedRows = gen(Object.fromEntries(Object.entries(items).filter(([id]) => !mine.has(id))), rows.filter((r) => now.includes(r.key)), attrs, tiers); } catch (e) { out.push('CA1 ' + e.message); }
  for (const r of rows) {
    const isItem = Object.prototype.hasOwnProperty.call(items, r.id);
    if (now.includes(r.key) !== isItem) out.push('CA1 ' + r.id + (isItem ? ' is an item, and its tier does not ship' : ' does not ship, and its tier does'));
    else if (isItem && JSON.stringify(items[r.id]) !== JSON.stringify(shippedRows[r.id])) out.push('CA1 ' + r.id + ' ships as another row than its generated one');
    if (itemNames.has(r.name)) out.push('CA1 ' + r.id + ': another item is called ' + r.name);
  }
  /* CA2 */
  if (rows.length !== 24) out.push('CA2 ' + rows.length + ' rows, not 24');
  const cells = new Set(), ids = new Set(), names = new Set();
  for (const r of rows) {
    const c = r.key + ':' + r.slot + ':' + r.weight;
    if (cells.has(c)) out.push('CA2 a second ' + c);
    if (ids.has(r.id)) out.push('CA2 a second id ' + r.id);
    if (names.has(r.name)) out.push('CA2 a second name ' + r.name);
    cells.add(c); ids.add(r.id); names.add(r.name);
  }
  for (const k of Object.keys(tiers)) for (const s of SLOTS) for (const w of WEIGHTS) if (!cells.has(k + ':' + s + ':' + w)) out.push('CA2 no ' + k + ' ' + w + ' ' + s);
  /* CA3 + CA4 */
  const ladder = Object.fromEntries(GEAR_LADDERS.map((l) => [l.key, l.ids]));
  let built = {};
  try { built = gen(items, rows, attrs, tiers); } catch (e) { out.push('CA3 ' + e.message); }
  const kindOf = {};
  for (const r of rows) {
    const t = tiers[r.key];
    const want = (ladder[r.weight + ':' + r.slot] || [])[t - 1];
    if (r.twin !== want) out.push('CA3 ' + r.id + ': its twin is ' + r.twin + ', the ladder\'s ' + r.weight + ' ' + r.slot + ' at tier ' + t + ' is ' + want);
    const it = built[r.id], base = items[r.twin];
    if (!it || !base) continue;
    for (const [k, v] of Object.entries(base)) if (k !== 'n' && JSON.stringify(it[k]) !== JSON.stringify(v)) out.push('CA3 ' + r.id + ': ' + k + ' is ' + JSON.stringify(it[k]) + ', its twin\'s ' + JSON.stringify(v));
    const extra = Object.keys(it).filter((k) => !Object.prototype.hasOwnProperty.call(base, k) && k !== 'catacombTier');
    if (extra.length !== 1) { out.push('CA4 ' + r.id + ': ' + extra.length + ' attributes (' + extra.join(', ') + '), not one'); continue; }
    const f = extra[0], v = it[f];
    const kind = f === 'resistPm' ? 'resistPm:' + Object.keys(v || {}).join() : f;
    const slotKind = r.slot + ':' + r.weight;
    if (kindOf[slotKind] && kindOf[slotKind] !== kind) out.push('CA4 ' + r.id + ': ' + kind + ' where the other ' + slotKind + ' pieces carry ' + kindOf[slotKind]);
    kindOf[slotKind] = kindOf[slotKind] || kind;
    let size = null, cap = null;
    if (SKILL_FIELDS.has(f)) { size = v; cap = f === 'defensePlus' ? BUDGET.defensePlus(t) : BUDGET.skill(t); }
    else if (f === 'resistPm') {
      const ks = Object.keys(v || {});
      if (ks.length !== 1 || !ELEMENTS.includes(ks[0])) out.push('CA4 ' + r.id + ': resistPm names ' + (ks.join() || 'nothing') + ', not one element');
      size = ks.length ? v[ks[0]] : null; cap = BUDGET.resistPm(t);
    } else if (f === 'steadyPm') { size = v; cap = BUDGET.steadyPm(t); }
    else { out.push('CA4 ' + r.id + ': ' + f + ' is no field the engine reads'); continue; }
    if (!Number.isInteger(size) || size <= 0 || size > cap) out.push('CA4 ' + r.id + ': ' + f + ' ' + size + ' is not a whole number in 1..' + cap);
  }
  for (const s of SLOTS) for (const w of WEIGHTS) {
    const a = attrs[s + ':' + w];
    const ts = Object.values(tiers).sort((x, y) => x - y);
    for (let i = 1; a && i < ts.length; i++) if (a.size[ts[i]] < a.size[ts[i - 1]]) out.push('CA4 ' + s + ':' + w + ': tier ' + ts[i] + ' is smaller than tier ' + ts[i - 1]);
  }
  /* CA5 + CA6 */
  for (const r of rows) {
    if (BANNED.test(r.name) || BANNED.test(r.line)) out.push('CA5 ' + r.id + ' uses a banned filler word');
    if (!SLOT_WORDS[r.slot] || !SLOT_WORDS[r.slot].test(r.name)) out.push('CA5 ' + r.id + ': ' + r.name + ' does not name a ' + r.slot);
    let card = '';
    try { card = cardOf(r, attrs, tiers); } catch (e) { out.push('CA6 ' + r.id + ': no card (' + e.message + ')'); continue; }
    const first = card.split('. ')[0];
    if (!/\d/.test(first)) out.push('CA6 ' + r.id + ': the card\'s first sentence has no number');
    if (/[;—–]| - /.test(card)) out.push('CA6 ' + r.id + ': a semicolon or a dash in "' + card + '"');
    if (!/[.!?]$/.test(r.line.trim())) out.push('CA6 ' + r.id + ': its line does not end a sentence');
  }
  /* CA7 */
  const leans = { bone: 'helmet', waterlogged: 'boots' };
  for (const [k, slot] of Object.entries(leans)) {
    const l = lean[k];
    if (!l) { out.push('CA7 no ' + k + ' key'); continue; }
    if (l.helmet + l.boots !== 1000) out.push('CA7 ' + k + ': its shares make ' + (l.helmet + l.boots) + ', not 1000');
    const other = slot === 'helmet' ? 'boots' : 'helmet';
    if (!(l[slot] > l[other])) out.push('CA7 ' + k + ' does not lean ' + slot);
  }
  return out;
}

const DATA = () => structuredClone({ rows: CATACOMB_ARMOR, attrs: CATACOMB_ATTRS, tiers: CATACOMB_TIERS, lean: WING_LEAN, items: ITEMS, now: CATACOMB_ARMOR_NOW });
const row = (d, id) => d.rows.find((r) => r.id === id);

/* ── THE MUTANTS: each plants one defect on a copy and names the rule that must catch it. ── */
const MUTANTS = [
  ['a src file imports the armor', 'CA1', (d) => d, (f) => f.concat([['src/shell/windows/market.js', "import { X } from '../../data/catacomb-armor.js';"]])],
  ['a tier that does not ship is an item', 'CA1', (d) => { d.now = ['bronze']; return d; }],
  ['a tier that ships is no item', 'CA1', (d) => { d.now = ['bronze', 'silver', 'gold']; return d; }],
  ['a shipped piece is not its generated row', 'CA1', (d) => { d.items.tinkers_kettle.defB += 1; return d; }],
  ['a row takes an item\'s id', 'CA1', (d) => { row(d, 'tinkers_kettle').id = 'iron_helm'; return d; }],
  ['a row takes an item\'s name', 'CA1', (d) => { row(d, 'ratters_hood').name = 'Iron Helm'; return d; }],
  ['a row is missing', 'CA2', (d) => { d.rows.pop(); return d; }],
  ['two rows in one cell', 'CA2', (d) => { row(d, 'bakers_cap').weight = 'leather'; return d; }],
  ['two rows share a name', 'CA2', (d) => { row(d, 'dyers_boots').name = 'Tanner\'s Boots'; return d; }],
  ['a twin at the wrong tier', 'CA3', (d) => { row(d, 'cranemans_helm').twin = 'iron_helm'; return d; }],
  ['the builder adds armor', 'CA3', (d) => d, null, (items, ...a) => { const o = catacombArmorItems(items, ...a); o.porters_boots.defB += 5; return o; }],
  ['the builder drops a penalty', 'CA3', (d) => d, null, (items, ...a) => { const o = catacombArmorItems(items, ...a); delete o.vault_cutters_helm.magicAtkB; return o; }],
  ['a second attribute', 'CA4', (d) => d, null, (items, ...a) => { const o = catacombArmorItems(items, ...a); o.almoners_hat.critB = 0.05; return o; }],
  ['a field the engine does not read', 'CA4', (d) => { d.attrs['helmet:leather'].field = 'skillB'; return d; }],
  ['+Melee over the budget at tier 7', 'CA4', (d) => { d.attrs['helmet:plate'].size['7'] = 4; return d; }],
  ['+Defense over its budget of 1', 'CA4', (d) => { d.attrs['helmet:plate'].field = 'defensePlus'; return d; }],
  ['+skill over the budget at tier 2', 'CA4', (d) => { d.attrs['helmet:leather'].size['2'] = 3; d.attrs['helmet:leather'].size['4'] = 3; return d; }],
  ['a resistance to no element', 'CA4', (d) => { d.attrs['boots:cloth'].element = 'ice'; return d; }],
  ['a resistance over 10%', 'CA4', (d) => { d.attrs['boots:leather'].size['6'] = 150; d.attrs['boots:leather'].size['7'] = 150; return d; }],
  ['steady over 3%', 'CA4', (d) => { d.attrs['boots:plate'].size['7'] = 50; return d; }],
  ['a higher key smaller', 'CA4', (d) => { d.attrs['boots:plate'].size['6'] = 5; return d; }],
  ['one piece a different kind', 'CA4', (d) => d, null, (items, ...a) => { const o = catacombArmorItems(items, ...a); o.fishwifes_slippers.resistPm = { poison: 100 }; return o; }],
  ['a banned word', 'CA5', (d) => { row(d, 'woodwards_hood').name = 'Dark Hood'; return d; }],
  ['a name that is no helmet', 'CA5', (d) => { row(d, 'coffer_guards_helm').name = 'Coffer-Guard\'s Mantle'; return d; }],
  ['a card with no number first', 'CA6', (d) => { d.attrs['helmet:cloth'].say = 'You take less fire damage.'; return d; }],
  ['a line with a semicolon', 'CA6', (d) => { row(d, 'scribes_slippers').line = 'He wrote the names; his feet were cold.'; return d; }],
  ['a line that does not end', 'CA6', (d) => { row(d, 'dunns_slippers').line = 'Dunn left them in the chest'; return d; }],
  ['a lean that does not add up', 'CA7', (d) => { d.lean.bone.boots = 400; return d; }],
  ['the Bone Key leans boots', 'CA7', (d) => { d.lean.bone.helmet = 300; d.lean.bone.boots = 700; return d; }],
];

function mutate() {
  const files = srcTexts();
  const clean = problems(DATA(), catacombArmorItems, files);
  if (clean.length) { console.error('catacomb-armor --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant, fileFn, gen] of MUTANTS) {
    const got = problems(plant(DATA()), gen || catacombArmorItems, fileFn ? fileFn(files) : files);
    const caught = got.some((x) => x.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'catacomb-armor --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'catacomb-armor --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems(DATA());
  if (bad.length) { console.error('catacomb-armor: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('catacomb-armor: green (24 rows, 7 rules' + (COMBAT.SKILL_PLUS_FIELDS ? ', +skill fields read from the engine' : ', +skill fields by name until the engine exports SKILL_PLUS_FIELDS') + ')');
}
