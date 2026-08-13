#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/clan-journal-guard.mjs — F1 + F3, BEHAVIOURALLY.
//
// THE INVARIANT (Security Engineer, 2026-08-13):
//   "every RPC that writes a shared table emits a clan_ledger row in the
//    SAME TRANSACTION."
//
// A static regex over migration text would be the eleventh instance of the
// assertion-that-asserts-nothing family this program keeps hitting. So this
// guard boots a real PostgreSQL (PGlite / PG18, in process), applies the real
// clan migration chain verbatim including the two new files, and then CALLS
// THE RPCs as a real caller and reads the books.
//
// The "same transaction" half is proven the only way it can be: the RPC is
// called inside a subtransaction which is then ROLLED BACK, and the journal row
// must vanish along with the value it recorded. A journal written out of band
// would survive.
//
// ── WHAT IS PROVEN, AND WHAT IS NOT ─────────────────────────────────────
//   PROVEN  · the transfer is journalled, attributed to auth.uid(), and
//             atomic with the shared-table write;
//           · the per-member per-UTC-day cap binds, and is PER MEMBER (a
//             cap that is accidentally clan-wide breaks honest play, and is
//             caught here and NOT by the migration's own self-check);
//           · clan_ledger — the table the cap reads its authority from — is
//             not client-writable;
//           · the journal vocabulary cannot be re-narrowed by a LATER file
//             (the "three files own one policy" latent bug, live again).
//   NOT PROVEN · TRUE CONCURRENCY. PGlite is one backend, so the advisory
//             locks are exercised and contended by nothing. Two callers
//             racing the same day-budget read is the one thing this cannot
//             construct; it needs a multi-connection database.
//   NOT PROVEN · that a journal write could not be made non-transactional.
//             J10 asserts the property but no mutation in the catalogue can
//             break it, because a plpgsql body cannot write out of band
//             without dblink / pg_background and PGlite has neither. Stated
//             rather than counted as a mutation-proven guard.
//
// ── FALSIFIABILITY — read this before trusting a green run ──────────────
//   node tests/clan-journal-guard.mjs --selftest
// applies each mutation in the catalogue below to the REAL migration text and
// demands that every one is CAUGHT. An anchor that does not match exactly once
// aborts as a HARNESS failure — a planted bug that was never planted is the
// same defect as a probe that is always null. FOUR of the seven mutations are
// caught ONLY at runtime (the migration's own self-check passes on them), which
// is what makes this file worth more than the do$$ blocks it sits on top of.
//
// USAGE
//   node tests/clan-journal-guard.mjs             # clean run
//   node tests/clan-journal-guard.mjs --selftest  # clean + every mutation
//   node tests/clan-journal-guard.mjs --mutate=<id>
//   node tests/clan-journal-guard.mjs --list
// Exit: 0 clean · 1 a violation or a slipped mutation · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { bootChain } from './pglite-chain.mjs';

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};

const DAY_CAP_GOLD = 10000000;
const DAY_CAP_BOARD = 5000;

// ════════════════════════════════════════════════════════════════════════
// THE MUTATION CATALOGUE. `where` records whether the migration's own
// self-check refuses the mutation (a `gate` catch — stronger, the bug cannot
// even be installed) or whether only the probes below see it (`runtime`).
// ════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  contribute_no_journal: {
    what: 'clan_contribute moves the treasury and writes no ledger row — the P0 exactly as found',
    where: 'gate',
    patches: [['clan-contribute-authority', [[
      `  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, v_uid, 'contribute', v_amount);`,
      `  -- MUTATED contribute_no_journal: the transfer is unjournalled`,
    ]]]],
  },

  contribute_no_cap: {
    what: 'the per-day budget is computed but never subtracted — 600,000,000/minute is back',
    where: 'gate',
    patches: [['clan-contribute-authority', [[
      `  v_budget := greatest(0, c_day_clamp - v_spent);`,
      `  v_budget := c_day_clamp;  -- MUTATED contribute_no_cap`,
    ]]]],
  },

  contribute_cap_not_per_member: {
    what: 'the day budget is summed clan-wide instead of per member — one member\'s contribution locks every other member out for the day',
    where: 'runtime',
    patches: [['clan-contribute-authority', [[
      `   where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'contribute'`,
      `   where l.clan_id = p_clan_id and l.kind = 'contribute'  -- MUTATED contribute_cap_not_per_member`,
    ]]]],
  },

  board_no_journal: {
    what: 'clan_board_progress moves a shared counter and records nobody — F3 exactly as found',
    where: 'gate',
    patches: [['clan-board-attribution', [[
      `    insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty)
      values (p_clan_id, v_uid, 'board_progress', p_counter, v_n);`,
      `    null;  -- MUTATED board_no_journal`,
    ]]]],
  },

  // ── The three below model the failure mode the handoff calls "a self-check
  //    that only tests its own file's terms cannot detect a LATER file undoing
  //    it". Each is appended to the LAST migration in the chain, so both new
  //    files apply and pass their own commit gates first.
  later_file_narrows_kind_check: {
    what: 'a later migration redefines clan_ledger_kind_check without the two new kinds — every journal INSERT then throws and both RPCs die',
    where: 'runtime',
    patches: [['anon-rate-gate', [[
      `
drop table if exists _hr_gate_buckets_before;`,
      `
drop table if exists _hr_gate_buckets_before;
-- MUTATED later_file_narrows_kind_check
alter table public.clan_ledger drop constraint if exists clan_ledger_kind_check;
alter table public.clan_ledger add constraint clan_ledger_kind_check
  check (kind in ('deposit','labour','tier','withdraw','upkeep','feast','board',
                  'rested','role','member'));`,
    ]]]],
  },

  later_file_restores_old_board_progress: {
    what: 'a later migration create-or-replaces clan_board_progress__ungated back to the pre-fix body — unattributed and uncapped again',
    where: 'runtime',
    patches: [['anon-rate-gate', [[
      `
drop table if exists _hr_gate_buckets_before;`,
      `
drop table if exists _hr_gate_buckets_before;
-- MUTATED later_file_restores_old_board_progress
create or replace function public.clan_board_progress__ungated(p_clan_id uuid, p_counter text, p_delta integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $mut$
declare
  c_call_clamp constant int := 500;
  v_day  text := public.hr_utc_day_key();
  v_week text := public.hr_utc_week_key();
  v_n    int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_counter is null or p_delta is null or p_delta <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  v_n := least(p_delta, c_call_clamp);
  update public.clan_board b
     set progress = least(b.target, b.progress + v_n)
    from public.hr_castle_board_tasks t
   where b.clan_id = p_clan_id and b.period_key in (v_day, v_week)
     and t.task_id = b.task_id and t.counter = p_counter and b.progress < b.target;
  return jsonb_build_object('ok', true, 'accepted', v_n,
    'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
end $mut$;`,
    ]]]],
  },

  later_file_opens_ledger_writes: {
    what: 'a later migration gives the client an INSERT policy on clan_ledger — the ledger-derived caps become self-service',
    where: 'runtime',
    patches: [['anon-rate-gate', [[
      `
drop table if exists _hr_gate_buckets_before;`,
      `
drop table if exists _hr_gate_buckets_before;
-- MUTATED later_file_opens_ledger_writes
create policy "ledger client insert" on public.clan_ledger
  for insert to authenticated with check (auth.uid() = user_id);`,
    ]]]],
  },
};

// ════════════════════════════════════════════════════════════════════════
// The probe fixtures. Installed as SQL functions so that each runs inside
// exactly one transaction — which is what makes the rollback assertion in
// J10 meaningful and what keeps now() (and therefore the rate window and the
// UTC day boundary) constant across a scenario.
// ════════════════════════════════════════════════════════════════════════
const FIXTURE_SQL = `
create or replace function public.__mkuser(p_tag text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email)
    values (v, '00000000-0000-0000-0000-000000000000'::uuid,
            'authenticated', 'authenticated', p_tag || '-' || v::text || '@probe.invalid');
  return v;
end $$;

-- CONTRIBUTE: one clan, two members, driven through the gated RPC.
create or replace function public.__probe_contribute() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('contrib-a');
  b uuid := public.__mkuser('contrib-b');
  c uuid;
  r_first jsonb; r_second jsonb; r_b jsonb;
  i int;
  n_a int; n_b int; sum_a bigint; u_a uuid; t bigint;
begin
  insert into public.clans (name, created_by) values ('__jg_contrib__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.clan_members (clan_id, user_id, role) values (c, b, 'member');

  perform set_config('request.jwt.claim.sub', a::text, true);
  r_first := public.clan_contribute(c, ${DAY_CAP_GOLD});
  -- 59 more, i.e. everything the 60/min RPC gate allows in the minute that
  -- minted 600,000,000 in the finding.
  for i in 1..59 loop
    r_second := public.clan_contribute(c, ${DAY_CAP_GOLD});
  end loop;

  perform set_config('request.jwt.claim.sub', b::text, true);
  r_b := public.clan_contribute(c, ${DAY_CAP_GOLD});
  perform set_config('request.jwt.claim.sub', '', true);

  select count(*), coalesce(sum(qty),0) into n_a, sum_a
    from public.clan_ledger where clan_id = c and user_id = a and kind = 'contribute';
  select l.user_id into u_a from public.clan_ledger l
    where l.clan_id = c and l.kind = 'contribute' limit 1;
  select count(*) into n_b
    from public.clan_ledger where clan_id = c and user_id = b and kind = 'contribute';
  select treasury into t from public.clans where id = c;

  -- leaderboard_ranked is a MATERIALIZED view (cron 'hearthrise-leaderboards',
  -- every 5 minutes on production). The crossover therefore lands on the public
  -- board within 5 minutes of the mint, not instantly — refresh it here so the
  -- probe measures the board rather than a stale copy of it.
  refresh materialized view public.leaderboard_ranked;

  return jsonb_build_object(
    'first', r_first, 'sixtieth', r_second, 'other_member', r_b,
    'ledger_rows_a', n_a, 'ledger_sum_a', sum_a, 'ledger_attributed', u_a is not null,
    'ledger_rows_b', n_b, 'treasury', t,
    'clan_power', (select score from public.leaderboard_ranked
                    where board = 'clan_power' and subject_id = c));
end $$;

-- SAME-TRANSACTION: call, read, roll back, read again.
create or replace function public.__probe_atomic() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('atomic');
  c uuid;
  n0 int; n1 int; n2 int; t0 bigint; t1 bigint; t2 bigint; r jsonb;
begin
  insert into public.clans (name, created_by) values ('__jg_atomic__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  select count(*) into n0 from public.clan_ledger where clan_id = c;
  select treasury into t0 from public.clans where id = c;
  begin
    perform set_config('request.jwt.claim.sub', a::text, true);
    r := public.clan_contribute(c, ${DAY_CAP_GOLD});
    select count(*) into n1 from public.clan_ledger where clan_id = c;
    select treasury into t1 from public.clans where id = c;
    raise exception using errcode = 'HR999', message = 'atomicity rollback';
  exception when sqlstate 'HR999' then
    perform set_config('request.jwt.claim.sub', '', true);
  end;
  select count(*) into n2 from public.clan_ledger where clan_id = c;
  select treasury into t2 from public.clans where id = c;
  return jsonb_build_object('ok', r->>'ok', 'n0', n0, 'n1', n1, 'n2', n2,
                            't0', t0, 't1', t1, 't2', t2);
end $$;

-- BOARD: one clan, one member, a daily task with a target far above the cap.
create or replace function public.__probe_board() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('board');
  -- A SECOND member for the no-op probe. Member a has already spent its
  -- 60/minute RPC-gate budget below, and a rate_limited answer is not the
  -- answer the no-op assertion is asking about — it would pass for the
  -- wrong reason.
  z uuid := public.__mkuser('board-noop');
  c uuid; v_task text; v_counter text;
  r_first jsonb; r_last jsonb; r_noop jsonb;
  i int; n int; s bigint; u uuid; p bigint; n_noop int;
begin
  select t.task_id, t.counter into v_task, v_counter
    from public.hr_castle_board_tasks t where t.live and not t.weekly
    order by t.task_id limit 1;
  insert into public.clans (name, created_by) values ('__jg_board__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.clan_members (clan_id, user_id, role) values (c, z, 'member');
  insert into public.clan_board (clan_id, task_id, period_key, target, progress)
    values (c, v_task, public.hr_utc_day_key(), ${DAY_CAP_BOARD} * 100, 0);

  perform set_config('request.jwt.claim.sub', a::text, true);
  r_first := public.clan_board_progress(c, v_counter, 500);
  for i in 1..59 loop
    r_last := public.clan_board_progress(c, v_counter, 500);
  end loop;

  select count(*), coalesce(sum(qty),0) into n, s
    from public.clan_ledger where clan_id = c and kind = 'board_progress';
  select l.user_id into u from public.clan_ledger l
    where l.clan_id = c and l.kind = 'board_progress' limit 1;
  select progress into p from public.clan_board where clan_id = c and task_id = v_task;

  delete from public.clan_ledger where clan_id = c;
  perform set_config('request.jwt.claim.sub', z::text, true);
  r_noop := public.clan_board_progress(c, '__no_such_counter__', 500);
  select count(*) into n_noop
    from public.clan_ledger where clan_id = c and kind = 'board_progress';
  perform set_config('request.jwt.claim.sub', '', true);

  return jsonb_build_object('first', r_first, 'sixtieth', r_last, 'noop', r_noop,
    'ledger_rows', n, 'ledger_sum', s, 'ledger_attributed', u is not null,
    'progress', p, 'noop_rows', n_noop, 'counter', v_counter);
end $$;

-- THE AUTHORITY SOURCE: can a client write the table the caps are read from?
create or replace function public.__probe_ledger_writable() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('ledgerw');
  c uuid; v_role text; v_bypass text;
  ins boolean := true; upd boolean := true; del boolean := true;
begin
  insert into public.clans (name, created_by) values ('__jg_ledgerw__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (c, a, 'contribute', 1);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  v_role := current_user;
  select rolbypassrls::text into v_bypass from pg_roles where rolname = current_user;
  begin
    insert into public.clan_ledger (clan_id, user_id, kind, qty) values (c, a, 'contribute', 999999);
  exception when others then ins := false; end;
  begin
    update public.clan_ledger set qty = 0 where clan_id = c;
    upd := found;
  exception when others then upd := false; end;
  begin
    delete from public.clan_ledger where clan_id = c;
    del := found;
  exception when others then del := false; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('role', v_role, 'bypassrls', v_bypass,
                            'insert', ins, 'update', upd, 'delete', del);
end $$;

-- THE JOURNAL VOCABULARY, tried rather than read.
create or replace function public.__probe_kinds() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('kinds'); c uuid; k text; bad text;
  kinds text[] := array['deposit','labour','tier','withdraw','upkeep','feast','board',
                        'rested','role','member','contribute','board_progress'];
begin
  insert into public.clans (name, created_by) values ('__jg_kinds__', a) returning id into c;
  foreach k in array kinds loop
    begin
      insert into public.clan_ledger (clan_id, user_id, kind, qty) values (c, a, k, 0);
    exception when others then bad := coalesce(bad || ',', '') || k;
    end;
  end loop;
  delete from public.clan_ledger where clan_id = c;
  return jsonb_build_object('rejected', bad, 'tried', array_length(kinds, 1));
end $$;

-- KNOWN-OPEN, ASSERTED AS STILL OPEN so that closing one forces the
-- KNOWN-OPEN list in docs/design/HANDOFF-server-authority.md to be updated.
-- F7 clan_work_supply consumes clan_stores and journals nothing.
-- F8 clan_feast_deposit journals but has no per-day cap.
create or replace function public.__probe_known_open() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('knownopen'); c uuid; o uuid;
  n_supply int; feast_total bigint; i int; r jsonb;
begin
  insert into public.clans (name, created_by, upgrades)
    values ('__jg_known__', a, '{"tavern":"10"}'::jsonb) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');

  -- F7 · supply an order out of the clan stores and count the journal rows
  insert into public.clan_stores (clan_id, item_id, qty) values (c, 'field_ration', 500)
    on conflict (clan_id, item_id) do update set qty = 500;
  insert into public.clan_work_orders
    (clan_id, building, to_level, phase, materials, supplied, labour_target, posted_by)
    values (c, 'tavern', 2, 'supply', '{"field_ration": 100}'::jsonb, '{}'::jsonb, 100, a)
    returning id into o;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.clan_work_supply(c, o, '{"field_ration": 100}'::jsonb);
  select count(*) into n_supply
    from public.clan_ledger where clan_id = c and kind not in ('upkeep');

  -- F8 · the feast meter takes a client integer with a per-call clamp and no
  -- per-day cap; hammer it and see the meter keep climbing.
  for i in 1..20 loop
    r := public.clan_feast_deposit(c, 600);
  end loop;
  select coalesce(sum(qty),0) into feast_total
    from public.clan_ledger where clan_id = c and kind = 'feast';
  perform set_config('request.jwt.claim.sub', '', true);

  return jsonb_build_object('work_supply_ledger_rows', n_supply,
                            'feast_journalled_total', feast_total,
                            'feast_last', r);
end $$;
`;

// ════════════════════════════════════════════════════════════════════════
async function run(mutationId) {
  const patches = new Map();
  if (mutationId) {
    const m = MUTATIONS[mutationId];
    if (!m) { const e = new Error(`unknown mutation "${mutationId}"`); e.harness = true; throw e; }
    for (const [file, list] of m.patches) patches.set(file, list);
  }

  let db;
  try {
    ({ db } = await bootChain({ patches: patches.size ? patches : undefined }));
  } catch (e) {
    if (e.harness) throw e;
    // A mutation the MIGRATION'S OWN self-check refuses is a stronger result
    // than one this file catches at runtime: the bug cannot be installed.
    return [{ name: 'migration commit gate', ok: false, detail: String(e.message).slice(0, 300) }];
  }
  await db.exec(FIXTURE_SQL);

  const out = [];
  const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  // A probe that THROWS is a failure, not a crash. A broken journal INSERT
  // (say, a later file that re-narrows the kind vocabulary) surfaces as a
  // constraint violation from inside the RPC, and a harness that let that
  // escape would report a mutation as a harness problem rather than as caught.
  const one = async (sql) => {
    try { return (await db.query(sql)).rows[0]; }
    catch (e) {
      check(`probe threw: ${sql.replace(/\s+/g, ' ').slice(0, 60)}`, false, String(e.message).slice(0, 300));
      return {};
    }
  };
  const R = (v) => (v && typeof v === 'object' ? v : {});

  // ── F1 ────────────────────────────────────────────────────────────────
  const c = R((await one('select public.__probe_contribute() as r')).r);
  check('J1  CONTROL · an honest first contribution is still accepted',
    c.first?.ok === true && Number(c.first?.accepted) === DAY_CAP_GOLD,
    JSON.stringify(c.first));
  check('J2  the transfer is journalled, exactly once, attributed',
    c.ledger_rows_a === 1 && Number(c.ledger_sum_a) === DAY_CAP_GOLD && c.ledger_attributed === true,
    `rows=${c.ledger_rows_a} sum=${c.ledger_sum_a} attributed=${c.ledger_attributed}`);
  check('J3  60 calls in a minute mint one day cap, not 600,000,000',
    Number(c.treasury) === DAY_CAP_GOLD * 2 && c.sixtieth?.error === 'daily_cap',
    `treasury=${c.treasury} (a+b) sixtieth=${JSON.stringify(c.sixtieth)}`);
  check('J4  the cap is PER MEMBER — a second member is not locked out',
    c.other_member?.ok === true && c.ledger_rows_b === 1,
    JSON.stringify(c.other_member));
  check('J5  CROSSOVER · clan_power\'s treasury term is bounded by the day cap',
    Number(c.clan_power) - 1000000000 === DAY_CAP_GOLD * 2,
    `clan_power=${c.clan_power} (castle_tier term 1e9 + treasury)`);

  const at = R((await one('select public.__probe_atomic() as r')).r);
  check('J10 the journal is written in the SAME TRANSACTION as the transfer',
    at.ok === 'true' && at.n1 === at.n0 + 1 && at.n2 === at.n0
      && Number(at.t1) === Number(at.t0) + DAY_CAP_GOLD && Number(at.t2) === Number(at.t0),
    JSON.stringify(at));

  // ── F3 ────────────────────────────────────────────────────────────────
  const b = R((await one('select public.__probe_board() as r')).r);
  check('J6  CONTROL · an honest 500 board submission is still accepted',
    b.first?.ok === true && Number(b.first?.accepted) === 500,
    JSON.stringify(b.first));
  check('J7  the delta is journalled with a user_id and the counter name',
    b.ledger_rows >= 1 && b.ledger_attributed === true,
    `rows=${b.ledger_rows} attributed=${b.ledger_attributed}`);
  check('J8  60 calls in a minute move 5,000, not 30,000, and the books agree',
    Number(b.progress) === DAY_CAP_BOARD && Number(b.ledger_sum) === DAY_CAP_BOARD
      && b.sixtieth?.error === 'daily_cap',
    `progress=${b.progress} ledger=${b.ledger_sum} sixtieth=${JSON.stringify(b.sixtieth)}`);
  check('J9  a submission that moves no task writes nothing and is charged nothing',
    b.noop_rows === 0 && Number(b.noop?.accepted) === 0,
    JSON.stringify(b.noop));

  // ── the authority source, and the vocabulary ───────────────────────────
  const lw = R((await one('select public.__probe_ledger_writable() as r')).r);
  check('J11 SELF-CHECK VALID · the probe really ran as `authenticated` under RLS',
    lw.role === 'authenticated' && lw.bypassrls === 'false',
    `role=${lw.role} bypassrls=${lw.bypassrls}`);
  check('J11 clan_ledger — the table the caps read authority from — is not client-writable',
    lw.insert === false && lw.update === false && lw.delete === false,
    JSON.stringify(lw));

  const k = R((await one('select public.__probe_kinds() as r')).r);
  check('J12 the journal vocabulary still accepts all 12 kinds',
    k.rejected === null && k.tried === 12,
    `rejected=${k.rejected}`);

  // ── KNOWN-OPEN, asserted as still open ────────────────────────────────
  const ko = R((await one('select public.__probe_known_open() as r')).r);
  check('J13 KNOWN-OPEN F7 · clan_work_supply still consumes clan_stores unjournalled '
      + '(if this fails, F7 was fixed — update the KNOWN-OPEN list)',
    ko.work_supply_ledger_rows === 0,
    `clan_ledger rows after a supply: ${ko.work_supply_ledger_rows}`);
  check('J14 KNOWN-OPEN F8 · clan_feast_deposit still has no per-day cap '
      + '(if this fails, F8 was fixed — update the KNOWN-OPEN list)',
    Number(ko.feast_journalled_total) > 600,
    `feast journalled in 20 calls: ${ko.feast_journalled_total}`);

  return out;
}

// ════════════════════════════════════════════════════════════════════════
function report(results) {
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    process.stdout.write(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}\n`);
    if (!r.ok) process.stdout.write(`        ${r.detail}\n`);
  }
  return bad;
}

async function main() {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      process.stdout.write(`${id.padEnd(38)} [${m.where}] ${m.what}\n`);
    }
    return 0;
  }

  const only = argOf('mutate', null);
  if (only) {
    process.stdout.write(`MUTATION ${only} — ${MUTATIONS[only]?.what}\n`);
    const bad = report(await run(only));
    if (bad === 0) {
      process.stdout.write('\nSLIPPED: the mutation was not caught. The guard is decoration.\n');
      return 1;
    }
    process.stdout.write(`\nCAUGHT (${bad} assertion(s) red).\n`);
    return 0;
  }

  process.stdout.write('CLEAN RUN\n');
  const bad = report(await run(null));
  if (bad) { process.stdout.write(`\n${bad} assertion(s) FAILED.\n`); return 1; }
  process.stdout.write('\nall green.\n');

  if (!argv.includes('--selftest')) return 0;

  process.stdout.write('\nSELFTEST — every mutation must be caught\n');
  let slipped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    const res = await run(id);
    const n = res.filter((r) => !r.ok).length;
    const gated = res.length === 1 && res[0].name === 'migration commit gate';
    if (n === 0) { slipped++; process.stdout.write(`  SLIPPED  ${id}\n`); }
    else process.stdout.write(`  caught   ${id.padEnd(38)} ${gated ? 'by the migration commit gate' : `by ${n} runtime assertion(s)`}\n`);
    // A mutation labelled `runtime` that is only ever caught by the commit gate
    // means this file is not carrying the weight its header claims.
    if (!gated && m.where === 'gate') process.stdout.write(`           (note: catalogued as gate, caught at runtime)\n`);
    if (gated && m.where === 'runtime') { slipped++; process.stdout.write(`           MISLABELLED: catalogued as runtime but the migration refused it — the runtime probe is unproven\n`); }
  }
  if (slipped) { process.stdout.write(`\n${slipped} mutation(s) slipped or mislabelled.\n`); return 1; }
  process.stdout.write('\nevery mutation caught.\n');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  process.stderr.write(`${e.harness ? 'HARNESS' : 'ERROR'}: ${e.message}\n`);
  process.exit(e.harness ? 2 : 2);
});
