// ════════════════════════════════════════════════════════════════════════
// tests/selfcheck-no-global-dml.bypass.mjs — SECURITY PROOF (2026-09-20,
// b550 review, finding S-SC-1). TEN SHAPES tests/selfcheck-no-global-dml.mjs
// DOES NOT SEE.
//
//   node tests/selfcheck-no-global-dml.bypass.mjs
//   node tests/selfcheck-no-global-dml.bypass.mjs --list   one line per shape
//
// ⚠ EXPECTED RED until the guard is tightened. It is deliberately NOT
//   registered in .github/workflows/smoke.yml: register it in the SAME commit
//   that closes the shapes, never before, or the CI gate is unreachable for
//   every later build (CLAUDE.md §4, the b512 lesson).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// selfcheck-no-global-dml.mjs is the standing control the 2026-09-20 incident
// produced, and its own --selftest is honest: six planted defects caught, three
// controls silent. But a guard is only as wide as the shapes it reads, and this
// one reads ONE shape — a literal `delete`/`update`/`truncate` token, in a
// top-level `do $tag$` block, whose WHERE clause has no owner column within 90
// characters of a declared local. Each plant below is a real, writable
// migration statement that reaches every player's rows and that the guard
// reports as clean. They fall into four families:
//
//   A. DYNAMIC SQL       the statement is inside a string literal or a nested
//                        dollar-quote, and blankLiterals()/blankNested() blank
//                        exactly the text that would have matched. `execute` is
//                        the one verb whose literal IS executed code.
//   B. FAKE BINDING      isScoped() asks only whether SOME declared name occurs
//                        within BIND_WINDOW (90) characters after SOME owner
//                        column. `id` is an owner column and `v_cut` is a
//                        declared local, so `where id is not null and at <
//                        v_cut` reads as "scoped to a row I created". It is a
//                        blanket prune.
//   C. WRONG VERB        pass 1 derives the global-DML function set with
//                        `if (verb === 'update') continue;` and never looks at
//                        INSERT at all, so a function that globally UPDATEs (or
//                        INSERTs ... ON CONFLICT DO UPDATE) a player-value
//                        table is not in the set, and calling it is invisible.
//                        This is not hypothetical: the very file the guard was
//                        written for calls one — see `backfill_call` below.
//   D. WRONG CONTAINER   pass 2 only reads `do $tag$` blocks. A self-check
//                        written as `create function pg_temp.sc() … ; select
//                        pg_temp.sc();` is never scanned.
//
// Nothing here is a false alarm about style: every plant is the same class of
// statement that was refused by production on 2026-09-20 15:41 UTC.
// ════════════════════════════════════════════════════════════════════════

import { readFile, readdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, verdicts } from './selfcheck-no-global-dml.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGDIR = join(ROOT, 'supabase', 'migrations');
const CENSUS = join(ROOT, 'tests', 'restore-census.baseline.json');
const argv = process.argv.slice(2);

const TARGET = '2026-09-19-lifetime-facts-off-the-ledger.sql';
// Inside the behavioural-gate subtransaction of §6, after v_cut/v_uid exist.
const ANCHOR = '    v_bf := public.hr_backfill_lifetime_facts();';
const STATE = '2026-08-11-player-state.sql';

/** A function appended to the chain that globally UPDATEs a player-value table. */
const GLOBAL_UPDATE_FN = `
create or replace function public.hr_probe_zero_gold()
returns void language sql as $fn$
  update public.player_state set gold = 0;
$fn$;
`;

/** A self-check that is not a DO block. */
const TEMP_FN_SELFCHECK = `
create function pg_temp.sec_probe_selfcheck() returns void language plpgsql as $sc$
declare v_cut timestamptz := now() - interval '90 days';
begin
  delete from public.player_ledger where at < v_cut;
end $sc$;
select pg_temp.sec_probe_selfcheck();
`;

const SHAPES = [
  { name: 'execute_string_literal', family: 'A',
    what: 'the 2026-09-19 statement verbatim, handed to EXECUTE as a string literal',
    stmt: `    execute 'delete from public.player_ledger where at < now() - interval ''1 day''';` },
  { name: 'execute_format', family: 'A',
    what: 'the same delete assembled by format() — the table name never appears as a token',
    stmt: `    execute format('delete from %I where at < now()', 'player_ledger');` },
  { name: 'execute_dollar_quoted', family: 'A',
    what: 'the same delete in a nested dollar-quote, which blankNested() blanks wholesale',
    stmt: `    execute $q$ delete from public.player_ledger where at < now() $q$;` },
  { name: 'fake_bind_id_is_not_null', family: 'B',
    what: '`where id is not null and at < v_cut` — a blanket prune that reads as owner-scoped',
    stmt: `    delete from public.player_ledger where id is not null and at < v_cut;` },
  { name: 'fake_bind_subselect', family: 'B',
    what: 'the owner column is bound to a SUBSELECT over the whole table, not to the probe',
    stmt: `    delete from public.player_ledger where id in (select id from public.player_ledger where at < v_cut);` },
  { name: 'cte_delete_time_only', family: 'B',
    what: 'hr_ledger_prune’s own CTE shape, inlined — every player’s aged rows, batched',
    stmt: `    with doomed as (select id, at from public.player_ledger where at < v_cut order by at, id limit 20000)\n     delete from public.player_ledger l using doomed d where l.id = d.id and l.at < v_cut;` },
  { name: 'update_from_fake_bind', family: 'B',
    what: 'UPDATE … FROM across every character; the join column is the fake bind',
    stmt: `    update public.player_state s set gold = 0 from public.player_progress p where s.user_id = p.user_id and s.slot = v_slot;` },
  { name: 'backfill_call', family: 'C',
    what: 'THE SHAPE ALREADY IN THE TREE: hr_backfill_lifetime_facts() upserts player_progress '
        + 'for EVERY character with a bounty turn-in (and hearthfind_ordinal for every trophy). '
        + '2026-09-19 §6 calls it twice inside the gates; the guard sees nothing.',
    stmt: `    v_bf := public.hr_backfill_lifetime_facts();` },
  { name: 'call_global_update_fn', family: 'C',
    what: 'a chain function whose body is `update public.player_state set gold = 0`, called from a gate',
    stmt: `    perform public.hr_probe_zero_gold();`, extra: [STATE, GLOBAL_UPDATE_FN] },
  { name: 'selfcheck_in_temp_fn', family: 'D',
    what: 'the same blanket prune in a pg_temp function the file then SELECTs — not a DO block',
    append: TEMP_FN_SELFCHECK },
];

async function main() {
  const files = (await readdir(MIGDIR)).filter((f) => f.endsWith('.sql')).sort();
  const base = new Map();
  for (const f of files) base.set(f, await readFile(join(MIGDIR, f), 'utf8'));

  let census;
  try { census = JSON.parse(await readFile(CENSUS, 'utf8')); }
  catch (err) {
    const e = new Error(`tests/restore-census.baseline.json is unreadable (${err.message})`);
    e.harness = true; throw e;
  }
  const tables = new Set(census.player_value_tables.map((t) => t.toLowerCase()));

  const slipped = [];
  for (const s of SHAPES) {
    const before = base.get(TARGET);
    const after = s.append ? before + s.append : before.replace(ANCHOR, `${s.stmt}\n${ANCHOR}`);
    if (after === before) {
      console.error(`HARNESS  ${s.name}: the anchor has moved — a plant that was never planted proves nothing.`);
      process.exit(2);
    }
    const srcs = new Map(base);
    srcs.set(TARGET, after);
    if (s.extra) srcs.set(s.extra[0], base.get(s.extra[0]) + s.extra[1]);

    const v = verdicts(scan(srcs, tables).findings, srcs);
    const noise = [...v.open, ...v.stale].filter((f) => f.file === TARGET);
    if (noise.length) {
      console.log(`caught   [${s.family}] ${s.name.padEnd(26)} ${noise.map((f) => f.subject).join(', ')}`);
    } else {
      slipped.push(s);
      console.log(`SLIPPED  [${s.family}] ${s.name.padEnd(26)} ${s.what}`);
    }
  }

  if (argv.includes('--list')) {
    console.log('\nfamilies: A dynamic SQL · B fake binding (isScoped) · C wrong verb (pass 1) · D wrong container (pass 2)');
  }

  if (slipped.length) {
    console.error(`\n${slipped.length} of ${SHAPES.length} global-DML shapes are INVISIBLE to `
      + 'tests/selfcheck-no-global-dml.mjs.\n'
      + '  Each one, written into a migration today, would reach every player\'s rows and the\n'
      + '  guard would report "OK — all acknowledged with a written reason".\n'
      + '  Required (see docs/planning/SEC_SELFCHECK_DML_AND_PET_XP_2026-09-20.md, S-SC-1):\n'
      + '    A  refuse `execute` of any non-constant/unreadable statement inside a DO block,\n'
      + '       or lex its literal as code rather than blanking it.\n'
      + '    B  isScoped must require the owner column to be bound by = / in ( … ) to a local,\n'
      + '       with no other unbounded conjunct widening the reach — `id is not null` is not\n'
      + '       a binding, and a local named anywhere in the predicate is not one either.\n'
      + '    C  pass 1 must class a function global on UPDATE and on INSERT … ON CONFLICT DO\n'
      + '       UPDATE over a player-value table, not only on DELETE.\n'
      + '    D  pass 2 must read every executable body the file installs-and-calls, not only\n'
      + '       top-level `do $tag$` blocks.');
    process.exit(1);
  }
  console.log(`\nselfcheck-no-global-dml.bypass: OK — all ${SHAPES.length} shapes are seen.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(e.harness ? 2 : 1); });
