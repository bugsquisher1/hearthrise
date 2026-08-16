#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-write-sweep-4.mjs — BATCH 4 OF THE CLIENT WRITE GRANT SWEEP,
//                                  THE LAST ONE, PROVEN BY EXECUTION.
//
// THE CLAIM UNDER TEST, in three lines:
//   after 2026-08-16-client-write-grant-sweep-4.sql, neither anon nor
//   authenticated holds ANY write privilege on the seventeen remaining tables
//   (world_event_* ×3, clan_* ×12, maintenance_* ×2), all 34 baseline rows are
//   gone and public.hr_client_write_baseline is EMPTY;
//   …ALL FORTY-TWO CONFIRMED WRITERS still write, driven for real BEFORE and
//   AFTER the revoke on identical fixtures;
//   …and the two tables that carry a LIVE client write policy — clan_members
//   and clans — were NOT touched, because their grants are not dead.
//
// Everything runs against a real PostgreSQL (PGlite/WASM, in process) with THE
// WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json, so
// the migration's own self-verifying blocks (§0 refuse-to-install including the
// writer scan with its positive AND anchor controls, §2 full vocabulary, §3
// execute-the-refusal on all 34 pairs, §4 detector-clean with the probe control)
// EXECUTE on every run of this file. Production is never touched.
//
// ── WHY ALL SEVENTEEN IN ONE BATCH ──────────────────────────────────────
// They share ONE writer population — the clan/world-event RPC surface — and
// confirming that population is the expensive part and the point. Three files
// would mean deriving the same 42-function set three times, which is three
// chances to derive it differently.
//
// ── WHY "THE WRITERS STILL WORK" IS DRIVEN BEFORE **AND** AFTER ─────────
// "A SECURITY DEFINER function executes as its owner, so revoking the caller's
// grants cannot break it" is TRUE and is still not evidence. Batch 3 drove two
// writers after the revoke. Forty-two is a different problem: an after-only
// drive cannot distinguish "the revoke was harmless" from "this writer never
// worked on the replay in the first place". So C4 drives every one of them
// TWICE on the same fixtures — once with the pre-sweep ACL restored inside a
// savepoint, once on the swept database — and the two runs must agree writer for
// writer. And each drive is required to CHANGE ITS TARGET TABLE, measured by a
// row fingerprint: "the RPC answered ok" and "the RPC wrote" are different
// claims and only the second one is about a grant.
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · The PostgREST request path. `set local role authenticated` is how the role
//     arrives at the table, which is the seam the grant lives on, but it is not
//     an HTTP request.
//   · Production's grants. What production actually holds was measured by hand
//     for this batch: all 17 tables carry anon=arwdm/authenticated=arwdm, RLS on,
//     and NOT ONE write policy; the 42-writer set on production is byte-identical
//     to the replay's; and hr_client_write_baseline holds exactly the 34 rows.
//   · TRUE CONCURRENCY. PGlite is one backend, and nothing here needs it.
//   · ⚠ THE WALL CLOCK for two of the 42. world_event_join only writes while a
//     muster window is open (01:00-01:45 / 13:00-13:45 UTC) and
//     world_event_pledge only before its slot starts. Driving them only when the
//     wall clock allows would make this file green for twenty hours a day and red
//     for four, so the CLOCK is injected — and only the clock: both shims
//     DELEGATE to the real, renamed hr_muster_window / hr_rally_slot, which still
//     compute every window. Applied identically in both arms, so it cannot bias
//     the comparison. Everything else is driven against the real clock.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/client-write-sweep-4.mjs --list       the mutation catalogue
//   node tests/client-write-sweep-4.mjs --selftest   every mutation must be CAUGHT
//   node tests/client-write-sweep-4.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-16-client-write-grant-sweep-4.sql';
const PRED1 = '2026-08-16-client-write-grant-sweep.sql';
const PRED3 = '2026-08-16-client-write-grant-sweep-3.sql';

/** The seventeen, in the order the migration lists them. */
const T17 = ['world_event_joins', 'world_event_pledges', 'world_event_totals',
  'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_order_ballots',
  'clan_order_votes', 'clan_raids', 'clan_stores', 'clan_tavern', 'clan_withdrawals',
  'clan_work_labour', 'clan_work_orders', 'maintenance_alerts', 'maintenance_log'];

/** The two tables that carry a LIVE client write policy and are therefore NOT in
 *  the dead-grant class, never baselined, and must NOT be swept. */
const LIVE_POLICY = ['clan_members', 'clans'];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   The four the task names explicitly are `revoke_half_applied`,
   `baseline_row_left_behind`, `maintain_left_behind` and the new
   `live_policy_pair_revoked`; the rest exist because a guard that only catches
   the defects it was asked about is a guard shaped around its own test. */
const MUTATIONS = {
  // ── THE FOUR NAMED ARMS ───────────────────────────────────────────────
  revoke_half_applied: {
    migration: MIG,
    why: 'the revoke covers fifteen of the seventeen and SILENTLY SKIPS clan_ledger and '
       + 'clan_stores — the shape a hand-written seventeen-table sweep fails in, and it skips the '
       + 'table every clan daily cap is READ FROM. All 34 baseline rows are still deleted, so the '
       + 'two surviving grants become INVISIBLE to the detector forever: strictly worse than never '
       + 'having swept them',
    find: "    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',\n"
        + "    'clan_work_labour','clan_work_orders',\n"
        + "    'maintenance_alerts','maintenance_log'];\n"
        + "  /* ⚠ THE 34 PAIRS ARE DECLARED LITERALLY",
    repl: "    'clan_order_votes','clan_raids','clan_tavern','clan_withdrawals',\n"
        + "    'clan_work_labour','clan_work_orders',\n"
        + "    'maintenance_alerts','maintenance_log'];\n"
        + "  /* ⚠ THE 34 PAIRS ARE DECLARED LITERALLY",
  },
  baseline_row_left_behind: {
    migration: MIG,
    why: 'the grants go but ONE baseline row stays. A baselined pair is a standing exemption: the '
       + 'next time anything re-grants that table the detector says nothing, which is the exact '
       + 'blindness the baseline was invented to remove — and on the LAST batch it also means the '
       + 'programme quietly never finished',
    find: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2];\n  get diagnostics",
    repl: "   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2]\n"
        + "     and not (b.table_name = 'clan_ledger' and b.grantee = 'anon');\n  get diagnostics",
  },
  maintain_left_behind: {
    migration: MIG,
    why: 'MAINTAIN is dropped from the revoke verb list. The 34 pairs then lose '
       + 'INSERT/UPDATE/DELETE and keep a client privilege that information_schema — and therefore '
       + 'check (4) of the live detector — CANNOT SEE, while the baseline rows that would have '
       + 'flagged them are consumed. This is batch 1\'s defect, reproduced on seventeen tables',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
    repl: "    execute format('revoke insert, update, delete, truncate, references, trigger '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
  },
  live_policy_pair_revoked: {
    migration: MIG,
    why: '⚠ THE ONE THIS BATCH EXISTS TO GET RIGHT: clan_members is added to the REVOKE list in §1 '
       + 'and NOT to §0\'s precondition list, so the write grant behind the LIVE `join as self` '
       + 'INSERT policy is taken away. Nothing else in the file would notice — §2/§3 only measure '
       + 'the seventeen, and check (4) never reports a table that HAS a write policy — and clan '
       + 'joining goes offline for every cached client with a 42501 nobody can read. A batch may '
       + 'not revoke a (table, verb) pair that a live policy is standing on',
    find: "    'clan_work_labour','clan_work_orders',\n"
        + "    'maintenance_alerts','maintenance_log'];\n"
        + "  /* ⚠ THE 34 PAIRS ARE DECLARED LITERALLY",
    repl: "    'clan_work_labour','clan_work_orders',\n"
        + "    'maintenance_alerts','maintenance_log','clan_members'];\n"
        + "  /* ⚠ THE 34 PAIRS ARE DECLARED LITERALLY",
  },

  live_policy_grant_collaterally_revoked: {
    migration: MIG,
    why: '⚠ THE SAME DEFECT, PAST EVERY GATE THE FILE HAS. live_policy_pair_revoked adds '
       + 'clan_members to a LIST, and the file catches that on its own (the c_tables/c_pairs '
       + 'cross-check, or the baseline refuse-if-absent). So this one does not touch a list at all '
       + '— it appends one extra `revoke insert on clan_members from authenticated` next to the '
       + 'loop, which is what "while we are in here, tidy that up too" actually looks like in a '
       + 'diff. Every list stays consistent, every count still adds up, §2/§3 only measure the '
       + 'seventeen, and check (4) never reports a table that HAS a write policy. NOTHING in the '
       + 'migration can see it; C6 is the only thing standing there, which is the point of C6',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);\n"
        + '  end loop;',
    repl: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);\n"
        + '  end loop;\n'
        + '  execute \'revoke insert on public.clan_members from anon, authenticated\';',
  },

  // ── THE MEASUREMENT ITSELF ────────────────────────────────────────────
  verify_via_information_schema: {
    migration: MIG,
    why: 'the §2 verification is measured through information_schema instead of '
       + 'has_table_privilege. On its own that changes no grant — it removes the only instrument '
       + 'that can SEE one, which is why it is paired with maintain_left_behind in --selftest',
    find: "      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',\n"
        + "                              'TRIGGER','MAINTAIN']) pp\n"
        + "     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;\n"
        + "  if v_left is not null then",
    repl: "      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',\n"
        + "                              'TRIGGER','MAINTAIN']) pp\n"
        + "     where exists (select 1 from information_schema.role_table_grants g\n"
        + "                    where g.table_schema='public' and g.table_name=tt\n"
        + "                      and g.grantee=gg and g.privilege_type=pp)) x;\n"
        + "  if v_left is not null then",
    withAlso: 'maintain_left_behind',
  },
  vocab_narrowed: {
    migration: MIG,
    why: 'MAINTAIN is dropped from §0(e)\'s declared vocabulary — the blind spot batch 3 closed, '
       + 'planted at the instrument rather than at the revoke. The file must REFUSE TO INSTALL '
       + 'rather than sweep seven eighths of the privilege surface and report success',
    find: "  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',\n"
        + "                                    'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];",
    repl: "  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',\n"
        + "                                    'TRUNCATE','REFERENCES','TRIGGER'];",
  },
  select_collaterally_revoked: {
    migration: MIG,
    why: '`revoke all` instead of the enumerated verbs — the one-word "simplification" that takes '
       + 'SELECT with it and blanks the clan roster, the board, the ledger feed and the muster '
       + 'totals, silently, on a file whose other checks would all stay green',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "                   'on public.%I from public, anon, authenticated', t);",
    repl: "    execute format('revoke all on public.%I from public, anon, authenticated', t);",
  },
  pair_list_drift_tolerated: {
    migration: MIG,
    why: 'the §1 cross-check between c_tables and c_pairs is downgraded, and clan_tavern is then '
       + 'revoked while its two baseline rows survive — a permanent silent exemption on a table '
       + 'that no longer needs one. The two hand-typed lists exist only because a predecessor '
       + 'guard parses c_pairs out of the file; nothing but this check keeps them honest',
    find: "    raise exception 'SWEEP-4 §1: c_tables and c_pairs disagree about which pairs this batch owns: '",
    repl: "    raise warning 'SWEEP-4 §1: c_tables and c_pairs disagree about which pairs this batch owns: '",
    withAlso: 'pair_list_drift_planted',
  },
  pair_list_drift_planted: {
    migration: MIG,
    why: '(paired with pair_list_drift_tolerated) clan_tavern is removed from c_pairs but left in '
       + 'c_tables',
    find: "    ['clan_tavern','anon'],          ['clan_tavern','authenticated'],\n",
    repl: '',
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
    why: 'the §0(b) check that none of the seventeen carries an INSERT/UPDATE/DELETE/ALL policy is '
       + 'dropped. The whole file rests on the grant being DEAD; with a write policy present the '
       + 'grant is LIVE, the revoke breaks a working path, and nothing would say so',
    find: "      raise exception 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '",
  },
  live_policy_table_baselined_tolerated: {
    migration: MIG,
    why: '§0(b2) stops refusing when clan_members or clans appears in the baseline. A table with a '
       + 'live write policy cannot be in the dead-grant class, so a baseline row for it is either '
       + 'hand-inserted or a sign batch 1\'s predicate changed — and either way the reconciliation '
       + 'this batch rests on is out of date',
    find: "      raise exception 'REFUSING TO INSTALL: public.% is BASELINED, but it carries a live client '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% is BASELINED, but it carries a live client '",
  },
  live_policy_dropped_tolerated: {
    migration: MIG,
    why: '§0(b2) stops refusing when clan_members or clans has LOST its last write policy — i.e. '
       + 'the state a rebuild is in once 2026-08-12-clan-members-rls-drop.sql lands. That table has '
       + 'then silently JOINED the dead-grant class, unswept and unbaselined, and the nightly '
       + 'hr_assert_grant_hygiene starts raising on it every night with nobody having decided '
       + 'anything',
    find: "      raise exception 'REFUSING TO INSTALL: public.% no longer has ANY client write policy. It was '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% no longer has ANY client write policy. It was '",
  },
  unknown_writer_tolerated: {
    migration: MIG,
    why: 'a writer the file has never seen appears on one of the seventeen and §0(c) shrugs. "The '
       + 'writers are confirmed" is the entire basis on which a batch is allowed to sweep',
    find: "      raise exception 'REFUSING TO INSTALL: public.% has writer(s) this file does not know about: '",
    repl: "      raise warning 'REFUSING TO INSTALL: public.% has writer(s) this file does not know about: '",
  },
  writer_scan_positive_control_removed: {
    migration: MIG,
    why: 'the positive control on the writer scan is downgraded. The scan is written to find '
       + 'NOTHING, so a scan that has stopped matching anything at all also finds nothing and '
       + 'reports "no unknown writers" while seeing no writers whatsoever',
    find: "        raise exception 'THE WRITER SCAN IS BLIND (positive control): the declared writer public.% '",
    repl: "        raise warning 'THE WRITER SCAN IS BLIND (positive control): the declared writer public.% '",
    withAlso: 'writer_scan_blinded',
  },
  writer_scan_blinded: {
    migration: MIG,
    why: '(paired with writer_scan_positive_control_removed) the writer scan regex is replaced by '
       + 'one that matches nothing, which is the failure the positive control exists for',
    find: "  c_scan   constant text := '(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?%1$s\\M';",
    repl: "  c_scan   constant text := '(hr__no_such_dml_verb)\\s+(public\\.)?%1$s\\M';",
  },
  trigger_writer_ignored: {
    migration: MIG,
    why: 'the non-function writer scan (triggers, rules, dependent views) is downgraded. A pg_proc '
       + 'body scan cannot see a trigger, and a trigger is a writer — "confirmed" would then mean '
       + '"confirmed among functions"',
    find: "    raise exception 'REFUSING TO INSTALL: something other than a function routes into the swept '",
    repl: "    raise warning 'REFUSING TO INSTALL: something other than a function routes into the swept '",
  },
  detector_blindness_control_removed: {
    migration: MIG,
    why: '⚠ THE CONTROL THIS BATCH COULD NOT INHERIT. Batches 2 and 3 guarded "check (4) can still '
       + 'see a dead grant" by asserting the baseline was NOT EMPTY. This file EMPTIES it, so it '
       + 'plants a probe table instead and demands the check NAMES it and RAISES. Remove that and '
       + '"the detector reports clean" is satisfied by a detector that reports nothing at all — on '
       + 'the one batch after which there is nothing left in the class to notice the difference',
    find: "    raise exception 'SWEEP-4 §4 CONTROL FAILED — CHECK (4) IS BLIND: a table with RLS on, no write '",
    repl: "    raise warning 'SWEEP-4 §4 CONTROL FAILED — CHECK (4) IS BLIND: a table with RLS on, no write '",
    withAlso: 'detector_blinded',
  },
  detector_blinded: {
    migration: MIG,
    why: '(paired with detector_blindness_control_removed) the §4 control probe is never granted '
       + 'anything, so it cannot be reported — standing in for a check (4) that has gone blind',
    find: '  grant insert on public.hr__sweep4_probe to authenticated;',
    repl: '  perform 1;',
  },
  baseline_not_emptied_check_removed: {
    migration: MIG,
    why: 'the §4 assertion that the baseline is EMPTY after the LAST batch is downgraded. The '
       + 'programme could then finish with rows left in it — permanent standing exemptions for '
       + 'tables nobody swept — and every other check in the file would stay green',
    find: "    raise exception 'SWEEP-4 §4: the baseline still holds % pair(s) after the LAST batch: %. Either '",
    repl: "    raise warning 'SWEEP-4 §4: the baseline still holds % pair(s) after the LAST batch: %. Either '",
    withAlso: 'baseline_row_left_behind',
  },
};

/* ── THE HOSTILE PRECONDITIONS ──────────────────────────────────────────────
   §0 is eight REFUSE-TO-INSTALL checks, and on a clean replay not one of them is
   ever reached — so downgrading any of them changes nothing on its own and every
   precondition mutation would SLIP unless the state it guards is PLANTED. A
   precondition that is never triggered is not tested; it is decorated.

   Each scenario plants that state by appending SQL to a PREDECESSOR migration
   and demands this migration REFUSE with the message that names the actual
   problem. C8 runs them.

   ⚠ WHICH PREDECESSOR MATTERS. A hostile GRANT planted early is seen by batch
     2's §4 and batch 3's §5, both of which call hr_assert_grant_hygiene(true)
     and would abort the chain one file early for a true reason that is not the
     one under test. So everything is planted in BATCH 3's tail — the last file
     before this one.
   ⚠ THE ANCHOR CONTAINS NO `$$`. bootReplay patches with String.replace, in
     which `$$` in the REPLACEMENT means a literal `$` — so anchoring on a
     dollar-quoted `end $$;` and re-emitting it silently produces `end $;` and the
     predecessor fails to apply with "unterminated dollar-quoted string". */
const PRED3_TAIL = '-- ⚠ WHAT THAT LEAVES OPEN, said plainly: until (a) lands, a table that is';
const SCENARIOS = {
  write_policy_present: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: 'a client UPDATE policy is added to world_event_totals — the shared, whole-population '
       + 'aggregate whose goal and met_at decide what EVERY participant is paid. The grant is then '
       + 'LIVE, not dead, the pair is not in the class, and revoking it breaks that path',
    sql: 'create policy "hr__mut totals bump" on public.world_event_totals '
       + 'for update using (true);',
    expect: /now carries a client WRITE policy/i,
  },
  unknown_writer_present: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: 'a writer of clan_ledger that this file has never heard of exists. clan_ledger is the '
       + 'append-only journal every clan cap is read from, and "the writers are confirmed" is the '
       + 'entire basis on which a batch is allowed to sweep it',
    sql: 'create function public.hr__mut_ledger_writer() returns void language plpgsql as $m$ begin '
       + "delete from public.clan_ledger where false; end $m$;\n"
       + 'revoke execute on function public.hr__mut_ledger_writer() from public, anon, authenticated;',
    expect: /has writer\(s\) this file does not know about/i,
  },
  trigger_writer_present: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: 'a TRIGGER is attached to clan_stores. A pg_proc body scan cannot see it, so without the '
       + 'second population the file would report "the writers are confirmed" while a writer it '
       + 'has never looked at fires on every row',
    sql: 'create function public.hr__mut_trg4() returns trigger language plpgsql as $m$ begin '
       + 'return new; end $m$;\n'
       + 'revoke execute on function public.hr__mut_trg4() from public, anon, authenticated;\n'
       + 'create trigger hr__mut_trg4_t before insert on public.clan_stores '
       + 'for each row execute function public.hr__mut_trg4();',
    expect: /something other than a function routes into the swept tables/i,
  },
  baseline_row_already_absent: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: 'another batch (or a re-run of this one) already consumed one of the 34 rows. This file is '
       + 'then reasoning about a state that no longer exists, and must stop rather than apply half '
       + 'of a change somebody else owns',
    sql: "delete from public.hr_client_write_baseline where table_name = 'clan_ledger' "
       + "and grantee = 'anon';",
    expect: /already absent/i,
  },
  live_policy_table_baselined: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: '⚠ THE RECONCILIATION THIS BATCH RESTS ON. clan_members is inserted into the baseline. It '
       + 'carries a live write policy, so it CANNOT be in the dead-grant class; a row for it means '
       + 'somebody recorded a pair that is not dead, and the "there are zero live-policy pairs '
       + 'among the 34" claim is no longer something anybody has checked',
    sql: 'insert into public.hr_client_write_baseline (table_name, grantee, note) '
       + "values ('clan_members','authenticated','hr__mut');",
    expect: /is BASELINED, but it carries a live client write policy/i,
  },
  live_policy_dropped: {
    file: PRED3,
    anchor: PRED3_TAIL,
    why: '⚠ THE OTHER HALF, and the one that will really happen: '
       + '2026-08-12-clan-members-rls-drop.sql lands and clan_members loses its last write policy. '
       + 'It has then JOINED the dead-grant class — unswept, unbaselined — and the nightly detector '
       + 'starts raising on it. This file must stop and hand it to a batch 5 rather than apply on '
       + 'top of a reconciliation that is no longer true',
    sql: 'drop policy if exists "join as self"  on public.clan_members;\n'
       + 'drop policy if exists "leave as self" on public.clan_members;',
    expect: /no longer has ANY client write policy/i,
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

/** Every table privilege the SERVER knows, derived rather than typed — the same
 *  instrument §0(e) of the migration refuses to install without. */
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
 *  code would pass identically against an un-swept database. */
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

async function migrationSource(file) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  return (await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8')).replace(/\r\n/g, '\n');
}

/** The (table, grantee) pairs a sweep migration DECLARES, parsed from its own
 *  source, so the arithmetic below is derived from the files rather than typed
 *  (CLAUDE.md b339: three different wrong numbers have shipped in prose about
 *  this list). `decl` is the array variable name to read.
 *  ⚠ `\s+`, not a single space: the files align the `constant` keyword. */
async function declaredPairs(file, decl) {
  const sql = await migrationSource(file);
  const block = sql.match(
    new RegExp(`${decl}\\s+constant text\\[\\]\\[\\] := array\\[([\\s\\S]*?)\\];`));
  if (!block) return [];
  return [...block[1].matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*\]/g)]
    .map((m) => `${m[1]}:${m[2]}`);
}

/** Every (table, grantee) pair that ANY sweep batch declares it consumes, read
 *  from the migrations directory rather than from a list in this file, so a
 *  future batch does not turn this arm red for a database in perfect order. */
async function consumedPairs() {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  const files = (await readdir(join(ROOT, 'supabase', 'migrations')))
    .filter((f) => /client-write-grant-sweep(-\d+)?\.sql$/.test(f)).sort();
  const out = new Set();
  for (const f of files) for (const k of await declaredPairs(f, 'c_pairs')) out.add(k);
  return { pairs: [...out], files };
}

/** The (table, function) writer pairs THE MIGRATION declares, parsed from its
 *  own c_writers array. C4 compares this against what it actually drove — a
 *  drive list that has drifted from the file's claim is a guard that proves
 *  something about a different set of functions. */
async function declaredWriters() {
  return declaredPairs(MIG, 'c_writers');
}

// ════════════════════════════════════════════════════════════════════════
// THE DRIVE — all 42 confirmed writers, each required to CHANGE its target.
//
// Client-callable writers go through their A9 wrappers as a signed-in player,
// which is what a browser reaches. Cron/nested writers hold no client EXECUTE
// grant and are driven as the OWNER, which is how they really run — with
// auth.uid() set explicitly rather than inherited from whichever call ran last.
//
// Everything marked "scenery" is written as the OWNER on purpose: a hold that
// has existed for a while, with a tavern, standing, a treasury and stores. Those
// are the server's own columns and they are fixture, not the property under
// test. What is under test is whether the RPCs can still WRITE once the client
// grants are gone — so every fixture is identical in both arms.
// ════════════════════════════════════════════════════════════════════════
async function drive(db, label) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const fp = async (t) => (await q(
    'select count(*)::int n, '
    + `coalesce(md5(string_agg(x::text,'|' order by x::text)),'-') h from public.${t} x`))[0];
  const results = [];

  const U = {};
  for (const tag of ['lead', 'mem', 'out']) {
    const id = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [id, `${label}-${tag}@probe.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [id]);
    U[tag] = id;
  }
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    await q('set local role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const own = async (sql, p, uid = null) => {
    await q("select set_config('request.jwt.claim.sub',$1,true)", [uid || '']);
    return (await db.query(sql, p)).rows[0]?.r;
  };
  // The RPC gate is REAL (hr_rpc_gate refuses a burst), so it is cleared between
  // drives. Named exactly rather than swept with a try/catch over candidates: a
  // failed statement ABORTS the transaction and a swallowed error would surface
  // as an unrelated 25P02 several writers later.
  const gate = () => q('delete from public.hr_rate_counters');

  /** Run one writer and demand the target table(s) actually CHANGED. */
  const W = async (id, tables, fn) => {
    await gate();
    const before = {};
    for (const t of tables) before[t] = await fp(t);
    let r; let err = null;
    try { r = await fn(); } catch (e) { err = String(e.message || e).split('\n')[0]; }
    const moved = [];
    for (const t of tables) {
      const a = await fp(t);
      if (a.n !== before[t].n || a.h !== before[t].h) moved.push(t);
    }
    results.push({ id, tables, moved, err, r, wrote: !err && moved.length > 0 && r?.ok !== false });
    return r;
  };

  for (const t of ['lead', 'mem', 'out']) {
    await gate();
    await asUser(U[t], 'select public.claim_display_name($1) as r', [`${label}${t}`]);
  }
  const WEEK = (await q('select public.hr_utc_week_key() as r'))[0].r;
  const DAY = (await q('select public.hr_utc_day_key() as r'))[0].r;

  // ── CLAN ────────────────────────────────────────────────────────────────
  const cc = await W('clan_create', ['clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_create($1,$2) as r', [`${label} Hold`, 'open']));
  const CLAN = cc?.clan_id;

  await W('clan_join_policy_set', ['clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_join_policy_set($1) as r', ['invite']));
  await W('clan_invite', ['clan_invites', 'clan_ledger', 'clan_bans'], () =>
    asUser(U.lead, 'select public.clan_invite($1) as r', [`${label}mem`]));
  await W('clan_join', ['clan_invites', 'clan_ledger'], () =>
    asUser(U.mem, 'select public.clan_join($1) as r', [CLAN]));
  await gate();
  await asUser(U.lead, 'select public.clan_invite($1) as r', [`${label}out`]);
  await W('clan_invite_revoke', ['clan_invites', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_invite_revoke($1) as r', [U.out]));
  await W('clan_contribute', ['clan_ledger'], () =>
    asUser(U.mem, 'select public.clan_contribute($1,$2) as r', [CLAN, 20000]));
  await W('clan_deposit', ['clan_stores', 'clan_ledger'], () =>
    asUser(U.mem, 'select public.clan_deposit($1,$2) as r',
      [CLAN, JSON.stringify({ field_ration: 5 })]));

  // scenery
  await own("update public.clans set upgrades = '{\"tavern\":\"3\"}'::jsonb, standing = 99999999, "
    + 'castle_tier = 1, treasury = 500000 where id = $1 returning 1 as r', [CLAN]);
  await own("update public.clan_members set joined_at = now() - interval '30 days', "
    + "last_seen = now() - interval '1 day' where clan_id = $1 returning 1 as r", [CLAN]);

  await W('clan_feast_deposit', ['clan_tavern', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_feast_deposit($1,$2) as r', [CLAN, 50]));
  await own('insert into public.clan_tavern (clan_id, feast_meter) values ($1, 999999) '
    + 'on conflict (clan_id) do update set feast_meter = 999999 returning 1 as r', [CLAN]);
  await W('clan_feast_call', ['clan_tavern', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_feast_call($1) as r', [CLAN]));
  await W('clan_rested_grant', ['clan_ledger'], () =>
    asUser(U.mem, 'select public.clan_rested_grant($1) as r', [CLAN]));

  // Three DISTINCT depositing members joined >72h ago is a tier-up precondition.
  for (const tag of ['x1', 'x2']) {
    const id = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [id, `${label}-${tag}@probe.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [id]);
    await q('insert into public.clan_members (clan_id,user_id,role,contributed,joined_at,last_seen) '
      + "values ($1,$2,'member',50000, now() - interval '30 days', now() - interval '1 day')",
    [CLAN, id]);
    await q('insert into public.clan_ledger (clan_id,user_id,kind,item_id,qty) '
      + "values ($1,$2,'deposit','field_ration',10)", [CLAN, id]);
  }
  for (const it of ['timber_beam', 'iron_fitting', 'field_ration', 'keystone']) {
    await own('insert into public.clan_stores (clan_id,item_id,qty) values ($1,$2,99999) '
      + 'on conflict (clan_id,item_id) do update set qty = 99999 returning 1 as r', [CLAN, it]);
  }
  await W('clan_tier_up', ['clan_stores', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_tier_up($1) as r', [CLAN]));
  await W('clan_vice_set', ['clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_vice_set($1,$2,$3) as r', [CLAN, U.mem, true]));

  await W('clan_board_roll', ['clan_board'], () =>
    asUser(U.lead, 'select public.clan_board_roll($1) as r', [CLAN]));
  const tsk = (await q('select t.task_id, t.counter from public.clan_board b '
    + 'join public.hr_castle_board_tasks t on t.task_id=b.task_id where b.clan_id=$1 '
    + 'and not t.weekly order by t.task_id limit 1', [CLAN]))[0];
  await own('update public.clan_board set target = 10 where clan_id = $1 returning 1 as r', [CLAN]);
  await W('clan_board_progress', ['clan_board', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_board_progress($1,$2,$3) as r', [CLAN, tsk?.counter, 50]));
  await W('clan_board_claim', ['clan_board', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_board_claim($1,$2) as r', [CLAN, tsk?.task_id]));

  await W('clan_vote_open', ['clan_order_votes', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_vote_open($1,$2,$3) as r',
      [CLAN, JSON.stringify(['sawmill', 'smeltery']), 24]));
  const VID = (await q('select id from public.clan_order_votes where clan_id=$1 '
    + 'order by opened_at desc limit 1', [CLAN]))[0]?.id;
  await W('clan_vote_cast', ['clan_order_ballots'], () =>
    asUser(U.lead, 'select public.clan_vote_cast($1,$2,$3) as r', [CLAN, VID, 'sawmill']));
  await W('hr_clan_vote_settle_one', ['clan_order_votes'], () =>
    own('select public.hr_clan_vote_settle_one($1,$2) as r', [VID, U.lead]));

  await own('update public.clans set castle_tier = 3 where id = $1 returning 1 as r', [CLAN]);
  await W('hr_clan_order_create', ['clan_work_orders'], () =>
    own('select public.hr_clan_order_create($1,$2,$3) as r', [CLAN, 'smeltery', U.lead]));
  const ORD = (await q("select id from public.clan_work_orders where clan_id=$1 "
    + "and building='smeltery' order by posted_at desc limit 1", [CLAN]))[0]?.id;
  const mats = (await q('select materials from public.clan_work_orders where id=$1',
    [ORD]))[0]?.materials || {};
  for (const [item, n] of Object.entries(mats)) {
    await own('insert into public.clan_stores (clan_id,item_id,qty) values ($1,$2,$3) '
      + 'on conflict (clan_id,item_id) do update set qty = excluded.qty returning 1 as r',
    [CLAN, item, Number(n) * 4]);
  }
  await W('clan_work_supply', ['clan_stores', 'clan_work_orders'], () =>
    asUser(U.lead, 'select public.clan_work_supply($1,$2,$3) as r',
      [CLAN, ORD, JSON.stringify(mats)]));
  await own("update public.clan_work_orders set labour_from = now() - interval '1 day', "
    + 'labour_target = 5 where id = $1 returning 1 as r', [ORD]);
  await W('clan_work_labour', ['clan_work_labour', 'clan_work_orders', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_work_labour($1,$2,$3) as r', [CLAN, ORD, 5]));
  await own("update public.clan_work_orders set floor_until = now() - interval '1 hour' "
    + 'where id = $1 returning 1 as r', [ORD]);
  await W('clan_work_complete', ['clan_work_orders', 'clan_ledger'], () =>
    asUser(U.lead, 'select public.clan_work_complete($1,$2) as r', [CLAN, ORD]));

  await W('clan_hunt_declare', ['clan_raids'], () =>
    asUser(U.lead, 'select public.clan_hunt_declare($1,$2,$3,$4) as r', [CLAN, WEEK, 1, null]));
  const BOSS = (await q('select boss_id from public.clan_raids where clan_id=$1 and week_key=$2',
    [CLAN, WEEK]))[0]?.boss_id;
  await W('raid_strike', ['clan_raids'], () =>
    asUser(U.mem, 'select public.raid_strike($1,$2,$3,0,99999999) as r', [CLAN, WEEK, BOSS]));
  // One strike per UTC day by design; the day stamp is fixture, the WRITE is not.
  for (let i = 0; i < 3; i += 1) {
    await own("update public.raid_contributions set last_strike_day = 'hr__drive ' || $3 "
      + 'where clan_id = $1 and week_key = $2 returning 1 as r', [CLAN, WEEK, String(i)]);
    await gate();
    await asUser(U.mem, 'select public.raid_strike($1,$2,$3,0,99999999) as r', [CLAN, WEEK, BOSS]);
  }
  await own('update public.clan_raids set downed_at = now(), hp_remaining = 0 '
    + 'where clan_id = $1 and week_key = $2 returning 1 as r', [CLAN, WEEK]);
  await W('raid_claim', ['clan_ledger', 'clan_raids'], () =>
    asUser(U.mem, 'select public.raid_claim($1,$2,$3) as r', ['clan', CLAN, WEEK]));

  await W('clan_withdraw', ['clan_withdrawals'], () =>
    own('select public.clan_withdraw($1,$2) as r', [CLAN, 150000], U.lead));
  const WD = (await q('select id from public.clan_withdrawals where clan_id=$1 '
    + 'order by requested_at desc limit 1', [CLAN]))[0]?.id;
  await W('clan_withdraw_cancel', ['clan_withdrawals'], () =>
    own('select public.clan_withdraw_cancel($1) as r', [WD], U.lead));
  await gate();
  await own('select public.clan_withdraw($1,$2) as r', [CLAN, 150000], U.lead);
  const WD2 = (await q('select id from public.clan_withdrawals where clan_id=$1 '
    + 'and cancelled_at is null order by requested_at desc limit 1', [CLAN]))[0]?.id;
  await own("update public.clan_withdrawals set ready_at = now() - interval '1 hour' "
    + 'where id=$1 returning 1 as r', [WD2]);
  await W('clan_withdraw_settle', ['clan_withdrawals', 'clan_ledger'], () =>
    own('select public.clan_withdraw_settle($1) as r', [WD2], U.lead));

  await own("update public.clans set upkeep_settled_at = now() - interval '30 days' "
    + 'where id=$1 returning 1 as r', [CLAN]);
  await W('clan_upkeep_settle', ['clan_ledger', 'clan_stores'], () =>
    own('select public.clan_upkeep_settle($1) as r', [CLAN]));
  await W('clan_upkeep_pay', ['clan_ledger'], () =>
    own('select public.clan_upkeep_pay($1) as r', [CLAN], U.lead));

  await W('clan_set_role', ['clan_ledger'], () =>
    own('select public.clan_set_role($1,$2,$3,$4) as r', [CLAN, U.mem, 'officer', 'steward'], U.lead));
  await own("update public.clan_members set last_seen = now() - interval '60 days' "
    + "where clan_id=$1 and role='leader' returning 1 as r", [CLAN]);
  await W('clan_claim_leadership', ['clan_ledger'], () =>
    own('select public.clan_claim_leadership($1) as r', [CLAN], U.mem));
  await W('clan_kick', ['clan_bans', 'clan_ledger', 'clan_invites'], () =>
    asUser(U.mem, 'select public.clan_kick($1,$2) as r', [U.lead, 24]));
  await W('clan_leave', ['clan_ledger'], () =>
    asUser(U.mem, 'select public.clan_leave() as r'));

  // ── WORLD EVENT ─────────────────────────────────────────────────────────
  await own('insert into public.world_event_totals '
    + '(event_key, participants, goal, goal_frozen_at, progress) '
    + "values ($1, 1, 6000, now() + interval '1 hour', 0) "
    + 'on conflict (event_key) do nothing returning 1 as r', [`${DAY}#1`]);
  await own('insert into public.world_event_joins '
    + '(day_key,user_id,event_key,slot,window_end,points) '
    + "values ($1,$2,$3,1, now() + interval '30 minutes', 0) returning 1 as r",
  [DAY, U.out, `${DAY}#1`]);
  await W('world_event_contribute', ['world_event_joins', 'world_event_totals'], () =>
    asUser(U.out, 'select public.world_event_contribute($1,$2) as r', [`${DAY}#1`, 400]));
  await own("update public.world_event_joins set window_end = now() - interval '1 minute' "
    + 'where day_key=$1 and user_id=$2 returning 1 as r', [DAY, U.out]);
  await W('world_event_claim', ['world_event_joins'], () =>
    asUser(U.out, 'select public.world_event_claim($1) as r', [DAY]));

  await own('insert into public.world_event_pledges (day_key,user_id,event_key,slot) '
    + 'values ($1,$2,$3,1) on conflict do nothing returning 1 as r', [DAY, U.out, `${DAY}#1`]);
  await W('world_event_pledge_settle', ['world_event_pledges'], () =>
    asUser(U.out, 'select public.world_event_pledge_settle($1) as r', [DAY]));

  // Absence: a pledge for a day that has CLOSED, and no join row for it.
  const YDAY = (await q("select public.hr_utc_day_key(now() - interval '2 days') as r"))[0].r;
  await own('insert into public.world_event_pledges (day_key,user_id,event_key,slot) '
    + 'values ($1,$2,$3,1) on conflict do nothing returning 1 as r',
  [YDAY, U.lead, `${YDAY}#1`]);
  await W('world_event_absence_claim', ['world_event_pledges'], () =>
    asUser(U.lead, 'select public.world_event_absence_claim($1) as r', [YDAY]));

  /* ⚠ THE TWO CLOCK-GATED WRITERS. See the header: the shims DELEGATE to the
     real, renamed functions, so only the CLOCK is injected and the real window
     logic still runs. Identical in both arms. */
  await db.exec(`
    alter function public.hr_muster_window(timestamptz) rename to hr_muster_window__driveclock;
    create function public.hr_muster_window(p_at timestamptz default now())
      returns table(day_key text, slot int, event_key text,
                    started_at timestamptz, ends_at timestamptz)
      language sql stable as $shim$
        select * from public.hr_muster_window__driveclock(
          (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
          + interval '1 hour 10 minutes');
      $shim$;
    alter function public.hr_rally_slot(text,int) rename to hr_rally_slot__driveclock;
    create function public.hr_rally_slot(p_day_key text, p_slot int)
      returns table(day_key text, slot int, event_key text,
                    started_at timestamptz, ends_at timestamptz)
      language sql stable as $shim$
        select * from public.hr_rally_slot__driveclock(
          public.hr_utc_day_key(now() + interval '2 days'), p_slot);
      $shim$;`);
  await W('world_event_join', ['world_event_joins', 'world_event_totals'], () =>
    asUser(U.mem, 'select public.world_event_join($1) as r', [`${DAY}#1`]));
  await W('world_event_pledge', ['world_event_pledges'], () =>
    asUser(U.lead, 'select public.world_event_pledge($1) as r', [`${DAY}#13`]));
  await db.exec(`
    drop function public.hr_muster_window(timestamptz);
    alter function public.hr_muster_window__driveclock(timestamptz) rename to hr_muster_window;
    drop function public.hr_rally_slot(text,int);
    alter function public.hr_rally_slot__driveclock(text,int) rename to hr_rally_slot;`);

  // ── MAINTENANCE ─────────────────────────────────────────────────────────
  await W('hr_cron_health', ['maintenance_alerts', 'maintenance_log'], () =>
    own('select public.hr_cron_health($1) as r', ['25:00:00']));
  await W('hr_trim_game_events', ['maintenance_log'], () =>
    own('select public.hr_trim_game_events($1,$2) as r', [7, 50000]));

  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return results;
}

/** The DRIVE names, mapped to the __ungated function each one really reaches.
 *  Client-callable RPCs are A9 wrappers over a `__ungated` body, and it is the
 *  body that the migration's c_writers names — so C4 can only compare its
 *  coverage against the file's claim through this map. Anything not listed is
 *  driven under its own name. */
const UNGATED = new Set(['clan_board_claim', 'clan_board_progress', 'clan_board_roll',
  'clan_contribute', 'clan_deposit', 'clan_feast_call', 'clan_feast_deposit',
  'clan_hunt_declare', 'clan_rested_grant', 'clan_tier_up', 'clan_vice_set',
  'clan_vote_cast', 'clan_vote_open', 'clan_work_complete', 'clan_work_labour',
  'clan_work_supply', 'raid_claim', 'raid_strike', 'world_event_absence_claim',
  'world_event_claim', 'world_event_contribute', 'world_event_join',
  'world_event_pledge', 'world_event_pledge_settle']);
const realName = (id) => (UNGATED.has(id) ? `${id}__ungated` : id);

/** pg_cron's run-history table: a real Supabase project has it, the replay's
 *  shim does not, and hr_cron_health's alert paths are inert without it — so
 *  maintenance_alerts would have no driveable writer at all. This is a PLATFORM
 *  fixture in exactly the sense tests/schema-replay.mjs's SCAFFOLD allows, not a
 *  missing migration. */
async function cronFixture(db) {
  await db.exec(`create table if not exists cron.job_run_details (
      jobid bigint, runid bigint, job_pid int, database text, username text,
      command text, status text, return_message text,
      start_time timestamptz, end_time timestamptz);
    insert into cron.job_run_details (jobid, runid, status, return_message, start_time)
      values (1, 1, 'failed', 'sweep-4 probe', now() - interval '1 hour');`);
}

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run({ patches } = {}) {
  // upTo: MIG — validate the state AS OF batch 4, isolated from batch 5's global
  // MAINTAIN sweep, which runs last and would silently correct (and hide) a
  // MAINTAIN-left-behind mutation planted here.
  const { db } = await bootReplay({ patches, upTo: MIG });
  await db.query('begin');
  const VOCAB = await vocabulary(db);

  // ── C0 · THE INSTRUMENT ITSELF ────────────────────────────────────────
  try {
    ok(VOCAB.includes('MAINTAIN'),
      `C0: the server-derived privilege vocabulary does not contain MAINTAIN (${VOCAB.join(', ')}). `
      + 'information_schema cannot report it; if the derivation cannot see it either, every '
      + '"clean" below is batch 1\'s "clean".');
    for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      ok(VOCAB.includes(p), `C0: the derived vocabulary is missing ${p}: ${VOCAB.join(', ')}`);
    }
    log(`  ok   C0  privilege vocabulary derived from the server: ${VOCAB.join(', ')}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C1 · ZERO CLIENT WRITE PRIVILEGE SURVIVES, MAINTAIN INCLUDED ──────
  try {
    for (const t of T17) {
      const left = await clientPrivs(db, t, VOCAB);
      ok(left.length === 0,
        `C1: client write privilege(s) survive the sweep on ${t}: ${left.join(', ')}`);
    }
    let sel = 0;
    for (const t of T17) {
      for (const g of ['anon', 'authenticated']) {
        const [{ h }] = (await db.query(
          'select has_table_privilege($1, $2, $3) as h', [g, `public.${t}`, 'SELECT'])).rows;
        ok(h, `C1: SELECT was collaterally revoked from ${g} on ${t} — who may READ these tables `
             + 'is not this migration\'s business, and the roster, the board, the ledger feed and '
             + 'the muster totals are all client reads');
        sel += 1;
      }
    }
    log(`  ok   C1  no client write privilege on any of the 17 (${VOCAB.length}-privilege `
      + `vocabulary); all ${sel} SELECT grants intact`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C2 · THE MEASUREMENT CAN SEE A GRANT, AND A RE-GRANT IS FATAL ─────
  // Without this, C1 passes on a database where has_table_privilege stopped
  // answering. And with the baseline now EMPTY, nothing exempts a re-granted
  // table any more — which is the whole point of consuming the rows.
  try {
    await db.query('grant insert, update on public.clan_ledger to authenticated');
    const rc = await clientPrivs(db, 'clan_ledger', VOCAB);
    ok(rc.includes('clan_ledger:authenticated:INSERT')
      && rc.includes('clan_ledger:authenticated:UPDATE'),
    'C2 CONTROL: a freshly granted INSERT/UPDATE was NOT reported — the measurement in C1 is '
      + `blind, so its "clean" means nothing. saw=${rc.join(', ') || '(none)'}`);

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
      'C2: clan_ledger — the append-only journal every clan daily cap is READ FROM — was re-granted '
      + 'an authenticated INSERT with RLS on and no write policy, and hr_assert_grant_hygiene '
      + 'STRICT returned normally. Since sweep-4 deleted its baseline row, this is precisely the '
      + 'case the detector now has to catch; the nightly cron run would have reported success.');
    const [{ r }] = (await db.query('select public.hr_assert_grant_hygiene(false) as r')).rows;
    ok(JSON.stringify(r.client_truncate_grants).includes('clan_ledger:authenticated:INSERT'),
      `C2: the detector did not NAME the re-granted table. report=${JSON.stringify(r.client_truncate_grants)}`);

    await db.query('revoke insert, update on public.clan_ledger from authenticated');
    await db.query('select public.hr_assert_grant_hygiene(true)');
    log('  ok   C2  the measurement sees a grant, and a re-grant of clan_ledger is FATAL now the '
      + 'exemption is gone');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C3 · THE DOOR IS SHUT, AND THE PROBE CAN TELL WHICH DOOR ─────────
  // The pre-state arm the migration itself cannot run: probe (NO_GRANT),
  // re-grant, probe again (RLS_ONLY — the grant is there and only RLS is holding
  // it), revoke. A probe that returned the same verdict either way would make
  // the migration's §3 vacuous, since a missing grant and an RLS refusal are
  // BOTH SQLSTATE 42501.
  try {
    for (const t of T17) {
      for (const g of ['anon', 'authenticated']) {
        const after = await probeWrite(db, g, t);
        ok(after === 'NO_GRANT',
          `C3: ${g} writing ${t} after the sweep reported "${after}", expected NO_GRANT. RLS_ONLY `
          + 'means the grant is still present and row-level security is the only thing standing '
          + 'there — which is the state this sweep exists to end.');
      }
      await db.query(`grant insert on public.${t} to authenticated`);
      const pre = await probeWrite(db, 'authenticated', t);
      ok(pre === 'RLS_ONLY',
        `C3 CONTROL: with the grant restored on ${t} the probe reported "${pre}", expected `
        + 'RLS_ONLY. If it cannot distinguish the pre state from the post state, the assertion '
        + 'above is satisfied by a database nobody swept.');
      await db.query(`revoke insert on public.${t} from authenticated`);
    }
    log(`  ok   C3  anon/authenticated are refused on the GRANT on all ${T17.length * 2} pairs, `
      + 'not merely out-voted by RLS');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C4 · ALL 42 CONFIRMED WRITERS, DRIVEN BEFORE **AND** AFTER ───────
  try {
    await cronFixture(db);

    // (a) BEFORE — the exact pre-sweep ACL restored inside a savepoint. DDL
    //     rolls back with everything else, so the "after" arm runs on a
    //     genuinely swept database and the two arms share identical fixtures.
    await db.query('savepoint pre_arm');
    for (const t of T17) {
      await db.query('grant insert, update, delete, truncate, references, trigger, maintain '
        + `on public.${t} to anon, authenticated`);
    }
    const restored = await clientPrivs(db, 'clan_ledger', VOCAB);
    ok(restored.length === VOCAB.length * 2,
      `C4 CONTROL: the pre-sweep ACL was not fully restored (${restored.length} of `
      + `${VOCAB.length * 2} privileges on clan_ledger). The "before" arm would then be run `
      + 'against a state that is neither the pre nor the post one.');
    const pre = await drive(db, 'pre');
    await db.query('rollback to savepoint pre_arm');
    await db.query('release savepoint pre_arm').catch(() => {});

    // The rollback must really have taken the grants back off, or the "after"
    // arm is a second "before" arm.
    ok((await clientPrivs(db, 'clan_ledger', VOCAB)).length === 0,
      'C4 CONTROL: the savepoint rollback did NOT remove the restored grants, so the AFTER arm '
      + 'below would be driven against an un-swept database and would prove nothing.');

    // (b) AFTER — the swept database.
    const post = await drive(db, 'post');

    ok(pre.length === post.length && pre.length > 40,
      `C4: the two arms drove different numbers of writers (${pre.length} vs ${post.length})`);

    const bad = post.filter((r) => !r.wrote);
    ok(bad.length === 0,
      `C4: ${bad.length} confirmed writer(s) FAILED to write AFTER the revoke — the revoke was `
      + 'supposed to be invisible to the only writers these tables have:\n'
      + bad.map((r) => `      ${r.id}: moved=[${r.moved.join(',')}] `
        + `${r.err ? `ERR ${r.err}` : JSON.stringify(r.r).slice(0, 160)}`).join('\n'));

    // …and the BEFORE arm is what makes the AFTER arm mean anything: without it,
    // "it works after" cannot be distinguished from "it never worked here".
    const badPre = pre.filter((r) => !r.wrote);
    ok(badPre.length === 0,
      `C4 CONTROL: ${badPre.length} writer(s) did not write even with the pre-sweep ACL restored, `
      + 'so the AFTER result for them is not evidence about the revoke — it is evidence the '
      + 'fixture is wrong:\n'
      + badPre.map((r) => `      ${r.id}: moved=[${r.moved.join(',')}] `
        + `${r.err ? `ERR ${r.err}` : JSON.stringify(r.r).slice(0, 160)}`).join('\n'));

    // Writer for writer, the two arms must agree about WHICH TABLES moved. A
    // writer that silently stopped touching one of its tables after the revoke
    // would still be `wrote === true` on the others.
    const drift = post.filter((r, i) =>
      JSON.stringify(r.moved.slice().sort()) !== JSON.stringify(pre[i].moved.slice().sort()));
    ok(drift.length === 0,
      'C4: writer(s) moved a DIFFERENT set of tables before and after the revoke:\n'
      + drift.map((r, i) => `      ${r.id}: before=[${pre[post.indexOf(r)].moved.join(',')}] `
        + `after=[${r.moved.join(',')}]`).join('\n'));

    // ⚠ COVERAGE, MEASURED AGAINST THE MIGRATION'S OWN CLAIM. A drive list that
    //   has drifted from c_writers proves something about a different set of
    //   functions than the file says it swept past.
    const declared = new Set((await declaredWriters()).map((k) => k.split(':')[1]));
    ok(declared.size >= 40,
      `C4 CONTROL: only ${declared.size} writer(s) were parsed out of ${MIG}'s c_writers array — `
      + 'the parser has stopped matching and the coverage check below is vacuous');
    const driven = new Set(post.map((r) => realName(r.id.replace(/#\d+$/, ''))));
    const missed = [...declared].filter((w) => !driven.has(w));
    ok(missed.length === 0,
      `C4 COVERAGE: ${missed.length} writer(s) the migration DECLARES are never driven by this `
      + `file: ${missed.join(', ')}. "All 42 are driven" would be a claim about a list, not a run.`);
    const extra = [...driven].filter((w) => !declared.has(w));
    ok(extra.length === 0,
      `C4 COVERAGE: this file drives ${extra.join(', ')}, which the migration does NOT declare as `
      + 'a writer of any swept table. Either the drive is testing the wrong function or c_writers '
      + 'is incomplete — and an incomplete c_writers is exactly what §0(c) exists to prevent.');

    for (const t of T17) {
      ok(post.some((r) => r.moved.includes(t)),
        `C4 COVERAGE: no writer drove a real write into ${t} after the revoke, so "the writers `
        + 'still work" says nothing about that table.');
    }
    log(`  ok   C4  all ${declared.size} declared writers drove a REAL write into all 17 tables, `
      + 'identically before and after the revoke');
  } catch (e) {
    await db.query('rollback to savepoint pre_arm').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  // ── C5 · THE BASELINE IS EMPTY, AND EMPTY FOR THE RIGHT REASON ───────
  try {
    const based = (await db.query(
      "select table_name || ':' || grantee as k from public.hr_client_write_baseline order by 1"))
      .rows.map((x) => x.k);
    ok(based.length === 0,
      `C5: the baseline is NOT empty after the LAST batch: ${based.join(', ')}. Every remaining `
      + 'row is a permanent standing exemption for a table nobody swept.');

    /* ⚠ NO HARDCODED COUNT AND NO HARDCODED BATCH LIST (CLAUDE.md b339). The
       expected SET is derived end to end: batch 1's declared class, minus the
       union of every `c_pairs` array declared by EVERY sweep batch in the
       migrations directory. */
    const declared = await declaredPairs(PRED1, 'c_expected');
    const { pairs: eaten, files: sweeps } = await consumedPairs();
    ok(declared.length > 40,
      `C5 CONTROL: only ${declared.length} pair(s) were parsed out of ${PRED1}'s c_expected — the `
      + 'parser has stopped matching and the comparison below would be vacuous');
    for (const f of sweeps) {
      if (f === PRED1) continue;                 // batch 1 SEEDS; it declares no c_pairs
      // A sweep that consumes NO baseline rows (batch 5: fail-closed default ACL,
      // schema-wide MAINTAIN revoke, detector takeover) declares no c_pairs BY
      // DESIGN. Requiring one would turn this guard red for a database in perfect
      // order — the exact hazard this arm's header warns about. Gate on whether
      // the file actually deletes baseline rows.
      if (!/delete\s+from\s+public\.hr_client_write_baseline/i.test(await migrationSource(f))) continue;
      ok((await declaredPairs(f, 'c_pairs')).length > 0,
        `C5 CONTROL: the c_pairs parser read ZERO pairs out of ${f}. A sweep batch that DELETES `
        + 'baseline rows but declares no pairs contributes nothing to the expected baseline, so the '
        + 'comparison would demand rows the database is right not to have — and BOTH predecessor '
        + 'guards build their expected baseline the same way, so a batch that skips it turns them red too.');
    }
    for (const t of T17) {
      for (const g of ['anon', 'authenticated']) {
        ok(eaten.includes(`${t}:${g}`),
          `C5 CONTROL: ${t}:${g} is not among the pairs the sweep files declare they consume, so `
          + "the derivation is not reading THIS batch's own c_pairs array.");
      }
    }
    const want = declared.filter((k) => !eaten.includes(k)).sort();
    ok(JSON.stringify(want) === '[]',
      `C5: batch 1's declared class minus everything the ${sweeps.length} sweep batch(es) consume `
      + `is not empty: ${want.join(', ')}. Some pair batch 1 recorded is owned by no batch.`);

    /* ⚠ AND EMPTY IS ONLY GOOD NEWS IF THE PREDICATE CAN STILL SEE. Batches 2
       and 3 guarded this by asserting the baseline was NOT empty; this file
       empties it, so the property is proven directly instead — plant a table
       with RLS on, no write policy and an authenticated INSERT grant, and demand
       the class query NAMES it. */
    await db.query('savepoint clsprobe');
    await db.query('create table public.hr__c5_probe4 (id int primary key)');
    await db.query('alter table public.hr__c5_probe4 enable row level security');
    await db.query('revoke all on public.hr__c5_probe4 '
      + 'from public, anon, authenticated, service_role');
    await db.query('grant insert on public.hr__c5_probe4 to authenticated');
    const probed = (await db.query(`
      select g.table_name || ':' || g.grantee as k
        from information_schema.role_table_grants g
        join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
       where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
         and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
         and not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename = g.table_name
                            and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       group by 1 order by 1`)).rows.map((x) => x.k);
    await db.query('rollback to savepoint clsprobe');
    await db.query('release savepoint clsprobe').catch(() => {});
    ok(probed.includes('hr__c5_probe4:authenticated'),
      'C5 CONTROL: the dead-grant class predicate did NOT name a freshly-created table with RLS '
      + 'on, no write policy and an authenticated INSERT grant. The predicate has gone blind, so '
      + `"the class is empty" means nothing. saw=${probed.join(', ') || '(nothing)'}`);
    ok(probed.length === 1,
      `C5: the live dead-grant class is not empty once the probe is discounted: ${probed.join(', ')}`);
    log('  ok   C5  the baseline AND the live class are EMPTY — and the predicate still names a '
      + 'freshly planted dead grant, so empty is a result rather than a blind spot');
  } catch (e) {
    await db.query('rollback to savepoint clsprobe').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  // ── C6 · THE LIVE-POLICY RECONCILIATION ──────────────────────────────
  // The reviewer's warning for this batch, asserted rather than argued: a table
  // whose write grant a LIVE POLICY is standing on is NOT in the dead-grant
  // class and MUST NOT be swept. clan_members and clans are the two, and nothing
  // in this batch may have touched them.
  try {
    for (const t of T17) {
      const [{ n }] = (await db.query(
        'select count(*)::int as n from pg_policies where schemaname=$1 and tablename=$2 '
        + "and cmd in ('INSERT','UPDATE','DELETE','ALL')", ['public', t])).rows;
      ok(n === 0,
        `C6: ${t} carries ${n} client WRITE policy/policies. Then its grant was never dead, the `
        + 'pair does not belong to the dead-grant class, and this batch revoked something a live '
        + 'path depends on.');
    }
    for (const t of LIVE_POLICY) {
      const [{ n }] = (await db.query(
        'select count(*)::int as n from pg_policies where schemaname=$1 and tablename=$2 '
        + "and cmd in ('INSERT','UPDATE','DELETE','ALL')", ['public', t])).rows;
      ok(n > 0,
        `C6 CONTROL: ${t} has NO client write policy on this replay, so it is no longer the `
        + 'live-policy counter-example this arm is built on. If a migration dropped them, that '
        + 'table has JOINED the dead-grant class and needs a batch of its own — and the '
        + 'migration\'s §0(b2) should have refused to install.');
      const [{ b }] = (await db.query(
        'select count(*)::int as b from public.hr_client_write_baseline where table_name=$1',
        [t])).rows;
      ok(b === 0, `C6: ${t} carries a live write policy AND ${b} baseline row(s). A table with a `
                + 'write policy cannot be in the dead-grant class.');
      // …and the privileges the policy stands on are STILL THERE. This is the
      // half that catches a batch which quietly widened its revoke list.
      const [{ h }] = (await db.query(
        'select has_table_privilege($1,$2,$3) as h', ['authenticated', `public.${t}`, 'INSERT'])).rows;
      ok(h,
        `C6: authenticated no longer holds INSERT on ${t}, but ${t} still has a live INSERT policy `
        + 'standing on it. This sweep revoked a (table, verb) pair a live path depends on — the '
        + 'exact defect live_policy_pair_revoked models.');
    }

    // …and the door the policy opens still OPENS, driven for real. A catalogue
    // assertion says what the catalogue says.
    await db.query('savepoint doorprobe');
    const uid = (await db.query('select gen_random_uuid() as i')).rows[0].i;
    await db.query('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [uid, 'doorprobe@probe.invalid']);
    await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    let door = 'PERMITTED';
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
      await db.query('set local role authenticated');
      await db.query('insert into public.clans (name, created_by, join_policy) '
        + "values ('hr__doorprobe', $1, 'open')", [uid]);
      const cid = (await db.query("select id from public.clans where name='hr__doorprobe'")).rows[0].id;
      await db.query("insert into public.clan_members (clan_id, user_id, role) "
        + "values ($1, $2, 'leader')", [cid, uid]);
    } catch (e) {
      door = String(e.message || e).split('\n')[0];
    }
    await db.query('reset role').catch(() => {});
    await db.query('rollback to savepoint doorprobe').catch(() => {});
    await db.query('release savepoint doorprobe').catch(() => {});
    ok(door === 'PERMITTED',
      'C6: the LIVE `clans creatable` / `join as self` client write path is BROKEN after this '
      + `sweep: ${door}. Those policies are live by design (2026-08-12-clan-members-rls-drop.sql, `
      + 'which closes them, is staged and refuses to apply until production has a real '
      + 'clan_ledger kind=\'member\' row) — so a grant sweep that takes their grant away puts clan '
      + 'founding and joining offline for every cached client with a 42501 nobody can read.');
    log('  ok   C6  none of the 17 has a write policy; clan_members/clans keep theirs, keep the '
      + 'grants behind them, are unbaselined, and their raw client path still works');
  } catch (e) {
    await db.query('reset role').catch(() => {});
    await db.query('rollback to savepoint doorprobe').catch(() => {});
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
        `C7/${id}: the migration APPLIED CLEANLY with the hostile state planted (${sc.why}). Its `
        + 'refuse-to-install check is not refusing.');
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
export async function clientWriteSweep4Guard() {
  checks = 0; fails = 0; problems = []; quiet = true;
  try {
    await run();
    return problems;
  } catch (e) {
    return [`client-write-sweep-4 guard failed to run — ${e?.message || e}`];
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

  log('Client write grant sweep — batch 4 (world_event_* + clan_* + maintenance_*, the last one)');
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
