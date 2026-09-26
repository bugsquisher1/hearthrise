-- 2026-09-28-journeymans-road.sql
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY.
--   Class C (money + a tradeable surface): hr_claim_quest gains six quests that
--   pay gold and credit player_inventory. Security pre-review: GO-WITH-CHANGES;
--   every numbered condition of that GO is implemented below and named where it
--   lands. The Coordinator applies it with `node tools/apply-migration.mjs
--   supabase/migrations/2026-09-28-journeymans-road.sql` (one file, never inside
--   begin/commit - it contains `do $$` blocks), NEVER during [00:00,00:10) UTC.
--
--   ORDER: after 2026-09-07-goal-counter-kind-check.sql (its GATE(d) reads the
--   quest body this file replaces) and 2026-09-27-ledger-of-firsts.sql.
--   The client half (src/legacy.js QUEST_DEFS chain:'road', goal-catalogue.js,
--   accrue.js EVENT_COUNTER_PROJECTION, the Home Road card) ships at the next
--   cut AFTER this applies; before it applies the road rows would claim and be
--   refused unknown_quest.
--
-- LIVE-HASH DRIFT: hr_claim_quest__ungated is tracked ("floor","pin") and this
--   file becomes its last toucher, so tests/live-hash-drift.mjs reads the repo
--   AHEAD of production until the apply. The baseline is Coordinator-only and
--   is not edited here: stage (repo-ahead) -> apply -> `--live --write` + why.
--
-- ==========================================================================
-- WHAT THIS DOES - Journeyman's Road (content pack 7)
-- ==========================================================================
-- When the five starter quests end (~hour 2), six more pick up. Each is graded
-- on a LIFETIME server counter (kind 'stat', period '') that goalProgressOps
-- already writes for the matching GOAL_EVENT, and each pays once per character:
--
--   road_forge    ev:smithed  >= 60   700 gold + iron_pickaxe x1
--   road_craft    ev:crafted  >= 60   700 gold + iron_axe x1
--   road_cook     ev:cooked   >= 60   600 gold + oak_rod x1
--   road_gather   ev:gather   >= 500 1000 gold
--   road_hunt     ev:kill_any >= 500 1500 gold + bone_key x1
--   road_harvest  ev:harvest  >= 40  1500 gold + potato_seed x10
--
-- Numbers: Designer rulings of 2026-09-26 (B1 road_hunt and B3 road_gather
-- CONFIRMED as one-off signposts that stack on the dailies the same work pays;
-- B2 relabels two client strings only). Bound three ways by
-- tests/quest-reward-parity.mjs and tests/goal-catalogue-drift.mjs, which now
-- read THIS file as the chain end of tests/schema-apply-order.json.
--
-- ── WHAT CANNOT BE MINTED (for the Security review) ────────────────────────
--   · The client still sends a QUEST ID and a SLOT, nothing else. An unknown id
--     answers unknown_quest before any read or write.
--   · Completion is read from the server's own lifetime counter; gold is the
--     CASE literal; items are hr_quest_rewards (RLS on, no policy, no client
--     privilege - re-proven by §4(b)).
--   · The once-guard is the unchanged (user, slot, 'quest', id) claim row,
--     inserted BEFORE any credit; a replay is already_claimed and pays nothing
--     (§4(d), executed for all 10 quests).
--   · A forged CLIENT counter cannot claim: the client's G.stats.ev* fields are
--     display projections of this counter and are never sent; §4(d) proves the
--     claim at goal-1 is refused even though no client value is consulted.
--
-- ── FAUCET CEILING (stated as a Security condition) ────────────────────────
--   Per character, ONCE EVER: 6,000 gold + iron_pickaxe + iron_axe + oak_rod +
--   bone_key + 10 potato_seed. x6 character slots per account. No period, no
--   repeat, no player input to the size.
--
--   RETROACTIVE PAYOUT, measured read-only on production 2026-09-26: 44 claims
--   become payable on the first tick after the client ships (3 forge, 4 craft,
--   11 cook, 18 gather, 3 hunt, 5 harvest) = about 41,500 gold + 3 pickaxes,
--   4 axes, 11 rods, 3 bone keys and 50 potato seeds. Those characters did the
--   work; the counter was already lifetime when this file was written.
--
-- ── RESIDUALS, ACCEPTED AND STATED ─────────────────────────────────────────
--   BANK CAP. No bank-cap gate here, for the reason 2026-09-06 gives (a full bag
--   would permanently refuse a once-ever reward). hr_apply's cap check is an
--   absolute count after the write, so a character at cap can end up to 8 NEW
--   stacks / 53 items over it (was 3 stacks / 40 items), until they free a
--   stack. Self-only, degradable, bounded. No character is within 5 stacks of
--   its cap today (measured 2026-09-26).
--
--   ROAD_HUNT FORGE. hr_credit_kills (authenticated, 60/min bucket) has a
--   bounty branch that adds client-claimed kills to lifetime ev:kill_any. Its
--   only limit is the physics cap measured from accepted_at; it has NO active_id
--   check. About 4 minutes of forged credit reaches 500, i.e. 1,500 gold +
--   bone_key per character, x6 slots. ACCEPTED as a bounded residual (the
--   2026-09-01 §C4 ruling): the forged counter is a GATE, not a multiplier; it
--   pays once ever; it is journalled (quest_claim:road_hunt +
--   hr_kill_credit_log.claimed, claimed_raw on a throttled forgery).
--   DETECTION (read-only): non-free
--   hr_kill_credit_log `applied` at 80% or more of ev:kill_any at the time of
--   the road_hunt claim. ev:kill_any AT CLAIM TIME is not journalled, but it
--   was >= the goal the ledger row records, so the goal is used as the floor:
--   this flags a SUPERSET (a false positive costs a manual look, a false
--   negative would cost the finding).
--     select q.user_id, q.slot, q.at as claimed_at, k.credited,
--            (q.meta->>'goal')::bigint as goal_at_claim
--       from public.player_ledger q
--       cross join lateral (
--         select coalesce(sum(l.applied), 0) as credited
--           from public.hr_kill_credit_log l
--          where l.user_id = q.user_id and l.slot = q.slot
--            and l.created_at <= q.at and not l.free) k
--      where q.kind = 'quest' and q.intent = 'quest_claim:road_hunt'
--        and k.credited >= 0.8 * (q.meta->>'goal')::bigint;
--   REOPEN if road_hunt's payout exceeds 2,000 gold, gains a tradeable item, or
--   becomes repeatable; the fix then is to grade on ev:kill_any minus
--   ev:kill_credited_any, as renown R5 does.
--
-- ── OWNERSHIP ──────────────────────────────────────────────────────────────
--   This file OWNS hr_quest_rewards' ROWS (delete + refill, all 8) and the
--   hr_claim_quest__ungated body. It does NOT recreate the table, its shape
--   helper or its constraint (2026-09-06 owns those), and it does NOT restate
--   the wrapper hr_claim_quest: the live wrapper routes refusals through
--   hr_note_rejection (2026-09-12), and restating it from a template would
--   delete the refusal journal. §4(e) proves that journal still writes.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   Re-applying 2026-09-06-quest-item-rewards.sql restores the 4-arm body and
--   the 3-row catalogue (its own §0 accepts this body: it has the farmhand arm
--   and reads ev:harvest). Items already credited are ordinary player rows and
--   are left alone.
--   ⚠ NEVER re-apply 2026-09-04-goal-gold-retune.sql or
--     2026-09-06-quest-item-rewards.sql on production after this file except
--     as that deliberate rollback: either silently deletes the six road arms
--     (and 09-04 the item credit too).
--
-- NOT RE-RUNNABLE BY DESIGN: §0 fails closed unless the database holds exactly
-- the pre-state this file was reviewed against (3 catalogue rows, 4 arms). A
-- second apply stops at §0 and changes nothing.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
declare
  v_src text;
  v_n   int;
  v_line text;
begin
  if to_regclass('public.hr_quest_rewards') is null then
    raise exception 'PRECONDITION: hr_quest_rewards is absent - apply 2026-09-06-quest-item-rewards.sql first';
  end if;
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_quest__ungated(text,int) is absent';
  end if;
  if to_regprocedure('public.hr_claim_quest(text,integer)') is null then
    raise exception 'PRECONDITION: the wrapper hr_claim_quest(text,int) is absent';
  end if;
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'PRECONDITION: hr_note_rejection(text,int,jsonb) is absent - apply 2026-09-12-hr-rejections-journal.sql first';
  end if;

  -- (i) the catalogue holds EXACTLY the three rows 2026-09-06 seeded.
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 3 then
    raise exception 'PRECONDITION: hr_quest_rewards holds % row(s), expected exactly the 3 of 2026-09-06 - '
                    'diff the live catalogue before replacing it', v_n;
  end if;
  select count(*) into v_n from public.hr_quest_rewards q
   join (values ('first_cook',  '{"shrimp": 30}'::jsonb),
                ('first_blood', '{"turnip_seed": 5}'::jsonb),
                ('farmhand',    '{"wheat_seed": 5}'::jsonb)) k(id, items)
     on k.id = q.quest_id and k.items = q.items;
  if v_n <> 3 then
    raise exception 'PRECONDITION: hr_quest_rewards does not hold the 3 known rows byte-for-byte (% match)', v_n;
  end if;

  -- (ii) the INSTALLED body is the reviewed 2026-09-06 body. Read with prosrc:
  --      this is a read, not a patch, and tests/live-hash-drift.mjs treats every
  --      caller of the functiondef helper as a function patcher.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_claim_quest__ungated' limit 1;
  foreach v_line in array array[
    E'    when ''gatherer''    then v_key := ''ev:gather'';   v_goal := 15; v_gold := 150;\n',
    E'    when ''first_cook''  then v_key := ''ev:cooked'';   v_goal := 5;  v_gold := 200;\n',
    E'    when ''first_blood'' then v_key := ''ev:kill_any''; v_goal := 5;  v_gold := 150;\n',
    E'    when ''farmhand''    then v_key := ''ev:harvest'';  v_goal := 6;  v_gold := 500;\n']
  loop
    if position(v_line in v_src) = 0 then
      raise exception 'PRECONDITION: the installed hr_claim_quest__ungated lacks the known arm line % - '
                      'it is not the body this file extends', v_line;
    end if;
  end loop;
  select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
  if v_n <> 4 then
    raise exception 'PRECONDITION: the installed hr_claim_quest__ungated has % quest arm(s), expected exactly 4', v_n;
  end if;
  if position('ev:planted' in v_src) > 0 then
    raise exception 'PRECONDITION: the installed hr_claim_quest__ungated names ev:planted - re-review '
                    '(2026-09-07-goal-counter-kind-check.sql GATE(d))';
  end if;
  if position('select items into v_cat from public.hr_quest_rewards where quest_id = p_quest_id;' in v_src) = 0 then
    raise exception 'PRECONDITION: the installed hr_claim_quest__ungated does not read hr_quest_rewards - '
                    'it predates 2026-09-06 and would lose the item credit';
  end if;

  -- (iii) every id this file grants exists in the id authority.
  select count(*) into v_n from unnest(array['iron_pickaxe','iron_axe','oak_rod','bone_key','potato_seed']) i
   where not exists (select 1 from public.hr_items h where h.item_id = i);
  if v_n > 0 then
    raise exception 'PRECONDITION: % road reward id(s) are missing from hr_items - regenerate the catalogue', v_n;
  end if;
end $$;

-- ── 1. hr_quest_rewards - THIS FILE NOW OWNS THE ROWS ──────────────────────
-- Delete and refill, all 8: the 3 rows of 2026-09-06 byte-identical, plus the 5
-- road rows that pay items (road_gather pays gold only, so it has no row -
-- absence is the normal case). Kept in lockstep with goal-catalogue.js
-- QUEST_REWARDS and legacy.js QUEST_DEFS by tests/quest-reward-parity.mjs.
delete from public.hr_quest_rewards;
insert into public.hr_quest_rewards (quest_id, items) values
  ('first_cook',  '{"shrimp": 30}'),
  ('first_blood', '{"turnip_seed": 5}'),
  ('farmhand',    '{"wheat_seed": 5}'),
  ('road_forge',   '{"iron_pickaxe": 1}'),
  ('road_craft',   '{"iron_axe": 1}'),
  ('road_cook',    '{"oak_rod": 1}'),
  ('road_hunt',    '{"bone_key": 1}'),
  ('road_harvest', '{"potato_seed": 10}');

-- ── 2. hr_claim_quest__ungated - the 2026-09-06 body + six arms ────────────
-- VERBATIM from 2026-09-06-quest-item-rewards.sql §2; the only change is the
-- six road arms after farmhand. The four existing arm lines are byte-identical
-- (§0 read them off the installed body; §4(c) re-reads them off this one).
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

  -- ── NEW: PLAN THE ITEM MINT (pure reads, BEFORE the consume) ─────────────
  -- An id hr_items does not know is skipped and REPORTED, never minted and
  -- never fatal: an authoring typo must not cost a player their once-ever quest
  -- reward, and it must not create an inventory row for an item that does not
  -- exist. Planning before the consume also means an unreadable catalogue can
  -- never burn the claim slot.
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

  -- ── NEW: THE ITEM CREDIT — additive upsert, same transaction as the gold ──
  -- No bank-cap gate, deliberately: see the header. A rollback anywhere below
  -- takes the consume and the gold with it, so the claim stays claimable.
  for v_k, v_v in select key, value from jsonb_each_text(v_ok) loop
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (auth.uid(), v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  end loop;

  -- ONE journal row, never one per component. meta.items/meta.skipped_items make
  -- the whole payout reconstructible from the append-only ledger alone.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'quest', 'quest_claim:' || p_quest_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('quest', p_quest_id, 'goal', v_goal, 'check_key', v_key,
                        'items', v_ok, 'skipped_items', v_skip));

  return jsonb_build_object('ok', true, 'quest', p_quest_id, 'gold', v_gold,
    'slot', v_slot, 'credited', true, 'items', v_ok, 'skipped_items', v_skip);
end $$;

-- ── 3. Grants - the inner is no client's; the wrapper is authenticated's ───
-- `create or replace` preserves the ACL; these re-assert it for a rebuild. The
-- wrapper's BODY is not touched (see OWNERSHIP above) - only its grant.
revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;
grant  execute on function public.hr_claim_quest(text, int) to authenticated;

-- ── 4. SELF-VERIFYING COMMIT GATE (executed, not markers) ──────────────────
-- Apply is atomic: a raise here reverts everything above. Row-writing probes run
-- in an HR852-discarded subtransaction (player_ledger's retention guard refuses
-- to DELETE a fresh row, so the rollback is the only clean teardown).
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000c0-0000-0000-0000-0000000028a1';
  v_slot  constant int  := 0;
  v_alt   constant int  := 1;
  r       record;
  v_src   text;
  v_line  text;
  v_n     int;
  v_g0    bigint;
  v_g1    bigint;
  v_inv0  jsonb;
  v_inv1  jsonb;
  v_delta jsonb;
  v_ok    int := 0;
  v_grants text;
begin
  -- (a) THE CATALOGUE: exactly 8 rows, each exact, every id real, shape holds.
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 8 then
    raise exception 'VERIFY(a): hr_quest_rewards holds % row(s), expected 8', v_n;
  end if;
  select count(*) into v_n from public.hr_quest_rewards q
   join (values ('first_cook',   '{"shrimp": 30}'::jsonb),
                ('first_blood',  '{"turnip_seed": 5}'::jsonb),
                ('farmhand',     '{"wheat_seed": 5}'::jsonb),
                ('road_forge',   '{"iron_pickaxe": 1}'::jsonb),
                ('road_craft',   '{"iron_axe": 1}'::jsonb),
                ('road_cook',    '{"oak_rod": 1}'::jsonb),
                ('road_hunt',    '{"bone_key": 1}'::jsonb),
                ('road_harvest', '{"potato_seed": 10}'::jsonb)) k(id, items)
     on k.id = q.quest_id and k.items = q.items;
  if v_n <> 8 then
    raise exception 'VERIFY(a): only % of the 8 catalogue rows match exactly', v_n;
  end if;
  select count(*) into v_n
    from public.hr_quest_rewards q, lateral jsonb_each_text(q.items) e
   where not exists (select 1 from public.hr_items i where i.item_id = e.key);
  if v_n > 0 then
    raise exception 'VERIFY(a): % catalogue id(s) are not in hr_items - authored and never paid', v_n;
  end if;
  select count(*) into v_n from public.hr_quest_rewards where not public.hr_quest_rewards_items_ok(items);
  if v_n > 0 then
    raise exception 'VERIFY(a): % catalogue row(s) fail the items shape check', v_n;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_quest_rewards'::regclass
                    and conname  = 'hr_quest_rewards_items_qty_digits' and convalidated) then
    raise exception 'VERIFY(a): the items shape constraint is gone or not validated';
  end if;

  -- (b) PRIVILEGES. has_table_privilege over the full PG17 verb list (follows
  --     role membership; role_table_grants cannot see MAINTAIN). Roles absent
  --     from this database are skipped, because the call raises on them.
  select coalesce(string_agg(gg || ':' || pv, ', ' order by gg, pv), '') into v_grants
    from unnest(array['anon','authenticated','service_role','hr_engine']) gg
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE',
                            'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
   where exists (select 1 from pg_roles rr where rr.rolname = gg)
     and has_table_privilege(gg, 'public.hr_quest_rewards'::regclass, pv);
  if v_grants <> '' then
    raise exception 'VERIFY(b): client privilege(s) on hr_quest_rewards: %', v_grants;
  end if;
  if not exists (select 1 from pg_class where oid = 'public.hr_quest_rewards'::regclass and relrowsecurity) then
    raise exception 'VERIFY(b): RLS is not enabled on hr_quest_rewards';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'hr_quest_rewards';
  if v_n <> 0 then
    raise exception 'VERIFY(b): hr_quest_rewards has % policy/policies, expected 0', v_n;
  end if;
  if has_function_privilege('authenticated', 'public.hr_claim_quest__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_quest__ungated(text,integer)', 'execute') then
    raise exception 'VERIFY(b): hr_claim_quest__ungated is client-executable - the rate gate and the refusal journal are bypassable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'VERIFY(b): the wrapper hr_claim_quest is not callable by authenticated - the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'VERIFY(b): the wrapper hr_claim_quest is anon-executable';
  end if;

  -- (c) THE BODY. No ev:planted (the backfilled lifetime plant stock stays
  --     unpayable - 2026-09-07 GATE(d)); positive control on every key it
  --     grades; the 4 original arm lines byte-identical; exactly 10 arms.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_claim_quest__ungated' limit 1;
  if position('ev:planted' in v_src) > 0 then
    raise exception 'VERIFY(c): hr_claim_quest__ungated names ev:planted - the 27 backfilled lifetime '
                    'plant counters would pay retroactively through the quest path';
  end if;
  foreach v_line in array array['ev:gather','ev:cooked','ev:kill_any','ev:harvest','ev:smithed','ev:crafted'] loop
    if position('''' || v_line || '''' in v_src) = 0 then
      raise exception 'VERIFY(c): the body no longer names % - the ev:planted check above proves nothing', v_line;
    end if;
  end loop;
  foreach v_line in array array[
    E'    when ''gatherer''    then v_key := ''ev:gather'';   v_goal := 15; v_gold := 150;\n',
    E'    when ''first_cook''  then v_key := ''ev:cooked'';   v_goal := 5;  v_gold := 200;\n',
    E'    when ''first_blood'' then v_key := ''ev:kill_any''; v_goal := 5;  v_gold := 150;\n',
    E'    when ''farmhand''    then v_key := ''ev:harvest'';  v_goal := 6;  v_gold := 500;\n']
  loop
    if position(v_line in v_src) = 0 then
      raise exception 'VERIFY(c): an original arm line changed: %', v_line;
    end if;
  end loop;
  select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
  if v_n <> 10 then
    raise exception 'VERIFY(c): the body has % quest arm(s), expected 10', v_n;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1), (v_uid, v_alt, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- (e) THE WRAPPER STILL JOURNALS A REFUSAL. An incomplete claim through
    --     hr_claim_quest (not the inner) on the ALT slot, which holds no
    --     progress, so it cannot perturb the walk below. Ledger of Firsts §4(d)
    --     precedent: if a restatement ever replaces the wrapper from a
    --     template, this is where the lost journal shows.
    v := public.hr_claim_quest('road_forge', v_alt);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'VERIFY(e): the wrapper did not refuse an incomplete road_forge: %', v;
    end if;
    select count(*) into v_n from public.hr_rejections
     where user_id = v_uid and slot = v_alt and code = 'incomplete';
    if v_n < 1 then
      raise exception 'VERIFY(e): an incomplete claim through the wrapper wrote NO hr_rejections row - '
                      'the refusal journal is gone';
    end if;
    if exists (select 1 from public.player_progress where user_id = v_uid and kind = 'quest') then
      raise exception 'VERIFY(e): a refused wrapper claim consumed the once-guard';
    end if;

    -- (d) ALL 10 QUESTS, walked per counter in ascending goal order (the stat
    --     value is SET, so a shared counter only ever rises through the walk).
    --     A FORGED CLIENT COUNTER CANNOT CLAIM: the RPC takes no count, so the
    --     only way to reach "ok" is the server row below; at goal-1 it refuses.
    for r in
      select * from (values
        ('gatherer',     'ev:gather',   15::bigint,  150::bigint, '{}'::jsonb),
        ('road_gather',  'ev:gather',   500::bigint, 1000::bigint, '{}'::jsonb),
        ('first_cook',   'ev:cooked',   5::bigint,   200::bigint, '{"shrimp": 30}'::jsonb),
        ('road_cook',    'ev:cooked',   60::bigint,  600::bigint, '{"oak_rod": 1}'::jsonb),
        ('first_blood',  'ev:kill_any', 5::bigint,   150::bigint, '{"turnip_seed": 5}'::jsonb),
        ('road_hunt',    'ev:kill_any', 500::bigint, 1500::bigint, '{"bone_key": 1}'::jsonb),
        ('farmhand',     'ev:harvest',  6::bigint,   500::bigint, '{"wheat_seed": 5}'::jsonb),
        ('road_harvest', 'ev:harvest',  40::bigint,  1500::bigint, '{"potato_seed": 10}'::jsonb),
        ('road_forge',   'ev:smithed',  60::bigint,  700::bigint, '{"iron_pickaxe": 1}'::jsonb),
        ('road_craft',   'ev:crafted',  60::bigint,  700::bigint, '{"iron_axe": 1}'::jsonb)
      ) as t(id, ckey, goal, gold, items)
    loop
      -- goal-1: refused incomplete, nothing credited, the claim NOT consumed.
      insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
        values (v_uid, v_slot, 'stat', r.ckey, r.goal - 1, '', 'active')
        on conflict (user_id, slot, kind, key, period_key) do update set value = r.goal - 1;
      select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
      select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv0
        from public.player_inventory where user_id = v_uid and slot = v_slot;
      v := public.hr_claim_quest__ungated(r.id, v_slot);
      if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'goal')::bigint <> r.goal then
        raise exception 'VERIFY(d): % at goal-1 was not refused incomplete (goal %): %', r.id, r.goal, v;
      end if;
      select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
      select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv1
        from public.player_inventory where user_id = v_uid and slot = v_slot;
      if v_g1 <> v_g0 or v_inv1 <> v_inv0 then
        raise exception 'VERIFY(d): % REFUSED at goal-1 still credited (gold % -> %)', r.id, v_g0, v_g1;
      end if;
      if exists (select 1 from public.player_progress
                  where user_id = v_uid and slot = v_slot and kind = 'quest' and key = r.id) then
        raise exception 'VERIFY(d): % refused at goal-1 CONSUMED its once-guard - it could never pay', r.id;
      end if;

      -- at goal: ok, exact gold delta, exact inventory delta, exact receipt.
      update public.player_progress set value = r.goal
       where user_id = v_uid and slot = v_slot and kind = 'stat' and key = r.ckey and period_key = '';
      v := public.hr_claim_quest__ungated(r.id, v_slot);
      if coalesce(v->>'ok', '') <> 'true' or v->>'credited' <> 'true' then
        raise exception 'VERIFY(d): % at goal did not credit: %', r.id, v;
      end if;
      v_ok := v_ok + 1;
      select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
      if v_g1 - v_g0 <> r.gold then
        raise exception 'VERIFY(d): % credited % gold, the catalogue says %', r.id, v_g1 - v_g0, r.gold;
      end if;
      select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv1
        from public.player_inventory where user_id = v_uid and slot = v_slot;
      select coalesce(jsonb_object_agg(k, d), '{}'::jsonb) into v_delta
        from (select k, coalesce((v_inv1->>k)::bigint, 0) - coalesce((v_inv0->>k)::bigint, 0) as d
                from (select jsonb_object_keys(v_inv0) as k
                      union select jsonb_object_keys(v_inv1)) ks) x
       where d <> 0;
      if v_delta <> r.items then
        raise exception 'VERIFY(d): % moved player_inventory by %, expected exactly %', r.id, v_delta, r.items;
      end if;
      if (v->'items') is distinct from r.items then
        raise exception 'VERIFY(d): % receipt items % differ from the grant %', r.id, v->'items', r.items;
      end if;
      if (v->'skipped_items') is distinct from '{}'::jsonb then
        raise exception 'VERIFY(d): % skipped items %', r.id, v->'skipped_items';
      end if;

      -- replay: already_claimed, and neither gold nor items move.
      v := public.hr_claim_quest__ungated(r.id, v_slot);
      if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
        raise exception 'VERIFY(d): % replay was not refused already_claimed: %', r.id, v;
      end if;
      select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
      select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv0
        from public.player_inventory where user_id = v_uid and slot = v_slot;
      if v_g0 <> v_g1 or v_inv0 <> v_inv1 then
        raise exception 'VERIFY(d): % replay PAID AGAIN (gold % -> %)', r.id, v_g1, v_g0;
      end if;

      -- exactly one journal row, carrying the grant.
      select count(*) into v_n from public.player_ledger
       where user_id = v_uid and kind = 'quest' and intent = 'quest_claim:' || r.id;
      if v_n <> 1 then
        raise exception 'VERIFY(d): % has % quest journal row(s), expected 1', r.id, v_n;
      end if;
      if not exists (select 1 from public.player_ledger
                      where user_id = v_uid and kind = 'quest' and intent = 'quest_claim:' || r.id
                        and meta->'items' = r.items) then
        raise exception 'VERIFY(d): the % journal row does not carry meta.items = %', r.id, r.items;
      end if;
    end loop;
    if v_ok <> 10 then
      raise exception 'VERIFY(d): walked % ok claims, expected 10', v_ok;
    end if;

    v := public.hr_claim_quest__ungated('road_nope', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_quest' then
      raise exception 'VERIFY(d): an unknown quest id was not refused unknown_quest: %', v;
    end if;

    raise exception using errcode = 'HR852', message = 'journeymans-road §4 complete - rolling back';
  exception when sqlstate 'HR852' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (f) ZERO LEAK, then grant hygiene.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.hr_rejections    where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(f): §4 LEAKED a probe row';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'VERIFY(f): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'VERIFY(f): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  else
    raise exception 'VERIFY(f): hr_assert_grant_hygiene(boolean) is absent - cannot prove grant hygiene';
  end if;

  raise notice 'journeymans-road: 8 catalogue rows exact and locked, 10 arms walked (goal-1 refused and '
               'unconsumed -> ok with exact gold/items/receipt -> replay pays nothing, one journal row '
               'each), unknown id refused, wrapper journals refusals, no ev:planted, zero leak, hygiene clean.';
end $$;
