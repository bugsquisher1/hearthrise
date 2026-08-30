// ════════════════════════════════════════════════════════════════════════
// src/data/start-kit.js — WHAT A BRAND NEW CHARACTER OWNS. (b338)
//
// THE SINGLE SOURCE. Two consumers read this file and NOBODY holds a second
// copy of the numbers:
//
//   1. THE SERVER. tools/gen-catalogues.mjs emits `hr_start_kit` /
//      `hr_start_equipment` into 2026-08-11-catalogue.generated.sql, and
//      hr_create_character() builds the row set FROM THOSE TABLES. So the
//      starting kit is a data edit plus a regenerate, never SQL surgery, and
//      `node tools/gen-catalogues.mjs --check` (a preflight in
//      tests/run-smoke.mjs) fails the build the moment SQL and data disagree.
//
//   2. THE CLIENT. src/legacy.js's fresh-`G` literal at :604 CANNOT import
//      this — it is a classic script whose object literal is evaluated at
//      parse time, before main.js's ESM bridge has run. That is the exact
//      b222 trap main.js's `unifyObject` header documents, and pretending
//      otherwise would publish `undefined` into a new player's save. So the
//      literal stays, and smoke test B338-1 asserts it EQUALS this file.
//      A guard rather than an import, chosen knowingly and named here so the
//      next reader does not "fix" it into a silent breakage.
//
// ── WHY THE SERVER MUST AGREE WITH THE CLIENT, EXACTLY ──────────────────
// Hearthrise is server-authoritative (CLAUDE.md, locked 2026-08-10). The
// server does not merely *store* a character, it CREATES one — and a server
// that creates a character its own game rules would never produce is a
// content bug with no client-side symptom until the numbers are already wrong
// for a real player. Before b338 the divergence was live and unnoticed:
// hr_create_character() minted 0 gold, no weapon and an empty bag, against a
// client that starts with 500 gold, a Bronze Sword and eleven items. A server
// character walked into combat accrual unarmed.
//
// ── WHOSE NUMBERS THESE ARE ─────────────────────────────────────────────
// The Game Designer's. Every value below is LIFTED VERBATIM from the shipped
// client (src/legacy.js :604-618) — this file relocates already-authored
// balance so both halves can read it. It does not author balance. Changing a
// number here is a Designer call.
// ════════════════════════════════════════════════════════════════════════

/* Currencies + vitals. `hp`/`maxHp` are NOT free parameters: the client
   derives playerMaxHp from the hitpoints level (legacy.js :898,
   `G.playerMaxHp = levelFromXp(G.skills.hitpoints)`), so maxHp must equal the
   level `skills.hitpoints` buys. hitpoints 1154 XP is exactly level 10 —
   verified against the server's own hr_xp_for_level(10), which returns 1154.
   The generator asserts that identity rather than trusting this comment. */
export const START_CURRENCY = Object.freeze({
  gold: 500,
  gems: 0,
  hearthTokens: 0,          // the IAP bond. NEVER minted by a PvE path.
  hp: 10,
  maxHp: 10,
  bankCap: 100,
  farmPlots: 4,
});

/* Skill XP. Absent = 0. `hitpoints` is the only non-zero, the OSRS-lineage
   level-10 start every game in this family uses.

   Deliberately NOT an exhaustive list of the fifteen skills in SKILLS_DEF:
   the server creates a row per skill in the CATALOGUE (hr_skills) and reads
   the starting XP from here, so adding a skill to src/data/skills.js gives
   every new character that skill at 0 with no edit to this file and no edit
   to SQL. The client stores an absent skill as absent and levelFromXp(0) is
   level 1 either way, which is why the two representations agree without a
   translation layer. */
export const START_SKILL_XP = Object.freeze({
  hitpoints: 1154,
});

/* Inventory. item_id -> qty. Every id must exist in src/data/items.js; the
   generator FAILS if one does not, so a typo here cannot become a character
   holding an item the item catalogue has never heard of.

   ── b495 · THE FOOD BRIDGE (Designer ruling, balance audit 2026-08-30) ────
   The kit used to carry `shrimp: 8` — RAW shrimp, heals 3, so 24 HP of buffer
   on a 10 HP character. Measured against the real engine (src/core/combat-sim.js,
   seeded, fresh save, bronze sword, Accurate):

     foe          dmg taken per kill   kills before the character falls
     Slime  (T1)        2.06                     4.8
     Goblin (T1)        4.94                     2.0
     Wolf Cub (T1)      9.36                     1.1

   Two goblins, then the death sheet — and 36 deaths in a measured first
   thirty minutes. AWAY was worse and is the reason this is a P0 rather than a
   feel note: `simulateSpan` BREAKS on the first death, so a brand-new player
   who leaves a fight running overnight was credited **30 seconds of a
   twelve-hour night** (0.1%). The idle pillar was off by default for every
   new account.

   THE BRIDGE, not a supply. 20 cooked shrimp = 20 x 8 = 160 HP on top of the
   10 the character has, which is ~34 goblin kills: enough to finish
   `first_blood` (5 kills), a first-contract bounty (15-25 kills) and ~14
   minutes of a first away night without a single death, and NOT enough to
   avoid learning the loop. It runs out inside session one, on purpose — the
   lesson "fish, then cook, then fight" is the one the first hour has to teach,
   and it teaches far better from an empty food slot than from a corpse.

   `shrimp` stays (8 -> 10) because it is the INPUT half of that lesson: the
   `first_cook` quest asks for 5 dishes and `cook_shrimp` is the level-1 recipe.
   A kit with only cooked food would hand the player the output and hide the
   verb. */
export const START_INVENTORY = Object.freeze({
  turnip_seed: 5,
  carrot_seed: 3,
  shrimp: 10,
  cooked_shrimp: 20,
});

/* Equipment. equip_slot -> item_id. Every pair must exist in
   src/data/gathering.js EQUIP_SLOTS and be a legal slot for that item per
   src/data/items.js; again the generator, not a comment, enforces it. */
export const START_EQUIPMENT = Object.freeze({
  weapon: 'bronze_sword',
});

/* The whole kit, for the one consumer that wants it in one piece (the smoke
   test's drift guard). Frozen so nothing can mutate the source of truth. */
export const START_KIT = Object.freeze({
  currency: START_CURRENCY,
  skillXp: START_SKILL_XP,
  inventory: START_INVENTORY,
  equipment: START_EQUIPMENT,
});
