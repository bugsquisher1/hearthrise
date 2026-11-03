-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-23-town-hp-whole.sql — A HERO IN TOWN IS AT FULL HP, WHATEVER THE GEAR DOES
--   (lane/a-0284-truth, systems-engineer, 2026-11-03; Tyler's ruling: a hero comes home at full HP and mana).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00-00:10 UTC). Pre-EA: applies on its
-- passing §2; on the EA Security list (writes player_state.hp; moves no value).
-- EDGE: none, the payload hash does not move. CLIENT: none.
-- APPLY ORDER: anywhere after 2027-02-11-forfeit-home-whole.sql.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- No hunt end misses the ruling: the engine writes delta.hp = max, hr_hunt_close
-- writes it on a forfeit. But max HP is computed live from the worn armor
-- (hr_vitals_of) and player_state.hp is stored, and nothing refills in town. So a
-- hero home at 190/190 who puts on a helm stands at 190/198 on the server, on the
-- town bar, and at the first swing of the next hunt (member.js starts from stored HP).
-- Blind panel 2026-11-03: "HP never refills in town (251/295 until the hunt starts)."
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- One trigger on the one table gear lives in. Any write to player_equipment for a
-- hero with no open hunt sets hp to that hero's max by hr_vitals_of, up or down.
-- A hero in a hunt is left alone: the engine owns HP until the hunt ends.
-- Both ways out of town (hr_hunt_enter, and hr_hunt_party_start seat by seat) go
-- through hr_hunt_enter_for and start from this one column, so neither needs a
-- change. A table trigger and no restated body: no live-hash-tracked function moves.
-- Cost: one index probe, plus one hr_vitals_of (~2 ms) for a hero in town, per
-- equipment row written; a settle writes none of these for a hero in town.
--
-- ── NOT DONE, ON PURPOSE ────────────────────────────────────────────────────
-- No backfill: §2 forbids SQL that heals a real character. A hero standing short
-- today is whole at its next gear change or its next hunt's end (the wipe takes
-- the rest); accounts made after the apply never stand short.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- HP in town buys nothing, and mid-hunt the trigger writes nothing, so swapping
-- armor is no free heal in a fight. No grant moves; a client cannot call it.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop trigger hr_town_hp_whole on public.player_equipment;
-- drop function public.hr_town_hp_whole();
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_vitals_of(uuid,integer)') is null then raise exception 'PRECONDITION: hr_vitals_of is absent'; end if;
  if to_regclass('public.player_equipment') is null then raise exception 'PRECONDITION: player_equipment is absent'; end if;
  if position('FORFEIT-HOME-WHOLE' in (select prosrc from pg_proc where oid = 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_hunt_close does not send a hero home whole (2027-02-11-forfeit-home-whole.sql)';
  end if;
end $mig$;

-- ── §1 THE TRIGGER ──────────────────────────────────────────────────────────
create or replace function public.hr_town_hp_whole()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $function$
-- TOWN-HP-WHOLE (2027-02-23-town-hp-whole.sql). Worn armor moved a hero's max HP: a hero in town stands at the new max,
-- up or down. A hero in a hunt keeps the hunt's HP: the engine owns it until the hunt ends, and every end comes home whole.
declare
  v_user uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_slot int  := case when tg_op = 'DELETE' then old.slot else new.slot end;
begin
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_user and h.slot = v_slot and h.ended_at is null) then
    return null;
  end if;
  update public.player_state
     set hp = (public.hr_vitals_of(v_user, v_slot) ->> 'max_hp')::int
   where user_id = v_user and slot = v_slot;
  return null;
end $function$;
revoke execute on function public.hr_town_hp_whole() from public, anon, authenticated, service_role;

drop trigger if exists hr_town_hp_whole on public.player_equipment;
create trigger hr_town_hp_whole
  after insert or delete or update of item_id on public.player_equipment
  for each row execute function public.hr_town_hp_whole();

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every fixture rolled back ───────
do $check$
declare
  c_a constant uuid := '000000d7-0000-4000-a000-00005e77c0a1';
  c_b constant uuid := '000000d7-0000-4000-a000-00005e77c0b2';
  v jsonb; v_hunt text; v_heavy text; v_pid uuid; v_sa uuid; v_bare int; v_worn int; v_sig text;
  hp_of constant text := 'select hp from public.player_state where user_id = $1 and slot = 0';
  v_hp int;
begin
  begin
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select i.item_id into v_heavy from public.hr_items i where i.armour_weight = 'heavy' order by i.item_id limit 1;
    if v_hunt is null or v_heavy is null then raise exception 'town-hp-whole §2-harness: no ground, or no heavy armor'; end if;
    foreach v_sig in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'town-hp-whole §2 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'town-hp-whole §2-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_sig::uuid and slot = 0;
    end loop;

    -- (a) IN TOWN, ARMOR ON: the max rises and the hero stands at it; the envelope says the same two numbers.
    v_bare := (public.hr_vitals_of(c_a, 0) ->> 'max_hp')::int;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_a, 0, 'probe_armor', v_heavy);
    v_worn := (public.hr_vitals_of(c_a, 0) ->> 'max_hp')::int;
    if v_worn <= v_bare then raise exception 'town-hp-whole §2-harness: heavy armor did not raise the max (% -> %)', v_bare, v_worn; end if;
    execute hp_of into v_hp using c_a;
    if v_hp <> v_worn then raise exception 'town-hp-whole §2(a): armor on: hp % of max %', v_hp, v_worn; end if;
    v := public.hr_state_of(c_a, 0);
    if (v->'state'->>'hp')::int <> v_worn or (v->'state'->>'max_hp')::int <> v_worn then
      raise exception 'town-hp-whole §2(a): the envelope says % of %', v->'state'->>'hp', v->'state'->>'max_hp'; end if;

    -- (b) IN TOWN, ARMOR OFF: down to the new max, never over it.
    delete from public.player_equipment where user_id = c_a and slot = 0 and equip_slot = 'probe_armor';
    execute hp_of into v_hp using c_a;
    if v_hp <> v_bare then raise exception 'town-hp-whole §2(b): armor off: hp % of max %', v_hp, v_bare; end if;

    -- (c) THE FIRST WAY OUT, ALONE: armor on in town, then Enter: the hunt starts from the full new max.
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_a, 0, 'probe_armor', v_heavy);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_enter_for(c_a, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-hp-whole §2-harness: the enter refused: %', v; end if;
    v_sa := (v->>'session_id')::uuid;
    execute hp_of into v_hp using c_a;
    if v_hp <> v_worn then raise exception 'town-hp-whole §2(c): a lone hero entered at % of %', v_hp, v_worn; end if;

    -- (d) IN A HUNT, GEAR WRITES LEAVE HP ALONE: the engine owns it until the hunt ends.
    update public.player_state set hp = 77 where user_id = c_a and slot = 0;
    delete from public.player_equipment where user_id = c_a and slot = 0 and equip_slot = 'probe_armor';
    execute hp_of into v_hp using c_a;
    if v_hp <> 77 then raise exception 'town-hp-whole §2(d): a gear write healed a hero in a hunt to %', v_hp; end if;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_a, 0, 'probe_armor', v_heavy);
    execute hp_of into v_hp using c_a;
    if v_hp <> 77 then raise exception 'town-hp-whole §2(d): armor on mid-hunt moved hp to %', v_hp; end if;

    -- (e) HOME AGAIN: the end writes full, and from there gear keeps it full.
    perform public.hr_hunt_close(v_sa, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a and slot = 0;
    execute hp_of into v_hp using c_a;
    if v_hp <> v_worn then raise exception 'town-hp-whole §2(e): home at % of %', v_hp, v_worn; end if;
    delete from public.player_equipment where user_id = c_a and slot = 0 and equip_slot = 'probe_armor';
    execute hp_of into v_hp using c_a;
    if v_hp <> v_bare then raise exception 'town-hp-whole §2(e): home, then armor off: % of %', v_hp, v_bare; end if;

    -- (f) THE SECOND WAY OUT, THE PARTY'S START: a seat that put armor on in town starts from its own full max, the leader from its own.
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_a, 0);
    perform public.hr_party_seat_into(v_pid, c_b, 0);
    update public.hunt_parties set hunt_id = v_hunt where id = v_pid;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_b, 0, 'probe_armor', v_heavy);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    v := public.hr_hunt_party_start(0, v_hunt, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-hp-whole §2-harness: the party start refused: %', v; end if;
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is null) <> 2 then
      raise exception 'town-hp-whole §2-harness: the party start opened % seat(s), want 2',
        (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is null); end if;
    execute hp_of into v_hp using c_b;
    if v_hp <> v_worn then raise exception 'town-hp-whole §2(f): the armored seat started at % of %', v_hp, v_worn; end if;
    execute hp_of into v_hp using c_a;
    if v_hp <> v_bare then raise exception 'town-hp-whole §2(f): the leader started at % of %', v_hp, v_bare; end if;

    raise exception 'town-hp-whole §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'town-hp-whole §2: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (g) No client reaches it; the trigger is the only way it runs; grant hygiene holds.
  if has_function_privilege('authenticated', 'public.hr_town_hp_whole()', 'execute')
     or has_function_privilege('anon', 'public.hr_town_hp_whole()', 'execute') then
    raise exception 'town-hp-whole §2(g): a client role can execute hr_town_hp_whole';
  end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-hp-whole: armor on or off in town keeps a hero at full, a hunt keeps its own HP, both ways out start full; all green';
end $check$;
