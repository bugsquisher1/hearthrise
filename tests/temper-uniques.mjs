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
//   TU3  THE KEY: the first band is the armor line's anchor (110, tools/balance-sim/staged/armor-line.js), the bands climb, and a band's key is a Level
//        no gear tier reaches, so 'temper:armor:<band>' never names a tier's ladder.
//   TU4  THE PRICE: five rungs a band, each dearer than the last; a band's ladder never costs less than the band before it nor less than
//        a track of the last gear tier's; the material is a salt a gear tier already takes (so tests/temper-buy.mjs TB-MATERIAL's rules
//        hold for it), and its count climbs and never asks more than that tier's track.
//   TU5  SHUT UNTIL REAL: a band is open exactly when an item in ITEMS is armor that reads it; a shut band adds no ladder and no rung
//        to the catalogue; an open band's rungs carry its gold and its salt.
//
//   TU6  DAWNSTEEL'S LADDER (lane/d-temper-dawnsteel; Tyler 2026-11-16 "yes" to its own ladder, Levels 88 to 110, small cap): tier 7 has
//        a ladder with a rung worth less than a gear tier's and a whole ladder of at most 20 permille (2%, measured), under the first band's;
//        each weight's whole Dawnsteel set fully tempered lets more of a swing through than the armor line's bare set worn from its first
//        Level above Dawnsteel (the Night Shift, 122), on every drafted ground at or past that Level; it asks more gold than tier 6 and
//        takes a salt a gear tier already takes, no more of it than tier 6.
//
//   TU7  THE SMITH'S ROW READS A BAND (lane/d-late-items-rescue): src/session/temper-sections.js temperRowsOf, over a unique plate set worn
//        from 165 and the SERVER's ladders with the 165 band sold, calls the row "Unique armor", finds that band's ladder, says its smaller
//        rung and lists the bands the server sells; with the band not sold it finds no ladder and lists none. Its mutants plant a defect in
//        the reader on a copy of src/ (tests/hunt-core/fixtures/h1.js plant).
//
//   node tests/temper-uniques.mjs            the guard
//   node tests/temper-uniques.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// TU1-TU6's mutants edit an in-memory copy (structuredClone); TU7's plant a file copy of these:
// mutant-anchors: src/session/temper-sections.js src/data/temper.js
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import * as TD from '../src/data/temper.js';
import { ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { monsterLevelOf } from '../src/data/monsters.js';
import { monsterMaxHit } from '../src/core/combat.js';
import { mitigationOf, mitigate, armourValues } from '../src/core/mitigation.js';
import { MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { LINE_ANCHOR_LEVEL, LINE_BANDS, LINE_BASE, lineArmor } from '../tools/balance-sim/staged/armor-line.js';

const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const WEIGHTS = ['plate', 'leather', 'cloth'];
/* The drafted grounds past Dawnsteel, by their floor (each pack's `band`). A new drafted ground joins here. */
const FLOORS = { carters_rest: 110, ox_road: 112, wyvern_roost: 125, unmarked_catacombs: 165 };

/* Dawnsteel's ladder as the fight reads it (src/data/temper.js temperLadder), null with none. */
const dawnOf = () => {
  const l = TD.temperLadder('armor', 7);
  return l ? { gold: [...TD.TEMPER_TIERS[7]], pm: l.pm, rungs: l.rungs, blowsPm: (TD.temperLadder('blows', 7) || {}).pm, mat: structuredClone(TD.TEMPER_MATERIALS[7] || null) } : null;
};
const real = () => ({ bands: structuredClone(TD.TEMPER_UNIQUE_BANDS), pm: TD.TEMPER_UNIQUE_RUNG_PM, from: TD.TEMPER_UNIQUE_FROM, item: TD.TEMPER_UNIQUE_ITEM,
  items: ITEMS, unlocks: TD.TEMPER_UNLOCKS, offers: TD.TEMPER_OFFERS, floors: { ...FLOORS }, dawn: dawnOf() });
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
  /* TU6 */
  const dw = D.dawn;
  if (!dw) out.push('TU6 Dawnsteel (tier 7, worn from 88) has no ladder: from 88 to 110 no sink grows with the hero (Tyler 2026-11-16)');
  else {
    const full = dw.rungs * dw.pm;
    if (!(dw.pm > 0) || !(dw.pm < TD.TEMPER_RUNG_PM) || dw.blowsPm !== dw.pm) out.push('TU6 a Dawnsteel rung is ' + dw.pm + ' pm (Blows ' + dw.blowsPm + '), a gear tier\'s ' + TD.TEMPER_RUNG_PM + ': both tracks take the smaller step');
    if (!(full > 0) || full > 20) out.push('TU6 a whole Dawnsteel ladder is ' + full + ' pm; the ruling is a small cap, measured at 20 (2%)');
    if (bands.length && !(full < D.bands[bands[0]].gold.length * D.pm)) out.push('TU6 a whole Dawnsteel ladder (' + full + ' pm) is not under the ' + bands[0] + ' band\'s: a unique worn from ' + bands[0] + ' carries Dawnsteel\'s armor and must win once both are tempered');
    const above = LINE_BANDS.map((b) => b.reqLv).filter((r) => r > LINE_ANCHOR_LEVEL).sort((a, b) => a - b)[0];
    for (const cls of WEIGHTS) {
      const vals = { heavy: 0, medium: 0, light: 0 }, key = { plate: 'heavy', leather: 'medium', cloth: 'light' }[cls];
      for (const id of Object.values(LINE_BASE[cls].ids)) vals[key] += Number(ITEMS[id].defB) || 0;
      for (const [g, fl] of Object.entries(D.floors)) {
        if (fl < above) continue;
        const mons = monstersOf(g), t = swing(vals, full, mons), n = swing(lineValues(cls, above), 0, mons);
        if (!(n < t)) out.push('TU6 ' + cls + ' Dawnsteel fully tempered lets ' + t.toFixed(2) + ' of a swing through at ' + g + ', the line\'s set worn from ' + above + ' bare ' + n.toFixed(2) + ': the next armor must win');
      }
    }
    const t6 = TD.TEMPER_TIERS[6].reduce((s, n) => s + n, 0), t7 = dw.gold.reduce((s, n) => s + n, 0);
    if (dw.gold.length !== dw.rungs || dw.gold.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || (i > 0 && !(n > dw.gold[i - 1])))) out.push('TU6 Dawnsteel\'s rungs ' + dw.gold + ' do not climb');
    if (!(t7 > t6)) out.push('TU6 a Dawnsteel track asks ' + t7 + ', no more than tier 6\'s ' + t6 + ': a later ladder never costs less');
    const m6 = TD.TEMPER_MATERIALS[6];
    const before7 = Object.entries(TD.TEMPER_MATERIALS).filter(([t]) => Number(t) < 7).map(([, m]) => m);
    if (!dw.mat || !before7.some((m) => m.item === dw.mat.item) || !D.items[dw.mat.item]) out.push('TU6 Dawnsteel takes ' + JSON.stringify(dw.mat) + ', not a salt a gear tier already takes');
    else if (dw.mat.qty.reduce((s, n) => s + n, 0) > m6.qty.reduce((s, n) => s + n, 0)) out.push('TU6 Dawnsteel asks more ' + dw.mat.item + ' a track than tier 6');
  }
  return out;
}

/* ── TU7: the smith's row, read by the client's own reader from `root` (the repo, or a planted copy) ── */
const TU7_SET = Object.freeze({ helmet: 'dawn_helm', body: 'dawn_platebody', pants: 'dawn_platelegs', boots: 'dawn_boots', gloves: 'dawn_gauntlets', belt: 'dawn_belt' });
async function smithRow(root) {
  const { BUILD } = await import(pathToFileURL(join(root, 'src/build-info.js')).href);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + '?v=' + BUILD.version);
  const { ITEMS: I } = await imp('src/data/items.js');
  const S = await imp('src/session/temper-sections.js');
  /* a unique plate set worn from 165, registered for the read and taken out after (the reader's own ITEMS instance) */
  const eq = {};
  for (const [slot, id] of Object.entries(TU7_SET)) { const k = 'tu7_' + slot; I[k] = { ...I[id], n: 'TU7 ' + slot, defB: Math.round(I[id].defB * 1.5), reqLv: 165, rarity: 'unique' }; eq[slot] = k; }
  const cs = (temper) => ({ read: (k) => (k === 'temper' ? temper : k === 'equipment' ? eq : k === 'inventory' ? {} : k === 'skills' ? {} : undefined) });
  const tier2 = { track: 'armor', tier: 2, rung: 0, max: 5, offer: 'temper.armor.2.1', gold: 2000, items: { temper_salts: 10 } };
  try {
    const sold = S.temperRowsOf(cs([tier2, { track: 'armor', tier: 125, rung: 0, max: 5, offer: 'temper.armor.125.1', gold: 80000, items: { ember_temper_salts: 10 } },
      { track: 'armor', tier: 165, rung: 2, max: 5, offer: 'temper.armor.165.3', gold: 400000, items: { ember_temper_salts: 40 } }]));
    const shut = S.temperRowsOf(cs([tier2]));
    return { sold: sold && sold.armor, shut: shut && shut.armor };
  } finally { for (const slot of Object.keys(TU7_SET)) delete I['tu7_' + slot]; }
}
async function tu7(root = ROOT) {
  const out = [];
  const { sold, shut } = await smithRow(root);
  if (!sold || sold.piece !== 'Unique armor' || sold.unique !== true) out.push('TU7 a unique set worn from 165 reads as ' + JSON.stringify(sold && sold.piece) + ' (unique ' + (sold && sold.unique) + '), not "Unique armor"');
  if (!sold || !sold.ladder || sold.ladder.tier !== 165 || sold.ladder.rung !== 2) out.push('TU7 the row finds the ladder ' + JSON.stringify(sold && sold.ladder) + ', want the server\'s 165 band at rung 2');
  if (!sold || sold.smallPm !== TD.TEMPER_UNIQUE_RUNG_PM) out.push('TU7 the row says a rung is ' + (sold && sold.smallPm) + ' pm, the band\'s is ' + TD.TEMPER_UNIQUE_RUNG_PM);
  if (!sold || JSON.stringify(sold.bands) !== '[125,165]') out.push('TU7 the row lists the bands ' + JSON.stringify(sold && sold.bands) + ', the server sells [125,165]');
  if (!sold || sold.nowPm !== 2 * TD.TEMPER_UNIQUE_RUNG_PM || sold.nextPm !== 3 * TD.TEMPER_UNIQUE_RUNG_PM) out.push('TU7 rung 2 of the band reads ' + (sold && sold.nowPm) + ' pm, next ' + (sold && sold.nextPm));
  if (!shut || shut.ladder !== null || (shut.bands || []).length) out.push('TU7 with no band sold the row finds ' + JSON.stringify(shut && shut.ladder) + ' and lists ' + JSON.stringify(shut && shut.bands));
  return out;
}
const SECTIONS = 'src/session/temper-sections.js';
const TU7_MUTANTS = [
  ['the row calls a band by its metal', [[SECTIONS, "const worn = line ? (unique ? 'Unique' : armourLineWord(line.armourClass, line.tier)) : null;", 'const worn = line ? armourLineWord(line.armourClass, 7) : null;']]],
  ['the bands are this build\'s table, not the server\'s', [[SECTIONS, "const bandsOf = (ladders) => [...new Set(ladders.filter((l) => l.track === 'armor' && l.tier >= TEMPER_UNIQUE_FROM).map((l) => l.tier))].sort((a, b) => a - b);",
    'const bandsOf = () => [110, 125, 145, 165];']]],
  ['the fight reads a unique by its tier, so the band\'s ladder pays nothing', [['src/data/temper.js', 'if (it.armourClass && it.slot && Number(it.tier) >= 7 && lv >= TEMPER_UNIQUE_FROM) {', 'if (false) {']]],
];

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
  ['Dawnsteel has no ladder', 'TU6', (D) => { D.dawn = null; }],
  ['a Dawnsteel ladder of 2.5%', 'TU6', (D) => { D.dawn.pm = 5; D.dawn.blowsPm = 5; }],
  ['a Dawnsteel rung worth a tier rung', 'TU6', (D) => { D.dawn.pm = 10; D.dawn.blowsPm = 10; }],
  ['Dawnsteel Blows at a tier rung', 'TU6', (D) => { D.dawn.blowsPm = 10; }],
  ['the first band no bigger than Dawnsteel', 'TU6', (D) => { D.pm = 4; }],
  ['Carter\'s Rest read as a 122 ground, where plate sits at the cap', 'TU6', (D) => { D.floors.carters_rest = 122; }],
  ['Dawnsteel cheaper than Emberforged', 'TU6', (D) => { D.dawn.gold = TD.TEMPER_TIERS[6].map((n) => n / 2); }],
  ['a Dawnsteel rung no dearer than the last', 'TU6', (D) => { D.dawn.gold[4] = D.dawn.gold[3]; }],
  ['a Dawnsteel salt no tier takes', 'TU6', (D) => { D.dawn.mat.item = 'dawn_bar'; }],
  ['Dawnsteel asks twice the salt', 'TU6', (D) => { D.dawn.mat.qty = D.dawn.mat.qty.map((n) => n * 2); }],
];

async function mutate() {
  const clean = [...problems(), ...(await tu7())];
  if (clean.length) { console.error('temper-uniques --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plantD] of MUTANTS) {
    const D = real();
    plantD(D);
    const got = problems(D);
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  for (const [name, edits] of TU7_MUTANTS) {
    const p = plant(edits, ['src/session', 'src/render']);
    let got;
    try { got = await tu7(p.root); } catch (e) { got = ['threw ' + e.message]; } finally { p.done(); }
    const caught = got.some((x) => x.startsWith('TU7 '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + 'TU7  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  const all = MUTANTS.length + TU7_MUTANTS.length;
  console.log(escaped ? 'temper-uniques --mutate: ' + escaped + ' of ' + all + ' ESCAPED' : 'temper-uniques --mutate: ' + all + ' of ' + all + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(await mutate());
  const bad = [...problems(), ...(await tu7())];
  if (bad.length) { console.error('temper-uniques: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  const open = bandsOf(real()).filter((b) => TD.TEMPER_UNIQUE_BANDS[b].open);
  console.log('temper-uniques: ' + bandsOf(real()).length + ' bands past Dawnsteel (' + (open.length ? 'open: ' + open.join(', ') : 'all shut, nothing sold') + '), a ladder at most 2.5%, the next band wins on every drafted ground, no ladder cheaper than the one before; Dawnsteel a ladder of ' + (real().dawn.rungs * real().dawn.pm / 10) + '%, under the line\'s next set; the smith\'s row reads the server\'s bands');
}
