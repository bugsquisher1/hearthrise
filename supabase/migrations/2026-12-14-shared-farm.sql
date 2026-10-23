-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE FARM IS THE ACCOUNT'S (lane c-shared-farm, backend-architect,
-- 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on its passing §7, one
-- file via tools/apply-migration.mjs, never inside begin/commit, never 00:00–00:10
-- UTC. A MONEY + XP surface (seeds, crops, Farming XP, plot-tier and seed gold):
-- in the reopen Security review. Contract: docs/design/ARCHITECTURE_CONTRACTS.md §18.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-23: "Since the house is shared, the farm plot should be too. Not
-- all 4 characters can plant their own seeds." Farm land joins the house and the
-- depot as ACCOUNT-SHARED. Coordinator default (Tyler may change it): the hero who
-- acts on a plot uses their OWN seeds and gold and gets the Farming XP and the crop;
-- any hero of the account may plant, water, harvest or improve the soil. The
-- Garden's beds were already the account's and now simply widen the one field.
-- Gold (Tyler, mid-lane): every farm gold movement goes through ONE helper,
-- hr_farm_purse_pay, which today charges the acting hero; lane/c-account-gold
-- switches that one body to the account purse.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 public.account_farm (user_id) -> plot_level: the account's plot tier (no
--    row = tier 1). public.account_farm_plots (user_id, plot_idx) -> the crop, its
--    plant instant, its watering history, its regrow count and planted_by (the
--    hero's slot). A row IS a planted plot: no empty rows. Both own-read RLS, no
--    client write privilege, written only by the farm verbs below.
-- §2 helpers, owner only: hr_farm_lock (the ACCOUNT FARM advisory lock),
--    hr_farm_plot_cap(user) (the field's size: property ladder + Garden beds, the
--    account's home levels; replaces hr_farm_plot_cap(user, slot)),
--    hr_farm_plot_level(user), hr_farm_purse_pay(user, slot, gold).
-- §3 THE FOLD, once, proven on a probe first; then player_farm and
--    player_state.plot_level are DROPPED (one copy, no back-compat: CLAUDE.md §1).
--    THE FOLD RULE. Every hero's planted plots move to the account in (slot,
--    plot_idx) order as account plots 0..n-1, planted_by = that hero, the crop,
--    plant instant, watering history and regrow count unchanged; one player_ledger
--    row per plot (kind farm, intent farm_fold, the hero's slot, qty 0, meta
--    {from_plot, to_plot, crop, extra}). NOTHING IS DESTROYED: plots past the
--    account's cap become EXTRA plots (index >= cap) that grow, take water and
--    harvest like any other, take no new seed, and vanish at their harvest (no
--    regrow: tomato and emberfruit regrow without limit, so an extra plot that
--    regrew would be a permanent plot nobody bought). The account's tier = the
--    highest any hero bought, one farm_fold_tier ledger row; nothing refunded.
--    Rows of a user no longer in auth.users have no account and are not kept.
--    More than 128 plots on one account aborts the apply (loud, never lossy;
--    5 heroes x the 17-plot top of the ladder = 85).
-- §4 the five farm verbs RESTATED WHOLE from the replayed pre-images (md5 pinned in
--    §0); signatures, grants, refusals, gates and idempotency (per key, intent,
--    slot) unchanged. The plot is the account's; seeds, crops, Farming XP and the
--    day budget are the ACTING hero's; gold only through hr_farm_purse_pay; the
--    journal row is the acting hero's. Changes beyond the re-keying:
--      harvest: the seeded roll is keyed on the PLANT (planted_by, plot, plant
--               instant), so choosing which hero harvests cannot re-roll it; an
--               extra plot is deleted at its harvest; the answer says planted_by
--               and extra.
--      replant: an extra plot is not replanted (replant.error extra_plot) and no
--               seed is bought for it.
--      every index fuse is 128 (the table's), so an extra plot past 63 is reachable.
-- §5 hr_farm_land_view RESTATED WHOLE: the account's field on every hero; cap =
--    hr_farm_plot_cap (FIXES a live defect: it read the property ladder only, so a
--    Garden's beds were plantable but never drawn); each plot adds by (the planting
--    hero's slot), by_name (that hero's name, from character_names) and extra.
-- §6 anchored splices (each anchor must match exactly once; marker SHARED-FARM):
--    hr_state_of: state.plot_level = the account's tier; `farm` = the account's
--                 plots (watered_at = the last watering); same keys, same shape.
--    hr_create_character: no starter plot rows (the field's size is the cap).
--    hr_apply: the engine's per-slot `farm` delta key and its block are REMOVED
--                 (no engine sends it; it would be a second, per-hero farm writer).
--                 A delta naming `farm` is now refused unknown_delta_key.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- Two heroes of one account share no hero lock, so the field has its own: LOCK
-- ORDER acting hero row (player_state FOR UPDATE) -> ACCOUNT FARM advisory xact
-- lock (hashtextextended('hr:farm:'||uid, 0), hr_farm_lock) -> account_farm*
-- rows -> the purse. Every farm writer takes both in that order; nothing takes a
-- hero lock after the farm lock (hr_farm_harvest_replant's inner plant re-takes
-- locks this transaction already holds). Under it "occupied", "ready", "regrow"
-- and the tier's stale_level check are exact: two heroes harvesting one plot get
-- one harvest and one empty_plot. The plant is a plain insert (no upsert) behind
-- the occupied check, so a lock bug fails loud (unique violation), never
-- overwrites a crop. Siblings' versions are NOT bumped (that would take their
-- locks after ours); the client re-reads the other open heroes after an ok farm
-- intent (src/session/account-session.js, kind 'farm').
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No new client RPC; the five verbs name (slot, plot, crop | expected tier, key)
-- as before. NEW: a hero can harvest a crop another hero of the SAME account
-- planted (the ruling): the crop and XP go to the harvester, the seed was the
-- planter's. It crosses no account boundary: every row is keyed by auth.uid().
-- Re-rolling by choosing the harvester is closed (the roll is the plant's). The
-- companion yield perk is the harvester's (a choice, not a roll). XP per crop is
-- unchanged and each hero's day budget still clamps its own credit.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- Per account <= 17 plot rows (+ any fold extras) and <= 1 tier row, ~120 B each:
-- 1,000 accounts = ~2 MB. Every envelope reads one PK row and one indexed scan of
-- <= 17 rows (two reads per hero, as before). Ledger: unchanged per action; the
-- fold writes one row per planted plot, once.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-create player_farm (2026-08-11-player-state.sql, + waterings from
-- 2026-09-06) and player_state.plot_level (default 1); copy each account plot to
-- its planted_by hero (the fold's ledger rows say which hero held which plot) and
-- the account tier to every hero; re-apply the §0 pre-images (hr_farm_* from
-- 2026-12-03-daily-claims-cut.sql / 2026-11-26-farm-window.sql /
-- 2026-10-04-expected-level-idempotency.sql, hr_farm_plot_cap(uuid,int) from
-- 2026-12-01-garden-beds.sql) and hr_state_of / hr_create_character / hr_apply
-- from their last restatements plus later splices; drop the two tables.
-- ORDER: after 2026-12-11-hunt-deploy-no-forfeit.sql (and any 2026-12-12/13 file).
-- EDGE: none (hr-accrue never sends a farm op). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
-- Each restated body is either the replayed pre-image or this file's own (a
-- re-apply); anything else is a body another file moved, and restating over it
-- would silently discard that work.
do $mig$
declare v_md5 text; v_sig text; v_pre text; v_own text;
begin
  if to_regclass('public.player_farm') is null and to_regclass('public.account_farm_plots') is null then
    raise exception 'PRECONDITION: neither player_farm nor account_farm_plots exists'; end if;
  if to_regprocedure('public.hr_unlock_levels(uuid,integer)') is null or to_regclass('public.hr_room_perks') is null
     or to_regclass('public.character_names') is null or to_regprocedure('public.hr_seed(uuid,integer,text)') is null
     or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_unlock_levels, hr_room_perks, character_names, hr_seed or hr_settle_first_noted is missing'; end if;
  for v_sig, v_pre, v_own in values
    ('public.hr_farm_plant(integer,integer,text,uuid)',         '59858b6aa38a3e57b69ee5ce99b4a12e', '0c51cf0d5039cc47a2eef882ae7c6ea6'),
    ('public.hr_farm_harvest(integer,integer,uuid)',            'fb6db7329115f89d44c9f154b3ad5e2d', 'e9541e054ed5dd2a79f51f3b1d7919d5'),
    ('public.hr_farm_water(integer,integer,uuid)',              '17448ba7b3226f21fd3bb8998dc83afb', '68c370148c33add05e756ddaa2f45b60'),
    ('public.hr_farm_upgrade_plot(integer,uuid,integer)',       '310c436780a77f34e98b3247248b7e02', '43ceb8d319c2108e00f5024e10106313'),
    ('public.hr_farm_harvest_replant(integer,integer,uuid)',    '7385e211809cbcb7d1bf6e3f31a77a84', 'a16b9df14814685e68de49bbd7cdda29'),
    ('public.hr_farm_land_view(uuid,integer)',                  '0f8531097836d833c2a7577f978b1306', '1a0c792b75cadfb4fc648e604f0c2a1e')
  loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_sig);
    if v_md5 is distinct from v_pre and v_md5 is distinct from v_own then
      raise exception 'PIN: % is neither the replayed pre-image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        v_sig, v_pre, v_own, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ACCOUNT'S FIELD ───────────────────────────────────────────────────
create table if not exists public.account_farm (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  plot_level int         not null default 1 check (plot_level >= 1),
  updated_at timestamptz not null default now()
);
comment on table public.account_farm is
  '2026-12-14-shared-farm.sql (Tyler 2026-10-23): the ACCOUNT''s plot tier, shared by every hero. No row = tier 1 '
  '(hr_farm_plot_level). Written ONLY by hr_farm_upgrade_plot (SECURITY DEFINER) under the account farm lock.';
create table if not exists public.account_farm_plots (
  user_id      uuid          not null references auth.users (id) on delete cascade,
  plot_idx     int           not null check (plot_idx between 0 and 127),
  crop_id      text          not null check (crop_id ~ '^[a-z0-9_]{1,64}$'),
  planted_at   timestamptz   not null,
  waterings    timestamptz[] not null default '{}',
  regrow_count int           not null default 0 check (regrow_count >= 0),
  planted_by   int           not null check (planted_by >= 0),
  primary key (user_id, plot_idx)
);
comment on table public.account_farm_plots is
  '2026-12-14-shared-farm.sql (Tyler 2026-10-23): the ACCOUNT''s planted plots, one row per growing crop, shared by '
  'every hero. planted_by = the planting hero''s slot (display and the harvest roll''s key). Written ONLY by '
  'hr_farm_plant / hr_farm_water / hr_farm_harvest under the account farm lock.';
do $mig$
declare v_t text;
begin
  foreach v_t in array array['account_farm', 'account_farm_plots'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
    execute format('grant select on public.%I to authenticated', v_t);
    execute format('drop policy if exists %I on public.%I', v_t || ' own read', v_t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', v_t || ' own read', v_t);
  end loop;
end $mig$;

-- ── §2 THE HELPERS (owner only) ──────────────────────────────────────────────
-- THE ACCOUNT FARM LOCK: one key per account, taken after the acting hero's row lock.
create or replace function public.hr_farm_lock(p_user uuid)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended('hr:farm:' || p_user::text, 0))
$$;
revoke execute on function public.hr_farm_lock(uuid) from public, anon, authenticated, service_role;

-- THE FIELD'S SIZE: (the account's property tier + 1) * 2 + the account Garden's beds.
-- hr_unlock_levels with a NULL slot returns the account's home levels only (room,
-- property: its slot filter is `slot = p_slot or namespace in ('room','property')`).
create or replace function public.hr_farm_plot_cap(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  with lv as (
    select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int as tier,
           coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int as garden
      from public.hr_unlock_levels(p_user, null)
  )
  select (lv.tier + 1) * 2
       + coalesce((select (rp.perks->>'farmPlots')::int
                     from public.hr_room_perks rp
                    where rp.room_id = 'garden'
                      and rp.level = least(lv.garden,
                            (select max(level) from public.hr_room_perks where room_id = 'garden'))), 0)
    from lv
$$;
revoke execute on function public.hr_farm_plot_cap(uuid) from public, anon, authenticated, service_role;
drop function if exists public.hr_farm_plot_cap(uuid, int);

-- THE ACCOUNT'S PLOT TIER (no row = tier 1).
create or replace function public.hr_farm_plot_level(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select plot_level from public.account_farm where user_id = p_user), 1)
$$;
revoke execute on function public.hr_farm_plot_level(uuid) from public, anon, authenticated, service_role;

-- THE FARM'S ONE PURSE. Every farm gold movement is this call and nothing else:
-- it decides WHICH purse pays (today: the acting hero's player_state.gold) and
-- debits it atomically, predicated on the balance covering the price. Answer:
-- {ok, purse, paid, gold (the balance after, or as it stands on a refusal)}. A
-- zero price moves nothing and answers ok. The caller holds the acting hero's row
-- lock and writes the journal row (its `gold` column, meta.purse from here).
-- lane/c-account-gold changes THIS body to the account purse; no caller moves.
create or replace function public.hr_farm_purse_pay(p_user uuid, p_slot int, p_gold bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_gold bigint;
begin
  if p_gold is null or p_gold < 0 then
    raise exception 'hr_farm_purse_pay: a price is a whole number >= 0, got %', p_gold; end if;
  if p_gold > 0 then
    update public.player_state set gold = gold - p_gold, version = version + 1, updated_at = now()
     where user_id = p_user and slot = p_slot and gold >= p_gold
    returning gold into v_gold;
    if found then return jsonb_build_object('ok', true, 'purse', 'hero', 'paid', p_gold, 'gold', v_gold); end if;
  end if;
  select gold into v_gold from public.player_state where user_id = p_user and slot = p_slot;
  return jsonb_build_object('ok', p_gold = 0 and v_gold is not null, 'purse', 'hero', 'paid', 0, 'gold', v_gold);
end $$;
revoke execute on function public.hr_farm_purse_pay(uuid, int, bigint) from public, anon, authenticated, service_role;

-- ── §3 THE FOLD (once), PROVEN ON A PROBE FIRST, THEN THE PER-HERO COPIES GO ──
-- The one fold, as a session-temporary function so the probe and the real fold run
-- the SAME text. p_user scopes it (the probe); null = every account.
create or replace function pg_temp.hr_farm_fold(p_user uuid)
returns int language plpgsql as $f$
declare v_n int; v_big uuid;
begin
  select f.user_id into v_big from public.player_farm f
   where f.crop_id is not null and (p_user is null or f.user_id = p_user)
   group by f.user_id having count(*) > 128 limit 1;
  if v_big is not null then
    raise exception 'FOLD: account % holds more than 128 planted plots; the field has no index for them (nothing moved)', v_big; end if;
  with src as (
    select f.user_id, f.slot, f.plot_idx, f.crop_id, f.planted_at, f.waterings, f.regrow_count,
           (row_number() over (partition by f.user_id order by f.slot, f.plot_idx) - 1)::int as to_idx
      from public.player_farm f
     where f.crop_id is not null
       and (p_user is null or f.user_id = p_user)
       and exists (select 1 from auth.users u where u.id = f.user_id)
  ), moved as (
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
    select s.user_id, s.to_idx, s.crop_id, s.planted_at, coalesce(s.waterings, '{}'), s.regrow_count, s.slot from src s
    returning user_id
  )
  insert into public.player_ledger (user_id, slot, kind, intent, qty, meta)
  select s.user_id, s.slot, 'farm', 'farm_fold', 0,
         jsonb_build_object('from_plot', s.plot_idx, 'to_plot', s.to_idx, 'crop', s.crop_id,
                            'extra', s.to_idx >= public.hr_farm_plot_cap(s.user_id), 'to', 'account')
    from src s;
  get diagnostics v_n = row_count;
  -- THE TIER: the highest any hero bought, journalled on the (lowest) hero that holds it.
  insert into public.player_ledger (user_id, slot, kind, intent, qty, meta)
  select t.user_id, t.top_slot, 'farm', 'farm_fold_tier', 0,
         jsonb_build_object('plot_level', t.top, 'heroes', t.heroes, 'to', 'account')
    from (select ps.user_id, max(ps.plot_level) as top,
                 (array_agg(ps.slot order by ps.plot_level desc, ps.slot))[1] as top_slot,
                 jsonb_object_agg(ps.slot::text, ps.plot_level) as heroes
            from public.player_state ps
           where (p_user is null or ps.user_id = p_user)
             and exists (select 1 from auth.users u where u.id = ps.user_id)
           group by ps.user_id having max(ps.plot_level) > 1) t;
  insert into public.account_farm as a (user_id, plot_level, updated_at)
  select ps.user_id, max(ps.plot_level), now()
    from public.player_state ps
   where (p_user is null or ps.user_id = p_user)
     and exists (select 1 from auth.users u where u.id = ps.user_id)
   group by ps.user_id having max(ps.plot_level) > 1
  on conflict (user_id) do update set plot_level = greatest(a.plot_level, excluded.plot_level), updated_at = now();
  return v_n;
end $f$;

do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000fa2f01d1';
  v_n int; v_moved int; v_orph int; v_want int; v_got jsonb;
begin
  if to_regclass('public.player_farm') is null then
    raise notice 'shared-farm §3: player_farm is gone already (a re-apply) - nothing to fold';
    return;
  end if;
  -- NO FARM WRITE MAY LAND BETWEEN THE FOLD'S READ AND THE DROP: the file applies as
  -- one transaction (tools/apply-migration.mjs, one query), so these locks are held to
  -- commit; an old-body farm verb waits, then fails on the dropped table (a refused
  -- click, never a lost crop). player_state is locked by the column drop below anyway.
  lock table public.player_farm in access exclusive mode;
  lock table public.player_state in share row exclusive mode;
  -- (§3a) THE FOLD RULE, EXECUTED ON A PROBE. Hero 0: turnip in plot 0 (watered twice),
  -- carrot in plot 1, tier 1. Hero 1: wheat in plot 0 (regrown once), turnip in plot 1,
  -- tier 3. The account (no home, no Garden) has room for 2: hero 1's two are EXTRA.
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'shared-farm §3 fold probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'VERIFY(fold): the probe heroes were not made'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.player_state set plot_level = 3 where user_id = v_u and slot = 1;
    insert into public.player_farm as f (user_id, slot, plot_idx, crop_id, planted_at, waterings, regrow_count) values
      (v_u, 0, 0, 'turnip', now() - interval '3 hours', array[now() - interval '2 hours', now() - interval '30 minutes']::timestamptz[], 0),
      (v_u, 0, 1, 'carrot', now() - interval '1 hour', '{}', 0),
      (v_u, 0, 2, null, null, '{}', 0),
      (v_u, 1, 0, 'wheat', now() - interval '5 hours', '{}', 1),
      (v_u, 1, 1, 'turnip', now() - interval '10 minutes', '{}', 0)
      on conflict (user_id, slot, plot_idx) do update set crop_id = excluded.crop_id, planted_at = excluded.planted_at,
        waterings = excluded.waterings, regrow_count = excluded.regrow_count;
    v_n := pg_temp.hr_farm_fold(v_u);
    select jsonb_agg(jsonb_build_array(plot_idx, crop_id, planted_by, regrow_count, coalesce(array_length(waterings, 1), 0)) order by plot_idx)
      into v_got from public.account_farm_plots where user_id = v_u;
    if v_n <> 4 or v_got is distinct from '[[0,"turnip",0,0,2],[1,"carrot",0,0,0],[2,"wheat",1,1,0],[3,"turnip",1,0,0]]'::jsonb then
      raise exception 'VERIFY(fold): hero 0 {turnip x2 waterings, carrot} + hero 1 {wheat regrown 1, turnip} folded to % (% rows)', v_got, v_n; end if;
    if exists (select f.slot, f.crop_id, f.planted_at, f.waterings, f.regrow_count from public.player_farm f
                where f.user_id = v_u and f.crop_id is not null
               except
               select a.planted_by, a.crop_id, a.planted_at, a.waterings, a.regrow_count from public.account_farm_plots a
                where a.user_id = v_u) then
      raise exception 'VERIFY(fold): a crop''s hero, plant instant, watering history or regrow count moved in the fold'; end if;
    if public.hr_farm_plot_level(v_u) <> 3 then
      raise exception 'VERIFY(fold): the account tier is %, the highest hero bought 3', public.hr_farm_plot_level(v_u); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and kind = 'farm' and intent = 'farm_fold' and qty = 0) <> 4
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'farm_fold' and (meta->>'extra')::boolean) <> 2
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'farm_fold_tier' and slot = 1
            and (meta->>'plot_level')::int = 3 and meta->'heroes' = '{"0":1,"1":3}'::jsonb) <> 1 then
      raise exception 'VERIFY(fold): the fold journal is wrong: %',
        (select jsonb_agg(jsonb_build_object('slot', slot, 'intent', intent, 'meta', meta)) from public.player_ledger where user_id = v_u); end if;
    raise exception using errcode = 'HR916', message = 'shared-farm fold probe complete - rolling back';
  exception when sqlstate 'HR916' then null;
  end;
  if exists (select 1 from public.account_farm_plots where user_id = v_u) or exists (select 1 from public.account_farm where user_id = v_u)
     or exists (select 1 from public.player_state where user_id = v_u) then
    raise exception 'VERIFY(fold): the probe LEAKED a row'; end if;

  -- (§3b) THE REAL FOLD: every account, once.
  select count(*) into v_want from public.player_farm f
   where f.crop_id is not null and exists (select 1 from auth.users u where u.id = f.user_id);
  select count(*) into v_orph from public.player_farm f
   where f.crop_id is not null and not exists (select 1 from auth.users u where u.id = f.user_id);
  v_moved := pg_temp.hr_farm_fold(null);
  raise notice 'shared-farm §3: % planted plots folded into % accounts (% extra past the cap; % orphan rows of deleted users not kept); % account tiers above 1',
    v_moved, (select count(distinct user_id) from public.account_farm_plots),
    (select count(*) from public.account_farm_plots a where a.plot_idx >= public.hr_farm_plot_cap(a.user_id)), v_orph,
    (select count(*) from public.account_farm);
  -- (§3c) CONSERVATION: every surviving crop is on its account, by its hero, with its clocks.
  if v_moved <> v_want or exists (
       select f.user_id, f.slot, f.crop_id, f.planted_at, f.waterings, f.regrow_count from public.player_farm f
        where f.crop_id is not null and exists (select 1 from auth.users u where u.id = f.user_id)
       except
       select a.user_id, a.planted_by, a.crop_id, a.planted_at, a.waterings, a.regrow_count from public.account_farm_plots a) then
    raise exception 'VERIFY(fold): % of % crops reached the accounts, or one changed on the way', v_moved, v_want; end if;
  if exists (select 1 from (select user_id, max(plot_level) m from public.player_state group by user_id) h
              where h.m <> public.hr_farm_plot_level(h.user_id)
                and exists (select 1 from auth.users u where u.id = h.user_id)) then
    raise exception 'VERIFY(fold): an account tier is not the highest its heroes bought'; end if;
end $mig$;
drop function if exists pg_temp.hr_farm_fold(uuid);
drop table if exists public.player_farm;
alter table public.player_state drop column if exists plot_level;

-- ── §4 THE FIVE FARM VERBS, RESTATED WHOLE ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_farm_plant(p_slot integer, p_plot_idx integer, p_crop text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_plant restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's (account_farm_plots,
-- under the account farm lock); the seed, the XP and the day budget are the acting hero's.
declare
  c_max_plots constant int := 128;  -- the table's index fuse; the account's cap is finer
  c_plant_xp  constant int := 28;   -- b226 client plant grant
  v_uid   uuid := auth.uid();
  v_crop  public.hr_crops%rowtype;
  v_state public.player_state%rowtype;
  v_farm_lv int;
  v_have  bigint;
  v_budget jsonb;
  v_cached jsonb;
  v_crop_tier int;
  v_plot_cap  int;
  v_plot_level int;
  v_by    int;
begin
  if v_uid is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_plant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_plant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_plot'));
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK (lock order, file header).
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- THE ACCOUNT'S FIELD SIZE: the property ladder plus the Garden's beds.
  v_plot_cap := public.hr_farm_plot_cap(v_uid);
  if p_plot_idx >= v_plot_cap then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap));
  end if;

  -- Farming LEVEL gate, the acting hero's, re-derived from server XP.
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv));
  end if;

  -- CROP PLOT-TIER gate: crop.plot_tier must be <= the ACCOUNT's plot tier.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'crop_untiered'));
  end if;
  v_plot_level := public.hr_farm_plot_level(v_uid);
  if v_crop_tier > v_plot_level then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_plot_level));
  end if;

  select planted_by into v_by from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  if found then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_occupied', 'by', v_by));
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  -- Debit exactly one of the ACTING hero's seeds; delete-if-last (qty > 0 is a CHECK).
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  if coalesce(v_have, 0) < 1 then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item));
  end if;
  update public.player_inventory set qty = qty - 1
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item and qty > 1;
  if not found then
    delete from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  end if;

  -- Fresh plant on the account's field: DRY, not a regrow. A plain insert behind the
  -- occupied check under the farm lock: a lock defect fails loud, never overwrites a crop.
  insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
    values (v_uid, p_plot_idx, p_crop, now(), '{}', 0, p_slot);

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', c_plant_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- The LIFETIME plant count (kind 'stat', period ''), the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:planted', 1, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1, 'farming', c_plant_xp, c_plant_xp,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx, 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item, 'plant_xp', c_plant_xp);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_water(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_water restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-09-12 image: the plot is the ACCOUNT's; the watering XP is the acting hero's.
declare
  c_max_waterings constant int := 8;
  c_window_secs   constant numeric := 2 * 3600;
  v_uid    uuid := auth.uid();
  v_plot   public.account_farm_plots%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_last   timestamptz;
  v_water_xp bigint;
  v_budget jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay).
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_water') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_water', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_water') then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  select * into v_plot from public.account_farm_plots
    where user_id = v_uid and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  if public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now()) >= v_crop.base_hours then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'already_ready'));
  end if;
  if coalesce(array_length(v_plot.waterings, 1), 0) >= c_max_waterings then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'water_capped'));
  end if;
  select max(w) into v_last from unnest(coalesce(v_plot.waterings, '{}'::timestamptz[])) as w;
  if v_last is not null and v_last + make_interval(secs => c_window_secs) > now() then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'still_watered',
      'ready_at', v_last + make_interval(secs => c_window_secs)));
  end if;

  v_water_xp := greatest(1, ceil(v_crop.xp::numeric / 4.0))::bigint;
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_water_xp, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  update public.account_farm_plots
    set waterings = array_append(waterings, now())
    where user_id = v_uid and plot_idx = p_plot_idx;

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_water_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_water', 'farming', v_water_xp, v_water_xp,
            jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx, 'planted_by', v_plot.planted_by, 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'watered_at', now(), 'water_xp', v_water_xp,
    'window_closes', now() + make_interval(secs => c_window_secs));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_water', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_harvest(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_harvest restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's; the crop, the XP
-- and the day budget are the acting hero's; the roll is the PLANT's; an extra plot
-- (index >= the account's cap) is gone after its harvest.
declare
  v_uid    uuid := auth.uid();
  v_plot   public.account_farm_plots%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_grown_h numeric;
  v_seed   bigint;
  v_span   int;
  v_base   bigint;
  v_bonus  bigint;
  v_qty    bigint;
  v_xp     bigint;
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_extra    boolean;
  v_new_count int;
  v_garden_lv int;
  v_scarecrow int;
  v_cached jsonb;
  v_budget jsonb;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('farm_harvest', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay).
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_harvest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_harvest', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK: two heroes harvesting one
  -- plot serialise here, and the second reads the plot after the first emptied it.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  select * into v_plot from public.account_farm_plots
    where user_id = v_uid and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600)));
  end if;

  -- SEEDED base yield roll, tied to this PLANT (its planter, its plot, its plant
  -- instant): which hero harvests cannot re-roll it, a regrow is a fresh roll, a
  -- harvest replay is identical. NOT Math.random.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, v_plot.planted_by,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_base := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;

  -- FLAT farmYield PERK from the SERVER-owned stack: Garden rung (the account's) +
  -- Scarecrow count (the acting hero's plot unlocks) + the acting hero's equipped
  -- companion, priced from hr_farm_yield_perk. Whole crops; under-pay only.
  select coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int,
         coalesce(max(level) filter (where unlock_id = 'plot:scarecrow'), 0)::int
    into v_garden_lv, v_scarecrow from public.hr_unlock_levels(v_uid, p_slot);
  v_bonus :=
      coalesce((select farm_yield from public.hr_farm_yield_perk
                 where perk_key = 'garden:' || greatest(0, v_garden_lv)::text), 0)
    + greatest(0, v_scarecrow)
        * coalesce((select farm_yield from public.hr_farm_yield_perk where perk_key = 'scarecrow'), 0)
    + coalesce((select farm_yield from public.hr_farm_yield_perk
                 where v_state.companion_equipped is not null
                   and perk_key = 'companion:' || v_state.companion_equipped), 0);

  v_qty := v_base + greatest(0, v_bonus);
  v_xp  := v_crop.xp::bigint * v_qty;

  -- Daily economy ceiling (NULL = within budget), the acting hero's. Perk is inside the clamp.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_xp, v_qty, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- AN EXTRA PLOT (past the account's cap: the 2026-12-14 fold kept every crop) is
  -- gone after its harvest. Otherwise the FINITE-PERENNIAL rule: regrow_limit =
  -- regrows one seed buys, regrow_limit+1 total harvests, 0 = no limit.
  v_extra := p_plot_idx >= public.hr_farm_plot_cap(v_uid);
  if v_extra then
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  elsif v_crop.regrows then
    v_new_count := v_plot.regrow_count + 1;
    if v_crop.regrow_limit > 0 and v_new_count > v_crop.regrow_limit then
      delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
      v_withered := true;
    else
      update public.account_farm_plots
        set planted_at = now(), waterings = '{}', regrow_count = v_new_count
        where user_id = v_uid and plot_idx = p_plot_idx;
      v_regrew := true;
    end if;
  else
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  end if;

  -- THE LIFETIME HARVEST COUNT, the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:harvest', v_qty, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, 'farming', v_xp,
            v_qty, v_xp, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx,
                                            'base', v_base, 'perk', v_bonus,
                                            'regrew', v_regrew, 'withered', v_withered,
                                            'regrow_count', v_plot.regrow_count,
                                            'planted_by', v_plot.planted_by, 'extra', v_extra,
                                            'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'base', v_base, 'perk', v_bonus, 'xp', v_xp,
    'regrew', v_regrew, 'withered', v_withered, 'planted_by', v_plot.planted_by, 'extra', v_extra,
    'regrows_left', case when v_crop.regrows and v_crop.regrow_limit > 0 and not v_extra
                         then greatest(0, v_crop.regrow_limit - (v_plot.regrow_count + 1))
                         else null end);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_upgrade_plot(p_slot integer, p_idem uuid, p_expect_level integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_upgrade_plot restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from
-- the 2026-10-04-expected-level-idempotency.sql image: the tier is the ACCOUNT's
-- (account_farm, under the account farm lock); the Farming gate and the deeds are the
-- acting hero's; the gold is hr_farm_purse_pay's.
declare
  c_deed constant text := 'farm_deed';
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_level int;
  v_next  int;
  v_cost  int;
  v_gold  bigint;
  v_reqlv int;
  v_farmlv int;
  v_xp    bigint;
  v_have  bigint;
  v_pay   text;
  v_purse jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY — and it is checked
  -- BEFORE the expected level: a retry of a gesture that already landed must
  -- get its own cached answer back, not a stale_level for the rung it bought.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_upgrade_plot') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_upgrade_plot', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE EXPECTED RUNG IS REQUIRED. Before the lock: a call that cannot be
  -- judged must not first serialise the character behind it.
  if p_expect_level is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'missing_expect'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- A SECOND INTENT FOR THE SAME RUNG IS STALE (2026-10-04), from ANY hero of the
  -- account: read under the farm lock, so the first of two concurrent intents lands
  -- and the second sees its write. `plot_level` is the account's CURRENT tier.
  v_level := public.hr_farm_plot_level(v_uid);
  if p_expect_level <> v_level + 1 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'stale_level',
      'plot_level', v_level, 'expect_level', p_expect_level));
  end if;

  v_next := v_level + 1;
  select deed_cost, gold_cost, req_farm_level into v_cost, v_gold, v_reqlv
    from public.hr_plot_tier where plot_level = v_next;
  if v_cost is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_level));
  end if;
  -- FAIL CLOSED ON AN UNPRICED RUNG (a rung above the first that costs nothing in
  -- either currency is a mistake, never an offer).
  if v_next > 1 and coalesce(v_gold, 0) = 0 and coalesce(v_cost, 0) = 0 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'tier_unpriced', 'plot_level', v_next));
  end if;

  -- THE PACING GATE. The acting hero's Farming level, from the server's own XP.
  select coalesce(xp, 0) into v_xp from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farmlv := public.hr_level_from_xp(coalesce(v_xp, 0));
  if v_farmlv < coalesce(v_reqlv, 1) then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'farm_level_too_low',
      'need', v_reqlv, 'have', v_farmlv, 'plot_level', v_next));
  end if;

  -- THE PAYMENT. Gold first, through the farm's one purse; the acting hero's deeds
  -- are the fallback, never the default.
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = c_deed;
  v_have := coalesce(v_have, 0);
  v_purse := public.hr_farm_purse_pay(v_uid, p_slot, coalesce(v_gold, 0));
  if coalesce(v_purse ->> 'ok', '') = 'true' then
    v_pay := 'gold';
  elsif v_have >= v_cost then
    v_pay := 'deeds';
  else
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
      'need_gold', coalesce(v_gold, 0), 'have_gold', (v_purse ->> 'gold')::bigint,
      'need_deeds', v_cost, 'have_deeds', v_have, 'plot_level', v_next));
  end if;

  if v_pay = 'deeds' and v_cost > 0 then
    -- THE DEBIT VERIFIES THE QUANTITY IN EVERY BRANCH (qty > 0 is a CHECK, so
    -- the last deed is DELETEd, predicated on qty = v_cost).
    update public.player_inventory set qty = qty - v_cost
      where user_id = v_uid and slot = p_slot and item_id = c_deed and qty > v_cost;
    if not found then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = c_deed and qty = v_cost;
      if not found then
        return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
          'need_gold', coalesce(v_gold, 0), 'have_gold', (v_purse ->> 'gold')::bigint,
          'need_deeds', v_cost, 'have_deeds', v_have, 'plot_level', v_next));
      end if;
    end if;
  end if;

  -- THE ACCOUNT'S TIER moves one rung, predicated on the rung read under the lock.
  insert into public.account_farm as a (user_id, plot_level, updated_at)
    values (v_uid, v_next, now())
    on conflict (user_id) do update set plot_level = excluded.plot_level, updated_at = now()
      where a.plot_level = v_level;
  if not found then
    raise exception 'hr_farm_upgrade_plot: the account tier moved under the farm lock (expected %)', v_level; end if;

  update public.player_state set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = p_slot;

  -- THE JOURNAL. One row per upgrade on the acting hero; gold spent negative, deeds negative qty.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot',
            case when v_pay = 'deeds' then c_deed else null end,
            case when v_pay = 'deeds' then -v_cost else 0 end,
            case when v_pay = 'gold'  then -coalesce(v_gold, 0) else 0 end,
            jsonb_build_object('plot_level', v_next, 'paid_with', v_pay,
                               'farm_level', v_farmlv, 'purse', v_purse ->> 'purse', 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next,
    'paid_with', v_pay,
    'deeds_spent', case when v_pay = 'deeds' then v_cost else 0 end,
    'gold_spent',  case when v_pay = 'gold' then coalesce(v_gold, 0) else 0 end,
    'gold', (v_purse ->> 'gold')::bigint);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

create or replace function public.hr_farm_harvest_replant(p_slot int, p_plot_idx int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
-- hr_farm_harvest_replant restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM)
-- from the 2026-11-26-farm-window.sql image: the plot is the ACCOUNT's; the remembered
-- crop goes back in from the ACTING hero's seed, else one bought through the farm's
-- one purse (hr_farm_purse_pay); an extra plot is not planted again.
declare
  c_max_plots constant int := 128;   -- the table's index fuse
  v_uid    uuid := auth.uid();
  v_cached jsonb;
  v_crop   text;
  v_seed   text;
  v_have   bigint;
  v_price  bigint;
  v_offer  text;
  v_purse  jsonb;
  v_bought bigint := 0;
  v_h      jsonb;
  v_rep    jsonb;
  v_out    jsonb;
begin
  if v_uid is null then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_idem is null or p_slot is null or p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_replant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_replant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;
  -- the harvest's own bucket (closed-mode check first); the inner harvest spends one more
  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- THE PLOT REMEMBERS ITS CROP: read before the harvest clears the row. Unlocked on
  -- purpose: the harvest below re-reads the plot under the hero + farm locks, and a
  -- crop another hero replaced in between cannot be ready (it was just planted).
  select crop_id into v_crop from public.account_farm_plots
   where user_id = v_uid and plot_idx = p_plot_idx;

  -- The harvest, unchanged: its own gates, roll, perks, budget and journal. It takes
  -- the hero lock and the account farm lock; this transaction keeps both.
  v_h := public.hr_farm_harvest(p_slot, p_plot_idx, md5(p_idem::text || ':farm_replant:harvest')::uuid);
  if coalesce(v_h ->> 'ok', '') <> 'true' then return v_h; end if;   -- refused (and noted) by the harvest: nothing moved

  if coalesce(v_h ->> 'regrew', '') = 'true' or v_crop is null then
    v_rep := jsonb_build_object('ok', true, 'kept', true);           -- a regrowing crop is still in the ground
  elsif coalesce(v_h ->> 'extra', '') = 'true' then
    v_rep := jsonb_build_object('ok', false, 'error', 'extra_plot');  -- an extra plot is gone after its harvest
  else
    select seed_item into v_seed from public.hr_crops where crop_id = v_crop;
    select coalesce(qty, 0) into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_seed;
    if coalesce(v_have, 0) < 1 then
      -- ONE SEED AT THE SHOP'S OWN PRICE: the listed `seed` row shop_buy sells,
      -- paid through the farm's one purse.
      select o.price, o.offer_id into v_price, v_offer from public.hr_shop_supply_offers o
       where o.kind = 'seed' and o.item_id = v_seed order by o.price limit 1;
      if v_price is null or v_price <= 0 then
        v_rep := jsonb_build_object('ok', false, 'error', 'no_seed_for_sale', 'seed', v_seed);
      else
        v_purse := public.hr_farm_purse_pay(v_uid, p_slot, v_price);
        if coalesce(v_purse ->> 'ok', '') <> 'true' then
          v_rep := jsonb_build_object('ok', false, 'error', 'cannot_afford', 'seed', v_seed, 'price', v_price,
            'have', (v_purse ->> 'gold')::bigint);
        else
          insert into public.player_inventory as inv (user_id, slot, item_id, qty)
            values (v_uid, p_slot, v_seed, 1)
            on conflict (user_id, slot, item_id) do update set qty = inv.qty + 1;
          insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
            values (v_uid, p_slot, 'shop', 'farm_replant_seed', v_seed, 1, -v_price, 0, 0, 0,
                    jsonb_build_object('offer', v_offer, 'qty', 1, 'unit_gold', v_price, 'plot', p_plot_idx, 'crop', v_crop,
                                       'purse', v_purse ->> 'purse'));
          v_bought := v_price;
        end if;
      end if;
    end if;
    if v_rep is null then
      v_rep := public.hr_farm_plant(p_slot, p_plot_idx, v_crop, md5(p_idem::text || ':farm_replant:plant')::uuid)
               || jsonb_build_object('bought', v_bought);
    end if;
  end if;

  v_out := v_h || jsonb_build_object('replant', v_rep);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_replant', v_out, now())
    on conflict (user_id, intent_id) do nothing;
  return v_out;
end $$;
-- CREATE OR REPLACE kept every verb's grants; restated here so a fresh database matches.
revoke execute on function public.hr_farm_harvest_replant(int, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_harvest_replant(int, int, uuid) to authenticated;
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;
revoke execute on function public.hr_farm_upgrade_plot(int, uuid, int) from public, anon, service_role;
grant  execute on function public.hr_farm_upgrade_plot(int, uuid, int) to authenticated;
revoke execute on function public.hr_farm_water(int, int, uuid) from public, anon;
grant  execute on function public.hr_farm_water(int, int, uuid) to authenticated;
revoke execute on function public.hr_farm_harvest(int, int, uuid) from public, anon;
grant  execute on function public.hr_farm_harvest(int, int, uuid) to authenticated;

-- ── §5 THE FIELD AS THE SERVER SEES IT: the `farm_land` section ─────────────
create or replace function public.hr_farm_land_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
-- hr_farm_land_view restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-11-26-farm-window.sql image: the ACCOUNT's field, the same on every hero; the
-- cap is hr_farm_plot_cap (the Garden's beds included); deeds are the viewing hero's.
declare
  c_window_s constant numeric := 2 * 3600;   -- hr_farm_water's window
  c_max_waterings constant int := 8;          -- hr_farm_water's cap
  v_lv    int;
  v_cap   int;
  v_deeds bigint;
  v_up    jsonb;
  v_plots jsonb;
begin
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_slot) then return null; end if;
  v_lv  := public.hr_farm_plot_level(p_user);
  v_cap := public.hr_farm_plot_cap(p_user);
  select coalesce(qty, 0) into v_deeds from public.player_inventory
   where user_id = p_user and slot = p_slot and item_id = 'farm_deed';
  select jsonb_build_object('level', t.plot_level, 'gold', t.gold_cost, 'deeds', t.deed_cost, 'farming', t.req_farm_level)
    into v_up from public.hr_plot_tier t where t.plot_level = v_lv + 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'i', f.plot_idx, 'crop', f.crop_id,
           'ready', g.rem_h <= 0,
           'ready_in_s', case when g.rem_h <= 0 then 0
                              when g.win_s / 3600.0 * 2 >= g.rem_h then ceil(g.rem_h / 2 * 3600)::bigint
                              else ceil(g.win_s + (g.rem_h - g.win_s / 3600.0 * 2) * 3600)::bigint end,
           'waterable', g.rem_h > 0 and g.win_s <= 0 and coalesce(array_length(f.waterings, 1), 0) < c_max_waterings,
           'regrows_left', case when c.regrows and c.regrow_limit > 0 then greatest(0, c.regrow_limit - f.regrow_count) else null end,
           'by', f.planted_by,
           'by_name', (select cn.name from public.character_names cn where cn.user_id = p_user and cn.slot = f.planted_by),
           'extra', f.plot_idx >= v_cap)
         order by f.plot_idx), '[]'::jsonb)
    into v_plots
    from public.account_farm_plots f
    join public.hr_crops c on c.crop_id = f.crop_id
    cross join lateral (select
        c.base_hours - public.hr_farm_growth_hours(f.planted_at, f.waterings, now()) as rem_h,
        greatest(0, extract(epoch from (
          (select max(w) from unnest(f.waterings) w) + make_interval(secs => c_window_s) - now())))::numeric as win_s) g
   where f.user_id = p_user;
  return jsonb_build_object('cap', v_cap, 'plot_level', v_lv, 'deeds', coalesce(v_deeds, 0),
                            'upgrade', v_up, 'plots', v_plots);
end $$;
revoke execute on function public.hr_farm_land_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('farm_land', 'hr_farm_land_view', '2026-12-14-shared-farm.sql: the ACCOUNT''s field, the same on every hero: the plot cap (property ladder + Garden beds), the account''s plot tier and next tier price, the viewing hero''s deeds, and each planted plot''s crop, readiness, seconds to ready, waterability by the server clock, who planted it and whether it is an extra plot')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §6 ANCHORED SPLICES: hr_state_of, hr_create_character, hr_apply ──────────
-- Each anchor must match exactly once; a body already carrying SHARED-FARM is skipped
-- (a re-apply). CREATE OR REPLACE keeps each function's grants.
do $mig$
declare
  v_sig text; v_def text; v_n int; v_i int;
  a_old text[]; a_new text[];
begin
  foreach v_sig in array array['public.hr_state_of(uuid,integer)', 'public.hr_create_character(integer)',
                               'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'] loop
    v_def := replace(pg_get_functiondef(v_sig::regprocedure), chr(13), '');
    if strpos(v_def, 'SHARED-FARM') > 0 then raise notice '% already carries SHARED-FARM - splices skipped', v_sig; continue; end if;
    if v_sig = 'public.hr_state_of(uuid,integer)' then
      a_old := array[
$a$      'plot_level', v_st.plot_level,$a$,
$a$        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),$a$];
      a_new := array[
$a$      -- SHARED-FARM (2026-12-14-shared-farm.sql): the ACCOUNT's plot tier (account_farm), the same on every hero.
      'plot_level', public.hr_farm_plot_level(p_user),$a$,
$a$        -- SHARED-FARM (2026-12-14-shared-farm.sql): the ACCOUNT's planted plots, the same on every
        -- hero; watered_at is the last watering (the array is the record).
        from (select af.*, (select max(w) from unnest(af.waterings) w) as watered_at
                from public.account_farm_plots af where af.user_id = p_user) f), '[]'::jsonb),$a$];
    elsif v_sig = 'public.hr_create_character(integer)' then
      a_old := array[
$a$  if v_kit.farm_plots > 0 then
    insert into public.player_farm (user_id, slot, plot_idx)
      select v_uid, v_slot, g from generate_series(0, v_kit.farm_plots - 1) g;
  end if;
$a$];
      a_new := array[
$a$  -- SHARED-FARM (2026-12-14-shared-farm.sql): no starter plot rows. The field is the
  -- ACCOUNT's (account_farm_plots holds planted plots only); its size is hr_farm_plot_cap.
$a$];
    else
      a_old := array[
$a$  c_max_farm_ops     constant int    := 64;
$a$,
$a$  v_plot  jsonb; v_prog jsonb;$a$,
$a$    'farm','progress','progress_claim','journal',$a$,
$a$    -- ── FARM ─ planting stamps the SERVER clock. `planted_at` can never be
    --    introduced by 2026-08-11-apply-engine.sql
    --   supplied by anyone: that single line is the whole farming exploit
    --   closed. The crop id is checked against the generated catalogue.
    if p_delta ? 'farm' then
      if jsonb_typeof(p_delta->'farm') <> 'array' then perform public.hr_reject('bad_farm'); end if;
      if jsonb_array_length(p_delta->'farm') > c_max_farm_ops then
        perform public.hr_reject('too_many_farm_ops');
      end if;
      for v_plot in select value from jsonb_array_elements(p_delta->'farm') loop
        if coalesce((v_plot->>'clear')::boolean, false) then
          update public.player_farm
             set crop_id = null, planted_at = null, watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int;
        elsif coalesce((v_plot->>'plant')::boolean, false) then
          if not exists (select 1 from public.hr_crops where crop_id = v_plot->>'crop') then
            perform public.hr_reject('unknown_crop', jsonb_build_object('crop', v_plot->>'crop'));
          end if;
          update public.player_farm
             set crop_id = v_plot->>'crop', planted_at = now(), watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is null;                   -- never replant an occupied plot
          get diagnostics v_rows = row_count;
          if v_rows <> 1 then
            perform public.hr_reject('plot_unavailable', jsonb_build_object('i', v_plot->>'i'));
          end if;
        elsif coalesce((v_plot->>'water')::boolean, false) then
          update public.player_farm set watered_at = now()
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is not null and watered_at is null;
        end if;
      end loop;
    end if;
$a$];
      a_new := array[
$a$$a$,
$a$  v_prog jsonb;$a$,
$a$    -- SHARED-FARM (2026-12-14-shared-farm.sql): no `farm` key; the field is the account's,
    -- written only by the hr_farm_* verbs. A delta naming it is refused unknown_delta_key.
    'progress','progress_claim','journal',$a$,
$a$    -- ── FARM ─ SHARED-FARM (2026-12-14-shared-farm.sql): the engine's per-hero farm ops are
    --    gone. The field is the ACCOUNT's (account_farm_plots), written only by the hr_farm_*
    --    verbs under the account farm lock; no engine path plants, waters or clears a plot.
$a$];
    end if;
    for v_i in 1 .. array_length(a_old, 1) loop
      v_n := (length(v_def) - length(replace(v_def, a_old[v_i], ''))) / length(a_old[v_i]);
      if v_n <> 1 then raise exception '%: SHARED-FARM anchor % matched % times (need 1) - the body moved', v_sig, v_i, v_n; end if;
      v_def := replace(v_def, a_old[v_i], a_new[v_i]);
    end loop;
    execute v_def;
  end loop;
end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000fa2f0a01';   -- the account (two heroes)
  v_o constant uuid := '000000c0-0000-4000-a000-0000fa2f0a02';   -- another account
  v jsonb; v_a jsonb; v_b jsonb; v_role text; v_t text;
  v_xp0 bigint; v_xp1 bigint; v_seed0 bigint; v_seed1 bigint; v_crop0 bigint; v_crop1 bigint;
  v_g bigint; v_price bigint; v_base0 bigint; v_base1 bigint; v_cap int; v_src text; v_n int;
begin
  begin
    insert into auth.users (id) values (v_u), (v_o) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'shared-farm §7 probe'), (v_o, 'shared-farm §7 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_o::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the other account''s hero was not made'; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'VERIFY(a): the probe heroes were not made'; end if;
    if exists (select 1 from public.account_farm_plots where user_id in (v_u, v_o)) then
      raise exception 'VERIFY(a): a new hero got starter plot rows'; end if;
    delete from public.hr_rate_counters where user_id in (v_u, v_o);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'turnip_seed', 5), (v_u, 1, 'turnip_seed', 7)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v_cap := public.hr_farm_plot_cap(v_u);
    -- (a) ONE FIELD: both heroes read the same empty field, the account's cap and tier.
    v_a := public.hr_farm_land_view(v_u, 0); v_b := public.hr_farm_land_view(v_u, 1);
    if (v_a->>'cap')::int <> v_cap or v_cap <> 2 or (v_a->>'plot_level')::int <> 1 or v_a->'plots' <> '[]'::jsonb
       or v_a - 'deeds' is distinct from v_b - 'deeds' then
      raise exception 'VERIFY(a): two heroes read % and %', v_a, v_b; end if;
    -- (b) HERO 0 PLANTS: its own seed is spent; hero 1 sees the plot, planted by hero 0.
    v := public.hr_farm_plant(0, 0, 'turnip', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hero 0''s plant was refused: %', v; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip_seed') <> 4
       or (select qty from public.player_inventory where user_id = v_u and slot = 1 and item_id = 'turnip_seed') <> 7 then
      raise exception 'VERIFY(b): the plant did not spend exactly one of hero 0''s seeds'; end if;
    v_a := public.hr_farm_land_view(v_u, 0); v_b := public.hr_farm_land_view(v_u, 1);
    if v_a->'plots' is distinct from v_b->'plots' or jsonb_array_length(v_b->'plots') <> 1
       or v_b->'plots'->0->>'crop' <> 'turnip' or (v_b->'plots'->0->>'by')::int <> 0 or (v_b->'plots'->0->>'extra')::boolean then
      raise exception 'VERIFY(b): after hero 0 planted, hero 0 reads % and hero 1 reads %', v_a->'plots', v_b->'plots'; end if;
    if public.hr_state_of(v_u, 0)->'farm' is distinct from public.hr_state_of(v_u, 1)->'farm'
       or jsonb_array_length(public.hr_state_of(v_u, 1)->'farm') <> 1 then
      raise exception 'VERIFY(b): the two heroes'' envelopes carry different fields'; end if;
    -- (c) THE PLOT IS TAKEN for hero 1 too; the plant row is hero 0's.
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_farm_plant(1, 0, 'turnip', gen_random_uuid());
    if v->>'error' is distinct from 'plot_occupied' or (v->>'by')::int <> 0 then raise exception 'VERIFY(c): hero 1 planting on hero 0''s crop answered %', v; end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'farm_plant') <> 1
       or not exists (select 1 from public.player_ledger where user_id = v_u and slot = 0 and intent = 'farm_plant') then
      raise exception 'VERIFY(c): the plant journal is not one row on hero 0'; end if;
    -- (d) HERO 1 WATERS AND HARVESTS hero 0's crop: hero 1 gets the crop and the XP.
    v := public.hr_farm_water(1, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): hero 1 could not water hero 0''s crop: %', v; end if;
    update public.account_farm_plots set planted_at = now() - interval '30 hours' where user_id = v_u and plot_idx = 0;
    select coalesce(xp, 0) into v_xp0 from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'farming';
    select coalesce(xp, 0) into v_xp1 from public.player_skills where user_id = v_u and slot = 1 and skill_id = 'farming';
    select coalesce(sum(qty), 0) into v_crop1 from public.player_inventory where user_id = v_u and slot = 1 and item_id = 'turnip';
    select coalesce(sum(qty), 0) into v_crop0 from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip';
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_farm_harvest(1, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (v->>'planted_by')::int <> 0 then raise exception 'VERIFY(d): hero 1''s harvest answered %', v; end if;
    if (select coalesce(sum(qty), 0) from public.player_inventory where user_id = v_u and slot = 1 and item_id = 'turnip') <> v_crop1 + (v->>'qty')::bigint
       or (select coalesce(sum(qty), 0) from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip') <> v_crop0
       or (select xp from public.player_skills where user_id = v_u and slot = 1 and skill_id = 'farming') <> v_xp1 + (v->>'xp')::bigint
       or (select coalesce(xp, 0) from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'farming') <> v_xp0 then
      raise exception 'VERIFY(d): the crop and XP did not land on the harvesting hero only'; end if;
    if exists (select 1 from public.account_farm_plots where user_id = v_u)
       or public.hr_farm_land_view(v_u, 0)->'plots' <> '[]'::jsonb then
      raise exception 'VERIFY(d): the harvested plot is still on the field'; end if;
    if not exists (select 1 from public.player_ledger where user_id = v_u and slot = 1 and intent = 'farm_harvest'
                    and (meta->>'planted_by')::int = 0 and meta->>'field' = 'account') then
      raise exception 'VERIFY(d): the harvest journal is not on hero 1 naming hero 0 as the planter'; end if;
    -- (e) THE ROLL IS THE PLANT'S: the same plant harvested by either hero rolls the same base.
    perform public.hr_farm_plant(0, 1, 'turnip', gen_random_uuid());
    update public.account_farm_plots set planted_at = date_trunc('second', now()) - interval '30 hours' where user_id = v_u and plot_idx = 1;
    begin
      delete from public.hr_rate_counters where user_id = v_u;
      v_base0 := (public.hr_farm_harvest(0, 1, gen_random_uuid())->>'base')::bigint;
      raise exception using errcode = 'HR917', message = 'roll probe';
    exception when sqlstate 'HR917' then null;
    end;
    delete from public.hr_rate_counters where user_id = v_u;
    v_base1 := (public.hr_farm_harvest(1, 1, gen_random_uuid())->>'base')::bigint;
    if v_base0 is null or v_base0 is distinct from v_base1 then
      raise exception 'VERIFY(e): one plant rolled % for hero 0 and % for hero 1', v_base0, v_base1; end if;
    -- (f) ANOTHER ACCOUNT sees none of it and cannot touch it.
    perform public.hr_farm_plant(0, 0, 'turnip', gen_random_uuid());
    update public.account_farm_plots set planted_at = now() - interval '30 hours' where user_id = v_u and plot_idx = 0;
    perform set_config('request.jwt.claim.sub', v_o::text, true);
    delete from public.hr_rate_counters where user_id = v_o;
    if public.hr_farm_land_view(v_o, 0)->'plots' <> '[]'::jsonb or jsonb_array_length(public.hr_state_of(v_o, 0)->'farm') <> 0 then
      raise exception 'VERIFY(f): another account reads this account''s field'; end if;
    v := public.hr_farm_harvest(0, 0, gen_random_uuid());
    if v->>'error' is distinct from 'empty_plot' then raise exception 'VERIFY(f): another account''s harvest answered %', v; end if;
    v := public.hr_farm_water(0, 0, gen_random_uuid());
    if v->>'error' is distinct from 'empty_plot' then raise exception 'VERIFY(f): another account''s watering answered %', v; end if;
    if not exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 0) then
      raise exception 'VERIFY(f): another account moved this account''s crop'; end if;
    -- (g) THE TIER IS THE ACCOUNT'S: hero 1 buys tier 2 with its own gold (the farm purse);
    -- hero 0 then reads tier 2, and its intent for tier 2 is stale.
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    delete from public.hr_rate_counters where user_id = v_u;
    select gold_cost into v_price from public.hr_plot_tier where plot_level = 2;
    update public.player_state set gold = v_price + 7 where user_id = v_u and slot = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_u, 1, 'farming', (select xp from public.hr_xp_table where level = (select req_farm_level from public.hr_plot_tier where plot_level = 2)))
      on conflict (user_id, slot, skill_id) do update set xp = greatest(public.player_skills.xp, excluded.xp);
    select gold into v_g from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_farm_upgrade_plot(1, gen_random_uuid(), 2);
    if coalesce(v->>'ok', '') <> 'true' or v->>'paid_with' <> 'gold' or (v->>'gold')::bigint <> 7 then
      raise exception 'VERIFY(g): hero 1''s tier-2 purchase answered %', v; end if;
    if (select gold from public.player_state where user_id = v_u and slot = 1) <> 7
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_g
       or (public.hr_farm_land_view(v_u, 0)->>'plot_level')::int <> 2 or (public.hr_state_of(v_u, 0)->'state'->>'plot_level')::int <> 2 then
      raise exception 'VERIFY(g): the purchase did not move hero 1''s gold only and the account''s tier'; end if;
    if not exists (select 1 from public.player_ledger where user_id = v_u and slot = 1 and intent = 'farm_upgrade_plot'
                    and gold = -v_price and meta->>'purse' = 'hero') then
      raise exception 'VERIFY(g): the upgrade journal is not on hero 1 with the purse named'; end if;
    v := public.hr_farm_upgrade_plot(0, gen_random_uuid(), 2);
    if v->>'error' is distinct from 'stale_level' or (v->>'plot_level')::int <> 2 then
      raise exception 'VERIFY(g): hero 0''s second tier-2 intent answered %', v; end if;
    -- (h) AN EXTRA PLOT (past the cap) harvests once and is gone; it is never replanted.
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      values (v_u, v_cap + 1, 'turnip', now() - interval '30 hours', '{}', 0, 1);
    if not (select bool_or((p->>'extra')::boolean) from jsonb_array_elements(public.hr_farm_land_view(v_u, 1)->'plots') p) then
      raise exception 'VERIFY(h): the extra plot is not marked extra'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    select gold into v_g from public.player_state where user_id = v_u and slot = 0;
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip_seed';
    v := public.hr_farm_harvest_replant(0, v_cap + 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (v->>'extra')::boolean is not true or v->'replant'->>'error' is distinct from 'extra_plot' then
      raise exception 'VERIFY(h): the extra plot''s replant answered %', v; end if;
    if exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = v_cap + 1)
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_g then
      raise exception 'VERIFY(h): the extra plot survived its harvest, or a seed was bought for it'; end if;
    if public.hr_farm_plant(0, v_cap + 1, 'turnip', gen_random_uuid())->>'error' is distinct from 'plot_cap' then
      raise exception 'VERIFY(h): a seed went into a plot past the cap'; end if;
    -- (i) A REPLANT WITH NO SEED buys one through the farm purse, on the acting hero.
    update public.account_farm_plots set planted_at = now() - interval '30 hours' where user_id = v_u and plot_idx = 0;
    select price into v_price from public.hr_shop_supply_offers where kind = 'seed' and item_id = 'turnip_seed' order by price limit 1;
    update public.player_state set gold = v_price where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_farm_harvest_replant(0, 0, gen_random_uuid());
    if coalesce(v->'replant'->>'ok', '') <> 'true' or (v->'replant'->>'bought')::bigint <> v_price
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> 0
       or (select planted_by from public.account_farm_plots where user_id = v_u and plot_idx = 0) <> 0
       or not exists (select 1 from public.player_ledger where user_id = v_u and slot = 0 and intent = 'farm_replant_seed'
                       and gold = -v_price and meta->>'purse' = 'hero') then
      raise exception 'VERIFY(i): a seedless replant answered %', v; end if;
    -- (j) THE ENGINE CANNOT WRITE THE FIELD: a `farm` delta is not a key any more.
    select prosrc into v_src from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
    if v_src ~ $re$'farm','progress'$re$ or v_src ~ $re$p_delta \? 'farm'$re$ or strpos(v_src, 'c_max_farm_ops') > 0 then
      raise exception 'VERIFY(j): hr_apply still accepts a farm delta'; end if;
    raise exception using errcode = 'HR916', message = 'shared-farm §7 complete - rolling back';
  exception when sqlstate 'HR916' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (k) NOTHING LEAKED; THE OLD COPIES ARE GONE; NO BODY NAMES THEM.
  if exists (select 1 from public.player_state where user_id in (v_u, v_o)) or exists (select 1 from public.player_ledger where user_id in (v_u, v_o))
     or exists (select 1 from public.account_farm_plots where user_id in (v_u, v_o)) or exists (select 1 from public.account_farm where user_id in (v_u, v_o)) then
    raise exception 'VERIFY(k): §7 LEAKED a probe row'; end if;
  if to_regclass('public.player_farm') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'plot_level')
     or to_regprocedure('public.hr_farm_plot_cap(uuid,integer)') is not null then
    raise exception 'VERIFY(k): player_farm, player_state.plot_level or hr_farm_plot_cap(uuid, int) survived'; end if;
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'player_farm\M' or regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'v_st\.plot_level|v_state\.plot_level');
  if v_n <> 0 then raise exception 'VERIFY(k): % function bodies still read player_farm or a hero''s plot_level', v_n; end if;
  -- (l) THE ACL: own-read only, no client write, helpers owner-only, the verbs' grants unchanged.
  foreach v_t in array array['account_farm', 'account_farm_plots'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'insert,update,delete,truncate') then
        raise exception 'VERIFY(l): % can write %', v_role, v_t; end if;
    end loop;
    if has_table_privilege('anon', 'public.' || v_t, 'select') then raise exception 'VERIFY(l): anon reads %', v_t; end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = v_t) <> 1
       or (select cmd from pg_policies where schemaname = 'public' and tablename = v_t) <> 'SELECT' then
      raise exception 'VERIFY(l): % policies are not one own-read', v_t; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then raise exception 'VERIFY(l): RLS is off on %', v_t; end if;
  end loop;
  foreach v_t in array array['public.hr_farm_lock(uuid)', 'public.hr_farm_plot_cap(uuid)', 'public.hr_farm_plot_level(uuid)',
                             'public.hr_farm_purse_pay(uuid,integer,bigint)', 'public.hr_farm_land_view(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_t, 'execute') then raise exception 'VERIFY(l): % reaches %', v_role, v_t; end if;
    end loop;
  end loop;
  foreach v_t in array array['public.hr_farm_plant(integer,integer,text,uuid)', 'public.hr_farm_water(integer,integer,uuid)',
                             'public.hr_farm_harvest(integer,integer,uuid)', 'public.hr_farm_harvest_replant(integer,integer,uuid)',
                             'public.hr_farm_upgrade_plot(integer,uuid,integer)'] loop
    if not has_function_privilege('authenticated', v_t, 'execute') or has_function_privilege('anon', v_t, 'execute') then
      raise exception 'VERIFY(l): %''s grant moved', v_t; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'shared-farm: one field per account (two heroes read it alike; one plants with its own seed, the other waters and harvests '
               'for its own crop and XP; the roll is the plant''s; another account sees and touches nothing; the tier and its stale '
               'check are the account''s; extra plots harvest once; gold through the one farm purse); all green';
end $$;
