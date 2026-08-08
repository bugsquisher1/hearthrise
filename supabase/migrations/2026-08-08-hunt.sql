-- ============================================================
-- Hearthrise — migration 2026-08-08 · THE HUNT (backlog #16, Wave 3b)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no table is dropped, no column
-- is removed, and every rule the 2026-08-08-raid-hardening migration put on
-- the server SURVIVES INTACT. This file EXTENDS raid_strike and raid_claim in
-- place; it does not replace their contract.
--
-- Spec: docs/design/clan-boss-events.md §7 and §10.5 in full, as amended by
-- the Clan Seat v2 reconciliation (§3.3 tier ladder, §5.2 bands, §5.3 partial
-- credit, §5.4/§10.4 chest + Standing, §10.2 blueprint gate).
--
-- WHAT THIS IS
--   The weekly raid becomes THE HUNT. Its pool stops being a flat 250,000 for
--   every clan on earth and becomes
--
--       pool_hp = TIER_BASE + TIER_PER_MEMBER × members_at_declaration
--
--   across five tiers a clan DECLARES, gated by its castle and its War Room.
--   The designer's arithmetic (§2.3) is the reason: a 10-member mid-level clan
--   at realistic attendance produces ~145,000 against a 250,000 pool — 58%.
--   The flat pool has never been downed in production. One number cannot serve
--   a 3-person clan and a 60-person clan; scaling it to the roster is the
--   single change that makes the content exist.
--
-- THE FOUR THINGS THAT CANNOT LIVE ON THE CLIENT, AND SO LIVE HERE
--   1. WHICH TIER IS DECLARED, BY WHOM, AND THE POOL IT FIXES. The member
--      count is snapshotted here, at declaration, from clan_members.
--   2. THE DAMAGE CLAMP. It is now SELF-SCALING — max(5000, pool × 10%) — so
--      no strike can ever exceed a tenth of any boss at any tier, and no new
--      tier needs a new constant.
--   3. THE BAND AND THE CHEST. The median is computed over contributors with
--      ≥3 strikes so a swarm of one-strike alts cannot depress it; the client
--      may PREVIEW the band, never bank it.
--   4. THE STANDING. Paid FLAT, ONCE PER KILL — never per claimer, or a
--      40-member clan pays itself 40× the Standing for one boss (§10.5b).
--
-- COMPATIBILITY — read before running
--   • raid_strike and raid_claim keep their EXACT signatures, so a b222 client
--     keeps working. New response fields are additive; a client that does not
--     read `tier` renders exactly what it rendered before.
--   • public.clan_hunt_declare() is NEW. The b223 client FEATURE-DETECTS it
--     (404 / PGRST202 / 42883 / 42P01 → 'unsupported') and falls back to the
--     untiered card. → THE CLIENT SHIPS FIRST. Ship b223, then run this file.
--   • Order relative to 2026-08-08-clan-seat.sql does NOT matter. That file's
--     clan_tier_up already reads clan_raids.tier defensively (via
--     information_schema) precisely because this column arrives here; and this
--     file writes clans.standing only if that column exists.
--   • `clan_raids.downed_at` is READ BY THE CASTLE for the tier-4/5 blueprint
--     gate (§10.2, CONFLICTS #8). Nothing here drops or resets it.
--
-- ECONOMY GUARANTEE
--   No code path in this file names or mints hearth_token. The IAP bond is not
--   mintable in PvE at any tier, for any band, for any reason.
-- ============================================================

-- ── 0. Preflight ──────────────────────────────────────────────
do $$ begin
  if to_regclass('public.clan_raids') is null
     or to_regclass('public.raid_contributions') is null
     or to_regclass('public.raid_claims') is null then
    raise exception 'clan_raids / raid_contributions / raid_claims are missing — run supabase/schema.sql and 2026-08-08-raid-hardening.sql first, then this migration';
  end if;
end $$;

-- Shared UTC clock helpers, re-created byte-identical to schema.sql and to the
-- raid-hardening + clan-seat migrations, so this file can be run in any order.
-- They MUST agree with src/features/world-events.js:
--   utcDayKey  → UNPADDED 'YYYY-M-D'  (e.g. '2026-8-8')
--   utcWeekKey → 'w' + floor(days-since-epoch / 7)
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;
create or replace function public.hr_utc_week_key(p_at timestamptz default now())
returns text language sql stable as $$
  select 'w' || ((((p_at at time zone 'utc')::date - date '1970-01-01') / 7))::text
$$;

-- The instant a week key began, DERIVED. Storing a schedule means a row to
-- forget to insert; deriving it means the schedule is identical forever on
-- every server. Used by the §5.3 partial-credit grace window.
create or replace function public.hr_week_start(p_week text)
returns timestamptz language sql stable as $$
  select ((date '1970-01-01' + (nullif(regexp_replace(coalesce(p_week,''), '^w', ''), '')::int * 7))::timestamp)
         at time zone 'utc'
$$;

-- ── 1. clan_raids gains the Hunt (§7.1) ───────────────────────
-- Guarded ALTERs throughout: the table may already carry these from a re-run.
--
-- `tier` defaults to 1, NOT NULL. A pre-Hunt row therefore reads as a Tier I
-- clear, which is the honest interpretation and is also the SAFE one for the
-- blueprint gate — castle tier 4 needs a Tier II clear, so no historical row
-- can accidentally satisfy it.
alter table public.clan_raids
  add column if not exists tier               int         not null default 1,
  add column if not exists declared_at        timestamptz,
  add column if not exists declared_by        uuid,
  add column if not exists members_at_declare int         not null default 0,
  -- §10.5b: the guard that makes Standing a per-KILL payment. Flipped in the
  -- same statement that pays it, so concurrent claimers cannot both pay.
  add column if not exists standing_paid      boolean     not null default false,
  -- §4.1 the social moment without a clock: the first striker and the killing
  -- blow are named on the card. One column each; disproportionate social value.
  add column if not exists first_blood_by     uuid,
  add column if not exists first_blood_at     timestamptz,
  add column if not exists downed_by          uuid;

do $$ begin
  alter table public.clan_raids add constraint clan_raids_tier_chk check (tier between 1 and 5);
exception when duplicate_object then null; end $$;

-- `charge` ('steward' | 'marshal') belongs to the Clan Seat migration, and the
-- Hunt's declaration gate reads it — a marshal may call the Hunt even when they
-- are not an officer, which is the whole reason that column exists. Declared
-- here too, with the SAME `add column if not exists`, so the two migrations can
-- be run in either order without clan_hunt_declare referencing a missing
-- column. Both statements are no-ops on the second run.
alter table public.clan_members add column if not exists charge text;
do $$ begin
  alter table public.clan_members add constraint clan_members_charge_chk
    check (charge is null or charge in ('steward','marshal'));
exception when duplicate_object then null; end $$;

-- Backfill declared_at for rows written before this migration. It must be a
-- time AFTER every current member joined, or the §5.5 anti-chest-hop rule
-- (joined_at < declared_at) would lock the entire existing roster out of a
-- pool they are mid-way through. now() satisfies that for everyone already in
-- the clan, and refuses only players who join from here on — which is exactly
-- the rule. (Per the designer's audit no clan pool has ever been downed in
-- production, so no in-flight claim can be stranded by this.)
update public.clan_raids set declared_at = now() where declared_at is null;

-- ── 2. The boss roster, server-side ───────────────────────────
-- The weekly ROTATION stays on the client (it is deterministic from the week
-- key and is cosmetic). What cannot stay there is LEGALITY: without this table
-- a tampered client could declare a Tier V Hunt and name a defence-48 boss.
-- Seeded from src/features/raids.js BOSSES — the two must agree.
create table if not exists public.hr_hunt_bosses (
  boss_id  text primary key,
  name     text not null,
  def      int  not null check (def > 0),
  tier_min int  not null check (tier_min between 1 and 5),
  tier_max int  not null check (tier_max between 1 and 5),
  sig_item text not null
);
alter table public.hr_hunt_bosses enable row level security;
drop policy if exists "hunt bosses readable" on public.hr_hunt_bosses;
create policy "hunt bosses readable" on public.hr_hunt_bosses for select using (true);

insert into public.hr_hunt_bosses (boss_id, name, def, tier_min, tier_max, sig_item) values
  ('emberclad_tyrant', 'The Emberclad Tyrant',    55, 1, 2, 'slagheart_core'),
  ('hollow_regent',    'The Hollow Regent',       48, 1, 2, 'hollow_sigil'),
  ('maw_below',        'The Maw Below',           62, 2, 3, 'abyssal_pearl'),
  ('sunken_choir',     'The Sunken Choir',        70, 3, 4, 'choirbone'),
  ('warden_long_dark', 'Warden of the Long Dark', 78, 4, 5, 'warden_seal'),
  ('crownless_wyrm',   'The Crownless Wyrm',      88, 5, 5, 'wyrm_gilding')
on conflict (boss_id) do update
  set name = excluded.name, def = excluded.def, tier_min = excluded.tier_min,
      tier_max = excluded.tier_max, sig_item = excluded.sig_item;

-- ── 3. The tier ladder, server-side (§3.3, §5.4, §10.4) ───────
-- The numbers are the Designer's and they live in exactly two places: this
-- table and src/features/raids.js HUNT_TIERS. The server's copy is the one
-- that decides; the client's copy exists so the card can preview.
create table if not exists public.hr_hunt_tiers (
  tier            int primary key check (tier between 1 and 5),
  name            text   not null,
  castle_req      int    not null,
  war_room_req    int    not null,
  base_hp         bigint not null,
  hp_per_member   bigint not null,
  chest_gold      bigint not null,
  chest_gems      int    not null,
  chest_mats      int    not null,
  standing        bigint not null,
  sig_chance      numeric not null default 0,
  sig_champion_only boolean not null default false
);
alter table public.hr_hunt_tiers enable row level security;
drop policy if exists "hunt tiers readable" on public.hr_hunt_tiers;
create policy "hunt tiers readable" on public.hr_hunt_tiers for select using (true);

insert into public.hr_hunt_tiers
  (tier, name, castle_req, war_room_req, base_hp, hp_per_member,
   chest_gold, chest_gems, chest_mats, standing, sig_chance, sig_champion_only) values
  (1, 'Warband Hunt',  1, 0,  5000,  3000,  7000, 12,  4,  1200, 0.00, false),
  (2, 'Keep Hunt',     2, 3, 15000,  7500, 14000, 20,  6,  3000, 0.15, true),
  (3, 'Fortress Hunt', 3, 6, 30000, 12500, 28000, 30,  8,  7000, 0.25, false),
  (4, 'Citadel Hunt',  4, 9, 50000, 16000, 50000, 45, 10, 15000, 0.40, false),
  (5, 'Crown Hunt',    5, 12, 80000, 21000, 90000, 60, 12, 32000, 1.00, false)
on conflict (tier) do update
  set name = excluded.name, castle_req = excluded.castle_req, war_room_req = excluded.war_room_req,
      base_hp = excluded.base_hp, hp_per_member = excluded.hp_per_member,
      chest_gold = excluded.chest_gold, chest_gems = excluded.chest_gems,
      chest_mats = excluded.chest_mats, standing = excluded.standing,
      sig_chance = excluded.sig_chance, sig_champion_only = excluded.sig_champion_only;

-- The ceiling, in one place: max_hunt_tier = min(castle_tier, 1 + war_room/3).
-- Clan `level` is NOT a gate and cannot be — clan_contribute's ×4 ladder puts
-- level 10 at 655,360,000 gold, which would freeze the Hunt at Tier I forever
-- (clan-overhaul v2 §2.3). Mirrors HearthriseClanSeat.maxHuntTier().
create or replace function public.hr_max_hunt_tier(p_clan_id uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_castle int; v_war int; v_up jsonb;
begin
  select greatest(1, coalesce(castle_tier, 1)), coalesce(upgrades, '{}'::jsonb)
    into v_castle, v_up from public.clans where id = p_clan_id;
  if v_castle is null then return 1; end if;
  v_war := greatest(0, coalesce(nullif(v_up->>'war_room','')::int, 0));
  return greatest(1, least(5, least(v_castle, 1 + (v_war / 3))));
end $$;

-- The pool, in one place (§3.2).
create or replace function public.hr_hunt_pool(p_tier int, p_members int)
returns bigint language sql stable as $$
  select t.base_hp + t.hp_per_member * greatest(0, coalesce(p_members, 0))
    from public.hr_hunt_tiers t where t.tier = greatest(1, least(5, coalesce(p_tier, 1)))
$$;

-- §5.5 — the self-scaling clamp. One expression, so a new tier can never ship
-- with a stale ceiling.
create or replace function public.hr_hunt_clamp(p_pool bigint)
returns bigint language sql immutable as $$
  select greatest(5000::bigint, floor(greatest(0, coalesce(p_pool, 0)) * 0.10)::bigint)
$$;

-- ── 4. clan_hunt_declare (§7.2, §10.5a) ───────────────────────
-- Leader/officer only · once per UTC week · tier ≤ the ceiling · the member
-- count is SNAPSHOTTED here, which is what makes alt-stuffing self-defeating:
-- every alt raises your own boss's HP by TIER_PER_MEMBER and contributes only
-- what it can actually strike.
create or replace function public.clan_hunt_declare(
  p_clan_id uuid, p_week text, p_tier int, p_boss text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_week    text := public.hr_utc_week_key();
  v_day     text := public.hr_utc_day_key();
  v_role    text;
  v_charge  text;
  v_ceiling int;
  v_members int;
  v_pool    bigint;
  v_boss    public.hr_hunt_bosses%rowtype;
  v_rows    int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_tier is null or p_tier < 1 or p_tier > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_tier');
  end if;
  -- p_week is REPORTED by the client, never trusted — the same rule raid_strike
  -- uses. Without it a tampered client invents a week key and gets a fresh
  -- declaration slot with it.
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week, 'day', v_day);
  end if;

  select role, charge into v_role, v_charge from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  -- The leader always qualifies; an officer qualifies; a member with the
  -- 'marshal' charge (clan-seat §12) qualifies, because that charge exists
  -- precisely so combat authority can sit with someone other than the leader.
  if v_role not in ('leader', 'officer') and coalesce(v_charge, '') <> 'marshal' then
    return jsonb_build_object('ok', false, 'error', 'not_officer');
  end if;

  v_ceiling := public.hr_max_hunt_tier(p_clan_id);
  if p_tier > v_ceiling then
    return jsonb_build_object('ok', false, 'error', 'tier_too_high', 'ceiling', v_ceiling);
  end if;

  select * into v_boss from public.hr_hunt_bosses where boss_id = p_boss;
  if v_boss.boss_id is null or p_tier < v_boss.tier_min or p_tier > v_boss.tier_max then
    -- Not an error the player caused: fall back to the lowest-defence legal
    -- boss for the tier rather than refusing a declaration over a client that
    -- is one build behind on the roster.
    select * into v_boss from public.hr_hunt_bosses
      where p_tier between tier_min and tier_max order by def asc, boss_id asc limit 1;
  end if;
  if v_boss.boss_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_tier');
  end if;

  select count(*)::int into v_members from public.clan_members where clan_id = p_clan_id;
  v_pool := public.hr_hunt_pool(p_tier, v_members);

  -- ONCE PER WEEK, AND IT LOCKS. The insert IS the lock: `do nothing` plus a
  -- row_count check is race-safe without an advisory lock, the same trick
  -- raid_claim uses on its ledger.
  insert into public.clan_raids
      (clan_id, week_key, boss_id, hp_remaining, max_hp, tier,
       declared_at, declared_by, members_at_declare)
  values (p_clan_id, v_week, v_boss.boss_id, v_pool, v_pool, p_tier,
          now(), auth.uid(), v_members)
  on conflict (clan_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_declared', 'week', v_week);
  end if;

  return jsonb_build_object('ok', true, 'week', v_week, 'day', v_day,
    'tier', p_tier, 'pool_hp', v_pool, 'members', v_members,
    'boss_id', v_boss.boss_id, 'ceiling', v_ceiling);
end $$;
grant execute on function public.clan_hunt_declare(uuid, text, int, text) to authenticated;

-- ── 5. raid_strike — extended, not replaced (§7.3) ────────────
-- EVERY b219 RULE SURVIVES:
--   • the UTC day gate is still the upsert's WHERE clause, still the lock
--   • the week key is still validated, never trusted
--   • p_max_hp is still accepted-and-ignored (the P4 pool-forgery fix)
--   • the signature is unchanged, so a pre-b223 client keeps working
-- WHAT IS NEW:
--   • the pool comes from the declared Hunt, not from a constant
--   • the clamp is max(5000, pool × 10%) instead of a flat 50,000
--   • an undeclared week is refused BEFORE the day gate, so a player never
--     burns their one daily strike on a refusal
--   • first blood and the killing blow are recorded
create or replace function public.raid_strike(
  p_clan_id uuid, p_week text, p_boss text, p_max_hp bigint, p_damage bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- The b209 flat pool, kept ONLY as the auto-founding fallback's ancestor and
  -- as the answer when hr_hunt_tiers is somehow empty. It is no longer the
  -- pool any live Hunt uses.
  c_legacy_pool constant bigint := 250000;
  -- §3.1 leaves one case unstated: nobody declares. Refusing the whole week
  -- would hold a roster hostage to one absent officer, so after this many days
  -- the first strike auto-founds a TIER I Hunt — the floor tier every clan
  -- qualifies for. The officer's declaration is the UPGRADE decision, and they
  -- get the first three days of the week to make it. (Systems ruling; the spec
  -- does not cover it. Flagged in the Wave-3b change contract.)
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

  -- ── THE HUNT MUST EXIST ────────────────────────────────────
  -- Checked BEFORE the day gate, so a refusal costs the player nothing.
  if v_raid.clan_id is null then
    if v_dow < c_grace_days then
      return jsonb_build_object('ok', false, 'error', 'no_hunt',
        'week', v_week, 'day', v_day,
        'tier_ceiling', public.hr_max_hunt_tier(p_clan_id));
    end if;
    -- Auto-found at Tier I with the live roster size.
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

  -- p_max_hp is accepted for signature compatibility and DELIBERATELY IGNORED
  -- (the b219 P4 fix). The pool is whatever the declaration fixed it at.
  v_pool  := greatest(1, coalesce(v_raid.max_hp, c_legacy_pool));
  v_clamp := public.hr_hunt_clamp(v_pool);
  v_dmg   := least(p_damage, v_clamp);

  -- ── THE DAY GATE (b219 P1) — UNCHANGED ─────────────────────
  -- The upsert is itself the lock: on conflict Postgres takes a row lock
  -- before evaluating the WHERE, so two concurrent strikes on the same day
  -- cannot both pass. row_count = 0 means "already struck today".
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

  -- §4.1 First Blood: the first striker each week is named. Gives early-
  -- timezone members something that is theirs, without a rally clock.
  update public.clan_raids
     set first_blood_by = auth.uid(), first_blood_at = now()
   where clan_id = p_clan_id and week_key = v_week and first_blood_at is null;
  get diagnostics v_rows = row_count;
  v_first := v_rows > 0;

  update public.clan_raids
    set hp_remaining = greatest(0, hp_remaining - v_dmg),
        downed_at = case when hp_remaining - v_dmg <= 0 and downed_at is null
                         then now() else downed_at end,
        -- §4.1 The Killing Blow.
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
end $$;
grant execute on function public.raid_strike(uuid, text, text, bigint, bigint) to authenticated;

-- ── 6. raid_claim — bands, partial credit, Standing (§7.4, §10.5b) ──
-- EVERY b219 RULE SURVIVES:
--   • public.raid_claims is still the ledger, still ONE ROW PER PLAYER PER
--     WEEK across both scopes — the primary key is still the anti-chest-hop
--     rule and still makes this race-safe without an advisory lock
--   • a member who joined after the killing blow still earns nothing
--   • the week key is still validated
--   • the signature is unchanged
-- WHAT IS NEW:
--   • joined_at < declared_at (§5.5) — strictly stricter than the b219 rule,
--     which is retained anyway so its error code still reaches the player
--   • ≥2 strikes for any chest (§5.2) — this alone kills the one-tap
--   • the band, measured against the median of ≥3-strike contributors
--   • partial credit at min(0.6, damage/pool) with a 24h grace after the roll
--   • clan Standing, paid FLAT and ONCE per kill
create or replace function public.raid_claim(
  p_scope text, p_clan_id uuid, p_week text)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  -- The week key is still validated, with ONE addition: §5.3's grace window.
  -- The immediately-preceding week stays claimable for 24 hours after the roll
  -- so a clan that fell short is not punished for the calendar. Anything else
  -- is still a week_mismatch.
  if p_week = v_week then
    v_target := v_week;
  elsif p_week is not null
        and public.hr_week_start(p_week) = public.hr_week_start(v_week) - interval '7 days'
        and now() < public.hr_week_start(v_week) + c_grace then
    v_target := p_week;
  else
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
  end if;

  if p_scope = 'solo' then
    -- Solo is unchanged from b219: a flat 0.4× chest and one ledger row per
    -- week. Solo has no tiers — tiers are the clan's reward for being a clan.
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

  -- Partial credit is only claimable once the week is OVER (§5.3). During the
  -- week the only way to a chest is the kill — otherwise claiming early would
  -- be a trap that locks in a 5% share and burns the week's one claim.
  v_partial := v_raid.downed_at is null;
  if v_partial and v_target = v_week then
    return jsonb_build_object('ok', false, 'error', 'not_downed');
  end if;

  select joined_at into v_joined from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_joined is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  -- b219 P2, retained verbatim so its message still reaches the player.
  if v_raid.downed_at is not null and v_joined > v_raid.downed_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_kill');
  end if;
  -- §5.5, strictly stricter: turning up after the Hunt was CALLED earns
  -- nothing, because the pool was sized without you.
  if v_raid.declared_at is not null and v_joined >= v_raid.declared_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_declare');
  end if;

  select strikes, damage into v_strikes, v_damage from public.raid_contributions
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();
  if coalesce(v_damage, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  -- §5.2 — the minimum that kills the one-tap.
  if coalesce(v_strikes, 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));
  end if;

  -- THE MEDIAN, over contributors with ≥3 strikes (§5.2) so a swarm of
  -- one-strike alts cannot depress it to farm the Champion band. If nobody has
  -- struck three times, fall back to every contributor; if there is still no
  -- distribution to rank against, turning up IS the effort and the band is a
  -- full share. A zero median must never read as "everyone is a Champion".
  select percentile_cont(0.5) within group (order by damage)::bigint into v_median
    from public.raid_contributions
   where clan_id = p_clan_id and week_key = v_target and strikes >= 3 and damage > 0;
  if coalesce(v_median, 0) <= 0 then
    select percentile_cont(0.5) within group (order by damage)::bigint into v_median
      from public.raid_contributions
     where clan_id = p_clan_id and week_key = v_target and damage > 0;
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

  -- §5.3 — partial credit, capped at 0.6. No all-or-nothing cliff; the kill is
  -- still clearly better (full value PLUS the signature drop).
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

  -- The signature drop is rolled HERE. A client-rolled drop is a client-CHOSEN
  -- drop, and this is the rarest material in the game. On kill only (§5.4), and
  -- at Tier II only for the Champion band.
  if not v_partial and v_t.tier is not null and v_t.sig_chance > 0
     and (not v_t.sig_champion_only or v_band = 'champion') then
    v_sig := random() < v_t.sig_chance;
  end if;

  -- One chest per player per week, whatever the scope. The primary key does
  -- the work, so this is race-safe without an advisory lock (b219, retained).
  insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
  values (auth.uid(), v_target, 'clan', p_clan_id, v_raid.boss_id, v_scale)
  on conflict (user_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
  end if;

  update public.raid_contributions set claimed = true, claimed_at = now()
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

  -- ── §10.5b: STANDING, FLAT AND ONCE ────────────────────────
  -- NEVER per claimer, or a 40-member clan pays itself 40× the Standing for
  -- one kill. The guard and the payment are the SAME statement: the update
  -- only fires while standing_paid is false, and row_count tells us whether
  -- this call was the one that flipped it.
  --
  -- `clans.standing` arrives with 2026-08-08-clan-seat.sql, which may not have
  -- been run yet — so this is checked at runtime rather than assumed. A hold
  -- without the column simply banks no Standing; nothing else changes.
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clans' and column_name = 'standing')
    into v_has_standing;
  -- If the Clan Seat migration has not been run there is nowhere to bank
  -- Standing, so standing_paid is left FALSE rather than flipped: a kill must
  -- not be recorded as paid for a currency that does not exist yet.
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
        v_standing := 0;      -- another claimer already paid it; report honestly
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
end $$;
grant execute on function public.raid_claim(text, uuid, text) to authenticated;

-- ── 7. RLS (§7.5) — assert, don't assume ──────────────────────
-- clan_raids and raid_contributions must stay SELECT-only for clients. The
-- b219 migration revoked the contribution UPDATE policy that let a tampered
-- client forge the `damage` figure these reward bands read; re-assert it here
-- so a future edit cannot quietly reopen it.
drop policy if exists "own contribution claim" on public.raid_contributions;
drop policy if exists "raids writable" on public.clan_raids;
drop policy if exists "raids readable" on public.clan_raids;
create policy "raids readable" on public.clan_raids for select using (true);
drop policy if exists "contributions readable" on public.raid_contributions;
create policy "contributions readable" on public.raid_contributions for select using (true);

-- ── 8. Self-checks (they only read; harmless to re-run) ───────
do $$
declare
  v_bad int;
  v_pool bigint;
begin
  if public.hr_utc_day_key() !~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    raise exception 'hr_utc_day_key produced an unexpected shape: %', public.hr_utc_day_key();
  end if;
  if public.hr_utc_week_key() !~ '^w\d+$' then
    raise exception 'hr_utc_week_key produced an unexpected shape: %', public.hr_utc_week_key();
  end if;
  if public.hr_week_start(public.hr_utc_week_key()) > now()
     or public.hr_week_start(public.hr_utc_week_key()) < now() - interval '7 days' then
    raise exception 'hr_week_start disagrees with hr_utc_week_key: % vs now()',
      public.hr_week_start(public.hr_utc_week_key());
  end if;

  -- The spec's own worked numbers (§3.3 and test §8.4). If these drift, the
  -- ladder has been re-tuned and the client's HUNT_TIERS must be re-tuned too.
  v_pool := public.hr_hunt_pool(2, 10);
  if v_pool <> 90000 then raise exception 'Tier II @ n=10 should be 90,000 HP, got %', v_pool; end if;
  v_pool := public.hr_hunt_pool(2, 5);
  if v_pool <> 52500 then raise exception 'Tier II @ n=5 should be 52,500 HP, got %', v_pool; end if;
  v_pool := public.hr_hunt_pool(2, 25);
  if v_pool <> 202500 then raise exception 'Tier II @ n=25 should be 202,500 HP, got %', v_pool; end if;
  v_pool := public.hr_hunt_pool(5, 40);
  if v_pool <> 920000 then raise exception 'Tier V @ n=40 should be 920,000 HP, got %', v_pool; end if;
  if public.hr_hunt_clamp(35000) <> 5000 then
    raise exception 'the clamp floor is wrong: %', public.hr_hunt_clamp(35000);
  end if;
  if public.hr_hunt_clamp(920000) <> 92000 then
    raise exception 'the clamp fraction is wrong: %', public.hr_hunt_clamp(920000);
  end if;

  -- Every boss must be legal for at least one tier, and every tier must have a
  -- boss — otherwise a declaration at that tier has nothing to fight.
  select count(*) into v_bad from generate_series(1,5) as g(t)
   where not exists (select 1 from public.hr_hunt_bosses b where g.t between b.tier_min and b.tier_max);
  if v_bad > 0 then raise exception '% Hunt tier(s) have no legal boss', v_bad; end if;
  select count(*) into v_bad from public.hr_hunt_tiers;
  if v_bad <> 5 then raise exception 'expected 5 Hunt tiers, found %', v_bad; end if;

  -- The b219 hardening must still hold.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'raid_contributions' and cmd in ('UPDATE','ALL');
  if v_bad > 0 then
    raise exception 'raid_contributions has a client UPDATE policy again — chests can bypass raid_claim()';
  end if;
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'clan_raids' and cmd in ('UPDATE','INSERT','ALL');
  if v_bad > 0 then
    raise exception 'clan_raids has a client write policy — pools can be forged';
  end if;
  if to_regclass('public.raid_claims') is null then
    raise exception 'the raid_claims ledger is gone — one chest per player per week is no longer enforced';
  end if;

  -- The blueprint gate (§10.2). clan_tier_up reads clan_raids.tier defensively
  -- because that column arrives HERE; now that it exists the gate is exact.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='clan_raids' and column_name='tier') then
    raise exception 'clan_raids.tier is missing — the castle tier-4/5 blueprint gate cannot be exact';
  end if;
  if to_regclass('public.hr_castle_tiers') is null then
    raise notice 'Hunt applied BEFORE the clan-seat migration. That is fine — run 2026-08-08-clan-seat.sql next and its tier-4/5 blueprint gate will read clan_raids.tier exactly.';
  else
    raise notice 'blueprint gate live: castle tiers 4/5 require a Hunt clear at tier >= their hunt_tier_req within 28 days.';
  end if;

  raise notice 'THE HUNT applied: day=% week=% ceiling-fn=% tiers=% bosses=%',
    public.hr_utc_day_key(), public.hr_utc_week_key(),
    (select count(*) from pg_proc where proname = 'hr_max_hunt_tier'),
    (select count(*) from public.hr_hunt_tiers),
    (select count(*) from public.hr_hunt_bosses);
end $$;
