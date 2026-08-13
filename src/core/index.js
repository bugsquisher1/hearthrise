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

export * as rng from './rng.js?v=334';
export * as xp from './xp.js?v=334';
export * as combat from './combat.js?v=334';
export * as drops from './drops.js?v=334';
export * as pacing from './pacing.js?v=334';
export * as rested from './rested.js?v=334';
export * as tools from './tools.js?v=334';
export * as farm from './farm.js?v=334';
export * as progression from './progression.js?v=334';
export * as styles from './styles.js?v=334';
export * as artisan from './artisan.js?v=334';
export * as bounty from './bounty.js?v=334';
/* The away/active unification (docs/design/away-time-ruling.md). `away` is
   the contract as data, `botd` the featured-boss rotation as a function of a
   timestamp, `buffs` the registry plus the clock as a function of elapsed
   time, and `combatSim` the ONE loop both the live tick and server accrual
   run. There is deliberately no second combat loop to export. */
export * as away from './away.js?v=334';
export * as botd from './botd.js?v=334';
export * as buffs from './buffs.js?v=334';
export * as combatSim from './combat-sim.js?v=334';
