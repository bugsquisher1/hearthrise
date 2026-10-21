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

/* Currencies + the starting HP. `hp` is NOT a free parameter: a new character is
   Level 1 with nothing worn, so it starts at full health, src/core/vitals.js
   maxHpFor(1, 0) (= VITALS.hpBase). Max HP is never stored: it is derived from
   Level and armour (CORE_MODEL.md §3). The generator asserts the identity. */
export const START_CURRENCY = Object.freeze({
  gold: 500,
  gems: 0,
  hearthTokens: 0,          // the IAP bond. NEVER minted by a PvE path.
  hp: 150,
  bankCap: 100,
  farmPlots: 4,
});

/* Skill XP. Absent = 0: a new character starts every skill at level 1 and its
   Level at 1 (player_state.level_xp 0). The server creates a row per skill in
   the CATALOGUE (hr_skills) and reads the starting XP from here, so adding a
   skill to src/data/skills.js gives every new character that skill at 0 with no
   edit to this file and no edit to SQL. */
export const START_SKILL_XP = Object.freeze({});

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

   RE-MEASURED 2026-10-06 (monster accuracy 0.006 -> 0.02 per defence point, same
   fresh save, 400 seeds): the curve pivots at defence == foe attack, so a
   level-1 hero is hit slightly MORE — dmg per kill Slime 2.91 -> 2.99, Goblin
   5.53 -> 6.11, Wolf Cub 14.09 -> 16.39. The bridge is ~26 goblin kills, not
   ~29: still past `first_blood` and a first bounty, still gone in session one.

   `shrimp` stays (8 -> 10) because it is the INPUT half of that lesson: the
   `first_cook` quest asks for 5 dishes and `cook_shrimp` is the level-1 recipe.
   A kit with only cooked food would hand the player the output and hide the
   verb.

   ── W0 · NO DEAD SEED IN THE KIT (Designer, coherence audit 2026-10-09) ─────
   The kit used to carry `carrot_seed: 3`. Carrots need Farming 10 and a plot
   upgrade, so on day one they were an item the player could neither plant nor
   use. Those three seeds are turnips now (5 -> 8), which a fresh character can
   plant on the camp's two plots the first minute. Carrot seeds arrive later as
   the reward for the first harvest (`farmhand`, src/data/goal-catalogue.js),
   when Farming 10 is in reach. Server half: 2026-10-16-first-day-seeds.sql.

   ── W0 · EVERY STYLE STARTS SUPPLIED (coherence audit Top-10 #7, 2026-10-09) ──
   An empty ammo slot on a bow or a staff now counts as "run dry" (x0.25 max
   hit, src/core/ammo.js AMMO_EMPTY_SLOT_IS_DRY), so the kit carries the FREE
   tier-1 rung of all three ladders. Each is `ammoPerShot: 0` and never
   depletes, so the quantity is a stack that reads as a supply, not a clock:
   whichever weapon the player picks up first, its ammo is already in the bag.
   The same three are on the Local Shop counter (legacy.js SEED_SHOP), so a
   player who sells them is never locked out. */
/* THE STARTER BAR (Tyler 2026-10-21, designer-confirmed): the game never picks a food or
   drink, so a NEW hero's bar names its items. Slot 1 eats the kit's own 20 Cooked Shrimp;
   once they are gone slot 2 buys Salted Shrimp from the store; slot 3 buys Thin Turnip
   Juice. The fallback is the slot ORDER, which the player can see and change. The engine
   (src/core/hunt/conditions.js heroSlots) and the server (hr_hunt_settings_view,
   2026-11-04-store-by-slot.sql, its ⟦starter-bar⟧ block, pinned by
   tests/hunt-core/conditions.mjs) place these only while the stored bar holds nothing. */
const startSlot = (id, item, metric, value) => Object.freeze({ id, action: Object.freeze({ type: 'consume', id: item }),
  conditions: Object.freeze([Object.freeze({ metric, op: 'lt', value })]), join: 'and' });
export const START_BAR = Object.freeze([
  startSlot('d_food', 'cooked_shrimp', 'self_hp_pct', 60),
  startSlot('d_food_store', 'salted_shrimp', 'self_hp_pct', 60),
  startSlot('d_drink', 'thin_turnip_juice', 'self_mana_pct', 30),
]);

export const START_INVENTORY = Object.freeze({
  turnip_seed: 8,
  shrimp: 10,
  cooked_shrimp: 20,
  bronze_arrows: 50,
  air_rune: 50,
  coarse_whetstone: 10,
  /* THE PRACTICE KIT (Tyler 2026-10-20): every starter weapon set but the worn one, so a
     new hero can try every role (src/data/items.js practice_*; bound, worth nothing). */
  practice_hatchets: 1,
  practice_club: 1,
  practice_bow: 1,
  practice_crossbow: 1,
  practice_wand: 1,
  practice_spellbook: 1,
  practice_staff: 1,
});

/* Equipment. equip_slot -> item_id. Every pair must exist in
   src/data/gathering.js EQUIP_SLOTS and be a legal slot for that item per
   src/data/items.js; again the generator, not a comment, enforces it. */
export const START_EQUIPMENT = Object.freeze({
  weapon: 'practice_sword',
  shield: 'practice_shield',
});

/* The six starter weapon sets a new hero owns (worn or in the bag), one per way to fight.
   Read by the kit test; every id is in START_INVENTORY or START_EQUIPMENT. */
export const STARTER_SETS = Object.freeze({
  tank: Object.freeze(['practice_sword', 'practice_shield']),
  dual_axes: Object.freeze(['practice_hatchets']),
  club: Object.freeze(['practice_club']),
  mage: Object.freeze(['practice_wand', 'practice_spellbook']),
  ranger: Object.freeze(['practice_bow', 'practice_crossbow']),
  healer: Object.freeze(['practice_staff']),
});

/* The whole kit, for the one consumer that wants it in one piece (the smoke
   test's drift guard). Frozen so nothing can mutate the source of truth. */
export const START_KIT = Object.freeze({
  currency: START_CURRENCY,
  skillXp: START_SKILL_XP,
  inventory: START_INVENTORY,
  equipment: START_EQUIPMENT,
});
