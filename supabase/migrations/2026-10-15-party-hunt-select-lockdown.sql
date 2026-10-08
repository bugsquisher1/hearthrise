-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-15-party-hunt-select-lockdown.sql — NO CLIENT READS party_hunt
--   DIRECTLY: THE CO-MEMBER UUID IN stopped_by NEVER REACHES A CLIENT.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C (lane/b568-party-hunt-view),
-- Security GO-WITH-CHANGES #2 on 2026-10-15-party-hunt-view.sql. The
-- Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). MUST be applied BEFORE the party
-- channel is armed on prod. CHAIN POSITION: after 2026-10-15-party-hunt-view.sql
-- (the read that replaces the table policy). DB-only: no edge or client half.
--
-- WHY. 2026-09-23-m8-parties-s2-1-hunt-tables.sql granted `select` on
-- public.party_hunt to `authenticated` under the policy "party hunt readable by
-- live members". hr_party_tick_settle ends a hunt it cannot pay with
-- stopped_by = 'member_unpayable:' || <user uuid>, so through PostgREST a live
-- member could read a CO-MEMBER'S auth.users id — Security E2 says no client
-- ever holds one (a stable cross-account handle that survives a rename).
-- hr_party_hunt_view (the previous file) is now the only client read of a hunt
-- and cuts stopped_by at ':'; the direct door is closed here. Prod had 0
-- party_hunt rows when this was written, so the leak is latent, not live.
--
-- WHAT IT DOES:
--   drop policy "party hunt readable by live members" on public.party_hunt;
--   revoke select on public.party_hunt from anon, authenticated;
-- RLS stays ENABLED (s2-1), so with no policy and no privilege a client read
-- is refused twice: 42501 by privilege, and zero rows by RLS if a grant ever
-- came back. Every server path reads the table SECURITY DEFINER (hr_partied,
-- hr_party_roster, hr_party_tick_settle, the hunt verbs, the reaper,
-- hr_party_hunt_view), which §4(c) asserts by catalogue.
--
-- GREP PROOF (lane, 2026-10-15; re-run on every push by
-- tests/party-hunt-select-lockdown.mjs P-GREP): in src/** and
-- supabase/functions/** every occurrence of `party_hunt` as a table name is in
-- a comment (tick.js:571, tick-party.js:58/269/469, party-fence.js:27); there
-- is no `.from('party_hunt')` and no `/rest/v1/party_hunt` anywhere. The edge
-- role hr_engine holds no table privilege at all (hr_assert_grant_hygiene).
--
-- EXPLOIT SURFACE DELTA: strictly narrower — one client SELECT path removed.
-- CONCURRENCY: none (catalogue only). IDEMPOTENT: drop-if-exists + revoke; a
-- second apply is byte-identical. COST: none.
-- REVERSIBILITY: re-execute s2-1 §2's `grant select ... to authenticated` and
-- its create policy — which re-opens the uuid leak, so don't.
-- ⚠ AFTER APPLYING: no tracked body moves; schema-drift loses one policy.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regclass('public.party_hunt') is null then
    raise exception 'PRECONDITION: public.party_hunt is absent — apply the M8 S2 chain first'; end if;
  if to_regprocedure('public.hr_party_hunt_view(integer)') is null then
    raise exception 'PRECONDITION: hr_party_hunt_view is absent — apply 2026-10-15-party-hunt-view.sql first: it is the read this file''s closed door is replaced by'; end if;
end $mig$;

drop policy if exists "party hunt readable by live members" on public.party_hunt;
revoke select on public.party_hunt from anon, authenticated;

-- ── §4 SELF-CHECK — asserted by EXECUTION; every fixture row rolled back ────
-- (a) zero policies on party_hunt, RLS still enabled
-- (b) no client or engine role holds ANY privilege on party_hunt
-- (c) no client-executable function reads party_hunt as SECURITY INVOKER
-- (d) a live member reading party_hunt as `authenticated` is refused 42501,
--     and the same member's hr_party_hunt_view still answers their hunt
-- (e) grant hygiene green
do $chk$
declare
  v_a constant uuid := '00000000-0000-4000-c000-0000f7a01601';
  v_b constant uuid := '00000000-0000-4000-c000-0000f7a01602';
  v_party uuid; v_cact text; v_r jsonb; v_state text; v_n int; t text;
begin
  -- (a)
  if exists (select 1 from pg_policy where polrelid = 'public.party_hunt'::regclass) then
    raise exception 'party-hunt-select-lockdown §4 k-policy: party_hunt still carries a policy: %',
      (select string_agg(polname, ', ') from pg_policy where polrelid = 'public.party_hunt'::regclass); end if;
  if not (select relrowsecurity from pg_class where oid = 'public.party_hunt'::regclass) then
    raise exception 'party-hunt-select-lockdown §4 k-policy: RLS is off on party_hunt'; end if;
  -- (b)
  foreach t in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = t)
       and has_table_privilege(t, 'public.party_hunt', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'party-hunt-select-lockdown §4 k-priv: % holds a privilege on party_hunt', t; end if;
  end loop;
  -- (c)
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef
     and p.prosrc ~ 'party_hunt([^_a-z]|$)'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));
  if v_n <> 0 then
    raise exception 'party-hunt-select-lockdown §4 k-invoker: % client-executable SECURITY INVOKER function(s) read party_hunt and would break', v_n; end if;

  -- (d)
  begin
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    insert into auth.users (id) values (v_a), (v_b);
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    select u, 0, 0, 0, 10, 10, 1, now() from unnest(array[v_a, v_b]) u;
    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role)
    values (v_party, v_a, 0, 'leader'), (v_party, v_b, 0, 'member');
    insert into public.party_hunt (party_id, active_id, accrued_to, ended_at, stopped_by)
    values (v_party, coalesce(v_cact, 'x'), now(), now(), 'member_unpayable:' || v_b::text);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_state := null;
    begin
      set local role authenticated;
      perform count(*) from public.party_hunt;
      reset role;
    exception when insufficient_privilege then
      reset role;
      v_state := '42501';
    end;
    if v_state is distinct from '42501' then
      raise exception 'party-hunt-select-lockdown §4 k-read: a live member READ party_hunt directly (stopped_by carries a co-member uuid)'; end if;
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    if coalesce(v_r->>'ok', '') <> 'true' or v_r#>>'{hunt,stopped_by}' is distinct from 'member_unpayable' then
      raise exception 'party-hunt-select-lockdown §4 k-read: hr_party_hunt_view no longer answers the member''s hunt: %', v_r; end if;
    raise exception using errcode = 'HR953', message = 'party-hunt-select-lockdown §4 complete — rolling back';
  exception when sqlstate 'HR953' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'party-hunt-select-lockdown §4: the self-check LEAKED a fixture row'; end if;

  -- (e)
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-hunt-select-lockdown: party_hunt has zero policies and no client privilege; no invoker reads it; a member is refused 42501 and still reads their hunt through hr_party_hunt_view';
end $chk$;
