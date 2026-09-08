// ════════════════════════════════════════════════════════════════════════
// tests/hearthfind-boss-rate.mjs — THE MEASUREMENT BEHIND THE ODDS.
//
// WHY THIS FILE EXISTS, stated as the defect it prevents.
//
// The Designer's ruling (2026-09-08 §4) authors a hearthfind as EXPECTED HOURS
// at its source and lets the build derive the per-roll denominator:
//
//     nodes   oneIn = round( (3600000 / node.ms) x hours )
//     bosses  oneIn = round( killsPerHour        x hours )
//
// For a NODE the rate is a fact in src/data/gathering.js, so the derivation is
// self-checking. For a BOSS it is not: `killsPerHour` is a number somebody
// wrote down. The ruling's own table was drafted against "~144 kills/h at a
// ~25 s kill+respawn" and asked for it to be MEASURED — because if that number
// is wrong, every downstream guard still passes. The migration's §4 self-check
// asserts expected_hours ∈ [100,400]; expected_hours is oneIn / killsPerHour
// and oneIn is round(killsPerHour x hours), so the band is TRUE BY CONSTRUCTION
// whatever killsPerHour says. A killsPerHour of 1,000 would sail through the
// generator, the engine index, the CHECK constraint and the §4 self-check, and
// quietly make the boss trophies ~9x rarer than ruled.
//
// So THIS is the guard that makes the hours band mean anything: it re-measures
// the kill rate with the ONE engine and demands the pinned number match.
//
// THE MEASUREMENT (stated in full so it is reproducible and arguable):
//   · simulateSpan — the same function the live 2.4 s tick and hr-accrue's away
//     replay both run (AWAY-12 forbids a second engine).
//   · ONE HOUR, fixed seed 20260908, no buffs, no Boss-of-the-Day, no featured
//     multiplier, no ammo.
//   · The character is the CEILING of the intended band: attack / strength /
//     defence / hitpoints at level 90, and the tier-8 loadout (dragonfang_pike,
//     slagheart_platebody, choirbone_gauntlets, wyrmgilt_mantle) — swing
//     interval 2,328 ms.
//   · FED: auto-eat restores to full below half health, so the hour measures
//     combat throughput and not starvation. Unfed, the same hour is 4–6 deaths
//     and 1–22 kills, which is a measurement of the food supply, not the fight.
//
//   ⚠ THE CEILING IS THE SAFE DIRECTION. A slower or worse-geared character
//     kills less often, so their real expected hours are LONGER than the
//     authored target. `hours` is therefore the best case anybody can reach —
//     never a promise made to the median player.
//
// Run GREEN:  node tests/hearthfind-boss-rate.mjs
// Prove RED:  node tests/hearthfind-boss-rate.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { HEARTHFIND_TABLE, HEARTHFIND_HOURS_MIN, HEARTHFIND_HOURS_MAX } from '../src/data/hearthfind.js';
import { deriveOneIn, derivedHours, actionsPerHour } from '../src/core/hearthfind.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { createRng } from '../src/core/rng.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
import {
  playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats,
  swingIntervalMs, DEFAULT_PROFILE,
} from '../src/core/combat.js';
import { COMBAT_STYLES } from '../src/core/styles.js';
import { xpForLevel } from '../src/core/xp.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/* THE BAND CHARACTER. Stated as data so the numbers in src/data/hearthfind.js
   can be reproduced by anyone who disagrees with them. */
const SEED = 20260908;
const LEVEL = 90;
const EQUIPMENT = Object.freeze({
  weapon: 'dragonfang_pike',
  body: 'slagheart_platebody',
  gloves: 'choirbone_gauntlets',
  cape: 'wyrmgilt_mantle',
});

function measure(monsterId) {
  const m = MONSTERS[monsterId];
  if (!m) return null;
  const skills = {
    attack: xpForLevel(LEVEL), strength: xpForLevel(LEVEL),
    defense: xpForLevel(LEVEL), hitpoints: xpForLevel(LEVEL),
  };
  const eq = equipmentStats(EQUIPMENT, ITEMS);
  const style = COMBAT_STYLES.controlled || Object.values(COMBAT_STYLES)[0];
  const tickMs = swingIntervalMs(eq, style);
  const state = {
    activeMonster: monsterId, monsterHp: m.hp, monsterMaxHp: m.hp,
    playerHp: 990, playerMaxHp: 990,
    gold: 0, skills, stats: {}, inventory: {},
  };
  const ctx = {
    away: true, fromMs: 0, toMs: 3600000, tickMs,
    rng: createRng(SEED), monsters: MONSTERS, items: ITEMS,
    bonus: () => 0, style, activeBuffCount: 0,
    playerRolls: (mm) => playerCombatRolls(mm, {
      eq, equipment: EQUIPMENT, items: ITEMS, skills, bonus: () => 0,
      profile: DEFAULT_PROFILE, style,
    }),
    monsterRolls: (mm) => monsterCombatRolls(mm, { eq, skills, bonus: () => 0 }),
    weakness: (mm) => weaknessInfo(mm, eq),
    botdFor: () => ({ killBonuses: () => ({ dropMult: 1, xpMult: 1 }) }),
    /* FED. The only fx handler: heal to full below half. Deliberately not a
       food item — this measures the fight, not the larder. */
    fx: {
      autoEat() {
        if (state.playerHp < state.playerMaxHp * 0.5) { state.playerHp = state.playerMaxHp; return true; }
        return false;
      },
    },
  };
  const out = simulateSpan(state, ctx);
  return { kills: out.kills, deaths: out.deaths, tickMs, hp: m.hp, boss: !!m.boss };
}

function runAll(mutTable) {
  const table = mutTable || HEARTHFIND_TABLE;
  const nodeMs = Object.create(null);
  for (const n of [...TREES, ...ROCKS, ...FISH_SPOTS]) if (!(n.id in nodeMs)) nodeMs[n.id] = n.ms;

  const lines = [];
  for (const row of table) {
    if (row.kind === 'monster') {
      const got = measure(row.id);
      ok(!!got, `${row.id} is not a monster`);
      if (!got) continue;
      ok(got.boss, `${row.id} is a hearthfind combat source but is not a boss (ruling §2)`);
      /* EXACT, not a tolerance. The measurement is deterministic (fixed seed,
         fixed loadout, one engine), so any difference is a real change in the
         combat model — which is exactly the event this guard exists to surface.
         A tolerance here would be a licence for the rate to drift. */
      ok(got.kills === row.killsPerHour,
        `${row.id}: the engine now kills ${got.kills}/h but src/data/hearthfind.js is pinned to `
        + `${row.killsPerHour}/h. Combat balance moved, so the derived odds moved with it: at the `
        + `pinned rate this source is 1 in ${deriveOneIn(row)}, at the measured rate it is `
        + `1 in ${Math.round(got.kills * row.hours)} — i.e. ${(got.kills ? (deriveOneIn(row) / got.kills) : 0).toFixed(0)} `
        + `expected hours instead of the ruled ${row.hours}. Re-measure, update the pin, and take `
        + 'it back to the Designer if the new hours leave the band.');
      ok(got.deaths === 0,
        `${row.id}: the measurement hour contained ${got.deaths} death(s) — a rate measured through `
        + 'recovery time is a measurement of the recovery ladder, not of the kill rate');
      lines.push(`  ${row.id.padEnd(12)} measured ${String(got.kills).padStart(4)}/h  `
        + `pinned ${String(row.killsPerHour).padStart(4)}/h  ${row.hours} h → 1 in ${deriveOneIn(row)}`);
    } else {
      const ms = nodeMs[row.id];
      ok(Number.isFinite(ms) && ms > 0, `${row.id} is not a TREES/ROCKS/FISH_SPOTS node`);
      if (!(ms > 0)) continue;
      ok(Math.abs(actionsPerHour(row) - 3600000 / ms) < 1e-9,
        `${row.id}: the derived action rate does not match the node's own ms (${ms})`);
      lines.push(`  ${row.id.padEnd(12)} ${String(ms).padStart(6)} ms  `
        + `${(3600000 / ms).toFixed(0).padStart(5)}/h  ${row.hours} h → 1 in ${deriveOneIn(row)}`);
    }

    /* THE BAND, on the number that is actually stored. Restated here rather
       than delegated, because this file is the only reader that has just
       PROVEN the rate the band divides by. */
    const hrs = derivedHours(row, deriveOneIn(row));
    ok(hrs >= HEARTHFIND_HOURS_MIN - 1 && hrs <= HEARTHFIND_HOURS_MAX + 1,
      `${row.kind}:${row.id} derives ${hrs.toFixed(1)} expected hours, outside the `
      + `[${HEARTHFIND_HOURS_MIN}, ${HEARTHFIND_HOURS_MAX}] band`);
  }
  return lines;
}

/* ── THE MUTATION PROOF. A pinned rate that no longer matches the engine is
      the ENTIRE point of this file, so that is what the mutations plant. ── */
const MUTATIONS = {
  rate_inflated: {
    why: 'a boss killsPerHour is inflated to 1,000 — every other guard in the repo still passes '
       + '(the hours band is true by construction) while the trophy silently becomes ~9x rarer '
       + 'than the Designer ruled',
    table: () => HEARTHFIND_TABLE.map((r) => (r.kind === 'monster' ? { ...r, killsPerHour: 1000 } : r)),
  },
  rate_deflated: {
    why: 'a boss killsPerHour is cut to 10 — the trophy becomes ~9x MORE common than ruled, which '
       + 'is the direction that devalues the rarest moment in the game',
    table: () => HEARTHFIND_TABLE.map((r) => (r.kind === 'monster' ? { ...r, killsPerHour: 10 } : r)),
  },
  drifted_by_one: {
    why: 'a pinned rate is off by a single kill per hour — the failure mode this guard is really '
       + 'for is a combat-balance change nobody connected to the odds, and that arrives one kill '
       + 'at a time, not as a round number',
    table: () => HEARTHFIND_TABLE.map((r) => (r.kind === 'monster' ? { ...r, killsPerHour: r.killsPerHour + 1 } : r)),
  },
  non_boss_source: {
    why: 'a non-boss monster is added as a combat source (the cut goblin row) — a starter mob dies '
       + 'an order of magnitude faster than a boss, so it becomes the fastest hearthfind farm in '
       + 'the game at any oneIn a designer picks',
    table: () => [...HEARTHFIND_TABLE,
      { kind: 'monster', id: 'goblin', item: 'emberheart', hours: 250, killsPerHour: 400 }],
  },
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('hearthfind-boss-rate --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const save = failed; failed = 0; let threw = false;
    try { runAll(MUTATIONS[name].table()); } catch (e) { threw = true; }
    const red = failed > 0 || threw;
    failed = save;
    if (red) console.log(`  ${name}: RED — ${MUTATIONS[name].why}`);
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  /* THE NEGATIVE CONTROL. A guard that reports RED on everything proves
     nothing; the unmutated table must be GREEN in the same process. */
  const save = failed; failed = 0;
  runAll(null);
  const cleanRed = failed > 0;
  failed = save;
  if (cleanRed) { console.error('  x clean tree: RED — the guard fails on unmutated data'); bad++; }
  else console.log('  clean tree: GREEN (negative control)');
  if (bad) { console.error(`\n${bad} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
}

const lines = runAll(null);
if (failed) { console.error(`\nhearthfind-boss-rate: ${failed} assertion(s) FAILED.`); process.exit(1); }
console.log('hearthfind-boss-rate: the pinned rates ARE what the one engine does\n'
  + `  (simulateSpan, 1 h, seed ${SEED}, level ${LEVEL}, ${Object.values(EQUIPMENT).join(' + ')}, fed)\n`
  + lines.join('\n'));
process.exit(0);
