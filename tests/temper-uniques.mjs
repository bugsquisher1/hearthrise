#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/temper-uniques.mjs — TEMPERING PAST DAWNSTEEL: A SMALL CAP, THE NEXT BAND STILL WINS, PRICED TO GROW, SHUT UNTIL A PIECE IS REAL
// (designer, lane/d-temper-uniques; PRIORITY_BOARD "2026-11-15 Tempering past Dawnsteel"; Tyler 2026-11-15: "a pure gold sink on unique
//  armor past Dawnsteel with a SMALL cap (about +2-3% max), sized by the designer with the simulator before anything is built").
//
//   TU1  THE CAP: a whole band ladder is at most 25 permille (2.5%, the measured top of Tyler's 2-3%), more than nothing, and a band
//        rung is worth less than a gear tier's.
//   TU2  THE NEXT BAND STILL WINS: each weight's set of a band on the armor line, fully tempered, lets more of a swing through than the
//        next band's bare set, on every drafted ground at or past the next band's Level (mitigation.js itself, as temper-play reads tiers).
//   TU3  THE KEY: the first band is the armor line's anchor (110, src/data/armor-line.js), the bands climb, and a band's key is a Level
//        no gear tier reaches, so 'temper:armor:<band>' never names a tier's ladder.
//   TU4  THE PRICE: five rungs a band, each dearer than the last; a band's ladder never costs less than the band before it nor less than
//        a track of the last gear tier's; the material is a salt a gear tier already takes (so tests/temper-buy.mjs TB-MATERIAL's rules
//        hold for it), and its count climbs and never asks more than that tier's track.
//   TU5  SHUT UNTIL REAL: a band is open exactly when an item in ITEMS is armor that reads it; a shut band adds no ladder and no rung
//        to the catalogue; an open band's rungs carry its gold and its salt.
//
//   node tests/temper-uniques.mjs            the guard
//   node tests/temper-uniques.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import * as TD from '../src/data/temper.js';
import { ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { monsterLevelOf } from '../src/data/monsters.js';
import { monsterMaxHit } from '../src/core/combat.js';
import { mitigationOf, mitigate, armourValues } from '../src/core/mitigation.js';
import { MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { LINE_ANCHOR_LEVEL, LINE_BASE, lineArmor } from '../src/data/armor-line.js';

const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const WEIGHTS = ['plate', 'leather', 'cloth'];
/* The drafted grounds past Dawnsteel, by their floor (each pack's `band`). A new drafted ground joins here. */
const FLOORS = { carters_rest: 110, ox_road: 112, wyvern_roost: 125, pauper_vaults: 165 };

const real = () => ({ bands: structuredClone(TD.TEMPER_UNIQUE_BANDS), pm: TD.TEMPER_UNIQUE_RUNG_PM, from: TD.TEMPER_UNIQUE_FROM, item: TD.TEMPER_UNIQUE_ITEM,
  items: ITEMS, unlocks: TD.TEMPER_UNLOCKS, offers: TD.TEMPER_OFFERS, floors: { ...FLOORS } });
const bandsOf = (D) => Object.keys(D.bands).map(Number).sort((a, b) => a - b);
/* the band a piece reads under D: the module's rule (temper.js temperTierOf), read over D's numbers */
const bandOf = (D, it) => {
  if (!it || !it.armourClass || !it.slot || !(Number(it.tier) >= 7) || !(Number(it.reqLv) >= D.from)) return null;
  let b = null;
  for (const x of bandsOf(D)) if (x <= Number(it.reqLv)) b = x;
  return b;
};

/* What one swing lets through on average over a ground's monsters, dodge counted, the rung's part of a point at its exact mean. */
function swing(values, armorPm, mons) {
  let sum = 0;
  for (const id of mons) {
    const row = MONSTERS[id], L = monsterLevelOf(row), mit = mitigationOf(values, L), blow = Math.max(1, Math.floor(monsterMaxHit(row)));
    let p = 0;
    const lo = mitigate(blow, 1000, mit, armorPm, { chance: (c) => { p = c; return false; } }), hi = mitigate(blow, 1000, mit, armorPm, { chance: () => true });
    sum += (1 - mit.dodgePm / 1000) * (lo + p * (hi - lo));
  }
  return sum / mons.length;
}
const lineValues = (cls, r) => {
  const v = { heavy: 0, medium: 0, light: 0 }, k = { plate: 'heavy', leather: 'medium', cloth: 'light' }[cls];
  for (const s of SLOTS) v[k] += lineArmor(s, cls, r);
  return v;
};
const monstersOf = (g) => [...new Set(HUNT_GROUNDS[g].pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((x) => x.monster)))];

export function problems(D = real()) {
  const out = [];
  const bands = bandsOf(D);
  const tierTop = Math.max(...Object.keys(TD.TEMPER_TIERS).map(Number));
  /* TU1 */
  for (const b of bands) {
    const full = D.bands[b].gold.length * D.pm;
    if (!(full > 0) || full > 25) out.push('TU1 band ' + b + ': a whole ladder is ' + full + ' pm; the ruling is a small cap, measured at 25 (2.5%)');
  }
  if (!(D.pm < TD.TEMPER_RUNG_PM)) out.push('TU1 a band rung is ' + D.pm + ' pm, a gear tier\'s ' + TD.TEMPER_RUNG_PM + ': past Dawnsteel is the smaller step');
  /* TU2 */
  for (const [i, b] of bands.entries()) {
    const nb = bands[i + 1];
    if (!nb) continue;
    const full = D.bands[b].gold.length * D.pm;
    for (const cls of WEIGHTS) for (const [g, fl] of Object.entries(D.floors)) {
      if (fl < nb) continue;
      const mons = monstersOf(g);
      const t = swing(lineValues(cls, b), full, mons), n = swing(lineValues(cls, nb), 0, mons);
      if (!(n < t)) out.push('TU2 ' + cls + ' worn from ' + b + ' and fully tempered lets ' + t.toFixed(2) + ' of a swing through at ' + g + ', the ' + nb + ' band bare ' + n.toFixed(2) + ': the next band must win');
    }
  }
  /* TU3 */
  if (D.from !== LINE_ANCHOR_LEVEL) out.push('TU3 the bands start at ' + D.from + ', the armor line at ' + LINE_ANCHOR_LEVEL);
  if (bands[0] !== D.from) out.push('TU3 the first band is ' + bands[0] + ', not ' + D.from + ': a piece from ' + D.from + ' would read no ladder');
  if (bands.some((b) => !Number.isInteger(b) || b <= MATERIAL_TIERS.length || b <= tierTop)) out.push('TU3 a band key ' + bands.join(',') + ' reaches a gear tier: its ladder id names a tier\'s');
  for (const [cls, b] of Object.entries(LINE_BASE)) for (const id of Object.values(b.ids)) if (bandOf(D, ITEMS[id]) !== null) out.push('TU3 Dawnsteel ' + id + ' (' + cls + ') reads a band');
  /* TU4 */
  const lastTrack = TD.TEMPER_TIERS[tierTop].reduce((s, n) => s + n, 0);
  const mats = Object.values(TD.TEMPER_MATERIALS);
  const salt = mats.find((m) => m.item === D.item);
  let before = 0;
  for (const b of bands) {
    const r = D.bands[b];
    if (r.gold.length !== 5 || r.qty.length !== r.gold.length) out.push('TU4 band ' + b + ': ' + r.gold.length + ' rungs of gold, ' + r.qty.length + ' of salt');
    if (r.gold.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || (i > 0 && !(n > r.gold[i - 1])))) out.push('TU4 band ' + b + ': the rungs ' + r.gold + ' do not climb');
    if (r.qty.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || (i > 0 && !(n > r.qty[i - 1])))) out.push('TU4 band ' + b + ': the salts ' + r.qty + ' do not climb');
    const total = r.gold.reduce((s, n) => s + n, 0);
    if (total < before) out.push('TU4 band ' + b + ' asks ' + total + ', under the band before (' + before + '): a later ladder never costs less');
    if (total < lastTrack) out.push('TU4 band ' + b + ' asks ' + total + ', under a track of tier ' + tierTop + ' (' + lastTrack + ')');
    before = Math.max(before, total);
    if (salt && r.qty.reduce((s, n) => s + n, 0) > salt.qty.reduce((s, n) => s + n, 0)) out.push('TU4 band ' + b + ' asks more ' + D.item + ' than a tier\'s track');
  }
  if (!salt || !D.items[D.item]) out.push('TU4 the material ' + D.item + ' is not a salt a gear tier already takes');
  /* TU5 */
  const read = new Map(bands.map((b) => [b, []]));
  for (const [id, it] of Object.entries(D.items)) { const b = bandOf(D, it); if (b !== null) read.get(b).push(id); }
  for (const b of bands) {
    const open = D.bands[b].open === true, ids = 'temper:armor:' + b;
    if (open && !read.get(b).length) out.push('TU5 band ' + b + ' is open and no item reads it: a rung that pays on nothing');
    if (!open && read.get(b).length) out.push('TU5 band ' + b + ' is shut and ' + read.get(b).join(', ') + ' read it: a piece the smith can\'t temper (open it and regenerate the Tempering catalogue)');
    const u = D.unlocks.filter((x) => x.unlock_id === ids), o = D.offers.filter((x) => x.unlock_id === ids);
    if (!open && (u.length || o.length)) out.push('TU5 band ' + b + ' is shut and the catalogue sells it');
    if (open) {
      if (u.length !== 1 || u[0].max_value !== D.bands[b].gold.length) out.push('TU5 band ' + b + ' is open and its ladder row is ' + JSON.stringify(u));
      for (const [i, gold] of D.bands[b].gold.entries()) {
        const r = o.find((x) => x.value === i + 1);
        if (!r || r.gold !== gold || r.items[D.item] !== D.bands[b].qty[i] || Object.keys(r.items).length !== 1) out.push('TU5 band ' + b + ' rung ' + (i + 1) + ' sells as ' + JSON.stringify(r));
      }
    }
  }
  for (const x of D.unlocks) if (/^temper:blows:/.test(x.unlock_id) && Number(x.unlock_id.split(':')[2]) >= D.from) out.push('TU5 a band sells Blows: ' + x.unlock_id);
  return out;
}

const piece = { n: 'what-if', type: 'armor', slot: 'body', armourClass: 'plate', defB: 135, tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 };
const MUTANTS = [
  ['a whole ladder is 3%', 'TU1', (D) => { D.pm = 6; }],
  ['a band rung worth a tier rung', 'TU1', (D) => { D.pm = 10; D.bands = { 110: D.bands[110] }; }],
  ['two bands five Levels apart', 'TU2', (D) => { D.bands[115] = D.bands[125]; delete D.bands[125]; }],
  ['the first band at 120', 'TU3', (D) => { D.bands[120] = D.bands[110]; delete D.bands[110]; }],
  ['the bands start at Dawnsteel', 'TU3', (D) => { D.from = 88; D.bands[88] = D.bands[110]; delete D.bands[110]; }],
  ['a band keyed under the gear tiers', 'TU3', (D) => { D.bands[6] = D.bands[110]; }],
  ['the 125 ladder cheaper than the 110', 'TU4', (D) => { D.bands[125].gold = D.bands[125].gold.map((n) => n / 2); }],
  ['a flat rung', 'TU4', (D) => { D.bands[145].gold[3] = D.bands[145].gold[2]; }],
  ['a material no tier takes', 'TU4', (D) => { D.item = 'dawn_bar'; }],
  ['the salts do not climb', 'TU4', (D) => { D.bands[165].qty = [40, 40, 40, 40, 40]; }],
  ['a band open with no piece', 'TU5', (D) => { D.bands[165].open = true; }],
  ['a piece ships and its band stays shut', 'TU5', (D) => { D.items = { ...D.items, tu_plate: piece }; }],
  ['a shut band in the catalogue', 'TU5', (D) => { D.unlocks = [...D.unlocks, { unlock_id: 'temper:armor:165', max_value: 5 }]; }],
  ['an open band sells the wrong salt', 'TU5', (D) => {
    D.items = { ...D.items, tu_plate: piece }; D.bands[165].open = true;
    D.unlocks = [...D.unlocks, { unlock_id: 'temper:armor:165', max_value: 5 }];
    D.offers = [...D.offers, ...D.bands[165].gold.map((gold, i) => ({ unlock_id: 'temper:armor:165', value: i + 1, gold, items: { rune_temper_salts: D.bands[165].qty[i] } }))];
  }],
  ['a band sells Blows', 'TU5', (D) => { D.unlocks = [...D.unlocks, { unlock_id: 'temper:blows:165', max_value: 5 }]; }],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('temper-uniques --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant] of MUTANTS) {
    const D = real();
    plant(D);
    const got = problems(D);
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'temper-uniques --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'temper-uniques --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems();
  if (bad.length) { console.error('temper-uniques: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  const open = bandsOf(real()).filter((b) => TD.TEMPER_UNIQUE_BANDS[b].open);
  console.log('temper-uniques: ' + bandsOf(real()).length + ' bands past Dawnsteel (' + (open.length ? 'open: ' + open.join(', ') : 'all shut, nothing sold') + '), a ladder at most 2.5%, the next band wins on every drafted ground, no ladder cheaper than the one before');
}
