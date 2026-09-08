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
// ⚠ THE BAND IS ASSERTED THREE TIMES, from ONE constant: here (build failure),
//   in src/core/hearthfind.js (indexHearthfind throws), and in the emitted SQL's
//   own self-check (executed SQL against the rows, not a marker). The migration
//   also holds a CHECK constraint, so a hand-INSERTed out-of-band row is
//   rejected by Postgres even if every generator in the repo were bypassed.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HEARTHFIND_TABLE, HEARTHFIND_ITEMS, HEARTHFIND_SOURCE_KINDS,
  HEARTHFIND_ONE_IN_MIN, HEARTHFIND_ONE_IN_MAX,
} from '../src/data/hearthfind.js';
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
    items.push({ item: id, name: String(it.n ?? id) });
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
    if (!Number.isInteger(r.oneIn) || r.oneIn < HEARTHFIND_ONE_IN_MIN || r.oneIn > HEARTHFIND_ONE_IN_MAX) {
      die(`source ${key} oneIn ${r.oneIn} is outside [${HEARTHFIND_ONE_IN_MIN},${HEARTHFIND_ONE_IN_MAX}]`);
    }
    return { kind: r.kind, id: r.id, item: r.item, oneIn: r.oneIn };
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
  const digest = createHash('sha256')
    .update(JSON.stringify({ items, sources, min: HEARTHFIND_ONE_IN_MIN, max: HEARTHFIND_ONE_IN_MAX }))
    .digest('hex');
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const iVals = items.map((i) => `  (${q(i.item)}, ${q(i.name)})`).join(',\n');
  const sVals = sources.map((s) => `  (${q(s.kind)}, ${q(s.id)}, ${q(s.item)}, ${s.oneIn})`).join(',\n');
  const worst = Math.min(...sources.map((s) => s.oneIn));
  const best = Math.max(...sources.map((s) => s.oneIn));

  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SERVER HEARTHFIND CATALOGUE  (GENERATED — DO NOT EDIT)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Applied by the Coordinator after the
--     Security GO, in apply order: THIS FILE, then 2026-09-08-hearthfind.sql
--     (which fails closed without these tables).
--
--   Generated by tools/gen-hearthfind.mjs from src/data/hearthfind.js +
--   src/data/items.js. Any hand edit is reverted by the next generation and
--   FAILS \`node tools/gen-hearthfind.mjs --check\`.
--
--   hearthfind digest: ${digest}
--   ${nI} trophies · ${nS} sources · odds ${worst} … ${best} (band ${HEARTHFIND_ONE_IN_MIN}–${HEARTHFIND_ONE_IN_MAX})
--
-- Read by hr_apply's hearthfind arm to re-derive the trophy, the source and the
-- odds under the character lock. Numbers and ids only; no client value crosses.
-- Idempotent: delete+insert inside the migration transaction.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is absent — apply 2026-08-11-catalogue.generated.sql first';
  end if;
end $$;

-- ── hr_hearthfind_items: the trophy allowlist ──────────────────────────────
create table if not exists public.hr_hearthfind_items (
  item_id text primary key,
  name    text not null
);

-- ── hr_hearthfind_sources: one row per source, carrying the odds ───────────
-- ⚠ THE CHECK IS THE LAST LINE OF DEFENCE ON THE BAND. The generator refuses an
--   out-of-band row and src/core/hearthfind.js throws on one, but both of those
--   are JavaScript. This constraint is Postgres refusing to STORE the number,
--   so even a hand-typed INSERT by an operator cannot make a find common.
create table if not exists public.hr_hearthfind_sources (
  source_kind text   not null check (source_kind in ('monster','node')),
  source_id   text   not null,
  item_id     text   not null references public.hr_hearthfind_items(item_id) on delete cascade,
  one_in      bigint not null check (one_in >= ${HEARTHFIND_ONE_IN_MIN} and one_in <= ${HEARTHFIND_ONE_IN_MAX}),
  primary key (source_kind, source_id)
);

-- Engine-only reads, exactly like the dungeon catalogue: the client already has
-- these numbers (it authored them — src/data/hearthfind.js is what the reveal
-- renders from), so exposing the table would be a second copy of a rate with no
-- reader. RLS on, and every client grant revoked.
alter table public.hr_hearthfind_items   enable row level security;
alter table public.hr_hearthfind_sources enable row level security;
do $$
begin
  revoke all on public.hr_hearthfind_items   from public, anon, authenticated, service_role;
  revoke all on public.hr_hearthfind_sources from public, anon, authenticated, service_role;
end $$;

delete from public.hr_hearthfind_sources;
delete from public.hr_hearthfind_items;
insert into public.hr_hearthfind_items (item_id, name) values
${iVals};
insert into public.hr_hearthfind_sources (source_kind, source_id, item_id, one_in) values
${sVals};

-- ── Self-verification ──────────────────────────────────────────────────────
do $$
declare v_i int; v_s int; v_bad int;
begin
  select count(*) into v_i from public.hr_hearthfind_items;
  if v_i <> ${nI} then raise exception 'hr_hearthfind_items has % rows, expected ${nI}', v_i; end if;
  select count(*) into v_s from public.hr_hearthfind_sources;
  if v_s <> ${nS} then raise exception 'hr_hearthfind_sources has % rows, expected ${nS}', v_s; end if;

  -- (a) THE BAND, asserted against the stored rows and not merely constrained.
  select count(*) into v_bad from public.hr_hearthfind_sources
   where one_in < ${HEARTHFIND_ONE_IN_MIN} or one_in > ${HEARTHFIND_ONE_IN_MAX};
  if v_bad > 0 then
    raise exception '% hearthfind sources are outside the ${HEARTHFIND_ONE_IN_MIN}-${HEARTHFIND_ONE_IN_MAX} band', v_bad;
  end if;

  -- (b) Every trophy is a real, untradeable, worthless-to-a-vendor item in the
  --     MAIN catalogue. This is the cross-catalogue join the JS generator
  --     cannot make: it proves the two generated files agree on the database.
  select count(*) into v_bad from public.hr_hearthfind_items h
   where not exists (select 1 from public.hr_items i where i.item_id = h.item_id);
  if v_bad > 0 then raise exception '% hearthfind trophies are not in hr_items', v_bad; end if;
  select count(*) into v_bad from public.hr_hearthfind_items h
    join public.hr_items i on i.item_id = h.item_id
   where i.tradeable or i.value <> 0;
  if v_bad > 0 then
    raise exception '% hearthfind trophies are tradeable or vendorable — a find would mint gold or reach the market', v_bad;
  end if;

  -- (c) Every trophy is actually reachable, and every source pays a real one.
  select count(*) into v_bad from public.hr_hearthfind_items h
   where not exists (select 1 from public.hr_hearthfind_sources s where s.item_id = h.item_id);
  if v_bad > 0 then raise exception '% hearthfind trophies have no source — the allowlist would accept an unfindable item', v_bad; end if;

  -- (d) No client write policy, and no client grant of any kind.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename in ('hr_hearthfind_items','hr_hearthfind_sources');
  if v_bad > 0 then raise exception '% policies on the hearthfind catalogue — it is engine-only', v_bad; end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('hr_hearthfind_items','hr_hearthfind_sources')
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
