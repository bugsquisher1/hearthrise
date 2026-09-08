// ════════════════════════════════════════════════════════════════════════
// src/core/hearthfind.js — THE HEARTHFIND ROLL, in the ONE engine.
//
// The live tick and hr-accrue's away replay both reach this through
// src/core/combat-sim.js `resolveKill` and src/core/skill-sim.js
// `resolveGatherTick`, from the SAME seeded RNG, so a find that happens on the
// server's replay of a night happens at the identical action index as the
// attended replay of the same seed. That is the AWAY-1 parity property, and it
// is what makes a find auditable: given (user, slot, accrued_to) the server can
// re-run the span and prove the roll.
//
// ⚠ A SOURCE WITH NO ROW DRAWS NO RANDOM NUMBER. `rollHearthfind` returns null
//   BEFORE touching `rng` when the source is not in the table. Every existing
//   seeded replay in tests/accrual-engine.mjs is therefore byte-identical to
//   its pre-Hearthfind self except for the ten authored sources — which is the
//   only honest way to add a draw to a stream other tests are pinned to.
//
// ⚠ THE DRAW IS THE LAST THING ITS CALLER DOES. Both call sites roll AFTER every
//   other RNG use in the action (gold, drop table, tool doubles), so adding the
//   roll cannot shift the numbers that decide an ordinary kill or swing.
//
// THIS FILE GRANTS NOTHING. It reports `{ item, kind, id, oneIn }` and the
// caller hands it to `fx.onHearthfind`. The inventory row, the ledger row and
// the world_finds row are all written by hr_apply, from ITS OWN catalogue
// lookup of the same pair — the engine's proposal is a claim, not a credit.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ════════════════════════════════════════════════════════════════════════

import {
  HEARTHFIND_TABLE, HEARTHFIND_SOURCE_KINDS,
  HEARTHFIND_ONE_IN_MIN, HEARTHFIND_ONE_IN_MAX,
} from '../data/hearthfind.js?v=520';

export { HEARTHFIND_ONE_IN_MIN, HEARTHFIND_ONE_IN_MAX, HEARTHFIND_SOURCE_KINDS };

const key = (kind, id) => `${kind}:${id}`;

/**
 * Build the lookup the engine carries on `ctx`.
 *
 * ⚠ NULL PROTOTYPE, for the reason `indexGatherNodes` has one: the ids reaching
 *   this lookup originate in request-layer strings, and `__proto__` /
 *   `constructor` are truthy on any plain object. The container simply has no
 *   prototype, so the hazard is removed rather than guarded against.
 *
 * A row outside the band, naming an unknown kind, or duplicating a source is a
 * THROW, not a skip. A silently-dropped row is a source the catalogue promises
 * and the engine never pays; a silently-kept out-of-band row is the balance
 * number this feature is entirely made of, wrong.
 */
export function indexHearthfind(table) {
  const rows = Array.isArray(table) ? table : HEARTHFIND_TABLE;
  const out = Object.create(null);
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || typeof r.item !== 'string') {
      throw new Error('hearthfind: a row is missing id/item');
    }
    if (!HEARTHFIND_SOURCE_KINDS.includes(r.kind)) {
      throw new Error(`hearthfind: source kind ${JSON.stringify(r.kind)} has no roll site in the engine`);
    }
    if (!Number.isInteger(r.oneIn) || r.oneIn < HEARTHFIND_ONE_IN_MIN || r.oneIn > HEARTHFIND_ONE_IN_MAX) {
      throw new Error(`hearthfind: ${r.kind}:${r.id} oneIn ${r.oneIn} is outside `
        + `[${HEARTHFIND_ONE_IN_MIN},${HEARTHFIND_ONE_IN_MAX}]`);
    }
    const k = key(r.kind, r.id);
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      throw new Error(`hearthfind: duplicate source ${k}`);
    }
    out[k] = { kind: r.kind, id: r.id, item: r.item, oneIn: r.oneIn };
  }
  return out;
}

/** The shipped index, built once. Callers that want a custom table pass one. */
export const HEARTHFIND_INDEX = indexHearthfind(HEARTHFIND_TABLE);

/**
 * Roll one source.
 *
 * @param index  from `indexHearthfind` (or HEARTHFIND_INDEX)
 * @param kind   'monster' | 'node'
 * @param id     the source id
 * @param rng    src/core/rng.js contract
 * @returns { item, kind, id, oneIn } on a find, otherwise null
 *
 * NOTHING SCALES THIS. There is no dropMult, no dropRate buff, no featured
 * multiplier and no perk term — deliberately, and asserted by
 * tests/hearthfind-mint-guard.mjs. The Feature Slate's "must NOT" is that a
 * hearthfind can never be purchasable or boostable, and the cheapest way to
 * keep that true forever is for the roll to take no modifier argument at all.
 */
export function rollHearthfind(index, kind, id, rng) {
  const idx = index || HEARTHFIND_INDEX;
  if (typeof kind !== 'string' || typeof id !== 'string') return null;
  const row = Object.prototype.hasOwnProperty.call(idx, key(kind, id)) ? idx[key(kind, id)] : null;
  if (!row) return null;                       // ← no row, no draw. See the header.
  if (!rng || typeof rng.chance !== 'function') return null;
  if (!rng.chance(1 / row.oneIn)) return null;
  return { item: row.item, kind: row.kind, id: row.id, oneIn: row.oneIn };
}

/**
 * The one call site shape both engines use, so neither of them re-implements
 * "roll it, count it, tell the sink". `state.stats.hearthfinds` is the lifetime
 * counter the Collection log reads; the GRANT is not here.
 */
export function resolveHearthfind(state, kind, id, ctx) {
  const c = ctx || {};
  if (c.hearthfind === false) return null;     // an explicit opt-out for unit tests
  const found = rollHearthfind(c.hearthfind || HEARTHFIND_INDEX, kind, id, c.rng);
  if (!found) return null;
  state.stats = state.stats || {};
  state.stats.hearthfinds = (state.stats.hearthfinds || 0) + 1;
  const fx = (c && c.fx) || {};
  if (typeof fx.onHearthfind === 'function') fx.onHearthfind(found, ctx);
  return found;
}
