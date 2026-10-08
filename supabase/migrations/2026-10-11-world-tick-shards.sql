-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-world-tick-shards.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. Applies AFTER
-- 2026-10-11-world-tick-due-roster.sql (§0 pins its roster).
-- EDGE HALF: tick.js derives its lease holder from the body's `shard`
-- (TICK_HOLDER_SQL). The edge half is backward-compatible and this file is
-- inert until an operator raises `shards` above 1: at shards = 1 shard 0's
-- holder is the single-POST driver's, byte for byte. RAISE `shards` ONLY
-- AFTER the edge carrying TICK_HOLDER_SQL is deployed; an older edge settles
-- every shard under shard 0's name and the fence refuses shards 1..N-1
-- `no_lease` (loud, pays nothing).
--
-- WORLD-TICK SCALE, STAGE S2 — SHARDED FIRES.
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "Scale" (S2).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   One fire is ONE pg_net POST and so ONE edge invocation, whose wall time is
--   serial in the characters it settles (25-88 ms hydration + ~76 ms settle
--   each) against a 9 s pg_net timeout and a 30 s lease. After S1 a fire
--   carries the due set (owned / 9 at steady state); past ~60 due per fire
--   one invocation cannot finish inside the timeout. N shards = N bodies =
--   N concurrent edge invocations per fire, each 1/N of the due set.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_config.shards int NOT NULL DEFAULT 1, CHECK 1..16. THE DIAL.
-- §2 hr_tick_shard_cursor (shard pk 0..15, cursor_at, cursor_user,
--    cursor_slot, updated_at): the keyset cursor PER SHARD, which used to be
--    three columns on the config row. RLS enabled AND forced, no policy, no
--    privilege for any role. The config row's three cursor columns are
--    retired (cleared every fire; nothing reads them).
-- §3 hr_tick_shard_of(uuid, int) -> 0..shards-1, IMMUTABLE: md5 bits 29-56 mod
--    shards. hr_shard_of(uuid) restated (was `select 0`) to read the dial.
--    The roster's existing `hr_shard_of(o.user_id) = p_shard` predicate is
--    therefore the partition; the roster body is NOT restated.
-- §4 hr_tick_cron_run restated from LIVE (md5 fb4bf2ff, 2026-10-06
--    channel-arm) with these deltas only:
--      · one roster call, cursor, body, MAC and POST per shard, ALL under the
--        one advisory lock, one bucket, one note per fire;
--      · holder(k) = shard 0: `left('cron:'||db, 64)` (unchanged);
--        shard k>0: `left('cron:'||db, 58) || ':s' || k`;
--      · body gains `shard`, loses the roster rows' `state` (NULL since S1);
--      · every MAC is derived before any POST (no_hmac / no_secret post
--        nothing for any shard, as before);
--      · the note's detail gains shards/rostered_by_shard/holders ONLY when
--        shards > 1, so a one-shard fire logs the single-POST driver's keys.
-- §5 grants (revoke first): the new function and table are reachable by no
--    role; hr_shard_of and hr_tick_cron_run keep their owner-only ACLs.
-- §6 self-check, executed.
--
-- ── CONCURRENCY: NO CROSS-SHARD DOUBLE SETTLE ───────────────────────────────
--   (a) Within a fire the rosters are DISJOINT: hr_shard_of is a function of
--       user_id and the dial, read once per statement; each roster filters on
--       its own k.
--   (b) Across a change of the dial, a character can move shard. It is then
--       still leased (30 s) to its OLD shard's holder, and the roster's lease
--       predicate (`lease_until < now() or lease_holder = v_holder`) keeps the
--       NEW shard from claiming it until that lease ends. The fence checks
--       `lease_holder = p_holder` under the player lock. So one character is
--       never settleable by two holders at once; lease semantics are unchanged.
--   (c) Underneath both, unchanged: the watermark CAS, hr_apply's version CAS
--       and the window-derived intent key each refuse a second payment.
--   The shards share one advisory lock (one fire at a time) and one bucket.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   NOTHING HERE MOVES VALUE. The roster and the fence are unchanged; this
--   file decides how many POSTs carry the due set and under which holder
--   names. The body's new `shard` key is MAC-bound like every other byte; an
--   edge holding the tick secret and naming another shard gets only that
--   shard's leases, i.e. exactly what that shard's own fire gets (residual
--   R-T1, replay inside the bucket, is unchanged). No client surface.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Postgres per fire: one roster statement per shard (S1 made each ~1 ms per
--   row with no hydration) + one sha256 + one HMAC + one queue insert per
--   shard. Edge per invocation: due / shards characters.
--   pg_net delivers the queue concurrently (its worker batch is 200).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Operational: `update hr_tick_config set shards = 1` (next fire is one POST
--   under the old holder; leases held by shards 1..N-1 lapse in 30 s and
--   their characters are served by shard 0 after that).
--   Full undo: re-apply the hr_tick_cron_run statement of
--   2026-10-06-world-tick-channel-arm.sql §6 and the hr_shard_of statement of
--   2026-09-20-world-tick-roster.sql §2; drop hr_tick_shard_of and
--   hr_tick_shard_cursor; drop the shards column.
--
-- ── KNOWN LIMITATIONS ───────────────────────────────────────────────────────
--   * Every shard posts in the same fire, so Postgres work is still serial in
--     the one cron transaction (it is small after S1; measured per row in the
--     design note).
--   * The intent key keeps the constant shard term 0 (tick-gather.js
--     tickIntentId via the session's pinned shard): the key must be a
--     function of the window, never of a dial that can move.
--   * A character whose shard changes waits at most one lease (30 s).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare
  v_cron   text;
  v_shard  text;
  v_roster text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_cron from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_cron_run()');
  select md5(replace(p.prosrc, chr(13), '')) into v_shard from pg_proc p
   where p.oid = to_regprocedure('public.hr_shard_of(uuid)');
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)');
  if v_cron is null or v_cron not in ('fb4bf2ff57f0f788eb3a7d3cf473387b', '02be9d7b7e9a6c8f45ef37cea7f03e80') then
    raise exception 'PRECONDITION: hr_tick_cron_run prosrc md5 is %, expected the live fb4bf2ff (2026-10-06 channel-arm) '
                    'or this file''s 02be9d7b7e9a6c8f45ef37cea7f03e80. Re-cut this file against the live body.', v_cron;
  end if;
  if v_shard is null or v_shard not in ('b3f2b7312868d837287ea4e43e5152df', '16ae3a15825e8f9c320abc73e0c2a21f') then
    raise exception 'PRECONDITION: hr_shard_of prosrc md5 is %, expected the live b3f2b731 (select 0) or this file''s.', v_shard;
  end if;
  -- The roster's shard predicate is the partition this file relies on; any
  -- roster body that still filters on hr_shard_of(o.user_id) = p_shard will do.
  if v_roster is null
     or position('public.hr_shard_of(o.user_id) = coalesce(p_shard, 0)' in
                 (select p.prosrc from pg_proc p where p.oid = to_regprocedure(
                   'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_tick_roster no longer partitions on hr_shard_of(o.user_id) = p_shard (md5 %).', v_roster;
  end if;
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'PRECONDITION: hr_tick_config is absent.';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regprocedure('public.hr_tick_body_sha256(text)') is null
     or to_regprocedure('public.hr_tick_auth_header(bigint,text)') is null then
    raise exception 'PRECONDITION: hr_assert_grant_hygiene, hr_tick_body_sha256 or hr_tick_auth_header is absent.';
  end if;
end $$;

-- ── §1 THE DIAL ─────────────────────────────────────────────────────────────
alter table public.hr_tick_config add column if not exists shards int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_shards_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_shards_ck check (shards between 1 and 16);
  end if;
end $$;
comment on column public.hr_tick_config.shards is
  '2026-10-11 (world-tick scale S2). How many POSTs (edge invocations) one fire fans out to; '
  'characters are partitioned by hr_shard_of (md5 of user_id mod shards). 1..16. Raise above 1 '
  'only after the edge carrying TICK_HOLDER_SQL is deployed.';
comment on column public.hr_tick_config.cursor_at is
  'RETIRED 2026-10-11 (world-tick scale S2): the keyset cursor is per shard in hr_tick_shard_cursor. Cleared every fire.';

-- ── §2 THE PER-SHARD CURSOR ─────────────────────────────────────────────────
create table if not exists public.hr_tick_shard_cursor (
  shard       int         primary key,
  cursor_at   timestamptz,
  cursor_user uuid,
  cursor_slot int,
  updated_at  timestamptz not null default now(),
  constraint hr_tick_shard_cursor_shard_ck check (shard between 0 and 15)
);
alter table public.hr_tick_shard_cursor enable row level security;
alter table public.hr_tick_shard_cursor force row level security;
comment on table public.hr_tick_shard_cursor is
  '2026-10-11 (world-tick scale S2). The roster keyset cursor, one row per shard: where the '
  'next fire resumes when a shard''s due set exceeds batch_limit. Written only by '
  'hr_tick_cron_run (SECURITY DEFINER). Operational: losing it costs one pass from the start. '
  'RLS forced, no policy, no privilege for any role.';

-- ── §3 THE PARTITION ────────────────────────────────────────────────────────
create or replace function public.hr_tick_shard_of(p_user uuid, p_shards int)
 returns int
 language sql
 immutable strict
 set search_path to 'pg_catalog'
as $$
  -- Bits 29-56 of md5(user_id::text): the 28 bits AFTER the ones
  -- hr_tick_cohort_bucket reads, so the fan-out partition is independent of
  -- the rollout cohort (a 10 % cohort is not 10 % of one shard). md5 because
  -- it is stable across Postgres versions (hashtext is not); per USER so a
  -- player's slots ride one shard. Clamped to the 1..16 the config CHECK allows.
  select (('x' || substr(md5(p_user::text), 8, 7))::bit(28)::int % least(greatest(p_shards, 1), 16))
$$;

create or replace function public.hr_shard_of(p_user uuid)
 returns int
 language sql
 stable parallel safe
 set search_path to 'public'
as $$
  -- THE FAN-OUT PARTITION (2026-10-11, world-tick scale S2). Was `select 0`
  -- (one shard for the beta, 2026-09-20-world-tick-roster.sql §2). Now the
  -- stable hash of the user mod hr_tick_config.shards, read here so the roster
  -- (its one caller) is unchanged. STABLE, no longer IMMUTABLE: it reads the
  -- config row. Nothing indexes it (asserted in §6 k1).
  select public.hr_tick_shard_of(p_user,
           coalesce((select c.shards from public.hr_tick_config c where c.id), 1))
$$;

-- ── §4 hr_tick_cron_run (S2) ────────────────────────────────────────────────
create or replace function public.hr_tick_cron_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  -- THE FAN-OUT (2026-10-11, world-tick scale S2). One POST per SHARD per
  -- fire, each to its own edge invocation, each under its own lease holder.
  -- Shard 0's holder is byte-identical to the single-POST driver's, so at
  -- shards = 1 every byte this function stamps, posts and logs is unchanged
  -- except the roster rows' dead `state` key (S1 made it NULL) and the
  -- cursor's home (hr_tick_shard_cursor).
  v_shards   int;
  k          int;
  v_holders  text[]  := '{}';
  v_bodies   text[]  := '{}';
  v_counts   int[]   := '{}';
  v_auths    text[]  := '{}';
  v_holder   text;
  v_batch    jsonb;
  v_nk       int;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_cur      public.hr_tick_shard_cursor%rowtype;
  v_wrapped  boolean := true;
  v_gateway  text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := true;
  v_eff      int := 0;
  -- THE ADMISSION COUNTER (2026-10-06, ruling 1: shadow-chain admission ends
  -- LOUDLY). Owned, on-channel, unpartied characters the roster's admission
  -- predicate dropped, by reason. NULL when nobody was dropped, so a healthy
  -- fire's log row does not grow.
  v_adm      jsonb;
  v_out      text;
  v_ms       int;
  v_posted   int := 0;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue. ONE
  --        lock for every shard: the shards are one fire.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    perform public.hr_tick_cron_note('disabled', 0);
    return jsonb_build_object('ok', true, 'outcome', 'disabled');
  end if;
  if v_cfg.edge_url is null or v_cfg.edge_url = '' then
    perform public.hr_tick_cron_note('no_edge_url', 0);
    return jsonb_build_object('ok', false, 'outcome', 'no_edge_url');
  end if;
  -- The CHECK holds shards to 1..16; a NULL (impossible: NOT NULL) reads as 1.
  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
  --         fire, over the whole owned cohort (every shard).
  select case when count(*) = 0 then null
              else jsonb_object_agg(x.why, x.n) end
    into v_adm
    from (select ad.why, count(*)::int as n
            from public.hr_tick_ownership o
            join public.player_state ps
              on ps.user_id = o.user_id and ps.slot = o.slot
           cross join lateral (
             select coalesce(o.channel = any (v_cfg.armed_channels), false) as armed) a
           cross join lateral (
             select public.hr_tick_admit(a.armed, ps.accrued_to,
                      case when not a.armed
                           then greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))
                           else ps.accrued_to end) as why) ad
           where o.owned
             and o.channel = ps.active_kind
             and ps.active_kind = any (v_cfg.channels)
             and not public.hr_partied(o.user_id, o.slot)
             and ad.why <> 'admit'
           group by ad.why) x;

  -- ── (3) THE BATCHES, ONE PER SHARD. `hr_shard_of` (a stable hash of user_id
  --        mod shards) partitions the owned cohort, so the shards' rosters are
  --        DISJOINT by construction; the per-shard holder makes a character
  --        leased by one shard unclaimable by another until that lease ends
  --        (the roster's lease predicate), which is what keeps a change of
  --        `shards` from ever handing one character to two invocations.
  --        `r.accrued_to` is the EFFECTIVE watermark (Security M-1).
  for k in 0 .. v_shards - 1 loop
    -- THE HOLDER. Shard 0: the single-POST driver's expression, unchanged.
    -- Shard k > 0: the same prefix cut to 58 so ':s<k>' always fits in 64 and
    -- can never be truncated into shard 0's name. tick.js TICK_HOLDER_SQL is
    -- the same expression; tests/world-tick-scale.mjs H1 drives both.
    v_holder := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
    select * into v_cur from public.hr_tick_shard_cursor where shard = k;
    if not found then
      v_cur.cursor_at := null; v_cur.cursor_user := null; v_cur.cursor_slot := null;
    end if;
    select jsonb_agg(jsonb_build_object(
             'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
             'active_kind', r.active_kind, 'active_id', r.active_id,
             'active_since', r.active_since, 'accrued_to', r.accrued_to,
             'shadow_accrued_to', r.shadow_accrued_to,
             'version', r.version, 'seed', r.seed)
             order by r.accrued_to, r.user_id, r.slot),
           count(*),
           max(r.accrued_to)
      into v_batch, v_nk, v_last_a
      from public.hr_tick_roster(v_cfg.channels, k, v_cfg.batch_limit, v_holder,
                                 v_cfg.lease_ms, v_cur.cursor_at, v_cur.cursor_user,
                                 v_cur.cursor_slot) r;
    v_nk := coalesce(v_nk, 0);

    if v_nk < v_cfg.batch_limit then
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, null, null, null, now())
      on conflict (shard) do update set cursor_at = null, cursor_user = null,
             cursor_slot = null, updated_at = now();
    else
      v_wrapped := false;
      select (e->>'user_id')::uuid, (e->>'slot')::int
        into v_last_u, v_last_s
        from jsonb_array_elements(v_batch) e
       order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
       limit 1;
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, v_last_a, v_last_u, v_last_s, now())
      on conflict (shard) do update set cursor_at = excluded.cursor_at, cursor_user = excluded.cursor_user,
             cursor_slot = excluded.cursor_slot, updated_at = now();
    end if;

    if v_nk > 0 then
      v_n := v_n + v_nk;
      v_eff := greatest(v_eff,
        v_cfg.cadence_seconds * greatest(1, ceil(v_nk::numeric / greatest(1, v_cfg.batch_limit))::int));
      v_holders := v_holders || v_holder;
      v_counts  := v_counts || v_nk;
      -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
      --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
      --         those bytes verbatim, so hashing this exact text and posting
      --         `v_body_txt::jsonb` hashes what leaves. `shard` is the one new
      --         key: the edge derives its holder from it (a SELECTOR, bound by
      --         the MAC like every byte here; the fence still refuses any
      --         character whose lease is not that holder's).
      v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   'shard', k,
                                   -- per channel since 2026-10-06; the
                                   -- edge IGNORES this key (tick.js reads
                                   -- the mode off the fence), it is here
                                   -- for the operator reading the queue.
                                   'armed', to_jsonb(v_cfg.armed_channels),
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   'roster', v_batch)::text);
    end if;
  end loop;

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now() where id;

  if v_n = 0 then
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0, null,
     case when v_adm is null then null else jsonb_build_object('admission', v_adm) end);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  -- ── (4) THE GATEWAY KEY. STILL A VARIABLE, AND THAT IS CORRECT: it is the
  --        project ANON key, public by design (src/net/supabase-bootstrap.js),
  --        read from Vault only so a project move is a Vault write rather than
  --        a migration. `supabase/config.toml` pins `verify_jwt = true` on
  --        hr-accrue and it STAYS ON (tests/edge-jwt-gate.mjs --strict), so the
  --        Supabase gateway refuses the request before the function runs unless
  --        `Authorization` carries a JWT it accepts. IT IS NOT THE TICK'S
  --        AUTHORISATION and must never be mistaken for it.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew. One bucket per fire.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;

  -- ── (4b) THE DERIVATION, PER BODY. pgcrypto absent is `no_hmac` and NOTHING
  --         IS POSTED for any shard: there is no static fallback, by
  --         construction — this function has no code path that can put a
  --         long-lived secret on the wire. Every MAC is derived before any POST,
  --         so a fire either posts every shard's body or none.
  for k in 1 .. cardinality(v_bodies) loop
    v_body_sha := public.hr_tick_body_sha256(v_bodies[k]);
    if v_body_sha is null then
      perform public.hr_tick_cron_note('no_hmac',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
      return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
    end if;
    v_auth := public.hr_tick_auth_header(v_bucket, v_body_sha);
    v_have_tok := v_have_tok and v_auth is not null;
    v_auths := v_auths || v_auth;
  end loop;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of 2026-09-22-world-tick-derived-token.sql carries both names
     --   for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POSTS. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay. pg_net sends the queued requests CONCURRENTLY after this
  --        transaction commits: N shards are N parallel edge invocations.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  v_out := 'posted';
  for k in 1 .. cardinality(v_bodies) loop
    begin
      execute 'select net.http_post($1, $2, $3, $4, $5)'
        using v_cfg.edge_url,
              v_bodies[k]::jsonb,
              '{}'::jsonb,
              jsonb_build_object('Content-Type', 'application/json',
                                 -- the GATEWAY's gate...
                                 'Authorization', 'Bearer ' || v_gateway,
                                 -- ...and the tick's own, DERIVED PER BODY. The
                                 -- Vault secret is not here and never was: this
                                 -- value is a mac over (bucket, body hash).
                                 'X-HR-Tick-Auth', v_auths[k]),
              greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
      v_posted := v_posted + 1;
    exception when others then
      -- Nothing derived from a secret reaches the log even in an error path.
      -- The shards already queued stay queued (their sub-transactions
      -- committed); the fire is logged `error` with how many went out.
      perform public.hr_tick_cron_note('error',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('sqlstate', sqlstate, 'posted_shards', v_posted));
      return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
    end;
  end loop;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  --   `shards` / `rostered_by_shard` appear only when the fire fanned out, so a
  --   one-shard fire's log row is the single-POST driver's, key for key.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('armed', to_jsonb(v_cfg.armed_channels), 'holder', v_holders[1],
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_wrapped)
    || case when v_shards > 1
            then jsonb_build_object('shards', v_shards, 'rostered_by_shard', to_jsonb(v_counts),
                                    'holders', to_jsonb(v_holders))
            else '{}'::jsonb end
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff)
    || case when v_shards > 1 then jsonb_build_object('shards', v_shards, 'posts', v_posted)
            else '{}'::jsonb end;
end $$;

-- ── §5 GRANTS — revoke from PUBLIC first; NO role is granted anything new ────
revoke all on table public.hr_tick_shard_cursor from public;
revoke all on table public.hr_tick_shard_cursor from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_shard_of(uuid, int) from public;
revoke execute on function public.hr_tick_shard_of(uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_shard_of(uuid) from public;
revoke execute on function public.hr_shard_of(uuid) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
--   k0  the installed bodies are this file's (md5)
--   k1  nothing indexes or CHECKs on hr_shard_of (it is STABLE now)
--   s1  hr_tick_shard_of is total and in range for 256 users at every dial
--       1..16; at the dial 1 every user is shard 0 (today's single shard)
--   s2  ★ at shards = 4, forty due fixtures: the four rosters are pairwise
--       DISJOINT, their union is all forty, every row's `shard` is its k,
--       and every lease is that shard's holder
--   s3  ★ NO CROSS-SHARD CLAIM: a fixture leased to shard 3's holder, with the
--       dial moved to 2, is not served by its new shard until the lease ends
--   kg  no role holds EXECUTE on hr_tick_shard_of / hr_shard_of /
--       hr_tick_cron_run or any privilege on hr_tick_shard_cursor; RLS
--       enabled AND forced, no policy; the CHECK refuses 0 and 17; hygiene STRICT
--   kr  the config is restored and read back
-- The cron driver itself is NOT fired here: on production it would POST.
-- tests/world-tick-scale.mjs fires it against a pg_net stub (H1-H4).
do $$
declare
  v_cfg   public.hr_tick_config%rowtype;
  v_gact  text;
  v_fix   uuid[] := '{}';
  v_u     uuid;
  i       int;
  k       int;
  v_hold  text;
  v_seen  uuid[] := '{}';
  v_rows  uuid[];
  v_bad   int;
  v_n     int;
  v_ok    boolean;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)
         <> '02be9d7b7e9a6c8f45ef37cea7f03e80'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_shard_of(uuid)'::regprocedure)
         <> '16ae3a15825e8f9c320abc73e0c2a21f'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_shard_of(uuid,int)'::regprocedure)
         <> 'f3d74ad20b0506070db84fbe617395a5' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    -- ── k1
    if exists (select 1 from pg_index x where position('hr_shard_of' in coalesce(pg_get_expr(x.indexprs, x.indrelid), '')
                                                  || coalesce(pg_get_expr(x.indpred, x.indrelid), '')) > 0)
       or exists (select 1 from pg_constraint c where c.contype = 'c'
                   and position('hr_shard_of' in pg_get_constraintdef(c.oid)) > 0) then
      raise exception 'k1: an index or CHECK uses hr_shard_of, which is STABLE now';
    end if;

    -- ── s1
    for k in 1 .. 16 loop
      select count(*) filter (where s < 0 or s >= k or s is null) into v_bad
        from (select public.hr_tick_shard_of(md5(g::text)::uuid, k) as s from generate_series(1, 256) g) t;
      if v_bad <> 0 then raise exception 's1: hr_tick_shard_of left 0..% for % user(s)', k - 1, v_bad; end if;
    end loop;
    if exists (select 1 from generate_series(1, 256) g where public.hr_tick_shard_of(md5(g::text)::uuid, 1) <> 0) then
      raise exception 's1b: at one shard some user is not shard 0';
    end if;

    -- ── fixture: forty due armed gatherers
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'],
           flush_seconds = 90, shards = 4
     where id;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    if v_gact is null then raise exception 'k-fixture: hr_activities lacks a gather row'; end if;
    for i in 1 .. 40 loop
      v_fix := v_fix || ('00000000-0000-4000-8000-0000000e73' || lpad(to_hex(i), 2, '0'))::uuid;
    end loop;
    insert into auth.users (id) select unnest(v_fix) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    select u, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather', v_gact, now() - interval '3 hours'
      from unnest(v_fix) u;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    select u, 0, 'gather', true from unnest(v_fix) u;

    -- ── s2
    for k in 0 .. 3 loop
      v_hold := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
      select array_agg(r.user_id) filter (where r.user_id = any (v_fix)),
             count(*) filter (where r.user_id = any (v_fix) and r.shard <> k)
        into v_rows, v_bad
        from public.hr_tick_roster(array['gather']::text[], k, 500, v_hold, 30000,
                                   null::timestamptz, null::uuid, null::int) r;
      if v_bad <> 0 or coalesce(v_rows, '{}') && v_seen then
        raise exception 's2: shard % served a row of another shard (%), or one already served', k, v_bad;
      end if;
      if exists (select 1 from unnest(coalesce(v_rows, '{}')) u
                  where public.hr_shard_of(u) <> k
                     or (select o.lease_holder from public.hr_tick_ownership o
                          where o.user_id = u and o.slot = 0 and o.channel = 'gather') is distinct from v_hold) then
        raise exception 's2b: shard % served a user it does not own, or leased it under another holder', k;
      end if;
      v_seen := v_seen || coalesce(v_rows, '{}');
    end loop;
    if (select count(distinct u) from unnest(v_seen) u) <> 40 then
      raise exception 's2c: the four shards served % of the 40 due fixtures', (select count(distinct u) from unnest(v_seen) u);
    end if;

    -- ── s3 a lease held by shard 3 is not claimable by the user's shard under a dial of 2
    select u into v_u from unnest(v_fix) u where public.hr_tick_shard_of(u, 4) = 3 limit 1;
    if v_u is null then raise exception 's3-fixture: no fixture hashes to shard 3 of 4'; end if;
    update public.hr_tick_ownership
       set lease_holder = left('cron:' || coalesce(current_database(), 'db'), 58) || ':s3',
           lease_until = now() + interval '30 seconds'
     where user_id = v_u and channel = 'gather';
    update public.hr_tick_config set shards = 2 where id;
    k := public.hr_shard_of(v_u);
    v_hold := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                   else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
    select count(*) into v_n
      from public.hr_tick_roster(array['gather']::text[], k, 500, v_hold, 30000,
                                 null::timestamptz, null::uuid, null::int) r
     where r.user_id = v_u;
    if v_n <> 0 then
      raise exception 's3: a character leased to shard 3 was served to shard % after the dial moved', k;
    end if;
    update public.hr_tick_ownership set lease_until = now() - interval '1 second' where user_id = v_u;
    select count(*) into v_n
      from public.hr_tick_roster(array['gather']::text[], k, 500, v_hold, 30000,
                                 null::timestamptz, null::uuid, null::int) r
     where r.user_id = v_u;
    if v_n <> 1 then
      raise exception 's3b: once the old lease ended, the new shard % did not serve the character', k;
    end if;

    -- ── kg
    if has_function_privilege('anon', 'public.hr_tick_shard_of(uuid,int)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_tick_shard_of(uuid,int)', 'execute')
       or has_function_privilege('service_role', 'public.hr_tick_shard_of(uuid,int)', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_tick_shard_of(uuid,int)', 'execute')
       or has_function_privilege('hr_tick', 'public.hr_tick_shard_of(uuid,int)', 'execute')
       or has_function_privilege('anon', 'public.hr_shard_of(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_shard_of(uuid)', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_shard_of(uuid)', 'execute')
       or has_function_privilege('hr_tick', 'public.hr_shard_of(uuid)', 'execute')
       or has_function_privilege('anon', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('service_role', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('hr_tick', 'public.hr_tick_cron_run()', 'execute') then
      raise exception 'kg: a request or engine role holds EXECUTE on the partition or the driver';
    end if;
    if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                where has_table_privilege(r.role, 'public.hr_tick_shard_cursor', 'select')
                   or has_table_privilege(r.role, 'public.hr_tick_shard_cursor', 'insert')
                   or has_table_privilege(r.role, 'public.hr_tick_shard_cursor', 'update')
                   or has_table_privilege(r.role, 'public.hr_tick_shard_cursor', 'delete')) then
      raise exception 'kg: a role holds a privilege on hr_tick_shard_cursor';
    end if;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
             where c.oid = 'public.hr_tick_shard_cursor'::regclass)
       or exists (select 1 from pg_policy where polrelid = 'public.hr_tick_shard_cursor'::regclass) then
      raise exception 'kg: hr_tick_shard_cursor must have RLS enabled AND forced, and no policy';
    end if;
    begin
      update public.hr_tick_config set shards = 17 where id;
      raise exception 'kg: shards = 17 was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set shards = 0 where id;
      raise exception 'kg: shards = 0 was accepted';
    exception when check_violation then null;
    end;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr
    update public.hr_tick_config
       set enabled = v_cfg.enabled, channels = v_cfg.channels, armed_channels = v_cfg.armed_channels,
           flush_seconds = v_cfg.flush_seconds, shards = v_cfg.shards
     where id;
    select (enabled, channels, armed_channels, flush_seconds, shards)
           is not distinct from (v_cfg.enabled, v_cfg.channels, v_cfg.armed_channels, v_cfg.flush_seconds, v_cfg.shards)
      into v_ok from public.hr_tick_config where id;
    if not v_ok then raise exception 'kr: the config was not restored'; end if;

    raise exception 'HR1011S_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1011S_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-shards: EXECUTED — the partition is total and in range at every dial; four shard '
               'rosters are disjoint and cover the due set under their own holders; a lease held by one shard '
               'is not claimable by another after the dial moves; reachable by no role; hygiene strict — all green';
end $$;
