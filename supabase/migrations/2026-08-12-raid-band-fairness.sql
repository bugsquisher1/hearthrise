-- 2026-08-12-raid-band-fairness.sql
--
-- THE HUNT'S REWARD BAND STOPS BEING A COMPARISON BETWEEN PLAYERS.
--
-- Owner: Game Designer. This is a DESIGN change, not a security patch. The
-- security pass (2026-08-11-raid-claim-authority.sql) closed R1-R4 and then
-- explicitly declined this one, writing:
--
--     "below_band must stop being a total denial driven by client-authored
--      p_damage -- floor it at partisan, or band against max_hp instead of
--      against other players' numbers. R2/R3 raise the cost; they do not
--      remove the primitive."
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE MECHANIC AS IT STANDS (verified by execution, tests/raid-band-denial.mjs)
--
--   median = percentile_cont(0.5) over the eligible contributors
--   ratio  = my damage / median
--     ratio >= 1.5  -> champion   x1.3
--     ratio >= 0.6  -> full       x1.0
--     ratio >= 0.2  -> partisan   x0.6
--     ratio <  0.2  -> below_band -> ok:false. NO CHEST AT ALL.
--
-- The denial needs no forgery and no attacker. percentile_cont interpolates,
-- so in a two-member clan the median IS the mean of the two: every point of
-- damage the stronger member deals raises the bar the weaker member is judged
-- against, one-for-one. A clan of two where A does 50,000 and B does 9,000 has
-- B at ratio 0.31 -- a Partisan's share. A then plays HARDER, honestly, to
-- 350,000, and B -- who did not change anything -- drops to 0.05 and is paid
-- NOTHING. One member's good week deletes another member's entire chest.
--
-- That is a co-operative weekly event in which the correct selfish play is to
-- hope your clanmates underperform. It is the exact inversion of what the
-- Hunt is for.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE RULING. Both named options, because each one alone leaves a channel open.
--
-- (1) BAND AGAINST THE BOSS, NOT THE ROSTER.
--     benchmark = max_hp / members_at_declare  -- "your share of the Hunt".
--     The pool is DEFINED as base + per_member x members_at_declare, so this
--     benchmark is the design's own per-head weight. It is size-independent
--     (which is why the original design rejected a flat percentage: 10% of the
--     pool is one member's share in a clan of ten and four members' share in a
--     clan of forty), it is fixed the moment the Hunt is declared, and no
--     other player's number appears in it anywhere.
--
-- (2) FLOOR THE LADDER AT PARTISAN. below_band is deleted as an outcome.
--     Banding against max_hp alone is NOT sufficient, and this is the part
--     worth being explicit about: total damage is bounded by the pool, so the
--     shares are a contended resource. A member who eats 70% of the boss
--     (7 days x the 10% clamp) leaves less HP for everyone else to earn a
--     share out of. With the denial still in place that laundered the same
--     primitive through a different pipe. With no unpaid band, it cannot:
--     there is no longer any action ANY player can take that moves ANY other
--     player below being paid.
--
-- (3) A PARTIAL WEEK IS PENALISED ONCE, NOT TWICE.
--     On a week the boss survived, sum(damage) < max_hp by construction, so
--     everybody's ratio is depressed -- and the payout is ALREADY multiplied
--     by factor = min(0.6, clan damage / max_hp). Banding a failed week
--     against the full boss would cut the consolation prize a second time
--     (band 0.6 x factor 0.3 = 0.18 where the old rule paid 0.30). So on a
--     partial week the band floors at `full` and only the champion step can
--     still be earned. The kill stays strictly better: factor <= 0.6 and no
--     signature drop on a partial.
--
-- ── WHAT STILL STOPS A FREE-RIDER (the bands were never the anti-freeload) ──
--   * damage = 0                      -> 'no_contribution'.  Unchanged.
--   * strikes < 2                     -> 'too_few_strikes'.  Unchanged. Two
--     strikes are two SEPARATE UTC days (raid_strike's last_strike_day guard),
--     so a chest costs a member two logins inside the week. That gate is
--     absolute -- it cannot be moved by anybody else's play -- and it is the
--     one that actually kills the one-tap.
--   * joined after the Hunt was declared, or after the kill -> refused.
--   * The clan-wide cost of a free-rider is unchanged and now SOLELY honest:
--     every member raises max_hp at declaration, so somebody who does not
--     fight makes the boss bigger and the kill less likely, which lowers the
--     partial factor for the whole roster. They cost you the KILL. They no
--     longer cost you your BAND, which was never a thing they had earned the
--     right to do.
--
-- ── WHAT IT DOES TO THE INCENTIVE TO SHOW UP ──────────────────────────────
--   The spread is unchanged at 2.17x (partisan 0.6 -> champion 1.3) and is now
--   reachable by every member independently: 1.5x your own share makes you a
--   Champion whether or not the clan's best player had a good week. Under the
--   median rule a member of a strong clan could not reach Champion at all
--   without out-damaging the middle of a strong distribution -- effort was
--   graded on a curve. Champion is also self-limiting without needing a curve:
--   sum(damage) ~ max_hp and sum(share) = max_hp, so sum(ratio) ~ members and
--   at most two thirds of a roster can be at 1.5x. Champion inflation is
--   bounded by the boss, arithmetically, not by a comparison.
--
-- ── BALANCE / EXPLOIT REVIEW ──────────────────────────────────────────────
--   * NOT an XP multiplier. The Hunt chest pays gold, gems, materials and a
--     signature drop. It never touches allXP/combatXP, so it is outside the
--     +52% permanent-power fuse (pacing-overhaul.md A.4, CONFLICTS 2026-08-08
--     §3) and cannot move the 8-week first-99 anchor. No pacing interaction.
--   * The payout ceiling is UNCHANGED: champion x1.3 was always reachable and
--     still is, once per week per member, and the once-per-week guarantee is
--     the raid_claims (user_id, week_key) primary key, untouched here.
--   * The payout FLOOR rises from 0 to 0.6 for a member who struck twice and
--     landed under the old 20%-of-median line. Worst case that is one extra
--     0.6 chest per member per week, and only for members who were being
--     denied by other people's arithmetic. It is a correction, not a faucet.
--   * `p_damage` remains client-authored fiction with a ceiling until combat
--     is server-owned. This migration does not fix that and does not claim to.
--     What it removes is the CROSSING: a forged p_damage can now only inflate
--     the forger's OWN band, which is self-harm-free but not theft. Under the
--     median rule the same forged number reached into a stranger's chest.
--   * Standing is untouched (flat per kill, guarded by standing_paid).
-- ══════════════════════════════════════════════════════════════════════════

-- ── §1. THE LADDER, AS DATA-SHAPED FUNCTIONS ──────────────────────────────
-- The band rule lives in one IMMUTABLE function rather than inline in
-- raid_claim, for three reasons: the commit gate below can then assert the
-- ladder itself with no clans, no memberships and no rows on production; the
-- client's preview (src/features/raids.js bandFor) has one authority to
-- mirror instead of a re-reading of a plpgsql body; and a future tier-specific
-- ladder becomes an argument rather than a rewrite.

create or replace function public.hr_hunt_share(p_max_hp bigint, p_members int)
returns bigint language sql immutable as $$
  select greatest(1::bigint,
    greatest(1::bigint, coalesce(p_max_hp, 0)) / greatest(1, coalesce(p_members, 0))::bigint)
$$;

create or replace function public.hr_hunt_band(p_damage bigint, p_share bigint, p_partial boolean)
returns text language sql immutable as $$
  select case
    when coalesce(p_damage, 0) <= 0 then 'none'
    when coalesce(p_damage,0)::numeric / greatest(1, coalesce(p_share,1))::numeric >= 1.5 then 'champion'
    when coalesce(p_damage,0)::numeric / greatest(1, coalesce(p_share,1))::numeric >= 0.5 then 'full'
    -- §3: a week the boss survived is scaled by `factor` already; do not also
    -- step the band down for a shortfall the whole clan shared.
    when coalesce(p_partial, false) then 'full'
    else 'partisan'
  end
$$;

create or replace function public.hr_hunt_band_mul(p_band text)
returns numeric language sql immutable as $$
  select case p_band
    when 'champion' then 1.3
    when 'full'     then 1.0
    when 'partisan' then 0.6
    else 0 end::numeric
$$;

-- Grant hygiene, per 2026-08-11-grant-hygiene.sql: nothing is left callable by
-- `public`/`anon`. These three are pure arithmetic on numbers the client
-- already has, so `authenticated` may call them to render an honest preview --
-- but they decide nothing, and raid_claim reaches them as SECURITY DEFINER
-- regardless. Role-guarded so the PGlite harness can apply this file verbatim.
do $$
begin
  revoke all on function public.hr_hunt_share(bigint,int) from public;
  revoke all on function public.hr_hunt_band(bigint,bigint,boolean) from public;
  revoke all on function public.hr_hunt_band_mul(text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.hr_hunt_share(bigint,int) from anon';
    execute 'revoke all on function public.hr_hunt_band(bigint,bigint,boolean) from anon';
    execute 'revoke all on function public.hr_hunt_band_mul(text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.hr_hunt_share(bigint,int) to authenticated';
    execute 'grant execute on function public.hr_hunt_band(bigint,bigint,boolean) to authenticated';
    execute 'grant execute on function public.hr_hunt_band_mul(text) to authenticated';
  end if;
end $$;

-- ── §2. raid_claim: the median is gone ────────────────────────────────────
-- Everything above the band block is 2026-08-11-raid-claim-authority.sql
-- verbatim: R1's derived week key, the membership and joined_at refusals, the
-- damage>0 and strikes>=2 gates. Only the bar moves.

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
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_scope is null or p_scope not in ('clan','solo') then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
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

  -- THE ANTI-FREERIDE GATES. Both absolute, neither movable by another player.
  if coalesce(v_damage, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if coalesce(v_strikes, 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));
  end if;

  -- ── THE BAR IS THE BOSS, NOT THE ROSTER ──────────────────────
  -- members_at_declare is snapshotted server-side when the Hunt is declared
  -- and is `not null default 0`; pre-declare legacy rows read 0, so those fall
  -- back to the live roster rather than to a share of 1 member (= the whole
  -- boss), which would deny everyone. The fallback can only LOWER the bar,
  -- and with no unpaid band a lowered bar cannot deny anybody.
  v_members := greatest(1, coalesce(nullif(v_raid.members_at_declare, 0),
                 (select count(*)::int from public.clan_members where clan_id = p_clan_id), 1));
  v_share   := public.hr_hunt_share(v_raid.max_hp, v_members);
  v_ratio   := round(v_damage::numeric / v_share::numeric, 4);
  v_band    := public.hr_hunt_band(v_damage, v_share, v_partial);
  v_bandmul := public.hr_hunt_band_mul(v_band);
  -- Belt and braces: hr_hunt_band cannot return 'none' here (damage > 0 was
  -- refused above), but a zero multiplier must never silently become a zero
  -- chest for a member the gates above agreed to pay.
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

  -- `share` replaces `median` in the envelope. The old key is NOT kept alive
  -- as an alias: a client that still renders "Median <n>" would be printing
  -- this number under a label that is now a lie, and a wrong label on a
  -- correct number is the failure mode that hid the ranged styles for months.
  -- A pre-b331 client reads +out.median as 0 and shows nothing, which is
  -- honest; src/features/raids.js is updated in the same commit.
  return jsonb_build_object('ok', true, 'scope', 'clan', 'week', v_target,
    'scale', v_scale, 'band', v_band, 'share', v_share, 'members', v_members,
    'ratio', v_ratio, 'damage', v_damage, 'strikes', v_strikes,
    'tier', coalesce(v_raid.tier, 1), 'boss_id', coalesce(v_raid.boss_id, ''),
    'partial', v_partial, 'factor', v_factor, 'sig', v_sig,
    'sig_item', coalesce(v_boss.sig_item, ''), 'standing', v_standing);
end $body$;

-- ══════════════════════════════════════════════════════════════════════════
-- SELF-VERIFYING COMMIT GATE. apply_migration is atomic here, so a raise in
-- this block reverts every change above it.
--
-- What this block PROVES on production, by executing:
--   * the ladder itself, as a truth table, including the case that used to be
--     a denial (a member at 1/200th of their share is a Partisan, not a
--     refusal) and the case that must NOT become free (zero damage is 'none');
--   * that the benchmark is a pure function of the boss -- hr_hunt_share
--     takes no player argument, so it is not possible for it to be one;
--   * STRUCTURALLY, that raid_claim's compiled body no longer contains
--     percentile_cont and no longer contains the string 'below_band'. This is
--     the real commit gate: it reads pg_proc.prosrc, so it fails if this file
--     is applied and then something re-installs the old body.
--   * CONTROL -- the ordinary current-week solo claim still pays, so none of
--     the above can pass by refusing everything. Writes one raid_claims row
--     for a synthetic uuid belonging to no account and deletes it in the same
--     transaction.
--
-- What it does NOT prove: the end-to-end denial and its removal, which need
-- clans, memberships, contributions and a downed boss. Those are proven by
-- differential execution of these exact bodies on PGlite (PostgreSQL 18) in
-- tests/raid-band-denial.mjs -- before vs after, with a free-rider control.
-- Stated rather than implied.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v      jsonb;
  v_uid  constant text := '000000fe-0000-0000-0000-0000000000fe';
  v_src  text;
  r      record;
begin
  -- §1 the ladder, as a truth table
  for r in select * from (values
      -- damage,  share, partial, expected band
      (150000::bigint,  50000::bigint, false, 'champion'),   -- 3.0x  own share
      ( 75000::bigint,  50000::bigint, false, 'champion'),   -- 1.5x  the boundary
      ( 74999::bigint,  50000::bigint, false, 'full'),       -- just under it
      ( 50000::bigint,  50000::bigint, false, 'full'),       -- exactly your share
      ( 25000::bigint,  50000::bigint, false, 'full'),       -- 0.5x  the boundary
      ( 24999::bigint,  50000::bigint, false, 'partisan'),   -- just under it
      (   250::bigint,  50000::bigint, false, 'partisan'),   -- 1/200th -- WAS A DENIAL
      (     1::bigint,  50000::bigint, false, 'partisan'),   -- one point of damage
      (     0::bigint,  50000::bigint, false, 'none'),       -- nothing is still nothing
      (    -5::bigint,  50000::bigint, false, 'none'),
      (   250::bigint,  50000::bigint, true,  'full'),       -- §3 partial: penalised once
      (150000::bigint,  50000::bigint, true,  'champion')    -- §3 champion still earnable
    ) as t(dmg, share, partial, want)
  loop
    if public.hr_hunt_band(r.dmg, r.share, r.partial) is distinct from r.want then
      raise exception 'BAND LADDER: damage=% share=% partial=% gave %, expected %',
        r.dmg, r.share, r.partial, public.hr_hunt_band(r.dmg, r.share, r.partial), r.want;
    end if;
  end loop;
  if public.hr_hunt_band_mul('partisan') <> 0.6
     or public.hr_hunt_band_mul('full') <> 1.0
     or public.hr_hunt_band_mul('champion') <> 1.3
     or public.hr_hunt_band_mul('none') <> 0 then
    raise exception 'BAND LADDER: the multipliers moved';
  end if;

  -- §1b the benchmark is the boss. 5000 + 3000x10 over 10 members = 3500 each.
  if public.hr_hunt_share(35000, 10) <> 3500 then
    raise exception 'SHARE: a Tier I pool for 10 members must be 3,500 a head, got %',
      public.hr_hunt_share(35000, 10);
  end if;
  if public.hr_hunt_share(35000, 0) <> 35000 or public.hr_hunt_share(0, 10) <> 1 then
    raise exception 'SHARE: the degenerate inputs must not divide by zero';
  end if;
  -- Structural: no player argument exists, so no player can be an input.
  if pg_get_function_identity_arguments('public.hr_hunt_share(bigint,int)'::regprocedure)
     is distinct from 'p_max_hp bigint, p_members integer' then
    raise exception 'SHARE: the benchmark signature changed -- re-read the ruling before widening it';
  end if;

  -- §2 the median is structurally gone from the claim path
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'raid_claim__ungated';
  if v_src is null then
    raise exception 'raid_claim__ungated is missing';
  end if;
  if v_src ~ 'percentile_cont' then
    raise exception 'raid_claim still ranks players against each other (percentile_cont present)';
  end if;
  if v_src ~ 'below_band' then
    raise exception 'raid_claim can still return below_band -- the denial is not removed';
  end if;
  if v_src !~ 'hr_hunt_band' or v_src !~ 'hr_hunt_share' then
    raise exception 'CONTROL: raid_claim is not using the new ladder at all';
  end if;
  -- CONTROL on the structural checks: the gates that must NOT have been
  -- removed while the band block was rewritten.
  if v_src !~ 'too_few_strikes' or v_src !~ 'no_contribution'
     or v_src !~ 'joined_after_declare' or v_src !~ 'joined_after_kill' then
    raise exception 'CONTROL: an eligibility refusal was lost in the rewrite';
  end if;

  -- §3 CONTROL -- the legitimate path must still pay
  perform set_config('request.jwt.claim.sub', v_uid, true);
  v := public.raid_claim__ungated('solo', null, public.hr_utc_week_key());
  if coalesce(v->>'ok','') <> 'true' then
    raise exception 'CONTROL: the ordinary current-week solo claim no longer works: %', v;
  end if;
  if not exists (select 1 from public.raid_claims where user_id = v_uid::uuid) then
    raise exception 'CONTROL: claim reported ok but wrote no ledger row';
  end if;
  delete from public.raid_claims where user_id = v_uid::uuid;
  if exists (select 1 from public.raid_claims where user_id = v_uid::uuid) then
    raise exception 'CONTROL: probe row could not be removed';
  end if;

  -- grants unchanged: the ungated body stays non-client-callable
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             join lateral aclexplode(p.proacl) a on true
             where n.nspname = 'public' and p.proname = 'raid_claim__ungated'
               and pg_get_userbyid(a.grantee) in ('anon','authenticated','public')) then
    raise exception 'GRANT: raid_claim__ungated became client-callable';
  end if;

  raise notice 'raid-band-fairness: ladder + share + structural + control checks all green';
end $$;
