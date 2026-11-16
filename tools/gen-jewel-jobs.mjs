#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-jewel-jobs.mjs — GENERATE THE SERVER'S COPY OF CRAFTED JEWELRY'S ROLLED JOBS AND THEIR ODDS (src/data/jewelry.js).
//
// The bench rolls in the engine (src/core/artisan.js rollJewel, in the hr-accrue bundle), which reads src/data/jewelry.js itself.
// The odds a player SEES before the roll come from Postgres (the `jewel_jobs` section, 2027-04-24-jewel-guarantees.sql), so the
// window shows what the server holds, never the browser's copy of a table. That section reads two tables emitted here:
//   hr_jewel_jobs   one row per rolled Crafting job: the piece, the roll kind, a guaranteed perk, the perks still rolled, every id
//                   it can make, and the switch it sits behind (null: open to everyone).
//   hr_jewel_odds   per roll kind and Crafting level 1..99, the chance per 10,000 of Fine and of Hallmarked, as rollOdds reads it:
//                   the engine's own numbers, level by level, so SQL never interpolates a second copy of the table.
// Each is a full delete + insert. A row moves no value.
//
//   Regenerate:  node tools/gen-jewel-jobs.mjs
//   Verify:      node tools/gen-jewel-jobs.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-jewel-jobs.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a job whose outcome is not one of its piece's rows, a guarantee the outcome lacks, a seal job
// that can come out Fine, odds outside 0..10,000 or summing past it, a gem or seal kind that can come out plain, an unknown switch.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { JEWELRY_RECIPES, JEWELRY_ITEMS, JEWEL_SKILL, JEWEL_SWITCH, ROLL_ODDS, ODDS_SCALE, rollOdds, jobRolls } from '../src/data/jewelry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a new number moves OUT_FILE to a forward file, like every generated catalogue. */
export const OUT_FILE = '2027-04-24-jewel-jobs-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const ID = /^[a-z0-9_]{1,64}$/;
const SWITCHES = new Set([JEWEL_SWITCH]);

/** The job rows the section serves, from the recipe rows. */
export function jobsOf(recipes = JEWELRY_RECIPES) {
  return recipes.filter((r) => r.roll).map((r) => ({
    recipe: r.id, piece: r.output, kind: r.roll, perk: r.perk || null, rolls: jobRolls(r), outcomes: r.outcomes.slice(), switch: r.switch || null,
  }));
}

/** Every (kind, level 1..99) row of the odds. */
export function oddsOf() {
  const out = [];
  for (const kind of Object.keys(ROLL_ODDS)) for (let lv = 1; lv <= 99; lv++) { const o = rollOdds(kind, lv); out.push({ kind, level: lv, fine: o.fine, hallmarked: o.hallmarked }); }
  return out;
}

/** What is wrong with the rows, as sentences. */
export function problemsOf(jobs, odds) {
  const out = [];
  const seen = new Set();
  for (const j of jobs) {
    if (seen.has(j.recipe)) out.push(`${j.recipe}: listed twice`);
    seen.add(j.recipe);
    if (!ID.test(j.recipe) || !ID.test(j.piece)) { out.push(`${j.recipe}: an id is not a catalogue id`); continue; }
    if (!ROLL_ODDS[j.kind]) out.push(`${j.recipe}: no odds for the kind ${j.kind}`);
    if (j.switch !== null && !SWITCHES.has(j.switch)) out.push(`${j.recipe}: ${j.switch} is not a switch this catalogue knows`);
    if (!j.outcomes.length) out.push(`${j.recipe}: makes nothing`);
    for (const id of j.outcomes) {
      const it = JEWELRY_ITEMS[id];
      if (id === j.piece) { if (j.kind !== 'base') out.push(`${j.recipe}: a ${j.kind} roll can make the plain piece`); continue; }
      if (!it || it.jewelBase !== j.piece) { out.push(`${j.recipe}: ${id} is not one of ${j.piece}'s rows`); continue; }
      if (j.perk && !(j.perk in it.jewelPerks)) out.push(`${j.recipe}: ${id} lacks the guaranteed ${j.perk}`);
      if (j.kind === 'seal' && it.jewelGrade !== 'hallmarked') out.push(`${j.recipe}: a seal job can make the ${it.jewelGrade} ${id}`);
    }
    if (j.perk && j.rolls.includes(j.perk)) out.push(`${j.recipe}: rolls its own guaranteed ${j.perk}`);
  }
  const key = new Set();
  for (const o of odds) {
    const k = o.kind + '@' + o.level;
    if (key.has(k)) out.push(`odds ${k}: listed twice`);
    key.add(k);
    if (![o.fine, o.hallmarked].every((n) => Number.isInteger(n) && n >= 0 && n <= ODDS_SCALE) || o.fine + o.hallmarked > ODDS_SCALE) out.push(`odds ${k}: ${o.fine} + ${o.hallmarked} is not a chance per ${ODDS_SCALE}`);
    if (o.kind !== 'base' && o.fine + o.hallmarked !== ODDS_SCALE) out.push(`odds ${k}: a ${o.kind} roll can come out plain`);
  }
  for (const kind of Object.keys(ROLL_ODDS)) for (let lv = 1; lv <= 99; lv++) if (!key.has(kind + '@' + lv)) out.push(`odds ${kind}@${lv}: missing`);
  return out;
}

const lit = (s) => (s === null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");
const arr = (xs) => (xs.length ? 'array[' + xs.map(lit).join(', ') + ']::text[]' : "'{}'::text[]");

export function build(jobs = jobsOf(), odds = oddsOf()) {
  const problems = problemsOf(jobs, odds);
  if (problems.length) throw new Error('gen-jewel-jobs: ' + problems.join('; '));
  const rows = [...jobs].sort((a, b) => (a.recipe < b.recipe ? -1 : 1))
    .map((j) => `  (${lit(j.recipe)}, ${lit(j.piece)}, ${lit(j.kind)}, ${lit(j.perk)}, ${arr(j.rolls)}, ${arr(j.outcomes)}, ${lit(j.switch)}, ${lit(JEWEL_SKILL)})`);
  const od = odds.map((o) => `  (${lit(o.kind)}, ${o.level}, ${o.fine}, ${o.hallmarked})`);
  const switched = jobs.filter((j) => j.switch).length;
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — CRAFTED JEWELRY'S ROLLED JOBS AND THEIR ODDS, AS THE SERVER SHOWS THEM BEFORE A ROLL.
-- Generated by tools/gen-jewel-jobs.mjs from src/data/jewelry.js. Any hand edit FAILS \`node tools/gen-jewel-jobs.mjs --check\`.
--   hr_jewel_jobs   one row per rolled Crafting job: piece, roll kind, guaranteed perk, the perks still rolled, every id it makes, its switch.
--   hr_jewel_odds   per roll kind and Crafting level 1..99: the chance per 10,000 of Fine and of Hallmarked (the rest is plain), level by
--                   level from the engine's own rollOdds, so SQL holds no second formula.
-- The roll itself is the engine's (src/core/artisan.js rollJewel, hr-accrue): nothing here rolls or moves value. The section that reads
-- these is 2027-04-24-jewel-guarantees.sql. RLS on, no policy, no client grant. No begin/commit.
-- APPLY ORDER: after 2027-03-14-jewelry-catalogue.generated.sql and the items catalogue that holds every row named; before
--   2027-04-24-jewel-guarantees.sql.
-- REVERSIBLE: drop the two tables with the section that reads them.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_jewel_jobs (
  recipe_id text primary key check (recipe_id ~ '^[a-z0-9_]{1,64}$'),
  piece     text not null check (piece ~ '^[a-z0-9_]{1,48}$'),
  kind      text not null check (kind ~ '^[a-z]{1,16}$'),
  perk      text check (perk is null or perk ~ '^[a-z_]{1,24}$'),
  rolls     text[] not null,
  outcomes  text[] not null check (cardinality(outcomes) between 1 and 64),
  switch_id text check (switch_id is null or switch_id ~ '^[a-z0-9_]{1,64}$'),
  skill     text not null
);
alter table public.hr_jewel_jobs enable row level security;
revoke all on table public.hr_jewel_jobs from public, anon, authenticated, service_role;
comment on table public.hr_jewel_jobs is
  '${OUT_FILE}: crafted jewelry''s rolled jobs (src/data/jewelry.js JEWELRY_RECIPES): what each can make, its guarantee, its switch. Read only by SECURITY DEFINER bodies.';

create table if not exists public.hr_jewel_odds (
  kind       text not null check (kind ~ '^[a-z]{1,16}$'),
  level      int  not null check (level between 1 and 99),
  fine       int  not null check (fine between 0 and 10000),
  hallmarked int  not null check (hallmarked between 0 and 10000),
  primary key (kind, level),
  check (fine + hallmarked <= 10000)
);
alter table public.hr_jewel_odds enable row level security;
revoke all on table public.hr_jewel_odds from public, anon, authenticated, service_role;
comment on table public.hr_jewel_odds is
  '${OUT_FILE}: a jewel roll''s odds per kind and Crafting level, per 10,000 (src/data/jewelry.js rollOdds, level by level). Read only by SECURITY DEFINER bodies.';

delete from public.hr_jewel_jobs;
insert into public.hr_jewel_jobs (recipe_id, piece, kind, perk, rolls, outcomes, switch_id, skill) values
${rows.join(',\n')};

delete from public.hr_jewel_odds;
insert into public.hr_jewel_odds (kind, level, fine, hallmarked) values
${od.join(',\n')};

-- §4 SELF-CHECK: the counts are the generator's, every id is a catalogue item or activity, every kind has its 99 levels, and no client
-- can read or write a table.
do $$
declare v text;
begin
  if (select count(*) from public.hr_jewel_jobs) <> ${jobs.length} then raise exception 'jewel-jobs §4: hr_jewel_jobs is not the generator''s ${jobs.length} rows'; end if;
  if (select count(*) from public.hr_jewel_jobs where switch_id is not null) <> ${switched} then raise exception 'jewel-jobs §4: not ${switched} switched jobs'; end if;
  if (select count(*) from public.hr_jewel_odds) <> ${odds.length} then raise exception 'jewel-jobs §4: hr_jewel_odds is not the generator''s ${odds.length} rows'; end if;
  select j.recipe_id into v from public.hr_jewel_jobs j
   where not exists (select 1 from public.hr_items i where i.item_id = j.piece)
      or exists (select 1 from unnest(j.outcomes) o where not exists (select 1 from public.hr_items i where i.item_id = o))
      or not exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = j.recipe_id)
      or not exists (select 1 from public.hr_skills s where s.skill_id = j.skill)
      or (select count(*) from public.hr_jewel_odds o where o.kind = j.kind) <> 99 limit 1;
  if v is not null then raise exception 'jewel-jobs §4: % names an item, activity, skill or roll kind the catalogue does not hold', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_jewel_jobs', 'hr_jewel_odds')) then
    raise exception 'jewel-jobs §4: a policy opens a table to a client'; end if;
  select t into v from unnest(array['public.hr_jewel_jobs', 'public.hr_jewel_odds']) t
   where has_table_privilege('authenticated', t, 'select,insert,update,delete') or has_table_privilege('anon', t, 'select,insert,update,delete') limit 1;
  if v is not null then raise exception 'jewel-jobs §4: a client role holds a grant on %', v; end if;
  raise notice 'jewel-jobs OK: ${jobs.length} rolled jobs (${switched} behind a switch), ${odds.length} odds rows';
end $$;
`;
}

function selftest() {
  const jobs = jobsOf(), odds = oddsOf();
  const clean = problemsOf(jobs, odds);
  if (clean.length) { console.error('gen-jewel-jobs --selftest: the tree is not clean: ' + clean.join('; ')); process.exit(2); }
  const g = jobs.find((j) => j.perk && j.kind === 'gem'), s = jobs.find((j) => j.kind === 'seal'), b = jobs.find((j) => j.kind === 'base');
  const one = (job, patch) => jobs.map((j) => (j === job ? Object.assign({}, j, patch) : j));
  const lacking = Object.keys(JEWELRY_ITEMS).find((id) => JEWELRY_ITEMS[id].jewelBase === g.piece && !(g.perk in JEWELRY_ITEMS[id].jewelPerks));
  const fineRow = Object.keys(JEWELRY_ITEMS).find((id) => JEWELRY_ITEMS[id].jewelBase === s.piece && JEWELRY_ITEMS[id].jewelGrade === 'fine');
  const cases = [
    ['a guarantee job that can make a row without its perk', one(g, { outcomes: g.outcomes.concat([lacking]) }), odds],
    ['a seal job that can make a Fine row', one(s, { outcomes: s.outcomes.concat([fineRow]) }), odds],
    ['a gem job that can make the plain piece', one(g, { outcomes: g.outcomes.concat([g.piece]) }), odds],
    ['a job that makes another piece\'s row', one(b, { outcomes: b.outcomes.concat(['ruby_signet']) }), odds],
    ['a job behind an unknown switch', one(g, { switch: 'nobody_knows' }), odds],
    ['a job that rolls its own guarantee', one(g, { rolls: g.rolls.concat([g.perk]) }), odds],
    ['a job listed twice', jobs.concat([g]), odds],
    ['a gem roll that can come out plain', jobs, odds.map((o) => (o.kind === 'gem' && o.level === 40 ? Object.assign({}, o, { fine: o.fine - 1 }) : o))],
    ['odds past 10,000', jobs, odds.map((o) => (o.kind === 'base' && o.level === 40 ? Object.assign({}, o, { fine: 10000 }) : o))],
    ['a missing level', jobs, odds.filter((o) => !(o.kind === 'seal' && o.level === 7))],
  ];
  let bad = 0;
  for (const [why, j, o] of cases) {
    if (problemsOf(j, o).length) console.log('  ✓ ' + why + ': refused');
    else { console.error('  ✗ ' + why + ': NOT refused'); bad++; }
  }
  if (bad) { console.error(`gen-jewel-jobs --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-jewel-jobs --selftest: every refusal bites');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-jewel-jobs --check: ${OUT_FILE} is stale; run node tools/gen-jewel-jobs.mjs`); process.exit(1); }
    console.log('gen-jewel-jobs --check: OK');
  } else {
    await writeFile(OUT, build());
    console.log('wrote ' + OUT);
  }
}
