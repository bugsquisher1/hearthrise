#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-danger.mjs — GENERATE THE SERVER'S DANGER-SCALE CATALOGUE (lane/v1-climb wave 1; 02 package 3, 04 sections 5 and 7).
//
// src/data/danger.js is the one source of the scale's numbers (DANGER, CLIMB, RISKS, PAY, DANGER_GROUNDS) and core-model.js
// LEVEL_HOURS the one source of the hours a Level takes (a formula with three whole levers, lane/formula-overhaul 2026-11-22). The engine reads the data (src/core/hunt/danger.js); the server reads
// these tables when it freezes a hunt's stance and start step (1056-danger-scale.sql hr_danger_freeze) and when it bounds a window
// played on the scale (hr_danger_bound). This writes them whole, with the SQL twins of the two pay functions and a self-check.
//   hr_danger_rules     one row: step_max, pull_max, respawn_ms, start_margin, climb_max, clean_run, regroup_ms (hunt-tuning.js: every
//                       cleared pull rests at least this long, so a window's climb is bounded by its time), the pay levers (ppm), the hours levers,
//                       default_risk (DEFAULT_RISK: the stance a hunt on the scale plays when its plan names none; 1057-danger-falls.sql)
//   hr_danger_stances   per stance: rank (0 the safest), fall_pm, clean_pm, after_death (the stance a death settles to, never bolder)
//   hr_danger_grounds   per ground the scale opens on: ref_step, share_pm_max (the most of a row's health one monster carries at any step),
//                       coin_pm_max (the most of a row's coin one kill pays: that share x PAY.coinPm x the depth ratio at the gap ceiling, at danger.js COIN_STEP, the wage's coin ratio an hour)
//   hr_danger_hours_for(level)     danger.js hoursForLevel
//   hr_danger_level_xp_max(level)  ceil(danger.js levelShareXp at the gap ceiling): the most one kill alone pays a hero of that Level
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-danger.mjs            write OUT_NAME
//   node tools/gen-danger.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-danger.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a stance list not ordered safest first with each death settling to the same or a safer stance and
// fall_pm < clean_pm; a default stance that is no stance; a ground row that is no open hunting ground (its hunt id = its ground id; not the Tower, a yard, a hall or a call);
// a reference step outside 0..stepMax; a non-whole pay step in ppm; an hours lever that is not a positive whole number; a rowsKillsHead
// (the kill rate a ground's coin and drop rows were written at, src/core/hunt/danger.js rowsKeptOf) that is no whole kill rate; a formulaStep (where a
// formula ground's reference monsters stand, danger.js formulaStepOf) off the scale.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 1055 made the tables (applied or staged, it is history now); lane/r10-more-grounds's grounds and bands are this forward file */
export const OUT_NAME = '1061-danger-grounds-danger-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ppm = (x, what) => { const v = Math.round(x * 1e6); if (Math.abs(v - x * 1e6) > 1e-6 || v < 0) throw new Error('gen-danger: ' + what + ' ' + x + ' is not a whole ppm'); return v; };
/* the Levels the SQL twins are pinned at (the self-check) */
export const PIN_LEVELS = Object.freeze([1, 9, 40, 60, 75, 300, 1000]);

async function load(root) {
  const v = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + v);
  const [data, core, model, grounds, tuning, wage] = await Promise.all([imp('src/data/danger.js'), imp('src/core/hunt/danger.js'), imp('src/data/core-model.js'),
    imp('src/data/hunt-grounds.js'), imp('src/data/hunt-tuning.js'), imp('src/data/wage.js')]);
  return { data, core, model, grounds, tuning, wage };
}

/** The resolved rows of the data, refused on a defect. */
export function rowsOf({ data, core, model, grounds, tuning, wage }) {
  const { DANGER, CLIMB, RISKS, PAY, DANGER_GROUNDS } = data;
  const ids = Object.keys(RISKS);
  ids.forEach((id, rank) => {
    const st = RISKS[id];
    if (!ID.test(id)) throw new Error('gen-danger: stance ' + id + ' is not [a-z0-9_]');
    if (!(Number.isInteger(st.fallPm) && Number.isInteger(st.cleanPm) && st.fallPm > 0 && st.fallPm < st.cleanPm && st.cleanPm <= 1000)) throw new Error('gen-danger: stance ' + id + ' thresholds ' + st.fallPm + ' / ' + st.cleanPm);
    if (!own(RISKS, st.afterDeath) || ids.indexOf(st.afterDeath) > rank) throw new Error('gen-danger: a death on ' + id + ' settles to ' + st.afterDeath + ', not the same or a safer stance');
    /* safest first: each stance holds on longer (a lower trigger) than the one before */
    if (rank > 0 && !(st.fallPm < RISKS[ids[rank - 1]].fallPm)) throw new Error('gen-danger: stance ' + id + ' is not bolder than ' + ids[rank - 1]);
  });
  const stances = ids.map((id, rank) => ({ id, rank, fall: RISKS[id].fallPm, clean: RISKS[id].cleanPm, after: RISKS[id].afterDeath }));
  if (typeof data.DEFAULT_RISK !== 'string' || !own(RISKS, data.DEFAULT_RISK)) throw new Error('gen-danger: the default stance ' + data.DEFAULT_RISK + ' is no stance');
  /* THE HOURS A LEVEL TAKES (core-model.js LEVEL_HOURS): ceiling x L^2 / ((L + half) x (L + early)), three whole levers (half at least 1, or
     the curve never levels off; early may be 0) */
  const LH = model.LEVEL_HOURS || {};
  for (const k of ['ceiling', 'half', 'early']) if (!Number.isSafeInteger(LH[k]) || LH[k] < (k === 'early' ? 0 : 1)) throw new Error('gen-danger: LEVEL_HOURS.' + k + ' ' + LH[k] + ' is not a positive whole number');
  const rules = {
    step_max: DANGER.stepMax, pull_max: DANGER.pullMax, respawn_ms: DANGER.respawnMs, start_margin: DANGER.startMargin,
    climb_max: CLIMB.climbMax, clean_run: CLIMB.cleanRun, regroup_ms: tuning.HUNT_TUNING.regroupMs, power_step_ppm: ppm(DANGER.powerStep, 'powerStep'),
    pay_step_xp_ppm: ppm(PAY.payStepXp, 'payStepXp'), pay_step_coin_ppm: ppm(wage.WAGE.payStepCoin, 'payStepCoin'), gap_max: PAY.gapMax,
    ref_kills_head: PAY.refKillsHead, hours_ceiling: LH.ceiling, hours_half: LH.half, hours_early: LH.early, default_risk: data.DEFAULT_RISK,
  };
  for (const k of ['step_max', 'pull_max', 'respawn_ms', 'start_margin', 'climb_max', 'clean_run', 'regroup_ms', 'gap_max', 'ref_kills_head', 'hours_ceiling', 'hours_half', 'hours_early']) {
    if (!Number.isInteger(rules[k]) || rules[k] < 0) throw new Error('gen-danger: ' + k + ' ' + rules[k] + ' is not a whole number');
  }
  const ground = [];
  for (const id of Object.keys(DANGER_GROUNDS).sort()) {
    const g = grounds.HUNT_GROUNDS[id];
    if (!g || g.hunt !== id || own(grounds.TOWER_GROUNDS || {}, id) || own(grounds.TRAINING_GROUNDS || {}, id) || own(grounds.HALL_GROUNDS || {}, id) || own(grounds.CALLED_GROUNDS || {}, id)) {
      throw new Error('gen-danger: ' + id + ' is no hunting ground whose hunt is its id');
    }
    /* THE PAY'S REFERENCE (src/core/hunt/danger.js refOf): refStep, where the reference company holds (a formula ground's monsters may
       stand elsewhere, formulaStep). The server's one reader of ref_step is the store's depth (1062 hr_store_step: the wage at refLevel
       there), so a store use is priced at the same reference the engine pays by */
    const ref = DANGER_GROUNDS[id].refStep;
    if (!Number.isInteger(ref) || ref < 0 || ref > DANGER.stepMax) throw new Error('gen-danger: ' + id + ' refStep ' + ref);
    /* THE BAND (lane/r10-more-grounds; 12-targets.md 3.1): floor under the reference under the top, inside the scale; the engine climbs no
       step past the top and pays no more there (src/core/hunt/danger.js stepOn, gapOf) */
    const { floorStep: lo, topStep: hi } = DANGER_GROUNDS[id];
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || !(lo >= 0 && lo < ref && ref < hi && hi <= DANGER.stepMax)) throw new Error('gen-danger: ' + id + ' band ' + lo + ' / ' + ref + ' / ' + hi + ' is not floor < refStep < top inside the scale');
    /* A GROUND'S OWN KILL RATE is never under the scale's: the server bounds a kill by hr_danger_level_xp_max at PAY.refKillsHead, and a
       ground split over fewer kills would pay a kill over it */
    const rk = DANGER_GROUNDS[id].refKillsHead;
    if (rk !== undefined && !(Number.isInteger(rk) && rk >= PAY.refKillsHead)) throw new Error('gen-danger: ' + id + ' refKillsHead ' + rk + ' is under the scale\'s ' + PAY.refKillsHead + ' (the server\'s ceiling a kill)');
    /* ROWS KEPT IN THEIR HOURS (lane/monster-roles-ford-wings; src/core/hunt/danger.js rowsKeptOf): the kill rate a ground's coin and drop
       rows were written at is a whole number of kills a head an hour; the coin ceiling below reads the dial it scales, so it follows */
    const ck = DANGER_GROUNDS[id].rowsKillsHead;
    if (ck !== undefined && !(Number.isInteger(ck) && ck >= 1)) throw new Error('gen-danger: ' + id + ' rowsKillsHead ' + ck + ' is no whole kill rate a head an hour');
    /* THE FORMULA'S ANCHOR (lane/monster-roles-ford-wings; src/core/hunt/danger.js formulaStepOf): where a formula ground's reference
       monsters stand, a step inside the scale; the share and coin ceilings below read the dial that sizes the pull from it */
    const fs = DANGER_GROUNDS[id].formulaStep;
    if (fs !== undefined && !(Number.isInteger(fs) && fs >= 0 && fs <= DANGER.stepMax)) throw new Error('gen-danger: ' + id + ' formulaStep ' + fs + ' is no step on the scale');
    /* A STAGED GROUND (its hunt `staged`: the Catacombs' wings) is carried in the data and judged here, and served only once it opens: the
       server's freeze opens the scale on these rows alone, and a staged ground is no hr_hunt_grounds row */
    const open = grounds.OPEN_GROUNDS ? (Array.isArray(grounds.OPEN_GROUNDS) ? grounds.OPEN_GROUNDS.includes(id) : own(grounds.OPEN_GROUNDS, id)) : true;
    if (!open) continue;
    /* the most of a row's health one monster carries at any step: the dial's hpPm over the step's power ratio */
    let share = 0, pw = 1;
    /* (every party size: a formula ground's pull is sized to the party, src/core/hunt/danger.js formulaPull; any other ground reads none) */
    for (let s = 0; s <= DANGER.stepMax; s++, pw *= 1 + DANGER.powerStep) for (const n of [1, 2, 3, 4]) share = Math.max(share, core.dangerDial(g, s, n).hpPm / 1000 / pw);
    const coin = Math.max(...Array.from({ length: DANGER.stepMax + 1 }, (_, s) => core.dangerDial(g, s).coinPm));
    ground.push({ id, ref, sharePm: Math.ceil(share * 1000 + 1e-6), coinPm: Math.ceil(coin + 1e-6) });
  }
  const pins = PIN_LEVELS.map((L) => ({ L, hours: core.hoursForLevel(L), xpMax: levelXpMaxOf(core, PAY, L) }));
  return { stances, rules, ground, pins };
}
/* the most one kill alone pays a hero of Level L: its share at the gap ceiling (gapOf holds any step past ref + gapMax there) */
function levelXpMaxOf(core, PAY, L) {
  const g = { id: '__ceiling__' };
  return core.levelShareXp(L, PAY.gapMax, g);
}

const lit = (x) => String(x);

export function buildSql(r) {
  const R = r.rules;
  const stanceValues = r.stances.map((s) => `  ('${s.id}', ${s.rank}, ${s.fall}, ${s.clean}, '${s.after}')`).join(',\n');
  const groundValues = r.ground.map((g) => `  ('${g.id}', ${g.ref}, ${g.sharePm}, ${g.coinPm})`).join(',\n');
  const pinChecks = r.pins.map((p) => `    (${p.L}, ${p.hours}::numeric, ${Math.ceil(p.xpMax - 1e-9)}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DANGER SCALE'S CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-danger.mjs from src/data/danger.js (DANGER, CLIMB, RISKS, PAY, DANGER_GROUNDS) and src/data/core-model.js
--   LEVEL_HOURS. Any hand edit FAILS \`node tools/gen-danger.mjs --check\`.
--
-- WHAT (lane/v1-climb wave 1, backend-architect, 2026-11-22; 02 package 3, 04 sections 5 and 7): the scale's numbers the server reads, so
-- no number is typed twice. hr_danger_rules (one row), hr_danger_stances (${r.stances.length} rows), hr_danger_grounds (${r.ground.length} row${r.ground.length === 1 ? '' : 's'}), rewritten whole;
-- hr_danger_hours_for(level) and hr_danger_level_xp_max(level), internal (no client grant), the twins of danger.js hoursForLevel and
-- levelShareXp at the gap ceiling, pinned to the JS values at Levels ${PIN_LEVELS.join(', ')} (§3).
-- READERS: 1056-danger-scale.sql's freeze (the stance and the start step a hunt opens at), its bound (a window on the scale) and the
-- \`danger\` section. The engine reads the same numbers from the data.
-- MORE GROUNDS (lane/r10-more-grounds, systems-engineer, 2026-11-22; 12-targets.md 3 and 7): every open ground of DANGER_GROUNDS, each with its
-- band (floor < reference < top, measured: tools/balance-program/redesign/r10). The engine climbs no step past a ground's top and pays no more
-- there, so each coin ceiling below is read at min(gapMax, top - reference). A staged ground (the Catacombs' two wings) is judged by the
-- generator and left out of the rows until it opens.
-- ORDER: ${OUT_NAME.slice(0, 4)} in its name: after 1055 (the first cut of this catalogue, which made the tables) and 1056/1057 (their
-- readers). Idempotent: the tables are made if missing and their rows rewritten whole, the functions restated, so a second apply is
-- byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. Catalogue tables, RLS on, no policy, no grant to any client role; two internal functions revoked from
-- every client role. No value moves here.
-- DEFAULT (lane/r2-danger-falls, backend-architect, 2026-11-22; 02 package 8, "the first party ground runs on Steady"): hr_danger_rules.default_risk,
-- the stance a hunt on the scale plays when its leader's plan names none (src/data/danger.js DEFAULT_RISK), read by 1057-danger-falls.sql's
-- hr_danger_freeze. The column is made if missing (an older apply of this file), so a second apply is byte-identical.
-- REVERSIBLE: drop the two functions and the three tables (after 1056's readers are gone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_grounds') is null then
    raise exception 'PRECONDITION: the hunt-sessions catalogue first (hr_hunt_grounds)'; end if;
  if to_regprocedure('public.hr_char_xp_for_level(integer)') is null then
    raise exception 'PRECONDITION: the Level curve first (hr_char_xp_for_level)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_danger_rules (
  id                boolean primary key default true check (id),
  step_max          int not null check (step_max between 1 and 100000),
  pull_max          int not null check (pull_max between 1 and 16),
  respawn_ms        int not null check (respawn_ms between 1000 and 600000),
  start_margin      int not null check (start_margin >= 0),
  climb_max         int not null check (climb_max >= 1),
  clean_run         int not null check (clean_run >= 1),
  regroup_ms        int not null check (regroup_ms >= 100),
  power_step_ppm    int not null check (power_step_ppm between 1 and 100000),
  pay_step_xp_ppm   int not null check (pay_step_xp_ppm between 0 and 100000),
  pay_step_coin_ppm int not null check (pay_step_coin_ppm between 0 and 100000),
  gap_max           int not null check (gap_max >= 0),
  ref_kills_head    int not null check (ref_kills_head >= 1),
  hours_ceiling     int not null check (hours_ceiling >= 1),
  hours_half        int not null check (hours_half >= 1),
  hours_early       int not null check (hours_early >= 0),
  default_risk      text not null check (default_risk ~ '^[a-z0-9_]{1,64}$')
);
alter table public.hr_danger_rules add column if not exists default_risk text;
-- THE HOURS FORMULA (lane/formula-overhaul, 2026-11-22): the hand table's spans (1055's hours_at / hours_per) give way to three levers, made
-- if missing. 1055's two columns stay, emptied and no longer required, so a second apply of 1055 (which writes them) still runs; they leave
-- with 1055 when the chain retires it (tools/chain-retire.mjs). Nothing reads them: hr_danger_hours_for below reads the levers.
do $mig$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_danger_rules' and column_name = 'hours_at') then
    alter table public.hr_danger_rules alter column hours_at drop not null;
    alter table public.hr_danger_rules alter column hours_per drop not null; end if;
end $mig$;
alter table public.hr_danger_rules add column if not exists hours_ceiling int check (hours_ceiling >= 1);
alter table public.hr_danger_rules add column if not exists hours_half int check (hours_half >= 1);
alter table public.hr_danger_rules add column if not exists hours_early int check (hours_early >= 0);
create table if not exists public.hr_danger_stances (
  risk        text primary key check (risk ~ '^[a-z0-9_]{1,64}$'),
  rank        int  not null unique check (rank >= 0),
  fall_pm     int  not null check (fall_pm between 1 and 1000),
  clean_pm    int  not null check (clean_pm between 1 and 1000),
  after_death text not null,
  check (fall_pm < clean_pm)
);
create table if not exists public.hr_danger_grounds (
  hunt_id      text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  ref_step     int  not null check (ref_step >= 0),
  share_pm_max int  not null check (share_pm_max >= 1),
  coin_pm_max  int  not null check (coin_pm_max >= 0)
);
alter table public.hr_danger_rules enable row level security;
alter table public.hr_danger_stances enable row level security;
alter table public.hr_danger_grounds enable row level security;
revoke all on public.hr_danger_rules, public.hr_danger_stances, public.hr_danger_grounds from public, anon, authenticated, service_role;
comment on table public.hr_danger_rules is '${OUT_NAME}: the Danger scale''s numbers (src/data/danger.js through tools/gen-danger.mjs). One row.';
comment on table public.hr_danger_stances is '${OUT_NAME}: the risk stances, safest first (src/data/danger.js RISKS). A death settles a hunt to after_death, never bolder.';
comment on table public.hr_danger_grounds is '${OUT_NAME}: the grounds the Danger scale opens on (src/data/danger.js DANGER_GROUNDS), each with its reference step; no row = a stance plays the tier there.';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_danger_rules;
insert into public.hr_danger_rules (id, step_max, pull_max, respawn_ms, start_margin, climb_max, clean_run, regroup_ms, power_step_ppm, pay_step_xp_ppm,
  pay_step_coin_ppm, gap_max, ref_kills_head, hours_ceiling, hours_half, hours_early, default_risk) values
  (true, ${R.step_max}, ${R.pull_max}, ${R.respawn_ms}, ${R.start_margin}, ${R.climb_max}, ${R.clean_run}, ${R.regroup_ms}, ${R.power_step_ppm}, ${R.pay_step_xp_ppm},
   ${R.pay_step_coin_ppm}, ${R.gap_max}, ${R.ref_kills_head}, ${R.hours_ceiling}, ${R.hours_half}, ${R.hours_early}, '${R.default_risk}');
delete from public.hr_danger_stances;
insert into public.hr_danger_stances (risk, rank, fall_pm, clean_pm, after_death) values
${stanceValues};
delete from public.hr_danger_grounds;
insert into public.hr_danger_grounds (hunt_id, ref_step, share_pm_max, coin_pm_max) values
${groundValues};

-- ── §2b THE PAY'S SQL TWINS (internal) ──────────────────────────────────────
create or replace function public.hr_danger_hours_for(p_level int)
returns numeric language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_danger_rules%rowtype; v_l numeric := greatest(1, coalesce(p_level, 1));
begin
  -- DANGER-SCALE (${OUT_NAME}): danger.js hoursForLevel, core-model.js LEVEL_HOURS: ceiling x L^2 / ((L + half) x (L + early)).
  select * into r from public.hr_danger_rules where id;
  if not found then return null; end if;
  return r.hours_ceiling * v_l * v_l / ((v_l + r.hours_half) * (v_l + r.hours_early));
end $fn$;
create or replace function public.hr_danger_level_xp_max(p_level int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_danger_rules%rowtype; v_l int := greatest(1, coalesce(p_level, 1));
begin
  -- DANGER-SCALE (${OUT_NAME}): ceil(danger.js levelShareXp at the gap ceiling): the most one kill alone pays a hero of Level p_level.
  select * into r from public.hr_danger_rules where id;
  if not found then return null; end if;
  return ceil((public.hr_char_xp_for_level(v_l + 1) - public.hr_char_xp_for_level(v_l))::numeric
              / (public.hr_danger_hours_for(v_l) * r.ref_kills_head)
              * power(1 + r.pay_step_xp_ppm / 1000000.0, r.gap_max))::bigint;
end $fn$;
revoke execute on function public.hr_danger_hours_for(int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_danger_level_xp_max(int) from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke execute on function public.hr_danger_hours_for(int) from hr_engine;
    revoke execute on function public.hr_danger_level_xp_max(int) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke execute on function public.hr_danger_hours_for(int) from hr_tick;
    revoke execute on function public.hr_danger_level_xp_max(int) from hr_tick; end if;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- Every row is the data's; every ground is a hunting ground the catalogue holds; the stances are safest first and a death settles to
-- the same or a safer one; no client role reads a table or runs a twin; and each twin answers the engine's value at the pinned Levels.
do $mig$
declare v_r record;
begin
  if (select count(*) from public.hr_danger_rules) <> 1 or (select count(*) from public.hr_danger_stances) <> ${r.stances.length}
     or (select count(*) from public.hr_danger_grounds) <> ${r.ground.length} then
    raise exception 'VERIFY(a): the catalogue holds % rules, % stances, % grounds', (select count(*) from public.hr_danger_rules),
      (select count(*) from public.hr_danger_stances), (select count(*) from public.hr_danger_grounds); end if;
  if exists (select 1 from public.hr_danger_grounds d where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = d.hunt_id)) then
    raise exception 'VERIFY(a): a Danger ground is no hunt ground'; end if;
  if exists (select 1 from public.hr_danger_stances s left join public.hr_danger_stances a on a.risk = s.after_death where a.risk is null or a.rank > s.rank) then
    raise exception 'VERIFY(a): a death settles a stance to a bolder one or none'; end if;
  if not exists (select 1 from public.hr_danger_rules r join public.hr_danger_stances s on s.risk = r.default_risk where r.id) then
    raise exception 'VERIFY(a): the default stance is no stance'; end if;
  if exists (select 1 from public.hr_danger_rules where id and (hours_ceiling is null or hours_half is null or hours_early is null)) then
    raise exception 'VERIFY(a): the hours formula has a missing lever'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_danger_rules', 'select') or has_table_privilege(g.r, 'public.hr_danger_stances', 'select')
                 or has_table_privilege(g.r, 'public.hr_danger_grounds', 'select')
                 or has_function_privilege(g.r, 'public.hr_danger_hours_for(integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_danger_level_xp_max(integer)', 'execute')) then
    raise exception 'VERIFY(b): a client role reads the Danger catalogue'; end if;
  for v_r in select * from (values
${pinChecks}) p(l, hours, xp_max) loop
    if abs(public.hr_danger_hours_for(v_r.l) - v_r.hours) > 0.000001 then
      raise exception 'VERIFY(c): Level % takes % h in SQL, % in the engine', v_r.l, public.hr_danger_hours_for(v_r.l), v_r.hours; end if;
    if abs(public.hr_danger_level_xp_max(v_r.l) - v_r.xp_max) > 1 then
      raise exception 'VERIFY(c): the most a kill pays Level % is % in SQL, % in the engine', v_r.l, public.hr_danger_level_xp_max(v_r.l), v_r.xp_max; end if;
  end loop;
  raise notice 'gen-danger: % stances, % ground(s), the twins pinned at % Levels; all green', ${r.stances.length}, ${r.ground.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const tryRows = (name, patch) => {
    const D = { ...base.data, ...patch(base.data) };
    try { rowsOf({ ...base, data: D }); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  tryRows('a death settles to a bolder stance', (d) => ({ RISKS: { ...d.RISKS, careful: { ...d.RISKS.careful, afterDeath: 'bold' } } }));
  tryRows('stances out of order', (d) => ({ RISKS: { bold: d.RISKS.bold, steady: d.RISKS.steady, careful: d.RISKS.careful } }));
  tryRows('a trigger over its climb line', (d) => ({ RISKS: { ...d.RISKS, steady: { ...d.RISKS.steady, fallPm: 500, cleanPm: 450 } } }));
  tryRows('a ground that is no hunting ground', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, the_burning_tower: { refStep: 10 } } }));
  tryRows('a ground unknown', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, nowhere: { refStep: 10 } } }));
  tryRows('a reference step past the scale', (d) => ({ DANGER_GROUNDS: { muster_barrows: { ...d.DANGER_GROUNDS.muster_barrows, refStep: d.DANGER.stepMax + 1 } } }));
  tryRows('a band whose top is under its reference', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, muster_barrows: { ...d.DANGER_GROUNDS.muster_barrows, topStep: d.DANGER_GROUNDS.muster_barrows.refStep } } }));
  tryRows('a band whose floor is over its reference', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, muster_barrows: { ...d.DANGER_GROUNDS.muster_barrows, floorStep: d.DANGER_GROUNDS.muster_barrows.refStep + 1 } } }));
  tryRows('a band past the scale', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, muster_barrows: { ...d.DANGER_GROUNDS.muster_barrows, topStep: d.DANGER.stepMax + 1 } } }));
  tryRows('a ground split over fewer kills than the ceiling', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, hasks_ford: { ...d.DANGER_GROUNDS.hasks_ford, refKillsHead: d.PAY.refKillsHead - 1 } } }));
  tryRows('a ground whose rows are written at no whole kill rate', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, hasks_ford: { ...d.DANGER_GROUNDS.hasks_ford, rowsKillsHead: 0.5 } } }));
  tryRows('a formula anchor past the scale', (d) => ({ DANGER_GROUNDS: { ...d.DANGER_GROUNDS, hasks_ford: { ...d.DANGER_GROUNDS.hasks_ford, formulaStep: d.DANGER.stepMax + 1 } } }));
  /* a staged ground is judged, never served: the wings are in the data and out of the rows */
  { const r = rowsOf(base); if (r.ground.some((g) => g.id.startsWith('catacomb_'))) bites.push('a staged ground was written to the catalogue'); }
  tryRows('a pay step no whole ppm', (d) => ({ PAY: { ...d.PAY, payStepXp: 0.0070001 } }));
  tryRows('a default stance that is no stance', () => ({ DEFAULT_RISK: 'reckless' }));
  /* the hours formula's levers (core-model.js LEVEL_HOURS): a half of 0 never levels off, a fraction has no whole twin */
  for (const [k, v] of [['half', 0], ['ceiling', 19.5], ['early', -1]]) {
    try { rowsOf({ ...base, model: { ...base.model, LEVEL_HOURS: { ...base.model.LEVEL_HOURS, [k]: v } } }); bites.push('an hours lever ' + k + ' ' + v + ': NOT refused'); } catch { /* refused */ }
  }
  /* the twin's pin is the engine's: a hand edit of the file's pins or the data is caught by --check, and the SQL twin by its self-check */
  const sql = buildSql(rowsOf(base));
  if (!/VERIFY\(c\)/.test(sql) || !/hr_danger_level_xp_max/.test(sql)) bites.push('the twins are not pinned');
  if (bites.length) { console.error('gen-danger --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-danger --selftest: 18 refusals bite, a staged ground stays out');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-danger --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-danger.mjs'); process.exit(1); }
      console.log('gen-danger --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
