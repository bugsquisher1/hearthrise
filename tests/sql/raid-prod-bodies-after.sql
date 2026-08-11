-- ══════════════════════════════════════════════════════════════════════════
-- CANDIDATE FIX under test. Three changes, each tied to an executed exploit.
--
-- R1 (E1) raid_claim: the grace window accepted ANY string whose ::int parse
--         matched the previous week, then stored that RAW string as the
--         raid_claims primary key. ' 2953', '2953 ', 'w 2953', '\n2953\t' are
--         distinct PKs that all passed -> unbounded solo-chest replay inside
--         the 24h window. Now: strict '^w[0-9]{1,7}$' format (which also stops
--         the uncaught 22P02 on 'w+1'/garbage), and the key is RE-DERIVED
--         canonically rather than echoed back from the request.
--
-- R2 (E3) raid_claim: the contribution median -- the number that decides
--         whether another player is paid 1.3x, 1.0x, 0.6x or NOTHING -- was
--         taken over every contributor row, including accounts that joined
--         after the Hunt was declared and are themselves refused a claim by
--         the joined_after_declare / joined_after_kill rules four lines above.
--         The bar is now set only by the population eligible to be paid.
--
-- R3 (E4) raid_strike: a strike on an ALREADY-DOWNED boss was accepted and
--         banked as damage. It cannot advance the kill; its only effect is to
--         move the median, which is another player's reward. Refused.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.raid_claim__ungated(p_scope text, p_clan_id uuid, p_week text)
returns jsonb language plpgsql security definer set search_path = public as $body$
declare
  c_grace interval := interval '24 hours';
  v_week    text := public.hr_utc_week_key();
  v_target  text;
  v_raid    public.clan_raids%rowtype;
  v_t       public.hr_hunt_tiers%rowtype;
  v_boss    public.hr_hunt_bosses%rowtype;
  v_strikes int;
  v_damage  bigint;
  v_joined  timestamptz;
  v_median  bigint;
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
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_scope is null or p_scope not in ('clan','solo') then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
  end if;

  -- ── R1: THE WEEK KEY IS DERIVED, NEVER ECHOED ────────────────
  -- v_target becomes the raid_claims PRIMARY KEY, so any two request strings
  -- that pass this gate must produce the SAME key or the once-per-week
  -- guarantee is only a guarantee about strings. The format gate is checked in
  -- its own `if` (not as an `and` term) because PostgreSQL does not promise
  -- left-to-right short-circuit of a boolean expression, and hr_week_start
  -- raises 22P02 on unparseable input.
  if p_week = v_week then
    v_target := v_week;
  elsif p_week ~ '^w[0-9]{1,7}$' then
    if public.hr_week_start(p_week) = public.hr_week_start(v_week) - interval '7 days'
       and now() < public.hr_week_start(v_week) + c_grace then
      v_target := 'w' || (substr(p_week, 2)::int)::text;   -- canonical, no leading zeros
    else
      return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
  end if;

  if p_scope = 'solo' then
    insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
    values (auth.uid(), v_target, 'solo', null, null, 0.4)
    on conflict (user_id, week_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
    end if;
    return jsonb_build_object('ok', true, 'scope', 'solo', 'week', v_target,
      'scale', 0.4, 'tier', 0, 'band', 'solo', 'partial', false, 'sig', false);
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

  -- ── R2: THE BAR IS SET BY THE PAYABLE POPULATION ─────────────
  -- Same eligibility predicate as the three refusals immediately above. An
  -- account this function would refuse to pay may not decide what anyone else
  -- is paid.
  select percentile_cont(0.5) within group (order by rc.damage)::bigint into v_median
    from public.raid_contributions rc
    join public.clan_members cm on cm.clan_id = rc.clan_id and cm.user_id = rc.user_id
   where rc.clan_id = p_clan_id and rc.week_key = v_target and rc.strikes >= 3 and rc.damage > 0
     and (v_raid.declared_at is null or cm.joined_at <  v_raid.declared_at)
     and (v_raid.downed_at   is null or cm.joined_at <= v_raid.downed_at);
  if coalesce(v_median, 0) <= 0 then
    select percentile_cont(0.5) within group (order by rc.damage)::bigint into v_median
      from public.raid_contributions rc
      join public.clan_members cm on cm.clan_id = rc.clan_id and cm.user_id = rc.user_id
     where rc.clan_id = p_clan_id and rc.week_key = v_target and rc.damage > 0
       and (v_raid.declared_at is null or cm.joined_at <  v_raid.declared_at)
       and (v_raid.downed_at   is null or cm.joined_at <= v_raid.downed_at);
  end if;

  if coalesce(v_median, 0) <= 0 then
    v_band := 'full'; v_bandmul := 1.0;
  else
    v_ratio := v_damage::numeric / v_median::numeric;
    if    v_ratio >= 1.5 then v_band := 'champion'; v_bandmul := 1.3;
    elsif v_ratio >= 0.6 then v_band := 'full';     v_bandmul := 1.0;
    elsif v_ratio >= 0.2 then v_band := 'partisan'; v_bandmul := 0.6;
    else  return jsonb_build_object('ok', false, 'error', 'below_band',
            'damage', v_damage, 'median', v_median);
    end if;
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

  insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
  values (auth.uid(), v_target, 'clan', p_clan_id, v_raid.boss_id, v_scale)
  on conflict (user_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
  end if;

  update public.raid_contributions set claimed = true, claimed_at = now()
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

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
    'scale', v_scale, 'band', v_band, 'median', coalesce(v_median, 0),
    'damage', v_damage, 'strikes', v_strikes,
    'tier', coalesce(v_raid.tier, 1), 'boss_id', coalesce(v_raid.boss_id, ''),
    'partial', v_partial, 'factor', v_factor, 'sig', v_sig,
    'sig_item', coalesce(v_boss.sig_item, ''), 'standing', v_standing);
end $body$;

-- R3 — raid_strike refuses a strike on a boss that is already down.
create or replace function public.raid_strike__ungated(p_clan_id uuid, p_week text, p_boss text, p_max_hp bigint, p_damage bigint)
returns jsonb language plpgsql security definer set search_path = public as $body$
declare
  c_legacy_pool constant bigint := 250000;
  c_grace_days  constant int := 3;
  v_week   text := public.hr_utc_week_key();
  v_day    text := public.hr_utc_day_key();
  v_dow    int  := (((now() at time zone 'utc')::date - date '1970-01-01') % 7);
  v_raid   public.clan_raids%rowtype;
  v_boss   public.hr_hunt_bosses%rowtype;
  v_members int;
  v_pool   bigint;
  v_clamp  bigint;
  v_dmg    bigint;
  v_hp     bigint;
  v_downed timestamptz;
  v_rows   int;
  v_mine   bigint;
  v_strikes int;
  v_first  boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_damage is null or p_damage <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_damage');
  end if;
  if not exists (select 1 from public.clan_members
                 where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'error', 'week_mismatch',
                              'week', v_week, 'day', v_day);
  end if;

  select * into v_raid from public.clan_raids
    where clan_id = p_clan_id and week_key = v_week;

  if v_raid.clan_id is null then
    if v_dow < c_grace_days then
      return jsonb_build_object('ok', false, 'error', 'no_hunt',
        'week', v_week, 'day', v_day,
        'tier_ceiling', public.hr_max_hunt_tier(p_clan_id));
    end if;
    select * into v_boss from public.hr_hunt_bosses where boss_id = p_boss and 1 between tier_min and tier_max;
    if v_boss.boss_id is null then
      select * into v_boss from public.hr_hunt_bosses
        where 1 between tier_min and tier_max order by def asc, boss_id asc limit 1;
    end if;
    select count(*)::int into v_members from public.clan_members where clan_id = p_clan_id;
    v_pool := coalesce(public.hr_hunt_pool(1, v_members), c_legacy_pool);
    insert into public.clan_raids
        (clan_id, week_key, boss_id, hp_remaining, max_hp, tier,
         declared_at, declared_by, members_at_declare)
    values (p_clan_id, v_week, coalesce(v_boss.boss_id, left(coalesce(p_boss,'unknown'), 64)),
            v_pool, v_pool, 1, now(), null, v_members)
    on conflict (clan_id, week_key) do nothing;
    select * into v_raid from public.clan_raids
      where clan_id = p_clan_id and week_key = v_week;
  end if;

  -- ── R3: NO STRIKING A CORPSE ─────────────────────────────────
  -- A strike after downed_at cannot advance the kill. Its only remaining
  -- effect is to raise raid_claim's contribution median, which is how much
  -- SOMEONE ELSE is paid -- so a client-authored p_damage crosses into another
  -- player's reward with nothing to buy it back.
  if v_raid.downed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_downed',
      'day', v_day, 'week', v_week, 'max_hp', v_raid.max_hp, 'tier', v_raid.tier,
      'members', v_raid.members_at_declare, 'hp_remaining', v_raid.hp_remaining,
      'downed', true);
  end if;

  v_pool  := greatest(1, coalesce(v_raid.max_hp, c_legacy_pool));
  v_clamp := public.hr_hunt_clamp(v_pool);
  v_dmg   := least(p_damage, v_clamp);

  insert into public.raid_contributions
      (clan_id, week_key, user_id, damage, strikes, last_strike_day, first_strike_at)
  values (p_clan_id, v_week, auth.uid(), v_dmg, 1, v_day, now())
  on conflict (clan_id, week_key, user_id) do update
     set damage          = public.raid_contributions.damage + excluded.damage,
         strikes         = public.raid_contributions.strikes + 1,
         last_strike_day = excluded.last_strike_day,
         first_strike_at = coalesce(public.raid_contributions.first_strike_at,
                                    excluded.first_strike_at)
   where public.raid_contributions.last_strike_day is distinct from excluded.last_strike_day;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_struck_today',
      'day', v_day, 'week', v_week, 'max_hp', v_pool, 'tier', v_raid.tier,
      'members', v_raid.members_at_declare,
      'hp_remaining', coalesce(v_raid.hp_remaining, v_pool),
      'downed', v_raid.downed_at is not null);
  end if;

  select damage, strikes into v_mine, v_strikes from public.raid_contributions
    where clan_id = p_clan_id and week_key = v_week and user_id = auth.uid();

  update public.clan_raids
     set first_blood_by = auth.uid(), first_blood_at = now()
   where clan_id = p_clan_id and week_key = v_week and first_blood_at is null;
  get diagnostics v_rows = row_count;
  v_first := v_rows > 0;

  update public.clan_raids
    set hp_remaining = greatest(0, hp_remaining - v_dmg),
        downed_at = case when hp_remaining - v_dmg <= 0 and downed_at is null
                         then now() else downed_at end,
        downed_by = case when hp_remaining - v_dmg <= 0 and downed_at is null
                         then auth.uid() else downed_by end
    where clan_id = p_clan_id and week_key = v_week
    returning hp_remaining, downed_at into v_hp, v_downed;

  return jsonb_build_object('ok', true, 'hp_remaining', v_hp,
    'downed', v_downed is not null, 'damage', v_dmg,
    'day', v_day, 'week', v_week, 'max_hp', v_pool,
    'tier', v_raid.tier, 'members', v_raid.members_at_declare,
    'my_damage', v_mine, 'strikes', v_strikes,
    'first_blood', v_first, 'clamp', v_clamp);
end $body$;
