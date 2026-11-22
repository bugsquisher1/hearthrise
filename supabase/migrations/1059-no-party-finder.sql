-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1059-no-party-finder.sql — THE PARTY FINDER IS GONE: ITS READ, THE LISTING SWITCH, THE JOIN BY LISTING,
--   "LOOK FOR A PARTY HERE" AND THE COLUMNS AND TABLE THEY KEPT (lane/r11-no-party-finder, systems-engineer, FB-12; GR-69 of
--   2026-11-21: no live party finder; docs/design/redesign/11-build-audit.md R11).
--
-- STATUS: supabase/migration-notes/1059-no-party-finder.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none (hr-accrue calls none of these). CLIENT: the build without the finder (this lane) should land first or with it;
--   a page from an older build that presses Search, the listing switch or Join gets PostgREST's "no such function" and the
--   window says it in words (refusal-words.js), nothing else breaks. No value moves: no gold, item or XP is touched.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- DROPPED (client verbs, each off hr_client_rpc_baseline and the Game Master's door list hr_gm_wall_allow):
--   hr_hunt_party_finder(int,text,text)          the finder's read (2026-10-23-hunt-party.sql, last 2027-02-18-party-truth.sql)
--   hr_hunt_party_list(int,boolean,uuid,text)    the leader's listing switch (2026-12-07-party-finder.sql)
--   hr_hunt_party_join(int,uuid,uuid)            a seat in a LISTED party by its id (2026-10-29-party-security.sql): with no
--                                                listing there is nothing it can join; an invite's seat is hr_hunt_party_accept's
--   hr_party_seek(int,text,boolean,uuid)         "look for a party here" (2026-12-07-party-finder.sql), and its helpers
--   hr_party_seek_view, hr_party_seek_end, hr_party_seek_live, hr_party_seek_ttl, the two hr_party_seek_end triggers, the
--   `party_seek` envelope section, and the table party_seekers (its hr_gm_wall trigger goes with it).
--   hunt_parties.listed and hunt_parties.listed_at, and the two Game Master triggers that fired on `listed`
--   (hr_gm_wall_list, hr_gm_wall_relist, 2027-03-13-gm-tools.sql): a walled hero can no longer list anything.
-- RESTATED BY AN ANCHORED SPLICE (one site each, the rest of each body byte for byte as the chain left it):
--   hr_hunt_party_view     no `listed` key (the client read it only for the finder's switch)
--   hr_party_alone         a lone seat waits for no listing (a hunt or a live invite still keeps the party)
--   hr_hunt_party_accept   calls the 3-argument join
-- RESTATED WHOLE: hr_party_join_for(uuid,int,uuid), the 4-argument body without p_need_listed and its not_listed refusal; the
--   4-argument one is dropped.
-- KEPT: invites (by name, by a player menu, an account's own heroes), accept / decline, leave, kick, disband, start, hold, warn.
--   FB-12's social layer (1040-1045: clans, Global, the friend link, ground presence) is untouched.
--
-- ── WHAT CROSSES TO ANOTHER PLAYER (CLAUDE.md §1) ─────────────────────────────
-- Less than before: the finder read named other players' heroes, levels and weapons; it is gone. A party is now reached only
-- through an invite its leader sent.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- DDL in one transaction: the drops and column drops take ACCESS EXCLUSIVE on hunt_parties, hunt_party_members, hunt_sessions
-- and party_seekers for the length of the apply (milliseconds; a settle in flight waits, as for any migration touching them).
-- The restated bodies take the same locks as before.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- −4 client verbs (one read that listed other players, three writes). −1 table. No new grant.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- The party view builds one key fewer per settle; the finder's 50-row read and the seek table's trigger on every hunt start and
-- every seat taken are gone.
--
-- REVERSIBLE: re-apply 2026-12-07-party-finder.sql's §1 (party_seekers, the seek functions and triggers, the section) and its
--   hr_hunt_party_list, 2027-02-18-party-truth.sql's hr_hunt_party_finder and hr_party_join_for, 2026-10-29-party-security.sql's
--   hr_hunt_party_join and hr_hunt_party_accept, the gm-tools triggers, the columns (listed boolean not null default false,
--   listed_at timestamptz) and the baseline rows. No player row is lost but a listing flag and a 30-minute seek.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hunt_parties') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: the party chain, the RPC baseline or the envelope sections are missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_party_view(uuid,integer)', '3457eceb61842396d1ad70b287578cae', 'c88adbee1f77556025bfea0ddf2c6c11'),
    ('public.hr_party_alone(uuid,uuid,integer)', '74cb86e98dc487edfb7e4cd090ef27f0', 'a74d45e612005ad3d01609f3cac60474'),
    ('public.hr_hunt_party_accept(integer,uuid,uuid)', '5b00f9a8aceb887c7e4752f5312e80ef', '69b3144a072705e7c3e08b33533d2a38')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin',
        v_r.fn, v_r.pre, v_r.post, v_md5; end if;
  end loop;
  -- the join: the 4-argument image this file splices, or (a second apply) only this file's 3-argument one
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_party_join_for(uuid,integer,uuid,boolean)');
  if v_md5 is not null and v_md5 <> '2330405f586dce653802866ec2d9d497' then
    raise exception 'PIN: hr_party_join_for(uuid,int,uuid,bool) is not the 2027-02-18 party-truth image (2330405f...): md5 %', v_md5; end if;
  if v_md5 is null and (select md5(replace(prosrc, chr(13), '')) from pg_proc
                         where oid = to_regprocedure('public.hr_party_join_for(uuid,integer,uuid)')) is distinct from '7938f2364c7f6a80399705ce1765b918' then
    raise exception 'PIN: neither hr_party_join_for(uuid,int,uuid,bool) nor this file''s 3-argument one (7938f236...) exists'; end if;
end $mig$;

-- ── §1 THE JOIN NEEDS NO LISTING ─────────────────────────────────────────────
-- RESTATED WHOLE (2027-02-18-party-truth.sql's 4-argument body, pinned in §0, with its p_need_listed argument and its one listing
-- line gone; every other line as it was). The seat writer every accepted invite goes through; accept calls it (§2).
create or replace function public.hr_party_join_for(p_uid uuid, p_slot integer, p_party uuid)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_p public.hunt_parties%rowtype; v_own uuid;
begin
  -- NO-PARTY-FINDER (1059-no-party-finder.sql): a seat is an accepted invite; there is no listing to check.
  if p_party is null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): both parties, in id order: two friends' crossing Joins never deadlock.
  v_own := public.hr_hunt_party_of(p_uid, p_slot);
  perform 1 from public.hunt_parties where id in (p_party, v_own) order by id for update;
  select * into v_p from public.hunt_parties where id = p_party;
  if not found or v_p.closed_at is not null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  v_s := public.hr_hunt_lock(p_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = p_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;
  v_own := public.hr_hunt_party_of(p_uid, p_slot);
  -- A PARTY OF ONE GIVES WAY: sending an invite made it, and nobody is in it but this hero. With anyone else in it, it stays.
  if v_own is not null and (v_own = p_party or exists (select 1 from public.hunt_party_members m where m.party_id = v_own
                                                         and (m.user_id, m.slot) is distinct from (p_uid, p_slot))) then
    return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;
  if exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_uid
               and public.hr_social_blocked(p_uid, m.user_id)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) >= v_p.max_size then
    return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
  if v_own is not null then perform public.hr_party_drop(v_own, p_uid, p_slot); end if;
  perform public.hr_party_seat_into(p_party, p_uid, p_slot);
  return jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(p_uid, p_slot));
end $$;
revoke execute on function public.hr_party_join_for(uuid, int, uuid) from public, anon, authenticated, service_role;

-- ── §2 THE READERS, ONE ANCHORED SPLICE A SITE ───────────────────────────────
-- Each anchor and its replacement are dollar-quoted, so the text a body holds after the splice is written here verbatim.
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$    'listed', coalesce(v_p.listed, false), 'leader_tiers', coalesce(v_ltier, '{}'::jsonb),$a$,
     $b$    'leader_tiers', coalesce(v_ltier, '{}'::jsonb),$b$),
    ('public.hr_party_alone(uuid,uuid,integer)',
     $a$no invite inside its hour, not listed.
  select coalesce((
    select case when c.n = 0 then true
                else c.n = 1 and not p.listed
$a$,
     $b$no invite inside its hour (NO-PARTY-FINDER, 1059: no listing to wait for).
  select coalesce((
    select case when c.n = 0 then true
                else c.n = 1
$b$),
    ('public.hr_hunt_party_accept(integer,uuid,uuid)',
     $a$  v_j := public.hr_party_join_for(v_uid, p_slot, v_i.party_id, false);$a$,
     $b$  v_j := public.hr_party_join_for(v_uid, p_slot, v_i.party_id);$b$)) t(fn, find, repl) loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the body already holds the replacement (its post pin, §0) and the old text is gone
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;
    if v_n <> 1 then raise exception 'SPLICE: % holds its anchor % times, want 1', v_r.fn, v_n; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;
drop function if exists public.hr_party_join_for(uuid, integer, uuid, boolean);

-- ── §3 THE FINDER GOES ───────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline
 where proname in ('hr_hunt_party_finder', 'hr_hunt_party_list', 'hr_hunt_party_join', 'hr_party_seek');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    delete from public.hr_gm_wall_allow where rpc in ('hr_hunt_party_finder', 'hr_hunt_party_list', 'hr_hunt_party_join', 'hr_party_seek');
  end if;
end $mig$;
delete from public.hr_state_sections where key = 'party_seek';
drop trigger if exists hr_party_seek_end_join on public.hunt_party_members;
drop trigger if exists hr_party_seek_end_hunt on public.hunt_sessions;
drop trigger if exists hr_gm_wall_list on public.hunt_parties;
drop trigger if exists hr_gm_wall_relist on public.hunt_parties;
drop function if exists public.hr_hunt_party_finder(integer, text, text);
drop function if exists public.hr_hunt_party_list(integer, boolean, uuid, text);
-- every overload, by name: the 3-argument one went in 2026-12-07-party-finder.sql, but files after it still pin it
-- (tests/live-hash-drift.mjs counts a pin as a build), so the chain says here that no hr_hunt_party_list remains.
drop function if exists public.hr_hunt_party_list(integer, boolean, uuid);
drop function if exists public.hr_hunt_party_join(integer, uuid, uuid);
drop function if exists public.hr_party_seek(integer, text, boolean, uuid);
drop function if exists public.hr_party_seek_end();
drop function if exists public.hr_party_seek_view(uuid, integer);
drop function if exists public.hr_party_seek_live(uuid, timestamptz, timestamptz);
drop function if exists public.hr_party_seek_ttl();
drop table if exists public.party_seekers;
alter table public.hunt_parties drop column if exists listed_at;
alter table public.hunt_parties drop column if exists listed;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- (a) the shape: every dropped name is gone (functions, table, columns, triggers, baseline, door list, section); the join is
--     3-argument and nobody's; no public body names a dropped thing; the RPC surface agrees with the baseline
-- (b) the path that stays: A invites B (another account) by name, B accepts, both sit in one party; the party view carries no
--     `listed`; A leaves and the seat left alone is closed (nothing to wait for)
-- (c) a live invite still keeps a party of one open through the sweep
do $chk$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-0000f1d10001';
  c_b constant uuid := '000000c0-0000-4000-a000-0000f1d10002';
  k   constant text := '000000c0-0000-4000-a000-0000f1d1';
  v jsonb; v_pid uuid; v_u uuid; v_sig text; v_bad text;
begin
  -- (a)
  foreach v_sig in array array['public.hr_hunt_party_finder(integer,text,text)', 'public.hr_hunt_party_list(integer,boolean,uuid,text)',
      'public.hr_hunt_party_list(integer,boolean,uuid)', 'public.hr_hunt_party_join(integer,uuid,uuid)',
      'public.hr_party_seek(integer,text,boolean,uuid)', 'public.hr_party_seek_end()', 'public.hr_party_seek_view(uuid,integer)',
      'public.hr_party_seek_live(uuid,timestamp with time zone,timestamp with time zone)', 'public.hr_party_seek_ttl()',
      'public.hr_party_join_for(uuid,integer,uuid,boolean)'] loop
    if to_regprocedure(v_sig) is not null then raise exception 'no-party-finder §4(a): % still exists', v_sig; end if;
  end loop;
  if to_regclass('public.party_seekers') is not null then raise exception 'no-party-finder §4(a): party_seekers still exists'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_parties'
               and column_name in ('listed', 'listed_at')) then
    raise exception 'no-party-finder §4(a): hunt_parties still has a listing column'; end if;
  if exists (select 1 from pg_trigger where not tgisinternal
               and tgname in ('hr_party_seek_end_join', 'hr_party_seek_end_hunt', 'hr_gm_wall_list', 'hr_gm_wall_relist')) then
    raise exception 'no-party-finder §4(a): a finder trigger is still armed'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline
               where proname in ('hr_hunt_party_finder', 'hr_hunt_party_list', 'hr_hunt_party_join', 'hr_party_seek')) then
    raise exception 'no-party-finder §4(a): a dropped verb is still on hr_client_rpc_baseline'; end if;
  if to_regclass('public.hr_gm_wall_allow') is not null and exists (select 1 from public.hr_gm_wall_allow
       where rpc in ('hr_hunt_party_finder', 'hr_hunt_party_list', 'hr_hunt_party_join', 'hr_party_seek')) then
    raise exception 'no-party-finder §4(a): a dropped verb is still on the Game Master''s door list'; end if;
  if exists (select 1 from public.hr_state_sections where key = 'party_seek' or fn like 'hr\_party\_seek%') then
    raise exception 'no-party-finder §4(a): the party_seek section is still in the envelope'; end if;
  if to_regprocedure('public.hr_party_join_for(uuid,integer,uuid)') is null then
    raise exception 'no-party-finder §4(a): the 3-argument join is missing'; end if;
  if has_function_privilege('anon', 'public.hr_party_join_for(uuid,integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_party_join_for(uuid,integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_party_join_for(uuid,integer,uuid)', 'execute') then
    raise exception 'no-party-finder §4(a): the join helper is reachable by a client'; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.prosrc ~ 'party_seekers|hr_party_seek|hr_hunt_party_finder|hr_hunt_party_list|hr_hunt_party_join\M|p_need_listed'
          or p.prosrc ~ '\m(p|v_p|new|old|x)\.listed(_at)?\M');
  if v_bad is not null then raise exception 'no-party-finder §4(a): a body still names the finder: %', v_bad; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- (b)
    foreach v_u in array array[c_a, c_b] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Unlisted ' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'no-party-finder §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'no-party-finder §4-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u, 0, now()) on conflict (user_id) do update set seen_at = now();
      delete from public.hr_rate_counters where user_id = v_u;
    end loop;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Unlisted 2', (k || 'b001')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    if v_pid is null then raise exception 'no-party-finder §4(b): an invite by name made no party: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_b, 0)->'party_invites'->0->>'id')::uuid, (k || 'b002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(c_b, 0) is distinct from v_pid then
      raise exception 'no-party-finder §4(b): the accepted invite answered %', v; end if;
    if v->'party' ? 'listed' or public.hr_hunt_party_view(c_a, 0) ? 'listed' then
      raise exception 'no-party-finder §4(b): the party view still says listed'; end if;
    if public.hr_state_of(c_b, 0) ? 'party_seek' then raise exception 'no-party-finder §4(b): the envelope still carries party_seek'; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_leave(0, (k || 'b003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'no-party-finder §4-harness: the leave answered %', v; end if;
    if public.hr_hunt_party_of(c_b, 0) is not null or (select closed_at from public.hunt_parties where id = v_pid) is null then
      raise exception 'no-party-finder §4(b): the seat a leave left alone is still in a party'; end if;

    -- (c)
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    v := public.hr_hunt_party_invite(0, 'Probe Unlisted 2', (k || 'b004')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    perform public.hr_hunt_party_sweep(1000);
    if v_pid is null or public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then
      raise exception 'no-party-finder §4(c): a party of one with a live invite was closed'; end if;
    raise exception 'no-party-finder §4: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'no-party-finder §4: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'no-party-finder: the finder, the listing, the join by listing and the seek are gone; invites seat and close as before; all green';
end $chk$;
