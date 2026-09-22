#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bestiary-ladder.mjs — EVERY MONSTER HAS A LADDER, AND EVERY BONUS IS TINY
//
//   node tests/bestiary-ladder.mjs             the guard
//   node tests/bestiary-ladder.mjs --report    print the census, gate too
//   node tests/bestiary-ladder.mjs --selftest  mutation proof: each defect caught
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// src/data/bestiary.js is a DERIVED table: `buildBestiary(MONSTERS)` runs at
// module load, so the census is correct by construction today and silently
// wrong the moment someone "simplifies" it into a literal — which is exactly
// what happened to the gear curves before tools/gen-gold-ladders.mjs --check
// existed. Assertion B9 is the one that would notice: it rebuilds the census
// from a SYNTHETIC roster and requires the output to follow the input. A table
// that merely agrees with today's roster passes every other check here.
//
// The second half is the magnitude. A trophy is a memory of work done, and the
// whole design rests on it never growing into a second, free bane weapon. The
// ceilings are invariants of the formula (src/data/bestiary.js header), so the
// job of this file is to prove the SHIPPED table sits inside them, that the
// two remembered-kills ladders multiply to something a reviewer approved, and
// that the damage half still leaves headroom under MAX_TOTAL_DAMAGE_MULT — the
// clamp the one combat engine actually applies.
//
// Credential-free, database-free, milliseconds. The design is
// docs/design/BESTIARY_LADDER.md.
//
// Exit: 0 green · 1 a finding · 2 harness (a module would not load, or
// --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import {
  TROPHY_STAGES, BESTIARY, buildBestiary, trophyKey, trophyStageAt, nextTrophyAt,
  MAX_TROPHY_DROP_MULT, MAX_TROPHY_DAMAGE_MULT, MAX_MEMORY_DROP_MULT,
  MAX_TROPHY_STAGE, TROPHY_LADDER_KILLS, TROPHY_STAGE_NAMES,
} from '../src/data/bestiary.js';
import { MONSTERS } from '../src/data/monsters.js';
import { CHARM_RANKS, MAX_CHARM_DROP_MULT, MAX_CHARM_DAMAGE_MULT } from '../src/data/bestiary-charms.js';
import { MAX_TOTAL_DAMAGE_MULT } from '../src/core/elements.js';

/* player_progress.key is `check (length(key) between 1 and 64)`. A trophy key
   that overflows is a claim that throws in production and nowhere else. */
const KEY_MAX = 64;

/**
 * Every assertion, over an INJECTABLE world, so --selftest can plant a defect
 * in any input and require the named assertion to be the one that reports it.
 * Returns findings as `{ id, msg }`; empty means green.
 */
function audit(w) {
  const f = [];
  const say = (id, msg) => f.push({ id, msg });
  const stages = w.stages, best = w.bestiary, roster = w.roster;

  /* B1 — the census covers the roster, in both directions. A monster without a
     ladder is a spawn a long-term player cannot chase; a ladder without a
     monster is a badge that can never be earned and a claim key that dangles. */
  for (const id of Object.keys(roster)) {
    if (!best[id]) say('B1', `monster "${id}" is in the roster and has no bestiary ladder`);
  }
  for (const id of Object.keys(best)) {
    if (!roster[id]) say('B1', `bestiary ladder "${id}" names no monster in the roster`);
  }

  /* B2 — the rungs ascend, are whole kills, and are positive. A non-ascending
     ladder makes trophyStageAt() return a lower stage for more kills. */
  let prev = 0;
  for (const r of stages) {
    if (!Number.isInteger(r.at) || r.at <= 0) say('B2', `stage ${r.stage} threshold ${r.at} is not a positive whole kill count`);
    if (r.at <= prev) say('B2', `stage ${r.stage} threshold ${r.at} does not exceed the rung below (${prev})`);
    prev = r.at;
  }

  /* B3 — THE BAND. Every multiplier inside [1.00, the stated ceiling]. Below
     1.00 would be a penalty for playing; above is the second-bane failure. */
  for (const r of stages) {
    if (!(r.drop >= 1 && r.drop <= w.maxDrop)) say('B3', `stage ${r.stage} drop ${r.drop} is outside [1, ${w.maxDrop}]`);
    if (!(r.dmg >= 1 && r.dmg <= w.maxDmg)) say('B3', `stage ${r.stage} damage ${r.dmg} is outside [1, ${w.maxDmg}]`);
  }

  /* B4 — stage 1 pays NO power. The first rung is the trophy and the revealed
     drop table; paying a multiplier for it too would make the first 2,500 kills
     of all 108 monsters compulsory. Same ruling the class ladder's rank 1 made. */
  const first = stages[0];
  if (first && !(first.drop === 1 && first.dmg === 1)) {
    say('B4', `stage 1 pays power (drop ${first.drop}, dmg ${first.dmg}); the first rung is the trophy, not a multiplier`);
  }
  if (first && first.trophy !== true) say('B4', 'stage 1 grants no trophy row, so the first rung rewards nothing at all');

  /* B5 — monotonic. A ladder that dips pays a player less for more kills. */
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].drop < stages[i - 1].drop) say('B5', `stage ${stages[i].stage} drop falls below stage ${stages[i - 1].stage}`);
    if (stages[i].dmg < stages[i - 1].dmg) say('B5', `stage ${stages[i].stage} damage falls below stage ${stages[i - 1].stage}`);
  }

  /* B6 — THE STACK. Both remembered-kills ladders apply against the same
     monster at the same time, so it is their PRODUCT a reviewer has to approve,
     not each ceiling alone. And the damage half multiplies into the single
     `damageMult` expression in src/core/combat.js, which is clamped at
     MAX_TOTAL_DAMAGE_MULT — if memory alone ever approached that, the clamp
     would start eating a player's weapon triangle instead of their charms. */
  const memDrop = w.maxDrop * w.maxCharmDrop;
  if (memDrop > w.maxMemoryDrop + 1e-9) {
    say('B6', `class charm ${w.maxCharmDrop} x monster trophy ${w.maxDrop} = ${memDrop.toFixed(4)}, over MAX_MEMORY_DROP_MULT ${w.maxMemoryDrop}`);
  }
  const memDmg = w.maxDmg * w.maxCharmDmg;
  if (memDmg >= w.maxTotalDamage) {
    say('B6', `remembered-kills damage ${memDmg.toFixed(4)} reaches MAX_TOTAL_DAMAGE_MULT ${w.maxTotalDamage}, leaving the weapon triangle no headroom`);
  }

  /* B7 — TWO LADDERS MAY NOT SHARE A WORD. The class charms and the monster
     trophies show side by side on the same monster card; an id in both means a
     badge that reads as one thing and keys as another. */
  const charmIds = new Set(w.charmRanks.map(r => r.id));
  for (const r of stages) {
    if (charmIds.has(r.id)) say('B7', `stage id "${r.id}" is also a charm rank id — one word, two ladders`);
  }

  /* B8 — the claim key fits the column, for EVERY monster, at EVERY stage, and
     never lands in the engine's `ev:` counter namespace. */
  for (const id of Object.keys(best)) {
    for (const r of stages) {
      const k = w.key(id, r.stage);
      if (typeof k !== 'string' || k.length < 1 || k.length > KEY_MAX) {
        say('B8', `trophy key "${k}" for ${id} stage ${r.stage} is ${String(k).length} chars, outside player_progress's 1..${KEY_MAX}`);
      }
      if (String(k).startsWith('ev:')) say('B8', `trophy key "${k}" is in the engine counter namespace`);
    }
  }

  /* B9 — THE CENSUS IS GENERATED, NOT LITERAL. Rebuild from a roster that does
     not exist and require the output to follow the input. This is the only
     assertion a hand-typed table fails. */
  const synth = { zz_probe_one: { name: 'Probe One', tier: 4, cls: 'undead' }, zz_probe_two: { name: 'Probe Two', tier: 2, cls: 'plant' } };
  const built = w.build(synth);
  const gotIds = Object.keys(built).sort();
  if (gotIds.join(',') !== 'zz_probe_one,zz_probe_two') {
    const shown = gotIds.length > 4 ? `${gotIds.slice(0, 4).join(',')} … ${gotIds.length} ids` : gotIds.join(',');
    say('B9', `buildBestiary did not follow its input roster (got ${shown}) — the census is not derived`);
  } else if (built.zz_probe_one.tier !== 4 || built.zz_probe_one.cls !== 'undead' || built.zz_probe_one.name !== 'Probe One') {
    say('B9', 'buildBestiary did not carry the roster row through — the census is not derived');
  }

  /* B10 — frozen, all the way down. These objects are handed to render code and
     to a future src/core/trophies.js; a mutable rung is a global the first
     careless caller re-prices for everybody. */
  if (!Object.isFrozen(stages)) say('B10', 'TROPHY_STAGES is not frozen');
  for (const r of stages) if (!Object.isFrozen(r)) say('B10', `stage ${r.stage} row is not frozen`);
  if (!Object.isFrozen(best)) say('B10', 'BESTIARY is not frozen');

  /* B11 — the readers agree with the table. trophyStageAt must hold exactly the
     rung it names at the threshold and the rung below one kill short, and
     nextTrophyAt must go null only at the top. */
  for (const r of stages) {
    const at = w.stageAt(r.at);
    if (!at || at.stage !== r.stage) say('B11', `trophyStageAt(${r.at}) did not hold stage ${r.stage}`);
    const below = w.stageAt(r.at - 1);
    if ((below ? below.stage : 0) !== r.stage - 1) say('B11', `trophyStageAt(${r.at - 1}) did not hold stage ${r.stage - 1}`);
  }
  if (w.stageAt(0) !== null) say('B11', 'trophyStageAt(0) holds a stage');
  if (w.nextAt(stages[stages.length - 1].at) !== null) say('B11', 'nextTrophyAt at the top rung is not null');
  const nx = w.nextAt(0);
  if (!nx || nx.remaining !== stages[0].at) say('B11', 'nextTrophyAt(0) does not count the whole first rung');

  /* B12 — every stage id has display copy, and the derived constants agree with
     the array they are derived from. */
  for (const r of stages) if (!w.names[r.id]) say('B12', `stage id "${r.id}" has no display name`);
  if (w.maxStage !== stages.length) say('B12', `MAX_TROPHY_STAGE ${w.maxStage} does not equal the ladder length ${stages.length}`);
  if (w.ladderKills !== stages[stages.length - 1].at) say('B12', `TROPHY_LADDER_KILLS ${w.ladderKills} does not equal the top rung`);

  return f;
}

/** The real world, as shipped. */
function realWorld() {
  return {
    stages: TROPHY_STAGES,
    bestiary: BESTIARY,
    roster: MONSTERS,
    charmRanks: CHARM_RANKS,
    names: TROPHY_STAGE_NAMES,
    maxDrop: MAX_TROPHY_DROP_MULT,
    maxDmg: MAX_TROPHY_DAMAGE_MULT,
    maxMemoryDrop: MAX_MEMORY_DROP_MULT,
    maxCharmDrop: MAX_CHARM_DROP_MULT,
    maxCharmDmg: MAX_CHARM_DAMAGE_MULT,
    maxTotalDamage: MAX_TOTAL_DAMAGE_MULT,
    maxStage: MAX_TROPHY_STAGE,
    ladderKills: TROPHY_LADDER_KILLS,
    key: trophyKey,
    build: buildBestiary,
    stageAt: trophyStageAt,
    nextAt: nextTrophyAt,
  };
}

/**
 * A deep-enough copy that a mutation cannot reach the frozen originals, with the
 * defect planted BEFORE the copies are re-frozen.
 *
 * The re-freeze is not tidiness: without it every mutant world would fail B10
 * simply for being a copy, both negative controls would go red for a reason
 * nobody planted, and B10 would be proven by the harness rather than by a
 * defect. `freeze:false` is how the B10 mutation opts out and is the only way
 * that assertion can fire.
 */
function mutantWorld(plant, opts) {
  const w = realWorld();
  w.stages = TROPHY_STAGES.map(r => ({ ...r }));
  w.bestiary = { ...BESTIARY };
  w.roster = { ...MONSTERS };
  w.charmRanks = CHARM_RANKS.map(r => ({ ...r }));
  w.names = { ...TROPHY_STAGE_NAMES };
  if (plant) plant(w);
  if (!opts || opts.freeze !== false) {
    w.stages.forEach(Object.freeze);
    Object.freeze(w.stages);
    Object.freeze(w.bestiary);
  }
  return w;
}

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   One defect per assertion, each required to be caught BY ITS NAMED ASSERTION,
   plus two NEGATIVE CONTROLS that must stay silent. A proof harness that never
   sees green cannot tell a caught defect from its own breakage. */
const MUTATIONS = [
  ['B1', 'a monster loses its ladder', w => { delete w.bestiary[Object.keys(w.bestiary)[0]]; }],
  ['B2', 'the rungs stop ascending', w => { w.stages[2].at = w.stages[1].at; }],
  ['B3', 'a drop bonus breaks the band', w => { w.stages[3].drop = 1.25; }],
  ['B4', 'the first rung starts paying power', w => { w.stages[0].drop = 1.01; }],
  ['B5', 'the ladder dips', w => { w.stages[3].dmg = 0.99; w.stages[3].drop = 1.03; }],
  ['B6', 'the two ladders stack past the approved product', w => { w.maxMemoryDrop = 1.0; }],
  ['B7', 'the two ladders share a word', w => { w.stages[1].id = w.charmRanks[1].id; w.names[w.charmRanks[1].id] = 'x'; }],
  ['B8', 'a trophy key overflows the column', w => { const k = w.key; w.key = (id, s) => k(id, s) + 'y'.repeat(KEY_MAX); }],
  ['B9', 'the census is hand-typed instead of generated', w => { const b = w.bestiary; w.build = () => b; }],
  /* The only mutation that opts out of the harness re-freeze — that IS the defect. */
  ['B10', 'a rung is left mutable', () => {}, { freeze: false }],
  ['B11', 'a reader disagrees with the table', w => { w.stageAt = () => null; }],
  ['B12', 'a stage ships without display copy', w => { delete w.names[w.stages[2].id]; }],
];

const NEGATIVE_CONTROLS = [
  ['a monster is renamed (display copy only)', w => { const id = Object.keys(w.bestiary)[0]; w.bestiary[id] = { ...w.bestiary[id], name: 'Renamed Thing' }; }],
  ['a twelfth monster class appears on a roster row', w => { const id = Object.keys(w.roster)[0]; w.roster[id] = { ...w.roster[id], cls: 'newclass' }; w.bestiary[id] = { ...w.bestiary[id], cls: 'newclass' }; }],
];

function selftest() {
  const clean = audit(realWorld());
  if (clean.length) {
    console.error('SELFTEST HARNESS: the CLEAN arm is already red, so a caught defect cannot be told from a broken guard.');
    for (const x of clean) console.error(`  ${x.id}  ${x.msg}`);
    process.exit(2);
  }
  console.log('clean arm green (the floor) — planting defects');
  let bad = 0;
  for (const [id, what, plant, opts] of MUTATIONS) {
    const found = audit(mutantWorld(plant, opts));
    const byName = found.filter(x => x.id === id);
    if (!byName.length) {
      console.error(`  ✗ ${id}  ${what} — NOT caught by ${id}` + (found.length ? ` (only ${[...new Set(found.map(x => x.id))].join(',')} fired)` : ' (nothing fired)'));
      bad++;
    } else {
      console.log(`  ✓ ${id}  ${what} — caught: ${byName[0].msg}`);
    }
  }
  for (const [what, plant] of NEGATIVE_CONTROLS) {
    const found = audit(mutantWorld(plant));
    if (found.length) {
      console.error(`  ✗ NEGATIVE CONTROL "${what}" went red: ${found.map(x => x.id + ' ' + x.msg).join(' | ')}`);
      bad++;
    } else {
      console.log(`  ✓ NEGATIVE CONTROL "${what}" stayed silent`);
    }
  }
  if (bad) { console.error(`\n${bad} mutation(s) unproven.`); process.exit(1); }
  console.log(`\nAll ${MUTATIONS.length} mutations caught by their named assertion, ${NEGATIVE_CONTROLS.length} negative controls silent — non-vacuous.`);
  process.exit(0);
}

function report() {
  const byTier = new Map();
  for (const id of Object.keys(BESTIARY)) {
    const t = BESTIARY[id].tier;
    byTier.set(t, (byTier.get(t) || 0) + 1);
  }
  console.log(`bestiary ladders: ${Object.keys(BESTIARY).length} monsters x ${TROPHY_STAGES.length} stages`);
  for (const t of [...byTier.keys()].sort()) console.log(`  tier ${t}: ${byTier.get(t)} monsters`);
  for (const r of TROPHY_STAGES) {
    console.log(`  stage ${r.stage} ${TROPHY_STAGE_NAMES[r.id].padEnd(8)} at ${String(r.at).padStart(6)} kills  drop x${r.drop.toFixed(2)}  dmg x${r.dmg.toFixed(2)}`);
  }
  console.log(`  ceilings: trophy drop ${MAX_TROPHY_DROP_MULT}, trophy dmg ${MAX_TROPHY_DAMAGE_MULT}, charm x trophy ${MAX_MEMORY_DROP_MULT}, engine total ${MAX_TOTAL_DAMAGE_MULT}`);
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) selftest();
if (argv.includes('--report')) report();
const findings = audit(realWorld());
if (findings.length) {
  console.error('bestiary-ladder: RED');
  for (const x of findings) console.error(`  ${x.id}  ${x.msg}`);
  process.exit(1);
}
console.log(`bestiary-ladder: green — ${Object.keys(BESTIARY).length} monsters, ${TROPHY_STAGES.length} stages, every bonus inside the band.`);
