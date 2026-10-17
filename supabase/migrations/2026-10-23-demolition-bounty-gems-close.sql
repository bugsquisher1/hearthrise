-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-23-demolition-bounty-gems-close.sql — the bounty board's client RPCs
-- go, and the ONE gem credit refuses (BETA_PLAN K4 + K37, P0 deletion set).
--
-- K4. The bounty board was demolished (D2: src/core/bounty.js, the board, the
--     Bounty Hunter skill and its shop are gone), but production still serves
--     three client RPCs that pay or spend on it: hr_accept_bounty (fixes a gold
--     + Marks reward and a required-kill count), hr_claim_bounty (pays gold and
--     bountyHunter XP on turn-in) and hr_bounty_spend (the reroll / abandon fee).
--     A caller with devtools reaches all three. They are DROPPED with their
--     __ungated bodies and their hr_client_rpc_baseline rows. The read-only
--     helpers stay: hr_bounty_kills is read by hr_state_of, hr_bounty_combat_level
--     by hr_hunt_gate (§0 proves nothing else calls a dropped body). The tables
--     (active_bounty, hr_bounty_monsters, hr_bounty_board_monsters) are left
--     for the M1/M2 table drops; with no writer they are inert.
--
-- K37. Gems are OUT of the beta (BETA_PLAN §2: monetization post-beta, every
--     gem item hidden). Every gem MINT in this database funnels through ONE
--     function, hr_wallet_credit (2026-10-19-account-wallet.sql: "THE ONLY GEM
--     CREDIT"): hr_apply's engine gem arm, the start kit, the Discord gift,
--     milestones, ranks, raid and world-event claims. It is restated to REFUSE
--     (HR000 'gems_retired') before it reads or writes anything, so each of
--     those callers' transactions rolls back whole (the 10-19 contract: the
--     credit "raises, never returns, so a capped claim is not half-paid").
--     Measured on production 2026-10-17: 0 wallets hold gems, 0 grant rows,
--     the start kit pays 0 gems and 0 Hearth Tokens, 0 hearth_token stacks,
--     and the engine (supabase/functions/hr-accrue) never proposes `gems`.
--     The Hearth Token has no mint at all (hr_start_kit and account_wallet
--     CHECK hearth_tokens = 0; §4 (e) proves no grant source names the item).
--     The gem SINKS (hr_wallet_debit, hr_buy_gem_unlock) are left: with no gem
--     anywhere they can only refuse. Re-opening gems is a new migration that
--     restates the 10-19 body; nothing here is lost (it is in the chain).
--
-- ORDER: the LAST of the 2026-10-23 demolition files (after hero-slots-gold).
-- It moves no catalogue and depends on none; it only needs the 10-19 wallet and
-- the bounty RPCs it drops (both absent is a no-op re-apply).
-- REVERSIBILITY: the bounty bodies are in 2026-10-04-bounty-abandon-server-fee.sql
-- and earlier (re-apply restores them; baseline rows by hand); the wallet body
-- by re-running its 10-19 restatement. The beta is wiped at cutover.
-- After apply (Coordinator): live-hash-drift --live --write (hr_wallet_credit
-- moves; the six bounty bodies leave the baseline as DROPPED).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ──────────────────────────────────────────────────────
do $mig$
declare v_readers text;
begin
  if to_regprocedure('public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)') is null then
    raise exception 'bounty-gems-close: hr_wallet_credit (2026-10-19-account-wallet.sql) is missing';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'bounty-gems-close: hr_reject / hr_client_rpc_baseline / hr_assert_grant_hygiene missing';
  end if;
  -- Fail closed: no body outside the dropped set may still CALL a dropped one.
  select string_agg(distinct p.oid::regprocedure::text || ' -> ' || o.obj, '; ')
    into v_readers
    from pg_proc p,
         unnest(array['hr_accept_bounty', 'hr_accept_bounty__ungated', 'hr_claim_bounty',
                      'hr_claim_bounty__ungated', 'hr_bounty_spend', 'hr_bounty_spend__ungated']) o(obj)
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('hr_accept_bounty', 'hr_accept_bounty__ungated', 'hr_claim_bounty',
                           'hr_claim_bounty__ungated', 'hr_bounty_spend', 'hr_bounty_spend__ungated')
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
         ~ ('\m' || o.obj || '\s*\(');
  if v_readers is not null then
    raise exception 'bounty-gems-close: a dropped bounty RPC is still called by % — that caller must go first', v_readers;
  end if;
end $mig$;

-- ── §1 K37: THE ONLY GEM CREDIT REFUSES ───────────────────────────────────
-- Same signature, same owner-only grants (10-19 §3b). The body raises before
-- it touches account_wallet, account_gem_grants or player_ledger.
create or replace function public.hr_wallet_credit(
  p_uid uuid, p_slot integer, p_gems bigint, p_key text, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gems are out of the beta (BETA_PLAN §2, K37). Every gem mint funnels
  -- here, so every one of them is refused, and its caller rolls back whole.
  perform public.hr_reject('gems_retired',
    jsonb_build_object('gems', p_gems, 'key', p_key, 'why', 'gems are not in the game'));
  return null;
end;
$$;
revoke execute on function public.hr_wallet_credit(uuid, integer, bigint, text, timestamp with time zone)
  from public, anon, authenticated, service_role;

-- ── §2 K4: THE BOUNTY RPCs GO ─────────────────────────────────────────────
drop function if exists public.hr_accept_bounty(integer, text, text, text, text, bigint);
drop function if exists public.hr_accept_bounty__ungated(integer, text, text, text, text, bigint);
drop function if exists public.hr_claim_bounty(integer);
drop function if exists public.hr_claim_bounty__ungated(integer);
drop function if exists public.hr_bounty_spend(integer, text, text, uuid);
drop function if exists public.hr_bounty_spend__ungated(integer, text, text, uuid);
delete from public.hr_client_rpc_baseline
 where proname in ('hr_accept_bounty', 'hr_claim_bounty', 'hr_bounty_spend');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ────────────────
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000b0c37';
  v_f    text;
  v_role text;
  v_msg  text;
  v_h    jsonb;
  v_bad  bigint;
  v_refused boolean := false;
begin
  -- (a) THE BOUNTY RPCs ARE GONE, AND THE HELPERS LIVE READERS NEED STAY.
  foreach v_f in array array['public.hr_accept_bounty(integer,text,text,text,text,bigint)',
      'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)',
      'public.hr_claim_bounty(integer)', 'public.hr_claim_bounty__ungated(integer)',
      'public.hr_bounty_spend(integer,text,text,uuid)', 'public.hr_bounty_spend__ungated(integer,text,text,uuid)'] loop
    if to_regprocedure(v_f) is not null then raise exception 'GATE(a): % survived', v_f; end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and p.proname in ('hr_accept_bounty', 'hr_accept_bounty__ungated', 'hr_claim_bounty',
                                 'hr_claim_bounty__ungated', 'hr_bounty_spend', 'hr_bounty_spend__ungated')) then
    raise exception 'GATE(a): an overload of a dropped bounty RPC survived'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline
              where proname in ('hr_accept_bounty', 'hr_claim_bounty', 'hr_bounty_spend')) then
    raise exception 'GATE(a): a dropped bounty RPC is still on the client baseline'; end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'GATE(a): hr_state_of is missing'; end if;
  if pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure) ~ '\mhr_bounty_kills\s*\('
     and to_regprocedure('public.hr_bounty_kills(uuid,integer,text)') is null then
    raise exception 'GATE(a): hr_state_of reads hr_bounty_kills, which is gone'; end if;
  -- No client-executable function on the bounty board is left at all.
  select count(*) into v_bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname ~ 'bount'
     and (has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad > 0 then raise exception 'GATE(a): % bounty function(s) are still client-executable', v_bad; end if;

  -- (b) THE GEM CREDIT IS OWNER-ONLY AND WRITES NOTHING.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)', 'execute') then
      raise exception 'GATE(b): % can execute hr_wallet_credit', v_role; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', 'public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)', 'execute') then
    raise exception 'GATE(b): hr_engine can execute hr_wallet_credit directly'; end if;

  -- (c) EXECUTED: a credit is refused gems_retired, and nothing lands.
  begin
    perform public.hr_wallet_credit(v_uid, 0, 1, 'k37:probe', null);
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'gems_retired' then raise exception 'GATE(c): refused %, expected gems_retired', v_msg; end if;
    v_refused := true;
  end;
  if not v_refused then raise exception 'GATE(c): hr_wallet_credit paid a gem'; end if;
  if exists (select 1 from public.account_gem_grants where user_id = v_uid)
     or exists (select 1 from public.account_wallet where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception 'GATE(c): the refused credit LEAKED a row'; end if;

  -- (d) THE START KIT MINTS NO GEM AND NO HEARTH TOKEN.
  if to_regclass('public.hr_start_kit') is not null
     and exists (select 1 from public.hr_start_kit where coalesce(gems, 0) <> 0 or coalesce(hearth_tokens, 0) <> 0) then
    raise exception 'GATE(d): the start kit pays gems or Hearth Tokens'; end if;

  -- (e) NO GRANT SOURCE NAMES THE HEARTH TOKEN (it has no mint; keep it so).
  select count(*) into v_bad from (
    select k as id from public.hr_quest_rewards q, jsonb_object_keys(coalesce(q.items, '{}'::jsonb)) k
    union all
    select k from public.hr_hunt_kill_bounds b, jsonb_object_keys(coalesce(b.drops, '{}'::jsonb)) k
    union all
    select item_id from public.hr_dungeon_loot
    union all
    select item_id from public.hr_qm_offers
    union all
    select item_id from public.hr_start_inventory
    union all
    select k from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r),
                  jsonb_object_keys(coalesce(d.r->'items', '{}'::jsonb) || coalesce(d.r->'keys', '{}'::jsonb)) k
  ) src where src.id = 'hearth_token';
  if v_bad > 0 then raise exception 'GATE(e): % grant source(s) name hearth_token', v_bad; end if;

  -- (y) THE DETECTOR IS GREEN.
  v_h := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
    raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;

  raise notice 'demolition-bounty-gems-close: the six bounty RPCs and their baseline rows are gone (helpers kept); '
               'hr_wallet_credit refuses gems_retired and writes nothing; no kit or grant source mints a gem or a '
               'Hearth Token; grant hygiene green.';
end $$;
