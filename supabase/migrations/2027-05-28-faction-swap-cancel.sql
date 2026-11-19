-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-28-faction-swap-cancel.sql — A STARTED SWAP CAN BE CANCELLED (lane/b-factions-open, systems-engineer, 2026-11-19; the blind
--   faction QA 2026-11-19, lane/qa-factions-open 6d0f89579, finding 4: "a swap is one press with no confirm and no cancel. Once started, the
--   only way out is 10 h on the other side's grounds").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4. ON THE EA SECURITY LIST with the faction verbs (a cosmetic surface; no value moves). ORDER: after
-- 2027-04-22-faction-standing.sql and 2027-04-23-faction-section.sql (§0 refuses without them), BEFORE 2027-05-27-arm-factions.sql.
-- It must be applied BEFORE the client that offers Cancel ships (v0.2.142: the Faction tab's Cancel swap press sends this verb; while the
-- `factions` switch is on for the QA account alone, a missing verb would answer that account only).
-- EDGE: none (the settle's credit reads swap_to and swap_ms, which this file clears; no engine module moves).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- (1) hr_faction_ledger's kind CHECK gains 'swap_cancel' (dropped and added by name: a second apply ends on the same constraint).
-- (2) hr_faction_swap_cancel(p_slot, p_idem) NEW, authenticated: under the hero's lock (hr_faction_locked: the key replayed, the hero,
--     the `factions` switch, the catalogue), a member with an open swap gets it cleared (swap_to, swap_at null, swap_ms 0). The swap's
--     credited time is LOST (the press says so before it is sent) and changed_at does not move: the week's wait still counts from the last
--     change of side, so a cancelled swap neither shortens nor restarts it. One journal row (kind swap_cancel, the side it was going to and
--     the swap time given up), the receipt under the key. Refuses not_member, no_swap.
-- (3) its hr_client_rpc_baseline row.
-- Nothing else moves: no table, no standing, no claim, no other body.
--
-- ── CONCURRENCY AND IDEMPOTENCY ──────────────────────────────────────────────
-- The verb runs under hr_hunt_lock(user, slot), as every faction verb and the settle do, so a settle crediting swap time and a cancel are
-- ordered: either the credit lands on the open swap and the cancel then clears it, or the cancel lands first and the credit finds no swap.
-- A second press of one key answers the first's receipt (hr_intent_replay, before and under the lock). Every statement is create or
-- replace, drop if exists then add, delete then insert by name: a second apply ends byte-identical.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- One authenticated verb taking a slot and a key, no number. It can only clear the caller's own open swap: no standing, claim, side or
-- clock moves, so a cancel buys nothing a player could not get by never starting the swap. A start, cancel, start loop is bounded by
-- hr_rpc_gate('outfit') and journals each step.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Per press: the lock, one member read and update, one ledger row, one receipt. Nothing per settle or per envelope.
--
-- REVERSIBILITY: drop the function and its baseline row, restore the CHECK without 'swap_cancel' (only once no swap_cancel row exists:
-- the ledger is append-only). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_faction_members') is null or to_regclass('public.hr_faction_ledger') is null
     or to_regprocedure('public.hr_faction_done(uuid,integer,uuid,text,text,text,text,bigint,bigint)') is null
     or to_regprocedure('public.hr_faction_swap_start(integer,text,uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-04-22-faction-standing.sql first'; end if;
  if strpos(pg_get_functiondef('public.hr_faction_locked(text,uuid,integer,uuid,text)'::regprocedure), 'hr_feature_on(''factions'', p_uid)') = 0 then
    raise exception 'PRECONDITION: apply 2027-04-23-faction-section.sql first (the faction verbs'' switch door)'; end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: no hr_client_rpc_baseline'; end if;
end $mig$;

-- ── §1 THE JOURNAL TAKES A CANCEL ────────────────────────────────────────────
alter table public.hr_faction_ledger drop constraint if exists hr_faction_ledger_kind_check;
alter table public.hr_faction_ledger add constraint hr_faction_ledger_kind_check
  check (kind in ('join', 'swap_start', 'swap_finish', 'claim', 'swap_cancel'));

-- ── §2 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_faction_swap_cancel(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_cancel';
  v_uid uuid := auth.uid(); v_r jsonb; m public.hr_faction_members%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_members x where x.user_id = v_uid and x.slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if m.swap_to is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_swap')); end if;
  -- THE SWAP GOES, ITS TIME WITH IT; the side and changed_at (the week's start) stay as they were.
  update public.hr_faction_members set swap_to = null, swap_at = null, swap_ms = 0 where user_id = v_uid and slot = p_slot;
  return public.hr_faction_done(v_uid, p_slot, p_idem, c_verb, 'swap_cancel', m.swap_to, null, null, m.swap_ms);
end $fn$;
revoke execute on function public.hr_faction_swap_cancel(int, uuid) from public, anon, service_role;
grant  execute on function public.hr_faction_swap_cancel(int, uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_faction_swap_cancel(int, uuid) from hr_engine;
  end if;
end $$;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_faction_swap_cancel';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_faction_swap_cancel', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2027-05-28 (lane/b-factions-open): this hero cancels its open swap, losing the swap time; the side and the week''s start stay; refuses not_member, no_swap; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) no swap: a member with no open swap is refused no_swap, a hero of no side not_member, and neither writes a row
-- (b) a member past the week starts a swap, the settle credits swap time (a fixture), the cancel clears it: the side unchanged, changed_at
--     unchanged, swap_to/swap_at null and swap_ms 0 in the row and in the envelope's factions; one swap_cancel journal row naming the side
--     it was going to and the time given up; the same key again answers the same receipt and writes no second row
-- (c) the switch off: the door refuses feature_off and the swap stays open (the switch put back as the probe found it)
-- (d) the grants: authenticated only, the baseline row, grant hygiene
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000fac7c301';
  v_n constant uuid := '000000c0-0000-4000-a000-0000fac7c302';
  k constant text := '000000c0-0000-4000-a000-0000fac7d';
  r public.hr_faction_rule%rowtype; v_a text; v_b text; v jsonb; v2 jsonb; m public.hr_faction_members%rowtype; v_scope text; v_changed timestamptz;
begin
  select * into r from public.hr_faction_rule where id;
  select faction_id into v_a from public.hr_factions order by ord limit 1;
  select faction_id into v_b from public.hr_factions order by ord offset 1 limit 1;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'factions';
  if r.id is null or v_a is null or v_b is null or v_scope is null then raise exception 'swap-cancel §4: the catalogue or the switch is not there'; end if;
  begin
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions';
    foreach v in array array[to_jsonb(v_u::text), to_jsonb(v_n::text)] loop
      insert into auth.users (id) values ((v #>> '{}')::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values ((v #>> '{}')::uuid, 'Probe Cancel') on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values ((v #>> '{}')::uuid, 'swap-cancel §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v #>> '{}', true);
      v2 := public.hr_create_character(0);
      if coalesce(v2->>'ok', '') <> 'true' then raise exception 'swap-cancel §4: hr_create_character refused: %', v2; end if;
    end loop;
    -- (a) a hero of no side, then a member with no swap
    perform set_config('request.jwt.claim.sub', v_n::text, true);
    v := public.hr_faction_swap_cancel(0, (k || '0000001')::uuid);
    if v->>'error' is distinct from 'not_member' then raise exception 'swap-cancel §4(a): a hero of no side answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(0, v_a, (k || '0000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'swap-cancel §4(a): the join answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_cancel(0, (k || '0000003')::uuid);
    if v->>'error' is distinct from 'no_swap' then raise exception 'swap-cancel §4(a): a member with no swap answered %', v; end if;
    if exists (select 1 from public.hr_faction_ledger where user_id in (v_u, v_n) and kind = 'swap_cancel') then
      raise exception 'swap-cancel §4(a): a refused cancel wrote a journal row'; end if;
    -- (b) the week passed (a fixture), the swap started, swap time credited (a fixture), cancelled
    v_changed := now() - make_interval(secs => r.cooldown_ms / 1000.0 + 60);
    update public.hr_faction_members set changed_at = v_changed where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_start(0, v_b, (k || '0000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'swap-cancel §4(b): the swap start answered %', v; end if;
    update public.hr_faction_members set swap_ms = 3600000 where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_cancel(0, (k || '0000005')::uuid);
    select * into m from public.hr_faction_members where user_id = v_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or m.faction is distinct from v_a or m.changed_at is distinct from v_changed
       or m.swap_to is not null or m.swap_at is not null or m.swap_ms <> 0 then
      raise exception 'swap-cancel §4(b): the cancel answered % and left the member %', v, to_jsonb(m); end if;
    if public.hr_state_of(v_u, 0)->'factions'->'swap' <> 'null'::jsonb or public.hr_state_of(v_u, 0)->'factions'->>'faction' is distinct from v_a then
      raise exception 'swap-cancel §4(b): the envelope reads %', public.hr_state_of(v_u, 0)->'factions'; end if;
    if (select count(*) from public.hr_faction_ledger where user_id = v_u and kind = 'swap_cancel' and faction = v_b and swap_ms = 3600000) <> 1 then
      raise exception 'swap-cancel §4(b): the cancel was not journalled once with its side and time'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v2 := public.hr_faction_swap_cancel(0, (k || '0000005')::uuid);
    if v2 is distinct from v or (select count(*) from public.hr_faction_ledger where user_id = v_u and kind = 'swap_cancel') <> 1 then
      raise exception 'swap-cancel §4(b): the same key again answered % and journalled twice', v2; end if;
    -- (c) the switch off: the door shuts, an open swap stays
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_start(0, v_b, (k || '0000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'swap-cancel §4(c): the second start answered %', v; end if;
    update public.hr_feature_switches set scope = 'off' where switch_id = 'factions';
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_cancel(0, (k || '0000007')::uuid);
    if v->>'error' is distinct from 'feature_off' or (select swap_to from public.hr_faction_members where user_id = v_u and slot = 0) is distinct from v_b then
      raise exception 'swap-cancel §4(c): with the switch off the cancel answered %', v; end if;
    raise exception using errcode = 'HRF28', message = 'swap-cancel §4 complete - rolling back';
  exception when sqlstate 'HRF28' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'factions') is distinct from v_scope then
    raise exception 'swap-cancel §4: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id in (v_u, v_n)) or exists (select 1 from public.hr_faction_members where user_id in (v_u, v_n))
     or exists (select 1 from public.hr_faction_ledger where user_id in (v_u, v_n)) or exists (select 1 from auth.users where id in (v_u, v_n)) then
    raise exception 'swap-cancel §4: a probe row leaked'; end if;
  -- (d)
  if has_function_privilege('anon', 'public.hr_faction_swap_cancel(integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_faction_swap_cancel(integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_faction_swap_cancel(integer,uuid)', 'execute') then
    raise exception 'swap-cancel §4(d): the verb is not authenticated-only'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_faction_swap_cancel' and grantee = 'authenticated'
                   and identity_args = 'p_slot integer, p_idem uuid') then
    raise exception 'swap-cancel §4(d): no client baseline row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'swap-cancel §4 OK: no swap refused, a cancel clears the swap and keeps the side and the week, journalled once, the switch door, the grants';
end $chk$;
