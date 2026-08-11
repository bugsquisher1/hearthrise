-- 2026-08-11-raid-claim-authority.sql
--
-- Security pass 3 (raid_claim / raid_strike). Four defects, each EXECUTED
-- before this file was written -- see the report and
-- tests/sql/raid-claim-exploit for the differential harness (production's exact
-- pg_proc bodies, run on PGlite/PostgreSQL 18, unpatched vs patched, with
-- controls that fail if a guard simply refuses everything).
--
--   R1  raid_claim  week-key aliasing -> unbounded solo-chest replay  [CONFIRMED]
--   R2  raid_claim  ineligible accounts set the contribution median   [CONFIRMED]
--   R3  raid_strike damage banked on an already-downed boss           [CONFIRMED]
--   R4  clan_members joined_at was client-authored authorisation      [CONFIRMED]
--
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

-- R4 (E3) clan_members."join as self": the WITH CHECK pinned contributed, cp,
-- charge and role but left `joined_at` entirely to the client. joined_at is a
-- SECURITY DECISION INPUT -- raid_claim reads it for joined_after_kill and
-- joined_after_declare, and clan-seat reads it for the 72h alt-farm gate --
-- so a client-authored value there is a client-authored authorisation.
-- Pinned to the server clock with a two-minute tolerance either side (a
-- PostgREST round trip, not a game rule). The live client
-- (src/features/clans.js:139) posts {clan_id,user_id,role} and no joined_at at
-- all, so the column defaults to now() and this term is trivially satisfied.
--
-- NOTE: this does NOT close S-CAP-1 (any authenticated account can still join
-- ANY clan, because this policy is the only join path there is). That needs a
-- server-side clan_join RPC and is reported, not patched here.
-- ── OWNERSHIP CEDED (2026-08-11, Backend Architect) ────────────────────────
-- The `create policy "join as self"` that stood HERE has moved to
-- 2026-08-11-clan-membership-authority.sql §11, which closes S-CAP-1 by adding
-- the invite-only door (plus `cp_at` and `last_seen` pins) to this same policy.
--
-- WHY IT MOVED RATHER THAN COEXISTED: two migrations defining one policy is the
-- hazard 2026-08-11-authenticated-surface-lockdown.sql §2b names about
-- hr_rpc_gate's `case` — whichever applies SECOND silently deletes the other's
-- terms. 'c' sorts before 'r', so on a replay THIS file would have run last and
-- removed the door, leaving R4's pin in place and S-CAP-1 wide open again. That
-- is a regression nobody would have noticed, because R4's own assertion below
-- would still have passed.
--
-- NOTHING IS LOST. R4's pin survives verbatim in the merged policy, with the
-- SAME two-minute tolerance and the same reasoning, and the assertion below is
-- kept exactly as written — it now guards whatever definition is live rather
-- than the one this file used to install, which is strictly the better guard.
-- tests/run-sql-tests.mjs fails the build if a second definition reappears.
--
-- The merged text is in 2026-08-11-clan-membership-authority.sql §11.

-- ══════════════════════════════════════════════════════════════════════════
-- SELF-VERIFYING COMMIT GATE. apply_migration is atomic here, so a raise in
-- this block reverts every change above it.
--
-- What this block PROVES on production, by executing:
--   * R1 refusal   -- an unparseable p_week is answered with week_mismatch.
--                     BEFORE this migration the same call RAISED 22P02
--                     ("invalid input syntax for type integer: \"x\""),
--                     watched on production 2026-08-11 inside begin/rollback.
--                     A raise is what proves the request string reached
--                     hr_week_start unfiltered, which is the aliasing hole.
--   * R1 control   -- the ordinary current-week solo claim still pays, so the
--                     new gate cannot pass by refusing everything. This WRITES
--                     one raid_claims row for a synthetic uuid that belongs to
--                     no account, and DELETES it in the same transaction.
--
-- What it does NOT prove and must not be read as proving: R2, R3 and R4 are
-- proven by differential execution of these exact bodies on PGlite
-- (PostgreSQL 18) -- unpatched vs patched, with controls -- because proving
-- them here would require inventing clans, memberships and auth.users rows on
-- a live database. Stated rather than implied.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v      jsonb;
  v_uid  constant text := '000000ff-0000-0000-0000-0000000000ff';
  v_raised boolean := false;
  v_wc   text;
begin
  perform set_config('request.jwt.claim.sub', v_uid, true);

  -- R1 refusal
  begin
    v := public.raid_claim__ungated('solo', null, 'wx');
  exception when others then
    v_raised := true;
  end;
  if v_raised then
    raise exception 'R1: raid_claim still RAISES on an unparseable p_week -- the format gate is not installed';
  end if;
  if v->>'error' is distinct from 'week_mismatch' then
    raise exception 'R1: expected week_mismatch for p_week=''wx'', got %', v;
  end if;

  -- R1 refusal, the aliasing shapes themselves.
  -- HONEST NOTE: outside the Monday 00:00-24:00 UTC grace window these six
  -- also answer week_mismatch on the UNPATCHED function, because the time term
  -- fails first. This loop is therefore a regression guard, not the proof --
  -- the differential proof is the 'wx' probe above (which raised before the
  -- fix and returns after it) and the PGlite harness, which moves the calendar
  -- origin so the grace window is genuinely open and watched 7 of 8 aliases
  -- each mint a separate chest.
  foreach v_wc in array array[' 2952', '2952 ', 'w 2952', E'\n2952', '+2952', '2952'] loop
    begin
      v := public.raid_claim__ungated('solo', null, v_wc);
    exception when others then
      raise exception 'R1: p_week=% still reaches the parser and raises', quote_literal(v_wc);
    end;
    if v->>'ok' <> 'false' then
      raise exception 'R1: aliased p_week=% was ACCEPTED: %', quote_literal(v_wc), v;
    end if;
  end loop;

  -- R1 control -- the legitimate path must still pay
  v := public.raid_claim__ungated('solo', null, public.hr_utc_week_key());
  if coalesce(v->>'ok','') <> 'true' or v->>'week' <> public.hr_utc_week_key() then
    raise exception 'R1 CONTROL: the ordinary current-week solo claim no longer works: %', v;
  end if;
  if not exists (select 1 from public.raid_claims where user_id = v_uid::uuid) then
    raise exception 'R1 CONTROL: claim reported ok but wrote no ledger row';
  end if;
  delete from public.raid_claims where user_id = v_uid::uuid;
  if exists (select 1 from public.raid_claims where user_id = v_uid::uuid) then
    raise exception 'R1 CONTROL: probe row could not be removed';
  end if;

  -- R4 -- the compiled policy expression, not its source text
  select with_check into v_wc from pg_policies
   where schemaname='public' and tablename='clan_members' and policyname='join as self';
  if v_wc is null then
    raise exception 'R4: the "join as self" policy is missing -- players cannot join a clan';
  end if;
  if v_wc !~ 'joined_at' then
    raise exception 'R4: joined_at is still unconstrained in the join policy';
  end if;
  if v_wc !~ 'auth\.uid\(\) = user_id' then
    raise exception 'R4 CONTROL: the join policy no longer pins user_id to the caller';
  end if;

  -- grants must be unchanged: the ungated bodies stay non-client-callable
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             join lateral aclexplode(p.proacl) a on true
             where n.nspname='public' and p.proname in ('raid_claim__ungated','raid_strike__ungated')
               and pg_get_userbyid(a.grantee) in ('anon','authenticated','public')) then
    raise exception 'GRANT: an __ungated body became client-callable';
  end if;
  if not has_function_privilege('authenticated', 'public.raid_claim(text,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.raid_strike(uuid,text,text,bigint,bigint)', 'execute') then
    raise exception 'GRANT CONTROL: the rate-gated wrappers are no longer callable by players';
  end if;

  raise notice 'raid-claim-authority: R1 refusal + R1 control + R4 + grant checks all green';
end $$;
