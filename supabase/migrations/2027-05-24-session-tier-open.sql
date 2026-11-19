-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-24-session-tier-open.sql — A HUNT SESSION NAMES ITS TIER FROM THE MOMENT IT OPENS (lane/c-session-tier-null, backend-architect,
-- 2026-11-19; board "2026-11-19 Balance audit (real hunts)" fix 9).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Game CLOSED: applies
-- on its passing §4 and §5. Not on the money list: one display/analytics column, no value moves, no grant, no client verb.
-- EDGE: none (the engine never reads hunt_sessions.tier: it plays hunt_instances.tier through hr_hunt_instance_read `options.tier`, as
-- before). CLIENT: none needed (hr_hunt_view already carries `tier`; it now reads the tier while the hunt is open too, which the
-- client's only readers, the ended-hunt card and tutorial-sections tierTakenOf, already accept).
--
-- ── WHAT THE AUDIT SAW, AND WHAT IT WAS (MEASURED on production 2026-11-19 03:30 UTC, read-only) ─────────────────────────────────────
-- The export read `hunt_sessions.tier` null on 25 of 163 sessions in 14 days and took them for continued hunts. They are not:
--   · NO ROW HAS EVER BEEN CONTINUED. prev_session_id is set on 0 of all 339 sessions. Its only writer is hr_hunt_swap (a pending
--     hr_hunt_change landing at a settle), a verb no client sends today, and a party can't take it (party_hunt).
--   · 4 of the 25 were OPEN: the Krell's Hold Deadly four entered 2026-11-18 23:59 UTC, still hunting. 2027-03-16-ended-hunt-tier.sql
--     stamps the column only as a session ENDS (its contract: "null while open, hunt_tier.playing says it then"), so every open row
--     reads null to anything that reads the table rather than the section. That is the export's blind spot, and the root cause here.
--   · 21 ended 2026-11-05 05:41 to 2026-11-06 04:32 UTC, before that stamp was applied (2026-11-06 17:12 UTC). 0 sessions have ended
--     with a null tier since. 197 such rows exist in all, display-only history the EA wipe deletes; this file leaves them null (below).
-- WHAT THE ENGINE PLAYED: never this column. hr_hunt_instance_read overlays coalesce(hunt_instances.tier, 'normal') on every member.
-- The open Krell's Hold four's instance froze 'deadly', so it plays Deadly (no Deadly hunt ever ran on Normal). Of the 21 pre-stamp rows,
-- 18 sit on instances whose tier is null (frozen before 2027-02-27-hunt-tiers.sql, never restarted since) and played Normal by that
-- coalesce; 3 sit on instances that now read dangerous/normal.
--
-- ── WHAT ────────────────────────────────────────────────────────────────────
-- ONE RULE, BOTH STAMPS: a session's tier is what the engine plays it at, coalesce(its instance's tier, 'normal'). The instance freezes
-- its tier once, at its first session's insert (hr_hunt_density_freeze, AFTER INSERT); it can't re-freeze while a session on it is open
-- (a party restart needs no open session on it, 2027-02-10-party-instance-reset.sql), so the value read at the open and at the end agree.
-- §1 hr_hunt_tier_open() + trigger hr_hunt_tier_open NEW, AFTER INSERT ON hunt_sessions FOR EACH ROW: writes the new row's tier once.
--    AFTER, not BEFORE: on a fresh instance (a solo start, a change of ground, a party's restart) the tier does not exist until
--    hr_hunt_density_freeze writes it; AFTER-row triggers fire in name order and 'hr_hunt_density_freeze' < 'hr_hunt_tier_open', so the
--    stamp reads the frozen value (§4(g) asserts the order). A seat joining a frozen instance (a party's 2nd-4th member) reads it as is.
--    Every insert path (hr_hunt_open_session today: a start, a party seat, a change of ground, the yard, the Tower, a hall, a call) is
--    covered without restating any of them.
-- §2 hr_hunt_tier_stamp RESTATED (2027-03-16's image, md5-pinned): the end stamp reads the same rule (coalesce ... 'normal'), so an
--    instance that never froze a tier ends Normal, as it played, never null after an open that said Normal.
-- §3 the column's comment says the new contract. §4 the self-check (probes, rolled back).
-- §5 BACKFILL, OPEN ROWS ONLY, tier column only: each open session gets its instance's tier by the same rule (true by construction: its
--    instance can't move while it is open). ENDED rows are NOT backfilled: none is a continued row (no prev_session_id chain exists),
--    the instance of an ended row may have re-frozen since (a party's next start), and the 197 pre-stamp rows are history the EA wipe
--    deletes (CLAUDE.md §2: no protections for data the wipe deletes). They stay null: "ended before the stamp existed".
--
-- COST: one primary-key UPDATE of the new row per session opened (≈11 opens a day on live today, ≈1,100 at 100x), no new row or index;
-- the end stamp's cost is unchanged. hunt_sessions is in no publication.
-- EXPLOIT SURFACE: none added. The trigger function is SECURITY DEFINER, revoked from every client role, and writes only the tier of the
-- row being inserted, from the server's own instance row; no client value reaches it.
-- REVERSIBILITY: drop trigger hr_hunt_tier_open on public.hunt_sessions; drop function public.hr_hunt_tier_open(); restate
-- hr_hunt_tier_stamp from 2027-03-16-ended-hunt-tier.sql §2 by hand (§0's pin accepts only the two images). The backfilled open rows are
-- re-stamped by the same value as they end, so nothing needs undoing. No player value.
-- ORDER: after 2027-03-16-ended-hunt-tier.sql and 2027-02-27-hunt-tiers.sql (both APPLIED); shares no object with any STAGED file of
-- set/v0.2.141 (none restates hr_hunt_tier_stamp, hr_hunt_density_freeze or a hunt_sessions trigger), so it commutes with them. No
-- begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- hr_hunt_tier_stamp's image this file was written against (production's, measured 2026-11-19 = tests/live-hash-drift.baseline.json), or
-- this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_md5 text;
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.hunt_sessions'::regclass and attname = 'tier' and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = 'public.hunt_instances'::regclass and attname = 'tier' and not attisdropped) then
    raise exception 'PRECONDITION: apply 2027-02-27-hunt-tiers.sql and 2027-03-16-ended-hunt-tier.sql first (hunt_instances.tier, hunt_sessions.tier)'; end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_density_freeze' and not t.tgisinternal
                 and pg_get_triggerdef(t.oid) like 'CREATE TRIGGER hr_hunt_density_freeze AFTER INSERT ON public.hunt_sessions FOR EACH ROW %') then
    raise exception 'PRECONDITION: the instance''s tier freeze (hr_hunt_density_freeze, AFTER INSERT ON hunt_sessions FOR EACH ROW) is missing or moved'; end if;
  if to_regprocedure('public.hr_hunt_tier_stamp()') is null then
    raise exception 'PRECONDITION: apply 2027-03-16-ended-hunt-tier.sql first (hr_hunt_tier_stamp)'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_tier_stamp()'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '7325b2ea4adf30e40eb6d365f30e8d2b' and v_md5 is distinct from 'e8d261ec54323c1868ee7fd5dcf030ca' then
    raise exception 'PIN: hr_hunt_tier_stamp() is neither its live pre-image (7325b2ea) nor this file''s image (e8d261ec): md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE OPEN STAMP ────────────────────────────────────────────────────────
create or replace function public.hr_hunt_tier_open()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- OPEN-TIER (2027-05-24-session-tier-open.sql): the row names the tier the engine plays it at (hr_hunt_instance_read: coalesce(the
  -- instance's tier, 'normal')) from the moment it opens. This fires after hr_hunt_density_freeze (name order), so a fresh instance's
  -- tier is already frozen; the instance can't re-freeze while this session is open, so the end stamp (hr_hunt_tier_stamp) agrees.
  update public.hunt_sessions s
     set tier = coalesce((select i.tier from public.hunt_instances i where i.id = new.instance_id), 'normal')
   where s.id = new.id
     and s.tier is distinct from coalesce((select i.tier from public.hunt_instances i where i.id = new.instance_id), 'normal');
  return null;
end $$;
revoke execute on function public.hr_hunt_tier_open() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_tier_open on public.hunt_sessions;
create trigger hr_hunt_tier_open after insert on public.hunt_sessions
  for each row execute function public.hr_hunt_tier_open();

-- ── §2 THE END STAMP, THE SAME RULE ──────────────────────────────────────────
create or replace function public.hr_hunt_tier_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- ENDED-TIER (2027-03-16-ended-hunt-tier.sql): the instance's frozen tier is this session's while it is open; it is kept as it ends.
  -- OPEN-TIER (2027-05-24-session-tier-open.sql): the rule the engine plays by, coalesce(..., 'normal'), the same value the open stamp wrote.
  new.tier := coalesce((select i.tier from public.hunt_instances i where i.id = new.instance_id), 'normal');
  return new;
end $$;
revoke execute on function public.hr_hunt_tier_stamp() from public, anon, authenticated, service_role;

-- ── §3 THE CONTRACT ──────────────────────────────────────────────────────────
comment on column public.hunt_sessions.tier is
  '2027-05-24-session-tier-open.sql: the tier this session runs at, the rule the engine plays by (coalesce(its instance''s tier, ''normal'')), stamped as it opens (hr_hunt_tier_open) and again as it ends (hr_hunt_tier_stamp, 2027-03-16). Null only on sessions that ended before 2026-11-06 17:12 UTC (the end stamp''s apply). Display and analytics only: the engine reads hunt_instances.tier.';

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-00005e240001';
  v_o      constant uuid := '000000c0-0000-4000-a000-00005e240002';
  c_plain  constant text := 'mill_cellar';
  c_glade  constant text := 'mosslight_glade';
  c_next   constant text := 'meadowbrook_thicket';
  v        jsonb;
  v_sid    uuid;
  v_new    uuid;
  v_iid    uuid;
  v_seat   uuid;
  v_s      public.hunt_sessions%rowtype;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (v_u), (v_o) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'session-tier-open §4 probe'), (v_o, 'session-tier-open §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_o::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-tier-open §4: the second probe''s hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-tier-open §4: hr_create_character refused: %', v; end if;

    -- (a) A FRESH NORMAL START STAYS NORMAL: a ground with no tier on offer reads Normal from the open, in the row and the view, and ends Normal.
    v_sid := public.hr_hunt_new_session(v_u, 0, c_plain, null, 0, null);
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'normal' or public.hr_hunt_view(v_sid)->>'tier' is distinct from 'normal' then
      raise exception 'session-tier-open §4(a): a fresh Normal start opens at % (view %)', (select tier from public.hunt_sessions where id = v_sid), public.hr_hunt_view(v_sid)->'tier'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'normal' then
      raise exception 'session-tier-open §4(a): the Normal start ended at %', (select tier from public.hunt_sessions where id = v_sid); end if;

    -- (b) A PICKED TIER, OPEN: the row reads the tier its instance froze, which is what the engine reads (hr_hunt_instance_read options.tier).
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_tier_set(0, c_glade, 'dangerous', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-tier-open §4(b): the Glade pick answered %', v; end if;
    v_sid := public.hr_hunt_new_session(v_u, 0, c_glade, null, 0, null);
    select * into v_s from public.hunt_sessions where id = v_sid;
    v_iid := v_s.instance_id;
    if v_s.tier is distinct from 'dangerous' or (select tier from public.hunt_instances where id = v_iid) is distinct from 'dangerous'
       or public.hr_hunt_view(v_sid)->>'tier' is distinct from 'dangerous' then
      raise exception 'session-tier-open §4(b): an open Dangerous hunt reads row %, instance %, view %', v_s.tier,
        (select tier from public.hunt_instances where id = v_iid), public.hr_hunt_view(v_sid)->'tier'; end if;
    if public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->>'tier' is distinct from v_s.tier then
      raise exception 'session-tier-open §4(b): the row says % and the engine reads %', v_s.tier,
        public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->'tier'; end if;

    -- (c) A SEAT ON A FROZEN INSTANCE (a party's 2nd-4th member: the freeze returns early): it reads the instance's tier from its open.
    v_seat := public.hr_hunt_open_session(v_o, 0, c_glade, null, 0, null, v_iid, v_s.hunt_from, 1);
    if (select tier from public.hunt_sessions where id = v_seat) is distinct from 'dangerous' then
      raise exception 'session-tier-open §4(c): a seat on the frozen instance opens at %', (select tier from public.hunt_sessions where id = v_seat); end if;
    perform public.hr_hunt_close(v_seat, 'left', now(), true);

    -- (d) A CONTINUED SESSION (a change of ground landing at a settle, hr_hunt_swap): the new row names ITS OWN instance's tier from the open,
    -- the pick on the ground it moved to (picks are per ground), never null; the row it continued ends keeping the tier it ran at.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_tier_set(0, c_next, 'deadly', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-tier-open §4(d): the Thicket pick answered %', v; end if;
    update public.hunt_sessions set change_to = c_next, change_at = now() where id = v_sid;
    v_new := public.hr_hunt_swap(v_sid, now());
    if v_new is null then raise exception 'session-tier-open §4(d): hr_hunt_swap opened nothing'; end if;
    select * into v_s from public.hunt_sessions where id = v_new;
    if v_s.prev_session_id is distinct from v_sid or v_s.ended_at is not null or v_s.tier is distinct from 'deadly'
       or v_s.tier is distinct from (select tier from public.hunt_instances where id = v_s.instance_id) then
      raise exception 'session-tier-open §4(d): the continued row (prev %, open %) reads % on an instance of %', v_s.prev_session_id, v_s.ended_at is null,
        v_s.tier, (select tier from public.hunt_instances where id = v_s.instance_id); end if;
    if public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->>'tier' is distinct from 'deadly' then
      raise exception 'session-tier-open §4(d): the engine reads % on the continued hunt', public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->'tier'; end if;
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'dangerous' or (select end_reason from public.hunt_sessions where id = v_sid) is distinct from 'changed' then
      raise exception 'session-tier-open §4(d): the session it continued ended % at %', (select end_reason from public.hunt_sessions where id = v_sid), (select tier from public.hunt_sessions where id = v_sid); end if;

    -- (e) THE END AGREES WITH THE OPEN, AND A LATER WRITE KEEPS IT
    perform public.hr_hunt_close(v_new, 'left', now(), true);
    if (select tier from public.hunt_sessions where id = v_new) is distinct from 'deadly' then
      raise exception 'session-tier-open §4(e): the continued hunt ended at %', (select tier from public.hunt_sessions where id = v_new); end if;
    update public.hunt_sessions set ended_at = ended_at where id = v_new;
    if (select tier from public.hunt_sessions where id = v_new) is distinct from 'deadly' then raise exception 'session-tier-open §4(e): a later write restamped the ended row'; end if;

    -- (f) AN INSTANCE THAT NEVER FROZE A TIER (one frozen before 2027-02-27) plays Normal, so its row opens and ends Normal, never null.
    v_sid := public.hr_hunt_new_session(v_u, 0, c_plain, null, 0, null);
    update public.hunt_instances set tier = null where id = (select instance_id from public.hunt_sessions where id = v_sid);
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'normal' then
      raise exception 'session-tier-open §4(f): a session on an unfrozen instance ended at %', (select tier from public.hunt_sessions where id = v_sid); end if;

    raise exception using errcode = 'HR524', message = 'session-tier-open §4 complete - rolling back';
  exception when sqlstate 'HR524' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_u, v_o)) or exists (select 1 from auth.users where id in (v_u, v_o)) then
    raise exception 'session-tier-open §4: LEAKED a probe row'; end if;
  -- (g) THE ORDER AND THE GRANTS: the open stamp fires after the freeze, on every insert; no client reaches either stamp.
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_tier_open' and t.tgenabled = 'O'
                 and pg_get_triggerdef(t.oid) = 'CREATE TRIGGER hr_hunt_tier_open AFTER INSERT ON public.hunt_sessions FOR EACH ROW EXECUTE FUNCTION hr_hunt_tier_open()') then
    raise exception 'session-tier-open §4(g): the open stamp''s trigger is missing or moved: %',
      (select pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_tier_open'); end if;
  if not ('hr_hunt_density_freeze' collate "C" < 'hr_hunt_tier_open' collate "C") then
    raise exception 'session-tier-open §4(g): the open stamp would fire before the freeze'; end if;
  if has_function_privilege('authenticated', 'public.hr_hunt_tier_open()', 'execute') or has_function_privilege('anon', 'public.hr_hunt_tier_open()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_tier_stamp()', 'execute') or has_function_privilege('anon', 'public.hr_hunt_tier_stamp()', 'execute') then
    raise exception 'session-tier-open §4(g): a client reaches a tier stamp'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'session-tier-open: a session names its tier from the open (fresh Normal, a pick, a frozen seat, a change of ground), the end agrees; all green';
end $chk$;

-- ── §5 BACKFILL, OPEN SESSIONS ONLY, THE TIER COLUMN ONLY ─────────────────────
-- Last, so the rows it touches are locked only until the commit just after it. The same rule as both stamps; an open session's instance
-- can't move while it is open, so this is the value its end stamp will write.
update public.hunt_sessions s
   set tier = coalesce((select i.tier from public.hunt_instances i where i.id = s.instance_id), 'normal')
 where s.ended_at is null
   and s.tier is distinct from coalesce((select i.tier from public.hunt_instances i where i.id = s.instance_id), 'normal');

do $verify$
begin
  if exists (select 1 from public.hunt_sessions s where s.ended_at is null
               and s.tier is distinct from coalesce((select i.tier from public.hunt_instances i where i.id = s.instance_id), 'normal')) then
    raise exception 'session-tier-open §5: an open session still reads a tier its instance does not play'; end if;
  raise notice 'session-tier-open §5: every open session names the tier it plays';
end $verify$;
