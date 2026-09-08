#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hearthfind.mjs — GENERATE THE SERVER HEARTHFIND CATALOGUE.
//
// hr_apply's `hearthfind` arm (2026-09-08-hearthfind.sql) grants the trophy,
// journals it and broadcasts it. To do that it must re-derive, server-side,
// three facts the engine is NOT trusted for:
//   • which item ids are hearthfind trophies at all   → bad_hearthfind
//   • which (source_kind, source_id) pairs exist       → bad_hearthfind
//   • which trophy each pair pays, and at what odds    → the journal + the floor
//
// Source of truth is src/data/hearthfind.js and src/data/items.js — the SAME
// modules the engine's roll (src/core/hearthfind.js) reads. Copying game DATA
// into SQL by hand is the src/main.js `unifyObject` failure, and here the copy
// would be the CLAMP, so drift would silently widen the rarest odds in the game.
//
//   Regenerate:  node tools/gen-hearthfind.mjs
//   Verify:      node tools/gen-hearthfind.mjs --check   (run in run-smoke)
//
// ⚠ THE BAND IS EXPECTED HOURS (100-400, Designer ruling 2026-09-08), NOT a
//   per-roll oneIn: roll rates span >12x across the shipped sources, so one
//   oneIn band expressed no rarity a player could feel. `hours` is authored;
//   `one_in` and `expected_hours` are DERIVED here and stored, and the band is
//   asserted THREE times from ONE constant: here (build failure), in
//   src/core/hearthfind.js (indexHearthfind throws), and in the emitted SQL's
//   own self-check (executed SQL against `expected_hours`, not a marker). The
//   migration also holds a CHECK constraint, so a hand-INSERTed out-of-band row
//   is rejected by Postgres even if every generator in the repo were bypassed.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HEARTHFIND_TABLE, HEARTHFIND_ITEMS, HEARTHFIND_TROPHIES, HEARTHFIND_SOURCE_KINDS,
  HEARTHFIND_HOURS_MIN, HEARTHFIND_HOURS_MAX,
  HEARTHFIND_SET_NAME, HEARTHFIND_SET_TITLE, HEARTHFIND_PLINTH,
} from '../src/data/hearthfind.js';
/* THE DERIVATION IS IMPORTED, NOT RE-TYPED. `oneIn` is round(rate x hours) in
   exactly one place (src/core/hearthfind.js) — the function the ENGINE rolls
   from — so the catalogue the server clamps against and the odds the engine
   uses are one expression evaluated twice, never two numbers that can drift. */
import { deriveOneIn, derivedHours } from '../src/core/hearthfind.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'migrations', '2026-09-08-hearthfind-catalogue.generated.sql');
const ID_RE = /^[a-z0-9_]+$/;

const die = (msg) => { throw new Error(`gen-hearthfind: ${msg}`); };

function rows() {
  // ── The trophies. Every one must be a real item, flagged, BoP and worthless
  //    to a vendor. These are not style points: `bop` is what keeps a find off
  //    the market (no gold bridge) and `v:0` is what keeps it out of the vendor
  //    (a find mints zero gold). Both are the mint-leak property the Feature
  //    Slate's "must NOT" asks for, so both FAIL THE BUILD rather than warn.
  const items = [];
  for (const id of HEARTHFIND_ITEMS) {
    if (!ID_RE.test(id)) die(`trophy id ${id} is not [a-z0-9_]`);
    const it = ITEMS[id];
    if (!it) die(`trophy ${id} is not in src/data/items.js — hr_apply would refuse an unknown item`);
    if (it.hearthfind !== true) die(`trophy ${id} is missing hearthfind:true in items.js — the two lists must agree`);
    if (it.bop !== true) die(`trophy ${id} must be bop:true — a tradeable hearthfind is a second gold bridge`);
    if (Number(it.v || 0) !== 0) die(`trophy ${id} must have v:0 — a vendorable hearthfind mints gold`);
    const t = HEARTHFIND_TROPHIES.find((x) => x.item === id);
    if (!t || !ID_RE.test(t.title) || !t.titleName) die(`trophy ${id} has no title in HEARTHFIND_TROPHIES`);
    items.push({ item: id, name: String(it.n ?? id), title: t.title, titleName: String(t.titleName) });
  }
  // The reverse direction, so the flag cannot be added to an item that no source
  // pays (an un-findable "hearthfind" that hr_apply would nonetheless accept).
  for (const id of Object.keys(ITEMS)) {
    if (ITEMS[id] && ITEMS[id].hearthfind === true && !HEARTHFIND_ITEMS.includes(id)) {
      die(`item ${id} is hearthfind:true but is not in HEARTHFIND_ITEMS — the allowlist would accept an item nothing drops`);
    }
  }
  items.sort((a, b) => a.item.localeCompare(b.item));

  // ── The sources. Every id must be a real monster or a real gather node, or
  //    the catalogue advertises a source the engine can never roll.
  const nodeIds = new Set([...TREES, ...ROCKS, ...FISH_SPOTS].map((n) => n.id));
  const seen = new Set();
  const sources = HEARTHFIND_TABLE.map((r) => {
    if (!HEARTHFIND_SOURCE_KINDS.includes(r.kind)) {
      die(`source kind ${JSON.stringify(r.kind)} has no roll site in src/core — see HEARTHFIND_SOURCE_KINDS`);
    }
    if (!ID_RE.test(r.id)) die(`source id ${r.id} is not [a-z0-9_]`);
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) die(`source ${key} appears twice — (kind,id) is the primary key`);
    seen.add(key);
    if (r.kind === 'monster' && !MONSTERS[r.id]) die(`source ${key} is not in src/data/monsters.js`);
    if (r.kind === 'node' && !nodeIds.has(r.id)) die(`source ${key} is not a TREES/ROCKS/FISH_SPOTS node`);
    if (!HEARTHFIND_ITEMS.includes(r.item)) die(`source ${key} pays ${r.item}, which is not a hearthfind trophy`);
    if (r.oneIn !== undefined) die(`source ${key} authors oneIn — author \`hours\` and let the generator derive it`);
    if (!Number.isFinite(r.hours) || r.hours < HEARTHFIND_HOURS_MIN || r.hours > HEARTHFIND_HOURS_MAX) {
      die(`source ${key} hours ${r.hours} is outside [${HEARTHFIND_HOURS_MIN},${HEARTHFIND_HOURS_MAX}]`);
    }
    const oneIn = deriveOneIn(r);
    if (!Number.isInteger(oneIn) || oneIn <= 0) die(`source ${key} derived a non-positive oneIn`);
    /* THE STORED HOURS, derived BACK from the stored odds — not the authored
       number echoed. Rounding oneIn moves the real expectation by <0.01 h; what
       matters is that the column the self-check reads is a function of the
       column the clamp reads, so the two cannot disagree. */
    const hours = derivedHours(r, oneIn);
    if (hours < HEARTHFIND_HOURS_MIN - 1 || hours > HEARTHFIND_HOURS_MAX + 1) {
      die(`source ${key} derives ${hours.toFixed(2)} h from oneIn ${oneIn}, outside the band`);
    }
    return { kind: r.kind, id: r.id, item: r.item, oneIn, hours: +hours.toFixed(4) };
  });
  if (!sources.length) {
    die('HEARTHFIND_TABLE is empty — hr_apply\'s allowlist would accept nothing and the feature would be inert');
  }
  sources.sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
  return { items, sources };
}

export function render() {
  const { items, sources } = rows();
  const nI = items.length;
  const nS = sources.length;
  const meta = [
    ['set_name',       HEARTHFIND_SET_NAME],
    ['set_title_code', HEARTHFIND_SET_TITLE.code],
    ['set_title_name', HEARTHFIND_SET_TITLE.name],
    ['plinth_code',    HEARTHFIND_PLINTH],
  ];
  const digest = createHash('sha256')
    .update(JSON.stringify({ items, sources, meta, min: HEARTHFIND_HOURS_MIN, max: HEARTHFIND_HOURS_MAX }))
    .digest('hex');
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const iVals = items.map((i) => `  (${q(i.item)}, ${q(i.name)}, ${q(i.title)}, ${q(i.titleName)})`).join(',\n');
  const sVals = sources.map((s) => `  (${q(s.kind)}, ${q(s.id)}, ${q(s.item)}, ${s.oneIn}, ${s.hours})`).join(',\n');
  const mVals = meta.map(([k, v]) => `  (${q(k)}, ${q(v)})`).join(',\n');
  const shortest = Math.min(...sources.map((s) => s.oneIn));
  const longest = Math.max(...sources.map((s) => s.oneIn));

  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SERVER HEARTHFIND CATALOGUE  (GENERATED — DO NOT EDIT)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Applied by the Coordinator after the
--     Security GO, in apply order: THIS FILE, then 2026-09-08-hearthfind.sql
--     (which fails closed without these tables).
--
--   Generated by tools/gen-hearthfind.mjs from src/data/hearthfind.js +
--   src/data/items.js, with one_in and expected_hours DERIVED by
--   src/core/hearthfind.js deriveOneIn — the same function the engine rolls
--   from. Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-hearthfind.mjs --check\`.
--
--   hearthfind digest: ${digest}
--   ${nI} trophies · ${nS} sources · odds 1 in ${shortest} … 1 in ${longest}
--   band: EXPECTED HOURS ${HEARTHFIND_HOURS_MIN}–${HEARTHFIND_HOURS_MAX} at the source
--
-- Read by hr_apply's hearthfind arm to re-derive the trophy, the source, the
-- odds and the cosmetic unlocks under the character lock. Numbers and ids only;
-- no client value crosses. Idempotent: delete+insert inside the transaction.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is absent — apply 2026-08-11-catalogue.generated.sql first';
  end if;
end $$;

-- ── hr_hearthfind_items: the trophy allowlist + the title each one unlocks ──
create table if not exists public.hr_hearthfind_items (
  item_id text primary key,
  name    text not null
);
-- Additive on a database that already holds the pre-ruling shape.
alter table public.hr_hearthfind_items add column if not exists title_code text;
alter table public.hr_hearthfind_items add column if not exists title_name text;

-- ── hr_hearthfind_meta: the set name, the set title, the plinth code ───────
-- Generated from HEARTHFIND_SET_NAME / HEARTHFIND_SET_TITLE / HEARTHFIND_PLINTH
-- so hr_apply reads the cosmetic codes from the catalogue instead of carrying
-- hand-typed string literals in its body (the data double-copy rule).
create table if not exists public.hr_hearthfind_meta (
  key   text primary key,
  value text not null
);

-- ── hr_hearthfind_sources: one row per source, carrying the odds ───────────
-- ⚠ THE CHECK IS THE LAST LINE OF DEFENCE ON THE BAND, and it is stated in the
--   unit the Designer ruled in: EXPECTED HOURS. The generator refuses an
--   out-of-band row and src/core/hearthfind.js throws on one, but both of those
--   are JavaScript. This constraint is Postgres refusing to STORE the number,
--   so even a hand-typed INSERT by an operator cannot make a find common —
--   nor, at the 1-in-420,000 end, make one unreachable.
create table if not exists public.hr_hearthfind_sources (
  source_kind text   not null check (source_kind in ('monster','node')),
  source_id   text   not null,
  item_id     text   not null references public.hr_hearthfind_items(item_id) on delete cascade,
  one_in      bigint not null check (one_in > 0),
  primary key (source_kind, source_id)
);
alter table public.hr_hearthfind_sources add column if not exists expected_hours numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_hearthfind_sources_hours_band') then
    alter table public.hr_hearthfind_sources
      add constraint hr_hearthfind_sources_hours_band
      check (expected_hours is not null
             and expected_hours >= ${HEARTHFIND_HOURS_MIN} and expected_hours <= ${HEARTHFIND_HOURS_MAX});
  end if;
end $$;

-- Engine-only reads, exactly like the dungeon catalogue. RLS on, and every
-- grant revoked — INCLUDING service_role, which bypasses RLS: a leaked service
-- key must not be able to retune the rarest odds in the game.
alter table public.hr_hearthfind_items   enable row level security;
alter table public.hr_hearthfind_sources enable row level security;
alter table public.hr_hearthfind_meta    enable row level security;
do $$
begin
  revoke all on public.hr_hearthfind_items   from public, anon, authenticated, service_role;
  revoke all on public.hr_hearthfind_sources from public, anon, authenticated, service_role;
  revoke all on public.hr_hearthfind_meta    from public, anon, authenticated, service_role;
end $$;

delete from public.hr_hearthfind_sources;
delete from public.hr_hearthfind_items;
delete from public.hr_hearthfind_meta;
insert into public.hr_hearthfind_items (item_id, name, title_code, title_name) values
${iVals};
insert into public.hr_hearthfind_meta (key, value) values
${mVals};
insert into public.hr_hearthfind_sources (source_kind, source_id, item_id, one_in, expected_hours) values
${sVals};

-- ── Self-verification ──────────────────────────────────────────────────────
do $$
declare v_i int; v_s int; v_bad int; v_lo numeric; v_hi numeric;
begin
  select count(*) into v_i from public.hr_hearthfind_items;
  if v_i <> ${nI} then raise exception 'hr_hearthfind_items has % rows, expected ${nI}', v_i; end if;
  select count(*) into v_s from public.hr_hearthfind_sources;
  if v_s <> ${nS} then raise exception 'hr_hearthfind_sources has % rows, expected ${nS}', v_s; end if;
  if (select count(*) from public.hr_hearthfind_meta) <> ${meta.length} then
    raise exception 'hr_hearthfind_meta has the wrong row count';
  end if;

  -- (a) THE BAND, IN HOURS, asserted against the stored rows and not merely
  --     constrained. This is the ruling's clamp: every source must sit between
  --     ${HEARTHFIND_HOURS_MIN} and ${HEARTHFIND_HOURS_MAX} expected hours at
  --     its own action rate — never a per-roll number, which says nothing
  --     comparable across a 12x spread of roll rates.
  select min(expected_hours), max(expected_hours) into v_lo, v_hi from public.hr_hearthfind_sources;
  if v_lo < ${HEARTHFIND_HOURS_MIN} or v_hi > ${HEARTHFIND_HOURS_MAX} then
    raise exception 'hearthfind hours span % .. % - outside the ${HEARTHFIND_HOURS_MIN}-${HEARTHFIND_HOURS_MAX} band', v_lo, v_hi;
  end if;
  select count(*) into v_bad from public.hr_hearthfind_sources where one_in <= 0 or expected_hours is null;
  if v_bad > 0 then raise exception '% hearthfind sources have no usable odds', v_bad; end if;

  -- (b) Every trophy is a real, untradeable, worthless-to-a-vendor item in the
  --     MAIN catalogue, and unlocks exactly one title.
  select count(*) into v_bad from public.hr_hearthfind_items h
   where not exists (select 1 from public.hr_items i where i.item_id = h.item_id);
  if v_bad > 0 then raise exception '% hearthfind trophies are not in hr_items', v_bad; end if;
  select count(*) into v_bad from public.hr_hearthfind_items h
    join public.hr_items i on i.item_id = h.item_id
   where i.tradeable or i.value <> 0;
  if v_bad > 0 then
    raise exception '% hearthfind trophies are tradeable or vendorable — a find would mint gold or reach the market', v_bad;
  end if;
  select count(*) into v_bad from public.hr_hearthfind_items
   where title_code is null or title_name is null;
  if v_bad > 0 then raise exception '% hearthfind trophies unlock no title', v_bad; end if;
  select count(*) into v_bad from (
    select title_code from public.hr_hearthfind_items group by title_code having count(*) > 1) x;
  if v_bad > 0 then raise exception 'two hearthfind trophies share a title code'; end if;

  -- (c) Every trophy is actually reachable, and every source pays a real one.
  select count(*) into v_bad from public.hr_hearthfind_items h
   where not exists (select 1 from public.hr_hearthfind_sources s where s.item_id = h.item_id);
  if v_bad > 0 then raise exception '% hearthfind trophies have no source — the allowlist would accept an unfindable item', v_bad; end if;

  -- (d) No client write policy, and no client grant of any kind — service_role
  --     INCLUDED (it bypasses RLS, so a leaked key is a retune of the odds).
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('hr_hearthfind_items','hr_hearthfind_sources','hr_hearthfind_meta');
  if v_bad > 0 then raise exception '% policies on the hearthfind catalogue — it is engine-only', v_bad; end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('hr_hearthfind_items','hr_hearthfind_sources','hr_hearthfind_meta')
     and grantee in ('anon','authenticated','service_role','PUBLIC');
  if v_bad > 0 then raise exception '% client grants on the hearthfind catalogue', v_bad; end if;
end $$;
`;
}

const wanted = render();
if (process.argv.includes('--check')) {
  const have = await readFile(OUT, 'utf8').catch(() => '');
  if (have.replace(/\r\n/g, '\n') !== wanted.replace(/\r\n/g, '\n')) {
    console.error('gen-hearthfind --check FAILED: 2026-09-08-hearthfind-catalogue.generated.sql '
      + 'is stale. Run: node tools/gen-hearthfind.mjs');
    process.exit(1);
  }
  console.log(`gen-hearthfind --check: catalogue matches src/data/hearthfind.js`);
} else {
  await writeFile(OUT, wanted);
  console.log(`wrote ${OUT}`);
}
