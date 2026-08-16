#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-write-sweep-2.mjs — BATCH 2 OF THE CLIENT WRITE GRANT SWEEP,
//                                  PROVEN BY EXECUTION.
//
// THE CLAIM UNDER TEST, in one line:
//   after 2026-08-16-client-write-grant-sweep-2.sql, neither anon nor
//   authenticated holds ANY write privilege on display_names or
//   leaderboard_meta — MAINTAIN included, which information_schema cannot see —
//   the four baseline rows are GONE, and BOTH CONFIRMED WRITERS STILL WORK when
//   driven for real.
//
// Everything runs against a real PostgreSQL (PGlite/WASM, in process) with THE
// WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json, so
// the migration's own self-verifying blocks (§0 refuse-to-install, §2 full
// privilege vocabulary, §3 execute-the-refusal, §4 detector-clean) EXECUTE on
// every run of this file. Production is never touched.
//
// ── WHY "THE WRITER STILL WORKS" IS DRIVEN AND NOT REASONED ─────────────
// "A SECURITY DEFINER function executes as its owner, so revoking the caller's
// grants cannot break it" is TRUE and is still not evidence. The A9 retrofit in
// 2026-08-11-authenticated-surface-lockdown.sql wraps these RPCs — the wrapper
// is what `authenticated` executes and the __ungated body is what does the work
// — so the property actually depends on the OWNERSHIP OF TWO FUNCTIONS and on
// the wrapper's own definer flag. S2 below plants exactly that defect (the
// writer made SECURITY INVOKER) and the drive is the only arm that catches it.
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · The PostgREST request path. `set local role authenticated` is how the
//     role arrives at the table, which is the seam the grant lives on, but it
//     is not an HTTP request.
//   · Production's grants. The replay reconstructs the chain; what production
//     actually holds is tests/schema-drift.mjs's --live mode and was measured
//     by hand for this batch (both tables: anon=arwdm, authenticated=arwdm).
//   · TRUE CONCURRENCY. PGlite is one backend, and nothing here needs it.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/client-write-sweep-2.mjs --list       the mutation catalogue
//   node tests/client-write-sweep-2.mjs --selftest   every mutation must be CAUGHT
//   node tests/client-write-sweep-2.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-16-client-write-grant-sweep-2.sql';
const PRED = '2026-08-16-client-write-grant-sweep.sql';

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   The two the task names explicitly are `revoke_half_applied` and
   `baseline_row_left_behind`; the rest exist because a guard that only catches
   the defects it was asked about is a guard shaped around its own test. */
const MUTATIONS = {
  // ── THE TWO NAMED ARMS ────────────────────────────────────────────────
  revoke_half_applied: {
    migration: MIG,
    why: 'the revoke covers display_names and SILENTLY SKIPS leaderboard_meta — the shape a '
       + 'hand-written two-table sweep fails in. The baseline row is still deleted, so the '
       + 'surviving grant becomes INVISIBLE to the detector forever: strictly worse than never '
       + 'having swept it',
    find: "  c_tables constant text[] := array['display_names','leaderboard_meta'];\n  c_pairs",
    repl: "  c_tables constant text[] := array['display_names'];\n  c_pairs",
  },
  baseline_row_left_behind: {
    migration: MIG,
    why: 'the grants go but ONE baseline row stays. A baselined pair is a standing exemption: the '
       + 'next time anything re-grants that table the detector says nothing, which is the exact '
       + 'blindness the baseline was invented to remove',
    find: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2];\n  get diagnostics",
    repl: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2]\n     and not (b.table_name = 'leaderboard_meta' and b.grantee = 'anon');\n  get diagnostics",
  },

  // ── THE MEASUREMENT ITSELF ────────────────────────────────────────────
  maintain_left_behind: {
    migration: MIG,
    why: 'MAINTAIN is dropped from the revoke — the exact state batch 1 left its six catalogues '
       + 'in. information_schema cannot report MAINTAIN, so a sweep verified that way says "0 '
       + 'remain" with two live client privileges on the table',
    find: "      execute format('revoke maintain on public.%I from public, anon, authenticated', t);",
    repl: "      perform 1;",
  },
  verify_via_information_schema: {
    migration: MIG,
    why: 'the §2 verification is measured through information_schema instead of '
       + 'has_table_privilege. On its own that changes no grant — it removes the only instrument '
       + 'that can SEE one, which is why it is paired with maintain_left_behind in --selftest',
    find: "     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;\n  if v_left is not null then",
    repl: "     where exists (select 1 from information_schema.role_table_grants g\n"
        + "                    where g.table_schema='public' and g.table_name=tt\n"
        + "                      and g.grantee=gg and g.privilege_type=pp)) x;\n  if v_left is not null then",
    withAlso: 'maintain_left_behind',
  },
  select_collaterally_revoked: {
    migration: MIG,
    why: '`revoke all` instead of the enumerated verbs — the one-word "simplification" that takes '
       + 'SELECT with it and breaks the display-name lookup in src/features/identity.js and every '
       + 'board read, silently, on a file whose other checks would all stay green',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger '\n"
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
       + 'file rests on the grant being DEAD; with a write policy present the grant is LIVE, the '
       + 'revoke breaks a working feature, and nothing would say so',
    find: "      raise exception 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
  },
  unknown_writer_tolerated: {
    migration: MIG,
    why: 'a second writer of display_names appears and §0(c) shrugs. "The writer is confirmed" is '
       + 'the entire basis on which a batch is allowed to sweep',
    find: "    raise exception 'REFUSING TO INSTALL: public.display_names has writer(s) this file does not '",
    repl: "    raise warning 'REFUSING TO INSTALL: public.display_names has writer(s) this file does not '",
  },
};

/* ── THE HOSTILE PRECONDITIONS ──────────────────────────────────────────────
   §0 of the migration is four REFUSE-TO-INSTALL checks, and on a clean replay
   not one of them is ever reached — so downgrading any of them from `raise` to
   `warning` changed nothing and all three of those mutations SLIPPED on the
   first run of this file. A precondition that is never triggered is not tested;
   it is decorated.

   Each scenario below PLANTS the state the precondition exists for, by
   appending SQL to the PREDECESSOR migration (which applies immediately before
   this one), and asserts the migration REFUSES with the message that names the
   actual problem. C8 runs them; the three precondition mutations then have
   something to slip past, and do not. */
/* ⚠ THE ANCHOR CONTAINS NO `$$`, AND THAT IS NOT AESTHETIC. bootReplay applies
   a patch with String.prototype.replace, in which `$$` in the REPLACEMENT is an
   escape meaning a literal `$` — so anchoring on a dollar-quoted `end $$;` and
   re-emitting it silently produces `end $;` and the whole predecessor fails to
   apply with "unterminated dollar-quoted string". Measured: all three scenarios
   below aborted the chain one file EARLY and their assertions went red for a
   reason that had nothing to do with what they test. So the scenario SQL is
   spliced in at top level, between statements, on a comment line instead. */
const PRED_TAIL = '-- Said out loud at apply time, because the operator is the person most likely';
const SCENARIOS = {
  write_policy_present: {
    why: 'someone adds the obvious "let a player rename themselves" UPDATE policy to '
       + 'display_names. The grant is then LIVE, not dead, and revoking it breaks that path',
    sql: 'create policy "hr__mut rename" on public.display_names for update using (true);',
    expect: /now carries a client WRITE policy/i,
  },
  unknown_writer_present: {
    why: 'a SECOND writer of display_names exists. "The writer is confirmed" is the entire basis '
       + 'on which a batch is allowed to sweep, and this file must not sweep past a writer it has '
       + 'never seen',
    sql: 'create function public.hr__mut_writer() returns void language plpgsql as $m$ begin '
       + 'update public.display_names set name = name where false; end $m$;\n'
       + 'revoke execute on function public.hr__mut_writer() from public, anon, authenticated;',
    expect: /has writer\(s\) this file does not know about/i,
  },
  baseline_row_already_absent: {
    why: 'another batch (or a re-run of this one) already consumed one of the four rows. This '
       + 'file is then reasoning about a state that no longer exists, and must stop rather than '
       + 'apply half of a change somebody else owns',
    sql: "delete from public.hr_client_write_baseline where table_name = 'leaderboard_meta' "
       + "and grantee = 'anon';",
    expect: /already absent/i,
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

const UID = '00000000-0000-4000-b354-0000000000d1';
const UID2 = '00000000-0000-4000-b354-0000000000d2';

/* ⚠ `reset role` is best-effort in the finally. If the wrapped statement raised,
   the transaction is ABORTED and `reset role` raises 25P02 too — from a finally
   block, which REPLACES the real error with a housekeeping one and makes every
   assertion downstream report the wrong cause. Callers that expect a failure
   use probeWrite(), which rolls back to a savepoint instead. */
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

/** Every privilege PG17+ knows about, asked the only way that can see MAINTAIN. */
const PRIVS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
async function clientPrivs(db, table) {
  const out = [];
  for (const g of ['anon', 'authenticated']) {
    for (const p of PRIVS) {
      const [{ h }] = (await db.query(
        'select has_table_privilege($1, $2, $3) as h', [g, `public.${table}`, p])).rows;
      if (h) out.push(`${table}:${g}:${p}`);
    }
  }
  return out;
}

/** Attempt a client write and classify the refusal. The MESSAGE, not the SQLSTATE:
 *  a missing grant and an RLS refusal are BOTH 42501, so a test that asserted the
 *  code would pass identically against an un-swept database. */
async function probeWrite(db, role, table) {
  const sql = table === 'display_names'
    ? "insert into public.display_names (canonical, user_id, name) "
      + "values ('hr  sweep2 probe', '00000000-0000-0000-0000-000000000000'::uuid, 'probe')"
    : 'insert into public.leaderboard_meta (id, refreshed_at) values (1, now())';
  await db.query('savepoint hrp');
  let verdict;
  try {
    await db.query(`set local role ${role}`);
    await db.query(sql);
    verdict = 'PERMITTED';
    await db.query('rollback to savepoint hrp');   // a permitted write is UNDONE
  } catch (e) {
    const m = String(e && e.message || e);
    // ROLLBACK TO SAVEPOINT is the only statement an aborted transaction
    // accepts, and it also restores the `set local role` to what it was.
    await db.query('rollback to savepoint hrp');
    verdict = /permission denied for table/i.test(m) ? 'NO_GRANT'
      : /row-level security/i.test(m) ? 'RLS_ONLY'
        : `OTHER: ${m.split('\n')[0]}`;
  }
  await db.query('release savepoint hrp').catch(() => {});
  await db.query('reset role').catch(() => {});
  return verdict;
}

/** Every `[ 'table', 'grantee' ]` literal inside the named array declaration in
 *  `sql`, or [] if the declaration is not there.
 *  ⚠ `\s+` before `constant`, not one space: both sweep files align the keyword
 *    in a declaration block, so `c_pairs  constant` carries two. */
function pairsIn(sql, decl) {
  const block = sql.match(
    new RegExp(`${decl}\\s+constant text\\[\\]\\[\\] := array\\[([\\s\\S]*?)\\];`));
  if (!block) return [];
  return [...block[1].matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z]+)'\s*\]/g)]
    .map((m) => `${m[1]}:${m[2]}`);
}

/** The (table, grantee) pairs the PREDECESSOR declares in its c_expected array. */
async function predecessorPairs() {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  return pairsIn(await readFile(join(ROOT, 'supabase', 'migrations', PRED), 'utf8'), 'c_expected');
}

/* ── EVERY PAIR ANY BATCH DECLARES IT CONSUMES ─────────────────────────────
   ⚠ REVISION (batch 3). This used to be `declared.length - 4` — the four rows
   THIS file consumes, typed. That is correct exactly until a LATER batch lands,
   and batch 3 landing turned this arm red for a database that was in perfect
   order: the baseline had shrunk by eight because two sweeps had run, which is
   the direction the list is supposed to move. A guard that fails when the
   programme it guards makes progress gets loosened, and a loosened guard is the
   b339 failure mode.
   So the expected baseline is now DERIVED end to end: batch 1's declared class,
   minus the union of every `c_pairs` array declared by every sweep batch in the
   migrations directory. It stays true when batch 4 lands, and it is a statement
   about the files agreeing with the database rather than about a number. */
async function consumedPairs() {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = (await readdir(dir))
    .filter((f) => /client-write-grant-sweep(-\d+)?\.sql$/.test(f)).sort();
  const out = new Set();
  for (const f of files) {
    for (const k of pairsIn(await readFile(join(dir, f), 'utf8'), 'c_pairs')) out.add(k);
  }
  return { pairs: [...out], files };
}

async function seedUsers(db) {
  for (const u of [UID, UID2]) {
    await db.query("insert into auth.users (id) values ($1) on conflict do nothing", [u]);
    await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [u]);
  }
}

/* The rate gate is REAL — hr_rpc_gate refuses a burst of claims — so it is
   cleared between drives. Named exactly (public.hr_rate_counters,
   2026-08-11-player-state.sql:694) rather than swept with a try/catch over
   candidate names: a failed statement ABORTS the surrounding transaction, and a
   swallowed error would then surface as an unrelated 25P02 three arms later. */
async function clearGate(db) {
  await db.query('delete from public.hr_rate_counters');
}

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run({ patches } = {}) {
  // upTo: MIG — validate the state AS OF batch 2, isolated from batch 5's global
  // MAINTAIN sweep, which runs last and would silently correct (and hide) a
  // MAINTAIN-left-behind mutation planted here.
  const { db } = await bootReplay({ patches, upTo: MIG });
  await db.query('begin');
  await seedUsers(db);

  // ── C1 · ZERO CLIENT WRITE PRIVILEGE SURVIVES, MAINTAIN INCLUDED ──────
  try {
    for (const t of ['display_names', 'leaderboard_meta']) {
      const left = await clientPrivs(db, t);
      ok(left.length === 0,
        `C1: client write privilege(s) survive the sweep on ${t}: ${left.join(', ')}`);
    }
    // …and SELECT is still there. A sweep that took the read with it would break
    // the name lookup and every board, and no other arm here would notice.
    for (const t of ['display_names', 'leaderboard_meta']) {
      for (const g of ['anon', 'authenticated']) {
        const [{ h }] = (await db.query(
          'select has_table_privilege($1, $2, $3) as h', [g, `public.${t}`, 'SELECT'])).rows;
        ok(h, `C1: SELECT was collaterally revoked from ${g} on ${t} — these tables are `
             + 'world-readable by the design of their own migrations');
      }
    }
    log('  ok   C1  no client write privilege on either table (7-privilege vocabulary); SELECT intact');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C2 · THE POSITIVE CONTROL. The measurement can SEE a grant. ───────
  // Without this, C1 passes on a database where has_table_privilege stopped
  // answering, or where the tables were renamed out from under it.
  try {
    await db.query('grant insert, update on public.display_names to authenticated');
    if ((await db.query("select current_setting('server_version_num')::int >= 170000 as m")).rows[0].m) {
      await db.query('grant maintain on public.leaderboard_meta to anon');
    }
    const dn = await clientPrivs(db, 'display_names');
    ok(dn.includes('display_names:authenticated:INSERT') && dn.includes('display_names:authenticated:UPDATE'),
      `C2 CONTROL: a freshly granted INSERT/UPDATE was NOT reported — the measurement in C1 is `
      + `blind, so its "clean" means nothing. saw=${dn.join(', ') || '(none)'}`);
    const lm = await clientPrivs(db, 'leaderboard_meta');
    ok(lm.includes('leaderboard_meta:anon:MAINTAIN'),
      `C2 CONTROL: a freshly granted MAINTAIN was NOT reported. This is the privilege `
      + `information_schema cannot see and the reason C1 uses has_table_privilege. saw=`
      + `${lm.join(', ') || '(none)'}`);

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
      'C2: display_names was re-granted an authenticated INSERT with RLS on and no write policy, '
      + 'and hr_assert_grant_hygiene STRICT returned normally. Since sweep-2 deleted its baseline '
      + 'row, this is precisely the case the detector now has to catch — the nightly cron run '
      + 'would have reported success.');
    const [{ r }] = (await db.query('select public.hr_assert_grant_hygiene(false) as r')).rows;
    ok(JSON.stringify(r.client_truncate_grants).includes('display_names:authenticated:INSERT'),
      `C2: the detector did not NAME the re-granted table. report=${JSON.stringify(r.client_truncate_grants)}`);

    await db.query('revoke insert, update on public.display_names from authenticated');
    await db.query('revoke maintain on public.leaderboard_meta from anon').catch(() => {});
    await db.query('select public.hr_assert_grant_hygiene(true)');
    log('  ok   C2  the measurement sees a grant, and a re-grant is FATAL now the exemption is gone');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C3 · THE DOOR IS SHUT, AND THE PROBE CAN TELL WHICH DOOR ─────────
  // The pre-state arm the migration itself cannot run: re-grant, probe (must
  // report RLS_ONLY — the grant is there and only RLS is holding it), revoke,
  // probe again (must report NO_GRANT). A probe that returned the same verdict
  // either way would make the migration's §3 vacuous.
  try {
    for (const t of ['display_names', 'leaderboard_meta']) {
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

  // ── C4 · THE CONFIRMED WRITER STILL WORKS — display_names ────────────
  // Driven end to end as a real signed-in player through the real A9 wrapper:
  // claim → row lands → rename moves the primary key → a rival cannot take it →
  // profiles.display_name (what the boards render) is kept in step.
  try {
    await clearGate(db);
    const claim = async (uid, name) => {
      await clearGate(db);
      return (await asUser(db, uid, 'select public.claim_display_name($1) as r', [name])).rows[0].r;
    };

    const r1 = await claim(UID, 'Ironvale');
    ok(r1 && r1.ok === true,
      `C4: claim_display_name was refused AFTER the sweep: ${JSON.stringify(r1)}. The revoke was `
      + 'supposed to be invisible to the only writer.');
    const [{ n }] = (await db.query(
      'select count(*)::int as n from public.display_names where user_id = $1 and canonical = $2',
      [UID, 'ironvale'])).rows;
    ok(n === 1, 'C4: claim_display_name returned ok but wrote no row — the write is being reported '
                + 'rather than performed');
    const [{ p }] = (await db.query(
      'select display_name as p from public.profiles where id = $1', [UID])).rows;
    ok(p === 'Ironvale',
      `C4: profiles.display_name is "${p}" — the writer no longer keeps the field the leaderboard `
      + 'renders in step, which would be a silent half-write');

    // RENAME — the UPDATE path, i.e. the privilege the dead grant carried.
    const r2 = await claim(UID, 'Ironvale Keep');
    ok(r2 && r2.ok === true && r2.renamed === true,
      `C4: the rename path (UPDATE) failed after the sweep: ${JSON.stringify(r2)}`);
    const [{ c }] = (await db.query(
      'select canonical as c from public.display_names where user_id = $1', [UID])).rows;
    ok(c === 'ironvale keep', `C4: the rename did not move the primary key (canonical=${c})`);

    // The namespace still arbitrates: a second player cannot take a held name.
    const r3 = await claim(UID2, 'Ironvale Keep');
    ok(r3 && r3.ok === false && r3.error === 'taken',
      `C4: a rival's claim on a held name returned ${JSON.stringify(r3)}, expected taken. The `
      + 'sweep must not have loosened the one property this table exists for.');

    // And the VALIDATION that only exists inside the RPC still bites — the
    // reason a direct client UPDATE on this table would be impersonation.
    const r4 = await claim(UID2, 'Moderator');
    ok(r4 && r4.ok === false && r4.reason === 'reserved',
      `C4: "Moderator" was accepted (${JSON.stringify(r4)}). The reserved list lives ONLY in `
      + 'claim_display_name, which is exactly why the table may not be client-writable.');
    log('  ok   C4  claim / rename / collision / reserved-name all still work through the RPC');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C5 · THE CONFIRMED WRITER STILL WORKS — leaderboard_meta ─────────
  try {
    const at0 = (await db.query(
      'select refreshed_at as a from public.leaderboard_meta where id = 1')).rows[0].a;
    ok(at0, 'C5: leaderboard_meta has no row 1 — the fixture is wrong, not the sweep');

    const r = (await db.query('select public.hr_leaderboard_refresh(true) as r')).rows[0].r;
    ok(r && r.ok === true,
      `C5: hr_leaderboard_refresh was refused after the sweep: ${JSON.stringify(r)}`);
    ok(r.refreshed === true,
      `C5: the forced refresh reported refreshed=false (${JSON.stringify(r)}) — it fell into the `
      + 'error path, which is what a lost write privilege would look like');
    const at1 = (await db.query(
      'select refreshed_at as a from public.leaderboard_meta where id = 1')).rows[0].a;
    ok(new Date(at1) > new Date(at0),
      `C5: refreshed_at did not advance (${at0} -> ${at1}). The staleness gate is now permanently `
      + 'shut and the boards would never refresh again.');

    // And the client-reachable path that reaches it (hr_leaderboard is the only
    // anon-callable RPC in the whole schema) still answers.
    await clearGate(db);
    const lb = (await asRole(db, 'anon',
      "select public.hr_leaderboard('total_level', 5, 1) as r")).rows[0].r;
    ok(lb && lb.ok === true,
      `C5: hr_leaderboard (the client's only route to the refresher) failed: ${JSON.stringify(lb)}`);
    log('  ok   C5  hr_leaderboard_refresh still advances the gate; hr_leaderboard still answers');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C6 · THE BASELINE SHRANK BY EXACTLY FOUR, AND MATCHES REALITY ────
  try {
    const based = (await db.query(
      'select table_name || \':\' || grantee as k from public.hr_client_write_baseline order by 1'))
      .rows.map((x) => x.k);
    for (const k of ['display_names:anon', 'display_names:authenticated',
      'leaderboard_meta:anon', 'leaderboard_meta:authenticated']) {
      ok(!based.includes(k),
        `C6: ${k} is STILL BASELINED after the sweep. A baselined pair is a standing exemption — `
        + 'the next re-grant of that table would be invisible to the detector.');
    }
    /* ⚠ NO HARDCODED COUNT (CLAUDE.md b339: "DO NOT WRITE A COUNT HERE" — three
       different wrong numbers shipped in prose about this exact allowlist). The
       expected SET is DERIVED: the predecessor's declared c_expected class,
       minus the union of every pair every sweep batch declares it consumes. See
       consumedPairs() for why this is no longer `declared.length - 4`. */
    const declared = await predecessorPairs();
    const { pairs: eaten, files: sweeps } = await consumedPairs();
    ok(declared.length > 4,
      `C6 CONTROL: only ${declared.length} pair(s) were parsed out of ${PRED}'s c_expected — the `
      + 'parser has stopped matching and the comparison below would be vacuous');
    /* ⚠ SIZE-AGNOSTIC, since b354/batch-4. This control used to read
       `eaten.length >= 4 && eaten.length % 4 === 0`, which quietly assumed every
       batch consumes a multiple of four pairs — true of batches 2 and 3 (two
       tables each) and FALSE of batch 4, which takes seventeen. 4+4+34 = 42, and
       42 % 4 = 2, so the control would have gone red for a database in perfect
       order: the same failure this arm's own header warns about, one level up.
       What the control is actually for is "the c_pairs parser is still reading
       the files", so THAT is what it now asserts — every sweep file on disk must
       contribute at least one well-formed pair, whatever its size. */
    ok(sweeps.length > 0, 'C6 CONTROL: no sweep migration files were found at all');
    for (const f of sweeps) {
      const src = await (await import('node:fs/promises')).readFile(
        (await import('node:path')).join(
          (await import('./schema-replay.mjs')).ROOT, 'supabase', 'migrations', f), 'utf8');
      const n = (await pairsIn(src, 'c_pairs')).length;
      // A sweep that consumes NO baseline rows (batch 5 onward: default-ACL /
      // MAINTAIN / detector changes) declares no c_pairs BY DESIGN — gate the
      // requirement on whether the file actually deletes baseline rows.
      const consumes = /delete\s+from\s+public\.hr_client_write_baseline/i.test(src);
      ok(f === PRED || !consumes || n > 0,
        `C6 CONTROL: the c_pairs parser read ZERO pairs out of ${f}. A sweep batch that DELETES `
        + 'baseline rows but declares no pairs contributes nothing to the expected baseline below, so '
        + 'the comparison would demand rows the database is right not to have.');
    }
    ok(eaten.every((k) => /^[a-z0-9_]+:(anon|authenticated)$/.test(k)),
      `C6 CONTROL: the parser produced a malformed pair: ${eaten.filter((k) => !/^[a-z0-9_]+:(anon|authenticated)$/.test(k)).join(', ')}`);
    for (const k of ['display_names:anon', 'display_names:authenticated',
      'leaderboard_meta:anon', 'leaderboard_meta:authenticated']) {
      ok(eaten.includes(k),
        `C6 CONTROL: ${k} is not among the pairs the sweep files declare they consume, so the `
        + 'derivation below is not reading THIS file\'s own c_pairs array.');
    }
    // ⚠ UP-TO-SELF. This guard boots the chain only THROUGH batch 2 (run()'s
    // upTo, so batch 5's global MAINTAIN sweep cannot mask a mutation here), so
    // the live baseline reflects what batches 1..2 consumed — not the whole
    // programme. Compute the expected set the same way: subtract only the c_pairs
    // of sweep files at or before this one in the apply order. The forward-looking
    // "whole programme empties the baseline" check is owned by the LAST consuming
    // batch's guard (batch 4) and by batch 5's guard.
    const _fs = await import('node:fs/promises');
    const _path = await import('node:path');
    const { ROOT: _ROOT } = await import('./schema-replay.mjs');
    const _order = JSON.parse(await _fs.readFile(
      _path.join(_ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
    const _selfPos = _order.indexOf(MIG);
    const _eatenSelf = new Set();
    for (const f of sweeps) {
      const pos = _order.indexOf(f);
      if (pos < 0 || pos > _selfPos) continue;
      const src = await _fs.readFile(_path.join(_ROOT, 'supabase', 'migrations', f), 'utf8');
      for (const k of await pairsIn(src, 'c_pairs')) _eatenSelf.add(k);
    }
    const want = declared.filter((k) => !_eatenSelf.has(k)).sort();
    ok(JSON.stringify(based) === JSON.stringify(want),
      `C6: the baseline is not "${PRED}'s declared class minus everything batches up to and `
      + `including batch 2 consume" (of ${sweeps.length} sweep file(s) on disk).\n    baseline only: `
      + `${based.filter((k) => !want.includes(k)).join(', ') || '(none)'}\n    expected only: `
      + `${want.filter((k) => !based.includes(k)).join(', ') || '(none)'}`);

    // The predecessor's own invariant, re-measured: the declared baseline and
    // the live class must agree EXACTLY, in both directions. A class member the
    // baseline does not name is a permanent detector failure; a baseline row
    // with no live grant is a claim that outlived its subject.
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
       assertion would fail on a finished programme. The property is therefore
       proven directly instead: plant a table with RLS on, no write policy and an
       authenticated INSERT grant, and demand the very same query NAMES it. That
       tests the predicate rather than the size of its output. */
    await db.query('savepoint clsprobe');
    await db.query('create table public.hr__c6_probe (id int primary key)');
    await db.query('alter table public.hr__c6_probe enable row level security');
    await db.query('revoke all on public.hr__c6_probe from public, anon, authenticated, service_role');
    await db.query('grant insert on public.hr__c6_probe to authenticated');
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
    ok(probed.includes('hr__c6_probe:authenticated'),
      'C6 CONTROL: the dead-grant class predicate did NOT name a freshly-created table with RLS '
      + 'on, no write policy and an authenticated INSERT grant. The predicate has gone blind, so '
      + `every comparison in this arm is vacuous. saw=${probed.join(', ') || '(nothing)'}`);
    ok(JSON.stringify(classNow) === JSON.stringify(based),
      `C6: the declared baseline and reality disagree.\n    class only: `
      + `${classNow.filter((k) => !based.includes(k)).join(', ') || '(none)'}\n    baseline only: `
      + `${based.filter((k) => !classNow.includes(k)).join(', ') || '(none)'}`);
    log(`  ok   C6  baseline is ${based.length} (declared − every batch's consumed pairs), holds `
      + 'neither swept table, and matches the live class exactly');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C7 · RE-APPLYING THE PREDECESSOR DOES NOT RESURRECT THE ROWS ─────
  // The predecessor is SAFE TO RE-RUN and seeds hr_client_write_baseline from
  // its own 21-entry list. If its seed were unconditional, a re-run would put
  // the four rows straight back and quietly re-exempt two swept tables. It is
  // conditional on the pair being IN the class — so it must warn and seed
  // nothing. Asserted, because the whole reason sweep-2 does not edit the
  // predecessor is that this behaviour is already correct.
  //
  // ⚠ SINCE BATCH 4 THERE ARE TWO ACCEPTABLE OUTCOMES. Batch 1's §2 carries its
  // own control — "the dead-grant class is EMPTY on this database … investigate
  // before removing this control" — which RAISES, and which was written when an
  // empty class could only mean a blind predicate. Batch 4 sweeps the last
  // seventeen tables, so on a finished chain the class really is empty and that
  // control now fires for a TRUE reason: a loud, deliberate stop that applies
  // nothing. Nothing is resurrected because nothing is applied, which is a
  // STRONGER outcome than "warns and seeds nothing". The invariant this arm owns
  // is asserted on both paths, and a refusal for any OTHER reason is still red.
  try {
    const before = (await db.query(
      'select count(*)::int as n from public.hr_client_write_baseline')).rows[0].n;
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { ROOT } = await import('./schema-replay.mjs');
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', PRED), 'utf8'))
      .replace(/\r\n/g, '\n');
    await db.query('savepoint pred');
    let refusal = null;
    try { await db.exec(sql); } catch (e) { refusal = String(e.message || e).split('\n')[0]; }
    if (refusal) {
      await db.query('rollback to savepoint pred');
      ok(/the dead-grant class is EMPTY/i.test(refusal),
        `C7: re-applying ${PRED} aborted, but NOT with its empty-class control. Batch 1 is supposed `
        + `to be safe to re-run; this is a different failure: ${refusal}`);
      await db.query('savepoint pred');
    }
    const after = (await db.query(
      'select count(*)::int as n from public.hr_client_write_baseline')).rows[0].n;
    const back = (await db.query(
      "select count(*)::int as n from public.hr_client_write_baseline "
      + "where table_name in ('display_names','leaderboard_meta')")).rows[0].n;
    ok(back === 0,
      `C7: re-applying ${PRED} RESURRECTED ${back} swept baseline row(s). The predecessor's seed `
      + 'has become unconditional, which silently re-exempts every table any later batch sweeps.');
    ok(after === before, `C7: the baseline changed size on a predecessor re-run (${before} -> ${after})`);
    await db.query('rollback to savepoint pred');
    log(`  ok   C7  a predecessor re-run ${refusal ? 'REFUSES (its empty-class control, now true — '
      + 'batch 4 swept the last of them)' : 'warns and seeds nothing'} — the swept rows stay gone`);
  } catch (e) {
    await db.query('rollback to savepoint pred').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  await db.query('rollback').catch(() => {});
  await db.close?.();

  // ── C8 · THE REFUSE-TO-INSTALL CHECKS ACTUALLY REFUSE ────────────────
  // Each scenario boots the WHOLE chain again with the hostile state planted in
  // the predecessor, and demands the migration abort with the message that
  // names the real problem — not merely abort, which any typo achieves.
  for (const [id, sc] of Object.entries(SCENARIOS)) {
    const p = mergePatches(patches, new Map([[PRED, [[PRED_TAIL, `${sc.sql}\n${PRED_TAIL}`]]]]));
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
        `C8/${id}: the migration APPLIED CLEANLY with the hostile state planted (${sc.why}). `
        + 'Its refuse-to-install check is not refusing.');
      ok(sc.expect.test(msg),
        `C8/${id}: the migration aborted, but not for the stated reason. Expected a message `
        + `matching ${sc.expect}, got: ${msg.split('\n').slice(0, 2).join(' / ')}`);
      log(`  ok   C8  ${id} — refused, by name`);
    } catch (e) { if (!(e instanceof Red)) throw e; }
  }

  return { checks, fails };
}

// ── THE GUARD SEAM ─────────────────────────────────────────────────────────
/** Run the whole file and return the problems, for tests/run-smoke.mjs. */
export async function clientWriteSweep2Guard() {
  checks = 0; fails = 0; problems = []; quiet = true;
  try {
    await run();
    return problems;
  } catch (e) {
    return [`client-write-sweep-2 guard failed to run — ${e?.message || e}`];
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

  log('Client write grant sweep — batch 2 (display_names, leaderboard_meta)');
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
