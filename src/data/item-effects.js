// ============================================================
// src/data/item-effects.js — THE EFFECT REGISTRY, and the two self-closing
// hatches that stop an unbuilt mechanic from becoming permanent debt.
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
// Library 2 of the review book approves ~50 items whose whole point is a
// mechanic ("Constructs' defence is halved against you", "adds a second
// auto-action queue slot", "Prayer XP from every bone you would have buried").
// The ITEM ROWS are worth landing now — the id is the SAVE KEY, the stats have
// to sit on a curve someone derived, the server catalogue has to know them, the
// art batch needs a manifest — but the ENGINES are separate workstreams across
// three domains.
//
// The naive answers are both bad:
//   • ship the item with its stats and no mechanic → the player holds an object
//     that lies about itself. "No placeholders or fakes" (the Final Directive).
//   • hold the whole catalogue until every engine exists → one 50-item big-bang
//     landing, which is the shape this codebase has been burned by before.
//
// ── THE ANSWER: DECLARE THE EFFECT, AND LET THE GUARD CLOSE THE HATCH ──────
// An item declares `effects: ['construct_sunder', …]`. Every kind must appear
// below with an explicit `live` flag. Two smoke guards then hold the line:
//
//   1. an item carrying a NON-live effect kind must have **no faucet** — no
//      recipe, no drop, no shop offer. It exists in the catalogue and in the
//      server's item table; no player can hold one. Nothing lies.
//   2. the moment a kind is flipped to `live: true`, guard 1 inverts: its items
//      must become reachable or the suite goes RED.
//
// That second half is what makes this a hatch rather than a hole. A normal
// "TODO" exemption rots because nothing ever asks about it again; this one
// fails the build the day it is satisfied, which is the only kind of exemption
// worth writing.
//
// `pendingSkill` on an item is the same device for the other axis — an item
// whose SKILL does not exist yet (Fletching, Runecrafting, Stonemason). Guard:
// `pendingSkill` must name a skill that is NOT in SKILLS_DEF. Add the skill and
// the exemption expires in the same commit.
//
// PURE ESM. Data only.
// ============================================================

/**
 * kind → { live, owner, note }
 *
 * `live: true` means an engine in this repo actually reads it TODAY, and a
 * test proves it. Exactly one kind qualifies right now.
 */
/**
 * THE THIRD HATCH — a system that is not built yet (b357).
 *
 * `pendingSkill` said "nothing can produce this because its SKILL is absent".
 * Runecrafting and Stonemason then shipped, that hatch closed correctly, and
 * ten items fell through it — not because their skill is missing but because
 * the SYSTEM their top rungs belong to is. An item whose blocker is named
 * wrongly is worse than one with no name: the exemption expires against the
 * wrong event, so it either fails the build early (this) or, worse, lifts
 * silently while the item is still unobtainable.
 *
 * Same self-closing contract as `EFFECT_KINDS`: flip `live` when the system
 * lands and the b243 reachability guard immediately demands a real recipe.
 * Nothing here may stay `live:false` and unowned.
 */
export const PENDING_SYSTEMS = Object.freeze({
  elements: {
    live: false,
    owner: 'game-designer',
    note: 'Elemental enchanting (consumable-economy §11). Tyler sequenced it '
        + 'AFTER the monster rework because it hangs off the weakness axis. '
        + 'The element axis exists as DATA on all 111 monsters (b357) but no '
        + 'combat term reads it yet. Blocks the 6 elemental rune/whetstone '
        + 'variants — they are the phase-two content itself, not a rung.',
  },
  castle_tiers: {
    live: false,
    owner: 'systems',
    note: 'hr_castle_tiers numbers are set only AFTER the clan_power treasury '
        + 'fix (consumable-economy §8.2). Blocks `vaultstone`: shipping a '
        + 'top-tier building stone with no sink repeats the Cellar "+500 '
        + 'storage" bug in a new coat.',
  },
  tool_ladder: {
    live: false,
    owner: 'game-designer',
    note: 'The Stonemason tool ladder (mason\'s rules) was catalogued with the '
        + 'item wave but its recipes were not authored with the skill. Three '
        + 'rungs, no engine work — the cheapest of the three to close.',
  },
});

export const EFFECT_KINDS = Object.freeze({
  /* ── LIVE ───────────────────────────────────────────────────────────── */
  bane: {
    live: true,
    owner: 'systems',
    note: 'Class damage multiplier. src/core/bane.js → equipmentStats().bane → '
        + 'weaknessInfo().damageMult. Read identically by the live tick and by '
        + 'the Edge accrual engine. Clamped by MAX_BANE_MULT.',
  },

  /* ── DECLARED, NOT YET BUILT ─────────────────────────────────────────
     Each names the owning domain so the handoff is unambiguous, and states
     the seam the engine will have to touch. Items carrying these are, by
     guard, unobtainable. */
  drop_band_vs_class:  { live: false, owner: 'systems',  note: 'src/core/drops.js — shift the drop band by one tier for one monster class.' },
  element_pierce:      { live: false, owner: 'systems',  note: 'Needs the element axis (elementWeak / ELEMENT_BONUS / MAX_WEAKNESS_MULT) which is NOT built. Monster workstream owns elementWeak.' },
  element_immunity:    { live: false, owner: 'systems',  note: 'Same dependency as element_pierce.' },
  reveal_hidden_weak:  { live: false, owner: 'systems',  note: 'Extra Dimensional hides its element until the bestiary reveals it. Needs the bestiary (PROG-01) AND the element axis.' },
  bestiary_rate:       { live: false, owner: 'systems',  note: 'Bestiary kill counters (PROG-01, approved but unbuilt).' },
  passive_bone_prayer: { live: false, owner: 'systems',  note: 'Grant buryXp on kill without consuming the bone. Touches src/core/drops.js + the away replay.' },
  ui_next_threshold:   { live: false, owner: 'art',      note: 'Activity tile affordance. Presentation, not power.' },
  regen_vs_class:      { live: false, owner: 'systems',  note: 'Per-swing HP regen gated on monster class. src/core/combat-sim.js.' },
  sunder_vs_class:     { live: false, owner: 'systems',  note: 'Halve one class defScore, raise every other. A real trade; needs weaknessInfo to carry a defence axis.' },
  gold_vs_class:       { live: false, owner: 'systems',  note: 'Class-scoped gold multiplier. Deliberately NOT a goldFind getBonus key (would hit the fuse and read zero on the server).' },
  first_strike_deny:   { live: false, owner: 'systems',  note: 'Extra Dimensional opens the fight. There is no first-strike model yet.' },
  away_mitigation:     { live: false, owner: 'systems',  note: 'Reduce damage taken during away accrual only. MUST go through src/core/away.js AWAY_SCOPE, not a second code path (b325).' },
  arena_key:           { live: false, owner: 'systems',  note: 'A gate key wearing armour. Needs the arena it gates.' },
  heal_over_swings:    { live: false, owner: 'systems',  note: 'Regen-style food. src/core/auto-eat.js + the away replay.' },
  next_tier_yield:     { live: false, owner: 'systems',  note: 'Gathering rolls the next tier material. src/core/skill-sim.js. Output proc — outside the throughput fuse by §2.5.' },
  byproduct_upgrade:   { live: false, owner: 'systems',  note: 'Mining stone by-product one grade up. Depends on the by-product itself (consumable-economy §8.4 P1), unbuilt.' },
  blessing_amplify:    { live: false, owner: 'systems',  note: 'Add to whichever blessing is active rather than a fixed key. Needs world-events to expose the active key.' },
  guaranteed_rare:     { live: false, owner: 'systems',  note: 'One guaranteed rarest drop per UTC day. Needs a server-side daily ledger — this one CANNOT be client-side.' },
  spawn_class_local:   { live: false, owner: 'systems',  note: 'Farm plot as a combat faucet. Crosses farm + combat.' },
  queue_slot:          { live: false, owner: 'systems',  note: 'A second auto-action queue slot. There is no action queue yet.' },
  auto_vendor_marked:  { live: false, owner: 'systems',  note: 'Away auto-vendor of trash-marked items. Gold is server-owned — must be an Edge grant, never a client credit.' },
  market_slot:         { live: false, owner: 'systems',  note: '+1 market listing slot. SERVER-SIDE: the slot cap is enforced by market_list, so this is a migration, not a client change.' },
  cosmetic_dyed:       { live: false, owner: 'art',      note: 'Colour derived from most-completed bestiary class.' },
  cosmetic_profile:    { live: false, owner: 'art',      note: 'Shows a value on the public profile / clan list.' },
  cosmetic_pin:        { live: false, owner: 'art',      note: 'Pin one Chronicle entry to the public profile.' },
  cosmetic_homestead:  { live: false, owner: 'art',      note: 'Homestead art reads the active world blessing.' },
  dungeon_key:         { live: false, owner: 'systems',  note: 'Doubles as a dungeon key. The `unlocks` field already does this — wire on the day the dungeon exists.' },
});

/** Is every kind on this item known, and are they all live? */
export function effectsAreLive(item) {
  const list = (item && item.effects) || [];
  if (!list.length) return true;
  return list.every((k) => EFFECT_KINDS[k] && EFFECT_KINDS[k].live);
}

/** Kinds an item declares that no engine reads yet. Empty = fully playable. */
export function dormantEffects(item) {
  return ((item && item.effects) || []).filter((k) => !(EFFECT_KINDS[k] && EFFECT_KINDS[k].live));
}
