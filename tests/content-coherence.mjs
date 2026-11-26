#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/content-coherence.mjs — EVERY PIECE OF REDESIGN CONTENT HAS ITS HOMES (lane/content-pipeline, 2026-11-22).
//
//   node tests/content-coherence.mjs            the guard (reds exit 1; warnings print and pass)
//   node tests/content-coherence.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy of the rows (structuredClone), never a file
//
// WHY. docs/design/redesign/24-content-pipeline.md (Tyler 2026-11-22: "I also want EVERYTHING we've done to be scalable for later
// content"). tests/catalogue-coherence.mjs holds items and skills (a source, a use, a consumer); this holds the redesign's content
// to the homes its design gives it, so the next ground, move, Trait or Signature is a row plus this guard, not a hunt for what was
// forgotten:
//   CC-1  every Danger-scale ground (src/data/danger.js DANGER_GROUNDS) is a ground, has an ordered band (floor < ref < top, the top at
//         most PAY.gapMax over ref, at least one step a depth), a gear base on the tier grid, exactly ONE drop home (ladderTier or
//         named), a Trait pool that holds only Traits whose home is that ground, and a refKillsHead, when it has one, over
//         PAY.refKillsHead. A FAIR POOL (24-content-pipeline.md G4, lane/band-floor): the Traits that can roll there (their slot is one
//         the ground drops, CC-8) serve at least GEAR_STEPS.traitRoll.seatsMin seats. Red whether live or not: a scale ground is put on
//         the scale with its pool, never before. A ground whose entry Level rolls no rank (gear-steps.js maxRankAt, under 40: the Mill
//         Cellar to the Warrens) holds an empty pool instead (lane/scale-early-grounds)
//   CC-2  every scale ground's band is the one tools/new-ground.mjs measured and pinned (tests/danger-band-pins.json): the same
//         numbers (or the pin says why it was set by hand), measured on the same rows (the print of its pockets and monster rows). A
//         band is a measurement of the ground's own rows: a re-fit monster silently moves the band. A pin with no row is stale
//   CC-3  every Trait's home (`source`) is a ground that exists. A home OFF the scale cannot roll (12-targets 3.3): a warning while
//         Traits are hidden, red once GEAR_STEPS.traitsLive is true (the wave-4 roller sets it: a live Trait nobody can find is the
//         item-with-no-source class tests/catalogue-coherence.mjs C11 closes for items)
//   CC-4  every live move (src/data/abilities.js ABILITIES, active) has an icon (src/data/item-art.js ABILITY_ART)
//   CC-5  every live move has its road on the Roads (src/data/talents.js TALENT_NODES: at least ROAD.rank rank stones, ROAD.crossroads
//         crossroads of at least two options each, 17-talent-tree.md section 2) and its Signature (src/data/signatures.js SIGNATURES, a
//         row whose `move` is it), and every rune family (src/data/runes.js RUNE_FAMILIES, not hidden) its Signature (`family`).
//         WARN while the system is hidden (its module missing, or its RULES.live false), RED once it is live
//   CC-6  every Signature has one home that exists: { kind: 'ground' | 'monster' | 'chest', id } in HUNT_GROUNDS, MONSTERS or the
//         Hearth Chest keys (src/data/chests.js HEARTH_CHEST_KEYS); its move or family is a live one. Red whether live or not: a row
//         is data the day it is written
//   CC-7  every Roads node names what exists: a move node a live move, a vow or a border a country (DISCIPLINES, or 'hearth'), a
//         border two different countries. Red whether live or not
//   CC-8  every Trait can roll at its home: a Rare rolls its slot first (the piece that dropped), then a Trait of its (ground, slot)
//         cell (GEAR_STEPS.traitRoll, G8), so a Trait whose home never drops its slot (no monster or ground drop row of an item in that
//         slot) is one nobody can find. A warning while Traits are hidden, red once GEAR_STEPS.traitsLive is true. Capes and jewelry are
//         made at a bench, not dropped: a Trait in a made slot (src/data/drop-hours.js made) rolls on a piece made with a part its home
//         drops (the rule is data until the bench verb lands), so it counts as rollable wherever its home drops one
// The contract for talents.js and signatures.js (CC-5..CC-7) is 24-content-pipeline.md section 4, written so the Roads sample lane
// (20-v030-the-roads.md R-S) builds to it. Until then both read as missing, and CC-5 warns once per system.
// ════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { packPrint, sameBand } from '../tools/lib/danger-band.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const optional = async (p) => (existsSync(join(ROOT, p)) ? imp(p) : null);

/* A move's road (17-talent-tree.md section 2): 3 rank stones, crossroads I, 2 rank stones, crossroads II, then the open road. */
export const ROAD = Object.freeze({ rank: 5, crossroads: 2, options: 2 });
export const SIGNATURE_HOMES = Object.freeze(['ground', 'monster', 'chest']);

/** The data, read once. Every function here is pure on it, so --mutate plants on a copy. */
export async function real() {
  const { DANGER_GROUNDS, PAY, DEPTHS } = await imp('src/data/danger.js');
  const { GEAR_STEPS, TRAITS } = await imp('src/data/gear-steps.js');
  const { DROP_HOURS } = await imp('src/data/drop-hours.js');
  const { HUNT_GROUNDS, monstersOn } = await imp('src/data/hunt-grounds.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const { ABILITIES, DISCIPLINE_IDS } = await imp('src/data/abilities.js');
  const { ABILITY_ART } = await imp('src/data/item-art.js');
  const { RUNE_FAMILIES } = await imp('src/data/runes.js');
  const { HEARTH_CHEST_KEYS } = await imp('src/data/chests.js');
  const talents = await optional('src/data/talents.js');
  const sigs = await optional('src/data/signatures.js');
  const pinsFile = join(ROOT, 'tests', 'danger-band-pins.json');
  const pins = existsSync(pinsFile) ? JSON.parse(readFileSync(pinsFile, 'utf8')).grounds : {};
  const prints = Object.fromEntries(Object.keys(DANGER_GROUNDS).filter((g) => HUNT_GROUNDS[g]).map((g) => [g, packPrint(HUNT_GROUNDS[g], MONSTERS, monstersOn, DANGER_GROUNDS[g].monsters, DANGER_GROUNDS[g].formulaStep)]));
  const plain = (o) => JSON.parse(JSON.stringify(o));
  /* the Trait slots each ground drops: its monsters' drop rows and its own (a Catacomb wing's), read through the items' slots */
  const { ITEMS } = await imp('src/data/items.js');
  const TS = GEAR_STEPS.traitSlots;
  const traitSlotOf = (x) => Object.keys(TS).find((s) => s === x || TS[s].includes(x));
  const dropSlots = Object.fromEntries(Object.entries(HUNT_GROUNDS).map(([id, g]) => {
    const rows = [...monstersOn(g)].flatMap((m) => (MONSTERS[m] && MONSTERS[m].drops) || []).concat(g.drops || []);
    return [id, [...new Set(rows.map((r) => ITEMS[r.id] && ITEMS[r.id].slot).filter(Boolean).map(traitSlotOf).filter(Boolean))].sort()];
  }));
  return {
    dropSlots, roll: plain(GEAR_STEPS.traitRoll || {}),
    /* a MADE piece (drop-hours.js made, lane/drop-formula): a cape or jewel made with a ground's part rolls from that ground's cell, so a
       Trait in a made slot can roll wherever its home drops a part (an item carrying made.part) */
    made: { slots: [...DROP_HOURS.made.slots], parts: Object.fromEntries(Object.entries(HUNT_GROUNDS).map(([id, g]) => [id, [...monstersOn(g)].flatMap((m) => (MONSTERS[m] && MONSTERS[m].drops) || []).concat(g.drops || []).some((r) => ITEMS[r.id] && ITEMS[r.id][DROP_HOURS.made.part])])) },
    danger: plain(DANGER_GROUNDS), pay: { ...PAY }, depths: DEPTHS, tierSteps: GEAR_STEPS.tierSteps,
    grounds: Object.keys(HUNT_GROUNDS), monsters: Object.keys(MONSTERS), chests: HEARTH_CHEST_KEYS.map((k) => k.id),
    traits: plain(TRAITS), traitsLive: GEAR_STEPS.traitsLive === true, prints, pins: plain(pins),
    moves: Object.values(ABILITIES).filter((a) => a.active).map((a) => a.id), art: [...ABILITY_ART],
    families: Object.entries(RUNE_FAMILIES).filter(([, f]) => !f.hidden).map(([id]) => id),
    countries: [...DISCIPLINE_IDS, 'hearth'],
    talents: talents ? { live: !!(talents.TALENT_RULES && talents.TALENT_RULES.live), nodes: plain(Object.values(talents.TALENT_NODES || {})) } : null,
    signatures: sigs ? { live: !!(sigs.SIGNATURE_RULES && sigs.SIGNATURE_RULES.live), rows: plain(sigs.SIGNATURES || {}) } : null,
  };
}

/** { reds, warns } for the data `d`. Each finding starts with its rule's tag. */
export function problems(d) {
  const reds = [], warns = [];
  const has = (list, id) => list.includes(id);
  /* CC-1 */
  for (const [g, row] of Object.entries(d.danger)) {
    const at = 'CC-1 ' + g + ': ';
    if (!has(d.grounds, g)) reds.push(at + 'not a ground (HUNT_GROUNDS)');
    const { floorStep: f, refStep: r, topStep: t } = row;
    if (![f, r, t].every(Number.isInteger) || !(f < r && r < t)) reds.push(at + 'band not floor < ref < top (' + f + ' / ' + r + ' / ' + t + ')');
    else {
      if (t - r > d.pay.gapMax) reds.push(at + 'top ' + t + ' is more than PAY.gapMax ' + d.pay.gapMax + ' over ref ' + r);
      if (t - f < d.depths - 1) reds.push(at + 'band ' + f + '..' + t + ' is under one step a depth');
    }
    if (!Number.isInteger(row.gearLevel) || row.gearLevel % d.tierSteps !== 0) reds.push(at + 'gearLevel ' + row.gearLevel + ' is not a tier (tierLevel)');
    const homes = (Number.isInteger(row.ladderTier) ? 1 : 0) + (row.named ? 1 : 0);
    if (homes !== 1) reds.push(at + (homes ? 'two drop homes (ladderTier and named)' : 'no drop home (ladderTier or named)'));
    if (!Array.isArray(row.traits)) reds.push(at + 'no Trait pool');
    /* A GROUND THAT ROLLS NO RANK (lane/scale-early-grounds; gear-steps.js maxRankAt: rank 1 rolls from entry Level 40, 19-power-ledger
       section 2): no Trait can roll there, so its pool is empty, and the fair pool asks nothing of it (the Mill Cellar to the Warrens) */
    else if (row.maxRank === 0) { if (row.traits.length) reds.push(at + 'a Trait pool (' + row.traits.join(', ') + ') on a ground whose entry Level ' + row.entryLevel + ' rolls no rank'); }
    else {
      const rollable = row.traits.filter((id) => d.traits[id] && ((d.dropSlots[g] || []).includes(d.traits[id].slot) || (d.made.slots.includes(d.traits[id].slot) && d.made.parts[g] === true)));
      const seats = new Set(rollable.map((id) => d.traits[id].best && d.traits[id].best.seat));
      if (!(seats.size >= (d.roll.seatsMin || 2))) reds.push(at + 'not a fair Trait pool: the ' + rollable.length + ' Traits that can roll here (a slot it drops) serve ' + seats.size + ' seats, under traitRoll.seatsMin ' + d.roll.seatsMin);
    }
    for (const id of row.traits || []) if (!d.traits[id] || d.traits[id].source !== g) reds.push(at + 'pool Trait ' + id + (d.traits[id] ? ' lives on ' + d.traits[id].source : ' is no Trait'));
    if (!(Number.isInteger(row.entryLevel) && row.entryLevel > 0)) reds.push(at + 'no entryLevel (its Trait ranks and its LOW cell read it; tests/gear-steps.mjs GS-5 holds it to its hunt)');
    if (row.refKillsHead !== undefined && !(Number.isInteger(row.refKillsHead) && row.refKillsHead > d.pay.refKillsHead)) reds.push(at + 'refKillsHead ' + row.refKillsHead + ' not over PAY.refKillsHead ' + d.pay.refKillsHead);
  }
  /* CC-2 */
  for (const [g, row] of Object.entries(d.danger)) {
    const pin = d.pins[g], at = 'CC-2 ' + g + ': ';
    if (!pin) { reds.push(at + 'no measured pin: node tools/new-ground.mjs ' + g + ' --entry L --top L --write'); continue; }
    if (!sameBand(row, pin) && !pin.hand) reds.push(at + 'band ' + [row.floorStep, row.refStep, row.topStep, row.refKillsHead].join('/') + ' is not the measured ' + [pin.floorStep, pin.refStep, pin.topStep, pin.refKillsHead].join('/') + ' (re-measure, or the pin says why by hand)');
    if (pin.hand && !sameBand(row, pin)) reds.push(at + 'band differs from its hand pin: re-pin with the reason');
    if (d.prints[g] !== undefined && pin.print !== d.prints[g]) reds.push(at + 'its pockets or monster rows changed since its band was measured (print ' + pin.print + ' -> ' + d.prints[g] + '): node tools/new-ground.mjs ' + g + ' --entry ' + ((pin.levels && pin.levels.entry) || 'L') + ' --top ' + ((pin.levels && pin.levels.top) || 'L') + ' --write');
  }
  for (const g of Object.keys(d.pins)) if (!d.danger[g]) reds.push('CC-2 ' + g + ': a pin for a ground not on the scale (stale)');
  /* CC-3 */
  const offScale = {};
  for (const [id, t] of Object.entries(d.traits)) {
    if (!has(d.grounds, t.source)) reds.push('CC-3 Trait ' + id + ': home ' + t.source + ' is not a ground');
    else if (!d.danger[t.source]) (offScale[t.source] = offScale[t.source] || []).push(id);
  }
  for (const [g, ids] of Object.entries(offScale)) (d.traitsLive ? reds : warns).push('CC-3 ' + ids.length + ' Traits homed on ' + g + ', off the scale (cannot roll until it is cut): ' + ids.join(', '));
  /* CC-8 */
  const unrollable = {};
  for (const [id, t] of Object.entries(d.traits)) {
    const made = d.made.slots.includes(t.slot) && d.made.parts[t.source] === true;
    if (has(d.grounds, t.source) && !made && !(d.dropSlots[t.source] || []).includes(t.slot)) (unrollable[t.source] = unrollable[t.source] || []).push(id + ' (' + t.slot + ')');
  }
  for (const [g, ids] of Object.entries(unrollable)) (d.traitsLive ? reds : warns).push('CC-8 ' + g + ' drops no piece in the slot of ' + ids.join(', ') + ': a Rare rolls its slot first, so these cannot roll there' + (d.traitsLive ? '' : ' (hidden: Traits)'));
  /* CC-4 */
  for (const m of d.moves) if (!has(d.art, m)) reds.push('CC-4 move ' + m + ': no icon (src/data/item-art.js ABILITY_ART)');
  /* CC-5 */
  const owe = (sys, live, msg) => (live ? reds : warns).push('CC-5 ' + msg + (live ? '' : ' (hidden: ' + sys + ')'));
  if (!d.talents) warns.push('CC-5 the Roads are owed: no src/data/talents.js, so no move has its rank stones or crossroads yet (' + d.moves.length + ' moves)');
  else for (const m of d.moves) {
    const mine = d.talents.nodes.filter((n) => n.move === m);
    const ranks = mine.filter((n) => n.kind === 'rank').length;
    const xs = mine.filter((n) => n.kind === 'crossroads' && Array.isArray(n.options) && n.options.length >= ROAD.options).length;
    if (ranks < ROAD.rank) owe('talents', d.talents.live, 'move ' + m + ': ' + ranks + ' rank stones of ' + ROAD.rank);
    if (xs < ROAD.crossroads) owe('talents', d.talents.live, 'move ' + m + ': ' + xs + ' crossroads of ' + ROAD.crossroads);
  }
  if (!d.signatures) warns.push('CC-5 Signatures are owed: no src/data/signatures.js (' + d.moves.length + ' moves, ' + d.families.length + ' rune families)');
  else {
    const rows = Object.values(d.signatures.rows);
    for (const m of d.moves) if (!rows.some((s) => s.move === m)) owe('signatures', d.signatures.live, 'move ' + m + ': no Signature');
    for (const f of d.families) if (!rows.some((s) => s.family === f)) owe('signatures', d.signatures.live, 'rune family ' + f + ': no Signature');
  }
  /* CC-6 */
  if (d.signatures) for (const [id, s] of Object.entries(d.signatures.rows)) {
    const h = s.home || {}, at = 'CC-6 Signature ' + id + ': ';
    const list = h.kind === 'ground' ? d.grounds : h.kind === 'monster' ? d.monsters : h.kind === 'chest' ? d.chests : null;
    if (!list) reds.push(at + 'home kind ' + h.kind + ' is not one of ' + SIGNATURE_HOMES.join(', '));
    else if (!has(list, h.id)) reds.push(at + 'home ' + h.kind + ' ' + h.id + ' does not exist');
    if (s.move !== undefined && !has(d.moves, s.move)) reds.push(at + 'move ' + s.move + ' is not a live move');
    if (s.family !== undefined && !has(d.families, s.family)) reds.push(at + 'rune family ' + s.family + ' is not a family');
  }
  /* CC-7 */
  if (d.talents) for (const n of d.talents.nodes) {
    const at = 'CC-7 node ' + n.id + ': ';
    if (n.move !== undefined && !has(d.moves, n.move)) reds.push(at + 'move ' + n.move + ' is not a live move');
    if ((n.kind === 'vow' || n.kind === 'border') && n.country !== undefined && !has(d.countries, n.country)) reds.push(at + 'country ' + n.country + ' does not exist');
    if (n.kind === 'border') {
      const c = n.countries || [];
      if (c.length !== 2 || c[0] === c[1] || !c.every((x) => has(d.countries, x))) reds.push(at + 'a border joins two different countries (' + c.join(', ') + ')');
    }
  }
  return { reds, warns };
}

/* THE MUTANTS: each plants one defect on a copy and must be caught by the tag it names. */
const first = (d) => Object.keys(d.danger)[0];
const sample = (d, live) => {
  d.talents = { live, nodes: d.moves.flatMap((m) => [1, 2, 3, 4, 5].map((i) => ({ id: m + '_r' + i, kind: 'rank', move: m }))
    .concat([1, 2].map((i) => ({ id: m + '_x' + i, kind: 'crossroads', move: m, options: ['a', 'b', 'c'] })))) };
  d.signatures = { live, rows: Object.fromEntries(d.moves.map((m) => ['sig_' + m, { move: m, home: { kind: 'ground', id: first(d) } }])
    .concat(d.families.map((f) => ['sig_' + f, { family: f, home: { kind: 'chest', id: d.chests[0] } }]))) };
};
export const MUTANTS = [
  ['CC-1 a scale ground that is no ground', (d) => { d.danger.nowhere_field = { ...d.danger[first(d)] }; }],
  ['CC-1 a band out of order', (d) => { d.danger[first(d)].floorStep = d.danger[first(d)].topStep; }],
  ['CC-1 a top past the pay cap', (d) => { const r = d.danger[first(d)]; r.topStep = r.refStep + d.pay.gapMax + 5; }],
  ['CC-1 a gear base off the tier grid', (d) => { d.danger[first(d)].gearLevel += 3; }],
  ['CC-1 no drop home', (d) => { const r = d.danger[first(d)]; delete r.ladderTier; delete r.named; }],
  ['CC-1 two drop homes', (d) => { const r = d.danger[first(d)]; r.ladderTier = 3; r.named = 'catacomb'; }],
  ['CC-1 no Trait pool at all', (d) => { delete d.danger[first(d)].traits; }],
  ['CC-1 an empty pool', (d) => { d.danger[first(d)].traits = []; }],
  ['CC-1 a pool only on slots the ground never drops', (d) => { d.dropSlots.hasks_ford = ['cape']; }],
  ['CC-1 a pool of one seat', (d) => { for (const id of d.danger.hasks_ford.traits) d.traits[id].best.seat = 'tank'; }],
  /* lane/scale-early-grounds: a ground under rank 1's entry Level holds no pool */
  ['CC-1 a pool on a ground that rolls no rank', (d) => { const g = Object.keys(d.danger).find((k) => d.danger[k].maxRank === 0); d.danger[g].traits = [...d.danger.hasks_ford.traits]; for (const id of d.danger[g].traits) d.traits[id].source = g; }],
  ['CC-1 a pool Trait from another ground', (d) => { const g = first(d), other = Object.keys(d.traits).find((id) => d.traits[id].source !== g); d.danger[g].traits.push(other); }],
  ['CC-1 no entry Level', (d) => { delete d.danger[first(d)].entryLevel; }],
  ['CC-1 refKillsHead under the ceiling', (d) => { d.danger[first(d)].refKillsHead = d.pay.refKillsHead - 1; }],
  ['CC-2 a band nobody measured', (d) => { const g = Object.keys(d.danger).find((x) => !d.pins[x].hand); d.danger[g].refStep += 10; }],
  ['CC-2 a ground re-fit since its band', (d) => { d.prints[first(d)] = 'f'.repeat(16); }],
  ['CC-2 a scale ground with no pin', (d) => { delete d.pins[first(d)]; }],
  ['CC-2 a stale pin', (d) => { d.pins.nowhere_field = { ...d.pins[first(d)] }; }],
  ['CC-2 a hand pin that no longer matches', (d) => { const g = first(d); d.pins[g].hand = 'set by hand'; d.danger[g].topStep -= 5; }],
  ['CC-3 a Trait homed nowhere', (d) => { d.traits[Object.keys(d.traits)[0]].source = 'nowhere_field'; }],
  /* (lane/scale-grounds-sweep: every Trait home is on the scale now, so the plant homes one on a ground off it) */
  ['CC-3 live Traits, one homed off the scale', (d) => { d.traitsLive = true; d.traits[Object.keys(d.traits)[0]].source = Object.keys(d.grounds).find((g) => !Object.prototype.hasOwnProperty.call(d.danger, g)); }],
  ['CC-4 a live move with no icon', (d) => { d.art = d.art.filter((m) => m !== d.moves[0]); }],
  ['CC-5 live Roads, a move short a rank stone', (d) => { sample(d, true); const i = d.talents.nodes.findIndex((n) => n.kind === 'rank'); d.talents.nodes.splice(i, 1); }],
  ['CC-5 live Roads, a crossroads of one option', (d) => { sample(d, true); d.talents.nodes.find((n) => n.kind === 'crossroads').options = ['a']; }],
  ['CC-5 live Signatures, a move with none', (d) => { sample(d, true); delete d.signatures.rows['sig_' + d.moves[0]]; }],
  ['CC-5 live Signatures, a rune family with none', (d) => { sample(d, true); delete d.signatures.rows['sig_' + d.families[0]]; }],
  ['CC-6 a Signature homed nowhere', (d) => { sample(d, false); d.signatures.rows['sig_' + d.moves[0]].home = { kind: 'monster', id: 'nobody' }; }],
  ['CC-6 a Signature with a made-up home kind', (d) => { sample(d, false); d.signatures.rows['sig_' + d.moves[0]].home = { kind: 'shop', id: 'x' }; }],
  ['CC-6 a Signature on a move that is not live', (d) => { sample(d, false); d.signatures.rows['sig_' + d.moves[0]].move = 'brand'; }],
  ['CC-7 a node on a move that is not live', (d) => { sample(d, false); d.talents.nodes.push({ id: 'x', kind: 'rank', move: 'brand' }); }],
  ['CC-7 a vow in no country', (d) => { sample(d, false); d.talents.nodes.push({ id: 'v', kind: 'vow', country: 'spear' }); }],
  ['CC-8 live Traits, a made slot on a home that drops no part', (d) => { d.traitsLive = true; for (const g of Object.keys(d.dropSlots)) d.dropSlots[g] = [...new Set([...d.dropSlots[g], 'weapon', 'shield', 'body', 'pants', 'helmet', 'boots', 'gloves', 'belt'])]; d.made.parts.muster_barrows = false; }],
  ['CC-8 live Traits, one on a slot its home never drops', (d) => { d.traitsLive = true; for (const g of Object.keys(d.dropSlots)) d.dropSlots[g] = [...new Set([...d.dropSlots[g], 'cape', 'necklace', 'ring', 'earrings'])]; d.dropSlots.hasks_ford = d.dropSlots.hasks_ford.filter((s) => s !== 'pants'); }],   // (the Ford's Goaded rolls on its legs; it homes no belt Trait)
  ['CC-7 a border inside one country', (d) => { sample(d, false); d.talents.nodes.push({ id: 'b', kind: 'border', countries: ['club', 'club'] }); }],
];

if (isMain(import.meta.url)) {
  const d = await real();
  if (process.argv.includes('--mutate')) {
    /* the control: a full sample, hidden and live, is clean */
    for (const live of [false, true]) { const c = structuredClone(d); sample(c, live); const p = problems(c); if (p.reds.length) { console.error('control (' + (live ? 'live' : 'hidden') + ' sample) is red:\n  ' + p.reds.join('\n  ')); process.exit(1); } }
    let missed = 0;
    for (const [name, plant] of MUTANTS) {
      const c = structuredClone(d); plant(c);
      const tag = name.slice(0, 4), caught = problems(c).reds.some((x) => x.startsWith(tag));
      console.log((caught ? '✓ caught ' : '✗ MISSED ') + name);
      if (!caught) missed++;
    }
    console.log(missed ? missed + ' of ' + MUTANTS.length + ' mutants missed' : 'all ' + MUTANTS.length + ' mutants caught');
    process.exit(missed ? 1 : 0);
  }
  const { reds, warns } = problems(d);
  for (const w of warns) console.log('  warn ' + w);
  for (const r of reds) console.log('  RED  ' + r);
  console.log('content-coherence: ' + Object.keys(d.danger).length + ' scale grounds, ' + Object.keys(d.traits).length + ' Traits, ' + d.moves.length + ' live moves; '
    + reds.length + ' red, ' + warns.length + ' warnings');
  process.exit(reds.length ? 1 : 0);
}
