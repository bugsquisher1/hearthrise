#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-training.mjs — GENERATE THE SERVER'S TRAINING-YARD CATALOGUE (lane/c-training-yard; Tyler 2026-11-08 "training dummies and
// stuff to train skills (for gold)"; the designer's rules, PRIORITY_BOARD "2026-11-10 Combat training").
//
// src/data/training.js is the one source. The server never types a number of it:
//   hr_training_rule    ONE row: the two rates a Level an hour (skill XP, gold), the Level it opens at, the "Stop after" slider, the
//                       "Keep at least" ceiling, and the server's settle cadence and fuses (TRAINING.server)
//   hr_training_skills  a row per skill the yard trains (each a `combat` skill of src/data/skills.js; Inner Flame is the Hearth's)
// supabase/migrations/2027-04-06-training-yard.sql reads them; tests/training-yard.mjs TY-CAT holds the rows to the data digit for digit;
// --check is the CI half.
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new dated file (OUT_NAME).
//
//   node tools/gen-training.mjs            write OUT_NAME
//   node tools/gen-training.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-training.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a rate that is not a whole positive number; an XP rate under the fee (gold would buy less than
// 1 XP); a Level gate under 1; a skill that is not a combat skill, Inner Flame, or a repeat; a "Stop after" slider that is not whole
// hours inside 1..24 (the design) or empty; a "Keep at least" ceiling outside 1..10^12; a settle cadence the sweep can't honour (the
// owner's floor over the flush, a flush over an hour, a settle cap under one hour or a day fuse under the 24 h the clock allows).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2027-04-06-training-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const whole = (n) => Number.isInteger(n) && n >= 1;

/** The rows the server holds, from the data (D: { T: TRAINING, SKILLS_DEF }). */
export function catalogueOf(D) {
  const T = D.T;
  const at = 'gen-training: ';
  if (!whole(T.xpPerLevelPerHour) || !whole(T.feePerLevelPerHour)) throw new Error(at + 'the rates ' + T.xpPerLevelPerHour + ' / ' + T.feePerLevelPerHour + ' are not whole and positive');
  if (T.xpPerLevelPerHour < T.feePerLevelPerHour) throw new Error(at + 'a gold buys less than one skill XP (' + T.xpPerLevelPerHour + ' XP against ' + T.feePerLevelPerHour + ' g)');
  if (!whole(T.minLevel)) throw new Error(at + 'minLevel ' + T.minLevel);
  const skills = Array.isArray(T.skills) ? T.skills.slice() : [];
  if (!skills.length) throw new Error(at + 'no skill to train');
  if (new Set(skills).size !== skills.length) throw new Error(at + 'a skill is listed twice');
  for (const s of skills) {
    const def = D.SKILLS_DEF[s];
    if (!def || def.cat !== 'combat') throw new Error(at + s + ' is not a combat skill');
    if (s === 'inner_flame') throw new Error(at + 'Inner Flame is trained at the Hearth, never at the yard');
  }
  const h = T.stopAfterHours || {};
  if (!whole(h.min) || !whole(h.max) || h.min > h.max || h.max > 24) throw new Error(at + 'the "Stop after" slider ' + h.min + '-' + h.max + ' h is not whole hours inside 1-24');
  if (!whole(T.keepGoldMax) || T.keepGoldMax > 1e12) throw new Error(at + 'keepGoldMax ' + T.keepGoldMax);
  const S = T.server || {};
  for (const k of ['ownerMinSeconds', 'flushSeconds', 'maxSettleHours', 'dayFuseHours', 'sweepBatch']) if (!whole(S[k])) throw new Error(at + 'server.' + k + ' ' + S[k]);
  if (S.ownerMinSeconds > S.flushSeconds) throw new Error(at + 'the owner\'s floor (' + S.ownerMinSeconds + ' s) is over the flush (' + S.flushSeconds + ' s)');
  if (S.flushSeconds > 3600) throw new Error(at + 'a flush of ' + S.flushSeconds + ' s leaves a closed browser\'s run unpaid for over an hour');
  if (S.dayFuseHours < 24) throw new Error(at + 'a day fuse of ' + S.dayFuseHours + ' h is under the 24 h the clock allows: an honest run would be held');
  if (S.maxSettleHours > S.dayFuseHours) throw new Error(at + 'one settle (' + S.maxSettleHours + ' h) could pay past the day fuse (' + S.dayFuseHours + ' h)');
  if (S.sweepBatch > 5000) throw new Error(at + 'a sweep of ' + S.sweepBatch + ' heroes holds its locks too long');
  return {
    rule: { xp: T.xpPerLevelPerHour, fee: T.feePerLevelPerHour, minLevel: T.minLevel, stopMin: h.min, stopMax: h.max, keepMax: T.keepGoldMax,
      ownerMinMs: S.ownerMinSeconds * 1000, flushMs: S.flushSeconds * 1000, settleMaxMs: S.maxSettleHours * 3600000, dayFuseH: S.dayFuseHours, batch: S.sweepBatch },
    skills: skills.slice().sort(),
  };
}

/** The SQL for the catalogue `c` (catalogueOf). */
export function buildSql(c) {
  const r = c.rule;
  const skillValues = c.skills.map((s) => `  ('${s}')`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE TRAINING YARD'S CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-training.mjs from src/data/training.js (TRAINING) and src/data/skills.js (SKILLS_DEF).
--   Any hand edit FAILS \`node tools/gen-training.mjs --check\` and tests/training-yard.mjs TY-CAT.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-training-yard, backend-architect, 2026-11-10). The Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit). ON THE EA SECURITY LIST with 2027-04-06-training-yard.sql: it prices a gold sink that writes
-- skill XP, which the skill boards rank.
-- WHAT: two server-only catalogues, each rewritten whole. hr_training_rule (one row: ${r.xp} skill XP and ${r.fee} gold a Level an hour, from
-- Level ${r.minLevel}, "Stop after" ${r.stopMin}-${r.stopMax} h, "Keep at least" up to ${r.keepMax} gold; the settle cadence: an owner's settle every
-- ${r.ownerMinMs / 1000} s at most, the sweep's flush ${r.flushMs / 1000} s, ${r.settleMaxMs / 3600000} h a settle at most, a ${r.dayFuseH} h fuse in any 24 h, ${r.batch} heroes a sweep);
-- hr_training_skills (${c.skills.length} rows: ${c.skills.join(', ')}). No function, grant or client verb here: 2027-04-06-training-yard.sql reads them.
-- ORDER: before 2027-04-06-training-yard.sql (its §0 refuses an absent rule row); after hr_skills (gen-catalogues).
-- Idempotent: the tables are made if absent and every row rewritten whole, so a second apply is byte-identical. No begin/commit.
-- REVERSIBLE: drop the two tables (2027-04-06-training-yard.sql first: it reads them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_skills') is null then
    raise exception 'PRECONDITION: the skill catalogue (hr_skills) first'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_training_rule (
  id              boolean primary key default true check (id),
  xp_per_level_h  int    not null check (xp_per_level_h >= 1),
  fee_per_level_h int    not null check (fee_per_level_h >= 1 and fee_per_level_h <= xp_per_level_h),
  min_level       int    not null check (min_level >= 1),
  stop_min_h      int    not null check (stop_min_h >= 1),
  stop_max_h      int    not null check (stop_max_h >= stop_min_h and stop_max_h <= 24),
  keep_max        bigint not null check (keep_max >= 1 and keep_max <= 1000000000000),
  owner_min_ms    int    not null check (owner_min_ms >= 1000),
  flush_ms        int    not null check (flush_ms >= owner_min_ms and flush_ms <= 3600000),
  settle_max_ms   bigint not null check (settle_max_ms >= 3600000),
  day_fuse_h      int    not null check (day_fuse_h >= 24 and day_fuse_h::bigint * 3600000 >= settle_max_ms),
  sweep_batch     int    not null check (sweep_batch between 1 and 5000)
);
create table if not exists public.hr_training_skills (
  skill_id text primary key check (skill_id ~ '^[a-z0-9_]{1,64}$' and skill_id <> 'inner_flame')
);
alter table public.hr_training_rule enable row level security;
alter table public.hr_training_skills enable row level security;
revoke all on public.hr_training_rule from public, anon, authenticated, service_role;
revoke all on public.hr_training_skills from public, anon, authenticated, service_role;
comment on table public.hr_training_rule is
  '${OUT_NAME}: the training yard''s one rule row (src/data/training.js TRAINING through tools/gen-training.mjs): skill XP and gold a Level an hour, the Level gate, the two settings'' bounds and the server''s settle cadence. Server-only.';
comment on table public.hr_training_skills is
  '${OUT_NAME}: the skills the training yard trains (src/data/training.js TRAINING.skills, each a combat skill of hr_skills). Server-only. No row = not trainable.';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_training_rule;
insert into public.hr_training_rule (id, xp_per_level_h, fee_per_level_h, min_level, stop_min_h, stop_max_h, keep_max,
                                     owner_min_ms, flush_ms, settle_max_ms, day_fuse_h, sweep_batch) values
  (true, ${r.xp}, ${r.fee}, ${r.minLevel}, ${r.stopMin}, ${r.stopMax}, ${r.keepMax}, ${r.ownerMinMs}, ${r.flushMs}, ${r.settleMaxMs}, ${r.dayFuseH}, ${r.batch});
delete from public.hr_training_skills;
insert into public.hr_training_skills (skill_id) values
${skillValues};

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rule is the data's, one row; every skill is a combat skill hr_skills holds and the set is exactly the generated one; no client
-- reaches either table.
do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_training_rule) <> 1
     or not exists (select 1 from public.hr_training_rule where xp_per_level_h = ${r.xp} and fee_per_level_h = ${r.fee} and min_level = ${r.minLevel}
                      and stop_min_h = ${r.stopMin} and stop_max_h = ${r.stopMax} and keep_max = ${r.keepMax} and owner_min_ms = ${r.ownerMinMs}
                      and flush_ms = ${r.flushMs} and settle_max_ms = ${r.settleMaxMs} and day_fuse_h = ${r.dayFuseH} and sweep_batch = ${r.batch}) then
    raise exception 'training-catalogue: hr_training_rule is not the generated row'; end if;
  if (select count(*) from public.hr_training_skills) <> ${c.skills.length}
     or (select string_agg(skill_id, ',' order by skill_id) from public.hr_training_skills) <> '${c.skills.join(',')}'
     or exists (select 1 from public.hr_training_skills t
                 where not exists (select 1 from public.hr_skills k where k.skill_id = t.skill_id and k.cat = 'combat')) then
    raise exception 'training-catalogue: hr_training_skills is not the generated set of combat skills'; end if;
  foreach v_t in array array['hr_training_rule', 'hr_training_skills'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, ('public.' || v_t)::regclass, 'select,insert,update,delete') then
        raise exception 'training-catalogue: % reaches %', v_role, v_t; end if;
    end loop;
  end loop;
end $$;
`;
}

export async function loadData(root = ROOT) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { TRAINING } = await import(u('src/data/training.js'));
  const { SKILLS_DEF } = await import(u('src/data/skills.js'));
  return { T: TRAINING, SKILLS_DEF };
}

const said = (c) => c.rule.xp + ' XP and ' + c.rule.fee + ' g a Level an hour from Level ' + c.rule.minLevel + ', ' + c.skills.join('/')
  + ', stop after ' + c.rule.stopMin + '-' + c.rule.stopMax + ' h, flush ' + c.rule.flushMs / 1000 + ' s';

async function selftest() {
  const D = await loadData(ROOT);
  let bad = 0;
  const T = D.T;
  const plant = (patch) => ({ ...D, T: { ...T, ...patch } });
  const expectThrow = (name, Dx) => { try { catalogueOf(Dx); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  expectThrow('a fractional XP rate', plant({ xpPerLevelPerHour: 400.5 }));
  expectThrow('a free hour', plant({ feePerLevelPerHour: 0 }));
  expectThrow('a gold that buys under 1 XP', plant({ xpPerLevelPerHour: 40 }));
  expectThrow('a yard open at Level 0', plant({ minLevel: 0 }));
  expectThrow('Inner Flame at the yard', plant({ skills: [...T.skills, 'inner_flame'] }));
  expectThrow('a gathering skill at the yard', plant({ skills: [...T.skills, 'mining'] }));
  expectThrow('a skill listed twice', plant({ skills: [...T.skills, T.skills[0]] }));
  expectThrow('no skill', plant({ skills: [] }));
  expectThrow('a "Stop after" past a day', plant({ stopAfterHours: { min: 1, max: 48 } }));
  expectThrow('a "Stop after" of half hours', plant({ stopAfterHours: { min: 0.5, max: 24 } }));
  expectThrow('a "Keep at least" ceiling of 0', plant({ keepGoldMax: 0 }));
  expectThrow('an owner floor over the flush', plant({ server: { ...T.server, ownerMinSeconds: T.server.flushSeconds + 1 } }));
  expectThrow('a flush over an hour', plant({ server: { ...T.server, flushSeconds: 3601 } }));
  expectThrow('a day fuse under the clock', plant({ server: { ...T.server, dayFuseHours: 23 } }));
  expectThrow('one settle past the day fuse', plant({ server: { ...T.server, maxSettleHours: T.server.dayFuseHours + 1 } }));
  const c = catalogueOf(D);
  const sql = buildSql(c);
  const rows = [...sql.matchAll(/^ {2}\('([a-z_]+)'\)/gm)].map((m) => m[1]);
  if (rows.join(',') !== c.skills.join(',')) { console.error('  MISSED  the skill rows read back as ' + rows.join(',')); bad++; }
  else console.log('  caught  a skill row the catalogue guard would read twice');
  if (bad) { console.error('gen-training --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-training --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const c = catalogueOf(await loadData(ROOT));
  const wanted = buildSql(c);
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) { console.error('gen-training --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-training.mjs'); process.exit(1); }
    console.log('gen-training --check: ' + OUT_NAME + ' matches src/data/training.js (' + said(c) + ')');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-training: wrote ' + OUT_NAME + ' (' + said(c) + ')');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
