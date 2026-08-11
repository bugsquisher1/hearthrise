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

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// ── 1. Read the single source of truth ───────────────────────────────────
const { ITEMS } = await imp('src/data/items.js');
const { SKILLS_DEF } = await imp('src/data/skills.js');
const { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS } = await imp('src/data/gathering.js');
const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
const { MONSTERS } = await imp('src/data/monsters.js');

// ── 2. Derive the rows ───────────────────────────────────────────────────
// The `slot` an item authors ('ring') is not always an equip slot the player
// has ('ring1'/'ring2'). Expansion happens HERE, in JS, next to the data —
// never as a special case inside PL/pgSQL, which is how the two copies would
// start to disagree.
const SLOT_EXPANSION = { ring: ['ring1', 'ring2'] };

const itemIds = Object.keys(ITEMS).sort();
const items = itemIds.map((id) => {
  const it = ITEMS[id] || {};
  return {
    item_id: id,
    name: String(it.n ?? id),
    // `bop` = bind-on-pickup = untradeable. Absence means tradeable.
    tradeable: !it.bop,
    kind: it.type ?? null,
    value: Number.isFinite(it.v) ? Math.trunc(it.v) : 0,
    req_skill: it.reqSkill ?? null,
    req_lv: Number.isFinite(it.reqLv) ? Math.trunc(it.reqLv) : null,
    heals: Number.isFinite(it.heals) ? Math.trunc(it.heals) : null,
  };
});

const itemSlots = [];
for (const id of itemIds) {
  const raw = ITEMS[id]?.slot;
  if (!raw) continue;
  for (const s of (SLOT_EXPANSION[raw] || [raw])) itemSlots.push({ item_id: id, equip_slot: s });
}
itemSlots.sort((a, b) => (a.item_id + a.equip_slot).localeCompare(b.item_id + b.equip_slot));

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
}));

// Activities: every id `player_state.active_id` may legally hold, with the
// skill gate the server re-checks. Combat "activities" are monsters.
const activities = [];
const pushNodes = (arr, skill) => {
  for (const n of arr) activities.push({
    kind: 'gather', activity_id: n.id, req_skill: skill, req_lv: Math.trunc(n.req ?? 1),
  });
};
pushNodes(TREES, 'woodcutting');
pushNodes(ROCKS, 'mining');
pushNodes(FISH_SPOTS, 'fishing');
for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
  for (const r of list) activities.push({
    kind: 'artisan', activity_id: r.id, req_skill: skill, req_lv: Math.trunc(r.req ?? 1),
  });
}
for (const id of Object.keys(MONSTERS).sort()) activities.push({
  kind: 'combat', activity_id: id, req_skill: null, req_lv: null,
});
activities.sort((a, b) => (a.kind + a.activity_id).localeCompare(b.kind + b.activity_id));

// ── 3. Hash — the DB-side half of the drift guard ────────────────────────
// The same digest is asserted by tests/sql/server-authority.test.sql against
// hr_catalogue_meta, so a database that was loaded from an older generation is
// detectable without diffing 400 rows by hand.
const canonical = JSON.stringify({ items, itemSlots, equipSlots, skills, crops, activities });
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
--         ${skills.length} skills · ${crops.length} crops · ${activities.length} activities
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
  req_lv     int     not null
);

create table if not exists public.hr_activities (
  kind        text not null check (kind in ('gather','artisan','combat')),
  activity_id text not null,
  req_skill   text,
  req_lv      int,
  primary key (kind, activity_id)
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

insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, heals) values
${valuesBlock(items, (r) => `  (${q(r.item_id)},${q(r.name)},${b(r.tradeable)},${q(r.kind)},${n(r.value)},${q(r.req_skill)},${n(r.req_lv)},${n(r.heals)})`)};

insert into public.hr_item_slots (item_id, equip_slot) values
${valuesBlock(itemSlots, (r) => `  (${q(r.item_id)},${q(r.equip_slot)})`)};

insert into public.hr_equip_slots (equip_slot, ord) values
${valuesBlock(equipSlots, (r) => `  (${q(r.equip_slot)},${n(r.ord)})`)};

insert into public.hr_skills (skill_id, name, cat) values
${valuesBlock(skills, (r) => `  (${q(r.skill_id)},${q(r.name)},${q(r.cat)})`)};

insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv) values
${valuesBlock(crops, (r) => `  (${q(r.crop_id)},${q(r.seed_item)},${q(r.prod_item)},${n(r.base_hours)},${n(r.req_lv)})`)};

insert into public.hr_activities (kind, activity_id, req_skill, req_lv) values
${valuesBlock(activities, (r) => `  (${q(r.kind)},${q(r.activity_id)},${q(r.req_skill)},${n(r.req_lv)})`)};

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
                           'hr_crops','hr_activities','hr_catalogue_meta'] loop
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
                       'hr_crops','hr_activities','hr_catalogue_meta')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on catalogue tables', v_bad; end if;

  -- ... and no client role may hold a write privilege on one either.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('hr_items','hr_item_slots','hr_equip_slots','hr_skills',
                        'hr_crops','hr_activities','hr_catalogue_meta')
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on catalogue tables', v_bad; end if;

  raise notice 'CATALOGUES OK — % items, % activities, digest ${DIGEST}',
    (select count(*) from public.hr_items), (select count(*) from public.hr_activities);
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
  console.log(`catalogue in sync (${items.length} items, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, sql, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${items.length} items · ${itemSlots.length} slot pairs · ${activities.length} activities`);
  console.log(`  digest ${DIGEST}`);
}
