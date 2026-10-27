#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-catalogues.mjs — the ONLY authoring path for Postgres catalogues
//
// WHY THIS EXISTS
//   Game data is authored exactly once, in src/data/*.js. JS consumers (the
//   browser and the Deno Edge Functions) import those files literally — zero
//   duplication. Postgres cannot import ESM, but it MUST know a handful of
//   facts to enforce rules the database is the only place to enforce:
//     • which item ids exist at all      → hr_apply refuses unknown ids
//     • which are `bop` (untradeable)    → market_list allowlist
//     • which equip slot an item fits    → hr_apply refuses illegal equips
//     • the reqSkill/reqLv of gear       → hr_apply re-checks the requirement
//     • which activity ids are real      → hr_apply refuses a fake activity
//   Those facts are GENERATED here, never hand-typed. hr_castle_items
//   (2026-08-08-clan-seat.sql:154) is the counter-example: hand-seeded "from
//   items.js" by comment only, with no guard. This codebase has already been
//   burned once by a data double-copy (src/main.js unifyObject header).
//
// USAGE
//   node tools/gen-catalogues.mjs            → (re)write the generated SQL
//   node tools/gen-catalogues.mjs --check    → exit 1 if the committed file
//                                              differs from a fresh generation
//
//   `--check` is a PREFLIGHT in tests/run-sql-tests.mjs and tests/run-smoke.mjs.
//   Drift fails the build. That is the whole point.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
/* DEMOLITION REGEN (2026-10-14): the catalogue is emitted into a NEW, LAST-registered
   file. 2026-08-11-catalogue.generated.sql stays as the replay chain's root, frozen at
   what production first applied; this file is a full delete+insert replace of the
   same tables, so applying it supersedes it. */
/* SEWER CONTENT (lane S1 merge, 2026-10-18): 2026-10-23-demolition-catalogue.generated.sql is
   APPLIED history; the six Sewer monsters, crown_shard / iron_bolts and their activities land in
   this forward file, the same full delete+insert replace. */
/* THE DRINKS (lane S2, 2026-10-18): 2026-10-24-sewer-catalogue.generated.sql is APPLIED history;
   the six mana drinks (hr_items) and their Cooking recipes (hr_activities) land in this forward
   file, the same full delete+insert replace. */
/* THE CORE REBUILD (2026-10-19, docs/design/CORE_MODEL.md): 2026-10-25-drinks-catalogue.generated.sql is
   APPLIED history; the skill list (Melee replaces Attack and Strength; no Hitpoints), the armour weight
   max HP and mana read (hr_items.armour_weight), the start kit's derived HP, the Level-scale monster XP and
   the food heals x12 land in this forward file, the same full delete+insert replace. */
/* THE PRACTICE KIT (lane b-hero-creation, 2026-10-20): 2026-10-27-core-catalogue.generated.sql is APPLIED
   history; the nine practice_* items and the start kit that grants them (every starter weapon set) land in
   this forward file, the same full delete+insert replace. */
/* THE IMBUEMENT SLOT (lane c-loot-loop, 2026-10-21): 2026-11-09-armour-class-catalogue.generated.sql is
   APPLIED history (sixteen armour rows gained their armour_weight; its self-check asserts no armour-slot
   armour row is weightless). The eleven imbuement items (src/data/imbuements.js) land in this forward file,
   which applies AFTER it and carries those weights: the same full delete+insert replace. */
/* MOSSLIGHT GLADE (lane c-ground-16-31, 2026-10-21): the glade's five imbuement items and Rook's Whistle (hr_items),
   and its five monsters' activities. THE v0.2.28 INTEGRATION collapsed the never-applied 11-08 and 11-12 files into
   ONE forward file after the APPLIED 11-09, carrying its armour weights: the same full delete+insert replace. */
/* THE START KIT'S PLOTS (v0.2.30 integration, designer 2026-10-22): 2026-11-18 is the v0.2.29 chain (history once
   applied); the kit's farm_plots 4 -> 2, the Camp's cap (homestead-tiers.js PROPERTY_TIERS[0].plots; catalogue-
   coherence C9), lands in this forward file: the same full delete+insert replace. */
/* COAL AT ANY LEVEL (lane c-work-fixes, 2026-10-22): 2026-11-09-armour-class-catalogue.generated.sql is APPLIED
   history; hr_activities.coal_rock opens at Mining 1 (Tyler 2026-10-14: first tiers, coal included, at any
   level). Same full delete+insert replace. */
/* THE STYLE LADDER (lane c-style-gear, designer 2026-10-22): 2026-11-23 is the v0.2.30 chain (history once applied);
   Iron Hatchets and the Oak Crossbow (hr_items), the fifteen made rungs' recipes (hr_activities artisan rows), the
   club ladder two-handed and three ladder values land in this forward file, after 2026-11-29: the same full replace. */
/* v0.2.31 integration: ONE forward file per generator after the newest APPLIED (2026-11-20): the kit's plots, coal at any level and the style ladder in one file. */
/* THE RUNE FAMILIES x TIERS (lane b-spell-content, Tyler 2026-10-23): 2026-11-22-loot-catalogue.generated.sql is APPLIED
   history; the family x tier runes (hr_items), their bind recipes (hr_activities) and the start kit without its Air Runes
   (hr_start_inventory) land in the spell release's forward file (below): the same full delete+insert replace. */
/* THE LOOT BANDS (lane b-loot-bands, Tyler 2026-10-23): 2026-11-22 is APPLIED history. No gear binds ("Nah no bound gear
   in this game"): the practice kit, the premium Oak Practice Blade, the dungeon signature weapons and the boss-forge
   bodies turn tradeable (hr_items.tradeable; the Hearthfind trophies stay bound), and Grayjaw's Ruff joins hr_items.
   ONE forward file, the same full delete+insert replace, applied before 2026-12-20-hunt-sessions-catalogue (APPLIED with
   v0.2.37: history now, never regenerated). */
/* THE SHIELDS (lane b-spell-roles, Tyler 2026-10-23): the five shields (hr_items, hr_item_slots: shield), their three
   Smithing recipes (hr_activities artisan rows) and every bow two-handed (hr_items.two_handed: a bow carries no shield).
   THE SPELL RELEASE (v0.2.39 integration): ONE forward file ON TOP of the APPLIED 2026-12-20-loot-catalogue, carrying the
   rune families and the shields (the staged 12-22 and 12-24 files collapsed into it, never applied): the same full replace,
   FIRST of the release's files (2027-01-13-rune-ladder-cut.sql and the hunt-sessions catalogue read its items). */
/* GEAR BY LEVEL (lane b-gear-by-level, Tyler 2026-10-24: "I think all gear should just be hero level"; "Supplies/runes
   stick to skill level"): 2027-01-13-items-catalogue.generated.sql is APPLIED history (v0.2.42), never regenerated.
   Every equipment row's hr_items.req_skill turns 'level' (gear-tiers.js LEVEL_REQ) at its tier's Level; ammo, runes,
   food and drink keep their skill. ONE forward file, the same full delete+insert replace, applied AFTER
   2027-01-14-gear-by-level.sql (hr_apply reads 'level' as the hero's Level only once that file has landed). */
/* THE REGROW LIMIT (lane a-regrow-harvest, 2026-10-26): 2027-01-14-items-catalogue.generated.sql is APPLIED history.
   Every full replace since 2026-08-22 re-inserted hr_crops WITHOUT regrow_limit, so tomato and emberfruit ended at 0
   (= no limit) on the chain and live, against src/core/farm.js REGROW_LIMITS. The hr_crops rows now carry it (this
   generator refuses a regrowing crop without a finite limit) and the emitted self-check asserts the landed limits and
   plays one vine to its wither. ONE forward file, the same full delete+insert replace. */
/* INNER FLAME (lane b-inner-flame, Tyler 2026-10-25: the Great Hearth replaces Prayer): 2027-01-27-items-catalogue.generated.sql
   is APPLIED history. The skill row prayer -> inner_flame (hr_skills), the bench's rows bury_* -> fuel_<item> with the family
   fuels' rungs (hr_activities), and the eight fuels (hr_items) land in ONE forward file, the same full delete+insert replace,
   applied before 2027-01-31-inner-flame.sql (which renames the players' rows onto it). */
const OUT = join(ROOT, 'supabase', 'migrations', '2027-01-31-items-catalogue.generated.sql');
/* THE SECOND GENERATED FILE (2026-09-13). hr_item_buffs is emitted as its own
   migration rather than into OUT above, and that is a deliberate operational
   call: OUT is the FOURTH file in tests/schema-apply-order.json and is already
   APPLIED to production, so folding a new table into it would make every future
   catalogue regeneration a re-apply of the chain's root. A new table arriving in
   a new, LAST-registered file is additive for an operator and for the replay.
   Both files are covered by the same `--check`. */
const OUT_ITEM_BUFFS = join(ROOT, 'supabase', 'migrations',
  '2026-09-13-item-buffs-catalogue.generated.sql');
/* THE THIRD GENERATED FILE (2026-09-13, buffs step 3). hr_room_perks is the
   ROOM RUNG -> PERK payload, the same table src/data/perks.js holds for the two
   JS runtimes, so hr_apply can price the Cellar's buffDuration under the
   character lock without a second hand-typed copy of a balance ladder. Same
   operational reason as OUT_ITEM_BUFFS for being its own LAST-registered file
   rather than folded into OUT (which is already applied and is the chain's
   fourth file). Covered by the same `--check`. */
/* DEMOLITION REGEN (2026-10-14, Master Design Reference §9): the room-perk
   catalogue is re-emitted into a NEW, LAST-registered file; the 2026-09-13 file
   stays in the chain. */
/* ROOM PURPOSE REGEN (2026-10-22 game-designer ruling): the Library's runeSpeed,
   the Garden's farmPlots and the Trophy Room's trophyMounts; again a NEW,
   LAST-registered file, the applied 2026-10-23 one stays in the chain. */
/* INNER FLAME (lane b-inner-flame, 2026-10-27): 2026-11-30 is APPLIED history; the Shrine's key prayerSpeed -> flameSpeed. */
const OUT_ROOM_PERKS = join(ROOT, 'supabase', 'migrations',
  '2027-01-31-room-perks-catalogue.generated.sql');

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// ── 1. Read the single source of truth ───────────────────────────────────
const { ITEMS } = await imp('src/data/items.js');
const { SKILLS_DEF } = await imp('src/data/skills.js');
const { CROPS, EQUIP_SLOTS } = await imp('src/data/gathering.js');
const { ARMOUR_SLOTS } = await imp('src/data/core-model.js');
// b338 — what a brand new character owns. See src/data/start-kit.js for why
// this is data rather than a literal inside hr_create_character().
const { START_CURRENCY, START_SKILL_XP, START_INVENTORY, START_EQUIPMENT }
  = await imp('src/data/start-kit.js');

// ── 2. Derive the rows ───────────────────────────────────────────────────
// The `slot` an item authors ('ring') is not always an equip slot the player
// has ('ring1'/'ring2'). Expansion happens in JS, next to the data — never as a
// special case inside PL/pgSQL, which is how the two copies would start to
// disagree. b366 MOVED the table itself into src/data/gathering.js beside
// EQUIP_SLOTS, because the equip intent became a SECOND consumer of it and a
// generator-private copy would have been re-typed into the Edge Function.

/* The three F2 tables are derived in tools/catalogue-rows.mjs so that
   tests/catalogue-literal-drift.mjs can import the SAME derivation instead of
   re-typing it. This file is a script (importing it WRITES the migrations), so
   the derivation had to move out for a guard to reuse it. Pure move: --check
   is the byte-for-byte proof. */
const { deriveCatalogueRows } = await import('./catalogue-rows.mjs');
const { itemIds, items, itemSlots, activities } = await deriveCatalogueRows();

const equipSlots = EQUIP_SLOTS.map((s, i) => ({ equip_slot: s, ord: i }));

/* GEAR IS WORN BY LEVEL (Tyler 2026-10-24, gear-tiers.js LEVEL_REQ). FAIL GENERATION, not the migration: an equipment
   row (any slot but the ammo slot) naming a skill or nothing, a supply naming the Level, or a Level gate with no level.
   The emitted self-check re-asserts the first two on the rows that land. */
const { LEVEL_REQ } = await imp('src/data/gear-tiers.js');
{
  const gearDie = (msg) => { console.error(`gear-by-level: ${msg}`); process.exit(1); };
  const worn = new Set(itemSlots.filter((p) => p.equip_slot !== 'ammo').map((p) => p.item_id));
  for (const r of items) {
    if (worn.has(r.item_id) && r.req_skill !== LEVEL_REQ) gearDie(`${r.item_id} is worn in an equip slot but names ${JSON.stringify(r.req_skill)}, not the hero's Level`);
    if (!worn.has(r.item_id) && r.req_skill === LEVEL_REQ) gearDie(`${r.item_id} is no equipment but names the hero's Level (a supply keeps its skill)`);
    if (r.req_skill === LEVEL_REQ && !(Number.isInteger(r.req_lv) && r.req_lv >= 1)) gearDie(`${r.item_id} names the hero's Level with req_lv ${r.req_lv}`);
  }
}

const skills = Object.keys(SKILLS_DEF).sort().map((id) => ({
  skill_id: id, name: String(SKILLS_DEF[id].name ?? id), cat: String(SKILLS_DEF[id].cat ?? ''),
}));

/* THE FINITE-PERENNIAL LIMIT (src/core/farm.js REGROW_LIMITS, the one source). FAIL GENERATION, not the migration: a
   regrowing crop needs a whole limit > 0 (0 is the server's "no limit"), a crop that does not regrow carries none. */
const { REGROW_LIMITS } = await imp('src/core/farm.js');
const regrowLimitOf = (id) => {
  const lim = REGROW_LIMITS[id];
  if (CROPS[id].regrows === true) {
    if (!Number.isInteger(lim) || lim <= 0) { console.error(`regrow-limit: regrowing crop ${id} has no finite REGROW_LIMITS entry (got ${lim})`); process.exit(1); }
    return lim;
  }
  if (lim !== undefined) { console.error(`regrow-limit: crop ${id} does not regrow but carries a REGROW_LIMITS entry`); process.exit(1); }
  return 0;
};

const crops = Object.keys(CROPS).sort().map((id) => ({
  crop_id: id,
  seed_item: CROPS[id].seed ?? null,
  prod_item: CROPS[id].prod ?? null,
  base_hours: Number(CROPS[id].hours ?? 0),
  req_lv: Math.trunc(CROPS[id].req ?? 1),
  // Server-farming (2026-08-20): the HARVEST is server-authored, so the yield
  // band, the per-unit XP and the regrow flag must be catalogue truth, not a
  // client number. yield is `[min,max]` in CROPS; a malformed entry collapses
  // to a fixed 1 rather than minting an unbounded band.
  yield_min: Math.max(1, Math.trunc((Array.isArray(CROPS[id].yield) ? CROPS[id].yield[0] : 1) || 1)),
  yield_max: Math.max(
    Math.max(1, Math.trunc((Array.isArray(CROPS[id].yield) ? CROPS[id].yield[0] : 1) || 1)),
    Math.trunc((Array.isArray(CROPS[id].yield) ? CROPS[id].yield[1] : 1) || 1),
  ),
  xp: Math.max(0, Math.trunc(CROPS[id].xp ?? 0)),
  regrows: CROPS[id].regrows === true,
  regrow_limit: regrowLimitOf(id),
}));

// Activities: every id `player_state.active_id` may legally hold, with the
// skill gate the server re-checks. Combat "activities" are monsters.

// ── 2b. THE STARTING KIT (b338) ──────────────────────────────────────────
// hr_create_character() used to carry the starting state as literals in
// PL/pgSQL, and it had DRIFTED: 0 gold and an empty bag against a client that
// starts with 500 gold, a Bronze Sword and eleven items. A server that mints a
// character its own rules would never produce is a content bug with no
// client-side symptom. So the kit becomes catalogue rows like everything else,
// and the checks below are the reason this is worth doing rather than a
// second literal in a second language: a typo'd item id, an illegal equip
// slot, or a starting hp that is not a Level-1 character's full health FAILS GENERATION.
const { maxHpFor } = await imp('src/core/vitals.js');

const die = (msg) => { console.error(`start-kit: ${msg}`); process.exit(1); };

const startInventory = Object.keys(START_INVENTORY).sort().map((id) => {
  if (!ITEMS[id]) die(`START_INVENTORY names "${id}", which is not in src/data/items.js`);
  const qty = START_INVENTORY[id];
  if (!Number.isInteger(qty) || qty <= 0) die(`START_INVENTORY.${id} must be a positive integer`);
  return { item_id: id, qty };
});

const legalSlots = new Map();
for (const p of itemSlots) {
  if (!legalSlots.has(p.item_id)) legalSlots.set(p.item_id, new Set());
  legalSlots.get(p.item_id).add(p.equip_slot);
}
const startEquipment = Object.keys(START_EQUIPMENT).sort().map((slot) => {
  const id = START_EQUIPMENT[slot];
  if (!equipSlots.some((e) => e.equip_slot === slot)) die(`START_EQUIPMENT names slot "${slot}", which is not in EQUIP_SLOTS`);
  if (!ITEMS[id]) die(`START_EQUIPMENT.${slot} names "${id}", which is not in src/data/items.js`);
  // The pair, not just the two halves. Equipping a shield into `weapon` is the
  // failure this catches, and hr_apply's own slot check would never see it
  // because the row was written by the bootstrap, not proposed as a delta.
  if (!(legalSlots.get(id) || new Set()).has(slot)) {
    die(`START_EQUIPMENT puts "${id}" in "${slot}", but items.js does not allow that slot for it`);
  }
  return { equip_slot: slot, item_id: id };
});

const startSkillXp = Object.keys(START_SKILL_XP).sort().map((id) => {
  if (!SKILLS_DEF[id]) die(`START_SKILL_XP names "${id}", which is not in src/data/skills.js`);
  const xp = START_SKILL_XP[id];
  if (!Number.isInteger(xp) || xp < 0) die(`START_SKILL_XP.${id} must be a non-negative integer`);
  return { skill_id: id, xp };
});

// THE IDENTITY THAT MATTERS MOST, asserted rather than commented: a new
// character is Level 1 with no armour, so its starting HP is exactly that
// character's max HP (src/core/vitals.js maxHpFor(1, 0)); max HP itself is
// never stored (CORE_MODEL.md §3), so there is no second number to drift.
{
  if (START_CURRENCY.hp !== maxHpFor(1, 0)) {
    die(`START_CURRENCY.hp is ${START_CURRENCY.hp} but a Level-1 character's max HP is ${maxHpFor(1, 0)}`);
  }
  if (Object.keys(START_SKILL_XP).some((k) => SKILLS_DEF[k] && SKILLS_DEF[k].cat === 'combat' && START_SKILL_XP[k] > 0)) {
    die('START_SKILL_XP gives a combat skill a head start: every combat skill starts at level 1');
  }
  for (const k of ['gold', 'gems', 'hearthTokens', 'hp', 'bankCap', 'farmPlots']) {
    if (!Number.isInteger(START_CURRENCY[k]) || START_CURRENCY[k] < 0) {
      die(`START_CURRENCY.${k} must be a non-negative integer`);
    }
  }
  // No PvE path may mint the bond (the Final Directive). A non-zero starting
  // grant is exactly such a path, and it would be free and repeatable per slot.
  if (START_CURRENCY.hearthTokens !== 0) die('START_CURRENCY.hearthTokens must be 0 — the Hearth Token is IAP-only');
}

/* THE UNCAPPED SKILL CURVE (Melee, Ranged, Magic, Defense, Prayer): total XP to reach each level,
   from src/core/xp.js skillXpForLevel (the one walk), until the next level would pass 2^53. The server's
   hr_skill_level / hr_skill_xp_for_level read these rows, as hr_level_from_xp reads hr_xp_table. */
const { skillXpForLevel } = await imp('src/core/xp.js');
const skillCurve = [];
for (let lv = 1; ; lv++) {
  const xp = skillXpForLevel('melee', lv);
  if (lv > 1 && xp <= skillCurve[skillCurve.length - 1].xp) break;
  skillCurve.push({ level: lv, xp });
}
if (skillCurve.length < 200) die(`the skill curve stops at level ${skillCurve.length}: too short for an uncapped skill`);

/* THE FEAST HEAL VALUES (public.hr_feast_foods, 2026-08-27-clan-economy-sinks.sql): every cooked or
   prepared food's heals (foodClass healing|buff, heals > 0 — tests/clan-feast-catalogue-drift.mjs's own
   rule), upserted, because the core rebuild moved every food heal x12 (CORE_NUMBERS Q3). */
const feastFoods = Object.entries(ITEMS)
  .filter(([, d]) => d && (d.foodClass === 'healing' || d.foodClass === 'buff') && Number(d.heals) > 0)
  .map(([id, d]) => ({ item_id: id, heals: Number(d.heals) }))
  .sort((a, b) => (a.item_id < b.item_id ? -1 : 1));

const startKit = {
  gold: START_CURRENCY.gold, gems: START_CURRENCY.gems,
  hearth_tokens: START_CURRENCY.hearthTokens,
  hp: START_CURRENCY.hp,
  bank_cap: START_CURRENCY.bankCap, farm_plots: START_CURRENCY.farmPlots,
};

// ── 2c. THE RUNE → ELEMENT CATALOGUE (ELEMENTS/ENCHANTING v1) ─────────────
// hr_runes is what hr_apply's enchant block resolves a rune id to an ELEMENT
// against, under the character lock — never the element the Edge Function
// proposed. It is DERIVED here, from the SAME src/data/items.js the client
// renders from, for exactly the reason every other catalogue is: a hand-typed
// rune→element table in PL/pgSQL would be the data double-copy this repo has
// already been burned by (src/main.js unifyObject header). A rune is any item
// with `tag:'rune'`; its `element` is one of ember/frost/poison.
//
// ⚠ A RUNE WITH NO VALID ELEMENT FAILS GENERATION, rather than being silently
//   dropped. A dropped rune would be an item the shop and bag show but that
//   hr_apply answers `unknown_item` for — un-enchantable while looking present,
//   which is the b341 UI-says-one-thing-engine-does-another failure class. An
//   unauthored element that disables a control is worse than an absent control.
/* The one vocabulary (src/data/elements.js), never a generator-private copy. */
const { ELEMENTS: RUNE_ELEMENTS } = await imp('src/data/elements.js');
const runes = itemIds
  .filter((id) => (ITEMS[id] || {}).tag === 'rune')
  .map((id) => {
    const el = ITEMS[id].element;
    if (!RUNE_ELEMENTS.includes(el)) {
      die(`rune "${id}" has element ${JSON.stringify(el)} — every tag:'rune' item must carry `
        + `an element from src/data/elements.js (${RUNE_ELEMENTS.join('|')}), or hr_apply cannot resolve it`);
    }
    return { rune_id: id, element: el };
  });

// ── 2d. THE ITEM → BUFF CATALOGUE (consumable buffs, step 1) ──────────────
// hr_item_buffs is what hr_apply's `buff_apply` block resolves an ITEM ID to a
// (type, magnitude, duration) against — under the character lock, from the
// server's own row, NEVER from the delta. The client sends `{buff_apply:{item}}`
// and nothing else; there is no representation in which it can name a type, a
// magnitude, a duration or an expiry, which is the whole point of the table.
//
// DERIVED, for the reason every other catalogue here is: a hand-typed
// item→buff table in PL/pgSQL would be the data double-copy this repo has been
// burned by (src/main.js unifyObject header), and it would drift the first time
// a designer retunes a Feast. `hr_castle_items` is the counter-example that is
// still in the tree: hand-seeded "from items.js" by comment only, no guard.
//
// THE VOCABULARY IS src/core/buffs.js BUFFS_DEF — the same registry `applyBuff`
// rejects an unknown type against and the same one `buffBonuses` pays from. A
// buff whose type the ENGINE cannot pay FAILS GENERATION rather than being
// dropped: a dropped row is a food the bag shows, the tooltip promises an
// effect for, and hr_apply answers `bad_buff_item` to — the b341
// UI-says-one-thing-engine-does-another class, which is worse than no food.
const { BUFFS_DEF } = await imp('src/core/buffs.js');
// The server's hard ceiling on a buff's expiry, mirrored from hr_apply's
// c_buff_max_ms (2026-09-13-consumable-buffs.sql). A food whose duration
// EXCEEDS it could never be delivered in full — the clamp would silently eat
// the tail — so it fails generation instead of shipping a lie in a tooltip.
const BUFF_MAX_MS = 3600000;
const itemBuffs = itemIds
  .filter((id) => (ITEMS[id] || {}).buff)
  .map((id) => {
    const b = ITEMS[id].buff || {};
    if (!Object.prototype.hasOwnProperty.call(BUFFS_DEF, b.type)) {
      die(`item "${id}" carries buff type ${JSON.stringify(b.type)}, which src/core/buffs.js BUFFS_DEF `
        + 'does not know — the engine would pay it NOTHING while the tooltip promised an effect');
    }
    if (!Number.isFinite(b.magnitude) || b.magnitude <= 0) {
      die(`item "${id}" has buff magnitude ${JSON.stringify(b.magnitude)} — a buff must be a positive number`);
    }
    if (!Number.isInteger(b.durationMs) || b.durationMs <= 0) {
      die(`item "${id}" has buff durationMs ${JSON.stringify(b.durationMs)} — must be a positive integer of ms`);
    }
    if (b.durationMs > BUFF_MAX_MS) {
      die(`item "${id}" has buff durationMs ${b.durationMs}, above the server's ${BUFF_MAX_MS} ms expiry cap `
        + '— the clamp would silently discard the tail, so the tooltip would promise time the server refuses '
        + `to hold. Author it at or below ${BUFF_MAX_MS} ms, or raise c_buff_max_ms in the migration first.`);
    }
    return { item_id: id, type: b.type, magnitude: b.magnitude, duration_ms: b.durationMs };
  });
if (itemBuffs.length === 0) {
  die('no item in src/data/items.js carries a `buff` — hr_item_buffs would be seeded EMPTY and every '
    + 'buff_apply would answer bad_buff_item. A catalogue that is silently empty is the always-null '
    + 'probe this repo has been bitten by nine times.');
}
const BUFF_TYPES = [...new Set(itemBuffs.map((r) => r.type))].sort();

// ── 3. Hash — the DB-side half of the drift guard ────────────────────────
// The same digest is asserted by tests/sql/server-authority.test.sql against
// hr_catalogue_meta, so a database that was loaded from an older generation is
// detectable without diffing 400 rows by hand.
const canonical = JSON.stringify({ items, itemSlots, equipSlots, skills, crops, activities,
  startKit, startSkillXp, startInventory, startEquipment, runes });
const DIGEST = createHash('sha256').update(canonical).digest('hex');

// ── 4. Emit ──────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');
const n = (v) => (v === null || v === undefined ? 'null' : String(v));

const valuesBlock = (rows, fn) => rows.map(fn).join(',\n');

const sql = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — SERVER CATALOGUES  (GENERATED — DO NOT EDIT BY HAND)
--
--   Generated by tools/gen-catalogues.mjs from src/data/*.js.
--   Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-catalogues.mjs --check\`, which is a preflight in
--   tests/run-sql-tests.mjs. Edit src/data/*.js and regenerate.
--
--   catalogue digest: ${DIGEST}
--   rows: ${items.length} items (${items.filter((r) => !r.tradeable).length} untradeable) ·
--         ${itemSlots.length} item-slot pairs · ${equipSlots.length} equip slots ·
--         ${skills.length} skills · ${crops.length} crops · ${activities.length} activities ·
--         ${runes.length} runes
--
-- APPLY ORDER: 2026-08-11-player-state.sql → THIS FILE → 2026-08-11-apply-engine.sql
--              → 2026-08-11-market-v2.sql
--   The two files after this one FAIL CLOSED if hr_items is absent: an unknown
--   item check that silently no-ops is worse than no check, because it reads as
--   a control in review. (Security review S3.)
--
-- SAFE TO RE-RUN. Catalogue rows are replaced wholesale, in one transaction.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
end $$;

create table if not exists public.hr_items (
  item_id   text primary key,
  name      text    not null,
  tradeable boolean not null,
  kind      text,
  value     bigint  not null default 0,
  req_skill text,
  req_lv    int,
  heals     int
);
-- Additive, because hr_items already exists on every database that has run an
-- earlier revision of this file, where "create table if not exists" would skip
-- a widened column list in silence. NOT NULL with a default so no row can carry
-- an unknown answer to "may auto-eat spend this?".
alter table public.hr_items
  add column if not exists auto_eatable boolean not null default false;
-- THE ARMOUR WEIGHT (CORE_MODEL.md §3): heavy / medium / light, from the row's
-- armourClass (src/data/core-model.js ARMOUR_WEIGHT); hr_vitals_of counts the worn
-- armour slots of each weight. NULL = not armour.
alter table public.hr_items
  add column if not exists armour_weight text check (armour_weight in ('heavy', 'medium', 'light'));
-- TWO-HANDED (Tyler 2026-10-19): a staff fills both hands; hr_apply refuses an off-hand beside it.
alter table public.hr_items
  add column if not exists two_handed boolean not null default false;
create index if not exists hr_items_tradeable_idx on public.hr_items (tradeable);

create table if not exists public.hr_item_slots (
  item_id    text not null,
  equip_slot text not null,
  primary key (item_id, equip_slot)
);

create table if not exists public.hr_equip_slots (
  equip_slot text primary key,
  ord        int  not null
);

create table if not exists public.hr_skills (
  skill_id text primary key,
  name     text not null,
  cat      text not null
);

create table if not exists public.hr_crops (
  crop_id    text primary key,
  seed_item  text,
  prod_item  text,
  base_hours numeric not null,
  req_lv     int     not null,
  yield_min  int     not null default 1,
  yield_max  int     not null default 1,
  xp         int     not null default 0,
  regrows    boolean not null default false,
  regrow_limit int   not null default 0
);
-- Existing databases (created by a pre-2026-08-20 generator) get the columns
-- from 2026-08-20-server-farming.sql; the ALTERs there and these column defs
-- must agree. A fresh replay lands the full shape here.
alter table public.hr_crops add column if not exists yield_min int     not null default 1;
alter table public.hr_crops add column if not exists yield_max int     not null default 1;
alter table public.hr_crops add column if not exists xp        int     not null default 0;
alter table public.hr_crops add column if not exists regrows   boolean not null default false;
alter table public.hr_crops add column if not exists regrow_limit int  not null default 0;

create table if not exists public.hr_activities (
  kind        text not null check (kind in ('gather','artisan','combat')),
  activity_id text not null,
  req_skill   text,
  req_lv      int,
  primary key (kind, activity_id)
);
-- Additive, for the same reason hr_items.auto_eatable is: hr_activities already
-- exists on every database that ran an earlier revision of this file, where
-- "create table if not exists" would skip a widened column list IN SILENCE.
-- NULLABLE, because only a combat row has one — and the self-check below
-- asserts the count, so a re-apply against an older database cannot leave every
-- combat row on a null ceiling and quietly make hr_apply's fight clamp vacuous.
alter table public.hr_activities
  add column if not exists max_hp int;
-- THE MONSTER'S LEVEL (2026-10-27 core rebuild, CORE_MODEL.md §4): a combat row's
-- level (src/data/monsters.js monsterLevelOf), which Defense XP per blow scales
-- with and the settle's Defense bound reads. NULL on every non-combat row.
alter table public.hr_activities
  add column if not exists level int check (level is null or level > 0);
-- is_boss — additive, same self-configuring shape as max_hp/auto_eatable: a
-- database that created hr_activities before this column existed must not leave
-- every combat row FALSE (which would silently zero the renown bossKill term
-- for everyone). NOT NULL default false, and the self-check below asserts the
-- combat boss COUNT so a re-apply against an older DB is caught.
alter table public.hr_activities
  add column if not exists is_boss boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_activities'::regclass
                    and conname = 'hr_activities_max_hp_positive') then
    alter table public.hr_activities
      add constraint hr_activities_max_hp_positive
      check (max_hp is null or max_hp > 0);
  end if;
end $$;

-- ── THE STARTING KIT (b338) ──────────────────────────────────────────────
-- What hr_create_character() gives a brand new character. Catalogue rows, not
-- literals in PL/pgSQL, so the starting kit is a data edit plus a regenerate
-- and the client's own fresh-character values are the single source.
create table if not exists public.hr_start_kit (
  only_row      boolean primary key default true check (only_row),
  gold          bigint not null check (gold >= 0),
  gems          bigint not null check (gems >= 0),
  hearth_tokens bigint not null check (hearth_tokens = 0),  -- IAP-only, never minted
  hp            int    not null check (hp >= 0),
  bank_cap      int    not null check (bank_cap between 1 and 100000),
  farm_plots    int    not null check (farm_plots between 0 and 64)
);

-- ── THE UNCAPPED SKILL CURVE (CORE_MODEL.md §2) ─────────────────────────
create table if not exists public.hr_skill_curve (
  level int    primary key check (level >= 1),
  xp    bigint not null check (xp >= 0)
);

create table if not exists public.hr_start_skill_xp (
  skill_id text primary key,
  xp       bigint not null check (xp >= 0)
);

create table if not exists public.hr_start_inventory (
  item_id text primary key,
  qty     bigint not null check (qty > 0)
);

create table if not exists public.hr_start_equipment (
  equip_slot text primary key,
  item_id    text not null
);

-- ── THE RUNE CATALOGUE (ELEMENTS/ENCHANTING v1) ──────────────────────────
-- rune_id → element, resolved by hr_apply's enchant block under the character
-- lock. The CHECK pins the element vocabulary in the database itself, so a
-- generation that somehow emitted a fourth element is refused at apply time
-- rather than stored.
create table if not exists public.hr_runes (
  rune_id text primary key,
  element text not null check (element in ('ember','frost','poison'))
);

create table if not exists public.hr_catalogue_meta (
  only_row     boolean primary key default true check (only_row),
  digest       text not null,
  generated_at timestamptz not null default now()
);

-- ── Replace the contents. Wholesale, so a DELETED item really disappears —
--    an upsert-only generator leaves ghosts behind, and a ghost item id is a
--    hole in exactly the allowlist this table exists to be.
delete from public.hr_item_slots;
delete from public.hr_items;
delete from public.hr_equip_slots;
delete from public.hr_skills;
delete from public.hr_crops;
delete from public.hr_activities;
delete from public.hr_start_skill_xp;
delete from public.hr_start_inventory;
delete from public.hr_start_equipment;
delete from public.hr_runes;
delete from public.hr_skill_curve;

insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable, armour_weight, two_handed) values
${valuesBlock(items, (r) => `  (${q(r.item_id)},${q(r.name)},${b(r.tradeable)},${q(r.kind)},${n(r.value)},${q(r.req_skill)},${n(r.req_lv)},${n(r.heals)},${b(r.auto_eatable)},${q(r.armour_weight)},${b(r.two_handed)})`)};

insert into public.hr_item_slots (item_id, equip_slot) values
${valuesBlock(itemSlots, (r) => `  (${q(r.item_id)},${q(r.equip_slot)})`)};

insert into public.hr_equip_slots (equip_slot, ord) values
${valuesBlock(equipSlots, (r) => `  (${q(r.equip_slot)},${n(r.ord)})`)};

insert into public.hr_skills (skill_id, name, cat) values
${valuesBlock(skills, (r) => `  (${q(r.skill_id)},${q(r.name)},${q(r.cat)})`)};

insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv, yield_min, yield_max, xp, regrows, regrow_limit) values
${valuesBlock(crops, (r) => `  (${q(r.crop_id)},${q(r.seed_item)},${q(r.prod_item)},${n(r.base_hours)},${n(r.req_lv)},${n(r.yield_min)},${n(r.yield_max)},${n(r.xp)},${b(r.regrows)},${n(r.regrow_limit)})`)};

insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss, level) values
${valuesBlock(activities, (r) => `  (${q(r.kind)},${q(r.activity_id)},${q(r.req_skill)},${n(r.req_lv)},${n(r.max_hp)},${b(r.is_boss)},${n(r.level)})`)};

-- The starting kit. hr_start_kit is a ONE-ROW table (only_row), so it is an
-- upsert rather than a delete+insert: hr_create_character() reads it, and a
-- momentary gap where the row does not exist would be a window in which a new
-- character could be created with no kit at all.
insert into public.hr_start_kit (only_row, gold, gems, hearth_tokens, hp, bank_cap, farm_plots)
  values (true, ${n(startKit.gold)}, ${n(startKit.gems)}, ${n(startKit.hearth_tokens)},
          ${n(startKit.hp)}, ${n(startKit.bank_cap)}, ${n(startKit.farm_plots)})
  on conflict (only_row) do update set
    gold = excluded.gold, gems = excluded.gems, hearth_tokens = excluded.hearth_tokens,
    hp = excluded.hp, bank_cap = excluded.bank_cap,
    farm_plots = excluded.farm_plots;

${startSkillXp.length ? `insert into public.hr_start_skill_xp (skill_id, xp) values
${valuesBlock(startSkillXp, (r) => `  (${q(r.skill_id)},${n(r.xp)})`)};` : '-- (every skill starts at 0 XP: hr_start_skill_xp is empty)'}

insert into public.hr_skill_curve (level, xp) values
${valuesBlock(skillCurve, (r) => `  (${n(r.level)},${n(r.xp)})`)};

insert into public.hr_start_inventory (item_id, qty) values
${valuesBlock(startInventory, (r) => `  (${q(r.item_id)},${n(r.qty)})`)};

insert into public.hr_start_equipment (equip_slot, item_id) values
${valuesBlock(startEquipment, (r) => `  (${q(r.equip_slot)},${q(r.item_id)})`)};

${runes.length ? `insert into public.hr_runes (rune_id, element) values
${valuesBlock(runes, (r) => `  (${q(r.rune_id)},${q(r.element)})`)};` : '-- (no tag:\'rune\' items authored yet — hr_runes seeded empty)'}

-- The feast heal values (the clan feast's table), from the same items.js heals.
insert into public.hr_feast_foods (item_id, heals) values
${valuesBlock(feastFoods, (r) => `  (${q(r.item_id)},${n(r.heals)})`)}
on conflict (item_id) do update set heals = excluded.heals;

insert into public.hr_catalogue_meta (only_row, digest, generated_at)
  values (true, ${q(DIGEST)}, now())
  on conflict (only_row) do update set digest = excluded.digest, generated_at = excluded.generated_at;

-- ── RLS + grants. Catalogues are world-readable (the client renders from the
--    same data anyway) and writable by NOBODY but the migration owner.
--    S6/S7: revoke BEFORE grant, and revoke the privileges Supabase's default
--    ACL hands to anon/authenticated/service_role on every new table —
--    including TRUNCATE, which the previous revision missed (S14).
do $$
declare t text;
begin
  foreach t in array array['hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                           'hr_crops','hr_activities','hr_catalogue_meta',
                           'hr_start_kit','hr_start_skill_xp','hr_start_inventory',
                           'hr_start_equipment','hr_runes','hr_skill_curve'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists %I on public.%I', t || ' readable', t);
    execute format('create policy %I on public.%I for select using (true)', t || ' readable', t);
  end loop;
end $$;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_bad int; v_n int;
begin
  select count(*) into v_n from public.hr_items;
  if v_n <> ${items.length} then raise exception 'hr_items has % rows, generator emitted ${items.length}', v_n; end if;
  select count(*) into v_n from public.hr_items where not tradeable;
  if v_n <> ${items.filter((r) => !r.tradeable).length} then
    raise exception 'untradeable count is %, generator emitted ${items.filter((r) => !r.tradeable).length}', v_n;
  end if;
  select count(*) into v_n from public.hr_activities;
  if v_n <> ${activities.length} then raise exception 'hr_activities has % rows, expected ${activities.length}', v_n; end if;

  -- MONSTER HP. The count is asserted for the same reason auto_eatable's is: a
  -- re-apply against a database that created hr_activities before the column
  -- existed must not leave the combat rows on a null ceiling. A null ceiling
  -- does not fail — it makes hr_apply's carried-fight clamp ADMIT ANYTHING,
  -- which is the "assertion that asserts nothing" family in SQL form.
  select count(*) into v_n from public.hr_activities where kind = 'combat' and max_hp is not null;
  if v_n <> ${activities.filter((r) => r.kind === 'combat').length} then
    raise exception 'combat activities with a max_hp: %, generator emitted ${activities.filter((r) => r.kind === 'combat').length} — '
      'hr_apply''s carried-fight clamp would be vacuous for the rest', v_n;
  end if;
  -- ...and the converse, so a non-combat row can never acquire a fight ceiling
  -- that would let a carried fight name a tree.
  select count(*) into v_bad from public.hr_activities where kind <> 'combat' and max_hp is not null;
  if v_bad > 0 then raise exception '% non-combat activities carry a max_hp', v_bad; end if;

  -- BOSS FLAG. Asserted the same way as max_hp/auto_eatable: a re-apply against
  -- a database that created hr_activities before is_boss existed must not leave
  -- every combat row FALSE, which would silently zero the renown bossKill term.
  select count(*) into v_n from public.hr_activities where kind = 'combat' and is_boss;
  if v_n <> ${activities.filter((r) => r.kind === 'combat' && r.is_boss).length} then
    raise exception 'combat activities flagged is_boss: %, generator emitted ${activities.filter((r) => r.kind === 'combat' && r.is_boss).length} — '
      'the renown bossKill term would be mis-scored', v_n;
  end if;
  -- ...and no non-combat row may be a boss (a gather node flagged boss would
  -- mint renown from ev:kill_monster keys that never collide with it anyway,
  -- but the invariant is asserted so the column stays meaningful).
  select count(*) into v_bad from public.hr_activities where kind <> 'combat' and is_boss;
  if v_bad > 0 then raise exception '% non-combat activities are flagged is_boss', v_bad; end if;

  -- AUTO-EATABLE. The count is asserted, so a re-apply against a database that
  -- created hr_items before the column existed cannot leave every row on the
  -- FALSE default and quietly make every food ineligible.
  select count(*) into v_n from public.hr_items where auto_eatable;
  if v_n <> ${items.filter((r) => r.auto_eatable).length} then
    raise exception 'auto_eatable count is %, generator emitted ${items.filter((r) => r.auto_eatable).length}', v_n;
  end if;
  -- ...and the rule itself, restated as a constraint on the data rather than
  -- as a comment: nothing without a heal may ever be auto-eaten. (The converse
  -- is deliberately NOT asserted — a foodClass:buff Feast heals and must
  -- still be ineligible, which is the whole reason this is a generated column
  -- and not "heals > 0".)
  select count(*) into v_bad from public.hr_items
   where auto_eatable and coalesce(heals, 0) <= 0;
  if v_bad > 0 then raise exception '% auto-eatable items heal nothing', v_bad; end if;

  -- Every item-slot pair must name a real equip slot, or hr_apply's slot check
  -- would accept an equip into a slot the player does not have.
  select count(*) into v_bad from public.hr_item_slots s
   where not exists (select 1 from public.hr_equip_slots e where e.equip_slot = s.equip_slot);
  if v_bad > 0 then raise exception '% item-slot pairs name an unknown equip slot', v_bad; end if;

  -- Every requirement names a real skill, or the hero's Level (${q(LEVEL_REQ)}).
  select count(*) into v_bad from public.hr_items
   where req_skill is not null and req_skill <> ${q(LEVEL_REQ)}
     and not exists (select 1 from public.hr_skills k where k.skill_id = req_skill);
  if v_bad > 0 then raise exception '% items require an unknown skill', v_bad; end if;

  -- GEAR IS WORN BY LEVEL (Tyler 2026-10-24: "I think all gear should just be hero level"; "Supplies/runes stick to
  -- skill level"). Every row that fits an equip slot other than the ammo slot names the hero's Level, and no other row
  -- does: hr_apply's equip gate (hr_item_requirement_unmet, 2027-01-14-gear-by-level.sql) reads ${q(LEVEL_REQ)} as
  -- player_state.level_xp, so a skill here would gate a caster's armor on Defense again.
  select count(*) into v_bad from public.hr_items i
   where exists (select 1 from public.hr_item_slots s where s.item_id = i.item_id and s.equip_slot <> 'ammo')
     and i.req_skill is distinct from ${q(LEVEL_REQ)};
  if v_bad > 0 then raise exception '% equipment row(s) are not worn by the hero''s Level', v_bad; end if;
  select count(*) into v_bad from public.hr_items i
   where i.req_skill = ${q(LEVEL_REQ)}
     and not exists (select 1 from public.hr_item_slots s where s.item_id = i.item_id and s.equip_slot <> 'ammo');
  if v_bad > 0 then raise exception '% non-equipment row(s) name the hero''s Level (a supply keeps its skill)', v_bad; end if;
  select count(*) into v_n from public.hr_items where req_skill = ${q(LEVEL_REQ)};
  if v_n <> ${items.filter((r) => r.req_skill === LEVEL_REQ).length} then
    raise exception 'hr_items holds % Level-gated rows, the generator emitted ${items.filter((r) => r.req_skill === LEVEL_REQ).length}', v_n;
  end if;

  -- No client write policy may exist on a catalogue table.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                       'hr_crops','hr_activities','hr_catalogue_meta',
                       'hr_start_kit','hr_start_skill_xp','hr_start_inventory',
                       'hr_start_equipment','hr_runes','hr_skill_curve')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on catalogue tables', v_bad; end if;

  -- ... and no client role may hold a write privilege on one either.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                        'hr_crops','hr_activities','hr_catalogue_meta',
                        'hr_start_kit','hr_start_skill_xp','hr_start_inventory',
                        'hr_start_equipment','hr_runes','hr_skill_curve')
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on catalogue tables', v_bad; end if;

  -- ── THE STARTING KIT (b338) ────────────────────────────────────────────
  -- The generator already validated all of this in JS. It is re-asserted here
  -- against the DATABASE because the two checks do not share an input: the JS
  -- check reads src/data, this one reads the rows that actually landed, and a
  -- kit that validated at generation time but did not INSERT is exactly the
  -- always-null-probe failure this repo has been bitten by nine times.
  if (select count(*) from public.hr_start_kit) <> 1 then
    raise exception 'hr_start_kit must hold exactly one row, has %',
      (select count(*) from public.hr_start_kit);
  end if;

  select count(*) into v_bad from public.hr_start_inventory s
   where not exists (select 1 from public.hr_items i where i.item_id = s.item_id);
  if v_bad > 0 then raise exception '% starting inventory items are not in hr_items', v_bad; end if;

  select count(*) into v_bad from public.hr_start_equipment e
   where not exists (select 1 from public.hr_equip_slots q where q.equip_slot = e.equip_slot)
      or not exists (select 1 from public.hr_item_slots p
                      where p.item_id = e.item_id and p.equip_slot = e.equip_slot);
  if v_bad > 0 then raise exception '% starting equipment rows name an illegal item/slot pair', v_bad; end if;

  select count(*) into v_bad from public.hr_start_skill_xp s
   where not exists (select 1 from public.hr_skills k where k.skill_id = s.skill_id);
  if v_bad > 0 then raise exception '% starting skill grants name an unknown skill', v_bad; end if;

  -- The starting HP is a Level-1, unarmoured character's full health (the
  -- generator asserts it against src/core/vitals.js); max HP itself is never
  -- stored (CORE_MODEL.md §3), so there is no second number to agree with.
  if (select hp from public.hr_start_kit) <> ${n(startKit.hp)} then
    raise exception 'hr_start_kit.hp is %, the generator emitted ${n(startKit.hp)}', (select hp from public.hr_start_kit);
  end if;
  -- THE UNCAPPED SKILL CURVE (src/core/xp.js, CORE_MODEL.md §2), whole and strictly rising.
  if (select count(*) from public.hr_skill_curve) <> ${skillCurve.length}
     or exists (select 1 from public.hr_skill_curve a join public.hr_skill_curve b on b.level = a.level + 1 where b.xp <= a.xp)
     or (select xp from public.hr_skill_curve where level = 1) <> 0 then
    raise exception 'hr_skill_curve is not the ${skillCurve.length}-row rising curve src/core/xp.js walks';
  end if;

  -- The Hearth Token bond is IAP-only (the Final Directive). A CHECK already
  -- pins it; this asserts the CHECK is the one that shipped.
  if (select hearth_tokens from public.hr_start_kit) <> 0 then
    raise exception 'hr_start_kit grants Hearth Tokens — the bond is IAP-only and must never be minted';
  end if;

  -- RUNES. Count asserted like every other catalogue, so a re-apply that
  -- created hr_runes before it was seeded cannot leave the enchant block
  -- answering unknown_item for every real rune. Every row's element is pinned
  -- by the table CHECK, so no separate vocabulary assertion is needed here.
  select count(*) into v_n from public.hr_runes;
  if v_n <> ${runes.length} then raise exception 'hr_runes has % rows, generator emitted ${runes.length}', v_n; end if;

  -- NO GRANT SOURCE NAMES A DELETED ITEM (Security R2, 2026-10-15). A hunt
  -- kill bound's drop, a dungeon loot row or a Quartermaster offer naming an id
  -- hr_items no longer holds fails with unknown_item; it is refused here
  -- instead. (The quest rewards and the login cycle were cut with the
  -- old-client rewards, 2026-10-22.) hr_hunt_vendor_value is NOT read here: the
  -- hunt-sessions catalogue refills it AFTER this file (it needs this file's new
  -- items first) and its own §4 asserts every vendor value names an hr_items row,
  -- so an item this file deletes (the Fox Companion, 2026-10-22) leaves the
  -- vendor table in that same pair. hr_unlock_offers is refilled AFTER this file
  -- and asserts the same of its own rows in its own §4 (tools/gen-unlock-offers.mjs).
  select count(*) into v_bad from (
    select k as id from public.hr_hunt_kill_bounds b, jsonb_object_keys(coalesce(b.drops, '{}'::jsonb)) k
    union all
    select item_id from public.hr_dungeon_loot
    union all
    select item_id from public.hr_qm_offers
  ) src where not exists (select 1 from public.hr_items i where i.item_id = src.id);
  if v_bad > 0 then raise exception '% grant-source row(s) name an item missing from hr_items', v_bad; end if;

  -- EVERY ARMOUR PIECE HAS A WEIGHT (2026-10-21). hr_vitals_of counts worn armour by
  -- armour_weight, so an armour row in an armour slot with none counts as bare skin
  -- (iron plate gave less max HP than bronze). tests/catalogue-coherence.mjs C8 is
  -- the source-side guard; this is the landed-rows half.
  select count(*) into v_bad from public.hr_items i
   where i.kind = 'armor' and i.armour_weight is null
     and exists (select 1 from public.hr_item_slots p
                  where p.item_id = i.item_id and p.equip_slot in (${ARMOUR_SLOTS.map(q).join(', ')}));
  if v_bad > 0 then raise exception '% armour row(s) in an armour slot carry no armour_weight', v_bad; end if;

  -- THE FINITE-PERENNIAL LIMIT (2026-10-26): every regrowing crop carries src/core/farm.js REGROW_LIMITS, never 0
  -- (the server's "no limit": the full replaces before this one dropped it and tomatoes regrew forever).
  select count(*) into v_bad from public.hr_crops where regrows and regrow_limit <= 0;
  if v_bad > 0 then raise exception '% regrowing crop(s) carry no finite regrow_limit', v_bad; end if;
  select count(*) into v_bad from public.hr_crops c
    full join (values ${crops.map((r) => `(${q(r.crop_id)}, ${n(r.regrow_limit)})`).join(', ')}) v(crop_id, lim) using (crop_id)
   where c.regrow_limit is distinct from v.lim;
  if v_bad > 0 then raise exception '% crop(s) land a regrow_limit the generator did not emit', v_bad; end if;

  raise notice 'CATALOGUES OK — % items, % activities, % runes, digest ${DIGEST}',
    (select count(*) from public.hr_items), (select count(*) from public.hr_activities),
    (select count(*) from public.hr_runes);
end $$;
${witherProbe()}`;

/* ONE VINE PLAYED TO ITS WITHER (2026-10-26, CLAUDE.md §4): the regrowing crop with the smallest limit is harvested
   through the real hr_farm_harvest as a probe player: it grows back `limit` times, withers on harvest limit+1 and the
   plot is empty. Every probe row is rolled back. */
function witherProbe() {
  /* the smallest limit, then the least XP (the probe hero's day budget must not refuse a harvest) */
  const vine = crops.filter((r) => r.regrows)
    .sort((a, b2) => a.regrow_limit - b2.regrow_limit || a.xp * a.yield_max - b2.xp * b2.yield_max || (a.crop_id < b2.crop_id ? -1 : 1))[0];
  if (!vine) return '';
  return `
-- ── A regrowing plot withers after regrow_limit + 1 harvests (executed, rolled back) ──
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000127c001';
  v jsonb; i int;
begin
  if to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)') is null or to_regclass('public.account_farm_plots') is null then
    raise exception 'the wither probe needs hr_farm_harvest and account_farm_plots (2026-12-14-shared-farm.sql)'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'catalogue wither probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'wither probe: hr_create_character(0) refused: %', v; end if;
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      values (v_u, 0, ${q(vine.crop_id)}, now() - interval '2000 hours', '{}', 0, 0);
    for i in 1 .. ${vine.regrow_limit + 1} loop
      update public.account_farm_plots set planted_at = now() - interval '2000 hours' where user_id = v_u and plot_idx = 0;
      v := public.hr_farm_harvest(0, 0, gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'wither probe: harvest % of ${vine.crop_id} answered %', i, v; end if;
      if (i <= ${vine.regrow_limit}) <> ((v->>'regrew') = 'true') or (i > ${vine.regrow_limit}) <> ((v->>'withered') = 'true') then
        raise exception 'wither probe: harvest % of ${vine.regrow_limit + 1} answered % (it must regrow ${vine.regrow_limit} times, then wither)', i, v; end if;
    end loop;
    if exists (select 1 from public.account_farm_plots where user_id = v_u) then
      raise exception 'wither probe: the plot is not empty after the wither'; end if;
    raise exception using errcode = 'HR8A7', message = 'wither probe complete - rolling back';
  exception when sqlstate 'HR8A7' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_farm_plots where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'wither probe LEAKED a probe row'; end if;
  raise notice 'wither probe: ${vine.crop_id} regrows ${vine.regrow_limit} times, then withers and clears the plot';
end $$;
`;
}

// ── 4b. Emit the ITEM → BUFF catalogue (its own migration file) ───────────
const BUFF_DIGEST = createHash('sha256').update(JSON.stringify(itemBuffs)).digest('hex');
const sqlItemBuffs = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_item_buffs, THE ITEM → BUFF CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-catalogues.mjs from src/data/items.js + the
--   src/core/buffs.js BUFFS_DEF vocabulary. Any hand edit is reverted by the
--   next generation and FAILS \`node tools/gen-catalogues.mjs --check\`, which is
--   a preflight in tests/run-sql-tests.mjs and tests/run-smoke.mjs.
--
--   catalogue digest: ${BUFF_DIGEST}
--   rows: ${itemBuffs.length} buff foods across ${BUFF_TYPES.length} types (${BUFF_TYPES.join(', ')})
--
-- WHAT THIS IS FOR. hr_apply's \`buff_apply\` delta key carries ONE field — the
-- ITEM ID — and resolves the effect HERE, under the character lock, from the
-- server's own row. Nothing about a buff is representable in the delta: not the
-- type, not the magnitude, not the duration, and above all not the expiry, which
-- is stamped from now() + duration_ms. A client that names an item with no row
-- is refused \`bad_buff_item\`.
--
-- WHY A TABLE AND NOT A LITERAL. The same reason as every other catalogue in
-- this schema: a hand-typed item→buff list in PL/pgSQL is the data double-copy
-- this repo has already been burned by, and the first balance change would make
-- the tooltip and the engine disagree with nobody able to see it.
--
-- APPLY ORDER: 2026-08-11-catalogue.generated.sql (hr_items) → THIS FILE →
--              2026-09-13-consumable-buffs.sql (which FAILS CLOSED without it).
--
-- SAFE TO RE-RUN. Rows are replaced wholesale in one statement pair, so a
-- DELETED buff food really disappears — an upsert-only generator leaves a ghost
-- row behind, and a ghost is a hole in the allowlist this table exists to be.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is missing — apply 2026-08-11-catalogue.generated.sql first';
  end if;
end $$;

create table if not exists public.hr_item_buffs (
  item_id     text primary key,
  type        text    not null,
  -- numeric, not int: a magnitude is a PERCENT for most types and a FLAT count
  -- for farm_yield/defense (src/core/buffs.js BUFFS_DEF isFlat), and a designer
  -- authoring 2.5% must not be silently truncated to 2 by the catalogue.
  magnitude   numeric not null check (magnitude > 0),
  duration_ms bigint  not null check (duration_ms > 0)
);

-- Wholesale replace. One transaction with the insert below it.
delete from public.hr_item_buffs;

insert into public.hr_item_buffs (item_id, type, magnitude, duration_ms) values
${valuesBlock(itemBuffs, (r) => `  (${q(r.item_id)},${q(r.type)},${n(r.magnitude)},${n(r.duration_ms)})`)};

-- ── RLS + grants. World-readable (the client renders the same data out of
--    src/data/items.js anyway), writable by NOBODY but the migration owner.
--    Revoke BEFORE grant, and revoke what Supabase's default ACL hands
--    anon/authenticated/service_role on a new table — TRUNCATE included.
do $$
begin
  alter table public.hr_item_buffs enable row level security;
  revoke all on public.hr_item_buffs from public, anon, authenticated, service_role;
  grant select on public.hr_item_buffs to anon, authenticated, service_role;
  drop policy if exists "hr_item_buffs readable" on public.hr_item_buffs;
  create policy "hr_item_buffs readable" on public.hr_item_buffs for select using (true);
end $$;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from public.hr_item_buffs;
  if v_n <> ${itemBuffs.length} then
    raise exception 'hr_item_buffs has % rows, generator emitted ${itemBuffs.length}', v_n;
  end if;

  -- CATALOGUE PARITY. Every buff food must be a real item, or hr_apply would
  -- hold a buff for an id the bag can never contain and the eat path could never
  -- reach — a control that reads as present in review and fires for nobody.
  select count(*) into v_bad from public.hr_item_buffs b
   where not exists (select 1 from public.hr_items i where i.item_id = b.item_id);
  if v_bad > 0 then raise exception '% buff foods are not in hr_items', v_bad; end if;

  -- THE VOCABULARY, asserted against the rows that actually landed. The
  -- generator already refused an unknown type in JS; this is the DATABASE's own
  -- check, and the two do not share an input (JS reads src/core/buffs.js, this
  -- reads the table), which is the only way a row that validated at generation
  -- time but did not INSERT is caught.
  select count(*) into v_bad from public.hr_item_buffs
   where type <> all (array[${BUFF_TYPES.map((t) => q(t)).join(',')}]::text[]);
  if v_bad > 0 then
    raise exception '% buff rows carry a type the engine cannot pay', v_bad;
  end if;

  -- NO ROW MAY EXCEED THE SERVER'S EXPIRY CAP. hr_apply clamps \`until\` to
  -- now() + ${BUFF_MAX_MS} ms; a longer duration could never be delivered in full and would
  -- make the tooltip a promise the server refuses to hold.
  select count(*) into v_bad from public.hr_item_buffs where duration_ms > ${BUFF_MAX_MS};
  if v_bad > 0 then
    raise exception '% buff foods last longer than the server''s ${BUFF_MAX_MS} ms expiry cap', v_bad;
  end if;

  -- No client write policy, and no client write grant.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'hr_item_buffs'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on hr_item_buffs', v_bad; end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_item_buffs'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on hr_item_buffs', v_bad; end if;

  raise notice 'hr_item_buffs OK — % rows, digest ${BUFF_DIGEST}', v_n;
end $$;
`;

// ── 4c. Emit the ROOM RUNG → PERK catalogue (its own migration file) ──────
// src/data/perks.js is ITSELF generated (tools/gen-perks.mjs, from the ROOMS
// table in src/legacy.js, `--check`ed in the smoke preflight), so this is the
// THIRD link of one chain and not a second authoring site: legacy.js ROOMS →
// perks.js ROOM_PERKS → hr_room_perks. A designer still changes exactly one
// number in exactly one place, and two guards fail if any link goes stale.
const { ROOM_PERKS, ROOM_PERK_KEYS } = await imp('src/data/perks.js');
/* The server's fuse on how far a perk stack may stretch a buff, mirrored from
   hr_apply's c_buff_scale_max (2026-09-13-buff-cellar-scale.sql): scale =
   1 + bonus, capped at 2×. A rung that SOLD more duration than the server will
   ever pay is a tooltip lie, so it fails generation rather than shipping. */
const BUFF_SCALE_MAX_BONUS = 1;
const roomPerkKeys = new Set(ROOM_PERK_KEYS);
const roomPerks = [];
for (const room of Object.keys(ROOM_PERKS).sort()) {
  const rungs = ROOM_PERKS[room];
  if (!Array.isArray(rungs) || rungs.length === 0) {
    die(`room "${room}" has no rungs in src/data/perks.js — an empty ladder reads as "this room pays `
      + 'nothing" to every server-side consumer');
  }
  rungs.forEach((rung, i) => {
    for (const [k, v] of Object.entries(rung)) {
      if (!roomPerkKeys.has(k)) {
        die(`room "${room}" rung ${i + 1} carries perk key ${JSON.stringify(k)}, which is not in `
          + 'ROOM_PERK_KEYS — the generated file and its own vocabulary disagree');
      }
      if (!Number.isFinite(v)) {
        die(`room "${room}" rung ${i + 1} key "${k}" is ${JSON.stringify(v)} — a perk magnitude must be `
          + 'a finite number');
      }
    }
    // Canonical key order, so the emitted jsonb is byte-stable across runs.
    const canonicalRung = {};
    for (const k of Object.keys(rung).sort()) canonicalRung[k] = rung[k];
    roomPerks.push({ room_id: room, level: i + 1, perks: canonicalRung });
  });
}
// THE ONE KEY POSTGRES ACTUALLY READS TODAY, checked as such. The table carries
// every room because a filtered copy is the shape that goes stale in silence,
// but buffDuration is the only key hr_apply prices, so it is the only one whose
// absence or excess is fatal here.
const cellarRungs = roomPerks.filter((r) => r.room_id === 'cellar');
if (cellarRungs.length === 0) {
  die('no `cellar` room in src/data/perks.js — hr_apply would price every buff at scale 1.0 while the '
    + 'shop sold five rungs of "Food buffs last longer". A catalogue that is silently empty is the '
    + 'always-null probe this repo has been bitten by nine times.');
}
let prevBuffDuration = -Infinity;
for (const r of cellarRungs) {
  const bd = r.perks.buffDuration;
  if (!Number.isFinite(bd) || bd <= 0) {
    die(`cellar rung ${r.level} has buffDuration ${JSON.stringify(bd)} — every Cellar rung must sell a `
      + 'positive amount of duration, or a player pays gold for a rung the server prices at nothing');
  }
  if (bd > BUFF_SCALE_MAX_BONUS) {
    die(`cellar rung ${r.level} sells buffDuration ${bd}, above the server's ${BUFF_SCALE_MAX_BONUS} `
      + 'cap — hr_apply would clamp it and the shop line would promise minutes the server refuses to '
      + `hold. Author it at or below ${BUFF_SCALE_MAX_BONUS}, or raise c_buff_scale_max first.`);
  }
  if (bd < prevBuffDuration) {
    die(`cellar rung ${r.level} sells LESS duration (${bd}) than the rung below it (${prevBuffDuration}) `
      + '— a rung payload REPLACES the one below it, so upgrading would take the bonus away');
  }
  prevBuffDuration = bd;
}
const ROOM_PERK_DIGEST = createHash('sha256').update(JSON.stringify(roomPerks)).digest('hex');
const ROOM_IDS = [...new Set(roomPerks.map((r) => r.room_id))];
const sqlRoomPerks = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_room_perks, THE ROOM RUNG → PERK CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-catalogues.mjs from src/data/perks.js (hand-authored
--   since the old client was deleted, 2026-10-17). Any hand edit here is
--   reverted by the next generation and
--   FAILS \`node tools/gen-catalogues.mjs --check\`, a preflight in
--   tests/run-sql-tests.mjs and tests/run-smoke.mjs.
--
--   catalogue digest: ${ROOM_PERK_DIGEST}
--   rows: ${roomPerks.length} rung payloads across ${ROOM_IDS.length} rooms (${ROOM_IDS.join(', ')})
--
-- WHAT THIS IS FOR. hr_farm_plot_cap reads the GARDEN's \`farmPlots\` (the extra
-- farm beds every character of the account may plant; 2026-12-01-garden-beds.sql).
-- hr_apply prices the CELLAR's \`buffDuration\` when it stamps a
-- buff segment's \`until\` (2026-09-13-buff-cellar-scale.sql): the scale is read
-- HERE, under the character lock, from the server's own row — never from the
-- delta, which has no key for it and is refused \`bad_buff_shape\` if it invents
-- one. The other rooms are carried because a FILTERED copy of a balance table is
-- the shape that goes stale in silence; the JS engines still read
-- src/data/perks.js directly, and both sides therefore move together.
--
-- A RUNG PAYLOAD REPLACES THE RUNG BELOW IT (getBonus reads \`levels[lv-1]\`,
-- never a sum), so each row restates every key it keeps. Read it that way.
--
-- APPLY ORDER: anywhere after supabase/schema.sql; BEFORE
--              2026-09-13-buff-cellar-scale.sql, which FAILS CLOSED without it.
--
-- SAFE TO RE-RUN. Rows are replaced wholesale in one statement pair, so a
-- DELETED room really disappears — an upsert-only generator leaves a ghost row
-- behind, and a ghost rung is a bonus nobody can see being paid.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_room_perks (
  room_id text  not null,
  level   int   not null check (level >= 1),
  -- The rung's whole payload, verbatim. jsonb rather than a key/value row per
  -- perk: the payload IS the unit of replacement in the game's own model, and
  -- splitting it here would let a reader reassemble a rung that never existed.
  perks   jsonb not null check (jsonb_typeof(perks) = 'object'),
  primary key (room_id, level)
);

-- Wholesale replace. One transaction with the insert below it.
delete from public.hr_room_perks;

insert into public.hr_room_perks (room_id, level, perks) values
${valuesBlock(roomPerks, (r) => `  ('${r.room_id}',${r.level},'${JSON.stringify(r.perks).replace(/'/g, "''")}'::jsonb)`)};

-- ── RLS + grants. World-readable (the client renders the same ladder out of
--    src/data/perks.js anyway), writable by NOBODY but the migration owner.
--    Revoke BEFORE grant, and revoke what Supabase's default ACL hands
--    anon/authenticated/service_role on a new table — TRUNCATE included.
do $$
begin
  alter table public.hr_room_perks enable row level security;
  revoke all on public.hr_room_perks from public, anon, authenticated, service_role;
  grant select on public.hr_room_perks to anon, authenticated, service_role;
  drop policy if exists "hr_room_perks readable" on public.hr_room_perks;
  create policy "hr_room_perks readable" on public.hr_room_perks for select using (true);
end $$;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_n int; v_bad int; v_top numeric;
begin
  select count(*) into v_n from public.hr_room_perks;
  if v_n <> ${roomPerks.length} then
    raise exception 'hr_room_perks has % rows, generator emitted ${roomPerks.length}', v_n;
  end if;

  -- THE LADDER IS CONTIGUOUS FROM 1. hr_apply clamps a stored rung to what
  -- exists here; a hole would make an owned rung read as the rung below it.
  select count(*) into v_bad from (
    select room_id, count(*) as n, min(level) as lo, max(level) as hi
      from public.hr_room_perks group by room_id) t
   where t.lo <> 1 or t.hi <> t.n;
  if v_bad > 0 then raise exception '% rooms have a non-contiguous rung ladder', v_bad; end if;

  -- THE CELLAR, the one room a SQL body prices. Its absence is not a smaller
  -- bonus, it is a perk the player bought and the server never pays.
  select count(*) into v_bad from public.hr_room_perks
   where room_id = 'cellar' and (perks->>'buffDuration') is null;
  if v_bad > 0 then
    raise exception '% cellar rungs carry no buffDuration — the shop sells duration the server '
                    'would price at nothing', v_bad;
  end if;
  select max((perks->>'buffDuration')::numeric) into v_top
    from public.hr_room_perks where room_id = 'cellar';
  if v_top is null then raise exception 'no cellar rungs in hr_room_perks'; end if;
  if v_top > ${BUFF_SCALE_MAX_BONUS} then
    raise exception 'the top cellar rung sells % duration, above the server cap of ${BUFF_SCALE_MAX_BONUS} '
                    '— hr_apply would clamp it and the shop line would be a lie', v_top;
  end if;

  -- THE GARDEN, the second room a SQL body reads (hr_farm_plot_cap): every rung
  -- sells a whole, positive number of beds, never fewer than the rung below.
  select count(*) into v_bad from public.hr_room_perks g
   where g.room_id = 'garden'
     and (jsonb_typeof(g.perks->'farmPlots') is distinct from 'number'
          or (g.perks->>'farmPlots')::numeric <> floor((g.perks->>'farmPlots')::numeric)
          or (g.perks->>'farmPlots')::numeric < 1
          or (g.perks->>'farmPlots')::numeric < coalesce((select (b.perks->>'farmPlots')::numeric
               from public.hr_room_perks b where b.room_id = 'garden' and b.level = g.level - 1), 0));
  if v_bad > 0 then raise exception '% garden rungs sell no whole, rising number of farm beds', v_bad; end if;

  -- A HOME NEVER GRANTS XP OR A RESOURCE ADVANTAGE (Master Design Reference §9,
  -- 2026-10-14; Security C3): no rung may carry an XP, yield or Rested key.
  select count(*) into v_bad from public.hr_room_perks
   where perks ?| array['allXP','combatXP','farmYield','restedXp','rested','restedCap']
      or exists (select 1 from jsonb_object_keys(perks) k where k like 'yield\\_%');
  if v_bad > 0 then
    raise exception '% room rung(s) grant XP, yield or Rested — a home never does (§9)', v_bad;
  end if;

  -- No client write policy, and no client write grant.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'hr_room_perks'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on hr_room_perks', v_bad; end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_room_perks'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on hr_room_perks', v_bad; end if;

  raise notice 'hr_room_perks OK — % rows, digest ${ROOM_PERK_DIGEST}', v_n;
end $$;
`;

/* THE FOURTH GENERATED FILE (lane c-tutorial-facts, 2026-10-25): WHAT ONE ACTION OF EACH BENCH CONSUMES.
   A hunt's automatic end resumes the hero's last town activity (hr_hunt_apply_member step 7); a bench
   resumed with nothing to work on read "working on Cook Shrimp" with 0 Raw Shrimp and held a play-cap seat
   with the browser closed (no artisan settler clears it). The server knew no recipe input, so the rule
   "resume a bench only with the inputs for one action" needs them: derived HERE through the engine's own
   recipeInputs (src/core/artisan.js, the function missingInput reads), first id wins as indexArtisanRecipes
   does, so the server's check and the bench's stop cannot disagree. A function, not a table: one constant,
   read by one SQL body, no rows to census. */
const { recipeInputs } = await imp('src/core/artisan.js');
const { ARTISAN_RECIPES: BENCH_RECIPES } = await imp('src/data/recipes.js');
/* INNER FLAME (lane b-inner-flame, 2026-10-27): 2027-01-20 is APPLIED history; the fuel_<item> rows (the bury_* rows retire). */
const OUT_BENCH_INPUTS = join(ROOT, 'supabase', 'migrations', '2027-01-31-bench-inputs.generated.sql');
const benchInputs = {};
{
  const known = new Set(itemIds);
  const seen = new Set();
  for (const skill of Object.keys(BENCH_RECIPES)) {
    for (const r of BENCH_RECIPES[skill] || []) {
      if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      const inp = recipeInputs(r);
      const keys = Object.keys(inp).sort();
      if (!keys.length) continue;
      const row = {};
      for (const k of keys) {
        if (!known.has(k)) die(`bench ${r.id} consumes ${JSON.stringify(k)}, which is no hr_items row`);
        if (!Number.isInteger(inp[k]) || inp[k] < 1) die(`bench ${r.id} consumes ${JSON.stringify(inp[k])} of ${k}, not a whole positive count`);
        row[k] = inp[k];
      }
      benchInputs[r.id] = row;
    }
  }
}
const BENCH_IDS = Object.keys(benchInputs).sort();
const benchJson = JSON.stringify(Object.fromEntries(BENCH_IDS.map((id) => [id, benchInputs[id]])));
const BENCH_DIGEST = createHash('sha256').update(benchJson).digest('hex');
if (BENCH_IDS.length < 1) die('no bench consumes anything: the bench-inputs catalogue would be empty');
const sqlBenchInputs = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_bench_inputs(), WHAT ONE ACTION OF EACH BENCH CONSUMES  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-catalogues.mjs from src/data/recipes.js through the
--   engine's own recipeInputs (src/core/artisan.js). Any hand edit here is
--   reverted by the next generation and FAILS \`node tools/gen-catalogues.mjs --check\`,
--   a preflight in tests/run-sql-tests.mjs and tests/run-smoke.mjs.
--
--   catalogue digest: ${BENCH_DIGEST}
--   benches: ${BENCH_IDS.length} (every artisan recipe that consumes an input)
--
-- WHAT THIS IS FOR. hr_resume_has_inputs (2027-01-20-tutorial-facts.sql): a hunt's
-- automatic end resumes a bench only when the hero holds the inputs for one action,
-- the same test the engine's missingInput makes before every action. Server-only.
--
-- APPLY ORDER: after 2027-01-19-play-cap.sql; BEFORE 2027-01-20-tutorial-facts.sql,
--              whose §0 refuses without it. SAFE TO RE-RUN (create or replace).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.hr_bench_inputs()
returns jsonb language sql immutable parallel safe set search_path = public, pg_catalog as $$
  select '${benchJson.replace(/'/g, "''")}'::jsonb
$$;

-- ── Grants: the server's alone (revoke before nothing is granted) ─────────
do $$
begin
  revoke all on function public.hr_bench_inputs() from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_bench_inputs() from hr_engine;
  end if;
end $$;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_n int; v_bad text;
begin
  select count(*) into v_n from jsonb_object_keys(public.hr_bench_inputs());
  if v_n <> ${BENCH_IDS.length} then
    raise exception 'hr_bench_inputs() holds % benches, the generator emitted ${BENCH_IDS.length}', v_n;
  end if;
  -- Every bench is a real artisan activity, every input a real item, every count whole and positive.
  select string_agg(b.key, ', ') into v_bad from jsonb_each(public.hr_bench_inputs()) b
   where not exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key);
  if v_bad is not null then raise exception 'hr_bench_inputs() names benches hr_activities does not hold: %', v_bad; end if;
  select string_agg(b.key || '.' || i.key, ', ') into v_bad
    from jsonb_each(public.hr_bench_inputs()) b, jsonb_each(b.value) i
   where not exists (select 1 from public.hr_items t where t.item_id = i.key)
      or jsonb_typeof(i.value) <> 'number' or (i.value #>> '{}')::numeric < 1
      or (i.value #>> '{}')::numeric <> floor((i.value #>> '{}')::numeric);
  if v_bad is not null then raise exception 'hr_bench_inputs() has bad inputs: %', v_bad; end if;
  if has_function_privilege('anon', 'public.hr_bench_inputs()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_bench_inputs()', 'execute') then
    raise exception 'hr_bench_inputs() is executable by a client role';
  end if;
  raise notice 'hr_bench_inputs OK — % benches, digest ${BENCH_DIGEST}', v_n;
end $$;
`;

/* THE FIFTH GENERATED FILE (lane c-town-defaults, 2026-10-25): WHAT A HERO'S UNSET BAR OPTIONS ARE. Out of a hunt (and
   before a hunt's first settle) hr_hunt_settings_view read target, stance, distance and chase as null: the catalogue has
   no default for them (hr_hunt_set_options), because the ENGINE picks them at spawn from the hero's role and its party
   (src/core/hunt-spawn.js heroSetup over src/core/hunt/roles.js defaultSettings). Tyler 2026-10-25: the whole bar is
   configurable in town, so the server must show that pick. Derived HERE by calling the engine's own defaultSettings, per
   role, for the only three party situations it distinguishes (alone; a party with a Melee seat; a party without one),
   and every party composition up to one past PARTY.maxSize is replayed through it: if the engine ever reads more than
   those two facts, this generator dies instead of letting the server and the engine disagree. A function, not a table. */
const { defaultSettings } = await imp('src/core/hunt/roles.js');
const { HUNT_ROLES: ROLE_ROWS } = await imp('src/data/hunt-roles.js');
const { PARTY } = await imp('src/data/party.js');
const OUT_ROLE_DEFAULTS = join(ROOT, 'supabase', 'migrations', '2027-01-25-hunt-role-defaults.generated.sql');
const ROLE_IDS = Object.keys(ROLE_ROWS).sort();
const optsOf = (d) => ({ chase: d.chase, distance: d.dist, stance: d.stance, target_mode: d.tmode });
/* THE SERVER'S RULE (hr_hunt_role_default, 2027-01-25-town-defaults.sql), stated once more here so it can be proved. */
const variantOf = (party) => (party.length <= 1 ? 'solo' : party.some((r) => ROLE_ROWS[r].melee) ? 'party' : 'party_nomelee');
const roleDefaults = {};
for (const role of ROLE_IDS) {
  const row = { melee: ROLE_ROWS[role].melee === true, solo: optsOf(defaultSettings(role, [role])) };
  const melee = ROLE_IDS.find((r) => ROLE_ROWS[r].melee);
  const other = ROLE_IDS.find((r) => !ROLE_ROWS[r].melee);
  if (!melee || !other) die('role defaults: the roles need a Melee and a non-Melee one');
  row.party = optsOf(defaultSettings(role, [role, melee]));
  if (!row.melee) row.party_nomelee = optsOf(defaultSettings(role, [role, other]));
  roleDefaults[role] = row;
}
{
  /* every multiset of the other seats, 0 .. PARTY.maxSize of them (one past the cap: "maybe 5 later") */
  const seats = (n, from) => (n === 0 ? [[]] : ROLE_IDS.slice(from).flatMap((r, i) => seats(n - 1, from + i).map((s) => [r, ...s])));
  for (const role of ROLE_IDS) {
    for (let n = 0; n <= PARTY.maxSize; n++) {
      for (const others of seats(n, 0)) {
        const party = [role, ...others];
        const want = JSON.stringify(optsOf(defaultSettings(role, party)));
        const got = JSON.stringify(roleDefaults[role][variantOf(party)]);
        if (want !== got) die(`role defaults: defaultSettings(${role}, [${party}]) = ${want}, the server's ${variantOf(party)} row says ${got}: `
          + 'the engine reads more than "alone / a Melee seat"; change hr_hunt_role_default with it');
      }
    }
  }
}
const roleDefaultsJson = JSON.stringify(Object.fromEntries(ROLE_IDS.map((r) => [r, roleDefaults[r]])));
const ROLE_DEFAULTS_DIGEST = createHash('sha256').update(roleDefaultsJson).digest('hex');
const sqlRoleDefaults = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_hunt_role_defaults(), A HERO'S BAR OPTIONS IT NEVER SET  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-catalogues.mjs by calling the engine's own defaultSettings
--   (src/core/hunt/roles.js, read by src/core/hunt-spawn.js heroSetup) for every role of
--   src/data/hunt-roles.js. Any hand edit here is reverted by the next generation and FAILS
--   \`node tools/gen-catalogues.mjs --check\`, a preflight in tests/run-sql-tests.mjs and
--   tests/run-smoke.mjs. The generator also replays every party up to ${PARTY.maxSize + 1} heroes
--   through the engine and dies if the three situations below stop covering it.
--
--   catalogue digest: ${ROLE_DEFAULTS_DIGEST}
--   roles: ${ROLE_IDS.length} (${ROLE_IDS.join(', ')})
--
-- WHAT THIS IS FOR. hr_hunt_settings_view (2027-01-25-town-defaults.sql): target_mode,
-- stance, distance and chase the hero never set read the value the engine would play,
-- in town and before a hunt's first settle: { role: { melee, solo, party, party_nomelee? } }
-- (solo = alone; party = a party with a Melee seat; party_nomelee = one without), read
-- through hr_hunt_role_default. Server-only.
--
-- APPLY ORDER: after 2027-01-20-tutorial-facts.sql (and any 01-22..01-24 file); BEFORE
--              2027-01-25-town-defaults.sql, whose §0 refuses without it. SAFE TO RE-RUN (create or replace).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.hr_hunt_role_defaults()
returns jsonb language sql immutable parallel safe set search_path = public, pg_catalog as $$
  select '${roleDefaultsJson.replace(/'/g, "''")}'::jsonb
$$;

-- ── Grants: the server's alone (revoke before nothing is granted) ─────────
do $$
begin
  revoke all on function public.hr_hunt_role_defaults() from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_hunt_role_defaults() from hr_engine;
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_hunt_role_defaults() from hr_tick;
  end if;
end $$;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_n int; v_bad text;
begin
  select count(*) into v_n from jsonb_object_keys(public.hr_hunt_role_defaults());
  if v_n <> ${ROLE_IDS.length} then
    raise exception 'hr_hunt_role_defaults() holds % roles, the generator emitted ${ROLE_IDS.length}', v_n;
  end if;
  -- Every situation names a real target mode, a stance of the option catalogue, a distance inside its limits, a boolean chase.
  select string_agg(r.key || '.' || v.key, ', ') into v_bad
    from jsonb_each(public.hr_hunt_role_defaults()) r, jsonb_each(r.value) v
   where v.key <> 'melee'
     and (not exists (select 1 from public.hr_hunt_target_modes t where t.mode = v.value->>'target_mode')
          or not exists (select 1 from public.hr_hunt_set_options o where o.opt = 'stance' and o.vals @> array[v.value->>'stance'])
          or jsonb_typeof(v.value->'distance') <> 'number'
          or (v.value->>'distance')::int not between public.hr_hunt_limit('distance_min') and public.hr_hunt_limit('distance_max')
          or jsonb_typeof(v.value->'chase') <> 'boolean');
  if v_bad is not null then raise exception 'hr_hunt_role_defaults() has bad situations: %', v_bad; end if;
  if has_function_privilege('anon', 'public.hr_hunt_role_defaults()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_role_defaults()', 'execute') then
    raise exception 'hr_hunt_role_defaults() is executable by a client role';
  end if;
  raise notice 'hr_hunt_role_defaults OK — % roles, digest ${ROLE_DEFAULTS_DIGEST}', v_n;
end $$;
`;

// ── 5. Write or check ────────────────────────────────────────────────────
const CHECK = process.argv.includes('--check');
if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) {
    console.error(`catalogue drift: ${OUT} is missing. Run: node tools/gen-catalogues.mjs`);
    process.exit(1);
  }
  // Compare on NORMALISED line endings. git's autocrlf checks this file out as
  // CRLF on Windows while the generator writes LF, so a byte-exact comparison
  // reported "catalogue drift" on every Windows clone even when the content was
  // identical — verified 2026-08-11, the reported drift was 100% line endings.
  // A guard that cries wolf on a whole platform is a guard people learn to skip,
  // which is worse than not having it. Content is what this check is about.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(sql)) {
    console.error('catalogue drift: src/data/*.js no longer matches the generated SQL.');
    console.error(`  expected digest ${DIGEST}`);
    console.error('  Run: node tools/gen-catalogues.mjs   (and re-apply the migration)');
    process.exit(1);
  }
  // THE SECOND FILE, checked with the SAME rigour and reported SEPARATELY. A
  // `--check` that covered only the first file would go green on a stale
  // hr_item_buffs, which is the drift this table exists to make impossible.
  const existingBuffs = await readFile(OUT_ITEM_BUFFS, 'utf8').catch(() => null);
  if (existingBuffs === null) {
    console.error(`item-buff catalogue drift: ${OUT_ITEM_BUFFS} is missing. `
      + 'Run: node tools/gen-catalogues.mjs');
    process.exit(1);
  }
  if (norm(existingBuffs) !== norm(sqlItemBuffs)) {
    console.error('item-buff catalogue drift: the `buff` blocks in src/data/items.js no longer match '
      + 'the generated SQL.');
    console.error(`  expected digest ${BUFF_DIGEST}`);
    console.error('  Run: node tools/gen-catalogues.mjs   (and re-apply the migration)');
    process.exit(1);
  }
  // THE THIRD FILE, same rigour, reported SEPARATELY — a `--check` that went
  // green on a stale hr_room_perks would let the Cellar's shop line and the
  // duration hr_apply actually pays drift apart with nothing watching.
  const existingRoomPerks = await readFile(OUT_ROOM_PERKS, 'utf8').catch(() => null);
  if (existingRoomPerks === null) {
    console.error(`room-perk catalogue drift: ${OUT_ROOM_PERKS} is missing. `
      + 'Run: node tools/gen-catalogues.mjs');
    process.exit(1);
  }
  if (norm(existingRoomPerks) !== norm(sqlRoomPerks)) {
    console.error('room-perk catalogue drift: src/data/perks.js no longer matches the generated SQL.');
    console.error(`  expected digest ${ROOM_PERK_DIGEST}`);
    console.error('  Run: node tools/gen-catalogues.mjs   (and re-apply the migration)');
    process.exit(1);
  }
  // THE FOURTH FILE, same rigour, reported SEPARATELY: a stale bench list would resume a bench the engine stops at once.
  const existingBench = await readFile(OUT_BENCH_INPUTS, 'utf8').catch(() => null);
  if (existingBench === null || norm(existingBench) !== norm(sqlBenchInputs)) {
    console.error(`bench-input catalogue drift: ${OUT_BENCH_INPUTS} ${existingBench === null ? 'is missing' : 'no longer matches src/data/recipes.js'}.`);
    console.error(`  expected digest ${BENCH_DIGEST}`);
    console.error('  Run: node tools/gen-catalogues.mjs   (and re-apply the migration)');
    process.exit(1);
  }
  // THE FIFTH FILE, same rigour, reported SEPARATELY: a stale role-default row would show a bar setting the engine does not play.
  const existingRoleDefaults = await readFile(OUT_ROLE_DEFAULTS, 'utf8').catch(() => null);
  if (existingRoleDefaults === null || norm(existingRoleDefaults) !== norm(sqlRoleDefaults)) {
    console.error(`role-default catalogue drift: ${OUT_ROLE_DEFAULTS} ${existingRoleDefaults === null ? 'is missing' : 'no longer matches src/core/hunt/roles.js defaultSettings'}.`);
    console.error(`  expected digest ${ROLE_DEFAULTS_DIGEST}`);
    console.error('  Run: node tools/gen-catalogues.mjs   (and re-apply the migration)');
    process.exit(1);
  }
  console.log(`catalogue in sync (${items.length} items, digest ${DIGEST.slice(0, 12)}…)`);
  console.log(`bench inputs in sync (${BENCH_IDS.length} benches, digest ${BENCH_DIGEST.slice(0, 12)}…)`);
  console.log(`role defaults in sync (${ROLE_IDS.length} roles, digest ${ROLE_DEFAULTS_DIGEST.slice(0, 12)}…)`);
  console.log(`item buffs in sync (${itemBuffs.length} foods, digest ${BUFF_DIGEST.slice(0, 12)}…)`);
  console.log(`room perks in sync (${roomPerks.length} rungs, digest ${ROOM_PERK_DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, sql, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${items.length} items · ${itemSlots.length} slot pairs · ${activities.length} activities`);
  console.log(`  digest ${DIGEST}`);
  await writeFile(OUT_ITEM_BUFFS, sqlItemBuffs, 'utf8');
  console.log(`wrote ${OUT_ITEM_BUFFS}`);
  console.log(`  ${itemBuffs.length} buff foods · types ${BUFF_TYPES.join(', ')}`);
  console.log(`  digest ${BUFF_DIGEST}`);
  await writeFile(OUT_ROOM_PERKS, sqlRoomPerks, 'utf8');
  console.log(`wrote ${OUT_ROOM_PERKS}`);
  console.log(`  ${roomPerks.length} rung payloads · rooms ${ROOM_IDS.join(', ')}`);
  console.log(`  digest ${ROOM_PERK_DIGEST}`);
  await writeFile(OUT_BENCH_INPUTS, sqlBenchInputs, 'utf8');
  console.log(`wrote ${OUT_BENCH_INPUTS}`);
  console.log(`  ${BENCH_IDS.length} benches · digest ${BENCH_DIGEST}`);
  await writeFile(OUT_ROLE_DEFAULTS, sqlRoleDefaults, 'utf8');
  console.log(`wrote ${OUT_ROLE_DEFAULTS}`);
  console.log(`  ${ROLE_IDS.length} roles · digest ${ROLE_DEFAULTS_DIGEST}`);
}
