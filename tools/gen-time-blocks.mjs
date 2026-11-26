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
//   hr_time_blocks                    per kind: block_min, per_day, growth_num, growth_den, price_hour_pm, earns_pm (what an hour of
//                                     the kind earns back at most: time-blocks.js EARNS_PM; the table refuses a price at or under it)
//   hr_time_block_price(kind, L, n)   wage.js blockPrice: the gold block n of the day costs a hero of Level L (null past the cap)
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
// OUT_NAME has never been applied (its sidecar says STAGED), so it is this generator's one forward file (the house rule: ONE forward
// file per generator after the newest APPLIED, never-applied cuts collapsed into it). ONE EXCEPTION, ON PURPOSE (lane B1, 2026-11-26):
// 1058-hunting-blocks-catalogue.generated.sql, never applied, is NOT collapsed into this file. The `work` row may exist only once a
// verb sells it as town work: 1058-hunting-blocks.sql's hr_time_buy adds STAMINA for every row, so a `work` row written at 1058
// would sell 2 h of stamina for a quarter of a hunting block's price between that apply and 1071-work-blocks.sql's. So 1058 keeps
// the hunting row (frozen as generated before B1) and this file, after 1071 (its §0 refuses to run before the work-aware verb),
// rewrites the whole table with both rows.
//
//   node tools/gen-time-blocks.mjs            write OUT_NAME
//   node tools/gen-time-blocks.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-time-blocks.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a table time-blocks.js validate() refuses (a non-positive number, a later block cheaper than the
// one before it, a block hour no dearer than what an hour of its kind earns back, a ruled number moved, a kind no verb sells), a wage
// whose levers are not a positive whole base and a step in (0, 0.05), a price at the last step past a safe integer, and an empty table.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1072-work-blocks-catalogue.generated.sql';
/* the verb file this catalogue must follow (its §0 refuses to run before it): the work-aware hr_time_quote carries this marker */
const VERB_FILE = '1071-work-blocks.sql';
const VERB_MARK = 'WORK-BLOCKS (1071';
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
  return { TIME_BLOCKS: blocks.TIME_BLOCKS, EARNS_PM: blocks.EARNS_PM, STANDING: blocks.STANDING, validate: blocks.validate, WAGE: wageData.WAGE,
    stepMax: danger.DANGER.stepMax, wage: core.wage, blockPriceOf: core.blockPriceOf };
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
    const earnsPm = data.EARNS_PM && data.EARNS_PM[kind];
    if (!Number.isInteger(earnsPm) || earnsPm < 1 || !(R.priceHourPm > earnsPm)) {
      throw new Error('gen-time-blocks: ' + kind + ' earns back ' + earnsPm + ' permille an hour, priced at ' + R.priceHourPm + ': bought time would print gold');
    }
    const S = data.STANDING || {};
    const leadMin = S.leadMin && S.leadMin[kind];
    if (!Number.isInteger(leadMin) || leadMin < 1 || leadMin > R.blockMin) throw new Error('gen-time-blocks: ' + kind + '\'s standing lead ' + leadMin + ' is not 1 to ' + R.blockMin + ' minutes');
    return { kind, blockMin: R.blockMin, perDay: R.perDay, growthNum: R.growthNum, growthDen: R.growthDen, priceHourPm: R.priceHourPm, earnsPm, leadMin };
  });
  const S = data.STANDING || {};
  const standing = { reserveHoursPm: Math.round(S.reserveHours * 1000), offerKind: S.offerKind, offerDaysPm: Math.round(S.offerDays * 1000),
    offerChoices: Array.isArray(S.offerChoices) ? [...S.offerChoices] : [] };
  const offerRow = rows.find((x) => x.kind === standing.offerKind);
  if (!Number.isInteger(standing.reserveHoursPm) || standing.reserveHoursPm < 0) throw new Error('gen-time-blocks: the reserve is not hours of wage');
  if (!offerRow || !(standing.offerDaysPm >= 1) || !standing.offerChoices.length
      || standing.offerChoices.some((n) => !Number.isInteger(n) || n < 1 || n > offerRow.perDay)) {
    throw new Error('gen-time-blocks: the offer (' + JSON.stringify(S) + ') is not a sold kind, a positive number of days and choices inside its cap');
  }
  const wagePins = WAGE_PINS.map((s) => ({ s, w: data.wage(s) }));
  const pins = [];
  for (const r of rows) {
    for (const L of PIN_LEVELS) for (let n = 1; n <= r.perDay + 1; n++) pins.push({ kind: r.kind, L, n, price: data.blockPriceOf(data.TIME_BLOCKS[r.kind], L, n) });
  }
  return { rows, pins, wagePins, standing, wage: { base: W.wageBase, step: W.payStepCoin, stepMax: data.stepMax } };
}

export function buildSql(r) {
  const values = r.rows.map((x) => `  ('${x.kind}', ${x.blockMin}, ${x.perDay}, ${x.growthNum}, ${x.growthDen}, ${x.priceHourPm}, ${x.earnsPm}, ${x.leadMin})`).join(',\n');
  const rowValues = r.rows.map((x) => `    ('${x.kind}', ${x.blockMin}, ${x.perDay}, ${x.growthNum}, ${x.growthDen}, ${x.priceHourPm}, ${x.earnsPm}, ${x.leadMin})`).join(',\n');
  const st = r.standing;
  const standingValue = `(true, ${st.reserveHoursPm}, '${st.offerKind}', ${st.offerDaysPm}, array[${st.offerChoices.join(', ')}])`;
  const pinValues = r.pins.map((p) => `    ('${p.kind}', ${p.L}, ${p.n}, ${p.price === null ? 'null' : p.price}::bigint)`).join(',\n');
  const wageValues = r.wagePins.map((p) => `    (${p.s}, ${p.w}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE WAGE AND THE BOUGHT-TIME CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-time-blocks.mjs from src/core/wage.js (wage, blockPrice), src/data/wage.js (WAGE) and
--   src/data/time-blocks.js (TIME_BLOCKS, EARNS_PM). Any hand edit FAILS \`node tools/gen-time-blocks.mjs --check\`.
--
-- WHAT (lane/r8-hunting-day, backend-architect, 2026-11-22; the wage, lane/w-wage, the same day; bought town work, lane B1, 2026-11-26;
-- Tyler's rulings of 2026-11-22, 04-math-strategy.md section 11): the rule the server reads, so no number is typed twice.
--   hr_wage(step)        internal, the twin of wage.js wage: floor(${r.wage.base} x (1 + ${r.wage.step}) ^ step), step held to [1, ${r.wage.stepMax}],
--                        the power walked by squaring in float8 exactly as the JS walks it, pinned at ${r.wagePins.length} steps (§3).
--   hr_time_blocks       ${r.rows.length} row${r.rows.length === 1 ? '' : 's'} (${r.rows.map((x) => x.kind).join(', ')}), rewritten whole. earns_pm: the most an hour of the kind earns back
--                        (permille of an hour of wage); the table refuses a price_hour_pm at or under it (bought time never prints gold).
--   hr_time_block_price  internal, the twin of wage.js blockPrice: ceil(block_min / 60 x price_hour_pm / 1000 x hr_wage(Level) x
--                        (growth_num / growth_den) ^ (n - 1)) in exact numeric, pinned at Levels ${PIN_LEVELS.join(', ')} for every block of
--                        the day and the first one past it (§3).
-- READERS: ${VERB_FILE}'s quotes (hr_time_quote, hr_work_block_quote), the \`time_blocks\` section, the verb hr_time_buy and the
-- standing rule (hr_time_auto_buy reads lead_min and hr_time_standing, hr_time_offer_of the offer); the work cap (hr_work_extra_ms);
-- every later price in hours of wage (13-market.md V, Talent resets, Temper) reads hr_wage. The client reads only the sections.
-- ORDER: ${OUT_NAME.replace(/-.*/, '')} in its name, AFTER ${VERB_FILE} (§0 refuses to run before it): the \`work\` row exists only once a verb sells it as town
-- work (tools/gen-time-blocks.mjs, THE FORWARD-FILE RULE). Idempotent: the table is made if missing, converged to this shape and its rows
-- rewritten whole, the functions restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added here. A catalogue table, RLS on, no policy, no grant to any client role; two internal functions revoked
-- from every client role. No value moves here (the verbs that sell are ${VERB_FILE}'s, on the pre-EA Security list).
-- REVERSIBLE: once ${VERB_FILE}'s readers are gone, drop hr_time_standing, the two checks (hr_time_blocks_earns_ck, _lead_ck) and the
-- earns_pm and lead_min columns, then re-apply 1058-hunting-blocks-catalogue.generated.sql (the hunting row alone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: the ledger first (player_ledger)'; end if;
  -- THE ORDER THAT KEEPS THE WORK ROW SAFE: an hr_time_quote without the work branch would sell a \`work\` row as stamina.
  if to_regprocedure('public.hr_time_quote(uuid,integer,text)') is not null
     and strpos((select prosrc from pg_proc where oid = 'public.hr_time_quote(uuid,integer,text)'::regprocedure), '${VERB_MARK}') = 0 then
    raise exception 'PRECONDITION: ${VERB_FILE} first (hr_time_quote has no work branch, so a work row would sell stamina)'; end if;
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
  price_hour_pm int    not null,
  earns_pm      int,
  lead_min      int,
  check (growth_num >= growth_den)
);
alter table public.hr_time_blocks enable row level security;
revoke all on public.hr_time_blocks from public, anon, authenticated, service_role;
comment on table public.hr_time_blocks is '${OUT_NAME}: bought time, one row a kind (src/data/time-blocks.js through tools/gen-time-blocks.mjs).';
create table if not exists public.hr_time_standing (
  id               boolean primary key default true check (id),
  reserve_hours_pm int     not null check (reserve_hours_pm >= 0),
  offer_kind       text    not null check (offer_kind ~ '^[a-z]{1,16}$'),
  offer_days_pm    int     not null check (offer_days_pm >= 1),
  offer_choices    int[]   not null
);
alter table public.hr_time_standing enable row level security;
revoke all on public.hr_time_standing from public, anon, authenticated, service_role;

-- ── §2 THE ROWS, AND THE TABLE CONVERGED TO THIS SHAPE ───────────────────────
-- 1058's table priced every kind above an hour of wage (price_hour_pm > 1000), the hunting floor. A work-hour earns back a quarter of
-- that, so the floor is each row's own: price_hour_pm > earns_pm (src/data/time-blocks.js EARNS_PM, 04 section 11). lead_min is the
-- standing rule's (src/data/time-blocks.js STANDING.leadMin): its sweep buys a block when the pool, or today's bought work left, is under it.
delete from public.hr_time_blocks;
alter table public.hr_time_blocks add column if not exists earns_pm int;
alter table public.hr_time_blocks add column if not exists lead_min int;
alter table public.hr_time_blocks drop constraint if exists hr_time_blocks_price_hour_pm_check;
alter table public.hr_time_blocks drop constraint if exists hr_time_blocks_earns_ck;
alter table public.hr_time_blocks drop constraint if exists hr_time_blocks_lead_ck;
insert into public.hr_time_blocks (kind, block_min, per_day, growth_num, growth_den, price_hour_pm, earns_pm, lead_min) values
${values};
alter table public.hr_time_blocks alter column earns_pm set not null;
alter table public.hr_time_blocks alter column lead_min set not null;
alter table public.hr_time_blocks add constraint hr_time_blocks_earns_ck check (earns_pm >= 1 and price_hour_pm > earns_pm);
alter table public.hr_time_blocks add constraint hr_time_blocks_lead_ck check (lead_min between 1 and block_min);
-- THE STANDING RULE'S NUMBERS (src/data/time-blocks.js STANDING): the reserve (milli-hours of the hero's wage it never spends under) and
-- the offer (its kind, milli-days of the company's pay, the card's choices). Rewritten whole.
delete from public.hr_time_standing;
insert into public.hr_time_standing (id, reserve_hours_pm, offer_kind, offer_days_pm, offer_choices) values
  ${standingValue};

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
  for v_r in select * from (values
${rowValues}) d(kind, block_min, per_day, growth_num, growth_den, price_hour_pm, earns_pm, lead_min) loop
    if not exists (select 1 from public.hr_time_blocks b where b.kind = v_r.kind and b.block_min = v_r.block_min and b.per_day = v_r.per_day
                     and b.growth_num = v_r.growth_num and b.growth_den = v_r.growth_den and b.price_hour_pm = v_r.price_hour_pm
                     and b.earns_pm = v_r.earns_pm and b.lead_min = v_r.lead_min) then
      raise exception 'VERIFY(a): the % row is not src/data/time-blocks.js''s', v_r.kind; end if;
  end loop;
  if (select count(*) from public.hr_time_standing) <> 1
     or not exists (select 1 from public.hr_time_standing s where s.reserve_hours_pm = ${st.reserveHoursPm} and s.offer_kind = '${st.offerKind}'
                      and s.offer_days_pm = ${st.offerDaysPm} and s.offer_choices = array[${st.offerChoices.join(', ')}]) then
    raise exception 'VERIFY(a): the standing rule''s row is not src/data/time-blocks.js STANDING'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r) where has_table_privilege(g.r, 'public.hr_time_standing', 'select')) then
    raise exception 'VERIFY(b): a client role reads the standing rule''s catalogue'; end if;
  -- the table itself refuses a block hour that sells for no more than it earns back
  begin
    update public.hr_time_blocks set price_hour_pm = earns_pm where kind = '${r.rows[0].kind}';
    raise exception using errcode = 'HR772', message = 'VERIFY(a): hr_time_blocks took a price at its earns_pm floor';
  exception when check_violation then null;
  end;
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
    const E = { ...base.EARNS_PM };
    const S = JSON.parse(JSON.stringify(base.STANDING));
    patch(T, W, d, E, S);
    /* the data module's own validate, read over the planted table */
    const data = { ...base, TIME_BLOCKS: T, EARNS_PM: E, STANDING: S, WAGE: W, stepMax: d.stepMax, validate: () => base.validate(T) };
    try { rowsOf(data); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('a later block cheaper than the one before it', (T) => { T.hunt.growthNum = 1; T.hunt.growthDen = 2; });
  plant('the ruled cap moved', (T) => { T.hunt.perDay = 4; });
  plant('the ruled block length moved', (T) => { T.hunt.blockMin = 240; });
  plant('a block hour sold at an hour of wage (prints gold)', (T) => { T.hunt.priceHourPm = 1000; });
  plant('a kind no verb sells (a third kind before its branch)', (T) => { T.rest = { ...T.work }; });
  plant('the ruled work cap moved (a fifth work block a day)', (T) => { T.work.perDay = 5; });
  plant('a work block hour sold at what its goods fetch at the store\'s top (prints gold)', (T) => { T.work.priceHourPm = 375; });
  plant('a kind whose hour earns nothing back (no floor to price above)', (T, W, d, E) => { delete E.work; });
  plant('a standing lead past one block (the rule would buy into a full pool)', (T, W, d, E, S) => { S.leadMin.hunt = T.hunt.blockMin + 1; });
  plant('a standing kind with no lead', (T, W, d, E, S) => { delete S.leadMin.work; });
  plant('the offer\'s choice past its kind\'s daily cap', (T, W, d, E, S) => { S.offerChoices = [1, 3]; });
  plant('an offer of a kind that is not sold', (T, W, d, E, S) => { S.offerKind = 'rest'; });
  plant('a negative reserve', (T, W, d, E, S) => { S.reserveHours = -1; });
  plant('a kind that is no word', (T) => { T['Hunt-2'] = { ...T.hunt }; });
  plant('an empty table', (T) => { delete T.hunt; delete T.work; });
  plant('a wage of no gold', (T, W) => { W.wageBase = 0; });
  plant('a wage that shrinks with the step', (T, W) => { W.payStepCoin = -0.001; });
  plant('a wage step past the band of safe powers', (T, W) => { W.payStepCoin = 0.05; });
  plant('a last step whose price passes a safe integer', (T, W, d) => { W.payStepCoin = 0.049; d.stepMax = 4000; });
  if (base.validate().length) bites.push('the shipped table is refused: ' + base.validate().join('; '));
  const sql = buildSql(rowsOf(base));
  if (!/VERIFY\(c\)/.test(sql) || !/VERIFY\(d\)/.test(sql) || !/hr_time_block_price/.test(sql) || !/hr_wage/.test(sql)) bites.push('a twin is not pinned');
  /* the work row is written only after the verb that sells it as town work (THE FORWARD-FILE RULE above) */
  if (!sql.includes("'" + VERB_MARK + "'") || !/PRECONDITION: 1071-work-blocks\.sql first/.test(sql)) bites.push('the catalogue no longer refuses to land before ' + VERB_FILE);
  if (!/check \(earns_pm >= 1 and price_hour_pm > earns_pm\)/.test(sql)) bites.push('the table no longer refuses a price at its earns_pm floor');
  if (bites.length) { console.error('gen-time-blocks --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-time-blocks --selftest: 19 refusals bite, both twins are pinned, the work row waits on its verb');
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
