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
// ⚠ AWAY-1 IS A STATEMENT ABOUT ONE STREAM, AND THERE ARE TWO. The corrected
//   truth, because the paragraph above used to imply an equality that does not
//   hold end to end:
//
//     · THE SPAN. simulateSpan / the gather loop run from `seed`, and an away
//       settle and an attended replay of the same window draw the same numbers
//       in the same order. Here AWAY-1 holds exactly, and it is what
//       tests/hearthfind-roll.mjs ROLL-3 measures.
//     · THE ATTENDED TOP-UP. An attended window ALSO runs the loot fidelity
//       top-up, and that runs on a DELIBERATELY DIFFERENT stream —
//       `createRng((seed ^ ATTENDED_RNG_SALT) >>> 0)` at
//       supabase/functions/hr-accrue/accrual.js:1925 — so its kills are not the
//       span's kills replayed, they are additional rolls.
//
//   CONSEQUENCE, STATED PLAINLY: an attended session rolls the hearthfind more
//   times than the away settle of the same wall-clock window. Playing attended
//   is therefore very slightly the better way to hunt a trophy. This is
//   ACCEPTED, not overlooked:
//     (a) it is BOUNDED by the top-up's own claim cap, and above it by the
//         server's ≤3 finds per character per UTC day (the migration's clamp
//         (i), counted from the append-only ledger under the character lock);
//     (b) it moves NO TRADEABLE VALUE — every trophy is bop:true and v:0, so
//         the advantage cannot be sold, banked, gifted or ranked; and
//     (c) removing it would mean either deleting the attended top-up (which is
//         what pays honest attended loot at all) or sharing one stream between
//         span and top-up, which would make the top-up's kills shift the span's
//         numbers — a far worse property than a bounded, unsellable edge.
//   If a future change makes a trophy tradeable, rankable or contributable,
//   THIS PARAGRAPH BECOMES A BUG and the top-up must stop rolling.
//
// ⚠ A SOURCE WITH NO ROW DRAWS NO RANDOM NUMBER. `rollHearthfind` returns null
//   BEFORE touching `rng` when the source is not in the table. Every existing
//   seeded replay in tests/accrual-engine.mjs is therefore byte-identical to
//   its pre-Hearthfind self except for the twelve authored sources — which is the
//   only honest way to add a draw to a stream other tests are pinned to.
//
// ⚠ THE DRAW IS THE LAST THING ITS CALLER DOES. Both call sites roll AFTER every
//   other RNG use in the action (gold, drop table, tool doubles), so adding the
//   roll cannot shift the numbers that decide an ordinary kill or swing.
//
// ⚠ THE ODDS ARE DERIVED, NEVER AUTHORED. src/data/hearthfind.js authors
//   EXPECTED HOURS at the source (100–400, the Designer's band); `deriveOneIn`
//   below turns that into the per-roll denominator using the source's own
//   action rate — the node's base `ms`, or the MEASURED kills/hour for a boss.
//   `indexHearthfind` REFUSES a row that types its own `oneIn`.
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
  HEARTHFIND_HOURS_MIN, HEARTHFIND_HOURS_MAX,
} from '../data/hearthfind.js?v=521';
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js?v=521';

export { HEARTHFIND_HOURS_MIN, HEARTHFIND_HOURS_MAX, HEARTHFIND_SOURCE_KINDS };

const key = (kind, id) => `${kind}:${id}`;

/* THE NODE RATE TABLE, built once from the gathering data. `ms` is the node's
   BASE action interval, which is what the ruling's formula names. */
const NODE_MS = (() => {
  const out = Object.create(null);
  for (const n of [...TREES, ...ROCKS, ...FISH_SPOTS]) {
    if (n && typeof n.id === 'string' && !(n.id in out)) out[n.id] = Number(n.ms);
  }
  return out;
})();

/**
 * ACTIONS PER HOUR AT A SOURCE — the denominator of the whole feature.
 *
 *   node    3600000 / node.ms   (the BASE interval; a tool makes a player
 *                                FASTER, so a tooled player reaches the trophy
 *                                in FEWER hours than the authored target —
 *                                the authored number is their ceiling)
 *   monster row.killsPerHour    (MEASURED with simulateSpan — see the header of
 *                                src/data/hearthfind.js; measured on the ceiling
 *                                character, so a worse-geared player takes MORE
 *                                hours than the authored target)
 *
 * ONE EXPRESSION, TWO READERS: tools/gen-hearthfind.mjs imports this function
 * rather than re-deriving the arithmetic, so the odds the engine rolls and the
 * odds the server clamps against cannot drift.
 */
export function actionsPerHour(row) {
  if (!row) return 0;
  if (row.kind === 'monster') {
    const k = Number(row.killsPerHour);
    if (!isFinite(k) || k <= 0) {
      throw new Error(`hearthfind: monster:${row.id} has no measured killsPerHour`);
    }
    return k;
  }
  const ms = NODE_MS[row.id];
  if (!isFinite(ms) || ms <= 0) {
    throw new Error(`hearthfind: node:${row.id} is not a TREES/ROCKS/FISH_SPOTS node`);
  }
  return 3600000 / ms;
}

/** oneIn = round(rate x hours). The ruling's formula, in one place. */
export function deriveOneIn(row) {
  return Math.round(actionsPerHour(row) * Number(row.hours));
}

/** The hours a STORED oneIn actually buys back. What the §4 self-check asserts. */
export function derivedHours(row, oneIn) {
  return (Number(oneIn) || 0) / actionsPerHour(row);
}

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
    if (r.oneIn !== undefined) {
      /* A ROW MAY NOT AUTHOR ITS OWN ODDS. `oneIn` is derived from `hours` and
         the source's action rate; a hand-typed oneIn would be the second copy
         of the clamp, which is the exact failure the hours band exists to end. */
      throw new Error(`hearthfind: ${r.kind}:${r.id} authors oneIn — author \`hours\` instead`);
    }
    if (!Number.isFinite(r.hours) || r.hours < HEARTHFIND_HOURS_MIN || r.hours > HEARTHFIND_HOURS_MAX) {
      throw new Error(`hearthfind: ${r.kind}:${r.id} hours ${r.hours} is outside `
        + `[${HEARTHFIND_HOURS_MIN},${HEARTHFIND_HOURS_MAX}]`);
    }
    const oneIn = deriveOneIn(r);
    if (!Number.isInteger(oneIn) || oneIn <= 0) {
      throw new Error(`hearthfind: ${r.kind}:${r.id} derived a non-positive oneIn`);
    }
    /* THE BAND, ASSERTED ON THE DERIVED VALUE — the same statement the
       migration's §4 self-check makes in SQL against `expected_hours`. */
    const hrs = derivedHours(r, oneIn);
    if (hrs < HEARTHFIND_HOURS_MIN - 1 || hrs > HEARTHFIND_HOURS_MAX + 1) {
      throw new Error(`hearthfind: ${r.kind}:${r.id} derives ${hrs.toFixed(1)} h, outside `
        + `[${HEARTHFIND_HOURS_MIN},${HEARTHFIND_HOURS_MAX}]`);
    }
    const k = key(r.kind, r.id);
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      throw new Error(`hearthfind: duplicate source ${k}`);
    }
    out[k] = { kind: r.kind, id: r.id, item: r.item, oneIn, hours: r.hours, expectedHours: hrs };
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
