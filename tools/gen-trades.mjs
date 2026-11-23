#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-trades.mjs — GENERATE THE SERVER'S TRADE CATALOGUE AND ITS FORMULA TWINS (lane/trade-formulas, backend-architect, 2026-11-22;
//   docs/design/redesign/09-crafting.md section 4, built in its section 4.8; 13-market.md section 3.2).
//
// src/core/trades.js is the rule (the catalogue's derivation, one curve for yield, quality, speed and XP, V, the store, tools, the job's
// bound and its closed-form settle) and src/data/trades.js its rows and levers. The server reads this catalogue when it prices, checks or
// settles town work (the job slice: 09 section 6), so no number is typed twice. This writes it whole, with the SQL twins and a self-check:
//   hr_trade_levers       one row: the levers as whole numbers (permille, steps, Levels, ms) and the power step
//   hr_trade_kinds        one row a kind: trade, stage, line, opening rung, ships, quality kind, work in micro-hours (V's) and own work
//                         (an attempt's), its inputs { kind: n } and hunted inputs { stream: permille of an hour-unit }
//   hr_trade_xp           one row a Level: the XP (seconds of work) to reach it
//   the twins             hr_trade_yield_pm, hr_trade_fine_pm, hr_trade_master_pm, hr_trade_speed_pm, hr_trade_xp_pm, hr_trade_level,
//                         hr_trade_value, hr_trade_job_fee, hr_trade_store_step, hr_trade_store_ask, hr_trade_store_bid,
//                         hr_trade_behind_pm, hr_trade_tool_speed_pm, hr_trade_tool_life_ms, hr_trade_tool_rent, hr_trade_job_bound;
//                         each pinned to the JS at every pin below (§4), and the job bound pinned to ADMIT settleJob's own result
//
//   node tools/gen-trades.mjs            write OUT_NAME
//   node tools/gen-trades.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-trades.mjs --selftest every refusal bites
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; once OUT_NAME is APPLIED a change is a new
// sequence file. OUT_NAME has never been applied (its sidecar says STAGED).
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the rows and levers; no tracked file is patched
//
// REFUSES (throws, nothing written): rows src/data/trades.js validate() refuses (line or stage shares that do not sum to one, a ladder
// past Level 98, a yield that starts at its cap, a store that bids at or over its ask, an XP window narrower than a rung, a stream cover
// under one, a material that is not gathered or refined, a part sized for another kind, charges that would bill styles differently, a
// kind shipping before its trade), a work that is not a whole micro-hour, a value at the last step past a safe integer, and a settle the
// bound does not admit.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1063-trade-formulas-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/* THE PINS the self-check holds, a sample (tests/trade-formulas.mjs TF-TWIN sweeps every Level, rung, band and step on the replayed
   chain): trade Levels each side of a rung, of the no-fail span and of the XP window, and the cap; bands from the first to past the last
   step; hero steps each side of a band's edge and past the last step; steps behind the contest curve across the squaring's powers */
export const PIN_LEVELS = Object.freeze([1, 11, 15, 16, 26, 41, 60, 91, 99, 100]);
export const PIN_BANDS = Object.freeze([0, 3, 200, 250]);
export const PIN_HERO_STEPS = Object.freeze([0, 19, 20, 60, 4000, 5000]);
export const PIN_BEHIND = Object.freeze([0, 1, 2, 19, 20, 21, 40, 60, 100, 127, 128, 200, 900, 4000]);
const PIN_BENCH = Object.freeze([0, 60, 100, 250]);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [data, core, danger] = await Promise.all([imp('src/data/trades.js'), imp('src/core/trades.js'), imp('src/data/danger.js')]);
  return { data, core, powerStep: danger.DANGER.powerStep, stepMax: danger.DANGER.stepMax };
}

/* THE SETTLE SAMPLES: one job per stage and kind of curve (under, at and over no-fail, with and without Mastery and a bench, a tool behind,
   a count that binds and one the clock binds). The bound must admit each: attempts and XP equal, units and returns under the bound */
const SAMPLES = Object.freeze([
  { kind: 'ore', rung: 1, level: 1, count: 500, elapsedMs: 3600000, seed: 11 },
  { kind: 'fish', rung: 3, level: 26, count: 500, elapsedMs: 8 * 3600000, seed: 12 },
  { kind: 'log', rung: 10, level: 99, mastery: true, benchPm: 100, count: 1000, elapsedMs: 10 * 3600000, seed: 13 },
  { kind: 'bar', rung: 1, level: 5, count: 40, elapsedMs: 8 * 3600000, seed: 14 },
  { kind: 'meal', rung: 1, level: 1, count: 30, elapsedMs: 3600000, seed: 15 },
  { kind: 'meal', rung: 5, level: 60, mastery: true, count: 200, elapsedMs: 8 * 3600000, seed: 16 },
  { kind: 'honing_stone', rung: 7, level: 70, toolPm: 932, count: 200, elapsedMs: 6 * 3600000, seed: 17 },
  { kind: 'arrow', rung: 9, level: 99, mastery: true, benchPm: 100, count: 300, elapsedMs: 10 * 3600000, seed: 18 },
  { kind: 'rune_fire', rung: 4, level: 45, count: 100, elapsedMs: 5 * 3600000, seed: 19 },
  { kind: 'imbuement', rung: 1, level: 30, count: 10, elapsedMs: 4 * 3600000, seed: 20 },
  { kind: 'temper_kit', rung: 3, level: 21, count: 6, elapsedMs: 2 * 3600000, seed: 21 },
  { kind: 'tool_pick', rung: 2, level: 40, count: 3, elapsedMs: 3600000, seed: 22 },
  { kind: 'draught', rung: 1, level: 12, count: 50, elapsedMs: 3 * 3600000, seed: 23 },
]);

/** The resolved catalogue, the lever row and every pin, refused on a defect. */
export function rowsOf({ data, core, powerStep, stepMax }, plant = null) {
  const kindsIn = plant && plant.kinds ? plant.kinds : data.KINDS;
  const leversIn = plant && plant.levers ? plant.levers : data.TRADE_LEVERS;
  const linesIn = plant && plant.lines ? plant.lines : data.LINE_SHARE;
  const cat = core.tradeCatalogue(kindsIn, leversIn, linesIn);
  const P = core.TRADE_PM;
  const kinds = Object.values(cat.kinds);
  for (const k of kinds) {
    if (!Number.isSafeInteger(k.workUh) || k.workUh < 1 || !Number.isSafeInteger(k.ownUh) || k.ownUh < 1) throw new Error('gen-trades: ' + k.id + ' work is not a whole micro-hour');
    /* the dearest unit there can be (a Master good at the last step, the first past stepMax held there) times a day of attempts stays a
       safe integer: the job fee's bigint and the client's number agree to the gold */
    const top = core.value(k, Math.ceil(stepMax / P.tierSteps) + 1, 2);
    if (!(top * 1000 < Number.MAX_SAFE_INTEGER)) throw new Error('gen-trades: ' + k.id + ' at the last step is worth ' + top + ', past a safe integer for a job of a thousand');
  }
  const xp = core.tradeXpTable();
  const rungR = Array.from({ length: P.rungCount }, (_, i) => core.rungLevel(i + 1));
  const curve = [];
  for (const L of PIN_LEVELS) for (const R of rungR) for (const m of [false, true]) {
    curve.push({ L, R, m, y: core.yieldPm(L, R, m, 0), f: core.finePm(L, R), ms: core.masterPm(L, R, m), x: core.xpPm(L, R) });
  }
  const bench = [];
  for (const b of PIN_BENCH) for (const L of [1, 16, 99]) bench.push({ L, R: 1, m: L === 99, b, y: core.yieldPm(L, 1, L === 99, b) });
  const speed = PIN_LEVELS.map((L) => ({ L, s: core.speedPm(L) }));
  const levelPins = [];
  for (let n = 1; n < xp.length; n++) if (n < 4 || n % 7 === 0 || n > 95) levelPins.push({ xp: xp[n] - 1, lv: core.tradeLevel(xp[n] - 1) }, { xp: xp[n], lv: core.tradeLevel(xp[n]) });
  levelPins.push({ xp: -5, lv: core.tradeLevel(-5) }, { xp: xp[98] * 2, lv: core.tradeLevel(xp[98] * 2) });
  const values = [];
  for (const k of kinds) for (const band of PIN_BANDS) for (const q of k.rolls ? [0, 1, 2] : [0]) values.push({ k: k.id, band, q, v: core.value(k, band, q), bid: core.storeBid(k, band, q) });
  const fees = [];
  /* every finished good, and a refined good and a part (which pay none) */
  for (const k of kinds.filter((x) => x.final || ['bar', 'arrowhead'].includes(x.id))) for (const band of [0, 3, 200]) for (const n of [1, 7, 250]) fees.push({ k: k.id, band, n, fee: core.jobFee(k, band, n) });
  const asks = [];
  /* the store's lines, and a draught, an imbuement and a tool it must never sell (null) */
  for (const k of kinds.filter((x) => x.line === 'meal' || x.line === 'charge' || ['draught', 'imbuement', 'tool_pick'].includes(x.id))) {
    for (const s of PIN_HERO_STEPS) asks.push({ k: k.id, s, st: core.storeStep(s), ask: core.storeAsk(k, s) });
  }
  const behind = PIN_BEHIND.map((s) => ({ s, pm: core.behindPm(s) }));
  const toolSpeed = [[0, 0], [3, 3], [5, 3], [2, 3], [0, 5], [3, 8], [1, 200]].map(([t, j]) => ({ t, j, pm: core.toolSpeedPm(t, j) }));
  const toolLife = [0, 1, 2].map((q) => ({ q, ms: core.toolLifeMs(q) }));
  const tool = kinds.find((k) => k.rolls === 'life');
  const rents = tool ? PIN_HERO_STEPS.map((s) => ({ k: tool.id, s, rent: core.toolRentPerHour(tool, s) })) : [];
  const jobs = SAMPLES.filter((j) => cat.kinds[j.kind]).map((j) => {
    const k = cat.kinds[j.kind];
    const opt = { mastery: !!j.mastery, benchPm: j.benchPm || 0, toolPm: j.toolPm || 1000, count: j.count, elapsedMs: j.elapsedMs };
    const b = core.jobBound(k, j.rung, j.level, opt);
    const s = core.settleJob(k, j.rung, j.level, { ...opt, seed: j.seed });
    if (!b || !s) throw new Error('gen-trades: the sample job ' + j.kind + ' rung ' + j.rung + ' at Level ' + j.level + ' is refused');
    const units = s.plain + s.fine + s.master;
    if (s.attempts !== b.attempts || s.xp !== b.xp || units > b.unitsMax || s.returned > b.returnedMax) {
      throw new Error('gen-trades: the bound does not admit ' + j.kind + "'s settle " + JSON.stringify(s) + ' (bound ' + JSON.stringify(b) + ')');
    }
    return { ...j, ...opt, b, s, units };
  });
  /* the kinds whose a refused level or rung must answer null: a rung under the kind's own, one past the ladder, a Level under the rung */
  const refused = [];
  const first = kinds.find((k) => k.opens > 1);
  if (first) refused.push({ k: first.id, rung: first.opens - 1, level: 99 });
  refused.push({ k: kinds[0].id, rung: P.rungCount + 1, level: 99 }, { k: kinds[0].id, rung: 3, level: rungR[2] - 1 });
  const lever = {
    rung_count: P.rungCount, rung_span: P.rungSpan, max_level: P.maxLevel, at_req_pm: P.atReq, no_fail_span: P.noFailSpan, cap_pm: P.cap,
    mastery_return_pm: P.masteryReturn, bench_max_pm: P.benchMax, fine_base_pm: P.fineBase, fine_top_pm: P.fineTop, master_top_pm: P.masterTop,
    quality_steps: P.qualitySteps, speed_at99_pm: P.speedAt99, xp_window: P.xpWindow, xp_floor_pm: P.xpFloor, job_fee_pm: P.jobFee,
    town_wage_share_pm: P.townWageShare, store_ceiling_pm: P.storeCeiling, store_lag: P.storeLag, floor_share_pm: P.floorShare,
    store_budget_pm: P.storeBudget, tool_ms: P.toolMs, tool_life_rung_pm: P.toolLifeRung, tier_steps: P.tierSteps,
  };
  return { cat, kinds, lever, powerStep, xp, curve, bench, speed, levelPins, values, fees, asks, behind, toolSpeed, toolLife, rents, jobs, refused };
}

const lit = (s) => (s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");
const jsonLit = (o) => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
const vals = (rows, f) => rows.map((r) => '    (' + f(r) + ')').join(',\n');
const nul = (v) => (v === null || v === undefined ? 'null' : String(v));
const FUNS = [
  'hr_trade_yield_pm(integer,integer,boolean,integer)', 'hr_trade_fine_pm(integer,integer)', 'hr_trade_master_pm(integer,integer,boolean)',
  'hr_trade_speed_pm(integer)', 'hr_trade_xp_pm(integer,integer)', 'hr_trade_level(bigint)', 'hr_trade_value(text,integer,integer)',
  'hr_trade_job_fee(text,integer,integer)', 'hr_trade_store_step(integer)', 'hr_trade_store_ask(text,integer)', 'hr_trade_store_bid(text,integer,integer)',
  'hr_trade_behind_pm(integer)', 'hr_trade_tool_speed_pm(integer,integer)', 'hr_trade_tool_life_ms(integer)', 'hr_trade_tool_rent(text,integer)',
  'hr_trade_job_bound(text,integer,integer,boolean,integer,integer,integer,bigint)',
];

export function buildSql(r) {
  const L = r.lever;
  const cols = Object.keys(L);
  const kindRows = r.kinds.map((k) => `  (${lit(k.id)}, ${lit(k.trade)}, ${lit(k.stage)}, ${lit(k.line)}, ${k.opens}, ${lit(k.ships)}, ${lit(k.rolls)}, ${k.final}, ${k.workUh}, ${k.ownUh}, `
    + `${jsonLit(Object.fromEntries(k.inputs.map((i) => [i.kind, i.n])))}, ${jsonLit(Object.fromEntries(k.hunted.map((h) => [h.stream, h.pm])))})`).join(',\n');
  const xpRows = r.xp.map((x, i) => `(${i + 1}, ${x})`).join(', ');
  const shipped = r.kinds.filter((k) => k.ships === 'v030').length;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE TRADES: TOWN WORK ON ONE CURVE, AND ITS FORMULA TWINS  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-trades.mjs from src/core/trades.js (the rule) and src/data/trades.js (TRADE_LEVERS, TRADES, KINDS), with
--   src/data/store-kit.js (kitWork, townWageShare, storeCeiling, the meal and charge shares), src/data/gear-steps.js (tierSteps) and
--   src/data/danger.js (powerStep). Any hand edit FAILS \`node tools/gen-trades.mjs --check\`.
--
-- WHAT (lane/trade-formulas, backend-architect, 2026-11-22; 09-crafting.md section 4, built in 4.8; 13-market.md section 3.2): the trades'
-- catalogue and every formula the server needs to price, check and settle town work, so no number is typed twice.
--   hr_trade_levers   1 row: the levers as whole numbers.
--   hr_trade_kinds    ${r.kinds.length} kinds (${shipped} ship in v0.3.0, ${r.kinds.length - shipped} later), rewritten whole: work in micro-hours (V's) and an attempt's own
--                     work, inputs { kind: n } and hunted inputs { stream: permille of an hour-unit }. A RECIPE is (kind, rung): rung r opens
--                     at trade Level 1 + (r - 1) x ${L.rung_span} (${r.cat.recipes.length} recipes); its band is the job's.
--   hr_trade_xp       ${r.xp.length} rows: XP (seconds of work) to reach each trade Level; ${Math.round(r.xp[98] / 3600)} hours to 99.
--   twins (internal)  the curve (yield, Fine, Master, speed, XP factor), the Level from XP, V and the job fee, the store's step, ask and bid,
--                     the contest curve behind a band, a tool's speed, life and rent, and the job's bound; each pinned to the JS (§4).
-- READERS: none yet. The job slice (09 section 6: the job row, its start and settle verbs, banded stacks) reads them; until it lands no
-- verb, engine or client reads this file, and the live town work (hr_activities, the old rows) is untouched.
-- ORDER: 1063 in its name, after 1058-hunting-blocks-catalogue.generated.sql (hr_wage, which V reads). Idempotent: the tables are made if
-- missing and their rows rewritten whole, the functions restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. Three catalogue tables, RLS on, no policy, no grant to any client role; every twin revoked from every client
-- role and the engine's. No value moves here. ON THE PRE-EA SECURITY LIST (13-security-list.md S-8): V anchors the job fee, the store's
-- ask and bid and the market's bands once the job slice reads it.
-- REVERSIBLE: drop the functions and the three tables.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the wage first (1058-hunting-blocks-catalogue.generated.sql, hr_wage)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_trade_levers (
  id boolean primary key default true check (id),
${cols.map((c) => `  ${c.padEnd(18)} ${c === 'tool_ms' ? 'bigint' : 'int   '} not null check (${c} >= 0),`).join('\n')}
  power_step         float8 not null check (power_step > 0 and power_step < 0.05),
  check (at_req_pm < cap_pm and cap_pm >= 1000 and fine_top_pm >= fine_base_pm and floor_share_pm < store_ceiling_pm)
);
create table if not exists public.hr_trade_kinds (
  kind     text   primary key check (kind ~ '^[a-z][a-z0-9_]{1,31}$'),
  trade    text   not null check (trade ~ '^[a-z]{1,16}$'),
  stage    text   not null check (stage in ('gather', 'refine', 'make')),
  line     text   check (line in ('meal', 'charge', 'draught', 'imbuement')),
  opens    int    not null check (opens >= 1),
  ships    text   not null check (ships in ('v030', 'later')),
  rolls    text   check (rolls in ('step', 'life')),
  final    boolean not null,
  work_uh  bigint not null check (work_uh >= 1),
  own_uh   bigint not null check (own_uh >= 1 and own_uh <= work_uh),
  inputs   jsonb  not null check (jsonb_typeof(inputs) = 'object'),
  hunted   jsonb  not null check (jsonb_typeof(hunted) = 'object')
);
create table if not exists public.hr_trade_xp (
  level int    primary key check (level between 1 and 99),
  xp    bigint not null check (xp >= 0)
);
alter table public.hr_trade_levers enable row level security;
alter table public.hr_trade_kinds enable row level security;
alter table public.hr_trade_xp enable row level security;
revoke all on public.hr_trade_levers, public.hr_trade_kinds, public.hr_trade_xp from public, anon, authenticated, service_role;
comment on table public.hr_trade_levers is '${OUT_NAME}: the trades'' levers as whole numbers (src/data/trades.js through tools/gen-trades.mjs).';
comment on table public.hr_trade_kinds is '${OUT_NAME}: one row a kind of good, its work and inputs derived by src/core/trades.js tradeCatalogue.';
comment on table public.hr_trade_xp is '${OUT_NAME}: the XP (seconds of work) to reach each trade Level (src/core/trades.js tradeXpTable).';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_trade_levers;
insert into public.hr_trade_levers (id, ${cols.join(', ')}, power_step) values
  (true, ${cols.map((c) => L[c]).join(', ')}, '${r.powerStep}'::float8);
delete from public.hr_trade_kinds;
insert into public.hr_trade_kinds (kind, trade, stage, line, opens, ships, rolls, final, work_uh, own_uh, inputs, hunted) values
${kindRows};
delete from public.hr_trade_xp;
insert into public.hr_trade_xp (level, xp) values
  ${xpRows};

-- ── §3 THE TWINS (internal; src/core/trades.js, line for line) ───────────────
create or replace function public.hr_trade_yield_pm(p_level int, p_r int, p_mastery boolean, p_bench_pm int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_l int;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js yieldPm): permille, null when the Level is under the recipe's.
  select * into c from public.hr_trade_levers;
  v_l := least(c.max_level, greatest(1, coalesce(p_level, 1)));
  if p_r is null or v_l < p_r then return null; end if;
  return least(c.cap_pm, c.at_req_pm + ((1000 - c.at_req_pm) * least(v_l - p_r, c.no_fail_span)) / c.no_fail_span
    + case when coalesce(p_mastery, false) then c.mastery_return_pm else 0 end + least(c.bench_max_pm, greatest(0, coalesce(p_bench_pm, 0))));
end $fn$;

create or replace function public.hr_trade_fine_pm(p_level int, p_r int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_l int;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js finePm): the chance a made good rolls Fine once Master missed.
  select * into c from public.hr_trade_levers;
  v_l := least(c.max_level, greatest(1, coalesce(p_level, 1)));
  if p_r is null or v_l < p_r then return null; end if;
  return c.fine_base_pm + ((c.fine_top_pm - c.fine_base_pm) * (v_l - p_r)) / (c.max_level - p_r);
end $fn$;

create or replace function public.hr_trade_master_pm(p_level int, p_r int, p_mastery boolean)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_l int;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js masterPm): only with the trade's Mastery.
  select * into c from public.hr_trade_levers;
  v_l := least(c.max_level, greatest(1, coalesce(p_level, 1)));
  if p_r is null or v_l < p_r then return null; end if;
  if not coalesce(p_mastery, false) then return 0; end if;
  return (c.master_top_pm * (v_l - p_r)) / (c.max_level - p_r);
end $fn$;

create or replace function public.hr_trade_speed_pm(p_level int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js speedPm).
  select * into c from public.hr_trade_levers;
  return 1000 + ((c.speed_at99_pm - 1000) * least(c.max_level, greatest(1, coalesce(p_level, 1)))) / c.max_level;
end $fn$;

create or replace function public.hr_trade_xp_pm(p_level int, p_r int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_d int;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js xpPm): full within the window, then falling in a straight line to the floor.
  select * into c from public.hr_trade_levers;
  if p_r is null then return null; end if;
  v_d := least(c.max_level, greatest(1, coalesce(p_level, 1))) - p_r;
  if v_d < 0 then return null; end if;
  if v_d <= c.xp_window then return 1000; end if;
  return greatest(c.xp_floor_pm, 1000 - ((1000 - c.xp_floor_pm) * (v_d - c.xp_window)) / c.xp_window);
end $fn$;

create or replace function public.hr_trade_level(p_xp bigint)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js tradeLevel): the highest Level whose XP the total reaches.
  return coalesce((select max(level) from public.hr_trade_xp where xp <= greatest(0, coalesce(p_xp, 0))), 1);
end $fn$;

create or replace function public.hr_trade_value(p_kind text, p_band int, p_q int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; k public.hr_trade_kinds%rowtype; v_q int; v_step int; v_life int;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js value; 13-market.md 3.2): V = work-hours x townWageShare x wage(item step) x life,
  -- one floor of an exact product. A good that rolls no quality is Plain; a 'life' good's quality is life, not step.
  select * into c from public.hr_trade_levers;
  select * into k from public.hr_trade_kinds where kind = p_kind;
  if not found then return null; end if;
  v_q := case when k.rolls is null then 0 else least(2, greatest(0, coalesce(p_q, 0))) end;
  v_step := greatest(0, coalesce(p_band, 0)) * c.tier_steps + case when k.rolls = 'step' then v_q * c.quality_steps else 0 end;
  v_life := case when k.rolls = 'life' then 1000 + c.tool_life_rung_pm * v_q else 1000 end;
  return div(k.work_uh::numeric * c.town_wage_share_pm * public.hr_wage(v_step) * v_life, 1000000000000)::bigint;
end $fn$;

create or replace function public.hr_trade_job_fee(p_kind text, p_band int, p_count int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_v bigint; v_final boolean;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js jobFee): jobFee x the Plain V of what the job asks to make, rounded up, burned. A finished
  -- good only: a refined good or a part pays none, so a chain pays the fee once, on its whole V.
  select * into c from public.hr_trade_levers;
  select final into v_final from public.hr_trade_kinds where kind = p_kind;
  if not found then return null; end if;
  if not v_final then return 0; end if;
  v_v := public.hr_trade_value(p_kind, p_band, 0);
  return div(c.job_fee_pm::numeric * v_v * greatest(0, coalesce(p_count, 0)) + 999, 1000)::bigint;
end $fn$;

create or replace function public.hr_trade_store_step(p_hero_step int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js storeStep): the hero's band's step, one tier (store_lag) behind.
  select * into c from public.hr_trade_levers;
  return greatest(0, (greatest(0, coalesce(p_hero_step, 0)) / c.tier_steps) * c.tier_steps - c.store_lag);
end $fn$;

create or replace function public.hr_trade_store_ask(p_kind text, p_hero_step int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; k public.hr_trade_kinds%rowtype;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js storeAsk; 09 2.5, 4.6): store_ceiling x the Plain V a tier behind, rounded up once.
  -- The store sells the meal and charge lines only; null for any other kind.
  select * into c from public.hr_trade_levers;
  select * into k from public.hr_trade_kinds where kind = p_kind and line in ('meal', 'charge');
  if not found then return null; end if;
  return div(c.store_ceiling_pm::numeric * k.work_uh * c.town_wage_share_pm * public.hr_wage(public.hr_trade_store_step(p_hero_step)) * 1000
    + 999999999999999, 1000000000000000)::bigint;
end $fn$;

create or replace function public.hr_trade_store_bid(p_kind text, p_band int, p_q int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_v bigint;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js storeBid): floor_share x V, the floor (the account's day budget is store_budget_pm).
  select * into c from public.hr_trade_levers;
  v_v := public.hr_trade_value(p_kind, p_band, p_q);
  if v_v is null then return null; end if;
  return (c.floor_share_pm * v_v) / 1000;
end $fn$;

create or replace function public.hr_trade_behind_pm(p_steps int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; v_k int; v_b float8; v_out float8 := 1;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js behindPm): 1000 / (1 + power_step) ^ steps, the power walked by squaring with the
  -- same multiplications in the same order as the JS, so float8 reaches the same last bit before the floor.
  select * into c from public.hr_trade_levers;
  v_k := greatest(0, coalesce(p_steps, 0));
  v_b := 1::float8 + c.power_step;
  while v_k > 0 loop
    if v_k % 2 = 1 then v_out := v_out * v_b; end if;
    v_b := v_b * v_b;
    v_k := v_k / 2;
  end loop;
  return floor(1000::float8 / v_out)::int;
end $fn$;

create or replace function public.hr_trade_tool_speed_pm(p_tool_band int, p_job_band int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js toolSpeedPm; 09 3.7): full at or above the job's band, the contest curve behind it.
  select * into c from public.hr_trade_levers;
  if p_tool_band >= p_job_band then return 1000; end if;
  return public.hr_trade_behind_pm((p_job_band - p_tool_band) * c.tier_steps);
end $fn$;

create or replace function public.hr_trade_tool_life_ms(p_q int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js toolLifeMs): work-ms a tool lasts by quality; wear counts work, never the clock.
  select * into c from public.hr_trade_levers;
  return (c.tool_ms * (1000 + c.tool_life_rung_pm * least(2, greatest(0, coalesce(p_q, 0)))) + 500) / 1000;
end $fn$;

create or replace function public.hr_trade_tool_rent(p_kind text, p_hero_step int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; k public.hr_trade_kinds%rowtype; v_den numeric;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js toolRentPerHour): the store's tool by the work-hour, a tier behind, at store_ceiling.
  select * into c from public.hr_trade_levers;
  select * into k from public.hr_trade_kinds where kind = p_kind and rolls = 'life';
  if not found then return null; end if;
  v_den := 1000000000000::numeric * c.tool_ms;
  return div(c.store_ceiling_pm::numeric * k.work_uh * c.town_wage_share_pm * public.hr_wage(public.hr_trade_store_step(p_hero_step)) * 3600000
    + v_den - 1, v_den)::bigint;
end $fn$;

create or replace function public.hr_trade_job_bound(p_kind text, p_rung int, p_level int, p_mastery boolean, p_bench_pm int,
  p_tool_pm int, p_count int, p_elapsed_ms bigint)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_trade_levers%rowtype; k public.hr_trade_kinds%rowtype; v_r int; v_y int; v_per numeric; v_unit numeric;
  v_att bigint; v_spent bigint;
begin
  -- TRADES (${OUT_NAME}; src/core/trades.js jobBound; 09 section 6): what a job may settle to, from the server's own clock. The
  -- attempts its time allows (and the count asked), the time they take, the most units and returned sets, and its XP exactly. A
  -- proposed settle that passes any of these is refused by the verb that reads this; null: the rung is not open to the kind or Level.
  select * into c from public.hr_trade_levers;
  select * into k from public.hr_trade_kinds where kind = p_kind;
  if not found or p_rung is null then return null; end if;
  v_r := 1 + (p_rung - 1) * c.rung_span;
  if p_rung < k.opens or p_rung > c.rung_count or least(c.max_level, greatest(1, coalesce(p_level, 1))) < v_r then return null; end if;
  v_y := public.hr_trade_yield_pm(p_level, v_r, p_mastery, p_bench_pm);
  v_per := public.hr_trade_speed_pm(p_level)::numeric * least(1000, greatest(1, coalesce(p_tool_pm, 1000)));
  v_unit := k.own_uh::numeric * 3600000;
  v_att := greatest(0, least(div(greatest(0, coalesce(p_elapsed_ms, 0)) * v_per, v_unit), greatest(0, coalesce(p_count, 0))))::bigint;
  v_spent := div(v_att * v_unit + v_per - 1, v_per)::bigint;
  return jsonb_build_object('yield_pm', v_y, 'attempts', v_att, 'spent_ms', v_spent,
    'units_max', case when k.stage = 'gather' and v_y > 1000 then v_att * 2 else v_att end,
    'returned_max', case when k.stage <> 'gather' and v_y > 1000 then v_att else 0 end,
    'xp', (v_spent * public.hr_trade_xp_pm(p_level, v_r)) / 1000000);
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array[${FUNS.map((f) => `'public.${f}'`).join(',\n    ')}] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rows are the data's; RLS is on with no policy and no client role reads a table or runs a twin; every twin answers the JS at
-- every pin; the job bound admits each sample's closed-form settle exactly (attempts, XP) or from above (units, returned sets).
do $mig$
declare v_r record; v_i bigint; v_j jsonb;
begin
  if (select count(*) from public.hr_trade_kinds) <> ${r.kinds.length} or (select count(*) from public.hr_trade_xp) <> ${r.xp.length}
     or (select count(*) from public.hr_trade_levers) <> 1 then
    raise exception 'VERIFY(a): the catalogue holds % kinds, % Levels, % lever rows', (select count(*) from public.hr_trade_kinds),
      (select count(*) from public.hr_trade_xp), (select count(*) from public.hr_trade_levers); end if;
  if (select sum(work_uh) from public.hr_trade_kinds) <> ${r.kinds.reduce((a, k) => a + k.workUh, 0)}
     or (select sum(own_uh) from public.hr_trade_kinds) <> ${r.kinds.reduce((a, k) => a + k.ownUh, 0)}
     or (select count(*) from public.hr_trade_kinds where final) <> ${r.kinds.filter((k) => k.final).length} then
    raise exception 'VERIFY(a): the kinds'' work is not the data''s'; end if;
  if exists (select 1 from pg_class t where t.oid in ('public.hr_trade_levers'::regclass, 'public.hr_trade_kinds'::regclass, 'public.hr_trade_xp'::regclass)
              and not t.relrowsecurity)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_trade_levers', 'hr_trade_kinds', 'hr_trade_xp')) then
    raise exception 'VERIFY(b): a trade catalogue table has RLS off or a policy'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['public.hr_trade_levers', 'public.hr_trade_kinds', 'public.hr_trade_xp']) t(n)
              where has_table_privilege(g.r, t.n, 'select') or has_table_privilege(g.r, t.n, 'insert') or has_table_privilege(g.r, t.n, 'update'))
     or exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array[${FUNS.map((f) => `'public.${f}'`).join(', ')}]) f(s)
              where has_function_privilege(g.r, f.s, 'execute')) then
    raise exception 'VERIFY(b): a client role reads a trade catalogue table or runs a twin'; end if;
  for v_r in select * from (values
${vals(r.curve, (p) => `${p.L}, ${p.R}, ${p.m}, ${nul(p.y)}, ${nul(p.f)}, ${nul(p.ms)}, ${nul(p.x)}`)}) p(l, rr, m, y, f, ms, x) loop
    if public.hr_trade_yield_pm(v_r.l, v_r.rr, v_r.m, 0) is distinct from v_r.y or public.hr_trade_fine_pm(v_r.l, v_r.rr) is distinct from v_r.f
       or public.hr_trade_master_pm(v_r.l, v_r.rr, v_r.m) is distinct from v_r.ms or public.hr_trade_xp_pm(v_r.l, v_r.rr) is distinct from v_r.x then
      raise exception 'VERIFY(c): the curve at Level % on a rung of % (Mastery %) is % / % / % / % in SQL, % / % / % / % in src/core/trades.js',
        v_r.l, v_r.rr, v_r.m, public.hr_trade_yield_pm(v_r.l, v_r.rr, v_r.m, 0), public.hr_trade_fine_pm(v_r.l, v_r.rr),
        public.hr_trade_master_pm(v_r.l, v_r.rr, v_r.m), public.hr_trade_xp_pm(v_r.l, v_r.rr), v_r.y, v_r.f, v_r.ms, v_r.x; end if;
  end loop;
  for v_r in select * from (values
${vals(r.bench, (p) => `${p.L}, ${p.R}, ${p.m}, ${p.b}, ${nul(p.y)}`)}) p(l, rr, m, b, y) loop
    if public.hr_trade_yield_pm(v_r.l, v_r.rr, v_r.m, v_r.b) is distinct from v_r.y then
      raise exception 'VERIFY(c): the yield with a bench of % at Level % is % in SQL, % in JS', v_r.b, v_r.l, public.hr_trade_yield_pm(v_r.l, v_r.rr, v_r.m, v_r.b), v_r.y; end if;
  end loop;
  for v_r in select * from (values
${vals(r.speed, (p) => `${p.L}, ${p.s}`)}) p(l, s) loop
    if public.hr_trade_speed_pm(v_r.l) is distinct from v_r.s then
      raise exception 'VERIFY(c): speed at Level % is % in SQL, % in JS', v_r.l, public.hr_trade_speed_pm(v_r.l), v_r.s; end if;
  end loop;
  for v_r in select * from (values
${vals(r.levelPins, (p) => `${p.xp}::bigint, ${p.lv}`)}) p(xp, lv) loop
    if public.hr_trade_level(v_r.xp) is distinct from v_r.lv then
      raise exception 'VERIFY(d): % XP reads Level % in SQL, % in JS', v_r.xp, public.hr_trade_level(v_r.xp), v_r.lv; end if;
  end loop;
  for v_r in select * from (values
${vals(r.values, (p) => `${lit(p.k)}, ${p.band}, ${p.q}, ${p.v}::bigint, ${p.bid}::bigint`)}) p(k, band, q, v, bid) loop
    if public.hr_trade_value(v_r.k, v_r.band, v_r.q) is distinct from v_r.v or public.hr_trade_store_bid(v_r.k, v_r.band, v_r.q) is distinct from v_r.bid then
      raise exception 'VERIFY(e): % at band % quality % is worth % (bid %) in SQL, % (bid %) in JS', v_r.k, v_r.band, v_r.q,
        public.hr_trade_value(v_r.k, v_r.band, v_r.q), public.hr_trade_store_bid(v_r.k, v_r.band, v_r.q), v_r.v, v_r.bid; end if;
  end loop;
  for v_r in select * from (values
${vals(r.fees, (p) => `${lit(p.k)}, ${p.band}, ${p.n}, ${p.fee}::bigint`)}) p(k, band, n, fee) loop
    if public.hr_trade_job_fee(v_r.k, v_r.band, v_r.n) is distinct from v_r.fee then
      raise exception 'VERIFY(e): the fee for % of % at band % is % in SQL, % in JS', v_r.n, v_r.k, v_r.band, public.hr_trade_job_fee(v_r.k, v_r.band, v_r.n), v_r.fee; end if;
  end loop;
  for v_r in select * from (values
${vals(r.asks, (p) => `${lit(p.k)}, ${p.s}, ${p.st}, ${nul(p.ask)}::bigint`)}) p(k, s, st, ask) loop
    if public.hr_trade_store_step(v_r.s) is distinct from v_r.st or public.hr_trade_store_ask(v_r.k, v_r.s) is distinct from v_r.ask then
      raise exception 'VERIFY(f): the store asks % (at step %) for % at hero step % in SQL, % (at %) in JS',
        public.hr_trade_store_ask(v_r.k, v_r.s), public.hr_trade_store_step(v_r.s), v_r.k, v_r.s, v_r.ask, v_r.st; end if;
  end loop;
  for v_r in select * from (values
${vals(r.behind, (p) => `${p.s}, ${p.pm}`)}) p(s, pm) loop
    if public.hr_trade_behind_pm(v_r.s) is distinct from v_r.pm then
      raise exception 'VERIFY(g): % steps behind is % in SQL, % in JS', v_r.s, public.hr_trade_behind_pm(v_r.s), v_r.pm; end if;
  end loop;
  for v_r in select * from (values
${vals(r.toolSpeed, (p) => `${p.t}, ${p.j}, ${p.pm}`)}) p(t, j, pm) loop
    if public.hr_trade_tool_speed_pm(v_r.t, v_r.j) is distinct from v_r.pm then
      raise exception 'VERIFY(g): a band % tool on a band % job works at % in SQL, % in JS', v_r.t, v_r.j, public.hr_trade_tool_speed_pm(v_r.t, v_r.j), v_r.pm; end if;
  end loop;
  for v_r in select * from (values
${vals(r.toolLife, (p) => `${p.q}, ${p.ms}::bigint`)}) p(q, ms) loop
    if public.hr_trade_tool_life_ms(v_r.q) is distinct from v_r.ms then
      raise exception 'VERIFY(g): a quality % tool lasts % ms in SQL, % in JS', v_r.q, public.hr_trade_tool_life_ms(v_r.q), v_r.ms; end if;
  end loop;
  for v_r in select * from (values
${vals(r.rents, (p) => `${lit(p.k)}, ${p.s}, ${p.rent}::bigint`)}) p(k, s, rent) loop
    if public.hr_trade_tool_rent(v_r.k, v_r.s) is distinct from v_r.rent then
      raise exception 'VERIFY(g): renting % at hero step % costs % an hour in SQL, % in JS', v_r.k, v_r.s, public.hr_trade_tool_rent(v_r.k, v_r.s), v_r.rent; end if;
  end loop;
  for v_r in select * from (values
${vals(r.jobs, (j) => `${lit(j.kind)}, ${j.rung}, ${j.level}, ${j.mastery}, ${j.benchPm}, ${j.toolPm}, ${j.count}, ${j.elapsedMs}::bigint, ${j.s.attempts}::bigint, ${j.s.xp}::bigint, ${j.units}::bigint, ${j.s.returned}::bigint, ${j.b.spentMs}::bigint`)}) p(k, rung, l, m, b, t, n, ms, att, xp, units, ret, spent) loop
    v_j := public.hr_trade_job_bound(v_r.k, v_r.rung, v_r.l, v_r.m, v_r.b, v_r.t, v_r.n, v_r.ms);
    if v_j is null or (v_j->>'attempts')::bigint <> v_r.att or (v_j->>'xp')::bigint <> v_r.xp or (v_j->>'spent_ms')::bigint <> v_r.spent
       or (v_j->>'units_max')::bigint < v_r.units or (v_j->>'returned_max')::bigint < v_r.ret then
      raise exception 'VERIFY(h): the bound % does not admit %''s settle (attempts %, XP %, units %, returned %, % ms)', v_j, v_r.k, v_r.att, v_r.xp, v_r.units, v_r.ret, v_r.spent; end if;
  end loop;
  for v_r in select * from (values
${vals(r.refused, (p) => `${lit(p.k)}, ${p.rung}, ${p.level}`)}) p(k, rung, l) loop
    if public.hr_trade_job_bound(v_r.k, v_r.rung, v_r.l, false, 0, 1000, 10, 3600000) is not null then
      raise exception 'VERIFY(h): the bound admits % on rung % at Level %', v_r.k, v_r.rung, v_r.l; end if;
  end loop;
  raise notice 'gen-trades: % kinds, % Levels, the twins pinned at % points, % settles admitted; all green', ${r.kinds.length}, ${r.xp.length},
    ${r.curve.length + r.bench.length + r.speed.length + r.levelPins.length + r.values.length + r.fees.length + r.asks.length + r.behind.length + r.toolSpeed.length + r.toolLife.length + r.rents.length}, ${r.jobs.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plant = (name, patch) => {
    const kinds = clone(base.data.KINDS);
    const levers = clone(base.data.TRADE_LEVERS);
    const lines = clone(base.data.LINE_SHARE);
    patch(kinds, levers, lines);
    try { rowsOf(base, { kinds, levers, lines }); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('line shares that do not sum to one', (k, l, s) => { s.draught = 0.3; });
  plant('stage shares that do not sum to one', (k, l) => { l.stageShare.make = 0.4; });
  plant('a ladder whose last rung opens past Level 98', (k, l) => { l.rungs.span = 11; });
  plant('a yield that starts at its cap', (k, l) => { l.yield.atReq = 1.25; });
  plant('a store that bids at its ask', (k, l) => { l.store.floorShare = 1.5; });
  plant('an XP window narrower than a rung', (k, l) => { l.xp.window = 5; });
  plant('a stream cover under one (it floods)', (k, l) => { l.cover.common_part = 0.9; });
  plant('a material that is a made good', (k) => { k.meal.from = [{ kind: 'honing_stone', share: 1 }]; });
  plant('material shares that do not sum to one', (k) => { k.arrow.from = [{ kind: 'shaft', share: 0.6 }]; });
  plant('a part sized for another kind', (k) => { k.honing_stone.parts = ['haft']; });
  plant('a charge that bills its style a different amount', (k) => { k.ward_charm.split = 0.5; });
  plant('a kind shipping before its trade', (k) => { k.draught.ships = 'v030'; });
  plant('a kind with no trade', (k) => { k.meal.trade = 'baking'; });
  plant('a gather trade that makes', (k) => { k.bar.trade = 'mining'; });
  plant('a raw unit read off something other than a meal', (k) => { k.meal.line = 'draught'; });
  plant('a made kind with no input', (k) => { delete k.honing_stone.from; });
  plant('a refined good that rolls quality', (k) => { k.bar.rolls = 'step'; });
  if (base.data.validate().length) bites.push('the shipped rows are refused: ' + base.data.validate().join('; '));
  const sql = buildSql(rowsOf(base));
  for (const f of FUNS) if (!sql.includes('public.' + f.replace(/\(.*/, '') + '(')) bites.push('twin ' + f + ' is not written');
  for (const v of ['VERIFY(a)', 'VERIFY(b)', 'VERIFY(c)', 'VERIFY(d)', 'VERIFY(e)', 'VERIFY(f)', 'VERIFY(g)', 'VERIFY(h)']) if (!sql.includes(v)) bites.push(v + ' is not checked');
  if (bites.length) { console.error('gen-trades --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-trades --selftest: 17 refusals bite, every twin is written and pinned');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-trades --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-trades.mjs'); process.exit(1); }
      console.log('gen-trades --check: catalogue matches src/data and src/core');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
