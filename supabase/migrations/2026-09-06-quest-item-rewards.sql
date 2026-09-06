-- 2026-09-06-quest-item-rewards.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. It makes hr_claim_quest a writer of
--   public.player_inventory — a TRADEABLE surface — for the first time. Read
--   "WHAT CANNOT BE MINTED" below before signing it off.
--   The Coordinator applies it by hand (execute_sql, NOT wrapped in
--   begin/commit — this file contains several `do $$` blocks and must be sent
--   as-is). NOT during [00:00,00:10) UTC: the day-key crons run there.
--
--   APPLY AFTER: 2026-08-20-goal-reward-rpc-credit.sql (hr_claim_quest and its
--   gated wrapper), 2026-08-11-catalogue.generated.sql (hr_items, the id
--   authority) and 2026-09-04-goal-gold-retune.sql (the LAST file to touch
--   hr_claim_quest__ungated on production — this one restates that body, so it
--   must not be applied before the retune or it would be reverted by it).
--   §0 fails closed if any of them is absent or if the installed body does not
--   already carry the retune's numbers.
--
-- ⚠ IT MOVES A live-hash-drift BASELINE ENTRY. hr_claim_quest__ungated is
--   tracked ("floor","pin"), and this file becomes its last toucher. The repo's
--   replay md5 changes the moment this lands in the tree; production's does not
--   change until the file is APPLIED. tests/live-hash-drift.baseline.json is
--   Coordinator-only — this file does not edit it. Expected sequence: stage
--   (guard reports repo-ahead) → apply → re-measure → Coordinator updates the
--   entry and the _order_notes claim in tests/schema-apply-order.json together.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FIXES — every quest ITEM reward was phantom
-- ══════════════════════════════════════════════════════════════════════════
-- QUEST_DEFS authors item rewards (`reward:{gold, item, qty}`) and
-- src/legacy.js completeQuest paid them with `addItem(...)`, which writes
-- G.inventory and NOTHING ELSE. hr_claim_quest credited GOLD only. So the item
-- never existed on the server, and the first envelope that spoke about the id
-- took it back.
--
-- That is not a post-arm hypothetical. `shrimp` is a FISH_SPOTS product, so
-- src/data/item-authority.js `serverOwnedItem('shrimp')` is TRUE; the moment the
-- away engine EATS one, the id lands in accrue.js `consumedKeysOf` and the
-- envelope's figure for it becomes ABSOLUTE — the server says 0 and the whole
-- client-minted stack is deleted, TODAY, with the inventory arm still off. This
-- is why first_cook's 30-shrimp first-night grant was withdrawn (Security F2,
-- 2026-09-06) rather than shipped broken. The seed grants on first_blood and
-- farmhand survive only because seeds fall in item-authority's EXCLUDED set —
-- safe by which set an id happens to be in, which is not a property.
--
-- ── THE FIX: THE SERVER CREDITS THE ITEM, ON THE SAME ONCE-GUARD ───────────
-- A new server-owned catalogue table, public.hr_quest_rewards, holds the ITEM
-- half of each quest reward as a jsonb map. hr_claim_quest__ungated looks it up
-- and credits it into player_inventory in the SAME TRANSACTION as the gold,
-- behind the SAME (user_id, slot, kind='quest', key=<quest_id>) claim row that
-- already once-guards the gold, and reports what it granted as `items` on the
-- response. The client mirrors the receipt; it mints nothing.
--
-- WHY A TABLE AND NOT MORE CASE ARMS. The gold half is a CASE because it is one
-- scalar per quest. An item reward is a set, and a quest catalogue that grows
-- (the roadmap has a lot more quests in it) must grow by adding a ROW, not by
-- editing a function body — the golden rule in docs/SYSTEMS_MAP.md. It also
-- gives the parity guard something to diff. Same shape as hr_goal_rewards
-- (2026-08-23-modal-goal-claims.sql), deliberately, so there is one idiom for
-- "a server-owned reward catalogue" and not two.
--
-- ── WHAT CANNOT BE MINTED (for the security review) ────────────────────────
--   · The client sends a QUEST ID and a SLOT. Nothing else. No item, no
--     quantity, no gold, no timestamp. A forged quest id → unknown_quest.
--   · The ITEM and the QUANTITY come from hr_quest_rewards, which has RLS on,
--     NO policy and every client grant revoked (including TRUNCATE, which
--     bypasses RLS — Security C1). Only SECURITY DEFINER bodies read it.
--   · COMPLETION is still read from the server's own kind='stat' ev:<type>
--     lifetime counter. This file does not touch that test.
--   · THE ONCE-GUARD IS UNCHANGED and still runs BEFORE any credit: the claim
--     row is inserted `on conflict do nothing` and a row_count of 0 returns
--     already_claimed. Gold and items are therefore paid at most once, together
--     or not at all — one transaction, so a failure in the item credit rolls the
--     gold back too.
--   · CEILING ON THE FAUCET: the whole table is 40 items across 3 quests, each
--     payable ONCE PER CHARACTER FOR EVER. There is no period, no repeat and no
--     player input to the size, so the lifetime maximum a character can extract
--     from this file is the sum of its rows.
--   · An id absent from hr_items is SKIPPED and reported (`skipped_items`),
--     never minted — the gold_500 "small_bones" class (an authored id that
--     exists nowhere) cannot create an inventory row here.
--   · qty_in/gold_in/xp_in/gems_in stay 0 on the journal row: a fixed,
--     once-ever, server-catalogued reward is kept OUT of the accrual inflow
--     budget, exactly as the b414 gold credit and the muster/raid chest are.
--     meta.items carries the grant so the whole payout is reconstructible from
--     the append-only ledger alone.
--   · TRADEABILITY IS UNCHANGED. shrimp and the two seeds are ordinary
--     tradeable goods that the market already prices; this file adds no new
--     tradeable id and no new market path.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
--   · NO BANK-CAP GATE. hr_claim_goal (the sibling item-crediting claim) does
--     not gate on bank_cap either, and adding one here would let a full bag
--     REFUSE a once-ever quest reward — the dead-claim class. The overflow is
--     cosmetic (the client's bank cap is a UI limit) and bounded by the ceiling
--     above.
--   · NO combat-XP. hundred_kills pays XP only and is not in this table; the XP
--     arming slice owns it. Stated so the gap is visible, not forgotten.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   Re-apply 2026-09-04-goal-gold-retune.sql (which restores the gold-only
--   hr_claim_quest__ungated body), then `drop table public.hr_quest_rewards;`.
--   Items already credited are ordinary player rows and are left alone.
--
-- SAFE TO RE-RUN. Every step is guarded and §4's probes roll themselves back.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_src text;
begin
  if to_regclass('public.player_state')     is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress')  is null then raise exception 'player_progress missing'; end if;

  -- hr_items is the ID AUTHORITY this file validates its seed against. Present
  -- and EMPTY is as fatal as absent: every reward would be skipped as unknown
  -- and the file would install a catalogue that pays nothing.
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is absent — apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is empty — regenerate the catalogue. Installed against it, every quest '
                    'item reward would be skipped as an unknown id.';
  end if;

  -- The body this file restates must already exist, or `create or replace`
  -- below would install a quest claim on a database that never had one.
  if to_regprocedure('public.hr_claim_quest__ungated(text,int)') is null then
    raise exception 'hr_claim_quest__ungated is absent — apply 2026-08-20-goal-reward-rpc-credit.sql first';
  end if;

  -- ⚠ ORDER GUARD, and the reason this is not paranoia: the file this body is
  -- derived from is the b497 retune, which lowered farmhand's goal 10 -> 6 on
  -- production by patching the INSTALLED body. Applying this file over a body
  -- that still says 10 is fine (we carry 6); applying the RETUNE over THIS file
  -- afterwards would delete the item credit. Assert we are the later one.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_claim_quest__ungated';
  if v_src is null or position('''farmhand''' in v_src) = 0 then
    raise exception 'the installed hr_claim_quest__ungated has no farmhand arm — it is not the body '
                    'this file derives from. Do not apply blind; diff it first.';
  end if;
  if position('ev:harvest' in v_src) = 0 then
    raise exception 'the installed hr_claim_quest__ungated does not read ev:harvest for farmhand — '
                    'the body has diverged from the repo. Diff it before replacing it.';
  end if;

  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key is missing — apply 2026-08-08-clan-seat.sql first';
  end if;
end $$;

-- ── 1. public.hr_quest_rewards — the server-owned ITEM catalogue ───────────
-- One row per quest that pays items. `items` is {item_id: qty}; a quest with no
-- item reward simply has no row (absence is the normal case, not an empty row),
-- so adding a quest that pays nothing costs nothing here.
create table if not exists public.hr_quest_rewards (
  quest_id text primary key,
  items    jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object')
);

-- RLS on, NO policy, and every client grant revoked: this catalogue is read by
-- SECURITY DEFINER functions only. "revoke all", NOT "revoke insert, update,
-- delete" (Security C1): Supabase's default ACL on public also grants TRUNCATE,
-- REFERENCES and TRIGGER, and TRUNCATE bypasses row-level security entirely.
alter table public.hr_quest_rewards enable row level security;
revoke all on public.hr_quest_rewards from public, anon, authenticated, service_role;

-- Refilled wholesale: this file OWNS the whole table. Kept in lockstep with
-- src/data/goal-catalogue.js QUEST_REWARDS[*].items and src/legacy.js
-- QUEST_DEFS by tests/quest-reward-parity.mjs, which fails the build on a
-- one-sided edit in ANY of the three.
delete from public.hr_quest_rewards;
insert into public.hr_quest_rewards (quest_id, items) values
  /* FIRST-NIGHT IDLE RESCUE (Designer, 2026-09-05), restored on the server side.
     30 RAW shrimp — heals 3, and the INPUT half of "Cook 5 dishes", so it feeds
     the first overnight AND the cooking skill that follows it. */
  ('first_cook',  '{"shrimp": 30}'),
  ('first_blood', '{"turnip_seed": 5}'),
  ('farmhand',    '{"wheat_seed": 5}');

-- ── 2. hr_claim_quest__ungated — the gold body, plus the item credit ───────
-- RESTATED IN FULL (create or replace is the only thing that moves a body
-- already installed on production). The gold half is byte-for-byte the b497
-- catalogue; everything new is marked.
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

-- ── 3. Grants — REVOKE BEFORE GRANT, unchanged from the file this restates ──
-- `create or replace` PRESERVES the existing ACL, so these are a re-assertion
-- rather than a repair; they are here so the file is correct on a rebuild too,
-- where the body is created fresh and inherits the schema default.
revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;
grant  execute on function public.hr_claim_quest(text, int) to authenticated;

-- ── 4. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. apply is atomic, so a
-- raise here reverts everything above it. Row-writing probes live in an HR819-
-- discarded subtransaction (player_ledger's retention guard refuses to DELETE a
-- fresh row, so the subtxn rollback is the only clean teardown).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000ae-0000-0000-0000-0000000000ae';
  v_slot constant int  := 0;
  v_n    int;
  v_qty  bigint;
  v_gold bigint;
begin
  -- (a) THE SEED IS COMPLETE AND EVERY ID IS REAL. An unknown id would be
  --     silently skipped at claim time — i.e. a reward that quietly pays
  --     nothing, which is the defect this whole file exists to remove.
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 3 then
    raise exception 'VERIFY(a): hr_quest_rewards holds % row(s), expected 3', v_n;
  end if;
  select count(*) into v_n
    from public.hr_quest_rewards q, lateral jsonb_each_text(q.items) e
   where not exists (select 1 from public.hr_items i where i.item_id = e.key);
  if v_n > 0 then
    raise exception 'VERIFY(a): % quest reward id(s) are not in hr_items — they would be skipped, '
                    'i.e. authored and never paid', v_n;
  end if;
  if not exists (select 1 from public.hr_quest_rewards
                  where quest_id = 'first_cook' and (items->>'shrimp')::bigint = 30) then
    raise exception 'VERIFY(a): the first_cook first-night grant is not 30 shrimp';
  end if;

  -- (b) THE CATALOGUE IS NOT CLIENT-READABLE OR CLIENT-WRITABLE. Reading it is
  --     harmless; WRITING it is the whole economy, and a SELECT grant is how a
  --     write grant gets added later without anyone noticing the table is on the
  --     client surface at all.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_quest_rewards'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine');
  if v_n > 0 then
    raise exception 'VERIFY(b): % client grant(s) survive on hr_quest_rewards', v_n;
  end if;
  if not exists (select 1 from pg_class where oid = 'public.hr_quest_rewards'::regclass and relrowsecurity) then
    raise exception 'VERIFY(b): RLS is not enabled on hr_quest_rewards';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'hr_quest_rewards';
  if v_n > 0 then
    raise exception 'VERIFY(b): hr_quest_rewards has % policy/policies — it must be reachable only '
                    'from SECURITY DEFINER bodies', v_n;
  end if;

  -- (c) THE GATE IS NOT DECORATION. The inner stays client-unreachable and the
  --     wrapper stays reachable; a restatement that flipped either would be a
  --     dead feature or an ungated one.
  if has_function_privilege('authenticated', 'public.hr_claim_quest__ungated(text,integer)', 'execute') then
    raise exception 'VERIFY(c): the __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'VERIFY(c): hr_claim_quest is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'VERIFY(c): hr_claim_quest is anon-executable';
  end if;

  -- (d) EXECUTED: incomplete refused → credit-once (gold AND items) → replay
  --     pays nothing. Discarded subtransaction.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- incomplete is refused, and refusing must not consume the claim.
    v := public.hr_claim_quest__ungated('first_cook', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'VERIFY(d): an incomplete quest was not refused: %', v;
    end if;
    if exists (select 1 from public.player_inventory where user_id = v_uid) then
      raise exception 'VERIFY(d): a REFUSED claim credited an item';
    end if;

    -- meet the goal, then claim once.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:cooked', 5, '', 'active');
    v := public.hr_claim_quest__ungated('first_cook', v_slot);
    if v->>'ok' <> 'true' or v->>'credited' <> 'true' then
      raise exception 'VERIFY(d): the completed claim did not credit: %', v;
    end if;
    -- THE RECEIPT MUST STATE THE GRANT. The client mirrors this field; a claim
    -- that credits the row but reports nothing shows the player an empty bag
    -- until the next settle, which is the bug wearing a different hat.
    if (v->'items'->>'shrimp')::bigint is distinct from 30 then
      raise exception 'VERIFY(d): the response does not report the granted items: %', v;
    end if;
    select qty into v_qty from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = 'shrimp';
    if coalesce(v_qty, 0) <> 30 then
      raise exception 'VERIFY(d): player_inventory holds % shrimp, expected 30', coalesce(v_qty, 0);
    end if;
    select gold into v_gold from public.player_state where user_id = v_uid and slot = v_slot;
    if v_gold <> 1200 then
      raise exception 'VERIFY(d): gold is % after a 200 claim on 1000', v_gold;
    end if;

    -- REPLAY: refused, and neither half moves.
    v := public.hr_claim_quest__ungated('first_cook', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'VERIFY(d): a replay was not refused: %', v;
    end if;
    select qty into v_qty from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = 'shrimp';
    if v_qty <> 30 then
      raise exception 'VERIFY(d): a replay credited a SECOND grant (% shrimp)', v_qty;
    end if;
    select gold into v_gold from public.player_state where user_id = v_uid and slot = v_slot;
    if v_gold <> 1200 then
      raise exception 'VERIFY(d): a replay credited gold again (%)', v_gold;
    end if;

    -- ONE journal row, carrying the grant.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'quest' and intent = 'quest_claim:first_cook';
    if v_n <> 1 then
      raise exception 'VERIFY(d): expected 1 quest journal row, found %', v_n;
    end if;
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and kind = 'quest'
                      and (meta->'items'->>'shrimp')::bigint = 30) then
      raise exception 'VERIFY(d): the journal row does not carry the item grant';
    end if;

    -- A quest with NO catalogue row still pays its gold and reports {} — the
    -- absence of a row must never be an error.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:gather', 20, '', 'active');
    v := public.hr_claim_quest__ungated('gatherer', v_slot);
    if v->>'ok' <> 'true' or v->>'items' <> '{}' then
      raise exception 'VERIFY(d): an item-less quest did not claim cleanly: %', v;
    end if;

    raise exception using errcode = 'HR819', message = 'quest-item-rewards §4 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §4 LEAKED a probe row';
  end if;

  -- grant-hygiene clean after the restatement (this file adds no new RPC, so a
  -- finding here means the restatement moved an ACL it should not have).
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'VERIFY(e): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'VERIFY(e): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'quest-item-rewards: catalogue seeded (3 quests, every id real), locked to SECURITY '
               'DEFINER readers, gold+items credited once in one transaction, replay pays nothing, '
               'item-less quest unaffected.';
end $$;
