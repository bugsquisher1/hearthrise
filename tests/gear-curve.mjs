#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gear-curve.mjs — THE GEAR CURVE IS ONE FORMULA: THE TIERS ARE ITS SAMPLES, THE LINE GOES ON FROM DAWNSTEEL, A BAND IS ONE STEP
// (lane/c-pace, balance program 44 R10 and R11; docs/design/overhaul/03-items-and-crafting.md 2.2; build plan FB-8 stage 1).
//
//   GC1  THE BANDS: band k opens at round(anchor x bandStep^k), they climb, at +17% they are the book's (110, 129, 151, 176, 206, 241,
//        282, 330, 386), bandAt answers the band at or under a Level (and `back` bands under it), nothing under the anchor, and the step
//        goes on past Level 10,000 (no last band).
//   GC2  THE LINE: from the anchor a line is its last sample x (anchor + slope x (Level - anchor)) / anchor, rounded; at the anchor and
//        from the last sample's Level up to it, it IS the last sample (Dawnsteel), so the tiers and the line join with no step.
//   GC3  THE SAMPLES: every weapon family and every armor weight and slot (the armor half: the designer's D-3, the tiers keep their built
//        armor) is a line whose samples sit at the tier Levels (MATERIAL_TIERS), every generated row is the curve at its tier's Level in
//        the line's fields, and a line's samples never fall up the ladder (a weapon tier always carries more).
//   GC4  THE STANDARD PIECE PAST THE ANCHOR is the line at the band at or under the Level, so a standard upgrade is one band step.
//   GC5  THE SPEND (R11): an empty buy is the line; a bill comes out of the paid number and is rounded DOWN (a unique never reads over its
//        line); accuracy given up buys nothing back; the accuracy rate falls as anchor / Level; what is bought rides along; a bill with no
//        blow share, or bigger than the line, is refused.
//   GC6  THE KNOBS ARE LINES: anchor, slope, bandStep and each weapon rate stand alone on one line of src/data/gear-curve.js (the knob
//        registry reads and plants them there), and the file imports nothing (one copy for the client, the edge and the tools).
//
//   node tests/gear-curve.mjs            the guard
//   node tests/gear-curve.mjs --mutate   each rule driven red by a defect planted on an in-memory copy
//
// mutant-anchors: none — every mutant edits an in-memory copy of the module's functions, tables or source text, never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import * as CURVE from '../src/data/gear-curve.js';
import { WEAPON_FAMILIES, WEAPON_LINES, ARMOUR_CURVE_LINES, GEAR_LADDERS, GEAR_ITEMS, MATERIAL_TIERS } from '../src/data/gear-tiers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'data', 'gear-curve.js');
/* the book's band table at +17% (chapter 03 section 2.2, GR-4) */
const BOOK_BANDS = Object.freeze([110, 129, 151, 176, 206, 241, 282, 330, 386]);
/* each knob's line in the source: the registry finds it by this text, so each stands alone, once */
const KNOB_LINES = Object.freeze(['  anchor: ', '  slope: ', '  bandStep: ', '    crit: ', '    accuracy: ', '    bane: ', '    baneElse: ']);
const FAR = 10000;

/** The world the rules read, swappable whole by a mutant. */
const world = () => ({ M: { ...CURVE }, lines: WEAPON_LINES, armor: ARMOUR_CURVE_LINES, ladders: GEAR_LADDERS, items: GEAR_ITEMS, families: WEAPON_FAMILIES,
  tiers: MATERIAL_TIERS, source: readFileSync(SOURCE, 'utf8') });

/** Every broken rule, as strings. Empty = sound. */
export function problems(w = world()) {
  const out = [], { M, lines, armor, ladders, items, families, tiers, source } = w;
  const C = M.GEAR_CURVE;
  /* GC1 */
  const bands = [];
  for (let k = 0; ; k++) { const b = M.bandLevel(k, C); if (b > FAR) break; bands.push(b); if (k > 500) { out.push('GC1 the bands do not climb past Level ' + FAR); break; } }
  if (bands[0] !== C.anchor) out.push('GC1 band 0 opens at ' + bands[0] + ', the anchor is ' + C.anchor);
  bands.forEach((b, k) => { if (b !== Math.round(C.anchor * C.bandStep ** k)) out.push('GC1 band ' + k + ' opens at ' + b + ', the step says ' + Math.round(C.anchor * C.bandStep ** k)); });
  for (let k = 1; k < bands.length; k++) if (!(bands[k] > bands[k - 1])) out.push('GC1 band ' + k + ' (' + bands[k] + ') does not climb over ' + bands[k - 1]);
  /* the step is GR-4's (+17%, chapter 12 section 3.6 for weapons): a new step is a ruling, and it re-pins the book's table here with it */
  if (JSON.stringify(bands.slice(0, BOOK_BANDS.length)) !== JSON.stringify(BOOK_BANDS)) out.push('GC1 the bands open at ' + bands.slice(0, BOOK_BANDS.length).join(', ') + ', the book\'s (GR-4, +17%) are ' + BOOK_BANDS.join(', '));
  if (M.bandAt(C.anchor - 1, 0, C) !== null) out.push('GC1 a band under the anchor: ' + M.bandAt(C.anchor - 1, 0, C));
  for (let L = C.anchor; L <= FAR; L += L < 1000 ? 1 : 37) {
    const want = bands.filter((b) => b <= L), got = M.bandAt(L, 0, C);
    if (got !== want[want.length - 1]) { out.push('GC1 the band at Level ' + L + ' reads ' + got + ', the band at or under it is ' + want[want.length - 1]); break; }
    const back = M.bandAt(L, 1, C), wb = want.length > 1 ? want[want.length - 2] : null;
    if (back !== wb) { out.push('GC1 one band back from Level ' + L + ' reads ' + back + ', it is ' + wb); break; }
  }
  if (!(M.bandAt(FAR, 0, C) > M.bandAt(FAR / 2, 0, C))) out.push('GC1 the band at Level ' + FAR + ' is no higher than at ' + FAR / 2 + ': a last band');
  /* GC2, GC3, GC4 for every line: each weapon family's, and each armor weight and slot's (the armor half, D-3: the tiers keep their built
     armor as the curve's samples, and the curve writes armor from the anchor). Each ladder of GEAR_LADDERS but the spellbook is a line. */
  const lineOf = (key) => (key.startsWith('weapon:') ? lines[key.slice(7)] : armor[key]) || null;
  for (const fam of families) if (!ladders.some((l) => l.key === 'weapon:' + fam.key)) out.push('GC3 weapon:' + fam.key + ' has no ladder');
  for (const lad of ladders) {
    if (lad.key === 'spellbook') continue;
    const line = lineOf(lad.key), fam = { key: lad.key, ids: lad.ids }, armorLine = !lad.key.startsWith('weapon:');
    if (!line) { out.push('GC3 ' + lad.key + ' is a ladder with no line on the curve'); continue; }
    if (line.key !== lad.key) out.push('GC3 the line for ' + lad.key + ' calls itself ' + line.key);
    const last = line.levels.length - 1, at = (L) => M.lineAt(line, L, null, M.GEAR_EXCHANGE.weapon, C);
    if (JSON.stringify(line.levels) !== JSON.stringify(tiers.map((t) => t.level))) out.push('GC3 ' + fam.key + ': its samples sit at ' + line.levels.join(', ') + ', the tiers are worn from ' + tiers.map((t) => t.level).join(', '));
    for (const [f, s] of Object.entries(line.fields)) {
      if (s.length !== line.levels.length) out.push('GC3 ' + fam.key + '.' + f + ': ' + s.length + ' samples for ' + line.levels.length + ' tiers');
      for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1]) out.push('GC3 ' + fam.key + '.' + f + ' falls from ' + s[i - 1] + ' to ' + s[i] + ' at tier ' + (i + 1));
    }
    /* a weapon tier always carries more; a light armor piece's armor may round level at the first tiers (cloth gloves carry 1 at tiers 1 and 2) */
    if (!armorLine) for (let i = 1; i <= last; i++) if (Object.values(line.fields).every((s) => s[i] <= s[i - 1])) out.push('GC3 ' + fam.key + ': tier ' + (i + 1) + ' carries nothing over tier ' + i);
    if (armorLine && !(line.fields.defB[last] > line.fields.defB[0])) out.push('GC3 ' + fam.key + ': its armor does not climb up the ladder');
    /* GC2 */
    for (const L of [line.levels[last], Math.round((line.levels[last] + C.anchor) / 2), C.anchor]) {
      const n = at(L);
      for (const [f, s] of Object.entries(line.fields)) if (!n || n[f] !== s[last]) out.push('GC2 ' + fam.key + '.' + f + ' at Level ' + L + ' reads ' + (n && n[f]) + ', the line there is its last sample ' + s[last]);
    }
    for (const L of [C.anchor + 1, 129, 165, 220, 400, 1000, 5000]) {
      const n = at(L);
      for (const [f, s] of Object.entries(line.fields)) {
        const want = Math.round(s[last] * (C.anchor + C.slope * (L - C.anchor)) / C.anchor);
        if (!n || n[f] !== want) out.push('GC2 ' + fam.key + '.' + f + ' at Level ' + L + ' reads ' + (n && n[f]) + ', the line says ' + want);
      }
    }
    /* GC3: the generated rows are the curve at their tier's Level */
    fam.ids.forEach((id, i) => {
      if (!id) return;
      const row = items[id], n = M.curveAt(line, tiers[i].level, C);
      if (!row) { out.push('GC3 ' + id + ' is not generated'); return; }
      for (const f of Object.keys(line.fields)) if (row[f] !== n[f]) out.push('GC3 ' + id + '.' + f + ' = ' + row[f] + ', the curve at Level ' + tiers[i].level + ' says ' + n[f]);
    });
    for (const L of [1, 14, 15, 44, 87, 88, 109]) {
      const i = line.levels.filter((l) => l <= L).length - 1, n = M.curveAt(line, L, C);
      for (const [f, s] of Object.entries(line.fields)) if (!n || n[f] !== s[i]) out.push('GC3 ' + fam.key + '.' + f + ' at Level ' + L + ' reads ' + (n && n[f]) + ', the tier at or under it carries ' + s[i]);
    }
    /* GC4 */
    for (const L of [C.anchor, 128, 129, 150, 200, 385, 386, 1000, 5000]) {
      const n = M.curveAt(line, L, C), w0 = at(M.bandAt(L, 0, C));
      for (const f of Object.keys(line.fields)) if (!n || n[f] !== w0[f]) out.push('GC4 ' + fam.key + '.' + f + ' at Level ' + L + ': the standard piece reads ' + (n && n[f]) + ', the line at its band (' + M.bandAt(L, 0, C) + ') is ' + w0[f]);
    }
  }
  /* GC5 */
  const X = M.GEAR_EXCHANGE.weapon, sword = lines.sword, L5 = 165, base = M.lineAt(sword, L5, null, X, C);
  const spent = (buy, L = L5) => { try { return M.lineAt(sword, L, buy, X, C); } catch (e) { return { error: e.message }; } };
  const empty = spent({ share: 0.35 });
  if (JSON.stringify(empty) !== JSON.stringify(base)) out.push('GC5 an empty buy reads ' + JSON.stringify(empty) + ', the line is ' + JSON.stringify(base));
  const keen = spent({ crit: 0.1, share: 0.35 }), billed = base.strB * (1 - 0.1 * X.crit / 0.35);
  if (!keen || keen.strB !== Math.floor(billed + 1e-9)) out.push('GC5 crit 0.1 on a share of 0.35 pays ' + (keen && keen.strB) + ', the bill leaves ' + billed.toFixed(3) + ', rounded down ' + Math.floor(billed + 1e-9));
  if (!keen || keen.critB !== 0.1 || keen.atkB !== base.atkB) out.push('GC5 a keen buy does not carry its crit (' + (keen && keen.critB) + ') or moved its accuracy');
  const dull = spent({ accuracy: -0.2, share: 0.35 });
  if (!dull || dull.strB !== base.strB || dull.atkB !== Math.round(base.atkB * 0.8)) out.push('GC5 accuracy given up reads ' + JSON.stringify(dull) + ': it costs nothing and buys nothing back');
  /* half again the line's accuracy, at the anchor and at three times it: billed at the rate x anchor / Level */
  const off = (L) => { const b = M.lineAt(sword, L, null, X, C), n = spent({ accuracy: 0.5, share: 0.35 }, L); return n && n.strB !== undefined ? Math.floor(b.strB * (1 - 0.5 * X.accuracy * Math.min(1, C.anchor / L) / 0.35) + 1e-9) - n.strB : null; };
  if (off(C.anchor) !== 0 || off(C.anchor * 3) !== 0) out.push('GC5 more accuracy is not billed at the rate x anchor / Level (off by ' + off(C.anchor) + ' at the anchor, ' + off(C.anchor * 3) + ' at three times it)');
  const bane = spent({ bane: { class: 'undead', mult: 1.1 }, share: 0.35 });
  if (!bane || !bane.bane || bane.bane.class !== 'undead' || bane.strB !== Math.floor(base.strB * (1 - 0.1 * X.bane.undead / 0.35) + 1e-9)) out.push('GC5 a bane of the Undead reads ' + JSON.stringify(bane) + ': billed at its class rate, carried along');
  const odd = spent({ bane: { class: 'nobody', mult: 1.1 }, share: 0.35 });
  if (!odd || !(odd.strB <= Math.floor(base.strB * (1 - 0.1 / 0.35) + 1e-9))) out.push('GC5 a bane of a class with no rate is not billed in full: ' + JSON.stringify(odd));
  if (!spent({ crit: 0.1 }).error) out.push('GC5 a bill with no blow share to pay from was taken');
  if (!spent({ crit: 1, share: 0.35 }).error) out.push('GC5 a bill bigger than the line was taken');
  /* GC6 */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/^\s*import\b|\bimport\s*\(|\brequire\s*\(/m.test(code)) out.push('GC6 src/data/gear-curve.js imports something: it must stay one pure copy for the client, the edge and the tools');
  for (const k of KNOB_LINES) {
    const hits = source.split(/\r?\n/).filter((ln) => ln.startsWith(k) && /\d/.test(ln));
    if (hits.length !== 1) out.push('GC6 the knob line "' + k.trim() + '" stands ' + hits.length + ' times in src/data/gear-curve.js, the registry reads it once');
  }
  return out;
}

/* ── the mutants: each a copy of the world with one defect ── */
const swap = (w, M) => ({ ...w, M: { ...w.M, ...M } });
const MUTANTS = [
  ['the band step played at the old +24%', 'GC1', (w) => swap(w, { GEAR_CURVE: { ...w.M.GEAR_CURVE, bandStep: 1.24 }, bandLevel: (k, C) => Math.round(C.anchor * 1.24 ** k) })],
  ['bandAt answers the band above', 'GC1', (w) => swap(w, { bandAt: (L, back = 0, C) => { const b = CURVE.bandAt(L, back, C); return b === null ? null : Math.round(b * C.bandStep); } })],
  ['a last band at Level 400', 'GC1', (w) => swap(w, { bandLevel: (k, C) => Math.min(400, CURVE.bandLevel(k, C)), bandAt: (L, back, C) => CURVE.bandAt(Math.min(L, 400), back, C) })],
  ['a band under the anchor', 'GC1', (w) => swap(w, { bandAt: (L, back, C) => (L < C.anchor ? C.anchor : CURVE.bandAt(L, back, C)) })],
  ['the line flat past the anchor (no slope)', 'GC2', (w) => swap(w, { lineAt: (line, L, buy, X, C) => CURVE.lineAt(line, Math.min(L, C.anchor), buy, X, C) })],
  ['the line through Level 1, not the anchor', 'GC2', (w) => swap(w, { lineAt: (line, L, buy, X, C) => { const n = CURVE.lineAt(line, L, buy, X, C); if (L >= line.levels[line.levels.length - 1] && L < C.anchor) for (const f of Object.keys(line.fields)) n[f] = Math.round(line.fields[f][line.levels.length - 1] * L / C.anchor); return n; } })],
  ['a generated row off its sample', 'GC3', (w) => ({ ...w, items: { ...w.items, rune_warhammer: { ...w.items.rune_warhammer, strB: 40 } } })],
  ['a sample falls up the ladder', 'GC3', (w) => ({ ...w, lines: { ...w.lines, staff: { ...w.lines.staff, fields: { ...w.lines.staff.fields, magicStrB: [5, 9, 14, 21, 29, 28, 49] } } } })],
  ['a line\'s samples off the tier Levels', 'GC3', (w) => ({ ...w, lines: { ...w.lines, bow: { ...w.lines.bow, levels: [1, 15, 30, 45, 60, 75, 90] } } })],
  ['a generated armor row off its sample (Dawnsteel helm 45 for 44)', 'GC3', (w) => ({ ...w, items: { ...w.items, dawn_helm: { ...w.items.dawn_helm, defB: 45 } } })],
  ['an armor ladder with no line on the curve', 'GC3', (w) => { const armor = { ...w.armor }; delete armor['leather:boots']; return { ...w, armor }; }],
  ['an armor line re-sampled on Dawnsteel x Level / 110 (D3-1, vetoable, not ruled)', 'GC3', (w) => ({ ...w, armor: { ...w.armor, 'plate:body': { ...w.armor['plate:body'], fields: { defB: [1, 11, 25, 37, 49, 61, 90] } } } })],
  ['the standard piece past the anchor read at the Level, not the band', 'GC4', (w) => swap(w, { curveAt: (line, L, C) => CURVE.lineAt(line, L, null, CURVE.GEAR_EXCHANGE.weapon, C) })],
  ['the bill rounded to nearest (a unique a point over its line)', 'GC5', (w) => swap(w, { lineAt: (line, L, buy, X, C) => { const n = CURVE.lineAt(line, L, buy, X, C); if (buy && buy.crit && n) n[line.pay] += 1; return n; } })],
  ['accuracy given up refunded in damage', 'GC5', (w) => swap(w, { lineAt: (line, L, buy, X, C) => { const n = CURVE.lineAt(line, L, buy, X, C); if (buy && buy.accuracy < 0 && n) n[line.pay] += 2; return n; } })],
  ['a bill taken with no share to pay it from', 'GC5', (w) => swap(w, { lineAt: (line, L, buy, X, C) => CURVE.lineAt(line, L, buy && !buy.share ? { ...buy, share: 1 } : buy, X, C) })],
  ['an unpriced class billed nothing', 'GC5', (w) => swap(w, { GEAR_EXCHANGE: { weapon: { ...CURVE.GEAR_EXCHANGE.weapon, baneElse: 0 } } })],
  ['the accuracy rate flat in Level', 'GC5', (w) => swap(w, { lineAt: (line, L, buy, X, C) => CURVE.lineAt(line, L, buy, { ...X, accuracy: X.accuracy * Math.max(C.anchor, L) / C.anchor }, C) })],
  ['two knobs on one line', 'GC6', (w) => ({ ...w, source: w.source.replace('  anchor: 110,\n  slope: 1,', '  anchor: 110, slope: 1,').replace('  anchor: 110,\r\n  slope: 1,', '  anchor: 110, slope: 1,') })],
  ['the curve imports the engine', 'GC6', (w) => ({ ...w, source: 'import { COMBAT_BALANCE } from \'../core/combat.js\';\n' + w.source })],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('gear-curve --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, make] of MUTANTS) {
    let got;
    try { got = problems(make(world())); } catch (e) { got = ['HARNESS ' + e.message]; }
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'gear-curve --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'gear-curve --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems();
  if (bad.length) { console.error('gear-curve: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  const C = CURVE.GEAR_CURVE;
  console.log('gear-curve: ' + WEAPON_FAMILIES.length + ' weapon lines and ' + Object.keys(ARMOUR_CURVE_LINES).length + ' armor lines, their tiers the curve\'s samples and the line on from Dawnsteel at Level ' + C.anchor
    + ', bands every +' + Math.round((C.bandStep - 1) * 100) + '% (' + BOOK_BANDS.slice(0, 5).join(', ') + ' ...) with no last band, a unique\'s bill rounded down, the knobs on their own lines');
}
