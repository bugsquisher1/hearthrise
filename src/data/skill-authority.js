// ============================================================================
// src/data/skill-authority.js — THE SERVER-ACCRUED-SKILL PREDICATE.
//
// Sibling to src/data/item-authority.js, and it exists for the same reason and
// answers the same shape of question — but for SKILL XP rather than item ids.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
// The skills reconcile in src/net/accrue.js (applyEnvelopeState) is ABSOLUTE
// once equip authority is armed (`isEnvelopeAbsolute()` true in prod): the
// server's xp is ASSIGNED over the client's, INCLUDING DOWNWARD — that downward
// direction IS the anti-forgery property, the one thing between a devtools-edited
// xp figure and a laundered round trip.
//
// That is only safe for a skill the accrual ENGINE actually settles. Some skills
// have NO server accrual path:
//   • FARMING is not a declarable activity — ACTIVITY_KINDS has no 'farming',
//     there is no farming gather node, and XP is granted client-side in
//     harvestPlot (legacy.js). The server's farming xp is frozen at its last
//     value, so an absolute assign re-asserts that frozen value DOWNWARD on every
//     settle and reload. Reported as "Farming stuck at level 66".
//   • COOKING is the un-modeled artisan lane (ARTISAN_SETTLEMENT.cooking ===
//     'unmodeled'; the intent DOWNGRADES it to idle, activity.js), so it never
//     accrues either. Reported as "cooking XP resets on reload".
//   • Any NEW client-only skill (e.g. bountyHunter today — a combat-category
//     skill that no combat/gather/artisan path grants) is in the same position
//     and must be protected the same way, automatically.
//
// So this module derives, FROM THE SAME SOURCES THE ENGINE READS (never a
// hand-list of two strings, so it cannot drift as content grows), the set of
// skill-ids the absolute envelope is ALLOWED to own — and its complement, the
// skills the absolute branch must reconcile with `Math.max(have, xp)` (can only
// go UP) until they are genuinely server-owned. accrue.js consults
// `serverAccruedSkill(id)` in exactly the shape of the `serverOwnedItem(id)`
// item-authority carve-out, and this generalises the existing OMITTED-skill
// protection (the Stonemason catalogue-gap safety) to NAMED-but-not-accrued ones.
//
// ── THE PARTITION ───────────────────────────────────────────────────────────
//   ACCRUED (serverAccruedSkill === true): the union of what the engine settles —
//     • COMBAT xp skills — the `xp:{...}` keys of every COMBAT_STYLES entry, plus
//       hitpoints (always granted) and the attack/strength fallback route.
//       Source: src/core/styles.js (hitXpRoute/killXpRoute read the same table).
//     • GATHER skills — GATHER_SKILLS (woodcutting/mining/fishing), the exact
//       list src/core/skill-sim.js's simulateSkillSpan pays. Source:
//       src/core/pacing.js. NOTE farming is a 'gather' CATEGORY skill but has no
//       gather node, so it is deliberately NOT here.
//     • PAYABLE ARTISAN skills — the ARTISAN_SETTLEMENT lanes marked 'payable'
//       (smithing/crafting/runecrafting/stonemason/prayer). Source:
//       src/data/item-authority.js — the SAME table that decides which artisan
//       OUTPUTS the item envelope may own, so items and skills cannot disagree
//       about which lane the server settles. Cooking ('unmodeled') is excluded.
//   CLIENT_ONLY (serverAccruedSkill === false): every SKILLS_DEF id NOT in the
//     accrued set (farming, cooking, bountyHunter today) — and, fail-closed, any
//     skill the envelope names that this build does not recognise at all.
//
// PURE ESM. No DOM required to import; loads and answers in Node.
// ============================================================================

import { SKILLS_DEF } from './skills.js?v=495';
import { COMBAT_STYLES } from '../core/styles.js?v=495';
import { GATHER_SKILLS } from '../core/pacing.js?v=495';
import { ARTISAN_SETTLEMENT } from './item-authority.js?v=495';

/* Hitpoints is granted on EVERY landed hit (styles.js hitXpRoute), and the
   pre-styles fallback route trains Attack+Strength — neither shows up as an
   `xp:{...}` key on a style, so both are named here to match the engine exactly. */
export const ALWAYS_COMBAT_XP_SKILLS = Object.freeze(['hitpoints', 'attack', 'strength']);

/** Every skill any COMBAT style's `xp` map trains, ∪ the always-on combat route.
 *  Read off the SAME table hitXpRoute/killXpRoute route XP through, so the client
 *  carve-out and the combat engine cannot disagree about which skills combat pays. */
export function combatXpSkills() {
  const s = new Set(ALWAYS_COMBAT_XP_SKILLS);
  for (const family of Object.values(COMBAT_STYLES || {})) {
    if (!family || typeof family !== 'object') continue;
    for (const style of Object.values(family)) {
      if (style && style.xp && typeof style.xp === 'object') {
        for (const sk of Object.keys(style.xp)) s.add(sk);
      }
    }
  }
  return s;
}

/** The gather skills the engine's simulateSkillSpan actually pays. */
export function gatherXpSkills() {
  return new Set(Array.isArray(GATHER_SKILLS) ? GATHER_SKILLS : []);
}

/** The artisan lanes ruled 'payable' — the skills the engine settles.
 *  Cooking ('unmodeled') and any un-ruled lane are excluded (the safe direction). */
export function payableArtisanSkills() {
  const s = new Set();
  for (const skill of Object.keys(ARTISAN_SETTLEMENT || {})) {
    if (ARTISAN_SETTLEMENT[skill] === 'payable') s.add(skill);
  }
  return s;
}

function addAll(dst, src) { for (const x of src) if (x) dst.add(x); return dst; }

/**
 * Build the accrued/client-only partition. Pure over its inputs.
 */
export function buildSkillAuthority() {
  const accrued = new Set();
  addAll(accrued, combatXpSkills());
  addAll(accrued, gatherXpSkills());
  addAll(accrued, payableArtisanSkills());

  const clientOnly = new Set();
  for (const id of Object.keys(SKILLS_DEF || {})) {
    if (!accrued.has(id)) clientOnly.add(id);
  }
  return { accrued, clientOnly };
}

let _cache = null;
export function skillAuthority() {
  if (!_cache) _cache = buildSkillAuthority();
  return _cache;
}
export function rebuildSkillAuthority() { _cache = buildSkillAuthority(); return _cache; }

/**
 * THE PREDICATE. Is `id` a skill the absolute envelope is allowed to OWN — i.e.
 * one the accrual engine settles? FALSE for everything else, and that is the safe
 * answer: accrue.js then reconciles a false id with `Math.max(have, xp)`, which
 * can only raise it, so a frozen server value can never drag a client-only skill
 * downward. FALSE for an unknown/blank id too — fail-closed toward protection.
 */
export function serverAccruedSkill(id) {
  if (!id || typeof id !== 'string') return false;
  return skillAuthority().accrued.has(id);
}

/** 'accrued' | 'client-only' | 'unknown'. */
export function classifySkill(id) {
  const a = skillAuthority();
  if (a.accrued.has(id)) return 'accrued';
  if (a.clientOnly.has(id)) return 'client-only';
  return 'unknown';
}

/**
 * FAIL-CLOSED completeness: every SKILLS_DEF id must land accrued-or-client-only,
 * never in limbo. Empty by construction (client-only is the complement of accrued
 * over SKILLS_DEF), so a non-empty return is a real drift signal. Pure.
 */
export function unclassifiedSkills() {
  const a = skillAuthority();
  const out = [];
  for (const id of Object.keys(SKILLS_DEF || {})) {
    if (!a.accrued.has(id) && !a.clientOnly.has(id)) out.push(id);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.HearthriseSkillAuthority = {
    ALWAYS_COMBAT_XP_SKILLS,
    combatXpSkills, gatherXpSkills, payableArtisanSkills,
    buildSkillAuthority, skillAuthority, rebuildSkillAuthority,
    serverAccruedSkill, classifySkill, unclassifiedSkills,
  };
}
