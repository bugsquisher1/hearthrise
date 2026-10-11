-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-18-discord-gift.sql — hr_claim_discord_gift: THE CODE POSTED IN THE
--   DISCORD WELCOME CHANNEL PAYS A FIXED GEM GIFT, ONCE PER ACCOUNT.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane B+C (lane/b567-discord-join).
-- MONEY SURFACE: it mints gems. Security GO, then the Coordinator applies
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). No edge half. The client half (src/features/
-- discord-invite.js + goal-claim.js claimDiscordGift) reads rpc_missing as
-- "gifts are not open yet", so either order is safe. Until the operator runs
-- tools/discord-gift-code.mjs there is no active code and every claim answers
-- wrong_code: the gift is OFF until a code exists.
-- CHAIN POSITION: last, after 2026-10-17-bestiary-target.sql. Restates one body
-- (hr_rpc_gate, +1 bucket) and widens one CHECK. Any OTHER staged file that
-- touches hr_rpc_gate must be applied after this one or re-pinned against it.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 public.hr_discord_codes — the code the operator posts, stored as the hex
--    sha256 of its NORMALISED form (A-Z0-9, upper case), never the plaintext.
--    At most ONE active row (partial unique index). RLS forced, zero policies,
--    every privilege revoked from every client and engine role: only the
--    SECURITY DEFINER functions below read or write it.
-- §2 public.hr_discord_gift_claims — THE ONCE-ROW. PRIMARY KEY user_id: the
--    ACCOUNT, never (user_id, slot). Any second claim from any character of the
--    same account conflicts on the PK and is refused already_claimed BEFORE the
--    credit; two racing claims serialise on the PK and exactly one inserts.
--    Records which character was paid, which code, and the amount. Same RLS
--    and privilege shape as §1.
-- §3 player_ledger.kind admits 'discord_gift' (programmatic widen at the
--    'accrue' anchor; additive, nothing removed).
-- §4 hr_rpc_gate RESTATED WHOLE (its splice chain was two deep) with one new
--    line, 'hr_claim_discord_gift' at 6/min; pinned to the replayed pre-image,
--    which equals production (measured 2026-10-11). A wrong code moves nothing;
--    the bucket bounds cost and makes guessing slow. The code is not a secret — it is posted in a
--    public channel; it proves a visit, not an identity.
-- §5 hr_claim_discord_gift__ungated(p_slot int, p_code text) and the gated
--    wrapper hr_claim_discord_gift(p_slot int, p_code text). TWO values cross:
--    which of the caller's OWN characters is paid (auth.uid(), p_slot) and the
--    code. There is NO amount parameter: the gift is c_gift_gems, a server
--    constant. Order: signed in → slot shape → own character (row locked) →
--    already claimed? → code shape → code known / active → once-row insert →
--    credit gems + version → ONE ledger row (kind discord_gift, meta.gems +N,
--    gems_in 0: a fixed once-ever reward, outside the accrual inflow budget,
--    the renown/goal-claim precedent). Answers
--      {ok:true, gems, balance, version, slot}
--      {ok:false, error: not_signed_in | bad_slot | no_character |
--                        already_claimed | wrong_code | code_expired |
--                        rate_limited}
-- §6 hr_discord_code_rotate(p_code text) — OPERATOR ONLY. Executable by no
--    client, engine or service role; the management API runs as the owner.
--    Retires the active code and installs the new one; refuses a malformed code
--    and a code that was ever used before (a rotated code stays dead).
--    Answers {ok, retired} and never the code or its hash.
-- §7 grants (revoke first) + hr_client_rpc_baseline row.
-- §8 self-check, EXECUTED, every fixture row rolled back.
--
-- ── THE AMOUNT: 50 GEMS (PROPOSED — Game Designer to confirm) ──────────────
--   Gems buy cosmetics, hero slots and bank space only. The login reward pays
--   at most 2 gems a week; the cheapest gem purchase is bank space at 45
--   (src/data/shops.js bank.gems), the first hero slot is 200. 50 makes the
--   gift spendable on day one (one bank expansion) without moving a hero slot
--   in reach: a quarter of the first slot, ~6 months of login gems, the scale
--   of one Count renown rank. A retune is a one-constant restatement of §5.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   Two characters of one account claiming at once: both pass the read-check,
--   both insert on the PK; the second blocks until the first commits and then
--   inserts nothing (row_count 0 → already_claimed, no credit). A replay of the
--   same call is the same refusal. The credit runs under the character's row
--   lock taken before any decision. Re-applying this file: §1/§2 if-not-exists,
--   §3 skips when present, §4's pin accepts its own body, §5/§6 create-or-replace identical bodies, §7
--   delete-then-insert. A second apply is byte-identical
--   (tests/discord-gift.mjs D-IDEM).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +1 client RPC (authenticated, gated, baselined) that mints at most
--   c_gift_gems once per auth.users row. The value crossing to the economy is
--   a server constant; a forged amount has no parameter to ride. The ceiling a
--   hostile actor reaches is one gift per confirmed account, the same ceiling as
--   the starting kit. No client reads either new table.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   One row per account that ever claims (~60 bytes) and one ledger row. The
--   claim is a handful of PK probes; it is called once per account in its life.
--
-- REVERSIBILITY:
--   revoke execute on function public.hr_claim_discord_gift(integer, text) from authenticated;
--   delete from public.hr_client_rpc_baseline where proname = 'hr_claim_discord_gift';
--   update public.hr_discord_codes set active = false, retired_at = now() where active;
--   Gifts already paid are journalled and are not reversed.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_rpc_gate and the three new
--   functions; restore-census classifies hr_discord_codes (operator config) and
--   hr_discord_gift_claims (entitlement, must survive a restore). Then the
--   operator runs `node tools/discord-gift-code.mjs` and posts the code.
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
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate / hr_assert_grant_hygiene absent';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_ledger'::regclass
                    and conname = 'player_ledger_kind_check') then
    raise exception 'PRECONDITION: player_ledger_kind_check absent — the journal row could not be checked';
  end if;
end $mig$;

-- ── §1 THE CODE TABLE ───────────────────────────────────────────────────────
create table if not exists public.hr_discord_codes (
  code_hash  text        primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint hr_discord_codes_retired check (active = (retired_at is null))
);
create unique index if not exists hr_discord_codes_one_active
  on public.hr_discord_codes ((true)) where active;
alter table public.hr_discord_codes enable row level security;
alter table public.hr_discord_codes force row level security;

-- ── §2 THE ONCE-ROW (ONE PER ACCOUNT) ───────────────────────────────────────
create table if not exists public.hr_discord_gift_claims (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  slot       integer     not null check (slot between 0 and 5),
  code_hash  text        not null check (code_hash ~ '^[0-9a-f]{64}$'),
  gems       integer     not null check (gems > 0),
  claimed_at timestamptz not null default now()
);
alter table public.hr_discord_gift_claims enable row level security;
alter table public.hr_discord_gift_claims force row level security;

do $mig$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.hr_discord_codes from %I', r);
      execute format('revoke all on public.hr_discord_gift_claims from %I', r);
    end if;
  end loop;
  revoke all on public.hr_discord_codes from public;
  revoke all on public.hr_discord_gift_claims from public;
end $mig$;

-- ── §3 player_ledger.kind ADMITS 'discord_gift' — PROGRAMMATIC, ADDITIVE ────
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

-- ── §4 hr_rpc_gate RESTATED WHOLE, + 'hr_claim_discord_gift' AT 6/min ──────
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

-- ── §5 THE CLAIM ────────────────────────────────────────────────────────────
create or replace function public.hr_claim_discord_gift__ungated(p_slot integer, p_code text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  c_gift_gems constant integer := 50;
  v_uid    uuid := auth.uid();
  v_norm   text;
  v_hash   text;
  v_active boolean;
  v_rows   integer;
  v_gems   bigint;
  v_ver    bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  -- The paid wallet: the caller's OWN character, locked before any decision.
  perform 1 from public.player_state where user_id = v_uid and slot = p_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', p_slot);
  end if;
  -- ONCE PER ACCOUNT: read first, so a claimed account is told so whatever it typed.
  if exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  -- Bounded before any regex: a megabyte "code" costs one length() and nothing else.
  if p_code is null or length(p_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;
  v_norm := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_norm !~ '^[A-Z0-9]{6,32}$' then
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;
  v_hash := encode(sha256(convert_to(v_norm, 'UTF8')), 'hex');
  select c.active into v_active from public.hr_discord_codes c where c.code_hash = v_hash;
  if v_active is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;
  if not v_active then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  -- CONSUME. The PK is the account; a racing second claim inserts nothing.
  insert into public.hr_discord_gift_claims (user_id, slot, code_hash, gems)
  values (v_uid, p_slot, v_hash, c_gift_gems)
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  -- CREDIT, after the once-row, in the same transaction.
  update public.player_state
     set gems = coalesce(gems, 0) + c_gift_gems, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = p_slot
   returning gems, version into v_gems, v_ver;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, p_slot, 'discord_gift', 'discord_gift', 0, 0, 0, 0, 0,
     jsonb_build_object('gems', c_gift_gems, 'code', left(v_hash, 12)));
  return jsonb_build_object('ok', true, 'gems', c_gift_gems, 'balance', v_gems,
                            'version', v_ver, 'slot', p_slot);
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

-- ── §6 THE OPERATOR'S ROTATION ──────────────────────────────────────────────
create or replace function public.hr_discord_code_rotate(p_code text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_norm    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash    text;
  v_retired integer;
begin
  if v_norm !~ '^[A-Z0-9]{6,32}$' then
    raise exception 'hr_discord_code_rotate: a code is 6-32 letters or digits';
  end if;
  v_hash := encode(sha256(convert_to(v_norm, 'UTF8')), 'hex');
  if exists (select 1 from public.hr_discord_codes where code_hash = v_hash) then
    raise exception 'hr_discord_code_rotate: that code was used before; a rotated code stays dead';
  end if;
  update public.hr_discord_codes set active = false, retired_at = now() where active;
  get diagnostics v_retired = row_count;
  insert into public.hr_discord_codes (code_hash, active) values (v_hash, true);
  return jsonb_build_object('ok', true, 'retired', v_retired);
end $fn$;

-- ── §7 GRANTS — EXACT, REVOKE FIRST — AND THE BASELINE ROW ─────────────────
revoke execute on function public.hr_claim_discord_gift__ungated(integer, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_discord_gift(integer, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_discord_code_rotate(text) from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke execute on function public.hr_claim_discord_gift__ungated(integer, text) from hr_engine;
    revoke execute on function public.hr_claim_discord_gift(integer, text) from hr_engine;
    revoke execute on function public.hr_discord_code_rotate(text) from hr_engine;
  end if;
end $mig$;
grant execute on function public.hr_claim_discord_gift(integer, text) to authenticated;

delete from public.hr_client_rpc_baseline
 where proname = 'hr_claim_discord_gift' and grantee = 'authenticated';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_claim_discord_gift', 'p_slot integer, p_code text', 'authenticated',
   'added 2026-10-18: the Discord welcome-channel code pays a fixed server gem gift once per account (discord-gift)');

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ─────────────────
do $mig$
declare
  v       jsonb;
  v_uid   constant uuid := '000000dc-0000-0000-0000-0000000000dc';
  v_two   constant uuid := '000000dc-0000-0000-0000-0000000000dd';
  v_g0    bigint; v_g1 bigint; v_n int; v_def text;
begin
  -- k1 grants: the wrapper is authenticated-only; the inner and the rotation are no client's.
  if not has_function_privilege('authenticated', 'public.hr_claim_discord_gift(integer,text)', 'execute') then
    raise exception 'discord-gift §8 k1: the claim is not callable by authenticated'; end if;
  if has_function_privilege('anon', 'public.hr_claim_discord_gift(integer,text)', 'execute') then
    raise exception 'discord-gift §8 k1: the claim is anon-executable'; end if;
  if has_function_privilege('authenticated', 'public.hr_claim_discord_gift__ungated(integer,text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_claim_discord_gift__ungated(integer,text)', 'execute') then
    raise exception 'discord-gift §8 k1: the ungated inner is client-executable — the gate is decoration'; end if;
  if has_function_privilege('authenticated', 'public.hr_discord_code_rotate(text)', 'execute')
     or has_function_privilege('anon', 'public.hr_discord_code_rotate(text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_discord_code_rotate(text)', 'execute') then
    raise exception 'discord-gift §8 k1: a client role can rotate the gift code'; end if;
  -- k2 the tables: RLS forced, zero policies, no client privilege.
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('hr_discord_codes', 'hr_discord_gift_claims')) then
    raise exception 'discord-gift §8 k2: a policy exists on a gift table'; end if;
  if exists (select 1 from pg_class where oid in ('public.hr_discord_codes'::regclass, 'public.hr_discord_gift_claims'::regclass)
              and not (relrowsecurity and relforcerowsecurity)) then
    raise exception 'discord-gift §8 k2: RLS is not forced on a gift table'; end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('hr_discord_codes', 'hr_discord_gift_claims')
                and grantee in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick', 'PUBLIC')) then
    raise exception 'discord-gift §8 k2: a client or engine role holds a privilege on a gift table'; end if;
  -- k3 the once-row is keyed on the ACCOUNT alone.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.hr_discord_gift_claims'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (user_id)' then
    raise exception 'discord-gift §8 k3: the once-row key is % — it must be the account (user_id) alone', v_def; end if;
  -- k4 the gate admits the bucket and the wrapper calls it before the inner.
  select replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '') into v_def;
  if position('when ''hr_claim_discord_gift'' then v_limit := 6;' in v_def) = 0 then
    raise exception 'discord-gift §8 k4: hr_rpc_gate does not admit hr_claim_discord_gift at 6'; end if;
  -- ...and the restatement is the pinned pre-image plus that one line, nothing dropped.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = 'public.hr_rpc_gate(text)'::regprocedure) <> '8b22c008ce0f586b83c8da6f5c3aad4c' then
    raise exception 'discord-gift §8 k4: the restated hr_rpc_gate is not the pinned body (a bucket moved or was dropped)'; end if;
  -- k5 no amount crosses: the claim takes exactly (integer, text).
  if exists (select 1 from pg_proc where proname = 'hr_claim_discord_gift'
              and pg_get_function_identity_arguments(oid) <> 'p_slot integer, p_code text') then
    raise exception 'discord-gift §8 k5: hr_claim_discord_gift grew an argument'; end if;

  begin
    insert into auth.users (id) values (v_uid), (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version) values
      (v_uid, 0, 0, 3, 1), (v_uid, 1, 0, 0, 1), (v_two, 0, 0, 0, 1)
      on conflict (user_id, slot) do nothing;
    perform public.hr_discord_code_rotate('selfchk-one');

    -- v1 not signed in.
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_claim_discord_gift__ungated(0, 'SELFCHKONE');
    if v->>'error' is distinct from 'not_signed_in' then raise exception 'discord-gift §8 v1: %', v; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    -- v2 wrong code, bad slot, someone else's slot: refused, nothing paid.
    v := public.hr_claim_discord_gift__ungated(0, 'NOTTHECODE');
    if v->>'error' is distinct from 'wrong_code' then raise exception 'discord-gift §8 v2 wrong: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(0, 'x');
    if v->>'error' is distinct from 'wrong_code' then raise exception 'discord-gift §8 v2 shape: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(0, repeat('-', 60) || 'SELFCHKONE');
    if v->>'error' is distinct from 'wrong_code' then raise exception 'discord-gift §8 v2 length: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(9, 'SELFCHKONE');
    if v->>'error' is distinct from 'bad_slot' then raise exception 'discord-gift §8 v2 slot: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(2, 'SELFCHKONE');
    if v->>'error' is distinct from 'no_character' then raise exception 'discord-gift §8 v2 char: %', v; end if;

    -- v3 the right code (typed loosely) pays the server constant once, into the named character.
    select gems into v_g0 from public.player_state where user_id = v_uid and slot = 1;
    v := public.hr_claim_discord_gift__ungated(1, ' selfchk-ONE ');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'discord-gift §8 v3: the right code did not pay: %', v; end if;
    select gems into v_g1 from public.player_state where user_id = v_uid and slot = 1;
    if v_g1 - v_g0 <> 50 or (v->>'gems')::int <> 50 or (v->>'balance')::bigint <> v_g1 then
      raise exception 'discord-gift §8 v3: paid % (answered %), expected 50', v_g1 - v_g0, v; end if;
    if (select gems from public.player_state where user_id = v_uid and slot = 0) <> 3 then
      raise exception 'discord-gift §8 v3: a character that did not claim was paid'; end if;

    -- v4 ONCE PER ACCOUNT: the same character, then ANOTHER character of the same account.
    v := public.hr_claim_discord_gift__ungated(1, 'SELFCHKONE');
    if v->>'error' is distinct from 'already_claimed' then raise exception 'discord-gift §8 v4 replay: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(0, 'SELFCHKONE');
    if v->>'error' is distinct from 'already_claimed' then
      raise exception 'discord-gift §8 v4: a second character of the same account was not refused: %', v; end if;
    if (select gems from public.player_state where user_id = v_uid and slot = 0) <> 3
       or (select gems from public.player_state where user_id = v_uid and slot = 1) <> v_g1 then
      raise exception 'discord-gift §8 v4: a refused claim moved gems'; end if;

    -- v5 journalled: exactly one ledger row, signed +50 in meta.gems, no inflow claimed.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'discord_gift' and slot = 1
       and (meta->>'gems')::int = 50 and gold = 0 and gems_in = 0;
    if v_n <> 1 or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'discord_gift') <> 1 then
      raise exception 'discord-gift §8 v5: expected one discord_gift ledger row, found %', v_n; end if;

    -- v6 rotation: the old code is dead (code_expired), the new one pays another account.
    perform public.hr_discord_code_rotate('SELFCHK-TWO');
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    v := public.hr_claim_discord_gift__ungated(0, 'SELFCHKONE');
    if v->>'error' is distinct from 'code_expired' then raise exception 'discord-gift §8 v6 rotated: %', v; end if;
    v := public.hr_claim_discord_gift__ungated(0, 'selfchktwo');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'discord-gift §8 v6 new code: %', v; end if;
    if (select count(*) from public.hr_discord_codes where active) <> 1 then
      raise exception 'discord-gift §8 v6: more than one active code'; end if;
    begin
      perform public.hr_discord_code_rotate('SELFCHKONE');
      raise exception 'discord-gift §8 v6: a retired code was re-activated';
    exception when raise_exception then
      if sqlerrm like 'discord-gift §8%' then raise; end if;
    end;

    -- v7 the wrapper is gated: the seventh call in a minute is rate_limited.
    for v_n in 1..7 loop v := public.hr_claim_discord_gift(0, 'SELFCHKTWO'); end loop;
    if v->>'error' is distinct from 'rate_limited' then
      raise exception 'discord-gift §8 v7: seven calls in a minute were not rate limited: %', v; end if;

    raise exception using errcode = 'HR8DC', message = 'discord-gift §8 complete — rolling back';
  exception when sqlstate 'HR8DC' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_two))
     or exists (select 1 from public.hr_discord_gift_claims where user_id in (v_uid, v_two))
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
  raise notice 'discord-gift §8: grants, tables, account-keyed once-row, gate, wrong/rotated refused, '
               'one gift per account, journalled, rate limited — all green';
end $mig$;
