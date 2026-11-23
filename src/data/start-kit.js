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
import { wageListPrice } from './wage.js';

/* Currencies + the starting HP. `hp` is NOT a free parameter: a new character is
   Level 1 with nothing worn, so it starts at full health, src/core/vitals.js
   maxHpFor(1, 0) (= VITALS.hpBase). Max HP is never stored: it is derived from
   Level and armour (CORE_MODEL.md §3). The generator asserts the identity.
   THE STARTING PURSE IS HOURS OF WAGE AT LEVEL 1 (27-formula-overhaul.md E-11, lane/prices-wage-hours
   2026-11-23): START_GOLD_HOURS_PM milli-hours of wage(1) as a list price (src/data/wage.js wageListPrice), never
   typed, so the wage's levers move it with every price it buys. 39 milli-hours lists at 510 g (500 g sits between
   two whole milli-hours at step 1, 492 and 505): the
   store's first meals and the first seeds, about two of a fresh hero's first thirty minutes of coin on the
   Mill Cellar (183 g, MEASURED with tools/qa/local-world.mjs, lane/prices-wage-hours). The account's purse
   gets it once (ACCOUNT_KIT below). */
export const START_GOLD_HOURS_PM = 39;
export const START_CURRENCY = Object.freeze({
  gold: wageListPrice(START_GOLD_HOURS_PM, 1),
  gems: 0,
  hp: 150,
  bankCap: 100,
  farmPlots: 2,             // the Camp's plots (homestead-tiers.js PROPERTY_TIERS[0]); the ladder grants more
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

   `shrimp` stays (8 -> 10) because it is the INPUT half of that lesson:
   `cook_shrimp` is the level-1 recipe. A kit with only cooked food would hand
   the player the output and hide the verb.

   ── W0 · NO DEAD SEED IN THE KIT (Designer, coherence audit 2026-10-09) ─────
   The kit used to carry `carrot_seed: 3`. Carrots need Farming 10 and a plot
   upgrade, so on day one they were an item the player could neither plant nor
   use. Those three seeds are turnips now (5 -> 8), which a fresh character can
   plant on the camp's two plots the first minute. Carrot seeds come from the
   seed shop once Farming 10 is in reach (the old first-harvest quest reward was
   cut with the quests, 2026-10-22).

   ── W0 · EVERY STYLE STARTS SUPPLIED (coherence audit Top-10 #7, 2026-10-09) ──
   An empty ammo slot on a bow now counts as "run dry" (x0.25 max hit,
   src/core/ammo.js AMMO_EMPTY_SLOT_IS_DRY), so the kit carries the FREE
   arrow (`ammoPerShot: 0`, never depletes) and the first whetstones. It carries
   NO rune (Tyler 2026-10-23): a rune fuels a spell, never a staff's or a wand's
   blow (a caster's basic costs mana), and a new Mage's Fireball casts on the
   store's rune its default slot names (src/data/rule-subjects.js). The Air Rune
   it carried is gone with the old rune ladder. */
/* THE STARTER BAR (Tyler 2026-10-21, designer-confirmed): the game never picks a food or
   drink, so a NEW hero's bar names its items. Slot 1 eats the kit's own 20 Cooked Shrimp;
   once they are gone slot 2 buys Salted Shrimp from the store; slot 3 buys Thin Turnip
   Juice. The fallback is the slot ORDER, which the player can see and change. The engine
   (src/core/hunt/conditions.js heroSlots) and the server (hr_hunt_settings_view,
   2026-11-07-store-by-slot.sql, its ⟦starter-bar⟧ block, pinned by
   tests/hunt-core/conditions.mjs) place these only while the stored bar holds nothing. */
const startSlot = (id, item, metric, value) => Object.freeze({ id, action: Object.freeze({ type: 'consume', id: item }),
  conditions: Object.freeze([Object.freeze({ metric, op: 'lt', value })]), join: 'and' });
export const START_BAR = Object.freeze([
  startSlot('d_food', 'cooked_shrimp', 'self_hp_pct', 60),
  startSlot('d_food_store', 'salted_shrimp', 'self_hp_pct', 60),
  startSlot('d_drink', 'thin_turnip_juice', 'self_mana_pct', 30),
]);

/* ── THE KIT, ONCE AN ACCOUNT AND ONCE A SLOT (CE-10, chapter 08 section 2.1; FB-5 2026-11-21) ─────────
   An account owns four hero slots from its first second (Tyler 2026-11-21), and the purse, the farm and Storage
   are the ACCOUNT's, so a kit paid per hero would pay the account four times. Three parts, each granted by the
   server from these rows (hr_start_kit_lines, generated by tools/gen-catalogues.mjs; 1038-start-kits.sql):
     ACCOUNT_KIT    once an account, into its first hero's bag, with START_CURRENCY.gold into the account purse
     HERO_KIT       once a slot, into that slot's first hero's bag
     STARTER_SETS   every practice weapon, to EVERY hero: the picked set in hand, the rest in the bag. A hero made
                    again in a slot that was paid gets these and nothing else: practice items sell for nothing
   The pick is the player's at creation (hr_create_hero p_set, checked against these rows). */
export const ACCOUNT_KIT = Object.freeze({
  turnip_seed: 8,
  shrimp: 10,
});

export const HERO_KIT = Object.freeze({
  cooked_shrimp: 20,
  bronze_arrows: 50,
  coarse_whetstone: 10,
});

/* The six starter weapon sets a new hero owns (worn or in the bag), one per way to fight (THE PRACTICE KIT,
   Tyler 2026-10-20: every hero can try every role; src/data/items.js practice_*). The picked set is worn: for each
   equip slot, its first item that fits there (so the bow is in hand and the crossbow in the bag). */
export const STARTER_SETS = Object.freeze({
  tank: Object.freeze(['practice_sword', 'practice_shield']),
  dual_axes: Object.freeze(['practice_hatchets']),
  club: Object.freeze(['practice_club']),
  mage: Object.freeze(['practice_wand', 'practice_spellbook']),
  ranger: Object.freeze(['practice_bow', 'practice_crossbow']),
  healer: Object.freeze(['practice_staff']),
});

/* The set a hero made with NO pick wears: hr_create_character(slot) alone, which only the server's own probes and
   the test fixtures call. A player always picks (hr_create_hero refuses a missing set). */
export const DEFAULT_SET = 'tank';

/* What a hero made with no pick wears: DEFAULT_SET in hand (the generator proves the two agree, slot by slot). */
export const START_EQUIPMENT = Object.freeze({
  weapon: 'practice_sword',
  shield: 'practice_shield',
});

/* What a new account's first hero holds in the bag with no pick: both kits and every practice item it does not
   wear. Derived, never typed: the readers that price, sell or list a kit item read this whole set. */
/** @type {Set<string>} */
const WORN = new Set(Object.values(START_EQUIPMENT));
export const START_INVENTORY = Object.freeze(Object.assign({}, ACCOUNT_KIT, HERO_KIT,
  Object.fromEntries(Object.values(STARTER_SETS).flat().filter((id) => !WORN.has(id)).map((id) => [id, 1]))));

/* The whole kit, for the one consumer that wants it in one piece (the smoke
   test's drift guard). Frozen so nothing can mutate the source of truth. */
export const START_KIT = Object.freeze({
  currency: START_CURRENCY,
  skillXp: START_SKILL_XP,
  inventory: START_INVENTORY,
  equipment: START_EQUIPMENT,
});
