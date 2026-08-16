-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CLIENT WRITE GRANT SWEEP, BATCH 5:
--   THE STATE BECOMES A PROPERTY. Three coupled pieces, ONE migration, applied
--   together because any two of them apart is a worse posture than none:
--     1. a FAIL-CLOSED default ACL, so a new table is not born client-writable;
--     2. a SCHEMA-WIDE MAINTAIN revoke, so nothing is left holding the one
--        privilege the detector could not see;
--     3. the DETECTOR TAKEOVER, so check (4) can see MAINTAIN and matviews
--        PERMANENTLY, and the class it guards can never again fill up unseen.
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Predecessors: the whole sweep chain 1 → 2 → 3 → 4 (batch 1 creates the
--                 baseline + the widened-check body this file's derivation is
--                 based on; batches 2–4 emptied the baseline). Batch 1 is a HARD
--                 predecessor (this file's detector is DERIVED from its committed
--                 body); 2–4 are reported, not required — see §0(f).
--   Graded by:    tests/client-write-sweep-5.mjs (behavioural, on the replay,
--                 with a mutation catalogue: --selftest must catch every entry)
--   Detector:     public.hr_assert_grant_hygiene(boolean) — THIS FILE TAKES IT
--                 OVER. §3's body is the LAST link of the derivation chain
--                 (tools/derive-grant-hygiene.mjs LINKS[3], graded by
--                 tests/run-sql-tests.mjs PART 1f-ii). §0 asserts the live body
--                 is the one the derivation was based on before replacing it.
--
-- ── WHY THE THREE MUST LAND TOGETHER ────────────────────────────────────
-- Every batch before this one swept a STATE: it emptied the dead-grant class as
-- it stood on the day it was measured. But the class refills on its own. The
-- schema default ACL grants anon and authenticated arwdm — INSERT, SELECT,
-- UPDATE, DELETE and MAINTAIN — on every NEW table in `public` (measured on
-- production 2026-08-16: pg_default_acl for role postgres, objtype 'r',
-- {anon=arwdm/postgres, authenticated=arwdm/postgres}). So the next table anybody
-- creates with RLS on re-opens the class automatically. The baseline being empty
-- was a state, not a property.
--
--   · A fail-closed default ACL WITHOUT the schema-wide MAINTAIN revoke would
--     leave the ~28 pre-existing MAINTAIN pairs behind, invisible.
--   · Widening the detector WITHOUT the MAINTAIN revoke would make
--     hr_assert_grant_hygiene(true) — which runs nightly on pg_cron, surfacing as
--     maintenance_alerts — RAISE every night on those ~28 pairs plus the
--     leaderboard_ranked matview, none of them reviewed.
--   · The MAINTAIN revoke WITHOUT the fail-closed default ACL would be swept
--     away again by the very next migration that creates a table.
-- Batch 3 §8 and batch 4 §6 both scoped this and deferred it to "batch 5, in
-- that order, in one file". This is that file.
--
-- ── PIECE 1 · THE FAIL-CLOSED DEFAULT ACL (the generator, closed) ───────
-- `alter default privileges ... revoke insert, update, delete, truncate,
-- references, trigger, maintain on tables from anon, authenticated, public`, for
-- every role that owns a relation in `public` (on production that is exactly
-- `postgres`; derived at apply time rather than hard-coded). SELECT IS NOT
-- REVOKED — that is how the anon key reads world-readable public tables through
-- PostgREST, and a fresh table must keep it. Proven by execution: §1 creates a
-- table AFTER the alter, inside this transaction, and asserts anon and
-- authenticated hold SELECT and NOTHING ELSE. (Measured on production 2026-08-16
-- inside a rolled-back transaction: before the alter a fresh table gave
-- authenticated arwdm; after it, SELECT only.)
--
-- ⚠ NOT service_role, and NOT supabase_admin. service_role keeps its default
--   grants (deliberately out of scope for the whole programme — batch 1 §header).
--   And there is a SECOND table default ACL on production owned by supabase_admin
--   ({anon=arwdDxtm, authenticated=arwdDxtm}) that this file cannot edit (we do
--   not own that role); it only bites a table CREATED BY supabase_admin in
--   `public`, which our migrations never do — every public table is postgres-
--   owned (measured). Named in §5 so its residual is a decision, exactly as
--   service_role is.
--
-- ── PIECE 2 · THE SCHEMA-WIDE MAINTAIN REVOKE ───────────────────────────
-- Every relation in `public` — table, partitioned table OR materialized view —
-- that still grants MAINTAIN to anon or authenticated has it revoked. DERIVED at
-- apply time (aclexplode/has_table_privilege, the vocabulary batch 3 established;
-- NEVER information_schema, which cannot report MAINTAIN). MAINTAIN is dead in
-- the same way every grant in this programme is dead: it is VACUUM / ANALYZE /
-- CLUSTER / REINDEX / REFRESH MATERIALIZED VIEW, and PostgREST — the only thing
-- anon and authenticated reach the database through — cannot issue any of them.
-- This includes clan_members and clans: their INSERT/DELETE grants (behind LIVE
-- policies — see §5) are NOT touched, only their dead MAINTAIN.
--
-- ── PIECE 3 · THE DETECTOR TAKEOVER ─────────────────────────────────────
-- check (4) of hr_assert_grant_hygiene is moved off information_schema.role_
-- table_grants and onto has_table_privilege over pg_class. That single change
-- makes TWO permanent blind spots go away: MAINTAIN (information_schema reports
-- SQL-standard privileges only) and MATERIALIZED VIEWS (information_schema omits
-- them entirely, which is why leaderboard_ranked's dead grants were never once
-- reported). After pieces 1+2 there is nothing in the class, so the widened check
-- PASSES; §4 then re-grants MAINTAIN on a probe and demands the check NAMES it
-- and RAISES, so "passes" is a result and not a blind check.
--
-- REVERSIBILITY (should never be needed; every grant removed here is dead)
--   -- piece 1:
--   alter default privileges for role postgres in schema public
--     grant insert, update, delete, truncate, references, trigger, maintain
--     on tables to anon, authenticated;
--   -- piece 2: re-grant maintain on each relation it was taken from (the §2
--   --          notice names them at apply time).
--   -- piece 3: re-apply 2026-08-16-client-write-grant-sweep.sql (batch 1),
--   --          which restores check (4)'s previous (information_schema) body.
--   NO PREDECESSOR IS EDITED — a rebuild applies them BEFORE this file.
--
-- APPLY ORDER: … → sweep-4.sql → THIS FILE. It TAKES OVER as the last file that
--   may `create or replace` hr_assert_grant_hygiene.
--
-- SAFE TO RE-RUN. Piece 1's alter is idempotent, piece 2 revokes only what is
-- still there, and §3 restates the detector to the same derived body. There are
-- no baseline rows to consume in this file (batch 4 emptied the baseline), so the
-- refuse-if-already-absent hazard the earlier batches carried does not exist here.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — REFUSE TO INSTALL ON A DATABASE THIS IS NOT TRUE OF ──
do $$
declare
  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',
                                    'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
  -- The twelve engine-allow entries the live detector must ALREADY carry, so a
  -- `create or replace` here cannot silently delete a reviewed capability by
  -- replacing a body that had more than this file's derivation assumes.
  c_want constant text[] := array[
    'hr_apply(uuid,integer,bigint,uuid,jsonb)','hr_state_of(uuid,integer)',
    'hr_seed(uuid,integer,text)','hr_total_level(uuid,integer)',
    'hr_level_from_xp(bigint)','hr_xp_for_level(integer)','market_expire(integer)',
    'hr_offline_cap_ms(uuid,integer)','hr_rate_gate(uuid,integer,text)',
    'hr_claim_lookup(uuid,integer,text,text)','hr_perks_of(uuid,integer)',
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)'];
  v_src  text;
  v_arr  text;
  v_live text[];
  v_e    text;
  v_srv  text[];
  v_bad  text;
begin
  -- (a) THE BASELINE AND THE DETECTOR EXIST.
  if to_regclass('public.hr_client_write_baseline') is null then
    raise exception 'REFUSING TO INSTALL: public.hr_client_write_baseline is missing. Apply the sweep '
                    'chain (2026-08-16-client-write-grant-sweep.sql first).';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'REFUSING TO INSTALL: hr_assert_grant_hygiene is missing.';
  end if;

  -- (b) THE LIVE DETECTOR IS THE PRE-TAKEOVER (BATCH 1) BODY. This file's §3 is
  --     DERIVED from that body; if the live one is something else, the derivation
  --     is based on a body the database is not running and the takeover would
  --     replace an unknown function.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';
  if v_src !~ 'hr_client_write_baseline' then
    raise exception 'REFUSING TO INSTALL: the live hr_assert_grant_hygiene predates batch 1''s widened '
                    'check (4) (it does not consult hr_client_write_baseline). Apply the chain in order.';
  end if;
  if v_src !~ 'privilege_type in \(''TRUNCATE'',''REFERENCES'',''TRIGGER''\)' then
    raise exception 'REFUSING TO INSTALL: the live check (4) does not contain the information_schema '
                    'TRUNCATE/REFERENCES/TRIGGER query this file replaces. Either the takeover has '
                    'already happened, or the live body is not the one the derivation was based on '
                    '(node tools/derive-grant-hygiene.mjs --report).';
  end if;
  if v_src ~ 'has_table_privilege\(gg, c\.oid, pv\)' then
    raise exception 'REFUSING TO INSTALL: the live check (4) is ALREADY the has_table_privilege '
                    'takeover — this file has run. It is safe to re-run, but stopping loudly beats a '
                    'silent no-op.';
  end if;

  -- (c) THE ENGINE ALLOWLIST IS EXACTLY THE TWELVE ENTRIES THE DERIVATION ASSUMES.
  v_arr := substring(v_src from 'c_engine_allow constant text\[\] := array\[(.*?)\];');
  if v_arr is null then
    raise exception 'REFUSING TO INSTALL: no c_engine_allow declaration in the live body — not the '
                    'body this file was derived from.';
  end if;
  select array_agg(m[1] order by m[1]) into v_live
    from regexp_matches(v_arr, '''([a-z][a-z0-9_]*\([a-z0-9_, ]*\))''', 'g') m;
  if v_live is null or not ('hr_apply(uuid,integer,bigint,uuid,jsonb)' = any (v_live)) then
    raise exception 'THE ALLOWLIST SCAN IS BLIND (positive control): hr_apply not among the % parsed '
                    'entries.', coalesce(array_length(v_live,1),0);
  end if;
  foreach v_e in array v_live loop
    if not (v_e = any (c_want)) then
      raise exception 'REFUSING TO INSTALL: the live engine allowlist carries "%", which this file''s '
                      'derived body does NOT. Applying it would silently DELETE that reviewed '
                      'capability. Add it to tools/derive-grant-hygiene.mjs and re-derive.', v_e;
    end if;
  end loop;
  foreach v_e in array c_want loop
    if not (v_e = any (v_live)) then
      raise exception 'REFUSING TO INSTALL: the live allowlist is MISSING "%". The live body is not '
                      'the twelve-entry body this file was derived from.', v_e;
    end if;
  end loop;

  -- (d) THE INSTRUMENT CHECK (batch 3's, verbatim): the privilege vocabulary is
  --     DERIVED FROM THE SERVER. If the server knows a table privilege this file
  --     does not enumerate, every measurement below is partial — the exact
  --     failure that left MAINTAIN on batch 1's six.
  select array_agg(distinct a.privilege_type::text order by a.privilege_type::text)
    into v_srv
    from aclexplode(acldefault('r', (select oid from pg_roles where rolname = current_user))) a;
  if v_srv is null then
    raise exception 'REFUSING TO INSTALL: could not derive the table-privilege vocabulary from '
                    'acldefault().';
  end if;
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(v_srv) s where not (s = any (c_vocab));
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: this server knows table privilege(s) this file does not '
                    'enumerate: %. Widen c_vocab (and pieces 1–3) first.', v_bad;
  end if;
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(c_vocab) s where not (s = any (v_srv));
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: this file enumerates privilege(s) this server does not have: '
                    '% (server_version_num = %). MAINTAIN needs PostgreSQL 17+.',
                    v_bad, current_setting('server_version_num');
  end if;

  -- (e) BATCHES 2–4's STATE — reported, not required.
  if exists (select 1 from public.hr_client_write_baseline) then
    raise notice 'SWEEP-5 §0(e): hr_client_write_baseline is NOT empty (% row(s)). Batch 5''s pieces '
                 'do not consume baseline rows, and the widened detector excludes baselined pairs from '
                 'arm 2 — but the chain is meant to run 1→2→3→4→5. §4 STRICT is the backstop.',
                 (select count(*) from public.hr_client_write_baseline);
  end if;

  raise notice 'SWEEP-5 §0 PASSED: the live detector is batch 1''s twelve-entry, pre-takeover body; '
               'the privilege vocabulary is exactly what the server knows (%).',
               array_to_string(v_srv, ',');
end $$;

-- ── 1. PIECE 1 — THE FAIL-CLOSED DEFAULT ACL, AND PROVEN BY EXECUTION ────
do $$
declare
  r_owner text;
  v_owners text;
  v_after  text;
begin
  -- Every role that owns a relation in `public`. A default ACL is keyed on the
  -- CREATING role, and on this database every public table is postgres-owned;
  -- deriving the set rather than typing 'postgres' means a second owner cannot
  -- silently keep an open default ACL.
  for r_owner in
    select distinct c.relowner::regrole::text
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and c.relowner::regrole::text not in ('supabase_admin')  -- platform-owned; §5
  loop
    execute format(
      'alter default privileges for role %I in schema public '
      'revoke insert, update, delete, truncate, references, trigger, maintain '
      'on tables from anon, authenticated, public', r_owner);
    v_owners := coalesce(v_owners || ', ', '') || r_owner;
  end loop;

  -- PROVEN, not asserted. A table created AFTER the alter, in THIS transaction,
  -- must reflect the new default ACL: SELECT for the client roles and NOTHING
  -- else. Dropped immediately; it exists only to read the ACL a real new table
  -- would be born with.
  create table public.hr__defacl_probe5 (id int);
  select string_agg(g || ':' || p || '=' || has_table_privilege(g, 'public.hr__defacl_probe5', p)::text,
                    ', ' order by g, p)
    into v_after
    from unnest(array['anon','authenticated']) g
    cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   where has_table_privilege(g, 'public.hr__defacl_probe5', p);
  if v_after is not null then
    raise exception 'SWEEP-5 §1 FAILED: a table born AFTER the fail-closed default ACL still grants a '
                    'client WRITE privilege: %. The alter did not take.', v_after;
  end if;
  if not (has_table_privilege('anon','public.hr__defacl_probe5','SELECT')
      and has_table_privilege('authenticated','public.hr__defacl_probe5','SELECT')) then
    raise exception 'SWEEP-5 §1 FAILED: the default ACL took SELECT with it. anon-key REST reads of '
                    'world-readable public tables would break. Revoke only the WRITE verbs.';
  end if;
  drop table public.hr__defacl_probe5;

  raise notice 'SWEEP-5 §1: fail-closed default ACL set for owner role(s) [%]; a freshly-created table '
               'is now born with SELECT only for anon/authenticated and no write verb (MAINTAIN '
               'included). The generator is closed.', coalesce(v_owners, '(none found)');
end $$;

-- ── 2. PIECE 2 — THE SCHEMA-WIDE MAINTAIN REVOKE ─────────────────────────
do $$
declare
  r record;
  v_had text;
  v_n   int := 0;
  v_left text;
begin
  -- What is about to go, named at apply time — via has_table_privilege over every
  -- relkind, because information_schema cannot see MAINTAIN OR matviews.
  select string_agg(x.k, ', ' order by x.k) into v_had from (
    select c.relname || ':' || g as k
      from pg_class c cross join unnest(array['anon','authenticated']) g
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(g, c.oid, 'MAINTAIN')) x;

  for r in
    select distinct c.relname
      from pg_class c cross join unnest(array['anon','authenticated','public']) g
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(case when g='public' then 'public' else g end, c.oid, 'MAINTAIN')
     order by 1
  loop
    execute format('revoke maintain on public.%I from public, anon, authenticated', r.relname);
    v_n := v_n + 1;
  end loop;

  -- Nothing survives, over every relkind.
  select string_agg(c.relname || ':' || g, ', ' order by c.relname) into v_left
    from pg_class c cross join unnest(array['anon','authenticated']) g
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
     and has_table_privilege(g, c.oid, 'MAINTAIN');
  if v_left is not null then
    raise exception 'SWEEP-5 §2 FAILED: MAINTAIN survives for a client role on: %', v_left;
  end if;

  raise notice 'SWEEP-5 §2: MAINTAIN revoked from % relation(s) in public; zero (relation, client '
               'role) MAINTAIN pairs remain (matviews included). It was held by [%].',
               v_n, coalesce(v_had, '(none)');
end $$;

-- ── 3. THE DETECTOR TAKEOVER, DERIVED ────────────────────────────────────
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ⚠ THE BLOCK BELOW IS GENERATED. Do not hand-edit between the markers. It is
--   2026-08-16-client-write-grant-sweep.sql's hr_assert_grant_hygiene (batch 1's
--   body, which production runs), EXTRACTED by tools/derive-grant-hygiene.mjs
--   (LINKS[3]) and patched at ONE anchor: check (4)'s query, REPLACED with the
--   has_table_privilege takeover. `node tools/derive-grant-hygiene.mjs --check`
--   re-derives all four links on every run of tests/run-smoke.mjs; PART 1f-ii of
--   tests/run-sql-tests.mjs grades the removed lines.
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
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
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

-- ── 4. SELF-VERIFICATION, WITH MUTATION ARMS ─────────────────────────────
-- (A) STRICT PASSES after pieces 1+2 — the widening did not just move the failure;
-- (B) MAINTAIN IS VISIBLE — a re-granted MAINTAIN on a table is NAMED and FATAL;
-- (C) MATVIEWS ARE VISIBLE — a re-granted MAINTAIN on a matview is NAMED and FATAL
--     (the information_schema body could not have reported this at all);
-- (D) THE DEFAULT ACL HOLDS — a fresh table is born with no client write verb.
do $$
declare v jsonb;
begin
  -- (A)
  v := public.hr_assert_grant_hygiene(true);
  raise notice 'SWEEP-5 §4(A): GRANT HYGIENE STRICT PASSES with the taken-over check (4).';

  -- (B) MAINTAIN VISIBILITY. No handler around the create: if anything raises,
  --     the whole migration rolls back and the probe cannot survive.
  create table public.hr__maint_probe5 (id int primary key);
  alter table public.hr__maint_probe5 enable row level security;
  revoke all on public.hr__maint_probe5 from public, anon, authenticated, service_role;
  grant maintain on public.hr__maint_probe5 to authenticated;
  v := public.hr_assert_grant_hygiene(false);
  if not ((v->'client_truncate_grants')::text like '%hr__maint_probe5:authenticated:MAINTAIN%') then
    raise exception 'SWEEP-5 §4(B) — CHECK (4) IS BLIND TO MAINTAIN: a table granting authenticated '
                    'MAINTAIN was NOT reported. The takeover''s entire purpose is unproven. report=%',
                    (v->'client_truncate_grants')::text;
  end if;
  begin
    v := public.hr_assert_grant_hygiene(true);
    raise exception 'SWEEP-5 §4(B): strict returned normally with a live MAINTAIN grant — the nightly '
                    'cron run would report success.';
  exception when others then
    if sqlerrm not like 'GRANT HYGIENE FAILED%' then raise; end if;
  end;
  revoke maintain on public.hr__maint_probe5 from authenticated;
  drop table public.hr__maint_probe5;

  -- (C) MATVIEW VISIBILITY — the blind spot information_schema could never see.
  create materialized view public.hr__mv_probe5 as select 1 as one;
  revoke all on public.hr__mv_probe5 from public, anon, authenticated, service_role;
  grant maintain on public.hr__mv_probe5 to authenticated;
  v := public.hr_assert_grant_hygiene(false);
  if not ((v->'client_truncate_grants')::text like '%hr__mv_probe5:authenticated:MAINTAIN%') then
    raise exception 'SWEEP-5 §4(C) — CHECK (4) IS BLIND TO MATVIEWS: a materialized view granting '
                    'authenticated MAINTAIN was NOT reported. information_schema omits matviews; the '
                    'takeover was supposed to end that. report=%', (v->'client_truncate_grants')::text;
  end if;
  revoke maintain on public.hr__mv_probe5 from authenticated;
  drop materialized view public.hr__mv_probe5;

  -- (D) THE DEFAULT ACL STILL HOLDS at verify time (a later statement could have
  --     re-opened it). A fresh table must be born fail-closed.
  create table public.hr__defacl_probe5b (id int);
  if exists (select 1 from unnest(array['anon','authenticated']) g
             cross join unnest(array['INSERT','UPDATE','DELETE','MAINTAIN']) p
             where has_table_privilege(g, 'public.hr__defacl_probe5b', p)) then
    raise exception 'SWEEP-5 §4(D): a table born at verify time still carries a client write verb — '
                    'the fail-closed default ACL was undone between §1 and here.';
  end if;
  drop table public.hr__defacl_probe5b;

  v := public.hr_assert_grant_hygiene(true);
  raise notice 'SWEEP-5 §4: STRICT passes; a re-granted MAINTAIN is NAMED and FATAL on BOTH a table '
               'and a MATVIEW; and a freshly-created table is born fail-closed.';
end $$;

-- Prove every probe is gone whichever path ran. A probe left behind is a granted
-- relation nobody reviewed.
do $$
begin
  if to_regclass('public.hr__defacl_probe5') is not null
     or to_regclass('public.hr__defacl_probe5b') is not null
     or to_regclass('public.hr__maint_probe5') is not null
     or to_regclass('public.hr__mv_probe5') is not null then
    raise exception 'SWEEP-5: a self-check probe survived this migration';
  end if;
end $$;

-- ── 5. WHAT WAS FIXED, AND WHAT IS LEFT ──────────────────────────────────
-- (1) ⚠ clan_members AND clans still take client writes — UNCHANGED by this file,
--     and stated because the fail-closed default ACL raises the obvious question.
--     Piece 1 is PROSPECTIVE: it changes what a NEW table is born with and touches
--     no existing grant, so it does NOT close (and does not break) the live
--     `join as self` / `leave as self` / `clans creatable` policies on those two.
--     Piece 2 removed their dead MAINTAIN only; their INSERT/DELETE grants behind
--     the live policies are intact and clan joining/founding/leaving still work.
--     Closing them is 2026-08-12-clan-members-rls-drop.sql (STAGED, precondition
--     unmet on production 2026-08-16). ⚠ AND NOW A COUPLING: once that file drops
--     their policies, clan_members and clans JOIN arm 2 of the (now sharper)
--     detector — dead i/u/d grants on RLS-on tables with no policy — and the
--     nightly run will RAISE on them until a companion revoke of those grants
--     lands in the SAME change. That companion is the rls-drop's own follow-up,
--     not this file.
-- (2) leaderboard_ranked (MATVIEW) still carries anon/authenticated INSERT/UPDATE/
--     DELETE from the old default ACL. It is DEAD — a materialized view cannot be
--     written through any path, and its SELECT was already revoked by
--     2026-08-14-leaderboard-view-lockdown.sql — so the widened check does NOT
--     flag it (arm 1 is verbs-no-client-needs; arm 2 requires RLS, which matviews
--     lack). Named for the leaderboard programme; a one-line revoke would tidy it.
-- (3) supabase_admin's public table default ACL ({anon=arwdDxtm}) is un-editable
--     by us and bites only tables CREATED BY supabase_admin in `public`, which our
--     migrations never do. A platform posture, like service_role (batch 1 §header).
-- (4) service_role. Still deliberately out of scope.
do $$
declare v_m int; v_c int;
begin
  select count(*) into v_m from pg_class c cross join unnest(array['anon','authenticated']) g
   where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','m')
     and has_table_privilege(g, c.oid, 'MAINTAIN');
  select count(*) into v_c from pg_class c cross join unnest(array['anon','authenticated']) g
   where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and c.relrowsecurity
     and (has_table_privilege(g,c.oid,'INSERT') or has_table_privilege(g,c.oid,'UPDATE')
       or has_table_privilege(g,c.oid,'DELETE'))
     and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname
                      and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
     and not exists (select 1 from public.hr_client_write_baseline b
                      where b.table_name=c.relname and b.grantee=g);
  raise notice 'CLIENT WRITE GRANT SWEEP BATCH 5 APPLIED. The generator is fail-closed, % client '
               'MAINTAIN pair(s) remain (0 wanted), and the live dead-grant class holds % (relation, '
               'role) pair(s) (0 wanted). check (4) now sees MAINTAIN and matviews permanently — the '
               'dead-grant sweep is a PROPERTY, not a state.', v_m, v_c;
end $$;
-- ════════════════════════════════════════════════════════════════════════
