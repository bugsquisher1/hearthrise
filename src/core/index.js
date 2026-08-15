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

export * as rng from './rng.js?v=350';
export * as xp from './xp.js?v=350';
export * as combat from './combat.js?v=350';
export * as drops from './drops.js?v=350';
export * as pacing from './pacing.js?v=350';
export * as rested from './rested.js?v=350';
export * as tools from './tools.js?v=350';
export * as farm from './farm.js?v=350';
export * as progression from './progression.js?v=350';
export * as styles from './styles.js?v=350';
export * as artisan from './artisan.js?v=350';
export * as bounty from './bounty.js?v=350';
/* Auto-eat is the ONE fx handler combat-sim.js calls that the server accrual
   engine did not implement, and a missing handler is a silent no-op — so the
   server's character died early and the night stopped paying (measured: -63%
   to -99% of an absence). The DECISION now lives here so both sides run the
   same predicate; each caller keeps its own apply step. */
export * as autoEat from './auto-eat.js?v=350';
/* The away/active unification (docs/design/away-time-ruling.md). `away` is
   the contract as data, `botd` the featured-boss rotation as a function of a
   timestamp, `buffs` the registry plus the clock as a function of elapsed
   time, and `combatSim` the ONE loop both the live tick and server accrual
   run. There is deliberately no second combat loop to export. */
export * as away from './away.js?v=350';
export * as botd from './botd.js?v=350';
export * as buffs from './buffs.js?v=350';
export * as combatSim from './combat-sim.js?v=350';
/* The GATHERING half of the same unification. `skillSim.sliceSpan` IS
   legacy.js's `replayAwaySpan`, lifted; `simulateSkillSpan` is the loop the
   client's away gather branch and the accrual Edge Function both run. Before
   it, 313 of 344 catalogue activities accrued nothing server-side. */
export * as skillSim from './skill-sim.js?v=350';
/* The ARTISAN half — the last third of the catalogue with no DOM-free form.
   `artisanSim.simulateArtisanSpan` runs on `skillSim.sliceSpan`, not on a
   second copy of it, which is what keeps one buff-expiry timeline serving all
   three simulations. 290 of the 344 catalogue rows are artisan. */
export * as artisanSim from './artisan-sim.js?v=350';
