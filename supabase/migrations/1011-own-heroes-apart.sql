-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1011-own-heroes-apart.sql — AN ACCOUNT'S OWN HEROES END TOGETHER ONLY IF THE PLAYER SAYS SO
--   (lane/c-carry-on, systems-engineer, 2026-11-20; build plan L07, docs/design/balance-program/30-plan.md §D: "Own heroes end together
--   only if you say so"; 27-retention.md "For other dives", 21 combat: REAL, 99 of 249 hunts ended because another hero of the same
--   account left; "Leave if anyone leaves" is on by default and one hero's stamina ends four hunts).
--
-- STATUS: supabase/migration-notes/1011-own-heroes-apart.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after 1010-carry-on.sql; neither
-- needs the other). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
-- The box "Leave if anyone leaves the hunt or dies" (2026-12-18-party-leave-together.sql, Tyler 2026-10-22) keeps its one meaning and its
--   one writer (hr_party_leave_together_set). What changes is a hero whose player has NOT said: it now reads
--     on   in a party that holds another account's hero (the 10-22 default for friends, unchanged), and
--     off  in a party of the account's own heroes alone (the player's own four hunt on when one of them stops).
--   A box the player ticked or unticked is that answer everywhere, as before.
-- player_state.party_leave_together: NOT NULL DEFAULT true -> NULLABLE, no default; null = "not said". FIRST APPLY ONLY: every true (the
--   default nobody chose apart from a rare tick) becomes null, so today's heroes read the new default at once; an untick (false) stays.
--   A player who had ticked it on loses that tick (say so in the release note: CLAUDE.md §1 no back-compat; Tyler 11-07 be transparent).
-- hr_party_leave_together_of(p_user, p_slot, p_party) -> boolean   NEW, owner-only, the ONE reading of the box: its value when said,
--   else whether p_party seats a hero of another account. Read by the three places that read the box, each ONE ANCHORED SPLICE
--   (the anchor must match exactly as often as written, or the file raises; nothing else in any body moves; pins in §0):
--     hr_hunt_instance_read   each member's `leave_together`, the engine's input (combat-sim.js cascadeFrom; the engine is untouched)
--     hr_hunt_settle_session  the cascade end's proof, party_member_died and party_member_left (2 sites): the same reading the engine had
--     hr_hunt_party_view      the viewer's own box, the party panel's checkbox
--   The engine and its proof read the same function in the same settle, so they agree; a party that changes between the read and the
--   commit is refused end_not_proven and the next settle reads it again (the 2026-12-18 concurrency rule, unchanged).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The column change and its update run once (only while the column is NOT NULL). A second apply finds every body at its post pin and
--   splices nothing, restates the same helper: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- None new: no verb, grant or write path. A cascade end can still only STOP value (the proof), never mint it; nobody can end another
--   hero's hunt. Reading the party's seats is the server's own row.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- On the settle path: one inlined SQL function a member per instance read and per cascade proof, one indexed probe of the party's seats
--   (hunt_party_members by party) when the box is not said. No new statement, row or journal row.
--
-- EDGE: none (the engine reads the same key, a boolean). CLIENT: none (the party panel shows the server's box).
-- GUARDS: tests/carry-on.mjs CO-APART (the engine, browser closed: own heroes hunt on; ticked, they go home together; friends, as before);
--   tests/hunt-sessions-settle.mjs PARTY-LEAVE (re-anchored: two accounts, the 10-22 default on).
-- REVERSIBLE: re-apply the three pre-image bodies (§0 pins them), drop the helper, set the column back NOT NULL DEFAULT true after
--   update ... set party_leave_together = true where party_leave_together is null.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together')
     or to_regclass('public.hunt_party_members') is null then
    raise exception 'PRECONDITION: apply 2026-12-18-party-leave-together.sql first'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '6d18331b1ac584cc55763515039565f4', '0b3c4e82711f295c68f040eb5b684bcf'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '6e3a7682baf3d6d14c32fac1e65df663', '0960aa8565d01e4e28b8357f15634f90'),
    ('public.hr_hunt_party_view(uuid,integer)', '5f757059dc037b465c1c65a3da94ad5c', '3457eceb61842396d1ad70b287578cae')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE BOX MAY BE UNSAID ─────────────────────────────────────────────────
do $mig$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together') = 'NO' then
    alter table public.player_state alter column party_leave_together drop not null;
    alter table public.player_state alter column party_leave_together drop default;
    update public.player_state set party_leave_together = null where party_leave_together;
  end if;
end $mig$;

-- ── §2 THE ONE READING ───────────────────────────────────────────────────────
create or replace function public.hr_party_leave_together_of(p_user uuid, p_slot int, p_party uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $fn$
  -- OWN-HEROES-APART (1011-own-heroes-apart.sql): the hero's box when its player said, else on only beside another account's hero.
  select coalesce((select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
                  exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_user))
$fn$;
revoke execute on function public.hr_party_leave_together_of(uuid, int, uuid) from public, anon, authenticated, service_role;

-- ── §3 THE THREE READERS, ONE ANCHORED SPLICE EACH ───────────────────────────
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)',
     '''leave_together'', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),',
     '''leave_together'', public.hr_party_leave_together_of(h.user_id, h.slot, v_i.id),', 1),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
     'coalesce((select ps.party_leave_together from public.player_state ps' || chr(10)
       || '                                               where ps.user_id = p_user and ps.slot = p_slot), false)',
     'public.hr_party_leave_together_of(p_user, p_slot, v_s.instance_id)', 2),
    ('public.hr_hunt_party_view(uuid,integer)',
     '''leave_together'', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));',
     '''leave_together'', public.hr_party_leave_together_of(p_user, p_slot, v_pid));', 1)) t(fn, find, repl, want) loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the body already reads the helper (its post pin, §0) and the old text is gone
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;
    if v_n <> v_r.want then raise exception 'SPLICE: % holds its anchor % times, want %', v_r.fn, v_n, v_r.want; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the column is nullable with no default, and a new hero has said nothing
-- (b) the reading: unsaid beside the account's own hero alone off; unsaid beside another account's hero on; said on / off is that
--     everywhere; no party, off
-- (c) every reader reads the helper and none reads the column itself; the helper is owner-only
-- (d) the party view shows the reading: unsaid in an own party false, ticked true
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000a9a70001';
  v_b constant uuid := '000000c0-0000-4000-a000-0000a9a70002';
  k   constant text := '000000c0-0000-4000-a000-0000a9a7d';
  v jsonb; v_party uuid; v_fn text;
begin
  if (select is_nullable || ':' || coalesce(column_default, '-') from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together') is distinct from 'YES:-' then
    raise exception 'own-apart §4(a): the column is not nullable with no default'; end if;
  foreach v_fn in array array['public.hr_hunt_instance_read(uuid,integer)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
                              'public.hr_hunt_party_view(uuid,integer)'] loop
    if strpos(pg_get_functiondef(v_fn::regprocedure), 'hr_party_leave_together_of(') = 0
       or strpos(pg_get_functiondef(v_fn::regprocedure), 'select ps.party_leave_together') > 0 then
      raise exception 'own-apart §4(c): % does not read the box through the helper', v_fn; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.hr_party_leave_together_of(uuid,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_party_leave_together_of(uuid,integer,uuid)', 'execute') then
    raise exception 'own-apart §4(c): the helper is reachable by a client role'; end if;
  begin
    foreach v_fn in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_fn::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_fn::uuid, 'Probe Apart') on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_fn::uuid, 'own-apart §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_fn, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4: hr_create_character refused: %', v; end if;
    end loop;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4: the second hero refused: %', v; end if;
    -- (a) a new hero has said nothing
    if exists (select 1 from public.player_state where user_id in (v_a, v_b) and party_leave_together is not null) then
      raise exception 'own-apart §4(a): a new hero''s box is said'; end if;
    -- (b) no party: off
    if public.hr_party_leave_together_of(v_a, 0, null) then raise exception 'own-apart §4(b): a hero in no party reads on'; end if;
    -- an own party of two
    v := public.hr_hunt_party_invite_own(0, 1, (k || '001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4(b): the own invite answered %', v; end if;
    v_party := public.hr_hunt_party_of(v_a, 0);
    if public.hr_party_leave_together_of(v_a, 0, v_party) or public.hr_party_leave_together_of(v_a, 1, v_party) then
      raise exception 'own-apart §4(b): an own party reads on unsaid'; end if;
    -- (d) the party panel shows it
    if (public.hr_hunt_party_view(v_a, 0)->>'leave_together') is distinct from 'false' then
      raise exception 'own-apart §4(d): the own party''s panel reads %', public.hr_hunt_party_view(v_a, 0)->'leave_together'; end if;
    -- another account's hero in the seats: on, unsaid
    insert into public.hunt_party_members (party_id, user_id, slot, seat) values (v_party, v_b, 0, 3);
    if not public.hr_party_leave_together_of(v_a, 0, v_party) or not public.hr_party_leave_together_of(v_b, 0, v_party) then
      raise exception 'own-apart §4(b): a party with a friend reads off unsaid'; end if;
    -- said: that everywhere
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_party_leave_together_set(0, false, (k || '002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_party_leave_together_of(v_a, 0, v_party) then
      raise exception 'own-apart §4(b): an untick beside a friend reads on (%)', v; end if;
    delete from public.hunt_party_members where party_id = v_party and user_id = v_b;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_party_leave_together_set(1, true, (k || '003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or not public.hr_party_leave_together_of(v_a, 1, v_party) then
      raise exception 'own-apart §4(b): a tick in an own party reads off (%)', v; end if;
    if (public.hr_hunt_party_view(v_a, 1)->>'leave_together') is distinct from 'true' then
      raise exception 'own-apart §4(d): the ticked hero''s panel reads %', public.hr_hunt_party_view(v_a, 1)->'leave_together'; end if;
    raise exception using errcode = 'HRA11', message = 'own-apart §4 complete - rolling back';
  exception when sqlstate 'HRA11' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'own-apart §4: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'own-apart §4 OK: the box may be unsaid, own heroes read off and friends on unsaid, a said box is itself everywhere, the three readers read it once';
end $chk$;
