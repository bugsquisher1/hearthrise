-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1063-flame-temper.sql — THE INNER FLAME, TEMPER ON STEPS, IMBUEMENTS AND PERSONAL LOOT'S PITY ON THE SERVER, DARK
--   (lane/flame-temper-build, systems, 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md sections 1 to 4, 19-power-ledger.md
--   rows 4, 10 and 11; the rules are 1063-flame-temper-catalogue.generated.sql's, written from src/data by tools/gen-flame-temper.mjs).
--
-- STATUS: supabase/migration-notes/1063-flame-temper.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1063-flame-temper-catalogue.generated.sql (the rules and twins).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §7 self-check.
--
-- ── DARK ─────────────────────────────────────────────────────────────────────
-- Four hr_flags switches, OFF at apply (insert do nothing: a re-apply never flips a live one): inner_flame, temper_steps, imbuements,
--   personal_loot. Off, every verb here refuses `not_open` and moves nothing, every section answers null (no wire change), the settle's
--   trigger returns at its first read and hr_perks_of's temperSteps is {} (the engine's gear part is byte for byte what it was). They flip
--   when drops and Traits are live (the brief): the roller (lane/drop-formula) reads the flame's luck and hero_pity, the Artificing bench
--   makes the imbuement items, and the Temper Kit is an item.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- TABLES (RLS on; a player reads its own rows; no client writes; the verbs and the settle are the only writers):
--   company_flame   (user_id pk, flame_level, flame_points, height_mpts, carry_ms, stoke jsonb, updated_at)   one flame an account
--   hero_temper     (user_id, slot, equip_slot pk, rank 0..5, seated_tier, updated_at)                        ranks on the hero's slot
--   hero_worn_imbue (user_id, slot, equip_slot pk, imbue_id, band, quality, ms_left, updated_at)              one of each kind a hero
--   hero_pity       (user_id, slot, rarity pk, misses, updated_at)   misses: millionths of x, the sum of p0 over the hero's misses since
--                   its last find (src/core/personal-loot.js; 21 section 4.2 per hero). Written by the roller's settle (owed), never a client.
-- THE SETTLE (trigger hr_flame_temper_settle, AFTER UPDATE OF settled_to ON hunt_sessions, a window that moved forward): the hunted
--   milliseconds of that hero's window (new - old settled_to) burn its company's flame down by hr_flame_decay (Flame XP, the Level re-read
--   each hunted hero-minute, a part carried) and count down its worn imbuements, deleting a spent one. Only hunted time: nothing in town,
--   nothing by the clock (D-10), nothing on a death.
-- VERBS (authenticated; keyed by hr_intent_replay before and under the lock; rate-gated 'hunt'; refusals noted by hr_note_rejection).
--   A success answers `envelope`: hr_state_of read AFTER the verb's own row writes (hr_apply's projection is taken before them), so the
--   client takes the hero from the answer and never re-reads (rule 11, CLAUDE.md §6; tests/write-answers-state.mjs):
--   hr_flame_burn(p_item text, p_count int, p_slot int, p_idem uuid)
--     Remains from hero p_slot's bag onto the account's fire, never past the room (hr_flame_burn_units: the rest stay in the bag). The band
--     is the catalogue's (hr_flame_fuel), never the client's; `top` is the account's highest hero Level. ONE hr_apply {items: -units}
--     journalled kind shop, intent flame_burn:<item>:<units>, meta { reason flame_burn, band, top, points_mpts, height_before, height_after }.
--     Errors: not_open, bad_slot, bad_idem, bad_item (no fuel), bad_count, rate_limited, no_character, none_held, flame_full.
--   hr_flame_stoke_set(p_rule jsonb, p_slot int, p_idem uuid)  writes the stoke rule, clamped by hr_flame_stoke_clamp (a plan row; no value moves).
--     Errors: not_open, bad_slot, bad_idem, bad_rule.
--   hr_temper_rank(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid)
--     The next rank on a slot: opens at hr_temper_rank_cap(the server's Level); the worn piece's item Level prices it (hr_item_levels);
--     re-quoted under the hero's lock, quote_changed when p_price is not the fee; Temper Kits from the bag (kits_owed while the kit is no
--     item). ONE hr_apply {gold: -fee, items: {kit: -kits}} journalled shop, intent temper:<slot>:<rank>:<fee>. A first rank seats on the
--     worn tier. Errors: not_open, bad_slot, bad_equip_slot, bad_idem, bad_quote, rate_limited, no_character, no_piece, not_seated,
--     rank_locked, kits_owed, quote_changed, insufficient_gold / items (hr_apply's).
--   hr_temper_seat(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid)
--     Re-seats a slot's ranks on the worn piece's tier when it is higher than the seat: hr_temper_seat_price, gold burned (D-3), intent
--     temper_seat:<slot>:<tier>:<price>. Errors as above, and nothing_to_seat, already_seated.
--   hr_imbue_apply(p_slot int, p_equip_slot text, p_imbue text, p_price bigint, p_idem uuid)
--     One imbuement item from the bag onto the worn piece of its kind's slot: hr_imbue_fee at the piece's item Level and the server's
--     Level, life hr_imbue_life_ms (plain until the bench rolls quality), band the part's. A new one replaces the old (its hours lost are
--     in the journal). intent imbue_apply:<slot>:<imbue>:<fee>. Errors: not_open, bad_imbue, wrong_slot, imbue_owed (no such item yet),
--     no_piece, quote_changed, and the common ones.
-- SECTIONS (null while the switch is off): flame (the Hearth panel), temper_steps (every slot's rank, seat and next quote), imbues.
-- hr_perks_of (ONE SPLICE, marker hr_temper_steps_of): `temperSteps`, the seated ranks by slot, for the engine's gear part
--   (src/core/member.js -> src/core/hunt/danger.js gearPartPm). {} while the switch is off.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The hero verbs take hr_hunt_lock (the settle's per-hero lock) and the key before and under it, as hr_time_buy does: a second press of
-- one key answers the first; a new key re-quotes. The flame row is taken FOR UPDATE last, by the burn, the stoke and the trigger alike,
-- so no lock cycle exists (each holds at most one hero lock, then the flame). The trigger runs inside the settle's own transaction.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Gold sinks and item sinks only: no verb mints gold, an item or XP. Every price is the server's twin at the server's Level and item
-- Level, checked against the client's only for equality. The flame's height moves up only by the burn (never past the room) and down
-- only by hunted time; luck is read from the row by the server's roller, never a client. A rank is never above the Level's cap or 5;
-- a seat only onto the worn tier. Nothing crosses to another player. ON THE PRE-EA SECURITY LIST (13-security-list.md N-5, N-6, N-8, N-9).
--
-- ── COST (100x: 2,000 accounts x 4 heroes) ───────────────────────────────────
-- Dark: one hr_flags PK read a settled window (the trigger), one in hr_perks_of. Lit: one company_flame update a settled window a hunting
-- hero (a hero-minute loop of a few iterations), one hero_worn_imbue update; 2,000 flame rows, 8,000 x 13 temper rows, 24,000 imbue rows,
-- 16,000 pity rows at most. The verbs write one ledger row a press.
--
-- EDGE: none. The engine reads temperSteps through hr_perks_of when lit; no engine file reads the rest until the roller lands.
-- REVERSIBLE: drop the trigger, the verbs, the sections and their views, the helpers and the four tables; restate hr_perks_of without
--   its temperSteps lines (marker hr_temper_steps_of); the flags may stay.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_flame_rules') is null or to_regprocedure('public.hr_flame_decay(bigint,bigint,bigint,bigint)') is null
     or to_regprocedure('public.hr_temper_rank_quote(text,integer,integer)') is null or to_regprocedure('public.hr_imbue_fee(integer,integer)') is null then
    raise exception 'PRECONDITION: the catalogue first (1063-flame-temper-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_perks_of(uuid,integer)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_flags') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.player_equipment') is null or to_regclass('public.player_inventory') is null
     or to_regclass('public.hr_items') is null then
    raise exception 'PRECONDITION: a helper or table this file reads is missing'; end if;
end $mig$;

-- ── §1 THE SWITCHES (off at apply; never flipped back by a re-apply) ──────────
insert into public.hr_flags (key, enabled, note) values
  ('inner_flame', false, '1063-flame-temper.sql: the company flame (burn, stoke, the settle''s decay). Lit with the drop roller (21 section 1).'),
  ('temper_steps', false, '1063-flame-temper.sql: Temper on steps (hr_temper_rank / _seat, hr_perks_of temperSteps). Lit with the Temper Kit (21 section 2).'),
  ('imbuements', false, '1063-flame-temper.sql: imbuements (hr_imbue_apply, the settle''s timer). Lit with the Artificing bench (21 section 3).'),
  ('personal_loot', false, '1063-flame-temper.sql: personal loot and hero_pity, read by the drop roller (21 section 4).')
  on conflict (key) do nothing;
-- The switches are read by hr_flag_on (2026-09-13-town-presence.sql), PLAN-CACHED as plpgsql by 2027-02-10-settle-plan-cache.generated.sql.
-- This file does not restate it: a LANGUAGE sql copy with a SET clause is re-planned on every call (tests/settle-budget.mjs SB-3, 142 a
-- watched settle), and the reads below call it once a hero a window.

-- ── §2 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.company_flame (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  flame_level  int    not null default 1 check (flame_level >= 1),
  flame_points bigint not null default 0 check (flame_points >= 0),
  height_mpts  bigint not null default 0 check (height_mpts >= 0),
  carry_ms     bigint not null default 0 check (carry_ms between 0 and 59999),
  stoke        jsonb  not null default '{"keep": "full", "own_first": true, "buy_per_day": 0, "cap_hours_pm": 0, "sell_rest": false}'::jsonb
                      check (jsonb_typeof(stoke) = 'object'),
  updated_at   timestamptz not null default now()
);
create table if not exists public.hero_temper (
  user_id     uuid not null,
  slot        int  not null,
  equip_slot  text not null,
  rank        int  not null default 0 check (rank between 0 and 5),
  seated_tier int  not null default 0 check (seated_tier >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot, equip_slot),
  constraint hero_temper_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hero_worn_imbue (
  user_id    uuid not null,
  slot       int  not null,
  equip_slot text not null,
  imbue_id   text not null,
  band       int  not null check (band > 0),
  quality    text not null,
  ms_left    bigint not null check (ms_left > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, equip_slot),
  constraint hero_worn_imbue_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hero_pity (
  user_id    uuid not null,
  slot       int  not null,
  rarity     text not null check (rarity in ('rare', 'very_rare')),
  misses     bigint not null default 0 check (misses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, rarity),
  constraint hero_pity_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['company_flame', 'hero_temper', 'hero_worn_imbue', 'hero_pity'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
    execute format('grant select on public.%I to authenticated', v_t);
    execute format('drop policy if exists %I on public.%I', v_t || '_own', v_t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', v_t || '_own', v_t);
  end loop;
end $mig$;

-- ── §3 THE SETTLE: hunted time burns the flame and runs the imbuements down ──
create or replace function public.hr_flame_temper_settle()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_ms bigint; f public.company_flame%rowtype; v_d jsonb;
begin
  -- 1063-flame-temper.sql: a hero's settled window moved forward by v_ms hunted milliseconds. Only hunted time moves either clock.
  v_ms := floor(extract(epoch from (new.settled_to - old.settled_to)) * 1000)::bigint;
  if v_ms <= 0 then return null; end if;
  if public.hr_flag_on('inner_flame') then
    select * into f from public.company_flame where user_id = new.user_id for update;
    if found and (f.height_mpts > 0 or f.carry_ms > 0) then
      v_d := public.hr_flame_decay(f.height_mpts, f.flame_points, f.carry_ms, v_ms);
      update public.company_flame
         set height_mpts = (v_d->>'height')::bigint, flame_points = (v_d->>'points')::bigint, carry_ms = (v_d->>'carry_ms')::bigint,
             flame_level = (v_d->>'level')::int, updated_at = now()
       where user_id = new.user_id;
    end if;
  end if;
  if public.hr_flag_on('imbuements') then
    -- spent first (its last hunted ms ran out in this window), then the rest count down: never a row counted twice
    delete from public.hero_worn_imbue where user_id = new.user_id and slot = new.slot and ms_left <= v_ms;
    update public.hero_worn_imbue set ms_left = ms_left - v_ms, updated_at = now() where user_id = new.user_id and slot = new.slot;
  end if;
  return null;
end $fn$;
drop trigger if exists hr_flame_temper_settle on public.hunt_sessions;
create trigger hr_flame_temper_settle after update of settled_to on public.hunt_sessions
  for each row when (new.settled_to > old.settled_to) execute function public.hr_flame_temper_settle();

-- ── §4 THE READS: seated ranks, the worn piece, the sections ─────────────────
create or replace function public.hr_worn_level(p_user uuid, p_slot int, p_equip_slot text)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select l.item_level from public.player_equipment e join public.hr_item_levels l on l.item_id = e.item_id
   where e.user_id = p_user and e.slot = p_slot and e.equip_slot = p_equip_slot
$fn$;

create or replace function public.hr_temper_steps_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v jsonb;
begin
  -- TEMPER ON STEPS (1063-flame-temper.sql): the ranks that count, by slot: a slot's ranks seated on a tier the worn piece does not pass.
  -- {} while the switch is off, so the engine's gear part reads nothing (src/core/temper-steps.js temperLevelsOn).
  if not public.hr_flag_on('temper_steps') then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(t.equip_slot, t.rank), '{}'::jsonb) into v
    from public.hero_temper t
    join public.hr_temper_rules r on r.id = 1
   where t.user_id = p_user and t.slot = p_slot and t.rank > 0
     and public.hr_worn_level(p_user, p_slot, t.equip_slot) / r.tier_steps <= t.seated_tier;
  return v;
end $fn$;

create or replace function public.hr_flame_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare f public.company_flame%rowtype; v_l int; v_h bigint;
begin
  -- THE SECTION `flame` (1063-flame-temper.sql; 21 section 1.5): the account's flame as the server holds it. null while dark.
  if not public.hr_flag_on('inner_flame') then return null; end if;
  select * into f from public.company_flame where user_id = p_user;
  v_l := coalesce(f.flame_level, 1); v_h := coalesce(f.height_mpts, 0);
  return jsonb_build_object('level', v_l, 'points', coalesce(f.flame_points, 0), 'height', v_h, 'room', public.hr_flame_room_mpts(v_l),
                            'luck_pm', public.hr_flame_luck_pm(v_h), 'burn_ppm', public.hr_flame_decay_ppm(v_l),
                            'stoke', coalesce(f.stoke, public.hr_flame_stoke_clamp('{"keep": "full"}'::jsonb)),
                            'fuel', (select jsonb_object_agg(item_id, band) from public.hr_flame_fuel));
end $fn$;

create or replace function public.hr_temper_steps_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_temper_rules%rowtype; v jsonb := '{}'::jsonb; s record; t public.hero_temper%rowtype; v_il int; v_tier int; v_cap int; v_q jsonb;
begin
  -- THE SECTION `temper_steps` (1063-flame-temper.sql; 21 section 2.6): every slot's rank, seat and next price, as the server prices it.
  if not public.hr_flag_on('temper_steps') then return null; end if;
  select * into r from public.hr_temper_rules where id = 1;
  v_cap := public.hr_temper_rank_cap(public.hr_level_of(p_user, p_slot));
  for s in select equip_slot from public.hr_temper_slots order by equip_slot loop
    select * into t from public.hero_temper where user_id = p_user and slot = p_slot and equip_slot = s.equip_slot;
    v_il := public.hr_worn_level(p_user, p_slot, s.equip_slot);
    v_tier := case when v_il is null then null else v_il / r.tier_steps end;
    v_q := case when v_il is null then null
                when coalesce(t.rank, 0) > 0 and v_tier > t.seated_tier then
                  jsonb_build_object('seat', public.hr_temper_seat_price(s.equip_slot, t.rank, v_il), 'tier', v_tier)
                when coalesce(t.rank, 0) < v_cap then
                  public.hr_temper_rank_quote(s.equip_slot, coalesce(t.rank, 0) + 1, v_il) || jsonb_build_object('rank', coalesce(t.rank, 0) + 1, 'kit', r.kit_item)
           end;
    v := v || jsonb_build_object(s.equip_slot, jsonb_build_object('rank', coalesce(t.rank, 0), 'seated_tier', t.seated_tier, 'item_level', v_il,
           'seated', coalesce(t.rank, 0) > 0 and v_tier is not null and v_tier <= t.seated_tier, 'cap', v_cap,
           'next_at', case when coalesce(t.rank, 0) < r.ranks then (coalesce(t.rank, 0) + 1) * r.rank_every end, 'quote', v_q));
  end loop;
  return v;
end $fn$;

create or replace function public.hr_imbues_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_lv int;
begin
  -- THE SECTION `imbues` (1063-flame-temper.sql; 21 section 3.6): what each slot wears and how long it has, and every imbuement's fee on
  -- the piece its slot wears now (null where nothing is worn). The timer is the server's; the browser only shows it.
  if not public.hr_flag_on('imbuements') then return null; end if;
  v_lv := public.hr_level_of(p_user, p_slot);
  return jsonb_build_object(
    'worn', (select coalesce(jsonb_object_agg(w.equip_slot, jsonb_build_object('imbue', w.imbue_id, 'band', w.band, 'quality', w.quality, 'ms_left', w.ms_left)), '{}'::jsonb)
               from public.hero_worn_imbue w where w.user_id = p_user and w.slot = p_slot),
    'fees', (select coalesce(jsonb_object_agg(i.imbue_id, public.hr_imbue_fee(public.hr_worn_level(p_user, p_slot, i.equip_slot), v_lv)), '{}'::jsonb)
               from public.hr_imbue_rules i where public.hr_worn_level(p_user, p_slot, i.equip_slot) is not null));
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_flag_on(text)', 'public.hr_flame_temper_settle()', 'public.hr_worn_level(uuid,integer,text)',
      'public.hr_temper_steps_of(uuid,integer)', 'public.hr_flame_view(uuid,integer)', 'public.hr_temper_steps_view(uuid,integer)', 'public.hr_imbues_view(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
insert into public.hr_state_sections (key, fn, note) values
  ('flame', 'hr_flame_view', '1063-flame-temper.sql: the account''s Inner Flame (Level, height, room, luck, stoke); null while inner_flame is off'),
  ('temper_steps', 'hr_temper_steps_view', '1063-flame-temper.sql: Temper on steps, every slot''s rank, seat and next price; null while temper_steps is off'),
  ('imbues', 'hr_imbues_view', '1063-flame-temper.sql: worn imbuements and their hunted time left, and each fee; null while imbuements is off')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 hr_perks_of: ONE SPLICE (marker hr_temper_steps_of), the seated ranks for the engine ──
do $mig$
declare
  c_sig constant text := 'public.hr_perks_of(uuid,integer)';
  v_def text; v_n int; v_a text;
  a constant text[] := array[
$a$    'temper', coalesce(v_temper, '{}'::jsonb),
$a$,
$a$      'temper',     'player_progress:unlock:temper:*',
$a$];
  r constant text[] := array[
$a$    'temper', coalesce(v_temper, '{}'::jsonb),
    -- TEMPER ON STEPS (1063-flame-temper.sql): the seated ranks by slot, {} while its switch is off (src/core/temper-steps.js).
    'temperSteps', public.hr_temper_steps_of(p_user, p_slot),
$a$,
$a$      'temper',     'player_progress:unlock:temper:*',
      'temperSteps', 'hero_temper:seated (switch temper_steps)',
$a$];
begin
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('hr_temper_steps_of' in v_def) > 0 then
    raise notice 'flame-temper §5: hr_perks_of already carries temperSteps - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_a := replace(a[i], chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> 1 then raise exception 'flame-temper §5: hr_perks_of anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a, replace(r[i], chr(13), ''));
  end loop;
  execute v_def;
end $mig$;
revoke all on function public.hr_perks_of(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, integer) to hr_engine;

-- ── §6 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_flame_burn(p_item text, p_count int, p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_band int; v_have bigint; v_top int; f public.company_flame%rowtype;
  v_b jsonb; v_units bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('inner_flame') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select band into v_band from public.hr_flame_fuel where item_id = p_item;
  if v_band is null then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_item')); end if;
  if p_count is null or p_count < 1 or p_count > 100000 then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_count')); end if;
  v_verb := 'flame_burn:' || p_item || ':' || p_count;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('flame_burn', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('flame_burn', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_have := coalesce((select qty from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item), 0);
  if v_have < 1 then return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'none_held')); end if;
  v_top := (select max(public.hr_level_of(ps.user_id, ps.slot)) from public.player_state ps where ps.user_id = v_uid);
  insert into public.company_flame (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into f from public.company_flame where user_id = v_uid for update;
  v_b := public.hr_flame_burn_units(f.height_mpts, f.flame_level, least(p_count, v_have), v_band, v_top);
  v_units := (v_b->>'units')::bigint;
  if v_units < 1 then
    return public.hr_note_rejection('flame_burn', p_slot, jsonb_build_object('ok', false, 'error', 'flame_full', 'flame', public.hr_flame_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'items', jsonb_build_object(p_item, -v_units),
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'flame_burn', 'item', p_item, 'units', v_units, 'band', v_band, 'top', v_top,
                                                                    'points_mpts', (v_b->>'mpts')::bigint, 'height_before', f.height_mpts,
                                                                    'height_after', (v_b->>'height')::bigint))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return public.hr_note_rejection('flame_burn', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  update public.company_flame set height_mpts = (v_b->>'height')::bigint, updated_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'burned', v_units, 'kept', least(p_count, v_have) - v_units,
                            'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_flame_stoke_set(p_rule jsonb, p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_rule jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('inner_flame') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 or not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('flame_stoke', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('flame_stoke', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_rule := public.hr_flame_stoke_clamp(p_rule);
  if v_rule is null then return public.hr_note_rejection('flame_stoke', p_slot, jsonb_build_object('ok', false, 'error', 'bad_rule')); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.company_flame (user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.company_flame where user_id = v_uid for update;
  update public.company_flame set stoke = v_rule, updated_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_temper_rank(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; r public.hr_temper_rules%rowtype; t public.hero_temper%rowtype;
  v_il int; v_tier int; v_next int; v_q jsonb; v_fee bigint; v_kits bigint; v_a jsonb; v_lv int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('temper_steps') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if not exists (select 1 from public.hr_temper_slots where equip_slot = p_equip_slot) then
    return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'bad_equip_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'temper:' || p_equip_slot || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('temper_rank', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('temper_rank', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into r from public.hr_temper_rules where id = 1;
  select * into t from public.hero_temper where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_tier := v_il / r.tier_steps;
  if coalesce(t.rank, 0) > 0 and v_tier > t.seated_tier then
    return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'not_seated', 'temper_steps', public.hr_temper_steps_view(v_uid, p_slot))); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  v_next := coalesce(t.rank, 0) + 1;
  if v_next > public.hr_temper_rank_cap(v_lv) then
    return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'rank_locked', 'next_at', v_next * r.rank_every)); end if;
  if r.kit_item is null or not exists (select 1 from public.hr_items where item_id = r.kit_item) then
    return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'kits_owed')); end if;
  v_q := public.hr_temper_rank_quote(p_equip_slot, v_next, v_il);
  v_fee := (v_q->>'fee')::bigint; v_kits := (v_q->>'kits')::bigint;
  if v_fee <> p_price then
    return public.hr_note_rejection('temper_rank', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'temper_steps', public.hr_temper_steps_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_fee, 'items', jsonb_build_object(r.kit_item, -v_kits),
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'temper', 'equip_slot', p_equip_slot, 'rank_before', coalesce(t.rank, 0),
                                                                    'rank_after', v_next, 'item_level', v_il, 'level', v_lv, 'kits', v_kits, 'kit', r.kit_item))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return public.hr_note_rejection('temper_rank', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  insert into public.hero_temper as h (user_id, slot, equip_slot, rank, seated_tier) values (v_uid, p_slot, p_equip_slot, v_next, v_tier)
    on conflict (user_id, slot, equip_slot) do update
      set rank = excluded.rank, seated_tier = case when h.rank = 0 then excluded.seated_tier else h.seated_tier end, updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'rank', v_next, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_temper_seat(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; r public.hr_temper_rules%rowtype; t public.hero_temper%rowtype;
  v_il int; v_tier int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('temper_steps') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if not exists (select 1 from public.hr_temper_slots where equip_slot = p_equip_slot) then
    return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'bad_equip_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'temper_seat:' || p_equip_slot || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('temper_seat', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('temper_seat', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into r from public.hr_temper_rules where id = 1;
  select * into t from public.hero_temper where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  if coalesce(t.rank, 0) = 0 then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'nothing_to_seat')); end if;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_tier := v_il / r.tier_steps;
  if v_tier <= t.seated_tier then return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'already_seated')); end if;
  v_price := public.hr_temper_seat_price(p_equip_slot, t.rank, v_il);
  if v_price <> p_price then
    return public.hr_note_rejection('temper_seat', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'temper_steps', public.hr_temper_steps_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'temper_seat', 'equip_slot', p_equip_slot, 'rank', t.rank,
                                                                    'tier_before', t.seated_tier, 'tier_after', v_tier, 'item_level', v_il))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return public.hr_note_rejection('temper_seat', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  update public.hero_temper set seated_tier = v_tier, updated_at = now() where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_price, 'tier', v_tier, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_imbue_apply(p_slot int, p_equip_slot text, p_imbue text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; i public.hr_imbue_rules%rowtype; w public.hero_worn_imbue%rowtype;
  v_il int; v_lv int; v_fee bigint; v_life bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('imbuements') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  select * into i from public.hr_imbue_rules where imbue_id = p_imbue;
  if not found then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_imbue')); end if;
  if p_equip_slot is distinct from i.equip_slot then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'wrong_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if not exists (select 1 from public.hr_items where item_id = i.item_id) then
    return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'imbue_owed')); end if;
  v_verb := 'imbue_apply:' || p_imbue || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('imbue_apply', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('imbue_apply', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  v_fee := public.hr_imbue_fee(v_il, v_lv);
  if v_fee <> p_price then
    return public.hr_note_rejection('imbue_apply', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'imbues', public.hr_imbues_view(v_uid, p_slot))); end if;
  -- QUALITY is the bench's roll (09 section 6) and rides on the stack once the bench makes one; until then every imbuement is plain.
  v_life := public.hr_imbue_life_ms('plain');
  select * into w from public.hero_worn_imbue where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_fee, 'items', jsonb_build_object(i.item_id, -1),
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'imbue_apply', 'imbue', p_imbue, 'equip_slot', p_equip_slot, 'band', i.band,
                                                                    'item_level', v_il, 'level', v_lv, 'life_ms', v_life,
                                                                    'replaced', case when w.imbue_id is null then null
                                                                                     else jsonb_build_object('imbue', w.imbue_id, 'ms_lost', w.ms_left) end))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return public.hr_note_rejection('imbue_apply', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  insert into public.hero_worn_imbue as h (user_id, slot, equip_slot, imbue_id, band, quality, ms_left)
    values (v_uid, p_slot, p_equip_slot, p_imbue, i.band, 'plain', v_life)
    on conflict (user_id, slot, equip_slot) do update
      set imbue_id = excluded.imbue_id, band = excluded.band, quality = excluded.quality, ms_left = excluded.ms_left, updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_flame_burn(text,integer,integer,uuid)', 'public.hr_flame_stoke_set(jsonb,integer,uuid)',
      'public.hr_temper_rank(integer,text,bigint,uuid)', 'public.hr_temper_seat(integer,text,bigint,uuid)',
      'public.hr_imbue_apply(integer,text,text,bigint,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values
      ('hr_flame_burn', 'its own Remains'), ('hr_flame_stoke_set', 'its own plan'), ('hr_temper_rank', 'its own purse'),
      ('hr_temper_seat', 'its own purse'), ('hr_imbue_apply', 'its own purse')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_flame_burn', 'hr_flame_stoke_set', 'hr_temper_rank', 'hr_temper_seat', 'hr_imbue_apply');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_flame_burn', 'p_item text, p_count integer, p_slot integer, p_idem uuid', 'authenticated',
   'added 1063-flame-temper.sql (lane/flame-temper-build): MONEY (Rare odds) - Remains from the bag onto the account''s fire, never past the room; dark (inner_flame)'),
  ('hr_flame_stoke_set', 'p_rule jsonb, p_slot integer, p_idem uuid', 'authenticated',
   'added 1063-flame-temper.sql (lane/flame-temper-build): the stoke rule, clamped to the catalogue; dark (inner_flame)'),
  ('hr_temper_rank', 'p_slot integer, p_equip_slot text, p_price bigint, p_idem uuid', 'authenticated',
   'added 1063-flame-temper.sql (lane/flame-temper-build): MONEY (a gold and kit sink) - the next Temper rank on a slot, priced by the server; refuses quote_changed; dark (temper_steps)'),
  ('hr_temper_seat', 'p_slot integer, p_equip_slot text, p_price bigint, p_idem uuid', 'authenticated',
   'added 1063-flame-temper.sql (lane/flame-temper-build): MONEY (a gold sink) - re-seat a slot''s ranks on the worn tier; refuses quote_changed; dark (temper_steps)'),
  ('hr_imbue_apply', 'p_slot integer, p_equip_slot text, p_imbue text, p_price bigint, p_idem uuid', 'authenticated',
   'added 1063-flame-temper.sql (lane/flame-temper-build): MONEY (a gold and item sink) - an imbuement onto the worn piece, 20 hunted hours; dark (imbuements)');

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) DARK: with the switches as applied (off), every verb answers not_open and moves nothing; the sections are null; temperSteps is {}.
-- (b) THE FLAME, lit: a burn takes Remains from the bag up to the room and no further (flame_full past it), writes ONE shop row, and the
--     band is the catalogue's; a replayed key moves nothing; hunted time burns it down to the twin's height and raises Flame XP; a
--     settle that does not move settled_to moves nothing; the stoke rule refuses an unknown keep and clamps a limit.
-- (c) TEMPER, lit: kits_owed while the kit is no item; with a probe kit, a Level 39 hero is rank_locked, a Level 40 hero buys rank 1 at the
--     twin's fee (a wrong price is quote_changed and moves nothing), the rank is seated on the worn tier and reaches hr_perks_of; a piece of a
--     higher tier unseats it (temperSteps loses it) and hr_temper_seat re-seats it at the twin's price.
-- (d) IMBUEMENTS, lit: imbue_owed while the item does not exist; with a probe item, the wrong slot is refused, the apply takes the item and the
--     twin's fee and writes 20 hunted hours; hunted time counts it down and a spent one is deleted.
-- (e) The grants: no client reaches a helper or a view; the five verbs are exactly the signed-in client's and in the baseline; grant
--     hygiene is quiet.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000f1a063';
  v jsonb; v_s uuid; v_item text; v_kit text; v_il int; v_fee bigint; v_room bigint; v_h bigint; v_d jsonb; v_gold bigint;
  v_tier int; v_hi text; v_p bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'flame-temper §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) dark
    update public.hr_flags set enabled = false where key in ('inner_flame', 'temper_steps', 'imbuements', 'personal_loot');
    if public.hr_flame_burn('bones', 1, 0, '000000c0-0000-4000-a000-0000000f1a01')->>'error' is distinct from 'not_open'
       or public.hr_flame_stoke_set('{"keep": "off"}'::jsonb, 0, '000000c0-0000-4000-a000-0000000f1a02')->>'error' is distinct from 'not_open'
       or public.hr_temper_rank(0, 'weapon', 1, '000000c0-0000-4000-a000-0000000f1a03')->>'error' is distinct from 'not_open'
       or public.hr_temper_seat(0, 'weapon', 1, '000000c0-0000-4000-a000-0000000f1a04')->>'error' is distinct from 'not_open'
       or public.hr_imbue_apply(0, 'body', 'fire_ward', 1, '000000c0-0000-4000-a000-0000000f1a05')->>'error' is distinct from 'not_open' then
      raise exception 'VERIFY(a): a dark verb answered something other than not_open'; end if;
    if public.hr_flame_view(v_u, 0) is not null or public.hr_temper_steps_view(v_u, 0) is not null or public.hr_imbues_view(v_u, 0) is not null
       or public.hr_perks_of(v_u, 0)->'temperSteps' is distinct from '{}'::jsonb
       or exists (select 1 from public.company_flame where user_id = v_u) then
      raise exception 'VERIFY(a): a dark section or the perks read shows something'; end if;

    -- (b) the flame, lit
    update public.hr_flags set enabled = true where key in ('inner_flame', 'temper_steps', 'imbuements');
    select item_id into v_item from public.hr_flame_fuel order by item_id limit 1;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (v_u, 0, v_item, 100000)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v := public.hr_flame_burn('not_a_fuel', 1, 0, '000000c0-0000-4000-a000-0000000f1a10');
    if v->>'error' is distinct from 'bad_item' then raise exception 'VERIFY(b): a forged fuel answered %', v; end if;
    v := public.hr_flame_burn(v_item, 100000, 0, '000000c0-0000-4000-a000-0000000f1a11');
    v_room := public.hr_flame_room_mpts(1);
    if coalesce(v->>'ok', '') <> 'true' or (select height_mpts from public.company_flame where user_id = v_u) > v_room
       or (select height_mpts from public.company_flame where user_id = v_u) < v_room - public.hr_flame_worth_mpts(1, (select band from public.hr_flame_fuel where item_id = v_item), public.hr_level_of(v_u, 0))
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) <> 100000 - (v->>'burned')::bigint
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent like 'flame\_burn:%') <> 1 then
      raise exception 'VERIFY(b): a burn to the room answered % (height %, room %)', v, (select height_mpts from public.company_flame where user_id = v_u), v_room; end if;
    -- rule 11 (CLAUDE.md §6): the answer carries the envelope as the burn LEFT it (the flame row is written after hr_apply's projection)
    if (v->'envelope'->'flame'->>'height')::bigint is distinct from (select height_mpts from public.company_flame where user_id = v_u) then
      raise exception 'VERIFY(b): the burn''s envelope reads height % (the row %)', v->'envelope'->'flame'->'height', (select height_mpts from public.company_flame where user_id = v_u); end if;
    v := public.hr_flame_burn(v_item, 100000, 0, '000000c0-0000-4000-a000-0000000f1a11');
    if (select count(*) from public.player_ledger where user_id = v_u and intent like 'flame\_burn:%') <> 1 then
      raise exception 'VERIFY(b): a replayed burn moved again: %', v; end if;
    v := public.hr_flame_burn(v_item, 5, 0, '000000c0-0000-4000-a000-0000000f1a12');
    if v->>'error' is distinct from 'flame_full' then raise exception 'VERIFY(b): a burn past the room answered %', v; end if;
    -- hunted time burns it: a session's window moves 30 minutes
    v_h := (select height_mpts from public.company_flame where user_id = v_u);
    v_d := public.hr_flame_decay(v_h, 0, 0, 1800000);
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at)
      values (v_u, 0, (select hunt_id from public.hr_hunts order by hunt_id limit 1), now() - interval '1 hour', now() - interval '1 hour',
              now() - interval '1 hour', now()) returning id into v_s;
    update public.hunt_sessions set settled_to = settled_to where id = v_s;
    if (select height_mpts from public.company_flame where user_id = v_u) <> v_h then raise exception 'VERIFY(b): a window that did not move burned the flame'; end if;
    update public.hunt_sessions set settled_to = settled_to + interval '30 minutes' where id = v_s;
    if (select height_mpts from public.company_flame where user_id = v_u) <> (v_d->>'height')::bigint
       or (select flame_points from public.company_flame where user_id = v_u) <> (v_d->>'points')::bigint
       or (v_d->>'burned')::bigint <= 0 then
      raise exception 'VERIFY(b): 30 hunted minutes left the flame at %, the twin says %', (select row(height_mpts, flame_points) from public.company_flame where user_id = v_u), v_d; end if;
    v := public.hr_flame_stoke_set('{"keep": "hot"}'::jsonb, 0, '000000c0-0000-4000-a000-0000000f1a13');
    if v->>'error' is distinct from 'bad_rule' then raise exception 'VERIFY(b): an unknown keep answered %', v; end if;
    v := public.hr_flame_stoke_set('{"keep": "two_thirds", "buy_per_day": 999999}'::jsonb, 0, '000000c0-0000-4000-a000-0000000f1a14');
    if coalesce(v->>'ok', '') <> 'true' or ((select stoke from public.company_flame where user_id = v_u)->>'buy_per_day')::int <> (select stoke_buy_max from public.hr_flame_rules) then
      raise exception 'VERIFY(b): the stoke rule was not clamped: %', v; end if;
    if (v->'envelope'->'flame'->'stoke'->>'buy_per_day')::int is distinct from (select stoke_buy_max from public.hr_flame_rules) then
      raise exception 'VERIFY(b): the stoke answered no envelope holding the clamped rule (rule 11): %', v->'envelope'->'flame'; end if;

    -- (c) Temper, lit
    select e.item_id, l.item_level into v_hi, v_il from public.player_equipment e join public.hr_item_levels l on l.item_id = e.item_id
     where e.user_id = v_u and e.slot = 0 and e.equip_slot = 'weapon';
    if v_hi is null then
      select l.item_id, l.item_level into v_hi, v_il from public.hr_item_levels l join public.hr_item_slots i on i.item_id = l.item_id and i.equip_slot = 'weapon'
       where l.item_level < 20 order by l.item_id limit 1;
      insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'weapon', v_hi)
        on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    end if;
    v := public.hr_temper_rank(0, 'weapon', 1, '000000c0-0000-4000-a000-0000000f1a20');
    if v->>'error' is distinct from 'kits_owed' and v->>'error' is distinct from 'rank_locked' then raise exception 'VERIFY(c): with no kit item a rank answered %', v; end if;
    v_kit := v_item;
    update public.hr_temper_rules set kit_item = v_kit;
    if public.hr_level_of(v_u, 0) < 40 then
      v := public.hr_temper_rank(0, 'weapon', 1, '000000c0-0000-4000-a000-0000000f1a21');
      if v->>'error' is distinct from 'rank_locked' then raise exception 'VERIFY(c): a hero under Level 40 answered %', v; end if;
    end if;
    update public.hr_temper_rules set rank_every = 1;
    v_fee := (public.hr_temper_rank_quote('weapon', 1, v_il)->>'fee')::bigint;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 100000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    v := public.hr_temper_rank(0, 'weapon', v_fee + 1, '000000c0-0000-4000-a000-0000000f1a22');
    if v->>'error' is distinct from 'quote_changed' or (select gold from public.account_wallet where user_id = v_u) <> 100000000 then
      raise exception 'VERIFY(c): a wrong Temper price answered %', v; end if;
    v_p := (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit);
    v := public.hr_temper_rank(0, 'weapon', v_fee, '000000c0-0000-4000-a000-0000000f1a23');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 100000000 - v_fee
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit) <> v_p - (public.hr_temper_rank_quote('weapon', 1, v_il)->>'kits')::bigint
       or (select rank from public.hero_temper where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 1
       or (public.hr_perks_of(v_u, 0)->'temperSteps'->>'weapon')::int is distinct from 1 then
      raise exception 'VERIFY(c): rank 1 answered % (perks %)', v, public.hr_perks_of(v_u, 0)->'temperSteps'; end if;
    if (v->'envelope'->'temper_steps'->'weapon'->>'rank')::int is distinct from 1 then
      raise exception 'VERIFY(c): rank 1''s envelope reads %, not the rank it wrote (rule 11)', v->'envelope'->'temper_steps'->'weapon'; end if;
    -- a higher tier unseats; the seat re-seats it at the twin's price
    select l.item_id, l.item_level into v_hi, v_il from public.hr_item_levels l join public.hr_item_slots i on i.item_id = l.item_id and i.equip_slot = 'weapon'
     where l.item_level / 20 > (select seated_tier from public.hero_temper where user_id = v_u and slot = 0 and equip_slot = 'weapon')
     order by l.item_level, l.item_id limit 1;
    update public.player_equipment set item_id = v_hi where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    if public.hr_perks_of(v_u, 0)->'temperSteps' ? 'weapon' then raise exception 'VERIFY(c): a higher tier still counts its unseated rank'; end if;
    v_p := public.hr_temper_seat_price('weapon', 1, v_il);
    v_gold := (select gold from public.account_wallet where user_id = v_u);
    v := public.hr_temper_seat(0, 'weapon', v_p, '000000c0-0000-4000-a000-0000000f1a24');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> v_gold - v_p
       or (public.hr_perks_of(v_u, 0)->'temperSteps'->>'weapon')::int is distinct from 1 then
      raise exception 'VERIFY(c): the re-seat answered %', v; end if;
    if (v->'envelope'->'temper_steps'->'weapon'->>'seated')::boolean is distinct from true then
      raise exception 'VERIFY(c): the re-seat''s envelope reads %, not the seat it wrote (rule 11)', v->'envelope'->'temper_steps'->'weapon'; end if;
    v := public.hr_temper_seat(0, 'weapon', v_p, '000000c0-0000-4000-a000-0000000f1a25');
    if v->>'error' is distinct from 'already_seated' then raise exception 'VERIFY(c): a second seat answered %', v; end if;

    -- (d) imbuements, lit
    v := public.hr_imbue_apply(0, 'body', 'fire_ward', 1, '000000c0-0000-4000-a000-0000000f1a30');
    if v->>'error' is distinct from 'imbue_owed' then raise exception 'VERIFY(d): with no imbuement item the apply answered %', v; end if;
    -- the bench's item stands in as a real one (rolled back): the probe's Remains good, one held
    update public.hr_imbue_rules set item_id = v_item where imbue_id = 'brute_edge';
    update public.player_inventory set qty = 1 where user_id = v_u and slot = 0 and item_id = v_item;
    v := public.hr_imbue_apply(0, 'body', 'brute_edge', 1, '000000c0-0000-4000-a000-0000000f1a31');
    if v->>'error' is distinct from 'wrong_slot' then raise exception 'VERIFY(d): an Edge on the body answered %', v; end if;
    v_fee := public.hr_imbue_fee(v_il, public.hr_level_of(v_u, 0));
    v_gold := (select gold from public.account_wallet where user_id = v_u);
    v := public.hr_imbue_apply(0, 'weapon', 'brute_edge', v_fee, '000000c0-0000-4000-a000-0000000f1a32');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> v_gold - v_fee
       or coalesce((select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item), 0) <> 0
       or (select ms_left from public.hero_worn_imbue where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> public.hr_imbue_life_ms('plain') then
      raise exception 'VERIFY(d): the apply answered %', v; end if;
    if v->'envelope'->'imbues'->'worn'->'weapon'->>'imbue' is distinct from 'brute_edge' then
      raise exception 'VERIFY(d): the apply''s envelope reads %, not the imbuement it wrote (rule 11)', v->'envelope'->'imbues'->'worn'; end if;
    update public.hunt_sessions set settled_to = settled_to + interval '2 hours' where id = v_s;
    if (select ms_left from public.hero_worn_imbue where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> public.hr_imbue_life_ms('plain') - 7200000 then
      raise exception 'VERIFY(d): two hunted hours did not count the imbuement down'; end if;
    update public.hunt_sessions set settled_to = settled_to + interval '20 hours' where id = v_s;
    if exists (select 1 from public.hero_worn_imbue where user_id = v_u and slot = 0) then raise exception 'VERIFY(d): a spent imbuement stayed worn'; end if;

    raise exception using errcode = 'HRF63', message = 'flame-temper §7 complete - rolling back';
  exception when sqlstate 'HRF63' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.company_flame where user_id = v_u) then
    raise exception 'VERIFY(e): §7 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key in ('inner_flame', 'temper_steps', 'imbuements', 'personal_loot') and enabled) then
    raise exception 'VERIFY(e): a switch is lit after the apply'; end if;
  -- (e) the grants
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_function_privilege(g.r, 'public.hr_flame_temper_settle()', 'execute')
                 or has_function_privilege(g.r, 'public.hr_temper_steps_of(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_flame_view(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_worn_level(uuid,integer,text)', 'execute')) then
    raise exception 'VERIFY(e): a client role reaches a helper'; end if;
  if has_function_privilege('anon', 'public.hr_temper_rank(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_temper_rank(integer,text,bigint,uuid)', 'execute')
     or (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated'
          and proname in ('hr_flame_burn', 'hr_flame_stoke_set', 'hr_temper_rank', 'hr_temper_seat', 'hr_imbue_apply')) <> 5 then
    raise exception 'VERIFY(e): the five verbs are not exactly the signed-in client''s'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'flame-temper: four switches dark; the flame burns to its room and down by hunted time; Temper ranks open by Level, seat on a tier and reach the engine; imbuements run on hunted time; all green';
end $$;
