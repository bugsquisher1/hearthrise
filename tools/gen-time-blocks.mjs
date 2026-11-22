#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-time-blocks.mjs — GENERATE THE SERVER'S WAGE AND BOUGHT-TIME CATALOGUE (lane/r8-hunting-day; the wage, lane/w-wage
//   2026-11-22; 04-math-strategy.md section 11).
//
// src/core/wage.js is the one rule (wage(step) and the block price) and src/data/wage.js and src/data/time-blocks.js its numbers (the
// wage's two levers; a block's minutes, the day's cap, the growth and the price an hour, one row a kind). The server reads this catalogue
// when it quotes and sells a block (1058-hunting-blocks.sql hr_time_quote, hr_time_buy), and every later price in hours of wage reads
// hr_wage. This writes it whole, with the SQL twins and a self-check:
//   hr_wage(step)                     wage.js wage: whole gold one reference hunted hero-hour pays at a step (its levers inline)
//   hr_time_blocks                    per kind: block_min, per_day, growth_num, growth_den, price_hour_pm
//   hr_time_block_price(kind, L, n)   wage.js blockPrice: the gold block n of the day costs a hero of Level L (null past the cap)
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
// OUT_NAME has never been applied (its sidecar says STAGED), so it is this generator's one forward file and the wage lands in it (the
// house rule: ONE forward file per generator after the newest APPLIED, never-applied cuts collapsed into it).
//
//   node tools/gen-time-blocks.mjs            write OUT_NAME
//   node tools/gen-time-blocks.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-time-blocks.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a table time-blocks.js validate() refuses (a non-positive number, a later block cheaper than the
// one before it, a block hour no dearer than an hour of wage, a ruled number moved, a kind no verb sells), a wage whose levers are not
// a positive whole base and a step in (0, 0.05), a price at the last step past a safe integer, and an empty table.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1058-hunting-blocks-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
/* the steps the wage's twin is pinned at: R4's Levels, the 20-400 checkpoints, every power of two the squaring walks past (and the step
   either side), the last step and past it (held there) */
export const WAGE_PINS = Object.freeze([1, 2, 3, 7, 8, 15, 16, 20, 31, 32, 45, 60, 63, 64, 70, 88, 100, 127, 128, 145, 185, 200, 255, 256,
  300, 400, 511, 512, 1000, 1023, 1024, 2000, 2047, 2048, 3000, 3999, 4000, 4001, 10000]);
/* the Levels the block price's twin is pinned at, each at every block of the day and the first one past it */
export const PIN_LEVELS = Object.freeze([1, 10, 20, 50, 60, 63, 70, 200, 300, 400, 2000, 4000]);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [blocks, wageData, danger, core] = await Promise.all([imp('src/data/time-blocks.js'), imp('src/data/wage.js'), imp('src/data/danger.js'), imp('src/core/wage.js')]);
  return { TIME_BLOCKS: blocks.TIME_BLOCKS, validate: blocks.validate, WAGE: wageData.WAGE, stepMax: danger.DANGER.stepMax, wage: core.wage, blockPriceOf: core.blockPriceOf };
}

/** The resolved rows and pins of the data, refused on a defect. */
export function rowsOf(data) {
  const problems = data.validate();
  const W = data.WAGE;
  if (!W || !Number.isSafeInteger(W.wageBase) || W.wageBase < 1) problems.push('WAGE.wageBase must be a positive whole number of gold, got ' + (W && W.wageBase));
  if (!W || !Number.isFinite(W.payStepCoin) || !(W.payStepCoin > 0) || !(W.payStepCoin < 0.05)) problems.push('WAGE.payStepCoin must lie in (0, 0.05), got ' + (W && W.payStepCoin));
  if (!Number.isInteger(data.stepMax) || data.stepMax < 1) problems.push('DANGER.stepMax must be a positive whole step, got ' + data.stepMax);
  if (problems.length) throw new Error('gen-time-blocks: ' + problems.join('; '));
  const kinds = Object.keys(data.TIME_BLOCKS).sort();
  if (!kinds.length) throw new Error('gen-time-blocks: the table holds no kind');
  const rows = kinds.map((kind) => {
    const R = data.TIME_BLOCKS[kind];
    if (!/^[a-z]{1,16}$/.test(kind)) throw new Error('gen-time-blocks: kind ' + kind + ' is not a lower-case word');
    /* the dearest block there can be (the last of the day at the last step), bounded from the levers themselves, stays a safe integer:
       hr_time_buy's bigint and the client's number agree to the gold */
    const top = W.wageBase * (1 + W.payStepCoin) ** data.stepMax * (R.blockMin / 60) * (R.priceHourPm / 1000) * (R.growthNum / R.growthDen) ** (R.perDay - 1);
    if (!(top < Number.MAX_SAFE_INTEGER)) throw new Error('gen-time-blocks: ' + kind + ' block ' + R.perDay + ' at step ' + data.stepMax + ' costs about ' + top + ', past a safe integer');
    return { kind, blockMin: R.blockMin, perDay: R.perDay, growthNum: R.growthNum, growthDen: R.growthDen, priceHourPm: R.priceHourPm };
  });
  const wagePins = WAGE_PINS.map((s) => ({ s, w: data.wage(s) }));
  const pins = [];
  for (const r of rows) {
    for (const L of PIN_LEVELS) for (let n = 1; n <= r.perDay + 1; n++) pins.push({ kind: r.kind, L, n, price: data.blockPriceOf(data.TIME_BLOCKS[r.kind], L, n) });
  }
  return { rows, pins, wagePins, wage: { base: W.wageBase, step: W.payStepCoin, stepMax: data.stepMax } };
}

export function buildSql(r) {
  const values = r.rows.map((x) => `  ('${x.kind}', ${x.blockMin}, ${x.perDay}, ${x.growthNum}, ${x.growthDen}, ${x.priceHourPm})`).join(',\n');
  const pinValues = r.pins.map((p) => `    ('${p.kind}', ${p.L}, ${p.n}, ${p.price === null ? 'null' : p.price}::bigint)`).join(',\n');
  const wageValues = r.wagePins.map((p) => `    (${p.s}, ${p.w}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE WAGE AND THE BOUGHT-TIME CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-time-blocks.mjs from src/core/wage.js (wage, blockPrice), src/data/wage.js (WAGE) and
--   src/data/time-blocks.js (TIME_BLOCKS). Any hand edit FAILS \`node tools/gen-time-blocks.mjs --check\`.
--
-- WHAT (lane/r8-hunting-day, backend-architect, 2026-11-22; the wage, lane/w-wage, the same day; Tyler's rulings of 2026-11-22,
-- 04-math-strategy.md section 11): the rule the server reads, so no number is typed twice.
--   hr_wage(step)        internal, the twin of wage.js wage: floor(${r.wage.base} x (1 + ${r.wage.step}) ^ step), step held to [1, ${r.wage.stepMax}],
--                        the power walked by squaring in float8 exactly as the JS walks it, pinned at ${r.wagePins.length} steps (§3).
--   hr_time_blocks       ${r.rows.length} row${r.rows.length === 1 ? '' : 's'} (${r.rows.map((x) => x.kind).join(', ')}), rewritten whole.
--   hr_time_block_price  internal, the twin of wage.js blockPrice: ceil(block_min / 60 x price_hour_pm / 1000 x hr_wage(Level) x
--                        (growth_num / growth_den) ^ (n - 1)) in exact numeric, pinned at Levels ${PIN_LEVELS.join(', ')} for every block of
--                        the day and the first one past it (§3).
-- READERS: 1058-hunting-blocks.sql's quote (hr_time_quote), the \`time_blocks\` section and the verb hr_time_buy; every later price in
-- hours of wage (13-market.md V, Talent resets, Temper) reads hr_wage. The client reads only the section.
-- ORDER: 1058 in its name, before 1058-hunting-blocks.sql (which reads this table and the price). Idempotent: the table is made if missing
-- and its rows rewritten whole, the functions restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. A catalogue table, RLS on, no policy, no grant to any client role; two internal functions revoked from
-- every client role. No value moves here.
-- REVERSIBLE: drop the functions and the table (after 1058-hunting-blocks.sql's readers are gone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: the ledger first (player_ledger)'; end if;
end $mig$;

-- ── §1 THE WAGE'S SQL TWIN (internal) ────────────────────────────────────────
create or replace function public.hr_wage(p_step int)
returns bigint language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  v_k int := least(${r.wage.stepMax}, greatest(1, coalesce(p_step, 1)));
  v_b float8 := 1::float8 + '${r.wage.step}'::float8;
  v_out float8 := 1;
begin
  -- THE WAGE (${OUT_NAME}; src/core/wage.js wage): whole gold one reference hunted hero-hour pays at a step. The same
  -- multiplications in the same order as the JS, each exactly rounded, so both reach the same last bit before the floor.
  while v_k > 0 loop
    if v_k % 2 = 1 then v_out := v_out * v_b; end if;
    v_b := v_b * v_b;
    v_k := v_k / 2;
  end loop;
  return floor(${r.wage.base}::float8 * v_out)::bigint;
end $fn$;

-- ── §1b THE TABLE ────────────────────────────────────────────────────────────
create table if not exists public.hr_time_blocks (
  kind          text   primary key check (kind ~ '^[a-z]{1,16}$'),
  block_min     int    not null check (block_min between 1 and 1440),
  per_day       int    not null check (per_day between 1 and 24),
  growth_num    int    not null check (growth_num >= 1),
  growth_den    int    not null check (growth_den >= 1),
  price_hour_pm int    not null check (price_hour_pm > 1000),
  check (growth_num >= growth_den)
);
alter table public.hr_time_blocks enable row level security;
revoke all on public.hr_time_blocks from public, anon, authenticated, service_role;
comment on table public.hr_time_blocks is '${OUT_NAME}: bought time, one row a kind (src/data/time-blocks.js through tools/gen-time-blocks.mjs).';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_time_blocks;
insert into public.hr_time_blocks (kind, block_min, per_day, growth_num, growth_den, price_hour_pm) values
${values};

-- ── §2b THE PRICE'S SQL TWIN (internal) ──────────────────────────────────────
create or replace function public.hr_time_block_price(p_kind text, p_level int, p_n int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_time_blocks%rowtype; v_num numeric; v_den numeric;
begin
  -- BOUGHT TIME (${OUT_NAME}; src/core/wage.js blockPrice): the gold block p_n (1 for the day's first) of p_kind costs a hero of
  -- Level p_level, in hours of the wage at the Level's step (wage.js levelStep: the Level itself, 04 section 1; a per-hero cost reads
  -- the hero's Level, never its depth: Tyler 2026-11-22); exact integers, rounded up as the JS rounds its BigInt.
  select * into r from public.hr_time_blocks where kind = p_kind;
  if not found or p_n is null or p_n < 1 or p_n > r.per_day then return null; end if;
  v_num := r.block_min::numeric * r.price_hour_pm * public.hr_wage(p_level) * power(r.growth_num::numeric, p_n - 1);
  v_den := 60000::numeric * power(r.growth_den::numeric, p_n - 1);
  return div(v_num + v_den - 1, v_den)::bigint;
end $fn$;
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_wage(integer)', 'public.hr_time_block_price(text,integer,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- Every row is the data's; no client role reads the table or runs a twin; the wage's twin answers the JS wage at every pinned step, and
-- the price's twin the JS price at the pinned Levels for every block of the day, and null for the first block past the day's cap.
do $mig$
declare v_r record; v_p bigint;
begin
  if (select count(*) from public.hr_time_blocks) <> ${r.rows.length} then
    raise exception 'VERIFY(a): the catalogue holds % kinds, want ${r.rows.length}', (select count(*) from public.hr_time_blocks); end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_time_blocks', 'select')
                 or has_function_privilege(g.r, 'public.hr_wage(integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_time_block_price(text,integer,integer)', 'execute')) then
    raise exception 'VERIFY(b): a client role reads the wage or the bought-time catalogue'; end if;
  for v_r in select * from (values
${wageValues}) p(s, w) loop
    v_p := public.hr_wage(v_r.s);
    if v_p is distinct from v_r.w then
      raise exception 'VERIFY(c): the wage at step % is % in SQL, % in src/core/wage.js', v_r.s, v_p, v_r.w; end if;
  end loop;
  for v_r in select * from (values
${pinValues}) p(kind, l, n, price) loop
    v_p := public.hr_time_block_price(v_r.kind, v_r.l, v_r.n);
    if v_p is distinct from v_r.price then
      raise exception 'VERIFY(d): % block % at Level % costs % in SQL, % in src/core/wage.js', v_r.kind, v_r.n, v_r.l, v_p, v_r.price; end if;
  end loop;
  raise notice 'gen-time-blocks: the wage pinned at % steps, % kind(s), the price pinned at % prices; all green', ${r.wagePins.length}, ${r.rows.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const T = JSON.parse(JSON.stringify(base.TIME_BLOCKS));
    const W = { ...base.WAGE };
    const d = { stepMax: base.stepMax };
    patch(T, W, d);
    /* the data module's own validate, read over the planted table */
    const data = { ...base, TIME_BLOCKS: T, WAGE: W, stepMax: d.stepMax, validate: () => base.validate(T) };
    try { rowsOf(data); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('a later block cheaper than the one before it', (T) => { T.hunt.growthNum = 1; T.hunt.growthDen = 2; });
  plant('the ruled cap moved', (T) => { T.hunt.perDay = 4; });
  plant('the ruled block length moved', (T) => { T.hunt.blockMin = 240; });
  plant('a block hour sold at an hour of wage (prints gold)', (T) => { T.hunt.priceHourPm = 1000; });
  plant('a kind no verb sells (work before its verb)', (T) => { T.work = { ...T.hunt, perDay: 4, priceHourPm: 1500 }; });
  plant('a kind that is no word', (T) => { T['Hunt-2'] = { ...T.hunt }; });
  plant('an empty table', (T) => { delete T.hunt; });
  plant('a wage of no gold', (T, W) => { W.wageBase = 0; });
  plant('a wage that shrinks with the step', (T, W) => { W.payStepCoin = -0.001; });
  plant('a wage step past the band of safe powers', (T, W) => { W.payStepCoin = 0.05; });
  plant('a last step whose price passes a safe integer', (T, W, d) => { W.payStepCoin = 0.049; d.stepMax = 4000; });
  if (base.validate().length) bites.push('the shipped table is refused: ' + base.validate().join('; '));
  const sql = buildSql(rowsOf(base));
  if (!/VERIFY\(c\)/.test(sql) || !/VERIFY\(d\)/.test(sql) || !/hr_time_block_price/.test(sql) || !/hr_wage/.test(sql)) bites.push('a twin is not pinned');
  if (bites.length) { console.error('gen-time-blocks --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-time-blocks --selftest: 11 refusals bite, both twins are pinned');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-time-blocks --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-time-blocks.mjs'); process.exit(1); }
      console.log('gen-time-blocks --check: catalogue matches src/data and src/core');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
