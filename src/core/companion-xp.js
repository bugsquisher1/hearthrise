// ============================================================================
// src/core/companion-xp.js — THE PER-ACTION COMPANION XP RULE, as one pure
// function for BOTH sides. The WRITE half of the companion channel; the READ
// half (pricing the levelled passive bonus) is src/core/companion-perk.js.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────
// The equipped companion earns XP from role-matched actions the player takes:
// a combat pet per KILL, a gatherer per GATHER YIELD, an artisan per PRODUCE.
// src/features/companions.js `awardXpForRole` is the live client seam; this
// module is that same rule, DOM-free and Node/Deno-pure, so the accrual engine
// (supabase/functions/hr-accrue/accrual.js) can grant the identical amount on a
// settle/away pass and the two sides cannot drift.
//
// ── THE COUNT BASIS, RESOLVED AGAINST THE CLIENT (parity, exact) ─────────────
// The client's award seams are the source of truth:
//   · combat  — wireKillHook wraps killMonster and fires awardXpForRole(
//               'combat-kill') ONCE PER KILL. Basis = kills. The engine uses
//               `summary.kills`. Loot addItem during combat does NOT award
//               (the addItem wrapper only fires for a gather/artisan pointer).
//   · gather  — wireAddItemForGather fires awardXpForRole('gather') ONCE PER
//               addItem CALL while a gather skill is active. Basis = the number
//               of yield addItem calls. The engine counts fx.addItem invocations.
//   · artisan — the same wrapper fires awardXpForRole('artisan') once per addItem
//               call while an artisan recipe is active (a produce OR a burnt_food
//               output both go through addItem, so both count, exactly as live).
//               Basis = fx.addItem invocations.
// So the engine multiplies the equipped companion's per-action amount by the
// count of the seam the client would have fired, and the totals match.
//
// ── DRAW-FREE / DETERMINISTIC ───────────────────────────────────────────────
// NO Math.random, NO rng, NO clock. The grant is a pure arithmetic function of
// (companion, activity, action count), computed AFTER the simulation from its
// summary — it moves no seeded roll. That is the AWAY-1 guarantee for this
// channel: a settle over a span and an away replay of the same span produce a
// byte-identical companion_xp op because they see the same counts.
//
// ── DORMANT BY DEFAULT ──────────────────────────────────────────────────────
// COMPANION_XP_SERVER_BACKED is the single arm switch. While false, index.ts and
// set-activity.js pass `companionXpBacked: false`, the engine emits NO
// companion_xp op, hr_perks_of reads the stat row as 0 → level 1 → the base
// magnitude (today's behaviour, no regression), and the client keeps awarding
// into its own G.companions blob. Flipping it to true, redeploying hr-accrue and
// bumping the client makes the server the sole writer AND gates the client's
// award off (src/features/companions.js) so the two never double-count.
//
// PURE ESM. No DOM, no window, no timers. Imported by the browser (through
// companions.js) and by the Edge bundle (through accrual.js).
// ============================================================================

import { COMPANIONS } from '../data/companions.js?v=457';
/* THE CURVE, REUSED — never re-copied. companion-perk.js already restates the
   client's XP curve and is pinned equal to src/features/companions.js by
   tests/companion-perk.mjs. Importing its cap here inherits that pin rather than
   opening a third copy that could drift. */
import { companionXpToReach, COMPANION_MAX_LEVEL } from './companion-perk.js?v=457';

/* THE CAP, DERIVED FROM THE SHARED CURVE. Cumulative XP to reach the max level —
   the same ceiling src/features/companions.js clamps to (COMPANION_XP_CAP). */
export const COMPANION_XP_CAP = companionXpToReach(COMPANION_MAX_LEVEL);

/* ── THE ARM SWITCH — DORMANT ───────────────────────────────────────────────
   Flip to true to make the accrual engine the server-of-record for companion
   XP (and to gate the client's local award off). Read by BOTH the server (via
   the input index.ts / set-activity.js thread) and the client. One line. */
export const COMPANION_XP_SERVER_BACKED = false;

/**
 * The XP one role-matched action grants the equipped companion. A VERBATIM
 * mirror of src/features/companions.js `awardXpForRole`: a dedicated pet earns
 * 1, a utility/hybrid pet earns 0.5 (it splits its attention), a mismatched
 * pet earns 0. Pinned to the client matrix by tests/companion-xp.mjs.
 *
 * @param role         the COMPANIONS[id].role of the equipped companion
 * @param activityType 'combat-kill' | 'gather' | 'artisan'
 */
export function companionActionXp(role, activityType) {
  if (!role) return 0;
  const isUtility = role === 'utility' || role === 'hybrid';
  if (activityType === 'combat-kill' && (role === 'combat'  || isUtility)) return isUtility ? 0.5 : 1;
  if (activityType === 'gather'      && (role === 'gather'  || isUtility)) return isUtility ? 0.5 : 1;
  if (activityType === 'artisan'     && (role === 'artisan' || isUtility)) return isUtility ? 0.5 : 1;
  return 0;
}

/* Own-property guard against the constructor/__proto__ NaN family — the same
   shape companion-perk.js uses. */
function own(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * The INTEGER XP a span earns for the equipped companion, clamped to the
 * remaining headroom under the cap.
 *
 * ⚠ FLOORED, and the floor is forced, not a choice: player_progress.value is a
 *   bigint and hr_apply casts `add::bigint`, so a fractional grant would raise
 *   invalid_text_representation and cost the player the whole night. For a
 *   utility pet (0.5/action) this discards at most <1 XP of remainder per
 *   settle — a negligible UNDER-pay (the safe direction), documented rather
 *   than carried in a schema column. A dedicated pet (1/action) is exact.
 *
 * @param opts.companionId  the equipped companion's id (server-owned)
 * @param opts.currentXp    the companion's current server XP (for the clamp)
 * @param opts.activityType 'combat-kill' | 'gather' | 'artisan'
 * @param opts.actionCount  the number of role-matched actions the span produced
 * @returns a non-negative integer XP grant, 0 when nothing is owed
 */
export function companionSpanXp(opts) {
  const o = opts || {};
  const id = o.companionId;
  if (typeof id !== 'string' || !own(COMPANIONS, id)) return 0;
  const def = COMPANIONS[id];
  const role = def && def.role;
  if (!role) return 0;
  const per = companionActionXp(role, o.activityType);
  if (!(per > 0)) return 0;
  const n = Math.floor(Number(o.actionCount) || 0);
  if (!(n > 0)) return 0;
  const raw = Math.floor(per * n);
  if (!(raw > 0)) return 0;
  const cur = Math.max(0, Math.floor(Number(o.currentXp) || 0));
  const headroom = COMPANION_XP_CAP - cur;
  if (!(headroom > 0)) return 0;
  return Math.min(raw, headroom);
}
