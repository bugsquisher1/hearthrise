-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1045-ground-presence.sql — THE PRESENCE STRIP ON A GROUND, AND QUIET PRESENCE FOR THE ACCOUNT (lane/c-social,
--   backend-architect, FB-12; MM-20 and GR-70, chapter 06 section 2.7: "Presence counts heroes, not browsers. Seen, never fought beside.
--   One list, capped. Clan mates and friends sort first, then nearest Level. A player who turns quiet presence on is left off every list").
--
-- STATUS: supabase/migration-notes/1045-ground-presence.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1041-social-clans.sql (clans.tag) and the town presence chain
--   (hr_set_presence_quiet__ungated, 2026-09-13). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4.
-- EDGE: none. THE TOWN half of presence (GR-70: heroes at work drawn whether or not their owner is online) is already the server's:
--   hr_town_view shows a body while hr_town_live_of holds (a work stand needs no owner online; 2027-01-28-town-stands.sql), quiet and blocks
--   honoured. This file adds the ground's half and one account-wide switch for quiet.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_ground_presence(p_slot int, p_hunt text) -> { ok, hunt, total, parties: [{ name, tag, size, level, friend, clan }] }   CLIENT.
--   The OTHER parties hunting p_hunt now (an open hunt session's instance is one party): total, then at most 6, each by its leader's hero
--   name, Level, clan tag and party size; friends and clan mates first, then nearest the caller's hero's Level. A party any of whose heroes
--   is quiet, any of whose accounts is blocked either way, or any not admitted is left off the list AND the total. The caller's own
--   instance is never listed. 30 a minute. Refusals: not_signed_in, bad_slot, bad_hunt, rate_limited.
-- hr_presence_quiet_set(p_slot int, p_quiet boolean) -> { ok, quiet, changed, envelope }   CLIENT. Quiet presence for the ACCOUNT: every
--   hero of it, through hr_set_presence_quiet__ungated (each change journalled once, kind presence, as before). 6 a minute. p_slot names
--   the hero on screen, one of the account's: the answer carries ITS envelope (hr_state_of, rule 11: the switch reads back from the
--   `presence` section with no second read). Refusals: not_signed_in, bad_slot, bad_intent, no_character, rate_limited.
-- hr_presence_view(p_user, p_slot) -> { quiet }   the section `presence`: true only when every hero of the account is quiet.
-- hunt_sessions_open_hunt (NEW index): the open sessions of one ground.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- The read takes no lock. The switch names an absolute value: each hero's setter locks its row and journals a change only (a replay is a
-- no-op). A second apply of this file is byte-identical.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- +2 client verbs, +1 section; nothing moves value. The strip publishes what a hunt already shows a party's members (who hunts where), to
--   any admitted player, with quiet as the opt-out and blocks either way; it names no account id and no slot.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- One indexed read of one ground's open sessions a call (the new partial index), grouped; the client asks when a ground's page opens and
--   at most once a minute while a hunt is viewed. The index costs one entry an open session.
-- REVERSIBLE: drop the two verbs, the section row and function, and the index.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_set_presence_quiet__ungated(integer,boolean)') is null or to_regclass('public.hunt_sessions') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clans' and column_name = 'tag') then
    raise exception 'PRECONDITION: the town presence chain and 1041-social-clans.sql (clans.tag) first'; end if;
end $mig$;

create index if not exists hunt_sessions_open_hunt on public.hunt_sessions (hunt_id) where ended_at is null;

-- ── §1 THE STRIP ─────────────────────────────────────────────────────────────
create or replace function public.hr_ground_presence(p_slot int, p_hunt text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_cap constant int := 6;
  v_uid uuid := auth.uid(); v_lv int; v_clan uuid; v_friends uuid[]; v_blocked uuid[]; v_total int; v_list jsonb;
begin
  -- GROUND-PRESENCE (1045-ground-presence.sql): MM-20. Seen, never fought beside.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then return jsonb_build_object('ok', false, 'error', 'bad_hunt'); end if;
  if not public.hr_rate_ok(v_uid, 'presence:ground', 30, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_lv := coalesce(public.hr_level_of(v_uid, p_slot), 1);
  v_clan := (select m.clan_id from public.clan_members m where m.user_id = v_uid);
  v_friends := array(select case when f.user_lo = v_uid then f.user_hi else f.user_lo end from public.friend_links f where f.user_lo = v_uid or f.user_hi = v_uid);
  v_blocked := array(select b.blocked_id from public.chat_blocks b where b.blocker_id = v_uid
                     union select b.blocker_id from public.chat_blocks b where b.blocked_id = v_uid);
  with s as (
    select h.user_id, h.slot, coalesce(h.instance_id, h.id) as g
      from public.hunt_sessions h where h.hunt_id = p_hunt and h.ended_at is null),
  grp as (
    select s.g, count(*)::int as size,
           bool_or(coalesce(ps.presence_quiet, false)) as quiet,
           bool_or(s.user_id = v_uid) as mine,
           bool_or(s.user_id = any (v_blocked)) as blocked,
           bool_or(not public.hr_admitted(s.user_id)) as hidden,
           bool_or(s.user_id = any (v_friends)) as friend,
           bool_or(v_clan is not null and exists (select 1 from public.clan_members m where m.user_id = s.user_id and m.clan_id = v_clan)) as mate,
           (array_agg(s.user_id order by s.user_id, s.slot))[1] as u0,
           (array_agg(s.slot order by s.user_id, s.slot))[1] as s0
      from s left join public.player_state ps on ps.user_id = s.user_id and ps.slot = s.slot
     group by s.g),
  shown as (
    select g.*, coalesce(p.leader_user, g.u0) as lu, coalesce(p.leader_slot, g.s0) as ls
      from grp g
      left join lateral (select pa.leader_user, pa.leader_slot from public.hunt_party_members m
                           join public.hunt_parties pa on pa.id = m.party_id and pa.closed_at is null
                          where m.user_id = g.u0 and m.slot = g.s0 limit 1) p on true
     where not g.mine and not g.quiet and not g.blocked and not g.hidden),
  ranked as (
    select sh.*, coalesce(public.hr_level_of(sh.lu, sh.ls), 1) as lv from shown sh)
  select (select count(*)::int from ranked),
         (select coalesce(jsonb_agg(jsonb_build_object('name', left(public.hr_character_name(r.lu, r.ls), 24),
                                    'tag', (select c.tag from public.clan_members m join public.clans c on c.id = m.clan_id where m.user_id = r.lu),
                                    'size', r.size, 'level', r.lv, 'friend', r.friend, 'clan', r.mate)
                         order by (r.friend or r.mate) desc, abs(r.lv - v_lv), r.lv desc, r.g), '[]'::jsonb)
            from (select * from ranked order by (friend or mate) desc, abs(lv - v_lv), lv desc, g limit c_cap) r)
    into v_total, v_list;
  return jsonb_build_object('ok', true, 'hunt', p_hunt, 'total', v_total, 'parties', v_list);
end $fn$;

-- ── §2 QUIET PRESENCE FOR THE ACCOUNT ────────────────────────────────────────
create or replace function public.hr_presence_quiet_set(p_slot int, p_quiet boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_slot int; v jsonb; v_changed boolean := false;
begin
  -- GROUND-PRESENCE (1045-ground-presence.sql): one switch for every hero of the account (MM-20: "a player who turns it on"). The answer
  -- carries the envelope of p_slot, the hero on screen (rule 11): the switch reads back from its `presence` section, no second read.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_quiet is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'presence:quiet', 6, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  for v_slot in select ps.slot from public.player_state ps where ps.user_id = v_uid order by ps.slot loop
    v := public.hr_set_presence_quiet__ungated(v_slot, p_quiet);
    if coalesce(v->>'ok', '') <> 'true' then return jsonb_build_object('ok', false, 'error', coalesce(v->>'error', 'refused')); end if;
    v_changed := v_changed or coalesce((v->>'changed')::boolean, false);
  end loop;
  return jsonb_build_object('ok', true, 'quiet', p_quiet, 'changed', v_changed, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_presence_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- GROUND-PRESENCE (1045-ground-presence.sql): quiet only when every hero of the account is. plpgsql, not sql: PostgreSQL 17 plans a
  -- SET-clause SQL body again on every call, and hr_state_of reads this section every envelope (tests/settle-budget.mjs SB-3).
  return (select jsonb_build_object('quiet', coalesce(bool_and(coalesce(ps.presence_quiet, false)), false))
            from public.player_state ps where ps.user_id = p_user);
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('presence', 'hr_presence_view', '1045-ground-presence.sql: quiet presence for the account (every hero quiet), MM-20')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_ground_presence(integer,text)', 'public.hr_presence_quiet_set(integer,boolean)'] loop
    execute format('revoke all on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
  revoke all on function public.hr_presence_view(uuid, integer) from public, anon, authenticated, service_role;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_ground_presence', 'hr_presence_quiet_set');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_ground_presence', 'p_slot integer, p_hunt text', 'authenticated',
   'added 1045-ground-presence (FB-12, MM-20): the other parties hunting a ground, by leader name, Level, clan tag and size, capped at 6; quiet, blocked and not-admitted parties left off; 30/min; moves no value'),
  ('hr_presence_quiet_set', 'p_slot integer, p_quiet boolean', 'authenticated',
   'added 1045-ground-presence (FB-12, MM-20): quiet presence for every hero of the account (hr_set_presence_quiet__ungated each, journalled on change); answers with the envelope of p_slot, the hero on screen (rule 11); 6/min; moves no value');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────
-- (a) the grants; the section; the index
-- (b) THE STRIP: A reads B's party (a friend) and C's; C turns quiet for its account and leaves the list and the total; D, whom A blocked,
--     is never on it; A's own party is never on it; a friend sorts first. C's switch answers with its hero's envelope, already quiet, and
--     refuses a slot the account holds no hero in
do $$
declare
  c_u constant uuid[] := array['000000c0-0000-4000-a000-0000a2e50001', '000000c0-0000-4000-a000-0000a2e50002',
                               '000000c0-0000-4000-a000-0000a2e50003', '000000c0-0000-4000-a000-0000a2e50004']::uuid[];
  k constant text := '000000c0-0000-4000-b000-0000a2e500';
  c_hunt constant text := 'mill_cellar'; c_food constant text := 'cooked_shrimp';
  v jsonb; v_i int; v_sig text;
begin
  foreach v_sig in array array['public.hr_ground_presence(integer,text)', 'public.hr_presence_quiet_set(integer,boolean)'] loop
    if not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') or has_function_privilege('anon', v_sig::regprocedure, 'execute') then
      raise exception 'ground-presence §3(a): % is not authenticated''s alone', v_sig; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.hr_presence_view(uuid,integer)', 'execute')
     or (select fn from public.hr_state_sections where key = 'presence') is distinct from 'hr_presence_view'
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'hunt_sessions_open_hunt') then
    raise exception 'ground-presence §3(a): the section, its grant or the index is wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  if not exists (select 1 from public.hr_hunt_grounds where hunt_id = c_hunt) or not exists (select 1 from public.hr_hunt_supplies where item_id = c_food) then
    raise exception 'ground-presence §3: the Mill Cellar or its food is not in the catalogue'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 4 loop
      insert into auth.users (id) values (c_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (c_u[v_i], 'Probe Strip ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (c_u[v_i], 'ground-presence §3') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', c_u[v_i]::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'ground-presence §3: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u[v_i];
      delete from public.player_inventory where user_id = c_u[v_i];
      insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u[v_i], 0, c_food, 20);
      delete from public.hr_rate_counters where user_id = c_u[v_i];
      v := public.hr_hunt_enter(0, c_hunt, jsonb_build_array(jsonb_build_object('item', c_food, 'qty', 20)), 0, null, (k || '0' || v_i)::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'ground-presence §3: hero % could not enter: %', v_i, v; end if;
    end loop;
    insert into public.friend_links (user_lo, user_hi) values (least(c_u[1], c_u[2]), greatest(c_u[1], c_u[2])) on conflict do nothing;
    insert into public.chat_blocks (blocker_id, blocked_id) values (c_u[1], c_u[4]) on conflict do nothing;
    -- (b)
    perform set_config('request.jwt.claim.sub', c_u[1]::text, true);
    v := public.hr_ground_presence(0, c_hunt);
    if coalesce(v->>'ok', '') <> 'true' or v->'parties'->0->>'name' is distinct from public.hr_character_name(c_u[2], 0) or not (v->'parties'->0->>'friend')::boolean
       or not exists (select 1 from jsonb_array_elements(v->'parties') p where p->>'name' = public.hr_character_name(c_u[3], 0))
       or exists (select 1 from jsonb_array_elements(v->'parties') p where p->>'name' in (public.hr_character_name(c_u[1], 0), public.hr_character_name(c_u[4], 0))) then
      raise exception 'ground-presence §3(b): the strip read %', v; end if;
    perform set_config('request.jwt.claim.sub', c_u[3]::text, true);
    if public.hr_presence_quiet_set(1, true)->>'error' is distinct from 'no_character' or public.hr_presence_quiet_set(null, true)->>'error' is distinct from 'bad_slot' then
      raise exception 'ground-presence §3(b): the switch carried a hero the account does not hold'; end if;
    v := public.hr_presence_quiet_set(0, true);
    if coalesce(v->>'ok', '') <> 'true' or not (public.hr_presence_view(c_u[3], 0)->>'quiet')::boolean then raise exception 'ground-presence §3(b): quiet read %', v; end if;
    -- rule 11: the answer IS the hero's envelope, already quiet (the client takes it like a load, no second read)
    if v->'envelope'->>'ok' is distinct from 'true' or (v->'envelope'->'presence'->>'quiet') is distinct from 'true' then
      raise exception 'ground-presence §3(b): the switch did not answer with the hero''s quiet envelope: %', left((v->'envelope')::text, 200); end if;
    perform set_config('request.jwt.claim.sub', c_u[1]::text, true);
    v := public.hr_ground_presence(0, c_hunt);
    if exists (select 1 from jsonb_array_elements(v->'parties') p where p->>'name' = public.hr_character_name(c_u[3], 0))
       or (v->>'total')::int <> (select count(*) from jsonb_array_elements(v->'parties')) then
      raise exception 'ground-presence §3(b): a quiet party is still on the strip or in its total: %', v; end if;
    if public.hr_ground_presence(0, 'Bad Hunt')->>'error' is distinct from 'bad_hunt' then raise exception 'ground-presence §3(b): a bad hunt id was read'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR927', message = 'ground-presence §3 complete - rolling back';
  exception when sqlstate 'HR927' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hunt_sessions where user_id = any (c_u)) or exists (select 1 from public.player_state where user_id = any (c_u)) then
    raise exception 'ground-presence §3: LEAKED a probe row'; end if;
  raise notice 'ground-presence: the strip lists other parties, friends first, with quiet, blocks and the caller''s own party left off';
end $$;
