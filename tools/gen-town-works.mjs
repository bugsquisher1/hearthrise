#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-town-works.mjs — GENERATE THE TOWN WORKS' SERVER CATALOGUE.
//
// src/data/town-works.js is the single source of what a project asks for; Postgres must know it to do what only it may: refuse a gift under its lock, on its own clock.
// Emitted as hr_town_works, one row per project, upserted: 2027-03-04-town-works.sql's tables point at it, and a catalogue change never touches what was given.
//
//   Regenerate:  node tools/gen-town-works.mjs
//   Verify:      node tools/gen-town-works.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-town-works.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): no project; a bad id or map; a minimum, a day's cap or a bucket that isn't a whole positive number; a day's cap under the minimum;
// stages that don't start at 0 or don't climb; a stage after the first with no line, or a first stage with one; two stages sharing art; a line that makes no sentence; a
// name that doesn't fit a chat row's name; art the world's art registry doesn't hold; a gift the buttons offer that the rules would refuse.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { TOWN_WORKS } from '../src/data/town-works.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a new number moves OUT_FILE to a forward file, like every generated catalogue. */
export const OUT_FILE = '2027-03-04-town-works-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const ID = /^[a-z0-9_]{1,32}$/;
const whole = (v, min) => Number.isInteger(v) && v >= min && v <= 1000000000;

/** What is wrong with the rows, as sentences. Pure. `sprites` is the art that exists, or null when the caller doesn't check it. */
export function problemsOf(rows, sprites = null) {
  const out = [];
  const ids = Object.keys(rows);
  if (!ids.length) out.push('no project');
  for (const id of ids) {
    const r = rows[id];
    if (!ID.test(id)) out.push(`${id} is not a project id`);
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 24) out.push(`${id}: its name doesn't fit a chat row (24 letters)`);
    if (typeof r.map !== 'string' || !/^[a-z0-9_]{1,40}$/.test(r.map)) out.push(`${id}: ${r.map} is not a map id`);
    if (!whole(r.minGift, 1)) out.push(`${id}: minGift ${r.minGift} is not whole`);
    if (!whole(r.perDay, 1)) out.push(`${id}: perDay ${r.perDay} is not whole`);
    if (whole(r.minGift, 1) && whole(r.perDay, 1) && r.perDay < r.minGift) out.push(`${id}: the day's cap is under the smallest gift`);
    if (!whole(r.perMinute, 1)) out.push(`${id}: perMinute ${r.perMinute} is not whole`);
    if (!whole(r.plaqueTop, 1) || r.plaqueTop > 100) out.push(`${id}: plaqueTop ${r.plaqueTop} is not 1 to 100`);
    const st = r.stages || [];
    if (st.length < 2) out.push(`${id}: a project needs a start and a finish`);
    st.forEach((s, i) => {
      if (i === 0 && s.at !== 0) out.push(`${id}: the first stage starts at ${s.at}, not 0`);
      if (i && !(whole(s.at, 1) && s.at > st[i - 1].at)) out.push(`${id}: the stages must climb, and ${s.at} follows ${st[i - 1].at}`);
      if (i === 0 && s.line) out.push(`${id}: nothing crosses the first stage, so it can't have a line`);
      if (i && (typeof s.line !== 'string' || !/^[a-z][a-z' ]+\.$/.test(s.line))) out.push(`${id}: stage ${i}'s line "${s.line}" doesn't finish a sentence`);
      if (typeof s.art !== 'string' || !s.art) out.push(`${id}: stage ${i} has no art`);
      else if (sprites && !sprites.has(s.art)) out.push(`${id}: stage ${i}'s art ${s.art} is not in the world's art`);
      if (typeof s.label !== 'string' || !s.label) out.push(`${id}: stage ${i} has no label`);
    });
    if (new Set(st.map((s) => s.art)).size !== st.length) out.push(`${id}: two stages share art`);
    for (const g of r.gifts || []) if (!whole(g, r.minGift || 1) || g > r.perDay) out.push(`${id}: the button ${g} is a gift the rules refuse`);
  }
  return out;
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

export function build(rows = TOWN_WORKS) {
  const problems = problemsOf(rows);
  if (problems.length) throw new Error('gen-town-works: ' + problems.join('; '));
  const ids = Object.keys(rows);
  const values = ids.map((id, i) => {
    const r = rows[id];
    return `  (${lit(id)}, ${lit(r.map)}, ${i + 1}, ${lit(r.name)}, ${r.minGift}, ${r.perDay}, ${r.perMinute}, ${r.plaqueTop}, array[${r.stages.map((s) => s.at).join(', ')}]::bigint[], array[${r.stages.map((s) => (s.line ? lit(s.line) : 'null')).join(', ')}]::text[])`;
  });
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — WHAT THE WHOLE SERVER IS BUILDING TOGETHER: THE PROJECTS.
-- Generated by tools/gen-town-works.mjs from src/data/town-works.js.
--   Any hand edit FAILS \`node tools/gen-town-works.mjs --check\`.
-- A row moves no value: hr_town_works_give refuses from it under its lock. Upserted, so a catalogue change never touches what was given; a project with gifts can't be deleted.
-- RLS on, no policy, no client grant: a client reads a project through hr_town_works_view. No begin/commit.
-- REVERSIBLE: drop the table with the verb that reads it. ON THE EA SECURITY LIST.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_town_works (
  project_id  text primary key check (project_id ~ '^[a-z0-9_]{1,32}$'),
  map_id      text not null check (map_id ~ '^[a-z0-9_]{1,40}$'),
  ord         int not null unique check (ord >= 1),
  name        text not null check (length(name) between 1 and 24),
  min_gift    bigint not null check (min_gift >= 1),
  per_day     bigint not null check (per_day >= min_gift),
  per_minute  int not null check (per_minute >= 1),
  plaque_top  int not null check (plaque_top between 1 and 100),
  stage_at    bigint[] not null check (cardinality(stage_at) >= 2 and stage_at[1] = 0),
  stage_lines text[] not null,
  check (cardinality(stage_lines) = cardinality(stage_at))
);
create index if not exists hr_town_works_map on public.hr_town_works (map_id);
alter table public.hr_town_works enable row level security;
revoke all on table public.hr_town_works from public, anon, authenticated, service_role;
comment on table public.hr_town_works is
  '${OUT_FILE}: one row per Town Works project (src/data/town-works.js). stage_at[k] is where stage k-1 starts and its last entry is the goal; stage_lines[k] is said when the total crosses it. Read only by SECURITY DEFINER functions.';

insert into public.hr_town_works (project_id, map_id, ord, name, min_gift, per_day, per_minute, plaque_top, stage_at, stage_lines) values
${values.join(',\n')}
on conflict (project_id) do update set map_id = excluded.map_id, ord = excluded.ord, name = excluded.name, min_gift = excluded.min_gift, per_day = excluded.per_day,
  per_minute = excluded.per_minute, plaque_top = excluded.plaque_top, stage_at = excluded.stage_at, stage_lines = excluded.stage_lines;

-- §4 SELF-CHECK: the rows are the data file's, the stages climb, a project stands on a real town, and no client can write or read the table.
do $$
declare v text;
begin
  if (select array_agg(w.project_id order by w.project_id) from public.hr_town_works w) is distinct from array[${[...ids].sort().map(lit).join(', ')}]::text[] then
    raise exception 'town-works-catalogue §4: the table holds a project the data file does not'; end if;
  select w.project_id into v from public.hr_town_works w
   where exists (select 1 from generate_subscripts(w.stage_at, 1) i where i > 1 and w.stage_at[i] <= w.stage_at[i - 1]) limit 1;
  if v is not null then raise exception 'town-works-catalogue §4: the stages of % do not climb', v; end if;
  select w.project_id into v from public.hr_town_works w where not exists (select 1 from public.hr_town_maps m where m.map_id = w.map_id) limit 1;
  if v is not null then raise exception 'town-works-catalogue §4: % stands on no town', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_town_works') then
    raise exception 'town-works-catalogue §4: a policy opens the table to a client'; end if;
  if has_table_privilege('authenticated', 'public.hr_town_works', 'select') or has_table_privilege('anon', 'public.hr_town_works', 'select')
     or has_table_privilege('authenticated', 'public.hr_town_works', 'insert,update,delete') or has_table_privilege('anon', 'public.hr_town_works', 'insert,update,delete') then
    raise exception 'town-works-catalogue §4: a client role holds a grant'; end if;
end $$;
`;
}

function selftest() {
  let bad = 0;
  const clean = problemsOf(TOWN_WORKS);
  if (clean.length) { console.error('gen-town-works --selftest: the tree is not clean: ' + clean.join('; ')); process.exit(2); }
  const W = TOWN_WORKS.weighhouse;
  const bites = (name, want, row, sprites) => {
    const hit = problemsOf(row === null ? {} : { weighhouse: { ...W, ...row } }, sprites).some((p) => p.includes(want));
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const st = W.stages;
  bites('no project at all', 'no project', null);
  bites('a name too long for a chat row', "doesn't fit", { name: 'The Weighhouse Of All The Greenhaven Coast' });
  bites('a bad map id', 'not a map id', { map: 'Town Common' });
  bites('a fractional minimum', 'minGift', { minGift: 0.5 });
  bites('a day cap under the minimum', 'under the smallest', { perDay: 50 });
  bites('no bucket', 'perMinute', { perMinute: 0 });
  bites('a plaque with no room', 'plaqueTop', { plaqueTop: 0 });
  bites('stages that start late', 'not 0', { stages: [{ ...st[0], at: 5 }, ...st.slice(1)] });
  bites('stages that fall', 'must climb', { stages: [st[0], st[2], st[1], st[3], st[4]] });
  bites('a project with one stage', 'start and a finish', { stages: [st[0]] });
  bites('a crossing with no line', "doesn't finish a sentence", { stages: [st[0], { ...st[1], line: null }, ...st.slice(2)] });
  bites('a line a sentence can not hold', "doesn't finish a sentence", { stages: [st[0], { ...st[1], line: 'Has Its Footings' }, ...st.slice(2)] });
  bites('a line on the first stage', "can't have a line", { stages: [{ ...st[0], line: 'stands.' }, ...st.slice(1)] });
  bites('two stages sharing art', 'share art', { stages: [st[0], { ...st[1], art: st[0].art }, ...st.slice(2)] });
  bites('a button the rules refuse', 'the rules refuse', { gifts: [50, 5000] });
  bites('a button over the day cap', 'the rules refuse', { gifts: [30000] });
  bites('art the world does not hold', 'not in the world', {}, new Set());
  if (bad) { console.error(`gen-town-works --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-town-works --selftest: every refusal bites');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-town-works --check: ${OUT_FILE} is stale; run node tools/gen-town-works.mjs`); process.exit(1); }
    console.log('gen-town-works --check: OK');
  } else {
    await writeFile(OUT, build());
    console.log('gen-town-works: wrote ' + OUT_FILE);
  }
}
