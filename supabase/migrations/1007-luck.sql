-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1007-luck.sql — LUCK AND MAGIC FIND, SERVER SIDE, DARK BEHIND ONE SWITCH (lane/d-luck-build, systems-engineer,
--   2026-11-20; Tyler 2026-11-20 "Yes, designer's numbers" to docs/design/itemization-plan.md §15, Luck v3.1).
--
-- STATUS: supabase/migration-notes/1007-luck.sql.json (STAGED until the Coordinator applies it).
-- ORDER: after 1003-luck-items-catalogue (hr_items: lucky_rivet, the Lucky rows), 1004-luck-hunt-sessions-catalogue (their vendor values), 1005-luck-jewelry-catalogue and 1006-luck-catalogue
--   (hr_luck_rules, hr_luck_salvage, hr_luck_stages, hr_luck_ring_pct, hr_lucky_offers). Applied as ONE transaction by the apply tool;
--   never begin/commit here. Ends with its §4 self-check. EDGE: hr-accrue reads `magic_find` (hunt-settle.js memberInput); a bundle
--   without it rolls at 0, today's game, so the deploy may follow this apply.
-- ON THE EA SECURITY LIST: Luck is a ranked, account-wide surface; the allowance (found minus salvaged) is the main target. Pre-EA it applies
--   on its passing §4 (CLAUDE.md §2).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   THE SWITCH `luck` (hr_feature_switches, inserted OFF; a missing row is off). Every door below asks hr_luck_on first: off, Magic Find is
--     0 for every hero (the settle rolls today's game, draw for draw), no plan takes Salvage or Use, Dispatch leaves such stacks in the bag,
--     the Lucky job refuses `luck_off`, the section is absent, nothing is counted.
--   account_luck  (user) -> luck = from_kills + from_salvage. RAISE-ONLY (trigger). One bar per account: a deleted hero never lowers it.
--   account_found (user, item) -> found, salvaged (salvaged <= found). RAISE-ONLY. `found` is written ONLY by the fold of a hunt that ended
--     (hr_luck_fold): the pieces hr_luck_salvage names that the hunt's loot tally holds; `salvaged` only by Dispatch.
--   account_kills (user, monster) -> kills. RAISE-ONLY. Written ONLY by the same fold, ONE count a kill for the account whoever of its heroes
--     was there (in each settle window, the highest of its sessions' counts in one instance, never their sum).
--   hr_luck_fold(user, slot, session)      ONCE A HUNT, when the settle that ENDS it runs: the session's kills by monster (its combat rows'
--     `km`, journalled one row a settle anyway) and its found pieces (hunt_session_tally.loot, the settle's own write) into the account; a
--     stage crossed pays its lump. Nothing of Luck is written while a hunt runs (server-cost allowance, balance-program/01-model.md §7).
--   hr_magic_find_of(user, slot) -> int    the account's rank (hr_luck_rank) + the largest Lucky percent the hero wears; 0 while off.
--   hr_hunt_instance_read                  RESTATED: each member carries `magic_find`, the engine's only source of it.
--   hr_tally_count                         RESTATED: + hr_luck_fold for a session this settle ended (its one call, whatever the window's meta).
--   hr_loot_plan_refusal / hr_loot_rule_set RESTATED: two more plans. `salvage` (an item hr_luck_salvage names) and `use` (the rivet only),
--     each refused `luck_off` while the switch is off for the account.
--   hr_loot_dispatch                       RESTATED: + the SALVAGE arm (each planned stack, at most found - salvaged pieces of it, pays
--     hr_luck_salvage's rivets; the rest stays in the bag, counted no_rivets: salvage pays no stock yet, so nothing is broken for nothing)
--     and the USE arm (the rivet's whole bag stack, after the salvage, onto the account's bar: one rivet is one Luck).
--   hr_lucky_ring(slot, from, price, idem) NEW CLIENT RPC: the Lucky job. A plain ring + its tier's rivets + its tier's Hallmark fee -> the
--     Fine Lucky ring; nothing rolls or fails. The piece and the rivets come from the bag then Storage (hr_materials_take).
--   hr_luck_section(user, slot)            the `luck` section: null while off; else the bar, Magic Find, the rivets held, the salvage line of
--     each bag stack the catalogue names, and the Lucky job's offers for the plain rings this hero holds.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   No client value reaches an amount: Salvage pays min(bag qty, found - salvaged) x the catalogue's rivets, found is folded by the settle
--   alone from the hunt's own loot tally (inside its item bound), the bar rises by the rivets a press removes from the bag, a stage pays the catalogue's lump on the server's
--   count. The rivet is bound and worth 0 (hr_items: tradeable false, no vendor value), so no market, mail, trade or shop path takes it.
--   THE INVARIANT: rivets an account ever held <= Σ over items of found x rivets. Gold and Crowns can change WHICH copy is salvaged, never
--   the total. A Lucky ring salvages for nothing (no drop row names it). Ledger: one 'craft' row per salvage press, one 'admin' row per
--   use press (hr_apply's journal kinds), one 'collection' row per hunt folded (luck_fold) and per stage crossed, one 'shop' row per Lucky job.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   NO NEW STATEMENT ON THE SETTLE PATH (every read and write below runs inside a settle function that already runs), and NO ROW WRITE WHILE
--   A HUNT RUNS. Off: one PK read of hr_feature_switches per member per settle (magic_find) and one PK read of hunt_sessions (did this
--   settle end it). On: + one PK read of account_luck and one equipment scan (<= 14 rows) per member a settle. ONCE A HUNT (the fold): one
--   aggregate over the session's own ledger rows (indexed by session), one 'luck_fold' ledger row, one upsert per creature and per salvage
--   piece the hunt dropped, one bar update per stage crossed. Dispatch: one PK row per salvaged stack.
--
-- REVERSIBILITY: restate the five functions from their §0 pins' files, drop the constraint's two values (set those plans to keep), drop
--   hr_lucky_ring (+ baseline row), hr_luck_section (+ section row), the helpers, the three tables and the switch row.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.hr_luck_rules') is null or not exists (select 1 from public.hr_luck_rules where id)
     or to_regclass('public.hr_luck_salvage') is null or to_regclass('public.hr_luck_stages') is null
     or to_regclass('public.hr_luck_ring_pct') is null or to_regclass('public.hr_lucky_offers') is null then
    raise exception 'PRECONDITION: apply 1006-luck-catalogue.generated.sql first'; end if;
  if not exists (select 1 from public.hr_items i join public.hr_luck_rules lr on lr.item_id = i.item_id where not i.tradeable)
     or exists (select 1 from public.hr_hunt_vendor_value v join public.hr_luck_rules lr on lr.item_id = v.item_id where v.unit > 0) then
    raise exception 'PRECONDITION: the luck item is not a bound, unpriced catalogue item (apply 1003-luck-items-catalogue.generated.sql first)'; end if;
  if to_regclass('public.hr_feature_switches') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.hr_hunt_roster') is null or to_regclass('public.player_equipment') is null then
    raise exception 'PRECONDITION: the feature switches, the section registry, the roster and the equipment table first'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_sink_lock(uuid)') is null
     or to_regprocedure('public.hr_sink_bought_today(uuid,text,text[])') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: a seam this file calls is missing'; end if;
  -- Each restated body is its image on this file's base (measured on the replay) or this file's own. Anything else: another file moved it.
  for r in select * from (values
    ('public.hr_loot_plan_refusal(text,text)', '930f6b477af5ac054b2e6bd3f59482c0', '2027-01-23-loot-dispatch.sql'),
    ('public.hr_loot_rule_set(integer,text,text,uuid)', 'cfa8fc9bce2ea4c1e626eb8b4cf5adc6', '2027-01-23-loot-dispatch.sql'),
    ('public.hr_loot_dispatch(integer,uuid)', 'c561bed6c279d809036366db6005183d', 'the replay of this file''s base'),
    ('public.hr_hunt_instance_read(uuid,integer)', 'cfb26bd60ee7eb29965041ca9354cb25', '2027-04-24-tower-climb.sql'),
    ('public.hr_tally_count(uuid,integer,uuid,jsonb)', 'f963df5e9390714276a06e830648171a', '2026-12-23-tally-tasks.sql')
  ) p(sig, pre, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and position('LUCK (1007-luck.sql)' in (select prosrc from pg_proc where oid = to_regprocedure(r.sig))) = 0 then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s - md5 %: another file moved it; re-pin', r.sig, r.src, left(r.pre, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
-- One raise-only rule for all three: each named column may only rise (a key never moves: the primary keys are the rows' identity).
create or replace function public.hr_luck_raise_only()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql): Luck, found, salvaged and kills only go up; a hero deleted, a plan changed or a bug never lowers them.
declare c text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach c in array tg_argv loop
    if (n->>c)::numeric < (o->>c)::numeric then
      raise exception '%: % may only rise (% -> %)', tg_table_name, c, o->>c, n->>c using errcode = 'HRL01'; end if;
  end loop;
  return new;
end $fn$;
revoke all on function public.hr_luck_raise_only() from public, anon, authenticated, service_role;

create table if not exists public.account_luck (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  luck         bigint      not null default 0 check (luck >= 0),
  from_kills   bigint      not null default 0 check (from_kills >= 0),
  from_salvage bigint      not null default 0 check (from_salvage >= 0),
  updated_at   timestamptz not null default now(),
  constraint account_luck_sum check (luck = from_kills + from_salvage)
);
comment on table public.account_luck is
  '1007-luck.sql: the ACCOUNT''s Luck bar (itemization plan §15): Lucky Rivets used + Bestiary stage Luck. Raise-only (hr_luck_raise_only). Written only by Dispatch''s use arm and the settle''s kill hook (hr_luck_credit).';
create table if not exists public.account_found (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  item_id    text        not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  found      bigint      not null default 0 check (found >= 0),
  salvaged   bigint      not null default 0 check (salvaged >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint account_found_allowance check (salvaged <= found)
);
comment on table public.account_found is
  '1007-luck.sql: the salvage allowance: pieces of each item the account''s OWN hunts paid (found, the settle''s loot hook only) and the pieces Dispatch salvaged for rivets. Raise-only.';
create table if not exists public.account_kills (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  monster_id text        not null check (monster_id ~ '^[a-z0-9_]{1,48}$'),
  kills      bigint      not null default 0 check (kills >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, monster_id)
);
comment on table public.account_kills is
  '1007-luck.sql: the account''s Bestiary counts (Tyler 2026-11-20: per account), one a kill whoever of its heroes was there. The settle''s kill hook only. Raise-only.';
drop trigger if exists account_luck_raise_only on public.account_luck;
create trigger account_luck_raise_only before update on public.account_luck
  for each row execute function public.hr_luck_raise_only('luck', 'from_kills', 'from_salvage');
drop trigger if exists account_found_raise_only on public.account_found;
create trigger account_found_raise_only before update on public.account_found
  for each row execute function public.hr_luck_raise_only('found', 'salvaged');
drop trigger if exists account_kills_raise_only on public.account_kills;
create trigger account_kills_raise_only before update on public.account_kills
  for each row execute function public.hr_luck_raise_only('kills');
do $mig$
declare t text;
begin
  foreach t in array array['account_luck', 'account_found', 'account_kills'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || ' own read', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || ' own read', t);
  end loop;
end $mig$;

-- ── §2 THE SWITCH (off; the Coordinator moves it with a one-line migration: 2027-03-21-feature-switches.sql "HOW A SWITCH MOVES") ─────
insert into public.hr_feature_switches (switch_id, scope, note)
  select r.switch_id, 'off', '1007-luck.sql: Luck and Magic Find (itemization plan §15): Magic Find in the settle, Salvage and Use plans, the Lucky job, the luck section, the account''s counts'
    from public.hr_luck_rules r where r.id
  on conflict (switch_id) do nothing;

-- ── §3 THE READS ─────────────────────────────────────────────────────────────
-- plpgsql, not sql: the settle and the section read these, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_luck_on(p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql): the one door every Luck read and verb asks.
begin
  return p_user is not null and coalesce(public.hr_feature_on((select r.switch_id from public.hr_luck_rules r where r.id), p_user), false);
end $fn$;

create or replace function public.hr_luck_to_rank(p_n int)
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql): the Luck that holds percent n = rank_step x (1^2 + ... + n^2) (src/core/luck.js luckToRank).
declare r public.hr_luck_rules%rowtype; k bigint;
begin
  select * into r from public.hr_luck_rules where id;
  k := least(greatest(coalesce(p_n, 0), 0), r.rank_max);
  return r.rank_step * k * (k + 1) * (2 * k + 1) / 6;
end $fn$;

create or replace function public.hr_luck_rank(p_luck bigint)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql): the whole percent held at p_luck, 0..rank_max (src/core/luck.js rankOf).
declare r public.hr_luck_rules%rowtype; l bigint := greatest(coalesce(p_luck, 0), 0); n int;
begin
  select * into r from public.hr_luck_rules where id;
  n := least(r.rank_max, floor(cbrt(3.0 * l / r.rank_step))::int);
  while n < r.rank_max and public.hr_luck_to_rank(n + 1) <= l loop n := n + 1; end loop;
  while n > 0 and public.hr_luck_to_rank(n) > l loop n := n - 1; end loop;
  return n;
end $fn$;

create or replace function public.hr_magic_find_of(p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql): a hero's Magic Find, whole percent: the account's rank + the largest Lucky percent it wears (counted once). 0 while off.
declare v_ring int;
begin
  if not public.hr_luck_on(p_user) then return 0; end if;
  select coalesce(max(p.pct), 0) into v_ring
    from public.player_equipment e join public.hr_luck_ring_pct p on p.item_id = e.item_id
   where e.user_id = p_user and e.slot = p_slot;
  return public.hr_luck_rank(coalesce((select a.luck from public.account_luck a where a.user_id = p_user), 0)) + v_ring;
end $fn$;

-- THE ONE WRITER of the bar: raise it by kills and/or salvage Luck; answers { before, after }. The caller journals.
create or replace function public.hr_luck_credit(p_user uuid, p_kills bigint, p_salvage bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql)
declare v_before bigint; v_after bigint;
begin
  if p_user is null or coalesce(p_kills, 0) < 0 or coalesce(p_salvage, 0) < 0 then raise exception 'hr_luck_credit: bad credit' using errcode = 'HRL02'; end if;
  insert into public.account_luck as a (user_id, luck, from_kills, from_salvage, updated_at)
    values (p_user, 0, 0, 0, now()) on conflict (user_id) do nothing;
  select a.luck into v_before from public.account_luck a where a.user_id = p_user for update;
  update public.account_luck
     set luck = luck + coalesce(p_kills, 0) + coalesce(p_salvage, 0), from_kills = from_kills + coalesce(p_kills, 0),
         from_salvage = from_salvage + coalesce(p_salvage, 0), updated_at = now()
   where user_id = p_user returning luck into v_after;
  return jsonb_build_object('before', v_before, 'after', v_after);
end $fn$;

do $mig$
declare f text;
begin
  foreach f in array array['public.hr_luck_on(uuid)', 'public.hr_luck_to_rank(integer)', 'public.hr_luck_rank(bigint)',
                           'public.hr_magic_find_of(uuid,integer)', 'public.hr_luck_credit(uuid,bigint,bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', f); end if;
  end loop;
end $mig$;

-- ── §4 THE SETTLE: Magic Find in, found and kills out ────────────────────────
-- hr_hunt_instance_read, RESTATED WHOLE (pin cfb26bd6): one key per member, `magic_find`, the engine's only source of it.
create or replace function public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance carries the session mode the server froze at its start (session_mode),
  -- the engine's only source of it (hunt-settle.js; none, or one it has no row for, and it proposes nothing).
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the instance carries the Burning Tower's floor whose room stands or stands next (tower_floor:
  -- hr_tower_floor_of, the server's own record), the engine's only source of it; null on every other ground.
  -- LUCK (1007-luck.sql): each member carries its Magic Find (hr_magic_find_of: 0 while the `luck` switch is off for its account).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'tier', v_i.tier,
      'session_mode', v_i.session_mode,
      'tower_floor', public.hr_tower_floor_of(v_i.id),
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
                 -- LUCK (1007-luck.sql): this hero's Magic Find, read once for the settle (the party rolls on its highest: src/data/luck.js).
                 'magic_find', public.hr_magic_find_of(h.user_id, h.slot),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0) m0
               -- TARGET-KIND: the member's OWN hunt_density row on this ground, only a kind the catalogue holds there; no row, no key. Any
               -- options.target_kind is dropped first (hr_action_set_options refuses the key; this read does not lean on that alone).
               cross join lateral (select jsonb_set(m0.r0, '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', d.target_kind) from public.hunt_density d
                      join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind
                     where d.user_id = h.user_id and d.slot = h.slot and d.hunt_id = v_i.hunt_id), '{}'::jsonb)) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;


-- THE ACCOUNT'S FOLD, ONCE A HUNT (server-cost allowance, docs/design/balance-program/01-model.md §7: no new statement on the settle path,
-- at most one row write a hero-hour). Nothing of Luck is written while a hunt runs: its windows already journal their kills by monster (the
-- combat row's `km`, one ledger row a settle, held by the settle's kill bound) and its loot (hunt_session_tally.loot, the settle's own one
-- write: picked up less what the pickup filter left behind). When the settle that ENDS a session runs (hr_tally_count), this folds it into
-- the account ONCE (its 'luck_fold' ledger row is the mark, and journals what it added):
--   kills  each window's `km`, less what an already-folded session of the same account in the same instance counted in that window (one
--          settle's rows share its transaction time): one count a kill whoever of its heroes was there, the highest, never the sum, in
--          whatever order the sessions end. Only creatures the reachable roster holds count.
--   found  the pieces hr_luck_salvage names that the hunt's loot tally holds. Bought, traded, crafted and chest pieces are in no hunt's tally.
-- A stage crossed pays hr_luck_stages' lump onto the bar, journalled. Answers the Luck paid.
create or replace function public.hr_luck_fold(p_user uuid, p_slot int, p_session uuid)
returns bigint language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql)
declare
  v_inst uuid; v_r record; v_after bigint; v_luck bigint; v_c jsonb; v_total bigint := 0; v_kills jsonb; v_found jsonb;
begin
  if p_user is null or p_session is null or not public.hr_luck_on(p_user) then return 0; end if;
  select h.instance_id into v_inst from public.hunt_sessions h
   where h.id = p_session and h.user_id = p_user and h.slot = p_slot and h.ended_at is not null;
  if not found then return 0; end if;
  if exists (select 1 from public.player_ledger l where l.session_id = p_session and l.user_id = p_user and l.intent = 'luck_fold') then
    return 0; end if;
  -- THE KILLS: per window and creature, this session's count less the highest an already-folded own session of the instance counted then.
  select coalesce(jsonb_object_agg(k.m, k.n), '{}'::jsonb) into v_kills from (
    select w.m, sum(greatest(0, w.n - coalesce(o.n, 0)))::bigint as n
      from (select l.at, e.key as m, sum((e.value #>> '{}')::bigint) as n
              from public.player_ledger l cross join lateral jsonb_each(l.meta->'km') e
             where l.session_id = p_session and l.user_id = p_user and l.slot = p_slot and jsonb_typeof(l.meta->'km') = 'object'
               and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{1,9}$'
             group by 1, 2) w
      left join (select l.at, e.key as m, max((e.value #>> '{}')::bigint) as n
              from public.hunt_sessions h
              join public.player_ledger l on l.session_id = h.id and l.user_id = h.user_id and l.slot = h.slot
              cross join lateral jsonb_each(l.meta->'km') e
             where h.user_id = p_user and h.instance_id = v_inst and h.id <> p_session
               and exists (select 1 from public.player_ledger f where f.session_id = h.id and f.user_id = p_user and f.intent = 'luck_fold')
               and jsonb_typeof(l.meta->'km') = 'object' and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{1,9}$'
             group by 1, 2) o on o.at = w.at and o.m = w.m
     where w.m ~ '^[a-z0-9_]{1,48}$' and exists (select 1 from public.hr_hunt_roster r where r.monster_id = w.m)
     group by w.m) k
   where k.n > 0;
  for v_r in select e.key as m, (e.value #>> '{}')::bigint as n from jsonb_each(v_kills) e order by e.key loop
    insert into public.account_kills as a (user_id, monster_id, kills, updated_at) values (p_user, v_r.m, v_r.n, now())
      on conflict (user_id, monster_id) do update set kills = a.kills + excluded.kills, updated_at = now()
      returning a.kills into v_after;
    select coalesce(sum(s.luck), 0) into v_luck from public.hr_luck_stages s where s.kills > v_after - v_r.n and s.kills <= v_after;
    if v_luck > 0 then
      v_c := public.hr_luck_credit(p_user, v_luck, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
        values (p_user, p_slot, 'collection', 'luck_stage:' || v_r.m,
                jsonb_build_object('reason', 'luck_stage', 'monster', v_r.m, 'kills', v_after, 'luck', v_luck,
                                   'stages', (select jsonb_agg(s.stage order by s.stage) from public.hr_luck_stages s where s.kills > v_after - v_r.n and s.kills <= v_after),
                                   'before', v_c->'before', 'after', v_c->'after'), p_session);
      v_total := v_total + v_luck;
    end if;
  end loop;
  -- THE FOUND PIECES: what the hunt's own loot tally holds of the salvage catalogue.
  select coalesce(jsonb_object_agg(s.item_id, x.n), '{}'::jsonb) into v_found
    from public.hunt_session_tally t
    cross join lateral jsonb_each(t.loot) e
    join public.hr_luck_salvage s on s.item_id = e.key
    cross join lateral (select floor((e.value #>> '{}')::numeric)::bigint as n) x
   where t.session_id = p_session and t.user_id = p_user and t.slot = p_slot and jsonb_typeof(e.value) = 'number' and x.n > 0;
  insert into public.account_found as f (user_id, item_id, found, updated_at)
    select p_user, e.key, (e.value #>> '{}')::bigint, now() from jsonb_each(v_found) e order by e.key
  on conflict (user_id, item_id) do update set found = f.found + excluded.found, updated_at = now();
  insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
    values (p_user, p_slot, 'collection', 'luck_fold',
            jsonb_build_object('reason', 'luck_fold', 'kills', v_kills, 'found', v_found, 'luck', v_total), p_session);
  return v_total;
end $fn$;
revoke all on function public.hr_luck_fold(uuid, int, uuid) from public, anon, authenticated, service_role;

-- hr_tally_count, RESTATED WHOLE (pin f963df5e): its own work as before, and the fold of a hunt this settle ended.
create or replace function public.hr_tally_count(p_user uuid, p_slot integer, p_session uuid, p_meta jsonb)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_hunt text; v_kills numeric; v_sum numeric := 0; v_k text; v_v jsonb; v_r record; v_add int; v_done int := 0;
begin
  -- TALLY (2026-12-23-tally-tasks.sql)
  -- LUCK (1007-luck.sql): a hunt this settle ENDED folds into the account once (hr_luck_fold: its kills and found pieces from its own
  -- journal and loot tally), whatever this window's meta says; nothing of Luck is written while a hunt runs.
  if exists (select 1 from public.hunt_sessions h where h.id = p_session and h.user_id = p_user and h.slot = p_slot and h.ended_at is not null) then
    perform public.hr_luck_fold(p_user, p_slot, p_session);
  end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or not (p_meta ? 'km') then return 0; end if;
  if jsonb_typeof(p_meta->'km') <> 'object' or jsonb_typeof(p_meta->'kills') is distinct from 'number'
     or (p_meta->>'kills') !~ '^[0-9]{1,9}$' then
    perform public.hr_reject('bad_kills', jsonb_build_object('why', 'shape'));
  end if;
  v_kills := (p_meta->>'kills')::numeric;
  for v_k, v_v in select key, value from jsonb_each(p_meta->'km') loop
    if v_k !~ '^[a-z0-9_]{1,48}$' or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
      perform public.hr_reject('bad_kills', jsonb_build_object('why', 'km', 'monster', left(v_k, 48)));
    end if;
    v_sum := v_sum + (v_v #>> '{}')::numeric;
  end loop;
  if v_sum > v_kills then
    perform public.hr_reject('bad_kills', jsonb_build_object('why', 'sum', 'km', v_sum, 'kills', v_kills));
  end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.id = p_session and h.user_id = p_user and h.slot = p_slot;
  if v_hunt is null or v_sum = 0 then return 0; end if;
  for v_r in select t.place, t.kills, t.target, c.monster_id
               from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
              where t.user_id = p_user and t.slot = p_slot and c.hunt_id = v_hunt and t.done_at is null
              order by t.place for update of t loop
    v_add := least(v_r.target - v_r.kills, coalesce((p_meta->'km'->>v_r.monster_id)::bigint, 0))::int;
    continue when v_add <= 0;
    update public.hero_tally_tasks
       set kills = kills + v_add, done_at = case when kills + v_add >= target then now() end
     where user_id = p_user and slot = p_slot and place = v_r.place;
    if v_r.kills + v_add >= v_r.target then v_done := v_done + 1; end if;
  end loop;
  return v_done;
end $$;
revoke all on function public.hr_tally_count(uuid, integer, uuid, jsonb) from public, anon, authenticated, service_role;

-- ── §5 THE PLANS: `salvage` and `use` ─────────────────────────────────────────
alter table public.player_item_rules drop constraint if exists player_item_rules_loot_rule_ck;
alter table public.player_item_rules add constraint player_item_rules_loot_rule_ck
  check (loot_rule in ('keep', 'deposit', 'sell', 'ignore', 'salvage', 'use'));
comment on column public.player_item_rules.loot_rule is
  '2027-01-23-loot-dispatch.sql + 1007-luck.sql: the item''s loot plan, run by hr_loot_dispatch in town (keep = the default, no row; '
  'deposit = to the account''s Storage; sell = at the vendor''s bid; salvage = for Lucky Rivets, within the account''s found allowance; '
  'use = the Lucky Rivet onto the account''s Luck bar), or the pickup filter (ignore = the settle leaves it behind). Nothing moves at pickup except ignore.';

-- hr_loot_plan_refusal, RESTATED WHOLE (pin 930f6b47): + the two Luck plans' refusals by item (the switch is the setter's and Dispatch's).
create or replace function public.hr_loot_plan_refusal(p_item text, p_plan text)
returns text language sql stable set search_path = public, pg_catalog as $$
  select case
    when p_plan is null or p_plan in ('keep', 'ignore') then null
    -- the hero's starting kit (generated from src/data/start-kit.js) is never SOLD by a plan (no
    -- minting from the kit; the market's listable rule, 2027-01-12, refuses it too); it may be
    -- DEPOSITED, as Storage already takes it one stack at a time (Coordinator 2026-10-25).
    when p_plan = 'sell' and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)
      or exists (select 1 from public.hr_start_equipment k where k.item_id = p_item)) then 'start_kit'
    -- sell only what the vendor prices (the catalogue vendor_sell and the pickup sale priced with).
    when p_plan = 'sell' and not exists (select 1 from public.hr_hunt_vendor_value v where v.item_id = p_item and v.unit > 0)
      then 'item_not_sellable'
    -- LUCK (1007-luck.sql): salvage only what the salvage catalogue names (worn gear a drop row names, never a Very Rare piece, never the
    -- rivet); use only the Lucky Rivet.
    when p_plan = 'salvage' and not exists (select 1 from public.hr_luck_salvage s where s.item_id = p_item) then 'not_salvageable'
    when p_plan = 'use' and not exists (select 1 from public.hr_luck_rules r where r.id and r.item_id = p_item) then 'not_usable'
    else null end
$$;
revoke execute on function public.hr_loot_plan_refusal(text, text) from public, anon, authenticated, service_role;

-- hr_loot_rule_set, RESTATED WHOLE (pin cfa8fc9b): six plans; salvage and use only where the switch is on.
create or replace function public.hr_loot_rule_set(p_slot int, p_item text, p_rule text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- Restated by 2027-01-23-loot-dispatch.sql: the item's loot plan (keep | deposit | sell, run by
-- hr_loot_dispatch in town) or the pickup filter (ignore). The plan's refusals by item are
-- hr_loot_plan_refusal's (start_kit, item_not_sellable), the one answer Dispatch asks too.
-- LUCK (1007-luck.sql): + salvage and use (hr_loot_plan_refusal: not_salvageable, not_usable), each refused luck_off while the switch is off.
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_why text; v_row public.player_item_rules%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' or p_rule is null or p_rule not in ('keep', 'deposit', 'sell', 'ignore', 'salvage', 'use') then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'loot_rule_set:' || p_item || ':' || p_rule;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('loot_rule_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item', p_item)); end if;
  if p_rule in ('salvage', 'use') and not public.hr_luck_on(v_uid) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'luck_off', 'item', p_item)); end if;
  v_why := public.hr_loot_plan_refusal(p_item, p_rule);
  if v_why is not null then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', v_why, 'item', p_item)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  perform public.hr_item_rule_put(v_uid, p_slot, p_item, v_row.locked, p_rule, v_row.restock);
  v_r := jsonb_build_object('ok', true, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from public;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from anon, service_role;
grant  execute on function public.hr_loot_rule_set(int, text, text, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'added 2026-10-25 (lane S2); 2027-01-23-loot-dispatch.sql: the item''s loot plan keep / deposit / sell (run by '
              'hr_loot_dispatch in town) or the pickup filter ignore; start-kit items take no sell plan; 1007-luck.sql: + salvage '
              '(a salvage-catalogue piece) and use (the Lucky Rivet), behind the luck switch; moves no value'
 where grantee = 'authenticated' and proname = 'hr_loot_rule_set';

-- ── §6 DISPATCH LOOT, RESTATED WHOLE (pin c561bed6): + the salvage arm and the use arm ─────────────────────────────────────────
create or replace function public.hr_loot_dispatch(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- 2027-01-23-loot-dispatch.sql (Tyler 2026-10-25): run the hero's loot plans on its bag, in
-- town. Every planned stack whole: deposit -> the account's Storage while it has room (a kind
-- already there always fits; new kinds in item order), sell -> the vendor's bid through ONE
-- hr_apply. Locked stacks and start-kit items are never moved. The client names nothing.
-- LUCK (1007-luck.sql), while the `luck` switch is on for the account: salvage -> each planned stack, at most the account's allowance
-- (found - salvaged) of it, for hr_luck_salvage's rivets through ONE hr_apply (the rest stays in the bag: no_rivets); then use -> the
-- Lucky Rivet's whole bag stack onto the account's bar through ONE hr_apply. Off, both plans' stacks stay where they are (luck_off).
declare
  c_verb       constant text   := 'loot_dispatch';
  c_max_kinds  constant int    := 200;        -- hr_apply's c_max_item_kinds: the sale's lines per press
  c_max_units  constant bigint := 1000000;    -- hr_apply's c_max_item_delta: one stack's units per press
  c_max_gold   constant bigint := 50000000;   -- hr_apply's c_max_gold_delta: the sale's gold per press
  v_uid     uuid := auth.uid();
  v_r       jsonb;
  v_s       public.hunt_sessions%rowtype;
  v_version bigint;
  v_row     record;
  v_q       bigint;
  v_stored  jsonb := '{}'::jsonb;  v_stored_n int := 0;  v_stored_u bigint := 0;
  v_unpl    jsonb := '{}'::jsonb;  v_unpl_n int := 0;
  v_sitems  jsonb := '{}'::jsonb;  v_lines jsonb := '{}'::jsonb;  v_sold jsonb := '{}'::jsonb;
  v_sold_n  int := 0;  v_sold_u bigint := 0;  v_gold bigint := 0;  v_canon text := '';
  v_locked  int := 0;  v_kit int := 0;  v_later int := 0;
  v_a       jsonb;
  v_refused text;
  v_sold_ok boolean := false;
  -- LUCK
  v_lr      public.hr_luck_rules%rowtype;
  v_luck_on boolean;
  v_left    bigint;
  v_xitems  jsonb := '{}'::jsonb;  v_xlines jsonb := '{}'::jsonb;  v_xn int := 0;  v_xu bigint := 0;  v_rivets bigint := 0;  v_xcanon text := '';
  v_norivet int := 0;  v_off int := 0;
  v_x       jsonb;  v_x_ok boolean := false;  v_x_refused text;
  v_use     bigint := 0;  v_u jsonb;  v_u_ok boolean := false;  v_u_refused text;  v_c jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- IDEMPOTENCY (unlocked pre-check): a decided key answers its stored result.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql): an unpaid town window is priced
  -- at the bag that existed during it, so nothing leaves the bag while one is open.
  v_r := public.hr_settle_first_noted(c_verb, v_uid, p_slot);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- (1) THE HERO: its advisory key, its row, its open hunt (hr_hunt_lock) ...
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select version into v_version from public.player_state where user_id = v_uid and slot = p_slot;
  if v_version is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- ... the same key AGAIN, under the lock: a press racing this one on its key has committed by now.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- A hero out hunting is not in town (Storage is at home, the vendor in town).
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_s.hunt_id)); end if;
  -- (2) THE ACCOUNT'S STORAGE LOCK (hr_bank_move's key), before anything below can take the purse. It is account-wide, so two heroes of
  --     one account never salvage against one allowance at once.
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  select * into v_lr from public.hr_luck_rules where id;
  v_luck_on := public.hr_luck_on(v_uid);

  -- (3) THE PLAN, read under the locks: every bag stack with a deposit, sell or salvage plan, item order.
  for v_row in
    select i.item_id, i.qty, r.loot_rule as plan, r.locked, vv.unit, ls.rivets
      from public.player_inventory i
      join public.player_item_rules r on r.user_id = i.user_id and r.slot = i.slot and r.item_id = i.item_id
      left join public.hr_hunt_vendor_value vv on vv.item_id = i.item_id
      left join public.hr_luck_salvage ls on ls.item_id = i.item_id
     where i.user_id = v_uid and i.slot = p_slot and i.qty > 0 and r.loot_rule in ('deposit', 'sell', 'salvage')
     order by i.item_id
       for update of i
  loop
    if v_row.locked then v_locked := v_locked + 1; continue; end if;
    if public.hr_loot_plan_refusal(v_row.item_id, v_row.plan) is not null then v_kit := v_kit + 1; continue; end if;
    if v_row.plan = 'deposit' then
      -- BAG -> STORAGE, the whole stack, while the account has room (hr_bank_move's rule:
      -- the kinds in Storage + the kinds it has listed, under its own cap).
      if not public.hr_storage_room_fits(v_uid, v_row.item_id) then
        v_unpl := v_unpl || jsonb_build_object(v_row.item_id, v_row.qty);
        v_unpl_n := v_unpl_n + 1;
        continue;
      end if;
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_row.item_id;
      insert into public.account_bank as b (user_id, item_id, qty, updated_at)
        values (v_uid, v_row.item_id, v_row.qty, now())
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
      v_stored := v_stored || jsonb_build_object(v_row.item_id, v_row.qty);
      v_stored_n := v_stored_n + 1;
      v_stored_u := v_stored_u + v_row.qty;
    elsif v_row.plan = 'salvage' then
      -- SALVAGE: the account's allowance of this item (found by its own hunts, less what was salvaged), read under the depot lock.
      if not v_luck_on then v_off := v_off + 1; continue; end if;
      select greatest(0, f.found - f.salvaged) into v_left from public.account_found f where f.user_id = v_uid and f.item_id = v_row.item_id for update;
      v_q := least(v_row.qty, coalesce(v_left, 0), c_max_units);
      -- one press pays at most press_max rivets; what does not fit waits for the next press
      if v_q > 0 and v_rivets + v_q * v_row.rivets > v_lr.press_max then
        v_q := (v_lr.press_max - v_rivets) / v_row.rivets; v_later := v_later + 1; end if;
      if v_q <= 0 or v_xn >= c_max_kinds - 1 then
        if coalesce(v_left, 0) <= 0 then v_norivet := v_norivet + 1; elsif v_q <= 0 then null; else v_later := v_later + 1; end if;
        continue;
      end if;
      if v_q < v_row.qty and coalesce(v_left, 0) < v_row.qty then v_norivet := v_norivet + 1; end if;
      v_xitems := v_xitems || jsonb_build_object(v_row.item_id, -v_q);
      v_xlines := v_xlines || jsonb_build_object(v_row.item_id, jsonb_build_array(v_q, v_row.rivets));
      v_xcanon := v_xcanon || v_row.item_id || '*' || v_q || ',';
      v_xn := v_xn + 1;
      v_xu := v_xu + v_q;
      v_rivets := v_rivets + v_q * v_row.rivets;
    else
      -- SELL: priced by the catalogue's bid alone; one press stays inside hr_apply's clamps
      -- (what does not fit stays in the bag for the next press, counted as `later`).
      v_q := least(v_row.qty, c_max_units);
      if v_sold_n >= c_max_kinds or v_gold + v_q * v_row.unit > c_max_gold then v_later := v_later + 1; continue; end if;
      if v_q < v_row.qty then v_later := v_later + 1; end if;
      v_sitems := v_sitems || jsonb_build_object(v_row.item_id, -v_q);
      v_lines  := v_lines || jsonb_build_object(v_row.item_id, jsonb_build_array(v_q, v_row.unit));
      v_sold   := v_sold || jsonb_build_object(v_row.item_id, v_q);
      v_canon  := v_canon || v_row.item_id || '*' || v_q || ',';
      v_sold_n := v_sold_n + 1;
      v_sold_u := v_sold_u + v_q;
      v_gold   := v_gold + v_q * v_row.unit;
    end if;
  end loop;

  -- (4) THE SALE: ONE hr_apply, the vendor_sell_many journal (kind shop, gold_kind vendor_sale,
  -- gold_in stamped, its item_locked refusal and its day budget), the purse locked last.
  if v_sold_n > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_version, md5(p_idem::text || ':loot_dispatch_sell')::uuid,
             jsonb_build_object('gold', v_gold, 'items', v_sitems,
               'journal', jsonb_build_object('kind', 'shop',
                 'intent', 'vendor_sell_many:' || v_sold_n || ':' || left(md5(v_canon), 16),
                 'meta', jsonb_build_object('lines', v_lines, 'via', c_verb))));
    v_sold_ok := coalesce(v_a->>'ok', '') = 'true';
    if not v_sold_ok then v_refused := coalesce(v_a->>'error', 'refused'); end if;
    if v_sold_ok then v_version := (v_a->>'version')::bigint; end if;
  end if;

  -- (4b) LUCK: THE SALVAGE, ONE hr_apply (kind craft): the pieces out, the rivets in; the allowance spent only when it landed.
  if v_xn > 0 then
    v_x := public.hr_apply(v_uid, p_slot, v_version, md5(p_idem::text || ':loot_dispatch_salvage')::uuid,
             jsonb_build_object('items', v_xitems || jsonb_build_object(v_lr.item_id, v_rivets),
               'journal', jsonb_build_object('kind', 'craft',
                 'intent', 'loot_dispatch:salvage:' || v_xn || ':' || left(md5(v_xcanon), 16),
                 'meta', jsonb_build_object('reason', 'luck_salvage', 'lines', v_xlines, 'rivets', v_rivets, 'via', c_verb))));
    v_x_ok := coalesce(v_x->>'ok', '') = 'true';
    if v_x_ok then
      v_version := (v_x->>'version')::bigint;
      update public.account_found f set salvaged = f.salvaged + (-(x.value #>> '{}')::bigint), updated_at = now()
        from jsonb_each(v_xitems) x where f.user_id = v_uid and f.item_id = x.key;
    else
      v_x_refused := coalesce(v_x->>'error', 'refused');
    end if;
  end if;

  -- (4c) LUCK: THE USE, ONE hr_apply (kind admin, hr_apply's journal kinds have no collection): the rivet's whole bag stack (after the salvage) onto the account's bar.
  if v_luck_on and exists (select 1 from public.player_item_rules r where r.user_id = v_uid and r.slot = p_slot and r.item_id = v_lr.item_id
                                                                    and r.loot_rule = 'use' and not r.locked) then
    select least(i.qty, v_lr.press_max) into v_use from public.player_inventory i
     where i.user_id = v_uid and i.slot = p_slot and i.item_id = v_lr.item_id for update;
    if coalesce(v_use, 0) > 0 then
      v_c := jsonb_build_object('before', coalesce((select a.luck from public.account_luck a where a.user_id = v_uid), 0));
      v_u := public.hr_apply(v_uid, p_slot, v_version, md5(p_idem::text || ':loot_dispatch_use')::uuid,
               jsonb_build_object('items', jsonb_build_object(v_lr.item_id, -v_use),
                 'journal', jsonb_build_object('kind', 'admin', 'intent', 'loot_dispatch:use:' || v_use,
                   'meta', jsonb_build_object('reason', 'luck_use', 'rivets', v_use, 'luck_before', v_c->'before',
                                              'luck_after', (v_c->>'before')::bigint + v_use, 'via', c_verb))));
      v_u_ok := coalesce(v_u->>'ok', '') = 'true';
      if v_u_ok then
        v_version := (v_u->>'version')::bigint;
        v_c := public.hr_luck_credit(v_uid, 0, v_use);
      else
        v_u_refused := coalesce(v_u->>'error', 'refused'); v_use := 0;
      end if;
    end if;
  end if;

  -- NOTHING MOVED: a refusal (writes nothing, keeps the key free).
  if v_stored_n = 0 and not v_sold_ok and not v_x_ok and not v_u_ok then
    if coalesce(v_refused, v_x_refused, v_u_refused) is not null then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', coalesce(v_refused, v_x_refused, v_u_refused))
        || coalesce(coalesce(v_a, v_x, v_u) - 'ok' - 'error', '{}'::jsonb));
    end if;
    if v_unpl_n > 0 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'storage_full',
        'cap', public.hr_storage_room_cap(v_uid), 'used', public.hr_storage_room_used(v_uid), 'stacks', v_unpl_n));
    end if;
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'nothing_to_dispatch',
      'locked', v_locked, 'kit', v_kit, 'later', v_later, 'no_rivets', v_norivet, 'luck_off', v_off));
  end if;

  -- THE DEPOSIT'S JOURNAL: one aggregate row (rule 6 - never per stack). qty is the BAG-side
  -- signed total (negative); meta.items names every stack; the other side is the account's.
  if v_stored_n > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, qty, meta)
      values (v_uid, p_slot, 'bank', c_verb || ':deposit', -v_stored_u,
              jsonb_build_object('dir', 'deposit', 'depot', 'account', 'items', v_stored, 'stacks', v_stored_n));
  end if;
  -- ONE VERSION STEP per press at least: hr_apply's when it moved anything, else this one.
  if not v_sold_ok and not v_x_ok and not v_u_ok then
    v_version := v_version + 1;
    update public.player_state set version = v_version, updated_at = now() where user_id = v_uid and slot = p_slot;
  end if;

  v_r := jsonb_build_object('ok', true, 'version', v_version,
    'stored', jsonb_build_object('stacks', v_stored_n, 'units', v_stored_u, 'items', v_stored),
    'sold', case when v_sold_ok then jsonb_build_object('stacks', v_sold_n, 'units', v_sold_u, 'gold', v_gold, 'items', v_sold)
                 else jsonb_build_object('stacks', 0, 'units', 0, 'gold', 0, 'items', '{}'::jsonb) end,
    'unplaced', jsonb_build_object('stacks', v_unpl_n, 'items', v_unpl,
                  'why', case when v_unpl_n > 0 then 'storage_full' end,
                  'cap', public.hr_storage_room_cap(v_uid), 'used', public.hr_storage_room_used(v_uid)),
    'kept', jsonb_build_object('locked', v_locked, 'kit', v_kit, 'later', v_later, 'no_rivets', v_norivet, 'luck_off', v_off),
    'sell_refused', v_refused,
    -- LUCK: what the salvage paid and what went on the bar (zeros while off or unplanned).
    'salvaged', case when v_x_ok then jsonb_build_object('stacks', v_xn, 'units', v_xu, 'rivets', v_rivets, 'lines', v_xlines)
                     else jsonb_build_object('stacks', 0, 'units', 0, 'rivets', 0, 'lines', '{}'::jsonb) end,
    'salvage_refused', v_x_refused,
    'used', jsonb_build_object('rivets', case when v_u_ok then v_use else 0 end,
                               'luck', case when v_u_ok then (v_c->>'after')::bigint end),
    'use_refused', v_u_refused);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $fn$;
revoke execute on function public.hr_loot_dispatch(int, uuid) from public, anon, service_role;
grant  execute on function public.hr_loot_dispatch(int, uuid) to authenticated;

-- ── §7 THE LUCKY JOB ─────────────────────────────────────────────────────────
-- hr_lucky_ring(p_slot, p_from, p_price, p_idem): this hero's plain ring `p_from` + the offer's rivets + its tier's Hallmark fee -> the Fine
--   Lucky ring. Every refusal answers BEFORE anything moves:
--     not_signed_in, bad_slot, bad_idem, unknown_lucky, bad_quote     a malformed call, or a ring the catalogue offers no Lucky job on
--     rate_limited                                                     hr_rpc_gate('outfit')
--     no_character, luck_off                                           no hero there; the switch is off for the account
--     lucky_level {need, have, skill}                                  the hero's server level in the ring's bench
--     lucky_limit {limit}                                              the account's Lucky jobs this UTC day (hr_luck_rules.lucky_day_limit)
--     quote_changed {luck}                                             the gold the player saw isn't the catalogue's now
--     insufficient_item {...}, insufficient_gold, bank_full            hr_materials_take's (the ring and the rivets, bag then Storage), hr_apply's
-- LOCK ORDER: the hero (hr_hunt_lock), hr:sink:<uid>, the depot and the bag/Storage rows (hr_materials_take), the purse last (hr_apply).
create or replace function public.hr_lucky_ring(p_slot int, p_from text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql)
declare
  c_verb constant text := 'lucky_ring';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_o public.hr_lucky_offers%rowtype; v_lr public.hr_luck_rules%rowtype;
  v_lv int; v_today int; v_take jsonb; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_from is null or p_from !~ '^[a-z0-9_]{1,48}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_lucky')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_o from public.hr_lucky_offers o where o.from_item = p_from;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_lucky')); end if;
  v_verb := c_verb || ':' || v_o.to_item || ':' || p_price || ':' || p_from;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  /* A doubled press waited on the lock above: its key is answered now, once the first committed. */
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if not public.hr_luck_on(v_uid) then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'luck_off')); end if;
  select * into v_lr from public.hr_luck_rules where id;
  v_lv := public.hr_skill_level(v_o.skill, coalesce((select k.xp from public.player_skills k where k.user_id = v_uid and k.slot = p_slot and k.skill_id = v_o.skill), 0));
  if v_lv < v_o.level then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'lucky_level', 'need', v_o.level, 'have', v_lv, 'skill', v_o.skill)); end if;
  perform public.hr_sink_lock(v_uid);
  v_today := public.hr_sink_bought_today(v_uid, c_verb);
  if v_today >= v_lr.lucky_day_limit then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'lucky_limit', 'limit', v_lr.lucky_day_limit)); end if;
  if v_o.gold <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'luck', public.hr_luck_section(v_uid, p_slot))); end if;
  /* THE CHARGE, all or nothing: the ring and the rivets, then the purse. A refusal after the take raises, and the block's rollback puts them back. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_o.from_item, 1, v_lr.item_id, v_o.rivets), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRL11', message = 'lucky ring: materials short'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_price,
             'items', jsonb_build_object(v_o.to_item, 1),
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', c_verb, 'from', v_o.from_item, 'to', v_o.to_item, 'rivets', v_o.rivets,
                                                                      'tier', v_o.tier, 'level', v_lv, 'took', v_take->'from'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRL12', message = 'lucky ring: hr_apply refused'; end if;
  exception
    when sqlstate 'HRL11' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRL12' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'rivets', v_o.rivets, 'item', v_o.to_item,
                            'luck', public.hr_luck_section(v_uid, p_slot));
end $fn$;

-- ── §8 THE SECTION `luck` ────────────────────────────────────────────────────
-- null while the switch is off for the account (the page draws no bar, no plan, no job). On:
--   { luck, from_kills, from_salvage, rank, at, next (null at the stop), rank_max, magic_find, ring_pct,
--     rivets { bag, storage }, salvage { item: { rivets, left } } for each bag stack the catalogue names (left: the account's allowance),
--     lucky { offers [{ from, to, tier, rivets, gold, skill, level }] for plain rings held in the bag or Storage, today, per_day } }
-- Every number is the server's; every envelope replaces it.
create or replace function public.hr_luck_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- LUCK (1007-luck.sql)
declare v_lr public.hr_luck_rules%rowtype; v_l public.account_luck%rowtype; v_rank int; v_mf int; v_sal jsonb; v_off jsonb; v_today int;
begin
  if p_user is null or not public.hr_luck_on(p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into v_lr from public.hr_luck_rules where id;
  select * into v_l from public.account_luck a where a.user_id = p_user;
  v_rank := public.hr_luck_rank(coalesce(v_l.luck, 0));
  v_mf := public.hr_magic_find_of(p_user, p_slot);
  select coalesce(jsonb_object_agg(i.item_id, jsonb_build_object('rivets', s.rivets,
                    'left', coalesce((select greatest(0, f.found - f.salvaged) from public.account_found f where f.user_id = p_user and f.item_id = i.item_id), 0))), '{}'::jsonb)
    into v_sal
    from public.player_inventory i join public.hr_luck_salvage s on s.item_id = i.item_id
   where i.user_id = p_user and i.slot = p_slot and i.qty > 0;
  select coalesce(jsonb_agg(jsonb_build_object('from', o.from_item, 'to', o.to_item, 'tier', o.tier, 'rivets', o.rivets, 'gold', o.gold,
                                               'skill', o.skill, 'level', o.level) order by o.tier, o.from_item), '[]'::jsonb)
    into v_off
    from public.hr_lucky_offers o
   where exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = o.from_item)
      or exists (select 1 from public.account_bank b where b.user_id = p_user and b.item_id = o.from_item);
  select count(*)::int into v_today from public.player_ledger l
   where l.user_id = p_user and l.slot = any (array[0, 1, 2, 3, 4, 5]) and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop'
     and split_part(l.intent, ':', 1) = 'lucky_ring';
  return jsonb_build_object(
    'luck', coalesce(v_l.luck, 0), 'from_kills', coalesce(v_l.from_kills, 0), 'from_salvage', coalesce(v_l.from_salvage, 0),
    'rank', v_rank, 'at', public.hr_luck_to_rank(v_rank), 'next', case when v_rank >= v_lr.rank_max then null else public.hr_luck_to_rank(v_rank + 1) end,
    'rank_max', v_lr.rank_max, 'magic_find', v_mf, 'ring_pct', v_mf - v_rank,
    'rivets', jsonb_build_object(
      'bag', coalesce((select i.qty from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = v_lr.item_id), 0),
      'storage', coalesce((select b.qty from public.account_bank b where b.user_id = p_user and b.item_id = v_lr.item_id), 0)),
    'salvage', v_sal,
    'lucky', jsonb_build_object('offers', v_off, 'today', v_today, 'per_day', v_lr.lucky_day_limit));
end $fn$;
revoke all on function public.hr_luck_section(uuid, int) from public, anon, authenticated, service_role;
do $mig$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_luck_section(uuid, int) from hr_engine;
    revoke all on function public.hr_luck_fold(uuid, int, uuid) from hr_engine;
  end if;
end $mig$;
insert into public.hr_state_sections (key, fn, note) values
  ('luck', 'hr_luck_section', '1007-luck.sql: the account''s Luck bar and Magic Find, the rivets held, each bag stack''s salvage line and the Lucky job''s offers, while the `luck` switch is on for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

revoke execute on function public.hr_lucky_ring(int, text, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_lucky_ring(int, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_lucky_ring';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_lucky_ring', 'p_slot integer, p_from text, p_price bigint, p_idem uuid', 'authenticated',
   'added 1007-luck.sql (lane/d-luck-build): MONEY (a gold sink) and Luck - a plain ring + its tier''s Lucky Rivets + its tier''s Hallmark fee make the Fine Lucky ring, at the hero''s server level in the ring''s bench, behind the luck switch, a day limit an account; refuses quote_changed; one key charges once');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_lucky_ring', 'its own purse, bag and Storage')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED on probe accounts, every probe rolled back ─────────────────────────────────────────
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000001c1001';
  v_u2  constant uuid := '000000c0-0000-4000-a000-0000001c1002';
  k     constant text := '000000c0-0000-4000-b000-1c10';
  v     jsonb; s jsonb; v_scope text; v_lr public.hr_luck_rules%rowtype; v_gear text; v_per int; v_o public.hr_lucky_offers%rowtype;
  v_n   bigint; v_mon text; v_i uuid; v_s0 uuid; v_s1 uuid; v_s2 uuid; v_err text; v_t timestamptz;
begin
  select * into v_lr from public.hr_luck_rules where id;
  select scope into v_scope from public.hr_feature_switches where switch_id = v_lr.switch_id;
  if v_scope is null then raise exception 'luck §9: the switch row is missing'; end if;
  -- the cheapest salvage line (a standard tier-1 piece) and the tier-2 Lucky job
  select s.item_id, s.rivets into v_gear, v_per from public.hr_luck_salvage s order by s.rivets, s.item_id limit 1;
  select * into v_o from public.hr_lucky_offers o order by o.tier limit 1;
  select r.monster_id into v_mon from public.hr_hunt_roster r order by r.monster_id limit 1;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Luck') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'luck §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'luck §9: hr_create_character refused: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, period_key, key, value) values (v_u, 0, 'flag', '', 'character_slot:1', 1)
      on conflict do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'luck §9: the second hero was refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u;

    -- (a) OFF: Magic Find 0, no section, the Luck plans refused, an ended hunt folds nothing, the job refused, the settle read carries 0.
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = v_lr.switch_id;
    -- a hunt of hero 0 that ended, its loot tally two of the gear piece and five bars (no salvage line)
    v_i := gen_random_uuid(); v_s0 := gen_random_uuid();
    insert into public.hunt_instances (id, hunt_id, kind, world_swing, session_mode)
      select v_i, (select hunt_id from public.hr_hunt_ground_spawns where monster_id = v_mon order by hunt_id limit 1), 'party', 0, 'hunt';
    insert into public.hunt_sessions (id, user_id, slot, instance_id, hunt_id, hunt_from, settled_to, next_swing_at, seat, ended_at, end_reason)
      select v_s0, v_u, 0, v_i, i.hunt_id, now(), now(), now(), 0, now(), 'left' from public.hunt_instances i where i.id = v_i;
    insert into public.hunt_session_tally (session_id, user_id, slot, loot) values (v_s0, v_u, 0, jsonb_build_object(v_gear, 2, 'bronze_bar', 5));
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_gear, 3)
      on conflict (user_id, slot, item_id) do update set qty = 3;
    if public.hr_magic_find_of(v_u, 0) <> 0 or public.hr_luck_section(v_u, 0) is not null
       or ((public.hr_state_of(v_u, 0) ? 'luck') and public.hr_state_of(v_u, 0)->'luck' <> 'null'::jsonb) then
      raise exception 'luck §9(a): the switch is off and Magic Find is % / the section reads %', public.hr_magic_find_of(v_u, 0), public.hr_luck_section(v_u, 0); end if;
    v := public.hr_loot_rule_set(0, v_gear, 'salvage', (k || '00000001')::uuid);
    if v->>'error' is distinct from 'luck_off' then raise exception 'luck §9(a): a salvage plan while off answered %', v; end if;
    perform public.hr_tally_count(v_u, 0, v_s0, null);
    if exists (select 1 from public.account_found where user_id = v_u)
       or exists (select 1 from public.player_ledger where user_id = v_u and intent = 'luck_fold') then
      raise exception 'luck §9(a): a hunt folded while off'; end if;
    v := public.hr_lucky_ring(0, v_o.from_item, v_o.gold, (k || '00000002')::uuid);
    if v->>'error' is distinct from 'luck_off' then raise exception 'luck §9(a): the Lucky job while off answered %', v; end if;

    -- (b) ON for this account: the settle that ended the hunt folds what its loot tally holds of the salvage catalogue, ONCE (a second
    --     settle's call adds nothing); a piece the catalogue does not name is nothing; the fold is journalled.
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = v_lr.switch_id;
    perform public.hr_tally_count(v_u, 0, v_s0, null);
    perform public.hr_tally_count(v_u, 0, v_s0, jsonb_build_object('kills', 0, 'km', '{}'::jsonb));
    if (select f.found from public.account_found f where f.user_id = v_u and f.item_id = v_gear) is distinct from 2
       or exists (select 1 from public.account_found where user_id = v_u and item_id = 'bronze_bar')
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'luck_fold' and session_id = v_s0) <> 1 then
      raise exception 'luck §9(b): the fold found % (journalled % times)', (select jsonb_object_agg(f.item_id, f.found) from public.account_found f where f.user_id = v_u),
        (select count(*) from public.player_ledger where user_id = v_u and intent = 'luck_fold'); end if;
    s := public.hr_luck_section(v_u, 0);
    if s is null or (s->>'luck')::bigint <> 0 or (s->>'magic_find')::int <> 0 or (s->>'next')::bigint <> public.hr_luck_to_rank(1)
       or (s->'salvage'->v_gear->>'left')::int <> 2 or (s->'salvage'->v_gear->>'rivets')::int <> v_per then
      raise exception 'luck §9(b): the section reads %', s; end if;

    -- (c) SALVAGE: 3 in the bag, 2 found -> 2 salvaged for 2 x rivets, 1 kept (no_rivets), the allowance spent, the ledger one craft row.
    v := public.hr_loot_rule_set(0, v_gear, 'salvage', (k || '00000003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'luck §9(c): the salvage plan was refused: %', v; end if;
    v := public.hr_loot_rule_set(0, v_lr.item_id, 'sell', (k || '00000004')::uuid);
    if v->>'error' is distinct from 'item_not_sellable' then raise exception 'luck §9(c): a sell plan on the rivet answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_gear, 'use', (k || '00000005')::uuid);
    if v->>'error' is distinct from 'not_usable' then raise exception 'luck §9(c): a use plan on gear answered %', v; end if;
    v := public.hr_loot_dispatch(0, (k || '00000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'salvaged'->>'units')::int <> 2 or (v->'salvaged'->>'rivets')::int <> 2 * v_per
       or (v->'kept'->>'no_rivets')::int <> 1 then raise exception 'luck §9(c): Dispatch answered %', v; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_gear) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_lr.item_id) is distinct from 2 * v_per
       or (select salvaged from public.account_found where user_id = v_u and item_id = v_gear) is distinct from 2
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'craft' and intent like 'loot_dispatch:salvage:%') <> 1 then
      raise exception 'luck §9(c): after the salvage the bag, the allowance or the ledger is wrong'; end if;
    -- a second press salvages nothing more (the allowance is spent): the piece stays
    v := public.hr_loot_dispatch(0, (k || '00000007')::uuid);
    if v->>'error' is distinct from 'nothing_to_dispatch' or (v->>'no_rivets')::int <> 1 then raise exception 'luck §9(c): a press past the allowance answered %', v; end if;

    -- (d) THE RIVET IS BOUND: no vendor value, not tradeable, and the market's own catalogue refuses it.
    if exists (select 1 from public.hr_hunt_vendor_value where item_id = v_lr.item_id and unit > 0)
       or (select tradeable from public.hr_items where item_id = v_lr.item_id) then
      raise exception 'luck §9(d): the rivet is priced or tradeable'; end if;

    -- (e) USE: the rivets onto the bar (one is one Luck), the bag stack gone, the bar raise-only, Magic Find from the rank.
    v := public.hr_loot_rule_set(0, v_lr.item_id, 'use', (k || '00000008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'luck §9(e): the use plan was refused: %', v; end if;
    v := public.hr_loot_dispatch(0, (k || '00000009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'used'->>'rivets')::int <> 2 * v_per or (v->'used'->>'luck')::bigint <> 2 * v_per then
      raise exception 'luck §9(e): the use press answered %', v; end if;
    if exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_lr.item_id)
       or (select luck from public.account_luck where user_id = v_u) is distinct from (2 * v_per)::bigint
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'admin' and intent like 'loot_dispatch:use:%') <> 1 then
      raise exception 'luck §9(e): after the use the bag (%), the bar (%) or the ledger (%) is wrong', (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_lr.item_id), (select luck from public.account_luck where user_id = v_u), (select jsonb_agg(kind || '=' || intent) from public.player_ledger where user_id = v_u); end if;
    begin
      update public.account_luck set luck = luck - 1, from_salvage = from_salvage - 1 where user_id = v_u;
      raise exception 'luck §9(e): the bar went down';
    exception when sqlstate 'HRL01' then null;
    end;
    perform public.hr_luck_credit(v_u, 0, public.hr_luck_to_rank(16) - 2 * v_per);
    if public.hr_magic_find_of(v_u, 0) <> 16 or public.hr_magic_find_of(v_u, 1) <> 16 or public.hr_luck_rank(public.hr_luck_to_rank(16) - 1) <> 15
       or public.hr_luck_rank(public.hr_luck_to_rank(v_lr.rank_max) * 2) <> v_lr.rank_max then
      raise exception 'luck §9(e): the rank reads % (want 16 on both heroes, 15 a Luck short, the far stop past it)', public.hr_magic_find_of(v_u, 0); end if;

    -- (f) THE LUCKY JOB: under its level it is refused; at it, the ring and the rivets (from Storage) and the fee go, the Fine Lucky ring comes,
    --     one shop row; worn, the ring adds its percent to that hero only; a quote that moved is refused; a salvaged Lucky ring pays nothing.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.from_item, 1) on conflict (user_id, slot, item_id) do update set qty = 1;
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_lr.item_id, v_o.rivets) on conflict (user_id, item_id) do update set qty = excluded.qty;
    v := public.hr_lucky_ring(0, v_o.from_item, v_o.gold, (k || '0000000a')::uuid);
    if v->>'error' is distinct from 'lucky_level' then raise exception 'luck §9(f): a hero under the level answered %', v; end if;
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_u, 0, v_o.skill, public.hr_skill_xp_for_level(v_o.skill, v_o.level))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    update public.account_wallet set gold = v_o.gold where user_id = v_u;
    v := public.hr_lucky_ring(0, v_o.from_item, v_o.gold + 1, (k || '0000000b')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'luck §9(f): a wrong quote answered %', v; end if;
    v := public.hr_lucky_ring(0, v_o.from_item, v_o.gold, (k || '0000000c')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'item' is distinct from v_o.to_item then raise exception 'luck §9(f): the Lucky job answered %', v; end if;
    if exists (select 1 from public.account_bank where user_id = v_u and item_id = v_lr.item_id)
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item)
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) is distinct from 1
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent like 'lucky_ring:%') <> 1
       or (select gold from public.account_wallet where user_id = v_u) <> 0 then
      raise exception 'luck §9(f): after the job the bag, Storage, the purse or the ledger is wrong'; end if;
    if (public.hr_lucky_ring(0, v_o.from_item, v_o.gold, (k || '0000000c')::uuid))->>'ok' is distinct from 'true'
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent like 'lucky_ring:%') <> 1 then
      raise exception 'luck §9(f): a replayed key charged twice'; end if;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'ring1', v_o.to_item)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    if public.hr_magic_find_of(v_u, 0) <> 16 + (select pct from public.hr_luck_ring_pct where item_id = v_o.to_item)
       or public.hr_magic_find_of(v_u, 1) <> 16 then
      raise exception 'luck §9(f): the worn ring reads % on its hero, % on the other', public.hr_magic_find_of(v_u, 0), public.hr_magic_find_of(v_u, 1); end if;
    if exists (select 1 from public.hr_luck_salvage where item_id in (select to_item from public.hr_lucky_offers union select item_id from public.hr_luck_ring_pct)) then
      raise exception 'luck §9(f): a Lucky ring salvages for rivets'; end if;

    -- (g) THE ACCOUNT'S COUNTS, folded once a hunt: two heroes of the account in ONE instance add, per settle window, the highest of their
    --     counts, never the sum, whichever ends first; a window only one was in adds in full; nothing is counted while the hunts run; a stage
    --     crossed pays its lump onto the bar once, journalled; a creature off the roster counts nothing.
    v_i := gen_random_uuid(); v_s1 := gen_random_uuid(); v_s2 := gen_random_uuid(); v_t := now() - interval '2 minutes';
    insert into public.hunt_instances (id, hunt_id, kind, world_swing, session_mode)
      select v_i, (select hunt_id from public.hr_hunt_ground_spawns where monster_id = v_mon order by hunt_id limit 1), 'party', 0, 'hunt';
    insert into public.hunt_sessions (id, user_id, slot, instance_id, hunt_id, hunt_from, settled_to, next_swing_at, seat)
      select x.id, v_u, x.slot, v_i, i.hunt_id, now(), now(), now(), x.slot
        from (values (v_s1, 0), (v_s2, 1)) x(id, slot) cross join public.hunt_instances i where i.id = v_i;
    -- the settles' own combat rows (one a member a settle; a settle's rows share its time), under each session's fence key as the settle holds it
    perform set_config('hr.hunt_session', v_s1::text, true);
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id, at) values
      (v_u, 0, 'combat', 'accrue', jsonb_build_object('kills', 60, 'km', jsonb_build_object(v_mon, 60)), v_s1, v_t),
      (v_u, 0, 'combat', 'accrue', jsonb_build_object('kills', 50, 'km', jsonb_build_object(v_mon, 50)), v_s1, v_t + interval '1 minute');
    perform set_config('hr.hunt_session', v_s2::text, true);
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id, at) values
      (v_u, 1, 'combat', 'accrue', jsonb_build_object('kills', 60, 'km', jsonb_build_object(v_mon, 60, 'not_a_monster_x', 9)), v_s2, v_t);
    perform set_config('hr.hunt_session', '', true);
    v_n := (select luck from public.account_luck where user_id = v_u);
    perform public.hr_tally_count(v_u, 0, v_s1, jsonb_build_object('kills', 50, 'km', jsonb_build_object(v_mon, 50)));
    if exists (select 1 from public.account_kills where user_id = v_u) then raise exception 'luck §9(g): a running hunt wrote a count'; end if;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_s2;
    perform public.hr_tally_count(v_u, 1, v_s2, null);
    if (select kills from public.account_kills where user_id = v_u and monster_id = v_mon) is distinct from 60
       or exists (select 1 from public.account_kills where user_id = v_u and monster_id = 'not_a_monster_x') then
      raise exception 'luck §9(g): the first fold counted % (want 60)', (select kills from public.account_kills where user_id = v_u and monster_id = v_mon); end if;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_s1;
    perform public.hr_tally_count(v_u, 0, v_s1, null);
    perform public.hr_tally_count(v_u, 0, v_s1, null);
    if (select kills from public.account_kills where user_id = v_u and monster_id = v_mon) is distinct from 110
       or (select luck from public.account_luck where user_id = v_u) is distinct from coalesce(v_n, 0) + (select luck from public.hr_luck_stages where stage = 1)
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'collection' and intent = 'luck_stage:' || v_mon) <> 1 then
      raise exception 'luck §9(g): the second fold counted % / the bar %', (select kills from public.account_kills where user_id = v_u and monster_id = v_mon),
        (select luck from public.account_luck where user_id = v_u); end if;

    -- (h) ANOTHER ACCOUNT reads nothing of this one's, and a deleted hero changes nothing (the bar and the counts are the account's).
    perform set_config('request.jwt.claim.sub', v_u2::text, true);
    insert into auth.users (id) values (v_u2) on conflict (id) do nothing;
    if public.hr_magic_find_of(v_u2, 0) <> 0 then raise exception 'luck §9(h): another account (switch off for it) has Magic Find'; end if;
    v_n := (select luck from public.account_luck where user_id = v_u);
    delete from public.player_state where user_id = v_u and slot = 1;
    if (select luck from public.account_luck where user_id = v_u) is distinct from v_n or not exists (select 1 from public.account_kills where user_id = v_u) then
      raise exception 'luck §9(h): deleting a hero moved the account''s Luck or counts'; end if;

    raise exception using errcode = 'HRL99', message = 'luck §9 complete - rolling back';
  exception when sqlstate 'HRL99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = v_lr.switch_id) is distinct from v_scope then
    raise exception 'luck §9: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id in (v_u, v_u2)) or exists (select 1 from public.account_luck where user_id in (v_u, v_u2))
     or exists (select 1 from public.account_found where user_id in (v_u, v_u2)) or exists (select 1 from public.account_kills where user_id in (v_u, v_u2))
     or exists (select 1 from public.player_ledger where user_id in (v_u, v_u2)) or exists (select 1 from public.player_intents where user_id in (v_u, v_u2)) then
    raise exception 'luck §9: a probe row leaked'; end if;
  -- (i) THE GRANTS: the client reaches the Lucky job and the two restated verbs only; every helper and the section are owner-only; the
  --     section is plpgsql; the tables are read-own for authenticated and written by nobody.
  if not has_function_privilege('authenticated', 'public.hr_lucky_ring(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_lucky_ring(integer,text,bigint,uuid)', 'execute') then
    raise exception 'luck §9(i): the Lucky job''s grants are wrong'; end if;
  select f into v_err from unnest(array['public.hr_luck_section(uuid,integer)', 'public.hr_magic_find_of(uuid,integer)', 'public.hr_luck_credit(uuid,bigint,bigint)',
                                        'public.hr_luck_fold(uuid,integer,uuid)', 'public.hr_luck_on(uuid)', 'public.hr_luck_rank(bigint)',
                                        'public.hr_luck_to_rank(integer)', 'public.hr_luck_raise_only()']) f
   where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') or has_function_privilege('service_role', f, 'execute') limit 1;
  if v_err is not null then raise exception 'luck §9(i): a client role reaches %', v_err; end if;
  if exists (select 1 from unnest(array['account_luck', 'account_found', 'account_kills']) t(n), unnest(array['anon', 'authenticated', 'service_role']) r(role)
              where has_table_privilege(r.role, 'public.' || t.n, 'insert') or has_table_privilege(r.role, 'public.' || t.n, 'update')
                 or has_table_privilege(r.role, 'public.' || t.n, 'delete')) then
    raise exception 'luck §9(i): a client role can write a Luck table'; end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_luck_section(uuid,integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'luck §9(i): the section is not plpgsql'; end if;
  raise notice 'luck §9 OK: off is dark; found counts only what a hero kept of the catalogue''s pieces; salvage pays within the allowance and keeps the rest; the rivet is bound; use raises the bar one for one, raise-only; the rank and the far stop; the Lucky job (level, quote, Storage, one charge a key) and its worn percent on one hero; the account''s counts take the highest of one window, a stage pays once; another account and a deleted hero see nothing move; the grants';
end $chk$;
