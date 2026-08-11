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

export * as rng from './rng.js?v=320';
export * as xp from './xp.js?v=320';
export * as combat from './combat.js?v=320';
export * as drops from './drops.js?v=320';
export * as pacing from './pacing.js?v=320';
export * as rested from './rested.js?v=320';
export * as tools from './tools.js?v=320';
export * as farm from './farm.js?v=320';
export * as progression from './progression.js?v=320';
