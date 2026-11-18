#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-chests.mjs — GENERATE THE HEARTH CHEST'S SERVER CATALOGUE (lane/c-tower-chest; Tyler 2026-11-14; the Burning Tower board §5,
//   the coherence pass's C4).
//
// src/data/chests.js holds the chest's open key table, the key families and their caps, what each key always holds, the weapon chance, the
// Hearth's warmth and the stokes. Postgres must know them to do what only it may: mint a landing's key under its family's held limit
// (hr_tower_key_mint), count a family's opens against its week (hr_chest_open), work out a key's chance again inside the open
// (hr_chest_chance_ppm), roll it on its own dice, take the stokes' Cinders and pay the haul. Emitted as hr_chests, hr_chest_key_families,
// hr_chest_keys, hr_chest_stokes, hr_chest_luck, hr_chest_families, hr_chest_weapons (each key's weapon a family: src/data/tower-weapons.js) and
// hr_chest_weapon_families (every weapon item's family, the "type you have equipped" the open reads from the hero's own equipment row).
// Read by supabase/migrations/2027-04-27-tower-chest.sql.
//
//   Regenerate:  node tools/gen-chests.mjs
//   Verify:      node tools/gen-chests.mjs --check     (exit 1 on drift: a hand edit, a data change, a new tempering ladder)
//   Selftest:    node tools/gen-chests.mjs --selftest  (every refusal bites)
//
// A WHOLE FILE (tools/pack/whole.mjs): the weapon map reads every weapon item, the base and the folded ground packs.
// REFUSES (throws, nothing written): the table's problems (chests.js validateChests); a key's item, salts, food or weapon that is no item;
// a weapon a family names that is not of that family; a family row whose own weapons read another family (weaponFamilyOf's rule broke).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { wholeViewOrRerun } from './pack/whole.mjs';
import { CHESTS, CHEST_KEYS, HEARTH_CHEST_KEYS, CHEST_LUCK, CHEST_OUTFITS, CINDERS, KEY_FAMILIES, TOWER_KEY_FAMILY, WEAPON_FAMILY_KEYS, weaponFamilyOf, keySalts, validateChests,
  validateChestOutfits, ARMOR_KINDS } from '../src/data/chests.js';
import { ARMOUR_WEIGHT } from '../src/data/core-model.js';
import { CATACOMB_TIERS } from '../src/data/catacomb-armor.js';
import { TOWER_WEAPONS } from '../src/data/tower-weapons.js';
import { WEAPON_FAMILIES } from '../src/data/gear-tiers.js';
import { TOWER_RULES } from '../src/data/tower.js';
import { ITEMS } from '../src/data/items.js';
import { OUTFIT_ROWS } from '../src/data/outfits.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a changed row moves OUT_NAME to a forward file, like every generated catalogue. */
/* 2027-04-27-tower-chest-catalogue applied with v0.2.135 (history). lane/c-catacombs (2026-11-18) moved it here: the Catacomb key family, its eight
   keys (each from a wing's vault doors, with its slot lean) and the armor table (hr_chest_armor). */
export const OUT_NAME = '2027-05-06-catacombs-chest-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/** The catalogue's rows, or a throw naming every problem. Pure. */
export function catalogueRows({ keys = HEARTH_CHEST_KEYS, luck = CHEST_LUCK, items = ITEMS, families = WEAPON_FAMILIES, keyFamilies = KEY_FAMILIES, tower = TOWER_WEAPONS,
  outfits = CHEST_OUTFITS, outfitRows = OUTFIT_ROWS } = {}) {
  const problems = validateChests(keys, luck, TOWER_RULES.landingEvery, undefined, keyFamilies, tower).concat(validateChestOutfits(outfits, keys));
  /* a super-rare outfit: an outfit row owned only through THIS bundle (src/data/outfits.js `bundle`), a tradeable item row of book value */
  for (const o of outfits) {
    const row = outfitRows[o.outfit];
    if (!row) problems.push('outfit ' + o.outfit + ': no src/data/outfits.js row');
    else if (row.bundle !== o.item || row.premium) problems.push('outfit ' + o.outfit + ': its outfits.js row is owned through ' + (row.premium ? 'premium' : row.bundle) + ', not ' + o.item);
    const it = Object.hasOwn(items, o.item) ? items[o.item] : null;
    if (!it) problems.push('outfit ' + o.outfit + ': its bundle ' + o.item + ' is no item');
    else if (it.bop || !(it.v > 0) || it.outfit !== o.outfit) problems.push('outfit ' + o.outfit + ': its bundle ' + o.item + ' is not a tradeable item of book value naming it');
  }
  const isItem = (id) => Object.hasOwn(items, id);
  if (!isItem(CINDERS)) problems.push('the Cinders (' + CINDERS + ') are no item');
  for (const k of keys) {
    if (!isItem(k.item)) problems.push(k.id + ': its key ' + k.item + ' is no item');
    const salts = keySalts(k);
    if (salts && !isItem(salts)) problems.push(k.id + ': its salts ' + salts + ' are no item');
    if (!isItem(k.food)) problems.push(k.id + ': its food ' + k.food + ' is no item');
    for (const [fam, id] of Object.entries(k.weapons || {})) {
      if (!isItem(id)) problems.push(k.id + ': its ' + fam + ' weapon ' + id + ' is no item');
      else if (weaponFamilyOf(items[id]) !== fam) problems.push(k.id + ': its ' + fam + ' weapon ' + id + ' is a ' + weaponFamilyOf(items[id]));
    }
    /* an armor key's pieces: each an item of its slot and weight (core-model.js ARMOUR_WEIGHT of its armourClass) at the key's tier */
    for (const [sw, id] of Object.entries(k.armor || {})) {
      const [slot, weight] = sw.split(':');
      const it = isItem(id) ? items[id] : null;
      if (!it) problems.push(k.id + ': its ' + sw + ' piece ' + id + ' is no item');
      else if (it.slot !== slot || ARMOUR_WEIGHT[it.armourClass] !== weight) problems.push(k.id + ': its ' + sw + ' piece ' + id + ' is a ' + it.slot + ':' + ARMOUR_WEIGHT[it.armourClass]);
      else if (it.tier !== CATACOMB_TIERS[it.catacombTier] || k.weaponTier !== it.tier || it.bop) problems.push(k.id + ': its ' + sw + ' piece ' + id + ' is not a tradeable piece of the key\'s tier');
    }
  }
  /* the family rule against the families' own rows: every rung of a family reads that family */
  for (const f of families) for (const id of f.ids) if (id && isItem(id) && weaponFamilyOf(items[id]) !== f.key) problems.push(`${id} is a ${f.key} rung and reads ${weaponFamilyOf(items[id])}`);
  if (problems.length) throw new Error('gen-chests: ' + problems.join('; '));
  const weaponFamilies = Object.keys(items).sort().map((id) => ({ item: id, family: weaponFamilyOf(items[id]) })).filter((r) => r.family);
  const weapons = keys.flatMap((k) => Object.entries(k.weapons || {}).map(([family, item]) => ({ key: k.id, family, item })));
  const armor = keys.flatMap((k) => Object.entries(k.armor || {}).map(([sw, item]) => ({ key: k.id, slot: sw.split(':')[0], weight: sw.split(':')[1], item })))
    .sort((a, b) => ((a.key + ':' + a.slot + ':' + a.weight) < (b.key + ':' + b.slot + ':' + b.weight) ? -1 : 1));
  /* every key finds every outfit row, at its own chance (the board: "a super rare outfit that can drop from any chest"); like the weapons,
     the loot is the key's: one chest whose loot depends on the key (Tyler 2026-11-14) */
  const outfitRolls = outfits.flatMap((o) => keys.map((k) => ({ key: k.id, outfit: o.outfit, item: o.item, pm: o.pm[k.id] })));
  return { keys: keys.map((k) => ({ ...k, salts: keySalts(k) })), keyFamilies: Object.values(keyFamilies), luck, weaponFamilies, weapons, armor, outfitRolls };
}

const lit = (s) => (s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");

export function build(input) {
  const r = catalogueRows(input);
  const L = r.luck;
  const keyRows = r.keys.map((k) => `  (${lit(k.id)}, ${lit(k.family)}, ${lit(k.item)}, ${lit(k.name)}, ${k.from}, ${k.weaponPm}, ${k.weaponTier}, ${k.skillPlus}, ${k.cinders}, ${lit(k.salts)}, ${k.saltsQty}, ${lit(k.food)}, ${k.foodQty}, ${lit(k.ground)}, ${lit(k.gear)}, ${k.helmetPm === null ? 'null' : k.helmetPm})`).join(',\n');
  const aRows = r.armor.map((a) => `  (${lit(a.key)}, ${lit(a.slot)}, ${lit(a.weight)}, ${lit(a.item)})`).join(',\n');
  const aSum = r.armor.map((a) => [a.key, a.slot, a.weight, a.item].join(':')).join('|');
  const stokeRows = L.stokes.map((s, i) => `  (${i + 1}, ${s.pm}, ${s.keys})`).join(',\n');
  const famRows = WEAPON_FAMILY_KEYS.map((f, i) => `  (${lit(f)}, ${i + 1})`).join(',\n');
  const wfRows = r.weaponFamilies.map((w) => `  (${lit(w.item)}, ${lit(w.family)})`).join(',\n');
  const wRows = r.weapons.map((w) => `  (${lit(w.key)}, ${lit(w.family)}, ${lit(w.item)})`).join(',\n');
  const kfRows = r.keyFamilies.map((f) => `  (${lit(f.id)}, ${lit(f.name)}, ${f.opensPerWeek}, ${f.heldMax})`).join(',\n');
  const kfSum = [...r.keyFamilies].sort((a, b) => (a.id < b.id ? -1 : 1)).map((f) => [f.id, f.opensPerWeek, f.heldMax].join(':')).join('|');
  const chestRows = Object.values(CHESTS).map((c) => `  (${lit(c.id)}, ${lit(c.name)})`).join(',\n');
  const sum = [...r.keys].sort((a, b) => (a.id < b.id ? -1 : 1)).map((k) => [k.id, k.family, k.item, k.from, k.weaponPm, k.weaponTier, k.skillPlus, k.cinders, k.salts, k.saltsQty, k.food, k.foodQty, k.ground, k.gear, k.helmetPm === null ? '' : k.helmetPm].join(':')).join('|');
  const oRows = r.outfitRolls.map((o) => `  (${lit(o.key)}, ${lit(o.outfit)}, ${lit(o.item)}, ${o.pm})`).join(',\n');
  const oSum = r.outfitRolls.map((o) => [o.key, o.outfit, o.item, o.pm].join(':')).sort().join('|');
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_NAME} — THE HEARTH CHEST: ITS OPEN KEY TABLE, WHAT EACH KEY ALWAYS HOLDS, ITS WEAPON CHANCE, THE HEARTH'S WARMTH AND THE STOKES.
-- Generated by tools/gen-chests.mjs from src/data/chests.js (the salts each key holds derived from src/data/temper.js TEMPER_MATERIALS; the
--   weapon families from src/data/gear-tiers.js and every weapon item's own fields). Any hand edit FAILS \`node tools/gen-chests.mjs --check\`.
-- STATUS: STAGED, NOT APPLIED (lane/c-catacombs, backend-architect, 2026-11-18; Tyler 2026-11-16: the Unmarked Catacombs' keys open the SAME chest,
--   "Waterlogged Key" and "Bone Key" by Bronze / Silver / Gold / Platinum, a KEY FAMILY with its own six a week and held limit). A FORWARD FILE:
--   2027-04-27-tower-chest-catalogue (lane/c-tower-chest, applied with v0.2.135) whole, plus the catacomb family, its eight keys (each from its
--   wing's vault doors: hr_chest_keys.ground; its slot lean: helmet_pm; gear 'armor') and the armor table (hr_chest_armor: each Catacomb key's
--   piece a slot and weight, the twelve that ship now). The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
--   ORDER: after 2027-05-06-catacombs-tower-catalogue.generated.sql (every key's ground is a run ground there: §4 checks it), right before
--   2027-05-06-catacombs.sql, which reads every table. No function body. Until that file the live hr_chest_open reads hr_chest_weapons as before
--   and opens a Catacomb key only after its feature_off and chest_not_ready (no weapons) refusals, so nothing opens one early.
-- hr_chests (one row today); hr_chest_key_families (${r.keyFamilies.length}: a key family's caps, every key of the family sharing them: the keys one hero may
--   open a UTC week and the held limit past which a new key of it does not drop); hr_chest_keys (${r.keys.length} rows: each in a family; the open
--   table, a Tower landing's key is the highest Tower row at or under it); hr_chest_stokes (${L.stokes.length}: a stoke count's multiplier and its price
--   in keys' worth of Cinders); hr_chest_luck (one row: the warmth step and cap, the own-family weight, the per-call clamp);
--   hr_chest_families (the ${WEAPON_FAMILY_KEYS.length} weapon families, the "types"); hr_chest_weapons (each key's
--   weapon a family: ${r.weapons.length} rows; a key short of its ${WEAPON_FAMILY_KEYS.length} is refused chest_not_ready); hr_chest_weapon_families (${r.weaponFamilies.length}
--   weapon items and their family); hr_chest_outfits (${r.outfitRolls.length}: the super-rare outfits, each outfit's bundle item and its chance on every
--   key in permille, src/data/chests.js CHEST_OUTFITS; lane/c-sweeps-coat-drop, the Sweep's Coat). All rewritten whole: no player row
--   points at any of them (the key, Cinders and bundle items are hr_items rows).
-- hr_chest_armor (${r.armor.length}: each Catacomb key's piece a slot and weight, the server's heavy / medium / light; a key short of its ${ARMOR_KINDS.length} is
--   refused chest_not_ready, the Gold and Platinum keys until their pieces ship).
-- RLS on, no policy, no client grant: only SECURITY DEFINER functions read them. ON THE EA SECURITY LIST with the Tower and the descent.
-- REVERSIBLE: after 2027-05-06-catacombs.sql's reversal, delete the catacomb rows, drop hr_chest_armor and the three new key columns (put the
--   (key_family, from_landing) key back); the nine tables after 2027-04-27-tower-chest.sql's.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_chests (
  chest_id text primary key check (chest_id ~ '^[a-z0-9_]{1,40}$'),
  name     text not null
);
create table if not exists public.hr_chest_key_families (
  key_family     text primary key check (key_family ~ '^[a-z0-9_]{1,40}$'),
  name           text not null,
  opens_per_week int  not null check (opens_per_week between 1 and 1000),
  held_max       int  not null,
  constraint hr_chest_key_families_held check (held_max >= opens_per_week)
);
create table if not exists public.hr_chest_keys (
  key_id       text primary key check (key_id ~ '^[a-z0-9_]{1,40}$'),
  key_family   text not null,
  item_id      text not null unique,
  name         text not null,
  from_landing int  not null check (from_landing > 0),
  weapon_pm    int  not null check (weapon_pm between 1 and 1000),
  weapon_tier  int  not null check (weapon_tier between 1 and 10),
  skill_plus   int  not null check (skill_plus >= 1),
  cinders      int  not null check (cinders > 0),
  salts_item   text not null,
  salts_qty    int  not null check (salts_qty > 0),
  food_item    text not null,
  food_qty     int  not null check (food_qty > 0),
  constraint hr_chest_keys_from unique (key_family, from_landing)
);
-- THE CATACOMB KEYS (lane/c-catacombs): a key names the run ground whose doors mint it, what a hit pays and an armor key's slot lean. Two wings'
-- keys of one metal share a door, so the open table is unique by ground, not by family; an armor key carries no +skill.
alter table public.hr_chest_keys add column if not exists ground text;
alter table public.hr_chest_keys add column if not exists gear text;
alter table public.hr_chest_keys add column if not exists helmet_pm int;
alter table public.hr_chest_keys drop constraint if exists hr_chest_keys_from;
alter table public.hr_chest_keys drop constraint if exists hr_chest_keys_skill_plus_check;
create table if not exists public.hr_chest_armor (
  key_id  text not null,
  slot    text not null check (slot in ('helmet', 'boots')),
  weight  text not null check (weight in ('heavy', 'medium', 'light')),
  item_id text not null,
  primary key (key_id, slot, weight)
);
create table if not exists public.hr_chest_stokes (
  stokes int primary key check (stokes between 1 and 9),
  pm     int not null check (pm > 1000),
  keys   int not null check (keys > 0)
);
create table if not exists public.hr_chest_luck (
  id             boolean primary key default true check (id),
  warmth_step_pm int not null check (warmth_step_pm >= 0),
  warmth_cap_pm  int not null check (warmth_cap_pm >= 1000),
  own_pm         int not null check (own_pm between 0 and 1000),
  per_call       int not null check (per_call between 1 and 100)
);
create table if not exists public.hr_chest_families (
  family text primary key check (family ~ '^[a-z0-9_]{1,40}$'),
  ord    int  not null unique
);
create table if not exists public.hr_chest_weapons (
  key_id  text not null,
  family  text not null,
  item_id text not null unique,
  primary key (key_id, family)
);
create table if not exists public.hr_chest_weapon_families (
  item_id text primary key,
  family  text not null
);
create table if not exists public.hr_chest_outfits (
  key_id    text not null,
  outfit_id text not null check (outfit_id ~ '^[a-z0-9_]{1,40}$'),
  item_id   text not null check (item_id ~ '^[a-z0-9_]{1,40}$'),
  pm        int  not null check (pm between 1 and 1000),
  primary key (key_id, outfit_id)
);
do $$
declare t text;
begin
  foreach t in array array['hr_chests', 'hr_chest_key_families', 'hr_chest_keys', 'hr_chest_stokes', 'hr_chest_luck', 'hr_chest_families', 'hr_chest_weapons', 'hr_chest_weapon_families', 'hr_chest_outfits', 'hr_chest_armor'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_chest_key_families is '${OUT_NAME}: the key families (src/data/chests.js KEY_FAMILIES, Tyler 2026-11-16): every key of a family shares its caps, opens_per_week keys one hero may use a UTC week (hr_chest_open, from chest_opens) and held_max, the held limit past which a new key of the family does not drop (hr_tower_key_mint). Read by hr_tower_key_mint, hr_chest_open and hr_chest_section.';
comment on table public.hr_chest_keys is '${OUT_NAME}: the Hearth Chest''s open key table (src/data/chests.js CHEST_KEYS): each key in a family (hr_chest_key_families); a Tower landing''s key is the highest Tower row at or under it; what each key always holds; its base weapon chance (permille). Read by hr_tower_key_mint, hr_chest_open and hr_chest_section.';
comment on table public.hr_chest_luck is '${OUT_NAME}: the Hearth''s warmth (a dry key warms the next by warmth_step_pm of its base, up to warmth_cap_pm), the own-family weight and the per-call clamp (src/data/chests.js CHEST_LUCK). One row.';
comment on table public.hr_chest_weapons is '${OUT_NAME}: each key''s tower weapon a family (src/data/chests.js weapons). A key without one for every hr_chest_families row is not ready: hr_chest_open refuses it.';
comment on table public.hr_chest_armor is '${OUT_NAME}: each Catacomb key''s armor piece a slot and weight (src/data/chests.js CATACOMB_KEYS armor, from src/data/catacomb-armor.js). A key without all six is not ready: hr_chest_open refuses it. The slot is the key''s lean (hr_chest_keys.helmet_pm), the weight the opener''s own in that slot own_pm of the time.';
comment on table public.hr_chest_outfits is '${OUT_NAME}: the super-rare outfits (src/data/chests.js CHEST_OUTFITS): each outfit''s bundle item and its chance on every key, permille. hr_chest_open rolls one outfit a key on its own stream, the rows stacked in outfit order (at most one a key, each at its chance). Read by hr_chest_open and hr_chest_section.';

delete from public.hr_chests;
insert into public.hr_chests (chest_id, name) values
${chestRows};
delete from public.hr_chest_weapons;
delete from public.hr_chest_armor;
delete from public.hr_chest_keys;
delete from public.hr_chest_key_families;
insert into public.hr_chest_key_families (key_family, name, opens_per_week, held_max) values
${kfRows};
insert into public.hr_chest_keys (key_id, key_family, item_id, name, from_landing, weapon_pm, weapon_tier, skill_plus, cinders, salts_item, salts_qty, food_item, food_qty,
                                 ground, gear, helmet_pm) values
${keyRows};
alter table public.hr_chest_keys alter column ground set not null;
alter table public.hr_chest_keys alter column gear set not null;
alter table public.hr_chest_keys drop constraint if exists hr_chest_keys_from_ground;
alter table public.hr_chest_keys add constraint hr_chest_keys_from_ground unique (ground, from_landing);
alter table public.hr_chest_keys drop constraint if exists hr_chest_keys_gear;
alter table public.hr_chest_keys add constraint hr_chest_keys_gear check ((gear = 'weapon' and skill_plus >= 1 and helmet_pm is null)
  or (gear = 'armor' and skill_plus = 0 and helmet_pm between 0 and 1000));
${aRows ? `insert into public.hr_chest_armor (key_id, slot, weight, item_id) values\n${aRows};` : '-- (no Catacomb armor ships)'}
delete from public.hr_chest_stokes;
insert into public.hr_chest_stokes (stokes, pm, keys) values
${stokeRows};
insert into public.hr_chest_luck (id, warmth_step_pm, warmth_cap_pm, own_pm, per_call) values
  (true, ${L.warmthStepPm}, ${L.warmthCapPm}, ${L.ownPm}, ${L.perCall})
on conflict (id) do update set warmth_step_pm = excluded.warmth_step_pm, warmth_cap_pm = excluded.warmth_cap_pm, own_pm = excluded.own_pm,
  per_call = excluded.per_call;
delete from public.hr_chest_families;
insert into public.hr_chest_families (family, ord) values
${famRows};
${wRows ? `insert into public.hr_chest_weapons (key_id, family, item_id) values\n${wRows};` : '-- (no tower weapon is built: every key waits on its seven, src/data/chests.js chestShipBlockers)'}
delete from public.hr_chest_weapon_families;
insert into public.hr_chest_weapon_families (item_id, family) values
${wfRows};
delete from public.hr_chest_outfits;
${oRows ? `insert into public.hr_chest_outfits (key_id, outfit_id, item_id, pm) values\n${oRows};` : '-- (no key finds an outfit)'}

-- §4 SELF-CHECK: the data's rows (a digest of every key row and every key family), each key in a family and each family with a key, the
-- Tower's family there, a family's open table rising, every item a row names an hr_items row (the keys and the Cinders bound), every weapon
-- of its own family, and no client can read or write a table.
do $$
declare t text; v_role text; v_sum text;
begin
  select string_agg(concat_ws(':', key_id, key_family, item_id, from_landing, weapon_pm, weapon_tier, skill_plus, cinders, salts_item, salts_qty, food_item, food_qty,
                             ground, gear, coalesce(helmet_pm::text, '')), '|' order by key_id collate "C")
    into v_sum from public.hr_chest_keys;
  if v_sum is distinct from ${lit(sum)} then raise exception 'chest-catalogue §4: hr_chest_keys is not src/data/chests.js: %', v_sum; end if;
  select string_agg(concat_ws(':', key_family, opens_per_week, held_max), '|' order by key_family collate "C") into v_sum from public.hr_chest_key_families;
  if v_sum is distinct from ${lit(kfSum)} then raise exception 'chest-catalogue §4: hr_chest_key_families is not src/data/chests.js: %', v_sum; end if;
  if exists (select 1 from public.hr_chest_keys k where not exists (select 1 from public.hr_chest_key_families f where f.key_family = k.key_family))
     or exists (select 1 from public.hr_chest_key_families f where not exists (select 1 from public.hr_chest_keys k where k.key_family = f.key_family))
     or not exists (select 1 from public.hr_chest_key_families f where f.key_family = ${lit(TOWER_KEY_FAMILY)}) then
    raise exception 'chest-catalogue §4: a key of no family, a family of no key, or no family for the Tower''s landings'; end if;
  if exists (select 1 from public.hr_chest_keys a join public.hr_chest_keys b on b.ground = a.ground and b.from_landing > a.from_landing
              where b.weapon_pm > a.weapon_pm or b.cinders <= a.cinders or b.weapon_tier < a.weapon_tier
                 or (b.gear = 'weapon' and b.skill_plus <= a.skill_plus) or b.gear <> a.gear or b.helmet_pm is distinct from a.helmet_pm) then
    raise exception 'chest-catalogue §4: a higher key is no better than the one under it in its family'; end if;
  if (select count(*) from public.hr_chest_stokes) <> ${L.stokes.length} or (select count(*) from public.hr_chest_luck) <> 1
     or (select count(*) from public.hr_chest_families) <> ${WEAPON_FAMILY_KEYS.length} or (select count(*) from public.hr_chests) <> ${Object.keys(CHESTS).length}
     or (select count(*) from public.hr_chest_weapons) <> ${r.weapons.length} then
    raise exception 'chest-catalogue §4: the stokes, the luck row, the families, the chests or the tower weapons are not the data''s'; end if;
  -- THE CATACOMB KEYS (lane/c-catacombs): each key's ground a run ground minting its family; the armor the data's, each piece of its key's
  -- slot and weight, a tradeable hr_items row; a weapon key no armor and an armor key no weapon
  if exists (select 1 from public.hr_chest_keys k where not exists (select 1 from public.hr_tower_rules r where r.hunt_id = k.ground and r.family = k.key_family)) then
    raise exception 'chest-catalogue §4: a key''s ground is no run ground of its family (apply the run grounds'' catalogue first)'; end if;
  select string_agg(concat_ws(':', key_id, slot, weight, item_id), '|' order by key_id collate "C", slot collate "C", weight collate "C") into v_sum from public.hr_chest_armor;
  if v_sum is distinct from ${aSum ? lit(aSum) : 'null'} then raise exception 'chest-catalogue §4: hr_chest_armor is not src/data/chests.js: %', v_sum; end if;
  if exists (select 1 from public.hr_chest_armor a left join public.hr_chest_keys k on k.key_id = a.key_id where k.gear is distinct from 'armor')
     or exists (select 1 from public.hr_chest_weapons w join public.hr_chest_keys k on k.key_id = w.key_id where k.gear <> 'weapon')
     or exists (select 1 from public.hr_chest_armor a where not exists (select 1 from public.hr_items i join public.hr_item_slots s on s.item_id = i.item_id
                                                                       where i.item_id = a.item_id and i.tradeable and s.equip_slot = a.slot and i.armour_weight = a.weight)) then
    raise exception 'chest-catalogue §4: an armor piece is on a weapon key, a weapon on an armor key, or a piece is no tradeable hr_items row of its slot and weight'; end if;
  if exists (select 1 from public.hr_chest_stokes a join public.hr_chest_stokes b on b.stokes = a.stokes + 1 where b.pm <= a.pm or b.keys <= a.keys) then
    raise exception 'chest-catalogue §4: a stoke buys no more chance for more Cinders than the one before'; end if;
  if exists (select 1 from public.hr_chest_keys k where not exists (select 1 from public.hr_items i where i.item_id = k.item_id and not i.tradeable and i.value = 0))
     or not exists (select 1 from public.hr_items i where i.item_id = ${lit(CINDERS)} and not i.tradeable and i.value = 0) then
    raise exception 'chest-catalogue §4: a key or the Cinders is no bound hr_items row of no value (apply the items catalogue first)'; end if;
  if exists (select 1 from public.hr_chest_keys k where not exists (select 1 from public.hr_items i where i.item_id = k.salts_item)
                                                  or not exists (select 1 from public.hr_items i where i.item_id = k.food_item))
     or exists (select 1 from public.hr_chest_weapons w where not exists (select 1 from public.hr_items i where i.item_id = w.item_id))
     or exists (select 1 from public.hr_chest_weapon_families w where not exists (select 1 from public.hr_items i where i.item_id = w.item_id)) then
    raise exception 'chest-catalogue §4: a salts, food or weapon row names no hr_items row'; end if;
  if exists (select 1 from public.hr_chest_weapons w left join public.hr_chest_weapon_families f on f.item_id = w.item_id
              where f.family is distinct from w.family or not exists (select 1 from public.hr_chest_keys k where k.key_id = w.key_id)
                 or not exists (select 1 from public.hr_chest_families c where c.family = w.family)) then
    raise exception 'chest-catalogue §4: a key''s weapon is not of its family, or names no key or family'; end if;
  if exists (select 1 from public.hr_chest_weapon_families w where not exists (select 1 from public.hr_chest_families c where c.family = w.family)) then
    raise exception 'chest-catalogue §4: a weapon item reads no family'; end if;
  -- THE SUPER-RARE OUTFITS: the data's rows; every key carries each outfit (no key inherits or misses a chance); a key's outfits never add
  -- past a sure thing; each bundle a TRADEABLE hr_items row of book value (the board: it trades until someone wears it)
  select string_agg(concat_ws(':', key_id, outfit_id, item_id, pm), '|' order by concat_ws(':', key_id, outfit_id, item_id, pm) collate "C")
    into v_sum from public.hr_chest_outfits;
  if v_sum is distinct from ${oSum ? lit(oSum) : 'null'} then raise exception 'chest-catalogue §4: hr_chest_outfits is not src/data/chests.js: %', v_sum; end if;
  if exists (select 1 from public.hr_chest_keys k cross join (select distinct outfit_id from public.hr_chest_outfits) o
              where not exists (select 1 from public.hr_chest_outfits x where x.key_id = k.key_id and x.outfit_id = o.outfit_id))
     or exists (select 1 from public.hr_chest_outfits x where not exists (select 1 from public.hr_chest_keys k where k.key_id = x.key_id))
     or exists (select 1 from public.hr_chest_outfits x group by x.key_id having sum(x.pm) > 1000)
     or exists (select 1 from public.hr_chest_outfits x group by x.item_id having count(distinct x.outfit_id) > 1)
     or exists (select 1 from public.hr_chest_outfits x group by x.outfit_id having count(distinct x.item_id) > 1) then
    raise exception 'chest-catalogue §4: an outfit is missing on a key, names no key, adds past a sure thing, or shares a bundle'; end if;
  if exists (select 1 from public.hr_chest_outfits x where not exists (select 1 from public.hr_items i where i.item_id = x.item_id and i.tradeable and i.value > 0)) then
    raise exception 'chest-catalogue §4: an outfit''s bundle is no tradeable hr_items row of book value (apply the items catalogue first)'; end if;
  foreach t in array array['hr_chests', 'hr_chest_key_families', 'hr_chest_keys', 'hr_chest_stokes', 'hr_chest_luck', 'hr_chest_families', 'hr_chest_weapons', 'hr_chest_weapon_families', 'hr_chest_outfits', 'hr_chest_armor'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception 'chest-catalogue §4: a policy opens % to a client', t; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || t, 'select') or has_table_privilege(v_role, 'public.' || t, 'insert,update,delete') then
        raise exception 'chest-catalogue §4: % holds a grant on %', v_role, t; end if;
    end loop;
  end loop;
end $$;
`;
}

function selftest() {
  let bad = 0;
  try { catalogueRows(); } catch (e) { console.error('gen-chests --selftest: the tree is not clean: ' + e.message); process.exit(2); }
  const bites = (name, want, input) => {
    let msg = '';
    try { catalogueRows(input); } catch (e) { msg = e.message; }
    const hit = msg.includes(want);
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const K = CHEST_KEYS;
  const swap = (i, row) => K.map((k, j) => (j === i ? { ...k, ...row } : k));
  bites('a higher key with a better weapon chance', 'the odds fall as keys rise', { keys: swap(1, { weaponPm: 200 }) });
  bites('a higher key with no more Cinders', 'no more Cinders than', { keys: swap(2, { cinders: 150 }) });
  bites('a key that starts off a landing', 'from is not a landing', { keys: swap(0, { from: 15 }) });
  bites('two keys from one landing', 'starts at or under', { keys: swap(1, { from: 10 }) });
  bites('a weapon chance of nothing', 'weaponPm is not a whole permille', { keys: swap(0, { weaponPm: 0 }) });
  bites('a key of no family', 'is no key family', { keys: swap(2, { family: 'arena' }) });
  bites('a held limit under a week of opens', 'heldMax is under', { keyFamilies: { tower: { ...KEY_FAMILIES.tower, heldMax: 5 } } });
  bites('a family no key belongs to', 'no key belongs to it', { keyFamilies: { ...KEY_FAMILIES, arena: { id: 'arena', name: 'Arena', opensPerWeek: 6, heldMax: 30 } } });
  /* THE CATACOMB KEYS (lane/c-catacombs): each from a wing of its family, an armor key's pieces of its slot, weight and tier, the lean a permille */
  const H = HEARTH_CHEST_KEYS, hk = (id, row) => H.map((k) => (k.id === id ? { ...k, ...row } : k));
  bites('a Catacomb key from the Tower\'s landings', 'mints the tower family', { keys: hk('bone_bronze', { ground: 'the_burning_tower' }) });
  bites('a Catacomb key from no run ground', 'is no run ground', { keys: hk('bone_bronze', { ground: 'mill_cellar' }) });
  bites('two keys of one wing from one door', 'starts at or under', { keys: hk('bone_silver', { from: 10 }) });
  bites('an armor piece in the wrong slot', 'is a boots:heavy', { keys: hk('bone_bronze', { armor: { ...H.find((k) => k.id === 'bone_bronze').armor, 'helmet:heavy': 'hodmans_boots' } }) });
  bites('an armor piece of another tier', 'is not a tradeable piece of the key', { keys: hk('bone_bronze', { armor: { ...H.find((k) => k.id === 'bone_bronze').armor, 'helmet:heavy': 'cranemans_helm' } }) });
  bites('a lean that is no permille', 'helmetPm is not a whole permille', { keys: hk('bone_bronze', { helmetPm: 1200 }) });
  bites('an armor key with a +skill', 'an armor key with a +skill', { keys: hk('bone_bronze', { skillPlus: 1 }) });
  bites('a wing\'s keys leaning two ways', 'pays another gear or lean', { keys: hk('bone_silver', { helmetPm: 300 }) });
  bites('no weekly open count', 'opensPerWeek is not', { keyFamilies: { tower: { ...KEY_FAMILIES.tower, opensPerWeek: 0 } } });
  bites('a key that is no item', 'is no item', { keys: swap(0, { item: 'tower_key_nowhere' }) });
  bites('a food that is no item', 'its food', { keys: swap(3, { food: 'cooked_nothing' }) });
  bites('a weapon of the wrong family', 'is a bow', { keys: swap(0, { weapons: { sword: 'shortbow' } }) });
  bites('a weapon family no family is', 'is no weapon family', { keys: swap(0, { weapons: { spear: 'iron_sword' } }) });
  bites('a stoke that costs less than the one before', 'is not more chance for more Cinders', { luck: { ...CHEST_LUCK, stokes: [CHEST_LUCK.stokes[0], { pm: 2500, keys: 2 }] } });
  bites('a warmth cap under the base', 'warmthCapPm is under the base', { luck: { ...CHEST_LUCK, warmthCapPm: 900 } });
  bites('a family rung that reads another family', 'is a sword rung', { families: [{ key: 'sword', ids: ['shortbow'] }] });
  /* the tower weapons' own rows (src/data/tower-weapons.js): one a key and family, each of a key that exists, each its own id and name */
  const T = TOWER_WEAPONS, tw = (i, row) => T.map((w, j) => (j === i ? { ...w, ...row } : w));
  bites('two tower weapons of one family for one key', 'a second sword for the bronze key', { tower: tw(1, { family: 'sword' }) });
  bites('a tower weapon of a key no row has', 'is no key', { tower: tw(0, { key: 'diamond' }) });
  bites('two tower weapons with one name', 'another tower weapon is called', { tower: tw(1, { name: T[0].name }) });
  bites('a tower weapon with no line', 'no line', { tower: tw(2, { line: ' ' }) });
  /* the super-rare outfits (CHEST_OUTFITS): a chance on every key, never past a sure thing, owned through its own bundle, which trades */
  const O = CHEST_OUTFITS, ow = (row) => [{ ...O[0], ...row }];
  bites('an outfit with no chance on a key', 'no whole permille 1..1000 for the platinum key', { outfits: ow({ pm: { bronze: 2, silver: 3, gold: 4 } }) });
  bites('an outfit chance for a key that is no key', 'which is no key', { outfits: ow({ pm: { ...O[0].pm, diamond: 6 } }) });
  bites('outfits past a sure thing on one key', 'add up past a sure thing', { outfits: [...O, { ...O[0], outfit: 'second_coat', item: 'second_coat_bundle', pm: { ...O[0].pm, bronze: 999 } }] });
  bites('an outfit whose outfits.js row is owned through another item', 'is owned through', { outfitRows: { ...OUTFIT_ROWS, [O[0].outfit]: { ...OUTFIT_ROWS[O[0].outfit], bundle: 'other_bundle' } } });
  bites('a bundle that is bound', 'is not a tradeable item of book value', { items: { ...ITEMS, [O[0].item]: { ...ITEMS[O[0].item], bop: true } } });
  /* the rows are the data's: every weapon item and its own family, the salts derived from the tempering table */
  const r = catalogueRows();
  const ok = r.weaponFamilies.length > 50 && r.weaponFamilies.every((w) => weaponFamilyOf(ITEMS[w.item]) === w.family)
    && r.keys.every((k) => k.salts === keySalts(k)) && r.keys[0].salts === 'temper_salts';
  console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} the rows are the data's: every weapon's family, the salts of the highest tempering tier at or under each key's weapons`);
  if (!ok) bad++;
  if (bad) { console.error(`gen-chests --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-chests --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-chests --check: ${OUT_NAME} is stale; run node tools/gen-chests.mjs`); process.exit(1); }
    console.log('gen-chests --check: OK');
    return;
  }
  await writeFile(OUT, build());
  console.log('gen-chests: wrote ' + OUT_NAME);
}

/* GROUND PACKS: a whole file carries the base and the folded packs only (tools/pack/whole.mjs), so a new pack re-issues nothing */
if (isMain(import.meta.url) && wholeViewOrRerun(import.meta.url, OUT_NAME)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
