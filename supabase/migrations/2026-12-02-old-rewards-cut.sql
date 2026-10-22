-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE OLD-CLIENT REWARD CUT (lane c-cuts-1022, systems-engineer,
-- 2026-10-22). STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2),
-- one file via tools/apply-migration.mjs, never inside begin/commit, never
-- 00:00–00:10 UTC. It SHRINKS the surface Security reviews at the reopen gate.
--
-- THE RULING (Tyler, 2026-10-22, "do it all"; and "I'm not even sure how the
-- milestone stuff got into the game, we were supposed to delete all that"):
-- CUT every old-client reward table the rebuilt client cannot claim, and CUT
-- the Fox Companion. Rewards come back only as a deliberate new design. The
-- client rows (src/data/goal-catalogue.js, collection-milestones.js,
-- rewards.js) left in the same lane; no screen in the rebuilt client calls
-- any RPC dropped here (grep: src/** names none of them).
--
-- §1 DROPPED — every one a door the old client used and nothing calls now:
--    QUESTS        hr_claim_quest + __ungated, hr_quest_rewards_items_ok and the
--                  table hr_quest_rewards (its 11 rows: 8 graded on counters no
--                  rebuilt screen moves, 3 doubling the hunt tutorial cards).
--    MILESTONES    hr_claim_milestone + __ungated (hunter*/collect*).
--    RENOWN RANKS  hr_claim_rank + __ungated (the old Renown screen's claim; up
--                  to 1,000,000 gold a rank against a score no screen shows).
--    DAILY/WEEKLY  hr_claim_daily + __ungated, hr_tally_state (the goal board's
--                  read), hr_daily_task_set, hr_daily_task_set_for,
--                  hr_daily_task_set_caps, hr_daily_task_eligible,
--                  hr_goal_daily_seed, hr_daily_harvest_ready,
--                  hr_daily_harvest_rule, hr_goal_period_start, hr_iso_week_key
--                  (hr_claim_goal / hr_goal_rewards went in 2026-10-16).
--    LOGIN CYCLE   the old seven-day cycle's pricing: hr_claim_lookup,
--                  hr_login_bonus_ready, hr_login_streak, hr_claim_last,
--                  hr_login_price, hr_login_catalogue.
--    Callers checked on the full replay (a body that names a dropped function
--    fails only when it runs): every dropped function is called only by another
--    dropped one, except hr_claim_lookup / hr_collection_of, which
--    hr_assert_grant_hygiene names as TEXT in its engine allowlist (a name
--    compared with `<> all`, never cast), and hr_rpc_gate's bucket CASE, which
--    names the claim verbs as strings. Neither is a call.
-- §2 THE CLIENT SURFACE: the four authenticated baseline rows of the dropped
--    claim RPCs and hr_tally_state's leave hr_client_rpc_baseline.
-- §3 THE FOX COMPANION: the item and the companion equip slot left hr_items /
--    hr_item_slots / hr_equip_slots with 2026-11-22-loot-catalogue.generated.sql
--    (regenerated from the data). A held fox is deleted from every place an item
--    can rest (bag, worn, account bank, hunt bag, market listing, clan store,
--    item rules) and each deletion is journalled (one `admin` ledger row per
--    character row, `withdraw` in clan_ledger for a clan store). No refund: it
--    was never on sale. A fox in an OPEN market buy offer would carry escrowed
--    gold, so this file REFUSES rather than guess a refund (none can exist: the
--    market was wiped by 2026-10-27-core-wipe.sql and the item was never sold).
--    The cut runs through a one-shot owner-only helper that §4 then exercises on
--    probe rows and §5 drops, so the file leaves no new function behind.
--
-- KEPT, on purpose: hr_login_claim / hr_login_view (the PREMIUM login reward,
-- Tyler 2026-10-17); hr_login_claim_verify (hr_apply calls it on a C2 claim op
-- and it refuses every one login_reward_off; removing it needs an hr_apply
-- restatement); hr_bestiary_of / hr_collection_of and every ev: counter (the
-- edge's collection read and the Bestiary use them); hr_hunt_roster (the
-- Bestiary's total, 2026-11-24-bestiary-roster.sql); the old companion PET
-- system (hr_companion_equip / hr_companion_grant, hr_perks_of's companion
-- read) is a separate cut that needs an engine deploy. player_progress claim
-- rows of the dropped systems stay as inert history.
--
-- REVERSIBILITY: re-apply the files that created each body (named in
-- tests/live-hash-drift.baseline.json `touched_by`). No begin/commit.
-- ORDER: after 2026-12-01-garden-beds.sql (and after the 2026-11-22 loot
-- catalogue, which removes the item rows). No edge deploy.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE DROPS ──────────────────────────────────────────────────────────
drop function if exists public.hr_claim_quest(text, integer);
drop function if exists public.hr_claim_quest__ungated(text, integer);
drop table    if exists public.hr_quest_rewards;            -- before its CHECK's function
drop function if exists public.hr_quest_rewards_items_ok(jsonb);

drop function if exists public.hr_claim_milestone(text, integer);
drop function if exists public.hr_claim_milestone__ungated(text, integer);

drop function if exists public.hr_claim_rank(text, integer);
drop function if exists public.hr_claim_rank__ungated(text, integer);

drop function if exists public.hr_claim_daily(text, integer);
drop function if exists public.hr_claim_daily__ungated(text, integer);
drop function if exists public.hr_tally_state(integer);
drop function if exists public.hr_daily_task_set(text);
drop function if exists public.hr_daily_task_set_for(text, uuid, integer);
drop function if exists public.hr_daily_task_set_caps(text, bigint, bigint, bigint, bigint, boolean);
drop function if exists public.hr_daily_task_eligible(text, bigint, bigint, bigint, bigint);
drop function if exists public.hr_goal_daily_seed(text);
drop function if exists public.hr_daily_harvest_ready(text, uuid, integer);
drop function if exists public.hr_daily_harvest_rule(integer, boolean, integer, bigint);
drop function if exists public.hr_goal_period_start(boolean, timestamptz);
drop function if exists public.hr_iso_week_key(timestamptz);

drop function if exists public.hr_claim_lookup(uuid, integer, text, text);
drop function if exists public.hr_login_bonus_ready(uuid, integer);
drop function if exists public.hr_login_streak(uuid, integer);
drop function if exists public.hr_claim_last(uuid, integer, text, text);
drop function if exists public.hr_login_price(integer, boolean);
drop function if exists public.hr_login_catalogue();

-- ── 2. THE CLIENT SURFACE ─────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline
 where proname in ('hr_claim_quest', 'hr_claim_milestone', 'hr_claim_rank', 'hr_claim_daily', 'hr_tally_state');

-- ── 3. THE FOX COMPANION: every held row, deleted and journalled ──────────
create or replace function public.hr_cut_item_holders(p_item text)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_inv int; v_eq int; v_bank int; v_bag int; v_list int; v_clan int; v_rules int;
begin
  if exists (select 1 from public.market_buy_offers where item_id = p_item) then
    raise exception 'old-rewards-cut §3: an open market buy offer names % (escrowed gold) — refund it by hand first', p_item;
  end if;
  with d as (delete from public.player_inventory where item_id = p_item returning user_id, slot, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select user_id, slot, 'admin', 'item_cut', p_item, -qty, jsonb_build_object('from', 'inventory', 'why', 'item cut 2026-10-22')
    from d where qty > 0;
  get diagnostics v_inv = row_count;
  with d as (delete from public.player_equipment where item_id = p_item returning user_id, slot, equip_slot)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select user_id, slot, 'admin', 'item_cut', p_item, -1,
         jsonb_build_object('from', 'equipment', 'equip_slot', equip_slot, 'why', 'item cut 2026-10-22')
    from d;
  get diagnostics v_eq = row_count;
  -- The account bank has no character: journal against the account's first character.
  with d as (delete from public.account_bank where item_id = p_item returning user_id, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select d.user_id, s.slot, 'admin', 'item_cut', p_item, -d.qty, jsonb_build_object('from', 'account_bank', 'why', 'item cut 2026-10-22')
    from d cross join lateral (select min(ps.slot) as slot from public.player_state ps where ps.user_id = d.user_id) s
   where d.qty > 0 and s.slot is not null;
  get diagnostics v_bank = row_count;
  with d as (delete from public.hunt_bag where item_id = p_item returning user_id, slot, session_id, qty_left)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta, session_id)
  select user_id, slot, 'admin', 'item_cut', p_item, -qty_left, jsonb_build_object('from', 'hunt_bag', 'why', 'item cut 2026-10-22'), session_id
    from d where qty_left > 0;
  get diagnostics v_bag = row_count;
  with d as (delete from public.market_listings where item_id = p_item returning seller_user_id, seller_slot, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select seller_user_id, seller_slot, 'admin', 'item_cut', p_item, -qty, jsonb_build_object('from', 'market_listing', 'why', 'item cut 2026-10-22')
    from d where qty > 0;
  get diagnostics v_list = row_count;
  with d as (delete from public.clan_stores where item_id = p_item returning clan_id, qty)
  insert into public.clan_ledger (clan_id, kind, item_id, qty, at)
  select clan_id, 'withdraw', p_item, -qty, now() from d where qty > 0;
  get diagnostics v_clan = row_count;
  delete from public.player_item_rules where item_id = p_item;
  get diagnostics v_rules = row_count;
  return jsonb_build_object('inventory', v_inv, 'equipment', v_eq, 'account_bank', v_bank, 'hunt_bag', v_bag,
                            'market_listings', v_list, 'clan_stores', v_clan, 'item_rules', v_rules);
end $$;
revoke execute on function public.hr_cut_item_holders(text) from public, anon, authenticated, service_role;

do $$
declare v jsonb;
begin
  v := public.hr_cut_item_holders('fox_companion');
  raise notice 'old-rewards-cut §3: fox_companion holders cut and journalled: %', v;
end $$;

-- ── 4. SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ───────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-00000c0c1022';
  v      jsonb;
  v_n    int;
  v_gone text;
begin
  -- (a) EVERY DROPPED OBJECT IS GONE.
  foreach v_gone in array array[
    'public.hr_claim_quest(text,integer)', 'public.hr_claim_quest__ungated(text,integer)',
    'public.hr_quest_rewards_items_ok(jsonb)',
    'public.hr_claim_milestone(text,integer)', 'public.hr_claim_milestone__ungated(text,integer)',
    'public.hr_claim_rank(text,integer)', 'public.hr_claim_rank__ungated(text,integer)',
    'public.hr_claim_daily(text,integer)', 'public.hr_claim_daily__ungated(text,integer)',
    'public.hr_tally_state(integer)', 'public.hr_daily_task_set(text)',
    'public.hr_daily_task_set_for(text,uuid,integer)',
    'public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint,boolean)',
    'public.hr_daily_task_eligible(text,bigint,bigint,bigint,bigint)', 'public.hr_goal_daily_seed(text)',
    'public.hr_daily_harvest_ready(text,uuid,integer)', 'public.hr_daily_harvest_rule(integer,boolean,integer,bigint)',
    'public.hr_goal_period_start(boolean,timestamp with time zone)', 'public.hr_iso_week_key(timestamp with time zone)',
    'public.hr_claim_lookup(uuid,integer,text,text)', 'public.hr_login_bonus_ready(uuid,integer)',
    'public.hr_login_streak(uuid,integer)', 'public.hr_claim_last(uuid,integer,text,text)',
    'public.hr_login_price(integer,boolean)', 'public.hr_login_catalogue()'] loop
    if to_regprocedure(v_gone) is not null then raise exception 'old-rewards-cut §4(a): % still exists', v_gone; end if;
  end loop;
  -- No overload of a dropped claim verb survives under another signature either.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname ~ '^hr_(claim_(quest|milestone|rank|daily|goal|lookup|last)|daily_task_|daily_harvest_|login_(price|catalogue|streak|bonus_ready)|tally_state|goal_daily_seed|goal_state)';
  if v_n <> 0 then raise exception 'old-rewards-cut §4(a): % function(s) of the cut systems remain', v_n; end if;
  if to_regclass('public.hr_quest_rewards') is not null or to_regclass('public.hr_hunt_loot_roster') is not null then
    raise exception 'old-rewards-cut §4(a): a cut reward table remains'; end if;

  -- (b) THE KEPT DOORS ARE STILL THERE (a cut that took a live system is worse than none).
  if to_regprocedure('public.hr_login_claim(integer,uuid)') is null
     or to_regprocedure('public.hr_login_view(uuid,integer)') is null
     or to_regprocedure('public.hr_login_claim_verify(uuid,integer,text,jsonb)') is null
     or to_regprocedure('public.hr_collection_of(uuid,integer)') is null
     or to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regclass('public.hr_hunt_roster') is null then
    raise exception 'old-rewards-cut §4(b): a kept door is missing'; end if;
  -- The C2 claim door hr_apply calls still refuses every claim.
  begin
    perform public.hr_login_claim_verify(v_uid, 0, '', '{}'::jsonb);
    raise exception 'old-rewards-cut §4(b): hr_login_claim_verify returned without refusing';
  exception when sqlstate 'HR000' then
    if sqlerrm <> 'login_reward_off' then raise exception 'old-rewards-cut §4(b): the C2 door refused % (want login_reward_off)', sqlerrm; end if;
  end;

  -- (c) THE CLIENT SURFACE NAMES NO DROPPED RPC.
  select count(*) into v_n from public.hr_client_rpc_baseline b
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = b.proname);
  if v_n <> 0 then raise exception 'old-rewards-cut §4(c): % baseline row(s) name a function that does not exist', v_n; end if;

  -- (d) THE FOX AND ITS SLOT ARE GONE FROM THE CATALOGUE AND FROM EVERY HOLDER.
  if exists (select 1 from public.hr_items where item_id = 'fox_companion')
     or exists (select 1 from public.hr_item_slots where item_id = 'fox_companion' or equip_slot = 'companion')
     or exists (select 1 from public.hr_equip_slots where equip_slot = 'companion') then
    raise exception 'old-rewards-cut §4(d): the fox or the companion slot is still catalogued'; end if;
  if exists (select 1 from public.player_inventory where item_id = 'fox_companion')
     or exists (select 1 from public.player_equipment where item_id = 'fox_companion' or equip_slot = 'companion')
     or exists (select 1 from public.account_bank where item_id = 'fox_companion')
     or exists (select 1 from public.hunt_bag where item_id = 'fox_companion')
     or exists (select 1 from public.market_listings where item_id = 'fox_companion')
     or exists (select 1 from public.clan_stores where item_id = 'fox_companion') then
    raise exception 'old-rewards-cut §4(d): a fox row is still held'; end if;

  -- (e) THE CUT JOURNALS WHAT IT TAKES: a probe holding a fox in the bag (2), worn, and in
  --     the bank (3) loses all three and gains three admin ledger rows of -2, -1 and -3; a
  --     bystander's other item is untouched. Rolled back.
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, version) values (v_uid, 0, 0, 1)
      on conflict (user_id, slot) do nothing;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, 'fox_companion', 2), (v_uid, 0, 'bones', 4);
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_uid, 0, 'companion', 'fox_companion');
    insert into public.account_bank (user_id, item_id, qty) values (v_uid, 'fox_companion', 3);
    v := public.hr_cut_item_holders('fox_companion');
    if (v->>'inventory')::int <> 1 or (v->>'equipment')::int <> 1 or (v->>'account_bank')::int <> 1 then
      raise exception 'old-rewards-cut §4(e): the cut did not take the three probe holdings: %', v; end if;
    if exists (select 1 from public.player_inventory where user_id = v_uid and item_id = 'fox_companion')
       or exists (select 1 from public.player_equipment where user_id = v_uid)
       or exists (select 1 from public.account_bank where user_id = v_uid) then
      raise exception 'old-rewards-cut §4(e): a probe fox survived the cut'; end if;
    if (select qty from public.player_inventory where user_id = v_uid and item_id = 'bones') is distinct from 4 then
      raise exception 'old-rewards-cut §4(e) CONTROL: the cut touched another item'; end if;
    if (select coalesce(array_agg(qty order by qty), '{}') from public.player_ledger
         where user_id = v_uid and kind = 'admin' and intent = 'item_cut' and item_id = 'fox_companion') <> array[-3, -2, -1]::bigint[] then
      raise exception 'old-rewards-cut §4(e): the cut was not journalled as -3, -2, -1'; end if;
    raise exception using errcode = 'HR892', message = 'old-rewards-cut §4 complete — rolling back';
  exception when sqlstate 'HR892' then null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'old-rewards-cut §4: LEAKED a probe row'; end if;

  -- (f) GRANT HYGIENE IS CLEAN.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'old-rewards-cut §4(f): grant hygiene is red: %', v; end if;

  raise notice 'old-rewards-cut: quests, milestones, renown ranks, daily/weekly goals and the old login cycle dropped; '
               'the premium login, C2 refusal, Bestiary and collection reads kept; the fox and its slot gone and journalled; zero leak';
end $$;

-- ── 5. THE ONE-SHOT HELPER LEAVES WITH THE FILE ───────────────────────────
drop function if exists public.hr_cut_item_holders(text);
