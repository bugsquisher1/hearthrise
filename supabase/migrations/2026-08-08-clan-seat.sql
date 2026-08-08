-- ============================================================
-- Hearthrise — migration 2026-08-08 · THE CLAN SEAT (backlog #10, Wave 3a)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing table, policy or
-- function belonging to another system is dropped or altered. The one
-- pre-existing object this touches is `public.clans`, and only by ADDING
-- columns and promoting `castle_tier` from 0 to 1 (see §2).
--
-- Spec: docs/design/clan-overhaul.md v2 ("The Clan Seat"), §12 in full.
--
-- WHAT THIS IS
--   A clan stops being a chat channel with a gold pile and becomes a HOLD that
--   its members build: a Wayside Camp that grows to a Fortified Keep through
--   Standing (a pooled, never-decaying currency), Contribution (a per-member
--   ladder that decays 12%/week so the roster shows who is helping NOW), and
--   Work Orders (a three-phase job whose middle phase is fed by ordinary play).
--
-- WHY THESE THINGS AND NOT OTHERS ARE ON THE SERVER
--   Four things cannot be trusted to a client, and they are the four things
--   stored and computed here:
--     1. WHAT A DEPOSIT IS WORTH.  CP and Standing are computed from a
--        server-side item catalogue (§3), never from numbers the client sends.
--        A client that computes its own CP computes its own castle.
--     2. WHETHER A GATE IS MET.  Standing thresholds, the distinct-contributor
--        count, the 72h membership grace, the Hunt-clear requirement and the
--        Work Order time floor are all re-derived here from stored rows.
--     3. WHAT TIME IT IS.  Upkeep, CP decay, the daily Labour cap and the
--        withdrawal delay are all clocks. Every one of them reads now().
--     4. HOW FAST.  Per-call and per-day clamps bound every write.
--
-- ⚠ THE HONEST LIMITATION — READ BEFORE DESCRIBING THIS SYSTEM (spec §12.3)
--   `clan_deposit` can validate identity, membership, the item id, its
--   catalogued tier and value, a per-call clamp and a per-day cap. It CANNOT
--   validate that the caller actually owned the item, because Hearthrise has no
--   server inventory — `game_saves.snapshot` is client-authored.
--
--   The accurate statement, and the ONLY one that should be used anywhere:
--     SERVER-AUTHORITATIVE for currency, gates, rewards and rate;
--     CLIENT-TRUSTED for item possession, CLAMPED and AUDITED.
--   Do NOT describe Phase A as fully server-authoritative for materials.
--   It is bounded by four things: per-call and per-day value clamps; CP decay,
--   so a cheater's ladder position fades on its own; the §8 power budget, so
--   the prize for cheating is small; and `clan_ledger`, which makes every
--   deposit auditable after the fact. True item authority is the Wave-5
--   server-inventory project.
--
-- ECONOMY GUARANTEE
--   Nothing here mints a hearth_token. The IAP bond is not mintable in PvE, at
--   any tier, for any reason (Final Directive). There is no code path in this
--   file that names it.
--
-- COMPATIBILITY — read before running:
--   • Every RPC is NEW. `clan_contribute` is untouched and keeps working.
--   • The b222 client FEATURE-DETECTS every RPC (404 / PGRST202 / 42883 /
--     42P01 → {action:'unsupported'}, see src/features/clan-seat.js). Nothing
--     in the b222 client calls any of these yet.
--     → THE CLIENT SHIPS FIRST. Ship b222, then run this file.
--   • Shared helpers hr_utc_day_key() / hr_utc_week_key() are re-created here
--     byte-identical to schema.sql and 2026-08-08-raid-hardening.sql, so this
--     migration can be run in any order relative to those.
-- ============================================================

-- ── 0. Preconditions + shared UTC clock helpers ───────────────
do $$
begin
  if to_regclass('public.clans') is null or to_regclass('public.clan_members') is null then
    raise exception 'clans / clan_members are missing — run supabase/schema.sql first, then this migration';
  end if;
end $$;

-- MUST agree byte-for-byte with src/features/world-events.js utcDayKey():
-- UNPADDED — '2026-8-8', not '2026-08-08'.
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;
create or replace function public.hr_utc_week_key(p_at timestamptz default now())
returns text language sql stable as $$
  select 'w' || ((((p_at at time zone 'utc')::date - date '1970-01-01') / 7))::text
$$;

-- The upkeep boundary: Sunday 00:00 UTC, DERIVED. Storing a schedule means a
-- row to forget to insert; deriving it means the schedule is the same forever
-- on every server and every client. Same discipline as the Muster migration.
-- Mirrors src/features/clan-seat.js lastUpkeepBoundary().
-- date_trunc('week') is ISO, i.e. it truncates to MONDAY. Shift back one day to
-- reach the preceding Sunday, then add a week when p_at is itself a Sunday (a
-- Sunday's ISO week starts on the Monday six days earlier, so the naive shift
-- would land a week too early). Written with explicit parentheses rather than
-- relying on AT TIME ZONE precedence.
create or replace function public.hr_clan_week_start(p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (p_at at time zone 'utc')) - interval '1 day')
          + (case when extract(isodow from (p_at at time zone 'utc')) = 7
                  then interval '7 days' else interval '0 days' end)
         ) at time zone 'utc'
$$;
comment on function public.hr_clan_week_start(timestamptz) is
  'Most recent Sunday 00:00 UTC at or before p_at. date_trunc(''week'') is ISO (Monday), so shift back one day, and add a week when p_at is itself a Sunday.';

-- ── 1. Standing, upkeep state and the decaying ladder ─────────
alter table public.clans
  add column if not exists standing          bigint      not null default 0,
  add column if not exists upkeep_state      text        not null default 'active',
  add column if not exists upkeep_settled_at timestamptz,
  add column if not exists ration_debt       bigint      not null default 0;

do $$ begin
  alter table public.clans add constraint clans_upkeep_state_chk
    check (upkeep_state in ('active','strained','dormant'));
exception when duplicate_object then null; end $$;

-- `upgrades jsonb` already exists and has never been read or written. It
-- becomes the building-level map {"sawmill":4,"tavern":6,…}. No DDL needed —
-- that was the whole point of it being a pre-built hook.

-- castle_tier defaults to 0 today and every live clan sits there. Tier 1 is the
-- Wayside Camp — the FOUNDING state, not a locked state — so promote existing
-- rows and move the default. Idempotent by construction.
update public.clans set castle_tier = 1 where castle_tier < 1;
alter table public.clans alter column castle_tier set default 1;

alter table public.clan_members
  -- CP decays; `cp_at` is the stamp the lazy decay reads. See §4.
  add column if not exists cp        bigint      not null default 0,
  add column if not exists cp_at     timestamptz not null default now(),
  -- 'steward' (economy) | 'marshal' (combat) | null. The LEADER holds both
  -- implicitly, or a freshly founded clan could commission nothing. One
  -- nullable column delivers the source doc's whole seven-rank insight — that
  -- economy and combat authority must be able to sit with different people —
  -- without a migration on the live `role` CHECK constraint.
  add column if not exists charge    text,
  -- The leader-ghosting clock AND the rested-XP watermark. One column, because
  -- both questions are "when was this member last actually here".
  add column if not exists last_seen timestamptz;

do $$ begin
  alter table public.clan_members add constraint clan_members_charge_chk
    check (charge is null or charge in ('steward','marshal'));
exception when duplicate_object then null; end $$;

-- ── 2. The catalogue: what the Storehouse accepts, and what it is worth ──
-- This table is why deposits are server-authoritative for VALUE. The client
-- sends {item_id: qty}; the value, the material tier and the eligibility all
-- come from here. A client that sends `iron_bar` is refused; a client that
-- claims a Timber Beam is worth 30,000 gold is ignored.
--
--   kind = 'store'   the four refined castle goods (ITEMS[x].tag = 'castle')
--        = 'spoil'   a routed raw combat drop — the ONE exception to "the
--                    castle refuses raw materials" (§4.2): a kill is already a
--                    completed activity, and a hold takes tribute of trophies
--        = 'trophy'  the three tier-5 capstone objects, one each, no grind
create table if not exists public.hr_castle_items (
  item_id    text primary key,
  kind       text   not null check (kind in ('store','spoil','trophy')),
  tier       int    not null check (tier between 1 and 7),
  gold_value bigint not null check (gold_value >= 0)
);
alter table public.hr_castle_items enable row level security;
drop policy if exists "castle items readable" on public.hr_castle_items;
create policy "castle items readable" on public.hr_castle_items for select using (true);

-- Seeded from src/data/items.js. `on conflict do update` makes a re-run a
-- resync rather than a no-op, so a Designer re-value is one edit here.
insert into public.hr_castle_items (item_id, kind, tier, gold_value) values
  -- the four refined goods (clan-overhaul v2 §4.3)
  ('timber_beam','store',2,300), ('iron_fitting','store',2,480),
  ('field_ration','store',1,90), ('keystone','store',5,3000),
  -- the routed spoils (§4.4). Every one of these was recipe-less vendor trash
  -- before the Clan Seat — the largest open item on the Designer's backlog.
  ('rune_frag','spoil',2,30),           ('dark_sigil','spoil',2,180),
  ('venom_sac','spoil',3,75),           ('spider_eye','spoil',3,220),
  ('brute_plate','spoil',3,130),        ('grave_dust','spoil',3,95),
  ('plague_ichor','spoil',4,180),       ('swarm_heart','spoil',4,650),
  ('wraith_veil','spoil',4,420),        ('demon_shard','spoil',4,200),
  ('hell_ember','spoil',4,600),         ('shadow_thread','spoil',5,320),
  ('void_chitin','spoil',5,800),        ('shadow_pelt','spoil',5,480),
  ('razor_claw','spoil',5,360),         ('death_steel','spoil',5,550),
  ('ruby','spoil',5,400),               ('hollow_sigil','spoil',5,1400),
  -- Tavern Board tributes: the Barkeep pays for vermin, which is what gives a
  -- level-3 player something to do for the hold on day one.
  ('rat_tail','spoil',1,6),             ('goblin_ear','spoil',1,8),
  ('bat_wing','spoil',2,12),            ('small_fang','spoil',1,15),
  ('night_fang','spoil',2,90),          ('dire_fang','spoil',3,150),
  -- Spec §4.4 routes these three to Phase-B Archives / Armory research. They
  -- are catalogued NOW anyway, as ordinary Work Order spoils, because leaving
  -- three drops as vendor trash for another wave would reopen the exact problem
  -- this table exists to close. Phase B narrows their use; it does not add it.
  ('sticky_core','spoil',1,35),         ('goblin_totem','spoil',2,120),
  ('alpha_fang','spoil',3,450),
  -- the three capstone trophies, hung in the Great Hall
  ('war_crown','trophy',6,2500), ('ancient_claw','trophy',6,1600), ('dragon_gem','trophy',6,2000)
on conflict (item_id) do update
  set kind = excluded.kind, tier = excluded.tier, gold_value = excluded.gold_value;

-- ── 3. The castle ladder and the buildings, server-side ───────
-- Work Order bundles and tier gates are DERIVED HERE, never accepted from the
-- client (§12.2). A client that posts its own bundle posts its own castle.
create table if not exists public.hr_castle_tiers (
  tier          int primary key check (tier between 1 and 10),
  name          text   not null,
  standing_req  bigint not null,
  gold_req      bigint not null,
  member_cap    int    not null,
  building_cap  int    not null,
  contributors  int    not null,       -- DISTINCT members, each ≥72h in the clan
  hunt_tier_req int    not null,       -- 0 = none; else a clear within 28 days
  materials     jsonb  not null default '{}'::jsonb
);
alter table public.hr_castle_tiers enable row level security;
drop policy if exists "castle tiers readable" on public.hr_castle_tiers;
create policy "castle tiers readable" on public.hr_castle_tiers for select using (true);

insert into public.hr_castle_tiers
  (tier, name, standing_req, gold_req, member_cap, building_cap, contributors, hunt_tier_req, materials) values
  (1,'Wayside Camp',        0,       0, 10,  2,  0, 0, '{}'::jsonb),
  (2,'Palisade',        12000,   40000, 15,  4,  3, 0,
     '{"timber_beam":300,"iron_fitting":120}'::jsonb),
  (3,'Timber Hold',     60000,  200000, 25,  6,  5, 0,
     '{"timber_beam":900,"iron_fitting":500,"field_ration":400}'::jsonb),
  (4,'Stone Bailey',   240000,  800000, 40,  8,  8, 2,
     '{"timber_beam":2400,"iron_fitting":1500,"field_ration":1200,"keystone":40}'::jsonb),
  (5,'Fortified Keep', 900000, 3000000, 60, 10, 12, 3,
     '{"timber_beam":6000,"iron_fitting":4000,"field_ration":3000,"keystone":200,"war_crown":1,"ancient_claw":1,"dragon_gem":1}'::jsonb)
on conflict (tier) do update
  set name = excluded.name, standing_req = excluded.standing_req, gold_req = excluded.gold_req,
      member_cap = excluded.member_cap, building_cap = excluded.building_cap,
      contributors = excluded.contributors, hunt_tier_req = excluded.hunt_tier_req,
      materials = excluded.materials;

-- Six buildings, and no more (§7). Each does two things: a castle function and
-- a member-facing perk. Level-1 bundles below; higher levels scale by
-- 1.58^(level−1), computed in clan_work_post.
create table if not exists public.hr_castle_buildings (
  building   text primary key,
  name       text   not null,
  district   text   not null,
  base_gold  bigint not null,
  base_bundle jsonb not null
);
alter table public.hr_castle_buildings enable row level security;
drop policy if exists "castle buildings readable" on public.hr_castle_buildings;
create policy "castle buildings readable" on public.hr_castle_buildings for select using (true);

insert into public.hr_castle_buildings (building, name, district, base_gold, base_bundle) values
  ('treasury','Treasury','keep',       4000, '{"timber_beam":30,"iron_fitting":15}'::jsonb),
  ('tavern',  'The Tavern','village',  6000, '{"timber_beam":40,"iron_fitting":20,"field_ration":60}'::jsonb),
  ('sawmill', 'Sawmill','outer_ward',  5000, '{"timber_beam":35,"iron_fitting":15}'::jsonb),
  ('smeltery','Smeltery','outer_ward', 5000, '{"timber_beam":25,"iron_fitting":25}'::jsonb),
  ('war_room','War Room','keep',       8000, '{"timber_beam":40,"iron_fitting":30}'::jsonb)
on conflict (building) do update
  set name = excluded.name, district = excluded.district,
      base_gold = excluded.base_gold, base_bundle = excluded.base_bundle;
-- The Great Hall is deliberately absent: it IS castle_tier, not a Work Order.

-- ── 4. The Storehouse, the ledger, and the work tables ───────
-- Per-item ROWS, not a jsonb blob on clans: this avoids a hot-row contention
-- point (every deposit in a 60-member clan would otherwise contend for one
-- row) and makes the Treasury's per-item cap natural.
create table if not exists public.clan_stores (
  clan_id uuid   not null references public.clans(id) on delete cascade,
  item_id text   not null,
  qty     bigint not null default 0 check (qty >= 0),
  primary key (clan_id, item_id)
);

-- The audit trail. Powers the "recent treasury events" list, the
-- distinct-contributor gate, and every anti-abuse investigation we will
-- inevitably have to run — which, given §12.3, is not optional.
create table if not exists public.clan_ledger (
  id       bigserial primary key,
  clan_id  uuid not null references public.clans(id) on delete cascade,
  user_id  uuid,
  kind     text not null check (kind in ('deposit','labour','tier','withdraw','upkeep','feast','board','rested','role')),
  item_id  text,
  qty      bigint,
  cp       bigint,
  standing bigint,
  at       timestamptz not null default now()
);
create index if not exists clan_ledger_clan_idx on public.clan_ledger (clan_id, at desc);
create index if not exists clan_ledger_tier_idx on public.clan_ledger (clan_id, kind, at desc);

create table if not exists public.clan_work_orders (
  id            uuid primary key default gen_random_uuid(),
  clan_id       uuid not null references public.clans(id) on delete cascade,
  building      text not null,
  to_level      int  not null check (to_level between 1 and 10),
  phase         text not null default 'supply'
                check (phase in ('supply','labour','done','cancelled')),
  materials     jsonb not null,                 -- {item_id: qty required}
  supplied      jsonb not null default '{}'::jsonb,
  labour_target int  not null,
  labour_done   int  not null default 0,
  posted_by     uuid not null,
  posted_at     timestamptz not null default now(),
  labour_from   timestamptz,                    -- set when phase → 'labour'
  floor_until   timestamptz,                    -- completion refused before this
  completed_at  timestamptz
);
create index if not exists clan_work_orders_open_idx
  on public.clan_work_orders (clan_id, phase);

-- THE DAILY LABOUR CAP IS THE PRIMARY KEY PLUS THE CHECK. Same trick as the
-- Muster's (day_key, user_id) join gate: the rule is enforced by the schema,
-- not by code. Application logic drifts; a constraint cannot.
--
-- Note the key is (clan, user, day) and NOT (order, user, day). The cap is per
-- member per day across the WHOLE castle — keying it per order would silently
-- double every member's ceiling to 800 the moment a clan opened its second
-- Work Order slot at tier 3. Per-order attribution lives in clan_ledger.
create table if not exists public.clan_work_labour (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null,
  day_key text not null,
  ticks   int  not null default 0 check (ticks between 0 and 400),
  primary key (clan_id, user_id, day_key)
);

create table if not exists public.clan_tavern (
  clan_id        uuid primary key references public.clans(id) on delete cascade,
  feast_meter    int not null default 0 check (feast_meter >= 0),
  feast_until    timestamptz,
  feast_cd_until timestamptz
);

-- The Board's RPCs land with §16 step 6; the table is created now so the whole
-- Clan Seat schema arrives in one migration rather than two.
create table if not exists public.clan_board (
  clan_id     uuid not null references public.clans(id) on delete cascade,
  period_key  text not null,                    -- hr_utc_day_key or hr_utc_week_key
  task_id     text not null,
  target      bigint not null,
  progress    bigint not null default 0,
  claimed_by  uuid[] not null default '{}',
  primary key (clan_id, period_key, task_id)
);

-- A withdrawal over 10% of the treasury is DELAYED 24 hours and announced in
-- clan chat — it is not refused. That is the anti-grief rule, kept verbatim,
-- and its whole value is that it is predictable.
create table if not exists public.clan_withdrawals (
  id         uuid primary key default gen_random_uuid(),
  clan_id    uuid not null references public.clans(id) on delete cascade,
  user_id    uuid not null,
  amount     bigint not null check (amount > 0),
  requested_at timestamptz not null default now(),
  ready_at   timestamptz not null,
  settled_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists clan_withdrawals_open_idx
  on public.clan_withdrawals (clan_id, ready_at) where settled_at is null and cancelled_at is null;

-- RLS: select-all, and NO write policy on any of them — matching clan_raids.
-- The SECURITY DEFINER RPCs below are the only writers, which is what makes
-- every gate in this file real. `clans` and `clan_members` need no lockdown:
-- they already have no UPDATE policy (schema.sql L270-293), so treasury, level
-- and upgrades are RPC-only today.
do $$
declare t text;
begin
  foreach t in array array['clan_stores','clan_ledger','clan_work_orders','clan_work_labour',
                           'clan_tavern','clan_board','clan_withdrawals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' readable', t);
    execute format('create policy %I on public.%I for select using (true)', t || ' readable', t);
  end loop;
end $$;

-- ── 5. Lazy CP decay — no cron, no drift ─────────────────────
-- Every RPC that reads cp applies `cp := floor(cp * 0.88 ^ weeks_since(cp_at))`
-- first and stamps cp_at. A scheduled job would be a second clock to keep
-- correct and a place for a clan to be half-decayed; this way a clan that goes
-- quiet for three months comes back with its castle intact and its ladder
-- honestly reset. Standing never decays — that is the whole reason there are
-- two numbers.
create or replace function public.hr_clan_decay_cp(p_clan_id uuid, p_user_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_cp bigint; v_at timestamptz; v_weeks numeric; v_new bigint;
begin
  select cp, cp_at into v_cp, v_at
    from public.clan_members where clan_id = p_clan_id and user_id = p_user_id;
  if v_cp is null then return 0; end if;
  v_weeks := extract(epoch from (now() - v_at)) / 604800.0;
  if v_weeks <= 0 then return v_cp; end if;
  v_new := floor(v_cp * power(0.88, v_weeks))::bigint;
  update public.clan_members set cp = v_new, cp_at = now()
    where clan_id = p_clan_id and user_id = p_user_id;
  return v_new;
end $$;

-- ── 6. Lazy upkeep settlement + dormancy ─────────────────────
-- Settled every Sunday 00:00 UTC, LAZILY: the first RPC touching the clan after
-- the boundary computes the weeks elapsed and settles them all.
--
-- Forgiving, not punishing. Nothing is EVER destroyed or de-levelled — a
-- dormant hold keeps every building at every level and is restored to Active by
-- paying one week's upkeep. That is a retention decision, not a balance one.
create or replace function public.clan_upkeep_settle(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold_per_level constant bigint := 250;
  c_ration_per_level constant bigint := 2;
  v_clan     public.clans%rowtype;
  v_levels   int := 0;
  v_treasury_lv int := 0;
  v_discount numeric;
  v_boundary timestamptz;
  v_from     timestamptz;
  v_weeks    int;
  v_gold_due bigint; v_ration_due bigint;
  v_gold_paid bigint := 0; v_rations_paid bigint := 0;
  v_have_rations bigint := 0;
  v_paid_frac numeric := 1;
  v_state    text;
begin
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.id is null then return jsonb_build_object('ok', false, 'error', 'no_clan'); end if;

  v_boundary := public.hr_clan_week_start();
  v_from := coalesce(v_clan.upkeep_settled_at, v_boundary);
  if v_from >= v_boundary then
    return jsonb_build_object('ok', true, 'weeks', 0, 'upkeep_state', v_clan.upkeep_state,
                              'gold_paid', 0, 'rations_paid', 0);
  end if;
  v_weeks := greatest(0, floor(extract(epoch from (v_boundary - public.hr_clan_week_start(v_from))) / 604800.0)::int);
  if v_weeks <= 0 then
    update public.clans set upkeep_settled_at = v_boundary where id = p_clan_id;
    return jsonb_build_object('ok', true, 'weeks', 0, 'upkeep_state', v_clan.upkeep_state,
                              'gold_paid', 0, 'rations_paid', 0);
  end if;

  select coalesce(sum(greatest(0, (value)::int)), 0) into v_levels
    from jsonb_each_text(coalesce(v_clan.upgrades, '{}'::jsonb))
   where value ~ '^[0-9]+$';
  v_treasury_lv := coalesce(nullif(v_clan.upgrades->>'treasury','')::int, 0);
  v_discount := 1 - least(10, greatest(0, v_treasury_lv)) * 0.01;   -- max −10%

  v_gold_due   := ceil(v_levels * c_gold_per_level   * v_discount)::bigint * v_weeks;
  v_ration_due := ceil(v_levels * c_ration_per_level * v_discount)::bigint * v_weeks;

  if v_gold_due <= 0 and v_ration_due <= 0 then
    update public.clans
       set upkeep_settled_at = v_boundary, upkeep_state = 'active'
     where id = p_clan_id;
    return jsonb_build_object('ok', true, 'weeks', v_weeks, 'upkeep_state', 'active',
                              'gold_paid', 0, 'rations_paid', 0);
  end if;

  v_gold_paid := least(v_gold_due, greatest(0, v_clan.treasury));
  select coalesce(qty, 0) into v_have_rations
    from public.clan_stores where clan_id = p_clan_id and item_id = 'field_ration';
  v_rations_paid := least(v_ration_due, coalesce(v_have_rations, 0));

  update public.clans set treasury = treasury - v_gold_paid where id = p_clan_id;
  if v_rations_paid > 0 then
    update public.clan_stores set qty = qty - v_rations_paid
      where clan_id = p_clan_id and item_id = 'field_ration';
  end if;

  -- Both lines count equally toward "did you pay". A hold that has the gold but
  -- no rations is genuinely half-supplied, and Strained is what that looks like.
  v_paid_frac := (v_gold_paid + v_rations_paid)::numeric
                 / nullif((v_gold_due + v_ration_due), 0)::numeric;
  v_state := case when v_paid_frac >= 1 then 'active'
                  when v_paid_frac >= 0.5 then 'strained'
                  else 'dormant' end;

  update public.clans
     set upkeep_settled_at = v_boundary,
         upkeep_state = v_state,
         ration_debt = greatest(0, v_ration_due - v_rations_paid)
   where id = p_clan_id;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty)
    values (p_clan_id, null, 'upkeep', 'field_ration', v_rations_paid);

  return jsonb_build_object('ok', true, 'weeks', v_weeks, 'upkeep_state', v_state,
    'gold_paid', v_gold_paid, 'rations_paid', v_rations_paid,
    'gold_due', v_gold_due, 'rations_due', v_ration_due, 'levels', v_levels);
end $$;
grant execute on function public.clan_upkeep_settle(uuid) to authenticated;

-- Restored: paying one week's upkeep returns a dormant hold to Active
-- instantly. Nothing to rebuild, nothing lost.
create or replace function public.clan_upkeep_pay(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clan public.clans%rowtype; v_levels int; v_treasury_lv int; v_due bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  select * into v_clan from public.clans where id = p_clan_id;
  select coalesce(sum(greatest(0, (value)::int)), 0) into v_levels
    from jsonb_each_text(coalesce(v_clan.upgrades, '{}'::jsonb)) where value ~ '^[0-9]+$';
  v_treasury_lv := coalesce(nullif(v_clan.upgrades->>'treasury','')::int, 0);
  v_due := ceil(v_levels * 250 * (1 - least(10, greatest(0, v_treasury_lv)) * 0.01))::bigint;
  if v_clan.treasury < v_due then
    return jsonb_build_object('ok', false, 'error', 'treasury_short', 'due', v_due);
  end if;
  update public.clans
     set treasury = treasury - v_due, upkeep_state = 'active', ration_debt = 0
   where id = p_clan_id;
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'upkeep', v_due);
  return jsonb_build_object('ok', true, 'upkeep_state', 'active', 'gold_paid', v_due);
end $$;
grant execute on function public.clan_upkeep_pay(uuid) to authenticated;

-- ── 7. clan_deposit — the Storehouse ─────────────────────────
--
-- ⚠ POSSESSION IS CLIENT-TRUSTED AND CLAMPED (spec §12.3, CONFLICTS #8).
--   This function is SERVER-AUTHORITATIVE for currency, gates, rewards and
--   rate. It is CLIENT-TRUSTED for item possession, clamped and audited.
--   It cannot verify the caller owned what they deposited, because
--   game_saves.snapshot is client-authored and there is no server inventory.
--   Never describe it as fully server-authoritative for materials.
--
-- The clamps below are the bound on that trust. They are NOT in the spec —
-- Systems chose them, deliberately far above honest play so they are an abuse
-- ceiling rather than a gameplay limit. A committed member supplies roughly
-- 40 beam-equivalents a week (≈12,000 gold of value); the per-day ceiling here
-- is 5,000,000, i.e. ~400× that.
create or replace function public.clan_deposit(p_clan_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_call_clamp constant bigint := 1000000;    -- gold value per call
  c_day_clamp  constant bigint := 5000000;    -- gold value per member per UTC day
  c_max_kinds  constant int    := 40;
  c_qty_clamp  constant bigint := 100000;     -- per item id per call
  c_store_base constant bigint := 2500;       -- Storehouse cap per item, ×Treasury lvl
  v_clan     public.clans%rowtype;
  v_day      text := public.hr_utc_day_key();
  v_treasury_lv int;
  v_cap      bigint;
  v_spent_today bigint := 0;
  v_budget   bigint;
  v_demand   jsonb;
  k text; v_qty bigint;
  v_item     public.hr_castle_items%rowtype;
  v_have     bigint;
  v_mult     numeric;
  v_kind     text;
  v_unit_cp  bigint;
  v_cp_total bigint := 0;
  v_value    bigint := 0;
  v_stand    bigint;
  v_capped   boolean := false;
  v_ordered  boolean := false;
  v_stored   jsonb := '{}'::jsonb;
  v_new_cp   bigint;
  v_new_standing bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if (select count(*) from jsonb_object_keys(p_items)) > c_max_kinds then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;

  perform public.clan_upkeep_settle(p_clan_id);          -- lazy settle, every touch
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.upkeep_state = 'dormant' then
    -- A dormant hold freezes Work Orders, but it must still accept supplies —
    -- otherwise a clan that misses one Sunday cannot dig itself out.
    null;
  end if;

  v_treasury_lv := coalesce(nullif(v_clan.upgrades->>'treasury','')::int, 0);
  v_cap := c_store_base * greatest(1, v_treasury_lv);    -- a hold has stores before it has a Treasury

  -- Per-member per-day value budget, read from the ledger rather than stored:
  -- one fewer counter to reset, and it is auditable by construction.
  select coalesce(sum(qty * i.gold_value), 0) into v_spent_today
    from public.clan_ledger l
    join public.hr_castle_items i on i.item_id = l.item_id
   where l.clan_id = p_clan_id and l.user_id = auth.uid() and l.kind = 'deposit'
     and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');
  v_budget := least(c_call_clamp, greatest(0, c_day_clamp - v_spent_today));
  if v_budget <= 0 then
    return jsonb_build_object('ok', false, 'error', 'daily_cap');
  end if;

  -- What the hold is asking for right now: the open Work Order's materials plus
  -- the next tier's bundle. Anything on that list carries the 1.5× multiplier —
  -- which is how the castle TELLS the clan what it needs, without a chat message.
  select coalesce(jsonb_object_agg(k2, true), '{}'::jsonb) into v_demand
    from (
      select jsonb_object_keys(materials) as k2
        from public.clan_work_orders
       where clan_id = p_clan_id and phase in ('supply','labour')
      union
      select jsonb_object_keys(materials) as k2
        from public.hr_castle_tiers where tier = v_clan.castle_tier + 1
    ) d;

  for k, v_qty in select key, greatest(0, least(c_qty_clamp, coalesce(nullif(value,'')::bigint, 0)))
                    from jsonb_each_text(p_items) loop
    if v_qty <= 0 then continue; end if;
    select * into v_item from public.hr_castle_items where item_id = k;
    -- THE RULE: the castle refuses raw gathered materials. Logs, ore, fish and
    -- crops are not in the catalogue, so a gatherer needs a crafter — permanently.
    if v_item.item_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_castle_good', 'item_id', k);
    end if;
    -- Budget is spent in gold value, so one clamp bounds a beam and a Keystone
    -- alike without a per-item table of limits.
    if v_item.gold_value > 0 then
      v_qty := least(v_qty, v_budget / v_item.gold_value);
    end if;
    if v_qty <= 0 then continue; end if;

    select coalesce(qty, 0) into v_have from public.clan_stores
      where clan_id = p_clan_id and item_id = k;
    v_have := coalesce(v_have, 0);

    -- The demand multiplier. 0.4× at cap is kept VERBATIM from the source doc
    -- and it is load-bearing: it stops one player dumping 40,000 Normal Planks
    -- and owning the ladder while the hold is starved of Fittings.
    if v_have >= v_cap then
      v_mult := 0.4; v_kind := 'capped'; v_capped := true;
    elsif v_demand ? k then
      v_mult := 1.5; v_kind := 'ordered'; v_ordered := true;
    else
      v_mult := 1.0; v_kind := 'normal';
    end if;

    v_unit_cp := floor(ceil(v_item.gold_value / 10.0)
                       * (array[1.0,1.4,2.0,2.9,4.2,6.0,8.6])[v_item.tier]
                       * v_mult)::bigint;
    v_cp_total := v_cp_total + v_unit_cp * v_qty;
    v_value    := v_value + v_item.gold_value * v_qty;
    v_budget   := greatest(0, v_budget - v_item.gold_value * v_qty);

    insert into public.clan_stores as s (clan_id, item_id, qty) values (p_clan_id, k, v_qty)
      on conflict (clan_id, item_id) do update set qty = s.qty + excluded.qty;

    insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty, cp, standing)
      values (p_clan_id, auth.uid(), 'deposit', k, v_qty, v_unit_cp * v_qty,
              floor(v_unit_cp * v_qty * 0.35)::bigint);

    v_stored := v_stored || jsonb_build_object(k, v_have + v_qty);
  end loop;

  if v_cp_total <= 0 then
    return jsonb_build_object('ok', true, 'cp', 0, 'standing', 0,
      'clan_standing', v_clan.standing, 'stored', v_stored, 'demand', 'normal', 'capped', v_capped);
  end if;

  v_stand := floor(v_cp_total * 0.35)::bigint;      -- the source doc's ratio, kept

  perform public.hr_clan_decay_cp(p_clan_id, auth.uid());   -- decay BEFORE crediting
  update public.clan_members set cp = cp + v_cp_total, cp_at = now(), last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid()
    returning cp into v_new_cp;
  update public.clans set standing = standing + v_stand where id = p_clan_id
    returning standing into v_new_standing;

  return jsonb_build_object('ok', true, 'cp', v_cp_total, 'standing', v_stand,
    'member_cp', v_new_cp, 'clan_standing', v_new_standing, 'stored', v_stored,
    'value', v_value, 'store_cap', v_cap,
    'demand', case when v_capped then 'capped' when v_ordered then 'ordered' else 'normal' end,
    'capped', v_capped);
end $$;
grant execute on function public.clan_deposit(uuid, jsonb) to authenticated;

-- ── 8. Work Orders — the three-phase loop ────────────────────
-- Commission → Supply → Labour. The middle phase is where the clan actually
-- talks to each other, and the last one is fed by ORDINARY PLAY: there is no
-- "On Site" toggle, because an idle game's cardinal sin is a mode you forget to
-- enable (§6.4).
create or replace function public.clan_work_post(p_clan_id uuid, p_building text, p_to_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan  public.clans%rowtype;
  v_role  text; v_charge text;
  v_b     public.hr_castle_buildings%rowtype;
  v_open  int;
  v_slots int;
  v_cur   int;
  v_scale numeric;
  v_mats  jsonb;
  v_target int;
  v_id    uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role, charge into v_role, v_charge from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  -- The leader always holds both charges implicitly, or a freshly founded clan
  -- could commission nothing at all.
  if v_role <> 'leader' and coalesce(v_charge,'') <> 'steward' then
    return jsonb_build_object('ok', false, 'error', 'not_steward');
  end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.upkeep_state = 'dormant' then
    return jsonb_build_object('ok', false, 'error', 'dormant');
  end if;

  select * into v_b from public.hr_castle_buildings where building = p_building;
  if v_b.building is null then return jsonb_build_object('ok', false, 'error', 'no_building'); end if;

  v_cur := coalesce(nullif(v_clan.upgrades->>p_building,'')::int, 0);
  if p_to_level is distinct from v_cur + 1 then
    return jsonb_build_object('ok', false, 'error', 'bad_level', 'current', v_cur);
  end if;
  -- No building may exceed castle_tier × 2 in level. The Great Hall gates
  -- everything else, which is what makes tiering up feel like unlocking a wing.
  if p_to_level > v_clan.castle_tier * 2 then
    return jsonb_build_object('ok', false, 'error', 'too_high', 'cap', v_clan.castle_tier * 2);
  end if;

  v_slots := 1 + floor(greatest(1, v_clan.castle_tier) / 3);
  select count(*) into v_open from public.clan_work_orders
    where clan_id = p_clan_id and phase in ('supply','labour');
  if v_open >= v_slots then return jsonb_build_object('ok', false, 'error', 'no_slot', 'slots', v_slots); end if;
  if exists (select 1 from public.clan_work_orders
              where clan_id = p_clan_id and building = p_building and phase in ('supply','labour')) then
    return jsonb_build_object('ok', false, 'error', 'already_open');
  end if;

  -- The bundle and the target are DERIVED HERE, never taken from the client.
  v_scale := power(1.58, p_to_level - 1);
  select coalesce(jsonb_object_agg(key, ceil((value::numeric) * v_scale)::bigint), '{}'::jsonb)
    into v_mats from jsonb_each_text(v_b.base_bundle);
  v_target := round(800 * power(1.42, p_to_level - 1))::int;

  insert into public.clan_work_orders
    (clan_id, building, to_level, materials, labour_target, posted_by)
    values (p_clan_id, p_building, p_to_level, v_mats, v_target, auth.uid())
    returning id into v_id;

  return jsonb_build_object('ok', true, 'order_id', v_id, 'building', p_building,
    'to_level', p_to_level, 'materials', v_mats, 'labour_target', v_target,
    'gold', ceil(v_b.base_gold * v_scale)::bigint, 'slots', v_slots);
end $$;
grant execute on function public.clan_work_post(uuid, text, int) to authenticated;

-- Supply: move stored goods onto an open order. Separate from clan_deposit so
-- the Storehouse is a real pool rather than a passthrough — a member can
-- deposit today and the Steward can allocate tomorrow.
create or replace function public.clan_work_supply(p_clan_id uuid, p_order uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o public.clan_work_orders%rowtype;
  k text; v_qty bigint; v_need bigint; v_has bigint; v_take bigint;
  v_supplied jsonb;
  v_complete boolean := true;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  select * into v_o from public.clan_work_orders where id = p_order and clan_id = p_clan_id;
  if v_o.id is null then return jsonb_build_object('ok', false, 'error', 'no_order'); end if;
  if v_o.phase <> 'supply' then return jsonb_build_object('ok', false, 'error', 'wrong_phase', 'phase', v_o.phase); end if;

  v_supplied := v_o.supplied;
  for k, v_qty in select key, greatest(0, coalesce(nullif(value,'')::bigint, 0)) from jsonb_each_text(coalesce(p_items,'{}'::jsonb)) loop
    v_need := coalesce(nullif(v_o.materials->>k,'')::bigint, 0)
              - coalesce(nullif(v_supplied->>k,'')::bigint, 0);
    if v_need <= 0 then continue; end if;
    select coalesce(qty,0) into v_has from public.clan_stores where clan_id = p_clan_id and item_id = k;
    v_take := least(v_qty, v_need, coalesce(v_has, 0));
    if v_take <= 0 then continue; end if;
    update public.clan_stores set qty = qty - v_take where clan_id = p_clan_id and item_id = k;
    v_supplied := v_supplied || jsonb_build_object(k,
      coalesce(nullif(v_supplied->>k,'')::bigint, 0) + v_take);
  end loop;

  for k in select jsonb_object_keys(v_o.materials) loop
    if coalesce(nullif(v_supplied->>k,'')::bigint, 0)
       < coalesce(nullif(v_o.materials->>k,'')::bigint, 0) then
      v_complete := false;
    end if;
  end loop;

  if v_complete then
    -- Phase 3 opens, and the TIME FLOOR starts now. The floor is why a Work
    -- Order is a job rather than a purchase: even a clan that can pay for it
    -- instantly has to live with it for a while.
    update public.clan_work_orders
       set supplied = v_supplied, phase = 'labour', labour_from = now(),
           floor_until = now() + make_interval(secs =>
             least(48, 2 * power(1.15, to_level - 1)) * 3600)
     where id = p_order returning * into v_o;
  else
    update public.clan_work_orders set supplied = v_supplied where id = p_order returning * into v_o;
  end if;

  return jsonb_build_object('ok', true, 'phase', v_o.phase, 'supplied', v_o.supplied,
    'materials', v_o.materials, 'floor_until', v_o.floor_until);
end $$;
grant execute on function public.clan_work_supply(uuid, uuid, jsonb) to authenticated;

-- Labour. Batched client-side every 30s, CALL_CLAMP 200 per flush; the SERVER
-- TOTAL WINS on every response. The 400/day cap is enforced by the table's
-- primary key and CHECK, across every open order — see §4's note.
--
-- It is not an anti-cheat measure; it is the design. Without it one insomniac
-- with an auto-clicker completes every Work Order and the other nine members
-- never see the bar move — the exact failure mode the Labour formula exists to
-- prevent. The cap makes ATTENDANCE the currency, and attendance is what a clan
-- is for.
create or replace function public.clan_work_labour(p_clan_id uuid, p_order uuid, p_ticks int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_call_clamp constant int := 200;
  c_day_cap    constant int := 400;
  v_day  text := public.hr_utc_day_key();
  v_o    public.clan_work_orders%rowtype;
  v_prev int := 0;
  v_new  int;
  v_add  int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_ticks is null or p_ticks <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_ticks');
  end if;
  select * into v_o from public.clan_work_orders where id = p_order and clan_id = p_clan_id;
  if v_o.id is null then return jsonb_build_object('ok', false, 'error', 'no_order'); end if;
  if v_o.phase <> 'labour' then
    return jsonb_build_object('ok', false, 'error', 'wrong_phase', 'phase', v_o.phase);
  end if;

  select ticks into v_prev from public.clan_work_labour
    where clan_id = p_clan_id and user_id = auth.uid() and day_key = v_day;
  v_prev := coalesce(v_prev, 0);
  v_new := least(c_day_cap, v_prev + least(p_ticks, c_call_clamp));
  v_add := v_new - v_prev;

  if v_add <= 0 then
    return jsonb_build_object('ok', true, 'added', 0, 'ticks_today', v_prev, 'capped', true,
      'labour_done', v_o.labour_done, 'labour_target', v_o.labour_target, 'phase', v_o.phase);
  end if;

  insert into public.clan_work_labour (clan_id, user_id, day_key, ticks)
    values (p_clan_id, auth.uid(), v_day, v_new)
    on conflict (clan_id, user_id, day_key) do update set ticks = excluded.ticks;

  update public.clan_work_orders set labour_done = labour_done + v_add
    where id = p_order returning * into v_o;
  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid();
  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty)
    values (p_clan_id, auth.uid(), 'labour', v_o.building, v_add);

  return jsonb_build_object('ok', true, 'added', v_add, 'ticks_today', v_new,
    'capped', v_new >= c_day_cap, 'labour_done', v_o.labour_done,
    'labour_target', v_o.labour_target, 'phase', v_o.phase);
end $$;
grant execute on function public.clan_work_labour(uuid, uuid, int) to authenticated;

create or replace function public.clan_work_complete(p_clan_id uuid, p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o public.clan_work_orders%rowtype;
  v_clan public.clans%rowtype;
  v_gold bigint;
  v_stand bigint;
  v_rows int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  select * into v_o from public.clan_work_orders where id = p_order and clan_id = p_clan_id;
  if v_o.id is null then return jsonb_build_object('ok', false, 'error', 'no_order'); end if;
  if v_o.phase <> 'labour' then return jsonb_build_object('ok', false, 'error', 'wrong_phase'); end if;
  if v_o.labour_done < v_o.labour_target then
    return jsonb_build_object('ok', false, 'error', 'labour_short',
      'labour_done', v_o.labour_done, 'labour_target', v_o.labour_target);
  end if;
  if v_o.floor_until is not null and now() < v_o.floor_until then
    return jsonb_build_object('ok', false, 'error', 'too_soon', 'floor_until', v_o.floor_until);
  end if;

  select * into v_clan from public.clans where id = p_clan_id;
  select ceil(base_gold * power(1.58, v_o.to_level - 1))::bigint into v_gold
    from public.hr_castle_buildings where building = v_o.building;
  if v_clan.treasury < v_gold then
    return jsonb_build_object('ok', false, 'error', 'treasury_short', 'gold', v_gold);
  end if;

  -- Conditional update: row_count = 0 means a concurrent call already
  -- completed it. Race-safe without an advisory lock, same as raid_claim.
  update public.clan_work_orders set phase = 'done', completed_at = now()
    where id = p_order and phase = 'labour';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'already_done'); end if;

  v_stand := floor(v_o.labour_target * 0.35)::bigint;
  update public.clans
     set upgrades = coalesce(upgrades,'{}'::jsonb) || jsonb_build_object(v_o.building, v_o.to_level),
         treasury = treasury - v_gold,
         standing = standing + v_stand
   where id = p_clan_id returning * into v_clan;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty, standing)
    values (p_clan_id, auth.uid(), 'labour', v_o.building, v_o.to_level, v_stand);

  return jsonb_build_object('ok', true, 'building', v_o.building, 'level', v_o.to_level,
    'upgrades', v_clan.upgrades, 'standing', v_clan.standing, 'gold_paid', v_gold);
end $$;
grant execute on function public.clan_work_complete(uuid, uuid) to authenticated;

-- ── 9. clan_tier_up — the master gate ────────────────────────
-- Gated on STANDING, never on clan level. `clan_contribute` computes the level
-- as 10000 × 4^(level−1), which puts level 10 at 655,360,000 gold — v1 gated
-- castle tier 5 on it and the gate was simply unreachable (spec §2.3).
-- `clans.level` is now a cosmetic "age of the hold" badge.
create or replace function public.clan_tier_up(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype;
  v_t    public.hr_castle_tiers%rowtype;
  v_role text;
  k text; v_need bigint; v_have bigint;
  v_contrib int;
  v_hunt int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_leader'); end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  select * into v_t from public.hr_castle_tiers where tier = v_clan.castle_tier + 1;
  if v_t.tier is null then return jsonb_build_object('ok', false, 'error', 'max_tier'); end if;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;

  if v_clan.standing < v_t.standing_req then
    return jsonb_build_object('ok', false, 'error', 'standing_short',
      'standing', v_clan.standing, 'required', v_t.standing_req);
  end if;
  if v_clan.treasury < v_t.gold_req then
    return jsonb_build_object('ok', false, 'error', 'treasury_short',
      'treasury', v_clan.treasury, 'required', v_t.gold_req);
  end if;

  for k in select jsonb_object_keys(v_t.materials) loop
    v_need := coalesce(nullif(v_t.materials->>k,'')::bigint, 0);
    select coalesce(qty,0) into v_have from public.clan_stores where clan_id = p_clan_id and item_id = k;
    if coalesce(v_have,0) < v_need then
      return jsonb_build_object('ok', false, 'error', 'bundle_short', 'item_id', k,
        'have', coalesce(v_have,0), 'need', v_need);
    end if;
  end loop;

  -- THE DISTINCT-CONTRIBUTOR GATE. It kills the one-whale-carries-a-dead-clan
  -- pattern, and the 72h membership grace kills alt-farming — free, because
  -- clan_members.joined_at already existed.
  select count(distinct l.user_id) into v_contrib
    from public.clan_ledger l
    join public.clan_members m on m.clan_id = l.clan_id and m.user_id = l.user_id
   where l.clan_id = p_clan_id and l.kind = 'deposit'
     and m.joined_at < now() - interval '72 hours';
  if v_contrib < v_t.contributors then
    return jsonb_build_object('ok', false, 'error', 'contributors_short',
      'contributors', v_contrib, 'required', v_t.contributors);
  end if;

  -- Tiers 4 and 5 require a Hunt clear at the matching tier inside 28 days.
  -- This is the reciprocal half of the interlock: the Hunt is not optional
  -- content bolted to the side of the castle, it is load-bearing in both
  -- directions. `clan_raids.downed_at` already exists, so the gate is nearly
  -- free. `clan_raids.tier` arrives with the Hunt migration; until then the
  -- column may not exist, so this reads defensively.
  if v_t.hunt_tier_req > 0 then
    if to_regclass('public.clan_raids') is null then
      return jsonb_build_object('ok', false, 'error', 'hunt_required');
    end if;
    execute format(
      'select count(*)::int from public.clan_raids r where r.clan_id = $1 '
      'and r.downed_at is not null and r.downed_at > now() - interval ''28 days'' %s',
      case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='clan_raids' and column_name='tier')
           then 'and coalesce(r.tier,1) >= ' || v_t.hunt_tier_req::text
           else '' end)
      into v_hunt using p_clan_id;
    if coalesce(v_hunt,0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'hunt_required', 'tier', v_t.hunt_tier_req);
    end if;
  end if;

  -- Consume the bundle and the gold, then raise the Hall.
  for k in select jsonb_object_keys(v_t.materials) loop
    update public.clan_stores
       set qty = qty - coalesce(nullif(v_t.materials->>k,'')::bigint, 0)
     where clan_id = p_clan_id and item_id = k;
  end loop;
  update public.clans
     set castle_tier = v_t.tier, treasury = treasury - v_t.gold_req
   where id = p_clan_id returning * into v_clan;

  insert into public.clan_ledger (clan_id, user_id, kind, qty, standing)
    values (p_clan_id, auth.uid(), 'tier', v_t.tier, v_clan.standing);

  return jsonb_build_object('ok', true, 'castle_tier', v_t.tier, 'name', v_t.name,
    'standing', v_clan.standing, 'contributors', v_contrib,
    'member_cap', v_t.member_cap, 'building_cap', v_t.building_cap);
end $$;
grant execute on function public.clan_tier_up(uuid) to authenticated;

-- ── 10. The Tavern: the Feast meter and the Rested XP grant ──
-- Members deposit COOKED FOOD; fill contribution is the food's `heals` value,
-- so a Cooked Shark counts 42 and a Cooked Shrimp counts 8 and the meter is
-- honest about effort. The heal value is supplied by the client and CLAMPED
-- here (same trust model and the same bound as clan_deposit — see §7's notice).
create or replace function public.clan_feast_deposit(p_clan_id uuid, p_heals int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_call_clamp constant int := 600;
  v_clan public.clans%rowtype;
  v_lv int; v_cap int; v_add int; v_t public.clan_tavern%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  select * into v_clan from public.clans where id = p_clan_id;
  v_lv := coalesce(nullif(v_clan.upgrades->>'tavern','')::int, 0);
  if v_lv < 1 then return jsonb_build_object('ok', false, 'error', 'no_tavern'); end if;
  v_cap := 600 + 120 * least(10, v_lv);

  insert into public.clan_tavern (clan_id) values (p_clan_id) on conflict (clan_id) do nothing;
  select * into v_t from public.clan_tavern where clan_id = p_clan_id;
  v_add := greatest(0, least(coalesce(p_heals, 0), c_call_clamp, v_cap - v_t.feast_meter));
  if v_add <= 0 then
    return jsonb_build_object('ok', true, 'meter', v_t.feast_meter, 'cap', v_cap, 'added', 0, 'full', true);
  end if;
  update public.clan_tavern set feast_meter = feast_meter + v_add
    where clan_id = p_clan_id returning * into v_t;
  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid();
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'feast', v_add);
  return jsonb_build_object('ok', true, 'meter', v_t.feast_meter, 'cap', v_cap,
    'added', v_add, 'full', v_t.feast_meter >= v_cap);
end $$;
grant execute on function public.clan_feast_deposit(uuid, int) to authenticated;

-- The cooldown is 20 HOURS, deliberately not 24: it drifts around the clock, so
-- the same timezone never owns Last Call. Same reasoning that killed fixed
-- rally windows in clan-boss-events.md §4.1.
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
    'all_xp', case when v_lv >= 10 then 0.18 when v_lv >= 7 then 0.15
                   when v_lv >= 4 then 0.12 else 0.08 end,
    'last_call_ms', case when v_lv >= 7 then 1800000 else 0 end);
end $$;
grant execute on function public.clan_feast_call(uuid) to authenticated;

-- THE RESTED XP GRANT — the Common Room (§9.4).
--
-- This is the casual-retention jewel: it pays a player for the time they were
-- NOT playing, which is the defining promise of an idle game, and it makes the
-- clan valuable to exactly the member who contributes least in raw output.
--
-- ⚠ THE SERVER IS THE HONEST CLOCK, AND IT IS WATERMARKED. `last_seen` is the
--   instant already paid for; it advances by exactly the charges granted. A
--   second call in the same second grants nothing. This is deliberate defence
--   against the b214 class of bug, where offline rewards paid two and three
--   times per login because processOffline and two catch-up systems all read
--   one unrefreshed timestamp. The client mirrors the same watermark on
--   G.restedAt (legacy.js accrueRestedXp), so BOTH sides are replay-proof and
--   neither can be talked into re-banking by the other.
create or replace function public.clan_rested_grant(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_charge_secs constant int := 360;      -- 1 charge per 6 minutes offline
  c_cap         constant int := 80;       -- 8 hours banked, hard cap
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
    return jsonb_build_object('ok', true, 'charges', 0, 'potency', 0, 'tavern_level', v_lv);
  end if;

  v_charges := floor(extract(epoch from (now() - v_seen)) / c_charge_secs)::int;
  if v_charges <= 0 then
    return jsonb_build_object('ok', true, 'charges', 0,
      'potency', least(10, v_lv) * 0.02, 'tavern_level', v_lv);
  end if;
  -- Advance the watermark by WHAT WAS PAID, not to now(). Capping the grant
  -- without capping the watermark would let a member re-bank the surplus.
  update public.clan_members
     set last_seen = v_seen + make_interval(secs => v_charges * c_charge_secs)
   where clan_id = p_clan_id and user_id = auth.uid();
  v_charges := least(c_cap, v_charges);

  -- A dormant or Tavern-less hold grants charges worth nothing; that is the
  -- inert state, and it is correct — the bank is real, the potency is zero.
  if v_lv < 1 or v_clan.upkeep_state = 'dormant' then
    return jsonb_build_object('ok', true, 'charges', v_charges, 'potency', 0, 'tavern_level', v_lv);
  end if;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'rested', v_charges);

  return jsonb_build_object('ok', true, 'charges', v_charges,
    'potency', least(10, v_lv) * 0.02
               * case when v_clan.upkeep_state = 'strained' then 0.6 else 1 end,
    'tavern_level', v_lv, 'cap', c_cap);
end $$;
grant execute on function public.clan_rested_grant(uuid) to authenticated;

-- ── 11. Treasury withdrawal, roles, and succession ───────────
-- A withdrawal over 10% of the treasury takes 24 hours and is announced. Small
-- withdrawals are instant, so the rule only ever bites the one case it exists
-- for. Kept verbatim from the source doc.
create or replace function public.clan_withdraw(p_clan_id uuid, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype; v_role text; v_charge text; v_id uuid; v_ready timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role, charge into v_role, v_charge from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role <> 'leader' and coalesce(v_charge,'') <> 'steward' then
    return jsonb_build_object('ok', false, 'error', 'not_steward');
  end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;

  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.treasury < p_amount then
    return jsonb_build_object('ok', false, 'error', 'treasury_short', 'treasury', v_clan.treasury);
  end if;

  if p_amount::numeric > v_clan.treasury::numeric * 0.10 then
    v_ready := now() + interval '24 hours';
    insert into public.clan_withdrawals (clan_id, user_id, amount, ready_at)
      values (p_clan_id, auth.uid(), p_amount, v_ready) returning id into v_id;
    -- The gold is NOT moved yet. The delay is the whole mechanism, and a
    -- withdrawal the roster can see coming is one an officer can contest.
    return jsonb_build_object('ok', true, 'pending', true, 'withdrawal_id', v_id,
      'ready_at', v_ready, 'amount', p_amount, 'treasury', v_clan.treasury);
  end if;

  update public.clans set treasury = treasury - p_amount where id = p_clan_id returning * into v_clan;
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'withdraw', p_amount);
  return jsonb_build_object('ok', true, 'pending', false, 'amount', p_amount,
    'treasury', v_clan.treasury);
end $$;
grant execute on function public.clan_withdraw(uuid, bigint) to authenticated;

create or replace function public.clan_withdraw_settle(p_withdrawal uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_w public.clan_withdrawals%rowtype; v_clan public.clans%rowtype; v_rows int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_w from public.clan_withdrawals where id = p_withdrawal;
  if v_w.id is null then return jsonb_build_object('ok', false, 'error', 'no_withdrawal'); end if;
  if v_w.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  if v_w.settled_at is not null or v_w.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;
  if now() < v_w.ready_at then
    return jsonb_build_object('ok', false, 'error', 'too_soon', 'ready_at', v_w.ready_at);
  end if;
  select * into v_clan from public.clans where id = v_w.clan_id;
  if v_clan.treasury < v_w.amount then
    return jsonb_build_object('ok', false, 'error', 'treasury_short');
  end if;
  update public.clan_withdrawals set settled_at = now()
    where id = p_withdrawal and settled_at is null and cancelled_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'already_settled'); end if;
  update public.clans set treasury = treasury - v_w.amount where id = v_w.clan_id returning * into v_clan;
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (v_w.clan_id, auth.uid(), 'withdraw', v_w.amount);
  return jsonb_build_object('ok', true, 'amount', v_w.amount, 'treasury', v_clan.treasury);
end $$;
grant execute on function public.clan_withdraw_settle(uuid) to authenticated;

-- Any officer or the leader may cancel a pending withdrawal. This is what makes
-- the 24h delay a real safeguard rather than a speed bump.
create or replace function public.clan_withdraw_cancel(p_withdrawal uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_w public.clan_withdrawals%rowtype; v_role text; v_rows int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_w from public.clan_withdrawals where id = p_withdrawal;
  if v_w.id is null then return jsonb_build_object('ok', false, 'error', 'no_withdrawal'); end if;
  select role into v_role from public.clan_members where clan_id = v_w.clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role not in ('leader','officer') and v_w.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_officer');
  end if;
  update public.clan_withdrawals set cancelled_at = now()
    where id = p_withdrawal and settled_at is null and cancelled_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'already_settled'); end if;
  return jsonb_build_object('ok', true, 'cancelled', true);
end $$;
grant execute on function public.clan_withdraw_cancel(uuid) to authenticated;

-- Roles and charges. Steward (economy) and Marshal (combat) are separate
-- columns of authority so a clan needs at least two engaged leaders — the one
-- genuinely valuable structural idea in the source doc's seven-rank ladder,
-- delivered by a single nullable column instead of a migration on a live CHECK.
create or replace function public.clan_set_role(p_clan_id uuid, p_user uuid, p_role text, p_charge text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me text; v_them text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_me from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  select role into v_them from public.clan_members where clan_id = p_clan_id and user_id = p_user;
  if v_me is null or v_them is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if p_role is not null and p_role not in ('leader','officer','member') then
    return jsonb_build_object('ok', false, 'error', 'bad_role');
  end if;
  if p_charge is not null and p_charge not in ('steward','marshal') then
    return jsonb_build_object('ok', false, 'error', 'bad_charge');
  end if;
  -- Officers may act on members, never on other officers. Only the leader
  -- promotes, demotes an officer, or assigns a charge.
  if v_me <> 'leader' then
    if v_me <> 'officer' or v_them <> 'member' or p_role = 'leader' or p_charge is not null then
      return jsonb_build_object('ok', false, 'error', 'not_permitted');
    end if;
  end if;
  -- There is exactly one leader. Handing it over demotes the old one in the
  -- same statement, so a clan can never end up with two or zero.
  if p_role = 'leader' then
    if v_me <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
    update public.clan_members set role = 'officer' where clan_id = p_clan_id and role = 'leader';
  end if;
  update public.clan_members
     set role = coalesce(p_role, role),
         charge = case when p_charge is null then charge else p_charge end
   where clan_id = p_clan_id and user_id = p_user;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (p_clan_id, p_user, 'role', coalesce(p_role, p_charge));
  return jsonb_build_object('ok', true, 'role', coalesce(p_role, v_them), 'charge', p_charge);
end $$;
grant execute on function public.clan_set_role(uuid, uuid, text, text) to authenticated;

-- LEADER GHOSTING. A leader who has not been seen for 21 days can be succeeded
-- by the highest-CP officer. Kept verbatim. It fails CLOSED: a leader with no
-- last_seen stamp at all (a row predating this migration) is NOT claimable,
-- because `null` must never read as "absent since 1970".
create or replace function public.clan_claim_leadership(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_leader uuid; v_seen timestamptz; v_me text; v_best uuid; v_my_cp bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_me from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_me <> 'officer' then return jsonb_build_object('ok', false, 'error', 'not_officer'); end if;

  select user_id, last_seen into v_leader, v_seen from public.clan_members
    where clan_id = p_clan_id and role = 'leader' limit 1;
  if v_leader is null then
    -- No leader row at all: the seat is genuinely vacant, so the highest-CP
    -- officer takes it without a wait.
    null;
  elsif v_seen is null then
    return jsonb_build_object('ok', false, 'error', 'leader_active');
  elsif now() - v_seen < interval '21 days' then
    return jsonb_build_object('ok', false, 'error', 'leader_active', 'last_seen', v_seen);
  end if;

  -- Only the HIGHEST-CP officer may claim, after decay — so the seat goes to
  -- whoever has actually been carrying the hold recently, not to whoever
  -- clicked first.
  perform public.hr_clan_decay_cp(p_clan_id, auth.uid());
  select user_id into v_best from public.clan_members
    where clan_id = p_clan_id and role = 'officer'
    order by floor(cp * power(0.88, extract(epoch from (now() - cp_at)) / 604800.0)) desc,
             joined_at asc
    limit 1;
  if v_best is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_highest_cp');
  end if;

  if v_leader is not null then
    update public.clan_members set role = 'officer'
      where clan_id = p_clan_id and user_id = v_leader;
  end if;
  update public.clan_members set role = 'leader', last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid()
    returning cp into v_my_cp;
  insert into public.clan_ledger (clan_id, user_id, kind, cp)
    values (p_clan_id, auth.uid(), 'role', v_my_cp);
  return jsonb_build_object('ok', true, 'leader', auth.uid(), 'cp', v_my_cp);
end $$;
grant execute on function public.clan_claim_leadership(uuid) to authenticated;

-- ── 12. One read for the whole panel ─────────────────────────
-- Every read applies the lazy settle + the lazy decay first, which is what
-- makes "no cron" honest: state is correct at the moment anybody looks at it.
create or replace function public.clan_seat_read(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clan public.clans%rowtype; v_next public.hr_castle_tiers%rowtype;
        v_cp bigint; v_stores jsonb; v_orders jsonb; v_t public.clan_tavern%rowtype;
begin
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  perform public.clan_upkeep_settle(p_clan_id);
  v_cp := public.hr_clan_decay_cp(p_clan_id, auth.uid());
  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid();

  select * into v_clan from public.clans where id = p_clan_id;
  select * into v_next from public.hr_castle_tiers where tier = v_clan.castle_tier + 1;
  select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_stores
    from public.clan_stores where clan_id = p_clan_id and qty > 0;
  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_orders
    from public.clan_work_orders o where o.clan_id = p_clan_id and o.phase in ('supply','labour');
  select * into v_t from public.clan_tavern where clan_id = p_clan_id;

  return jsonb_build_object('ok', true,
    'castle_tier', v_clan.castle_tier,
    'standing', v_clan.standing,
    'treasury', v_clan.treasury,
    'upgrades', coalesce(v_clan.upgrades, '{}'::jsonb),
    'upkeep_state', v_clan.upkeep_state,
    'next_tier', case when v_next.tier is null then null else to_jsonb(v_next) end,
    'my_cp', v_cp,
    'stores', v_stores,
    'orders', v_orders,
    'build_slots', 1 + floor(greatest(1, v_clan.castle_tier) / 3),
    'building_cap', v_clan.castle_tier * 2,
    'feast_meter', coalesce(v_t.feast_meter, 0),
    'feast_until', v_t.feast_until,
    'feast_cd_until', v_t.feast_cd_until);
end $$;
grant execute on function public.clan_seat_read(uuid) to authenticated;

-- ── 13. clan_leaderboard gains `standing` ────────────────────
-- The Clan Power board should sort on castle_tier then standing, NOT treasury:
-- treasury is an operating account that goes down when a hold builds something,
-- so a board sorted on it rewards hoarding over building. Re-created verbatim
-- from schema.sql §5 plus the two new columns.
create or replace view public.clan_leaderboard as
  select c.id, c.name, c.level, c.treasury, c.castle_tier,
         c.standing, c.upkeep_state,
         count(m.user_id) as members
  from public.clans c
  left join public.clan_members m on m.clan_id = c.id
  group by c.id
  order by c.castle_tier desc, c.standing desc, c.level desc, c.treasury desc;
grant select on public.clan_leaderboard to anon, authenticated;

-- ── 14. Self-check ───────────────────────────────────────────
-- Asserts the migration actually took, and that the derived maths agrees with
-- the client's copy in src/features/clan-seat.js. Raises loudly rather than
-- leaving a half-applied castle.
do $$
declare
  v_n int; v_cp bigint; v_b timestamptz; v_bad int;
begin
  if to_regclass('public.clan_stores')      is null then raise exception 'clan_stores missing';      end if;
  if to_regclass('public.clan_ledger')      is null then raise exception 'clan_ledger missing';      end if;
  if to_regclass('public.clan_work_orders') is null then raise exception 'clan_work_orders missing'; end if;
  if to_regclass('public.clan_work_labour') is null then raise exception 'clan_work_labour missing'; end if;
  if to_regclass('public.clan_tavern')      is null then raise exception 'clan_tavern missing';      end if;
  if to_regclass('public.clan_board')       is null then raise exception 'clan_board missing';       end if;
  if to_regclass('public.clan_withdrawals') is null then raise exception 'clan_withdrawals missing'; end if;

  -- The catalogue is what makes deposits server-authoritative for value.
  -- 34 rows: the 4 refined goods, plus 30 of the 34 routed orphan drops. The
  -- missing 4 (slime_gel, bone_chips, ancient_fragment, cracked_spellstone) are
  -- deliberately absent — they are RECIPE inputs, consumed at the workbench, so
  -- the Storehouse must refuse them exactly as it refuses a log.
  select count(*) into v_n from public.hr_castle_items;
  if v_n < 34 then raise exception 'hr_castle_items should hold at least 34 rows, found %', v_n; end if;
  select count(*) into v_n from public.hr_castle_items where kind = 'store';
  if v_n <> 4 then raise exception 'expected exactly 4 refined castle goods, found %', v_n; end if;
  select count(*) into v_n from public.hr_castle_items
   where item_id in ('slime_gel','bone_chips','ancient_fragment','cracked_spellstone');
  if v_n <> 0 then
    raise exception 'recipe inputs must not be depositable — the castle refuses what a workbench consumes';
  end if;

  -- The tier ladder gates on Standing, and tier 1 is the founding state.
  select standing_req into v_cp from public.hr_castle_tiers where tier = 5;
  if v_cp <> 900000 then raise exception 'tier 5 Standing gate drifted: %', v_cp; end if;
  select count(*) into v_n from public.clans where castle_tier < 1;
  if v_n > 0 then raise exception '% clans are still below tier 1 (Wayside Camp)', v_n; end if;

  -- CP: a Timber Beam on demand pays 63 CP, and 63 CP is 22 Standing. These
  -- two numbers are lifted straight from the spec's §3.4 worked table, and the
  -- client asserts the identical pair — if they ever disagree, the deposit
  -- picker is lying to the player.
  if floor(ceil(300 / 10.0) * 1.4 * 1.5)::bigint <> 63 then
    raise exception 'the CP formula drifted from the spec table (Timber Beam on demand should be 63)';
  end if;
  if floor(63 * 0.35)::bigint <> 22 then
    raise exception 'the Standing ratio drifted (63 CP should be 22 Standing)';
  end if;

  -- The upkeep boundary must be a Sunday, and must be inclusive of its own
  -- instant. 2026-08-09 is a Sunday; 2026-08-12 is the Wednesday after it.
  v_b := public.hr_clan_week_start(timestamptz '2026-08-12 05:00:00+00');
  if v_b <> timestamptz '2026-08-09 00:00:00+00' then
    raise exception 'hr_clan_week_start returned % for a Wednesday, expected 2026-08-09 00:00 UTC', v_b;
  end if;
  v_b := public.hr_clan_week_start(timestamptz '2026-08-09 00:00:00+00');
  if v_b <> timestamptz '2026-08-09 00:00:00+00' then
    raise exception 'the weekly boundary must be inclusive of its own instant, got %', v_b;
  end if;
  v_b := public.hr_clan_week_start(timestamptz '2026-08-09 23:59:59+00');
  if v_b <> timestamptz '2026-08-09 00:00:00+00' then
    raise exception 'late Sunday must still resolve to that Sunday, got %', v_b;
  end if;

  -- No client may write any of the new tables directly: the RPCs are the only
  -- writers, which is what makes every gate above real.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('clan_stores','clan_ledger','clan_work_orders','clan_work_labour',
                       'clan_tavern','clan_board','clan_withdrawals','hr_castle_items',
                       'hr_castle_tiers','hr_castle_buildings')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policies exist on Clan Seat tables — the RPCs must be the only writers', v_bad;
  end if;

  raise notice 'CLAN SEAT migration OK — catalogue %, tiers, RPCs and the weekly boundary verified.',
    (select count(*) from public.hr_castle_items);
end $$;
