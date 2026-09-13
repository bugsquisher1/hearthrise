-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-13-world-finds-projection.sql
-- THE FINDER'S NAME IS MINTED IN EXACTLY ONE PLACE, AND `presence_quiet`
-- IS HONOURED THERE.
--
-- Named pre-launch P2 (Security, 2026-09-13; PRIORITY_BOARD §10, and the header
-- of 2026-09-13-town-presence.sql which filed it as an OPEN door it could only
-- defend in depth).
--
-- ── THE DEFECT, AS SHIPPED ──────────────────────────────────────────────────
-- 2026-09-08-hearthfind.sql grants `select` on ALL of public.world_finds —
-- including `user_id` and `slot` — to anon AND authenticated, and
-- public.profiles / public.display_names are public-read. So the join that
-- de-anonymises the board is one request away, and it is not hypothetical: the
-- SHIPPED client already performs it.
--
--     src/features/hearthfind.js:964   select=id,user_id,item_id,…
--     src/features/hearthfind.js:950   namesFor() → display_names?user_id=in.(…)
--
-- 2026-09-13-town-presence.sql then added `player_state.presence_quiet` and
-- filtered quiet characters out of the crier feed — but its own header says that
-- filter "buys nothing today", because a quiet player's find is still on the
-- board WITH their user_id, and `display_names` still names them. The opt-out
-- was a promise the schema could not keep.
--
-- ── THE FIX, AND WHY IT IS SHAPED THIS WAY ──────────────────────────────────
-- The name is the thing that must not be derivable, so the name becomes a
-- SERVER-MINTED field and the key it was derived from stops crossing the wire:
--
--   1. hr_world_finds_of — a STABLE SECURITY DEFINER read that returns the board
--      rows with the finder's DISPLAY NAME already joined, from the SAME name
--      authority the town projection uses (`coalesce(pr.display_name,
--      'Adventurer')` off public.profiles — 2026-08-11-chat-name-authority.sql
--      made that column non-PATCHable and claim_display_name() keeps it unique),
--      and NULL when the finder is `presence_quiet`. No user_id, no slot.
--   2. the identity columns are revoked from the client roles, so the join has
--      no left-hand side any more.
--
-- ⚠ QUIET NULLS THE NAME; IT DOES NOT DELETE THE ROW. Deliberate, and DIFFERENT
--   from hr_town_refresh's crier (which drops the row). The crier is a live
--   plaza — a missing line costs nothing. The board is a RECORD: it is where
--   "the 3rd ever found in Hearthrise" comes from, and dropping rows would
--   silently corrupt every ordinal after them, for everybody, as a side effect of
--   one player's privacy setting. Privacy must not be able to rewrite the
--   realm's history. A quiet find renders as "An adventurer", which is exactly
--   the copy src/features/hearthfind.js already uses for a name it cannot
--   resolve (chatLine: `playerName || 'An adventurer'`), and the smoke suite
--   already asserts that path (HF-3).
--
-- ── WHAT ELSE THIS CLOSES, MEASURED ─────────────────────────────────────────
-- The ordinal. src/features/hearthfind.js:27-43 files a KNOWN CONTRACT GAP: the
-- realm-wide ordinal had no server source, so the client derived it by counting
-- a window of the board itself. That read was
--     world_finds?select=…&order=id.asc&limit=500
-- — `id.asc` + `limit`, i.e. the OLDEST five hundred rows. Correct while the
-- board is small; silently frozen the day it is not (no new find is ever in the
-- window, so no chat line is ever emitted and no count ever moves again).
-- hr_world_finds_prune keeps 20 000 rows, so that day arrives. `nth` is
-- therefore computed SERVER-SIDE per row as a real ordinal over the whole table,
-- and the window is the NEWEST p_limit. Still a lower bound once the prune has
-- run (nothing can recover a deleted row) and still suppressed by the 30-second
-- broadcast clamp — so it stays honest-or-absent, as that header ruled — but it
-- is no longer a number that stops moving.
--
-- ── READERS OF world_finds, ENUMERATED BEFORE REVOKING ──────────────────────
-- grep over src/**, supabase/functions/**, supabase/migrations/**, tests/**:
--   · src/features/hearthfind.js:964  the board poll            → MOVED to this RPC
--   · src/features/hearthfind.js:950  namesFor/display_names    → DELETED (the
--                                      name now arrives already minted)
--   · supabase/migrations/2026-09-08-hearthfind.sql:787-790     hr_apply's
--     clamp read + insert — SECURITY DEFINER, runs as the owner, unaffected by a
--     client-role revoke
--   · supabase/migrations/2026-09-08-hearthfind.sql:874-887     hr_world_finds_prune
--     — owner-only, unaffected
--   · supabase/migrations/2026-09-13-town-presence.sql:646      hr_town_refresh's
--     crier join — owner-only (and cron-driven), unaffected
--   · supabase/functions/**  — NO reader. The engine never touches the board.
--   · Realtime — NOT a reader. world_finds has no publication membership
--     (2026-09-06-realtime-publication-trim.sql; hearthfind.js:900 says so and
--     polls instead), so no Postgres-Changes subscription can break.
-- There is no other reader. Nothing that loses a column here had one.
--
-- ⚠ WHY THE REVOKE IS "REVOKE TABLE, GRANT COLUMNS" AND NOT `revoke select
--   (user_id)`. PostgreSQL will not let a column-level REVOKE carve an exception
--   out of a TABLE-level grant: the table grant implies every column and the
--   column revoke finds no column-level grant to remove, so it succeeds with a
--   warning and changes nothing — a silent no-op that would have left this whole
--   file decorative. The only form that holds is to drop the table-wide SELECT
--   and re-grant the columns that may cross. §4(d) proves the result by
--   has_column_privilege, not by the statement having run.
--
-- ── ANON ────────────────────────────────────────────────────────────────────
-- The RPC is granted to `authenticated` ONLY. The board poll starts 4 s after
-- DOMContentLoaded, i.e. possibly behind the invite wall, but the line it
-- produces is injected into the GLOBAL CHAT DOCK, which does not exist for a
-- signed-out visitor — so the client half gates the poll on a session instead
-- (the same shape hr_town_of uses). anon keeps SELECT on the anonymous columns:
-- the board is the deliberately shareable surface, and with the identity columns
-- gone what is left is a find, its odds and its time, attributable to nobody.
--
-- ── ERROR TAXONOMY (hr_world_finds_of) ──────────────────────────────────────
--   {ok:false, error:'rate_limited'}     the 6/min bucket
--   {ok:false, error:'unauthenticated'}  no JWT subject
--   {ok:true, now, rows:[…], counts:{…}} otherwise; rows may be []
--
-- ── COST AT 100× PLAYERS ────────────────────────────────────────────────────
-- One call per client per 90 s (0.67/min; the bucket is 6/min so a reload storm
-- is capped). Each call: one index range over the new world_finds_item_idx for
-- the window, one correlated index-only count per returned row for `nth`, and
-- one grouped index-only count restricted to the window's distinct item_ids. All
-- three are bounded by hr_world_finds_prune's 20 000-row ceiling and, in
-- practice, by ~2 finds per realm-week. It writes NOTHING: no journal row per
-- poll (the game_events 1.6M-row mistake), no snapshot table. Net new storage:
-- one index (world_finds_item_idx) over a table capped at 20 000 rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive and idempotent: create-or-replace functions, create-index-if-not-
-- exists, one FULL RESTATEMENT of hr_rpc_gate (see 4a for why it is a
-- restatement and not the usual anchored patch), one baseline row. To undo,
-- re-grant `select on public.world_finds to anon, authenticated`, drop the two
-- new functions, and re-apply the previous last-toucher of hr_rpc_gate
-- (2026-09-13-town-presence.sql) to take the bucket back out; no data is altered
-- and no row is deleted anywhere in this file.
--
-- AFTER APPLY: hr_rpc_gate is live-hash-tracked (chain/floor/pin). Re-seed with
-- `node tests/live-hash-drift.mjs --live --write` - the Coordinator's step, not
-- this lane's.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — refuse to run against a shape this was not derived for
do $mig$
begin
  if to_regclass('public.world_finds') is null then
    raise exception 'world_finds is absent — apply 2026-09-08-hearthfind.sql first; this file '
                    'projects that board and revokes its identity columns';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is absent — it is the NAME AUTHORITY this projection mints '
                    'from (the same one hr_town_refresh''s crier uses)';
  end if;
  -- presence_quiet is the whole point: without it there is no quiet to honour.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state'
                    and column_name = 'presence_quiet') then
    raise exception 'player_state.presence_quiet is absent — apply '
                    '2026-09-13-town-presence.sql first; this file is the place its opt-out is '
                    'finally enforceable';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate is absent — the new read would be ungated';
  end if;
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'hr_note_rejection is absent — apply '
                    '2026-09-12-hr-rejections-journal.sql first; a gated wrapper without the seam '
                    'fails tests/rejections-journal.mjs P6 at chain end';
  end if;
end $mig$;

-- ── 1. THE ORDINAL INDEX ─────────────────────────────────────────────────────
-- (item_id, id) — the exact shape of both counts below, so `nth` and the per-item
-- total are index-only range scans rather than a seq scan of the board per
-- returned row. world_finds_at_idx (found_at desc) cannot serve them: the
-- ordinal is defined on `id`, which is the only monotone, tie-free order the
-- board has (two finds inside the same millisecond would otherwise swap places
-- between two readers' ordinals).
create index if not exists world_finds_item_idx on public.world_finds (item_id, id);

-- ── 2. hr_world_finds_of__ungated — THE ONLY WAY A FINDER'S NAME IS MINTED ───
-- STABLE, because it is a pure read: no writes, safe to inline, and the rate
-- gate (an UPSERT on hr_rate_counters) therefore cannot live here — Postgres
-- refuses a write inside a STABLE function. The gate lives in §3's VOLATILE
-- wrapper. This is the hr_town_of__ungated shape, for the same reason.
--
-- THE OUTPUT IS BUILT KEY BY KEY FROM LITERALS. No `select *`, no `to_jsonb(w)`,
-- no `row - 'user_id'` denylist: a column added to world_finds tomorrow cannot
-- appear on another player's screen by accident. §4(c) asserts the emitted key
-- set with jsonb_object_keys rather than trusting this sentence.
create or replace function public.hr_world_finds_of__ungated(p_limit int)
returns jsonb language sql stable security definer
set search_path = public, pg_catalog as $$
  with win as (
    -- THE NEWEST p_limit, not the oldest (see the header). Clamped here as well
    -- as in the wrapper so the inner is safe in its own right.
    select f.id, f.user_id, f.slot, f.item_id, f.source_kind, f.source_id,
           f.one_in, f.found_at
      from public.world_finds f
     order by f.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ), rows_js as (
    select coalesce(jsonb_agg(jsonb_build_object(
             -- `id` is the client's WATERMARK (it renders each row once, keyed
             -- hf-<id>) and carries no identity: it is the board's own sequence.
             'id', w.id,
             -- THE NAME, MINTED HERE AND NOWHERE ELSE. Same expression as
             -- hr_town_refresh's crier join, with the quiet rule moved INTO it:
             -- a quiet finder is nameless rather than absent, so the ordinals
             -- below stay true for everybody.
             'name', case
                       when coalesce(q.presence_quiet, false) then null
                       else coalesce(pr.display_name, 'Adventurer')
                     end,
             'item_id', w.item_id,
             'source_kind', w.source_kind,
             'source_id', w.source_id,
             'one_in', w.one_in,
             -- ABSOLUTE, with the server clock alongside it: the client renders
             -- the chat line's timestamp from this and never from its own clock.
             'found_at', w.found_at,
             -- THE REALM ORDINAL, server-computed. A lower bound after a prune
             -- (see the header); never a window artefact.
             'nth', (select count(*) from public.world_finds c
                      where c.item_id = w.item_id and c.id <= w.id)
           ) order by w.id asc), '[]'::jsonb) as js
      from win w
      left join public.profiles pr on pr.id = w.user_id
      -- The opt-out is per CHARACTER, and the board row names one, so both keys.
      left join public.player_state q on q.user_id = w.user_id and q.slot = w.slot
  ), counts_js as (
    -- "How many of this item exist" — the number src/features/hearthfind.js's
    -- ordinalFor() wants. Restricted to the window's items on purpose: an
    -- unrestricted group-by would scale with the whole board on every poll, and
    -- an item whose newest find has fallen out of the window has no honest
    -- ordinal to offer anyway (honest-or-absent).
    select coalesce(jsonb_object_agg(t.item_id, t.n), '{}'::jsonb) as js
      from (select c.item_id, count(*) as n
              from public.world_finds c
             where c.item_id in (select distinct w.item_id from win w)
             group by c.item_id) t
  )
  select jsonb_build_object(
    'ok', true,
    'now', now(),
    'rows', (select js from rows_js),
    'counts', (select js from counts_js))
$$;

-- ── 3. hr_world_finds_of — THE CLIENT VERB ───────────────────────────────────
-- Rate gate FIRST (so a refusal is never a free unlimited call), then the
-- refusals, then the read. ONE hr_note_rejection seam, wrapping a CASE so that
-- `unauthenticated` is recorded without the accepted path paying for a second
-- recorder call — the 2026-09-13-town-presence-journal.sql shape, which
-- tests/rejections-journal.mjs P6 requires of every jsonb gated wrapper at chain
-- end. CASE is lazily evaluated, so a refused call still costs no board read.
create or replace function public.hr_world_finds_of(p_limit int default 50)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_world_finds_of') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_note_rejection('hr_world_finds_of', 0,
    case
      when auth.uid() is null
        then jsonb_build_object('ok', false, 'error', 'unauthenticated')
      else public.hr_world_finds_of__ungated(p_limit)
    end);
end $w$;

-- §3 of the house rules: revoke BEFORE granting, and name service_role
-- explicitly (Supabase hands every new function EXECUTE to PUBLIC, and
-- service_role bypasses RLS).
revoke execute on function public.hr_world_finds_of__ungated(int) from public;
revoke execute on function public.hr_world_finds_of__ungated(int)
  from anon, authenticated, service_role, hr_engine;
revoke execute on function public.hr_world_finds_of(int) from public;
revoke execute on function public.hr_world_finds_of(int)
  from anon, authenticated, service_role;
grant  execute on function public.hr_world_finds_of(int) to authenticated;

-- ── 4a. hr_rpc_gate — ONE NEW BUCKET, BY FULL RESTATEMENT ───────────────
-- 6/min: the board poll is one call per 90 s (0.67/min). The headroom is for a
-- player reloading, plus the immediate re-read the attended reveal triggers
-- after a find. The call aggregates a table; 6/min is the cap on paying for it.
--
-- WHY THIS IS A RESTATEMENT AND NOT THE ANCHORED PATCH THE HOUSE USUALLY USES.
-- The first draft of this file did use the anchored exactly-once replace at the
-- `else return false;` / `end case;` terminator (the 2026-09-08-hero-slot-buy.sql
-- idiom, as 2026-09-13-town-presence.sql did the day before). It was REJECTED BY
-- A GUARD, not by taste: `node tests/patch-chain-guard.mjs` went red with
--
--   PATCH-3  public.hr_rpc_gate is not in the baseline and its chain is already
--            2 deep (2026-09-13-town-presence.sql, 2026-09-13-world-finds-
--            projection.sql). The rule is the same for a body the audit never
--            saw: restate it.
--
-- and that rule is right: a body that exists only as "the old text plus N
-- regexes" cannot be read or reviewed without replaying it, and each new anchor
-- depends on whatever the last patch happened to leave behind. The precedent for
-- restating it from a feature migration is 2026-08-30-bounty-kill-credit.sql,
-- which is the last file that did.
--
-- THE TEXT BELOW IS NOT HAND-WRITTEN. It is `pg_get_functiondef` of the body the
-- REAL ordered chain produces at chain end (tests/schema-replay.mjs over
-- tests/schema-apply-order.json), with the one new `when` already in it, and
-- tests/live-hash-drift.baseline.json records that this body's live md5 and its
-- replayed md5 AGREE as of 2026-09-13 - NORMALISED md5 93873f02..., norm_len
-- 2746; the raw md5 of pg_get_functiondef is 7955897e... (Security's review
-- flagged the earlier wording, which named the normalised hash without saying
-- so, and a hash quoted without its normalisation is a hash nobody can
-- reproduce) - so the chain's text IS production's text and this restatement is
-- not authored against a stale body.
--
-- ...AND THAT AGREEMENT IS NOT TRUSTED EITHER. A restatement's whole failure mode
-- is deleting something that was added after it was written - if another lane
-- applies a new bucket between this file being staged and being applied, the
-- literal below would silently drop it. So 4a(i) CENSUSES the buckets of the
-- LIVE body first and 4a(ii) refuses the apply if the restatement admits fewer,
-- naming the missing ones. Re-deriving this block is then a mechanical fix, and
-- the failure is loud instead of a verb that quietly answers rate_limited
-- forever (an unknown bucket fails CLOSED).
do $$
declare v_before text;
begin
  v_before := replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '');
  -- Every bucket literal in the CASE, before this file touches anything. The
  -- region between `case p_bucket` and the terminator contains bucket names and
  -- nothing else, so the literal sweep is exact.
  perform set_config('hearthrise.wf_buckets_before',
    coalesce((select string_agg(m[1], ',' order by m[1])
                from (select distinct m from regexp_matches(
                        substring(v_before from 'case p_bucket(.*?)else return false'),
                        '''([a-z_][a-z0-9_]*)''', 'g') as m) q), ''),
    false);
  if coalesce(current_setting('hearthrise.wf_buckets_before', true), '') = '' then
    raise exception 'hr_rpc_gate: the bucket census came back EMPTY - the live body is not the shape '
                    'this restatement was derived against, so it refuses to replace it blind';
  end if;
end $$;

create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer
set search_path = public, pg_catalog as $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list',
         'hr_goal_state'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         'bank_move',
         'hr_credit_kills', 'hr_credit_combat_xp',
         'client_state_put'
      then v_limit := 60;
    when 'hr_set_style'
      then v_limit := 30;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend',
         'hr_trait_buy', 'hr_claim_goal'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_buy_hero_slot' then v_limit := 12;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    else return false;
  end case;

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
end $function$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- 4a(ii) THE RESTATEMENT TOOK NOTHING AWAY. Measured against 4a(i)'s census of
-- the body this file replaced, not against a list written here - a hand-written
-- list would go stale the same way the restatement could.
do $$
declare v_after text; v_missing text;
begin
  v_after := replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '');
  select string_agg(b, ', ' order by b) into v_missing
    from unnest(string_to_array(current_setting('hearthrise.wf_buckets_before', true), ',')) b
   where position('''' || b || '''' in v_after) = 0;
  if v_missing is not null then
    raise exception 'hr_rpc_gate restatement DROPPED the % bucket(s). The body this file carries was '
                    'derived from the chain on 2026-09-13; something has added a bucket since. '
                    'Re-derive it (pg_get_functiondef at chain end) and re-stage - do NOT apply a '
                    'restatement that deletes a live bucket, because an unknown bucket fails CLOSED '
                    'and that verb would answer rate_limited forever.', v_missing;
  end if;
  if position('''hr_world_finds_of''' in v_after) = 0 then
    raise exception 'hr_rpc_gate does not admit hr_world_finds_of after the restatement';
  end if;
  raise notice 'hr_rpc_gate restated: % pre-existing bucket(s) preserved, hr_world_finds_of added at '
               '6/min',
    array_length(string_to_array(current_setting('hearthrise.wf_buckets_before', true), ','), 1);
end $$;

-- ── 4b. THE REVOKE — THE JOIN LOSES ITS LEFT-HAND SIDE ───────────────────────
-- See the header for why this is a table revoke plus a column grant rather than
-- `revoke select (user_id)`. `slot` goes with `user_id`: no reader asked for it,
-- and (user_id, slot) is the character key every other player table is keyed on.
--
-- IDEMPOTENT: revoking an already-revoked privilege and granting an already-held
-- one are both no-ops, so a second apply is byte-identical.
do $$
begin
  revoke select on public.world_finds from anon, authenticated;
  grant  select (id, item_id, source_kind, source_id, one_in, found_at)
    on public.world_finds to anon, authenticated;
end $$;

-- ── 5. hr_client_rpc_baseline — THE NEW VERB, DECLARED WITH ITS REASON ───────
-- hr_assert_grant_hygiene's D2 check fails on a function `authenticated` can
-- execute that the baseline does not list. Declaring it here is the APPROVAL, in
-- the same file as the grant.
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_world_finds_of' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_world_finds_of', 'p_limit integer', 'authenticated',
     'added 2026-09-13: the Hearthfind board, projected. Closes the named pre-launch P2 — '
     'world_finds granted SELECT on user_id to anon/authenticated and profiles/display_names are '
     'public-read, so any client named every finder INCLUDING characters who set presence_quiet, '
     'and the shipped src/features/hearthfind.js did exactly that. Returns up to 200 of the NEWEST '
     'board rows through a literal allowlist of eight keys — id, name, item_id, source_kind, '
     'source_id, one_in, found_at, nth — plus a per-item total. The NAME is minted server-side from '
     'profiles.display_name (the same authority hr_town_refresh''s crier uses) and is NULL for a '
     'presence_quiet finder, which is the one place quiet can be honoured now that user_id no '
     'longer crosses the wire. Never a user_id, never a slot, never gold/XP/inventory. Reads only; '
     'writes nothing and journals nothing per poll.');
end $$;

-- ── 6. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ─────────────────────────────
-- Properties proven by EXECUTING SQL, not by markers. The apply is atomic, so a
-- raise here reverts §1-§5. The row-writing probes live in a subtransaction
-- discarded by a sentinel raise (HR813), so this block is NET-ZERO.
do $chk$
declare
  v_n      int;
  v_txt    text;
  v_res    jsonb;
  v_keys   text;
  v_loud   constant uuid := '000000bf-0000-0000-0000-0000000000a1';
  v_hush   constant uuid := '000000bf-0000-0000-0000-0000000000a2';
  v_rows   jsonb;
  v_r      jsonb;
  v_found  boolean;
begin
  -- (a) THE OBJECTS EXIST WITH THE INTENDED VOLATILITY AND SECURITY.
  select p.provolatile::text || case when p.prosecdef then 'd' else '-' end into v_txt
    from pg_proc p where p.oid = 'public.hr_world_finds_of__ungated(int)'::regprocedure;
  if v_txt <> 'sd' then
    raise exception 'GATE(a): hr_world_finds_of__ungated is %, expected STABLE + SECURITY DEFINER '
                    '(a VOLATILE read would be re-planned per row; an INVOKER one could not see '
                    'profiles at all)', v_txt;
  end if;
  select p.provolatile::text || case when p.prosecdef then 'd' else '-' end into v_txt
    from pg_proc p where p.oid = 'public.hr_world_finds_of(int)'::regprocedure;
  if v_txt <> 'vd' then
    raise exception 'GATE(a): hr_world_finds_of is %, expected VOLATILE + SECURITY DEFINER (the '
                    'rate gate is an UPSERT and cannot run inside a STABLE function)', v_txt;
  end if;
  if coalesce((select p.proconfig::text from pg_proc p
                where p.oid = 'public.hr_world_finds_of__ungated(int)'::regprocedure), '')
       not like '%search_path%' then
    raise exception 'GATE(a): the SECURITY DEFINER inner has no pinned search_path';
  end if;

  -- (b) GRANTS. The inner and every helper are owner-only; the wrapper is
  --     callable by `authenticated` and by NOBODY else. From pg_proc.proacl via
  --     aclexplode, not information_schema: that view hides a PUBLIC grant
  --     (the default on every new function) whenever no such role is enabled.
  select coalesce(string_agg(p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', '), '')
    into v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and p.proname = 'hr_world_finds_of__ungated'
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine'));
  if v_txt <> '' then
    raise exception 'GATE(b): the privileged inner is client-executable (%) — it is the rate gate '
                    'and the seam bypassed in one call', v_txt;
  end if;
  select coalesce(string_agg(coalesce(r.rolname, 'PUBLIC'), ', ' order by coalesce(r.rolname, 'PUBLIC')), '')
    into v_txt
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where p.oid = 'public.hr_world_finds_of(int)'::regprocedure
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine'));
  if v_txt <> 'authenticated' then
    raise exception 'GATE(b): hr_world_finds_of is executable by "%" — expected exactly '
                    '"authenticated"', v_txt;
  end if;

  -- (c) THE SEAM. Exactly one hr_note_rejection call, with the rate gate still
  --     in front of it (tests/rejections-journal.mjs P6 sweeps this at chain end).
  select p.prosrc into v_txt from pg_proc p
   where p.oid = 'public.hr_world_finds_of(int)'::regprocedure;
  if (select count(*) from regexp_matches(v_txt, 'hr_note_rejection\(', 'g')) <> 1 then
    raise exception 'GATE(c): hr_world_finds_of does not carry EXACTLY ONE hr_note_rejection seam '
                    '— a refusal nothing records, or one recorded twice';
  end if;
  if position('hr_rpc_gate' in v_txt) = 0
     or position('hr_rpc_gate' in v_txt) > position('hr_note_rejection' in v_txt) then
    raise exception 'GATE(c): the rate gate is missing or sits AFTER the seam — a refused call '
                    'would be a free unlimited one';
  end if;
  if position('hr_note_rejection' in
       (select p.prosrc from pg_proc p
         where p.oid = 'public.hr_world_finds_of__ungated(int)'::regprocedure)) > 0 then
    raise exception 'GATE(c): the INNER carries a seam too — it would double-record and P6''s '
                    '"exactly one" arithmetic stops meaning anything';
  end if;
  if public.hr_rejection_verb('hr_world_finds_of') <> 'hr_world_finds_of' then
    raise exception 'GATE(c): the verb label does not round-trip through hr_rejection_verb (got "%") '
                    '— the refusal would be filed under a name no operator can grep',
                    public.hr_rejection_verb('hr_world_finds_of');
  end if;

  -- (d) THE REVOKE IS IN EFFECT. has_column_privilege, per role, per column —
  --     the only measurement that distinguishes a real revoke from the silent
  --     no-op a column-level REVOKE against a table-level grant would have been.
  --     Asserted from BOTH sides: the identity columns are gone AND the board's
  --     own columns still read, because a revoke that took the whole table with
  --     it would "pass" a one-sided check while breaking every reader.
  foreach v_txt in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_txt, 'public.world_finds', 'user_id', 'select') then
      raise exception 'GATE(d): % can still SELECT world_finds.user_id — profiles/display_names are '
                      'public-read, so the de-anonymising join is still one request away and this '
                      'whole file is decorative', v_txt;
    end if;
    if has_column_privilege(v_txt, 'public.world_finds', 'slot', 'select') then
      raise exception 'GATE(d): % can still SELECT world_finds.slot — the character key crosses', v_txt;
    end if;
    -- has_ANY_column_privilege, not has_table_privilege: after this file the
    -- grant is column-level, and has_table_privilege answers "can you read
    -- EVERY column", which is now correctly false. Measured — the first draft of
    -- this gate used has_table_privilege and failed its own apply.
    if has_any_column_privilege(v_txt, 'public.world_finds', 'select') = false then
      raise exception 'GATE(d): % lost SELECT on world_finds entirely — the board is the deliberately '
                      'shareable surface; only the identity columns were meant to go', v_txt;
    end if;
    if not (has_column_privilege(v_txt, 'public.world_finds', 'id', 'select')
        and has_column_privilege(v_txt, 'public.world_finds', 'item_id', 'select')
        and has_column_privilege(v_txt, 'public.world_finds', 'source_kind', 'select')
        and has_column_privilege(v_txt, 'public.world_finds', 'source_id', 'select')
        and has_column_privilege(v_txt, 'public.world_finds', 'one_in', 'select')
        and has_column_privilege(v_txt, 'public.world_finds', 'found_at', 'select')) then
      raise exception 'GATE(d): % lost SELECT on an anonymous board column — the re-grant did not '
                      'land', v_txt;
    end if;
    -- And no write privilege was created as a side effect of re-granting.
    if has_any_column_privilege(v_txt, 'public.world_finds', 'insert')
       or has_any_column_privilege(v_txt, 'public.world_finds', 'update')
       or has_table_privilege(v_txt, 'public.world_finds', 'delete') then
      raise exception 'GATE(d): % gained a WRITE privilege on the public board', v_txt;
    end if;
  end loop;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'world_finds'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_n <> 0 then
    raise exception 'GATE(d): % client write policies on world_finds', v_n;
  end if;

  -- (e) THE RATE BUCKET IS WIRED, and the restatement took nothing away. 4a(ii)
  --     already compared against a census of the body this file replaced, which
  --     is the stronger check; this is the independent floor, so that deleting
  --     4a(ii) does not silently delete the property with it.
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_txt;
  if position('''hr_world_finds_of''' in v_txt) = 0 then
    raise exception 'GATE(e): hr_rpc_gate does not admit hr_world_finds_of — an unknown bucket fails '
                    'CLOSED, so the verb would answer rate_limited forever and ship green and dead';
  end if;
  foreach v_keys in array array['hr_town_of', 'hr_heartbeat', 'hr_set_presence_quiet',
                              'hr_claim_daily', 'clan_deposit', 'hr_buy_hero_slot',
                              'hr_credit_kills', 'client_state_put', 'farm_plant',
                              'hr_set_style', 'beta_invite_check'] loop
    if position('''' || v_keys || '''' in v_txt) = 0 then
      raise exception 'GATE(e): the hr_rpc_gate restatement DELETED the % bucket', v_keys;
    end if;
  end loop;

  -- (f) THE BASELINE, and grant hygiene as a whole.
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    select count(*) into v_n from public.hr_client_rpc_baseline
     where proname = 'hr_world_finds_of' and grantee = 'authenticated';
    if v_n <> 1 then
      raise exception 'GATE(f): hr_world_finds_of is not declared exactly once in '
                      'hr_client_rpc_baseline (% rows)', v_n;
    end if;
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    -- Report-only (p_strict=false), the 2026-09-13-town-presence.sql discipline:
    -- this gate must not fail on pre-existing platform residue it did not create.
    -- What it DOES assert is that neither of this file's two objects appears in
    -- the unapproved or ungated findings.
    v_res := public.hr_assert_grant_hygiene(false);
    if v_res::text like '%hr_world_finds_of%' then
      raise exception 'GATE(f): hr_assert_grant_hygiene reports a finding against this file''s '
                      'verb: %', v_res;
    end if;
  end if;

  -- ── THE EXECUTED HALF. Real rows, real calls, rolled back. ────────────────
  begin
    insert into auth.users (id) values (v_loud), (v_hush) on conflict (id) do nothing;
    insert into public.profiles (id, display_name)
      values (v_loud, 'GateLoudFinder'), (v_hush, 'GateHushFinder')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, presence_quiet)
      values (v_loud, 0, 0, 0, false), (v_hush, 0, 0, 0, true)
      on conflict (user_id, slot) do update set presence_quiet = excluded.presence_quiet;
    insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
      values (v_loud, 0, '__gate_probe_item__', 'monster', 'dragon', 26000),
             (v_hush, 0, '__gate_probe_item__', 'monster', 'dragon', 26000);

    perform set_config('request.jwt.claim.sub', v_loud::text, true);
    v_res := public.hr_world_finds_of(200);
    if coalesce(v_res->>'ok', '') <> 'true' then
      raise exception 'GATE(g): an authenticated board read was refused: %', v_res::text;
    end if;
    v_rows := v_res->'rows';
    if jsonb_array_length(v_rows) < 2 then
      raise exception 'GATE(g): the probe rows are not in the projection (% rows) — every assertion '
                      'below would pass on an empty board', jsonb_array_length(v_rows);
    end if;

    -- (h) THE ALLOWLIST. Exactly eight keys, asserted by jsonb_object_keys, so a
    --     column added to world_finds tomorrow cannot ride out on this surface.
    select string_agg(k, ',' order by k) into v_keys
      from jsonb_object_keys(v_rows->0) k;
    if v_keys <> 'found_at,id,item_id,name,nth,one_in,source_id,source_kind' then
      raise exception 'GATE(h): the projected row key set is "%" — expected exactly '
                      'found_at,id,item_id,name,nth,one_in,source_id,source_kind', v_keys;
    end if;
    -- Belt and braces, in case a future key set is "allowed" by a careless edit
    -- of the line above: the two names that must NEVER appear.
    if v_rows::text like '%user_id%' or v_rows::text like '%"slot"%' then
      raise exception 'GATE(h): the projection carries user_id or slot';
    end if;
    if v_rows::text like '%' || v_loud::text || '%' or v_rows::text like '%' || v_hush::text || '%' then
      raise exception 'GATE(h): an account uuid appears in the projection VALUES';
    end if;
    select count(*) into v_n from jsonb_object_keys(v_res) k
     where k not in ('ok', 'now', 'rows', 'counts');
    if v_n <> 0 then
      raise exception 'GATE(h): the envelope carries % unexpected top-level key(s)', v_n;
    end if;

    -- (i) THE NAME IS MINTED FOR A LOUD FINDER AND NULL FOR A QUIET ONE.
    --     Both sides, from the same call, so neither is a vacuous pass.
    v_found := false;
    for v_r in select jsonb_array_elements(v_rows) loop
      if v_r->>'item_id' = '__gate_probe_item__' then
        if v_r->>'nth' is null then
          raise exception 'GATE(i): a projected row has no ordinal';
        end if;
        if v_r->>'name' = 'GateLoudFinder' then v_found := true; end if;
        if v_r->>'name' = 'GateHushFinder' then
          raise exception 'GATE(i): a presence_quiet finder was NAMED — the opt-out is not honoured '
                          'at the one place the name is minted, which is the whole point of this file';
        end if;
      end if;
    end loop;
    if not v_found then
      raise exception 'GATE(i): the LOUD finder was not named — the control failed, so "quiet is '
                      'nameless" proves nothing (a projection that names nobody would pass)';
    end if;
    -- The quiet row is PRESENT and nameless, not deleted: the ordinal is the
    -- realm's record and one player's privacy must not rewrite it.
    select count(*) into v_n from jsonb_array_elements(v_rows) e
     where e->>'item_id' = '__gate_probe_item__';
    if v_n <> 2 then
      raise exception 'GATE(i): % probe rows survived the quiet rule, expected 2 — dropping the row '
                      'would corrupt every later ordinal for everybody', v_n;
    end if;
    if (select count(*) from jsonb_array_elements(v_rows) e
         where e->>'item_id' = '__gate_probe_item__' and e->>'name' is null) <> 1 then
      raise exception 'GATE(i): the quiet row is not nameless';
    end if;
    -- And the ordinals are 1 and 2 in id order, counted over the table.
    if (select string_agg(e->>'nth', ',' order by (e->>'id')::bigint)
          from jsonb_array_elements(v_rows) e
         where e->>'item_id' = '__gate_probe_item__') <> '1,2' then
      raise exception 'GATE(i): the server ordinals are not 1,2 for two finds of a fresh item — '
                      '`nth` is a window artefact, not a realm ordinal';
    end if;
    if (v_res->'counts'->>'__gate_probe_item__')::int <> 2 then
      raise exception 'GATE(i): the per-item total is wrong (got %)',
                      v_res->'counts'->>'__gate_probe_item__';
    end if;

    -- (j) AN UNAUTHENTICATED CALL IS REFUSED AND RECORDED, AND CARRIES NO DATA.
    perform set_config('request.jwt.claim.sub', '', true);
    v_res := public.hr_world_finds_of(200);
    if coalesce(v_res->>'error', '') <> 'unauthenticated' then
      raise exception 'GATE(j): a call with no JWT subject was not refused unauthenticated (got %)',
                      v_res::text;
    end if;
    if v_res ? 'rows' then
      raise exception 'GATE(j): the refusal carries rows — it is closed, not empty';
    end if;

    -- (k) THE GATE BITES. A storm is refused, and the refusal is the bucket's.
    perform set_config('request.jwt.claim.sub', v_loud::text, true);
    v_n := 0;
    for v_n in 1 .. 40 loop
      v_res := public.hr_world_finds_of(50);
      exit when coalesce(v_res->>'error', '') = 'rate_limited';
    end loop;
    if coalesce(v_res->>'error', '') <> 'rate_limited' then
      raise exception 'GATE(k): a 40-call storm was never rate_limited — the 6/min bucket is not wired';
    end if;

    -- (l) THE READ WROTE NOTHING to the board or to the journals. A poll every
    --     90 s per player that journals a row is the game_events 1.6M-row
    --     mistake at ledger scale.
    if exists (select 1 from public.player_ledger where user_id = v_loud)
       or exists (select 1 from public.player_intents where user_id = v_loud) then
      raise exception 'GATE(l): a board READ journalled a ledger or intent row';
    end if;
    select count(*) into v_n from public.world_finds where item_id = '__gate_probe_item__';
    if v_n <> 2 then
      raise exception 'GATE(l): the board gained or lost rows during a read (% rows)', v_n;
    end if;

    raise exception using errcode = 'HR813',
      message = 'world-finds-projection §6 complete — rolling back the probe rows';
  exception when sqlstate 'HR813' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  -- (m) NET-ZERO. Nothing the executed half created may survive it.
  if exists (select 1 from public.world_finds where item_id = '__gate_probe_item__')
     or exists (select 1 from public.player_state where user_id in (v_loud, v_hush))
     or exists (select 1 from public.profiles where id in (v_loud, v_hush))
     or exists (select 1 from auth.users where id in (v_loud, v_hush))
     or exists (select 1 from public.hr_rejections where user_id in (v_loud, v_hush)) then
    raise exception 'GATE(m): §6 LEAKED a probe row';
  end if;

  raise notice 'world-finds-projection: the finder''s name is minted in exactly one place '
               '(profiles.display_name, the authority hr_town_refresh uses) and is NULL for a '
               'presence_quiet finder while the ROW survives so no ordinal is rewritten; the '
               'projection is exactly the 8-key allowlist with no user_id, no slot and no account '
               'uuid in any value; anon and authenticated can no longer SELECT world_finds.user_id '
               'or .slot (has_column_privilege, both roles) while every anonymous board column '
               'still reads and no write privilege was created; the inner is owner-only and the '
               'wrapper is callable by authenticated alone; exactly one hr_note_rejection seam '
               'sits behind the rate gate; the 6/min bucket bites at 40 calls and the four '
               'sampled pre-existing buckets survived the anchored patch; nth/counts are real '
               'realm ordinals (1,2 over a fresh item) and not window artefacts; an '
               'unauthenticated call is refused and carries no rows; the read journals nothing and '
               'moves no board row; grant hygiene raises nothing; net-zero.';
end $chk$;
