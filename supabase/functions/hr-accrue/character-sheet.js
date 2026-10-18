// ============================================================================
// supabase/functions/hr-accrue/character-sheet.js — VERB: THE CHARACTER SHEET.
//
// "What are my numbers?" The Character window shows the combat numbers a hunt
// is priced by. They come from ONE place: the hunt engine's own snapshot
// (accrual.js heroSnapshot, over loadoutOf — the very functions every hunt
// member's swing is priced through), computed HERE from server state only:
// the hr_state_of envelope (skills, the worn set, the chosen style, the buff
// queue) and hr_perks_of. The client computes none of it (CLAUDE.md §1).
//
// THE WRITE IS A COMPARE-AND-SET, NOT A CLAIM. The read returns, in the same
// statement, the SQL fingerprint of every input the sheet depends on
// (hr_character_sheet_inputs). The put stores the sheet only if that
// fingerprint is still current; hr_character_sheet_view projects a stored
// sheet only while it is (`fresh`). So a sheet can never be shown for a
// loadout the character no longer has: a level, a piece of gear, a style, a
// buff or a perk that moves after the read makes the put a no-op and the view
// say `fresh: false`, and the window asks again.
//
// A READ VERB: no idempotency key, no settle first, the `accrue` budget (one
// call per window opening / per changed loadout). It moves no value: the sheet
// is display data, never an input to any fight, price or gate.
//
// PURE ESM behind the injected one-statement `exec` seam. No `?v=`.
// ============================================================================

import { ITEMS } from '../../../src/data/items.js';
import { HUNT_ROLES, roleForWeapon } from '../../../src/data/hunt-roles.js';
import { playerCombatRolls, prayerWardPct } from '../../../src/core/combat.js';
import { buffQueueFromServer } from '../../../src/core/buffs.js';
import { heroSnapshot, loadoutOf, bonusFor, liveBuffHost } from './accrual.js';
import { engineInputsFromEnvelope } from './envelope.js';
import { INTENT_ERRORS } from './intents.js';

export const VERB = 'sheet';

/* The rate gate (the registry's bucket), the envelope, the perk stack and the input fingerprint, in ONE statement. */
export const SHEET_READ_SQL = `
  with g as (select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed)
  select g.allowed                                                                     as allowed,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end              as state,
         case when g.allowed then public.hr_perks_of($1::uuid, $2::int) end              as perks,
         case when g.allowed then public.hr_character_sheet_inputs($1::uuid, $2::int) end as fp,
         now()                                                                         as now
    from g`;

/* `$4::text::jsonb`: the sheet is pre-stringified (spend.js APPLY_SQL explains why). */
export const SHEET_PUT_SQL = 'select public.hr_character_sheet_put($1::uuid, $2::int, $3::text, $4::text::jsonb) as state';

const NEUTRAL_FOE = Object.freeze({});
const round = (v, dp) => Math.round((Number(v) || 0) * 10 ** dp) / 10 ** dp;

/**
 * The sheet, from server state only. Every number is one the hunt engine
 * prices a swing with, against a foe with no defence or weakness (the
 * target's own defence is applied at the blow, src/core/hunt/damage.js hurt).
 *
 * @param env    the hr_state_of envelope
 * @param perks  the hr_perks_of answer (null = no perks)
 * @param nowMs  the server clock (the buff queue is read at it)
 */
export function characterSheetOf(env, perks, nowMs) {
  const e = engineInputsFromEnvelope(env, nowMs);
  const { eq, setBonus, profile, style } = loadoutOf(e.equipment, e.combatStyle, ITEMS);
  const buffs = buffQueueFromServer(Array.isArray(e.buffs) ? e.buffs : [], nowMs);
  const bonus = bonusFor(perks && perks.ok === true ? perks : null, liveBuffHost(() => buffs));
  const lasting = bonusFor(perks && perks.ok === true ? perks : null, null);
  const state = { skills: e.skills };
  const snap = heroSnapshot(state, { eq, equipment: e.equipment, items: ITEMS, bonus, setBonus, profile, style });
  const roll = playerCombatRolls(NEUTRAL_FOE, { eq, equipment: e.equipment, items: ITEMS, skills: e.skills, bonus, setBonus, profile, style });
  const role = roleForWeapon(eq.weaponType || 'neutral', null);
  const row = role ? HUNT_ROLES[role] : null;
  /* XP: progression.js grantXp's multiplier, (1 + allXP + gear xpB + combatXP on a combat skill), by source. */
  const allXp = Number(bonus('allXP')) || 0;
  const lastingXp = Number(lasting('allXP')) || 0;
  const xp = {
    gear: round(eq.xpB, 4),
    perks: round(lastingXp, 4),
    buffs: round(allXp - lastingXp, 4),
    combat: round(bonus('combatXP'), 4),
  };
  return {
    role: role || null,
    weapon_type: eq.weaponType || 'neutral',
    max_mana: row ? row.mana : null,
    move_speed: row ? row.speed : null,
    damage: { min: 1, max: snap.maxHit },
    accuracy_pct: round(snap.acc / 10, 1),
    crit_pct: round(roll.critChance * 100, 1),
    defence: snap.def,
    ward_pct: Math.floor(prayerWardPct(e.skills)),
    set: setBonus ? { tier: setBonus.tier, pieces: setBonus.pieces } : null,
    xp,
  };
}

/**
 * Run the verb. Answers the fresh envelope (its `character_sheet` section now
 * carries the sheet), or a named refusal.
 */
export async function runSheet(o) {
  const { exec, user, slot, bucket } = o;
  const [read] = await exec(SHEET_READ_SQL, [user, slot, bucket]);
  if (!read || read.allowed !== true) {
    return { status: 429, body: { ok: false, verb: VERB, error: INTENT_ERRORS.RATE_LIMITED } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { status: 409, body: { ok: false, verb: VERB, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER } };
  }
  const sheet = characterSheetOf(env, read.perks, new Date(read.now).getTime());
  const [put] = await exec(SHEET_PUT_SQL, [user, slot, String(read.fp || ''), JSON.stringify(sheet)]);
  const fresh = put && put.state;
  if (!fresh || fresh.ok !== true) return { status: 200, body: { ...env, verb: VERB } };
  return { status: 200, body: { ...fresh, verb: VERB } };
}
