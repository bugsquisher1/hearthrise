-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-18-discord-gift.sql — hr_claim_discord_gift: THIS WEEK'S CODE FROM
--   THE DISCORD WELCOME CHANNEL PAYS A FIXED GEM GIFT, ONCE PER ACCOUNT.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane B+C (lane/b567-discord-join).
-- MONEY SURFACE: it mints gems. Security GO, then the Coordinator applies
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). No edge half. The client half (src/features/
-- discord-invite.js + goal-claim.js claimDiscordGift) reads rpc_missing and
-- gift_unavailable as "gifts are not open yet", so either order is safe.
-- CHAIN POSITION: last, AFTER 2026-10-19-account-wallet.sql (gems are one account
-- wallet; §0 refuses without it — Security C3 on the wallet review). Restates one
-- body (hr_rpc_gate, +1 bucket, pinned) and widens one CHECK.
--
-- ── WHY THE CODE IS DERIVED AND NOTHING IS WRITTEN (Security, 2026-10-11) ───
--   The repository is PUBLIC. A code, or its sha256, committed anywhere in git
--   publishes the code: 31^6 ≈ 29.7 bits cracks offline in seconds. So there is
--   no code table and no rotation write. The code is an HMAC of a Vault secret
--   (`hr_discord_gift_secret`, >= 32 chars, stored once by Tyler exactly like
--   `hr_tick_shared_secret`) over the ISO week, mapped to HEARTH + 6 letters /
--   digits. It rotates by itself every Monday 00:00 UTC; last week's code is
--   honoured for one more week (grace) so a code posted on a Sunday still works.
--   No secret (or no pgcrypto) → the claim answers gift_unavailable and the
--   operator read answers no_secret: FAIL CLOSED, never a fallback code.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 public.hr_discord_gift_claims — THE ONCE-ROW. PRIMARY KEY user_id: the
--    ACCOUNT, never (user_id, slot). Any second claim from any character of the
--    same account conflicts on the PK and is refused already_claimed BEFORE the
--    credit; two racing claims serialise on the PK and exactly one inserts.
--    Records the character paid, the ISO week of the code used, the amount.
--    RLS forced, zero policies, no client or engine privilege.
-- §2 player_ledger.kind admits 'discord_gift' (programmatic widen at the
--    'accrue' anchor; additive, nothing removed).
-- §3 hr_rpc_gate RESTATED WHOLE (its splice chain was two deep) with one new
--    line, 'hr_claim_discord_gift' at 6/min; pinned to the replayed pre-image,
--    which equals production (measured 2026-10-11). At 6/min per account a
--    29.7-bit code space is not guessable online.
-- §4 hr_discord_code_for(p_week text) -> text. The derivation: ONE dynamic
--    EXECUTE reads the Vault secret and returns the hmac, so the secret is never
--    bound to a variable a raise or a journal could carry. NULL for every
--    failure. Executable by its owner ONLY (a code oracle).
-- §5 hr_claim_discord_gift__ungated(p_slot int, p_code text) and the gated
--    wrapper hr_claim_discord_gift(p_slot int, p_code text). TWO values cross:
--    which of the caller's OWN characters is paid and the code. There is NO
--    amount parameter: the gift is c_gift_gems, a server constant. Order:
--    signed in → slot shape → own character (row locked) → already claimed? →
--    gift open (secret present)? → length/shape → this week's or last week's
--    code? (else code_expired for the week before, else wrong_code; both journalled
--    via hr_record_rejection(…, 'discord_gift', 'wrong_code') with no copy of
--    the guess) → once-row insert + hr_wallet_credit(uid, slot, 25,
--    'discord_gift', null) in ONE subtransaction (the wallet's own grant key is a
--    second once-per-account fence; its account day cap answers daily_budget and
--    rolls the once-row back) → ONE claim ledger row (kind discord_gift) that
--    ECHOES meta.gems_paid and never meta.gems: the signed movement is the
--    wallet's kind='wallet' row alone (wallet §8 v5).
--      {ok:true, gems, balance (the account wallet), version, slot}
--      {ok:false, error: not_signed_in | bad_slot | no_character |
--                        already_claimed | gift_unavailable | wrong_code |
--                        code_expired | daily_budget | rate_limited}
-- §6 hr_discord_code_current() -> jsonb — OPERATOR ONLY, owner-executable only
--    (no client role, not hr_engine). {ok, code:'HEARTH-XXXXXX', week,
--    valid_until} or {ok:false, error:'no_secret'}. Read by
--    tools/discord-gift-code.mjs through the management API; it writes nothing.
-- §7 grants (revoke first) + hr_client_rpc_baseline row.
-- §8 self-check, EXECUTED, every fixture row rolled back. With no secret (the
--    credential-free replay, or production before Tyler stores it) it proves the
--    fail-closed half; with a secret (tests/discord-gift.mjs installs Vault and
--    the pgcrypto shim) it proves the paying half too.
--
-- ── THE AMOUNT: 25 GEMS (Game Designer ruling 2026-10-11: Baron rank parity) ─
--   One constant, c_gift_gems in §5. src/features/discord-invite.js GIFT_GEMS
--   is its display copy, bound to it by tests/discord-gift.mjs D-CLIENT.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   Two characters of one account claiming at once: both pass the read-check,
--   both insert on the PK; the second blocks until the first commits and then
--   inserts nothing (row_count 0 → already_claimed, no credit). Re-applying
--   this file: §1 if-not-exists, §2 skips when present, §3's pin accepts its own
--   body, §4-§6 create-or-replace identical bodies, §7 delete-then-insert. A
--   second apply is byte-identical (tests/discord-gift.mjs D-IDEM).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +1 client RPC (authenticated, gated, baselined) that mints at most
--   c_gift_gems once per auth.users row. A forged amount has no parameter to
--   ride. The code oracles (§4, §6) are executable by their owner alone, which
--   §8 k1 asserts on the ACL itself (aclexplode), not on has_function_privilege.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   One row per account that ever claims (~50 bytes) and one ledger row. A
--   claim is three hmacs and a handful of PK probes, once per account per life.
--
-- REVERSIBILITY:
--   revoke execute on function public.hr_claim_discord_gift(integer, text) from authenticated;
--   delete from public.hr_client_rpc_baseline where proname = 'hr_claim_discord_gift';
--   (or delete the Vault secret: every claim then answers gift_unavailable.)
--   Gifts already paid are journalled and are not reversed.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_rpc_gate and the four new
--   functions; restore-census classifies hr_discord_gift_claims. Tyler stores
--   the secret once (Supabase dashboard → Vault, name hr_discord_gift_secret,
--   64 random characters); then `node tools/discord-gift-code.mjs` prints the
--   week's code to post.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: player_state / player_ledger / hr_client_rpc_baseline absent';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regprocedure('public.hr_tick_crypto_schema()') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate / hr_assert_grant_hygiene / hr_tick_crypto_schema / hr_record_rejection absent';
  end if;
  -- Gems are ONE account wallet; the gift credits it through its choke point.
  if to_regclass('public.account_wallet') is null
     or to_regprocedure('public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: apply 2026-10-19-account-wallet.sql before this file (account_wallet / hr_wallet_credit absent)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_ledger'::regclass
                    and conname = 'player_ledger_kind_check') then
    raise exception 'PRECONDITION: player_ledger_kind_check absent — the journal row could not be checked';
  end if;
  -- A database with Vault is one where the code is EXPECTED to derive; no pgcrypto
  -- there would leave the gift silently closed for ever (the world-tick T-1 lesson).
  if to_regclass('vault.decrypted_secrets') is not null and public.hr_tick_crypto_schema() is null then
    raise exception 'HR_DISCORD_NO_PGCRYPTO: Vault exists but hmac(text,text,text) is not resolvable — '
                    'create extension if not exists pgcrypto with schema extensions; then re-apply';
  end if;
end $mig$;

-- ── §1 THE ONCE-ROW (ONE PER ACCOUNT) ───────────────────────────────────────
create table if not exists public.hr_discord_gift_claims (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  slot       integer     not null check (slot between 0 and 5),
  week       text        not null check (week ~ '^[0-9]{4}W[0-9]{2}$'),
  gems_paid  integer     not null check (gems_paid > 0),
  claimed_at timestamptz not null default now()
);
alter table public.hr_discord_gift_claims enable row level security;
alter table public.hr_discord_gift_claims force row level security;

do $mig$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.hr_discord_gift_claims from %I', r);
    end if;
  end loop;
  revoke all on public.hr_discord_gift_claims from public;
end $mig$;

-- ── §2 player_ledger.kind ADMITS 'discord_gift' — PROGRAMMATIC, ADDITIVE ────
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if position('''discord_gift''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''discord_gift'' — widen skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, '''accrue''::text', ''))) <> length('''accrue''::text') then
    raise exception 'player_ledger_kind_check has no single ''accrue''::text anchor (%) — refusing to widen blind', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''discord_gift''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''discord_gift''';
end $mig$;

-- ── §3 hr_rpc_gate RESTATED WHOLE, + 'hr_claim_discord_gift' AT 6/min ──────
-- The splice chain was two deep since 2026-09-13-world-finds-projection.sql
-- (tests/patch-chain-guard.mjs PATCH-1), so this file restates the body instead
-- of adding a third anchor: the replayed body at 2026-10-17-bestiary-target.sql,
-- which production carries (live-hash-drift measured live = replay, 2026-10-11),
-- plus ONE line. PINNED: the restatement runs only over that exact pre-image, so
-- a gate some other file has spliced in the meantime is refused, never clobbered
-- (the b484–b487 class). A body that already IS this restatement is a no-op.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = 'public.hr_rpc_gate(text)'::regprocedure;
  if v_md5 not in ('05a4fac2f51813a74465431f2b50b451', '8b22c008ce0f586b83c8da6f5c3aad4c') then
    raise exception 'hr_rpc_gate is not the body this file restates (md5 %) — a bucket was spliced since 2026-10-17; restate from that body instead', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_rpc_gate(p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
    when 'hr_buy_gem_unlock' then v_limit := 12;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'hr_vigour_refill' then v_limit := 6;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
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

-- ── §4 THE DERIVATION (a code oracle: owner-executable only) ───────────────
create or replace function public.hr_discord_code_for(p_week text)
 returns text
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I/L
  v_schema text;
  v_mac    text;
  v_bytes  bytea;
  v_code   text := 'HEARTH';
begin
  if p_week is null or p_week !~ '^[0-9]{4}W[0-9]{2}$' then return null; end if;
  v_schema := public.hr_tick_crypto_schema();
  if v_schema is null or to_regclass('vault.decrypted_secrets') is null then return null; end if;
  -- ONE STATEMENT: read the secret, key the hmac with it, hand back hex.
  execute format(
    'select encode(%I.hmac($1, s.decrypted_secret, %L), %L)'
    '  from vault.decrypted_secrets s'
    ' where s.name = $2 and s.decrypted_secret is not null'
    '   and length(s.decrypted_secret) >= 32'
    ' limit 1', v_schema, 'sha256', 'hex')
    into v_mac
   using 'hearthrise-discord-gift:' || p_week, 'hr_discord_gift_secret';
  if v_mac is null then return null; end if;
  v_bytes := decode(v_mac, 'hex');
  for i in 0..5 loop
    v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % length(c_alphabet)) + 1, 1);
  end loop;
  return v_code;
end $fn$;

-- ── §5 THE CLAIM ────────────────────────────────────────────────────────────
create or replace function public.hr_claim_discord_gift__ungated(p_slot integer, p_code text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  c_gift_gems constant integer := 25;
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_week   text;
  v_cur    text;
  v_prev   text;
  v_norm   text;
  v_used   text;
  v_rows   integer;
  v_w      jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  -- The acting hero (provenance on the journal): the caller's OWN character, locked
  -- before any decision. The gems themselves land in the account wallet.
  perform 1 from public.player_state where user_id = v_uid and slot = p_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', p_slot);
  end if;
  -- ONCE PER ACCOUNT: read first, so a claimed account is told so whatever it typed.
  if exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  v_week := to_char(v_now at time zone 'utc', 'IYYY"W"IW');
  v_cur  := public.hr_discord_code_for(v_week);
  if v_cur is null then
    return jsonb_build_object('ok', false, 'error', 'gift_unavailable');   -- no secret: closed
  end if;
  -- Bounded before any regex: a megabyte "code" costs one length() and nothing else.
  if p_code is not null and length(p_code) <= 64 then
    v_norm := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  end if;
  if v_norm = v_cur then
    v_used := v_week;
  else
    v_prev := public.hr_discord_code_for(to_char((v_now - interval '7 days') at time zone 'utc', 'IYYY"W"IW'));
    if v_norm = v_prev then
      v_used := to_char((v_now - interval '7 days') at time zone 'utc', 'IYYY"W"IW');
    elsif v_norm is not null
          and v_norm = public.hr_discord_code_for(to_char((v_now - interval '14 days') at time zone 'utc', 'IYYY"W"IW')) then
      perform public.hr_record_rejection(v_uid, p_slot, 'discord_gift', 'code_expired', '{}'::jsonb, 1);
      return jsonb_build_object('ok', false, 'error', 'code_expired');
    else
      -- Journalled, with no copy of the guess.
      perform public.hr_record_rejection(v_uid, p_slot, 'discord_gift', 'wrong_code', '{}'::jsonb, 1);
      return jsonb_build_object('ok', false, 'error', 'wrong_code');
    end if;
  end if;
  -- CONSUME + CREDIT, one subtransaction: the once-row (PK = the account; a racing
  -- second claim inserts nothing) and the account-wallet credit through the ONE
  -- choke point (2026-10-19-account-wallet.sql §3, grant key 'discord_gift',
  -- itself once per account). The wallet's account day cap raises HR000
  -- 'daily_budget'; that refusal rolls the once-row back with it and is answered
  -- by name, never as an outage.
  begin
    insert into public.hr_discord_gift_claims (user_id, slot, week, gems_paid)
    values (v_uid, p_slot, v_used, c_gift_gems)
    on conflict (user_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object('ok', false, 'error', 'already_claimed');
    end if;
    v_w := public.hr_wallet_credit(v_uid, p_slot, c_gift_gems, 'discord_gift', null);
  exception when sqlstate 'HR000' then
    if sqlerrm = 'daily_budget' then
      return jsonb_build_object('ok', false, 'error', 'daily_budget');
    end if;
    raise;
  end;
  -- The wallet's own key already held: the account was paid before (a once-row
  -- lost to a restore). Nothing is credited twice and nothing more is journalled.
  if coalesce((v_w->>'paid')::bigint, 0) <> c_gift_gems then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  -- The claim's own journal row ECHOES the payout (gems_paid); the signed movement
  -- is the wallet's kind='wallet' row alone (wallet §8 v5: one source to sum).
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, p_slot, 'discord_gift', 'discord_gift', 0, 0, 0, 0, 0,
     jsonb_build_object('gems_paid', c_gift_gems, 'week', v_used));
  return jsonb_build_object('ok', true, 'gems', c_gift_gems, 'balance', (v_w->>'balance')::bigint,
                            'version', (v_w->>'version')::bigint, 'slot', p_slot);
end $fn$;

create or replace function public.hr_claim_discord_gift(p_slot integer, p_code text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
begin
  if not public.hr_rpc_gate('hr_claim_discord_gift') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_claim_discord_gift__ungated(p_slot, p_code);
end $fn$;

-- ── §6 THE OPERATOR READ (owner-executable only) ────────────────────────────
create or replace function public.hr_discord_code_current()
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_week text := to_char(now() at time zone 'utc', 'IYYY"W"IW');
  v_code text := public.hr_discord_code_for(v_week);
begin
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'no_secret');
  end if;
  return jsonb_build_object('ok', true, 'code', left(v_code, 6) || '-' || substr(v_code, 7), 'week', v_week,
    -- this week's code rotates out next Monday and is honoured one more week
    'valid_until', (date_trunc('week', now() at time zone 'utc') + interval '14 days') at time zone 'utc');
end $fn$;

-- ── §7 GRANTS — EXACT, REVOKE FIRST — AND THE BASELINE ROW ─────────────────
do $mig$
declare r text; f text;
begin
  foreach f in array array['public.hr_discord_code_for(text)', 'public.hr_discord_code_current()',
                           'public.hr_claim_discord_gift__ungated(integer, text)',
                           'public.hr_claim_discord_gift(integer, text)'] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
end $mig$;
grant execute on function public.hr_claim_discord_gift(integer, text) to authenticated;

delete from public.hr_client_rpc_baseline
 where proname = 'hr_claim_discord_gift' and grantee = 'authenticated';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_claim_discord_gift', 'p_slot integer, p_code text', 'authenticated',
   'added 2026-10-18: this week''s Discord code (HMAC of a Vault secret) pays a fixed server gem gift once per account (discord-gift)');

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ─────────────────
do $mig$
declare
  v       jsonb;
  v_uid   constant uuid := '000000dc-0000-0000-0000-0000000000dc';
  v_two   constant uuid := '000000dc-0000-0000-0000-0000000000dd';
  v_g0    bigint; v_g1 bigint; v_n int; v_def text;
  v_cur   text; v_prev text; v_old text;
  v_census text[];
  -- The account wallet's gem-identifier census (2026-10-19-account-wallet.sql §8
  -- k5), repeated here: this file must add NO body naming a gems identifier.
  c_gem_identifier_ok constant text[] := array[
    'hr_claim_goal__ungated', 'hr_create_character', 'hr_goal_state__ungated', 'hr_state_of',
    'hr_wallet_credit', 'hr_wallet_debit',
    'world_event_absence_claim__ungated', 'world_event_pledge_settle__ungated'];
begin
  -- k1 THE ACL ITSELF: the oracles and the inner have NO grantee but their owner;
  --    the wrapper has exactly the owner and authenticated.
  if exists (select 1 from pg_proc p
              where p.oid in ('public.hr_discord_code_for(text)'::regprocedure,
                              'public.hr_discord_code_current()'::regprocedure,
                              'public.hr_claim_discord_gift__ungated(integer,text)'::regprocedure)
                and (p.proacl is null
                     or exists (select 1 from aclexplode(p.proacl) a where a.grantee <> p.proowner))) then
    raise exception 'discord-gift §8 k1: a code oracle or the ungated inner has a grantee besides its owner'; end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = 'public.hr_claim_discord_gift(integer,text)'::regprocedure
                and a.grantee <> p.proowner and a.grantee <> 'authenticated'::regrole)
     or not has_function_privilege('authenticated', 'public.hr_claim_discord_gift(integer,text)', 'execute') then
    raise exception 'discord-gift §8 k1: the claim wrapper is not authenticated-only'; end if;
  -- k2 the once-row table: RLS forced, zero policies, no client or engine privilege.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_discord_gift_claims') then
    raise exception 'discord-gift §8 k2: a policy exists on hr_discord_gift_claims'; end if;
  if exists (select 1 from pg_class where oid = 'public.hr_discord_gift_claims'::regclass
              and not (relrowsecurity and relforcerowsecurity)) then
    raise exception 'discord-gift §8 k2: RLS is not forced on hr_discord_gift_claims'; end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'hr_discord_gift_claims'
                and grantee in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick', 'PUBLIC')) then
    raise exception 'discord-gift §8 k2: a client or engine role holds a privilege on hr_discord_gift_claims'; end if;
  -- k3 the once-row is keyed on the ACCOUNT alone.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.hr_discord_gift_claims'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (user_id)' then
    raise exception 'discord-gift §8 k3: the once-row key is % — it must be the account (user_id) alone', v_def; end if;
  -- k4 the gate admits the bucket, and the restatement is the pinned body, nothing dropped.
  select replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '') into v_def;
  if position('when ''hr_claim_discord_gift'' then v_limit := 6;' in v_def) = 0 then
    raise exception 'discord-gift §8 k4: hr_rpc_gate does not admit hr_claim_discord_gift at 6'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = 'public.hr_rpc_gate(text)'::regprocedure) <> '8b22c008ce0f586b83c8da6f5c3aad4c' then
    raise exception 'discord-gift §8 k4: the restated hr_rpc_gate is not the pinned body (a bucket moved or was dropped)'; end if;
  -- k5 no amount crosses: the claim takes exactly (integer, text).
  if exists (select 1 from pg_proc where proname = 'hr_claim_discord_gift'
              and pg_get_function_identity_arguments(oid) <> 'p_slot integer, p_code text') then
    raise exception 'discord-gift §8 k5: hr_claim_discord_gift grew an argument'; end if;
  -- k7 THE WALLET'S CENSUS, re-run after this file: (a) only the wallet helpers
  --    write the wallet tables; (b) the bodies naming a bare gems identifier are
  --    exactly the wallet's classified list (the gift credits through
  --    hr_wallet_credit and its once-row column is gems_paid).
  select array_agg(p.proname::text order by p.proname) into v_census
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
           '/\*.*?\*/', '', 'g'), '''([^'']|'''')*''', '''''', 'g')
         ~* '(update|insert\s+into)\s+(public\.)?(account_wallet|account_gem_grants)\M'
     and p.proname not in ('hr_wallet_ensure', 'hr_wallet_credit', 'hr_wallet_debit');
  if v_census is not null then
    raise exception 'discord-gift §8 k7(a): % write the wallet tables outside the choke point', v_census; end if;
  select array_agg(distinct p.proname::text order by p.proname::text) into v_census
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
           '/\*.*?\*/', '', 'g'), '''([^'']|'''')*''', '''''', 'g')
         ~* '(^|[^a-z0-9_$])gems([^a-z0-9_]|$)';
  if v_census is distinct from c_gem_identifier_ok then
    raise exception 'discord-gift §8 k7(b): the bodies naming a gems identifier are %, expected %', v_census, c_gem_identifier_ok; end if;

  v_cur :=public.hr_discord_code_for(to_char(now() at time zone 'utc', 'IYYY"W"IW'));

  begin
    insert into auth.users (id) values (v_uid), (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, version) values
      (v_uid, 0, 0, 1), (v_uid, 1, 0, 1), (v_two, 0, 0, 1)
      on conflict (user_id, slot) do nothing;
    -- The fixture's gems live where every account's do: the account wallet.
    insert into public.account_wallet (user_id, gems) values (v_uid, 3), (v_two, 0)
      on conflict (user_id) do update set gems = excluded.gems;

    -- v1 not signed in.
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_claim_discord_gift__ungated(0, 'HEARTHAAAAAA');
    if v->>'error' is distinct from 'not_signed_in' then raise exception 'discord-gift §8 v1: %', v; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v := public.hr_claim_discord_gift__ungated(9, 'HEARTHAAAAAA');
    if v->>'error' is distinct from 'bad_slot' then raise exception 'discord-gift §8 v1 slot: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(2, 'HEARTHAAAAAA');
    if v->>'error' is distinct from 'no_character' then raise exception 'discord-gift §8 v1 char: %', v; end if;

    if v_cur is null then
      -- v0 FAIL CLOSED: no secret → no code, no gift, no operator read.
      v := public.hr_claim_discord_gift__ungated(0, 'HEARTHAAAAAA');
      if v->>'error' is distinct from 'gift_unavailable' then raise exception 'discord-gift §8 v0 closed: %', v; end if;
      if coalesce(public.hr_discord_code_current()->>'error', '') <> 'no_secret' then
        raise exception 'discord-gift §8 v0: the operator read answered without a secret'; end if;
      if (select gems from public.account_wallet where user_id = v_uid) <> 3 then
        raise exception 'discord-gift §8 v0: a closed gift moved gems'; end if;
      raise notice 'discord-gift §8: no Vault secret — fail-closed arms ran; the paying arms run once hr_discord_gift_secret exists';
    else
      v_prev := public.hr_discord_code_for(to_char((now() - interval '7 days') at time zone 'utc', 'IYYY"W"IW'));
      v_old  := public.hr_discord_code_for(to_char((now() - interval '14 days') at time zone 'utc', 'IYYY"W"IW'));
      if v_cur !~ '^HEARTH[A-HJKMNP-Z2-9]{6}$' or v_cur = v_prev then
        raise exception 'discord-gift §8 v0: the derived code % is malformed or did not rotate', v_cur; end if;
      if public.hr_discord_code_current()->>'code' is distinct from left(v_cur, 6) || '-' || substr(v_cur, 7) then
        raise exception 'discord-gift §8 v0: the operator read is not this week''s code'; end if;

      -- v2 a wrong code is refused, journalled, and pays nothing; so is an over-long one.
      v := public.hr_claim_discord_gift__ungated(0, 'HEARTH' || case when v_cur = 'HEARTHAAAAAA' then 'BBBBBB' else 'AAAAAA' end);
      if v->>'error' is distinct from 'wrong_code' then raise exception 'discord-gift §8 v2 wrong: %', v; end if;
      if not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'wrong_code') then
        raise exception 'discord-gift §8 v2: a wrong code was not journalled'; end if;
      v := public.hr_claim_discord_gift__ungated(0, repeat('-', 60) || v_cur);
      if v->>'error' is distinct from 'wrong_code' then raise exception 'discord-gift §8 v2 length: %', v; end if;

      -- v3 this week's code (typed loosely) pays the server constant once, into the ACCOUNT wallet.
      select gems into v_g0 from public.account_wallet where user_id = v_uid;
      v := public.hr_claim_discord_gift__ungated(1, ' ' || lower(left(v_cur, 6)) || '-' || substr(v_cur, 7) || ' ');
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'discord-gift §8 v3: this week''s code did not pay: %', v; end if;
      select gems into v_g1 from public.account_wallet where user_id = v_uid;
      if v_g1 - v_g0 <> 25 or (v->>'gems')::int <> 25 or (v->>'balance')::bigint <> v_g1 then
        raise exception 'discord-gift §8 v3: paid % (answered %), expected 25', v_g1 - v_g0, v; end if;
      if not exists (select 1 from public.account_gem_grants
                      where user_id = v_uid and grant_key = 'discord_gift' and slot = 1 and gems = 25) then
        raise exception 'discord-gift §8 v3: the wallet holds no discord_gift grant key for the account'; end if;
      if not exists (select 1 from public.hr_discord_gift_claims
                      where user_id = v_uid and slot = 1 and gems_paid = 25 and week ~ '^[0-9]{4}W[0-9]{2}$') then
        raise exception 'discord-gift §8 v3: no once-row was written for the account'; end if;

      -- v4 ONCE PER ACCOUNT: the same character, then ANOTHER character of the same account.
      v := public.hr_claim_discord_gift__ungated(1, v_cur);
      if v->>'error' is distinct from 'already_claimed' then raise exception 'discord-gift §8 v4 replay: %', v; end if;
      v := public.hr_claim_discord_gift__ungated(0, v_cur);
      if v->>'error' is distinct from 'already_claimed' then
        raise exception 'discord-gift §8 v4: a second character of the same account was not refused: %', v; end if;
      if (select gems from public.account_wallet where user_id = v_uid) <> v_g1 then
        raise exception 'discord-gift §8 v4: a refused claim moved gems'; end if;

      -- v5 journalled, the wallet's way: ONE wallet row carries the signed +25
      --    (meta.gems, gems_in); the claim's own row only ECHOES gems_paid, so the
      --    account's gems sum from one source (wallet §8 v5).
      select count(*) into v_n from public.player_ledger
       where user_id = v_uid and kind = 'discord_gift' and slot = 1
         and (meta->>'gems_paid')::int = 25 and not (meta ? 'gems') and gold = 0 and gems_in = 0;
      if v_n <> 1 or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'discord_gift') <> 1 then
        raise exception 'discord-gift §8 v5: expected one discord_gift row echoing gems_paid, found %', v_n; end if;
      if (select count(*) from public.player_ledger
           where user_id = v_uid and kind = 'wallet' and intent = 'discord_gift'
             and (meta->>'gems')::int = 25 and gems_in = 25) <> 1 then
        raise exception 'discord-gift §8 v5: expected one wallet row of +25 for the gift'; end if;
      if exists (select 1 from public.player_ledger where user_id = v_uid and kind <> 'wallet' and meta ? 'gems') then
        raise exception 'discord-gift §8 v5: a non-wallet ledger row carries meta.gems (double count)'; end if;

      -- v6 rotation: two weeks old is expired; last week's code is honoured (grace).
      perform set_config('request.jwt.claim.sub', v_two::text, true);
      v := public.hr_claim_discord_gift__ungated(0, v_old);
      if v->>'error' is distinct from 'code_expired' then raise exception 'discord-gift §8 v6 rotated: %', v; end if;
      if not exists (select 1 from public.hr_rejections where user_id = v_two and code = 'code_expired') then
        raise exception 'discord-gift §8 v6: an expired code was not journalled'; end if;
      v := public.hr_claim_discord_gift__ungated(0, v_prev);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'discord-gift §8 v6 grace: %', v; end if;

      -- v7 the wrapper is gated: the seventh call in a minute is rate_limited.
      for v_n in 1..7 loop v := public.hr_claim_discord_gift(0, v_cur); end loop;
      if v->>'error' is distinct from 'rate_limited' then
        raise exception 'discord-gift §8 v7: seven calls in a minute were not rate limited: %', v; end if;
    end if;

    raise exception using errcode = 'HR8DC', message = 'discord-gift §8 complete — rolling back';
  exception when sqlstate 'HR8DC' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_two))
     or exists (select 1 from public.hr_discord_gift_claims where user_id in (v_uid, v_two))
     or exists (select 1 from public.account_wallet where user_id in (v_uid, v_two))
     or exists (select 1 from public.account_gem_grants where user_id in (v_uid, v_two))
     or exists (select 1 from public.hr_rejections where user_id in (v_uid, v_two))
     or exists (select 1 from auth.users where id in (v_uid, v_two)) then
    raise exception 'discord-gift §8: a probe row leaked';
  end if;

  declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
  begin
    if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'discord-gift §8 k6: grant hygiene: %', v_gh;
    end if;
  end;
  raise notice 'discord-gift §8: ACLs, table, account-keyed once-row, gate, fail-closed / weekly code, '
               'one gift per account, journalled, rate limited — all green';
end $mig$;
