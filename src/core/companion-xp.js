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
// ── ARMED — AND WHY IT HAD TO BE ────────────────────────────────────────────
// COMPANION_XP_SERVER_BACKED is the single arm switch. This header used to say
// that while it was false "the client keeps awarding into its own G.companions
// blob". THAT WAS NO LONGER TRUE, and the gap between the two halves was
// Paione's live bug, reported twice: "the pets are still not getting exp".
//
// `src/features/companions.js awardCompanionXp` returns on `blobRetired()`,
// which the capstone made the literal `true` — so the CLIENT writer was already
// dead. This switch being false kept the SERVER writer dead too, and companion
// XP therefore had NO writer at all: nothing ever inserted a player_progress
// kind='stat' key='companion_xp:<id>' row, hr_state_of projected `xp: {}`,
// accrue.js reconcileCompanions rebuilt every pet at 0, and every pet in the
// game was frozen at level 1 forever. Not earned and lost on reload — never
// earned.
//
// ARMED, index.ts and set-activity.js pass `companionXpBacked: true`, the engine
// emits the companion_xp op on BOTH the away accrual and the attended settle,
// hr_apply folds it into the stat row, hr_perks_of prices the levelled passive
// off that row, and hr_state_of projects the roster the client renders. The
// client's own award stays gated off (two gates now: this switch AND
// blobRetired), so the two can never double-count.
//
// ⚠ FLIPPING THIS LINE CHANGES THE EDGE BUNDLE. supabase/functions/hr-accrue
//   imports this module, so hr-accrue MUST be redeployed for the arm to reach
//   the server; the in-page payload guard stays red until the live
//   payload_sha256 matches `pack-edge --hash`. No migration is required: every
//   server-side link (hr_apply's 'stat' kind, hr_perks_of's companion_xp read,
//   hr_state_of's companions projection) already shipped and is unchanged.
//
// PURE ESM. No DOM, no window, no timers. Imported by the browser (through
// companions.js) and by the Edge bundle (through accrual.js).
// ============================================================================

import { COMPANIONS } from '../data/companions.js?v=565';
/* THE CURVE, REUSED — never re-copied. companion-perk.js already restates the
   client's XP curve and is pinned equal to src/features/companions.js by
   tests/companion-perk.mjs. Importing its cap here inherits that pin rather than
   opening a third copy that could drift. */
import { companionXpToReach, COMPANION_MAX_LEVEL } from './companion-perk.js?v=565';
/* THE CARRY'S ARITHMETIC, REUSED — the same fixed point grantXp carries a
   skill's remainder in (2026-10-09-xp-frac-carry.sql). One mechanism, two
   ledgers: a skill's remainder and a companion's. */
import { XP_FRAC_SCALE, xpFracUnits } from './progression.js?v=565';

/* THE CAP, DERIVED FROM THE SHARED CURVE. Cumulative XP to reach the max level —
   the same ceiling src/features/companions.js clamps to (COMPANION_XP_CAP). */
export const COMPANION_XP_CAP = companionXpToReach(COMPANION_MAX_LEVEL);

/* ── THE ARM SWITCH — ARMED ─────────────────────────────────────────────────
   The accrual engine is the server-of-record for companion XP, and the client's
   local award is gated off. Read by BOTH the server (via the input index.ts /
   set-activity.js thread) and the client. One line.

   Turning this back to false does NOT restore a client writer — there is none
   (companions.js blobRetired() is the literal true). It restores "no pet in the
   game can ever gain XP", which is the defect this arm exists to close. */
export const COMPANION_XP_SERVER_BACKED = true;

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
 * The grant a span earns the equipped companion: the INTEGER `add` (the
 * `stat companion_xp:<id>` op — player_progress.value is a bigint and hr_apply
 * casts `add::bigint`) and, when the server owns a remainder, the new
 * remainder `frac` in [0,1).
 *
 * ── THE CARRY (2026-10-12-companion-xp-frac.sql) ────────────────────────────
 * A utility pet earns 0.5 per action. Floored per settle, a 10-second
 * world-tick window holding one mithril swing paid the Fox NOTHING, every
 * window, forever — and a tick chain paid ~4% under one span of the same
 * actions. Exactly grantXp's defect, so exactly grantXp's cure: the remainder
 * is server state (player_progress.xp_frac on the companion's own row, written
 * only by hr_apply, projected by hr_state_of as companions.frac), the credit is
 * floor(remainder + per x actions) in XP_FRAC_SCALE fixed point, and the rest
 * is carried. Over any split of the actions the credit is floor(remainder0 +
 * per x total) — a chain of windows equals one span, to the unit.
 *
 * PRESENCE OF KEY, the xpFrac idiom: `opts.frac` undefined/null means the
 * database has no column (no `companions.frac` projected), and the grant keeps
 * the pre-carry per-span floor with `frac` undefined — so the engine proposes
 * no `companion_xp_frac` key an older hr_apply would refuse as unknown.
 *
 * THE CAP. The credit never passes COMPANION_XP_CAP; when the clamp binds the
 * pet is maxed and the remainder is 0 (there is nothing left to carry toward).
 * A chain clamps exactly once, like a span: tick-shadow.js advance() carries
 * each window's credit into the next window's `currentXp`.
 *
 * @param opts.companionId  the equipped companion's id (server-owned)
 * @param opts.currentXp    the companion's current server XP (for the clamp)
 * @param opts.activityType 'combat-kill' | 'gather' | 'artisan'
 * @param opts.actionCount  the number of role-matched actions the span produced
 * @param opts.frac         the server's carried remainder, or undefined/null
 * @returns { add, frac } — add a non-negative integer; frac a number in [0,1)
 *          when carried, else undefined
 */
export function companionSpanGrant(opts) {
  const o = opts || {};
  const carried = o.frac !== undefined && o.frac !== null;
  const f0 = carried ? xpFracUnits(o.frac) : 0;
  const none = { add: 0, frac: carried ? f0 / XP_FRAC_SCALE : undefined };
  const id = o.companionId;
  if (typeof id !== 'string' || !own(COMPANIONS, id)) return none;
  const def = COMPANIONS[id];
  const role = def && def.role;
  if (!role) return none;
  const per = companionActionXp(role, o.activityType);
  if (!(per > 0)) return none;
  const n = Math.floor(Number(o.actionCount) || 0);
  if (!(n > 0)) return none;
  const cur = Math.max(0, Math.floor(Number(o.currentXp) || 0));
  const headroom = COMPANION_XP_CAP - cur;
  if (!(headroom > 0)) return { add: 0, frac: carried ? 0 : undefined };
  if (!carried) {
    const raw = Math.floor(per * n);
    return { add: raw > 0 ? Math.min(raw, headroom) : 0, frac: undefined };
  }
  /* FIXED POINT, integer arithmetic only — xpFracUnits clamps the remainder to
     [0, SCALE-1], so a projected 900 cannot mint. */
  const total = f0 + Math.round(per * n * XP_FRAC_SCALE);
  const whole = Math.floor(total / XP_FRAC_SCALE);
  if (whole >= headroom) return { add: headroom, frac: 0 };
  return { add: whole, frac: (total - whole * XP_FRAC_SCALE) / XP_FRAC_SCALE };
}

/**
 * The INTEGER XP a span earns for the equipped companion with NO carried
 * remainder (the pre-carry per-span floor), clamped to the remaining headroom
 * under the cap. `companionSpanGrant(opts).add` without `frac`; kept for the
 * client-matrix pins in tests/companion-xp.mjs.
 */
export function companionSpanXp(opts) {
  const o = Object.assign({}, opts || {});
  delete o.frac;
  return companionSpanGrant(o).add;
}
