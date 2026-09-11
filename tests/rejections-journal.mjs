#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rejections-journal.mjs — A REFUSAL LEAVES A TRACE, WITH ITS VERB,
//                                AND CHANGES NOTHING.
//                                GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/rejections-journal.mjs             # the guard
//   node tests/rejections-journal.mjs --list      # the mutation catalogue
//   node tests/rejections-journal.mjs --selftest  # every mutation must be CAUGHT
//   node tests/rejections-journal.mjs --mutate=<id>
//
// EXIT CODES: 0 green · 1 a property failed / a mutation was missed ·
//             2 HARNESS FAULT (nothing was graded; re-run alone)
//
// Ships with: supabase/migrations/2026-09-12-hr-rejections-journal.sql
//
// ── WHAT THIS EXISTS TO STOP GOING BACK ─────────────────────────────────
// 2026-09-11, Paione: 4-8 taps to equip a staff, and stop-combat snapping back
// into the fight — version_conflict refusals during a fight. His hr_rejections
// row for that day reads
//       version_conflict | intent='accrue' | n=10 | 07:19 -> 17:34
// The equips are IN that n=10. They are unreadable, because the aggregate key
// is (user_id, slot, day, code) and `intent` is last-writer-wins: every verb
// refused with the same code that day collapses into one label and the last
// one to arrive wins. The count survived; "which verb" did not.
//
// And most refusals never reached the journal at all. Measured on
// nezapsylztqbbwuwembx 2026-09-11 (pg_get_functiondef): hr_farm_plant had 12
// refusal sites and 0 recorder calls; hr_farm_water 9/0; hr_farm_harvest 7/0;
// hr_farm_upgrade_plot 8/0; hr_bank_move 11/0; hr_worker_hire 4/0;
// hr_worker_assign 8/0 — plus every DOMAIN refusal of every gated wrapper.
// Farming sat at zero from 2026-08-27 to 2026-09-06 and nobody could see it.
//
// ── THE THREE PROPERTIES, IN PRIORITY ORDER ─────────────────────────────
//   1. THE JOURNAL CANNOT CHANGE A VERDICT. Every edit the migration makes to
//      a live body wraps an already-computed envelope in a pass-through. If
//      that is ever false, this change is worse than the blindness it fixes —
//      so P5 compares the envelope byte for byte and P1 compares the recorded
//      code against the code the PLAYER was given, not against a literal.
//   2. A REFUSAL IS ATTRIBUTABLE. Code, verb, slot, count.
//   3. IT CANNOT BECOME game_events. One row per (user, slot, day, code) no
//      matter how many verbs; at most 25 keys in the map no matter what a
//      caller sends; at most one occurrence per transaction, i.e. per request.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the
// REAL rate-gated RPCs as `authenticated` with a JWT subject set.
//
// ⚠ IT REPLAYS THE **WHOLE** CHAIN — no `upTo` — ON PURPOSE. The migration is a
//   PATCHER of 56 bodies it does not own. A later migration that restates any
//   of them from a template silently deletes the seam (the b484-b487 wave).
//   CHAIN END is the only position from which P6 can see that.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · PRODUCTION's ACL, PostgREST, the pooler, or a real burst of concurrent
//     refusals. One PGlite backend is one backend.
//   · That anyone READS the journal. tools/vitals.mjs is the reader this change
//     ships; whether an operator runs it is an ops question.
//   · Cardinality at 100x players. The bound is structural (the key is a day
//     bucket and the map is capped), and P4 proves the cap on the real
//     function; it does not simulate 600 players.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MIG = '2026-09-12-hr-rejections-journal.sql';
const MIG_PATH = join(ROOT, 'supabase', 'migrations', MIG);

/* The seven self-gating player verbs. Named here as well as in the migration on
   purpose: a body quietly dropped from the migration's own list still fails the
   chain-end sweep here. They are the same seven tests/intent-mismatch.mjs
   guards, for the same reason — they answer the client directly. */
export const SELF_GATING = [
  'public.hr_bank_move(int,text,bigint,text,uuid)',
  'public.hr_farm_harvest(int,int,uuid)',
  'public.hr_farm_plant(int,int,text,uuid)',
  'public.hr_farm_upgrade_plot(int,uuid)',
  'public.hr_farm_water(int,int,uuid)',
  'public.hr_worker_assign(int,text,text,text,uuid)',
  'public.hr_worker_hire(int,uuid)',
];

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry breaks ONE property of the change; `--selftest` requires every one
   of them to be caught. `pairs` states several anchored replacements at once,
   which the mutations that would otherwise be refused by the migration's OWN
   self-check need: without softening that assertion the run throws, which
   counts as caught and proves nothing about this guard. */
const MUTATIONS = {
  seam_dropped_from_farm_water: {
    why: 'THE DEFECT ITSELF for one verb: hr_farm_water is dropped from the seven, so every '
       + 'empty_plot / still_watered / water_capped refusal a farmer sees goes back to leaving no '
       + 'trace. P1 and P6 must both catch it; P6 is the one that also catches a FUTURE migration '
       + 'restating the body from a template.',
    pairs: [
      // out of the patch list...
      ["    'public.hr_farm_water(int,int,uuid)',\n    'public.hr_worker_assign(int,text,text,text,uuid)',\n"
        + "    'public.hr_worker_hire(int,uuid)'];\n  c_verbs",
        "    'public.hr_worker_assign(int,text,text,text,uuid)',\n"
        + "    'public.hr_worker_hire(int,uuid)'];\n  c_verbs"],
      // ...and out of the parallel verb list, so the remaining six keep their labels
      ["    'farm_water', 'worker_assign', 'worker_hire'];", "    'worker_assign', 'worker_hire'];"],
      // ...and out of the migration's OWN coverage assertion, so the file still
      // applies and THIS guard has to be the thing that notices.
      ["    'public.hr_farm_water(int,int,uuid)',\n    'public.hr_worker_assign(int,text,text,text,uuid)',\n"
        + "    'public.hr_worker_hire(int,uuid)'];\nbegin",
        "    'public.hr_worker_assign(int,text,text,text,uuid)',\n"
        + "    'public.hr_worker_hire(int,uuid)'];\nbegin"],
    ],
  },
  wrapper_family_partly_skipped: {
    why: 'the wrapper sweep quietly skips every hr_claim_* verb — the shape a "let us not touch the '
       + 'claim verbs in the same change" note takes. Every daily, quest, rank, milestone and bounty '
       + 'claim goes back to refusing invisibly, which is the class that hid a broken goal board for '
       + 'a week. P1b (executed) and P6 (chain-end sweep) must both catch it.',
    pairs: [
      ["    v_src := replace(pg_get_functiondef(r.oid), chr(13), '');\n"
        + "    if position('hr_note_rejection' in v_src) > 0 then",
        "    v_src := replace(pg_get_functiondef(r.oid), chr(13), '');\n"
        + "    if r.proname like 'hr_claim%' then continue; end if;\n"
        + "    if position('hr_note_rejection' in v_src) > 0 then"],
      ['  if v_bad is not null then\n'
        + "    raise exception 'GATE(i): gated wrapper(s) without exactly one seam: %', v_bad;\n"
        + '  end if;', '  if false then null; end if;'],
    ],
  },
  cap_loosened: {
    why: 'the verb-map cap is raised from 24 to 100000, so a caller that can get 10,000 distinct '
       + 'verb labels refused in a day writes a 10,000-key jsonb into one row. That is game_events '
       + 'again, one column over — unbounded growth driven by a string the client influences. P4 '
       + 'must catch it.',
    find: "  c_cap  constant text := '24';",
    repl: "  c_cap  constant text := '100000';",
  },
  decorator_edits_the_envelope: {
    why: 'the decorator appends a key to the envelope it was asked to journal. This is the ONE '
       + 'thing this change must never do — a journal that can change a verdict is not a journal — '
       + 'and it is the shape a well-meaning "let the client know it was logged" patch takes. P5 '
       + 'must catch it (the migration\'s own GATE(b) is neutered here so the guard has to).',
    pairs: [
      ['    v_uid := auth.uid();\n    if v_uid is null then return p_result; end if;',
        '    v_uid := auth.uid();\n    if v_uid is null then return p_result; end if;\n'
        + "    p_result := p_result || jsonb_build_object('journalled', true);"],
      ["  if public.hr_note_rejection('probe', 0, '{\"ok\":false,\"error\":\"insufficient_gold\",\"need\":9}'::jsonb)\n"
        + "       is distinct from '{\"ok\":false,\"error\":\"insufficient_gold\",\"need\":9}'::jsonb then",
        '  if false then'],
    ],
  },
  accepted_calls_are_journalled: {
    why: 'the ok-check is inverted into "record everything", so every SUCCESSFUL call writes a row '
       + 'too. The journal stops meaning "refused", the incident index fills with normal play, and '
       + 'the write rate goes from "a refusal" to "a request". P2 must catch it.',
    find: "  if p_result is null or coalesce(p_result ->> 'ok', 'true') <> 'false' then\n    return p_result;\n  end if;",
    repl: '  if p_result is null then return p_result; end if;',
  },
  verbs_not_maintained_on_conflict: {
    why: 'the map is written on INSERT but not on the conflict path, so the first verb of the day '
       + 'is recorded and every later one is silently dropped — exactly Paione\'s row, which is the '
       + 'defect this change exists to fix, wearing a new column. P3 must catch it.',
    pairs: [
      ["  v_new := replace(v_new, c_a4,\n    c_a4 || chr(10)\n"
        + "    || '        verbs = public.hr_verb_bump(r.verbs, public.hr_rejection_verb(excluded.intent),'\n"
        + "    || ' greatest(1, coalesce(p_count, 1)), ' || c_cap || '),');",
        '  v_new := v_new;'],
      ["    if coalesce((v_row.verbs ->> 'accrue')::bigint, 0) <> 6\n"
        + "    or coalesce((v_row.verbs ->> 'equip:weapon')::bigint, 0) <> 4 then",
        '    if false then'],
    ],
  },
  service_role_revoke_dropped: {
    why: 'the four-role revoke on the decorator is narrowed to three, leaving service_role. '
       + 'MEASURED ON PRODUCTION 2026-08-30: pg_default_acl for FUNCTIONS owned by `postgres` in '
       + 'public is {postgres=X, service_role=X}, so a new function IS born service_role-executable '
       + 'there, while the PGlite fixture\'s default ACL is narrower and cannot show it. P7 (a '
       + 'static read of the migration text) is the only thing that can catch this class.',
    find: 'revoke execute on function public.hr_note_rejection(text, int, jsonb)\n'
        + '  from public, anon, authenticated, service_role;',
    repl: 'revoke execute on function public.hr_note_rejection(text, int, jsonb)\n'
        + '  from public, anon, authenticated;',
  },
  journal_readable_by_players: {
    why: 'a policy and a grant are added so a signed-in client can read its own hr_rejections rows. '
       + 'It buys a player nothing — the refusal already arrived in the envelope of the call they '
       + 'made — and it hands an attacker a live view of which probes are being recorded and at '
       + 'what SEVERITY, i.e. a feedback channel on the anomaly detector itself. P9 must catch it.',
    pairs: [
      ['alter table public.hr_rejections\n  add column if not exists verbs jsonb not null default \'{}\'::jsonb;',
        "alter table public.hr_rejections\n  add column if not exists verbs jsonb not null default '{}'::jsonb;\n"
        + 'do $mut$ begin\n'
        + "  if exists (select 1 from pg_roles where rolname = 'authenticated') then\n"
        + '    execute $g$grant select on public.hr_rejections to authenticated$g$;\n'
        + '    execute $g$drop policy if exists hr_rejections_own on public.hr_rejections$g$;\n'
        + '    execute $g$create policy hr_rejections_own on public.hr_rejections for select '
        + 'to authenticated using (user_id = auth.uid())$g$;\n'
        + '  end if;\nend $mut$;'],
      ["  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_rejections') then",
        '  if false then'],
      ["  if exists (select 1 from information_schema.role_table_grants\n"
        + "              where table_schema = 'public' and table_name = 'hr_rejections'\n"
        + "                and grantee in ('anon', 'authenticated', 'PUBLIC')) then",
        '  if false then'],
    ],
  },
  /* R1-R4 — the four defects the security review found in the first revision.
     Each one SHIPPED in 9a29ce71 and each one is now a mutation, because a fix
     with no failing test behind it is a fix that comes back. The shared second
     pair neuters the migration's own HR840 self-check so that THIS guard has to
     be the thing that notices; `raise` -> `null` on one handler is the smallest
     edit that does it. */
  rate_limited_decorated: {
    why: 'R1 REGRESSED: the decorator journals rate_limited again. hr_rpc_gate SAMPLES that code '
       + 'because a rate-limit storm is the one refusal a client produces as fast as it can open '
       + 'sockets; decorating it makes the server do MORE durable work the harder it is hammered, '
       + 'all serialised on one tuple, and double-counts against the gate. MEASURED: 200 gate-tripped '
       + 'hr_farm_water calls go from 63 writes to ~203. P11 must catch it.',
    pairs: [
      ["  -- R1: hr_rpc_gate owns this code, and it samples it. See the header.\n"
        + "  if p_result ->> 'error' = 'rate_limited' then\n    return p_result;\n  end if;\n", ''],
      ["    when sqlstate 'HR840' then raise;", "    when sqlstate 'HR840' then null;"],
    ],
  },
  slot_unfolded: {
    why: 'R2 REGRESSED: p_slot goes back to coalesce(p_slot, 0). It is part of the PRIMARY KEY and '
       + 'the client chooses it, so hr_farm_water(99999,…), hr_bank_move(2147483647,…) and '
       + 'hr_claim_daily(…,-7) each file a NEW row before the body refuses them — a row multiplier '
       + 'reachable from a browser, and every impossible slot blamed on slot 0. P12 must catch it.',
    pairs: [
      ['    v_slot := case when p_slot between 0 and 5 then p_slot else -1 end;      -- R2',
        '    v_slot := coalesce(p_slot, 0);'],
      ["    when sqlstate 'HR840' then raise;", "    when sqlstate 'HR840' then null;"],
    ],
  },
  code_unbounded: {
    why: 'R3 REGRESSED: `error` is written to the key column verbatim. It is server-authored today, '
       + 'so this is latent — until one body leaks sqlerrm into it and writes a 385-character primary '
       + 'key, or an `error` that is a number or an object becomes a key. A defect in an error path '
       + 'must not be able to grow the table. P13 must catch it.',
    pairs: [
      ["    v_code := case when v_err ~ '^[a-z0-9_]{1,64}$' then v_err else 'malformed_code' end;",
        "    v_code := coalesce(nullif(v_err, ''), 'unlabelled_refusal');"],
      ["    when sqlstate 'HR840' then raise;", "    when sqlstate 'HR840' then null;"],
    ],
  },
  non_jsonb_wrapper_patched: {
    why: 'R4 REGRESSED: the jsonb predicate is removed, so claim_beta_invite (json/json) is decorated. '
       + 'json -> jsonb is an ASSIGNMENT cast and PL/pgSQL resolves a call at FIRST EXECUTION, so the '
       + 'body installs, passes the length arithmetic, passes every static sweep — and the signup door '
       + 'raises "function hr_note_rejection(unknown, integer, json) does not exist" for the next '
       + 'player who claims an invite. P6b and P6c (the only executed probe) must catch it.',
    pairs: [
      ["    if r.ret is distinct from 'jsonb' or r.twin_ret is distinct from 'jsonb' then",
        '    if false then'],
      ["  if v_bad is not null then\n    raise exception 'GATE(i2)",
        "  if false then\n    raise exception 'GATE(i2)"],
    ],
  },
  once_per_transaction_dropped: {
    why: 'the transaction-local flag is never set, so a body that already recorded its own specific '
       + 'refusal is recorded AGAIN by its wrapper under a second code. Counts inflate, the '
       + 'escalation threshold (50) fires on honest play, and the write rate doubles on exactly the '
       + 'paths that refuse most. P10 must catch it.',
    pairs: [
      ["  if coalesce(current_setting('hearthrise.rejection_noted', true), '') = '1' then\n"
        + '    return p_result;\n  end if;', ''],
      // the migration's own GATE(g) would otherwise refuse the file, and a
      // mutation caught by the thing it mutates proves nothing about this guard
      ['    if v_n <> 2 then\n'
        + "      raise exception using errcode = 'HR840',\n"
        + "        message = format('GATE(g): the decorator double-counted a refusal the body had already '\n"
        + "                         'recorded (n=%s, expected 2)', v_n);\n"
        + '    end if;', '    if false then null; end if;'],
    ],
  },
};

const UUID = () => crypto.randomUUID();
const mutationPairs = (id) => MUTATIONS[id].pairs || [[MUTATIONS[id].find, MUTATIONS[id].repl]];
const mutationFile = (id) => MUTATIONS[id].file || MIG;

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const patches = mutate ? new Map([[mutationFile(mutate), mutationPairs(mutate)]]) : undefined;
  /* NO `upTo` — see the header. The property must hold at the END of the chain. */
  const { db } = await bootReplay({ patches });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`): PGlite runs each query in its own
     implicit transaction, so a `set local` GUC is gone by the next statement
     and auth.uid() would read NULL. */
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, one real character ──────────────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'rej@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  {
    const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
    if (cr?.ok !== true) {
      const e = new Error(`FIXTURE: hr_create_character(0) refused: ${JSON.stringify(cr)}`);
      e.harness = true; throw e;
    }
  }
  /* The character bootstrap itself may refuse something on its way in (it is a
     real verb on a real gate). Start the measurement from a clean sheet so
     every count below is about the probe that produced it. */
  await q('delete from public.hr_rejections where user_id = $1', [uid]);

  const rows = () => q('select slot, code, severity, intent, n::text as n, verbs '
    + 'from public.hr_rejections where user_id = $1 order by code', [uid]);

  const obs = {};

  // ── P1/P5. A REFUSED SELF-GATING VERB: one row, the player's own code,
  //           and an envelope that did not move. ─────────────────────────
  await gate();
  obs.p1_envelope = await asUser(uid, 'select public.hr_farm_water(0, 0, $1) as r', [UUID()]);
  obs.p1_rows = await rows();

  // ── P1b. A REFUSED GATED WRAPPER ──────────────────────────────────────
  //    The wrapper family is decorated by a DIFFERENT edit from the seven, and
  //    plpgsql resolves a body's identifiers on FIRST CALL, not at creation —
  //    so a wrapper whose `p_slot` reference were wrong would compile, install,
  //    pass every static sweep, and blow up at runtime on the refusal path. It
  //    has to be executed, not read.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await gate();
  obs.p1b_envelope = await asUser(uid,
    'select public.hr_claim_daily($1, 0) as r', ['__no_such_task__']);
  obs.p1b_rows = await rows();

  // ── P2. AN ACCEPTED CALL WRITES NOTHING ───────────────────────────────
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await gate();
  obs.p2_envelope = await asUser(uid, 'select public.hr_put_client_state(0, $1::jsonb, $2) as r',
    [JSON.stringify({ ui: { tab: 'home' } }), UUID()]);
  obs.p2_rows = await rows();

  // ── P3. THE PAIONE CASE: two VERBS, one CODE, one day ─────────────────
  //    hr_farm_water and hr_farm_harvest both answer `empty_plot` on an empty
  //    plot. Before this change they shared one row and the later one erased
  //    the earlier one's label.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await gate();
  obs.p3_water = await asUser(uid, 'select public.hr_farm_water(0, 0, $1) as r', [UUID()]);
  await gate();
  obs.p3_harvest = await asUser(uid, 'select public.hr_farm_harvest(0, 0, $1) as r', [UUID()]);
  obs.p3_rows = await rows();

  // ── P4. THE MAP CAP, driven through the REAL RECORDER ─────────────────
  //    The cap is what makes it safe to key a map on a token that part of a
  //    client string can reach. It is exercised through hr_record_rejection
  //    rather than by calling hr_verb_bump with a cap of this guard's own
  //    choosing: the number that matters is the one BAKED INTO THE RECORDER by
  //    the migration, and a probe that supplies its own cap would stay green
  //    while the installed one was raised to 100,000.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await db.exec(`do $probe$ declare i int; begin
    for i in 1 .. 200 loop
      perform public.hr_record_rejection('${uid}'::uuid, 0, 'verb' || i::text,
        'version_conflict', '{}'::jsonb, 1);
    end loop;
  end $probe$;`);
  obs.p4cap = (await q(`
    select (select count(*) from jsonb_object_keys(verbs))::text as keys,
           (select coalesce(sum(value::bigint), 0) from jsonb_each_text(verbs))::text as total,
           (verbs ? '(other)') as has_other,
           n::text as n
      from public.hr_rejections where user_id = $1 and code = 'version_conflict'`, [uid]))[0];

  // ── P11. R1: THE §6c-ii WRITE AMPLIFIER MUST NOT COME BACK ────────────
  //    hr_rpc_gate SAMPLES its rate_limited records precisely because a
  //    rate-limit storm is the one refusal a client can produce as fast as it
  //    can open sockets. The S7 sweep decorated the seven verbs' `rate_limited`
  //    early return and re-created the amplifier on hr_bank_move and the four
  //    farm verbs. This is measured, not read: 200 calls with the gate tripped,
  //    inside ONE transaction so pg_stat_get_xact_* gives an EXACT write count
  //    (the once-flag is cleared between calls, which is what N separate
  //    requests do). Nothing here is typed: the gate's limit is derived from
  //    how many real refusals got through, and the expected sampled total from
  //    the server's own hr_rate_sample_weight.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await gate();
  await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const STORM = 200;
  /* A DELTA, not an absolute. MEASURED 2026-09-12: PGlite does not reset the
     pg_stat_get_xact_* counters between transactions the way a server backend
     does, so reading them once after the storm charges it with every write the
     earlier probes made (P4 alone does 200). A guard that reports 267 writes
     for a 63-write storm is a guard that fires on its own bookkeeping. */
  await db.exec(`begin;
    create temp table __storm0 as
      select (pg_stat_get_xact_tuples_inserted(c.oid)
            + pg_stat_get_xact_tuples_updated(c.oid))::bigint as w
        from pg_class c where c.oid = 'public.hr_rejections'::regclass;
    do $storm$ declare i int; begin
      for i in 1 .. ${STORM} loop
        perform set_config('hearthrise.rejection_noted', '', true);
        perform public.hr_farm_water(0, 0, gen_random_uuid());
      end loop;
    end $storm$;
    create temp table __storm as
      select (pg_stat_get_xact_tuples_inserted(c.oid)
            + pg_stat_get_xact_tuples_updated(c.oid)
            - (select w from __storm0))::bigint as w
        from pg_class c where c.oid = 'public.hr_rejections'::regclass;
    commit;`);
  obs.p11 = (await q(`
    select (select w::text from __storm) as writes,
           (select coalesce(sum(n), 0)::text from public.hr_rejections
             where user_id = $1 and code = 'rate_limited') as n_rate_limited,
           (select coalesce(sum(n), 0)::text from public.hr_rejections
             where user_id = $1 and code <> 'rate_limited') as n_passed,
           (select coalesce(sum(public.hr_rate_sample_weight(i)), 0)::text
              from generate_series(1, greatest(0, ${STORM}
                   - (select coalesce(sum(n), 0)::int from public.hr_rejections
                       where user_id = $1 and code <> 'rate_limited'))) i) as expected_sampled`,
  [uid]))[0];
  await q('drop table if exists __storm');
  await q('drop table if exists __storm0');

  // ── P12. R2: p_slot IS AN AGGREGATE KEY AND THE CLIENT CHOOSES IT ─────
  //    Driven through the REAL RPC, with the slot the client would send.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await gate();
  obs.p12_env = await asUser(uid, 'select public.hr_farm_water(99999, 0, $1) as r', [UUID()]);
  await gate();
  await asUser(uid, 'select public.hr_farm_water(2147483647, 0, $1) as r', [UUID()]);
  await gate();
  await asUser(uid, 'select public.hr_farm_water(-7, 0, $1) as r', [UUID()]);
  obs.p12_rows = await rows();

  // ── P13. R3: SO IS `code`, AND ONE DAY A BODY WILL LEAK sqlerrm INTO IT
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec(`begin;
    select set_config('hearthrise.rejection_noted', '', true);
    select public.hr_note_rejection('farm_water', 0,
      jsonb_build_object('ok', false, 'error', repeat('E', 385)));
    commit;`);
  obs.p13_long = (await q(
    'select code, n::text as n, last_detail from public.hr_rejections where user_id = $1', [uid]))[0];
  await db.exec(`begin;
    select set_config('hearthrise.rejection_noted', '', true);
    select public.hr_note_rejection('farm_water', 0,
      jsonb_build_object('ok', false, 'error', jsonb_build_object('a', 1)));
    commit;`);
  await db.exec(`begin;
    select set_config('hearthrise.rejection_noted', '', true);
    select public.hr_note_rejection('farm_water', 0,
      '{"ok":false,"error":"Vault; DROP TABLE x --"}'::jsonb);
    commit;`);
  await db.exec(`begin;
    select set_config('hearthrise.rejection_noted', '', true);
    select public.hr_note_rejection('farm_water', 0,
      '{"ok":false,"error":"insufficient_seed"}'::jsonb);
    commit;`);
  obs.p13_rows = await rows();

  // ── P6. CHAIN-END SWEEP ───────────────────────────────────────────────
  //    The jsonb predicate is R4's: hr_note_rejection takes and returns jsonb,
  //    json -> jsonb is an ASSIGNMENT cast, and PL/pgSQL resolves a call at
  //    first EXECUTION — so a json wrapper (claim_beta_invite) decorated here
  //    installs clean, passes every text sweep, and kills the signup door the
  //    first time a player claims an invite. Those wrappers must be SKIPPED,
  //    and P6b asserts the skip from both sides.
  obs.p6_wrappers_missing = (await q(`
    select coalesce(string_agg(p.proname, ', ' order by p.proname), '') as r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and exists (select 1 from pg_proc q2 join pg_namespace m on m.oid = q2.pronamespace
                    where m.nspname = 'public' and q2.proname = p.proname || '__ungated')
       and pg_get_function_result(p.oid) = 'jsonb'
       and coalesce((select pg_get_function_result(q2.oid) from pg_proc q2
                       join pg_namespace m on m.oid = q2.pronamespace
                      where m.nspname = 'public' and q2.proname = p.proname || '__ungated' limit 1), '')
           = 'jsonb'
       and (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\\(', 'g')) <> 1`))[0].r;
  obs.p6b_non_jsonb_decorated = (await q(`
    select coalesce(string_agg(p.proname, ', ' order by p.proname), '') as r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and position('hr_note_rejection' in p.prosrc) > 0
       and exists (select 1 from pg_proc q2 join pg_namespace m on m.oid = q2.pronamespace
                    where m.nspname = 'public' and q2.proname = p.proname || '__ungated')
       and (pg_get_function_result(p.oid) <> 'jsonb'
         or coalesce((select pg_get_function_result(q2.oid) from pg_proc q2
                        join pg_namespace m on m.oid = q2.pronamespace
                       where m.nspname = 'public' and q2.proname = p.proname || '__ungated' limit 1), '')
             <> 'jsonb')`))[0].r;
  /* POSITIVE CONTROL. If claim_beta_invite ever returns jsonb the R4 predicate
     stops being exercised by anything, and P6b would go green by covering
     nothing — the always-null-probe family. Name it, so that day is loud. */
  obs.p6b_control = (await q(
    "select pg_get_function_result(oid) as r from pg_proc where oid = 'public.claim_beta_invite(text)'::regprocedure"))[0]?.r;
  /* AND THE RUNTIME PROOF, which is the only thing that could have caught this:
     call the json wrapper for real. A decorated body raises 42883 "function
     hr_note_rejection(unknown, integer, json) does not exist" HERE and nowhere
     earlier. */
  /* Called as the OWNER, not as `authenticated`: the PGlite fixture does not
     reproduce the platform's grant on this verb (`permission denied for
     function claim_beta_invite`), and the defect being probed is CALL
     RESOLUTION, which does not care about the caller's role. */
  await gate();
  await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  obs.p6c_json_call = await db.query('select public.claim_beta_invite($1) as r', ['__no_such_code__'])
    .then((r) => ({ ok: true, r: r.rows[0]?.r }))
    .catch((e) => ({ ok: false, err: String(e?.message || e) }));
  obs.p6_wrapper_count = Number((await q(`
    select count(*)::text as r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and exists (select 1 from pg_proc q2 join pg_namespace m on m.oid = q2.pronamespace
                    where m.nspname = 'public' and q2.proname = p.proname || '__ungated')`))[0].r);
  obs.p6_seven = {};
  for (const sig of SELF_GATING) {
    const r = (await q(
      "select position('hr_note_rejection' in p.prosrc) > 0 as seam,"
      + " (p.prosrc ~ 'return jsonb_build_object\\(''ok'', false') as bare,"
      + " (p.prosrc ~ '''intent_mismatch'' then return v_[a-z_]+;') as bare_mismatch"
      + ' from pg_proc p where p.oid = $1::regprocedure', [sig]))[0];
    obs.p6_seven[sig] = r || null;
  }

  // ── P9. THE JOURNAL IS NOT CLIENT-REACHABLE ───────────────────────────
  obs.p9 = (await q(`
    select
      (select count(*) from pg_policies
        where schemaname='public' and tablename='hr_rejections')::text as policies,
      (select count(*) from information_schema.role_table_grants
        where table_schema='public' and table_name='hr_rejections'
          and grantee in ('anon','authenticated','PUBLIC'))::text as grants,
      (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='hr_rejections') as rls,
      (select count(*)::text from unnest(array[
         'public.hr_note_rejection(text,int,jsonb)',
         'public.hr_rejection_verb(text)',
         'public.hr_verb_bump(jsonb,text,bigint,int)',
         'public.hr_detail_bound(jsonb)']) f
        where has_function_privilege('authenticated', f, 'execute')
           or has_function_privilege('anon', f, 'execute')) as fn_reachable`))[0];

  // ── P10. ONE OCCURRENCE PER TRANSACTION ───────────────────────────────
  //    A body that recorded its own specific code must not be recorded a
  //    second time by its wrapper in the same request.
  await q('delete from public.hr_rejections where user_id = $1', [uid]);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec(`begin;
    select public.hr_record_rejection('${uid}'::uuid, 0, 'farm_water', 'still_watered', '{}'::jsonb, 1);
    select public.hr_note_rejection('farm_water', 0, '{"ok":false,"error":"still_watered"}'::jsonb);
    commit;`);
  obs.p10_same_txn = Number((await q(
    "select coalesce(sum(n),0)::text as r from public.hr_rejections where user_id=$1 and code='still_watered'",
    [uid]))[0].r);
  /* …and the suppression is TRANSACTION-scoped, not permanent: the next request
     records again. A flag that never cleared would be a silent blindfold. */
  await db.exec(`begin;
    select public.hr_note_rejection('farm_water', 0, '{"ok":false,"error":"still_watered"}'::jsonb);
    commit;`);
  obs.p10_next_txn = Number((await q(
    "select coalesce(sum(n),0)::text as r from public.hr_rejections where user_id=$1 and code='still_watered'",
    [uid]))[0].r);

  // ── P8. A SECOND APPLY IS A NO-OP (byte-identical) ────────────────────
  const fingerprint = async () => (await q(
    "select md5(string_agg(p.proname || ':' || md5(p.prosrc), ',' order by p.proname, p.oid)) as r"
    + ' from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
    + " where n.nspname = 'public'"))[0].r;
  const before = await fingerprint();
  let reapplyError = null;
  try {
    let sql = await readFile(MIG_PATH, 'utf8');
    sql = sql.replace(/\r\n/g, '\n');
    if (patches) for (const [find, repl] of mutationPairs(mutate)) sql = sql.split(find).join(repl);
    await db.exec(`begin;\n${sql}\ncommit;`);
  } catch (e) {
    reapplyError = String(e && e.message || e);
    // WITHOUT this the connection is left in an aborted transaction and every
    // later read throws "current transaction is aborted" — which the selftest
    // would report as CAUGHT while grading nothing. A guard that passes by
    // crashing is the always-null-probe family.
    await db.exec('rollback').catch(() => {});
  }
  obs.p8 = { before, after: await fingerprint(), error: reapplyError };

  await db.close?.();
  return obs;
}

function grade(obs, migText) {
  // ── P1. a refused verb leaves exactly one row, carrying the player's code
  const env = obs.p1_envelope;
  ok(env && env.ok === false, `P1: hr_farm_water on an empty plot did not refuse: ${JSON.stringify(env)}`);
  ok(obs.p1_rows.length === 1,
    `P1: a refused farm_water wrote ${obs.p1_rows.length} hr_rejections row(s), expected exactly 1`);
  if (obs.p1_rows.length === 1) {
    const r = obs.p1_rows[0];
    ok(r.code === env?.error,
      `P1: the journal recorded code="${r.code}" but the PLAYER was told "${env?.error}" — the trace `
      + 'must be the reason the player got, never a paraphrase');
    ok(Number(r.slot) === 0, `P1: the refusal was filed under slot ${r.slot}, not the character it happened on`);
    ok(Number(r.n) === 1, `P1: n=${r.n} for a single refusal`);
    ok(r.verbs && Number(r.verbs.farm_water) === 1,
      `P1: the verb was not recorded (verbs=${JSON.stringify(r.verbs)}) — this is the whole point`);
  }
  // ── P5. the envelope did not move
  ok(env && Object.keys(env).length === 2 && 'ok' in env && 'error' in env,
    `P5: the refusal envelope grew or lost keys across the decorator: ${JSON.stringify(env)}`);

  // ── P1b. a refused GATED WRAPPER, executed
  const envB = obs.p1b_envelope;
  ok(envB && envB.ok === false,
    `P1b: hr_claim_daily on an unknown task did not refuse: ${JSON.stringify(envB)}`);
  ok(obs.p1b_rows.length === 1,
    `P1b: a refused gated wrapper wrote ${obs.p1b_rows.length} row(s), expected exactly 1 — the `
    + 'wrapper family is decorated by a different edit from the seven and has to be executed');
  if (obs.p1b_rows.length === 1) {
    const r = obs.p1b_rows[0];
    ok(r.code === envB?.error,
      `P1b: the journal recorded "${r.code}" but the player was told "${envB?.error}"`);
    ok(r.verbs && Number(r.verbs.hr_claim_daily) === 1,
      `P1b: the wrapper's verb was not recorded (verbs=${JSON.stringify(r.verbs)})`);
  }

  // ── P2. an accepted call writes nothing
  ok(obs.p2_envelope && obs.p2_envelope.ok === true,
    `P2: the fixture's accepted call did not succeed: ${JSON.stringify(obs.p2_envelope)}`);
  ok(obs.p2_rows.length === 0,
    `P2: an ACCEPTED call wrote ${obs.p2_rows.length} rejection row(s) — the journal stops meaning `
    + '"refused" and the write rate becomes one per request');

  // ── P3. two verbs, one code, ONE row, both counted
  ok(obs.p3_water?.error === obs.p3_harvest?.error,
    `P3: the probe needs two verbs answering ONE code; got ${obs.p3_water?.error} and `
    + `${obs.p3_harvest?.error}`);
  ok(obs.p3_rows.length === 1,
    `P3: two verbs of one code produced ${obs.p3_rows.length} rows — the aggregate shape is gone and `
    + 'this is game_events again (1.6M rows / 229 MB from six players in four days)');
  if (obs.p3_rows.length === 1) {
    const r = obs.p3_rows[0];
    ok(Number(r.n) === 2, `P3: n=${r.n}, expected 2`);
    ok(Number(r.verbs?.farm_water) === 1 && Number(r.verbs?.farm_harvest) === 1,
      `P3: verbs=${JSON.stringify(r.verbs)} — Paione's row (one label, last writer wins) is NOT fixed`);
  }

  // ── P4. the cap bites and the total stays exact
  const cap = obs.p4cap;
  ok(cap && Number(cap.keys) <= 25,
    `P4: 200 distinct verbs produced ${cap?.keys} keys in ONE row — the cap the recorder actually `
    + 'uses does not bite, and the map is a growth vector driven by a string the client influences');
  ok(cap && cap.has_other === true, 'P4: the overflow was DROPPED instead of counted under (other)');
  ok(cap && Number(cap.total) === 200 && Number(cap.n) === 200,
    `P4: the map totals ${cap?.total} and n is ${cap?.n} of 200 refusals — the two disagree, so the `
    + 'breakdown cannot be trusted against the count');

  // ── P11. R1 — the rate-limit storm, measured
  const st = obs.p11;
  const writes = Number(st?.writes);
  const passed = Number(st?.n_passed);
  ok(passed > 0 && passed < 200,
    `P11: the storm produced ${passed} gate-passing refusals out of 200 — the gate did not trip, so `
    + 'nothing about rate_limited was measured');
  ok(writes <= passed + 3,
    `P11: 200 gate-tripped calls made ${writes} durable writes to hr_rejections (budget ${passed + 3} `
    + `= ${passed} real refusals + the gate's 3 sampled records). The §6c-ii write amplifier is back: `
    + 'a client can drive one tuple as fast as it can open sockets');
  ok(Number(st?.n_rate_limited) === Number(st?.expected_sampled),
    `P11: rate_limited counts ${st?.n_rate_limited}, but hr_rate_sample_weight accounts for `
    + `${st?.expected_sampled}. The journal is double-counting against the gate's own sampled record, `
    + 'so the number an operator reads is wrong in the one place it is easiest to flood');

  // ── P12. R2 — a client-chosen slot cannot multiply rows
  ok(obs.p12_env && obs.p12_env.ok === false,
    `P12: hr_farm_water on slot 99999 did not refuse: ${JSON.stringify(obs.p12_env)}`);
  ok(obs.p12_rows.length === 1,
    `P12: three out-of-range slots produced ${obs.p12_rows.length} rows — p_slot is part of the `
    + 'primary key and the client picks it, so this is a row multiplier reachable from a browser');
  ok(obs.p12_rows[0] && Number(obs.p12_rows[0].slot) === -1,
    `P12: an impossible slot was filed as ${obs.p12_rows[0]?.slot} — either stored verbatim, or `
    + 'silently blamed on slot 0, which attributes a refusal to a character that did not make it');

  // ── P13. R3 — a caller-shaped code cannot become an unbounded key
  ok(obs.p13_long?.code === 'malformed_code',
    `P13: a 385-character error was stored as the primary key ("${String(obs.p13_long?.code).slice(0, 40)}…")`);
  ok(String(obs.p13_long?.last_detail?.raw_error ?? '').length === 120,
    `P13: the raw error was carried into the detail as `
    + `${String(obs.p13_long?.last_detail?.raw_error ?? '').length} characters, expected 120 — `
    + 'bounded, and kept, so the bucket stays diagnosable');
  {
    const mal = obs.p13_rows.find((r) => r.code === 'malformed_code');
    ok(obs.p13_rows.length === 2,
      `P13: three malformed codes and one good one produced ${obs.p13_rows.length} rows, expected 2 `
      + '(one malformed_code bucket + insufficient_seed)');
    ok(mal && Number(mal.n) === 3,
      `P13: the malformed bucket counts ${mal?.n} of 3 — folding lost occurrences`);
    ok(obs.p13_rows.some((r) => r.code === 'insufficient_seed'),
      'P13: a legitimate machine code was eaten by the shape test');
  }

  // ── P6. chain-end sweep
  ok(obs.p6_wrappers_missing === '',
    `P6: gated wrapper(s) without exactly one seam at CHAIN END: ${obs.p6_wrappers_missing} — a later `
    + 'migration restated the body and deleted the journalling (the b484-b487 class). Re-apply '
    + `supabase/migrations/${MIG}`);
  ok(obs.p6_wrapper_count >= 40,
    `P6: only ${obs.p6_wrapper_count} gated wrappers exist — discovery is broken or the client surface `
    + 'shrank unnoticed (49 measured 2026-09-11)');

  // ── P6b/P6c. R4 — a wrapper that does not return jsonb is SKIPPED
  ok(obs.p6b_non_jsonb_decorated === '',
    `P6b: non-jsonb wrapper(s) carry the decorator: ${obs.p6b_non_jsonb_decorated}. json → jsonb is an `
    + 'ASSIGNMENT cast, so that body installs, passes every text sweep, and then raises "function '
    + 'hr_note_rejection(unknown, integer, json) does not exist" the first time a player calls it');
  ok(obs.p6b_control === 'json',
    `P6b: claim_beta_invite now returns "${obs.p6b_control}", not json — it was the ONLY non-jsonb `
    + 'wrapper measured (2026-09-11) and therefore the only thing exercising the R4 predicate. '
    + 'Find another control or this check is covering nothing');
  ok(obs.p6c_json_call?.ok === true,
    `P6c: calling the json wrapper claim_beta_invite RAISED: ${obs.p6c_json_call?.err}. This is the `
    + 'only probe that can see R4 — the signup door is dead and every static sweep was green');
  for (const [sig, r] of Object.entries(obs.p6_seven)) {
    ok(r && r.seam === true, `P6: ${sig} carries no seam at CHAIN END`);
    ok(r && r.bare === false, `P6: ${sig} still returns a refusal that nothing records`);
    ok(r && r.bare_mismatch === false,
      `P6: ${sig}'s intent_mismatch early return is undecorated — the most likely automated-retry `
      + 'refusal of a money verb stays invisible');
  }

  // ── P7. static: revoke-before-grant, four roles, on every new function
  for (const sig of ['public.hr_note_rejection(text, int, jsonb)',
    'public.hr_rejection_verb(text)',
    'public.hr_verb_bump(jsonb, text, bigint, int)',
    'public.hr_detail_bound(jsonb)']) {
    const re = new RegExp('revoke execute on function ' + sig.replace(/[().*+?[\]\\|^$]/g, '\\$&')
      + '\\s*\\n?\\s*from public, anon, authenticated, service_role;');
    ok(re.test(migText),
      `P7: ${sig} is not revoked from all four of public/anon/authenticated/service_role in the `
      + 'migration text. Production\'s default ACL grants service_role EXECUTE on a new function '
      + '(measured 2026-08-30); PGlite\'s is narrower and cannot show it, so this static read is '
      + 'the only thing that can');
  }
  ok(!/create\s+policy[\s\S]{0,200}hr_rejections/i.test(migText),
    'P7: the migration creates a policy on hr_rejections — the journal is ops-only by design');

  // ── P9. the journal is not client-reachable
  ok(Number(obs.p9.policies) === 0,
    `P9: ${obs.p9.policies} policy/policies on hr_rejections — a client read of the anomaly `
    + 'detector is a feedback channel for whoever is probing it');
  ok(Number(obs.p9.grants) === 0, `P9: ${obs.p9.grants} client grant(s) on hr_rejections`);
  ok(obs.p9.rls === true, 'P9: RLS is OFF on hr_rejections');
  ok(Number(obs.p9.fn_reachable) === 0,
    `P9: ${obs.p9.fn_reachable} of the new functions are client-executable — a recorder that a `
    + 'client can call is a recorder a client can flood');

  // ── P10. one occurrence per transaction, and the flag clears
  ok(obs.p10_same_txn === 1,
    `P10: a refusal recorded by a body and then handed to its wrapper counted ${obs.p10_same_txn} `
    + 'times in ONE transaction — counts inflate, the 50-hit escalation fires on honest play, and '
    + 'the write rate doubles on the paths that refuse most');
  ok(obs.p10_next_txn === 2,
    `P10: the NEXT transaction recorded nothing (total still ${obs.p10_next_txn}) — the suppression `
    + 'flag is not transaction-scoped and is now a permanent blindfold');

  // ── P8. a second apply is byte-identical
  ok(obs.p8.error === null, `P8: re-applying ${MIG} onto the finished chain FAILED: ${obs.p8.error}`);
  ok(obs.p8.before === obs.p8.after,
    'P8: a second apply changed a function body — the migration is not idempotent, so an operator '
    + 'who re-runs it after a template restatement double-wraps a live verb');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    console.log('rejections-journal mutations:\n');
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id}\n      ${m.why}\n`);
    return 0;
  }
  const migText = (await readFile(MIG_PATH, 'utf8')).replace(/\r\n/g, '\n');
  const one = argv.find((a) => a.startsWith('--mutate='))?.slice('--mutate='.length);

  if (argv.includes('--selftest')) {
    let missed = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let threw = null;
      try {
        await runGraded(id, migText);
      } catch (e) {
        if (e?.harness) { console.error(`HARNESS FAULT during ${id}: ${e.message}`); return 2; }
        threw = String(e?.message || e);
      }
      const caught = problems.length > 0 || threw !== null;
      console.log(`  ${caught ? 'CAUGHT ' : 'MISSED '} ${id}`
        + (threw ? `  (raised: ${threw.slice(0, 110)})` : `  (${problems.length} failure(s))`));
      if (!caught) missed += 1;
    }
    console.log(missed === 0
      ? `\nrejections-journal --selftest: ${Object.keys(MUTATIONS).length}/${Object.keys(MUTATIONS).length} mutations CAUGHT`
      : `\nrejections-journal --selftest: ${missed} mutation(s) MISSED`);
    return missed === 0 ? 0 : 1;
  }

  problems.length = 0;
  try {
    await runGraded(one, migText);
  } catch (e) {
    if (e?.harness) { console.error(`HARNESS FAULT: ${e.message}`); return 2; }
    console.error(`rejections-journal: the run threw: ${e?.message || e}`);
    return 1;
  }
  if (problems.length) {
    console.error('rejections-journal: RED\n');
    for (const p of problems) console.error(`  x ${p}`);
    return 1;
  }
  console.log('rejections-journal: OK — a refusal leaves one attributable row with its verb, an '
    + 'accepted call leaves none, two verbs of one code stay one row with both counted, the map is '
    + 'capped at 25 keys with an exact total, every JSONB gated wrapper and all seven self-gating '
    + 'verbs carry the seam at chain end while the json one is skipped and still callable, a '
    + '200-call rate-limit storm costs 63 writes and leaves the gate\'s sampled count exact, an '
    + 'out-of-range slot folds to -1 and a caller-shaped code to malformed_code, the envelope is '
    + 'byte-identical across the decorator, one occurrence per transaction, and a second apply is '
    + 'a no-op.');
  return 0;
}

/** One replay + one grading pass. A mutation is applied to BOTH the database
 *  (through bootReplay's patcher, which requires the anchor to match exactly
 *  once) and to the migration TEXT the static half of grade() reads, so a
 *  mutation cannot be caught by one half while silently no-opping in the other. */
async function runGraded(mutate, migText) {
  const obs = await run(mutate);
  let text = migText;
  if (mutate) for (const [find, repl] of mutationPairs(mutate)) text = text.split(find).join(repl);
  grade(obs, text);
  return obs;
}

process.exit(await main());
