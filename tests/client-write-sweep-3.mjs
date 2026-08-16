#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-write-sweep-3.mjs — BATCH 3 OF THE CLIENT WRITE GRANT SWEEP,
//                                  PROVEN BY EXECUTION.
//
// THE CLAIM UNDER TEST, in two lines:
//   after 2026-08-16-client-write-grant-sweep-3.sql, neither anon nor
//   authenticated holds ANY write privilege on raid_claims or
//   raid_contributions, the four baseline rows are GONE, and BOTH CONFIRMED
//   WRITERS (raid_strike, raid_claim) STILL WORK when driven for real as a
//   signed-in player through their A9 wrappers;
//   …and BATCH 1's SIX CATALOGUES no longer hold MAINTAIN — the privilege
//   information_schema cannot report, which is why batch 1 said "0 remain"
//   about a database that still carried twelve client privileges.
//
// Everything runs against a real PostgreSQL (PGlite/WASM, in process) with THE
// WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json, so
// the migration's own self-verifying blocks (§0 refuse-to-install including the
// server-derived privilege-vocabulary check, §3 full vocabulary, §4
// execute-the-refusal, §5 detector-clean) EXECUTE on every run of this file.
// Production is never touched.
//
// ── WHY raid_* AND NOT SOMETHING CLEVERER ───────────────────────────────
// raid_contributions is the only table in the batch-1 baseline that has ALREADY
// hosted a live client-write exploit: the b209 "own contribution claim" UPDATE
// policy, `for update using (auth.uid() = user_id)`, removed by
// 2026-08-08-raid-hardening.sql. The GRANT it stood on was never removed. A
// table that HAD a write policy taken away is the likeliest of the seventeen to
// have one re-added, and what it would restore is cross-player: damage/strikes
// set the band and — on a partial kill — the clan-wide payout factor, i.e. how
// much SOMEBODY ELSE is paid.
//
// ── WHY "THE WRITER STILL WORKS" IS DRIVEN AND NOT REASONED ─────────────
// "A SECURITY DEFINER function executes as its owner, so revoking the caller's
// grants cannot break it" is TRUE and is still not evidence. The A9 retrofit in
// 2026-08-11-authenticated-surface-lockdown.sql wraps both RPCs — the wrapper is
// what `authenticated` executes and the __ungated body is what does the work —
// so the property depends on the ownership of TWO functions and on the wrapper's
// own definer flag. C4 drives raid_strike and raid_claim end to end.
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · The PostgREST request path. `set local role authenticated` is how the
//     role arrives at the table, which is the seam the grant lives on, but it
//     is not an HTTP request. In particular the change in HTTP STATUS on
//     src/features/raids.js:1023's legacy PATCH (200-with-[] → 403) is argued
//     from the client source, not measured here; both take the same branch.
//   · Production's grants. What production actually holds was measured by hand
//     for this batch inside a ROLLED-BACK transaction: all four raid pairs
//     answered RLS_ONLY before the revoke and NO_GRANT after, and all twelve of
//     batch 1's pairs still held MAINTAIN.
//   · TRUE CONCURRENCY. PGlite is one backend, and nothing here needs it.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/client-write-sweep-3.mjs --list       the mutation catalogue
//   node tests/client-write-sweep-3.mjs --selftest   every mutation must be CAUGHT
//   node tests/client-write-sweep-3.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-16-client-write-grant-sweep-3.sql';
const PRED1 = '2026-08-16-client-write-grant-sweep.sql';
const PRED2 = '2026-08-16-client-write-grant-sweep-2.sql';

const RAID = ['raid_claims', 'raid_contributions'];
const SIX = ['hr_castle_board_tasks', 'hr_castle_buildings', 'hr_castle_items',
  'hr_castle_tiers', 'hr_hunt_bosses', 'hr_hunt_tiers'];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   The three the task names explicitly are `revoke_half_applied`,
   `baseline_row_left_behind` and `maintain_left_behind`; the rest exist because
   a guard that only catches the defects it was asked about is a guard shaped
   around its own test. */
const MUTATIONS = {
  // ── THE THREE NAMED ARMS ──────────────────────────────────────────────
  revoke_half_applied: {
    migration: MIG,
    why: 'the raid revoke covers raid_claims and SILENTLY SKIPS raid_contributions — the shape a '
       + 'hand-written two-table sweep fails in, and it skips the one of the two that has already '
       + 'hosted a live exploit. The baseline row is still deleted, so the surviving grant becomes '
       + 'INVISIBLE to the detector forever: strictly worse than never having swept it',
    find: "  c_tables constant text[] := array['raid_claims','raid_contributions'];\n  c_pairs",
    repl: "  c_tables constant text[] := array['raid_claims'];\n  c_pairs",
  },
  baseline_row_left_behind: {
    migration: MIG,
    why: 'the grants go but ONE baseline row stays. A baselined pair is a standing exemption: the '
       + 'next time anything re-grants that table the detector says nothing, which is the exact '
       + 'blindness the baseline was invented to remove',
    find: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2];\n  get diagnostics",
    repl: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2]\n"
        + "     and not (b.table_name = 'raid_contributions' and b.grantee = 'anon');\n  get diagnostics",
  },
  maintain_left_behind: {
    migration: MIG,
    why: 'THE WHOLE POINT OF PART B: §2 stops revoking MAINTAIN from batch 1\'s six catalogues, '
       + 'i.e. this file leaves them exactly as batch 1 left them. information_schema cannot '
       + 'report MAINTAIN, so a sweep verified that way says "0 remain" with twelve live client '
       + 'privileges on the tables',
    find: "    execute format('revoke maintain on public.%I from public, anon, authenticated', t);",
    repl: "    perform 1;",
  },

  // ── THE MEASUREMENT ITSELF ────────────────────────────────────────────
  raid_maintain_left_behind: {
    migration: MIG,
    why: 'MAINTAIN is dropped from the RAID revoke verb list. The four raid pairs then lose '
       + 'INSERT/UPDATE/DELETE and keep a client privilege that no instrument in the predecessor '
       + 'chain can see, while the baseline rows that would have flagged them are consumed',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
    repl: "    execute format('revoke insert, update, delete, truncate, references, trigger '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
  },
  verify_via_information_schema: {
    migration: MIG,
    why: 'the §3 verification is measured through information_schema instead of '
       + 'has_table_privilege. On its own that changes no grant — it removes the only instrument '
       + 'that can SEE one, which is why it is paired with maintain_left_behind in --selftest. '
       + 'This is batch 1\'s defect, reproduced deliberately',
    find: "     where to_regclass('public.' || quote_ident(tt)) is not null\n"
        + "       and has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;\n"
        + "  if v_left is not null then",
    repl: "     where exists (select 1 from information_schema.role_table_grants g\n"
        + "                    where g.table_schema='public' and g.table_name=tt\n"
        + "                      and g.grantee=gg and g.privilege_type=pp)) x;\n"
        + "  if v_left is not null then",
    withAlso: 'maintain_left_behind',
  },
  vocab_narrowed: {
    migration: MIG,
    why: 'MAINTAIN is dropped from §0(e)\'s declared vocabulary — the exact blind spot this file '
       + 'exists to close, planted at the instrument rather than at the revoke. The file must '
       + 'REFUSE TO INSTALL rather than sweep seven eighths of the privilege surface and report '
       + 'success',
    find: "  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',\n"
        + "                                    'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];",
    repl: "  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',\n"
        + "                                    'TRUNCATE','REFERENCES','TRIGGER'];",
  },
  select_collaterally_revoked: {
    migration: MIG,
    why: '`revoke all` instead of the enumerated verbs — the one-word "simplification" that takes '
       + 'SELECT with it and empties the Hunt roster (src/features/raids.js:719 reads '
       + 'raid_contributions directly), silently, on a file whose other checks would all stay green',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
    repl: "    execute format('revoke all on public.%I from public, anon, authenticated', t);",
  },

  // ── THE PRECONDITIONS ─────────────────────────────────────────────────
  absent_baseline_row_tolerated: {
    migration: MIG,
    why: 'the refuse-to-install check on an already-absent baseline row becomes a warning. The '
       + 'file then applies cleanly onto a state it does not understand — another batch having '
       + 'swept the same pair — which is how two sweeps silently disagree about what they own',
    find: "    raise exception 'REFUSING TO INSTALL: baseline row(s) this file is supposed to DELETE are '",
    repl: "    raise warning 'REFUSING TO INSTALL: baseline row(s) this file is supposed to DELETE are '",
  },
  write_policy_ignored: {
    migration: MIG,
    why: 'the §0(b) check that no INSERT/UPDATE/DELETE/ALL policy exists is dropped. The whole '
       + 'file rests on the grant being DEAD; with the b209 "own contribution claim" policy back, '
       + 'the grant is LIVE, the revoke breaks a working (if exploitable) path, and nothing would '
       + 'say so',
    find: "      raise exception 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
  },
  unknown_writer_tolerated: {
    migration: MIG,
    why: 'a third writer of the raid tables appears and §0(c) shrugs. "The writer is confirmed" is '
       + 'the entire basis on which a batch is allowed to sweep',
    find: "    raise exception 'REFUSING TO INSTALL: the raid tables have writer(s) this file does not know '",
    repl: "    raise warning 'REFUSING TO INSTALL: the raid tables have writer(s) this file does not know '",
  },
  trigger_writer_ignored: {
    migration: MIG,
    why: 'the non-function writer scan (triggers, rules, dependent views) is downgraded. A '
       + 'pg_proc scan alone cannot see a trigger, and a trigger is a writer — "confirmed" would '
       + 'then mean "confirmed among functions"',
    find: "    raise exception 'REFUSING TO INSTALL: something other than a function routes into the raid '",
    repl: "    raise warning 'REFUSING TO INSTALL: something other than a function routes into the raid '",
  },
  batch1_regrant_tolerated: {
    migration: MIG,
    why: '§2(a) stops refusing when one of batch 1\'s six has regained a non-MAINTAIN client write '
       + 'privilege. This file would then remove MAINTAIN from a table that has an INSERT grant '
       + 'back, i.e. tidy the invisible privilege while the visible one stands',
    find: "    raise exception 'REFUSING TO INSTALL: batch 1''s six catalogues carry NON-MAINTAIN client write '",
    repl: "    raise warning 'REFUSING TO INSTALL: batch 1''s six catalogues carry NON-MAINTAIN client write '",
  },
};

/* ── THE HOSTILE PRECONDITIONS ──────────────────────────────────────────────
   §0 and §2(a) are five REFUSE-TO-INSTALL checks, and on a clean replay not one
   of them is ever reached — so downgrading any of them from `raise` to
   `warning` changes nothing, and every precondition mutation would SLIP. A
   precondition that is never triggered is not tested; it is decorated.

   Each scenario below PLANTS the state the precondition exists for, by
   appending SQL to a PREDECESSOR migration, and asserts this migration REFUSES
   with the message that names the actual problem. C8 runs them.

   ⚠ WHICH PREDECESSOR MATTERS. A hostile grant planted in batch 1's tail is
     seen by BATCH 2's §4, which calls hr_assert_grant_hygiene(true) and would
     abort the chain one file early, for a true reason that is not the one under
     test. So grant-shaped scenarios are planted in batch 2's tail (the last file
     before this one), and only baseline/writer/policy scenarios that batch 2 is
     blind to may go earlier. Both anchors are comment lines at top level,
     between statements. */
/* ⚠ THE ANCHORS CONTAIN NO `$$`, AND THAT IS NOT AESTHETIC. bootReplay applies
   a patch with String.prototype.replace, in which `$$` in the REPLACEMENT is an
   escape meaning a literal `$` — so anchoring on a dollar-quoted `end $$;` and
   re-emitting it silently produces `end $;` and the whole predecessor fails to
   apply with "unterminated dollar-quoted string". */
const PRED2_TAIL = '-- The designed behaviour on a re-run of the predecessor AFTER this file is';
const SCENARIOS = {
  write_policy_present: {
    file: PRED2,
    anchor: PRED2_TAIL,
    why: 'the b209 "own contribution claim" UPDATE policy is re-added to raid_contributions — the '
       + 'exact policy this codebase already shipped and then removed. The grant is then LIVE, not '
       + 'dead, and revoking it breaks that path',
    sql: 'create policy "hr__mut own contribution claim" on public.raid_contributions '
       + 'for update using (auth.uid() = user_id);',
    expect: /now carries a client WRITE policy/i,
  },
  unknown_writer_present: {
    file: PRED2,
    anchor: PRED2_TAIL,
    why: 'a THIRD writer of raid_contributions exists. "The writer is confirmed" is the entire '
       + 'basis on which a batch is allowed to sweep, and this file must not sweep past a writer '
       + 'it has never seen',
    sql: 'create function public.hr__mut_raid_writer() returns void language plpgsql as $m$ begin '
       + 'update public.raid_contributions set damage = damage where false; end $m$;\n'
       + 'revoke execute on function public.hr__mut_raid_writer() from public, anon, authenticated;',
    expect: /have writer\(s\) this file does not know about/i,
  },
  trigger_writer_present: {
    file: PRED2,
    anchor: PRED2_TAIL,
    why: 'a TRIGGER is attached to raid_claims. A pg_proc body scan cannot see it, so without the '
       + 'second population the file would report "the writers are confirmed" while a writer it '
       + 'has never looked at fires on every row',
    sql: 'create function public.hr__mut_trg() returns trigger language plpgsql as $m$ begin '
       + 'return new; end $m$;\n'
       + 'revoke execute on function public.hr__mut_trg() from public, anon, authenticated;\n'
       + 'create trigger hr__mut_trg_t before insert on public.raid_claims '
       + 'for each row execute function public.hr__mut_trg();',
    expect: /something other than a function routes into the raid tables/i,
  },
  baseline_row_already_absent: {
    file: PRED2,
    anchor: PRED2_TAIL,
    why: 'another batch (or a re-run of this one) already consumed one of the four rows. This '
       + 'file is then reasoning about a state that no longer exists, and must stop rather than '
       + 'apply half of a change somebody else owns',
    sql: "delete from public.hr_client_write_baseline where table_name = 'raid_claims' "
       + "and grantee = 'anon';",
    expect: /already absent/i,
  },
  batch1_regranted: {
    file: PRED2,
    anchor: PRED2_TAIL,
    why: 'one of batch 1\'s six catalogues has an INSERT grant back. Removing MAINTAIN from it '
       + 'while the INSERT stands is tidying the invisible privilege and leaving the visible one, '
       + 'and it means batch 1\'s work has come undone without anybody noticing',
    /* Planted in batch 2's tail rather than batch 1's for the reason in the
       block comment above — and AFTER batch 2's §4 detector call, which is
       exactly what the PRED2_TAIL anchor is. The baseline row is added in the
       same breath so batch 2's own already-run checks stay honest and the ONLY
       thing this scenario tests is §2(a). */
    sql: 'grant insert on public.hr_castle_tiers to authenticated;',
    expect: /carry NON-MAINTAIN client write privilege/i,
  },
};

// ── tiny harness ───────────────────────────────────────────────────────────
class Red extends Error {}
let fails = 0;
let checks = 0;
let problems = [];
let quiet = false;
const log = (s) => { if (!quiet) process.stdout.write(`${s}\n`); };
function ok(cond, msg) {
  checks += 1;
  if (!cond) { fails += 1; problems.push(msg); log(`  RED  ${msg}`); throw new Red(msg); }
}

const UID = '00000000-0000-4000-b354-0000000000e1';   // solo claimant
const UID2 = '00000000-0000-4000-b354-0000000000e2';  // clan striker/claimant
const CLAN = 'aaaaaaaa-0000-0000-0000-0000000000e3';

/* ⚠ `reset role` is best-effort in the finally. If the wrapped statement raised,
   the transaction is ABORTED and `reset role` raises 25P02 too — from a finally
   block, which REPLACES the real error with a housekeeping one. Callers that
   expect a failure use probeWrite(), which rolls back to a savepoint instead. */
const asRole = async (db, role, sql, params) => {
  await db.query(`set local role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.query('reset role').catch(() => {}); }
};
const asUser = async (db, uid, sql, params) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.query('set local role authenticated');
  try { return await db.query(sql, params); }
  finally { await db.query('reset role').catch(() => {}); }
};

/** Every table privilege the SERVER knows, derived rather than typed — the same
 *  instrument §0(e) of the migration refuses to install without. A hand-typed
 *  list is how MAINTAIN survived batch 1; this file must not repeat it. */
async function vocabulary(db) {
  const { rows } = await db.query(
    "select a.privilege_type::text as p from aclexplode(acldefault('r', "
    + '(select oid from pg_roles where rolname = current_user))) a '
    + 'group by 1 order by 1');
  return rows.map((r) => r.p).filter((p) => p !== 'SELECT');
}

async function clientPrivs(db, table, vocab) {
  const out = [];
  for (const g of ['anon', 'authenticated']) {
    for (const p of vocab) {
      const [{ h }] = (await db.query(
        'select has_table_privilege($1, $2, $3) as h', [g, `public.${table}`, p])).rows;
      if (h) out.push(`${table}:${g}:${p}`);
    }
  }
  return out;
}

/** Attempt a client write and classify the refusal. The MESSAGE, not the SQLSTATE:
 *  a missing grant and an RLS refusal are BOTH 42501, so a test that asserted the
 *  code would pass identically against an un-swept database.
 *  `default values` keeps the probe independent of either table's columns — the
 *  ACL check runs at executor start, before any constraint or policy. */
async function probeWrite(db, role, table) {
  await db.query('savepoint hrp');
  let verdict;
  try {
    await db.query(`set local role ${role}`);
    await db.query(`insert into public.${table} default values`);
    verdict = 'PERMITTED';
    await db.query('rollback to savepoint hrp');   // a permitted write is UNDONE
  } catch (e) {
    const m = String(e && e.message || e);
    await db.query('rollback to savepoint hrp');
    verdict = /permission denied for table/i.test(m) ? 'NO_GRANT'
      : /row-level security/i.test(m) ? 'RLS_ONLY'
        : `OTHER: ${m.split('\n')[0]}`;
  }
  await db.query('release savepoint hrp').catch(() => {});
  await db.query('reset role').catch(() => {});
  return verdict;
}

/** The (table, grantee) pairs a sweep migration DECLARES, parsed from its own
 *  source. Used so C6's arithmetic is derived from the files rather than typed
 *  (CLAUDE.md b339: three different wrong numbers have shipped in prose about
 *  this list). `decl` is the array variable name to read. */
async function declaredPairs(file, decl) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8');
  // ⚠ `\s+`, not a single space: both files align the `constant` keyword in a
  //   declaration block, so `c_pairs  constant` carries two. A one-space regex
  //   parsed ZERO pairs and the arithmetic below went quietly vacuous — which
  //   is why the count controls in C5 exist at all.
  const re = new RegExp(`${decl}\\s+constant text\\[\\]\\[\\] := array\\[([\\s\\S]*?)\\];`);
  const block = sql.match(re);
  if (!block) return [];
  return [...block[1].matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z]+)'\s*\]/g)]
    .map((m) => `${m[1]}:${m[2]}`);
}

/** Every (table, grantee) pair that ANY sweep batch declares it consumes, read
 *  from the migrations directory rather than from a list in this file, so a
 *  future batch does not turn this arm red for a database in perfect order. */
async function consumedPairs() {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = (await readdir(dir))
    .filter((f) => /client-write-grant-sweep(-\d+)?\.sql$/.test(f)).sort();
  const out = new Set();
  for (const f of files) for (const k of await declaredPairs(f, 'c_pairs')) out.add(k);
  return { pairs: [...out], files };
}

async function seedUsers(db) {
  for (const u of [UID, UID2]) {
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [u]);
  }
}

/* The rate gate is REAL — hr_rpc_gate refuses a burst — so it is cleared
   between drives. Named exactly (public.hr_rate_counters,
   2026-08-11-player-state.sql) rather than swept with a try/catch over candidate
   names: a failed statement ABORTS the surrounding transaction, and a swallowed
   error would then surface as an unrelated 25P02 three arms later. */
async function clearGate(db) {
  await db.query('delete from public.hr_rate_counters');
}

/** The clan/hunt fixture C4's clan drive needs. Written as the OWNER, on
 *  purpose: these rows are the SERVER's to write, and this is a fixture, not
 *  the thing under test. What is under test is whether the two RPCs can still
 *  write raid_contributions and raid_claims once the client grants are gone. */
async function seedHunt(db, week) {
  await db.query(
    'insert into public.clans (id, name, created_by) values ($1, $2, $3) on conflict do nothing',
    [CLAN, 'Sweep Three', UID2]);
  await db.query(
    "insert into public.clan_members (clan_id, user_id, role, joined_at) "
    + "values ($1, $2, 'leader', now() - interval '30 days') on conflict do nothing",
    [CLAN, UID2]);
  await db.query(
    'insert into public.clan_raids (clan_id, week_key, boss_id, hp_remaining, max_hp, tier, '
    + "declared_at, members_at_declare) select $1, $2, boss_id, 4000000, 4000000, 1, "
    + "now() - interval '2 days', 1 from public.hr_hunt_bosses "
    + 'where 1 between tier_min and tier_max order by boss_id limit 1 on conflict do nothing',
    [CLAN, week]);
}

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run({ patches } = {}) {
  // upTo: MIG — validate the state AS OF batch 3, isolated from batch 5's global
  // MAINTAIN sweep, which runs last and would silently correct (and hide) a
  // MAINTAIN-left-behind mutation planted here.
  const { db } = await bootReplay({ patches, upTo: MIG });
  await db.query('begin');
  await seedUsers(db);
  const VOCAB = await vocabulary(db);

  // ── C0 · THE INSTRUMENT ITSELF ────────────────────────────────────────
  // Everything below is a statement about what has_table_privilege reports over
  // VOCAB. If VOCAB is short, every "clean" in this file is batch 1's "clean".
  try {
    ok(VOCAB.includes('MAINTAIN'),
      `C0: the server-derived privilege vocabulary does not contain MAINTAIN (${VOCAB.join(', ')}). `
      + 'This whole file is about a privilege information_schema cannot see; if the derivation '
      + 'cannot see it either, every assertion below is vacuous.');
    for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      ok(VOCAB.includes(p), `C0: the derived vocabulary is missing ${p}: ${VOCAB.join(', ')}`);
    }
    log(`  ok   C0  privilege vocabulary derived from the server: ${VOCAB.join(', ')}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C1 · ZERO CLIENT WRITE PRIVILEGE SURVIVES, MAINTAIN INCLUDED ──────
  // Both populations this file touched: the two raid tables and batch 1's six.
  try {
    for (const t of [...RAID, ...SIX]) {
      const left = await clientPrivs(db, t, VOCAB);
      ok(left.length === 0,
        `C1: client write privilege(s) survive the sweep on ${t}: ${left.join(', ')}`);
    }
    // …and SELECT is still there. A sweep that took the read with it would empty
    // the Hunt roster and every castle/hunt catalogue the client renders from,
    // and no other arm here would notice.
    for (const t of [...RAID, ...SIX]) {
      for (const g of ['anon', 'authenticated']) {
        const [{ h }] = (await db.query(
          'select has_table_privilege($1, $2, $3) as h', [g, `public.${t}`, 'SELECT'])).rows;
        ok(h, `C1: SELECT was collaterally revoked from ${g} on ${t} — these tables are `
             + 'world-readable by the design of their own migrations (raids.js:719 reads '
             + 'raid_contributions directly)');
      }
    }
    log(`  ok   C1  no client write privilege on either raid table OR batch 1's six `
      + `(${VOCAB.length}-privilege vocabulary); all 16 SELECT grants intact`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C2 · THE MEASUREMENT CAN SEE A GRANT, AND A RE-GRANT IS FATAL ─────
  // Without this, C1 passes on a database where has_table_privilege stopped
  // answering, or where the tables were renamed out from under it.
  try {
    await db.query('grant insert, update on public.raid_contributions to authenticated');
    const rc = await clientPrivs(db, 'raid_contributions', VOCAB);
    ok(rc.includes('raid_contributions:authenticated:INSERT')
      && rc.includes('raid_contributions:authenticated:UPDATE'),
    `C2 CONTROL: a freshly granted INSERT/UPDATE was NOT reported — the measurement in C1 is `
      + `blind, so its "clean" means nothing. saw=${rc.join(', ') || '(none)'}`);

    // …and the DETECTOR must be fatal about it, which is what makes a
    // re-granted table a nightly alert rather than a silent regression. The
    // baseline row is gone, so nothing exempts it any more — that is the whole
    // point of consuming the row in the same migration as the revoke.
    // ⚠ SAVEPOINT. hr_assert_grant_hygiene(true) RAISES on purpose here, and a
    //   raise inside an open transaction aborts it — every later query would
    //   then fail with 25P02 and the arms below would report a defect that is
    //   really this arm's own housekeeping.
    let strictFailed = false;
    await db.query('savepoint strict1');
    try { await db.query('select public.hr_assert_grant_hygiene(true)'); }
    catch { strictFailed = true; await db.query('rollback to savepoint strict1'); }
    await db.query('release savepoint strict1').catch(() => {});
    ok(strictFailed,
      'C2: raid_contributions was re-granted an authenticated INSERT with RLS on and no write '
      + 'policy, and hr_assert_grant_hygiene STRICT returned normally. Since sweep-3 deleted its '
      + 'baseline row, this is precisely the case the detector now has to catch — the nightly cron '
      + 'run would have reported success.');
    const [{ r }] = (await db.query('select public.hr_assert_grant_hygiene(false) as r')).rows;
    ok(JSON.stringify(r.client_truncate_grants).includes('raid_contributions:authenticated:INSERT'),
      `C2: the detector did not NAME the re-granted table. report=${JSON.stringify(r.client_truncate_grants)}`);

    await db.query('revoke insert, update on public.raid_contributions from authenticated');
    await db.query('select public.hr_assert_grant_hygiene(true)');
    log('  ok   C2  the measurement sees a grant, and a re-grant is FATAL now the exemption is gone');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C2b · WHY BATCH 1 WAS BLIND, DEMONSTRATED RATHER THAN ASSERTED ────
  // The load-bearing claim of Part B is not "MAINTAIN was left behind" — it is
  // "the instrument batch 1 used CANNOT REPORT IT". Grant MAINTAIN back on one
  // of the six and show the two instruments disagree: has_table_privilege sees
  // it, information_schema.role_table_grants does not, AND the live detector
  // (whose check (4) is still built on information_schema) stays green.
  // ⚠ This arm boots the chain UP TO batch 3 (see run()'s upTo), so the live
  //   detector here is batch 1's — the era this arm documents. Batch 5's takeover
  //   (which makes the detector CATCH this MAINTAIN) is proven by batch 5's own
  //   guard; the §8 residual this arm names is closed there, not here.
  try {
    await db.query('grant maintain on public.hr_castle_tiers to authenticated');
    const [{ h }] = (await db.query(
      "select has_table_privilege('authenticated','public.hr_castle_tiers','MAINTAIN') as h")).rows;
    ok(h, 'C2b: MAINTAIN was granted and has_table_privilege did not report it');
    const [{ n }] = (await db.query(
      'select count(*)::int as n from information_schema.role_table_grants '
      + "where table_schema='public' and table_name='hr_castle_tiers' and grantee='authenticated' "
      + "and privilege_type='MAINTAIN'")).rows;
    ok(n === 0,
      'C2b: information_schema.role_table_grants NOW REPORTS MAINTAIN. If that is true, the '
      + "premise of this file's Part B — and of the deferral recorded in its §8 — is wrong, and "
      + 'both should be re-derived rather than left standing on a stale platform fact.');
    // The detector, unchanged by this file, must be green — which is exactly
    // the gap §8 says is left open, stated as a test rather than as prose.
    await db.query('select public.hr_assert_grant_hygiene(true)');
    await db.query('revoke maintain on public.hr_castle_tiers from authenticated');
    log('  ok   C2b has_table_privilege sees MAINTAIN, information_schema does not, and the '
      + 'detector stays green on it — the residual §8 names');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C3 · THE DOOR IS SHUT, AND THE PROBE CAN TELL WHICH DOOR ─────────
  // The pre-state arm the migration itself cannot run: re-grant, probe (must
  // report RLS_ONLY — the grant is there and only RLS is holding it), revoke,
  // probe again (must report NO_GRANT). A probe that returned the same verdict
  // either way would make the migration's §4 vacuous. Both verdicts were also
  // observed on PRODUCTION, in a rolled-back transaction, before this file was
  // written.
  try {
    for (const t of RAID) {
      for (const g of ['anon', 'authenticated']) {
        const after = await probeWrite(db, g, t);
        ok(after === 'NO_GRANT',
          `C3: ${g} writing ${t} after the sweep reported "${after}", expected NO_GRANT. `
          + 'RLS_ONLY means the grant is still present and row-level security is the only thing '
          + 'standing there — which is the state this sweep exists to end.');
      }
      await db.query(`grant insert on public.${t} to authenticated`);
      const pre = await probeWrite(db, 'authenticated', t);
      ok(pre === 'RLS_ONLY',
        `C3 CONTROL: with the grant restored on ${t} the probe reported "${pre}", expected `
        + 'RLS_ONLY. If it cannot distinguish the pre state from the post state, the assertion '
        + 'above is satisfied by a database nobody swept.');
      await db.query(`revoke insert on public.${t} from authenticated`);
    }
    log('  ok   C3  anon/authenticated are refused on the GRANT, not merely out-voted by RLS');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C4 · THE CONFIRMED WRITERS STILL WORK, DRIVEN AS A REAL PLAYER ───
  // Through the A9 wrappers as `authenticated`, which is what a browser reaches:
  //   raid_claim  (solo)  → INSERT into raid_claims, and the replay is refused
  //   raid_strike (clan)  → INSERT/UPDATE into raid_contributions
  //   raid_claim  (clan)  → INSERT into raid_claims + UPDATE raid_contributions
  //                          .claimed — the exact column the b209 policy let the
  //                          CLIENT write, now written only by the server.
  try {
    await clearGate(db);
    const week = (await db.query('select public.hr_utc_week_key() as w')).rows[0].w;

    // (a) SOLO — the simplest possible drive of the raid_claims INSERT.
    const s1 = (await asUser(db, UID,
      'select public.raid_claim($1, null, $2) as r', ['solo', week])).rows[0].r;
    ok(s1 && s1.ok === true,
      `C4: raid_claim(solo) was refused AFTER the sweep: ${JSON.stringify(s1)}. The revoke was `
      + 'supposed to be invisible to the only writer.');
    const [{ n }] = (await db.query(
      'select count(*)::int as n from public.raid_claims where user_id = $1 and week_key = $2',
      [UID, week])).rows;
    ok(n === 1, 'C4: raid_claim returned ok but wrote no raid_claims row — the write is being '
                + 'reported rather than performed');

    // The ledger still arbitrates. This is the property DELETE on raid_claims
    // would destroy, so it is asserted here rather than assumed.
    await clearGate(db);
    const s2 = (await asUser(db, UID,
      'select public.raid_claim($1, null, $2) as r', ['solo', week])).rows[0].r;
    ok(s2 && s2.ok === false && s2.error === 'already_claimed',
      `C4: a replayed solo claim returned ${JSON.stringify(s2)}, expected already_claimed. The `
      + 'one-chest-per-week ledger is the only thing standing between a player and unlimited '
      + 'chests, and it lives entirely in this table.');

    // (b) CLAN — raid_strike writes raid_contributions.
    await seedHunt(db, week);
    await clearGate(db);
    const boss = (await db.query(
      'select boss_id as b from public.clan_raids where clan_id = $1 and week_key = $2',
      [CLAN, week])).rows[0].b;
    const k1 = (await asUser(db, UID2,
      'select public.raid_strike($1, $2, $3, 0, 25000) as r', [CLAN, week, boss])).rows[0].r;
    ok(k1 && k1.ok === true,
      `C4: raid_strike was refused after the sweep: ${JSON.stringify(k1)}`);
    const [{ d }] = (await db.query(
      'select damage as d from public.raid_contributions where clan_id = $1 and week_key = $2 '
      + 'and user_id = $3', [CLAN, week, UID2])).rows;
    ok(Number(d) > 0,
      `C4: raid_strike reported ok but raid_contributions.damage is ${d} — the write is being `
      + 'reported rather than performed');

    // A second strike needs a different UTC day key (one strike per day, by
    // design). The day stamp is moved as the OWNER — that is fixture, not the
    // property under test — so the SECOND strike is a real second RPC write.
    await db.query(
      "update public.raid_contributions set last_strike_day = 'hr__mut yesterday' "
      + 'where clan_id = $1 and week_key = $2 and user_id = $3', [CLAN, week, UID2]);
    await clearGate(db);
    const k2 = (await asUser(db, UID2,
      'select public.raid_strike($1, $2, $3, 0, 25000) as r', [CLAN, week, boss])).rows[0].r;
    ok(k2 && k2.ok === true && Number(k2.strikes) === 2,
      `C4: the second raid_strike (the UPDATE path — the privilege the dead grant carried) did `
      + `not land: ${JSON.stringify(k2)}`);

    // (c) CLAN CLAIM — writes raid_claims AND updates raid_contributions.claimed,
    //     the column the b209 client policy owned.
    await db.query(
      'update public.clan_raids set downed_at = now(), hp_remaining = 0 '
      + 'where clan_id = $1 and week_key = $2', [CLAN, week]);
    await clearGate(db);
    const c1 = (await asUser(db, UID2,
      'select public.raid_claim($1, $2, $3) as r', ['clan', CLAN, week])).rows[0].r;
    ok(c1 && c1.ok === true,
      `C4: the clan claim was refused after the sweep: ${JSON.stringify(c1)}`);
    const [{ cl }] = (await db.query(
      'select claimed as cl from public.raid_contributions where clan_id = $1 and week_key = $2 '
      + 'and user_id = $3', [CLAN, week, UID2])).rows;
    ok(cl === true,
      'C4: raid_claim paid the chest but did not flip raid_contributions.claimed. That is the '
      + 'column the b209 "own contribution claim" policy let the CLIENT write; if the server can '
      + 'no longer write it either, the sweep broke the thing that replaced the exploit.');
    log('  ok   C4  raid_claim (solo + clan) and raid_strike (insert + update) all still write '
      + 'through the RPCs; the weekly ledger still refuses a replay');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C5 · THE BASELINE SHRANK BY EXACTLY FOUR, AND MATCHES REALITY ────
  try {
    const based = (await db.query(
      "select table_name || ':' || grantee as k from public.hr_client_write_baseline order by 1"))
      .rows.map((x) => x.k);
    for (const t of RAID) {
      for (const g of ['anon', 'authenticated']) {
        ok(!based.includes(`${t}:${g}`),
          `C5: ${t}:${g} is STILL BASELINED after the sweep. A baselined pair is a standing `
          + 'exemption — the next re-grant of that table would be invisible to the detector.');
      }
    }
    /* ⚠ NO HARDCODED COUNT, AND NO HARDCODED BATCH LIST (CLAUDE.md b339). The
       expected SET is derived end to end: batch 1's declared class, minus the
       union of every `c_pairs` array declared by EVERY sweep batch in the
       migrations directory. Naming batches 2 and 3 explicitly here would fail
       the day batch 4 lands, for a database in perfect order — which is exactly
       how batch 2's own version of this arm broke when THIS file landed, and
       exactly the pressure that gets a guard loosened instead of fixed. */
    const declared = await declaredPairs(PRED1, 'c_expected');
    const { pairs: eaten, files: sweeps } = await consumedPairs();
    ok(declared.length > 8,
      `C5 CONTROL: only ${declared.length} pair(s) were parsed out of ${PRED1}'s c_expected — the `
      + 'parser has stopped matching and the comparison below would be vacuous');
    /* ⚠ SIZE-AGNOSTIC, since batch 4. This was `eaten.length >= 8 &&
       eaten.length % 4 === 0`, which assumed every batch consumes a multiple of
       four pairs — true of batches 2 and 3 (two tables each) and FALSE of batch
       4, which takes seventeen: 4+4+34 = 42 and 42 % 4 = 2. The control would
       then have gone red for a database in perfect order, which is the exact
       pressure the comment below warns about. What it is FOR is "the c_pairs
       parser is still reading the files", so that is what it asserts now. */
    ok(sweeps.length > 0, 'C5 CONTROL: no sweep migration files were found at all');
    for (const f of sweeps) {
      if (f === PRED1) continue;   // batch 1 SEEDS the class; it declares no c_pairs
      // A sweep that consumes NO baseline rows (batch 5 onward: default-ACL /
      // MAINTAIN / detector changes) declares no c_pairs BY DESIGN — gate the
      // requirement on whether the file actually deletes baseline rows, or this
      // arm goes red for a database in perfect order the day such a batch lands.
      const src = await (await import('node:fs/promises')).readFile(
        (await import('node:path')).join(
          (await import('./schema-replay.mjs')).ROOT, 'supabase', 'migrations', f), 'utf8');
      if (!/delete\s+from\s+public\.hr_client_write_baseline/i.test(src)) continue;
      ok((await declaredPairs(f, 'c_pairs')).length > 0,
        `C5 CONTROL: the c_pairs parser read ZERO pairs out of ${f}. A sweep batch that DELETES `
        + 'baseline rows but declares no pairs contributes nothing to the expected baseline below, so '
        + 'the comparison would demand rows the database is right not to have.');
    }
    ok(eaten.every((k) => /^[a-z0-9_]+:(anon|authenticated)$/.test(k)),
      `C5 CONTROL: the parser produced a malformed pair: ${eaten.filter((k) => !/^[a-z0-9_]+:(anon|authenticated)$/.test(k)).join(', ')}`);
    for (const t of RAID) {
      for (const g of ['anon', 'authenticated']) {
        ok(eaten.includes(`${t}:${g}`),
          `C5 CONTROL: ${t}:${g} is not among the pairs the sweep files declare they consume, so `
          + "the derivation below is not reading THIS file's own c_pairs array.");
      }
    }
    // ⚠ UP-TO-SELF. This guard boots the chain only THROUGH batch 3 (run()'s
    // upTo, so batch 5's global MAINTAIN sweep cannot mask a mutation here), so
    // the live baseline reflects what batches 1..3 consumed — not the whole
    // programme. Compute the expected set the same way: subtract only the c_pairs
    // of sweep files at or before this one in the apply order. The forward-looking
    // "the whole programme empties the baseline" check is owned by the LAST
    // consuming batch's guard (batch 4) and by batch 5's guard.
    const _order = JSON.parse(await (await import('node:fs/promises')).readFile(
      (await import('node:path')).join((await import('./schema-replay.mjs')).ROOT,
        'tests', 'schema-apply-order.json'), 'utf8')).order;
    const _selfPos = _order.indexOf(MIG);
    const _eatenSelf = new Set();
    for (const f of sweeps) {
      const pos = _order.indexOf(f);
      if (pos >= 0 && pos <= _selfPos) for (const k of await declaredPairs(f, 'c_pairs')) _eatenSelf.add(k);
    }
    const want = declared.filter((k) => !_eatenSelf.has(k)).sort();
    ok(JSON.stringify(based) === JSON.stringify(want),
      `C5: the baseline is not "batch 1's declared class minus everything batches up to and `
      + `including batch 3 consume" (of ${sweeps.length} sweep file(s) on disk).\n`
      + `    baseline only: ${based.filter((k) => !want.includes(k)).join(', ') || '(none)'}\n`
      + `    expected only: ${want.filter((k) => !based.includes(k)).join(', ') || '(none)'}`);

    // Batch 1's invariant, re-measured: the declared baseline and the live class
    // must agree EXACTLY, in both directions. A class member the baseline does
    // not name is a permanent detector failure; a baseline row with no live
    // grant is a claim that outlived its subject.
    const classNow = (await db.query(`
      select g.table_name || ':' || g.grantee as k
        from information_schema.role_table_grants g
        join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
       where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
         and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
         and not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename = g.table_name
                            and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       group by 1 order by 1`)).rows.map((x) => x.k);
    /* ⚠ THE CLASS IS ALLOWED TO BE EMPTY, since batch 4 — and this control had
       to change with it. It used to be `classNow.length > 0`, whose purpose was
       "the class predicate has not gone blind". Batch 4 sweeps the last
       seventeen tables, so an EMPTY class is now the correct end state and that
       assertion would fail on a FINISHED programme. The property is therefore
       proven directly: plant a table with RLS on, no write policy and an
       authenticated INSERT grant, and demand the very same query NAMES it. That
       tests the predicate rather than the size of its output. */
    await db.query('savepoint clsprobe');
    await db.query('create table public.hr__c5_probe (id int primary key)');
    await db.query('alter table public.hr__c5_probe enable row level security');
    await db.query('revoke all on public.hr__c5_probe from public, anon, authenticated, service_role');
    await db.query('grant insert on public.hr__c5_probe to authenticated');
    const probed = (await db.query(`
      select g.table_name || ':' || g.grantee as k
        from information_schema.role_table_grants g
        join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
       where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
         and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
         and not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename = g.table_name
                            and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       group by 1`)).rows.map((x) => x.k);
    await db.query('rollback to savepoint clsprobe');
    await db.query('release savepoint clsprobe').catch(() => {});
    ok(probed.includes('hr__c5_probe:authenticated'),
      'C5 CONTROL: the dead-grant class predicate did NOT name a freshly-created table with RLS '
      + 'on, no write policy and an authenticated INSERT grant. The predicate has gone blind, so '
      + `every comparison in this arm is vacuous. saw=${probed.join(', ') || '(nothing)'}`);
    ok(JSON.stringify(classNow) === JSON.stringify(based),
      `C5: the declared baseline and reality disagree.\n    class only: `
      + `${classNow.filter((k) => !based.includes(k)).join(', ') || '(none)'}\n    baseline only: `
      + `${based.filter((k) => !classNow.includes(k)).join(', ') || '(none)'}`);
    log(`  ok   C5  baseline is ${based.length} (batch 1's list − batches 2 and 3), holds neither `
      + 'raid table, and matches the live class exactly');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  /* ── C6 · RE-APPLYING BATCH 1 DOES NOT RESURRECT THE ROWS ────────────────
     Batch 1 is SAFE TO RE-RUN and seeds hr_client_write_baseline from its own
     21-entry list. If its seed were unconditional, a re-run would put the four
     rows straight back and quietly re-exempt two swept tables. It is conditional
     on the pair being IN the class — so it must seed nothing.

     ⚠ SINCE BATCH 4 THERE ARE TWO ACCEPTABLE OUTCOMES, and it is worth being
     precise about why rather than widening the arm. Batch 1's §2 carries its own
     control — "the dead-grant class is EMPTY on this database … investigate
     before removing this control" — which RAISES. That control was written when
     an empty class could only mean a blind predicate. Batch 4 sweeps the last
     seventeen tables, so on a finished chain the class really is empty and batch
     1's control now fires for a TRUE reason: a loud, deliberate stop that
     applies nothing. Nothing is resurrected because nothing is applied, which is
     a STRONGER outcome than "warns and seeds nothing", not a weaker one.

     The invariant this arm actually owns is unchanged and is asserted on BOTH
     paths: after the re-run attempt, no swept pair is back and the baseline is
     the size it was. The two paths are distinguished and reported, so a batch 1
     that started refusing for the WRONG reason still shows up in the log rather
     than being absorbed by a try/catch. */
  try {
    const before = (await db.query(
      'select count(*)::int as n from public.hr_client_write_baseline')).rows[0].n;
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { ROOT } = await import('./schema-replay.mjs');
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', PRED1), 'utf8'))
      .replace(/\r\n/g, '\n');
    await db.query('savepoint pred');
    let refusal = null;
    try { await db.exec(sql); } catch (e) { refusal = String(e.message || e).split('\n')[0]; }
    if (refusal) {
      // The transaction is aborted by the raise; unwind before reading anything.
      await db.query('rollback to savepoint pred');
      ok(/the dead-grant class is EMPTY/i.test(refusal),
        `C6: re-applying ${PRED1} aborted, but NOT with its empty-class control. Batch 1 is `
        + `supposed to be safe to re-run; this is a different failure: ${refusal}`);
      await db.query('savepoint pred');
    }
    const after = (await db.query(
      'select count(*)::int as n from public.hr_client_write_baseline')).rows[0].n;
    const back = (await db.query(
      'select count(*)::int as n from public.hr_client_write_baseline '
      + "where table_name in ('raid_claims','raid_contributions')")).rows[0].n;
    ok(back === 0,
      `C6: re-applying ${PRED1} RESURRECTED ${back} swept baseline row(s). The predecessor's seed `
      + 'has become unconditional, which silently re-exempts every table any later batch sweeps.');
    ok(after === before, `C6: the baseline changed size on a predecessor re-run (${before} -> ${after})`);
    await db.query('rollback to savepoint pred');
    log(`  ok   C6  a batch-1 re-run ${refusal ? 'REFUSES (its empty-class control, now true — '
      + 'batch 4 swept the last of them)' : 'warns and seeds nothing'} — the swept rows stay gone`);
  } catch (e) {
    await db.query('rollback to savepoint pred').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  await db.query('rollback').catch(() => {});
  await db.close?.();

  // ── C7 · THE REFUSE-TO-INSTALL CHECKS ACTUALLY REFUSE ────────────────
  // Each scenario boots the WHOLE chain again with the hostile state planted in
  // a predecessor, and demands the migration abort with the message that names
  // the real problem — not merely abort, which any typo achieves.
  for (const [id, sc] of Object.entries(SCENARIOS)) {
    const p = mergePatches(patches,
      new Map([[sc.file, [[sc.anchor, `${sc.sql}\n${sc.anchor}`]]]]));
    let msg = null;
    try {
      const boot = await bootReplay({ patches: p, upTo: MIG });
      await boot.db.close?.();
    } catch (e) {
      if (e.harness) throw e;
      msg = String(e.message || e);
    }
    try {
      ok(msg !== null,
        `C7/${id}: the migration APPLIED CLEANLY with the hostile state planted (${sc.why}). `
        + 'Its refuse-to-install check is not refusing.');
      ok(sc.expect.test(msg),
        `C7/${id}: the migration aborted, but not for the stated reason. Expected a message `
        + `matching ${sc.expect}, got: ${msg.split('\n').slice(0, 2).join(' / ')}`);
      log(`  ok   C7  ${id} — refused, by name`);
    } catch (e) { if (!(e instanceof Red)) throw e; }
  }

  return { checks, fails };
}

// ── THE GUARD SEAM ─────────────────────────────────────────────────────────
/** Run the whole file and return the problems, for tests/run-smoke.mjs. */
export async function clientWriteSweep3Guard() {
  checks = 0; fails = 0; problems = []; quiet = true;
  try {
    await run();
    return problems;
  } catch (e) {
    return [`client-write-sweep-3 guard failed to run — ${e?.message || e}`];
  } finally { quiet = false; }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

/** Union two filename -> [[find,repl]] maps without either losing entries. */
function mergePatches(a, b) {
  const out = new Map();
  for (const m of [a, b]) {
    if (!m) continue;
    for (const [k, v] of m) out.set(k, [...(out.get(k) || []), ...v]);
  }
  return out;
}

const patchesFor = (id) => {
  const ids = [id, ...(MUTATIONS[id].withAlso ? [MUTATIONS[id].withAlso] : [])];
  const m = new Map();
  for (const i of ids) {
    const mu = MUTATIONS[i];
    if (!m.has(mu.migration)) m.set(mu.migration, []);
    m.get(mu.migration).push([mu.find, mu.repl]);
  }
  return m;
};

const main = async () => {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) log(`${id}\n    (${m.migration}) ${m.why}\n`);
    return 0;
  }

  const mut = argv.find((a) => a.startsWith('--mutate='))?.slice(9);
  if (mut) {
    if (!MUTATIONS[mut]) { log(`unknown mutation: ${mut}`); return 2; }
    log(`── MUTATION ${mut} ──`);
    try {
      const r = await run({ patches: patchesFor(mut) });
      log(r.fails ? `CAUGHT (${r.fails} red)` : 'SLIPPED');
      return r.fails ? 0 : 1;
    } catch (e) {
      if (e.harness) { log(`HARNESS: ${e.message}`); return 2; }
      log('CAUGHT — the migration refused to install itself:\n'
        + `${String(e.message).split('\n').slice(0, 3).map((l) => `    ${l}`).join('\n')}`);
      return 0;
    }
  }

  if (argv.includes('--selftest')) {
    const slipped = [];
    for (const id of Object.keys(MUTATIONS)) {
      checks = 0; fails = 0;
      let caught = false;
      try {
        const r = await run({ patches: patchesFor(id) });
        caught = r.fails > 0;
      } catch (e) {
        if (e.harness) { log(`HARNESS on ${id}: ${e.message}`); return 2; }
        caught = true;   // the migration's own preconditions refused it
      }
      log(`${caught ? 'CAUGHT ' : 'SLIPPED'}  ${id}`);
      if (!caught) slipped.push(id);
    }
    if (slipped.length) {
      log(`\n${slipped.length} mutation(s) SLIPPED: ${slipped.join(', ')}`);
      log('A guard that cannot demonstrate it sees failure is broken, not passing.');
      return 1;
    }
    log(`\nall ${Object.keys(MUTATIONS).length} mutations caught`);
    return 0;
  }

  log('Client write grant sweep — batch 3 (raid_claims, raid_contributions + the MAINTAIN pass)');
  const r = await run();
  log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
  return r.fails ? 1 : 0;
};

/* ⚠ MAIN-ONLY. This module is IMPORTED by tests/run-smoke.mjs, and a top-level
   run on import would boot a second PostgreSQL nobody asked for. */
const isMain = import.meta.url
  === (await import('node:url')).pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e.harness || e.replay ? e.message : e);
    process.exit(e.harness ? 2 : 1);
  });
}
