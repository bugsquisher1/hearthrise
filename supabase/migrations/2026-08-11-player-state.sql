-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — SERVER-AUTHORITATIVE PLAYER STATE  (foundation, file 1 of 3)
-- Companion design doc: docs/design/server-authority.md
--
-- ⚠ REVIEW ONLY — DO NOT APPLY YET. Apply on a Supabase BRANCH first.
--
-- WHAT THIS IS
--   The real tables that replace `game_saves.snapshot`. Today every number a
--   player owns — gold, inventory, all fifteen skill XP totals, equipment,
--   farm plots — lives inside one client-authored jsonb blob that the browser
--   PATCHes. That is the whole exploit: `G.gold = 1e12` → autosave → the
--   market is yours. There is no clever policy that fixes a blob the client
--   writes. The blob has to stop being the source of truth.
--
--   After this file, the server owns the numbers and the client owns nothing.
--
-- GREENFIELD — THE BETA IS WIPED AT CUTOVER (CLAUDE.md, "Server authority",
--   locked 2026-08-10). So there is deliberately NO migration from
--   game_saves.snapshot, no amnesty, no dual-write, no reconciliation. That
--   removes the single hardest constraint in the program and is why these
--   tables are shaped for correctness rather than for compatibility.
--   `game_saves` is NOT dropped here — it is left inert so the old client keeps
--   working until cutover; §9 of the design doc retires it.
--
-- SAFE TO RE-RUN. Additive only. Nothing existing is dropped or altered.
--   ⚠ NEVER re-run supabase/schema.sql against production — its §1b
--     `drop table … cascade`s market/clan/raid data. These migrations are
--     standalone and must stay that way.
--
-- THE FIVE RULES EVERY TABLE HERE OBEYS (the clan-seat pattern, generalised
-- from supabase/migrations/2026-08-08-clan-seat.sql `clan_deposit` at :527):
--   1. SELECT-own only. There is NO insert/update/delete policy on any player
--      table. SECURITY DEFINER RPCs are the only writers. A policy-less table
--      is the enforcement; application logic drifts, a missing policy cannot.
--   2. The server clock is the only clock — now(), never a client timestamp.
--   3. Every value that can be spent is bounded by a CHECK, not by code.
--   4. Every mutation writes an append-only row to player_ledger.
--   5. Concurrency is decided by one optimistic `version` on player_state,
--      not by hope. See 2026-08-11-apply-engine.sql.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing — run supabase/schema.sql on a FRESH project first';
  end if;
end $$;

-- ── 1. The character row ─────────────────────────────────────────────────
-- One row per character. `slot` keeps the existing multi-character model
-- (src/multi-character.js) — the client already keys everything on
-- (user_id, slot) and the market rows already carry seller_slot.
--
-- Deliberately NARROW. Anything that is a COLLECTION (skills, items,
-- equipment, plots, quests) is its own table, because a jsonb bag on this row
-- is how we got here: a blob has no constraints, no per-key policy and no
-- index, and it invites the client to send the whole thing back.
create table if not exists public.player_state (
  user_id      uuid    not null references auth.users(id) on delete cascade,
  slot         int     not null default 0 check (slot between 0 and 5),

  -- Currencies. bigint because gold is a lifetime accumulator; CHECKed >= 0 so
  -- no code path can ever leave a negative balance behind, whatever it thinks
  -- it is doing.
  gold         bigint  not null default 0     check (gold  >= 0),
  gems         bigint  not null default 0     check (gems  >= 0),
  -- The IAP bond. Its own column, never touched by any PvE code path, so
  -- "no PvE minting of the Hearth Token" (Final Directive) is auditable by
  -- grep rather than by reading every reward function.
  hearth_tokens bigint not null default 0     check (hearth_tokens >= 0),

  -- Vitals. Combat is resolved server-side, so HP is server state.
  hp           int     not null default 10    check (hp >= 0),
  max_hp       int     not null default 10    check (max_hp > 0),

  -- THE ACTIVITY POINTER — the whole idle game in four columns.
  -- `active_kind`  what loop is running
  -- `active_id`    which node/recipe/monster (validated against the catalogue)
  -- `active_since` SERVER timestamp the loop started
  -- `accrued_to`   SERVER timestamp accrual has already been PAID up to.
  --                Elapsed is ALWAYS now() - accrued_to, never a client delta,
  --                and `collect` advances it in the same transaction that pays
  --                — which is what makes double-collect impossible.
  active_kind  text    not null default 'idle'
               check (active_kind in ('idle','gather','artisan','combat')),
  active_id    text,
  active_since timestamptz,
  accrued_to   timestamptz not null default now(),

  bank_cap     int     not null default 100  check (bank_cap between 1 and 100000),

  -- Optimistic concurrency. Every write bumps it; every write is asked to
  -- name the version it read. See hr_apply() in the apply-engine migration.
  version      bigint  not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),

  -- An activity without a target (or a target without an activity) is a state
  -- the accrual engine cannot interpret. Refuse it at the schema.
  constraint player_state_activity_chk
    check ((active_kind = 'idle') = (active_id is null))
);

-- ── 2. Skills ────────────────────────────────────────────────────────────
-- XP only. LEVEL IS NEVER STORED — it is derived from XP by one function
-- (§6), because two representations of the same fact drift, and the one that
-- drifted last time is exactly the one the leaderboard read.
create table if not exists public.player_skills (
  user_id  uuid   not null,
  slot     int    not null,
  skill_id text   not null,
  xp       bigint not null default 0 check (xp >= 0),
  primary key (user_id, slot, skill_id),
  foreign key (user_id, slot) references public.player_state(user_id, slot) on delete cascade
);

-- ── 3. Inventory + equipment ─────────────────────────────────────────────
-- Per-item ROWS, not a jsonb bag. Same reasoning as clan_stores
-- (2026-08-08-clan-seat.sql :261): no hot-row contention, a natural per-item
-- constraint, and the bank cap becomes `count(*)` instead of a client honour
-- system.
create table if not exists public.player_inventory (
  user_id uuid   not null,
  slot    int    not null,
  item_id text   not null,
  qty     bigint not null check (qty > 0),   -- a zero row is deleted, never stored
  primary key (user_id, slot, item_id),
  foreign key (user_id, slot) references public.player_state(user_id, slot) on delete cascade
);
create index if not exists player_inventory_item_idx
  on public.player_inventory (item_id);

-- Equipment is a fixed set of named slots, so it is a row per occupied slot
-- with the slot name as key. `equip_slot` is validated against the catalogue
-- (hr_equip_slots), which is generated from src/data/gathering.js EQUIP_SLOTS
-- — so adding a slot is a data edit plus a regenerate, never a DDL change.
create table if not exists public.player_equipment (
  user_id    uuid not null,
  slot       int  not null,
  equip_slot text not null,
  item_id    text not null,
  primary key (user_id, slot, equip_slot),
  foreign key (user_id, slot) references public.player_state(user_id, slot) on delete cascade
);

-- ── 4. Farm ──────────────────────────────────────────────────────────────
-- Farming is the one system whose progress is WALL-CLOCK rather than
-- action-count: a crop grows whether or not the player is doing anything.
-- That makes it the easiest system to make server-authoritative and the one
-- most obviously broken today (the client owns `plantedAt`).
--
-- No `ready` boolean and no `growth` number is stored. Readiness is DERIVED:
--   ready  ⇔  now() >= planted_at + growth_interval(crop, watered)
-- A stored flag would need a cron to flip it, and a cron is a second clock.
create table if not exists public.player_farm (
  user_id    uuid not null,
  slot       int  not null,
  plot_idx   int  not null check (plot_idx between 0 and 63),
  crop_id    text,
  planted_at timestamptz,
  watered_at timestamptz,
  primary key (user_id, slot, plot_idx),
  foreign key (user_id, slot) references public.player_state(user_id, slot) on delete cascade,
  -- An empty plot has no crop and no clock. A planted one has both.
  constraint player_farm_planted_chk
    check ((crop_id is null) = (planted_at is null))
);

-- ── 5. Quests / dailies / counters ───────────────────────────────────────
-- One generic progress table rather than a table per system. The kinds are a
-- CHECK so a typo is a constraint violation, not a silently separate universe
-- of rows that never satisfies its goal.
create table if not exists public.player_progress (
  user_id    uuid   not null,
  slot       int    not null,
  kind       text   not null check (kind in ('quest','daily','bounty','stat','collection','flag')),
  key        text   not null,
  value      bigint not null default 0,
  period_key text   not null default '',      -- '' = permanent; else hr_utc_day_key()/hr_utc_week_key()
  state      text,                             -- 'active' | 'done' | 'claimed' | null
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, kind, key, period_key),
  foreign key (user_id, slot) references public.player_state(user_id, slot) on delete cascade
);

-- ── 6. THE JOURNAL ───────────────────────────────────────────────────────
-- Every mutation of every table above writes here, in the same transaction.
-- This is rule 5 of the server-authority section of CLAUDE.md ("every
-- shared-surface write is journalled so abuse is detectable and reversible")
-- extended to ALL writes, not just shared ones — because with the server
-- owning progression, the journal is also the only way to answer "why does
-- this player have this" without a simulation replay.
--
-- Append-only by construction: no update/delete policy, plus the immutability
-- trigger below. Partitioning is deliberately NOT set up yet — see the design
-- doc §11 for the retention plan; a monthly partition on `at` is a one-file
-- change when volume warrants it, and doing it early would be guessing.
create table if not exists public.player_ledger (
  id       bigserial primary key,
  user_id  uuid not null,
  slot     int  not null,
  -- What kind of event. Kept coarse on purpose: the fine detail is in `meta`,
  -- and a CHECK list that must be edited for every new feature is a CHECK list
  -- that will be widened to `text` in six months anyway.
  kind     text not null check (kind in
             ('accrue','craft','gather','combat','farm','trade','shop',
              'quest','equip','admin','iap','clan','raid')),
  intent   text,                  -- the intent name that caused it
  item_id  text,
  qty      bigint,
  gold     bigint,
  skill_id text,
  xp       bigint,
  meta     jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
create index if not exists player_ledger_user_idx on public.player_ledger (user_id, slot, at desc);
create index if not exists player_ledger_kind_idx on public.player_ledger (kind, at desc);

create or replace function public.hr_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'player_ledger is append-only (attempted % )', tg_op
    using errcode = 'check_violation';
end $$;
drop trigger if exists hr_ledger_immutable on public.player_ledger;
create trigger hr_ledger_immutable
  before update or delete on public.player_ledger
  for each row execute function public.hr_ledger_immutable();

-- ── 7. RLS: read your own, write nothing ─────────────────────────────────
-- The whole security model is these fourteen lines. Every table gets a
-- SELECT-own policy and NOTHING else, so PostgREST will happily serve a read
-- and refuse every write with a 42501, no matter what the client sends.
--
-- player_ledger gets SELECT-own too so the in-game Chronicle can render an
-- honest history without a privileged endpoint.
do $$
declare t text;
begin
  foreach t in array array['player_state','player_skills','player_inventory',
                           'player_equipment','player_farm','player_progress',
                           'player_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' own read', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || ' own read', t);
    -- Belt and braces: revoke the write grants PostgREST would otherwise
    -- expose. A future accidental `for all` policy still cannot write without
    -- the table privilege.
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ── 8. Derived values, defined ONCE, server-side ─────────────────────────
-- These MUST agree with the client. The client's copies are in src/legacy.js
-- (levelFromXp at :39, xpForLevel at :50) and the XP table itself is
-- XP_TABLE there. The design doc's rule: the client keeps its copy for
-- RENDERING ONLY; this one is the authority, and a guard test compares them.
-- The curve is MATERIALISED into a 99-row table rather than recomputed. Two
-- reasons: hr_load derives a level for all 15 skills on every read, and a
-- recursive sum per skill per read is 1,485 pointless summations; and a table
-- can be indexed, which turns "what level is this xp" into a single index scan.
-- The table is DERIVED from the formula in the same statement that creates it,
-- so there is still exactly one authoring site — nobody types 99 numbers.
create table if not exists public.hr_xp_table (
  level int primary key check (level between 1 and 99),
  xp    bigint not null
);
insert into public.hr_xp_table (level, xp)
  select lv,
         coalesce((select floor(sum(floor(i + 300 * power(2, i / 7.0))) / 4)::bigint
                     from generate_series(1, lv - 1) i), 0)
    from generate_series(1, 99) lv
on conflict (level) do update set xp = excluded.xp;
create index if not exists hr_xp_table_xp_idx on public.hr_xp_table (xp);
alter table public.hr_xp_table enable row level security;
drop policy if exists "xp table readable" on public.hr_xp_table;
create policy "xp table readable" on public.hr_xp_table for select using (true);
revoke insert, update, delete on public.hr_xp_table from authenticated, anon;

create or replace function public.hr_xp_for_level(p_level int)
returns bigint language sql stable as $$
  select coalesce((select xp from public.hr_xp_table
                    where level = greatest(1, least(99, coalesce(p_level, 1)))), 0)
$$;

create or replace function public.hr_level_from_xp(p_xp bigint)
returns int language sql stable as $$
  select coalesce((select max(level) from public.hr_xp_table
                    where xp <= greatest(0, coalesce(p_xp, 0))), 1)
$$;

-- Total level and combat level, derived. The leaderboard reads THESE, so a
-- forged client number can no longer appear on a ranking — which was the
-- documented limitation in CLAUDE.md save-invariant #6 and is now closed.
create or replace function public.hr_total_level(p_user uuid, p_slot int)
returns int language sql stable as $$
  select coalesce(sum(public.hr_level_from_xp(xp)), 0)::int
    from public.player_skills where user_id = p_user and slot = p_slot
$$;

-- ── 9. Bootstrap: a character is created by the SERVER ───────────────────
-- The client cannot INSERT a player_state row (no policy), so character
-- creation is an RPC. Starting kit is server-side data, not a client payload.
create or replace function public.hr_create_character(p_slot int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sk  text;
  c_start_skills constant text[] := array[
    'attack','strength','defense','hitpoints','prayer','magic','ranged',
    'woodcutting','mining','fishing','farming','cooking','crafting','smithing',
    'bountyHunter'];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  if exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end if;

  insert into public.player_state (user_id, slot, hp, max_hp)
    values (v_uid, p_slot, 10, 10);

  -- Hitpoints starts at level 10 like every OSRS-lineage game; everything else
  -- at 1. The number comes from the server catalogue, not from the client.
  foreach v_sk in array c_start_skills loop
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, p_slot, v_sk,
              case when v_sk = 'hitpoints' then public.hr_xp_for_level(10) else 0 end);
  end loop;

  -- Four starting plots, empty.
  insert into public.player_farm (user_id, slot, plot_idx)
    select v_uid, p_slot, g from generate_series(0, 3) g;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_uid, p_slot, 'admin', 'create_character',
            jsonb_build_object('slot', p_slot));

  return jsonb_build_object('ok', true, 'slot', p_slot);
end $$;
grant execute on function public.hr_create_character(int) to authenticated;

-- ── 10. Self-verification ────────────────────────────────────────────────
do $$
declare v_bad int; v_xp bigint;
begin
  if to_regclass('public.player_state')     is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_skills')    is null then raise exception 'player_skills missing'; end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing'; end if;
  if (select count(*) from public.hr_xp_table) <> 99 then
    raise exception 'hr_xp_table should hold 99 rows, found %', (select count(*) from public.hr_xp_table);
  end if;

  -- THE load-bearing assertion of this whole file: no client write policy may
  -- exist on any player table. If one is ever added, this migration fails on
  -- its next run and the reviewer finds out immediately.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('player_state','player_skills','player_inventory',
                       'player_equipment','player_farm','player_progress','player_ledger')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policies on player tables — the RPCs must be the only writers', v_bad;
  end if;

  -- The XP curve must match the client's XP_TABLE (src/legacy.js :39). These
  -- three anchors are lifted from that table; if the server curve is ever
  -- re-derived differently, every level in the game silently shifts.
  v_xp := public.hr_xp_for_level(2);  if v_xp <> 83     then raise exception 'xp L2 drifted: %',  v_xp; end if;
  v_xp := public.hr_xp_for_level(10); if v_xp <> 1154   then raise exception 'xp L10 drifted: %', v_xp; end if;
  v_xp := public.hr_xp_for_level(99); if v_xp <> 13034431 then raise exception 'xp L99 drifted: %', v_xp; end if;
  if public.hr_level_from_xp(82)   <> 1  then raise exception 'level_from_xp(82) should be 1';  end if;
  if public.hr_level_from_xp(83)   <> 2  then raise exception 'level_from_xp(83) should be 2';  end if;
  if public.hr_level_from_xp(1e12::bigint) <> 99 then raise exception 'level must cap at 99';   end if;

  raise notice 'PLAYER STATE foundation OK — tables, RLS posture and the XP curve verified.';
end $$;
