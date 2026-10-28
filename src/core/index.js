// ============================================================
// src/core/index.js — the shared simulation core, barrelled.
//
// Everything under src/core/ is PURE: no DOM, no window, no timers, no
// Math.random, no I/O. That is enforced, not asserted — tests/core-purity.mjs
// imports every module in plain Node and scans the source for the banned
// identifiers, and it runs as a preflight inside tests/run-smoke.mjs.
//
// Two consumers, one implementation (design §3.4):
//   • the browser, via src/core-bridge.js, which adapts these signatures to
//     legacy.js's globals and seeds the RNG from Math.random();
//   • Supabase Edge Functions (Deno), which import these exact files and
//     supply server state + a seed derived from (user_id, slot, accrued_to).
//
// If you add a module here, add it to CORE_MODULES in tests/core-purity.mjs.
// ============================================================

export * as rng from './rng.js?v=0.2.63';
export * as xp from './xp.js?v=0.2.63';
export * as combat from './combat.js?v=0.2.63';
/* b356 — class-targeted weapon multipliers ("bane gear"). It is a SEPARATE
   module from combat.js so that the one rule that matters — a bane is a
   multiplier inside weaknessInfo and NEVER a getBonus key, because getBonus
   reads as zero on the server — has a file header to live in. */
export * as bane from './bane.js?v=0.2.63';
/* b3xx — bane.js's TWIN: elemental weapon enchants. A separate module for the
   same reason bane is one — the rule that an element is a multiplier inside
   weaknessInfo and NEVER a getBonus key (getBonus reads as zero on the server)
   deserves a header to live in. See src/core/elements.js. */
export * as elements from './elements.js?v=0.2.63';
export * as drops from './drops.js?v=0.2.63';
export * as pacing from './pacing.js?v=0.2.63';
export * as rested from './rested.js?v=0.2.63';
export * as tools from './tools.js?v=0.2.63';
export * as farm from './farm.js?v=0.2.63';
export * as progression from './progression.js?v=0.2.63';
/* THE CORE MODEL'S VITALS (docs/design/CORE_MODEL.md §3): max HP and mana from
   Level and armour weight, the regen rate from Inner Flame. */
export * as vitals from './vitals.js?v=0.2.63';
export * as artisan from './artisan.js?v=0.2.63';
/* b357 — THE CONSUMPTION SEAM. Authored ahead of its consumers on purpose:
   Fletching, Runecrafting and Stonemason are all specified against one field
   (`ammoPerShot`) and are being built by different agents at different times,
   so the arithmetic is published ONCE and every consumer imports it. The
   pre-flight supply projection and the away card must call the SAME
   `hoursOfSupply`/`dryAtMs` the fight will, or the player is quoted a number
   the night does not honour.
   WIRED (E1, 2026-08-31): `combat-sim.js simulateTick` charges one swing
   through `spendForSwings` on every tick — live and away, ctx-blind, so the
   quiver drains identically down both paths. */
export * as ammo from './ammo.js?v=0.2.63';
/* The away/active unification (docs/design/away-time-ruling.md). `away` is
   the contract as data, `botd` the featured-boss rotation as a function of a
   timestamp, `buffs` the registry plus the clock as a function of elapsed
   time, and `combatSim` the ONE loop both the live tick and server accrual
   run. There is deliberately no second combat loop to export. */
export * as away from './away.js?v=0.2.63';
export * as botd from './botd.js?v=0.2.63';
export * as buffs from './buffs.js?v=0.2.63';
export * as combatSim from './combat-sim.js?v=0.2.63';
/* The GATHERING half of the same unification. `skillSim.sliceSpan` IS
   legacy.js's `replayAwaySpan`, lifted; `simulateSkillSpan` is the loop the
   client's away gather branch and the accrual Edge Function both run. Before
   it, 313 of 344 catalogue activities accrued nothing server-side. */
export * as skillSim from './skill-sim.js?v=0.2.63';
/* The ARTISAN half — the last third of the catalogue with no DOM-free form.
   `artisanSim.simulateArtisanSpan` runs on `skillSim.sliceSpan`, not on a
   second copy of it, which is what keeps one buff-expiry timeline serving all
   three simulations. 290 of the 344 catalogue rows are artisan. */
export * as artisanSim from './artisan-sim.js?v=0.2.63';
/* THE HIRED-CREW RATE MODEL. A worker is priced as a FRACTION of the active
   player's rate at the same node, so the fraction (`workerEff`) and the thing it
   is a fraction OF (`workerAnchorMs` = the PACED action interval) belong in one
   place. They were previously two mirrored copies and, respectively, nowhere. */
export * as workers from './workers.js?v=0.2.63';
/* THE PARTY SPLIT (lane S1; HUNT_SCREEN_SPEC §5). A hunt instance's loot split
   by value: gold even with the remainder to the first seat, items round-robin.
   src/core/hunt-rewards.js is its one caller; solo is a party of one. */
export * as partySplit from './party-split.js?v=0.2.63';
