#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-level-costs.mjs — GENERATE THE SERVER'S PER-HERO COSTS BY LEVEL (lane/level-costs, backend-architect, 2026-11-22;
//   Tyler 2026-11-22: "per-hero costs read the wage at the hero's LEVEL": bought blocks (gen-time-blocks.mjs), Talent resets, the death
//   cost and Blessings; docs/design/redesign/02-architecture.md sections 1b and 6, 04-math-strategy.md sections 5 and 11).
//
// The rules live in src/core (action-rules.js levelDeathLoss, wage.js blessingPrice and resetPrice) and their numbers in src/data
// (hunt-sessions.js DEATH_HOURS, blessings.js BLESSING, talent-reset.js TALENT_RESET). This writes the server's one-row catalogue and
// the SQL twins, with a self-check that pins each twin to the JS at the Levels below:
//   hr_level_costs                       one row: death_hours_pm, bless_cut_pm, bless_hours_pm, bless_free_until, reset_hours_pm,
//                                        reset_growth_num, reset_growth_den, reset_per_day
//   hr_death_hours_xp(L, pm)             ceil(death_hours_pm x pm / 1e6 x the hours table's Level XP an hour at L): the hours price
//                                        (action-rules.js levelHourXp: the Level's XP over hr_danger_hours_for), ROUNDED UP, so the
//                                        engine's float floor never passes it
//   hr_death_xp_mode_max(skill, xp, pm)  RESTATED: the most one death may take. Level: the lesser of the share (death_xp_permille of
//                                        the total, floored, as before) and hr_death_hours_xp at the Level xp makes; a skill: the share
//                                        of its progress, never a level (unchanged). The settle's bound (hr_hunt_apply_member (6))
//   hr_blessing_price(tier, L)           RESTATED: the one Blessing (tier 1): 0 under bless_free_until, else ceil(bless_hours_pm x
//                                        hr_wage(L) / 1000); any other tier null
//   hr_talent_reset_price(L, paid)       ceil(reset_hours_pm x hr_wage(L) x num^paid / (1000 x den^paid)), null at reset_per_day
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-level-costs.mjs            write OUT_NAME
//   node tools/gen-level-costs.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-level-costs.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a row its data module's validate() refuses; a death's hours that are no whole permille of an hour
// or none; a Blessing or a reset whose dearest price (the last step, the last paid reset of the day) passes a safe integer; and a death
// price that FALLS as Level XP grows anywhere from Level 1 to the last step (the server bounds a death at the hero's Level XP after the
// window, which only grew since the death: a falling price would refuse an honest death).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1063-level-costs-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
/* the Levels each twin is pinned at: the free line either side, the death's crossover (the share binds to 61, the hours from 62), the
   Danger scale's measured Levels, the 20-400 checkpoints, past them, and the last step */
export const PIN_LEVELS = Object.freeze([1, 5, 10, 20, 29, 30, 31, 50, 60, 61, 62, 63, 70, 100, 200, 400, 1000, 2000, 4000]);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [hs, bl, tr, wageData, danger, coreWage, ar, xp, dangerCore] = await Promise.all([
    imp('src/data/hunt-sessions.js'), imp('src/data/blessings.js'), imp('src/data/talent-reset.js'), imp('src/data/wage.js'),
    imp('src/data/danger.js'), imp('src/core/wage.js'), imp('src/core/action-rules.js'), imp('src/core/xp.js'), imp('src/core/hunt/danger.js')]);
  return {
    DEATH_HOURS: hs.DEATH_HOURS, DEATH_XP_LOSS: hs.DEATH_XP_LOSS, BLESSING: bl.BLESSING, validateBlessing: bl.validate,
    TALENT_RESET: tr.TALENT_RESET, validateReset: tr.validate, WAGE: wageData.WAGE, stepMax: danger.DANGER.stepMax,
    wage: coreWage.wage, blessingPrice: coreWage.blessingPrice, resetPrice: coreWage.resetPrice,
    levelDeathLoss: ar.levelDeathLoss, levelHourXp: ar.levelHourXp, charXpForLevel: xp.charXpForLevel, hoursForLevel: dangerCore.hoursForLevel,
  };
}

/** The resolved row and pins of the data, refused on a defect. */
export function rowsOf(d) {
  const problems = [...d.validateBlessing(d.BLESSING), ...d.validateReset(d.TALENT_RESET)];
  const hoursPm = Math.round(d.DEATH_HOURS * 1000);
  if (!Number.isFinite(d.DEATH_HOURS) || d.DEATH_HOURS <= 0 || Math.abs(hoursPm - d.DEATH_HOURS * 1000) > 1e-9) {
    problems.push('DEATH_HOURS must be a positive whole permille of an hour, got ' + d.DEATH_HOURS); }
  if (!(Math.round(d.DEATH_XP_LOSS * 1000) > 0)) problems.push('DEATH_XP_LOSS must price something, got ' + d.DEATH_XP_LOSS);
  if (problems.length) throw new Error('gen-level-costs: ' + problems.join('; '));
  const B = d.BLESSING, R = d.TALENT_RESET;
  /* the dearest prices there can be stay safe integers: the client's number and the server's bigint agree to the gold */
  const topBless = d.blessingPrice(d.stepMax, B);
  if (!Number.isSafeInteger(topBless)) throw new Error('gen-level-costs: the Blessing at step ' + d.stepMax + ' costs ' + topBless + ', past a safe integer');
  const topReset = d.resetPrice(d.stepMax, R.perDay - 1, R);
  if (!Number.isSafeInteger(topReset)) throw new Error('gen-level-costs: reset ' + R.perDay + ' of a day at step ' + d.stepMax + ' costs ' + topReset + ', past a safe integer');
  /* THE DEATH NEVER COSTS LESS FOR MORE XP: inside a Level the hours are one number and the share grows, so the price can only fall at a
     Level's first XP. Each Level's first XP against the last XP of the Level before it, every Level to the last step. */
  for (let L = 2; L <= d.stepMax; L++) {
    const x = d.charXpForLevel(L);
    if (!Number.isSafeInteger(x)) break;
    if (d.levelDeathLoss(x) < d.levelDeathLoss(x - 1)) {
      throw new Error('gen-level-costs: a death at Level ' + L + ' (' + d.levelDeathLoss(x) + ' XP) costs less than one XP short of it (' + d.levelDeathLoss(x - 1) + ')'); }
  }
  const row = { deathHoursPm: hoursPm, blessCutPm: B.cutPm, blessHoursPm: B.hoursPm, blessFreeUntil: B.freeUntilLevel,
    resetHoursPm: R.hoursPm, resetGrowthNum: R.growthNum, resetGrowthDen: R.growthDen, resetPerDay: R.perDay };
  const sharePm = Math.round(d.DEATH_XP_LOSS * 1000);
  const deathPins = [];
  for (const L of PIN_LEVELS) {
    const x = d.charXpForLevel(L);
    if (!Number.isSafeInteger(x)) continue;
    for (const pm of [1000, 500]) {
      const hours = Math.ceil(((hoursPm * pm) / 1e6) * d.levelHourXp(L));
      /* the engine's own price at this XP and strength, and the bound's: the share floored, the hours rounded up */
      const engine = d.levelDeathLoss(x + 1, (sharePm * pm) / 1e6);
      const bound = Math.min(Math.floor(((x + 1) * sharePm * pm) / 1e6), hours);
      deathPins.push({ L, pm, x: x + 1, hours, engine, bound });
    }
  }
  const blessPins = PIN_LEVELS.map((L) => ({ L, price: d.blessingPrice(L, B) }));
  const resetPins = [];
  for (const L of PIN_LEVELS) for (const n of [0, 1, 2, 3, R.perDay - 1, R.perDay]) resetPins.push({ L, n, price: d.resetPrice(L, n, R) });
  return { row, sharePm, deathPins, blessPins, resetPins, stepMax: d.stepMax };
}

const nul = (v) => (v === null ? 'null' : String(v));

export function buildSql(r) {
  const R = r.row;
  const deathValues = r.deathPins.map((p) => `    (${p.L}, ${p.pm}, ${p.x}::bigint, ${p.hours}::bigint, ${p.engine}::bigint, ${p.bound}::bigint)`).join(',\n');
  const blessValues = r.blessPins.map((p) => `    (${p.L}, ${nul(p.price)}::bigint)`).join(',\n');
  const resetValues = r.resetPins.map((p) => `    (${p.L}, ${p.n}, ${nul(p.price)}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PER-HERO COSTS BY LEVEL  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-level-costs.mjs from src/data/hunt-sessions.js (DEATH_HOURS), src/data/blessings.js (BLESSING),
--   src/data/talent-reset.js (TALENT_RESET) and their rules in src/core (action-rules.js levelDeathLoss, wage.js blessingPrice and
--   resetPrice). Any hand edit FAILS \`node tools/gen-level-costs.mjs --check\`.
--
-- WHAT (lane/level-costs, backend-architect, 2026-11-22; Tyler 2026-11-22: per-hero costs read the wage at the hero's LEVEL; 02 sections
-- 1b and 6, 04 sections 5 and 11): the numbers the server reads, so none is typed twice.
--   hr_level_costs          1 row, rewritten whole: a death's ${R.deathHoursPm / 1000} hours, the Blessing's ${R.blessCutPm / 10}% cut at ${R.blessHoursPm / 1000} hours of wage
--                           (free under Level ${R.blessFreeUntil}), a reset at ${R.resetHoursPm / 1000} hours of wage x ${R.resetGrowthNum}/${R.resetGrowthDen} a paid reset that day (${R.resetPerDay} a day at most).
--   hr_death_hours_xp       NEW, internal: the hours price of a death at a Level and a strength (permille of the full rule), rounded up.
--   hr_death_xp_mode_max    RESTATED, internal: the settle's bound on a death (hr_hunt_apply_member (6)): Level, the lesser of the share
--                           and the hours; a skill, the share of its progress (unchanged). At 1000 the full price, at 0 nothing.
--   hr_blessing_price       RESTATED, internal: the one Blessing's price at a Level (tier 1; any other tier null).
--   hr_talent_reset_price   NEW, internal: a paid Talent reset's price at a Level, given the resets paid that day (null at the cap).
-- READERS: hr_hunt_apply_member (the death bound), 1063-level-costs.sql (the Blessing's section, buy and take; the dark reset verb).
-- ORDER: 1063 in its name, before 1063-level-costs.sql. Idempotent: the table is made if missing and its row rewritten whole, the
-- functions restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added here. A catalogue table, RLS on, no policy, no grant to any client role; every twin revoked from every
-- client role. hr_death_xp_mode_max may only shrink a debit: it bounds what the engine proposes, it never adds one.
-- REVERSIBLE: restate hr_death_xp_mode_max from 2027-04-23-session-modes.sql and hr_blessing_price from 2027-02-10-settle-plan-cache
-- .generated.sql (with the three tier rows put back), then drop the new functions and the table (after 1063-level-costs.sql's readers).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the wage first (hr_wage, 1058-hunting-blocks-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_danger_hours_for(integer)') is null or to_regprocedure('public.hr_char_xp_for_level(integer)') is null
     or to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null or to_regprocedure('public.hr_skill_xp_for_level(text,integer)') is null then
    raise exception 'PRECONDITION: the hours table, the Level curve and the hunt limits first'; end if;
  if public.hr_hunt_limit('death_xp_permille') is distinct from ${r.sharePm} then
    raise exception 'PRECONDITION: the death share is % permille in hr_hunt_limits, % in src/data/hunt-sessions.js', public.hr_hunt_limit('death_xp_permille'), ${r.sharePm}; end if;
end $mig$;

-- ── §1 THE TABLE AND ITS ROW ─────────────────────────────────────────────────
create table if not exists public.hr_level_costs (
  id               boolean primary key default true check (id),
  death_hours_pm   int not null check (death_hours_pm > 0),
  bless_cut_pm     int not null check (bless_cut_pm between 1 and 1000),
  bless_hours_pm   int not null check (bless_hours_pm >= 1),
  bless_free_until int not null check (bless_free_until >= 0),
  reset_hours_pm   int not null check (reset_hours_pm >= 1),
  reset_growth_num int not null check (reset_growth_num >= 1),
  reset_growth_den int not null check (reset_growth_den >= 1),
  reset_per_day    int not null check (reset_per_day between 1 and 64),
  check (reset_growth_num >= reset_growth_den)
);
alter table public.hr_level_costs enable row level security;
revoke all on public.hr_level_costs from public, anon, authenticated, service_role;
comment on table public.hr_level_costs is '${OUT_NAME}: the per-hero costs by Level, one row (src/data through tools/gen-level-costs.mjs).';
delete from public.hr_level_costs;
insert into public.hr_level_costs (id, death_hours_pm, bless_cut_pm, bless_hours_pm, bless_free_until, reset_hours_pm, reset_growth_num, reset_growth_den, reset_per_day)
  values (true, ${R.deathHoursPm}, ${R.blessCutPm}, ${R.blessHoursPm}, ${R.blessFreeUntil}, ${R.resetHoursPm}, ${R.resetGrowthNum}, ${R.resetGrowthDen}, ${R.resetPerDay});

-- ── §2 THE DEATH'S TWINS (internal) ──────────────────────────────────────────
create or replace function public.hr_death_hours_xp(p_level int, p_pm int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_h int; v_l int := greatest(1, coalesce(p_level, 1)); v_hours numeric;
begin
  -- LEVEL-COSTS (${OUT_NAME}; src/core/action-rules.js levelDeathLoss's hours): death_hours_pm x p_pm / 1e6 reference hours of
  -- progress at Level p_level, the hours table's Level XP an hour there (the Level's XP over hr_danger_hours_for), rounded UP.
  select death_hours_pm into v_h from public.hr_level_costs where id;
  v_hours := public.hr_danger_hours_for(v_l);
  if v_h is null or v_hours is null or v_hours <= 0 or p_pm is null or p_pm < 0 or p_pm > 1000 then return null; end if;
  return ceil(v_h::numeric * p_pm * (public.hr_char_xp_for_level(v_l + 1) - public.hr_char_xp_for_level(v_l)) / (1000000 * v_hours))::bigint;
end $fn$;

create or replace function public.hr_death_xp_mode_max(p_skill text, p_xp bigint, p_mode_pm int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_rate int := public.hr_hunt_limit('death_xp_permille'); v_x bigint := greatest(coalesce(p_xp, 0), 0); v_h bigint;
begin
  -- SESSION-MODES (2027-04-23-session-modes.sql): at the instance mode's share (p_mode_pm: 1000 the full price, 0 nothing).
  -- LEVEL-COSTS (${OUT_NAME}): the Level loses the LESSER of the share of its total (floored) and the hours at its Level
  -- (hr_death_hours_xp, rounded up); a skill the share of its progress, never a level. Read on the CURRENT values, which only grew.
  if v_rate is null or v_rate < 0 or v_rate > 1000 or p_skill is null or p_mode_pm is null or p_mode_pm < 0 or p_mode_pm > 1000 then return null; end if;
  if p_skill = 'level' then
    v_h := public.hr_death_hours_xp(public.hr_char_level(v_x), p_mode_pm);
    -- FAIL CLOSED: hours the server cannot price (no hr_level_costs row, no hours table) bound the Level at 0, so the settle refuses
    -- any death XP (death_xp_over) rather than taking an unbounded one (a null bound never refuses: v_n > null is not true).
    if v_h is null then return 0; end if;
    return least(floor(v_x::numeric * v_rate * p_mode_pm / 1000000)::bigint, v_h);
  end if;
  return floor((v_x - public.hr_skill_xp_for_level(p_skill, public.hr_skill_level(p_skill, v_x)))::numeric * v_rate * p_mode_pm / 1000000)::bigint;
end $fn$;

-- ── §3 THE PRICES' TWINS (internal) ──────────────────────────────────────────
create or replace function public.hr_blessing_price(p_tier integer, p_level integer)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_level_costs%rowtype; v_l int := greatest(1, coalesce(p_level, 1));
begin
  -- LEVEL-COSTS (${OUT_NAME}; src/core/wage.js blessingPrice): the ONE Blessing (tier 1): free under bless_free_until, else
  -- bless_hours_pm of an hour of the wage at the hero's Level, rounded up. Any other tier is no Blessing: null.
  select * into c from public.hr_level_costs where id;
  if not found or p_tier is distinct from 1 then return null; end if;
  if v_l < c.bless_free_until then return 0; end if;
  return div(c.bless_hours_pm::numeric * public.hr_wage(v_l) + 999, 1000)::bigint;
end $fn$;

create or replace function public.hr_talent_reset_price(p_level int, p_paid int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare c public.hr_level_costs%rowtype; v_num numeric; v_den numeric;
begin
  -- LEVEL-COSTS (${OUT_NAME}; src/core/wage.js resetPrice): reset_hours_pm of an hour of the wage at the hero's Level x
  -- (growth_num / growth_den) ^ p_paid (the resets paid that server day, 0 for the first), rounded up; null at the day's cap.
  select * into c from public.hr_level_costs where id;
  if not found or p_paid is null or p_paid < 0 or p_paid >= c.reset_per_day then return null; end if;
  v_num := c.reset_hours_pm::numeric * public.hr_wage(p_level) * power(c.reset_growth_num::numeric, p_paid);
  v_den := 1000::numeric * power(c.reset_growth_den::numeric, p_paid);
  return div(v_num + v_den - 1, v_den)::bigint;
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_death_hours_xp(integer,integer)', 'public.hr_death_xp_mode_max(text,bigint,integer)',
                               'public.hr_blessing_price(integer,integer)', 'public.hr_talent_reset_price(integer,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The row is the data's; no client role reads the table or runs a twin; each twin answers the JS at every pinned Level: the death's
-- hours within the one gold of rounding up a float (the engine floors the same product), the settle's bound never under the engine's
-- price and never a whole XP over it, the Blessing and the reset to the gold.
do $mig$
declare v_r record; v_p bigint;
begin
  if (select count(*) from public.hr_level_costs) <> 1
     or (select death_hours_pm || ':' || bless_cut_pm || ':' || bless_hours_pm || ':' || bless_free_until || ':' || reset_hours_pm || ':'
                || reset_growth_num || ':' || reset_growth_den || ':' || reset_per_day from public.hr_level_costs)
        is distinct from '${[R.deathHoursPm, R.blessCutPm, R.blessHoursPm, R.blessFreeUntil, R.resetHoursPm, R.resetGrowthNum, R.resetGrowthDen, R.resetPerDay].join(':')}' then
    raise exception 'VERIFY(a): hr_level_costs is not the data''s row'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_level_costs', 'select')
                 or has_function_privilege(g.r, 'public.hr_death_hours_xp(integer,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_death_xp_mode_max(text,bigint,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_blessing_price(integer,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_talent_reset_price(integer,integer)', 'execute')) then
    raise exception 'VERIFY(b): a client role reads the per-hero costs'; end if;
  for v_r in select * from (values
${deathValues}) p(l, pm, x, hours, engine, bound) loop
    v_p := public.hr_death_hours_xp(v_r.l, v_r.pm);
    if v_p is null or abs(v_p - v_r.hours) > 1 then
      raise exception 'VERIFY(c): a death''s hours at Level % (strength %) are % in SQL, % in src/core/action-rules.js', v_r.l, v_r.pm, v_p, v_r.hours; end if;
    v_p := public.hr_death_xp_mode_max('level', v_r.x, v_r.pm);
    if v_p is null or v_p < v_r.engine or v_p > v_r.engine + 1 or abs(v_p - v_r.bound) > 1 then
      raise exception 'VERIFY(c): the bound on a Level % death (strength %) is % in SQL; the engine prices %, its bound %', v_r.l, v_r.pm, v_p, v_r.engine, v_r.bound; end if;
  end loop;
  if public.hr_death_xp_mode_max('level', ${r.deathPins.length ? r.deathPins[r.deathPins.length - 1].x : 1}, 0) <> 0 then
    raise exception 'VERIFY(c): a mode that prices nothing bounds a death above 0'; end if;
  -- FAIL CLOSED: with no row the hours cannot be priced, and the bound is 0 (every death XP refused), never null (never refused).
  begin
    delete from public.hr_level_costs;
    if public.hr_death_xp_mode_max('level', ${r.deathPins.length ? r.deathPins[r.deathPins.length - 1].x : 1}, 1000) is distinct from 0 then
      raise exception 'VERIFY(c): with no hr_level_costs row the bound on a death is %, not 0', public.hr_death_xp_mode_max('level', ${r.deathPins.length ? r.deathPins[r.deathPins.length - 1].x : 1}, 1000); end if;
    raise exception using errcode = 'HR864', message = 'gen-level-costs: the fail-closed probe rolls back';
  exception when sqlstate 'HR864' then null;
  end;
  for v_r in select * from (values
${blessValues}) p(l, price) loop
    v_p := public.hr_blessing_price(1, v_r.l);
    if v_p is distinct from v_r.price then
      raise exception 'VERIFY(d): the Blessing at Level % costs % in SQL, % in src/core/wage.js', v_r.l, v_p, v_r.price; end if;
  end loop;
  if public.hr_blessing_price(2, 100) is not null or public.hr_blessing_price(0, 100) is not null then
    raise exception 'VERIFY(d): a second Blessing tier is priced'; end if;
  for v_r in select * from (values
${resetValues}) p(l, n, price) loop
    v_p := public.hr_talent_reset_price(v_r.l, v_r.n);
    if v_p is distinct from v_r.price then
      raise exception 'VERIFY(e): paid reset % of a day at Level % costs % in SQL, % in src/core/wage.js', v_r.n + 1, v_r.l, v_p, v_r.price; end if;
  end loop;
  raise notice 'gen-level-costs: the row, the death pinned at % points, the Blessing at %, the reset at %; all green', ${r.deathPins.length}, ${r.blessPins.length}, ${r.resetPins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const d = { ...base, BLESSING: { ...base.BLESSING }, TALENT_RESET: { ...base.TALENT_RESET } };
    patch(d);
    try { rowsOf(d); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('a death of no hours', (d) => { d.DEATH_HOURS = 0; });
  plant('a death in a part of a permille of an hour', (d) => { d.DEATH_HOURS = 7.5004; });
  plant('a Blessing that cuts nothing', (d) => { d.BLESSING.cutPm = 0; });
  plant('a Blessing that cuts more than the death', (d) => { d.BLESSING.cutPm = 1001; });
  plant('a Blessing that costs nothing past its free Level', (d) => { d.BLESSING.hoursPm = 0; });
  plant('a reset cheaper than the one before it', (d) => { d.TALENT_RESET.growthNum = 1; d.TALENT_RESET.growthDen = 2; });
  plant('a reset of no price', (d) => { d.TALENT_RESET.hoursPm = 0; });
  plant('a day of resets whose last passes a safe integer', (d) => { d.TALENT_RESET.perDay = 64; d.TALENT_RESET.growthNum = 3; });
  plant('a Blessing whose last-step price passes a safe integer', (d) => { d.BLESSING.hoursPm = 1e9; });
  plant('a death price that falls as Level XP grows', (d) => { const f = base.levelDeathLoss; d.levelDeathLoss = (x, s) => (base.charXpForLevel(200) === x ? 0 : f(x, s)); });
  if (base.validateBlessing(base.BLESSING).length || base.validateReset(base.TALENT_RESET).length) bites.push('the shipped rows are refused');
  const sql = buildSql(rowsOf(base));
  for (const k of ['VERIFY(c)', 'VERIFY(d)', 'VERIFY(e)', 'hr_death_hours_xp', 'hr_death_xp_mode_max', 'hr_blessing_price', 'hr_talent_reset_price']) {
    if (!sql.includes(k)) bites.push('the file does not carry ' + k); }
  if (bites.length) { console.error('gen-level-costs --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-level-costs --selftest: 10 refusals bite, every twin is pinned');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-level-costs --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-level-costs.mjs'); process.exit(1); }
      console.log('gen-level-costs --check: catalogue matches src/data and src/core');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
