-- ============================================================================
-- 2026-08-13-anon-rate-gate.sql   — F4 (P0). STAGED, NOT APPLIED.
--
-- ⚠ THIS MUST LAND BEFORE A11's SERVER HALF
--   (`2026-08-11-live-market-rls.sql` re-applied with
--    `set hearthrise.beta_invites_lockdown_ok = 'yes'`, item 1b in the
--    handoff's NEXT-IN-ORDER). A11 drops beta_invites' world-readable policy
--    and leaves `beta_invite_check` — anon-callable by design, because it runs
--    BEFORE sign-up — as the only path to invite-code information. Applying A11
--    first does not close the exposure; it CONVERTS it, from a `select *` into
--    an UNLIMITED-RATE ORACLE, and records the result as CLOSED.
--
-- WHAT IS OPEN (proven by execution against production, by the Security
-- Engineer 2026-08-13; the live body was re-read to confirm the line):
--
--     hr_rpc_gate(p_bucket text) contains, verbatim:
--         if v_uid is null then return true; end if;
--
--   so EVERY anonymous call is unrated. Executed: 30 anon calls against a limit
--   of 20 → 0 refused. The authenticated control on the same bucket → 10
--   refused, which is what makes the probe capable of seeing failure.
--
--   The line is not an oversight — §2b of
--   2026-08-11-authenticated-surface-lockdown.sql argues for it explicitly:
--   "An UNAUTHENTICATED caller has no per-caller key, so there is nothing to
--   count… inventing a shared anon bucket would hand one attacker a switch that
--   locks every anonymous visitor out of it." That reasoning was SOUND when the
--   only anon-reachable gated function was hr_leaderboard, a public board. A11
--   changes the premise. This file answers the objection rather than
--   overruling it: the shared switch is the FALLBACK, not the mechanism, and it
--   is per-bucket and generous.
--
-- WHAT THIS FILE DOES
--   (a) hr_request_ip() — derive a per-caller key for an anonymous request from
--       the PostgREST `request.headers` GUC.
--   (b) hr_rpc_gate() — anon calls are now counted, keyed on that IP; when no
--       IP can be derived they fall to ONE shared per-bucket ceiling.
--   Nothing about the authenticated path changes. The `case` of limits is
--   reproduced byte-for-byte from the live body (including the
--   'clan_invites_list' bucket that production has and the repo file does not —
--   see §0's drift note), because two files must not both own one `case`.
--
-- ── WHAT A CALLER CAN FORGE, STATED PLAINLY ─────────────────────────────────
-- This is a SPEED BUMP with a named residual, not a closed door. Read this
-- before treating F4 as fixed:
--
--   1. `x-forwarded-for` is CLIENT-SETTABLE. Every proxy in the path APPENDS
--      to it, so the FIRST element is whatever the attacker typed and the LAST
--      is what the nearest trusted proxy wrote. This function therefore reads
--      the LAST element and never the first. `cf-connecting-ip` is preferred
--      over it: Cloudflare OVERWRITES that header at the edge, so a
--      client-supplied copy does not survive.
--   2. UNVERIFIED, AND I COULD NOT VERIFY IT: whether Supabase's own gateway
--      preserves `cf-connecting-ip` through to PostgREST, and what it leaves in
--      `x-forwarded-for`. `execute_sql` reaches the database over the
--      Management API, where `request.headers` is not set at all, so there is
--      no read-only probe that answers this. If the gateway appends its own
--      hop, the last XFF element could be a small set of gateway addresses and
--      every anon caller would collapse into a handful of buckets. The
--      post-apply check in the report tells you which world you are in in one
--      query, and §2's fallback is what makes the bad case survivable rather
--      than catastrophic.
--   3. AN IP KEY IS NOT AN IDENTITY. A botnet, a proxy pool, or one IPv6 /64
--      defeats it outright. It raises the cost of a brute-force sweep; it does
--      not stop a funded one.
--   4. THEREFORE the load-bearing defence for the invite oracle is CODE
--      ENTROPY, not this rate limit. Production holds 20 codes of 9–11
--      characters, none of them alphanumeric-only (so they carry a separator
--      and are plausibly word-shaped). At the per-IP limit installed here one
--      IP can still try ~28,800 codes a day. **Security Engineer: confirm the
--      code space before A11 ships**; if the codes are memorable rather than
--      random, rotate them to high-entropy values. That decision, not this
--      file, is what makes the oracle safe.
--
-- ── THE LOCKOUT TRADE-OFF, DECIDED DELIBERATELY ─────────────────────────────
-- §2b's objection is real: a shared anon counter is a switch an attacker can
-- flip against every anonymous visitor. Three things bound it here.
--   · The shared bucket is only reached when NO key is derivable. With a key,
--     an attacker exhausts their own bucket and nobody else's.
--   · It is PER BUCKET, so hammering beta_invite_check cannot take down
--     hr_leaderboard.
--   · Its limit is 600/minute, roughly 100× the entire beta's traffic, chosen
--     to stop a firehose rather than to be tight.
-- The alternative is leaving anon unlimited and shipping A11 on top of it. A
-- one-minute, one-bucket, visible degradation is a better failure than a
-- silent unlimited oracle. Both halves of that judgement are recorded so the
-- Security Engineer can overrule it with the facts in front of them.
--
-- OBSERVABILITY: anon rejections are recorded through the same sampled
-- hr_record_rejection path as authenticated ones, under a SYNTHETIC user_id
-- derived from the key (md5 of the key text, cast to uuid). hr_rejections has
-- no FK on user_id, so this is safe; the rows are distinguishable because
-- `intent` is prefixed 'anon:'. A lockout is therefore visible in a table
-- somebody already reads rather than silent.
--
-- REVERSIBILITY: two `create or replace`s and one revoke. To undo, re-apply
-- §2b of 2026-08-11-authenticated-surface-lockdown.sql and
-- `drop function public.hr_request_ip()`. No table, no policy, no row of
-- player data is touched.
--
-- GUARDED BY: tests/anon-rate-gate.mjs (behavioural, PGlite/PG18) — 30 anon
-- calls against a limit of 20 must produce refusals > 0, with the
-- authenticated control that made the original finding legible. Mutation-proven
-- — see that file's header.
-- ============================================================================

-- ── 0. PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare v_src text; v_case text; v_n int;
begin
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) is missing — apply 2026-08-11-authenticated-surface-lockdown.sql first';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null then
    raise exception 'hr_rate_ok is missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- DRIFT CHECK, and it is load-bearing. This file restates the whole `case`
  -- of bucket limits. If production's live `case` has a bucket this file's
  -- replacement does not, the replace SILENTLY DELETES it and every RPC in that
  -- bucket fails closed — dead, with no client-side error anyone can read. That
  -- is the "three files each owning one policy" bug from
  -- 2026-08-11-clan-membership-authority.sql, in a new place.
  --
  -- Known and accounted for: production's live body carries
  -- 'clan_invites_list' (a 120-limit read) and the seven membership buckets
  -- that 2026-08-11-clan-membership-authority.sql added, none of which are in
  -- 2026-08-11-authenticated-surface-lockdown.sql's committed text. §2 below is
  -- written against PRODUCTION's list, not the file's.
  --
  -- Rather than trust that transcription, harvest the buckets OUT OF THE LIVE
  -- BODY here and make §3 prove BEHAVIOURALLY that the replacement still admits
  -- every one of them. A regex over the new file's own text would be the
  -- assertion-that-asserts-nothing again; calling the new function once per
  -- harvested bucket is not.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_rpc_gate';

  v_case := regexp_substr(v_src, 'case p_bucket(.*?)end case', 1, 1, '', 1);
  if v_case is null or length(v_case) < 100 then
    raise exception 'could not locate the bucket `case` in the live hr_rpc_gate body — the drift check would harvest nothing and prove nothing';
  end if;

  -- A plain temp table, not `on commit drop`: apply_migration wraps this file
  -- in one transaction, but psql and the PGlite guard do not, and an
  -- `on commit drop` table would vanish before §3 could read it — leaving the
  -- drift check silently harvesting from nothing.
  drop table if exists _hr_gate_buckets_before;
  create temp table _hr_gate_buckets_before (bucket text primary key);
  insert into _hr_gate_buckets_before (bucket)
    select distinct m[1] from regexp_matches(v_case, '''([a-z_]+)''', 'g') m
    on conflict do nothing;

  select count(*) into v_n from _hr_gate_buckets_before;
  if v_n < 30 then
    raise exception 'harvested only % buckets out of the live hr_rpc_gate — the harvest is broken, so the drift check cannot see a deletion', v_n;
  end if;
end $$;

-- ── 1. THE ANONYMOUS KEY ────────────────────────────────────────────────────
create or replace function public.hr_request_ip()
returns text language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  v_raw   text;
  v_h     jsonb;
  v_ip    text;
  v_parts text[];
begin
  -- PostgREST publishes the request headers as a JSON object in this GUC, with
  -- lowercased names. `true` = missing_ok: on any other connection path (a
  -- direct psql session, the Management API, pg_cron) it is simply absent and
  -- this returns NULL, which the caller treats as "no key".
  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is null then return null; end if;
  begin
    v_h := v_raw::jsonb;
  exception when others then
    return null;                       -- malformed: no key, do not guess
  end;
  if jsonb_typeof(v_h) is distinct from 'object' then return null; end if;

  -- (1) Cloudflare's own header. Set — and overwritten — at the edge, so a
  --     client-supplied copy does not reach here.
  v_ip := nullif(btrim(coalesce(v_h->>'cf-connecting-ip', '')), '');
  if v_ip is not null then return left(v_ip, 64); end if;

  -- (2) X-Forwarded-For, LAST element only. Each hop appends, so the last
  --     entry is the one the nearest trusted proxy wrote and everything before
  --     it is attacker-authored. Reading the first element — the usual mistake
  --     — would make this key trivially forgeable and therefore worse than no
  --     key at all, because it would look like a limit.
  v_ip := nullif(btrim(coalesce(v_h->>'x-forwarded-for', '')), '');
  if v_ip is not null then
    v_parts := string_to_array(v_ip, ',');
    v_ip := nullif(btrim(v_parts[array_length(v_parts, 1)]), '');
    if v_ip is not null then return left(v_ip, 64); end if;
  end if;

  return null;
end $$;

-- Never client-callable. It is a read of the caller's own header, so it leaks
-- nothing to its caller — but the house rule is revoke-before-grant on every
-- new function, and Supabase's default ACL grants EXECUTE to PUBLIC plus the
-- three client roles on every one of them.
revoke execute on function public.hr_request_ip() from public;
revoke execute on function public.hr_request_ip() from anon, authenticated, service_role;

-- ── 2. THE GATE ─────────────────────────────────────────────────────────────
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  -- The anonymous fallback ceiling: shared by every keyless anon caller, but
  -- only within ONE bucket, and set ~100× above the whole beta's traffic. See
  -- the lockout trade-off in this file's header.
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  -- THE LIMITS. Owned here, in a `case` no caller can reach, keyed by a bucket
  -- name validated against this allowlist. An unknown bucket is REFUSED rather
  -- than defaulted. Reproduced from PRODUCTION's live body, not from the
  -- committed text of 2026-08-11-authenticated-surface-lockdown.sql — see §0.
  case p_bucket
    -- reads — cheap, and called on panel open / page load
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    -- ordinary player actions
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle'
      then v_limit := 60;
    -- rare, expensive, or one-per-period by design
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         -- membership (2026-08-11-clan-membership-authority.sql)
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set'
      then v_limit := 12;
    -- companion file 2026-08-11-live-market-rls.sql
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  -- ── WHO IS BEING COUNTED ─────────────────────────────────────────────────
  -- Authenticated: the uid, exactly as before. Anonymous: an IP-derived key if
  -- one can be had, otherwise one shared per-bucket ceiling. The key is hashed
  -- into a uuid so it fits hr_rate_counters.user_id without a schema change or
  -- a second counter table; hr_rate_counters has no FK on that column, and the
  -- bucket names are namespaced ('rpc:anon:…' / 'rpc:anon-unkeyed:…') so a hash
  -- that happened to collide with a real uid would still land in a different
  -- row of the (user_id, bucket) primary key.
  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  -- SAMPLED, not per-call: an unconditional write here would make the server do
  -- more durable work the harder it is hammered, all serialised on one tuple
  -- (player-state.sql §6c-ii).
  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $$;

-- `create or replace` preserves the ACL, but restate it so this file is
-- correct on its own. NOT granted to anything: every caller is a SECURITY
-- DEFINER function running as the owner. A client that could call the gate
-- could spend its own budget on demand and, the bucket being a parameter,
-- spend it in whichever shape hurt most.
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 3. SELF-CHECK — the commit gate ─────────────────────────────────────────
do $$
declare
  c_inst  constant uuid := '00000000-0000-0000-0000-000000000000';
  c_limit constant int := 20;         -- the 'beta_invite_check' bucket
  v_u     uuid := gen_random_uuid();
  v_probe uuid := gen_random_uuid();
  v_b     text;
  v_lost  text;
  v_probed int := 0;
  v_anon_refused int := 0;
  v_auth_refused int := 0;
  v_unknown boolean;
  v_first_ok boolean;
  v_bad text;
  i int;
begin
  -- (a) STRUCTURAL — still not client-executable, either of them.
  select string_agg(g || ':hr_rpc_gate', ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.hr_rpc_gate(text)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rpc_gate is executable by: % — revoke before grant', v_bad;
  end if;
  select string_agg(g || ':hr_request_ip', ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.hr_request_ip()', 'execute');
  if v_bad is not null then
    raise exception 'hr_request_ip is executable by: % — revoke before grant', v_bad;
  end if;

  -- (b0) BEHAVIOURAL DRIFT CHECK — every bucket the LIVE body admitted before
  -- this file ran must still be admitted. This is the "two files own one
  -- `case`" failure mode: whichever applies second silently deletes the
  -- other's buckets, and a lost bucket fails CLOSED — every RPC in it dead,
  -- with no client-side error anybody can read. The list was harvested from
  -- production's own source in §0, so a bucket this file's author never knew
  -- about is still covered.
  begin
    perform set_config('request.jwt.claim.sub', v_probe::text, true);
    for v_b in select bucket from _hr_gate_buckets_before order by bucket loop
      -- One call per bucket, each its own counter row, so none can exhaust
      -- another. `false` here can only mean "unknown bucket".
      if not public.hr_rpc_gate(v_b) then
        v_lost := coalesce(v_lost || ', ', '') || v_b;
      end if;
      v_probed := v_probed + 1;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR997', message = 'drift probe rollback';
  exception when sqlstate 'HR997' then
    perform set_config('request.jwt.claim.sub', '', true);
  end;
  if v_probed = 0 then
    raise exception 'SELF-CHECK INVALID: the drift probe called the gate 0 times';
  end if;
  if v_lost is not null then
    raise exception 'SELF-CHECK FAILED: the replacement dropped bucket(s) that the live gate admitted: % — every RPC in them is now dead', v_lost;
  end if;

  -- (b) BEHAVIOURAL — fail closed on an unknown bucket, unchanged.
  v_unknown := public.hr_rpc_gate('not_a_bucket');
  if v_unknown then
    raise exception 'hr_rpc_gate admitted an unknown bucket — it must fail closed';
  end if;

  -- (c) BEHAVIOURAL — THE FINDING. 30 anonymous calls against a limit of 20.
  -- No JWT claim is set, so auth.uid() is NULL and this is exactly the caller
  -- shape that returned `true` 30/30 times in production. `request.headers` is
  -- not set on this connection either, so this exercises the UNKEYED fallback
  -- — the weakest of the two anon paths. If even that refuses, the keyed path
  -- (which is stricter) refuses too.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    v_first_ok := public.hr_rpc_gate('beta_invite_check');
    for i in 1..660 loop
      if not public.hr_rpc_gate('beta_invite_check') then
        v_anon_refused := v_anon_refused + 1;
      end if;
    end loop;

    -- (d) CONTROL — the authenticated path still behaves as it did, and the
    -- probe can see BOTH outcomes. Without this, (c) would pass identically on
    -- a gate that refused everything.
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_u, c_inst, 'authenticated', 'authenticated', 'anongate@probe.invalid');
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    for i in 1..30 loop
      if not public.hr_rpc_gate('beta_invite_check') then
        v_auth_refused := v_auth_refused + 1;
      end if;
    end loop;

    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR999', message = 'anon gate fixture rollback';
  exception when sqlstate 'HR999' then
    perform set_config('request.jwt.claim.sub', '', true);
  end;

  if not v_first_ok then
    raise exception 'SELF-CHECK INVALID: the FIRST anonymous call was refused — the gate is closed, not rate-limited';
  end if;
  if v_anon_refused = 0 then
    raise exception 'SELF-CHECK FAILED: 661 anonymous calls produced 0 refusals — anon is still unrated (the `if v_uid is null then return true` path survived)';
  end if;
  -- The control must have fired too, or the harness cannot see failure.
  if v_auth_refused = 0 then
    raise exception 'SELF-CHECK INVALID: the authenticated control produced 0 refusals against a limit of % — the probe cannot demonstrate failure, so its pass means nothing', c_limit;
  end if;
  if v_auth_refused <> 30 - c_limit then
    raise exception 'SELF-CHECK FAILED: the authenticated path refused % of 30 against a limit of % — the existing behaviour changed', v_auth_refused, c_limit;
  end if;

  raise notice 'ANON RATE GATE OK — % of 661 anonymous calls refused (unkeyed fallback), authenticated control refused % of 30, % buckets verified against the pre-apply body. A11''s server half is unblocked.',
    v_anon_refused, v_auth_refused, v_probed;
end $$;

drop table if exists _hr_gate_buckets_before;
