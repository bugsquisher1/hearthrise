-- 2026-08-19-muster-raid-rpc-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Tyler applies this by hand via the Supabase MCP (execute_sql, wrapped in
-- begin/commit) as part of a coordinated deploy. It is a LIVE-RPC SIGNATURE
-- CHANGE on the money surface. Do not run it against production casually, and
-- read the change contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- The weekly Hunt chest (raid_claim) and the daily Muster/Rally chest
-- (world_event_claim) both AUTHORISE and CONSUME a once-per-period claim
-- server-side, but they historically RETURNED the reward amount for the CLIENT
-- to credit into its own gold/gems. Under the gold-arming program that credit
-- path is gated OFF (clientMayWriteRecordField('gold') → false), which left the
-- claim in a broken state: the once-per-period slot would be CONSUMED while the
-- client paid ZERO — an unrecoverable lost reward. The b411 arm-safety branch
-- deferred the whole claim under arm as a safe interim (the RPC is never called,
-- so nothing is consumed). This migration is the real fix: the reward is
-- credited to player_state INSIDE the authorising RPC, atomically with the
-- consume, so claim + payout are one transaction and the client only renders it.
--
-- The amount is SERVER-AUTHORITATIVE in both cases and always was:
--   · Muster: v_gold/v_gems are computed from the contribution bands entirely
--     inside world_event_claim (2026-08-08-muster.sql §7). No client value.
--   · Raid clan chest: the base is hr_hunt_tiers.chest_gold/chest_gems (a
--     server-owned catalogue, RLS select-only) scaled by the server-computed
--     v_scale (band × partial factor). The client's chestFor() is a preview
--     copy of the same tier table; nothing crosses the wire.
--   · Raid solo chest: a flat, server-owned constant (2,800 gold · 5 gems ×
--     0.4) — pinned here as c_solo_gold/c_solo_gems so it is not read from the
--     client. This mirrors src/features/raids.js SOLO_CHEST × SOLO_SCALE.
--
-- ── SIGNATURE CHANGE ────────────────────────────────────────────────────────
-- player_state is keyed by (user_id, slot); neither RPC took a slot. Both grow
-- a trailing `p_slot int`. The OLD 3-/1-arg overloads are DROPPED (not left as a
-- second door that consumes-without-crediting). The gated wrappers + the
-- revoked __ungated bodies are re-created at the new arity. hr_client_rpc_baseline
-- is updated in the same transaction so hr_assert_grant_hygiene stays clean.
--
-- ── ONCE-SHOT CREDIT (no double-credit on replay) ──────────────────────────
-- The credit is placed AFTER the claim-consuming guard in every branch:
--   · Muster: after the conditional `update … set claimed=true … where claimed=false`
--     + `get diagnostics v_rows`; a replay is refused (already_claimed) before
--     reaching the credit — and the early `v_join.claimed` guard refuses it
--     sooner still.
--   · Raid: after the `insert … raid_claims … on conflict do nothing` +
--     `get diagnostics v_rows` guard; a replay conflicts, v_rows=0, refused
--     before the credit.
-- Because consume + credit are in ONE transaction/function, they commit or roll
-- back together. There is no window in which the week is spent but the gold is
-- not paid, and no path in which a second call pays twice.
--
-- ── NO LOST CLAIM ON A BAD SLOT ─────────────────────────────────────────────
-- A slot that names no player_state row for the caller is refused EARLY (before
-- any consume) with a clean error — the claim stays available. auth.uid() scopes
-- the credit to the caller's own rows, so a forged slot can only ever hit (or
-- miss) the caller's own player_state, never another player's.
--
-- ── JOURNAL ─────────────────────────────────────────────────────────────────
-- One player_ledger row per credit (kind 'rally' / 'raid'), signed gold in
-- `gold`, the rest in meta. gold_in / gems_in are ZERO and EXPLICIT: these are
-- fixed, server-owned, once-per-period rewards, NOT client-driven mint, so — as
-- with the hr_market_buy seller credit (2026-08-17-market-v2.sql) — they are
-- deliberately kept OUT of the accrual daily inflow budget (hr_day_budget_used
-- sums gold_in/gems_in). Counting them there could starve, or be starved by,
-- ordinary accrual; the once-per-period guard is the real limiter.
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')  is null then raise exception 'player_state missing';  end if;
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.hr_hunt_tiers') is null then raise exception 'hr_hunt_tiers missing'; end if;
  if to_regprocedure('public.raid_claim(text,uuid,text)')  is null then
    raise exception 'raid_claim(text,uuid,text) not found — expected the A9-wrapped 3-arg surface';
  end if;
  if to_regprocedure('public.world_event_claim(text)') is null then
    raise exception 'world_event_claim(text) not found — expected the A9-wrapped 1-arg surface';
  end if;
end $$;

-- ── 2. Drop the old arities (wrapper first, then the revoked inner) ─────────
drop function if exists public.raid_claim(text, uuid, text);
drop function if exists public.raid_claim__ungated(text, uuid, text);
drop function if exists public.world_event_claim(text);
drop function if exists public.world_event_claim__ungated(text);

-- ── 3. world_event_claim__ungated(p_day_key, p_slot) ───────────────────────
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join   public.world_event_joins%rowtype;
  v_tot    public.world_event_totals%rowtype;
  v_median numeric;
  v_rows   int;
  v_slot   int := coalesce(p_slot, 0);
  v_gold   bigint := 0;
  v_gems   int    := 0;
  v_seal   int    := 0;
  v_band   text   := 'none';
  v_held   boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- The credit target must be one of the caller's OWN characters. Checked BEFORE
  -- any consume, so a bad/foreign slot never spends the claim. auth.uid() scopes
  -- it to the caller, so a forged slot can only miss the caller's own rows.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Ceiling per §5.2: 7,500 gold · 10 gems · 1 Muster Seal. No hearth_token.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2; v_seal := 1;
  end if;

  -- ── THE CONSUME. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- ── THE CREDIT (after the guard → exactly once). Same transaction as the
  --    consume, so a rollback undoes both; a replay never reaches here.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems', v_gems,
                        'seals', v_seal, 'day_key', p_day_key,
                        'event_key', v_join.event_key));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold, 'gems', v_gems, 'seals', v_seal,
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true);
end $$;

-- ── 4. raid_claim__ungated(p_scope, p_clan_id, p_week, p_slot) ─────────────
create or replace function public.raid_claim__ungated(p_scope text, p_clan_id uuid, p_week text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $body$
declare
  c_grace interval := interval '24 hours';
  c_solo_gold constant bigint := 2800;   -- src/features/raids.js SOLO_CHEST.gold
  c_solo_gems constant int    := 5;      -- src/features/raids.js SOLO_CHEST.gems
  c_solo_scale constant numeric := 0.4;  -- src/features/raids.js SOLO_SCALE
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
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (auth.uid(), v_slot, 'raid', 'raid_claim:solo:' || v_target,
       v_gold, 0, 0, 0, 0,
       jsonb_build_object('scope', 'solo', 'week', v_target, 'scale', c_solo_scale,
                          'gems', v_gems));

    return jsonb_build_object('ok', true, 'scope', 'solo', 'week', v_target,
      'scale', c_solo_scale, 'tier', 0, 'band', 'solo', 'partial', false, 'sig', false,
      'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true);
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

  -- ── THE CREDIT (after the consume guard → exactly once). Base is the
  --    server-owned tier catalogue, scaled by the server-computed v_scale.
  v_gold := floor(coalesce(v_t.chest_gold, 0) * v_scale)::bigint;
  v_gems := floor(coalesce(v_t.chest_gems, 0) * v_scale)::int;
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'raid', 'raid_claim:clan:' || v_target,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('scope', 'clan', 'week', v_target, 'band', v_band,
                        'scale', v_scale, 'tier', coalesce(v_raid.tier, 1),
                        'partial', v_partial, 'factor', v_factor, 'gems', v_gems,
                        'boss_id', coalesce(v_raid.boss_id, '')));

  -- Clan Standing (unchanged from 2026-08-12-raid-band-fairness.sql).
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
    'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true);
end $body$;

-- ── 5. Re-create the gated wrappers at the new arity ───────────────────────
-- Byte-for-byte the A9 wrapper shape (2026-08-11-authenticated-surface-lockdown
-- §A9): rate-gate on the SAME bucket name, then delegate to the revoked inner.
create or replace function public.world_event_claim(p_day_key text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('world_event_claim') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.world_event_claim__ungated($1, $2);
end $w$;

create or replace function public.raid_claim(p_scope text, p_clan_id uuid, p_week text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('raid_claim') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.raid_claim__ungated($1, $2, $3, $4);
end $w$;

-- ── 6. Grants: revoke before grant. Inners unreachable, wrappers authenticated.
revoke execute on function public.world_event_claim__ungated(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.raid_claim__ungated(text, uuid, text, int) from public, anon, authenticated, service_role;

revoke execute on function public.world_event_claim(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.raid_claim(text, uuid, text, int) from public, anon, authenticated, service_role;
grant execute on function public.world_event_claim(text, int) to authenticated;
grant execute on function public.raid_claim(text, uuid, text, int) to authenticated;

-- ── 7. Update the grant-hygiene baseline to the new signatures ─────────────
-- The old (text)/(text,uuid,text) rows are dropped functions now, so they would
-- surface as `baseline_rows_no_longer_live` (reported) and the new arity would
-- surface as `unapproved_client_rpcs` (FATAL). Move both, in this transaction.
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname in ('raid_claim','world_event_claim') and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('raid_claim', 'p_scope text, p_clan_id uuid, p_week text, p_slot integer', 'authenticated',
     'reshaped 2026-08-19: added p_slot for in-RPC chest credit (muster-raid-rpc-credit)'),
    ('world_event_claim', 'p_day_key text, p_slot integer', 'authenticated',
     'reshaped 2026-08-19: added p_slot for in-RPC chest credit (muster-raid-rpc-credit)');
end $$;

-- ── 8. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. apply is atomic, so a
-- raise here reverts everything above it.
--
-- The row-writing probes (c)+(d) live in a SUBTRANSACTION that is discarded by a
-- sentinel raise — NOT by DELETE. player_ledger carries a 90-day retention guard
-- that refuses to delete a fresh row (this credit writes one), so the subtxn
-- rollback is the only clean teardown; it also means this block is net-zero on
-- production without depending on delete privileges. Same shape as the b354
-- unlock-buy self-check.
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000ab-0000-0000-0000-0000000000ab';
  v_slot  constant int := 0;
  v_g0    bigint; v_g1 bigint; v_g2 bigint; v_led int;
  v_gh    jsonb;
begin
  -- (a) the new arities exist; the old ones are gone.
  if to_regprocedure('public.raid_claim(text,uuid,text,integer)') is null
     or to_regprocedure('public.world_event_claim(text,integer)') is null then
    raise exception 'GATE: the 4-arg raid_claim / 2-arg world_event_claim did not install';
  end if;
  if to_regprocedure('public.raid_claim(text,uuid,text)') is not null
     or to_regprocedure('public.world_event_claim(text)') is not null then
    raise exception 'GATE: an old arity survived — the consume-without-credit door is still open';
  end if;

  -- (b) inners revoked from clients; wrappers callable by authenticated only.
  if has_function_privilege('authenticated', 'public.raid_claim__ungated(text,uuid,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.world_event_claim__ungated(text,integer)', 'execute') then
    raise exception 'GATE: an __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.raid_claim(text,uuid,text,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.world_event_claim(text,integer)', 'execute') then
    raise exception 'GATE: the wrappers are not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.raid_claim(text,uuid,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.world_event_claim(text,integer)', 'execute') then
    raise exception 'GATE: a claim wrapper is anon-executable';
  end if;

  -- (c)+(d) EXECUTED credit-once, replay-safety and bad-slot, in a discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- (d) FIRST — a slot the caller does not own is refused BEFORE any consume,
    --     and needs no raid_claims reset because no_character precedes the week
    --     logic and the consume entirely.
    v := public.raid_claim__ungated('solo', null, public.hr_utc_week_key(), 5);
    if v->>'ok' <> 'false' or v->>'error' <> 'no_character' then
      raise exception 'GATE(d): a bad slot was not refused cleanly: %', v;
    end if;
    if exists (select 1 from public.raid_claims where user_id = v_uid) then
      raise exception 'GATE(d): a bad-slot call CONSUMED the claim — lost-reward risk';
    end if;

    -- (c) credit-once on the owned slot 0.
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.raid_claim__ungated('solo', null, public.hr_utc_week_key(), v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): first solo claim did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 1120 then   -- 2800 * 0.4
      raise exception 'GATE(c): solo credit was % gold, expected 1120', v_g1 - v_g0;
    end if;

    -- replay: refused, and gold does NOT move again.
    v := public.raid_claim__ungated('solo', null, public.hr_utc_week_key(), v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): replay was not refused: %', v;
    end if;
    select gold into v_g2 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g2 <> v_g1 then
      raise exception 'GATE(c): replay RE-CREDITED gold (% -> %)', v_g1, v_g2;
    end if;
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'raid';
    if v_led <> 1 then
      raise exception 'GATE(c): expected exactly one raid ledger row, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'muster-raid-rpc-credit §8 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- the subtransaction is discarded; every probe row above it is gone
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- rollback asserted, not assumed.
  if exists (select 1 from public.player_state  where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.raid_claims   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §8 LEAKED a probe row';
  end if;

  -- (e) grant-hygiene is clean after the reshape (baseline moved in §7).
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_gh := public.hr_assert_grant_hygiene(false);
    if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
      raise exception 'GATE(e): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
    end if;
    if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
      raise exception 'GATE(e): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
    end if;
    if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
      raise exception 'GATE(e): grant-hygiene reports baseline drift: %', v_gh->'baseline_rows_no_longer_live';
    end if;
  end if;

  raise notice 'muster-raid-rpc-credit: arities, grants, credit-once, replay-safe, bad-slot, grant-hygiene all green';
end $$;
