-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1049-setups-free.sql — SAVING A SETUP IS FREE: EVERY HERO HOLDS THE WHOLE SETUP LIMIT, AND NOTHING SELLS A SLOT
--   (lane/c-company FB-6, backend-architect, 2026-11-22; redesign direction 9, approved by Tyler 2026-11-22,
--   docs/design/redesign/02-architecture.md package 9: "Plans are free" and "Setup slots priced at 15,000 and 40,000 gold (S-3)" is
--   what the package replaces: "A price on remembering a choice works against the first principle"; 05-roadmap.md section 3, FB-6:
--   "plans are free and priced Setup slots stay out").
--
-- STATUS: supabase/migration-notes/1049-setups-free.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base, and BEFORE
--   1050-setups-free-gold-sinks-catalogue.generated.sql, which drops the `setup_slot` sink row this file stops reading (that file's §4
--   refuses to run while hr_setup_slot_buy exists).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHAT IT REMOVES ──────────────────────────────────────────────────────────
--   hr_setup_slot_buy(int, bigint, uuid)  DROPPED with its hr_client_rpc_baseline row: the only verb that sold a setup slot (a gold
--                                         sink of 2027-02-28-setup-slots.sql: three free, then 15,000 and 40,000 gold a hero).
--   hr_setups_bought(uuid, int)           DROPPED: the bought rung it read (player_progress stat `setup_slots_bought`) is never read
--                                         again. The rows stay where they are, unread, until the Early Access wipe deletes them.
-- ── WHAT IT RESTATES (each WHOLE, each its own §0 pin) ─────────────────────────
--   hr_setups_of(user, slot)              the setup limit, hr_hunt_limit('presets'), for every hero. It reads no sink row.
--   hr_setup_slots_view(user, slot)       the envelope section `setup_slots`: { count, max }, both the limit. No `free`, no `bought`,
--                                         no `price`: nothing is for sale. One statement, no table read (every envelope builds it).
--   hr_setup_locked(user, slot, n)        a number past the limit is refused `setup_locked` with { slots } and no price. The six
--                                         verbs that ask it (save, put, options, rename, copy, project) keep asking: with every
--                                         number under the limit open, it refuses only what bad_preset already refuses.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Nothing here takes a lock or writes a player row. Every restated helper is read-only. A second apply restates the same bodies and
--   finds the dropped functions already gone: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- One client verb fewer (hr_setup_slot_buy, a gold sink). A setup is a saved copy of the hero's own gear, bar and restock lines; more
--   of them gives no power and moves no value. No new grant, no new table.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- The section was two primary key reads an envelope (the sink row and the rung); it is now none. hr_setup_locked was three reads on
--   every bar edit; it is now one existence read only past the limit.
--
-- REVERSIBLE: re-apply 2027-02-28-sink-price-plan.sql's hr_setup_slots_view and 2027-02-28-setup-slots.sql's helpers and verb, with a
--   `setup_slot` row in src/data/gold-sinks.js (the generator refuses that row today: restore its check first). Bought rungs were
--   never deleted, so a restore would honor them.
-- WIPE: nothing to keep.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_hunt_limit(text)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_setups_of(uuid,integer)') is null or to_regprocedure('public.hr_setup_locked(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_setup_slots_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the setup slot helpers of 2027-02-28-setup-slots.sql are missing'; end if;
  -- Each restated body is its live image (2027-02-28-setup-slots.sql / 2027-02-28-sink-price-plan.sql) or this file's own (a second apply).
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_setup_slots_view(uuid,integer)'::regprocedure;
  if strpos(v_src, 'setup_slots_bought') = 0 and strpos(v_src, 'SETUPS-FREE') = 0 then
    raise exception 'PIN: hr_setup_slots_view is neither the sink-price-plan image nor this file''s: another file moved it'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_setups_of(uuid,integer)'::regprocedure;
  if strpos(v_src, 'hr_setups_bought') = 0 and strpos(v_src, 'SETUPS-FREE') = 0 then
    raise exception 'PIN: hr_setups_of is neither the setup-slots image nor this file''s: another file moved it'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_setup_locked(uuid,integer,integer)'::regprocedure;
  if strpos(v_src, 'hr_sink_price') = 0 and strpos(v_src, 'SETUPS-FREE') = 0 then
    raise exception 'PIN: hr_setup_locked is neither the setup-slots image nor this file''s: another file moved it'; end if;
end $mig$;

-- ── §1 NOTHING SELLS A SLOT ──────────────────────────────────────────────────
drop function if exists public.hr_setup_slot_buy(int, bigint, uuid);
delete from public.hr_client_rpc_baseline where proname = 'hr_setup_slot_buy';

-- ── §2 EVERY HERO HOLDS THE LIMIT ────────────────────────────────────────────
create or replace function public.hr_setups_of(p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- SETUPS-FREE (1049-setups-free.sql): saving a setup is free, so every hero holds the whole limit. Nothing bought, nothing read.
begin
  return public.hr_hunt_limit('presets');
end $fn$;

create or replace function public.hr_setup_slots_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- SETUPS-FREE (1049-setups-free.sql): the limit, twice (how many this hero may open, and the most any hero may). Nothing is for sale,
-- so there is no price. Every envelope builds this: no table is read.
declare v_lim int := public.hr_hunt_limit('presets');
begin
  return jsonb_build_object('count', v_lim, 'max', v_lim);
end $fn$;

create or replace function public.hr_setup_locked(p_user uuid, p_slot int, p_preset int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- SETUPS-FREE (1049-setups-free.sql): only a number past the limit is refused, and nothing is offered for it. A setup already saved is
-- never refused (a number a row stands on stays open, as before).
declare v_count int := public.hr_setups_of(p_user, p_slot);
begin
  if p_preset < v_count
     or exists (select 1 from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot and p.preset = p_preset)
     or exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot and a.preset = p_preset) then
    return null;
  end if;
  return jsonb_build_object('ok', false, 'error', 'setup_locked', 'slots', v_count);
end $fn$;

drop function if exists public.hr_setups_bought(uuid, int);

revoke execute on function public.hr_setups_of(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setup_slots_view(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setup_locked(uuid, int, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('setup_slots', 'hr_setup_slots_view', '1049-setups-free.sql: how many setup numbers this hero may open and the most any hero may: both the limit, nothing for sale')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) nothing sells a slot: the verb, its baseline row and the rung reader are gone, and no function body names the sink row
-- (b) a brand-new hero's envelope says it may open every setup number up to the limit, with no price
-- (c) that hero saves a setup on EVERY number under the limit: each is ok, the purse does not move, no shop journal row is written
-- (d) a number past the limit is refused (bad_preset, as ever) and writes nothing; hr_setup_locked past it names the slots and no price
-- (e) the helpers are not a client's to call; grant hygiene holds
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00005e7f0001';
  k     constant text := '000000c0-0000-4000-a000-00005e7f00';
  v_lim int := public.hr_hunt_limit('presets');
  v jsonb; v_purse bigint; i int;
begin
  -- (a)
  if to_regprocedure('public.hr_setup_slot_buy(integer,bigint,uuid)') is not null or to_regprocedure('public.hr_setups_bought(uuid,integer)') is not null then
    raise exception 'setups-free §4(a): a verb or helper that sold a setup slot still exists'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_setup_slot_buy') then
    raise exception 'setups-free §4(a): the client baseline still lists hr_setup_slot_buy'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and (p.prosrc like '%''setup_slot''%' or p.prosrc like '%setup_slots_bought%')) then
    raise exception 'setups-free §4(a): a function still reads the setup slot price or the bought rung: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.prosrc like '%''setup_slot''%' or p.prosrc like '%setup_slots_bought%')); end if;
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Setups') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'setups-free §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setups-free §4: hr_create_character(0) refused: %', v; end if;
    -- (b)
    v := public.hr_state_of(v_u, 0)->'setup_slots';
    if v is distinct from jsonb_build_object('count', v_lim, 'max', v_lim) then
      raise exception 'setups-free §4(b): a new hero''s setup_slots reads %', v; end if;
    -- (c)
    v_purse := public.hr_purse_of(v_u);
    for i in 0 .. v_lim - 1 loop
      delete from public.hr_rate_counters where user_id = v_u;
      v := public.hr_hunt_preset_save(0, i, 'Setup ' || (i + 1), (k || lpad(i::text, 2, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'setups-free §4(c): saving setup % refused: %', i, v; end if;
    end loop;
    if (select count(*) from public.player_hunt_presets where user_id = v_u and slot = 0) <> v_lim then
      raise exception 'setups-free §4(c): % setups saved, the limit is %', (select count(*) from public.player_hunt_presets where user_id = v_u and slot = 0), v_lim; end if;
    if public.hr_purse_of(v_u) is distinct from v_purse
       or exists (select 1 from public.player_ledger where user_id = v_u and kind = 'shop') then
      raise exception 'setups-free §4(c): saving setups moved gold or wrote a shop row'; end if;
    -- (d)
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_preset_save(0, v_lim, 'One too many', (k || '99')::uuid);
    if v->>'error' is distinct from 'bad_preset' or exists (select 1 from public.player_hunt_presets where user_id = v_u and preset = v_lim) then
      raise exception 'setups-free §4(d): a number past the limit answered %', v; end if;
    v := public.hr_setup_locked(v_u, 0, v_lim);
    if v is distinct from jsonb_build_object('ok', false, 'error', 'setup_locked', 'slots', v_lim) then
      raise exception 'setups-free §4(d): past the limit hr_setup_locked reads %', v; end if;
    raise exception using errcode = 'HRS49', message = 'setups-free §4 complete - rolling back';
  exception when sqlstate 'HRS49' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'setups-free §4: a probe row leaked'; end if;
  -- (e)
  if has_function_privilege('authenticated', 'public.hr_setups_of(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_setup_slots_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_setup_locked(uuid,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_setup_locked(uuid,integer,integer)', 'execute') then
    raise exception 'setups-free §4(e): a helper is a client''s to call'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'setups-free §4 OK: nothing sells a slot, a new hero may open every number up to %, saving each moved no gold, past it is refused with no price, the grants', v_lim;
end $chk$;
