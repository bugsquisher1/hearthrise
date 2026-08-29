-- ============================================================
-- Hearthrise — migration 2026-08-29 · RPC-GATE BUCKET RESTORE (hotfix, applied live 2026-08-29)
--
-- ROOT CAUSE (the b484–b487 "everything refuses" wave): hr_rpc_gate's case list
-- was maintained two incompatible ways — some migrations SPLICED their bucket in
-- (2026-08-23-trait-buy: hr_trait_buy 12/min · 2026-08-23-modal-goal-claims:
-- hr_claim_goal 12/min + hr_goal_state 120/min · 2026-08-24-combat-style:
-- hr_set_style 30/min · 2026-08-28-client-state: client_state_put 60/min), while
-- others FULLY REPLACED the function from a template. 2026-08-30-bounty-kill-credit
-- replaced it from a STALE template, silently dropping every spliced bucket. An
-- unlisted bucket hits `else return false` = refused 100% of the time as
-- "rate_limited" — with ZERO telemetry, because the else branch returns before
-- any counter or rejection is recorded.
--
-- Player-visible fallout (all reported live, 2026-08-25 → 2026-08-29):
--   · Auto-Eat purchase → "slow down a moment, then try again"   (hr_trait_buy)
--   · combat styles snapping back to weapon default              (hr_set_style)
--   · quest/daily reward claims dead                             (hr_claim_goal)
--   · quest state stale                                          (hr_goal_state)
--   · EVERY residue save refused → "Reconnecting…", reload
--     resets (companion XP, homestead tier …), homestead builds
--     refused downstream via prereq_property_tier                (client_state_put)
--
-- THE FIX: one full replacement carrying the UNION of every bucket, at each
-- bucket's original intended limit.
--
-- THE CLASS-KILL: tests/rpc-gate-bucket-guard.mjs replays the full migration
-- chain and asserts every bucket any function passes to hr_rpc_gate is admitted
-- by the FINAL gate definition. Any future template-replacement that drops a
-- bucket fails the build instead of silently freezing live verbs.
--
-- RULE GOING FORWARD (enforced by the guard): a migration adding a gate bucket
-- must ADD it to the latest full definition and re-state the WHOLE list; a
-- migration touching hr_rpc_gate for any other reason must copy the CURRENT
-- production definition, never an old template.
-- ============================================================

create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $function$
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

-- Self-check: every restored bucket is present in the definition.
do $$
declare
  v_def text := pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure);
  v_bad text := '';
begin
  if position('hr_trait_buy'     in v_def) = 0 then v_bad := v_bad || ' hr_trait_buy'; end if;
  if position('hr_set_style'     in v_def) = 0 then v_bad := v_bad || ' hr_set_style'; end if;
  if position('hr_claim_goal'    in v_def) = 0 then v_bad := v_bad || ' hr_claim_goal'; end if;
  if position('hr_goal_state'    in v_def) = 0 then v_bad := v_bad || ' hr_goal_state'; end if;
  if position('client_state_put' in v_def) = 0 then v_bad := v_bad || ' client_state_put'; end if;
  if v_bad <> '' then
    raise exception 'rpc-gate-bucket-restore self-check FAILED:%', v_bad;
  end if;
end $$;
