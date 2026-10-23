// ============================================================================
// supabase/functions/hr-accrue/character-sheet.js — VERB: THE CHARACTER SHEET.
//
// "What are my numbers?" The Character window shows the combat numbers a hunt
// is priced by. They come from ONE place: the hunt engine's own snapshot
// (accrual.js heroSnapshot, over loadoutOf — the very functions every hunt
// member's swing is priced through) and the one XP formula (progression.js
// xpMultiplierParts, which grantXp prices every grant with), computed HERE
// from server state only. The client computes none of it (CLAUDE.md §1).
//
// WHAT IT READS IS DECLARED: SHEET_INPUTS names every envelope path the sheet
// reads, keyed by the part of hr_character_sheet_inputs' fingerprint that
// covers it. tests/character-window.mjs CW-I1 fails when the sheet reads a
// path not listed, or the fingerprint and this list name different parts.
//
// THE WRITE IS A COMPARE-AND-SET, AND IT IS VERSIONED. The read returns, in
// the same statement, the SQL fingerprint of every input
// (hr_character_sheet_inputs). The put stores the sheet only while that
// fingerprint is current, under md5(fingerprint || ':' || engine version),
// where the engine version is THIS deploy's payload hash (payload-hash.js,
// stamped by tools/pack-edge.mjs; any change to the engine, an item row or a
// role row is a new hash). The view projects a sheet only while its inputs
// AND its engine are current. The window asks once per opening, so the first
// opening after a deploy records the new engine and every older sheet stops
// being fresh.
//
// A READ VERB: no idempotency key, no settle first, the `accrue` budget. It
// moves no value: the sheet is display data, never an input to any fight,
// price or gate.
//
// PURE ESM behind the injected one-statement `exec` seam. No `?v=`.
// ============================================================================

import { ITEMS } from '../../../src/data/items.js';
import { HUNT_ROLES, roleForWeapon, wornRoleKey } from '../../../src/data/hunt-roles.js';
import { playerCombatRolls } from '../../../src/core/combat.js';
import { vitalsOf } from '../../../src/core/vitals.js';
import { buffQueueFromServer } from '../../../src/core/buffs.js';
import { xpMultiplierParts } from '../../../src/core/progression.js';
import { heroSnapshot, loadoutOf, bonusFor, liveBuffHost, combatWorn } from '../../../src/core/member.js';
import { INTENT_ERRORS } from './intents.js';
import { PAYLOAD_SHA256 } from './payload-hash.js';

export const VERB = 'sheet';

/** Fingerprint part (hr_character_sheet_inputs) → the envelope path it covers (null: not an envelope read). */
export const SHEET_INPUTS = Object.freeze({
  skills: 'skills', equipment: 'equipment', level: 'state.level_xp', buffs: 'buffs', perks: null,
});

/* The rate gate (the registry's bucket), the envelope, the perk stack and the input fingerprint, in ONE statement. */
const SHEET_READ_SQL = `
  with g as (select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed)
  select g.allowed                                                                     as allowed,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end              as state,
         case when g.allowed then public.hr_perks_of($1::uuid, $2::int) end              as perks,
         case when g.allowed then public.hr_character_sheet_inputs($1::uuid, $2::int) end as fp,
         now()                                                                         as now
    from g`;

/* `$5::text::jsonb`: the sheet is pre-stringified (spend.js APPLY_SQL explains why). */
const SHEET_PUT_SQL = 'select public.hr_character_sheet_put($1::uuid, $2::int, $3::text, $4::text, $5::text::jsonb) as state';

const NEUTRAL_FOE = Object.freeze({});
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const round = (v, dp) => Math.round((Number(v) || 0) * 10 ** dp) / 10 ** dp;

/**
 * The sheet, from server state only. Every number is one the hunt engine
 * prices a swing with, against a foe with no defence or weakness (the
 * target's own defence is applied at the blow, src/core/hunt/damage.js hurt).
 * Reads ONLY the SHEET_INPUTS paths of the envelope.
 *
 * @param env    the hr_state_of envelope
 * @param perks  the hr_perks_of answer (null = no perks)
 * @param nowMs  the server clock (the buff queue is read at it)
 */
export function characterSheetOf(env, perks, nowMs) {
  const skills = {};
  if (isObj(env.skills)) for (const [k, cell] of Object.entries(env.skills)) skills[k] = Number(cell && cell.xp) || 0;
  /* The set a fight is priced by (member.js combatWorn: a loaded rune adds nothing, runes fuel spells only). */
  const equipment = combatWorn(isObj(env.equipment) ? env.equipment : {}, ITEMS);
  const levelXp = isObj(env.state) ? Number(env.state.level_xp) || 0 : 0;
  const { eq, setBonus, profile } = loadoutOf(equipment, ITEMS);
  const vit = vitalsOf({ levelXp, skills, equipment, items: ITEMS });
  const buffs = buffQueueFromServer(Array.isArray(env.buffs) ? env.buffs : [], nowMs);
  const perkState = perks && perks.ok === true ? perks : null;
  const bonus = bonusFor(perkState, liveBuffHost(() => buffs));
  const snap = heroSnapshot({ skills, levelXp }, { eq, equipment, items: ITEMS, bonus, setBonus, profile });
  const roll = playerCombatRolls(NEUTRAL_FOE, { eq, equipment, items: ITEMS, skills, bonus, setBonus, profile });
  const role = roleForWeapon(wornRoleKey(equipment, ITEMS), null);
  const row = role ? HUNT_ROLES[role] : null;
  /* The XP parts grantXp pays with; the lasting ones (no buff layer) split perks from food and drink. */
  const now = xpMultiplierParts(bonus);
  const lasting = xpMultiplierParts(bonusFor(perkState, null));
  return {
    role: role || null,
    weapon_type: eq.weaponType || 'neutral',
    /* THE CORE MODEL'S VITALS (src/core/vitals.js): Level, max HP and mana from
       Level and armour weight, and Prayer's regen rate (percent of the base). */
    level: vit.level,
    max_hp: vit.maxHp,
    max_mana: vit.maxMana,
    regen_pct: round(vit.regenPm / 10, 1),
    move_speed: row ? row.speed : null,
    damage: { min: 1, max: snap.maxHit },
    accuracy_pct: round(snap.acc / 10, 1),
    crit_pct: round(roll.critChance * 100, 1),
    defence: snap.def,
    /* WHAT THE ARMOUR DOES TO A BLOW (ruling K7, src/core/mitigation.js): the chance a blow
       misses outright (medium), the share of a landed blow taken off (heavy), the flat amount
       off each landed blow (light), at this Level, as the settle writes them on the hero. */
    dodge_pct: round(snap.mit.dodgePm / 10, 1),
    absorb_pct: round(snap.mit.absorbPm / 10, 1),
    ward: snap.mit.ward,
    set: setBonus ? { tier: setBonus.tier, pieces: setBonus.pieces } : null,
    xp: { perks: round(lasting.all, 4), buffs: round(now.all - lasting.all, 4), combat: round(now.combat, 4) },
  };
}

/**
 * Run the verb. Answers the fresh envelope (its `character_sheet` section now
 * carries the sheet), or a named refusal.
 * @param o.version  the engine version (default: this deploy's payload hash)
 */
export async function runSheet(o) {
  const { exec, user, slot, bucket } = o;
  const version = o.version || PAYLOAD_SHA256;
  const [read] = await exec(SHEET_READ_SQL, [user, slot, bucket]);
  if (!read || read.allowed !== true) {
    return { status: 429, body: { ok: false, verb: VERB, error: INTENT_ERRORS.RATE_LIMITED } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { status: 409, body: { ok: false, verb: VERB, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER } };
  }
  const sheet = characterSheetOf(env, read.perks, new Date(read.now).getTime());
  const [put] = await exec(SHEET_PUT_SQL, [user, slot, String(read.fp || ''), String(version), JSON.stringify(sheet)]);
  const fresh = put && put.state;
  if (!fresh || fresh.ok !== true) return { status: 200, body: { ...env, verb: VERB } };
  return { status: 200, body: { ...fresh, verb: VERB } };
}
