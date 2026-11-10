#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/server-debt-second-apply.mjs — THE EIGHT 2027-04-02 FILES APPLY IN THEIR ORDER, AND EACH A SECOND TIME MOVES NOTHING.
//
//   node tests/server-debt-second-apply.mjs             the guard (PGlite, the real chain up to the file before them)
//   node tests/server-debt-second-apply.mjs --selftest  two planted files must go red, each for its reason
//
// mutant-anchors: none — the selftest plants into in-memory copies of the files' text, never the tree
//
// CLAUDE.md §4: a migration is additive and idempotent. Each of lane/c-server-debt's files pins the image it was
// written against OR its own (its §0), so a second apply right after the first must find its own images and
// change nothing. That is judged AS OF each file (after a later file of the lane has restated a body, the
// earlier file's pin refuses a re-apply by design: it never undoes the later one). So: the chain up to the last
// file before the lane, then each file once, an image, the same file again, the same image.
//   SA-1  every file applies, in the order tests/schema-apply-order.json declares them
//   SA-2  a second apply of each raises nothing and moves no function body, grant, policy, table grant, row
//         level security flag or row of a catalogue the lane writes
//   SA-3  the order is load-bearing where the files say so: the town walk mask's function file refuses before
//         the rate file (it restates hr_town_move from that file's image)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { PREV, FILES, laneText as text } from './_server-debt.mjs';


const IMAGE = `
select jsonb_build_object(
  'functions', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '-'))
                  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')),
  'relations', (select jsonb_object_agg(c.relname, c.relkind::text || ' ' || c.relrowsecurity::text || ' ' || coalesce(c.relacl::text, '-'))
                  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')),
  'policies', (select jsonb_object_agg(p.tablename || ' :: ' || p.policyname, md5(p.cmd || ' ' || p.roles::text || ' ' || p.permissive || ' ' || coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')))
                 from pg_policies p where p.schemaname = 'public'),
  'catalogues', jsonb_build_object(
    'hr_town_walk', (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (select to_jsonb(x) as t from public.hr_town_walk x) q),
    'hr_residue_fields', (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (select to_jsonb(x) as t from public.hr_residue_fields x) q),
    'hr_level_xp_ceiling', (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (select to_jsonb(x) as t from public.hr_level_xp_ceiling x) q),
    'hr_client_rpc_baseline', (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (select to_jsonb(x) - 'approved_at' as t from public.hr_client_rpc_baseline x) q),
    'hr_gm_wall_allow', (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (select to_jsonb(x) as t from public.hr_gm_wall_allow x) q))) as image`;
/* The image tolerates a catalogue the lane has not created yet (an earlier file of the order). */
async function image(db) {
  const have = new Set((await db.query("select c.relname::text as n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'")).rows.map((r) => r.n));
  let sql = IMAGE;
  for (const t of ['hr_town_walk', 'hr_residue_fields', 'hr_level_xp_ceiling']) {
    if (!have.has(t)) sql = sql.replace(new RegExp(`'${t}', \\(select[^\\n]*\\n`), `'${t}', null,\n`);
  }
  return (await db.query(sql)).rows[0].image;
}
function diff(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const x = a[k] || {}, y = b[k] || {};
    for (const n of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[n]) !== JSON.stringify(y[n])) out.push(k + ' ' + n);
  }
  return out;
}
const apply = async (db, sql) => {
  try { await db.exec(`begin;\n${sql}\ncommit;`); return null; }
  catch (e) { await db.exec('rollback').catch(() => {}); return String(e && e.message || e).split('\n')[0]; }
};

/** @param {(file: string) => string} [textOf]  the selftest's planted texts */
export async function rules(textOf = text) {
  const fails = [];
  const order = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const at = FILES.map((f) => order.indexOf(f));
  if (at.some((i) => i < 0) || at.some((i, k) => k > 0 && i < at[k - 1]) || at[0] < order.indexOf(PREV)) {
    fails.push('SA-1: the apply order does not hold the files in this order after ' + PREV + ': ' + JSON.stringify(at));
    return fails;
  }
  const { db } = await bootReplay({ upTo: PREV });
  // SA-3 first, on the chain before any of them: the function file of the walk mask must refuse without the rate file
  const early = await apply(db, textOf('2027-04-02-town-walk-mask.sql'));
  if (!early || !/PRECONDITION|PIN/.test(early)) fails.push('SA-3: 2027-04-02-town-walk-mask.sql applied before the files it stands on: ' + (early || 'no refusal'));
  for (const f of FILES) {
    const first = await apply(db, textOf(f));
    if (first) { fails.push(`SA-1: ${f} did not apply: ${first}`); break; }
    const before = await image(db);
    const second = await apply(db, textOf(f));
    if (second) { fails.push(`SA-2: a second apply of ${f} raised: ${second}`); continue; }
    const moved = diff(before, await image(db));
    if (moved.length) fails.push(`SA-2: a second apply of ${f} moved ${moved.slice(0, 5).join(', ')}${moved.length > 5 ? ' and ' + (moved.length - 5) + ' more' : ''}`);
  }
  await db.close?.().catch(() => {});
  return fails;
}

/* THE PLANTED FILES: each is one in-memory edit of one file's text; the guard must go red for that reason. */
export const SELFTEST = [
  { name: 'a second apply raises (a catalogue row inserted with no conflict rule)', file: '2027-04-02-residue-fields.generated.sql',
    from: '  on conflict (field) do update set max_bytes = excluded.max_bytes;', to: ';',
    expect: 'SA-2: a second apply of 2027-04-02-residue-fields.generated.sql raised' },
  { name: 'a second apply moves a grant (a revoke that only the first apply reaches)', file: '2027-04-02-dead-doors.sql',
    from: 'revoke all on sequence public.game_saves_id_seq from anon, authenticated;',
    to: "do $x$ begin if has_sequence_privilege('authenticated', 'public.game_saves_id_seq', 'usage') then revoke all on sequence public.game_saves_id_seq from anon, authenticated; else grant usage on sequence public.game_saves_id_seq to service_role, authenticated; end if; end $x$;",
    expect: 'SA-2: a second apply of 2027-04-02-dead-doors.sql' },
];

async function main() {
  process.on('beforeExit', () => { console.log('  ✗ server-debt-second-apply stopped before its verdict (a query never settled)'); process.exit(1); });
  if (process.argv.includes('--selftest')) {
    let bad = 0;
    const clean = await rules();
    if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
    console.log('  ✓ clean control green');
    for (const m of SELFTEST) {
      const src = text(m.file);
      if (src.split(m.from).length !== 2) { console.log('  ✗ harness: the anchor of "' + m.name + '" matches ' + (src.split(m.from).length - 1) + ' times in ' + m.file); bad++; continue; }
      const fails = await rules((f) => (f === m.file ? src.replace(m.from, () => m.to) : text(f)));
      const hit = fails.find((x) => x.includes(m.expect));
      if (hit) console.log('  ✓ ' + m.name + ' — caught (' + hit.slice(0, 140) + ')');
      else { bad++; console.log('  ✗ ' + m.name + ' — ' + (fails.length ? 'ANOTHER reason: ' + fails[0].slice(0, 200) : 'NOT caught')); }
    }
    console.log(bad ? 'server-debt-second-apply --selftest: ' + bad + ' arm(s) wrong' : 'server-debt-second-apply --selftest: both planted files caught');
    process.exit(bad ? 1 : 0);
  }
  const fails = await rules();
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'server-debt-second-apply: ' + fails.length + ' rule(s) RED'
    : 'server-debt-second-apply: ' + FILES.length + ' files apply in their declared order, each a second time moves nothing, and the walk mask refuses before the rate file');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
