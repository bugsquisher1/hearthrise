-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEAD CLIENT WRITE GRANT: swept on six tables, and made
-- VISIBLE everywhere else
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion derivation: tools/derive-grant-hygiene.mjs (§4's body is EXTRACTED,
--                         link 3 of the chain — the FIRST link that REPLACES lines)
--   Graded by: tests/run-sql-tests.mjs PART 1f-ii (HR_GRANT_HYGIENE_CHAIN)
--   Behavioural evidence: tests/unlock-buy.mjs U14 (before/after on the six)
--
-- ── THE FINDING (Security, 2026-08-16, condition C3 on b354) ────────────
-- Six live tables — hr_castle_board_tasks, hr_castle_buildings, hr_castle_items,
-- hr_castle_tiers, hr_hunt_bosses, hr_hunt_tiers — are pure CONTENT CATALOGUES
-- that carry anon + authenticated INSERT/UPDATE/DELETE grants. Nothing was ever
-- meant to write them from a browser. The only thing standing between a player
-- and rewriting the castle tier table is row-level security: one permissive
-- policy added later, or one `alter table ... disable row level security` typed
-- during an incident, and the grant is live.
--
-- The detector could not see it. Check (4) of hr_assert_grant_hygiene looked at
-- TRUNCATE/REFERENCES/TRIGGER only, because those are the three no client ever
-- needs; INSERT/UPDATE/DELETE were left alone since half the schema legitimately
-- takes client writes through RLS.
--
-- ── THE RULE THIS FILE ADDS, AND WHY IT IS STRUCTURAL ───────────────────
-- The defect is not "a client write grant". It is A CLIENT WRITE GRANT ON A
-- TABLE THAT HAS RLS ON AND NO WRITE POLICY AT ALL — a grant nothing intends to
-- use. A table with a write policy is the current design (clan membership, chat,
-- the market); a table with a grant and no policy is a door with no handle,
-- which somebody will eventually fit a handle to.
--
-- ── WHY A BASELINE AND NOT A BAN ────────────────────────────────────────
-- Measured on the repo's own replay: TWENTY-SEVEN tables are in that class, not
-- six. The other 21 — clan_*, world_event_*, raid_*, maintenance_*,
-- display_names, leaderboard_meta — are written exclusively by SECURITY DEFINER
-- RPCs, so their grants are dead in exactly the same way. Sweeping all 27 in the
-- change that INTRODUCES the check would be a 27-table privilege change whose
-- blast radius nobody has measured, in a branch that must keep the live beta
-- green. So:
--   · the SIX Security named are REVOKED here (they are catalogues; no code path
--     writes them from a client, and hr_castle_*/hr_hunt_* are read-only content);
--   · the REST are RECORDED in public.hr_client_write_baseline, seeded from
--     whatever this database actually has AFTER the sweep. That makes each one a
--     claim a human has to justify to remove, and it makes anything NEW fatal —
--     which is the property that did not exist yesterday.
--   · A follow-up sweep of the remaining 21 is RECOMMENDED and is NOT this file.
--     It needs each table's writer confirmed one at a time. Named in §7.
--
-- ⚠ service_role IS DELIBERATELY OUT OF SCOPE. Supabase's platform default
--   grants it every privilege on every table in `public`; including it would
--   report all 40-odd tables and check (4) could never be strict. That is a
--   platform posture and a separate program. Stated so its absence is a decision.
--
-- REVERSIBILITY
--   re-apply 2026-08-16-unlock-buy.sql   (restores check (4)'s previous body)
--   drop table public.hr_client_write_baseline;
--   -- and, if the revokes must be undone (they should not be):
--   grant insert, update, delete on public.hr_castle_board_tasks, … to anon, authenticated;
--   Nothing else is touched: no function but the detector, no policy, no row.
--
-- APPLY ORDER: … → 2026-08-16-unlock-buy.sql → THIS FILE. It TAKES OVER as the
--   last file that may `create or replace` hr_assert_grant_hygiene.
--
-- SAFE TO RE-RUN. The revokes are idempotent, the baseline is seeded only for
-- rows it does not already hold, and §5's probe rolls itself back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — REFUSE TO INSTALL ON A BODY THIS FILE DID NOT COME FROM ──
-- Same standard as the two links before it: this file restates a 15 KB
-- nine-check DETECTOR it did not author, and a silently deleted check LOOKS
-- EXACTLY LIKE A CLEAN NIGHT.
do $$
declare
  v_src  text;
  v_len  int;
  v_arr  text;
  v_live text[];
  v_e    text;
  -- The twelve entries the live body must already carry: nine base + the two
  -- from engine-allowlist-claim-perks + hr_unlock_buy from unlock-buy.
  c_want constant text[] := array[
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    'hr_state_of(uuid,integer)',
    'hr_seed(uuid,integer,text)',
    'hr_total_level(uuid,integer)',
    'hr_level_from_xp(bigint)',
    'hr_xp_for_level(integer)',
    'market_expire(integer)',
    'hr_offline_cap_ms(uuid,integer)',
    'hr_rate_gate(uuid,integer,text)',
    'hr_claim_lookup(uuid,integer,text,text)',
    'hr_perks_of(uuid,integer)',
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)'
  ];
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene is missing — apply 2026-08-11-grant-hygiene.sql, '
                    '2026-08-16-engine-allowlist-claim-perks.sql and 2026-08-16-unlock-buy.sql '
                    'first. This file only WIDENS check (4); it is not a substitute for the detector.';
  end if;
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  -- THE ANCHOR THIS FILE REPLACES. If check (4)'s old query is not there, the
  -- live body is not the one the derivation was taken from.
  if v_src !~ 'privilege_type in \(''TRUNCATE'',''REFERENCES'',''TRIGGER''\)' then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live body (% chars) does not '
                    'contain check (4)''s TRUNCATE/REFERENCES/TRIGGER query, which is the exact text '
                    'this file replaces. Re-derive from what is actually running '
                    '(node tools/derive-grant-hygiene.mjs --report) rather than overwriting it.',
                    coalesce(v_len, 0);
  end if;

  v_arr := substring(v_src from 'c_engine_allow constant text\[\] := array\[(.*?)\];');
  if v_arr is null then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: no c_engine_allow declaration in a '
                    '% char body, so this is not the body this file was derived from.', coalesce(v_len,0);
  end if;
  select array_agg(m[1] order by m[1]) into v_live
    from regexp_matches(v_arr, '''([a-z][a-z0-9_]*\([a-z0-9_, ]*\))''', 'g') m;

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT — a text scan fails in both directions.
  if v_live is null or not ('hr_apply(uuid,integer,bigint,uuid,jsonb)' = any (v_live)) then
    raise exception 'THE ALLOWLIST SCAN IS BLIND (positive control): hr_apply is not among the % '
                    'entries parsed out of the live c_engine_allow.', coalesce(array_length(v_live,1),0);
  end if;
  if 'hr__grant_hygiene_negative_control(uuid)' = any (v_live) then
    raise exception 'THE ALLOWLIST SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no allowlist MATCHED.';
  end if;

  -- Nothing this file would DELETE, and nothing the chain already recorded is
  -- missing. Both directions, by name.
  foreach v_e in array v_live loop
    if not (v_e = any (c_want)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist carries '
                      '"%", which this file''s body does NOT. Applying it would silently DELETE that '
                      'reviewed capability. Add it to tools/derive-grant-hygiene.mjs and re-derive.', v_e;
    end if;
  end loop;
  foreach v_e in array c_want loop
    if not (v_e = any (v_live)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live allowlist is MISSING '
                      '"%". This file was derived from the twelve-entry body installed by '
                      '2026-08-16-unlock-buy.sql; the live body is not that one. Apply the chain in '
                      'order (grant-hygiene → engine-allowlist-claim-perks → unlock-buy → this).', v_e;
    end if;
  end loop;

  raise notice 'C3 §0 PASSED: the live detector (% chars) is the twelve-entry body this file was '
               'derived from, and it still carries check (4)''s original query.', v_len;
end $$;

-- ── 1. THE SWEEP — six catalogues, six revokes ───────────────────────────
-- `revoke all`, not `revoke insert, update, delete`: Supabase's default ACL also
-- carries TRUNCATE/REFERENCES/TRIGGER, and TRUNCATE bypasses RLS entirely, so
-- the read-only policies on these tables are not a backstop for it.
--
-- SELECT IS NOT REVOKED and must not be: these are world-readable content
-- catalogues and the client renders from them. `revoke all` then `grant select`
-- would be two statements where one is needed and would leave a window (inside
-- one transaction, so not a real window — but it would also mean this file
-- decides who may READ them, which is not its business).
do $$
declare
  t text;
  c_tables constant text[] := array[
    'hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
    'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers'];
  v_before int := 0;
  v_after  int := 0;
begin
  select count(*) into v_before from information_schema.role_table_grants
   where table_schema = 'public' and table_name = any (c_tables)
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type <> 'SELECT';

  foreach t in array c_tables loop
    if to_regclass('public.' || t) is null then
      -- A database that never had the castle/hunt content. Not an error: this
      -- file's job is that the grant is absent, and it is.
      raise notice 'C3: %.% does not exist here — nothing to revoke', 'public', t;
      continue;
    end if;
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I '
                   'from public, anon, authenticated', t);
  end loop;

  select count(*) into v_after from information_schema.role_table_grants
   where table_schema = 'public' and table_name = any (c_tables)
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_after <> 0 then
    raise exception 'C3 §1 FAILED: % non-SELECT client grant(s) survive on the six catalogues', v_after;
  end if;
  raise notice 'C3 §1: % dead client write grant(s) revoked across six content catalogues '
               '(0 remain). SELECT is untouched — they are world-readable by design.', v_before;
end $$;

-- ── 2. THE BASELINE — every REMAINING dead grant, DECLARED BY NAME ───────
-- ⚠ REVISION 2 (Security C3a). Revision 1 seeded this table from live reality:
--   "insert … select from role_table_grants where <the class predicate>". That
--   is a tripwire that disarms itself, in two directions and both of them live:
--     · anything that entered the class between the finding and the apply was
--       ABSORBED — recorded as accepted, silently, with every self-check green;
--     · this file is SAFE TO RE-RUN, so a re-run RE-SEEDS from whatever reality
--       has become and absorbs everything that arrived since the last one.
--   And the mechanism is not hypothetical: Supabase's default ACL grants
--   anon/authenticated every privilege on every NEW table in `public`, so a new
--   table with RLS on and no write policy JOINS THIS CLASS AUTOMATICALLY. The
--   detector would then be permanently one apply behind the thing it detects.
--   Measured before the fix: a table created immediately before the seed was
--   absorbed and the whole suite stayed green (tests/unlock-buy.mjs mutation
--   `class_member_absorbed`).
--
-- So the twenty-one tables are DECLARED, as (table, grantee) pairs, and:
--   · the seed comes ONLY from this list;
--   · a class member reality holds that the list does NOT name is a RAISE —
--     it is either new, or it was never reviewed, and both need a human;
--   · a listed member that is ABSENT from reality is a WARNING, not a raise:
--     it means somebody swept it, which is the direction this list is supposed
--     to move. THE LIST SHOULD SHRINK. Remove the pair and the grant together.
create table if not exists public.hr_client_write_baseline (
  table_name text not null,
  grantee    text not null,
  note       text,
  recorded_at timestamptz not null default now(),
  primary key (table_name, grantee)
);
alter table public.hr_client_write_baseline enable row level security;
revoke all on public.hr_client_write_baseline from public, anon, authenticated, service_role;
-- No policy at all: this table is read by a SECURITY DEFINER detector and by
-- nobody else. A table with RLS on and no policy is unreadable to every client
-- role, which is the correct posture for a list of known-weak grants.

do $$
declare
  -- THE TWENTY-ONE, BY NAME. Measured on the repo's own replay 2026-08-16
  -- (tests/schema-replay.mjs, whole chain): every one is written exclusively by
  -- a SECURITY DEFINER RPC, so every grant here is DEAD — reachable only if
  -- somebody later adds a permissive policy or disables RLS during an incident.
  -- Sweep candidates, one confirmed writer at a time; see §7.
  c_expected constant text[][] := array[
    ['clan_bans', 'anon'],                ['clan_bans', 'authenticated'],
    ['clan_board', 'anon'],               ['clan_board', 'authenticated'],
    ['clan_invites', 'anon'],             ['clan_invites', 'authenticated'],
    ['clan_ledger', 'anon'],              ['clan_ledger', 'authenticated'],
    ['clan_order_ballots', 'anon'],       ['clan_order_ballots', 'authenticated'],
    ['clan_order_votes', 'anon'],         ['clan_order_votes', 'authenticated'],
    ['clan_raids', 'anon'],               ['clan_raids', 'authenticated'],
    ['clan_stores', 'anon'],              ['clan_stores', 'authenticated'],
    ['clan_tavern', 'anon'],              ['clan_tavern', 'authenticated'],
    ['clan_withdrawals', 'anon'],         ['clan_withdrawals', 'authenticated'],
    ['clan_work_labour', 'anon'],         ['clan_work_labour', 'authenticated'],
    ['clan_work_orders', 'anon'],         ['clan_work_orders', 'authenticated'],
    ['display_names', 'anon'],            ['display_names', 'authenticated'],
    ['leaderboard_meta', 'anon'],         ['leaderboard_meta', 'authenticated'],
    ['maintenance_alerts', 'anon'],       ['maintenance_alerts', 'authenticated'],
    ['maintenance_log', 'anon'],          ['maintenance_log', 'authenticated'],
    ['raid_claims', 'anon'],              ['raid_claims', 'authenticated'],
    ['raid_contributions', 'anon'],       ['raid_contributions', 'authenticated'],
    ['world_event_joins', 'anon'],        ['world_event_joins', 'authenticated'],
    ['world_event_pledges', 'anon'],      ['world_event_pledges', 'authenticated'],
    ['world_event_totals', 'anon'],       ['world_event_totals', 'authenticated']
  ];
  v_class    text[];   -- 'table:grantee' for everything ACTUALLY in the class
  v_extra    text;
  v_gone     text;
  v_seeded   int;
  v_n        int;
begin
  -- THE CLASS, computed ONCE. Written once rather than twice so the predicate
  -- the raise is about and the predicate the seed is about cannot drift apart.
  select coalesce(array_agg(x.k order by x.k), array[]::text[]) into v_class from (
    select g.table_name || ':' || g.grantee as k
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
     where g.table_schema = 'public'
       and g.grantee in ('anon','authenticated','PUBLIC')
       and g.privilege_type in ('INSERT','UPDATE','DELETE')
       and c.relrowsecurity
       and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = g.table_name
                          and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
     group by g.table_name, g.grantee) x;

  -- ⚠ A CONTROL BEFORE ANY VERDICT. An empty class means the predicate stopped
  --   matching — on a database that has just had six tables swept and 21 left
  --   alone, that is not a clean bill, it is a blind check, and both branches
  --   below would then pass for the wrong reason.
  if array_length(v_class, 1) is null then
    raise exception 'C3a: the dead-grant class is EMPTY on this database. Either the predicate no '
                    'longer matches anything (a blind check) or every client write grant in the '
                    'schema is gone (which would be excellent, and is not something to discover '
                    'silently). Investigate before removing this control.';
  end if;

  -- (a) ANYTHING REALITY HOLDS THAT THE LIST DOES NOT NAME IS FATAL. This is
  --     the half revision 1 got wrong: it absorbed instead of raising.
  select string_agg(k, ', ' order by k) into v_extra
    from unnest(v_class) k
   where not exists (select 1 from generate_subscripts(c_expected, 1) i
                      where c_expected[i][1] || ':' || c_expected[i][2] = k);
  if v_extra is not null then
    raise exception 'C3a: REFUSING TO BASELINE SOMETHING NOBODY REVIEWED. These (table, grantee) '
                    'pairs are in the dead-grant class — a client write grant on a table with RLS '
                    'on and NO write policy — and this file does not name them: %. Either they are '
                    'NEW (Supabase''s default ACL puts every new RLS-on table in this class '
                    'automatically) or they were never looked at. Decide per table: revoke it here '
                    'like the six above, or add the pair to c_expected WITH the reason it is '
                    'accepted. Do not widen the list to make this stop.', v_extra;
  end if;

  -- (b) A LISTED PAIR THAT IS GONE IS A WARNING, NOT A FAILURE — it means
  --     somebody swept it, which is the direction this list must move.
  select string_agg(c_expected[i][1] || ':' || c_expected[i][2], ', '
                    order by c_expected[i][1] || ':' || c_expected[i][2])
    into v_gone
    from generate_subscripts(c_expected, 1) i
   where not (c_expected[i][1] || ':' || c_expected[i][2] = any (v_class));
  if v_gone is not null then
    raise warning 'C3a: % listed pair(s) are no longer in the class (%). That is the list doing its '
                  'job — somebody swept them. Delete those rows from c_expected in this file; a '
                  'baseline that never shrinks is a baseline nobody is working through.',
                  (select count(*) from regexp_matches(v_gone, ',', 'g')) + 1, v_gone;
  end if;

  -- (c) THE SEED — from the LIST, and only for pairs that really exist, so the
  --     table never claims to have accepted a grant that is not there.
  insert into public.hr_client_write_baseline (table_name, grantee, note)
  select c_expected[i][1], c_expected[i][2],
         'PRE-EXISTING at 2026-08-16 (C3). Written only by SECURITY DEFINER RPCs; the grant is dead '
         'and held back by RLS. Sweep candidate — remove this row, the c_expected pair and the '
         'grant together.'
    from generate_subscripts(c_expected, 1) i
   where c_expected[i][1] || ':' || c_expected[i][2] = any (v_class)
  on conflict (table_name, grantee) do nothing;
  get diagnostics v_seeded = row_count;

  -- The six must NOT be in the baseline. They were revoked in §1 and they are
  -- not on the list — asserted rather than assumed, because a baseline that
  -- RECORDED the finding instead of fixing it is a control turned into a comment.
  select string_agg(distinct table_name, ', ') into v_extra
    from public.hr_client_write_baseline
   where table_name in ('hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
                        'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers');
  if v_extra is not null then
    raise exception 'C3 §2: the six swept catalogues were BASELINED (%) instead of fixed', v_extra;
  end if;

  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'C3a §2: the class holds % pair(s), all of them DECLARED in this file; % newly '
               'seeded, % baselined in total. Anything the list does not name is fatal.',
               array_length(v_class, 1), v_seeded, v_n;
end $$;

-- ── 3. GRANTS (nothing is granted) ───────────────────────────────────────
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 4. THE DETECTOR, DERIVED ─────────────────────────────────────────────
-- ⚠ THE BLOCK BELOW IS GENERATED. Do not hand-edit between the markers. It is
--   2026-08-16-unlock-buy.sql's hr_assert_grant_hygiene, EXTRACTED by
--   tools/derive-grant-hygiene.mjs (LINKS[2]) and patched at ONE named anchor —
--   check (4)'s query, REPLACED. This is the first link in the chain that
--   replaces rather than inserts, so it is the first with a non-empty
--   declared-removals list in tests/run-sql-tests.mjs PART 1f-ii: four lines,
--   enumerated there, and any fifth is a silent regression.
--   `node tools/derive-grant-hygiene.mjs --check` re-derives all three links on
--   every run of tests/run-smoke.mjs.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- writes, but only the "return the lapsed seller's own goods" path, capped at 200
    'market_expire(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select table_name as g
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
       and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
    union all
    select g.table_name || ':' || g.grantee || ':' || g.privilege_type
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
                     and c.relnamespace = 'public'::regnamespace
     where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
       and g.privilege_type in ('INSERT','UPDATE','DELETE')
       and c.relrowsecurity
       and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = g.table_name
                          and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline b
                        where b.table_name = g.table_name and b.grantee = g.grantee)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-VERIFICATION, WITH A MUTATION ARM ────────────────────────────
-- Three claims, in this order:
--   (A) the six are GONE from the widened report;
--   (B) STRICT PASSES over all nine checks — i.e. the widening did not just
--       move the failure somewhere else;
--   (C) THE MUTATION ARM: a FRESH table with RLS on, no write policy and an
--       authenticated INSERT grant must be NAMED and must be FATAL. A widened
--       check that cannot demonstrate it fires is a comment.
do $$
declare v jsonb; v_e text;
begin
  v := public.hr_assert_grant_hygiene(false);

  foreach v_e in array array['hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
                             'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers'] loop
    if (v->'client_truncate_grants')::text like '%' || v_e || '%' then
      raise exception 'C3 §5(A): % is still reported after the sweep — report=%',
        v_e, (v->'client_truncate_grants')::text;
    end if;
  end loop;

  v := public.hr_assert_grant_hygiene(true);
  raise notice 'C3 §5(B): GRANT HYGIENE STRICT PASSES with the widened check (4).';

  -- (C) No exception handler, on purpose: if anything below raises, the whole
  --     migration rolls back and the probe cannot survive it either.
  create table public.hr__client_write_probe (id int primary key);
  alter table public.hr__client_write_probe enable row level security;
  -- Born with the platform's default ACL — which is `grant all to anon,
  -- authenticated, service_role` and is exactly the mechanism that produced the
  -- six findings. Closed explicitly first, so the probe carries ONE grant and
  -- the report below names one thing rather than six.
  revoke all on public.hr__client_write_probe from public, anon, authenticated, service_role;
  -- RLS on, NO policy, and a write grant: the exact shape of the six.
  grant insert on public.hr__client_write_probe to authenticated;

  v := public.hr_assert_grant_hygiene(false);
  if not ((v->'client_truncate_grants')::text like '%hr__client_write_probe:authenticated:INSERT%') then
    raise exception 'THE WIDENED CHECK IS BLIND: a table with RLS on, no write policy and an '
                    'authenticated INSERT grant was NOT reported. The check was widened without the '
                    'evidence that makes a widening mean anything. report=%',
                    (v->'client_truncate_grants')::text;
  end if;
  begin
    v := public.hr_assert_grant_hygiene(true);
    raise exception 'THE WIDENED CHECK IS NOT FATAL: strict mode returned normally with a dead '
                    'client write grant live. The nightly cron run would report success.';
  exception when others then
    if sqlerrm not like 'GRANT HYGIENE FAILED%' then raise; end if;
  end;

  -- …AND THE BASELINE IS THE ESCAPE HATCH, which must also be proven to work,
  -- or the only way to pass this check is to delete it.
  insert into public.hr_client_write_baseline (table_name, grantee, note)
    values ('hr__client_write_probe', 'authenticated', 'probe');
  v := public.hr_assert_grant_hygiene(true);
  delete from public.hr_client_write_baseline where table_name = 'hr__client_write_probe';

  revoke insert on public.hr__client_write_probe from authenticated;
  drop table public.hr__client_write_probe;

  v := public.hr_assert_grant_hygiene(true);
  raise notice 'C3 §5(C): MUTATION ARM PASSED — a dead client write grant is NAMED, is FATAL, and a '
               'baselined one is not.';
end $$;

-- The probe is created inside a do-block above; prove it is gone whichever path
-- ran. A probe left behind is a granted table nobody reviewed.
do $$
begin
  if to_regclass('public.hr__client_write_probe') is not null then
    raise exception 'the self-check probe survived this migration';
  end if;
  if exists (select 1 from public.hr_client_write_baseline where table_name like 'hr\_\_%') then
    raise exception 'a probe row survived in hr_client_write_baseline';
  end if;
end $$;

-- ── 6. WHAT WAS FIXED, SAID AT APPLY TIME ────────────────────────────────
do $$
declare v_n int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'CLIENT WRITE GRANT SWEEP APPLIED. Six content catalogues no longer carry '
               'anon/authenticated write grants, and check (4) now reports any table with RLS on, '
               'no write policy and a client write grant — % pre-existing ones are baselined and '
               'anything new is FATAL.', v_n;
end $$;

-- ── 7. WHAT IS LEFT, AND WHO OWNS IT ─────────────────────────────────────
-- (1) THE REMAINING 21 BASELINED TABLES. Measured on the replay: clan_bans,
--     clan_board, clan_invites, clan_ledger, clan_order_ballots,
--     clan_order_votes, clan_raids, clan_stores, clan_tavern, clan_withdrawals,
--     clan_work_labour, clan_work_orders, display_names, leaderboard_meta,
--     maintenance_alerts, maintenance_log, raid_claims, raid_contributions,
--     world_event_joins, world_event_pledges, world_event_totals. Every one is
--     written by a SECURITY DEFINER RPC today, so every one is a dead grant —
--     but "I believe nothing writes it from the client" is not the same as
--     having checked, and 21 tables is a sweep with its own review. Do them in
--     batches, each batch removing its baseline rows in the same migration.
-- (2) service_role. Out of scope here (§header). A project-wide default-ACL
--     posture change, not a migration.
-- ════════════════════════════════════════════════════════════════════════
-- Said out loud at apply time, because the operator is the person most likely
-- to read "sweep" as "all of them".
do $$
declare v_n int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'C3 §7: SIX catalogues swept; % dead client write grant(s) remain BASELINED and are '
               'a follow-up sweep, one confirmed writer at a time. Anything NEW in that class is '
               'now fatal in strict mode.', v_n;
end $$;
