#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-skill-curve.mjs — GENERATE THE SERVER'S SKILL CURVES (lane/skills-time-parity, systems-engineer, 2026-11-23).
//
// src/data/core-model.js is the one source of what a skill level costs; src/core/xp.js walks it (skillXpForLevel,
// skillLevelFromXp) for the browser and the edge. A skill level is server-authoritative (CLAUDE.md §1: a rune's and a
// supply's gate, the yard's fee, a death's skill loss, the envelope's skill bars read the SQL twins), so this file emits
// both uncapped curves and the two functions that read them:
//   hr_skill_curve          the combat skills' curve on the LEVEL CLOCK (stage 7, docs/design/redesign/27-formula-overhaul.md
//                           row P-3): skill level n costs SKILL_CURVE.pacePm / 1000 x the hours Level n takes (LEVEL_HOURS)
//                           x SKILL_CURVE.xpPerHealthHour x the reference health of Level n (VITALS), to SKILL_CURVE.top. The
//                           rows are computed in Postgres from the same whole levers, in exact numeric (div), and held to
//                           the browser's walk by an md5 of every row
//   hr_flame_skill_curve    Inner Flame's curve (FLAME_SKILL_CURVE, the core rebuild's geometric one, which every combat
//                           skill walked until this file), its 476 rows written out, until the flame of 21-flame-temper-
//                           imbue-loot.md retires the skill's XP
//   hr_skill_xp_for_level() total XP to reach a level of a skill
//   hr_skill_level()        the level an XP total makes (one probe on each curve's (xp, level) index, 1046-settle-plans.sql)
// and a self-check that pins both functions to the JS values.
//
// hr_skill_curve's rows were tools/gen-catalogues.mjs's (the items catalogue) until this file: it keeps the table's DDL and
// grants and no longer writes its rows, so one generator owns every skill curve.
//
//   Regenerate:  node tools/gen-skill-curve.mjs
//   Verify:      node tools/gen-skill-curve.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-skill-curve.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a lever that is not a whole number over 0, a top under 200, a curve whose rows do not
// rise, a total past 2^53 inside the top, and an Inner Flame curve that is not the skill the data names.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 1069-skill-time-parity (lane/skills-time-parity, 2026-11-23): the first cut. A new curve after this file is applied is a new file
   (tools/new-migration.mjs <slug> --generated), this one history. */
export const OUT_NAME = '1069-skill-time-parity.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/* THE PINS (§0): md5 of each function's prosrc, carriage returns removed. PRE is the body this file was written against: hr_skill_level
   as 1046-settle-plans.sql left it (its post pin), hr_skill_xp_for_level as 2027-04-04-skills-from-server.sql left it. POST is this file's
   own (a second apply). 1046's §0 names POST as a known image of hr_skill_level, so a retry of 1046 after this file passes. */
const PRE = Object.freeze({ level: '45e3f51dbe83604aa92709d82f8e03e9', xpFor: '1e8dc175a96a4b63afdd3938502cc635' });
/* 1046-settle-plans.sql's splice (4) of hr_skill_level, verbatim: this file's body holds it, so a retry of 1046 finds its post text */
const PLAN_1046 = 'coalesce((select c.level from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0)) order by c.xp desc, c.level desc limit 1), 1)';

const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const whole = (v, min = 1) => Number.isSafeInteger(v) && v >= min;

/** The curves as rows, read through src/core/xp.js (the one walk), with the levers they come from. Throws on a malformed source. */
export function curvesOf({ CM, XP }) {
  const S = CM.SKILL_CURVE, H = CM.LEVEL_HOURS, V = CM.VITALS, F = CM.FLAME_SKILL_CURVE;
  for (const [k, v] of [['pacePm', S.pacePm], ['xpPerHealthHour', S.xpPerHealthHour], ['top', S.top]]) {
    if (!whole(v)) throw new Error('gen-skill-curve: SKILL_CURVE.' + k + ' ' + v + ' is not a whole number over 0');
  }
  if (S.top < 200) throw new Error('gen-skill-curve: SKILL_CURVE.top ' + S.top + ' is under 200: a far hero would meet the end of the curve');
  for (const [k, v, min] of [['ceiling', H.ceiling, 1], ['half', H.half, 1], ['early', H.early, 0]]) {
    if (!whole(v, min)) throw new Error('gen-skill-curve: LEVEL_HOURS.' + k + ' ' + v + ' is not a whole number');
  }
  if (!whole(V.hpBase) || !whole(V.hpPerLevel, 0)) throw new Error('gen-skill-curve: VITALS.hpBase / hpPerLevel are not whole numbers');
  if (!F || typeof F.skill !== 'string' || !/^[a-z_]{1,32}$/.test(F.skill)) throw new Error('gen-skill-curve: FLAME_SKILL_CURVE.skill names no skill');
  const time = [], flame = [];
  for (let lv = 1; lv <= S.top; lv++) time.push(XP.skillXpForLevel('melee', lv));
  for (let lv = 1; ; lv++) {
    const x = XP.skillXpForLevel(F.skill, lv);
    if (lv > 1 && x <= flame[flame.length - 1]) break;
    flame.push(x);
  }
  for (const [name, rows] of [['the time curve', time], ['Inner Flame\'s curve', flame]]) {
    if (rows[0] !== 0) throw new Error('gen-skill-curve: ' + name + ' does not start at 0 XP');
    for (let i = 1; i < rows.length; i++) {
      if (!Number.isInteger(rows[i]) || rows[i] <= rows[i - 1] || (i < rows.length - 1 && !Number.isSafeInteger(rows[i]))) throw new Error('gen-skill-curve: ' + name + ' does not rise in whole XP at level ' + (i + 1));
    }
  }
  if (time.length !== S.top) throw new Error('gen-skill-curve: the time curve stops at level ' + time.length + ', short of its top ' + S.top);
  return { S, H, V, F, time, flame };
}

/* the rows' fingerprint, as Postgres prints it: md5(string_agg(level || ':' || xp, ',' order by level)) */
const sumOf = (rows) => md5(rows.map((x, i) => (i + 1) + ':' + x).join(','));

/* The probe levels the self-check reads both functions at, on each curve: the ends, the old curve's last level, the milestones. */
function probes(top, flameTop) {
  const s = new Set([1, 2, 3, 10, 30, 60, 100, 200, 475, 476, 477, 1000, top - 1, top, top + 1, flameTop - 1, flameTop, flameTop + 1]);
  return [...s].filter((l) => l >= 1).sort((a, b) => a - b);
}

/** The SQL, from `curvesOf`'s answer and the walk (`XP`, for the probes' expected values). */
export function buildSql(C, XP) {
  const { S, H, V, F, time, flame } = C;
  const num = BigInt(S.pacePm) * BigInt(S.xpPerHealthHour) * BigInt(H.ceiling);
  const levels = probes(S.top, flame.length);
  const want = [];
  for (const skill of ['melee', 'defense', F.skill]) {
    for (const l of levels) {
      const x = XP.skillXpForLevel(skill, l);
      want.push(`('${skill}', ${l}, ${x}, ${XP.skillLevelFromXp(skill, x)}, ${XP.skillLevelFromXp(skill, x - 1)}, ${XP.skillLevelFromXp(skill, x + 1)})`);
    }
  }
  const flameValues = flame.map((x, i) => `  (${i + 1},${x})`).join(',\n');
  /* what a live hero's combat skill reads on the new rows: the old curve is Inner Flame's (the rows hr_skill_curve held) */
  const reads = (s) => s + ' reads ' + XP.skillLevelFromXp('melee', flame[s - 1]);
  let cross = 2;
  while (cross < flame.length && flame[cross - 1] < time[cross - 1]) cross++;
  const levelBody = `
  select case when not exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then public.hr_level_from_xp(p_xp)
              when p_skill = '${F.skill}'
              then coalesce((select c.level from public.hr_flame_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0)) order by c.xp desc, c.level desc limit 1), 1)
              else ${PLAN_1046} end
`;
  const xpForBody = `
  select case when not exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then public.hr_xp_for_level(p_level)
              when p_skill = '${F.skill}'
              then coalesce((select c.xp from public.hr_flame_skill_curve c where c.level = greatest(1, coalesce(p_level, 1))),
                            (select max(c.xp) from public.hr_flame_skill_curve c))
              else coalesce((select c.xp from public.hr_skill_curve c where c.level = greatest(1, coalesce(p_level, 1))),
                            (select max(c.xp) from public.hr_skill_curve c)) end
`;
  /* the plan-cache shape every curve function has held since 2027-02-10 (LANGUAGE plpgsql: a SQL copy is re-planned on every call on
     PostgreSQL 17, tests/settle-budget.mjs SB-3) */
  const wrap = (fn, args, ret, body) => `create or replace function public.${fn}(${args})
 returns ${ret}
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (${OUT_NAME}): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (
${body}  ) as hr_q(v) limit 1);
end
$plc$;`;
  const prosrc = (body) => `
-- PLAN-CACHE (${OUT_NAME}): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (
${body}  ) as hr_q(v) limit 1);
end
`;
  const POST = { level: md5(prosrc(levelBody)), xpFor: md5(prosrc(xpForBody)) };
  return { post: POST, sql: `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SKILL CURVES  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-skill-curve.mjs from src/data/core-model.js SKILL_CURVE, LEVEL_HOURS, VITALS and FLAME_SKILL_CURVE
--   through src/core/xp.js. Any hand edit FAILS \`node tools/gen-skill-curve.mjs --check\`.
--
-- STATUS: supabase/migration-notes/${OUT_NAME}.json (STAGED until the Coordinator applies it).
-- WHAT (lane/skills-time-parity, 2026-11-23; docs/design/redesign/04-math-strategy.md section 4, 27-formula-overhaul.md row P-3,
-- stage 7): THE COMBAT SKILLS ON THE LEVEL CLOCK. Melee, Ranged, Magic and Defense cost a set ratio of the hours a Level takes:
--   XP from skill level n to n + 1 = floor(${S.pacePm} x ${S.xpPerHealthHour} x ${H.ceiling} x n^2 x (${V.hpBase} + ${V.hpPerLevel} (n - 1)) / (1000 (n + ${H.half}) (n + ${H.early})))
-- (skillPace ${S.pacePm} permille x the hours Level n takes x ${S.xpPerHealthHour} skill XP a hunted hour a point of the reference health of
-- Level n), so a specialist's skill tracks its Level. hr_skill_curve: ${S.top} rows, computed here in exact numeric (div truncates, as
-- the browser's BigInt floors) and refused unless every row equals the browser's walk (an md5 of all of them). Skill 10 at
-- ${time[9]} XP, 60 at ${time[59]}, 100 at ${time[99]}, ${S.top} at ${time[S.top - 1]}; past ${S.top} a skill keeps its XP and reads ${S.top}.
-- INNER FLAME keeps the geometric curve every combat skill walked until now (15 x s^2 x 1.04^(s-1), ${flame.length} rows to 2^53, the
-- same rows hr_skill_curve held): its Hearth fuel's XP is sized on it (core-model.js FLAME_FUEL), and the flame of
-- 21-flame-temper-imbue-loot.md retires the skill's XP. Its rows move to hr_flame_skill_curve, read the same way (an (xp, level)
-- index, one probe: 1046-settle-plans.sql's rule).
-- LIVE CHARACTERS (CLAUDE.md §1: no save migration): a combat skill's XP is kept and its level is read on the new curve. A skill under
-- ${cross} reads LOWER (the old curve's first levels were far cheaper: ${[10, 30, 60].map(reads).join(', ')}), one over it higher (${reads(100)}).
-- Nothing is stored per level. Inner Flame reads what it read.
-- READERS: every caller of hr_skill_level / hr_skill_xp_for_level (the envelope's skill bars hr_skill_block, the yard's fee, a death's
-- skill loss 1063, rune and supply gates, the honor roll) follows with no edit.
-- ORDER: ${OUT_NAME.slice(0, 4)} in its name, after 1046-settle-plans.sql (whose splice (4) this body keeps verbatim, and whose §0 names this
-- file's image) and after every items catalogue that wrote hr_skill_curve's rows (1033, 1065: they no longer do).
-- EDGE: the hr-accrue deploy that carries src/core/xp.js and this file go out in one sitting, either order: between the two a combat
-- skill's level-up is read on two curves for minutes (a level event shows once more or once less; nothing is paid by it).
-- EXPLOIT SURFACE: none added. Catalogue rows (readable, as hr_skill_curve always was) and two internal functions, revoked from every
-- client role. No value moves: no XP is granted or taken, levels are read off the XP a hero holds.
-- No begin/commit (CLAUDE.md §2). Safe to re-run: rows rewritten whole, functions restated, a second apply is byte-identical.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_skill_curve') is null or to_regclass('public.hr_skills') is null
     or to_regprocedure('public.hr_level_from_xp(bigint)') is null or to_regprocedure('public.hr_xp_for_level(integer)') is null then
    raise exception 'PRECONDITION: the skill catalogue (hr_skill_curve, hr_skills) or the capped curve functions are missing'; end if;
  if not exists (select 1 from public.hr_skills where skill_id = '${F.skill}' and cat = 'combat') then
    raise exception 'PRECONDITION: % is not an uncapped skill in hr_skills', '${F.skill}'; end if;
  for v_r in select * from (values
    ('public.hr_skill_level(text,bigint)', '${PRE.level}', '${POST.level}'),
    ('public.hr_skill_xp_for_level(text,integer)', '${PRE.xpFor}', '${POST.xpFor}')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE ROWS ──────────────────────────────────────────────────────────────
create table if not exists public.hr_flame_skill_curve (
  level int    primary key check (level >= 1),
  xp    bigint not null check (xp >= 0)
);
create index if not exists hr_flame_skill_curve_xp_level_idx on public.hr_flame_skill_curve (xp, level);
create index if not exists hr_skill_curve_xp_level_idx on public.hr_skill_curve (xp, level);
alter table public.hr_flame_skill_curve enable row level security;
revoke all on public.hr_flame_skill_curve from public, anon, authenticated, service_role;
grant select on public.hr_flame_skill_curve to anon, authenticated, service_role;
drop policy if exists "hr_flame_skill_curve readable" on public.hr_flame_skill_curve;
create policy "hr_flame_skill_curve readable" on public.hr_flame_skill_curve for select using (true);

delete from public.hr_flame_skill_curve;
insert into public.hr_flame_skill_curve (level, xp) values
${flameValues};

delete from public.hr_skill_curve;
insert into public.hr_skill_curve (level, xp)
select n, coalesce(sum(step) over (order by n rows between unbounded preceding and 1 preceding), 0)::bigint
  from (select n, div(${num}::numeric * n * n * (${V.hpBase} + ${V.hpPerLevel} * (n - 1)), 1000::numeric * (n + ${H.half}) * (n + ${H.early}))::bigint as step
          from generate_series(1, ${S.top}) n) s;

-- ── §2 THE FUNCTIONS ─────────────────────────────────────────────────────────
${wrap('hr_skill_level', 'p_skill text, p_xp bigint', 'integer', levelBody)}
revoke execute on function public.hr_skill_level(text, bigint) from public, anon, authenticated, service_role;

${wrap('hr_skill_xp_for_level', 'p_skill text, p_level integer', 'bigint', xpForBody)}
revoke execute on function public.hr_skill_xp_for_level(text, integer) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- (a) each table is exactly the browser's walk: its row count and the md5 of every row
-- (b) both functions answer the browser's values on all three curves (Melee and Defense on the clock, Inner Flame on its own, a capped
--     skill on the 99 table) at the ends, the old curve's last level, the milestones and past each top, and read each boundary back
--     (x - 1, x, x + 1); a null or negative XP is level 1
-- (c) each curve is read by its (xp, level) index, one probe (1046's rule), and 1046's splice (4) text is still in the body
-- (d) no client role reaches either function
do $chk$
declare v_bad text; v_role text; v_plan text; v_line text; v_r record;
begin
  if (select count(*) from public.hr_skill_curve) <> ${S.top}
     or (select md5(string_agg(level || ':' || xp, ',' order by level)) from public.hr_skill_curve) <> '${sumOf(time)}' then
    raise exception 'skill-curve §3(a): hr_skill_curve is not the browser''s ${S.top}-row time curve'; end if;
  if (select count(*) from public.hr_flame_skill_curve) <> ${flame.length}
     or (select md5(string_agg(level || ':' || xp, ',' order by level)) from public.hr_flame_skill_curve) <> '${sumOf(flame)}' then
    raise exception 'skill-curve §3(a): hr_flame_skill_curve is not the browser''s ${flame.length}-row Inner Flame curve'; end if;
  select string_agg(w.s || ' ' || w.l, ', ') into v_bad
    from (values
  ${want.join(',\n  ')}) w(s, l, x, lv, below, above)
   where public.hr_skill_xp_for_level(w.s, w.l) <> w.x
      or public.hr_skill_level(w.s, w.x) <> w.lv
      or public.hr_skill_level(w.s, w.x - 1) <> w.below
      or public.hr_skill_level(w.s, w.x + 1) <> w.above;
  if v_bad is not null then raise exception 'skill-curve §3(b): the functions disagree with src/core/xp.js at %', v_bad; end if;
  if public.hr_skill_level('melee', null) <> 1 or public.hr_skill_level('melee', -5) <> 1 or public.hr_skill_xp_for_level('melee', null) <> 0
     or public.hr_skill_level('${F.skill}', null) <> 1 or public.hr_skill_level('mining', public.hr_xp_for_level(99) + 1000) <> 99
     or public.hr_skill_xp_for_level('mining', 10) <> public.hr_xp_for_level(10) then
    raise exception 'skill-curve §3(b): a null, negative or capped read is not what the browser reads'; end if;
  if strpos(pg_get_functiondef('public.hr_skill_level(text,bigint)'::regprocedure), '${PLAN_1046}') = 0
     or strpos(pg_get_functiondef('public.hr_skill_level(text,bigint)'::regprocedure), 'max(c.level)') > 0 then
    raise exception 'skill-curve §3(c): hr_skill_level no longer holds 1046''s one-probe read'; end if;
  begin
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_bitmapscan', 'off', true);
    for v_r in select * from (values
      ('hr_skill_curve_xp_level_idx', 'select c.level from public.hr_skill_curve c where c.xp <= 123456 order by c.xp desc, c.level desc limit 1'),
      ('hr_flame_skill_curve_xp_level_idx', 'select c.level from public.hr_flame_skill_curve c where c.xp <= 123456 order by c.xp desc, c.level desc limit 1')) t(idx, q) loop
      v_plan := '';
      for v_line in execute 'explain ' || v_r.q loop v_plan := v_plan || v_line || ' / '; end loop;
      if strpos(v_plan, v_r.idx) = 0 or v_plan ~ 'Sort' then raise exception 'skill-curve §3(c): % is not read: %', v_r.idx, v_plan; end if;
    end loop;
    raise exception using errcode = 'HRSC1', message = 'plans read - rolling back';
  exception when sqlstate 'HRSC1' then null;
  end;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_skill_level(text,bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_skill_xp_for_level(text,integer)', 'execute')
       or has_table_privilege(v_role, 'public.hr_flame_skill_curve', 'insert,update,delete') then
      raise exception 'skill-curve §3(d): % reaches a skill curve function or writes a curve', v_role; end if;
  end loop;
end $chk$;
` };
}

async function load(root) {
  const q = sourceQuery(root);
  return {
    CM: await import(pathToFileURL(join(root, 'src/data/core-model.js')).href + q),
    XP: await import(pathToFileURL(join(root, 'src/core/xp.js')).href + q),
  };
}

async function selftest() {
  const M = await load(ROOT);
  let bad = 0;
  const expectThrow = (name, fn) => { try { fn(); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  const withCM = (edit) => ({ CM: { ...M.CM, ...edit }, XP: M.XP });
  expectThrow('a fractional skillPace', () => curvesOf(withCM({ SKILL_CURVE: { ...M.CM.SKILL_CURVE, pacePm: 999.5 } })));
  expectThrow('a skill XP rate of 0', () => curvesOf(withCM({ SKILL_CURVE: { ...M.CM.SKILL_CURVE, xpPerHealthHour: 0 } })));
  expectThrow('a top under 200', () => curvesOf(withCM({ SKILL_CURVE: { ...M.CM.SKILL_CURVE, top: 150 } })));
  expectThrow('an hours lever of 0', () => curvesOf(withCM({ LEVEL_HOURS: { ...M.CM.LEVEL_HOURS, half: 0 } })));
  expectThrow('an Inner Flame curve naming no skill', () => curvesOf(withCM({ FLAME_SKILL_CURVE: { ...M.CM.FLAME_SKILL_CURVE, skill: 'Inner Flame!' } })));
  expectThrow('a walk that does not rise', () => curvesOf({ CM: M.CM, XP: { ...M.XP, skillXpForLevel: (k, l) => (k === 'melee' && l > 50 ? M.XP.skillXpForLevel(k, 50) : M.XP.skillXpForLevel(k, l)) } }));
  expectThrow('a walk past 2^53 inside the top', () => curvesOf({ CM: M.CM, XP: { ...M.XP, skillXpForLevel: (k, l) => (k === 'melee' && l > 900 ? 2 ** 54 + l : M.XP.skillXpForLevel(k, l)) } }));
  const C = curvesOf(M);
  const { sql, post } = buildSql(C, M.XP);
  /* the rows the SQL computes are the browser's: the md5 the self-check holds is the walk's, and the formula in the insert is the data's */
  if (!sql.includes(`'${sumOf(C.time)}'`) || !sql.includes(`div(${BigInt(C.S.pacePm) * BigInt(C.S.xpPerHealthHour) * BigInt(C.H.ceiling)}::numeric`)) { console.error('  MISSED  the time curve unpinned'); bad++; }
  else console.log('  caught  a time curve the self-check does not pin to the walk');
  /* the body keeps 1046's splice text (a retry of 1046 after this file skips its splice) and its own image is the one 1046's §0 names */
  const s1046 = await readFile(join(ROOT, 'supabase', 'migrations', '1046-settle-plans.sql'), 'utf8');
  if (!sql.includes(PLAN_1046) || !s1046.includes(post.level)) { console.error('  MISSED  1046 cannot be retried after this file'); bad++; }
  else console.log('  caught  a body 1046 cannot be retried over');
  /* both functions stay plpgsql (SB-3) and revoked from every client role */
  if ((sql.match(/ language plpgsql\n/g) || []).length !== 2 || !/revoke execute on function public\.hr_skill_level\(text, bigint\) from public, anon, authenticated, service_role/.test(sql)
      || !/revoke execute on function public\.hr_skill_xp_for_level\(text, integer\) from public, anon, authenticated, service_role/.test(sql)) { console.error('  MISSED  a curve function as SQL or client-reachable'); bad++; }
  else console.log('  caught  a curve function as SQL or client-reachable');
  if (bad) { console.error('gen-skill-curve --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-skill-curve --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const M = await load(ROOT);
  const wanted = buildSql(curvesOf(M), M.XP).sql;
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) {
      console.error('gen-skill-curve --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-skill-curve.mjs');
      process.exit(1);
    }
    console.log('gen-skill-curve --check: ' + OUT_NAME + ' matches src/data/core-model.js SKILL_CURVE and FLAME_SKILL_CURVE');
    return;
  }
  if (process.argv.includes('--post')) { console.log(JSON.stringify(buildSql(curvesOf(M), M.XP).post)); return; }
  await writeFile(OUT, wanted);
  console.log('gen-skill-curve: wrote ' + OUT_NAME);
}

if (isMain(import.meta.url)) main();
