// ============================================================================
// supabase/functions/hr-accrue/catalogue.js — the derived catalogues, built
// ONCE, at module scope, from src/data.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `computeAccrual` takes every catalogue as a NAMED INPUT (see its header: the
// exploit surface of an accrual engine is its inputs, and inputs are only
// auditable if a reviewer can see all of them in one function signature). That
// rule is right, and it has one consequence: anything derived from src/data has
// to be derived by the CALLER — and there are two callers, `index.ts` (the
// accrue verb) and `set-activity.js` (the collect that a switch runs).
//
// Two callers deriving one index is a drift generator, and this codebase has
// the receipt for exactly that shape: tests/accrual-engine.mjs' A14 guard
// exists because the auto-eat workstream added four inputs to one call site and
// not the other, so a collect would have fought with no food and died early.
//
// So the derivation lives here, once, and both callers import the SAME OBJECT.
// A14 still forces both to pass it.
//
// ⚠ NOTHING IS COPIED. The skill↔array mapping below is the only place in the
//   server payload that says "TREES are woodcutting", and it is the same
//   statement tools/gen-catalogues.mjs makes when it generates `hr_activities`
//   — which is what the database re-validates an activity id against. Two
//   statements of one fact, in two languages, is the `unifyObject` failure this
//   whole program exists to prevent; the drift guard between them is
//   `gen-catalogues --check`, wired into tests/run-smoke.mjs as a preflight.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no fetch.
// ============================================================================

import { TREES, ROCKS, FISH_SPOTS } from '../../../src/data/gathering.js';
import { indexGatherNodes } from '../../../src/core/skill-sim.js';

/**
 * `{ [nodeId]: { skill, node } }` over all 23 gathering nodes.
 *
 * NULL-PROTOTYPE (see `indexGatherNodes`): `active_id` is bounded by
 * /^[a-z0-9_]{1,64}$/ at the request layer, which matches `__proto__` and
 * `constructor`. On a plain object both are truthy and a lookup followed by a
 * property read walks straight past a truthiness check. Here there is no
 * prototype to inherit from.
 */
export const GATHER_NODES = indexGatherNodes({
  woodcutting: TREES,
  mining: ROCKS,
  fishing: FISH_SPOTS,
});
