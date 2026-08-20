-- 2026-08-23-bounty.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply — this is a MONEY SURFACE (it credits
--   server-owned gold AND the new Bounty Marks currency). The Coordinator applies
--   it by hand via the curl-from-file path as part of a coordinated deploy. Read
--   the change contract in the PR body before applying.
--
--   APPLY AFTER: 2026-08-23-bounty-monsters.generated.sql (the tier catalogue),
--   which must be applied FIRST (§1 fails closed if it is absent).
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- A Bounty Hunter turn-in (src/legacy.js completeBounty) pays GOLD + Bounty
-- MARKS and is KILL-DRIVEN. Neither was server-owned, so b411 DEFERRED the whole
-- turn-in (it no-ops under the gold arm). Marks had no server column at all
-- (gold-sites.js B.MARKS_COLUMN). This migration is the real fix for the
-- KILL-COUNT bounty (type 'cull'): the currency column + TWO SECURITY DEFINER
-- RPCs that own the target, the reward, and the kill baseline.
--
-- ── THE ACCEPT/CLAIM SPLIT — WHY BASELINING NEEDS AN ACCEPT STEP ────────────
-- A bounty is FREE-CHOICE: the player picks one of three client-generated
-- offers. The board is seeded but its state lives on the client, so the server
-- cannot know what was offered without being told, and — the crux — a bounty
-- must require NEW kills since it was accepted, not credit the pre-existing
-- bestiary count (2026-08-20-bestiary.sql: player_progress kind='stat'
-- key='ev:kill_monster:<id>', a LIFETIME counter). So:
--
--   hr_accept_bounty  SNAPSHOTS the target's current lifetime kill count as the
--                     baseline into public.active_bounty (one row per character),
--                     and re-derives tier+reward+required-count server-side. The
--                     client value it trusts is only the target id, the type, the
--                     difficulty and a proposed required (which it CLAMPS to the
--                     server's own range). The reward NEVER crosses the wire.
--   hr_claim_bounty   reads the target's CURRENT count, subtracts the stored
--                     baseline, and pays only if (current - baseline) >= required.
--                     The active_bounty row IS the once-guard: the claim deletes
--                     it under a row lock, so a replay finds no row and cannot
--                     re-credit, and a concurrent double-claim serialises on the
--                     FOR UPDATE and the second sees it gone.
--
-- ── THE REWARD + TIER ARE SERVER-AUTHORITATIVE ─────────────────────────────
-- tier := public.hr_bounty_monsters(target) (generated from src/data/monsters.js).
-- reward := base(tier) × difficulty-mult, with the 'cull' type multiplier (which
-- is identity {gold:1,marks:1,xp:1}) — the exact src/core/bounty.js bountyRewards
-- math, embedded here and bound to the source by tests/bounty-drift.mjs. required
-- is clamped to BOUNTY_KILL_COUNTS.cull[tier]. The tier is gated by the SERVER
-- combat level (player_skills → hr_lb_combat_level → unlockedTier), so a level-1
-- character cannot accept a tier-6 bounty and a tier-6 character cannot target a
-- tier-1 goblin for tier-6 pay.
--
-- ── SCOPE: 'cull' ONLY (deliberate, documented) ────────────────────────────
-- The board generates four types; only ONE is server-verifiable from kill counts
-- and is wired here:
--   cull   — kill N of monster X. VERIFIABLE (this migration).
--   proof  — collect N drop items. Loot IS counted server-side (ev:loot:<id>) but
--            the client CONSUMES the items on turn-in, and item inventory is not
--            yet server-owned; a loot-count-vs-consume ruling is needed. DEFERRED.
--   weapon — kill N with a given weapon type equipped. The sim does not track the
--            weapon held AT a kill. NOT server-verifiable. DEFERRED.
--   streak — kill N in a row without dying. The sim tracks no death-streak. NOT
--            server-verifiable. DEFERRED.
-- hr_accept_bounty REFUSES any type but 'cull' (error type_not_server_verifiable),
-- so the client only routes cull turn-ins through the server; the rest keep their
-- existing client behaviour.
--
-- ── GOLD + MARKS, OUT OF THE ACCRUAL BUDGET ────────────────────────────────
-- Like the muster/raid/collection/renown credits, gold_in/gems_in on the ledger
-- row are ZERO and explicit: the reward is not accrual inflow, the once-per-
-- accept guard is the real limiter. Bounty XP (BH level) stays CLIENT-applied for
-- now — it is a private, non-rankable gate on which bounty TYPES unlock, not a
-- value that crosses to another player; hr_claim_bounty returns xp for display.
--
-- REVERSIBILITY: drop hr_claim_bounty/__ungated, hr_accept_bounty/__ungated,
-- the helper functions, and public.active_bounty; re-apply the prior hr_rpc_gate
-- body. player_state.marks and hr_bounty_monsters are additive and harmless to
-- leave. Additive overall.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_skills')   is null then raise exception 'player_skills missing'; end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception 'hr_bounty_monsters missing — apply 2026-08-23-bounty-monsters.generated.sql first';
  end if;
  if to_regprocedure('public.hr_lb_combat_level(int,int,int,int,int,int,int)') is null then
    raise exception 'hr_lb_combat_level not found';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp not found';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate not found — apply 2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
end $$;

-- ── 2. player_state.marks — the Bounty Marks currency (additive, gold-shaped) ─
alter table public.player_state add column if not exists marks bigint not null default 0;

-- ── 3. player_ledger.kind gains 'bounty' (additive, idempotent) ─────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''bounty''%'
  ) then
    alter table public.player_ledger drop constraint if exists player_ledger_kind_check;
    alter table public.player_ledger add constraint player_ledger_kind_check
      check (kind = any (array['accrue','craft','gather','combat','farm','trade','shop',
                               'quest','equip','admin','iap','clan','raid','enchant','daily',
                               'collection','renown','bounty']));
  end if;
end $$;

-- ── 4. active_bounty — one server-owned active bounty per character ──────────
-- Written ONLY by the RPCs below. SELECT-own for the client to render its active
-- bounty; NO client write policy and NO client write grant (asserted in §self).
create table if not exists public.active_bounty (
  user_id      uuid not null references auth.users(id) on delete cascade,
  slot         int  not null default 0,
  bounty_id    text not null,
  b_type       text not null,
  difficulty   text not null,
  target       text not null,
  tier         int  not null,
  required     bigint not null,
  baseline     bigint not null,
  gold_reward  bigint not null,
  marks_reward int  not null,
  xp_reward    int  not null,
  accepted_at  timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.active_bounty enable row level security;
drop policy if exists active_bounty_sel on public.active_bounty;
create policy active_bounty_sel on public.active_bounty for select using (user_id = auth.uid());
-- revoke ALL (Supabase's default ACL also carries REFERENCES/TRIGGER/TRUNCATE, which
-- a DML-only revoke leaves behind — §self GATE(b) counts any non-SELECT grant), then
-- re-grant SELECT so RLS is the only thing that decides a read.
revoke all on public.active_bounty from anon, authenticated, service_role;
grant select on public.active_bounty to authenticated, service_role;

-- ── 5. Reward + count helpers — the src/core/bounty.js tables, in SQL ───────
-- bountyRewards(tier,'cull',difficulty): the 'cull' type multiplier is identity,
-- so reward = base(tier) × difficulty-mult with the SAME rounding as the JS.
-- Bound to src/core/bounty.js by tests/bounty-drift.mjs.
create or replace function public.hr_bounty_reward(p_tier int, p_type text, p_difficulty text)
returns table(gold bigint, marks int, xp int)
language sql immutable set search_path = public, pg_catalog as $$
  select
    (round((bg::numeric * dm) / 10) * 10)::bigint            as gold,
    greatest(1, round(bm::numeric * dm))::int                as marks,
    round(bx::numeric * dm)::int                             as xp
  from (
    select
      case p_tier when 1 then 320   when 2 then 800   when 3 then 1600
                  when 4 then 3200  when 5 then 6500  when 6 then 13000 end as bg,
      case p_tier when 1 then 6     when 2 then 11    when 3 then 18
                  when 4 then 30    when 5 then 48    when 6 then 78 end    as bm,
      case p_tier when 1 then 45    when 2 then 95    when 3 then 180
                  when 4 then 340   when 5 then 620   when 6 then 1100 end  as bx,
      case p_difficulty when 'easy' then 0.85 when 'normal' then 1.0
                        when 'hard' then 1.3  when 'elite'  then 1.75 end   as dm
  ) s;
$$;

-- BOUNTY_KILL_COUNTS.cull[tier] clamp range (weapon/proof/streak not accepted).
create or replace function public.hr_bounty_kill_range(p_tier int)
returns table(kmin bigint, kmax bigint)
language sql immutable set search_path = public, pg_catalog as $$
  select
    case p_tier when 1 then 80 when 2 then 75 when 3 then 70
                when 4 then 60 when 5 then 55 when 6 then 50 end::bigint,
    case p_tier when 1 then 120 when 2 then 110 when 3 then 100
                when 4 then 90  when 5 then 80  when 6 then 70 end::bigint;
$$;

-- unlockedTier(combatLevel) — src/core/bounty.js.
create or replace function public.hr_bounty_unlocked_tier(p_cl int)
returns int language sql immutable set search_path = public, pg_catalog as $$
  select case
    when coalesce(p_cl,0) >= 70 then 6 when coalesce(p_cl,0) >= 55 then 5
    when coalesce(p_cl,0) >= 40 then 4 when coalesce(p_cl,0) >= 25 then 3
    when coalesce(p_cl,0) >= 12 then 2 else 1 end;
$$;

-- Server combat level from the SERVER-OWNED player_skills (never a client value).
create or replace function public.hr_bounty_combat_level(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  select public.hr_lb_combat_level(
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='attack'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='defense'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='hitpoints'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='prayer'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=p_user and slot=p_slot and skill_id='magic'),0)));
$$;

-- Point read of the target's LIFETIME kill count (the bestiary counter).
create or replace function public.hr_bounty_kills(p_user uuid, p_slot int, p_target text)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce((select value from public.player_progress
                    where user_id=p_user and slot=p_slot and kind='stat'
                      and period_key='' and key = 'ev:kill_monster:'||p_target), 0)::bigint;
$$;

revoke execute on function public.hr_bounty_combat_level(uuid,int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_bounty_kills(uuid,int,text)    from public, anon, authenticated, service_role;

-- ── 6. hr_rpc_gate — add the two bounty buckets to the 12/min arm ───────────
-- Re-created from 2026-08-22-collection-claim.sql's body with 'hr_accept_bounty'
-- and 'hr_claim_bounty' appended to the 12-limit arm. Nothing else changes.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
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
         'clan_invites_list'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty'
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

-- ── 7. hr_accept_bounty__ungated — snapshot the baseline, own the reward ────
create or replace function public.hr_accept_bounty__ungated(
  p_slot int, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot     int := coalesce(p_slot, 0);
  v_tier     int;
  v_cl       int;
  v_maxtier  int;
  v_kmin     bigint; v_kmax bigint;
  v_req      bigint;
  v_gold     bigint; v_marks int; v_xp int;
  v_baseline bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  -- ONLY 'cull' is server-verifiable (see header). proof/weapon/streak refused.
  if p_type is distinct from 'cull' then
    return jsonb_build_object('ok', false, 'error', 'type_not_server_verifiable', 'type', p_type);
  end if;
  -- ⚠ 'elite' is REFUSED at the server (Security ruling 2026-08-23): elite is never
  -- board-generated and is gated only by the client-owned Bounty-Hunter level, so every
  -- 'elite' reaching the server is forged — and it scales tradeable gold up to 1.75×.
  -- Durable fix (tracked): server-own the difficulty (server-derived board seed OR
  -- server-owned BH level with difficulty<=unlocked). The easy/normal/hard residual
  -- (<=1.53x) is a bounded, self-only, journalled residual accepted with that follow-up.
  if p_difficulty not in ('easy','normal','hard') then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty', 'difficulty', p_difficulty);
  end if;

  select tier into v_tier from public.hr_bounty_monsters where monster_id = p_target;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- COMBAT-LEVEL GATE: the target's tier must be unlocked by the SERVER combat level.
  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);
  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);
  if v_tier > v_maxtier then
    return jsonb_build_object('ok', false, 'error', 'tier_locked',
      'tier', v_tier, 'unlocked_tier', v_maxtier, 'combat_level', v_cl);
  end if;

  select kmin, kmax into v_kmin, v_kmax from public.hr_bounty_kill_range(v_tier);
  v_req := least(v_kmax, greatest(v_kmin, coalesce(p_required, v_kmin)));

  select gold, marks, xp into v_gold, v_marks, v_xp
    from public.hr_bounty_reward(v_tier, 'cull', p_difficulty);

  v_baseline := public.hr_bounty_kills(auth.uid(), v_slot, p_target);

  -- Upsert: accepting a new bounty REPLACES any prior active one (and resets the
  -- baseline). One row per character; the client enforces "finish/abandon first".
  insert into public.active_bounty
    (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
     gold_reward, marks_reward, xp_reward, accepted_at)
  values
    (auth.uid(), v_slot, coalesce(p_bounty_id,''), 'cull', p_difficulty, p_target, v_tier, v_req,
     v_baseline, v_gold, v_marks, v_xp, now())
  on conflict (user_id, slot) do update set
    bounty_id=excluded.bounty_id, b_type=excluded.b_type, difficulty=excluded.difficulty,
    target=excluded.target, tier=excluded.tier, required=excluded.required,
    baseline=excluded.baseline, gold_reward=excluded.gold_reward,
    marks_reward=excluded.marks_reward, xp_reward=excluded.xp_reward, accepted_at=now();

  return jsonb_build_object('ok', true, 'bounty_id', coalesce(p_bounty_id,''),
    'target', p_target, 'tier', v_tier, 'required', v_req, 'baseline', v_baseline,
    'gold', v_gold, 'marks', v_marks, 'xp', v_xp, 'slot', v_slot);
end $$;

-- ── 8. hr_claim_bounty__ungated — verify new kills, credit once, journal ────
create or replace function public.hr_claim_bounty__ungated(p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot    int := coalesce(p_slot, 0);
  v_ab      public.active_bounty%rowtype;
  v_current bigint;
  v_progress bigint;
  v_rows    int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Lock the active row so a concurrent claim serialises here.
  select * into v_ab from public.active_bounty
    where user_id = auth.uid() and slot = v_slot for update;
  if v_ab.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_bounty', 'slot', v_slot);
  end if;

  -- NEW kills only: current lifetime count minus the accept-time baseline.
  v_current  := public.hr_bounty_kills(auth.uid(), v_slot, v_ab.target);
  v_progress := v_current - v_ab.baseline;
  if v_progress < v_ab.required then
    -- NOT complete: leave the bounty intact (no delete, no credit).
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'progress', greatest(0, v_progress), 'required', v_ab.required, 'target', v_ab.target);
  end if;

  -- CONSUME (once-guard): delete the active row under the lock we hold. A replay
  -- finds no row → no_active_bounty above → no second credit.
  delete from public.active_bounty where user_id = auth.uid() and slot = v_slot;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- CREDIT gold + marks (server-owned), same transaction as the consume.
  update public.player_state
     set gold  = coalesce(gold, 0)  + v_ab.gold_reward,
         marks = coalesce(marks, 0) + v_ab.marks_reward,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'bounty', 'bounty_turnin:' || v_ab.bounty_id,
     v_ab.gold_reward, 0, 0, 0, 0,
     jsonb_build_object('bounty_id', v_ab.bounty_id, 'target', v_ab.target,
       'tier', v_ab.tier, 'difficulty', v_ab.difficulty, 'required', v_ab.required,
       'baseline', v_ab.baseline, 'progress', v_progress,
       'marks', v_ab.marks_reward, 'xp', v_ab.xp_reward));

  return jsonb_build_object('ok', true, 'target', v_ab.target, 'gold', v_ab.gold_reward,
    'marks', v_ab.marks_reward, 'xp', v_ab.xp_reward, 'progress', v_progress,
    'slot', v_slot, 'credited', true);
end $$;

-- ── 9. Gated wrappers + grants (revoke before grant) ────────────────────────
create or replace function public.hr_accept_bounty(
  p_slot int, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_accept_bounty') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_accept_bounty__ungated($1, $2, $3, $4, $5, $6);
end $w$;

create or replace function public.hr_claim_bounty(p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_bounty') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_bounty__ungated($1);
end $w$;

revoke execute on function public.hr_accept_bounty__ungated(int,text,text,text,text,bigint) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_bounty__ungated(int)                              from public, anon, authenticated, service_role;
revoke execute on function public.hr_accept_bounty(int,text,text,text,text,bigint)           from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_bounty(int)                                       from public, anon, authenticated, service_role;
grant execute on function public.hr_accept_bounty(int,text,text,text,text,bigint) to authenticated;
grant execute on function public.hr_claim_bounty(int)                             to authenticated;

-- ── 9b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_accept_bounty','hr_claim_bounty') and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_accept_bounty', 'p_slot integer, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint', 'authenticated',
     'added 2026-08-23: server snapshots bounty kill baseline + owns reward (bounty)'),
    ('hr_claim_bounty', 'p_slot integer', 'authenticated',
     'added 2026-08-23: server-verified bounty turn-in gold+marks credit (bounty)');
end $$;

-- ── 10. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them; the apply is atomic so a
-- raise reverts everything. Row-writing probes live in an HR819-discarded subtxn.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000b0-0000-0000-0000-0000000000b0';
  v_slot constant int  := 0;
  v_t1   text; v_t6 text;
  v_g0 bigint; v_g1 bigint; v_m0 bigint; v_m1 bigint; v_led int; v_ab int;
begin
  -- (a) wrappers authenticated-only, inners revoked from clients.
  if to_regprocedure('public.hr_accept_bounty(int,text,text,text,text,bigint)') is null
     or to_regprocedure('public.hr_claim_bounty(int)') is null then
    raise exception 'GATE(a): a bounty wrapper did not install';
  end if;
  if has_function_privilege('authenticated','public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)','execute')
     or has_function_privilege('authenticated','public.hr_claim_bounty__ungated(int)','execute') then
    raise exception 'GATE(a): an __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated','public.hr_accept_bounty(int,text,text,text,text,bigint)','execute')
     or not has_function_privilege('authenticated','public.hr_claim_bounty(int)','execute') then
    raise exception 'GATE(a): a wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon','public.hr_claim_bounty(int)','execute') then
    raise exception 'GATE(a): the claim wrapper is anon-executable';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on active_bounty (the baseline is unforgeable).
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='active_bounty' and cmd <> 'SELECT') then
    raise exception 'GATE(b): active_bounty grew a non-SELECT policy — the baseline is client-forgeable';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='active_bounty'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on active_bounty — the baseline is client-forgeable';
  end if;
  -- ...and none on player_progress (the kill counter itself).
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_progress'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_progress — the kill count is client-forgeable';
  end if;

  -- (c) REWARD math matches src/core/bounty.js bountyRewards for a spot value.
  --     tier1 hard cull: gold round(320*1.3/10)*10=420, marks round(6*1.3)=8, xp round(45*1.3)=59.
  select gold, marks, xp into v_g0, v_m0, v_led from public.hr_bounty_reward(1, 'cull', 'hard');
  if v_g0 <> 420 or v_m0 <> 8 or v_led <> 59 then
    raise exception 'GATE(c): tier1 hard cull reward drift: gold=% marks=% xp=% (expected 420/8/59)', v_g0, v_m0, v_led;
  end if;

  -- (d) EXECUTED behaviour: baseline excludes pre-existing kills, credit-once,
  --     replay-zero, tier gate. Discarded subtxn → zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 1000, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, marks = 0;
    -- combat level high enough that every tier unlocks (attack/strength/etc = 99).
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431 from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict do nothing;

    select monster_id into v_t1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    select monster_id into v_t6 from public.hr_bounty_monsters where tier = 6 order by monster_id limit 1;

    -- non-cull refused.
    v := public.hr_accept_bounty__ungated(v_slot, 'b1', v_t1, 'streak', 'normal', 40);
    if v->>'error' <> 'type_not_server_verifiable' then raise exception 'GATE(d): non-cull accepted: %', v; end if;
    -- 'elite' difficulty refused server-side (Security ruling 2026-08-23): never board-generated,
    -- gated only by client BH level, scales tradeable gold 1.75x → every elite is forged.
    v := public.hr_accept_bounty__ungated(v_slot, 'b1', v_t1, 'cull', 'elite', 40);
    if v->>'error' <> 'bad_difficulty' then raise exception 'GATE(d): elite difficulty accepted: %', v; end if;
    -- unknown monster refused.
    v := public.hr_accept_bounty__ungated(v_slot, 'b1', 'no_such_mon', 'cull', 'normal', 40);
    if v->>'error' <> 'unknown_monster' then raise exception 'GATE(d): unknown monster accepted: %', v; end if;

    -- PRE-EXISTING kills before accept must NOT count. Seed 500 kills of the target FIRST.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:'||v_t1, 500, '', 'active');

    v := public.hr_accept_bounty__ungated(v_slot, 'b1', v_t1, 'cull', 'easy', 999);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): cull accept failed: %', v; end if;
    if (v->>'baseline')::bigint <> 500 then raise exception 'GATE(d): baseline was % (expected 500)', v->>'baseline'; end if;
    -- required clamped into tier1 range [80,120] from the absurd 999.
    if (v->>'required')::bigint <> 120 then raise exception 'GATE(d): required not clamped: %', v->>'required'; end if;

    -- Claim with ZERO new kills → incomplete (the 500 pre-existing don't count).
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'incomplete' or (v->>'progress')::bigint <> 0 then
      raise exception 'GATE(d): pre-existing kills leaked into progress: %', v;
    end if;

    -- Add exactly `required` NEW kills (500 -> 620), then claim → credits once.
    update public.player_progress set value = 620
      where user_id=v_uid and slot=v_slot and key='ev:kill_monster:'||v_t1;
    select gold, marks into v_g0, v_m0 from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_claim_bounty__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(d): met bounty did not credit: %', v;
    end if;
    select gold, marks into v_g1, v_m1 from public.player_state where user_id=v_uid and slot=v_slot;
    -- tier1 easy cull: gold round(320*0.85/10)*10=270, marks max(1,round(6*0.85))=5.
    if v_g1 - v_g0 <> 270 then raise exception 'GATE(d): gold credit was % (expected 270)', v_g1 - v_g0; end if;
    if v_m1 - v_m0 <> 5 then raise exception 'GATE(d): marks credit was % (expected 5)', v_m1 - v_m0; end if;

    -- replay → no_active_bounty, no re-credit.
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'no_active_bounty' then raise exception 'GATE(d): replay not refused: %', v; end if;
    select gold into v_g0 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g0 <> v_g1 then raise exception 'GATE(d): replay RE-CREDITED (% -> %)', v_g1, v_g0; end if;

    -- exactly one bounty ledger row, and the active row is gone.
    select count(*) into v_led from public.player_ledger where user_id=v_uid and kind='bounty';
    if v_led <> 1 then raise exception 'GATE(d): expected 1 bounty ledger row, found %', v_led; end if;
    select count(*) into v_ab from public.active_bounty where user_id=v_uid;
    if v_ab <> 0 then raise exception 'GATE(d): active_bounty row leaked after claim'; end if;

    -- tier gate: drop combat skills to 1, a tier-6 bounty is locked.
    delete from public.player_skills where user_id=v_uid and slot=v_slot;
    v := public.hr_accept_bounty__ungated(v_slot, 'b6', v_t6, 'cull', 'normal', 60);
    if v->>'error' <> 'tier_locked' then raise exception 'GATE(d): tier-6 bounty not gated at combat level 1: %', v; end if;

    raise exception using errcode = 'HR819', message = 'bounty §10 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.active_bounty   where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §10 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(e): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(e): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'bounty: marks column, active_bounty (no client write), reward math, baseline excludes '
               'pre-existing kills, credit-once gold+marks, replay-safe, tier gate, grant-hygiene all green';
end $$;
