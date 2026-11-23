#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/special-attributes.mjs — A SPECIAL PIECE IS THE STANDARD PIECE PLUS ONE ATTRIBUTE, AND THE SAMPLE IS HIDDEN UNTIL IT SHIPS AS WRITTEN
// (designer, lane/d-special-attributes; PRIORITY_BOARD "2026-11-15 Special-attribute gear"; Tyler 2026-11-14: "sprinkle items
//  like this throughout the game to be farmed to build better sets", "by unique i mean having a special attribute").
//
//   SA1  HIDDEN, OR SHIPPED AS WRITTEN: a row that is not `shipped` is absent from ITEMS (or a wave-3 row still waiting for its
//        roster: the re-fit hasn't shipped by accident) and on no monster's drops. A `shipped` row (lane/c-krell-uniques: Krell's
//        Tollgate and the Banded Legguards) IS the ITEMS row, field for field, its text is the item's description, and it is on
//        its source monster's drops and nobody else's, at its `pm` when it is a daily prize. The only src/ file that imports
//        src/data/special-attributes.js is a shipped row's home pack (src/data/grounds/<source.ground>/pack.js).
//   SA2  THE STANDARD PIECE: a sample row with a `base` carries that row's slot, weight, tier, Level, rarity, value and every stat,
//        so it is never a stat stick. One with no base sits on its ladder's next rung (a shield: +2 guard a tier).
//   SA3  ONE ATTRIBUTE, AT ITS TIER'S SIZE: exactly one attribute field beyond the base, of the size the catalogue names for the
//        row's tier, on a slot the catalogue allows, with a key it knows, never an unproven one, and inside the cap.
//   SA4  A HOME A PLAYER CAN REACH: the source monster is met on an open ground or in an open keyed hall of the ground named.
//   SA5  NO TWO THE SAME PIECE: no two rows share a slot, weight and attribute key, and no two share a home monster's ground
//        unless that monster is a boss.
//   SA6  A NAME OF ITS OWN: no other item carries the name, and the name and text use none of the banned filler words.
//   SA7  THE PLAYER IS TOLD WHAT IT DOES: a hidden row's text says it first, its first sentence carrying the attribute's number. A
//        SHIPPED row's item card lists the attribute as a stat line (src/shell/bag-model.js statLines), so its text is the item's
//        lore line by the flavour rules (tests/item-flavour-coverage.mjs FLV-3/FLV-5: 40-132 characters, no number).
//
//   node tests/special-attributes.mjs            the guard
//   node tests/special-attributes.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy of the sample (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ITEMS, MONSTERS, AWAITING_ROSTER } from '../src/data/catalogue-coherence.js';
import { ITEM_DESC } from '../src/data/item-descriptions.js';
import { OPEN_GROUNDS, OPEN_HALL_GROUNDS } from '../src/data/hunt-grounds.js';
import { hallOfHunt } from '../src/data/boss-halls.js';
import { SPECIAL_ATTRIBUTES, SPECIAL_SAMPLE, SPECIAL_TIERS } from '../src/data/special-attributes.js';
import { statLines } from '../src/shell/bag-model.js';
import { SKILL_PLUS_FIELDS } from '../src/core/combat.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* the fields a row may carry beyond its base's numbers: its words and its one attribute (a + skill is the engine's own `<skill>Plus`,
   the designer's ruling 2026-11-18 row 1c) */
const WORDS = new Set(['n', 'icon']);
const ATTR_FIELDS = new Set(['resistPm', ...Object.values(SKILL_PLUS_FIELDS), 'bane', 'effects']);
/* the item field attribute `def` writes for `key`: its one field, or the one its key names */
const fieldOf = (def, key) => (typeof def.field === 'string' ? def.field : (def.field || {})[key]);
const SHIELD_GUARD = (tier) => 3 + 2 * (tier - 1);

/* every src file's text, once (SA1) */
function srcFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) srcFiles(p, out); else if (/\.(js|mjs|ts|html)$/.test(f)) out.push(p);
  }
  return out;
}
/* an import of it, static or dynamic: a comment naming the file or the generated preload list (src/app/game-modules.js, which follows
   the shipped pack's own import) reads no row */
const importers = () => srcFiles(join(ROOT, 'src')).filter((p) => !p.endsWith('special-attributes.js')
  && /(?:\bfrom\s*|\bimport\s*\(\s*)['"][^'"]*special-attributes\.js/.test(readFileSync(p, 'utf8')));

/* the monsters a player can meet today, by ground: an open ground's pockets, and an open hall's room under its ground's id */
function homes() {
  const m = new Map();
  const add = (gid, g) => { for (const p of g.pockets || []) for (const s of [...(p.spawns || []), ...(p.pack || []), ...(p.adds || [])]) m.set(s.monster, gid); };
  for (const [gid, g] of Object.entries(OPEN_GROUNDS)) add(gid, g);
  for (const g of Object.values(OPEN_HALL_GROUNDS)) { const h = hallOfHunt(g.hunt); add(h ? h.id : g.id, g); }
  return m;
}

/** What one row's attribute is, read off the row against its base: [{ field, key, value }] (one entry when the row is sound). */
function attributesOf(row, base) {
  const out = [];
  for (const [k, v] of Object.entries(row.resistPm || {})) if (!(base && base.resistPm && base.resistPm[k] === v)) out.push({ field: 'resistPm', key: k, value: v });
  for (const [k, f] of Object.entries(SKILL_PLUS_FIELDS)) if (row[f] !== undefined && !(base && base[f] === row[f])) out.push({ field: f, key: k, value: row[f] });
  if (row.bane && !(base && base.bane)) out.push({ field: 'bane', key: row.bane.class, value: row.bane.mult });
  if ((row.critB || 0) > ((base && base.critB) || 0) + 1e-9) out.push({ field: 'critB', key: null, value: Math.round(((row.critB || 0) - ((base && base.critB) || 0)) * 1000) / 1000 });
  return out;
}

/* who drops item `id`: [{ monster, ch }] over every monster row (SA1) */
const droppers = (id, mons) => Object.entries(mons).flatMap(([m, row]) => (row && Array.isArray(row.drops) ? row.drops : []).filter((d) => d.id === id).map((d) => ({ monster: m, ch: d.ch })));
const slash = (p) => String(p).replace(/\\/g, '/');

/** Every broken rule, as strings. Empty = sound. `S` is the sample, `A` the catalogue, `open` what `importers()` and `homes()` answer, and
    the items, their text and the monsters as the game holds them (a mutant plants a copy). */
export function problems(S = SPECIAL_SAMPLE, A = SPECIAL_ATTRIBUTES, open = {}) {
  open = { importers: importers(), homes: homes(), items: ITEMS, desc: ITEM_DESC, monsters: MONSTERS, cardKeys: (id) => statLines(id).map((l) => l.key), ...open };
  const out = [];
  const packs = new Set(Object.values(S).filter((s) => s.shipped === true).map((s) => 'src/data/grounds/' + s.source.ground + '/pack.js'));
  for (const p of open.importers) {
    const rel = slash(p).replace(slash(ROOT), '').replace(/^\//, '');
    if (!packs.has(rel)) out.push('SA1 ' + rel + ' imports special-attributes.js: only a shipped row\'s home pack reads it, the rest of the sample is hidden until it is approved');
  }
  /* the scan is not blind: every shipped row's home pack is found importing it (it reads the row from here) */
  const found1 = new Set(open.importers.map((p) => slash(p).replace(slash(ROOT), '').replace(/^\//, '')));
  for (const p of packs) if (!found1.has(p)) out.push('SA1 ' + p + ' is a shipped row\'s home and is not found importing special-attributes.js');
  for (const [id, s] of Object.entries(S)) {
    const it = open.items[id], who = droppers(id, open.monsters);
    if (s.shipped !== true) {
      if (s.shipped !== undefined) out.push('SA1 ' + id + ': shipped is true or absent');
      if (who.length) out.push('SA1 ' + id + ' is on ' + who[0].monster + '\'s drops and is not shipped');
      continue;
    }
    if (!it) { out.push('SA1 ' + id + ' is shipped and is not an item'); continue; }
    if (JSON.stringify(it) !== JSON.stringify(s.row)) out.push('SA1 ' + id + ': the item is not the sample row, field for field (the pack reads the row from here)');
    if (open.desc[id] !== String(s.text).replace(/\.$/, '')) out.push('SA1 ' + id + ': the item\'s description is not the sample\'s text');
    if (who.length !== 1 || who[0].monster !== s.source.monster) out.push('SA1 ' + id + ' drops from ' + (who.map((w) => w.monster).join(', ') || 'nobody') + ', the sample says ' + s.source.monster + ' alone');
    else if (s.source.how === 'daily' && Math.abs(who[0].ch * 1000 - s.source.pm) > 1e-6) out.push('SA1 ' + id + ': its slice of the daily roll is ' + who[0].ch + ', the sample says ' + s.source.pm + ' permille');
    if (s.source.how === 'daily' && !(Number.isInteger(s.source.pm) && s.source.pm > 0)) out.push('SA1 ' + id + ': a daily prize names its slice, whole permille');
  }
  /* SA3: a + skill attribute writes the engine's own field for its key (combat.js SKILL_PLUS_FIELDS), so the piece plays as written */
  for (const [kind, def] of Object.entries(A)) if (def && def.field && typeof def.field === 'object') for (const k of def.keys || []) {
    if (fieldOf(def, k) !== SKILL_PLUS_FIELDS[k]) out.push('SA3 ' + kind + ' writes ' + k + ' as ' + fieldOf(def, k) + ', the engine reads ' + SKILL_PLUS_FIELDS[k] + ': the piece would play as nothing');
  }
  /* SA3: never + Defense on a helmet (the designer 2026-11-18 row 1c; +1 Defense on a helm out-guards the next tier's helm, measured 11-16) */
  if (A.defense && (A.defense.slots || []).includes('helmet')) out.push('SA3 + Defense is carried on a helmet: one point out-guards the next tier\'s helm (measured 2026-11-16)');
  const seenPiece = new Map(), seenGround = new Map();
  for (const [id, s] of Object.entries(S)) {
    const row = s.row, base = s.base ? ITEMS[s.base] : null;
    if (s.shipped !== true && open.items[id] && !AWAITING_ROSTER.includes(id)) out.push('SA1 ' + id + ' is already an item a catalogue can serve');
    if (s.base && !base) { out.push('SA2 ' + id + ': base ' + s.base + ' is not an item'); continue; }
    if (!SPECIAL_TIERS.includes(row.tier)) out.push('SA3 ' + id + ': tier ' + row.tier + ' carries no special piece');
    /* SA2 */
    if (base) {
      for (const k of new Set([...Object.keys(base), ...Object.keys(row)])) {
        if (WORDS.has(k) || ATTR_FIELDS.has(k)) continue;
        if (k === 'critB' && s.attr[0] === 'crit') continue;
        /* `iL` is the Danger scale's mark on a scale ground's drop (src/data/danger.js scaleItemLevels), not a number of the piece: hunt-core/danger
           ilevel holds every scale drop to its ground's */
        if (k === 'iL') continue;
        /* `statPlus` is a row's stated offset from the stat formula (src/data/gear-profiles.js, lane/gear-catalogue-steps): on a sample it
           can only carry the attribute (a crit), and the stats it lands on are compared field by field here, so a stat stick still shows */
        if (k === 'statPlus') continue;
        if (JSON.stringify(base[k]) !== JSON.stringify(row[k])) out.push('SA2 ' + id + '.' + k + ' = ' + JSON.stringify(row[k]) + ', the standard ' + s.base + ' has ' + JSON.stringify(base[k]));
      }
    } else if (row.slot === 'shield') {
      if (row.defB !== SHIELD_GUARD(row.tier)) out.push('SA2 ' + id + ': guard ' + row.defB + ', the shield ladder\'s tier ' + row.tier + ' rung is ' + SHIELD_GUARD(row.tier));
      for (const k of ['atkB', 'strB', 'rangeAtkB', 'magicAtkB', 'critB', 'steadyPm']) if (row[k]) out.push('SA2 ' + id + '.' + k + ' is a stat the shield ladder doesn\'t carry');
    } else out.push('SA2 ' + id + ' has no base and is not a shield');
    /* SA3 */
    const found = attributesOf(row, base), def = A[s.attr[0]];
    if (found.length !== 1) out.push('SA3 ' + id + ' carries ' + found.length + ' attributes (' + found.map((f) => f.field + (f.key ? '.' + f.key : '')).join(', ') + '), a special piece carries one');
    if (!def) out.push('SA3 ' + id + ': ' + s.attr[0] + ' is not in the catalogue');
    else if (found.length === 1) {
      const f = found[0];
      if (f.field !== fieldOf(def, f.key)) out.push('SA3 ' + id + ': the row carries ' + f.field + ', ' + s.attr[0] + ' is ' + fieldOf(def, f.key));
      if ((def.keys || s.attr[1]) && f.key !== s.attr[1]) out.push('SA3 ' + id + ': the row names ' + f.key + ', the sample says ' + s.attr[1]);
      if (def.keys && !def.keys.includes(f.key)) out.push('SA3 ' + id + ': ' + f.key + ' is not a key of ' + s.attr[0]);
      if ((def.unproven || []).includes(f.key)) out.push('SA3 ' + id + ': ' + f.key + ' is unproven, no piece carries it yet');
      if (def.at[row.tier] === undefined) out.push('SA3 ' + id + ': ' + s.attr[0] + ' has no size at tier ' + row.tier);
      else if (Math.abs(def.at[row.tier] - f.value) > 1e-9) out.push('SA3 ' + id + ': ' + f.value + ', the catalogue says ' + def.at[row.tier] + ' at tier ' + row.tier);
      if (f.value > def.cap.value) out.push('SA3 ' + id + ': ' + f.value + ' is over the cap ' + def.cap.value);
      if (!def.slots.includes(row.slot)) out.push('SA3 ' + id + ': ' + s.attr[0] + ' is not carried on the ' + row.slot + ' slot');
      if (row.bane && !(row.effects || []).includes('bane')) out.push('SA3 ' + id + ': a bane row names the bane effect (item-effects.js)');
    }
    /* SA4 */
    const mon = s.source && s.source.monster, home = open.homes.get(mon);
    if (!MONSTERS[mon]) out.push('SA4 ' + id + ': source ' + mon + ' is not a monster');
    else if (!home) out.push('SA4 ' + id + ': ' + mon + ' is met on no open ground or hall');
    else if (home !== s.source.ground) out.push('SA4 ' + id + ': ' + mon + ' is met on ' + home + ', the sample says ' + s.source.ground);
    if (!['rare', 'trophy', 'daily'].includes(s.source && s.source.how)) out.push('SA4 ' + id + ': a special piece drops in the Rare band, as a trophy or on a daily kill');
    if (s.use !== 'worn') out.push('SA4 ' + id + ': its use is to be worn');
    /* SA5 */
    const piece = [row.slot, row.armourClass || row.weaponType || row.offhand || '', s.attr[0], s.attr[1] || ''].join(':');
    if (seenPiece.has(piece)) out.push('SA5 ' + id + ' and ' + seenPiece.get(piece) + ' are the same piece (' + piece + ')');
    seenPiece.set(piece, id);
    if (MONSTERS[mon] && !MONSTERS[mon].boss) { if (seenGround.has(s.source.ground)) out.push('SA5 ' + id + ' and ' + seenGround.get(s.source.ground) + ' share ' + s.source.ground + ' in a sample of five'); seenGround.set(s.source.ground, id); }
    /* SA6 */
    for (const [other, it] of Object.entries(ITEMS)) if (other !== id && it && it.n === row.n) out.push('SA6 ' + id + ': ' + other + ' is already named ' + row.n);
    if (BANNED.test(row.n) || BANNED.test(s.text)) out.push('SA6 ' + id + ': a banned filler word (DESIGN_STANDARDS §2)');
    if (/[;—]/.test(s.text)) out.push('SA6 ' + id + ': no semicolon or em dash in item text');
    /* SA7 */
    if (s.shipped === true) {
      const f = found.length === 1 ? found[0] : null, key = f && (f.key ? f.field + '.' + f.key : f.field), line = String(s.text).replace(/\.$/, '');
      if (f && !open.cardKeys(id).includes(key)) out.push('SA7 ' + id + ': the item card lists no ' + key + ' line, so nothing tells the player what the piece does');
      if (/\d/.test(line) || line.length < 40 || line.length > 132) out.push('SA7 ' + id + ': a shipped piece\'s text is its lore line, 40-132 characters and no number (the card\'s stat lines say what it does)');
    } else if (!/\d/.test(String(s.text).split('. ')[0])) out.push('SA7 ' + id + ': the first sentence says what the piece does, with its number');
  }
  return out;
}

/* ── THE MUTANTS: each plants one defect on a copy and names the rule that must catch it. ── */
const MUTANTS = [
  ['an importer appears', 'SA1', (S, A, o) => { o.importers = [join(ROOT, 'src/data/items.js')]; }],
  ['the importer scan goes blind', 'SA1', (S, A, o) => { o.importers = []; }],
  ['a hidden row\'s ground reads the file', 'SA1', (S, A, o) => { o.importers = [join(ROOT, 'src/data/grounds/the_slake/pack.js')]; }],
  ['a hidden row becomes an item', 'SA1', (S, A, o) => { o.items = { ...o.items, mudlarks_mitts: structuredClone(S.mudlarks_mitts.row) }; }],
  ['a hidden row lands on a drop table', 'SA1', (S, A, o) => { o.monsters = { ...o.monsters, mudlark: { ...o.monsters.mudlark, drops: [...o.monsters.mudlark.drops, { id: 'mudlarks_mitts', ch: 0.01, band: 'rare' }] } }; }],
  ['the shipped Legguards drift from their row (5% in the game)', 'SA1', (S, A, o) => { o.items = { ...o.items, banded_legguards: { ...o.items.banded_legguards, resistPm: { physical: 50 } } }; }],
  ['the shipped Tollgate is on no drop table', 'SA1', (S, A, o) => { o.monsters = { ...o.monsters, lord_krell: { ...o.monsters.lord_krell, drops: o.monsters.lord_krell.drops.filter((d) => d.id !== 'krells_tollgate') } }; }],
  ['the Tollgate rolls at 10%, not its 3%', 'SA1', (S, A, o) => { o.monsters = { ...o.monsters, lord_krell: { ...o.monsters.lord_krell, drops: o.monsters.lord_krell.drops.map((d) => (d.id === 'krells_tollgate' ? { ...d, ch: 0.1 } : d)) } }; }],
  ['a second monster drops the Legguards', 'SA1', (S, A, o) => { o.monsters = { ...o.monsters, gatekeeper: { ...o.monsters.gatekeeper, drops: [...o.monsters.gatekeeper.drops, { id: 'banded_legguards', ch: 0.01, band: 'rare' }] } }; }],
  ['the Tollgate\'s card text drifts', 'SA1', (S, A, o) => { o.desc = { ...o.desc, krells_tollgate: 'A shield' }; }],
  ['a stat stick: the Legguards gain 6 armor', 'SA2', (S) => { S.banded_legguards.row.defB = 70; }],
  ['the Tollgate leaves its ladder rung', 'SA2', (S) => { S.krells_tollgate.row.defB = 17; }],
  ['a second attribute on the Mitts', 'SA3', (S) => { S.mudlarks_mitts.row.resistPm = { ember: 100 }; }],
  ['the Legguards read 5%', 'SA3', (S) => { S.banded_legguards.row.resistPm = { physical: 50 }; }],
  ['a + Magic piece ships unproven', 'SA3', (S) => { delete S.mudlarks_mitts.row.rangedPlus; S.mudlarks_mitts.row.magicPlus = 2; S.mudlarks_mitts.attr = ['skill', 'magic']; }],
  ['the catalogue writes + Ranged on a field the engine never reads (skillB, the 11-18 red)', 'SA3', (S, A) => { A.skill.field = { ...A.skill.field, ranged: 'skillB' }; }],
  ['the catalogue lets a helmet carry + Defense again (it out-guards the next tier\'s helm)', 'SA3', (S, A) => { A.defense.slots = ['helmet', 'cape']; }],
  ['a + Defense helm in the sample', 'SA3', (S) => { const r = { ...S.mudlarks_mitts.row, slot: 'helmet', defensePlus: 1 }; delete r.rangedPlus; S.mudlarks_mitts.row = r; S.mudlarks_mitts.attr = ['defense', 'defense']; }],
  ['Demoncaller goes back to x1.4', 'SA3', (S) => { S.demoncaller_staff.row.bane = { class: 'undead', mult: 1.4 }; }],
  ['a crit piece of armor', 'SA3', (S, A) => { A.crit.slots = ['helmet']; }],
  ['a home nobody can reach', 'SA4', (S) => { S.widows_fang.source.monster = 'broodmother'; }],
  ['a common drop', 'SA4', (S) => { S.widows_fang.source.how = 'scarce'; }],
  ['two of the same piece', 'SA5', (S) => { S.copy = structuredClone(S.mudlarks_mitts); S.copy.row.n = 'Another Name'; S.copy.source = { monster: 'color_sergeant', ground: 'the_slake', how: 'rare' }; }],
  ['a name another item has', 'SA6', (S) => { S.mudlarks_mitts.row.n = 'Snakeskin Bracers'; }],
  ['a banned word', 'SA6', (S) => { S.widows_fang.text = 'It lands a critical hit 6% more often. Forged in the Void.'; }],
  ['text that leads with flavour', 'SA7', (S) => { S.widows_fang.text = 'A thin blade with a spider\'s eye in the hilt. It crits more.'; }],
  ['a shipped card repeats its number in the lore line', 'SA7', (S) => { S.krells_tollgate.text = 'You take 10% less fire damage. ' + S.krells_tollgate.text; }],
  ['the card lists no line for the shipped attribute', 'SA7', (S, A, o) => { o.cardKeys = () => ['defB']; }],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('special-attributes --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant] of MUTANTS) {
    const S = structuredClone(SPECIAL_SAMPLE), A = structuredClone(SPECIAL_ATTRIBUTES), o = { importers: importers(), homes: homes(), items: ITEMS, desc: ITEM_DESC, monsters: MONSTERS };
    plant(S, A, o);
    const got = problems(S, A, o);
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'special-attributes --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'special-attributes --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems();
  if (bad.length) { console.error('special-attributes: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('special-attributes: ' + Object.keys(SPECIAL_SAMPLE).length + ' sample rows, each the standard piece plus one attribute at its tier\'s size, with a home on an open ground; '
    + Object.values(SPECIAL_SAMPLE).filter((s) => s.shipped === true).length + ' shipped as written, the rest hidden');
}
