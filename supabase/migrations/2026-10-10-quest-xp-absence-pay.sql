-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-quest-xp-absence-pay.sql — QUEST XP IS CREDITED BY THE SERVER,
--   AND THE ABSENCE CHEST'S GOLD AND GEMS ARE FINALLY PAID.
--
-- STATUS: STAGED, NOT APPLIED — Security review required (XP, gold and gems
-- are ranked/economy surfaces). Lane C (lane/b567-quest-xp-absence-pay). The
-- Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). CHAIN POSITION: AFTER
-- 2026-10-10-muster-chest-xp-credit.sql — the absence body below is restated
-- FROM that file's (XP-crediting) body; §0 refuses to apply before it.
--
-- ── DEFECT 1 (P1 class-kill, CLAUDE.md §1) ─────────────────────────────────
-- hundred_kills ("Defeat 100 monsters") paid 1,500 combat XP from the BROWSER:
-- hr_claim_quest credited gold and items only, hundred_kills carried no gold,
-- so it never fired a claim, and completeQuest called window.addXp for a
-- style-routed split. Combat XP rides _combatXpPending -> hr_credit_combat_xp,
-- so client-authored XP reached a ranked credit. No server row knew the quest
-- had been completed. Found by tests/no-client-xp-mint.mjs XP-5 (b567).
--
-- SWEEP — every quest/goal reward that grants XP, and who credits it:
--   QUEST  hundred_kills  1,500 XP   was CLIENT (completeQuest addXp) -> THIS FILE
--   QUEST  the other 10   no XP      (gold/items only, hr_claim_quest, unchanged)
--   GOAL   daily/weekly   kill_any, kill_more, wk_kills, wk_smith, wk_craft,
--          wk_harvest, wk_bury, wk_gather, wk_logs, wk_cook, gather_logs, ...
--                                   SERVER already (hr_claim_goal, hr_goal_rewards.xp,
--                                   2026-08-23-modal-goal-claims.sql; XP-5 proves it)
--   RALLY  chest xp       SERVER (2026-10-10-muster-chest-xp-credit.sql)
--   BOUNTY Bounty Hunter  SERVER (2026-09-11-bounty-hunter-xp.sql)
-- After this file no quest or goal XP is authored by the client.
--
-- THE SKILL. hundred_kills pays HITPOINTS. The house rule for SERVER-granted XP
-- on a span objective (src/legacy.js, the kill_any/wk_kills ruling): "XP the
-- SERVER grants for a PERIOD objective names a CONSTANT skill … there is no
-- style at claim time, and the server must not invent one nor trust a
-- client-supplied one." A hundred kills span any number of style switches; the
-- old client route read the style at the completion tick, which is a client
-- value. Hitpoints is the skill every combat style trains, so the reward is
-- style-neutral (a bow user is not paid melee XP) and the amount (1,500) is the
-- Designer's, unchanged. The hitpoints credit raises max_hp through the
-- existing hr_player_skills_max_hp trigger.
--
-- ── DEFECT 2 (players lose pay) ─────────────────────────────────────────────
-- world_event_absence_claim__ungated priced the half-honours chest (750 g band,
-- 1 gem) and RETURNED gold/gems but never wrote player_state — its own ledger
-- comment said "the gold arm owns that". Gold and gems are ARMED (server of
-- record): muster.js payChest's local credit no-ops under
-- clientMayWriteRecordField, and the next envelope restates the server's
-- number. So every absence claim since the arm paid its gold and gems to
-- nobody. The attended claim (world_event_claim__ungated) has credited
-- player_state inside its consume since 2026-08-19.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   hr_claim_quest(p_quest_id text, p_slot int)   — wrapper UNCHANGED
--   world_event_absence_claim(p_day_key text)      — wrapper UNCHANGED
--   Both __ungated inners RESTATED; same arity, same grants (inner: no client
--   role; wrapper: authenticated) — hr_client_rpc_baseline is untouched.
--
--   hr_quest_rewards gains `xp jsonb not null default '{}'` (named CHECK: an
--   object of non-negative integer amounts — the items shape predicate). This
--   file OWNS the xp column: it clears it and seeds the XP rows. The item rows
--   stay owned by 2026-09-28-journeymans-road.sql (not re-seeded here).
--
--   hr_claim_quest__ungated, NEW, in this order:
--     1. an 11th CASE arm, hundred_kills (ev:kill_any >= 100, gold 0) — graded
--        on the server's own lifetime counter like every other quest;
--     2. the XP plan, BEFORE the consume: xp from hr_quest_rewards; a skill not
--        in hr_skills is skipped and reported (`skipped_xp`), never minted;
--        each amount and the total are clamped to c_quest_xp_fuse (5,000 — a
--        fuse three times the largest authored quest XP, not a balance number);
--     3. hr_day_budget_check(uid, slot, 0, xp_total, 0, 0) BEFORE the consume —
--        a refusal ('daily_budget') spends nothing and the quest stays claimable;
--     4. the consume (unchanged once-guard row);
--     5. player_skills += xp, OWN ROW ONLY (auth.uid(), the checked slot),
--        additive upsert, same transaction as the consume and the gold;
--     6. the ledger row carries xp_in = xp_total, meta.xp / meta.skipped_xp.
--   RESPONSE gains `xp` {skill: amount} (the CREDITED map), `xp_total`,
--   `skipped_xp`. The client renders it and never adds it.
--
--   world_event_absence_claim__ungated, NEW: after the settle, player_state
--   gold += the chest's gold, gems += its gems (each clamped to [0, the band]:
--   750 g / 1 gem — the existing absence caps), own row only, version + 1, same
--   transaction. The ledger row's `gold` is the credited gold and meta.gems the
--   credited gems — the attended claim's journal shape exactly. RESPONSE: `gold`
--   / `gems` are the CREDITED amounts (previously the band, which overstated
--   what the player received once the chest took its item/XP share), plus
--   `band_gold`, `band_gems` and `credited: true`.
--
--   ERROR TAXONOMY (additive): hr_claim_quest gains 'daily_budget' {detail}.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged once-guards. Quest: `insert … on conflict do nothing` on the
-- (user, slot, 'quest', id, '') progress row — a concurrent second call blocks
-- on the unique index, then sees row_count 0 and returns already_claimed before
-- any credit. Absence: the conditional UPDATE on world_event_pledges takes the
-- row lock; the loser sees row_count 0 -> already_settled. Consume, skills,
-- gold, gems, inventory and the ledger row are one transaction. The day-budget
-- read is check-then-insert (the accepted house TOCTOU; 1,500 XP against a
-- 120,000,000/day ceiling).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Narrower for XP: the client loses its last quest XP input (completeQuest no
-- longer calls addXp). The client still sends only a quest id and a slot; the
-- amount is a server catalogue row, completion the server's own counter.
-- Absence gold/gems: a new server CREDIT, but of a value the server already
-- priced and journalled; no client value reaches it (day key -> server-derived
-- pledge row, slot from the pledge, amount from hr_rally_chest clamped to the
-- band). Once per (day, user) by the pledge's settle flip.
-- RESIDUAL (stated): hundred_kills becomes claimable for every character whose
-- ev:kill_any is already >= 100, including those whose browser already minted
-- the old client-side 1,500 combat XP. They receive 1,500 HITPOINTS XP once.
-- Self-only, once ever, bounded at 1,500 XP x 6 slots per account; accepted
-- rather than inventing a "was it already paid client-side" heuristic (there
-- is no server record to read — that is the defect).
-- ev:kill_any is forgeable up to the hr_credit_kills physics cap (the accepted
-- 2026-09-28 road_hunt residual); 100 kills is ~1 minute of forged credit for
-- 1,500 HP XP once per character — inside the same accepted bound.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- Quest: one extra catalogue read and <= 1 player_skills upsert per hundred_kills
-- claim (once per character ever). Absence: one player_state UPDATE that
-- replaces the conditional version bump — no new rows. At 100x players: no new
-- row class; the one-per-claim ledger rows are unchanged in count.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-09-28-journeymans-road.sql §2 (quest body) — NOT the whole file,
-- its §0 refuses a non-3-row catalogue — and 2026-10-10-muster-chest-xp-credit.sql
-- §3 (absence body). `alter table public.hr_quest_rewards drop column xp`
-- (after the body revert). Credited XP/gold/gems stay credited; the client half
-- must then go back too or hundred_kills pays nothing.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS (fail closed) ─────────────────────────────────────────
do $$
declare
  v_src text;
  v_n   int;
begin
  if to_regclass('public.hr_quest_rewards') is null
     or to_regprocedure('public.hr_quest_rewards_items_ok(jsonb)') is null then
    raise exception '§0: hr_quest_rewards / its shape predicate is missing — apply 2026-09-06-quest-item-rewards.sql';
  end if;
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null
     or to_regprocedure('public.hr_claim_quest(text,integer)') is null
     or to_regprocedure('public.world_event_absence_claim__ungated(text)') is null
     or to_regprocedure('public.world_event_absence_claim(text)') is null then
    raise exception '§0: the quest / absence claim surface is missing';
  end if;
  if to_regprocedure('public.hr_rally_xp_credit(text,jsonb)') is null then
    raise exception '§0: hr_rally_xp_credit is missing — apply 2026-10-10-muster-chest-xp-credit.sql FIRST '
                    '(this file restates its absence body)';
  end if;
  if to_regprocedure('public.hr_day_budget_check(uuid,integer,bigint,bigint,bigint,bigint)') is null then
    raise exception '§0: the six-argument hr_day_budget_check is missing';
  end if;
  if to_regclass('public.hr_skills') is null or to_regclass('public.player_skills') is null then
    raise exception '§0: hr_skills / player_skills missing';
  end if;
  if not exists (select 1 from public.hr_skills where skill_id = 'hitpoints') then
    raise exception '§0: hr_skills has no hitpoints — the catalogue this file seeds would pay nothing';
  end if;

  -- The installed quest body is journeymans-road's 10-arm body, or this file's
  -- own 11-arm body (a re-apply). Anything else is a body this file was not
  -- reviewed against.
  select prosrc into v_src from pg_proc
   where oid = 'public.hr_claim_quest__ungated(text,integer)'::regprocedure;
  select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
  if not (v_n = 10 and position('''hundred_kills''' in v_src) = 0)
     and not (v_n = 11 and position('select xp into v_xcat from public.hr_quest_rewards' in v_src) > 0) then
    raise exception '§0: the installed hr_claim_quest__ungated has % arm(s) — expected the 10-arm '
                    '2026-09-28-journeymans-road.sql body (or this file''s 11-arm body)', v_n;
  end if;
  if position('select items into v_cat from public.hr_quest_rewards where quest_id = p_quest_id;' in v_src) = 0 then
    raise exception '§0: the installed hr_claim_quest__ungated does not read hr_quest_rewards items';
  end if;

  -- The installed absence body is the muster file's (it writes player_skills).
  select prosrc into v_src from pg_proc
   where oid = 'public.world_event_absence_claim__ungated(text)'::regprocedure;
  if strpos(v_src, 'insert into public.player_skills') = 0 then
    raise exception '§0: world_event_absence_claim__ungated does not credit XP — apply '
                    '2026-10-10-muster-chest-xp-credit.sql FIRST (this file restates its body)';
  end if;
end $$;

-- ── 1. hr_quest_rewards.xp — THE SERVER-OWNED QUEST XP CATALOGUE ───────────
alter table public.hr_quest_rewards
  add column if not exists xp jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_quest_rewards'::regclass
                    and conname  = 'hr_quest_rewards_xp_shape') then
    alter table public.hr_quest_rewards
      add constraint hr_quest_rewards_xp_shape
      check (public.hr_quest_rewards_items_ok(xp));
  end if;
end $$;
-- RLS / grants are the table's (2026-09-06): RLS on, no policy, no client
-- privilege. Re-asserted, not changed.
alter table public.hr_quest_rewards enable row level security;
revoke all on public.hr_quest_rewards from public, anon, authenticated, service_role;

-- This file OWNS the xp column: cleared, then seeded. Kept in lockstep with
-- src/data/goal-catalogue.js QUEST_REWARDS[*].xp and src/legacy.js QUEST_DEFS
-- reward.xp by tests/quest-reward-parity.mjs (the XP half).
update public.hr_quest_rewards set xp = '{}'::jsonb where xp <> '{}'::jsonb;
insert into public.hr_quest_rewards (quest_id, xp) values
  ('hundred_kills', '{"hitpoints": 1500}')
on conflict (quest_id) do update set xp = excluded.xp;

-- ── 2. hr_claim_quest__ungated — journeymans-road's body + the XP credit ───
-- The ten existing arm lines are byte-identical (tests/goal-catalogue-drift.mjs
-- reads them at this chain end; §4(b) re-reads them off the installed body).
create or replace function public.hr_claim_quest__ungated(p_quest_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_key    text;   -- the ev:<type> counter to verify
  v_goal   bigint;
  v_gold   bigint;
  v_have   bigint;
  v_rows   int;
  v_cat    jsonb  := '{}'::jsonb;   -- the authored item map for this quest
  v_ok     jsonb  := '{}'::jsonb;   -- ids hr_items knows — these are credited
  v_skip   jsonb  := '{}'::jsonb;   -- ids it does not — reported, never minted
  v_k      text;
  v_v      text;
  v_n      bigint;
  -- XP credit locals (2026-10-10-quest-xp-absence-pay.sql)
  c_quest_xp_fuse constant bigint := 5000;
  v_xcat     jsonb  := '{}'::jsonb;   -- the authored XP map for this quest
  v_xp_ok    jsonb  := '{}'::jsonb;   -- skills hr_skills knows — these are credited
  v_xp_skip  jsonb  := '{}'::jsonb;   -- skills it does not — reported, never minted
  v_xp_total bigint := 0;
  v_bud      jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/goal-catalogue.js).
  case p_quest_id
    when 'gatherer'    then v_key := 'ev:gather';   v_goal := 15; v_gold := 150;
    when 'first_cook'  then v_key := 'ev:cooked';   v_goal := 5;  v_gold := 200;
    when 'first_blood' then v_key := 'ev:kill_any'; v_goal := 5;  v_gold := 150;
    -- b497: goal 10 -> 6 (Designer, balance audit). Production was moved by
    -- 2026-09-04-goal-gold-retune.sql; this restatement carries the same 6, so
    -- re-applying that file after this one would be a REVERT, not a no-op.
    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;
    -- Journeyman's Road (2026-09-28-journeymans-road.sql): the day-2 chain.
    when 'road_forge' then v_key := 'ev:smithed'; v_goal := 60; v_gold := 700;
    when 'road_craft' then v_key := 'ev:crafted'; v_goal := 60; v_gold := 700;
    when 'road_cook' then v_key := 'ev:cooked'; v_goal := 60; v_gold := 600;
    when 'road_gather' then v_key := 'ev:gather'; v_goal := 500; v_gold := 1000;
    when 'road_hunt' then v_key := 'ev:kill_any'; v_goal := 500; v_gold := 1500;
    when 'road_harvest' then v_key := 'ev:harvest'; v_goal := 40; v_gold := 1500;
    -- 2026-10-10-quest-xp-absence-pay.sql: XP only (hr_quest_rewards.xp).
    when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 100; v_gold := 0;
    else return jsonb_build_object('ok', false, 'error', 'unknown_quest', 'quest', p_quest_id);
  end case;

  -- VERIFY completion from the server's OWN lifetime counter.
  select value into v_have from public.player_progress
   where user_id = auth.uid() and slot = v_slot
     and kind = 'stat' and key = v_key and period_key = '';
  if coalesce(v_have, 0) < v_goal then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'quest', p_quest_id, 'have', coalesce(v_have, 0), 'goal', v_goal);
  end if;

  -- PLAN THE ITEM MINT (pure reads, BEFORE the consume). An id hr_items does not
  -- know is skipped and REPORTED, never minted and never fatal.
  select items into v_cat from public.hr_quest_rewards where quest_id = p_quest_id;
  v_cat := coalesce(v_cat, '{}'::jsonb);
  for v_k, v_v in select key, value from jsonb_each_text(v_cat) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_items where item_id = v_k) then
      v_ok := v_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_skip := v_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;

  -- PLAN THE XP CREDIT (pure reads, BEFORE the consume). Same rule as the
  -- items: a skill hr_skills does not know is skipped and reported. Each amount
  -- and the running total are clamped to the fuse (numeric first, so no
  -- magnitude overflows the bigint cast).
  select xp into v_xcat from public.hr_quest_rewards where quest_id = p_quest_id;
  v_xcat := coalesce(v_xcat, '{}'::jsonb);
  for v_k, v_v in select key, value from jsonb_each_text(v_xcat) order by key loop
    v_n := least(greatest(floor(coalesce(v_v::numeric, 0)), 0), c_quest_xp_fuse)::bigint;
    if v_n > 0 and exists (select 1 from public.hr_skills where skill_id = v_k) then
      v_n := least(v_n, c_quest_xp_fuse - v_xp_total);
      if v_n > 0 then
        v_xp_ok    := v_xp_ok || jsonb_build_object(v_k, v_n);
        v_xp_total := v_xp_total + v_n;
      end if;
    elsif v_n > 0 then
      v_xp_skip := v_xp_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;

  -- The XP is checked against the ONE day budget BEFORE the consume, so a
  -- refusal spends nothing and the quest stays claimable.
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud,
                                'quest', p_quest_id, 'slot', v_slot);
    end if;
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'quest', p_quest_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'quest', p_quest_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold, version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  -- THE ITEM CREDIT — additive upsert, same transaction as the gold.
  for v_k, v_v in select key, value from jsonb_each_text(v_ok) loop
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (auth.uid(), v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  end loop;

  -- THE XP CREDIT — own row only (auth.uid(), the checked slot), additive.
  -- A hitpoints credit raises max_hp via hr_player_skills_max_hp.
  for v_k, v_v in select key, value from jsonb_each_text(v_xp_ok) loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  -- ONE journal row, never one per component. xp_in carries the credited XP
  -- so it counts against the day budget it was checked against.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'quest', 'quest_claim:' || p_quest_id,
     v_gold, 0, v_xp_total, 0, 0,
     jsonb_build_object('quest', p_quest_id, 'goal', v_goal, 'check_key', v_key,
                        'items', v_ok, 'skipped_items', v_skip,
                        'xp', v_xp_ok, 'skipped_xp', v_xp_skip));

  return jsonb_build_object('ok', true, 'quest', p_quest_id, 'gold', v_gold,
    'slot', v_slot, 'credited', true, 'items', v_ok, 'skipped_items', v_skip,
    'xp', v_xp_ok, 'xp_total', v_xp_total, 'skipped_xp', v_xp_skip);
end $$;
revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;
grant  execute on function public.hr_claim_quest(text, int) to authenticated;

-- ── 3. THE ABSENCE CLAIM (restated from 2026-10-10-muster-chest-xp-credit.sql §3)
create or replace function public.world_event_absence_claim__ungated(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
  v_chest   jsonb;
  v_it      jsonb;
  v_iid     text;
  v_iqty    bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
  -- gold/gem credit locals (2026-10-10-quest-xp-absence-pay.sql)
  v_gold_out bigint;
  v_gems_out int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1 — while the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2 — the join primary key. They were there; the live chest was their
  -- reward and the pledge closes paying nothing.
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
  end if;
  if v_joined then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  -- The credit target is the pledge's own (user, slot): it must still be a
  -- character. Checked BEFORE the settle so a deleted character never spends
  -- the pledge.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_p.slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_p.slot);
  end if;

  -- ── THE THEMED CHEST, priced BEFORE the settle (pure), and its XP checked
  --    against the ONE day budget, so a refusal spends nothing.
  v_chest    := public.hr_rally_chest(v_p.event_key, c_gold, c_gems, 0);
  -- The gold and gems the chest leaves after its item/XP share, clamped to the
  -- absence band (the existing caps): a chest can never pay more than the band.
  v_gold_out := least(greatest(coalesce((v_chest->>'gold')::bigint, c_gold), 0), c_gold);
  v_gems_out := least(greatest(coalesce((v_chest->>'gems')::int,    c_gems), 0), c_gems);
  v_xc       := public.hr_rally_xp_credit(v_p.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_p.slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_p.slot);
    end if;
  end if;

  -- ── THE SETTLE. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- ── THE GOLD AND GEMS (after the settle guard → exactly once). Own row only,
  --    same transaction as the settle; the version moves, so a held envelope is
  --    stale and the next read carries the absolute gold/gems/skills.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         gems = coalesce(gems, 0) + v_gems_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_p.slot;

  -- ── THE XP (after the settle guard → exactly once). Own row only.
  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_p.slot, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  -- ── THE ITEMS (after the settle guard → exactly once). Additive upsert,
  --    scoped to the caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_p.slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  -- ── JOURNAL — the attended claim's shape: `gold` is the credited gold,
  --    meta.gems the credited gems, xp_in the credited XP.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_p.slot, 'rally', 'world_event_absence_claim:' || v_day_key,
     v_gold_out, 0, v_xp_total, 0, 0,
     jsonb_build_object('band', 'absent', 'day_key', v_day_key,
                        'event_key', v_p.event_key, 'gems', v_gems_out,
                        'absence_gold', c_gold, 'absence_gems', c_gems,
                        'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_p.slot,
    'gold', v_gold_out, 'gems', v_gems_out, 'band_gold', c_gold, 'band_gems', c_gems,
    'seals', 0, 'credited', true,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'chest', v_chest);
end $$;
revoke execute on function public.world_event_absence_claim__ungated(text) from public;
revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;

-- ── 4. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every property EXECUTED. ONE block, no begin/commit; a raise anywhere reverts
-- the whole file. Row-writing probes live in a subtransaction discarded by the
-- HR871 sentinel (player_ledger refuses DELETE of a fresh row).
do $$
declare
  v_a     constant uuid := '00000000-0000-4000-8000-0000b5670b01';   -- the claimant
  v_b     constant uuid := '00000000-0000-4000-8000-0000b5670b02';   -- a bystander
  v_pday  date := (now() at time zone 'utc')::date - 1;              -- a CLOSED prior day
  v_pdk   text;
  v_ek_c  text;
  v_ek_n  text;
  v_d     date;
  v_h     int;
  v_k     text;
  v_r     jsonb;
  v_case  text;
  v_sa0   jsonb; v_sa1 jsonb; v_sb0 jsonb; v_sb1 jsonb;
  v_g0    bigint; v_g1 bigint; v_m0 bigint; v_m1 bigint;
  v_gb0   bigint; v_gb1 bigint; v_mb0 bigint; v_mb1 bigint;
  v_ver0  bigint; v_ver1 bigint;
  v_n     bigint;
  v_led   record;
  v_src   text;
  v_line  text;
  v_grants text;
begin
  -- (a) GRANTS. Inners: no client role. Wrappers: authenticated, not anon.
  foreach v_k in array array['public.hr_claim_quest__ungated(text,integer)',
                             'public.world_event_absence_claim__ungated(text)'] loop
    if has_function_privilege('authenticated', v_k, 'execute')
       or has_function_privilege('anon', v_k, 'execute') then
      raise exception 'GATE(a): % is client-executable', v_k;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_claim_quest(text,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.world_event_absence_claim(text)', 'execute') then
    raise exception 'GATE(a): a claim wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'GATE(a): hr_claim_quest is anon-executable';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('player_skills', 'player_state')
                and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'GATE(a): a client write grant exists on player_skills / player_state';
  end if;
  select coalesce(string_agg(gg || ':' || pv, ', ' order by gg, pv), '') into v_grants
    from unnest(array['anon','authenticated','service_role','hr_engine']) gg
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE',
                            'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
   where exists (select 1 from pg_roles rr where rr.rolname = gg)
     and has_table_privilege(gg, 'public.hr_quest_rewards'::regclass, pv);
  if v_grants <> '' then
    raise exception 'GATE(a): client privilege(s) on hr_quest_rewards: %', v_grants;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_quest_rewards') then
    raise exception 'GATE(a): hr_quest_rewards grew a policy';
  end if;

  -- (b) THE CATALOGUE AND THE BODIES.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_quest_rewards'::regclass
                    and conname = 'hr_quest_rewards_xp_shape' and convalidated) then
    raise exception 'GATE(b): the xp shape constraint is missing or not validated';
  end if;
  -- the XP rows are EXACTLY this file's seed
  select count(*) into v_n from public.hr_quest_rewards where xp <> '{}'::jsonb;
  if v_n <> 1 or not exists (select 1 from public.hr_quest_rewards
                              where quest_id = 'hundred_kills' and xp = '{"hitpoints": 1500}'::jsonb) then
    raise exception 'GATE(b): hr_quest_rewards.xp is not exactly {hundred_kills: {hitpoints: 1500}} (% XP rows)', v_n;
  end if;
  select count(*) into v_n
    from public.hr_quest_rewards q, lateral jsonb_each_text(q.xp) e
   where not exists (select 1 from public.hr_skills s where s.skill_id = e.key);
  if v_n > 0 then
    raise exception 'GATE(b): % catalogue XP skill(s) are not in hr_skills — authored and never paid', v_n;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_claim_quest__ungated(text,integer)'::regprocedure;
  foreach v_line in array array[
    E'    when ''gatherer''    then v_key := ''ev:gather'';   v_goal := 15; v_gold := 150;\n',
    E'    when ''first_cook''  then v_key := ''ev:cooked'';   v_goal := 5;  v_gold := 200;\n',
    E'    when ''first_blood'' then v_key := ''ev:kill_any''; v_goal := 5;  v_gold := 150;\n',
    E'    when ''farmhand''    then v_key := ''ev:harvest'';  v_goal := 6;  v_gold := 500;\n',
    E'    when ''road_hunt'' then v_key := ''ev:kill_any''; v_goal := 500; v_gold := 1500;\n',
    E'    when ''hundred_kills'' then v_key := ''ev:kill_any''; v_goal := 100; v_gold := 0;\n']
  loop
    if position(v_line in v_src) = 0 then
      raise exception 'GATE(b): the quest body lacks the arm line %', v_line;
    end if;
  end loop;
  select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
  if v_n <> 11 then
    raise exception 'GATE(b): the quest body has % arm(s), expected 11', v_n;
  end if;
  if position('ev:planted' in v_src) > 0 then
    raise exception 'GATE(b): the quest body names ev:planted (2026-09-07 GATE(d))';
  end if;
  if strpos(v_src, 'insert into public.player_skills') = 0 then
    raise exception 'GATE(b): the quest body does not write player_skills';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.world_event_absence_claim__ungated(text)'::regprocedure;
  if strpos(v_src, 'insert into public.player_skills') = 0
     or v_src !~ 'gold = coalesce\(gold, 0\) \+ v_gold_out' then
    raise exception 'GATE(b): the absence body does not credit XP AND gold';
  end if;

  -- event keys for a combat and a non-combat theme (deterministic search)
  for v_d in select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date, interval '1 day')::date loop
    foreach v_h in array array[1, 13] loop
      v_k := public.hr_utc_day_key((v_d + interval '12 hours') at time zone 'utc') || '#' || v_h;
      if v_ek_c is null and public.hr_rally_event_for_key(v_k) = 'ashen_horde' then v_ek_c := v_k; end if;
      if v_ek_n is null and public.hr_rally_event_for_key(v_k) = 'forge_levy'  then v_ek_n := v_k; end if;
    end loop;
    exit when v_ek_c is not null and v_ek_n is not null;
  end loop;
  if v_ek_c is null or v_ek_n is null then
    raise exception 'GATE(d) CANNOT RUN: no ashen_horde / forge_levy event key in 400 days (% / %)', v_ek_c, v_ek_n;
  end if;
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing';
  end if;

  begin  -- ── SUBTRANSACTION, discarded by the HR871 sentinel ─────────────────
    insert into auth.users (id) values (v_a), (v_b);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no bystander character: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;

    -- ── (c) QUEST XP: incomplete refused; at goal the player_skills delta
    --        EQUALS the response, only the caller's row moves, journalled,
    --        replay refused; budget refused before the consume.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_a, 0, 'stat', 'ev:kill_any', 99, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 99;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sa0 from public.player_skills where user_id = v_a and slot = 0;
    v_r := public.hr_claim_quest__ungated('hundred_kills', 0);
    if v_r->>'ok' <> 'false' or v_r->>'error' <> 'incomplete' or (v_r->>'goal')::bigint <> 100 then
      raise exception 'GATE(c): hundred_kills at 99 was not refused incomplete: %', v_r;
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sa1 from public.player_skills where user_id = v_a and slot = 0;
    if v_sa1 <> v_sa0 or exists (select 1 from public.player_progress
                                  where user_id = v_a and kind = 'quest' and key = 'hundred_kills') then
      raise exception 'GATE(c): the refused incomplete claim moved skills or consumed the quest';
    end if;

    update public.player_progress set value = 100
     where user_id = v_a and slot = 0 and kind = 'stat' and key = 'ev:kill_any' and period_key = '';
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sb0 from public.player_skills where user_id = v_b;
    select gold, version into v_g0, v_ver0 from public.player_state where user_id = v_a and slot = 0;
    v_r := public.hr_claim_quest('hundred_kills', 0);          -- the real, rate-gated wrapper
    if coalesce(v_r->>'ok', '') <> 'true' or v_r->>'credited' <> 'true' then
      raise exception 'GATE(c): hundred_kills at 100 did not credit: %', v_r;
    end if;
    if v_r->'xp' <> '{"hitpoints": 1500}'::jsonb or (v_r->>'xp_total')::bigint <> 1500
       or v_r->'skipped_xp' <> '{}'::jsonb then
      raise exception 'GATE(c) CONTROL: the receipt is not exactly 1,500 hitpoints XP: %', v_r;
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sa1 from public.player_skills where user_id = v_a and slot = 0;
    select count(*) into v_n
      from (select k from jsonb_object_keys(v_sa0) k union select k from jsonb_object_keys(v_sa1) k) ks(k)
     where coalesce((v_sa1->>ks.k)::bigint, 0) - coalesce((v_sa0->>ks.k)::bigint, 0)
           <> coalesce((v_r->'xp'->>ks.k)::bigint, 0);
    if v_n <> 0 then
      raise exception 'GATE(c): player_skills moved % -> %, the receipt says %', v_sa0, v_sa1, v_r->'xp';
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sb1 from public.player_skills where user_id = v_b;
    if v_sb1 <> v_sb0 then
      raise exception 'GATE(c): the claim moved ANOTHER player''s skills';
    end if;
    select gold, version into v_g1, v_ver1 from public.player_state where user_id = v_a and slot = 0;
    if v_g1 <> v_g0 or v_ver1 <= v_ver0 then
      raise exception 'GATE(c): gold moved (% -> %) or the version did not (% -> %)', v_g0, v_g1, v_ver0, v_ver1;
    end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_a and kind = 'quest' and intent = 'quest_claim:hundred_kills';
    select xp_in, meta into v_led from public.player_ledger
     where user_id = v_a and kind = 'quest' and intent = 'quest_claim:hundred_kills' order by id desc limit 1;
    if v_n <> 1 or v_led.xp_in <> 1500 or v_led.meta->'xp' <> v_r->'xp' then
      raise exception 'GATE(c): the quest journal is not one row with xp_in 1500 (% rows, xp_in %, meta.xp %)',
        v_n, v_led.xp_in, v_led.meta->'xp';
    end if;
    -- replay
    v_r := public.hr_claim_quest__ungated('hundred_kills', 0);
    if v_r->>'ok' <> 'false' or v_r->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): the replay was not refused already_claimed: %', v_r;
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sa0 from public.player_skills where user_id = v_a and slot = 0;
    select count(*) into v_n from public.player_ledger
     where user_id = v_a and kind = 'quest' and intent = 'quest_claim:hundred_kills';
    if v_sa0 <> v_sa1 or v_n <> 1 then
      raise exception 'GATE(c): the refused replay moved skills or journalled';
    end if;
    -- a gold quest still pays no XP (positive control on the catalogue read)
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_a, 0, 'stat', 'ev:gather', 15, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 15;
    v_r := public.hr_claim_quest__ungated('gatherer', 0);
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sa1 from public.player_skills where user_id = v_a and slot = 0;
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'xp_total')::bigint <> 0 or v_sa1 <> v_sa0 then
      raise exception 'GATE(c): gatherer credited XP or failed: %', v_r;
    end if;
    -- the day budget: the bystander at its ceiling is refused BEFORE the consume
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_b, 0, 'stat', 'ev:kill_any', 100, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 100;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_b, 0, 'admin', 'quest-xp-budget-probe', 0, 0,
              ((public.hr_day_budget_limits())->>'xp')::bigint, 0, 0, '{}'::jsonb);
    v_r := public.hr_claim_quest__ungated('hundred_kills', 0);
    if coalesce(v_r->>'error', '') <> 'daily_budget' then
      raise exception 'GATE(c): a quest claim over the XP day budget was not refused: %', v_r;
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}') into v_sb1 from public.player_skills where user_id = v_b;
    if v_sb1 <> v_sb0 or exists (select 1 from public.player_progress
                                  where user_id = v_b and kind = 'quest' and key = 'hundred_kills') then
      raise exception 'GATE(c): the budget refusal moved skills or SPENT the quest';
    end if;

    -- ── (d) ABSENCE GOLD/GEMS: both theme kinds; the player_state deltas EQUAL
    --        the response, the bystander does not move, journalled, replay refused.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_pdk := public.hr_utc_day_key(((public.hr_rally_day(to_char(v_pday, 'YYYY-MM-DD'))) + interval '12 hours') at time zone 'utc');
    if public.hr_rally_day_close(v_pdk) is null or now() < public.hr_rally_day_close(v_pdk) then
      raise exception 'GATE(d) CANNOT RUN: prior day % is not closed', v_pdk;
    end if;
    foreach v_case in array array[v_ek_c, v_ek_n] loop
      delete from public.world_event_pledges where user_id = v_a;
      insert into public.world_event_pledges (day_key, user_id, event_key, slot, settled)
        values (v_pdk, v_a, v_case, 0, false);
      select gold, gems, version into v_g0, v_m0, v_ver0 from public.player_state where user_id = v_a and slot = 0;
      select gold, gems into v_gb0, v_mb0 from public.player_state where user_id = v_b and slot = 0;
      select count(*) into v_n from public.player_ledger where user_id = v_a and kind = 'rally';
      v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
      if coalesce(v_r->>'ok', '') <> 'true' or v_r->>'credited' <> 'true' then
        raise exception 'GATE(d) %: the absence claim did not pay: %', v_case, v_r;
      end if;
      if coalesce((v_r->>'gold')::bigint, 0) <= 0 or coalesce((v_r->>'gems')::bigint, 0) <= 0 then
        raise exception 'GATE(d) % CONTROL: the receipt pays no gold or no gems (%) — the equality below would be vacuous',
          v_case, v_r;
      end if;
      if (v_r->>'gold')::bigint > 750 or (v_r->>'gems')::bigint > 1 then
        raise exception 'GATE(d) %: the receipt exceeds the absence band: %', v_case, v_r;
      end if;
      select gold, gems, version into v_g1, v_m1, v_ver1 from public.player_state where user_id = v_a and slot = 0;
      if v_g1 - v_g0 <> (v_r->>'gold')::bigint or v_m1 - v_m0 <> (v_r->>'gems')::bigint then
        raise exception 'GATE(d) %: gold +% gems +%, the receipt says gold % gems %',
          v_case, v_g1 - v_g0, v_m1 - v_m0, v_r->>'gold', v_r->>'gems';
      end if;
      if v_ver1 <= v_ver0 then
        raise exception 'GATE(d) %: the version did not move', v_case;
      end if;
      select gold, gems into v_gb1, v_mb1 from public.player_state where user_id = v_b and slot = 0;
      if v_gb1 <> v_gb0 or v_mb1 <> v_mb0 then
        raise exception 'GATE(d) %: the claim moved ANOTHER player''s gold/gems', v_case;
      end if;
      select gold, meta into v_led from public.player_ledger
       where user_id = v_a and kind = 'rally' order by at desc, id desc limit 1;
      if v_led.gold <> (v_r->>'gold')::bigint or (v_led.meta->>'gems')::bigint <> (v_r->>'gems')::bigint
         or (select count(*) from public.player_ledger where user_id = v_a and kind = 'rally') <> v_n + 1 then
        raise exception 'GATE(d) %: the journal does not carry the credit (gold %, meta.gems %)',
          v_case, v_led.gold, v_led.meta->>'gems';
      end if;
      v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
      if coalesce(v_r->>'error', '') <> 'already_settled' then
        raise exception 'GATE(d) %: the replay was not refused: %', v_case, v_r;
      end if;
      select gold, gems into v_g0, v_m0 from public.player_state where user_id = v_a and slot = 0;
      if v_g0 <> v_g1 or v_m0 <> v_m1
         or (select count(*) from public.player_ledger where user_id = v_a and kind = 'rally') <> v_n + 1 then
        raise exception 'GATE(d) %: the refused replay paid or journalled', v_case;
      end if;
    end loop;

    raise exception using errcode = 'HR871', message = 'quest-xp-absence-pay §4 complete — rolling back';
  exception when sqlstate 'HR871' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF — the probe left nothing behind (CLAUDE.md §2).
  if exists (select 1 from public.player_state        where user_id in (v_a, v_b))
     or exists (select 1 from public.player_skills    where user_id in (v_a, v_b))
     or exists (select 1 from public.player_progress  where user_id in (v_a, v_b))
     or exists (select 1 from public.player_inventory where user_id in (v_a, v_b))
     or exists (select 1 from public.player_ledger    where user_id in (v_a, v_b))
     or exists (select 1 from public.world_event_pledges where user_id in (v_a, v_b))
     or exists (select 1 from auth.users              where id in (v_a, v_b)) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    perform public.hr_assert_grant_hygiene(true);
  end if;

  raise notice 'quest-xp-absence-pay: hundred_kills credits 1,500 hitpoints XP server-side (delta = receipt, '
               'own row only, xp_in journalled, replay/budget refused); absence pays its gold/gems '
               '(delta = receipt, journalled, replay refused) on % and %', v_ek_c, v_ek_n;
end $$;
