#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-chests.mjs — GENERATE THE HEARTH CHEST'S SERVER CATALOGUE (lane/c-tower-chest; Tyler 2026-11-14; the Burning Tower board §5,
//   the coherence pass's C4).
//
// src/data/chests.js holds the chest's open key table, what each key always holds, the weapon chance, the Hearth's warmth and the stokes.
// Postgres must know them to do what only it may: mint a landing's key (hr_tower_key_mint), work out a key's chance again inside the open
// (hr_chest_chance_ppm), roll it on its own dice, take the stokes' Cinders and pay the haul (hr_chest_open). Emitted as hr_chests,
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
import { CHESTS, CHEST_KEYS, CHEST_LUCK, CINDERS, WEAPON_FAMILY_KEYS, weaponFamilyOf, keySalts, validateChests } from '../src/data/chests.js';
import { TOWER_WEAPONS } from '../src/data/tower-weapons.js';
import { WEAPON_FAMILIES } from '../src/data/gear-tiers.js';
import { TOWER_RULES } from '../src/data/tower.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a changed row moves OUT_NAME to a forward file, like every generated catalogue. */
export const OUT_NAME = '2027-04-27-tower-chest-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/** The catalogue's rows, or a throw naming every problem. Pure. */
export function catalogueRows({ keys = CHEST_KEYS, luck = CHEST_LUCK, items = ITEMS, families = WEAPON_FAMILIES, tower = TOWER_WEAPONS } = {}) {
  const problems = validateChests(keys, luck, TOWER_RULES.landingEvery, undefined, tower);
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
  }
  /* the family rule against the families' own rows: every rung of a family reads that family */
  for (const f of families) for (const id of f.ids) if (id && isItem(id) && weaponFamilyOf(items[id]) !== f.key) problems.push(`${id} is a ${f.key} rung and reads ${weaponFamilyOf(items[id])}`);
  if (problems.length) throw new Error('gen-chests: ' + problems.join('; '));
  const weaponFamilies = Object.keys(items).sort().map((id) => ({ item: id, family: weaponFamilyOf(items[id]) })).filter((r) => r.family);
  const weapons = keys.flatMap((k) => Object.entries(k.weapons || {}).map(([family, item]) => ({ key: k.id, family, item })));
  return { keys: keys.map((k) => ({ ...k, salts: keySalts(k) })), luck, weaponFamilies, weapons };
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

export function build(input) {
  const r = catalogueRows(input);
  const L = r.luck;
  const keyRows = r.keys.map((k) => `  (${lit(k.id)}, ${lit(k.item)}, ${lit(k.name)}, ${k.from}, ${k.weaponPm}, ${k.weaponTier}, ${k.skillPlus}, ${k.cinders}, ${lit(k.salts)}, ${k.saltsQty}, ${lit(k.food)}, ${k.foodQty})`).join(',\n');
  const stokeRows = L.stokes.map((s, i) => `  (${i + 1}, ${s.pm}, ${s.keys})`).join(',\n');
  const famRows = WEAPON_FAMILY_KEYS.map((f, i) => `  (${lit(f)}, ${i + 1})`).join(',\n');
  const wfRows = r.weaponFamilies.map((w) => `  (${lit(w.item)}, ${lit(w.family)})`).join(',\n');
  const wRows = r.weapons.map((w) => `  (${lit(w.key)}, ${lit(w.family)}, ${lit(w.item)})`).join(',\n');
  const chestRows = Object.values(CHESTS).map((c) => `  (${lit(c.id)}, ${lit(c.name)})`).join(',\n');
  const sum = r.keys.map((k) => [k.id, k.item, k.from, k.weaponPm, k.weaponTier, k.skillPlus, k.cinders, k.salts, k.saltsQty, k.food, k.foodQty].join(':')).join('|');
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_NAME} — THE HEARTH CHEST: ITS OPEN KEY TABLE, WHAT EACH KEY ALWAYS HOLDS, ITS WEAPON CHANCE, THE HEARTH'S WARMTH AND THE STOKES.
-- Generated by tools/gen-chests.mjs from src/data/chests.js (the salts each key holds derived from src/data/temper.js TEMPER_MATERIALS; the
--   weapon families from src/data/gear-tiers.js and every weapon item's own fields). Any hand edit FAILS \`node tools/gen-chests.mjs --check\`.
-- STATUS: STAGED, NOT APPLIED (lane/c-tower-chest, backend-architect, 2026-11-15; Tyler 2026-11-14, the Burning Tower's chest). The Coordinator
--   applies (tools/apply-migration.mjs, one file, never inside begin/commit). ORDER: after 2027-04-27-tower-chest-items-catalogue.generated.sql
--   (every item a row names is in hr_items: §4 checks it), right before 2027-04-27-tower-chest.sql, which reads every table. No function body.
-- hr_chests (one row today); hr_chest_keys (${r.keys.length} rows: the open table, a landing's key is the highest row at or under it); hr_chest_stokes
--   (${L.stokes.length}: a stoke count's multiplier and its price in keys' worth of Cinders); hr_chest_luck (one row: the warmth step and cap, the own-family
--   weight, the per-call and per-day clamps); hr_chest_families (the ${WEAPON_FAMILY_KEYS.length} weapon families, the "types"); hr_chest_weapons (each key's
--   weapon a family: ${r.weapons.length} rows; a key short of its ${WEAPON_FAMILY_KEYS.length} is refused chest_not_ready); hr_chest_weapon_families (${r.weaponFamilies.length}
--   weapon items and their family). All rewritten whole: no player row points at any of them (the key and Cinders items are hr_items rows).
-- RLS on, no policy, no client grant: only SECURITY DEFINER functions read them. ON THE EA SECURITY LIST with the Tower.
-- REVERSIBLE: drop the seven tables after 2027-04-27-tower-chest.sql's reversal.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_chests (
  chest_id text primary key check (chest_id ~ '^[a-z0-9_]{1,40}$'),
  name     text not null
);
create table if not exists public.hr_chest_keys (
  key_id       text primary key check (key_id ~ '^[a-z0-9_]{1,40}$'),
  item_id      text not null unique,
  name         text not null,
  from_landing int  not null unique check (from_landing > 0),
  weapon_pm    int  not null check (weapon_pm between 1 and 1000),
  weapon_tier  int  not null check (weapon_tier between 1 and 10),
  skill_plus   int  not null check (skill_plus >= 1),
  cinders      int  not null check (cinders > 0),
  salts_item   text not null,
  salts_qty    int  not null check (salts_qty > 0),
  food_item    text not null,
  food_qty     int  not null check (food_qty > 0)
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
  per_call       int not null check (per_call between 1 and 100),
  per_day        int not null,
  constraint hr_chest_luck_day check (per_day >= per_call)
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
do $$
declare t text;
begin
  foreach t in array array['hr_chests', 'hr_chest_keys', 'hr_chest_stokes', 'hr_chest_luck', 'hr_chest_families', 'hr_chest_weapons', 'hr_chest_weapon_families'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_chest_keys is '${OUT_NAME}: the Hearth Chest''s open key table (src/data/chests.js CHEST_KEYS): a landing''s key is the highest row at or under it; what each key always holds; its base weapon chance (permille). Read by hr_tower_key_mint, hr_chest_open and hr_chest_section.';
comment on table public.hr_chest_luck is '${OUT_NAME}: the Hearth''s warmth (a dry key warms the next by warmth_step_pm of its base, up to warmth_cap_pm), the own-family weight and the clamps (src/data/chests.js CHEST_LUCK). One row.';
comment on table public.hr_chest_weapons is '${OUT_NAME}: each key''s tower weapon a family (src/data/chests.js weapons). A key without one for every hr_chest_families row is not ready: hr_chest_open refuses it.';

delete from public.hr_chests;
insert into public.hr_chests (chest_id, name) values
${chestRows};
delete from public.hr_chest_weapons;
delete from public.hr_chest_keys;
insert into public.hr_chest_keys (key_id, item_id, name, from_landing, weapon_pm, weapon_tier, skill_plus, cinders, salts_item, salts_qty, food_item, food_qty) values
${keyRows};
delete from public.hr_chest_stokes;
insert into public.hr_chest_stokes (stokes, pm, keys) values
${stokeRows};
insert into public.hr_chest_luck (id, warmth_step_pm, warmth_cap_pm, own_pm, per_call, per_day) values
  (true, ${L.warmthStepPm}, ${L.warmthCapPm}, ${L.ownPm}, ${L.perCall}, ${L.perDay})
on conflict (id) do update set warmth_step_pm = excluded.warmth_step_pm, warmth_cap_pm = excluded.warmth_cap_pm, own_pm = excluded.own_pm,
  per_call = excluded.per_call, per_day = excluded.per_day;
delete from public.hr_chest_families;
insert into public.hr_chest_families (family, ord) values
${famRows};
${wRows ? `insert into public.hr_chest_weapons (key_id, family, item_id) values\n${wRows};` : '-- (no tower weapon is built: every key waits on its seven, src/data/chests.js chestShipBlockers)'}
delete from public.hr_chest_weapon_families;
insert into public.hr_chest_weapon_families (item_id, family) values
${wfRows};

-- §4 SELF-CHECK: the data's rows (a digest of every key row), the open table rising, every item a row names an hr_items row (the keys and
-- the Cinders bound), every weapon of its own family, and no client can read or write a table.
do $$
declare t text; v_role text; v_sum text;
begin
  select string_agg(concat_ws(':', key_id, item_id, from_landing, weapon_pm, weapon_tier, skill_plus, cinders, salts_item, salts_qty, food_item, food_qty), '|' order by from_landing)
    into v_sum from public.hr_chest_keys;
  if v_sum is distinct from ${lit(sum)} then raise exception 'chest-catalogue §4: hr_chest_keys is not src/data/chests.js: %', v_sum; end if;
  if exists (select 1 from public.hr_chest_keys a join public.hr_chest_keys b on b.from_landing > a.from_landing
              where b.weapon_pm > a.weapon_pm or b.cinders <= a.cinders or b.skill_plus <= a.skill_plus) then
    raise exception 'chest-catalogue §4: a higher key is no better than the one under it'; end if;
  if (select count(*) from public.hr_chest_stokes) <> ${L.stokes.length} or (select count(*) from public.hr_chest_luck) <> 1
     or (select count(*) from public.hr_chest_families) <> ${WEAPON_FAMILY_KEYS.length} or (select count(*) from public.hr_chests) <> ${Object.keys(CHESTS).length}
     or (select count(*) from public.hr_chest_weapons) <> ${r.weapons.length} then
    raise exception 'chest-catalogue §4: the stokes, the luck row, the families, the chests or the tower weapons are not the data''s'; end if;
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
  foreach t in array array['hr_chests', 'hr_chest_keys', 'hr_chest_stokes', 'hr_chest_luck', 'hr_chest_families', 'hr_chest_weapons', 'hr_chest_weapon_families'] loop
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
