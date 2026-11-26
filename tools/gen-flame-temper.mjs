#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-flame-temper.mjs — THE INNER FLAME, TEMPER, IMBUEMENT, PERSONAL LOOT AND CARRY-OVER CATALOGUE, written from src/data and pinned
// against src/core (systems, lane/flame-temper-build, 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md).
//
//   node tools/gen-flame-temper.mjs            write supabase/migrations/<OUT_NAME>
//   node tools/gen-flame-temper.mjs --check    exit 1 when the file is stale against the data (the drift guard)
//   node tools/gen-flame-temper.mjs --selftest each refusal bites on a planted defect, and every twin is pinned
//
// Every number the server prices or bounds with is read here from the one source (src/data/inner-flame.js FLAME, src/data/temper.js
// TEMPER_STEPS, src/data/imbue-rules.js IMBUE, src/data/party.js PERSONAL_LOOT, src/data/gear-steps.js CARRY and GEAR_STEPS through
// src/data/danger.js, the item Levels of src/data/items.js), and every SQL twin is pinned in the file's own self-check at the values the JS
// answers (src/core/inner-flame.js, temper-steps.js, imbue.js, personal-loot.js, carry-over.js), so the two can never drift in silence.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* lane/gear-phase-b (2026-11-23) moved it here: the step tiers' 124 pieces join hr_item_levels. A forward file carrying 1063 (STAGED) whole: its rows
   name items 1065 adds to hr_items, and 1063 replays before 1065. */
export const OUT_NAME = '1069-gear-phase-b-flame-temper-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/* where each twin is pinned */
const FL_PINS = [1, 2, 25, 50, 98, 99, 100];
const HEIGHT_PINS = [0, 1, 750, 12500, 18750, 25000, 37500, 46875];
const POINT_PINS = [0, 1, 999, 1000, 50000, 1000000, 5999999, 6000000, 7000000];
const DECAY_PINS = [[12500, 0, 0, 3600000], [18750, 1000000, 59999, 60001], [46875, 6000000, 0, 14400000], [700, 0, 0, 600000], [0, 5, 10, 120000]];
const WORTH_PINS = [[1, 55, 55], [100, 55, 60], [37, 1, 200], [1000, 45, 400], [3, 165, 165], [0, 55, 55], [5000, 10, 4000]];
const BURN_PINS = [[0, 1, 100, 55, 60], [12000, 1, 5000, 55, 55], [18750, 1, 10, 55, 55], [30000, 99, 999, 45, 120], [0, 50, 7, 1, 400]];
const STOKE_PINS = [{ keep: 'full' }, { keep: 'two_thirds', own_first: false, buy_per_day: 9999, cap_hours_pm: -5, sell_rest: true },
  { keep: 'off', buy_per_day: 40, cap_hours_pm: 60 }, { keep: 'hot' }, {}];
const IL_PINS = [1, 20, 60, 80, 100, 120, 200, 400];
const LEVEL_PINS = [0, 39, 40, 79, 80, 120, 199, 200, 500];
const CH_PINS = [[0.5, 1, 0], [0.5, 4, 0], [1, 4, 0], [0.002, 3, 200], [0.0001, 2, 360], [0.9, 1, 600], [0, 2, 100]];
const PITY_PINS = [[0.0002, 0], [0.0002, 438000], [0.01, 5000000], [0.5, 9000000], [0.00001, 1]];

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [flameD, flameC, temperD, temperC, imbueD, imbueC, party, loot, danger, carry, items, ledger, tradesC] = await Promise.all([
    imp('src/data/inner-flame.js'), imp('src/core/inner-flame.js'), imp('src/data/temper.js'), imp('src/core/temper-steps.js'),
    imp('src/data/imbue-rules.js'), imp('src/core/imbue.js'), imp('src/data/party.js'), imp('src/core/personal-loot.js'),
    imp('src/data/danger.js'), imp('src/core/carry-over.js'), imp('src/data/items.js'), imp('src/data/power-ledger.js'), imp('src/core/trades.js')]);
  return { flameD, flameC, temperD, temperC, imbueD, imbueC, party, loot, danger, carry, items, ledger, tradesC };
}

const lit = (x) => (x === null || x === undefined ? 'null' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : `'${String(x)}'::float8`) : `'${String(x).replace(/'/g, "''")}'`);
const jlit = (o) => (o === null ? 'null::jsonb' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);

/** The resolved rows and pins, refused on a defect. */
export function rowsOf(d) {
  const problems = [...d.flameD.validateFlame(), ...d.imbueD.validateImbues()];
  const F = d.flameD.FLAME, T = d.temperD.TEMPER_STEPS, I = d.imbueD.IMBUE, P = d.party.PERSONAL_LOOT, C = d.danger.CARRY, G = d.danger.GEAR_STEPS;
  const whole = (v) => Number.isInteger(v) && v >= 0;
  for (const k of ['ranks', 'ilPerRank', 'rankEvery', 'hoursPm', 'kitSharePm', 'carryPm', 'kitHoursPm']) if (!(whole(T[k]) && T[k] > 0)) problems.push('TEMPER_STEPS.' + k + ' is not a whole number above 0');
  if (T.kitSharePm >= 1000) problems.push('TEMPER_STEPS.kitSharePm must leave a fee (under 1000)');
  if (T.carryPm >= 1000) problems.push('TEMPER_STEPS.carryPm must be under 1000: a re-seat costs less than the ranks');
  if (T.ranks * T.ilPerRank !== d.ledger.POWER_LEDGER.temperStepsMax) problems.push('TEMPER_STEPS: ranks x ilPerRank must be the ledger\'s Temper slice (' + d.ledger.POWER_LEDGER.temperStepsMax + ')');
  if (T.kitItem !== null && !(typeof T.kitItem === 'string' && Object.prototype.hasOwnProperty.call(d.items.ITEMS, T.kitItem))) problems.push('TEMPER_STEPS.kitItem ' + T.kitItem + ' is no item');
  /* the Temper kits (lane/tp-im-steps): a rank on the first Level a rank opens wears a band that has its kit, so rank 1 is never kits_owed by data */
  if (!d.tradesC.temperKitAt(T.rankEvery)) problems.push('no Temper kit at item Level ' + T.rankEvery + ', where rank 1 opens');
  /* every imbuement row resolves to a recipe the bench can make (its part on a pack, its band) */
  for (const id of Object.keys(d.imbueD.IMBUE_RULES)) if (!d.imbueC.imbueRecipe(id)) problems.push('imbuement ' + id + ' has no recipe');
  const slotSum = Object.values(G.slotPm).reduce((a, b) => a + b, 0);
  if (slotSum !== 1000) problems.push('GEAR_STEPS.slotPm sums to ' + slotSum + ', not 1000');
  for (const k of ['hours', 'steps', 'lifeRungPm', 'feeHoursPm']) if (!(whole(I[k]) && I[k] > 0)) problems.push('IMBUE.' + k + ' is not a whole number above 0');
  if (!(whole(P.pityGrowPm) && whole(P.pityBasePm) && P.pityBasePm > 0 && P.pityBasePm <= 1000)) problems.push('PERSONAL_LOOT: pityGrowPm whole, pityBasePm in 1..1000');
  if (!(whole(C.hoursPerStepPm) && C.hoursPerStepPm > 0 && whole(C.partsBase) && whole(C.workPm) && C.workPm > 0)) problems.push('CARRY levers are not whole numbers above 0');
  if (problems.length) throw new Error('gen-flame-temper: ' + problems.join('; '));

  const fc = d.flameC, tc = d.temperC, ic = d.imbueC, lc = d.loot;
  const itemLevels = Object.entries(d.items.ITEMS).filter(([, it]) => it && it.slot && it.slot !== 'ammo')
    .map(([id, it]) => [id, Math.floor(Number(Number.isInteger(it.iL) ? it.iL : it.reqLv))]).filter(([, l]) => Number.isFinite(l) && l >= 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const imbues = Object.entries(d.imbueD.IMBUE_RULES).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, r]) => ({
    id, kind: r.kind, slot: d.imbueD.IMBUE_SLOTS[r.kind], raises: r.raises, key: r.key, part: r.part, band: d.imbueD.imbueBandOf(id), item: 'imbue_' + id }));
  for (const x of imbues) if (!(Number.isInteger(x.band) && x.slot === ic.imbueSlotOf(x.id))) throw new Error('gen-flame-temper: imbuement ' + x.id + ' has no band or slot');
  const slots = Object.keys(G.slotPm);
  const pins = {
    decay: FL_PINS.map((fl) => [fl, fc.decayPpm(fl), fc.roomMpts(fl), fc.burstMpts(fl)]),
    luck: HEIGHT_PINS.map((h) => [h, fc.luckPm(h), fc.topRankPmOf(fc.luckPm(h))]),
    level: POINT_PINS.map((p) => [p, fc.levelOf(p)]),
    settle: DECAY_PINS.map(([h, p, c, ms]) => [h, p, c, ms, fc.decay({ height: h, points: p, carryMs: c }, ms)]),
    worth: WORTH_PINS.map(([n, b, top]) => [n, b, top, fc.fuelWorthMpts(n, b, top)]),
    burn: BURN_PINS.map(([h, fl, n, b, top]) => [h, fl, n, b, top, fc.burn(h, fl, n, b, top)]),
    stoke: STOKE_PINS.map((r) => [r, fc.clampStoke(r)]),
    rank: [], seat: [], cap: LEVEL_PINS.map((L) => [L, tc.rankCapAt(L)]),
    life: I.qualities.concat(['none']).map((q) => [q, ic.lifeMs(q)]),
    fee: [], chance: CH_PINS.map(([ch, n, l]) => [ch, n, l, lc.heroChance(ch, n, l)]),
    pity: PITY_PINS.map(([p, m]) => [p, m, lc.pityChance(p, m), lc.pityAfter(m, p, false), lc.pityAfter(m, p, true)]),
    carry: [],
  };
  for (const s of slots) for (let r = 1; r <= T.ranks; r++) for (const il of [60, 200]) pins.rank.push([s, r, il, tc.rankQuote(s, r, il)]);
  for (const s of ['weapon', 'ring1', 'body']) for (const il of IL_PINS) for (const n of [0, 1, 2, 5]) pins.seat.push([s, n, il, tc.seatPrice(s, n, il)]);
  for (const il of IL_PINS) for (const L of LEVEL_PINS) pins.fee.push([il, L, ic.applyFee(il, L)]);
  for (const st of [0, 4, 7, 10, 20]) for (const il of IL_PINS) pins.carry.push([st, il, d.carry.carryFee(st, il)]);
  /* and a whole quote: a Rare's one Trait at each rank, onto the next tier's base (the job prices the steps it moves) */
  const trait = Object.keys(d.danger.TRAITS).sort()[0];
  for (let rank = 1; rank <= G.traitSteps.length; rank++) for (const il of [60, 80, 200]) {
    const q = d.carry.carryQuote({ slot: 'weapon', tier: 3, traits: [{ id: trait, rank }] }, { slot: 'weapon', tier: 4, traits: [], itemLevel: il });
    if (!q.ok) throw new Error('gen-flame-temper: the pinned carry-over quote is refused: ' + q.why);
    pins.carry.push([q.steps, il, q.fee]);
  }
  return {
    F, T, I, P, C, G, slots, itemLevels, imbues, levels: d.flameD.FLAME_LEVELS, fuel: d.flameD.FLAME_FUEL, powerStep: d.danger.DANGER.powerStep,
    rampLevel: d.ledger.POWER_LEDGER.rampLevel, pins,
  };
}

export function buildSql(r) {
  const { F, T, I, P, C, G } = r;
  const values = (rows, f) => rows.map(f).join(',\n');
  const keeps = JSON.stringify(F.stokeKeeps);
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE INNER FLAME, TEMPER ON STEPS, IMBUEMENT, PERSONAL LOOT AND CARRY-OVER CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-flame-temper.mjs from src/data/inner-flame.js (FLAME, FLAME_LEVELS, FLAME_FUEL), src/data/temper.js
--   (TEMPER_STEPS), src/data/imbue-rules.js (IMBUE, IMBUE_RULES), src/data/party.js (PERSONAL_LOOT), src/data/gear-steps.js (CARRY,
--   GEAR_STEPS.slotPm) and src/data/items.js (item Levels), every twin pinned against src/core (inner-flame.js, temper-steps.js, imbue.js,
--   personal-loot.js, carry-over.js). Any hand edit FAILS \`node tools/gen-flame-temper.mjs --check\`.
--
-- WHAT (lane/flame-temper-build, systems, 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md): the rule the server reads, so no
-- number is typed twice. Tables (each RLS on, no policy, no client grant, rewritten whole):
--   hr_flame_rules (1 row), hr_flame_levels (${r.levels.length} Levels), hr_flame_fuel (${r.fuel.length} Remains goods by band)
--   hr_temper_rules (1 row, kit_item ${T.kitItem === null ? 'null: Temper Kits are owed, a rank is refused kits_owed' : T.kitItem}), hr_temper_slots (${r.slots.length} slots)
--   hr_item_levels (${r.itemLevels.length} gear rows: the iL a scale ground's drop carries, else its Level requirement)
--   hr_imbue_rules (${r.imbues.length} rows), hr_imbue_levers (1 row), hr_loot_rules (1 row), hr_carry_rules (1 row)
-- Internal twins (no client role): hr_flame_decay_ppm, hr_flame_room_mpts, hr_flame_burst_mpts, hr_flame_luck_pm, hr_flame_top_rank_pm,
--   hr_flame_level_of, hr_flame_decay, hr_flame_worth_mpts, hr_flame_burn_units, hr_flame_stoke_clamp; hr_temper_rank_mh, hr_temper_rank_cap,
--   hr_temper_rank_quote, hr_temper_seat_price; hr_imbue_life_ms, hr_imbue_fee; hr_hero_chance, hr_pity_chance, hr_pity_after; hr_carry_fee.
-- READERS: 1063-flame-temper.sql (the verbs, the settle's decay and timers, the sections). The drop roller (lane/drop-formula) reads
--   hr_flame_luck_pm, hr_flame_top_rank_pm and the loot twins at its window's start.
-- ORDER: 1063 in its name, before 1063-flame-temper.sql. Needs hr_wage (1058-hunting-blocks-catalogue.generated.sql). Idempotent: tables made
--   if missing, rows rewritten whole, functions restated: a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. Catalogue tables and internal functions, revoked from every client role. No value moves here.
-- REVERSIBLE: drop the functions and the tables (after 1063-flame-temper.sql's readers are gone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the wage twin first (1058-hunting-blocks-catalogue.generated.sql)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_flame_rules (
  id int primary key check (id = 1),
  decay_ppm1 int not null check (decay_ppm1 > 0), decay_ppm99 int not null check (decay_ppm99 > 0), level_max int not null check (level_max > 1),
  cover_pm int not null check (cover_pm > 1000), luck_max_pm int not null check (luck_max_pm > 0), luck_half_mpts bigint not null check (luck_half_mpts > 0),
  top_rank_pm int not null check (top_rank_pm > 0), top_rank_max_pm int not null check (top_rank_max_pm between top_rank_pm and 1000),
  burst_pm int not null check (burst_pm > 0), fuel_ref int not null check (fuel_ref > 0), stoke_buy_max int not null check (stoke_buy_max >= 0),
  stoke_cap_hours_pm int not null check (stoke_cap_hours_pm >= 0), power_step float8 not null check (power_step > 0), keeps jsonb not null,
  check (decay_ppm99 < decay_ppm1)
);
create table if not exists public.hr_flame_levels (level int primary key check (level >= 1), points_from bigint not null check (points_from >= 0));
create table if not exists public.hr_flame_fuel (item_id text primary key, band int not null check (band > 0));
create table if not exists public.hr_temper_rules (
  id int primary key check (id = 1),
  ranks int not null check (ranks > 0), il_per_rank int not null check (il_per_rank > 0), rank_every int not null check (rank_every > 0),
  hours_pm int not null check (hours_pm > 0), kit_share_pm int not null check (kit_share_pm between 0 and 999), carry_pm int not null check (carry_pm between 1 and 999),
  kit_hours_pm int not null check (kit_hours_pm > 0), kit_item text, n_slots int not null check (n_slots > 0), rank_sum int not null check (rank_sum > 0),
  tier_steps int not null check (tier_steps > 0)
);
create table if not exists public.hr_temper_slots (equip_slot text primary key, slot_pm int not null check (slot_pm > 0));
create table if not exists public.hr_item_levels (item_id text primary key, item_level int not null check (item_level >= 0));
create table if not exists public.hr_imbue_rules (
  imbue_id text primary key, kind text not null check (kind in ('edge', 'ward', 'leech')), equip_slot text not null,
  raises text not null check (raises in ('offense', 'defense', 'heal', 'mana')), key text not null, part_item text not null,
  band int not null check (band > 0), item_id text not null unique
);
create table if not exists public.hr_imbue_levers (
  id int primary key check (id = 1), hours int not null check (hours > 0), life_rung_pm int not null check (life_rung_pm > 0),
  fee_hours_pm int not null check (fee_hours_pm > 0), ramp_level int not null check (ramp_level > 0), qualities text[] not null
);
create table if not exists public.hr_loot_rules (id int primary key check (id = 1), pity_grow_pm int not null check (pity_grow_pm >= 0), pity_base_pm int not null check (pity_base_pm between 1 and 1000));
create table if not exists public.hr_carry_rules (
  id int primary key check (id = 1), hours_per_step_pm int not null check (hours_per_step_pm > 0), parts_base int not null check (parts_base >= 0),
  work_pm int not null check (work_pm > 0), trait_steps int[] not null
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_flame_rules', 'hr_flame_levels', 'hr_flame_fuel', 'hr_temper_rules', 'hr_temper_slots', 'hr_item_levels',
                             'hr_imbue_rules', 'hr_imbue_levers', 'hr_loot_rules', 'hr_carry_rules'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_flame_rules;
insert into public.hr_flame_rules (id, decay_ppm1, decay_ppm99, level_max, cover_pm, luck_max_pm, luck_half_mpts, top_rank_pm, top_rank_max_pm,
                                   burst_pm, fuel_ref, stoke_buy_max, stoke_cap_hours_pm, power_step, keeps) values
  (1, ${F.decayPpm1}, ${F.decayPpm99}, ${F.levelMax}, ${F.coverPm}, ${F.luckMaxPm}, ${F.luckHalfMpts}, ${F.topRankPm}, ${F.topRankMaxPm},
   ${F.burstPm}, ${F.fuelRef}, ${F.stokeBuyMax}, ${F.stokeCapHoursPm}, '${r.powerStep}'::float8, '${keeps}'::jsonb);
delete from public.hr_flame_levels;
insert into public.hr_flame_levels (level, points_from) values
${values(r.levels, (p, i) => `  (${i + 1}, ${p})`)};
delete from public.hr_flame_fuel;
insert into public.hr_flame_fuel (item_id, band) values
${values(r.fuel, (f) => `  ('${f.item}', ${f.band})`)};
delete from public.hr_temper_rules;
insert into public.hr_temper_rules (id, ranks, il_per_rank, rank_every, hours_pm, kit_share_pm, carry_pm, kit_hours_pm, kit_item, n_slots, rank_sum, tier_steps) values
  (1, ${T.ranks}, ${T.ilPerRank}, ${T.rankEvery}, ${T.hoursPm}, ${T.kitSharePm}, ${T.carryPm}, ${T.kitHoursPm}, ${lit(T.kitItem)}, ${r.slots.length}, ${(T.ranks * (T.ranks + 1)) / 2}, ${G.tierSteps});
delete from public.hr_temper_slots;
insert into public.hr_temper_slots (equip_slot, slot_pm) values
${values(r.slots, (s) => `  ('${s}', ${G.slotPm[s]})`)};
delete from public.hr_item_levels;
insert into public.hr_item_levels (item_id, item_level) values
${values(r.itemLevels, ([id, l]) => `  ('${id}', ${l})`)};
delete from public.hr_imbue_rules;
insert into public.hr_imbue_rules (imbue_id, kind, equip_slot, raises, key, part_item, band, item_id) values
${values(r.imbues, (x) => `  ('${x.id}', '${x.kind}', '${x.slot}', '${x.raises}', '${x.key}', '${x.part}', ${x.band}, '${x.item}')`)};
delete from public.hr_imbue_levers;
insert into public.hr_imbue_levers (id, hours, life_rung_pm, fee_hours_pm, ramp_level, qualities) values
  (1, ${I.hours}, ${I.lifeRungPm}, ${I.feeHoursPm}, ${r.rampLevel}, array[${I.qualities.map((q) => `'${q}'`).join(', ')}]::text[]);
delete from public.hr_loot_rules;
insert into public.hr_loot_rules (id, pity_grow_pm, pity_base_pm) values (1, ${P.pityGrowPm}, ${P.pityBasePm});
delete from public.hr_carry_rules;
insert into public.hr_carry_rules (id, hours_per_step_pm, parts_base, work_pm, trait_steps) values
  (1, ${C.hoursPerStepPm}, ${C.partsBase}, ${C.workPm}, array[${G.traitSteps.join(', ')}]::int[]);

-- ── §3 THE INNER FLAME'S TWINS (src/core/inner-flame.js) ─────────────────────
create or replace function public.hr_flame_decay_ppm(p_fl int)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select (r.decay_ppm1 - ((r.decay_ppm1 - r.decay_ppm99)::bigint * (least(r.level_max, greatest(1, coalesce(p_fl, 1))) - 1)) / (r.level_max - 1))::int
    from public.hr_flame_rules r where r.id = 1
$fn$;
create or replace function public.hr_flame_room_mpts(p_fl int)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select (r.cover_pm::bigint * 1000000) / public.hr_flame_decay_ppm(p_fl) from public.hr_flame_rules r where r.id = 1
$fn$;
create or replace function public.hr_flame_burst_mpts(p_fl int)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select (public.hr_flame_room_mpts(p_fl) * r.burst_pm) / 1000 from public.hr_flame_rules r where r.id = 1
$fn$;
create or replace function public.hr_flame_luck_pm(p_height bigint)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select ((r.luck_max_pm::bigint * greatest(0, coalesce(p_height, 0))) / (greatest(0, coalesce(p_height, 0)) + r.luck_half_mpts))::int
    from public.hr_flame_rules r where r.id = 1
$fn$;
create or replace function public.hr_flame_top_rank_pm(p_luck int)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select least(r.top_rank_max_pm, (r.top_rank_pm * (1000 + greatest(0, coalesce(p_luck, 0)))) / 1000) from public.hr_flame_rules r where r.id = 1
$fn$;
create or replace function public.hr_flame_level_of(p_points bigint)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select coalesce(max(l.level), 1) from public.hr_flame_levels l where l.points_from <= greatest(0, coalesce(p_points, 0))
$fn$;
create or replace function public.hr_flame_decay(p_height bigint, p_points bigint, p_carry_ms bigint, p_hero_ms bigint)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_h bigint := greatest(0, coalesce(p_height, 0)); v_p bigint := greatest(0, coalesce(p_points, 0));
  v_total bigint := greatest(0, coalesce(p_carry_ms, 0)) + greatest(0, coalesce(p_hero_ms, 0));
  v_min bigint; v_burned bigint := 0; v_lost bigint; v_l int; v_next bigint;
begin
  -- THE SETTLE'S DECAY (src/core/inner-flame.js decay): a whole hunted hero-minute at a time, ceil(height x decay / 60,000,000), the Level
  -- re-read each minute; a part of a minute is carried.
  v_min := v_total / 60000;
  v_l := public.hr_flame_level_of(v_p);
  select points_from into v_next from public.hr_flame_levels where level = v_l + 1;
  while v_min > 0 and v_h > 0 loop
    v_lost := (v_h * public.hr_flame_decay_ppm(v_l) + 59999999) / 60000000;
    v_h := v_h - v_lost; v_p := v_p + v_lost; v_burned := v_burned + v_lost; v_min := v_min - 1;
    if v_next is not null and v_next <= v_p then
      v_l := public.hr_flame_level_of(v_p);
      select points_from into v_next from public.hr_flame_levels where level = v_l + 1;
    end if;
  end loop;
  return jsonb_build_object('height', v_h, 'points', v_p, 'carry_ms', v_total % 60000, 'level', v_l, 'burned', v_burned);
end $fn$;
create or replace function public.hr_flame_worth_mpts(p_count bigint, p_band int, p_top int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_n bigint := greatest(0, coalesce(p_count, 0)); v_k int := greatest(0, coalesce(p_top, 0) - coalesce(p_band, 0));
  v_b float8; v_out float8 := 1; v_ref int;
begin
  -- A UNIT OF FUEL (src/core/inner-flame.js fuelWorthMpts): 1000 / fuelRef milli-points over (1 + powerStep) ^ (top - band), the power
  -- walked by squaring in float8 exactly as the JS walks it.
  if v_n = 0 then return 0; end if;
  select 1::float8 + r.power_step, r.fuel_ref into v_b, v_ref from public.hr_flame_rules r where r.id = 1;
  while v_k > 0 loop
    if v_k % 2 = 1 then v_out := v_out * v_b; end if;
    v_b := v_b * v_b;
    v_k := v_k / 2;
  end loop;
  return floor(((v_n * 1000)::float8 / v_ref::float8) / v_out)::bigint;
end $fn$;
create or replace function public.hr_flame_burn_units(p_height bigint, p_fl int, p_count bigint, p_band int, p_top int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_h bigint := greatest(0, coalesce(p_height, 0)); v_want bigint := greatest(0, coalesce(p_count, 0));
  v_space bigint; v_lo bigint := 0; v_hi bigint; v_mid bigint; v_m bigint;
begin
  -- THE BURN (src/core/inner-flame.js burn): the most units whose worth fits the room left; the rest stay where they were.
  v_space := greatest(0, public.hr_flame_room_mpts(p_fl) - v_h);
  if v_space = 0 or v_want = 0 then return jsonb_build_object('units', 0, 'mpts', 0, 'height', v_h); end if;
  v_m := public.hr_flame_worth_mpts(v_want, p_band, p_top);
  if v_m <= v_space then return jsonb_build_object('units', v_want, 'mpts', v_m, 'height', v_h + v_m); end if;
  v_hi := v_want;
  while v_hi - v_lo > 1 loop
    v_mid := (v_lo + v_hi) / 2;
    if public.hr_flame_worth_mpts(v_mid, p_band, p_top) <= v_space then v_lo := v_mid; else v_hi := v_mid; end if;
  end loop;
  v_m := public.hr_flame_worth_mpts(v_lo, p_band, p_top);
  return jsonb_build_object('units', v_lo, 'mpts', v_m, 'height', v_h + v_m);
end $fn$;
create or replace function public.hr_flame_stoke_clamp(p_rule jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_flame_rules%rowtype; v_keep text; v_buy bigint; v_cap bigint;
begin
  -- THE STOKE RULE, clamped (src/core/inner-flame.js clampStoke): an unknown keep is null (refused, never guessed); limits held to the catalogue.
  select * into r from public.hr_flame_rules where id = 1;
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then return null; end if;
  v_keep := case when jsonb_typeof(p_rule->'keep') = 'string' then p_rule->>'keep' end;
  if v_keep is null or not (r.keeps ? v_keep) then return null; end if;
  v_buy := case when jsonb_typeof(p_rule->'buy_per_day') = 'number' then floor((p_rule->>'buy_per_day')::numeric)::bigint else 0 end;
  v_cap := case when jsonb_typeof(p_rule->'cap_hours_pm') = 'number' then floor((p_rule->>'cap_hours_pm')::numeric)::bigint else 0 end;
  return jsonb_build_object('keep', v_keep, 'own_first', coalesce(p_rule->'own_first', 'true'::jsonb) <> 'false'::jsonb,
                            'buy_per_day', greatest(0, least(r.stoke_buy_max, v_buy)), 'cap_hours_pm', greatest(0, least(r.stoke_cap_hours_pm, v_cap)),
                            'sell_rest', coalesce(p_rule->'sell_rest', 'false'::jsonb) = 'true'::jsonb);
end $fn$;

-- ── §4 TEMPER'S TWINS (src/core/temper-steps.js) ─────────────────────────────
create or replace function public.hr_temper_rank_mh(p_slot text, p_rank int)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select case when p_rank is null or p_rank < 1 or p_rank > r.ranks or s.slot_pm is null then 0
              else (r.hours_pm::bigint * r.n_slots * s.slot_pm * p_rank + 1000::bigint * r.rank_sum - 1) / (1000::bigint * r.rank_sum) end
    from public.hr_temper_rules r left join public.hr_temper_slots s on s.equip_slot = p_slot where r.id = 1
$fn$;
create or replace function public.hr_temper_rank_cap(p_level int)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select least(r.ranks, greatest(0, coalesce(p_level, 0)) / r.rank_every) from public.hr_temper_rules r where r.id = 1
$fn$;
create or replace function public.hr_temper_rank_quote(p_slot text, p_rank int, p_item_level int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_temper_rules%rowtype; v_mh bigint; v_w numeric;
begin
  select * into r from public.hr_temper_rules where id = 1;
  v_mh := public.hr_temper_rank_mh(p_slot, p_rank);
  if v_mh = 0 then return null; end if;
  v_w := public.hr_wage(greatest(1, coalesce(p_item_level, 1)));
  return jsonb_build_object('fee', ceil(v_mh * (1000 - r.kit_share_pm) * v_w / 1000000)::bigint,
                            'kits', ceil(v_mh::numeric * r.kit_share_pm / (1000::numeric * r.kit_hours_pm))::bigint);
end $fn$;
create or replace function public.hr_temper_seat_price(p_slot text, p_ranks int, p_item_level int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_temper_rules%rowtype; v_mh bigint := 0; i int;
begin
  select * into r from public.hr_temper_rules where id = 1;
  for i in 1 .. least(r.ranks, greatest(0, coalesce(p_ranks, 0))) loop v_mh := v_mh + public.hr_temper_rank_mh(p_slot, i); end loop;
  if v_mh = 0 then return 0; end if;
  return ceil(v_mh::numeric * r.carry_pm * public.hr_wage(greatest(1, coalesce(p_item_level, 1))) / 1000000)::bigint;
end $fn$;

-- ── §5 IMBUEMENT, PERSONAL LOOT AND CARRY-OVER TWINS (src/core/imbue.js, personal-loot.js, carry-over.js) ──
create or replace function public.hr_imbue_life_ms(p_quality text)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select case when array_position(v.qualities, p_quality) is null then 0
              else (v.hours::bigint * 3600000 * (1000 + v.life_rung_pm * (array_position(v.qualities, p_quality) - 1))) / 1000 end
    from public.hr_imbue_levers v where v.id = 1
$fn$;
create or replace function public.hr_imbue_fee(p_item_level int, p_hero_level int)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select ceil(v.fee_hours_pm::numeric * public.hr_wage(greatest(1, coalesce(p_item_level, 1)))
              * least(v.ramp_level, greatest(0, coalesce(p_hero_level, 0))) / (1000::numeric * v.ramp_level))::bigint
    from public.hr_imbue_levers v where v.id = 1
$fn$;
create or replace function public.hr_hero_chance(p_ch float8, p_n int, p_luck int)
returns float8 language sql immutable set search_path = public, pg_catalog as $fn$
  select case when coalesce(p_ch, 0) <= 0 then 0::float8
              else least(1::float8, (p_ch / greatest(1, coalesce(p_n, 1))::float8) * ((1000 + greatest(0, coalesce(p_luck, 0)))::float8 / 1000::float8)) end
$fn$;
create or replace function public.hr_pity_chance(p_p float8, p_missed bigint)
returns float8 language sql stable set search_path = public, pg_catalog as $fn$
  select case when coalesce(p_p, 0) <= 0 then 0::float8
              else least(1::float8, ((p_p * l.pity_base_pm::float8) / 1000::float8)
                     * (1::float8 + (l.pity_grow_pm::float8 / 1000::float8) * (greatest(0, coalesce(p_missed, 0))::float8 / 1000000::float8))) end
    from public.hr_loot_rules l where l.id = 1
$fn$;
create or replace function public.hr_pity_after(p_missed bigint, p_p float8, p_hit boolean)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select case when p_hit then 0::bigint
              else greatest(0, coalesce(p_missed, 0)) + case when coalesce(p_p, 0) > 0 then round(((p_p * l.pity_base_pm::float8) / 1000::float8) * 1000000::float8)::bigint else 0 end end
    from public.hr_loot_rules l where l.id = 1
$fn$;
create or replace function public.hr_carry_fee(p_steps int, p_item_level int)
returns bigint language sql stable set search_path = public, pg_catalog as $fn$
  select case when greatest(0, coalesce(p_steps, 0)) = 0 then 0::bigint
              else ceil(greatest(0, p_steps)::numeric * c.hours_per_step_pm * public.hr_wage(greatest(1, coalesce(p_item_level, 1))) / 1000)::bigint end
    from public.hr_carry_rules c where c.id = 1
$fn$;
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_flame_decay_ppm(integer)', 'public.hr_flame_room_mpts(integer)', 'public.hr_flame_burst_mpts(integer)',
      'public.hr_flame_luck_pm(bigint)', 'public.hr_flame_top_rank_pm(integer)', 'public.hr_flame_level_of(bigint)',
      'public.hr_flame_decay(bigint,bigint,bigint,bigint)', 'public.hr_flame_worth_mpts(bigint,integer,integer)',
      'public.hr_flame_burn_units(bigint,integer,bigint,integer,integer)', 'public.hr_flame_stoke_clamp(jsonb)',
      'public.hr_temper_rank_mh(text,integer)', 'public.hr_temper_rank_cap(integer)', 'public.hr_temper_rank_quote(text,integer,integer)',
      'public.hr_temper_seat_price(text,integer,integer)', 'public.hr_imbue_life_ms(text)', 'public.hr_imbue_fee(integer,integer)',
      'public.hr_hero_chance(double precision,integer,integer)', 'public.hr_pity_chance(double precision,bigint)',
      'public.hr_pity_after(bigint,double precision,boolean)', 'public.hr_carry_fee(integer,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §6 SELF-CHECK (CLAUDE.md §4): the rows are the data's, no client reads them, and every twin answers what src/core answers ──
do $mig$
declare v_r record; v_j jsonb; v_t text;
begin
  if (select count(*) from public.hr_flame_levels) <> ${r.levels.length} or (select count(*) from public.hr_flame_fuel) <> ${r.fuel.length}
     or (select count(*) from public.hr_temper_slots) <> ${r.slots.length} or (select count(*) from public.hr_item_levels) <> ${r.itemLevels.length}
     or (select count(*) from public.hr_imbue_rules) <> ${r.imbues.length} or (select sum(slot_pm) from public.hr_temper_slots) <> 1000 then
    raise exception 'VERIFY(a): a catalogue table is not the data''s'; end if;
  foreach v_t in array array['hr_flame_rules', 'hr_flame_levels', 'hr_flame_fuel', 'hr_temper_rules', 'hr_temper_slots', 'hr_item_levels',
                             'hr_imbue_rules', 'hr_imbue_levers', 'hr_loot_rules', 'hr_carry_rules'] loop
    if has_table_privilege('anon', 'public.' || v_t, 'select') or has_table_privilege('authenticated', 'public.' || v_t, 'select') then
      raise exception 'VERIFY(b): a client role reads %', v_t; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.hr_flame_decay(bigint,bigint,bigint,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_temper_rank_quote(text,integer,integer)', 'execute') then
    raise exception 'VERIFY(b): a client role runs a twin'; end if;
  for v_r in select * from (values
${values(r.pins.decay, ([fl, d, room, b]) => `    (${fl}, ${d}::bigint, ${room}::bigint, ${b}::bigint)`)}) p(fl, d, room, b) loop
    if public.hr_flame_decay_ppm(v_r.fl) <> v_r.d or public.hr_flame_room_mpts(v_r.fl) <> v_r.room or public.hr_flame_burst_mpts(v_r.fl) <> v_r.b then
      raise exception 'VERIFY(c): Flame Level % burns/holds/bursts % % % in SQL, % % % in src/core/inner-flame.js', v_r.fl,
        public.hr_flame_decay_ppm(v_r.fl), public.hr_flame_room_mpts(v_r.fl), public.hr_flame_burst_mpts(v_r.fl), v_r.d, v_r.room, v_r.b; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.luck, ([h, l, t]) => `    (${h}::bigint, ${l}, ${t})`)}) p(h, l, t) loop
    if public.hr_flame_luck_pm(v_r.h) <> v_r.l or public.hr_flame_top_rank_pm(public.hr_flame_luck_pm(v_r.h)) <> v_r.t then
      raise exception 'VERIFY(d): height % gives luck % top rank % in SQL, % % in JS', v_r.h, public.hr_flame_luck_pm(v_r.h), public.hr_flame_top_rank_pm(public.hr_flame_luck_pm(v_r.h)), v_r.l, v_r.t; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.level, ([p, l]) => `    (${p}::bigint, ${l})`)}) p(p, l) loop
    if public.hr_flame_level_of(v_r.p) <> v_r.l then raise exception 'VERIFY(e): % points is Flame Level % in SQL, % in JS', v_r.p, public.hr_flame_level_of(v_r.p), v_r.l; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.settle, ([h, p, c, ms, o]) => `    (${h}::bigint, ${p}::bigint, ${c}::bigint, ${ms}::bigint, ${jlit({ height: o.height, points: o.points, carry_ms: o.carryMs, level: o.level, burned: o.burned })})`)}) p(h, p, c, ms, o) loop
    v_j := public.hr_flame_decay(v_r.h, v_r.p, v_r.c, v_r.ms);
    if v_j is distinct from v_r.o then raise exception 'VERIFY(f): the settle''s decay of % is % in SQL, % in JS', row(v_r.h, v_r.p, v_r.c, v_r.ms), v_j, v_r.o; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.worth, ([n, b, t, w]) => `    (${n}::bigint, ${b}, ${t}, ${w}::bigint)`)}) p(n, b, t, w) loop
    if public.hr_flame_worth_mpts(v_r.n, v_r.b, v_r.t) <> v_r.w then
      raise exception 'VERIFY(g): % units of band % at top % are worth % in SQL, % in JS', v_r.n, v_r.b, v_r.t, public.hr_flame_worth_mpts(v_r.n, v_r.b, v_r.t), v_r.w; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.burn, ([h, fl, n, b, t, o]) => `    (${h}::bigint, ${fl}, ${n}::bigint, ${b}, ${t}, ${jlit(o)})`)}) p(h, fl, n, b, t, o) loop
    v_j := public.hr_flame_burn_units(v_r.h, v_r.fl, v_r.n, v_r.b, v_r.t);
    if v_j is distinct from v_r.o then raise exception 'VERIFY(h): the burn % is % in SQL, % in JS', row(v_r.h, v_r.fl, v_r.n, v_r.b, v_r.t), v_j, v_r.o; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.stoke, ([i, o]) => `    (${jlit(i)}, ${jlit(o)})`)}) p(i, o) loop
    if public.hr_flame_stoke_clamp(v_r.i) is distinct from v_r.o then
      raise exception 'VERIFY(i): the stoke rule % clamps to % in SQL, % in JS', v_r.i, public.hr_flame_stoke_clamp(v_r.i), v_r.o; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.rank, ([s, n, il, q]) => `    ('${s}', ${n}, ${il}, ${jlit(q)})`)}) p(s, n, il, q) loop
    if public.hr_temper_rank_quote(v_r.s, v_r.n, v_r.il) is distinct from v_r.q then
      raise exception 'VERIFY(j): % rank % at item Level % quotes % in SQL, % in src/core/temper-steps.js', v_r.s, v_r.n, v_r.il, public.hr_temper_rank_quote(v_r.s, v_r.n, v_r.il), v_r.q; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.seat, ([s, n, il, g]) => `    ('${s}', ${n}, ${il}, ${g}::bigint)`)}) p(s, n, il, g) loop
    if public.hr_temper_seat_price(v_r.s, v_r.n, v_r.il) <> v_r.g then
      raise exception 'VERIFY(k): re-seating % ranks of % at item Level % costs % in SQL, % in JS', v_r.n, v_r.s, v_r.il, public.hr_temper_seat_price(v_r.s, v_r.n, v_r.il), v_r.g; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.cap, ([L, c]) => `    (${L}, ${c})`)}) p(l, c) loop
    if public.hr_temper_rank_cap(v_r.l) <> v_r.c then raise exception 'VERIFY(l): Level % holds % ranks in SQL, % in JS', v_r.l, public.hr_temper_rank_cap(v_r.l), v_r.c; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.life, ([q, ms]) => `    ('${q}', ${ms}::bigint)`)}) p(q, ms) loop
    if public.hr_imbue_life_ms(v_r.q) <> v_r.ms then raise exception 'VERIFY(m): a % imbuement lasts % ms in SQL, % in JS', v_r.q, public.hr_imbue_life_ms(v_r.q), v_r.ms; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.fee, ([il, L, g]) => `    (${il}, ${L}, ${g}::bigint)`)}) p(il, l, g) loop
    if public.hr_imbue_fee(v_r.il, v_r.l) <> v_r.g then raise exception 'VERIFY(n): the imbue fee at item Level % hero Level % is % in SQL, % in JS', v_r.il, v_r.l, public.hr_imbue_fee(v_r.il, v_r.l), v_r.g; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.chance, ([ch, n, l, c]) => `    (${lit(ch)}::float8, ${n}, ${l}, ${lit(c)}::float8)`)}) p(ch, n, l, c) loop
    if public.hr_hero_chance(v_r.ch, v_r.n, v_r.l) is distinct from v_r.c then
      raise exception 'VERIFY(o): a hero''s chance on % among % at luck % is % in SQL, % in JS', v_r.ch, v_r.n, v_r.l, public.hr_hero_chance(v_r.ch, v_r.n, v_r.l), v_r.c; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.pity, ([p, m, c, a, z]) => `    (${lit(p)}::float8, ${m}::bigint, ${lit(c)}::float8, ${a}::bigint, ${z}::bigint)`)}) p(p, m, c, a, z) loop
    if public.hr_pity_chance(v_r.p, v_r.m) is distinct from v_r.c or public.hr_pity_after(v_r.m, v_r.p, false) <> v_r.a or public.hr_pity_after(v_r.m, v_r.p, true) <> v_r.z then
      raise exception 'VERIFY(p): pity at % after % is % / % in SQL, % / % in JS', v_r.p, v_r.m, public.hr_pity_chance(v_r.p, v_r.m), public.hr_pity_after(v_r.m, v_r.p, false), v_r.c, v_r.a; end if;
  end loop;
  for v_r in select * from (values
${values(r.pins.carry, ([st, il, g]) => `    (${st}, ${il}, ${g}::bigint)`)}) p(st, il, g) loop
    if public.hr_carry_fee(v_r.st, v_r.il) <> v_r.g then raise exception 'VERIFY(q): a carry of % steps onto item Level % costs % in SQL, % in JS', v_r.st, v_r.il, public.hr_carry_fee(v_r.st, v_r.il), v_r.g; end if;
  end loop;
  raise notice 'gen-flame-temper: ${r.levels.length} Flame Levels, ${r.fuel.length} fuels, ${r.slots.length} Temper slots, ${r.itemLevels.length} item Levels, ${r.imbues.length} imbuements; every twin pinned; all green';
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const d = { ...base, flameD: { ...base.flameD }, temperD: { ...base.temperD }, imbueD: { ...base.imbueD }, party: { ...base.party }, danger: { ...base.danger } };
    patch(d);
    try { rowsOf(d); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  /* the data modules' own validators are proved by tests/flame-rules.mjs and tests/imbue.mjs; here, that a refusal stops the write */
  plant('a flame lever the data refuses', (d) => { d.flameD.validateFlame = () => ['planted']; });
  plant('an imbuement row the data refuses', (d) => { d.imbueD.validateImbues = () => ['planted']; });
  plant('Temper past the ledger slice', (d) => { d.temperD.TEMPER_STEPS = { ...base.temperD.TEMPER_STEPS, ranks: 6 }; });
  plant('Temper sold for gold alone (no kit share fee split)', (d) => { d.temperD.TEMPER_STEPS = { ...base.temperD.TEMPER_STEPS, kitSharePm: 1000 }; });
  plant('a re-seat that costs the whole ranks', (d) => { d.temperD.TEMPER_STEPS = { ...base.temperD.TEMPER_STEPS, carryPm: 1000 }; });
  plant('a Temper Kit that is no item', (d) => { d.temperD.TEMPER_STEPS = { ...base.temperD.TEMPER_STEPS, kitItem: 'no_such_kit' }; });
  plant('a pity that never keeps the stated rate', (d) => { d.party.PERSONAL_LOOT = { ...base.party.PERSONAL_LOOT, pityBasePm: 0 }; });
  plant('a carry with no price', (d) => { d.danger = { ...base.danger, CARRY: { ...base.danger.CARRY, hoursPerStepPm: 0 } }; });
  plant('slot weights off 1000', (d) => { d.danger = { ...base.danger, GEAR_STEPS: { ...base.danger.GEAR_STEPS, slotPm: { ...base.danger.GEAR_STEPS.slotPm, weapon: 300 } } }; });
  const sql = buildSql(rowsOf(base));
  for (const v of 'abcdefghijklmnopq') if (!new RegExp('VERIFY\\(' + v + '\\)').test(sql)) bites.push('VERIFY(' + v + ') is not in the file');
  if (bites.length) { console.error('gen-flame-temper --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-flame-temper --selftest: 9 refusals bite, 17 verifications pinned');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-flame-temper --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-flame-temper.mjs'); process.exit(1); }
      console.log('gen-flame-temper --check: catalogue matches src/data and src/core');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
