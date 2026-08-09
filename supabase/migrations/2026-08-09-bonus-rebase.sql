-- ============================================================================
-- 2026-08-09-bonus-rebase.sql  ·  b228
--
-- THE SERVER HALF OF THE BONUS REBASE (docs/design/bonus-rebase.md §5.6).
-- DECISIONS 2026-08-09 — Tyler, binding: "the % boosts across the board are way
-- too high. 50% smithing? it should be like increments of 2%."
--
-- Almost the whole rebase is client data with no server twin: rooms, renown,
-- companions, food buffs, blessings, the muster aura, and every castle BUILDING
-- perk (hr_castle_buildings stores costs, never perks). Exactly two magnitudes
-- live on this side, and if they are left behind the client and the server
-- disagree about what a feast is worth — the client would show +4% while the
-- RPC that authorises the feast returns 0.18, and the ledger would be written
-- against a number nobody sees.
--
--   1. clan_feast_call  — the feast ladder's all_xp values
--   2. clan_rested_grant — the Rested reward, which CONVERTED from a percentage
--      potency to a flat XP quantum (§5.3)
--
-- ADDITIVE AND IDEMPOTENT. Nothing is dropped, no column is altered, no row is
-- touched: both statements are `create or replace function`, which is safe to
-- run any number of times and on a database that has never seen it. Every
-- signature, grant, guard, watermark and ledger write is preserved byte for
-- byte — the ONLY edits are the four feast constants and the rested payload.
--
-- CLIENT-FIRST. The client (features/clan-seat.js) already ships the new
-- numbers, and it reads `quantum` with a fallback, so running this migration
-- late is a mismatch and never a crash. Run it at your convenience after the
-- b228 deploy.
--
-- Requires: 2026-08-08-clan-seat.sql (creates these functions and their tables).
-- ============================================================================

-- ── 1 · THE FEAST LADDER ─────────────────────────────────────────────────────
-- 0.08 / 0.12 / 0.15 / 0.18  →  0.01 / 0.02 / 0.03 / 0.04.
-- The HOURS do not move and `last_call_ms` does not move: a feast's length is
-- what makes it an event a clan schedules its evening around, and duration is
-- outside the percent grammar. Last Call still doubles the (smaller) effect for
-- the final thirty minutes, which is now the largest single number a player
-- will see — you cannot have a peak without a plain.
create or replace function public.clan_feast_call(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype; v_role text; v_charge text;
  v_lv int; v_cap int; v_hours numeric; v_t public.clan_tavern%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role, charge into v_role, v_charge from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role <> 'leader' and coalesce(v_charge,'') <> 'steward' then
    return jsonb_build_object('ok', false, 'error', 'not_steward');
  end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;
  v_lv := coalesce(nullif(v_clan.upgrades->>'tavern','')::int, 0);
  if v_lv < 1 then return jsonb_build_object('ok', false, 'error', 'no_tavern'); end if;
  v_cap := 600 + 120 * least(10, v_lv);

  insert into public.clan_tavern (clan_id) values (p_clan_id) on conflict (clan_id) do nothing;
  select * into v_t from public.clan_tavern where clan_id = p_clan_id;
  if v_t.feast_meter < v_cap then
    return jsonb_build_object('ok', false, 'error', 'meter_short', 'meter', v_t.feast_meter, 'cap', v_cap);
  end if;
  if v_t.feast_cd_until is not null and now() < v_t.feast_cd_until then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'ready_at', v_t.feast_cd_until);
  end if;

  v_hours := case when v_lv >= 10 then 4 when v_lv >= 7 then 3 when v_lv >= 4 then 2 else 1 end;
  -- Strained holds pay for it in ceremony: +50% cooldown. Never in levels.
  update public.clan_tavern
     set feast_meter = 0,
         feast_until = now() + make_interval(secs => v_hours * 3600),
         feast_cd_until = now() + make_interval(secs =>
           20 * 3600 * case when v_clan.upkeep_state = 'strained' then 1.5 else 1 end)
   where clan_id = p_clan_id returning * into v_t;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'feast', v_hours);

  return jsonb_build_object('ok', true, 'tavern_level', v_lv, 'hours', v_hours,
    'feast_until', v_t.feast_until, 'feast_cd_until', v_t.feast_cd_until,
    -- b228 rebase: 0.18 / 0.15 / 0.12 / 0.08 → 0.04 / 0.03 / 0.02 / 0.01
    'all_xp', case when v_lv >= 10 then 0.04 when v_lv >= 7 then 0.03
                   when v_lv >= 4 then 0.02 else 0.01 end,
    'last_call_ms', case when v_lv >= 7 then 1800000 else 0 end);
end $$;
grant execute on function public.clan_feast_call(uuid) to authenticated;

-- ── 2 · RESTED XP: A QUANTUM, NOT A POTENCY ─────────────────────────────────
-- `least(10, v_lv) * 0.02` → `least(10, v_lv) * 160` XP per banked charge.
--
-- The potency multiplied ONE XP grant per charge. It was already inert at +20%,
-- and at the rebased scale it would have been worth single-digit XP — the one
-- number in the whole spec that was provably worth nothing. A flat quantum is
-- capacity rather than throughput: it cannot compound, no perk scales it, and a
-- full bank is a welcome-back a returning player can actually feel.
--
-- `potency` is still returned, hard-zeroed, so an older client that reads the
-- field gets a truthful "no percentage" rather than a stale 0.20. The strained
-- multiplier moves onto the quantum, unchanged in meaning.
--
-- The watermark, the cap, the ledger write and every guard are untouched: this
-- function's real job is being replay-proof, and none of that is being rebased.
create or replace function public.clan_rested_grant(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_charge_secs constant int := 360;      -- 1 charge per 6 minutes offline
  c_cap         constant int := 80;       -- 8 hours banked, hard cap
  c_xp_per_lv   constant int := 160;      -- b228: 160 XP/charge/level → 1,600 at L10
  v_clan public.clans%rowtype;
  v_lv int; v_seen timestamptz; v_charges int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select last_seen into v_seen from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  v_lv := coalesce(nullif(v_clan.upgrades->>'tavern','')::int, 0);

  -- A member with no stamp yet starts their clock NOW, and is granted nothing:
  -- nobody is handed a full bank on the first call after the migration.
  if v_seen is null then
    update public.clan_members set last_seen = now()
      where clan_id = p_clan_id and user_id = auth.uid();
    return jsonb_build_object('ok', true, 'charges', 0,
      'quantum', 0, 'potency', 0, 'tavern_level', v_lv);
  end if;

  v_charges := floor(extract(epoch from (now() - v_seen)) / c_charge_secs)::int;
  if v_charges <= 0 then
    return jsonb_build_object('ok', true, 'charges', 0,
      'quantum', least(10, v_lv) * c_xp_per_lv, 'potency', 0, 'tavern_level', v_lv);
  end if;
  -- Advance the watermark by WHAT WAS PAID, not to now(). Capping the grant
  -- without capping the watermark would let a member re-bank the surplus.
  update public.clan_members
     set last_seen = v_seen + make_interval(secs => v_charges * c_charge_secs)
   where clan_id = p_clan_id and user_id = auth.uid();
  v_charges := least(c_cap, v_charges);

  -- A dormant or Tavern-less hold grants charges worth nothing; that is the
  -- inert state, and it is correct — the bank is real, the quantum is zero.
  if v_lv < 1 or v_clan.upkeep_state = 'dormant' then
    return jsonb_build_object('ok', true, 'charges', v_charges,
      'quantum', 0, 'potency', 0, 'tavern_level', v_lv);
  end if;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'rested', v_charges);

  return jsonb_build_object('ok', true, 'charges', v_charges,
    'quantum', floor(least(10, v_lv) * c_xp_per_lv
               * case when v_clan.upkeep_state = 'strained' then 0.6 else 1 end),
    'potency', 0,
    'tavern_level', v_lv, 'cap', c_cap);
end $$;
grant execute on function public.clan_rested_grant(uuid) to authenticated;
