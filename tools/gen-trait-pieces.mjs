#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-trait-pieces.mjs — GENERATE THE SERVER'S TRAIT-PIECE CATALOGUE (lane/t1-traits-drop, backend-architect, 2026-11-26;
// docs/design/redesign/12-targets.md 3.3 / 8 / 8.1, 14-trait-candidates.md, 20-v030-the-roads.md T1).
//
// src/data is the one source of every Trait, every ground's rank ceiling and base, and the depth a step reads (src/data/traits.js through
// gear-steps.js, src/data/danger.js DANGER_GROUNDS, src/core/bands.js depthAt through src/core/drop-rate.js depthOf, traitBasesOf,
// src/data/signatures.js). The engine rolls a piece from them (src/core/trait-roll.js); the server re-proves every piece the settle proposes
// against these tables (1071-trait-pieces.sql hr_trait_pieces_land), so no number is typed twice:
//   hr_piece_rules       one row: ranks, rank_depths (GEAR_STEPS.rankDepths), the Traits a rarity carries (traitsByRarity), the banned
//                        Very Rare pairs (veryRareBanned, ids sorted and joined by '+'), depths (DEPTHS), found_max (the most pieces one
//                        member's window may land, a fuse under the kill bound: FOUND_MAX below)
//   hr_piece_traits            every Trait: n, slot, key, source (its home ground), scope
//   hr_piece_fixed       a named piece that always carries a Trait (traits.js fixedOn): item, Trait, rank
//   hr_piece_grounds     every OPEN ground of the scale: max_rank (GEAR_STEPS maxRankAt through DANGER_GROUNDS maxRank), gear_level
//   hr_piece_depths      every such ground that rolls a rank: the first step of each depth 1..DEPTHS (depthOf, monotone, checked here)
//   hr_piece_bases       every such ground's bases by Trait slot (drop-rate.js traitBasesOf at its gearLevel)
//   hr_piece_signatures  every Signature: its equip slot (the worn projection names only a known one)
//   hr_piece_depth_of(hunt, step), hr_piece_top_rank(hunt, depth)   internal twins, pinned in the self-check at every ground's floor,
//                        reference and top steps and at each depth's first step
// A staged ground (the Catacombs' wings) is judged and left out, as tools/gen-danger.mjs leaves it: the server opens only open grounds.
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-trait-pieces.mjs            write OUT_NAME
//   node tools/gen-trait-pieces.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-trait-pieces.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a Trait with no slot of GEAR_STEPS.traitSlots, a key or id not [a-z0-9_], two Traits of one number;
// a fixed Trait on an item that is no item or of another slot, or a rank outside 1..ranks; a ground whose depth is not monotone in its
// step or whose band does not read 1 to DEPTHS; a rank ceiling past the ranks; a ground that rolls a rank with no base in a cell it rolls;
// a base that is no item; a banned pair that is not two Traits of one slot.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1071-trait-pieces-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/* THE FUSE (a server safety clamp, not a balance number): the most pieces one member's settle window may land. A window's own bound is its
   kills (one piece a kill a hero, src/core/trait-roll.js rollKillFor); this caps a window whose kill bound is wide (a long catch-up slice) */
export const FOUND_MAX = 32;

async function load(root) {
  const v = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + v);
  const [gs, danger, grounds, items, dr, sig] = await Promise.all([imp('src/data/gear-steps.js'), imp('src/data/danger.js'),
    imp('src/data/hunt-grounds.js'), imp('src/data/items.js'), imp('src/core/drop-rate.js'), imp('src/data/signatures.js')]);
  return { gs, danger, grounds, items, dr, sig };
}

/** The resolved rows of the data, refused on a defect. */
export function rowsOf({ gs, danger, grounds, items, dr, sig }) {
  const { GEAR_STEPS, TRAITS } = gs;
  const { DANGER, DANGER_GROUNDS, DEPTHS } = danger;
  const ITEMS = items.ITEMS;
  const ranks = GEAR_STEPS.traitSteps.length;
  const slots = GEAR_STEPS.traitSlots;
  const traits = [], fixed = [], seenN = new Set();
  for (const id of Object.keys(TRAITS).sort()) {
    const t = TRAITS[id];
    if (!ID.test(id) || !ID.test(String(t.key)) || !ID.test(String(t.source))) throw new Error('gen-trait-pieces: Trait ' + id + ' id, key or source is not [a-z0-9_]');
    if (!own(slots, t.slot)) throw new Error('gen-trait-pieces: Trait ' + id + ' slot ' + t.slot + ' is no Trait slot');
    if (!Number.isInteger(t.n) || seenN.has(t.n)) throw new Error('gen-trait-pieces: Trait ' + id + ' number ' + t.n + ' is not a unique whole number');
    seenN.add(t.n);
    if (!['self', 'party'].includes(t.scope)) throw new Error('gen-trait-pieces: Trait ' + id + ' scope ' + t.scope);
    traits.push({ id, n: t.n, slot: t.slot, key: t.key, source: t.source, scope: t.scope });
    for (const [item, rank] of Object.entries(t.fixedOn || {})) {
      const it = ITEMS[item];
      if (!it || dr.traitSlotOf(it.slot, slots) !== t.slot) throw new Error('gen-trait-pieces: Trait ' + id + ' is fixed on ' + item + ', no ' + t.slot + ' item');
      if (!Number.isInteger(rank) || rank < 1 || rank > ranks) throw new Error('gen-trait-pieces: Trait ' + id + ' fixed at rank ' + rank);
      fixed.push({ item, id, rank });
    }
  }
  fixed.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : a.id < b.id ? -1 : 1));
  const banned = [...GEAR_STEPS.veryRareBanned].sort();
  for (const pair of banned) {
    const [a, b] = String(pair).split('+');
    if (!own(TRAITS, a) || !own(TRAITS, b) || a >= b || TRAITS[a].slot !== TRAITS[b].slot) throw new Error('gen-trait-pieces: banned pair ' + pair + ' is not two sorted Traits of one slot');
  }
  const depths = GEAR_STEPS.rankDepths;
  if (depths.length !== ranks || depths.some((d, i) => !Number.isInteger(d) || d < 1 || d > DEPTHS || (i && d <= depths[i - 1]))) throw new Error('gen-trait-pieces: rankDepths ' + depths.join('/') + ' are not rising depths, one a rank');
  const rules = { ranks, rankDepths: depths, rare: GEAR_STEPS.traitsByRarity.rare, veryRare: GEAR_STEPS.traitsByRarity.very_rare, banned, depths: DEPTHS, foundMax: FOUND_MAX };
  if (rules.rare !== 1 || rules.veryRare !== 2) throw new Error('gen-trait-pieces: a Rare carries ' + rules.rare + ' and a Very Rare ' + rules.veryRare + ' Traits (the table holds 1 and 2)');
  const ground = [], depthRows = [], bases = [], pins = [];
  for (const id of Object.keys(DANGER_GROUNDS).sort()) {
    const g = grounds.HUNT_GROUNDS[id], row = DANGER_GROUNDS[id];
    if (!g || g.hunt !== id) throw new Error('gen-trait-pieces: ' + id + ' is no hunting ground whose hunt is its id');
    const maxRank = row.maxRank, gearLevel = row.gearLevel;
    if (!Number.isInteger(maxRank) || maxRank < 0 || maxRank > ranks) throw new Error('gen-trait-pieces: ' + id + ' maxRank ' + maxRank);
    if (!Number.isInteger(gearLevel) || gearLevel < 0) throw new Error('gen-trait-pieces: ' + id + ' gearLevel ' + gearLevel);
    /* the depth a step reads: monotone, 1 at step 0 or under the floor, DEPTHS at the top */
    const first = new Array(DEPTHS + 1).fill(null);
    let prev = 0;
    for (let s = 0; s <= DANGER.stepMax; s++) {
      const d = dr.depthOf(id, s);
      if (!Number.isInteger(d) || d < 1 || d > DEPTHS || d < prev) throw new Error('gen-trait-pieces: ' + id + ' step ' + s + ' reads depth ' + d + ' after ' + prev + ' (not monotone)');
      if (first[d] === null) first[d] = s;
      prev = d;
    }
    if (first[1] !== 0 || dr.depthOf(id, row.topStep) !== DEPTHS) throw new Error('gen-trait-pieces: ' + id + ' does not read depth 1 from step 0 and ' + DEPTHS + ' at its top');
    const open = grounds.OPEN_GROUNDS ? own(grounds.OPEN_GROUNDS, id) : true;
    if (!open) continue;
    ground.push({ id, maxRank, gearLevel });
    if (maxRank < 1) continue;
    for (let d = 1; d <= DEPTHS; d++) if (first[d] !== null) depthRows.push({ id, d, from: first[d] });
    const b = dr.traitBasesOf(g, slots, gearLevel);
    for (const s of Object.keys(b)) for (const item of b[s]) {
      if (!own(ITEMS, item)) throw new Error('gen-trait-pieces: ' + id + ' base ' + item + ' is no item');
      bases.push({ id, slot: s, item });
    }
    /* every cell this ground rolls (a slot it drops holding a Trait it homes) has a base */
    for (const t of traits) if (t.source === id && dr.traitSlotsDropped(g, slots).includes(t.slot) && !(b[t.slot] || []).length) throw new Error('gen-trait-pieces: ' + id + ' rolls ' + t.id + ' with no ' + t.slot + ' base');
    for (const s of [0, row.floorStep, row.refStep, row.topStep, row.topStep + 1, ...first.filter((x) => x !== null)]) {
      const d = dr.depthOf(id, s);
      let top = 0;
      depths.forEach((dd, i) => { if (d >= dd && i + 1 <= maxRank) top = i + 1; });
      pins.push({ id, step: s, depth: d, top });
    }
  }
  const signatures = Object.keys(sig.SIGNATURES).sort().map((id) => {
    const s = sig.SIGNATURES[id];
    if (!ID.test(id) || !ID.test(String(s.slot))) throw new Error('gen-trait-pieces: Signature ' + id + ' id or slot is not [a-z0-9_]');
    return { id, slot: s.slot };
  });
  const seenPin = new Set();
  return { rules, traits, fixed, ground, depthRows, bases, signatures, pins: pins.filter((p) => { const k = p.id + ':' + p.step; if (seenPin.has(k)) return false; seenPin.add(k); return true; }) };
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const chunk = (rows, n = 8) => { const out = []; for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n).join(', ')); return out.join(',\n  '); };

export function buildSql(r) {
  const R = r.rules;
  const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE TRAIT-PIECE CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-trait-pieces.mjs from src/data/traits.js (through gear-steps.js), src/data/danger.js DANGER_GROUNDS, src/core/
--   drop-rate.js (depthOf, traitBasesOf) and src/data/signatures.js. Any hand edit FAILS \`node tools/gen-trait-pieces.mjs --check\`.
--
-- WHAT (lane/t1-traits-drop, backend-architect, 2026-11-26; 12-targets.md 3.3 / 8 / 8.1): the numbers 1071-trait-pieces.sql re-proves a
-- found piece against, so none is typed twice: hr_piece_rules (one row), hr_piece_traits (${r.traits.length}), hr_piece_fixed (${r.fixed.length}), hr_piece_grounds (${r.ground.length}),
-- hr_piece_depths (${r.depthRows.length}), hr_piece_bases (${r.bases.length}), hr_piece_signatures (${r.signatures.length}), rewritten whole; hr_piece_depth_of(hunt, step) and
-- hr_piece_top_rank(hunt, depth), internal (no client grant), the twins of drop-rate.js depthOf and trait-roll.js rankRoll's ceiling, pinned
-- at ${r.pins.length} points (§3). A staged ground (the Catacombs' wings) is judged by the generator and left out until it opens.
-- ORDER: ${OUT_NAME.slice(0, 4)} in its name, before 1071-trait-pieces.sql (its reader). Idempotent: the tables are made if missing and their rows
-- rewritten whole, the functions restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. Catalogue tables, RLS on, no policy, no grant to any client role; two internal functions revoked from every
-- client role. No value moves here. ON THE PRE-EA SECURITY LIST as the bounds of N-13 (what a found piece may be).
-- REVERSIBLE: drop the two functions and the seven tables (after 1071-trait-pieces.sql's readers are gone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_grounds') is null or to_regclass('public.hr_items') is null then
    raise exception 'PRECONDITION: the hunt-sessions and items catalogues first (hr_hunt_grounds, hr_items)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_piece_rules (
  id               boolean primary key default true check (id),
  ranks            int    not null check (ranks between 1 and 9),
  rank_depths      int[]  not null,
  rare_traits      int    not null check (rare_traits = 1),
  very_rare_traits int    not null check (very_rare_traits = 2),
  very_rare_banned text[] not null default '{}',
  depths           int    not null check (depths >= 1),
  found_max        int    not null check (found_max >= 1),
  check (array_length(rank_depths, 1) = ranks)
);
create table if not exists public.hr_piece_traits (
  trait_id text primary key check (trait_id ~ '^[a-z0-9_]{1,64}$'),
  n        int  not null unique check (n >= 1),
  slot     text not null check (slot ~ '^[a-z0-9_]{1,32}$'),
  key      text not null check (key ~ '^[a-z0-9_]{1,64}$'),
  source   text not null check (source ~ '^[a-z0-9_]{1,64}$'),
  scope    text not null check (scope in ('self', 'party'))
);
create table if not exists public.hr_piece_fixed (
  item_id  text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  trait_id text not null references public.hr_piece_traits (trait_id),
  rank     int  not null check (rank >= 1),
  primary key (item_id, trait_id)
);
create table if not exists public.hr_piece_grounds (
  hunt_id    text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  max_rank   int  not null check (max_rank >= 0),
  gear_level int  not null check (gear_level >= 0)
);
create table if not exists public.hr_piece_depths (
  hunt_id   text not null references public.hr_piece_grounds (hunt_id),
  depth     int  not null check (depth >= 1),
  step_from int  not null check (step_from >= 0),
  primary key (hunt_id, depth)
);
create table if not exists public.hr_piece_bases (
  hunt_id text not null references public.hr_piece_grounds (hunt_id),
  slot    text not null check (slot ~ '^[a-z0-9_]{1,32}$'),
  item_id text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  primary key (hunt_id, slot, item_id)
);
create table if not exists public.hr_piece_signatures (
  signature_id text primary key check (signature_id ~ '^[a-z0-9_]{1,64}$'),
  slot         text not null check (slot ~ '^[a-z0-9_]{1,32}$')
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_piece_rules', 'hr_piece_traits', 'hr_piece_fixed', 'hr_piece_grounds', 'hr_piece_depths', 'hr_piece_bases', 'hr_piece_signatures'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;
comment on table public.hr_piece_rules is '${OUT_NAME}: the Trait roll''s rules (src/data/gear-steps.js through tools/gen-trait-pieces.mjs). One row.';
comment on table public.hr_piece_traits is '${OUT_NAME}: every Trait (src/data/traits.js): its slot, stacking key, home ground and scope.';
comment on table public.hr_piece_grounds is '${OUT_NAME}: every open ground of the Danger scale: the highest Trait rank it rolls and the item Level of its base.';
comment on table public.hr_piece_depths is '${OUT_NAME}: the first step of each depth on a ground that rolls a rank (src/core/drop-rate.js depthOf).';
comment on table public.hr_piece_bases is '${OUT_NAME}: the pieces a ground drops in each Trait slot at its base item Level (src/core/drop-rate.js traitBasesOf).';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_piece_rules;
insert into public.hr_piece_rules (id, ranks, rank_depths, rare_traits, very_rare_traits, very_rare_banned, depths, found_max) values
  (true, ${R.ranks}, array[${R.rankDepths.join(', ')}]::int[], ${R.rare}, ${R.veryRare}, ${arr(R.banned)}, ${R.depths}, ${R.foundMax});
delete from public.hr_piece_fixed;
delete from public.hr_piece_traits;
insert into public.hr_piece_traits (trait_id, n, slot, key, source, scope) values
  ${r.traits.map((t) => `(${q(t.id)}, ${t.n}, ${q(t.slot)}, ${q(t.key)}, ${q(t.source)}, ${q(t.scope)})`).join(',\n  ')};
${r.fixed.length ? `insert into public.hr_piece_fixed (item_id, trait_id, rank) values
  ${r.fixed.map((f) => `(${q(f.item)}, ${q(f.id)}, ${f.rank})`).join(',\n  ')};` : '-- (no fixed Traits)'}
delete from public.hr_piece_bases;
delete from public.hr_piece_depths;
delete from public.hr_piece_grounds;
insert into public.hr_piece_grounds (hunt_id, max_rank, gear_level) values
  ${r.ground.map((g) => `(${q(g.id)}, ${g.maxRank}, ${g.gearLevel})`).join(',\n  ')};
${r.depthRows.length ? `insert into public.hr_piece_depths (hunt_id, depth, step_from) values
  ${chunk(r.depthRows.map((d) => `(${q(d.id)}, ${d.d}, ${d.from})`), 5)};` : '-- (no ground rolls a rank)'}
${r.bases.length ? `insert into public.hr_piece_bases (hunt_id, slot, item_id) values
  ${chunk(r.bases.map((b) => `(${q(b.id)}, ${q(b.slot)}, ${q(b.item)})`), 3)};` : '-- (no bases)'}
delete from public.hr_piece_signatures;
${r.signatures.length ? `insert into public.hr_piece_signatures (signature_id, slot) values
  ${r.signatures.map((s) => `(${q(s.id)}, ${q(s.slot)})`).join(',\n  ')};` : '-- (no Signatures)'}

-- ── §2b THE TWINS (internal) ─────────────────────────────────────────────────
create or replace function public.hr_piece_depth_of(p_hunt text, p_step int)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  -- TRAIT-PIECES (${OUT_NAME}): src/core/drop-rate.js depthOf, the depth step p_step reads on p_hunt (null where it rolls no rank).
  select max(d.depth) from public.hr_piece_depths d where d.hunt_id = p_hunt and d.step_from <= greatest(p_step, 0)
$fn$;
create or replace function public.hr_piece_top_rank(p_hunt text, p_depth int)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  -- TRAIT-PIECES (${OUT_NAME}): the top rank open at depth p_depth on p_hunt (src/core/trait-roll.js rankRoll's ceiling: rankDepths, held to
  -- the ground's max_rank); 0 where none is.
  select coalesce(max(i), 0)::int from public.hr_piece_grounds g cross join public.hr_piece_rules r
   cross join lateral generate_subscripts(r.rank_depths, 1) i
   where g.hunt_id = p_hunt and r.id and i <= g.max_rank and coalesce(p_depth, 0) >= r.rank_depths[i]
$fn$;
revoke execute on function public.hr_piece_depth_of(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_piece_top_rank(text, int) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ─────────────────────────────────────────────
do $mig$
declare v_r record;
begin
  if (select count(*) from public.hr_piece_rules) <> 1 or (select count(*) from public.hr_piece_traits) <> ${r.traits.length}
     or (select count(*) from public.hr_piece_grounds) <> ${r.ground.length} or (select count(*) from public.hr_piece_depths) <> ${r.depthRows.length}
     or (select count(*) from public.hr_piece_bases) <> ${r.bases.length} or (select count(*) from public.hr_piece_fixed) <> ${r.fixed.length}
     or (select count(*) from public.hr_piece_signatures) <> ${r.signatures.length} then
    raise exception 'VERIFY(a): the catalogue holds the wrong counts'; end if;
  if exists (select 1 from public.hr_piece_grounds t where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id)) then
    raise exception 'VERIFY(a): a Trait ground is no hunt ground'; end if;
  if exists (select 1 from public.hr_piece_bases b where not exists (select 1 from public.hr_items i where i.item_id = b.item_id))
     or exists (select 1 from public.hr_piece_fixed f where not exists (select 1 from public.hr_items i where i.item_id = f.item_id)) then
    raise exception 'VERIFY(a): a base or a fixed piece is no item'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_piece_traits', 'select') or has_table_privilege(g.r, 'public.hr_piece_bases', 'select')
                 or has_table_privilege(g.r, 'public.hr_piece_grounds', 'select') or has_table_privilege(g.r, 'public.hr_piece_rules', 'select')
                 or has_function_privilege(g.r, 'public.hr_piece_depth_of(text,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_piece_top_rank(text,integer)', 'execute')) then
    raise exception 'VERIFY(b): a client role reads the Trait catalogue'; end if;
  for v_r in select * from (values
    ${chunk(r.pins.map((p) => `(${q(p.id)}, ${p.step}, ${p.depth}, ${p.top})`), 4)}) p(hunt, step, depth, top) loop
    if public.hr_piece_depth_of(v_r.hunt, v_r.step) is distinct from v_r.depth then
      raise exception 'VERIFY(c): % step % reads depth % in SQL, % in the engine', v_r.hunt, v_r.step, public.hr_piece_depth_of(v_r.hunt, v_r.step), v_r.depth; end if;
    if public.hr_piece_top_rank(v_r.hunt, v_r.depth) is distinct from v_r.top then
      raise exception 'VERIFY(c): % depth % opens rank % in SQL, % in the engine', v_r.hunt, v_r.depth, public.hr_piece_top_rank(v_r.hunt, v_r.depth), v_r.top; end if;
  end loop;
  raise notice 'gen-trait-pieces: % Traits, % ground(s), % bases, the twins pinned at % points; all green', ${r.traits.length}, ${r.ground.length}, ${r.bases.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const tryRows = (name, patch) => {
    const m = patch(base);
    try { rowsOf({ ...base, ...m }); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  const T = base.gs.TRAITS, G = base.gs.GEAR_STEPS;
  const gsWith = (traits, gear) => ({ gs: { ...base.gs, TRAITS: traits || T, GEAR_STEPS: gear || G } });
  tryRows('a Trait in no Trait slot', () => gsWith({ ...T, file_breaker: { ...T.file_breaker, slot: 'tail' } }));
  tryRows('two Traits of one number', () => gsWith({ ...T, soft_scale: { ...T.soft_scale, n: T.file_breaker.n } }));
  tryRows('a key that is not an id', () => gsWith({ ...T, file_breaker: { ...T.file_breaker, key: 'Crowd!' } }));
  tryRows('a fixed Trait on no item', () => gsWith({ ...T, captains_due: { ...T.captains_due, fixedOn: { no_such_item: 1 } } }));
  tryRows('a fixed Trait on another slot', () => gsWith({ ...T, captains_due: { ...T.captains_due, fixedOn: { mithril_sword: 1 } } }));
  tryRows('a fixed rank past the ranks', () => gsWith({ ...T, captains_due: { ...T.captains_due, fixedOn: { barrowking_mantle: 4 } } }));
  tryRows('a banned pair of two slots', () => gsWith(null, { ...G, veryRareBanned: ['file_breaker+last_file'] }));
  tryRows('rank depths that do not rise', () => gsWith(null, { ...G, rankDepths: [1, 15, 8] }));
  tryRows('a Very Rare of three Traits', () => gsWith(null, { ...G, traitsByRarity: { rare: 1, very_rare: 3 } }));
  const DG = base.danger.DANGER_GROUNDS;
  tryRows('a rank ceiling past the ranks', () => ({ danger: { ...base.danger, DANGER_GROUNDS: { ...DG, muster_barrows: { ...DG.muster_barrows, maxRank: 4 } } } }));
  tryRows('a depth that falls as the step climbs', () => ({ dr: { ...base.dr, depthOf: (id, s) => (s === 700 ? 1 : base.dr.depthOf(id, s)) } }));
  tryRows('a cell with no base', () => ({ dr: { ...base.dr, traitBasesOf: () => ({}) } }));
  tryRows('a base that is no item', () => ({ dr: { ...base.dr, traitBasesOf: (...a) => ({ ...base.dr.traitBasesOf(...a), weapon: ['no_such_sword'] }) } }));
  /* a staged ground is judged, never served */
  { const r = rowsOf(base); if (r.ground.some((g) => g.id.startsWith('catacomb_'))) bites.push('a staged ground was written to the catalogue'); }
  /* the twins are pinned (the file's self-check) at every rank ground's depth edges */
  { const r = rowsOf(base); if (!r.pins.some((p) => p.top >= 2) || !r.pins.some((p) => p.top === 1)) bites.push('the twins are not pinned where a rank opens'); }
  if (bites.length) { console.error('gen-trait-pieces --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-trait-pieces --selftest: 13 refusals bite, a staged ground stays out, the twins pinned where ranks open');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-trait-pieces --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-trait-pieces.mjs'); process.exit(1); }
      console.log('gen-trait-pieces --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
