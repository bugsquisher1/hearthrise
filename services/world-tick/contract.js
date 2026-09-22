// ============================================================================
// services/world-tick/contract.js — RE-EXPORT ONLY. The code moved, it was not copied.
//
// 2026-09-21, milestone 1b: the `op:'tick'` entry in `hr-accrue` runs this
// logic for real, and `tools/pack-edge.mjs` can only vendor from `src/core` and
// `src/data` — so a module under `services/` is unreachable from an edge
// payload. The production half therefore LIVES at
// `supabase/functions/hr-accrue/tick-contract.js` and this file re-exports it.
//
// Copying it here instead would be the second gather path AWAY-12 forbids, and
// the drift would be silent: the offline guards would keep measuring a file the
// deployed function no longer runs.
// ============================================================================

export * from '../../supabase/functions/hr-accrue/tick-contract.js';
