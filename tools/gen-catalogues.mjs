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
const OUT = join(ROOT, 'supabase', 'migrations', '2026-08-11-catalogue.generated.sql');
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
const OUT_ROOM_PERKS = join(ROOT, 'supabase', 'migrations',
  '2026-09-13-room-perks-catalogue.generated.sql');

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// ── 1. Read the single source of truth ───────────────────────────────────
const { ITEMS } = await imp('src/data/items.js');
const { SKILLS_DEF } = await imp('src/data/skills.js');
const { CROPS, EQUIP_SLOTS } = await imp('src/data/gathering.js');
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

const skills = Object.keys(SKILLS_DEF).sort().map((id) => ({
  skill_id: id, name: String(SKILLS_DEF[id].name ?? id), cat: String(SKILLS_DEF[id].cat ?? ''),
}));

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
// slot, or an hp that disagrees with the hitpoints level FAILS GENERATION.
const { levelFromXp } = await imp('src/core/xp.js');

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

// THE IDENTITY THAT MATTERS MOST, asserted rather than commented: the client
// derives playerMaxHp from the hitpoints LEVEL (legacy.js :898). If maxHp and
// levelFromXp(START_SKILL_XP.hitpoints) ever disagree, the very first client
// refresh silently rewrites the server's max_hp — the client re-authoring a
// server value, which is the one thing this whole program exists to stop.
{
  const hpLevel = levelFromXp(START_SKILL_XP.hitpoints || 0);
  if (hpLevel !== START_CURRENCY.maxHp) {
    die(`START_CURRENCY.maxHp is ${START_CURRENCY.maxHp} but hitpoints XP `
      + `${START_SKILL_XP.hitpoints || 0} is level ${hpLevel} — the client derives `
      + 'maxHp from the hitpoints level, so these must agree');
  }
  if (START_CURRENCY.hp > START_CURRENCY.maxHp) die('START_CURRENCY.hp exceeds maxHp');
  for (const k of ['gold', 'gems', 'hearthTokens', 'hp', 'maxHp', 'bankCap', 'farmPlots']) {
    if (!Number.isInteger(START_CURRENCY[k]) || START_CURRENCY[k] < 0) {
      die(`START_CURRENCY.${k} must be a non-negative integer`);
    }
  }
  // No PvE path may mint the bond (the Final Directive). A non-zero starting
  // grant is exactly such a path, and it would be free and repeatable per slot.
  if (START_CURRENCY.hearthTokens !== 0) die('START_CURRENCY.hearthTokens must be 0 — the Hearth Token is IAP-only');
}

const startKit = {
  gold: START_CURRENCY.gold, gems: START_CURRENCY.gems,
  hearth_tokens: START_CURRENCY.hearthTokens,
  hp: START_CURRENCY.hp, max_hp: START_CURRENCY.maxHp,
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
const RUNE_ELEMENTS = ['ember', 'frost', 'poison'];
const runes = itemIds
  .filter((id) => (ITEMS[id] || {}).tag === 'rune')
  .map((id) => {
    const el = ITEMS[id].element;
    if (!RUNE_ELEMENTS.includes(el)) {
      die(`rune "${id}" has element ${JSON.stringify(el)} — every tag:'rune' item must carry `
        + `element:'ember'|'frost'|'poison', or hr_apply cannot resolve it`);
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
  regrows    boolean not null default false
);
-- Existing databases (created by a pre-2026-08-20 generator) get the columns
-- from 2026-08-20-server-farming.sql; the ALTERs there and these column defs
-- must agree. A fresh replay lands the full shape here.
alter table public.hr_crops add column if not exists yield_min int     not null default 1;
alter table public.hr_crops add column if not exists yield_max int     not null default 1;
alter table public.hr_crops add column if not exists xp        int     not null default 0;
alter table public.hr_crops add column if not exists regrows   boolean not null default false;

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
  max_hp        int    not null check (max_hp > 0),
  bank_cap      int    not null check (bank_cap between 1 and 100000),
  farm_plots    int    not null check (farm_plots between 0 and 64)
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

insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable) values
${valuesBlock(items, (r) => `  (${q(r.item_id)},${q(r.name)},${b(r.tradeable)},${q(r.kind)},${n(r.value)},${q(r.req_skill)},${n(r.req_lv)},${n(r.heals)},${b(r.auto_eatable)})`)};

insert into public.hr_item_slots (item_id, equip_slot) values
${valuesBlock(itemSlots, (r) => `  (${q(r.item_id)},${q(r.equip_slot)})`)};

insert into public.hr_equip_slots (equip_slot, ord) values
${valuesBlock(equipSlots, (r) => `  (${q(r.equip_slot)},${n(r.ord)})`)};

insert into public.hr_skills (skill_id, name, cat) values
${valuesBlock(skills, (r) => `  (${q(r.skill_id)},${q(r.name)},${q(r.cat)})`)};

insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv, yield_min, yield_max, xp, regrows) values
${valuesBlock(crops, (r) => `  (${q(r.crop_id)},${q(r.seed_item)},${q(r.prod_item)},${n(r.base_hours)},${n(r.req_lv)},${n(r.yield_min)},${n(r.yield_max)},${n(r.xp)},${b(r.regrows)})`)};

insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss) values
${valuesBlock(activities, (r) => `  (${q(r.kind)},${q(r.activity_id)},${q(r.req_skill)},${n(r.req_lv)},${n(r.max_hp)},${b(r.is_boss)})`)};

-- The starting kit. hr_start_kit is a ONE-ROW table (only_row), so it is an
-- upsert rather than a delete+insert: hr_create_character() reads it, and a
-- momentary gap where the row does not exist would be a window in which a new
-- character could be created with no kit at all.
insert into public.hr_start_kit (only_row, gold, gems, hearth_tokens, hp, max_hp, bank_cap, farm_plots)
  values (true, ${n(startKit.gold)}, ${n(startKit.gems)}, ${n(startKit.hearth_tokens)},
          ${n(startKit.hp)}, ${n(startKit.max_hp)}, ${n(startKit.bank_cap)}, ${n(startKit.farm_plots)})
  on conflict (only_row) do update set
    gold = excluded.gold, gems = excluded.gems, hearth_tokens = excluded.hearth_tokens,
    hp = excluded.hp, max_hp = excluded.max_hp, bank_cap = excluded.bank_cap,
    farm_plots = excluded.farm_plots;

insert into public.hr_start_skill_xp (skill_id, xp) values
${valuesBlock(startSkillXp, (r) => `  (${q(r.skill_id)},${n(r.xp)})`)};

insert into public.hr_start_inventory (item_id, qty) values
${valuesBlock(startInventory, (r) => `  (${q(r.item_id)},${n(r.qty)})`)};

insert into public.hr_start_equipment (equip_slot, item_id) values
${valuesBlock(startEquipment, (r) => `  (${q(r.equip_slot)},${q(r.item_id)})`)};

${runes.length ? `insert into public.hr_runes (rune_id, element) values
${valuesBlock(runes, (r) => `  (${q(r.rune_id)},${q(r.element)})`)};` : '-- (no tag:\'rune\' items authored yet — hr_runes seeded empty)'}

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
                           'hr_start_equipment','hr_runes'] loop
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

  -- Every gear requirement must name a real skill.
  select count(*) into v_bad from public.hr_items
   where req_skill is not null
     and not exists (select 1 from public.hr_skills k where k.skill_id = req_skill);
  if v_bad > 0 then raise exception '% items require an unknown skill', v_bad; end if;

  -- No client write policy may exist on a catalogue table.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                       'hr_crops','hr_activities','hr_catalogue_meta',
                       'hr_start_kit','hr_start_skill_xp','hr_start_inventory',
                       'hr_start_equipment','hr_runes')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on catalogue tables', v_bad; end if;

  -- ... and no client role may hold a write privilege on one either.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                        'hr_crops','hr_activities','hr_catalogue_meta',
                        'hr_start_kit','hr_start_skill_xp','hr_start_inventory',
                        'hr_start_equipment','hr_runes')
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

  -- max_hp must equal the level the starting hitpoints XP buys, evaluated by
  -- the SERVER's own curve (hr_xp_table, materialised by player-state.sql).
  -- The generator asserts the same identity using src/core/xp.js, so this line
  -- additionally proves the two curves agree — which is the property that lets
  -- the client keep deriving playerMaxHp for RENDERING without re-authoring it.
  select public.hr_level_from_xp(coalesce(
           (select xp from public.hr_start_skill_xp where skill_id = 'hitpoints'), 0))
    into v_n;
  if v_n <> (select max_hp from public.hr_start_kit) then
    raise exception 'hr_start_kit.max_hp is % but the starting hitpoints XP is level % on hr_xp_table',
      (select max_hp from public.hr_start_kit), v_n;
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

  raise notice 'CATALOGUES OK — % items, % activities, % runes, digest ${DIGEST}',
    (select count(*) from public.hr_items), (select count(*) from public.hr_activities),
    (select count(*) from public.hr_runes);
end $$;
`;

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
--   Generated by tools/gen-catalogues.mjs from src/data/perks.js, which is
--   itself generated by tools/gen-perks.mjs from \`const ROOMS={…}\` in
--   src/legacy.js. Any hand edit here is reverted by the next generation and
--   FAILS \`node tools/gen-catalogues.mjs --check\`, a preflight in
--   tests/run-sql-tests.mjs and tests/run-smoke.mjs.
--
--   catalogue digest: ${ROOM_PERK_DIGEST}
--   rows: ${roomPerks.length} rung payloads across ${ROOM_IDS.length} rooms (${ROOM_IDS.join(', ')})
--
-- WHAT THIS IS FOR. hr_apply prices the CELLAR's \`buffDuration\` when it stamps a
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
  console.log(`catalogue in sync (${items.length} items, digest ${DIGEST.slice(0, 12)}…)`);
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
}
