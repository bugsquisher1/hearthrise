-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-14-leaderboard-view-lockdown.sql   — F5, THE OTHER HALF.
--
-- ⚠ STAGED. DO NOT APPLY UNTIL b340's CLIENT IS DEPLOYED. It drops two views
--   that the client running in players' browsers TODAY reads directly. The
--   ordering is not a preference — applying this first breaks the clan browser
--   and the no-module leaderboard fallback for everyone on the old build.
--
-- ── WHAT F5 IS ──────────────────────────────────────────────────────────
-- Five SECURITY DEFINER **views** let `anon` read around game_saves RLS.
-- Proven by execution as role `anon` with no JWT on 2026-08-13: a direct
-- `game_saves` select returned 0 rows (RLS holds) while `leaderboard`,
-- `clan_leaderboard` and `leaderboard_ranked` all returned real rows — every
-- player's uuid, name, gold and levels to an unauthenticated caller.
--
-- `2026-08-13-drop-dead-leaderboard-views.sql` (APPLIED) closed the three that
-- were genuinely dead. It explicitly refused to close these, and said why: the
-- client fetched both directly, so dropping them would have closed two advisor
-- ERRORs and broken the live game. That is a bad trade, and it is still a bad
-- trade — which is why this file ships AFTER the client change, not instead of
-- one.
--
-- ── THE THREE THINGS THIS DOES ──────────────────────────────────────────
--  1. `hr_clan_browser(int)` — the clan browser's feed as a gated RPC.
--     `clan_leaderboard` was never a leaderboard: it is the ten-column feed
--     behind "Find a hold", and `hr_leaderboard`'s `clan_power` board cannot
--     stand in for it (that board carries rank/name/score, and the browser
--     needs level, members, member_cap and join_policy to draw a Join button
--     that can work — see 2026-08-11-clan-browser-door.sql, which added the
--     last two for exactly that reason). So this one IS a new RPC, and the
--     narrowing is real: `anon` can no longer enumerate every hold.
--  2. DROP `public.leaderboard` and `public.clan_leaderboard`.
--  3. REVOKE `anon`/`authenticated` SELECT on `leaderboard_ranked`. While the
--     matview is directly selectable, `hr_leaderboard`'s `p_limit <= 100`
--     clamp AND its rate gate are both decorative — a caller simply reads the
--     matview instead. This is the revoke that makes the RPC the only door.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
-- It does not touch `hr_leaderboard`, `leaderboard_ranked`'s definition, the
-- refresh cron, or `hr_leaderboard_refresh` (SECURITY DEFINER, so it keeps
-- working without the client grant). It does not narrow `market_sales` or
-- `market_buy_offers` — those publish auth UUIDs too and are recorded as open
-- in 2026-08-11-market-v2.sql §2 and 2026-08-12-market-offers-authority.sql §4
-- rather than half-closed here.
--
-- It also does not delete `legacyBoard()` from src/features/leaderboards.js.
-- That degrade path reads `public.leaderboard` and is reachable only on a
-- database that has no `hr_leaderboard` at all — i.e. a fresh self-host from
-- schema.sql, where the view still exists. On any database this file has been
-- applied to, the RPC is present and the path is unreachable.
--
-- ── VOLATILITY, BECAUSE THIS PROJECT HAS ALREADY PAID FOR IT ────────────
-- `hr_clan_browser` reads and returns nothing else, so STABLE is the instinct.
-- STABLE WOULD BE A LIVE OUTAGE. It calls `hr_rate_ok`, which INSERTs a
-- counter row, and PostgREST honours a STABLE declaration by running the
-- function in a READ-ONLY transaction: every call would return
-- `25006 cannot execute INSERT in a read-only transaction`. That is exactly
-- what killed new-player sign-up on 2026-08-13 when `beta_invite_check` was
-- STABLE and `2026-08-13-anon-rate-gate.sql` gave a function two levels below
-- it a write. §5(f) asserts `provolatile = 'v'` structurally, the same way
-- apply-engine §6(f) does for hr_state_of.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
--   drop function public.hr_clan_browser(int);
--   -- `leaderboard` : supabase/schema.sql:586
--   -- `clan_leaderboard` : 2026-08-11-clan-browser-door.sql (the 10-column form)
--   grant select on public.leaderboard_ranked to anon, authenticated;
-- No table is created or dropped and no row of player data is read or written
-- outside §5's rolled-back fixture. SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0. Preconditions — FAIL CLOSED ─────────────────────────────────────
do $$
begin
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'leaderboard_ranked is missing — hr_leaderboard reads it and this file would '
                    'revoke a grant on nothing while leaving the client with no board at all';
  end if;
  -- to_regprocEDURE, not to_regproc: to_regproc does not parse an argument list
  -- and returns NULL for an ambiguous name, so the to_regproc form is the
  -- always-null probe this repo has shipped nine times.
  if to_regprocedure('public.hr_leaderboard(text,int,int)') is null then
    raise exception 'hr_leaderboard(text,int,int) is missing — revoking the matview would leave '
                    'NO path to the boards. Apply 2026-08-08-leaderboards.sql first';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null then
    raise exception 'hr_rate_ok is missing — hr_clan_browser would be an ungated client RPC (A9)';
  end if;
  if to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 're-run 2026-08-11-player-state.sql (revision 4) — hr_clan_browser records its '
                    'rate-limit rejections (C2) and samples them (S6), and neither is optional';
  end if;
  if to_regclass('public.clans') is null or to_regclass('public.clan_members') is null then
    raise exception 'clans/clan_members are missing — hr_clan_browser has nothing to read';
  end if;
  if to_regclass('public.hr_castle_tiers') is null then
    raise exception 'hr_castle_tiers is missing — member_cap has nothing to derive from and the '
                    'browser would draw a Join button on a full hold';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regprocedure('public.hr_grant_baseline_sync(text)') is null then
    raise exception 'apply 2026-08-11-grant-hygiene.sql first — this file widens the client RPC '
                    'surface by one and that widening must print its own diff (S9)';
  end if;
end $$;

-- ── §1. hr_clan_browser — the browser feed, gated ───────────────────────
-- The projection is `clan_leaderboard`'s, column for column, so the client's
-- mapping does not change: id, name, level, treasury, castle_tier, standing,
-- upkeep_state, members, join_policy, member_cap.
--
-- ⚠ THE SHAPE IS A jsonb ENVELOPE, not `returns setof`. A set-returning
--   function would let PostgREST apply client `?order=`/`?limit=` on top,
--   which re-creates in the RPC exactly the unbounded surface this file is
--   closing on the view. One envelope, one server-owned limit.
create or replace function public.hr_clan_browser(p_limit int default 25)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid   uuid := auth.uid();
  -- SERVER-OWNED. The client asks for 25; whatever it asks for, it gets at
  -- most 50. This is the clamp that was decorative while the matview and the
  -- view were both directly selectable.
  v_limit int  := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_rows  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- A9. 120/min: the browser is a panel-open read, in the same class as
  -- clan_seat_read and hr_leaderboard in hr_rpc_gate's `case`. The bucket is
  -- named here rather than added to that `case` ON PURPOSE — two files must
  -- not both own one `case`, and whichever applied second would silently
  -- delete the other's buckets, which fails CLOSED (every affected RPC dead).
  -- Same reasoning hr_rpc_gate's own header gives for not folding itself into
  -- hr_rate_gate, and the same shape market-v2's three RPCs use.
  --
  -- The rejection is RECORDED (C2) and SAMPLED (S6), the same shape market-v2's
  -- three RPCs use. Recorded, because the rate limit returns before anything
  -- else is written, so without this the loudest automation signal the server
  -- produces leaves no trace at all. Sampled, because an unconditional write
  -- here means a retry storm costs a row lock and a WAL record per request, all
  -- serialised on one tuple — the server doing more durable work the harder it
  -- is hammered. hr_rpc_gate does both internally; a direct hr_rate_ok caller
  -- has to do them itself, and tests/run-sql-tests.mjs fails the build if it
  -- does not.
  if not public.hr_rate_ok(v_uid, 'rpc:hr_clan_browser', 120, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'rpc:hr_clan_browser') - 120) > 0 then
      perform public.hr_record_rejection(v_uid, 0, 'hr_clan_browser', 'rate_limited',
        jsonb_build_object('limit', 120, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'rpc:hr_clan_browser') - 120));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- The ORDER is carried by an explicit rank column and re-stated in the
  -- aggregate. `jsonb_agg` over an ordered subquery does NOT inherit that
  -- subquery's order — it is only ever a coincidence of the plan — and the
  -- browser's ranking ("strongest holds first") is the whole reason a player
  -- reads the top of this list. Same ordering clan_leaderboard published, so
  -- nothing reshuffles on the day this applies.
  with ranked as (
    select c.id, c.name, c.level, c.treasury, c.castle_tier, c.standing, c.upkeep_state,
           count(m.user_id) as members,
           c.join_policy,
           coalesce(t.member_cap,
                    (select min(member_cap) from public.hr_castle_tiers), 10) as member_cap,
           row_number() over (order by c.castle_tier desc, c.standing desc,
                                       c.level desc, c.treasury desc, c.id) as rn
      from public.clans c
      left join public.clan_members m on m.clan_id = c.id
      left join public.hr_castle_tiers t on t.tier = greatest(1, coalesce(c.castle_tier, 1))
     group by c.id, t.member_cap
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'level', r.level, 'treasury', r.treasury,
           'castle_tier', r.castle_tier, 'standing', r.standing,
           'upkeep_state', r.upkeep_state, 'members', r.members,
           'join_policy', r.join_policy, 'member_cap', r.member_cap
         ) order by r.rn), '[]'::jsonb)
    into v_rows
    from ranked r
   where r.rn <= v_limit;

  return jsonb_build_object('ok', true, 'clans', v_rows);
end $$;
revoke execute on function public.hr_clan_browser(int) from public;
revoke execute on function public.hr_clan_browser(int) from anon, service_role;
grant  execute on function public.hr_clan_browser(int) to authenticated;

-- ── §2. Drop the two views ──────────────────────────────────────────────
-- Enumerated BEFORE the drop rather than discovered after it. Neither view has
-- ever had a dependent (verified on production 2026-08-13, and asserted here so
-- a future one is a refusal instead of a silent cascade). `leaderboard_ranked`
-- reads game_saves and clans DIRECTLY, not through either view, so nothing the
-- boards need is downstream of this.
do $$
declare v_dep text;
begin
  select string_agg(distinct c.relname, ', ') into v_dep
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = r.ev_class
   where d.refobjid in (coalesce(to_regclass('public.leaderboard'), 0::oid),
                        coalesce(to_regclass('public.clan_leaderboard'), 0::oid))
     and c.relname not in ('leaderboard', 'clan_leaderboard');
  if v_dep is not null then
    raise exception 'REFUSING TO DROP: these objects depend on the leaderboard views and this file '
                    'does not recreate them: %', v_dep;
  end if;
end $$;

drop view if exists public.leaderboard;
drop view if exists public.clan_leaderboard;

-- ── §3. The matview stops being a client-readable table ─────────────────
-- hr_leaderboard is SECURITY DEFINER and owned by the migration role, so it
-- keeps reading this; hr_leaderboard_refresh likewise. §5(c) proves BOTH
-- halves — the revoke bit, and the RPC still answers — because a revoke that
-- also broke the boards would otherwise look identical to a revoke that worked.
revoke select on public.leaderboard_ranked from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- §5  SELF-VERIFICATION — BEHAVIOURAL, with a control beside every refusal
-- A guard that refuses everything must not be able to pass this block.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_bad     text;
  v_n       bigint;
  v_out     jsonb;
  v_uid     uuid;
  v_caught  boolean;
  v_vol     char;
begin
  -- (a) The views are gone…
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('leaderboard', 'clan_leaderboard');
  if v_bad is not null then
    raise exception 'SELF-CHECK FAILED: % survived the drop', v_bad;
  end if;

  -- …and the CONTROL: everything the boards actually run on is still here. An
  -- assertion that can only report success is the failure mode this repo has
  -- hit twelve times; without these three lines the check above passes just as
  -- happily on a migration that dropped the whole leaderboard subsystem.
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'CONTROL FAILED: leaderboard_ranked was dropped — hr_leaderboard reads it';
  end if;
  if to_regprocedure('public.hr_leaderboard(text,int,int)') is null then
    raise exception 'CONTROL FAILED: hr_leaderboard is gone — there is now no path to the boards';
  end if;
  if to_regprocedure('public.hr_clan_browser(int)') is null then
    raise exception 'CONTROL FAILED: hr_clan_browser was not created — the clan browser has no feed';
  end if;

  -- (b) THE GRANTS. Neither client role may hold SELECT on the matview.
  --
  --     ⚠ ASKED WITH has_table_privilege, NOT information_schema. The first
  --       revision of this check queried information_schema.role_table_grants
  --       — and information_schema DOES NOT LIST MATERIALIZED VIEWS AT ALL
  --       (they are not in the SQL standard, so PostgreSQL omits them from
  --       every information_schema relation). It therefore returned NULL on a
  --       database where anon still held the grant, and passed. That is the
  --       always-null-probe family, instance eleven on this project, and it was
  --       caught by tests/leaderboard-lockdown-guard.mjs's `matview_left_readable`
  --       mutation firing on §5(g) — the behavioural check — instead of here.
  --       has_table_privilege asks the ACL directly and follows role
  --       membership, which is the actual question.
  foreach v_bad in array array['anon', 'authenticated', 'public'] loop
    if has_table_privilege(v_bad, 'public.leaderboard_ranked', 'select') then
      raise exception 'F5 OPEN: leaderboard_ranked is still client-selectable by % — hr_leaderboard''s '
                      'p_limit clamp and rate gate remain decorative', v_bad;
    end if;
  end loop;

  -- (c) …AND THE BOARDS STILL ANSWER. This is the control for (b). hr_leaderboard
  --     is SECURITY DEFINER, so the revoke must not reach it — and "the revoke
  --     worked" and "the revoke broke the boards" are indistinguishable without
  --     this call. `ok` is asserted, not the row count: a freshly rebuilt
  --     database has no saves and an empty board is correct there.
  v_out := public.hr_leaderboard('total_level', 5, 1);
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    raise exception 'CONTROL FAILED: hr_leaderboard no longer answers after the revoke: %', v_out::text;
  end if;
  v_out := public.hr_leaderboard('clan_power', 5, 1);
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    raise exception 'CONTROL FAILED: the clan_power board no longer answers: %', v_out::text;
  end if;

  -- (d) hr_clan_browser's REACHABILITY, both directions.
  if has_function_privilege('anon', 'public.hr_clan_browser(int)', 'execute') then
    raise exception 'hr_clan_browser is anon-executable — this file exists to stop an '
                    'unauthenticated caller enumerating every hold';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_clan_browser(int)', 'execute') then
    raise exception 'BROKE THE FEATURE: a signed-in player cannot call hr_clan_browser, so '
                    '"Find a hold" is now an empty screen';
  end if;

  -- (e) BEHAVIOURAL. A signed-out caller is refused; a signed-in one is served;
  --     the limit is clamped no matter what the client asks for; and the member
  --     counts agree with clan_members (the fan-out check 2026-08-11-clan-
  --     browser-door.sql made against the view, re-made against its replacement
  --     — a LEFT JOIN with more than one matching row would double every count
  --     silently).
  perform set_config('request.jwt.claim.sub', '', true);
  v_out := public.hr_clan_browser(25);
  if coalesce(v_out->>'ok', 'true') <> 'false' or v_out->>'error' <> 'not_signed_in' then
    raise exception 'hr_clan_browser served an UNAUTHENTICATED caller: %', v_out::text;
  end if;

  select id into v_uid from auth.users order by id limit 1;
  if v_uid is null then
    raise warning 'no auth.users row — SKIPPING the behavioural half of §5(e)';
  else
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    -- CONTROL for the refusal above: the same call, signed in, must succeed.
    v_out := public.hr_clan_browser(25);
    if coalesce(v_out->>'ok', 'false') <> 'true' then
      raise exception 'CONTROL FAILED: a signed-in caller was refused (%) — hr_clan_browser '
                      'refuses everything', v_out::text;
    end if;

    -- The clamp. Asked for 99999; the answer is bounded by the SERVER.
    v_out := public.hr_clan_browser(99999);
    if jsonb_array_length(v_out->'clans') > 50 then
      raise exception 'the p_limit clamp did not bite: % rows returned',
        jsonb_array_length(v_out->'clans');
    end if;
    -- …and its control: a clamp that returned nothing would pass the line above.
    select count(*) into v_n from public.clans;
    if v_n > 0 and jsonb_array_length(v_out->'clans') = 0 then
      raise exception 'CONTROL FAILED: % clan(s) exist and the browser returned none', v_n;
    end if;

    -- The projection: every column the client reads must be present on a row.
    if v_n > 0 then
      foreach v_bad in array array['id','name','level','treasury','castle_tier','standing',
                                   'upkeep_state','members','join_policy','member_cap'] loop
        if not ((v_out->'clans'->0) ? v_bad) then
          raise exception 'hr_clan_browser dropped column "%" — src/features/clans.js reads it', v_bad;
        end if;
      end loop;
      if jsonb_typeof(v_out->'clans'->0) <> 'object'
         or (select count(*) from jsonb_object_keys(v_out->'clans'->0)) <> 10 then
        raise exception 'hr_clan_browser returns % key(s), expected exactly the 10 the view '
                        'published — an extra key is a wire shape a client will come to depend on',
          (select count(*) from jsonb_object_keys(v_out->'clans'->0));
      end if;
    end if;

    -- The member count must equal the truth, per clan.
    select count(*) into v_n
      from jsonb_array_elements(v_out->'clans') e
     where (e->>'members')::bigint is distinct from
           (select count(*) from public.clan_members m where m.clan_id = (e->>'id')::uuid);
    if v_n > 0 then
      raise exception '% clan row(s) report a member count that disagrees with clan_members — '
                      'the LEFT JOIN fanned the aggregate out', v_n;
    end if;

    perform set_config('request.jwt.claim.sub', '', true);
  end if;

  -- (f) VOLATILITY, ASSERTED STRUCTURALLY. hr_clan_browser calls hr_rate_ok,
  --     which INSERTs. PostgREST runs a STABLE function in a read-only
  --     transaction, so a STABLE declaration here is a 25006 on every call —
  --     the exact shape that killed sign-up on 2026-08-13. One word, whole
  --     feature, and a reader cannot see it in the body.
  select p.provolatile into v_vol from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_clan_browser';
  if v_vol <> 'v' then
    raise exception 'hr_clan_browser is provolatile=% — it calls hr_rate_ok, which WRITES. '
                    'PostgREST runs a non-VOLATILE function in a read-only transaction and every '
                    'call would return 25006.', v_vol;
  end if;

  -- (g) A LIVE ROLE CANNOT READ THE MATVIEW. The grant check in (b) reads the
  --     catalogue; this reads the answer. A privilege can be held through a
  --     role membership the catalogue query above does not follow.
  v_caught := false;
  begin
    set local role authenticated;
    perform 1 from public.leaderboard_ranked limit 1;
  exception when insufficient_privilege then v_caught := true;
  end;
  reset role;
  if not v_caught then
    raise exception 'F5 OPEN: role `authenticated` read leaderboard_ranked directly';
  end if;

  -- (h) THE WIDENING PRINTS ITS OWN DIFF. hr_clan_browser is a NEW
  --     `authenticated` RPC, and the hygiene detector is differential against
  --     hr_client_rpc_baseline — so it would correctly report it as unapproved.
  --     Recording it is meant to be a deliberate act with a written reason,
  --     which is what hr_grant_baseline_sync is; the assertion after it then
  --     covers everything else, including check (8), which would fail if this
  --     function had been born without a rate gate.
  perform public.hr_grant_baseline_sync(
    'F5 (2026-08-14): hr_clan_browser becomes client-callable — it replaces the world-readable '
    || 'clan_leaderboard view for src/features/clans.js listClans(), is authenticated-only, '
    || 'rate-gated at 120/min and clamps its own limit');
  perform public.hr_assert_grant_hygiene(true);

  raise notice 'F5 CLOSED — leaderboard and clan_leaderboard dropped, leaderboard_ranked is no '
               'longer client-selectable, and the clan browser reads hr_clan_browser (authenticated, '
               'gated, clamped). hr_leaderboard is now the ONLY door to the boards.';
end $$;
