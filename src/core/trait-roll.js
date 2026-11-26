// ============================================================
// src/core/trait-roll.js — THE TRAIT ROLLER: WHICH HERO FINDS A RARE OR A VERY RARE, IN WHICH SLOT, WITH WHICH TRAITS AT WHICH RANK
// (systems, lane/drop-formula, 2026-11-22; 04-math-strategy.md section 10, 12-targets.md 3.3 and 8.1, 21-flame-temper-imbue-loot.md
// sections 1.2 D-4 and 4, 24-content-pipeline.md G8; the numbers are src/data/drop-hours.js and src/data/gear-steps.js).
//
// DARK (GEAR_STEPS.traitsLive false): the settle carries this roller, but it runs only when its caller hands the engine a `traitDrops`
// (combat-sim.js simulateHuntInstance ctx.traitDrops), and no server or client file does while Traits are dark (tests/drop-formula.mjs
// DF-6). The Lab and the tests hand it one. With none, nothing here is called and not one die is drawn: every hunt plays as before.
//
// ONE KILL, ONE HERO (personal loot, 21 section 4): every hero at the kill (alive at it, the XP share's rule) rolls its own, on its OWN
// server-only stream (seed domain `t:<unit>`, one a swing), so a hero's finds never depend on who else stood there, and a window cut
// anywhere draws the same numbers. Rarest first (DROP_HOURS.rolls):
//   p(rarity) = chanceOf(its hours, the ground's reference kills a head an hour) / heroes at the kill
//               x depthRarePm (x1 at depth 1 to x3 at depth 20, read against the reference's depth)
//               x (1000 + luckPm) / 1000 (the hero's company flame, 21 section 1.2: after depth, before pity)
//   then pity (pityChance), one draw: a hit ends the kill's roll for that hero, a miss counts toward the next
// A HIT (12-targets 8.1, GEAR_STEPS.traitRoll):
//   1. the SLOT, uniformly over the ground's rollable cells: a Trait slot the ground drops a piece of (drop-rate.js traitSlotsDropped,
//      slotFirst) that holds a Trait whose home is the ground; a Very Rare only over cells with an allowed pair
//   2. the first Trait, uniformly from that cell (at most GEAR_STEPS.traitRoll.cellMax a cell: content-coherence / gear-steps hold it)
//   3. a Very Rare's second: uniformly over the slot's allowed partners (veryRarePairs: any other Trait of the slot from any ground, never
//      one key, never a banned pair)
//   4. each Trait's rank: the top rank open at the depth (rankDepths, held to the ground's maxRank), landing at topRankPm x (1 + luck), at
//      most topRankMaxPm, else one under (21 D-4: depth sets the ceiling, luck how often it is reached)
//   5. the BASE (lane/t1-traits-drop): uniformly over the pieces the ground drops in that slot at its base item Level (drop-rate.js
//      traitBasesOf), drawn LAST so no draw above moves
// The piece: { key, unit, rarity, slot, base, traits: [{ id, rank }], ground, step, depth, iL, kill, atMs } (iL the ground's gearLevel: the
// ground fixes the base; step the swing's, the one the server derives the depth from; kill the monster's unit, so the kill that made it is
// named and the server lands it once).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { GEAR_STEPS, TRAITS } from '../data/gear-steps.js';
import { DANGER_GROUNDS } from '../data/danger.js';
import { DROP_HOURS, chanceOf } from '../data/drop-hours.js';
import { killsHeadHour, depthOf, depthRarePm, traitSlotsDropped, traitBasesOf } from './drop-rate.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** THE VERY RARE PAIR RULE (12-targets 8.1): the pairs a Very Rare of `slot` found on `source` may carry, [[a, b]] sorted. The first
    Trait from that ground's pool for the slot, the second any other Trait of the slot, never two of one key, never a banned pair. */
export function veryRarePairs(traits, banned, source, slot) {
  const ofSlot = Object.keys(traits).filter((id) => traits[id].slot === slot);
  const seen = new Set();
  for (const a of ofSlot.filter((id) => traits[id].source === source)) {
    for (const b of ofSlot) {
      const tag = [a, b].sort().join('+');
      if (a !== b && traits[a].key !== traits[b].key && !banned.includes(tag)) seen.add(tag);
    }
  }
  return [...seen].sort().map((tag) => tag.split('+'));
}

/** A ground's ROLLABLE CELLS, { slot: [Trait ids] }: the Trait slots it drops a piece of that hold a Trait whose home it is. */
export function rollableCells(ground, traits = TRAITS) {
  const slots = traitSlotsDropped(ground, GEAR_STEPS.traitSlots);
  const out = {};
  for (const s of slots) {
    const ids = Object.keys(traits).filter((id) => traits[id].source === ground.id && traits[id].slot === s).sort();
    if (ids.length) out[s] = ids;
  }
  return out;
}

/** PITY (04 guard 5): the chance after `misses` missed rolls, linear and solved for the mean: C x (misses + 1), C = pi / 2 x p^2, so the
    kills to a hit average 1 / p and the tail is a Rayleigh's (p90 1.71 x the mean, against 2.30 with none). `on` false: p, every roll. */
export function pityChance(p, misses, on) {
  if (!(p > 0)) return 0;
  if (!on) return Math.min(1, p);
  return Math.min(1, ((Math.PI / 2) * p * p) * ((Number.isInteger(misses) && misses > 0 ? misses : 0) + 1));
}

/** The rank one Trait rolls at `depth` on a ground whose top is `maxRank` (21 D-4): 0 when none is open. One draw only when two are. */
export function rankRoll(depth, maxRank, luckPm, rng) {
  let top = 0;
  GEAR_STEPS.rankDepths.forEach((d, i) => { if (depth >= d && i + 1 <= maxRank) top = i + 1; });
  if (top <= 1) return top;
  const pm = Math.min(DROP_HOURS.topRankMaxPm, (DROP_HOURS.topRankPm * (1000 + (luckPm || 0))) / 1000);
  return rng.next() < pm / 1000 ? top : top - 1;
}

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng.next() * list.length))];

/* the piece a hit makes: slot, then Traits, then ranks, then the base (the header's steps 1 to 5) */
function makePiece(rarity, ground, step, depth, luckPm, rng, cells, slots, bases) {
  const row = DANGER_GROUNDS[ground.id];
  const banned = GEAR_STEPS.veryRareBanned;
  const slot = pick(slots, rng);
  const first = pick(cells[slot], rng);
  const ids = [first];
  if (rarity === 'very_rare') {
    const partners = veryRarePairs(TRAITS, banned, ground.id, slot).filter((pr) => pr.includes(first)).map((pr) => (pr[0] === first ? pr[1] : pr[0]));
    if (!partners.length) return null;
    ids.push(pick(partners, rng));
  }
  const traits = ids.map((id) => ({ id, rank: rankRoll(depth, row.maxRank, luckPm, rng) }));
  if (traits.some((t) => t.rank < 1)) return null;
  const list = bases[slot] || [];
  if (!list.length) return null;
  return { rarity, slot, base: pick(list, rng), traits, ground: ground.id, step, depth, iL: row.gearLevel };
}

/* a ground's bases (traitBasesOf), read once a ground: its rows and its gearLevel never change inside a run */
const BASES = new WeakMap();
function basesOf(ground) {
  let b = BASES.get(ground);
  if (!b) { b = traitBasesOf(ground, GEAR_STEPS.traitSlots, DANGER_GROUNDS[ground.id].gearLevel); BASES.set(ground, b); }
  return b;
}

/**
 * ONE HERO'S ROLL ON ONE KILL. `tr` is the swing's roll (traitSwing): { ground, step, depth, rarePm, kills, hours?, luckPm, pity, found }.
 * `key` the hero's member key, `unit` its unit id, `n` the heroes at the kill, `rng` the hero's own stream, `atMs` the kill's instant and
 * `kill` the dead monster's unit id (the kill that made the piece). Pushes a piece onto tr.found and answers it, or null. Pity counts in
 * tr.pity[key][rarity] (the server's carry: read in, written back after the window).
 */
export function rollKillFor(tr, key, unit, n, rng, atMs, kill) {
  if (!tr || !(n >= 1)) return null;
  const luck = (tr.luckPm && Number.isFinite(tr.luckPm[key]) && tr.luckPm[key] > 0) ? tr.luckPm[key] : 0;
  const pity = tr.pity[key] || (tr.pity[key] = {});
  for (const rarity of DROP_HOURS.rolls) {
    /* a rarity with no slot to land in is never rolled: no draw, no pity (its hours cannot be met on this ground) */
    if (!tr.slots[rarity].length) continue;
    const hours = tr.hours && tr.hours[rarity] > 0 ? tr.hours[rarity] : DROP_HOURS.rarity[rarity].everyHours;
    const p = ((chanceOf(hours, tr.kills) || 0) / n) * (tr.rarePm / 1000) * ((1000 + luck) / 1000);
    const misses = Number.isInteger(pity[rarity]) ? pity[rarity] : 0;
    if (rng.next() >= pityChance(p, misses, tr.pityOn[rarity] === true)) { pity[rarity] = misses + 1; continue; }
    pity[rarity] = 0;
    const piece = makePiece(rarity, tr.ground, tr.step, tr.depth, luck, rng, tr.cells, tr.slots[rarity], tr.bases);
    if (!piece) return null;
    const out = { key, unit, ...piece, ...(Number.isInteger(kill) ? { kill } : {}), ...(Number.isFinite(atMs) ? { atMs } : {}) };
    tr.found.push(out);
    return out;
  }
  return null;
}

/**
 * THE SWING'S ROLL (combat-sim.js, once a swing on the scale): the server's `traitDrops` ({ luckPm, pity, found }: the objects the caller
 * reads back; `hours` and `pityOn` are the Lab's what-if dials, never the server's) with the swing's ground, step, depth and odds, and
 * `rngOf(unit)`: each hero's stream for the swing, made once and drawn on for every kill in it. Null off the scale (no reference kill
 * rate, no band, no pool).
 * A MADE PIECE (drop-hours.js made: capes and jewelry) rolls by the same rules at the bench, at its part's hours over the rung's; its roll
 * lands with the bench verb that consumes the part (wave 4/5), so no function here serves it yet.
 */
export function traitSwing(drops, ground, step, streamOf) {
  if (!drops || !ground || !own(DANGER_GROUNDS, ground.id) || !Number.isInteger(step)) return null;
  const streams = new Map();
  const cells = rollableCells(ground);
  const all = DANGER_GROUNDS[ground.id].maxRank >= 1 ? Object.keys(cells).sort() : [];
  const slots = { rare: all, very_rare: all.filter((s) => veryRarePairs(TRAITS, GEAR_STEPS.veryRareBanned, ground.id, s).length) };
  return {
    cells, slots, bases: basesOf(ground),
    ground, step, depth: depthOf(ground.id, step), rarePm: depthRarePm(ground.id, step), kills: killsHeadHour(ground),
    hours: drops.hours || null, pityOn: drops.pityOn || GEAR_STEPS.pity, luckPm: drops.luckPm || {}, pity: drops.pity || (drops.pity = {}), found: drops.found || (drops.found = []),
    rngOf: (unit) => { if (!streams.has(unit)) streams.set(unit, streamOf(unit)); return streams.get(unit); },
  };
}
