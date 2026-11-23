#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-store-prices.mjs — GENERATE THE STORE'S PRICE TERMS AND THEIR SQL TWIN (lane/econ-followups, backend-architect, 2026-11-22;
//   04-math-strategy.md section 11, 09-crafting.md 4.6; Tyler 2026-11-22: goods are priced by depth).
//
// A store use is priced at the BUYER's store step (src/data/store-kit.js header; src/core/wage.js storeStepOf), so the server needs the
// rule, not a price: every row's step-free terms and the step evaluation. This writes them whole, from the data, with a self-check:
//   hr_store_terms       one row a store row (src/data/supply-basics.js STORE_TERMS -> store-kit.js storeTerms): line, coef (one double,
//                        its shortest round-trip text), amount, per, floor
//   hr_store_grounds     one row a Danger scale ground (src/data/danger.js DANGER_GROUNDS): ref_wage_step, its gearLevel, the absolute
//                        step of its reference depth (src/core/wage.js depthStep says why); ref_step and gap_max stay 1055's
//                        (hr_danger_grounds, hr_danger_rules), read at run time, never copied
//   hr_store_price(basic, step)  store-kit.js storePriceOf: greatest(floor, the formula's whole gold at hr_wage(step)), float8 in the JS's
//                        order, Math.round spelled out; pinned at every row and PIN_STEPS (§3); tests/store-step.mjs holds every step
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-store-prices.mjs            write OUT_NAME
//   node tools/gen-store-prices.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-store-prices.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a row id that is no store id, a row with no terms or terms for no row, a line that is neither meal
// nor charge, a coef that is not a positive finite double or whose text does not parse back to the same bits, a meal with no amount or a
// charge with one, a non-positive `per`, a floor under 1, a scale ground with no whole gearLevel of at least 1, and a price at the last
// step past a safe integer.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1061-store-step-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
/* The steps every row's twin is pinned at: the bottom, the Levels the econ lane measured (46, 60, 63, 70), Muster's held band in the
   wage's unit (1 to 180), every power of two the wage's squaring walks past and the step either side, the last step and past it. */
export const PIN_STEPS = Object.freeze([1, 2, 7, 8, 16, 31, 32, 46, 60, 63, 64, 70, 100, 127, 128, 180, 255, 256, 511, 512, 1024, 2048, 4000, 4001]);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [sb, kit, danger] = await Promise.all([imp('src/data/supply-basics.js'), imp('src/data/store-kit.js'), imp('src/data/danger.js')]);
  return { BASIC_SUPPLIES: sb.BASIC_SUPPLIES, STORE_TERMS: sb.STORE_TERMS, storePriceOf: kit.storePriceOf, DANGER_GROUNDS: danger.DANGER_GROUNDS, stepMax: danger.DANGER.stepMax };
}

const ID = /^[a-z0-9_]{1,64}$/;

/** The resolved rows, grounds and pins of the data, refused on a defect. */
export function rowsOf(data) {
  const problems = [];
  const ids = new Set(data.BASIC_SUPPLIES.map((b) => b.id));
  const termIds = Object.keys(data.STORE_TERMS);
  for (const id of termIds) if (!ids.has(id)) problems.push('terms for ' + id + ', which is no store row');
  const rows = [];
  for (const b of data.BASIC_SUPPLIES) {
    if (!ID.test(b.id)) { problems.push('store row ' + b.id + ' is no id'); continue; }
    const e = Object.prototype.hasOwnProperty.call(data.STORE_TERMS, b.id) ? data.STORE_TERMS[b.id] : null;
    const t = e && e.terms;
    if (!t) { problems.push(b.id + ' has no price terms'); continue; }
    if (t.line !== 'meal' && t.line !== 'charge') problems.push(b.id + ': line ' + t.line + ' is neither meal nor charge');
    if (!(Number.isFinite(t.coef) && t.coef > 0) || Number(String(t.coef)) !== t.coef) problems.push(b.id + ': coef ' + t.coef + ' is no positive double that round-trips');
    if (t.line === 'meal' && !(Number.isInteger(t.amount) && t.amount >= 1)) problems.push(b.id + ': a meal needs a whole amount, got ' + t.amount);
    if (t.line === 'charge' && t.amount !== 0) problems.push(b.id + ': a charge carries no amount, got ' + t.amount);
    if (!(Number.isInteger(t.per) && t.per >= 1)) problems.push(b.id + ': per must be a positive whole number, got ' + t.per);
    if (!(Number.isInteger(t.floor) && t.floor >= 1)) problems.push(b.id + ': the floor must be whole gold of at least 1, got ' + t.floor);
    const top = data.storePriceOf(t, data.stepMax);
    if (!Number.isSafeInteger(top)) problems.push(b.id + ' at step ' + data.stepMax + ' costs ' + top + ', past a safe integer');
    rows.push({ id: b.id, line: t.line, coef: t.coef, amount: t.amount, per: t.per, floor: t.floor, terms: t });
  }
  const grounds = Object.entries(data.DANGER_GROUNDS).map(([hunt, g]) => {
    if (!ID.test(hunt)) problems.push('scale ground ' + hunt + ' is no id');
    if (!(Number.isInteger(g.gearLevel) && g.gearLevel >= 1)) problems.push('scale ground ' + hunt + ' has no whole gearLevel of at least 1 (its reference wage step), got ' + g.gearLevel);
    return { hunt, refWageStep: g.gearLevel };
  }).sort((a, b) => (a.hunt < b.hunt ? -1 : 1));
  if (!rows.length) problems.push('the store holds no row');
  if (problems.length) throw new Error('gen-store-prices: ' + problems.join('; '));
  const pins = [];
  for (const r of rows) for (const s of PIN_STEPS) pins.push({ id: r.id, s, price: data.storePriceOf(r.terms, s) });
  return { rows, grounds, pins };
}

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function buildSql(r) {
  const values = r.rows.map((x) => `  (${sq(x.id)}, ${sq(x.line)}, '${String(x.coef)}'::float8, ${x.amount}, ${x.per}, ${x.floor})`).join(',\n');
  const groundValues = r.grounds.map((g) => `  (${sq(g.hunt)}, ${g.refWageStep})`).join(',\n');
  const pinValues = r.pins.map((p) => `    (${sq(p.id)}, ${p.s}, ${p.price}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE STORE'S PRICE TERMS AND THEIR TWIN  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-store-prices.mjs from src/data/supply-basics.js (STORE_TERMS), src/data/store-kit.js (storeTerms,
--   storePriceOf) and src/data/danger.js (DANGER_GROUNDS). Any hand edit FAILS \`node tools/gen-store-prices.mjs --check\`.
--
-- STATUS: supabase/migration-notes/${OUT_NAME}.json (STAGED until the Coordinator applies it).
-- WHAT (lane/econ-followups, backend-architect, 2026-11-22; 04-math-strategy.md section 11, 09-crafting.md 4.6; Tyler 2026-11-22: goods
-- are priced by depth): the rule a store use is priced by, so the server prices it at the BUYER's store step, never at the row's own.
--   hr_store_terms     ${r.rows.length} rows, one a store row (hr_hunt_basic_supplies' ids), rewritten whole.
--   hr_store_grounds   ${r.grounds.length} row${r.grounds.length === 1 ? '' : 's'} (${r.grounds.map((g) => g.hunt + ' ' + g.refWageStep).join(', ')}): each Danger scale ground's reference wage step.
--   hr_store_price     internal, the twin of store-kit.js storePriceOf: greatest(floor, round(coef x hr_wage(step) [x amount] / per)),
--                      float8 in the JS's order (each operation exactly rounded, the same bits), Math.round as floor plus one at a
--                      fraction of a half or more; pinned at ${r.pins.length} prices (every row at ${PIN_STEPS.length} steps, §3).
-- READERS: 1062-store-step.sql (hr_store_step, the member read, the settle's bill and its gold_out proof, the call series' plan, the
-- settings view's store list). The client reads only the settings view.
-- ORDER: 1061 in its name, after 1055 (hr_danger_grounds, whose rows §3 matches) and 1058's catalogues (hr_wage, hr_hunt_basic_supplies),
-- before 1062-store-step.sql. Idempotent: the tables are made if missing and their rows rewritten whole, the function restated, so a
-- second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added here. Two catalogue tables, RLS on, no policy, no grant to any client role; one internal function revoked
-- from every client role. No value moves in this file.
-- REVERSIBLE: drop the function and the tables (after 1062-store-step.sql's readers are restated without them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: apply 1058-hunting-blocks-catalogue.generated.sql first (hr_wage)'; end if;
  if to_regclass('public.hr_hunt_basic_supplies') is null or to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: apply the hunt-sessions catalogue and 1055-danger-scale-danger-catalogue.generated.sql first'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_store_terms (
  basic_id   text   primary key check (basic_id ~ '^[a-z0-9_]{1,64}$'),
  line       text   not null check (line in ('meal', 'charge')),
  coef       float8 not null check (coef > 0 and coef < 'Infinity'::float8),
  amount     int    not null check (amount >= 0),
  per        int    not null check (per >= 1),
  floor_gold bigint not null check (floor_gold >= 1),
  check ((line = 'meal') = (amount >= 1))
);
alter table public.hr_store_terms enable row level security;
revoke all on public.hr_store_terms from public, anon, authenticated, service_role;
comment on table public.hr_store_terms is '${OUT_NAME}: a store use''s price terms, one row a store row (src/data/supply-basics.js STORE_TERMS through tools/gen-store-prices.mjs); priced by hr_store_price at the buyer''s store step.';

create table if not exists public.hr_store_grounds (
  hunt_id       text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  ref_wage_step int  not null check (ref_wage_step >= 1)
);
alter table public.hr_store_grounds enable row level security;
revoke all on public.hr_store_grounds from public, anon, authenticated, service_role;
comment on table public.hr_store_grounds is '${OUT_NAME}: each Danger scale ground''s reference depth in the wage''s unit (its gearLevel, src/core/wage.js depthStep), the wave-1 bridge from a ground''s own step.';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_store_terms;
insert into public.hr_store_terms (basic_id, line, coef, amount, per, floor_gold) values
${values};
delete from public.hr_store_grounds;
insert into public.hr_store_grounds (hunt_id, ref_wage_step) values
${groundValues};

-- ── §2b THE PRICE'S SQL TWIN (internal) ──────────────────────────────────────
create or replace function public.hr_store_price(p_basic text, p_step int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare t public.hr_store_terms%rowtype; v_share float8; v_x float8; v_f float8;
begin
  -- ONE STORE USE (${OUT_NAME}; src/data/store-kit.js storePriceOf): the row's share of the wage at p_step (hr_wage holds the step to
  -- its range), never under the row's floor; null for no such row. The JS order: share = coef x wage, then (share x amount) / per for
  -- a meal, share / per for a charge; Math.round of a positive x is floor(x), plus one when x - floor(x) (exact in float8) is 0.5 or more.
  select * into t from public.hr_store_terms where basic_id = p_basic;
  if not found then return null; end if;
  v_share := t.coef * public.hr_wage(p_step)::float8;
  v_x := case when t.line = 'meal' then (v_share * t.amount::float8) / t.per::float8 else v_share / t.per::float8 end;
  v_f := floor(v_x);
  if v_x - v_f >= 0.5::float8 then v_f := v_f + 1; end if;
  return greatest(t.floor_gold, v_f::bigint);
end $fn$;
do $mig$
declare v_role text;
begin
  revoke execute on function public.hr_store_price(text, integer) from public, anon, authenticated, service_role;
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function public.hr_store_price(text, integer) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- Every store row has its terms and no terms name a row the store does not sell; every scale ground has its reference wage step; no
-- client role reads a table or runs the twin; the twin answers the JS at every pinned row and step.
do $mig$
declare v_r record; v_p bigint;
begin
  if (select count(*) from public.hr_store_terms) <> ${r.rows.length} then
    raise exception 'VERIFY(a): the catalogue holds % store terms, want ${r.rows.length}', (select count(*) from public.hr_store_terms); end if;
  if exists (select 1 from public.hr_hunt_basic_supplies q where not exists (select 1 from public.hr_store_terms t where t.basic_id = q.basic_id))
     or exists (select 1 from public.hr_store_terms t where not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = t.basic_id)) then
    raise exception 'VERIFY(a): hr_store_terms and hr_hunt_basic_supplies name different rows: regenerate both from src/data/supply-basics.js'; end if;
  if exists (select 1 from public.hr_danger_grounds g where not exists (select 1 from public.hr_store_grounds s where s.hunt_id = g.hunt_id)) then
    raise exception 'VERIFY(b): a Danger scale ground has no reference wage step (hr_store_grounds)'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_store_terms', 'select') or has_table_privilege(g.r, 'public.hr_store_grounds', 'select')
                 or has_function_privilege(g.r, 'public.hr_store_price(text,integer)', 'execute')) then
    raise exception 'VERIFY(c): a client role reads the store''s price terms or runs their twin'; end if;
  for v_r in select * from (values
${pinValues}) p(id, s, price) loop
    v_p := public.hr_store_price(v_r.id, v_r.s);
    if v_p is distinct from v_r.price then
      raise exception 'VERIFY(d): % at step % costs % in SQL, % in src/data/store-kit.js', v_r.id, v_r.s, v_p, v_r.price; end if;
  end loop;
  raise notice 'gen-store-prices: % store terms, % scale ground(s), the twin pinned at % prices; all green', ${r.rows.length}, ${r.grounds.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const terms = Object.fromEntries(Object.entries(base.STORE_TERMS).map(([k, v]) => [k, { step: v.step, terms: { ...v.terms } }]));
    const rows = base.BASIC_SUPPLIES.map((b) => ({ ...b }));
    const grounds = Object.fromEntries(Object.entries(base.DANGER_GROUNDS).map(([k, v]) => [k, { ...v }]));
    const d = { stepMax: base.stepMax };
    patch({ terms, rows, grounds, d });
    try { rowsOf({ ...base, STORE_TERMS: terms, BASIC_SUPPLIES: rows, DANGER_GROUNDS: grounds, stepMax: d.stepMax }); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('a store row with no terms', ({ terms }) => { delete terms.salted_shrimp; });
  plant('terms for no store row', ({ terms }) => { terms.salted_mystery = { step: 1, terms: { ...terms.salted_shrimp.terms } }; });
  plant('a line that is neither meal nor charge', ({ terms }) => { terms.salted_shrimp.terms.line = 'snack'; });
  plant('a coef of no gold', ({ terms }) => { terms.salted_shrimp.terms.coef = 0; });
  plant('a meal with no amount', ({ terms }) => { terms.salted_shrimp.terms.amount = 0; });
  plant('a charge that carries an amount', ({ terms }) => { terms.plain_iron_arrows.terms.amount = 5; });
  plant('a reference rate of zero', ({ terms }) => { terms.salted_shrimp.terms.per = 0; });
  plant('a floor under a whole gold', ({ terms }) => { terms.salted_shrimp.terms.floor = 0; });
  plant('a scale ground with no gearLevel', ({ grounds }) => { const g = Object.keys(grounds)[0]; delete grounds[g].gearLevel; });
  plant('a price past a safe integer at the last step', ({ terms }) => { terms.salted_shark.terms.coef = 1e9; });
  plant('a store row that is no id', ({ rows }) => { rows[0].id = 'Salted Shrimp'; });
  const sql = buildSql(rowsOf(base));
  if (!/VERIFY\(d\)/.test(sql) || !/hr_store_price/.test(sql) || !/VERIFY\(b\)/.test(sql)) bites.push('the twin or the grounds are not checked');
  if (bites.length) { console.error('gen-store-prices --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-store-prices --selftest: 11 refusals bite, the twin and the grounds are checked');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-store-prices --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-store-prices.mjs'); process.exit(1); }
      console.log('gen-store-prices --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
