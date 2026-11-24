#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gear-stats.mjs — EVERY PIECE OF GEAR IS THE ONE FORMULA'S, AND ON THE DANGER SCALE A PIECE IS ITS ITEM LEVEL AND NOTHING ELSE
// (Systems, lane/gear-catalogue-steps, 2026-11-22; src/core/gear-stats.js, src/data/gear-profiles.js, tools/gen-gear.mjs).
//
//   GSF-1 DERIVED: every gear row of the catalogue (and the hidden fist wraps and the staged special sample) carries exactly the stats the
//         formula gives its slot, item Level, profile and rarity (gen-gear readBack), and the generated table is what the generator would write.
//   GSF-2 NO STAT BY HAND, NO OFFSET: no item module types a base stat on a gear row as a number, and no row carries a `statPlus` (a named
//         piece is its name, a rule it carries, a Trait or a Signature: docs/design/redesign/28-named-pieces.md, lane/named-pieces 2026-11-23).
//   GSF-3 RARITY NEVER SIZES THE BASE (04-math-strategy section 10 rule 1): the same piece at every rarity has the same stats.
//   GSF-4 ON THE SCALE THE STEP CARRIES THE TIER: on a Danger-scale ground (scaleItems) every piece fights with the formula's stats at the
//         ground's base item Level moved GEAR_SCALE_STAT_PM (under 1000) of the way to its own, its own `iL` kept for the power step,
//         and any other ground reads the catalogue itself.
//   GSF-5 ONE VIEW FOR EVERY READER, AND ONLY ON THE SCALE: the edge settle, the start point's frozen peers and the browser's live view all
//         fight through combat-sim.js fightItems on the instance's own ground (so the three agree to the bit), which hands the scale view
//         to a fight whose plan names a stance (an input row's hero or a frozen peer's) and the catalogue as written to every other, a tier
//         hunt on a scale ground included (lane/scale-early-grounds 2026-11-23: a tier fixture's planted row never reached a cached view).
//   GSF-7 EVERY PIECE HAS AN ITEM LEVEL (the formula master's phase A, 27-formula-overhaul.md 2.3): every gear row carries a whole `iL`, 0 or over
//         (tier 0, item Level 0, is the starting kit: gear-steps.js; the Mill Cellar's and the Thicket's base, lane/scale-early-grounds).
//   GSF-6 THE CURVES CLIMB: within every ladder (GEAR_LADDERS) no rung's base stat is smaller in size than the rung below it.
//   GSF-8 A NAMED PIECE'S TRAIT IS A REAL ONE: a Trait's `fixedOn` (src/data/traits.js, read through gear-steps.js) names items of the
//         Trait's slot at a rank of 1 to 3, one fixed Trait a piece, and the ruling's table (28-named-pieces.md, outcome b) names those pieces.
//   GSF-9 ONE MATERIAL A TIER (lane/gear-phase-b; 12-targets.md 8.3, 27-formula-overhaul.md G-2 phase B, src/data/gear-tiers.js): every
//         material is its rung's grid tier (step = tier - 1, item Level tierLevel(step), worn from it less wearAhead) and every rung of every
//         ladder and every plain shield of it carries exactly that, but on a ground this test names whose rows still drop another tier (a
//         ground the derived list adds, or a named one that agrees again, is red); every scale ground's base is a material's item Level;
//         a tier with homes has every slot ladder's base (the armor lines, the weapon families, the codex, one shield, the ring, earrings,
//         necklace and cloak), each dropped piece drops on every home (a Scarce row of base-drops.js or a home body's own row), and each
//         made piece has its bench recipe at the tier's level, taking a part a body on a home drops, served.
//   GSF-10 PRICED PAST THE TOP: every stat curve's budget grows past GEAR_CURVE_TOP (src/core/gear-stats.js budgetOf), so no item Level is
//         capped (found items are never held to the ladder's top).
//
//   node tests/gear-stats.mjs            the guard
//   node tests/gear-stats.mjs --mutate   each rule driven red by a defect planted on an in-memory copy
//
// mutant-anchors: none — every mutant edits an in-memory copy of the rows or the sources, never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import * as GS from '../src/core/gear-stats.js';
import { fightItems } from '../src/core/combat-sim.js';
import { GEAR_STAT_FIELDS, RARITY_PM, GEAR_SCALE_STAT_PM, GEAR_CURVES, GEAR_CURVE_TOP } from '../src/data/gear-profiles.js';
import { GEAR_LADDERS, MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { DANGER_GROUNDS, GEAR_STEPS, tierLevel } from '../src/data/danger.js';
import { SHIELD_ITEMS } from '../src/data/shields.js';
import { SLOT_ITEMS, STEP_MADE } from '../src/data/slot-ladders.js';
import { BASE_DROPS } from '../src/data/base-drops.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { HUNT_GROUNDS, monstersOn } from '../src/data/hunt-grounds.js';
import { MONSTERS } from '../src/data/monsters.js';
import { GROUND_PACKS } from '../src/data/grounds/index.js';
import { TRAITS } from '../src/data/gear-steps.js';
import { ITEMS, ITEM_LEVELS } from '../src/data/items.js';
import { FIST_ITEMS } from '../src/data/fists.js';
import { SPECIAL_SAMPLE } from '../src/data/special-attributes.js';
import { deriveAll, readBack, render, OUT } from '../tools/gen-gear.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the modules that hold gear rows (GSF-2) */
const MODULES = ['src/data/items.js', 'src/data/gear-tiers.js', 'src/data/wave3-uniques.js', 'src/data/slot-ladders.js', 'src/data/champions.js',
  'src/data/boss-calls.js', 'src/data/library2-items.js', 'src/data/shields.js', 'src/data/fists.js', 'src/data/special-attributes.js'];
/* the three readers that build a hunt's members (GSF-5): each must hand memberSide the fight's view (fightItems) of the instance's own ground */
const READERS = [
  ['supabase/functions/hr-accrue/accrue-hunt.js', 'const ctx = { items: fightItems(inp.items || {}, inp.ground, inp.members, inp.scale),'],
  ['supabase/functions/hr-accrue/hunt-settle.js', 'const items = fightItems(ITEMS, (huntGroundOf(String(inst.hunt)) || {}).ground, members, play.level === null ? null : { level: play.level });'],
  ['src/hunt-view/live-engine.js', 'fight = fightItems(items, where.ground, live.members, scaleOf(live));'],
  ['src/hunt-view/live-engine.js', '{ items: fight }'],
  ['src/hunt-view/live-engine.js', 'items: s.items,'],
];
const statsOf = (it) => Object.fromEntries(GEAR_STAT_FIELDS.filter((k) => it && it[k]).map((k) => [k, it[k]]));
const same = (a, b) => JSON.stringify(statsOf(a)) === JSON.stringify(statsOf(b));

export function check(o) {
  const out = [];
  /* GSF-1 */
  const sample = Object.fromEntries(Object.entries(o.sample).map(([id, s]) => [id, { ...s, row: Object.fromEntries(Object.entries(s.row).filter(([k]) => !GEAR_STAT_FIELDS.includes(k))) }]));
  /* the formula refuses a row with an offset (src/core/gear-stats.js baseOf): that refusal is GSF-2's, the rest GSF-1's */
  let all = null;
  try { all = deriveAll(o.GS, o.items, o.fists, sample, o.scale); } catch (e) { out.push((/statPlus/.test(String(e && e.message)) ? 'GSF-2 ' : 'GSF-1 ') + 'the formula refuses the catalogue: ' + (e && e.message)); }
  if (all) {
    for (const b of readBack(all, { GS: o.GS, ITEMS: o.items, SPECIAL_SAMPLE: o.sample, GEAR_STAT_FIELDS })) out.push('GSF-1 ' + b);
    if (o.table !== render(all)) out.push('GSF-1 src/data/gear-stats.generated.js is not what tools/gen-gear.mjs writes');
  }
  /* GSF-2: a gear row's line (it names a slot) carries no `stat: number` (ammo is a supply, sized by hand), and no row states an offset */
  const STAT = new RegExp('\\b(' + GEAR_STAT_FIELDS.join('|') + ')\\s*:\\s*-?[\\d.]+');
  for (const [file, text] of Object.entries(o.sources)) {
    text.split('\n').forEach((line, i) => {
      if (/\bstatPlus\s*:/.test(line.replace(/\/\/.*$|\/\*.*?\*\//g, ''))) out.push('GSF-2 ' + file + ':' + (i + 1) + ' states a statPlus offset');
      if (!/\bslot\s*:/.test(line) || /ammo/.test(line)) return;
      if (STAT.test(line)) out.push('GSF-2 ' + file + ':' + (i + 1) + ' types ' + line.match(STAT)[0] + ' by hand');
    });
  }
  for (const [id, it] of Object.entries(o.items)) if (it && it.statPlus !== undefined) out.push('GSF-2 ' + id + ' carries a statPlus offset');
  /* GSF-3 */
  for (const profile of ['sword', 'plate', 'leather', 'jewel']) {
    const at = (rarity) => JSON.stringify(o.GS.gearStats({ slot: profile === 'jewel' ? 'ring' : profile === 'sword' ? 'weapon' : 'body', iL: 60, profile, rarity }));
    const one = at('common');
    for (const r of Object.keys(RARITY_PM)) if (at(r) !== one) out.push('GSF-3 a ' + r + ' ' + profile + ' piece is sized unlike a common one');
  }
  /* GSF-4 */
  const scaleGround = Object.keys(DANGER_GROUNDS)[0], gl = DANGER_GROUNDS[scaleGround].gearLevel;
  if (!(o.scalePm >= 0 && o.scalePm < 1000)) out.push('GSF-4 GEAR_SCALE_STAT_PM ' + o.scalePm + ': the stats would carry the whole tier on top of the power step');
  /* a catalogue the formula refused (GSF-2 above) has no scale view to read */
  const view = all ? o.scaleItems(o.items, { id: scaleGround }) : o.items;
  if (o.scaleItems(o.items, { id: 'no_such_ground' }) !== o.items) out.push('GSF-4 a ground off the scale does not read the catalogue itself');
  if (!all) { /* refused above */ } else if (view === o.items) out.push('GSF-4 ' + scaleGround + ' fights the catalogue as written');
  else {
    for (const l of GEAR_LADDERS) {
      const ids = l.ids.filter((id) => id && view[id]);
      for (const id of ids) {
        const want = o.GS.statsOfRow(o.items[id], o.GS.scaleStatLevel(gl, o.GS.baseOf(o.items[id], undefined, o.items).iL), o.items);
        if (!same(view[id], want)) { out.push('GSF-4 on ' + scaleGround + ' ' + id + ' fights ' + JSON.stringify(statsOf(view[id])) + ', not the formula at its scale Level ' + JSON.stringify(want)); break; }
      }
      for (const id of ids) if (o.items[id].iL !== view[id].iL) out.push('GSF-4 ' + id + ' lost its item Level on the scale');
    }
    /* and on a ground whose base is past the curve's top (the Catacomb wings, 160) the view's stats hold at the top: the item Level carries the
       rest (src/core/gear-stats.js scaleStatLevel) */
    const high = Object.keys(DANGER_GROUNDS).find((g) => DANGER_GROUNDS[g].gearLevel > GEAR_CURVE_TOP);
    if (high) {
      const hv = o.scaleItems(o.items, { id: high }), id = 'dawn_platebody';
      const want = o.GS.statsOfRow(o.items[id], GEAR_CURVE_TOP, o.items);
      if (hv[id] && !same(hv[id], want)) out.push('GSF-4 on ' + high + ' ' + id + ' fights ' + JSON.stringify(statsOf(hv[id])) + ', past the curve\'s top ' + JSON.stringify(want));
    }
  }
  /* GSF-5 */
  for (const [file, needle] of READERS) if (!o.readers[file] || !o.readers[file].includes(needle)) out.push('GSF-5 ' + file + ' builds a hunt\'s heroes without the fight\'s view (' + needle + ')');
  if (all) {
    const ground = { id: scaleGround }, scaled = o.scaleItems(o.items, ground);
    const stance = { risk: 'steady', danger: 0 };
    const cases = [['a lead naming a stance', [{ key: 'b', hero: {} }, { key: 'a', hero: stance }], scaled],
      ['a frozen peer naming a stance', [{ key: 'a', frozen: { hero: stance } }], scaled],
      ['a tier fight (no stance)', [{ key: 'a', hero: {} }, { key: 'b', frozen: { hero: {} } }], o.items]];
    for (const [what, ms, want] of cases) {
      if (o.fightItems(o.items, ground, ms, null) !== want) out.push('GSF-5 on ' + scaleGround + ' ' + what + ' fights ' + (want === scaled ? 'the catalogue as written' : 'the scale view'));
    }
    if (o.fightItems(o.items, { id: 'no_such_ground' }, cases[0][1], null) !== o.items) out.push('GSF-5 a stance off the scale reads a view, not the catalogue');
  }
  /* GSF-7 */
  for (const [id, it] of Object.entries(o.items)) if (o.GS.isGearRow(it) && !(Number.isInteger(it.iL) && it.iL >= 0)) out.push('GSF-7 ' + id + ' carries no item Level');
  /* GSF-8: the table's (b) rows, `| ... | \`<id>\` | ... | (b) | <Trait name> ... |`, and the rows that carry a fixedTrait are the same */
  const ruled = new Map();
  for (const line of o.doc.split('\n')) {
    const m = line.match(/^\|[^|]*\|\s*`([a-z0-9_:]+)`.*\|\s*\(b\)\s*\|\s*([^|]+?)\s*\|/);
    if (m) ruled.set(m[1], m[2]);
  }
  const fixed = new Map();
  for (const [tid, t] of Object.entries(o.traits)) {
    for (const [id, rank] of Object.entries(t.fixedOn || {})) {
      const it = o.items[id];
      if (fixed.has(id)) out.push('GSF-8 ' + id + ' carries two fixed Traits (' + fixed.get(id) + ', ' + tid + ')');
      fixed.set(id, tid);
      if (!it) { out.push('GSF-8 Trait ' + tid + ' is fixed on ' + id + ', which is not an item'); continue; }
      if (t.slot !== it.slot) out.push('GSF-8 ' + id + ' is a ' + it.slot + ' and its fixed Trait ' + tid + ' is made for the ' + t.slot);
      if (!(Number.isInteger(rank) && rank >= 1 && rank <= 3)) out.push('GSF-8 ' + id + '\'s fixed ' + tid + ' is rank ' + rank + ', not 1 to 3');
      if (!ruled.has(id) || !ruled.get(id).startsWith(t.name)) out.push('GSF-8 ' + id + ' carries ' + t.name + ' and 28-named-pieces.md does not rule it (b) ' + t.name);
    }
  }
  for (const id of ruled.keys()) if (!fixed.has(id)) out.push('GSF-8 28-named-pieces.md rules ' + id + ' (b) and no Trait is fixed on it');
  /* GSF-6 */
  for (const l of GEAR_LADDERS) {
    const rows = l.ids.filter((id) => id && o.items[id]).map((id) => [id, o.items[id]]);
    for (let i = 1; i < rows.length; i++) for (const k of GEAR_STAT_FIELDS) {
      if (Math.abs(rows[i][1][k] || 0) < Math.abs(rows[i - 1][1][k] || 0)) out.push('GSF-6 ' + rows[i][0] + '.' + k + ' ' + (rows[i][1][k] || 0) + ' under ' + rows[i - 1][0] + '\'s ' + (rows[i - 1][1][k] || 0));
    }
  }
  if (o.step) out.push(...stepLadder(o));
  /* GSF-10: every curve's budget still grows past the top it is drawn to (proportional to item Level), so no item Level is capped */
  for (const c of Object.keys(GEAR_CURVES)) {
    const top = GEAR_CURVE_TOP, next = top + GEAR_STEPS.tierSteps;
    if (!(o.GS.budgetOf(c, next) > o.GS.budgetOf(c, top))) out.push('GSF-10 the ' + c + ' curve holds past item Level ' + top + ' (' + o.GS.budgetOf(c, top) + ' at ' + top + ', ' + o.GS.budgetOf(c, next) + ' at ' + next + '): a piece past it is capped');
  }
  return out;
}

/* GSF-9's one named exception: a scale ground whose rows still drop another tier's pieces, stamped at its own base until the grounds' lane
   re-points them (12-targets 8.3; src/data/items.js STAMPED_ELSEWHERE). A ground the data adds to that list, or one named here that agrees
   again, is red: the name leaves this list the day its rows move. */
const RE_POINT_PENDING = Object.freeze(['hasks_ford', 'muster_barrows']);

/* GSF-9: ONE MATERIAL A TIER (src/data/gear-tiers.js MATERIAL_TIERS). `o.step` = { materials, ladders, shields, slotItems, baseDrops, made,
   recipes, scale, grounds, monstersOn, monsters, stagedItems, pending }. */
function stepLadder(o) {
  const out = [], S = o.step, own = (x, k) => !!x && Object.prototype.hasOwnProperty.call(x, k);
  /* every material on the grid: its rung, its step, its item Level, worn from it less wearAhead */
  S.materials.forEach((m, i) => {
    if (m.tier !== i + 1) out.push('GSF-9 ' + m.id + ' is tier ' + m.tier + ', not its rung (' + (i + 1) + ')');
    if (m.step !== m.tier - 1) out.push('GSF-9 ' + m.id + ' is step ' + m.step + ', not one tier a step from bronze\'s 0 (want ' + (m.tier - 1) + ')');
    if (m.iL !== tierLevel(m.step)) out.push('GSF-9 ' + m.id + ' is item Level ' + m.iL + ', off the grid (step ' + m.step + ' is ' + tierLevel(m.step) + ')');
    if (m.level !== Math.max(1, m.iL - GEAR_STEPS.wearAhead)) out.push('GSF-9 ' + m.id + ' is worn from ' + m.level + ', not its item Level less wearAhead');
  });
  /* the grounds that still drop another tier (their pieces keep the ground's stamp): exactly the names the test carries */
  const stamped = {};
  for (const [g, row] of Object.entries(S.scale)) {
    const m = Number.isInteger(row.ladderTier) ? S.materials[row.ladderTier - 1] : null;
    if (m && m.iL !== row.gearLevel) stamped[m.tier] = row.gearLevel;
    if (m && m.iL !== row.gearLevel && !S.pending.includes(g)) out.push('GSF-9 ' + g + ' drops ' + m.id + ' (item Level ' + m.iL + ') at its base ' + row.gearLevel + ': one tier, one item Level');
    if (S.pending.includes(g) && !(m && m.iL !== row.gearLevel)) out.push('GSF-9 ' + g + ' drops its own tier again: drop it from RE_POINT_PENDING');
    /* every scale ground's base is a material's item Level */
    if (Number.isInteger(row.gearLevel) && !S.materials.some((x) => x.iL === row.gearLevel)) out.push('GSF-9 ' + g + ' drops item Level ' + row.gearLevel + ' and no tier is there');
  }
  /* every rung and plain shield of a tier carries its step, item Level and wear (or its pending ground's stamp) */
  S.materials.forEach((m, at) => {
    const iL = own(stamped, m.tier) ? stamped[m.tier] : m.iL, wear = Math.max(1, iL - GEAR_STEPS.wearAhead);
    const ids = [...S.ladders.map((l) => l.ids[at]), ...Object.keys(S.shields).filter((id) => S.shields[id].tier === m.tier)].filter((id) => id && o.items[id]);
    for (const id of ids) {
      const it = o.items[id];
      if (it.step !== m.step || it.iL !== iL || it.reqLv !== wear) out.push('GSF-9 ' + id + ' is step ' + it.step + ', item Level ' + it.iL + ', worn from ' + it.reqLv + ': ' + m.id + ' is step ' + m.step + ', ' + iL + ', from ' + wear);
    }
  });
  for (const m of S.materials.filter((x) => (x.homes || []).length)) {
    const at = S.materials.indexOf(m), pieces = [];
    /* every slot ladder has its base at the tier */
    for (const l of S.ladders) {
      const id = l.ids[at];
      if (!id || !o.items[id]) out.push('GSF-9 ' + l.key + ' has no base at ' + m.id + ' (' + (id || 'no rung') + ')');
      else pieces.push(id);
    }
    const shields = Object.keys(S.shields).filter((id) => S.shields[id].step === m.step && o.items[id]);
    if (shields.length !== 1) out.push('GSF-9 ' + m.id + ' has ' + shields.length + ' shields, the ladder one');
    /* (a named find of the tier, a monster's own drop such as Elder Cinder's Dawnlit Mantle, is no rung of the made ladder) */
    const found = new Set(Object.values(S.monsters).flatMap((mo) => ((mo && mo.drops) || []).map((d) => d.id)));
    const made = ['ring', 'earrings', 'necklace', 'cape'].map((slot) => [slot, Object.keys(S.slotItems).filter((id) => S.slotItems[id].slot === slot && S.slotItems[id].step === m.step && o.items[id] && !found.has(id))]);
    for (const [slot, ids] of made) if (ids.length !== 1) out.push('GSF-9 ' + m.id + ' has ' + ids.length + ' ' + slot + ' pieces, the ladder one');
    /* a source for each: the dropped base on every home (its base row, or a home body's own row), the made pieces at their bench from a part */
    const bodyDrops = (h) => new Set([...S.monstersOn(S.grounds[h])].flatMap((mid) => ((S.monsters[mid] || {}).drops || []).map((d) => d.id)));
    for (const h of m.homes) {
      if (!own(S.grounds, h)) { out.push('GSF-9 ' + m.id + ' names a home ' + h + ' that is no ground'); continue; }
      const rows = new Set(((S.grounds[h].drops) || []).map((d) => d.id)), bodies = bodyDrops(h);
      for (const id of [...pieces, ...shields]) {
        const based = rows.has(id) && (S.baseDrops[h] || []).some((d) => d.id === id && d.band === 'scarce');
        if (!based && !bodies.has(id)) out.push('GSF-9 ' + id + ' does not drop on its home ' + h);
      }
    }
    const parts = new Set(m.homes.filter((h) => own(S.grounds, h)).flatMap((h) => [...bodyDrops(h)]));
    for (const [slot, ids] of made) for (const id of ids) {
      const r = [...S.made.smithing, ...S.made.crafting].find((x) => x.output === id);
      if (!r) { out.push('GSF-9 ' + id + ' (' + slot + ') has no bench recipe'); continue; }
      const bench = slot === 'cape' ? 'crafting' : 'smithing';
      if (!S.made[bench].includes(r) || r.req !== (bench === 'crafting' ? m.craft : m.smith)) out.push('GSF-9 ' + r.id + ' is not ' + bench + '\'s at the tier\'s level');
      if (!Object.keys(r.inputs).some((k) => parts.has(k) && k === m.parts[slot])) out.push('GSF-9 ' + r.id + ' takes no part a body on a home of ' + m.id + ' drops');
      /* on its bench exactly when every input is served (an item, no staged pack's: src/data/recipes.js servedMade), so the browser never offers
         a job the server lacks, and the job joins the day its pack ships */
      const served = Object.keys(r.inputs).every((k) => !!o.items[k] && !S.stagedItems.has(k)), onBench = (S.recipes[bench] || []).some((x) => x.id === r.id);
      if (served && !onBench) out.push('GSF-9 ' + r.id + ' is not on its bench though every input is served');
      if (!served && onBench) out.push('GSF-9 ' + r.id + ' is on its bench while its part waits with a staged pack');
    }
  }
  return out;
}

function live() {
  const sources = Object.fromEntries(MODULES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
  const readers = Object.fromEntries([...new Set(READERS.map(([f]) => f))].map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
  return { GS, items: ITEMS, fists: FIST_ITEMS, sample: SPECIAL_SAMPLE, table: readFileSync(OUT, 'utf8').replace(/\r/g, ''), sources, readers, scaleItems: GS.scaleItems, fightItems, scalePm: GEAR_SCALE_STAT_PM, scale: ITEM_LEVELS,
    traits: TRAITS, doc: readFileSync(join(ROOT, 'docs/design/redesign/28-named-pieces.md'), 'utf8').replace(/\r/g, ''),
    step: { materials: MATERIAL_TIERS, ladders: GEAR_LADDERS, shields: SHIELD_ITEMS, slotItems: SLOT_ITEMS, baseDrops: BASE_DROPS, made: STEP_MADE,
      recipes: ARTISAN_RECIPES, scale: DANGER_GROUNDS, grounds: HUNT_GROUNDS, monstersOn, monsters: MONSTERS,
      stagedItems: new Set(GROUND_PACKS.filter((p) => p.status === 'staged').flatMap((p) => Object.keys(p.items || {}))), pending: RE_POINT_PENDING } };
}
/* a copy of the step ladder's tables a mutant may edit */
const stepCopy = (o) => { o.step = { ...o.step, materials: o.step.materials.map((m) => ({ ...m })), baseDrops: { ...o.step.baseDrops }, made: { ...o.step.made },
  scale: { ...o.step.scale } }; return o.step; };

const MUTANTS = [
  ['GSF-1', 'a ladder piece keeps an armor point by hand', (o) => { o.items = { ...o.items, rune_platebody: { ...o.items.rune_platebody, defB: o.items.rune_platebody.defB + 1 } }; }],
  ['GSF-1', 'the generated table drifts from the formula', (o) => { o.table = o.table.replace('"dawn_sword": f({', '"dawn_sword": f({ atkB: 1 }), "dawn_sword~planted": f({'); }],
  ['GSF-2', 'a named row types its damage', (o) => { o.sources['src/data/wave3-uniques.js'] = o.sources['src/data/wave3-uniques.js'].replace("twoHanded:true,rarity:'epic'", "twoHanded:true,magicStrB:9,rarity:'epic'"); }],
  ['GSF-2', 'a named row states an offset again', (o) => { o.sources['src/data/wave3-uniques.js'] = o.sources['src/data/wave3-uniques.js'].replace("twoHanded:true,rarity:'epic'", "twoHanded:true,statPlus: { critB: 0.02 }, rarity:'epic'"); }],
  ['GSF-2', 'a loaded row carries an offset', (o) => { o.items = { ...o.items, demoncaller_staff: { ...o.items.demoncaller_staff, statPlus: { strB: 7 } } }; }],
  ['GSF-8', 'a fixed Trait made for another slot', (o) => { o.traits = { ...o.traits, file_breaker: { ...o.traits.file_breaker, fixedOn: { jarls_rimetorc: 1 } } }; }],
  ['GSF-8', 'a fixed Trait on no item', (o) => { o.traits = { ...o.traits, captains_due: { ...o.traits.captains_due, fixedOn: { barrow_kings_mantle: 1 } } }; }],
  ['GSF-8', 'a rank 4', (o) => { o.traits = { ...o.traits, captains_due: { ...o.traits.captains_due, fixedOn: { barrowking_mantle: 4 } } }; }],
  ['GSF-8', 'a ruled Trait the row lost', (o) => { const { fixedOn, ...r } = o.traits.captains_due; void fixedOn; o.traits = { ...o.traits, captains_due: r }; }],
  ['GSF-8', 'a Trait on a row the table never ruled', (o) => { o.traits = { ...o.traits, early_start: { ...o.traits.early_start, fixedOn: { jarls_rimetorc: 1 } } }; }],
  ['GSF-3', 'a Rare piece is bigger', (o) => { const g = o.GS; o.GS = { ...g, gearStats: (b) => { const s = g.gearStats(b); return b.rarity === 'rare' ? { ...s, defB: (s.defB || 0) + 1 } : s; } }; }],
  ['GSF-4', 'the scale view is the catalogue', (o) => { o.scaleItems = (items) => items; }],
  ['GSF-4', 'the stats carry the whole tier on the scale', (o) => { o.scalePm = 1000; }],
  ['GSF-4', 'the scale view sizes every piece at the base alone', (o) => {
    const g = o.GS;
    o.scaleItems = (items, gr) => {
      const L = DANGER_GROUNDS[gr.id] && DANGER_GROUNDS[gr.id].gearLevel;
      if (!L) return items;
      const v = {};
      for (const [k, it] of Object.entries(items)) {
        const st = g.isGearRow(it) && g.profileKeyOf(it) ? g.statsOfRow(it, L, items) : null;
        v[k] = st ? { ...Object.fromEntries(Object.entries(it).filter(([x]) => !GEAR_STAT_FIELDS.includes(x))), ...st } : it;
      }
      return v;
    };
  }],
  ['GSF-4', 'the scale view grows its stats past the curve\'s top on the wings', (o) => { const g = o.GS; o.scaleItems = (items, gr) => {
    const L = DANGER_GROUNDS[gr.id] && DANGER_GROUNDS[gr.id].gearLevel;
    if (!L) return items;
    const v = {};
    for (const [k, it] of Object.entries(items)) {
      const st = g.isGearRow(it) && g.profileKeyOf(it) ? g.statsOfRow(it, L + ((g.baseOf(it, undefined, items).iL - L) * GEAR_SCALE_STAT_PM) / 1000, items) : null;
      v[k] = st ? { ...Object.fromEntries(Object.entries(it).filter(([x]) => !GEAR_STAT_FIELDS.includes(x))), ...st } : it;
    }
    return v;
  }; }],
  ['GSF-4', 'the scale view drops the item Level', (o) => { const f = o.scaleItems; o.scaleItems = (items, g) => { const v = f(items, g); if (v === items) return v; const w = {}; for (const [k, it] of Object.entries(v)) { const { iL, ...r } = it; void iL; w[k] = r; } return w; }; }],
  ['GSF-5', 'the edge settle fights the catalogue as written', (o) => { const f = 'supabase/functions/hr-accrue/accrue-hunt.js'; o.readers[f] = o.readers[f].replace('items: fightItems(inp.items || {}, inp.ground, inp.members, inp.scale)', 'items: inp.items || {}'); }],
  ['GSF-5', 'the browser fights the catalogue as written', (o) => { const f = 'src/hunt-view/live-engine.js'; o.readers[f] = o.readers[f].replace('{ items: fight }', '{ items }'); }],
  ['GSF-5', 'the browser\'s swings read another view than its heroes', (o) => { const f = 'src/hunt-view/live-engine.js'; o.readers[f] = o.readers[f].replace('items: s.items,', 'items,'); }],
  ['GSF-5', 'a tier fight on a scale ground reads the scale view (a planted row never reaches it)', (o) => { o.fightItems = (items, g) => GS.scaleItems(items, g); }],
  ['GSF-5', 'a fight on the scale reads the catalogue', (o) => { o.fightItems = (items) => items; }],
  ['GSF-5', 'a frozen peer\'s stance is never read', (o) => { const f = o.fightItems; o.fightItems = (items, g, ms, sc) => f(items, g, ms.filter((m) => !m.frozen), sc); }],
  ['GSF-7', 'a piece with no item Level', (o) => { const { iL, ...r } = o.items.rune_sword; void iL; o.items = { ...o.items, rune_sword: r }; }],
  ['GSF-7', 'a piece under item Level 0', (o) => { o.items = { ...o.items, rune_sword: { ...o.items.rune_sword, iL: -20 } }; }],
  ['GSF-6', 'a rung steps down', (o) => { o.items = { ...o.items, rune_sword: { ...o.items.rune_sword, atkB: 1 } }; }],
  /* the ladder on steps (lane/gear-phase-b) */
  ['GSF-9', 'a tier off the grid', (o) => { const S = stepCopy(o); const m = S.materials[S.materials.length - 1]; m.iL -= 10; }],
  ['GSF-9', 'a tier a step off its rung', (o) => { const S = stepCopy(o); const m = S.materials[S.materials.length - 1]; m.step += 1; }],
  ['GSF-9', 'a tier worn at its item Level', (o) => { const S = stepCopy(o); S.materials[S.materials.length - 1].level += GEAR_STEPS.wearAhead; }],
  ['GSF-9', 'a scale ground past the last tier', (o) => { const S = stepCopy(o); S.scale.catacomb_bone_wing = { ...S.scale.catacomb_bone_wing, gearLevel: tierLevel(40) }; }],
  ['GSF-9', 'a rung keeps its old item Level', (o) => { o.items = { ...o.items, iron_sword: { ...o.items.iron_sword, iL: 15 } }; }],
  ['GSF-9', 'a rung keeps its old wear Level', (o) => { o.items = { ...o.items, steel_helm: { ...o.items.steel_helm, reqLv: 30 + 5 } }; }],
  ['GSF-9', 'a plain shield off its tier', (o) => { o.items = { ...o.items, ember_tower_shield: { ...o.items.ember_tower_shield, iL: 75 } }; }],
  ['GSF-9', 'a new ground drops another tier unnamed', (o) => { const S = stepCopy(o); S.scale.mill_cellar = { ...S.scale.mill_cellar, ladderTier: 3 }; }],
  ['GSF-9', 'a re-pointed ground still named', (o) => { const S = stepCopy(o); S.scale.hasks_ford = { ...S.scale.hasks_ford, ladderTier: 3 }; }],
  ['GSF-9', 'a slot ladder with no rung at a tier with homes', (o) => { const { wolfram_helm, ...r } = o.items; void wolfram_helm; o.items = r; }],
  ['GSF-9', 'a home that does not drop its base', (o) => { const S = stepCopy(o); S.grounds = { ...S.grounds, catacomb_flooded_wing: { ...S.grounds.catacomb_flooded_wing, drops: S.grounds.catacomb_flooded_wing.drops.filter((d) => d.id !== 'rowan_bow') } }; }],
  ['GSF-9', 'a made piece with no recipe', (o) => { const S = stepCopy(o); S.made.smithing = S.made.smithing.filter((r) => r.output !== 'wolfram_ring'); }],
  ['GSF-9', 'a made job on its bench while its part waits with a staged pack', (o) => { const S = stepCopy(o); S.recipes = { ...S.recipes, crafting: [...S.recipes.crafting, ...S.made.crafting] }; }],
  ['GSF-9', 'a made job kept off its bench once its pack ships', (o) => { const S = stepCopy(o); S.stagedItems = new Set(); }],
  ['GSF-10', 'the curve held at its top', (o) => { const g = o.GS; o.GS = { ...g, budgetOf: (c, iL) => g.budgetOf(c, Math.min(GEAR_CURVE_TOP, iL)) }; }],
];

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const [rule, name, plant] of MUTANTS) {
      const o = live();
      o.sources = { ...o.sources }; o.readers = { ...o.readers };
      plant(o);
      const hit = check(o).some((l) => l.startsWith(rule + ' '));
      console.log((hit ? 'caught  ' : 'MISSED  ') + rule + ' ' + name);
      if (!hit) bad++;
    }
    console.log(bad ? 'gear-stats --mutate: ' + bad + ' mutant(s) survived' : 'gear-stats --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
    process.exit(bad ? 1 : 0);
  }
  const out = check(live());
  if (out.length) { console.error('gear-stats: RED\n  ' + out.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log('gear-stats: every piece is the formula\'s, no stat by hand and no offset, every fixed Trait a real one, rarity never sizes the base, on the scale the step carries the tier (one view for every reader), every ladder climbs');
}
