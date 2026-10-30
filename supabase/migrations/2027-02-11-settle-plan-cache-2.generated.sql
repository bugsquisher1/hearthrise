-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE REST OF THE SETTLE'S SQL HELPERS KEEP THEIR PLANS  (GENERATED — DO NOT EDIT)
--
--   Written by tools/gen-plan-cache.mjs (pass 2) from the replayed chain (the pre-images below). Any hand edit FAILS
--   `node tools/gen-plan-cache.mjs --check`. lane/c-envelope-diff, backend-architect, 2026-10-30.
--   STAGED. Game CLOSED: applies on its passing §2 (CLAUDE.md §2), one file via the Coordinator's apply tool,
--   never inside begin/commit, never 00:00-00:10 UTC.
--   digest: 4d48b94ebcb84f3613347f1ac38b525644cbcf83ff6424e7d52b39de160a24f4
--   18 functions.
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- The brief was a per-section envelope diff. Measured first (tools/settle-cost.mjs --pg --door=viewed, PostgreSQL 17,
-- a watched 4-hero settle): building envelopes is about half the settle's DB time (5.33 builds a settle), but the
-- sections a settle CHANGES are the expensive ones (hunt_analyzer 10.7 ms, hunt 4.4, hunt_settings 4.1, party 3.1,
-- character_sheet 2.5, stamina_refill 1.3, shop 1.1: ~24 of a 33 ms section build); the 23 sections that never moved
-- over 31 consecutive answers and frames cost ~9.5 ms. Skipping their build saves at most ~50 ms a settle (~7 %) and
-- needs server-proven per-section versions over account-shared and clock-read inputs. Not this file.
-- What the same measure names instead: ~32 % of the settle's DB time inside LANGUAGE sql bodies that PostgreSQL 17
-- re-plans on every call (2027-02-10-settle-plan-cache.generated.sql took the stable scalar ones called 7+ times a
-- settle; these are the rest): hr_jsonb_add 303 calls a settle, IMMUTABLE (the analyzer's tallies and hr_apply's),
-- hr_premium_until 124, hr_premium_active 91, hr_hunt_tally_add 92, hr_char_xp_for_level 32, hr_unlock_levels 22
-- (SET-RETURNING, 0.9 ms a call), the once-an-envelope sections hr_depot_view and hr_premium_view, and the hello's
-- set-returning reads. The before/after of the whole settle is in the lane report.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 Each function below keeps its name, arguments, return type (RETURNS TABLE kept), volatility (IMMUTABLE kept),
--    SECURITY DEFINER, STRICT, PARALLEL, COST, ROWS and SET clauses (owner and grants are kept by CREATE OR REPLACE);
--    only its LANGUAGE moves, sql -> plpgsql, and its body is the SQL pre-image VERBATIM inside
--        #variable_conflict use_column     (a column and a parameter of one name: the column, as in a SQL function)
--        scalar:          return (select hr_q.v from ( <pre-image> ) as hr_q(v) limit 1);
--        set-returning:   return query <pre-image>;
--    No caller changes. Every function here has a SET clause, so none was ever inlined: no call site loses an inlining.
-- §2 The executed self-check: every function is plpgsql with exactly the pinned body and kept properties, and answers
--    exactly what its SQL pre-image answers, as TEXT (a set-returning one: its rows as a sorted multiset), over probe
--    inputs drawn from the database the file is applied to: every character, the six newest hunts' own tallies, every
--    analyzer, the gold kinds' every branch. The pre-images run as pg_temp copies, rolled back with the probe.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   No row moves. CREATE OR REPLACE takes each function's lock for the instant it swaps; a statement already running
--   keeps the plan it started with. A second apply finds every post-image (§0 accepts it) and rewrites the same text.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   NONE ADDED. No function changes who may call it (grants kept), whose rights it runs with (SECURITY DEFINER kept),
--   or the search_path it runs under (SET kept). The bodies are the pre-images' own SQL. The one premium check
--   (hr_premium_until, the beta switch's only reader) keeps its text; tests/hunt-sessions-settle.mjs BETA reads it.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none. Memory: each backend keeps the cached plans of these bodies (a few hundred KB at most).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Each pre-image is in this file (§2's pg_temp copies, verbatim): restate it under its own name to undo. No data.
--
-- ORDER: after 2027-02-10-settle-reads.sql (the chain end). EDGE: none. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each function is its measured pre-image (this tool read it) or this file's own post-image (a second apply).
do $pin$
declare r record; v_md5 text; v_lang text;
begin
  for r in select * from (values
    ('public.hr_bestiary_of(uuid,integer)', '798c14ea959302013bdc038775f3b654', '8039ff536dff939120ff8f629193affd'),
    ('public.hr_char_xp_for_level(integer)', 'a8371f21371d59f6fabb5dc64b58c001', 'ddbf4860b861919bff6c8fe1e3f84b7e'),
    ('public.hr_collection_of(uuid,integer)', '2e1fa065a3b5cec955c92b497a60f073', '9a7e1360597acde50c00d56e83fcca66'),
    ('public.hr_depot_view(uuid,integer)', '3c98663be8aab51dd028808ec6c6357a', '78dabff8a892158b148954daf15c5afe'),
    ('public.hr_frame_topic(uuid,integer)', 'ef586dfab0b6a2882407a0a0cd8cc9ab', 'c5084fa17e97fcb87fb582a83d85f0da'),
    ('public.hr_gold_kind(text,text,uuid)', '304b566454271cc37d9d2f0f51ce7c9a', 'e7809e0a81b4e9de685bde912a2f6506'),
    ('public.hr_hunt_analyzer_basic(jsonb)', '632a2a2c6a40d1f6f76be07ca63b8bbd', '5dd08adae4922c52ed813399c93da73b'),
    ('public.hr_hunt_open_of(uuid,integer)', 'e81bf96fc9bb15c16238c2e981f41fb1', '8d25c6a7a46232b5862abdb4c6c30c6f'),
    ('public.hr_hunt_tally_add(jsonb,jsonb)', 'cd16f30358364a8c8012a9ad75a09472', '60c5b59fd8f11fdd48e42400495700b8'),
    ('public.hr_hunt_tally_ok(jsonb,text[])', 'c3f4c05c7c8fa1e7ee21e877c45b782c', '15c6fd38ede59306f5c942ee1b86ce29'),
    ('public.hr_jsonb_add(jsonb,jsonb)', '12fa9485d381e12670f8ade21147d356', '44aff9e54f3e078a1c6d45166fc3b982'),
    ('public.hr_premium_active(uuid,integer,timestamp with time zone)', 'fc3930c936fd0ab70e8e26033e8edb02', 'a95958c2baee17fd8adbdc79adadc07d'),
    ('public.hr_premium_until(uuid,integer)', 'd9755164bb43d724cca8ce9203f6417e', '4b353ab5a31c79d1aac3afb10ac11a13'),
    ('public.hr_premium_view(uuid,integer)', 'ac7de9672554f03912e8d7cf197856b1', '4c05b2f18fac2a06b2fb9873f294fd17'),
    ('public.hr_skill_inputs_view(uuid,integer)', 'e998192ef514ae6faae8661008d828af', '1f6ff537a0088696138b3219162f0469'),
    ('public.hr_trophy_of(uuid,integer)', '061b87d3073b5598870808f687de7392', 'b3655855093b5c753571d60b623bd648'),
    ('public.hr_unlock_levels(uuid,integer)', 'f5f677495032913f66bafe9720ab5107', '1320d7281319aedbf364491b4b3a6f82'),
    ('public.hr_utc_day_start(timestamp with time zone)', '82de5965fb876777e1d54fdd1a46aa7e', '65ee2f0323afd1f08ec1400575d9ed9d')
  ) as t(sig, pre, post) loop
    if to_regprocedure(r.sig) is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    select md5(replace(p.prosrc, chr(13), '')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if not ((v_lang = 'sql' and v_md5 = r.pre) or (v_lang = 'plpgsql' and v_md5 = r.post)) then
      raise exception 'PIN: % is neither its pre-image (sql %) nor this file''s post-image (plpgsql %): % % - another file moved it; re-run tools/gen-plan-cache.mjs',
        r.sig, r.pre, r.post, v_lang, v_md5;
    end if;
  end loop;
end $pin$;

-- ── §1 THE SAME BODIES, PLANNED ONCE PER BACKEND ─────────────────────────────
create or replace function public.hr_bestiary_of(p_user uuid, p_slot integer)
 returns TABLE(monster_id text, kills bigint)
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return query

  select substring(pp.key from 17) as monster_id,
         pp.value                  as kills
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:kill_monster:%'
  ;
end
$plc$;

create or replace function public.hr_char_xp_for_level(p_level integer)
 returns bigint
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select (c.base_xp + c.first_xp * m + c.rise * div(m * (m - 1), 2) + c.bend * div((m - 1) * m * (2 * m - 1), 6))::bigint
    from (select greatest(1, coalesce(p_level, 1)) as l) x
    cross join lateral (select * from public.hr_level_curve k where k.from_level <= x.l order by k.from_level desc limit 1) c
    cross join lateral (select (x.l - c.from_level)::numeric as m) mm
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_collection_of(p_user uuid, p_slot integer)
 returns TABLE(item_id text, qty bigint)
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return query

  select substring(pp.key from 9) as item_id,
         pp.value                 as qty
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:loot:%'
  ;
end
$plc$;

create or replace function public.hr_depot_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  with ch as (
    select c.*, (a.chest_id is not null) as built
      from public.hr_storage_chests c
      left join public.account_storage_chests a on a.user_id = p_user and a.chest_id = c.chest_id),
  nx as (select * from ch where not built order by ord limit 1),
  t as (select public.hr_account_property_tier(p_user) as tier),
  rm as (select (select count(*) from public.account_bank where user_id = p_user) as used,
                public.hr_storage_room_used(p_user) as room_used)
  select jsonb_build_object(
    'used', (select used from rm),
    'reserved', (select room_used - used from rm),
    'room_used', (select room_used from rm),
    'cap', public.hr_depot_cap(p_user),
    'base', (select base_stacks from public.hr_depot_config where only_row),
    'tier', (select tier from t),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('chest', chest_id, 'name', name, 'stacks', stacks,
        'tier', req_property_tier, 'gold', gold, 'items', items, 'built', built) order by ord) from ch), '[]'::jsonb),
    'next', (select jsonb_build_object('chest', nx.chest_id, 'name', nx.name, 'stacks', nx.stacks, 'tier', nx.req_property_tier,
        'gold', nx.gold, 'items', nx.items,
        'can_build', nx.req_property_tier <= (select tier from t),
        'why', case when nx.req_property_tier > (select tier from t) then 'needs_property_tier' end)
      from nx))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_frame_topic(p_user uuid, p_slot integer)
 returns text
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select 'hr:' || p_user::text || ':' || p_slot::text
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_gold_kind(p_kind text, p_intent text, p_session uuid)
 returns text
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case
    when p_intent like 'tally\_pay:%' then 'tally'
    when p_intent = 'supply_buy' then 'hunt_supply'
    when p_intent in ('vendor_cover', 'loot_sell') then 'hunt_sale'
    when p_session is not null then 'hunt_loot'
    when p_kind = 'wallet' then 'fold'
    when p_kind = 'hero_slot' then 'hero_slot'
    when p_intent like 'stamina\_refill:%' then 'stamina'
    when p_intent like 'blessing\_buy:%' then 'blessing'
    when p_intent like 'hero\_rename:%' then 'rename'
    when p_intent like 'storage\_chest:%' then 'storage'
    when p_kind = 'farm' or p_intent like 'farm\_%' then 'farm'
    when p_intent like 'vendor\_sell%' then 'vendor_sale'
    when p_kind = 'shop' then 'shop'
    when p_intent = 'create_character' then 'start_kit'
    when p_kind = 'clan' then 'clan'
    when p_kind = 'trade' then 'trade'
    when p_kind = 'trait' then 'trait'
    when p_kind in ('accrue', 'worker', 'gather', 'craft', 'combat', 'farm') then 'town_work'
    else 'other' end
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_analyzer_basic(p_a jsonb)
 returns jsonb
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when p_a is null or jsonb_typeof(p_a) <> 'object' then null else jsonb_build_object(
    'tier', 'basic',
    'session', jsonb_build_object('id', p_a->'session'->'id', 'hunt', p_a->'session'->'hunt',
                 'entered_at', p_a->'session'->'entered_at', 'ended_at', p_a->'session'->'ended_at',
                 'end_reason', p_a->'session'->'end_reason', 'phase', p_a->'session'->'phase'),
    'wall_ms', p_a->'wall_ms', 'hunt_ms', p_a->'hunt_ms',
    'hero', jsonb_build_object(
      'kills', p_a->'hero'->'kills', 'xp', p_a->'hero'->'xp',
      'gold', p_a->'hero'->'gold', 'gold_basis', p_a->'hero'->'gold_basis', 'coins', p_a->'hero'->'coins',
      'loot_value', p_a->'hero'->'loot_value', 'loot', p_a->'hero'->'loot',
      'balance', p_a->'hero'->'balance',
      'supplies', jsonb_build_object('own', p_a->'hero'->'supplies'->'own', 'store', p_a->'hero'->'supplies'->'store'),
      'per_hour', case when jsonb_typeof(p_a->'hero'->'per_hour') = 'object' then jsonb_build_object(
                    'xp', p_a->'hero'->'per_hour'->'xp', 'gold', p_a->'hero'->'per_hour'->'gold',
                    'balance', p_a->'hero'->'per_hour'->'balance',
                    'kills', p_a->'hero'->'per_hour'->'kills') end))
  end
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_open_of(p_user uuid, p_slot integer)
 returns uuid
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select h.id from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_tally_add(p_a jsonb, p_b jsonb)
 returns jsonb
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, case when every(jsonb_typeof(x) = 'number')
                   then to_jsonb(sum((x #>> '{}')::numeric) filter (where jsonb_typeof(x) = 'number'))
                   else public.hr_jsonb_add(
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[1],
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[2]) end as v
      from (select key as k, value as x from jsonb_each(coalesce(p_a, '{}'::jsonb))
            union all
            select key, value from jsonb_each(coalesce(p_b, '{}'::jsonb))) u
     group by k) t
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_tally_ok(p jsonb, p_maps text[])
 returns boolean
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k <> 'total' and k <> all (p_maps))
     and (not (p ? 'total') or (jsonb_typeof(p->'total') = 'number' and (p->>'total') ~ '^[0-9]{1,12}$'))
     and not exists (select 1 from unnest(p_maps) m
                      where p ? m and (jsonb_typeof(p->m) <> 'object'
                        or (select count(*) from jsonb_object_keys(p->m)) > 32
                        or exists (select 1 from jsonb_each(p->m) e
                                    where e.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(e.value) <> 'number'
                                       or (e.value #>> '{}') !~ '^[0-9]{1,12}$')))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_jsonb_add(p_a jsonb, p_b jsonb)
 returns jsonb
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, sum(v) as v from (
      select key as k, value::numeric as v from jsonb_each_text(coalesce(p_a, '{}'::jsonb))
      union all
      select key, value::numeric from jsonb_each_text(coalesce(p_b, '{}'::jsonb))) s
    group by k) t
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_active(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns boolean
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): every premium decision goes through here or
  -- hr_premium_until; nothing else reads the column or the switch.
  select coalesce(public.hr_premium_until(p_user, p_slot) > coalesce(p_at, now()), false)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_until(p_user uuid, p_slot integer)
 returns timestamp with time zone
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): THE ONLY READER of the beta switch and of
  -- player_state.premium_until. While hr_flags `beta_premium` is on, every character is premium
  -- with no end (+infinity); otherwise its own premium_until (null = free). No row = no character = null.
  select case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): active and perks through hr_premium_active.
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', a.prem,
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', a.prem, 'outfits', a.prem, 'login', a.prem))
    from public.player_state ps
    cross join lateral (select public.hr_premium_active(p_user, p_slot, now()) as prem) a
   where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_skill_inputs_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql, Tyler 2026-10-25): a town skill's inputs come from
  -- the hero's bag first, then the account's Storage (hr_materials_take). The engine and the client count Storage
  -- into a bench's supply only where this section says so: the switch that makes every deploy order safe.
  select jsonb_build_object('from', jsonb_build_array('bag', 'storage'))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_trophy_of(p_user uuid, p_slot integer)
 returns TABLE(monster_id text, stage integer)
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return query

  select split_part(pp.key, ':', 2)        as monster_id,
         split_part(pp.key, ':', 3)::int   as stage
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'collection'
     and pp.period_key = ''
     and pp.state      = 'claimed'
     and pp.value      > 0
     and pp.key like 'trophy:%'
     -- Exactly three colon-separated segments, a non-empty monster id, and a
     -- stage that is a SMALL positive integer. Both casts that can abort the
     -- caller's transaction are bounded away here, and it took two passes to
     -- see the second:
     --   22P02  a non-numeric tail. The digit class closes it.
     --   22003  a NUMERIC tail that does not fit in `int`. `^[1-9][0-9]*$`
     --          admits `trophy:goblin:99999999999`, and the `::int` in the
     --          target list above then overflows (Security F1, 2026-09-22,
     --          proof S-1). ⚠ WHY THAT IS NOT MERELY UNTIDY: this read runs on
     --          EVERY accrual (hr-accrue/index.ts), and the savepoint around it
     --          degrades on 42883 ONLY — so a 22003 rethrows and kills the
     --          whole accrual read for that character, permanently, with no
     --          way for the player out of it.
     -- `{0,2}` is the ladder's own shape with room to grow: TROPHY_STAGES has
     -- four rungs, 999 is three orders above it, and every value the class
     -- admits fits in `int` by construction rather than by luck.
     and split_part(pp.key, ':', 2) <> ''
     and split_part(pp.key, ':', 3) ~ '^[1-9][0-9]{0,2}$'
     and split_part(pp.key, ':', 4) = ''
  ;
end
$plc$;

create or replace function public.hr_unlock_levels(p_user uuid, p_slot integer)
 returns TABLE(unlock_id text, level integer)
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return query

  /* 2026-11-29-house-home.sql: ONE HOME PER ACCOUNT (Tyler 2026-10-15). A room
     rung or a property tier is the account's highest over its characters (the
     rows stay filed on the hero who paid); a plot stays the character's own.
     Clamped rather than cast (bigint -> int): an overflow here would throw
     inside an accrual. src/core/perks.js clamps the level to the rungs that exist. */
  select pp.key,
         greatest(0, least(max(pp.value), 2147483647))::int
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id     = pp.key
     and u.progress_kind = pp.kind
   where pp.user_id    = p_user
     and (pp.slot = p_slot or u.namespace in ('room', 'property'))
     and pp.period_key = ''
     and pp.value      > 0
     /* The perk channel's three namespaces; `recipe` rides its own key in hr_perks_of. */
     and u.namespace in ('room', 'plot', 'property')
   group by pp.key
  ;
end
$plc$;

create or replace function public.hr_utc_day_start(p_at timestamp with time zone DEFAULT now())
 returns timestamp with time zone
 language plpgsql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select (date_trunc('day', p_at at time zone 'utc')) at time zone 'utc'
  ) as hr_q(v) limit 1);
end
$plc$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED; the probe hero and the pg_temp pre-images roll back ──────────
-- Fails on the pre-image (every function still sql) and on any body, property or answer that moved.
do $check$
declare
  c_probe constant uuid := '000000d6-0000-4000-a000-00005e77c0df';
  r record; v jsonb; v_n int; v_ex text; v_total int := 0;
begin
  -- (a) THE SHAPE: plpgsql, the pinned body, every kept property (a set-returning one stays set-returning).
  for r in select * from (values
    ('public.hr_bestiary_of(uuid,integer)', '8039ff536dff939120ff8f629193affd', 's', true, false, 'u', '["search_path=public, pg_temp"]', true),
    ('public.hr_char_xp_for_level(integer)', 'ddbf4860b861919bff6c8fe1e3f84b7e', 's', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_collection_of(uuid,integer)', '9a7e1360597acde50c00d56e83fcca66', 's', true, false, 'u', '["search_path=public, pg_temp"]', true),
    ('public.hr_depot_view(uuid,integer)', '78dabff8a892158b148954daf15c5afe', 's', true, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_frame_topic(uuid,integer)', 'c5084fa17e97fcb87fb582a83d85f0da', 'i', false, false, 'u', '["search_path=public"]', false),
    ('public.hr_gold_kind(text,text,uuid)', 'e7809e0a81b4e9de685bde912a2f6506', 'i', false, false, 'u', '["search_path=public"]', false),
    ('public.hr_hunt_analyzer_basic(jsonb)', '5dd08adae4922c52ed813399c93da73b', 'i', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_hunt_open_of(uuid,integer)', '8d25c6a7a46232b5862abdb4c6c30c6f', 's', true, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_hunt_tally_add(jsonb,jsonb)', '60c5b59fd8f11fdd48e42400495700b8', 'i', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_hunt_tally_ok(jsonb,text[])', '15c6fd38ede59306f5c942ee1b86ce29', 'i', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_jsonb_add(jsonb,jsonb)', '44aff9e54f3e078a1c6d45166fc3b982', 'i', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_premium_active(uuid,integer,timestamp with time zone)', 'a95958c2baee17fd8adbdc79adadc07d', 's', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_premium_until(uuid,integer)', '4b353ab5a31c79d1aac3afb10ac11a13', 's', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_premium_view(uuid,integer)', '4c05b2f18fac2a06b2fb9873f294fd17', 's', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_skill_inputs_view(uuid,integer)', '1f6ff537a0088696138b3219162f0469', 'i', false, false, 'u', '["search_path=public, pg_catalog"]', false),
    ('public.hr_trophy_of(uuid,integer)', 'b3655855093b5c753571d60b623bd648', 's', true, false, 'u', '["search_path=public, pg_temp"]', true),
    ('public.hr_unlock_levels(uuid,integer)', '1320d7281319aedbf364491b4b3a6f82', 's', true, false, 'u', '["search_path=public, pg_temp"]', true),
    ('public.hr_utc_day_start(timestamp with time zone)', '65ee2f0323afd1f08ec1400575d9ed9d', 'i', false, false, 'u', '["search_path=public"]', false)
  ) as t(sig, post, vol, secdef, isstrict, par, cfg, retset) loop
    if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                    where p.oid = to_regprocedure(r.sig) and l.lanname = 'plpgsql' and md5(replace(p.prosrc, chr(13), '')) = r.post
                      and p.provolatile = r.vol and p.prosecdef = r.secdef and p.proisstrict = r.isstrict and p.proparallel = r.par
                      and coalesce(to_jsonb(p.proconfig)::text, 'null') = coalesce(r.cfg::jsonb::text, 'null') and p.proretset = r.retset) then
      raise exception 'plan-cache-2 §2(a): % is not this file''s plpgsql image with its properties kept', r.sig;
    end if;
  end loop;

  begin
    -- A PROBE HERO, so the replay (no characters yet) exercises every (uuid, integer) body; production adds its own.
    insert into auth.users (id) values (c_probe) on conflict (id) do nothing;
    if to_regclass('public.hr_access_allowlist') is not null then
      insert into public.hr_access_allowlist (user_id, note) values (c_probe, 'plan-cache-2 §2 probe') on conflict (user_id) do nothing;
    end if;
    perform set_config('request.jwt.claim.sub', c_probe::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'plan-cache-2 §2-harness: hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) THE ANSWERS: each function against its SQL pre-image (a pg_temp copy), as text, over the probe inputs.

    execute $pre$create or replace function pg_temp.hrpc_hr_bestiary_of(p_user uuid, p_slot integer)
 returns TABLE(monster_id text, kills bigint)
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $sqlpre$
  select substring(pp.key from 17) as monster_id,
         pp.value                  as kills
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:kill_monster:%'
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where (select coalesce(array_agg(r::text order by r::text), '{}') from public.hr_bestiary_of(w.a1, w.a2) r) is distinct from (select coalesce(array_agg(r::text order by r::text), '{}') from pg_temp.hrpc_hr_bestiary_of(w.a1, w.a2) r)$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_bestiary_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_char_xp_for_level(p_level integer)
 returns bigint
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select (c.base_xp + c.first_xp * m + c.rise * div(m * (m - 1), 2) + c.bend * div((m - 1) * m * (2 * m - 1), 6))::bigint
    from (select greatest(1, coalesce(p_level, 1)) as l) x
    cross join lateral (select * from public.hr_level_curve k where k.from_level <= x.l order by k.from_level desc limit 1) c
    cross join lateral (select (x.l - c.from_level)::numeric as m) mm
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p0(x)
           where public.hr_char_xp_for_level(p0.x)::text is distinct from pg_temp.hrpc_hr_char_xp_for_level(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_char_xp_for_level answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_collection_of(p_user uuid, p_slot integer)
 returns TABLE(item_id text, qty bigint)
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $sqlpre$
  select substring(pp.key from 9) as item_id,
         pp.value                 as qty
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:loot:%'
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where (select coalesce(array_agg(r::text order by r::text), '{}') from public.hr_collection_of(w.a1, w.a2) r) is distinct from (select coalesce(array_agg(r::text order by r::text), '{}') from pg_temp.hrpc_hr_collection_of(w.a1, w.a2) r)$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_collection_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_depot_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  with ch as (
    select c.*, (a.chest_id is not null) as built
      from public.hr_storage_chests c
      left join public.account_storage_chests a on a.user_id = p_user and a.chest_id = c.chest_id),
  nx as (select * from ch where not built order by ord limit 1),
  t as (select public.hr_account_property_tier(p_user) as tier),
  rm as (select (select count(*) from public.account_bank where user_id = p_user) as used,
                public.hr_storage_room_used(p_user) as room_used)
  select jsonb_build_object(
    'used', (select used from rm),
    'reserved', (select room_used - used from rm),
    'room_used', (select room_used from rm),
    'cap', public.hr_depot_cap(p_user),
    'base', (select base_stacks from public.hr_depot_config where only_row),
    'tier', (select tier from t),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('chest', chest_id, 'name', name, 'stacks', stacks,
        'tier', req_property_tier, 'gold', gold, 'items', items, 'built', built) order by ord) from ch), '[]'::jsonb),
    'next', (select jsonb_build_object('chest', nx.chest_id, 'name', nx.name, 'stacks', nx.stacks, 'tier', nx.req_property_tier,
        'gold', nx.gold, 'items', nx.items,
        'can_build', nx.req_property_tier <= (select tier from t),
        'why', case when nx.req_property_tier > (select tier from t) then 'needs_property_tier' end)
      from nx))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_depot_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_depot_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_depot_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_frame_topic(p_user uuid, p_slot integer)
 returns text
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select 'hr:' || p_user::text || ':' || p_slot::text
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_frame_topic(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_frame_topic(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_frame_topic answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_gold_kind(p_kind text, p_intent text, p_session uuid)
 returns text
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select case
    when p_intent like 'tally\_pay:%' then 'tally'
    when p_intent = 'supply_buy' then 'hunt_supply'
    when p_intent in ('vendor_cover', 'loot_sell') then 'hunt_sale'
    when p_session is not null then 'hunt_loot'
    when p_kind = 'wallet' then 'fold'
    when p_kind = 'hero_slot' then 'hero_slot'
    when p_intent like 'stamina\_refill:%' then 'stamina'
    when p_intent like 'blessing\_buy:%' then 'blessing'
    when p_intent like 'hero\_rename:%' then 'rename'
    when p_intent like 'storage\_chest:%' then 'storage'
    when p_kind = 'farm' or p_intent like 'farm\_%' then 'farm'
    when p_intent like 'vendor\_sell%' then 'vendor_sale'
    when p_kind = 'shop' then 'shop'
    when p_intent = 'create_character' then 'start_kit'
    when p_kind = 'clan' then 'clan'
    when p_kind = 'trade' then 'trade'
    when p_kind = 'trait' then 'trait'
    when p_kind in ('accrue', 'worker', 'gather', 'craft', 'combat', 'farm') then 'town_work'
    else 'other' end
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select x from unnest(array[null, 'wallet', 'hero_slot', 'farm', 'shop', 'clan', 'trade', 'trait', 'accrue', 'worker', 'gather',
             'craft', 'combat', 'hunt', 'x']) x) p0(x) cross join (select x from unnest(array[null, 'tally_pay:1', 'tallyXpay:1', 'supply_buy', 'vendor_cover', 'loot_sell', 'stamina_refill:1', 'stamina_refillX1',
             'blessing_buy:2', 'hero_rename:3', 'storage_chest:4', 'farm_plant', 'vendor_sell', 'vendor_sell_many', 'create_character', 'x']) x) p1(x) cross join (select x from unnest(array[null, '00000000-0000-0000-0000-000000000000'::uuid]) x) p2(x)
           where public.hr_gold_kind(p0.x, p1.x, p2.x)::text is distinct from pg_temp.hrpc_hr_gold_kind(p0.x, p1.x, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_gold_kind answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_analyzer_basic(p_a jsonb)
 returns jsonb
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select case when p_a is null or jsonb_typeof(p_a) <> 'object' then null else jsonb_build_object(
    'tier', 'basic',
    'session', jsonb_build_object('id', p_a->'session'->'id', 'hunt', p_a->'session'->'hunt',
                 'entered_at', p_a->'session'->'entered_at', 'ended_at', p_a->'session'->'ended_at',
                 'end_reason', p_a->'session'->'end_reason', 'phase', p_a->'session'->'phase'),
    'wall_ms', p_a->'wall_ms', 'hunt_ms', p_a->'hunt_ms',
    'hero', jsonb_build_object(
      'kills', p_a->'hero'->'kills', 'xp', p_a->'hero'->'xp',
      'gold', p_a->'hero'->'gold', 'gold_basis', p_a->'hero'->'gold_basis', 'coins', p_a->'hero'->'coins',
      'loot_value', p_a->'hero'->'loot_value', 'loot', p_a->'hero'->'loot',
      'balance', p_a->'hero'->'balance',
      'supplies', jsonb_build_object('own', p_a->'hero'->'supplies'->'own', 'store', p_a->'hero'->'supplies'->'store'),
      'per_hour', case when jsonb_typeof(p_a->'hero'->'per_hour') = 'object' then jsonb_build_object(
                    'xp', p_a->'hero'->'per_hour'->'xp', 'gold', p_a->'hero'->'per_hour'->'gold',
                    'balance', p_a->'hero'->'per_hour'->'balance',
                    'kills', p_a->'hero'->'per_hour'->'kills') end))
  end
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select public.hr_hunt_analyzer_of(user_id, slot, null) from public.player_state
           union select unnest(array[null, '{}', '[]', '7', '{"session":{"id":"s"}}', '{"hero":{"per_hour":5}}',
             '{"hero":{"per_hour":{"xp":1,"gold":2,"balance":3,"kills":4}},"wall_ms":9}']::jsonb[])) s(x)) p0(x)
           where public.hr_hunt_analyzer_basic(p0.x)::text is distinct from pg_temp.hrpc_hr_hunt_analyzer_basic(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_hunt_analyzer_basic answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_open_of(p_user uuid, p_slot integer)
 returns uuid
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select h.id from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_open_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_open_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_hunt_open_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_tally_add(p_a jsonb, p_b jsonb)
 returns jsonb
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, case when every(jsonb_typeof(x) = 'number')
                   then to_jsonb(sum((x #>> '{}')::numeric) filter (where jsonb_typeof(x) = 'number'))
                   else public.hr_jsonb_add(
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[1],
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[2]) end as v
      from (select key as k, value as x from jsonb_each(coalesce(p_a, '{}'::jsonb))
            union all
            select key, value from jsonb_each(coalesce(p_b, '{}'::jsonb))) u
     group by k) t
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from (select unnest(array[null, '{}', '{"a":1}', '{"total":3}', '{"total":3,"byMonster":{"rat":2}}',
           '{"total":1,"byMonster":{"rat":1,"bat":4},"byElement":{"fire":2}}', '{"total":5,"byAbility":{"slash":5},"byElement":{"physical":5}}',
           '{"bySource":{"cooked_shrimp":7}}', '{"total":2,"byMonster":{"rat":1}}', '{"zzz":1}', '{"a":{"b":1}}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.dealt), (t.taken), (t.healed)) v(x)) s(x)) p0(x) cross join (select x from (select unnest(array[null, '{}', '{"a":1}', '{"total":3}', '{"total":3,"byMonster":{"rat":2}}',
           '{"total":1,"byMonster":{"rat":1,"bat":4},"byElement":{"fire":2}}', '{"total":5,"byAbility":{"slash":5},"byElement":{"physical":5}}',
           '{"bySource":{"cooked_shrimp":7}}', '{"total":2,"byMonster":{"rat":1}}', '{"zzz":1}', '{"a":{"b":1}}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.dealt), (t.taken), (t.healed)) v(x)) s(x)) p1(x)
           where public.hr_hunt_tally_add(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_hunt_tally_add(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_hunt_tally_add answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_tally_ok(p jsonb, p_maps text[])
 returns boolean
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k <> 'total' and k <> all (p_maps))
     and (not (p ? 'total') or (jsonb_typeof(p->'total') = 'number' and (p->>'total') ~ '^[0-9]{1,12}$'))
     and not exists (select 1 from unnest(p_maps) m
                      where p ? m and (jsonb_typeof(p->m) <> 'object'
                        or (select count(*) from jsonb_object_keys(p->m)) > 32
                        or exists (select 1 from jsonb_each(p->m) e
                                    where e.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(e.value) <> 'number'
                                       or (e.value #>> '{}') !~ '^[0-9]{1,12}$')))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from (select unnest(array[null, '{}', '{"a":1}', '{"total":3}', '{"total":3,"byMonster":{"rat":2}}',
           '{"total":1,"byMonster":{"rat":1,"bat":4},"byElement":{"fire":2}}', '{"total":5,"byAbility":{"slash":5},"byElement":{"physical":5}}',
           '{"bySource":{"cooked_shrimp":7}}', '{"total":2,"byMonster":{"rat":1}}', '{"zzz":1}', '{"a":{"b":1}}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.dealt), (t.taken), (t.healed)) v(x)) s(x)) p0(x) cross join (select x::text[] from unnest(array[null, '{}', '{byAbility,byElement}', '{byMonster,byElement}', '{bySource}', '{total}']) x) p1(x)
           where public.hr_hunt_tally_ok(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_hunt_tally_ok(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_hunt_tally_ok answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_jsonb_add(p_a jsonb, p_b jsonb)
 returns jsonb
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, sum(v) as v from (
      select key as k, value::numeric as v from jsonb_each_text(coalesce(p_a, '{}'::jsonb))
      union all
      select key, value::numeric from jsonb_each_text(coalesce(p_b, '{}'::jsonb))) s
    group by k) t
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from (select unnest(array[null, '{}', '{"a":1}', '{"a":1.5,"b":-2}', '{"a":0,"b":0.25}', '{"level":120,"melee":33,"defense":4}',
           '{"a":12345678901234567890}', '{"cooked_shrimp":3,"bronze_arrow":250}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.xp), (t.raw_xp), (t.loot), (t.supplies), (t.bought)) v(x)) s(x)) p0(x) cross join (select x from (select unnest(array[null, '{}', '{"a":1}', '{"a":1.5,"b":-2}', '{"a":0,"b":0.25}', '{"level":120,"melee":33,"defense":4}',
           '{"a":12345678901234567890}', '{"cooked_shrimp":3,"bronze_arrow":250}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.xp), (t.raw_xp), (t.loot), (t.supplies), (t.bought)) v(x)) s(x)) p1(x)
           where public.hr_jsonb_add(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_jsonb_add(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_jsonb_add answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_active(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns boolean
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): every premium decision goes through here or
  -- hr_premium_until; nothing else reads the column or the switch.
  select coalesce(public.hr_premium_until(p_user, p_slot) > coalesce(p_at, now()), false)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x) p2(x)
           where public.hr_premium_active(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_premium_active(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_premium_active answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_until(p_user uuid, p_slot integer)
 returns timestamp with time zone
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): THE ONLY READER of the beta switch and of
  -- player_state.premium_until. While hr_flags `beta_premium` is on, every character is premium
  -- with no end (+infinity); otherwise its own premium_until (null = free). No row = no character = null.
  select case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_premium_until(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_premium_until(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_premium_until answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): active and perks through hr_premium_active.
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', a.prem,
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', a.prem, 'outfits', a.prem, 'login', a.prem))
    from public.player_state ps
    cross join lateral (select public.hr_premium_active(p_user, p_slot, now()) as prem) a
   where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_premium_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_premium_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_premium_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_skill_inputs_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql, Tyler 2026-10-25): a town skill's inputs come from
  -- the hero's bag first, then the account's Storage (hr_materials_take). The engine and the client count Storage
  -- into a bench's supply only where this section says so: the switch that makes every deploy order safe.
  select jsonb_build_object('from', jsonb_build_array('bag', 'storage'))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_skill_inputs_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_skill_inputs_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_skill_inputs_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_trophy_of(p_user uuid, p_slot integer)
 returns TABLE(monster_id text, stage integer)
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $sqlpre$
  select split_part(pp.key, ':', 2)        as monster_id,
         split_part(pp.key, ':', 3)::int   as stage
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'collection'
     and pp.period_key = ''
     and pp.state      = 'claimed'
     and pp.value      > 0
     and pp.key like 'trophy:%'
     -- Exactly three colon-separated segments, a non-empty monster id, and a
     -- stage that is a SMALL positive integer. Both casts that can abort the
     -- caller's transaction are bounded away here, and it took two passes to
     -- see the second:
     --   22P02  a non-numeric tail. The digit class closes it.
     --   22003  a NUMERIC tail that does not fit in `int`. `^[1-9][0-9]*$`
     --          admits `trophy:goblin:99999999999`, and the `::int` in the
     --          target list above then overflows (Security F1, 2026-09-22,
     --          proof S-1). ⚠ WHY THAT IS NOT MERELY UNTIDY: this read runs on
     --          EVERY accrual (hr-accrue/index.ts), and the savepoint around it
     --          degrades on 42883 ONLY — so a 22003 rethrows and kills the
     --          whole accrual read for that character, permanently, with no
     --          way for the player out of it.
     -- `{0,2}` is the ladder's own shape with room to grow: TROPHY_STAGES has
     -- four rungs, 999 is three orders above it, and every value the class
     -- admits fits in `int` by construction rather than by luck.
     and split_part(pp.key, ':', 2) <> ''
     and split_part(pp.key, ':', 3) ~ '^[1-9][0-9]{0,2}$'
     and split_part(pp.key, ':', 4) = ''
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where (select coalesce(array_agg(r::text order by r::text), '{}') from public.hr_trophy_of(w.a1, w.a2) r) is distinct from (select coalesce(array_agg(r::text order by r::text), '{}') from pg_temp.hrpc_hr_trophy_of(w.a1, w.a2) r)$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_trophy_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_unlock_levels(p_user uuid, p_slot integer)
 returns TABLE(unlock_id text, level integer)
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 rows 1000
 set search_path = public, pg_temp
as $sqlpre$
  /* 2026-11-29-house-home.sql: ONE HOME PER ACCOUNT (Tyler 2026-10-15). A room
     rung or a property tier is the account's highest over its characters (the
     rows stay filed on the hero who paid); a plot stays the character's own.
     Clamped rather than cast (bigint -> int): an overflow here would throw
     inside an accrual. src/core/perks.js clamps the level to the rungs that exist. */
  select pp.key,
         greatest(0, least(max(pp.value), 2147483647))::int
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id     = pp.key
     and u.progress_kind = pp.kind
   where pp.user_id    = p_user
     and (pp.slot = p_slot or u.namespace in ('room', 'property'))
     and pp.period_key = ''
     and pp.value      > 0
     /* The perk channel's three namespaces; `recipe` rides its own key in hr_perks_of. */
     and u.namespace in ('room', 'plot', 'property')
   group by pp.key
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where (select coalesce(array_agg(r::text order by r::text), '{}') from public.hr_unlock_levels(w.a1, w.a2) r) is distinct from (select coalesce(array_agg(r::text order by r::text), '{}') from pg_temp.hrpc_hr_unlock_levels(w.a1, w.a2) r)$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_unlock_levels answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_utc_day_start(p_at timestamp with time zone DEFAULT now())
 returns timestamp with time zone
 language sql
 immutable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select (date_trunc('day', p_at at time zone 'utc')) at time zone 'utc'
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x) p0(x)
           where public.hr_utc_day_start(p0.x)::text is distinct from pg_temp.hrpc_hr_utc_day_start(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache-2 §2(b): hr_utc_day_start answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    if v_total <> 18 then raise exception 'plan-cache-2 §2(b)-harness: % of 18 functions probed', v_total; end if;
    raise exception 'plan-cache-2 §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'plan-cache-2 §2: ok' then raise; end if;
  end;
end $check$;
