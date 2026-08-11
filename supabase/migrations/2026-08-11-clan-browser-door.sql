-- ============================================================================
-- 2026-08-11-clan-browser-door.sql   — APPLIED TO PRODUCTION 2026-08-11.
--
-- Companion to 2026-08-11-clan-membership-authority.sql. That file gave clans a
-- door (`join_policy`); this one makes the door VISIBLE to the clan browser,
-- which reads `clan_leaderboard` (src/features/clans.js `listClans`).
--
-- Without it every clan in the list gets a "Join" button and the invite-only
-- ones answer `invite_only` on click — a dead-end affordance introduced by the
-- membership change itself, which is worse for the player than the state before
-- it. A security fix that leaves a button that cannot work is not finished.
--
-- `member_cap` comes along for the same reason: "12 / 15" is the difference
-- between a browser and a list, and the cap is already enforced by
-- 2026-08-11-clan-member-cap.sql's trigger, so showing it is showing the truth.
--
-- ADDITIVE ONLY. The existing eight columns keep their names, types and ORDER —
-- which is what `create or replace view` requires — and the two new ones are
-- appended, so a client that has not been rebuilt reads exactly what it read
-- yesterday.
-- ============================================================================
create or replace view public.clan_leaderboard as
 select c.id,
    c.name,
    c.level,
    c.treasury,
    c.castle_tier,
    c.standing,
    c.upkeep_state,
    count(m.user_id) as members,
    c.join_policy,
    coalesce(t.member_cap, (select min(member_cap) from public.hr_castle_tiers), 10) as member_cap
   from public.clans c
     left join public.clan_members m on m.clan_id = c.id
     left join public.hr_castle_tiers t on t.tier = greatest(1, coalesce(c.castle_tier, 1))
  group by c.id, t.member_cap
  order by c.castle_tier desc, c.standing desc, c.level desc, c.treasury desc;

do $$
declare v_cols text; v_n int;
begin
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema='public' and table_name='clan_leaderboard';
  if v_cols not like 'id,name,level,treasury,castle_tier,standing,upkeep_state,members,%' then
    raise exception 'clan_leaderboard column order changed — the deployed client reads these: %', v_cols;
  end if;
  if v_cols not like '%join_policy%' or v_cols not like '%member_cap%' then
    raise exception 'clan_leaderboard did not gain join_policy / member_cap: %', v_cols;
  end if;
  -- The added join must not fan the aggregate out. Compare against the raw
  -- truth rather than eyeballing the plan: a LEFT JOIN on a table with more
  -- than one matching row would double every member count silently.
  select count(*) into v_n from public.clan_leaderboard lb
   where lb.members is distinct from
         (select count(*) from public.clan_members m where m.clan_id = lb.id);
  if v_n > 0 then
    raise exception '% clan row(s) report a member count that disagrees with clan_members — the added join fanned the aggregate out', v_n;
  end if;
  raise notice 'clan_leaderboard OK — join_policy + member_cap published, member counts verified against clan_members';
end $$;
