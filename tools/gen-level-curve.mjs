#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-level-curve.mjs — GENERATE THE SERVER'S LEVEL CURVE.
//
// src/data/core-model.js LEVEL_CURVE (pace brackets) is the one source of the XP
// every character Level costs; src/core/xp.js derives its rows (levelCurveRows:
// each bracket's start Level, the total XP that reaches it, its first step, rise
// and bend) and reads them both ways (charXpForLevel, charLevelFromXp). Level is
// server-authoritative (CLAUDE.md §1): the settle prices a death's floor, the
// vitals and every Level gate with the SQL twins, so this file emits
//   hr_level_curve          the derived rows, exactly the browser's and the edge's
//   hr_char_xp_for_level()  total XP to reach a Level (the bracket's closed form)
//   hr_char_level()         the Level an XP total makes (the bracket, then a binary
//                           search inside it: no loop that can fail to end)
// and a self-check that pins both functions to the JS values at every bracket
// edge and Tyler's target Levels. tests/core-curves.mjs compares the two halves
// over the replayed chain.
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in
// place; a new curve is a new dated file (OUT_NAME). 2027-02-01 was the first
// (lane/b-level-curve: the bracket curve replaced the 10-19 quartic, whose
// coefficients lived in hr_hunt_limits; APPLIED 2026-10-28 with v0.2.57, history).
// 2027-02-04-level-curve-smooth (lane/b-curve-smooth) re-shapes the first ten Levels:
// the same table and bodies, new rows.
//
//   Regenerate:  node tools/gen-level-curve.mjs
//   Verify:      node tools/gen-level-curve.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-level-curve.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a curve that does not start at Level 1, a
// bracket whose start Level does not rise or whose rise and bend are not whole
// numbers summing to 1 or more (src/core/xp.js), and a curve whose pinned totals
// leave 2^53 before Level 1,000 (the browser could not hold them exactly).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 2027-02-07-level-curve-wickstead (lane/a-v0263-reds): Wickstead opened (8-18 solo, v0.2.63), so the pace was re-measured
   (plans pace + ladder) and the brackets re-fitted (pace.mjs --fit); 2027-02-04 is APPLIED history. Same table, new rows. */
/* 2027-02-08-unsourced-level-curve (lane b-unsourced-items): 2027-02-07 is APPLIED history. The boar and the bear moved the
   measured pace, and Level 5 -> 6 sat at 2.01x the step before (C6); Levels 4-5 eased by hand, nothing else moves. */
/* 2027-02-09-walk-on-level-curve (lane/a-pull-freeze, Coordinator ruling 2026-10-29): 2027-02-08 is APPLIED history. With
   every pack down a hero now walks on to the next spawn (report #69), so Levels 5-15 earn 7-12% more an hour and Level 25
   fell to 32 h; re-measured (plans pace + ladder) and re-fitted by pace.mjs --fit (minimax 3.3%). Same table, new rows. */
/* 2027-03-15-pace-final-level-curve (lane/b-pace-final, the final pace re-measure before the wipe, 2026-11-06): 2027-02-09 is
   APPLIED history. Re-measured on the set that holds every change that moves combat or drops (plans pace + ladder): the ladder
   now trends 1019 x L^1.365 (LEVEL_PACE.contract follows it, so the brackets from Level 50 re-fit: pace.mjs --fit --fit-past),
   and Level 6 sat at 2.03x Level 5's minutes (C6), so Levels 1-9 re-shape at 1.95x from the Thicket (pace.mjs --fit
   --hold-from 10); Levels 10-49 cost what they did. ROWS ONLY: 2027-02-11-settle-plan-cache-2.generated.sql holds
   hr_char_xp_for_level as LANGUAGE plpgsql (PostgreSQL 17 re-plans a SQL body on every call) and hr_char_level is plpgsql;
   both read the table, so this file restates neither (a SQL copy would turn tests/settle-budget.mjs SB-3 red) and its §0
   refuses to run before 02-11. */
/* 2027-03-15-pace-final is APPLIED history; the ground formula's Cellar eased Level 4 -> 5 by 20 XP (C6), rows only, the same table (lane/b-ground-formula-2). */
/* 2027-03-20-ground-formula-level-curve.generated.sql is APPLIED history; the re-fit after the re-tune (lane/b-one-difficulty) is a new dated file. */
/* 2027-04-07-brook-bear-level-curve (lane/c-brook-bear, 2026-11-10): the Brook Bear stands in the Glade as built, which moved the pace fingerprint, so
   plans pace + ladder were re-measured. Every bracket under Level 50 holds (C2); the ladder now trends 975 x L^1.421 (the Glade +5.1%, the Warrens
   +8.7% from lanes since 11-09), LEVEL_PACE.contract follows it (C5), and the brackets from Level 50 re-fit (pace.mjs --fit --fit-past). Same table,
   new rows; 2027-03-23 stays history. */
export const OUT_NAME = '2027-04-07-brook-bear-level-curve.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/* The Levels the self-check pins: every bracket's edge, Tyler's target Levels and a deep one. */
function pinLevels(rows) {
  const s = new Set([1, 2, 3, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 5000]);
  for (const r of rows) for (const d of [-1, 0, 1]) if (r.from + d >= 1) s.add(r.from + d);
  return [...s].sort((a, b) => a - b);
}

/** The SQL for a curve, read through xp.js's own functions (`XP`: { levelCurveRows, charXpForLevel }). */
export function buildSql(XP) {
  const rows = XP.levelCurveRows();
  if (!rows.length || rows[0].from !== 1) throw new Error('gen-level-curve: the curve does not start at Level 1');
  const pins = pinLevels(rows).map((L) => [L, XP.charXpForLevel(L)]);
  for (const [L, x] of pins) if (L <= 1000 && !Number.isSafeInteger(x)) throw new Error('gen-level-curve: Level ' + L + ' needs ' + x + ' XP, past 2^53');
  const deep = pins.filter(([, x]) => Number.isSafeInteger(x));
  const values = rows.map((r) => `  (${r.from}, ${r.base}, ${r.first}, ${r.rise}, ${r.bend})`).join(',\n');
  const pinValues = deep.map(([L, x]) => `(${L}, ${x})`).join(', ');
  const l10 = XP.charXpForLevel(10), l50 = XP.charXpForLevel(50);
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE LEVEL CURVE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-level-curve.mjs from src/data/core-model.js LEVEL_CURVE
--   through src/core/xp.js levelCurveRows. Any hand edit FAILS
--   \`node tools/gen-level-curve.mjs --check\`.
--
-- WHAT: the character's Level curve as PACE BRACKETS (lane/b-level-curve, to Tyler's
-- balance ruling 2026-10-25 §2: L10 6 h, L25 36 h, L50 168 h ... L1000 23,520 h of
-- efficient hunting, held on the real engine by tools/balance-sim): from a bracket's
-- start Level the step to the next Level costs first + rise x m + bend x m^2 (m Levels
-- into the bracket). hr_level_curve holds ${rows.length} rows, rewritten whole. ROWS ONLY: the two
-- curve functions read this table and are not restated (hr_char_xp_for_level is LANGUAGE
-- plpgsql since 2027-02-11-settle-plan-cache-2.generated.sql: a SQL copy is re-planned on
-- every call on PostgreSQL 17), so every reader (the settle's death floor, hr_level_block,
-- hr_level_of, the analyzer's ETA) follows with no edit.
-- NEW IN THIS FILE (lane/c-brook-bear, 2026-11-10): the Brook Bear stands in the Glade as
-- built, so the pace was re-measured; the ground ladder now pays 975 x L^1.421 Level XP an
-- hour, so the brackets from Level 50 re-fit to it. Level 10 at ${l10} XP, Level 50 at ${l50};
-- Levels 1-51 cost what they did; only the Levels past them move. LIVE CHARACTERS: nothing is stored per Level, so a
-- character whose Level XP now makes a different Level simply shows it; no row is written.
-- The death floor is re-read at each settle, so the edge's and the server's floors agree
-- once the hr-accrue deploy carrying the same LEVEL_CURVE follows this file (AT ONCE:
-- between the two, a death's loss is priced on the old curve and may be refused once as
-- death_xp_over, then settles on the next tick after the deploy).
-- ORDER: after 2027-02-11-settle-plan-cache-2.generated.sql (APPLIED); the hr-accrue deploy
-- carrying the same LEVEL_CURVE follows AT ONCE. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_char_xp_for_level(integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-27-core-bodies.sql first (the curve functions this file feeds)'; end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'public.hr_char_xp_for_level(integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'PRECONDITION: apply 2027-02-11-settle-plan-cache-2.generated.sql first (hr_char_xp_for_level as plpgsql)'; end if;
end $mig$;

-- ── §1 THE ROWS ──────────────────────────────────────────────────────────────
create table if not exists public.hr_level_curve (
  from_level int    primary key check (from_level >= 1),
  base_xp    bigint not null check (base_xp >= 0),
  first_xp   bigint not null check (first_xp >= 1),
  rise       bigint not null check (rise >= 0),
  bend       bigint not null check (bend >= 0),
  constraint hr_level_curve_rises_ck check (rise + bend >= 1)
);
alter table public.hr_level_curve enable row level security;
revoke all on public.hr_level_curve from public, anon, authenticated, service_role;

delete from public.hr_level_curve;
insert into public.hr_level_curve (from_level, base_xp, first_xp, rise, bend) values
${values};

-- ── §2 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rows are exactly the generated set; both functions answer the JS values at every pinned Level (bracket edges,
-- the target Levels, a deep one) and read back each boundary exactly (x - 1, x, the next total - 1); every step from
-- Level 1 to 3,000 costs more than the one before; the block a fresh hero projects is Level 1 needing the first step;
-- no client reaches the rows or the functions.
do $$
declare v_bad text; v_role text;
begin
  if (select count(*) from public.hr_level_curve) <> ${rows.length}
     or exists (select 1 from (values
${values}) d(from_level, base_xp, first_xp, rise, bend)
                 where not exists (select 1 from public.hr_level_curve k where k.from_level = d.from_level and k.base_xp = d.base_xp
                                     and k.first_xp = d.first_xp and k.rise = d.rise and k.bend = d.bend)) then
    raise exception 'level-curve: hr_level_curve is not the generated ${rows.length}-row set'; end if;
  select string_agg(p.l || ': ' || public.hr_char_xp_for_level(p.l) || ' <> ' || p.x, ', ') into v_bad
    from (values ${pinValues}) p(l, x)
   where public.hr_char_xp_for_level(p.l) <> p.x;
  if v_bad is not null then raise exception 'level-curve: hr_char_xp_for_level disagrees with src/core/xp.js at %', v_bad; end if;
  select string_agg(p.l::text, ', ') into v_bad
    from (values ${pinValues}) p(l, x)
   where public.hr_char_level(p.x) <> p.l
      or (p.l > 1 and public.hr_char_level(p.x - 1) <> p.l - 1)
      or public.hr_char_level(public.hr_char_xp_for_level(p.l + 1) - 1) <> p.l;
  if v_bad is not null then raise exception 'level-curve: hr_char_level does not read back Level(s) %', v_bad; end if;
  select string_agg(s.l::text, ', ') into v_bad from (
    select l, public.hr_char_xp_for_level(l + 1) - public.hr_char_xp_for_level(l) as step,
           lag(public.hr_char_xp_for_level(l + 1) - public.hr_char_xp_for_level(l)) over (order by l) as before
      from generate_series(1, 3000) l) s
   where s.step < 1 or s.step <= s.before;
  if v_bad is not null then raise exception 'level-curve: the step to Level(s) % does not cost more than the one before', v_bad; end if;
  if public.hr_level_block(0) <> jsonb_build_object('xp', 0, 'level', 1, 'into', 0, 'need', ${rows[0].first}) then
    raise exception 'level-curve: a fresh hero does not project Level 1 needing % XP', ${rows[0].first}; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_level_curve', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_char_level(bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_char_xp_for_level(integer)', 'execute') then
      raise exception 'level-curve: % reaches the curve', v_role; end if;
  end loop;
end $$;
`;
}

async function loadXp(root) {
  const { BUILD } = await import(pathToFileURL(join(root, 'src/build-info.js')).href);
  return import(pathToFileURL(join(root, 'src/core/xp.js')).href + '?v=' + BUILD.version);
}

async function selftest() {
  const XP = await loadXp(ROOT);
  let bad = 0;
  const expectThrow = (name, fn) => { try { fn(); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  const rows = XP.levelCurveRows();
  const withRows = (edit) => ({ levelCurveRows: () => edit(rows.map((r) => ({ ...r }))), charXpForLevel: XP.charXpForLevel });
  expectThrow('a curve that does not start at Level 1', () => buildSql(withRows((r) => { r[0].from = 2; return r; })));
  expectThrow('an empty curve', () => buildSql(withRows(() => [])));
  expectThrow('a curve whose Level 1,000 total passes 2^53', () => buildSql({ levelCurveRows: XP.levelCurveRows, charXpForLevel: (L) => (L >= 1000 ? 2 ** 60 : XP.charXpForLevel(L)) }));
  /* the data's own refusals live in src/core/xp.js (levelCurveRowsOf): a planted bracket must throw */
  const { LEVEL_CURVE } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href);
  const planted = (edit) => () => XP.levelCurveRowsOf(edit(JSON.parse(JSON.stringify(LEVEL_CURVE))));
  expectThrow('a bracket that neither rises nor bends', planted((c) => { c.brackets[1].rise = 0; c.brackets[1].bend = 0; return c; }));
  expectThrow('a bracket starting before the one above it', planted((c) => { c.brackets[2].from = c.brackets[1].from; return c; }));
  expectThrow('a fractional bend', planted((c) => { c.brackets[0].bend = 1.5; return c; }));
  expectThrow('a first step of 0 XP (Level 2 for nothing)', planted((c) => { c.first = 0; return c; }));
  const sql = buildSql(XP);
  /* the rows are revoked here; the functions' grants stand from the file that last restated them, and the self-check executes
     has_function_privilege on both for every client role */
  if (!/revoke all on public\.hr_level_curve/.test(sql) || !/has_function_privilege\(v_role, 'public\.hr_char_level\(bigint\)', 'execute'\)/.test(sql)
      || !/has_function_privilege\(v_role, 'public\.hr_char_xp_for_level\(integer\)', 'execute'\)/.test(sql)) { console.error('  MISSED  the curve is client-reachable'); bad++; }
  else console.log('  caught  a client-reachable curve');
  /* rows only (2027-03-15): the file restates no function, so neither curve function can come back as SQL (settle-budget SB-3)
     or read the retired limits */
  if (/create or replace function/.test(sql) || /level_quartic|hr_hunt_limit/.test(sql)) { console.error('  MISSED  the file restates a curve function'); bad++; }
  else console.log('  caught  a curve function restated (SQL, re-planned per call)');
  if (bad) { console.error('gen-level-curve --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-level-curve --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const wanted = buildSql(await loadXp(ROOT));
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) {
      console.error('gen-level-curve --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-level-curve.mjs');
      process.exit(1);
    }
    console.log('gen-level-curve --check: ' + OUT_NAME + ' matches src/data/core-model.js LEVEL_CURVE');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-level-curve: wrote ' + OUT_NAME);
}

if (isMain(import.meta.url)) main();
