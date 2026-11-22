#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-gold-estimate.mjs — GENERATE THE SERVER'S GOLD-AN-HOUR ESTIMATE AND ITS SECTION (lane/gold-per-hour, systems, 2026-11-22;
//   Tyler 2026-11-22: "About N gold an hour, before supplies" on each Danger scale ground).
//
// src/core/gold-estimate.js is the one rule; src/data/gold-estimate.js (a Risk's ratio to Steady), src/data/danger.js DANGER_GROUNDS (which
// grounds are on the scale) and src/data/hunts.js (each ground's band top) are its numbers, and src/core/wage.js's wage its base (the server
// twin hr_wage, 1058-hunting-blocks-catalogue.generated.sql). This writes OUT_NAME whole:
//   hr_gold_estimate(hunt, risk, level)     internal, the twin of gold-estimate.js goldEstimate, its numbers inline (no table)
//   hr_gold_estimate_view(user, slot)       the `gold_estimate` section: { level, grounds: { <hunt>: { <risk>: gold } } }
// with a self-check pinning the twin to the JS at every scale ground x Risk x PIN_LEVELS, and null off the scale.
//
// A ground joins DANGER_GROUNDS (R10's lane and later) -> --check is red until this is re-run: the estimate never silently skips one.
// THE FORWARD-FILE RULE: OUT_NAME is regenerated in place only while its sidecar says STAGED; once applied, new rows are a new sequence file.
//
//   node tools/gen-gold-estimate.mjs            write OUT_NAME
//   node tools/gen-gold-estimate.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-gold-estimate.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a Risk ratio that is not a whole permille in [1, 5000], no Steady at 1000 (the wage IS a Steady hour),
// a Risk the scale's stances do not name, a Risk word that is not [a-z_], no scale ground, and an estimate at the last step past a safe integer.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1060-gold-estimate-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
/* the Levels the twin is pinned at: the first, the scale's band edges, the wage's reference Levels, either side of a band top, far past it */
export const PIN_LEVELS = Object.freeze([1, 10, 40, 54, 55, 60, 63, 70, 74, 75, 76, 200, 4000, 5000]);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [est, data, danger, wageCore] = await Promise.all([imp('src/core/gold-estimate.js'), imp('src/data/gold-estimate.js'), imp('src/data/danger.js'),
    imp('src/core/wage.js')]);
  return { grounds: est.estimateGrounds(), riskPm: data.GOLD_ESTIMATE.riskPm, risks: Object.keys(danger.RISKS), stepMax: danger.DANGER.stepMax,
    wage: wageCore.wage, goldEstimate: est.goldEstimate };
}

/** The resolved rows and pins, refused on a defect. */
export function rowsOf(d) {
  const problems = [];
  const risks = Object.keys(d.riskPm || {});
  for (const r of risks) {
    if (!/^[a-z_]{1,16}$/.test(r)) problems.push('risk ' + JSON.stringify(r) + ' is not a lower-case word');
    if (!d.risks.includes(r)) problems.push('risk ' + r + ' is no stance of the scale (src/data/danger.js RISKS)');
    const pm = d.riskPm[r];
    if (!Number.isSafeInteger(pm) || pm < 1 || pm > 5000) problems.push('risk ' + r + ' pays ' + pm + ' permille, want a whole number in [1, 5000]');
  }
  if (d.riskPm && d.riskPm.steady !== 1000) problems.push('Steady must be 1000 permille (the wage is a Steady hour), got ' + (d.riskPm && d.riskPm.steady));
  for (const r of d.risks) if (!risks.includes(r)) problems.push('the stance ' + r + ' has no ratio (src/data/gold-estimate.js riskPm)');
  if (!d.grounds.length) problems.push('no scale ground with a band top');
  const maxPm = Math.max(0, ...risks.map((r) => d.riskPm[r]));
  if (!(d.wage(d.stepMax) * maxPm < Number.MAX_SAFE_INTEGER)) problems.push('the estimate at the last step passes a safe integer');
  if (problems.length) throw new Error('gen-gold-estimate: ' + problems.join('; '));
  const rk = risks.slice().sort();
  const pins = [];
  for (const g of d.grounds) for (const r of rk) for (const L of PIN_LEVELS) pins.push({ hunt: g.hunt, risk: r, L, gold: d.goldEstimate(g.hunt, r, L) });
  return { grounds: d.grounds, risks: rk.map((r) => ({ risk: r, pm: d.riskPm[r] })), pins, stepMax: d.stepMax };
}

export function buildSql(r) {
  const topCase = r.grounds.map((g) => `when '${g.hunt}' then ${g.top}`).join(' ');
  const floorCase = r.grounds.map((g) => `when '${g.hunt}' then ${g.floor}`).join(' ');
  const pmCase = r.risks.map((x) => `when '${x.risk}' then ${x.pm}`).join(' ');
  const huntList = r.grounds.map((g) => `'${g.hunt}'`).join(', ');
  const riskList = r.risks.map((x) => `'${x.risk}'`).join(', ');
  const pinValues = r.pins.map((p) => `    ('${p.hunt}', '${p.risk}', ${p.L}, ${p.gold === null ? 'null' : p.gold}::bigint)`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — ABOUT HOW MUCH GOLD AN HOUR EACH SCALE GROUND PAYS  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-gold-estimate.mjs from src/core/gold-estimate.js (goldEstimate), src/data/gold-estimate.js (riskPm),
--   src/data/danger.js (DANGER_GROUNDS, RISKS) and src/data/hunts.js (each ground's band top). Any hand edit FAILS
--   \`node tools/gen-gold-estimate.mjs --check\`.
--
-- STATUS: supabase/migration-notes/${OUT_NAME}.json (STAGED until the Coordinator applies it).
-- WHAT (lane/gold-per-hour, systems-engineer, 2026-11-22; Tyler 2026-11-22): the Hunts window's "About N gold an hour, before supplies"
-- on each Danger scale ground, computed here, never in the browser (CLAUDE.md §6).
--   hr_gold_estimate(hunt, risk, level)  internal, the twin of goldEstimate: floor(hr_wage(min(Level, the band top)) x risk permille / 1000),
--                                        to two significant figures, halves up; null under the band floor, off the scale (${r.grounds.length} ground${r.grounds.length === 1 ? '' : 's'}:
--                                        ${r.grounds.map((g) => g.hunt + ' Levels ' + g.floor + '-' + g.top).join(', ')}) or for a Risk with no ratio
--                                        (${r.risks.map((x) => x.risk + ' ' + x.pm).join(', ')}). Pinned at ${r.pins.length} values (§3).
--   SECTION \`gold_estimate\` (hr_gold_estimate_view): { level, grounds: { <hunt>: { <risk>: gold } } }, every ground that is both in this
--                                        file and in the server's own scale catalogue (hr_danger_grounds); null with no hero or no ground.
-- READERS: the client's src/session/gold-estimate-sections.js (the Hunts window's line under the Risk pick). Nothing that moves value.
-- ORDER: 1060 in its name, after 1055 (hr_danger_grounds) and 1058-hunting-blocks-catalogue.generated.sql (hr_wage). Idempotent: every
-- function restated, the section row upserted, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EDGE: none. CLIENT: the line rides the release after this applies; before it, the section is absent and the line is not drawn.
-- EXPLOIT SURFACE: none added. Two internal functions, revoked from every client role; the section is a read of the hero's own Level.
-- No value moves, nothing crosses to another player.
-- COST: one hr_level_of and one PK probe of hr_danger_grounds a ground, per envelope: a few microseconds; no rows written.
-- REVERSIBLE: delete the section row; drop the two functions.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the wage first (1058-hunting-blocks-catalogue.generated.sql, hr_wage)'; end if;
  if to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: the Danger scale catalogue first (1055-danger-scale-danger-catalogue.generated.sql, hr_danger_grounds)'; end if;
  if to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.player_state') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (hr_level_of, hr_state_sections, player_state)'; end if;
end $mig$;

-- ── §1 THE ESTIMATE'S SQL TWIN (internal) ────────────────────────────────────
create or replace function public.hr_gold_estimate(p_hunt text, p_risk text, p_level int)
returns bigint language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  v_floor int := case p_hunt ${floorCase} end;
  v_top int := case p_hunt ${topCase} end;
  v_pm int := case p_risk ${pmCase} end;
  v_step int := greatest(1, least(${r.stepMax}, coalesce(p_level, 1)));
  v_g bigint; v_h bigint := 1;
begin
  -- ABOUT THE GOLD AN HOUR (${OUT_NAME}; src/core/gold-estimate.js goldEstimate): the wage at the hero's Level held to the ground's
  -- band top, times the Risk's ratio to Steady, to two significant figures; none under the band's floor (nothing measured there).
  -- Whole integers throughout, as the JS.
  if v_top is null or v_pm is null or v_step < v_floor then return null; end if;
  v_g := public.hr_wage(least(v_step, v_top)) * v_pm / 1000;
  if v_g < 100 then return greatest(0, v_g); end if;
  while v_g >= v_h * 100 loop v_h := v_h * 10; end loop;
  return (v_g + v_h / 2) / v_h * v_h;
end $fn$;

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_gold_estimate_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_lv int; v_out jsonb := '{}'::jsonb; v_h text;
begin
  -- THE SECTION \`gold_estimate\` (${OUT_NAME}): each scale ground's estimate at every Risk for this hero's Level. The client picks the
  -- plan's Risk and draws the number; it computes nothing.
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  for v_h in select g.hunt_id from public.hr_danger_grounds g where g.hunt_id in (${huntList}) order by g.hunt_id loop
    v_out := v_out || jsonb_build_object(v_h, (select jsonb_object_agg(k.risk, public.hr_gold_estimate(v_h, k.risk, v_lv) order by k.risk)
                                                 from unnest(array[${riskList}]) k(risk)));
  end loop;
  return case when v_out = '{}'::jsonb then null else jsonb_build_object('level', v_lv, 'grounds', v_out) end;
end $fn$;
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_gold_estimate(text,text,integer)', 'public.hr_gold_estimate_view(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
insert into public.hr_state_sections (key, fn, note) values
  ('gold_estimate', 'hr_gold_estimate_view', '${OUT_NAME}: about the gold an hour each Danger scale ground pays this hero before supplies, { level, grounds: { <hunt_id>: { <risk>: gold } } }')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The twin answers the JS at every pinned ground x Risk x Level, null off the scale and for an unknown Risk; no client role runs either
-- function; the section is registered to its function.
do $mig$
declare v_r record; v_p bigint;
begin
  for v_r in select * from (values
${pinValues}) p(hunt, risk, l, gold) loop
    v_p := public.hr_gold_estimate(v_r.hunt, v_r.risk, v_r.l);
    if v_p is distinct from v_r.gold then
      raise exception 'VERIFY(a): % on % at Level % is % in SQL, % in src/core/gold-estimate.js', v_r.hunt, v_r.risk, v_r.l, v_p, v_r.gold; end if;
  end loop;
  if public.hr_gold_estimate('mill_cellar', 'steady', 60) is not null or public.hr_gold_estimate(${huntList.split(', ')[0]}, 'reckless', 60) is not null then
    raise exception 'VERIFY(b): an estimate off the scale or for an unknown Risk'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_function_privilege(g.r, 'public.hr_gold_estimate(text,text,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_gold_estimate_view(uuid,integer)', 'execute')) then
    raise exception 'VERIFY(c): a client role runs the estimate'; end if;
  if not exists (select 1 from public.hr_state_sections where key = 'gold_estimate' and fn = 'hr_gold_estimate_view') then
    raise exception 'VERIFY(d): the gold_estimate section is not registered'; end if;
  raise notice 'gen-gold-estimate: % ground(s), % Risks, % pins; all green', ${r.grounds.length}, ${r.risks.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const d = { ...base, riskPm: { ...base.riskPm }, grounds: base.grounds.slice(), risks: base.risks.slice() };
    patch(d);
    try { rowsOf(d); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('Steady off 1000', (d) => { d.riskPm.steady = 1100; });
  plant('a ratio of no gold', (d) => { d.riskPm.careful = 0; });
  plant('a ratio that is not whole', (d) => { d.riskPm.bold = 1270.5; });
  plant('a ratio past the bound', (d) => { d.riskPm.bold = 9000; });
  plant('a Risk no stance names', (d) => { d.riskPm.reckless = 1500; });
  plant('a stance with no ratio', (d) => { delete d.riskPm.careful; });
  plant('a Risk word that is no word', (d) => { d.riskPm["x';--"] = 900; d.risks.push("x';--"); });
  plant('no scale ground', (d) => { d.grounds = []; });
  plant('an estimate past a safe integer', (d) => { d.wage = () => Number.MAX_SAFE_INTEGER; });
  const sql = buildSql(rowsOf(base));
  if (!/VERIFY\(a\)/.test(sql) || !/'gold_estimate', 'hr_gold_estimate_view'/.test(sql)) bites.push('the twin is not pinned or the section is not registered');
  if (bites.length) { console.error('gen-gold-estimate --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-gold-estimate --selftest: 9 refusals bite, the twin is pinned and the section registered');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-gold-estimate --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-gold-estimate.mjs'); process.exit(1); }
      console.log('gen-gold-estimate --check: the estimate matches src/core and src/data');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
