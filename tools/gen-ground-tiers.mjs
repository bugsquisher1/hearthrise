#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-ground-tiers.mjs — GENERATE THE SERVER'S TIER CATALOGUE (hr_ground_tiers).
//
// src/data/hunt-tiers.js is the one source of a ground's harder tiers: ONE table for every ground (TIER_TABLE: pull per party
// size, the monsters' damage and health, the XP a kill pays) under named per-ground overrides, resolved into GROUND_TIERS.
// The engine reads the data; the server reads hr_ground_tiers when it freezes a hunt's pull (hr_hunt_tier_set, the freeze in
// 2027-02-27-hunt-tiers.sql). This writes the resolved rows, rewritten whole, and a self-check.
// tests/hunt-core/hunt-tiers.mjs `catalogue` holds the file's insert equal to the data digit for digit (the CI guard).
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new dated file
// (OUT_NAME). 2027-02-27-hunt-tiers.sql (APPLIED) made the table and its first rows by hand.
//   2027-03-19-tier-risk.generated.sql (lane/b-tier-risk, Tyler 2026-11-06 "Yes, make it risky").
//   2027-03-20-tier-dials.generated.sql (lane/b-tier-dials, Tyler 2026-11-07: a tier is a % of XP and difficulty, never gold):
//   the shape moves to the data's dials, power_pm renamed dmg_pm and hp_pm new; every row as it stood, at hp_pm 1000.
//
//   node tools/gen-ground-tiers.mjs            write OUT_NAME
//   node tools/gen-ground-tiers.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-ground-tiers.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a row the table's checks would refuse (damage and health 1000-4000, XP 1000-2000, four
// pulls of 0-12), a harder tier that isn't harder and better paid than the one before (damage and health never fall, one of
// them rises, XP rises), the Glade's or the Warrens' Deadly without its full box (Tyler 10-18), and a dial past the server's
// value bound: hr_hunt_apply_member bounds a window's XP by K x the most a Normal kill of the ground can teach (VALUE_HEADROOM,
// hunt-sessions.js), so a tier asking more than K times a kill's damage, health or XP would see honest play refused.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2027-03-20-tier-dials.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const HARDER = ['dangerous', 'deadly'];
const FULL_BOX_GROUNDS = ['mosslight_glade', 'coppercap_warrens'];
const DIALS = ['dmgPm', 'hpPm', 'xpPm'];
const RANGE = { dmgPm: [1000, 4000], hpPm: [1000, 4000], xpPm: [1000, 2000] };

/** The SQL for `tiers` (GROUND_TIERS' shape) under the server's value headroom `headroom` (hunt-sessions.js VALUE_HEADROOM). */
export function buildSql(tiers, headroom) {
  if (!Number.isInteger(headroom) || headroom < 1) throw new Error('gen-ground-tiers: a value headroom of ' + headroom);
  const rows = [];
  for (const [ground, byTier] of Object.entries(tiers)) {
    let was = { dmgPm: 1000, hpPm: 1000, xpPm: 1000 };
    for (const id of HARDER) {
      const t = byTier[id];
      const at = 'gen-ground-tiers: ' + ground + ' ' + id;
      if (!t) throw new Error('gen-ground-tiers: ' + ground + ' has no ' + id + ' row');
      if (!Array.isArray(t.pull) || t.pull.length !== 4 || t.pull.some((p) => !Number.isInteger(p) || p < 0 || p > 12)) throw new Error(at + ' pull ' + t.pull);
      for (const k of DIALS) if (!Number.isInteger(t[k]) || t[k] < RANGE[k][0] || t[k] > RANGE[k][1]) throw new Error(at + ' ' + k + ' ' + t[k]);
      if (t.dmgPm < was.dmgPm || t.hpPm < was.hpPm || (t.dmgPm === was.dmgPm && t.hpPm === was.hpPm) || !(t.xpPm > was.xpPm)) {
        throw new Error(at + ' is not harder and better paid than the tier before');
      }
      for (const k of DIALS) if (t[k] > headroom * 1000) throw new Error(at + ' ' + k + ' ' + t[k] + ' is past the value bound (' + headroom + 'x a Normal kill)');
      was = t;
      rows.push([ground, id, t.pull, t.dmgPm, t.hpPm, t.xpPm]);
    }
  }
  for (const g of FULL_BOX_GROUNDS) if (tiers[g] && tiers[g].deadly.pull.some((p) => p !== 8)) throw new Error('gen-ground-tiers: ' + g + ' Deadly lost its full box');
  const values = rows.map(([g, id, pull, d, h, x]) => `  ('${g}', '${id}', '{${pull.join(',')}}'::int[], ${d}, ${h}, ${x})`).join(',\n');
  /* the self-check's copy is written another way on purpose: the catalogue guard reads the insert's form only */
  const check = rows.map(([g, id, pull, d, h, x]) => `(${["'" + g + "'", "'" + id + "'", 'array[' + pull.join(',') + ']', d, h, x].join(',')})`).join(',\n      ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HARDER TIERS' CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-ground-tiers.mjs from src/data/hunt-tiers.js GROUND_TIERS. Any hand edit FAILS
--   \`node tools/gen-ground-tiers.mjs --check\` and tests/hunt-core/hunt-tiers.mjs \`catalogue\`.
--
-- WHAT: hr_ground_tiers (made by 2027-02-27-hunt-tiers.sql, APPLIED) rewritten whole, ${rows.length} rows: per ground and tier the
-- pull for one to four heroes (0 = the ground as it stands), the monsters' damage and health and the XP a kill pays, permille.
-- Normal is no row and doesn't move. The data holds ONE table for every ground (hunt-tiers.js TIER_TABLE) under named
-- per-ground overrides; this table holds each ground's resolved rows, so every server reader stays one lookup. No function,
-- grant or client verb changes. The server reads the pull when it freezes a hunt and a row's presence when a hero picks it;
-- the engine reads the same numbers from the data, so the hr-accrue deploy carrying this GROUND_TIERS follows AT ONCE (a hunt
-- already running keeps the pull it froze; its blows and its next spawns read the deployed engine).
-- SHAPE (lane/b-tier-dials, Tyler 2026-11-07: a tier is "a scaling % of exp and difficulty BUT NOT GOLD"): power_pm is renamed
-- dmg_pm (the monsters' atk and Level, as before) and hp_pm is new (the monsters' health under the party scale; its kill yield
-- stays the party scale's, so more health pays no more coin or drops). Every dial stays inside the value bound hr_hunt_apply_member
-- reads (a window's XP under K x the most a Normal kill of the ground teaches, K = hr_hunt_limit('value_headroom')).
-- ORDER: after 2027-03-19-tier-risk.generated.sql (the last file to write these rows under the old shape). Idempotent: the
-- rename is guarded and the rows rewritten whole, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- REVERSIBLE: rename dmg_pm back to power_pm, drop hp_pm and re-apply 2027-03-19-tier-risk.generated.sql's rows.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_ground_tiers') is null then
    raise exception 'PRECONDITION: apply 2027-02-27-hunt-tiers.sql first (the table this file fills)'; end if;
  if to_regclass('public.hr_hunt_grounds') is null or to_regprocedure('public.hr_hunt_limit(text)') is null then
    raise exception 'PRECONDITION: the hunt-sessions catalogue first (hr_hunt_grounds, hr_hunt_limit)'; end if;
end $mig$;

-- ── §1 THE SHAPE: power_pm is dmg_pm, hp_pm is new ───────────────────────────
do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hr_ground_tiers' and column_name = 'power_pm') then
    alter table public.hr_ground_tiers rename column power_pm to dmg_pm;
  end if;
end $mig$;
alter table public.hr_ground_tiers add column if not exists hp_pm int;
alter table public.hr_ground_tiers drop constraint if exists hr_ground_tiers_power_pm_check;
alter table public.hr_ground_tiers drop constraint if exists hr_ground_tiers_dmg_pm_check;
alter table public.hr_ground_tiers drop constraint if exists hr_ground_tiers_hp_pm_check;

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
comment on table public.hr_ground_tiers is
  '${OUT_NAME}: the harder tiers a ground offers (src/data/hunt-tiers.js through tools/gen-ground-tiers.mjs; tests/hunt-core/hunt-tiers.mjs holds the two equal). Per ground and tier: the pull for 1-4 heroes, the monsters'' damage (dmg_pm) and health (hp_pm) and a kill''s Level XP (xp_pm), permille; never coin. Read by hr_hunt_tier_set and the freeze. No row = not offered. Normal is no row.';
delete from public.hr_ground_tiers;
insert into public.hr_ground_tiers (hunt_id, tier, pull, dmg_pm, hp_pm, xp_pm) values
${values};
alter table public.hr_ground_tiers alter column hp_pm set not null;
alter table public.hr_ground_tiers add constraint hr_ground_tiers_dmg_pm_check check (dmg_pm between 1000 and 4000);
alter table public.hr_ground_tiers add constraint hr_ground_tiers_hp_pm_check check (hp_pm between 1000 and 4000);

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The shape is the data's; the rows are exactly the generated set, each on a ground the catalogue knows; on every ground Deadly is
-- harder (damage and health never fall, one rises) and better paid than Dangerous; the Glade and the Warrens keep their full box on
-- Deadly; no dial is past the value bound; the checks refuse a dial under the row; no client reaches the table.
do $$
declare v_role text; v_k numeric := public.hr_hunt_limit('value_headroom');
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_ground_tiers' and column_name = 'power_pm')
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_ground_tiers'
          and column_name in ('dmg_pm', 'hp_pm', 'xp_pm') and data_type = 'integer' and is_nullable = 'NO') <> 3 then
    raise exception 'tier-dials: hr_ground_tiers is not shaped (dmg_pm, hp_pm, xp_pm), every one an integer and not null'; end if;
  if (select count(*) from public.hr_ground_tiers) <> ${rows.length}
     or exists (select 1 from (values
      ${check}) d(hunt_id, tier, pull, dmg_pm, hp_pm, xp_pm)
                 where not exists (select 1 from public.hr_ground_tiers t where t.hunt_id = d.hunt_id and t.tier = d.tier
                                     and t.pull = d.pull and t.dmg_pm = d.dmg_pm and t.hp_pm = d.hp_pm and t.xp_pm = d.xp_pm)) then
    raise exception 'tier-dials: hr_ground_tiers is not the generated %-row set', ${rows.length}; end if;
  if exists (select 1 from public.hr_ground_tiers t where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id)) then
    raise exception 'tier-dials: a tier row names a ground the catalogue does not hold'; end if;
  if exists (select 1 from public.hr_ground_tiers a join public.hr_ground_tiers b on b.hunt_id = a.hunt_id and b.tier = 'deadly'
              where a.tier = 'dangerous' and (b.dmg_pm < a.dmg_pm or b.hp_pm < a.hp_pm or (b.dmg_pm = a.dmg_pm and b.hp_pm = a.hp_pm) or b.xp_pm <= a.xp_pm)) then
    raise exception 'tier-dials: a ground''s Deadly is not harder and better paid than its Dangerous'; end if;
  if exists (select 1 from public.hr_ground_tiers t where t.tier = 'deadly' and t.hunt_id in ('mosslight_glade', 'coppercap_warrens') and t.pull <> array[8,8,8,8]) then
    raise exception 'tier-dials: the Glade or the Warrens lost its full box on Deadly'; end if;
  if v_k is null or exists (select 1 from public.hr_ground_tiers t where greatest(t.dmg_pm, t.hp_pm, t.xp_pm) > v_k * 1000) then
    raise exception 'tier-dials: a dial is past the value bound (% x a Normal kill)', v_k; end if;
  begin
    update public.hr_ground_tiers set hp_pm = 999 where tier = 'deadly';
    raise exception 'tier-dials: a health under the row''s was stored';
  exception when check_violation then null;
  end;
  begin
    update public.hr_ground_tiers set dmg_pm = 999 where tier = 'deadly';
    raise exception 'tier-dials: a damage under the row''s was stored';
  exception when check_violation then null;
  end;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_ground_tiers', 'select,insert,update,delete') then
      raise exception 'tier-dials: % reaches hr_ground_tiers', v_role; end if;
  end loop;
end $$;
`;
}

async function loadData(root) {
  const { BUILD } = await import(pathToFileURL(join(root, 'src/build-info.js')).href);
  const v = '?v=' + BUILD.version;
  const T = await import(pathToFileURL(join(root, 'src/data/hunt-tiers.js')).href + v);
  const { VALUE_HEADROOM } = await import(pathToFileURL(join(root, 'src/data/hunt-sessions.js')).href + v);
  return { tiers: T.GROUND_TIERS, overrides: T.GROUND_OVERRIDES, headroom: VALUE_HEADROOM };
}

/* ONE FORMULA, SAID OUT LOUD: every override that moves a dial and not just the pull (the table's numbers are the designer's to
   fold in; a pull override is a ground's shape). Informational: it never refuses. */
function dialOverrides(overrides) {
  const out = [];
  for (const [g, byTier] of Object.entries(overrides)) for (const id of HARDER) for (const k of DIALS) if (byTier[id] && byTier[id][k] !== undefined) out.push(g + ' ' + id + ' ' + k + ' ' + byTier[id][k]);
  return out;
}

async function selftest() {
  const { tiers: T, headroom } = await loadData(ROOT);
  let bad = 0;
  const copy = () => JSON.parse(JSON.stringify(T));
  const expectThrow = (name, edit, k = headroom) => { const t = copy(); edit(t); try { buildSql(t, k); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  expectThrow('a Deadly no harder than its Dangerous', (t) => { t.wickstead.deadly.dmgPm = t.wickstead.dangerous.dmgPm; t.wickstead.deadly.hpPm = t.wickstead.dangerous.hpPm; });
  expectThrow('a Deadly with less health than its Dangerous', (t) => { t.wickstead.dangerous.hpPm = 1200; t.wickstead.deadly.hpPm = 1100; });
  expectThrow('a Deadly paying no more than its Dangerous', (t) => { t.mosslight_glade.deadly.xpPm = t.mosslight_glade.dangerous.xpPm; });
  expectThrow('a damage the table refuses', (t) => { t.wickstead.deadly.dmgPm = 4500; });
  expectThrow('a health under the row', (t) => { t.wickstead.dangerous.hpPm = 900; });
  expectThrow('a health past the value bound', (t) => { t.coppercap_warrens.deadly.hpPm = 3500; });
  expectThrow('a damage past a tighter value bound', () => {}, 2);
  expectThrow('three pulls for four sizes', (t) => { t.wickstead.dangerous.pull = [0, 4, 4]; });
  expectThrow('the Glade without its full box', (t) => { t.mosslight_glade.deadly.pull = [4, 8, 8, 8]; });
  expectThrow('a ground with no Deadly', (t) => { delete t.millrace_sewer.deadly; });
  const sql = buildSql(T, headroom);
  const inserts = [...sql.matchAll(/\('([a-z_]+)', '([a-z]+)', '\{([0-9,]+)\}'::int\[\], (\d+), (\d+), (\d+)\)/g)].length;
  if (inserts !== Object.keys(T).length * HARDER.length) { console.error('  MISSED  the catalogue guard would read ' + inserts + ' rows'); bad++; }
  else console.log('  caught  a self-check the catalogue guard would read twice');
  if (bad) { console.error('gen-ground-tiers --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-ground-tiers --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const { tiers, overrides, headroom } = await loadData(ROOT);
  const wanted = buildSql(tiers, headroom);
  const dials = dialOverrides(overrides);
  const said = dials.length ? dials.length + ' per-ground dial override(s), not one formula yet: ' + dials.join('; ') : 'every ground on the one table (overrides are pulls only)';
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) { console.error('gen-ground-tiers --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-ground-tiers.mjs'); process.exit(1); }
    console.log('gen-ground-tiers --check: ' + OUT_NAME + ' matches src/data/hunt-tiers.js GROUND_TIERS (' + said + ')');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-ground-tiers: wrote ' + OUT_NAME + ' (' + said + ')');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
