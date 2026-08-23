-- 2026-08-22-raid-chest-items.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Applied by hand via the Supabase MCP (execute_sql, wrapped in begin/commit) as
-- part of a coordinated deploy with the src/features/raids.js + src/data change in
-- the same PR. It is a LIVE-RPC BODY CHANGE on the money/item surface. Read the
-- change contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- CLOSES THE INVENTORY-FLIP DATA-LOSS LANDMINE FOR THE RAID (HUNT) CHEST.
--
-- b412 (2026-08-19-muster-raid-rpc-credit.sql) moved the raid chest GOLD/GEMS
-- credit INSIDE raid_claim, atomically with the once-per-week consume. But the
-- chest ITEMS — the boss's materials (mithril_bar, ancient_rune, …) and its
-- signature spoil (slagheart_core, hollow_sigil, …) — were still MINTED
-- CLIENT-SIDE in raids.js grantReward via window.addItem, with NO server-side
-- player_inventory write. Those ids classify OWNABLE (src/data/item-authority.js),
-- so the moment the inventory absolute-replace envelope is armed they would be
-- REPLACED-TO-ZERO — deleted — because the server never wrote them and the
-- envelope omits what it does not know. That is the one irreversible mistake the
-- whole server-authority program exists to avoid (the raids.js lane was the last
-- registered arm-blocker besides the accepted worker+doubleDrop residuals).
--
-- The obstacle b450 named: the raid chest MATERIAL IDS lived only in the client
-- feature file (raids.js BOSSES[*].reward.items). This change ships the fix in
-- three parts (this migration is part 3):
--   1. src/data/raid-bosses.js — the boss reward catalogue extracted to the pure
--      data layer (published as window.RAID_BOSSES; raids.js now reads it).
--   2. hr_hunt_boss_reward — a generated DB catalogue (boss_id → ordinal +
--      material_ids + sig_item), from 2026-08-22-raid-boss-rewards.generated.sql
--      (tools/gen-raid-boss-rewards.mjs, drift-guarded in run-smoke). No client
--      value ever crosses — the RPC reads material ids from THIS table.
--   3. THIS migration — raid_claim now mints the chest materials + signature into
--      player_inventory from that catalogue, scaled the SAME way the client did.
--
-- ── SCALING (mirrors raids.js chestFor + grantReward) ───────────────────────
--   CLAN: each material qty = greatest(1, floor(each × v_scale)), where
--         each = greatest(1, round(chest_mats / n_materials)) — chest_mats is the
--         server-owned per-tier count (hr_hunt_tiers), n_materials the boss's
--         material list length. v_scale is the already-computed band × partial
--         factor. Signature ×1 only when the server's v_sig roll landed (the
--         same gate that decides 'sig' in the RPC's return).
--   SOLO: the first TWO of the week's boss's materials, qty 1 each (the client's
--         soloChestFor slices reward.items to 2 and grantReward's floor(1×0.4)=0
--         floors up to 1). The solo boss is bossOfWeek — reproduced server-side
--         with hr_fnv1a('hr-raid-'||week) % boss_count over hr_hunt_boss_reward.ordinal,
--         byte-identical to the client's fnv1a rotation. No signature for solo.
--     NOTE: in the Monday grace window a previous-week solo claim picks the boss
--     of THAT (v_target) week; the client's display preview used the current
--     week's boss. The SERVER is authoritative and deterministic by the claim's
--     own week; under the flip the client mint is gated off, so there is no
--     divergence in what the player actually receives.
--
-- ── ONCE-SHOT (no double-mint on replay, no double-credit with the gold path) ─
-- The item mint sits in the SAME branch, AFTER the SAME consume guard the b412
-- gold/gems credit does (solo: `insert … raid_claims … on conflict do nothing` +
-- row_count; clan: same). Consume + gold credit + item mint + journal are ONE
-- function/transaction: commit or roll back together. A replay conflicts, v_rows=0,
-- and is refused BEFORE any credit or mint. §3 proves it by execution.
--
-- ── JOURNAL ─────────────────────────────────────────────────────────────────
-- The existing single 'raid' ledger row now also carries the items in meta.
-- gold_in / qty_in stay ZERO and explicit: this is a fixed, server-owned,
-- once-per-period reward, NOT client-driven mint, so — like the b412 gold credit
-- and the muster chest — it is kept OUT of the accrual daily inflow budget; the
-- once-per-period guard is the real limiter. 'raid' is already in
-- player_ledger_kind_check (added with the raid credit), so no constraint widen.
--
-- ── SIGNATURE UNCHANGED ─────────────────────────────────────────────────────
-- raid_claim(text,uuid,text,int) / __ungated keep their b412 arity. Only the
-- inner BODY changes, so the A9 wrapper, the grants (revoked-before-granted) and
-- the hr_client_rpc_baseline row are untouched. `create or replace` preserves the
-- existing (revoked) ACL on the inner.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')     is null then raise exception 'player_state missing';     end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing';    end if;
  if to_regclass('public.hr_hunt_tiers')    is null then raise exception 'hr_hunt_tiers missing';    end if;
  if to_regclass('public.hr_hunt_boss_reward') is null then
    raise exception 'hr_hunt_boss_reward missing — apply 2026-08-22-raid-boss-rewards.generated.sql first';
  end if;
  if to_regprocedure('public.raid_claim__ungated(text,uuid,text,integer)') is null then
    raise exception 'raid_claim__ungated(text,uuid,text,int) not found — expected the b412 4-arg surface';
  end if;
  if to_regprocedure('public.hr_fnv1a(text)') is null then
    raise exception 'hr_fnv1a(text) not found — the solo boss rotation oracle is required';
  end if;
end $$;

-- ── 2. Replace the inner body (same arity → grants/wrapper/baseline untouched) ─
create or replace function public.raid_claim__ungated(p_scope text, p_clan_id uuid, p_week text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $body$
declare
  c_grace interval := interval '24 hours';
  c_solo_gold constant bigint := 2800;   -- src/features/raids.js SOLO_CHEST.gold
  c_solo_gems constant int    := 5;      -- src/features/raids.js SOLO_CHEST.gems
  c_solo_scale constant numeric := 0.4;  -- src/features/raids.js SOLO_SCALE
  c_solo_mats  constant int := 2;        -- src/features/raids.js soloChestFor slice(0,2)
  v_week    text := public.hr_utc_week_key();
  v_target  text;
  v_slot    int := coalesce(p_slot, 0);
  v_raid    public.clan_raids%rowtype;
  v_t       public.hr_hunt_tiers%rowtype;
  v_boss    public.hr_hunt_bosses%rowtype;
  v_strikes int;
  v_damage  bigint;
  v_joined  timestamptz;
  v_members int;
  v_share   bigint;
  v_ratio   numeric;
  v_band    text;
  v_bandmul numeric;
  v_total   bigint;
  v_factor  numeric := 1;
  v_partial boolean := false;
  v_scale   numeric;
  v_sig     boolean := false;
  v_standing bigint := 0;
  v_paid    int;
  v_rows    int;
  v_has_standing boolean;
  v_gold    bigint := 0;
  v_gems    int    := 0;
  -- chest-item locals
  v_mats    text[];
  v_mid     text;
  v_nids    int;
  v_each    int;
  v_q       bigint;
  v_items   jsonb := '[]'::jsonb;
  v_qty_total bigint := 0;
  v_nboss   int;
  v_ord     int;
  v_i       int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_scope is null or p_scope not in ('clan','solo') then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
  end if;

  -- Credit target must be the caller's own character; refused before any consume.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── R1 (2026-08-11): THE WEEK KEY IS DERIVED, NEVER ECHOED ───
  if p_week = v_week then
    v_target := v_week;
  elsif p_week ~ '^w[0-9]{1,7}$' then
    if public.hr_week_start(p_week) = public.hr_week_start(v_week) - interval '7 days'
       and now() < public.hr_week_start(v_week) + c_grace then
      v_target := 'w' || (substr(p_week, 2)::int)::text;
    else
      return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
  end if;

  if p_scope = 'solo' then
    insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
    values (auth.uid(), v_target, 'solo', null, null, c_solo_scale)
    on conflict (user_id, week_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
    end if;

    -- Solo chest: flat server constant × 0.4. Credited after the consume guard.
    v_gold := floor(c_solo_gold * c_solo_scale)::bigint;
    v_gems := floor(c_solo_gems * c_solo_scale)::int;
    update public.player_state
       set gold = coalesce(gold, 0) + v_gold,
           gems = coalesce(gems, 0) + v_gems,
           version = version + 1, updated_at = now()
     where user_id = auth.uid() and slot = v_slot;

    -- ── SOLO CHEST MATERIALS. bossOfWeek reproduced with hr_fnv1a over the
    --    catalogue ordinal (byte-identical to the client's fnv1a rotation),
    --    then the first two of that boss's materials at qty 1 each. No signature.
    select count(*)::int into v_nboss from public.hr_hunt_boss_reward;
    if coalesce(v_nboss, 0) > 0 then
      v_ord := (public.hr_fnv1a('hr-raid-' || v_target) % v_nboss)::int;
      select material_ids into v_mats from public.hr_hunt_boss_reward where ordinal = v_ord;
      if v_mats is not null then
        v_nids := least(c_solo_mats, array_length(v_mats, 1));
        for v_i in 1 .. v_nids loop
          v_mid := v_mats[v_i];
          v_q   := 1;   -- floor(1 × 0.4) = 0, floored up to 1 (soloChestFor qty 1)
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (auth.uid(), v_slot, v_mid, v_q)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
          v_items := v_items || jsonb_build_object('id', v_mid, 'qty', v_q);
          v_qty_total := v_qty_total + v_q;
        end loop;
      end if;
    end if;

    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (auth.uid(), v_slot, 'raid', 'raid_claim:solo:' || v_target,
       v_gold, 0, 0, 0, 0,
       jsonb_build_object('scope', 'solo', 'week', v_target, 'scale', c_solo_scale,
                          'gems', v_gems, 'items', v_items, 'item_qty', v_qty_total));

    return jsonb_build_object('ok', true, 'scope', 'solo', 'week', v_target,
      'scale', c_solo_scale, 'tier', 0, 'band', 'solo', 'partial', false, 'sig', false,
      'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true,
      'items', v_items);
  end if;

  if p_clan_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_clan');
  end if;
  select * into v_raid from public.clan_raids where clan_id = p_clan_id and week_key = v_target;
  if v_raid.clan_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_downed');
  end if;

  v_partial := v_raid.downed_at is null;
  if v_partial and v_target = v_week then
    return jsonb_build_object('ok', false, 'error', 'not_downed');
  end if;

  select joined_at into v_joined from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_joined is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_raid.downed_at is not null and v_joined > v_raid.downed_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_kill');
  end if;
  if v_raid.declared_at is not null and v_joined >= v_raid.declared_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_declare');
  end if;

  select strikes, damage into v_strikes, v_damage from public.raid_contributions
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

  if coalesce(v_damage, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if coalesce(v_strikes, 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));
  end if;

  v_members := greatest(1, coalesce(nullif(v_raid.members_at_declare, 0),
                 (select count(*)::int from public.clan_members where clan_id = p_clan_id), 1));
  v_share   := public.hr_hunt_share(v_raid.max_hp, v_members);
  v_ratio   := round(v_damage::numeric / v_share::numeric, 4);
  v_band    := public.hr_hunt_band(v_damage, v_share, v_partial);
  v_bandmul := public.hr_hunt_band_mul(v_band);
  if v_bandmul <= 0 then
    v_band := 'partisan'; v_bandmul := 0.6;
  end if;

  if v_partial then
    select coalesce(sum(damage), 0) into v_total from public.raid_contributions
      where clan_id = p_clan_id and week_key = v_target;
    v_factor := least(0.6, v_total::numeric / greatest(1, v_raid.max_hp)::numeric);
    if v_factor <= 0 then
      return jsonb_build_object('ok', false, 'error', 'no_contribution');
    end if;
  end if;
  v_scale := round(v_bandmul * v_factor, 4);

  select * into v_t from public.hr_hunt_tiers where tier = greatest(1, least(5, coalesce(v_raid.tier, 1)));
  select * into v_boss from public.hr_hunt_bosses where boss_id = v_raid.boss_id;

  if not v_partial and v_t.tier is not null and v_t.sig_chance > 0
     and (not v_t.sig_champion_only or v_band = 'champion') then
    v_sig := random() < v_t.sig_chance;
  end if;

  -- ── THE CONSUME. on-conflict-do-nothing; row_count = 0 is a replay.
  insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
  values (auth.uid(), v_target, 'clan', p_clan_id, v_raid.boss_id, v_scale)
  on conflict (user_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
  end if;

  update public.raid_contributions set claimed = true, claimed_at = now()
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

  -- ── THE GOLD/GEMS CREDIT (after the consume guard → exactly once). Base is the
  --    server-owned tier catalogue, scaled by the server-computed v_scale.
  v_gold := floor(coalesce(v_t.chest_gold, 0) * v_scale)::bigint;
  v_gems := floor(coalesce(v_t.chest_gems, 0) * v_scale)::int;
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  -- ── THE CHEST MATERIALS + SIGNATURE. Written to player_inventory — the source
  --    of truth the accrual absolute envelope is built FROM, so a credited item
  --    survives the flip by construction. Materials from the boss reward catalogue
  --    (server-known ids), count = round(chest_mats / n) per material, scaled by
  --    v_scale exactly as chestFor + grantReward did. Same transaction / after the
  --    consume, so a replay never reaches here and a rollback undoes it.
  select material_ids into v_mats from public.hr_hunt_boss_reward where boss_id = v_raid.boss_id;
  if v_mats is not null then
    v_nids := greatest(1, array_length(v_mats, 1));
    v_each := greatest(1, round(coalesce(v_t.chest_mats, 0)::numeric / v_nids)::int);
    foreach v_mid in array v_mats loop
      v_q := greatest(1, floor(v_each * v_scale))::bigint;
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_mid, v_q)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_items := v_items || jsonb_build_object('id', v_mid, 'qty', v_q);
      v_qty_total := v_qty_total + v_q;
    end loop;
  end if;
  if v_sig and v_boss.sig_item is not null and v_boss.sig_item <> '' then
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (auth.uid(), v_slot, v_boss.sig_item, 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    v_items := v_items || jsonb_build_object('id', v_boss.sig_item, 'qty', 1);
    v_qty_total := v_qty_total + 1;
  end if;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'raid', 'raid_claim:clan:' || v_target,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('scope', 'clan', 'week', v_target, 'band', v_band,
                        'scale', v_scale, 'tier', coalesce(v_raid.tier, 1),
                        'partial', v_partial, 'factor', v_factor, 'gems', v_gems,
                        'boss_id', coalesce(v_raid.boss_id, ''),
                        'sig', v_sig, 'items', v_items, 'item_qty', v_qty_total));

  -- Clan Standing (unchanged from b412 / 2026-08-12-raid-band-fairness.sql).
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clans' and column_name = 'standing')
    into v_has_standing;
  if v_has_standing and v_t.tier is not null and v_t.standing > 0 then
    v_standing := floor(v_t.standing * v_factor)::bigint;
    if v_standing > 0 then
      update public.clan_raids set standing_paid = true
        where clan_id = p_clan_id and week_key = v_target and standing_paid = false;
      get diagnostics v_paid = row_count;
      if v_paid > 0 then
        execute 'update public.clans set standing = standing + $1 where id = $2'
          using v_standing, p_clan_id;
        if to_regclass('public.clan_ledger') is not null then
          execute 'insert into public.clan_ledger (clan_id, user_id, kind, qty, standing) values ($1, null, ''tier'', $2, $3)'
            using p_clan_id, v_raid.tier, v_standing;
        end if;
      else
        v_standing := 0;
      end if;
    end if;
  else
    v_standing := 0;
  end if;

  return jsonb_build_object('ok', true, 'scope', 'clan', 'week', v_target,
    'scale', v_scale, 'band', v_band, 'share', v_share, 'members', v_members,
    'ratio', v_ratio, 'damage', v_damage, 'strikes', v_strikes,
    'tier', coalesce(v_raid.tier, 1), 'boss_id', coalesce(v_raid.boss_id, ''),
    'partial', v_partial, 'factor', v_factor, 'sig', v_sig,
    'sig_item', coalesce(v_boss.sig_item, ''), 'standing', v_standing,
    'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true,
    'items', v_items);
end $body$;

-- ── 3. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. Both probes live in SUBTRANSACTIONS discarded by
-- a sentinel raise (HR819) — player_ledger's retention guard refuses to delete a
-- fresh row, so subtxn rollback is the only clean teardown and this block is
-- net-zero on production.
do $$
declare
  v        jsonb;
  -- SOLO probe
  v_uid    constant uuid := '000000ba-0000-0000-0000-0000000000ba';
  v_slot   constant int := 0;
  v_wk     text := public.hr_utc_week_key();
  v_nboss  int;
  v_ord    int;
  v_mats   text[];
  v_exp    int;
  v_have   bigint;
  v_led    int; v_g0 bigint; v_g1 bigint; v_g2 bigint;
  v_it     jsonb;
  -- CLAN probe
  v_cuid   constant uuid := '000000bc-0000-0000-0000-0000000000bc';
  v_clan   uuid; v_boss text; v_maxhp bigint := 6000; v_dmg bigint := 12000;
  v_cmats  text[]; v_cnids int; v_ceach int; v_scale numeric; v_expq bigint;
  v_cled int; v_cled2 int; v_invrows int; v_invrows2 int; v_cg0 bigint; v_cg1 bigint; v_cg2 bigint;
begin
  -- (a) the inner stays non-client-callable; the wrapper stays callable.
  if has_function_privilege('authenticated', 'public.raid_claim__ungated(text,uuid,text,integer)', 'execute') then
    raise exception 'GATE(a): the __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.raid_claim(text,uuid,text,integer)', 'execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  -- (b) SOLO: mints the week's boss first-two materials at qty 1, credit-once,
  --     replay-safe with NO second mint, in a discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 0, gems = 0;

    -- independent expected: the same fnv1a rotation the RPC uses.
    select count(*)::int into v_nboss from public.hr_hunt_boss_reward;
    v_ord := (public.hr_fnv1a('hr-raid-' || v_wk) % v_nboss)::int;
    select material_ids into v_mats from public.hr_hunt_boss_reward where ordinal = v_ord;
    v_exp := least(2, array_length(v_mats, 1));

    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.raid_claim__ungated('solo', null, v_wk, v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(b): first solo claim did not credit: %', v;
    end if;
    if jsonb_array_length(v->'items') <> v_exp then
      raise exception 'GATE(b): solo returned % items, expected % (first-two of the boss)', jsonb_array_length(v->'items'), v_exp;
    end if;
    -- gold still credited (2800*0.4=1120), unchanged by the item mint.
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 1120 then raise exception 'GATE(b): solo gold credit % <> 1120', v_g1 - v_g0; end if;
    -- each returned material is present at exactly qty 1.
    for v_it in select * from jsonb_array_elements(v->'items') loop
      if (v_it->>'qty')::bigint <> 1 then raise exception 'GATE(b): solo item % qty <> 1', v_it->>'id'; end if;
      select coalesce(qty,0) into v_have from public.player_inventory
        where user_id = v_uid and slot = v_slot and item_id = v_it->>'id';
      if v_have <> 1 then raise exception 'GATE(b): solo item % not in inventory at qty 1 (found %)', v_it->>'id', v_have; end if;
    end loop;
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'raid';
    if v_led <> 1 then raise exception 'GATE(b): expected 1 raid ledger row, found %', v_led; end if;

    -- replay: refused, gold NOT re-credited, inventory qty unchanged.
    v := public.raid_claim__ungated('solo', null, v_wk, v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(b): solo replay not refused: %', v;
    end if;
    select gold into v_g2 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g2 <> v_g1 then raise exception 'GATE(b): solo replay RE-CREDITED gold'; end if;
    select coalesce(qty,0) into v_have from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = v_mats[1];
    if v_have <> 1 then raise exception 'GATE(b): solo replay DOUBLE-MINTED material % (now %)', v_mats[1], v_have; end if;

    raise exception using errcode = 'HR819', message = 'raid-chest-items §3 solo complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  -- (c) CLAN: seed a DOWNED tier-1 raid, claim, assert materials landed at the
  --     chestFor-scaled qty, one ledger row, replay refused with no double-mint.
  begin
    perform set_config('request.jwt.claim.sub', v_cuid::text, true);
    insert into auth.users (id) values (v_cuid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_cuid, 0, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;
    insert into public.clans (name, created_by) values ('_hr819_raidmat', v_cuid) returning id into v_clan;
    insert into public.clan_members (clan_id, user_id, role, joined_at)
      values (v_clan, v_cuid, 'member', now() - interval '2 days');
    select boss_id into v_boss from public.hr_hunt_bosses order by tier_min limit 1;
    insert into public.clan_raids
      (clan_id, week_key, boss_id, hp_remaining, max_hp, downed_at, tier, declared_at, members_at_declare)
    values
      (v_clan, v_wk, v_boss, 0, v_maxhp, now() - interval '1 hour', 1, now() - interval '1 day', 1);
    insert into public.raid_contributions
      (clan_id, week_key, user_id, damage, strikes, first_strike_at)
    values
      (v_clan, v_wk, v_cuid, v_dmg, 3, now() - interval '2 days');

    -- independent expected scale + per-material qty (chestFor + grantReward).
    v_scale := round(public.hr_hunt_band_mul(public.hr_hunt_band(v_dmg, public.hr_hunt_share(v_maxhp,1), false)) * 1, 4);
    select material_ids into v_cmats from public.hr_hunt_boss_reward where boss_id = v_boss;
    v_cnids := greatest(1, array_length(v_cmats, 1));
    v_ceach := greatest(1, round((select chest_mats from public.hr_hunt_tiers where tier = 1)::numeric / v_cnids)::int);
    v_expq  := greatest(1, floor(v_ceach * v_scale)::bigint);

    v := public.raid_claim__ungated('clan', v_clan, v_wk, 0);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): first clan claim did not credit: %', v;
    end if;
    -- every catalogue material is in inventory at the expected qty.
    foreach v_boss in array v_cmats loop
      select coalesce(qty,0) into v_have from public.player_inventory
        where user_id = v_cuid and slot = 0 and item_id = v_boss;
      if v_have <> v_expq then
        raise exception 'GATE(c): clan material % expected qty % in inventory, found %', v_boss, v_expq, v_have;
      end if;
    end loop;
    select count(*) into v_invrows from public.player_inventory where user_id = v_cuid and slot = 0;
    if v_invrows = 0 then raise exception 'GATE(c): no clan inventory rows written'; end if;
    select count(*) into v_cled from public.player_ledger where user_id = v_cuid and kind = 'raid';
    if v_cled <> 1 then raise exception 'GATE(c): expected 1 clan raid ledger row, found %', v_cled; end if;
    select gold into v_cg1 from public.player_state where user_id = v_cuid and slot = 0;

    -- REPLAY: refused, no second credit, no second ledger row, inventory unchanged.
    v := public.raid_claim__ungated('clan', v_clan, v_wk, 0);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): clan replay not refused: %', v;
    end if;
    select gold into v_cg2 from public.player_state where user_id = v_cuid and slot = 0;
    if v_cg2 <> v_cg1 then raise exception 'GATE(c): clan replay RE-CREDITED gold'; end if;
    select coalesce(qty,0) into v_have from public.player_inventory
      where user_id = v_cuid and slot = 0 and item_id = v_cmats[1];
    if v_have <> v_expq then raise exception 'GATE(c): clan replay DOUBLE-MINTED material % (now %)', v_cmats[1], v_have; end if;
    select count(*) into v_invrows2 from public.player_inventory where user_id = v_cuid and slot = 0;
    if v_invrows2 <> v_invrows then raise exception 'GATE(c): clan replay changed inventory row count'; end if;
    select count(*) into v_cled2 from public.player_ledger where user_id = v_cuid and kind = 'raid';
    if v_cled2 <> 1 then raise exception 'GATE(c): clan replay wrote a second raid ledger row (now %)', v_cled2; end if;

    raise exception using errcode = 'HR819', message = 'raid-chest-items §3 clan complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- rollback asserted, not assumed — for BOTH probes.
  if exists (select 1 from public.player_state       where user_id in (v_uid, v_cuid))
     or exists (select 1 from public.player_inventory where user_id in (v_uid, v_cuid))
     or exists (select 1 from public.player_ledger    where user_id in (v_uid, v_cuid))
     or exists (select 1 from public.raid_claims      where user_id in (v_uid, v_cuid))
     or exists (select 1 from public.raid_contributions where user_id = v_cuid)
     or exists (select 1 from public.clan_members     where user_id = v_cuid)
     or exists (select 1 from public.clans            where created_by = v_cuid)
     or exists (select 1 from auth.users              where id in (v_uid, v_cuid)) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  -- (d) grant-hygiene stays clean (signature unchanged, but assert it anyway).
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v := public.hr_assert_grant_hygiene(false);
    if jsonb_array_length(v->'unapproved_client_rpcs') <> 0
       or jsonb_array_length(v->'ungated_client_rpcs') <> 0
       or jsonb_array_length(v->'baseline_rows_no_longer_live') <> 0 then
      raise exception 'GATE(d): grant-hygiene drift after body change: %', v;
    end if;
  end if;

  raise notice 'raid-chest-items: inner replaced, SOLO + CLAN materials credited to player_inventory, credit-once, replay-safe (no double-mint with the gold path), grant-hygiene all green';
end $$;
